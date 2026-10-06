export type TempoProvaFilterEntity = {
  id: string;
  nome: string;
};

export type TempoProvaFilterAvaliacao = {
  id: string;
  titulo: string;
  disciplina?: string;
  disciplinas?: string[];
};

export type TempoProvaFilterTurma = {
  id: string;
  nome: string;
  shift?: string;
  label: string;
};

export type TempoProvaOpcoesFiltros = {
  estados: TempoProvaFilterEntity[];
  municipios?: TempoProvaFilterEntity[];
  avaliacoes?: TempoProvaFilterAvaliacao[];
  escolas?: TempoProvaFilterEntity[];
  series?: TempoProvaFilterEntity[];
  turmas?: TempoProvaFilterTurma[];
  alunos?: TempoProvaFilterEntity[];
};

export type TempoProvaOpcoesFiltrosParams = {
  estado?: string;
  municipio?: string;
  avaliacoes?: string[];
  escolas?: string[];
  series?: string[];
  turmas?: string[];
  alunos?: string[];
};

export type TempoProvaResumoParams = TempoProvaOpcoesFiltrosParams & {
  estado: string;
  municipio: string;
};

export type TempoProvaOrigem = 'medida' | 'estimada_mobile' | 'estimada_fallback';

export type TempoProvaMetricas = {
  sessoes: number;
  alunos: number;
  sessoes_online_medidas: number;
  sessoes_mobile_estimadas: number;
  sessoes_estimadas_fallback: number;
  tempo_medio_segundos: number | null;
  tempo_medio_por_questao_segundos: number | null;
  tempo_mediano_por_questao_segundos: number | null;
  questoes_media: number | null;
};

export type TempoProvaAgregadoEscola = {
  escola_id: string;
  escola_nome: string;
  sessoes: number;
  sessoes_online: number;
  sessoes_mobile: number;
  tempo_medio_segundos: number | null;
  tempo_medio_por_questao_segundos: number | null;
  tempo_mediano_por_questao_segundos: number | null;
};

export type TempoProvaAgregadoSerie = {
  serie_id: string;
  serie_nome: string;
  sessoes: number;
  sessoes_online: number;
  sessoes_mobile: number;
  tempo_medio_segundos: number | null;
  tempo_medio_por_questao_segundos: number | null;
  tempo_mediano_por_questao_segundos: number | null;
};

export type TempoProvaAgregadoTurma = {
  turma_id: string;
  turma_nome: string;
  sessoes: number;
  sessoes_online: number;
  sessoes_mobile: number;
  tempo_medio_segundos: number | null;
  tempo_medio_por_questao_segundos: number | null;
  tempo_mediano_por_questao_segundos: number | null;
};

export type TempoProvaAgregadoAvaliacao = {
  prova_id: string;
  prova_titulo: string;
  sessoes: number;
  sessoes_online: number;
  sessoes_mobile: number;
  tempo_medio_segundos: number | null;
  tempo_medio_por_questao_segundos: number | null;
  tempo_mediano_por_questao_segundos: number | null;
};

export type TempoProvaAgregadoOrigem = {
  origem: TempoProvaOrigem;
  origem_label: string;
  sessoes: number;
  tempo_medio_segundos: number | null;
  tempo_medio_por_questao_segundos: number | null;
};

export type TempoProvaAlunoRow = {
  aluno_id: string;
  aluno_nome: string;
  escola_id: string;
  escola_nome: string;
  turma_id: string;
  turma_nome: string;
  serie_id: string;
  serie_nome: string;
  prova_id: string;
  sessao_id?: string;
  prova_titulo: string;
  origem: TempoProvaOrigem;
  tempo_total_segundos: number;
  total_questions: number;
  tempo_por_questao_segundos: number | null;
  estimated_time_minutos: number;
};

export type TempoProvaResumo = {
  escopo: {
    estado: string;
    municipio_id: string;
    avaliacoes: string[];
    escolas: string[];
    series: string[];
    turmas: string[];
    alunos: string[];
  };
  metricas: TempoProvaMetricas;
  por_escola: TempoProvaAgregadoEscola[];
  por_serie: TempoProvaAgregadoSerie[];
  por_turma: TempoProvaAgregadoTurma[];
  por_avaliacao: TempoProvaAgregadoAvaliacao[];
  por_origem: TempoProvaAgregadoOrigem[];
  alunos: TempoProvaAlunoRow[];
};
