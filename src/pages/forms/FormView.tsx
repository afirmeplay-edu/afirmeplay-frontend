import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft,
  FileText,
  Loader2,
  AlertCircle,
  Trash2,
  Send,
  Pencil,
  Info,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { Question } from '@/types/forms';
import {
  resolveFormRecipients,
  formatScopeLabel,
  getFormTypeDisplayName,
  getSchoolInfo,
  type ResolvedRecipients,
} from '@/services/formRecipientsApi';
import { FormFiltersApiService } from '@/services/formFiltersApi';
import { FormMultiSelect } from '@/components/ui/form-multi-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FormData {
  id: string;
  title?: string;
  customTitle?: string;
  name?: string;
  nome?: string;
  description?: string;
  instructions?: string;
  formType: string;
  isActive: boolean;
  deadline?: string;
  createdAt: string;
  createdBy?: { name?: string };
  selectedSchools?: string[];
  selectedGrades?: string[];
  selectedClasses?: string[];
  cityId?: string;
  cityName?: string;
  questions?: Question[];
  totalQuestions?: number;
  statistics?: {
    totalRecipients?: number;
    completedResponses?: number;
    completionRate?: number;
  };
  recipientsCount?: number;
}

type DetailRow = { label: string; value: React.ReactNode };

const DetailList = ({ rows }: { rows: DetailRow[] }) => (
  <div className="divide-y divide-border rounded-lg border border-border bg-background">
    {rows.map(({ label, value }) => (
      <div
        key={label}
        className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3"
      >
        <span className="w-36 shrink-0 text-sm text-muted-foreground">{label}</span>
        <span className="min-w-0 flex-1 text-sm text-foreground whitespace-pre-wrap">
          {value ?? '—'}
        </span>
      </div>
    ))}
  </div>
);

