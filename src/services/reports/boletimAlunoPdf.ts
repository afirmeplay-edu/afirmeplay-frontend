import { jsPDF } from 'jspdf';
import {
  loadDefaultReportLogoAsset,
  type PdfImageAsset,
} from '@/utils/pdfCityBranding';
import { formatDecimal1PtBr, formatPercent1PtBr } from '@/utils/numberFormat';
import { getBoletimMarkStatus, questionAlternativeLetters, resolveDisciplinaCards } from '@/utils/reports/boletimAlunoHelpers';
import type {
  BoletimAlunoCards,
  BoletimAlunoItem,
  BoletimAlunoPorDisciplina,
  BoletimAlunoQuestao,
  BoletimAlunoReportFlow,
} from '@/types/boletim-aluno';

const C = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  border: [209, 213, 219] as [number, number, number],
  bgHeader: [243, 244, 246] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
};

const PAGE_W = 297;
const PAGE_H = 210;

/** Máximo de colunas de questão por tabela horizontal. */
const DEFAULT_MAX_PER_ROW = 50;
/** Largura mínima legível de cada coluna de questão (mm). */
const MIN_QUEST_COL_W = 4.5;

type PdfScale = {
  margin: number;
  rowH: number;
  labelColW: number;
  colWQuest: number;
  circleR: number;
  bannerH: number;
  colHeaderH: number;
  logoW: number;
  logoMaxH: number;
  startY: number;
  titleFont: number;
  titleGap: number;
  metaFont: number;
  metaLineH: number;
  tableTitleFont: number;
  tableFont: number;
  cardH: number;
  cardTitleFont: number;
  cardValueFont: number;
  gap: number;
  footerReserve: number;
  maxPerRow: number;
};

