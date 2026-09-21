import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowLeft, 
  FileText,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { Question } from '@/types/forms';
import { 
  resolveFormRecipients, 
  formatScopeLabel, 
  getFormTypeDisplayName,
  type ResolvedRecipients 
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
            includeStatistics: true
          }
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
      <div key={question.id || index} className="p-2.5 border rounded-md bg-muted/30">
        <div className="flex items-start gap-2">
          <span className="text-xs font-medium text-muted-foreground mt-0.5">
            {index + 1}.
          </span>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-foreground mb-1.5">
              {questionText}
            </h4>
            
            {questionType === 'selecao_unica' && options.length > 0 && (
              <div className="space-y-1">
                {options.map((option: string, optIndex: number) => (
                  <label key={optIndex} className="flex items-center gap-2 cursor-default p-1.5 rounded bg-background">
                    <span className="flex items-center justify-center w-5 h-5 bg-muted rounded-full text-[10px] font-medium text-muted-foreground">
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
                    <label className="flex items-center gap-2 cursor-default p-1.5 rounded bg-background">
                      <span className="flex items-center justify-center w-5 h-5 bg-muted rounded-full text-[10px] font-medium text-muted-foreground">
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
                    <p className="text-xs font-medium text-foreground mb-1">
                      {subQ.texto || subQ.text}
                    </p>
                    <div className="grid grid-cols-2 gap-1">
                      {options.map((option: string, optIndex: number) => (
                        <label key={optIndex} className="flex items-center gap-2 cursor-default p-1.5 rounded bg-background">
                          <span className="flex items-center justify-center w-5 h-5 bg-muted rounded-full text-[10px] font-medium text-muted-foreground">
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
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div className="bg-primary h-1.5 rounded-full" style={{ width: '50%' }}></div>
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{question.min || 0}</span>
                  <span>{question.max || 100}</span>
                </div>
              </div>
            )}

            {questionType === 'textarea' && (
              <textarea 
                className="w-full p-2 border rounded-md resize-none bg-background text-xs" 
                rows={2}
                placeholder="Digite sua resposta aqui..."
                disabled
              />
            )}

            {question.obrigatoria && (
              <Badge variant="destructive" className="mt-1.5 text-[10px] px-1.5 py-0">
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
      <ArrowLeft className="h-4 w-4 mr-2" />
      Voltar
    </Button>
  );

  if (isLoading) {
    return (
      <div className="container mx-auto px-3 py-4 sm:p-6 space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-7 w-56" />
          {backButton}
        </div>
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-28 mt-2" />
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
      <div className="container mx-auto px-3 py-4 sm:p-6 space-y-3 sm:space-y-4">
        <div className="flex justify-end">
          {backButton}
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <AlertCircle className="h-10 w-10 text-destructive mb-3" />
            <h3 className="text-base font-medium text-foreground mb-1">
              Erro ao carregar formulário
            </h3>
            <p className="text-xs text-muted-foreground text-center max-w-md">
              {error || 'Formulário não encontrado'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formTitle = formData.customTitle || formData.title || formData.name || formData.nome || 'Questionário';
  const recipientsTotal = formData.statistics?.totalRecipients ?? formData.recipientsCount;
  const completedResponses = formData.statistics?.completedResponses ?? 0;

  return (
    <div className="container mx-auto px-3 py-4 sm:p-6 space-y-3 sm:space-y-4">
      {/* Header — Voltar à direita */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex flex-wrap items-center gap-2">
            <FileText className="w-6 h-6 text-primary shrink-0" />
            Visualizar Questionário
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm">
            Detalhes e pré-visualização do questionário
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={formData.isActive ? "default" : "secondary"} className="text-xs">
            {formData.isActive ? 'Ativo' : 'Inativo'}
          </Badge>
          {backButton}
        </div>
      </div>

      {/* Form Info */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">Informações do Questionário</CardTitle>
          <CardDescription className="text-xs">
            Criado em {new Date(formData.createdAt).toLocaleDateString('pt-BR', { dateStyle: 'long' })}
            {formData.createdBy?.name && ` por ${formData.createdBy.name}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-2.5 text-xs">
            <div>
              <h4 className="font-medium text-foreground mb-0.5">Título</h4>
              <p className="text-muted-foreground">{formTitle}</p>
            </div>
            
            {formData.description && (
              <div>
                <h4 className="font-medium text-foreground mb-0.5">Descrição</h4>
                <p className="text-muted-foreground">{formData.description}</p>
              </div>
            )}

            {formData.instructions && (
              <div>
                <h4 className="font-medium text-foreground mb-0.5">Instruções</h4>
                <p className="text-muted-foreground whitespace-pre-wrap">{formData.instructions}</p>
              </div>
            )}
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t">
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
                <h4 className="font-medium text-foreground mb-0.5">Prazo</h4>
                <p className="text-muted-foreground">
                  {new Date(formData.deadline).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}
                </p>
              </div>
            )}

            {recipientsTotal != null && (
              <div>
                <h4 className="font-medium text-foreground mb-0.5">Respondidos</h4>
                <p className="text-muted-foreground">
                  {completedResponses} de {recipientsTotal} destinatário{recipientsTotal !== 1 ? 's' : ''}
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

      {/* Destinatários */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">Destinatários</CardTitle>
          <CardDescription className="text-xs">
            Público-alvo do questionário
          </CardDescription>
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
                  {formData.cityName
                    || formatScopeLabel(resolvedRecipients?.cities ?? [], undefined, '—', 1)}
                </span>
              </div>
              <div>
                <span className="font-medium text-foreground">Escolas: </span>
                <span className="text-muted-foreground">
                  {formatScopeLabel(resolvedRecipients?.schools ?? [], formData.selectedSchools, '—', 3)}
                </span>
              </div>
              <div>
                <span className="font-medium text-foreground">Séries: </span>
                <span className="text-muted-foreground">
                  {formatScopeLabel(resolvedRecipients?.grades ?? [], formData.selectedGrades, 'Todas', 3)}
                </span>
              </div>
              <div>
                <span className="font-medium text-foreground">Turmas: </span>
                <span className="text-muted-foreground">
                  {formatScopeLabel(resolvedRecipients?.classes ?? [], formData.selectedClasses, 'Todas', 3)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Questions Preview */}
      {formData.questions && formData.questions.length > 0 ? (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base">Pré-visualização das Questões</CardTitle>
            <CardDescription className="text-xs">
              {formData.questions.length} questão{formData.questions.length !== 1 ? 'ões' : ''} apresentada{formData.questions.length !== 1 ? 's' : ''} aos respondentes
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2.5">
              {formData.questions.map((question, index) => 
                renderQuestion(question, index)
              )}
            </div>
          </CardContent>
        </Card>
      ) : formData.totalQuestions ? (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base">Questões</CardTitle>
            <CardDescription className="text-xs">
              Este formulário possui {formData.totalQuestions} questão{formData.totalQuestions !== 1 ? 'ões' : ''} configurada{formData.totalQuestions !== 1 ? 's' : ''}
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
