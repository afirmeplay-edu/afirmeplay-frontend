import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Filter, Loader2, Printer, Scale } from 'lucide-react';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { InseAvaliacaoFiltersApiService } from '@/services/inseAvaliacaoFiltersApi';
import { InseEvaluationPicker } from '@/components/filters';
import { FormMultiSelect } from '@/components/ui/form-multi-select';
import {
  buildPneerqQueryParams,
  fetchPneerqAggregated,
  fetchPneerqByForm,
  isPneerqProcessingPayload,
  type PneerqAggregatedResultBody,
  type PneerqFormResultBody,
} from '@/services/pneerqApi';
import {
  buildChartPairFromEixos,
  buildDashboardCharts,
  buildKpiCardsFromDashboard,
  buildKpiCardsFromEixos,
  buildMatrixRowsFromDashboard,
  buildMatrixRowsFromEixos,
  buildNarrativeParagraphs,
  getPneerqDashboard,
  getPneerqEixos,
  healthStatusFromValor,
  type DashboardMatrixRowModel,
  type ReportMode,
} from '@/utils/pneerqPresentation';

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const POLL_MS = 2500;
const MAX_WAIT_MS = 6 * 60 * 1000;

export default function PneerqReport() {
  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);

  const [reportMode, setReportMode] = useState<ReportMode>('form');

  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('all');
  const [selectedForm, setSelectedForm] = useState<string>('');
  const [selectedAvaliacao, setSelectedAvaliacao] = useState<string>('');
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

  const [states, setStates] = useState<Array<{ id: string; name: string }>>([]);
  const [municipalities, setMunicipalities] = useState<Array<{ id: string; name: string }>>([]);
  const [forms, setForms] = useState<Array<{ id: string; name: string }>>([]);
  const [avaliacoes, setAvaliacoes] = useState<Array<{ id: string; name: string }>>([]);
  const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);
  const [grades, setGrades] = useState<Array<{ id: string; name: string }>>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);

  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const [formPayload, setFormPayload] = useState<PneerqFormResultBody | null>(null);
  const [aggregatedPayload, setAggregatedPayload] = useState<PneerqAggregatedResultBody | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoadingFilters(true);
        const options = await InseAvaliacaoFiltersApiService.getFilterOptions({});
        setStates(options.estados);
      } catch {
        toast({
          title: 'Erro ao carregar filtros',
          description: 'Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingFilters(false);
      }
    };
    load();
  }, [toast]);

  useEffect(() => {
    if (selectedState !== 'all') {
      setIsLoadingFilters(true);
      setSelectedMunicipality('all');
      setSelectedForm('');
      setSelectedAvaliacao('');
      setSelectedSchools([]);
      setSelectedGrades([]);
      setSelectedClasses([]);
      InseAvaliacaoFiltersApiService.getFilterOptions({ estado: selectedState })
        .then((options) => {
          setMunicipalities(options.municipios);
          setForms([]);
          setAvaliacoes([]);
          setSchools([]);
          setGrades([]);
          setClasses([]);
        })
        .catch(() => {
          setMunicipalities([]);
          setForms([]);
          setAvaliacoes([]);
        })
        .finally(() => setIsLoadingFilters(false));
    } else {
      setMunicipalities([]);
      setForms([]);
      setAvaliacoes([]);
      setSelectedMunicipality('all');
      setSelectedForm('');
      setSelectedAvaliacao('');
      setSelectedSchools([]);
      setSelectedGrades([]);
      setSelectedClasses([]);
    }
  }, [selectedState]);

  useEffect(() => {
    if (selectedState !== 'all' && selectedMunicipality !== 'all') {
      setIsLoadingFilters(true);
      setSelectedForm('');
      setSelectedAvaliacao('');
      setSelectedSchools([]);
      setSelectedGrades([]);
      setSelectedClasses([]);
      InseAvaliacaoFiltersApiService.getFilterOptions({
        estado: selectedState,
        municipio: selectedMunicipality,
      })
        .then((options) => {
          setForms(options.formularios);
          setAvaliacoes(options.avaliacoes);
          setSchools([]);
          setGrades([]);
          setClasses([]);
        })
        .catch(() => {
          setForms([]);
          setAvaliacoes([]);
          setSchools([]);
        })
        .finally(() => setIsLoadingFilters(false));
    } else {
      setForms([]);
      setAvaliacoes([]);
      setSelectedForm('');
      setSelectedAvaliacao('');
      setSchools([]);
    }
  }, [selectedState, selectedMunicipality]);

  useEffect(() => {
    if (
      selectedState !== 'all' &&
      selectedMunicipality !== 'all' &&
      selectedForm &&
      selectedForm !== 'all' &&
      selectedAvaliacao &&
      selectedAvaliacao !== 'all'
    ) {
      setIsLoadingFilters(true);
      setSelectedSchools([]);
      setSelectedGrades([]);
      setSelectedClasses([]);
      InseAvaliacaoFiltersApiService.getFilterOptions({
        estado: selectedState,
        municipio: selectedMunicipality,
        formulario: selectedForm,
        avaliacao: selectedAvaliacao,
      })
        .then((options) => {
          const sorted = [...(options.escolas ?? [])].sort((a, b) => a.name.localeCompare(b.name));
          setSchools(sorted);
          setGrades([]);
          setClasses([]);
        })
        .catch(() => setSchools([]))
        .finally(() => setIsLoadingFilters(false));
    } else {
      setSchools([]);
      setSelectedSchools([]);
      setGrades([]);
      setClasses([]);
    }
  }, [selectedState, selectedMunicipality, selectedForm, selectedAvaliacao]);

  useEffect(() => {
    if (
      selectedState !== 'all' &&
      selectedMunicipality !== 'all' &&
      selectedForm &&
      selectedForm !== 'all' &&
      selectedAvaliacao &&
      selectedAvaliacao !== 'all' &&
      selectedSchools.length > 0
    ) {
      setIsLoadingFilters(true);
      const allGradesById = new Map<string, { id: string; name: string }>();
      const allGradesByName = new Map<string, string>();
      Promise.all(
        selectedSchools.map((schoolId) =>
          InseAvaliacaoFiltersApiService.getFilterOptions({
            estado: selectedState,
            municipio: selectedMunicipality,
            formulario: selectedForm,
            avaliacao: selectedAvaliacao,
            escola: schoolId,
          })
        )
      )
        .then((results) => {
          results.forEach((options) => {
            (options.series ?? []).forEach((grade: { id: string; name: string }) => {
              const name = (grade.name ?? '').trim().toLowerCase();
              if (!allGradesById.has(grade.id) && !allGradesByName.has(name)) {
                allGradesById.set(grade.id, { id: grade.id, name: grade.name?.trim() ?? '' });
                allGradesByName.set(name, grade.id);
              }
            });
          });
          setGrades(Array.from(allGradesById.values()).sort((a, b) => a.name.localeCompare(b.name)));
          setClasses([]);
        })
        .catch(() => setGrades([]))
        .finally(() => setIsLoadingFilters(false));
    } else {
      setGrades([]);
    }
  }, [selectedState, selectedMunicipality, selectedForm, selectedAvaliacao, selectedSchools]);

  useEffect(() => {
    if (
      selectedState !== 'all' &&
      selectedMunicipality !== 'all' &&
      selectedForm &&
      selectedForm !== 'all' &&
      selectedAvaliacao &&
      selectedAvaliacao !== 'all' &&
      selectedSchools.length > 0 &&
      selectedGrades.length > 0
    ) {
      setIsLoadingFilters(true);
      const allClassesById = new Map<string, { id: string; name: string }>();
      const allClassesByName = new Map<string, string>();
      const promises: Promise<ReturnType<typeof InseAvaliacaoFiltersApiService.getFilterOptions>>[] = [];
      selectedSchools.forEach((schoolId) => {
        selectedGrades.forEach((gradeId) => {
          promises.push(
            InseAvaliacaoFiltersApiService.getFilterOptions({
              estado: selectedState,
              municipio: selectedMunicipality,
              formulario: selectedForm,
              avaliacao: selectedAvaliacao,
              escola: schoolId,
              serie: gradeId,
            })
          );
        });
      });
      Promise.all(promises)
        .then((results) => {
          results.forEach((options) => {
            (options.turmas ?? []).forEach((t: { id: string; name: string }) => {
              const name = (t.name ?? '').trim().toLowerCase();
              if (!allClassesById.has(t.id) && !allClassesByName.has(name)) {
                allClassesById.set(t.id, { id: t.id, name: t.name?.trim() ?? '' });
                allClassesByName.set(name, t.id);
              }
            });
          });
          setClasses(Array.from(allClassesById.values()).sort((a, b) => a.name.localeCompare(b.name)));
        })
        .catch(() => setClasses([]))
        .finally(() => setIsLoadingFilters(false));
    } else {
      setClasses([]);
    }
  }, [selectedState, selectedMunicipality, selectedForm, selectedAvaliacao, selectedSchools, selectedGrades]);

  const requestConfigForCity = useMemo(
    () =>
      selectedMunicipality !== 'all'
        ? { meta: { cityId: selectedMunicipality } as { cityId: string } }
        : {},
    [selectedMunicipality]
  );

  const stateParam = useMemo(() => {
    const match = states.find((s) => s.id === selectedState);
    // Se o backend expõe UF nas opções, usar UF; caso contrário mantém o valor selecionado.
    return (match as { uf?: string } | undefined)?.uf ?? selectedState;
  }, [states, selectedState]);

  const hasMinimumFilters =
    selectedState !== 'all' &&
    selectedMunicipality !== 'all' &&
    selectedForm &&
    selectedForm !== 'all' &&
    selectedAvaliacao &&
    selectedAvaliacao !== 'all' &&
    selectedSchools.length > 0;

  const fetchReport = useCallback(async () => {
    if (!hasMinimumFilters) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    const params = buildPneerqQueryParams({
      state: stateParam,
      municipio: selectedMunicipality,
      escolaCsv: selectedSchools.join(','),
      serieCsv: selectedGrades.length > 0 ? selectedGrades.join(',') : undefined,
      turmaCsv: selectedClasses.length > 0 ? selectedClasses.join(',') : undefined,
    });

    const req = {
      params,
      ...requestConfigForCity,
    };

    const getter = () =>
      reportMode === 'form'
        ? fetchPneerqByForm(selectedForm, req)
        : fetchPneerqAggregated(req);

    setIsLoadingReport(true);
    setIsPolling(false);
    setFormPayload(null);
    setAggregatedPayload(null);

    const wait = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const t = window.setTimeout(resolve, ms);
        signal.addEventListener(
          'abort',
          () => {
            window.clearTimeout(t);
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true }
        );
      });

    try {
      let res = await getter();
      const deadline = Date.now() + MAX_WAIT_MS;

      while (Date.now() < deadline) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

        if (res.status === 200 && !isPneerqProcessingPayload(res.data)) {
          if (reportMode === 'form') {
            setFormPayload(res.data as PneerqFormResultBody);
          } else {
            setAggregatedPayload(res.data as PneerqAggregatedResultBody);
          }
          return;
        }

        if (res.status !== 200 && res.status !== 202) {
          toast({
            title: 'Erro ao carregar PNEERQ',
            description: `Resposta HTTP ${res.status}.`,
            variant: 'destructive',
          });
          return;
        }

        setIsPolling(true);
        await wait(POLL_MS);
        res = await getter();
      }

      toast({
        title: 'Tempo esgotado',
        description: 'O relatório PNEERQ ainda não ficou pronto. Tente novamente em instantes.',
        variant: 'destructive',
      });
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      const err = e as { message?: string };
      toast({
        title: 'Erro ao carregar PNEERQ',
        description: err.message ?? 'Não foi possível obter os dados.',
        variant: 'destructive',
      });
    } finally {
      setIsPolling(false);
      setIsLoadingReport(false);
    }
  }, [
    hasMinimumFilters,
    stateParam,
    selectedMunicipality,
    selectedForm,
    selectedSchools,
    selectedGrades,
    selectedClasses,
    requestConfigForCity,
    reportMode,
    toast,
  ]);

  useEffect(() => {
    if (!hasMinimumFilters) {
      setFormPayload(null);
      setAggregatedPayload(null);
      abortRef.current?.abort();
      return;
    }
    fetchReport();
    return () => {
      abortRef.current?.abort();
    };
  }, [hasMinimumFilters, fetchReport]);

  const activePayload =
    reportMode === 'form' ? formPayload : aggregatedPayload;

  const eixos = useMemo(
    () => getPneerqEixos(reportMode, activePayload),
    [reportMode, activePayload]
  );

  const dashboard = useMemo(
    () => getPneerqDashboard(reportMode, activePayload),
    [reportMode, activePayload]
  );

  const totalRespostas =
    reportMode === 'form'
      ? formPayload?.totalRespostas
      : aggregatedPayload?.totalRespostas;

  const kpiCards = useMemo(() => {
    const fromDash = buildKpiCardsFromDashboard(dashboard, totalRespostas);
    if (fromDash.length > 1) return fromDash; // inclui o card total + KPIs do backend
    return buildKpiCardsFromEixos(eixos, totalRespostas);
  }, [dashboard, eixos, totalRespostas]);

  const matrixDashboardRows = useMemo(
    () => buildMatrixRowsFromDashboard(dashboard),
    [dashboard]
  );
  const matrixRows = useMemo(() => buildMatrixRowsFromEixos(eixos), [eixos]);

  const dashboardCharts = useMemo(() => buildDashboardCharts(dashboard), [dashboard]);
  const chartPair = useMemo(() => buildChartPairFromEixos(eixos), [eixos]);

  const narrative = useMemo(() => buildNarrativeParagraphs(eixos), [eixos]);

  return (
    <div className="container mx-auto p-6 space-y-6 print:max-w-none">
      <div className="space-y-1.5 print:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
          <Scale className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
          PNEERQ
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Painel de monitoramento de equidade racial (formulários socioeconômicos)
        </p>
      </div>

      <Card className="print:hidden">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filtros
              </CardTitle>
              <CardDescription>
                Mesmo fluxo do INSE x Avaliação: estado, município, formulário, avaliação e ao menos uma escola
              </CardDescription>
            </div>
            <Tabs
              value={reportMode}
              onValueChange={(v) => setReportMode(v as ReportMode)}
              className="w-full sm:w-auto"
            >
              <TabsList className="grid w-full grid-cols-2 sm:w-[340px]">
                <TabsTrigger value="form">Por formulário</TabsTrigger>
                <TabsTrigger value="aggregated">Consolidado</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            <div className="space-y-2 xl:col-span-1">
              <Label>Estado *</Label>
              <Select value={selectedState} onValueChange={setSelectedState} disabled={isLoadingFilters}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {states.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 xl:col-span-1">
              <Label>Município *</Label>
              <Select
                value={selectedMunicipality}
                onValueChange={setSelectedMunicipality}
                disabled={isLoadingFilters || selectedState === 'all'}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoadingFilters
                        ? 'Carregando...'
                        : municipalities.length === 0
                          ? 'Nenhum disponível'
                          : 'Selecione o município'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {municipalities.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 xl:col-span-1">
              <Label>Formulário *</Label>
              <Select
                value={selectedForm}
                onValueChange={setSelectedForm}
                disabled={isLoadingFilters || selectedState === 'all' || selectedMunicipality === 'all'}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoadingFilters
                        ? 'Carregando...'
                        : forms.length === 0 && selectedMunicipality !== 'all'
                          ? 'Nenhum formulário'
                          : 'Selecione o formulário'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {forms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="xl:col-span-1">
              <InseEvaluationPicker
                label="Avaliação *"
                estado={selectedState}
                municipio={selectedMunicipality}
                value={selectedAvaliacao}
                onChange={setSelectedAvaliacao}
                estadoLabel={states.find((s) => s.id === selectedState)?.name}
                municipioLabel={municipalities.find((m) => m.id === selectedMunicipality)?.name}
                disabled={isLoadingFilters || selectedState === 'all' || selectedMunicipality === 'all'}
                loading={isLoadingFilters}
                placeholder={
                  isLoadingFilters
                    ? 'Carregando...'
                    : avaliacoes.length === 0 && selectedMunicipality !== 'all'
                      ? 'Nenhuma avaliação'
                      : 'Selecione a avaliação'
                }
              />
            </div>
            <div className="space-y-2 xl:col-span-1">
              <Label>Escola(s) *</Label>
              <FormMultiSelect
                options={schools.map((s) => ({ id: s.id, name: s.name }))}
                selected={selectedSchools}
                onChange={setSelectedSchools}
                placeholder={
                  selectedSchools.length === 0 ? 'Selecione escolas' : `${selectedSchools.length} selecionada(s)`
                }
              />
            </div>
            <div className="space-y-2 xl:col-span-1">
              <Label>Série(s)</Label>
              <FormMultiSelect
                options={grades.map((g) => ({ id: g.id, name: g.name }))}
                selected={selectedGrades}
                onChange={setSelectedGrades}
                placeholder={
                  selectedGrades.length === 0 ? 'Todas' : `${selectedGrades.length} selecionada(s)`
                }
              />
            </div>
            <div className="space-y-2 xl:col-span-1">
              <Label>Turma(s)</Label>
              <FormMultiSelect
                options={classes.map((c) => ({ id: c.id, name: c.name }))}
                selected={selectedClasses}
                onChange={setSelectedClasses}
                placeholder={
                  selectedClasses.length === 0 ? 'Todas' : `${selectedClasses.length} selecionada(s)`
                }
              />
            </div>
          </div>

          {(isLoadingReport || isPolling) && (
            <div className="mt-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-sm text-primary">
                  {isPolling ? 'Gerando relatório PNEERQ em segundo plano…' : 'Carregando dados…'}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!hasMinimumFilters && (
        <p className="text-sm text-muted-foreground print:hidden">
          Selecione estado, município, formulário, avaliação e ao menos uma escola para ver o painel.
        </p>
      )}

      {hasMinimumFilters && !isLoadingReport && !isPolling && !activePayload && (
        <p className="text-sm text-muted-foreground">Nenhum dado disponível para os filtros atuais.</p>
      )}

      {activePayload && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {kpiCards.map((k, i) => (
              <Card key={`${k.title}-${i}`}>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs font-semibold uppercase tracking-wide">
                    {k.title}
                  </CardDescription>
                  <CardTitle className="text-2xl tabular-nums">{k.value}</CardTitle>
                  <p className="text-xs text-muted-foreground line-clamp-2">{k.hint}</p>
                </CardHeader>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                  {dashboardCharts.curriculo?.title ?? chartPair?.bar.title ?? 'Indicadores'}
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {dashboardCharts.curriculo && dashboardCharts.curriculo.data.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart
                      data={dashboardCharts.curriculo.data}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {dashboardCharts.curriculo.data.map((_, idx) => (
                          <Cell key={`c-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : chartPair && chartPair.bar.data.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={chartPair.bar.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {chartPair.bar.data.map((_, idx) => (
                          <Cell key={`c-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Sem série distribuída para gráfico de barras (envie `distribuicao` ou métricas na API).
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-chart-2 shrink-0" />
                  {dashboardCharts.expectativa?.title ?? chartPair?.pie.title ?? 'Composição'}
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {dashboardCharts.expectativa && dashboardCharts.expectativa.data.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dashboardCharts.expectativa.data}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={110}
                        paddingAngle={2}
                      >
                        {dashboardCharts.expectativa.data.map((_, idx) => (
                          <Cell key={`p-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : chartPair && chartPair.pie.data.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartPair.pie.data}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={110}
                        paddingAngle={2}
                      >
                        {chartPair.pie.data.map((_, idx) => (
                          <Cell key={`p-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Sem dados agrupados para o gráfico circular.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">
                Matriz de monitoramento PNEERQ
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Eixo PNEERQ</TableHead>
                    <TableHead>Referência</TableHead>
                    <TableHead>Indicador médio</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrixDashboardRows.length > 0 ? (
                    matrixDashboardRows.map((row: DashboardMatrixRowModel, idx) => {
                      const valor = row.saude;
                      const st = healthStatusFromValor(valor);
                      const status = row.status ?? st.label;
                      return (
                        <TableRow key={`${row.eixoNome}-${idx}`}>
                          <TableCell>
                            <span className="font-semibold block">{row.eixoNome}</span>
                            <span className="text-xs text-muted-foreground italic">{row.referencia}</span>
                          </TableCell>
                          <TableCell className="font-mono text-sm text-primary">{row.referencia}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-full max-w-[120px] bg-muted rounded-full h-2">
                                <div
                                  className="bg-primary h-2 rounded-full transition-all"
                                  style={{ width: `${Math.round(st.frac * 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {valor !== undefined ? valor.toFixed(1) : '—'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={status === 'ALERTA' ? 'outline' : status === 'CRÍTICO' ? 'destructive' : 'default'}
                              className={
                                status === 'ALERTA'
                                  ? 'border-amber-500 text-amber-800 bg-amber-50 dark:bg-amber-950/30'
                                  : ''
                              }
                            >
                              {status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : matrixRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground text-center py-8">
                        Nenhum eixo retornado pela API.
                      </TableCell>
                    </TableRow>
                  ) : (
                    matrixRows.map((row) => {
                      const st = healthStatusFromValor(row.valor);
                      return (
                        <TableRow key={row.eixoKey}>
                          <TableCell>
                            <span className="font-semibold block">{row.eixoNome}</span>
                            <span className="text-xs text-muted-foreground italic">{row.subtitle}</span>
                          </TableCell>
                          <TableCell className="font-mono text-sm text-primary">{row.fonteLabel}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-full max-w-[120px] bg-muted rounded-full h-2">
                                <div
                                  className="bg-primary h-2 rounded-full transition-all"
                                  style={{ width: `${Math.round(st.frac * 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {row.valor !== undefined ? row.valor.toFixed(1) : '—'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={st.variant === 'secondary' ? 'outline' : st.variant}
                              className={
                                st.label === 'ALERTA'
                                  ? 'border-amber-500 text-amber-800 bg-amber-50 dark:bg-amber-950/30'
                                  : ''
                              }
                            >
                              {st.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {reportMode === 'aggregated' &&
            aggregatedPayload?.formularios &&
            aggregatedPayload.formularios.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Formulários no consolidado</CardTitle>
                  <CardDescription>{aggregatedPayload.totalFormularios ?? aggregatedPayload.formularios.length} formulário(s)</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-1 list-disc pl-5">
                    {aggregatedPayload.formularios.map((f) => (
                      <li key={f.formId ?? f.formTitle}>
                        {f.formTitle ?? f.formId} {f.formType ? `(${f.formType})` : ''} —{' '}
                        {f.totalRespostas ?? 0} resposta(s)
                      </li>
                    ))}
                  </ul>
                  {aggregatedPayload.geradoEm && (
                    <p className="text-xs text-muted-foreground mt-3">Gerado em: {aggregatedPayload.geradoEm}</p>
                  )}
                </CardContent>
              </Card>
            )}

          <Card className="border-dashed bg-muted/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-primary" />
                Relatório de inteligência PNEERQ
              </CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6 text-sm leading-relaxed">
              <div>
                <h4 className="font-semibold mb-2">Análise situacional</h4>
                <p>{narrative.situacao}</p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Recomendação</h4>
                <p>{narrative.gestao}</p>
              </div>
              <div className="md:col-span-2 flex justify-end pt-2 border-t">
                <Button type="button" onClick={() => window.print()} className="gap-2">
                  <Printer className="h-4 w-4" />
                  Imprimir relatório
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
