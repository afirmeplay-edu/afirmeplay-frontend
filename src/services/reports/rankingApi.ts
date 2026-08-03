import { api } from "@/lib/api";

export type RankingType = "general" | "specific_evaluation" | "specific_answer_sheet" | "teachers";
export type RankingScope = "turma" | "escola" | "municipio";

export interface RankingFilters {
  scope?: RankingScope;
  estado?: string;
  municipio?: string;
  escola?: string;
  serie?: string;
  turma?: string;
  periodo?: string;
  disciplina?: string;
  evaluation_id?: string;
  answer_sheet_id?: string;
}

export interface RankingResponseItem {
  position: number;
  [key: string]: unknown;
}

export interface RankingSection<T = Record<string, unknown>> {
  totals?: Record<string, number>;
  items: T[];
}

export interface RankingResponse {
  ranking_type: RankingType;
  scope: {
    scope?: string;
    city_id?: string | null;
    school_ids?: string[];
    class_ids?: string[];
  };
  filters: RankingFilters;
  items: RankingResponseItem[];
  students_items?: RankingResponseItem[];
  students_totals?: { count: number };
  students_pagination?: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
  series_labels?: string[];
  network_series_averages?: Array<{
    grade_name: string;
    average_score: number;
    average_proficiency: number;
    classification: string;
  }>;
  course_sections?: Array<{
    course_label: string;
    totals: {
      count: number;
      average_score: number;
      critical_schools_count: number;
    };
    items: Array<{
      position: number;
      school_id?: string;
      school_name?: string;
      average_score?: number;
      average_proficiency?: number;
      classification?: string;
      participation_rate?: number;
      participating_students?: number;
      students_count?: number;
      total_students?: number;
      series?: Array<Record<string, unknown>>;
    }>;
  }>;
  general_rankings?: {
    visibility?: {
      schools_by_course?: boolean;
      series_by_school_and_course?: boolean;
      classes_by_series?: boolean;
      students_by_course?: boolean;
    };
    schools_by_course?: {
      sections: Array<{
        course_label: string;
        totals?: { count?: number; average_score?: number; critical_schools_count?: number };
        items: Array<Record<string, unknown>>;
      }>;
      totals?: Record<string, number>;
    };
    series_by_school_and_course?: {
      schools: Array<{
        school_id?: string;
        school_name?: string;
        school_position?: number;
        totals?: Record<string, number>;
        course_sections: Array<{
          course_label: string;
          totals?: Record<string, number>;
          items: Array<Record<string, unknown>>;
        }>;
      }>;
      totals?: Record<string, number>;
    };
    classes_by_series?: {
      sections: Array<{
        grade_name: string;
        totals?: Record<string, number>;
        items: Array<Record<string, unknown>>;
      }>;
      totals?: Record<string, number>;
    };
    students_by_course?: {
      sections: Array<{
        course_label: string;
        totals?: Record<string, number>;
        items: Array<Record<string, unknown>>;
      }>;
      totals?: Record<string, number>;
    };
  };
  teacher_course_sections?: Array<{
    course_label: string;
    totals?: { count?: number };
    items: Array<{
      position: number;
      teacher_id?: string;
      teacher_name?: string;
      teacher_email?: string;
      average_score?: number;
      average_proficiency?: number;
      classification?: string;
      total_evaluations?: number;
      classes_count?: number;
      grade_names?: string[];
    }>;
  }>;
  totals: { count: number };
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
  overview?: {
    by_course?: Record<
      string,
      {
        counts_by_status: {
          destaque: number;
          desenvolvimento: number;
          atencao: number;
        };
        chart_rows: Array<{
          position: number;
          school_id?: string;
          school_name?: string;
          average_score: number;
          average_proficiency?: number;
          participation_rate?: number;
          participating_students?: number;
          total_students?: number;
          adequado_avancado_count?: number;
          adequado_avancado_pct?: number;
          status: "destaque" | "desenvolvimento" | "atencao";
          level_tag?: string;
          is_critical?: boolean;
        }>;
        table_rows: Array<{
          position: number;
          school_id?: string;
          school_name?: string;
          average_score: number;
          average_proficiency?: number;
          participation_rate?: number;
          participating_students?: number;
          total_students?: number;
          adequado_avancado_count?: number;
          adequado_avancado_pct?: number;
          status: "destaque" | "desenvolvimento" | "atencao";
          level_tag?: string;
          is_critical?: boolean;
        }>;
      }
    >;
    summary?: {
      total_schools: number;
      total_students: number;
      participating_students: number;
      participation_rate: number;
      top_school?: Record<string, unknown> | null;
    };
  };
  municipal_ranking?: {
    items: Array<{
      position: number;
      school_id?: string;
      school_name?: string;
      participation_rate: number;
      participating_students: number;
      total_students: number;
      average_proficiency: number;
      average_score: number;
      adequado_avancado_count?: number;
      adequado_avancado_pct: number;
      best_class_name?: string;
      best_class_grade?: string;
      best_class_turma?: string;
      level_tag?: string;
      is_critical?: boolean;
    }>;
    totals?: { count: number };
  };
  school_class_ranking?: {
    school_options?: Array<{ id: string; name: string }>;
    items_by_school?: Record<
      string,
      Array<{
        position: number;
        course_label?: string;
        series_class_name: string;
        teacher_name: string;
        participation_rate: number;
        participating_students: number;
        total_students: number;
        average_proficiency: number;
        average_score: number;
        adequado_avancado_count?: number;
        adequado_avancado_pct: number;
        level_tag?: string;
        is_critical?: boolean;
      }>
    >;
  };
  teachers_top?: {
    items: Array<{
      position: number;
      teacher_id?: string;
      teacher_name?: string;
      teacher_email?: string;
      school_name?: string;
      series_class_name?: string;
      participating_students?: number;
      adequado_avancado_count?: number;
      adequado_avancado_pct?: number;
      average_proficiency?: number;
      average_score?: number;
      classification?: string;
      is_critical?: boolean;
    }>;
    totals?: { count: number };
  };
  discipline_options?: Array<{ id: string; name: string }>;
  selected_discipline?: string | null;
  grade_options?: Array<{ id: string; name: string }>;
  classes_ranking?: {
    grade_name?: string | null;
    items: Array<{
      position: number;
      class_id?: string;
      class_name?: string;
      shift?: string;
      grade_name?: string;
      participation_rate: number;
      participating_students: number;
      total_students: number;
      average_proficiency: number;
      average_score: number;
      adequado_avancado_count?: number;
      adequado_avancado_pct?: number;
      level_tag?: string;
      is_critical?: boolean;
    }>;
    totals?: { count: number };
  };
}