export type BoletimAlunoPdfLabels = {
  estado: string;
  municipio: string;
  avaliacao: string;
  escola?: string;
  serie?: string;
  turma?: string;
  aluno?: string;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function fmtNow(): string {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const n = Math.max(1, size);
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/**
 * Divide questões em partes horizontais (máx. `maxPerRow` colunas).
 * Partes de tamanho ~igual, sempre empilhadas verticalmente.
 */
function splitDisciplinaIntoRowChunks(
  questoes: BoletimAlunoQuestao[],
  maxPerRow = DEFAULT_MAX_PER_ROW
): BoletimAlunoQuestao[][] {
  if (!questoes.length) return [];
  const cap = Math.max(1, maxPerRow);
  if (questoes.length <= cap) return [questoes];
  const parts = Math.ceil(questoes.length / cap);
  const chunkSize = Math.ceil(questoes.length / parts);
  return chunk(questoes, chunkSize);
}

function totalQuestoes(item: BoletimAlunoItem): number {
  return (item.por_disciplina ?? []).reduce((sum, b) => sum + (b.questoes?.length ?? 0), 0);
}

function metaLines(
  item: BoletimAlunoItem,
  avaliacaoNome: string,
  labels: BoletimAlunoPdfLabels
): Array<[string, string]> {
  const lines: Array<[string, string]> = [
    ['AVALIAÇÃO', avaliacaoNome || labels.avaliacao],
    ['ESCOLA', item.aluno.escola || labels.escola || '—'],
    [
      'SÉRIE / TURMA',
      [item.aluno.serie || labels.serie, item.aluno.turma || labels.turma]
        .filter(Boolean)
        .join('  |  ') || '—',
    ],
    ['ALUNO', item.aluno.nome],
  ];
  if (item.aluno.matricula) lines.push(['MATRÍCULA', item.aluno.matricula]);
  return lines;
}

function usableWidth(s: PdfScale): number {
  return PAGE_W - s.margin * 2;
}

/**
 * Fontes +1–2pt vs. escala anterior; rowH/banner/gaps maiores para o layout
 * horizontal (poucas linhas por tabela → mais respiro vertical).
 */
function baseScale(totalQ: number): PdfScale {
  const t = clamp((totalQ - 24) / 28, 0, 1);
  return {
    margin: 13,
    rowH: lerp(7.2, 5.4, t),
    labelColW: lerp(12, 10, t),
    colWQuest: lerp(6.5, 4.8, t),
    circleR: lerp(1.85, 1.35, t),
    bannerH: lerp(7.2, 6, t),
    colHeaderH: lerp(7, 5.8, t),
    logoW: lerp(34, 25, t),
    logoMaxH: lerp(15, 10.5, t),
    startY: lerp(8, 4.2, t),
    titleFont: lerp(13.5, 11, t),
    titleGap: lerp(5, 3.8, t),
    metaFont: lerp(9.5, 7.8, t),
    metaLineH: lerp(4.8, 3.7, t),
    tableTitleFont: lerp(8.5, 7.2, t),
    tableFont: lerp(8.5, 7.1, t),
    cardH: lerp(20, 15, t),
    // Fontes dos resultados fixas (= metaFont com 52 questões: 7.8pt).
    cardTitleFont: 7.8,
    cardValueFont: 7.8,
    gap: lerp(5.5, 4, t),
    footerReserve: 13,
    maxPerRow: DEFAULT_MAX_PER_ROW,
  };
}

function logoDrawSize(logo: PdfImageAsset | null, s: PdfScale): { w: number; h: number } {
  if (!logo?.dataUrl) return { w: 0, h: 0 };
  if (logo.iw <= 0 || logo.ih <= 0) {
    console.warn('[boletimAluno] logo carregada sem dimensões válidas (iw/ih <= 0):', logo);
    return { w: s.logoW, h: Math.min(s.logoMaxH, s.logoW * 0.45) };
  }
  let w = s.logoW;
  let h = (logo.ih * w) / logo.iw;
  if (h > s.logoMaxH) {
    h = s.logoMaxH;
    w = (logo.iw * h) / logo.ih;
  }
  return { w, h };
}

function headerHeight(s: PdfScale, logo: PdfImageAsset | null, nMeta: number): number {
  const { h } = logoDrawSize(logo, s);
  const titleBand = Math.max(h > 0 ? h : 0, s.titleFont * 0.45, 4);
  return s.startY + titleBand + s.titleGap + nMeta * s.metaLineH + 2.4;
}

/** Largura de cada coluna de questão na tabela (largura útil restante / n cols). */
function questionColWidth(nQuestoes: number, s: PdfScale): number {
  const n = Math.max(1, Math.min(nQuestoes, s.maxPerRow));
  const avail = Math.max(1, usableWidth(s) - s.labelColW);
  return avail / n;
}

/**
 * Altura de uma tabela horizontal: banner + cabeçalho "Questão" +
 * uma linha por letra + linha GAB.
 */
function horizontalTableHeight(nLetters: number, s: PdfScale): number {
  const letterRows = Math.max(nLetters, 1);
  return s.bannerH + s.colHeaderH + (letterRows + 1) * s.rowH;
}

/** Quantidade de tabelas horizontais necessárias para `nQuestoes`. */
function chunkCountForQuestoes(nQuestoes: number, maxPerRow: number): number {
  if (nQuestoes <= 0) return 0;
  const cap = Math.max(1, maxPerRow);
  if (nQuestoes <= cap) return 1;
  return Math.ceil(nQuestoes / cap);
}

/** Altura total de uma disciplina (1+ tabelas empilhadas). */
function disciplineBlockHeight(
  nQuestoes: number,
  nLetters: number,
  s: PdfScale
): number {
  if (nQuestoes <= 0) return s.bannerH + 8;
  const nChunks = chunkCountForQuestoes(nQuestoes, s.maxPerRow);
  const tableH = horizontalTableHeight(nLetters, s);
  const stackGap = Math.min(3, s.gap * 0.45);
  return nChunks * tableH + Math.max(0, nChunks - 1) * stackGap;
}

function measureTablesHeight(blocos: BoletimAlunoPorDisciplina[], s: PdfScale): number {
  let h = 0;
  blocos.forEach((b, idx) => {
    const nQ = b.questoes?.length ?? 0;
    const nL = questionAlternativeLetters(b.questoes).length;
    h += disciplineBlockHeight(nQ, nL, s);
    if (idx < blocos.length - 1) h += s.gap;
  });
  return h;
}

/** Maior nº de colunas de questão em qualquer chunk após o split. */
function maxChunkLen(nQuestoes: number, maxPerRow: number): number {
  if (nQuestoes <= 0) return 0;
  const cap = Math.max(1, maxPerRow);
  if (nQuestoes <= cap) return nQuestoes;
  const parts = Math.ceil(nQuestoes / cap);
  return Math.ceil(nQuestoes / parts);
}

/** Reduz maxPerRow até que a coluna de questão fique >= MIN_QUEST_COL_W. */
function adaptMaxPerRow(blocos: BoletimAlunoPorDisciplina[], s: PdfScale): void {
  const largestChunk = (): number =>
    blocos.reduce((max, b) => Math.max(max, maxChunkLen(b.questoes?.length ?? 0, s.maxPerRow)), 0);

  let maxQInChunk = largestChunk();
  if (maxQInChunk <= 0) return;

  while (s.maxPerRow > 8) {
    const w = questionColWidth(maxQInChunk, s);
    if (w >= MIN_QUEST_COL_W) break;
    s.maxPerRow = Math.max(8, s.maxPerRow - 2);
    maxQInChunk = largestChunk();
  }
  s.colWQuest = questionColWidth(Math.max(1, maxQInChunk), s);
}

function fitScale(
  item: BoletimAlunoItem,
  logo: PdfImageAsset | null,
  nMeta: number
): PdfScale {
  const s = baseScale(totalQuestoes(item));
  const blocos = item.por_disciplina ?? [];

  adaptMaxPerRow(blocos, s);

  for (let i = 0; i < 14; i++) {
    const head = headerHeight(s, logo, nMeta);
    const resultsH = resultsColumnsHeight(item, s);
    const avail = PAGE_H - head - resultsH - 8 - s.footerReserve;
    const tablesH = measureTablesHeight(blocos, s);
    if (tablesH <= avail) break;

    s.rowH = Math.max(4.2, s.rowH * 0.93);
    s.labelColW = Math.max(9, s.labelColW * 0.98);
    s.circleR = Math.max(1.1, s.circleR * 0.96);
    s.bannerH = Math.max(5, s.bannerH * 0.98);
    s.colHeaderH = Math.max(5, s.colHeaderH * 0.98);
    s.tableFont = Math.max(6.2, s.tableFont * 0.98);
    s.tableTitleFont = Math.max(6.2, s.tableTitleFont * 0.98);
    s.logoMaxH = Math.max(6.2, s.logoMaxH * 0.96);
    s.startY = Math.max(3.6, s.startY * 0.97);
    s.metaLineH = Math.max(3.2, s.metaLineH * 0.97);
    s.cardH = Math.max(13, s.cardH * 0.98);
    s.gap = Math.max(3.2, s.gap * 0.97);

    if (i >= 4 && i % 2 === 0 && s.maxPerRow > 12) {
      s.maxPerRow = Math.max(12, s.maxPerRow - 4);
    }
    adaptMaxPerRow(blocos, s);
  }
  return s;
}

function addFooters(doc: jsPDF, dataGeracao: string, margin: number): void {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.25);
    doc.line(margin, pageH - 9, pageW - margin, pageH - 9);
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textGray);
    doc.setFont('helvetica', 'normal');
    doc.text('AfirmePlay: Sistema de Ensino e Avaliação', margin, pageH - 5.5);
    doc.text(`Página ${i} de ${n}`, pageW / 2, pageH - 5.5, { align: 'center' });
    doc.text(`Gerado em ${dataGeracao}`, pageW - margin, pageH - 5.5, { align: 'right' });
  }
}

