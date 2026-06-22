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
  formatPdfPercent,
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
const PDF_SAFE_BOTTOM = 268; // Margem de segurança para evitar ultrapassar o rodapé
const CHART_INNER_PAD = 10;
const CHART_TOP_PAD = 15;
const CHART_VALUE_LABEL_RESERVE = 15;

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
    ...linha.valores_por_serie.map((v) => v != null ? formatPdfPercent(v) : '-'),
    linha.taxa_geral_escola != null ? formatPdfPercent(linha.taxa_geral_escola) : '-',
  ]);

  const footRow = [
    '',
    footerLabel,
    ...matriz.medias_da_rede.por_serie.map((v) => v != null ? formatPdfPercent(v) : '-'),
    matriz.medias_da_rede.taxa_geral != null ? formatPdfPercent(matriz.medias_da_rede.taxa_geral) : '-',
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

function ensurePageSpace(ctx: PageLayoutContext, y: number, needed: number, isContinuation: boolean = false): number {
  // Usa o limite seguro para evitar ultrapassar o rodapé
  if (y + needed <= PDF_SAFE_BOTTOM) return y;

  ctx.doc.addPage();
  paintPdfWhitePage(ctx.doc);
  // Menos espaço após o header para continuações (2mm ao invés de 4mm)
  const spacingAfterHeader = isContinuation ? 2 : 4;
  return (
    drawRelatorioConsolidadoInternalHeader(ctx.doc, {
      logo: ctx.logo,
      institutionName: ctx.institutionName,
      year: ctx.year,
    }) + spacingAfterHeader
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
  width: number,
  showHeader: boolean = true,
  isContinuation: boolean = false
): number {
  const styles = HABILIDADES_PDF_CARD_STYLES[variant];
  const padX = 5;
  const padY = 4;
  const pctColW = 14;
  const textW = width - padX * 2 - pctColW - 2;
  const headerH = showHeader ? 9 : 0;
  const headerText = getHabilidadeMetaCardTitle(variant);

  const rowsH = habilidades.reduce((acc, h) => acc + measureRowHeight(doc, h, textW), 0);
  
  // Ajusta padding: continuação tem menos padding no topo
  const topPad = isContinuation ? 2 : padY;
  const headerBlockH = showHeader ? (topPad + headerH + 2) : topPad;
  const cardH = headerBlockH + rowsH + padY;

  doc.setFillColor(...styles.fill);
  if (typeof doc.roundedRect === 'function') {
    doc.roundedRect(x, y, width, cardH, 3, 3, 'F');
  } else {
    doc.rect(x, y, width, cardH, 'F');
  }

  doc.setFillColor(...styles.border);
  doc.rect(x, y, 2.5, cardH, 'F');

  let cursorY = y + topPad;
  
  // Desenha header apenas se showHeader = true
  if (showHeader) {
    cursorY += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...styles.text);
    doc.text(headerText, x + padX + 1, cursorY);
    cursorY += headerH + 2;
  } else {
    cursorY += 2; // Mínimo padding para continuação
  }

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

  // Retorna sem espaço extra se for continuação
  return y + cardH + (isContinuation ? 0 : 6);
}

function estimateCardHeight(
  doc: jsPDF,
  habilidades: HabilidadeConsolidada[],
  width: number,
  showHeader: boolean = true,
  isContinuation: boolean = false
): number {
  const padX = 5;
  const padY = 4;
  const pctColW = 14;
  const textW = width - padX * 2 - pctColW - 2;
  const headerH = showHeader ? 9 : 0;
  const topPad = isContinuation ? 2 : padY;
  const headerBlockH = showHeader ? (topPad + headerH + 2) : topPad;
  const rowsH = habilidades.reduce((acc, h) => acc + measureRowHeight(doc, h, textW), 0);
  const bottomSpacing = isContinuation ? 0 : 6;
  return headerBlockH + rowsH + padY + bottomSpacing;
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
  const cardPadding = 6; // Espaço extra após o card

  const chunk: HabilidadeConsolidada[] = [];
  let used = startY + headerBlock;

  for (const h of habilidades) {
    const rowH = measureRowHeight(doc, h, textW);
    // Verifica se adicionar esta linha ultrapassaria o limite seguro (incluindo padding final)
    if (chunk.length > 0 && used + rowH + padY + cardPadding > PDF_SAFE_BOTTOM) break;
    // Se é a primeira linha e já não cabe, adiciona mesmo assim (evita loop infinito)
    if (chunk.length === 0 && startY + headerBlock + rowH + padY + cardPadding > PDF_SAFE_BOTTOM) {
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
  let isFirstSegment = true; // Controla se é o primeiro segmento

  while (remaining.length > 0) {
    const segment = takeHabilidadesForPage(ctx.doc, remaining, y, contentW);
    const showHeader = isFirstSegment; // Mostra header apenas no primeiro segmento
    const isContinuation = !isFirstSegment; // É continuação se não for o primeiro
    const estimatedHeight = estimateCardHeight(ctx.doc, segment, contentW, showHeader, isContinuation);
    
    // Verifica se há espaço suficiente, se não, muda de página (com menos espaço se for continuação)
    y = ensurePageSpace(ctx, y, estimatedHeight, isContinuation);
    
    // Desenha o card (com ou sem header, marcando se é continuação)
    y = drawCardSegment(ctx.doc, variant, segment, marginL, y, contentW, showHeader, isContinuation);
    
    // Remove as habilidades já desenhadas
    remaining = remaining.slice(segment.length);
    
    // Marca que não é mais o primeiro segmento
    isFirstSegment = false;
    
    // NÃO adiciona espaço entre segmentos - continuidade visual
  }

  return y;
}

function drawHabilidadesBarChart(
  doc: jsPDF,
  habilidades: HabilidadeConsolidada[],
  x: number,
  y: number,
  w: number,
  h: number,
  pageInfo?: string
): number {
  const barsStartX = x + CHART_INNER_PAD;
  const barsW = w - CHART_INNER_PAD * 2;
  const plotTopInset = CHART_TOP_PAD + CHART_VALUE_LABEL_RESERVE;
  const colWidth = barsW / Math.max(1, habilidades.length);
  const innerW = Math.max(6, colWidth - 4);

  const axisMin = 0;
  const axisMax = 100;
  const maxValue = 100;

  // Determina se precisa rotacionar labels (quando há muitas questões ou espaço pequeno)
  const needsRotation = habilidades.length > 8 || colWidth < 12;
  
  // Calcula tamanho da fonte dos labels
  let catFs = Math.min(7.5, Math.max(5.5, 80 / habilidades.length));
  
  // Espaço para labels: maior se rotacionado (precisa de mais espaço para os labels inclinados)
  // Aumentado para garantir que os labels fiquem COMPLETAMENTE abaixo da linha base
  let bottomPad = needsRotation ? Math.max(50, catFs * 10) : Math.max(26, catFs * 1.2 * 2 + 12);
  
  const baselineY = y + h - bottomPad;
  const chartAreaH = baselineY - (y + plotTopInset);
  const catLineH = catFs * 1.2;

  // Título do gráfico (se houver paginação)
  if (pageInfo) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(pageInfo, x + w / 2, y - 3, { align: 'center' });
  }

  // Desenha barras
  habilidades.forEach((habilidade, idx) => {
    const baseX = barsStartX + idx * colWidth + colWidth / 2;
    const value = habilidade.percentual;
    const barH = Math.max(2, (Math.max(0, value - axisMin) / (maxValue - axisMin)) * chartAreaH);
    const barY = baselineY - barH;
    
    // Cor baseada no percentual (>= 60% verde, < 60% vermelho)
    const barColor = value >= 60 ? '#22C55E' : '#EF4444';
    
    // Converter hex para RGB
    const rgb = {
      r: parseInt(barColor.slice(1, 3), 16),
      g: parseInt(barColor.slice(3, 5), 16),
      b: parseInt(barColor.slice(5, 7), 16),
    };
    
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    const singleW = Math.max(4, Math.min(16, innerW * 0.85));
    const singleX = baseX - singleW / 2;
    
    // Desenha barra (com altura mínima visível)
    if (barH > 1) {
      if (typeof doc.roundedRect === 'function' && barH > 4) {
        doc.roundedRect(singleX, barY, singleW, barH, 3, 3, 'F');
      } else {
        doc.rect(singleX, barY, singleW, barH, 'F');
      }
    }
    
    // Label do valor acima da barra (SEMPRE mostrar)
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    // Fonte ajustada: menor quando há muitas habilidades
    const valueFontSize = Math.min(9, Math.max(5.5, 100 / habilidades.length));
    doc.setFontSize(valueFontSize);
    doc.text(`${value.toFixed(1)}%`, baseX, Math.max(y + plotTopInset - 2, barY - 2), { align: 'center' });
  });

  // Labels embaixo: com ou sem rotação
  doc.setFontSize(catFs);
  doc.setTextColor(51, 65, 85);
  
  if (needsRotation) {
    // Labels ROTACIONADOS em 45 graus
    habilidades.forEach((habilidade, idx) => {
      const centerX = barsStartX + idx * colWidth + colWidth / 2;
      // Pequeno offset para a esquerda para evitar sobreposição com a barra
      const baseX = centerX - 2;
      // Posição Y BEM ABAIXO da baseline para garantir que labels não invadam as barras
      // Aumentado de 3 para 8mm abaixo da linha base
      const labY = baselineY + 8;
      
      // Texto combinado: "Q1 - Código"
      doc.setFont('helvetica', 'bold');
      const questaoText = `Q${habilidade.numero_questao}`;
      
      doc.setFont('helvetica', 'normal');
      const codigo = habilidade.codigo.length > 12 ? habilidade.codigo.substring(0, 12) : habilidade.codigo;
      const fullText = codigo ? `${questaoText} - ${codigo}` : questaoText;
      
      // Rotaciona 45 graus e desenha
      doc.saveGraphicsState();
      doc.setFont('helvetica', 'normal');
      const angle = 45;
      
      // Aplica transformação de rotação com baseline 'top' para começar ABAIXO do ponto
      doc.text(fullText, baseX, labY, { 
        angle: angle,
        align: 'left',
        baseline: 'top'
      });
      
      doc.restoreGraphicsState();
    });
  } else {
    // Labels HORIZONTAIS (2 linhas)
    habilidades.forEach((habilidade, idx) => {
      const baseX = barsStartX + idx * colWidth + colWidth / 2;
      let labY = baselineY + 5 + catLineH * 0.72;
      
      // Linha 1: Número da questão (negrito)
      doc.setFont('helvetica', 'bold');
      doc.text(`Q${habilidade.numero_questao}`, baseX, labY, { align: 'center' });
      
      // Linha 2: Código da habilidade (normal, truncado se necessário)
      labY += catLineH;
      doc.setFont('helvetica', 'normal');
      const codigo = habilidade.codigo.length > 10 ? habilidade.codigo.substring(0, 10) : habilidade.codigo;
      doc.text(codigo, baseX, labY, { align: 'center' });
    });
  }

  // Linha de base
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(barsStartX, baselineY, barsStartX + barsW, baselineY);

  return y + h;
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
  const porSerie = bloco?.por_serie ?? [];
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

  if (porSerie.length > 0) {
    for (let i = 0; i < porSerie.length; i++) {
      const serieBloco = porSerie[i];
      
      // SEMPRE começar cada série em uma nova página para evitar quebras
      doc.addPage();
      paintPdfWhitePage(doc);
      y = drawRelatorioConsolidadoInternalHeader(doc, {
        logo: params.logo,
        institutionName: params.institutionName,
        year: params.year,
      });
      y += 4;
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...RELATORIO_CONSOLIDADO_PDF_COLORS.primary);
      doc.text(`${serieBloco.serie_nome} - Acertos por Habilidade`, marginL, y);
      y += 8;

      if (serieBloco.habilidades.length > 0) {
        const { dentroDaMeta, abaixoDaMeta } = splitHabilidadesPorMeta(serieBloco.habilidades);
        
        // Desenha cards "dentro da meta" com paginação automática
        if (dentroDaMeta.length > 0) {
          y = drawHabilidadeMetaCards(ctx, 'dentro', dentroDaMeta, y, contentW);
        }
        
        // Desenha cards "abaixo da meta" com paginação automática
        if (abaixoDaMeta.length > 0) {
          y = drawHabilidadeMetaCards(ctx, 'abaixo', abaixoDaMeta, y, contentW);
        }
        
        // Desenha gráfico de barras com todas as habilidades (ordenadas pela ordem original)
        const habilidadesParaGrafico = [...serieBloco.habilidades].sort(
          (a, b) => a.ordem_original - b.ordem_original
        );
        
        if (habilidadesParaGrafico.length > 0) {
          // PAGINAÇÃO: Divide em chunks de no máximo 12 questões por gráfico
          const MAX_QUESTOES_POR_GRAFICO = 12;
          const totalChunks = Math.ceil(habilidadesParaGrafico.length / MAX_QUESTOES_POR_GRAFICO);
          
          for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
            const startIdx = chunkIdx * MAX_QUESTOES_POR_GRAFICO;
            const endIdx = Math.min(startIdx + MAX_QUESTOES_POR_GRAFICO, habilidadesParaGrafico.length);
            const chunk = habilidadesParaGrafico.slice(startIdx, endIdx);
            
            // Gráfico em página própria se necessário, altura generosa
            const chartH = 140; // Aumentado de 120 para 140mm
            y = ensurePageSpace(ctx, y, chartH);
            
            // Info de paginação (ex: "Gráfico 1/2", "Gráfico 2/2")
            const pageInfo = totalChunks > 1 ? `Gráfico ${chunkIdx + 1}/${totalChunks}` : undefined;
            
            y = drawHabilidadesBarChart(doc, chunk, marginL, y, contentW, chartH, pageInfo);
            y += 8;
          }
        }
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...RELATORIO_CONSOLIDADO_PDF_COLORS.textGray);
        doc.text('Nenhuma habilidade para esta série.', marginL, y + 2);
        y += 10;
      }
    }
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
