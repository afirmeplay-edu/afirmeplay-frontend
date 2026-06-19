import type { jsPDF } from 'jspdf';
import type { PdfImageAsset } from '@/utils/pdfCityBranding';
import { drawMunicipalLogoTopCenter } from '@/utils/pdfCityBranding';
import { RELATORIO_CONSOLIDADO_PDF_COLORS } from './drawCoverPage';

export const PDF_MARGIN_X = 20;
export const PDF_FOOTER_Y_OFFSET = 12;

export function paintPdfWhitePage(doc: jsPDF): { pageW: number; pageH: number } {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');
  return { pageW, pageH };
}

export function formatPdfUpper(value: string): string {
  return value.trim().toLocaleUpperCase('pt-BR');
}

export function formatPdfInteger(value: number): string {
  return Math.round(value).toLocaleString('pt-BR');
}

export function formatPdfPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function formatPdfDecimal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export type InternalPageHeaderParams = {
  logo: PdfImageAsset | null;
  institutionName?: string;
  year?: number;
};

/** Cabeçalho das páginas internas (logo, prefeitura, secretaria, título do relatório). */
export function drawRelatorioConsolidadoInternalHeader(
  doc: jsPDF,
  params: InternalPageHeaderParams
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const { primary, textDark, textGray } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  const centerX = pageW / 2;
  let y = 16;

  if (params.logo) {
    y = drawMunicipalLogoTopCenter(doc, pageW, y, params.logo, 36, 16);
    y += 2;
  }

  const institution = formatPdfUpper(params.institutionName ?? '');
  if (institution) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...textDark);
    const instLines = doc.splitTextToSize(institution, pageW - 36) as string[];
    doc.text(instLines, centerX, y, { align: 'center' });
    y += instLines.length * 4.2 + 2;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...textDark);
  doc.text('SECRETARIA MUNICIPAL DE EDUCAÇÃO', centerX, y, { align: 'center' });
  y += 6;

  const year = params.year ?? new Date().getFullYear();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...primary);
  doc.text(`RELATÓRIO DE AVALIAÇÃO DIAGNÓSTICA — ${year}`, centerX, y, { align: 'center' });

  return y + 12;
}

/** Título de seção com barra roxa vertical (ex.: "1. APRESENTAÇÃO"). */
export function drawRelatorioConsolidadoSectionTitle(
  doc: jsPDF,
  title: string,
  y: number,
  marginL = PDF_MARGIN_X
): number {
  const { primary, textDark } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  const barW = 3.5;
  const barH = 10;

  doc.setFillColor(...primary);
  doc.rect(marginL, y - barH + 2.5, barW, barH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...textDark);
  doc.text(formatPdfUpper(title), marginL + barW + 5, y);

  return y + 10;
}

type TextRun = { text: string; bold?: boolean };

/**
 * Parágrafo com trechos em negrito (quebra de linha automática).
 * Retorna a posição Y após o bloco.
 */
export function drawPdfTextRuns(
  doc: jsPDF,
  runs: TextRun[],
  x: number,
  y: number,
  maxWidth: number,
  fontSize = 10
): number {
  const { textDark } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  const lineHeight = fontSize * 0.48;
  let cursorX = x;
  let cursorY = y;
  const right = x + maxWidth;

  doc.setFontSize(fontSize);
  doc.setTextColor(...textDark);

  for (const run of runs) {
    doc.setFont('helvetica', run.bold ? 'bold' : 'normal');
    const tokens = run.text.split(/(\s+)/).filter((t) => t.length > 0);

    for (const token of tokens) {
      const tokenW = doc.getTextWidth(token);
      if (cursorX + tokenW > right && cursorX > x) {
        cursorX = x;
        cursorY += lineHeight;
      }
      doc.text(token, cursorX, cursorY);
      cursorX += tokenW;
    }
  }

  return cursorY + lineHeight + 2;
}

/** Badge arredondado (legendas de frequência e proficiência). */
export function drawPdfColoredBadge(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  fill: [number, number, number],
  textColor: [number, number, number],
  fontSize = 8
): { w: number; h: number } {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  const padX = 4;
  const padY = 2.2;
  const textW = doc.getTextWidth(label);
  const w = textW + padX * 2;
  const h = 6.5;

  if (typeof doc.roundedRect === 'function') {
    doc.setFillColor(...fill);
    doc.roundedRect(x, y - h + padY, w, h, 2, 2, 'F');
  } else {
    doc.setFillColor(...fill);
    doc.rect(x, y - h + padY, w, h, 'F');
  }

  doc.setTextColor(...textColor);
  doc.text(label, x + padX, y);
  return { w, h };
}

/** Subtítulo numerado (ex.: "3.1. Metodologia de Avaliação"). */
export function drawRelatorioConsolidadoSubsectionTitle(
  doc: jsPDF,
  title: string,
  y: number,
  marginL = PDF_MARGIN_X
): number {
  const { textDark } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...textDark);
  doc.text(title, marginL, y);
  return y + 7;
}

export type PdfLegendTableRow = {
  label: string;
  description: string;
  fill: [number, number, number];
  text: [number, number, number];
};

/** Tabela de legenda em duas colunas (Nível / Descrição). */
export function drawPdfLegendTable(
  doc: jsPDF,
  marginL: number,
  contentW: number,
  y: number,
  headerCol1: string,
  headerCol2: string,
  rows: PdfLegendTableRow[],
  col1W = 48
): number {
  const { primary, textGray, lineMuted, white } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  const col2W = contentW - col1W;
  const rowH = 12;
  const headerH = 9;

  doc.setFillColor(...primary);
  doc.rect(marginL, y, contentW, headerH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...white);
  doc.text(headerCol1, marginL + 3, y + 6);
  doc.text(headerCol2, marginL + col1W + 3, y + 6);
  y += headerH;

  rows.forEach((row, idx) => {
    const bg = idx % 2 === 0 ? [255, 255, 255] : [249, 250, 251];
    doc.setFillColor(...(bg as [number, number, number]));
    doc.rect(marginL, y, contentW, rowH, 'F');
    doc.setDrawColor(...lineMuted);
    doc.setLineWidth(0.2);
    doc.rect(marginL, y, contentW, rowH, 'S');
    doc.line(marginL + col1W, y, marginL + col1W, y + rowH);

    drawPdfColoredBadge(doc, marginL + 4, y + 8.2, row.label, row.fill, row.text);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...textGray);
    const descLines = doc.splitTextToSize(row.description, col2W - 8) as string[];
    doc.text(descLines, marginL + col1W + 4, y + 7.5);

    y += rowH;
  });

  return y + 4;
}

export function drawRelatorioConsolidadoFooters(doc: jsPDF, skipFirstPage = true): void {
  const total = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const margin = PDF_MARGIN_X;
  const generatedAt = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const start = skipFirstPage ? 2 : 1;

  for (let i = start; i <= total; i++) {
    doc.setPage(i);
    const footerY = pageH - PDF_FOOTER_Y_OFFSET;
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...RELATORIO_CONSOLIDADO_PDF_COLORS.textGray);
    doc.setDrawColor(...RELATORIO_CONSOLIDADO_PDF_COLORS.lineMuted);
    doc.setLineWidth(0.25);
    doc.line(margin, footerY - 4, pageW - margin, footerY - 4);

    doc.text('Sistema de Ensino e Avaliação InnovPlay', margin, footerY);
    doc.text(`Página ${i}`, pageW / 2, footerY, { align: 'center' });
    doc.text(`Gerado em: ${generatedAt}`, pageW - margin, footerY, { align: 'right' });
  }
}
