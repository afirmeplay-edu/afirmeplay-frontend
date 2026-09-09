import { api } from '@/lib/api';
import { normalizeResultsPeriodYm } from '@/utils/resultsPeriod';

function appendPeriodo(q: URLSearchParams, periodo?: string) {
  if (!periodo?.trim()) return;
  const p = normalizeResultsPeriodYm(periodo);
  if (p !== 'all') q.set('periodo', p);
}

function withCityMeta(municipio: string | undefined) {
  return municipio && municipio !== 'all'
    ? { meta: { cityId: municipio } as { cityId: string } }
    : {};
}

export type ProficiencyLevelLabel =
  | 'Abaixo do Básico'
  | 'Básico'
  | 'Adequado'
  | 'Avançado';

export type ProficiencyFaixa =
  | 'abaixo_do_basico'
  | 'basico'
  | 'adequado'
  | 'avancado';

export type ProficiencyLevelCount = {
  quantidade: number;
  percentual: number;
};

export type ProficiencyLevelsMeta = {
  titulo?: string | null;
  avaliacao_id?: string | null;
  gabarito_id?: string | null;
  estado?: string | null;
  municipio?: string | null;
  municipio_id?: string | null;
  escola?: string | null;
  escola_id?: string | null;
  serie?: string | null;
  periodo?: string | null;
  data_aplicacao?: string | null;
  total_itens?: number | null;
  rede?: string | null;
};

export type ProficiencyLevelsAluno = {
  id: string;
  nome: string;
  escola_id?: string | null;
  escola?: string | null;
  serie?: string | null;
  turma?: string | null;
  turno?: string | null;
  acertos?: number | null;
  total_itens?: number | null;
  percentual_acertos?: number | null;
  nota?: number | null;
  proficiencia?: number | null;
  nivel?: string | null;
  status?: string | null;
};

export type ProficiencyLevelsPorTurma = {
  serie?: string | null;
  turma?: string | null;
  turno?: string | null;
  alunos_avaliados?: number;
  media_acertos_percentual?: number | null;
  media_proficiencia?: number | null;
  distribuicao?: Record<string, ProficiencyLevelCount>;
  alunos?: ProficiencyLevelsAluno[];
};

export type ProficiencyLevelsHabilidade = {
  codigo: string;
  descricao?: string | null;
  componente?: string | null;
  subject_id?: string | null;
  percentual_acertos: number;
  faixa?: ProficiencyFaixa | string | null;
  nivel?: string | null;
  serie?: string | null;
};

export type ProficiencyLevelsIndicadores = {
  alunos_avaliados?: number;
  turmas?: number;
  media_acertos_percentual?: number | null;
  media_proficiencia?: number | null;
  adequado_avancado?: ProficiencyLevelCount;
  abaixo_do_basico?: ProficiencyLevelCount;
};

export type ProficiencyLevelsResponse = {
  fonte?: 'avaliacao' | 'cartao' | string;
  nivel_granularidade?: string;
  meta?: ProficiencyLevelsMeta;
  filtros_aplicados?: Record<string, string | null | undefined>;
  niveis?: ProficiencyLevelLabel[] | string[];
  indicadores?: ProficiencyLevelsIndicadores;
  distribuicao?: Record<string, ProficiencyLevelCount>;
  alunos?: ProficiencyLevelsAluno[];
  por_turma?: ProficiencyLevelsPorTurma[];
  habilidades?: ProficiencyLevelsHabilidade[];
  disciplinas_disponiveis?: Array<{ id: string; nome: string }>;
};

export type ProficiencyLevelsFilterParams = {
  estado?: string;
  municipio?: string;
  avaliacao?: string;
  gabarito?: string;
  escola?: string;
  serie?: string;
  turma?: string;
  periodo?: string;
  turno?: string;
  nivel?: string;
  disciplina?: string;
};

function buildQuery(params: ProficiencyLevelsFilterParams, mode: 'online' | 'cartao') {
  const q = new URLSearchParams();
  if (params.estado && params.estado !== 'all') q.set('estado', params.estado);
  if (params.municipio && params.municipio !== 'all') q.set('municipio', params.municipio);
  if (mode === 'online') {
    if (params.avaliacao && params.avaliacao !== 'all') q.set('avaliacao', params.avaliacao);
  } else if (params.gabarito && params.gabarito !== 'all') {
    q.set('gabarito', params.gabarito);
  }
  if (params.escola && params.escola !== 'all') q.set('escola', params.escola);
  if (params.serie && params.serie !== 'all') q.set('serie', params.serie);
  if (params.turma && params.turma !== 'all') q.set('turma', params.turma);
  if (params.turno && params.turno !== 'all') q.set('turno', params.turno);
  if (params.nivel && params.nivel !== 'all') q.set('nivel', params.nivel);
  q.set('disciplina', params.disciplina && params.disciplina !== 'all' ? params.disciplina : 'all');
  appendPeriodo(q, params.periodo);
  return q;
}

export async function fetchProficiencyLevelsOnline(
  params: ProficiencyLevelsFilterParams
): Promise<ProficiencyLevelsResponse> {
  const q = buildQuery(params, 'online');
  const { data } = await api.get<ProficiencyLevelsResponse>(
    `/evaluation-results/niveis-proficiencia?${q}`,
    withCityMeta(params.municipio)
  );
  return data;
}

export async function fetchProficiencyLevelsCartao(
  params: ProficiencyLevelsFilterParams
): Promise<ProficiencyLevelsResponse> {
  const q = buildQuery(params, 'cartao');
  const { data } = await api.get<ProficiencyLevelsResponse>(
    `/answer-sheets/niveis-proficiencia?${q}`,
    withCityMeta(params.municipio)
  );
  return data;
}

export {
  fetchEvaluationFilterOptions,
  fetchAnswerSheetFilterOptions,
} from '@/services/evaluation/skillsMapApi';
