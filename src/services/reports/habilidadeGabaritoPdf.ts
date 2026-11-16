import type { jsPDF } from 'jspdf';
import type { HabilidadeGabaritoResumo } from '@/types/habilidade-gabarito';
import {
  buildStandardPdfFileName,
  drawStandardPageNumbers,
  drawStandardReportCover,
  drawStandardSectionTitle,
  ensureStandardSpace,
  getLastAutoTableFinalY,
  loadStandardPdfBranding,
  STANDARD_PDF_COLORS,
  STANDARD_PDF_MARGIN,
  standardAutoTableStyles,
} from '@/services/reports/standardReportPdfLayout';

export type HabilidadeGabaritoPdfScope = {
  estado: string;
  municipio: string;
  tipo: string;
  /** Avaliações que entraram no relatório gerado. */
  avaliacoes: string[];
  escolas: string[];
  series: string[];
  turmas: string[];
  /** Selecionadas, mas sem aplicação neste recorte. */
  omitidas?: string[];
};

function displaySkill(value: string): string {
  const text = value.trim();
  return text || 'N/A';
}

function displayText(value: string): string {
  const text = value.trim();
  return text || '—';
}

function displayGabarito(value: string): string {
  const text = value.trim();
  if (!text) return '—';
  return /^[a-e]$/i.test(text) ? text.toUpperCase() : text;
}

function coverCount(items: string[], plural: string): string {
  if (items.length === 0) return 'Nenhuma';
  if (items.length === 1) return items[0];
  return `${items.length} ${plural}`;
}

function drawNameList(
  doc: jsPDF,
  autoTable: (doc: jsPDF, options: Record<string, unknown>) => void,
  title: string,
  column: string,
  names: string[],
  y: number,
  emptyLabel: string
): number {
  y = ensureStandardSpace(doc, y, 42);
  y = drawStandardSectionTitle(doc, title, y);
  autoTable(doc, {
    ...standardAutoTableStyles,
    startY: y,
    head: [[column]],
    body: names.length ? names.map((name) => [name]) : [[emptyLabel]],
  });
  return getLastAutoTableFinalY(doc, y + 16);
}

function drawNote(doc: jsPDF, y: number, text: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  const lines = doc.splitTextToSize(text, pageW - STANDARD_PDF_MARGIN * 2) as string[];
  const height = lines.length * 4.2 + 6;
  y = ensureStandardSpace(doc, y, height + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...STANDARD_PDF_COLORS.textGray);
  doc.text(lines, STANDARD_PDF_MARGIN, y);
  return y + height;
}

export async function generateHabilidadeGabaritoPdf(args: {
  report: HabilidadeGabaritoResumo;
  scope: HabilidadeGabaritoPdfScope;
}): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const { report, scope } = args;
  const blocos = report.avaliacoes ?? [];
  const totalQuestoes = blocos.reduce((sum, bloco) => sum + (bloco.questoes?.length ?? 0), 0);
  const semGabarito = blocos.reduce(
    (sum, bloco) => sum + (bloco.questoes ?? []).filter((q) => !q.gabarito.trim()).length,
    0
  );
  const avaliacoes = scope.avaliacoes.filter((name) => name.trim());
  const escolas = scope.escolas.filter((name) => name.trim());
  const series = scope.series.filter((name) => name.trim());
  const turmas = scope.turmas.filter((name) => name.trim());
  const omitidas = (scope.omitidas ?? []).map((name) => name.trim()).filter(Boolean);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const branding = await loadStandardPdfBranding(report.escopo?.municipio_id);

  drawStandardReportCover(doc, {
    title: report.nome || 'Relatório de habilidade e gabarito',
    subtitle: [scope.municipio, scope.estado].filter(Boolean).join(' - '),
    summaryRows: [
      ['AVALIAÇÕES:', String(avaliacoes.length || blocos.length)],
      ['QUESTÕES:', String(totalQuestoes)],
      ['ESCOLAS:', String(escolas.length)],
      ['SÉRIES:', String(series.length)],
      ['TURMAS:', String(turmas.length)],
      ['SEM GABARITO:', String(semGabarito)],
    ],
    filterRows: [
      ['TIPO:', scope.tipo || '—'],
      ['AVALIAÇÕES:', coverCount(avaliacoes, 'avaliações')],
      ['ESCOLAS:', coverCount(escolas, 'escolas')],
      ['SÉRIES:', coverCount(series, 'séries')],
      ['TURMAS:', coverCount(turmas, 'turmas')],
    ],
    note:
      'A relação completa de avaliações, escolas, séries e turmas do escopo está na página seguinte. Habilidade N/A indica questão sem habilidade cadastrada. Gabarito em branco indica questão sem letra (por exemplo, discursiva).',
    branding,
  });

  doc.addPage();
  let y = STANDARD_PDF_MARGIN;
  y = drawStandardSectionTitle(doc, 'Escopo do relatório', y);
  y = drawNote(
    doc,
    y,
    [scope.estado, scope.municipio, scope.tipo].filter(Boolean).join(' · ') || 'Escopo não informado.'
  );

  y = drawNameList(
    doc,
    autoTable,
    'Avaliações',
    'Avaliação',
    avaliacoes,
    y,
    'Nenhuma avaliação aplicada neste recorte.'
  );
  if (omitidas.length) {
    y = drawNote(doc, y, `Fora deste recorte: ${omitidas.join(', ')}.`);
  }

  y = drawNameList(doc, autoTable, 'Escolas', 'Escola', escolas, y, 'Nenhuma escola no escopo.');
  y = drawNameList(doc, autoTable, 'Séries', 'Série', series, y, 'Nenhuma série no escopo.');
  y = drawNameList(doc, autoTable, 'Turmas', 'Turma', turmas, y, 'Nenhuma turma no escopo.');

  if (!blocos.length) {
    y = ensureStandardSpace(doc, y, 40);
    y = drawStandardSectionTitle(doc, 'Gabarito', y);
    autoTable(doc, {
      ...standardAutoTableStyles,
      startY: y,
      head: [['Resultado']],
      body: [['Nenhuma das avaliações selecionadas foi aplicada neste recorte.']],
    });
  }

  blocos.forEach((bloco, index) => {
    y = ensureStandardSpace(doc, y, 48);
    y = drawStandardSectionTitle(doc, bloco.titulo || `Avaliação ${index + 1}`, y);
    autoTable(doc, {
      ...standardAutoTableStyles,
      styles: { ...standardAutoTableStyles.styles, fontSize: 8.5, cellPadding: 1.8 },
      startY: y,
      head: [['Questão', 'Habilidade', 'Descrição da habilidade', 'Gabarito']],
      body: bloco.questoes?.length
        ? bloco.questoes.map((questao) => [
            String(questao.numero),
            displaySkill(questao.habilidade),
            displayText(questao.descricao_habilidade),
            displayGabarito(questao.gabarito),
          ])
        : [['—', '—', 'Nenhuma questão neste bloco.', '—']],
      columnStyles: {
        0: { halign: 'center', cellWidth: 22 },
        1: { cellWidth: 32 },
        3: { halign: 'center', cellWidth: 24 },
      },
    });
    y = getLastAutoTableFinalY(doc, y + 24);
  });

  drawStandardPageNumbers(doc);
  doc.save(buildStandardPdfFileName('habilidade_gabarito', scope.municipio));
}
