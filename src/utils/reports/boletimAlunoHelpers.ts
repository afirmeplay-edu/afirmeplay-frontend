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

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNivel(value: unknown): string {
  if (value == null) return '';
  const s = String(value).trim();
  return s;
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

/**
 * Unifica métricas por disciplina a partir de `cards` aninhado, campos flat
 * ou contagem das questões (fallback só para acertos).
 * Nota/proficiência/nível só aparecem se a API enviar — não inventamos valores.
 */
export function resolveDisciplinaCards(
  bloco: BoletimAlunoPorDisciplina | null | undefined
): BoletimAlunoCards | null {
  if (!bloco) return null;

  const fromQuestoes = acertosFromQuestoes(bloco.questoes);
  const nested = bloco.cards;

  const acertou =
    toFiniteNumber(nested?.acertos_totais?.acertou) ??
    toFiniteNumber(bloco.acertos) ??
    fromQuestoes.acertou;

  const total =
    toFiniteNumber(nested?.acertos_totais?.total) ??
    toFiniteNumber(bloco.total_questoes) ??
    fromQuestoes.total;

  const percentual =
    toFiniteNumber(nested?.acertos_totais?.percentual) ??
    toFiniteNumber(bloco.percentual) ??
    (total > 0 ? (acertou / total) * 100 : 0);

  const nota = toFiniteNumber(nested?.nota) ?? toFiniteNumber(bloco.nota);
  const proficiencia =
    toFiniteNumber(nested?.proficiencia) ?? toFiniteNumber(bloco.proficiencia);
  const nivel = toNivel(nested?.nivel) || toNivel(bloco.nivel);

  const hasAnyMetric =
    total > 0 ||
    nota != null ||
    proficiencia != null ||
    Boolean(nivel) ||
    (Array.isArray(bloco.questoes) && bloco.questoes.length > 0);

  if (!hasAnyMetric) return null;

  return {
    acertos_totais: { acertou, total, percentual },
    nota,
    proficiencia,
    nivel,
  };
}

function normalizeCards(raw: unknown, questoesFallback?: BoletimAlunoQuestao[]): BoletimAlunoCards {
  const data = (raw ?? {}) as Partial<BoletimAlunoCards> & {
    acertos?: number;
    total?: number;
    total_questoes?: number;
    percentual?: number;
  };
  const fromQ = acertosFromQuestoes(questoesFallback);

  const acertou =
    toFiniteNumber(data.acertos_totais?.acertou) ??
    toFiniteNumber(data.acertos) ??
    fromQ.acertou;
  const total =
    toFiniteNumber(data.acertos_totais?.total) ??
    toFiniteNumber(data.total) ??
    toFiniteNumber(data.total_questoes) ??
    fromQ.total;
  const percentual =
    toFiniteNumber(data.acertos_totais?.percentual) ??
    toFiniteNumber(data.percentual) ??
    (total > 0 ? (acertou / total) * 100 : 0);

  return {
    acertos_totais: { acertou, total, percentual },
    nota: toFiniteNumber(data.nota),
    proficiencia: toFiniteNumber(data.proficiencia),
    nivel: toNivel(data.nivel),
  };
}

function normalizePorDisciplina(raw: unknown): BoletimAlunoPorDisciplina[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = (item ?? {}) as BoletimAlunoPorDisciplina;
    const questoes = Array.isArray(row.questoes) ? row.questoes : [];
    const cards = resolveDisciplinaCards({
      ...row,
      questoes,
    });
    return {
      disciplina_id: String(row.disciplina_id ?? ''),
      disciplina: String(row.disciplina ?? ''),
      questoes,
      cards: cards ?? undefined,
      nota: cards?.nota ?? toFiniteNumber(row.nota),
      proficiencia: cards?.proficiencia ?? toFiniteNumber(row.proficiencia),
      nivel: cards?.nivel || toNivel(row.nivel) || undefined,
      acertos: cards?.acertos_totais.acertou ?? toFiniteNumber(row.acertos),
      total_questoes: cards?.acertos_totais.total ?? toFiniteNumber(row.total_questoes),
      percentual: cards?.acertos_totais.percentual ?? toFiniteNumber(row.percentual),
    };
  });
}

export function normalizeBoletimAlunoItem(raw: unknown): BoletimAlunoItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as BoletimAlunoItem;
  const aluno = item.aluno ?? ({ id: '', nome: '' } as BoletimAlunoItem['aluno']);
  const por_disciplina = normalizePorDisciplina(item.por_disciplina);
  const cards = normalizeCards(item.cards, por_disciplina.flatMap((b) => b.questoes));
  return {
    aluno: {
      id: String(aluno.id ?? ''),
      nome: aluno.nome ?? '',
      matricula: aluno.matricula,
      escola: aluno.escola,
      serie: aluno.serie,
      turma: aluno.turma,
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
