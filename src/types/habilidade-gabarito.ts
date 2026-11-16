export type HabilidadeGabaritoFilterEntity = {
  id: string;
  nome: string;
};

export type HabilidadeGabaritoFilterAvaliacao = {
  id: string;
  titulo: string;
  disciplina?: string;
  disciplinas?: string[];
};

export type HabilidadeGabaritoFilterTurma = {
  id: string;
  nome: string;
  shift?: string;
  label: string;
};

export type HabilidadeGabaritoReportFlow = 'digital' | 'cartao';

export type HabilidadeGabaritoReportEntityType = 'digital' | 'answer_sheet';

export type HabilidadeGabaritoOpcoesFiltros = {
  estados: HabilidadeGabaritoFilterEntity[];
  municipios?: HabilidadeGabaritoFilterEntity[];
  avaliacoes?: HabilidadeGabaritoFilterAvaliacao[];
  escolas?: HabilidadeGabaritoFilterEntity[];
  series?: HabilidadeGabaritoFilterEntity[];
  turmas?: HabilidadeGabaritoFilterTurma[];
};

export type HabilidadeGabaritoOpcoesFiltrosParams = {
  estado?: string;
  municipio?: string;
  avaliacao?: string;
  escola?: string;
  serie?: string;
  turma?: string;
  report_entity_type?: 'answer_sheet';
};

export type HabilidadeGabaritoResumoParams = {
  estado: string;
  municipio: string;
  /** Uma avaliação. Com duas ou mais, use `avaliacoes`. */
  avaliacao?: string;
  /** Várias avaliações (CSV no query). */
  avaliacoes?: string[];
  escola?: string;
  serie?: string;
  turma?: string;
  report_entity_type?: 'answer_sheet';
};

export type HabilidadeGabaritoQuestao = {
  numero: number;
  habilidade: string;
  descricao_habilidade: string;
  gabarito: string;
};

export type HabilidadeGabaritoAvaliacao = {
  id: string;
  titulo: string;
  questoes: HabilidadeGabaritoQuestao[];
};

export type HabilidadeGabaritoEscopo = {
  estado: string;
  municipio_id: string;
  escolas: string[];
  series: string[];
  turmas: string[];
  report_entity_type: HabilidadeGabaritoReportEntityType;
};

export type HabilidadeGabaritoResumo = {
  nome: string;
  escopo: HabilidadeGabaritoEscopo;
  avaliacoes: HabilidadeGabaritoAvaliacao[];
};
