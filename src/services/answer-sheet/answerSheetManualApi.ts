import { api } from '@/lib/api';
import type {
  CartaoCorrectionStatus,
  GabaritoStudentListItem,
  GabaritoStudentsQuery,
  GabaritoStudentsResponse,
  ManualCorrectionResponse,
  ManualEntryResponse,
  ManualAnswerValue,
} from '@/types/answer-sheet';

function normalizeCorrectionStatus(
  raw: unknown,
  hasResult: boolean
): CartaoCorrectionStatus {
  const code = String(raw ?? '').trim().toUpperCase();
  if (code === 'P' || code === 'A') return code;
  return hasResult ? 'P' : 'A';
}

/** Normaliza campos da rota `/gabarito/{id}/students` (inclui resposta flat ou agrupada). */
export function normalizeGabaritoStudent(raw: Record<string, unknown>): GabaritoStudentListItem {
  const hasResult = Boolean(raw.has_result);
  return {
    student_id: String(raw.student_id ?? raw.id ?? ''),
    name: String(raw.name ?? raw.student_name ?? 'Aluno'),
    registration: (raw.registration as string | null | undefined) ?? null,
    has_result: hasResult,
    correction_status: normalizeCorrectionStatus(raw.correction_status, hasResult),
    result_id: (raw.result_id as string | null | undefined) ?? null,
    detection_method: (raw.detection_method as string | null | undefined) ?? null,
    corrected_at: (raw.corrected_at as string | null | undefined) ?? null,
    can_manual_correct: raw.can_manual_correct !== false,
    class_id: raw.class_id as string | undefined,
    class_name: raw.class_name as string | undefined,
    grade_id: raw.grade_id as string | undefined,
    grade_name: raw.grade_name as string | undefined,
    school_id: raw.school_id as string | undefined,
    school_name: raw.school_name as string | undefined,
  };
}

export function normalizeGabaritoStudentsResponse(data: GabaritoStudentsResponse): GabaritoStudentsResponse {
  return {
    ...data,
    classes: data.classes?.map((cls) => ({
      ...cls,
      students: cls.students.map((s) =>
        normalizeGabaritoStudent(s as unknown as Record<string, unknown>)
      ),
    })),
    students: data.students?.map((s) =>
      normalizeGabaritoStudent(s as unknown as Record<string, unknown>)
    ),
  };
}

function extractApiError(error: unknown): string {
  const err = error as { response?: { data?: { error?: string } }; message?: string };
  return err.response?.data?.error || err.message || 'Erro na requisição.';
}

export async function fetchGabaritoStudents(
  gabaritoId: string,
  query?: GabaritoStudentsQuery
): Promise<GabaritoStudentsResponse> {
  const params = new URLSearchParams();
  if (query?.class_id) params.set('class_id', query.class_id);
  if (query?.grade_id) params.set('grade_id', query.grade_id);
  if (query?.school_id) params.set('school_id', query.school_id);
  if (query?.flat) params.set('flat', 'true');
  const qs = params.toString();
  const url = `/answer-sheets/gabarito/${gabaritoId}/students${qs ? `?${qs}` : ''}`;
  const res = await api.get<GabaritoStudentsResponse>(url);
  return normalizeGabaritoStudentsResponse(res.data);
}

export type ManualCorrectionScope = {
  gabaritoId: string;
  testId?: string | null;
};

function manualScopeQueryParams(scope: ManualCorrectionScope, studentId: string): URLSearchParams {
  const params = new URLSearchParams({ student_id: studentId });
  if (scope.testId) params.set('test_id', scope.testId);
  else params.set('gabarito_id', scope.gabaritoId);
  return params;
}

function manualScopeBody(
  scope: ManualCorrectionScope,
  studentId: string,
  answers: Record<string, ManualAnswerValue>
) {
  if (scope.testId) {
    return { test_id: scope.testId, student_id: studentId, answers };
  }
  return { gabarito_id: scope.gabaritoId, student_id: studentId, answers };
}

export async function fetchManualEntry(
  scope: ManualCorrectionScope,
  studentId: string
): Promise<ManualEntryResponse> {
  const params = manualScopeQueryParams(scope, studentId);
  const res = await api.get<ManualEntryResponse>(`/answer-sheets/manual-entry?${params}`);
  return res.data;
}

export async function submitManualCorrection(
  scope: ManualCorrectionScope,
  studentId: string,
  answers: Record<string, ManualAnswerValue>
): Promise<ManualCorrectionResponse> {
  const res = await api.post<ManualCorrectionResponse>(
    '/answer-sheets/manual-correction',
    manualScopeBody(scope, studentId, answers)
  );
  return res.data;
}

export { extractApiError };
