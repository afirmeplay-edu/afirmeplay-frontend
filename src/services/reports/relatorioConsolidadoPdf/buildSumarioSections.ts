import type { RelatorioConsolidado } from '@/types/relatorio-consolidado';
import { sortDisciplinasDisponiveis } from '@/utils/reports/relatorioConsolidadoDisciplinas';

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
      title: 'Consolidado de Frequência',
      subsections: porDisciplina,
    },
    {
      number: 3,
      title: 'Considerações Gerais',
      subsections: ['Metodologia', 'Legenda Proficiência'],
    },
    {
      number: 4,
      title: 'Consolidado de Médias (Nota)',
      subsections: porDisciplina,
    },
    {
      number: 5,
      title: 'Consolidado de Médias (Proficiência)',
      subsections: porDisciplina,
    },
    {
      number: 6,
      title: 'Acertos por Habilidade',
      subsections: porDisciplina,
    },
    {
      number: 7,
      title: 'Distribuição dos Níveis de Proficiência',
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
