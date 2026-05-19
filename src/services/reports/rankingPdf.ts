/**
 * PDF do ranking (avaliações ou cartão-resposta) — capa e identidade alinhadas
 * ao padrão dos relatórios institucionais; tabela com listras, medalhas no top 3
 * e tags coloridas de proficiência (cores coerentes com Relatório Escolar).
 */
import { jsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';
import { urlToPngAsset } from '@/utils/pdfCityBranding';
import type { RankingFilters, RankingResponse, RankingType } from '@/services/reports/rankingApi';
import {
  normalizeProficiencyLevelLabel,
  type ReportProficiencyLabel,
} from '@/utils/report/reportTagStyles';

const C = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  borderLight: [229, 231, 235] as [number, number, number],
  bgLight: [250, 250, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
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

function fmtPtNum(value: unknown, digits = 1): string {
  return Number(value || 0).toFixed(digits).replace('.', ',');
}

function formatParticipation(rate: unknown, participating: unknown, total: unknown): string {
  return `${fmtPtNum(rate)}% (${Number(participating || 0)}/${Number(total || 0)})`;
}

function formatAdequadoAvancado(count: unknown, pct: unknown): string {
  return `${Number(count ?? 0)} alunos · ${fmtPtNum(pct)}%`;
}

function scaledSize(iw: number, ih: number, desiredW: number): { w: number; h: number } {
  if (iw <= 0 || ih <= 0) return { w: desiredW, h: desiredW * 0.3 };
  return { w: desiredW, h: (ih * desiredW) / iw };
}

function addFootersAllPages(doc: jsPDF): void {
  const total = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textGray);
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
    doc.text('Afirme Play Soluções Educativas', margin, pageH - 9);
    doc.text(`Página ${i} de ${total}`, pageW / 2, pageH - 9, { align: 'center' });
    doc.text(fmtNow(), pageW - margin, pageH - 9, { align: 'right' });
  }
}

/** Cores da “tag” de proficiência (equivalentes visuais ao Tailwind dos relatórios). */
function proficiencyTagStyles(level: ReportProficiencyLabel): {
  fill: [number, number, number];
  text: [number, number, number];
} {
  switch (level) {
    case 'Avançado':
      return { fill: [167, 243, 208], text: [6, 78, 59] };
    case 'Adequado':
      return { fill: [209, 250, 229], text: [22, 101, 52] };
    case 'Básico':
      return { fill: [254, 249, 195], text: [113, 63, 18] };
    case 'Abaixo do Básico':
    default:
      return { fill: [254, 226, 226], text: [153, 27, 27] };
  }
}

function positionHighlight(pos: number): {
  fill: [number, number, number];
  text: [number, number, number];
} | null {
  if (pos === 1) return { fill: [254, 243, 199], text: [120, 53, 15] };
  if (pos === 2) return { fill: [229, 231, 235], text: [55, 65, 81] };
  if (pos === 3) return { fill: [255, 237, 213], text: [154, 52, 18] };
  return null;
}

function drawFiltersCard(
  doc: jsPDF,
  margin: number,
  pageW: number,
  titleY: number,
  filterLines: string[]
): number {
  const cardPad = 5;
  const innerW = pageW - 2 * margin;
  const lineGap = 4.2;
  const titleLineH = 6;
  const bodyH = filterLines.reduce((acc, line) => {
    const wrapped = doc.splitTextToSize(line, innerW - 18 - cardPad * 2) as string[];
    return acc + wrapped.length * lineGap;
  }, 0);
  const cardH = titleLineH + bodyH + cardPad * 2 + 4;
  const yTop = titleY;

  doc.setFillColor(...C.white);
  doc.rect(margin, yTop, innerW, cardH, 'F');
  doc.setFillColor(...C.primary);
  doc.rect(margin, yTop, 3.5, cardH, 'F');
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.35);
  doc.rect(margin, yTop, innerW, cardH, 'S');

  let cy = yTop + cardPad + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.primary);
  doc.text('Filtros aplicados', margin + 10, cy);
  cy += titleLineH + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.textDark);
  for (const line of filterLines) {
    const wrapped = doc.splitTextToSize(line, innerW - 18 - cardPad * 2) as string[];
    doc.text(wrapped, margin + 10, cy);
    cy += wrapped.length * lineGap;
  }

  return yTop + cardH + 10;
}

function drawClassificationLegend(doc: jsPDF, margin: number, pageW: number, startY: number): number {
  const levels: ReportProficiencyLabel[] = ['Avançado', 'Adequado', 'Básico', 'Abaixo do Básico'];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.textGray);
  doc.text('Classificação (níveis de aprendizagem):', margin, startY);

  let x = margin;
  const yChip = startY + 5;
  const chipH = 4.8;
  const gap = 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);

  for (const level of levels) {
    const { fill, text } = proficiencyTagStyles(level);
    const labelShort =
      level === 'Abaixo do Básico' ? 'Abaixo bás.' : level;
    const wText = doc.getTextWidth(labelShort) + 5;
    const chipW = 3 + wText;

    doc.setFillColor(...fill);
    doc.setDrawColor(...borderFromFill(fill));
    doc.setLineWidth(0.2);
    doc.rect(x, yChip, chipW, chipH, 'FD');

    doc.setTextColor(...text);
    doc.text(labelShort, x + 2.2, yChip + chipH / 2 + 1.35);

    x += chipW + gap + 4;
  }

  return yChip + chipH + 8;
}

function ensurePageSpace(doc: jsPDF, y: number, needed: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  const bottomReserved = 20;
  if (y + needed <= pageH - bottomReserved) return y;
  doc.addPage();
  return margin + 1;
}

function ensureSectionWithTableSpace(
  doc: jsPDF,
  y: number,
  margin: number,
  minRows = 1
): number {
  const estimated = 44 + Math.max(1, minRows) * 10;
  return ensurePageSpace(doc, y, estimated, margin);
}

type KpiCardItem = {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'critical' | 'primary';
};

function drawKpiCards(
  doc: jsPDF,
  margin: number,
  pageW: number,
  startY: number,
  items: KpiCardItem[]
): number {
  if (!items.length) return startY;
  const cols = items.length >= 4 ? 4 : Math.min(3, Math.max(1, items.length));
  const gap = 4;
  const cardW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
  let y = startY;
  for (let idx = 0; idx < items.length; idx += cols) {
    const rowItems = items.slice(idx, idx + cols);
    const measured = rowItems.map((item) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      const labelLines = doc.splitTextToSize(item.label, cardW - 6) as string[];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.8);
      const valueLines = doc.splitTextToSize(item.value, cardW - 6) as string[];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      const hintLines = item.hint ? (doc.splitTextToSize(item.hint, cardW - 6) as string[]) : [];
      const height = 8 + labelLines.length * 3.2 + valueLines.length * 4.1 + hintLines.length * 3 + 4;
      return { item, labelLines, valueLines, hintLines, height: Math.max(22, height) };
    });
    const rowHeight = Math.max(...measured.map((m) => m.height));
    y = ensurePageSpace(doc, y, rowHeight + 2, margin);
    measured.forEach((m, col) => {
      const x = margin + col * (cardW + gap);
      const tone = m.item.tone ?? 'default';
      if (tone === 'critical') doc.setFillColor(255, 241, 242);
      else if (tone === 'primary') doc.setFillColor(245, 243, 255);
      else doc.setFillColor(...C.bgLight);
      doc.setDrawColor(...C.borderLight);
      doc.setLineWidth(0.25);
      doc.roundedRect(x, y, cardW, rowHeight, 1.8, 1.8, 'FD');
      if (tone === 'critical') doc.setTextColor(127, 29, 29);
      else doc.setTextColor(...C.textGray);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.text(m.labelLines, x + 3, y + 5);
      let ty = y + 5 + m.labelLines.length * 3.2 + 1;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.textDark);
      doc.setFontSize(9.8);
      doc.text(m.valueLines, x + 3, ty);
      ty += m.valueLines.length * 4.1 + 1;
      if (m.hintLines.length) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C.textGray);
        doc.setFontSize(6.8);
        doc.text(m.hintLines, x + 3, ty);
      }
    });
    y += rowHeight + gap;
  }
  return y + 2;
}

