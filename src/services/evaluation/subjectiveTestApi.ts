import { api } from "@/lib/api";
import type { SubjectiveRubricMark, SubjectiveRubricGroup } from "@/lib/subjectiveRubric";

/** Rubrica de correção manual da avaliação subjetiva (code da marcação). */
export type SubjectiveRubricValue = string;

export type SubjectiveTestType = "AVALIACAO" | "SIMULADO";

export interface SubjectiveTestQuestionInput {
  number: number;
  code: string;
  skill_description: string;
  /** temp_key do grupo no create, ou id persistido no edit */
  rubric_group_key?: string;
  rubric_group_id?: string | null;
}

export interface SubjectiveTestQuestion {
  id: string;
  subjective_test_id?: string;
  number: number;
  code: string;
  skill_description: string;
  rubric_group_id?: string | null;
}

export interface SubjectiveRubricGroupPayload {
  id?: string | null;
  temp_key: string;
  name: string;
  sort_order: number;
  marks: Array<Pick<SubjectiveRubricMark, "code" | "label" | "color" | "weight" | "sort_order">>;
}

export interface SubjectiveTestEntityRef {
  id: string;
  name: string;
}

export interface SubjectiveTestClassRef extends SubjectiveTestEntityRef {
  students_count?: number;
  school?: SubjectiveTestEntityRef;
  /** Nulo quando o recorte é a turma inteira. */
  subturma_id?: string | null;
}

/** Subturma ADAP vinculada à prova. `id` é a subturma; `class_id` é a turma-mãe. */
export interface SubjectiveTestSubturmaRef {
  id: string;
  class_id: string;
  name?: string;
  display_name?: string;
  support_level?: number;
  students_count?: number;
  school?: SubjectiveTestEntityRef | null;
  class?: {
    id?: string;
    name?: string;
    school?: SubjectiveTestEntityRef | null;
  } | null;
}

export interface SubjectiveTestCreatedBy {
  id: string;
  name: string;
}

export interface SubjectiveClassProgress {
  id: string;
  name: string;
  /** Nulo na turma inteira. O `id` continua sendo a turma-mãe. */
  subturma_id?: string | null;
  school?: SubjectiveTestEntityRef | null;
  students_count?: number;
  filled_cells?: number;
  expected_cells?: number;
  pct?: number;
  finalized_students?: number;
  status?: string;
}

export interface SubjectiveCorrectionSummary {
  total_classes: number;
  concluded_classes: number;
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
  /** Turma inteira. O id da subturma ADAP fica fora daqui. */
  classes: string[];
  /** Só o recorte ADAP. Cada id é o da subturma, não o da turma-mãe. */
  subturmas?: string[];
  questions: SubjectiveTestQuestionInput[];
  /** Legado: um único conjunto de marcações (vira 1 grupo no backend). */
  rubric_marks?: SubjectiveRubricMark[];
  /** Preferencial: múltiplos grupos de critérios. */
  rubric_groups?: SubjectiveRubricGroupPayload[];
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
  subturmas?: SubjectiveTestSubturmaRef[];
  status?: string;
  createdBy?: SubjectiveTestCreatedBy;
  createdAt?: string;
  total_questions?: number;
  questions?: SubjectiveTestQuestion[];
  rubric_marks?: SubjectiveRubricMark[];
  rubric_groups?: SubjectiveRubricGroup[];
  class_progress?: SubjectiveClassProgress[];
  correction_summary?: SubjectiveCorrectionSummary;
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
  subject?: SubjectiveTestEntityRef | null;
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
  rubric_group_id?: string | null;
  rubric_marks?: SubjectiveRubricMark[];
}

/** Resultado calculado por aluno (preview ao vivo ou EvaluationResult após finalizar). */
export interface SubjectiveStudentEvaluation {
  score_percentage: number;
  grade: number;
  proficiency: number | string;
  classification: string;
  correct_answers: number;
  total_questions: number;
  persisted: boolean;
}

