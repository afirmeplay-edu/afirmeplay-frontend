import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Download, Filter, Medal, RefreshCw, ScanLine, Trophy, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormFiltersApiService } from "@/services/formFiltersApi";
import {
  EvaluationResultsApiService,
  REPORT_ENTITY_TYPE_ANSWER_SHEET,
} from "@/services/evaluation/evaluationResultsApi";
import {
  RankingApiService,
  type RankingFilters,
  type RankingScope,
} from "@/services/reports/rankingApi";
import { generateRankingReportPdf } from "@/services/reports/rankingPdf";
import { useToast } from "@/hooks/use-toast";
import { RankingGeneralPanel } from "@/components/ranking/RankingGeneralPanel";
import { RankingEvaluationPanel } from "@/components/ranking/RankingEvaluationPanel";
import { RankingAnswerSheetPanel } from "@/components/ranking/RankingAnswerSheetPanel";
import { RankingTeachersPanel } from "@/components/ranking/RankingTeachersPanel";

type RankingTab = "geral" | "avaliacao" | "cartao" | "professores";
type FilterOption = { id: string; name: string };
type RankingItemOption = { id: string; label: string };

function resolveTab(value: string | null): RankingTab {
  if (value === "avaliacao") return "avaliacao";
  if (value === "cartao") return "cartao";
  if (value === "professores") return "professores";
  return "geral";
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

function sanitizeRankingLabel(item: { id: string; titulo?: string }): string {
  const raw = (item.titulo || "").trim();
  if (!raw || raw === item.id) return "Item sem título";
  return raw;
}

export default function RankingHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveTab(searchParams.get("tipo"));
  const { toast } = useToast();
  const [estados, setEstados] = useState<FilterOption[]>([]);
  const [municipios, setMunicipios] = useState<FilterOption[]>([]);
  const [schools, setSchools] = useState<FilterOption[]>([]);
  const [series, setSeries] = useState<FilterOption[]>([]);
  const [turmas, setTurmas] = useState<FilterOption[]>([]);
  const [rankingItems, setRankingItems] = useState<RankingItemOption[]>([]);
  const [loadingFilters, setLoadingFilters] = useState({
    estados: false,
    municipios: false,
    escolas: false,
    series: false,
    turmas: false,
    rankingItems: false,
  });

  const filters = useMemo<RankingFilters>(
    () => ({
      estado: normalizeParam(searchParams.get("estado")),
      municipio: normalizeParam(searchParams.get("municipio")),
      escola: normalizeParam(searchParams.get("escola")),
      serie: normalizeParam(searchParams.get("serie")),
      turma: normalizeParam(searchParams.get("turma")),
      periodo: normalizeParam(searchParams.get("periodo")),
      evaluation_id: normalizeParam(searchParams.get("evaluation_id")),
      answer_sheet_id: normalizeParam(searchParams.get("answer_sheet_id")),
    }),
    [searchParams]
  );
  const hasBaseFilters = Boolean(filters.estado && filters.municipio);
  const canLoadRankingItems = Boolean(filters.municipio);
  const derivedScope = deriveScope(filters);
  const requestFilters = useMemo<RankingFilters>(() => ({ ...filters, scope: derivedScope }), [filters, derivedScope]);

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
    const needRankingItem = tab === "avaliacao" || tab === "cartao";
    if (!needRankingItem || !canLoadRankingItems) {
      setRankingItems([]);
      return;
    }
    let cancelled = false;
    setLoadingFilters((s) => ({ ...s, rankingItems: true }));
    EvaluationResultsApiService.getFilterEvaluations({
      estado: filters.estado || "",
      municipio: filters.municipio || "",
      ...(filters.escola ? { escola: filters.escola } : {}),
      ...(tab === "cartao" ? { report_entity_type: REPORT_ENTITY_TYPE_ANSWER_SHEET } : {}),
    })
      .then((list) => {
        if (cancelled) return;
        setRankingItems((list || []).map((item) => ({ id: item.id, label: sanitizeRankingLabel(item) })));
      })
      .finally(() => {
        if (!cancelled) setLoadingFilters((s) => ({ ...s, rankingItems: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [tab, canLoadRankingItems, filters.estado, filters.municipio, filters.escola]);

  const generalQuery = useQuery({
    queryKey: ["ranking", "general", requestFilters],
    queryFn: () => RankingApiService.getGeneralRanking(requestFilters, 1, 50),
    enabled: tab === "geral" && hasBaseFilters,
  });

  const evaluationQuery = useQuery({
    queryKey: ["ranking", "evaluation", requestFilters],
    queryFn: () => RankingApiService.getSpecificEvaluationRanking(requestFilters, 1, 100),
    enabled: tab === "avaliacao" && hasBaseFilters && !!filters.evaluation_id,
  });

  const answerSheetQuery = useQuery({
    queryKey: ["ranking", "answer-sheet", requestFilters],
    queryFn: () => RankingApiService.getSpecificAnswerSheetRanking(requestFilters, 1, 100),
    enabled: tab === "cartao" && hasBaseFilters && !!filters.answer_sheet_id,
  });

  const teachersQuery = useQuery({
    queryKey: ["ranking", "teachers", requestFilters],
    queryFn: () => RankingApiService.getTeacherRanking(requestFilters, 1, 50),
    enabled: tab === "professores" && hasBaseFilters,
  });

  const evaluationError = evaluationQuery.error ? getApiError(evaluationQuery.error, "Erro ao carregar ranking por avaliação.") : undefined;
  const answerError = answerSheetQuery.error ? getApiError(answerSheetQuery.error, "Erro ao carregar ranking por cartão.") : undefined;
  const generalError = generalQuery.error ? getApiError(generalQuery.error, "Erro ao carregar ranking geral.") : undefined;
  const teachersError = teachersQuery.error ? getApiError(teachersQuery.error, "Erro ao carregar ranking de professores.") : undefined;

  const currentCount =
    tab === "geral"
      ? generalQuery.data?.totals.count
      : tab === "avaliacao"
        ? evaluationQuery.data?.totals.count
        : tab === "cartao"
          ? answerSheetQuery.data?.totals.count
          : teachersQuery.data?.totals.count;
  const estadoNome = estados.find((item) => item.id === filters.estado)?.name || "";
  const municipioNome = municipios.find((item) => item.id === filters.municipio)?.name || "";
  const recorteLabel = [estadoNome, municipioNome].filter(Boolean).join(" / ");

  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    [
      "estado",
      "municipio",
      "escola",
      "serie",
      "turma",
      "periodo",
      "evaluation_id",
      "answer_sheet_id",
      "scope",
    ].forEach((key) => next.delete(key));
    setSearchParams(next, { replace: true });
  };

  const handleExportPdf = async () => {
    try {
      const tabToRankingType =
        tab === "geral"
          ? "general"
          : tab === "avaliacao"
            ? "specific_evaluation"
            : tab === "cartao"
              ? "specific_answer_sheet"
              : "teachers";

      const data =
        tab === "geral"
          ? generalQuery.data
          : tab === "avaliacao"
            ? evaluationQuery.data
            : tab === "cartao"
              ? answerSheetQuery.data
              : teachersQuery.data;

      if (!hasBaseFilters) {
        toast({
          title: "Filtros obrigatórios",
          description: "Selecione estado e município para exportar o ranking.",
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

      await generateRankingReportPdf({
        rankingType: tabToRankingType,
        data,
        filters: requestFilters,
        contextTitle:
          tab === "avaliacao"
            ? filters.evaluation_id
            : tab === "cartao"
              ? filters.answer_sheet_id
              : undefined,
        fileNameBase: `ranking-${tab}`,
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <header className="space-y-1.5">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight sm:gap-3 sm:text-3xl">
            <Trophy className="h-7 w-7 shrink-0 text-primary sm:h-8 sm:w-8" aria-hidden />
            Relatório de ranking
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            Compare desempenho por município, escola, série e turma entre ranking geral, avaliação específica,
            cartão-resposta e professores.
          </p>
        </header>
        <div className="shrink-0 rounded-lg border border-border bg-card px-4 py-3 text-center sm:text-right">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Registros no recorte</span>
          <div className="text-2xl font-bold tabular-nums text-foreground">{currentCount ?? 0}</div>
          <p className="text-xs text-muted-foreground">Escopo aplicado: {derivedScope}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5 text-primary" />
            Filtros principais
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="estado">Estado</Label>
            <Select
              value={filters.estado || "all"}
              onValueChange={(value) =>
                setFilters(
                  { estado: value === "all" ? "" : value },
                  ["municipio", "escola", "serie", "turma", "evaluation_id", "answer_sheet_id"]
                )
              }
            >
              <SelectTrigger id="estado">
                <SelectValue placeholder="Selecione o estado" />
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
                  ["escola", "serie", "turma", "evaluation_id", "answer_sheet_id"]
                )
              }
              disabled={!filters.estado || loadingFilters.municipios}
            >
              <SelectTrigger id="municipio">
                <SelectValue placeholder="Selecione o município" />
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
            <Label htmlFor="escola">Escola</Label>
            <Select
              value={filters.escola || "all"}
              onValueChange={(value) =>
                setFilters({ escola: value === "all" ? "" : value }, ["serie", "turma", "evaluation_id", "answer_sheet_id"])
              }
              disabled={!filters.municipio || loadingFilters.escolas}
            >
              <SelectTrigger id="escola">
                <SelectValue placeholder="Selecione a escola" />
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
              disabled={!filters.escola || loadingFilters.series}
            >
              <SelectTrigger id="serie">
                <SelectValue placeholder="Selecione a série" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as séries</SelectItem>
                {series.map((serie) => (
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
                <SelectValue placeholder="Selecione a turma" />
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

          <div className="space-y-1.5">
            <Label htmlFor="periodo">Período</Label>
            <Input
              id="periodo"
              type="month"
              value={filters.periodo || ""}
              onChange={(e) => setFilters({ periodo: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scope">Escopo detectado</Label>
            <Select value={derivedScope} disabled>
              <SelectTrigger id="scope">
                <SelectValue placeholder="Escopo aplicado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="municipio">Município</SelectItem>
                <SelectItem value="escola">Escola</SelectItem>
                <SelectItem value="turma">Turma</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 md:col-span-3">
            <Button type="button" variant="outline" onClick={clearFilters}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Limpar filtros
            </Button>
            <Button type="button" onClick={handleExportPdf}>
              <Download className="mr-2 h-4 w-4" />
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
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1 md:grid-cols-4">
          <TabsTrigger value="geral" className="gap-2">
            <Trophy className="h-4 w-4" />
            Ranking geral
          </TabsTrigger>
          <TabsTrigger value="avaliacao" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Avaliação específica
          </TabsTrigger>
          <TabsTrigger value="cartao" className="gap-2">
            <ScanLine className="h-4 w-4" />
            Cartão específico
          </TabsTrigger>
          <TabsTrigger value="professores" className="gap-2">
            <Users className="h-4 w-4" />
            Professores
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="mt-6">
          <RankingGeneralPanel
            data={generalQuery.data}
            isLoading={generalQuery.isLoading}
            errorMessage={generalError}
            recorteLabel={recorteLabel}
          />
        </TabsContent>

        <TabsContent value="avaliacao" className="mt-6 space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <Badge variant="secondary" className="w-fit">
                <Medal className="mr-1 h-3 w-3" />
                Ranking por avaliação
              </Badge>
              <Label htmlFor="evaluation_id">Avaliação</Label>
              <Select
                value={filters.evaluation_id || "all"}
                onValueChange={(value) => setFilters({ evaluation_id: value === "all" ? "" : value })}
                disabled={!canLoadRankingItems || loadingFilters.rankingItems}
              >
                <SelectTrigger id="evaluation_id">
                  <SelectValue placeholder="Selecione a avaliação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Selecione</SelectItem>
                  {rankingItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
          <RankingEvaluationPanel
            data={evaluationQuery.data}
            isLoading={evaluationQuery.isLoading}
            errorMessage={evaluationError}
          />
        </TabsContent>

        <TabsContent value="cartao" className="mt-6 space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <Badge variant="secondary" className="w-fit">
                <ScanLine className="mr-1 h-3 w-3" />
                Ranking por cartão-resposta
              </Badge>
              <Label htmlFor="answer_sheet_id">Cartão resposta</Label>
              <Select
                value={filters.answer_sheet_id || "all"}
                onValueChange={(value) => setFilters({ answer_sheet_id: value === "all" ? "" : value })}
                disabled={!canLoadRankingItems || loadingFilters.rankingItems}
              >
                <SelectTrigger id="answer_sheet_id">
                  <SelectValue placeholder="Selecione o cartão resposta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Selecione</SelectItem>
                  {rankingItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
          <RankingAnswerSheetPanel
            data={answerSheetQuery.data}
            isLoading={answerSheetQuery.isLoading}
            errorMessage={answerError}
          />
        </TabsContent>

        <TabsContent value="professores" className="mt-6">
          <RankingTeachersPanel
            data={teachersQuery.data}
            isLoading={teachersQuery.isLoading}
            errorMessage={teachersError}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
