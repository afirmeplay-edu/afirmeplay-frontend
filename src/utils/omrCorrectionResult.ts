import type { OmrCorrectionResult } from '@/types/answer-sheet';

export const ALUNO_AUSENTE_LABEL = 'Ausente — nota não lançada';
export const ALUNO_AUSENTE_FALLBACK_MESSAGE =
  'Aluno marcado como ausente. O cartão não gerou nota.';

function asOmrResult(value: unknown): OmrCorrectionResult | null {
  if (!value || typeof value !== 'object') return null;
  return value as OmrCorrectionResult;
}

/** Fonte da verdade: o flag, nunca score/percentage 0. */
export function isAlunoAusente(value: unknown): boolean {
  const result = asOmrResult(value);
  if (!result) return false;
  return result.aluno_ausente === true || result.status === 'aluno_ausente';
}

export function alunoAusenteMessage(value: unknown): string {
  const result = asOmrResult(value);
  const message = result?.message?.trim();
  return message || ALUNO_AUSENTE_FALLBACK_MESSAGE;
}

export function findOmrResultForBatchItem(
  results: unknown[] | undefined,
  item: { student_id?: string },
  index: string | number
): OmrCorrectionResult | undefined {
  if (!Array.isArray(results) || results.length === 0) return undefined;
  const typed = results.map(asOmrResult).filter(Boolean) as OmrCorrectionResult[];
  if (item.student_id) {
    const byId = typed.find((r) => r.student_id && r.student_id === item.student_id);
    if (byId) return byId;
  }
  const idx = Number(index);
  if (Number.isFinite(idx) && typed[idx]) return typed[idx];
  return undefined;
}

/**
 * Durante o poll, items não trazem aluno_ausente.
 * Só classifica ausente com segurança quando o job terminou (results[]) ou se o item já tiver o flag.
 */
export function isBatchItemAlunoAusente(
  item: unknown,
  results: unknown[] | undefined,
  index: string | number,
  jobCompleted: boolean
): boolean {
  if (isAlunoAusente(item)) return true;
  if (!jobCompleted) return false;
  const result = findOmrResultForBatchItem(
    results,
    asOmrResult(item) ?? {},
    index
  );
  return isAlunoAusente(result);
}

export function summarizeOmrBatchResults(
  results: unknown[] | undefined,
  successful: number,
  failed: number
): { corrigidos: number; ausentes: number; failed: number } {
  const list = Array.isArray(results) ? results : [];
  const ausentes = list.filter(isAlunoAusente).length;
  return {
    corrigidos: Math.max(0, successful - ausentes),
    ausentes,
    failed,
  };
}

export function formatOmrBatchSummaryText(summary: {
  corrigidos: number;
  ausentes: number;
  failed: number;
}): string {
  const parts = [`${summary.corrigidos} corrigido(s)`];
  if (summary.ausentes > 0) parts.push(`${summary.ausentes} ausente(s)`);
  if (summary.failed > 0) parts.push(`${summary.failed} falha(s)`);
  return `${parts.join(', ')}.`;
}
