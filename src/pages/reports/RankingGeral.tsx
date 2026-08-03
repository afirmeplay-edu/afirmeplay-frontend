import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Download, Filter, Loader2, Medal, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FormFiltersApiService } from "@/services/formFiltersApi";
import { EvaluationResultsApiService } from "@/services/evaluation/evaluationResultsApi";
import { RelatorioConsolidadoItensPicker } from "@/components/reports/relatorio-geral/RelatorioConsolidadoItensPicker";
import {
  RankingApiService,
  type ClassPeerRankingFilters,
} from "@/services/reports/rankingApi";
import { generateConsolidatedGeneralRankingPdf } from "@/services/reports/rankingPdf";
import { useToast } from "@/hooks/use-toast";
import ConsolidatedGeneralRankingPanel from "@/components/ranking/ConsolidatedGeneralRankingPanel";
import { CLASS_SHIFT_OPTIONS } from "@/lib/classShift";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  RESULTS_MONTH_NAMES_PT,
  RESULTS_PERIOD_YEAR_MIN,
  getResultsPeriodYearMax,
  normalizeResultsPeriodYm,
} from "@/utils/resultsPeriod";

type FilterOption = { id: string; name: string };
type RankingItemOption = { id: string; label: string };

function normalizeParam(value: string | null): string {
  const v = (value || "").trim();
  return !v || v.toLowerCase() === "all" ? "" : v;
}

