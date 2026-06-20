import type { RelatorioConsolidado } from '@/types/relatorio-consolidado';
import { sortDisciplinasDisponiveis } from '@/utils/reports/relatorioConsolidadoDisciplinas';
import {
  RELATORIO_SECAO_ACERTOS_HABILIDADE,
  RELATORIO_SECAO_DISTRIBUICAO,
  RELATORIO_SECAO_FREQUENCIA,
  RELATORIO_SECAO_MEDIA_NOTA,
  RELATORIO_SECAO_MEDIA_PROFICIENCIA,
} from '@/utils/reports/relatorioConsolidadoSectionTitles';

export type SumarioSection = {
  number: number;
  title: string;
  /** Rótulos das subseções (numerados como N.1, N.2… na renderização). */
  subsections: string[];
};

function disciplinaSumarioLabel(disciplina: string): string {
  return disciplina === 'GERAL' ? 'Geral' : disciplina;
}

/**
 * Monta o sumário com as seções do relatório consolidado (disciplinas vindas da API).
 */
export function buildSumarioSections(report: RelatorioConsolidado): SumarioSection[] {
  const disciplinas = sortDisciplinasDisponiveis(report.disciplinas_disponiveis ?? ['GERAL']);
  const porDisciplina = disciplinas.map(disciplinaSumarioLabel);

  return [
    {
      number: 1,
      title: 'Apresentação',
      subsections: ['Objetivo do Relatório', 'Legenda Frequência'],
    },
    {
      number: 2,
      title: RELATORIO_SECAO_FREQUENCIA,
      subsections: porDisciplina,
    },
    {
      number: 3,
      title: 'Considerações Gerais',
      subsections: ['Metodologia', 'Legenda Proficiência'],
    },
    {
      number: 4,
      title: RELATORIO_SECAO_MEDIA_NOTA,
      subsections: porDisciplina,
    },
    {
      number: 5,
      title: RELATORIO_SECAO_MEDIA_PROFICIENCIA,
      subsections: porDisciplina,
    },
    {
      number: 6,
      title: RELATORIO_SECAO_ACERTOS_HABILIDADE,
      subsections: porDisciplina,
    },
    {
      number: 7,
      title: RELATORIO_SECAO_DISTRIBUICAO,
      subsections: porDisciplina,
    },
  ];
}

export function formatSumarioSubsectionsLine(section: SumarioSection): string {
  if (!section.subsections.length) return '';
  return section.subsections
    .map((label, idx) => `${section.number}.${idx + 1} ${label}`)
    .join('  |  ');
}
