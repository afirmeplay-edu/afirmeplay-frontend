import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CopyCheck, Download, Eye, FileText, Filter, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { FormFiltersApiService } from "@/services/formFiltersApi";
import {
  EvaluationResultsApiService,
  REPORT_ENTITY_TYPE_ANSWER_SHEET,
} from "@/services/evaluation/evaluationResultsApi";
import { EvaluationInstrumentPicker } from "@/components/filters";
import { getEtiquetasApiError, getEtiquetasDados } from "@/services/documents/etiquetasApi";
import { downloadEtiquetasPdf, type EtiquetaPdfEntry } from "@/services/reports/etiquetasPdf";
import type {
  EtiquetaEditItem,
  EtiquetasDadosResponse,
  EtiquetasModo,
} from "@/types/etiquetas";
import { loadCityBrandingPdfAssets } from "@/utils/pdfCityBranding";
import {
  enrichEtiquetasContext,
  etiquetaEscolaKey,
  etiquetasSerieTurmaTurnoLine,
  TEXTO_ACIMA_ASSINATURA_MAX,
  TEXTO_LIVRE_TAMANHO_PADRAO,
} from "@/utils/etiquetasDisplay";
import { EtiquetaTextToolbar } from "@/components/documents/EtiquetaTextToolbar";
import { EtiquetaPreviewDialog } from "@/components/documents/EtiquetaPreviewDialog";
import { inferCursoFromSerieName, matchCourseOptionId } from "@/utils/gradeToCourse";
import { normalizeClassShift } from "@/lib/classShift";

type Option = { id: string; name: string };
type SerieOption = Option & { educationStageId?: string; schoolIds: string[] };
type TurmaOption = Option & { serieId: string; schoolId: string };
type NivelOption = { id: string; name: string };
type LabelGroup = { key: string; escola: string; labels: EtiquetaEditItem[] };

const SERIE_TODAS = "todas";
const ESCOLA_TODAS = "todas";
const LABELS_PER_PAGE = 8;
const CONTEXT_BATCH_SIZE = 5;
const FILTER_BATCH_SIZE = 6;

/** Campos copiados pelo botão "Aplicar a todos" para as etiquetas da mesma escola. */
const SHARED_LABEL_FIELDS: (keyof EtiquetaEditItem)[] = [
  "textoLivre",
  "textoLivreCor",
  "textoLivreTamanho",
  "textoLivreAlinhamento",
  "exibirAssinatura",
  "textoAcimaAssinatura",
  "nomeAplicador",
  "cpfAplicador",
  "exibirSegundoAplicador",
  "textoAcimaAssinatura2",
  "nomeAplicador2",
  "cpfAplicador2",
];

function pickSharedFields(label: EtiquetaEditItem): Partial<EtiquetaEditItem> {
  return Object.fromEntries(
    SHARED_LABEL_FIELDS.map((field) => [field, label[field]])
  ) as Partial<EtiquetaEditItem>;
}

function sharesFieldsWith(a: EtiquetaEditItem, b: EtiquetaEditItem): boolean {
  return SHARED_LABEL_FIELDS.every((field) => a[field] === b[field]);
}

function hasSharedContent(label: EtiquetaEditItem): boolean {
  const values = [label.textoLivre];
  if (label.exibirAssinatura) {
    values.push(label.textoAcimaAssinatura, label.nomeAplicador, label.cpfAplicador);
    if (label.exibirSegundoAplicador) {
      values.push(label.textoAcimaAssinatura2, label.nomeAplicador2, label.cpfAplicador2);
    }
  }
  return values.some((value) => value?.trim());
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    results.push(...(await Promise.all(items.slice(i, i + batchSize).map(fn))));
  }
  return results;
}

function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

const TURNO_OPTIONS: Option[] = [
  { id: "MATUTINO", name: "Matutino" },
  { id: "VESPERTINO", name: "Vespertino" },
  { id: "NOTURNO", name: "Noturno" },
  { id: "INTEGRAL", name: "Integral" },
];

const MODO_OPTIONS: { value: EtiquetasModo; label: string }[] = [
  { value: "manual", label: "Personalizável" },
  { value: "avaliacao", label: "Avaliação" },
  { value: "cartao_resposta", label: "Cartão resposta" },
];

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function maskCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function getAppliedTitle(optionId: string, options: Option[]): string {
  return options.find((item) => item.id === optionId)?.name?.trim() || "";
}

function createEtiquetaItem(index: number, patch?: Partial<EtiquetaEditItem>): EtiquetaEditItem {
  return {
    id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    titulo: "",
    textoLivre: "",
    exibirAssinatura: true,
    nomeAplicador: "",
    cpfAplicador: "",
    exibirSegundoAplicador: false,
    nomeAplicador2: "",
    cpfAplicador2: "",
    textoLivreCor: "#000000",
    textoLivreTamanho: TEXTO_LIVRE_TAMANHO_PADRAO,
    textoLivreAlinhamento: "center",
    textoAcimaAssinatura: "",
    textoAcimaAssinatura2: "",
    ...patch,
  };
}

function serieNivelId(serie: SerieOption | undefined, niveis: NivelOption[]): string {
  if (!serie) return "";
  return serie.educationStageId || matchCourseOptionId(inferCursoFromSerieName(serie.name), niveis);
}

