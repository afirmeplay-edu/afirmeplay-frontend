export type SubjectiveCorrectionStatus = "pendente" | "em_correcao" | "concluida" | string;

export type SubjectiveRubricMark = {
  id?: string | null;
  subjective_test_id?: string;
  code: string;
  label: string;
  color: string;
  weight: number;
  sort_order: number;
};

export const DEFAULT_RUBRIC_MARKS: SubjectiveRubricMark[] = [
  { code: "SIM", label: "Sim", color: "#22c55e", weight: 1, sort_order: 0 },
  { code: "PARCIAL", label: "Parcial", color: "#eab308", weight: 0.5, sort_order: 1 },
  { code: "NAO", label: "Não", color: "#ef4444", weight: 0, sort_order: 2 },
  { code: "BRANCO", label: "Branco", color: "#94a3b8", weight: 0, sort_order: 3 },
];

export function rubricShortLabel(mark: Pick<SubjectiveRubricMark, "code" | "label">): string {
  const fromLabel = (mark.label || "").trim();
  if (fromLabel) return fromLabel.slice(0, 2).toUpperCase();
  return (mark.code || "?").slice(0, 2).toUpperCase();
}

export const STATUS_META: Record<
  string,
  { label: string; emoji: string; className: string }
> = {
  pendente: {
    label: "Rascunho",
    emoji: "📝",
    className: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  },
  em_correcao: {
    label: "Em correção",
    emoji: "✍️",
    className: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  },
  concluida: {
    label: "Concluída",
    emoji: "✅",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  },
};

export function statusMeta(status?: string | null) {
  const key = (status || "pendente").toLowerCase();
  return STATUS_META[key] || STATUS_META.pendente;
}

export function contrastText(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#fff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? "#1f2937" : "#fff";
}
