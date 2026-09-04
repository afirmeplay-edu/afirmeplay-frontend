import { jsPDF } from 'jspdf';
import { loadCityBrandingForReportPdf, type PdfImageAsset } from '@/utils/pdfCityBranding';
import { formatDecimal1PtBr, formatPercent1PtBr } from '@/utils/numberFormat';
import { getBoletimMarkStatus, questionAlternativeLetters } from '@/utils/reports/boletimAlunoHelpers';
import type {
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

function pairDisciplinas(blocos: BoletimAlunoPorDisciplina[]): BoletimAlunoPorDisciplina[][] {
  if (blocos.length <= 1) return blocos.length ? [blocos] : [];
  const rows: BoletimAlunoPorDisciplina[][] = [];
  for (let i = 0; i < blocos.length; i += 2) {
    rows.push(blocos.slice(i, i + 2));
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
    margin: 12,
    rowH: lerp(6.2, 4.35, t),
    colWNum: lerp(11, 7.6, t),
    colWAlt: lerp(9, 6.05, t),
    colWGab: lerp(12, 8.2, t),
    circleR: lerp(1.7, 1.2, t),
    bannerH: lerp(6, 5, t),
    colHeaderH: lerp(6, 5, t),
    logoW: lerp(22, 14, t),
    logoMaxH: lerp(11, 7.2, t),
    startY: lerp(8, 4.2, t),
    titleFont: lerp(11, 9, t),
    titleGap: lerp(5.5, 4.0, t),
    metaFont: lerp(8, 6.4, t),
    metaLineH: lerp(4.35, 3.3, t),
    tableTitleFont: lerp(7, 5.8, t),
    tableFont: lerp(7, 5.7, t),
    cardH: lerp(17, 12.5, t),
    cardTitleFont: lerp(6.5, 5.4, t),
    cardValueFont: lerp(11, 8.4, t),
    gap: lerp(4, 2.6, t),
    footerReserve: 13,
  };
}

function tableWidth(nLetters: number, s: PdfScale): number {
  return s.colWNum + nLetters * s.colWAlt + s.colWGab;
}

function logoDrawSize(logo: PdfImageAsset | null, s: PdfScale): { w: number; h: number } {
  if (!logo || logo.iw <= 0 || logo.ih <= 0) return { w: 0, h: 0 };
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
  const logoBlock = h > 0 ? h + 2.2 : 0;
  return s.startY + logoBlock + s.titleGap + nMeta * s.metaLineH + 2.4;
}

function columnsForSlot(slotW: number, nLetters: number, nQuestoes: number, s: PdfScale): number {
  if (nQuestoes <= 0) return 1;
  const tw = tableWidth(nLetters, s);
  const nCols = Math.max(1, Math.floor((slotW + s.gap) / (tw + s.gap)));
  return Math.min(nCols, nQuestoes);
}

function blockHeight(nQuestoes: number, nLetters: number, slotW: number, s: PdfScale): number {
  if (nQuestoes <= 0) return s.bannerH + 8;
  const nCols = columnsForSlot(slotW, nLetters, nQuestoes, s);
  const rows = Math.ceil(nQuestoes / nCols);
  return s.bannerH + s.colHeaderH + rows * s.rowH;
}

function usableWidth(s: PdfScale): number {
  return PAGE_W - s.margin * 2;
}

function slotWidth(colsInRow: number, s: PdfScale): number {
  const uw = usableWidth(s);
  if (colsInRow <= 1) return uw;
  return (uw - s.gap * (colsInRow - 1)) / colsInRow;
}

function measureTablesHeight(blocos: BoletimAlunoPorDisciplina[], s: PdfScale): number {
  const rows = pairDisciplinas(blocos);
  let h = 0;
  rows.forEach((row, idx) => {
    const sw = slotWidth(row.length, s);
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
    const avail = PAGE_H - head - s.cardH - 3.5 - s.footerReserve;
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
  const extra = Math.max(0, targetW - base);
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
  width: number,
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

  const nCols = columnsForSlot(slotW, letters.length, questoes.length, s);
  const rowsPerCol = Math.ceil(questoes.length / nCols);
  const columns = chunk(questoes, rowsPerCol);
  const innerGap = s.gap;
  const colW = (slotW - innerGap * (columns.length - 1)) / columns.length;

  let bottom = y;
  columns.forEach((col, idx) => {
    const cx = x + idx * (colW + innerGap);
    const b = drawQuestionTable(doc, cx, y, bloco.disciplina, col, letters, colW, s);
    bottom = Math.max(bottom, b);
  });
  return bottom;
}

function drawCards(doc: jsPDF, y: number, item: BoletimAlunoItem, s: PdfScale): number {
  const gap = Math.min(4, s.gap + 0.6);
  const w = (PAGE_W - s.margin * 2 - gap * 3) / 4;
  const h = s.cardH;
  const cards = [
    {
      title: 'ACERTOS TOTAIS',
      value: `${item.cards.acertos_totais.acertou} / ${item.cards.acertos_totais.total}`,
      sub: formatPercent1PtBr(item.cards.acertos_totais.percentual),
    },
    { title: 'NOTA', value: formatDecimal1PtBr(item.cards.nota), sub: '' },
    { title: 'PROFICIÊNCIA', value: formatDecimal1PtBr(item.cards.proficiencia), sub: '' },
    { title: 'NÍVEL GERAL', value: item.cards.nivel || '—', sub: '' },
  ];

  cards.forEach((card, i) => {
    const x = s.margin + i * (w + gap);
    doc.setFillColor(...C.primary);
    doc.roundedRect(x, y, w, h, 0.9, 0.9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(s.cardTitleFont);
    doc.setTextColor(...C.white);
    doc.text(card.title, x + w / 2, y + h * 0.28, { align: 'center' });
    doc.setFontSize(s.cardValueFont);
    const valueY = card.sub ? y + h * 0.6 : y + h * 0.68;
    doc.text(String(card.value), x + w / 2, valueY, { align: 'center' });
    if (card.sub) {
      doc.setFontSize(Math.max(5.5, s.cardTitleFont));
      doc.setFont('helvetica', 'normal');
      doc.text(card.sub, x + w / 2, y + h * 0.84, { align: 'center' });
    }
  });
  return y + h;
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
  let y = s.startY;

  const logoSize = logoDrawSize(logo, s);
  if (logo?.dataUrl && logoSize.w > 0 && logoSize.h > 0) {
    doc.addImage(logo.dataUrl, 'PNG', PAGE_W / 2 - logoSize.w / 2, y, logoSize.w, logoSize.h);
    y += logoSize.h + 2.2;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(s.titleFont);
  doc.setTextColor(...C.primary);
  doc.text('BOLETIM DIAGNÓSTICO DO ALUNO', PAGE_W / 2, y, { align: 'center' });
  y += s.titleGap;

  doc.setFontSize(s.metaFont);
  for (const [k, v] of lines) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.textGray);
    const label = `${k}: `;
    const lw = doc.getTextWidth(label);
    doc.setTextColor(...C.textDark);
    doc.text(label, PAGE_W / 2 - 70, y);
    doc.setFont('helvetica', 'normal');
    const value = doc.splitTextToSize(String(v || '—').toUpperCase(), 148) as string[];
    doc.text(value[0] || '—', PAGE_W / 2 - 70 + lw, y);
    y += s.metaLineH;
  }

  y += 2.4;

  const blocos = item.por_disciplina ?? [];
  const rows = pairDisciplinas(blocos);

  rows.forEach((row, rowIdx) => {
    const sw = slotWidth(row.length, s);
    const rowH = Math.max(
      ...row.map((b) =>
        blockHeight(b.questoes?.length ?? 0, questionAlternativeLetters(b.questoes).length, sw, s)
      ),
      8
    );
    const isLast = rowIdx === rows.length - 1;
    const needed = rowH + (isLast ? 3 + s.cardH : 3);
    y = ensureSpace(doc, y, needed, s);

    row.forEach((bloco, colIdx) => {
      const x = s.margin + colIdx * (sw + s.gap);
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

  y = ensureSpace(doc, y, s.cardH, s);
  drawCards(doc, y, item, s);
}

export async function generateBoletimAlunoPdf(options: {
  boletins: BoletimAlunoItem[];
  avaliacaoNome: string;
  labels: BoletimAlunoPdfLabels;
  cityId: string | null;
  flow: BoletimAlunoReportFlow;
}): Promise<void> {
  const { boletins, avaliacaoNome, labels, cityId, flow } = options;
  if (!boletins.length) throw new Error('Não há boletins para exportar.');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const dataGeracao = fmtNow();
  const { logo } = await loadCityBrandingForReportPdf(cityId);

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
