import type { jsPDF } from 'jspdf';
import type { CellHookData, UserOptions } from 'jspdf-autotable';
import type { PdfImageAsset } from '@/utils/pdfCityBranding';
import type { MatrizDistribuicao, RelatorioConsolidado, SerieColuna } from '@/types/relatorio-consolidado';
import { getMatrizDistribuicao } from '@/utils/reports/relatorioConsolidadoDisciplinas';
import {
  getMediasPdfDisciplinas,
  buildMediasSubsectionLabel,
} from '@/services/reports/relatorioConsolidadoPdf/buildMediasIntroData';
import { getMediasRedeFooterLabel } from '@/utils/reports/relatorioConsolidadoComparativo';
import {
  formatDistribuicaoContagem,
  formatDistribuicaoPercent,
  formatDistribuicaoTotalAlunos,
  getDistribuicaoPrimarySource,
  getDistribuicaoRedeSource,
  isDistribuicaoComparativo,
  LEGENDA_PROFICIENCIA_ROWS,
  PROFICIENCIA_FAIXA_ORDER,
} from '@/utils/reports/relatorioConsolidadoDistribuicao';
import {
  relatorioSecaoTitle,
  RELATORIO_SECAO_DISTRIBUICAO,
} from '@/utils/reports/relatorioConsolidadoSectionTitles';
import { RELATORIO_CONSOLIDADO_PDF_COLORS } from './drawCoverPage';
import {
  getProficienciaFaixaStyle,
  MEDIAS_PDF_COLUMN_COLORS,
  type ProficienciaFaixaKey,
} from './proficienciaPdfCellStyles';
import {
  drawRelatorioConsolidadoInternalHeader,
  drawRelatorioConsolidadoSectionTitle,
  formatPdfUpper,
  paintPdfWhitePage,
  PDF_MARGIN_X,
} from './pdfShared';

export type DistribuicaoProficienciaPagesParams = {
  report: RelatorioConsolidado;
  logo: PdfImageAsset | null;
  institutionName?: string;
  year?: number;
};

const PDF_TABLE_TOP_MARGIN = 58;
const PDF_TABLE_BOTTOM_MARGIN = 22;

const FOOTER_LABEL_FILL: [number, number, number] = [243, 232, 255];
const FOOTER_LABEL_TEXT: [number, number, number] = [91, 33, 182];

function drawSubsectionTitle(doc: jsPDF, label: string, y: number, marginL: number): number {
  const { primary } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...primary);
  doc.text(label, marginL, y);
  return y + 7;
}

function drawQuantitativoSubtitle(doc: jsPDF, label: string, y: number, marginL: number): number {
  const { primary } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...primary);
  doc.text(label, marginL, y);
  return y + 6;
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
  const labelW = Math.min(52, tableWidth * 0.28);
  const totalW = Math.min(22, tableWidth * 0.12);
  const seriesTotal = tableWidth - labelW - totalW;
  const serieW = seriesCount > 0 ? seriesTotal / seriesCount : 14;

  const base: Record<number, { cellWidth: number; halign?: 'left' | 'center' | 'right' }> = {
    0: { cellWidth: labelW, halign: 'left' },
  };
  for (let i = 0; i < seriesCount; i++) {
    base[1 + i] = { cellWidth: serieW, halign: 'center' };
  }
  base[1 + seriesCount] = { cellWidth: totalW, halign: 'center' };

  return scaleColumnWidths(base, tableWidth) as Record<number, Partial<import('jspdf-autotable').Styles>>;
}

type PivotTableKind = 'percent' | 'count';

