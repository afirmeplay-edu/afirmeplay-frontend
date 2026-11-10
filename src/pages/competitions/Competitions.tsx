/**
 * Lista de competições (admin/coordenador).
 * Rota: /app/competitions
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, Filter, Trophy, Search, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { formatCompetitionLevel } from '@/utils/competition/competitionLevel';
import { enrichListWithSubjectName } from '@/utils/competition/competitionSubjectName';
import {
  getCompetitions,
  deleteCompetition,
  cancelCompetition,
} from '@/services/competition/competitionsApi';
import type { Competition, CompetitionFilters } from '@/types/competition-types';
import { CompetitionCard } from '@/components/competitions/CompetitionCard';
import { CreateCompetitionModal } from '@/components/competitions/CreateCompetitionModal';
import { AddQuestionsModal } from '@/components/competitions/AddQuestionsModal';
import { EditCompetitionApplicationModal } from '@/components/competitions/EditCompetitionApplicationModal';
import { useAuth } from '@/context/authContext';

interface SubjectOption {
  id: string;
  name: string;
}

const DEFAULT_FILTERS: CompetitionFilters = {
  status: 'all',
  subject_id: 'all',
  level: 'all',
};

const DEBOUNCE_MS = 350;
const PAGE_SIZE = 20;

/**
 * Validação mínima dos campos de competição usados nesta tela
 * antes de seguir para renderização/ações.
 */
function isValidCompetitionListItem(raw: unknown): raw is Competition {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as Competition;

  if (typeof c.id !== 'string') return false;
  if (typeof c.name !== 'string') return false;
  if (typeof c.subject_id !== 'string') return false;
  if (typeof c.level !== 'number') return false;
  if (typeof c.status !== 'string') return false;

  if (c.subject_name != null && typeof c.subject_name !== 'string') return false;

  const dateFields: (keyof Competition)[] = [
    'enrollment_start',
    'enrollment_end',
    'application',
    'expiration',
  ];
  for (const field of dateFields) {
    const value = c[field];
    if (value != null && typeof value !== 'string') return false;
  }

  return true;
}

function canManageCompetitions(role: string): boolean {
  const r = (role || '').toLowerCase();
  return r === 'admin' || r === 'coordenador' || r === 'diretor' || r === 'tecadm';
}

