import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Loader2, Calendar, Clock, Trophy, BookOpen, Hash, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getCompetition } from '@/services/competition/competitionsApi';
import type { Competition, CompetitionStatus } from '@/types/competition-types';
import { cn } from '@/lib/utils';

function getStatusConfig(status: CompetitionStatus) {
  const s = String(status).toLowerCase();
  if (s === 'draft' || s === 'rascunho')
    return { label: 'Rascunho', className: 'bg-muted text-muted-foreground' };
  if (s === 'aberta' || s === 'active' || s === 'enrollment_open')
    return { label: s === 'aberta' ? 'Aberta' : s === 'enrollment_open' ? 'Inscrições abertas' : 'Ativa', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' };
  if (s === 'scheduled') return { label: 'Agendada', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200' };
  if (s === 'completed') return { label: 'Concluída', className: 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200' };
  if (s === 'cancelled' || s === 'cancelada') return { label: 'Cancelada', className: 'bg-destructive/10 text-destructive' };
  return { label: String(status), className: 'bg-muted text-muted-foreground' };
}

function formatDate(value: string | undefined) {
  if (!value) return '—';
  try {
    return format(new Date(value), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return value;
  }
}

interface CompetitionDetailModalProps {
  competitionId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (id: string) => void;
  canEdit?: boolean;
}

export function CompetitionDetailModal({
  competitionId,
  open,
  onClose,
  onEdit,
  canEdit,
}: CompetitionDetailModalProps) {
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !competitionId) {
      setCompetition(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    getCompetition(competitionId)
      .then(setCompetition)
      .catch((err) => {
        setError(err?.response?.data?.message || err?.message || 'Erro ao carregar competição.');
        setCompetition(null);
      })
      .finally(() => setLoading(false));
  }, [open, competitionId]);

  const statusConfig = competition ? getStatusConfig(competition.status) : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Detalhe da competição
          </DialogTitle>
          <DialogDescription>
            {competition ? competition.name : 'Carregando...'}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive py-4">{error}</p>
        )}

        {!loading && !error && competition && (
          <ScrollArea className="flex-1 -mx-1 px-1 pr-2">
            <div className="space-y-4 py-2">
              <div className="flex flex-wrap items-center gap-2">
                {statusConfig && (
                  <Badge className={cn('border', statusConfig.className)}>
                    {statusConfig.label}
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  {competition.subject_name ?? competition.subject_id} · Nível {competition.level}
                </span>
                {competition.scope && (
                  <span className="text-sm text-muted-foreground">· Escopo: {competition.scope}</span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-2 rounded-lg border p-3">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Inscrições</p>
                    <p className="text-sm">
                      {formatDate(competition.enrollment_start)} até {formatDate(competition.enrollment_end)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-lg border p-3">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Aplicação</p>
                    <p className="text-sm">{formatDate(competition.application)}</p>
                  </div>
                </div>
              </div>

              {(competition.question_mode || competition.question_rules) && (
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5" /> Questões
                  </p>
                  {competition.question_mode && (
                    <p className="text-sm">
                      <strong>Modo:</strong>{' '}
                      {competition.question_mode === 'auto_random'
                        ? 'Sorteio automático'
                        : competition.question_mode}
                    </p>
                  )}
                  {competition.question_mode === 'auto_random' &&
                    (competition.question_rules != null ||
                      (competition.selected_question_ids?.length ?? 0) > 0) && (
                      <p className="text-sm text-muted-foreground">
                        {(() => {
                          const r =
                            typeof competition.question_rules === 'object'
                              ? competition.question_rules
                              : (() => {
                                  try {
                                    return JSON.parse(competition.question_rules as string);
                                  } catch {
                                    return null;
                                  }
                                })();
                          const explicit =
                            (r as { num_questions?: number } | null)?.num_questions ?? undefined;
                          const selected = competition.selected_question_ids?.length;
                          const n =
                            (typeof selected === 'number' && selected > 0 ? selected : explicit) ??
                            0;
                          if (n <= 0) return 'Nenhuma questão sorteada';
                          if (n === 1) return '1 questão sorteada aleatoriamente';
                          return `${n} questões sorteadas aleatoriamente`;
                        })()}
                      </p>
                    )}
                  {(() => {
                    const ids =
                      competition.selected_question_ids ?? competition.question_ids ?? [];
                    if (!ids.length) return null;
                    if (ids.length === 1) {
                      return (
                        <p className="text-sm text-muted-foreground">1 questão vinculada</p>
                      );
                    }
                    return (
                      <p className="text-sm text-muted-foreground">
                        {ids.length} questões vinculadas
                      </p>
                    );
                  })()}
                </div>
              )}

              {((competition.scope_filter && Object.keys(competition.scope_filter).length > 0) ||
                competition.question_rules) && (
                <Collapsible defaultOpen={false} className="rounded-lg border">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted/40 [&[data-state=open]>svg]:rotate-180">
                    Configurações avançadas
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-3 border-t px-3 py-3">
                      {competition.scope_filter && Object.keys(competition.scope_filter).length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Filtro de escopo</p>
                          <pre className="text-xs font-mono bg-muted/50 p-2 rounded overflow-x-auto">
                            {JSON.stringify(competition.scope_filter, null, 2)}
                          </pre>
                        </div>
                      )}
                      {competition.question_rules && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Regras de questões</p>
                          <pre className="text-xs font-mono bg-muted/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                            {typeof competition.question_rules === 'string'
                              ? competition.question_rules
                              : JSON.stringify(competition.question_rules, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {(competition.reward_config?.participation_coins != null ||
                (competition.reward_config?.ranking_rewards?.length ?? 0) > 0 ||
                competition.reward_participation != null ||
                competition.reward_ranking != null) && (
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Recompensas</p>
                  <p className="text-sm">
                    Participação: {String(competition.reward_config?.participation_coins ?? competition.reward_participation ?? '—')}
                    {((competition.reward_config?.ranking_rewards?.length ?? 0) > 0 || competition.reward_ranking != null) && (
                      <> · Ranking: {competition.reward_config?.ranking_rewards?.length ? competition.reward_config.ranking_rewards.map((r) => `${r.position}º: ${r.coins}`).join(', ') : String(competition.reward_ranking ?? '—')}</>
                    )}
                  </p>
                </div>
              )}

              {(competition.ranking_criterion || competition.visibility || competition.limit != null) && (
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Hash className="h-3.5 w-3.5" /> Avançado
                  </p>
                  {competition.ranking_criterion && (
                    <p className="text-sm">Critério: {competition.ranking_criterion}</p>
                  )}
                  {competition.visibility && (
                    <p className="text-sm">Visibilidade: {competition.visibility}</p>
                  )}
                  {competition.limit != null && (
                    <p className="text-sm">Limite de participantes: {competition.limit === 0 ? 'Ilimitado' : competition.limit}</p>
                  )}
                </div>
              )}

              {(competition.created_at || competition.updated_at) && (
                <p className="text-xs text-muted-foreground">
                  Criado em {formatDate(competition.created_at)}
                  {competition.updated_at && ` · Atualizado em ${formatDate(competition.updated_at)}`}
                </p>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          {canEdit && competition && onEdit && (
            <Button onClick={() => { onEdit(competition.id); onClose(); }}>
              Editar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