function buildPivotTableData(
  seriesColunas: SerieColuna[],
  primary: ReturnType<typeof getDistribuicaoPrimarySource>,
  kind: PivotTableKind
): { head: string[][]; body: string[][]; seriesCount: number } {
  const headRow = [
    'NÍVEIS DE PROFICIÊNCIA',
    ...seriesColunas.map((c) => formatPdfUpper(c.serie_nome)),
    kind === 'percent' ? 'MÉDIA' : 'TOTAL',
  ];

  const body = PROFICIENCIA_FAIXA_ORDER.map((faixa) => {
    const label = LEGENDA_PROFICIENCIA_ROWS.find((r) => r.key === faixa)?.label ?? faixa;
    const seriesCells = primary.por_serie.map((celula) =>
      kind === 'percent'
        ? formatDistribuicaoPercent(celula, faixa)
        : formatDistribuicaoContagem(celula, faixa)
    );
    const totalCell =
      kind === 'percent'
        ? formatDistribuicaoPercent(primary.taxa_geral, faixa)
        : formatDistribuicaoContagem(primary.taxa_geral, faixa);
    return [label, ...seriesCells, totalCell];
  });

  return { head: [headRow], body, seriesCount: seriesColunas.length };
}

function buildRedeFooterRows(
  rede: ReturnType<typeof getDistribuicaoRedeSource>,
  footerLabel: string,
  kind: PivotTableKind
): string[][] {
  return PROFICIENCIA_FAIXA_ORDER.map((faixa, idx) => {
    const label = idx === 0 ? `${footerLabel} (%)` : ' ';
    const seriesCells = rede.por_serie.map((celula) =>
      kind === 'percent'
        ? formatDistribuicaoPercent(celula, faixa)
        : formatDistribuicaoContagem(celula, faixa)
    );
    const totalCell = formatDistribuicaoPercent(rede.taxa_geral, faixa);
    return [label, ...seriesCells, totalCell];
  });
}

function buildPercentTableBody(
  seriesColunas: SerieColuna[],
  primary: ReturnType<typeof getDistribuicaoPrimarySource>,
  comparativo: boolean,
  rede: ReturnType<typeof getDistribuicaoRedeSource>,
  footerRedeLabel: string
): string[][] {
  const body = PROFICIENCIA_FAIXA_ORDER.map((faixa) => {
    const label = LEGENDA_PROFICIENCIA_ROWS.find((r) => r.key === faixa)?.label ?? faixa;
    const seriesCells = primary.por_serie.map((celula) =>
      formatDistribuicaoPercent(celula, faixa)
    );
    return [label, ...seriesCells, formatDistribuicaoPercent(primary.taxa_geral, faixa)];
  });

  if (comparativo) {
    body.push(...buildRedeFooterRows(rede, footerRedeLabel, 'percent'));
  }

  return body;
}

function buildTotalAlunosFooterRow(
  seriesColunas: SerieColuna[],
  primary: ReturnType<typeof getDistribuicaoPrimarySource>
): string[][] {
  const seriesCells = primary.por_serie.map((celula) => formatDistribuicaoTotalAlunos(celula));
  return [['TOTAL DE ALUNOS', ...seriesCells, formatDistribuicaoTotalAlunos(primary.taxa_geral)]];
}

