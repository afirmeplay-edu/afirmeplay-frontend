import { api } from '@/lib/api';
import type { ComparativeIndicador } from '@/constants/comparativeReport';

export type ComparativeFilterEntity = { id: string; nome: string };

export type ComparativeFilterAvaliacao = {
  id: string;
  titulo: string;
  disciplina?: string;
};

export type ComparativeOpcoesFiltros = {
  estados: ComparativeFilterEntity[];
  municipios?: ComparativeFilterEntity[];
  avaliacoes?: ComparativeFilterAvaliacao[];
  series_disponiveis?: ComparativeFilterEntity[];
  escolas?: ComparativeFilterEntity[];
  series?: ComparativeFilterEntity[];
  turmas?: ComparativeFilterEntity[];
  report_entity_type?: string;
};

export type ComparativeParticipacao = {
  esperados: number;
  avaliados: number;
  percentual_comparecimento: number;
};

export type ComparativeProficiencia = {
  geral: number | null;
  media_nota_geral?: number | null;
  nivel_classificacao?: string | null;
  por_disciplina: Array<{
    disciplina?: string;
    media_proficiencia?: number | null;
    media_nota?: number | null;
    alunos_participantes?: number;
  }>;
};

export type ComparativeDistribuicao = {
  quantidades: Record<string, number>;
  percentuais: Record<string, number>;
};

export type ComparativeAvaliacaoBlock = {
  evaluation_id: string;
  titulo: string;
  disciplina?: string | null;
  aplicacoes_no_recorte?: number;
  indicadores: {
    participacao?: ComparativeParticipacao;
    proficiencia_media?: ComparativeProficiencia;
    distribuicao_niveis?: ComparativeDistribuicao;
    alunos_avaliados?: { quantidade: number };
    aplicacoes?: { quantidade: number };
  };
};

export type ComparativeResumo = {
  report_entity_type: string;
  filtros_aplicados: {
    estado: string;
    municipio: { id: string; nome: string };
    escola?: string | null;
    serie?: string | null;
    turma?: string | null;
    alunos: string;
    indicadores: ComparativeIndicador[];
    evaluation_ids: string[];
  };
  avaliacoes: ComparativeAvaliacaoBlock[];
};

export type ComparativeResumoPayload = {
  evaluation_ids: string[];
  estado: string;
  municipio: string;
  escola?: string;
  serie?: string;
  turma?: string;
  alunos: string;
  indicadores: ComparativeIndicador[];
  report_entity_type?: 'evaluation';
};

function withCityMeta(municipio?: string) {
  return municipio ? { meta: { cityId: municipio } as { cityId: string } } : {};
}

function normalizeEntity(
  items: Array<{ id?: string; nome?: string; name?: string }> | undefined
): ComparativeFilterEntity[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: String(item.id ?? ''),
      nome: String(item.nome ?? item.name ?? ''),
    }))
    .filter((item) => item.id);
}

function normalizeAvaliacoes(
  items:
    | Array<{
        id?: string;
        titulo?: string;
        nome?: string;
        name?: string;
        title?: string;
        disciplina?: string;
      }>
    | undefined
): ComparativeFilterAvaliacao[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: String(item.id ?? ''),
      titulo: String(item.titulo ?? item.nome ?? item.name ?? item.title ?? ''),
      disciplina: item.disciplina,
    }))
    .filter((item) => item.id);
}

export function getComparativeApiErrorMessage(error: unknown, fallback: string): string {
  const err = error as {
    response?: { data?: { error?: string; details?: string; message?: string } };
    message?: string;
  };
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.response?.data?.details ||
    err?.message ||
    fallback
  );
}

export const ComparativeReportApiService = {
  async getOpcoesFiltros(params: {
    estado?: string;
    municipio?: string;
    evaluation_ids?: string[];
    avaliacao?: string;
    escola?: string;
    serie?: string;
    nome?: string;
  }): Promise<ComparativeOpcoesFiltros> {
    const q = new URLSearchParams();
    if (params.estado) q.set('estado', params.estado);
    if (params.municipio) q.set('municipio', params.municipio);
    if (params.avaliacao) q.set('avaliacao', params.avaliacao);
    if (params.escola) q.set('escola', params.escola);
    if (params.serie) q.set('serie', params.serie);
    if (params.nome) q.set('nome', params.nome);
    if (params.evaluation_ids?.length) {
      q.set('evaluation_ids', params.evaluation_ids.join(','));
    }
    const qs = q.toString();
    const response = await api.get(
      `/comparative-report/opcoes-filtros${qs ? `?${qs}` : ''}`,
      withCityMeta(params.municipio)
    );
    const data = response.data || {};
    return {
      estados: normalizeEntity(data.estados),
      municipios: normalizeEntity(data.municipios),
      avaliacoes: normalizeAvaliacoes(data.avaliacoes),
      series_disponiveis: normalizeEntity(data.series_disponiveis),
      escolas: normalizeEntity(data.escolas),
      series: normalizeEntity(data.series),
      turmas: normalizeEntity(data.turmas),
      report_entity_type: data.report_entity_type,
    };
  },

  async postResumo(payload: ComparativeResumoPayload): Promise<ComparativeResumo> {
    const response = await api.post(
      '/comparative-report/resumo',
      {
        ...payload,
        report_entity_type: payload.report_entity_type || 'evaluation',
      },
      withCityMeta(payload.municipio)
    );
    return response.data as ComparativeResumo;
  },
};
