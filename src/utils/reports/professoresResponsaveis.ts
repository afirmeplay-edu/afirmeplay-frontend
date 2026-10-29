import { api } from '@/lib/api';
import { getClassShiftLabel } from '@/lib/classShift';
import type { RelatorioConsolidado, SerieColuna } from '@/types/relatorio-consolidado';

export type ProfessorResponsavelTurma = {
  turma_id: string;
  turma_nome: string;
  serie_id: string;
  serie_nome: string;
  turno?: string | null;
};

export type ProfessorResponsavel = {
  teacher_id: string;
  user_id?: string;
  nome: string;
  email?: string;
  escola_id: string;
  escola_nome: string;
  turmas: ProfessorResponsavelTurma[];
};

export type RestricaoTurmasProfessor = {
  classIds: string[];
  classNameKeys: string[];
};

export type ProfessoresResponsaveisResult = {
  professores: ProfessorResponsavel[];
  aviso: string | null;
};

type EscolaRef = { id: string; nome: string };

type TurmaCadastro = {
  id: string;
  name: string;
  serieId: string;
  serieNome: string;
  shift: string | null;
};

const CLASS_CONCURRENCY = 6;
const SCHOOL_CONCURRENCY = 3;
const TEACHER_DETAIL_CONCURRENCY = 4;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstArray(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  const nested = asRecord(record.data);
  const sources = nested ? [record, nested] : [record];
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function cityConfig(municipioId?: string) {
  return municipioId && municipioId !== 'all' ? { meta: { cityId: municipioId } } : {};
}

function chaveSerieTurma(serie: string, turma: string): string {
  return `${serie.trim().toLocaleLowerCase('pt-BR')}|${turma.trim().toLocaleLowerCase('pt-BR')}`;
}

function nomeSerie(record: Record<string, unknown>): { id: string; nome: string } {
  const grade = asRecord(record.grade) ?? asRecord(record.serie);
  const id = clean(grade?.id ?? record.grade_id ?? record.serie_id);
  const nome = clean(
    typeof record.grade === 'string'
      ? record.grade
      : grade?.name ?? grade?.nome ?? record.grade_name ?? record.serie_nome ?? record.serie
  );
  return { id, nome };
}

function parseTurma(item: unknown): TurmaCadastro | null {
  const record = asRecord(item);
  if (!record) return null;
  const id = clean(record.id ?? record.class_id);
  if (!id) return null;
  const serie = nomeSerie(record);
  const shiftRaw = record.shift ?? record.turno;
  return {
    id,
    name: clean(record.name ?? record.nome ?? record.class_name ?? record.turma) || 'Turma',
    serieId: serie.id,
    serieNome: serie.nome,
    shift: shiftRaw == null ? null : clean(shiftRaw) || null,
  };
}

type DocenteBruto = {
  id: string;
  userId?: string;
  nome: string;
  email?: string;
};

function parseDocente(item: unknown): DocenteBruto | null {
  const record = asRecord(item);
  if (!record) return null;
  const professor = asRecord(record.professor) ?? asRecord(record.teacher);
  const usuario = asRecord(record.usuario) ?? asRecord(record.user);
  const id = clean(professor?.id ?? record.teacher_id ?? usuario?.id ?? record.id);
  const userId = clean(professor?.user_id ?? record.user_id ?? record.usuario_id ?? usuario?.id) || undefined;
  const nome = clean(
    professor?.name ?? professor?.nome ?? usuario?.name ?? usuario?.nome ?? record.name ?? record.nome
  );
  const email = clean(professor?.email ?? usuario?.email ?? record.email) || undefined;
  if (!id && !nome) return null;
  return {
    id: id || nome,
    userId,
    nome: nome || 'Professor',
    email,
  };
}

function turmaDentroDasSeries(
  turma: Pick<TurmaCadastro, 'serieId' | 'serieNome'>,
  serieIds: Set<string>,
  serieNomes: Set<string>
): boolean {
  if (serieIds.size === 0 && serieNomes.size === 0) return true;
  if (turma.serieId && serieIds.has(turma.serieId)) return true;
  const nome = turma.serieNome.toLocaleLowerCase('pt-BR');
  return Boolean(nome && serieNomes.has(nome));
}

function aplicarFiltroDeSeries(turmas: TurmaCadastro[], series: SerieColuna[]): TurmaCadastro[] {
  const serieIds = new Set(series.map((serie) => clean(serie.serie_id)).filter(Boolean));
  const serieNomes = new Set(
    series.map((serie) => clean(serie.serie_nome).toLocaleLowerCase('pt-BR')).filter(Boolean)
  );
  if (serieIds.size === 0 && serieNomes.size === 0) return turmas;
  const filtradas = turmas.filter((turma) => turmaDentroDasSeries(turma, serieIds, serieNomes));
  return filtradas.length > 0 ? filtradas : turmas;
}

function restringirTurmasDoProfessor(
  turmas: TurmaCadastro[],
  restricao: RestricaoTurmasProfessor | null | undefined
): { turmas: TurmaCadastro[]; semVinculo: boolean } {
  if (!restricao) return { turmas, semVinculo: false };
  const ids = new Set(restricao.classIds.map(clean).filter(Boolean));
  const chaves = new Set(restricao.classNameKeys.map((key) => key.toLocaleLowerCase('pt-BR')).filter(Boolean));
  if (ids.size === 0 && chaves.size === 0) return { turmas: [], semVinculo: true };

  const porId = new Map<string, TurmaCadastro>();
  for (const turma of turmas) {
    const bateId = ids.has(turma.id);
    const bateNome = chaves.has(chaveSerieTurma(turma.serieNome, turma.name));
    if (bateId || bateNome) porId.set(turma.id, turma);
  }
  if (porId.size === 0) return { turmas: [], semVinculo: true };
  return { turmas: [...porId.values()], semVinculo: false };
}

async function mapPool<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchTurmasDaEscola(schoolId: string, municipioId?: string): Promise<TurmaCadastro[]> {
  const response = await api.get(`/classes/school/${schoolId}`, cityConfig(municipioId));
  return firstArray(response.data, ['data', 'classes', 'turmas'])
    .map(parseTurma)
    .filter((turma): turma is TurmaCadastro => turma !== null);
}

async function fetchDocentesDaTurma(
  classId: string,
  municipioId?: string
): Promise<{ docentes: DocenteBruto[]; falhou: boolean }> {
  try {
    const response = await api.get(`/classes/${classId}/teachers`, cityConfig(municipioId));
    const docentes = firstArray(response.data, ['professores', 'teachers', 'data', 'vinculos'])
      .map(parseDocente)
      .filter((docente): docente is DocenteBruto => docente !== null);
    return { docentes, falhou: false };
  } catch {
    return { docentes: [], falhou: true };
  }
}

function extrairTurmasDoDetalhe(payload: unknown, schoolId: string): ProfessorResponsavelTurma[] {
  const record = asRecord(payload);
  if (!record) return [];
  const aninhado = asRecord(record.professor) ?? asRecord(record.data);
  const bruto = record.turmas ?? record.classes ?? aninhado?.turmas ?? aninhado?.classes;
  if (!Array.isArray(bruto)) return [];

  const turmas: ProfessorResponsavelTurma[] = [];
  for (const item of bruto) {
    const row = asRecord(item);
    if (!row) continue;
    const escolaId = clean(row.school_id ?? asRecord(row.school)?.id);
    if (escolaId && escolaId !== schoolId) continue;
    const parsed = parseTurma({
      id: row.class_id ?? row.id ?? asRecord(row.class)?.id,
      name: row.class_name ?? row.name ?? asRecord(row.class)?.name,
      grade_id: row.grade_id,
      grade_name: row.grade_name,
      grade: row.grade ?? asRecord(row.class)?.grade,
      shift: row.shift ?? row.turno,
    });
    if (!parsed) continue;
    turmas.push({
      turma_id: parsed.id,
      turma_nome: parsed.name,
      serie_id: parsed.serieId,
      serie_nome: parsed.serieNome,
      turno: parsed.shift,
    });
  }
  return turmas;
}

async function fetchFallbackPorProfessor(
  escola: EscolaRef,
  turmasConhecidas: TurmaCadastro[],
  municipioId: string | undefined,
  series: SerieColuna[],
  restricao: RestricaoTurmasProfessor | null | undefined
): Promise<ProfessorResponsavel[]> {
  const response = await api.get(`/teacher/school/${escola.id}`, cityConfig(municipioId));
  const docentes = firstArray(response.data, ['professores', 'teachers', 'data'])
    .map(parseDocente)
    .filter((docente): docente is DocenteBruto => docente !== null);

  const unicos = new Map<string, DocenteBruto>();
  for (const docente of docentes) {
    unicos.set(docente.email?.toLocaleLowerCase('pt-BR') || docente.id, docente);
  }

  const porTurma = new Map(turmasConhecidas.map((turma) => [turma.id, turma]));
  const detalhes = await mapPool([...unicos.values()], TEACHER_DETAIL_CONCURRENCY, async (docente) => {
    try {
      const byId = await api.get(`/teacher/${docente.id}`, cityConfig(municipioId));
      return { docente, payload: byId.data as unknown };
    } catch {
      if (!docente.userId || docente.userId === docente.id) return { docente, payload: null };
      try {
        const byUser = await api.get(`/teacher/${docente.userId}`, cityConfig(municipioId));
        return { docente, payload: byUser.data as unknown };
      } catch {
        return { docente, payload: null };
      }
    }
  });

  const acumulado = new Map<string, ProfessorResponsavel>();
  for (const { docente, payload } of detalhes) {
    if (!payload) continue;
    let turmas = extrairTurmasDoDetalhe(payload, escola.id).map((turma) => {
      const conhecida = porTurma.get(turma.turma_id);
      if (!conhecida) return turma;
      return {
        ...turma,
        turma_nome: conhecida.name || turma.turma_nome,
        serie_id: conhecida.serieId || turma.serie_id,
        serie_nome: conhecida.serieNome || turma.serie_nome,
        turno: conhecida.shift ?? turma.turno,
      };
    });

    const comoCadastro: TurmaCadastro[] = turmas.map((turma) => ({
      id: turma.turma_id,
      name: turma.turma_nome,
      serieId: turma.serie_id,
      serieNome: turma.serie_nome,
      shift: turma.turno ?? null,
    }));
    const restritas = restringirTurmasDoProfessor(comoCadastro, restricao);
    if (restritas.semVinculo) continue;
    const filtradas = aplicarFiltroDeSeries(restritas.turmas, series);
    turmas = filtradas.map((turma) => ({
      turma_id: turma.id,
      turma_nome: turma.name,
      serie_id: turma.serieId,
      serie_nome: turma.serieNome,
      turno: turma.shift,
    }));
    if (turmas.length === 0) continue;
    incorporarDocente(acumulado, escola, docente, turmas);
  }

  return [...acumulado.values()];
}

function incorporarDocente(
  destino: Map<string, ProfessorResponsavel>,
  escola: EscolaRef,
  docente: DocenteBruto,
  turmas: ProfessorResponsavelTurma[]
) {
  const chave = `${escola.id}::${(docente.email || docente.id).toLocaleLowerCase('pt-BR')}`;
  const atual = destino.get(chave);
  if (!atual) {
    destino.set(chave, {
      teacher_id: docente.id,
      user_id: docente.userId,
      nome: docente.nome,
      email: docente.email,
      escola_id: escola.id,
      escola_nome: escola.nome,
      turmas: deduplicarTurmas(turmas),
    });
    return;
  }
  atual.turmas = deduplicarTurmas([...atual.turmas, ...turmas]);
  if (!atual.user_id && docente.userId) atual.user_id = docente.userId;
  if (!atual.email && docente.email) atual.email = docente.email;
  if (atual.nome === 'Professor' && docente.nome) atual.nome = docente.nome;
}

function deduplicarTurmas(turmas: ProfessorResponsavelTurma[]): ProfessorResponsavelTurma[] {
  const map = new Map<string, ProfessorResponsavelTurma>();
  for (const turma of turmas) {
    const chave = turma.turma_id || chaveSerieTurma(turma.serie_nome, turma.turma_nome);
    const previa = map.get(chave);
    if (!previa) {
      map.set(chave, turma);
      continue;
    }
    map.set(chave, {
      ...previa,
      serie_id: previa.serie_id || turma.serie_id,
      serie_nome: previa.serie_nome || turma.serie_nome,
      turma_nome: previa.turma_nome || turma.turma_nome,
      turno: previa.turno || turma.turno,
    });
  }
  return [...map.values()].sort((a, b) => {
    const serie = a.serie_nome.localeCompare(b.serie_nome, 'pt-BR', { numeric: true });
    if (serie !== 0) return serie;
    return a.turma_nome.localeCompare(b.turma_nome, 'pt-BR', { numeric: true });
  });
}

type ResultadoEscola = {
  professores: ProfessorResponsavel[];
  semVinculo: boolean;
  falhou: boolean;
};

async function fetchProfessoresDaEscola(
  escola: EscolaRef,
  municipioId: string | undefined,
  series: SerieColuna[],
  restricao: RestricaoTurmasProfessor | null | undefined
): Promise<ResultadoEscola> {
  const turmasEscola = await fetchTurmasDaEscola(escola.id, municipioId);
  const restritas = restringirTurmasDoProfessor(turmasEscola, restricao);
  if (restritas.semVinculo) {
    try {
      const professores = await fetchFallbackPorProfessor(
        escola,
        turmasEscola,
        municipioId,
        series,
        restricao
      );
      if (professores.length > 0) return { professores, semVinculo: false, falhou: false };
    } catch {
      // segue com o aviso de vínculo não identificado
    }
    return { professores: [], semVinculo: true, falhou: false };
  }
  const turmas = aplicarFiltroDeSeries(restritas.turmas, series);
  if (turmas.length === 0) return { professores: [], semVinculo: false, falhou: false };

  const porTurma = await mapPool(turmas, CLASS_CONCURRENCY, async (turma) => {
    const resultado = await fetchDocentesDaTurma(turma.id, municipioId);
    return { turma, ...resultado };
  });

  const acumulado = new Map<string, ProfessorResponsavel>();
  let falhas = 0;
  for (const item of porTurma) {
    if (item.falhou) falhas += 1;
    const turmaResp: ProfessorResponsavelTurma = {
      turma_id: item.turma.id,
      turma_nome: item.turma.name,
      serie_id: item.turma.serieId,
      serie_nome: item.turma.serieNome,
      turno: item.turma.shift,
    };
    for (const docente of item.docentes) {
      incorporarDocente(acumulado, escola, docente, [turmaResp]);
    }
  }

  if (acumulado.size === 0 && falhas === turmas.length) {
    const professores = await fetchFallbackPorProfessor(escola, turmasEscola, municipioId, series, restricao);
    return { professores, semVinculo: false, falhou: false };
  }

  return { professores: [...acumulado.values()], semVinculo: false, falhou: false };
}

function ordenarProfessores(lista: ProfessorResponsavel[]): ProfessorResponsavel[] {
  return [...lista].sort((a, b) => {
    const escola = a.escola_nome.localeCompare(b.escola_nome, 'pt-BR', { sensitivity: 'base' });
    if (escola !== 0) return escola;
    return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
  });
}

export function escolasDoRelatorio(
  report: Pick<RelatorioConsolidado, 'series_aplicadas' | 'consolidado_frequencia'>,
  escolaId: string,
  escolaNome: string
): EscolaRef[] {
  if (escolaId && escolaId !== 'all') {
    return [{ id: escolaId, nome: clean(escolaNome) || 'Escola' }];
  }

  const map = new Map<string, string>();
  const push = (id: unknown, nome: unknown) => {
    const schoolId = clean(id);
    const schoolName = clean(nome);
    if (!schoolId || schoolId === 'all') return;
    if (/m[eé]dia da rede/i.test(schoolName)) return;
    if (!map.has(schoolId)) map.set(schoolId, schoolName || 'Escola');
  };

  for (const row of report.series_aplicadas ?? []) {
    push(row.escola_id, row.escola_nome);
  }
  for (const linha of report.consolidado_frequencia?.GERAL?.linhas ?? []) {
    push(linha.escola_id, linha.escola_nome);
  }

  return [...map.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}

/** Professores da escola com as séries e turmas já vinculadas. */
export async function listarProfessoresComTurmas(
  schoolId: string,
  municipioId?: string
): Promise<ProfessorResponsavel[]> {
  const id = clean(schoolId);
  if (!id) return [];
  const resultado = await fetchProfessoresDaEscola({ id, nome: "Escola" }, municipioId, [], null);
  return ordenarProfessores(resultado.professores);
}

export function rotulosSeries(professor: ProfessorResponsavel): string[] {
  const nomes = new Map<string, string>();
  for (const turma of professor.turmas) {
    const nome = clean(turma.serie_nome);
    if (!nome) continue;
    nomes.set(nome.toLocaleLowerCase('pt-BR'), nome);
  }
  return [...nomes.values()].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

export function rotuloTurma(turma: ProfessorResponsavelTurma): string {
  const turnoBruto = clean(turma.turno);
  const turno = turnoBruto ? getClassShiftLabel(turnoBruto) : '';
  const turnoTxt = turno && turno !== 'Sem turno' ? ` (${turno})` : '';
  if (turma.serie_nome && turma.turma_nome) {
    return `${turma.serie_nome} — ${turma.turma_nome}${turnoTxt}`;
  }
  return `${turma.turma_nome || turma.serie_nome || 'Turma'}${turnoTxt}`;
}

export function rotulosTurmas(professor: ProfessorResponsavel): string[] {
  return professor.turmas.map(rotuloTurma);
}

const AVISO_SEM_VINCULO_PROFESSOR =
  'Não foi possível identificar as turmas do seu vínculo para listar as séries sob sua responsabilidade.';

const AVISO_SEM_PROFESSORES =
  'Nenhum professor vinculado às séries e turmas deste recorte.';

export async function fetchProfessoresResponsaveis(params: {
  escolas: EscolaRef[];
  municipioId?: string;
  series: SerieColuna[];
  restricaoProfessor?: RestricaoTurmasProfessor | null;
}): Promise<ProfessoresResponsaveisResult> {
  const escolas = params.escolas.filter((escola) => clean(escola.id));
  if (escolas.length === 0) {
    return {
      professores: [],
      aviso: 'Nenhuma escola no recorte para localizar os professores responsáveis.',
    };
  }

  if (
    params.restricaoProfessor &&
    params.restricaoProfessor.classIds.length === 0 &&
    params.restricaoProfessor.classNameKeys.length === 0
  ) {
    return { professores: [], aviso: AVISO_SEM_VINCULO_PROFESSOR };
  }

  const resultados = await mapPool(escolas, SCHOOL_CONCURRENCY, async (escola) => {
    try {
      return await fetchProfessoresDaEscola(
        escola,
        params.municipioId,
        params.series,
        params.restricaoProfessor
      );
    } catch {
      return { professores: [] as ProfessorResponsavel[], semVinculo: false, falhou: true };
    }
  });

  const professores = ordenarProfessores(resultados.flatMap((item) => item.professores));
  const todasFalharam = resultados.length > 0 && resultados.every((item) => item.falhou);
  if (todasFalharam) {
    throw new Error('Não foi possível carregar professores e turmas.');
  }

  const consultadas = resultados.filter((item) => !item.falhou);
  if (
    professores.length === 0 &&
    params.restricaoProfessor &&
    consultadas.length > 0 &&
    consultadas.every((item) => item.semVinculo)
  ) {
    return { professores: [], aviso: AVISO_SEM_VINCULO_PROFESSOR };
  }

  return {
    professores,
    aviso: professores.length === 0 ? AVISO_SEM_PROFESSORES : null,
  };
}
