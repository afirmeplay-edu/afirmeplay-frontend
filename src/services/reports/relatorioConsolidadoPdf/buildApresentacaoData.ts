import type { RelatorioConsolidado } from '@/types/relatorio-consolidado';
import { sortDisciplinasDisponiveis } from '@/utils/reports/relatorioConsolidadoDisciplinas';
import { formatPdfInteger, formatPdfPercent } from './pdfShared';

export type ApresentacaoScopeOptions = {
  /** Nome da escola quando o recorte não é municipal (todas as escolas). */
  escolaNome?: string;
};

export type ApresentacaoDynamicData = {
  disciplinasText: string;
  totalParticipantes?: number;
  totalMatriculados?: number;
  percentualParticipacao?: number;
  hasParticipacaoResumo: boolean;
  /** `true` quando o relatório abrange todas as escolas do município. */
  isEscopoRede: boolean;
  escolaNome?: string;
};

function joinPtList(items: string[]): string {
  const list = items.map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} e ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

function isEscopoRedeFiltro(escola: string | undefined): boolean {
  const v = (escola ?? '').trim().toLowerCase();
  return !v || v === 'all' || v === 'todas' || v === 'rede';
}

function inferEscolaNomeFromReport(report: RelatorioConsolidado): string | undefined {
  const linhas = report.consolidado_frequencia?.GERAL?.linhas ?? [];
  if (linhas.length === 1) return linhas[0].escola_nome;
  const block = report.series_aplicadas?.[0];
  return block?.escola_nome;
}

function resolveEscopoParticipacao(
  report: RelatorioConsolidado,
  scope?: ApresentacaoScopeOptions
): { isEscopoRede: boolean; escolaNome?: string } {
  if (isEscopoRedeFiltro(report.filtros.escola)) {
    return { isEscopoRede: true };
  }

  const escolaNome =
    scope?.escolaNome?.trim() ||
    inferEscolaNomeFromReport(report) ||
    report.filtros.escola?.trim() ||
    undefined;

  return { isEscopoRede: false, escolaNome };
}

function readResumoParticipacao(report: RelatorioConsolidado): {
  totalMatriculados?: number;
  totalParticipantes?: number;
  percentualParticipacao?: number;
} {
  const block = report.resumo_apresentacao;
  const comparativoAtivo = report.comparativo?.ativo === true;
  const linhaEscola = report.consolidado_frequencia?.GERAL?.linhas?.[0];

  const percentualEscola =
    comparativoAtivo && typeof linhaEscola?.taxa_geral_escola === 'number'
      ? linhaEscola.taxa_geral_escola
      : undefined;

  const percentual =
    block?.percentual_participacao ??
    percentualEscola ??
    report.consolidado_frequencia?.GERAL?.medias_da_rede?.taxa_geral;

  return {
    totalMatriculados: block?.total_matriculados,
    totalParticipantes: block?.total_participantes,
    percentualParticipacao:
      typeof percentual === 'number' && Number.isFinite(percentual) ? percentual : undefined,
  };
}

export function buildApresentacaoDynamicData(
  report: RelatorioConsolidado,
  scope?: ApresentacaoScopeOptions
): ApresentacaoDynamicData {
  const disciplinas = sortDisciplinasDisponiveis(report.disciplinas_disponiveis ?? []).filter(
    (d) => d !== 'GERAL'
  );
  const disciplinasText = joinPtList(disciplinas);

  const resumo = readResumoParticipacao(report);
  const hasParticipacaoResumo =
    resumo.totalParticipantes != null &&
    resumo.totalMatriculados != null &&
    resumo.percentualParticipacao != null;

  const escopo = resolveEscopoParticipacao(report, scope);

  return {
    disciplinasText,
    totalParticipantes: resumo.totalParticipantes,
    totalMatriculados: resumo.totalMatriculados,
    percentualParticipacao: resumo.percentualParticipacao,
    hasParticipacaoResumo,
    isEscopoRede: escopo.isEscopoRede,
    escolaNome: escopo.escolaNome,
  };
}

export function buildApresentacaoParagraph1Runs(tituloAvaliacao: string) {
  return [
    {
      text: 'A Secretaria Municipal de Educação apresenta o Relatório de Avaliação Diagnóstica referente a ',
    },
    { text: tituloAvaliacao, bold: true },
    {
      text: ', esse relatório é um importante instrumento de acompanhamento do desenvolvimento educacional dos estudantes da rede.',
    },
  ];
}

function buildParticipacaoResumoPrefixRuns(data: ApresentacaoDynamicData) {
  if (data.isEscopoRede) {
    return [{ text: 'A participação da rede corresponde a ' }];
  }
  return [
    { text: 'A participação da escola ' },
    { text: data.escolaNome || '—', bold: true },
    { text: ' corresponde a ' },
  ];
}

export function buildApresentacaoParagraph2Runs(data: ApresentacaoDynamicData) {
  if (data.hasParticipacaoResumo) {
    return [
      { text: 'Foram avaliados ' },
      { text: formatPdfInteger(data.totalParticipantes!), bold: true },
      { text: ' estudantes de um total de ' },
      { text: formatPdfInteger(data.totalMatriculados!), bold: true },
      { text: ' matriculados, o que corresponde a ' },
      { text: formatPdfPercent(data.percentualParticipacao!), bold: true },
      {
        text: ' de participação. Este relatório consolida os resultados obtidos, oferecendo uma visão detalhada do desempenho em ',
      },
      { text: data.disciplinasText || '—', bold: true },
      {
        text: ', além de identificar as potencialidades e as necessidades de intervenção pedagógica.',
      },
    ];
  }

  const runs: Array<{ text: string; bold?: boolean }> = [
    {
      text: 'Este relatório consolida os resultados obtidos, oferecendo uma visão detalhada do desempenho em ',
    },
    { text: data.disciplinasText || '—', bold: true },
    {
      text: ', além de identificar as potencialidades e as necessidades de intervenção pedagógica.',
    },
  ];

  if (data.percentualParticipacao != null) {
    return [
      ...buildParticipacaoResumoPrefixRuns(data),
      { text: formatPdfPercent(data.percentualParticipacao), bold: true },
      { text: '. ' },
      ...runs,
    ];
  }

  return runs;
}
