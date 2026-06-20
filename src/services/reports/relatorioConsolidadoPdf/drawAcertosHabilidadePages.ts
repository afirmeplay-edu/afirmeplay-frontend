import type { jsPDF } from 'jspdf';
import type { CellHookData, UserOptions } from 'jspdf-autotable';
import type { PdfImageAsset } from '@/utils/pdfCityBranding';
import type {
  HabilidadeConsolidada,
  MatrizEscolaSerie,
  RelatorioConsolidado,
  SerieColuna,
} from '@/types/relatorio-consolidado';
import {
  getAcertosHabilidadeBloco,
} from '@/utils/reports/relatorioConsolidadoDisciplinas';
import { getMediasRedeFooterLabel } from '@/utils/reports/relatorioConsolidadoComparativo';
import {
  buildHabilidadeLinhaTexto,
  formatHabilidadePercentDisplay,
  getHabilidadeMetaCardTitle,
  splitHabilidadesPorMeta,
  type HabilidadeMetaVariant,
} from '@/utils/reports/relatorioConsolidadoHabilidades';
import { RELATORIO_CONSOLIDADO_PDF_COLORS } from './drawCoverPage';
import {
  buildMediasSubsectionLabel,
  buildMediasTableBandLabel,
  getMediasPdfDisciplinas,
} from './buildMediasIntroData';
import { buildFaixaSeriesSubtitle } from './buildFaixaSeriesSubtitle';
import { HABILIDADES_PDF_CARD_STYLES, resolveAcertosMetaPdfCellStyle } from './habilidadesPdfStyles';
import {
  drawRelatorioConsolidadoInternalHeader,
  drawRelatorioConsolidadoSectionTitle,
  formatPdfDecimal,
  formatPdfUpper,
  paintPdfWhitePage,
  PDF_MARGIN_X,
} from './pdfShared';

export type AcertosHabilidadePagesParams = {
  report: RelatorioConsolidado;
  logo: PdfImageAsset | null;
  institutionName?: string;
  year?: number;
};

const PDF_TABLE_TOP_MARGIN = 58;
const PDF_TABLE_BOTTOM_MARGIN = 22;
const PDF_PAGE_BOTTOM = 275;

type PageLayoutContext = {
  doc: jsPDF;
  logo: PdfImageAsset | null;
  institutionName?: string;
  year?: number;
};

function drawSubsectionTitle(doc: jsPDF, label: string, y: number, marginL: number): number {
  const { primary } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...primary);
  doc.text(label, marginL, y);
  return y + 7;
}

function drawTableBand(doc: jsPDF, marginL: number, contentW: number, y: number, label: string): number {
  const { primary, primaryLight } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  const bandH = 9;
  doc.setFillColor(...primaryLight);
  if (typeof doc.roundedRect === 'function') {
    doc.roundedRect(marginL, y, contentW, bandH, 2, 2, 'F');
  } else {
    doc.rect(marginL, y, contentW, bandH, 'F');
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...primary);
  doc.text(label, marginL + 4, y + 6.2);
  return y + bandH + 4;
}

function scaleColumnWidths(
  widths: Record<number, { cellWidth: number }>,
  totalWidth: number
): Record<number, { cellWidth: number }> {
  const sum = Object.values(widths).reduce((acc, w) => acc + w.cellWidth, 0);
  if (sum <= 0) return widths;
  const factor = totalWidth / sum;
  const scaled: Record<number, { cellWidth: number }> = {};
  for (const [key, val] of Object.entries(widths)) {
    scaled[Number(key)] = { cellWidth: val.cellWidth * factor };
  }
  return scaled;
}