function drawCourseMiniChart(
  doc: jsPDF,
  margin: number,
  pageW: number,
  startY: number,
  title: string,
  rows: Array<{ school_name?: unknown; average_score?: unknown; average_proficiency?: unknown }>,
  targetScore = 7
): number {
  const data = rows.slice(0, 8);
  if (!data.length) return startY;
  const axisFoot = 7;
  const chartH = 12 + data.length * 9.2 + axisFoot;
  const chartW = pageW - margin * 2;
  const x = margin;
  const yTop = startY;
  doc.setFillColor(...C.white);
  doc.setDrawColor(...C.borderLight);
  doc.roundedRect(x, yTop, chartW, chartH, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.setTextColor(...C.textDark);
  doc.text(title, x + 3, yTop + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...C.textGray);
  doc.text(`Meta ${fmtPtNum(targetScore)} · escala 0–10`, x + 3, yTop + 9);
  const plotTop = yTop + 12;
  const labelW = 52;
  const metricsW = 28;
  const barMaxW = chartW - labelW - metricsW - 12;
  const targetX = x + labelW + barMaxW * (Math.max(0, Math.min(10, targetScore)) / 10);
  const chartBottom = plotTop + data.length * 8.2 + 4;
  doc.setDrawColor(...C.primary);
  doc.setLineWidth(0.35);
  if (typeof doc.setLineDashPattern === 'function') {
    doc.setLineDashPattern([1.5, 1.2], 0);
  }
  doc.line(targetX, plotTop - 1, targetX, chartBottom);
  if (typeof doc.setLineDashPattern === 'function') {
    doc.setLineDashPattern([], 0);
  }
  data.forEach((row, idx) => {
    const ry = plotTop + idx * 8.2;
    const school = String(row.school_name || 'Escola');
    const truncated = school.length > 30 ? `${school.slice(0, 30)}…` : school;
    const score = Number(row.average_score || 0);
    const prof = Number(row.average_proficiency || 0);
    const normalized = Math.max(0, Math.min(10, score)) / 10;
    const barW = barMaxW * normalized;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.textDark);
    doc.text(truncated, x + 3, ry + 3.4);
    doc.setFillColor(235, 236, 240);
    doc.roundedRect(x + labelW, ry, barMaxW, 4.2, 0.8, 0.8, 'F');
    doc.setFillColor(...C.primary);
    doc.roundedRect(x + labelW, ry, barW, 4.2, 0.8, 0.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...C.primary);
    doc.text(fmtPtNum(score), x + labelW + barMaxW + 2, ry + 2.2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.textGray);
    doc.text(`Prof. ${fmtPtNum(prof)}`, x + labelW + barMaxW + 2, ry + 5.2);
  });
  const axisY = chartBottom + 2.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(...C.textGray);
  [0, 2, 4, 6, 8, 10].forEach((tick) => {
    const tx = x + labelW + (barMaxW * tick) / 10;
    doc.text(String(tick), tx, axisY, { align: 'center' });
  });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('Nota média →', x + labelW + barMaxW / 2, axisY + 3.2, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.text('Escolas', x + 2, plotTop + (chartBottom - plotTop) / 2, { angle: 90 });
  let y = yTop + chartH;
  y = drawChartLegend(doc, margin, pageW, y, [
    { kind: 'bar', label: 'Nota média da escola (0–10)', color: C.primary },
    { kind: 'line', label: `Meta institucional (${fmtPtNum(targetScore)})` },
    { kind: 'text', label: 'Valores à direita: nota (roxo) e proficiência (cinza)' },
  ]);
  return y + 4;
}

type ChartLegendItem = {
  kind: 'bar' | 'line' | 'text';
  label: string;
  color?: [number, number, number];
};

function drawChartLegend(
  doc: jsPDF,
  margin: number,
  pageW: number,
  startY: number,
  items: ChartLegendItem[]
): number {
  if (!items.length) return startY;
  const innerW = pageW - margin * 2;
  const pad = 3;
  const rowH = 5.2;
  const boxH = pad * 2 + items.length * rowH;
  const y = startY;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, y, innerW, boxH, 1.2, 1.2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...C.textGray);
  doc.text('Legenda do gráfico', margin + pad, y + pad + 2.5);
  let cy = y + pad + 5.5;
  items.forEach((item) => {
    const iconX = margin + pad;
    if (item.kind === 'bar') {
      doc.setFillColor(...(item.color || C.primary));
      doc.roundedRect(iconX, cy - 2.6, 6, 3.2, 0.6, 0.6, 'F');
    } else if (item.kind === 'line') {
      doc.setDrawColor(...(item.color || C.primary));
      doc.setLineWidth(0.45);
      if (typeof doc.setLineDashPattern === 'function') {
        doc.setLineDashPattern([1.2, 1], 0);
      }
      doc.line(iconX, cy - 1.2, iconX + 6, cy - 1.2);
      if (typeof doc.setLineDashPattern === 'function') {
        doc.setLineDashPattern([], 0);
      }
    } else {
      doc.setFillColor(...C.textGray);
      doc.circle(iconX + 3, cy - 1.2, 0.8, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.textDark);
    doc.text(item.label, iconX + 8.5, cy);
    cy += rowH;
  });
  return y + boxH + 3;
}

function drawTableCaption(
  doc: jsPDF,
  margin: number,
  pageW: number,
  startY: number,
  caption: string,
  legendLines: string[]
): number {
  let y = ensurePageSpace(doc, startY, 14 + legendLines.length * 3.6, margin);
  const innerW = pageW - margin * 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(...C.textDark);
  doc.text(caption, margin, y);
  y += 4.5;
  if (legendLines.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.textGray);
    legendLines.forEach((line) => {
      const wrapped = doc.splitTextToSize(`• ${line}`, innerW) as string[];
      doc.text(wrapped, margin, y);
      y += wrapped.length * 3.4 + 0.6;
    });
  }
  return y + 2;
}

type ReportIndexEntry = {
  number: number;
  title: string;
  description?: string;
  page: number;
};

function drawDottedLeader(
  doc: jsPDF,
  x1: number,
  x2: number,
  y: number
): void {
  if (x2 <= x1) return;
  doc.setDrawColor(210, 214, 220);
  doc.setLineWidth(0.25);
  if (typeof doc.setLineDashPattern === 'function') {
    doc.setLineDashPattern([0.8, 1.2], 0);
  }
  doc.line(x1, y, x2, y);
  if (typeof doc.setLineDashPattern === 'function') {
    doc.setLineDashPattern([], 0);
  }
}

