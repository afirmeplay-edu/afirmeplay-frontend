import { api } from '@/lib/api';
import type { ComparisonResponse, StudentComparisonResponse } from '@/services/evaluation/evaluationComparisonApi';

export interface AnswerSheetEvolutionExportPayload {
  gabarito_ids: string[];
  municipality?: string;
  state?: string;
  department?: string;
}

export class AnswerSheetComparisonApiService {
  static async compareAnswerSheets(
    gabaritoIds: string[],
    cityId?: string
  ): Promise<ComparisonResponse> {
    if (gabaritoIds.length < 2) {
      throw new Error('Mínimo de 2 gabaritos necessário para comparação');
    }

    const requestConfig = cityId ? { meta: { cityId } } : {};
    const response = await api.post<ComparisonResponse>(
      '/answer-sheets/compare',
      { gabarito_ids: gabaritoIds },
      requestConfig
    );
    return response.data;
  }

  static async exportEvolutionExcel(
    payload: AnswerSheetEvolutionExportPayload,
    cityId?: string
  ): Promise<{ data: Blob; headers: Record<string, string> }> {
    const requestConfig = {
      responseType: 'blob' as const,
      ...(cityId ? { meta: { cityId } } : {}),
    };
    const response = await api.post('/answer-sheets/evolution/export-excel', payload, requestConfig);
    return { data: response.data, headers: response.headers as Record<string, string> };
  }

  static async compareStudentAnswerSheets(
    studentId: string,
    gabaritoIds: string[],
    cityId?: string
  ): Promise<StudentComparisonResponse> {
    if (gabaritoIds.length < 2) {
      throw new Error('Mínimo de 2 gabaritos necessário para comparação');
    }

    const requestConfig = cityId ? { meta: { cityId } } : {};
    const response = await api.post<StudentComparisonResponse>(
      `/answer-sheets/student/${studentId}/compare`,
      { gabarito_ids: gabaritoIds },
      requestConfig
    );
    return response.data;
  }

  static async compareLoggedStudentAnswerSheets(
    studentId: string,
    gabaritoIds: string[],
    cityId?: string
  ): Promise<StudentComparisonResponse> {
    if (gabaritoIds.length < 2) {
      throw new Error('Mínimo de 2 gabaritos necessário para comparação');
    }

    const requestConfig = cityId ? { meta: { cityId } } : {};
    const response = await api.post<StudentComparisonResponse>(
      '/answer-sheets/student/compare',
      { student_id: studentId, gabarito_ids: gabaritoIds },
      requestConfig
    );
    return response.data;
  }
}
