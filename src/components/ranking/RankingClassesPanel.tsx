import { AlertCircle, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankingResponse } from "@/services/reports/rankingApi";
import { LevelTag, PosBadge, formatPt } from "@/components/ranking/RankingVisualPrimitives";

type Props = {
  data?: RankingResponse;
  isLoading: boolean;
  errorMessage?: string;
  gradeLabel?: string;
};

export default function RankingClassesPanel({ data, isLoading, errorMessage, gradeLabel }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">Carregando ranking de turmas...</CardContent>
      </Card>
    );
  }
  if (errorMessage) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    );
  }

  const items = data?.classes_ranking?.items || [];
  const titleGrade = gradeLabel || data?.classes_ranking?.grade_name || "Série";

  return (
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
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full min-w-[900px] text-sm border-collapse">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Pos.</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Turma</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase">Participação</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Proficiência</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Nota</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase">Nível</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={String(row.class_id || row.position)}
                    className={`border-t border-border/60 odd:bg-muted/20 ${row.is_critical ? "bg-rose-50/90 dark:bg-rose-950/20" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <PosBadge position={Number(row.position || 0)} />
                    </td>
                    <td className="px-3 py-2 font-semibold">{String(row.class_name || "Turma")}</td>
                    <td className="px-3 py-2 text-center">
                      {formatPt(Number(row.participation_rate || 0))}% ({Number(row.participating_students || 0)}/
                      {Number(row.total_students || 0)})
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{formatPt(Number(row.average_proficiency || 0))}</td>
                    <td className="px-3 py-2 text-right font-semibold text-primary">{formatPt(Number(row.average_score || 0))}</td>
                    <td className="px-3 py-2 text-center">
                      <LevelTag value={row.level_tag} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