function buildColumnStyles(
  seriesCount: number,
  tableWidth: number
): Record<number, Partial<import('jspdf-autotable').Styles>> {
  const indexW = 8;
  const mediaW = 18;
  const escolaW = Math.min(58, tableWidth * 0.34);
  const seriesTotal = tableWidth - indexW - escolaW - mediaW;
  const serieW = seriesCount > 0 ? seriesTotal / seriesCount : 12;

  const base: Record<number, { cellWidth: number; halign?: 'left' | 'center' | 'right' }> = {
    0: { cellWidth: indexW, halign: 'center' },
    1: { cellWidth: escolaW, halign: 'left' },
  };
  for (let i = 0; i < seriesCount; i++) {
    base[2 + i] = { cellWidth: serieW, halign: 'center' };
  }
  base[2 + seriesCount] = { cellWidth: mediaW, halign: 'center' };

  return scaleColumnWidths(base, tableWidth) as Record<number, Partial<import('jspdf-autotable').Styles>>;
}

function buildTableData(
  seriesColunas: SerieColuna[],
  matriz: MatrizEscolaSerie,
  footerLabel: string
) {
  const seriesCount = seriesColunas.length;
  const headRow = [
    '#',
    'ESCOLAS',
    ...seriesColunas.map((c) => formatPdfUpper(c.serie_nome)),
    'TX. GERAL',
  ];

  const body = matriz.linhas.map((linha, idx) => [
    String(idx + 1),
    formatPdfUpper(linha.escola_nome),
    ...linha.valores_por_serie.map((v) => formatPdfDecimal(v)),
    formatPdfDecimal(linha.taxa_geral_escola),
  ]);

  const footRow = [
    '',
    footerLabel,
    ...matriz.medias_da_rede.por_serie.map((v) => formatPdfDecimal(v)),
    formatPdfDecimal(matriz.medias_da_rede.taxa_geral),
  ];

  return { head: [headRow], body, foot: [footRow], seriesCount };
}

function applyAcertosCellStyle(
  hookData: CellHookData,
  seriesCount: number,
  matriz: MatrizEscolaSerie
): void {
  const col = hookData.column.index;
  const { primary, textDark } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  const taxaCol = 2 + seriesCount;

  if (hookData.section === 'head') {
    hookData.cell.styles.fillColor = primary;
    hookData.cell.styles.textColor = [255, 255, 255];
    hookData.cell.styles.fontStyle = 'bold';
    hookData.cell.styles.halign = col === 1 ? 'left' : 'center';
    hookData.cell.styles.fontSize = col === 1 ? 8 : 7.5;
    return;
  }

  hookData.cell.styles.halign = col === 1 ? 'left' : 'center';

  if (hookData.section === 'body') {
    if (col === 0) {
      hookData.cell.styles.textColor = primary;
      hookData.cell.styles.fontStyle = 'bold';
      return;
    }

    if (col === 1) {
      hookData.cell.styles.fontStyle = 'bold';
      hookData.cell.styles.textColor = textDark;
      return;
    }

    if (col >= 2 && col <= taxaCol) {
      const linha = matriz.linhas[hookData.row.index];
      if (!linha) return;
      const valor =
        col === taxaCol
          ? linha.taxa_geral_escola
          : (linha.valores_por_serie[col - 2] ?? null);
      const style = resolveAcertosMetaPdfCellStyle(valor);
      if (style) {
        hookData.cell.styles.fillColor = style.fill;
        hookData.cell.styles.textColor = style.text;
      }
      hookData.cell.styles.fontStyle = 'bold';
    }
    return;
  }

  if (hookData.section === 'foot') {
    hookData.cell.styles.fontStyle = 'bold';

    if (col === 1) {
      hookData.cell.styles.textColor = primary;
      return;
    }

    if (col >= 2 && col <= taxaCol) {
      const valor =
        col === taxaCol
          ? matriz.medias_da_rede.taxa_geral
          : (matriz.medias_da_rede.por_serie[col - 2] ?? null);
      const style = resolveAcertosMetaPdfCellStyle(valor);
      if (style) {
        hookData.cell.styles.fillColor = style.fill;
        hookData.cell.styles.textColor = style.text;
      }
    }
  }
}

