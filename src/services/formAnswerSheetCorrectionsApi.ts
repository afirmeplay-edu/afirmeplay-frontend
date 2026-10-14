import { isAxiosError } from 'axios';
import { api } from '@/lib/api';
import type { Question } from '@/types/forms';

export interface FormAnswerSheetStudentCorrection {
  studentPrefix: string;
  studentId: string | null;
  studentName: string | null;
  userId: string | null;
  saved: boolean;
  reason: string | null;
  responseId: string | null;
  answers: Record<string, string>;
  blank: string[];
  invalid: string[];
  conflicts: string[];
  pages: number[];
  missingPages: number[];
  files: number[];
}

export interface FormAnswerSheetPageIssue {
  fileIndex: number;
  pageIndex?: number;
  filename?: string;
  reason: string;
  qr?: { student_id?: string; form_id?: string; page?: number; page_count?: number };
}

export interface FormAnswerSheetCorrectionResult {
  formId: string;
  pageCount: number;
  fileCount: number;
  students: FormAnswerSheetStudentCorrection[];
  skipped: FormAnswerSheetPageIssue[];
  errors: FormAnswerSheetPageIssue[];
}

export const CORNER_SQUARES_SKIP_REASON = 'sem quadrados de canto';

export class FormAnswerSheetCorrectionError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'FormAnswerSheetCorrectionError';
  }
}

export async function correctFormAnswerSheets(
  formId: string,
  files: File[],
): Promise<FormAnswerSheetCorrectionResult> {
  const body = new FormData();
  files.forEach((file) => body.append('files', file));
  try {
    const { data } = await api.post<FormAnswerSheetCorrectionResult>(
      `/forms/${formId}/answer-sheet-corrections`,
      body,
      { timeout: 0, headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return {
      ...data,
      students: data.students ?? [],
      skipped: data.skipped ?? [],
      errors: data.errors ?? [],
    };
  } catch (err) {
    if (isAxiosError(err)) {
      const status = err.response?.status;
      const payload = err.response?.data as { error?: string; message?: string } | undefined;
      const fallback =
        status === 401
          ? 'Sua sessão expirou. Entre novamente para corrigir os cartões.'
          : 'Não foi possível corrigir os cartões.';
      throw new FormAnswerSheetCorrectionError(payload?.error || payload?.message || fallback, status);
    }
    throw new FormAnswerSheetCorrectionError(
      err instanceof Error ? err.message : 'Não foi possível corrigir os cartões.',
    );
  }
}

/** Mapeia id de pergunta e de item de matriz para um rótulo legível. */
export function buildQuestionLabelMap(questions: Question[] | undefined): Map<string, string> {
  const labels = new Map<string, string>();
  (questions ?? []).forEach((question, index) => {
    const text = question.text || question.texto || question.id;
    const number = `${index + 1}.`;
    labels.set(question.id, `${number} ${text}`);
    const subs = question.subQuestions ?? question.subPerguntas ?? [];
    subs.forEach((sub) => {
      labels.set(sub.id, `${number} ${text} — ${sub.text || sub.texto || sub.id}`);
    });
  });
  return labels;
}