export default function EtiquetasPage() {
  const { toast } = useToast();

  const [modo, setModo] = useState<EtiquetasModo>("manual");
  const [estados, setEstados] = useState<Option[]>([]);
  const [municipios, setMunicipios] = useState<Option[]>([]);
  const [schools, setSchools] = useState<Option[]>([]);
  const [niveis, setNiveis] = useState<NivelOption[]>([]);
  const [series, setSeries] = useState<SerieOption[]>([]);
  const [turmas, setTurmas] = useState<TurmaOption[]>([]);
  const [aplicados, setAplicados] = useState<Option[]>([]);

  const [selectedEstado, setSelectedEstado] = useState("all");
  const [selectedMunicipio, setSelectedMunicipio] = useState("all");
  const [selectedSchool, setSelectedSchool] = useState("all");
  const [selectedNivel, setSelectedNivel] = useState("all");
  const [selectedSerie, setSelectedSerie] = useState("all");
  const [selectedTurma, setSelectedTurma] = useState("all");
  const [selectedTurno, setSelectedTurno] = useState("all");
  const [selectedAplicadoId, setSelectedAplicadoId] = useState("all");

  const [tituloEtiqueta, setTituloEtiqueta] = useState("");
  const [labels, setLabels] = useState<EtiquetaEditItem[]>([]);
  const [turmaContexts, setTurmaContexts] = useState<Record<string, EtiquetasDadosResponse>>({});
  const labelCacheRef = useRef(new Map<string, EtiquetaEditItem>());

  const [loadingEstados, setLoadingEstados] = useState(false);
  const [loadingMunicipios, setLoadingMunicipios] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingNiveis, setLoadingNiveis] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingTurmas, setLoadingTurmas] = useState(false);
  const [loadingAplicados, setLoadingAplicados] = useState(false);
  const [loadingContexts, setLoadingContexts] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const [previewLabelId, setPreviewLabelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAppliedMode = modo === "avaliacao" || modo === "cartao_resposta";
  const turmaEspecifica = selectedTurma !== "all";
  const serieTodas = selectedSerie === SERIE_TODAS;
  const escolaTodas = selectedSchool === ESCOLA_TODAS;
  const specificSchoolId =
    selectedSchool !== "all" && !escolaTodas ? selectedSchool : undefined;
  const hasGeoContext = selectedEstado !== "all" && selectedMunicipio !== "all";

  const globalTitle = useMemo(() => tituloEtiqueta.trim(), [tituloEtiqueta]);

  /** Com "Todas" as séries, o curso escolhido restringe as séries consideradas. */
  const seriesInScope = useMemo(() => {
    if (!serieTodas || selectedNivel === "all") return series;
    return series.filter((serie) => serieNivelId(serie, niveis) === selectedNivel);
  }, [serieTodas, selectedNivel, series, niveis]);

  const targetTurmas = useMemo<TurmaOption[]>(() => {
    if (turmaEspecifica) return turmas.filter((t) => t.id === selectedTurma);
    const schoolOrder = new Map(schools.map((s, index) => [s.id, index]));
    const serieOrder = new Map(series.map((s, index) => [s.id, index]));
    const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
    return [...turmas].sort(
      (a, b) =>
        (schoolOrder.get(a.schoolId) ?? 0) - (schoolOrder.get(b.schoolId) ?? 0) ||
        (serieOrder.get(a.serieId) ?? 0) - (serieOrder.get(b.serieId) ?? 0) ||
        collator.compare(a.name, b.name)
    );
  }, [turmaEspecifica, turmas, selectedTurma, series, schools]);

  const localBaseContext = useMemo<EtiquetasDadosResponse | null>(() => {
    if (!hasGeoContext) return null;
    const municipioName = municipios.find((m) => m.id === selectedMunicipio)?.name || "";
    const estadoName = estados.find((e) => e.id === selectedEstado)?.name || "";
    return {
      municipio: {
        id: selectedMunicipio,
        name: municipioName,
        state: estadoName,
        prefeitura_label: municipioName,
      },
      contexto: {
        escola: schools.find((s) => s.id === selectedSchool)?.name || "",
        nivel: niveis.find((n) => n.id === selectedNivel)?.name || "",
        serie: "",
        turma: "",
        turno: "",
        shift: "",
        ano: new Date().getFullYear(),
      },
      modo,
      title_reference: globalTitle || null,
      filters: {
        modo,
        municipio: selectedMunicipio,
        escola: specificSchoolId ?? "",
        nivel: "",
        serie: "",
        turma: "",
        turno: "",
        evaluation_id: "",
        answer_sheet_id: "",
      },
    };
  }, [
    hasGeoContext,
    municipios,
    estados,
    schools,
    niveis,
    selectedMunicipio,
    selectedEstado,
    selectedSchool,
    specificSchoolId,
    selectedNivel,
    modo,
    globalTitle,
  ]);

  useEffect(() => {
    if (!isAppliedMode || selectedAplicadoId === "all") return;
    const nextTitle = getAppliedTitle(selectedAplicadoId, aplicados);
    if (nextTitle) setTituloEtiqueta(nextTitle);
  }, [aplicados, isAppliedMode, selectedAplicadoId]);

  useEffect(() => {
    if (!selectedSerie || selectedSerie === "all") return;
    if (selectedSerie === SERIE_TODAS) {
      setSelectedNivel("all");
      return;
    }
    const serieName = series.find((item) => item.id === selectedSerie)?.name || "";
    const cursoName = inferCursoFromSerieName(serieName);
    if (!cursoName) return;
    const nivelId = matchCourseOptionId(cursoName, niveis);
    if (nivelId) setSelectedNivel(nivelId);
  }, [selectedSerie, series, niveis]);

  useEffect(() => {
    let cancelled = false;
    setLoadingEstados(true);
    FormFiltersApiService.getFormFilterStates()
      .then((list) => {
        if (!cancelled) setEstados(list.map((e) => ({ id: e.id, name: e.nome })));
      })
      .catch(() => {
        if (!cancelled) {
          toast({
            title: "Erro",
            description: "Não foi possível carregar estados.",
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEstados(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    if (!selectedEstado || selectedEstado === "all") {
      setMunicipios([]);
      setSelectedMunicipio("all");
      return;
    }
    let cancelled = false;
    setLoadingMunicipios(true);
    FormFiltersApiService.getFormFilterMunicipalities(selectedEstado)
      .then((list) => {
        if (!cancelled) {
          setMunicipios(list.map((m) => ({ id: m.id, name: m.nome })));
          setSelectedMunicipio("all");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMunicipios(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEstado]);

  useEffect(() => {
    if (!selectedMunicipio || selectedMunicipio === "all" || !selectedEstado || selectedEstado === "all") {
      setSchools([]);
      setSelectedSchool("all");
      return;
    }
    let cancelled = false;
    setLoadingSchools(true);
    FormFiltersApiService.getFormFilterSchools({
      estado: selectedEstado,
      municipio: selectedMunicipio,
    })
      .then((list) => {
        if (!cancelled) {
          setSchools(list.map((s) => ({ id: s.id, name: s.nome })));
          setSelectedSchool("all");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSchools(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMunicipio, selectedEstado]);

  useEffect(() => {
    if (selectedSchool === "all" || selectedMunicipio === "all") {
      setNiveis([]);
      setSelectedNivel("all");
      return;
    }
    let cancelled = false;
    setLoadingNiveis(true);
    api
      .get<Array<{ id: string; name: string }>>("/education_stages/all", {
        meta: { cityId: selectedMunicipio },
      })
      .then((response) => {
        if (!cancelled) {
          setNiveis((response.data || []).map((item) => ({ id: item.id, name: item.name })));
          setSelectedNivel("all");
        }
      })
      .catch(() => {
        if (!cancelled) setNiveis([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingNiveis(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMunicipio, selectedSchool]);

  useEffect(() => {
    if (
      !selectedSchool ||
      selectedSchool === "all" ||
      !selectedMunicipio ||
      selectedMunicipio === "all" ||
      !selectedEstado ||
      selectedEstado === "all"
    ) {
      setSeries([]);
      setSelectedSerie("all");
      return;
    }

    let cancelled = false;
    setLoadingSeries(true);
    const schoolIds = selectedSchool === ESCOLA_TODAS ? schools.map((s) => s.id) : [selectedSchool];
    mapInBatches(schoolIds, FILTER_BATCH_SIZE, (schoolId) =>
      FormFiltersApiService.getFormFilterGrades({
        estado: selectedEstado,
        municipio: selectedMunicipio,
        escola: schoolId,
      })
        .then((list) => list.map((s) => ({ serie: s, schoolId })))
        .catch(() => [])
    )
      .then((groups) => {
        if (cancelled) return;
        const byId = new Map<string, SerieOption>();
        groups.flat().forEach(({ serie, schoolId }) => {
          const existing = byId.get(serie.id);
          if (existing) {
            existing.schoolIds.push(schoolId);
            return;
          }
          byId.set(serie.id, {
            id: serie.id,
            name: serie.nome,
            educationStageId: serie.education_stage_id || serie.educationStageId || "",
            schoolIds: [schoolId],
          });
        });
        setSeries([...byId.values()]);
        setSelectedSerie("all");
      })
      .finally(() => {
        if (!cancelled) setLoadingSeries(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSchool, selectedMunicipio, selectedEstado, schools]);

  useEffect(() => {
    if (
      !selectedSerie ||
      selectedSerie === "all" ||
      !selectedSchool ||
      selectedSchool === "all" ||
      !selectedMunicipio ||
      selectedMunicipio === "all" ||
      !selectedEstado ||
      selectedEstado === "all"
    ) {
      setTurmas([]);
      setSelectedTurma("all");
      return;
    }
    let cancelled = false;
    setLoadingTurmas(true);
    const seriesToLoad =
      selectedSerie === SERIE_TODAS
        ? seriesInScope
        : series.filter((item) => item.id === selectedSerie);
    const requests = seriesToLoad.flatMap((serie) =>
      serie.schoolIds.map((schoolId) => ({ serieId: serie.id, schoolId }))
    );
    mapInBatches(requests, FILTER_BATCH_SIZE, ({ serieId, schoolId }) =>
      FormFiltersApiService.getFormFilterClasses({
        estado: selectedEstado,
        municipio: selectedMunicipio,
        escola: schoolId,
        serie: serieId,
      }).then((list) => list.map((t) => ({ id: t.id, name: t.nome, serieId, schoolId })))
    )
      .then((groups) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const merged = groups.flat().filter((turma) => {
          if (seen.has(turma.id)) return false;
          seen.add(turma.id);
          return true;
        });
        setTurmas(merged);
        setSelectedTurma("all");
      })
      .catch(() => {
        if (!cancelled) {
          setTurmas([]);
          setSelectedTurma("all");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTurmas(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSerie, series, seriesInScope, selectedSchool, selectedMunicipio, selectedEstado]);

  useEffect(() => {
    if (!isAppliedMode || selectedMunicipio === "all" || selectedEstado === "all") {
      setAplicados([]);
      setSelectedAplicadoId("all");
      return;
    }
    let cancelled = false;
    setLoadingAplicados(true);
    EvaluationResultsApiService.getFilterEvaluations({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      ...(modo !== "cartao_resposta" && specificSchoolId ? { escola: specificSchoolId } : {}),
      ...(modo === "cartao_resposta" ? { report_entity_type: REPORT_ENTITY_TYPE_ANSWER_SHEET } : {}),
    })
      .then((items) => {
        if (!cancelled) {
          setAplicados(
            (items || []).map((item) => ({
              id: item.id,
              name: item.titulo || item.id,
            }))
          );
          setSelectedAplicadoId("all");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAplicados(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAppliedMode, modo, selectedEstado, selectedMunicipio, specificSchoolId]);

  useLayoutEffect(() => {
    labelCacheRef.current.clear();
    setLabels([]);
    setTurmaContexts({});
    setError(null);
  }, [modo, selectedEstado, selectedMunicipio, selectedSchool]);

  const filtersMessage = useMemo(() => {
    if (!selectedMunicipio || selectedMunicipio === "all") return "Selecione o município.";
    if (!selectedSchool || selectedSchool === "all") return "Selecione a escola.";
    if (!selectedSerie || selectedSerie === "all") return "Selecione a série.";
    if (!serieTodas && (!selectedNivel || selectedNivel === "all")) return "Selecione o curso.";
    if (isAppliedMode && selectedAplicadoId === "all") {
      return modo === "cartao_resposta" ? "Selecione o cartão-resposta." : "Selecione a avaliação.";
    }
    if (loadingTurmas) return "Carregando turmas…";
    if (targetTurmas.length === 0) {
      return serieTodas
        ? "Nenhuma turma encontrada para os filtros escolhidos."
        : "Nenhuma turma encontrada para a série.";
    }
    return null;
  }, [
    isAppliedMode,
    loadingTurmas,
    modo,
    selectedAplicadoId,
    selectedMunicipio,
    selectedNivel,
    selectedSchool,
    selectedSerie,
    serieTodas,
    targetTurmas.length,
  ]);

  useEffect(() => {
    if (filtersMessage) {
      setTurmaContexts({});
      setLoadingContexts(false);
      return;
    }
    let cancelled = false;
    setLoadingContexts(true);
    setError(null);

    const paramsFor = (turma: TurmaOption) => {
      const serie = series.find((s) => s.id === turma.serieId);
      const nivel =
        selectedNivel !== "all" ? selectedNivel : serieNivelId(serie, niveis) || undefined;
      return {
        modo,
        municipio: selectedMunicipio,
        escola: turma.schoolId,
        nivel,
        serie: turma.serieId,
        turma: turma.id,
        evaluation_id: modo === "avaliacao" ? selectedAplicadoId : undefined,
        answer_sheet_id: modo === "cartao_resposta" ? selectedAplicadoId : undefined,
      };
    };

    (async () => {
      try {
        const result: Record<string, EtiquetasDadosResponse> = {};
        for (let i = 0; i < targetTurmas.length; i += CONTEXT_BATCH_SIZE) {
          const batch = targetTurmas.slice(i, i + CONTEXT_BATCH_SIZE);
          const loaded = await Promise.all(
            batch.map(async (turma) => {
              const data = await getEtiquetasDados(paramsFor(turma));
              const serieLabel = series.find((s) => s.id === turma.serieId)?.name;
              return [turma.id, enrichEtiquetasContext(data, { serieLabel, turmaLabel: turma.name })] as const;
            })
          );
          if (cancelled) return;
          loaded.forEach(([turmaId, context]) => {
            result[turmaId] = context;
          });
        }
        if (!cancelled) setTurmaContexts(result);
      } catch (err) {
        if (cancelled) return;
        const msg = getEtiquetasApiError(err, "Não foi possível carregar os dados das turmas.");
        setTurmaContexts({});
        setError(msg);
      } finally {
        if (!cancelled) setLoadingContexts(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    filtersMessage,
    targetTurmas,
    series,
    niveis,
    modo,
    selectedMunicipio,
    selectedNivel,
    selectedAplicadoId,
  ]);

  /** Uma etiqueta por turma: cada turma já define sua série, turno e curso. O filtro de turno restringe as turmas. */
  const autoEntries = useMemo(() => {
    const turnoFiltro = selectedTurno !== "all" ? normalizeClassShift(selectedTurno) : null;
    const turnoLabel = TURNO_OPTIONS.find((t) => t.id === selectedTurno)?.name;
    return targetTurmas.flatMap((turma) => {
      const context = turmaContexts[turma.id];
      if (!context) return [];
      const turmaShift = normalizeClassShift(context.contexto.turno || context.contexto.shift);
      if (turnoFiltro && turmaShift && turmaShift !== turnoFiltro) return [];
      return [{ turmaId: turma.id, context: enrichEtiquetasContext(context, { turnoLabel }) }];
    });
  }, [targetTurmas, turmaContexts, selectedTurno]);

  const autoContextByTurma = useMemo(
    () => new Map(autoEntries.map((entry) => [entry.turmaId, entry.context])),
    [autoEntries]
  );

  useEffect(() => {
    setLabels((prev) => {
      const byTurma = new Map(
        prev.filter((item) => item.turmaId).map((item) => [item.turmaId as string, item])
      );
      const custom = prev.filter((item) => !item.turmaId);
      const auto = autoEntries.map(
        (entry, index) =>
          byTurma.get(entry.turmaId) ??
          labelCacheRef.current.get(entry.turmaId) ??
          createEtiquetaItem(index + 1, { turmaId: entry.turmaId })
      );
      return [...auto, ...custom];
    });
  }, [autoEntries]);

  useEffect(() => {
    labels.forEach((item) => {
      if (item.turmaId) labelCacheRef.current.set(item.turmaId, item);
    });
  }, [labels]);

  const baseContext = autoEntries[0]?.context ?? localBaseContext;

  const resolveLabelContext = useCallback(
    (label: EtiquetaEditItem): EtiquetasDadosResponse | null => {
      if (label.turmaId) return autoContextByTurma.get(label.turmaId) ?? null;
      if (!baseContext || !label.contextoPersonalizado) return null;
      return { ...baseContext, contexto: label.contextoPersonalizado };
    },
    [autoContextByTurma, baseContext]
  );

  const resolveLabelTitle = (label: EtiquetaEditItem, context: EtiquetasDadosResponse | null): string =>
    label.titulo.trim() || globalTitle || context?.title_reference?.trim() || "";

  const schoolKeyById = useMemo(
    () =>
      new Map(
        labels.map((label) => {
          const context = resolveLabelContext(label);
          return [label.id, context ? etiquetaEscolaKey(context) : ""] as const;
        })
      ),
    [labels, resolveLabelContext]
  );

  /** Etiquetas por turma agrupadas por escola; as personalizadas seguem no fim, na ordem de criação. */
  const autoGroups = useMemo<LabelGroup[]>(() => {
    const groups = new Map<string, LabelGroup>();
    labels
      .filter((label) => label.turmaId)
      .forEach((label) => {
        const key = schoolKeyById.get(label.id) ?? "";
        const group = groups.get(key);
        if (group) {
          group.labels.push(label);
          return;
        }
        const escola = resolveLabelContext(label)?.contexto.escola?.trim() || "";
        groups.set(key, { key, escola, labels: [label] });
      });
    return [...groups.values()];
  }, [labels, schoolKeyById, resolveLabelContext]);

  const customLabels = useMemo(() => labels.filter((label) => !label.turmaId), [labels]);

  const orderedLabels = useMemo(
    () => [...autoGroups.flatMap((group) => group.labels), ...customLabels],
    [autoGroups, customLabels]
  );

  const labelNumberById = useMemo(
    () => new Map(orderedLabels.map((label, index) => [label.id, index + 1])),
    [orderedLabels]
  );

  const labelsBySchool = useMemo(() => {
    const map = new Map<string, EtiquetaEditItem[]>();
    labels.forEach((label) => {
      const key = schoolKeyById.get(label.id);
      if (!key) return;
      map.set(key, [...(map.get(key) ?? []), label]);
    });
    return map;
  }, [labels, schoolKeyById]);

  const sameSchoolLabelsToUpdate = (source: EtiquetaEditItem): EtiquetaEditItem[] => {
    const key = schoolKeyById.get(source.id);
    if (!key) return [];
    return (labelsBySchool.get(key) ?? []).filter(
      (item) => item.id !== source.id && !sharesFieldsWith(item, source)
    );
  };

  const autoCount = labels.length - customLabels.length;
  const customCount = customLabels.length;

  const validationMessage = useMemo(() => {
    if (filtersMessage) return filtersMessage;
    if (loadingContexts) return "Carregando dados das turmas…";
    if (!labels.length) return "Nenhuma etiqueta para os filtros escolhidos (verifique o turno).";
    if (!globalTitle && labels.some((item) => !item.titulo.trim())) {
      return "Informe o título das etiquetas.";
    }
    return null;
  }, [filtersMessage, loadingContexts, labels, globalTitle]);

  const updateLabel = (id: string, patch: Partial<EtiquetaEditItem>) => {
    setLabels((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const updateCustomContext = (
    label: EtiquetaEditItem,
    patch: Partial<EtiquetasDadosResponse["contexto"]>
  ) => {
    if (!label.contextoPersonalizado) return;
    updateLabel(label.id, { contextoPersonalizado: { ...label.contextoPersonalizado, ...patch } });
  };

  const appendCustomLabel = () => {
    if (!baseContext) return;
    setLabels((prev) => [
      ...prev,
      createEtiquetaItem(prev.length + 1, { contextoPersonalizado: { ...baseContext.contexto } }),
    ]);
  };

  const removeLabel = (id: string) => {
    setLabels((prev) => prev.filter((item) => item.id !== id));
  };

  const applySharedToSchool = (source: EtiquetaEditItem) => {
    const targets = sameSchoolLabelsToUpdate(source);
    if (!targets.length) return;
    const patch = pickSharedFields(source);
    const previous = new Map(targets.map((item) => [item.id, pickSharedFields(item)]));
    setLabels((prev) => prev.map((item) => (previous.has(item.id) ? { ...item, ...patch } : item)));

    const escola = resolveLabelContext(source)?.contexto.escola?.trim();
    toast({
      title: "Informações aplicadas",
      description: `${targets.length} etiqueta(s) ${escola ? `da escola ${escola}` : "da mesma escola"} atualizada(s).`,
      action: (
        <ToastAction
          altText="Desfazer"
          onClick={() =>
            setLabels((prev) =>
              prev.map((item) => {
                const old = previous.get(item.id);
                return old ? { ...item, ...old } : item;
              })
            )
          }
        >
          Desfazer
        </ToastAction>
      ),
    });
  };

  const handleGeneratePdf = async () => {
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    setLoadingPdf(true);
    setError(null);
    try {
      const entries: EtiquetaPdfEntry[] = orderedLabels.flatMap((label) => {
        const context = resolveLabelContext(label);
        if (!context) return [];
        return [
          {
            context,
            label: { ...label, titulo: resolveLabelTitle(label, context) },
            grupo: schoolKeyById.get(label.id),
          },
        ];
      });
      if (!entries.length) {
        setError("Nenhuma etiqueta pronta para gerar o PDF.");
        return;
      }
      const branding = await loadCityBrandingPdfAssets(selectedMunicipio);
      await downloadEtiquetasPdf(entries, branding.logo);
      toast({
        title: "PDF gerado",
        description: `${entries.length} etiqueta(s) exportada(s) em um único PDF.`,
      });
    } catch (err) {
      const msg = getEtiquetasApiError(err, "Não foi possível gerar o PDF de etiquetas.");
      setError(msg);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoadingPdf(false);
    }
  };

  /** Mesma paginação do PDF: cada escola começa em uma nova página. */
  const previewSections = useMemo(() => {
    let pageNumber = 0;
    const sections = autoGroups.flatMap((group) =>
      chunk(group.labels, LABELS_PER_PAGE).map((page, pageIndexInGroup) => {
        pageNumber += 1;
        return {
          key: `${group.key}-${pageNumber}`,
          escola: autoGroups.length > 1 && pageIndexInGroup === 0 ? group.escola || "Escola" : null,
          title: `Configuração — Página ${pageNumber}`,
          labels: page,
        };
      })
    );
    if (customLabels.length) {
      sections.push({
        key: "custom",
        escola: null,
        title: "Etiquetas personalizadas",
        labels: customLabels,
      });
    }
    return sections;
  }, [autoGroups, customLabels]);

  const previewLabel = useMemo(
    () => labels.find((item) => item.id === previewLabelId) ?? null,
    [labels, previewLabelId]
  );
  const previewLabelIndex = previewLabel ? (labelNumberById.get(previewLabel.id) ?? 0) - 1 : -1;
  const previewContext = previewLabel ? resolveLabelContext(previewLabel) : null;
  const previewLabelResolved = previewLabel
    ? { ...previewLabel, titulo: resolveLabelTitle(previewLabel, previewContext) }
    : null;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <FileText className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Etiquetas</h1>
          <p className="text-sm text-muted-foreground">
            Configure os filtros: é gerada uma etiqueta por turma. Edite cada etiqueta individualmente antes do PDF.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            Filtros e configuração
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Modo</Label>
            <Select value={modo} onValueChange={(value) => setModo(value as EtiquetasModo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODO_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Estado</Label>
            <Select value={selectedEstado} onValueChange={setSelectedEstado} disabled={loadingEstados}>
              <SelectTrigger>
                <SelectValue placeholder={loadingEstados ? "Carregando..." : "Estado"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {estados.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Município</Label>
            <Select
              value={selectedMunicipio}
              onValueChange={setSelectedMunicipio}
              disabled={selectedEstado === "all" || loadingMunicipios}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingMunicipios ? "Carregando..." : "Município"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Selecione</SelectItem>
                {municipios.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isAppliedMode ? (
            <div className="sm:col-span-2">
              <EvaluationInstrumentPicker
                label={modo === "cartao_resposta" ? "Cartão resposta" : "Avaliação"}
                estado={selectedEstado}
                municipio={selectedMunicipio}
                escola={
                  modo === "cartao_resposta"
                    ? undefined
                    : selectedSchool !== "all"
                      ? selectedSchool
                      : undefined
                }
                reportEntityType={
                  modo === "cartao_resposta" ? REPORT_ENTITY_TYPE_ANSWER_SHEET : undefined
                }
                value={selectedAplicadoId}
                onChange={(value) => {
                  setSelectedAplicadoId(value);
                  if (value !== "all") {
                    const title = getAppliedTitle(value, aplicados);
                    if (title) setTituloEtiqueta(title);
                  }
                }}
                disabled={selectedMunicipio === "all"}
                loading={loadingAplicados}
                allowAll
                allLabel="Selecione"
                placeholder={loadingAplicados ? "Carregando..." : "Selecione"}
              />
            </div>
          ) : null}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="etiqueta-titulo">Título</Label>
            <Input
              id="etiqueta-titulo"
              value={tituloEtiqueta}
              placeholder={
                isAppliedMode
                  ? "Preenchido automaticamente pela avaliação/cartão (editável)"
                  : "Ex.: 3ª EDIÇÃO AVALIE 2025"
              }
              onChange={(event) => setTituloEtiqueta(event.target.value)}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Escola</Label>
            <Select value={selectedSchool} onValueChange={setSelectedSchool} disabled={selectedMunicipio === "all" || loadingSchools}>
              <SelectTrigger>
                <SelectValue placeholder={loadingSchools ? "Carregando..." : "Escola"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Selecione</SelectItem>
                {schools.length > 1 && <SelectItem value={ESCOLA_TODAS}>Todas</SelectItem>}
                {schools.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Série</Label>
            <Select value={selectedSerie} onValueChange={setSelectedSerie} disabled={selectedSchool === "all" || loadingSeries}>
              <SelectTrigger>
                <SelectValue placeholder={loadingSeries ? "Carregando..." : "Série"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Selecione</SelectItem>
                {series.length > 0 && <SelectItem value={SERIE_TODAS}>Todas</SelectItem>}
                {series.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Curso</Label>
            <Select
              value={selectedNivel}
              onValueChange={setSelectedNivel}
              disabled={selectedSchool === "all" || loadingNiveis}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingNiveis ? "Carregando..." : "Preenchido pela série"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{serieTodas ? "Todos" : "Selecione"}</SelectItem>
                {niveis.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Turma</Label>
            <Select
              value={selectedTurma}
              onValueChange={setSelectedTurma}
              disabled={selectedSerie === "all" || serieTodas || escolaTodas || loadingTurmas}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingTurmas ? "Carregando..." : "Turma"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {turmas.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Turno</Label>
            <Select value={selectedTurno} onValueChange={setSelectedTurno}>
              <SelectTrigger>
                <SelectValue placeholder="Turno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {TURNO_OPTIONS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {!hasGeoContext ? (
        <Alert>
          <AlertDescription>
            Selecione estado e município para liberar a pré-visualização e as opções das etiquetas.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" />
              Pré-visualização e configuração
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {baseContext ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Município</p>
                  <p className="text-base font-semibold">
                    {baseContext.municipio.name}
                    {baseContext.municipio.state ? `/${baseContext.municipio.state}` : ""}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Escola</p>
                  <p className="text-base font-semibold">
                    {escolaTodas ? "Todas" : baseContext.contexto.escola || "—"}
                  </p>
                  {escolaTodas && autoGroups.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {autoGroups.length} escola(s) com etiquetas, cada uma em páginas próprias
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Total de etiquetas</p>
                  <p className="text-base font-semibold">{labels.length}</p>
                  <p className="text-xs text-muted-foreground">
                    {autoCount} por turma
                    {customCount > 0 ? ` + ${customCount} personalizada(s)` : ""}
                  </p>
                </div>
              </div>
            ) : null}

            {loadingContexts ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando dados de {targetTurmas.length} turma(s)…
              </p>
            ) : filtersMessage && !labels.length ? (
              <p className="text-sm text-muted-foreground">{filtersMessage}</p>
            ) : null}

            {previewSections.map((section) => (
              <div key={section.key} className="space-y-3">
                {section.escola ? (
                  <h3 className="border-b pb-2 pt-2 text-lg font-semibold">{section.escola}</h3>
                ) : null}
                <h4 className="text-base font-semibold">{section.title}</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  {section.labels.map((label) => {
                    const globalLabelIndex = (labelNumberById.get(label.id) ?? 1) - 1;
                    const labelContext = resolveLabelContext(label);
                    const isCustom = !label.turmaId;
                    const applyTargetsCount = hasSharedContent(label)
                      ? sameSchoolLabelsToUpdate(label).length
                      : 0;
                    return (
                      <div key={label.id} className="space-y-2 rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Label className="text-sm font-medium">
                              Etiqueta {globalLabelIndex + 1}
                              {isCustom ? " — personalizada" : ""}
                            </Label>
                            {labelContext ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {etiquetasSerieTurmaTurnoLine(labelContext)}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setPreviewLabelId(label.id)}
                              disabled={!labelContext}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Visualizar
                            </Button>
                            {isCustom ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-9 px-2 text-destructive"
                                aria-label={`Remover etiqueta ${globalLabelIndex + 1}`}
                                onClick={() => removeLabel(label.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <Input
                          value={label.titulo}
                          onChange={(event) => updateLabel(label.id, { titulo: event.target.value })}
                          placeholder={globalTitle || "Título da etiqueta"}
                        />

                        {isCustom && label.contextoPersonalizado ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1 sm:col-span-2">
                              <Label htmlFor={`custom-escola-${label.id}`} className="text-xs">
                                Escola
                              </Label>
                              <Input
                                id={`custom-escola-${label.id}`}
                                value={label.contextoPersonalizado.escola}
                                onChange={(event) =>
                                  updateCustomContext(label, { escola: event.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                              <Label htmlFor={`custom-nivel-${label.id}`} className="text-xs">
                                Modalidade/Etapa
                              </Label>
                              <Input
                                id={`custom-nivel-${label.id}`}
                                value={label.contextoPersonalizado.nivel}
                                onChange={(event) =>
                                  updateCustomContext(label, { nivel: event.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`custom-serie-${label.id}`} className="text-xs">
                                Série
                              </Label>
                              <Input
                                id={`custom-serie-${label.id}`}
                                value={label.contextoPersonalizado.serie}
                                onChange={(event) =>
                                  updateCustomContext(label, { serie: event.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`custom-turma-${label.id}`} className="text-xs">
                                Turma
                              </Label>
                              <Input
                                id={`custom-turma-${label.id}`}
                                value={label.contextoPersonalizado.turma}
                                onChange={(event) =>
                                  updateCustomContext(label, { turma: event.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                              <Label htmlFor={`custom-turno-${label.id}`} className="text-xs">
                                Turno
                              </Label>
                              <Input
                                id={`custom-turno-${label.id}`}
                                value={label.contextoPersonalizado.turno}
                                onChange={(event) =>
                                  updateCustomContext(label, {
                                    turno: event.target.value,
                                    shift: event.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>
                        ) : null}

                        <div className="space-y-2">
                          <Label htmlFor={`texto-livre-${label.id}`}>Texto livre</Label>
                          <EtiquetaTextToolbar
                            id={`texto-livre-${label.id}`}
                            value={label.textoLivre}
                            onChange={(value) => updateLabel(label.id, { textoLivre: value })}
                            align={label.textoLivreAlinhamento}
                            onAlignChange={(value) =>
                              updateLabel(label.id, { textoLivreAlinhamento: value })
                            }
                            fontSize={label.textoLivreTamanho}
                            onFontSizeChange={(value) =>
                              updateLabel(label.id, { textoLivreTamanho: value })
                            }
                            placeholder="Texto livre da etiqueta"
                          />
                        </div>

                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`signature-${label.id}`}
                            checked={label.exibirAssinatura}
                            onCheckedChange={(checked) =>
                              updateLabel(label.id, { exibirAssinatura: checked === true })
                            }
                          />
                          <Label htmlFor={`signature-${label.id}`}>Exibir assinatura e CPF</Label>
                        </div>

                        {!label.exibirAssinatura && (
                          <div className="space-y-2">
                            <Label htmlFor={`text-color-${label.id}`}>Cor do texto livre</Label>
                            <Input
                              id={`text-color-${label.id}`}
                              type="color"
                              value={label.textoLivreCor}
                              onChange={(event) =>
                                updateLabel(label.id, { textoLivreCor: event.target.value })
                              }
                              className="h-10 max-w-[8rem] cursor-pointer p-1"
                            />
                          </div>
                        )}

                        {label.exibirAssinatura && (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor={`text-above-signature-${label.id}`}>
                                Texto acima da assinatura (
                                {label.textoAcimaAssinatura.length}/{TEXTO_ACIMA_ASSINATURA_MAX})
                              </Label>
                              <Input
                                id={`text-above-signature-${label.id}`}
                                value={label.textoAcimaAssinatura}
                                maxLength={TEXTO_ACIMA_ASSINATURA_MAX}
                                placeholder="Ex.: 2º DIA DE APLICAÇÃO – MAT OBJETIVA"
                                onChange={(event) =>
                                  updateLabel(label.id, {
                                    textoAcimaAssinatura: event.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">1º aplicador</p>
                              <Input
                                value={label.nomeAplicador}
                                onChange={(event) =>
                                  updateLabel(label.id, { nomeAplicador: event.target.value })
                                }
                                placeholder="Nome do aplicador"
                              />
                              <Input
                                value={label.cpfAplicador}
                                onChange={(event) =>
                                  updateLabel(label.id, {
                                    cpfAplicador: maskCpf(event.target.value),
                                  })
                                }
                                placeholder="CPF do aplicador"
                              />
                            </div>
                            {label.exibirSegundoAplicador ? (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-medium text-muted-foreground">
                                    2º aplicador
                                  </p>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-destructive"
                                    onClick={() =>
                                      updateLabel(label.id, {
                                        exibirSegundoAplicador: false,
                                        nomeAplicador2: "",
                                        cpfAplicador2: "",
                                        textoAcimaAssinatura2: "",
                                      })
                                    }
                                  >
                                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                                    Remover
                                  </Button>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`text-above-signature-2-${label.id}`}>
                                    Texto acima da assinatura do 2º aplicador (
                                    {label.textoAcimaAssinatura2.length}/{TEXTO_ACIMA_ASSINATURA_MAX})
                                  </Label>
                                  <Input
                                    id={`text-above-signature-2-${label.id}`}
                                    value={label.textoAcimaAssinatura2}
                                    maxLength={TEXTO_ACIMA_ASSINATURA_MAX}
                                    placeholder="Ex.: 2º DIA DE APLICAÇÃO – MAT OBJETIVA"
                                    onChange={(event) =>
                                      updateLabel(label.id, {
                                        textoAcimaAssinatura2: event.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <Input
                                  value={label.nomeAplicador2}
                                  onChange={(event) =>
                                    updateLabel(label.id, { nomeAplicador2: event.target.value })
                                  }
                                  placeholder="Nome do 2º aplicador"
                                />
                                <Input
                                  value={label.cpfAplicador2}
                                  onChange={(event) =>
                                    updateLabel(label.id, {
                                      cpfAplicador2: maskCpf(event.target.value),
                                    })
                                  }
                                  placeholder="CPF do 2º aplicador"
                                />
                              </div>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={() =>
                                  updateLabel(label.id, { exibirSegundoAplicador: true })
                                }
                              >
                                <UserPlus className="mr-2 h-4 w-4" />
                                Adicionar aplicador
                              </Button>
                            )}
                          </>
                        )}

                        {applyTargetsCount > 0 ? (
                          <Button
                            type="button"
                            className="w-full bg-purple-600 text-white duration-300 animate-in fade-in-0 slide-in-from-top-2 hover:bg-purple-700 focus-visible:ring-purple-500"
                            onClick={() => applySharedToSchool(label)}
                            title="Copia texto livre, texto acima da assinatura, nomes e CPFs dos aplicadores para as outras etiquetas desta escola"
                          >
                            <CopyCheck className="mr-2 h-4 w-4" />
                            Aplicar a todos
                            <span className="ml-1 font-normal opacity-80">
                              ({applyTargetsCount} etiqueta{applyTargetsCount === 1 ? "" : "s"} da escola)
                            </span>
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {baseContext ? (
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={appendCustomLabel}
                  className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-6 w-6" />
                  <span className="text-sm font-medium">Adicionar etiqueta personalizada</span>
                  <span className="text-xs">
                    Etiqueta extra com escola, série, turma e turno editáveis.
                  </span>
                </button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button
                type="button"
                onClick={handleGeneratePdf}
                disabled={loadingPdf || !!validationMessage}
                title={validationMessage ?? undefined}
              >
                {loadingPdf ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Baixar PDF ({labels.length} etiqueta{labels.length === 1 ? "" : "s"})
              </Button>
              {validationMessage && !loadingContexts ? (
                <p className="text-sm text-muted-foreground">{validationMessage}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      <EtiquetaPreviewDialog
        open={previewLabelId !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewLabelId(null);
        }}
        label={previewLabelResolved}
        context={previewContext}
        logoUrl={null}
        labelIndex={previewLabelIndex >= 0 ? previewLabelIndex : undefined}
      />
    </div>
  );
}
