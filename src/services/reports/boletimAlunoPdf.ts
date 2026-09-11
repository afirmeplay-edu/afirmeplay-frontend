import { jsPDF } from 'jspdf';
import {
  loadDefaultReportLogoAsset,
  resolveReportLogoForPdf,
  type PdfImageAsset,
} from '@/utils/pdfCityBranding';
import { formatDecimal1PtBr } from '@/utils/numberFormat';
import {
  getBoletimMarkStatus,
  questionAlternativeLetters,
  resolveDisciplinaCards,
} from '@/utils/reports/boletimAlunoHelpers';
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

/** Cores de fundo do valor de NÍVEL — alinhadas a DetailedResultsView. */
const NIVEL_VALUE_COLORS: Record<string, [number, number, number]> = {
  'Abaixo do Básico': [220, 38, 38], // #dc2626
  Básico: [251, 191, 36], // #fbbf24
  Adequado: [74, 222, 128], // #4ade80
  Avançado: [22, 163, 74], // #16a34a
  'Sem Nota': [107, 114, 128], // #6b7280
};

function nivelValueStyle(nivel: string): {
  fill: [number, number, number];
  text: [number, number, number];
} {
  const raw = (nivel || '').trim();
  const map = NIVEL_VALUE_COLORS;
  let fill = map['Sem Nota'];
  if (raw && map[raw]) {
    fill = map[raw];
  } else {
    const lower = raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (lower.includes('avancado')) fill = map['Avançado'];
    else if (lower.includes('adequado')) fill = map.Adequado;
    else if (lower === 'basico' || lower.startsWith('basico')) fill = map.Básico;
    else if (lower.includes('abaixo')) fill = map['Abaixo do Básico'];
  }
  const [r, g, b] = fill;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const text: [number, number, number] = luminance > 0.65 ? C.textDark : C.white;
  return { fill, text };
}

/** A4 portrait */
const PAGE_W = 210;
const PAGE_H = 297;

/** Colunas de tabelas de questão por faixa da página. */
const GRID_COLS = 4;

