import { api } from "@/lib/api";

export type DetectedAnswerStatus = "ok" | "blank" | "multiple" | "low_confidence";

export interface DetectedAnswer {
  question_number: number;
  answer: string | null;
  status: DetectedAnswerStatus;
  confidence: number;
  confidence_label?: string;
  alternatives: string[];
  subject_name?: string | null;
  block_id?: number | string;
  reason?: string | null;
  suggested_answer?: string | null;
  /** Posição das bolhas (frações 0–1 da imagem de overlay) */
  bubbles?: DetectedBubble[];
}

export interface DetectedBubble {
  letter: string;
  x: number;
  y: number;
  /** raio como fração da largura */
  r: number;
  score: number;
  marked: boolean;
}

/** Tipo do instrumento: prova online, prova física ou cartão-resposta avulso. */
export type PhotoScanKind = "virtual" | "physical" | "cartao";

export interface PhotoScanTest {
  id: string;
  title: string;
  kind: PhotoScanKind;
  evaluation_mode?: string | null;
  created_at?: string | null;
  students_total: number | null;
}

export interface PhotoScanClass {
  id: string;
  name: string;
  school_id?: string;
  school_name?: string | null;
  grade_name?: string | null;
}

export interface PhotoScanStudent {
  id: string;
  name: string;
  registration?: string | null;
  class_id?: string | null;
  status: "pendente" | "corrigido";
  score_percentage?: number | null;
  corrected_at?: string | null;
}

export interface PhotoScanStudentsResponse {
  test?: { id: string; title: string };
  classes: PhotoScanClass[];
  students: PhotoScanStudent[];
  summary: { total: number; corrected: number; pending: number };
}

export interface QuestionMeta {
  order: number;
  question_id: string;
  alternatives: string[];
  correct_answer?: string | null;
  subject_id?: string | null;
  subject_name?: string | null;
}

export interface DetectAnswersResponse {
  success: boolean;
  test_id: string;
  test_title?: string | null;
  student_id: string;
  student_name?: string | null;
  answers: DetectedAnswer[];
  summary: {
    total: number;
    ok: number;
    blank: number;
    multiple: number;
    low_confidence: number;
  };
  blocks_detected?: number;
  blocks_expected?: number;
  questions: QuestionMeta[];
  existing_answers: Record<string, string | null>;
  has_existing_answers: boolean;
  topology_source?: string;
  method?: string;
  /** Imagem normalizada (data URL) usada na leitura, para sobrepor as bolhas */
  overlay_image?: string | null;
}

export interface SaveAnswersResponse {
  success: boolean;
  message: string;
  test_id: string;
  student_id: string;
  student_name?: string | null;
  overwritten?: boolean;
  answers_count?: number;
  session_id?: string;
  evaluation_result_id?: string | null;
  score_percentage?: number | null;
  grade?: number | null;
}

export interface ScanAnswersApiError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
  has_existing_answers?: boolean;
}

function fileToBase64DataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    reader.readAsDataURL(file);
  });
}

/** Cartão-resposta usa rotas por gabarito; prova (online/física) usa rotas por test. */
function instrumentBase(kind: PhotoScanKind, id: string): string {
  return kind === "cartao"
    ? `/physical-tests/gabarito/${id}`
    : `/physical-tests/test/${id}`;
}

export class ScanAnswersApiService {
  static async listTests(search?: string): Promise<PhotoScanTest[]> {
    const { data } = await api.get<{ tests: PhotoScanTest[] }>(
      "/physical-tests/photo-scan/tests",
      { params: search ? { search } : undefined }
    );
    return (data.tests || []).map((t) => ({ ...t, kind: t.kind || "virtual" }));
  }

  static async listStudents(
    testId: string,
    kind: PhotoScanKind = "virtual"
  ): Promise<PhotoScanStudentsResponse> {
    const url =
      kind === "cartao"
        ? `/physical-tests/photo-scan/gabaritos/${testId}/students`
        : `/physical-tests/photo-scan/tests/${testId}/students`;
    const { data } = await api.get<PhotoScanStudentsResponse>(url);
    return data;
  }

  static async detectAnswers(
    testId: string,
    studentId: string,
    image: File | string,
    kind: PhotoScanKind = "virtual"
  ): Promise<DetectAnswersResponse> {
    const imagePayload =
      typeof image === "string" ? image : await fileToBase64DataUrl(image);

    const { data } = await api.post<DetectAnswersResponse>(
      `${instrumentBase(kind, testId)}/student/${studentId}/detect-answers`,
      { image: imagePayload }
    );
    return data;
  }

  static async saveAnswers(
    testId: string,
    studentId: string,
    answers: Record<string, string | null>,
    overwrite = false,
    kind: PhotoScanKind = "virtual"
  ): Promise<SaveAnswersResponse> {
    const { data } = await api.post<SaveAnswersResponse>(
      `${instrumentBase(kind, testId)}/student/${studentId}/save-answers`,
      { answers, overwrite }
    );
    return data;
  }
}
