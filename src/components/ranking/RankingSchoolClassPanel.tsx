import { useEffect, useMemo, useState } from "react";
import { AlertCircle, School } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RankingResponse } from "@/services/reports/rankingApi";
import RankingClassesPanel from "@/components/ranking/RankingClassesPanel";
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
  filterSchoolId?: string;
  filterSerieId?: string;
  filterSchoolName?: string;
  filterSerieName?: string;
};

export default function RankingSchoolClassPanel({
  data,
  isLoading,
  isRefreshing,
  errorMessage,
  filterSchoolId,
  filterSerieId,
  filterSchoolName,
  filterSerieName,
}: Props) {
  const { sortBy, sortDir, setSortBy, setSortDir, sortRows } = useRankingSort();
  const options = useMemo(
    () => data?.school_class_ranking?.school_options || [],
    [data?.school_class_ranking?.school_options]
  );
  const itemsBySchool = useMemo(
    () => data?.school_class_ranking?.items_by_school || {},
    [data?.school_class_ranking?.items_by_school]
  );
  const lockedSchoolId = filterSchoolId || "";
  const initialSchoolId = lockedSchoolId || "all";
  const [selectedSchoolId, setSelectedSchoolId] = useState(initialSchoolId);
  const [selectedTurma, setSelectedTurma] = useState("all");

  const selectedSchoolRows = useMemo(() => {
    if (!selectedSchoolId || selectedSchoolId === "all") {
      const allRows: Array<Record<string, unknown> & { school_id?: string; school_name?: string; average_score?: number; position?: number; series_class_name?: string }> = [];
      Object.entries(itemsBySchool).forEach(([schoolId, rows]) => {
        const schoolName = options.find(opt => opt.id === schoolId)?.name || schoolId;
        rows.forEach(row => {
          allRows.push({
            ...row,
            school_id: schoolId,
            school_name: schoolName,
          });
        });
      });
      allRows.sort((a, b) => (b.average_score ?? 0) - (a.average_score ?? 0));
      return allRows.map((row, index) => ({ ...row, position: index + 1 }));
    }
    return itemsBySchool[selectedSchoolId] || [];
  }, [itemsBySchool, selectedSchoolId, options]);

  const turmaOptions = useMemo(() => {
    const unique = Array.from(
      new Set(selectedSchoolRows.map((row) => String(row.series_class_name || "").trim()).filter(Boolean))
    );
    return unique.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [selectedSchoolRows]);

  const filteredRows = useMemo(() => {
    if (selectedTurma === "all") return selectedSchoolRows;
    return selectedSchoolRows.filter((row) => String(row.series_class_name || "") === selectedTurma);
  }, [selectedSchoolRows, selectedTurma]);

  const selectedRows = useMemo(
    () => sortRows(filteredRows as Array<Record<string, unknown>>),
    [filteredRows, sortRows]
  );

  useEffect(() => {
    if (lockedSchoolId) {
      setSelectedSchoolId(lockedSchoolId);
      return;
    }
    if (!selectedSchoolId && options.length > 0) {
      setSelectedSchoolId("all");
    }
  }, [selectedSchoolId, options, lockedSchoolId]);

  useEffect(() => {
    setSelectedTurma("all");
  }, [selectedSchoolId]);

  if (isLoading) {
    return <RankingLoadingState message="Carregando ranking por escola/série..." variant="table" />;
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
        isRefreshing={isRefreshing}
        errorMessage={errorMessage}
        gradeLabel={filterSerieName}
      />
    );
  }

  const schoolName =
    filterSchoolName || 
    (selectedSchoolId === "all" ? "Todas as escolas do município" : options.find((option) => option.id === selectedSchoolId)?.name) || 
    "Selecione a escola";
  
  const showSchoolColumn = selectedSchoolId === "all";

  return (
    <RankingContentShell isRefreshing={isRefreshing} refreshingMessage="Atualizando ranking por escola/série...">
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
                <Select value={selectedSchoolId || "all"} onValueChange={(v) => setSelectedSchoolId(v)}>
                  <SelectTrigger id="ranking-school-select">
                    <SelectValue placeholder="Selecione a escola" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.length === 0 ? (
                      <SelectItem value="none">Sem escolas no recorte</SelectItem>
                    ) : (
                      <>
                        <SelectItem value="all">Todas as escolas</SelectItem>
                        {options.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ranking-turma-select">Turma</Label>
                <Select
                  value={selectedTurma}
                  onValueChange={setSelectedTurma}
                  disabled={turmaOptions.length === 0}
                >
                  <SelectTrigger id="ranking-turma-select">
                    <SelectValue placeholder="Selecione a turma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {turmaOptions.map((turma) => (
                      <SelectItem key={turma} value={turma}>
                        {turma}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <RankingSortControls
        sortBy={sortBy}
        sortDir={sortDir}
        onSortByChange={setSortBy}
        onSortDirChange={setSortDir}
      />

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
            <p className="text-sm text-muted-foreground">
              Nenhuma turma encontrada{selectedSchoolId === "all" ? " no município" : " para a escola"}{selectedTurma !== "all" ? " e turma selecionadas" : selectedSchoolId !== "all" ? " selecionada" : ""}.
            </p>
          ) : (
            <div className={RANKING_TABLE_SCROLL_CLASS}>
              <table className="w-full min-w-[1200px] text-sm border-collapse">
                <thead>
                  <RankingMetricsTableHead
                    nameHeader="Série / Turma"
                    leadingHeaders={
                      <>
                        {showSchoolColumn && (
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-primary-foreground">
                            Escola
                          </th>
                        )}
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-primary-foreground">
                          Professor(a)
                        </th>
                      </>
                    }
                  />
                </thead>
                <tbody>
                  {selectedRows.map((row) => (
                    <RankingMetricsTableRow
                      key={`${row.school_id || selectedSchoolId}-${row.position}-${row.series_class_name}`}
                      rowKey={`${row.school_id || selectedSchoolId}-${row.position}-${row.series_class_name}`}
                      row={row}
                      nameCell={row.series_class_name}
                      leadingCells={
                        <>
                          {showSchoolColumn && (
                            <td className="px-3 py-2">
                              <Badge variant="outline">{row.school_name || "N/A"}</Badge>
                            </td>
                          )}
                          <td className="px-3 py-2">
                            <Badge variant="secondary">{row.teacher_name || "N/A"}</Badge>
                          </td>
                        </>
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
