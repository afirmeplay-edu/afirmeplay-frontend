import { isAxiosError } from "axios";
import { api } from "@/lib/api";
import { questionsImportApiError } from "@/services/questions/questionsImportApi";
import type {
  QuestionImportSubjectParams,
  TestImportDocxErrorBody,
  TestImportDocxSuccess,
} from "@/types/questions-import";

export type TestImportDocxPayload = QuestionImportSubjectParams & {
  file: File;
  grade: string;
  indexes?: number[];
  title: string;
  type: "AVALIACAO" | "SIMULADO";
  model: string;
  course: string;
  created_by: string;
  evaluation_mode?: "virtual";
  description?: string;
  duration?: number;
  max_score?: number;
  time_limit?: string;
  end_time?: string;
  classes?: string[];
  schools?: string[];
  municipalities?: string[];
  /** SIMULADO / multi-disciplina — mesmo shape do POST /test */
  subjects_info?: Array<{ subject: string; weight: number }>;
  available_to_municipality?: boolean;
  available_from?: string | null;
  /** Contexto X-City-ID */
  cityId?: string;
};

export function testImportDocxApiError(error: unknown, fallback: string): string {
  return questionsImportApiError(error, fallback);
}

export function getTestImportDocxFailed(
  error: unknown
): TestImportDocxErrorBody | null {
  if (!isAxiosError(error)) return null;
  const data = error.response?.data;
  if (!data || typeof data !== "object") return null;
  const body = data as TestImportDocxErrorBody;
  if (!body.error && !body.failed) return null;
  return body;
}

export async function importTestFromDocx(
  payload: TestImportDocxPayload
): Promise<TestImportDocxSuccess> {
  const formData = new FormData();
  formData.append("file", payload.file);
  formData.append("grade", payload.grade);
  formData.append("title", payload.title);
  formData.append("type", payload.type);
  formData.append("model", payload.model);
  formData.append("course", payload.course);
  formData.append("created_by", payload.created_by);
  formData.append("evaluation_mode", payload.evaluation_mode || "virtual");

  if ("subjectId" in payload && payload.subjectId) {
    formData.append("subjectId", payload.subjectId);
  }
  if ("subjectIds" in payload && payload.subjectIds) {
    formData.append("subjectIds", payload.subjectIds);
  }

  // Metadado da prova (≠ subjectIds do DOCX): AVALIACAO exige subject ou subjects
  const evaluationSubjectIds =
    "subjectId" in payload && payload.subjectId
      ? [payload.subjectId]
      : "subjectIds" in payload && payload.subjectIds
        ? payload.subjectIds.split(",").map((id) => id.trim()).filter(Boolean)
        : [];

  if (payload.type === "AVALIACAO" && evaluationSubjectIds.length > 0) {
    formData.append("subject", evaluationSubjectIds[0]);
    formData.append("subjects", JSON.stringify(evaluationSubjectIds));
  } else if (evaluationSubjectIds.length > 0) {
    // SIMULADO: espelha POST /test com subjects + subjects_info
    formData.append("subjects", JSON.stringify(evaluationSubjectIds));
  }

  if (payload.indexes && payload.indexes.length > 0) {
    formData.append("indexes", payload.indexes.join(","));
  }

  if (payload.description != null) formData.append("description", payload.description);
  if (payload.duration != null) formData.append("duration", String(payload.duration));
  if (payload.max_score != null) formData.append("max_score", String(payload.max_score));
  if (payload.time_limit) formData.append("time_limit", payload.time_limit);
  if (payload.end_time) formData.append("end_time", payload.end_time);

  if (payload.classes) formData.append("classes", JSON.stringify(payload.classes));
  if (payload.schools) formData.append("schools", JSON.stringify(payload.schools));
  if (payload.municipalities) {
    formData.append("municipalities", JSON.stringify(payload.municipalities));
  }

  if (payload.subjects_info && payload.subjects_info.length > 0) {
    formData.append("subjects_info", JSON.stringify(payload.subjects_info));
  }

  if (payload.available_to_municipality != null) {
    formData.append(
      "available_to_municipality",
      payload.available_to_municipality ? "true" : "false"
    );
  }
  if (payload.available_from !== undefined) {
    formData.append(
      "available_from",
      payload.available_from == null ? "" : payload.available_from
    );
  }

  const { data, status } = await api.post<TestImportDocxSuccess | TestImportDocxErrorBody>(
    "/test/import-docx",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 180_000,
      validateStatus: (s) => (s >= 200 && s < 300) || s === 400,
      ...(payload.cityId ? { meta: { cityId: payload.cityId } } : {}),
    }
  );

  if (!data || typeof data !== "object") {
    throw new Error("Resposta inválida ao criar avaliação a partir do DOCX.");
  }

  if (status === 400 || !("id" in data) || !data.id) {
    const err = data as TestImportDocxErrorBody;
    const error = new Error(
      err.error || "Não foi possível criar a avaliação com o DOCX."
    ) as Error & { importBody?: TestImportDocxErrorBody };
    error.importBody = err;
    throw error;
  }

  return data as TestImportDocxSuccess;
}
