export type RelatorioConsolidadoEntityType = 'avaliacao' | 'cartao_resposta';

export type OpcoesFiltroEntidade = {
  id: string;
  nome: string;
};

export type OpcoesFiltroAvaliacao = {
  id: string;
  titulo: string;
  disciplina: string;
  disciplinas: string[];
};

export type OpcoesFiltroGabarito = {
  id: string;
  titulo: string;
};

export type OpcoesFiltrosDigital = {
  estados: OpcoesFiltroEntidade[];
  municipios?: OpcoesFiltroEntidade[];
  escolas?: OpcoesFiltroEntidade[];
  avaliacoes?: OpcoesFiltroAvaliacao[];
};

export type OpcoesFiltrosCartao = {
  estados: OpcoesFiltroEntidade[];
  municipios?: OpcoesFiltroEntidade[];
  escolas?: OpcoesFiltroEntidade[];
  gabaritos?: OpcoesFiltroGabarito[];
};

export type FiltrosDigital = {
  municipio_id: string;
  municipio_nome: string;
  escola: string;
  avaliacao_ids: string[];
};

export type FiltrosCartao = {
  municipio_id: string;
  municipio_nome: string;
  escola: string;
  gabarito_ids: string[];
};

export type ItemSelecionadoDigital = {
  id: string;
  titulo: string;
  disciplinas: string[];
  /** ID do curso (education stage). */
  curso: string | null;
  /** Nome legível do curso para exibição. */
  curso_nome?: string | null;
};

export type ItemSelecionadoCartao = {
  id: string;
  titulo: string;
  disciplinas: string[];
  serie: string | null;
  /** Nome legível do curso para exibição. */
  curso_nome?: string | null;
};

export type SerieColuna = {
  serie_id: string;
  serie_nome: string;
};

export type SerieAplicada = {
  escola_id: string;
  escola_nome: string;
  series: Array<{
    serie_id: string;
    serie_nome: string;
    itens: string[];
  }>;
};

export type MatrizEscolaSerie = {
  linhas: Array<{
    escola_id: string;
    escola_nome: string;
    valores_por_serie: Array<number | null>;
    /** Nível Saeb por série (quando enviado pelo backend — define a cor da célula). */
    niveis_por_serie?: Array<string | null>;
    taxa_geral_escola: number;
    /** Nível Saeb da coluna MÉDIA da escola. */
    nivel_media_escola?: string | null;
  }>;
  medias_da_rede: {
    por_serie: Array<number | null>;
    niveis_por_serie?: Array<string | null>;
    taxa_geral: number;
    /** Nível Saeb da célula MÉDIA DA REDE (canto inferior direito). */
    nivel_media_geral?: string | null;
  };
};

export type SecaoMatrizNumerica = {
  GERAL: MatrizEscolaSerie;
  por_disciplina: Record<string, MatrizEscolaSerie>;
};

export type HabilidadeConsolidada = {
  numero_questao: number;
  ordem_original: number;
  codigo: string;
  descricao: string;
  disciplina: string;
  acertos: number;
  total: number;
  percentual: number;
  itens_origem: string[];
};

export type BlocoHabilidadesSerie = {
  serie_id: string;
  serie_nome: string;
  habilidades: HabilidadeConsolidada[];
};

export type SecaoAcertosHabilidade = {
  GERAL: {
    matriz: MatrizEscolaSerie;
    por_serie: BlocoHabilidadesSerie[];
  };
  por_disciplina: Record<
    string,
    {
      matriz: MatrizEscolaSerie;
      por_serie: BlocoHabilidadesSerie[];
    }
  >;
};

export type FaixaDistribuicao = {
  abaixo_do_basico: number;
  basico: number;
  adequado: number;
  avancado: number;
};

export type CelulaDistribuicao = {
  contagens: FaixaDistribuicao;
  percentuais: FaixaDistribuicao;
  total_registros: number;
};

export type MatrizDistribuicao = {
  linhas: Array<{
    escola_id: string;
    escola_nome: string;
    valores_por_serie: Array<CelulaDistribuicao | null>;
    taxa_geral_escola: CelulaDistribuicao;
  }>;
  medias_da_rede: {
    por_serie: Array<CelulaDistribuicao | null>;
    taxa_geral: CelulaDistribuicao;
    media_da_rede_nivel?: string | null;
  };
};

export type SecaoMatrizDistribuicao = {
  GERAL: MatrizDistribuicao;
  por_disciplina: Record<string, MatrizDistribuicao>;
};

export type RelatorioConsolidadoFaixaAvaliacao = {
  /** Ex.: "Anos Iniciais (1º ao 5º Ano)" — faixa em que a avaliação foi aplicada. */
  titulo: string;
};

export type RelatorioConsolidadoResumoApresentacao = {
  total_matriculados?: number;
  total_participantes?: number;
  percentual_participacao?: number;
};

/** Metadado de UI quando escola ≠ all: linhas = escola; medias_da_rede = benchmark municipal. */
export type RelatorioConsolidadoComparativo = {
  ativo: boolean;
  referencia_rede: string;
  escola_id: string;
};

export type RelatorioConsolidado = {
  tipo_entidade: RelatorioConsolidadoEntityType;
  filtros: FiltrosDigital | FiltrosCartao;
  itens_selecionados: Array<ItemSelecionadoDigital | ItemSelecionadoCartao>;
  disciplinas_disponiveis: string[];
  series_colunas: SerieColuna[];
  series_aplicadas: SerieAplicada[];
  /** Presente quando escola ≠ all: medias_da_rede = média municipal (não recalcular no frontend). */
  comparativo?: RelatorioConsolidadoComparativo;
  /** Faixa de séries/anos da avaliação (subtítulo da seção 2). */
  faixa_avaliacao?: RelatorioConsolidadoFaixaAvaliacao;
  /** Totais para o texto da apresentação (quando enviados pelo backend). */
  resumo_apresentacao?: RelatorioConsolidadoResumoApresentacao;
  consolidado_frequencia: SecaoMatrizNumerica;
  consideracoes_gerais: {
    consolidado_medias_nota: SecaoMatrizNumerica;
    consolidado_medias_proficiencia: SecaoMatrizNumerica;
    acertos_por_habilidade: SecaoAcertosHabilidade;
  };
  distribuicao_niveis_proficiencia: SecaoMatrizDistribuicao;
};