type GetRankingInput = {
  rankingType: RankingType;
  filters?: RankingFilters;
  page?: number;
  perPage?: number;
};

export class RankingApiService {
  static async getRanking({
    rankingType,
    filters = {},
    page = 1,
    perPage = 20,
  }: GetRankingInput): Promise<RankingResponse> {
    const estado = String(filters.estado || "").trim();
    const municipio = String(filters.municipio || "").trim();
    if (!estado || !municipio) {
      throw new Error("Selecione estado e município para consultar o ranking.");
    }
    if (rankingType === "specific_evaluation" && !String(filters.evaluation_id || "").trim()) {
      throw new Error("Selecione uma avaliação para consultar o ranking específico.");
    }
    if (rankingType === "specific_answer_sheet" && !String(filters.answer_sheet_id || "").trim()) {
      throw new Error("Selecione um cartão resposta para consultar o ranking específico.");
    }

    const params: Record<string, string | number> = {
      ranking_type: rankingType,
      page,
      per_page: perPage,
    };

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        params[key] = String(value);
      }
    });

    const response = await api.get<RankingResponse>("/ranking/report", { params });
    return response.data;
  }

  static getGeneralRanking(filters: RankingFilters, page = 1, perPage = 20) {
    return this.getRanking({ rankingType: "general", filters, page, perPage });
  }

  static getSpecificEvaluationRanking(filters: RankingFilters, page = 1, perPage = 20) {
    return this.getRanking({ rankingType: "specific_evaluation", filters, page, perPage });
  }

  static getSpecificAnswerSheetRanking(filters: RankingFilters, page = 1, perPage = 20) {
    return this.getRanking({ rankingType: "specific_answer_sheet", filters, page, perPage });
  }

  static getTeacherRanking(filters: RankingFilters, page = 1, perPage = 20) {
    return this.getRanking({ rankingType: "teachers", filters, page, perPage });
  }

  /**
   * Busca o ranking peer paginando até reunir todos os alunos de cada grupo.
   * Usado na exportação PDF (a UI usa páginas menores).
   */
  static async getAllClassesPeerRanking(
    filters: ClassPeerRankingFilters
  ): Promise<ClassPeerRankingResponse> {
    const perPage = 100;
    const first = await this.getClassesPeerRanking(filters, 1, perPage);
    const maxPages = Math.max(
      1,
      ...first.sections.flatMap((section) =>
        (section.peer_groups || []).map((group) => Number(group.students_pagination?.total_pages || 1))
      )
    );
    if (maxPages <= 1) return first;

    const byPeerKey = new Map<string, ClassPeerStudentRankingItem[]>();
    for (const section of first.sections) {
      for (const group of section.peer_groups || []) {
        byPeerKey.set(group.peer_key, [...(group.student_ranking || [])]);
      }
    }

    for (let page = 2; page <= maxPages; page += 1) {
      const next = await this.getClassesPeerRanking(filters, page, perPage);
      for (const section of next.sections) {
        for (const group of section.peer_groups || []) {
          const current = byPeerKey.get(group.peer_key) || [];
          byPeerKey.set(group.peer_key, current.concat(group.student_ranking || []));
        }
      }
    }

    return {
      ...first,
      sections: first.sections.map((section) => ({
        ...section,
        peer_groups: (section.peer_groups || []).map((group) => {
          const allStudents = byPeerKey.get(group.peer_key) || group.student_ranking || [];
          const total = Number(group.students_pagination?.total || allStudents.length);
          return {
            ...group,
            student_ranking: allStudents,
            students_pagination: {
              page: 1,
              per_page: Math.max(allStudents.length, 1),
              total,
              total_pages: 1,
            },
          };
        }),
      })),
    };
  }

  static async getClassesPeerRanking(
    filters: ClassPeerRankingFilters,
    page = 1,
    perPage = 20
  ): Promise<ClassPeerRankingResponse> {
    const scope = filters.scope === "escola" ? "escola" : "municipio";
    const evaluationIds = Array.from(
      new Set(
        (filters.evaluation_ids?.length
          ? filters.evaluation_ids
          : [filters.evaluation_id]
        )
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )
    );
    if (evaluationIds.length === 0) {
      throw new Error("Selecione ao menos uma avaliação para consultar o ranking geral de turmas.");
    }
    if (scope === "municipio" && !String(filters.municipio || "").trim()) {
      throw new Error("Selecione o município para consultar o ranking geral.");
    }
    if (scope === "escola" && !String(filters.escola || "").trim()) {
      throw new Error("Selecione a escola para consultar o ranking por escola.");
    }

    const params: Record<string, string | number> = {
      scope,
      evaluation_id: evaluationIds[0],
      evaluation_ids: evaluationIds.join(","),
      page,
      per_page: perPage,
    };

    const optionalKeys: Array<keyof ClassPeerRankingFilters> = [
      "municipio",
      "escola",
      "serie",
      "turma_nome",
      "turno",
    ];
    for (const key of optionalKeys) {
      const value = String(filters[key] || "").trim();
      if (value && value.toLowerCase() !== "all") {
        params[key] = value;
      }
    }

    const response = await api.get<ClassPeerRankingResponse>("/ranking/classes-peer", { params });
    return response.data;
  }

  static async getConsolidatedGeneralRanking(
    filters: ClassPeerRankingFilters,
    page = 1,
    perPage = 20
  ): Promise<ConsolidatedGeneralRankingResponse> {
    const scope = filters.scope === "escola" ? "escola" : "municipio";
    const evaluationIds = Array.from(
      new Set(
        (filters.evaluation_ids?.length
          ? filters.evaluation_ids
          : [filters.evaluation_id]
        )
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )
    );
    if (evaluationIds.length === 0) {
      throw new Error("Selecione ao menos uma avaliação para consultar o ranking geral.");
    }
    if (scope === "municipio" && !String(filters.municipio || "").trim()) {
      throw new Error("Selecione o município para consultar o ranking geral.");
    }
    if (scope === "escola" && !String(filters.escola || "").trim()) {
      throw new Error("Selecione a escola para consultar o ranking por escola.");
    }

    const params: Record<string, string | number> = {
      scope,
      evaluation_id: evaluationIds[0],
      evaluation_ids: evaluationIds.join(","),
      page,
      per_page: perPage,
    };

    const optionalKeys: Array<keyof ClassPeerRankingFilters> = [
      "municipio",
      "escola",
      "serie",
      "turma_nome",
      "turno",
    ];
    for (const key of optionalKeys) {
      const value = String(filters[key] || "").trim();
      if (value && value.toLowerCase() !== "all") {
        params[key] = value;
      }
    }

    const response = await api.get<ConsolidatedGeneralRankingResponse>("/ranking/geral", { params });
    return response.data;
  }

  /** Busca todas as páginas do ranking geral consolidado (exportação PDF). */
  static async getAllConsolidatedGeneralRanking(
    filters: ClassPeerRankingFilters
  ): Promise<ConsolidatedGeneralRankingResponse> {
    const perPage = 100;
    const first = await this.getConsolidatedGeneralRanking(filters, 1, perPage);
    const totalPages = Math.max(1, Number(first.pagination?.total_pages || 1));
    if (totalPages <= 1) return first;

    const students = [...(first.students || [])];
    for (let page = 2; page <= totalPages; page += 1) {
      const next = await this.getConsolidatedGeneralRanking(filters, page, perPage);
      students.push(...(next.students || []));
    }

    const total = Number(first.pagination?.total || students.length);
    return {
      ...first,
      students,
      pagination: {
        page: 1,
        per_page: total,
        total,
        total_pages: 1,
      },
      totals: { students_count: total },
    };
  }
}

