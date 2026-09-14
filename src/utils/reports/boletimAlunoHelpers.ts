import type {
  BoletimAlunoCards,
  BoletimAlunoItem,
  BoletimAlunoPorDisciplina,
  BoletimAlunoQuestao,
} from '@/types/boletim-aluno';

export type BoletimMarkStatus = 'correct' | 'wrong' | 'empty';

export function questionAlternativeLetters(questoes: BoletimAlunoQuestao[] | undefined): string[] {
  const letters: string[] = [];
  for (const q of questoes ?? []) {
    if (q.gabarito && /^[A-E]$/i.test(q.gabarito)) letters.push(q.gabarito.toUpperCase());
    if (q.resposta && /^[A-E]$/i.test(q.resposta)) letters.push(q.resposta.toUpperCase());
  }
  const lastCode = Math.max('D'.charCodeAt(0), ...letters.map((letter) => letter.charCodeAt(0)));
  const out: string[] = [];
  for (let code = 65; code <= lastCode && code <= 69; code++) {
    out.push(String.fromCharCode(code));
  }
  return out;
}

export function getBoletimMarkStatus(questao: BoletimAlunoQuestao, letter: string): BoletimMarkStatus {
  if (!questao.respondeu || !questao.resposta) return 'empty';
  if (questao.resposta.toUpperCase() !== letter.toUpperCase()) return 'empty';
  return questao.acertou ? 'correct' : 'wrong';
}

export function alunoPickerLabel(aluno: {
  nome: string;
  serie?: string;
  turma?: string;
  matricula?: string;
}): string {
  const parts = [aluno.nome];
  const extra = [aluno.serie, aluno.turma].filter(Boolean).join(' · ');
  if (extra) parts.push(extra);
  return parts.join(' — ');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNivel(value: unknown): string {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s || s === '—' || s === '-') return '';
  return s;
}

function toBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'True') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'False') return false;
  return null;
}

/** Lê o primeiro número finito entre chaves candidatas (contrato parcial / aliases). */
function pickNumber(sources: Array<Record<string, unknown>>, keys: string[]): number | null {
  for (const src of sources) {
    for (const key of keys) {
      const n = toFiniteNumber(src[key]);
      if (n != null) return n;
    }
  }
  return null;
}

/** Lê o primeiro nível/classificação não vazio entre chaves candidatas. */
function pickNivel(sources: Array<Record<string, unknown>>, keys: string[]): string {
  for (const src of sources) {
    for (const key of keys) {
      const nivel = toNivel(src[key]);
      if (nivel) return nivel;
    }
  }
  return '';
}

function acertosFromQuestoes(questoes: BoletimAlunoQuestao[] | undefined): {
  acertou: number;
  total: number;
  percentual: number;
} {
  const list = Array.isArray(questoes) ? questoes : [];
  const total = list.length;
  const acertou = list.filter((q) => q?.acertou === true).length;
  const percentual = total > 0 ? (acertou / total) * 100 : 0;
  return { acertou, total, percentual };
}

const NOTA_KEYS = [
  'nota',
  'media_nota',
  'nota_disciplina',
  'nota_geral',
  'mediaNota',
  'score',
  'grade',
] as const;

const PROFICIENCIA_KEYS = [
  'proficiencia',
  'media_proficiencia',
  'proficiencia_disciplina',
  'proficiencia_geral',
  'mediaProficiencia',
  'proficiency',
  'theta',
] as const;

const NIVEL_KEYS = [
  'nivel',
  'nivel_geral',
  'nivel_proficiencia',
  'nivel_proficiencia_geral',
  'classificacao',
  'classificacao_geral',
  'nivelProficiencia',
  'level',
  'faixa',
  'faixa_proficiencia',
] as const;

function isDisciplinaGeralNome(nome: string | undefined | null): boolean {
  const n = String(nome ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return n === 'geral' || n === 'geral agregado' || n === 'resultado geral';
}

/** Prefere o card com mais métricas preenchidas (útil ao mesclar fragmentos). */
function preferRicherCards(
  a: BoletimAlunoCards | null | undefined,
  b: BoletimAlunoCards | null | undefined
): BoletimAlunoCards | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  const score = (c: BoletimAlunoCards) =>
    (c.nota != null ? 2 : 0) +
    (c.proficiencia != null ? 2 : 0) +
    (c.nivel ? 2 : 0) +
    (c.acertos_totais?.total > 0 ? 1 : 0);
  return score(b) > score(a) ? b : a;
}