async function drawAcertosMatrizTable(
  doc: jsPDF,
  ctx: PageLayoutContext,
  matriz: MatrizEscolaSerie,
  seriesColunas: SerieColuna[],
  footerLabel: string,
  startY: number,
  firstPageNumber: number
): Promise<number> {
  const { default: autoTable } = await import('jspdf-autotable');
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = PDF_MARGIN_X;
  const marginR = PDF_MARGIN_X;
  const tableWidth = pageW - marginL - marginR;
  const { head, body, foot, seriesCount } = buildTableData(seriesColunas, matriz, footerLabel);

  const headerParams = {
    logo: ctx.logo,
    institutionName: ctx.institutionName,
    year: ctx.year,
  };

  autoTable(doc, {
    head,
    body: body.length ? body : [['—', 'Nenhuma escola com dados', ...Array(seriesCount + 1).fill('—')]],
    foot: body.length ? foot : undefined,
    startY,
    theme: 'grid',
    showHead: 'everyPage',
    margin: {
      left: marginL,
      right: marginR,
      top: PDF_TABLE_TOP_MARGIN,
      bottom: PDF_TABLE_BOTTOM_MARGIN,
    },
    tableWidth,
    headStyles: {
      fillColor: RELATORIO_CONSOLIDADO_PDF_COLORS.primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      valign: 'middle',
      lineColor: RELATORIO_CONSOLIDADO_PDF_COLORS.lineMuted,
      lineWidth: 0.15,
    },
    bodyStyles: {
      fontSize: 8.2,
      valign: 'middle',
      halign: 'center',
      lineColor: RELATORIO_CONSOLIDADO_PDF_COLORS.lineMuted,
      lineWidth: 0.12,
      textColor: RELATORIO_CONSOLIDADO_PDF_COLORS.textDark,
      cellPadding: { top: 2.4, right: 1.5, bottom: 2.4, left: 1.5 },
    },
    footStyles: {
      fontSize: 8.2,
      valign: 'middle',
      halign: 'center',
      lineColor: RELATORIO_CONSOLIDADO_PDF_COLORS.lineMuted,
      lineWidth: 0.15,
      fillColor: [255, 255, 255],
      textColor: RELATORIO_CONSOLIDADO_PDF_COLORS.textDark,
      cellPadding: { top: 2.5, right: 1.5, bottom: 2.5, left: 2 },
    },
    columnStyles: buildColumnStyles(seriesCount, tableWidth),
    didParseCell: (hookData) => {
      if (!body.length && hookData.section === 'body') return;
      applyAcertosCellStyle(hookData, seriesCount, matriz);
    },
    willDrawPage: (hookData) => {
      const pageNumber = doc.getCurrentPageInfo().pageNumber;
      if (pageNumber > firstPageNumber) {
        hookData.settings.margin.top = PDF_TABLE_TOP_MARGIN;
        paintPdfWhitePage(doc);
        drawRelatorioConsolidadoInternalHeader(doc, headerParams);
      }
    },
  } as UserOptions);

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  return finalY ?? startY + 20;
}

function ensurePageSpace(ctx: PageLayoutContext, y: number, needed: number): number {
  if (y + needed <= PDF_PAGE_BOTTOM) return y;

  ctx.doc.addPage();
  paintPdfWhitePage(ctx.doc);
  return (
    drawRelatorioConsolidadoInternalHeader(ctx.doc, {
      logo: ctx.logo,
      institutionName: ctx.institutionName,
      year: ctx.year,
    }) + 4
  );
}

function measureRowHeight(
  doc: jsPDF,
  habilidade: HabilidadeConsolidada,
  textW: number
): number {
  const lines = doc.splitTextToSize(buildHabilidadeLinhaTexto(habilidade), textW) as string[];
  return Math.max(8, lines.length * 4.1 + 3);
}

