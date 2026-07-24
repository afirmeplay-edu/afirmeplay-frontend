import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BarChart3,
  Download,
  Filter,
  Loader2,
  Percent,
  PieChart as PieChartIcon,
  RefreshCw,
  School,
  Users,
  Users2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FormMultiSelect } from '@/components/ui/form-multi-select';
import { RelatorioConsolidadoItensPicker } from '@/components/reports/relatorio-geral/RelatorioConsolidadoItensPicker';
import type { RelatorioConsolidadoItemOption } from '@/components/reports/relatorio-geral/RelatorioConsolidadoItensModal';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';
import {
  getUserHierarchyContext,
  getRestrictionMessage,
  validateReportAccess,
  type UserHierarchyContext,
} from '@/utils/userHierarchy';
import {
  getParticipationApiErrorMessage,
  ParticipationReportApiService,
} from '@/services/reports/participationReportApi';
import { generateParticipationReportPdf } from '@/services/reports/participationReportPdf';
import type {
  ParticipationFilterEntity,
  ParticipationFilterTurma,
  ParticipationResumo,
} from '@/types/participation-report';

const BAR_COLORS = {
  matriculados: '#33658A',
  avaliados: '#758E4F',
} as const;

const PIE_COLORS = {
  participaram: '#758E4F',
  naoParticiparam: '#94a3b8',
} as const;

type FilterOption = ParticipationFilterEntity;

function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR');
}