/**
 * Agrupa blocos fragmentados da mesma disciplina (mesmo id/nome),
 * concatena questões e re-resolve os cards a partir do bloco unificado.
 */
export function mergeBlocosByDisciplina(
  blocos: BoletimAlunoPorDisciplina[]
): BoletimAlunoPorDisciplina[] {
  const order: string[] = [];
  const map = new Map<string, BoletimAlunoPorDisciplina>();

  for (const bloco of blocos) {
    const key = String(bloco.disciplina_id || bloco.disciplina || '').trim() || '__sem_disciplina__';
    const existing = map.get(key);
    if (!existing) {
      order.push(key);
      map.set(key, { ...bloco, questoes: [...(bloco.questoes ?? [])] });
      continue;
    }
    existing.questoes = [...existing.questoes, ...(bloco.questoes ?? [])];
    existing.cards = preferRicherCards(existing.cards, bloco.cards);
    if (existing.nota == null && bloco.nota != null) existing.nota = bloco.nota;
    if (existing.proficiencia == null && bloco.proficiencia != null) {
      existing.proficiencia = bloco.proficiencia;
    }
    if (!existing.nivel && bloco.nivel) existing.nivel = bloco.nivel;
    if (existing.acertos == null && bloco.acertos != null) existing.acertos = bloco.acertos;
    if (existing.total_questoes == null && bloco.total_questoes != null) {
      existing.total_questoes = bloco.total_questoes;
    }
    if (existing.percentual == null && bloco.percentual != null) {
      existing.percentual = bloco.percentual;
    }
  }

  return order.map((key) => {
    const merged = map.get(key)!;
    merged.questoes = [...merged.questoes].sort((a, b) => a.numero - b.numero);
    const cards = resolveDisciplinaCards(merged);
    return {
      ...merged,
      cards: cards ?? merged.cards,
      nota: cards?.nota ?? merged.nota,
      proficiencia: cards?.proficiencia ?? merged.proficiencia,
      nivel: cards?.nivel || merged.nivel,
      acertos: cards?.acertos_totais.acertou ?? merged.acertos,
      total_questoes: cards?.acertos_totais.total ?? merged.total_questoes,
      percentual: cards?.acertos_totais.percentual ?? merged.percentual,
    };
  });
}

function porDisciplinaAsArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).map(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const row = value as Record<string, unknown>;
        return {
          disciplina_id: row.disciplina_id ?? row.id ?? key,
          disciplina: row.disciplina ?? row.nome ?? row.name ?? key,
          ...row,
        };
      }
      return { disciplina_id: key, disciplina: key, questoes: [] };
    });
  }
  return [];
}

/**
 * Normaliza uma questão do boletim aceitando aliases comuns da API.
 */
export function normalizeBoletimAlunoQuestao(raw: unknown): BoletimAlunoQuestao | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = asRecord(raw);

  const numero =
    toFiniteNumber(row.numero) ??
    toFiniteNumber(row.number) ??
    toFiniteNumber(row.questao_numero) ??
    toFiniteNumber(row.ordem) ??
    toFiniteNumber(row.posicao);
  if (numero == null) return null;

  const respostaRaw =
    row.resposta ??
    row.alternativa ??
    row.alternativa_marcada ??
    row.student_answer ??
    row.answer ??
    row.marcada ??
    row.resposta_aluno ??
    null;
  let resposta: string | null =
    respostaRaw == null || respostaRaw === '' ? null : String(respostaRaw).trim().toUpperCase();
  if (resposta === '—' || resposta === '-' || resposta === 'NULL' || resposta === 'NONE') {
    resposta = null;
  } else if (resposta && !/^[A-E]$/.test(resposta)) {
    const match = resposta.match(/[A-E]/);
    resposta = match ? match[0] : null;
  }

  const gabaritoRaw =
    row.gabarito ??
    row.resposta_correta ??
    row.alternativa_correta ??
    row.correct_answer ??
    row.gabarito_oficial ??
    '';
  const gabarito = String(gabaritoRaw || '')
    .trim()
    .toUpperCase();

  const acertouExplicit =
    toBool(row.acertou) ??
    toBool(row.is_correct) ??
    toBool(row.correta) ??
    toBool(row.correct) ??
    toBool(row.acerto);
  const respondeuExplicit =
    toBool(row.respondeu) ??
    toBool(row.has_answer) ??
    toBool(row.answered) ??
    toBool(row.respondida) ??
    toBool(row.foi_respondida);

  const respondeu = respondeuExplicit ?? Boolean(resposta);
  const acertou =
    acertouExplicit ??
    (respondeu && resposta && gabarito
      ? resposta.toUpperCase() === gabarito.toUpperCase()
      : false);

  return {
    numero,
    habilidade:
      row.habilidade != null
        ? String(row.habilidade)
        : row.skill != null
          ? String(row.skill)
          : undefined,
    resposta,
    gabarito,
    acertou,
    respondeu,
  };
}

