import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Classes alinhadas ao InstrumentPickerModal (busca / selects). */
export const evaluationListFilterControlClass =
  "h-11 text-base border-primary/20 bg-background/90";

export const evaluationListFilterSelectTriggerClass = cn(
  evaluationListFilterControlClass,
  "w-full sm:w-[200px]"
);

type EvaluationListFilterShellProps = {
  title?: string;
  count?: number;
  countLabel?: { singular: string; plural: string };
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/**
 * Cabeçalho de filtros no padrão visual do InstrumentPickerModal
 * (gradiente primary, badge de contagem, slot de controles).
 */
export function EvaluationListFilterShell({
  title = "Filtros",
  count,
  countLabel = { singular: "avaliação", plural: "avaliações" },
  children,
  actions,
  className,
}: EvaluationListFilterShellProps) {
  const showCount = typeof count === "number";
  const label =
    showCount && count === 1 ? countLabel.singular : countLabel.plural;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-primary/20 shadow-sm",
        className
      )}
    >
      <div className="shrink-0 border-b border-primary/15 bg-gradient-to-br from-primary/12 via-primary/6 to-background">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4">
          <h3 className="text-base font-semibold tracking-tight sm:text-lg">{title}</h3>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {showCount ? (
              <Badge className="shrink-0 bg-primary text-primary-foreground">
                {count} {label}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-3 px-4 pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
          {children}
        </div>
      </div>
    </div>
  );
}
