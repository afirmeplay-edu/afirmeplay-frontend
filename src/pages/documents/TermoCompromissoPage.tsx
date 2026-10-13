import { useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Filter, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { FormFiltersApiService } from "@/services/formFiltersApi";
import {
  EvaluationResultsApiService,
  REPORT_ENTITY_TYPE_ANSWER_SHEET,
} from "@/services/evaluation/evaluationResultsApi";
import { EvaluationInstrumentPicker } from "@/components/filters";
import {
  getTermoCompromissoApiError,
  getTermoCompromissoLote,
} from "@/services/documents/termoCompromissoApi";
import { exportTermoCompromisso } from "@/services/reports/termoCompromissoPdf";
import type {
  TermoCompromissoExportFormat,
  TermoCompromissoLoteResponse,
  TermoCompromissoModo,
} from "@/types/termo-compromisso";
import { loadCityBrandingPdfAssets } from "@/utils/pdfCityBranding";
import { getClassShiftLabel } from "@/lib/classShift";
import { downloadBlob } from "@/services/reports/hierarchicalDownload";

type Option = { id: string; name: string };

const MODO_OPTIONS: { value: TermoCompromissoModo; label: string }[] = [
  { value: "manual", label: "Nome personalizado" },
  { value: "avaliacao", label: "Avaliação" },
  { value: "cartao_resposta", label: "Cartão-resposta" },
];

const EXPORT_FORMAT_OPTIONS: { value: TermoCompromissoExportFormat; label: string; hint: string }[] = [
  {
    value: "pdf_unico",
    label: "PDF único",
    hint: "Um único PDF com todos os termos, organizados por escola, série e turma.",
  },
  {
    value: "zip_escola",
    label: "ZIP por escola",
    hint: "Um PDF por escola, com os termos de todas as turmas da escola.",
  },
  {
    value: "zip_serie",
    label: "ZIP por série",
    hint: "Uma pasta por escola e um PDF por série, com os termos de todas as turmas da série.",
  },
];

function getAppliedTitle(optionId: string, options: Option[]): string {
  return options.find((item) => item.id === optionId)?.name?.trim() || "";
}

export default function TermoCompromissoPage() {
  const { toast } = useToast();

  const [modo, setModo] = useState<TermoCompromissoModo>("manual");
  const [estados, setEstados] = useState<Option[]>([]);
  const [municipios, setMunicipios] = useState<Option[]>([]);
  const [schools, setSchools] = useState<Option[]>([]);
  const [series, setSeries] = useState<Option[]>([]);
  const [turmas, setTurmas] = useState<Option[]>([]);
  const [aplicados, setAplicados] = useState<Option[]>([]);

  const [selectedEstado, setSelectedEstado] = useState("all");
  const [selectedMunicipio, setSelectedMunicipio] = useState("all");
  const [selectedSchool, setSelectedSchool] = useState("all");
  const [selectedSerie, setSelectedSerie] = useState("all");
  const [selectedTurma, setSelectedTurma] = useState("all");
  const [selectedAplicadoId, setSelectedAplicadoId] = useState("all");
  const [manualTitle, setManualTitle] = useState("");
  const [exportFormat, setExportFormat] = useState<TermoCompromissoExportFormat>("pdf_unico");

  const [loadingEstados, setLoadingEstados] = useState(false);
  const [loadingMunicipios, setLoadingMunicipios] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingTurmas, setLoadingTurmas] = useState(false);
  const [loadingAplicados, setLoadingAplicados] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const [preview, setPreview] = useState<TermoCompromissoLoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isManualMode = modo === "manual";
  const isAppliedMode = modo === "avaliacao" || modo === "cartao_resposta";
  const turmaEspecifica = selectedTurma !== "all";
  const effectiveFormat: TermoCompromissoExportFormat = turmaEspecifica ? "pdf_unico" : exportFormat;

  const resolvedNomeAplicacao = useMemo(() => {
    if (isManualMode) return manualTitle.trim();
    if (selectedAplicadoId === "all") return "";
    return getAppliedTitle(selectedAplicadoId, aplicados);
  }, [aplicados, isManualMode, manualTitle, selectedAplicadoId]);

  const previewSummary = useMemo(() => {
    if (!preview) return null;
    return {
      escolas: new Set(preview.turmas.map((t) => t.escola_id)).size,
      series: new Set(preview.turmas.map((t) => `${t.escola_id}|${t.serie_id}`)).size,
      turmas: preview.turmas.length,
    };
  }, [preview]);

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
    FormFiltersApiService.getFormFilterSchools({ estado: selectedEstado, municipio: selectedMunicipio })
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
        if (!cancelled) {
          setSeries(list.map((s) => ({ id: s.id, name: s.nome })));
          setSelectedSerie("all");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSeries(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSchool, selectedMunicipio, selectedEstado]);

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
    setPreview(null);
    setError(null);
  }, [
    selectedEstado,
    selectedMunicipio,
    selectedSchool,
    selectedSerie,
    selectedTurma,
    modo,
    manualTitle,
    selectedAplicadoId,
  ]);

  const validationMessage = useMemo(() => {
    if (!selectedMunicipio || selectedMunicipio === "all") return "Selecione o município.";
    if (isManualMode && !manualTitle.trim()) return "Informe o nome da aplicação.";
    if (isAppliedMode && selectedAplicadoId === "all") {
      return modo === "cartao_resposta" ? "Selecione o cartão-resposta." : "Selecione a avaliação.";
    }
    return null;
  }, [isAppliedMode, isManualMode, manualTitle, modo, selectedAplicadoId, selectedMunicipio]);

  const buildParams = () => ({
    municipio: selectedMunicipio,
    escola: selectedSchool !== "all" ? selectedSchool : undefined,
    serie: selectedSerie !== "all" ? selectedSerie : undefined,
    turma: selectedTurma !== "all" ? selectedTurma : undefined,
    modo,
    evaluation_id: modo === "avaliacao" && selectedAplicadoId !== "all" ? selectedAplicadoId : undefined,
    answer_sheet_id:
      modo === "cartao_resposta" && selectedAplicadoId !== "all" ? selectedAplicadoId : undefined,
  });

  const handlePreview = async () => {
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    setLoadingPreview(true);
    setError(null);
    try {
      const data = await getTermoCompromissoLote(buildParams());
      setPreview(data);
      if (data.turmas.length === 0) {
        setError("Nenhuma turma encontrada para os filtros selecionados.");
      }
    } catch (err) {
      const msg = getTermoCompromissoApiError(err, "Não foi possível carregar os dados do termo.");
      setError(msg);
      setPreview(null);
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
    setLoadingPdf(true);
    setProgress(null);
    setError(null);
    try {
      const lote = preview ?? (await getTermoCompromissoLote(buildParams()));
      setPreview(lote);
      if (lote.turmas.length === 0) {
        setError("Nenhuma turma encontrada para os filtros selecionados.");
        return;
      }

      const branding = await loadCityBrandingPdfAssets(selectedMunicipio);
      const result = await exportTermoCompromisso({
        lote,
        format: effectiveFormat,
        nomeAplicacao: resolvedNomeAplicacao,
        municipalLogo: branding.logo,
        onProgress: (current, total) => setProgress({ current, total }),
      });
      downloadBlob(result.blob, result.fileName);
      toast({
        title: effectiveFormat === "pdf_unico" ? "PDF gerado" : "ZIP gerado",
        description:
          effectiveFormat === "pdf_unico"
            ? `${result.totalTermos} termo(s) exportado(s).`
            : `${result.totalTermos} termo(s) em ${result.totalArquivos} PDF(s).`,
      });
    } catch (err) {
      const msg =
        err instanceof Error && !("response" in err)
          ? err.message
          : getTermoCompromissoApiError(err, "Não foi possível gerar o PDF.");
      setError(msg);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoadingPdf(false);
      setProgress(null);
    }
  };

  const singleTurma = preview && preview.turmas.length === 1 ? preview.turmas[0] : null;

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <FileText className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Termo de compromisso e responsabilidade</h1>
          <p className="text-sm text-muted-foreground">
            Selecione o contexto da aplicação e a forma de organização do download. Os dados do(a)
            declarante (nome, CPF e RG) são preenchidos à mão no documento impresso.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Estado</Label>
            <Select value={selectedEstado} onValueChange={setSelectedEstado} disabled={loadingEstados}>
              <SelectTrigger>
                <SelectValue placeholder={loadingEstados ? "Carregando..." : "Estado"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {estados.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
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
              disabled={!selectedEstado || selectedEstado === "all" || loadingMunicipios}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingMunicipios ? "Carregando..." : "Município"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Selecione</SelectItem>
                {municipios.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Escola</Label>
            <Select value={selectedSchool} onValueChange={setSelectedSchool} disabled={selectedMunicipio === "all" || loadingSchools}>
              <SelectTrigger>
                <SelectValue placeholder={loadingSchools ? "Carregando..." : "Escola"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {schools.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
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
                <SelectItem value="all">Todas</SelectItem>
                {series.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
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
                <SelectItem value="all">Todas</SelectItem>
                {turmas.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Dados do termo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4 sm:col-span-2">
            <p className="text-sm font-medium">Nome da aplicação no termo</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Origem do nome</Label>
                <Select value={modo} onValueChange={(value) => setModo(value as TermoCompromissoModo)}>
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

              {isManualMode ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Nome personalizado</Label>
                  <Input
                    placeholder="Digite o nome da aplicação"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                  />
                </div>
              ) : (
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
                  {modo === "avaliacao" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Somente turmas em que a avaliação foi aplicada recebem termo.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Organização do download</Label>
            <Select
              value={effectiveFormat}
              onValueChange={(value) => setExportFormat(value as TermoCompromissoExportFormat)}
              disabled={turmaEspecifica}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {turmaEspecifica
                ? "Com uma turma específica, o download é um único PDF."
                : EXPORT_FORMAT_OPTIONS.find((option) => option.value === effectiveFormat)?.hint}
            </p>
          </div>

          {error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              disabled={loadingPreview || loadingPdf || !!validationMessage}
            >
              {loadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              Pré-visualizar recorte
            </Button>
            <Button type="button" onClick={handleGeneratePdf} disabled={loadingPdf || !!validationMessage}>
              {loadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {loadingPdf && progress
                ? `Gerando ${progress.current} de ${progress.total}...`
                : effectiveFormat === "pdf_unico"
                  ? "Baixar PDF"
                  : "Baixar ZIP"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && previewSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resumo do recorte</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3 sm:col-span-3">
              <p className="text-xs text-muted-foreground">Município</p>
              <p className="text-base font-semibold">
                {preview.municipio.name}
                {preview.municipio.state ? ` - ${preview.municipio.state}` : ""}
              </p>
            </div>
            {singleTurma ? (
              <>
                <div className="rounded-lg border p-3 sm:col-span-3">
                  <p className="text-xs text-muted-foreground">Escola</p>
                  <p className="text-base font-semibold">{singleTurma.escola}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Série</p>
                  <p className="text-base font-semibold">{singleTurma.serie}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Turma</p>
                  <p className="text-base font-semibold">{singleTurma.turma}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Turno</p>
                  <p className="text-base font-semibold">{getClassShiftLabel(singleTurma.shift)}</p>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Escolas</p>
                  <p className="text-base font-semibold">{previewSummary.escolas}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Séries (por escola)</p>
                  <p className="text-base font-semibold">{previewSummary.series}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Turmas / termos</p>
                  <p className="text-base font-semibold">{previewSummary.turmas}</p>
                </div>
              </>
            )}
            <div className="rounded-lg border p-3 sm:col-span-3">
              <p className="text-xs text-muted-foreground">Nome da aplicação no termo</p>
              <p className="text-base font-semibold">{resolvedNomeAplicacao || "—"}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
