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
  drawPdfLegendTable,
  drawPdfTextRuns,
  drawRelatorioConsolidadoInternalHeader,
  drawRelatorioConsolidadoSectionTitle,
  paintPdfWhitePage,
  PDF_MARGIN_X,
  type PdfLegendTableRow,
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

const LEGENDA_FREQUENCIA: PdfLegendTableRow[] = [
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
  const { textDark } = RELATORIO_CONSOLIDADO_PDF_COLORS;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...textDark);
  doc.text('1.2. Legenda de Frequência', marginL, y);
  y += 8;

  return drawPdfLegendTable(
    doc,
    marginL,
    contentW,
    y,
    'Classificação',
    'Descrição',
    LEGENDA_FREQUENCIA,
    42
  );
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