export default function RelatorioParticipacao() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const normalizedRole = (user?.role ?? '').toLowerCase();
  const roleRequiresSpecificSchool = ['diretor', 'coordenador', 'professor'].includes(normalizedRole);

  const [userHierarchyContext, setUserHierarchyContext] = useState<UserHierarchyContext | null>(null);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(true);

  const [estados, setEstados] = useState<FilterOption[]>([]);
  const [municipios, setMunicipios] = useState<FilterOption[]>([]);
  const [avaliacoesOpcoes, setAvaliacoesOpcoes] = useState<RelatorioConsolidadoItemOption[]>([]);
  const [escolas, setEscolas] = useState<FilterOption[]>([]);
  const [series, setSeries] = useState<FilterOption[]>([]);
  const [turmas, setTurmas] = useState<ParticipationFilterTurma[]>([]);

  const [selectedEstado, setSelectedEstado] = useState('all');
  const [selectedMunicipio, setSelectedMunicipio] = useState('all');
  const [selectedAvaliacoes, setSelectedAvaliacoes] = useState<string[]>([]);
  const [selectedEscolas, setSelectedEscolas] = useState<string[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<string[]>([]);
  const [selectedTurmas, setSelectedTurmas] = useState<string[]>([]);

  const [loadingEstados, setLoadingEstados] = useState(false);
  const [loadingMunicipios, setLoadingMunicipios] = useState(false);
  const [loadingAvaliacoes, setLoadingAvaliacoes] = useState(false);
  const [loadingEscolasSeries, setLoadingEscolasSeries] = useState(false);
  const [loadingTurmas, setLoadingTurmas] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const [report, setReport] = useState<ParticipationResumo | null>(null);

  const canGenerate = selectedEstado !== 'all' && selectedMunicipio !== 'all';

  const escolaOptions = useMemo(
    () => escolas.map((e) => ({ id: e.id, name: e.nome })),
    [escolas]
  );
  const serieOptions = useMemo(
    () => series.map((s) => ({ id: s.id, name: s.nome })),
    [series]
  );
  const turmaOptions = useMemo(
    () => turmas.map((t) => ({ id: t.id, name: t.label || t.nome })),
    [turmas]
  );

  const barChartData = useMemo(() => {
    if (!report) return [];
    return [
      {
        name: 'Matriculados',
        value: report.metricas.matriculados,
        fill: BAR_COLORS.matriculados,
      },
      {
        name: 'Avaliados',
        value: report.metricas.avaliados,
        fill: BAR_COLORS.avaliados,
      },
    ];
  }, [report]);

  const pieChartData = useMemo(() => {
    if (!report) return [];
    const avaliados = report.metricas.avaliados;
    const naoAvaliados = Math.max(0, report.metricas.matriculados - avaliados);
    return [
      { name: 'Participaram', value: avaliados, fill: PIE_COLORS.participaram },
      { name: 'Não participaram', value: naoAvaliados, fill: PIE_COLORS.naoParticiparam },
    ].filter((item) => item.value > 0);
  }, [report]);

  const pdfFilterLabels = useMemo(() => {
    const estadoNome = estados.find((s) => s.id === selectedEstado)?.nome || selectedEstado;
    const municipioNome =
      municipios.find((m) => m.id === selectedMunicipio)?.nome || selectedMunicipio;

    const avaliacoesLabel =
      selectedAvaliacoes.length === 0
        ? 'Todas'
        : selectedAvaliacoes
            .map((id) => avaliacoesOpcoes.find((a) => a.id === id)?.titulo || id)
            .join(', ');

    const escolasLabel =
      selectedEscolas.length === 0
        ? 'Todas'
        : selectedEscolas
            .map((id) => escolas.find((e) => e.id === id)?.nome || id)
            .join(', ');

    const seriesLabel =
      selectedSeries.length === 0
        ? 'Todas'
        : selectedSeries
            .map((id) => series.find((s) => s.id === id)?.nome || id)
            .join(', ');

    const turmasLabel =
      selectedTurmas.length === 0
        ? 'Todas'
        : selectedTurmas
            .map((id) => {
              const t = turmas.find((item) => item.id === id);
              return t?.label || t?.nome || id;
            })
            .join(', ');

    return {
      estado: estadoNome,
      municipio: municipioNome,
      avaliacoes: avaliacoesLabel,
      escolas: escolasLabel,
      series: seriesLabel,
      turmas: turmasLabel,
    };
  }, [
    estados,
    municipios,
    avaliacoesOpcoes,
    escolas,
    series,
    turmas,
    selectedEstado,
    selectedMunicipio,
    selectedAvaliacoes,
    selectedEscolas,
    selectedSeries,
    selectedTurmas,
  ]);

  useEffect(() => {
    if (user && !['admin', 'professor', 'diretor', 'coordenador', 'tecadm'].includes(user.role)) {
      toast({
        title: 'Acesso negado',
        description: 'Você não tem permissão para acessar esta página.',
        variant: 'destructive',
      });
      navigate('/app');
    }
  }, [user, navigate, toast]);

  useEffect(() => {
    const loadHierarchy = async () => {
      if (!user?.id || !user?.role) {
        setIsLoadingHierarchy(false);
        return;
      }
      try {
        setIsLoadingHierarchy(true);
        const context = await getUserHierarchyContext(user.id, user.role);
        setUserHierarchyContext(context);

        if (context.municipality) {
          setSelectedMunicipio(context.municipality.id);
          try {
            const opcoes = await ParticipationReportApiService.getOpcoesFiltros();
            const matched = opcoes.estados.find(
              (s) =>
                s.id === context.municipality!.state ||
                s.nome.toLowerCase() === context.municipality!.state?.toLowerCase()
            );
            if (matched) setSelectedEstado(matched.id);
          } catch {
            // silenciar
          }
        }
        if (context.school) {
          setSelectedEscolas([context.school.id]);
        }
      } catch {
        toast({
          title: 'Aviso',
          description: 'Não foi possível carregar suas permissões. Algumas funcionalidades podem estar limitadas.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingHierarchy(false);
      }
    };
    void loadHierarchy();
  }, [user?.id, user?.role, toast]);

  useEffect(() => {
    let cancelled = false;
    setLoadingEstados(true);
    ParticipationReportApiService.getOpcoesFiltros()
      .then((data) => {
        if (cancelled) return;
        setEstados(data.estados ?? []);
      })
      .catch(() => {
        if (!cancelled) setEstados([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingEstados(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedEstado === 'all') {
      setMunicipios([]);
      return;
    }
    let cancelled = false;
    setLoadingMunicipios(true);
    ParticipationReportApiService.getOpcoesFiltros({ estado: selectedEstado })
      .then((data) => {
        if (cancelled) return;
        setMunicipios(data.municipios ?? []);
      })
      .catch(() => {
        if (!cancelled) setMunicipios([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMunicipios(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEstado]);

  useEffect(() => {
    if (selectedEstado === 'all' || selectedMunicipio === 'all') {
      setAvaliacoesOpcoes([]);
      return;
    }
    let cancelled = false;
    setLoadingAvaliacoes(true);
    ParticipationReportApiService.getOpcoesFiltros({
      estado: selectedEstado,
      municipio: selectedMunicipio,
    })
      .then((data) => {
        if (cancelled) return;
        setAvaliacoesOpcoes(
          (data.avaliacoes ?? []).map((a) => ({
            id: a.id,
            titulo: a.titulo,
            disciplinas: a.disciplinas,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setAvaliacoesOpcoes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAvaliacoes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEstado, selectedMunicipio]);

  useEffect(() => {
    if (
      selectedEstado === 'all' ||
      selectedMunicipio === 'all' ||
      selectedAvaliacoes.length === 0
    ) {
      setEscolas([]);
      setSeries([]);
      return;
    }
    let cancelled = false;
    setLoadingEscolasSeries(true);
    ParticipationReportApiService.getOpcoesFiltros({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      avaliacoes: selectedAvaliacoes,
    })
      .then((data) => {
        if (cancelled) return;
        const nextEscolas = data.escolas ?? [];
        const nextSeries = data.series ?? [];
        setEscolas(nextEscolas);
        setSeries(nextSeries);

        const schoolId = userHierarchyContext?.school?.id;
        if (roleRequiresSpecificSchool && schoolId) {
          setSelectedEscolas([schoolId]);
        } else {
          setSelectedEscolas((prev) => prev.filter((id) => nextEscolas.some((e) => e.id === id)));
        }
        setSelectedSeries((prev) => prev.filter((id) => nextSeries.some((s) => s.id === id)));
      })
      .catch(() => {
        if (!cancelled) {
          setEscolas([]);
          setSeries([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEscolasSeries(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    selectedEstado,
    selectedMunicipio,
    selectedAvaliacoes,
    roleRequiresSpecificSchool,
    userHierarchyContext?.school?.id,
  ]);

  useEffect(() => {
    if (
      selectedEstado === 'all' ||
      selectedMunicipio === 'all' ||
      selectedAvaliacoes.length === 0 ||
      (selectedEscolas.length === 0 && selectedSeries.length === 0)
    ) {
      setTurmas([]);
      setSelectedTurmas([]);
      return;
    }
    let cancelled = false;
    setLoadingTurmas(true);
    ParticipationReportApiService.getOpcoesFiltros({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      avaliacoes: selectedAvaliacoes,
      escolas: selectedEscolas.length > 0 ? selectedEscolas : undefined,
      series: selectedSeries.length > 0 ? selectedSeries : undefined,
    })
      .then((data) => {
        if (cancelled) return;
        const nextTurmas = data.turmas ?? [];
        setTurmas(nextTurmas);
        setSelectedTurmas((prev) => prev.filter((id) => nextTurmas.some((t) => t.id === id)));
      })
      .catch(() => {
        if (!cancelled) {
          setTurmas([]);
          setSelectedTurmas([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTurmas(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    selectedEstado,
    selectedMunicipio,
    selectedAvaliacoes,
    selectedEscolas,
    selectedSeries,
  ]);

  const clearDownstreamFromEstado = useCallback(() => {
    setSelectedMunicipio('all');
    setSelectedAvaliacoes([]);
    setSelectedEscolas(roleRequiresSpecificSchool && userHierarchyContext?.school?.id
      ? [userHierarchyContext.school.id]
      : []);
    setSelectedSeries([]);
    setSelectedTurmas([]);
    setReport(null);
  }, [roleRequiresSpecificSchool, userHierarchyContext?.school?.id]);

  const handleEstadoChange = useCallback(
    (value: string) => {
      setSelectedEstado(value);
      clearDownstreamFromEstado();
    },
    [clearDownstreamFromEstado]
  );

  const handleMunicipioChange = useCallback(
    (value: string) => {
      setSelectedMunicipio(value);
      setSelectedAvaliacoes([]);
      setSelectedEscolas(
        roleRequiresSpecificSchool && userHierarchyContext?.school?.id
          ? [userHierarchyContext.school.id]
          : []
      );
      setSelectedSeries([]);
      setSelectedTurmas([]);
      setReport(null);
    },
    [roleRequiresSpecificSchool, userHierarchyContext?.school?.id]
  );

  const handleAvaliacoesChange = useCallback(
    (ids: string[]) => {
      setSelectedAvaliacoes(ids);
      setSelectedEscolas(
        roleRequiresSpecificSchool && userHierarchyContext?.school?.id
          ? [userHierarchyContext.school.id]
          : []
      );
      setSelectedSeries([]);
      setSelectedTurmas([]);
      setReport(null);
    },
    [roleRequiresSpecificSchool, userHierarchyContext?.school?.id]
  );

  const handleEscolasChange = useCallback(
    (ids: string[]) => {
      if (roleRequiresSpecificSchool && userHierarchyContext?.school?.id) {
        setSelectedEscolas([userHierarchyContext.school.id]);
      } else {
        setSelectedEscolas(ids);
      }
      setSelectedTurmas([]);
      setReport(null);
    },
    [roleRequiresSpecificSchool, userHierarchyContext?.school?.id]
  );

  const handleSeriesChange = useCallback((ids: string[]) => {
    setSelectedSeries(ids);
    setSelectedTurmas([]);
    setReport(null);
  }, []);

  const handleTurmasChange = useCallback((ids: string[]) => {
    setSelectedTurmas(ids);
    setReport(null);
  }, []);

  const handleGenerate = async () => {
    if (!canGenerate) return;

    if (userHierarchyContext && user?.role) {
      const validation = validateReportAccess(
        user.role,
        {
          state: selectedEstado,
          municipality: selectedMunicipio,
          school:
            selectedEscolas.length === 1
              ? selectedEscolas[0]
              : roleRequiresSpecificSchool
                ? userHierarchyContext.school?.id
                : undefined,
        },
        userHierarchyContext
      );
      if (!validation.isValid) {
        toast({
          title: 'Acesso negado',
          description: validation.reason || 'Você não tem permissão para gerar este relatório.',
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      setGenerating(true);
      const data = await ParticipationReportApiService.getResumo({
        estado: selectedEstado,
        municipio: selectedMunicipio,
        // Contrato: omitir opcionais = todas
        avaliacoes: selectedAvaliacoes.length > 0 ? selectedAvaliacoes : undefined,
        escolas: selectedEscolas.length > 0 ? selectedEscolas : undefined,
        series: selectedSeries.length > 0 ? selectedSeries : undefined,
        turmas: selectedTurmas.length > 0 ? selectedTurmas : undefined,
      });
      setReport(data);
      if (!data.por_escola?.length && !data.por_turma?.length && data.metricas.matriculados === 0) {
        toast({
          title: 'Relatório gerado',
          description: 'Não há dados de participação no escopo selecionado.',
        });
      }
    } catch (error) {
      toast({
        title: 'Erro ao gerar relatório',
        description: getParticipationApiErrorMessage(
          error,
          'Não foi possível gerar o relatório. Tente novamente.'
        ),
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!report) return;

    if (userHierarchyContext && user?.role) {
      const validation = validateReportAccess(
        user.role,
        {
          state: selectedEstado,
          municipality: selectedMunicipio,
          school:
            selectedEscolas.length === 1
              ? selectedEscolas[0]
              : roleRequiresSpecificSchool
                ? userHierarchyContext.school?.id
                : undefined,
        },
        userHierarchyContext
      );
      if (!validation.isValid) {
        toast({
          title: 'Acesso negado',
          description: validation.reason || 'Você não tem permissão para exportar este relatório.',
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      setGeneratingPdf(true);
      await generateParticipationReportPdf({
        report,
        labels: pdfFilterLabels,
        cityId: selectedMunicipio !== 'all' ? selectedMunicipio : null,
      });
      toast({
        title: 'Relatório baixado',
        description: 'O PDF do Relatório de Participação foi salvo no seu dispositivo.',
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Erro ao gerar PDF',
        description: 'Não foi possível gerar o PDF. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const isLoadingFilters =
    isLoadingHierarchy ||
    loadingEstados ||
    loadingMunicipios ||
    loadingAvaliacoes ||
    loadingEscolasSeries ||
    loadingTurmas;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Relatório de Participação</h1>
        <p className="text-muted-foreground">
          Acompanhe matriculados, avaliados e o percentual de participação por escola e turma.
        </p>
        {user?.role && (
          <p className="text-sm text-blue-600 dark:text-blue-400">{getRestrictionMessage(user.role)}</p>
        )}
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
          <CardDescription>
            Estado e município são obrigatórios. Avaliações, escolas, séries e turmas são opcionais
            (vazio = todas). Escolas e séries só carregam após selecionar ao menos uma avaliação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <Select
                value={selectedEstado}
                onValueChange={handleEstadoChange}
                disabled={loadingEstados}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Selecione…</SelectItem>
                  {estados.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Município</label>
              <Select
                value={selectedMunicipio}
                onValueChange={handleMunicipioChange}
                disabled={selectedEstado === 'all' || loadingMunicipios}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o município" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Selecione…</SelectItem>
                  {municipios.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <RelatorioConsolidadoItensPicker
              label="Avaliações"
              items={avaliacoesOpcoes}
              selected={selectedAvaliacoes}
              onChange={handleAvaliacoesChange}
              disabled={selectedMunicipio === 'all'}
              loading={loadingAvaliacoes}
              placeholder={
                selectedMunicipio === 'all'
                  ? 'Selecione o município primeiro'
                  : 'Todas as avaliações (ou selecione)'
              }
              modalTitle="Selecionar avaliações"
              entityLabel="avaliações"
              emptyMessage="Nenhuma avaliação encontrada para os filtros."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Escola(s)</label>
              <FormMultiSelect
                options={escolaOptions}
                selected={selectedEscolas}
                onChange={handleEscolasChange}
                placeholder={
                  selectedAvaliacoes.length === 0
                    ? 'Selecione ao menos uma avaliação'
                    : loadingEscolasSeries
                      ? 'Carregando…'
                      : selectedEscolas.length === 0
                        ? 'Todas as escolas'
                        : `${selectedEscolas.length} selecionada(s)`
                }
                className={
                  selectedAvaliacoes.length === 0 ||
                  loadingEscolasSeries ||
                  roleRequiresSpecificSchool
                    ? 'pointer-events-none opacity-60'
                    : undefined
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Série(s)</label>
              <FormMultiSelect
                options={serieOptions}
                selected={selectedSeries}
                onChange={handleSeriesChange}
                placeholder={
                  selectedAvaliacoes.length === 0
                    ? 'Selecione ao menos uma avaliação'
                    : loadingEscolasSeries
                      ? 'Carregando…'
                      : selectedSeries.length === 0
                        ? 'Todas as séries'
                        : `${selectedSeries.length} selecionada(s)`
                }
                className={
                  selectedAvaliacoes.length === 0 || loadingEscolasSeries
                    ? 'pointer-events-none opacity-60'
                    : undefined
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Turma(s)</label>
              <FormMultiSelect
                options={turmaOptions}
                selected={selectedTurmas}
                onChange={handleTurmasChange}
                placeholder={
                  selectedAvaliacoes.length === 0
                    ? 'Selecione ao menos uma avaliação'
                    : selectedEscolas.length === 0 && selectedSeries.length === 0
                      ? 'Selecione escolas e/ou séries'
                      : loadingTurmas
                        ? 'Carregando…'
                        : selectedTurmas.length === 0
                          ? 'Todas as turmas'
                          : `${selectedTurmas.length} selecionada(s)`
                }
                className={
                  selectedAvaliacoes.length === 0 ||
                  (selectedEscolas.length === 0 && selectedSeries.length === 0) ||
                  loadingTurmas
                    ? 'pointer-events-none opacity-60'
                    : undefined
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button onClick={handleGenerate} disabled={!canGenerate || generating || isLoadingFilters}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Gerando relatório…
                </>
              ) : (
                <>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Gerar relatório
                </>
              )}
            </Button>
            {report && (
              <Button variant="outline" onClick={() => setReport(null)} disabled={generating}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Limpar resultado
              </Button>
            )}
          </div>

          {!canGenerate && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Selecione estado e município para gerar o relatório.
            </p>
          )}
        </CardContent>
      </Card>

      {generating && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Carregando dados de participação…</p>
          </CardContent>
        </Card>
      )}

      {report && !generating && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Resultado</h2>
              <p className="text-sm text-muted-foreground">
                Indicadores, gráficos e tabelas do escopo selecionado.
              </p>
            </div>
            <Button
              onClick={handleDownloadPdf}
              disabled={generatingPdf}
              className="flex items-center gap-2"
            >
              {generatingPdf ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Baixando relatório...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Baixar relatório
                </>
              )}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Matriculados
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatNumber(report.metricas.matriculados)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Users2 className="h-4 w-4" />
                  Avaliados
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatNumber(report.metricas.avaliados)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <School className="h-4 w-4" />
                  Total de turmas
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatNumber(report.metricas.total_turmas)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  Participação
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatPercent(report.metricas.percentual_participacao)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Matriculados × Avaliados
                </CardTitle>
                <CardDescription>Comparativo quantitativo do escopo selecionado.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barChartData} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        formatter={(value: number) => [formatNumber(value), 'Quantidade']}
                        contentStyle={{ borderRadius: 8 }}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={72}>
                        {barChartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                        <LabelList
                          dataKey="value"
                          position="top"
                          fontSize={12}
                          fontWeight={600}
                          formatter={(v: number) => formatNumber(v)}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4" />
                  Taxa de participação
                </CardTitle>
                <CardDescription>
                  {formatPercent(report.metricas.percentual_participacao)} do total de matriculados.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72 relative">
                  {pieChartData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieChartData}
                            cx="50%"
                            cy="46%"
                            innerRadius={68}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {pieChartData.map((entry) => (
                              <Cell key={entry.name} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number, name: string) => [formatNumber(value), name]}
                            contentStyle={{ borderRadius: 8 }}
                          />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value) => (
                              <span className="text-sm text-foreground">{value}</span>
                            )}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center -translate-y-4">
                        <div className="text-center">
                          <p className="text-2xl font-bold tabular-nums leading-none">
                            {formatPercent(report.metricas.percentual_participacao)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">participação</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-16">
                      Sem dados para o gráfico de participação.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por escola</CardTitle>
              <CardDescription>Participação consolidada por unidade escolar.</CardDescription>
            </CardHeader>
            <CardContent>
              {report.por_escola.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma escola no escopo.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Escola</TableHead>
                      <TableHead className="text-right">Matriculados</TableHead>
                      <TableHead className="text-right">Avaliados</TableHead>
                      <TableHead className="text-right">Turmas</TableHead>
                      <TableHead className="text-right">Participação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.por_escola.map((row) => (
                      <TableRow key={row.escola_id}>
                        <TableCell className="font-medium">{row.escola_nome}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.matriculados)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.avaliados)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.total_turmas)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPercent(row.percentual_participacao)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por turma</CardTitle>
              <CardDescription>Detalhamento de participação por turma.</CardDescription>
            </CardHeader>
            <CardContent>
              {report.por_turma.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma turma no escopo.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Turma</TableHead>
                      <TableHead className="text-right">Matriculados</TableHead>
                      <TableHead className="text-right">Avaliados</TableHead>
                      <TableHead className="text-right">Participação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.por_turma.map((row) => (
                      <TableRow key={row.turma_id}>
                        <TableCell className="font-medium">{row.turma_nome}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.matriculados)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.avaliados)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPercent(row.percentual_participacao)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
