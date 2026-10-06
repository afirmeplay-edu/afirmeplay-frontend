import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarIcon,
  Download,
  Eye,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Truck,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { FormMultiSelect } from '@/components/ui/form-multi-select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';
import { cn } from '@/lib/utils';
import { getUserHierarchyContext, type UserHierarchyContext } from '@/utils/userHierarchy';
import { ParticipationReportApiService } from '@/services/reports/participationReportApi';
import { LogisticsApiService, getLogisticsApiErrorMessage } from '@/services/logisticsApi';
import { generateLogisticsPdf, type LogisticsPdfOrientation } from '@/services/reports/logisticsPdf';
import type {
  LogisticsFilterAvaliacao,
  LogisticsFilterEntity,
  LogisticsFilterTurma,
  LogisticsItemPayload,
  LogisticsSchedule,
  LogisticsScheduleItem,
  LogisticsScheduleStatus,
} from '@/types/logistics';

interface EditableRow {
  key: string;
  id?: string;
  class_id: string;
  class_name: string;
  shift: string;
  school_id: string;
  school_name: string;
  grade_id: string | null;
  grade_name: string;
  students_count: number;
  scheduled_date: string | null;
  tablets_qty: number;
  booklets_qty: number;
  notes: string;
}

interface PublishedChangeSummary {
  dateChanged: EditableRow[];
  added: EditableRow[];
  removed: EditableRow[];
  schools: string[];
}

const STATUS_LABEL: Record<LogisticsScheduleStatus, string> = {
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  cancelado: 'Cancelado',
};

function StatusBadge({ status }: { status: LogisticsScheduleStatus }) {
  if (status === 'publicado') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">{STATUS_LABEL[status]}</Badge>;
  }
  if (status === 'cancelado') return <Badge variant="destructive">{STATUS_LABEL[status]}</Badge>;
  return <Badge variant="secondary">{STATUS_LABEL[status]}</Badge>;
}

function evaluationModeLabel(mode?: string | null): string {
  if (mode === 'physical') return 'Impressa (caderno)';
  if (mode === 'subjective') return 'Subjetiva (impressa)';
  return 'Online (tablet)';
}

function formatDateBR(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy');
  } catch {
    return iso;
  }
}

function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function sortRows(rows: EditableRow[]): EditableRow[] {
  return [...rows].sort(
    (a, b) =>
      a.school_name.localeCompare(b.school_name, 'pt-BR') ||
      a.grade_name.localeCompare(b.grade_name, 'pt-BR', { numeric: true }) ||
      a.class_name.localeCompare(b.class_name, 'pt-BR', { numeric: true }) ||
      (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? '')
  );
}

function itemToRow(item: LogisticsScheduleItem): EditableRow {
  return {
    key: item.id,
    id: item.id,
    class_id: item.class_id,
    class_name: item.class_name ?? '',
    shift: item.shift ?? '',
    school_id: item.school_id,
    school_name: item.school_name ?? '',
    grade_id: item.grade_id,
    grade_name: item.grade_name ?? '',
    students_count: item.students_count ?? 0,
    scheduled_date: item.scheduled_date,
    tablets_qty: item.tablets_qty ?? 0,
    booklets_qty: item.booklets_qty ?? 0,
    notes: item.notes ?? '',
  };
}

function rowsToPayload(rows: EditableRow[]): LogisticsItemPayload[] {
  return rows.map((r) => ({
    ...(r.id ? { id: r.id } : {}),
    class_id: r.class_id,
    scheduled_date: r.scheduled_date,
    tablets_qty: r.tablets_qty,
    booklets_qty: r.booklets_qty,
    notes: r.notes.trim() || null,
  }));
}

function parseQty(value: string): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function pruneSelection(prev: string[], options: Array<{ id: string }> | undefined): string[] {
  if (!options) return prev.length ? [] : prev;
  const allowed = new Set(options.map((o) => o.id));
  const next = prev.filter((id) => allowed.has(id));
  return next.length === prev.length ? prev : next;
}

