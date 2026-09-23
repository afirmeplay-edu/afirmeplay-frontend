import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  FileText,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { Question } from '@/types/forms';
import {
  resolveFormRecipients,
  formatScopeLabel,
  getFormTypeDisplayName,
  type ResolvedRecipients,
} from '@/services/formRecipientsApi';

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

const FormView = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [formData, setFormData] = useState<FormData | null>(null);
  const [resolvedRecipients, setResolvedRecipients] = useState<ResolvedRecipients | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolvingNames, setIsResolvingNames] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFormData = async () => {
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
    };

    loadFormData();
  }, [id, toast]);

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

  return (
    <div className="container mx-auto space-y-3 px-3 py-4 sm:space-y-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            <FileText className="h-6 w-6 shrink-0 text-primary" />
            {formTitle}
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Detalhes e pré-visualização do questionário
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={formData.isActive ? 'default' : 'secondary'} className="text-xs">
            {formData.isActive ? 'Ativo' : 'Inativo'}
          </Badge>
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
        <CardContent className="px-4 pb-4">
          <div className="space-y-2.5 text-xs">
            <div>
              <h4 className="mb-0.5 font-medium text-foreground">Nome</h4>
              <p className="text-muted-foreground">{formTitle}</p>
            </div>

            {formData.description && (
              <div>
                <h4 className="mb-0.5 font-medium text-foreground">Descrição</h4>
                <p className="text-muted-foreground">{formData.description}</p>
              </div>
            )}

            {formData.instructions && (
              <div>
                <h4 className="mb-0.5 font-medium text-foreground">Instruções</h4>
                <p className="whitespace-pre-wrap text-muted-foreground">{formData.instructions}</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 border-t pt-2 sm:grid-cols-3">
              <div>
                <h4 className="font-medium text-foreground">Tipo</h4>
                <p className="text-muted-foreground">{getFormTypeDisplayName(formData.formType)}</p>
              </div>
              <div>
                <h4 className="font-medium text-foreground">Total de Questões</h4>
                <p className="text-muted-foreground">
                  {formData.questions?.length ?? formData.totalQuestions ?? 0}
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground">Status</h4>
                <p className="text-muted-foreground">
                  {formData.isActive ? 'Ativo' : 'Inativo'}
                </p>
              </div>
            </div>

            {formData.deadline && (
              <div>
                <h4 className="mb-0.5 font-medium text-foreground">Prazo</h4>
                <p className="text-muted-foreground">
                  {new Date(formData.deadline).toLocaleString('pt-BR', {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  })}
                </p>
              </div>
            )}

            {recipientsTotal != null && (
              <div>
                <h4 className="mb-0.5 font-medium text-foreground">Respondidos</h4>
                <p className="text-muted-foreground">
                  {completedResponses} de {recipientsTotal} destinatário
                  {recipientsTotal !== 1 ? 's' : ''}
                  {formData.statistics?.completionRate != null && (
                    <span className="ml-1.5">
                      ({Math.round(formData.statistics.completionRate)}%)
                    </span>
                  )}
                </p>
              </div>
            )}
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
            <div className="space-y-1.5 text-xs">
              {(resolvedRecipients?.states?.length ?? 0) > 0 && (
                <div>
                  <span className="font-medium text-foreground">Estado: </span>
                  <span className="text-muted-foreground">
                    {formatScopeLabel(resolvedRecipients?.states ?? [], undefined, '—', 1)}
                  </span>
                </div>
              )}
              <div>
                <span className="font-medium text-foreground">Cidade: </span>
                <span className="text-muted-foreground">
                  {formData.cityName ||
                    formatScopeLabel(resolvedRecipients?.cities ?? [], undefined, '—', 1)}
                </span>
              </div>
              <div>
                <span className="font-medium text-foreground">Escolas: </span>
                <span className="text-muted-foreground">
                  {formatScopeLabel(
                    resolvedRecipients?.schools ?? [],
                    formData.selectedSchools,
                    '—',
                    3,
                  )}
                </span>
              </div>
              <div>
                <span className="font-medium text-foreground">Séries: </span>
                <span className="text-muted-foreground">
                  {formatScopeLabel(
                    resolvedRecipients?.grades ?? [],
                    formData.selectedGrades,
                    'Todas',
                    3,
                  )}
                </span>
              </div>
              <div>
                <span className="font-medium text-foreground">Turmas: </span>
                <span className="text-muted-foreground">
                  {formatScopeLabel(
                    resolvedRecipients?.classes ?? [],
                    formData.selectedClasses,
                    'Todas',
                    3,
                  )}
                </span>
              </div>
            </div>
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
    </div>
  );
};

export default FormView;
