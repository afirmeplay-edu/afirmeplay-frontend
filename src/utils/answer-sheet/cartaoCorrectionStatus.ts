import type { CartaoCorrectionStatus, GabaritoStudentListItem } from '@/types/answer-sheet';

/** Labels para cartão resposta (não usar legenda de lista-frequência Presente/Ausente). */
export const CARTAO_CORRECTION_STATUS_LABEL: Record<CartaoCorrectionStatus, string> = {
  P: 'Corrigido',
  A: 'Pendente',
};

export function cartaoCorrectionStatusLabel(status: CartaoCorrectionStatus): string {
  return CARTAO_CORRECTION_STATUS_LABEL[status] ?? status;
}

/** P/A explícito na API ou derivado de `has_result`. */
export function resolveStudentCorrectionStatus(
  student: Pick<GabaritoStudentListItem, 'correction_status' | 'has_result'>
): CartaoCorrectionStatus {
  const raw = String(student.correction_status ?? '').trim().toUpperCase();
  if (raw === 'P' || raw === 'A') return raw;
  return student.has_result ? 'P' : 'A';
}

export function gabaritoEntryKindLabel(testId: string | null | undefined): 'Cartão resposta' | 'Prova física' {
  return testId ? 'Prova física' : 'Cartão resposta';
}

export function detectionMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null;
  const m = method.toLowerCase();
  if (m === 'manual') return 'Manual';
  if (m === 'new_grid' || m.includes('omr') || m.includes('grid')) return 'OMR';
  return method;
}
