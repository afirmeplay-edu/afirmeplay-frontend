import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, Upload, Palette, Eye, Maximize2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterComponentAnalise } from "@/components/filters";
import { useAuth } from "@/context/authContext";
import {
  EvaluationResultsApiService,
  REPORT_ENTITY_TYPE_ANSWER_SHEET,
  type ReportEntityTypeQuery,
  type NovaRespostaAPI,
} from "@/services/evaluation/evaluationResultsApi";
import { mapAnswerSheetResultadosAgregadosToNovaResposta, type AnswerSheetResultadosAgregadosRaw } from "@/utils/answer-sheet/mapAnswerSheetResultadosAgregadosToNovaResposta";
import { getUserHierarchyContext, getRestrictionMessage, validateReportAccess, UserHierarchyContext, cityIdQueryParamForAdmin } from "@/utils/userHierarchy";
import { api } from "@/lib/api";
import {
  hasMediaMunicipalRelatorioData,
  mergeRelatorioMediaMunicipalIfMissing,
} from "@/utils/reports/presentation19/presentation19MunicipalMedia";
import buildDeckDataForPresentation19Slides from "@/utils/reports/presentation19/buildDeckData";
import { buildSlideSpec } from "@/utils/reports/presentation19/buildSlideSpec";
import type { Presentation19DeckData, Presentation19Mode } from "@/types/presentation19-slides";
import { deriveComparisonAxis } from "@/utils/reports/presentation19/presentationScope";
import {
  Presentation19NativePreviewDeck,
  type Presentation19NativePreviewDeckHandle,
} from "@/components/reports/presentation19/Presentation19NativePreviewDeck";
import { exportPresentation19Pdf, exportPresentation19Pptx } from "@/services/reports/presentation19/Presentation19SlidesExportService";
import type { RelatorioCompleto } from "@/types/evaluation-results";
import { loadCityBrandingForReportPdf } from "@/utils/pdfCityBranding";
import { normalizeResultsPeriodYm } from "@/utils/resultsPeriod";

function asNormOpt(o: { nome?: string; name?: string; titulo?: string }): string {
  return String(o.nome ?? o.name ?? o.titulo ?? "").trim();
}

