import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Download, Filter, Loader2, RefreshCw, Trophy, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FormFiltersApiService } from "@/services/formFiltersApi";
import { EvaluationResultsApiService, REPORT_ENTITY_TYPE_ANSWER_SHEET } from "@/services/evaluation/evaluationResultsApi";
import { EvaluationInstrumentPicker } from "@/components/filters";
import { RankingApiService, type RankingFilters, type RankingScope } from "@/services/reports/rankingApi";
import { formatRankingDisciplinaLabel, generateRankingReportPdf } from "@/services/reports/rankingPdf";
import { useToast } from "@/hooks/use-toast";
import { RankingTeachersPanel } from "@/components/ranking/RankingTeachersPanel";
import RankingOverviewPanel from "@/components/ranking/RankingOverviewPanel";
import RankingSchoolClassPanel from "@/components/ranking/RankingSchoolClassPanel";
import { cn } from "@/lib/utils";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RESULTS_MONTH_NAMES_PT, RESULTS_PERIOD_YEAR_MIN, getResultsPeriodYearMax, normalizeResultsPeriodYm } from "@/utils/resultsPeriod";

type RankingTab = "visao-geral" | "escola-turma" | "professores";
type RankingEntityTab = "avaliacao" | "cartao";
type FilterOption = { id: string; name: string };
type RankingItemOption = { id: string; label: string };

function resolveTab(value: string | null): RankingTab {
  if (value === "escola-turma") return "escola-turma";
  if (value === "professores") return "professores";
  return "visao-geral";
}

function resolveEntityTab(value: string | null): RankingEntityTab {
  if (value === "cartao") return "cartao";
  return "avaliacao";
}

function normalizeParam(value: string | null): string {
  const v = (value || "").trim();
  return !v || v.toLowerCase() === "all" ? "" : v;
}

function deriveScope(filters: RankingFilters): RankingScope {
  if (filters.turma) return "turma";
  if (filters.escola) return "escola";
  return "municipio";
}

function getApiError(error: unknown, fallback: string): string {
  const maybe = error as { message?: string; response?: { data?: { error?: string; details?: string } } };
  return maybe?.response?.data?.error || maybe?.response?.data?.details || maybe?.message || fallback;
}