function DatePickerButton({
  value,
  onChange,
  disabled,
  highlightEmpty,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  highlightEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            'w-[140px] justify-start font-normal',
            !value && 'text-muted-foreground',
            !value && highlightEmpty && 'border-amber-500 text-amber-700 dark:text-amber-400'
          )}
        >
          <CalendarIcon className="h-4 w-4 mr-2" />
          {value ? formatDateBR(value) : 'Sem data'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ptBR}
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            onChange(d ? toIsoDate(d) : null);
            setOpen(false);
          }}
          initialFocus
        />
        {value && (
          <div className="border-t p-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Limpar data
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default function LogisticaAvaliacao() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramId = searchParams.get('id');

  // Município
  const [hierarchy, setHierarchy] = useState<UserHierarchyContext | null>(null);
  const [loadingHierarchy, setLoadingHierarchy] = useState(true);
  const [estados, setEstados] = useState<LogisticsFilterEntity[]>([]);
  const [municipios, setMunicipios] = useState<LogisticsFilterEntity[]>([]);
  const [selectedEstado, setSelectedEstado] = useState('all');
  const [selectedMunicipio, setSelectedMunicipio] = useState('all');

  // Lista
  const [schedules, setSchedules] = useState<LogisticsSchedule[]>([]);
  const [listCanManage, setListCanManage] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | LogisticsScheduleStatus>('all');

  // Editor
  const [creatingNew, setCreatingNew] = useState(false);
  const [current, setCurrent] = useState<LogisticsSchedule | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [snapshot, setSnapshot] = useState<{ title: string; notes: string; rows: EditableRow[] }>({
    title: '',
    notes: '',
    rows: [],
  });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkDateOpen, setBulkDateOpen] = useState(false);

  // Filtros do editor
  const [etapas, setEtapas] = useState<LogisticsFilterEntity[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<LogisticsFilterAvaliacao[]>([]);
  const [escolasOpts, setEscolasOpts] = useState<LogisticsFilterEntity[]>([]);
  const [seriesOpts, setSeriesOpts] = useState<LogisticsFilterEntity[]>([]);
  const [turmasOpts, setTurmasOpts] = useState<LogisticsFilterTurma[]>([]);
  const [selectedEtapa, setSelectedEtapa] = useState('');
  const [selectedAvaliacao, setSelectedAvaliacao] = useState('');
  const [selectedEscolas, setSelectedEscolas] = useState<string[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<string[]>([]);
  const [selectedTurmas, setSelectedTurmas] = useState<string[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Ações
  const [saving, setSaving] = useState(false);
  const [publishedChanges, setPublishedChanges] = useState<PublishedChangeSummary | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfOrientation, setPdfOrientation] = useState<LogisticsPdfOrientation>('portrait');
  const [exportingPdf, setExportingPdf] = useState(false);

  const canSelectCity = hierarchy?.restrictions?.canSelectMunicipality ?? false;
  const cityId = canSelectCity
    ? selectedMunicipio !== 'all'
      ? selectedMunicipio
      : ''
    : hierarchy?.municipality?.id || user?.city_id || user?.tenant_id || '';
  const cityName = canSelectCity
    ? municipios.find((m) => m.id === selectedMunicipio)?.nome ?? ''
    : hierarchy?.municipality?.name ?? '';

  const inEditor = creatingNew || Boolean(paramId);
  const editable = current ? current.can_manage && current.status !== 'cancelado' : creatingNew && listCanManage;
  const testLocked = Boolean(current);

  // ---------------------------------------------------------------------------
  // Município (admin escolhe; demais perfis usam o município do usuário)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user?.id || !user?.role) {
      setLoadingHierarchy(false);
      return;
    }
    let cancelled = false;
    setLoadingHierarchy(true);
    getUserHierarchyContext(user.id, user.role)
      .then((ctx) => {
        if (cancelled) return;
        setHierarchy(ctx);
        if (ctx.restrictions?.canSelectMunicipality && ctx.municipality?.id) {
          setSelectedMunicipio(ctx.municipality.id);
          if (ctx.municipality.state) setSelectedEstado(ctx.municipality.state);
        }
      })
      .catch(() => {
        if (cancelled) return;
        const hasOwnCity = Boolean(user.city_id || user.tenant_id);
        setHierarchy({
          restrictions: {
            canSelectState: !hasOwnCity,
            canSelectMunicipality: !hasOwnCity,
            canSelectSchool: false,
            canSelectGrade: true,
            canSelectClass: true,
          },
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingHierarchy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, user?.city_id, user?.tenant_id]);

  useEffect(() => {
    if (!canSelectCity) return;
    let cancelled = false;
    ParticipationReportApiService.getOpcoesFiltros({})
      .then((data) => {
        if (cancelled) return;
        setEstados(data.estados ?? []);
        setSelectedEstado((prev) => {
          if (prev === 'all') return prev;
          const match = (data.estados ?? []).find(
            (s) => s.id === prev || s.nome.toLowerCase() === prev.toLowerCase()
          );
          return match ? match.id : prev;
        });
      })
      .catch(() => {
        if (!cancelled) setEstados([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canSelectCity]);

  useEffect(() => {
    if (!canSelectCity || selectedEstado === 'all') {
      setMunicipios([]);
      return;
    }
    let cancelled = false;
    ParticipationReportApiService.getOpcoesFiltros({ estado: selectedEstado })
      .then((data) => {
        if (!cancelled) setMunicipios(data.municipios ?? []);
      })
      .catch(() => {
        if (!cancelled) setMunicipios([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canSelectCity, selectedEstado]);

  // ---------------------------------------------------------------------------
  // Lista
  // ---------------------------------------------------------------------------
  const loadList = useCallback(async () => {
    if (!cityId) {
      setSchedules([]);
      setListCanManage(false);
      return;
    }
    setLoadingList(true);
    try {
      const data = await LogisticsApiService.listSchedules(
        statusFilter === 'all' ? {} : { status: statusFilter },
        cityId
      );
      setSchedules(data.schedules);
      setListCanManage(data.can_manage);
    } catch (error) {
      setSchedules([]);
      toast({
        title: 'Erro ao carregar cronogramas',
        description: getLogisticsApiErrorMessage(error, 'Tente novamente.'),
        variant: 'destructive',
      });
    } finally {
      setLoadingList(false);
    }
  }, [cityId, statusFilter, toast]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // ---------------------------------------------------------------------------
  // Abrir cronograma
  // ---------------------------------------------------------------------------
  const resetEditor = useCallback(() => {
    setCurrent(null);
    setTitle('');
    setNotes('');
    setRows([]);
    setSnapshot({ title: '', notes: '', rows: [] });
    setSelectedKeys(new Set());
    setSelectedEtapa('');
    setSelectedAvaliacao('');
    setSelectedEscolas([]);
    setSelectedSeries([]);
    setSelectedTurmas([]);
  }, []);

  const applySchedule = useCallback((s: LogisticsSchedule) => {
    const loadedRows = sortRows((s.items ?? []).map(itemToRow));
    setCurrent(s);
    setTitle(s.title ?? '');
    setNotes(s.notes ?? '');
    setRows(loadedRows);
    setSnapshot({ title: s.title ?? '', notes: s.notes ?? '', rows: loadedRows });
    setSelectedKeys(new Set());
    setSelectedEtapa(s.education_stage_id ?? '');
    setSelectedAvaliacao(s.test_id);
  }, []);

  useEffect(() => {
    if (!paramId || !cityId || current?.id === paramId) return;
    let cancelled = false;
    setLoadingSchedule(true);
    LogisticsApiService.getSchedule(paramId, cityId)
      .then((s) => {
        if (cancelled) return;
        setCreatingNew(false);
        setSelectedEscolas([]);
        setSelectedSeries([]);
        setSelectedTurmas([]);
        applySchedule(s);
      })
      .catch((error) => {
        if (cancelled) return;
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          toast({
            title: 'Cronograma indisponível',
            description:
              'Este cronograma não está mais disponível. Ele pode ter sido cancelado ou removido junto com a avaliação.',
          });
        } else {
          toast({
            title: 'Não foi possível abrir o cronograma',
            description: getLogisticsApiErrorMessage(error, 'Cronograma não encontrado.'),
            variant: 'destructive',
          });
        }
        setSearchParams({}, { replace: true });
        void loadList();
      })
      .finally(() => {
        if (!cancelled) setLoadingSchedule(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paramId, cityId, current?.id, applySchedule, setSearchParams, toast, loadList]);

  const isDirty = useMemo(() => {
    if (title !== snapshot.title || notes !== snapshot.notes) return true;
    return JSON.stringify(rowsToPayload(rows)) !== JSON.stringify(rowsToPayload(snapshot.rows));
  }, [title, notes, rows, snapshot]);

  const goToList = () => {
    if (editable && isDirty && !window.confirm('Há alterações não salvas. Deseja sair mesmo assim?')) return;
    setCreatingNew(false);
    resetEditor();
    setSearchParams({});
    void loadList();
  };

  const startNew = () => {
    resetEditor();
    setSearchParams({});
    setCreatingNew(true);
  };

  const openFromList = (id: string) => {
    resetEditor();
    setCreatingNew(false);
    setSearchParams({ id });
  };

  // ---------------------------------------------------------------------------
  // Filtros em cascata (Etapa → Avaliação → Escolas → Séries → Turmas)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!inEditor || !editable || !cityId) return;
    let cancelled = false;
    setLoadingFilters(true);
    LogisticsApiService.getOpcoesFiltros(
      {
        etapa: selectedEtapa || undefined,
        avaliacao: selectedAvaliacao || undefined,
        escolas: selectedEscolas,
        series: selectedSeries,
      },
      cityId
    )
      .then((data) => {
        if (cancelled) return;
        setEtapas(data.etapas);
        setAvaliacoes(data.avaliacoes);
        setEscolasOpts(data.escolas ?? []);
        setSeriesOpts(data.series ?? []);
        setTurmasOpts(data.turmas ?? []);
        setSelectedEscolas((prev) => pruneSelection(prev, data.escolas));
        setSelectedSeries((prev) => pruneSelection(prev, data.series));
        setSelectedTurmas((prev) => pruneSelection(prev, data.turmas));
      })
      .catch((error) => {
        if (cancelled) return;
        toast({
          title: 'Erro ao carregar filtros',
          description: getLogisticsApiErrorMessage(error, 'Tente novamente.'),
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingFilters(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inEditor, editable, cityId, selectedEtapa, selectedAvaliacao, selectedEscolas, selectedSeries, toast]);

  const handleEtapaChange = (value: string) => {
    setSelectedEtapa(value === 'all' ? '' : value);
    setSelectedEscolas([]);
    setSelectedSeries([]);
    setSelectedTurmas([]);
  };

  const handleAvaliacaoChange = (value: string) => {
    if (value === selectedAvaliacao) return;
    if (rows.length > 0) {
      setRows([]);
      setSelectedKeys(new Set());
      toast({
        title: 'Turmas removidas',
        description: 'A lista de turmas foi limpa porque a avaliação mudou.',
      });
    }
    setSelectedAvaliacao(value);
    setSelectedEscolas([]);
    setSelectedSeries([]);
    setSelectedTurmas([]);
    if (!title.trim()) {
      const av = avaliacoes.find((a) => a.id === value);
      if (av) setTitle(`Logística - ${av.titulo}`.slice(0, 200));
    }
  };

  const handleLoadPreview = async () => {
    if (!selectedAvaliacao || !cityId) return;
    setLoadingPreview(true);
    try {
      const preview = await LogisticsApiService.getPrevia(
        {
          etapa: selectedEtapa || undefined,
          avaliacao: selectedAvaliacao,
          escolas: selectedEscolas,
          series: selectedSeries,
          turmas: selectedTurmas,
        },
        cityId
      );
      const existing = new Set(rows.map((r) => r.class_id));
      const added: EditableRow[] = preview.items
        .filter((item) => !existing.has(item.class_id))
        .map((item) => ({
          key: `new-${item.class_id}`,
          class_id: item.class_id,
          class_name: item.class_name,
          shift: item.shift,
          school_id: item.school_id,
          school_name: item.school_name ?? '',
          grade_id: item.grade_id,
          grade_name: item.grade_name ?? '',
          students_count: item.students_count,
          scheduled_date: item.suggested_date,
          tablets_qty: item.suggested_tablets_qty,
          booklets_qty: item.suggested_booklets_qty,
          notes: '',
        }));
      setRows((prev) => sortRows([...prev, ...added]));
      const skipped = preview.items.length - added.length;
      toast({
        title: added.length > 0 ? `${added.length} turma(s) adicionada(s)` : 'Nenhuma turma nova',
        description:
          skipped > 0
            ? `${skipped} turma(s) já estavam no cronograma.`
            : preview.items.length === 0
              ? 'Nenhuma turma encontrada para os filtros.'
              : 'Revise datas e insumos antes de salvar.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao carregar turmas',
        description: getLogisticsApiErrorMessage(error, 'Tente novamente.'),
        variant: 'destructive',
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Edição da tabela
  // ---------------------------------------------------------------------------
  const updateRow = (key: string, patch: Partial<EditableRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRows = (keys: Set<string>) => {
    setRows((prev) => prev.filter((r) => !keys.has(r.key)));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => next.delete(k));
      return next;
    });
  };

  const toggleRow = (key: string, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const allSelected = rows.length > 0 && rows.every((r) => selectedKeys.has(r.key));
  const someSelected = rows.some((r) => selectedKeys.has(r.key));

  const toggleAll = (checked: boolean) => {
    setSelectedKeys(checked ? new Set(rows.map((r) => r.key)) : new Set());
  };

  const applyBulkDate = (date: Date | undefined) => {
    if (!date) return;
    const iso = toIsoDate(date);
    setRows((prev) => prev.map((r) => (selectedKeys.has(r.key) ? { ...r, scheduled_date: iso } : r)));
    setBulkDateOpen(false);
    toast({ title: `Data ${formatDateBR(iso)} aplicada a ${selectedKeys.size} turma(s)` });
  };

  const rowsWithoutDate = rows.filter((r) => !r.scheduled_date).length;
  const totals = useMemo(
    () => ({
      students: rows.reduce((acc, r) => acc + (r.students_count || 0), 0),
      tablets: rows.reduce((acc, r) => acc + (r.tablets_qty || 0), 0),
      booklets: rows.reduce((acc, r) => acc + (r.booklets_qty || 0), 0),
      schools: new Set(rows.map((r) => r.school_id)).size,
    }),
    [rows]
  );

  // ---------------------------------------------------------------------------
  // Salvar / publicar / cancelar / excluir
  // ---------------------------------------------------------------------------
  const computePublishedChanges = (): PublishedChangeSummary => {
    const originalById = new Map(snapshot.rows.filter((r) => r.id).map((r) => [r.id as string, r]));
    const currentIds = new Set(rows.filter((r) => r.id).map((r) => r.id as string));
    const added = rows.filter((r) => !r.id || !originalById.has(r.id));
    const removed = snapshot.rows.filter((r) => r.id && !currentIds.has(r.id));
    const dateChanged = rows.filter((r) => {
      if (!r.id) return false;
      const orig = originalById.get(r.id);
      return orig ? orig.scheduled_date !== r.scheduled_date : false;
    });
    const schools = Array.from(
      new Set([...added, ...removed, ...dateChanged].map((r) => r.school_name || r.school_id))
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { added, removed, dateChanged, schools };
  };

  const persist = async (): Promise<LogisticsSchedule | null> => {
    if (!cityId) return null;
    if (!current && !selectedAvaliacao) {
      toast({ title: 'Selecione a avaliação', variant: 'destructive' });
      return null;
    }
    setSaving(true);
    try {
      const payload = {
        education_stage_id: selectedEtapa || null,
        title: title.trim(),
        notes: notes.trim() || null,
        items: rowsToPayload(rows),
      };
      const saved = current
        ? await LogisticsApiService.updateSchedule(current.id, payload, cityId)
        : await LogisticsApiService.createSchedule({ ...payload, test_id: selectedAvaliacao }, cityId);
      applySchedule(saved);
      setCreatingNew(false);
      if (paramId !== saved.id) setSearchParams({ id: saved.id }, { replace: true });
      return saved;
    } catch (error) {
      toast({
        title: 'Erro ao salvar cronograma',
        description: getLogisticsApiErrorMessage(error, 'Tente novamente.'),
        variant: 'destructive',
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (current?.status === 'publicado') {
      if (rowsWithoutDate > 0) {
        toast({
          title: 'Turmas sem data',
          description: 'Em cronograma publicado, todas as turmas precisam de data.',
          variant: 'destructive',
        });
        return;
      }
      const changes = computePublishedChanges();
      if (changes.added.length || changes.removed.length || changes.dateChanged.length) {
        setPublishedChanges(changes);
        return;
      }
    }
    const saved = await persist();
    if (saved) toast({ title: current ? 'Alterações salvas' : 'Rascunho salvo' });
  };

  const handleConfirmPublishedSave = async () => {
    setPublishedChanges(null);
    const saved = await persist();
    if (saved) toast({ title: 'Alterações salvas' });
  };

  const handlePublish = async () => {
    setConfirmPublish(false);
    const saved = isDirty || !current ? await persist() : current;
    if (!saved || !cityId) return;
    setSaving(true);
    try {
      const published = await LogisticsApiService.publishSchedule(saved.id, cityId);
      applySchedule(published);
      toast({ title: 'Cronograma publicado' });
    } catch (error) {
      toast({
        title: 'Erro ao publicar',
        description: getLogisticsApiErrorMessage(error, 'Tente novamente.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelSchedule = async () => {
    setConfirmCancel(false);
    if (!current || !cityId) return;
    setSaving(true);
    try {
      const cancelled = await LogisticsApiService.cancelSchedule(current.id, cityId);
      applySchedule(cancelled);
      toast({ title: 'Cronograma cancelado' });
    } catch (error) {
      toast({
        title: 'Erro ao cancelar',
        description: getLogisticsApiErrorMessage(error, 'Tente novamente.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    if (!current || !cityId) return;
    setSaving(true);
    try {
      await LogisticsApiService.deleteSchedule(current.id, cityId);
      toast({ title: 'Rascunho excluído' });
      setCreatingNew(false);
      resetEditor();
      setSearchParams({});
      void loadList();
    } catch (error) {
      toast({
        title: 'Erro ao excluir',
        description: getLogisticsApiErrorMessage(error, 'Tente novamente.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = async () => {
    if (!current) return;
    setExportingPdf(true);
    try {
      await generateLogisticsPdf({
        schedule: current,
        orientation: pdfOrientation,
        cityName,
        cityId: cityId || null,
      });
      setPdfDialogOpen(false);
    } catch (error) {
      toast({
        title: 'Erro ao gerar PDF',
        description: getLogisticsApiErrorMessage(error, 'Tente novamente.'),
        variant: 'destructive',
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const status: LogisticsScheduleStatus = current?.status ?? 'rascunho';
  const canPublish = editable && status === 'rascunho' && rows.length > 0 && rowsWithoutDate === 0;
  const selectedAvaliacaoInfo = avaliacoes.find((a) => a.id === selectedAvaliacao);
  const evaluationMode = current?.evaluation_mode ?? selectedAvaliacaoInfo?.evaluation_mode;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const municipioSelector = canSelectCity && (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Estado</label>
        <Select
          value={selectedEstado}
          onValueChange={(v) => {
            setSelectedEstado(v);
            setSelectedMunicipio('all');
            setCreatingNew(false);
            resetEditor();
            setSearchParams({});
          }}
          disabled={inEditor && isDirty}
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
          onValueChange={(v) => {
            setSelectedMunicipio(v);
            setCreatingNew(false);
            resetEditor();
            setSearchParams({});
          }}
          disabled={selectedEstado === 'all' || (inEditor && isDirty)}
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
  );

  const header = (
    <header className="space-y-1">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
        <Truck className="h-6 w-6" />
        Logística de Avaliação
      </h1>
      <p className="text-muted-foreground">
        Cronograma de aplicação por escola, série e turma, com alunos a avaliar e insumos (tablets e cadernos).
      </p>
      {cityName && <p className="text-sm text-blue-600 dark:text-blue-400">Município: {cityName}</p>}
    </header>
  );

  if (loadingHierarchy) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Carregando…
      </div>
    );
  }

  // ----------------------------- LISTA -----------------------------
  if (!inEditor) {
    return (
      <div className="space-y-6">
        {header}
        {canSelectCity && (
          <Card>
            <CardContent className="pt-6">{municipioSelector}</CardContent>
          </Card>
        )}

        {!cityId ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Selecione estado e município para ver os cronogramas.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-base">Cronogramas</CardTitle>
                <CardDescription>
                  {listCanManage
                    ? 'Crie, edite, publique ou cancele cronogramas de aplicação.'
                    : 'Cronogramas publicados para a sua escola.'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {listCanManage && (
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      <SelectItem value="rascunho">Rascunho</SelectItem>
                      <SelectItem value="publicado">Publicado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <Button variant="outline" size="icon" onClick={() => void loadList()} disabled={loadingList}>
                  <RefreshCw className={cn('h-4 w-4', loadingList && 'animate-spin')} />
                </Button>
                {listCanManage && (
                  <Button onClick={startNew}>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo cronograma
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingList ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Carregando cronogramas…
                </div>
              ) : schedules.length === 0 ? (
                <p className="py-10 text-center text-muted-foreground">Nenhum cronograma encontrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Título</TableHead>
                        <TableHead>Avaliação</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Datas</TableHead>
                        <TableHead className="text-right">Escolas</TableHead>
                        <TableHead className="text-right">Turmas</TableHead>
                        <TableHead className="text-right">Alunos</TableHead>
                        <TableHead className="text-right">Tablets</TableHead>
                        <TableHead className="text-right">Cadernos</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schedules.map((s) => (
                        <TableRow key={s.id} className="cursor-pointer" onClick={() => openFromList(s.id)}>
                          <TableCell className="font-medium">{s.title}</TableCell>
                          <TableCell>{s.test_title ?? '—'}</TableCell>
                          <TableCell>
                            <StatusBadge status={s.status} />
                          </TableCell>
                          <TableCell className="text-sm">
                            {s.dates.length === 0
                              ? '—'
                              : s.dates.length === 1
                                ? formatDateBR(s.dates[0])
                                : `${formatDateBR(s.dates[0])} a ${formatDateBR(s.dates[s.dates.length - 1])}`}
                          </TableCell>
                          <TableCell className="text-right">{s.totals.schools}</TableCell>
                          <TableCell className="text-right">{s.totals.items}</TableCell>
                          <TableCell className="text-right">{s.totals.students.toLocaleString('pt-BR')}</TableCell>
                          <TableCell className="text-right">{s.totals.tablets.toLocaleString('pt-BR')}</TableCell>
                          <TableCell className="text-right">{s.totals.booklets.toLocaleString('pt-BR')}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4 mr-1" />
                              Abrir
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
        )}
      </div>
    );
  }

  // ----------------------------- EDITOR -----------------------------
  if (loadingSchedule && !current) {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Carregando cronograma…
        </div>
      </div>
    );
  }

  const escolaOptions = escolasOpts.map((e) => ({ id: e.id, name: e.nome }));
  const serieOptions = seriesOpts.map((s) => ({ id: s.id, name: s.nome }));
  const turmaOptions = turmasOpts.map((t) => ({
    id: t.id,
    name: `${t.school_name} — ${t.grade_name ?? ''} ${t.name}${t.shift ? ` (${t.shift})` : ''}`.trim(),
  }));
  const noAvaliacao = !selectedAvaliacao;

  return (
    <div className="space-y-6">
      {header}
      {!cityId && canSelectCity && (
        <Card>
          <CardContent className="pt-6">{municipioSelector}</CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={goToList}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{current ? current.title : 'Novo cronograma'}</span>
              <StatusBadge status={status} />
              {editable && isDirty && <Badge variant="outline">Alterações não salvas</Badge>}
            </div>
            {(current?.test_title || selectedAvaliacaoInfo) && (
              <p className="text-sm text-muted-foreground">
                {current?.test_title ?? selectedAvaliacaoInfo?.titulo} · {evaluationModeLabel(evaluationMode)}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {current && (
            <Button variant="outline" onClick={() => setPdfDialogOpen(true)} disabled={saving || exportingPdf}>
              {exportingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Exportar PDF
            </Button>
          )}
          {editable && (
          <>
            {current && status === 'rascunho' && (
              <Button variant="outline" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir rascunho
              </Button>
            )}
            {current && (
              <Button variant="outline" onClick={() => setConfirmCancel(true)} disabled={saving}>
                <XCircle className="h-4 w-4 mr-2" />
                Cancelar cronograma
              </Button>
            )}
            <Button variant="secondary" onClick={() => void handleSave()} disabled={saving || noAvaliacao}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {status === 'publicado' ? 'Salvar alterações' : 'Salvar rascunho'}
            </Button>
            {status === 'rascunho' && (
              <Button onClick={() => setConfirmPublish(true)} disabled={saving || !canPublish}>
                <Send className="h-4 w-4 mr-2" />
                Publicar
              </Button>
            )}
          </>
          )}
        </div>
      </div>

      {status === 'cancelado' && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Este cronograma foi cancelado e não pode mais ser editado.
        </div>
      )}

      {editable && status === 'rascunho' && rows.length > 0 && rowsWithoutDate > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {rowsWithoutDate} turma(s) sem data, destacadas na tabela. Defina a data de todas para poder publicar.
          </span>
        </div>
      )}

      {editable && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtros
            </CardTitle>
            <CardDescription>
              Escolha a etapa (opcional) e a avaliação. Escolas e séries aparecem após escolher a avaliação; turmas,
              após escolher escolas ou séries. Depois clique em “Carregar turmas” para incluí-las no cronograma.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Etapa</label>
                <Select value={selectedEtapa || 'all'} onValueChange={handleEtapaChange} disabled={loadingFilters && etapas.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as etapas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as etapas</SelectItem>
                    {etapas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Avaliação</label>
                <Select value={selectedAvaliacao || undefined} onValueChange={handleAvaliacaoChange} disabled={testLocked}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingFilters ? 'Carregando…' : 'Selecione a avaliação'} />
                  </SelectTrigger>
                  <SelectContent>
                    {testLocked && current && !avaliacoes.some((a) => a.id === current.test_id) && (
                      <SelectItem value={current.test_id}>{current.test_title ?? current.test_id}</SelectItem>
                    )}
                    {avaliacoes.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.titulo} · {evaluationModeLabel(a.evaluation_mode)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!noAvaliacao && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Escola(s)</label>
                  <FormMultiSelect
                    options={escolaOptions}
                    selected={selectedEscolas}
                    onChange={(v) => {
                      setSelectedEscolas(v);
                      setSelectedTurmas([]);
                    }}
                    placeholder={selectedEscolas.length === 0 ? 'Todas as escolas' : `${selectedEscolas.length} selecionada(s)`}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Série(s)</label>
                  <FormMultiSelect
                    options={serieOptions}
                    selected={selectedSeries}
                    onChange={(v) => {
                      setSelectedSeries(v);
                      setSelectedTurmas([]);
                    }}
                    placeholder={selectedSeries.length === 0 ? 'Todas as séries' : `${selectedSeries.length} selecionada(s)`}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Turma(s)</label>
                  <FormMultiSelect
                    options={turmaOptions}
                    selected={selectedTurmas}
                    onChange={setSelectedTurmas}
                    placeholder={
                      selectedEscolas.length === 0 && selectedSeries.length === 0
                        ? 'Selecione escolas e/ou séries'
                        : selectedTurmas.length === 0
                          ? 'Todas as turmas'
                          : `${selectedTurmas.length} selecionada(s)`
                    }
                    className={
                      selectedEscolas.length === 0 && selectedSeries.length === 0
                        ? 'pointer-events-none opacity-60'
                        : undefined
                    }
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void handleLoadPreview()} disabled={noAvaliacao || loadingPreview || !cityId}>
                {loadingPreview ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Carregar turmas
              </Button>
              {loadingFilters && (
                <span className="text-sm text-muted-foreground flex items-center">
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Atualizando filtros…
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dados do cronograma</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Título</label>
            {editable ? (
              <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Logística SAEB 5º ano" />
            ) : (
              <p className="text-sm">{title || '—'}</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Observação geral</label>
            {editable ? (
              <Textarea value={notes} rows={2} onChange={(e) => setNotes(e.target.value)} />
            ) : (
              <p className="text-sm whitespace-pre-wrap">{notes || '—'}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Turmas do cronograma</CardTitle>
            <CardDescription>
              {rows.length} turma(s) em {totals.schools} escola(s) · {totals.students.toLocaleString('pt-BR')} alunos ·{' '}
              {totals.tablets.toLocaleString('pt-BR')} tablets · {totals.booklets.toLocaleString('pt-BR')} cadernos
            </CardDescription>
          </div>
          {editable && someSelected && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedKeys.size} selecionada(s)</span>
              <Popover open={bulkDateOpen} onOpenChange={setBulkDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    Aplicar data às selecionadas
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar mode="single" locale={ptBR} onSelect={applyBulkDate} initialFocus />
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="sm" onClick={() => removeRows(new Set(selectedKeys))}>
                <Trash2 className="h-4 w-4 mr-2" />
                Remover selecionadas
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">
              {editable ? 'Nenhuma turma ainda. Use os filtros e clique em “Carregar turmas”.' : 'Nenhuma turma.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {editable && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                          onCheckedChange={(c) => toggleAll(c === true)}
                          aria-label="Selecionar todas"
                        />
                      </TableHead>
                    )}
                    <TableHead>Escola</TableHead>
                    <TableHead>Série</TableHead>
                    <TableHead>Turma</TableHead>
                    <TableHead>Turno</TableHead>
                    <TableHead className="text-right">Alunos</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Tablets</TableHead>
                    <TableHead className="text-right">Cadernos</TableHead>
                    <TableHead>Observação</TableHead>
                    {editable && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const missingDate = !r.scheduled_date;
                    return (
                      <TableRow
                        key={r.key}
                        className={cn(missingDate && editable && 'bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-950/20')}
                      >
                        {editable && (
                          <TableCell>
                            <Checkbox
                              checked={selectedKeys.has(r.key)}
                              onCheckedChange={(c) => toggleRow(r.key, c === true)}
                              aria-label={`Selecionar turma ${r.class_name}`}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">{r.school_name || '—'}</TableCell>
                        <TableCell>{r.grade_name || '—'}</TableCell>
                        <TableCell>{r.class_name || '—'}</TableCell>
                        <TableCell>{r.shift || '—'}</TableCell>
                        <TableCell className="text-right">{r.students_count}</TableCell>
                        <TableCell>
                          {editable ? (
                            <DatePickerButton
                              value={r.scheduled_date}
                              onChange={(iso) => updateRow(r.key, { scheduled_date: iso })}
                              highlightEmpty
                            />
                          ) : (
                            formatDateBR(r.scheduled_date)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editable ? (
                            <Input
                              type="number"
                              min={0}
                              className="w-20 ml-auto text-right"
                              value={r.tablets_qty}
                              onChange={(e) => updateRow(r.key, { tablets_qty: parseQty(e.target.value) })}
                            />
                          ) : (
                            r.tablets_qty
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editable ? (
                            <Input
                              type="number"
                              min={0}
                              className="w-20 ml-auto text-right"
                              value={r.booklets_qty}
                              onChange={(e) => updateRow(r.key, { booklets_qty: parseQty(e.target.value) })}
                            />
                          ) : (
                            r.booklets_qty
                          )}
                        </TableCell>
                        <TableCell className="min-w-[180px]">
                          {editable ? (
                            <Input
                              value={r.notes}
                              placeholder="Opcional"
                              onChange={(e) => updateRow(r.key, { notes: e.target.value })}
                            />
                          ) : (
                            r.notes || '—'
                          )}
                        </TableCell>
                        {editable && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRows(new Set([r.key]))}
                              aria-label="Remover turma"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-semibold bg-muted/40">
                    {editable && <TableCell />}
                    <TableCell colSpan={4}>Total</TableCell>
                    <TableCell className="text-right">{totals.students.toLocaleString('pt-BR')}</TableCell>
                    <TableCell />
                    <TableCell className="text-right">{totals.tablets.toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-right">{totals.booklets.toLocaleString('pt-BR')}</TableCell>
                    <TableCell colSpan={editable ? 2 : 1} />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Publicar */}
      <AlertDialog open={confirmPublish} onOpenChange={setConfirmPublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publicar cronograma?</AlertDialogTitle>
            <AlertDialogDescription>
              {rows.length} turma(s) em {totals.schools} escola(s). Depois de publicado, o cronograma fica visível para
              diretores, coordenadores e professores das escolas envolvidas, que serão notificados.
              {isDirty && ' As alterações não salvas serão salvas antes da publicação.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handlePublish()}>Publicar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Salvar edição de publicado */}
      <AlertDialog open={Boolean(publishedChanges)} onOpenChange={(o) => !o && setPublishedChanges(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salvar alterações em cronograma publicado?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <ul className="list-disc pl-5">
                  {publishedChanges && publishedChanges.dateChanged.length > 0 && (
                    <li>{publishedChanges.dateChanged.length} turma(s) com data alterada</li>
                  )}
                  {publishedChanges && publishedChanges.added.length > 0 && (
                    <li>{publishedChanges.added.length} turma(s) incluída(s)</li>
                  )}
                  {publishedChanges && publishedChanges.removed.length > 0 && (
                    <li>{publishedChanges.removed.length} turma(s) removida(s)</li>
                  )}
                </ul>
                <p>
                  As escolas envolvidas serão notificadas:{' '}
                  <span className="font-medium text-foreground">{publishedChanges?.schools.join(', ')}</span>.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmPublishedSave()}>Salvar e notificar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancelar */}
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este cronograma?</AlertDialogTitle>
            <AlertDialogDescription>
              {status === 'publicado'
                ? 'As escolas envolvidas serão notificadas de que a aplicação foi cancelada. '
                : ''}
              Um cronograma cancelado não pode ser reaberto nem editado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleCancelSchedule()}
            >
              Cancelar cronograma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Exportar PDF */}
      <Dialog open={pdfDialogOpen} onOpenChange={(o) => !exportingPdf && setPdfDialogOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar PDF</DialogTitle>
            <DialogDescription>
              O PDF traz o cronograma salvo, agrupado por escola, com totais por escola e total geral.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="text-sm font-medium">Orientação da página</span>
              <RadioGroup
                value={pdfOrientation}
                onValueChange={(v) => setPdfOrientation(v as LogisticsPdfOrientation)}
                className="grid grid-cols-2 gap-3"
              >
                <Label
                  htmlFor="pdf-portrait"
                  className={cn(
                    'flex items-center gap-2 rounded-md border p-3 cursor-pointer',
                    pdfOrientation === 'portrait' && 'border-primary'
                  )}
                >
                  <RadioGroupItem id="pdf-portrait" value="portrait" />
                  Retrato (vertical)
                </Label>
                <Label
                  htmlFor="pdf-landscape"
                  className={cn(
                    'flex items-center gap-2 rounded-md border p-3 cursor-pointer',
                    pdfOrientation === 'landscape' && 'border-primary'
                  )}
                >
                  <RadioGroupItem id="pdf-landscape" value="landscape" />
                  Paisagem (horizontal)
                </Label>
              </RadioGroup>
            </div>
            {editable && isDirty && (
              <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Há alterações não salvas na tela. O PDF será gerado com a versão salva do cronograma; salve antes se
                  quiser incluí-las.
                </span>
              </div>
            )}
            {current && current.status !== 'publicado' && (
              <p className="text-sm text-muted-foreground">
                O cabeçalho do PDF indicará que o cronograma está {current.status === 'rascunho' ? 'em rascunho' : 'cancelado'}.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPdfDialogOpen(false)} disabled={exportingPdf}>
              Voltar
            </Button>
            <Button onClick={() => void handleExportPdf()} disabled={exportingPdf}>
              {exportingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              {editable && isDirty ? 'Exportar versão salva' : 'Gerar PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excluir rascunho */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir rascunho?</AlertDialogTitle>
            <AlertDialogDescription>O rascunho e todas as suas turmas serão apagados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
