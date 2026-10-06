import type { TempoProvaResumo } from '@/types/tempo-prova';
import {
  formatTempoProvaNumber,
  formatTempoProvaSeconds,
  TEMPO_PROVA_ORIGEM_LABEL,
} from '@/utils/reports/tempoProvaFormat';
import {
  buildStandardPdfFileName,
  drawStandardPageNumbers,
  drawStandardReportCover,
  drawStandardSectionTitle,
  ensureStandardSpace,
  getLastAutoTableFinalY,
  loadStandardPdfBranding,
  STANDARD_PDF_MARGIN,
  standardAutoTableStyles,
} from '@/services/reports/standardReportPdfLayout';

export type TempoProvaPdfFilterLabels = {
  estado: string;
  municipio: string;
  avaliacoes: string;
  escolas: string;
  series: string;
  turmas: string;
  alunos: string;
};

type AgregadoRow = {
  nome: string;
  sessoes: number;
  sessoes_online: number;
  sessoes_mobile: number;
  tempo_medio_segundos: number | null;
  tempo_medio_por_questao_segundos: number | null;
  tempo_mediano_por_questao_segundos: number | null;
};

const AGREGADO_HEAD = [
  'Sessões',
  'Online',
  'Mobile',
  'Tempo médio',
  'Média/questão',
  'Mediana/questão',
];

function str(value: unknown): string {
  return String(value ?? '').trim();
}

export async function generateTempoProvaPdf(args: {
  report: TempoProvaResumo;
  filterLabels: TempoProvaPdfFilterLabels;
}): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const { report, filterLabels } = args;
  const m = report.metricas;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const branding = await loadStandardPdfBranding(report.escopo?.municipio_id);

  drawStandardReportCover(doc, {
    title: 'Relatório de Tempo de Prova',
    subtitle: [filterLabels.municipio, filterLabels.estado].filter(Boolean).join(' - '),
    summaryRows: [
      ['SESSÕES:', formatTempoProvaNumber(m.sessoes)],
      ['ALUNOS:', formatTempoProvaNumber(m.alunos)],
      ['TEMPO MÉDIO:', formatTempoProvaSeconds(m.tempo_medio_segundos)],
      ['MÉDIA POR QUESTÃO:', formatTempoProvaSeconds(m.tempo_medio_por_questao_segundos)],
      ['MEDIANA POR QUESTÃO:', formatTempoProvaSeconds(m.tempo_mediano_por_questao_segundos)],
      ['QUESTÕES (MÉDIA):', formatTempoProvaNumber(m.questoes_media)],
      ['ONLINE (MEDIDO):', formatTempoProvaNumber(m.sessoes_online_medidas)],
      ['MOBILE (ESTIMADO):', formatTempoProvaNumber(m.sessoes_mobile_estimadas)],
    ],
    filterRows: [
      ['AVALIAÇÕES:', filterLabels.avaliacoes],
      ['ESCOLAS:', filterLabels.escolas],
      ['SÉRIES:', filterLabels.series],
      ['TURMAS:', filterLabels.turmas],
      ['ALUNOS:', filterLabels.alunos],
    ],
    note:
      'Observação: tempo por questão = tempo da sessão (ou estimativa mobile) ÷ número de questões da prova. ' +
      'Sessões mobile e sem cronômetro são estimadas.',
    branding,
  });

  doc.addPage();
  let y = STANDARD_PDF_MARGIN;

  y = drawStandardSectionTitle(doc, 'Origem do tempo', y);
  autoTable(doc, {
    ...standardAutoTableStyles,
    startY: y,
    head: [['Origem', 'Sessões', 'Tempo médio', 'Média/questão']],
    body: (report.por_origem ?? []).length
      ? report.por_origem.map((row) => [
          row.origem_label || TEMPO_PROVA_ORIGEM_LABEL[row.origem] || row.origem,
          formatTempoProvaNumber(row.sessoes),
          formatTempoProvaSeconds(row.tempo_medio_segundos),
          formatTempoProvaSeconds(row.tempo_medio_por_questao_segundos),
        ])
      : [['Sem sessões no escopo.', '', '', '']],
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  });
  y = getLastAutoTableFinalY(doc, y + 40);

  const addAgregadoTable = (title: string, firstCol: string, rows: AgregadoRow[]) => {
    y = ensureStandardSpace(doc, y);
    y = drawStandardSectionTitle(doc, title, y);
    autoTable(doc, {
      ...standardAutoTableStyles,
      styles: { ...standardAutoTableStyles.styles, fontSize: 8.5 },
      startY: y,
      head: [[firstCol, ...AGREGADO_HEAD]],
      body: rows.length
        ? rows.map((row) => [
            row.nome || '—',
            formatTempoProvaNumber(row.sessoes),
            formatTempoProvaNumber(row.sessoes_online),
            formatTempoProvaNumber(row.sessoes_mobile),
            formatTempoProvaSeconds(row.tempo_medio_segundos),
            formatTempoProvaSeconds(row.tempo_medio_por_questao_segundos),
            formatTempoProvaSeconds(row.tempo_mediano_por_questao_segundos),
          ])
        : [['Sem dados no escopo.', '', '', '', '', '', '']],
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
    });
    y = getLastAutoTableFinalY(doc, y + 40);
  };

  addAgregadoTable(
    'Por avaliação',
    'Avaliação',
    (report.por_avaliacao ?? []).map((r) => ({ ...r, nome: str(r.prova_titulo) }))
  );
  addAgregadoTable(
    'Por escola',
    'Escola',
    (report.por_escola ?? []).map((r) => ({ ...r, nome: str(r.escola_nome) }))
  );
  addAgregadoTable(
    'Por série',
    'Série',
    (report.por_serie ?? []).map((r) => ({ ...r, nome: str(r.serie_nome) }))
  );
  addAgregadoTable(
    'Por turma',
    'Turma',
    (report.por_turma ?? []).map((r) => ({ ...r, nome: str(r.turma_nome) }))
  );

  const alunos = report.alunos ?? [];
  y = ensureStandardSpace(doc, y);
  y = drawStandardSectionTitle(doc, 'Detalhe por aluno', y);
  autoTable(doc, {
    ...standardAutoTableStyles,
    styles: { ...standardAutoTableStyles.styles, fontSize: 7, cellPadding: 1.5 },
    startY: y,
    head: [['Aluno', 'Escola', 'Série / turma', 'Prova', 'Origem', 'Questões', 'Tempo total', 'Por questão']],
    body: alunos.length
      ? alunos.map((row) => [
          str(row.aluno_nome) || '—',
          str(row.escola_nome) || '—',
          [row.serie_nome, row.turma_nome].map(str).filter(Boolean).join(' · ') || '—',
          str(row.prova_titulo) || '—',
          TEMPO_PROVA_ORIGEM_LABEL[row.origem] || row.origem,
          row.total_questions ? String(row.total_questions) : '—',
          formatTempoProvaSeconds(row.tempo_total_segundos),
          formatTempoProvaSeconds(row.tempo_por_questao_segundos),
        ])
      : [['Nenhuma sessão encontrada.', '', '', '', '', '', '', '']],
    columnStyles: {
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
    },
  });

  drawStandardPageNumbers(doc);
  doc.save(buildStandardPdfFileName('relatorio_tempo_prova', filterLabels.municipio));
}
