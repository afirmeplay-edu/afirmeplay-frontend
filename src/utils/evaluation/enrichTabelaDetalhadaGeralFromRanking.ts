import {
  buildGeralAlunosFromDisciplinasAndRanking,
  type GeralAlunoRow,
} from '@/utils/answer-sheet/buildTabelaDetalhadaGeral';

type RankingLike = {
  student_id?: string;
  nome?: string;
  grade?: number;
  proficiency?: number;
  classification?: string;
};

type TabelaWithDisciplinas = {
  disciplinas?: Array<{ alunos?: Array<{ id?: string; aluno_id?: string }> }>;
  geral?: { alunos?: unknown[] };
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Normaliza `ranking` das rotas agregadas (formato aninhado `aluno` ou plano cartão-resposta)
 * para o builder de `tabela_detalhada.geral.alunos`.
 */
export function normalizeRankingForGeralBuild(raw: unknown[] | null | undefined): RankingLike[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const rows: RankingLike[] = [];

  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;

    const nested = asRecord(row.aluno);
    if (nested) {
      const id = str(nested.id ?? nested.aluno_id);
      if (!id) continue;
      rows.push({
        student_id: id,
        nome: str(nested.nome),
        grade: num(nested.nota ?? nested.nota_geral ?? nested.grade),
        proficiency: num(nested.proficiencia ?? nested.proficiencia_geral ?? nested.proficiency),
        classification: str(
          nested.nivel_proficiencia ??
            nested.nivel_proficiencia_geral ??
            nested.classificacao_geral ??
            nested.classificacao ??
            nested.classification
        ),
      });
      continue;
    }

    const id = str(row.student_id ?? row.aluno_id ?? row.id);
    if (!id) continue;
    rows.push({
      student_id: id,
      nome: str(row.nome),
      grade: num(row.grade ?? row.nota_geral ?? row.nota),
      proficiency: num(row.proficiency ?? row.proficiencia_geral ?? row.proficiencia),
      classification: str(
        row.classification ?? row.classificacao_geral ?? row.nivel_proficiencia ?? row.classificacao
      ),
    });
  }

  return rows;
}

function geralRowToTabelaAluno(row: GeralAlunoRow) {
  return {
    id: row.id,
    nome: row.nome,
    escola: row.escola,
    serie: row.serie,
    turma: row.turma,
    nota_geral: row.nota_geral,
    proficiencia_geral: row.proficiencia_geral,
    nivel_proficiencia_geral: row.nivel_proficiencia_geral,
    total_acertos_geral: row.total_acertos_geral,
    total_questoes_geral: row.total_questoes_geral,
    total_respondidas_geral: row.total_respondidas_geral,
    total_em_branco_geral: row.total_em_branco_geral,
    percentual_acertos_geral: row.percentual_acertos_geral,
    status_geral: row.status_geral,
  };
}

/**
 * Preenche `tabela_detalhada.geral.alunos` a partir do `ranking` quando o backend
 * envia só `disciplinas` (escopo turma/série). Preserva `geral` existente da API.
 */
export function enrichTabelaDetalhadaGeralFromRanking<T extends TabelaWithDisciplinas>(
  tabela: T | null,
  ranking: unknown[] | null | undefined
): T | null {
  if (!tabela?.disciplinas?.length) return tabela;
  if ((tabela.geral?.alunos?.length ?? 0) > 0) return tabela;

  const geralRows = buildGeralAlunosFromDisciplinasAndRanking(
    tabela.disciplinas,
    normalizeRankingForGeralBuild(ranking)
  );
  if (!geralRows.length) return tabela;

  return {
    ...tabela,
    geral: {
      alunos: geralRows.map(geralRowToTabelaAluno),
    },
  } as T;
}