function drawCardSegment(
  doc: jsPDF,
  variant: HabilidadeMetaVariant,
  habilidades: HabilidadeConsolidada[],
  x: number,
  y: number,
  width: number
): number {
  const styles = HABILIDADES_PDF_CARD_STYLES[variant];
  const padX = 5;
  const padY = 4;
  const pctColW = 14;
  const textW = width - padX * 2 - pctColW - 2;
  const headerH = 9;
  const headerText = getHabilidadeMetaCardTitle(variant);

  const rowsH = habilidades.reduce((acc, h) => acc + measureRowHeight(doc, h, textW), 0);
  const cardH = padY + headerH + 2 + rowsH + padY;

  doc.setFillColor(...styles.fill);
  if (typeof doc.roundedRect === 'function') {
    doc.roundedRect(x, y, width, cardH, 3, 3, 'F');
  } else {
    doc.rect(x, y, width, cardH, 'F');
  }

  doc.setFillColor(...styles.border);
  doc.rect(x, y, 2.5, cardH, 'F');

  let cursorY = y + padY + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...styles.text);
  doc.text(headerText, x + padX + 1, cursorY);
  cursorY += headerH;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);

  for (let i = 0; i < habilidades.length; i++) {
    const h = habilidades[i];
    const rowH = measureRowHeight(doc, h, textW);
    const rowTop = cursorY;

    if (i > 0) {
      doc.setDrawColor(...styles.divider);
      doc.setLineWidth(0.15);
      doc.line(x + padX, rowTop, x + width - padX, rowTop);
    }

    const lines = doc.splitTextToSize(buildHabilidadeLinhaTexto(h), textW) as string[];
    doc.text(lines, x + padX + 1, rowTop + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.text(
      formatHabilidadePercentDisplay(h.percentual),
      x + width - padX - 1,
      rowTop + 4.5,
      { align: 'right' }
    );
    doc.setFont('helvetica', 'normal');

    cursorY += rowH;
  }

  return y + cardH + 6;
}

function estimateCardHeight(
  doc: jsPDF,
  habilidades: HabilidadeConsolidada[],
  width: number
): number {
  const padX = 5;
  const padY = 4;
  const pctColW = 14;
  const textW = width - padX * 2 - pctColW - 2;
  const headerH = 9;
  const rowsH = habilidades.reduce((acc, h) => acc + measureRowHeight(doc, h, textW), 0);
  return padY + headerH + 2 + rowsH + padY + 6;
}

function takeHabilidadesForPage(
  doc: jsPDF,
  habilidades: HabilidadeConsolidada[],
  startY: number,
  width: number
): HabilidadeConsolidada[] {
  const padX = 5;
  const padY = 4;
  const pctColW = 14;
  const textW = width - padX * 2 - pctColW - 2;
  const headerBlock = padY + 9 + 2 + padY;

  const chunk: HabilidadeConsolidada[] = [];
  let used = startY + headerBlock;

  for (const h of habilidades) {
    const rowH = measureRowHeight(doc, h, textW);
    if (chunk.length > 0 && used + rowH > PDF_PAGE_BOTTOM) break;
    if (chunk.length === 0 && startY + headerBlock + rowH > PDF_PAGE_BOTTOM) {
      chunk.push(h);
      break;
    }
    chunk.push(h);
    used += rowH;
  }

  return chunk.length ? chunk : [habilidades[0]];
}

function drawHabilidadeMetaCards(
  ctx: PageLayoutContext,
  variant: HabilidadeMetaVariant,
  habilidades: HabilidadeConsolidada[],
  startY: number,
  contentW: number
): number {
  if (!habilidades.length) return startY;

  const marginL = PDF_MARGIN_X;
  let y = startY;
  let remaining = [...habilidades];

  while (remaining.length > 0) {
    const segment = takeHabilidadesForPage(ctx.doc, remaining, y, contentW);
    y = ensurePageSpace(ctx, y, estimateCardHeight(ctx.doc, segment, contentW));
    y = drawCardSegment(ctx.doc, variant, segment, marginL, y, contentW);
    remaining = remaining.slice(segment.length);
  }

  return y;
}

