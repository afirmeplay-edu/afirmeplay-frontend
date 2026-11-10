/**
 * Detalhes de um template de competição.
 * Rota: /app/competition-templates/:id
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ArrowLeft, ChevronDown, Layers, Loader2, PenSquare, Trophy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  getCompetitionTemplateById,
  updateCompetitionTemplate,
  type CompetitionTemplate,
  type UpdateCompetitionTemplatePayload,
} from '@/services/competition/competitionTemplatesApi';
import { CompetitionTemplateForm } from '@/components/competitions/CompetitionTemplateForm';
import { getCompetitionSubjectDisplay } from '@/utils/competition/competitionSubjectName';
import { api } from '@/lib/api';

function formatRecurrence(rec: string | undefined): string {
  const r = (rec ?? '').toLowerCase();
  if (r === 'weekly') return 'Semanal';
  if (r === 'biweekly') return 'Quinzenal';
  if (r === 'monthly') return 'Mensal';
  return rec ?? '—';
}

function formatQuestionMode(mode: string | undefined): string {
  const m = (mode ?? 'auto_random').toLowerCase();
  if (m === 'auto_random') return 'Sorteio automático';
  if (m === 'manual') return 'Manual';
  return mode ?? '—';
}

function formatScope(scope: string | undefined): string {
  const s = (scope ?? 'global').toLowerCase();
  if (s === 'global') return 'Todas as escolas';
  return scope ?? '—';
}

function formatDate(date: string | undefined): string {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleString('pt-BR');
  } catch {
    return date;
  }
}

export default function CompetitionTemplateDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [template, setTemplate] = useState<CompetitionTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.get<{ id: string; name: string }[]>('/subjects').then((res) => {
      if (!cancelled && Array.isArray(res.data)) setSubjects(res.data);
    }).catch(() => { if (!cancelled) setSubjects([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getCompetitionTemplateById(id)
      .then(setTemplate)
      .catch(() => {
        setError('Template não encontrado.');
        setTemplate(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleUpdate = async (payload: UpdateCompetitionTemplatePayload) => {
    if (!id) return;
    setEditSubmitting(true);
    try {
      const updated = await updateCompetitionTemplate(id, payload);
      setTemplate(updated);
      toast({ title: 'Template atualizado com sucesso.' });
      setEditOpen(false);
    } catch (error: unknown) {
      console.error('Erro ao atualizar template:', error);
      const msg =
        (error as { message?: string })?.message ??
        'Não foi possível atualizar o template.';
      toast({
        title: 'Erro',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setEditSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="container mx-auto space-y-4 py-8 px-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/app/competition-templates')}
          className="-ml-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-destructive">
            {error ?? 'Template não encontrado.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const competitions = template.competitions ?? [];
  const subjectDisplayName = getCompetitionSubjectDisplay(template, subjects);

  return (
    <div className="container mx-auto space-y-6 py-6 px-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/app/competition-templates')}
            className="-ml-2 mb-2 text-muted-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar à lista de templates
          </Button>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
            <span className="rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 p-2.5 text-white shadow-sm">
              <Layers className="h-6 w-6" />
            </span>
            {template.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">
              {subjectDisplayName}
            </Badge>
            <span>Nível {template.level}</span>
            <span>· {formatRecurrence(template.recurrence)}</span>
            <span>· Escopo {formatScope(template.scope)}</span>
            <Badge
              variant={template.active ? 'default' : 'outline'}
              className={template.active ? 'bg-emerald-500 text-white' : ''}
            >
              {template.active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
          >
            <PenSquare className="mr-2 h-4 w-4" />
            Editar template
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Configuração do template
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Disciplina</p>
                <p className="font-medium">
                  {subjectDisplayName}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Nível</p>
                <p className="font-medium">{template.level}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Recorrência</p>
                <p className="font-medium">
                  {formatRecurrence(template.recurrence)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Escopo</p>
                <p className="font-medium">
                  {formatScope(template.scope)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Modo de questões</p>
                <p className="font-medium">
                  {formatQuestionMode(template.question_mode)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Criado em</p>
                <p className="font-medium">
                  {formatDate(template.created_at)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Atualizado em</p>
                <p className="font-medium">
                  {formatDate(template.updated_at)}
                </p>
              </div>
            </div>

            {template.reward_config && (
              <Collapsible defaultOpen={false} className="space-y-1">
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-left text-sm font-medium hover:bg-muted/50 [&[data-state=open]>svg]:rotate-180">
                  Configurações avançadas
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-1 pt-2">
                    <p className="text-xs text-muted-foreground">
                      Configuração de recompensas
                    </p>
                    <ScrollArea className="max-h-44 rounded-md border bg-muted/40 p-2">
                      <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                        {JSON.stringify(template.reward_config, null, 2)}
                      </pre>
                    </ScrollArea>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Trophy className="h-4 w-4 text-amber-500" />
              Competições geradas por este template
            </CardTitle>
          </CardHeader>
          <CardContent>
            {competitions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Ainda não há competições geradas a partir deste template.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Ed.</TableHead>
                      <TableHead>Nível</TableHead>
                      <TableHead>Recorrência</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Aplicação</TableHead>
                      <TableHead className="w-[120px] text-right">
                        Ações
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {competitions.map((comp) => (
                      <TableRow key={comp.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{comp.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{comp.edition_number ?? '—'}</TableCell>
                        <TableCell>{comp.level}</TableCell>
                        <TableCell>
                          {formatRecurrence(comp.recurrence)}
                        </TableCell>
                        <TableCell className="capitalize">
                          {String(comp.status ?? '—')}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-xs text-muted-foreground">
                            <span>
                              Inscrições:{' '}
                              {comp.enrollment_start
                                ? new Date(
                                    comp.enrollment_start,
                                  ).toLocaleDateString('pt-BR')
                                : '—'}{' '}
                              {'→ '}{' '}
                              {comp.enrollment_end
                                ? new Date(
                                    comp.enrollment_end,
                                  ).toLocaleDateString('pt-BR')
                                : '—'}
                            </span>
                            <span>
                              Prova:{' '}
                              {comp.application
                                ? new Date(
                                    comp.application,
                                  ).toLocaleDateString('pt-BR')
                                : '—'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              navigate(`/app/competitions/${comp.id}`)
                            }
                          >
                            Ver competição
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar template</DialogTitle>
          </DialogHeader>
          <CompetitionTemplateForm
            initialData={template}
            submitting={editSubmitting}
            onSubmit={handleUpdate}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

