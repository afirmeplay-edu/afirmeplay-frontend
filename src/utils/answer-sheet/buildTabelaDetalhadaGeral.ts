import { normalizeProficiencyLevelLabel } from '@/utils/report/reportTagStyles';

export type GeralAlunoRow = {
  id: string;
  nome: string;
  escola?: string;
  serie?: string;
  turma?: string;
  nota_geral: number;
  proficiencia_geral: number;
  nivel_proficiencia_geral: string;
  total_acertos_geral: number;
  total_questoes_geral: number;
  total_respondidas_geral: number;
  total_em_branco_geral: number;
  percentual_acertos_geral: number;
  status_geral: string;
};

type DisciplinaAlunoLike = {
  id: string;
  nome?: string;
  escola?: string;
  serie?: string;
  turma?: string;
  nota?: number;
  proficiencia?: number;
  nivel_proficiencia?: string;
  total_acertos?: number;
  total_erros?: number;
  total_respondidas?: number;
  total_questoes_disciplina?: number;
  total_em_branco?: number;
  status?: string;
  percentual_acertos?: number;
};

type DisciplinaLike = {
  nome: string;
  alunos?: DisciplinaAlunoLike[];
};

type RankingLike = {
  student_id?: string;
  nome?: string;
  grade?: number;
  proficiency?: number;
  classification?: string;
};

function isConcluidaStatus(raw: string | undefined): boolean {
  const low = (raw ?? '').trim().toLowerCase();
  return (
    low === 'concluida' ||
    low === 'concluída' ||
    low === 'concluido' ||
    low === 'concluído' ||
    low === 'finalizada' ||
    low === 'finalizado'
  );
}

/**
 * Monta `tabela_detalhada.geral.alunos` quando o backend envia só `disciplinas` (+ opcional `ranking`).
 * Alinha com a avaliação online: nota/proficiência/nível gerais vêm do ranking ou da visão geral da API.
 */
export function buildGeralAlunosFromDisciplinasAndRanking(
  disciplinas: DisciplinaLike[],
  ranking: RankingLike[] = []
): GeralAlunoRow[] {
  if (!disciplinas.length) return [];

  const rankingById = new Map<string, RankingLike>();
  for (const r of ranking) {
    const id = (r.student_id ?? '').trim();
    if (id) rankingById.set(id, r);
  }

  const ids = new Set<string>();
  for (const disc of disciplinas) {
    for (const a of disc.alunos ?? []) {
      const rowId = String(a.id ?? (a as { aluno_id?: string }).aluno_id ?? '').trim();
      if (rowId) ids.add(rowId);
    }
  }

  const rows: GeralAlunoRow[] = [];

  for (const id of ids) {
    const rank = rankingById.get(id);
    let nome = rank?.nome?.trim() ?? '';
    let escola = '';
    let serie = '';
    let turma = '';
    let totalAcertos = 0;
    let totalQuestoes = 0;
    let totalRespondidas = 0;
    let totalEmBranco = 0;
    let statusGeral = 'pendente';
    let pctSum = 0;
    let pctCount = 0;

    for (const disc of disciplinas) {
      const a = disc.alunos?.find(
        (x) => String(x.id ?? (x as { aluno_id?: string }).aluno_id ?? '').trim() === id
      );
      if (!a) continue;
      if (!nome) nome = (a.nome ?? '').trim();
      escola = a.escola ?? escola;
      serie = a.serie ?? serie;
      turma = a.turma ?? turma;
      totalAcertos += a.total_acertos ?? 0;
      totalRespondidas += a.total_respondidas ?? 0;
      const emBranco =
        a.total_em_branco ??
        Math.max(0, (a.total_questoes_disciplina ?? 0) - (a.total_respondidas ?? 0));
      totalEmBranco += emBranco;
      totalQuestoes += a.total_questoes_disciplina ?? totalRespondidas + emBranco;
      if (isConcluidaStatus(a.status)) statusGeral = 'concluida';
      if (a.percentual_acertos != null && Number.isFinite(Number(a.percentual_acertos))) {
        pctSum += Number(a.percentual_acertos);
        pctCount += 1;
      }
    }

    const notaGeral = rank?.grade != null && Number.isFinite(Number(rank.grade)) ? Number(rank.grade) : 0;
    const profGeral =
      rank?.proficiency != null && Number.isFinite(Number(rank.proficiency))
        ? Number(rank.proficiency)
        : 0;
    const nivelGeral = normalizeProficiencyLevelLabel(rank?.classification ?? '');

    const totalQ =
      totalQuestoes ||
      totalRespondidas + totalEmBranco ||
      Math.max(totalAcertos, 0) + Math.max(totalRespondidas - totalAcertos, 0) + totalEmBranco;
    const pctLocal = totalQ > 0 ? (totalAcertos / totalQ) * 100 : 0;

    rows.push({
      id,
      nome: nome || '—',
      escola,
      serie,
      turma,
      nota_geral: notaGeral,
      proficiencia_geral: profGeral,
      nivel_proficiencia_geral: nivelGeral,
      total_acertos_geral: totalAcertos,
      total_questoes_geral: totalQ,
      total_respondidas_geral: totalRespondidas,
      total_em_branco_geral: totalEmBranco,
      percentual_acertos_geral: pctCount > 0 ? pctSum / pctCount : pctLocal,
      status_geral: statusGeral,
    });
  }

  return rows.sort((a, b) => a.nome.localeCompare(b.nome, undefined, { sensitivity: 'base' }));
}
