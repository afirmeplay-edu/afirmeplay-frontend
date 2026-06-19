import type { jsPDF } from 'jspdf';
import type { PdfImageAsset } from '@/utils/pdfCityBranding';
import { RELATORIO_CONSOLIDADO_PDF_COLORS } from './drawCoverPage';
import { LEGENDA_PROFICIENCIA_ROWS, PROFICIENCIA_PDF_CELL_COLORS } from './proficienciaPdfCellStyles';
import {
  drawPdfLegendTable,
  drawPdfTextRuns,
  drawRelatorioConsolidadoInternalHeader,
  drawRelatorioConsolidadoSectionTitle,
  drawRelatorioConsolidadoSubsectionTitle,
  paintPdfWhitePage,
  PDF_MARGIN_X,
} from './pdfShared';

export type ConsideracoesGeraisPageParams = {
  logo: PdfImageAsset | null;
  institutionName?: string;
  year?: number;
};

const METODOLOGIA_RUNS = [
  {
    text: 'A avaliação diagnóstica foi elaborada com base nas competências e habilidades previstas na ',
  },
  { text: 'Base Nacional Comum Curricular (BNCC)', bold: true },
  {
    text: ' e no currículo municipal, contemplando questões de múltipla escolha que avaliam diferentes níveis de conhecimento.',
  },
] as const;

const LEGENDA_INTRO =
  'A proficiência média é apresentada na escala Saeb, dividida em quatro níveis:';

function buildLegendaProficienciaTableRows() {
  return LEGENDA_PROFICIENCIA_ROWS.map((row) => {
    const style = PROFICIENCIA_PDF_CELL_COLORS[row.key];
    return {
      label: row.label,
      description: row.description,
      fill: style.fill,
      text: style.text,
    };
  });
}

/** Seção 3 — Considerações Gerais (metodologia + legenda de proficiência, conteúdo fixo). */
export function drawRelatorioConsolidadoConsideracoesGeraisPage(
  doc: jsPDF,
  params: ConsideracoesGeraisPageParams
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

  y = drawRelatorioConsolidadoSectionTitle(doc, '3. Considerações Gerais', y, marginL);
  y += 4;

  y = drawRelatorioConsolidadoSubsectionTitle(doc, '3.1. Metodologia de Avaliação', y, marginL);
  y = drawPdfTextRuns(doc, [...METODOLOGIA_RUNS], marginL, y, contentW, 10);
  y += 8;

  y = drawRelatorioConsolidadoSubsectionTitle(doc, '3.2. Legenda de Proficiência (Escala Saeb)', y, marginL);

  const { textGray } = RELATORIO_CONSOLIDADO_PDF_COLORS;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...textGray);
  const introLines = doc.splitTextToSize(LEGENDA_INTRO, contentW) as string[];
  doc.text(introLines, marginL, y);
  y += introLines.length * 4.2 + 6;

  drawPdfLegendTable(
    doc,
    marginL,
    contentW,
    y,
    'Nível',
    'Descrição',
    buildLegendaProficienciaTableRows(),
    50
  );
}
