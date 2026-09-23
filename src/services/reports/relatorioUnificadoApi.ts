import { api } from '@/lib/api';
import { REPORT_ENTITY_TYPE_ANSWER_SHEET } from '@/services/evaluation/evaluationResultsApi';
import { getClassShiftLabel, hasClassShift } from '@/lib/classShift';
import type {
  RelatorioUnificadoDados,
  RelatorioUnificadoDadosParams,
  RelatorioUnificadoFilterAvaliacao,
  RelatorioUnificadoFilterEntity,
  RelatorioUnificadoFilterTurma,
  RelatorioUnificadoLeituraAvaliacao,
  RelatorioUnificadoOpcoesFiltros,
  RelatorioUnificadoOpcoesFiltrosParams,
  RelatorioUnificadoReportFlow,
} from '@/types/relatorio-unificado';

function withCityMeta(municipio?: string) {
  return municipio ? { meta: { cityId: municipio } as { cityId: string } } : {};
}

export function unifiedReportEntityTypeForFlow(
  flow?: RelatorioUnificadoReportFlow
): 'answer_sheet' | undefined {
  return flow === 'cartao' ? REPORT_ENTITY_TYPE_ANSWER_SHEET : undefined;
}

function setOptionalParam(q: URLSearchParams, key: string, value?: string | number) {
  if (value === undefined || value === null || value === '' || value === 'all') return;
  q.set(key, String(value));
}

function buildQuery(
  params: RelatorioUnificadoOpcoesFiltrosParams | RelatorioUnificadoDadosParams
): string {
  const q = new URLSearchParams();
  if ('report_entity_type' in params && params.report_entity_type) {
    q.set('report_entity_type', params.report_entity_type);
  }
  setOptionalParam(q, 'estado', params.estado);
  setOptionalParam(q, 'municipio', params.municipio);
  setOptionalParam(q, 'avaliacao', params.avaliacao);
  setOptionalParam(q, 'escola', params.escola);
  setOptionalParam(q, 'serie', params.serie);
  setOptionalParam(q, 'turma', params.turma);
  if ('modo_leitura' in params && params.modo_leitura) {
    setOptionalParam(q, 'modo_leitura', params.modo_leitura);
  }
  if ('avaliacao_leitura' in params) {
    setOptionalParam(q, 'avaliacao_leitura', params.avaliacao_leitura);
  }
  if ('ano' in params) {
    setOptionalParam(q, 'ano', params.ano);
  }
  if ('edicao' in params) {
    setOptionalParam(q, 'edicao', params.edicao);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

function normalizeEntities(
  items: Array<{ id?: string; nome?: string; name?: string; label?: string }> | undefined
): RelatorioUnificadoFilterEntity[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: String(item.id ?? ''),
      nome: item.nome ?? item.name ?? item.label ?? '',
    }))
    .filter((item) => item.id);
}

function normalizeAvaliacoes(
  items:
    | Array<RelatorioUnificadoFilterAvaliacao & { nome?: string; name?: string; title?: string }>
    | undefined
): RelatorioUnificadoFilterAvaliacao[] {
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
        nome: item.titulo ?? item.nome ?? item.name ?? item.title ?? '',
        titulo: item.titulo ?? item.nome ?? item.name ?? item.title ?? '',
        disciplina: item.disciplina,
        disciplinas,
      };
    })
    .filter((item) => item.id);
}

function normalizeTurmas(
  items:
    | Array<{ id?: string; nome?: string; name?: string; shift?: string; label?: string }>
    | undefined
): RelatorioUnificadoFilterTurma[] {
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

function normalizeLeituraAvaliacoes(items: unknown): RelatorioUnificadoLeituraAvaliacao[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((raw) => {
      const item = raw as RelatorioUnificadoLeituraAvaliacao & {
        title?: string;
        name?: string;
      };
      return {
        id: String(item.id ?? ''),
        titulo: item.titulo ?? item.title ?? item.name ?? '',
        ano: item.ano ?? null,
        edicao: item.edicao,
        edicaoLabel: item.edicaoLabel,
        status: item.status,
      };
    })
    .filter((item) => item.id);
}

export function getRelatorioUnificadoApiErrorMessage(error: unknown, fallback: string): string {
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

export class RelatorioUnificadoApiService {
  static async getOpcoesFiltros(
    params: RelatorioUnificadoOpcoesFiltrosParams = {}
  ): Promise<RelatorioUnificadoOpcoesFiltros> {
    const url = `/unified-report/opcoes-filtros${buildQuery(params)}`;
    const { data } = await api.get(url, withCityMeta(params.municipio));

    const avaliacoes = normalizeAvaliacoes(
      data?.avaliacoes?.length ? data.avaliacoes : data?.gabaritos
    );
    const leituraRaw = data?.leitura ?? {};
    const anos = Array.isArray(leituraRaw.anos)
      ? leituraRaw.anos.map((y: unknown) => Number(y)).filter((y: number) => Number.isFinite(y))
      : [];

    return {
      estados: normalizeEntities(data?.estados),
      municipios: normalizeEntities(data?.municipios),
      avaliacoes,
      escolas: normalizeEntities(data?.escolas),
      series: normalizeEntities(data?.series),
      turmas: normalizeTurmas(data?.turmas),
      leitura: {
        anos,
        edicoes: normalizeEntities(leituraRaw.edicoes),
        avaliacoes: normalizeLeituraAvaliacoes(leituraRaw.avaliacoes),
      },
    };
  }

  static async getDados(params: RelatorioUnificadoDadosParams): Promise<RelatorioUnificadoDados> {
    if (!params.estado || !params.municipio || !params.avaliacao) {
      throw new Error('Estado, município e avaliação são obrigatórios.');
    }
    const modo = params.modo_leitura || 'avaliacao';
    if (modo === 'avaliacao' && !params.avaliacao_leitura) {
      throw new Error('Avaliação de leitura é obrigatória no modo "Por avaliação".');
    }
    if (modo === 'edicao' && (params.ano === undefined || params.ano === '' || !params.edicao)) {
      throw new Error('Ano e edição são obrigatórios no modo "Por edição".');
    }
    if (!params.escola && !params.turma) {
      throw new Error('Informe ao menos escola ou turma.');
    }
    const url = `/unified-report/dados${buildQuery(params)}`;
    const { data } = await api.get<RelatorioUnificadoDados>(url, withCityMeta(params.municipio));
    return data;
  }
}
