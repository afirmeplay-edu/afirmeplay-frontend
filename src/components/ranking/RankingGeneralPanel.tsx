import { AlertCircle, BookOpen, GraduationCap, Medal, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankingResponse } from "@/services/reports/rankingApi";
import { getClassShiftLabel } from "@/lib/classShift";
import { StudentRanking } from "@/components/evaluations/student/StudentRanking";

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

  const generalRankings = data?.general_rankings;
  const visibility = generalRankings?.visibility || {
    schools_by_course: true,
    series_by_school_and_course: false,
    classes_by_series: false,
    students_by_course: true,
  };

  const courseSections =
    generalRankings?.schools_by_course?.sections ||
    data?.course_sections ||
    [];
  const seriesBySchool = generalRankings?.series_by_school_and_course?.schools || [];
  const classesBySeries = generalRankings?.classes_by_series?.sections || [];
  const studentsByCourse = generalRankings?.students_by_course?.sections || [];

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

  return (
    <div className="space-y-4">
      <Card className="border border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Medal className="h-4 w-4 text-primary" />
              Ranking geral por escolas (separado por curso)
            </span>
            <Badge variant="secondary">{Number(data?.totals?.count || 0)} escolas</Badge>
          </CardTitle>
          {recorteLabel ? <p className="text-xs text-muted-foreground">Recorte: {recorteLabel}</p> : null}
        </CardHeader>
      </Card>

      {courseSections.length === 0 &&
      seriesBySchool.length === 0 &&
      classesBySeries.length === 0 &&
      studentsByCourse.length === 0 ? (
        <Card className="border border-dashed border-border/70">
          <CardContent className="py-8 text-sm text-muted-foreground">
            Nenhuma escola encontrada para os filtros selecionados.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {visibility.schools_by_course && courseSections.map((section) => (
            <Card key={section.course_label} className="overflow-hidden border border-border/70">
              <CardHeader className="border-b border-border/60 bg-muted/30 pb-3">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <Medal className="h-4 w-4 text-primary" />
                    Ranking de {section.course_label} - por escolas
                  </span>
                  <Badge variant="secondary">{Number(section.totals?.count || section.items?.length || 0)} escolas</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <Card className="border border-border/70">
                    <CardContent className="py-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Escolas avaliadas</p>
                      <p className="mt-1 text-3xl font-bold text-foreground">{Number(section.totals?.count || section.items?.length || 0)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border border-border/70">
                    <CardContent className="py-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Média do curso</p>
                      <p className="mt-1 text-3xl font-bold text-foreground">{Number(section.totals?.average_score || 0).toFixed(1)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/10">
                    <CardContent className="py-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-rose-700 dark:text-rose-300">Escolas em estado crítico</p>
                      <p className="mt-1 text-3xl font-bold text-rose-700 dark:text-rose-300">{Number(section.totals?.critical_schools_count || 0)}</p>
                      <p className="text-[11px] text-rose-600/90 dark:text-rose-300/80">Classificação: Abaixo do Básico</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="overflow-x-auto ranking-table-scroll">
                  <table className="w-full min-w-[980px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted/40 text-muted-foreground">
                        <th className="w-16 px-3 py-3 text-left text-xs font-semibold uppercase">Pos.</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Escola</th>
                        <th className="w-40 px-3 py-3 text-center text-xs font-semibold uppercase">Participação</th>
                        <th className="w-28 px-3 py-3 text-center text-xs font-semibold uppercase">Proficiência</th>
                        <th className="w-20 px-3 py-3 text-center text-xs font-semibold uppercase">Nota</th>
                        <th className="w-[360px] px-4 py-3 text-left text-xs font-semibold uppercase">Distribuição por nível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.items.map((school) => (
                        <tr
                          key={`${section.course_label}-${String(school.school_id || school.position)}`}
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
                              <p className="font-semibold text-foreground">{String(school.school_name || "Escola sem nome")}</p>
                              {school.classification === "Abaixo do Básico" ? (
                                <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">
                                  Escola em estado crítico
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center font-medium">
                            {`${Number(school.participating_students || 0)}/${Number(school.total_students || 0)}`}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="rounded-md bg-primary/10 px-2 py-1 text-sm font-bold text-primary">
                              {Number.isFinite(Number(school.average_proficiency)) ? Number(school.average_proficiency || 0).toFixed(1) : "-"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center font-semibold">
                            {Number.isFinite(Number(school.average_score)) ? Number(school.average_score || 0).toFixed(1) : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1.5">
                              <div className="relative pt-4">
                                <div className="h-2 w-full rounded-full bg-[linear-gradient(to_right,#e11d48_0%,#facc15_34%,#86efac_67%,#166534_100%)]" />
                                <div
                                  className="absolute top-0 -translate-x-1/2"
                                  style={{ left: `${getScorePointerPercent(Number(school.average_score || 0))}%` }}
                                  title={`Nível por nota: ${getLevelByScore(Number(school.average_score || 0))}`}
                                >
                                  <div className="h-0 w-0 border-l-[5px] border-r-[5px] border-t-[8px] border-l-transparent border-r-transparent border-t-slate-900 dark:border-t-white" />
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-600" />Abaixo do Básico</span>
                                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-400" />Básico</span>
                                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-300" />Adequado</span>
                                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-800" />Avançado</span>
                              </div>
                              <p className="text-[11px] font-medium text-muted-foreground">
                                Nível atual por nota: <span className="text-foreground">{getLevelByScore(Number(school.average_score || 0))}</span>
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
          ))}

          {visibility.series_by_school_and_course && seriesBySchool.map((schoolSection) => (
            <Card key={String(schoolSection.school_id || schoolSection.school_name)} className="overflow-hidden border border-border/70">
              <CardHeader className="border-b border-border/60 bg-muted/30 pb-3">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-primary" />
                    Ranking de séries da escola: {String(schoolSection.school_name || "Escola")}
                  </span>
                  <Badge variant="secondary">{Number(schoolSection.totals?.series_count || 0)} séries</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                {(schoolSection.course_sections || []).map((courseSection) => (
                  <Card key={`${String(schoolSection.school_id)}-${courseSection.course_label}`} className="border border-border/70">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Curso: {courseSection.course_label}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto ranking-table-scroll">
                        <table className="w-full min-w-[840px] border-collapse text-sm">
                          <thead>
                            <tr className="bg-muted/40 text-muted-foreground">
                              <th className="w-16 px-3 py-3 text-left text-xs font-semibold uppercase">Pos.</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Série</th>
                              <th className="w-28 px-3 py-3 text-center text-xs font-semibold uppercase">Participação</th>
                              <th className="w-28 px-3 py-3 text-center text-xs font-semibold uppercase">Proficiência</th>
                              <th className="w-20 px-3 py-3 text-center text-xs font-semibold uppercase">Nota</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(courseSection.items || []).map((seriesItem) => (
                              <tr key={`${String(schoolSection.school_id)}-${String(seriesItem.grade_id || seriesItem.position)}`} className="border-t border-border/70 bg-card">
                                <td className="px-3 py-3 text-center font-semibold">{Number(seriesItem.position || 0)}º</td>
                                <td className="px-4 py-3 font-medium">{String(seriesItem.grade_name || "Sem série")}</td>
                                <td className="px-3 py-3 text-center">{`${Number(seriesItem.participating_students || 0)}/${Number(seriesItem.total_students || 0)}`}</td>
                                <td className="px-3 py-3 text-center">{Number(seriesItem.average_proficiency || 0).toFixed(1)}</td>
                                <td className="px-3 py-3 text-center">{Number(seriesItem.average_score || 0).toFixed(1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          ))}

          {visibility.classes_by_series && classesBySeries.map((seriesSection) => (
            <Card key={seriesSection.grade_name} className="overflow-hidden border border-border/70">
              <CardHeader className="border-b border-border/60 bg-muted/30 pb-3">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    Ranking de turmas da série: {seriesSection.grade_name}
                  </span>
                  <Badge variant="secondary">{Number(seriesSection.totals?.count || seriesSection.items?.length || 0)} turmas</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto ranking-table-scroll">
                  <table className="w-full min-w-[980px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted/40 text-muted-foreground">
                        <th className="w-16 px-3 py-3 text-left text-xs font-semibold uppercase">Pos.</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Turma</th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase">Turno</th>
                        <th className="w-20 px-3 py-3 text-center text-xs font-semibold uppercase">Nota</th>
                        <th className="w-24 px-3 py-3 text-center text-xs font-semibold uppercase">Acerto %</th>
                        <th className="w-24 px-3 py-3 text-center text-xs font-semibold uppercase">Conclusão</th>
                        <th className="w-20 px-3 py-3 text-center text-xs font-semibold uppercase">Alunos</th>
                        <th className="w-24 px-3 py-3 text-center text-xs font-semibold uppercase">Avaliações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(seriesSection.items || []).map((classItem) => (
                        <tr key={String(classItem.class_id || classItem.position)} className="border-t border-border/70 bg-card">
                          <td className="px-3 py-3 text-center font-semibold">{Number(classItem.position || 0)}º</td>
                          <td className="px-4 py-3 font-medium">{String(classItem.class_name || "Sem turma")}</td>
                          <td className="px-3 py-3 text-muted-foreground">{getClassShiftLabel(classItem.shift)}</td>
                          <td className="px-3 py-3 text-center">{Number(classItem.average_score || 0).toFixed(1)}</td>
                          <td className="px-3 py-3 text-center">{Number(classItem.accuracy_percent || 0).toFixed(1)}%</td>
                          <td className="px-3 py-3 text-center">{Number(classItem.completion_rate || 0).toFixed(1)}%</td>
                          <td className="px-3 py-3 text-center">{Number(classItem.students_count || 0)}</td>
                          <td className="px-3 py-3 text-center">{Number(classItem.evaluations_count || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}

          {visibility.students_by_course && studentsByCourse.map((courseSection) => {
            const students = (courseSection.items || []).map((item) => ({
              id: String(item.student_id || ""),
              nome: String(item.name || ""),
              turma: String(item.class_name || "Sem turma"),
              shift: String(item.shift || ""),
              escola: String(item.school_name || ""),
              serie: String(item.serie || ""),
              nota: Number(item.average_score || 0),
              proficiencia: Number(item.average_proficiency || 0),
              classificacao: String(item.classification || ""),
              status: "concluida" as const,
              posicao: Number(item.position || 0),
            }));

            return (
              <Card key={courseSection.course_label} className="overflow-hidden border border-border/70">
                <CardHeader className="border-b border-border/60 bg-muted/30 pb-3">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      Ranking de alunos por curso: {courseSection.course_label}
                    </span>
                    <Badge variant="secondary">{students.length} alunos</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {students.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum aluno encontrado para este curso.</p>
                  ) : (
                    <StudentRanking students={students} backendRankingOrder maxStudents={200} />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border border-border/70">
        <CardContent className="py-4 text-xs">
          <p className="mb-2 font-semibold text-muted-foreground">Legenda de níveis de desempenho:</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-rose-600" />Abaixo do Básico</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-yellow-400" />Básico</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-green-300" />Adequado</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-green-800" />Avançado</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default RankingGeneralPanel;
