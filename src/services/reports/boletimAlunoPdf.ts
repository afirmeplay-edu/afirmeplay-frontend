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
  accent: [28, 176, 246] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  border: [209, 213, 219] as [number, number, number],
  bgHeader: [243, 244, 246] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
};

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
  accent: boolean;
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

function questionColumnHeight(nQuestoes: number, s: PdfScale): number {
  return s.bannerH + s.colHeaderH + Math.max(0, nQuestoes) * s.rowH + 1.2;
}

function maxRowsForHeight(availH: number, s: PdfScale): number {
  const fixed = s.bannerH + s.colHeaderH + 1.2;
  if (availH <= fixed) return 0;
  return Math.max(1, Math.floor((availH - fixed) / s.rowH));
}

function continuationHeaderHeight(s: PdfScale): number {
  return s.startY + s.metaLineH * 2 + 1.5;
}

/**
 * Divide cada disciplina em colunas de no máximo `maxRows` questões,
 * balanceando o tamanho das partes.
 */
function splitDisciplineToColumns(
  bloco: BoletimAlunoPorDisciplina,
  maxRows: number
): QuestionColumn[] {
  const questoes = bloco.questoes ?? [];
  if (!questoes.length) return [];
  const letters = questionAlternativeLetters(questoes);
  const cap = Math.max(1, maxRows);
  const nParts = Math.ceil(questoes.length / cap);
  const partSize = Math.ceil(questoes.length / nParts);
  return chunk(questoes, partSize).map((part) => ({
    disciplina: bloco.disciplina,
    questoes: part,
    letters,
  }));
}

/**
 * Empacota colunas em faixas de até GRID_COLS, paginando quando a altura
 * da faixa não cabe na página atual.
 */
function paginateColumns(
  cols: QuestionColumn[],
  firstPageAvailH: number,
  continuationAvailH: number,
  s: PdfScale
): QuestionColumn[][] {
  if (!cols.length) return [];

  const rows: QuestionColumn[][] = [];
  let pending = [...cols];
  let page = 0;

  while (pending.length) {
    const avail = page === 0 ? firstPageAvailH : continuationAvailH;
    const maxRows = Math.max(1, maxRowsForHeight(avail, s));
    const pageCols: QuestionColumn[] = [];
    const nextPending: QuestionColumn[] = [];

    for (let i = 0; i < pending.length; i++) {
      const col = pending[i];
      if (pageCols.length >= GRID_COLS) {
        nextPending.push(...pending.slice(i));
        break;
      }
      if (col.questoes.length <= maxRows) {
        pageCols.push(col);
      } else {
        pageCols.push({
          disciplina: col.disciplina,
          questoes: col.questoes.slice(0, maxRows),
          letters: col.letters,
        });
        nextPending.push({
          disciplina: col.disciplina,
          questoes: col.questoes.slice(maxRows),
          letters: col.letters,
        });
        nextPending.push(...pending.slice(i + 1));
        break;
      }
    }

    if (!pageCols.length) {
      // Evita loop infinito: força ao menos uma coluna parcial.
      const col = pending[0];
      const forceRows = Math.max(1, maxRows);
      pageCols.push({
        disciplina: col.disciplina,
        questoes: col.questoes.slice(0, forceRows),
        letters: col.letters,
      });
      pending = [
        {
          disciplina: col.disciplina,
          questoes: col.questoes.slice(forceRows),
          letters: col.letters,
        },
        ...pending.slice(1),
      ].filter((c) => c.questoes.length > 0);
    } else {
      pending = nextPending.filter((c) => c.questoes.length > 0);
    }

    rows.push(pageCols);
    page += 1;
  }

  return rows;
}

function buildQuestionPageRows(
  blocos: BoletimAlunoPorDisciplina[],
  firstPageAvailH: number,
  continuationAvailH: number,
  s: PdfScale
): QuestionColumn[][] {
  const maxRowsFirst = Math.max(8, maxRowsForHeight(firstPageAvailH, s));
  const cols: QuestionColumn[] = [];
  for (const bloco of blocos) {
    cols.push(...splitDisciplineToColumns(bloco, maxRowsFirst));
  }
  return paginateColumns(cols, firstPageAvailH, continuationAvailH, s);
}

function drawQuestionColumn(
  doc: jsPDF,
  x: number,
  y: number,
  colW: number,
  column: QuestionColumn,
  s: PdfScale
): number {
  const letters = column.letters.length
    ? column.letters
    : questionAlternativeLetters(column.questoes);
  const nLetters = Math.max(letters.length, 1);
  const numW = Math.min(8, colW * 0.18);
  const gabW = Math.min(8, colW * 0.16);
  const lettersW = colW - numW - gabW;
  const letterCellW = lettersW / nLetters;
  const r = Math.min(s.circleR, letterCellW / 2 - 0.35, s.rowH / 2 - 0.55);
  const h = questionColumnHeight(column.questoes.length, s);

  doc.setDrawColor(...C.border);
  doc.setFillColor(...C.white);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, colW, h, 1.2, 1.2, 'FD');

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

  let cy = y + s.bannerH;

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

