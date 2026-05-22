import { useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Filter, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { FormFiltersApiService } from "@/services/formFiltersApi";
import {
  EvaluationResultsApiService,
  REPORT_ENTITY_TYPE_ANSWER_SHEET,
} from "@/services/evaluation/evaluationResultsApi";
import { getFolhaRascunhoDados, getFolhaRascunhoApiError } from "@/services/documents/folhaRascunhoApi";
import type { FolhaRascunhoDadosResponse, FolhaRascunhoModo } from "@/types/folha-rascunho";
import { downloadFolhaRascunhoPdf } from "@/services/reports/folhaRascunhoPdf";
import { loadCityBrandingPdfAssets } from "@/utils/pdfCityBranding";

type Option = { id: string; name: string };

const MODO_OPTIONS: { value: FolhaRascunhoModo; label: string }[] = [
  { value: "personalizada", label: "Personalizável" },
  { value: "avaliacao", label: "Avaliação" },
  { value: "cartao_resposta", label: "Cartão-resposta" },
];

export default function FolhaRascunhoPage() {
  const { toast } = useToast();

  const [modo, setModo] = useState<FolhaRascunhoModo>("personalizada");
  const [estados, setEstados] = useState<Option[]>([]);
  const [municipios, setMunicipios] = useState<Option[]>([]);
  const [schools, setSchools] = useState<Option[]>([]);
  const [series, setSeries] = useState<Option[]>([]);
  const [turmas, setTurmas] = useState<Option[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Option[]>([]);

  const [selectedEstado, setSelectedEstado] = useState("all");
  const [selectedMunicipio, setSelectedMunicipio] = useState("all");
  const [selectedSchool, setSelectedSchool] = useState("all");
  const [selectedSerie, setSelectedSerie] = useState("all");
  const [selectedTurma, setSelectedTurma] = useState("all");
  const [selectedAplicadoId, setSelectedAplicadoId] = useState("all");

  const [loadingEstados, setLoadingEstados] = useState(false);
  const [loadingMunicipios, setLoadingMunicipios] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingTurmas, setLoadingTurmas] = useState(false);
  const [loadingAplicados, setLoadingAplicados] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const [preview, setPreview] = useState<FolhaRascunhoDadosResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPersonalizada = modo === "personalizada";
  const isAplicado = modo === "avaliacao" || modo === "cartao_resposta";

  useEffect(() => {
    let cancelled = false;
    setLoadingEstados(true);
    FormFiltersApiService.getFormFilterStates()
      .then((list) => {
        if (!cancelled) setEstados(list.map((e) => ({ id: e.id, name: e.nome })));
      })
      .catch(() => {
        if (!cancelled) toast({ title: "Erro", description: "Não foi possível carregar estados.", variant: "destructive" });
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
    if (!isAplicado || !selectedMunicipio || selectedMunicipio === "all" || !selectedEstado || selectedEstado === "all") {
      setAvaliacoes([]);
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
          setAvaliacoes((items ?? []).map((a) => ({ id: a.id, name: a.titulo || a.id })));
          setSelectedAplicadoId("all");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAplicados(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAplicado, modo, selectedEstado, selectedMunicipio, selectedSchool]);

  useEffect(() => {
    setPreview(null);
    setError(null);
  }, [modo, selectedEstado, selectedMunicipio, selectedSchool, selectedSerie, selectedTurma, selectedAplicadoId]);

  const validationMessage = useMemo(() => {
    if (!selectedMunicipio || selectedMunicipio === "all") return "Selecione o município.";
    if (isPersonalizada && (!selectedSchool || selectedSchool === "all")) return "Selecione a escola.";
    if (isAplicado && (!selectedAplicadoId || selectedAplicadoId === "all")) {
      return modo === "cartao_resposta" ? "Selecione o cartão-resposta." : "Selecione a avaliação.";
    }
    return null;
  }, [isPersonalizada, isAplicado, selectedMunicipio, selectedSchool, selectedAplicadoId, modo]);

  const buildParams = () => ({
    modo,
    estado: selectedEstado !== "all" ? selectedEstado : undefined,
    municipio: selectedMunicipio,
    escola: selectedSchool !== "all" ? selectedSchool : undefined,
    serie: selectedSerie !== "all" ? selectedSerie : undefined,
    turma: selectedTurma !== "all" ? selectedTurma : undefined,
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
      const data = await getFolhaRascunhoDados(buildParams());
      setPreview(data);
    } catch (err) {
      const msg = getFolhaRascunhoApiError(err, "Não foi possível carregar o resumo.");
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
      const data = preview ?? (await getFolhaRascunhoDados(buildParams()));
      setPreview(data);
      const branding = await loadCityBrandingPdfAssets(selectedMunicipio);
      await downloadFolhaRascunhoPdf(data, branding.logo);
      toast({ title: "PDF gerado", description: `${data.totals.pages} página(s) estimada(s).` });
    } catch (err) {
      const msg = getFolhaRascunhoApiError(err, "Não foi possível gerar o PDF.");
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
          <h1 className="text-2xl font-bold tracking-tight">Folha de rascunho</h1>
          <p className="text-sm text-muted-foreground">
            Gere folhas em branco por aluno (PDF no navegador). Todos os modos incluem todos os alunos
            matriculados nas turmas do recorte selecionado.
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
          <div className="space-y-2 sm:col-span-2">
            <Label>Modo</Label>
            <Select value={modo} onValueChange={(v) => setModo(v as FolhaRascunhoModo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODO_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
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

          {isAplicado && (
            <div className="space-y-2 sm:col-span-2">
              <Label>{modo === "cartao_resposta" ? "Cartão-resposta" : "Avaliação"}</Label>
              <Select
                value={selectedAplicadoId}
                onValueChange={setSelectedAplicadoId}
                disabled={loadingAplicados || selectedMunicipio === "all"}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingAplicados ? "Carregando..." : "Selecione"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Selecione</SelectItem>
                  {avaliacoes.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label>
              Escola{isPersonalizada ? " (obrigatória)" : ""}
            </Label>
            <Select
              value={selectedSchool}
              onValueChange={setSelectedSchool}
              disabled={selectedMunicipio === "all" || loadingSchools}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingSchools ? "Carregando..." : "Escola"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isPersonalizada ? "Selecione" : "Todas"}</SelectItem>
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
            <Select
              value={selectedSerie}
              onValueChange={setSelectedSerie}
              disabled={selectedSchool === "all" || loadingSeries}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas" />
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
            <Select
              value={selectedTurma}
              onValueChange={setSelectedTurma}
              disabled={selectedSerie === "all" || loadingTurmas}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas" />
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

          {error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={handlePreview} disabled={loadingPreview || !!validationMessage}>
              {loadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              Pré-visualizar resumo
            </Button>
            <Button type="button" onClick={handleGeneratePdf} disabled={loadingPdf || !!validationMessage}>
              {loadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Gerar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Escolas</p>
              <p className="text-2xl font-semibold">{preview.totals.schools}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Turmas</p>
              <p className="text-2xl font-semibold">{preview.totals.classes}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Alunos</p>
              <p className="text-2xl font-semibold">{preview.totals.students}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Capas estimadas</p>
              <p className="text-2xl font-semibold">{preview.totals.covers}</p>
            </div>
            <div className="rounded-lg border p-3 sm:col-span-2">
              <p className="text-xs text-muted-foreground">Páginas totais (capas + folhas)</p>
              <p className="text-2xl font-semibold">{preview.totals.pages}</p>
            </div>
            {preview.avaliacao_titulo && (
              <p className="text-sm text-muted-foreground sm:col-span-3">
                Referência: {preview.avaliacao_titulo}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