export interface SubjectiveCorrectionStudent {
  id: string;
  name: string;
  registration: string;
  present: boolean;
  results: Record<string, SubjectiveRubricValue>;
  /** Presente após finalizar; null se ainda não gravado. Preview ao vivo também pode preencher. */
  evaluation?: SubjectiveStudentEvaluation | null;
}

/** Resposta de GET /subjective-tests/:id/turmas/:classId/correcao */
export interface SubjectiveCorrectionMatrixResponse {
  subjective_test: SubjectiveCorrectionTestInfo;
  class: SubjectiveCorrectionClassInfo;
  questions: SubjectiveCorrectionQuestion[];
  students: SubjectiveCorrectionStudent[];
  rubric_marks?: SubjectiveRubricMark[];
  rubric_groups?: SubjectiveRubricGroup[];
}

/** Resposta de GET /subjective-tests/:id/alunos/:studentId/resultado (preview, sem gravar). */
export type SubjectiveStudentResultPreview =
  | ({
      skipped: false;
      persisted: boolean;
      student_id: string;
      subjective_test_id: string;
    } & Omit<SubjectiveStudentEvaluation, "persisted">)
  | {
      skipped: true;
      reason: string;
      student_id: string;
      subjective_test_id: string;
      persisted: boolean;
    };

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
  persisted?: boolean;
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
  code?: string;
  name: string;
  label?: string;
  color?: string;
  weight?: number;
  value: number;
  pct: number;
}

export interface SubjectiveDashboardPerQuestion {
  id: string;
  number: number;
  code: string;
  skill_description: string;
  rubric_group_id?: string | null;
  rubric_marks?: SubjectiveRubricMark[];
  SIM?: number;
  PARCIAL?: number;
  NAO?: number;
  BRANCO?: number;
  counts?: Record<string, number>;
  total: number;
  hit_rate_pct: number;
  saeb_level: SubjectiveSaebLevel | string;
  saeb_label: string;
}

/** Aluno classificado no nível SAEB simplificado do dashboard. */
export interface SubjectiveDashboardStudentByLevel {
  id: string;
  name: string;
  registration?: string | null;
  score_percentage: number;
  saeb_level: SubjectiveSaebLevel | string;
  saeb_label: string;
}

/** Linha da tabelinha de alunos (inclui ausentes / sem lançamento). */
export interface SubjectiveDashboardStudentRow {
  id: string;
  name: string;
  registration?: string | null;
  present: boolean;
  score_percentage: number | null;
  saeb_level: SubjectiveSaebLevel | string | null;
  saeb_label: string | null;
  results: Record<string, SubjectiveRubricValue>;
}

/** Resposta de GET /subjective-tests/:id/dashboard */
export interface SubjectiveDashboardResponse {
  subjective_test: {
    id: string;
    title: string;
    test_type: string;
    subject?: SubjectiveTestEntityRef | null;
  };
  filters: {
    class_id: string | null;
    classes: SubjectiveTestEntityRef[];
  };
  kpis: SubjectiveDashboardKpis;
  totals: Record<string, number>;
  distribution: SubjectiveDashboardDistributionItem[];
  rubric_marks?: SubjectiveRubricMark[];
  rubric_groups?: SubjectiveRubricGroup[];
  /** Contagem de QUESTÕES por faixa (legado / habilidades). */
  saeb_levels: Record<SubjectiveSaebLevel, number>;
  /** Contagem de ALUNOS por faixa SAEB simplificada. */
  student_saeb_levels?: Record<SubjectiveSaebLevel, number>;
  /** Alunos agrupados por nível — usado no hover do gráfico. */
  students_by_saeb_level?: Record<SubjectiveSaebLevel, SubjectiveDashboardStudentByLevel[]>;
  /** Tabelinha de alunos com rubrica e nível. */
  students?: SubjectiveDashboardStudentRow[];
  per_question: SubjectiveDashboardPerQuestion[];
}

