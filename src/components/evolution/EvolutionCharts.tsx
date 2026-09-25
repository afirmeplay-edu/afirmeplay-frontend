import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EvolutionData } from './EvolutionChart';
import type { EvaluationInfo, EvolutionCompareScopeFilters } from '@/services/evaluation/evaluationComparisonApi';
import { EvolutionEvaluationsScopeList } from './EvolutionEvaluationsScopeList';
import { EvolutionGroupsView } from './EvolutionGroupsView';
import { EvolutionComboChart } from '@/components/evolution/EvolutionComboChart';
import {
  getEvolutionColorByIndex,
  getEvolutionProficiencyColorByIndex,
  getProficiencyDomain,
  getSubjectColors,
  getLevelColor,
} from '@/utils/evolution/evolutionChartColors';
import {
  formatEvolutionMetric,
  formatSignedEvolutionPercent,
} from '@/utils/evolution/formatEvolutionMetric';
import {
  mergeEvolutionRows,
  readEvolutionComboSeries,
  readGeneralGradeStats,
  rowHasAllEvaluations,
  type EvolutionComboSeries,
} from '@/utils/evolution/evolutionSeries';
import {
  TrendingUp,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Activity,
  Target,
  Calendar,
  Users,
  ChevronDown,
  ChevronUp,
  Building2,
} from 'lucide-react';
import { Eye, EyeOff } from 'lucide-react';

export interface ProcessedEvolutionData {
  /** "Geral" por etapa (notas) */
  generalData: EvolutionData[];
  /** "Geral" por etapa (proficiência) */
  proficiencyData: EvolutionData[];
  /** "Classificação/Aprovação" geral */
  approvalData: EvolutionData[];
  /** por disciplina (notas) */
  subjectData: Record<string, EvolutionData[]>;
  /** por disciplina (proficiência) */
  subjectProficiencyData: Record<string, EvolutionData[]>;
  /** classificação por disciplina */
  classificationData: Record<string, EvolutionData[]>;
  /** dados por nível de proficiência */
  levelsData: Record<string, EvolutionData[]>;
  /** nomes das avaliações para exibição */
  evaluationNames: string[];
  /** metadados completos (série, turmas, datas) */
  evaluations: EvaluationInfo[];
}

interface EvolutionChartsProps {
  data: ProcessedEvolutionData;
  isLoading?: boolean;
  /** Rótulo plural do instrumento (avaliações / gabaritos). */
  instrumentLabel?: string;
  /** Se true, exibe apenas o conteúdo da aba "Visão Geral" (sem abas Por Disciplina / Por Níveis) */
  onlyOverviewTab?: boolean;
  /** Lista de avaliações só com o nome (sem data/série/turmas). */
  scopeDisplayMode?: 'full' | 'title-only';
  /** Aba inicial (hub Escola/Série/Turma abre em "groups"). */
  defaultTab?: 'general' | 'subjects' | 'levels' | 'groups';
  /** IDs das provas para a sub-aba de evolução por grupos. */
  groupTestIds?: string[];
  groupScopeFilters?: EvolutionCompareScopeFilters;
  groupRefreshKey?: string;
}


