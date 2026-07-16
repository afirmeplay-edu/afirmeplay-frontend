import { api } from "@/lib/api";

/** Rubrica de correção manual da avaliação subjetiva. */
export type SubjectiveRubricValue = "SIM" | "PARCIAL" | "NAO" | "BRANCO";

export type SubjectiveTestType = "AVALIACAO" | "SIMULADO";

export interface SubjectiveTestQuestionInput {
  number: number;
  code: string;
  skill_description: string;
}

export interface SubjectiveTestQuestion {
  id: string;
  subjective_test_id?: string;
  number: number;
  code: string;
  skill_description: string;
}

export interface SubjectiveTestEntityRef {
  id: string;
  name: string;
}

export interface SubjectiveTestClassRef extends SubjectiveTestEntityRef {
  students_count?: number;
  school?: SubjectiveTestEntityRef;
}

export interface SubjectiveTestCreatedBy {
  id: string;
  name: string;
}

/** Payload de criação/atualização — POST/PUT /subjective-tests */
export interface SubjectiveTestPayload {
  title: string;
  description?: string;
  test_type: SubjectiveTestType;
  subject_id: string;
  grade_id: string;
  /** Data só para consulta (YYYY-MM-DD). */
  application_date: string;
  municipalities: string[];
  schools: string[];
  classes: string[];
  questions: SubjectiveTestQuestionInput[];
}

/** Detalhe / item de listagem de GET /subjective-tests */
export interface SubjectiveTest {
  id: string;
  title: string;
  description?: string | null;
  test_type: string;
  subject?: SubjectiveTestEntityRef;
  grade?: SubjectiveTestEntityRef;
  application_date?: string | null;
  municipalities?: SubjectiveTestEntityRef[];
  schools?: SubjectiveTestEntityRef[];
  classes?: SubjectiveTestClassRef[];
  status?: string;
  createdBy?: SubjectiveTestCreatedBy;
  createdAt?: string;
  total_questions?: number;
  questions?: SubjectiveTestQuestion[];
}

export interface SubjectiveTestListResponse {
  items: SubjectiveTest[];
  total?: number;
  page?: number;
  per_page?: number;
}

export interface SubjectiveCorrectionTestInfo {
  id: string;
  title: string;
  test_type: string;
}

export interface SubjectiveCorrectionClassInfo {
  id: string;
  name: string;
}

export interface SubjectiveCorrectionQuestion {
  id: string;
  number: number;
  code: string;
  skill_description: string;
}

export interface SubjectiveCorrectionStudent {
  id: string;
  name: string;
  registration: string;
  present: boolean;
  results: Record<string, SubjectiveRubricValue>;
}

/** Resposta de GET /subjective-tests/:id/turmas/:classId/correcao */
export interface SubjectiveCorrectionMatrixResponse {
  subjective_test: SubjectiveCorrectionTestInfo;
  class: SubjectiveCorrectionClassInfo;
  questions: SubjectiveCorrectionQuestion[];
  students: SubjectiveCorrectionStudent[];
}

export interface SetCorrectionCellPayload {
  subjective_question_id: string;
  student_id: string;
  value: SubjectiveRubricValue | null;
}

export interface SubjectiveCorrectionResult {
  id: string;
  subjective_test_id: string;
  subjective_question_id: string;
  student_id: string;
  value: SubjectiveRubricValue;
  corrected_by?: string;
  corrected_at?: string;
}

export type SetCorrectionCellResponse =
  | { removed: false; result: SubjectiveCorrectionResult }
  | { removed: true };

export interface SetPresencePayload {
  student_id: string;
  present: boolean;
}

export interface PresenceRecord {
  student_id: string;
  subjective_test_id?: string;
  present: boolean;
  [key: string]: unknown;
}

export interface FinalizeProcessedStudent {
  skipped: boolean;
  student_id: string;
  subjective_test_id: string;
  correct_answers: number;
  total_questions: number;
  score_percentage: number;
  grade: number;
  proficiency: number | string;
  classification: string;
}

export interface FinalizeClassCorrectionResponse {
  processed_count: number;
  skipped_count: number;
  error_count: number;
  processed: FinalizeProcessedStudent[];
  skipped_student_ids: string[];
  error_student_ids: string[];
}

export type SubjectiveSaebLevel = "abaixo" | "basico" | "adequado" | "avancado";

export interface SubjectiveDashboardKpis {
  total_students: number;
  respondents: number;
  participation_pct: number;
  absent: number;
  hit_rate_pct: number;
  saeb_level: SubjectiveSaebLevel | string;
  saeb_label: string;
  total_responses: number;
}

