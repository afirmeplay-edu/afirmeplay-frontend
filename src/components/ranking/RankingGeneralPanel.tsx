import { AlertCircle, Medal } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentRanking } from "@/components/evaluations/student/StudentRanking";
import type { RankingResponse } from "@/services/reports/rankingApi";

type Props = {
  data?: RankingResponse;
  isLoading: boolean;
  errorMessage?: string;
  recorteLabel?: string;
};

export function RankingGeneralPanel({ data, isLoading, errorMessage, recorteLabel }: Props) {
  if (isLoading) {
    return (
      <Card className="border border-border/70">
        <CardContent className="py-10 text-sm text-muted-foreground">Carregando ranking geral...</CardContent>
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

  const schools = (data?.items || []).map((item) => ({
    id: String(item.school_id || ""),
    name: String(item.school_name || "Escola sem nome"),
    position: Number(item.position || 0),
    averageScore: Number(item.average_score ?? item.media ?? 0),
    averageProficiency: Number(item.average_proficiency ?? item.average_score ?? item.media ?? 0),
    participationRate: Number(item.participation_rate ?? item.completion_rate ?? item.taxa_conclusao ?? 0),
    totalEvaluations: Number(item.total_evaluations ?? item.quantidade_avaliacoes ?? 0),
    totalStudents: Number(item.total_students ?? item.students_count ?? item.quantidade_alunos ?? 0),
    classification: String(item.classification || ""),
    series: Array.isArray(item.series) ? item.series : [],
  }));
  const studentsSource = (data?.students_items || data?.items || []) as Array<Record<string, unknown>>;
  const students = studentsSource.map((item) => ({
    id: String(item.student_id || ""),
    nome: String(item.name || ""),
    turma: String(item.class_name || "Sem turma"),
    escola: String(item.school_name || ""),
    serie: String(item.serie || ""),
    nota: Number(item.average_score || 0),
    proficiencia: Number(item.average_proficiency || item.average_score || 0),
    classificacao: String(item.classification || ""),
    status: "concluida" as const,
    posicao: Number(item.position || 0),
  }));

  const levelOrder = ["Abaixo do Básico", "Básico", "Adequado", "Avançado"] as const;

  const schoolStats = schools.map((school) => {
    const bucket = {
      "Abaixo do Básico": 0,
      "Básico": 0,
      "Adequado": 0,
      "Avançado": 0,
    } as Record<(typeof levelOrder)[number], number>;
    let totalWeight = 0;

    for (const rawSeries of school.series) {
      const series = rawSeries as Record<string, unknown>;
      const level = String(series.classification || "");
      const studentsCount = Number(series.students_count || 0);
      const weight = studentsCount > 0 ? studentsCount : 1;
      if (levelOrder.includes(level as (typeof levelOrder)[number])) {
        bucket[level as (typeof levelOrder)[number]] += weight;
        totalWeight += weight;
      }
    }

    const normalizedTotal = totalWeight > 0 ? totalWeight : 1;
    const distribution = {
      belowBasic: (bucket["Abaixo do Básico"] / normalizedTotal) * 100,
      basic: (bucket["Básico"] / normalizedTotal) * 100,
      adequate: (bucket["Adequado"] / normalizedTotal) * 100,
      advanced: (bucket["Avançado"] / normalizedTotal) * 100,
    };

    const fallbackParticipation =
      school.totalStudents > 0 ? Math.min(100, (school.totalEvaluations / school.totalStudents) * 100) : 0;
    const participation = school.participationRate > 0 ? school.participationRate : fallbackParticipation;
    const safeAverageScore = Number.isFinite(school.averageScore) ? school.averageScore : 0;
    const safeAverageProficiency = Number.isFinite(school.averageProficiency) ? school.averageProficiency : 0;

    return {
      ...school,
      averageScore: safeAverageScore,
      averageProficiency: safeAverageProficiency,
      participation,
      distribution,
    };
  });

  const getLevelByScore = (score: number): "Abaixo do Básico" | "Básico" | "Adequado" | "Avançado" => {
    if (score < 4) return "Abaixo do Básico";
    if (score < 6) return "Básico";
    if (score < 8) return "Adequado";
    return "Avançado";
  };

  const getScorePointerPercent = (score: number): number => {
    const normalized = (Number(score || 0) / 10) * 100;
    return Math.max(0, Math.min(100, normalized));
  };

  const avgMunicipio =
    schoolStats.length > 0
      ? schoolStats.reduce((acc, school) => acc + Number(school.averageScore || 0), 0) / schoolStats.length
      : 0;
  const escolasCriticas = schoolStats.filter((school) => school.classification === "Abaixo do Básico").length;

  return (
    <div className="space-y-4">
      <Card className="border border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Medal className="h-4 w-4 text-primary" />
              Ranking geral consolidado (escolas em prioridade)
            </span>
            <Badge variant="secondary">{Number(data?.totals?.count || schools.length)} escolas</Badge>
          </CardTitle>
          {recorteLabel ? <p className="text-xs text-muted-foreground">Recorte: {recorteLabel}</p> : null}
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border border-border/70">
          <CardContent className="py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Escolas avaliadas</p>
            <p className="mt-1 text-3xl font-bold text-foreground">{Number(data?.totals?.count || schools.length)}</p>
          </CardContent>
        </Card>
        <Card className="border border-border/70">
          <CardContent className="py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Média do município</p>
            <p className="mt-1 text-3xl font-bold text-foreground">{avgMunicipio.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card className="border border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/10">
          <CardContent className="py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-rose-700 dark:text-rose-300">Escolas em estado crítico</p>
            <p className="mt-1 text-3xl font-bold text-rose-700 dark:text-rose-300">{escolasCriticas}</p>
            <p className="text-[11px] text-rose-600/90 dark:text-rose-300/80">Classificação: Abaixo do Básico</p>
          </CardContent>
        </Card>
      </div>

      {schoolStats.length === 0 ? (
        <Card className="border border-dashed border-border/70">
          <CardContent className="py-8 text-sm text-muted-foreground">
            Nenhuma escola encontrada para os filtros selecionados.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden border border-border/70">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/40 text-muted-foreground">
                    <th className="w-16 px-3 py-3 text-left text-xs font-semibold uppercase">Pos.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Escola</th>
                    <th className="w-28 px-3 py-3 text-center text-xs font-semibold uppercase">Participação</th>
                    <th className="w-28 px-3 py-3 text-center text-xs font-semibold uppercase">Proficiência</th>
                    <th className="w-20 px-3 py-3 text-center text-xs font-semibold uppercase">Nota</th>
                    <th className="w-[360px] px-4 py-3 text-left text-xs font-semibold uppercase">Distribuição por nível</th>
                  </tr>
                </thead>
                <tbody>
                  {schoolStats.map((school) => (
                    <tr
                      key={school.id || school.position}
                      className={`border-t border-border/70 ${
                        school.classification === "Abaixo do Básico"
                          ? "bg-rose-50/80 dark:bg-rose-950/20"
                          : "bg-card"
                      }`}
                    >
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-flex min-w-8 items-center justify-center rounded-full px-2 py-1 text-xs font-bold ${
                            school.position === 1
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                              : school.position === 2
                                ? "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                                : school.position === 3
                                  ? "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"
                                  : "bg-muted text-foreground"
                          }`}
                        >
                          {school.position}º
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">{school.name}</p>
                          {school.classification === "Abaixo do Básico" ? (
                            <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">
                              Escola em estado crítico
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center font-medium">
                        {Number.isFinite(school.participation) ? `${school.participation.toFixed(1)}%` : "-"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="rounded-md bg-primary/10 px-2 py-1 text-sm font-bold text-primary">
                        {Number.isFinite(school.averageProficiency) ? school.averageProficiency.toFixed(0) : "-"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center font-semibold">
                        {Number.isFinite(school.averageScore) ? school.averageScore.toFixed(1) : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1.5">
                          <div className="relative pt-4">
                            <div className="h-2 w-full rounded-full bg-[linear-gradient(to_right,#e11d48_0%,#facc15_34%,#22c55e_67%,#065f46_100%)]" />
                            <div
                              className="absolute top-0 -translate-x-1/2"
                              style={{ left: `${getScorePointerPercent(school.averageScore)}%` }}
                              title={`Nível por nota: ${getLevelByScore(school.averageScore)}`}
                            >
                              <div className="h-0 w-0 border-l-[5px] border-r-[5px] border-t-[8px] border-l-transparent border-r-transparent border-t-slate-900 dark:border-t-white" />
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-600" />Abaixo do Básico</span>
                            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-400" />Básico</span>
                            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-600" />Adequado</span>
                            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-700" />Avançado</span>
                          </div>
                          <p className="text-[11px] font-medium text-muted-foreground">
                            Nível atual por nota: <span className="text-foreground">{getLevelByScore(school.averageScore)}</span>
                          </p>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Medal className="h-4 w-4 text-primary" />
              Ranking de alunos (secundário)
            </span>
            <Badge variant="secondary">{Number(data?.students_totals?.count || students.length)} alunos</Badge>
          </CardTitle>
        </CardHeader>
      </Card>
      {students.length === 0 ? (
        <Card className="border border-dashed border-border/70">
          <CardContent className="py-8 text-sm text-muted-foreground">
            Nenhum aluno encontrado para os filtros selecionados.
          </CardContent>
        </Card>
      ) : (
        <StudentRanking students={students} backendRankingOrder maxStudents={50} />
      )}

      <Card className="border border-border/70">
        <CardContent className="py-4 text-xs">
          <p className="mb-2 font-semibold text-muted-foreground">Legenda de níveis de desempenho:</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-rose-600" />Abaixo do Básico</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-yellow-400" />Básico</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-green-600" />Adequado</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-emerald-700" />Avançado</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
