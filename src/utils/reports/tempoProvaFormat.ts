import type { TempoProvaOrigem } from '@/types/tempo-prova';

export const TEMPO_PROVA_ORIGEM_LABEL: Record<TempoProvaOrigem, string> = {
  medida: 'Online (tempo real)',
  estimada_mobile: 'Mobile (estimado)',
  estimada_fallback: 'Estimado (sem cronômetro)',
};

export function formatTempoProvaSeconds(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const total = Math.max(0, Math.round(Number(value)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}min`;
  }
  return `${minutes}min ${String(seconds).padStart(2, '0')}s`;
}

export function formatTempoProvaNumber(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}
