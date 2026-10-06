import { api } from '@/lib/api';
import type {
  LogisticsFilterParams,
  LogisticsOpcoesFiltros,
  LogisticsPreview,
  LogisticsSchedule,
  LogisticsScheduleList,
  LogisticsSchedulePayload,
  LogisticsScheduleStatus,
} from '@/types/logistics';

function withCityMeta(cityId?: string) {
  return cityId ? { meta: { cityId } as { cityId: string } } : {};
}

function buildQuery(params: LogisticsFilterParams): string {
  const q = new URLSearchParams();
  if (params.etapa) q.set('etapa', params.etapa);
  if (params.avaliacao) q.set('avaliacao', params.avaliacao);
  if (params.escolas?.length) q.set('escolas', params.escolas.join(','));
  if (params.series?.length) q.set('series', params.series.join(','));
  if (params.turmas?.length) q.set('turmas', params.turmas.join(','));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function getLogisticsApiErrorMessage(error: unknown, fallback: string): string {
  const maybe = error as {
    message?: string;
    response?: { data?: { error?: string; erro?: string; mensagem?: string; message?: string } };
  };
  return (
    maybe?.response?.data?.error ||
    maybe?.response?.data?.erro ||
    maybe?.response?.data?.mensagem ||
    maybe?.response?.data?.message ||
    maybe?.message ||
    fallback
  );
}

export class LogisticsApiService {
  static async getOpcoesFiltros(
    params: LogisticsFilterParams,
    cityId?: string
  ): Promise<LogisticsOpcoesFiltros> {
    const { data } = await api.get<LogisticsOpcoesFiltros>(
      `/logistics/opcoes-filtros${buildQuery(params)}`,
      withCityMeta(cityId)
    );
    return {
      etapas: data?.etapas ?? [],
      avaliacoes: data?.avaliacoes ?? [],
      escolas: data?.escolas,
      series: data?.series,
      turmas: data?.turmas,
    };
  }

  static async getPrevia(params: LogisticsFilterParams, cityId?: string): Promise<LogisticsPreview> {
    const { data } = await api.get<LogisticsPreview>(
      `/logistics/previa${buildQuery(params)}`,
      withCityMeta(cityId)
    );
    return data;
  }

  static async listSchedules(
    filters: { test_id?: string; status?: LogisticsScheduleStatus } = {},
    cityId?: string
  ): Promise<LogisticsScheduleList> {
    const q = new URLSearchParams();
    if (filters.test_id) q.set('test_id', filters.test_id);
    if (filters.status) q.set('status', filters.status);
    const qs = q.toString();
    const { data } = await api.get<LogisticsScheduleList>(
      `/logistics/schedules${qs ? `?${qs}` : ''}`,
      withCityMeta(cityId)
    );
    return { schedules: data?.schedules ?? [], can_manage: Boolean(data?.can_manage) };
  }

  static async getSchedule(id: string, cityId?: string): Promise<LogisticsSchedule> {
    const { data } = await api.get<LogisticsSchedule>(`/logistics/schedules/${id}`, withCityMeta(cityId));
    return data;
  }

  static async createSchedule(payload: LogisticsSchedulePayload, cityId?: string): Promise<LogisticsSchedule> {
    const { data } = await api.post<LogisticsSchedule>('/logistics/schedules', payload, withCityMeta(cityId));
    return data;
  }

  static async updateSchedule(
    id: string,
    payload: LogisticsSchedulePayload,
    cityId?: string
  ): Promise<LogisticsSchedule> {
    const { data } = await api.put<LogisticsSchedule>(`/logistics/schedules/${id}`, payload, withCityMeta(cityId));
    return data;
  }

  static async deleteSchedule(id: string, cityId?: string): Promise<void> {
    await api.delete(`/logistics/schedules/${id}`, withCityMeta(cityId));
  }

  static async publishSchedule(id: string, cityId?: string): Promise<LogisticsSchedule> {
    const { data } = await api.post<LogisticsSchedule>(
      `/logistics/schedules/${id}/publish`,
      {},
      withCityMeta(cityId)
    );
    return data;
  }

  static async cancelSchedule(id: string, cityId?: string): Promise<LogisticsSchedule> {
    const { data } = await api.post<LogisticsSchedule>(
      `/logistics/schedules/${id}/cancel`,
      {},
      withCityMeta(cityId)
    );
    return data;
  }
}
