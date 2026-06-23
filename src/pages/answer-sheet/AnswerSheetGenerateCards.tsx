import { useState, useEffect, useCallback, useRef } from 'react';
import { isAxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  FileText,
  MapPin,
  Loader2,
  CheckCircle2,
  Download,
  AlertCircle,
  RefreshCw,
  Clock,
  School,
  Users,
  Trash2,
  ChevronRight,
  AlertTriangle,
  Pencil,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { api } from '@/lib/api';
import { fetchAuthenticatedDownload } from '@/lib/fetch-authenticated-download';
import SkillsSelector from '@/components/evaluations/questions/SkillsSelector';
import { useSkillsStore } from '@/stores/useSkillsStore';
import {
  formatGenerationScopeSummary,
  generationCanDownload,
  generationClassLabelsFromSnapshot,
  gabaritoDownloadLoadingKey,
  resolveGabaritoDownloadUrl,
  resolveGenerationDownloadUrl,
} from '@/lib/gabarito-list-helpers';
import { Gabarito, GabaritosResponse } from '@/types/answer-sheet';

type FilterLevel = 'state' | 'city' | 'school' | 'grade' | 'class';

interface FilterOption {
  id: string;
  name: string;
  count?: number;
}

interface SelectedFilters {
  state?: string;
  city?: string;
  school_ids?: string[];
  grade_ids?: string[];
  class_ids?: string[];
}

/** GET /answer-sheets/jobs/{job_id}/status — alinhado à prova física */
interface JobStatusClassError {
  student_id?: string;
  student_name?: string;
  error: string;
}
interface JobStatusClass {
  class_id: string;
  class_name: string;
  school_name: string;
  status: string;
  total_students: number;
  completed: number;
  successful: number;
  failed: number;
  errors: JobStatusClassError[];
}
interface JobStatusSummary {
  total_classes: number;
  completed_classes: number;
  successful_classes: number;
  failed_classes: number;
  total_students: number;
  completed_students: number;
  successful_students: number;
  failed_students: number;
  zip_minio_url?: string | null;
  download_url?: string | null;
  can_download: boolean;
}
interface JobStatusResult {
  classes_generated?: number;
  total_students?: number;
  successful_classes?: number;
  failed_classes?: number;
  scope_type?: string;
  minio_url?: string;
  can_download?: boolean;
  download_url?: string;
}
interface JobStatusErrorItem {
  class_id?: string;
  class_name?: string;
  school_name?: string;
  student_id?: string;
  student_name?: string;
  error: string;
}
interface JobStatusResponse {
  job_id: string;
  gabarito_id: string;
  task_id?: string;
  status: 'processing' | 'completed' | 'failed';
  message?: string;
  progress?: { current: number; total: number; percentage: number };
  result?: JobStatusResult;
  summary?: JobStatusSummary | null;
  classes?: JobStatusClass[];
  errors?: JobStatusErrorItem[] | null;
  tasks?: Array<{ class_id: string; class_name: string; status: string }>;
  error?: string;
}

type Alternative = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

interface GabaritoDetailResponse {
  id: string;
  title?: string;
  num_questions?: number;
  use_blocks?: boolean;
  correct_answers?: Record<string, Alternative | null> | null;
  blocks_config?: {
    blocks: Array<{
      block_id: number;
      subject_id: string;
      subject_name: string;
      start_question: number;
      end_question: number;
      questions_count: number;
    }>
  };
  created_at?: string;
  question_skills?: Record<string, string[]>;
  questions_options?: Record<string, string[]>;
  skill_codes?: Record<string, string>;
}

interface RecalculateJobStatusResponse {
  status: 'processing' | 'completed' | 'failed';
  message?: string;
  progress?: { percentage?: number; current?: number; total?: number };
  summary?: { successful_items?: number; failed_items?: number } | null;
  items?: Array<{ id?: string; status?: string; error?: string; message?: string }>;
}

function mapPostTasksToClasses(
  tasks?: Array<{ class_id: string; class_name: string; status: string }>
): JobStatusClass[] {
  if (!tasks?.length) return [];
  return tasks.map((t) => ({
    class_id: t.class_id,
    class_name: t.class_name,
    school_name: '',
    status: t.status,
    total_students: 0,
    completed: 0,
    successful: 0,
    failed: 0,
    errors: [],
  }));
}

function classStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Aguardando';
    case 'processing':
      return 'Processando';
    case 'completed':
      return 'Concluída';
    case 'completed_with_errors':
      return 'Concluída com erros';
    case 'failed':
      return 'Falhou';
    default:
      return status;
  }
}

function classStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'processing':
      return 'default';
    case 'completed':
      return 'default';
    case 'completed_with_errors':
    case 'failed':
      return 'destructive';
    case 'pending':
    default:
      return 'secondary';
  }
}

function formatJobFailureMessage(d: JobStatusResponse): string {
  const fromErrors =
    Array.isArray(d.errors) && d.errors.length > 0
      ? d.errors.map((e) => e.error).filter(Boolean).join(' · ')
      : '';
  return fromErrors || d.message || d.error || 'Erro ao gerar cartões.';
}

function normalizeOptions(raw: unknown): FilterOption[] {
  if (!raw) return [];
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object') {
    return (raw as { id?: string; uuid?: string; nome?: string; name?: string }[]).map((item) => ({
      id: item.id || item.uuid || String(item),
      name: (item as { nome?: string; name?: string }).nome || (item as { name?: string }).name || String(item),
      count: (item as { count?: number }).count || 0,
    }));
  }
  if (Array.isArray(raw)) {
    return (raw as (string | { id: string; name: string })[]).map((item, idx) =>
      typeof item === 'string'
        ? { id: item, name: item, count: 0 }
        : { id: item.id || String(idx), name: item.name || item.id, count: 0 }
    );
  }
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return Object.entries(raw).map(([key, val]) => ({
      id: key,
      name: typeof val === 'string' ? val : (val as { nome?: string; name?: string })?.nome || (val as { name?: string })?.name || key,
      count: (val as { count?: number })?.count || 0,
    }));
  }
  return [];
}

