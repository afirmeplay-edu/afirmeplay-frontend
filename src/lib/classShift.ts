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

/**
 * Paletas por turno — pastéis (manhã), quentes (tarde), frias profundas (noite), neutras (integral).
 * Ajustadas para contraste em modo claro e escuro.
 */
const SHIFT_BADGE_STYLES: Record<ClassShiftCanonical, string> = {
  Manhã:
    "bg-[#fffbeb] text-[#3d5c4a] border-[#bbf7d0]/90 " +
    "dark:bg-[#1c2420] dark:text-[#a7f3d0] dark:border-[#3f5f4a]/80",
  Tarde:
    "bg-[#fff4eb] text-[#9a3412] border-[#fdba74]/90 " +
    "dark:bg-[#2a1a12] dark:text-[#fed7aa] dark:border-[#c2410c]/55",
  Integral:
    "bg-[#f5f4ef] text-[#57534e] border-[#d6d3c1] " +
    "dark:bg-[#2a2926] dark:text-[#d6d3cd] dark:border-[#57534e]/70",
  Noturno:
    "bg-[#ede9fe] text-[#4c1d95] border-[#a78bfa]/50 " +
    "dark:bg-[#1a1628] dark:text-[#c4b5fd] dark:border-[#6d28d9]/55",
};

const SHIFT_SELECTOR_INACTIVE: Record<ClassShiftCanonical, string> = {
  Manhã:
    "border-[#d1fae5]/80 bg-[#fffef7] text-[#3d5c4a] hover:bg-[#fef9c3] " +
    "dark:border-[#3f5f4a]/60 dark:bg-[#1c2420]/60 dark:text-[#a7f3d0] dark:hover:bg-[#243028]",
  Tarde:
    "border-[#fed7aa]/80 bg-[#fffaf5] text-[#9a3412] hover:bg-[#ffedd5] " +
    "dark:border-[#c2410c]/40 dark:bg-[#2a1a12]/60 dark:text-[#fed7aa] dark:hover:bg-[#331f14]",
  Integral:
    "border-[#d6d3c1] bg-[#fafaf8] text-[#57534e] hover:bg-[#f5f4ef] " +
    "dark:border-[#57534e]/50 dark:bg-[#2a2926]/60 dark:text-[#d6d3cd] dark:hover:bg-[#32312c]",
  Noturno:
    "border-[#c4b5fd]/60 bg-[#f5f3ff] text-[#5b21b6] hover:bg-[#ede9fe] " +
    "dark:border-[#6d28d9]/45 dark:bg-[#1a1628]/70 dark:text-[#c4b5fd] dark:hover:bg-[#221c32]",
};

const SHIFT_SELECTOR_ACTIVE: Record<ClassShiftCanonical, string> = {
  Manhã:
    "border-[#6ee7b7] bg-[#ecfdf5] text-[#14532d] shadow-sm ring-2 ring-[#a7f3d0]/40 " +
    "dark:border-[#34d399] dark:bg-[#243028] dark:text-[#d1fae5] dark:ring-[#34d399]/25",
  Tarde:
    "border-[#fb923c] bg-[#ffedd5] text-[#7c2d12] shadow-sm ring-2 ring-[#fdba74]/50 " +
    "dark:border-[#ea580c] dark:bg-[#3d2518] dark:text-[#ffedd5] dark:ring-[#fb923c]/30",
  Integral:
    "border-[#a8a29e] bg-[#e7e5e4] text-[#292524] shadow-sm ring-2 ring-[#d6d3d1]/50 " +
    "dark:border-[#78716c] dark:bg-[#3f3f3a] dark:text-[#fafaf9] dark:ring-[#a8a29e]/30",
  Noturno:
    "border-[#8b5cf6] bg-[#ede9fe] text-[#3b0764] shadow-sm ring-2 ring-[#c4b5fd]/50 " +
    "dark:border-[#7c3aed] dark:bg-[#2e1065]/40 dark:text-[#ede9fe] dark:ring-[#8b5cf6]/35",
};

export function classShiftBadgeClass(raw: string | null | undefined): string {
  const c = normalizeClassShift(raw);
  if (c) return SHIFT_BADGE_STYLES[c];
  return (
    "bg-muted/90 text-muted-foreground border-border " +
    "dark:bg-muted/50 dark:text-muted-foreground dark:border-border"
  );
}

/** Botões do seletor de turno (inativo / selecionado). */
export function classShiftSelectorOptionClass(
  shift: ClassShiftCanonical,
  isActive: boolean
): string {
  return isActive ? SHIFT_SELECTOR_ACTIVE[shift] : SHIFT_SELECTOR_INACTIVE[shift];
}

export function classShiftSelectorClearClass(isActive: boolean): string {
  if (isActive) {
    return (
      "border-border bg-muted text-foreground shadow-sm ring-2 ring-border/60 " +
      "dark:bg-muted/80 dark:text-foreground dark:ring-border/40"
    );
  }
  return (
    "border-border bg-background text-muted-foreground hover:bg-muted/80 " +
    "dark:bg-background dark:text-muted-foreground dark:hover:bg-muted/40"
  );
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

function normalizeDisplayPart(value: string | null | undefined, fallback = "—"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

/** Exibição padronizada onde há contexto de turma (série, turma e turno separados). */
export function formatClassContextDisplay(opts: {
  serie?: string | null;
  turma?: string | null;
  shift?: string | null;
}): { serie: string; turma: string; turno: string } {
  return {
    serie: normalizeDisplayPart(opts.serie),
    turma: normalizeDisplayPart(opts.turma),
    turno: getClassShiftLabel(opts.shift),
  };
}

export type ClassMetaLineParts = {
  ano?: string | number | null;
  serie?: string | null;
  turma?: string | null;
  shift?: string | null;
  escola?: string | null;
  extra?: Array<{ label: string; value: string }>;
};

/** Meta de uma linha: "Ano: 2026 | Série: 6º | Turma: A | Turno: Manhã" */
export function formatClassMetaLine(parts: ClassMetaLineParts): string {
  const segments: string[] = [];
  if (parts.ano != null && String(parts.ano).trim()) {
    segments.push(`Ano: ${String(parts.ano).trim()}`);
  }
  if (parts.escola?.trim()) {
    segments.push(`Escola: ${parts.escola.trim()}`);
  }
  const ctx = formatClassContextDisplay({
    serie: parts.serie,
    turma: parts.turma,
    shift: parts.shift,
  });
  if (ctx.serie !== "—") segments.push(`Série: ${ctx.serie}`);
  if (ctx.turma !== "—") segments.push(`Turma: ${ctx.turma}`);
  if (hasClassShift(parts.shift)) segments.push(`Turno: ${ctx.turno}`);
  for (const item of parts.extra ?? []) {
    const v = String(item.value ?? "").trim();
    if (v) segments.push(`${item.label}: ${v}`);
  }
  return segments.join(" | ");
}
