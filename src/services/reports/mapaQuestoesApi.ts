import { api } from '@/lib/api';
import { REPORT_ENTITY_TYPE_ANSWER_SHEET } from '@/services/evaluation/evaluationResultsApi';
import { getClassShiftLabel, hasClassShift } from '@/lib/classShift';
import type {
  MapaQuestoesFilterAvaliacao,
  MapaQuestoesFilterEntity,
  MapaQuestoesFilterTurma,
  MapaQuestoesOpcoesFiltros,
  MapaQuestoesOpcoesFiltrosParams,
  MapaQuestoesReportFlow,
  MapaQuestoesResumo,
  MapaQuestoesResumoParams,
} from '@/types/mapa-questoes';

function withCityMeta(municipio?: string) {
  return municipio
    ? { meta: { cityId: municipio } as { cityId: string } }
    : {};
}

export function reportEntityTypeForFlow(
  flow?: MapaQuestoesReportFlow
): 'answer_sheet' | undefined {
  return flow === 'cartao' ? REPORT_ENTITY_TYPE_ANSWER_SHEET : undefined;
}

function setOptionalParam(q: URLSearchParams, key: string, value?: string) {
  if (!value || value === 'all') return;
  q.set(key, value);
}

function buildQuery(params: MapaQuestoesOpcoesFiltrosParams | MapaQuestoesResumoParams): string {
  const q = new URLSearchParams();
  if (params.report_entity_type) q.set('report_entity_type', params.report_entity_type);
  setOptionalParam(q, 'estado', params.estado);
  setOptionalParam(q, 'municipio', params.municipio);
  setOptionalParam(q, 'avaliacao', params.avaliacao);
  setOptionalParam(q, 'escola', params.escola);
  setOptionalParam(q, 'serie', params.serie);
  setOptionalParam(q, 'turma', params.turma);
  const s = q.toString();
  return s ? `?${s}` : '';
}

function normalizeEntities(
  items: Array<{ id?: string; nome?: string; name?: string }> | undefined
): MapaQuestoesFilterEntity[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: String(item.id ?? ''),
      nome: item.nome ?? item.name ?? '',
    }))
    .filter((item) => item.id);
}

function normalizeAvaliacoes(
  items: Array<MapaQuestoesFilterAvaliacao & { nome?: string; name?: string; title?: string }> | undefined
): MapaQuestoesFilterAvaliacao[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const disciplinas =
        Array.isArray(item.disciplinas) && item.disciplinas.length > 0
          ? item.disciplinas
          : item.disciplina
            ? [item.disciplina]
            : [];
      return {
        id: String(item.id ?? ''),
        titulo: item.titulo ?? item.nome ?? item.name ?? item.title ?? '',
        disciplina: item.disciplina,
        disciplinas,
      };
    })
    .filter((item) => item.id);
}

function normalizeTurmas(
  items: Array<{
    id?: string;
    nome?: string;
    name?: string;
    shift?: string;
    label?: string;
  }> | undefined
): MapaQuestoesFilterTurma[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const nome = item.nome ?? item.name ?? '';
      const label =
        item.label ||
        (hasClassShift(item.shift) ? `${nome} (${getClassShiftLabel(item.shift)})` : nome);
      return {
        id: String(item.id ?? ''),
        nome,
        shift: item.shift,
        label,
      };
    })
    .filter((item) => item.id);
}

export function getMapaQuestoesApiErrorMessage(error: unknown, fallback: string): string {
  const maybe = error as {
    message?: string;
    response?: { data?: { error?: string; details?: string; message?: string }; status?: number };
  };
  return (
    maybe?.response?.data?.error ||
    maybe?.response?.data?.details ||
    maybe?.response?.data?.message ||
    maybe?.message ||
    fallback
  );
}

export class MapaQuestoesApiService {
  static async getOpcoesFiltros(
    params: MapaQuestoesOpcoesFiltrosParams = {}
  ): Promise<MapaQuestoesOpcoesFiltros> {
    const url = `/mapa-questoes/opcoes-filtros${buildQuery(params)}`;
    const { data } = await api.get(url, withCityMeta(params.municipio));

    const avaliacoes = normalizeAvaliacoes(
      data?.avaliacoes?.length ? data.avaliacoes : data?.gabaritos
    );

    return {
      estados: normalizeEntities(data?.estados),
      municipios: normalizeEntities(data?.municipios),
      avaliacoes,
      escolas: normalizeEntities(data?.escolas),
      series: normalizeEntities(data?.series),
      turmas: normalizeTurmas(data?.turmas),
    };
  }

  static async getResumo(params: MapaQuestoesResumoParams): Promise<MapaQuestoesResumo> {
    if (!params.estado || !params.municipio || !params.avaliacao) {
      throw new Error('Estado, município e avaliação são obrigatórios.');
    }

    const url = `/mapa-questoes/resumo${buildQuery(params)}`;
    const { data } = await api.get<MapaQuestoesResumo>(url, withCityMeta(params.municipio));
    return data;
  }
}
