import { api } from "@/lib/api";

export type MonitoringSourceType = "avaliacao" | "cartao_resposta";

export type MonitoringFilters = {
  tipo_origem: MonitoringSourceType;
  periodo?: string;
  q?: string;
  estado?: string;
  municipio?: string;
  escola_id?: string;
  avaliacao_id?: string;
  gabarito_id?: string;
  disciplina?: string;
  serie_id?: string;
  turma_id?: string;
  serie_filtro?: string;
  nome?: string;
  coordenador_id?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  page_size?: number;
};

export type MonitoringOption = { id: string; name: string };

export type MonitoringFilterOptions = {
  estados: MonitoringOption[];
  municipios: Array<{ id: string; name: string; state: string }>;
  escolas: MonitoringOption[];
  avaliacoes: MonitoringOption[];
  gabaritos: MonitoringOption[];
  disciplinas: MonitoringOption[];
  series: MonitoringOption[];
  series_disponiveis?: MonitoringOption[];
  turmas: MonitoringOption[];
  coordenadores: MonitoringOption[];
  defaults?: {
    tipo_origem?: MonitoringSourceType;
    estado?: string;
    municipio?: string;
    escola_id?: string;
    lock_escola?: boolean;
    lock_municipio?: boolean;
  };
};

export type MonitoringSchoolItem = {
  escola_id: string;
  escola_nome: string;
  total_alunos: number;
  abaixo_basico: number;
  basico: number;
  adequado: number;
  avancado: number;
  acoes_realizadas: number;
  vistos_semed: number;
};

export type MonitoringClassItem = MonitoringSchoolItem & {
  turma_id: string;
  turma_nome: string;
  serie_nome: string;
  shift?: string;
};

export type MonitoringSchoolsResponse = {
  items: MonitoringSchoolItem[];
  summary: {
    total_escolas: number;
    total_alunos: number;
    total_acoes: number;
    total_vistos_semed: number;
    total_relatorios: number;
    total_nao_vistos: number;
    taxa_vistos_pct: number;
    total_preenchidas: number;
    total_realizadas: number;
    total_pendentes_nao_realizadas: number;
  };
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

export type MonitoringClassesResponse = {
  items: MonitoringClassItem[];
  summary: MonitoringSchoolsResponse["summary"];
  pagination: MonitoringSchoolsResponse["pagination"];
};

export type MonitoringStudentDisciplinaCritica = {
  disciplina: string;
  nivel: string;
  nota?: number;
  descritores_criticos: string[];
};

export type MonitoringStudentItem = {
  linha_id: string;
  aluno_id: string;
  aluno_nome: string;
  matricula?: string;
  escola_id: string;
  escola_nome: string;
  serie: string;
  turma: string;
  shift?: string;
  nota: number;
  proficiencia: number;
  nivel: string;
  disciplinas_criticas?: MonitoringStudentDisciplinaCritica[];
  descritores_criticos: string[];
  acao_id: string | null;
  acao_pedagogica: string;
  responsavel_id: string | null;
  responsavel_nome: string;
  coordenador_id?: string | null;
  coordenador_nome?: string;
  prazo: string | null;
  status: "pendente" | "sendo_realizada" | "realizada" | "nao_realizado";
  realizada_em: string | null;
  feita_pela_escola: boolean;
  vista_pela_semed: boolean;
  source_type: MonitoringSourceType;
  source_id: string;
};

export type MonitoringStudentsResponse = {
  items: MonitoringStudentItem[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
};

export type MonitoringSkillDetailQuestao = {
  numero: number;
  disciplina: string;
};

export type MonitoringSkillDetail = {
  codigo: string;
  nome: string;
  descricao: string;
  disciplina: string;
  skill_id: string | null;
  questoes: MonitoringSkillDetailQuestao[];
};

export type MonitoringActionPayload = {
  source_type: MonitoringSourceType;
  source_id: string;
  student_id: string;
  school_id: string;
  class_id?: string;
  grade_id?: string;
  disciplina?: string;
  acao_pedagogica: string;
  responsavel_nome: string;
  coordenador_id?: string | null;
  prazo: string | null;
  status: "pendente" | "sendo_realizada" | "realizada" | "nao_realizado";
  realizada_em: string | null;
  feita_pela_escola: boolean;
  vista_pela_semed: boolean;
  observacao?: string;
};

export type MonitoringHistoryEntry = {
  id: string;
  monitoring_action_id: string;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
  changed_fields: string[];
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  note?: string | null;
};

export type MonitoringReportData = {
  metadata: {
    periodicidade: "semanal" | "mensal";
    periodo_referencia: string;
    gerado_em: string;
    usuario_gerador: string;
  };
  filtros_aplicados: Record<string, string>;
  resumo_geral: {
    total_escolas: number;
    total_alunos: number;
    total_acoes: number;
    total_vistos_semed: number;
  };
  tabela_escolas: MonitoringSchoolItem[];
  tabela_alunos: MonitoringStudentItem[];
  agrupado_periodo?: Record<
    string,
    {
      acoes: number;
      vistos_semed: number;
      feitas_escola: number;
    }
  >;
  assinaturas: {
    coordenador_label: string;
    professor_label: string;
    semed_label: string;
  };
};

const cleanParams = (filters: MonitoringFilters | Record<string, unknown>) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });
  return params;
};