/** Mesma heurística do deck (série a partir do rótulo de turma). */
function extractSerieFromTurmaName(turma?: string | null): string {
  const t = (turma ?? "").trim();
  if (!t) return "";
  if (/^[A-Za-z]$/.test(t)) return "";
  const m = t.match(/(\d+º)\s*(?:ano)?/i);
  if (m?.[1]) return `${m[1]} Ano`;
  return t.split(/\s+/)[0] || "";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

export default function RelatorioApresentacao19Slides() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [activeMode, setActiveMode] = useState<Presentation19Mode>("answer_sheet");

  const [userHierarchyContext, setUserHierarchyContext] = useState<UserHierarchyContext | null>(null);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(true);

  // filtros compartilhados (estado/município/escola)
  const [selectedState, setSelectedState] = useState<string>("all");
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>("all");
  const [selectedSchool, setSelectedSchool] = useState<string>("all");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("all");

  // filtros específicos por aba (evaluation_id vs gabarito)
  const [selectedEvaluationAnswerSheet, setSelectedEvaluationAnswerSheet] = useState<string>("all");
  const [selectedEvaluationEval, setSelectedEvaluationEval] = useState<string>("all");

  const selectedEvaluation = activeMode === "answer_sheet" ? selectedEvaluationAnswerSheet : selectedEvaluationEval;

  const [isLoadingFilters, setIsLoadingFilters] = useState(false);

  const [primaryColor, setPrimaryColor] = useState<string>("#7c3aed");
  const [logoDataUrl, setLogoDataUrl] = useState<string>("/LOGO-1-menor.png");
  const [coverSubtitle, setCoverSubtitle] = useState<string>("");
  const [footerText, setFooterText] = useState<string>("");
  const [closingMessage, setClosingMessage] = useState<string>("Obrigado!!");

  const [deckData, setDeckData] = useState<Presentation19DeckData | null>(null);
  const lastDeckLoadErrorRef = useRef<string | null>(null);

  /** Cartão-resposta: opções em cascata (mesma rota do relatório escolar). */
  const [asSerie, setAsSerie] = useState<string>("all");
  const [asTurma, setAsTurma] = useState<string>("all");
  const [asOpcoes, setAsOpcoes] = useState<{
    series?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
    turmas?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
  }>({});

  /** Avaliações: séries/turmas derivadas do relatório completo (sem endpoint dedicado). */
  const [evSerie, setEvSerie] = useState<string>("all");
  const [evTurma, setEvTurma] = useState<string>("all");
  const [relatorioEvalOpcoes, setRelatorioEvalOpcoes] = useState<RelatorioCompleto | null>(null);

  const selectedSerie = activeMode === "answer_sheet" ? asSerie : evSerie;
  const selectedTurma = activeMode === "answer_sheet" ? asTurma : evTurma;

  /** Um `buildSlideSpec` por troca de deck — preview e export reutilizam o mesmo objeto. */
  const presentationSpec = useMemo(() => (deckData ? buildSlideSpec(deckData) : null), [deckData]);
  const slidesCount = presentationSpec?.slides.length ?? 22;

  const [isGenerating, setIsGenerating] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const exportProgressTimerRef = useRef<number | null>(null);
  const previewDeckRef = useRef<Presentation19NativePreviewDeckHandle>(null);

  const clearProgressInterval = useCallback(() => {
    if (exportProgressTimerRef.current) {
      window.clearInterval(exportProgressTimerRef.current);
      exportProgressTimerRef.current = null;
    }
  }, []);

  /** Barra incremental (mesma lógica do export) enquanto há trabalho assíncrono na rede. */
  const startIndeterminateLoadingBar = useCallback(() => {
    setExportProgress(10);
    clearProgressInterval();
    exportProgressTimerRef.current = window.setInterval(() => {
      setExportProgress((prev) => {
        if (prev >= 90) return prev;
        const step = prev < 50 ? 12 : 6;
        return Math.min(90, prev + step);
      });
    }, 450);
  }, [clearProgressInterval]);

  const finishIndeterminateLoadingBar = useCallback(() => {
    clearProgressInterval();
    setExportProgress(100);
    window.setTimeout(() => setExportProgress(0), 700);
  }, [clearProgressInterval]);
  /** Evita refetch ao repetir “Gerar pré-visualização” / export com os mesmos filtros. */
  const previewDataCacheRef = useRef<{ key: string; deck: Presentation19DeckData } | null>(null);

  const clearDeckAndCache = useCallback(() => {
    setDeckData(null);
    previewDataCacheRef.current = null;
  }, []);

  const normalizedRole = useMemo(() => user?.role?.toLowerCase(), [user?.role]);
  const roleRequiresSpecificSchool = useMemo(
    () => (normalizedRole ? ["diretor", "coordenador", "professor"].includes(normalizedRole) : false),
    [normalizedRole]
  );

  const fallbackSchools = useMemo(() => {
    const uniqueSchools = new Map<string, { id: string; name: string; municipalityId?: string }>();

    if (userHierarchyContext?.school?.id) {
      uniqueSchools.set(userHierarchyContext.school.id, {
        id: userHierarchyContext.school.id,
        name: userHierarchyContext.school.name,
        municipalityId: userHierarchyContext.school.municipality_id,
      });
    }

    if (Array.isArray(userHierarchyContext?.classes)) {
      userHierarchyContext!.classes!.forEach((classe) => {
        if (classe.school_id) {
          uniqueSchools.set(classe.school_id, {
            id: classe.school_id,
            name: classe.school_name,
            municipalityId: userHierarchyContext?.municipality?.id,
          });
        }
      });
    }

    return Array.from(uniqueSchools.values());
  }, [userHierarchyContext]);

  const adminCityIdQuery = useMemo(
    () => cityIdQueryParamForAdmin(user?.role, selectedMunicipality === "all" ? undefined : selectedMunicipality),
    [user?.role, selectedMunicipality]
  );

  const periodoApi = useMemo(() => {
    if (selectedPeriod === "all") return undefined;
    const n = normalizeResultsPeriodYm(selectedPeriod);
    return n === "all" ? undefined : n;
  }, [selectedPeriod]);

  const fetchAnswerSheetOpcoes = useCallback(async () => {
    if (activeMode !== "answer_sheet") return;
    const params = new URLSearchParams();
    if (selectedState !== "all") params.set("estado", selectedState);
    if (selectedMunicipality !== "all") params.set("municipio", selectedMunicipality);
    if (selectedEvaluationAnswerSheet !== "all") params.set("gabarito", selectedEvaluationAnswerSheet);
    if (selectedSchool !== "all") params.set("escola", selectedSchool);
    if (asSerie !== "all") params.set("serie", asSerie);
    if (asTurma !== "all") params.set("turma", asTurma);
    if (periodoApi) params.set("periodo", periodoApi);
    const q = params.toString();
    try {
      setIsLoadingFilters(true);
      const res = await api.get<{
        series?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
        turmas?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
      }>(`/answer-sheets/opcoes-filtros-results${q ? `?${q}` : ""}`);
      setAsOpcoes(res.data || {});
    } catch {
      setAsOpcoes({});
    } finally {
      setIsLoadingFilters(false);
    }
  }, [
    activeMode,
    selectedState,
    selectedMunicipality,
    selectedEvaluationAnswerSheet,
    selectedSchool,
    asSerie,
    asTurma,
    periodoApi,
  ]);

  useEffect(() => {
    if (activeMode === "answer_sheet" && selectedMunicipality !== "all" && selectedEvaluationAnswerSheet !== "all") {
      void fetchAnswerSheetOpcoes();
    }
  }, [activeMode, fetchAnswerSheetOpcoes, selectedEvaluationAnswerSheet, selectedMunicipality]);

  // hierarquia do usuário (permissões + pre-seleções)
  useEffect(() => {
    const loadUserHierarchy = async () => {
      if (!user?.id || !user?.role) {
        setIsLoadingHierarchy(false);
        return;
      }
      try {
        setIsLoadingHierarchy(true);
        const context = await getUserHierarchyContext(user.id, user.role);
        setUserHierarchyContext(context);
      } catch {
        toast({
          title: "Aviso",
          description: "Não foi possível carregar suas permissões.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingHierarchy(false);
      }
    };
    void loadUserHierarchy();
  }, [user?.id, user?.role, toast]);

  // fallback de valores: a lógica de seleção inicial do FilterComponentAnalise costuma cuidar.
  // Aqui mantemos apenas a validação de acesso antes do export.

  const allRequiredFiltersSelected = useMemo(() => {
    return (
      selectedState !== "all" &&
      selectedMunicipality !== "all" &&
      selectedEvaluation !== "all" &&
      (!roleRequiresSpecificSchool || selectedSchool !== "all")
    );
  }, [roleRequiresSpecificSchool, selectedEvaluation, selectedMunicipality, selectedSchool, selectedState]);

  /** Avaliações: carrega relatório para montar listas de série/turma (fallback client-side). */
  useEffect(() => {
    if (activeMode !== "evaluations" || !allRequiredFiltersSelected) {
      setRelatorioEvalOpcoes(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await EvaluationResultsApiService.getRelatorioCompleto(selectedEvaluationEval, {
          ...(selectedSchool !== "all" ? { schoolId: selectedSchool } : {}),
          ...(selectedMunicipality !== "all" ? { cityId: selectedMunicipality } : {}),
          ...(adminCityIdQuery ? { adminCityIdQuery } : {}),
        });
        if (!cancelled) setRelatorioEvalOpcoes(r);
      } catch {
        if (!cancelled) setRelatorioEvalOpcoes(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeMode, adminCityIdQuery, allRequiredFiltersSelected, selectedEvaluationEval, selectedMunicipality, selectedSchool]);

  const evalSeriesOptions = useMemo(() => {
    const pt = relatorioEvalOpcoes?.total_alunos?.por_turma ?? [];
    const uniq = new Set<string>();
    for (const row of pt) {
      const s =
        String((row as { serie?: string }).serie ?? "").trim() || extractSerieFromTurmaName((row as { turma?: string }).turma);
      if (s) uniq.add(s);
    }
    return Array.from(uniq).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  }, [relatorioEvalOpcoes]);

  const evalTurmasOptions = useMemo(() => {
    if (evSerie === "all") return [] as string[];
    const pt = relatorioEvalOpcoes?.total_alunos?.por_turma ?? [];
    const out = new Set<string>();
    for (const row of pt) {
      const s =
        String((row as { serie?: string }).serie ?? "").trim() || extractSerieFromTurmaName((row as { turma?: string }).turma);
      if (s !== evSerie) continue;
      const t = String((row as { turma?: string }).turma ?? "").trim();
      if (t) out.add(t);
    }
    return Array.from(out).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  }, [relatorioEvalOpcoes, evSerie]);

  useEffect(() => {
    // ao trocar aba, limpamos o deck para forçar recálculo com os dados corretos
    clearDeckAndCache();
  }, [activeMode, selectedEvaluation, selectedSerie, selectedTurma, selectedSchool, clearDeckAndCache]);

  const reportEntityType: ReportEntityTypeQuery | undefined =
    activeMode === "answer_sheet" ? REPORT_ENTITY_TYPE_ANSWER_SHEET : undefined;

  const getDeckLoadCacheKey = useCallback(() => {
    return JSON.stringify({
      activeMode,
      evaluation: selectedEvaluation,
      state: selectedState,
      municipality: selectedMunicipality,
      school: selectedSchool,
      period: periodoApi ?? "",
      asSerie,
      asTurma,
      evSerie,
      evTurma,
      primaryColor,
      logoDataUrl,
      coverSubtitle,
      footerText,
      closingMessage,
      reportEntityType: reportEntityType ?? "",
      adminCity: adminCityIdQuery ?? "",
    });
  }, [
    activeMode,
    adminCityIdQuery,
    asSerie,
    asTurma,
    closingMessage,
    coverSubtitle,
    evSerie,
    evTurma,
    footerText,
    logoDataUrl,
    periodoApi,
    primaryColor,
    reportEntityType,
    selectedEvaluation,
    selectedMunicipality,
    selectedSchool,
    selectedState,
  ]);

  const loadDeckData = useCallback(async (): Promise<Presentation19DeckData | null> => {
    if (!allRequiredFiltersSelected) return null;

    const evaluationId = selectedEvaluation;
    const cacheKey = getDeckLoadCacheKey();
    const cached = previewDataCacheRef.current;
    if (cached?.key === cacheKey) {
      setDeckData(cached.deck);
      return cached.deck;
    }

    const comparisonAxis = deriveComparisonAxis({
      school: selectedSchool,
      serie: selectedSerie,
      turma: selectedTurma,
    });

    const relatorioParams = {
      ...(selectedSchool !== "all" ? { schoolId: selectedSchool } : {}),
      ...(selectedMunicipality !== "all" ? { cityId: selectedMunicipality } : {}),
      ...(adminCityIdQuery ? { adminCityIdQuery } : {}),
      ...(reportEntityType ? { reportEntityType } : {}),
    };

    const fetchNovaResposta = async (): Promise<{ turma: NovaRespostaAPI | null; serie: NovaRespostaAPI | null }> => {
      if (activeMode === "answer_sheet") {
        const mkParams = (turmaId: string) => {
          const params = new URLSearchParams();
          params.set("estado", selectedState);
          params.set("municipio", selectedMunicipality);
          params.set("gabarito", evaluationId);
          if (selectedSchool !== "all") params.set("escola", selectedSchool);
          if (asSerie !== "all") params.set("serie", asSerie);
          if (turmaId !== "all") params.set("turma", turmaId);
          if (periodoApi) params.set("periodo", periodoApi);
          return params;
        };
        const requestCfg = selectedMunicipality !== "all" ? { meta: { cityId: selectedMunicipality } } : {};

        const fetchOne = async (turmaId: string): Promise<NovaRespostaAPI | null> => {
          const params = mkParams(turmaId);
          const res2 = await api.get<AnswerSheetResultadosAgregadosRaw>(`/answer-sheets/resultados-agregados?${params.toString()}`, requestCfg);
          return mapAnswerSheetResultadosAgregadosToNovaResposta(res2.data, {
            estado: selectedState,
            municipio: selectedMunicipality,
            gabarito: evaluationId,
            escola: selectedSchool,
            serie: asSerie,
            turma: turmaId,
          });
        };

        const turma = await fetchOne(asTurma);
        let serie: NovaRespostaAPI | null = null;
        if (asTurma !== "all") {
          try {
            serie = await fetchOne("all");
          } catch {
            // Se o backend falhar ao retornar o agregado da série, ainda exportamos com o recorte da turma.
            // O deck mantém fallbacks legados quando `novaRespostaSerieAgregados` não estiver disponível.
            serie = null;
          }
        }
        return { turma, serie };
      }
      const params = new URLSearchParams();
      params.set("estado", selectedState);
      params.set("municipio", selectedMunicipality);
      params.set("avaliacao", evaluationId);
      if (selectedSchool !== "all") params.set("escola", selectedSchool);
      if (adminCityIdQuery) params.set("city_id", adminCityIdQuery);
      if (periodoApi) params.set("periodo", periodoApi);
      const resEval = await api.get<NovaRespostaAPI>(
        `/evaluation-results/avaliacoes?${params.toString()}`,
        selectedMunicipality !== "all" ? { meta: { cityId: selectedMunicipality } } : {}
      );
      return { turma: resEval.data, serie: null };
    };

    try {
      lastDeckLoadErrorRef.current = null;
      const [relatorioCompletoRaw, novaRespostas] = await Promise.all([
        EvaluationResultsApiService.getRelatorioCompleto(evaluationId, relatorioParams),
        fetchNovaResposta(),
      ]);

      let relatorioCompleto = relatorioCompletoRaw;

      const needsMunicipalMerge =
        selectedSchool !== "all" &&
        (!hasMediaMunicipalRelatorioData(
          relatorioCompleto?.proficiencia?.media_municipal_por_disciplina as Record<string, number> | undefined
        ) ||
          !hasMediaMunicipalRelatorioData(
            relatorioCompleto?.nota_geral?.media_municipal_por_disciplina as Record<string, number> | undefined
          ));

      if (needsMunicipalMerge && selectedMunicipality !== "all") {
        try {
          const municipalRelatorio = await EvaluationResultsApiService.getRelatorioCompleto(evaluationId, {
            cityId: selectedMunicipality,
            ...(adminCityIdQuery ? { adminCityIdQuery } : {}),
            ...(reportEntityType ? { reportEntityType } : {}),
          });
          relatorioCompleto = mergeRelatorioMediaMunicipalIfMissing(relatorioCompleto, municipalRelatorio);
        } catch {
          // Mantém relatório da escola; gráficos municipais só aparecem se o backend enviar o campo.
        }
      }

      if (!relatorioCompleto) {
        toast({
          title: "Erro ao carregar",
          description: "Não foi possível obter o relatório completo (endpoint 1).",
          variant: "destructive",
        });
        return null;
      }

      const hasCoreData =
        Boolean(relatorioCompleto.total_alunos) &&
        Boolean(relatorioCompleto.niveis_aprendizagem) &&
        Boolean(relatorioCompleto.proficiencia) &&
        Boolean(relatorioCompleto.acertos_por_habilidade);

      if (!hasCoreData) {
        toast({
          title: "Dados incompletos no relatório",
          description:
            "O relatório retornou sem dados essenciais (presença/níveis/proficiência/questões). Verifique os filtros ou permissões.",
          variant: "destructive",
        });
      }

      // IMPORTANT:
      // O deck (buildDeckData) trabalha com o shape original do RelatorioCompleto (snake_case).
      // Normalizações para UI podem alterar chaves e zerar métricas (níveis/proficiência).
      const relatorioNormalizado: RelatorioCompleto = relatorioCompleto;

      const selectedSerieLabel =
        activeMode === "answer_sheet"
          ? asNormOpt((asOpcoes.series ?? []).find((s) => s.id === asSerie) ?? {}) || undefined
          : evSerie !== "all"
            ? evSerie
            : undefined;

      const turmaOpcao =
        activeMode === "answer_sheet"
          ? (asOpcoes.turmas ?? []).find((t) => t.id === asTurma)
          : undefined;
      const selectedTurmaLabel =
        activeMode === "answer_sheet"
          ? asNormOpt(turmaOpcao ?? {}) || undefined
          : evTurma !== "all"
            ? evTurma
            : undefined;
      const selectedTurmaShift =
        activeMode === "answer_sheet"
          ? String((turmaOpcao as { shift?: string } | undefined)?.shift ?? "").trim() || undefined
          : undefined;

      const deck = buildDeckDataForPresentation19Slides({
        mode: activeMode,
        comparisonAxis,
        selectedSchoolId: selectedSchool !== "all" ? selectedSchool : undefined,
        selectedSerieLabel,
        selectedTurmaLabel,
        selectedTurmaShift,
        relatorioDetalhado: relatorioNormalizado,
        novaRespostaAgregados: novaRespostas.turma,
        novaRespostaSerieAgregados: novaRespostas.serie,
        primaryColor,
        logoDataUrl,
        coverSubtitle: coverSubtitle.trim() || undefined,
        footerText: footerText.trim() || undefined,
        closingMessage: closingMessage.trim() || undefined,
      });

      previewDataCacheRef.current = { key: cacheKey, deck };
      setDeckData(deck);
      return deck;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao carregar dados para o relatório.";
      lastDeckLoadErrorRef.current = msg;
      toast({
        title: "Erro ao gerar",
        description: msg,
        variant: "destructive",
      });
      return null;
    }
  }, [
    getDeckLoadCacheKey,
    adminCityIdQuery,
    activeMode,
    allRequiredFiltersSelected,
    asOpcoes,
    asSerie,
    asTurma,
    evSerie,
    evTurma,
    closingMessage,
    coverSubtitle,
    footerText,
    logoDataUrl,
    primaryColor,
    reportEntityType,
    selectedEvaluation,
    selectedMunicipality,
    selectedSchool,
    selectedSerie,
    selectedTurma,
    selectedState,
    periodoApi,
    toast,
  ]);

  const validateAccess = useCallback(() => {
    if (!userHierarchyContext || !user?.role) return true;
    const validation = validateReportAccess(
      user.role,
      {
        state: selectedState,
        municipality: selectedMunicipality,
        school: selectedSchool,
      },
      userHierarchyContext
    );
    if (!validation.isValid) {
      toast({
        title: "Acesso Negado",
        description: validation.reason || getRestrictionMessage(user.role),
        variant: "destructive",
      });
      return false;
    }
    return true;
  }, [selectedMunicipality, selectedSchool, selectedState, toast, user?.role, userHierarchyContext]);

  const handleGeneratePreview = useCallback(async () => {
    if (!validateAccess()) return;
    if (!allRequiredFiltersSelected) {
      toast({
        title: "Atenção",
        description: "Selecione Estado, Município, Escola e Avaliação/Gabarito para gerar a pré-visualização.",
        variant: "destructive",
      });
      return;
    }
    const cacheKey = getDeckLoadCacheKey();
    const hadCache = previewDataCacheRef.current?.key === cacheKey;

    if (hadCache) {
      const deck = await loadDeckData();
      if (deck) {
        const n = buildSlideSpec(deck).slides.length;
        toast({
          title: "Pré-visualização pronta",
          description: `${n} slide${n === 1 ? "" : "s"} (mesmos filtros, sem nova busca na rede).`,
        });
      }
      return;
    }

    setIsGenerating(true);
    startIndeterminateLoadingBar();
    try {
      const deck = await loadDeckData();
      if (deck) {
        const n = buildSlideSpec(deck).slides.length;
        toast({
          title: "Pré-visualização atualizada",
          description: `${n} slide${n === 1 ? "" : "s"} carregado${n === 1 ? "" : "s"}.`,
        });
      }
    } finally {
      setIsGenerating(false);
      finishIndeterminateLoadingBar();
    }
  }, [
    allRequiredFiltersSelected,
    finishIndeterminateLoadingBar,
    getDeckLoadCacheKey,
    loadDeckData,
    startIndeterminateLoadingBar,
    toast,
    validateAccess,
  ]);

  const handleExport = useCallback(
    async (format: "pdf" | "pptx") => {
      if (!validateAccess()) return;
      if (!allRequiredFiltersSelected) {
        toast({
          title: "Atenção",
          description: "Selecione Estado, Município, Escola e Avaliação/Gabarito para gerar o relatório.",
          variant: "destructive",
        });
        return;
      }
      setIsGenerating(true);
      startIndeterminateLoadingBar();

      try {
        // Se o deck ainda não existe para as seleções atuais, carregamos.
        let activeDeck = deckData;
        if (!activeDeck) {
          activeDeck = await loadDeckData();
        }

        if (!activeDeck) {
          throw new Error(lastDeckLoadErrorRef.current ? `Falha ao carregar deck: ${lastDeckLoadErrorRef.current}` : "Deck não disponível para exportação.");
        }
        const safeEval = selectedEvaluation.replace(/[^a-zA-Z0-9-_]+/g, "-").toLowerCase();
        const fileName = `relatorio_19-slides_${activeMode}_${safeEval}_${new Date().toISOString().split("T")[0]}.${format === "pdf" ? "pdf" : "pptx"}`;

        if (format === "pdf") {
          let deckForPdf = activeDeck;
          if (selectedMunicipality !== "all") {
            const presentationBranding = await loadCityBrandingForReportPdf(selectedMunicipality);
            if (presentationBranding.logo) {
              deckForPdf = { ...deckForPdf, logoDataUrl: presentationBranding.logo.dataUrl };
            }
          }
          const specForPdf =
            presentationSpec != null && activeDeck === deckData
              ? deckForPdf === activeDeck
                ? presentationSpec
                : { ...presentationSpec, deckData: deckForPdf }
              : buildSlideSpec(deckForPdf);
          await exportPresentation19Pdf({
            spec: specForPdf,
            fileName,
          });
        } else {
          const specForPptx =
            presentationSpec != null && activeDeck === deckData ? presentationSpec : buildSlideSpec(activeDeck);
          await exportPresentation19Pptx({
            spec: specForPptx,
            fileName,
          });
        }

        toast({
          title: "Exportação concluída!",
          description: format === "pdf" ? "PDF gerado com sucesso." : "PPTX gerado com sucesso.",
        });
      } catch (e) {
        toast({
          title: "Erro na exportação",
          description: e instanceof Error ? e.message : "Falha ao exportar o relatório.",
          variant: "destructive",
        });
      } finally {
        setIsGenerating(false);
        finishIndeterminateLoadingBar();
      }
    },
    [
      activeMode,
      allRequiredFiltersSelected,
      deckData,
      finishIndeterminateLoadingBar,
      loadDeckData,
      presentationSpec,
      selectedEvaluation,
      selectedMunicipality,
      startIndeterminateLoadingBar,
      toast,
      validateAccess,
    ]
  );

  return (
    <div className="p-6 min-h-screen bg-background">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">Relatório Apresentação</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gere um deck exportável em PDF/PPTX com personalização de logo e cor principal.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <Tabs value={activeMode} onValueChange={(v) => setActiveMode(v as Presentation19Mode)}>
            <TabsList className="grid grid-cols-2 bg-muted/60 rounded-xl p-1 border border-border">
              <TabsTrigger value="answer_sheet">Cartões resposta</TabsTrigger>
              <TabsTrigger value="evaluations">Avaliações</TabsTrigger>
            </TabsList>

          <TabsContent value="answer_sheet" className="space-y-6 mt-4">
            <FilterComponentAnalise
              selectedState={selectedState}
              selectedMunicipality={selectedMunicipality}
              selectedSchool={selectedSchool}
              selectedEvaluation={selectedEvaluationAnswerSheet}
              onStateChange={setSelectedState}
              onMunicipalityChange={setSelectedMunicipality}
              onSchoolChange={setSelectedSchool}
              onEvaluationChange={setSelectedEvaluationAnswerSheet}
              isLoadingFilters={isLoadingFilters}
              onLoadingChange={setIsLoadingFilters}
              userRole={user?.role}
              canSelectState={userHierarchyContext?.restrictions.canSelectState}
              canSelectMunicipality={userHierarchyContext?.restrictions.canSelectMunicipality}
              canSelectSchool={userHierarchyContext?.restrictions.canSelectSchool}
              reportEntityType={REPORT_ENTITY_TYPE_ANSWER_SHEET}
              fallbackSchools={fallbackSchools}
              loadSchoolsAfterEvaluation={true}
              adminCityIdQuery={adminCityIdQuery}
              selectedPeriod={selectedPeriod}
              onPeriodChange={(p) => {
                setSelectedPeriod(p);
                clearDeckAndCache();
              }}
              extraFilters={
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Série</label>
                    <Select
                      value={asSerie}
                      onValueChange={(v) => {
                        setAsSerie(v);
                        setAsTurma("all");
                        clearDeckAndCache();
                      }}
                      disabled={isLoadingFilters || selectedSchool === "all"}
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {(asOpcoes.series ?? []).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {asNormOpt(s) || s.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Turma</label>
                    <Select
                      value={asTurma}
                      onValueChange={(v) => {
                        setAsTurma(v);
                        clearDeckAndCache();
                      }}
                      disabled={isLoadingFilters || asSerie === "all"}
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {(asOpcoes.turmas ?? []).map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {asNormOpt(t) || t.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              }
            />
          </TabsContent>

          <TabsContent value="evaluations" className="space-y-6 mt-4">
            <FilterComponentAnalise
              selectedState={selectedState}
              selectedMunicipality={selectedMunicipality}
              selectedSchool={selectedSchool}
              selectedEvaluation={selectedEvaluationEval}
              onStateChange={setSelectedState}
              onMunicipalityChange={setSelectedMunicipality}
              onSchoolChange={setSelectedSchool}
              onEvaluationChange={setSelectedEvaluationEval}
              isLoadingFilters={isLoadingFilters}
              onLoadingChange={setIsLoadingFilters}
              userRole={user?.role}
              canSelectState={userHierarchyContext?.restrictions.canSelectState}
              canSelectMunicipality={userHierarchyContext?.restrictions.canSelectMunicipality}
              canSelectSchool={userHierarchyContext?.restrictions.canSelectSchool}
              fallbackSchools={fallbackSchools}
              loadSchoolsAfterEvaluation={true}
              adminCityIdQuery={adminCityIdQuery}
              selectedPeriod={selectedPeriod}
              onPeriodChange={(p) => {
                setSelectedPeriod(p);
                clearDeckAndCache();
              }}
              extraFilters={
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Série</label>
                    <Select
                      value={evSerie}
                      onValueChange={(v) => {
                        setEvSerie(v);
                        setEvTurma("all");
                        clearDeckAndCache();
                      }}
                      disabled={selectedSchool === "all" || evalSeriesOptions.length === 0}
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {evalSeriesOptions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Turma</label>
                    <Select
                      value={evTurma}
                      onValueChange={(v) => {
                        setEvTurma(v);
                        clearDeckAndCache();
                      }}
                      disabled={evSerie === "all" || evalTurmasOptions.length === 0}
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {evalTurmasOptions.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground col-span-full">
                    Séries e turmas são derivadas do relatório após escolher escola e avaliação. O eixo de comparação do deck segue estes
                    filtros.
                  </p>
                </>
              }
            />
          </TabsContent>
          </Tabs>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Personalização
              </CardTitle>
              <CardDescription>
                Cor, logo, textos institucionais e rodapé são aplicados na pré-visualização e nos arquivos PDF e PPTX.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-12 h-10 border border-border rounded-md bg-background p-0"
                    aria-label="Cor principal"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1 bg-background text-foreground border border-border rounded-md px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                    aria-label="Cor principal (hex)"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  Dica: use cores que combinem com o tema institucional.
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label
                    className="flex-1 flex items-center justify-center gap-2 border border-border rounded-md px-4 py-2 cursor-pointer hover:bg-muted transition-colors"
                    htmlFor="presentation-logo-upload"
                  >
                    <Upload className="h-4 w-4" />
                    <span className="text-sm font-medium">Upload de Logo</span>
                  </label>
                  <input
                    id="presentation-logo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const dataUrl = await readFileAsDataUrl(file);
                        setLogoDataUrl(dataUrl);
                      } catch {
                        toast({ title: "Erro", description: "Não foi possível carregar o arquivo de logo.", variant: "destructive" });
                      }
                    }}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-xs text-muted-foreground">Pré-visualização</div>
                  <img src={logoDataUrl} alt="Logo selecionada" className="h-12 w-auto object-contain border border-border rounded-md bg-white" />
                </div>
              </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="p19-cover-subtitle" className="text-sm font-medium">
                    Subtítulo na capa (opcional)
                  </label>
                  <input
                    id="p19-cover-subtitle"
                    type="text"
                    value={coverSubtitle}
                    onChange={(e) => setCoverSubtitle(e.target.value)}
                    placeholder="Ex.: Secretaria Municipal de Educação"
                    className="w-full bg-background text-foreground border border-border rounded-md px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">Aparece abaixo do título da avaliação na primeira página.</p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="p19-footer" className="text-sm font-medium">
                    Rodapé em todos os slides (opcional)
                  </label>
                  <input
                    id="p19-footer"
                    type="text"
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    placeholder="Ex.: contato@prefeitura.gov.br"
                    className="w-full bg-background text-foreground border border-border rounded-md px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">Texto discreto na base de cada slide (PDF, PPTX e pré-visualização).</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="p19-closing" className="text-sm font-medium">
                    Mensagem final
                  </label>
                  <input
                    id="p19-closing"
                    type="text"
                    value={closingMessage}
                    onChange={(e) => setClosingMessage(e.target.value)}
                    placeholder="Obrigado!!"
                    className="w-full max-w-md bg-background text-foreground border border-border rounded-md px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">Último slide de encerramento do deck.</p>
                </div>
              </div>
            </CardContent>
          </Card>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleGeneratePreview()}
                disabled={isGenerating || !allRequiredFiltersSelected}
              >
                <Eye className="h-4 w-4 mr-2" />
                Gerar pré-visualização
              </Button>
              <Button
                onClick={() => handleExport("pdf")}
                disabled={isGenerating || !allRequiredFiltersSelected}
                style={{
                  backgroundColor: primaryColor,
                  borderColor: primaryColor,
                }}
                className="text-white hover:opacity-95"
              >
                <Download className="h-4 w-4 mr-2" />
                Gerar PDF
              </Button>
              <Button
                variant="outline"
                onClick={() => handleExport("pptx")}
                disabled={isGenerating || !allRequiredFiltersSelected}
                style={{
                  borderColor: primaryColor,
                  color: primaryColor,
                }}
                className="hover:opacity-95"
              >
                <FileText className="h-4 w-4 mr-2" />
                Gerar PPTX
              </Button>
            </div>

            {isGenerating && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Carregando dados…</div>
                  <div className="text-xs text-muted-foreground">{exportProgress}%</div>
                </div>
                <Progress value={exportProgress} className="h-2" />
              </div>
            )}

          {deckData && (
            <div className="relative border border-border rounded-xl p-4 bg-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold">Pré-visualização</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{slidesCount} slides</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 shrink-0"
                    onClick={() => previewDeckRef.current?.openFullscreen()}
                    disabled={slidesCount === 0}
                  >
                    <Maximize2 className="h-4 w-4" />
                    Tela cheia
                  </Button>
                </div>
              </div>

              <div className="overflow-auto">
                <div>
                  <Presentation19NativePreviewDeck ref={previewDeckRef} deckData={deckData} spec={presentationSpec ?? undefined} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

