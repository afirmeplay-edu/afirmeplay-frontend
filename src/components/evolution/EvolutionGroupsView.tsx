import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Building2, GraduationCap, Info, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  EvaluationComparisonApiService,
  type EvolutionCompareScopeFilters,
  type EvolutionGroupBySerie,
  type EvolutionGroupCard,
  type EvolutionGroupGradeByRecorte,
  type EvolutionGroupPoint,
  type EvolutionGroupsResponse,
  type EvolutionGroupTransition,
  type EvolutionGroupViewBy,
} from '@/services/evaluation/evaluationComparisonApi';
import { AnswerSheetComparisonApiService } from '@/services/answer-sheet/answerSheetComparisonApi';
import {
  EVOLUTION_LEVEL_COLORS,
  EVOLUTION_LEVEL_LABELS,
  EVOLUTION_LEVEL_SOFT,
  isEvolutionLevelLabel,
} from '@/utils/evolution/evolutionLevelColors';
import {
  formatEvolutionMetric,
  formatSignedEvolutionPercent,
} from '@/utils/evolution/formatEvolutionMetric';
import {
  buildGroupEvaluationColumns,
  buildVariationHeaders,
  sortGradeByRecorte,
} from '@/utils/evolution/evolutionGroupsRecorte';

interface EvolutionGroupsViewProps {
  testIds: string[];
  grupos?: string[][];
  scopeFilters: EvolutionCompareScopeFilters;
  /** Recarrega quando a comparação principal muda */
  refreshKey?: string;
  /** Origem dos dados: avaliação online (padrão) ou cartão-resposta */
  sourceMode?: 'avaliacao' | 'cartao';
  /** Visão controlada opcional (turma | serie | escola) */
  viewBy?: EvolutionGroupViewBy;
  onViewByChange?: (value: EvolutionGroupViewBy) => void;
  /** Notifica o pai quando os dados ou o estado de carregamento mudam */
  onDataChange?: (data: EvolutionGroupsResponse | null, isLoading: boolean) => void;
}

