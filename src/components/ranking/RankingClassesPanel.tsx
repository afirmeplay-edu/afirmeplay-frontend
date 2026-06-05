import { useMemo } from "react";
import { AlertCircle, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankingResponse } from "@/services/reports/rankingApi";
import { getClassShiftLabel } from "@/lib/classShift";
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
  gradeLabel?: string;
};

export default function RankingClassesPanel({ data, isLoading, isRefreshing, errorMessage, gradeLabel }: Props) {
  const { sortBy, sortDir, setSortBy, setSortDir, sortRows } = useRankingSort();
  const rawItems = data?.classes_ranking?.items || [];
  const items = useMemo(
    () => sortRows(rawItems as Array<Record<string, unknown>>),
    [rawItems, sortRows]
  );
  const titleGrade = gradeLabel || data?.classes_ranking?.grade_name || "Série";

  if (isLoading) {
    return <RankingLoadingState message="Carregando ranking de turmas..." variant="table" />;
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
    <RankingContentShell isRefreshing={isRefreshing} refreshingMessage="Atualizando ranking de turmas...">
    <div className="space-y-4">
      <RankingSortControls
        sortBy={sortBy}
        sortDir={sortDir}
        onSortByChange={setSortBy}
        onSortDirChange={setSortDir}
      />
    <Card className="overflow-hidden border border-border/70">
      <CardHeader className="bg-primary text-primary-foreground">
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Ranking de turmas — {titleGrade}
          </span>
          <Badge className="bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20">
            {items.length} turmas
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma turma com participação na avaliação ou cartão-resposta para esta série.
          </p>
        ) : (
          <div className={RANKING_TABLE_SCROLL_CLASS}>
            <table className="w-full min-w-[1100px] text-sm border-collapse">
              <thead>
                <RankingMetricsTableHead
                  nameHeader="Série / Turma"
                  leadingHeaders={<th className="px-3 py-2 text-xs font-semibold uppercase text-left">Turno</th>}
                />
              </thead>
              <tbody>
                {items.map((row) => (
                  <RankingMetricsTableRow
                    key={String(row.class_id || row.position)}
                    rowKey={String(row.class_id || row.position)}
                    row={row}
                    nameCell={String(row.class_name || "Turma")}
                    leadingCells={
                      <td className="px-3 py-2 text-muted-foreground">
                        {getClassShiftLabel(String(row.shift || ""))}
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
    </div>
    </RankingContentShell>
  );
}

