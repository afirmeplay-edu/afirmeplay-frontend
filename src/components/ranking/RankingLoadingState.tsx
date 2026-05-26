import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type RankingLoadingVariant = "cards" | "table" | "overview" | "simple";

type LoadingProps = {
  message?: string;
  variant?: RankingLoadingVariant;
  className?: string;
};

function SummarySkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className={cn("grid gap-3", count === 3 ? "md:grid-cols-3" : "md:grid-cols-4")}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70">
      <Skeleton className="h-10 w-full rounded-none" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="mt-px h-11 w-full rounded-none" />
      ))}
    </div>
  );
}

export function RankingLoadingState({
  message = "Carregando dados do ranking...",
  variant = "table",
  className,
}: LoadingProps) {
  return (
    <Card className={cn("border border-border/70", className)}>
      <CardContent className="space-y-4 p-4 pt-6">
        <div className="flex items-center gap-2 text-sm text-primary">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          <span className="font-medium">{message}</span>
        </div>

        {variant === "simple" ? null : variant === "cards" ? (
          <>
            <SummarySkeletons count={4} />
            <TableSkeleton />
          </>
        ) : variant === "overview" ? (
          <>
            <SummarySkeletons count={3} />
            <Skeleton className="h-[380px] w-full rounded-xl" />
            <TableSkeleton rows={5} />
          </>
        ) : (
          <>
            <SummarySkeletons count={4} />
            <TableSkeleton />
          </>
        )}
      </CardContent>
    </Card>
  );
}

type RefreshingProps = {
  message?: string;
  className?: string;
};

export function RankingRefreshingBanner({
  message = "Atualizando ranking com os filtros selecionados...",
  className,
}: RefreshingProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

type ContentShellProps = {
  isRefreshing?: boolean;
  refreshingMessage?: string;
  children: ReactNode;
  className?: string;
};

export function RankingContentShell({
  children,
  className,
}: ContentShellProps) {
  return <div className={cn("relative space-y-4", className)}>{children}</div>;
}
