import { api } from '@/lib/api';
import { getStoredReferenceCityId } from '@/lib/planReferenceStorage';
import { getUserHierarchyContext } from '@/utils/userHierarchy';

/** Mesma chave de `AnswerSheetResults` (sessionStorage). */
export const ANSWER_SHEET_RESULTS_FILTERS_KEY = 'answer_sheet_results_filters';

export type AnswerSheetDetailQueryContext = {
  estado: string;
  municipio: string;
  escola?: string;
  serie?: string;
  turma?: string;
  periodo?: string;
};

type StoredResultsFilters = {
  estado: string;
  municipio: string;
  periodo: string;
  gabarito: string;
  escola: string;
  serie: string;
  turma: string;
};

function normalizeOpcoesFiltros(raw: unknown): Array<{ id: string; name: string }> {
  if (!raw) return [];
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object') {
    return (raw as { id?: string; uuid?: string; nome?: string; name?: string }[]).map((item) => ({
      id: item.id || item.uuid || String(item),
      name: (item.nome ?? item.name ?? String(item)) as string,
    }));
  }
  if (Array.isArray(raw)) {
    return (raw as (string | { id: string; name: string })[]).map((item, idx) =>
      typeof item === 'string'
        ? { id: item, name: item }
        : { id: item.id || String(idx), name: item.name || item.id }
    );
  }
  return [];
}

export function loadAnswerSheetResultsFiltersFromStorage(): StoredResultsFilters | null {
  try {
    let stored = sessionStorage.getItem(ANSWER_SHEET_RESULTS_FILTERS_KEY);
    if (!stored) {
      const legacy = localStorage.getItem(ANSWER_SHEET_RESULTS_FILTERS_KEY);
      if (legacy) {
        sessionStorage.setItem(ANSWER_SHEET_RESULTS_FILTERS_KEY, legacy);
        localStorage.removeItem(ANSWER_SHEET_RESULTS_FILTERS_KEY);
        stored = legacy;
      }
    }
    if (!stored) return null;
    const f = JSON.parse(stored) as Record<string, unknown>;
    if (
      typeof f.estado === 'string' &&
      typeof f.municipio === 'string' &&
      typeof f.gabarito === 'string' &&
      typeof f.escola === 'string' &&
      typeof f.serie === 'string' &&
      typeof f.turma === 'string'
    ) {
      return {
        estado: f.estado || 'all',
        municipio: f.municipio || 'all',
        periodo: typeof f.periodo === 'string' ? f.periodo : '',
        gabarito: f.gabarito || 'all',
        escola: f.escola || 'all',
        serie: f.serie || 'all',
        turma: f.turma || 'all',
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function findEstadoIdForMunicipioId(municipioId: string): Promise<string | null> {
  const root = await api.get('/answer-sheets/opcoes-filtros');
  const estados = normalizeOpcoesFiltros(root.data?.estados);
  for (const est of estados) {
    const params = new URLSearchParams({ estado: est.id });
    const res = await api.get(`/answer-sheets/opcoes-filtros?${params}`);
    const municipios = normalizeOpcoesFiltros(res.data?.municipios);
    if (municipios.some((m) => m.id === municipioId)) return est.id;
  }
  return null;
}

function mergeStoredWithOverrides(
  stored: StoredResultsFilters,
  overrides?: Pick<AnswerSheetDetailQueryContext, 'escola' | 'serie' | 'turma'>
): AnswerSheetDetailQueryContext {
  const periodo = /^\d{4}-\d{2}$/.test(stored.periodo) ? stored.periodo : undefined;
  return {
    estado: stored.estado,
    municipio: stored.municipio,
    escola: overrides?.escola ?? (stored.escola !== 'all' ? stored.escola : undefined),
    serie: overrides?.serie ?? (stored.serie !== 'all' ? stored.serie : undefined),
    turma: overrides?.turma ?? (stored.turma !== 'all' ? stored.turma : undefined),
    periodo,
  };
}

export type ResolveAnswerSheetDetailQueryInput = {
  userId?: string;
  userRole?: string;
  tenantId?: string;
  escola?: string;
  serie?: string;
  turma?: string;
};

/**
 * Resolve estado/município (IDs de opcoes-filtros) para abrir o detalhe do aluno.
 * Prioridade: filtros salvos na página de resultados → hierarquia do usuário → cidade de referência/admin.
 */
export async function resolveAnswerSheetDetailQueryContext(
  input: ResolveAnswerSheetDetailQueryInput
): Promise<AnswerSheetDetailQueryContext | null> {
  const overrides = {
    escola: input.escola,
    serie: input.serie,
    turma: input.turma,
  };

  const stored = loadAnswerSheetResultsFiltersFromStorage();
  if (stored?.estado && stored.estado !== 'all' && stored.municipio && stored.municipio !== 'all') {
    return mergeStoredWithOverrides(stored, overrides);
  }

  const cityIds: string[] = [];

  if (input.userId && input.userRole) {
    try {
      const hierarchy = await getUserHierarchyContext(input.userId, input.userRole);
      if (hierarchy.municipality?.id) cityIds.push(hierarchy.municipality.id);
    } catch {
      // segue para outros candidatos
    }
  }

  const refCity = getStoredReferenceCityId();
  if (refCity) cityIds.push(refCity);
  if (input.tenantId?.trim()) cityIds.push(input.tenantId.trim());

  try {
    const userJson = localStorage.getItem('user');
    if (userJson) {
      const u = JSON.parse(userJson) as { tenant_id?: string; city_id?: string };
      if (u.city_id?.trim()) cityIds.push(u.city_id.trim());
      else if (u.tenant_id?.trim()) cityIds.push(u.tenant_id.trim());
    }
  } catch {
    // ignore
  }

  for (const municipioId of [...new Set(cityIds)]) {
    try {
      const estadoId = await findEstadoIdForMunicipioId(municipioId);
      if (estadoId) {
        return {
          estado: estadoId,
          municipio: municipioId,
          ...overrides,
        };
      }
    } catch {
      // tenta próximo id
    }
  }

  return null;
}

/** Monta o path + query como em `AnswerSheetResults.goToAnswerSheetStudentDetail`. */
export function buildAnswerSheetStudentDetailHref(
  gabaritoId: string,
  studentId: string,
  ctx: AnswerSheetDetailQueryContext
): string {
  const qs = new URLSearchParams();
  qs.set('estado', ctx.estado);
  qs.set('municipio', ctx.municipio);
  if (ctx.escola) qs.set('escola', ctx.escola);
  if (ctx.serie) qs.set('serie', ctx.serie);
  if (ctx.turma) qs.set('turma', ctx.turma);
  if (ctx.periodo) qs.set('periodo', ctx.periodo);
  return `/app/cartao-resposta/resultados/gabarito/${gabaritoId}/aluno/${studentId}?${qs.toString()}`;
}