function buildHabilidadesSectionTitle(report: RelatorioConsolidado): string {
  const faixa = buildFaixaSeriesSubtitle(report);
  return `6. Acertos por Habilidade - ${faixa.titulo}`;
}

async function drawAcertosHabilidadeDisciplinaPage(
  doc: jsPDF,
  params: AcertosHabilidadePagesParams,
  ctx: PageLayoutContext,
  disciplina: string,
  subsectionIndex: number,
  isFirstDisciplinaPage: boolean
): Promise<void> {
  const bloco = getAcertosHabilidadeBloco(
    params.report.consideracoes_gerais.acertos_por_habilidade,
    disciplina
  );
  const matriz = bloco?.matriz;
  const habilidades = bloco?.habilidades ?? [];
  const seriesColunas = params.report.series_colunas ?? [];
  const footerLabel = getMediasRedeFooterLabel(params.report);

  doc.addPage();
  const firstPageNumber = doc.getNumberOfPages();
  const { pageW } = paintPdfWhitePage(doc);

  const marginL = PDF_MARGIN_X;
  const marginR = PDF_MARGIN_X;
  const contentW = pageW - marginL - marginR;

  let y = drawRelatorioConsolidadoInternalHeader(doc, {
    logo: params.logo,
    institutionName: params.institutionName,
    year: params.year,
  });

  if (isFirstDisciplinaPage) {
    y = drawRelatorioConsolidadoSectionTitle(doc, buildHabilidadesSectionTitle(params.report), y, marginL);
    y += 4;
  } else {
    y += 2;
  }

  y = drawSubsectionTitle(
    doc,
    buildMediasSubsectionLabel(params.report, 6, subsectionIndex, disciplina),
    y,
    marginL
  );
  y += 2;

  if (matriz && (matriz.linhas.length > 0 || seriesColunas.length > 0)) {
    y = drawTableBand(
      doc,
      marginL,
      contentW,
      y,
      buildMediasTableBandLabel(disciplina, 'Acertos por Escola')
    );
    y = await drawAcertosMatrizTable(
      doc,
      ctx,
      matriz,
      seriesColunas,
      footerLabel,
      y,
      firstPageNumber
    );
    y += 6;
  }

  if (habilidades.length > 0) {
    y = ensurePageSpace(ctx, y, 24);
    const { dentroDaMeta, abaixoDaMeta } = splitHabilidadesPorMeta(habilidades);
    y = drawHabilidadeMetaCards(ctx, 'dentro', dentroDaMeta, y, contentW);
    y = drawHabilidadeMetaCards(ctx, 'abaixo', abaixoDaMeta, y, contentW);
  } else if (!matriz?.linhas.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...RELATORIO_CONSOLIDADO_PDF_COLORS.textGray);
    doc.text('Nenhuma habilidade consolidada para esta disciplina.', marginL, y + 4);
  }
}

/**
 * Seção 6 — Acertos por Habilidade (matriz + cards ≥60% / <60%).
 */
export async function drawRelatorioConsolidadoAcertosHabilidadePages(
  doc: jsPDF,
  params: AcertosHabilidadePagesParams
): Promise<void> {
  const disciplinas = getMediasPdfDisciplinas(params.report);
  const ctx: PageLayoutContext = {
    doc,
    logo: params.logo,
    institutionName: params.institutionName,
    year: params.year,
  };

  for (let i = 0; i < disciplinas.length; i++) {
    await drawAcertosHabilidadeDisciplinaPage(
      doc,
      params,
      ctx,
      disciplinas[i],
      i + 1,
      i === 0
    );
  }
}