const FILTER_OPTION_KEYS = [
  "tipo_origem",
  "periodo",
  "estado",
  "municipio",
  "escola_id",
  "avaliacao_id",
  "gabarito_id",
  "disciplina",
  "serie_id",
  "turma_id",
  "serie_filtro",
  "nome",
] as const;

export class MonitoramentoApiService {
  static async getFilterOptions(filters: MonitoringFilters): Promise<MonitoringFilterOptions> {
    const params = new URLSearchParams();
    FILTER_OPTION_KEYS.forEach((key) => {
      const value = filters[key];
      if (value) params.set(key, String(value));
    });
    const response = await api.get(`/monitoramento/opcoes-filtros?${params.toString()}`);
    return response.data;
  }

  static async getSchools(filters: MonitoringFilters): Promise<MonitoringSchoolsResponse> {
    const response = await api.get(`/monitoramento/escolas?${cleanParams(filters).toString()}`);
    return response.data;
  }

  static async getClasses(filters: MonitoringFilters): Promise<MonitoringClassesResponse> {
    const response = await api.get(`/monitoramento/turmas?${cleanParams(filters).toString()}`);
    return response.data;
  }

  static async getStudents(filters: MonitoringFilters): Promise<MonitoringStudentsResponse> {
    const response = await api.get(`/monitoramento/alunos?${cleanParams(filters).toString()}`);
    return response.data;
  }

  static async getSkillDetail(
    filters: MonitoringFilters & { codigo: string }
  ): Promise<MonitoringSkillDetail> {
    const response = await api.get(`/monitoramento/habilidade-detalhe?${cleanParams(filters).toString()}`);
    return response.data;
  }

  static async updateAction(actionId: string | null, payload: MonitoringActionPayload) {
    const id = actionId ?? "new";
    const response = await api.patch(`/monitoramento/alunos/${id}/acao-pedagogica`, payload);
    return response.data as { item: unknown; history_entry_id: string | null };
  }

  static async getHistory(actionId: string): Promise<{ items: MonitoringHistoryEntry[] }> {
    const response = await api.get(`/monitoramento/alunos/${actionId}/historico`);
    return response.data;
  }

  static async getReportData(filters: MonitoringFilters & { periodicidade: "semanal" | "mensal" }) {
    const response = await api.get<MonitoringReportData>(
      `/monitoramento/relatorio-dados?${cleanParams(filters).toString()}`
    );
    return response.data;
  }
}
