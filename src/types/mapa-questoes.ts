export type MapaQuestoesFilterEntity = {
  id: string;
  nome: string;
};

export type MapaQuestoesFilterAvaliacao = {
  id: string;
  titulo: string;
  disciplina?: string;
  disciplinas?: string[];
};

export type MapaQuestoesFilterTurma = {
  id: string;
  nome: string;
  shift?: string;
  label: string;
};

export type MapaQuestoesReportFlow = 'digital' | 'cartao';

export type MapaQuestoesOpcoesFiltros = {
  estados: MapaQuestoesFilterEntity[];
  municipios?: MapaQuestoesFilterEntity[];
  avaliacoes?: MapaQuestoesFilterAvaliacao[];
  gabaritos?: MapaQuestoesFilterAvaliacao[];
  escolas?: MapaQuestoesFilterEntity[];
  series?: MapaQuestoesFilterEntity[];
  turmas?: MapaQuestoesFilterTurma[];
};

export type MapaQuestoesOpcoesFiltrosParams = {
  estado?: string;
  municipio?: string;
  avaliacao?: string;
  escola?: string;
  serie?: string;
  turma?: string;
  report_entity_type?: 'answer_sheet';
};

export type MapaQuestoesResumoParams = {
  estado: string;
  municipio: string;
  avaliacao: string;
  escola?: string;
  serie?: string;
  turma?: string;
  report_entity_type?: 'answer_sheet';
};

export type MapaQuestoesTaxaAcertos = {
  acertaram: number;
  total: number;
  percentual: number;
};

export type MapaQuestoesMarcacao = {
  alternativa: string;
  alunos: number;
  percentual: number;
};

export type MapaQuestoesQuestao = {
  numero: number;
  disciplina: string;
  disciplina_id: string;
  habilidade: string;
  gabarito: string;
  taxa_acertos: MapaQuestoesTaxaAcertos;
  marcacoes: MapaQuestoesMarcacao[];
  /** Presente só na prova digital — enunciado via GET /questions/batch. */
  question_id?: string | null;
};

export type MapaQuestoesPorDisciplina = {
  disciplina_id: string;
  disciplina: string;
  questoes: MapaQuestoesQuestao[];
};

export type MapaQuestoesResumo = {
  escopo: {
    estado: string;
    municipio_id: string;
    avaliacao_id: string;
    escolas: string[];
    series: string[];
    turmas: string[];
    report_entity_type?: 'answer_sheet';
  };
  avaliacao: {
    id: string;
    nome: string;
    disciplinas: Array<{ id: string; nome: string }>;
  };
  metricas: {
    total_alunos_realizaram: number;
    media_acertos_percentual: number;
    total_questoes: number;
  };
  por_disciplina: MapaQuestoesPorDisciplina[];
};
