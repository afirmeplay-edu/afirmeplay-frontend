import type { RelatorioConsolidado } from '@/types/relatorio-consolidado';
import { sortDisciplinasDisponiveis } from '@/utils/reports/relatorioConsolidadoDisciplinas';
import { formatPdfInteger, formatPdfPercent } from './pdfShared';

export type ApresentacaoDynamicData = {
  /** Nomes das avaliações/cartões selecionados (texto da “etapa”). */
  etapaText: string;
  disciplinasText: string;
  totalParticipantes?: number;
  totalMatriculados?: number;
  percentualParticipacao?: number;
  hasParticipacaoResumo: boolean;
};

function joinPtList(items: string[]): string {
  const list = items.map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} e ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

function readResumoParticipacao(report: RelatorioConsolidado): {
  totalMatriculados?: number;
  totalParticipantes?: number;
  percentualParticipacao?: number;
} {
  const block = report.resumo_apresentacao;
  const percentual =
    block?.percentual_participacao ??
    report.consolidado_frequencia?.GERAL?.medias_da_rede?.taxa_geral;

  return {
    totalMatriculados: block?.total_matriculados,
    totalParticipantes: block?.total_participantes,
    percentualParticipacao:
      typeof percentual === 'number' && Number.isFinite(percentual) ? percentual : undefined,
  };
}

export function buildApresentacaoDynamicData(report: RelatorioConsolidado): ApresentacaoDynamicData {
  const etapaText = joinPtList(report.itens_selecionados.map((item) => item.titulo));

  const disciplinas = sortDisciplinasDisponiveis(report.disciplinas_disponiveis ?? [])
    .filter((d) => d !== 'GERAL');
  const disciplinasText = joinPtList(disciplinas);

  const resumo = readResumoParticipacao(report);
  const hasParticipacaoResumo =
    resumo.totalParticipantes != null &&
    resumo.totalMatriculados != null &&
    resumo.percentualParticipacao != null;

  return {
    etapaText,
    disciplinasText,
    totalParticipantes: resumo.totalParticipantes,
    totalMatriculados: resumo.totalMatriculados,
    percentualParticipacao: resumo.percentualParticipacao,
    hasParticipacaoResumo,
  };
}

export function buildApresentacaoParagraph1Runs(etapaText: string) {
  return [
    { text: 'A Secretaria Municipal de Educação apresenta o Relatório de Avaliação Diagnóstica da referente a ' },
    { text: etapaText || '—', bold: true },
    {
      text: ', esse relatório é um importante instrumento de acompanhamento do desenvolvimento educacional dos estudantes da rede.',
    },
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
      { text: ' de participação. Este relatório consolida os resultados obtidos, oferecendo uma visão detalhada do desempenho em ' },
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
      { text: 'A participação da rede corresponde a ' },
      { text: formatPdfPercent(data.percentualParticipacao), bold: true },
      { text: '. ' },
      ...runs,
    ];
  }

  return runs;
}
