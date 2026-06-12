import type { EvaluationClassRef, EvaluationInfo } from '@/services/evaluation/evaluationComparisonApi';

export type EvaluationScopeLike = Pick<
  EvaluationInfo,
  'grade_name' | 'grade_names' | 'classes' | 'title' | 'application_date' | 'created_at' | 'order'
>;

export function formatEvaluationGradeNames(
  evaluation: Pick<EvaluationScopeLike, 'grade_name' | 'grade_names'>
): string {
  const fromList = (evaluation.grade_names ?? []).map((n) => n.trim()).filter(Boolean);
  if (fromList.length > 0) return fromList.join(', ');
  const single = evaluation.grade_name?.trim();
  return single ?? '';
}

export function formatEvaluationClassNames(
  evaluation: Pick<EvaluationScopeLike, 'classes'>
): string {
  return (evaluation.classes ?? [])
    .map((c: EvaluationClassRef) => c.name?.trim())
    .filter(Boolean)
    .join(', ');
}

export function formatEvaluationScopeDate(dateString?: string | null): string {
  if (dateString == null || String(dateString).trim() === '') return '';
  try {
    const d = new Date(String(dateString).trim());
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}

export function sortEvaluationsByOrder<T extends { order?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