type PdfScale = {
  margin: number;
  rowH: number;
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
  cardLabelFont: number;
  cardValueFont: number;
  gap: number;
  colGap: number;
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

type QuestionColumn = {
  disciplina: string;
  questoes: BoletimAlunoQuestao[];
  letters: string[];
};

type MetricCardDef = {
  title: string;
  value: string;
  /** Card de nível: cabeçalho roxo; corpo com cor da faixa. */
  isNivel: boolean;
};

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

function usableWidth(s: PdfScale): number {
  return PAGE_W - s.margin * 2;
}

function baseScale(): PdfScale {
  return {
    margin: 11,
    rowH: 5.1,
    circleR: 1.35,
    bannerH: 6.2,
    colHeaderH: 5.4,
    logoW: 32,
    logoMaxH: 16,
    startY: 8,
    titleFont: 13,
    titleGap: 3.5,
    metaFont: 8.2,
    metaLineH: 4.2,
    tableTitleFont: 7.2,
    tableFont: 7,
    cardH: 18,
    cardLabelFont: 6.5,
    cardValueFont: 11,
    gap: 4.5,
    colGap: 2.4,
    footerReserve: 14,
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

function columnWidth(s: PdfScale): number {
  const gaps = (GRID_COLS - 1) * s.colGap;
  return (usableWidth(s) - gaps) / GRID_COLS;
}

/**
 * Espaço entre colunas na faixa:
 * - 2 → mais espaçadas
 * - 3 → mais juntas
 * - 4 → máximo por folha, gap mais apertado
 */
function gapForColumnCount(nCols: number, s: PdfScale): number {
  if (nCols <= 1) return 0;
  if (nCols === 2) return Math.max(14, s.colGap * 5.5);
  if (nCols === 3) return Math.max(5, s.colGap * 2.2);
  return s.colGap;
}

/**
 * Largura da coluna conforme quantas cabem na faixa (máx. 4).
 * Com 2–3 colunas a tabela fica um pouco mais larga; com 4 usa o grid completo.
 */
function columnWidthForRow(nCols: number, s: PdfScale): number {
  const n = Math.min(GRID_COLS, Math.max(1, nCols));
  const gap = gapForColumnCount(n, s);
  const natural = (usableWidth(s) - Math.max(0, n - 1) * gap) / n;
  // Não deixa 1 coluna estourar a página inteira — limita ao tamanho do grid de 4.
  const cap = columnWidth(s) * (n === 1 ? 1.35 : n === 2 ? 1.2 : 1);
  return Math.min(natural, cap);
}

/** Posição X inicial para centralizar o bloco de colunas na página. */
function centeredColumnsStartX(nCols: number, colW: number, gap: number, s: PdfScale): number {
  const n = Math.max(1, nCols);
  const blockW = n * colW + Math.max(0, n - 1) * gap;
  return s.margin + Math.max(0, (usableWidth(s) - blockW) / 2);
}

function sharedBannerGap(_s: PdfScale): number {
  return 1.0;
}

/**
 * Altura de uma coluna de questões.
 * `includeBanner`: banner roxo no topo da própria coluna.
 */
function questionColumnHeight(
  nQuestoes: number,
  s: PdfScale,
  includeBanner = true
): number {
  const banner = includeBanner ? s.bannerH : 0;
  return banner + s.colHeaderH + Math.max(0, nQuestoes) * s.rowH + 1.2;
}

/** Altura de uma faixa de colunas (até 4), com ou sem banner compartilhado. */
function questionRowHeight(
  cols: QuestionColumn[],
  s: PdfScale,
  sharedBanner: boolean
): number {
  if (!cols.length) return 0;
  const maxQ = Math.max(...cols.map((c) => c.questoes.length), 0);
  const colH = questionColumnHeight(maxQ, s, !sharedBanner);
  if (!sharedBanner) return colH;
  return s.bannerH + sharedBannerGap(s) + colH;
}

function maxRowsForRowAvail(
  availH: number,
  s: PdfScale,
  sharedBanner: boolean
): number {
  const fixed = sharedBanner
    ? s.bannerH + sharedBannerGap(s) + s.colHeaderH + 1.2
    : s.bannerH + s.colHeaderH + 1.2;
  if (availH <= fixed) return 0;
  return Math.max(1, Math.floor((availH - fixed) / s.rowH));
}

/**
 * Régua de divisão por disciplina (questões daquela disciplina):
 * - ≤ 42 → 1 coluna
 * - 43–83 (superou 42) → 2 colunas
 * - ≥ 84 (superou 83) → 3 colunas
 */
function columnCountForDiscipline(nQuestoes: number): number {
  if (nQuestoes <= 0) return 0;
  if (nQuestoes <= 42) return 1;
  if (nQuestoes <= 83) return 2;
  return 3;
}

/**
 * Divide a disciplina em N colunas equilibradas pela régua 42 / 83.
 */
function splitDisciplineToColumns(bloco: BoletimAlunoPorDisciplina): QuestionColumn[] {
  const questoes = bloco.questoes ?? [];
  if (!questoes.length) return [];
  const letters = questionAlternativeLetters(questoes);
  const nParts = columnCountForDiscipline(questoes.length);
  const partSize = Math.ceil(questoes.length / Math.max(1, nParts));
  return chunk(questoes, partSize).map((part) => ({
    disciplina: bloco.disciplina,
    questoes: part,
    letters,
  }));
}

function rowUsesSharedBanner(cols: QuestionColumn[]): boolean {
  if (cols.length <= 1) return false;
  const name = cols[0]?.disciplina;
  return cols.every((c) => c.disciplina === name);
}

/** Corta a mesma qtde de linhas em todas as colunas da faixa. */
function takeRowSlice(
  cols: QuestionColumn[],
  maxRows: number
): { slice: QuestionColumn[]; rest: QuestionColumn[] } {
  const slice = cols
    .map((c) => ({
      disciplina: c.disciplina,
      letters: c.letters,
      questoes: c.questoes.slice(0, maxRows),
    }))
    .filter((c) => c.questoes.length > 0);

  const rest = cols
    .map((c) => ({
      ...c,
      questoes: c.questoes.slice(maxRows),
    }))
    .filter((c) => c.questoes.length > 0);

  return { slice, rest };
}

function drawSharedDisciplineBanner(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  title: string,
  s: PdfScale
): number {
  doc.setFillColor(...C.primary);
  doc.roundedRect(x, y, width, s.bannerH, 1.2, 1.2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(s.tableTitleFont);
  doc.setTextColor(...C.white);
  const lines = doc.splitTextToSize(title.toUpperCase(), width - 2.4) as string[];
  doc.text(lines[0] || title, x + width / 2, y + s.bannerH * 0.68, { align: 'center' });

  return y + s.bannerH + sharedBannerGap(s);
}

function drawQuestionColumn(
  doc: jsPDF,
  x: number,
  y: number,
  colW: number,
  column: QuestionColumn,
  s: PdfScale,
  opts?: { omitBanner?: boolean }
): number {
  const omitBanner = Boolean(opts?.omitBanner);
  const letters = column.letters.length
    ? column.letters
    : questionAlternativeLetters(column.questoes);
  const nLetters = Math.max(letters.length, 1);
  const numW = Math.min(8, colW * 0.18);
  const gabW = Math.min(8, colW * 0.16);
  const lettersW = colW - numW - gabW;
  const letterCellW = lettersW / nLetters;
  const r = Math.min(s.circleR, letterCellW / 2 - 0.35, s.rowH / 2 - 0.55);
  const h = questionColumnHeight(column.questoes.length, s, !omitBanner);

  doc.setDrawColor(...C.border);
  doc.setFillColor(...C.white);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, colW, h, 1.2, 1.2, 'FD');

  let cy = y;

  if (!omitBanner) {
    doc.setFillColor(...C.primary);
    doc.roundedRect(x, y, colW, s.bannerH, 1.2, 1.2, 'F');
    doc.setFillColor(...C.primary);
    doc.rect(x, y + s.bannerH - 1.5, colW, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(s.tableTitleFont);
    doc.setTextColor(...C.white);
    const title = doc.splitTextToSize(column.disciplina.toUpperCase(), colW - 2) as string[];
    doc.text(title[0] || column.disciplina, x + colW / 2, y + s.bannerH * 0.68, {
      align: 'center',
    });
    cy = y + s.bannerH;
  }

  doc.setFillColor(...C.bgHeader);
  doc.rect(x, cy, colW, s.colHeaderH, 'F');
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.15);
  doc.line(x, cy + s.colHeaderH, x + colW, cy + s.colHeaderH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(Math.max(5.8, s.tableFont - 0.4));
  doc.setTextColor(...C.textGray);
  doc.text('#', x + numW / 2, cy + s.colHeaderH * 0.68, { align: 'center' });
  letters.forEach((letter, li) => {
    const lx = x + numW + li * letterCellW + letterCellW / 2;
    doc.text(letter, lx, cy + s.colHeaderH * 0.68, { align: 'center' });
  });
  doc.text('GAB', x + colW - gabW / 2, cy + s.colHeaderH * 0.68, { align: 'center' });
  cy += s.colHeaderH;

  for (const q of column.questoes) {
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.12);
    doc.line(x + 0.6, cy + s.rowH, x + colW - 0.6, cy + s.rowH);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(s.tableFont);
    doc.setTextColor(...C.textGray);
    doc.text(String(q.numero), x + numW / 2, cy + s.rowH / 2 + 0.9, { align: 'center' });

    letters.forEach((letter, li) => {
      const lx = x + numW + li * letterCellW + letterCellW / 2;
      drawCircle(doc, lx, cy + s.rowH / 2, r, getBoletimMarkStatus(q, letter));
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(s.tableFont);
    doc.setTextColor(...C.textDark);
    doc.text(
      String(q.gabarito || '—').toUpperCase(),
      x + colW - gabW / 2,
      cy + s.rowH / 2 + 0.9,
      { align: 'center' }
    );
    cy += s.rowH;
  }

  return y + h;
}

/**
 * Desenha uma faixa de até 4 colunas, centralizada.
 * Banner único só quando todas as colunas da faixa são da mesma disciplina.
 */
function drawQuestionColumnRow(
  doc: jsPDF,
  y: number,
  cols: QuestionColumn[],
  s: PdfScale
): number {
  if (!cols.length) return y;

  const nCols = cols.length;
  const sharedBanner = rowUsesSharedBanner(cols);
  const gap = gapForColumnCount(nCols, s);
  const colW = columnWidthForRow(nCols, s);
  const startX = centeredColumnsStartX(nCols, colW, gap, s);
  const blockW = nCols * colW + Math.max(0, nCols - 1) * gap;

  let cy = y;
  if (sharedBanner) {
    cy = drawSharedDisciplineBanner(doc, startX, cy, blockW, cols[0].disciplina, s);
  }

  let bottom = cy;
  cols.forEach((col, colIdx) => {
    const x = startX + colIdx * (colW + gap);
    const colBottom = drawQuestionColumn(doc, x, cy, colW, col, s, {
      omitBanner: sharedBanner,
    });
    bottom = Math.max(bottom, colBottom);
  });

  return bottom;
}

/** Cards de métricas. Em disciplina o nível se chama "NÍVEL"; no agregado final, "NÍVEL GERAL". */
function metricCards(cards: BoletimAlunoCards, opts?: { isGeral?: boolean }): MetricCardDef[] {
  return [
    {
      title: 'ACERTOS TOTAIS',
      value: `${cards.acertos_totais.acertou} / ${cards.acertos_totais.total}`,
      isNivel: false,
    },
    {
      title: 'NOTA',
      // null/undefined → "—" (compatível com backend sem cálculo por disciplina)
      value: formatDecimal1PtBr(cards.nota, '—'),
      isNivel: false,
    },
    {
      title: 'MÉDIA PROFICIÊNCIA',
      value: formatDecimal1PtBr(cards.proficiencia, '—'),
      isNivel: false,
    },
    {
      title: opts?.isGeral ? 'NÍVEL GERAL' : 'NÍVEL',
      value: cards.nivel || '—',
      isNivel: true,
    },
  ];
}

function resultsBlockHeight(s: PdfScale): number {
  return 5.5 + s.cardH + 1.5;
}

function drawMetricCardRow(
  doc: jsPDF,
  x: number,
  y: number,
  totalW: number,
  cards: BoletimAlunoCards,
  s: PdfScale,
  opts?: { isGeral?: boolean }
): number {
  const items = metricCards(cards, opts);
  const gap = 2.2;
  const cardW = (totalW - gap * (items.length - 1)) / items.length;
  const headerH = Math.max(5.2, s.cardH * 0.32);
  const bodyH = s.cardH - headerH;

  items.forEach((card, i) => {
    const cx = x + i * (cardW + gap);
    const nivelStyle = card.isNivel ? nivelValueStyle(card.value) : null;

    doc.setFillColor(230, 230, 235);
    doc.roundedRect(cx + 0.4, y + 0.5, cardW, s.cardH, 1.2, 1.2, 'F');

    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(cx, y, cardW, s.cardH, 1.2, 1.2, 'FD');

    // Cabeçalho sempre roxo (inclui NÍVEL / NÍVEL GERAL)
    doc.setFillColor(...C.primary);
    doc.roundedRect(cx, y, cardW, headerH, 1.2, 1.2, 'F');
    doc.setFillColor(...C.primary);
    doc.rect(cx, y + headerH - 1.4, cardW, 1.4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(s.cardLabelFont);
    doc.setTextColor(...C.white);
    const label = doc.splitTextToSize(card.title, cardW - 2) as string[];
    doc.text(label[0] || card.title, cx + cardW / 2, y + headerH * 0.68, {
      align: 'center',
    });

    if (nivelStyle) {
      doc.setFillColor(...nivelStyle.fill);
      doc.roundedRect(cx, y + headerH, cardW, bodyH, 1.2, 1.2, 'F');
      doc.setFillColor(...nivelStyle.fill);
      doc.rect(cx, y + headerH, cardW, 2, 'F');
      doc.setTextColor(...nivelStyle.text);
    } else {
      doc.setTextColor(...C.textDark);
    }

    doc.setFont('helvetica', 'bold');
    let valueFont = s.cardValueFont;
    doc.setFontSize(valueFont);
    const maxW = cardW - 2.4;
    while (valueFont > 6.5 && doc.getTextWidth(card.value) > maxW) {
      valueFont -= 0.5;
      doc.setFontSize(valueFont);
    }
    const lines = (doc.splitTextToSize(card.value, maxW) as string[]).slice(0, 2);
    const lineStep = valueFont * 0.38;
    const blockH = (lines.length - 1) * lineStep;
    const valueY = y + headerH + bodyH / 2 - blockH / 2 + valueFont * 0.12;
    lines.forEach((line, li) => {
      doc.text(line || '—', cx + cardW / 2, valueY + li * lineStep, { align: 'center' });
    });
  });

  return y + s.cardH;
}

function drawLogos(
  doc: jsPDF,
  y: number,
  cityLogo: PdfImageAsset | null,
  platformLogo: PdfImageAsset | null,
  s: PdfScale
): number {
  const citySize = logoDrawSize(cityLogo, s);
  const platformSize = logoDrawSize(platformLogo, s);
  const hasCity = Boolean(cityLogo?.dataUrl && citySize.w > 0);
  const hasPlatform = Boolean(platformLogo?.dataUrl && platformSize.w > 0);

  if (!hasCity && !hasPlatform) return y;

  if (hasCity && hasPlatform) {
    const bandH = Math.max(citySize.h, platformSize.h);
    doc.addImage(
      cityLogo!.dataUrl,
      'PNG',
      s.margin,
      y + (bandH - citySize.h) / 2,
      citySize.w,
      citySize.h
    );
    doc.addImage(
      platformLogo!.dataUrl,
      'PNG',
      PAGE_W - s.margin - platformSize.w,
      y + (bandH - platformSize.h) / 2,
      platformSize.w,
      platformSize.h
    );
    return y + bandH + 3;
  }

  const only = hasCity ? cityLogo! : platformLogo!;
  const size = hasCity ? citySize : platformSize;
  doc.addImage(only.dataUrl, 'PNG', (PAGE_W - size.w) / 2, y, size.w, size.h);
  return y + size.h + 3;
}

function drawFullHeader(
  doc: jsPDF,
  item: BoletimAlunoItem,
  avaliacaoNome: string,
  labels: BoletimAlunoPdfLabels,
  cityLogo: PdfImageAsset | null,
  platformLogo: PdfImageAsset | null,
  s: PdfScale
): number {
  let y = s.startY;
  y = drawLogos(doc, y, cityLogo, platformLogo, s);

  const centerX = PAGE_W / 2;
  const maxMetaW = usableWidth(s);

  if (labels.municipio && labels.municipio !== 'all') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(s.metaFont + 0.8);
    doc.setTextColor(...C.textDark);
    const pref = `PREFEITURA MUNICIPAL DE ${String(labels.municipio).toUpperCase()}`;
    const prefLines = doc.splitTextToSize(pref, maxMetaW) as string[];
    doc.text(prefLines[0] || pref, centerX, y, { align: 'center' });
    y += s.metaLineH + 0.6;
  }

  const metaPairs: Array<[string, string]> = [
    ['AVALIAÇÃO', avaliacaoNome || labels.avaliacao || '—'],
    ['ESCOLA', item.aluno.escola || labels.escola || '—'],
  ];

  doc.setFontSize(s.metaFont);
  for (const [k, v] of metaPairs) {
    const label = `${k}: `;
    doc.setFont('helvetica', 'bold');
    const lw = doc.getTextWidth(label);
    const valueText = String(v || '—').toUpperCase();
    doc.setFont('helvetica', 'normal');
    const vw = doc.getTextWidth(valueText);
    const startX = centerX - (lw + vw) / 2;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.textGray);
    doc.text(label, startX, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.textDark);
    doc.text(valueText, startX + lw, y);
    y += s.metaLineH;
  }

  // SÉRIE | TURMA | MATRÍCULA na mesma linha
  {
    const parts: Array<[string, string]> = [
      ['SÉRIE', item.aluno.serie || labels.serie || '—'],
      ['TURMA', item.aluno.turma || labels.turma || '—'],
    ];
    if (item.aluno.matricula) {
      parts.push(['MATRÍCULA', item.aluno.matricula]);
    }

    const gapBetween = 10;
    const segments: Array<{ label: string; value: string; labelW: number; valueW: number }> = [];
    let totalW = 0;
    parts.forEach(([k, v], idx) => {
      const label = `${k}: `;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(s.metaFont);
      const labelW = doc.getTextWidth(label);
      doc.setFont('helvetica', 'normal');
      const valueW = doc.getTextWidth(String(v || '—').toUpperCase());
      segments.push({ label, value: String(v || '—').toUpperCase(), labelW, valueW });
      totalW += labelW + valueW;
      if (idx < parts.length - 1) totalW += gapBetween;
    });

    let cursorX = centerX - totalW / 2;
    segments.forEach((seg, idx) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(s.metaFont);
      doc.setTextColor(...C.textGray);
      doc.text(seg.label, cursorX, y);
      cursorX += seg.labelW;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.textDark);
      doc.text(seg.value, cursorX, y);
      cursorX += seg.valueW;
      if (idx < segments.length - 1) cursorX += gapBetween;
    });
    y += s.metaLineH;
  }

  {
    const label = 'ALUNO: ';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(s.metaFont);
    const lw = doc.getTextWidth(label);
    const valueText = String(item.aluno.nome || labels.aluno || '—').toUpperCase();
    doc.setFont('helvetica', 'normal');
    const vw = doc.getTextWidth(valueText);
    const startX = centerX - (lw + vw) / 2;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.textGray);
    doc.text(label, startX, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.textDark);
    doc.text(valueText, startX + lw, y);
    y += s.metaLineH;
  }

  y += s.titleGap * 0.35;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(s.metaFont);
  doc.setTextColor(...C.textGray);
  doc.text('RELATÓRIO:', centerX, y, { align: 'center' });
  y += s.metaLineH + 0.4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(s.titleFont);
  doc.setTextColor(...C.primary);
  doc.text('BOLETIM DO ALUNO', centerX, y, { align: 'center' });
  y += s.titleGap + 1.5;

  return y;
}

function drawContinuationHeader(doc: jsPDF, item: BoletimAlunoItem, s: PdfScale): number {
  let y = s.startY;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(s.metaFont);
  doc.setTextColor(...C.primary);
  doc.text('RELATÓRIO: BOLETIM DO ALUNO (continuação)', PAGE_W / 2, y, {
    align: 'center',
  });
  y += s.metaLineH;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.textDark);
  doc.setFontSize(s.metaFont - 0.4);
  doc.text(String(item.aluno.nome || '').toUpperCase(), PAGE_W / 2, y, {
    align: 'center',
  });
  y += s.metaLineH + 1.5;
  return y;
}

