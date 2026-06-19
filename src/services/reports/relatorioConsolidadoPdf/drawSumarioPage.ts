import type { jsPDF } from 'jspdf';
import { RELATORIO_CONSOLIDADO_PDF_COLORS } from './drawCoverPage';
import {
  formatSumarioSubsectionsLine,
  type SumarioSection,
} from './buildSumarioSections';

const MARGIN_X = 22;
const SECTION_GAP = 11;

function paintWhitePage(doc: jsPDF): { pageW: number; pageH: number } {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');
  return { pageW, pageH };
}

function drawSumarioHeader(doc: jsPDF, marginL: number, y: number): number {
  const { primary, textDark } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  const barW = 3.5;
  const barH = 11;

  doc.setFillColor(...primary);
  doc.rect(marginL, y - barH + 2.5, barW, barH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...textDark);
  doc.text('SUMÁRIO', marginL + barW + 5, y);

  return y + 18;
}

function drawSumarioSection(
  doc: jsPDF,
  section: SumarioSection,
  marginL: number,
  contentW: number,
  y: number
): number {
  const { textDark, textGray, lineMuted } = RELATORIO_CONSOLIDADO_PDF_COLORS;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...textDark);
  doc.text(`${section.number}. ${section.title}`, marginL, y);
  let nextY = y + 6.5;

  const subLine = formatSumarioSubsectionsLine(section);
  if (subLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...textGray);
    const lines = doc.splitTextToSize(subLine, contentW) as string[];
    doc.text(lines, marginL, nextY);
    nextY += lines.length * 4.3 + 2;
  }

  nextY += 5;
  doc.setDrawColor(...lineMuted);
  doc.setLineWidth(0.25);
  doc.line(marginL, nextY, marginL + contentW, nextY);

  return nextY + SECTION_GAP;
}

/**
 * Página de sumário (layout institucional — barra roxa + seções numeradas).
 */
export function drawRelatorioConsolidadoSumarioPage(
  doc: jsPDF,
  sections: SumarioSection[]
): void {
  doc.addPage();
  let { pageW, pageH } = paintWhitePage(doc);

  const marginL = MARGIN_X;
  const marginR = MARGIN_X;
  const contentW = pageW - marginL - marginR;
  const bottomLimit = pageH - 20;

  let y = drawSumarioHeader(doc, marginL, 30);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const estimatedHeight = section.subsections.length > 0 ? 22 : 16;

    if (y + estimatedHeight > bottomLimit && i > 0) {
      doc.addPage();
      ({ pageW, pageH } = paintWhitePage(doc));
      y = 28;
    }

    y = drawSumarioSection(doc, section, marginL, contentW, y);
  }
}
