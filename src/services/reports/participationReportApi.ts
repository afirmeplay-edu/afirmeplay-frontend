import { api } from '@/lib/api';
import { REPORT_ENTITY_TYPE_ANSWER_SHEET } from '@/services/evaluation/evaluationResultsApi';
import type {
  ParticipationFilterAvaliacao,
  ParticipationFilterEntity,
  ParticipationFilterTurma,
  ParticipationOpcoesFiltros,
  ParticipationOpcoesFiltrosParams,
  ParticipationReportFlow,
  ParticipationResumo,
  ParticipationResumoParams,
} from '@/types/participation-report';

function withCityMeta(municipio?: string) {
  return municipio
    ? { meta: { cityId: municipio } as { cityId: string } }
    : {};
}

function setCsvParam(q: URLSearchParams, key: string, values?: string[]) {
  if (!values || values.length === 0) return;
  q.set(key, values.join(','));
}

export function reportEntityTypeForFlow(
  flow?: ParticipationReportFlow
): 'answer_sheet' | undefined {
  return flow === 'cartao' ? REPORT_ENTITY_TYPE_ANSWER_SHEET : undefined;
}

function buildQuery(params: ParticipationOpcoesFiltrosParams | ParticipationResumoParams): string {
  const q = new URLSearchParams();
  if (params.report_entity_type) q.set('report_entity_type', params.report_entity_type);
  if (params.estado) q.set('estado', params.estado);
  if ('municipio' in params && params.municipio) q.set('municipio', params.municipio);
  setCsvParam(q, 'avaliacoes', params.avaliacoes);
  setCsvParam(q, 'escolas', params.escolas);
  setCsvParam(q, 'series', params.series);
  setCsvParam(q, 'turmas', params.turmas);
  const s = q.toString();
  return s ? `?${s}` : '';
}

function normalizeEntities(
  items: Array<{ id?: string; nome?: string; name?: string }> | undefined
): ParticipationFilterEntity[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: String(item.id ?? ''),
      nome: item.nome ?? item.name ?? '',
    }))
    .filter((item) => item.id);
}

function normalizeAvaliacoes(
  items: Array<ParticipationFilterAvaliacao & { nome?: string; name?: string; title?: string }> | undefined
): ParticipationFilterAvaliacao[] {
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
  items: ParticipationFilterTurma[] | undefined
): ParticipationFilterTurma[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const nome = item.nome ?? '';
      const label =
        item.label ||
        (item.shift ? `${nome} (${item.shift})` : nome);
      return {
        id: String(item.id ?? ''),
        nome,
        shift: item.shift,
        label,
      };
    })
    .filter((item) => item.id);
}

export function getParticipationApiErrorMessage(error: unknown, fallback: string): string {
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

export class ParticipationReportApiService {
  static async getOpcoesFiltros(
    params: ParticipationOpcoesFiltrosParams = {}
  ): Promise<ParticipationOpcoesFiltros> {
    const url = `/participation-report/opcoes-filtros${buildQuery(params)}`;
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

  static async getResumo(params: ParticipationResumoParams): Promise<ParticipationResumo> {
    if (!params.estado || !params.municipio) {
      throw new Error('Estado e município são obrigatórios.');
    }

    const url = `/participation-report/resumo${buildQuery(params)}`;
    const { data } = await api.get<ParticipationResumo>(url, withCityMeta(params.municipio));
    return data;
  }
}
