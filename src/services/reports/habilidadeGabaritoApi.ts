import { api } from '@/lib/api';
import { getClassShiftLabel, hasClassShift } from '@/lib/classShift';
import { REPORT_ENTITY_TYPE_ANSWER_SHEET } from '@/services/evaluation/evaluationResultsApi';
import type {
  HabilidadeGabaritoAvaliacao,
  HabilidadeGabaritoEscopo,
  HabilidadeGabaritoFilterAvaliacao,
  HabilidadeGabaritoFilterEntity,
  HabilidadeGabaritoFilterTurma,
  HabilidadeGabaritoOpcoesFiltros,
  HabilidadeGabaritoOpcoesFiltrosParams,
  HabilidadeGabaritoQuestao,
  HabilidadeGabaritoReportEntityType,
  HabilidadeGabaritoReportFlow,
  HabilidadeGabaritoResumo,
  HabilidadeGabaritoResumoParams,
} from '@/types/habilidade-gabarito';

function withCityMeta(municipio?: string) {
  return municipio ? { meta: { cityId: municipio } as { cityId: string } } : {};
}

function setOptionalParam(q: URLSearchParams, key: string, value?: string) {
  if (!value || value === 'all') return;
  q.set(key, value);
}

export function uniqueIds(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of values) {
    const id = String(value ?? '').trim();
    if (!id || id === 'all' || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function buildOpcoesQuery(params: HabilidadeGabaritoOpcoesFiltrosParams): string {
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

/** Uma avaliação vai em `avaliacao`. Duas ou mais vão em `avaliacoes` (CSV). */
export function buildResumoQuery(params: HabilidadeGabaritoResumoParams): string {
  const q = new URLSearchParams();
  if (params.report_entity_type) q.set('report_entity_type', params.report_entity_type);
  setOptionalParam(q, 'estado', params.estado);
  setOptionalParam(q, 'municipio', params.municipio);
  const ids = uniqueIds([...(params.avaliacoes ?? []), params.avaliacao]);
  if (ids.length === 1) q.set('avaliacao', ids[0]);
  else if (ids.length > 1) q.set('avaliacoes', ids.join(','));
  setOptionalParam(q, 'escola', params.escola);
  setOptionalParam(q, 'serie', params.serie);
  setOptionalParam(q, 'turma', params.turma);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function reportEntityTypeForFlow(
  flow?: HabilidadeGabaritoReportFlow
): 'answer_sheet' | undefined {
  return flow === 'cartao' ? REPORT_ENTITY_TYPE_ANSWER_SHEET : undefined;
}

function normalizeEntities(
  items: Array<{ id?: string; nome?: string; name?: string }> | undefined
): HabilidadeGabaritoFilterEntity[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: String(item.id ?? ''),
      nome: item.nome ?? item.name ?? '',
    }))
    .filter((item) => item.id);
}

function mergeEntities(lists: HabilidadeGabaritoFilterEntity[][]): HabilidadeGabaritoFilterEntity[] {
  const byId = new Map<string, HabilidadeGabaritoFilterEntity>();
  for (const list of lists) {
    for (const item of list) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }
  return [...byId.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function normalizeAvaliacoes(
  items: Array<HabilidadeGabaritoFilterAvaliacao & { nome?: string; name?: string; title?: string }> | undefined
): HabilidadeGabaritoFilterAvaliacao[] {
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

function mergeAvaliacoes(
  lists: HabilidadeGabaritoFilterAvaliacao[][]
): HabilidadeGabaritoFilterAvaliacao[] {
  const byId = new Map<string, HabilidadeGabaritoFilterAvaliacao>();
  for (const list of lists) {
    for (const item of list) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }
  return [...byId.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

function normalizeTurmas(
  items: Array<{
    id?: string;
    nome?: string;
    name?: string;
    shift?: string;
    label?: string;
  }> | undefined
): HabilidadeGabaritoFilterTurma[] {
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

function mergeTurmas(lists: HabilidadeGabaritoFilterTurma[][]): HabilidadeGabaritoFilterTurma[] {
  const byId = new Map<string, HabilidadeGabaritoFilterTurma>();
  for (const list of lists) {
    for (const item of list) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }
  return [...byId.values()].sort((a, b) =>
    (a.label || a.nome).localeCompare(b.label || b.nome, 'pt-BR')
  );
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function normalizeEntityType(value: unknown): HabilidadeGabaritoReportEntityType {
  return value === 'answer_sheet' ? 'answer_sheet' : 'digital';
}

function normalizeQuestao(raw: unknown, index: number): HabilidadeGabaritoQuestao {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const numero = Number(item.numero);
  const habilidade = String(item.habilidade ?? '').trim();
  return {
    numero: Number.isFinite(numero) && numero > 0 ? numero : index + 1,
    habilidade: habilidade || 'N/A',
    descricao_habilidade: String(item.descricao_habilidade ?? ''),
    gabarito: String(item.gabarito ?? '').trim(),
  };
}

function normalizeAvaliacaoBloco(raw: unknown, index: number): HabilidadeGabaritoAvaliacao | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = String(item.id ?? '').trim();
  if (!id) return null;
  const questoesRaw = Array.isArray(item.questoes) ? item.questoes : [];
  const questoes = questoesRaw
    .map((questao, questaoIndex) => normalizeQuestao(questao, questaoIndex))
    .sort((a, b) => a.numero - b.numero);
  return {
    id,
    titulo: String(item.titulo ?? item.nome ?? '').trim() || `Avaliação ${index + 1}`,
    questoes,
  };
}

function normalizeResumo(
  data: unknown,
  params: HabilidadeGabaritoResumoParams
): HabilidadeGabaritoResumo {
  const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const escopoRaw = (body.escopo && typeof body.escopo === 'object' ? body.escopo : {}) as Record<
    string,
    unknown
  >;
  const escopo: HabilidadeGabaritoEscopo = {
    estado: String(escopoRaw.estado ?? params.estado),
    municipio_id: String(escopoRaw.municipio_id ?? params.municipio),
    escolas: asStringArray(escopoRaw.escolas),
    series: asStringArray(escopoRaw.series),
    turmas: asStringArray(escopoRaw.turmas),
    report_entity_type: normalizeEntityType(
      escopoRaw.report_entity_type ?? params.report_entity_type
    ),
  };
  const avaliacoesRaw = Array.isArray(body.avaliacoes) ? body.avaliacoes : [];
  return {
    nome: String(body.nome ?? '').trim() || 'Relatório de habilidade e gabarito',
    escopo,
    avaliacoes: avaliacoesRaw
      .map((bloco, index) => normalizeAvaliacaoBloco(bloco, index))
      .filter((bloco): bloco is HabilidadeGabaritoAvaliacao => Boolean(bloco)),
  };
}

export function getHabilidadeGabaritoApiErrorMessage(error: unknown, fallback: string): string {
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

export class HabilidadeGabaritoApiService {
  static async getOpcoesFiltros(
    params: HabilidadeGabaritoOpcoesFiltrosParams = {}
  ): Promise<HabilidadeGabaritoOpcoesFiltros> {
    const url = `/habilidade-gabarito/opcoes-filtros${buildOpcoesQuery(params)}`;
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

  /**
   * Escolas, séries e turmas do recorte.
   * O filtro compartilhado recebe uma avaliação por vez; várias avaliações são unidas aqui.
   */
  static async getOpcoesDoRecorte(
    params: Omit<HabilidadeGabaritoOpcoesFiltrosParams, 'avaliacao'> & { avaliacoes?: string[] }
  ): Promise<HabilidadeGabaritoOpcoesFiltros> {
    const ids = uniqueIds(params.avaliacoes ?? []);
    const { avaliacoes: _ignored, ...rest } = params;
    if (ids.length <= 1) {
      return this.getOpcoesFiltros({ ...rest, avaliacao: ids[0] });
    }

    const settled = await Promise.allSettled(
      ids.map((avaliacao) => this.getOpcoesFiltros({ ...rest, avaliacao }))
    );
    const ok = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    if (!ok.length) {
      const rejected = settled.find((result) => result.status === 'rejected');
      throw rejected && rejected.status === 'rejected'
        ? rejected.reason
        : new Error('Não foi possível carregar os filtros.');
    }

    return {
      estados: mergeEntities(ok.map((item) => item.estados)),
      municipios: mergeEntities(ok.map((item) => item.municipios ?? [])),
      avaliacoes: mergeAvaliacoes(ok.map((item) => item.avaliacoes ?? [])),
      escolas: mergeEntities(ok.map((item) => item.escolas ?? [])),
      series: mergeEntities(ok.map((item) => item.series ?? [])),
      turmas: mergeTurmas(ok.map((item) => item.turmas ?? [])),
    };
  }

  static async getResumo(params: HabilidadeGabaritoResumoParams): Promise<HabilidadeGabaritoResumo> {
    const ids = uniqueIds([...(params.avaliacoes ?? []), params.avaliacao]);
    if (!params.estado || !params.municipio || ids.length === 0) {
      throw new Error('Estado, município e ao menos uma avaliação são obrigatórios.');
    }
    const url = `/habilidade-gabarito/resumo${buildResumoQuery({ ...params, avaliacoes: ids, avaliacao: undefined })}`;
    const { data } = await api.get(url, withCityMeta(params.municipio));
    return normalizeResumo(data, params);
  }
}
