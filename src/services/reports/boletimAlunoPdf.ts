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

type PdfScale = {
  margin: number;
  rowH: number;
  colWNum: number;
  colWAlt: number;
  colWGab: number;
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

/** Quantidade de colunas de resposta por faixa horizontal (paisagem). */
const GRID_COLS = 4;

function groupDisciplinas(
  blocos: BoletimAlunoPorDisciplina[],
  perRow = GRID_COLS
): BoletimAlunoPorDisciplina[][] {
  if (!blocos.length) return [];
  const rows: BoletimAlunoPorDisciplina[][] = [];
  const n = Math.max(1, perRow);
  for (let i = 0; i < blocos.length; i += n) {
    rows.push(blocos.slice(i, i + n));
  }
  return rows;
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

function baseScale(totalQ: number): PdfScale {
  const t = clamp((totalQ - 24) / 28, 0, 1);
  return {
    margin: 13,
    rowH: lerp(6.2, 4.35, t),
    colWNum: lerp(11, 7.6, t),
    colWAlt: lerp(9, 6.05, t),
    colWGab: lerp(12, 8.2, t),
    circleR: lerp(1.7, 1.2, t),
    bannerH: lerp(6, 5, t),
    colHeaderH: lerp(6, 5, t),
    logoW: lerp(34, 25, t),
    logoMaxH: lerp(15, 10.5, t),
    startY: lerp(8, 4.2, t),
    titleFont: lerp(12, 9.5, t),
    titleGap: lerp(4.5, 3.4, t),
    metaFont: lerp(8, 6.4, t),
    metaLineH: lerp(4.35, 3.3, t),
    tableTitleFont: lerp(7, 5.8, t),
    tableFont: lerp(7, 5.7, t),
    cardH: lerp(17, 12.5, t),
    cardTitleFont: lerp(6.5, 5.4, t),
    cardValueFont: lerp(11, 8.4, t),
    gap: lerp(4, 2.5, t),
    footerReserve: 13,
  };
}

function tableWidth(nLetters: number, s: PdfScale): number {
  return s.colWNum + nLetters * s.colWAlt + s.colWGab;
}

function logoDrawSize(logo: PdfImageAsset | null, s: PdfScale): { w: number; h: number } {
  if (!logo?.dataUrl) return { w: 0, h: 0 };
  if (logo.iw <= 0 || logo.ih <= 0) {
    console.warn('[boletimAluno] logo carregada sem dimensões válidas (iw/ih <= 0):', logo);
    // Ainda desenha com caixa padrão para a logo não sumir silenciosamente.
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

/** Largura de cada coluna de respostas: pouco menos de 1/4 da área útil. */
function responseColumnWidth(s: PdfScale): number {
  return (usableWidth(s) - s.gap * (GRID_COLS - 1)) / GRID_COLS;
}

function headerHeight(s: PdfScale, logo: PdfImageAsset | null, nMeta: number): number {
  const { h } = logoDrawSize(logo, s);
  // Título e logo ficam na mesma faixa horizontal; depois vêm as metas.
  const titleBand = Math.max(h > 0 ? h : 0, s.titleFont * 0.45, 4);
  return s.startY + titleBand + s.titleGap + nMeta * s.metaLineH + 2.4;
}

function columnsForSlot(slotW: number, nLetters: number, nQuestoes: number, s: PdfScale): number {
  if (nQuestoes <= 0) return 1;
  // Conta pelo teto de ~1/4 (não pela largura natural), para caberem 4 colunas na paisagem.
  const unitW = responseColumnWidth(s);
  const colPitch = Math.min(unitW, Math.max(tableWidth(nLetters, s), 1));
  const nCols = Math.max(1, Math.floor((slotW + s.gap) / (colPitch + s.gap)));
  return Math.min(nCols, nQuestoes, GRID_COLS);
}

function blockHeight(nQuestoes: number, nLetters: number, slotW: number, s: PdfScale): number {
  if (nQuestoes <= 0) return s.bannerH + 8;
  const unitW = responseColumnWidth(s);
  const maxFit = Math.max(1, Math.floor((slotW + s.gap) / (unitW + s.gap)));
  const nCols = Math.min(maxFit, columnsForSlot(slotW, nLetters, nQuestoes, s));
  const rows = Math.ceil(nQuestoes / nCols);
  return s.bannerH + s.colHeaderH + rows * s.rowH;
}

function usableWidth(s: PdfScale): number {
  return PAGE_W - s.margin * 2;
}

function slotsPerDiscipline(disciplinasInRow: number): number {
  return Math.max(1, Math.floor(GRID_COLS / Math.max(1, disciplinasInRow)));
}

function disciplineSlotWidth(disciplinasInRow: number, s: PdfScale): number {
  const units = slotsPerDiscipline(disciplinasInRow);
  const unitW = responseColumnWidth(s);
  return units * unitW + (units - 1) * s.gap;
}

function measureTablesHeight(blocos: BoletimAlunoPorDisciplina[], s: PdfScale): number {
  const rows = groupDisciplinas(blocos);
  let h = 0;
  rows.forEach((row, idx) => {
    const sw = disciplineSlotWidth(row.length, s);
    const rowH = Math.max(
      ...row.map((b) =>
        blockHeight(
          b.questoes?.length ?? 0,
          questionAlternativeLetters(b.questoes).length,
          sw,
          s
        )
      ),
      0
    );
    h += rowH + (idx < rows.length - 1 ? 3 : 0);
  });
  return h;
}

function fitScale(
  item: BoletimAlunoItem,
  logo: PdfImageAsset | null,
  nMeta: number
): PdfScale {
  const s = baseScale(totalQuestoes(item));
  const blocos = item.por_disciplina ?? [];

  for (let i = 0; i < 14; i++) {
    const head = headerHeight(s, logo, nMeta);
    const resultsH = resultsColumnsHeight(item, s);
    const avail = PAGE_H - head - resultsH - 8 - s.footerReserve;
    const tablesH = measureTablesHeight(blocos, s);
    if (tablesH <= avail) break;

    s.rowH = Math.max(3.75, s.rowH * 0.93);
    s.colWAlt = Math.max(5.15, s.colWAlt * 0.96);
    s.colWNum = Math.max(6.6, s.colWNum * 0.97);
    s.colWGab = Math.max(7.2, s.colWGab * 0.97);
    s.circleR = Math.max(1.05, s.circleR * 0.96);
    s.bannerH = Math.max(4.4, s.bannerH * 0.98);
    s.colHeaderH = Math.max(4.4, s.colHeaderH * 0.98);
    s.tableFont = Math.max(5.4, s.tableFont * 0.98);
    s.tableTitleFont = Math.max(5.4, s.tableTitleFont * 0.98);
    s.logoMaxH = Math.max(6.2, s.logoMaxH * 0.96);
    s.startY = Math.max(3.6, s.startY * 0.97);
    s.metaLineH = Math.max(3.05, s.metaLineH * 0.97);
    s.cardH = Math.max(11.5, s.cardH * 0.98);
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

function expandedColWidths(
  letters: string[],
  targetW: number,
  s: PdfScale
): { num: number; alt: number; gab: number } {
  const n = Math.max(letters.length, 1);
  const base = tableWidth(letters.length, s);
  // Nunca ultrapassar o teto (~1/4 da área útil); se a base for maior, comprime proporcionalmente.
  const capped = Math.min(targetW, responseColumnWidth(s));
  if (base > capped && base > 0) {
    const k = capped / base;
    return {
      num: s.colWNum * k,
      alt: s.colWAlt * k,
      gab: s.colWGab * k,
    };
  }
  const extra = Math.max(0, capped - base);
  const toAlt = extra * 0.7;
  const toNum = extra * 0.15;
  const toGab = extra * 0.15;
  return {
    num: s.colWNum + toNum,
    alt: s.colWAlt + toAlt / n,
    gab: s.colWGab + toGab,
  };
}

function drawQuestionTable(
  doc: jsPDF,
  x: number,
  y: number,
  title: string,
  questoes: BoletimAlunoQuestao[],
  letters: string[],
  colW: number,
  s: PdfScale
): number {
  const widths = expandedColWidths(letters, colW, s);
  const w = widths.num + letters.length * widths.alt + widths.gab;
  const r = Math.min(s.circleR, widths.alt / 2 - 0.7, s.rowH / 2 - 0.55);

  doc.setFillColor(...C.primary);
  doc.roundedRect(x, y, w, s.bannerH, 0.5, 0.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(s.tableTitleFont);
  doc.setTextColor(...C.white);
  const titleText = doc.splitTextToSize(title.toUpperCase(), w - 2.4) as string[];
  doc.text(titleText[0] || title, x + w / 2, y + s.bannerH * 0.68, { align: 'center' });

  let cy = y + s.bannerH;
  doc.setFillColor(...C.bgHeader);
  doc.rect(x, cy, w, s.colHeaderH, 'F');
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.18);
  doc.rect(x, cy, w, s.colHeaderH);

  const headers = ['#', ...letters, 'GAB'];
  const colWidths = [widths.num, ...letters.map(() => widths.alt), widths.gab];
  let hx = x;
  doc.setFontSize(Math.max(5.4, s.tableFont - 0.4));
  doc.setTextColor(...C.textDark);
  doc.setFont('helvetica', 'bold');
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], hx + colWidths[i] / 2, cy + s.colHeaderH * 0.68, { align: 'center' });
    hx += colWidths[i];
  }
  cy += s.colHeaderH;

  for (const q of questoes) {
    doc.setDrawColor(...C.border);
    doc.setFillColor(...C.white);
    doc.rect(x, cy, w, s.rowH, 'FD');
    let cx = x;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(s.tableFont);
    doc.setTextColor(...C.textDark);
    doc.text(`Q${q.numero}`, cx + widths.num / 2, cy + s.rowH / 2 + 0.9, { align: 'center' });
    cx += widths.num;

    for (const letter of letters) {
      const status = getBoletimMarkStatus(q, letter);
      drawCircle(doc, cx + widths.alt / 2, cy + s.rowH / 2, r, status);
      cx += widths.alt;
    }

    const padX = Math.min(1.1, widths.gab * 0.12);
    const padY = Math.min(1.0, s.rowH * 0.16);
    doc.setFillColor(...C.green);
    doc.roundedRect(cx + padX, cy + padY, widths.gab - padX * 2, s.rowH - padY * 2, 0.5, 0.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(s.tableFont);
    doc.setTextColor(...C.white);
    doc.text(String(q.gabarito || '—').toUpperCase(), cx + widths.gab / 2, cy + s.rowH / 2 + 0.9, {
      align: 'center',
    });
    cy += s.rowH;
  }

  return cy;
}

function drawDisciplineBlock(
  doc: jsPDF,
  x: number,
  y: number,
  slotW: number,
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

  const unitW = responseColumnWidth(s);
  // Quantas colunas de ~1/4 cabem no slot (sem esticar além do teto).
  const maxFit = Math.max(1, Math.floor((slotW + s.gap) / (unitW + s.gap)));
  const nCols = Math.min(maxFit, columnsForSlot(slotW, letters.length, questoes.length, s));
  const rowsPerCol = Math.ceil(questoes.length / nCols);
  const columns = chunk(questoes, rowsPerCol);
  const innerGap = s.gap;
  const colW = unitW;

  let bottom = y;
  columns.forEach((col, idx) => {
    const cx = x + idx * (colW + innerGap);
    const b = drawQuestionTable(doc, cx, y, bloco.disciplina, col, letters, colW, s);
    bottom = Math.max(bottom, b);
  });
  return bottom;
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

/** Largura das colunas de resultado: metade do slot de ~1/4 da área útil. */
function resultStackColumnWidth(s: PdfScale): number {
  return responseColumnWidth(s) / 3;
}

function maxResultColsPerRow(s: PdfScale): number {
  const colW = resultStackColumnWidth(s);
  return Math.max(1, Math.floor((usableWidth(s) + s.gap) / (colW + s.gap)));
}

/** Altura compacta de cada card na pilha vertical. */
function stackCardH(s: PdfScale): number {
  return Math.min(11.5, Math.max(8.6, s.cardH * 0.77));
}

function stackVGap(s: PdfScale): number {
  return Math.min(2.4, Math.max(1.2, s.gap * 0.5));
}

const STACK_HEADING_H = 4.8;

function metricStackHeight(s: PdfScale): number {
  const h = stackCardH(s);
  const gap = stackVGap(s);
  return STACK_HEADING_H + 4 * h + 3 * gap;
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
  if (left > 0) return rows + 1; // última faixa compartilha com GERAL
  return rows + 1; // faixas cheias → GERAL sozinho na seguinte
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
  const h = stackCardH(s);
  const vGap = stackVGap(s);
  const titleFont = Math.max(5.0, s.cardTitleFont * 0.92) + 2;
  const valueFont = Math.max(6.2, s.cardValueFont * 0.7) + 2.5;
  const labelFont = Math.max(4.8, s.cardTitleFont * 0.85) + 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleFont);
  doc.setTextColor(...C.textDark);
  const title = doc.splitTextToSize(heading.toUpperCase(), colW - 0.8) as string[];
  doc.text(title[0] || heading, x + colW / 2, y + 2.9, { align: 'center' });

  let cy = y + STACK_HEADING_H;
  for (const card of metricItems(cards)) {
    doc.setFillColor(...C.primary);
    doc.roundedRect(x, cy, colW, h, 0.7, 0.7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(labelFont);
    doc.setTextColor(...C.white);
    doc.text(card.title, x + colW / 2, cy + h * 0.35, { align: 'center' });
    doc.setFontSize(valueFont);
    const valueLines = doc.splitTextToSize(String(card.value), colW - 1.6) as string[];
    const valueY = card.sub ? cy + h * 0.66 : cy + h * 0.76;
    doc.text(valueLines[0] || '—', x + colW / 2, valueY, { align: 'center' });
    if (card.sub) {
      doc.setFontSize(Math.max(4.8, labelFont));
      doc.setFont('helvetica', 'normal');
      doc.text(card.sub, x + colW / 2, cy + h * 0.92, { align: 'center' });
    }
    cy += h + vGap;
  }
  return cy - vGap;
}

function resultsColumnsHeight(item: BoletimAlunoItem, s: PdfScale): number {
  const discs = disciplineResultColumns(item);
  const rows = resultsRowCount(discs.length, s);
  const sectionTitleH = 5;
  const rowGap = 3;
  return sectionTitleH + rows * metricStackHeight(s) + Math.max(0, rows - 1) * rowGap;
}

/**
 * Disciplinas à esquerda (wrap) e GERAL ancorado à direita.
 * Ex.: 10 disciplinas com ~6 por faixa →
 *   a b c d e f
 *   g h i j      K
 */
function drawResultsColumns(doc: jsPDF, y: number, item: BoletimAlunoItem, s: PdfScale): number {
  const discs = disciplineResultColumns(item);
  const geral: ResultColumn = { title: 'GERAL', cards: item.cards };
  const colW = resultStackColumnWidth(s);
  const stackH = metricStackHeight(s);
  const maxPerRow = maxResultColsPerRow(s);
  const geralX = PAGE_W - s.margin - colW;

  let cy = ensureSpace(doc, y, 5 + stackH, s);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(Math.max(5.8, s.cardTitleFont + 0.4) + 2);
  doc.setTextColor(...C.textGray);
  doc.text('RESULTADOS POR DISCIPLINA', s.margin, cy + 2.2);
  cy += 5;

  const discRows = packDisciplineRows(discs, maxPerRow);
  const totalRows = resultsRowCount(discs.length, s);

  for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
    cy = ensureSpace(doc, cy, stackH, s);
    const rowDiscs = discRows[rowIdx] ?? [];
    const isLastRow = rowIdx === totalRows - 1;

    rowDiscs.forEach((col, colIdx) => {
      const x = s.margin + colIdx * (colW + s.gap);
      drawMetricStack(doc, x, cy, colW, col.cards, col.title, s);
    });

    if (isLastRow) {
      drawMetricStack(doc, geralX, cy, colW, geral.cards, geral.title, s);
    }

    cy += stackH + (rowIdx < totalRows - 1 ? 3 : 0);
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
    // Logo Afirme Play: mesma faixa do título, canto superior direito (recuo = margem das tabelas).
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
  const rows = groupDisciplinas(blocos);

  rows.forEach((row, rowIdx) => {
    const sw = disciplineSlotWidth(row.length, s);
    const rowH = Math.max(
      ...row.map((b) =>
        blockHeight(b.questoes?.length ?? 0, questionAlternativeLetters(b.questoes).length, sw, s)
      ),
      8
    );
    const isLast = rowIdx === rows.length - 1;
    const needed = rowH + (isLast ? 3 + resultsColumnsHeight(item, s) : 3);
    y = ensureSpace(doc, y, needed, s);

    row.forEach((bloco, colIdx) => {
      const x = contentLeft + colIdx * (sw + s.gap);
      drawDisciplineBlock(doc, x, y, sw, bloco, s);
    });
    y += rowH + 3;
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
  // Sempre a logo institucional Afirme Play (não a municipal).
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
