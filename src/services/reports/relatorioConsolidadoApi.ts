import { api } from '@/lib/api';
import type {
  OpcoesFiltrosCartao,
  OpcoesFiltrosDigital,
  RelatorioConsolidado,
} from '@/types/relatorio-consolidado';

export type RelatorioConsolidadoFlow = 'digital' | 'cartao';

export type OpcoesFiltrosParams = {
  estado?: string;
  municipio?: string;
  escola?: string;
  periodo?: string;
};

export type RelatorioConsolidadoParams = {
  municipio: string;
  escola?: string;
  estado?: string;
  itemIds: string[];
};

function withCityMeta(municipio?: string) {
  return municipio && municipio !== 'all'
    ? { meta: { cityId: municipio } as { cityId: string } }
    : {};
}

function basePath(flow: RelatorioConsolidadoFlow): string {
  return flow === 'cartao'
    ? '/answer-sheets/relatorio-consolidado'
    : '/evaluation-results/relatorio-consolidado';
}

function buildQuery(params: OpcoesFiltrosParams): string {
  const q = new URLSearchParams();
  if (params.estado && params.estado !== 'all') q.set('estado', params.estado);
  if (params.municipio && params.municipio !== 'all') q.set('municipio', params.municipio);
  if (params.escola) q.set('escola', params.escola);
  if (params.periodo) q.set('periodo', params.periodo);
  const s = q.toString();
  return s ? `?${s}` : '';
}

function normalizeEntidades(
  items: Array<{ id?: string; nome?: string; name?: string }> | undefined
): Array<{ id: string; nome: string }> {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: String(item.id ?? ''),
      nome: item.nome ?? item.name ?? '',
    }))
    .filter((item) => item.id);
}

export class RelatorioConsolidadoApiService {
  static async getOpcoesFiltros(
    flow: RelatorioConsolidadoFlow,
    params: OpcoesFiltrosParams = {}
  ): Promise<OpcoesFiltrosDigital | OpcoesFiltrosCartao> {
    const escola =
      params.escola !== undefined && params.escola !== ''
        ? params.escola
        : params.municipio && params.municipio !== 'all'
          ? 'all'
          : undefined;

    const queryParams: OpcoesFiltrosParams = { ...params };
    if (escola !== undefined) queryParams.escola = escola;

    const url = `${basePath(flow)}/opcoes-filtros${buildQuery(queryParams)}`;
    const { data } = await api.get(url, withCityMeta(params.municipio));

    return {
      ...data,
      estados: normalizeEntidades(data?.estados),
      municipios: normalizeEntidades(data?.municipios),
      escolas: normalizeEntidades(data?.escolas),
    };
  }

  static async getRelatorio(
    flow: RelatorioConsolidadoFlow,
    params: RelatorioConsolidadoParams
  ): Promise<RelatorioConsolidado> {
    const ids = params.itemIds.filter(Boolean);
    if (!params.municipio || params.municipio === 'all') {
      throw new Error('Parâmetro município é obrigatório');
    }
    if (ids.length === 0) {
      throw new Error(
        flow === 'cartao'
          ? 'Selecione ao menos um cartão resposta.'
          : 'Selecione ao menos uma avaliação.'
      );
    }

    const q = new URLSearchParams();
    q.set('municipio', params.municipio);
    q.set('escola', params.escola && params.escola !== 'all' ? params.escola : 'all');
    if (params.estado && params.estado !== 'all') q.set('estado', params.estado);
    q.set(flow === 'cartao' ? 'gabarito_ids' : 'avaliacao_ids', ids.join(','));

    const url = `${basePath(flow)}?${q.toString()}`;
    const { data } = await api.get<RelatorioConsolidado>(url, withCityMeta(params.municipio));
    return data;
  }
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const maybe = error as {
    message?: string;
    response?: { data?: { error?: string; details?: string } };
  };
  return (
    maybe?.response?.data?.error ||
    maybe?.response?.data?.details ||
    maybe?.message ||
    fallback
  );
}
