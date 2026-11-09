/**
 * Detalhes da competição (admin, coordenador, diretor, tec admin).
 * Rota: /app/competitions/:id
 * Layout gamificado: resumo visual, métricas em destaque, só informações relevantes.
 */
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Loader2, ArrowLeft, Calendar, Clock, Trophy, BookOpen, Coins, Users, Award, Pencil, Send, Square, Trash2, XCircle, UserCheck, Flag, ChevronDown, ChevronUp, BarChart3, Eye, Shuffle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import {
  getCompetition,
  updateCompetition,
  cancelCompetition,
  deleteCompetition,
  stopCompetition,
  randomizeCompetitionQuestions,
  getEligibleStudentsForCompetition,
  getEnrolledStudentsForCompetition,
  getCompetitionRanking,
  finalizeCompetition,
  type EligibleStudent,
  type EnrolledStudent,
  type CompetitionRankingEntry,
} from '@/services/competition/competitionsApi';
import type { Competition, CompetitionStatus } from '@/types/competition-types';
import { EditCompetitionModal } from '@/components/competitions/EditCompetitionModal';
import { EditCompetitionApplicationModal } from '@/components/competitions/EditCompetitionApplicationModal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCoins, getMedalEmoji } from '@/utils/coins';
import { getSubjectColors } from '@/utils/competition/competitionSubjectColors';
import { getCompetitionSubjectDisplay } from '@/utils/competition/competitionSubjectName';
import { parseISOToDatetimeLocal, convertDateTimeLocalToISONaive } from '@/utils/date';
import { api } from '@/lib/api';
import { useAuth } from '@/context/authContext';
import QuestionPreview from '@/components/evaluations/questions/QuestionPreview';
import type { Question as EvaluationQuestion } from '@/components/evaluations/types';

const FINALIZADA_STYLE = 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200';

