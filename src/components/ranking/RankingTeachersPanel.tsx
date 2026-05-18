import { AlertCircle, Award, Medal, Star, Trophy, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankingResponse } from "@/services/reports/rankingApi";
import { getReportProficiencyTagClass } from "@/utils/report/reportTagStyles";
import { getMedalEmoji, getPositionHighlightClass, getPositionTextColor } from "@/utils/coins";

type Props = {
  data?: RankingResponse;
  isLoading: boolean;
  errorMessage?: string;
};

export function RankingTeachersPanel({ data, isLoading, errorMessage }: Props) {
  if (isLoading) {
    return (
      <Card className="border border-border/70">
        <CardContent className="py-10 text-sm text-muted-foreground">Carregando ranking de professores...</CardContent>
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

  const items = data?.items || [];
  const getRankingIcon = (position: number) => {
    const medalEmoji = getMedalEmoji(position);
    if (medalEmoji) return <span className="text-2xl">{medalEmoji}</span>;
    if (position === 1) return <Trophy className="h-6 w-6 text-amber-500" />;
    if (position === 2) return <Medal className="h-6 w-6 text-muted-foreground" />;
    if (position === 3) return <Award className="h-6 w-6 text-amber-600 dark:text-amber-500" />;
    return <span className="text-lg font-bold text-muted-foreground">{position}</span>;
  };

  const getRankingBackground = (position: number) => {
    const highlightClass = getPositionHighlightClass(position);
    if (highlightClass) return highlightClass;
    return "bg-card border-border";
  };

  return (
    <div className="space-y-4">
      <Card className="border border-border shadow-lg">
        <CardHeader className="bg-gradient-to-r from-purple-700 to-purple-600 text-white">
          <CardTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
                <Trophy className="h-6 w-6 text-purple-200" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Ranking de professores</h1>
                <p className="text-sm text-purple-100">Classificação por proficiência média</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-purple-100">
              <Users className="h-4 w-4" />
              <span className="text-sm font-medium">
                {items.length} {items.length === 1 ? "professor" : "professores"}
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {items.length === 0 ? (
            <div className="py-12 text-center">
              <Trophy className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold text-foreground">Nenhum professor encontrado</h3>
              <p className="text-muted-foreground">Não há dados de desempenho para os filtros selecionados.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const position = Number(item.position || 0);
                const positionColor = getPositionTextColor(position);
                return (
                  <div
                    key={String(item.teacher_id || item.position)}
                    className={`flex flex-col items-start gap-4 rounded-lg border p-4 transition-all duration-200 hover:shadow-md sm:flex-row sm:items-center ${getRankingBackground(position)}`}
                  >
                    <div
                      className={`flex h-12 w-12 items-center justify-center self-center rounded-lg border-2 bg-card shadow-sm sm:self-auto ${
                        position <= 3 ? "border-yellow-400 dark:border-yellow-600" : "border-border"
                      }`}
                    >
                      {getRankingIcon(position)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-3">
                        <h3 className={`truncate text-base font-semibold ${positionColor}`}>
                          {String(item.teacher_name || "Professor")}
                        </h3>
                        {position <= 3 ? (
                          <Badge className="border-yellow-300 bg-yellow-100 text-xs font-bold text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400">
                            {position}º Lugar
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mb-2 text-xs text-muted-foreground">{String(item.teacher_email || "E-mail não informado")}</p>

                      <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                          <span className="font-medium">Nota:</span>
                          <span className="font-semibold text-foreground">{Number(item.average_score || 0).toFixed(1)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          <span className="font-medium">Proficiência:</span>
                          <span className="font-semibold text-foreground">{Number(item.average_proficiency || 0).toFixed(1)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">Avaliações:</span>
                          <span className="font-semibold text-foreground">{Number(item.total_evaluations || 0)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">Turmas:</span>
                          <span className="font-semibold text-foreground">{Number(item.classes_count || 0)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-1 sm:items-end">
                      <div className="text-xs font-medium text-muted-foreground">Nível</div>
                      <Badge className={getReportProficiencyTagClass(String(item.classification || ""))}>
                        {String(item.classification || "—")}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
