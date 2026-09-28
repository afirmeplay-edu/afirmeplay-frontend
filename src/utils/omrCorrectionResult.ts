import type { OmrCorrectionFailure, OmrCorrectionResult } from '@/types/answer-sheet';

export const ALUNO_AUSENTE_LABEL = 'Ausente — nota não lançada';
export const ALUNO_NAO_IDENTIFICADO_LABEL = 'Aluno não identificado';
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

export function formatOmrCount(value?: number | null): string | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function formatOmrPercentage(value?: number | null): string | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  const formatted = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
  return `${formatted}%`;
}

/** Nota de 0 a 100. `score` é a fonte; `percentage` só entra se score não vier. */
export function omrScoreValue(result: { score?: number | null; percentage?: number | null }): number | undefined {
  if (typeof result.score === 'number' && !Number.isNaN(result.score)) return result.score;
  if (typeof result.percentage === 'number' && !Number.isNaN(result.percentage)) return result.percentage;
  return undefined;
}

export function omrCorrectionStudentLabel(studentName?: string | null): string {
  const name = studentName?.trim();
  return name || ALUNO_NAO_IDENTIFICADO_LABEL;
}

/** Erro da correção de um cartão: só nome (ou null) e o motivo. */
export function readOmrCorrectionFailure(error: unknown): OmrCorrectionFailure {
  const data = (error as { response?: { data?: { student_name?: string | null; error?: string } } })?.response?.data;
  const fromBody = typeof data?.error === 'string' ? data.error.trim() : '';
  const fallback = (error as { message?: string })?.message?.trim() || '';
  const rawName = data?.student_name;
  return {
    studentName: typeof rawName === 'string' && rawName.trim() ? rawName.trim() : null,
    message: fromBody || fallback || 'Não foi possível processar a correção.',
  };
}

/** Nome, acertos, errados, inválidos e nota. Não inclui o gabarito questão a questão. */
export function formatOmrOutcomeLine(result: {
  correct?: number;
  wrong?: number;
  invalid?: number;
  score?: number | null;
  percentage?: number | null;
  aluno_ausente?: boolean;
  status?: string;
}): string {
  const parts: string[] = [];
  const correct = formatOmrCount(result.correct);
  const wrong = formatOmrCount(result.wrong);
  const invalid = formatOmrCount(result.invalid);
  const score = isAlunoAusente(result) ? null : formatOmrPercentage(omrScoreValue(result));
  if (correct != null) parts.push(`${correct} ${result.correct === 1 ? 'acerto' : 'acertos'}`);
  if (wrong != null) parts.push(`${wrong} ${result.wrong === 1 ? 'errado' : 'errados'}`);
  if (invalid != null) parts.push(`${invalid} ${result.invalid === 1 ? 'inválido' : 'inválidos'}`);
  if (score) parts.push(`nota ${score}`);
  return parts.join(' · ');
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