function EvolutionChartPanel({
  title,
  icon: Icon,
  collapsed,
  onToggle,
  metric,
  series,
  yDomain,
  yAxisName,
  seriesName,
  controls,
}: {
  title: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  collapsed: boolean;
  onToggle: () => void;
  metric: 'nota' | 'proficiencia' | 'quantidade';
  series: EvolutionComboSeries;
  yDomain?: [number, number];
  yAxisName?: string;
  seriesName: string;
  controls: React.ReactNode;
}) {
  if (series.values.length === 0) return null;
  return (
    <Card className="border border-border">
      <CardHeader className="bg-muted border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Icon className="h-5 w-5 text-muted-foreground" />
            {title}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-8 w-8 p-0"
            aria-label={collapsed ? 'Mostrar gráfico' : 'Ocultar gráfico'}
          >
            {collapsed ? (
              <ChevronDown className="h-4 w-4 transition-transform duration-300" />
            ) : (
              <ChevronUp className="h-4 w-4 transition-transform duration-300" />
            )}
          </Button>
        </div>
      </CardHeader>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          collapsed ? 'max-h-0' : 'max-h-[760px]'
        }`}
      >
        <CardContent className="p-6">
          <EvolutionComboChart
            mode="screen"
            metric={metric}
            evaluationNames={series.evaluationNames}
            values={series.values}
            variations={series.variations}
            colors={series.colors}
            yDomain={yDomain}
            yAxisName={yAxisName}
            seriesName={seriesName}
          />
          {controls}
        </CardContent>
      </div>
    </Card>
  );
}


export function EvolutionCharts({
  data,
  isLoading = false,
  onlyOverviewTab = false,
  instrumentLabel = 'avaliações',
  scopeDisplayMode = 'full',
  defaultTab = 'general',
  groupTestIds,
  groupScopeFilters,
  groupRefreshKey,
}: EvolutionChartsProps) {
  const showGroupsTab = Boolean(groupTestIds && groupTestIds.length >= 2 && groupScopeFilters);
  const initialTab =
    defaultTab === 'groups' && !showGroupsTab ? 'general' : defaultTab;
  const [activeTab, setActiveTab] = useState<'general' | 'subjects' | 'levels' | 'groups'>(initialTab);
  const [hiddenByChart, setHiddenByChart] = useState<Record<string, Set<string>>>({});
  const [collapsedCharts, setCollapsedCharts] = useState<Set<string>>(new Set());

  const getHidden = useCallback((chartId: string): Set<string> => {
    return hiddenByChart[chartId] ?? new Set<string>();
  }, [hiddenByChart]);

  function handleToggle(chartId: string, name: string) {
    setHiddenByChart(prev => {
      const current = new Set(prev[chartId] ?? new Set<string>());
      if (current.has(name)) current.delete(name); else current.add(name);
      return { ...prev, [chartId]: current };
    });
  }

  function handleShowAll(chartId: string) {
    setHiddenByChart(prev => ({ ...prev, [chartId]: new Set() }));
  }

  function handleHideAll(chartId: string, names: string[]) {
    setHiddenByChart(prev => ({ ...prev, [chartId]: new Set(names) }));
  }

  function toggleChartCollapse(chartId: string) {
    setCollapsedCharts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(chartId)) {
        newSet.delete(chartId);
      } else {
        newSet.add(chartId);
      }
      return newSet;
    });
  }

  function isChartCollapsed(chartId: string): boolean {
    return collapsedCharts.has(chartId);
  }

  const generalStats = useMemo(
    () => readGeneralGradeStats(data.generalData || []),
    [data.generalData]
  );

  const generalNotaSeries = useMemo(() => {
    const merged = mergeEvolutionRows(data.generalData || []);
    return readEvolutionComboSeries(
      merged[0],
      data.evaluationNames,
      getEvolutionColorByIndex,
      getHidden('general-nota')
    );
  }, [data, getHidden]);

  const generalProfSeries = useMemo(() => {
    const merged = mergeEvolutionRows(data.proficiencyData || []);
    return readEvolutionComboSeries(
      merged[0],
      data.evaluationNames,
      getEvolutionProficiencyColorByIndex,
      getHidden('general-prof')
    );
  }, [data, getHidden]);

  function seriesFor(
    rows: EvolutionData[] | undefined,
    chartId: string,
    colorAt: (index: number) => string
  ): EvolutionComboSeries {
    const merged = mergeEvolutionRows(rows || []);
    return readEvolutionComboSeries(merged[0], data.evaluationNames, colorAt, getHidden(chartId));
  }

  function visibilityControls(chartId: string, names: string[]) {
    const hidden = getHidden(chartId);
    if (names.length === 0) return null;
    return (
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {names.map((name) => {
          const isHidden = hidden.has(name);
          return (
            <button
              key={`${chartId}-${name}`}
              type="button"
              onClick={() => handleToggle(chartId, name)}
              className={`max-w-[14rem] px-2 py-0.5 text-[11px] rounded-full border transition-colors inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                isHidden
                  ? 'bg-card text-muted-foreground border-border'
                  : 'bg-card text-foreground border-border hover:border-border/80'
              }`}
              aria-pressed={!isHidden}
              aria-label={`Alternar visibilidade da avaliação ${name}`}
              title={isHidden ? `Mostrar ${name}` : `Ocultar ${name}`}
            >
              {isHidden ? <EyeOff className="h-3 w-3 shrink-0" /> : <Eye className="h-3 w-3 shrink-0" />}
              <span className="leading-none truncate">{name}</span>
            </button>
          );
        })}
        <span className="mx-1 text-border text-xs select-none">|</span>
        <button
          type="button"
          onClick={() => handleHideAll(chartId, names)}
          className="px-2 py-0.5 text-[11px] rounded-full border bg-card text-muted-foreground border-border hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-offset-1 inline-flex items-center gap-1"
          aria-label="Ocultar todas as avaliações deste gráfico"
        >
          <EyeOff className="h-3 w-3" /> Ocultar todas
        </button>
        <button
          type="button"
          onClick={() => handleShowAll(chartId)}
          className="px-2 py-0.5 text-[11px] rounded-full border bg-card text-foreground border-border hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-offset-1 inline-flex items-center gap-1"
          aria-label="Mostrar todas as avaliações deste gráfico"
        >
          <Eye className="h-3 w-3" /> Mostrar todas
        </button>
      </div>
    );
  }

  const subjectsWithAllEvaluations = Object.entries(data.subjectData || {}).filter(([, rows]) =>
    rowHasAllEvaluations(mergeEvolutionRows(rows)[0], data.evaluationNames.length)
  );
  const levelsWithAllEvaluations = Object.entries(data.levelsData || {}).filter(([, rows]) =>
    rowHasAllEvaluations(mergeEvolutionRows(rows)[0], data.evaluationNames.length)
  );

  if (isLoading) {
    return (
      <Card className="border border-border shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mb-4">
            <Activity className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Processando Dados</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Gerando análise de evolução das avaliações...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || (!data.generalData?.length && !Object.keys(data.subjectData || {}).length)) {
    if (showGroupsTab && groupTestIds && groupScopeFilters) {
      return (
        <Tabs value="groups" className="w-full">
          <TabsList className="grid w-full grid-cols-1 max-w-md">
            <TabsTrigger value="groups" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Escola · Série · Turma
            </TabsTrigger>
          </TabsList>
          <TabsContent value="groups" className="space-y-6">
            <EvolutionGroupsView
              testIds={groupTestIds}
              scopeFilters={groupScopeFilters}
              refreshKey={groupRefreshKey}
            />
          </TabsContent>
        </Tabs>
      );
    }
    return (
      <Card className="border border-border shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mb-4">
            <TrendingUp className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Dados Insuficientes</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Não há dados suficientes para gerar a análise de evolução.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (generalNotaSeries.values.length === 0 && !showGroupsTab) {
    return (
      <Card className="border border-border shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mb-4">
            <Activity className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Sem Dados</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Não há dados disponíveis para o período selecionado.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
      {!onlyOverviewTab && (
        <TabsList className={`grid w-full ${showGroupsTab ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3'}`}>
          <TabsTrigger value="general" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="subjects" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Por Disciplina
          </TabsTrigger>
          <TabsTrigger value="levels" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Por Níveis
          </TabsTrigger>
          {showGroupsTab && (
            <TabsTrigger value="groups" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Escola · Série · Turma
            </TabsTrigger>
          )}
        </TabsList>
      )}

      {/* VISÃO GERAL */}
      <TabsContent value="general" className="space-y-6">
        {/* Header com controles */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">
              <Activity className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Análise de Evolução - Geral</h3>
              <p className="text-sm text-muted-foreground">
                Comparação entre avaliações selecionadas
              </p>
            </div>
          </div>
          {/* Controles globais removidos: visibilidade agora é por gráfico */}
        </div>

        {data.evaluations?.length > 0 && (
          <EvolutionEvaluationsScopeList
            evaluations={data.evaluations}
            instrumentLabel={instrumentLabel}
            variant="screen"
            displayMode={scopeDisplayMode}
          />
        )}

        {/* Resumo Estatístico */}
        {generalStats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Média Geral</span>
                </div>
                <p className="text-2xl font-semibold text-foreground">
                  {formatEvolutionMetric(generalStats.media, 'nota')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">pontos</p>
              </CardContent>
            </Card>

            <Card className="border border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  {generalStats.tendencia === 'up' ? (
                    <ArrowUpRight className="w-4 h-4 text-green-600 dark:text-green-400" />
                  ) : generalStats.tendencia === 'down' ? (
                    <ArrowDownRight className="w-4 h-4 text-red-600 dark:text-red-400" />
                  ) : (
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium text-muted-foreground">Variação</span>
                </div>
                <p className={`text-2xl font-semibold ${
                  generalStats.variacaoTotal != null && generalStats.variacaoTotal > 0
                    ? 'text-green-600 dark:text-green-400'
                    : generalStats.variacaoTotal != null && generalStats.variacaoTotal < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-foreground'
                }`}>
                  {formatSignedEvolutionPercent(generalStats.variacaoTotal)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">período</p>
              </CardContent>
            </Card>

            <Card className="border border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Total de Avaliações</span>
                </div>
                <p className="text-2xl font-semibold text-foreground">{generalStats.totalAvaliacoes}</p>
                <p className="text-xs text-muted-foreground mt-1">avaliações</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Gráficos Detalhados */}
        <div className="grid grid-cols-1 gap-6">
          <EvolutionChartPanel
            title="Nota Geral"
            icon={TrendingUp}
            collapsed={isChartCollapsed('general-nota')}
            onToggle={() => toggleChartCollapse('general-nota')}
            metric="nota"
            series={generalNotaSeries}
            yDomain={[0, 10]}
            seriesName="Nota"
            controls={visibilityControls('general-nota', data.evaluationNames)}
          />
          <EvolutionChartPanel
            title="Proficiência Geral"
            icon={Target}
            collapsed={isChartCollapsed('general-prof')}
            onToggle={() => toggleChartCollapse('general-prof')}
            metric="proficiencia"
            series={generalProfSeries}
            yDomain={[0, 425]}
            yAxisName="Proficiência"
            seriesName="Proficiência"
            controls={visibilityControls('general-prof', data.evaluationNames)}
          />
        </div>
      </TabsContent>

      {!onlyOverviewTab && (
        <>
      {/* POR DISCIPLINA */}
      <TabsContent value="subjects" className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted rounded-lg">
            <BookOpen className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Análise por Disciplina</h3>
            <p className="text-sm text-muted-foreground">
              Comparação detalhada por disciplina
            </p>
          </div>
        </div>

        {Object.keys(data.subjectData || {}).length === 0 ? (
          <Card className="border border-border">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mb-4">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma Disciplina Encontrada</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">Não há dados de disciplinas para exibir os gráficos.</p>
            </CardContent>
          </Card>
        ) : subjectsWithAllEvaluations.length === 0 ? (
          <Card className="border border-border">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mb-4">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma Disciplina com Dados Completos</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Não há disciplinas com dados em todas as avaliações selecionadas.
                Apenas disciplinas com dados completos são exibidas para comparação.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {subjectsWithAllEvaluations.map(([subject, rows], subjectIndex) => {
              const subjectColors = getSubjectColors(subject, subjectIndex);
              const colorAt = (index: number) =>
                subjectColors.palette[index % subjectColors.palette.length];
              const notaSeries = seriesFor(rows, `subject-${subject}-nota`, colorAt);
              const profRows = data.subjectProficiencyData[subject] || [];
              const hasProficiency = rowHasAllEvaluations(
                mergeEvolutionRows(profRows)[0],
                data.evaluationNames.length
              );
              const profSeries = hasProficiency
                ? seriesFor(profRows, `subject-${subject}-prof`, colorAt)
                : null;
              return (
                <div key={subject} className="space-y-4">
                  <h4 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                    {subject}
                  </h4>
                  <div className="grid grid-cols-1 gap-6">
                    <EvolutionChartPanel
                      title={`Notas - ${subject}`}
                      icon={TrendingUp}
                      collapsed={isChartCollapsed(`subject-${subject}-nota`)}
                      onToggle={() => toggleChartCollapse(`subject-${subject}-nota`)}
                      metric="nota"
                      series={notaSeries}
                      yDomain={[0, 10]}
                      seriesName="Nota"
                      controls={visibilityControls(`subject-${subject}-nota`, data.evaluationNames)}
                    />
                    {profSeries && (
                      <EvolutionChartPanel
                        title={`Proficiência - ${subject}`}
                        icon={Target}
                        collapsed={isChartCollapsed(`subject-${subject}-prof`)}
                        onToggle={() => toggleChartCollapse(`subject-${subject}-prof`)}
                        metric="proficiencia"
                        series={profSeries}
                        yDomain={getProficiencyDomain(subject)}
                        yAxisName="Proficiência"
                        seriesName="Proficiência"
                        controls={visibilityControls(`subject-${subject}-prof`, data.evaluationNames)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </TabsContent>

      {/* POR NÍVEIS */}
      <TabsContent value="levels" className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted rounded-lg">
            <Users className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Análise por Níveis de Proficiência</h3>
            <p className="text-sm text-muted-foreground">
              Quantidade de alunos por nível em cada avaliação
            </p>
          </div>
        </div>

        {Object.keys(data.levelsData || {}).length === 0 ? (
          <Card className="border border-border">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Nenhum Dado de Nível Encontrado</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Não há dados de níveis de proficiência para exibir os gráficos.
              </p>
            </CardContent>
          </Card>
        ) : levelsWithAllEvaluations.length === 0 ? (
          <Card className="border border-border">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Nenhum Nível com Dados Completos</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Não há níveis com dados em todas as avaliações selecionadas.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {levelsWithAllEvaluations.map(([levelName, rows]) => {
              const levelColor = getLevelColor(levelName);
              const levelSeries = seriesFor(rows, `level-${levelName}`, () => levelColor);
              return (
                <EvolutionChartPanel
                  key={levelName}
                  title={
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-4 w-4 rounded-full" style={{ backgroundColor: levelColor }} />
                      {levelName}
                    </span>
                  }
                  icon={Users}
                  collapsed={isChartCollapsed(`level-${levelName}`)}
                  onToggle={() => toggleChartCollapse(`level-${levelName}`)}
                  metric="quantidade"
                  series={levelSeries}
                  seriesName="Quantidade de Alunos"
                  yAxisName="Quantidade de Alunos"
                  controls={visibilityControls(`level-${levelName}`, data.evaluationNames)}
                />
              );
            })}
          </div>
        )}
      </TabsContent>

      {showGroupsTab && groupTestIds && groupScopeFilters && (
        <TabsContent value="groups" className="space-y-6">
          <EvolutionGroupsView
            testIds={groupTestIds}
            scopeFilters={groupScopeFilters}
            refreshKey={groupRefreshKey}
          />
        </TabsContent>
      )}
        </>
      )}
    </Tabs>
  );
}