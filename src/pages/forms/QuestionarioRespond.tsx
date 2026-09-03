import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { 
  ArrowLeft, 
  ArrowRight,
  CheckCircle, 
  AlertCircle,
  Loader2,
  FileText,
  Send,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';
import { Question, SubQuestion } from '@/types/forms';

type FormResponseValue = string | number | boolean | null | undefined | FormResponses;
type FormResponses = Record<string, FormResponseValue>;

const OTHER_OPTION = 'Outro';
const OTHER_RESPONSE_PREFIX = `${OTHER_OPTION}: `;

const isOtherResponse = (value: FormResponseValue): value is string =>
  typeof value === 'string' && (value === OTHER_OPTION || value.startsWith(OTHER_RESPONSE_PREFIX));

const getOtherResponseText = (value: FormResponseValue): string =>
  isOtherResponse(value) && value.startsWith(OTHER_RESPONSE_PREFIX)
    ? value.slice(OTHER_RESPONSE_PREFIX.length)
    : '';

interface QuestionarioData {
  formId: string;
  title: string;
  description: string;
  instructions?: string;
  deadline: string;
  questions: Question[];
  currentResponse?: {
    id: string;
    status: string;
    startedAt: string;
    responses: FormResponses;
    progress?: number;
  };
  progress?: number; // Progresso calculado pelo backend
}

const getApiErrorMessage = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return undefined;
  }

  const response = (error as { response?: { data?: { message?: string; error?: string } } }).response;
  return response?.data?.message || response?.data?.error;
};