/**
 * Unifica métricas por disciplina a partir de `cards` aninhado, campos flat,
 * aliases do backend (`media_proficiencia`, `nivel_proficiencia`, `classificacao`…)
 * ou contagem das questões (fallback só para acertos).
 */
export function resolveDisciplinaCards(
  bloco: BoletimAlunoPorDisciplina | null | undefined
): BoletimAlunoCards | null {
  if (!bloco) return null;

  const fromQuestoes = acertosFromQuestoes(bloco.questoes);
  const root = asRecord(bloco);
  const nested = asRecord(bloco.cards);
  const nestedResultado = asRecord(root.resultado ?? nested.resultado);
  const nestedMetricas = asRecord(root.metricas ?? nested.metricas ?? root.resumo ?? nested.resumo);
  const sources = [nested, nestedResultado, nestedMetricas, root];
  const acertosObj = asRecord(
    nested.acertos_totais ?? root.acertos_totais ?? nestedResultado.acertos_totais
  );

  const acertouFinal =
    toFiniteNumber(acertosObj.acertou) ??
    pickNumber(sources, ['acertou', 'acertos', 'total_acertos', 'qtd_acertos']) ??
    fromQuestoes.acertou;

  const total =
    toFiniteNumber(acertosObj.total) ??
    pickNumber(sources, ['total', 'total_questoes', 'total_questoes_disciplina', 'qtd_questoes']) ??
    fromQuestoes.total;

  const percentual =
    toFiniteNumber(acertosObj.percentual) ??
    pickNumber(sources, ['percentual', 'percentual_acertos']) ??
    (total > 0 ? (acertouFinal / total) * 100 : 0);

  const nota = pickNumber(sources, [...NOTA_KEYS]);
  const proficiencia = pickNumber(sources, [...PROFICIENCIA_KEYS]);
  const nivel = pickNivel(sources, [...NIVEL_KEYS]);

  const hasAnyMetric =
    // Só acertos_totais já basta (fallback do backend / cartão sem Parte 2b).
    total > 0 ||
    nota != null ||
    proficiencia != null ||
    Boolean(nivel) ||
    (Array.isArray(bloco.questoes) && bloco.questoes.length > 0);

  if (!hasAnyMetric) return null;

  return {
    acertos_totais: { acertou: acertouFinal, total, percentual },
    nota,
    proficiencia,
    nivel,
  };
}

function normalizeCards(raw: unknown, questoesFallback?: BoletimAlunoQuestao[]): BoletimAlunoCards {
  const data = asRecord(raw);
  const acertosObj = asRecord(data.acertos_totais);
  const nestedResultado = asRecord(data.resultado);
  const nestedMetricas = asRecord(data.metricas ?? data.resumo);
  const sources = [data, nestedResultado, nestedMetricas, acertosObj];
  const fromQ = acertosFromQuestoes(questoesFallback);

  const acertou =
    toFiniteNumber(acertosObj.acertou) ??
    pickNumber(sources, ['acertou', 'acertos', 'total_acertos']) ??
    fromQ.acertou;
  const total =
    toFiniteNumber(acertosObj.total) ??
    pickNumber(sources, ['total', 'total_questoes', 'total_questoes_geral']) ??
    fromQ.total;
  const percentual =
    toFiniteNumber(acertosObj.percentual) ??
    pickNumber(sources, ['percentual', 'percentual_acertos']) ??
    (total > 0 ? (acertou / total) * 100 : 0);

  return {
    acertos_totais: { acertou, total, percentual },
    nota: pickNumber(sources, [...NOTA_KEYS]),
    proficiencia: pickNumber(sources, [...PROFICIENCIA_KEYS]),
    nivel: pickNivel(sources, [...NIVEL_KEYS]),
  };
}

