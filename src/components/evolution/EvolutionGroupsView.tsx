import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Building2, GraduationCap, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  EvaluationComparisonApiService,
  type EvolutionCompareScopeFilters,
  type EvolutionGroupsResponse,
  type EvolutionGroupViewBy,
} from '@/services/evaluation/evaluationComparisonApi';
import {
  EVOLUTION_LEVEL_COLORS,
  EVOLUTION_LEVEL_LABELS,
  EVOLUTION_LEVEL_SOFT,
  isEvolutionLevelLabel,
} from '@/utils/evolution/evolutionLevelColors';

interface EvolutionGroupsViewProps {
  testIds: string[];
  scopeFilters: EvolutionCompareScopeFilters;
  /** Recarrega quando a comparação principal muda */
  refreshKey?: string;
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

export function EvolutionGroupsView({ testIds, scopeFilters, refreshKey }: EvolutionGroupsViewProps) {
  const [viewBy, setViewBy] = useState<EvolutionGroupViewBy>('turma');
  const [data, setData] = useState<EvolutionGroupsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (testIds.length < 2) {
      setData(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await EvaluationComparisonApiService.compareEvaluationsByGroups(
        testIds,
        viewBy,
        scopeFilters
      );
      setData(response);
    } catch (err: unknown) {
      console.error(err);
      let message = 'Não foi possível carregar a evolução por grupos.';
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as { response?: { data?: { error?: string } } };
        if (axiosError.response?.data?.error) message = axiosError.response.data.error;
      }
      setError(message);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [testIds, viewBy, scopeFilters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [load, refreshKey]);

  const viewLabel = useMemo(() => {
    if (viewBy === 'escola') return 'escola';
    if (viewBy === 'serie') return 'série (por escola)';
    return 'turma';
  }, [viewBy]);

  if (testIds.length < 2) {
    return (
      <Card className="border border-border">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Selecione pelo menos 2 avaliações para ver a evolução por {viewLabel}.
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
            Indicadores de proficiência por {viewLabel} ao longo das provas selecionadas
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

      {data?.summary_by_level && (
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
            Nenhum grupo encontrado no escopo selecionado.
          </CardContent>
        </Card>
      )}

      {!isLoading && data && data.groups.length > 0 && (
        <div className="space-y-3">
          {data.groups.map((group) => {
            const current = group.current_level;
            const currentStyles = levelStyles(current);
            const lastTransition = [...(group.transitions || [])]
              .reverse()
              .find((t) => t.level_changed || t.grade_pp_delta != null);

            return (
              <Card key={group.id} className="border border-border overflow-hidden">
                <CardContent className="p-4 sm:p-5">
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

                    <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1">
                      {group.points.map((point, idx) => {
                        const styles = levelStyles(point.level);
                        const showConnector = idx < group.points.length - 1;
                        return (
                          <React.Fragment key={`${group.id}-${point.evaluation_id}`}>
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
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
