/** Turnos de turma — valores canônicos gravados no campo `class.shift`. */

export type ClassShiftCanonical = "Manhã" | "Tarde" | "Integral" | "Noturno";

export interface ClassShiftOption {
  value: ClassShiftCanonical;
  label: string;
  icon: string;
  /** Valores legados (inglês / variações) aceitos na leitura da API. */
  aliases: string[];
}

export const CLASS_SHIFT_OPTIONS: ClassShiftOption[] = [
  { value: "Manhã", label: "Manhã", icon: "🌅", aliases: ["morning", "matutino", "manha"] },
  { value: "Tarde", label: "Tarde", icon: "☀️", aliases: ["afternoon", "vespertino"] },
  { value: "Integral", label: "Integral", icon: "📚", aliases: ["full", "integral"] },
  { value: "Noturno", label: "Noturno", icon: "🌙", aliases: ["evening", "noturno"] },
];

const ALIAS_TO_CANONICAL = new Map<string, ClassShiftCanonical>();
for (const opt of CLASS_SHIFT_OPTIONS) {
  ALIAS_TO_CANONICAL.set(opt.value.toLowerCase(), opt.value);
  for (const a of opt.aliases) {
    ALIAS_TO_CANONICAL.set(a.toLowerCase(), opt.value);
  }
}

/** Normaliza valor da API para turno canônico ou null. */
export function normalizeClassShift(
  raw: string | null | undefined
): ClassShiftCanonical | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  return ALIAS_TO_CANONICAL.get(text.toLowerCase()) ?? null;
}

export function getClassShiftLabel(raw: string | null | undefined): string {
  const canonical = normalizeClassShift(raw);
  if (canonical) {
    return CLASS_SHIFT_OPTIONS.find((o) => o.value === canonical)?.label ?? canonical;
  }
  const text = String(raw ?? "").trim();
  return text || "Sem turno";
}

export function hasClassShift(raw: string | null | undefined): boolean {
  return normalizeClassShift(raw) !== null || String(raw ?? "").trim() !== "";
}

export function classShiftBadgeClass(raw: string | null | undefined): string {
  const c = normalizeClassShift(raw);
  switch (c) {
    case "Manhã":
      return "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800";
    case "Tarde":
      return "bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-800";
    case "Integral":
      return "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800";
    case "Noturno":
      return "bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-200 dark:border-indigo-800";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

/** Valor para `PUT/POST` (sempre canônico em português). */
export function toApiShiftValue(
  raw: string | null | undefined
): ClassShiftCanonical | null {
  return normalizeClassShift(raw);
}

export function shiftsAreEqual(
  a: string | null | undefined,
  b: ClassShiftCanonical | null
): boolean {
  return toApiShiftValue(a) === b;
}
