import type { Evaluation } from "@/types/evaluation-types";

/** Total de questões para exibição (metadado; não carrega a lista de questões). */
export function getEvaluationQuestionCount(evaluation: Evaluation): number {
  const raw =
    typeof evaluation?.total_questions === "number"
      ? evaluation.total_questions
      : evaluation?.totalQuestions ??
        (Array.isArray(evaluation?.questions)
          ? evaluation.questions.length
          : 0) ??
        (evaluation as { questions_count?: number }).questions_count ??
        0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function formatEvaluationQuestionCount(evaluation: Evaluation): string {
  const n = getEvaluationQuestionCount(evaluation);
  return new Intl.NumberFormat("pt-BR").format(n);
}

function parseValidDate(value: string | null | undefined): Date | null {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isEvaluationApplied(evaluation: Evaluation): boolean {
  if (evaluation.is_applied) return true;
  if (Number(evaluation.applied_classes_count || 0) > 0) return true;
  return Array.isArray(evaluation.applied_classes) && evaluation.applied_classes.length > 0;
}

function pickMinDateIso(dates: string[]): string | null {
  let best: { iso: string; time: number } | null = null;
  for (const iso of dates) {
    const d = parseValidDate(iso);
    if (!d) continue;
    const time = d.getTime();
    if (!best || time < best.time) best = { iso, time };
  }
  return best?.iso ?? null;
}

function pickMaxDateIso(dates: string[]): string | null {
  let best: { iso: string; time: number } | null = null;
  for (const iso of dates) {
    const d = parseValidDate(iso);
    if (!d) continue;
    const time = d.getTime();
    if (!best || time > best.time) best = { iso, time };
  }
  return best?.iso ?? null;
}

function getAppliedClassDateLists(evaluation: Evaluation): {
  applications: string[];
  expirations: string[];
} {
  const applications: string[] = [];
  const expirations: string[] = [];

  for (const item of evaluation.applied_classes ?? []) {
    if (item.application) applications.push(item.application);
    if (item.expiration) expirations.push(item.expiration);
  }

  return { applications, expirations };
}

/** Data de criação da avaliação (`createdAt` / `created_at`). */
export function getEvaluationCreatedAt(evaluation: Evaluation): string | null {
  const raw = evaluation.createdAt ?? evaluation.created_at;
  return raw && parseValidDate(raw) ? raw : null;
}

/** Momento da aplicação (`updatedAt` quando `is_applied`). */
export function getEvaluationAppliedAt(evaluation: Evaluation): string | null {
  if (!isEvaluationApplied(evaluation)) return null;
  const raw = evaluation.updatedAt ?? evaluation.updated_at;
  return raw && parseValidDate(raw) ? raw : null;
}

/** Início da janela de disponibilidade (`applied_classes[].application`). */
export function getEvaluationApplicationStart(evaluation: Evaluation): string | null {
  if (!isEvaluationApplied(evaluation)) return null;
  const { applications } = getAppliedClassDateLists(evaluation);
  return pickMinDateIso(applications);
}

/** Término da janela de disponibilidade (`applied_classes[].expiration`). */
export function getEvaluationApplicationEnd(evaluation: Evaluation): string | null {
  if (!isEvaluationApplied(evaluation)) return null;
  const { expirations } = getAppliedClassDateLists(evaluation);
  return pickMaxDateIso(expirations);
}

export function formatEvaluationListDate(iso: string | null | undefined): string {
  const d = iso ? parseValidDate(iso) : null;
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function formatEvaluationListDateTime(iso: string | null | undefined): string {
  const d = iso ? parseValidDate(iso) : null;
  if (!d) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