function drawReportIndex(
  doc: jsPDF,
  margin: number,
  pageW: number,
  startY: number,
  entries: ReportIndexEntry[]
): number {
  const innerW = pageW - margin * 2;
  const pad = 5;
  const rowH = 11;
  const headerH = 14;
  const cardH = headerH + pad + Math.max(1, entries.length) * rowH + pad;
  const yTop = startY;

  doc.setFillColor(...C.white);
  doc.roundedRect(margin, yTop, innerW, cardH, 2, 2, 'F');
  doc.setFillColor(...C.primary);
  doc.rect(margin, yTop, innerW, 3, 'F');
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.35);
  doc.roundedRect(margin, yTop, innerW, cardH, 2, 2, 'S');

  let cy = yTop + pad + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.primary);
  doc.text('Sumário', margin + pad, cy);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...C.textGray);
  doc.text('Clique no item para ir à seção (leitores compatíveis).', margin + pad + 42, cy);
  cy += headerH - 4;

  entries.forEach((entry, idx) => {
    const rowY = cy + idx * rowH;
    const rowTop = rowY - 6;
    if (idx % 2 === 0) {
      doc.setFillColor(250, 250, 252);
      doc.rect(margin + 1.5, rowTop, innerW - 3, rowH - 0.5, 'F');
    }

    const badgeR = 3.2;
    const badgeCx = margin + pad + badgeR;
    const badgeCy = rowY - 1.5;
    doc.setFillColor(...C.primary);
    doc.circle(badgeCx, badgeCy, badgeR, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.white);
    doc.text(String(entry.number), badgeCx, badgeCy + 0.8, { align: 'center' });

    const titleX = margin + pad + 9;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.6);
    doc.setTextColor(...C.textDark);
    doc.text(entry.title, titleX, rowY);

    if (entry.description) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(...C.textGray);
      doc.text(entry.description, titleX, rowY + 3.6);
    }

    const pageLabel = `pág. ${entry.page}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...C.primary);
    const pageWText = doc.getTextWidth(pageLabel);
    const pageX = margin + innerW - pad - pageWText;
    const leaderY = entry.description ? rowY + 1.2 : rowY - 0.5;
    const leaderStart = titleX + Math.min(doc.getTextWidth(entry.title) + 2, innerW * 0.45);
    drawDottedLeader(doc, leaderStart, pageX - 2, leaderY);
    doc.text(pageLabel, pageX, rowY);

    const linkH = entry.description ? 9 : 6;
    if (typeof doc.link === 'function') {
      doc.link(margin + 1.5, rowTop, innerW - 3, linkH, { pageNumber: entry.page });
    }
  });

  return yTop + cardH + 8;
}

function drawTabSectionHeader(
  doc: jsPDF,
  margin: number,
  pageW: number,
  y: number,
  sectionNumber: number,
  title: string,
  subtitle?: string
): number {
  const innerW = pageW - margin * 2;
  const headerH = subtitle ? 15 : 12;
  doc.setFillColor(...C.primary);
  doc.roundedRect(margin, y, innerW, headerH, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(230, 220, 255);
  doc.text(`SEÇÃO ${sectionNumber}`, margin + 4, y + 4.8);
  doc.setFontSize(11.5);
  doc.setTextColor(...C.white);
  doc.text(title, margin + 4, y + (subtitle ? 9.5 : 9));
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(235, 230, 255);
    const subLines = doc.splitTextToSize(subtitle, innerW - 8) as string[];
    doc.text(subLines, margin + 4, y + 12.8);
  }
  return y + headerH + 7;
}

function borderFromFill(fill: [number, number, number]): [number, number, number] {
  const [r, g, b] = fill;
  return [Math.max(0, r - 35), Math.max(0, g - 35), Math.max(0, b - 35)] as [
    number,
    number,
    number,
  ];
}

async function addRankingCoverPage(
  doc: jsPDF,
  titleBand: string,
  subtitleBand: string,
  mainTitle: string,
  mainSubtitle: string,
  cardLines: Array<{ label: string; value: string }>
): Promise<void> {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const centerX = pageW / 2;
  const BAND_H = 62;

  doc.setFillColor(...C.white);
  doc.rect(0, 0, pageW, pageH, 'F');

  doc.setFillColor(...C.primary);
  doc.rect(0, 0, pageW, BAND_H, 'F');
  doc.setFillColor(...C.white);
  doc.setLineWidth(0.15);
  doc.setDrawColor(255, 255, 255);
  doc.line(18, BAND_H - 1, pageW - 18, BAND_H - 1);

  let logoBottomInBand = 0;
  const logoAsset = await urlToPngAsset('/LOGO-1.png');
  if (logoAsset?.dataUrl && logoAsset.iw > 0 && logoAsset.ih > 0) {
    const { w, h } = scaledSize(logoAsset.iw, logoAsset.ih, 40);
    doc.addImage(logoAsset.dataUrl, 'PNG', centerX - w / 2, 8, w, h);
    logoBottomInBand = 8 + h;
  } else {
    doc.setFontSize(18);
    doc.setTextColor(...C.white);
    doc.setFont('helvetica', 'bold');
    doc.text('AFIRME PLAY', centerX, 24, { align: 'center' });
    logoBottomInBand = 30;
  }

  const titleY = Math.max(logoBottomInBand + 6, BAND_H - 16);
  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(titleBand, centerX, titleY, { align: 'center' });
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'normal');
  const subLinesBand = doc.splitTextToSize(subtitleBand, pageW - 50) as string[];
  doc.text(subLinesBand, centerX, titleY + 7, { align: 'center' });

  let y = BAND_H + 14;
  const locLine = cardLines
    .filter((l) => l.label === 'ESTADO' || l.label === 'MUNICÍPIO')
    .map((l) => l.value)
    .filter((v) => v && v.trim() && v !== 'Todos');
  if (locLine.length) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.primary);
    doc.text(locLine.join(' — ').toUpperCase(), centerX, y, { align: 'center' });
    y += 8;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.textGray);
  doc.text('SECRETARIA MUNICIPAL DE EDUCAÇÃO', centerX, y, { align: 'center' });
  y += 16;

  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.textDark);
  doc.text(mainTitle, centerX, y, { align: 'center' });
  y += 14;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.textDark);
  const subMain = doc.splitTextToSize(mainSubtitle, pageW - 50) as string[];
  doc.text(subMain, centerX, y, { align: 'center' });
  y += subMain.length * 7.5 + 20;

  const cardW = pageW - 72;
  const cardX = (pageW - cardW) / 2;
  const rowH = 7;
  let cardEstimateH = 28;
  for (const { value } of cardLines) {
    const wrapped = doc.splitTextToSize(value, cardW - 74) as string[];
    cardEstimateH += Math.max(rowH, wrapped.length * 4.8);
  }
  const cardH = Math.max(cardEstimateH, 72);

  doc.setFillColor(...C.bgLight);
  doc.rect(cardX, y, cardW, cardH, 'F');
  const ACCENT_W = 5;
  doc.setFillColor(...C.primary);
  doc.rect(cardX, y, ACCENT_W, cardH, 'F');
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.45);
  doc.rect(cardX, y, cardW, cardH, 'S');

  let cy = y + 14;
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.primary);
  const cardContentCenterX = cardX + ACCENT_W + (cardW - ACCENT_W) / 2;
  doc.text('INFORMAÇÕES DO RELATÓRIO', cardContentCenterX, cy, { align: 'center' });
  cy += 7;
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.25);
  doc.line(cardX + ACCENT_W + 6, cy, cardX + cardW - 6, cy);
  cy += 11;

  const labelX = cardX + ACCENT_W + 14;
  const valueX = cardX + 72;
  const maxValueW = cardW - 78;
  doc.setFontSize(8.8);
  for (const { label, value } of cardLines) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.primary);
    doc.text(`${label}:`, labelX, cy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.textDark);
    const vLines = doc.splitTextToSize(value, maxValueW) as string[];
    doc.text(vLines, valueX, cy);
    cy += Math.max(rowH, vLines.length * 4.9);
  }
}

export type RankingPdfContext = 'avaliacoes' | 'cartao-resposta';

export type RankingPdfFilterLabels = {
  estado: string;
  municipio: string;
  escola: string;
  serie: string;
  turma: string;
};

export type RankingPdfStudentInput = {
  nome: string;
  turma?: string;
  escola?: string;
  serie?: string;
  nota: number;
  proficiencia: number;
  classificacao: string;
  status: 'concluida' | 'pendente';
  /** Posição no ranking quando a ordem vem do backend (`respectBackendRankingOrder`). */
  posicao?: number;
  questoes_respondidas?: number;
  acertos?: number;
  erros?: number;
  em_branco?: number;
};

function studentMatchesRankingList(s: RankingPdfStudentInput): boolean {
  const isCompleted = String(s.status || '').toLowerCase() === 'concluida';
  const hasAny =
    Number(s.questoes_respondidas ?? 0) > 0 ||
    Number(s.acertos ?? 0) > 0 ||
    Number(s.erros ?? 0) > 0 ||
    Number(s.em_branco ?? 0) > 0;
  return isCompleted && hasAny;
}

export type RankingPdfRowBuilt = {
  pos: number;
  nome: string;
  turma: string;
  escola: string;
  serie: string;
  nota: string;
  prof: string;
  classif: string;
  level: ReportProficiencyLabel;
};

function buildSortedRankingRows(
  students: RankingPdfStudentInput[],
  maxRows: number,
  respectBackendOrder: boolean
): RankingPdfRowBuilt[] {
  if (respectBackendOrder) {
    const list = [...students].sort((a, b) => (a.posicao ?? 999999) - (b.posicao ?? 999999));
    return list.slice(0, maxRows).map((s) => ({
      pos: s.posicao ?? 0,
      nome: (s.nome || '—').trim() || '—',
      turma: (s.turma || '—').trim() || '—',
      escola: (s.escola || '').trim() || '—',
      serie: (s.serie || '').trim() || '—',
      nota: Number(s.nota ?? 0).toFixed(1),
      prof: Number(s.proficiencia ?? 0).toFixed(1),
      classif: (s.classificacao || '—').trim() || '—',
      level: normalizeProficiencyLevelLabel(s.classificacao),
    }));
  }

  const list = students.filter(studentMatchesRankingList);
  list.sort((a, b) => (b.proficiencia || 0) - (a.proficiencia || 0));
  return list.slice(0, maxRows).map((s, i) => ({
    pos: i + 1,
    nome: (s.nome || '—').trim() || '—',
    turma: (s.turma || '—').trim() || '—',
    escola: (s.escola || '').trim() || '—',
    serie: (s.serie || '').trim() || '—',
    nota: Number(s.nota ?? 0).toFixed(1),
    prof: Number(s.proficiencia ?? 0).toFixed(1),
    classif: (s.classificacao || '—').trim() || '—',
    level: normalizeProficiencyLevelLabel(s.classificacao),
  }));
}

export async function generateRankingPdf(opts: {
  context: RankingPdfContext;
  /** Título da avaliação ou do gabarito, se houver */
  escopoTitulo?: string;
  filterLabels: RankingPdfFilterLabels;
  students: RankingPdfStudentInput[];
  maxRows?: number;
  fileNameBase?: string;
  /** Avaliação online: manter ordem e posição exatamente como o backend enviou no `ranking`. */
  respectBackendRankingOrder?: boolean;
}): Promise<void> {
  const { default: autoTable } = await import('jspdf-autotable');
  const maxRows = opts.maxRows ?? 100;
  const filters = opts.filterLabels;
  const rowModels = buildSortedRankingRows(
    opts.students,
    maxRows,
    opts.respectBackendRankingOrder === true
  );

  const contextSubtitle =
    opts.context === 'avaliacoes'
      ? 'Resultados de avaliações online'
      : 'Resultados de cartão-resposta';

  const escopo = (opts.escopoTitulo ?? '').trim();

  const cardLines: Array<{ label: string; value: string }> = [];
  if (opts.context === 'avaliacoes') {
    cardLines.push({ label: 'AVALIAÇÃO', value: escopo || '—' });
  } else {
    cardLines.push({ label: 'GABARITO', value: escopo || '—' });
  }
  cardLines.push(
    { label: 'ESTADO', value: filters.estado },
    { label: 'MUNICÍPIO', value: filters.municipio },
    { label: 'ESCOLA', value: filters.escola },
    { label: 'SÉRIE', value: filters.serie },
    { label: 'TURMA', value: filters.turma }
  );

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  await addRankingCoverPage(
    pdf,
    'RANKING DE DESEMPENHO',
    'Classificação por proficiência',
    'RANKING',
    contextSubtitle,
    cardLines
  );

  pdf.addPage();
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 15;
  let y = 16;

  const filterLinesDetailed = [
    `Estado: ${filters.estado}`,
    `Município: ${filters.municipio}`,
    `Escola: ${filters.escola}`,
    `Série: ${filters.serie}`,
    `Turma: ${filters.turma}`,
  ];
  y = drawFiltersCard(pdf, margin, pageW, y, filterLinesDetailed);

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.primary);
  pdf.text('Ranking dos melhores', margin, y);
  y += 5;
  pdf.setFontSize(8.8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.textGray);
  pdf.text(`Ordenação por proficiência decrescente — até ${maxRows} posições`, margin, y);
  y += 10;

  y = drawClassificationLegend(pdf, margin, pageW, y);

  const emptyPlaceholder = rowModels.length === 0;

  const head = [['Pos.', 'Nome', 'Turma', 'Escola', 'Série', 'Nota', 'Prof.', 'Classificação']];
  const body = emptyPlaceholder
    ? [['—', 'Nenhum participante no recorte atual', '', '', '', '', '', '']]
    : rowModels.map((r) => [
        ` ${r.pos}º `,
        r.nome,
        r.turma,
        r.escola,
        r.serie,
        r.nota,
        r.prof,
        r.level,
      ]);

  const tableOptions: UserOptions = {
    head,
    body,
    startY: y,
    theme: 'striped',
    showHead: 'everyPage',
    tableWidth: pageW - 2 * margin,
    margin: { left: margin, right: margin, bottom: 18 },
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: { top: 3.5, bottom: 3.5, left: 2.5, right: 2.5 },
      lineColor: C.borderLight,
      lineWidth: 0.12,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: C.primary,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8.8,
      cellPadding: { top: 5, bottom: 5, left: 2.5, right: 2.5 },
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [253, 252, 254],
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 38, halign: 'left' },
      2: { cellWidth: 18, halign: 'left' },
      3: { cellWidth: 34, halign: 'left' },
      4: { cellWidth: 16, halign: 'left' },
      5: { cellWidth: 13, halign: 'right', fontStyle: 'bold', textColor: C.primary },
      6: { cellWidth: 14, halign: 'right', fontStyle: 'bold', textColor: C.primary },
      7: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (hookData) => {
      if (emptyPlaceholder && hookData.section === 'body') {
        hookData.cell.styles.fillColor = C.bgLight;
        hookData.cell.styles.textColor = C.textGray;
        hookData.cell.styles.fontStyle = 'italic';
        return;
      }
      if (hookData.section !== 'body' || emptyPlaceholder) return;

      const i = hookData.row.index;
      if (i < 0 || i >= rowModels.length) return;
      const model = rowModels[i];
      const col = hookData.column.index;

      if (col === 0) {
        const hi = positionHighlight(model.pos);
        if (hi) {
          hookData.cell.styles.fillColor = hi.fill;
          hookData.cell.styles.textColor = hi.text;
          hookData.cell.styles.fontStyle = 'bold';
        }
      }

      if (col === 7) {
        const { fill, text } = proficiencyTagStyles(model.level);
        hookData.cell.styles.fillColor = fill;
        hookData.cell.styles.textColor = text;
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fontSize = 7.9;
      }
    },
  };

  autoTable(pdf, tableOptions);

  addFootersAllPages(pdf);

  const rawBase = (opts.fileNameBase ?? `ranking-${opts.context}`).trim();
  const safeNameBase =
    rawBase
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || `ranking-${opts.context}`;

  pdf.save(`${safeNameBase}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function rankingTypeLabel(rt: RankingType): string {
  if (rt === 'general') return 'Ranking geral';
  if (rt === 'specific_evaluation') return 'Ranking por avaliação';
  if (rt === 'specific_answer_sheet') return 'Ranking por cartão-resposta';
  return 'Ranking de professores';
}

