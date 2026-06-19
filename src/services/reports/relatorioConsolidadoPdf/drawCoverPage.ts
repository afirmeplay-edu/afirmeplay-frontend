import type { jsPDF } from 'jspdf';
import type { PdfImageAsset } from '@/utils/pdfCityBranding';
import { drawMunicipalLogoTopCenter } from '@/utils/pdfCityBranding';

/** Paleta alinhada aos relatórios institucionais do projeto. */
export const RELATORIO_CONSOLIDADO_PDF_COLORS = {
  primary: [124, 62, 237] as [number, number, number],
  primaryLight: [233, 213, 255] as [number, number, number],
  decor: [245, 243, 255] as [number, number, number],
  textDark: [17, 24, 39] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  pillBg: [243, 244, 246] as [number, number, number],
  lineMuted: [209, 213, 219] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

export type RelatorioConsolidadoCoverParams = {
  /** Nome da prefeitura / instituição (vazio = não exibir). */
  institutionName?: string;
  /** REDE ou nome da escola. */
  scopeLabel: string;
  year?: number;
  logo: PdfImageAsset | null;
};

function formatCoverUpper(value: string): string {
  return value.trim().toLocaleUpperCase('pt-BR');
}

function drawDecorativeArcs(doc: jsPDF, pageW: number, pageH: number): void {
  const { decor } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  doc.setFillColor(...decor);
  doc.circle(pageW + 12, -18, 72, 'F');
  doc.circle(-14, pageH + 22, 58, 'F');
}

function drawLogoCard(
  doc: jsPDF,
  pageW: number,
  y: number,
  logo: PdfImageAsset
): number {
  const maxW = 58;
  const maxH = 30;
  let lw = maxW;
  let lh = (logo.ih / logo.iw) * lw;
  if (lh > maxH) {
    lh = maxH;
    lw = (logo.iw / logo.ih) * lh;
  }

  const pad = 5;
  const cardW = lw + pad * 2;
  const cardH = lh + pad * 2;
  const cardX = (pageW - cardW) / 2;

  doc.setFillColor(...RELATORIO_CONSOLIDADO_PDF_COLORS.white);
  doc.setDrawColor(236, 236, 240);
  doc.setLineWidth(0.25);
  if (typeof doc.roundedRect === 'function') {
    doc.roundedRect(cardX, y, cardW, cardH, 2.5, 2.5, 'FD');
  } else {
    doc.rect(cardX, y, cardW, cardH, 'FD');
  }

  doc.addImage(logo.dataUrl, 'PNG', cardX + pad, y + pad, lw, lh);
  return y + cardH + 10;
}

/**
 * Capa do Relatório de Avaliação Diagnóstica (layout institucional).
 */
export function drawRelatorioConsolidadoCoverPage(
  doc: jsPDF,
  params: RelatorioConsolidadoCoverParams
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const centerX = pageW / 2;
  const { primary, primaryLight, textDark, textGray, pillBg, lineMuted } =
    RELATORIO_CONSOLIDADO_PDF_COLORS;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');

  drawDecorativeArcs(doc, pageW, pageH);

  const topBarH = 7;
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, topBarH, 'F');

  let y = topBarH + 22;

  if (params.logo) {
    y = drawLogoCard(doc, pageW, y, params.logo);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...primary);
    doc.text('AFIRME PLAY', centerX, y + 8, { align: 'center' });
    y += 22;
  }

  const institution = formatCoverUpper(params.institutionName ?? '');
  if (institution) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...textGray);
    const instLines = doc.splitTextToSize(institution, pageW - 36) as string[];
    doc.text(instLines, centerX, y, { align: 'center' });
    y += instLines.length * 4.8 + 10;
  } else {
    y += 4;
  }

  const accentW = 32;
  doc.setFillColor(...primary);
  doc.rect(centerX - accentW / 2, y, accentW, 1.4, 'F');
  y += 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...textDark);
  doc.text('RELATÓRIO DE AVALIAÇÃO', centerX, y, { align: 'center' });
  y += 11;

  doc.setFontSize(17);
  doc.setTextColor(...primary);
  doc.text('DIAGNÓSTICA', centerX, y, { align: 'center' });
  y += 18;

  const scope = formatCoverUpper(params.scopeLabel || 'REDE');
  const pillW = Math.min(pageW - 48, Math.max(72, doc.getTextWidth(scope) + 28));
  const pillH = 14;
  const pillX = (pageW - pillW) / 2;

  doc.setFillColor(...pillBg);
  if (typeof doc.roundedRect === 'function') {
    doc.roundedRect(pillX, y, pillW, pillH, 3.5, 3.5, 'F');
  } else {
    doc.rect(pillX, y, pillW, pillH, 'F');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...textDark);
  doc.text(scope, centerX, y + pillH / 2 + 1.2, { align: 'center', baseline: 'middle' });

  const year = String(params.year ?? new Date().getFullYear());
  const yearY = pageH - 32;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...textDark);
  const yearW = doc.getTextWidth(year);
  const gap = 10;

  doc.setDrawColor(...lineMuted);
  doc.setLineWidth(0.35);
  doc.line(42, yearY, centerX - yearW / 2 - gap, yearY);
  doc.line(centerX + yearW / 2 + gap, yearY, pageW - 42, yearY);
  doc.text(year, centerX, yearY, { align: 'center', baseline: 'middle' });

  const bottomBarH = 7;
  doc.setFillColor(...primaryLight);
  doc.rect(0, pageH - bottomBarH, pageW, bottomBarH, 'F');
}

/** Desenha logo centralizado sem card (uso em páginas internas futuras). */
export function drawRelatorioConsolidadoHeaderLogo(
  doc: jsPDF,
  pageW: number,
  y: number,
  logo: PdfImageAsset | null
): number {
  if (!logo) return y;
  return drawMunicipalLogoTopCenter(doc, pageW, y, logo, 40, 18);
}