export default function AnswerSheetGenerateCards() {
  const { toast } = useToast();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recalcPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Abas
  const [activeTab, setActiveTab] = useState<'generate' | 'generated' | 'edit'>('generate');

  // Gabaritos
  const [gabaritos, setGabaritos] = useState<Gabarito[]>([]);
  const [isLoadingGabaritos, setIsLoadingGabaritos] = useState(true);
  const [selectedGabaritoId, setSelectedGabaritoId] = useState<string>('');
  const [downloadingGabaritoId, setDownloadingGabaritoId] = useState<string | null>(null);
  const [selectedGabaritos, setSelectedGabaritos] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'single' | 'multiple'>('single');
  const [gabaritoToDelete, setGabaritoToDelete] = useState<string | null>(null);

  // Edição de gabarito (correct_answers)
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editGabaritoId, setEditGabaritoId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editNumQuestions, setEditNumQuestions] = useState<number>(0);
  const [editCorrectAnswers, setEditCorrectAnswers] = useState<Record<string, Alternative | null>>({});
  const [noEditPermissionIds, setNoEditPermissionIds] = useState<Set<string>>(new Set());

  const [recalcJobId, setRecalcJobId] = useState<string | null>(null);
  const [recalcStatus, setRecalcStatus] = useState<'idle' | 'saving' | 'processing' | 'completed' | 'failed'>('idle');
  const [recalcProgressPct, setRecalcProgressPct] = useState<number>(0);
  const [recalcSummary, setRecalcSummary] = useState<{ successful_items?: number; failed_items?: number } | null>(null);
  const [recalcItems, setRecalcItems] = useState<RecalculateJobStatusResponse['items']>(null);
  const [recalcMessage, setRecalcMessage] = useState<string>('');

  // Edição estrutural
  const [structEditOpen, setStructEditOpen] = useState(false);
  const [structEditLoading, setStructEditLoading] = useState(false);
  const [structEditSaving, setStructEditSaving] = useState(false);
  const [structEditGabaritoId, setStructEditGabaritoId] = useState<string | null>(null);
  const [structEditTitle, setStructEditTitle] = useState<string>('');
  const [structEditNumQuestions, setStructEditNumQuestions] = useState<number>(0);
  const [structEditBlocks, setStructEditBlocks] = useState<Array<{
    block_id: number;
    subject_id: string;
    subject_name: string;
    start_question: number;
    end_question: number;
    questions_count: number;
  }>>([]);
  const [structEditQuestionSkills, setStructEditQuestionSkills] = useState<Record<string, string[]>>({});
  const [structEditQuestionsOptions, setStructEditQuestionsOptions] = useState<Record<string, string[]>>({});
  const [structEditWarning, setStructEditWarning] = useState<string | null>(null);
  const [showRegeneratePdfsDialog, setShowRegeneratePdfsDialog] = useState(false);
  const [disciplines, setDisciplines] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingDisciplines, setIsLoadingDisciplines] = useState(false);
  
  // Habilidades
  const [skillSubjectId, setSkillSubjectId] = useState('');
  const [skillGradeId, setSkillGradeId] = useState('');
  const [subjectsForSkills, setSubjectsForSkills] = useState<{ id: string; name: string }[]>([]);
  const [gradesForSkills, setGradesForSkills] = useState<{ id: string; name: string }[]>([]);
  const [availableSkills, setAvailableSkills] = useState<{ id: string; code: string; description: string; name: string }[]>([]);
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);
  const [editingQuestionSkillsNum, setEditingQuestionSkillsNum] = useState<number | null>(null);
  const [skillCodeCache, setSkillCodeCache] = useState<Record<string, string>>({});
  
  // Alternativas customizadas
  const [useGlobalAlternatives, setUseGlobalAlternatives] = useState(true);
  const [globalAlternatives, setGlobalAlternatives] = useState<string[]>(['A', 'B', 'C', 'D']);
  const [editingQuestionAlternativesNum, setEditingQuestionAlternativesNum] = useState<number | null>(null);

  // Respostas corretas
  const [structEditCorrectAnswers, setStructEditCorrectAnswers] = useState<Record<string, Alternative | null>>({});

  // Constantes para blocos
  const MIN_QUESTIONS_PER_BLOCK = 1;
  const MAX_QUESTIONS_PER_BLOCK = 26;

  // Filtros (escopo)
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>({});
  const [filterLabels, setFilterLabels] = useState<Record<FilterLevel, string>>({
    state: '',
    city: '',
    school: '',
    grade: '',
    class: '',
  });
  const [stateOptions, setStateOptions] = useState<FilterOption[]>([]);
  const [cityOptions, setCityOptions] = useState<FilterOption[]>([]);
  const [schoolOptions, setSchoolOptions] = useState<FilterOption[]>([]);
  const [gradeOptions, setGradeOptions] = useState<FilterOption[]>([]);
  const [classOptions, setClassOptions] = useState<FilterOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  // Geração
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [lastJobStatus, setLastJobStatus] = useState<JobStatusResponse | null>(null);
  const [jobErrorsOpen, setJobErrorsOpen] = useState(true);
  const [jobDownloadUrl, setJobDownloadUrl] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);

  const fetchGabaritos = useCallback(async () => {
    try {
      setIsLoadingGabaritos(true);
      const res = await api.get<GabaritosResponse>('/answer-sheets/gabaritos');
      setGabaritos(res.data?.gabaritos ?? []);
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível carregar os gabaritos.', variant: 'destructive' });
      setGabaritos([]);
    } finally {
      setIsLoadingGabaritos(false);
    }
  }, [toast]);

  const stopRecalcPolling = useCallback(() => {
    if (recalcPollingRef.current) {
      clearInterval(recalcPollingRef.current);
      recalcPollingRef.current = null;
    }
  }, []);

  const resetEditDialogState = useCallback(() => {
    stopRecalcPolling();
    setEditOpen(false);
    setEditLoading(false);
    setEditSaving(false);
    setEditGabaritoId(null);
    setEditTitle('');
    setEditNumQuestions(0);
    setEditCorrectAnswers({});
    setRecalcJobId(null);
    setRecalcStatus('idle');
    setRecalcProgressPct(0);
    setRecalcSummary(null);
    setRecalcItems(null);
    setRecalcMessage('');
  }, [stopRecalcPolling]);

  const startRecalcPolling = useCallback(
    (jobIdToPoll: string) => {
      stopRecalcPolling();
      let tick = 0;
      let intervalMs = 1500;

      recalcPollingRef.current = setInterval(async () => {
        tick += 1;
        // backoff simples após alguns segundos
        if (tick === 10 && intervalMs !== 2500) {
          stopRecalcPolling();
          intervalMs = 2500;
          startRecalcPolling(jobIdToPoll);
          return;
        }

        try {
          const res = await api.get<RecalculateJobStatusResponse>(`/answer-sheets/recalculate-jobs/${jobIdToPoll}/status`);
          const d = res.data;
          const pct = Number(d.progress?.percentage ?? 0);
          setRecalcProgressPct(Number.isFinite(pct) ? pct : 0);
          setRecalcSummary(d.summary ?? null);
          setRecalcItems(d.items ?? null);
          setRecalcMessage(d.message ?? '');

          if (d.status === 'completed') {
            stopRecalcPolling();
            setRecalcStatus('completed');
            toast({ title: 'Recalculo concluído', description: d.message || 'Resultados recalculados com sucesso.' });
            await fetchGabaritos();
            return;
          }

          if (d.status === 'failed') {
            stopRecalcPolling();
            setRecalcStatus('failed');
            toast({ title: 'Falha no recálculo', description: d.message || 'Não foi possível recalcular.', variant: 'destructive' });
            return;
          }

          setRecalcStatus('processing');
        } catch (err: unknown) {
          // se o polling falhar momentaneamente, manter como processing
          const msg = isAxiosError(err)
            ? (err.response?.data as { message?: string } | undefined)?.message || 'Erro ao consultar recálculo.'
            : 'Erro ao consultar recálculo.';
          setRecalcMessage(msg);
        }
      }, intervalMs);
    },
    [fetchGabaritos, stopRecalcPolling, toast]
  );

  const handleSaveEditedGabarito = useCallback(async () => {
    if (!editGabaritoId) return;

    try {
      setEditSaving(true);
      setRecalcStatus('saving');
      setRecalcMessage('');

      const payload = { correct_answers: editCorrectAnswers };
      const res = await api.patch(`/answer-sheets/gabaritos/${editGabaritoId}`, payload, {
        headers: { 'Content-Type': 'application/json' },
        validateStatus: (s) => s < 500,
      });

      if (res.status === 403) {
        setNoEditPermissionIds((prev) => new Set([...Array.from(prev), editGabaritoId]));
        toast({ title: 'Sem permissão', description: 'Você não tem permissão para editar este gabarito.', variant: 'destructive' });
        resetEditDialogState();
        return;
      }

      if (res.status === 404) {
        toast({ title: 'Não encontrado', description: 'Gabarito inexistente.', variant: 'destructive' });
        resetEditDialogState();
        return;
      }

      if (res.status === 400) {
        const msg = (res.data as { message?: string } | undefined)?.message || 'Payload inválido.';
        toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' });
        setRecalcStatus('idle');
        return;
      }

      if (res.status !== 202) {
        toast({ title: 'Resposta inesperada', description: 'Não foi possível iniciar o recálculo.', variant: 'destructive' });
        setRecalcStatus('idle');
        return;
      }

      const data = res.data as { job_id?: string; polling_url?: string; status?: string; message?: string };
      const nextJobId = (data.job_id ?? '').trim();
      if (!nextJobId) {
        toast({ title: 'Erro', description: 'job_id não retornou do servidor.', variant: 'destructive' });
        setRecalcStatus('idle');
        return;
      }

      setRecalcJobId(nextJobId);
      setRecalcStatus('processing');
      setRecalcProgressPct(0);
      setRecalcSummary(null);
      setRecalcItems(null);
      setRecalcMessage(data.message ?? '');

      startRecalcPolling(nextJobId);
    } catch (err: unknown) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message || 'Não foi possível salvar o gabarito.'
        : 'Não foi possível salvar o gabarito.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
      setRecalcStatus('idle');
    } finally {
      setEditSaving(false);
    }
  }, [editCorrectAnswers, editGabaritoId, resetEditDialogState, startRecalcPolling, toast]);

  const openEditDialogForGabarito = useCallback(
    async (g: Gabarito) => {
      if (noEditPermissionIds.has(g.id)) return;

      setEditOpen(true);
      setEditLoading(true);
      setEditGabaritoId(g.id);
      setEditTitle(g.title);
      setEditNumQuestions(g.num_questions ?? 0);
      setEditCorrectAnswers({});
      setRecalcJobId(null);
      setRecalcStatus('idle');
      setRecalcProgressPct(0);
      setRecalcSummary(null);
      setRecalcItems(null);
      setRecalcMessage('');

      try {
        const res = await api.get<GabaritoDetailResponse>(`/answer-sheets/gabarito/${g.id}`);
        const numQuestions = Number(res.data?.num_questions ?? g.num_questions ?? 0) || 0;
        const raw = (res.data?.correct_answers ?? {}) as Record<string, Alternative | null>;

        const normalized: Record<string, Alternative | null> = {};
        for (let i = 1; i <= numQuestions; i++) {
          const k = String(i);
          const v = raw[k];
          normalized[k] = v ?? null;
        }

        setEditTitle(res.data?.title ?? g.title);
        setEditNumQuestions(numQuestions);
        setEditCorrectAnswers(normalized);
      } catch (err: unknown) {
        const msg = isAxiosError(err)
          ? (err.response?.data as { message?: string } | undefined)?.message || 'Não foi possível carregar o gabarito.'
          : 'Não foi possível carregar o gabarito.';
        toast({ title: 'Erro', description: msg, variant: 'destructive' });
        resetEditDialogState();
      } finally {
        setEditLoading(false);
      }
    },
    [noEditPermissionIds, resetEditDialogState, toast]
  );

  const checkCanEditStructure = useCallback(async (gabaritoId: string): Promise<boolean> => {
    try {
      const res = await api.get(`/answer-sheets/results?gabarito_id=${gabaritoId}&page=1&per_page=1`);
      if (res.data && res.data.total > 0) {
        toast({
          title: 'Não é possível editar',
          description: 'Este cartão já possui correções registradas. Para fazer alterações, crie um novo cartão.',
          variant: 'destructive',
        });
        return false;
      }
      return true;
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível verificar permissões de edição.',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  const resetStructEditDialogState = useCallback(() => {
    setStructEditOpen(false);
    setStructEditLoading(false);
    setStructEditSaving(false);
    setStructEditGabaritoId(null);
    setStructEditTitle('');
    setStructEditNumQuestions(0);
    setStructEditBlocks([]);
    setStructEditQuestionSkills({});
    setStructEditQuestionsOptions({});
    setStructEditCorrectAnswers({});
    setStructEditWarning(null);
    setShowRegeneratePdfsDialog(false);
    setSkillSubjectId('');
    setSkillGradeId('');
    setAvailableSkills([]);
    setEditingQuestionSkillsNum(null);
    setSkillCodeCache({});
    setUseGlobalAlternatives(true);
    setGlobalAlternatives(['A', 'B', 'C', 'D']);
    setEditingQuestionAlternativesNum(null);
  }, []);

  const openStructEditDialog = useCallback(async (g: Gabarito) => {
    const canEdit = await checkCanEditStructure(g.id);
    if (!canEdit) return;

    setStructEditOpen(true);
    setStructEditLoading(true);
    setStructEditGabaritoId(g.id);
    setStructEditTitle(g.title);
    setStructEditNumQuestions(g.num_questions ?? 0);
    setStructEditBlocks([]);
    setStructEditQuestionSkills({});
    setStructEditQuestionsOptions({});
    setStructEditCorrectAnswers({});
    setStructEditWarning(null);

    try {
      const res = await api.get<GabaritoDetailResponse>(`/answer-sheets/gabarito/${g.id}`);
      const data = res.data;

      setStructEditTitle(data.title ?? g.title);
      setStructEditNumQuestions(data.num_questions ?? 0);

      // Carregar blocos
      if (data.blocks_config?.blocks) {
        setStructEditBlocks(data.blocks_config.blocks);
      }

      // Carregar habilidades por questão e construir cache de códigos
      if (data.question_skills) {
        setStructEditQuestionSkills(data.question_skills);
      }

      // Carregar cache de códigos BNCC
      if (data.skill_codes) {
        setSkillCodeCache(data.skill_codes);
      }

      // Carregar respostas corretas
      if (data.correct_answers) {
        setStructEditCorrectAnswers(data.correct_answers);
      }
      
      // Carregar alternativas por questão e detectar se é global ou individual
      if (data.questions_options && Object.keys(data.questions_options).length > 0) {
        const allOptions = Object.values(data.questions_options);
        const firstOption = JSON.stringify([...allOptions[0]].sort());
        const isGlobal = allOptions.every(opt => 
          JSON.stringify([...opt].sort()) === firstOption
        );
        
        if (isGlobal && allOptions.length > 0) {
          // Modo global - todas as questões têm as mesmas alternativas
          setUseGlobalAlternatives(true);
          setGlobalAlternatives([...allOptions[0]].sort());
          setStructEditQuestionsOptions({});
        } else {
          // Modo individual - questões têm alternativas diferentes
          setUseGlobalAlternatives(false);
          setStructEditQuestionsOptions(data.questions_options);
        }
      } else {
        // Padrão se backend não retornar: A, B, C, D
        setUseGlobalAlternatives(true);
        setGlobalAlternatives(['A', 'B', 'C', 'D']);
        setStructEditQuestionsOptions({});
      }
    } catch (err: unknown) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message || 'Não foi possível carregar o gabarito.'
        : 'Não foi possível carregar o gabarito.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
      resetStructEditDialogState();
    } finally {
      setStructEditLoading(false);
    }
  }, [checkCanEditStructure, resetStructEditDialogState, toast]);

  const handleSaveStructure = useCallback(async () => {
    if (!structEditGabaritoId) return;

    // Validações
    if (structEditNumQuestions < 1 || structEditNumQuestions > 104) {
      toast({
        title: 'Erro de validação',
        description: 'O número de questões deve estar entre 1 e 104.',
        variant: 'destructive',
      });
      return;
    }

    if (structEditBlocks.length > 4) {
      toast({
        title: 'Erro de validação',
        description: 'Máximo de 4 blocos permitidos.',
        variant: 'destructive',
      });
      return;
    }

    // Validar soma de questões dos blocos
    if (structEditBlocks.length > 0) {
      const totalFromBlocks = structEditBlocks.reduce((sum, block) => sum + block.questions_count, 0);
      if (totalFromBlocks !== structEditNumQuestions) {
        toast({
          title: 'Erro de validação',
          description: `A soma das questões dos blocos (${totalFromBlocks}) não corresponde ao total de questões (${structEditNumQuestions}). Ajuste os blocos antes de salvar.`,
          variant: 'destructive',
        });
        return;
      }
      
      // Validar se todos os blocos têm disciplina
      const blocksWithoutSubject = structEditBlocks.filter(b => !b.subject_id);
      if (blocksWithoutSubject.length > 0) {
        toast({
          title: 'Erro de validação',
          description: 'Todos os blocos devem ter uma disciplina selecionada.',
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      setStructEditSaving(true);
      setStructEditWarning(null);

      const payload: {
        num_questions?: number;
        blocks_config?: { blocks: typeof structEditBlocks };
        question_skills?: Record<string, string[]>;
        questions_options?: Record<string, string[]>;
        correct_answers?: Record<string, Alternative | null>;
      } = {};

      // Adicionar apenas campos modificados
      if (structEditNumQuestions > 0) {
        payload.num_questions = structEditNumQuestions;
      }

      if (structEditBlocks.length > 0) {
        payload.blocks_config = { blocks: structEditBlocks };
      }

      if (Object.keys(structEditQuestionSkills).length > 0) {
        payload.question_skills = structEditQuestionSkills;
      }

      // Construir questions_options baseado no modo global ou individual
      if (useGlobalAlternatives) {
        // Modo global: aplicar as mesmas alternativas a todas as questões
        const questionsOpts: Record<string, string[]> = {};
        for (let i = 1; i <= structEditNumQuestions; i++) {
          questionsOpts[String(i)] = [...globalAlternatives];
        }
        payload.questions_options = questionsOpts;
      } else {
        // Modo individual: usar as alternativas específicas de cada questão
        if (Object.keys(structEditQuestionsOptions).length > 0) {
          payload.questions_options = structEditQuestionsOptions;
        }
      }

      // Adicionar respostas corretas
      if (Object.keys(structEditCorrectAnswers).length > 0) {
        payload.correct_answers = structEditCorrectAnswers;
      }

      const res = await api.patch(
        `/answer-sheets/gabarito/${structEditGabaritoId}/structure`,
        payload,
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (res.status === 200) {
        const data = res.data;
        toast({
          title: 'Sucesso',
          description: data.message || 'Estrutura atualizada com sucesso.',
        });

        // Se tem warning, mostrar dialog para regenerar PDFs
        if (data.warning) {
          setStructEditWarning(data.warning);
          setShowRegeneratePdfsDialog(true);
        } else {
          await fetchGabaritos();
          resetStructEditDialogState();
        }
      }
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const status = err.response?.status;
        const data = err.response?.data as { error?: string; message?: string; reason?: string };

        if (status === 422 && data.reason === 'has_corrections') {
          toast({
            title: 'Edição bloqueada',
            description: data.error || 'Este cartão já possui correções e não pode ser editado.',
            variant: 'destructive',
          });
        } else if (status === 400) {
          toast({
            title: 'Erro de validação',
            description: data.message || data.error || 'Dados inválidos.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Erro',
            description: data.message || data.error || 'Não foi possível salvar a estrutura.',
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Erro',
          description: 'Não foi possível salvar a estrutura.',
          variant: 'destructive',
        });
      }
    } finally {
      setStructEditSaving(false);
    }
  }, [
    structEditGabaritoId,
    structEditNumQuestions,
    structEditBlocks,
    structEditQuestionSkills,
    structEditQuestionsOptions,
    resetStructEditDialogState,
    fetchGabaritos,
    toast,
  ]);

  const handleRegeneratePdfs = useCallback(() => {
    setShowRegeneratePdfsDialog(false);
    resetStructEditDialogState();
    setActiveTab('generate');
    toast({
      title: 'Redirecionado',
      description: 'Use a aba "Gerar cartões" para regenerar os PDFs com as novas alterações.',
    });
  }, [resetStructEditDialogState, toast]);

  const getSkillCodesForQuestion = useCallback((questionNum: number): string[] => {
    const ids = structEditQuestionSkills[String(questionNum)] ?? [];
    return ids
      .map((id) => skillCodeCache[id] ?? availableSkills.find((s) => s.id === id)?.code)
      .filter(Boolean) as string[];
  }, [structEditQuestionSkills, skillCodeCache, availableSkills]);

  const getAvailableAlternatives = useCallback((q: number): string[] => {
    if (useGlobalAlternatives) return globalAlternatives;
    return structEditQuestionsOptions[String(q)] || ['A', 'B', 'C', 'D'];
  }, [useGlobalAlternatives, globalAlternatives, structEditQuestionsOptions]);

  const handleToggleGlobalAlternative = useCallback((alternative: string, checked: boolean) => {
    if (checked) {
      if (globalAlternatives.length >= 4) {
        toast({ 
          title: 'Máximo 4 alternativas', 
          description: 'Selecione no máximo 4 alternativas.',
          variant: 'destructive' 
        });
        return;
      }
      setGlobalAlternatives([...globalAlternatives, alternative].sort());
    } else {
      if (globalAlternatives.length <= 2) {
        toast({ 
          title: 'Mínimo 2 alternativas', 
          description: 'Cada questão deve ter pelo menos 2 alternativas.',
          variant: 'destructive' 
        });
        return;
      }
      setGlobalAlternatives(globalAlternatives.filter((a) => a !== alternative));
    }
  }, [globalAlternatives, toast]);

  const handleToggleQuestionAlternative = useCallback((questionNumber: number, alternative: string, checked: boolean) => {
    const current = structEditQuestionsOptions[String(questionNumber)] || ['A', 'B', 'C', 'D'];
    if (checked) {
      if (current.length >= 4) {
        toast({ 
          title: 'Máximo 4 alternativas',
          description: 'Selecione no máximo 4 alternativas.',
          variant: 'destructive' 
        });
        return;
      }
      setStructEditQuestionsOptions((prev) => ({ 
        ...prev, 
        [String(questionNumber)]: [...current, alternative].sort() 
      }));
    } else {
      if (current.length <= 2) {
        toast({ 
          title: 'Mínimo 2 alternativas',
          description: 'Cada questão deve ter pelo menos 2 alternativas.',
          variant: 'destructive' 
        });
        return;
      }
      const next = current.filter((a) => a !== alternative);
      setStructEditQuestionsOptions((prev) => ({ 
        ...prev, 
        [String(questionNumber)]: next 
      }));
    }
  }, [structEditQuestionsOptions, toast]);

  const handleApplyGlobalToAll = useCallback(() => {
    if (globalAlternatives.length < 2) {
      toast({ 
        title: 'Selecione pelo menos 2 alternativas',
        variant: 'destructive' 
      });
      return;
    }
    const newOptions: Record<string, string[]> = {};
    for (let i = 1; i <= structEditNumQuestions; i++) {
      newOptions[String(i)] = [...globalAlternatives];
    }
    setStructEditQuestionsOptions(newOptions);
    setUseGlobalAlternatives(false);
    toast({ 
      title: 'Aplicado', 
      description: `Alternativas aplicadas às ${structEditNumQuestions} questões.` 
    });
  }, [globalAlternatives, structEditNumQuestions, toast]);

  const handleAddStructEditBlock = useCallback(() => {
    if (structEditBlocks.length >= 4) {
      toast({ 
        title: 'Limite atingido', 
        description: 'Máximo de 4 blocos.', 
        variant: 'destructive' 
      });
      return;
    }
    const currentTotal = structEditBlocks.reduce((s, b) => s + b.questions_count, 0);
    if (currentTotal >= structEditNumQuestions) {
      toast({ 
        title: 'Todas as questões distribuídas', 
        description: 'Todas as questões já estão nos blocos. Aumente o total de questões primeiro.', 
        variant: 'destructive' 
      });
      return;
    }
    const startQuestion = currentTotal + 1;
    const remaining = structEditNumQuestions - currentTotal;
    const defaultCount = Math.min(MAX_QUESTIONS_PER_BLOCK, Math.max(MIN_QUESTIONS_PER_BLOCK, remaining));
    const newBlockId = structEditBlocks.length > 0 
      ? Math.max(...structEditBlocks.map(b => b.block_id)) + 1 
      : 1;
    
    setStructEditBlocks([
      ...structEditBlocks,
      {
        block_id: newBlockId,
        subject_id: '',
        subject_name: '',
        questions_count: defaultCount,
        start_question: startQuestion,
        end_question: startQuestion + defaultCount - 1,
      },
    ]);
  }, [structEditBlocks, structEditNumQuestions, MAX_QUESTIONS_PER_BLOCK, MIN_QUESTIONS_PER_BLOCK, toast]);

  const handleRemoveStructEditBlock = useCallback((blockId: number) => {
    const filtered = structEditBlocks.filter((b) => b.block_id !== blockId);
    const updated = filtered.map((block, index) => {
      const prevTotal = filtered.slice(0, index).reduce((s, b) => s + b.questions_count, 0);
      return {
        ...block,
        block_id: index + 1,
        start_question: prevTotal + 1,
        end_question: prevTotal + block.questions_count,
      };
    });
    setStructEditBlocks(updated);
  }, [structEditBlocks]);

  const handleUpdateStructEditBlockQuestions = useCallback((blockId: number, newCount: number) => {
    const validCount = Math.min(Math.max(MIN_QUESTIONS_PER_BLOCK, newCount), MAX_QUESTIONS_PER_BLOCK);
    const blockIndex = structEditBlocks.findIndex((b) => b.block_id === blockId);
    if (blockIndex === -1) return;
    
    if (newCount < MIN_QUESTIONS_PER_BLOCK || newCount > MAX_QUESTIONS_PER_BLOCK) {
      toast({
        title: 'Limite por bloco',
        description: `Cada bloco deve ter entre ${MIN_QUESTIONS_PER_BLOCK} e ${MAX_QUESTIONS_PER_BLOCK} questões.`,
        variant: 'destructive',
      });
    }
    
    const otherTotal = structEditBlocks.filter((b) => b.block_id !== blockId).reduce((s, b) => s + b.questions_count, 0);
    if (otherTotal + validCount > structEditNumQuestions) {
      toast({ 
        title: 'Excede o total', 
        description: `A soma dos blocos não pode exceder ${structEditNumQuestions} questões.`, 
        variant: 'destructive' 
      });
      return;
    }
    
    let runningStart = 1;
    const updated = structEditBlocks.map((block) => {
      const count = block.block_id === blockId ? validCount : block.questions_count;
      const start = runningStart;
      const end = runningStart + count - 1;
      runningStart += count;
      return { ...block, questions_count: count, start_question: start, end_question: end };
    });
    setStructEditBlocks(updated);
  }, [structEditBlocks, structEditNumQuestions, MIN_QUESTIONS_PER_BLOCK, MAX_QUESTIONS_PER_BLOCK, toast]);

  useEffect(() => {
    fetchGabaritos();
  }, [fetchGabaritos]);

  useEffect(() => {
    if (activeTab === 'generated') fetchGabaritos();
  }, [activeTab, fetchGabaritos]);

  useEffect(() => {
    const fetchDisciplines = async () => {
      if (!structEditOpen) return;
      
      try {
        setIsLoadingDisciplines(true);
        const response = await api.get('/subjects');
        setDisciplines(Array.isArray(response.data) ? response.data : []);
      } catch {
        toast({ 
          title: 'Erro', 
          description: 'Não foi possível carregar as disciplinas.', 
          variant: 'destructive' 
        });
        setDisciplines([]);
      } finally {
        setIsLoadingDisciplines(false);
      }
    };
    
    fetchDisciplines();
  }, [structEditOpen, toast]);

  // Carregar subjects e grades para habilidades
  useEffect(() => {
    const fetchSubjects = async () => {
      if (!structEditOpen) return;
      try {
        const response = await api.get<{ id: string; name: string }[]>('/subjects');
        setSubjectsForSkills(Array.isArray(response.data) ? response.data : []);
      } catch {
        setSubjectsForSkills([]);
      }
    };
    fetchSubjects();
  }, [structEditOpen]);

  useEffect(() => {
    const fetchGrades = async () => {
      if (!structEditOpen) return;
      try {
        const response = await api.get<{ id: string; name: string }[]>('/grades/');
        setGradesForSkills(Array.isArray(response.data) ? response.data : []);
      } catch {
        setGradesForSkills([]);
      }
    };
    fetchGrades();
  }, [structEditOpen]);

  // Carregar habilidades quando disciplina e série forem selecionadas
  useEffect(() => {
    if (!skillSubjectId || !skillGradeId) {
      setAvailableSkills([]);
      return;
    }
    const fetchSkills = async () => {
      try {
        setIsLoadingSkills(true);
        const fetchSkillsBySubjectAndGrade = useSkillsStore.getState().fetchSkills;
        const list = await fetchSkillsBySubjectAndGrade(skillSubjectId, skillGradeId);
        const next = Array.isArray(list)
          ? list.map((s) => ({ 
              id: s.id, 
              code: s.code, 
              description: s.description, 
              name: s.name || `${s.code} - ${s.description}` 
            }))
          : [];
        setAvailableSkills(next);
        
        // Atualizar cache de códigos
        setSkillCodeCache((prev) => {
          const merged = { ...prev };
          next.forEach((s) => { merged[s.id] = s.code; });
          return merged;
        });
      } catch (error) {
        console.error('Erro ao carregar habilidades:', error);
        setAvailableSkills([]);
        toast({ 
          title: 'Aviso', 
          description: 'Não foi possível carregar as habilidades.', 
          variant: 'default' 
        });
      } finally {
        setIsLoadingSkills(false);
      }
    };
    fetchSkills();
  }, [skillSubjectId, skillGradeId]);

  const processJobStatusData = useCallback(
    async (d: JobStatusResponse, options?: { silentToast?: boolean }): Promise<'processing' | 'completed' | 'failed'> => {
      setLastJobStatus(d);
      if (d.progress) {
        setJobProgress({
          current: d.progress.current ?? 0,
          total: d.progress.total || 1,
          percentage: d.progress.percentage ?? 0,
        });
      }

      if (d.status === 'completed') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setIsGenerating(false);
        const gabaritoId = d.gabarito_id;
        const resultDl = d.result?.download_url?.trim();
        const summaryDl = d.summary?.download_url?.trim();

        let next: string | null = null;
        if (resultDl) {
          next = resultDl;
        } else if (summaryDl) {
          next = summaryDl;
        } else if (gabaritoId) {
          const jid = typeof d.job_id === 'string' ? d.job_id.trim() : '';
          next = jid
            ? `answer-sheets/gabarito/${gabaritoId}/download?job_id=${encodeURIComponent(jid)}`
            : `answer-sheets/gabarito/${gabaritoId}/download`;
        }
        setJobDownloadUrl(next);
        setJobError(null);
        await fetchGabaritos();
        if (!options?.silentToast) {
          toast({
            title: 'Geração concluída',
            description: d.message || 'Cartões gerados com sucesso.',
          });
        }
        return 'completed';
      }

      if (d.status === 'failed') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setIsGenerating(false);
        const failMsg = formatJobFailureMessage(d);
        setJobError(failMsg);
        setJobDownloadUrl(null);
        if (!options?.silentToast) {
          toast({ title: 'Erro na geração', description: failMsg, variant: 'destructive' });
        }
        return 'failed';
      }

      return 'processing';
    },
    [fetchGabaritos, toast]
  );

  const startJobPolling = useCallback(
    (statusPath: string, options?: { silentToast?: boolean }) => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await api.get<JobStatusResponse>(statusPath);
          await processJobStatusData(statusRes.data, { silentToast: options?.silentToast });
        } catch (err: unknown) {
          const status =
            err && typeof err === 'object' && 'response' in err
              ? (err as { response?: { status?: number } }).response?.status
              : undefined;
          if (status === 404) {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            setIsGenerating(false);
            setJobError('Job não encontrado. A geração pode ter expirado. Verifique a lista de cartões.');
            if (!options?.silentToast) {
              toast({
                title: 'Job não encontrado',
                description: 'Verifique a lista de cartões gerados.',
                variant: 'destructive',
              });
            }
          }
        }
      }, 2000);
    },
    [processJobStatusData, toast]
  );

  /** Ao trocar o gabarito no select: só limpa estado local. Não chama generation-jobs nem /status. */
  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setJobId(null);
    setLastJobStatus(null);
    setJobDownloadUrl(null);
    setJobError(null);
    setIsGenerating(false);
    setJobProgress({ current: 0, total: 0, percentage: 0 });
    setJobErrorsOpen(true);
  }, [selectedGabaritoId]);

  const handleDownloadGabarito = async (
    gabaritoId: string,
    opts?: {
      generationId?: string;
      jobId?: string;
      /** `download_url` retornada pela API — sempre via axios + Bearer (blob) */
      downloadUrl?: string | null;
    }
  ) => {
    const key = gabaritoDownloadLoadingKey(gabaritoId, opts?.generationId);
    try {
      setDownloadingGabaritoId(key);
      const direct = opts?.downloadUrl?.trim();
      if (direct) {
        await fetchAuthenticatedDownload(direct, 'cartoes.zip');
        toast({
          title: 'Download iniciado',
          description: 'O arquivo será salvo pelo navegador.',
        });
        return;
      }
      const params: Record<string, string> = {};
      if (opts?.jobId) params.job_id = opts.jobId;
      await fetchAuthenticatedDownload(
        `answer-sheets/gabarito/${gabaritoId}/download`,
        'cartoes.zip',
        Object.keys(params).length > 0 ? { params } : undefined
      );
      toast({
        title: 'Download iniciado',
        description: 'O arquivo será salvo pelo navegador.',
      });
    } catch (err: unknown) {
      if (err instanceof Error && !isAxiosError(err)) {
        toast({ title: 'Erro', description: err.message, variant: 'destructive' });
        return;
      }
      const status = err && typeof err === 'object' && 'response' in err ? (err as { response?: { status?: number; data?: { status?: string; error?: string } } }).response?.status : undefined;
      const backendError = err && typeof err === 'object' && 'response' in err ? (err as { response?: { data?: { error?: string } } }).response?.data?.error : undefined;
      let msg = 'Não foi possível baixar o arquivo.';
      if (status === 404) msg = 'Cartões não encontrados.';
      else if (status === 400 && (err as { response?: { data?: { status?: string } } }).response?.data?.status === 'not_generated') msg = 'Os cartões ainda não foram gerados.';
      else if (status === 403) msg = 'Sem permissão para acessar este arquivo.';
      else if (backendError) msg = backendError;
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setDownloadingGabaritoId(null);
    }
  };

  const [isSavingJobZip, setIsSavingJobZip] = useState(false);

  const handleJobCompleteDownload = async () => {
    if (!jobDownloadUrl) return;
    try {
      setIsSavingJobZip(true);
      await fetchAuthenticatedDownload(jobDownloadUrl, 'cartoes.zip');
      toast({
        title: 'Download iniciado',
        description: 'O arquivo será salvo pelo navegador.',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Não foi possível baixar o arquivo.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setIsSavingJobZip(false);
    }
  };

  const isDownloadingGabarito = (gabaritoId: string, generationId?: string) =>
    downloadingGabaritoId === gabaritoDownloadLoadingKey(gabaritoId, generationId);

  const isBusyDownloadingForGabarito = (gabaritoId: string) =>
    downloadingGabaritoId === gabaritoId ||
    (downloadingGabaritoId?.startsWith(`${gabaritoId}__`) ?? false);

  const handleToggleSelectGabarito = (gabaritoId: string) => {
    setSelectedGabaritos((prev) => {
      const next = new Set(prev);
      if (next.has(gabaritoId)) next.delete(gabaritoId);
      else next.add(gabaritoId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedGabaritos.size === gabaritos.length) {
      setSelectedGabaritos(new Set());
    } else {
      setSelectedGabaritos(new Set(gabaritos.map((g) => g.id)));
    }
  };

  const handleOpenDeleteDialog = (gabaritoId?: string) => {
    if (gabaritoId) {
      setGabaritoToDelete(gabaritoId);
      setDeleteMode('single');
    } else {
      setDeleteMode('multiple');
    }
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    try {
      setIsDeleting(true);
      if (deleteMode === 'single' && gabaritoToDelete) {
        await api.delete(`/answer-sheets/${gabaritoToDelete}`);
        setGabaritos((prev) => prev.filter((g) => g.id !== gabaritoToDelete));
        toast({ title: 'Sucesso', description: 'Cartão excluído com sucesso.' });
      } else if (deleteMode === 'multiple') {
        const ids = Array.from(selectedGabaritos);
        await Promise.all(ids.map((id) => api.delete(`/answer-sheets/${id}`)));
        setGabaritos((prev) => prev.filter((g) => !selectedGabaritos.has(g.id)));
        setSelectedGabaritos(new Set());
        toast({ title: 'Sucesso', description: 'Cartões excluídos com sucesso.' });
      }
      setShowDeleteDialog(false);
      setGabaritoToDelete(null);
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível excluir o(s) cartão(ões).', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const loadNextFilterOptions = useCallback(
    async (filters: SelectedFilters) => {
      try {
        setIsLoadingOptions(true);
        const schoolIds = filters.school_ids ?? [];
        const firstSchoolId = schoolIds[0];
        const firstGradeId = filters.grade_ids?.[0];

        if (!filters.state && !filters.city && schoolIds.length === 0) {
          const res = await api.get('/answer-sheets/opcoes-filtros');
          const normalized = normalizeOptions(res.data?.estados);
          setStateOptions(normalized);
          return;
        }
        if (filters.state && !filters.city) {
          const params = new URLSearchParams();
          params.append('estado', filters.state);
          const res = await api.get(`/answer-sheets/opcoes-filtros?${params}`);
          const normalized = normalizeOptions(res.data?.municipios);
          setCityOptions(normalized);
          return;
        }
        if (filters.city && schoolIds.length === 0) {
          const params = new URLSearchParams();
          if (filters.state) params.append('estado', filters.state);
          params.append('municipio', filters.city);
          const res = await api.get(`/answer-sheets/opcoes-filtros?${params}`);
          const normalized = normalizeOptions(res.data?.escolas);
          setSchoolOptions(normalized);
          return;
        }
        if (schoolIds.length > 0 && !(filters.grade_ids?.length)) {
          const byId = new Map<string, FilterOption>();
          for (const schoolId of schoolIds) {
            const params = new URLSearchParams();
            if (filters.state) params.append('estado', filters.state);
            if (filters.city) params.append('municipio', filters.city);
            params.append('escola', schoolId);
            const res = await api.get(`/answer-sheets/opcoes-filtros?${params}`);
            const normalized = normalizeOptions(res.data?.series);
            normalized.forEach((o) => { if (!byId.has(o.id)) byId.set(o.id, o); });
          }
          setGradeOptions(Array.from(byId.values()));
          return;
        }
        if (schoolIds.length > 0 && filters.grade_ids?.length && !(filters.class_ids?.length)) {
          const byId = new Map<string, FilterOption>();
          for (const schoolId of schoolIds) {
            const params = new URLSearchParams();
            if (filters.state) params.append('estado', filters.state);
            if (filters.city) params.append('municipio', filters.city);
            params.append('escola', schoolId);
            if (firstGradeId) params.append('serie', firstGradeId);
            const res = await api.get(`/answer-sheets/opcoes-filtros?${params}`);
            const normalized = normalizeOptions(res.data?.turmas);
            normalized.forEach((o) => { if (!byId.has(o.id)) byId.set(o.id, o); });
          }
          setClassOptions(Array.from(byId.values()));
          return;
        }
        const params = new URLSearchParams();
        if (filters.state) params.append('estado', filters.state);
        if (filters.city) params.append('municipio', filters.city);
        if (firstSchoolId) params.append('escola', firstSchoolId);
        if (firstGradeId) params.append('serie', firstGradeId);
        if (filters.class_ids?.length) params.append('turma', filters.class_ids[0]);
        const res = await api.get(`/answer-sheets/opcoes-filtros?${params}`);
        if (schoolIds.length > 0 && !(filters.grade_ids?.length) && res.data?.series) {
          setGradeOptions(normalizeOptions(res.data.series));
        } else if (filters.grade_ids?.length && !(filters.class_ids?.length) && res.data?.turmas) {
          setClassOptions(normalizeOptions(res.data.turmas));
        }
      } catch {
        toast({ title: 'Erro', description: 'Não foi possível carregar as opções.', variant: 'destructive' });
      } finally {
        setIsLoadingOptions(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    loadNextFilterOptions(selectedFilters);
  }, [selectedFilters.state, selectedFilters.city, selectedFilters.school_ids?.length, selectedFilters.grade_ids?.length, selectedFilters.class_ids?.length, loadNextFilterOptions]);

  const handleSelectFilter = useCallback(
    async (level: FilterLevel, optionId: string, optionName: string) => {
      if (level !== 'state' && level !== 'city') return;
      const next: SelectedFilters = { ...selectedFilters };
      if (level === 'state') {
        next.state = optionId;
        next.city = undefined;
        next.school_ids = undefined;
        next.grade_ids = undefined;
        next.class_ids = undefined;
        setFilterLabels((p) => ({ ...p, state: optionName, city: '', school: '', grade: '', class: '' }));
      } else {
        next.city = optionId;
        next.school_ids = undefined;
        next.grade_ids = undefined;
        next.class_ids = undefined;
        setFilterLabels((p) => ({ ...p, city: optionName, school: '', grade: '', class: '' }));
      }
      setSelectedFilters(next);
      await loadNextFilterOptions(next);
    },
    [selectedFilters, loadNextFilterOptions]
  );

  const handleSchoolIdsChange = useCallback(
    (ids: string[]) => {
      setSelectedFilters((p) => ({ ...p, school_ids: ids.length ? ids : undefined, grade_ids: undefined, class_ids: undefined }));
      setFilterLabels((p) => ({ ...p, grade: '', class: '' }));
      if (ids.length) loadNextFilterOptions({ ...selectedFilters, school_ids: ids });
      else setGradeOptions([]);
    },
    [selectedFilters, loadNextFilterOptions]
  );

  const handleGradeIdsChange = useCallback(
    (ids: string[]) => {
      setSelectedFilters((p) => ({ ...p, grade_ids: ids.length ? ids : undefined, class_ids: undefined }));
      setFilterLabels((p) => ({ ...p, class: '' }));
      if (ids.length) loadNextFilterOptions({ ...selectedFilters, grade_ids: ids });
      else setClassOptions([]);
    },
    [selectedFilters, loadNextFilterOptions]
  );

  const handleClassIdsChange = useCallback((ids: string[]) => {
    setSelectedFilters((p) => ({ ...p, class_ids: ids.length ? ids : undefined }));
  }, []);

  const handleClearFilter = useCallback(
    (level: FilterLevel) => {
      if (level === 'state') {
        setSelectedFilters({});
        setFilterLabels({ state: '', city: '', school: '', grade: '', class: '' });
        setStateOptions([]);
        setCityOptions([]);
        setSchoolOptions([]);
        setGradeOptions([]);
        setClassOptions([]);
        loadNextFilterOptions({});
        return;
      }
      if (level === 'city') {
        const next = { ...selectedFilters };
        delete next.city;
        next.school_ids = undefined;
        next.grade_ids = undefined;
        next.class_ids = undefined;
        setSelectedFilters(next);
        setFilterLabels((p) => ({ ...p, city: '', school: '', grade: '', class: '' }));
        setSchoolOptions([]);
        setGradeOptions([]);
        setClassOptions([]);
        loadNextFilterOptions(next);
        return;
      }
      if (level === 'school') {
        setSelectedFilters((p) => ({ ...p, school_ids: undefined, grade_ids: undefined, class_ids: undefined }));
        setFilterLabels((p) => ({ ...p, school: '', grade: '', class: '' }));
        setGradeOptions([]);
        setClassOptions([]);
        loadNextFilterOptions({ ...selectedFilters, school_ids: undefined, grade_ids: undefined, class_ids: undefined });
        return;
      }
      if (level === 'grade') {
        setSelectedFilters((p) => ({ ...p, grade_ids: undefined, class_ids: undefined }));
        setFilterLabels((p) => ({ ...p, grade: '', class: '' }));
        setClassOptions([]);
        loadNextFilterOptions({ ...selectedFilters, grade_ids: undefined, class_ids: undefined });
        return;
      }
      setSelectedFilters((p) => ({ ...p, class_ids: undefined }));
      setFilterLabels((p) => ({ ...p, class: '' }));
    },
    [selectedFilters, loadNextFilterOptions]
  );

  const handleGenerate = async () => {
    if (!selectedGabaritoId) {
      toast({ title: 'Selecione um gabarito', variant: 'destructive' });
      return;
    }
    if (!selectedFilters.state || !selectedFilters.city) {
      toast({ title: 'Selecione estado e município', variant: 'destructive' });
      return;
    }
    try {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setIsGenerating(true);
      setJobId(null);
      setJobDownloadUrl(null);
      setJobError(null);
      setJobProgress({ current: 0, total: 0, percentage: 0 });
      setLastJobStatus(null);
      setJobErrorsOpen(true);

      const payload: { gabarito_id: string; school_ids?: string[]; grade_ids?: string[]; class_ids?: string[] } = {
        gabarito_id: selectedGabaritoId,
      };
      if (selectedFilters.school_ids?.length) payload.school_ids = selectedFilters.school_ids;
      if (selectedFilters.grade_ids?.length) payload.grade_ids = selectedFilters.grade_ids;
      if (selectedFilters.class_ids?.length) payload.class_ids = selectedFilters.class_ids;

      const res = await api.post('/answer-sheets/generate', payload, { headers: { 'Content-Type': 'application/json' } });

      if (res.status !== 202) {
        toast({ title: 'Resposta inesperada', description: 'Tente novamente.', variant: 'destructive' });
        setIsGenerating(false);
        return;
      }

      const data = res.data;
      setJobId(data.job_id);
      const initialTotal = data.total_classes ?? data.tasks?.length ?? 1;
      setLastJobStatus({
        job_id: data.job_id,
        gabarito_id: selectedGabaritoId,
        status: 'processing',
        message: data.note,
        progress: { current: 0, total: initialTotal, percentage: 0 },
        classes: mapPostTasksToClasses(data.tasks),
      });
      setJobProgress({
        current: 0,
        total: initialTotal,
        percentage: 0,
      });

      toast({
        title: 'Geração iniciada',
        description: data.note || `Gerando cartões para ${data.total_students ?? 0} alunos.`,
      });

      const statusPath = `/answer-sheets/jobs/${data.job_id}/status`;
      try {
        const statusRes = await api.get<JobStatusResponse>(statusPath);
        const outcome = await processJobStatusData(statusRes.data, { silentToast: false });
        if (outcome === 'processing') {
          startJobPolling(statusPath, { silentToast: false });
        }
      } catch {
        startJobPolling(statusPath, { silentToast: false });
      }
    } catch (err: unknown) {
      setIsGenerating(false);
      const msg =
        err && typeof err === 'object' && 'response' in err && typeof (err as { response?: { data?: { message?: string } } }).response?.data?.message === 'string'
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Não foi possível iniciar a geração.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    }
  };

  const selectedGabarito = gabaritos.find((g) => g.id === selectedGabaritoId);
  const canGenerate = selectedGabaritoId && selectedFilters.state && selectedFilters.city && !isGenerating;

  const classesForUi =
    lastJobStatus?.classes?.length
      ? lastJobStatus.classes
      : mapPostTasksToClasses(lastJobStatus?.tasks);
  const summary = lastJobStatus?.summary;
  const topErrors = lastJobStatus?.errors ?? [];
  const jobStatusMessage =
    lastJobStatus?.message ??
    (isGenerating ? 'Gerando cartões resposta PDF...' : null);

  return (
    <div className="space-y-8 pb-12">
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-primary/5 p-6 md:p-8">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Gerar cartões resposta</h1>
          <p className="mt-1 text-muted-foreground">
            Escolha um gabarito cadastrado e o escopo para gerar os cartões em PDF, ou baixe novamente os cartões já gerados.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'generate' | 'generated' | 'edit')} className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="generate">Gerar cartões</TabsTrigger>
          <TabsTrigger value="generated">Cartões gerados</TabsTrigger>
          <TabsTrigger value="edit">Editar cartões</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-6 mt-0">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="border-2 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Gabarito</CardTitle>
                  <CardDescription>Selecione o cartão resposta (gabarito) que será usado para gerar os PDFs.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingGabaritos ? (
                <Skeleton className="h-12 w-full rounded-lg" />
              ) : gabaritos.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                  Nenhum gabarito encontrado.{' '}
                  <Link to="/app/cartao-resposta/cadastrar" className="text-primary underline underline-offset-2">
                    Cadastrar gabarito
                  </Link>
                </div>
              ) : (
                <Select value={selectedGabaritoId || ''} onValueChange={setSelectedGabaritoId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione um gabarito..." />
                  </SelectTrigger>
                  <SelectContent>
                    {gabaritos.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="font-medium">{g.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {g.num_questions ?? 0} questões · {g.generation_status === 'completed' ? 'Pronto' : 'Pendente'}
                            {(g.generations_count ?? g.generations?.length ?? 0) > 0
                              ? ` · ${g.generations_count ?? g.generations?.length} geração(ões)`
                              : ''}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          <Card className="border-2 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Escopo da geração</CardTitle>
                  <CardDescription>Estado e município são obrigatórios. Opcionalmente escolha escolas, séries e turmas.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {(selectedFilters.state || selectedFilters.city || (selectedFilters.school_ids?.length ?? 0) > 0 || (selectedFilters.grade_ids?.length ?? 0) > 0 || (selectedFilters.class_ids?.length ?? 0) > 0) && (
                <div className="flex flex-wrap gap-2 rounded-lg bg-muted/40 p-3">
                  {filterLabels.state && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                      {filterLabels.state}
                      <button type="button" onClick={() => handleClearFilter('state')} className="rounded-full hover:bg-primary/20 p-0.5" aria-label="Limpar estado">
                        ×
                      </button>
                    </span>
                  )}
                  {filterLabels.city && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                      {filterLabels.city}
                      <button type="button" onClick={() => handleClearFilter('city')} className="rounded-full hover:bg-primary/20 p-0.5" aria-label="Limpar município">
                        ×
                      </button>
                    </span>
                  )}
                  {(selectedFilters.school_ids?.length ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                      {schoolOptions.filter((o) => selectedFilters.school_ids!.includes(o.id)).map((o) => o.name).join(', ') || `${selectedFilters.school_ids!.length} escola(s)`}
                      <button type="button" onClick={() => handleClearFilter('school')} className="rounded-full hover:bg-primary/20 p-0.5" aria-label="Limpar escolas">
                        ×
                      </button>
                    </span>
                  )}
                  {(selectedFilters.grade_ids?.length ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                      {gradeOptions.filter((o) => selectedFilters.grade_ids!.includes(o.id)).map((o) => o.name).join(', ') || `${selectedFilters.grade_ids!.length} série(s)`}
                      <button type="button" onClick={() => handleClearFilter('grade')} className="rounded-full hover:bg-primary/20 p-0.5" aria-label="Limpar séries">
                        ×
                      </button>
                    </span>
                  )}
                  {(selectedFilters.class_ids?.length ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                      {classOptions.filter((o) => selectedFilters.class_ids!.includes(o.id)).map((o) => o.name).join(', ') || `${selectedFilters.class_ids!.length} turma(s)`}
                      <button type="button" onClick={() => handleClearFilter('class')} className="rounded-full hover:bg-primary/20 p-0.5" aria-label="Limpar turmas">
                        ×
                      </button>
                    </span>
                  )}
                </div>
              )}

              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Estado *</Label>
                  <Select
                    value={selectedFilters.state || ''}
                    onValueChange={(v) => {
                      const o = stateOptions.find((x) => x.id === v);
                      if (o) handleSelectFilter('state', v, o.name);
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione o estado..." /></SelectTrigger>
                    <SelectContent>
                      {stateOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedFilters.state && (
                  <div className="space-y-2 border-l-2 border-primary/30 pl-4">
                    <Label>Município *</Label>
                    {isLoadingOptions && !cityOptions.length ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                      <Select
                        value={selectedFilters.city || ''}
                        onValueChange={(v) => {
                          const o = cityOptions.find((x) => x.id === v);
                          if (o) handleSelectFilter('city', v, o.name);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione o município..." /></SelectTrigger>
                        <SelectContent>
                          {cityOptions.map((o) => (
                            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {selectedFilters.city && (
                  <div className="space-y-2 border-l-2 border-primary/30 pl-4">
                    <Label>Escola(s) (opcional)</Label>
                    {isLoadingOptions && !schoolOptions.length ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                  <MultiSelect
                    options={schoolOptions.map((o) => ({ id: o.id, name: o.name }))}
                    selected={selectedFilters.school_ids ?? []}
                    onChange={handleSchoolIdsChange}
                    placeholder="Escolas (vazio = todas)"
                    allLabel="Todas"
                    mode="popover"
                    className="w-full"
                  />
                    )}
                  </div>
                )}

                {(selectedFilters.school_ids?.length ?? 0) > 0 && (
                  <div className="space-y-2 border-l-2 border-primary/30 pl-4">
                    <Label>Série(s) (opcional)</Label>
                    {isLoadingOptions && !gradeOptions.length ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                  <MultiSelect
                    options={gradeOptions.map((o) => ({ id: o.id, name: o.name }))}
                    selected={selectedFilters.grade_ids ?? []}
                    onChange={handleGradeIdsChange}
                    placeholder="Séries (vazio = todas)"
                    allLabel="Todas"
                    mode="popover"
                    className="w-full"
                  />
                    )}
                  </div>
                )}

                {(selectedFilters.grade_ids?.length ?? 0) > 0 && (
                  <div className="space-y-2 border-l-2 border-primary/30 pl-4">
                    <Label>Turma(s) (opcional)</Label>
                    {isLoadingOptions && !classOptions.length ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                  <MultiSelect
                    options={classOptions.map((o) => ({ id: o.id, name: o.name }))}
                    selected={selectedFilters.class_ids ?? []}
                    onChange={handleClassIdsChange}
                    placeholder="Turmas (vazio = todas)"
                    allLabel="Todas"
                    mode="popover"
                    className="w-full"
                  />
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={handleGenerate} disabled={!canGenerate}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Gerar cartões
                </>
              )}
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/app/cartao-resposta/cadastrar">Cadastrar novo gabarito</Link>
            </Button>
          </div>

          {(jobId || jobDownloadUrl || jobError || lastJobStatus) && (
            <Card className={jobError ? 'border-destructive/50' : 'border-primary/30'}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {jobDownloadUrl ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : jobError ? (
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  )}
                  {jobDownloadUrl ? 'Geração concluída' : jobError ? 'Erro' : 'Progresso'}
                </CardTitle>
                {jobStatusMessage && !jobError && (
                  <CardDescription className="text-foreground/90 pt-1">{jobStatusMessage}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {jobError && (
                  <>
                    <p className="text-sm text-destructive">{jobError}</p>
                    {topErrors.length > 0 && (
                      <ScrollArea className="h-[120px] rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                        <ul className="space-y-2 text-sm">
                          {topErrors.map((err, i) => (
                            <li key={i} className="rounded bg-background/80 px-2 py-1.5">
                              <span className="font-medium">
                                {err.class_name && `${err.class_name} · `}
                                {err.student_name ? `${err.student_name}: ` : ''}
                              </span>
                              <span className="text-muted-foreground text-xs">{err.error}</span>
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    )}
                  </>
                )}
                {(isGenerating ||
                  lastJobStatus?.status === 'completed' ||
                  lastJobStatus?.status === 'failed') && (
                  <>
                    <Progress value={jobProgress.percentage} className="h-2.5" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{jobProgress.percentage}%</span>
                      <span>
                        {jobProgress.current} / {jobProgress.total} turmas
                      </span>
                    </div>
                  </>
                )}
                {summary && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Turmas</p>
                      <p className="text-lg font-semibold">
                        {summary.completed_classes}/{summary.total_classes}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Alunos processados</p>
                      <p className="text-lg font-semibold">
                        {summary.completed_students}/{summary.total_students}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Sucesso</p>
                      <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                        {summary.successful_students}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Falhas</p>
                      <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                        {summary.failed_students}
                      </p>
                    </div>
                  </div>
                )}
                {classesForUi.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Turmas</p>
                    <ScrollArea className="h-[180px] rounded-lg border p-2">
                      <ul className="space-y-1.5">
                        {classesForUi.map((c) => (
                          <li
                            key={c.class_id}
                            className="flex items-center justify-between gap-2 rounded-md bg-muted/20 px-3 py-2 text-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {c.status === 'processing' && (
                                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                              )}
                              {c.status === 'completed' && (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                              )}
                              {(c.status === 'completed_with_errors' || c.status === 'failed') && (
                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                              )}
                              {c.status === 'pending' && (
                                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                              )}
                              <span className="font-medium truncate">{c.class_name}</span>
                              {c.school_name ? (
                                <span className="text-muted-foreground truncate text-xs hidden sm:inline">
                                  {c.school_name}
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-muted-foreground text-xs">
                                {c.total_students > 0 ? `${c.completed}/${c.total_students}` : null}
                              </span>
                              <Badge variant={classStatusVariant(c.status)} className="text-xs">
                                {classStatusLabel(c.status)}
                              </Badge>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </div>
                )}
                {topErrors.length > 0 && !jobError && lastJobStatus?.status !== 'failed' && (
                  <Collapsible open={jobErrorsOpen} onOpenChange={setJobErrorsOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200 hover:underline">
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 transition-transform duration-200 ${jobErrorsOpen ? 'rotate-90' : ''}`}
                      />
                      Avisos / erros parciais ({topErrors.length})
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ScrollArea className="h-[120px] mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
                        <ul className="space-y-2 text-sm">
                          {topErrors.map((err, i) => (
                            <li key={i} className="rounded bg-background/80 px-2 py-1.5">
                              <span className="font-medium">
                                {err.class_name && `${err.class_name} · `}
                                {err.student_name ? `${err.student_name}: ` : ''}
                              </span>
                              <span className="text-muted-foreground text-xs">{err.error}</span>
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {/* Não mostrar download direto aqui; a liberação/baixar deve acontecer na aba "Cartões gerados". */}
                {lastJobStatus?.status === 'completed' && !jobError && (
                  <p className="text-sm text-muted-foreground">
                    Geração concluída. Para baixar os arquivos, use a aba &quot;Cartões gerados&quot;.
                  </p>
                )}
                {isGenerating && lastJobStatus?.status !== 'failed' && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Não feche esta página.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="hidden lg:block">
          <Card className="sticky top-4 border bg-card/80 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Resumo</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              {selectedGabarito ? (
                <>
                  <p><span className="font-medium text-foreground">Gabarito:</span> {selectedGabarito.title}</p>
                  <p><span className="font-medium text-foreground">Questões:</span> {selectedGabarito.num_questions ?? 0}</p>
                </>
              ) : (
                <p>Selecione um gabarito.</p>
              )}
              {selectedFilters.state && <p><span className="font-medium text-foreground">Estado:</span> {filterLabels.state || selectedFilters.state}</p>}
              {selectedFilters.city && <p><span className="font-medium text-foreground">Município:</span> {filterLabels.city || selectedFilters.city}</p>}
              {(selectedFilters.school_ids?.length ?? 0) > 0 && (
                <p><span className="font-medium text-foreground">Escolas:</span> {selectedFilters.school_ids!.length}</p>
              )}
              {(selectedFilters.grade_ids?.length ?? 0) > 0 && (
                <p><span className="font-medium text-foreground">Séries:</span> {selectedFilters.grade_ids!.length}</p>
              )}
              {(selectedFilters.class_ids?.length ?? 0) > 0 && (
                <p><span className="font-medium text-foreground">Turmas:</span> {selectedFilters.class_ids!.length}</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
        </TabsContent>

        <TabsContent value="generated" className="space-y-6 mt-0">
          <Card className="border-2 shadow-sm">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Cartões gerados</CardTitle>
                    <CardDescription>Baixe novamente os PDFs dos cartões já gerados.</CardDescription>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={fetchGabaritos} disabled={isLoadingGabaritos} className="ml-auto">
                  {isLoadingGabaritos ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Atualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingGabaritos ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : gabaritos.length === 0 ? (
                <div className="text-center py-12 rounded-lg border border-dashed bg-muted/30">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum cartão gerado ainda.</p>
                  <p className="text-sm text-muted-foreground mt-1">Use a aba &quot;Gerar cartões&quot; para criar os PDFs.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="select-all-generated"
                        checked={gabaritos.length > 0 && selectedGabaritos.size === gabaritos.length}
                        onCheckedChange={handleSelectAll}
                      />
                      <Label htmlFor="select-all-generated" className="text-sm font-medium cursor-pointer">
                        Selecionar todos ({selectedGabaritos.size}/{gabaritos.length})
                      </Label>
                    </div>
                    {selectedGabaritos.size > 0 && (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setSelectedGabaritos(new Set())}>
                          Limpar seleção
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleOpenDeleteDialog()} disabled={isDeleting}>
                          <Trash2 className="h-4 w-4 mr-1" />
                          Excluir selecionados ({selectedGabaritos.size})
                        </Button>
                      </div>
                    )}
                  </div>
                  {gabaritos.map((gabarito) => {
                    const generationsSorted = [...(gabarito.generations ?? [])].sort((a, b) => {
                      const ta = new Date(a.zip_generated_at ?? a.created_at ?? 0).getTime();
                      const tb = new Date(b.zip_generated_at ?? b.created_at ?? 0).getTime();
                      return tb - ta;
                    });
                    const hasGenerationsList = generationsSorted.length > 0;

                    return (
                    <Card
                      key={gabarito.id}
                      className={`overflow-hidden transition-shadow ${selectedGabaritos.has(gabarito.id) ? 'ring-2 ring-primary' : ''}`}
                    >
                      <CardContent className="p-6">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <Checkbox
                              id={`select-${gabarito.id}`}
                              checked={selectedGabaritos.has(gabarito.id)}
                              onCheckedChange={() => handleToggleSelectGabarito(gabarito.id)}
                              className="mt-1 shrink-0"
                            />
                            <div className="space-y-3 flex-1 min-w-0">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <h3 className="text-lg font-semibold truncate">{gabarito.title}</h3>
                              {hasGenerationsList && (
                                <Badge variant="outline" className="text-xs font-normal shrink-0">
                                  {gabarito.generations_count ?? generationsSorted.length} geração(ões)
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2 text-sm">
                              {gabarito.generation_status === 'completed' ? (
                                <Badge variant="default" className="bg-green-600 dark:bg-green-700">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Pronto
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Processando
                                </Badge>
                              )}
                              {gabarito.scope_type === 'class' && gabarito.class_name && (
                                <Badge variant="secondary">
                                  <Users className="h-3 w-3 mr-1" />
                                  {gabarito.class_name}
                                </Badge>
                              )}
                              {gabarito.scope_type === 'grade' && gabarito.grade_name && (
                                <Badge variant="secondary">
                                  <School className="h-3 w-3 mr-1" />
                                  {gabarito.grade_name}
                                </Badge>
                              )}
                              {gabarito.scope_type === 'school' && (gabarito.school_name ?? '') && (
                                <Badge variant="secondary">
                                  <School className="h-3 w-3 mr-1" />
                                  {gabarito.school_name}
                                </Badge>
                              )}
                              {gabarito.scope_type === 'city' && (gabarito.municipality || gabarito.state) && (
                                <Badge variant="secondary">
                                  <MapPin className="h-3 w-3 mr-1" />
                                  {[gabarito.municipality, gabarito.state].filter(Boolean).join(' - ')}
                                </Badge>
                              )}
                              <Badge variant="outline">{gabarito.students_count ?? 0} aluno(s)</Badge>
                              {(gabarito.classes_count ?? 0) >= 1 && (
                                <Badge variant="outline">{gabarito.classes_count} turma(s)</Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-muted-foreground">
                              <div>
                                <p className="text-xs text-muted-foreground">Cartão criado em</p>
                                <p className="font-medium text-foreground">
                                  {new Date(gabarito.created_at).toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              </div>
                              {gabarito.creator_name && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Criado por</p>
                                  <p className="font-medium text-foreground">{gabarito.creator_name}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-xs text-muted-foreground">Escopo (cadastro)</p>
                                <p className="font-medium text-foreground capitalize">
                                  {gabarito.scope_type === 'class' && 'Turma'}
                                  {gabarito.scope_type === 'grade' && 'Série'}
                                  {gabarito.scope_type === 'school' && 'Escola'}
                                  {gabarito.scope_type === 'city' && 'Município'}
                                  {!gabarito.scope_type && '—'}
                                </p>
                              </div>
                            </div>

                            {hasGenerationsList && (
                              <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                                <p className="text-sm font-medium text-foreground">Gerações de PDF (por escopo)</p>
                                <ul className="space-y-3">
                                  {generationsSorted.map((gen) => {
                                    const canDl = generationCanDownload(gen);
                                    const genStatus = (gen.status ?? '').toLowerCase();
                                    const classLabels = generationClassLabelsFromSnapshot(gen);
                                    return (
                                      <li
                                        key={gen.id}
                                        className="flex flex-col gap-2 rounded-md border bg-background/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                                      >
                                        <div className="min-w-0 flex-1 space-y-1">
                                          <p
                                            className="text-sm font-medium leading-snug"
                                            title={classLabels.length > 0 ? classLabels.join(', ') : undefined}
                                          >
                                            {formatGenerationScopeSummary(gen)}
                                          </p>
                                          {classLabels.length > 4 && (
                                            <p className="text-xs text-muted-foreground break-words">
                                              {classLabels.join(' · ')}
                                            </p>
                                          )}
                                          <p className="text-xs text-muted-foreground">
                                            {(gen.total_students ?? 0)} aluno(s) · {(gen.total_classes ?? 0)} turma(s)
                                            {(gen.zip_generated_at || gen.created_at) && (
                                              <>
                                                {' · '}
                                                {new Date(gen.zip_generated_at ?? gen.created_at ?? '').toLocaleString('pt-BR', {
                                                  day: '2-digit',
                                                  month: '2-digit',
                                                  year: 'numeric',
                                                  hour: '2-digit',
                                                  minute: '2-digit',
                                                })}
                                              </>
                                            )}
                                          </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                                          {genStatus === 'completed' ? (
                                            <Badge variant="default" className="bg-green-600 dark:bg-green-700 text-xs">
                                              Concluída
                                            </Badge>
                                          ) : genStatus === 'failed' ? (
                                            <Badge variant="destructive" className="text-xs">
                                              Falhou
                                            </Badge>
                                          ) : (
                                            <Badge variant="secondary" className="text-xs">
                                              {gen.status ?? '—'}
                                            </Badge>
                                          )}
                                          <Button
                                            size="sm"
                                            onClick={() =>
                                              handleDownloadGabarito(gabarito.id, {
                                                generationId: gen.id,
                                                jobId: gen.job_id,
                                                downloadUrl: resolveGenerationDownloadUrl(gen),
                                              })
                                            }
                                            disabled={!canDl || isDownloadingGabarito(gabarito.id, gen.id)}
                                          >
                                            {isDownloadingGabarito(gabarito.id, gen.id) ? (
                                              <>
                                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                Baixando...
                                              </>
                                            ) : !canDl ? (
                                              <>
                                                <Clock className="h-4 w-4 mr-1" />
                                                Indisponível
                                              </>
                                            ) : (
                                              <>
                                                <Download className="h-4 w-4 mr-1" />
                                                Baixar ZIP
                                              </>
                                            )}
                                          </Button>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <Button
                              variant="outline"
                              onClick={() => openEditDialogForGabarito(gabarito)}
                              disabled={isDeleting || isBusyDownloadingForGabarito(gabarito.id) || noEditPermissionIds.has(gabarito.id)}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar gabarito
                            </Button>
                            {!hasGenerationsList && (
                            <Button
                              onClick={() =>
                                handleDownloadGabarito(gabarito.id, {
                                  jobId: gabarito.latest_generation_job_id ?? undefined,
                                  downloadUrl: resolveGabaritoDownloadUrl(gabarito),
                                })
                              }
                              disabled={!gabarito.can_download || isDownloadingGabarito(gabarito.id)}
                            >
                              {isDownloadingGabarito(gabarito.id) ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Baixando...
                                </>
                              ) : !gabarito.can_download ? (
                                <>
                                  <Clock className="h-4 w-4 mr-2" />
                                  Processando
                                </>
                              ) : (
                                <>
                                  <Download className="h-4 w-4 mr-2" />
                                  Baixar ZIP
                                </>
                              )}
                            </Button>
                            )}
                            <Button
                              variant="destructive"
                              onClick={() => handleOpenDeleteDialog(gabarito.id)}
                              disabled={isDeleting || isBusyDownloadingForGabarito(gabarito.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={editOpen} onOpenChange={(v) => (v ? setEditOpen(true) : resetEditDialogState())}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Editar gabarito</DialogTitle>
                <DialogDescription>
                  {editTitle ? (
                    <>
                      <span className="font-medium text-foreground">{editTitle}</span>
                      {editNumQuestions ? <> · {editNumQuestions} questões</> : null}
                    </>
                  ) : (
                    'Edite as respostas corretas do cartão resposta.'
                  )}
                </DialogDescription>
              </DialogHeader>

              {editLoading ? (
                <div className="space-y-3 py-2">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  {recalcStatus === 'saving' && (
                    <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando…
                    </div>
                  )}
                  {recalcStatus === 'processing' && (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Recalculando resultados…
                      </div>
                      <Progress value={recalcProgressPct} />
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{Math.round(recalcProgressPct)}%</span>
                        {recalcSummary ? (
                          <>
                            <span>·</span>
                            <span>Sucesso: {recalcSummary.successful_items ?? 0}</span>
                            <span>·</span>
                            <span>Falhas: {recalcSummary.failed_items ?? 0}</span>
                          </>
                        ) : null}
                      </div>
                      {recalcMessage ? <div className="text-xs text-muted-foreground">{recalcMessage}</div> : null}
                    </div>
                  )}
                  {recalcStatus === 'completed' && (
                    <div className="rounded-lg border border-green-200 bg-green-50/60 p-3 text-sm text-green-800 dark:border-green-900/40 dark:bg-green-950/20 dark:text-green-200">
                      Recalculo concluído.
                    </div>
                  )}
                  {recalcStatus === 'failed' && (
                    <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
                      Falha ao recalcular. {recalcMessage || 'Tente novamente.'}
                    </div>
                  )}

                  <ScrollArea className="h-[50vh] pr-3">
                    <div className="grid gap-3">
                      {Array.from({ length: editNumQuestions }, (_, i) => i + 1).map((n) => {
                        const key = String(n);
                        const value = editCorrectAnswers[key] ?? null;
                        const CLEAR_VALUE = '__CLEAR__';
                        const selectValue = value ?? CLEAR_VALUE;
                        return (
                          <div key={key} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                            <div className="w-16 shrink-0 text-sm font-semibold text-foreground">Q{n}</div>
                            <div className="flex-1">
                              <Select
                                value={selectValue}
                                onValueChange={(v) => {
                                  const next = v === CLEAR_VALUE ? null : (v as Alternative);
                                  setEditCorrectAnswers((prev) => ({ ...prev, [key]: next }));
                                }}
                                disabled={editSaving || recalcStatus === 'processing' || recalcStatus === 'saving'}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Limpar" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={CLEAR_VALUE}>Limpar</SelectItem>
                                  {(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as Alternative[]).map((alt) => (
                                    <SelectItem key={alt} value={alt}>
                                      {alt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  {Array.isArray(recalcItems) && recalcItems.some((it) => (it.status ?? '').toLowerCase() === 'error') ? (
                    <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 dark:border-red-900/40 dark:bg-red-950/20">
                      <div className="text-sm font-semibold text-red-800 dark:text-red-200">Falhas</div>
                      <ul className="mt-2 space-y-1 text-xs text-red-800 dark:text-red-200">
                        {recalcItems
                          .filter((it) => (it.status ?? '').toLowerCase() === 'error')
                          .slice(0, 20)
                          .map((it, idx) => (
                            <li key={it.id ?? String(idx)} className="break-words">
                              {it.id ? <span className="font-semibold">{it.id}: </span> : null}
                              {it.error || it.message || 'Erro'}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={resetEditDialogState} disabled={editSaving || recalcStatus === 'processing' || recalcStatus === 'saving'}>
                      Fechar
                    </Button>
                    <Button
                      onClick={handleSaveEditedGabarito}
                      disabled={!editGabaritoId || editSaving || editLoading || recalcStatus === 'processing' || recalcStatus === 'saving'}
                    >
                      {editSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Salvando…
                        </>
                      ) : (
                        'Salvar'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Confirmar exclusão
                </DialogTitle>
                <DialogDescription>
                  {deleteMode === 'single' ? (
                    'Tem certeza que deseja excluir este gabarito? Esta ação não pode ser desfeita.'
                  ) : (
                    <>
                      Tem certeza que deseja excluir {selectedGabaritos.size} gabarito(s) selecionado(s)? Esta ação não pode ser desfeita.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setGabaritoToDelete(null);
                  }}
                  disabled={isDeleting}
                >
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Excluindo...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="edit" className="space-y-6 mt-0">
          <Card className="border-2 shadow-sm">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Pencil className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Editar estrutura dos cartões</CardTitle>
                    <CardDescription>
                      Edite a estrutura completa do cartão resposta: número de questões, blocos, habilidades e alternativas.
                    </CardDescription>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={fetchGabaritos} disabled={isLoadingGabaritos} className="ml-auto">
                  {isLoadingGabaritos ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Atualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingGabaritos ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : gabaritos.length === 0 ? (
                <div className="text-center py-12 rounded-lg border border-dashed bg-muted/30">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum cartão cadastrado ainda.</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    <Link to="/app/cartao-resposta/cadastrar" className="text-primary underline underline-offset-2">
                      Cadastre um gabarito
                    </Link>
                    {' '}para começar.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-4 text-sm">
                    <div className="flex gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-medium text-amber-900 dark:text-amber-100">Atenção ao editar a estrutura</p>
                        <ul className="text-amber-800 dark:text-amber-200 space-y-1 text-xs list-disc list-inside">
                          <li>Cartões com correções registradas <strong>não podem</strong> ser editados</li>
                          <li>Se os PDFs já foram gerados, será necessário <strong>regenerá-los</strong> após editar</li>
                          <li>As edições afetam a topologia e coordenadas do cartão</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {gabaritos.map((gabarito) => (
                    <Card key={gabarito.id} className="overflow-hidden">
                      <CardContent className="p-6">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div className="space-y-3 flex-1 min-w-0">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <h3 className="text-lg font-semibold">{gabarito.title}</h3>
                              <Badge variant="outline" className="text-xs">
                                {gabarito.num_questions ?? 0} questões
                              </Badge>
                            </div>
                            
                            <div className="flex flex-wrap gap-2 text-sm">
                              {gabarito.generation_status === 'completed' ? (
                                <Badge variant="default" className="bg-green-600 dark:bg-green-700">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  PDFs gerados
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Sem PDFs
                                </Badge>
                              )}
                              {gabarito.scope_type === 'city' && (gabarito.municipality || gabarito.state) && (
                                <Badge variant="secondary">
                                  <MapPin className="h-3 w-3 mr-1" />
                                  {[gabarito.municipality, gabarito.state].filter(Boolean).join(' - ')}
                                </Badge>
                              )}
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-muted-foreground">
                              <div>
                                <p className="text-xs text-muted-foreground">Criado em</p>
                                <p className="font-medium text-foreground">
                                  {new Date(gabarito.created_at).toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                  })}
                                </p>
                              </div>
                              {gabarito.creator_name && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Criado por</p>
                                  <p className="font-medium text-foreground">{gabarito.creator_name}</p>
                                </div>
                              )}
                              {(gabarito.generations_count ?? 0) > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Gerações</p>
                                  <p className="font-medium text-foreground">
                                    {gabarito.generations_count} vez(es)
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 shrink-0">
                            <Button
                              variant="outline"
                              onClick={() => openStructEditDialog(gabarito)}
                              disabled={isDeleting || structEditLoading}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar estrutura
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={structEditOpen} onOpenChange={(v) => (v ? setStructEditOpen(true) : resetStructEditDialogState())}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
              <DialogHeader className="shrink-0">
                <DialogTitle>Editar estrutura do cartão</DialogTitle>
                <DialogDescription>
                  {structEditTitle ? (
                    <>
                      <span className="font-medium text-foreground">{structEditTitle}</span>
                    </>
                  ) : (
                    'Configure a estrutura completa do cartão resposta.'
                  )}
                </DialogDescription>
              </DialogHeader>

              {structEditLoading ? (
                <div className="space-y-3 py-8">
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto pr-4 min-h-0">
                  <div className="space-y-6 pb-4">
                    {/* Número de questões */}
                    <div className="space-y-2">
                      <Label htmlFor="num-questions" className="text-base font-semibold">
                        Número de questões
                      </Label>
                      <p className="text-sm text-muted-foreground">Total de questões no cartão (1-104)</p>
                      <input
                        id="num-questions"
                        type="number"
                        min="1"
                        max="104"
                        value={structEditNumQuestions}
                        onChange={(e) => setStructEditNumQuestions(Math.max(1, Math.min(104, parseInt(e.target.value) || 0)))}
                        disabled={structEditSaving}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>

                    {/* Blocos */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base font-semibold">Blocos de questões</Label>
                          <p className="text-sm text-muted-foreground">Configure até 4 blocos (máx. 26 questões cada)</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleAddStructEditBlock}
                          disabled={structEditBlocks.length >= 4 || structEditSaving}
                        >
                          Adicionar bloco
                        </Button>
                      </div>

                      {structEditBlocks.length === 0 ? (
                        <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                          Nenhum bloco configurado. Clique em &quot;Adicionar bloco&quot; para começar.
                        </div>
                      ) : (
                        <>
                          <div className="space-y-3">
                            {structEditBlocks.map((block, idx) => (
                            <Card key={block.block_id} className="p-4">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <Badge variant="outline">Bloco {block.block_id}</Badge>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleRemoveStructEditBlock(block.block_id)}
                                    disabled={structEditSaving}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <div className="md:col-span-2">
                                    <Label className="text-xs">Disciplina *</Label>
                                    <Select
                                      value={block.subject_id}
                                      onValueChange={(value) => {
                                        const updated = [...structEditBlocks];
                                        const selectedDiscipline = disciplines.find(d => d.id === value);
                                        updated[idx].subject_id = value;
                                        updated[idx].subject_name = selectedDiscipline?.name || '';
                                        setStructEditBlocks(updated);
                                      }}
                                      disabled={structEditSaving || isLoadingDisciplines}
                                    >
                                      <SelectTrigger className="mt-1">
                                        <SelectValue placeholder={isLoadingDisciplines ? "Carregando disciplinas..." : "Selecione a disciplina..."} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {isLoadingDisciplines ? (
                                          <SelectItem value="__loading__" disabled>
                                            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                                            Carregando...
                                          </SelectItem>
                                        ) : disciplines.length === 0 ? (
                                          <SelectItem value="__empty__" disabled>
                                            Nenhuma disciplina disponível
                                          </SelectItem>
                                        ) : (
                                          disciplines.map((d) => (
                                            <SelectItem key={d.id} value={d.id}>
                                              {d.name}
                                            </SelectItem>
                                          ))
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs">Quantidade de questões neste bloco</Label>
                                    <span className="text-xs text-muted-foreground">
                                      (mín: {MIN_QUESTIONS_PER_BLOCK}, máx: {MAX_QUESTIONS_PER_BLOCK})
                                    </span>
                                  </div>
                                  <input
                                    type="number"
                                    min={MIN_QUESTIONS_PER_BLOCK}
                                    max={MAX_QUESTIONS_PER_BLOCK}
                                    value={block.questions_count}
                                    onChange={(e) => {
                                      const raw = parseInt(e.target.value, 10);
                                      if (Number.isNaN(raw)) return;
                                      handleUpdateStructEditBlockQuestions(block.block_id, raw);
                                    }}
                                    disabled={structEditSaving}
                                    className="mt-1 flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                  />
                                  <div className="text-xs text-muted-foreground">
                                    Questões {block.start_question} até {block.end_question}
                                  </div>
                                </div>
                              </div>
                            </Card>
                            ))}
                          </div>

                          {/* Resumo e validação */}
                          <div className="flex flex-wrap items-center gap-4 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                            <span className="font-medium text-foreground">
                              Total: {structEditBlocks.reduce((s, b) => s + b.questions_count, 0)} / {structEditNumQuestions} questões
                            </span>
                            <span className="text-muted-foreground">
                              · {structEditBlocks.length} / 4 blocos
                            </span>
                          </div>

                          {(() => {
                            const totalFromBlocks = structEditBlocks.reduce((sum, b) => sum + b.questions_count, 0);
                            const isValid = totalFromBlocks === structEditNumQuestions;
                            const diff = structEditNumQuestions - totalFromBlocks;
                            
                            if (!isValid) {
                              return (
                                <div className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
                                  <div className="flex items-start gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                      <p className="font-medium text-amber-900 dark:text-amber-100">
                                        Ajuste necessário
                                      </p>
                                      <p className="text-amber-800 dark:text-amber-200 text-xs mt-1">
                                        {diff > 0 
                                          ? `Faltam ${diff} questão(ões) para distribuir nos blocos. Aumente a quantidade de questões em algum bloco ou adicione um novo bloco.`
                                          : `Há ${Math.abs(diff)} questão(ões) a mais nos blocos. Diminua a quantidade de questões em algum bloco ou remova um bloco.`
                                        }
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div className="rounded-lg border border-green-500/50 bg-green-50 dark:bg-green-950/20 p-3 text-sm">
                                <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span className="font-medium">Blocos configurados corretamente</span>
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>

                    {/* Habilidades */}
                    <Collapsible>
                      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-4 hover:bg-muted/50">
                        <div>
                          <p className="text-base font-semibold">Habilidades por questão (opcional)</p>
                          <p className="text-sm text-muted-foreground">
                            {Object.keys(structEditQuestionSkills).length > 0 
                              ? `${Object.keys(structEditQuestionSkills).length} questão(ões) com habilidades`
                              : 'Nenhuma habilidade configurada'}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 transition-transform ui-open:rotate-90" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 rounded-lg border p-4 bg-muted/20">
                        <div className="space-y-4">
                          <p className="text-sm text-muted-foreground">
                            Selecione disciplina e série para carregar habilidades. Depois clique na questão para associar.
                          </p>
                          
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label className="text-xs">Disciplina</Label>
                              <Select value={skillSubjectId} onValueChange={setSkillSubjectId}>
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                                <SelectContent>
                                  {subjectsForSkills.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">Série</Label>
                              <Select value={skillGradeId} onValueChange={setSkillGradeId}>
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                                <SelectContent>
                                  {gradesForSkills.map((g) => (
                                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {(availableSkills.length > 0 || Object.keys(skillCodeCache).length > 0) && structEditNumQuestions >= 1 && (
                            <div className="space-y-2">
                              <Label className="text-xs">Clique na questão para editar habilidades</Label>
                              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 max-h-60 overflow-y-auto">
                                {Array.from({ length: structEditNumQuestions }, (_, i) => i + 1).map((n) => {
                                  const codes = getSkillCodesForQuestion(n);
                                  return (
                                    <Button
                                      key={n}
                                      type="button"
                                      variant={codes.length > 0 ? 'default' : 'outline'}
                                      size="sm"
                                      className="h-auto flex-col items-start p-2 text-left"
                                      onClick={() => setEditingQuestionSkillsNum(n)}
                                      disabled={structEditSaving}
                                    >
                                      <span className="font-medium text-xs">Q{n}</span>
                                      {codes.length > 0 && (
                                        <Badge variant="secondary" className="mt-1 h-4 px-1 text-[9px]">
                                          {codes.length}
                                        </Badge>
                                      )}
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {!skillSubjectId || !skillGradeId ? (
                            <p className="text-xs text-muted-foreground italic">
                              Selecione disciplina e série para carregar habilidades.
                            </p>
                          ) : isLoadingSkills ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Carregando habilidades...
                            </div>
                          ) : null}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Alternativas customizadas */}
                    <div className="space-y-3">
                      <div>
                        <Label className="text-base font-semibold">Alternativas por questão</Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Configure quais alternativas (A, B, C, D) estarão disponíveis
                        </p>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="use-global-alt"
                          checked={useGlobalAlternatives}
                          onCheckedChange={(c) => setUseGlobalAlternatives(c === true)}
                          disabled={structEditSaving}
                        />
                        <Label htmlFor="use-global-alt" className="cursor-pointer">
                          Usar as mesmas alternativas em todas as questões
                        </Label>
                      </div>

                      {useGlobalAlternatives && (
                        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                          <Label className="text-sm">Alternativas disponíveis (mín. 2, máx. 4)</Label>
                          <div className="flex flex-wrap gap-4">
                            {(['A', 'B', 'C', 'D'] as const).map((alt) => (
                              <div key={alt} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`global-alt-${alt}`}
                                  checked={globalAlternatives.includes(alt)}
                                  onCheckedChange={(c) => handleToggleGlobalAlternative(alt, c === true)}
                                  disabled={(!globalAlternatives.includes(alt) && globalAlternatives.length >= 4) || structEditSaving}
                                />
                                <Label htmlFor={`global-alt-${alt}`} className="text-sm font-medium cursor-pointer">
                                  {alt}
                                </Label>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {globalAlternatives.length} alternativa(s): {globalAlternatives.join(', ')}
                            {globalAlternatives.length < 2 && ' — Selecione pelo menos 2.'}
                          </p>
                          {structEditNumQuestions >= 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleApplyGlobalToAll}
                              disabled={globalAlternatives.length < 2 || structEditSaving}
                            >
                              Usar estas alternativas e configurar por questão
                            </Button>
                          )}
                        </div>
                      )}

                      {!useGlobalAlternatives && structEditNumQuestions >= 1 && (
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">
                            Configure 2 a 4 alternativas por questão usando o botão &quot;Configurar&quot;.
                          </p>
                          <div className="rounded-lg border bg-muted/20 p-3 max-h-60 overflow-y-auto">
                            <div className="flex flex-wrap gap-2">
                              {Array.from({ length: structEditNumQuestions }, (_, i) => i + 1).map((n) => {
                                const opts = getAvailableAlternatives(n);
                                return (
                                  <div key={n} className="flex items-center gap-1 rounded-md border bg-background p-1">
                                    <span className="w-8 text-center text-xs font-medium text-muted-foreground">Q{n}</span>
                                    <span className="text-xs text-muted-foreground px-1">{opts.join(',')}</span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-1.5 text-xs"
                                      onClick={() => setEditingQuestionAlternativesNum(n)}
                                      disabled={structEditSaving}
                                    >
                                      Configurar
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Respostas corretas */}
                  {structEditNumQuestions >= 1 && (
                    <div className="space-y-3 border-t pt-4">
                      <div>
                        <Label className="text-base font-semibold">Respostas corretas (gabarito)</Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Clique na letra para definir a resposta correta de cada questão
                        </p>
                      </div>
                      
                      <div className="rounded-lg border bg-muted/20 p-3 max-h-96 overflow-y-auto">
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: structEditNumQuestions }, (_, i) => i + 1).map((n) => {
                            const opts = getAvailableAlternatives(n);
                            const currentAnswer = structEditCorrectAnswers[String(n)];
                            
                            return (
                              <div key={n} className="flex items-center gap-1 rounded-md border bg-background p-1">
                                <span className="w-8 text-center text-xs font-medium text-muted-foreground">Q{n}</span>
                                {opts.map((letter) => (
                                  <button
                                    key={letter}
                                    type="button"
                                    onClick={() => {
                                      setStructEditCorrectAnswers((prev) => ({
                                        ...prev,
                                        [String(n)]: letter,
                                      }));
                                    }}
                                    className={`h-7 w-7 rounded text-xs font-semibold transition ${
                                      currentAnswer === letter
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-background hover:bg-muted'
                                    }`}
                                    disabled={structEditSaving}
                                  >
                                    {letter}
                                  </button>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      
                      <p className="text-xs text-muted-foreground">
                        {Object.keys(structEditCorrectAnswers).filter((k) => structEditCorrectAnswers[k] !== null).length} de {structEditNumQuestions} questão(ões) com resposta definida
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="shrink-0 flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={resetStructEditDialogState}
                  disabled={structEditSaving || structEditLoading}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveStructure}
                  disabled={!structEditGabaritoId || structEditSaving || structEditLoading}
                >
                  {structEditSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Salvar estrutura
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showRegeneratePdfsDialog} onOpenChange={setShowRegeneratePdfsDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Edição realizada com sucesso!
                </DialogTitle>
                <DialogDescription>
                  {structEditWarning || 'A estrutura foi atualizada, mas os PDFs já gerados não refletem as alterações.'}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-1">É necessário regenerar os cartões</p>
                <p className="text-xs">
                  Os PDFs anteriores continuam disponíveis, mas não incluem as mudanças que você acabou de fazer.
                  Gere novamente os cartões para aplicar as alterações nos documentos impressos.
                </p>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRegeneratePdfsDialog(false);
                    resetStructEditDialogState();
                  }}
                >
                  OK, entendi
                </Button>
                <Button onClick={handleRegeneratePdfs}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Gerar PDFs agora
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={editingQuestionSkillsNum !== null} onOpenChange={(open) => !open && setEditingQuestionSkillsNum(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Habilidades - Questão {editingQuestionSkillsNum ?? ''}</DialogTitle>
                <DialogDescription>
                  Selecione as habilidades associadas a esta questão. Habilidades de outras disciplinas já escolhidas permanecem selecionadas.
                </DialogDescription>
              </DialogHeader>
              {editingQuestionSkillsNum !== null && (() => {
                const selectedIds = structEditQuestionSkills[String(editingQuestionSkillsNum)] ?? [];
                const currentIds = new Set(availableSkills.map((s) => s.id));
                const cachedSkills = selectedIds
                  .filter((id) => !currentIds.has(id))
                  .map((id) => ({
                    id,
                    code: skillCodeCache[id] ?? id,
                    description: '',
                    name: skillCodeCache[id] ?? id,
                  }));
                const skillsForSelector = [...availableSkills, ...cachedSkills];
                
                return (
                  <SkillsSelector
                    skills={skillsForSelector}
                    selected={selectedIds}
                    onChange={(ids) => {
                      setStructEditQuestionSkills((prev) => ({
                        ...prev,
                        [String(editingQuestionSkillsNum)]: ids.length > 0 ? ids : undefined as any,
                      }));
                    }}
                    placeholder="Selecione habilidades"
                    allGrades={gradesForSkills}
                    subjectId={skillSubjectId}
                    subjectName={subjectsForSkills.find((s) => s.id === skillSubjectId)?.name}
                    gradeId={skillGradeId}
                    gradeName={gradesForSkills.find((g) => g.id === skillGradeId)?.name}
                  />
                );
              })()}
            </DialogContent>
          </Dialog>

          <Dialog open={editingQuestionAlternativesNum !== null} onOpenChange={(open) => !open && setEditingQuestionAlternativesNum(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Alternativas — Questão {editingQuestionAlternativesNum ?? ''}</DialogTitle>
                <DialogDescription>Selecione de 2 a 4 alternativas para esta questão.</DialogDescription>
              </DialogHeader>
              {editingQuestionAlternativesNum !== null && (
                <>
                  <div className="flex flex-wrap gap-4 py-2">
                    {(['A', 'B', 'C', 'D'] as const).map((alt) => {
                      const cur = structEditQuestionsOptions[String(editingQuestionAlternativesNum)] || ['A', 'B', 'C', 'D'];
                      const isChecked = cur.includes(alt);
                      return (
                        <div key={alt} className="flex items-center space-x-2">
                          <Checkbox
                            id={`q${editingQuestionAlternativesNum}-${alt}`}
                            checked={isChecked}
                            onCheckedChange={(c) => handleToggleQuestionAlternative(editingQuestionAlternativesNum, alt, c === true)}
                            disabled={!isChecked && cur.length >= 4}
                          />
                          <Label htmlFor={`q${editingQuestionAlternativesNum}-${alt}`} className="cursor-pointer">
                            {alt}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(structEditQuestionsOptions[String(editingQuestionAlternativesNum)] || ['A', 'B', 'C', 'D']).length} alternativa(s) selecionada(s)
                  </p>
                </>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
