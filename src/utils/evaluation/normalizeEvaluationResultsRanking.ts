/**
 * Normaliza o array `ranking` das rotas de resultados agregados
 * (`/evaluation-results/avaliacoes`, `/answer-sheets/resultados-agregados`, etc.)
 * — formato plano (RankingItem / cartão-resposta) ou aninhado com `aluno` + `posicao`.
 * Ordem relativa: `posicao` do backend; mantém participantes mesmo com nota/proficiência 0,
 * desde que `status` (ou `status_geral`) indique avaliação concluída (ou omitido —
 * tratado como concluída por compatibilidade). Exclui não participantes (ex.: pendente).
 * Posições exibidas são renumeradas 1..n na ordem resultante.
 */

export type EvaluationResultsRankingStudentRow = {
  id: string;
  nome: string;
  turma: string;
  escola: string;
  serie: string;
  nota: number;
  proficiencia: number;
  /** Rótulo de nível como veio da API (pode ser vazio se `null`). */
  classificacao: string;
  questoes_respondidas: number;
  acertos: number;
  erros: number;
  em_branco: number;
  tempo_gasto: number;
  status: 'concluida' | 'pendente';
  posicao: number;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

function participationStatusFromSource(src: Record<string, unknown>): 'concluida' | 'pendente' {
  const raw = str(src.status ?? src.status_geral);
  if (!raw) return 'concluida';
  const low = raw.toLowerCase();
  if (
    low === 'concluida' ||
    low === 'concluída' ||
    low === 'concluido' ||
    low === 'concluído' ||
    low === 'finalizada' ||
    low === 'finalizado'
  ) {
    return 'concluida';
  }
  return 'pendente';
}

/** Item aninhado: `status` no wrapper tem precedência sobre o objeto `aluno`. */
function participationStatusForNestedEntry(
  outer: Record<string, unknown>,
  nested: Record<string, unknown>
): 'concluida' | 'pendente' {
  if (str(outer.status ?? outer.status_geral)) return participationStatusFromSource(outer);
  return participationStatusFromSource(nested);
}

/** Inclui concluídos com nota/proficiência finitas ≥ 0; nível vazio não descarta linha. */
function rowEligibleForRanking(r: EvaluationResultsRankingStudentRow): boolean {
  if (r.status !== 'concluida') return false;
  if (!Number.isFinite(r.nota) || !Number.isFinite(r.proficiencia)) return false;
  return r.nota >= 0 && r.proficiencia >= 0;
}

/**
 * Converte cada entrada do `ranking` da API numa linha única por aluno,
 * ordenada por `posicao` ascendente (critério do servidor).
 */
export function normalizeEvaluationResultsRanking(raw: unknown[]): EvaluationResultsRankingStudentRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const rows: EvaluationResultsRankingStudentRow[] = [];

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const row = asRecord(item);
    if (!row) continue;

    const posicao = num(row.posicao, 0) || i + 1;
    const nested = asRecord(row.aluno);

    if (nested) {
      const id = str(nested.id) || str(nested.aluno_id);
      const nome = str(nested.nome);
      if (!id && !nome) continue;

      rows.push({
        id: id || `row-${i}`,
        nome: nome || '—',
        turma: str(nested.turma) || 'N/A',
        escola: str(nested.escola),
        serie: str(nested.serie),
        nota: num(nested.nota ?? nested.nota_geral, 0),
        proficiencia: num(nested.proficiencia ?? nested.proficiencia_geral, 0),
        classificacao: str(nested.nivel_proficiencia ?? nested.classificacao_geral),
        questoes_respondidas: num(nested.total_respondidas ?? nested.total_questoes, 0),
        acertos: num(nested.total_acertos, 0),
        erros: num(nested.total_erros, 0),
        em_branco:
          nested.total_em_branco != null && String(nested.total_em_branco).trim() !== ''
            ? num(nested.total_em_branco, 0)
            : Math.max(0, num(nested.total_questoes, 0) - num(nested.total_respondidas, 0)),
        tempo_gasto: 0,
        status: participationStatusForNestedEntry(row, nested),
        posicao,
      });
      continue;
    }

    // Formato plano (RankingItem avaliação online ou cartão-resposta: grade/proficiency/classification)
    const id = str(row.aluno_id) || str(row.student_id) || str(row.id);
    const nome = str(row.nome);
    if (!id && !nome) continue;

    rows.push({
      id: id || `row-${i}`,
      nome: nome || '—',
      turma: str(row.turma) || 'N/A',
      escola: str(row.escola),
      serie: str(row.serie),
      nota: num(row.nota_geral ?? row.nota ?? row.grade, 0),
      proficiencia: num(row.proficiencia_geral ?? row.proficiencia ?? row.proficiency, 0),
      classificacao: str(
        row.classificacao_geral ?? row.nivel_proficiencia ?? row.classification
      ),
      questoes_respondidas: num(row.total_questoes ?? row.total_respondidas, 0),
      acertos: num(row.total_acertos, 0),
      erros: num(row.total_erros, 0),
      em_branco: num(row.total_em_branco, 0),
      tempo_gasto: 0,
      status: participationStatusFromSource(row),
      posicao,
    });
  }

  rows.sort((a, b) => {
    if (a.posicao !== b.posicao) return a.posicao - b.posicao;
    return (a.nome || '').localeCompare(b.nome || '', undefined, { sensitivity: 'base' });
  });

  const eligible = rows.filter(rowEligibleForRanking);
  return eligible.map((r, index) => ({ ...r, posicao: index + 1 }));
}