function levelStyles(level: string | null | undefined) {
  if (!isEvolutionLevelLabel(level)) {
    return {
      hex: '#6B7280',
      soft: { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' },
    };
  }
  return { hex: EVOLUTION_LEVEL_COLORS[level], soft: EVOLUTION_LEVEL_SOFT[level] };
}

function gradeToneClass(percentage: number | null | undefined): string {
  if (percentage == null || Number.isNaN(Number(percentage))) return 'text-muted-foreground';
  if (percentage > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (percentage < 0) return 'text-red-600 dark:text-red-400';
  return 'text-muted-foreground';
}

function GroupGradeByRecorteTable({
  rowKeyPrefix,
  points,
  gradeByRecorte,
  evaluations,
  columnPrefix = 'Avaliação',
}: {
  rowKeyPrefix: string;
  points: EvolutionGroupPoint[];
  gradeByRecorte?: EvolutionGroupGradeByRecorte[];
  evaluations: EvolutionGroupsResponse['evaluations'];
  columnPrefix?: string;
}) {
  const rows = useMemo(
    () => sortGradeByRecorte(gradeByRecorte ?? []),
    [gradeByRecorte]
  );
  const columns = useMemo(
    () => buildGroupEvaluationColumns({ points }, evaluations, columnPrefix),
    [points, evaluations, columnPrefix]
  );
  const variationCols = useMemo(
    () => buildVariationHeaders(columns.map((column) => column.order)),
    [columns]
  );

  if (rows.length === 0 || columns.length < 2) return null;

  return (
    <div className="mt-5 border-t border-border pt-5">
      <div className="mb-3 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-base font-semibold text-foreground">Notas por recorte</p>
        <p className="text-sm text-muted-foreground">Nota na escala de 0 a 10 · variação relativa (%)</p>
      </div>
      <Table className="text-base">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-[160px] h-12 px-4 text-sm font-semibold">Recorte</TableHead>
            {columns.map((column) => (
              <TableHead
                key={`${rowKeyPrefix}-h-${column.order}`}
                className="h-12 px-4 text-center text-sm font-semibold whitespace-nowrap"
              >
                {column.title}
              </TableHead>
            ))}
            {variationCols.map((pair) => (
              <TableHead
                key={`${rowKeyPrefix}-hv-${pair.from}-${pair.to}`}
                className="h-12 px-4 text-center text-sm font-semibold whitespace-nowrap"
              >
                {pair.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const valueByOrder = new Map(
              (row.values ?? []).map((value) => [value.order, value.average_grade])
            );
            const transitionByPair = new Map(
              (row.transitions ?? []).map((transition) => [
                `${transition.from_order}-${transition.to_order}`,
                transition.evolution,
              ])
            );

            return (
              <TableRow key={`${rowKeyPrefix}-${row.recorte}-${row.is_geral ? 'geral' : row.subject_id ?? 'x'}`}>
                <TableCell
                  className={`px-4 py-3 text-base text-foreground ${row.is_geral ? 'font-semibold' : 'font-medium'}`}
                >
                  {row.recorte}
                </TableCell>
                {columns.map((column) => {
                  const grade = valueByOrder.get(column.order) ?? null;
                  return (
                    <TableCell
                      key={`${rowKeyPrefix}-${row.recorte}-g-${column.order}`}
                      className="px-4 py-3 text-center text-base tabular-nums"
                    >
                      {formatEvolutionMetric(grade, 'nota')}
                    </TableCell>
                  );
                })}
                {variationCols.map((pair) => {
                  const evolution = transitionByPair.get(`${pair.from}-${pair.to}`) ?? null;
                  const percentage = evolution?.percentage ?? null;
                  return (
                    <TableCell
                      key={`${rowKeyPrefix}-${row.recorte}-v-${pair.from}-${pair.to}`}
                      className={`px-4 py-3 text-center text-base tabular-nums font-semibold ${gradeToneClass(percentage)}`}
                    >
                      {formatSignedEvolutionPercent(percentage)}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function GroupTimelineAndTransition({
  itemKey,
  points,
  transitions,
}: {
  itemKey: string;
  points: EvolutionGroupPoint[];
  transitions: EvolutionGroupTransition[];
}) {
  const lastTransition = [...(transitions || [])]
    .reverse()
    .find((t) => t.level_changed || t.grade_pp_delta != null);

  return (
    <>
      <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1">
        {points.map((point, idx) => {
          const styles = levelStyles(point.level);
          const showConnector = idx < points.length - 1;
          return (
            <React.Fragment key={`${itemKey}-${point.evaluation_id}`}>
              <div className="flex flex-col items-center min-w-[72px]">
                <div
                  className="h-10 w-10 rounded-full border-2 flex items-center justify-center text-[10px] font-semibold text-white shadow-sm"
                  style={{
                    backgroundColor: point.level ? styles.hex : '#9CA3AF',
                    borderColor: point.level ? styles.hex : '#9CA3AF',
                  }}
                  title={
                    point.level
                      ? `${point.evaluation_title}: ${point.level}`
                      : `${point.evaluation_title}: sem dados`
                  }
                >
                  {point.order}
                </div>
                <span className="mt-1 text-[10px] text-muted-foreground text-center line-clamp-2 max-w-[80px]">
                  {point.evaluation_title}
                </span>
              </div>
              {showConnector && (
                <div className="h-0.5 w-6 sm:w-10 bg-border shrink-0 mb-5" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex flex-col items-start lg:items-end gap-1 min-w-[160px]">
        {lastTransition?.level_changed && (
          <Badge variant="outline" className="text-xs font-normal">
            {lastTransition.from_level} → {lastTransition.to_level}
          </Badge>
        )}
        {lastTransition?.grade_pp_delta != null && (
          <span
            className={`inline-flex items-center gap-1 text-sm font-medium ${
              lastTransition.grade_pp_delta > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : lastTransition.grade_pp_delta < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-muted-foreground'
            }`}
          >
            {lastTransition.grade_pp_delta > 0 ? (
              <ArrowUpRight className="h-4 w-4" />
            ) : lastTransition.grade_pp_delta < 0 ? (
              <ArrowDownRight className="h-4 w-4" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            {lastTransition.grade_pp_delta > 0 ? '+' : ''}
            {lastTransition.grade_pp_delta.toFixed(1).replace('.', ',')} p.p.
          </span>
        )}
      </div>
    </>
  );
}

function SchoolBySerieSection({
  group,
  serie,
  evaluations,
  columnPrefix,
}: {
  group: EvolutionGroupCard;
  serie: EvolutionGroupBySerie;
  evaluations: EvolutionGroupsResponse['evaluations'];
  columnPrefix: string;
}) {
  const serieKey = `${group.id}-serie-${serie.serie_id ?? serie.serie_name}`;
  const currentStyles = levelStyles(serie.current_level);

  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 p-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h5 className="font-semibold text-foreground">{serie.serie_name}</h5>
            {serie.current_level && (
              <Badge
                variant="outline"
                className={`${currentStyles.soft.bg} ${currentStyles.soft.text} ${currentStyles.soft.border}`}
              >
                {serie.current_level}
              </Badge>
            )}
          </div>
          {serie.course_name && (
            <p className="text-xs text-muted-foreground">{serie.course_name}</p>
          )}
        </div>

        <GroupTimelineAndTransition
          itemKey={serieKey}
          points={serie.points}
          transitions={serie.transitions}
        />
      </div>

      <GroupGradeByRecorteTable
        rowKeyPrefix={serieKey}
        points={serie.points}
        gradeByRecorte={serie.grade_by_recorte}
        evaluations={evaluations}
        columnPrefix={columnPrefix}
      />
    </div>
  );
}

export function EvolutionGroupsView({
  testIds,
  grupos,
  scopeFilters,
  refreshKey,
  sourceMode = 'avaliacao',
  viewBy: controlledViewBy,
  onViewByChange,
  onDataChange,
}: EvolutionGroupsViewProps) {
  const [internalViewBy, setInternalViewBy] = useState<EvolutionGroupViewBy>('turma');
  const viewBy = controlledViewBy ?? internalViewBy;
  const setViewBy = (next: EvolutionGroupViewBy) => {
    if (onViewByChange) {
      onViewByChange(next);
    } else {
      setInternalViewBy(next);
    }
  };

  const [data, setData] = useState<EvolutionGroupsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCartao = sourceMode === 'cartao';
  const columnPrefix = isCartao ? 'Gabarito' : 'Avaliação';

  // Chave pelo conteúdo. O pai recria os arrays a cada render; depender da
  // referência fazia o efeito recomeçar o pedido e o spinner não parava.
  const requestKey = JSON.stringify({
    sourceMode,
    testIds,
    grupos: isCartao ? [] : (grupos ?? []),
    viewBy,
    scope: scopeFilters,
    refreshKey: refreshKey ?? '',
  });

  useEffect(() => {
    if (testIds.length < 2) {
      setData(null);
      setIsLoading(false);
      onDataChange?.(null, false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setIsLoading(true);
        setError(null);
        onDataChange?.(null, true);
        try {
          const response = isCartao
            ? await AnswerSheetComparisonApiService.compareAnswerSheetsByGroups(
                testIds,
                viewBy,
                scopeFilters
              )
            : await EvaluationComparisonApiService.compareEvaluationsByGroups(
                testIds,
                viewBy,
                scopeFilters,
                grupos
              );
          if (!cancelled) {
            setData(response);
            onDataChange?.(response, false);
          }
        } catch (err: unknown) {
          console.error(err);
          if (cancelled) return;
          let message = 'Não foi possível carregar a evolução por grupos.';
          if (err && typeof err === 'object' && 'response' in err) {
            const axiosError = err as { response?: { data?: { error?: string } } };
            if (axiosError.response?.data?.error) message = axiosError.response.data.error;
          }
          setError(message);
          setData(null);
          onDataChange?.(null, false);
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      })();
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // requestKey já resume origem, ids, grupos, escopo e visualização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const viewLabel = useMemo(() => {
    if (viewBy === 'escola') return 'escola';
    if (viewBy === 'serie') return 'série (por escola)';
    return 'turma';
  }, [viewBy]);

  const totalSummaryCount = useMemo(() => {
    if (!data?.summary_by_level) return 0;
    return EVOLUTION_LEVEL_LABELS.reduce(
      (sum, level) => sum + (data.summary_by_level[level] ?? 0),
      0
    );
  }, [data?.summary_by_level]);

  const showSummaryCards =
    Boolean(data?.summary_by_level) && !(data?.requer_filtro_serie && totalSummaryCount === 0);

  if (testIds.length < 2) {
    return (
      <Card className="border border-border">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {isCartao
            ? `Selecione pelo menos 2 gabaritos para ver a evolução por ${viewLabel}.`
            : `Selecione pelo menos 2 avaliações para ver a evolução por ${viewLabel}.`}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Evolução da escola, série e turma</h3>
          <p className="text-sm text-muted-foreground">
            {isCartao
              ? `Indicadores de proficiência por ${viewLabel} ao longo dos cartões-resposta selecionados`
              : `Indicadores de proficiência por ${viewLabel} ao longo das provas selecionadas`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Visualizar por</span>
          <Select value={viewBy} onValueChange={(v) => setViewBy(v as EvolutionGroupViewBy)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="turma">
                <span className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" /> Turma
                </span>
              </SelectItem>
              <SelectItem value="serie">
                <span className="flex items-center gap-2">
                  <GraduationCap className="h-3.5 w-3.5" /> Série por escola
                </span>
              </SelectItem>
              <SelectItem value="escola">
                <span className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" /> Escola
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {showSummaryCards && data?.summary_by_level && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {EVOLUTION_LEVEL_LABELS.map((level) => {
            const styles = levelStyles(level);
            const count = data.summary_by_level[level] ?? 0;
            return (
              <div
                key={level}
                className={`rounded-lg border px-3 py-3 ${styles.soft.bg} ${styles.soft.border}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: styles.hex }}
                  />
                  <span className={`text-xs font-medium ${styles.soft.text}`}>{level}</span>
                </div>
                <p className={`text-2xl font-semibold ${styles.soft.text}`}>{count}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {count === 1 ? 'grupo' : 'grupos'} no nível atual
                </p>
              </div>
            );
          })}
        </div>
      )}

      {isLoading && (
        <Card className="border border-border">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Carregando evolução por grupos…
          </CardContent>
        </Card>
      )}

      {error && !isLoading && (
        <Card className="border border-destructive/40">
          <CardContent className="py-6 text-center text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!isLoading && !error && data && data.groups.length === 0 && (
        <Card className="border border-border">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum grupo encontrado nos filtros selecionados.
          </CardContent>
        </Card>
      )}

      {!isLoading && data && data.groups.length > 0 && (
        <div className="space-y-3">
          {data.groups.map((group) => {
            const hasMultiSerieSplit = Boolean(
              group.requer_filtro_serie && group.by_serie && group.by_serie.length > 0
            );
            const current = group.current_level;
            const currentStyles = levelStyles(current);

            return (
              <Card key={group.id} className="border border-border overflow-hidden">
                <CardContent className="p-4 sm:p-5">
                  {hasMultiSerieSplit ? (
                    <div className="space-y-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h4 className="font-semibold text-foreground">{group.name}</h4>
                          <Badge variant="secondary" className="text-xs font-normal">
                            {group.by_serie!.length} séries
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
                          <Info className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>
                            Esta escola tem mais de uma série nesta avaliação; os resultados aparecem por série.
                          </span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {group.by_serie!.map((serie) => (
                          <SchoolBySerieSection
                            key={`${group.id}-${serie.serie_id ?? serie.serie_name}`}
                            group={group}
                            serie={serie}
                            evaluations={data.evaluations}
                            columnPrefix={columnPrefix}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h4 className="font-semibold text-foreground truncate">{group.name}</h4>
                            {current && (
                              <Badge
                                variant="outline"
                                className={`${currentStyles.soft.bg} ${currentStyles.soft.text} ${currentStyles.soft.border}`}
                              >
                                {current}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {[group.grade_name, group.school_name].filter(Boolean).join(' · ')}
                          </p>
                        </div>

                        <GroupTimelineAndTransition
                          itemKey={group.id}
                          points={group.points}
                          transitions={group.transitions}
                        />
                      </div>

                      <GroupGradeByRecorteTable
                        rowKeyPrefix={group.id}
                        points={group.points}
                        gradeByRecorte={group.grade_by_recorte}
                        evaluations={data.evaluations}
                        columnPrefix={columnPrefix}
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