function ensureSpace(doc: jsPDF, y: number, needed: number, s: PdfScale): number {
  if (y + needed <= PAGE_H - s.footerReserve) return y;
  doc.addPage();
  return 12;
}

function drawCircle(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  status: 'correct' | 'wrong' | 'empty'
): void {
  if (status === 'correct') {
    doc.setFillColor(...C.green);
    doc.setDrawColor(...C.green);
    doc.circle(cx, cy, r, 'FD');
  } else if (status === 'wrong') {
    doc.setFillColor(...C.red);
    doc.setDrawColor(...C.red);
    doc.circle(cx, cy, r, 'FD');
  } else {
    doc.setDrawColor(...C.border);
    doc.setFillColor(...C.white);
    doc.circle(cx, cy, r, 'FD');
  }
}

/**
 * Tabela horizontal: questões em colunas; linhas = Questão | A..E | GAB.
 * Ocupa a largura útil da página.
 */
function drawDisciplineTableHorizontal(
  doc: jsPDF,
  x: number,
  y: number,
  title: string,
  questoes: BoletimAlunoQuestao[],
  letters: string[],
  s: PdfScale
): number {
  const nQ = Math.max(1, questoes.length);
  const questW = Math.max(MIN_QUEST_COL_W * 0.85, questionColWidth(nQ, s));
  const labelW = s.labelColW;
  const w = labelW + nQ * questW;
  const r = Math.min(s.circleR, questW / 2 - 0.45, s.rowH / 2 - 0.5);

  // Banner roxo com nome da disciplina
  doc.setFillColor(...C.primary);
  doc.roundedRect(x, y, w, s.bannerH, 0.5, 0.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(s.tableTitleFont);
  doc.setTextColor(...C.white);
  const titleText = doc.splitTextToSize(title.toUpperCase(), w - 2.4) as string[];
  doc.text(titleText[0] || title, x + w / 2, y + s.bannerH * 0.68, { align: 'center' });

  let cy = y + s.bannerH;

  // Linha de cabeçalho: "Questão" | 1 | 2 | 3 | ...
  doc.setFillColor(...C.bgHeader);
  doc.rect(x, cy, w, s.colHeaderH, 'F');
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.18);
  doc.rect(x, cy, w, s.colHeaderH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(Math.max(6.2, s.tableFont - 0.3));
  doc.setTextColor(...C.textDark);
  doc.text('Questão', x + labelW / 2, cy + s.colHeaderH * 0.68, { align: 'center' });

  for (let i = 0; i < questoes.length; i++) {
    const qx = x + labelW + i * questW;
    doc.text(String(questoes[i].numero), qx + questW / 2, cy + s.colHeaderH * 0.68, {
      align: 'center',
    });
  }
  cy += s.colHeaderH;

  // Linhas de alternativa (A, B, C, D, E...)
  for (const letter of letters) {
    doc.setDrawColor(...C.border);
    doc.setFillColor(...C.white);
    doc.rect(x, cy, w, s.rowH, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(s.tableFont);
    doc.setTextColor(...C.textDark);
    doc.text(letter, x + labelW / 2, cy + s.rowH / 2 + 0.95, { align: 'center' });

    for (let i = 0; i < questoes.length; i++) {
      const qx = x + labelW + i * questW;
      const status = getBoletimMarkStatus(questoes[i], letter);
      drawCircle(doc, qx + questW / 2, cy + s.rowH / 2, r, status);
    }
    cy += s.rowH;
  }

  // Linha GAB
  doc.setDrawColor(...C.border);
  doc.setFillColor(...C.white);
  doc.rect(x, cy, w, s.rowH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(s.tableFont);
  doc.setTextColor(...C.textDark);
  doc.text('GAB', x + labelW / 2, cy + s.rowH / 2 + 0.95, { align: 'center' });

  for (let i = 0; i < questoes.length; i++) {
    const qx = x + labelW + i * questW;
    const padX = Math.min(0.55, questW * 0.12);
    const padY = Math.min(0.9, s.rowH * 0.16);
    const pillW = Math.max(2.8, questW - padX * 2);
    const pillH = Math.max(2.6, s.rowH - padY * 2);
    doc.setFillColor(...C.green);
    doc.roundedRect(qx + (questW - pillW) / 2, cy + padY, pillW, pillH, 0.4, 0.4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Math.min(s.tableFont, Math.max(5.5, questW * 1.1)));
    doc.setTextColor(...C.white);
    doc.text(
      String(questoes[i].gabarito || '—').toUpperCase(),
      qx + questW / 2,
      cy + s.rowH / 2 + 0.9,
      { align: 'center' }
    );
  }
  cy += s.rowH;

  return cy;
}

function drawDisciplineBlock(
  doc: jsPDF,
  x: number,
  y: number,
  bloco: BoletimAlunoPorDisciplina,
  s: PdfScale
): number {
  const questoes = bloco.questoes ?? [];
  const letters = questionAlternativeLetters(questoes);
  if (!questoes.length) {
    doc.setFontSize(s.tableFont);
    doc.setTextColor(...C.textGray);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nenhuma questão em ${bloco.disciplina}.`, x, y + 5);
    return y + 10;
  }

  const chunks = splitDisciplinaIntoRowChunks(questoes, s.maxPerRow);
  const stackGap = Math.min(3, s.gap * 0.45);
  let cy = y;

  chunks.forEach((part, idx) => {
    cy = drawDisciplineTableHorizontal(doc, x, cy, bloco.disciplina, part, letters, s);
    if (idx < chunks.length - 1) cy += stackGap;
  });

  return cy;
}

type ResultColumn = { title: string; cards: BoletimAlunoCards };

function metricItems(cards: BoletimAlunoCards): Array<{ title: string; value: string; sub: string }> {
  return [
    {
      title: 'ACERTOS',
      value: `${cards.acertos_totais.acertou} / ${cards.acertos_totais.total}`,
      sub: formatPercent1PtBr(cards.acertos_totais.percentual),
    },
    { title: 'NOTA', value: formatDecimal1PtBr(cards.nota, '—'), sub: '' },
    { title: 'PROFICIÊNCIA', value: formatDecimal1PtBr(cards.proficiencia, '—'), sub: '' },
    { title: 'NÍVEL', value: cards.nivel || '—', sub: '' },
  ];
}

/** Largura das colunas de resultado — página inteira livre. */
function resultStackColumnWidth(s: PdfScale): number {
  return Math.min(44, Math.max(30, usableWidth(s) / 6.8));
}

function maxResultColsPerRow(s: PdfScale): number {
  const colW = resultStackColumnWidth(s);
  return Math.max(1, Math.floor((usableWidth(s) + s.gap) / (colW + s.gap)));
}

/** Altura de cada card na pilha vertical. */
function stackCardH(_s: PdfScale): number {
  return 12.5;
}

function stackVGap(s: PdfScale): number {
  return Math.min(2.8, Math.max(1.6, s.gap * 0.5));
}

const STACK_HEADING_H = 6.2;

/**
 * Fontes da seção de resultados: fixas no tamanho da descrição (meta)
 * com 52 questões — metaFont = lerp(9.5, 7.8, 1) = 7.8pt.
 * Não variam com o nº de questões do boletim.
 */
const RESULT_FONT_SIZE = 7.8;

function resultTitleFont(_s: PdfScale): number {
  return RESULT_FONT_SIZE;
}

function resultLabelFont(_s: PdfScale): number {
  return RESULT_FONT_SIZE;
}

function resultValueFont(_s: PdfScale): number {
  return RESULT_FONT_SIZE;
}

/** Reduz a fonte só se o texto não couber na largura do card (não por nº de questões). */
function resolveValueLayout(
  doc: jsPDF,
  value: string,
  maxW: number,
  preferredFont: number,
  minFont = 5.5
): { font: number; lines: string[] } {
  const text = String(value || '—');
  doc.setFont('helvetica', 'bold');
  let font = preferredFont;
  while (font > minFont) {
    doc.setFontSize(font);
    if (doc.getTextWidth(text) <= maxW) return { font, lines: [text] };
    font -= 0.5;
  }
  doc.setFontSize(minFont);
  if (doc.getTextWidth(text) <= maxW) return { font: minFont, lines: [text] };
  const lines = (doc.splitTextToSize(text, maxW) as string[]).slice(0, 2);
  return { font: minFont, lines: lines.length ? lines : ['—'] };
}

function cardHeightForValue(baseH: number, lineCount: number, hasSub = false): number {
  let h = baseH;
  if (lineCount > 1) h += Math.max(3.2, (lineCount - 1) * 3.4);
  if (hasSub) h += 1.8; // espaço extra para % sob o valor (ACERTOS)
  return h;
}

function metricStackHeight(s: PdfScale, cards?: BoletimAlunoCards, colW?: number): number {
  const baseH = stackCardH(s);
  const gap = stackVGap(s);
  if (!cards) {
    // Reserva um pouco mais para caber NÍVEL em 2 linhas (fitScale / paginação).
    return STACK_HEADING_H + 4 * (baseH + 1.2) + 3 * gap;
  }
  const items = metricItems(cards);
  const w = colW ?? resultStackColumnWidth(s);
  const approxCharW = resultValueFont(s) * 0.22;
  let total = STACK_HEADING_H;
  items.forEach((card, i) => {
    const lines = card.value.length * approxCharW > w - 1.6 ? 2 : 1;
    total += cardHeightForValue(baseH, lines, Boolean(card.sub));
    if (i < items.length - 1) total += gap;
  });
  return total;
}

/** Altura real da pilha usando medições do jsPDF (fonte ajustada / 2 linhas). */
function measureMetricStackHeight(
  doc: jsPDF,
  colW: number,
  cards: BoletimAlunoCards,
  s: PdfScale
): number {
  const baseH = stackCardH(s);
  const gap = stackVGap(s);
  const preferred = resultValueFont(s);
  const maxW = colW - 1.6;
  let total = STACK_HEADING_H;
  const items = metricItems(cards);
  items.forEach((card, i) => {
    const layout = resolveValueLayout(doc, card.value, maxW, preferred);
    total += cardHeightForValue(baseH, layout.lines.length, Boolean(card.sub));
    if (i < items.length - 1) total += gap;
  });
  return total;
}

function disciplineResultColumns(item: BoletimAlunoItem): ResultColumn[] {
  const cols: ResultColumn[] = [];
  for (const bloco of item.por_disciplina ?? []) {
    const cards = resolveDisciplinaCards(bloco);
    if (!cards) continue;
    cols.push({ title: bloco.disciplina, cards });
  }
  return cols;
}

/**
 * Empacota disciplinas à esquerda.
 * Faixas cheias usam maxPerRow; a última faixa deixa 1 slot livre à direita para o GERAL
 * (exceto quando a última faixa fica completa — aí o GERAL vai sozinho na faixa seguinte).
 */
function packDisciplineRows(discs: ResultColumn[], maxPerRow: number): ResultColumn[][] {
  if (!discs.length) return [];
  const maxLast = Math.max(1, maxPerRow - 1);
  const rows: ResultColumn[][] = [];
  let i = 0;
  while (i < discs.length) {
    const remaining = discs.length - i;
    if (remaining <= maxLast) {
      rows.push(discs.slice(i));
      break;
    }
    const take = Math.min(maxPerRow, remaining);
    rows.push(discs.slice(i, i + take));
    i += take;
  }
  return rows;
}

/** Quantidade de faixas (disciplinas + GERAL à direita). */
function resultsRowCount(disciplineCount: number, s: PdfScale): number {
  if (disciplineCount <= 0) return 1;
  const maxPerRow = maxResultColsPerRow(s);
  const maxLast = Math.max(1, maxPerRow - 1);
  let rows = 0;
  let left = disciplineCount;
  while (left > maxLast) {
    left -= maxPerRow;
    rows += 1;
  }
  if (left > 0) return rows + 1;
  return rows + 1;
}

/** Desenha uma coluna: título + 4 métricas empilhadas. */
function drawMetricStack(
  doc: jsPDF,
  x: number,
  y: number,
  colW: number,
  cards: BoletimAlunoCards,
  heading: string,
  s: PdfScale
): number {
  const baseH = stackCardH(s);
  const vGap = stackVGap(s);
  const titleFont = resultTitleFont(s);
  const preferredValueFont = resultValueFont(s);
  const labelFont = resultLabelFont(s);
  const maxValueW = colW - 1.6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleFont);
  doc.setTextColor(...C.textDark);
  const title = doc.splitTextToSize(heading.toUpperCase(), colW - 0.8) as string[];
  doc.text(title[0] || heading, x + colW / 2, y + 3.4, { align: 'center' });

  let cy = y + STACK_HEADING_H;
  for (const card of metricItems(cards)) {
    const layout = resolveValueLayout(doc, card.value, maxValueW, preferredValueFont);
    const h = cardHeightForValue(baseH, layout.lines.length, Boolean(card.sub));

    doc.setFillColor(...C.primary);
    doc.roundedRect(x, cy, colW, h, 0.7, 0.7, 'F');

    // Rótulo no topo; valor centralizado na área abaixo (com sub: reserva rodapé).
    const labelY = cy + Math.max(3.0, h * 0.26);
    const labelBottom = labelY + Math.max(1.6, labelFont * 0.22);
    const subReserve = card.sub ? Math.max(3.4, labelFont * 0.45) : 1.2;
    const valueAreaTop = labelBottom + 1.1;
    const valueAreaBottom = cy + h - subReserve;
    const lineStep = Math.max(2.6, layout.font * 0.36);
    const blockH = (layout.lines.length - 1) * lineStep;
    const valueCenter = (valueAreaTop + valueAreaBottom) / 2;
    // Baseline da 1ª linha: centro óptico do bloco de texto
    const valueFirstY = valueCenter - blockH / 2 + layout.font * 0.12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(labelFont);
    doc.setTextColor(...C.white);
    doc.text(card.title, x + colW / 2, labelY, { align: 'center' });

    doc.setFontSize(layout.font);
    layout.lines.forEach((line, li) => {
      doc.text(line || '—', x + colW / 2, valueFirstY + li * lineStep - 0.75, { align: 'center' });
    });

    if (card.sub) {
      doc.setFontSize(RESULT_FONT_SIZE);
      doc.setFont('helvetica', 'normal');
      doc.text(card.sub, x + colW / 2, cy + h - 1.5, { align: 'center' });
    }
    cy += h + vGap;
  }
  return cy - vGap;
}

function resultsColumnsHeight(item: BoletimAlunoItem, s: PdfScale): number {
  const discs = disciplineResultColumns(item);
  const rows = resultsRowCount(discs.length, s);
  const sectionTitleH = 8;
  const rowGap = 4;
  const colW = resultStackColumnWidth(s);
  const discHeights = discs.map((d) => metricStackHeight(s, d.cards, colW));
  const geralH = metricStackHeight(s, item.cards, colW);
  const rowH = Math.max(geralH, ...discHeights, metricStackHeight(s));
  return sectionTitleH + rows * rowH + Math.max(0, rows - 1) * rowGap;
}

/**
 * Disciplinas à esquerda (wrap) e GERAL ancorado à direita.
 */
function drawResultsColumns(doc: jsPDF, y: number, item: BoletimAlunoItem, s: PdfScale): number {
  const discs = disciplineResultColumns(item);
  const geral: ResultColumn = { title: 'GERAL', cards: item.cards };
  const colW = resultStackColumnWidth(s);
  const maxPerRow = maxResultColsPerRow(s);
  const geralX = PAGE_W - s.margin - colW;

  const estimateStackH = Math.max(
    measureMetricStackHeight(doc, colW, item.cards, s),
    ...discs.map((d) => measureMetricStackHeight(doc, colW, d.cards, s)),
    metricStackHeight(s)
  );

  let cy = ensureSpace(doc, y, 8 + estimateStackH, s);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(RESULT_FONT_SIZE);
  doc.setTextColor(...C.textGray);
  doc.text('RESULTADOS POR DISCIPLINA', s.margin, cy + 3);
  cy += 8;

  const discRows = packDisciplineRows(discs, maxPerRow);
  const totalRows = resultsRowCount(discs.length, s);

  for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
    const rowDiscs = discRows[rowIdx] ?? [];
    const isLastRow = rowIdx === totalRows - 1;
    const rowStackH = Math.max(
      ...rowDiscs.map((col) => measureMetricStackHeight(doc, colW, col.cards, s)),
      isLastRow ? measureMetricStackHeight(doc, colW, geral.cards, s) : 0,
      metricStackHeight(s) * 0.5
    );

    cy = ensureSpace(doc, cy, rowStackH, s);

    rowDiscs.forEach((col, colIdx) => {
      const x = s.margin + colIdx * (colW + s.gap);
      drawMetricStack(doc, x, cy, colW, col.cards, col.title, s);
    });

    if (isLastRow) {
      drawMetricStack(doc, geralX, cy, colW, geral.cards, geral.title, s);
    }

    cy += rowStackH + (rowIdx < totalRows - 1 ? 4 : 0);
  }

  return cy;
}

function drawStudentBoletim(
  doc: jsPDF,
  item: BoletimAlunoItem,
  avaliacaoNome: string,
  labels: BoletimAlunoPdfLabels,
  logo: PdfImageAsset | null,
  isFirstPage: boolean
): void {
  if (!isFirstPage) doc.addPage();

  const lines = metaLines(item, avaliacaoNome, labels);
  const s = fitScale(item, logo, lines.length);
  const contentLeft = s.margin;
  const contentRight = PAGE_W - s.margin;
  let y = s.startY;

  const logoSize = logoDrawSize(logo, s);
  const titleBandH = Math.max(logoSize.h > 0 ? logoSize.h : 0, s.titleFont * 0.5, 5);
  const logoGap = logoSize.w > 0 ? s.gap + 2 : 0;
  const titleMaxW = Math.max(
    40,
    usableWidth(s) - (logoSize.w > 0 ? logoSize.w + logoGap : 0)
  );

  if (logo?.dataUrl && logoSize.w > 0 && logoSize.h > 0) {
    doc.addImage(
      logo.dataUrl,
      'PNG',
      contentRight - logoSize.w,
      y,
      logoSize.w,
      logoSize.h
    );
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(s.titleFont);
  doc.setTextColor(...C.primary);
  const titleY = y + titleBandH / 2 + s.titleFont * 0.12;
  const titleLines = doc.splitTextToSize('BOLETIM DO ALUNO', titleMaxW) as string[];
  doc.text(titleLines[0] || 'BOLETIM DO ALUNO', contentLeft, titleY, { align: 'left' });
  y += titleBandH + s.titleGap;

  const metaMaxW = usableWidth(s);
  doc.setFontSize(s.metaFont);
  for (const [k, v] of lines) {
    const label = `${k}: `;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.textGray);
    const lw = doc.getTextWidth(label);
    doc.text(label, contentLeft, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.textDark);
    const value = doc.splitTextToSize(String(v || '—').toUpperCase(), Math.max(40, metaMaxW - lw)) as string[];
    doc.text(value[0] || '—', contentLeft + lw, y);
    y += s.metaLineH;
  }

  y += 2.4;

  const blocos = item.por_disciplina ?? [];

  blocos.forEach((bloco, idx) => {
    const nQ = bloco.questoes?.length ?? 0;
    const nL = questionAlternativeLetters(bloco.questoes).length;
    const blockH = disciplineBlockHeight(nQ, nL, s);
    const isLast = idx === blocos.length - 1;
    const needed = blockH + (isLast ? s.gap + resultsColumnsHeight(item, s) : s.gap);
    y = ensureSpace(doc, y, needed, s);

    const bottom = drawDisciplineBlock(doc, contentLeft, y, bloco, s);
    y = bottom + (isLast ? s.gap * 0.6 : s.gap);
  });

  if (!blocos.length) {
    doc.setFontSize(8);
    doc.setTextColor(...C.textGray);
    doc.text('Nenhuma questão neste boletim.', s.margin, y);
    y += 8;
  }

  drawResultsColumns(doc, y, item, s);
}

export async function generateBoletimAlunoPdf(options: {
  boletins: BoletimAlunoItem[];
  avaliacaoNome: string;
  labels: BoletimAlunoPdfLabels;
  cityId: string | null;
  flow: BoletimAlunoReportFlow;
}): Promise<void> {
  const { boletins, avaliacaoNome, labels, flow } = options;
  void options.cityId; // mantido na assinatura; o PDF usa sempre a logo Afirme Play
  if (!boletins.length) throw new Error('Não há boletins para exportar.');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const dataGeracao = fmtNow();
  const logo = await loadDefaultReportLogoAsset();
  if (!logo) {
    console.warn(
      '[boletimAluno] loadDefaultReportLogoAsset retornou null — logo não será exibida neste PDF.'
    );
  }

  for (let i = 0; i < boletins.length; i++) {
    drawStudentBoletim(doc, boletins[i], avaliacaoNome, labels, logo, i === 0);
  }

  addFooters(doc, dataGeracao, 12);

  const mode = flow === 'cartao' ? 'cartao' : 'online';
  const alunoPart =
    boletins.length === 1
      ? boletins[0].aluno.nome.replace(/[^\wÀ-ÿ]+/g, '-').slice(0, 40)
      : 'turma';
  doc.save(`boletim-aluno-${mode}-${alunoPart || 'relatorio'}.pdf`);
}
