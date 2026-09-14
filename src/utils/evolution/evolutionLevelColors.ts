/** Cores de nível de proficiência usadas na Evolução (alinhadas ao design system). */
export const EVOLUTION_LEVEL_LABELS = [
  'Abaixo do Básico',
  'Básico',
  'Adequado',
  'Avançado',
] as const;

export type EvolutionLevelLabel = (typeof EVOLUTION_LEVEL_LABELS)[number];

export const EVOLUTION_LEVEL_COLORS: Record<EvolutionLevelLabel, string> = {
  'Abaixo do Básico': '#DC2626',
  Básico: '#F59E0B',
  Adequado: '#4ade80',
  Avançado: '#16A34A',
};

export const EVOLUTION_LEVEL_SOFT: Record<
  EvolutionLevelLabel,
  { bg: string; text: string; border: string }
> = {
  'Abaixo do Básico': {
    bg: 'bg-red-100 dark:bg-red-950/40',
    text: 'text-red-800 dark:text-red-300',
    border: 'border-red-300 dark:border-red-800',
  },
  Básico: {
    bg: 'bg-amber-100 dark:bg-amber-950/40',
    text: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-800',
  },
  Adequado: {
    bg: 'bg-emerald-100 dark:bg-emerald-950/40',
    text: 'text-emerald-800 dark:text-emerald-300',
    border: 'border-emerald-300 dark:border-emerald-800',
  },
  Avançado: {
    bg: 'bg-green-100 dark:bg-green-950/40',
    text: 'text-green-800 dark:text-green-300',
    border: 'border-green-300 dark:border-green-800',
  },
};

export function isEvolutionLevelLabel(value: string | null | undefined): value is EvolutionLevelLabel {
  return !!value && (EVOLUTION_LEVEL_LABELS as readonly string[]).includes(value);
}
