import type { ResultadosAlunosFiltro } from '@/constants/resultadosAlunosFiltro';

export type FonteParticipacao = 'digital' | 'cartao';
export type SituacaoGabarito = 'adap' | 'regular' | 'indefinido';

export type DecisaoFiltroAlunos = {
  filtro: ResultadosAlunosFiltro;
  autoEm: string | null;
};

/**
 * Gabarito ADAP (série única, nível vindo de gabaritoAdapLevel) abre em ADAP.
 * Regular e a prova online permanecem no filtro atual, que começa em Regular.
 * Escolha manual no mesmo gabarito não é desfeita.
 */
export function decidirFiltroAlunosParticipacao(input: {
  fonte: FonteParticipacao;
  situacao: SituacaoGabarito;
  selecao: string;
  filtroAtual: ResultadosAlunosFiltro;
  autoEm: string | null;
}): DecisaoFiltroAlunos {
  if (input.fonte !== 'cartao') {
    return { filtro: input.filtroAtual, autoEm: null };
  }
  if (input.situacao === 'indefinido') {
    return { filtro: input.filtroAtual, autoEm: input.autoEm };
  }
  if (input.situacao !== 'adap') {
    if (input.autoEm && input.filtroAtual === 'adap') {
      return { filtro: 'regular', autoEm: null };
    }
    return { filtro: input.filtroAtual, autoEm: null };
  }
  if (input.autoEm !== input.selecao && input.filtroAtual === 'regular') {
    return { filtro: 'adap', autoEm: input.selecao };
  }
  return { filtro: input.filtroAtual, autoEm: input.selecao };
}

/** undefined = gabarito ainda sem série carregada. null = gabaritoAdapLevel não achou ADAP. */
export function situacaoPorNiveis(
  niveis: Array<1 | 2 | 3 | null | undefined>
): SituacaoGabarito {
  if (niveis.length === 0) return 'regular';
  if (niveis.some((nivel) => nivel === undefined)) return 'indefinido';
  return niveis.every((nivel) => nivel != null) ? 'adap' : 'regular';
}