function newPageWithContinuation(
  doc: jsPDF,
  item: BoletimAlunoItem,
  s: PdfScale
): number {
  doc.addPage();
  return drawContinuationHeader(doc, item, s);
}

function ensureSpaceWithContinuation(
  doc: jsPDF,
  y: number,
  needed: number,
  item: BoletimAlunoItem,
  s: PdfScale
): number {
  if (y + needed <= PAGE_H - s.footerReserve) return y;
  return newPageWithContinuation(doc, item, s);
}

function drawResultsSection(
  doc: jsPDF,
  y: number,
  item: BoletimAlunoItem,
  s: PdfScale
): number {
  const contentW = usableWidth(s);
  const blockH = resultsBlockHeight(s);
  let cy = y;

  const discs: Array<{ title: string; cards: BoletimAlunoCards }> = [];
  for (const bloco of item.por_disciplina ?? []) {
    const cards = resolveDisciplinaCards(bloco);
    if (!cards) continue;
    discs.push({ title: bloco.disciplina, cards });
  }

  for (const disc of discs) {
    cy = ensureSpaceWithContinuation(doc, cy, blockH, item, s);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(s.metaFont);
    doc.setTextColor(...C.textDark);
    doc.text(disc.title.toUpperCase(), PAGE_W / 2, cy + 3.5, { align: 'center' });
    cy += 5.5;
    cy = drawMetricCardRow(doc, s.margin, cy, contentW, disc.cards, s);
    cy += s.gap * 0.7;
  }

  cy = ensureSpaceWithContinuation(doc, cy, blockH, item, s);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(s.metaFont);
  doc.setTextColor(...C.textDark);
  doc.text('GERAL', PAGE_W / 2, cy + 3.5, { align: 'center' });
  cy += 5.5;
  cy = drawMetricCardRow(doc, s.margin, cy, contentW, item.cards, s, { isGeral: true });

  return cy;
}