function metricCards(cards: BoletimAlunoCards): MetricCardDef[] {
  return [
    {
      title: 'ACERTOS TOTAIS',
      value: `${cards.acertos_totais.acertou} / ${cards.acertos_totais.total}`,
      accent: false,
    },
    {
      title: 'NOTA',
      value: formatDecimal1PtBr(cards.nota, '—'),
      accent: false,
    },
    {
      title: 'MÉDIA PROFICIÊNCIA',
      value: formatDecimal1PtBr(cards.proficiencia, '—'),
      accent: false,
    },
    {
      title: 'NÍVEL GERAL',
      value: cards.nivel || '—',
      accent: true,
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
  s: PdfScale
): number {
  const items = metricCards(cards);
  const gap = 2.2;
  const cardW = (totalW - gap * (items.length - 1)) / items.length;
  const headerH = Math.max(5.2, s.cardH * 0.32);
  const bodyH = s.cardH - headerH;

  items.forEach((card, i) => {
    const cx = x + i * (cardW + gap);
    const headerColor = card.accent ? C.accent : C.primary;

    doc.setFillColor(230, 230, 235);
    doc.roundedRect(cx + 0.4, y + 0.5, cardW, s.cardH, 1.2, 1.2, 'F');

    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(cx, y, cardW, s.cardH, 1.2, 1.2, 'FD');

    doc.setFillColor(...headerColor);
    doc.roundedRect(cx, y, cardW, headerH, 1.2, 1.2, 'F');
    doc.setFillColor(...headerColor);
    doc.rect(cx, y + headerH - 1.4, cardW, 1.4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(s.cardLabelFont);
    doc.setTextColor(...C.white);
    const label = doc.splitTextToSize(card.title, cardW - 2) as string[];
    doc.text(label[0] || card.title, cx + cardW / 2, y + headerH * 0.68, {
      align: 'center',
    });

    if (card.accent) {
      doc.setFillColor(...C.accent);
      doc.roundedRect(cx, y + headerH, cardW, bodyH, 1.2, 1.2, 'F');
      doc.setFillColor(...C.accent);
      doc.rect(cx, y + headerH, cardW, 2, 'F');
      doc.setTextColor(...C.white);
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
    ['SÉRIE', item.aluno.serie || labels.serie || '—'],
    ['TURMA', item.aluno.turma || labels.turma || '—'],
    ['ALUNO', item.aluno.nome || labels.aluno || '—'],
  ];
  if (item.aluno.matricula) {
    metaPairs.push(['MATRÍCULA', item.aluno.matricula]);
  }

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

  y += s.titleGap * 0.4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(s.titleFont);
  doc.setTextColor(...C.primary);
  doc.text('RELATÓRIO: BOLETIM DO ALUNO', centerX, y, { align: 'center' });
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
    doc.text(disc.title.toUpperCase(), s.margin, cy + 3.5);
    cy += 5.5;
    cy = drawMetricCardRow(doc, s.margin, cy, contentW, disc.cards, s);
    cy += s.gap * 0.7;
  }

  cy = ensureSpaceWithContinuation(doc, cy, blockH, item, s);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(s.metaFont);
  doc.setTextColor(...C.textDark);
  doc.text('GERAL', s.margin, cy + 3.5);
  cy += 5.5;
  cy = drawMetricCardRow(doc, s.margin, cy, contentW, item.cards, s);

  return cy;
}

function drawQuestionRows(
  doc: jsPDF,
  startY: number,
  item: BoletimAlunoItem,
  s: PdfScale
): number {
  const blocos = item.por_disciplina ?? [];
  const nDiscWithCards = blocos.filter((b) => resolveDisciplinaCards(b)).length;
  const resultsReserve = Math.min(
    (nDiscWithCards + 1) * resultsBlockHeight(s) + s.gap,
    72
  );

  const firstAvail = Math.max(
    40,
    PAGE_H - startY - s.footerReserve - resultsReserve - s.gap
  );
  const contAvail = Math.max(
    50,
    PAGE_H - continuationHeaderHeight(s) - s.footerReserve - 4
  );

  const rows = buildQuestionPageRows(blocos, firstAvail, contAvail, s);
  let y = startY;
  const colW = columnWidth(s);

  rows.forEach((rowCols, rowIdx) => {
    const rowH = Math.max(
      ...rowCols.map((c) => questionColumnHeight(c.questoes.length, s)),
      10
    );

    if (rowIdx === 0) {
      if (y + rowH > PAGE_H - s.footerReserve) {
        y = newPageWithContinuation(doc, item, s);
      }
    } else {
      y = newPageWithContinuation(doc, item, s);
    }

    rowCols.forEach((col, colIdx) => {
      const x = s.margin + colIdx * (colW + s.colGap);
      drawQuestionColumn(doc, x, y, colW, col, s);
    });

    y += rowH + s.gap * 0.6;
  });

  if (!rows.length) {
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
