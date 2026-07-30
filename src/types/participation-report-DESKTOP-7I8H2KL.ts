export type ParticipationFilterEntity = {
  id: string;
  nome: string;
};

export type ParticipationFilterAvaliacao = {
  id: string;
  titulo: string;
  disciplina?: string;
  disciplinas?: string[];
};

export type ParticipationFilterTurma = {
  id: string;
  nome: string;
  shift?: string;
  label: string;
};

export type ParticipationReportFlow = 'digital' | 'cartao';

export type ParticipationOpcoesFiltros = {
  estados: ParticipationFilterEntity[];
  municipios?: ParticipationFilterEntity[];
  avaliacoes?: ParticipationFilterAvaliacao[];
  /** Alias opcional do backend no modo cartão. */
  gabaritos?: ParticipationFilterAvaliacao[];
  escolas?: ParticipationFilterEntity[];
  series?: ParticipationFilterEntity[];
  turmas?: ParticipationFilterTurma[];
};

export type ParticipationOpcoesFiltrosParams = {
  estado?: string;
  municipio?: string;
  avaliacoes?: string[];
  escolas?: string[];
  series?: string[];
  turmas?: string[];
  /** Quando `answer_sheet`, usa gabaritos/cartão-resposta. Omitido = prova digital. */
  report_entity_type?: 'answer_sheet';
};

export type ParticipationResumoParams = {
  estado: string;
  municipio: string;
  avaliacoes?: string[];
  escolas?: string[];
  series?: string[];
  turmas?: string[];
  report_entity_type?: 'answer_sheet';
};

export type ParticipationMetricas = {
  matriculados: number;
  avaliados: number;
  total_turmas: number;
  percentual_participacao: number;
};

export type ParticipationPorEscola = {
  escola_id: string;
  escola_nome: string;
  matriculados: number;
  avaliados: number;
  total_turmas: number;
  percentual_participacao: number;
};

export type ParticipationPorTurma = {
  turma_id: string;
  turma_nome: string;
  escola_id: string;
  serie_id: string;
  matriculados: number;
  avaliados: number;
  percentual_participacao: number;
};

export type ParticipationResumo = {
  escopo: {
    estado: string;
    municipio_id: string;
    avaliacoes: string[];
    escolas: string[];
    series: string[];
    turmas: string[];
  };
  metricas: ParticipationMetricas;
  por_escola: ParticipationPorEscola[];
  por_turma: ParticipationPorTurma[];
};
