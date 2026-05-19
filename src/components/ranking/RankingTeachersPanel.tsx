import { AlertCircle, Star, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankingResponse } from "@/services/reports/rankingApi";
import { LevelTag, PosBadge, formatPt } from "@/components/ranking/RankingVisualPrimitives";
import { RankingContentShell, RankingLoadingState } from "@/components/ranking/RankingLoadingState";

type Props = {
  data?: RankingResponse;
  isLoading: boolean;
  isRefreshing?: boolean;
  errorMessage?: string;
};

export function RankingTeachersPanel({ data, isLoading, isRefreshing, errorMessage }: Props) {
  if (isLoading) {
    return <RankingLoadingState message="Carregando ranking de professores..." variant="table" />;
  }

  if (errorMessage) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    );
  }

  const modelTeachers = data?.teachers_top?.items || [];
  const items = modelTeachers.length > 0 ? modelTeachers : (data?.items || []);
  const courseSections =
    modelTeachers.length > 0
      ? [
          {
            course_label: "Top professores",
            totals: { count: modelTeachers.length },
            items: modelTeachers,
          },
        ]
      : (
          data?.teacher_course_sections ||
          [
            {
              course_label: "Geral",
              totals: { count: items.length },
              items,
            },
          ]
        );
  return (
    <RankingContentShell isRefreshing={isRefreshing} refreshingMessage="Atualizando ranking de professores...">
    <div className="space-y-6">
      {courseSections.map((section) => (
        <Card key={section.course_label} className="overflow-hidden border border-border/70">
          <CardHeader className="bg-primary text-primary-foreground">
            <CardTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
                  <Trophy className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold">Top professores</h1>
                  <p className="text-sm text-primary-foreground/90">Classificação por níveis, proficiência e nota média</p>
                </div>
              </div>
              <Badge className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20">
                {Number(section.totals?.count || section.items.length)} professores
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {section.items.length === 0 ? (
              <div className="py-12 text-center">
                <Trophy className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold text-foreground">Nenhum professor encontrado</h3>
                <p className="text-muted-foreground">Não há dados de desempenho para os filtros selecionados.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {section.items.map((item) => {
                  const position = Number(item.position || 0);
                  return (
                    <div
                      key={String(item.teacher_id || item.position)}
                      className="rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md"
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <PosBadge position={position} />
                        <Badge className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
                          {String(item.series_class_name || "N/A")}
                        </Badge>
                      </div>

                      <div className="space-y-1">
                        <h3 className="truncate text-base font-semibold text-foreground">
                          {String(item.teacher_name || "Professor")}
                        </h3>
                        <p className="text-xs text-muted-foreground">{String(item.school_name || "Escola não informada")}</p>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-lg bg-muted/40 p-2 text-center">
                          <p className="text-[11px] text-muted-foreground">Níveis</p>
                          <p className="text-sm font-bold text-foreground">
                            {formatPt(Number(item.adequado_avancado_pct || 0))}%
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-2 text-center">
                          <p className="text-[11px] text-muted-foreground">Proficiência</p>
                          <p className="text-sm font-bold text-foreground">{formatPt(Number(item.average_proficiency || 0))}</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-2 text-center">
                          <p className="text-[11px] text-muted-foreground">Nota</p>
                          <p className="text-sm font-bold text-primary">{formatPt(Number(item.average_score || 0))}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Star className="h-3.5 w-3.5" />
                          Nível
                        </span>
                        <LevelTag value={item.classification} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
    </RankingContentShell>
  );
}