/** Item de entidade em GET /subjective-tests/opcoes-filtros */
export interface SubjectiveFilterEntity {
  id: string;
  nome: string;
  /** Preenchido quando a linha do filtro é o recorte ADAP da turma. */
  subturma_id?: string | null;
}

/** Valor único do select: turma inteira usa o id; ADAP usa `turmaId::subturmaId`. */
export function subjectiveTurmaFilterValue(item: { id: string; subturma_id?: string | null }): string {
  const subturmaId = item.subturma_id?.trim();
  return subturmaId ? `${item.id}::${subturmaId}` : item.id;
}

export function parseSubjectiveTurmaFilterValue(value: string): { classId: string; subturmaId: string | null } {
  const separator = value.indexOf("::");
  if (separator === -1) return { classId: value, subturmaId: null };
  const classId = value.slice(0, separator);
  const subturmaId = value.slice(separator + 2).trim();
  return { classId, subturmaId: subturmaId || null };
}

/** Avaliação em GET /subjective-tests/opcoes-filtros */
export interface SubjectiveFilterEvaluation {
  id: string;
  titulo: string;
  test_type?: string | null;
  grade_id?: string | null;
  subject_id?: string | null;
  subject?: SubjectiveTestEntityRef | null;
  disciplina?: string | null;
}

/** Query de GET /subjective-tests/opcoes-filtros */
export interface SubjectiveFilterOptionsParams {
  estado?: string;
  municipio?: string;
  escola?: string;
  serie?: string;
  avaliacao?: string;
}

/**
 * Resposta de GET /subjective-tests/opcoes-filtros
 * Hierarquia: Estado → Município → Escola → Série → Avaliação → Turma
 */
export interface SubjectiveFilterOptionsResponse {
  estados?: SubjectiveFilterEntity[];
  municipios?: SubjectiveFilterEntity[];
  escolas?: SubjectiveFilterEntity[];
  series?: SubjectiveFilterEntity[];
  avaliacoes?: SubjectiveFilterEvaluation[];
  turmas?: SubjectiveFilterEntity[];
  /** Diretor/coordenador: escola vinculada já pré-selecionada no backend. */
  escola_pre_selecionada?: string | null;
  error?: string;
  status?: number;
}

function normalizeFilterEntity(raw: unknown): SubjectiveFilterEntity | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = obj.id != null ? String(obj.id) : "";
  if (!id) return null;
  const nome = String(obj.nome ?? obj.name ?? id);
  const subRaw = obj.subturma_id;
  const subturmaId =
    subRaw != null && String(subRaw).trim() && String(subRaw).trim().toLowerCase() !== "null"
      ? String(subRaw).trim()
      : null;
  return subturmaId ? { id, nome, subturma_id: subturmaId } : { id, nome };
}

function normalizeFilterEntities(raw: unknown): SubjectiveFilterEntity[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeFilterEntity).filter((e): e is SubjectiveFilterEntity => e != null);
}

function normalizeFilterEvaluations(raw: unknown): SubjectiveFilterEvaluation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const obj = item as Record<string, unknown>;
      const id = obj.id != null ? String(obj.id) : "";
      if (!id) return null;
      const subjectRaw = obj.subject;
      let subject: SubjectiveTestEntityRef | null = null;
      if (subjectRaw && typeof subjectRaw === "object") {
        const s = subjectRaw as Record<string, unknown>;
        if (s.id != null) {
          subject = { id: String(s.id), name: String(s.name ?? s.nome ?? "") };
        }
      }
      const subjectId = obj.subject_id != null ? String(obj.subject_id) : subject?.id ?? null;
      const disciplina =
        obj.disciplina != null
          ? String(obj.disciplina)
          : subject?.name
            ? subject.name
            : null;
      return {
        id,
        titulo: String(obj.titulo ?? obj.title ?? obj.nome ?? obj.name ?? "Sem título"),
        test_type: obj.test_type != null ? String(obj.test_type) : null,
        grade_id: obj.grade_id != null ? String(obj.grade_id) : null,
        subject_id: subjectId,
        subject: subject ?? (subjectId ? { id: subjectId, name: disciplina || "" } : null),
        disciplina,
      } satisfies SubjectiveFilterEvaluation;
    })
    .filter((e): e is SubjectiveFilterEvaluation => e != null);
}