const toDatetimeLocalValue = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const FormView = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [formData, setFormData] = useState<FormData | null>(null);
  const [resolvedRecipients, setResolvedRecipients] = useState<ResolvedRecipients | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolvingNames, setIsResolvingNames] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);

  const [showResendDialog, setShowResendDialog] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [resendState, setResendState] = useState('all');
  const [resendMunicipality, setResendMunicipality] = useState('all');
  const [resendSchools, setResendSchools] = useState<string[]>([]);
  const [resendGrades, setResendGrades] = useState<string[]>([]);
  const [resendClasses, setResendClasses] = useState<string[]>([]);
  const [filterStates, setFilterStates] = useState<Array<{ id: string; name: string }>>([]);
  const [filterMunicipalities, setFilterMunicipalities] = useState<Array<{ id: string; name: string }>>([]);
  const [filterSchools, setFilterSchools] = useState<Array<{ id: string; name: string }>>([]);
  const [filterGrades, setFilterGrades] = useState<Array<{ id: string; name: string }>>([]);
  const [filterClasses, setFilterClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingResendFilters, setIsLoadingResendFilters] = useState(false);

  const loadFormData = useCallback(async () => {
    if (!id) {
      setError('ID do formulário não fornecido');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await api.get(`/forms/${id}`, {
        params: {
          includeQuestions: true,
          includeStatistics: true,
        },
      });

      const data = response.data?.data ?? response.data;
      setFormData(data);

      if (data.selectedSchools || data.selectedGrades || data.selectedClasses || data.cityName) {
        setIsResolvingNames(true);
        try {
          const resolved = await resolveFormRecipients(data);
          setResolvedRecipients(resolved);
        } catch (err) {
          console.error('Erro ao resolver destinatários:', err);
        } finally {
          setIsResolvingNames(false);
        }
      } else {
        setResolvedRecipients(null);
      }
    } catch (err: any) {
      console.error('Erro ao carregar formulário:', err);
      const message = err.response?.data?.error || err.message || 'Não foi possível carregar o formulário';
      setError(message);
      toast({
        title: 'Erro ao carregar',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    loadFormData();
  }, [loadFormData]);

  const openEditDialog = () => {
    if (!formData) return;
    setEditTitle(formData.customTitle || formData.title || formData.name || formData.nome || '');
    setEditDescription(formData.description || '');
    setEditInstructions(formData.instructions || '');
    setEditDeadline(toDatetimeLocalValue(formData.deadline));
    setEditIsActive(formData.isActive);
    setShowEditDialog(true);
  };

  const handleSaveMetadata = async () => {
    if (!id || !formData) return;
    if (!editTitle.trim()) {
      toast({
        title: 'Validação',
        description: 'O nome do questionário é obrigatório.',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingMeta(true);
    try {
      const payload: Record<string, unknown> = {
        metadataOnly: true,
        customTitle: editTitle.trim(),
        description: editDescription.trim() || null,
        instructions: editInstructions.trim() || null,
        isActive: editIsActive,
      };
      if (editDeadline.trim()) {
        payload.deadline = new Date(editDeadline).toISOString();
      } else {
        payload.deadline = null;
      }

      await api.put(`/forms/${id}`, payload);
      toast({
        title: 'Metadados atualizados',
        description: 'As informações do questionário foram salvas.',
      });
      setShowEditDialog(false);
      await loadFormData();
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err.response?.data?.error || err.message || 'Não foi possível salvar.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await api.delete(`/forms/${id}`);
      toast({
        title: 'Questionário excluído',
        description: 'O questionário e os dados associados foram removidos.',
      });
      navigate('/app/questionarios/cadastro');
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir',
        description: err.response?.data?.error || err.message || 'Não foi possível excluir.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteAlert(false);
    }
  };

  const openResendDialog = async () => {
    if (!formData) return;
    setShowResendDialog(true);
    setResendClasses([]);
    setIsLoadingResendFilters(true);

    try {
      const statesData = await FormFiltersApiService.getFormFilterStates();
      setFilterStates(
        (statesData || []).map((s: { id: string; nome: string }) => ({
          id: s.id,
          name: s.nome,
        })),
      );

      const existingSchools = formData.selectedSchools || [];
      setResendSchools(existingSchools);
      setResendGrades(formData.selectedGrades || []);

      if (existingSchools.length > 0) {
        const info = await getSchoolInfo(existingSchools[0], formData.cityId);
        if (info.stateUf) {
          setResendState(info.stateUf);
          const municipalitiesData = await FormFiltersApiService.getFormFilterMunicipalities(
            info.stateUf,
          );
          setFilterMunicipalities(
            (municipalitiesData || []).map((m: { id: string; nome: string }) => ({
              id: m.id,
              name: m.nome,
            })),
          );
        }
        // Infer municipality from school city when possible
        const schoolDetail = await api.get(`/school/${existingSchools[0]}`).catch(() => null);
        const cityId = schoolDetail?.data?.city?.id || schoolDetail?.data?.city_id;
        if (cityId) {
          setResendMunicipality(cityId);
          const schoolsData = await FormFiltersApiService.getFormFilterSchools({
            estado: info.stateUf,
            municipio: cityId,
          });
          setFilterSchools(
            (schoolsData || []).map((s: { id: string; nome: string }) => ({
              id: s.id,
              name: s.nome,
            })),
          );
        }
      }
    } catch (err) {
      console.error('Erro ao carregar filtros de reenvio:', err);
      toast({
        title: 'Erro ao carregar filtros',
        description: 'Não foi possível carregar escolas/séries para reenvio.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingResendFilters(false);
    }
  };

  useEffect(() => {
    if (!showResendDialog || resendState === 'all') return;
    let cancelled = false;
    (async () => {
      try {
        const municipalitiesData = await FormFiltersApiService.getFormFilterMunicipalities(
          resendState,
        );
        if (cancelled) return;
        setFilterMunicipalities(
          (municipalitiesData || []).map((m: { id: string; nome: string }) => ({
            id: m.id,
            name: m.nome,
          })),
        );
      } catch {
        if (!cancelled) setFilterMunicipalities([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showResendDialog, resendState]);

  useEffect(() => {
    if (!showResendDialog || resendState === 'all' || resendMunicipality === 'all') return;
    let cancelled = false;
    (async () => {
      try {
        const schoolsData = await FormFiltersApiService.getFormFilterSchools({
          estado: resendState,
          municipio: resendMunicipality,
        });
        if (cancelled) return;
        setFilterSchools(
          (schoolsData || []).map((s: { id: string; nome: string }) => ({
            id: s.id,
            name: s.nome,
          })),
        );
      } catch {
        if (!cancelled) setFilterSchools([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showResendDialog, resendState, resendMunicipality]);

  useEffect(() => {
    if (!showResendDialog || resendSchools.length === 0) {
      setFilterGrades([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const all = new Map<string, { id: string; name: string }>();
        for (const schoolId of resendSchools) {
          const gradesData = await FormFiltersApiService.getFormFilterGrades({
            estado: resendState !== 'all' ? resendState : undefined,
            municipio: resendMunicipality !== 'all' ? resendMunicipality : undefined,
            escola: schoolId,
          } as any);
          (gradesData || []).forEach((g: { id: string; nome: string }) => {
            if (!all.has(g.id)) all.set(g.id, { id: g.id, name: g.nome });
          });
        }
        if (!cancelled) setFilterGrades(Array.from(all.values()).sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        if (!cancelled) setFilterGrades([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showResendDialog, resendSchools, resendState, resendMunicipality]);

  useEffect(() => {
    if (!showResendDialog || resendSchools.length === 0 || resendGrades.length === 0) {
      setFilterClasses([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const all = new Map<string, { id: string; name: string }>();
        for (const schoolId of resendSchools) {
          for (const gradeId of resendGrades) {
            const classesData = await FormFiltersApiService.getFormFilterClasses({
              estado: resendState !== 'all' ? resendState : undefined,
              municipio: resendMunicipality !== 'all' ? resendMunicipality : undefined,
              escola: schoolId,
              serie: gradeId,
            } as any);
            (classesData || []).forEach((c: { id: string; nome: string }) => {
              if (!all.has(c.id)) all.set(c.id, { id: c.id, name: c.nome });
            });
          }
        }
        if (!cancelled) {
          setFilterClasses(Array.from(all.values()).sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch {
        if (!cancelled) setFilterClasses([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showResendDialog, resendSchools, resendGrades, resendState, resendMunicipality]);

  const handleConfirmResend = async () => {
    if (!id) return;
    if (resendSchools.length === 0) {
      toast({
        title: 'Seleção obrigatória',
        description: 'Selecione pelo menos uma escola.',
        variant: 'destructive',
      });
      return;
    }
    if (resendClasses.length === 0) {
      toast({
        title: 'Seleção obrigatória',
        description: 'Selecione pelo menos uma turma para reenviar.',
        variant: 'destructive',
      });
      return;
    }

    setIsApplying(true);
    try {
      const payload: Record<string, unknown> = {
        selectedSchools: resendSchools,
        selectedClasses: resendClasses,
        notifyUsers: true,
        isActive: true,
      };
      if (resendGrades.length > 0) payload.selectedGrades = resendGrades;

      const { data } = await api.post(`/forms/${id}/apply`, payload);
      const newRecipients = data?.apply?.newRecipients ?? 0;
      toast({
        title: 'Questionário reenviado',
        description:
          newRecipients > 0
            ? `${newRecipients} novo(s) destinatário(s) incluído(s). O mesmo questionário foi mantido.`
            : data?.message || 'Escopo atualizado. Nenhum destinatário novo.',
      });
      setShowResendDialog(false);
      await loadFormData();
    } catch (err: any) {
      toast({
        title: 'Erro ao reenviar',
        description: err.response?.data?.error || err.message || 'Não foi possível reenviar.',
        variant: 'destructive',
      });
    } finally {
      setIsApplying(false);
    }
  };

  const renderQuestion = (question: Question, index: number) => {
    const questionText = question.texto || question.text || '';
    const questionType = question.tipo || question.type || '';
    const options = question.opcoes || question.options || [];
    const subQuestions = question.subPerguntas || question.subQuestions || [];

    return (
      <div key={question.id || index} className="rounded-md border bg-muted/30 p-2.5">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-xs font-medium text-muted-foreground">
            {index + 1}.
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="mb-1.5 text-sm font-medium text-foreground">
              {questionText}
            </h4>

            {questionType === 'selecao_unica' && options.length > 0 && (
              <div className="space-y-1">
                {options.map((option: string, optIndex: number) => (
                  <label key={optIndex} className="flex cursor-default items-center gap-2 rounded bg-background p-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                      {String.fromCharCode(65 + optIndex)}
                    </span>
                    <span className="text-xs text-foreground">{option}</span>
                  </label>
                ))}
              </div>
            )}

            {questionType === 'multipla_escolha' && subQuestions.length > 0 && (
              <div className="space-y-1">
                {subQuestions.map((subQ: any, subIndex: number) => (
                  <div key={subQ.id || subIndex} className="ml-2">
                    <label className="flex cursor-default items-center gap-2 rounded bg-background p-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                        {String.fromCharCode(65 + subIndex)}
                      </span>
                      <span className="text-xs text-foreground">{subQ.texto || subQ.text}</span>
                    </label>
                  </div>
                ))}
              </div>
            )}

            {questionType === 'matriz_selecao' && subQuestions.length > 0 && (
              <div className="space-y-2">
                {subQuestions.map((subQ: any, subIndex: number) => (
                  <div key={subQ.id || subIndex} className="ml-2">
                    <p className="mb-1 text-xs font-medium text-foreground">
                      {subQ.texto || subQ.text}
                    </p>
                    <div className="grid grid-cols-2 gap-1">
                      {options.map((option: string, optIndex: number) => (
                        <label key={optIndex} className="flex cursor-default items-center gap-2 rounded bg-background p-1.5">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                            {String.fromCharCode(65 + optIndex)}
                          </span>
                          <span className="text-xs text-muted-foreground">{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {questionType === 'slider' && (
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: '50%' }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{question.min || 0}</span>
                  <span>{question.max || 100}</span>
                </div>
              </div>
            )}

            {questionType === 'textarea' && (
              <textarea
                className="w-full resize-none rounded-md border bg-background p-2 text-xs"
                rows={2}
                placeholder="Digite sua resposta aqui..."
                disabled
              />
            )}

            {question.obrigatoria && (
              <Badge variant="destructive" className="mt-1.5 px-1.5 py-0 text-[10px]">
                Obrigatória
              </Badge>
            )}
          </div>
        </div>
      </div>
    );
  };

  const backButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => navigate('/app/questionarios/cadastro')}
    >
      <ArrowLeft className="mr-2 h-4 w-4" />
      Voltar
    </Button>
  );

  if (isLoading) {
    return (
      <div className="container mx-auto space-y-3 px-3 py-4 sm:space-y-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-7 w-56" />
          {backButton}
        </div>
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-3 w-28" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !formData) {
    return (
      <div className="container mx-auto space-y-3 px-3 py-4 sm:space-y-4 sm:p-6">
        <div className="flex justify-end">{backButton}</div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <AlertCircle className="mb-3 h-10 w-10 text-destructive" />
            <h3 className="mb-1 text-base font-medium text-foreground">
              Erro ao carregar formulário
            </h3>
            <p className="max-w-md text-center text-xs text-muted-foreground">
              {error || 'Formulário não encontrado'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formTitle =
    formData.customTitle || formData.title || formData.name || formData.nome || 'Questionário';
  const recipientsTotal = formData.statistics?.totalRecipients ?? formData.recipientsCount;
  const completedResponses = formData.statistics?.completedResponses ?? 0;

  const infoRows: DetailRow[] = [
    { label: 'Nome', value: formTitle },
    ...(formData.description
      ? [{ label: 'Descrição', value: formData.description }]
      : []),
    ...(formData.instructions
      ? [{ label: 'Instruções', value: formData.instructions }]
      : []),
    { label: 'Tipo', value: getFormTypeDisplayName(formData.formType) },
    {
      label: 'Total de Questões',
      value: String(formData.questions?.length ?? formData.totalQuestions ?? 0),
    },
    {
      label: 'Status',
      value: formData.isActive ? 'Ativo' : 'Inativo',
    },
    ...(formData.deadline
      ? [{
          label: 'Prazo',
          value: new Date(formData.deadline).toLocaleString('pt-BR', {
            dateStyle: 'long',
            timeStyle: 'short',
          }),
        }]
      : []),
    ...(recipientsTotal != null
      ? [{
          label: 'Respondidos',
          value: (
            <>
              {completedResponses} de {recipientsTotal} destinatário
              {recipientsTotal !== 1 ? 's' : ''}
              {formData.statistics?.completionRate != null && (
                <span className="ml-1.5">
                  ({Math.round(formData.statistics.completionRate)}%)
                </span>
              )}
            </>
          ),
        }]
      : []),
  ];

  const recipientRows: DetailRow[] = [
    ...((resolvedRecipients?.states?.length ?? 0) > 0
      ? [{
          label: 'Estado',
          value: formatScopeLabel(resolvedRecipients?.states ?? [], undefined, '—', 1),
        }]
      : []),
    {
      label: 'Cidade',
      value:
        formData.cityName ||
        formatScopeLabel(resolvedRecipients?.cities ?? [], undefined, '—', 1),
    },
    {
      label: 'Escolas',
      value: formatScopeLabel(
        resolvedRecipients?.schools ?? [],
        formData.selectedSchools,
        '—',
        3,
      ),
    },
    {
      label: 'Séries',
      value: formatScopeLabel(
        resolvedRecipients?.grades ?? [],
        formData.selectedGrades,
        'Todas',
        3,
      ),
    },
    {
      label: 'Turmas',
      value: formatScopeLabel(
        resolvedRecipients?.classes ?? [],
        formData.selectedClasses,
        'Todas',
        3,
      ),
    },
  ];

  return (
    <div className="container mx-auto space-y-3 px-3 py-4 sm:space-y-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            <FileText className="h-6 w-6 shrink-0 text-primary" />
            {formTitle}
            <Badge
              variant={formData.isActive ? 'default' : 'secondary'}
              className="align-middle text-xs font-medium"
            >
              {formData.isActive ? 'Ativo' : 'Inativo'}
            </Badge>
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Detalhes e pré-visualização do questionário
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setShowDeleteAlert(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Excluir
          </Button>
          <Button variant="outline" size="sm" onClick={openResendDialog}>
            <Send className="mr-1.5 h-4 w-4" />
            Reenviar
          </Button>
          <Button variant="outline" size="sm" onClick={openEditDialog}>
            <Pencil className="mr-1.5 h-4 w-4" />
            Editar
          </Button>
          {backButton}
        </div>
      </div>

      <Card>
        <CardHeader className="px-4 pb-2 pt-4">
          <CardTitle className="text-base">Informações do Questionário</CardTitle>
          <CardDescription className="text-xs">
            Criado em {new Date(formData.createdAt).toLocaleDateString('pt-BR', { dateStyle: 'long' })}
            {formData.createdBy?.name && ` por ${formData.createdBy.name}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <DetailList rows={infoRows} />
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Apenas metadados podem ser editados neste questionário. Para alterar as perguntas,
              use <strong>Reutilizar</strong> na listagem e crie um novo questionário.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-4 pb-2 pt-4">
          <CardTitle className="text-base">Destinatários</CardTitle>
          <CardDescription className="text-xs">Público-alvo do questionário</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isResolvingNames ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ) : (
            <DetailList rows={recipientRows} />
          )}
        </CardContent>
      </Card>

      {formData.questions && formData.questions.length > 0 ? (
        <Card>
          <CardHeader className="px-4 pb-2 pt-4">
            <CardTitle className="text-base">Pré-visualização das Questões</CardTitle>
            <CardDescription className="text-xs">
              {formData.questions.length} questão
              {formData.questions.length !== 1 ? 'ões' : ''} apresentada
              {formData.questions.length !== 1 ? 's' : ''} aos respondentes
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2.5">
              {formData.questions.map((question, index) => renderQuestion(question, index))}
            </div>
          </CardContent>
        </Card>
      ) : formData.totalQuestions ? (
        <Card>
          <CardHeader className="px-4 pb-2 pt-4">
            <CardTitle className="text-base">Questões</CardTitle>
            <CardDescription className="text-xs">
              Este formulário possui {formData.totalQuestions} questão
              {formData.totalQuestions !== 1 ? 'ões' : ''} configurada
              {formData.totalQuestions !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5" />
              <span>As perguntas não foram carregadas com os detalhes</span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Excluir */}
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir questionário</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente excluir este questionário? Esta ação remove também os
              destinatários e as respostas vinculadas e não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Editar metadados */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar metadados</DialogTitle>
            <DialogDescription>
              Altere apenas nome, descrição, instruções, prazo e status. Para mudar perguntas,
              use Reutilizar na listagem.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Nome *</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Input
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-instructions">Instruções</Label>
              <Textarea
                id="edit-instructions"
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-deadline">Prazo</Label>
              <Input
                id="edit-deadline"
                type="datetime-local"
                value={editDeadline}
                onChange={(e) => setEditDeadline(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={editIsActive}
                onCheckedChange={(v) => setEditIsActive(v === true)}
              />
              Questionário ativo
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={isSavingMeta}>
              Cancelar
            </Button>
            <Button onClick={handleSaveMetadata} disabled={isSavingMeta}>
              {isSavingMeta ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reenviar */}
      <Dialog open={showResendDialog} onOpenChange={setShowResendDialog}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reenviar questionário</DialogTitle>
            <DialogDescription>
              O mesmo questionário será aplicado às turmas selecionadas. Destinatários e
              respostas já existentes serão preservados. As perguntas não podem ser alteradas.
            </DialogDescription>
          </DialogHeader>

          {isLoadingResendFilters ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando filtros...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={resendState}
                  onValueChange={(v) => {
                    setResendState(v);
                    setResendMunicipality('all');
                    setFilterSchools([]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {filterStates.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Município</Label>
                <Select
                  value={resendMunicipality}
                  onValueChange={setResendMunicipality}
                  disabled={resendState === 'all'}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {filterMunicipalities.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Escola(s) *</Label>
                <FormMultiSelect
                  options={filterSchools}
                  selected={resendSchools}
                  onChange={setResendSchools}
                  placeholder="Selecione escolas"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Série(s)</Label>
                <FormMultiSelect
                  options={filterGrades}
                  selected={resendGrades}
                  onChange={setResendGrades}
                  placeholder="Selecione séries"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Turma(s) *</Label>
                <FormMultiSelect
                  options={filterClasses}
                  selected={resendClasses}
                  onChange={setResendClasses}
                  placeholder="Selecione turmas"
                />
                <p className="text-xs text-muted-foreground">
                  O mesmo questionário será aplicado a todas as turmas selecionadas.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResendDialog(false)} disabled={isApplying}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmResend} disabled={isApplying || isLoadingResendFilters}>
              {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Confirmar reenvio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FormView;
