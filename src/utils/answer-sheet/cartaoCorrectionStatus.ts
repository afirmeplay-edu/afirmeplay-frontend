import type { CartaoCorrectionStatus } from '@/types/answer-sheet';

/** Labels para cartão resposta (não usar legenda de lista-frequência Presente/Ausente). */
export const CARTAO_CORRECTION_STATUS_LABEL: Record<CartaoCorrectionStatus, string> = {
  P: 'Corrigido',
  A: 'Pendente',
};

export function cartaoCorrectionStatusLabel(status: CartaoCorrectionStatus): string {
  return CARTAO_CORRECTION_STATUS_LABEL[status] ?? status;
}

export function detectionMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null;
  const m = method.toLowerCase();
  if (m === 'manual') return 'Manual';
  if (m === 'new_grid' || m.includes('omr') || m.includes('grid')) return 'OMR';
  return method;
}
