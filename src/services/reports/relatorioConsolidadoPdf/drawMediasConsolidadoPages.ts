import type { jsPDF } from 'jspdf';
import type { CellHookData, UserOptions } from 'jspdf-autotable';
import type { PdfImageAsset } from '@/utils/pdfCityBranding';
import type { MatrizEscolaSerie, RelatorioConsolidado, SecaoMatrizNumerica, SerieColuna } from '@/types/relatorio-consolidado';
import { getMatrizNumerica } from '@/utils/reports/relatorioConsolidadoDisciplinas';
import { getMediasRedeFooterLabel } from '@/utils/reports/relatorioConsolidadoComparativo';
import { RELATORIO_CONSOLIDADO_PDF_COLORS } from './drawCoverPage';
import {
  buildMediasIntroRuns,
  buildMediasSubsectionLabel,
  buildMediasTableBandLabel,
  getMediasPdfDisciplinas,
} from './buildMediasIntroData';
import { buildFaixaSeriesSubtitle } from './buildFaixaSeriesSubtitle';
import {
  relatorioSecaoTitle,
  RELATORIO_SECAO_MEDIA_NOTA,
  RELATORIO_SECAO_MEDIA_PROFICIENCIA,
} from '@/utils/reports/relatorioConsolidadoSectionTitles';
import {
  resolveMediasValorCellStyle,
  type MediasPdfMetricKind,
  type MediasValorStyleContext,
} from './classifyMediasPdfFaixa';
import { MEDIAS_PDF_COLUMN_COLORS } from './proficienciaPdfCellStyles';
import {
  drawPdfTextRuns,
  drawRelatorioConsolidadoInternalHeader,
  drawRelatorioConsolidadoSectionTitle,
  formatPdfDecimal,
  formatPdfUpper,
  paintPdfWhitePage,
  PDF_MARGIN_X,
} from './pdfShared';

export type MediasConsolidadoPagesParams = {
  report: RelatorioConsolidado;
  logo: PdfImageAsset | null;
  institutionName?: string;
  year?: number;
};

export type MediasConsolidadoSectionConfig = {
  sectionNumber: number;
  sectionTitle: string;
  tableBandSuffix: string;
  metricKind: MediasPdfMetricKind;
  getSecao: (report: RelatorioConsolidado) => SecaoMatrizNumerica;
};

type MediasTableStyleContext = {
  metricKind: MediasPdfMetricKind;
  disciplina: string;
  faixaTitulo: string;
  seriesColunas: SerieColuna[];
};

const PDF_TABLE_TOP_MARGIN = 58;
const PDF_TABLE_BOTTOM_MARGIN = 22;

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

function readLinhaNivel(linha: MatrizEscolaSerie['linhas'][number], serieIdx: number): string | null | undefined {
  return linha.niveis_por_serie?.[serieIdx] ?? null;
}