function drawQuestionRows(
  doc: jsPDF,
  startY: number,
  item: BoletimAlunoItem,
  s: PdfScale
): number {
  const blocos = item.por_disciplina ?? [];

  // Achata colunas de todas as disciplinas e empacota em faixas de até 4.
  let queue: QuestionColumn[] = [];
  for (const bloco of blocos) {
    queue.push(...splitDisciplineToColumns(bloco));
  }

  let y = startY;
  let drewAny = false;

  while (queue.length) {
    const nTake = Math.min(GRID_COLS, queue.length);
    const rowPeek = queue.slice(0, nTake);
    const sharedBanner = rowUsesSharedBanner(rowPeek);
    const fullH = questionRowHeight(rowPeek, s, sharedBanner);
    let avail = PAGE_H - s.footerReserve - y;

    if (avail < Math.min(fullH, s.bannerH + s.colHeaderH + s.rowH + 4)) {
      y = newPageWithContinuation(doc, item, s);
      avail = PAGE_H - s.footerReserve - y;
    }

    if (fullH <= avail) {
      queue = queue.slice(nTake);
      y = drawQuestionColumnRow(doc, y, rowPeek, s);
      y += s.gap * 0.75;
      drewAny = true;
      continue;
    }

    let maxRows = maxRowsForRowAvail(avail, s, sharedBanner);
    if (maxRows < 1) {
      y = newPageWithContinuation(doc, item, s);
      avail = PAGE_H - s.footerReserve - y;
      maxRows = Math.max(1, maxRowsForRowAvail(avail, s, sharedBanner));
    }

    const { slice, rest } = takeRowSlice(rowPeek, maxRows);
    if (!slice.length) break;

    // Continuação destas colunas volta para o início da fila (mesma faixa).
    queue = [...rest, ...queue.slice(nTake)];
    y = drawQuestionColumnRow(doc, y, slice, s);
    y += s.gap * 0.75;
    drewAny = true;
  }

  if (!drewAny) {
    doc.setFontSize(8);
    doc.setTextColor(...C.textGray);
    doc.setFont('helvetica', 'normal');
    doc.text('Nenhuma questão neste boletim.', s.margin, y + 4);
    y += 10;
  }

  return y;
}