export default function Competitions() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = canManageCompetitions(user?.role ?? '');

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [filters, setFilters] = useState<CompetitionFilters>(DEFAULT_FILTERS);
  const [debouncedFilters, setDebouncedFilters] = useState<CompetitionFilters>(DEFAULT_FILTERS);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [addQuestionsId, setAddQuestionsId] = useState<string | null>(null);
  const [schedulePublishId, setSchedulePublishId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilters(filters), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filters]);

  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.subject_id !== 'all' ||
    filters.level !== 'all' ||
    (filters.from_date ?? '').length > 0 ||
    (filters.to_date ?? '').length > 0 ||
    searchTerm.length > 0;

  const fetchCompetitions = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...debouncedFilters, page, page_size: PAGE_SIZE };
      const list = await getCompetitions(params);
      const rawList = Array.isArray(list) ? list : [];
      const safeList = rawList.filter(isValidCompetitionListItem);

      if (safeList.length !== rawList.length) {
        console.warn(
          '[Competitions] Alguns itens de competição foram descartados por falha de validação de campos esperados.',
        );
      }

      setCompetitions(safeList);
      setTotal(safeList.length);
    } catch (error) {
      console.error('Erro ao carregar competições:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as competições.',
        variant: 'destructive',
      });
      setCompetitions([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedFilters, page, toast]);

  useEffect(() => {
    fetchCompetitions();
  }, [fetchCompetitions]);

  const competitionsWithSubjectName = useMemo(
    () => enrichListWithSubjectName(competitions, subjects),
    [competitions, subjects],
  );

  const filteredCompetitions = useMemo(() => {
    let list = competitionsWithSubjectName;
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      list = list.filter(
        (c) => c.name?.toLowerCase().includes(term) || c.subject_name?.toLowerCase().includes(term)
      );
    }
    if (debouncedFilters.from_date) {
      const from = new Date(debouncedFilters.from_date).getTime();
      list = list.filter((c) => c.application && new Date(c.application).getTime() >= from);
    }
    if (debouncedFilters.to_date) {
      const to = new Date(debouncedFilters.to_date).getTime();
      list = list.filter((c) => c.application && new Date(c.application).getTime() <= to);
    }
    return list;
  }, [competitionsWithSubjectName, searchTerm, debouncedFilters.from_date, debouncedFilters.to_date]);

  useEffect(() => {
    let cancelled = false;
    api.get<SubjectOption[]>('/subjects').then((res) => {
      if (!cancelled && Array.isArray(res.data)) setSubjects(res.data);
    }).catch(() => { if (!cancelled) setSubjects([]); });
    return () => { cancelled = true; };
  }, []);

  const handleView = (id: string) => navigate(`/app/competitions/${id}`);
  const handleEdit = (id: string) => setEditId(id);
  const handleScheduleAndPublish = (id: string) => setSchedulePublishId(id);
  const handleAddQuestions = (id: string) => setAddQuestionsId(id);
  const handleDeleteClick = (id: string) => setDeleteId(id);
  const handleCancelClick = (id: string) => setCancelId(id);

  const runAction = async (
    id: string,
    fn: () => Promise<unknown>,
    successMsg: string,
    errorMsg: string
  ) => {
    setActionLoading(true);
    try {
      await fn();
      toast({ title: successMsg });
      fetchCompetitions();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        errorMsg;
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    await runAction(deleteId, () => deleteCompetition(deleteId), 'Competição excluída.', 'Não foi possível excluir.');
    setDeleteId(null);
  };

  const confirmCancel = async () => {
    if (!cancelId) return;
    await runAction(
      cancelId,
      () => cancelCompetition(cancelId, cancelReason.trim() ? { reason: cancelReason } : undefined),
      'Competição cancelada.',
      'Não foi possível cancelar.'
    );
    setCancelId(null);
    setCancelReason('');
  };

  const competitionForQuestions = useMemo(
    () => (addQuestionsId ? competitionsWithSubjectName.find((c) => c.id === addQuestionsId) : null),
    [addQuestionsId, competitionsWithSubjectName],
  );
  const competitionForSchedule = useMemo(
    () => (schedulePublishId ? competitionsWithSubjectName.find((c) => c.id === schedulePublishId) : null),
    [schedulePublishId, competitionsWithSubjectName],
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showPagination = total > PAGE_SIZE;

  return (
    <div className="container mx-auto space-y-6 py-6 px-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="flex flex-wrap items-center gap-2 sm:gap-3 text-2xl sm:text-3xl font-bold tracking-tight">
            <Trophy className="h-7 w-7 sm:h-8 sm:w-8 text-primary shrink-0" />
            Competições
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Lista de competições cadastradas.
          </p>
        </div>
        {canManage && (
          <div className="flex justify-center w-full sm:w-auto sm:justify-end">
            <Button onClick={() => setModalOpen(true)} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Nova Competição
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou disciplina..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center justify-between">
            <Collapsible open={showFilters} onOpenChange={setShowFilters}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="mr-2 h-4 w-4" />
                  Filtros
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="ml-2 rounded-full px-1.5 text-xs">
                      {[filters.status !== 'all', filters.subject_id !== 'all', filters.level !== 'all', (filters.from_date ?? '').length > 0, (filters.to_date ?? '').length > 0, searchTerm.length > 0].filter(Boolean).length}
                    </Badge>
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
                      <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="rascunho">Rascunho</SelectItem>
                        <SelectItem value="draft">Rascunho</SelectItem>
                        <SelectItem value="aberta">Abertas</SelectItem>
                        <SelectItem value="enrollment_open">Inscrições abertas</SelectItem>
                        <SelectItem value="active">Ativa</SelectItem>
                        <SelectItem value="completed">Finalizadas</SelectItem>
                        <SelectItem value="cancelled">Canceladas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Disciplina</Label>
                    <Select value={filters.subject_id} onValueChange={(v) => setFilters((f) => ({ ...f, subject_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Nível</Label>
                    <Select value={filters.level} onValueChange={(v) => setFilters((f) => ({ ...f, level: v }))}>
                      <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="1">{formatCompetitionLevel(1)}</SelectItem>
                        <SelectItem value="2">{formatCompetitionLevel(2)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Data aplicação (de)</Label>
                    <Input type="date" value={filters.from_date ?? ''} onChange={(e) => setFilters((f) => ({ ...f, from_date: e.target.value || undefined }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data aplicação (até)</Label>
                    <Input type="date" value={filters.to_date ?? ''} onChange={(e) => setFilters((f) => ({ ...f, to_date: e.target.value || undefined }))} />
                  </div>
                </div>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(''); setFilters({ ...DEFAULT_FILTERS, from_date: undefined, to_date: undefined }); }}>
                    <X className="mr-2 h-4 w-4" /> Limpar filtros
                  </Button>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card><CardContent className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></CardContent></Card>
      ) : filteredCompetitions.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          {hasActiveFilters || searchTerm ? 'Nenhuma competição encontrada com os filtros.' : 'Nenhuma competição. Crie uma nova.'}
        </CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCompetitions.map((comp) => (
              <CompetitionCard
                key={comp.id}
                competition={comp}
                userRole={user?.role}
                onView={handleView}
                onEdit={canManage ? handleEdit : undefined}
                onCancel={canManage ? handleCancelClick : undefined}
                onDelete={canManage ? handleDeleteClick : undefined}
                onScheduleAndPublish={canManage ? handleScheduleAndPublish : undefined}
              />
            ))}
          </div>
          {showPagination && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Página {page} de {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <CreateCompetitionModal
        open={modalOpen || !!editId}
        onClose={() => { setModalOpen(false); setEditId(null); }}
        onSuccess={() => { fetchCompetitions(); setModalOpen(false); setEditId(null); }}
        editId={editId}
      />

      <AddQuestionsModal
        competitionId={addQuestionsId}
        competitionName={competitionForQuestions?.name ?? ''}
        competitionSubjectId={competitionForQuestions?.subject_id ?? null}
        open={!!addQuestionsId}
        onClose={() => setAddQuestionsId(null)}
        onSuccess={() => { fetchCompetitions(); setAddQuestionsId(null); }}
      />

      <EditCompetitionApplicationModal
        competitionId={schedulePublishId}
        competitionName={competitionForSchedule?.name ?? ''}
        open={!!schedulePublishId}
        onClose={() => setSchedulePublishId(null)}
        onSuccess={() => { fetchCompetitions(); setSchedulePublishId(null); }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir competição</AlertDialogTitle>
            <AlertDialogDescription>Excluir esta competição? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={actionLoading} className="bg-destructive text-destructive-foreground" onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelId} onOpenChange={(o) => { if (!o) { setCancelId(null); setCancelReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar competição</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza?</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label className="text-sm">Motivo (opcional)</Label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} className="mt-1 resize-none" placeholder="Motivo do cancelamento" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={actionLoading} className="bg-destructive text-destructive-foreground" onClick={confirmCancel}>Cancelar competição</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
