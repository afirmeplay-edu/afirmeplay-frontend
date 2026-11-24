import type {
  EvolutionGroupCard,
  EvolutionGroupGradeByRecorte,
  EvolutionGroupsResponse,
} from '@/services/evaluation/evaluationComparisonApi';

export function sortGradeByRecorte(
  rows: EvolutionGroupGradeByRecorte[]
): EvolutionGroupGradeByRecorte[] {
  return [...rows].sort((a, b) => {
    if (a.is_geral !== b.is_geral) return a.is_geral ? 1 : -1;
    return a.recorte.localeCompare(b.recorte, 'pt-BR', { sensitivity: 'base' });
  });
}

/** Colunas = pontos da comparação (ordem), sem evaluation_title de disciplinas. */
export function buildGroupEvaluationColumns(
  group: Pick<EvolutionGroupCard, 'points'>,
  fallbackEvaluations?: EvolutionGroupsResponse['evaluations'],
  columnPrefix = 'Avaliação'
): Array<{ order: number; id: string; title: string }> {
  if (group.points?.length) {
    return [...group.points]
      .sort((a, b) => a.order - b.order)
      .map((point) => ({
        order: point.order,
        id: point.evaluation_id,
        title: `${columnPrefix} ${point.order}`,
      }));
  }
  return [...(fallbackEvaluations ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((evaluation) => ({
      order: evaluation.order,
      id: evaluation.id,
      title: `${columnPrefix} ${evaluation.order}`,
    }));
}

export function buildVariationHeaders(
  orders: number[]
): Array<{ from: number; to: number; label: string }> {
  if (orders.length < 2) return [];
  return orders.slice(0, -1).map((from, index) => {
    const to = orders[index + 1];
    return {
      from,
      to,
      label: orders.length === 2 ? 'Variação' : `Variação ${from}→${to}`,
    };
  });
}

export interface EvolutionSchoolTurmaGroup {
  schoolKey: string;
  schoolName: string;
  turmas: EvolutionGroupCard[];
}

/** Agrupa cards de turma por escola (ordem alfabética). */
export function groupTurmasBySchool(groups: EvolutionGroupCard[]): EvolutionSchoolTurmaGroup[] {
  const map = new Map<string, EvolutionSchoolTurmaGroup>();

  for (const group of groups) {
    const schoolName = (group.school_name ?? '').trim() || 'Escola não informada';
    const schoolKey = (group.school_id ?? '').trim() || schoolName.toLowerCase();
    const existing = map.get(schoolKey);
    if (existing) {
      existing.turmas.push(group);
    } else {
      map.set(schoolKey, { schoolKey, schoolName, turmas: [group] });
    }
  }

  const schools = Array.from(map.values()).sort((a, b) =>
    a.schoolName.localeCompare(b.schoolName, 'pt-BR', { sensitivity: 'base' })
  );

  for (const school of schools) {
    school.turmas.sort((a, b) => {
      const grade = (a.grade_name ?? '').localeCompare(b.grade_name ?? '', 'pt-BR', {
        sensitivity: 'base',
      });
      if (grade !== 0) return grade;
      return (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR', { sensitivity: 'base' });
    });
  }

  return schools;
}
