import type { jsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';
import type { PdfImageAsset } from '@/utils/pdfCityBranding';
import {
  rotulosSeries,
  rotulosTurmas,
  type ProfessorResponsavel,
} from '@/utils/reports/professoresResponsaveis';
import {
  relatorioSecaoTitle,
  RELATORIO_SECAO_PROFESSORES,
} from '@/utils/reports/relatorioConsolidadoSectionTitles';
import { RELATORIO_CONSOLIDADO_PDF_COLORS } from './drawCoverPage';
import {
  drawRelatorioConsolidadoInternalHeader,
  drawRelatorioConsolidadoSectionTitle,
  drawRelatorioConsolidadoSubsectionTitle,
  paintPdfWhitePage,
  PDF_MARGIN_X,
} from './pdfShared';

export type ProfessoresResponsaveisPagesParams = {
  logo: PdfImageAsset | null;
  institutionName?: string;
  year?: number;
  professores: ProfessorResponsavel[];
  aviso?: string | null;
};

const INTRO =
  'A tabela indica as séries e turmas sob responsabilidade de cada professor no recorte deste relatório, conforme o vínculo cadastrado na escola.';

const PDF_TABLE_TOP_MARGIN = 58;
const PDF_TABLE_BOTTOM_MARGIN = 22;

function textoLista(valores: string[], vazio: string): string {
  return valores.length > 0 ? valores.join('\n') : vazio;
}

export async function drawRelatorioConsolidadoProfessoresPages(
  doc: jsPDF,
  params: ProfessoresResponsaveisPagesParams
): Promise<void> {
  const { default: autoTable } = await import('jspdf-autotable');
  const professores = params.professores ?? [];
  const variasEscolas = new Set(professores.map((professor) => professor.escola_id)).size > 1;

  doc.addPage();
  const firstPageNumber = doc.getNumberOfPages();
  const { pageW } = paintPdfWhitePage(doc);
  const marginL = PDF_MARGIN_X;
  const contentW = pageW - marginL * 2;

  let y = drawRelatorioConsolidadoInternalHeader(doc, {
    logo: params.logo,
    institutionName: params.institutionName,
    year: params.year,
  });
  y = drawRelatorioConsolidadoSectionTitle(
    doc,
    relatorioSecaoTitle(8, RELATORIO_SECAO_PROFESSORES),
    y,
    marginL
  );
  y = drawRelatorioConsolidadoSubsectionTitle(doc, '8.1. Séries e turmas', y, marginL);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...RELATORIO_CONSOLIDADO_PDF_COLORS.textGray);
  const intro = doc.splitTextToSize(INTRO, contentW) as string[];
  doc.text(intro, marginL, y);
  y += intro.length * 4.6 + 4;

  const head = [
    variasEscolas ? ['Escola', 'Professor', 'Séries', 'Turmas'] : ['Professor', 'Séries', 'Turmas'],
  ];

  const body =
    professores.length > 0
      ? professores.map((professor) => {
          const nome = professor.email ? `${professor.nome}\n${professor.email}` : professor.nome;
          const series = textoLista(rotulosSeries(professor), 'Série não informada');
          const turmas = textoLista(rotulosTurmas(professor), 'Turma não informada');
          return variasEscolas ? [professor.escola_nome, nome, series, turmas] : [nome, series, turmas];
        })
      : [
          [
            {
              content: params.aviso?.trim() || 'Nenhum professor vinculado às séries e turmas deste recorte.',
              colSpan: variasEscolas ? 4 : 3,
              styles: { halign: 'left' as const },
            },
          ],
        ];

  const headerParams = {
    logo: params.logo,
    institutionName: params.institutionName,
    year: params.year,
  };

  const professorW = variasEscolas ? 42 : 52;
  const seriesW = 42;
  const escolaW = variasEscolas ? 40 : 0;
  const turmasW = contentW - professorW - seriesW - escolaW;
  const columnStyles = variasEscolas
    ? {
        0: { cellWidth: escolaW, halign: 'left' as const },
        1: { cellWidth: professorW, halign: 'left' as const },
        2: { cellWidth: seriesW, halign: 'left' as const },
        3: { cellWidth: turmasW, halign: 'left' as const },
      }
    : {
        0: { cellWidth: professorW, halign: 'left' as const },
        1: { cellWidth: seriesW, halign: 'left' as const },
        2: { cellWidth: turmasW, halign: 'left' as const },
      };

  autoTable(doc, {
    head,
    body,
    startY: y,
    theme: 'grid',
    showHead: 'everyPage',
    margin: {
      left: marginL,
      right: marginL,
      top: PDF_TABLE_TOP_MARGIN,
      bottom: PDF_TABLE_BOTTOM_MARGIN,
    },
    tableWidth: contentW,
    styles: { overflow: 'linebreak' },
    headStyles: {
      fillColor: RELATORIO_CONSOLIDADO_PDF_COLORS.primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
      valign: 'middle',
    },
    bodyStyles: {
      fontSize: 8,
      halign: 'left',
      valign: 'top',
      textColor: RELATORIO_CONSOLIDADO_PDF_COLORS.textDark,
      cellPadding: { top: 2.2, right: 2, bottom: 2.2, left: 2 },
    },
    columnStyles,
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
