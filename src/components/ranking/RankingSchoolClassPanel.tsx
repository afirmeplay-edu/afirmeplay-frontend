import { useEffect, useMemo, useState } from "react";
import { AlertCircle, School } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RankingResponse } from "@/services/reports/rankingApi";
import RankingClassesPanel from "@/components/ranking/RankingClassesPanel";
import { LevelTag, PosBadge, formatPt } from "@/components/ranking/RankingVisualPrimitives";

type Props = {
  data?: RankingResponse;
  isLoading: boolean;
  errorMessage?: string;
  filterSchoolId?: string;
  filterSerieId?: string;
  filterSchoolName?: string;
  filterSerieName?: string;
};

export default function RankingSchoolClassPanel({
  data,
  isLoading,
  errorMessage,
  filterSchoolId,
  filterSerieId,
  filterSchoolName,
  filterSerieName,
}: Props) {
  const options = data?.school_class_ranking?.school_options || [];
  const itemsBySchool = data?.school_class_ranking?.items_by_school || {};
  const lockedSchoolId = filterSchoolId || "";
  const initialSchoolId = lockedSchoolId || options[0]?.id || "";
  const [selectedSchoolId, setSelectedSchoolId] = useState(initialSchoolId);
  const [selectedCourseLabel, setSelectedCourseLabel] = useState("all");

  const selectedSchoolRows = useMemo(() => {
    if (!selectedSchoolId) return [];
    return itemsBySchool[selectedSchoolId] || [];
  }, [itemsBySchool, selectedSchoolId]);

  const courseOptions = useMemo(() => {
    const unique = Array.from(
      new Set(selectedSchoolRows.map((row) => String(row.course_label || "").trim()).filter(Boolean))
    );
    return unique.sort((a, b) => a.localeCompare(b));
  }, [selectedSchoolRows]);

  const selectedRows = useMemo(() => {
    if (selectedCourseLabel === "all") return selectedSchoolRows;
    return selectedSchoolRows.filter((row) => String(row.course_label || "") === selectedCourseLabel);
  }, [selectedSchoolRows, selectedCourseLabel]);

  useEffect(() => {
    if (lockedSchoolId) {
      setSelectedSchoolId(lockedSchoolId);
      return;
    }
    if (!selectedSchoolId && options[0]?.id) {
      setSelectedSchoolId(options[0].id);
    }
  }, [selectedSchoolId, options, lockedSchoolId]);

  useEffect(() => {
    setSelectedCourseLabel("all");
  }, [selectedSchoolId]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">
          Carregando ranking por escola/turma...
        </CardContent>
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

  if (filterSerieId) {
    return (
      <RankingClassesPanel
        data={data}
        isLoading={isLoading}
        errorMessage={errorMessage}
        gradeLabel={filterSerieName}
      />
    );
  }

  const schoolName =
    filterSchoolName || options.find((option) => option.id === selectedSchoolId)?.name || "Selecione a escola";

  return (
    <div className="space-y-4">
      {!lockedSchoolId ? (
        <Card className="border border-border/70">
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-2">
              <School className="h-4 w-4 text-primary" />
              Ranking por escola/turma
            </CardTitle>
            <div className="grid gap-3 md:max-w-2xl md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ranking-school-select">Escola</Label>
                <Select value={selectedSchoolId || "none"} onValueChange={(v) => setSelectedSchoolId(v === "none" ? "" : v)}>
                  <SelectTrigger id="ranking-school-select">
                    <SelectValue placeholder="Selecione a escola" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.length === 0 ? (
                      <SelectItem value="none">Sem escolas no recorte</SelectItem>
                    ) : (
                      options.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ranking-course-select">Disciplina</Label>
                <Select
                  value={selectedCourseLabel}
                  onValueChange={setSelectedCourseLabel}
                  disabled={courseOptions.length === 0}
                >
                  <SelectTrigger id="ranking-course-select">
                    <SelectValue placeholder="Selecione a disciplina" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {courseOptions.map((course) => (
                      <SelectItem key={course} value={course}>
                        {course}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <Card className="overflow-hidden border border-border/70">
        <CardHeader className="bg-primary text-primary-foreground">
          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-wide text-primary-foreground/90">
              {lockedSchoolId ? "Escola do filtro" : "Escola selecionada"}
            </p>
            <h3 className="text-lg font-semibold">{schoolName}</h3>
            {lockedSchoolId ? (
              <p className="text-xs text-primary-foreground/85">
                Selecione uma série no filtro para ver o ranking de turmas.
              </p>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {selectedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum dado de série para a escola selecionada.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full min-w-[980px] text-sm border-collapse">
                <thead>
                  <tr className="bg-primary text-primary-foreground">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Pos.</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Série</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Professor(a)</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Disciplina</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold uppercase">Participação</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Proficiência</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Nota</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold uppercase">Nível</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.map((row) => (
                    <tr
                      key={`${selectedSchoolId}-${row.position}-${row.series_class_name}`}
                      className="border-t border-border/60 odd:bg-muted/20"
                    >
                      <td className="px-3 py-2">
                        <PosBadge position={Number(row.position || 0)} />
                      </td>
                      <td className="px-3 py-2 font-semibold">{row.series_class_name}</td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary">{row.teacher_name || "N/A"}</Badge>
                      </td>
                      <td className="px-3 py-2">{String(row.course_label || "—")}</td>
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
    </div>
  );
}