function applyPivotBodyStyle(
  hookData: CellHookData,
  seriesCount: number,
  comparativoRedeStartRow: number | null
): void {
  const col = hookData.column.index;
  const { primary } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  const totalCol = 1 + seriesCount;

  if (hookData.section === 'head') {
    hookData.cell.styles.fillColor = primary;
    hookData.cell.styles.textColor = [255, 255, 255];
    hookData.cell.styles.fontStyle = 'bold';
    hookData.cell.styles.halign = col === 0 ? 'left' : 'center';
    hookData.cell.styles.fontSize = 7.5;
    return;
  }

  if (hookData.section !== 'body') return;

  hookData.cell.styles.halign = col === 0 ? 'left' : 'center';
  hookData.cell.styles.fontStyle = 'bold';
  hookData.cell.styles.fontSize = 8.2;

  const rowIdx = hookData.row.index;
  const isRedeRow =
    comparativoRedeStartRow != null && rowIdx >= comparativoRedeStartRow;
  const faixaIdx = isRedeRow ? rowIdx - comparativoRedeStartRow! : rowIdx;
  const faixa = PROFICIENCIA_FAIXA_ORDER[faixaIdx];

  if (col === 0) {
    if (isRedeRow) {
      // Primeira coluna das linhas de rede: mostra label apenas na primeira linha
      hookData.cell.styles.fillColor = FOOTER_LABEL_FILL;
      hookData.cell.styles.textColor = FOOTER_LABEL_TEXT;
    } else if (faixa) {
      // Primeira coluna das linhas primárias: cor do nível
      const style = getProficienciaFaixaStyle(faixa);
      hookData.cell.styles.fillColor = style.fill;
      hookData.cell.styles.textColor = style.text;
    }
    return;
  }

  if (isRedeRow) {
    // Linhas de média municipal: usar cores roxas claras, EXCETO coluna MÉDIA
    if (col === totalCol) {
      // Coluna MÉDIA sempre com cor especial de footerMedia
      hookData.cell.styles.fillColor = MEDIAS_PDF_COLUMN_COLORS.footerMedia.fill;
      hookData.cell.styles.textColor = MEDIAS_PDF_COLUMN_COLORS.footerMedia.text;
    } else {
      // Demais colunas: cor roxa clara padrão
      hookData.cell.styles.fillColor = FOOTER_LABEL_FILL;
      hookData.cell.styles.textColor = FOOTER_LABEL_TEXT;
    }
    return;
  }

  if (col === totalCol) {
    hookData.cell.styles.fillColor = MEDIAS_PDF_COLUMN_COLORS.media.fill;
    hookData.cell.styles.textColor = MEDIAS_PDF_COLUMN_COLORS.media.text;
  }
}

function applyPivotFootStyle(
  hookData: CellHookData,
  seriesCount: number,
  footRowCount: number,
  isRedeBenchmark: boolean
): void {
  const col = hookData.column.index;
  const totalCol = 1 + seriesCount;
  const footRowIdx = hookData.row.index;
  const isLastFootRow = footRowIdx === footRowCount - 1;

  hookData.cell.styles.fontStyle = 'bold';
  hookData.cell.styles.fontSize = 8.2;
  hookData.cell.styles.halign = col === 0 ? 'left' : 'center';

  if (col === 0) {
    hookData.cell.styles.fillColor = FOOTER_LABEL_FILL;
    hookData.cell.styles.textColor = FOOTER_LABEL_TEXT;
    return;
  }

  if (isRedeBenchmark && col === totalCol && isLastFootRow) {
    hookData.cell.styles.fillColor = MEDIAS_PDF_COLUMN_COLORS.footerMedia.fill;
    hookData.cell.styles.textColor = MEDIAS_PDF_COLUMN_COLORS.footerMedia.text;
    return;
  }

  if (col === totalCol && !isRedeBenchmark) {
    hookData.cell.styles.fillColor = MEDIAS_PDF_COLUMN_COLORS.footerMedia.fill;
    hookData.cell.styles.textColor = MEDIAS_PDF_COLUMN_COLORS.footerMedia.text;
    return;
  }

  hookData.cell.styles.fillColor = FOOTER_LABEL_FILL;
  hookData.cell.styles.textColor = FOOTER_LABEL_TEXT;
}

