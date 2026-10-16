import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  GitCompareArrows,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormMultiSelect } from '@/components/ui/form-multi-select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';
import {
  COMPARATIVE_ALUNOS_OPCOES,
  COMPARATIVE_ALUNOS_PADRAO,
  COMPARATIVE_INDICADORES,
  type ComparativeIndicador,
} from '@/constants/comparativeReport';
import { ComparativeCharts } from '@/components/comparative/ComparativeCharts';
import { ComparativeTables } from '@/components/comparative/ComparativeTables';
import {
  ComparativeReportApiService,
  getComparativeApiErrorMessage,
  type ComparativeFilterAvaliacao,
  type ComparativeFilterEntity,
  type ComparativeResumo,
} from '@/services/reports/comparativeReportApi';
import { exportComparativeExcel } from '@/utils/comparative/comparativeExcelExport';
import { generateComparativePdf } from '@/utils/comparative/comparativePdfService';

const ALL = 'all';

export default function RelatorioComparativo() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [estados, setEstados] = useState<ComparativeFilterEntity[]>([]);
  const [municipios, setMunicipios] = useState<ComparativeFilterEntity[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<ComparativeFilterAvaliacao[]>([]);
  const [escolas, setEscolas] = useState<ComparativeFilterEntity[]>([]);
  const [series, setSeries] = useState<ComparativeFilterEntity[]>([]);
  const [turmas, setTurmas] = useState<ComparativeFilterEntity[]>([]);

  const [estado, setEstado] = useState(ALL);
  const [municipio, setMunicipio] = useState(ALL);
  const [selectedAvaliacoes, setSelectedAvaliacoes] = useState<string[]>([]);
  const [escola, setEscola] = useState(ALL);
  const [serie, setSerie] = useState(ALL);
  const [turma, setTurma] = useState(ALL);
  const [alunos, setAlunos] = useState(COMPARATIVE_ALUNOS_PADRAO);
  const [indicadores, setIndicadores] = useState<ComparativeIndicador[]>([
    'participacao',
    'proficiencia_media',
    'distribuicao_niveis',
  ]);

  const [loadingBoot, setLoadingBoot] = useState(true);
  const [loadingMunicipios, setLoadingMunicipios] = useState(false);
  const [loadingAvaliacoes, setLoadingAvaliacoes] = useState(false);
  const [loadingEscopo, setLoadingEscopo] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ComparativeResumo | null>(null);

  const canGenerate =
    estado !== ALL &&
    municipio !== ALL &&
    selectedAvaliacoes.length >= 2 &&
    indicadores.length >= 1;

  const avaliacaoOptions = useMemo(
    () =>
      avaliacoes.map((a) => ({
        id: a.id,
        name: a.disciplina ? `${a.titulo} (${a.disciplina})` : a.titulo,
      })),
    [avaliacoes]
  );

  const escolaNome = useMemo(
    () => (escola === ALL ? undefined : escolas.find((e) => e.id === escola)?.nome),
    [escola, escolas]
  );
  const serieNome = useMemo(
    () => (serie === ALL ? undefined : series.find((s) => s.id === serie)?.nome),
    [serie, series]
  );
  const turmaNome = useMemo(
    () => (turma === ALL ? undefined : turmas.find((t) => t.id === turma)?.nome),
    [turma, turmas]
  );

  const toggleIndicador = (value: ComparativeIndicador, checked: boolean) => {
    setIndicadores((prev) => {
      if (checked) return prev.includes(value) ? prev : [...prev, value];
      return prev.filter((item) => item !== value);
    });
  };

  const loadEstados = useCallback(async () => {
    setLoadingBoot(true);
    try {
      const data = await ComparativeReportApiService.getOpcoesFiltros({});
      setEstados(data.estados);
      if (data.estados.length === 1) {
        setEstado(data.estados[0].id);
      }
    } catch (err) {
      toast({
        title: 'Erro ao carregar estados',
        description: getComparativeApiErrorMessage(err, 'Falha ao carregar filtros'),
        variant: 'destructive',
      });
    } finally {
      setLoadingBoot(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadEstados();
  }, [loadEstados]);

  useEffect(() => {
    if (estado === ALL) {
      setMunicipios([]);
      setMunicipio(ALL);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingMunicipios(true);
      try {
        const data = await ComparativeReportApiService.getOpcoesFiltros({ estado });
        if (cancelled) return;
        setMunicipios(data.municipios || []);
        if ((data.municipios || []).length === 1) {
          setMunicipio(data.municipios![0].id);
        } else {
          setMunicipio(ALL);
        }
      } catch (err) {
        if (!cancelled) {
          toast({
            title: 'Erro ao carregar municípios',
            description: getComparativeApiErrorMessage(err, 'Falha ao carregar municípios'),
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoadingMunicipios(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [estado, toast]);

  useEffect(() => {
    if (municipio === ALL) {
      setAvaliacoes([]);
      setSelectedAvaliacoes([]);
      setEscolas([]);
      setSeries([]);
      setTurmas([]);
      setEscola(ALL);
      setSerie(ALL);
      setTurma(ALL);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingAvaliacoes(true);
      try {
        const data = await ComparativeReportApiService.getOpcoesFiltros({
          estado,
          municipio,
        });
        if (cancelled) return;
        setAvaliacoes(data.avaliacoes || []);
        setSelectedAvaliacoes([]);
        setEscolas([]);
        setSeries([]);
        setTurmas([]);
        setEscola(ALL);
        setSerie(ALL);
        setTurma(ALL);
        setReport(null);
      } catch (err) {
        if (!cancelled) {
          toast({
            title: 'Erro ao carregar avaliações',
            description: getComparativeApiErrorMessage(err, 'Falha ao carregar avaliações'),
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoadingAvaliacoes(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [estado, municipio, toast]);

  useEffect(() => {
    if (municipio === ALL || selectedAvaliacoes.length === 0) {
      setEscolas([]);
      setSeries([]);
      setTurmas([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingEscopo(true);
      try {
        const data = await ComparativeReportApiService.getOpcoesFiltros({
          estado,
          municipio,
          evaluation_ids: selectedAvaliacoes,
          escola: escola !== ALL ? escola : undefined,
          serie: serie !== ALL ? serie : undefined,
        });
        if (cancelled) return;
        setEscolas(data.escolas || []);
        setSeries(data.series || []);
        setTurmas(data.turmas || []);
      } catch (err) {
        if (!cancelled) {
          toast({
            title: 'Erro ao carregar recorte',
            description: getComparativeApiErrorMessage(err, 'Falha ao carregar escola/série/turma'),
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoadingEscopo(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [estado, municipio, selectedAvaliacoes, escola, serie, toast]);

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    try {
      const data = await ComparativeReportApiService.postResumo({
        evaluation_ids: selectedAvaliacoes,
        estado,
        municipio,
        escola: escola !== ALL ? escola : undefined,
        serie: serie !== ALL ? serie : undefined,
        turma: turma !== ALL ? turma : undefined,
        alunos,
        indicadores,
      });
      setReport(data);
      toast({ title: 'Relatório gerado', description: 'Comparativo descritivo pronto.' });
    } catch (err) {
      const message = getComparativeApiErrorMessage(err, 'Não foi possível gerar o relatório');
      setError(message);
      setReport(null);
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handlePdf = async () => {
    if (!report) return;
    setExportingPdf(true);
    try {
      await generateComparativePdf({
        report,
        escolaNome,
        serieNome,
        turmaNome,
      });
    } catch (err) {
      toast({
        title: 'Erro ao exportar PDF',
        description: getComparativeApiErrorMessage(err, 'Falha na exportação PDF'),
        variant: 'destructive',
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExcel = async () => {
    if (!report) return;
    setExportingExcel(true);
    try {
      await exportComparativeExcel(report);
    } catch (err) {
      toast({
        title: 'Erro ao exportar Excel',
        description: getComparativeApiErrorMessage(err, 'Falha na exportação Excel'),
        variant: 'destructive',
      });
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <GitCompareArrows className="h-6 w-6" />
            Relatório Comparativo
          </h1>
          <p className="text-sm text-muted-foreground">
            Compare 2 ou mais avaliações lado a lado (descritivo, sem variação). Somente prova
            digital nesta versão.
          </p>
          {user?.role && (
            <p className="text-xs text-muted-foreground mt-1">Acesso: {user.role}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadEstados()} disabled={loadingBoot}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar filtros
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Selecione o município, ao menos duas avaliações, o recorte opcional e os indicadores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={setEstado} disabled={loadingBoot}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Selecione</SelectItem>
                  {estados.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome || item.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Município</Label>
              <Select
                value={municipio}
                onValueChange={setMunicipio}
                disabled={estado === ALL || loadingMunicipios}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Selecione</SelectItem>
                  {municipios.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Alunos</Label>
              <Select value={alunos} onValueChange={(v) => setAlunos(v as typeof alunos)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPARATIVE_ALUNOS_OPCOES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Avaliações (mínimo 2)</Label>
            <FormMultiSelect
              options={avaliacaoOptions}
              selected={selectedAvaliacoes}
              onChange={setSelectedAvaliacoes}
              placeholder={
                municipio === ALL || loadingAvaliacoes
                  ? 'Carregando avaliações…'
                  : 'Selecione 2 ou mais avaliações'
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Escola</Label>
              <Select
                value={escola}
                onValueChange={(v) => {
                  setEscola(v);
                  setSerie(ALL);
                  setTurma(ALL);
                }}
                disabled={selectedAvaliacoes.length === 0 || loadingEscopo}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas</SelectItem>
                  {escolas.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Série</Label>
              <Select
                value={serie}
                onValueChange={(v) => {
                  setSerie(v);
                  setTurma(ALL);
                }}
                disabled={selectedAvaliacoes.length === 0 || loadingEscopo}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas</SelectItem>
                  {series.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Turma</Label>
              <Select
                value={turma}
                onValueChange={setTurma}
                disabled={serie === ALL || loadingEscopo}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas</SelectItem>
                  {turmas.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Indicadores</Label>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {COMPARATIVE_INDICADORES.map((item) => {
                const checked = indicadores.includes(item.value);
                return (
                  <label
                    key={item.value}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => toggleIndicador(item.value, value === true)}
                    />
                    <span>
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="block text-xs text-muted-foreground">{item.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleGenerate()} disabled={!canGenerate || generating}>
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GitCompareArrows className="mr-2 h-4 w-4" />
              )}
              Gerar relatório
            </Button>
            <Button
              variant="outline"
              onClick={() => void handlePdf()}
              disabled={!report || exportingPdf}
            >
              {exportingPdf ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Exportar PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleExcel()}
              disabled={!report || exportingExcel}
            >
              {exportingExcel ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Exportar Excel
            </Button>
          </div>

          {!canGenerate && (
            <p className="text-sm text-muted-foreground">
              Para gerar: município + pelo menos 2 avaliações + pelo menos 1 indicador.
            </p>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 pt-6 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {!report && !generating && !error && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum comparativo gerado ainda. Configure os filtros e clique em Gerar relatório.
          </CardContent>
        </Card>
      )}

      {generating && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Calculando indicadores com a mesma lógica de Resultados…
          </CardContent>
        </Card>
      )}

      {report && !generating && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Tabelas comparativas</CardTitle>
              <CardDescription>Uma coluna por avaliação — sem variação ou delta.</CardDescription>
            </CardHeader>
            <CardContent>
              <ComparativeTables report={report} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gráficos</CardTitle>
              <CardDescription>
                Um gráfico por indicador, com as avaliações como séries.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ComparativeCharts report={report} mode="screen" />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
