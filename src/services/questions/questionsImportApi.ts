import { isAxiosError } from "axios";
import { api } from "@/lib/api";
import { fetchAuthenticatedDownload } from "@/lib/fetch-authenticated-download";
import type {
  QuestionImportParams,
  QuestionImportResponse,
} from "@/types/questions-import";

function messageFromUnknownBody(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const parsed = data as { error?: string; message?: string; detail?: string };
    return parsed.error || parsed.message || parsed.detail || fallback;
  }
  if (typeof data === "string" && data.trim()) return data;
  return fallback;
}

export function questionsImportApiError(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    return messageFromUnknownBody(error.response?.data, fallback);
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function downloadQuestionsImportTemplate(
  params: QuestionImportParams
): Promise<void> {
  await fetchAuthenticatedDownload(
    "/questions/import/template",
    "template_importacao_questoes.docx",
    {
      params: {
        subjectId: params.subjectId,
        grade: params.grade,
      },
    }
  );
}

export type ImportQuestionsDocxOptions = QuestionImportParams & {
  file: File;
  commit: boolean;
  /** Índices do preview a importar. Só relevante com commit=true. */
  indexes?: number[];
};

export async function importQuestionsDocx(
  options: ImportQuestionsDocxOptions
): Promise<QuestionImportResponse> {
  const formData = new FormData();
  formData.append("file", options.file);
  formData.append("subjectId", options.subjectId);
  formData.append("grade", options.grade);
  formData.append("commit", options.commit ? "true" : "false");

  if (options.commit && options.indexes && options.indexes.length > 0) {
    formData.append("indexes", options.indexes.join(","));
  }

  const { data } = await api.post<QuestionImportResponse>(
    "/questions/import/docx",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      // Commit com imagens pode demorar
      timeout: options.commit ? 120_000 : 60_000,
      // 400 no commit = nenhuma criada (ainda traz summary/questions)
      validateStatus: (s) => (s >= 200 && s < 300) || s === 400,
    }
  );

  if (!data || typeof data !== "object") {
    throw new Error("Resposta inválida do servidor ao importar questões.");
  }

  if (!("mode" in data) || (data.mode !== "preview" && data.mode !== "commit")) {
    throw new Error(
      messageFromUnknownBody(data, "Não foi possível importar as questões.")
    );
  }

  return data;
}
