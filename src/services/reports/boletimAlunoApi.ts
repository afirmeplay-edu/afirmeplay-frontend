import { api } from '@/lib/api';
import { REPORT_ENTITY_TYPE_ANSWER_SHEET } from '@/services/evaluation/evaluationResultsApi';
import { getClassShiftLabel, hasClassShift } from '@/lib/classShift';
import type {
  BoletimAlunoFilterAluno,
  BoletimAlunoFilterAvaliacao,
  BoletimAlunoFilterEntity,
  BoletimAlunoFilterTurma,
  BoletimAlunoOpcoesFiltros,
  BoletimAlunoOpcoesFiltrosParams,
  BoletimAlunoPaginacao,
  BoletimAlunoReportFlow,
  BoletimAlunoResumo,
  BoletimAlunoResumoParams,
} from '@/types/boletim-aluno';

function withCityMeta(municipio?: string) {
  return municipio
    ? { meta: { cityId: municipio } as { cityId: string } }
    : {};
}

export function boletimReportEntityTypeForFlow(
  flow?: BoletimAlunoReportFlow
): 'answer_sheet' | undefined {
  return flow === 'cartao' ? REPORT_ENTITY_TYPE_ANSWER_SHEET : undefined;
}

function setOptionalParam(q: URLSearchParams, key: string, value?: string | number) {
  if (value === undefined || value === null || value === '' || value === 'all') return;
  q.set(key, String(value));
}

function buildQuery(params: BoletimAlunoOpcoesFiltrosParams | BoletimAlunoResumoParams): string {
  const q = new URLSearchParams();
  if (params.report_entity_type) q.set('report_entity_type', params.report_entity_type);
  setOptionalParam(q, 'estado', params.estado);
  setOptionalParam(q, 'municipio', params.municipio);
  setOptionalParam(q, 'avaliacao', params.avaliacao);
  setOptionalParam(q, 'escola', params.escola);
  setOptionalParam(q, 'serie', params.serie);
  setOptionalParam(q, 'turma', params.turma);
  setOptionalParam(q, 'nome', params.nome);
  if ('aluno' in params) setOptionalParam(q, 'aluno', params.aluno);
  if ('q' in params) setOptionalParam(q, 'q', params.q);
  if (params.page != null) q.set('page', String(params.page));
  if (params.per_page != null) q.set('per_page', String(params.per_page));
  const s = q.toString();
  return s ? `?${s}` : '';
}

function normalizeEntities(
  items: Array<{ id?: string; nome?: string; name?: string }> | undefined
): BoletimAlunoFilterEntity[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: String(item.id ?? ''),
      nome: item.nome ?? item.name ?? '',
    }))
    .filter((item) => item.id);
}

function normalizeAvaliacoes(
  items: Array<BoletimAlunoFilterAvaliacao & { nome?: string; name?: string; title?: string }> | undefined
): BoletimAlunoFilterAvaliacao[] {
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
): BoletimAlunoFilterTurma[] {
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

function normalizeAlunos(items: unknown): BoletimAlunoFilterAluno[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item: BoletimAlunoFilterAluno & { name?: string }) => ({
      id: String(item.id ?? ''),
      nome: item.nome ?? item.name ?? '',
      matricula: item.matricula,
      escola: item.escola,
      serie: item.serie,
      turma: item.turma,
    }))
    .filter((item) => item.id);
}

function normalizePaginacao(raw: unknown, fallbackPage = 1, fallbackPerPage = 20): BoletimAlunoPaginacao {
  const data = (raw ?? {}) as Partial<BoletimAlunoPaginacao>;
  return {
    page: Number(data.page) || fallbackPage,
    per_page: Number(data.per_page) || fallbackPerPage,
    total: Number(data.total) || 0,
    total_pages: Number(data.total_pages) || 0,
  };
}

export function getBoletimAlunoApiErrorMessage(error: unknown, fallback: string): string {
  const maybe = error as {
    message?: string;
    response?: { data?: { error?: string; details?: string; message?: string }; status?: number };
  };
  if (maybe?.response?.status === 404) {
    return (
      maybe.response.data?.error ||
      maybe.response.data?.details ||
      maybe.response.data?.message ||
      'Aluno não realizou a avaliação neste recorte.'
    );
  }
  return (
    maybe?.response?.data?.error ||
    maybe?.response?.data?.details ||
    maybe?.response?.data?.message ||
    maybe?.message ||
    fallback
  );
}

export class BoletimAlunoApiService {
  static async getOpcoesFiltros(
    params: BoletimAlunoOpcoesFiltrosParams = {}
  ): Promise<BoletimAlunoOpcoesFiltros> {
    const url = `/boletim-aluno/opcoes-filtros${buildQuery(params)}`;
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
      alunos: normalizeAlunos(data?.alunos),
      alunos_paginacao: normalizePaginacao(data?.alunos_paginacao, params.page, params.per_page),
    };
  }

  static async getResumo(params: BoletimAlunoResumoParams): Promise<BoletimAlunoResumo> {
    if (!params.estado || !params.municipio || !params.avaliacao) {
      throw new Error('Estado, município e avaliação são obrigatórios.');
    }

    const url = `/boletim-aluno/resumo${buildQuery(params)}`;
    const { data } = await api.get<BoletimAlunoResumo>(url, withCityMeta(params.municipio));
    return {
      ...data,
      paginacao: normalizePaginacao(data?.paginacao, params.page, params.per_page),
      boletins: Array.isArray(data?.boletins) ? data.boletins : [],
    };
  }
}
