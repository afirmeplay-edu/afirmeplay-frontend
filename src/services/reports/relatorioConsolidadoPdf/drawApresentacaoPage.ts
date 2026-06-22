import type { jsPDF } from 'jspdf';
import type { PdfImageAsset } from '@/utils/pdfCityBranding';
import type { RelatorioConsolidado } from '@/types/relatorio-consolidado';
import { RELATORIO_CONSOLIDADO_PDF_COLORS } from './drawCoverPage';
import {
  buildApresentacaoDynamicData,
  buildApresentacaoParagraph1Runs,
  buildApresentacaoParagraph2Runs,
} from './buildApresentacaoData';
import {
  drawPdfTextRuns,
  drawRelatorioConsolidadoInternalHeader,
  drawRelatorioConsolidadoSectionTitle,
  paintPdfWhitePage,
  PDF_MARGIN_X,
} from './pdfShared';

export type ApresentacaoPageParams = {
  report: RelatorioConsolidado;
  logo: PdfImageAsset | null;
  institutionName?: string;
  year?: number;
  /** REDE ou nome da escola (mesmo valor da capa). */
  scopeLabel?: string;
  /** Título customizado da avaliação fornecido pelo usuário. */
  tituloAvaliacao: string;
};

const OBJETIVO_TEXTO =
  'Diagnosticar o nível de proficiência dos estudantes nas competências e habilidades essenciais, subsidiando o planejamento pedagógico e a tomada de decisões para a melhoria contínua da qualidade do ensino.';

type LegendRow = {
  label: string;
  description: string;
  fill: [number, number, number];
  text: [number, number, number];
};

const LEGENDA_FREQUENCIA: LegendRow[] = [
  {
    label: 'Excelente',
    fill: [34, 197, 94],
    text: [255, 255, 255],
    description: 'Participação total (100% dos estudantes).',
  },
  {
    label: 'Regular',
    fill: [245, 158, 11],
    text: [255, 255, 255],
    description: 'Participação parcial (menos de 100% dos estudantes).',
  },
  {
    label: 'Sem Dados',
    fill: [229, 231, 235],
    text: [75, 85, 99],
    description: 'Nenhuma informação de participação disponível.',
  },
];

function drawBadge(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  fill: [number, number, number],
  textColor: [number, number, number]
): { w: number; h: number } {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
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

function drawObjetivoBox(doc: jsPDF, marginL: number, contentW: number, y: number): number {
  const { primary, textDark } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  const boxPad = 6;
  const title = '1.1. Objetivo do Relatório';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const bodyLines = doc.splitTextToSize(OBJETIVO_TEXTO, contentW - boxPad * 2) as string[];
  const boxH = boxPad * 2 + 8 + bodyLines.length * 4.5;

  doc.setFillColor(245, 243, 255);
  doc.setDrawColor(216, 180, 254);
  doc.setLineWidth(0.3);
  if (typeof doc.roundedRect === 'function') {
    doc.roundedRect(marginL, y, contentW, boxH, 3, 3, 'FD');
  } else {
    doc.rect(marginL, y, contentW, boxH, 'FD');
  }

  let cy = y + boxPad + 4;
  doc.setTextColor(...primary);
  doc.text(title, marginL + boxPad, cy);
  cy += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...textDark);
  doc.text(bodyLines, marginL + boxPad, cy);

  return y + boxH + 10;
}

function drawLegendaFrequenciaTable(
  doc: jsPDF,
  marginL: number,
  contentW: number,
  y: number
): number {
  const { primary, textDark, textGray, lineMuted, white } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  const col1W = 42;
  const col2W = contentW - col1W;
  const rowH = 12;
  const headerH = 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...textDark);
  doc.text('1.2. Legenda de Frequência', marginL, y);
  y += 8;

  doc.setFillColor(...primary);
  doc.rect(marginL, y, contentW, headerH, 'F');
  doc.setFontSize(9);
  doc.setTextColor(...white);
  doc.text('Classificação', marginL + col1W / 2, y + 6, { align: 'center' });
  doc.text('Descrição', marginL + col1W + col2W / 2, y + 6, { align: 'center' });
  y += headerH;

  LEGENDA_FREQUENCIA.forEach((row, idx) => {
    const bg = idx % 2 === 0 ? [255, 255, 255] : [249, 250, 251];
    doc.setFillColor(...(bg as [number, number, number]));
    doc.rect(marginL, y, contentW, rowH, 'F');
    doc.setDrawColor(...lineMuted);
    doc.setLineWidth(0.2);
    doc.rect(marginL, y, contentW, rowH, 'S');
    doc.line(marginL + col1W, y, marginL + col1W, y + rowH);

    const badgeX = marginL + col1W / 2;
    drawBadge(doc, badgeX - doc.getTextWidth(row.label) / 2 - 4, y + 8.2, row.label, row.fill, row.text);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...textGray);
    const descLines = doc.splitTextToSize(row.description, col2W - 16) as string[];
    const descX = marginL + col1W + col2W / 2;
    doc.text(descLines, descX, y + 7.5, { align: 'center' });

    y += rowH;
  });

  return y + 4;
}

export function drawRelatorioConsolidadoApresentacaoPage(
  doc: jsPDF,
  params: ApresentacaoPageParams
): void {
  doc.addPage();
  const { pageW } = paintPdfWhitePage(doc);

  const marginL = PDF_MARGIN_X;
  const marginR = PDF_MARGIN_X;
  const contentW = pageW - marginL - marginR;

  let y = drawRelatorioConsolidadoInternalHeader(doc, {
    logo: params.logo,
    institutionName: params.institutionName,
    year: params.year,
  });

  y = drawRelatorioConsolidadoSectionTitle(doc, '1. Apresentação', y, marginL);
  y += 2;

  const dynamic = buildApresentacaoDynamicData(params.report, {
    escolaNome:
      params.scopeLabel && params.scopeLabel !== 'REDE' ? params.scopeLabel : undefined,
  });

  y = drawPdfTextRuns(doc, buildApresentacaoParagraph1Runs(params.tituloAvaliacao), marginL, y, contentW, 10);
  y += 3;
  y = drawPdfTextRuns(doc, buildApresentacaoParagraph2Runs(dynamic), marginL, y, contentW, 10);
  y += 6;

  y = drawObjetivoBox(doc, marginL, contentW, y);
  drawLegendaFrequenciaTable(doc, marginL, contentW, y);
}
