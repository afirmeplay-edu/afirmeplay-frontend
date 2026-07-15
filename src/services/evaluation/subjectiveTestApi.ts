import { api } from "@/lib/api";
import type { Interaction } from "@/lib/question-interactions";

/** Rubrica de correção manual da avaliação subjetiva. */
export type SubjectiveRubricValue = "SIM" | "PARCIAL" | "NAO" | "BRANCO";

export interface SubjectiveCorrectionTestInfo {
  id: string;
  title: string;
  evaluation_mode: "subjective";
}

export interface SubjectiveCorrectionClassInfo {
  id: string;
  name: string;
}

export interface SubjectiveCorrectionQuestion {
  id: string;
  number: number;
  text: string;
  question_type: string;
  /** Array com o(s) UUID(s) da tabela `skills` vinculados à questão. */
  skills: string[] | null;
  interaction_config: Interaction | null;
}

export interface SubjectiveCorrectionStudent {
  id: string;
  name: string;
  registration: string;
  /** Por padrão (sem lançamento), o aluno é considerado presente. */
  present: boolean;
  /** Mapa question_id -> rubrica lançada. */
  results: Record<string, SubjectiveRubricValue>;
}

/** Resposta de `GET /subjective-tests/:testId/turmas/:classId/correcao`. */
export interface SubjectiveCorrectionMatrixResponse {
  test: SubjectiveCorrectionTestInfo;
  class: SubjectiveCorrectionClassInfo;
  questions: SubjectiveCorrectionQuestion[];
  students: SubjectiveCorrectionStudent[];
}

export interface SetCorrectionCellPayload {
  question_id: string;
  student_id: string;
  /** Enviar null, ou repetir o mesmo valor já lançado, remove o lançamento (toggle). */
  value: SubjectiveRubricValue | null;
}

export interface SubjectiveCorrectionResult {
  id: string;
  test_id: string;
  question_id: string;
  student_id: string;
  value: SubjectiveRubricValue;
  corrected_by: string;
  corrected_at: string;
}

/** Resposta de `POST /subjective-tests/:testId/correcao`. */
export type SetCorrectionCellResponse =
  | { removed: false; result: SubjectiveCorrectionResult }
  | { removed: true };

export interface SetPresencePayload {
  student_id: string;
  present: boolean;
}

/** Registro de presença retornado por `POST /subjective-tests/:testId/presenca`. */
export interface PresenceRecord {
  student_id: string;
  test_id: string;
  present: boolean;
  [key: string]: unknown;
}

export interface FinalizeProcessedStudent {
  skipped: boolean;
  student_id: string;
  test_id: string;
  correct_answers: number;
  total_questions: number;
  score_percentage: number;
  grade: number;
  proficiency: string;
  classification: string;
}

/** Resposta de `POST /subjective-tests/:testId/turmas/:classId/finalizar`. */
export interface FinalizeClassCorrectionResponse {
  processed_count: number;
  skipped_count: number;
  error_count: number;
  processed: FinalizeProcessedStudent[];
  skipped_student_ids: string[];
  error_student_ids: string[];
}

/**
 * Cliente para as rotas de correção manual da avaliação subjetiva (blueprint `/subjective-tests`).
 * Exige JWT com papel admin, professor, coordenador, diretor ou tecadm — professor só acessa
 * turmas em que leciona (403 caso contrário).
 */
export const subjectiveTestApi = {
  /** GET /subjective-tests/:testId/turmas/:classId/correcao — monta a matriz aluno × questão. */
  async getCorrectionMatrix(testId: string, classId: string): Promise<SubjectiveCorrectionMatrixResponse> {
    const response = await api.get<SubjectiveCorrectionMatrixResponse>(
      `/subjective-tests/${testId}/turmas/${classId}/correcao`
    );
    return response.data;
  },

  /** POST /subjective-tests/:testId/correcao — lança/atualiza a rubrica de uma célula (toggle). */
  async setCorrectionCell(testId: string, payload: SetCorrectionCellPayload): Promise<SetCorrectionCellResponse> {
    const response = await api.post<SetCorrectionCellResponse>(`/subjective-tests/${testId}/correcao`, payload);
    return response.data;
  },

  /** POST /subjective-tests/:testId/presenca — lança a presença do aluno (padrão: presente). */
  async setPresence(testId: string, payload: SetPresencePayload): Promise<PresenceRecord> {
    const response = await api.post<PresenceRecord>(`/subjective-tests/${testId}/presenca`, payload);
    return response.data;
  },

  /**
   * POST /subjective-tests/:testId/turmas/:classId/finalizar — calcula nota/proficiência da turma.
   * Idempotente: pode ser chamada de novo após novos lançamentos para recalcular.
   */
  async finalizeClassCorrection(testId: string, classId: string): Promise<FinalizeClassCorrectionResponse> {
    const response = await api.post<FinalizeClassCorrectionResponse>(
      `/subjective-tests/${testId}/turmas/${classId}/finalizar`
    );
    return response.data;
  },
};

export default subjectiveTestApi;
