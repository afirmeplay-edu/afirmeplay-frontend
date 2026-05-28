import { api } from '@/lib/api';
import type {
  Cabecalho,
  ListaFrequenciaResponse,
  ListaFrequenciaTurmasResponse,
  TipoListaFrequencia,
} from '@/types/lista-frequencia';

function mapTurmasResponse(data: ListaFrequenciaTurmasResponse): ListaFrequenciaResponse[] {
  if (!data?.turmas || !Array.isArray(data.turmas)) return [];
  const legendaPadrao = data.legenda;
  const instrucoesPadrao = data.instrucoes_aplicador;
  return data.turmas.map((t) => {
    const cab = t.cabecalho as Partial<Cabecalho>;
    const cabecalho: Cabecalho = {
      nome_prova_ano: cab.nome_prova_ano ?? '',
      lista_presenca_curso: cab.lista_presenca_curso ?? '',
      municipio_uf: cab.municipio_uf ?? '',
      rede: cab.rede ?? null,
      nome_escola: cab.nome_escola ?? '',
      serie: cab.serie,
      turma: cab.turma,
      serie_turma: cab.serie_turma,
      turno: cab.turno ?? null,
      disciplina: cab.disciplina ?? '',
      legenda: cab.legenda ?? legendaPadrao ?? {},
      instrucoes_aplicador: cab.instrucoes_aplicador ?? instrucoesPadrao ?? '',
    };
    return { class_id: t.class_id, cabecalho, estudantes: t.estudantes };
  });
}

/**
 * Lista de frequência por turma (status vazios).
 * GET /lista-frequencia/?class_id=<uuid>
 * Comportamento mantido: lista a turma e os estudantes com status null.
 */
export async function getListaFrequenciaPorTurma(
  classId: string,
  tipo?: TipoListaFrequencia
): Promise<ListaFrequenciaResponse> {
  const params: Record<string, string> = { class_id: classId };
  if (tipo) params.tipo = tipo;
  const response = await api.get<ListaFrequenciaResponse>('lista-frequencia/', { params });
  return response.data;
}

/**
 * Lista de frequência de avaliação já aplicada (status P/A conforme TestSession).
 * GET /lista-frequencia/?test_id=<id> [&class_id=<uuid>] [&grade_id=<uuid>] [&tipo=avaliacao|prova_fisica|frequencia_diaria]
 * - Todas as turmas: só test_id → resposta { turmas: [{ class_id, cabecalho, estudantes }, ...] }.
 * - Uma turma: test_id + class_id → resposta única { cabecalho, estudantes }.
 * - Filtrar por série: test_id + grade_id.
 */
export async function getListaFrequenciaPorAvaliacao(
  testId: string,
  classId?: string,
  options?: { grade_id?: string; tipo?: TipoListaFrequencia }
): Promise<ListaFrequenciaResponse> {
  const params: Record<string, string> = { test_id: testId };
  if (classId) params.class_id = classId;
  if (options?.grade_id) params.grade_id = options.grade_id;
  if (options?.tipo) params.tipo = options.tipo;
  const response = await api.get<ListaFrequenciaResponse>('lista-frequencia/', { params });
  return response.data;
}

/**
 * Todas as turmas da avaliação em uma única chamada.
 * GET /lista-frequencia/?test_id=<uuid> [&grade_id=<uuid_serie>] [&tipo=...]
 * Resposta: { turmas: [{ class_id, cabecalho, estudantes }, ...] }.
 * Retorna array no formato esperado pela página (um item por turma).
 */
export async function getListaFrequenciaPorAvaliacaoTodasTurmas(
  testId: string,
  options?: { grade_id?: string; tipo?: TipoListaFrequencia }
): Promise<ListaFrequenciaResponse[]> {
  const params: Record<string, string> = { test_id: testId };
  if (options?.grade_id) params.grade_id = options.grade_id;
  if (options?.tipo) params.tipo = options.tipo;
  const response = await api.get<ListaFrequenciaTurmasResponse>('lista-frequencia/', { params });
  return mapTurmasResponse(response.data);
}

/**
 * Lista de frequência para cartão resposta (gabarito). P/A conforme AnswerSheetResult.
 * GET /lista-frequencia/?gabarito_id=...&city_id=... [&class_id=...] [&grade_id=...] [&tipo=...]
 * - Uma turma: gabarito_id + city_id + class_id.
 * - Várias turmas (sem class_id): resposta { turmas: [...] } — use getListaFrequenciaPorGabaritoTodasTurmas.
 */
export async function getListaFrequenciaPorGabarito(
  gabaritoId: string,
  cityId: string,
  classId?: string,
  options?: { grade_id?: string; tipo?: TipoListaFrequencia }
): Promise<ListaFrequenciaResponse> {
  const params: Record<string, string> = { gabarito_id: gabaritoId, city_id: cityId };
  if (classId) params.class_id = classId;
  if (options?.grade_id) params.grade_id = options.grade_id;
  if (options?.tipo) params.tipo = options.tipo;
  const response = await api.get<ListaFrequenciaResponse>('lista-frequencia/', { params });
  return response.data;
}

/**
 * Todas as turmas do cartão (gabarito) numa única chamada.
 * GET /lista-frequencia/?gabarito_id=...&city_id=... [&grade_id=...] [&tipo=...]
 */
export async function getListaFrequenciaPorGabaritoTodasTurmas(
  gabaritoId: string,
  cityId: string,
  options?: { grade_id?: string; tipo?: TipoListaFrequencia }
): Promise<ListaFrequenciaResponse[]> {
  const params: Record<string, string> = { gabarito_id: gabaritoId, city_id: cityId };
  if (options?.grade_id) params.grade_id = options.grade_id;
  if (options?.tipo) params.tipo = options.tipo;
  const response = await api.get<ListaFrequenciaTurmasResponse>('lista-frequencia/', { params });
  return mapTurmasResponse(response.data);
}

/**
 * Todas as turmas de um município (modo por turma, sem avaliação aplicada) em uma única chamada.
 * GET /lista-frequencia/?city_id=... [&school_id=...] [&grade_id=...] [&tipo=...]
 */
export async function getListaFrequenciaPorMunicipioTodasTurmas(
  cityId: string,
  options?: { school_id?: string; grade_id?: string; tipo?: TipoListaFrequencia }
): Promise<ListaFrequenciaResponse[]> {
  const params: Record<string, string> = { city_id: cityId };
  if (options?.school_id) params.school_id = options.school_id;
  if (options?.grade_id) params.grade_id = options.grade_id;
  if (options?.tipo) params.tipo = options.tipo;
  const response = await api.get<ListaFrequenciaTurmasResponse>('lista-frequencia/', {
    params,
    timeout: 120_000,
  });
  return mapTurmasResponse(response.data);
}

/** @deprecated Use getListaFrequenciaPorTurma ou getListaFrequenciaPorAvaliacao. */
export async function getListaFrequencia(
  classId: string,
  tipo: TipoListaFrequencia = 'avaliacao'
): Promise<ListaFrequenciaResponse> {
  return getListaFrequenciaPorTurma(classId, tipo);
}
