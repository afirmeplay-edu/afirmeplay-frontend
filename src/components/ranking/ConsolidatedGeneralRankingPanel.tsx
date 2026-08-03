import { AlertCircle, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RankingContentShell, RankingLoadingState } from "@/components/ranking/RankingLoadingState";
import { LevelTag, PosBadge, formatPt } from "@/components/ranking/RankingVisualPrimitives";
import { RANKING_TABLE_SCROLL_CLASS } from "@/components/ranking/RankingMetricsTable";
import { getClassShiftLabel } from "@/lib/classShift";
import type { ConsolidatedGeneralRankingResponse } from "@/services/reports/rankingApi";

type Props = {
  data?: ConsolidatedGeneralRankingResponse;
  isLoading: boolean;
  isRefreshing?: boolean;
  errorMessage?: string;
  page: number;
  onPageChange: (page: number) => void;
};

export default function ConsolidatedGeneralRankingPanel({
  data,
  isLoading,
  isRefreshing,
  errorMessage,
  page,
  onPageChange,
}: Props) {
  if (isLoading) {
    return <RankingLoadingState message="Carregando ranking geral..." variant="table" />;
  }

  if (errorMessage) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    );
  }

  const items = data?.students || [];
  const pagination = data?.pagination;
  const totalPages = Math.max(1, Number(pagination?.total_pages || 1));
  const currentPage = Number(pagination?.page || page || 1);
  const total = Number(pagination?.total ?? data?.totals?.students_count ?? items.length);

  return (
    <RankingContentShell isRefreshing={isRefreshing} refreshingMessage="Atualizando ranking geral...">
      <div className="space-y-4">
        {data?.evaluation_title || (data?.evaluations && data.evaluations.length > 0) ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {data.evaluation_title ||
                data.evaluations?.map((item) => item.title).filter(Boolean).join(" · ")}
            </span>
            {(data.evaluation_ids?.length || data.evaluations?.length || 0) > 1 ? (
              <Badge variant="secondary" className="text-xs">
                {data.evaluation_ids?.length || data.evaluations?.length} avaliações
              </Badge>
            ) : null}
            <span>·</span>
            <span className="capitalize">{String(data.scope || "municipio")}</span>
          </div>
        ) : null}

        <Card className="overflow-hidden border border-border/70">
          <CardHeader className="bg-muted/40 py-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Ranking geral de alunos
              </span>
              <Badge variant="secondary">
                {total} aluno{total === 1 ? "" : "s"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum aluno encontrado para os filtros selecionados.
              </p>
            ) : (
              <div className={RANKING_TABLE_SCROLL_CLASS}>
                <table className="w-full min-w-[1200px] text-sm border-collapse">
                  <thead>
                    <tr className="bg-primary text-primary-foreground">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Pos.</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Aluno</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Escola</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Série</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Turma</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Categoria</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Proficiência</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Nota</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Acertos</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold uppercase">Nível</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr
                        key={String(row.student_id || `${row.position}-${row.name}`)}
                        className="border-t border-border/60 odd:bg-muted/20"
                      >
                        <td className="px-3 py-2">
                          <PosBadge position={Number(row.position || 0)} />
                        </td>
                        <td className="px-3 py-2 font-semibold">{row.name || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.school_display_name || row.school_name || "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.serie_name || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.class_name || "—"}
                          {row.shift ? ` · ${getClassShiftLabel(row.shift)}` : ""}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.category || "—"}</td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {formatPt(Number(row.proficiency || 0))}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-primary">
                          {formatPt(Number(row.grade || 0))}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {Number(row.correct_answers || 0)}/{Number(row.total_questions || 0)}
                          {row.accuracy_rate != null
                            ? ` (${formatPt(Number(row.accuracy_rate))}%)`
                            : ""}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <LevelTag value={row.classification} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Página {currentPage} de {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={currentPage <= 1}
                    onClick={() => onPageChange(currentPage - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={currentPage >= totalPages}
                    onClick={() => onPageChange(currentPage + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </RankingContentShell>
  );
}