function getStatusConfig(status: CompetitionStatus, competition?: { expiration?: string; application?: string } | null) {
  const s = String(status).toLowerCase();
  const now = Date.now();
  // Só considerar finalizada se expiration passou E application também já passou (prova começou e terminou)
  const applicationStarted = competition?.application ? new Date(competition.application).getTime() <= now : false;
  const applicationEnded = competition?.expiration ? new Date(competition.expiration).getTime() < now : false;
  const isActuallyFinished = applicationStarted && applicationEnded;
  if (s === 'completed' || s === 'encerrada' || isActuallyFinished) {
    return { label: 'Finalizada', className: FINALIZADA_STYLE };
  }
  if (s === 'draft' || s === 'rascunho') return { label: 'Rascunho', className: 'bg-muted text-muted-foreground' };
  if (s === 'aberta' || s === 'enrollment_open') return { label: s === 'aberta' ? 'Aberta' : 'Inscrições abertas', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200' };
  if (s === 'scheduled') return { label: 'Agendada', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200' };
  if (s === 'active') return { label: 'Ativa', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' };
  if (s === 'cancelled' || s === 'cancelada') return { label: 'Cancelada', className: 'bg-destructive/10 text-destructive' };
  return { label: String(status), className: 'bg-muted text-muted-foreground' };
}

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  try {
    return format(new Date(value), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return value;
  }
}

export default function CompetitionDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [applicationModalOpen, setApplicationModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questions, setQuestions] = useState<
    { id: string; title: string; text: string; difficulty?: string; value?: number }[]
  >([]);
  const [eligibleStudents, setEligibleStudents] = useState<EligibleStudent[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [eligibleError, setEligibleError] = useState<string | null>(null);
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([]);
  const [enrolledLoading, setEnrolledLoading] = useState(false);
  const [enrolledError, setEnrolledError] = useState<string | null>(null);
  const [rankingEntries, setRankingEntries] = useState<CompetitionRankingEntry[]>([]);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const [rankingForbidden, setRankingForbidden] = useState(false);
  const [questionsSectionOpen, setQuestionsSectionOpen] = useState(false);
  const [enrolledSectionOpen, setEnrolledSectionOpen] = useState(false);
  const [eligibleSectionOpen, setEligibleSectionOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<EvaluationQuestion | null>(null);
  const [selectedRankingEntry, setSelectedRankingEntry] = useState<CompetitionRankingEntry | null>(null);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  /** Campos de data/hora para edição quando competição aberta ou em andamento (formato datetime-local). */
  const [dateEnrollmentStart, setDateEnrollmentStart] = useState('');
  const [dateEnrollmentEnd, setDateEnrollmentEnd] = useState('');
  const [dateApplication, setDateApplication] = useState('');
  const [dateExpiration, setDateExpiration] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get<{ id: string; name: string }[]>('/subjects').then((res) => {
      if (!cancelled && Array.isArray(res.data)) setSubjects(res.data);
    }).catch(() => { if (!cancelled) setSubjects([]); });
    return () => { cancelled = true; };
  }, []);

  const fetchCompetition = () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getCompetition(id)
      .then(setCompetition)
      .catch((err) => {
        setError(err?.response?.data?.message || err?.message || 'Erro ao carregar.');
        setCompetition(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCompetition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /** Sincroniza os campos de data/hora quando a competição está aberta ou em andamento. */
  useEffect(() => {
    if (!competition) return;
    const s = String(competition.status).toLowerCase();
    const isOpenOrActiveStatus = ['aberta', 'enrollment_open', 'active', 'em_andamento'].includes(s);
    if (!isOpenOrActiveStatus) return;
    setDateEnrollmentStart(parseISOToDatetimeLocal(competition.enrollment_start));
    setDateEnrollmentEnd(parseISOToDatetimeLocal(competition.enrollment_end));
    setDateApplication(parseISOToDatetimeLocal(competition.application));
    setDateExpiration(parseISOToDatetimeLocal(competition.expiration));
  }, [competition?.id, competition?.status, competition?.enrollment_start, competition?.enrollment_end, competition?.application, competition?.expiration]);

  useEffect(() => {
    const loadEligibleStudents = async () => {
      if (!id) return;
      setEligibleLoading(true);
      setEligibleError(null);
      try {
        const list = await getEligibleStudentsForCompetition(id, { limit: 100, offset: 0 });
        setEligibleStudents(list);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data
            ?.message ||
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Não foi possível carregar os alunos elegíveis.';
        setEligibleError(msg);
      } finally {
        setEligibleLoading(false);
      }
    };

    loadEligibleStudents();
  }, [id]);

  useEffect(() => {
    const loadEnrolledStudents = async () => {
      if (!id) return;
      setEnrolledLoading(true);
      setEnrolledError(null);
      try {
        const list = await getEnrolledStudentsForCompetition(id, { limit: 500 });
        setEnrolledStudents(list);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message
          ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? 'Não foi possível carregar os alunos inscritos.';
        setEnrolledError(msg);
        setEnrolledStudents([]);
      } finally {
        setEnrolledLoading(false);
      }
    };
    loadEnrolledStudents();
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const loadQuestions = async () => {
      const ids = competition?.selected_question_ids ?? competition?.question_ids ?? [];
      if (!ids.length) {
        setQuestions([]);
        return;
      }
      setQuestionsLoading(true);
      try {
        const list = await Promise.all(
          ids.map((qid) =>
            api
              .get(`/questions/${qid}`)
              .then((res) => res.data)
              .catch(() => null)
          )
        );
        if (cancelled) return;
        const mapped =
          list
            .filter(Boolean)
            .map((q: {
              id: unknown;
              title?: unknown;
              text?: unknown;
              formatted_text?: unknown;
              difficulty_level?: unknown;
              difficulty?: unknown;
              value?: unknown;
            }) => ({
              id: String(q.id),
              title: String(q.title ?? ''),
              text: String(q.text ?? q.formatted_text ?? ''),
              difficulty: (q.difficulty_level ?? q.difficulty) as string | undefined,
              value: typeof q.value === 'number' ? q.value : undefined,
            })) ?? [];
        setQuestions(mapped);
      } finally {
        if (!cancelled) setQuestionsLoading(false);
      }
    };

    loadQuestions();
    return () => {
      cancelled = true;
    };
  }, [competition]);

  useEffect(() => {
    if (!id || !competition) return;
    const statusLower = String(competition.status).toLowerCase();
    const encerrada = statusLower === 'completed' || statusLower === 'encerrada';
    if (!encerrada) {
      setRankingEntries([]);
      setRankingForbidden(false);
      setRankingError(null);
      return;
    }
    let cancelled = false;
    setRankingLoading(true);
    setRankingError(null);
    setRankingForbidden(false);
    getCompetitionRanking(id, { limit: 100 })
      .then((res) => {
        if (!cancelled) {
          const sorted = [...(res.entries ?? [])].sort((a, b) => a.position - b.position);
          setRankingEntries(sorted);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 403) {
          setRankingForbidden(true);
          setRankingEntries([]);
        } else {
          setRankingError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Não foi possível carregar o ranking.');
        }
      })
      .finally(() => {
        if (!cancelled) setRankingLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch when id or status changes
  }, [id, competition?.id, competition?.status]);

  const statusConfig = competition ? getStatusConfig(competition.status, competition) : null;
  const s = competition ? String(competition.status).toLowerCase() : '';
  const now = Date.now();
  const applicationStarted = competition?.application ? new Date(competition.application).getTime() <= now : false;
  const applicationEnded = competition?.expiration ? new Date(competition.expiration).getTime() < now : false;
  const isActuallyFinished = applicationStarted && applicationEnded;
  const isDraft = competition && (s === 'rascunho' || s === 'draft');
  const isCancelled = competition && (s === 'cancelada' || s === 'cancelled');
  const isAberta = competition && (s === 'aberta' || s === 'enrollment_open' || s === 'active');
  const isCompleted = competition && (s === 'completed' || s === 'encerrada' || isActuallyFinished);
  const isEncerrada = competition && (s === 'completed' || s === 'encerrada');
  const isOpenOrActive = competition && (s === 'aberta' || s === 'enrollment_open' || s === 'active' || s === 'em_andamento');
  const enrollmentStartTime = competition?.enrollment_start
    ? new Date(competition.enrollment_start).getTime()
    : null;
  const enrollmentEndTime = competition?.enrollment_end
    ? new Date(competition.enrollment_end).getTime()
    : null;
  const isEnrollmentWindow =
    enrollmentStartTime != null &&
    enrollmentEndTime != null &&
    now >= enrollmentStartTime &&
    now <= enrollmentEndTime;
  /** Botão "Finalizar competição": data de expiração já passou e competição ainda aberta/em andamento. */
  const canFinalize = isOpenOrActive && isActuallyFinished;
  const isAdmin = (user?.role ?? '').toLowerCase() === 'admin';
  /** Parar competição em andamento: só admin; competição aberta ou em_andamento e não finalizada. */
  const canStop = isOpenOrActive && competition?.is_finished !== true && isAdmin;
  /**
   * Excluir competição:
   * - Admin: rascunho, cancelada, aberta, em andamento ou finalizada.
   * - Não admin: apenas rascunho ou já cancelada.
   */
  const canDeleteDirectly = isDraft || isCancelled || (isAdmin && (isOpenOrActive || isCompleted));
  /** Aleatorizar questões: competição aberta ou em andamento e question_mode === 'auto_random'. */
  const canRandomize = isOpenOrActive && (competition?.question_mode ?? '').toLowerCase() === 'auto_random';
  /**
   * Cancelar competição:
   * - disponível para competições já finalizadas (requisito: "em competições finalizadas na parte de ver")
   * - e que ainda não estejam com status cancelado.
   */
  const canCancel = Boolean(isCompleted && !isCancelled);
  const canEdit = isDraft || isAberta;
  const showEligibleSection = Boolean(competition && !isCompleted && !isCancelled && isEnrollmentWindow);

  const handleFinalize = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await finalizeCompetition(id);
      toast({ title: 'Competição finalizada. Ranking e recompensas atualizados.' });
      fetchCompetition();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao finalizar.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await cancelCompetition(id, cancelReason.trim() ? { reason: cancelReason } : undefined);
      toast({ title: 'Competição cancelada.' });
      setCancelOpen(false);
      setCancelReason('');
      fetchCompetition();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao cancelar.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await deleteCompetition(id);
      toast({ title: 'Competição excluída.' });
      setDeleteOpen(false);
      navigate('/app/competitions');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message
        || (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Erro ao excluir.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await stopCompetition(id);
      toast({ title: 'Competição encerrada. O ranking foi gerado.' });
      setStopOpen(false);
      fetchCompetition();
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { error?: string }; status?: number } })?.response;
      const msg = res?.data?.error ?? 'Não foi possível parar a competição.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRandomizeQuestions = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await randomizeCompetitionQuestions(id);
      toast({ title: 'Questões aleatorizadas com sucesso.' });
      fetchCompetition();
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { error?: string }; status?: number } })?.response;
      const status = res?.status;
      const msg =
        status === 404
          ? 'Competição não encontrada.'
          : (res?.data?.error ?? 'Não foi possível aleatorizar as questões.');
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveDateTimeChanges = async () => {
    if (!id) return;
    const payload: Record<string, string> = {};
    if (dateEnrollmentStart.trim()) payload.enrollment_start = convertDateTimeLocalToISONaive(dateEnrollmentStart.trim());
    if (dateEnrollmentEnd.trim()) payload.enrollment_end = convertDateTimeLocalToISONaive(dateEnrollmentEnd.trim());
    if (dateApplication.trim()) payload.application = convertDateTimeLocalToISONaive(dateApplication.trim());
    if (dateExpiration.trim()) payload.expiration = convertDateTimeLocalToISONaive(dateExpiration.trim());
    if (Object.keys(payload).length === 0) {
      toast({ title: 'Nenhuma data alterada.', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      await updateCompetition(id, payload);
      toast({ title: 'Datas atualizadas com sucesso.' });
      fetchCompetition();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message
        ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Não foi possível salvar as alterações.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-12 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !competition) {
    return (
      <div className="container mx-auto py-12">
        <Button variant="ghost" onClick={() => navigate('/app/competitions')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-destructive">
            {error || 'Competição não encontrada.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const subjectDisplayName = getCompetitionSubjectDisplay(competition, subjects);
  const subjectColors = getSubjectColors(competition.subject_id ?? '', subjectDisplayName);
  const questionCount = competition.selected_question_ids?.length ?? competition.question_ids?.length ?? 0;
  const enrolledCount = competition.enrolled_count ?? enrolledStudents.length;
  const maxParticipants = competition.max_participants ?? competition.limit;
  const hasLimit = maxParticipants != null && maxParticipants > 0;
  const slotsPercent = hasLimit && maxParticipants! > 0
    ? Math.min(100, (enrolledCount / maxParticipants!) * 100)
    : 0;
  const top3 = rankingEntries.filter((e) => e.position >= 1 && e.position <= 3);
  const SHOW_INSCRIBED = 6;
  const enrolledToShow = enrolledStudents.slice(0, SHOW_INSCRIBED);
  const hasMoreEnrolled = enrolledStudents.length > SHOW_INSCRIBED;

  return (
    <div className="container mx-auto space-y-6 py-6 px-4">
      {/* Hero gamificado */}
      <Card className={`overflow-hidden border-l-4 ${subjectColors.border} ${subjectColors.bg}`}>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Button variant="ghost" size="sm" onClick={() => navigate('/app/competitions')} className="mb-2 -ml-2 text-muted-foreground">
                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar à lista
              </Button>
              <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${subjectColors.badge}`}>
                  <Trophy className={`h-6 w-6 ${subjectColors.accent}`} />
                </span>
                {competition.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {statusConfig && <Badge className={statusConfig.className}>{statusConfig.label}</Badge>}
                <Badge variant="secondary" className={subjectColors.badge}>
                  {subjectDisplayName}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Nível {competition.level}
                  {competition.scope ? ` · ${competition.scope}` : ''}
                </span>
              </div>
              {competition.description && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2 max-w-2xl">
                  {competition.description}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {canEdit && !isCompleted && (
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </Button>
              )}
              {isDraft && (
                <Button size="sm" onClick={() => setApplicationModalOpen(true)} disabled={actionLoading}>
                  <Send className="mr-2 h-4 w-4" /> Publicar
                </Button>
              )}
              {canFinalize && !isCompleted && (
                <Button size="sm" onClick={handleFinalize} disabled={actionLoading}>
                  <Flag className="mr-2 h-4 w-4" /> Finalizar
                </Button>
              )}
              {isCompleted && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/app/competitions/${id}/analytics`)}>
                  <BarChart3 className="mr-2 h-4 w-4" /> Desempenho
                </Button>
              )}
              {canRandomize && !isCompleted && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRandomizeQuestions}
                  disabled={actionLoading}
                >
                  <Shuffle className="mr-2 h-4 w-4" /> Aleatorizar questões
                </Button>
              )}
              {canStop && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStopOpen(true)}
                  disabled={actionLoading}
                  className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/50"
                >
                  <Square className="mr-2 h-4 w-4" /> Parar
                </Button>
              )}
              {canCancel && (
                <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)} disabled={actionLoading}>
                  <XCircle className="mr-2 h-4 w-4" /> Cancelar
                </Button>
              )}
              {canDeleteDirectly && (
                <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} disabled={actionLoading}>
                  <Trash2 className="mr-2 h-4 w-4" /> Excluir
                </Button>
              )}
            </div>
          </div>

          {/* Métricas em linha */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-background/60 p-3">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Inscrições
              </p>
              <p className="text-sm font-semibold truncate" title={`${formatDate(competition.enrollment_start)} → ${formatDate(competition.enrollment_end)}`}>
                até {competition.enrollment_end ? format(new Date(competition.enrollment_end), 'dd/MM', { locale: ptBR }) : '—'}
              </p>
            </div>
            <div className="rounded-lg border bg-background/60 p-3">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Prova
              </p>
              <p className="text-sm font-semibold">
                {competition.application ? format(new Date(competition.application), 'dd/MM HH:mm', { locale: ptBR }) : '—'}
              </p>
            </div>
            <div className="rounded-lg border bg-background/60 p-3">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" /> Questões
              </p>
              <p className="text-sm font-semibold">{questionCount}</p>
            </div>
            <div className="rounded-lg border bg-background/60 p-3">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <UserCheck className="h-3.5 w-3.5" /> Inscritos
              </p>
              <p className="text-sm font-semibold">
                {enrolledCount}
                {hasLimit ? ` / ${maxParticipants}` : ''}
              </p>
              {hasLimit && (
                <Progress value={slotsPercent} className="h-1.5 mt-1" />
              )}
            </div>
          </div>

          {/* Edição de data/hora (apenas quando aberta ou em andamento) */}
          {isOpenOrActive && (
            <Card className="mt-6 border-dashed">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Alterar datas e horários
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Ajuste as datas de inscrição e da prova.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="dt-enrollment_start">Início das inscrições</Label>
                    <Input
                      id="dt-enrollment_start"
                      type="datetime-local"
                      step="60"
                      value={dateEnrollmentStart}
                      onChange={(e) => setDateEnrollmentStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dt-enrollment_end">Fim das inscrições</Label>
                    <Input
                      id="dt-enrollment_end"
                      type="datetime-local"
                      step="60"
                      value={dateEnrollmentEnd}
                      onChange={(e) => setDateEnrollmentEnd(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dt-application">Início da prova</Label>
                    <Input
                      id="dt-application"
                      type="datetime-local"
                      step="60"
                      value={dateApplication}
                      onChange={(e) => setDateApplication(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dt-expiration">Fim da prova</Label>
                    <Input
                      id="dt-expiration"
                      type="datetime-local"
                      step="60"
                      value={dateExpiration}
                      onChange={(e) => setDateExpiration(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  onClick={handleSaveDateTimeChanges}
                  disabled={actionLoading}
                >
                  {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar alterações de data/hora
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Recompensas resumidas */}
          {(competition.reward_config?.participation_coins != null ||
            (competition.reward_config?.ranking_rewards?.length ?? 0) > 0 ||
            competition.reward_participation != null) && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <Coins className="h-4 w-4 text-amber-500" />
              <span>
                Participação: {String(competition.reward_config?.participation_coins ?? competition.reward_participation ?? '—')} moedas
                {(competition.reward_config?.ranking_rewards?.length ?? 0) > 0 && (
                  <> · Pódio: {competition.reward_config!.ranking_rewards!.slice(0, 3).map((r) => `${r.position}º ${formatCoins(r.coins)}`).join(', ')}</>
                )}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Questões (collapsible) */}
      <Collapsible open={questionsSectionOpen} onOpenChange={setQuestionsSectionOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BookOpen className="h-5 w-5" /> Questões
                  <Badge variant="secondary">{questionCount}</Badge>
                </CardTitle>
                {questionsSectionOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {questionsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Carregando questões...</span>
                </div>
              ) : !questionCount ? (
                <p className="text-sm text-muted-foreground py-4">Nenhuma questão selecionada.</p>
              ) : questions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Não foi possível carregar as questões.</p>
              ) : (
                <div className="space-y-2">
                  {questions.map((q, index) => {
                    const handleOpenDetails = () => {
                      if (!competition) return;
                      const previewQuestion: EvaluationQuestion = {
                        id: q.id,
                        title: q.title,
                        text: q.text,
                        formattedText: q.text,
                        type: 'multipleChoice',
                        subjectId: competition.subject_id ?? '',
                        subject: competition.subject_id
                          ? {
                              id: competition.subject_id,
                              name: subjectDisplayName,
                            }
                          : undefined,
                        educationStage: undefined,
                        grade: undefined,
                        difficulty: q.difficulty ?? '',
                        value: q.value ?? 1,
                        solution: '',
                        formattedSolution: '',
                        options: [],
                        secondStatement: '',
                        skills: undefined,
                        created_by: '',
                        lastModifiedBy: undefined,
                      };
                      setSelectedQuestion(previewQuestion);
                    };

                    return (
                      <div
                        key={q.id}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            Questão {index + 1}
                            {q.title ? ` · ${q.title}` : ''}
                          </p>
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {q.text}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-xs text-muted-foreground">
                            {q.difficulty ?? '—'}{' '}
                            {typeof q.value === 'number' ? `· ${q.value} pts` : ''}
                          </span>
                          <Button variant="outline" size="sm" onClick={handleOpenDetails}>
                            Ver detalhes
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Inscritos (collapsible, primeiros 6 visíveis) */}
      <Collapsible open={enrolledSectionOpen} onOpenChange={setEnrolledSectionOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserCheck className="h-5 w-5" /> Inscritos
                  <Badge variant="secondary">{enrolledCount}</Badge>
                </CardTitle>
                {enrolledStudents.length > 0 && (enrolledSectionOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />)}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {enrolledLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                  <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
                </div>
              ) : enrolledError ? (
                <p className="text-sm text-destructive py-4">{enrolledError}</p>
              ) : !enrolledStudents.length ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum inscrito ainda.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(enrolledSectionOpen ? enrolledStudents : enrolledToShow).map((student) => {
                    const info = [student.class_name, student.grade_name].filter(Boolean).join(' · ');
                    return (
                      <div key={student.id} className={`flex items-center gap-3 rounded-lg border p-3 border-l-4 ${subjectColors.border}`}>
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-semibold ${subjectColors.badge}`}>
                          {student.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{student.name}</p>
                          {info && <p className="text-xs text-muted-foreground truncate">{info}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!enrolledSectionOpen && hasMoreEnrolled && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Clique em &quot;Inscritos&quot; para ver todos ({enrolledStudents.length}).
                </p>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Elegíveis (collapsible) — só exibe durante a janela de inscrição e enquanto não finalizada/cancelada */}
      {showEligibleSection && (
        <Collapsible open={eligibleSectionOpen} onOpenChange={setEligibleSectionOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" /> Podem se inscrever
                    <Badge variant="outline">{eligibleLoading ? '...' : eligibleStudents.length}</Badge>
                  </CardTitle>
                  {eligibleSectionOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
            <CardContent>
              {eligibleLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p>Buscando alunos elegíveis...</p>
                </div>
              ) : eligibleError ? (
                <p className="text-sm text-destructive py-4">{eligibleError}</p>
              ) : !eligibleStudents.length ? (
                <p className="text-sm text-muted-foreground py-4">
                  Nenhum aluno elegível no momento.
                </p>
              ) : (
                <div className="grid max-h-72 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                  {eligibleStudents.map((student) => {
                    const escola = student.school_name;
                    const serie = student.grade_name;
                    const turma = student.class_name;
                    const initials = student.name
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0]?.toUpperCase())
                      .join('');
                    return (
                      <div
                        key={student.id}
                        className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background px-3 py-3 text-sm shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow">
                            {initials || student.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{student.name}</p>
                            {escola && (
                              <p className="truncate text-[11px] text-muted-foreground">
                                {escola}
                              </p>
                            )}
                          </div>
                        </div>
                        {(serie || turma) && (
                          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                            {serie && (
                              <span className="rounded-full bg-background/60 px-2 py-0.5 font-medium">
                                {serie}
                              </span>
                            )}
                            {turma && (
                              <span className="rounded-full bg-background/60 px-2 py-0.5">
                                {turma}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Ranking (quando encerrada) — pódio + tabela */}
      {isEncerrada && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Award className="h-5 w-5" /> Ranking
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {rankingForbidden ? (
              <p className="text-sm text-muted-foreground py-4">Ranking disponível após encerramento.</p>
            ) : rankingLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
                <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
              </div>
            ) : rankingError ? (
              <p className="text-sm text-destructive py-4">{rankingError}</p>
            ) : !rankingEntries.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum participante no ranking.</p>
            ) : (
              <>
                {top3.length >= 2 && (
                  <div className="flex items-end justify-center gap-2 sm:gap-4">
                    {top3.find((e) => e.position === 2) && (
                      <div className="flex flex-col items-center gap-1 order-1">
                        <span className="text-2xl">{getMedalEmoji(2)}</span>
                        <p className="text-sm font-semibold truncate max-w-[100px] text-center">
                          {top3.find((e) => e.position === 2)?.name}
                        </p>
                        <p className="text-xs text-muted-foreground">2º</p>
                      </div>
                    )}
                    {top3.find((e) => e.position === 1) && (
                      <div className="flex flex-col items-center gap-1 order-0">
                        <span className="text-3xl">{getMedalEmoji(1)}</span>
                        <p className="text-sm font-semibold truncate max-w-[100px] text-center">
                          {top3.find((e) => e.position === 1)?.name}
                        </p>
                        <p className="text-xs text-muted-foreground">1º</p>
                      </div>
                    )}
                    {top3.find((e) => e.position === 3) && (
                      <div className="flex flex-col items-center gap-1 order-2">
                        <span className="text-2xl">{getMedalEmoji(3)}</span>
                        <p className="text-sm font-semibold truncate max-w-[100px] text-center">
                          {top3.find((e) => e.position === 3)?.name}
                        </p>
                        <p className="text-xs text-muted-foreground">3º</p>
                      </div>
                    )}
                  </div>
                )}
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead className="hidden sm:table-cell">Turma</TableHead>
                        <TableHead className="text-right">Nota</TableHead>
                        <TableHead className="text-right w-20">Moedas</TableHead>
                        <TableHead className="w-[100px] text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rankingEntries.map((entry) => (
                        <TableRow key={`${entry.student_id}-${entry.position}`}>
                          <TableCell className="font-medium">
                            {getMedalEmoji(entry.position) || `${entry.position}º`}
                          </TableCell>
                          <TableCell>{entry.name}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">
                            {entry.class_name ?? '—'}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {entry.value_label ?? entry.score_percentage ?? entry.value}
                          </TableCell>
                          <TableCell className="text-right">
                            {entry.coins_earned != null && entry.coins_earned > 0
                              ? `+${formatCoins(entry.coins_earned)}`
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedRankingEntry(entry)}
                              className="gap-1"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Ver resultados
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal de resultados detalhados do aluno no ranking */}
      <Dialog open={!!selectedRankingEntry} onOpenChange={(open) => !open && setSelectedRankingEntry(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Resultados do aluno
            </DialogTitle>
            <DialogDescription>
              {selectedRankingEntry?.name}
              {selectedRankingEntry?.class_name && ` · ${selectedRankingEntry.class_name}`}
              {selectedRankingEntry?.school_name && ` · ${selectedRankingEntry.school_name}`}
            </DialogDescription>
          </DialogHeader>
          {selectedRankingEntry && (
            <div className="grid gap-3 py-2">
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                <span className="text-sm text-muted-foreground">Posição</span>
                <span className="font-semibold">
                  {getMedalEmoji(selectedRankingEntry.position) || `${selectedRankingEntry.position}º`}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                <span className="text-sm text-muted-foreground">Nota / Resultado</span>
                <span className="font-semibold">
                  {selectedRankingEntry.value_label ?? selectedRankingEntry.score_percentage ?? selectedRankingEntry.value}
                </span>
              </div>
              {selectedRankingEntry.correct_answers != null && selectedRankingEntry.total_questions != null && (
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                  <span className="text-sm text-muted-foreground">Acertos</span>
                  <span className="font-semibold">
                    {selectedRankingEntry.correct_answers} / {selectedRankingEntry.total_questions}
                  </span>
                </div>
              )}
              {selectedRankingEntry.score_percentage != null && (
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                  <span className="text-sm text-muted-foreground">Percentual</span>
                  <span className="font-semibold">{selectedRankingEntry.score_percentage}%</span>
                </div>
              )}
              {selectedRankingEntry.tempo_gasto != null && (
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                  <span className="text-sm text-muted-foreground">Tempo</span>
                  <span className="font-semibold">
                    {selectedRankingEntry.tempo_gasto < 60
                      ? `${selectedRankingEntry.tempo_gasto} min`
                      : `${Math.floor(selectedRankingEntry.tempo_gasto / 60)}h ${selectedRankingEntry.tempo_gasto % 60} min`}
                  </span>
                </div>
              )}
              {selectedRankingEntry.coins_earned != null && selectedRankingEntry.coins_earned > 0 && (
                <div className="flex items-center justify-between rounded-lg border bg-amber-500/10 px-3 py-2">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Coins className="h-4 w-4 text-amber-500" /> Moedas
                  </span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    +{formatCoins(selectedRankingEntry.coins_earned)}
                  </span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de detalhes da questão */}
      <Dialog open={!!selectedQuestion} onOpenChange={(open) => !open && setSelectedQuestion(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedQuestion?.title ? selectedQuestion.title : 'Detalhes da questão'}
            </DialogTitle>
            <DialogDescription>Visualização completa da questão, incluindo imagens e alternativas.</DialogDescription>
          </DialogHeader>
          {selectedQuestion && (
            <QuestionPreview question={selectedQuestion} />
          )}
        </DialogContent>
      </Dialog>

      <EditCompetitionModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSuccess={() => { fetchCompetition(); setEditOpen(false); }}
        competitionId={id!}
        competition={competition}
      />

      <EditCompetitionApplicationModal
        competitionId={id ?? null}
        competitionName={competition?.name ?? ''}
        open={applicationModalOpen}
        onClose={() => setApplicationModalOpen(false)}
        onSuccess={() => { fetchCompetition(); setApplicationModalOpen(false); }}
      />

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar competição</AlertDialogTitle>
            <AlertDialogDescription>Confirme o cancelamento. Opcionalmente informe o motivo.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label className="text-sm">Motivo (opcional)</Label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} className="mt-1 resize-none" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={actionLoading} className="bg-destructive text-destructive-foreground" onClick={handleCancel}>Cancelar competição</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={stopOpen} onOpenChange={setStopOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Parar competição</AlertDialogTitle>
            <AlertDialogDescription>Encerrar esta competição agora? O ranking será gerado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={actionLoading} onClick={handleStop}>Parar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir competição</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A competição e os dados relacionados (inscrições, resultados, recompensas) serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={actionLoading} className="bg-destructive text-destructive-foreground" onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
