import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CalendarDays, Clock, Loader2, Play, Users, CheckCircle, AlertCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { convertDateTimeLocalToISO } from "@/utils/date";
import { Evaluation, Subject, getEvaluationSubjects } from "@/types/evaluation-types";
import {
  isNotAvailableToMunicipalityError,
  municipalityAvailabilityErrorMessage,
  NOT_AVAILABLE_TO_MUNICIPALITY_MESSAGE,
} from "@/lib/municipalityAvailability";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "./results/constants";

// Schema de validação melhorado
const startEvaluationSchema = z.object({
  startDateTime: z.string().min(1, "Selecione a data e hora de início"),
  endDateTime: z.string().min(1, "Selecione a data e hora de término"),
}).superRefine((data, ctx) => {
  if (data.startDateTime && data.endDateTime) {
    const startDate = new Date(data.startDateTime);
    const endDate = new Date(data.endDateTime);
    const now = new Date();
    
    // Verificar se as datas são válidas
    if (isNaN(startDate.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Data de início inválida",
        path: ["startDateTime"],
      });
      return;
    }
    
    if (isNaN(endDate.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Data de término inválida",
        path: ["endDateTime"],
      });
      return;
    }
    
    // Início não pode ser no passado
    if (startDate < now) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A data de início não pode ser no passado",
        path: ["startDateTime"],
      });
    }
    
    // Término não pode ser no passado
    if (endDate < now) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A data de término não pode ser no passado",
        path: ["endDateTime"],
      });
    }
    
    // Fim deve ser posterior ao início
    if (endDate <= startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A data de término deve ser posterior à data de início",
        path: ["endDateTime"],
      });
    }
    
    // Verificar se há pelo menos 1 minuto de diferença
    const diffMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
    if (diffMinutes < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "O período deve ter pelo menos 1 minuto de duração",
        path: ["endDateTime"],
      });
    }
  }
});

type StartEvaluationFormValues = z.infer<typeof startEvaluationSchema>;

interface EvaluationClass {
  id: string;
  name: string;
  school_name: string;
  grade_name: string;
  students_count: number;
  status?: "applied" | "configured";
  current_application?: string;
  current_expiration?: string;
  class_test_id?: string;
}

interface StartEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (startDateTime: string, endDateTime: string, classIds: string[]) => Promise<void>;
  evaluation: Evaluation | null;
}