export type ClassPeerScope = "municipio" | "escola";

export interface ClassPeerRankingFilters {
  scope: ClassPeerScope;
  evaluation_id: string;
  evaluation_ids?: string[];
  municipio?: string;
  escola?: string;
  serie?: string;
  turma_nome?: string;
  turno?: string;
}

export interface ClassPeerSubjectMetrics {
  subject_id?: string;
  subject_name?: string;
  average_proficiency?: number;
  average_score?: number;
  grade?: number;
  proficiency?: number;
  classification?: string;
  correct_answers?: number;
  total_questions?: number;
  accuracy_rate?: number;
}

export interface ClassPeerClassRankingItem {
  position: number;
  school_id?: string;
  school_name?: string;
  class_id?: string;
  class_name?: string;
  shift?: string;
  average_proficiency?: number;
  average_score?: number;
  classification?: string;
  correct_answers?: number;
  total_questions?: number;
  accuracy_rate?: number;
  participating_students?: number;
  subjects?: ClassPeerSubjectMetrics[];
}

export interface ClassPeerStudentRankingItem {
  position: number;
  student_id?: string;
  name?: string;
  school_id?: string;
  school_name?: string;
  school_display_name?: string;
  class_id?: string;
  class_name?: string;
  shift?: string;
  serie_id?: string;
  serie_name?: string;
  category?: string;
  grade?: number;
  proficiency?: number;
  classification?: string;
  correct_answers?: number;
  raw_correct_answers?: number;
  total_questions?: number;
  accuracy_rate?: number;
  subjects?: ClassPeerSubjectMetrics[];
  source_evaluation_id?: string;
  course_name?: string;
}