const QuestionarioRespond = () => {
  const navigate = useNavigate();
  const { formId } = useParams<{ formId: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [questionario, setQuestionario] = useState<QuestionarioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [responses, setResponses] = useState<FormResponses>({});
  const [sliderValues, setSliderValues] = useState<Record<string, number>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isAutoAdvanceEnabled, setIsAutoAdvanceEnabled] = useState(true);
  const [isQuestionNavCollapsed, setIsQuestionNavCollapsed] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoAdvanceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const responsesInitializedRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const saved = window.localStorage.getItem('questionario-respond:auto-advance-enabled');
    if (saved != null) {
      setIsAutoAdvanceEnabled(saved === 'true');
    }

    const savedNavCollapsed = window.localStorage.getItem('questionario-respond:question-nav-collapsed');
    if (savedNavCollapsed != null) {
      setIsQuestionNavCollapsed(savedNavCollapsed === 'true');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem(
      'questionario-respond:auto-advance-enabled',
      String(isAutoAdvanceEnabled)
    );

    if (!isAutoAdvanceEnabled && autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
  }, [isAutoAdvanceEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      'questionario-respond:question-nav-collapsed',
      String(isQuestionNavCollapsed)
    );
  }, [isQuestionNavCollapsed]);

  // Função para obter questões visíveis (considerando dependências)
  const getVisibleQuestions = useCallback((): Question[] => {
    if (!questionario) return [];
    
    return questionario.questions.filter(question => {
      // Se não tem dependência, sempre visível
      if (!question.dependsOn) return true;
      
      // Verificar se a condição de dependência é atendida
      const dependsOnId = Array.isArray(question.dependsOn.id) 
        ? question.dependsOn.id[0] 
        : question.dependsOn.id;
      const dependsOnValue = Array.isArray(question.dependsOn.value) 
        ? question.dependsOn.value[0] 
        : question.dependsOn.value;
      const dependsOnResponse = responses[dependsOnId];
      
      return dependsOnResponse === dependsOnValue;
    });
  }, [questionario, responses]);

  // Função para verificar se uma questão foi respondida
  const isQuestionAnsweredForResponses = useCallback((question: Question, responsesToCheck: FormResponses): boolean => {
    const questionId = question.id;
    const response = responsesToCheck[questionId];
    const questionType = question.type || question.tipo;
    const subQuestions = question.subQuestions || question.subPerguntas || [];
    const hasSubQuestions = subQuestions.length > 0;
    
    if (
      response === undefined
      || response === null
      || response === ''
      || (response === OTHER_OPTION && (question.options || question.opcoes || []).includes(OTHER_OPTION))
    ) {
      return false;
    }
    
    // Para questões de matriz/múltipla escolha
    if (typeof response === 'object' && !Array.isArray(response)) {
      // ✅ Se a questão tem subperguntas, verificar se todas foram respondidas
      // (qualquer valor é válido, incluindo todas "Não")
      if (hasSubQuestions) {
        // Verificar se todas as subperguntas têm resposta
        return subQuestions.every(subQ => {
          const subResponse = response[subQ.id];
          return subResponse !== undefined && subResponse !== null && subResponse !== '';
        });
      }
      
      // Se não tem subperguntas, usar lógica original
      if (questionType === 'multipla_escolha') {
        // Para múltipla escolha, verificar se pelo menos uma opção é "Sim"
        const hasAtLeastOneYes = Object.values(response).some(value => value === 'Sim');
        return hasAtLeastOneYes;
      } else {
        // Para outras matrizes, verificar se tem pelo menos uma resposta
        return Object.keys(response).length > 0;
      }
    }
    
    return true;
  }, []);

  const isQuestionAnswered = useCallback((question: Question): boolean => {
    return isQuestionAnsweredForResponses(question, responses);
  }, [isQuestionAnsweredForResponses, responses]);

  // ✅ Função para verificar se todas as subperguntas foram respondidas
  const areAllSubQuestionsAnsweredForResponses = useCallback((question: Question, responsesToCheck: FormResponses): boolean => {
    const subQuestions = question.subQuestions || question.subPerguntas || [];
    
    // Se não tem subperguntas, considerar como completo
    if (subQuestions.length === 0) {
      return true;
    }
    
    const questionId = question.id;
    const response = responsesToCheck[questionId];
    const questionType = question.type || question.tipo;
    
    // Se não há resposta ou não é um objeto, não está completo
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      return false;
    }
    
    // Verificar cada subpergunta individualmente
    for (const subQ of subQuestions) {
      const subResponse = response[subQ.id];
      
      // Se a subpergunta não tem resposta, não está completo
      if (subResponse === undefined || subResponse === null) {
        return false;
      }
      
      // Validações específicas por tipo de questão
      if (questionType === 'matriz_selecao' || questionType === 'matriz_selecao_complexa') {
        // Para matriz de seleção, resposta não pode ser string vazia
        if (subResponse === '') {
          return false;
        }
      }
      
      // Para matriz_slider, verificar se é um número válido
      if (questionType === 'matriz_slider') {
        if (typeof subResponse !== 'number' || isNaN(subResponse)) {
          return false;
        }
      }
      
      // Para multipla_escolha, qualquer valor (incluindo "Não") é válido
      // desde que não seja undefined/null
    }
    
    // Todas as subperguntas foram respondidas
    return true;
  }, []);

  const areAllSubQuestionsAnswered = useCallback((question: Question): boolean => {
    return areAllSubQuestionsAnsweredForResponses(question, responses);
  }, [areAllSubQuestionsAnsweredForResponses, responses]);

  // ✅ Função para reconstruir o formato aninhado a partir das respostas achatadas do backend
  // Definida antes dos useEffect para estar disponível quando necessário
  const unflattenMatrixResponses = (flattenedResponses: FormResponses, questionarioData?: QuestionarioData | null): FormResponses => {
    const questionsData = questionarioData || questionario;
    if (!questionsData) return flattenedResponses;
    
    const unflattened: FormResponses = {};
    const usedKeys = new Set<string>();
    
    // Primeiro, processar todas as questões com subperguntas
    questionsData.questions.forEach(question => {
      const subQuestions = question?.subQuestions || question?.subPerguntas || [];
      const hasSubQuestions = subQuestions.length > 0;
      
      if (hasSubQuestions) {
        // Reconstruir o objeto aninhado para esta questão
        const nestedResponse: FormResponses = {};
        
        subQuestions.forEach((subQ: SubQuestion) => {
          // ✅ Incluir todas as subperguntas que têm resposta, mesmo que seja vazia
          if (flattenedResponses[subQ.id] !== undefined) {
            nestedResponse[subQ.id] = flattenedResponses[subQ.id];
            usedKeys.add(subQ.id);
          }
        });
        
        // ✅ Sempre adicionar a questão principal se houver subperguntas definidas
        // Isso garante que questões parciais também sejam exibidas
        if (hasSubQuestions) {
          unflattened[question.id] = nestedResponse;
        }
      }
    });
    
    // Depois, adicionar todas as respostas que não foram usadas (questões simples)
    Object.entries(flattenedResponses).forEach(([key, value]) => {
      if (!usedKeys.has(key)) {
        unflattened[key] = value;
      }
    });
    
    return unflattened;
  };

  useEffect(() => {
    if (formId) {
      // Resetar flag de inicialização quando mudar de formulário
      responsesInitializedRef.current = false;
      fetchQuestionario();
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
      }
    };
  }, [formId]);

  useEffect(() => {
    // ✅ Recarregar respostas quando o status mudar para "completed" ou quando o questionário for recarregado
    // Isso garante que as respostas finais sejam exibidas corretamente
    if (questionario?.currentResponse?.responses) {
      const shouldReload = 
        !responsesInitializedRef.current || // Primeira vez carregando
        questionario.currentResponse.status === 'completed'; // Formulário foi finalizado
      
      if (shouldReload) {
        // ✅ Reconstruir formato aninhado a partir das respostas achatadas do backend
        const unflattenedResponses = unflattenMatrixResponses(questionario.currentResponse.responses);
        setResponses(unflattenedResponses);
        responsesInitializedRef.current = true;
        
        // Carregar valores de sliders se existirem
        Object.entries(unflattenedResponses).forEach(([key, value]) => {
          if (typeof value === 'number') {
            setSliderValues(prev => ({ ...prev, [key]: value }));
          } else if (typeof value === 'object' && !Array.isArray(value)) {
            // Para matriz slider, os valores podem estar dentro do objeto
            Object.entries(value).forEach(([subKey, subValue]) => {
              if (typeof subValue === 'number') {
                setSliderValues(prev => ({ ...prev, [`${key}_${subKey}`]: subValue }));
              }
            });
          }
        });
      }
    }
  }, [questionario]);

  // Resetar índice quando as questões visíveis mudarem
  useEffect(() => {
    if (!questionario) return;
    const visibleQuestions = getVisibleQuestions();
    if (currentQuestionIndex >= visibleQuestions.length && visibleQuestions.length > 0) {
      setCurrentQuestionIndex(visibleQuestions.length - 1);
    }
  }, [questionario, responses, currentQuestionIndex, getVisibleQuestions]);

  const fetchQuestionario = async () => {
    if (!formId) return;
    
    setIsLoading(true);
    try {
      const response = await api.get(`/forms/${formId}/respond`);
      setQuestionario(response.data);
      
      // Resetar índice para primeira questão
      setCurrentQuestionIndex(0);
      
      // Inicializar respostas existentes
      if (response.data.currentResponse?.responses) {
        // ✅ Reconstruir formato aninhado a partir das respostas achatadas do backend
        // Passar response.data como parâmetro pois questionario ainda não foi setado
        const unflattenedResponses = unflattenMatrixResponses(response.data.currentResponse.responses, response.data);
        setResponses(unflattenedResponses);
        responsesInitializedRef.current = true;
      }
      
      // Marcar início se ainda não foi iniciado
      if (!response.data.currentResponse) {
        startTimeRef.current = new Date();
      }
    } catch (error: unknown) {
      console.error('Erro ao carregar questionário:', error);
      toast({
        title: "Erro ao carregar questionário",
        description: getApiErrorMessage(error) || "Não foi possível carregar o questionário.",
        variant: "destructive",
      });
      navigate(-1);
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ Função auxiliar para limpar respostas de múltipla escolha que tenham todas as subperguntas como "Não"
  // ✅ CORREÇÃO: Questões obrigatórias NUNCA são removidas, mesmo se todas as respostas forem "Não"
  const cleanMultipleChoiceResponses = (responsesToClean: FormResponses): FormResponses => {
    const cleaned = { ...responsesToClean };
    
    if (!questionario) return cleaned;
    
    // Criar mapa de questões para acesso rápido
    const questionsMap = new Map(questionario.questions.map(q => [q.id, q]));
    
    Object.keys(cleaned).forEach(questionId => {
      const question = questionsMap.get(questionId);
      if (!question) return;
      
      const questionType = question.type || question.tipo;
      const isRequired = question.required !== undefined 
        ? question.required 
        : (question.obrigatoria !== undefined ? question.obrigatoria : false);
      const response = cleaned[questionId];
      
      // ✅ Questões obrigatórias NUNCA são removidas
      if (isRequired) {
        return; // Continuar para próxima questão
      }
      
      // Questões não obrigatórias: remover se todas forem "Não"
      if (questionType === 'multipla_escolha' && 
          typeof response === 'object' && 
          !Array.isArray(response) &&
          Object.keys(response).length > 0) {
        const allNo = Object.values(response).every(value => value === 'Não');
        if (allNo) {
          console.log(`🗑️ Removendo resposta de múltipla escolha ${questionId} - todas as subperguntas são "Não" (não obrigatória)`);
          delete cleaned[questionId];
        }
      }
    });
    
    return cleaned;
  };

  // ✅ Função para achatar respostas de matriz (subperguntas) para o formato esperado pelo backend
  // ✅ Garante que questões obrigatórias sempre são processadas corretamente
  const flattenMatrixResponses = (responsesToFlatten: FormResponses): FormResponses => {
    const flattened: FormResponses = {};
    
    if (!questionario) return flattened;
    
    // Criar mapa de questões para acesso rápido
    const questionsMap = new Map(questionario.questions.map(q => [q.id, q]));
    
    Object.entries(responsesToFlatten).forEach(([questionId, response]) => {
      const question = questionsMap.get(questionId);
      
      if (!question) {
        // Se não encontrou a questão, manter como está (questão simples)
        flattened[questionId] = response;
        return;
      }
      
      // Verificar tanto subQuestions quanto subPerguntas (para compatibilidade)
      const subQuestions = question.subQuestions || question.subPerguntas || [];
      const hasSubQuestions = subQuestions.length > 0;
      
      // Se é uma questão com subperguntas (matriz), achatar as subperguntas para o nível raiz
      if (hasSubQuestions && typeof response === 'object' && !Array.isArray(response)) {
        // Para questões de matriz, colocar cada subpergunta no nível raiz
        // ✅ Garante que todas as subperguntas são enviadas, mesmo se todas forem "Não"
        Object.entries(response).forEach(([subQuestionId, subResponse]) => {
          flattened[subQuestionId] = subResponse;
        });
      } else {
        // Para questões simples, manter como está
        flattened[questionId] = response;
      }
    });
    
    return flattened;
  };

  const saveResponse = useCallback(async (
    isComplete: boolean = false,
    responsesToSave: FormResponses = responses,
    options: { showSaving?: boolean } = {}
  ) => {
    if (!formId || !questionario) return;
    const shouldShowSaving = options.showSaving ?? true;

    // ✅ Limpar respostas de múltipla escolha antes de salvar
    const cleanedResponses = cleanMultipleChoiceResponses(responsesToSave);
    
    // ✅ Achatar respostas de matriz para o formato esperado pelo backend
    const flattenedResponses = flattenMatrixResponses(cleanedResponses);

    if (shouldShowSaving) {
      setIsSaving(true);
    }
    try {
      const response = await api.post(`/forms/${formId}/responses`, {
        responses: flattenedResponses,
        isComplete
      });
      
      // Atualizar progresso se retornado pela API
      if (response.data?.progress !== undefined && questionario) {
        setQuestionario(prev => {
          if (!prev) return null;

          const nextProgress = response.data.progress;
          const currentResponseProgress = prev.currentResponse?.progress;

          if (prev.progress === nextProgress && currentResponseProgress === nextProgress) {
            return prev;
          }

          return {
            ...prev,
            currentResponse: prev.currentResponse ? {
              ...prev.currentResponse,
              progress: nextProgress
            } : undefined,
            progress: nextProgress
          };
        });
      }
      
      if (isComplete) {
        toast({
          title: "Resposta salva!",
          description: "Sua resposta foi salva com sucesso.",
        });
      }
    } catch (error: unknown) {
      console.error('Erro ao salvar resposta:', error);
      toast({
        title: "Erro ao salvar",
        description: getApiErrorMessage(error) || "Não foi possível salvar sua resposta.",
        variant: "destructive",
      });
    } finally {
      if (shouldShowSaving) {
        setIsSaving(false);
      }
    }
  }, [formId, questionario, responses, toast]);

  // Auto-save com debounce
  useEffect(() => {
    if (Object.keys(responses).length === 0) return;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveResponse(false, responses, { showSaving: false });
    }, 2000); // Salvar após 2 segundos de inatividade

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [responses, saveResponse]);

  const scheduleAutoAdvance = useCallback((questionId: string, nextResponses: FormResponses) => {
    if (!isAutoAdvanceEnabled || isSubmitting || !questionario) return;

    const visibleQuestions = questionario.questions.filter(question => {
      if (!question.dependsOn) return true;

      const dependsOnId = Array.isArray(question.dependsOn.id)
        ? question.dependsOn.id[0]
        : question.dependsOn.id;
      const dependsOnValue = Array.isArray(question.dependsOn.value)
        ? question.dependsOn.value[0]
        : question.dependsOn.value;

      return nextResponses[dependsOnId] === dependsOnValue;
    });
    const questionIndex = visibleQuestions.findIndex(question => question.id === questionId);
    const question = visibleQuestions[questionIndex];

    if (!question || questionIndex === -1 || questionIndex >= visibleQuestions.length - 1) return;
    if (new Date(questionario.deadline) < new Date()) return;

    const subQuestions = question.subQuestions || question.subPerguntas || [];
    const isComplete = subQuestions.length > 0
      ? areAllSubQuestionsAnsweredForResponses(question, nextResponses)
      : isQuestionAnsweredForResponses(question, nextResponses);

    if (!isComplete) return;

    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
    }

    autoAdvanceTimeoutRef.current = setTimeout(() => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      setCurrentQuestionIndex(questionIndex + 1);
      setValidationErrors({});
      void saveResponse(false, nextResponses, { showSaving: false });
      autoAdvanceTimeoutRef.current = null;
    }, 700);
  }, [
    areAllSubQuestionsAnsweredForResponses,
    isAutoAdvanceEnabled,
    isQuestionAnsweredForResponses,
    isSubmitting,
    questionario,
    saveResponse
  ]);

  const handleResponseChange = (
    questionId: string,
    value: FormResponseValue,
    options: { autoAdvance?: boolean } = {}
  ) => {
    setResponses(prev => {
      const nextResponses = {
        ...prev,
        [questionId]: value
      };

      if (options.autoAdvance) {
        scheduleAutoAdvance(questionId, nextResponses);
      }

      return nextResponses;
    });
    
    // Limpar erro de validação se existir
    if (validationErrors[questionId]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[questionId];
        return newErrors;
      });
    }
  };

  // Apenas volta uma questão (mobile / paridade TakeEvaluation — não sai do fluxo na questão 1)
  const stepToPreviousQuestion = () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    if (currentQuestionIndex === 0) return;

    setCurrentQuestionIndex(prev => prev - 1);
    setValidationErrors({});
  };

  // Função para navegar para a questão anterior
  const goToPreviousQuestion = () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
    }

    if (currentQuestionIndex === 0) {
      // Se estiver na primeira questão, voltar para a lista
      const basePath = user?.role === 'aluno' ? '/aluno/questionario' : '/app/questionario';
      navigate(basePath);
      return;
    }
    setCurrentQuestionIndex(prev => prev - 1);
    // Limpar erro de validação ao voltar
    setValidationErrors({});
  };

  // Função para navegar para a próxima questão
  const goToNextQuestion = () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    const visibleQuestions = getVisibleQuestions();
    if (currentQuestionIndex >= visibleQuestions.length - 1) return;
    
    const currentQuestion = visibleQuestions[currentQuestionIndex];
    const isRequired = currentQuestion.required !== undefined 
      ? currentQuestion.required 
      : (currentQuestion.obrigatoria !== undefined ? currentQuestion.obrigatoria : false);
    
    // ✅ Verificar se a questão tem subperguntas e se todas foram respondidas
    const subQuestions = currentQuestion.subQuestions || currentQuestion.subPerguntas || [];
    const hasSubQuestions = subQuestions.length > 0;
    
    if (hasSubQuestions && !areAllSubQuestionsAnswered(currentQuestion)) {
      setValidationErrors(prev => ({
        ...prev,
        [currentQuestion.id]: 'Todas as subperguntas devem ser respondidas'
      }));
      toast({
        title: "Subperguntas não respondidas",
        description: "Por favor, responda todas as subperguntas antes de continuar.",
        variant: "destructive",
      });
      return;
    }
    
    // ✅ Validar se a questão foi respondida (se for obrigatória)
    // Para questões com subperguntas, se todas foram respondidas, considerar como respondida
    // (mesmo que todas sejam "Não")
    if (isRequired) {
      const isAnswered = hasSubQuestions 
        ? areAllSubQuestionsAnswered(currentQuestion) // Se tem subperguntas, verificar se todas foram respondidas
        : isQuestionAnswered(currentQuestion); // Se não tem, usar validação normal
      
      if (!isAnswered) {
        setValidationErrors(prev => ({
          ...prev,
          [currentQuestion.id]: hasSubQuestions 
            ? 'Todas as subperguntas devem ser respondidas'
            : 'Esta questão é obrigatória'
        }));
        toast({
          title: hasSubQuestions 
            ? "Subperguntas não respondidas"
            : "Questão obrigatória não respondida",
          description: hasSubQuestions
            ? "Por favor, responda todas as subperguntas antes de continuar."
            : "Por favor, responda esta questão antes de continuar.",
          variant: "destructive",
        });
        return;
      }
    }
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    void saveResponse(false, responses, { showSaving: false });

    setCurrentQuestionIndex(prev => prev + 1);
    setValidationErrors({});
  };

  const handleSliderChange = (questionId: string, value: number) => {
    setSliderValues(prev => ({
      ...prev,
      [questionId]: value
    }));
    handleResponseChange(questionId, value);
  };

  const handleMatrixResponse = (
    questionId: string,
    subQuestionId: string,
    value: string | number,
    options: { autoAdvance?: boolean } = {}
  ) => {
    const currentValue = responses[questionId];
    let newValue: FormResponses;
    
    if (currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
      newValue = {
        ...currentValue,
        [subQuestionId]: value
      };
    } else {
      newValue = {
        [subQuestionId]: value
      };
    }
    
    handleResponseChange(questionId, newValue, options);
  };

  const validateResponses = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!questionario) return false;

    questionario.questions.forEach(question => {
      const isRequired = question.required !== undefined ? question.required : (question.obrigatoria !== undefined ? question.obrigatoria : false);
      
      if (isRequired) {
        const questionId = question.id;
        const subQuestions = question.subQuestions || question.subPerguntas || [];
        const hasSubQuestions = subQuestions.length > 0;
        
        // Verificar dependências
        if (question.dependsOn) {
          const dependsOnId = Array.isArray(question.dependsOn.id) ? question.dependsOn.id[0] : question.dependsOn.id;
          const dependsOnValue = Array.isArray(question.dependsOn.value) ? question.dependsOn.value[0] : question.dependsOn.value;
          const dependsOnResponse = responses[dependsOnId];
          
          // Se a condição não for atendida, não validar esta questão
          if (dependsOnResponse !== dependsOnValue) {
            return;
          }
        }
        
        // ✅ CORREÇÃO: Usar a mesma lógica da navegação
        // Se a questão tem subperguntas, verificar se todas foram respondidas
        // (qualquer valor é válido, incluindo todas "Não")
        let isEmpty = false;
        
        if (hasSubQuestions) {
          // Para questões com subperguntas, verificar se todas foram respondidas
          isEmpty = !areAllSubQuestionsAnswered(question);
        } else {
          // Mantém a mesma regra da navegação, inclusive o texto obrigatório de "Outro".
          isEmpty = !isQuestionAnswered(question);
        }
        
        if (isEmpty) {
          errors[questionId] = hasSubQuestions 
            ? 'Todas as subperguntas devem ser respondidas'
            : 'Esta questão é obrigatória';
        }
      }
    });

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFinalize = async () => {
    if (!validateResponses()) {
      toast({
        title: "Campos obrigatórios não preenchidos",
        description: "Por favor, preencha todas as questões obrigatórias antes de finalizar.",
        variant: "destructive",
      });
      
      // Scroll para o primeiro erro
      const firstErrorId = Object.keys(validationErrors)[0];
      if (firstErrorId) {
        const element = document.getElementById(`question-${firstErrorId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      return;
    }

    // ✅ Limpar respostas de múltipla escolha que tenham todas as subperguntas como "Não"
    // Isso evita enviar objetos vazios para o backend
    const cleanedResponses = cleanMultipleChoiceResponses(responses);
    
    // ✅ Achatar respostas de matriz para o formato esperado pelo backend
    const flattenedResponses = flattenMatrixResponses(cleanedResponses);

    // Log das respostas antes de enviar
    console.log('📤 Enviando respostas para finalizar:', {
      totalQuestions: questionario?.questions.length,
      responsesCount: Object.keys(flattenedResponses).length,
      originalResponsesCount: Object.keys(responses).length,
      cleanedResponsesCount: Object.keys(cleanedResponses).length,
      responses: flattenedResponses,
      progressBefore: calculateProgress()
    });

    setIsSubmitting(true);
    try {
      // Salvar resposta final
      const response = await api.post(`/forms/${formId}/responses/finalize`, {
        responses: flattenedResponses
      });

      // Verificar se o progresso foi retornado e está em 100%
      console.log('📥 Resposta da API após finalizar:', {
        data: response.data,
        progress: response.data?.progress,
        status: response.data?.status
      });

      if (response.data?.progress !== undefined) {
        console.log('✅ Progresso retornado pela API após finalizar:', response.data.progress);
        if (response.data.progress < 100) {
          console.warn('⚠️ ATENÇÃO: Progresso não está em 100% após finalizar:', response.data.progress);
          console.warn('Isso pode indicar que o servidor não está contando todas as questões corretamente.');
        }
      } else {
        console.warn('⚠️ API não retornou progresso após finalizar');
      }

      toast({
        title: "Questionário finalizado!",
        description: "Sua resposta foi enviada com sucesso.",
      });

      // Redirecionar de volta para a lista com flag de refresh
      const basePath = user?.role === 'aluno' ? '/aluno/questionario' : '/app/questionario';
      navigate(basePath, { state: { refresh: true } });
    } catch (error: unknown) {
      console.error('Erro ao finalizar questionário:', error);
      toast({
        title: "Erro ao finalizar",
        description: getApiErrorMessage(error) || "Não foi possível finalizar o questionário.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateProgress = (): number => {
    if (!questionario || questionario.questions.length === 0) return 0;
    
    // Priorizar progresso do backend se disponível
    if (questionario.progress !== undefined) {
      return questionario.progress;
    }
    
    if (questionario.currentResponse?.progress !== undefined) {
      return questionario.currentResponse.progress;
    }
    
    // Calcular progresso baseado em TODAS as questões (não apenas visíveis)
    // para ficar consistente com o cálculo do backend
    const totalQuestions = questionario.questions.length;
    
    const answeredQuestions = questionario.questions.filter(question => {
      const response = responses[question.id];
      
      if (response === undefined || response === null || response === '') {
        return false;
      }
      
      // Para objetos (matrizes), verificar se tem pelo menos uma resposta
      if (typeof response === 'object' && !Array.isArray(response)) {
        const hasAnswers = Object.keys(response).length > 0;
        return hasAnswers;
      }
      
      return true;
    }).length;

    const calculatedProgress = totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;
    
    return calculatedProgress;
  };

  /** Matriz com subperguntas (multipla_escolha / matriz_selecao): cartões empilhados em mobile/tablet, tabela em desktop largo */
  const renderSubQuestionMatrixSelection = (
    questionId: string,
    subs: SubQuestion[],
    cols: string[],
    currentResponseObj: unknown,
    subResponseGetter: (
      resp: Record<string, FormResponseValue>,
      subId: string,
    ) => string | undefined,
  ) => {
    const normalized =
      currentResponseObj && typeof currentResponseObj === 'object' && !Array.isArray(currentResponseObj)
        ? (currentResponseObj as Record<string, FormResponseValue>)
        : undefined;

    const radioCls = (
      checked: boolean,
    ) =>
      cn(
        'relative flex cursor-pointer touch-manipulation items-center justify-center rounded-full transition-all shrink-0',
        'focus-within:ring-2 focus-within:ring-purple-400 focus-within:ring-offset-2 focus-within:ring-offset-background dark:focus-within:ring-offset-card',
        'h-11 w-11 xs:h-12 xs:w-12 border-2',
        checked
          ? 'border-purple-600 bg-purple-600 shadow-md dark:border-violet-500 dark:bg-violet-600'
          : 'border-border bg-background dark:bg-card hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50/80 dark:hover:bg-purple-950/25',
      );

    const inputCls =
      'h-5 w-5 shrink-0 cursor-pointer accent-purple-600 dark:accent-violet-400';

    return (
      <>
        {/* Mobile + tablet até &lt; lg */}
        <div className="mt-6 space-y-3 lg:hidden">
          {subs.map((subQ) => {
            const subResp = normalized ? subResponseGetter(normalized as Record<string, FormResponseValue>, subQ.id) : undefined;

            return (
              <div
                key={subQ.id}
                className={cn(
                  'rounded-2xl border border-border bg-card p-4 shadow-sm',
                  'dark:border-border dark:bg-muted/20',
                  'xs:p-5',
                )}
              >
                <p className="text-sm font-semibold leading-snug text-foreground xs:text-[0.9375rem]">
                  {subQ.text || subQ.texto}
                </p>
                <div
                  role="radiogroup"
                  aria-label={subQ.text || subQ.texto || 'Opções'}
                  className="mt-4 grid gap-x-6 gap-y-5"
                  style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}
                >
                  {cols.map((option, optIndex) => {
                    const isSelected = subResp !== undefined && subResp === option;
                    const nameId = `${questionId}_${subQ.id}`;

                    return (
                      <label
                        key={optIndex}
                        className="flex flex-col items-center gap-2.5 xs:gap-3"
                      >
                        <span className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground xs:text-xs">
                          {option}
                        </span>
                        <span className={radioCls(isSelected)}>
                          <input
                            type="radio"
                            name={nameId}
                            value={option}
                            checked={isSelected}
                            onChange={(e) =>
                              handleMatrixResponse(questionId, subQ.id, e.target.value, {
                                autoAdvance: true,
                              })
                            }
                            className={inputCls}
                          />
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop largo */}
        <div className="mt-6 hidden lg:block lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:shadow-sm dark:lg:bg-muted/15">
          <div className="overflow-x-auto rounded-2xl">
            <table className="w-full min-w-0 border-collapse">
              <thead>
                <tr className="border-b-2 border-border bg-muted/70 dark:bg-muted/30">
                  <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground sm:px-5 sm:py-4 sm:text-sm sm:normal-case lg:px-6">
                    Item
                  </th>
                  {cols.map((option: string, optIndex: number) => (
                    <th
                      key={optIndex}
                      className="min-w-[5.5rem] px-3 py-3.5 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground sm:px-5 sm:py-4 sm:text-sm sm:normal-case lg:min-w-[6.5rem] lg:px-6"
                    >
                      {option}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subs.map((subQ: SubQuestion, subIndex: number) => {
                  const subResp = normalized ? subResponseGetter(normalized as Record<string, FormResponseValue>, subQ.id) : undefined;

                  return (
                    <tr
                      key={subQ.id}
                      className={cn(
                        'border-b border-border transition-colors last:border-b-0',
                        'hover:bg-purple-50/60 dark:hover:bg-purple-950/15',
                        subIndex % 2 === 0 ? 'bg-transparent' : 'bg-muted/20 dark:bg-muted/10',
                      )}
                    >
                      <td className="px-4 py-3.5 align-middle text-sm font-medium leading-snug text-foreground sm:px-5 sm:py-4 sm:text-[0.9375rem] lg:px-6">
                        {subQ.text || subQ.texto}
                      </td>
                      {cols.map((option: string, optIndex: number) => {
                        const isSelected = subResp !== undefined && subResp === option;

                        return (
                          <td key={optIndex} className="px-2 py-3 align-middle text-center sm:py-4">
                            <label className={cn(radioCls(isSelected), 'mx-auto')}>
                              <input
                                type="radio"
                                name={`${questionId}_${subQ.id}`}
                                value={option}
                                checked={isSelected}
                                onChange={(e) =>
                                  handleMatrixResponse(questionId, subQ.id, e.target.value, { autoAdvance: true })
                                }
                                className={inputCls}
                              />
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  };

  const renderQuestion = (question: Question) => {
    const questionId = question.id;
    const questionText = question.text || question.texto || '';
    const questionType = question.type || question.tipo || 'selecao_unica';
    const isRequired = question.required !== undefined ? question.required : (question.obrigatoria !== undefined ? question.obrigatoria : false);
    const options = question.options || question.opcoes || [];
    const subQuestions = question.subQuestions || question.subPerguntas || [];
    const hasError = !!validationErrors[questionId];

    const currentResponse = responses[questionId];
    const hasOtherOption = options.includes(OTHER_OPTION);
    const selectedSingleValue = isOtherResponse(currentResponse) ? OTHER_OPTION : currentResponse;
    const sliderValue = sliderValues[questionId] ?? (question.min !== undefined ? question.min : 0);
    const optionCardClass = (isSelected: boolean) => cn(
      'flex items-start gap-3 sm:gap-4 cursor-pointer rounded-lg sm:rounded-xl border-2 p-4 sm:p-5 md:p-6 transition-all touch-manipulation',
      'text-foreground hover:border-purple-300 hover:bg-purple-50/70 hover:shadow-md',
      'dark:hover:border-purple-700 dark:hover:bg-purple-950/20',
      'focus-within:ring-2 focus-within:ring-purple-400 focus-within:ring-offset-2 focus-within:ring-offset-background',
      isSelected
        ? 'border-purple-500 bg-purple-50 text-foreground ring-2 sm:ring-4 ring-purple-200 shadow-lg dark:bg-purple-950/30 dark:ring-purple-800'
        : 'border-border bg-card'
    );

    return (
      <div 
        key={questionId} 
        id={`question-${questionId}`}
        className="w-full"
      >
        <div className="mb-6 rounded-2xl border border-border bg-muted/40 p-4 shadow-sm dark:bg-muted/20 sm:mb-7 sm:p-5 md:p-6">
          <h2 className="text-balance text-lg font-bold leading-snug tracking-tight text-foreground xs:text-xl sm:text-2xl md:text-3xl">
            {questionText}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isRequired && (
              <Badge
                className={cn(
                  'rounded-full border-0 bg-red-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm',
                  'hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-600',
                )}
              >
                Obrigatória
              </Badge>
            )}
            {hasError && (
              <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                Atenção
              </Badge>
            )}
          </div>
          {hasError && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-3">{validationErrors[questionId]}</p>
          )}
        </div>

        <div>
            {/* Seleção Única */}
            {(questionType === 'selecao_unica') && (
              <RadioGroup
                value={typeof selectedSingleValue === 'string' ? selectedSingleValue : ''}
                onValueChange={(value) => handleResponseChange(questionId, value, { autoAdvance: value !== OTHER_OPTION })}
                className="space-y-3 mt-6"
              >
                {options.map((option: string, optIndex: number) => {
                  const isSelected = option === OTHER_OPTION
                    ? isOtherResponse(currentResponse)
                    : currentResponse === option;
                  const optionId = `${questionId}-${optIndex}`;

                  return (
                    <div
                      key={`${option}-${optIndex}`}
                      className={cn(optionCardClass(isSelected), option === OTHER_OPTION && 'flex-wrap')}
                      onClick={() => handleResponseChange(questionId, option, { autoAdvance: option !== OTHER_OPTION })}
                    >
                      <RadioGroupItem
                        value={option}
                        id={optionId}
                        className="mt-0.5 sm:mt-1 h-5 w-5 flex-shrink-0"
                      />
                      <Label
                        htmlFor={optionId}
                        className={cn(
                          'flex-1 cursor-pointer text-sm sm:text-base md:text-lg leading-relaxed',
                          isSelected ? 'font-semibold' : 'font-medium'
                        )}
                      >
                        {option}
                      </Label>
                      {option === OTHER_OPTION && isSelected && hasOtherOption && (
                        <div
                          className="basis-full pl-8 sm:pl-9"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Textarea
                            value={getOtherResponseText(currentResponse)}
                            onChange={(event) => {
                              const text = event.target.value;
                              handleResponseChange(
                                questionId,
                                text.trim() ? `${OTHER_RESPONSE_PREFIX}${text}` : OTHER_OPTION
                              );
                            }}
                            rows={3}
                            autoFocus
                            className="mt-2 min-h-[88px] resize-y bg-background"
                            placeholder="Escreva como você se identifica"
                            aria-label="Especifique a opção Outro"
                          />
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            Este campo é obrigatório ao selecionar Outro.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </RadioGroup>
            )}

            {/* Múltipla escolha — matriz responsiva */}
            {(questionType === 'multipla_escolha') &&
              renderSubQuestionMatrixSelection(
                questionId,
                subQuestions,
                options,
                currentResponse,
                (resp, subId) => {
                  const v = resp[subId];
                  if (v === undefined || v === null || v === '') return undefined;
                  return String(v);
                },
              )}

            {/* Matriz de seleção — matriz responsiva */}
            {(questionType === 'matriz_selecao') &&
              renderSubQuestionMatrixSelection(
                questionId,
                subQuestions,
                options,
                currentResponse,
                (resp, subId) => {
                  const v = resp[subId];
                  if (v === undefined || v === null || v === '') return undefined;
                  return String(v);
                },
              )}

            {/* Matriz de Seleção Complexa */}
            {(questionType === 'matriz_selecao_complexa') && (
              <div className="space-y-6 mt-6">
                {subQuestions.map((subQ: SubQuestion) => {
                  const subResponse = (currentResponse && typeof currentResponse === 'object' && !Array.isArray(currentResponse))
                    ? (currentResponse[subQ.id] || '')
                    : '';
                  return (
                    <div key={subQ.id} className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
                      <p className="text-base sm:text-lg font-semibold text-foreground mb-4">
                        {subQ.text || subQ.texto}
                      </p>
                      <RadioGroup
                        value={typeof subResponse === 'string' ? subResponse : ''}
                        onValueChange={(value) => handleMatrixResponse(questionId, subQ.id, value, { autoAdvance: true })}
                        className="space-y-3"
                      >
                        {options.map((option: string, optIndex: number) => {
                          const isSelected = subResponse === option;
                          const optionId = `${questionId}-${subQ.id}-${optIndex}`;

                          return (
                            <div
                              key={`${option}-${optIndex}`}
                              className={optionCardClass(isSelected)}
                              onClick={() => handleMatrixResponse(questionId, subQ.id, option, { autoAdvance: true })}
                            >
                              <RadioGroupItem
                                value={option}
                                id={optionId}
                                className="mt-0.5 sm:mt-1 h-5 w-5 flex-shrink-0"
                              />
                              <Label
                                htmlFor={optionId}
                                className={cn(
                                  'flex-1 cursor-pointer text-sm sm:text-base md:text-lg leading-relaxed',
                                  isSelected ? 'font-semibold' : 'font-medium'
                                )}
                              >
                                {option}
                              </Label>
                            </div>
                          );
                        })}
                      </RadioGroup>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Slider */}
            {(questionType === 'slider') && (
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="range"
                    min={question.min || 0}
                    max={question.max || 100}
                    value={sliderValue}
                    onChange={(e) => handleSliderChange(questionId, parseInt(e.target.value))}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((sliderValue - (question.min || 0)) / ((question.max || 100) - (question.min || 0))) * 100}%, #e5e7eb ${((sliderValue - (question.min || 0)) / ((question.max || 100) - (question.min || 0))) * 100}%, #e5e7eb 100%)`,
                      WebkitAppearance: 'none',
                      appearance: 'none'
                    }}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>{question.min || 0}</span>
                    <span className="font-medium text-foreground">
                      Valor: <span className="text-blue-600 font-semibold">{sliderValue}</span>
                    </span>
                    <span>{question.max || 100}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Slider com Opção */}
            {(questionType === 'slider_com_opcao') && (
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="range"
                    min={question.min || 0}
                    max={question.max || 100}
                    value={sliderValue}
                    onChange={(e) => handleSliderChange(questionId, parseInt(e.target.value))}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((sliderValue - (question.min || 0)) / ((question.max || 100) - (question.min || 0))) * 100}%, #e5e7eb ${((sliderValue - (question.min || 0)) / ((question.max || 100) - (question.min || 0))) * 100}%, #e5e7eb 100%)`,
                      WebkitAppearance: 'none',
                      appearance: 'none'
                    }}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>{question.min || 0}</span>
                    <span className="font-medium text-foreground">
                      Valor: <span className="text-blue-600 font-semibold">{sliderValue}</span>
                    </span>
                    <span>{question.max || 100}</span>
                  </div>
                </div>
                {question.optionText && (
                  <div className="mt-2">
                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-muted transition-colors">
                      <input
                        type="checkbox"
                        checked={currentResponse?.optionChecked || false}
                        onChange={(e) => handleResponseChange(questionId, { value: sliderValue, optionChecked: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm text-gray-600">{question.optionText}</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Matriz Slider */}
            {(questionType === 'matriz_slider') && (
              <div className="space-y-3">
                {subQuestions.map((subQ: SubQuestion) => {
                  const subSliderValue = sliderValues[`${questionId}_${subQ.id}`] ?? (question.min !== undefined ? question.min : 0);
                  return (
                    <div key={subQ.id} className="ml-4">
                      <p className="text-sm font-medium text-foreground mb-2">
                        {subQ.text || subQ.texto}
                      </p>
                      <div className="relative">
                        <input
                          type="range"
                          min={question.min || 0}
                          max={question.max || 100}
                          value={subSliderValue}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            setSliderValues(prev => ({ ...prev, [`${questionId}_${subQ.id}`]: value }));
                            handleMatrixResponse(questionId, subQ.id, value);
                          }}
                          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((subSliderValue - (question.min || 0)) / ((question.max || 100) - (question.min || 0))) * 100}%, #e5e7eb ${((subSliderValue - (question.min || 0)) / ((question.max || 100) - (question.min || 0))) * 100}%, #e5e7eb 100%)`,
                            WebkitAppearance: 'none',
                            appearance: 'none'
                          }}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground mt-2">
                          <span>{question.min || 0}</span>
                          <span className="font-medium text-foreground">
                            Valor: <span className="text-blue-600 font-semibold">{subSliderValue}</span>
                          </span>
                          <span>{question.max || 100}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Textarea */}
            {(questionType === 'textarea') && (
              <div className="space-y-2">
                <Textarea
                  value={currentResponse || ''}
                  onChange={(e) => handleResponseChange(questionId, e.target.value)}
                  rows={4}
                  className="w-full"
                  placeholder="Digite sua resposta aqui..."
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Resposta livre</span>
                  <span>{(currentResponse as string)?.length || 0} caracteres</span>
                </div>
              </div>
            )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-gray-600">Carregando questionário...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!questionario) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Questionário não encontrado
            </h3>
            <p className="text-gray-600 mb-4">
              O questionário solicitado não foi encontrado ou você não tem permissão para acessá-lo.
            </p>
            <Button onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isDeadlineExpired = new Date(questionario.deadline) < new Date();
  const visibleQuestions = getVisibleQuestions();
  const currentQuestion = visibleQuestions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === visibleQuestions.length - 1;
  const isFirstQuestion = currentQuestionIndex === 0;
  const currentQuestionNumber = currentQuestionIndex + 1;
  const totalQuestions = visibleQuestions.length;
  const remainingQuestions = totalQuestions - currentQuestionNumber;
  const answeredQuestionsCount = visibleQuestions.filter(question => {
    const subQuestions = question.subQuestions || question.subPerguntas || [];
    return subQuestions.length > 0
      ? areAllSubQuestionsAnswered(question)
      : isQuestionAnswered(question);
  }).length;
  const progressPercentage = totalQuestions > 0
    ? Math.round((answeredQuestionsCount / totalQuestions) * 100)
    : 0;

  const goToQuestion = (index: number) => {
    if (index < 0 || index >= visibleQuestions.length) return;

    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    setCurrentQuestionIndex(index);
    setValidationErrors({});
    setShowMobileNav(false);
  };

  // Verificar se pode avançar
  // ✅ Se a questão tem subperguntas, verificar se todas foram respondidas
  // ✅ Se não tem subperguntas, usar a validação normal
  const canProceed = currentQuestion ? (() => {
    const subQuestions = currentQuestion.subQuestions || currentQuestion.subPerguntas || [];
    const hasSubQuestions = subQuestions.length > 0;
    
    if (hasSubQuestions) {
      // Para questões com subperguntas, verificar se todas foram respondidas
      return areAllSubQuestionsAnswered(currentQuestion);
    } else {
      // Para questões sem subperguntas, usar validação normal
      return isQuestionAnswered(currentQuestion);
    }
  })() : false;

  const questionarioListPath =
    user?.role === 'aluno' ? '/aluno/questionario' : '/app/questionario';

  return (
    <div className="fixed inset-0 z-[9999] h-screen w-screen bg-background flex flex-col overflow-hidden">
      {/* Header fixo no estilo do TakeEvaluation */}
      <div className="bg-white dark:bg-card border-b border-border shadow-sm flex-shrink-0">
        <div className="px-2 sm:px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-0.5 shrink-0 min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => navigate(questionarioListPath)}
                className="h-8 gap-1 px-1.5 sm:px-2 text-muted-foreground hover:text-foreground shrink-0 touch-manipulation"
                title="Voltar à lista de questionários"
                aria-label="Voltar à lista de questionários"
              >
                <ArrowLeft className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem] shrink-0" />
                <span className="hidden xs:inline text-xs font-semibold truncate max-w-[7rem] sm:max-w-[9rem]">
                  Questionários
                </span>
              </Button>

              <div className="md:hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMobileNav(true)}
                  className="h-8 w-8 p-0 shrink-0"
                  aria-label="Abrir navegação de questões"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center text-center min-w-0">
              <h1 className="text-xs sm:text-sm md:text-base font-semibold truncate w-full px-1 dark:text-gray-100">
                {questionario.title}
              </h1>
              <div className="text-xs text-muted-foreground">
                <span className="hidden sm:inline">Questão </span>
                {currentQuestionNumber}/{totalQuestions}
                {remainingQuestions > 0 && (
                  <span className="hidden sm:inline"> · {remainingQuestions} {remainingQuestions === 1 ? 'restante' : 'restantes'}</span>
                )}
              </div>
            </div>

            <div className="w-auto md:w-24 lg:w-32 flex justify-end">
              {isSaving ? (
                <Badge variant="secondary" className="flex items-center gap-1.5 text-[10px] sm:text-xs tabular-nums">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  <span className="hidden xs:inline">Salvando...</span>
                </Badge>
              ) : (
                <Badge variant="outline" className="flex text-[10px] xs:text-xs tabular-nums bg-white dark:bg-purple-950/30 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300">
                  {answeredQuestionsCount}/{totalQuestions}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full flex">
          {/* Navegação lateral - estilo TakeEvaluation (expansível/recolhível em md+) */}
          <div
            className={cn(
              'hidden md:flex flex-col shrink-0 bg-gradient-to-b from-card to-card/95 dark:from-card dark:to-card/90 border-r border-border/80 shadow-[4px_0_24px_-8px_rgba(0,0,0,0.08)] dark:shadow-[4px_0_24px_-8px_rgba(0,0,0,0.3)] transition-[width] duration-300 ease-out overflow-hidden',
              isQuestionNavCollapsed ? 'md:w-14 lg:w-14 xl:w-14' : 'md:w-64 lg:w-72 xl:w-80'
            )}
          >
            {isQuestionNavCollapsed ? (
              <div className="flex flex-col items-center px-2 pt-4 pb-2 gap-4 flex-1 min-h-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Expandir lista de questões"
                  aria-label="Expandir lista de questões"
                  onClick={() => setIsQuestionNavCollapsed(false)}
                  className={cn(
                    'group shrink-0 h-8 w-8 md:h-9 md:w-9 rounded-full border transition-transform duration-300 ease-out',
                    'border-[var(--sidebar-button-border)] text-[var(--sidebar-icon-color)]',
                    'hover:bg-[var(--sidebar-button-hover-bg)] hover:text-[var(--sidebar-button-hover-text)]',
                    'hover:scale-110 active:scale-90'
                  )}
                >
                  <ChevronRight className="h-4 w-4 md:h-5 md:h-5 lg:h-4 lg:h-4 transition-transform duration-300 ease-out group-hover:translate-x-1" />
                </Button>

                <div
                  className="flex items-center justify-center rounded-xl px-1.5 py-2 min-w-[2.5rem] bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-md text-[10px] sm:text-[11px] font-bold tabular-nums leading-tight text-center"
                  title={`Questão ${currentQuestionNumber} de ${totalQuestions}`}
                  aria-live="polite"
                >
                  {currentQuestionNumber}/{totalQuestions}
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 lg:p-5 border-b border-border/60">
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Recolher painel de questões"
                        aria-label="Recolher painel de questões"
                        onClick={() => setIsQuestionNavCollapsed(true)}
                        className={cn(
                          'group shrink-0 h-8 w-8 md:h-9 md:w-9 lg:h-8 lg:w-8 rounded-full border transition-transform duration-300 ease-out',
                          'border-[var(--sidebar-button-border)] text-[var(--sidebar-icon-color)]',
                          'hover:bg-[var(--sidebar-button-hover-bg)] hover:text-[var(--sidebar-button-hover-text)]',
                          'hover:scale-110 active:scale-90'
                        )}
                      >
                        <ChevronLeft className="h-4 w-4 md:h-5 md:w-5 lg:h-4 lg:h-4 transition-transform duration-300 ease-out group-hover:-translate-x-1" />
                      </Button>

                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-foreground tracking-tight truncate">Questões</h3>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {answeredQuestionsCount} de {totalQuestions} respondidas
                        </p>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={handleFinalize}
                      disabled={isSubmitting || isSaving || isDeadlineExpired}
                      className={cn(
                        'shrink-0 h-8 px-3 text-xs font-medium rounded-xl shadow-sm transition-all',
                        progressPercentage >= 100
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-md'
                          : 'bg-purple-600 hover:bg-purple-700 text-white hover:shadow-md'
                      )}
                      title={progressPercentage < 100 ? 'Finalizar questionário e validar pendências' : 'Finalizar questionário'}
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-3.5 w-3 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-3.5 w-3 mr-1.5" />
                          Enviar
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                      <span>Progresso</span>
                      <span className="tabular-nums text-foreground/80">{progressPercentage}%</span>
                    </div>
                    <div className="w-full h-2 bg-muted/80 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 transition-all duration-500 ease-out shadow-sm"
                        style={{ width: `${progressPercentage}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 lg:p-4 min-h-0 pr-1">
                  <div className="grid grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                    {visibleQuestions.map((question, index) => {
                      const subQuestions = question.subQuestions || question.subPerguntas || [];
                      const hasAnswer = subQuestions.length > 0
                        ? areAllSubQuestionsAnswered(question)
                        : isQuestionAnswered(question);
                      const isCurrent = index === currentQuestionIndex;

                      return (
                        <button
                          key={question.id}
                          type="button"
                          className={cn(
                            'relative w-10 h-10 lg:w-11 lg:h-11 xl:w-12 xl:h-12 rounded-xl text-xs lg:text-sm font-semibold flex items-center justify-center transition-all duration-200 ease-out',
                            isCurrent
                              ? 'bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/30 ring-2 ring-violet-400/50 scale-105'
                              : hasAnswer
                                ? 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-400/40 dark:border-emerald-500/40 hover:bg-emerald-500/25 dark:hover:bg-emerald-500/30 hover:scale-105'
                                : 'bg-muted/70 dark:bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted hover:text-foreground hover:scale-105 hover:border-border',
                            isDeadlineExpired ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                          )}
                          onClick={() => !isDeadlineExpired && goToQuestion(index)}
                          disabled={isDeadlineExpired}
                          title={`Questão ${index + 1}${hasAnswer ? ' (Respondida)' : ''}`}
                        >
                          {index + 1}
                          {hasAnswer && !isCurrent && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Área principal — no mobile, navegação estilo TakeEvaluation (sem barra fixa inferior) */}
          <div className="flex-1 overflow-y-auto bg-background pb-28 md:pb-28">
            <div className="max-w-4xl mx-2 sm:mx-4 md:mx-auto p-3 sm:p-4 md:p-6">
              <div className="md:hidden mb-3">
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stepToPreviousQuestion();
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      stepToPreviousQuestion();
                    }}
                    disabled={isFirstQuestion || isSubmitting || isSaving || isDeadlineExpired}
                    className="flex-1 h-9 rounded-lg font-semibold touch-manipulation active:bg-muted"
                  >
                    Anterior
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      goToNextQuestion();
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      goToNextQuestion();
                    }}
                    disabled={
                      isLastQuestion
                      || !canProceed
                      || isSubmitting
                      || isSaving
                      || isDeadlineExpired
                    }
                    className="flex-1 h-9 rounded-lg bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-semibold shadow-md touch-manipulation"
                  >
                    Próximo
                  </Button>
                </div>

              </div>

              {currentQuestion ? (
                <Card className="evaluation-question-card question-fade-in border-border bg-card shadow-sm dark:bg-card dark:border-border">
                  <CardHeader className="evaluation-question-header space-y-3 border-b border-border p-3 sm:space-y-0 sm:p-5 md:p-6 dark:bg-card dark:border-border">
                    <div className="flex flex-col gap-3 xs:flex-row xs:items-center xs:justify-between xs:gap-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="rounded-full border-0 bg-gradient-to-br from-violet-600 to-purple-600 px-3 py-1 text-[11px] font-semibold text-white shadow-md sm:text-xs"
                        >
                          Questão {currentQuestionNumber}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="rounded-full px-3 py-1 text-[11px] font-semibold tabular-nums text-secondary-foreground sm:text-xs dark:bg-muted dark:text-foreground"
                        >
                          {currentQuestionNumber}/{totalQuestions}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/60 pt-3 xs:flex-nowrap xs:justify-end xs:border-t-0 xs:pt-0">
                        <span
                          className={`text-[11px] font-semibold sm:text-xs ${
                            isAutoAdvanceEnabled
                              ? 'text-green-700 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {isAutoAdvanceEnabled ? 'Auto avanço: ON' : 'Auto avanço: OFF'}
                        </span>
                        <label
                          className="relative inline-block h-6 w-12 shrink-0 cursor-pointer sm:h-7 sm:w-14"
                          title={
                            isAutoAdvanceEnabled ? 'Desativar avanço automático' : 'Ativar avanço automático'
                          }
                        >
                          <input
                            type="checkbox"
                            checked={isAutoAdvanceEnabled}
                            onChange={() => setIsAutoAdvanceEnabled((prev) => !prev)}
                            className="peer sr-only"
                            aria-label="Auto avanço"
                          />
                          <div
                            className={`absolute inset-0 rounded-full transition-colors duration-300 ease-in-out shadow-[inset_0_0_0_2px] peer-focus-visible:ring-2 peer-focus-visible:ring-violet-400 peer-focus-visible:ring-offset-2 after:pointer-events-none after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-[0_2px_5px_rgba(0,0,0,0.2)] after:transition-transform after:duration-300 after:ease-in-out sm:after:h-6 sm:after:w-6 peer-checked:after:translate-x-6 sm:peer-checked:after:translate-x-7 ${isAutoAdvanceEnabled
                              ? 'bg-green-500 shadow-green-600/80'
                              : 'bg-red-500 shadow-red-600/70'
                            }`}
                          />
                        </label>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6 p-3 sm:p-6 sm:space-y-8 md:p-8 dark:bg-card">
                    {renderQuestion(currentQuestion)}
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-border bg-card shadow-sm">
                  <CardContent className="p-8 text-center">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Nenhuma questão disponível no momento.</p>
                  </CardContent>
                </Card>
              )}

              {questionario.instructions && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-950/30 dark:border-blue-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-300 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-blue-800 dark:text-blue-200">{questionario.instructions}</p>
                  </div>
                </div>
              )}

              {isDeadlineExpired && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/30 dark:border-red-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-300 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-800 dark:text-red-200">
                      O prazo para responder este questionário expirou. Você ainda pode visualizar suas respostas, mas não pode mais editá-las.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Botão flutuante — mesma posição que TakeEvaluation (barra inferior só aparece em md+) */}
      <div className="md:hidden fixed right-4 z-[10001] bottom-[max(1rem,env(safe-area-inset-bottom,0px))]">
        <Button
          type="button"
          title="Abrir navegação"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowMobileNav(true);
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowMobileNav(true);
          }}
          className="rounded-full w-14 h-14 sm:w-16 sm:h-16 shadow-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white flex flex-col items-center justify-center p-2 touch-manipulation"
          aria-label={`Abrir questões (${answeredQuestionsCount}/${totalQuestions} respondidas)`}
        >
          <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
          <span className="text-[10px] sm:text-xs font-semibold mt-0.5 tabular-nums leading-none">
            {answeredQuestionsCount}/{totalQuestions}
          </span>
        </Button>
      </div>

      {showMobileNav && (
        <>
          <div
            role="presentation"
            className="fixed inset-0 z-[10002] bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowMobileNav(false);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowMobileNav(false);
            }}
          />

          <div className="fixed inset-x-0 bottom-0 z-[10003] pb-[env(safe-area-inset-bottom,0px)] bg-gradient-to-b from-card to-card/98 dark:from-card dark:to-card/95 rounded-t-3xl shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.4)] border-t border-border/60 max-h-[85vh] flex flex-col animate-slide-up">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-12 h-1 rounded-full bg-muted-foreground/20" />
            </div>

            <div className="px-4 pb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                  <Menu className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-foreground tracking-tight">Questões</h3>
                  <p className="text-xs text-muted-foreground">
                    {answeredQuestionsCount} de {totalQuestions} respondidas
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowMobileNav(false);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowMobileNav(false);
                }}
                className="h-9 w-9 rounded-xl touch-manipulation shrink-0"
                aria-label="Fechar painel de questões"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="px-4 pb-4">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground mb-2">
                <span>Progresso</span>
                <span className="tabular-nums text-foreground/80">{progressPercentage}%</span>
              </div>
              <div className="w-full h-2.5 bg-muted/80 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 transition-all duration-500 ease-out"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0 take-evaluation-questions-scroll pr-1">
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2.5">
                {visibleQuestions.map((question, index) => {
                  const subQuestions = question.subQuestions || question.subPerguntas || [];
                  const hasAnswer = subQuestions.length > 0
                    ? areAllSubQuestionsAnswered(question)
                    : isQuestionAnswered(question);
                  const isCurrent = index === currentQuestionIndex;

                  return (
                    <button
                      key={question.id}
                      type="button"
                      className={cn(
                        'relative w-full aspect-square rounded-xl text-sm font-semibold flex items-center justify-center transition-all duration-200 ease-out touch-manipulation',
                        isCurrent
                          ? 'bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/30 ring-2 ring-violet-400/50 scale-[1.02]'
                          : hasAnswer
                            ? 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-400/40 dark:border-emerald-500/40 hover:bg-emerald-500/25 dark:hover:bg-emerald-500/30'
                            : 'bg-muted/70 dark:bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted hover:text-foreground hover:border-border',
                        isDeadlineExpired ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!isDeadlineExpired) goToQuestion(index);
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!isDeadlineExpired) goToQuestion(index);
                      }}
                      disabled={isDeadlineExpired}
                    >
                      {index + 1}
                      {hasAnswer && !isCurrent && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 pt-3 border-t border-border/60 bg-muted/30 dark:bg-muted/20">
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowMobileNav(false);
                  void handleFinalize();
                }}
                disabled={
                  isSubmitting
                  || isSaving
                  || isDeadlineExpired
                  || answeredQuestionsCount < totalQuestions
                }
                className={cn(
                  'w-full py-4 text-base font-semibold rounded-xl touch-manipulation transition-all inline-flex items-center justify-center gap-2',
                  answeredQuestionsCount >= totalQuestions
                    ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-lg hover:shadow-md'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
              >
                <Send className="h-5 w-5 shrink-0" />
                Enviar ({answeredQuestionsCount}/{totalQuestions})
              </Button>

              {answeredQuestionsCount < totalQuestions && (
                <p className="text-xs text-center text-muted-foreground mt-2">
                  Responda todas as questões para enviar
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Botões de navegação fixos — ocultos no mobile (igual fluxo TakeEvaluation: topo + FAB) */}
      <div
        className={cn(
          'hidden md:block fixed bottom-0 right-0 bg-card/95 backdrop-blur border-t border-border shadow-lg z-[10000]',
          isQuestionNavCollapsed ? 'left-0' : 'left-0 md:left-64 lg:left-72 xl:left-80'
        )}
      >
        <div className="px-3 sm:px-6 py-3 sm:py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={goToPreviousQuestion}
              disabled={isSubmitting || isSaving || isDeadlineExpired}
              className="flex items-center gap-1 sm:gap-2 h-10 sm:h-11 px-3 sm:px-4 rounded-lg font-semibold"
            >
              <ArrowLeft className="h-4 w-4 flex-shrink-0" />
              <span className="text-xs sm:text-sm">{isFirstQuestion ? 'Voltar' : 'Anterior'}</span>
            </Button>

            {isLastQuestion ? (
              <Button
                onClick={handleFinalize}
                disabled={!canProceed || isSubmitting || isSaving || isDeadlineExpired}
                className="flex items-center gap-1 sm:gap-2 h-10 sm:h-11 px-3 sm:px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                    <span className="text-xs sm:text-sm">Finalizando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    <span className="hidden sm:inline text-sm">Finalizar Questionário</span>
                    <span className="sm:hidden text-xs">Finalizar</span>
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={goToNextQuestion}
                disabled={!canProceed || isSubmitting || isSaving || isDeadlineExpired}
                className="flex items-center gap-1 sm:gap-2 h-10 sm:h-11 px-3 sm:px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold"
              >
                <span className="text-xs sm:text-sm">Próximo</span>
                <ArrowRight className="h-4 w-4 flex-shrink-0" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuestionarioRespond;

