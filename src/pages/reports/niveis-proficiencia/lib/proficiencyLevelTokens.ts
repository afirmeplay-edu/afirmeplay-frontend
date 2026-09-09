import type { ReportProficiencyLabel } from '@/utils/report/reportTagStyles';
import { normalizeProficiencyLevelLabel } from '@/utils/report/reportTagStyles';

export const PROFICIENCY_LEVELS: ReportProficiencyLabel[] = [
  'Abaixo do Básico',
  'Básico',
  'Adequado',
  'Avançado',
];

export const LEVEL_FAIXA_LABEL: Record<ReportProficiencyLabel, string> = {
  'Abaixo do Básico': '0–29%',
  Básico: '30–59%',
  Adequado: '60–79%',
  Avançado: '80–100%',
};

export const LEVEL_DESCRIPTION: Record<ReportProficiencyLabel, string> = {
  'Abaixo do Básico': 'Desempenho abaixo do esperado para a série.',
  Básico: 'Domínio parcial dos conhecimentos essenciais.',
  Adequado: 'Domínio satisfatório dos conhecimentos esperados.',
  Avançado: 'Domínio elevado, além do esperado para a série.',
};

/** Soft background / border / text / bar — aligned with reportTagStyles. */
export function getLevelSurfaceClasses(level: string | null | undefined) {
  const label = normalizeProficiencyLevelLabel(level);
  switch (label) {
    case 'Abaixo do Básico':
      return {
        soft: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800',
        text: 'text-red-800 dark:text-red-300',
        bar: 'bg-red-600',
        badge: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
        dot: 'bg-red-600',
      };
    case 'Básico':
      return {
        soft: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800',
        text: 'text-yellow-800 dark:text-yellow-300',
        bar: 'bg-yellow-500',
        badge: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800',
        dot: 'bg-yellow-500',
      };
    case 'Adequado':
      return {
        soft: 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800',
        text: 'text-green-800 dark:text-green-300',
        bar: 'bg-green-600',
        badge: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800',
        dot: 'bg-green-600',
      };
    case 'Avançado':
      return {
        soft: 'bg-green-900/10 border-green-800/40 dark:bg-green-950/50 dark:border-green-700',
        text: 'text-green-900 dark:text-green-100',
        bar: 'bg-green-800',
        badge: 'bg-green-800 text-green-50 border-green-900 dark:bg-green-900/80 dark:text-green-100 dark:border-green-700',
        dot: 'bg-green-800',
      };
  }
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(digits)}%`;
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits);
}

export function formatDatePt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('pt-BR');
}