function applyMediasCellStyle(
  hookData: CellHookData,
  seriesCount: number,
  matriz: MatrizEscolaSerie,
  styleContext: MediasTableStyleContext
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
      hookData.cell.styles.textColor = primary;
      hookData.cell.styles.fontStyle = 'bold';
      return;
    }

    if (col === 1) {
      hookData.cell.styles.fontStyle = 'bold';
      hookData.cell.styles.textColor = textDark;
      hookData.cell.styles.fontSize = 7.8;
      return;
    }

    const mediaCol = 2 + seriesCount;
    if (col === mediaCol) {
      hookData.cell.styles.fillColor = MEDIAS_PDF_COLUMN_COLORS.media.fill;
      hookData.cell.styles.textColor = MEDIAS_PDF_COLUMN_COLORS.media.text;
      hookData.cell.styles.fontStyle = 'bold';
      return;
    }

    if (col >= 2 && col < mediaCol) {
      const serieIdx = col - 2;
      const valor = linha.valores_por_serie[serieIdx] ?? null;
      const nivel = readLinhaNivel(linha, serieIdx);
      const valorContext: MediasValorStyleContext = {
        metricKind: styleContext.metricKind,
        disciplina: styleContext.disciplina,
        serieNome: styleContext.seriesColunas[serieIdx]?.serie_nome,
        faixaTitulo: styleContext.faixaTitulo,
      };
      const style = resolveMediasValorCellStyle(valor, nivel, valorContext);
      hookData.cell.styles.fillColor = style.fill;
      hookData.cell.styles.textColor = style.text;
      hookData.cell.styles.fontStyle = 'bold';
    }
    return;
  }

  if (hookData.section === 'foot') {
    const mediaCol = 2 + seriesCount;
    hookData.cell.styles.halign = col === 1 ? 'left' : 'center';

    if (col === 1) {
      hookData.cell.styles.textColor = primary;
      hookData.cell.styles.fontStyle = 'bold';
      hookData.cell.styles.halign = 'left';
      return;
    }

    if (col === mediaCol) {
      hookData.cell.styles.fillColor = MEDIAS_PDF_COLUMN_COLORS.footerMedia.fill;
      hookData.cell.styles.textColor = MEDIAS_PDF_COLUMN_COLORS.footerMedia.text;
      hookData.cell.styles.fontStyle = 'bold';
      return;
    }

    if (col >= 2 && col < mediaCol) {
      const serieIdx = col - 2;
      const valor = matriz.medias_da_rede.por_serie[serieIdx] ?? null;
      const nivel = matriz.medias_da_rede.niveis_por_serie?.[serieIdx] ?? null;
      const valorContext: MediasValorStyleContext = {
        metricKind: styleContext.metricKind,
        disciplina: styleContext.disciplina,
        serieNome: styleContext.seriesColunas[serieIdx]?.serie_nome,
        faixaTitulo: styleContext.faixaTitulo,
      };
      const style = resolveMediasValorCellStyle(valor, nivel, valorContext);
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
    'MÉDIA',
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

async function drawMediasTable(
  doc: jsPDF,
  params: MediasConsolidadoPagesParams,
  config: MediasConsolidadoSectionConfig,
  disciplina: string,
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
  const faixaTitulo = buildFaixaSeriesSubtitle(params.report).titulo;
  const styleContext: MediasTableStyleContext = {
    metricKind: config.metricKind,
    disciplina,
    faixaTitulo,
    seriesColunas,
  };

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
      applyMediasCellStyle(hookData, seriesCount, matriz, styleContext);
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

async function drawMediasDisciplinaPage(
  doc: jsPDF,
  params: MediasConsolidadoPagesParams,
  config: MediasConsolidadoSectionConfig,
  disciplina: string,
  subsectionIndex: number,
  isFirstDisciplinaPage: boolean
): Promise<void> {
  const secao = config.getSecao(params.report);
  const matriz = getMatrizNumerica(secao, disciplina);
  const seriesColunas = params.report.series_colunas ?? [];

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
    y = drawRelatorioConsolidadoSectionTitle(doc, config.sectionTitle, y, marginL);
    y += 4;
    y = drawPdfTextRuns(doc, buildMediasIntroRuns(params.report), marginL, y, contentW, 10);
    y += 6;
  } else {
    y += 2;
  }

  y = drawSubsectionTitle(
    doc,
    buildMediasSubsectionLabel(params.report, config.sectionNumber, subsectionIndex, disciplina),
    y,
    marginL
  );
  y += 2;

  y = drawTableBand(
    doc,
    marginL,
    contentW,
    y,
    buildMediasTableBandLabel(disciplina, config.tableBandSuffix)
  );

  if (matriz && (matriz.linhas.length > 0 || seriesColunas.length > 0)) {
    await drawMediasTable(
      doc,
      params,
      config,
      disciplina,
      matriz,
      seriesColunas,
      y,
      firstPageNumber
    );
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...RELATORIO_CONSOLIDADO_PDF_COLORS.textGray);
    doc.text('Nenhum dado disponível para esta disciplina.', marginL, y + 4);
  }
}

export async function drawRelatorioConsolidadoMediasSectionPages(
  doc: jsPDF,
  params: MediasConsolidadoPagesParams,
  config: MediasConsolidadoSectionConfig
): Promise<void> {
  const disciplinas = getMediasPdfDisciplinas(params.report);

  for (let i = 0; i < disciplinas.length; i++) {
    await drawMediasDisciplinaPage(doc, params, config, disciplinas[i], i + 1, i === 0);
  }
}

export async function drawRelatorioConsolidadoMediasNotaPages(
  doc: jsPDF,
  params: MediasConsolidadoPagesParams
): Promise<void> {
  await drawRelatorioConsolidadoMediasSectionPages(doc, params, {
    sectionNumber: 4,
    sectionTitle: relatorioSecaoTitle(4, RELATORIO_SECAO_MEDIA_NOTA),
    tableBandSuffix: 'Médias por Escola',
    metricKind: 'nota',
    getSecao: (report) => report.consideracoes_gerais.consolidado_medias_nota,
  });
}

export async function drawRelatorioConsolidadoMediasProficienciaPages(
  doc: jsPDF,
  params: MediasConsolidadoPagesParams
): Promise<void> {
  await drawRelatorioConsolidadoMediasSectionPages(doc, params, {
    sectionNumber: 5,
    sectionTitle: relatorioSecaoTitle(5, RELATORIO_SECAO_MEDIA_PROFICIENCIA),
    tableBandSuffix: 'Proficiência por Escola',
    metricKind: 'proficiencia',
    getSecao: (report) => report.consideracoes_gerais.consolidado_medias_proficiencia,
  });
}
