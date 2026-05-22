import { useMemo } from "react";
import { AlertCircle, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankingResponse } from "@/services/reports/rankingApi";
import {
  RankingMetricsTableHead,
  RankingMetricsTableRow,
  RANKING_TABLE_SCROLL_CLASS,
} from "@/components/ranking/RankingMetricsTable";
import { RankingContentShell, RankingLoadingState } from "@/components/ranking/RankingLoadingState";
import { RankingSortControls } from "@/components/ranking/RankingSortControls";
import { useRankingSort } from "@/components/ranking/useRankingSort";

type Props = {
  data?: RankingResponse;
  isLoading: boolean;
  isRefreshing?: boolean;
  errorMessage?: string;
};

export function RankingTeachersPanel({ data, isLoading, isRefreshing, errorMessage }: Props) {
  const { sortBy, sortDir, setSortBy, setSortDir, sortRows } = useRankingSort();
  const modelTeachers = data?.teachers_top?.items || [];
  const items = modelTeachers.length > 0 ? modelTeachers : (data?.items || []);
  const courseSectionsRaw =
    modelTeachers.length > 0
      ? [
          {
            course_label: "Ranking de professores",
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
  const courseSections = useMemo(
    () =>
      courseSectionsRaw.map((section) => ({
        ...section,
        items: sortRows(section.items as Array<Record<string, unknown>>),
      })),
    [courseSectionsRaw, sortRows]
  );

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

  return (
    <RankingContentShell isRefreshing={isRefreshing} refreshingMessage="Atualizando ranking de professores...">
    <div className="space-y-6">
      <RankingSortControls
        sortBy={sortBy}
        sortDir={sortDir}
        onSortByChange={setSortBy}
        onSortDirChange={setSortDir}
      />
      {courseSections.map((section) => (
        <Card key={section.course_label} className="overflow-hidden border border-border/70">
          <CardHeader className="bg-primary text-primary-foreground">
            <CardTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
                  <Trophy className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold">Ranking de professores</h1>
                  <p className="text-sm text-primary-foreground/90">
                    Todos os professores com alunos participantes na avaliação ou cartão-resposta selecionado
                  </p>
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
              <div className={RANKING_TABLE_SCROLL_CLASS}>
                <table className="w-full min-w-[1000px] text-sm border-collapse">
                  <thead>
                    <RankingMetricsTableHead
                      nameHeader="Professor(a)"
                      showParticipation={false}
                      leadingHeaders={
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-primary-foreground">
                          Turma / série
                        </th>
                      }
                      trailingHeaders={
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-primary-foreground">
                          Escola
                        </th>
                      }
                    />
                  </thead>
                  <tbody>
                    {section.items.map((item) => (
                      <RankingMetricsTableRow
                        key={String(item.teacher_id || item.position)}
                        rowKey={String(item.teacher_id || item.position)}
                        showParticipation={false}
                        row={{
                          ...item,
                          level_tag: item.classification,
                        }}
                        nameCell={String(item.teacher_name || "Professor")}
                        leadingCells={
                          <td className="px-3 py-2">
                            <Badge variant="secondary">{String(item.series_class_name || "N/A")}</Badge>
                          </td>
                        }
                        trailingCells={
                          <td className="px-3 py-2 text-sm text-muted-foreground">
                            {String(item.school_name || "—")}
                          </td>
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
    </RankingContentShell>
  );
}