export interface SubjectiveAvailableGrade {
  id: string;
  name: string;
}

export interface SubjectiveAvailableTurma {
  id: string;
  subturma_id: string;
  name: string;
  class_id: string;
  grade_id?: string;
  students_count?: number;
  support_level?: number;
}

function readOptionalCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function normalizeIdNameList(raw: unknown): SubjectiveAvailableGrade[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const obj = item as Record<string, unknown>;
    const id = obj.id != null ? String(obj.id).trim() : "";
    if (!id) return [];
    return [{ id, name: String(obj.name ?? obj.nome ?? id) }];
  });
}

function normalizeAvailableTurmas(raw: unknown): SubjectiveAvailableTurma[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { turmas?: unknown }).turmas)
      ? (raw as { turmas: unknown[] }).turmas
      : raw && typeof raw === "object" && Array.isArray((raw as { classes?: unknown }).classes)
        ? (raw as { classes: unknown[] }).classes
        : [];
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const obj = item as Record<string, unknown>;
    const subturmaId = String(obj.subturma_id ?? obj.id ?? "").trim();
    const classId = obj.class_id != null ? String(obj.class_id).trim() : "";
    if (!subturmaId || !classId) return [];
    const level = readOptionalCount(obj.support_level);
    return [
      {
        id: subturmaId,
        subturma_id: subturmaId,
        name: String(obj.name ?? obj.display_name ?? "ADAP"),
        class_id: classId,
        grade_id: obj.grade_id != null ? String(obj.grade_id) : undefined,
        students_count: readOptionalCount(obj.students_count),
        support_level: level,
      },
    ];
  });
}

function subturmaQuery(subturmaId?: string | null): { subturma_id: string } | undefined {
  const id = subturmaId?.trim();
  return id ? { subturma_id: id } : undefined;
}

