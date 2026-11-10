import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { createCompetition, getCompetition, updateCompetition, addCompetitionQuestions, getCompetitionLevelOptions, getAllowedCompetitionScopes } from '@/services/competition/competitionsApi';
import type { CreateCompetitionFormData, CompetitionScope, CompetitionScopeFilter, QuestionRulesPayload } from '@/types/competition-types';
import { api } from '@/lib/api';
import { parseISOToDatetimeLocal, convertDateTimeLocalToISONaive } from '@/utils/date';
import { CalendarDays, CalendarRange, Clock, Loader2, Shuffle, ListOrdered, Trophy, Book, Plus, Eye, Trash2, List } from 'lucide-react';
import { QuestionBank } from '@/components/evaluations/QuestionBank';
import { ScopeFilterSelectionModal, type ScopeFilterKind } from '@/components/competitions/ScopeFilterSelectionModal';
import QuestionPreview from '@/components/evaluations/questions/QuestionPreview';
import type { Question } from '@/components/evaluations/types';
import { useAuth } from '@/context/authContext';
import { getUserHierarchyContext, type UserHierarchyContext } from '@/utils/userHierarchy';

const STEP_DESCRIPTIONS: Record<number, string> = {
  1: 'Configure o nome, disciplina, nível, escopo e vagas da competição.',
  2: 'Selecione as questões (manual ou aleatório).',
  3: 'Defina as recompensas. Depois, use o botão de aplicação no card para escolher o período da prova e abrir para os alunos.',
};

/** Fallback se a API de level-options falhar. */
const LEVEL_OPTIONS_FALLBACK: { value: 1 | 2; label: string }[] = [
  { value: 1, label: 'Educação Infantil, Anos Iniciais, Educação Especial, EJA' },
  { value: 2, label: 'Anos Finais e Ensino Médio' },
];

const SCOPE_OPTIONS: { value: CompetitionScope; label: string }[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'turma', label: 'Turma' },
  { value: 'escola', label: 'Escola' },
  { value: 'estado', label: 'Estado' },
  { value: 'municipio', label: 'Município' },
];

/** Dificuldades aceitas pelo backend (question_rules_validator / QuestionSelectionService). */
const QUESTION_DIFFICULTIES = ['Abaixo do Básico', 'Básico', 'Adequado', 'Avançado'] as const;

function parseQuestionRules(json: string | undefined): { num_questions: number; difficulty_filter: string[] } {
  if (!json?.trim()) return { num_questions: 10, difficulty_filter: [] };
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const num = typeof raw.num_questions === 'number' ? raw.num_questions : 10;
    let difficulty_filter: string[] = [];
    if (raw.difficulty_filter != null) {
      if (Array.isArray(raw.difficulty_filter)) difficulty_filter = raw.difficulty_filter as string[];
      else if (typeof raw.difficulty_filter === 'object' && Array.isArray((raw.difficulty_filter as { levels?: unknown }).levels)) {
        difficulty_filter = (raw.difficulty_filter as { levels: string[] }).levels;
      }
    }
    return { num_questions: num, difficulty_filter };
  } catch {
    return { num_questions: 10, difficulty_filter: [] };
  }
}

/** Regras para modo aleatório: apenas quantidade e dificuldade (nível/disciplina vêm do passo 1). Backend exige difficulty_filter como objeto { levels: string[] }. */
function buildQuestionRulesJsonSimple(p: { num_questions: number; difficulty_filter: string[] }): string {
  const payload: QuestionRulesPayload = {
    num_questions: p.num_questions,
    strategy: 'uniform',
    allow_repeat: false,
  };
  if (p.difficulty_filter.length) payload.difficulty_filter = { levels: p.difficulty_filter };
  return JSON.stringify(payload);
}

const initialFormData: CreateCompetitionFormData = {
  name: '',
  subject_id: '',
  level: 1,
  scope: undefined,
  scope_filter: undefined,
  enrollment_start: '',
  enrollment_end: '',
  question_mode: 'manual',
  question_rules: '',
  // valores padrão numéricos para recompensas
  reward_participation: '25',
  reward_ranking: '100',
};

