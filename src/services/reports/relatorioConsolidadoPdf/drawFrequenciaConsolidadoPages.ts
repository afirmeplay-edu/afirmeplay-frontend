import type { jsPDF } from 'jspdf';
import type { CellHookData, UserOptions } from 'jspdf-autotable';
import type { PdfImageAsset } from '@/utils/pdfCityBranding';
import type { MatrizEscolaSerie, RelatorioConsolidado, SerieColuna } from '@/types/relatorio-consolidado';
import { getMatrizNumerica } from '@/utils/reports/relatorioConsolidadoDisciplinas';
import { getMediasRedeFooterLabel } from '@/utils/reports/relatorioConsolidadoComparativo';
import { RELATORIO_CONSOLIDADO_PDF_COLORS } from './drawCoverPage';
import {
  relatorioSecaoTitle,
  RELATORIO_SECAO_FREQUENCIA,
} from '@/utils/reports/relatorioConsolidadoSectionTitles';
import { buildFaixaSeriesSubtitle } from './buildFaixaSeriesSubtitle';
import {
  FREQUENCIA_PDF_CELL_COLORS,
  resolveFrequenciaSerieCellStyle,
} from './frequenciaPdfCellStyles';
import {
  drawRelatorioConsolidadoInternalHeader,
  drawRelatorioConsolidadoSectionTitle,
  formatPdfPercent,
  formatPdfUpper,
  paintPdfWhitePage,
  PDF_MARGIN_X,
} from './pdfShared';

export type FrequenciaConsolidadoPagesParams = {
  report: RelatorioConsolidado;
  logo: PdfImageAsset | null;
  institutionName?: string;
  year?: number;
};

const INTRO_TEXTO =
  'A participação dos estudantes é um elemento fundamental para a representatividade e a confiabilidade dos resultados. A tabela a seguir apresenta os índices de participação por escola e série/ano escolar, permitindo identificar o engajamento da rede na avaliação diagnóstica.';

const PDF_TABLE_TOP_MARGIN = 58;
const PDF_TABLE_BOTTOM_MARGIN = 22;

function formatPercentCell(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return formatPdfPercent(value);
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
  const taxaW = 18;
  const escolaW = Math.min(58, tableWidth * 0.34);
  const seriesTotal = tableWidth - indexW - escolaW - taxaW;
  const serieW = seriesCount > 0 ? seriesTotal / seriesCount : 12;

  const base: Record<number, { cellWidth: number; halign?: 'left' | 'center' | 'right' }> = {
    0: { cellWidth: indexW, halign: 'center' },
    1: { cellWidth: escolaW, halign: 'left' },
  };
  for (let i = 0; i < seriesCount; i++) {
    base[2 + i] = { cellWidth: serieW, halign: 'center' };
  }
  base[2 + seriesCount] = { cellWidth: taxaW, halign: 'center' };

  return scaleColumnWidths(base, tableWidth) as Record<number, Partial<import('jspdf-autotable').Styles>>;
}

function applyFrequenciaCellStyle(
  hookData: CellHookData,
  seriesCount: number,
  matriz: MatrizEscolaSerie
): void {
  const col = hookData.column.index;
  const { primary, textDark } = RELATORIO_CONSOLIDADO_PDF_COLORS;

  if (hookData.section === 'head') {
    hookData.cell.styles.fillColor = primary;
    hookData.cell.styles.textColor = [255, 255, 255];
    hookData.cell.styles.fontStyle = 'bold';
    hookData.cell.styles.halign = col === 1 ? 'left' : 'center';
    hookData.cell.styles.fontSize = col === 1 ? 8 : 7.5;
    return;
  }

  if (hookData.section === 'body') {
    const rowIdx = hookData.row.index;
    const linha = matriz.linhas[rowIdx];
    if (!linha) return;

    hookData.cell.styles.halign = col === 1 ? 'left' : 'center';

    if (col === 0) {
      hookData.cell.styles.textColor = FREQUENCIA_PDF_CELL_COLORS.index;
      hookData.cell.styles.fontStyle = 'bold';
      return;
    }

    if (col === 1) {
      hookData.cell.styles.fontStyle = 'bold';
      hookData.cell.styles.textColor = textDark;
      hookData.cell.styles.fontSize = 7.8;
      hookData.cell.styles.cellPadding = { top: 2, right: 2, bottom: 2, left: 2 };
      return;
    }

    const taxaCol = 2 + seriesCount;
    if (col === taxaCol) {
      hookData.cell.styles.fillColor = FREQUENCIA_PDF_CELL_COLORS.taxaGeral.fill;
      hookData.cell.styles.textColor = FREQUENCIA_PDF_CELL_COLORS.taxaGeral.text;
      hookData.cell.styles.fontStyle = 'bold';
      return;
    }

    if (col >= 2 && col < taxaCol) {
      const serieIdx = col - 2;
      const valor = linha.valores_por_serie[serieIdx] ?? null;
      const style = resolveFrequenciaSerieCellStyle(valor);
      hookData.cell.styles.fillColor = style.fill;
      hookData.cell.styles.textColor = style.text;
      hookData.cell.styles.fontStyle = 'bold';
    }
    return;
  }

  if (hookData.section === 'foot') {
    const taxaCol = 2 + seriesCount;
    hookData.cell.styles.halign = col === 1 ? 'left' : 'center';

    if (col === 1) {
      hookData.cell.styles.textColor = FREQUENCIA_PDF_CELL_COLORS.footerLabel;
      hookData.cell.styles.fontStyle = 'bold';
      hookData.cell.styles.halign = 'left';
      return;
    }

    if (col === taxaCol) {
      const valor = matriz.medias_da_rede.taxa_geral;
      hookData.cell.styles.fillColor = FREQUENCIA_PDF_CELL_COLORS.footerTaxaGeral.fill;
      hookData.cell.styles.textColor = FREQUENCIA_PDF_CELL_COLORS.footerTaxaGeral.text;
      hookData.cell.styles.fontStyle = 'bold';
      return;
    }

    if (col >= 2 && col < taxaCol) {
      const serieIdx = col - 2;
      const valor = matriz.medias_da_rede.por_serie[serieIdx] ?? null;
      const style = resolveFrequenciaSerieCellStyle(valor);
      hookData.cell.styles.fillColor = style.fill;
      hookData.cell.styles.textColor = style.text;
      hookData.cell.styles.fontStyle = 'bold';
    }
  }
}