export interface ClassPeerGroup {
  turma_nome: string;
  shift: string;
  peer_key: string;
  class_ranking: ClassPeerClassRankingItem[];
  student_ranking: ClassPeerStudentRankingItem[];
  students_pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
  totals: {
    classes_count: number;
    students_count: number;
  };
}

export interface ClassPeerSection {
  serie_id: string;
  serie_name: string;
  peer_groups: ClassPeerGroup[];
  totals: {
    peer_groups_count: number;
    classes_count: number;
    students_count: number;
  };
}

export interface ClassPeerRankingResponse {
  evaluation_id: string;
  evaluation_ids?: string[];
  evaluation_title?: string;
  evaluations?: Array<{ id: string; title?: string }>;
  scope: ClassPeerScope | string;
  filters: {
    municipio?: string | null;
    escola?: string | null;
    serie?: string | null;
    turma_nome?: string | null;
    turno?: string | null;
  };
  resolved_scope?: {
    scope?: string;
    city_id?: string | null;
    school_ids?: string[];
  };
  sections: ClassPeerSection[];
  totals?: {
    sections_count?: number;
    peer_groups_count?: number;
    students_count?: number;
  };
}

/** Ranking Geral consolidado (lista única de alunos). */
export interface ConsolidatedGeneralRankingResponse {
  evaluation_id: string;
  evaluation_ids?: string[];
  evaluation_title?: string;
  evaluations?: Array<{ id: string; title?: string }>;
  scope: ClassPeerScope | string;
  filters: {
    municipio?: string | null;
    escola?: string | null;
    serie?: string | null;
    turma_nome?: string | null;
    turno?: string | null;
  };
  resolved_scope?: {
    scope?: string;
    city_id?: string | null;
    school_ids?: string[];
  };
  students: ClassPeerStudentRankingItem[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
  totals?: {
    students_count?: number;
  };
}