/** Campo de data/hora com botão para abrir o seletor nativo (mais fácil em mobile/desktop). */
function DateTimeField({
  id,
  value,
  onChange,
  label,
  description,
  'aria-label': ariaLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: React.ReactNode;
  description?: string;
  'aria-label'?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof (el as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
      (el as HTMLInputElement & { showPicker: () => void }).showPicker();
    } else {
      el.focus();
      el.click();
    }
  };
  return (
    <div className="space-y-2">
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          id={id}
          type="datetime-local"
          step="60"
          aria-label={ariaLabel}
          className="flex-1 min-w-0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={openPicker}
          title="Abrir seletor de data e hora"
          className="shrink-0"
        >
          <CalendarRange className="h-4 w-4" />
        </Button>
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

interface CreateCompetitionModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Se definido, abre em modo edição (só permitido quando status === 'rascunho'). */
  editId?: string | null;
}

interface SubjectOption {
  id: string;
  name: string;
}

export function CreateCompetitionModal({
  open,
  onClose,
  onSuccess,
  editId,
}: CreateCompetitionModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<CreateCompetitionFormData>(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [levelOptions, setLevelOptions] = useState<{ value: number; label: string }[]>(LEVEL_OPTIONS_FALLBACK);
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>([]);
  const [showQuestionBank, setShowQuestionBank] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [scopeFilterOptions, setScopeFilterOptions] = useState<{ id: string; name: string }[]>([]);
  const [scopeFilterLoading, setScopeFilterLoading] = useState(false);
  const [scopeStates, setScopeStates] = useState<{ id: string; name: string; uf?: string }[]>([]);
  const [scopeMunicipalities, setScopeMunicipalities] = useState<{ id: string; name: string }[]>([]);
  const [selectedStateForMunicipio, setSelectedStateForMunicipio] = useState<string>('');
  const [allowedScopes, setAllowedScopes] = useState<string[]>(['individual']);
  const [scopeFilterModalOpen, setScopeFilterModalOpen] = useState(false);
  const [userHierarchy, setUserHierarchy] = useState<UserHierarchyContext | null>(null);
  const { user } = useAuth();
  const isEdit = Boolean(editId);

  useEffect(() => {
    if (!open) {
      setScopeFilterModalOpen(false);
      setUserHierarchy(null);
      return;
    }
    setStep(1);
    setFormData(initialFormData);
    setErrors({});
    setSelectedQuestions([]);
    setShowQuestionBank(false);
    setPreviewQuestion(null);
    setScopeFilterOptions([]);
    setScopeStates([]);
    setScopeMunicipalities([]);
    setSelectedStateForMunicipio('');
    setScopeFilterModalOpen(false);
    if (editId) setLoadingEdit(true);
  }, [open, editId]);

  useEffect(() => {
    if (!open) return;
    api.get<SubjectOption[]>('/subjects').then((res) => {
      if (Array.isArray(res.data)) setSubjects(res.data);
    }).catch(() => setSubjects([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    getCompetitionLevelOptions()
      .then((res) => {
        if (res?.levels?.length) setLevelOptions(res.levels);
      })
      .catch(() => setLevelOptions(LEVEL_OPTIONS_FALLBACK));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    getAllowedCompetitionScopes()
      .then((scopes) => setAllowedScopes(scopes))
      .catch(() => setAllowedScopes(['individual']));
  }, [open]);

  useEffect(() => {
    if (!open || !user?.id) return;
    getUserHierarchyContext(user.id, user.role ?? '')
      .then((ctx) => setUserHierarchy(ctx))
      .catch(() => setUserHierarchy(null));
  }, [open, user?.id, user?.role]);

  // Em edição: se o escopo da competição não estiver nos permitidos (ex.: admin criou Estado, tec adm editando), limpar
  useEffect(() => {
    if (!open || !formData.scope || allowedScopes.length === 0) return;
    if (!allowedScopes.includes(formData.scope)) {
      setFormData((prev) => ({ ...prev, scope: undefined, scope_filter: undefined }));
      setSelectedStateForMunicipio('');
    }
  }, [open, allowedScopes, formData.scope]);

  // Carregar opções do filtro de escopo conforme o tipo selecionado
  useEffect(() => {
    if (!open || !formData.scope || formData.scope === 'individual') {
      setScopeFilterOptions([]);
      setScopeStates([]);
      setScopeMunicipalities([]);
      setSelectedStateForMunicipio('');
      return;
    }
    const scope = formData.scope;

    if (scope === 'municipio') {
      setScopeFilterOptions([]);
      setScopeFilterLoading(true);
      api.get<Array<{ id: string; name: string; uf?: string }>>('/city/states')
        .then((res) => {
          const list = Array.isArray(res.data) ? res.data : [];
          setScopeStates(list.map((s) => ({ id: s.id, name: s.name, uf: s.uf })));
        })
        .catch(() => setScopeStates([]))
        .finally(() => setScopeFilterLoading(false));
      return;
    }

    setScopeFilterLoading(true);
    const endpoints: Record<string, string> = {
      turma: '/classes',
      escola: '/schools',
      estado: '/city/states',
    };
    const url = endpoints[scope];
    if (!url) {
      setScopeFilterLoading(false);
      return;
    }
    api.get<Array<{ id: string; name: string }>>(url)
      .then((res) => {
        const raw = Array.isArray(res.data) ? res.data : [];
        setScopeFilterOptions(raw.map((item) => ({ id: item.id, name: item.name ?? item.id })));
      })
      .catch(() => setScopeFilterOptions([]))
      .finally(() => setScopeFilterLoading(false));
  }, [open, formData.scope]);

  // Município: carregar municípios quando o estado for selecionado
  useEffect(() => {
    if (!open || formData.scope !== 'municipio' || !selectedStateForMunicipio) {
      setScopeMunicipalities([]);
      return;
    }
    setScopeFilterLoading(true);
    const stateName = selectedStateForMunicipio;
    api.get<Array<{ id: string; name: string }>>(`/city/municipalities/state/${encodeURIComponent(stateName)}`)
      .then((res) => {
        const raw = Array.isArray(res.data) ? res.data : [];
        setScopeMunicipalities(raw.map((item) => ({ id: item.id, name: item.name ?? item.id })));
      })
      .catch(() => setScopeMunicipalities([]))
      .finally(() => setScopeFilterLoading(false));
  }, [open, formData.scope, selectedStateForMunicipio]);

  useEffect(() => {
    if (!open || !editId) return;
    setLoadingEdit(true);
    getCompetition(editId)
      .then(async (c) => {
        const questionRulesStr: string =
          typeof c.question_rules === 'object' && c.question_rules != null
            ? JSON.stringify(c.question_rules)
            : (typeof c.question_rules === 'string' ? c.question_rules : '');
        const participation =
          c.reward_config?.participation_coins ?? c.reward_participation ?? '';
        const ranking =
          c.reward_config?.ranking_rewards?.[0] != null
            ? String(c.reward_config.ranking_rewards[0].coins)
            : (c.reward_ranking ?? '');
        setFormData({
          name: c.name ?? '',
          subject_id: c.subject_id ?? '',
          level: (c.level === 1 || c.level === 2 ? c.level : 1) as 1 | 2,
          scope: (c.scope as CompetitionScope) ?? undefined,
          scope_filter: c.scope_filter ?? undefined,
          enrollment_start: parseISOToDatetimeLocal(c.enrollment_start),
          enrollment_end: parseISOToDatetimeLocal(c.enrollment_end),
          // usa max_participants quando existir; fallback para limit legado
          limit: c.max_participants ?? c.limit ?? undefined,
          question_mode: c.question_mode ?? 'manual',
          question_rules: questionRulesStr,
          reward_participation: participation,
          reward_ranking: ranking,
        });
        if (c.question_mode === 'manual' && c.question_ids?.length) {
          try {
            const list = await Promise.all(
              (c.question_ids as string[]).map((id) =>
                api.get(`/questions/${id}`).then((r) => r.data).catch(() => null)
              )
            );
            const mapped = list.filter(Boolean).map((q: Record<string, unknown>) => ({
              id: String(q.id),
              title: String(q.title ?? ''),
              text: String(q.text ?? q.formatted_text ?? ''),
              type: 'multipleChoice' as const,
              subjectId: String(q.subject_id ?? ''),
              difficulty: String(q.difficulty_level ?? q.difficulty ?? ''),
              value: Number(q.value ?? 1),
              options: Array.isArray(q.alternatives) ? (q.alternatives as { text: string; isCorrect?: boolean }[]).map((alt) => ({ id: '', text: alt.text, isCorrect: Boolean(alt.isCorrect) })) : [],
              created_by: String(q.created_by ?? ''),
            })) as Question[];
            setSelectedQuestions(mapped);
          } catch {
            // ignore
          }
        }
      })
      .catch(() => toast({ title: 'Erro ao carregar competição.', variant: 'destructive' }))
      .finally(() => setLoadingEdit(false));
  }, [open, editId, toast]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name?.trim()) newErrors.name = 'Nome é obrigatório';
    if (!formData.subject_id) newErrors.subject_id = 'Disciplina é obrigatória';

    if (formData.scope === 'estado') {
      const hasStateIds = getEstadoSelectedIds().length > 0;
      const hasStateNames = (formData.scope_filter as { state_names?: string[] } | undefined)?.state_names?.length;
      if (!hasStateIds && !hasStateNames) {
        newErrors.scope = 'Selecione ao menos um estado para o escopo Estado.';
      }
    }

    const isManual = (formData.question_mode ?? 'manual').toLowerCase() === 'manual';
    if (isManual) {
      if (selectedQuestions.length === 0) {
        newErrors.questions = 'Adicione pelo menos uma questão antes de criar a competição.';
      }
    } else {
      const rules = parseQuestionRules(formData.question_rules);
      if (!rules.num_questions || rules.num_questions < 1) {
        newErrors.questions = 'Defina a quantidade de questões (mínimo 1) no modo aleatório.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /** Para escopo estado: IDs selecionados (state_ids ou state_names mapeados a IDs quando vindo da API). */
  const getEstadoSelectedIds = (): string[] => {
    const sf = formData.scope_filter;
    if (formData.scope !== 'estado' || !sf) return [];
    const stateIds = (sf as { state_ids?: string[] }).state_ids;
    if (stateIds?.length) return stateIds;
    const stateNames = (sf as { state_names?: string[] }).state_names;
    if (stateNames?.length && scopeFilterOptions.length) {
      const norm = (s: string) => (s ?? '').trim().toLowerCase();
      return stateNames
        .map((name) => scopeFilterOptions.find((o) => norm(o.name) === norm(name))?.id)
        .filter((id): id is string => Boolean(id));
    }
    return [];
  };

  /** Para escopo estado: nomes dos estados (para exibição quando ainda não há IDs resolvidos, ex.: edição). */
  const getEstadoDisplayNames = (): string[] => {
    const sf = formData.scope_filter;
    if (formData.scope !== 'estado' || !sf) return [];
    const stateIds = (sf as { state_ids?: string[] }).state_ids;
    const stateNames = (sf as { state_names?: string[] }).state_names;
    if (stateIds?.length && scopeFilterOptions.length) {
      return stateIds
        .map((id) => scopeFilterOptions.find((o) => o.id === id)?.name)
        .filter((n): n is string => Boolean(n));
    }
    if (stateNames?.length) return stateNames;
    return [];
  };

  /** Valida apenas a etapa atual — só permite avançar com tudo preenchido. */
  const isStepValid = (s: number): boolean => {
    if (s === 1) {
      if (!formData.name?.trim() || !formData.subject_id) return false;
      if (formData.scope && formData.scope !== 'individual') {
        if (formData.scope === 'municipio') {
          if (!selectedStateForMunicipio) return false;
          const ids = formData.scope_filter?.municipality_ids ?? [];
          if (ids.length === 0) return false;
        } else {
          const ids =
            formData.scope === 'turma' ? formData.scope_filter?.class_ids ?? []
              : formData.scope === 'escola' ? formData.scope_filter?.school_ids ?? []
              : formData.scope === 'estado' ? getEstadoSelectedIds()
              : [];
          if (ids.length === 0) return false;
        }
      }
      return true;
    }
    if (s === 2) {
      const isManual = (formData.question_mode ?? 'manual').toLowerCase() === 'manual';
      if (isManual) return selectedQuestions.length > 0;
      const rules = parseQuestionRules(formData.question_rules);
      return rules.num_questions >= 1;
    }
    if (s === 3) {
      const hasParticipation = formData.reward_participation != null && String(formData.reward_participation).trim() !== '';
      const hasRanking = formData.reward_ranking != null && String(formData.reward_ranking).trim() !== '';
      return hasParticipation && hasRanking;
    }
    return true;
  };

  const buildPayloadWithISODates = () => {
    const payload = { ...formData };

    // Backend exige state_names (ou state) para escopo 'estado'; o formulário usa state_ids ou state_names (edição)
    if (payload.scope === 'estado' && payload.scope_filter) {
      const sf = payload.scope_filter as Record<string, unknown>;
      const stateIds = sf.state_ids as string[] | undefined;
      if (stateIds?.length) {
        const names = stateIds
          .map((id) => scopeFilterOptions.find((o) => o.id === id)?.name)
          .filter((n): n is string => Boolean(n));
        if (names.length) sf.state_names = names;
        // se a conversão falhar (options não carregadas), não sobrescrever state_names existente (edição)
      }
      delete sf.state_ids;
    }

    const subjectName = formData.subject_id
      ? (subjects.find((s) => s.id === formData.subject_id)?.name ?? '')
      : '';
    (payload as Record<string, unknown>).subject_name = subjectName;

    const now = new Date();
    const fiveMinutesMs = 5 * 60 * 1000;
    const oneHourMs = 60 * 60 * 1000;

    // Definição de inscrições:
    // - Se já houver valores (caso edição), respeita e converte.
    // - Se não houver, usa padrões: início = agora + 5min, fim = agora + 1h.
    if (payload.enrollment_start?.trim()) {
      payload.enrollment_start =
        convertDateTimeLocalToISONaive(payload.enrollment_start.trim()) ||
        formData.enrollment_start;
    } else {
      const start = new Date(now.getTime() + fiveMinutesMs);
      payload.enrollment_start = convertDateTimeLocalToISONaive(
        `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(
          start.getDate(),
        ).padStart(2, '0')}T${String(start.getHours()).padStart(2, '0')}:${String(
          start.getMinutes(),
        ).padStart(2, '0')}`,
      );
    }

    if (payload.enrollment_end?.trim()) {
      payload.enrollment_end =
        convertDateTimeLocalToISONaive(payload.enrollment_end.trim()) ||
        formData.enrollment_end;
    } else {
      const end = new Date(now.getTime() + oneHourMs);
      payload.enrollment_end = convertDateTimeLocalToISONaive(
        `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(
          end.getDate(),
        ).padStart(2, '0')}T${String(end.getHours()).padStart(2, '0')}:${String(
          end.getMinutes(),
        ).padStart(2, '0')}`,
      );
    }

    // Backend exige application e expiration; na prática, o período final da prova será ajustado
    // no fluxo de aplicação do card. Aqui apenas garantimos valores coerentes de default.
    const toNaiveISO = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day}T${h}:${min}:00`;
    };
    const enrollmentEndIso = payload.enrollment_end || (formData.enrollment_end?.trim() ? convertDateTimeLocalToISONaive(formData.enrollment_end.trim()) : null);
    if (enrollmentEndIso) {
      const endDate = new Date(enrollmentEndIso);
      if (!payload.application?.trim()) {
        const appDate = new Date(endDate.getTime() + 60 * 60 * 1000); // 1h após encerramento das inscrições
        payload.application = toNaiveISO(appDate);
      }
      if (!payload.expiration?.trim()) {
        const appDate = payload.application ? new Date(payload.application) : new Date(endDate.getTime() + 60 * 60 * 1000);
        const expDate = new Date(appDate.getTime() + 24 * 60 * 60 * 1000); // 24h após aplicação
        payload.expiration = toNaiveISO(expDate);
      }
    }
    delete (payload as Record<string, unknown>).ranking_criterion;
    delete (payload as Record<string, unknown>).visibility;
    // mapear limit (campo do formulário) para max_participants na API; vazio ou 0 = ilimitado
    const rawLimit = formData.limit;
    const maxParticipants =
      rawLimit != null && !Number.isNaN(rawLimit) && Number(rawLimit) > 0
        ? Number(rawLimit)
        : undefined;
    (payload as Record<string, unknown>).max_participants = maxParticipants;
    delete (payload as Record<string, unknown>).limit;
    // API exige reward_config: { participation_coins, ranking_rewards: [{ position, coins }] }
    const participationCoins = Number(formData.reward_participation) || 0;
    const rankingCoins = Number(formData.reward_ranking) || 0;
    (payload as Record<string, unknown>).reward_config = {
      participation_coins: participationCoins,
      ranking_rewards: [{ position: 1, coins: rankingCoins }],
    };
    delete (payload as Record<string, unknown>).reward_participation;
    delete (payload as Record<string, unknown>).reward_ranking;
    // Backend exige question_rules como objeto JSON, não string.
    if (payload.question_rules?.trim()) {
      try {
        (payload as Record<string, unknown>).question_rules = JSON.parse(payload.question_rules) as unknown;
      } catch {
        // mantém string se parse falhar (evita quebrar)
      }
    }
    return payload;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (isEdit && !editId) return;

    setLoading(true);
    try {
      const payload = buildPayloadWithISODates();
      if (process.env.NODE_ENV !== 'production') {
        // Log detalhado do payload enviado ao backend na criação/edição da competição
        console.log(
          '[Competitions] Enviando payload para %s /competitions%s:',
          isEdit ? 'PUT' : 'POST',
          isEdit && editId ? `/${editId}` : '',
          JSON.stringify(payload, null, 2),
        );
      }
      let competitionId: string;
      if (isEdit && editId) {
        await updateCompetition(editId, payload);
        competitionId = editId;
        toast({ title: 'Competição atualizada com sucesso.' });
      } else {
        const created = await createCompetition(payload);
        competitionId = created.id;
        toast({ title: 'Competição criada com sucesso.' });
      }
      if (formData.question_mode === 'manual' && selectedQuestions.length > 0) {
        await addCompetitionQuestions(competitionId, selectedQuestions.map((q) => q.id));
      }
      onSuccess();
      onClose();
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { message?: string; error?: string } } })?.response?.data
          ?.message ||
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (isEdit ? 'Erro ao atualizar competição.' : 'Erro ao criar competição.');
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const update = (partial: Partial<CreateCompetitionFormData>) => {
    setFormData((prev) => ({ ...prev, ...partial }));
    setErrors((prev) => {
      const next = { ...prev };
      Object.keys(partial).forEach((k) => delete next[k]);
      return next;
    });
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] flex flex-col"
        aria-describedby={open ? 'create-competition-desc' : undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            {isEdit ? 'Editar Competição' : 'Nova Competição'}
          </DialogTitle>
          <DialogDescription id="create-competition-desc">
            {STEP_DESCRIPTIONS[step]}
          </DialogDescription>
        </DialogHeader>

        {loadingEdit ? (
          <div className="flex items-center justify-center py-12 flex-1">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 flex-1 overflow-y-auto pr-1">
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da competição *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => update({ name: e.target.value })}
                      placeholder="Ex.: Olimpíada de Matemática 2025"
                      className="w-full min-w-0"
                    />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Disciplina *</Label>
                    <Select
                      value={formData.subject_id}
                      onValueChange={(value) => update({ subject_id: value })}
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue placeholder="Selecione a disciplina" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjects.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  {errors.subject_id && (
                    <p className="text-sm text-destructive">{errors.subject_id}</p>
                  )}
                </div>
                <div className="grid gap-4 grid-cols-1 xs:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="level">Nível *</Label>
                      <Select
                        value={String(formData.level)}
                        onValueChange={(value) => update({ level: value === '1' ? 1 : 2 })}
                      >
                        <SelectTrigger id="level" className="w-full min-w-0">
                          <SelectValue placeholder="Selecione o nível" />
                        </SelectTrigger>
                        <SelectContent>
                          {levelOptions.map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    <p className="text-xs text-muted-foreground">
                      Define quais etapas de ensino podem receber a competição.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scope">Escopo (opcional)</Label>
                    <Select
                      value={formData.scope ?? '__none__'}
                      onValueChange={(value) => {
                        const newScope = value === '__none__' ? undefined : (value as CompetitionScope);
                        update({ scope: newScope, scope_filter: undefined });
                        setSelectedStateForMunicipio('');
                      }}
                    >
                      <SelectTrigger id="scope" className="w-full min-w-0">
                        <SelectValue placeholder="Selecione o escopo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhum</SelectItem>
                        {SCOPE_OPTIONS.filter((opt) => allowedScopes.includes(opt.value)).map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="rounded-md border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
                      <p>Define quem pode ver e se inscrever nesta competição.</p>
                    </div>
                  </div>
                  {/* Filtro de escopo: modal de seleção múltipla com cards e filtros */}
                  {formData.scope && formData.scope !== 'individual' && (
                    <div className="space-y-2 xs:col-span-2">
                      {formData.scope === 'municipio' && (
                        <>
                          <Label>Estado (para município)</Label>
                          <Select
                            value={selectedStateForMunicipio}
                            onValueChange={(v) => {
                              setSelectedStateForMunicipio(v);
                              update({ scope_filter: undefined });
                            }}
                            disabled={scopeFilterLoading || scopeStates.length === 0}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={scopeFilterLoading ? 'Carregando…' : 'Selecione o estado'} />
                            </SelectTrigger>
                            <SelectContent>
                              {scopeStates.map((s) => (
                                <SelectItem key={s.id} value={s.name}>
                                  {s.name}{s.uf ? ` (${s.uf})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      )}
                      <Label>
                        {formData.scope === 'turma' && 'Turmas'}
                        {formData.scope === 'escola' && 'Escolas'}
                        {formData.scope === 'estado' && 'Estados'}
                        {formData.scope === 'municipio' && 'Municípios'}
                      </Label>
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full sm:w-auto justify-start gap-2"
                          onClick={() => setScopeFilterModalOpen(true)}
                          disabled={formData.scope === 'municipio' && !selectedStateForMunicipio}
                        >
                          <List className="h-4 w-4" />
                          {formData.scope === 'municipio' && !selectedStateForMunicipio
                            ? 'Selecione o estado acima primeiro'
                            : `Selecionar ${formData.scope === 'turma' ? 'turmas' : formData.scope === 'escola' ? 'escolas' : formData.scope === 'estado' ? 'estados' : 'municípios'}`
                          }
                        </Button>
                        {(() => {
                          const ids =
                            formData.scope === 'turma' ? formData.scope_filter?.class_ids ?? []
                              : formData.scope === 'escola' ? formData.scope_filter?.school_ids ?? []
                              : formData.scope === 'estado' ? getEstadoSelectedIds()
                              : formData.scope === 'municipio' ? formData.scope_filter?.municipality_ids ?? []
                              : [];
                          // Estado: em edição pode vir só state_names; exibir nomes mesmo antes de resolver IDs
                          const estadoNames = formData.scope === 'estado' ? getEstadoDisplayNames() : [];
                          const count = formData.scope === 'estado' && ids.length === 0 ? estadoNames.length : ids.length;
                          if (count === 0) return null;
                          return (
                            <div className="rounded-md border bg-muted/20 p-3">
                              <p className="text-xs font-medium text-muted-foreground mb-2">
                                {count} {count === 1
                                  ? (formData.scope === 'turma' ? 'turma' : formData.scope === 'escola' ? 'escola' : formData.scope === 'estado' ? 'estado' : 'município')
                                  : (formData.scope === 'turma' ? 'turmas' : formData.scope === 'escola' ? 'escolas' : formData.scope === 'estado' ? 'estados' : 'municípios')
                                } selecionada(s)
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {(formData.scope === 'estado' && ids.length === 0 ? estadoNames : ids).slice(0, 10).map((idOrName, i) => (
                                  <Badge key={formData.scope === 'estado' && ids.length === 0 ? `n-${i}` : idOrName} variant="secondary" className="text-xs font-normal">
                                    {formData.scope === 'estado' && ids.length === 0
                                      ? idOrName
                                      : scopeFilterOptions.find((o) => o.id === idOrName)?.name ?? scopeMunicipalities.find((m) => m.id === idOrName)?.name ?? 'Sem nome'}
                                  </Badge>
                                ))}
                                {count > 10 && (
                                  <Badge variant="outline" className="text-xs">+{count - 10} mais</Badge>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      {formData.scope !== 'municipio' && (
                        <ScopeFilterSelectionModal
                          open={scopeFilterModalOpen}
                          onClose={() => setScopeFilterModalOpen(false)}
                          kind={formData.scope as ScopeFilterKind}
                          competitionLevel={formData.level}
                          initialStateForTurma={formData.scope === 'turma' ? userHierarchy?.municipality?.state : undefined}
                          initialMunicipalityIdForTurma={formData.scope === 'turma' ? userHierarchy?.municipality?.id : undefined}
                          selectedIds={
                            formData.scope === 'turma' ? formData.scope_filter?.class_ids ?? []
                              : formData.scope === 'escola' ? formData.scope_filter?.school_ids ?? []
                              : formData.scope === 'estado' ? getEstadoSelectedIds()
                              : []
                          }
                          onConfirm={(ids) => {
                            if (formData.scope === 'turma') update({ scope_filter: ids.length ? { class_ids: ids } : undefined });
                            else if (formData.scope === 'escola') update({ scope_filter: ids.length ? { school_ids: ids } : undefined });
                            else if (formData.scope === 'estado') update({ scope_filter: ids.length ? { state_ids: ids } : undefined });
                          }}
                        />
                      )}
                      {formData.scope === 'municipio' && selectedStateForMunicipio && (
                        <ScopeFilterSelectionModal
                          open={scopeFilterModalOpen}
                          onClose={() => setScopeFilterModalOpen(false)}
                          kind="municipio"
                          stateNameForMunicipio={selectedStateForMunicipio}
                          selectedIds={formData.scope_filter?.municipality_ids ?? []}
                          onConfirm={(ids) => update({ scope_filter: ids.length ? { municipality_ids: ids } : undefined })}
                        />
                      )}
                      {errors.scope && (
                        <p className="text-sm text-destructive">{errors.scope}</p>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="max_participants">
                      Quantidade máxima de vagas (opcional)
                    </Label>
                    <Input
                      id="max_participants"
                      type="number"
                      min={1}
                      value={formData.limit != null ? String(formData.limit) : ''}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        update({
                          limit: v === '' ? undefined : Number(v),
                        });
                      }}
                      placeholder="Deixe em branco para vagas ilimitadas"
                      className="w-full min-w-0"
                    />
                    <p className="text-xs text-muted-foreground">
                      Se não preencher este campo, a competição terá vagas ilimitadas.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <RadioGroup
                  value={formData.question_mode === 'auto_random' ? 'auto_random' : 'manual'}
                  onValueChange={(v) => {
                    if (v === 'auto_random') {
                      const rules = parseQuestionRules(formData.question_rules);
                      update({
                        question_mode: 'auto_random',
                        question_rules: buildQuestionRulesJsonSimple({
                          num_questions: rules.num_questions,
                          difficulty_filter: rules.difficulty_filter,
                        }),
                      });
                    } else {
                      update({ question_mode: 'manual', question_rules: '' });
                    }
                  }}
                  className="flex flex-col gap-3"
                >
                  <div className="flex items-center gap-2 rounded-lg border p-4 hover:bg-muted/50">
                    <RadioGroupItem value="manual" id="mode-manual" />
                    <Label htmlFor="mode-manual" className="flex items-center gap-2 cursor-pointer flex-1">
                      <ListOrdered className="h-4 w-4" />
                      Manual — selecionar questões no banco
                    </Label>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border p-4 hover:bg-muted/50">
                    <RadioGroupItem value="auto_random" id="mode-auto" />
                    <Label htmlFor="mode-auto" className="flex items-center gap-2 cursor-pointer flex-1">
                      <Shuffle className="h-4 w-4" />
                      Sorteio automático — por quantidade e dificuldade (usa disciplina e nível já definidos)
                    </Label>
                  </div>
                </RadioGroup>

                {formData.question_mode === 'manual' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Questões da competição</h3>
                      <span className="text-sm text-muted-foreground">
                        Total: {selectedQuestions.length}{' '}
                        {selectedQuestions.length === 1 ? 'questão' : 'questões'}
                      </span>
                    </div>
                    {!formData.subject_id ? (
                      <p className="text-sm text-muted-foreground rounded-lg border p-3 bg-muted/20">
                        Selecione a disciplina no passo 1 para abrir o banco de questões.
                      </p>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowQuestionBank(true)}
                          className="border-primary text-primary hover:bg-primary/10"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Banco de Questões
                        </Button>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {selectedQuestions.length === 0 ? (
                            <div className="text-center py-6 text-muted-foreground border rounded-lg border-dashed">
                              <Book className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm">Nenhuma questão selecionada</p>
                              <p className="text-xs">Use o botão acima para adicionar questões</p>
                            </div>
                          ) : (
                            selectedQuestions.map((q, index) => (
                              <Card key={q.id}>
                                <CardContent className="p-3 flex items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary">#{index + 1}</Badge>
                                      <span className="text-sm font-medium truncate">
                                        {q.title || `Questão ${index + 1}`}
                                      </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                      {q.text || 'Sem texto'}
                                    </p>
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setPreviewQuestion(q)}
                                      title="Ver"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setSelectedQuestions((prev) => prev.filter((x) => x.id !== q.id));
                                        toast({ title: 'Questão removida' });
                                      }}
                                      title="Remover"
                                      className="text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {formData.question_mode === 'auto_random' && (() => {
                  const rules = parseQuestionRules(formData.question_rules);
                  const numQuestions = rules.num_questions;
                  const difficultyFilter = rules.difficulty_filter;

                  const setRules = (partial: { num_questions?: number; difficulty_filter?: string[] }) => {
                    const next = {
                      num_questions: partial.num_questions ?? numQuestions,
                      difficulty_filter: partial.difficulty_filter ?? difficultyFilter,
                    };
                    update({ question_rules: buildQuestionRulesJsonSimple(next) });
                  };
                  const toggleDifficulty = (d: string) => {
                    const next = difficultyFilter.includes(d)
                      ? difficultyFilter.filter((x) => x !== d)
                      : [...difficultyFilter, d];
                    setRules({ difficulty_filter: next });
                  };

                  return (
                    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                      <div className="flex items-center justify-between rounded-md bg-primary/10 border border-primary/20 px-3 py-2">
                        <span className="text-sm font-medium">Configuração selecionada (modo aleatório)</span>
                        <span className="text-sm text-muted-foreground">
                          {numQuestions}{' '}
                          {numQuestions === 1 ? 'questão' : 'questões'}
                          {difficultyFilter.length > 0 ? ` · ${difficultyFilter.join(', ')}` : ' · Todas as dificuldades'}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="num_questions">Quantidade de questões</Label>
                        <Input
                          id="num_questions"
                          type="number"
                          min={1}
                          value={numQuestions}
                          onChange={(e) => setRules({ num_questions: Number(e.target.value) || 1 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Dificuldade (opcional)</Label>
                        <div className="flex flex-wrap gap-2">
                          {QUESTION_DIFFICULTIES.map((d) => (
                            <label key={d} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox
                                checked={difficultyFilter.includes(d)}
                                onCheckedChange={() => toggleDifficulty(d)}
                              />
                              <span className="text-sm">{d}</span>
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          O sorteio usa a disciplina e o nível já definidos no passo 1.
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="grid gap-4 grid-cols-1 xs:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="reward_participation">Por participação</Label>
                    <Input
                      id="reward_participation"
                      type="number"
                      min={0}
                      step={1}
                      value={formData.reward_participation ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        // permite vazio ou número inteiro não negativo
                        if (v === '' || /^[0-9]+$/.test(v)) {
                          update({ reward_participation: v });
                        }
                      }}
                      placeholder="Ex.: 25"
                      className="w-full min-w-0"
                    />
                    <p className="text-xs text-muted-foreground">
                      Quantidade de moedas que cada participante recebe (padrão: 25).
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reward_ranking">Por ranking</Label>
                    <Input
                      id="reward_ranking"
                      type="number"
                      min={0}
                      step={1}
                      value={formData.reward_ranking ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || /^[0-9]+$/.test(v)) {
                          update({ reward_ranking: v });
                        }
                      }}
                      placeholder="Ex.: 100"
                      className="w-full min-w-0"
                    />
                    <p className="text-xs text-muted-foreground">
                      Quantidade de moedas para o primeiro colocado (padrão: 100). Os demais podem ser
                      configurados depois no backend se necessário.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {errors.questions && (
          <p className="text-sm text-destructive mt-2 shrink-0">{errors.questions}</p>
        )}
        {!loadingEdit && (
          <div className="flex justify-between pt-4 mt-4 border-t shrink-0">
            <Button variant="outline" onClick={step > 1 ? () => setStep(step - 1) : onClose}>
              {step > 1 ? 'Voltar' : 'Cancelar'}
            </Button>
            <div className="flex gap-2">
              {step < 3 ? (
                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={!isStepValid(step)}
                  title={!isStepValid(step) ? 'Preencha todos os campos desta etapa para continuar' : undefined}
                >
                  Próximo
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEdit ? 'Salvar alterações' : 'Criar Competição'}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <Dialog open={showQuestionBank} onOpenChange={setShowQuestionBank}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Banco de Questões</DialogTitle>
            <DialogDescription>
              Selecione questões para adicionar à competição
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <QuestionBank
              embedded
              open={showQuestionBank}
              subjectId={formData.subject_id || null}
              onQuestionSelected={(question) => {
                if (selectedQuestions.some((q) => q.id === question.id)) {
                  toast({ title: 'Questão já adicionada', variant: 'destructive' });
                  return;
                }
                const withSubject = { ...question, subjectId: formData.subject_id || question.subjectId };
                setSelectedQuestions((prev) => [...prev, withSubject]);
                toast({ title: 'Questão adicionada' });
              }}
              onClose={() => setShowQuestionBank(false)}
            />
          </div>
        </DialogContent>
    </Dialog>

    <Dialog open={!!previewQuestion} onOpenChange={() => setPreviewQuestion(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Visualizar Questão</DialogTitle>
            <DialogDescription>Pré-visualização</DialogDescription>
          </DialogHeader>
          {previewQuestion && (
            <QuestionPreview
              question={previewQuestion}
              onClose={() => setPreviewQuestion(null)}
            />
          )}
        </DialogContent>
    </Dialog>
    </>
  );
}
