import type { RelatorioConsolidado } from '@/types/relatorio-consolidado';
import { sortDisciplinasDisponiveis } from '@/utils/reports/relatorioConsolidadoDisciplinas';
import { buildFaixaSeriesSubtitle } from './buildFaixaSeriesSubtitle';

function joinPtList(items: string[]): string {
  const list = items.map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} e ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

export function buildMediasIntroRuns(report: RelatorioConsolidado) {
  const disciplinas = sortDisciplinasDisponiveis(report.disciplinas_disponiveis ?? []).filter(
    (d) => d !== 'GERAL'
  );
  const faixa = buildFaixaSeriesSubtitle(report);
  const discText = joinPtList(disciplinas) || 'Língua Portuguesa e Matemática';

  return [
    {
      text: 'O consolidado a seguir apresenta o desempenho médio dos estudantes nas disciplinas de ',
    },
    { text: discText, bold: true },
    { text: ', segmentado por Escola e Ano Escolar para ' },
    { text: faixa.titulo, bold: true },
    { text: '.' },
  ];
}

export function buildMediasSubsectionLabel(
  report: RelatorioConsolidado,
  sectionNumber: number,
  subsectionIndex: number,
  disciplina: string
): string {
  const faixa = buildFaixaSeriesSubtitle(report);
  const discLabel = disciplina === 'GERAL' ? 'GERAL' : disciplina.toLocaleUpperCase('pt-BR');
  return `${sectionNumber}.${subsectionIndex}. ${faixa.titulo} - ${discLabel}`;
}

export function buildMediasTableBandLabel(disciplina: string, metricSuffix: string): string {
  const discLabel = disciplina === 'GERAL' ? 'GERAL' : disciplina.toLocaleUpperCase('pt-BR');
  return `${discLabel} - ${metricSuffix}`;
}

/** Disciplinas na ordem do PDF: alfabética + GERAL por último. */
export function getMediasPdfDisciplinas(report: RelatorioConsolidado): string[] {
  return sortDisciplinasDisponiveis(report.disciplinas_disponiveis ?? ['GERAL']);
}