export default function RankingHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveTab(searchParams.get("tipo"));
  const rankingEntityTab = resolveEntityTab(searchParams.get("entidade"));
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [estados, setEstados] = useState<FilterOption[]>([]);
  const [municipios, setMunicipios] = useState<FilterOption[]>([]);
  const [schools, setSchools] = useState<FilterOption[]>([]);
  const [series, setSeries] = useState<FilterOption[]>([]);
  const [turmas, setTurmas] = useState<FilterOption[]>([]);
  const [evaluationItems, setEvaluationItems] = useState<RankingItemOption[]>([]);
  const [answerSheetItems, setAnswerSheetItems] = useState<RankingItemOption[]>([]);
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
    cartao: false,
  });

  const filters = useMemo<RankingFilters>(
    () => ({
      estado: normalizeParam(searchParams.get("estado")),
      municipio: normalizeParam(searchParams.get("municipio")),
      escola: normalizeParam(searchParams.get("escola")),
      serie: normalizeParam(searchParams.get("serie")),
      turma: normalizeParam(searchParams.get("turma")),
      periodo: normalizeParam(searchParams.get("periodo")),
      disciplina: normalizeParam(searchParams.get("disciplina")),
      evaluation_id: normalizeParam(searchParams.get("evaluation_id")),
      answer_sheet_id: normalizeParam(searchParams.get("answer_sheet_id")),
    }),
    [searchParams]
  );
  const hasBaseFilters = Boolean(filters.estado && filters.municipio);
  const hasEntitySelection = Boolean(filters.evaluation_id || filters.answer_sheet_id);
  const hasSchoolFilter = Boolean(filters.escola);
  const derivedScope = deriveScope(filters);
  const requestFilters = useMemo<RankingFilters>(() => ({ ...filters, scope: derivedScope }), [filters, derivedScope]);
  const rankingQueryKey = useMemo(
    () =>
      [
        "ranking",
        "model",
        filters.estado,
        filters.municipio,
        filters.escola,
        filters.serie,
        filters.turma,
        filters.periodo,
        filters.evaluation_id,
        filters.answer_sheet_id,
        derivedScope,
        filters.disciplina || "",
      ] as const,
    [
      filters.estado,
      filters.municipio,
      filters.escola,
      filters.serie,
      filters.turma,
      filters.periodo,
      filters.evaluation_id,
      filters.answer_sheet_id,
      filters.disciplina,
      derivedScope,
    ]
  );
  const normalizedSelectedPeriod = useMemo(
    () => (filters.periodo ? normalizeResultsPeriodYm(filters.periodo) : "all"),
    [filters.periodo]
  );
  const periodCalendarSelected = useMemo(() => {
    if (normalizedSelectedPeriod === "all") return undefined;
    return parse(`${normalizedSelectedPeriod}-01`, "yyyy-MM-dd", new Date());
  }, [normalizedSelectedPeriod]);

  useEffect(() => {
    if (!filters.evaluation_id || !filters.answer_sheet_id) return;
    setFilters({ answer_sheet_id: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.evaluation_id, filters.answer_sheet_id]);

  useEffect(() => {
    if (filters.answer_sheet_id && rankingEntityTab !== "cartao") {
      setEntityTab("cartao");
      return;
    }
    if (filters.evaluation_id && rankingEntityTab !== "avaliacao") {
      setEntityTab("avaliacao");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.answer_sheet_id, filters.evaluation_id, rankingEntityTab]);

  const setFilters = (
    updates: Partial<Record<keyof RankingFilters, string>>,
    clearKeys: (keyof RankingFilters)[] = []
  ) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => {
      if (v && v.trim() && v !== "all") next.set(k, v);
      else next.delete(k);
    });
    clearKeys.forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  };

  const setEntityTab = (value: RankingEntityTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("entidade", value);
    setSearchParams(next, { replace: true });
  };

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
    if (hasEntitySelection) {
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
  }, [filters.estado, filters.municipio, filters.escola, hasEntitySelection]);

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

  useEffect(() => {
    if (!filters.estado || !filters.municipio) {
      setAnswerSheetItems([]);
      return;
    }
    let cancelled = false;
    setLoadingFilters((s) => ({ ...s, cartao: true }));
    EvaluationResultsApiService.getFilterEvaluations({
      estado: filters.estado,
      municipio: filters.municipio,
      ...(filters.escola ? { escola: filters.escola } : {}),
      report_entity_type: REPORT_ENTITY_TYPE_ANSWER_SHEET,
      ...(filters.periodo ? { periodo: filters.periodo } : {}),
    })
      .then((list) => {
        if (cancelled) return;
        setAnswerSheetItems((list || []).map((item) => ({ id: item.id, label: item.titulo || item.id })));
      })
      .finally(() => {
        if (!cancelled) setLoadingFilters((s) => ({ ...s, cartao: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [filters.estado, filters.municipio, filters.escola, filters.periodo]);

  const rankingQuery = useQuery({
    queryKey: rankingQueryKey,
    queryFn: () =>
      RankingApiService.getGeneralRanking(
        { ...filters, scope: derivedScope },
        1,
        200
      ),
    enabled: hasBaseFilters && hasEntitySelection,
    staleTime: 0,
  });

  const activeDiscipline = filters.disciplina ?? rankingQuery.data?.selected_discipline ?? "";
  const disciplineDataPending =
    hasEntitySelection &&
    rankingQuery.isFetching &&
    (filters.disciplina || "") !== (rankingQuery.data?.selected_discipline ?? "");

  useEffect(() => {
    if (!hasBaseFilters || !hasEntitySelection) return;
    const disciplines = rankingQuery.data?.discipline_options || [];
    if (!disciplines.length) return;

    disciplines.forEach((discipline) => {
      const disciplineFilters: RankingFilters = {
        ...requestFilters,
        disciplina: discipline.id,
      };
      queryClient.prefetchQuery({
        queryKey: [...rankingQueryKey.slice(0, -1), discipline.id],
        queryFn: () => RankingApiService.getGeneralRanking(disciplineFilters, 1, 200),
        staleTime: 60 * 1000,
      });
    });
  }, [
    hasBaseFilters,
    hasEntitySelection,
    rankingQuery.data?.discipline_options,
    queryClient,
    requestFilters,
    rankingQueryKey,
  ]);

  const rankingError = rankingQuery.error ? getApiError(rankingQuery.error, "Erro ao carregar relatório de ranking.") : undefined;
  const rankingInitialLoading = rankingQuery.isLoading && !rankingQuery.data;
  const rankingRefreshing =
    disciplineDataPending || (rankingQuery.isFetching && !rankingInitialLoading);
  const isAnyFilterLoading = Object.values(loadingFilters).some(Boolean);

  const gradeOptionsFromApi = rankingQuery.data?.grade_options || [];
  /**
   * Usa as séries vindas da API sempre que a avaliação/cartão estiver selecionada,
   * mesmo sem escola escolhida — assim o filtro lista só as séries que participaram
   * daquele recorte (e o filtro de escola continua opcional).
   */
  const useApiGradeOptions = hasEntitySelection;
  const serieOptions = useApiGradeOptions ? gradeOptionsFromApi : series;
  const serieFilterLoading = useApiGradeOptions
    ? rankingQuery.isLoading || rankingQuery.isFetching
    : loadingFilters.series;
  const serieFilterEnabled = hasEntitySelection || hasSchoolFilter;

  useEffect(() => {
    if (!useApiGradeOptions || !filters.serie) return;
    const valid = gradeOptionsFromApi.some((item) => item.id === filters.serie);
    if (!valid) {
      setFilters({ serie: "" }, ["turma"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useApiGradeOptions, gradeOptionsFromApi, filters.serie]);

  useEffect(() => {
    if (!hasSchoolFilter) return;
    if (tab === "visao-geral") {
      const next = new URLSearchParams(searchParams);
      next.set("tipo", "escola-turma");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSchoolFilter, tab]);

  const currentCount =
    tab === "visao-geral"
      ? Number(rankingQuery.data?.overview?.summary?.total_schools || 0)
      : tab === "escola-turma"
          ? filters.serie
            ? Number(rankingQuery.data?.classes_ranking?.items?.length || 0)
            : Number(rankingQuery.data?.school_class_ranking?.school_options?.length || 0)
          : Number(rankingQuery.data?.teachers_top?.totals?.count || 0);
  const estadoNome = estados.find((item) => item.id === filters.estado)?.name || "";
  const municipioNome = municipios.find((item) => item.id === filters.municipio)?.name || "";
  const escolaNome = schools.find((item) => item.id === filters.escola)?.name || "";
  const serieNome =
    serieOptions.find((item) => item.id === filters.serie)?.name ||
    rankingQuery.data?.classes_ranking?.grade_name ||
    "";
  const turmaNome = turmas.find((item) => item.id === filters.turma)?.name || "";
  const recorteLabel = [estadoNome, municipioNome].filter(Boolean).join(" / ");
  const periodoLabel =
    normalizedSelectedPeriod !== "all" && periodCalendarSelected
      ? format(periodCalendarSelected, "MMMM 'de' yyyy", { locale: ptBR })
      : "Todos os períodos";

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    [
      "estado",
      "municipio",
      "escola",
      "serie",
      "turma",
      "periodo",
      "disciplina",
      "evaluation_id",
      "answer_sheet_id",
      "scope",
    ].forEach((key) => next.delete(key));
    setSearchParams(next, { replace: true });
  };

  const handleExportPdf = async () => {
    try {
      const data = rankingQuery.data;

      if (!hasBaseFilters) {
        toast({
          title: "Filtros obrigatórios",
          description: "Selecione estado e município para exportar o ranking.",
          variant: "destructive",
        });
        return;
      }

      if (!hasEntitySelection) {
        toast({
          title: "Seleção obrigatória",
          description: "Selecione uma avaliação ou um cartão-resposta para visualizar e exportar o ranking.",
          variant: "destructive",
        });
        return;
      }

      if (!data) {
        toast({
          title: "Sem dados para exportar",
          description: "Aplique os filtros e carregue o ranking antes de gerar o PDF.",
          variant: "destructive",
        });
        return;
      }

      const entityTitle = filters.evaluation_id
        ? evaluationItems.find((item) => item.id === filters.evaluation_id)?.label
        : answerSheetItems.find((item) => item.id === filters.answer_sheet_id)?.label;
      const disciplinaNome = formatRankingDisciplinaLabel(data, filters);

      await generateRankingReportPdf({
        rankingType: "general",
        data,
        filters: requestFilters,
        contextTitle: entityTitle,
        filterLabels: {
          estado: estadoNome || "Todos",
          municipio: municipioNome || "Todos",
          escola: escolaNome || "Todas",
          serie: serieNome || "Todas",
          turma: turmaNome || "Todas",
          periodo: periodoLabel,
          avaliacao: entityTitle || "—",
          disciplina: disciplinaNome,
        },
        fileNameBase: "ranking-completo",
      });
      toast({
        title: "PDF gerado",
        description: "O relatório de ranking foi exportado com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao gerar PDF",
        description: error instanceof Error ? error.message : "Falha inesperada ao exportar relatório.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="w-full min-w-0 space-y-6 pb-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <Trophy className="h-6 w-6 text-primary" aria-hidden />
            Relatório de ranking
          </h1>
          <Badge variant="outline" className="gap-1.5">
            {rankingInitialLoading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Carregando...
              </>
            ) : (
              `${currentCount ?? 0} registros`
            )}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Visão geral, escola/turma e ranking de professores com o mesmo recorte de filtros.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{recorteLabel || "Sem recorte municipal"}</span>
          <span className="text-border">•</span>
          <span className="capitalize">{periodoLabel}</span>
        </div>
      </header>

      <Tabs value={rankingEntityTab} onValueChange={(value) => setEntityTab(value as RankingEntityTab)} className="w-full">
        <TabsList className="mb-0 w-full max-w-md">
          <TabsTrigger value="avaliacao" className="flex-1">
            Avaliação online
          </TabsTrigger>
          <TabsTrigger value="cartao" className="flex-1">
            Cartão-resposta
          </TabsTrigger>
        </TabsList>
      </Tabs>

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
            <Label htmlFor="estado">Estado</Label>
            <Select
              disabled={loadingFilters.estados}
              value={filters.estado || "all"}
              onValueChange={(value) =>
                setFilters(
                  { estado: value === "all" ? "" : value },
                  ["municipio", "escola", "serie", "turma", "evaluation_id", "answer_sheet_id", "disciplina"]
                )
              }
            >
              <SelectTrigger id="estado">
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
            <Label htmlFor="municipio">Município</Label>
            <Select
              value={filters.municipio || "all"}
              onValueChange={(value) =>
                setFilters(
                  { municipio: value === "all" ? "" : value },
                  ["escola", "serie", "turma", "evaluation_id", "answer_sheet_id", "disciplina"]
                )
              }
              disabled={!filters.estado || loadingFilters.municipios}
            >
              <SelectTrigger id="municipio">
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
            <Label>Período (mês/ano)</Label>
            <Popover open={periodPickerOpen} onOpenChange={setPeriodPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!filters.municipio}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    normalizedSelectedPeriod === "all" && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {periodCalendarSelected
                      ? format(periodCalendarSelected, "MMMM 'de' yyyy", { locale: ptBR })
                      : "Selecionar mês e ano"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto max-w-[min(100vw-1rem,20rem)] overflow-hidden border-border bg-popover p-0 text-popover-foreground shadow-lg"
                align="start"
              >
                <div className="grid grid-cols-2 gap-2 border-b border-border px-3 pb-2 pt-3">
                  <div className="min-w-0 space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Mês</span>
                    <Select
                      value={String(periodDraft.m)}
                      onValueChange={(v) => {
                        const mi = parseInt(v, 10);
                        const y = periodDraft.y;
                        setPeriodDraft({ y, m: mi });
                        const p = normalizeResultsPeriodYm(`${y}-${String(mi + 1).padStart(2, "0")}`);
                        if (p !== "all") setFilters({ periodo: p });
                      }}
                    >
                      <SelectTrigger className="h-9 w-full min-w-0">
                        <SelectValue placeholder="Mês" />
                      </SelectTrigger>
                      <SelectContent>
                        {RESULTS_MONTH_NAMES_PT.map((name, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Ano</span>
                    <Select
                      value={String(periodDraft.y)}
                      onValueChange={(v) => {
                        const y = parseInt(v, 10);
                        const mi = periodDraft.m;
                        setPeriodDraft({ y, m: mi });
                        const p = normalizeResultsPeriodYm(`${y}-${String(mi + 1).padStart(2, "0")}`);
                        if (p !== "all") setFilters({ periodo: p });
                      }}
                    >
                      <SelectTrigger className="h-9 w-full min-w-0">
                        <SelectValue placeholder="Ano" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {Array.from(
                          { length: getResultsPeriodYearMax() - RESULTS_PERIOD_YEAR_MIN + 1 },
                          (_, i) => RESULTS_PERIOD_YEAR_MIN + i
                        ).map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Calendar
                  mode="single"
                  locale={ptBR}
                  month={new Date(periodDraft.y, periodDraft.m, 1)}
                  onMonthChange={(d) => {
                    const y = d.getFullYear();
                    const m = d.getMonth();
                    setPeriodDraft({ y, m });
                    const p = normalizeResultsPeriodYm(`${y}-${String(m + 1).padStart(2, "0")}`);
                    if (p !== "all") setFilters({ periodo: p });
                  }}
                  selected={periodCalendarSelected}
                  captionLayout="buttons"
                  fromYear={RESULTS_PERIOD_YEAR_MIN}
                  toYear={getResultsPeriodYearMax()}
                  className="rounded-none border-0 bg-transparent p-0 text-popover-foreground shadow-none"
                  onSelect={(date) => {
                    if (!date) return;
                    const y = date.getFullYear();
                    const m = date.getMonth();
                    setPeriodDraft({ y, m });
                    const p = normalizeResultsPeriodYm(format(date, "yyyy-MM"));
                    if (p !== "all") {
                      setFilters({ periodo: p });
                      setPeriodPickerOpen(false);
                    }
                  }}
                  initialFocus
                />
                <div className="space-y-2 border-t border-border bg-muted/15 px-3 py-2.5 dark:bg-muted/25">
                  <p className="text-center text-xs leading-snug text-muted-foreground">
                    Altere mês ou ano nos seletores, use as setas do calendário ou toque em um dia para aplicar e
                    fechar.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full text-muted-foreground hover:text-foreground"
                    disabled={normalizedSelectedPeriod === "all"}
                    onClick={() => {
                      setFilters({ periodo: "" });
                      setPeriodPickerOpen(false);
                    }}
                  >
                    Limpar período
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {rankingEntityTab === "avaliacao" ? (
            <EvaluationInstrumentPicker
              id="evaluation_id"
              label="Avaliação"
              estado={filters.estado || "all"}
              municipio={filters.municipio || "all"}
              escola={filters.escola}
              periodo={filters.periodo}
              estadoLabel={estadoNome}
              municipioLabel={municipioNome}
              periodoLabel={filters.periodo}
              value={filters.evaluation_id || "all"}
              onChange={(value) =>
                setFilters({
                  evaluation_id: value === "all" ? "" : value,
                  answer_sheet_id: "",
                  disciplina: "",
                })
              }
              disabled={!filters.municipio}
              loading={loadingFilters.avaliacao}
              allowAll
              allLabel="Todas as avaliações"
              placeholder={loadingFilters.avaliacao ? "Carregando avaliações..." : "Selecione a avaliação"}
            />
          ) : (
            <EvaluationInstrumentPicker
              id="answer_sheet_id"
              label="Cartão resposta"
              estado={filters.estado || "all"}
              municipio={filters.municipio || "all"}
              escola={filters.escola}
              periodo={filters.periodo}
              reportEntityType={REPORT_ENTITY_TYPE_ANSWER_SHEET}
              estadoLabel={estadoNome}
              municipioLabel={municipioNome}
              periodoLabel={filters.periodo}
              value={filters.answer_sheet_id || "all"}
              onChange={(value) =>
                setFilters({
                  answer_sheet_id: value === "all" ? "" : value,
                  evaluation_id: "",
                  disciplina: "",
                })
              }
              disabled={!filters.municipio}
              loading={loadingFilters.cartao}
              allowAll
              allLabel="Todos os cartões"
              placeholder={loadingFilters.cartao ? "Carregando cartões..." : "Selecione o cartão resposta"}
            />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="escola">Escola</Label>
            <Select
              value={filters.escola || "all"}
              onValueChange={(value) =>
                setFilters({ escola: value === "all" ? "" : value }, ["serie", "turma"])
              }
              disabled={!filters.municipio || loadingFilters.escolas}
            >
              <SelectTrigger id="escola">
                <SelectValue placeholder={loadingFilters.escolas ? "Carregando escolas..." : "Selecione a escola"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as escolas</SelectItem>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="serie">Série</Label>
            <Select
              value={filters.serie || "all"}
              onValueChange={(value) => setFilters({ serie: value === "all" ? "" : value }, ["turma"])}
              disabled={!serieFilterEnabled || serieFilterLoading}
            >
              <SelectTrigger id="serie">
                <SelectValue
                  placeholder={
                    serieFilterLoading
                      ? "Carregando séries..."
                      : useApiGradeOptions
                        ? "Séries com participação na avaliação"
                        : "Selecione a série"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as séries</SelectItem>
                {serieOptions.map((serie) => (
                  <SelectItem key={serie.id} value={serie.id}>
                    {serie.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="turma">Turma</Label>
            <Select
              value={filters.turma || "all"}
              onValueChange={(value) => setFilters({ turma: value === "all" ? "" : value })}
              disabled={!filters.serie || loadingFilters.turmas}
            >
              <SelectTrigger id="turma">
                <SelectValue placeholder={loadingFilters.turmas ? "Carregando turmas..." : "Selecione a turma"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as turmas</SelectItem>
                {turmas.map((turma) => (
                  <SelectItem key={turma.id} value={turma.id}>
                    {turma.name}
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
              disabled={!hasEntitySelection || rankingInitialLoading}
            >
              {rankingInitialLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Exportar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(searchParams);
          next.set("tipo", value);
          setSearchParams(next, { replace: true });
        }}
      >
        <TabsList
          className={cn(
            "sticky top-2 z-10 grid h-auto w-full gap-1 rounded-xl border border-border bg-background/90 p-1 backdrop-blur",
            hasSchoolFilter ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"
          )}
        >
          {!hasSchoolFilter ? (
            <TabsTrigger value="visao-geral" className="gap-2">
              <Trophy className="h-4 w-4" />
              Visão geral
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="escola-turma" className="gap-2">
            <Filter className="h-4 w-4" />
            {filters.serie ? "Ranking de turmas" : "Por escola/série"}
          </TabsTrigger>
          <TabsTrigger value="professores" className="gap-2">
            <Users className="h-4 w-4" />
            Professores
          </TabsTrigger>
        </TabsList>

        {hasEntitySelection && (rankingQuery.data?.discipline_options?.length || 0) > 0 ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Disciplina</span>
              <Button
                type="button"
                size="sm"
                variant={!activeDiscipline ? "default" : "outline"}
                onClick={() => setFilters({ disciplina: "" })}
              >
                Geral
              </Button>
              {(rankingQuery.data?.discipline_options || []).map((discipline) => (
                <Button
                  key={discipline.id}
                  type="button"
                  size="sm"
                  variant={activeDiscipline === discipline.id ? "default" : "outline"}
                  onClick={() => setFilters({ disciplina: discipline.id })}
                >
                  {discipline.name}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {!hasEntitySelection ? (
          <div className="mt-6">
            <Card className="border border-dashed border-border/70">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Selecione uma avaliação ou um cartão-resposta para exibir as informações do ranking.
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            {!hasSchoolFilter ? (
              <TabsContent value="visao-geral" className="mt-6">
                <RankingOverviewPanel
                  data={rankingQuery.data}
                  isLoading={rankingInitialLoading}
                  isRefreshing={rankingRefreshing}
                  errorMessage={rankingError}
                />
              </TabsContent>
            ) : null}

            <TabsContent value="escola-turma" className="mt-6">
              <RankingSchoolClassPanel
                data={rankingQuery.data}
                isLoading={rankingInitialLoading}
                isRefreshing={rankingRefreshing}
                errorMessage={rankingError}
                filterSchoolId={filters.escola}
                filterSerieId={filters.serie}
                filterSchoolName={escolaNome}
                filterSerieName={serieNome}
              />
            </TabsContent>

            <TabsContent value="professores" className="mt-6">
              <RankingTeachersPanel
                data={rankingQuery.data}
                isLoading={rankingInitialLoading}
                isRefreshing={rankingRefreshing}
                errorMessage={rankingError}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
