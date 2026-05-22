/* eslint-disable react-refresh/only-export-components -- utilitários compartilhados com componentes visuais */
import { Award, Medal, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function formatPt(value: number, digits = 1): string {
  return Number(value || 0).toFixed(digits).replace(".", ",");
}

export function PosBadge({ position }: { position: number }) {
  const base = "inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold";
  if (position === 1) {
    return (
      <span className={`${base} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300`}>
        <Trophy className="h-4 w-4" />
      </span>
    );
  }
  if (position === 2) {
    return (
      <span className={`${base} bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200`}>
        <Medal className="h-4 w-4" />
      </span>
    );
  }
  if (position === 3) {
    return (
      <span className={`${base} bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300`}>
        <Award className="h-4 w-4" />
      </span>
    );
  }
  return <span className={`${base} bg-muted text-foreground`}>{position}º</span>;
}

export function NivelBar({ value, count }: { value: number; count?: number }) {
  const pct = Math.max(0, Math.min(100, Number(value || 0)));
  const countLabel =
    count !== undefined && count !== null
      ? `${Number(count)} aluno${Number(count) === 1 ? "" : "s"}`
      : null;
  return (
    <div className="w-full min-w-[140px]">
      <div className="h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-right text-[11px] font-semibold text-muted-foreground">
        {countLabel ? (
          <>
            <span className="text-foreground">{countLabel}</span>
            <span className="text-muted-foreground"> · {formatPt(pct, 1)}%</span>
          </>
        ) : (
          `${formatPt(pct, 1)}%`
        )}
      </p>
    </div>
  );
}

const LEVEL_CLASS: Record<string, string> = {
  "Abaixo do Básico": "border border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300",
  Básico: "border border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300",
  Adequado: "border border-green-200 bg-green-100 text-green-800 dark:border-green-900/40 dark:bg-green-950/30 dark:text-green-300",
  "Avançado": "border border-green-800 bg-green-800 text-green-50 dark:border-green-700 dark:bg-green-900/80 dark:text-green-100",
};

function normalizeLevelTag(value: unknown): string {
  const text = String(value || "").trim();
  if (text === "Abaixo do Básico") return text;
  if (text === "Básico" || text === "Basico") return "Básico";
  if (text === "Adequado") return text;
  if (text === "Avançado" || text === "Avancado") return "Avançado";
  return "N/A";
}

export function LevelTag({ value }: { value: unknown }) {
  const level = normalizeLevelTag(value);
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${LEVEL_CLASS[level] || "bg-muted text-foreground"}`}>
      {level}
    </span>
  );
}

export function SummaryCard({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <Card className="border border-border/70 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className={`text-2xl font-bold text-foreground tabular-nums leading-none ${valueClassName || ""}`}>{value}</p>
        {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