function drawStudentBoletim(
  doc: jsPDF,
  item: BoletimAlunoItem,
  avaliacaoNome: string,
  labels: BoletimAlunoPdfLabels,
  cityLogo: PdfImageAsset | null,
  platformLogo: PdfImageAsset | null,
  isFirstDocPage: boolean
): void {
  if (!isFirstDocPage) doc.addPage();

  const s = baseScale();
  let y = drawFullHeader(doc, item, avaliacaoNome, labels, cityLogo, platformLogo, s);
  y = drawQuestionRows(doc, y, item, s);
  y += s.gap * 0.4;
  y = ensureSpaceWithContinuation(doc, y, resultsBlockHeight(s), item, s);
  drawResultsSection(doc, y, item, s);
}

export async function generateBoletimAlunoPdf(options: {
  boletins: BoletimAlunoItem[];
  avaliacaoNome: string;
  labels: BoletimAlunoPdfLabels;
  cityId: string | null;
  flow: BoletimAlunoReportFlow;
}): Promise<void> {
  const { boletins, avaliacaoNome, labels, flow, cityId } = options;
  if (!boletins.length) throw new Error('Não há boletins para exportar.');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const dataGeracao = fmtNow();

  const [cityLogo, platformLogo] = await Promise.all([
    resolveReportLogoForPdf(cityId),
    loadDefaultReportLogoAsset(),
  ]);

  if (!platformLogo && !cityLogo) {
    console.warn(
      '[boletimAluno] nenhuma logo disponível — PDF será gerado sem logos no cabeçalho.'
    );
  }

  for (let i = 0; i < boletins.length; i++) {
    drawStudentBoletim(
      doc,
      boletins[i],
      avaliacaoNome,
      labels,
      cityLogo,
      platformLogo,
      i === 0
    );
  }

  addFooters(doc, dataGeracao, 11);

  const mode = flow === 'cartao' ? 'cartao' : 'online';
  const alunoPart =
    boletins.length === 1
      ? boletins[0].aluno.nome.replace(/[^\wÀ-ÿ]+/g, '-').slice(0, 40)
      : 'turma';
  doc.save(`boletim-aluno-${mode}-${alunoPart || 'relatorio'}.pdf`);
}
