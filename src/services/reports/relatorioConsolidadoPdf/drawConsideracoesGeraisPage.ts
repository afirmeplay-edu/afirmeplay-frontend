import type { jsPDF } from 'jspdf';
import type { PdfImageAsset } from '@/utils/pdfCityBranding';
import { RELATORIO_CONSOLIDADO_PDF_COLORS } from './drawCoverPage';
import {
  LEGENDA_DESEMPENHO_ROWS,
  LEGENDA_PROFICIENCIA_ROWS,
  PROFICIENCIA_PDF_CELL_COLORS,
} from './proficienciaPdfCellStyles';
import {
  drawPdfDesempenhoLegendTable,
  drawPdfLegendTable,
  drawPdfTextRuns,
  drawRelatorioConsolidadoInternalHeader,
  drawRelatorioConsolidadoSectionTitle,
  drawRelatorioConsolidadoSubsectionTitle,
  paintPdfWhitePage,
  PDF_FOOTER_Y_OFFSET,
  PDF_MARGIN_X,
  type InternalPageHeaderParams,
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

const LEGENDA_PROFICIENCIA_INTRO =
  'A proficiência média é apresentada na escala Saeb, dividida em quatro níveis:';

const LEGENDA_DESEMPENHO_INTRO =
  'A nota média (desempenho) é apresentada na escala de 0 a 10, dividida em quatro níveis:';

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

function buildLegendaDesempenhoTableRows() {
  return LEGENDA_DESEMPENHO_ROWS.map((row) => {
    const style = PROFICIENCIA_PDF_CELL_COLORS[row.key];
    return {
      label: row.label,
      intervalo: row.intervalo,
      description: row.description,
      fill: style.fill,
      text: style.text,
    };
  });
}

function ensureSpaceForBlock(
  doc: jsPDF,
  y: number,
  neededH: number,
  headerParams: InternalPageHeaderParams
): number {
  const pageH = doc.internal.pageSize.getHeight();
  const bottomLimit = pageH - PDF_FOOTER_Y_OFFSET - 18;
  if (y + neededH <= bottomLimit) return y;

  doc.addPage();
  paintPdfWhitePage(doc);
  return drawRelatorioConsolidadoInternalHeader(doc, headerParams);
}

/** Seção 3 — Considerações Gerais (metodologia + legendas de proficiência e desempenho). */
export function drawRelatorioConsolidadoConsideracoesGeraisPage(
  doc: jsPDF,
  params: ConsideracoesGeraisPageParams
): void {
  doc.addPage();
  const { pageW } = paintPdfWhitePage(doc);

  const marginL = PDF_MARGIN_X;
  const contentW = pageW - marginL * 2;
  const headerParams: InternalPageHeaderParams = {
    logo: params.logo,
    institutionName: params.institutionName,
    year: params.year,
  };

  let y = drawRelatorioConsolidadoInternalHeader(doc, headerParams);

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
  const introProfLines = doc.splitTextToSize(LEGENDA_PROFICIENCIA_INTRO, contentW) as string[];
  doc.text(introProfLines, marginL, y);
  y += introProfLines.length * 4.2 + 6;

  y = drawPdfLegendTable(
    doc,
    marginL,
    contentW,
    y,
    'Nível',
    'Descrição',
    buildLegendaProficienciaTableRows(),
    50
  );
  y += 4;

  // 3.3 — pode precisar de nova página (título + intro + tabela ~ 7+6+9+56)
  const desempenhoBlockH = 7 + 6 + 9 + 14 * LEGENDA_DESEMPENHO_ROWS.length + 8;
  y = ensureSpaceForBlock(doc, y, desempenhoBlockH, headerParams);

  y = drawRelatorioConsolidadoSubsectionTitle(
    doc,
    '3.3. Legenda de Desempenho (Nota – Escala 0 a 10)',
    y,
    marginL
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...textGray);
  const introDesempLines = doc.splitTextToSize(LEGENDA_DESEMPENHO_INTRO, contentW) as string[];
  doc.text(introDesempLines, marginL, y);
  y += introDesempLines.length * 4.2 + 6;

  drawPdfDesempenhoLegendTable(doc, marginL, contentW, y, buildLegendaDesempenhoTableRows(), 48, 52);
}
