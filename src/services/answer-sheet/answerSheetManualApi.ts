import { api } from '@/lib/api';
import type {
  GabaritoStudentsQuery,
  GabaritoStudentsResponse,
  ManualCorrectionResponse,
  ManualEntryResponse,
  ManualAnswerValue,
} from '@/types/answer-sheet';

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
  return res.data;
}

export async function fetchManualEntry(
  gabaritoId: string,
  studentId: string
): Promise<ManualEntryResponse> {
  const params = new URLSearchParams({
    gabarito_id: gabaritoId,
    student_id: studentId,
  });
  const res = await api.get<ManualEntryResponse>(`/answer-sheets/manual-entry?${params}`);
  return res.data;
}

export async function submitManualCorrection(
  gabaritoId: string,
  studentId: string,
  answers: Record<string, ManualAnswerValue>
): Promise<ManualCorrectionResponse> {
  const res = await api.post<ManualCorrectionResponse>('/answer-sheets/manual-correction', {
    gabarito_id: gabaritoId,
    student_id: studentId,
    answers,
  });
  return res.data;
}

export { extractApiError };
