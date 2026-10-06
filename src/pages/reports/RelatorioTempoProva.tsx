import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BarChart3,
  Clock,
  Filter,
  Loader2,
  RefreshCw,
  School,
  Smartphone,
  Timer,
  Users,
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
  type UserHierarchyContext,
} from '@/utils/userHierarchy';
import {
  getTempoProvaApiErrorMessage,
  TempoProvaApiService,
} from '@/services/reports/tempoProvaApi';
import type {
  TempoProvaFilterEntity,
  TempoProvaFilterTurma,
  TempoProvaOrigem,
  TempoProvaResumo,
} from '@/types/tempo-prova';

const ORIGEM_LABEL: Record<TempoProvaOrigem, string> = {
  medida: 'Online (tempo real)',
  estimada_mobile: 'Mobile (estimado)',
  estimada_fallback: 'Estimado (sem cronômetro)',
};

const ORIGEM_COLOR: Record<TempoProvaOrigem, string> = {
  medida: '#33658A',
  estimada_mobile: '#7B3FE4',
  estimada_fallback: '#94a3b8',
};

function formatSeconds(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const total = Math.max(0, Math.round(Number(value)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}min`;
  }
  return `${minutes}min ${String(seconds).padStart(2, '0')}s`;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

type FilterOption = TempoProvaFilterEntity;

export default function RelatorioTempoProva() {
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
  const [turmas, setTurmas] = useState<TempoProvaFilterTurma[]>([]);
  const [alunos, setAlunos] = useState<FilterOption[]>([]);

  const [selectedEstado, setSelectedEstado] = useState('all');
  const [selectedMunicipio, setSelectedMunicipio] = useState('all');
  const [selectedAvaliacoes, setSelectedAvaliacoes] = useState<string[]>([]);
  const [selectedEscolas, setSelectedEscolas] = useState<string[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<string[]>([]);
  const [selectedTurmas, setSelectedTurmas] = useState<string[]>([]);
  const [selectedAlunos, setSelectedAlunos] = useState<string[]>([]);

  const [loadingEstados, setLoadingEstados] = useState(false);
  const [loadingMunicipios, setLoadingMunicipios] = useState(false);
  const [loadingAvaliacoes, setLoadingAvaliacoes] = useState(false);
  const [loadingEscolasSeries, setLoadingEscolasSeries] = useState(false);
  const [loadingTurmas, setLoadingTurmas] = useState(false);
  const [loadingAlunos, setLoadingAlunos] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [report, setReport] = useState<TempoProvaResumo | null>(null);

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
  const alunoOptions = useMemo(
    () => alunos.map((a) => ({ id: a.id, name: a.nome })),
    [alunos]
  );

  const serieChartData = useMemo(
    () =>
      (report?.por_serie ?? [])
        .filter((row) => row.tempo_medio_por_questao_segundos != null)
        .map((row) => ({
          name: row.serie_nome || '—',
          segundos: Number(row.tempo_medio_por_questao_segundos),
        })),
    [report]
  );

  const escolaChartData = useMemo(
    () =>
      (report?.por_escola ?? [])
        .filter((row) => row.tempo_medio_por_questao_segundos != null)
        .slice(0, 12)
        .map((row) => ({
          name: row.escola_nome || '—',
          segundos: Number(row.tempo_medio_por_questao_segundos),
        })),
    [report]
  );

  const origemChartData = useMemo(
    () =>
      (report?.por_origem ?? []).map((row) => ({
        name: row.origem_label,
        value: row.sessoes,
        fill: ORIGEM_COLOR[row.origem],
      })),
    [report]
  );

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
            const opcoes = await TempoProvaApiService.getOpcoesFiltros();
            const matched = opcoes.estados.find(
              (s) =>
                s.id === context.municipality!.state ||
                s.nome.toLowerCase() === context.municipality!.state?.toLowerCase()
            );
            if (matched) setSelectedEstado(matched.id);
          } catch {
            /* silenciar */
          }
        }
        if (context.school) {
          setSelectedEscolas([context.school.id]);
        }
      } catch {
        toast({
          title: 'Aviso',
          description: 'Não foi possível carregar suas permissões.',
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
    TempoProvaApiService.getOpcoesFiltros()
      .then((data) => {
        if (!cancelled) setEstados(data.estados ?? []);
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
    TempoProvaApiService.getOpcoesFiltros({ estado: selectedEstado })
      .then((data) => {
        if (!cancelled) setMunicipios(data.municipios ?? []);
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
    TempoProvaApiService.getOpcoesFiltros({
      estado: selectedEstado,
      municipio: selectedMunicipio,
    })
      .then((data) => {
        if (!cancelled) {
          setAvaliacoesOpcoes(
            (data.avaliacoes ?? []).map((a) => ({
              id: a.id,
              titulo: a.titulo,
              disciplinas: a.disciplinas,
            }))
          );
        }
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
    if (selectedEstado === 'all' || selectedMunicipio === 'all' || selectedAvaliacoes.length === 0) {
      setEscolas([]);
      setSeries([]);
      return;
    }
    let cancelled = false;
    setLoadingEscolasSeries(true);
    TempoProvaApiService.getOpcoesFiltros({
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
      selectedAvaliacoes.length === 0 ||
      (selectedEscolas.length === 0 && selectedSeries.length === 0)
    ) {
      setTurmas([]);
      return;
    }
    let cancelled = false;
    setLoadingTurmas(true);
    TempoProvaApiService.getOpcoesFiltros({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      avaliacoes: selectedAvaliacoes,
      escolas: selectedEscolas,
      series: selectedSeries,
    })
      .then((data) => {
        if (cancelled) return;
        const next = data.turmas ?? [];
        setTurmas(next);
        setSelectedTurmas((prev) => prev.filter((id) => next.some((t) => t.id === id)));
      })
      .catch(() => {
        if (!cancelled) setTurmas([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTurmas(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEstado, selectedMunicipio, selectedAvaliacoes, selectedEscolas, selectedSeries]);

  useEffect(() => {
    if (selectedAvaliacoes.length === 0) {
      setAlunos([]);
      return;
    }
    let cancelled = false;
    setLoadingAlunos(true);
    TempoProvaApiService.getOpcoesFiltros({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      avaliacoes: selectedAvaliacoes,
      escolas: selectedEscolas,
      series: selectedSeries,
      turmas: selectedTurmas,
    })
      .then((data) => {
        if (cancelled) return;
        const next = data.alunos ?? [];
        setAlunos(next);
        setSelectedAlunos((prev) => prev.filter((id) => next.some((a) => a.id === id)));
      })
      .catch(() => {
        if (!cancelled) setAlunos([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAlunos(false);
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
    selectedTurmas,
  ]);

  const handleEstadoChange = (value: string) => {
    setSelectedEstado(value);
    setSelectedMunicipio('all');
    setSelectedAvaliacoes([]);
    setSelectedEscolas([]);
    setSelectedSeries([]);
    setSelectedTurmas([]);
    setSelectedAlunos([]);
    setReport(null);
  };

  const handleMunicipioChange = (value: string) => {
    setSelectedMunicipio(value);
    setSelectedAvaliacoes([]);
    setSelectedEscolas([]);
    setSelectedSeries([]);
    setSelectedTurmas([]);
    setSelectedAlunos([]);
    setReport(null);
  };

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      const data = await TempoProvaApiService.getResumo({
        estado: selectedEstado,
        municipio: selectedMunicipio,
        avaliacoes: selectedAvaliacoes,
        escolas: selectedEscolas,
        series: selectedSeries,
        turmas: selectedTurmas,
        alunos: selectedAlunos,
      });
      setReport(data);
      if (!data.metricas.sessoes) {
        toast({
          title: 'Sem sessões',
          description: 'Não há sessões de prova (web ou mobile) no escopo selecionado.',
        });
      }
    } catch (error) {
      toast({
        title: 'Erro ao gerar relatório',
        description: getTempoProvaApiErrorMessage(error, 'Não foi possível calcular o tempo de prova.'),
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  }, [
    canGenerate,
    selectedEstado,
    selectedMunicipio,
    selectedAvaliacoes,
    selectedEscolas,
    selectedSeries,
    selectedTurmas,
    selectedAlunos,
    toast,
  ]);

  const isLoadingFilters =
    isLoadingHierarchy ||
    loadingEstados ||
    loadingMunicipios ||
    loadingAvaliacoes ||
    loadingEscolasSeries ||
    loadingTurmas ||
    loadingAlunos;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Relatório de Tempo de Prova</h1>
        <p className="text-muted-foreground">
          Tempo médio por questão: provas online usam o cronômetro da sessão; provas do app mobile
          usam a estimativa de 1h30 (1º e 2º anos) ou 2h30 (3º ao 9º).
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
            Estado e município são obrigatórios. Avaliação, escola, série, turma e aluno são
            opcionais.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <Select value={selectedEstado} onValueChange={handleEstadoChange} disabled={loadingEstados}>
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

          <RelatorioConsolidadoItensPicker
            label="Avaliações"
            items={avaliacoesOpcoes}
            selected={selectedAvaliacoes}
            onChange={(ids) => {
              setSelectedAvaliacoes(ids);
              setSelectedEscolas([]);
              setSelectedSeries([]);
              setSelectedTurmas([]);
              setSelectedAlunos([]);
              setReport(null);
            }}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Escola(s)</label>
              <FormMultiSelect
                options={escolaOptions}
                selected={selectedEscolas}
                onChange={setSelectedEscolas}
                placeholder={
                  selectedAvaliacoes.length === 0
                    ? 'Selecione ao menos uma avaliação'
                    : selectedEscolas.length === 0
                      ? 'Todas as escolas'
                      : `${selectedEscolas.length} selecionada(s)`
                }
                className={
                  selectedAvaliacoes.length === 0 || loadingEscolasSeries || roleRequiresSpecificSchool
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
                onChange={setSelectedSeries}
                placeholder={
                  selectedAvaliacoes.length === 0
                    ? 'Selecione ao menos uma avaliação'
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
                onChange={setSelectedTurmas}
                placeholder={
                  selectedAvaliacoes.length === 0
                    ? 'Selecione ao menos uma avaliação'
                    : selectedTurmas.length === 0
                      ? 'Todas as turmas'
                      : `${selectedTurmas.length} selecionada(s)`
                }
                className={
                  selectedAvaliacoes.length === 0 || loadingTurmas
                    ? 'pointer-events-none opacity-60'
                    : undefined
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Aluno(s)</label>
              <FormMultiSelect
                options={alunoOptions}
                selected={selectedAlunos}
                onChange={setSelectedAlunos}
                placeholder={
                  selectedAvaliacoes.length === 0
                    ? 'Selecione ao menos uma avaliação'
                    : loadingAlunos
                      ? 'Carregando…'
                      : selectedAlunos.length === 0
                        ? 'Todos os alunos'
                        : `${selectedAlunos.length} selecionado(s)`
                }
                className={
                  selectedAvaliacoes.length === 0 || loadingAlunos
                    ? 'pointer-events-none opacity-60'
                    : undefined
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button onClick={() => void handleGenerate()} disabled={!canGenerate || generating || isLoadingFilters}>
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
            <p className="text-muted-foreground">Calculando tempos de prova…</p>
          </CardContent>
        </Card>
      )}

      {report && !generating && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Resultado</h2>
            <p className="text-sm text-muted-foreground">
              Indicadores, gráficos e detalhe por aluno do escopo selecionado.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  Sessões
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">{formatNumber(report.metricas.sessoes)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Alunos
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">{formatNumber(report.metricas.alunos)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Tempo médio
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatSeconds(report.metricas.tempo_medio_segundos)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Média por questão</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatSeconds(report.metricas.tempo_medio_por_questao_segundos)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Online (medido)
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatNumber(report.metricas.sessoes_online_medidas)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  Mobile (estimado)
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatNumber(report.metricas.sessoes_mobile_estimadas)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tempo médio por questão — séries</CardTitle>
                <CardDescription>Segundos médios por questão em cada série.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  {serieChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={serieChartData} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis fontSize={11} tickLine={false} axisLine={false} />
                        <Tooltip formatter={(value: number) => [formatSeconds(value), 'Por questão']} />
                        <Bar dataKey="segundos" fill="#7B3FE4" radius={[6, 6, 0, 0]} maxBarSize={56}>
                          <LabelList
                            dataKey="segundos"
                            position="top"
                            fontSize={11}
                            formatter={(v: number) => formatSeconds(v)}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-muted-foreground py-16 text-center">Sem dados por série.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Origem do tempo</CardTitle>
                <CardDescription>Sessões medidas no web vs estimadas no mobile.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  {origemChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={origemChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={88}
                          paddingAngle={2}
                        >
                          {origemChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => [formatNumber(value), 'Sessões']} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-muted-foreground py-16 text-center">Sem sessões no escopo.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <School className="h-4 w-4" />
                Tempo médio por questão — escolas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                {escolaChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={escolaChartData}
                      layout="vertical"
                      margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                      <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={140}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip formatter={(value: number) => [formatSeconds(value), 'Por questão']} />
                      <Bar dataKey="segundos" fill="#33658A" radius={[0, 6, 6, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground py-16 text-center">Sem dados por escola.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalhe por aluno</CardTitle>
              <CardDescription>
                Até 400 sessões. Tempo por questão = tempo da sessão (ou estimativa mobile) ÷ número
                de questões da prova.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aluno</TableHead>
                    <TableHead>Escola</TableHead>
                    <TableHead>Série / turma</TableHead>
                    <TableHead>Prova</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Questões</TableHead>
                    <TableHead className="text-right">Tempo total</TableHead>
                    <TableHead className="text-right">Por questão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report.alunos ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        Nenhuma sessão encontrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.alunos.map((row) => (
                      <TableRow key={row.sessao_id || `${row.aluno_id}-${row.prova_id}`}>
                        <TableCell className="font-medium">{row.aluno_nome}</TableCell>
                        <TableCell>{row.escola_nome || '—'}</TableCell>
                        <TableCell>
                          {[row.serie_nome, row.turma_nome].filter(Boolean).join(' · ') || '—'}
                        </TableCell>
                        <TableCell>{row.prova_titulo || '—'}</TableCell>
                        <TableCell>{ORIGEM_LABEL[row.origem] || row.origem}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.total_questions || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatSeconds(row.tempo_total_segundos)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatSeconds(row.tempo_por_questao_segundos)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
