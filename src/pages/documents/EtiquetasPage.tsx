import { useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Filter, Loader2, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { FormFiltersApiService } from "@/services/formFiltersApi";
import {
  EvaluationResultsApiService,
  REPORT_ENTITY_TYPE_ANSWER_SHEET,
} from "@/services/evaluation/evaluationResultsApi";
import { EvaluationInstrumentPicker } from "@/components/filters";
import { getEtiquetasApiError, getEtiquetasDados } from "@/services/documents/etiquetasApi";
import { downloadEtiquetasPdf } from "@/services/reports/etiquetasPdf";
import type {
  EtiquetaEditItem,
  EtiquetasDadosResponse,
  EtiquetasModo,
} from "@/types/etiquetas";
import { loadCityBrandingPdfAssets } from "@/utils/pdfCityBranding";
import { loadBrandingImage } from "@/utils/brandingImageUtils";
import { getCityBranding, resolveBrandingUrls } from "@/services/cityBrandingApi";
import {
  enrichEtiquetasContext,
  etiquetasTurnoLabel,
  TEXTO_ACIMA_ASSINATURA_MAX,
} from "@/utils/etiquetasDisplay";
import { EtiquetaAlignToolbar } from "@/components/documents/EtiquetaAlignToolbar";
import { EtiquetaPreviewDialog } from "@/components/documents/EtiquetaPreviewDialog";

type Option = { id: string; name: string };
type NivelOption = { id: string; name: string };

const TURNO_OPTIONS: Option[] = [
  { id: "MATUTINO", name: "Matutino" },
  { id: "VESPERTINO", name: "Vespertino" },
  { id: "NOTURNO", name: "Noturno" },
  { id: "INTEGRAL", name: "Integral" },
];

const MODO_OPTIONS: { value: EtiquetasModo; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "avaliacao", label: "Avaliação" },
  { value: "cartao_resposta", label: "Cartão-resposta" },
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

const TEXTO_LIVRE_TAMANHO_OPTIONS = [16, 18, 20, 24, 28, 32] as const;

function createEtiquetaItem(index: number, defaultTitle: string): EtiquetaEditItem {
  return {
    id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    titulo: defaultTitle,
    textoLivre: "",
    exibirAssinatura: true,
    nomeAplicador: "",
    cpfAplicador: "",
    textoLivreCor: "#000000",
    textoLivreTamanho: 16,
    textoLivreAlinhamento: "center",
    textoAcimaAssinatura: "",
  };
}

export default function EtiquetasPage() {
  const { toast } = useToast();

  const [modo, setModo] = useState<EtiquetasModo>("manual");
  const [estados, setEstados] = useState<Option[]>([]);
  const [municipios, setMunicipios] = useState<Option[]>([]);
  const [schools, setSchools] = useState<Option[]>([]);
  const [niveis, setNiveis] = useState<NivelOption[]>([]);
  const [series, setSeries] = useState<Option[]>([]);
  const [turmas, setTurmas] = useState<Option[]>([]);
  const [aplicados, setAplicados] = useState<Option[]>([]);

  const [selectedEstado, setSelectedEstado] = useState("all");
  const [selectedMunicipio, setSelectedMunicipio] = useState("all");
  const [selectedSchool, setSelectedSchool] = useState("all");
  const [selectedNivel, setSelectedNivel] = useState("all");
  const [selectedSerie, setSelectedSerie] = useState("all");
  const [selectedTurma, setSelectedTurma] = useState("all");
  const [selectedTurno, setSelectedTurno] = useState("all");
  const [selectedAplicadoId, setSelectedAplicadoId] = useState("all");

  const [manualTitle, setManualTitle] = useState("");
  const [quantityInput, setQuantityInput] = useState("8");
  const [labels, setLabels] = useState<EtiquetaEditItem[]>([]);

  const [loadingEstados, setLoadingEstados] = useState(false);
  const [loadingMunicipios, setLoadingMunicipios] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingNiveis, setLoadingNiveis] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingTurmas, setLoadingTurmas] = useState(false);
  const [loadingAplicados, setLoadingAplicados] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const [previewContext, setPreviewContext] = useState<EtiquetasDadosResponse | null>(null);
  const [previewLogoUrl, setPreviewLogoUrl] = useState<string | null>(null);
  const [previewLabelId, setPreviewLabelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isManualMode = modo === "manual";
  const isAppliedMode = modo === "avaliacao" || modo === "cartao_resposta";
  const parsedQuantity = Number.parseInt(quantityInput, 10);

  const globalTitle = useMemo(() => {
    if (isManualMode) return manualTitle.trim();
    if (selectedAplicadoId === "all") return "";
    return getAppliedTitle(selectedAplicadoId, aplicados);
  }, [aplicados, isManualMode, manualTitle, selectedAplicadoId]);

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
    FormFiltersApiService.getFormFilterGrades({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      escola: selectedSchool,
    })
      .then((list) => {
        if (cancelled) return;
        const normalized = list.map((s) => ({
          id: s.id,
          name: s.nome,
          educationStageId: s.education_stage_id || s.educationStageId || "",
        }));
        const filtered =
          selectedNivel === "all"
            ? normalized
            : normalized.filter((item) => item.educationStageId === selectedNivel);
        setSeries(filtered.map((item) => ({ id: item.id, name: item.name })));
        setSelectedSerie("all");
      })
      .finally(() => {
        if (!cancelled) setLoadingSeries(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSchool, selectedMunicipio, selectedEstado, selectedNivel]);

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
    FormFiltersApiService.getFormFilterClasses({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      escola: selectedSchool,
      serie: selectedSerie,
    })
      .then((list) => {
        if (!cancelled) {
          setTurmas(list.map((t) => ({ id: t.id, name: t.nome })));
          setSelectedTurma("all");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTurmas(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSerie, selectedSchool, selectedMunicipio, selectedEstado]);

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
      escola: selectedSchool !== "all" ? selectedSchool : undefined,
      ...(modo === "cartao_resposta" ? { report_entity_type: REPORT_ENTITY_TYPE_ANSWER_SHEET } : {}),
    })
      .then((items) => {
        if (!cancelled) {
          setAplicados((items || []).map((item) => ({ id: item.id, name: item.titulo || item.id })));
          setSelectedAplicadoId("all");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAplicados(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAppliedMode, modo, selectedEstado, selectedMunicipio, selectedSchool]);

  useEffect(() => {
    setPreviewContext(null);
    setPreviewLogoUrl(null);
    setError(null);
    setLabels([]);
  }, [
    modo,
    selectedEstado,
    selectedMunicipio,
    selectedSchool,
    selectedNivel,
    selectedSerie,
    selectedTurma,
    selectedTurno,
    selectedAplicadoId,
    manualTitle,
    quantityInput,
  ]);

  const validationMessage = useMemo(() => {
    if (!selectedMunicipio || selectedMunicipio === "all") return "Selecione o município.";
    if (!selectedSchool || selectedSchool === "all") return "Selecione a escola.";
    if (!selectedNivel || selectedNivel === "all") return "Selecione o curso.";
    if (!selectedSerie || selectedSerie === "all") return "Selecione a série.";
    if (!selectedTurma || selectedTurma === "all") return "Selecione a turma.";
    if (!selectedTurno || selectedTurno === "all") return "Selecione o turno.";
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) return "Informe uma quantidade válida.";
    if (parsedQuantity > 200) return "Limite máximo de 200 etiquetas por geração.";
    if (isManualMode && !manualTitle.trim()) return "Informe o título das etiquetas.";
    if (isAppliedMode && selectedAplicadoId === "all") {
      return modo === "cartao_resposta" ? "Selecione o cartão-resposta." : "Selecione a avaliação.";
    }
    return null;
  }, [
    isAppliedMode,
    isManualMode,
    manualTitle,
    modo,
    parsedQuantity,
    selectedAplicadoId,
    selectedMunicipio,
    selectedNivel,
    selectedSchool,
    selectedSerie,
    selectedTurma,
    selectedTurno,
  ]);

  const filterLabelsForContext = () => ({
    serieLabel: series.find((s) => s.id === selectedSerie)?.name,
    turmaLabel: turmas.find((t) => t.id === selectedTurma)?.name,
    turnoLabel: TURNO_OPTIONS.find((t) => t.id === selectedTurno)?.name,
  });

  const buildParams = () => ({
    modo,
    municipio: selectedMunicipio,
    escola: selectedSchool !== "all" ? selectedSchool : undefined,
    nivel: selectedNivel !== "all" ? selectedNivel : undefined,
    serie: selectedSerie !== "all" ? selectedSerie : undefined,
    turma: selectedTurma !== "all" ? selectedTurma : undefined,
    turno: selectedTurno !== "all" ? selectedTurno : undefined,
    evaluation_id: modo === "avaliacao" && selectedAplicadoId !== "all" ? selectedAplicadoId : undefined,
    answer_sheet_id:
      modo === "cartao_resposta" && selectedAplicadoId !== "all" ? selectedAplicadoId : undefined,
  });

  const updateLabel = (id: string, patch: Partial<EtiquetaEditItem>) => {
    setLabels((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const appendLabel = () => {
    setLabels((prev) => [...prev, createEtiquetaItem(prev.length + 1, globalTitle || previewContext?.title_reference || "")]);
  };

  const buildPreview = async () => {
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    setLoadingPreview(true);
    setError(null);
    try {
      const context = enrichEtiquetasContext(
        await getEtiquetasDados(buildParams()),
        filterLabelsForContext()
      );
      const branding = await loadCityBrandingPdfAssets(selectedMunicipio);
      let logoDisplayUrl = branding.logo?.dataUrl ?? null;
      if (!logoDisplayUrl) {
        try {
          const cityBranding = await getCityBranding(selectedMunicipio);
          const urls = resolveBrandingUrls(cityBranding);
          logoDisplayUrl = (await loadBrandingImage(urls.logo_url, undefined, selectedMunicipio)) ?? null;
        } catch {
          logoDisplayUrl = null;
        }
      }
      setPreviewContext(context);
      setPreviewLogoUrl(logoDisplayUrl);
      const initialTitle = globalTitle || context.title_reference || "";
      setLabels(Array.from({ length: parsedQuantity }).map((_, index) => createEtiquetaItem(index + 1, initialTitle)));
    } catch (err) {
      const msg = getEtiquetasApiError(err, "Não foi possível montar as etiquetas.");
      setError(msg);
      setPreviewContext(null);
      setPreviewLogoUrl(null);
      setLabels([]);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    if (!labels.length || !previewContext) {
      setError("Monte as etiquetas antes de gerar o PDF.");
      return;
    }
    setLoadingPdf(true);
    setError(null);
    try {
      const branding = await loadCityBrandingPdfAssets(selectedMunicipio);
      const context = enrichEtiquetasContext(
        await getEtiquetasDados(buildParams()),
        filterLabelsForContext()
      );
      setPreviewContext(context);
      await downloadEtiquetasPdf(context, labels, branding.logo);
      toast({ title: "PDF gerado", description: `${labels.length} etiqueta(s) exportada(s).` });
    } catch (err) {
      const msg = getEtiquetasApiError(err, "Não foi possível gerar o PDF de etiquetas.");
      setError(msg);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoadingPdf(false);
    }
  };

  const virtualPages = useMemo(() => {
    if (!labels.length) return [];
    const pages: EtiquetaEditItem[][] = [];
    for (let i = 0; i < labels.length; i += 8) {
      pages.push(labels.slice(i, i + 8));
    }
    return pages;
  }, [labels]);

  const previewLabel = useMemo(
    () => labels.find((item) => item.id === previewLabelId) ?? null,
    [labels, previewLabelId]
  );

  const previewLabelIndex = previewLabel ? labels.findIndex((item) => item.id === previewLabelId) : -1;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <FileText className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Etiquetas</h1>
          <p className="text-sm text-muted-foreground">
            Configure os filtros, monte a pré-visualização e edite cada etiqueta individualmente antes do PDF.
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
            <Label>Modo de título</Label>
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
                label={modo === "cartao_resposta" ? "Cartão-resposta" : "Avaliação"}
                estado={selectedEstado}
                municipio={selectedMunicipio}
                escola={selectedSchool !== "all" ? selectedSchool : undefined}
                reportEntityType={
                  modo === "cartao_resposta" ? REPORT_ENTITY_TYPE_ANSWER_SHEET : undefined
                }
                value={selectedAplicadoId}
                onChange={setSelectedAplicadoId}
                disabled={selectedMunicipio === "all"}
                loading={loadingAplicados}
                allowAll
                allLabel="Selecione"
                placeholder={loadingAplicados ? "Carregando..." : "Selecione"}
              />
            </div>
          ) : (
            <div className="space-y-2 sm:col-span-2">
              <Label>Título manual</Label>
              <Input
                value={manualTitle}
                placeholder="Ex.: 3ª EDIÇÃO AVALIE 2025"
                onChange={(event) => setManualTitle(event.target.value)}
              />
            </div>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label>Escola</Label>
            <Select value={selectedSchool} onValueChange={setSelectedSchool} disabled={selectedMunicipio === "all" || loadingSchools}>
              <SelectTrigger>
                <SelectValue placeholder={loadingSchools ? "Carregando..." : "Escola"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Selecione</SelectItem>
                {schools.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Curso</Label>
            <Select value={selectedNivel} onValueChange={setSelectedNivel} disabled={selectedSchool === "all" || loadingNiveis}>
              <SelectTrigger>
                <SelectValue placeholder={loadingNiveis ? "Carregando..." : "Curso"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Selecione</SelectItem>
                {niveis.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Série</Label>
            <Select value={selectedSerie} onValueChange={setSelectedSerie} disabled={selectedNivel === "all" || loadingSeries}>
              <SelectTrigger>
                <SelectValue placeholder={loadingSeries ? "Carregando..." : "Série"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Selecione</SelectItem>
                {series.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Turma</Label>
            <Select value={selectedTurma} onValueChange={setSelectedTurma} disabled={selectedSerie === "all" || loadingTurmas}>
              <SelectTrigger>
                <SelectValue placeholder={loadingTurmas ? "Carregando..." : "Turma"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Selecione</SelectItem>
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
                <SelectItem value="all">Selecione</SelectItem>
                {TURNO_OPTIONS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Quantidade de etiquetas</Label>
            <Input
              type="number"
              min={1}
              max={200}
              value={quantityInput}
              onChange={(event) => setQuantityInput(event.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={buildPreview} disabled={loadingPreview || !!validationMessage}>
              {loadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              Montar pré-visualização
            </Button>
          </div>
        </CardContent>
      </Card>

      {previewContext && !!labels.length && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={handleGeneratePdf} disabled={loadingPdf}>
            {loadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Baixar PDF
          </Button>
          <Button type="button" variant="secondary" onClick={appendLabel}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar etiqueta
          </Button>
        </div>
      )}

      {previewContext && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contexto aplicado</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Município</p>
              <p className="text-base font-semibold">
                {previewContext.municipio.name}
                {previewContext.municipio.state ? `/${previewContext.municipio.state}` : ""}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Escola</p>
              <p className="text-base font-semibold">{previewContext.contexto.escola}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Modalidade/Etapa | Série | Turma | Turno</p>
              <p className="text-base font-semibold">
                {previewContext.contexto.nivel} | {previewContext.contexto.serie} |{" "}
                {previewContext.contexto.turma} |{" "}
                {etiquetasTurnoLabel(previewContext)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!!virtualPages.length && (
        <div className="space-y-4">
          {virtualPages.map((page, pageIndex) => (
            <Card key={`page-${pageIndex}`}>
              <CardHeader>
                <CardTitle className="text-lg">Configuração - Página {pageIndex + 1}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {page.map((label, labelIndexOnPage) => {
                  const globalLabelIndex = pageIndex * 8 + labelIndexOnPage;
                  return (
                  <div key={label.id} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-sm font-medium">Etiqueta {globalLabelIndex + 1}</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPreviewLabelId(label.id)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Visualizar
                      </Button>
                    </div>
                    <Input
                      value={label.titulo}
                      onChange={(event) => updateLabel(label.id, { titulo: event.target.value })}
                      placeholder="Título da etiqueta"
                    />

                    <div className="space-y-2">
                      <Label htmlFor={`texto-livre-${label.id}`}>Texto livre</Label>
                      <Textarea
                        id={`texto-livre-${label.id}`}
                        value={label.textoLivre}
                        onChange={(event) => updateLabel(label.id, { textoLivre: event.target.value })}
                        placeholder="Texto livre da etiqueta"
                        rows={3}
                      />
                      <p className="text-xs text-muted-foreground">
                        Use **texto** para negrito parcial (ex.: 2º **DIA** de aplicação).
                      </p>
                    </div>

                    <EtiquetaAlignToolbar
                      id={`align-${label.id}`}
                      value={label.textoLivreAlinhamento}
                      onChange={(value) => updateLabel(label.id, { textoLivreAlinhamento: value })}
                    />

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
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`text-color-${label.id}`}>Cor do texto livre</Label>
                          <Input
                            id={`text-color-${label.id}`}
                            type="color"
                            value={label.textoLivreCor}
                            onChange={(event) => updateLabel(label.id, { textoLivreCor: event.target.value })}
                            className="h-10 cursor-pointer p-1"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`text-size-${label.id}`}>Tamanho do texto livre</Label>
                          <Select
                            value={String(label.textoLivreTamanho)}
                            onValueChange={(value) =>
                              updateLabel(label.id, { textoLivreTamanho: Number.parseInt(value, 10) })
                            }
                          >
                            <SelectTrigger id={`text-size-${label.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TEXTO_LIVRE_TAMANHO_OPTIONS.map((size) => (
                                <SelectItem key={size} value={String(size)}>
                                  {size} pt
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {label.exibirAssinatura && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor={`text-above-signature-${label.id}`}>
                            Texto acima da assinatura ({label.textoAcimaAssinatura.length}/{TEXTO_ACIMA_ASSINATURA_MAX})
                          </Label>
                          <Input
                            id={`text-above-signature-${label.id}`}
                            value={label.textoAcimaAssinatura}
                            maxLength={TEXTO_ACIMA_ASSINATURA_MAX}
                            placeholder="Ex.: 2º DIA DE APLICAÇÃO – MAT OBJETIVA"
                            onChange={(event) =>
                              updateLabel(label.id, { textoAcimaAssinatura: event.target.value })
                            }
                          />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            value={label.nomeAplicador}
                            onChange={(event) => updateLabel(label.id, { nomeAplicador: event.target.value })}
                            placeholder="Nome do aplicador"
                          />
                          <Input
                            value={label.cpfAplicador}
                            onChange={(event) =>
                              updateLabel(label.id, { cpfAplicador: maskCpf(event.target.value) })
                            }
                            placeholder="CPF do aplicador"
                          />
                        </div>
                      </>
                    )}
                  </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EtiquetaPreviewDialog
        open={previewLabelId !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewLabelId(null);
        }}
        label={previewLabel}
        context={previewContext}
        logoUrl={previewLogoUrl}
        labelIndex={previewLabelIndex >= 0 ? previewLabelIndex : undefined}
      />
    </div>
  );
}