function isFilterAll(value?: string | null): boolean {
  if (value == null) return true;
  const v = value.trim().toLowerCase();
  return v === "" || v === "all" || v === "todas" || v === "todos";
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

  /** Séries regulares que têm ADAP. Educação Especial não usa /grades/education-stage. */
  async getAvailableSeries(params: {
    educationStageId: string;
    municipalityId?: string;
    schoolId?: string;
  }): Promise<SubjectiveAvailableGrade[]> {
    const query: Record<string, string> = { education_stage_id: params.educationStageId };
    if (params.municipalityId) query.municipality_id = params.municipalityId;
    if (params.schoolId) query.school_id = params.schoolId;
    const response = await api.get("/subjective-tests/series-disponiveis", { params: query });
    const data = response.data;
    const grades =
      data && typeof data === "object" && Array.isArray((data as { grades?: unknown }).grades)
        ? (data as { grades: unknown }).grades
        : data;
    return normalizeIdNameList(grades);
  },

  /** Uma linha por subturma ADAP. O id é o da subturma; class_id é a turma-mãe. */
  async getAvailableTurmas(params: {
    educationStageId: string;
    gradeId: string;
    schoolId: string;
  }): Promise<SubjectiveAvailableTurma[]> {
    const response = await api.get("/subjective-tests/turmas-disponiveis", {
      params: {
        education_stage_id: params.educationStageId,
        grade_id: params.gradeId,
        school_id: params.schoolId,
      },
    });
    return normalizeAvailableTurmas(response.data);
  },

  async getCorrectionMatrix(
    testId: string,
    classId: string,
    subturmaId?: string | null
  ): Promise<SubjectiveCorrectionMatrixResponse> {
    const response = await api.get<SubjectiveCorrectionMatrixResponse>(
      `/subjective-tests/${testId}/turmas/${classId}/correcao`,
      { params: subturmaQuery(subturmaId) }
    );
    return response.data;
  },

  /**
   * GET /subjective-tests/:id/alunos/:studentId/resultado
   * Preview ao vivo (mesma fórmula do finalize), sem gravar EvaluationResult.
   */
  async getStudentResultPreview(testId: string, studentId: string): Promise<SubjectiveStudentResultPreview> {
    const response = await api.get<SubjectiveStudentResultPreview>(
      `/subjective-tests/${testId}/alunos/${studentId}/resultado`
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

  async finalizeClassCorrection(
    testId: string,
    classId: string,
    subturmaId?: string | null
  ): Promise<FinalizeClassCorrectionResponse> {
    const response = await api.post<FinalizeClassCorrectionResponse>(
      `/subjective-tests/${testId}/turmas/${classId}/finalizar`,
      undefined,
      { params: subturmaQuery(subturmaId) }
    );
    return response.data;
  },

  /**
   * GET /subjective-tests/:id/dashboard — KPIs e distribuição da correção.
   * Sem class_id agrega todas as turmas do escopo (professor só vê as que leciona).
   * `cityId` envia X-City-ID (rota exige contexto de município).
   */
  async getDashboard(
    testId: string,
    classId?: string | null,
    cityId?: string | null,
    subturmaId?: string | null
  ): Promise<SubjectiveDashboardResponse> {
    const params: Record<string, string> = {};
    if (classId && !isFilterAll(classId)) params.class_id = classId;
    if (subturmaId && !isFilterAll(subturmaId)) params.subturma_id = subturmaId;
    const response = await api.get<SubjectiveDashboardResponse>(`/subjective-tests/${testId}/dashboard`, {
      params: Object.keys(params).length > 0 ? params : undefined,
      ...(cityId && !isFilterAll(cityId) ? { meta: { cityId } } : {}),
    });
    return response.data;
  },

  /**
   * GET /subjective-tests/opcoes-filtros
   * Hierarquia: Estado → Município → Escola → Série → Avaliação → Turma.
   * Sem requires_city_context — o backend faz set_search_path ao escolher município.
   */
  async getFilterOptions(
    params: SubjectiveFilterOptionsParams = {}
  ): Promise<SubjectiveFilterOptionsResponse> {
    const query: Record<string, string> = {};
    if (!isFilterAll(params.estado)) query.estado = String(params.estado).trim();
    if (!isFilterAll(params.municipio)) query.municipio = String(params.municipio).trim();
    if (!isFilterAll(params.escola)) query.escola = String(params.escola).trim();
    if (!isFilterAll(params.serie)) query.serie = String(params.serie).trim();
    if (!isFilterAll(params.avaliacao)) query.avaliacao = String(params.avaliacao).trim();

    const response = await api.get<SubjectiveFilterOptionsResponse>("/subjective-tests/opcoes-filtros", {
      params: query,
    });
    const data = response.data || {};
    return {
      estados: normalizeFilterEntities(data.estados),
      municipios: normalizeFilterEntities(data.municipios),
      escolas: normalizeFilterEntities(data.escolas),
      series: normalizeFilterEntities(data.series),
      avaliacoes: normalizeFilterEvaluations(data.avaliacoes),
      turmas: normalizeFilterEntities(data.turmas),
      escola_pre_selecionada: data.escola_pre_selecionada
        ? String(data.escola_pre_selecionada)
        : data.escola_pre_selecionada === null
          ? null
          : undefined,
      error: data.error,
      status: data.status,
    };
  },
};

export default subjectiveTestApi;
