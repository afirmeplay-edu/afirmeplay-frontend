export type SaebLevel = "abaixo" | "basico" | "adequado" | "avancado";

export type SaebInfo = {
  level: SaebLevel;
  label: string;
  emoji: string;
  color: string;
  bg: string;
  text: string;
  range: string;
};

const SAEB_BY_LEVEL: Record<SaebLevel, SaebInfo> = {
  abaixo: {
    level: "abaixo",
    label: "Abaixo do Básico",
    emoji: "😠",
    color: "#dc2626",
    bg: "bg-red-100 dark:bg-red-950/40",
    text: "text-red-800 dark:text-red-300",
    range: "< 40%",
  },
  basico: {
    level: "basico",
    label: "Básico",
    emoji: "😕",
    color: "#f59e0b",
    bg: "bg-amber-100 dark:bg-amber-950/40",
    text: "text-amber-800 dark:text-amber-300",
    range: "40–59%",
  },
  adequado: {
    level: "adequado",
    label: "Adequado",
    emoji: "😊",
    color: "#65a30d",
    bg: "bg-lime-100 dark:bg-lime-950/40",
    text: "text-lime-800 dark:text-lime-300",
    range: "60–79%",
  },
  avancado: {
    level: "avancado",
    label: "Avançado",
    emoji: "🤩",
    color: "#16a34a",
    bg: "bg-green-100 dark:bg-green-950/40",
    text: "text-green-800 dark:text-green-300",
    range: "≥ 80%",
  },
};

export function saebFromLevel(level?: string | null, label?: string | null): SaebInfo {
  const key = (level || "").toLowerCase() as SaebLevel;
  if (key in SAEB_BY_LEVEL) {
    const base = SAEB_BY_LEVEL[key];
    return label ? { ...base, label } : base;
  }
  return SAEB_BY_LEVEL.abaixo;
}

export function saebFromPct(pct: number): SaebInfo {
  if (pct >= 80) return SAEB_BY_LEVEL.avancado;
  if (pct >= 60) return SAEB_BY_LEVEL.adequado;
  if (pct >= 40) return SAEB_BY_LEVEL.basico;
  return SAEB_BY_LEVEL.abaixo;
}

export const SAEB_LEVELS: SaebInfo[] = [
  SAEB_BY_LEVEL.abaixo,
  SAEB_BY_LEVEL.basico,
  SAEB_BY_LEVEL.adequado,
  SAEB_BY_LEVEL.avancado,
];

export const RUBRIC_COLORS: Record<"SIM" | "PARCIAL" | "NAO" | "BRANCO", string> = {
  SIM: "#22c55e",
  PARCIAL: "#eab308",
  NAO: "#ef4444",
  BRANCO: "#94a3b8",
};
