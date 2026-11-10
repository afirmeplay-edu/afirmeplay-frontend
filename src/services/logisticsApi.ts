import { api } from '@/lib/api';
import type {
  LogisticsApplicatorOption,
  LogisticsFilterParams,
  LogisticsGabaritoOption,
  LogisticsGradeOptions,
  LogisticsGradePage,
  LogisticsGradeQuery,
  LogisticsOpcoesFiltros,
  LogisticsPreview,
  LogisticsSchedule,
  LogisticsScheduleList,
  LogisticsSchedulePayload,
  LogisticsScheduleStatus,
} from '@/types/logistics';
import { toUserFacingErrorMessage } from '@/utils/userFacingError';

function withCityMeta(cityId?: string) {
  return cityId ? { meta: { cityId } as { cityId: string } } : {};
}

function buildQuery(params: LogisticsFilterParams): string {
  const q = new URLSearchParams();
  if (params.source) q.set('source', params.source);
  if (params.avaliacao) q.set('avaliacao', params.avaliacao);
  if (params.escolas?.length) q.set('escolas', params.escolas.join(','));
  if (params.series?.length) q.set('series', params.series.join(','));
  if (params.turmas?.length) q.set('turmas', params.turmas.join(','));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function getLogisticsApiErrorMessage(error: unknown, fallback: string): string {
  return toUserFacingErrorMessage(error, fallback);
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

  static async getOpcoesGrade(cityId?: string): Promise<LogisticsGradeOptions> {
    const { data } = await api.get<LogisticsGradeOptions>('/logistics/opcoes-grade', withCityMeta(cityId));
    return {
      anos: data?.anos ?? [],
      etapas: data?.etapas ?? [],
      avaliacoes: (data?.avaliacoes ?? []).map((item) => ({
        id: item.id,
        titulo: item.titulo,
        evaluation_mode: item.evaluation_mode,
        etapa_ids: item.etapa_ids,
        source: item.source,
        source_badge: item.source_badge ?? null,
      })),
      escolas: (data?.escolas ?? []).map((escola) => ({
        id: escola.id,
        nome: escola.nome,
        avaliacao_ids: escola.avaliacao_ids ?? [],
      })),
      series: (data?.series ?? []).map((serie) => ({
        id: serie.id,
        nome: serie.nome,
        etapa_id: serie.etapa_id ?? null,
        avaliacao_ids: serie.avaliacao_ids ?? [],
        escola_ids: serie.escola_ids ?? [],
      })),
      turmas: (data?.turmas ?? []).map((turma) => ({
        id: turma.id,
        nome: turma.nome,
        avaliacao_ids: turma.avaliacao_ids ?? [],
        escola_ids: turma.escola_ids ?? [],
        serie_ids: turma.serie_ids ?? [],
      })),
      turnos: data?.turnos ?? [],
      formatos: data?.formatos ?? [],
      aplicadores: data?.aplicadores ?? [],
      status: data?.status ?? [],
      can_manage: Boolean(data?.can_manage),
    };
  }

  static async listAplicadores(cityId?: string): Promise<LogisticsApplicatorOption[]> {
    const { data } = await api.get<{ aplicadores?: LogisticsApplicatorOption[] }>(
      '/logistics/aplicadores',
      withCityMeta(cityId)
    );
    return data?.aplicadores ?? [];
  }

  static async listItens(params: LogisticsGradeQuery, cityId?: string): Promise<LogisticsGradePage> {
    const q = new URLSearchParams();
    if (params.ano) q.set('ano', String(params.ano));
    if (params.etapa) q.set('etapa', params.etapa);
    if (params.avaliacao) q.set('avaliacao', params.avaliacao);
    if (params.escola) q.set('escola', params.escola);
    if (params.serie) q.set('serie', params.serie);
    if (params.turma) q.set('turma', params.turma);
    if (params.turno) q.set('turno', params.turno);
    if (params.formato) q.set('formato', params.formato);
    if (params.data_inicio) q.set('data_inicio', params.data_inicio);
    if (params.data_fim) q.set('data_fim', params.data_fim);
    if (params.status) q.set('status', params.status);
    if (params.aplicador) q.set('aplicador', params.aplicador);
    if (params.q) q.set('q', params.q);
    if (params.export) q.set('export', '1');
    if (params.page) q.set('page', String(params.page));
    if (params.per_page) q.set('per_page', String(params.per_page));
    const qs = q.toString();
    const { data } = await api.get<LogisticsGradePage>(
      `/logistics/itens${qs ? `?${qs}` : ''}`,
      withCityMeta(cityId)
    );
    const emptyCards = {
      total_agendamentos: 0,
      total_alunos_previstos: 0,
      escolas_atendidas: 0,
      turmas_agendadas: 0,
    };
    return {
      items: data?.items ?? [],
      total: data?.total ?? 0,
      page: data?.page ?? params.page ?? 1,
      per_page: data?.per_page ?? params.per_page ?? 20,
      cards: data?.cards ?? emptyCards,
      can_manage: Boolean(data?.can_manage),
      truncated: Boolean(data?.truncated),
      export_limit: data?.export_limit ?? null,
    };
  }

  static async getPrevia(params: LogisticsFilterParams, cityId?: string): Promise<LogisticsPreview> {
    const { data } = await api.get<LogisticsPreview>(
      `/logistics/previa${buildQuery(params)}`,
      withCityMeta(cityId)
    );
    return data;
  }

  static async listGabaritos(cityId?: string): Promise<LogisticsGabaritoOption[]> {
    const { data } = await api.get<{ gabaritos?: LogisticsGabaritoOption[] }>(
      '/logistics/gabaritos',
      withCityMeta(cityId)
    );
    return data?.gabaritos ?? [];
  }

  static async getPreviaCartao(
    params: { gabarito: string; escolas?: string[]; series?: string[]; turmas?: string[] },
    cityId?: string
  ): Promise<LogisticsPreview> {
    const q = new URLSearchParams();
    q.set('gabarito', params.gabarito);
    if (params.escolas?.length) q.set('escolas', params.escolas.join(','));
    if (params.series?.length) q.set('series', params.series.join(','));
    if (params.turmas?.length) q.set('turmas', params.turmas.join(','));
    const { data } = await api.get<LogisticsPreview>(
      `/logistics/previa-cartao?${q.toString()}`,
      withCityMeta(cityId)
    );
    return data;
  }

  static async getPreviaPersonalizada(
    params: {
      evaluation_mode: 'virtual' | 'physical';
      escolas?: string[];
      series?: string[];
      turmas?: string[];
    },
    cityId?: string
  ): Promise<LogisticsPreview> {
    const q = new URLSearchParams();
    q.set('evaluation_mode', params.evaluation_mode);
    if (params.escolas?.length) q.set('escolas', params.escolas.join(','));
    if (params.series?.length) q.set('series', params.series.join(','));
    if (params.turmas?.length) q.set('turmas', params.turmas.join(','));
    const { data } = await api.get<LogisticsPreview>(
      `/logistics/previa-personalizada?${q.toString()}`,
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
