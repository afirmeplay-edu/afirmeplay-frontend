import { api } from '@/lib/api';
import type { ComparisonResponse, StudentComparisonResponse } from '@/services/evaluation/evaluationComparisonApi';

/** Parâmetros para GET /answer-sheets/evolucao/opcoes-filtros */
export interface AnswerSheetEvolucaoOpcoesFiltrosParams {
  estado?: string;
  municipio?: string;
  escola?: string;
  serie?: string;
}

/** Resposta de GET /answer-sheets/evolucao/opcoes-filtros (mesmo shape do online) */
export interface AnswerSheetEvolucaoOpcoesFiltrosResponse {
  estados?: Array<{ id: string; nome?: string; name?: string }>;
  municipios?: Array<{ id: string; nome?: string; name?: string }>;
  escolas?: Array<{ id: string; nome?: string; name?: string }>;
  series?: Array<{ id: string; nome?: string; name?: string }>;
  turmas?: Array<{ id: string; nome?: string; name?: string; shift?: string }>;
}

export interface AnswerSheetEvolucaoGabaritosFilters {
  estado: string;
  municipio: string;
  escola?: string;
  serie?: string;
  turma?: string;
  nome?: string;
  data_inicio?: string;
  data_fim?: string;
}

export interface AnswerSheetEvolucaoGabaritosResponse {
  source_type?: 'cartao_resposta';
  gabaritos?: Array<{
    id: string;
    titulo: string;
    data?: string | null;
  }>;
  total?: number;
}

export interface AnswerSheetEvolutionExportPayload {
  gabarito_ids: string[];
  municipality?: string;
  state?: string;
  department?: string;
}

export class AnswerSheetComparisonApiService {
  /**
   * Opções geo para Evolução cartão-resposta.
   * GET /answer-sheets/evolucao/opcoes-filtros
   */
  static async getEvolucaoOpcoesFiltros(
    params: AnswerSheetEvolucaoOpcoesFiltrosParams = {}
  ): Promise<AnswerSheetEvolucaoOpcoesFiltrosResponse> {
    const search = new URLSearchParams();
    if (params.estado) search.set('estado', params.estado);
    if (params.municipio) search.set('municipio', params.municipio);
    if (params.escola) search.set('escola', params.escola);
    if (params.serie) search.set('serie', params.serie);
    const query = search.toString();
    const url = `/answer-sheets/evolucao/opcoes-filtros${query ? `?${query}` : ''}`;
    const requestConfig = params.municipio ? { meta: { cityId: params.municipio } } : {};
    const response = await api.get<AnswerSheetEvolucaoOpcoesFiltrosResponse>(url, requestConfig);
    return response.data ?? {};
  }

  /**
   * Lista gabaritos comparáveis para Evolução.
   * GET /answer-sheets/evolucao/gabaritos
   */
  static async getEvolucaoGabaritos(
    filters: AnswerSheetEvolucaoGabaritosFilters
  ): Promise<AnswerSheetEvolucaoGabaritosResponse> {
    const params = new URLSearchParams({
      estado: filters.estado,
      municipio: filters.municipio,
    });
    if (filters.escola && filters.escola !== 'all') params.set('escola', filters.escola);
    if (filters.serie && filters.serie !== 'all') params.set('serie', filters.serie);
    if (filters.turma && filters.turma !== 'all') params.set('turma', filters.turma);
    if (filters.nome?.trim()) params.set('nome', filters.nome.trim());
    if (filters.data_inicio) params.set('data_inicio', filters.data_inicio);
    if (filters.data_fim) params.set('data_fim', filters.data_fim);

    const requestConfig = { meta: { cityId: filters.municipio } };
    const response = await api.get<AnswerSheetEvolucaoGabaritosResponse>(
      `/answer-sheets/evolucao/gabaritos?${params.toString()}`,
      requestConfig
    );
    return response.data ?? { gabaritos: [], total: 0 };
  }

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
