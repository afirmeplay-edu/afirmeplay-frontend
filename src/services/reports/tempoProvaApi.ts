import { api } from '@/lib/api';
import type {
  TempoProvaFilterAvaliacao,
  TempoProvaFilterEntity,
  TempoProvaFilterTurma,
  TempoProvaOpcoesFiltros,
  TempoProvaOpcoesFiltrosParams,
  TempoProvaResumo,
  TempoProvaResumoParams,
} from '@/types/tempo-prova';

function withCityMeta(municipio?: string) {
  return municipio ? { meta: { cityId: municipio } as { cityId: string } } : {};
}

function setCsvParam(q: URLSearchParams, key: string, values?: string[]) {
  if (!values || values.length === 0) return;
  q.set(key, values.join(','));
}

function buildQuery(params: TempoProvaOpcoesFiltrosParams | TempoProvaResumoParams): string {
  const q = new URLSearchParams();
  if (params.estado) q.set('estado', params.estado);
  if ('municipio' in params && params.municipio) q.set('municipio', params.municipio);
  setCsvParam(q, 'avaliacoes', params.avaliacoes);
  setCsvParam(q, 'escolas', params.escolas);
  setCsvParam(q, 'series', params.series);
  setCsvParam(q, 'turmas', params.turmas);
  setCsvParam(q, 'alunos', params.alunos);
  const s = q.toString();
  return s ? `?${s}` : '';
}

function normalizeEntities(
  items: Array<{ id?: string; nome?: string; name?: string }> | undefined
): TempoProvaFilterEntity[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: String(item.id ?? ''),
      nome: item.nome ?? item.name ?? '',
    }))
    .filter((item) => item.id);
}

function normalizeAvaliacoes(
  items: Array<TempoProvaFilterAvaliacao & { nome?: string; name?: string; title?: string }> | undefined
): TempoProvaFilterAvaliacao[] {
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

function normalizeTurmas(items: TempoProvaFilterTurma[] | undefined): TempoProvaFilterTurma[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const nome = item.nome ?? '';
      const label = item.label || (item.shift ? `${nome} (${item.shift})` : nome);
      return { id: String(item.id ?? ''), nome, shift: item.shift, label };
    })
    .filter((item) => item.id);
}

export function getTempoProvaApiErrorMessage(error: unknown, fallback: string): string {
  const maybe = error as {
    message?: string;
    response?: { data?: { error?: string; details?: string; message?: string } };
  };
  return (
    maybe?.response?.data?.error ||
    maybe?.response?.data?.details ||
    maybe?.response?.data?.message ||
    maybe?.message ||
    fallback
  );
}

export class TempoProvaApiService {
  static async getOpcoesFiltros(
    params: TempoProvaOpcoesFiltrosParams = {}
  ): Promise<TempoProvaOpcoesFiltros> {
    const url = `/tempo-prova/opcoes-filtros${buildQuery(params)}`;
    const { data } = await api.get(url, withCityMeta(params.municipio));
    return {
      estados: normalizeEntities(data?.estados),
      municipios: normalizeEntities(data?.municipios),
      avaliacoes: normalizeAvaliacoes(data?.avaliacoes),
      escolas: normalizeEntities(data?.escolas),
      series: normalizeEntities(data?.series),
      turmas: normalizeTurmas(data?.turmas),
      alunos: normalizeEntities(data?.alunos),
    };
  }

  static async getResumo(params: TempoProvaResumoParams): Promise<TempoProvaResumo> {
    if (!params.estado || !params.municipio) {
      throw new Error('Estado e município são obrigatórios.');
    }
    const url = `/tempo-prova/resumo${buildQuery(params)}`;
    const { data } = await api.get<TempoProvaResumo>(url, withCityMeta(params.municipio));
    return data;
  }
}