function parseCsvIds(value: string | null): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(",")) {
    const id = part.trim();
    if (!id || id.toLowerCase() === "all" || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function getApiError(error: unknown, fallback: string): string {
  const maybe = error as { message?: string; response?: { data?: { error?: string; details?: string } } };
  return maybe?.response?.data?.error || maybe?.response?.data?.details || maybe?.message || fallback;
}

export default function RankingGeral() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [estados, setEstados] = useState<FilterOption[]>([]);
  const [municipios, setMunicipios] = useState<FilterOption[]>([]);
  const [schools, setSchools] = useState<FilterOption[]>([]);
  const [series, setSeries] = useState<FilterOption[]>([]);
  const [turmas, setTurmas] = useState<FilterOption[]>([]);
  const [evaluationItems, setEvaluationItems] = useState<RankingItemOption[]>([]);
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [periodDraft, setPeriodDraft] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const [loadingFilters, setLoadingFilters] = useState({
    estados: false,
    municipios: false,
    escolas: false,
    series: false,
    turmas: false,
    avaliacao: false,
  });
  const [exporting, setExporting] = useState(false);

  const filters = useMemo(
    () => ({
      estado: normalizeParam(searchParams.get("estado")),
      municipio: normalizeParam(searchParams.get("municipio")),
      escola: normalizeParam(searchParams.get("escola")),
      serie: normalizeParam(searchParams.get("serie")),
      turma: normalizeParam(searchParams.get("turma")),
      periodo: normalizeParam(searchParams.get("periodo")),
      evaluation_id: normalizeParam(searchParams.get("evaluation_id")),
    }),
    [searchParams]
  );
  const selectedEvaluationIds = useMemo(() => {
    const fromMulti = parseCsvIds(searchParams.get("evaluation_ids"));
    if (fromMulti.length > 0) return fromMulti;
    return filters.evaluation_id ? [filters.evaluation_id] : [];
  }, [searchParams, filters.evaluation_id]);
  const turnoFilter = normalizeParam(searchParams.get("turno"));
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);

  const setFilters = (
    updates: Partial<
      Record<"estado" | "municipio" | "escola" | "serie" | "turma" | "turno" | "periodo" | "page" | "evaluation_ids" | "evaluation_id", string>
    >,
    clearKeys: Array<"estado" | "municipio" | "escola" | "serie" | "turma" | "turno" | "periodo" | "page" | "evaluation_ids" | "evaluation_id"> = []
  ) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => {
      if (v && v.trim() && v !== "all") next.set(k, v);
      else next.delete(k);
    });
    clearKeys.forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  };

  const setSelectedEvaluationIds = (ids: string[]) => {
    const unique = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    const next = new URLSearchParams(searchParams);
    if (unique.length === 0) {
      next.delete("evaluation_ids");
      next.delete("evaluation_id");
    } else {
      next.set("evaluation_ids", unique.join(","));
      next.set("evaluation_id", unique[0]);
    }
    next.delete("page");
    setSearchParams(next, { replace: true });
  };

  const normalizedSelectedPeriod = useMemo(
    () => (filters.periodo ? normalizeResultsPeriodYm(filters.periodo) : "all"),
    [filters.periodo]
  );
  const periodCalendarSelected = useMemo(() => {
    if (normalizedSelectedPeriod === "all") return undefined;
    return parse(`${normalizedSelectedPeriod}-01`, "yyyy-MM-dd", new Date());
  }, [normalizedSelectedPeriod]);

  useEffect(() => {
    if (!periodPickerOpen) return;
    if (normalizedSelectedPeriod !== "all") {
      const [yy, mm] = normalizedSelectedPeriod.split("-").map(Number);
      setPeriodDraft({ y: yy, m: mm - 1 });
      return;
    }
    const now = new Date();
    setPeriodDraft({ y: now.getFullYear(), m: now.getMonth() });
  }, [periodPickerOpen, normalizedSelectedPeriod]);

  useEffect(() => {
    let cancelled = false;
    setLoadingFilters((s) => ({ ...s, estados: true }));
    FormFiltersApiService.getFormFilterStates()
      .then((list) => {
        if (cancelled) return;
        setEstados(list.map((e) => ({ id: e.id, name: e.nome })));
      })
      .finally(() => {
        if (!cancelled) setLoadingFilters((s) => ({ ...s, estados: false }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!filters.estado) {
      setMunicipios([]);
      setSchools([]);
      setSeries([]);
      setTurmas([]);
      return;
    }
    let cancelled = false;
    setLoadingFilters((s) => ({ ...s, municipios: true }));
    FormFiltersApiService.getFormFilterMunicipalities(filters.estado)
      .then((list) => {
        if (cancelled) return;
        setMunicipios(list.map((m) => ({ id: m.id, name: m.nome })));
      })
      .finally(() => {
        if (!cancelled) setLoadingFilters((s) => ({ ...s, municipios: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [filters.estado]);

  useEffect(() => {
    if (!filters.estado || !filters.municipio) {
      setSchools([]);
      setSeries([]);
      setTurmas([]);
      return;
    }
    let cancelled = false;
    setLoadingFilters((s) => ({ ...s, escolas: true }));
    FormFiltersApiService.getFormFilterSchools({ estado: filters.estado, municipio: filters.municipio })
      .then((list) => {
        if (cancelled) return;
        setSchools(list.map((s) => ({ id: s.id, name: s.nome })));
      })
      .finally(() => {
        if (!cancelled) setLoadingFilters((s) => ({ ...s, escolas: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [filters.estado, filters.municipio]);

  useEffect(() => {
    if (!filters.estado || !filters.municipio || !filters.escola) {
      setSeries([]);
      setTurmas([]);
      return;
    }
    let cancelled = false;
    setLoadingFilters((s) => ({ ...s, series: true }));
    FormFiltersApiService.getFormFilterGrades({
      estado: filters.estado,
      municipio: filters.municipio,
      escola: filters.escola,
    })
      .then((list) => {
        if (cancelled) return;
        setSeries(list.map((g) => ({ id: g.id, name: g.nome })));
      })
      .finally(() => {
        if (!cancelled) setLoadingFilters((s) => ({ ...s, series: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [filters.estado, filters.municipio, filters.escola]);

  useEffect(() => {
    if (!filters.estado || !filters.municipio || !filters.escola || !filters.serie) {
      setTurmas([]);
      return;
    }
    let cancelled = false;
    setLoadingFilters((s) => ({ ...s, turmas: true }));
    FormFiltersApiService.getFormFilterClasses({
      estado: filters.estado,
      municipio: filters.municipio,
      escola: filters.escola,
      serie: filters.serie,
    })
      .then((list) => {
        if (cancelled) return;
        setTurmas(list.map((t) => ({ id: t.id, name: t.nome })));
      })
      .finally(() => {
        if (!cancelled) setLoadingFilters((s) => ({ ...s, turmas: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [filters.estado, filters.municipio, filters.escola, filters.serie]);

  useEffect(() => {
    if (!filters.estado || !filters.municipio) {
      setEvaluationItems([]);
      return;
    }
    let cancelled = false;
    setLoadingFilters((s) => ({ ...s, avaliacao: true }));
    EvaluationResultsApiService.getFilterEvaluations({
      estado: filters.estado,
      municipio: filters.municipio,
      ...(filters.escola ? { escola: filters.escola } : {}),
      ...(filters.periodo ? { periodo: filters.periodo } : {}),
    })
      .then((list) => {
        if (cancelled) return;
        setEvaluationItems((list || []).map((item) => ({ id: item.id, label: item.titulo || item.id })));
      })
      .finally(() => {
        if (!cancelled) setLoadingFilters((s) => ({ ...s, avaliacao: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [filters.estado, filters.municipio, filters.escola, filters.periodo]);

  const turmaNomeFromFilter = useMemo(() => {
    if (!filters.turma) return "";
    return turmas.find((item) => item.id === filters.turma)?.name || "";
  }, [filters.turma, turmas]);

  const requestFilters = useMemo<ClassPeerRankingFilters | null>(() => {
    if (selectedEvaluationIds.length === 0 || !filters.municipio) return null;
    const scope = filters.escola ? "escola" : "municipio";
    if (scope === "escola" && !filters.escola) return null;
    return {
      scope,
      evaluation_id: selectedEvaluationIds[0],
      evaluation_ids: selectedEvaluationIds,
      municipio: filters.municipio,
      ...(filters.escola ? { escola: filters.escola } : {}),
      ...(filters.serie ? { serie: filters.serie } : {}),
      ...(turmaNomeFromFilter ? { turma_nome: turmaNomeFromFilter } : {}),
      ...(turnoFilter ? { turno: turnoFilter } : {}),
    };
  }, [
    selectedEvaluationIds,
    filters.municipio,
    filters.escola,
    filters.serie,
    turmaNomeFromFilter,
    turnoFilter,
  ]);

  const rankingQuery = useQuery({
    queryKey: [
      "ranking",
      "geral",
      requestFilters?.scope,
      requestFilters?.municipio,
      requestFilters?.escola,
      requestFilters?.serie,
      requestFilters?.turma_nome,
      requestFilters?.turno,
      (requestFilters?.evaluation_ids || [requestFilters?.evaluation_id]).filter(Boolean).join(","),
      page,
    ],
    queryFn: () =>
      RankingApiService.getConsolidatedGeneralRanking(requestFilters as ClassPeerRankingFilters, page, 20),
    enabled: Boolean(requestFilters),
    staleTime: 0,
  });

  const rankingError = rankingQuery.error
    ? getApiError(rankingQuery.error, "Erro ao carregar ranking geral.")
    : undefined;
  const rankingInitialLoading = rankingQuery.isLoading && !rankingQuery.data;
  const rankingRefreshing = rankingQuery.isFetching && !rankingInitialLoading;
  const isAnyFilterLoading = Object.values(loadingFilters).some(Boolean);

  const estadoNome = estados.find((item) => item.id === filters.estado)?.name || "";
  const municipioNome = municipios.find((item) => item.id === filters.municipio)?.name || "";
  const escolaNome = schools.find((item) => item.id === filters.escola)?.name || "";
  const serieNome = series.find((item) => item.id === filters.serie)?.name || "";
  const turmaNome = turmas.find((item) => item.id === filters.turma)?.name || "";
  const totalStudents = Number(
    rankingQuery.data?.pagination?.total ?? rankingQuery.data?.totals?.students_count ?? 0
  );

  const setPage = (nextPage: number) => {
    setFilters(nextPage <= 1 ? { page: "" } : { page: String(nextPage) });
  };

  const clearFilters = () => {
    const next = new URLSearchParams();
    setSearchParams(next, { replace: true });
  };

  const handleExportPdf = async () => {
    if (!requestFilters) {
      toast({
        title: "Filtros obrigatórios",
        description: "Selecione município e ao menos uma avaliação para exportar.",
        variant: "destructive",
      });
      return;
    }
    try {
      setExporting(true);
      const entityTitle = selectedEvaluationIds
        .map((id) => evaluationItems.find((item) => item.id === id)?.label || id)
        .join(" · ");
      const data = await RankingApiService.getAllConsolidatedGeneralRanking(requestFilters);
      await generateConsolidatedGeneralRankingPdf({
        data,
        filterLabels: {
          estado: estadoNome || "Todos",
          municipio: municipioNome || "Todos",
          escola: escolaNome || "Todas",
          serie: serieNome || "Todas",
          turma: turmaNome || "Todas",
          turno: turnoFilter
            ? CLASS_SHIFT_OPTIONS.find((item) => item.value === turnoFilter)?.label || turnoFilter
            : "Todos",
          avaliacao: entityTitle || "—",
        },
        cityId: filters.municipio || null,
        fileNameBase: "ranking-geral",
      });
      toast({
        title: "PDF gerado",
        description: "O ranking geral foi exportado com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao gerar PDF",
        description: error instanceof Error ? error.message : "Falha inesperada ao exportar relatório.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-6 pb-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <Medal className="h-6 w-6 text-primary" aria-hidden />
            Ranking Geral
          </h1>
          <Badge variant="outline" className="gap-1.5">
            {rankingInitialLoading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Carregando...
              </>
            ) : (
              `${totalStudents} aluno${totalStudents === 1 ? "" : "s"}`
            )}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Listagem única de alunos das avaliações selecionadas, sem separação por série ou turma.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5 text-primary" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {isAnyFilterLoading ? (
            <div className="col-span-full flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              <span>Carregando opções dos filtros...</span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="rg-estado">Estado</Label>
            <Select
              disabled={loadingFilters.estados}
              value={filters.estado || "all"}
              onValueChange={(value) =>
                setFilters(
                  { estado: value === "all" ? "" : value },
                  ["municipio", "escola", "serie", "turma", "evaluation_id", "evaluation_ids", "page"]
                )
              }
            >
              <SelectTrigger id="rg-estado">
                <SelectValue placeholder={loadingFilters.estados ? "Carregando estados..." : "Selecione o estado"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Selecione</SelectItem>
                {estados.map((estado) => (
                  <SelectItem key={estado.id} value={estado.id}>
                    {estado.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rg-municipio">Município</Label>
            <Select
              value={filters.municipio || "all"}
              onValueChange={(value) =>
                setFilters(
                  { municipio: value === "all" ? "" : value },
                  ["escola", "serie", "turma", "evaluation_id", "evaluation_ids", "page"]
                )
              }
              disabled={!filters.estado || loadingFilters.municipios}
            >
              <SelectTrigger id="rg-municipio">
                <SelectValue
                  placeholder={loadingFilters.municipios ? "Carregando municípios..." : "Selecione o município"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Selecione</SelectItem>
                {municipios.map((municipio) => (
                  <SelectItem key={municipio.id} value={municipio.id}>
                    {municipio.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Período</Label>
            <Popover open={periodPickerOpen} onOpenChange={setPeriodPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full justify-start font-normal"
                  disabled={!filters.municipio}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {normalizedSelectedPeriod !== "all" && periodCalendarSelected
                    ? format(periodCalendarSelected, "MMMM 'de' yyyy", { locale: ptBR })
                    : "Todos os períodos"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Select
                      value={String(periodDraft.y)}
                      onValueChange={(value) => setPeriodDraft((d) => ({ ...d, y: Number(value) }))}
                    >
                      <SelectTrigger className="h-8 w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(
                          { length: getResultsPeriodYearMax() - RESULTS_PERIOD_YEAR_MIN + 1 },
                          (_, i) => RESULTS_PERIOD_YEAR_MIN + i
                        )
                          .reverse()
                          .map((year) => (
                            <SelectItem key={year} value={String(year)}>
                              {year}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={String(periodDraft.m)}
                      onValueChange={(value) => setPeriodDraft((d) => ({ ...d, m: Number(value) }))}
                    >
                      <SelectTrigger className="h-8 w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RESULTS_MONTH_NAMES_PT.map((name, idx) => (
                          <SelectItem key={name} value={String(idx)}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Calendar
                    mode="single"
                    month={new Date(periodDraft.y, periodDraft.m, 1)}
                    onMonthChange={(date) => setPeriodDraft({ y: date.getFullYear(), m: date.getMonth() })}
                    selected={periodCalendarSelected}
                    onSelect={(date) => {
                      if (!date) return;
                      const ym = format(date, "yyyy-MM");
                      setFilters({ periodo: ym }, ["evaluation_id", "evaluation_ids", "page"]);
                      setPeriodPickerOpen(false);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full text-muted-foreground hover:text-foreground"
                    disabled={normalizedSelectedPeriod === "all"}
                    onClick={() => {
                      setFilters({ periodo: "" }, ["evaluation_id", "evaluation_ids", "page"]);
                      setPeriodPickerOpen(false);
                    }}
                  >
                    Limpar período
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <RelatorioConsolidadoItensPicker
            label="Avaliações"
            items={evaluationItems.map((item) => ({ id: item.id, titulo: item.label }))}
            selected={selectedEvaluationIds}
            onChange={setSelectedEvaluationIds}
            disabled={!filters.municipio}
            loading={loadingFilters.avaliacao}
            placeholder={
              loadingFilters.avaliacao ? "Carregando avaliações..." : "Selecione uma ou mais avaliações"
            }
            modalTitle="Selecionar avaliações"
            entityLabel="avaliações"
            emptyMessage="Nenhuma avaliação encontrada."
          />

          <div className="space-y-1.5">
            <Label htmlFor="rg-escola">Escola</Label>
            <Select
              value={filters.escola || "all"}
              onValueChange={(value) =>
                setFilters(
                  { escola: value === "all" ? "" : value },
                  ["serie", "turma", "page"]
                )
              }
              disabled={!filters.municipio || loadingFilters.escolas}
            >
              <SelectTrigger id="rg-escola">
                <SelectValue placeholder="Todas as escolas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {schools.map((escola) => (
                  <SelectItem key={escola.id} value={escola.id}>
                    {escola.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rg-serie">Série</Label>
            <Select
              value={filters.serie || "all"}
              onValueChange={(value) =>
                setFilters({ serie: value === "all" ? "" : value }, ["turma", "page"])
              }
              disabled={!filters.escola || loadingFilters.series}
            >
              <SelectTrigger id="rg-serie">
                <SelectValue placeholder={!filters.escola ? "Selecione a escola" : "Todas as séries"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {series.map((serie) => (
                  <SelectItem key={serie.id} value={serie.id}>
                    {serie.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rg-turma">Turma</Label>
            <Select
              value={filters.turma || "all"}
              onValueChange={(value) =>
                setFilters({ turma: value === "all" ? "" : value }, ["page"])
              }
              disabled={!filters.serie || loadingFilters.turmas}
            >
              <SelectTrigger id="rg-turma">
                <SelectValue placeholder={!filters.serie ? "Selecione a série" : "Todas as turmas"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {turmas.map((turma) => (
                  <SelectItem key={turma.id} value={turma.id}>
                    {turma.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rg-turno">Turno</Label>
            <Select
              value={turnoFilter || "all"}
              onValueChange={(value) =>
                setFilters({ turno: value === "all" ? "" : value }, ["page"])
              }
            >
              <SelectTrigger id="rg-turno">
                <SelectValue placeholder="Todos os turnos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os turnos</SelectItem>
                {CLASS_SHIFT_OPTIONS.map((shift) => (
                  <SelectItem key={shift.value} value={shift.value}>
                    {shift.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2 md:col-span-3">
            <Button type="button" variant="outline" onClick={clearFilters}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Limpar filtros
            </Button>
            <Button
              type="button"
              onClick={handleExportPdf}
              disabled={!requestFilters || rankingInitialLoading || exporting}
            >
              {exporting || rankingInitialLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Exportar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {!requestFilters ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Selecione o município e ao menos uma avaliação para ver o ranking geral.
          </CardContent>
        </Card>
      ) : (
        <ConsolidatedGeneralRankingPanel
          data={rankingQuery.data}
          isLoading={rankingInitialLoading}
          isRefreshing={rankingRefreshing}
          errorMessage={rankingError}
          page={page}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
