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
  getTermoCompromissoDados,
} from "@/services/documents/termoCompromissoApi";
import { downloadTermoCompromissoPdf } from "@/services/reports/termoCompromissoPdf";
import type {
  TermoCompromissoDadosResponse,
  TermoCompromissoFormData,
  TermoCompromissoModo,
} from "@/types/termo-compromisso";
import { loadCityBrandingPdfAssets } from "@/utils/pdfCityBranding";
import { getClassShiftLabel } from "@/lib/classShift";

type Option = { id: string; name: string };

const MODO_OPTIONS: { value: TermoCompromissoModo; label: string }[] = [
  { value: "manual", label: "Nome personalizado" },
  { value: "avaliacao", label: "Avaliação" },
  { value: "cartao_resposta", label: "Cartão-resposta" },
];

function getAppliedTitle(optionId: string, options: Option[]): string {
  return options.find((item) => item.id === optionId)?.name?.trim() || "";
}

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

  const [form, setForm] = useState<TermoCompromissoFormData>({
    nome: "",
    cpf: "",
    rg: "",
    nomeAplicacao: "",
  });

  const [loadingEstados, setLoadingEstados] = useState(false);
  const [loadingMunicipios, setLoadingMunicipios] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingTurmas, setLoadingTurmas] = useState(false);
  const [loadingAplicados, setLoadingAplicados] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const [preview, setPreview] = useState<TermoCompromissoDadosResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isManualMode = modo === "manual";
  const isAppliedMode = modo === "avaliacao" || modo === "cartao_resposta";

  const resolvedNomeAplicacao = useMemo(() => {
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
    form.nome,
    form.cpf,
    form.rg,
    modo,
    manualTitle,
    selectedAplicadoId,
  ]);

  const validationMessage = useMemo(() => {
    if (!selectedMunicipio || selectedMunicipio === "all") return "Selecione o município.";
    if (!selectedSchool || selectedSchool === "all") return "Selecione a escola.";
    if (!selectedSerie || selectedSerie === "all") return "Selecione a série.";
    if (!selectedTurma || selectedTurma === "all") return "Selecione a turma.";
    if (isManualMode && !manualTitle.trim()) return "Informe o nome da aplicação.";
    if (isAppliedMode && selectedAplicadoId === "all") {
      return modo === "cartao_resposta" ? "Selecione o cartão-resposta." : "Selecione a avaliação.";
    }
    return null;
  }, [
    isAppliedMode,
    isManualMode,
    manualTitle,
    modo,
    selectedAplicadoId,
    selectedMunicipio,
    selectedSchool,
    selectedSerie,
    selectedTurma,
  ]);

  const buildFormData = (): TermoCompromissoFormData => ({
    nome: form.nome.trim(),
    cpf: form.cpf.trim(),
    rg: form.rg.trim(),
    nomeAplicacao: resolvedNomeAplicacao,
  });

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
      const data = await getTermoCompromissoDados(buildParams());
      setPreview(data);
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
    setError(null);
    try {
      const data = preview ?? (await getTermoCompromissoDados(buildParams()));
      setPreview(data);
      const branding = await loadCityBrandingPdfAssets(selectedMunicipio);
      downloadTermoCompromissoPdf(
        data,
        buildFormData(),
        branding.logo
      );
      toast({ title: "PDF gerado", description: "O termo foi baixado com sucesso." });
    } catch (err) {
      const msg = getTermoCompromissoApiError(err, "Não foi possível gerar o PDF.");
      setError(msg);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoadingPdf(false);
    }
  };

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <FileText className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Termo de compromisso e responsabilidade</h1>
          <p className="text-sm text-muted-foreground">
            Selecione o contexto da aplicação e, se desejar, informe os dados pessoais. Campos em branco
            ficam disponíveis no PDF para preenchimento manual.
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
                <SelectItem value="all">Selecione</SelectItem>
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
                <SelectItem value="all">Selecione</SelectItem>
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
                <SelectItem value="all">Selecione</SelectItem>
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
                </div>
              )}

            </div>
          </div>

          <div className="space-y-3 rounded-lg border bg-muted/30 p-4 sm:col-span-2">
            <p className="text-sm font-medium">Dados do(a) declarante (opcional)</p>
            <p className="text-xs text-muted-foreground">
              Deixe em branco para gerar linhas de preenchimento no PDF.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome completo</Label>
                <Input
                  placeholder="Opcional — deixe em branco para preencher no PDF"
                  value={form.nome}
                  onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>CPF</Label>
                <Input
                  placeholder="Opcional — 000.000.000-00"
                  value={form.cpf}
                  onChange={(e) => setForm((prev) => ({ ...prev, cpf: maskCpf(e.target.value) }))}
                />
              </div>

              <div className="space-y-2">
                <Label>RG</Label>
                <Input
                  placeholder="Opcional — deixe em branco para preencher no PDF"
                  value={form.rg}
                  onChange={(e) => setForm((prev) => ({ ...prev, rg: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={handlePreview} disabled={loadingPreview || !!validationMessage}>
              {loadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              Pré-visualizar contexto
            </Button>
            <Button type="button" onClick={handleGeneratePdf} disabled={loadingPdf || !!validationMessage}>
              {loadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Baixar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resumo do contexto</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Município</p>
              <p className="text-base font-semibold">
                {preview.municipio.name}
                {preview.municipio.state ? ` - ${preview.municipio.state}` : ""}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Escola</p>
              <p className="text-base font-semibold">{preview.contexto.escola}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Série</p>
              <p className="text-base font-semibold">{preview.contexto.serie}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Turma</p>
              <p className="text-base font-semibold">{preview.contexto.turma}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Turno</p>
              <p className="text-base font-semibold">
                {getClassShiftLabel(preview.contexto.turno ?? preview.contexto.shift)}
              </p>
            </div>
            <div className="rounded-lg border p-3 sm:col-span-2">
              <p className="text-xs text-muted-foreground">Nome da aplicação no termo</p>
              <p className="text-base font-semibold">{resolvedNomeAplicacao || "—"}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