export default function StartEvaluationModal({
  isOpen,
  onClose,
  onConfirm,
  evaluation
}: StartEvaluationModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [evaluationClasses, setEvaluationClasses] = useState<EvaluationClass[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Refs para abrir o seletor nativo de data/hora via botão
  const startInputRef = useRef<HTMLInputElement | null>(null);
  const endInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<StartEvaluationFormValues>({
    resolver: zodResolver(startEvaluationSchema),
    defaultValues: {
      startDateTime: "",
      endDateTime: "",
    },
  });

  // Watch dos campos
  const startDateTime = form.watch("startDateTime");
  const endDateTime = form.watch("endDateTime");

  // Buscar turmas da avaliação quando abrir o modal
  useEffect(() => {
    if (isOpen && evaluation) {
      // Limpar formulário e estado
      form.reset({
        startDateTime: "",
        endDateTime: "",
      });
      setError(null);
      setEvaluationClasses([]);
      
      // Buscar turmas que receberão esta avaliação
      fetchEvaluationClasses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, evaluation]);

  const fetchEvaluationClasses = async () => {
    if (!evaluation) return;
    
    try {
      setIsLoadingClasses(true);
      // Verificar se temos os IDs das turmas selecionadas diretamente na avaliação
      // classes = classes que a avaliação pertence (selecionadas na criação)
      // applied_classes = classes que JÁ foram aplicadas (para permitir reaplicação)
      // Devemos incluir AMBAS para permitir aplicar e reaplicar
      let selectedClassIds: string[] = [];
      
      // 1. Coletar classes da avaliação (classes que a avaliação pertence)
      // FORMATO ATUAL: classes vem como array de objetos completos { id, name, students_count, school, grade }
      if (evaluation.classes && Array.isArray(evaluation.classes) && evaluation.classes.length > 0) {
        const firstItem = evaluation.classes[0];
        // Verificar se é array de objetos com propriedade id (formato atual)
        if (typeof firstItem === 'object' && firstItem !== null && 'id' in firstItem) {
          const classesIds = evaluation.classes.map((item: { id: string | number }) => String(item.id));
          selectedClassIds.push(...classesIds);
        } else {
          const classesIds = evaluation.classes.map(id => String(id));
          selectedClassIds.push(...classesIds);
        }
      }
      
      // 2. Coletar classes já aplicadas de verdade (ClassTest com application)
      // applied_classes sem application é fallback do backend (todas as turmas da escola)
      if (evaluation.applied_classes && Array.isArray(evaluation.applied_classes) && evaluation.applied_classes.length > 0) {
        const appliedClassIds = evaluation.applied_classes
          .filter((ac: { application?: string | null }) => Boolean(ac.application))
          .map((ac: { class?: { id?: string | number } }) => ac.class?.id)
          .filter((id: string | number | undefined): id is string | number => id !== undefined)
          .map((id: string | number) => String(id));
        selectedClassIds.push(...appliedClassIds);
      }
      selectedClassIds = [...new Set(selectedClassIds)];

      if (selectedClassIds.length === 0) {
        setEvaluationClasses([]);
        setError("Esta avaliação não tem turmas configuradas. Configure as turmas no processo de criação da avaliação primeiro.");
        return;
      }
      
      const response = await api.get(`/test/${evaluation.id}/classes`);

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        // Mapear dados do backend para o formato esperado pelo componente
        let mappedClasses = response.data.map((item: Record<string, unknown>) => ({
          id: (item.class as Record<string, unknown>).id as string,
          name: (item.class as Record<string, unknown>).name as string,
          school_name: ((item.class as Record<string, unknown>).school as Record<string, unknown>)?.name as string || "Escola não informada",
          grade_name: ((item.class as Record<string, unknown>).grade as Record<string, unknown>)?.name as string || "Série não informada",
          students_count: (item.students_count as number) || 0,
          // Dados adicionais para referência
          class_test_id: item.class_test_id as string,
          current_application: item.application as string,
          current_expiration: item.expiration as string,
          status: ((item.status as string) || "configured") as "applied" | "configured"  // "applied" ou "configured"
        }));
        
        // ✅ CORREÇÃO CRÍTICA: Filtrar APENAS as turmas selecionadas durante a criação da avaliação
        // O backend pode retornar todas as turmas da escola, mas devemos mostrar apenas as selecionadas
        // Usar comparação rigorosa de IDs convertendo ambos para string
        mappedClasses = mappedClasses.filter(cls => {
          const classId = String(cls.id);
          return selectedClassIds.includes(classId);
        });

        if (mappedClasses.length === 0) {
          setEvaluationClasses([]);
          setError("As turmas selecionadas para esta avaliação não foram encontradas. Verifique se as turmas ainda existem.");
          return;
        }
        
        setEvaluationClasses(mappedClasses);
        setError(null);
      } else {
        setEvaluationClasses([]);
        setError("Esta avaliação ainda não foi aplicada para nenhuma turma. Para aplicar, primeiro você precisa configurar as turmas no processo de criação da avaliação.");
      }
    } catch (error: unknown) {
      setEvaluationClasses([]);
      
      const errorResponse = error as { response?: { status?: number } };
      if (errorResponse.response?.status === 404) {
        setError("Esta avaliação ainda não foi aplicada para nenhuma turma. Para aplicar, primeiro você precisa configurar as turmas no processo de criação da avaliação.");
      } else if (errorResponse.response?.status === 403) {
        setError(
          isNotAvailableToMunicipalityError(error)
            ? municipalityAvailabilityErrorMessage(error, NOT_AVAILABLE_TO_MUNICIPALITY_MESSAGE)
            : "Você não tem permissão para visualizar as turmas desta avaliação."
        );
      } else if (errorResponse.response?.status === 401) {
        setError("Sua sessão expirou. Faça login novamente.");
      } else {
        setError("Erro ao carregar turmas. Verifique sua conexão e tente novamente.");
      }
    } finally {
      setIsLoadingClasses(false);
    }
  };

  // Função para calcular a duração total do período
  const calculateTotalPeriod = () => {
    if (!startDateTime || !endDateTime) return null;
    
    const start = new Date(startDateTime);
    const end = new Date(endDateTime);
    
    if (end <= start) return null;
    
    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffDays > 0) {
      return `${diffDays} dia${diffDays > 1 ? 's' : ''} e ${diffHours}h${diffMinutes}min`;
    } else if (diffHours > 0) {
      return `${diffHours}h${diffMinutes}min`;
    } else {
      return `${diffMinutes} minutos`;
    }
  };

  const handleSubmit = async (values: StartEvaluationFormValues) => {
    if (evaluationClasses.length === 0) {
      toast({
        title: "Erro",
        description: ERROR_MESSAGES.EVALUATION_NOT_AVAILABLE,
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      
      // ✅ CORREÇÃO: Converter datetime-local para ISO com timezone antes de enviar
      const startDateTimeISO = convertDateTimeLocalToISO(values.startDateTime);
      const endDateTimeISO = convertDateTimeLocalToISO(values.endDateTime);

      // Aplicar para todas as turmas configuradas
      const classIds = evaluationClasses.map(c => c.id);
      await onConfirm(startDateTimeISO, endDateTimeISO, classIds);
      
      toast({
        title: SUCCESS_MESSAGES.EVALUATION_APPLIED,
        description: `A avaliação "${evaluation?.title}" foi aplicada para ${evaluationClasses.length} turma(s) e ficará disponível no horário configurado.`,
      });
      
      form.reset();
      onClose();
    } catch (error: unknown) {
      const apiError = error as {
        message?: string;
        response?: {
          status?: number;
          data?: { error?: string; classes_nao_vinculadas?: string[] };
        };
      };

      const backendMsg = apiError.response?.data?.error;
      const classesNaoVinculadas = apiError.response?.data?.classes_nao_vinculadas ?? [];
      const description =
        backendMsg && classesNaoVinculadas.length > 0
          ? `${backendMsg}. Turmas: ${classesNaoVinculadas.join(", ")}`
          : backendMsg || apiError.message || ERROR_MESSAGES.EVALUATION_APPLY_FAILED;

      toast({
        title: ERROR_MESSAGES.EVALUATION_APPLY_FAILED,
        description,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    form.reset();
    setError(null);
    setEvaluationClasses([]);
    onClose();
  };

  const getTotalStudents = () => {
    return evaluationClasses.reduce((total, cls) => total + cls.students_count, 0);
  };

  if (!evaluation) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-green-600 dark:text-green-400" />
            Aplicar Avaliação
          </DialogTitle>
          <DialogDescription>
            Configure quando a avaliação "{evaluation.title}" ficará disponível para os alunos
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Informações da Avaliação */}
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-3 flex items-center gap-2">
                <Info className="h-4 w-4" />
                Informações da Avaliação
              </h4>
              <div className="space-y-2 text-sm text-blue-700 dark:text-blue-400">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-medium">Disciplina(s):</span>
                    <p className="mt-1">{
                      (() => {
                        const subjects = getEvaluationSubjects(evaluation);
                        return subjects.length > 0 
                          ? subjects.map(s => s.name).join(", ")
                          : "Não informado";
                      })()
                    }</p>
                  </div>
                  <div>
                    <span className="font-medium">Série:</span>
                    <p className="mt-1">{evaluation.grade?.name || "Não informada"}</p>
                  </div>
                  <div>
                    <span className="font-medium">Questões:</span>
                    <p className="mt-1">
                      {typeof evaluation.total_questions === 'number'
                        ? evaluation.total_questions
                        : (Array.isArray(evaluation.questions) ? evaluation.questions.length : 0)}
                    </p>
                  </div>
                  <div>
                    <span className="font-medium">Duração:</span>
                    <p className="mt-1">{evaluation.duration ?? evaluation.duration_minutes ?? 60} minutos</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Informações das Turmas */}
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-green-800 dark:text-green-300 mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Turmas para aplicação
              </h4>
              
              {isLoadingClasses ? (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando turmas...
                </div>
              ) : error ? (
                <Alert variant="destructive" className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : evaluationClasses.length > 0 ? (
                <div className="space-y-3">
                  {/* Verificar se há turmas já aplicadas */}
                  {evaluationClasses.some(cls => cls.status === "applied") && (
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded p-3">
                      <p className="text-xs text-blue-800 dark:text-blue-300 mb-2">
                        ⚠️ Esta avaliação já foi aplicada anteriormente. Você pode reaplicar com novos horários.
                      </p>
                      <div className="flex items-center gap-4 text-sm text-blue-700 dark:text-blue-400">
                        <Badge variant="outline" className="bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300">
                          Reaplicação
                        </Badge>
                      </div>
                    </div>
                  )}
                  
                  {/* Verificar se há turmas apenas configuradas */}
                  {evaluationClasses.some(cls => cls.status === "configured") && (
                    <div className="bg-green-100 dark:bg-green-950/50 border border-green-300 dark:border-green-700 rounded p-3">
                      <p className="text-xs text-green-800 dark:text-green-300 mb-2">
                        ✅ Turmas configuradas durante a criação da avaliação. Primeira aplicação.
                      </p>
                      <div className="flex items-center gap-4 text-sm text-green-700 dark:text-green-400">
                        <Badge variant="outline" className="bg-green-200 dark:bg-green-950/50 text-green-800 dark:text-green-300">
                          Primeira aplicação
                        </Badge>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-4 text-sm text-gray-700 dark:text-gray-300 mb-3">
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-950/50 text-gray-800 dark:text-gray-300">
                      {evaluationClasses.length} turma{evaluationClasses.length > 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-950/50 text-gray-800 dark:text-gray-300">
                      {evaluationClasses.reduce((total, cls) => total + cls.students_count, 0)} alunos
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                    {evaluationClasses.map((cls) => (
                      <div key={cls.id} className="bg-white dark:bg-card border border-green-200 dark:border-green-800 rounded p-2">
                        <div className="text-sm font-medium text-green-800 dark:text-green-300 flex items-center gap-2">
                          {cls.name}
                          {cls.status === "applied" && (
                            <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                              Aplicada
                            </Badge>
                          )}
                          {cls.status === "configured" && (
                            <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950/50 text-green-600 dark:text-green-400">
                              Nova
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-400">
                          {cls.school_name} • {cls.grade_name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {cls.students_count} aluno{cls.students_count !== 1 ? 's' : ''}
                        </div>
                        {cls.current_application && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Aplicação anterior: {new Date(cls.current_application).toLocaleDateString('pt-BR')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <Alert className="bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Esta avaliação ainda não foi aplicada para nenhuma turma. Configure as turmas no processo de criação da avaliação primeiro.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Campos de Data */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDateTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4" />
                          Data e Hora de Início *
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            const el = startInputRef.current;
                            // Tentar abrir o seletor nativo; se não existir, apenas focar
                            // @ts-expect-error showPicker pode não existir em todos os navegadores
                            if (el?.showPicker) el.showPicker();
                            else el?.focus();
                          }}
                        >
                          Selecionar
                        </Button>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          {...field}
                          ref={(el) => {
                            field.ref(el);
                            startInputRef.current = el;
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        Quando a avaliação ficará disponível para os alunos
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDateTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Data e Hora de Término *
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            const el = endInputRef.current;
                            // @ts-expect-error showPicker pode não existir em todos os navegadores
                            if (el?.showPicker) el.showPicker();
                            else el?.focus();
                          }}
                        >
                          Selecionar
                        </Button>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          {...field}
                          ref={(el) => {
                            field.ref(el);
                            endInputRef.current = el;
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        Quando a avaliação será encerrada automaticamente
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Resumo do Período */}
              {calculateTotalPeriod() && (
                <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm font-medium text-purple-800 dark:text-purple-300">
                      Período de disponibilidade: {calculateTotalPeriod()}
                    </span>
                  </div>
                  <div className="text-xs text-purple-600 dark:text-purple-400 space-y-1">
                    <p>• <strong>Timezone:</strong> {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
                    <p>• A avaliação ficará disponível na agenda dos alunos</p>
                    <p>• Status será "Agendada" até o horário de início</p>
                    <p>• Alunos poderão clicar em "Iniciar Avaliação" apenas no período configurado</p>
                    <p>• Após finalizar, o botão mudará para "Concluída"</p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !calculateTotalPeriod() || evaluationClasses.length === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Aplicando...
                  </>
                ) : evaluationClasses.length === 0 ? (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Configurar turmas primeiro
                  </>
                ) : evaluationClasses.some(cls => cls.status === "applied") ? (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Reaplicar para {evaluationClasses.length} turma{evaluationClasses.length > 1 ? 's' : ''}
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Aplicar para {evaluationClasses.length} turma{evaluationClasses.length > 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 