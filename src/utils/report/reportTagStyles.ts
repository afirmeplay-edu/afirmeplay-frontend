export const REPORT_TAG_BASE =
  // Menor e mais minimalista (cabe melhor em cards/tabelas).
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none uppercase tracking-wide";

export type ReportProficiencyLabel =
  | "Abaixo do Básico"
  | "Básico"
  | "Adequado"
  | "Avançado";

/** Rótulo canônico para PDF/tags (desconhecido → Abaixo do Básico). */
export function normalizeProficiencyLevelLabel(
  raw: string | null | undefined
): ReportProficiencyLabel {
  const t = (raw ?? "").trim();
  if (!t || t === "—" || t === "-") return "Abaixo do Básico";
  const lower = t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (lower === "avancado") return "Avançado";
  if (lower === "adequado") return "Adequado";
  if (lower === "basico") return "Básico";
  if (lower === "abaixo do basico") return "Abaixo do Básico";
  if (t === "Avançado" || t === "Adequado" || t === "Básico" || t === "Abaixo do Básico") {
    return t;
  }
  return "Abaixo do Básico";
}

/**
 * Padroniza o visual das tags de proficiência para ficar igual ao estilo
 * usado no `RelatorioEscolar` (mesma tipografia/paddings e mesmas cores).
 */
export function getReportProficiencyTagClass(label?: string | null): string {
  const normalized = (label ?? "").trim();

  switch (normalized) {
    case "Avançado":
      return `${REPORT_TAG_BASE} bg-green-800 text-green-50 border-green-900 dark:bg-green-900/80 dark:text-green-100 dark:border-green-700`;
    case "Adequado":
      return `${REPORT_TAG_BASE} bg-green-100 text-green-800 border-green-300 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800`;
    case "Básico":
      return `${REPORT_TAG_BASE} bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950/30 dark:text-yellow-300 dark:border-yellow-800`;
    case "Abaixo do Básico":
      return `${REPORT_TAG_BASE} bg-red-100 text-red-800 border-red-300 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800`;
    default:
      return `${REPORT_TAG_BASE} bg-muted text-muted-foreground border-border`;
  }
}