type RankingApiPdfOptions = {
  rankingType: RankingType;
  data: RankingResponse;
  filters: RankingFilters;
  filterLabels?: {
    estado?: string;
    municipio?: string;
    escola?: string;
    serie?: string;
    turma?: string;
    periodo?: string;
    avaliacao?: string;
    disciplina?: string;
  };
  contextTitle?: string;
  fileNameBase?: string;
};

export async function generateRankingReportPdf(opts: RankingApiPdfOptions): Promise<void> {
  const { data, rankingType, filters } = opts;
  const rows = Array.isArray(data.items) ? data.items : [];
  const labels = opts.filterLabels || {};
  const estadoLabel = String(labels.estado || filters.estado || "Todos");
  const municipioLabel = String(labels.municipio || filters.municipio || "Todos");
  const escolaLabel = String(labels.escola || filters.escola || "Todas");
  const serieLabel = String(labels.serie || filters.serie || "Todas");
  const turmaLabel = String(labels.turma || filters.turma || "Todas");
  const periodoLabel = String(labels.periodo || filters.periodo || "Não informado");
  const avaliacaoLabel = String(
    labels.avaliacao || opts.contextTitle || filters.evaluation_id || filters.answer_sheet_id || "—"
  );
  const disciplinaLabel = String(labels.disciplina || data.selected_discipline || "Geral");

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const subtitleBand = 'RELATÓRIO INSTITUCIONAL DE RANKING';
  const mainSubtitle = rankingTypeLabel(rankingType);
  const cardLines: Array<{ label: string; value: string }> = [
    { label: 'TIPO', value: rankingTypeLabel(rankingType) },
    { label: 'ESCOPO', value: String(filters.scope || 'municipio') },
    { label: 'ESTADO', value: estadoLabel },
    { label: 'MUNICÍPIO', value: municipioLabel },
    { label: 'ESCOLA', value: escolaLabel },
    { label: 'SÉRIE', value: serieLabel },
    { label: 'TURMA', value: turmaLabel },
    { label: 'PERÍODO', value: periodoLabel },
    { label: 'DISCIPLINA', value: disciplinaLabel },
  ];

  if (rankingType === 'specific_evaluation' || (rankingType === 'general' && filters.evaluation_id)) {
    cardLines.unshift({ label: 'AVALIAÇÃO', value: avaliacaoLabel });
  } else if (rankingType === 'specific_answer_sheet' || (rankingType === 'general' && filters.answer_sheet_id)) {
    cardLines.unshift({ label: 'GABARITO', value: avaliacaoLabel });
  }

  await addRankingCoverPage(
    doc,
    'RANKING DE DESEMPENHO',
    subtitleBand,
    'RANKING',
    mainSubtitle,
    cardLines
  );

  doc.addPage();
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 16;
  const instrumentoLine = filters.evaluation_id
    ? `Avaliação: ${avaliacaoLabel}`
    : filters.answer_sheet_id
      ? `Cartão-resposta: ${avaliacaoLabel}`
      : `Instrumento: ${avaliacaoLabel}`;
  const detailLines = [
    instrumentoLine,
    `Estado: ${estadoLabel} · Município: ${municipioLabel}`,
    `Escola: ${escolaLabel} · Série: ${serieLabel} · Turma: ${turmaLabel}`,
    `Período: ${periodoLabel} · Disciplina: ${disciplinaLabel}`,
    `Escopo: ${String(filters.scope || 'municipio')}`,
  ];
  y = drawFiltersCard(doc, margin, pageW, y, detailLines);
  y = drawClassificationLegend(doc, margin, pageW, y + 2);

  const autoTable = (await import('jspdf-autotable')).default;
  const docWithTable = doc as jsPDF & { lastAutoTable?: { finalY?: number } };
  const drawSectionTitle = (title: string) => {
    y = ensurePageSpace(doc, y, 16, margin);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.textDark);
    const lines = doc.splitTextToSize(title, pageW - margin * 2) as string[];
    doc.text(lines, margin, y);
    y += lines.length * 4.6 + 2;
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.25);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
  };

  const drawSectionTitleKeepingTable = (title: string, minRows = 1) => {
    y = ensureSectionWithTableSpace(doc, y, margin, minRows);
    drawSectionTitle(title);
  };

  const sectionIndexEntries: ReportIndexEntry[] = [];
  let page2IndexY = 0;

  const startMajorSection = (
    sectionNumber: number,
    title: string,
    subtitle: string
  ): void => {
    doc.addPage();
    const page = doc.internal.getCurrentPageInfo().pageNumber as number;
    sectionIndexEntries.push({ number: sectionNumber, title, description: subtitle, page });
    y = margin + 2;
    y = drawTabSectionHeader(doc, margin, pageW, y, sectionNumber, title, subtitle);
  };

  type TableRenderOpts = {
    caption?: string;
    legend?: string[];
    footnote?: string;
  };

  const renderTable = (
    head: string[][],
    body: Array<Array<string | number>>,
    columnStyles: Record<number, unknown>,
    levelColumnIndex?: number,
    criticalRowIndexes?: Set<number>,
    block?: TableRenderOpts
  ) => {
    if (block?.caption) {
      y = drawTableCaption(doc, margin, pageW, y, block.caption, block.legend || []);
    }
    y = ensurePageSpace(doc, y, 36, margin);
    const emptyBody = [['—', 'Sem dados para os filtros selecionados']];
    autoTable(doc, {
      startY: y,
      head,
      body: body.length > 0 ? body : emptyBody,
      theme: 'striped',
      margin: { left: margin, right: margin, bottom: 18 },
      tableWidth: pageW - margin * 2,
      headStyles: {
        fillColor: C.primary,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 8.4,
        halign: 'center',
        cellPadding: { top: 3.2, bottom: 3.2, left: 2, right: 2 },
      },
      bodyStyles: {
        fontSize: 7.8,
        textColor: C.textDark,
        lineColor: C.borderLight,
        lineWidth: 0.12,
        cellPadding: { top: 2.6, bottom: 2.6, left: 2, right: 2 },
      },
      alternateRowStyles: { fillColor: [253, 252, 254] as [number, number, number] },
      styles: {
        overflow: 'linebreak',
      },
      didParseCell(hookData) {
        if (body.length === 0 && hookData.section === 'body') {
          hookData.cell.styles.fontStyle = 'italic';
          hookData.cell.styles.textColor = C.textGray;
        }
        if (hookData.section !== 'body' || body.length === 0) return;

        const rowIndex = hookData.row.index;
        const col = hookData.column.index;
        if (criticalRowIndexes?.has(rowIndex)) {
          hookData.cell.styles.fillColor = [254, 226, 226];
          hookData.cell.styles.textColor = [127, 29, 29];
        }
        if (col === 0) {
          const pos = Number(hookData.cell.raw ?? 0);
          const highlight = positionHighlight(pos);
          if (highlight && !criticalRowIndexes?.has(rowIndex)) {
            hookData.cell.styles.fillColor = highlight.fill;
            hookData.cell.styles.textColor = highlight.text;
            hookData.cell.styles.fontStyle = 'bold';
            hookData.cell.styles.halign = 'center';
          }
        }
        if (levelColumnIndex === undefined || col !== levelColumnIndex) return;

        const rawLevel = String(hookData.cell.raw ?? '').trim();
        const isKnownLevel = ['Abaixo do Básico', 'Básico', 'Adequado', 'Avançado'].includes(rawLevel);
        if (!isKnownLevel) return;
        const level = normalizeProficiencyLevelLabel(rawLevel);
        const { fill, text } = proficiencyTagStyles(level);
        hookData.cell.styles.fillColor = fill;
        hookData.cell.styles.textColor = text;
        hookData.cell.styles.fontStyle = 'bold';
      },
      columnStyles,
    });
    y = (docWithTable.lastAutoTable?.finalY || y) + 4;
    if (block?.footnote) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.8);
      doc.setTextColor(...C.textGray);
      const noteLines = doc.splitTextToSize(block.footnote, pageW - margin * 2) as string[];
      doc.text(noteLines, margin, y);
      y += noteLines.length * 3.2 + 4;
    } else {
      y += 5;
    }
  };

  if (rankingType === 'general') {
    const municipalItems = data.municipal_ranking?.items || [];
    const teachersItems = data.teachers_top?.items || [];
    const schoolEntries = Object.entries(data.school_class_ranking?.items_by_school || {});
    let sectionNo = 0;
    const nextSection = (title: string, subtitle: string) => {
      sectionNo += 1;
      startMajorSection(sectionNo, title, subtitle);
    };
    page2IndexY = y + 4;

    if (data.overview) {
      nextSection('Visão geral', 'Desempenho por curso, gráfico e tabela detalhada');
      const summary = data.overview.summary || {};
      const byCourse = data.overview.by_course || {};
      y = drawKpiCards(doc, margin, pageW, y, [
        {
          label: 'Escolas avaliadas',
          value: String(Number(summary.total_schools || 0)),
          tone: 'primary',
        },
        {
          label: 'Participação geral',
          value: `${fmtPtNum(summary.participation_rate)}%`,
          hint: `${Number(summary.participating_students || 0)}/${Number(summary.total_students || 0)} alunos`,
        },
        {
          label: 'Destaque do recorte',
          value: String(summary.top_school?.school_name || '—'),
          hint: `Nota ${fmtPtNum(summary.top_school?.average_score)}`,
        },
      ]);

      Object.entries(byCourse).forEach(([courseLabel, courseData]) => {
        y = ensureSectionWithTableSpace(doc, y, margin, 2);
        const typed = courseData as {
          chart_rows?: Array<Record<string, unknown>>;
          table_rows?: Array<Record<string, unknown>>;
          target_score?: number;
          counts_by_status?: Record<string, number>;
        };
        drawSectionTitle(`Ranking ${courseLabel}`);
        y = drawKpiCards(doc, margin, pageW, y, [
          {
            label: 'Destaque',
            value: String(Number(typed.counts_by_status?.destaque || 0)),
            hint: 'Escolas acima da meta',
          },
          {
            label: 'Em desenvolvimento',
            value: String(Number(typed.counts_by_status?.desenvolvimento || 0)),
            hint: 'Faixa intermediária',
          },
          {
            label: 'Atenção',
            value: String(Number(typed.counts_by_status?.atencao || 0)),
            hint: 'Abaixo da meta',
            tone: 'critical',
          },
        ]);
        const chartRows = typed.chart_rows || [];
        y = ensurePageSpace(doc, y, 36, margin);
        y = drawTableCaption(doc, margin, pageW, y, `Gráfico — Desempenho por escola (${courseLabel})`, [
          'Comparativo de nota média por escola no recorte; barras proporcionais à escala 0–10.',
          `Linha tracejada vertical indica a meta de ${fmtPtNum(typed.target_score || 7)} pontos.`,
        ]);
        y = drawCourseMiniChart(
          doc,
          margin,
          pageW,
          y,
          'Desempenho por escola',
          chartRows as Array<{ school_name?: unknown; average_score?: unknown; average_proficiency?: unknown }>,
          Number(typed.target_score || 7)
        );
        const tableRows = typed.table_rows || [];
        const rows = tableRows.map((row) => [
          Number(row.position || 0),
          String(row.school_name || "—"),
          fmtPtNum(row.average_proficiency),
          fmtPtNum(row.average_score),
          String(row.level_tag || "—"),
        ]);
        const criticalRows = new Set<number>();
        tableRows.forEach((row, idx) => {
          if (row.is_critical) criticalRows.add(idx);
        });
        renderTable(
          [["Pos.", "Escola", "Proficiência", "Nota média", "Nível"]],
          rows,
          {
            0: { cellWidth: 12, halign: "center" },
            1: { cellWidth: 78, halign: "left" },
            2: { cellWidth: 26, halign: "right" },
            3: { cellWidth: 24, halign: "right" },
            4: { cellWidth: 30, halign: "center" },
          },
          4,
          criticalRows,
          {
            caption: `Tabela — Ranking ${courseLabel}`,
            legend: [
              'Pos. = posição no recorte; linhas em vermelho = escolas críticas (Abaixo do Básico).',
              'Proficiência e nota média com uma casa decimal; Nível conforme legenda de classificação.',
            ],
            footnote: `Ordenação por nota média decrescente. Meta do curso: ${fmtPtNum(typed.target_score || 7)}.`,
          }
        );
      });
    }

    nextSection('Ranking municipal', 'Classificação de escolas no município');
    const totalParticipating = municipalItems.reduce(
      (acc, row) => acc + Number(row.participating_students || 0),
      0
    );
    const totalAdequadoAvancado = municipalItems.reduce(
      (acc, row) => acc + Number(row.adequado_avancado_count || 0),
      0
    );
    const levelsPct = totalParticipating ? (totalAdequadoAvancado / totalParticipating) * 100 : 0;
    const participationAvg = municipalItems.length
      ? municipalItems.reduce((acc, row) => acc + Number(row.participation_rate || 0), 0) / municipalItems.length
      : 0;
    y = drawKpiCards(doc, margin, pageW, y, [
      { label: 'Escolas avaliadas', value: String(municipalItems.length) },
      { label: 'Participação geral', value: `${fmtPtNum(participationAvg)}%` },
      {
        label: 'Adequado + Avançado',
        value: `${totalAdequadoAvancado} alunos`,
        hint: `${fmtPtNum(levelsPct)}% dos participantes`,
        tone: 'primary',
      },
      {
        label: 'Destaque do mês',
        value: String(municipalItems[0]?.school_name || '—'),
        hint: `Nota ${fmtPtNum(municipalItems[0]?.average_score)}`,
      },
    ]);
    drawSectionTitleKeepingTable('Ranking municipal de escolas', Math.min(3, municipalItems.length || 1));
    const municipalBody = municipalItems.map((row) => [
      Number(row.position || 0),
      String(row.school_name || "—"),
      formatParticipation(row.participation_rate, row.participating_students, row.total_students),
      fmtPtNum(row.average_proficiency),
      fmtPtNum(row.average_score),
      formatAdequadoAvancado(row.adequado_avancado_count, row.adequado_avancado_pct),
      String(row.level_tag || "—"),
      String(row.best_class_name || "N/A"),
    ]);
    const municipalCriticalRows = new Set<number>();
    municipalItems.forEach((row, idx) => {
      if (row.is_critical) municipalCriticalRows.add(idx);
    });
    renderTable(
      [["Pos.", "Escola", "Participação", "Proficiência", "Nota", "Adeq.+Avan.", "Nível", "Melhor turma"]],
      municipalBody,
      {
        0: { cellWidth: 11, halign: "center" },
        1: { cellWidth: 44, halign: "left" },
        2: { cellWidth: 24, halign: "center" },
        3: { cellWidth: 16, halign: "right" },
        4: { cellWidth: 12, halign: "right" },
        5: { cellWidth: 26, halign: "right" },
        6: { cellWidth: 22, halign: "center" },
        7: { cellWidth: 25, halign: "left" },
      },
      6,
      municipalCriticalRows,
      {
        caption: 'Tabela — Ranking municipal de escolas',
        legend: [
          'Participação = % (participantes/total de alunos da escola).',
          'Adeq.+Avan. = quantidade de alunos nos níveis Adequado e Avançado e respectivo percentual.',
          '1º–3º lugares destacados; fundo vermelho = nível crítico.',
        ],
      }
    );

    nextSection('Ranking por escola/turma', 'Séries, professores e disciplinas por escola');
    if (schoolEntries.length === 0) {
      y = ensureSectionWithTableSpace(doc, y, margin, 1);
      renderTable(
        [["Pos.", "Série/Turma", "Professor(a)", "Disciplina", "Participação", "Proficiência", "Nota", "Nível"]],
        [],
        {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 28, halign: "left" },
          2: { cellWidth: 30, halign: "left" },
          3: { cellWidth: 22, halign: "left" },
          4: { cellWidth: 22, halign: "center" },
          5: { cellWidth: 16, halign: "right" },
          6: { cellWidth: 12, halign: "right" },
          7: { cellWidth: 20, halign: "center" },
        },
        7,
        undefined,
        {
          caption: 'Tabela — Ranking por escola/turma',
          legend: ['Sem registros para os filtros aplicados.'],
        }
      );
    } else {
      schoolEntries.forEach(([schoolId, rows]) => {
        const schoolName =
          data.school_class_ranking?.school_options?.find((option) => option.id === schoolId)?.name || "Escola";
        drawSectionTitleKeepingTable(schoolName, Math.min(3, (rows || []).length || 1));
        const body = (rows || []).map((row) => [
          Number(row.position || 0),
          String(row.series_class_name || "—"),
          String(row.teacher_name || "N/A"),
          String(row.course_label || "—"),
          formatParticipation(row.participation_rate, row.participating_students, row.total_students),
          fmtPtNum(row.average_proficiency),
          fmtPtNum(row.average_score),
          String(row.level_tag || "—"),
        ]);
        const schoolCriticalRows = new Set<number>();
        (rows || []).forEach((row, idx) => {
          if (row.is_critical) schoolCriticalRows.add(idx);
        });
        renderTable(
          [["Pos.", "Série/Turma", "Professor(a)", "Disciplina", "Participação", "Proficiência", "Nota", "Nível"]],
          body,
          {
            0: { cellWidth: 10, halign: "center" },
            1: { cellWidth: 28, halign: "left" },
            2: { cellWidth: 30, halign: "left" },
            3: { cellWidth: 22, halign: "left" },
            4: { cellWidth: 22, halign: "center" },
            5: { cellWidth: 16, halign: "right" },
            6: { cellWidth: 12, halign: "right" },
            7: { cellWidth: 20, halign: "center" },
          },
          7,
          schoolCriticalRows,
          {
            caption: `Tabela — ${schoolName}`,
            legend: [
              'Uma linha por série/turma vinculada à escola no instrumento selecionado.',
              'Disciplina conforme agrupamento do curso; participação no formato % (participantes/total).',
            ],
          }
        );
      });
    }

    nextSection('Top professores', 'Classificação por níveis, proficiência e nota média');
    y = drawKpiCards(doc, margin, pageW, y, [
      {
        label: 'Professores no ranking',
        value: String(teachersItems.length),
        tone: 'primary',
      },
      {
        label: 'Melhor proficiência',
        value: fmtPtNum(teachersItems[0]?.average_proficiency),
        hint: String(teachersItems[0]?.teacher_name || '—'),
      },
      {
        label: 'Melhor nota',
        value: fmtPtNum(teachersItems[0]?.average_score),
        hint: String(teachersItems[0]?.school_name || '—'),
      },
    ]);
    drawSectionTitleKeepingTable('Top 10 professores', Math.min(3, teachersItems.length || 1));
    const teachersBody = teachersItems.map((row) => [
      Number(row.position || 0),
      String(row.teacher_name || "—"),
      String(row.school_name || "—"),
      String(row.series_class_name || "—"),
      fmtPtNum(row.average_proficiency),
      fmtPtNum(row.average_score),
      String(row.classification || "—"),
    ]);
    const teachersCriticalRows = new Set<number>();
    teachersItems.forEach((row, idx) => {
      if (row.is_critical) teachersCriticalRows.add(idx);
    });
    renderTable(
      [["Pos.", "Professor", "Escola", "Turma/Série", "Proficiência", "Nota", "Nível"]],
      teachersBody,
      {
        0: { cellWidth: 11, halign: "center" },
        1: { cellWidth: 38, halign: "left" },
        2: { cellWidth: 36, halign: "left" },
        3: { cellWidth: 28, halign: "left" },
        4: { cellWidth: 18, halign: "right" },
        5: { cellWidth: 14, halign: "right" },
        6: { cellWidth: 25, halign: "center" },
      },
      6,
      teachersCriticalRows,
      {
        caption: 'Tabela — Top 10 professores',
        legend: [
          'Ranking limitado aos 10 melhores por proficiência média no recorte.',
          'Turma/Série lista as séries vinculadas ao professor na avaliação ou cartão-resposta.',
        ],
      }
    );

    if (page2IndexY > 0 && sectionIndexEntries.length > 0) {
      doc.setPage(2);
      drawReportIndex(doc, margin, pageW, page2IndexY, sectionIndexEntries);
    }

    // fallback legado
    if (!data.overview && !data.municipal_ranking && !data.school_class_ranking && !data.teachers_top) {
      const rankings = data.general_rankings;
      const visibility = rankings?.visibility || {
        schools_by_course: true,
        series_by_school_and_course: false,
        classes_by_series: false,
        students_by_course: true,
      };
      const schoolsByCourse = rankings?.schools_by_course?.sections || data.course_sections || [];
      const seriesBySchool = rankings?.series_by_school_and_course?.schools || [];
      const classesBySeries = rankings?.classes_by_series?.sections || [];
      const studentsByCourse = rankings?.students_by_course?.sections || [];

      if (visibility.schools_by_course) {
        for (const section of schoolsByCourse) {
        drawSectionTitleKeepingTable(`Ranking de escolas - ${String(section.course_label || 'Curso')}`, Math.min(3, (section.items || []).length || 1));
        const schoolsBody = (section.items || []).map((r: Record<string, unknown>) => [
          Number(r.position || 0),
          String(r.school_name || '—'),
          `${Number(r.participating_students || 0)}/${Number(r.total_students || 0)}`,
          Number(r.average_proficiency || 0).toFixed(1),
          Number(r.average_score || 0).toFixed(1),
          String(r.classification || '—'),
        ]);
        renderTable(
          [['Pos.', 'Escola', 'Participação', 'Proficiência', 'Nota', 'Nível']],
          schoolsBody,
          {
            0: { cellWidth: 12, halign: 'center' },
            1: { cellWidth: 70, halign: 'left' },
            2: { cellWidth: 24, halign: 'center' },
            3: { cellWidth: 22, halign: 'right' },
            4: { cellWidth: 14, halign: 'right' },
            5: { cellWidth: 24, halign: 'center' },
          },
          5
        );
        }
      }

      if (visibility.series_by_school_and_course) {
        for (const school of seriesBySchool) {
        for (const course of school.course_sections || []) {
          drawSectionTitleKeepingTable(
            `Ranking de séries - ${String(school.school_name || 'Escola')} (${String(course.course_label || 'Curso')})`
          , Math.min(3, (course.items || []).length || 1));
          const seriesBody = (course.items || []).map((r: Record<string, unknown>) => [
            Number(r.position || 0),
            String(r.grade_name || '—'),
            `${Number(r.participating_students || 0)}/${Number(r.total_students || 0)}`,
            Number(r.average_proficiency || 0).toFixed(1),
            Number(r.average_score || 0).toFixed(1),
            String(r.classification || '—'),
          ]);
          renderTable(
            [['Pos.', 'Série', 'Participação', 'Proficiência', 'Nota', 'Nível']],
            seriesBody,
            {
              0: { cellWidth: 12, halign: 'center' },
              1: { cellWidth: 70, halign: 'left' },
              2: { cellWidth: 24, halign: 'center' },
              3: { cellWidth: 22, halign: 'right' },
              4: { cellWidth: 14, halign: 'right' },
              5: { cellWidth: 24, halign: 'center' },
            },
            5
          );
        }
        }
      }

      if (visibility.classes_by_series) {
        for (const section of classesBySeries) {
        drawSectionTitleKeepingTable(`Ranking de turmas - ${String(section.grade_name || 'Série')}`, Math.min(3, (section.items || []).length || 1));
        const classesBody = (section.items || []).map((r: Record<string, unknown>) => [
          Number(r.position || 0),
          String(r.class_name || '—'),
          Number(r.average_score || 0).toFixed(1),
          `${Number(r.accuracy_percent || 0).toFixed(1)}%`,
          `${Number(r.completion_rate || 0).toFixed(1)}%`,
          Number(r.students_count || 0),
          Number(r.evaluations_count || 0),
        ]);
        renderTable(
          [['Pos.', 'Turma', 'Nota', 'Acerto %', 'Conclusão', 'Alunos', 'Avaliações']],
          classesBody,
          {
            0: { cellWidth: 12, halign: 'center' },
            1: { cellWidth: 44, halign: 'left' },
            2: { cellWidth: 14, halign: 'right' },
            3: { cellWidth: 18, halign: 'right' },
            4: { cellWidth: 18, halign: 'right' },
            5: { cellWidth: 16, halign: 'center' },
            6: { cellWidth: 20, halign: 'center' },
          }
        );
        }
      }

      if (visibility.students_by_course) {
        for (const section of studentsByCourse) {
        drawSectionTitleKeepingTable(`Ranking de alunos - ${String(section.course_label || 'Curso')}`, Math.min(3, (section.items || []).length || 1));
        const studentsBody = (section.items || []).map((r: Record<string, unknown>) => [
          Number(r.position || 0),
          String(r.name || '—'),
          String(r.school_name || '—'),
          String(r.serie || '—'),
          String(r.class_name || '—'),
          Number(r.average_score || 0).toFixed(2),
          Number((r.average_proficiency ?? r.average_score) || 0).toFixed(2),
          String(r.classification || '—'),
        ]);
        renderTable(
          [['Pos.', 'Aluno', 'Escola', 'Série', 'Turma', 'Nota', 'Proficiência', 'Nível']],
          studentsBody,
          {
            0: { cellWidth: 12, halign: 'center' },
            1: { cellWidth: 30, halign: 'left' },
            2: { cellWidth: 50, halign: 'left' },
            3: { cellWidth: 14, halign: 'left' },
            4: { cellWidth: 14, halign: 'left' },
            5: { cellWidth: 14, halign: 'right' },
            6: { cellWidth: 20, halign: 'right' },
            7: { cellWidth: 26, halign: 'center' },
          },
          7
        );
        }
      }
    }
  } else if (rankingType === 'teachers') {
    drawSectionTitleKeepingTable('Ranking de professores', Math.min(3, rows.length || 1));
    const teachersBody = rows.map((r) => [
      Number(r.position || 0),
      String(r.teacher_name || '—'),
      String(r.teacher_email || '—'),
      Number(r.average_score || 0).toFixed(2),
      Number(r.average_proficiency || 0).toFixed(2),
      String(r.classification || '—'),
      Number(r.total_evaluations || 0),
      Number(r.classes_count || 0),
    ]);
    renderTable(
      [['Pos.', 'Professor', 'E-mail', 'Nota', 'Proficiência', 'Nível', 'Avaliações', 'Turmas']],
      teachersBody,
      {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 28, halign: 'left' },
        2: { cellWidth: 44, halign: 'left' },
        3: { cellWidth: 12, halign: 'right' },
        4: { cellWidth: 18, halign: 'right' },
        5: { cellWidth: 24, halign: 'center' },
        6: { cellWidth: 18, halign: 'center' },
        7: { cellWidth: 14, halign: 'center' },
      },
      5
    );
  } else {
    drawSectionTitleKeepingTable('Ranking de alunos', Math.min(3, rows.length || 1));
    const studentsBody = rows.map((r) => [
      Number(r.position || 0),
      String(r.name || '—'),
      String(r.school_name || '—'),
      String(r.serie || '—'),
      String(r.class_name || '—'),
      Number(r.average_score || 0).toFixed(2),
      Number((r.average_proficiency ?? r.average_score) || 0).toFixed(2),
      String(r.classification || '—'),
    ]);
    renderTable(
      [['Pos.', 'Aluno', 'Escola', 'Série', 'Turma', 'Nota', 'Proficiência', 'Nível']],
      studentsBody,
      {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 30, halign: 'left' },
        2: { cellWidth: 50, halign: 'left' },
        3: { cellWidth: 14, halign: 'left' },
        4: { cellWidth: 14, halign: 'left' },
        5: { cellWidth: 14, halign: 'right' },
        6: { cellWidth: 20, halign: 'right' },
        7: { cellWidth: 26, halign: 'center' },
      },
      7
    );
  }

  addFootersAllPages(doc);
  const base = (opts.fileNameBase || `ranking-${rankingType}`).replace(/\s+/g, '-').toLowerCase();
  doc.save(`${base}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
