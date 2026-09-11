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
] as const;

const PROFICIENCIA_KEYS = [
  'proficiencia',
  'media_proficiencia',
  'proficiencia_disciplina',
  'proficiencia_geral',
  'mediaProficiencia',
] as const;

const NIVEL_KEYS = [
  'nivel',
  'nivel_geral',
  'nivel_proficiencia',
  'nivel_proficiencia_geral',
  'classificacao',
  'classificacao_geral',
  'nivelProficiencia',
] as const;

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
    row.resposta ?? row.alternativa ?? row.alternativa_marcada ?? row.answer ?? row.marcada ?? null;
  let resposta: string | null =
    respostaRaw == null || respostaRaw === '' ? null : String(respostaRaw).trim().toUpperCase();
  if (resposta === '—' || resposta === '-' || resposta === 'NULL' || resposta === 'NONE') {
    resposta = null;
  } else if (resposta && !/^[A-E]$/.test(resposta)) {
    const match = resposta.match(/[A-E]/);
    resposta = match ? match[0] : null;
  }

  const gabaritoRaw =
    row.gabarito ?? row.resposta_correta ?? row.alternativa_correta ?? row.correct_answer ?? '';
  const gabarito = String(gabaritoRaw || '')
    .trim()
    .toUpperCase();

  const acertouExplicit =
    toBool(row.acertou) ??
    toBool(row.is_correct) ??
    toBool(row.correta) ??
    toBool(row.correct);
  const respondeuExplicit =
    toBool(row.respondeu) ??
    toBool(row.has_answer) ??
    toBool(row.answered) ??
    toBool(row.respondida);

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
  const acertosObj = asRecord(nested.acertos_totais);

  const acertouFinal =
    toFiniteNumber(acertosObj.acertou) ??
    pickNumber(sources, ['acertos', 'total_acertos']) ??
    fromQuestoes.acertou;

  const total =
    toFiniteNumber(acertosObj.total) ??
    pickNumber(sources, ['total', 'total_questoes', 'total_questoes_disciplina']) ??
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
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = asRecord(item);
    const questoes = (Array.isArray(row.questoes) ? row.questoes : [])
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
}

export function normalizeBoletimAlunoItem(raw: unknown): BoletimAlunoItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = asRecord(raw);
  const alunoRaw = asRecord(item.aluno);
  const por_disciplina = normalizePorDisciplina(item.por_disciplina);
  const cards = normalizeCards(item.cards, por_disciplina.flatMap((b) => b.questoes));
  return {
    aluno: {
      id: String(alunoRaw.id ?? ''),
      nome: String(alunoRaw.nome ?? alunoRaw.name ?? ''),
      matricula:
        alunoRaw.matricula != null ? String(alunoRaw.matricula) : undefined,
      escola: alunoRaw.escola != null ? String(alunoRaw.escola) : undefined,
      serie: alunoRaw.serie != null ? String(alunoRaw.serie) : undefined,
      turma: alunoRaw.turma != null ? String(alunoRaw.turma) : undefined,
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
