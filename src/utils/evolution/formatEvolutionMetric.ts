/**
 * Formatação padronizada de métricas de evolução (cards, gráficos, PDF).
 * - nota: 1 casa decimal
 * - proficiência: 1 casa (alinhada ao cálculo/limiares; evita divergência visual com classificação)
 * - percentual: 1 casa
 */
export type EvolutionMetricKind = 'nota' | 'proficiencia' | 'percentual' | 'inteiro';

const DIGITS: Record<EvolutionMetricKind, number> = {
  nota: 1,
  proficiencia: 1,
  percentual: 1,
  inteiro: 0,
};

export function formatEvolutionMetric(
  value: number | null | undefined,
  kind: EvolutionMetricKind = 'nota'
): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: DIGITS[kind],
    maximumFractionDigits: DIGITS[kind],
  });
}

export function calcEvolution(
  from: number,
  to: number
): { value: number; percentage: number; direction: 'increase' | 'decrease' | 'stable' } {
  const value = Number((to - from).toFixed(2));
  const percentage =
    from === 0
      ? to === 0
        ? 0
        : 100
      : Number((((to - from) / Math.abs(from)) * 100).toFixed(2));
  const direction: 'increase' | 'decrease' | 'stable' =
    value > 0 ? 'increase' : value < 0 ? 'decrease' : 'stable';
  return { value, percentage, direction };
}