async function drawPivotTable(
  doc: jsPDF,
  headerParams: { logo: PdfImageAsset | null; institutionName?: string; year?: number },
  seriesColunas: SerieColuna[],
  head: string[][],
  body: string[][],
  foot: string[][] | undefined,
  startY: number,
  firstPageNumber: number,
  comparativoRedeStartRow: number | null
): Promise<number> {
  const { default: autoTable } = await import('jspdf-autotable');
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = PDF_MARGIN_X;
  const marginR = PDF_MARGIN_X;
  const tableWidth = pageW - marginL - marginR;
  const seriesCount = seriesColunas.length;
  const footRowCount = foot?.length ?? 0;

  autoTable(doc, {
    head,
    body,
    foot: foot?.length ? foot : undefined,
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
    },
    bodyStyles: {
      fontSize: 8.2,
      halign: 'center',
      valign: 'middle',
      lineColor: RELATORIO_CONSOLIDADO_PDF_COLORS.lineMuted,
      lineWidth: 0.12,
      cellPadding: { top: 2.6, right: 1.5, bottom: 2.6, left: 2 },
    },
    footStyles: {
      fontSize: 8.2,
      halign: 'center',
      valign: 'middle',
      lineColor: RELATORIO_CONSOLIDADO_PDF_COLORS.lineMuted,
      lineWidth: 0.15,
      cellPadding: { top: 2.6, right: 1.5, bottom: 2.6, left: 2 },
    },
    columnStyles: buildColumnStyles(seriesCount, tableWidth),
    didParseCell: (hookData) => {
      if (hookData.section === 'body') {
        applyPivotBodyStyle(hookData, seriesCount, comparativoRedeStartRow);
      }
      if (hookData.section === 'foot') {
        applyPivotFootStyle(hookData, seriesCount, footRowCount, false);
      }
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

async function drawDistribuicaoDisciplinaPage(
  doc: jsPDF,
  params: DistribuicaoProficienciaPagesParams,
  disciplina: string,
  subsectionIndex: number,
  isFirstDisciplinaPage: boolean
): Promise<void> {
  const matriz = getMatrizDistribuicao(params.report.distribuicao_niveis_proficiencia, disciplina);
  const seriesColunas = params.report.series_colunas ?? [];
  if (!matriz) return;

  const comparativo = isDistribuicaoComparativo(params.report);
  const primary = getDistribuicaoPrimarySource(matriz, comparativo);
  const rede = getDistribuicaoRedeSource(matriz);
  const footerRedeLabel = getMediasRedeFooterLabel(params.report);

  doc.addPage();
  const firstPageNumber = doc.getNumberOfPages();
  paintPdfWhitePage(doc);

  const marginL = PDF_MARGIN_X;
  const headerParams = {
    logo: params.logo,
    institutionName: params.institutionName,
    year: params.year,
  };

  let y = drawRelatorioConsolidadoInternalHeader(doc, headerParams);

  if (isFirstDisciplinaPage) {
    y = drawRelatorioConsolidadoSectionTitle(
      doc,
      relatorioSecaoTitle(7, RELATORIO_SECAO_DISTRIBUICAO),
      y,
      marginL
    );
    y += 4;
  } else {
    y += 2;
  }

  y = drawSubsectionTitle(
    doc,
    buildMediasSubsectionLabel(params.report, 7, subsectionIndex, disciplina),
    y,
    marginL
  );
  y += 2;

  const pctHead = buildPivotTableData(seriesColunas, primary, 'percent').head;
  const pctBody = buildPercentTableBody(
    seriesColunas,
    primary,
    comparativo,
    rede,
    footerRedeLabel
  );
  const redeStartRow = comparativo ? PROFICIENCIA_FAIXA_ORDER.length : null;

  y = await drawPivotTable(
    doc,
    headerParams,
    seriesColunas,
    pctHead,
    pctBody,
    undefined,
    y,
    firstPageNumber,
    redeStartRow
  );
  y += 6;

  y = drawQuantitativoSubtitle(
    doc,
    `${7}.${subsectionIndex}.1. Quantitativo de Alunos por Nível`,
    y,
    marginL
  );
  y += 2;

  const cntTable = buildPivotTableData(seriesColunas, primary, 'count');
  const cntFoot = buildTotalAlunosFooterRow(seriesColunas, primary);

  await drawPivotTable(
    doc,
    headerParams,
    seriesColunas,
    cntTable.head,
    cntTable.body,
    cntFoot,
    y,
    doc.getNumberOfPages(),
    null
  );
}

/**
 * Seção 7 — Distribuição dos Níveis de Proficiência (pivot nível × série).
 */
export async function drawRelatorioConsolidadoDistribuicaoPages(
  doc: jsPDF,
  params: DistribuicaoProficienciaPagesParams
): Promise<void> {
  const disciplinas = getMediasPdfDisciplinas(params.report);

  for (let i = 0; i < disciplinas.length; i++) {
    await drawDistribuicaoDisciplinaPage(doc, params, disciplinas[i], i + 1, i === 0);
  }
}