function drawSubsectionTitle(doc: jsPDF, label: string, y: number, marginL: number): number {
  const { primary } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...primary);
  doc.text(label, marginL, y);
  return y + 7;
}

function drawIntroParagraph(doc: jsPDF, marginL: number, contentW: number, y: number): number {
  const { textGray } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...textGray);
  const lines = doc.splitTextToSize(INTRO_TEXTO, contentW) as string[];
  doc.text(lines, marginL, y);
  return y + lines.length * 4.2 + 4;
}

function buildTableData(
  seriesColunas: SerieColuna[],
  matriz: MatrizEscolaSerie,
  footerLabel: string
): {
  head: string[][];
  body: string[][];
  foot: string[][];
  seriesCount: number;
} {
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
    ...linha.valores_por_serie.map((v) => formatPercentCell(v)),
    formatPercentCell(linha.taxa_geral_escola),
  ]);

  const footRow = [
    '',
    footerLabel,
    ...matriz.medias_da_rede.por_serie.map((v) => formatPercentCell(v)),
    formatPercentCell(matriz.medias_da_rede.taxa_geral),
  ];

  return {
    head: [headRow],
    body,
    foot: [footRow],
    seriesCount,
  };
}

async function drawFrequenciaTable(
  doc: jsPDF,
  params: FrequenciaConsolidadoPagesParams,
  matriz: MatrizEscolaSerie,
  seriesColunas: SerieColuna[],
  startY: number,
  firstPageNumber: number
): Promise<void> {
  const { default: autoTable } = await import('jspdf-autotable');
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = PDF_MARGIN_X;
  const marginR = PDF_MARGIN_X;
  const tableWidth = pageW - marginL - marginR;
  const footerLabel = getMediasRedeFooterLabel(params.report);
  const { head, body, foot, seriesCount } = buildTableData(seriesColunas, matriz, footerLabel);

  const headerParams = {
    logo: params.logo,
    institutionName: params.institutionName,
    year: params.year,
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
      halign: 'center',
      valign: 'middle',
      lineColor: RELATORIO_CONSOLIDADO_PDF_COLORS.lineMuted,
      lineWidth: 0.12,
      textColor: RELATORIO_CONSOLIDADO_PDF_COLORS.textDark,
      cellPadding: { top: 2.4, right: 1.5, bottom: 2.4, left: 1.5 },
    },
    footStyles: {
      fontSize: 8.2,
      halign: 'center',
      valign: 'middle',
      lineColor: RELATORIO_CONSOLIDADO_PDF_COLORS.lineMuted,
      lineWidth: 0.15,
      fillColor: [255, 255, 255],
      textColor: RELATORIO_CONSOLIDADO_PDF_COLORS.textDark,
      cellPadding: { top: 2.5, right: 1.5, bottom: 2.5, left: 2 },
    },
    columnStyles: buildColumnStyles(seriesCount, tableWidth),
    didParseCell: (hookData) => {
      if (!body.length && hookData.section === 'body') return;
      applyFrequenciaCellStyle(hookData, seriesCount, matriz);
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
}

/**
 * Seção 2 — Consolidado de Frequência (matriz GERAL, layout da referência).
 */
export async function drawRelatorioConsolidadoFrequenciaPages(
  doc: jsPDF,
  params: FrequenciaConsolidadoPagesParams
): Promise<{ faixaFromBackend: boolean }> {
  const matriz = getMatrizNumerica(params.report.consolidado_frequencia, 'GERAL');
  const seriesColunas = params.report.series_colunas ?? [];
  const faixa = buildFaixaSeriesSubtitle(params.report);

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

  y = drawRelatorioConsolidadoSectionTitle(
    doc,
    relatorioSecaoTitle(2, RELATORIO_SECAO_FREQUENCIA),
    y,
    marginL
  );
  y += 2;
  y = drawSubsectionTitle(doc, `2.1. ${faixa.titulo}`, y, marginL);
  y = drawIntroParagraph(doc, marginL, contentW, y);

  if (matriz && (matriz.linhas.length > 0 || seriesColunas.length > 0)) {
    await drawFrequenciaTable(doc, params, matriz, seriesColunas, y, firstPageNumber);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...RELATORIO_CONSOLIDADO_PDF_COLORS.textGray);
    doc.text('Nenhum dado de frequência disponível para este recorte.', marginL, y + 4);
  }

  return { faixaFromBackend: faixa.fromBackend };
}