export interface SubjectiveDashboardDistributionItem {
  name: "SIM" | "PARCIAL" | "NAO" | "BRANCO" | string;
  value: number;
  pct: number;
}

export interface SubjectiveDashboardPerQuestion {
  id: string;
  number: number;
  code: string;
  skill_description: string;
  SIM: number;
  PARCIAL: number;
  NAO: number;
  BRANCO: number;
  total: number;
  hit_rate_pct: number;
  saeb_level: SubjectiveSaebLevel | string;
  saeb_label: string;
}

/** Resposta de GET /subjective-tests/:id/dashboard */
export interface SubjectiveDashboardResponse {
  subjective_test: {
    id: string;
    title: string;
    test_type: string;
  };
  filters: {
    class_id: string | null;
    classes: SubjectiveTestEntityRef[];
  };
  kpis: SubjectiveDashboardKpis;
  totals: Record<SubjectiveRubricValue, number>;
  distribution: SubjectiveDashboardDistributionItem[];
  saeb_levels: Record<SubjectiveSaebLevel, number>;
  per_question: SubjectiveDashboardPerQuestion[];
}

function normalizeListResponse(data: unknown): SubjectiveTestListResponse {
  if (Array.isArray(data)) {
    return { items: data as SubjectiveTest[] };
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const items =
      (Array.isArray(obj.items) && (obj.items as SubjectiveTest[])) ||
      (Array.isArray(obj.data) && (obj.data as SubjectiveTest[])) ||
      (Array.isArray(obj.results) && (obj.results as SubjectiveTest[])) ||
      [];
    return {
      items,
      total: typeof obj.total === "number" ? obj.total : undefined,
      page: typeof obj.page === "number" ? obj.page : undefined,
      per_page: typeof obj.per_page === "number" ? obj.per_page : undefined,
    };
  }
  return { items: [] };
}

/**
 * Cliente frontend para o blueprint `/subjective-tests`
 * (avaliação subjetiva tipo cartão-resposta — prova física fora do sistema).
 */
export const subjectiveTestApi = {
  async list(params?: { page?: number; per_page?: number }): Promise<SubjectiveTestListResponse> {
    const response = await api.get("/subjective-tests", { params });
    return normalizeListResponse(response.data);
  },

  async getById(id: string): Promise<SubjectiveTest> {
    const response = await api.get<SubjectiveTest>(`/subjective-tests/${id}`);
    return response.data;
  },

  async create(payload: SubjectiveTestPayload): Promise<SubjectiveTest> {
    const response = await api.post<SubjectiveTest>("/subjective-tests", payload);
    return response.data;
  },

  async update(id: string, payload: SubjectiveTestPayload): Promise<SubjectiveTest> {
    const response = await api.put<SubjectiveTest>(`/subjective-tests/${id}`, payload);
    return response.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/subjective-tests/${id}`);
  },

  async getCorrectionMatrix(testId: string, classId: string): Promise<SubjectiveCorrectionMatrixResponse> {
    const response = await api.get<SubjectiveCorrectionMatrixResponse>(
      `/subjective-tests/${testId}/turmas/${classId}/correcao`
    );
    return response.data;
  },

  async setCorrectionCell(testId: string, payload: SetCorrectionCellPayload): Promise<SetCorrectionCellResponse> {
    const response = await api.post<SetCorrectionCellResponse>(`/subjective-tests/${testId}/correcao`, payload);
    return response.data;
  },

  async setPresence(testId: string, payload: SetPresencePayload): Promise<PresenceRecord> {
    const response = await api.post<PresenceRecord>(`/subjective-tests/${testId}/presenca`, payload);
    return response.data;
  },

  async finalizeClassCorrection(testId: string, classId: string): Promise<FinalizeClassCorrectionResponse> {
    const response = await api.post<FinalizeClassCorrectionResponse>(
      `/subjective-tests/${testId}/turmas/${classId}/finalizar`
    );
    return response.data;
  },

  /**
   * GET /subjective-tests/:id/dashboard — KPIs e distribuição da correção.
   * Sem class_id agrega todas as turmas do escopo (professor só vê as que leciona).
   */
  async getDashboard(testId: string, classId?: string | null): Promise<SubjectiveDashboardResponse> {
    const response = await api.get<SubjectiveDashboardResponse>(`/subjective-tests/${testId}/dashboard`, {
      params: classId ? { class_id: classId } : undefined,
    });
    return response.data;
  },
};

export default subjectiveTestApi;