function normalizePorDisciplina(raw: unknown): BoletimAlunoPorDisciplina[] {
  const list = porDisciplinaAsArray(raw);
  const normalized = list.map((item) => {
    const row = asRecord(item);
    const questoesRaw = Array.isArray(row.questoes)
      ? row.questoes
      : Array.isArray(row.questions)
        ? row.questions
        : Array.isArray(row.items)
          ? row.items
          : [];
    const questoes = questoesRaw
      .map((q) => normalizeBoletimAlunoQuestao(q))
      .filter((q): q is BoletimAlunoQuestao => q != null);

    const cards = resolveDisciplinaCards({
      ...(row as unknown as BoletimAlunoPorDisciplina),
      questoes,
      cards: row.cards as BoletimAlunoCards | undefined,
    });

    return {
      disciplina_id: String(row.disciplina_id ?? row.id ?? ''),
      disciplina: String(row.disciplina ?? row.nome ?? row.name ?? ''),
      questoes,
      cards: cards ?? undefined,
      nota: cards?.nota ?? pickNumber([row], [...NOTA_KEYS]),
      proficiencia: cards?.proficiencia ?? pickNumber([row], [...PROFICIENCIA_KEYS]),
      nivel: cards?.nivel || pickNivel([row], [...NIVEL_KEYS]) || undefined,
      acertos: cards?.acertos_totais.acertou ?? toFiniteNumber(row.acertos),
      total_questoes: cards?.acertos_totais.total ?? toFiniteNumber(row.total_questoes),
      percentual: cards?.acertos_totais.percentual ?? toFiniteNumber(row.percentual),
    };
  });

  return mergeBlocosByDisciplina(normalized);
}

function fillMissingCardFields(
  base: BoletimAlunoCards,
  fallback: BoletimAlunoCards | null | undefined
): BoletimAlunoCards {
  if (!fallback) return base;
  return {
    acertos_totais: {
      acertou:
        base.acertos_totais.total > 0
          ? base.acertos_totais.acertou
          : fallback.acertos_totais.acertou,
      total:
        base.acertos_totais.total > 0
          ? base.acertos_totais.total
          : fallback.acertos_totais.total,
      percentual:
        base.acertos_totais.total > 0
          ? base.acertos_totais.percentual
          : fallback.acertos_totais.percentual,
    },
    nota: base.nota ?? fallback.nota,
    proficiencia: base.proficiencia ?? fallback.proficiencia,
    nivel: base.nivel || fallback.nivel,
  };
}

export function normalizeBoletimAlunoItem(raw: unknown): BoletimAlunoItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = asRecord(raw);
  const alunoRaw = asRecord(item.aluno);
  const porDisciplinaRaw =
    item.por_disciplina ?? item.disciplinas ?? item.resultados_por_disciplina;

  const allBlocos = normalizePorDisciplina(porDisciplinaRaw);
  const geralBloco = allBlocos.find((b) => isDisciplinaGeralNome(b.disciplina));
  const por_disciplina = allBlocos.filter((b) => !isDisciplinaGeralNome(b.disciplina));

  const questoesFallback = por_disciplina.flatMap((b) => b.questoes);
  const primaryCards = normalizeCards(item.cards, questoesFallback);
  const fromResultado = normalizeCards(item.resultado ?? item.metricas ?? item.resumo, questoesFallback);
  const fromRootFlat = normalizeCards(item, questoesFallback);
  const cards = fillMissingCardFields(
    fillMissingCardFields(fillMissingCardFields(primaryCards, fromResultado), fromRootFlat),
    geralBloco ? resolveDisciplinaCards(geralBloco) : null
  );

  return {
    aluno: {
      id: String(alunoRaw.id ?? item.aluno_id ?? ''),
      nome: String(alunoRaw.nome ?? alunoRaw.name ?? item.aluno_nome ?? ''),
      matricula:
        alunoRaw.matricula != null
          ? String(alunoRaw.matricula)
          : item.matricula != null
            ? String(item.matricula)
            : undefined,
      escola:
        alunoRaw.escola != null
          ? String(alunoRaw.escola)
          : item.escola != null
            ? String(item.escola)
            : undefined,
      serie:
        alunoRaw.serie != null
          ? String(alunoRaw.serie)
          : item.serie != null
            ? String(item.serie)
            : undefined,
      turma:
        alunoRaw.turma != null
          ? String(alunoRaw.turma)
          : item.turma != null
            ? String(item.turma)
            : undefined,
    },
    por_disciplina,
    cards,
  };
}

export function normalizeBoletimAlunoBoletins(raw: unknown): BoletimAlunoItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizeBoletimAlunoItem(item))
    .filter((item): item is BoletimAlunoItem => item != null);
}
