import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useForm, useFieldArray, useWatch, type FieldErrors } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Book, Check, List as ListIcon, Plus, Save, Eye, Type, Trash } from "lucide-react";
import { useNavigate } from "react-router-dom";

import './QuestionForm.css';
import MyEditor from './MyEditor';
import './MyEditor.css';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Question, Subject } from "../types";
import { api, BASE_URL } from "@/lib/api";
import { resolveQuestionImageSrc, toRelativeQuestionImageSrc } from "@/utils/questionImages";
import { useToast } from "@/hooks/use-toast";
import { Option } from "@/components/ui/multi-select";
import { useAuth } from "@/context/authContext";
import QuestionPreview from "./QuestionPreview";
import SkillsSelector from "./SkillsSelector";
import { QuestionOptionInput } from "./QuestionOptionInput";
import {
  mapOptionFromApi,
  mapOptionToApiPayload,
  optionHasContent,
  getActiveQuestionOptions,
} from "@/utils/questionOptionImages";
import type { QuestionOptionApi } from "@/types/question-option";
import {
  scrollToFirstError,
  scrollToFirstFormError,
  getFieldLabel,
  getFirstFormErrorMessage,
} from "@/utils/formValidation";
import { UpdateQuestionResponse } from "@/types/question-update";

// Form schema
const baseSchema = z.object({
  title: z.string().min(1, "O conteúdo é obrigatório"),
  text: z.string().min(1, "O enunciado é obrigatório"),
  educationStageId: z.string().min(1, "O curso é obrigatório"),
  subjectId: z.string().min(1, "A disciplina é obrigatória"),
  grade: z.string().min(1, "A série é obrigatória"),
  difficulty: z.string().min(1, "A dificuldade é obrigatória"),
  value: z.string().min(1, "O valor é obrigatório"),
  solution: z.string().optional(),
  options: z.array(
    z.object({
      id: z.string().optional(),
      text: z.string(),
      isCorrect: z.boolean(),
      image: z
        .object({
          kind: z.enum(['new', 'existing']),
          dataUrl: z.string().optional(),
          id: z.string().optional(),
          imageUrl: z.string().optional(),
          width: z.number().optional(),
          height: z.number().optional(),
        })
        .optional()
        .nullable(),
    })
  ).optional(),
  secondStatement: z.string().optional(),
  skills: z.array(z.string()).min(1, "Selecione pelo menos uma habilidade"),
  questionType: z.enum(['multipleChoice', 'dissertativa']),
});

const questionSchema = baseSchema.superRefine((data, ctx) => {
  if (data.questionType === 'multipleChoice') {
    const activeOptions = getActiveQuestionOptions(data.options);

    if (activeOptions.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Adicione pelo menos duas alternativas.',
        path: ['options'],
      });
    } else {
      activeOptions.forEach((opt, idx) => {
        if (!optionHasContent(opt)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Preencha o texto, uma expressão ou uma imagem na alternativa.',
            path: ['options', idx, 'text'],
          });
        }
      });
      if (!activeOptions.some((opt) => opt.isCorrect)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Marque uma alternativa como correta.',
          path: ['options'],
        });
      }
    }
  }
  // Se for dissertativa, não validar nem exigir alternativas
  if (data.questionType === 'dissertativa') {
    // options pode ser undefined ou array vazio
    if (data.options && data.options.length > 0) {
      // Não precisa validar nada, mas pode limpar se quiser
    }
  }
});

type QuestionFormValues = z.infer<typeof questionSchema>;

interface QuestionFormProps {
  onSubmit?: (data: QuestionFormValues) => void;
  open?: boolean;
  onClose: () => void;
  onQuestionAdded: (question: Question) => void;
  questionId?: string;
}

interface SkillOption {
  subjectId: string;
  educationStageId: string;
  id: string;
  name: string;
  code: string;
  description: string;
}

const QuestionForm = ({
  onSubmit: externalOnSubmit,
  open,
  onClose,
  onQuestionAdded,
  questionId,
}: QuestionFormProps) => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [educationStages, setEducationStages] = useState<Option[]>([]);
  const [grades, setGrades] = useState<Option[]>([]);
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [questionType, setQuestionType] = useState<'multipleChoice' | 'dissertativa'>('multipleChoice');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const hasLoadedInitialData = useRef(false);
  const preservedValues = useRef<{
    educationStageId?: string;
    subjectId?: string;
    grade?: string;
    skills?: string[];
  }>({});
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    mode: "onSubmit", // Só validar quando submeter
    reValidateMode: "onSubmit", // Só revalidar quando submeter
    defaultValues: {
      title: "",
      text: "",
      educationStageId: "",
      subjectId: "",
      grade: "",
      difficulty: "",
      value: "",
      solution: "",
      options: [
        { text: "", isCorrect: false, image: null },
        { text: "", isCorrect: false, image: null },
        { text: "", isCorrect: false, image: null },
        { text: "", isCorrect: false, image: null },
        { text: "", isCorrect: false, image: null },
      ],
      secondStatement: "",
      skills: [],
      questionType: 'multipleChoice',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "options",
  });


  // Usar useWatch ao invés de form.watch() para melhor performance e menos re-renders
  // MAS bloquear durante carregamento inicial para evitar timing issues
  const selectedEducationStageId = useWatch({
    control: form.control,
    name: "educationStageId",
    disabled: isLoadingQuestion, // Bloquear durante carregamento inicial
    defaultValue: "" // Prevenir valores undefined/vazios
  });
  const selectedSubjectId = useWatch({
    control: form.control,
    name: "subjectId", 
    disabled: isLoadingQuestion, // Bloquear durante carregamento inicial
    defaultValue: "" // Prevenir valores undefined/vazios
  });

  // Fallback: usar valores do form diretamente durante carregamento
  let currentEducationStageId = isLoadingQuestion 
    ? form.getValues("educationStageId")
    : selectedEducationStageId;
  let currentSubjectId = isLoadingQuestion
    ? form.getValues("subjectId")
    : selectedSubjectId;

  // PROTEÇÃO EXTRA: Se valores estão vazios mas temos valores preservados, usar os preservados
  // Só aplicar se estiver EDITANDO uma questão (tem questionId)
  if (questionId && !isLoadingQuestion && hasLoadedInitialData.current && preservedValues.current.educationStageId) {
    if (!currentEducationStageId && preservedValues.current.educationStageId) {
      currentEducationStageId = preservedValues.current.educationStageId;
    }
    if (!currentSubjectId && preservedValues.current.subjectId) {
      currentSubjectId = preservedValues.current.subjectId;
    }
  }


  useEffect(() => {
    const fetchQuestionData = async () => {
      if (questionId) {
        setIsLoadingQuestion(true);
        try {
          const response = await api.get<Question>(`/questions/${questionId}`);
          const questionData = response.data;


          const normalizeSkills = (skills: string[] | { id: string }[] | any): string[] => {
            if (!skills) return [];

            if (Array.isArray(skills)) {
              if (skills.length === 0) return [];

              // Se é array de strings
              if (typeof skills[0] === 'string') {
                // Limpar strings que podem estar com chaves ou JSON
                return (skills as string[]).map(skill => {
                  // Se é uma string JSON como "{id}", extrair o ID
                  if (skill.startsWith('{') && skill.endsWith('}')) {
                    try {
                      const parsed = JSON.parse(skill);
                      return typeof parsed === 'string' ? parsed : parsed.id || skill;
                    } catch {
                      // Se não é JSON válido, remover as chaves manualmente
                      return skill.replace(/[{}]/g, '').trim();
                    }
                  }
                  return skill;
                });
              }

              // Se é array de objetos com id
              return (skills as { id: string }[]).map((skill) => skill.id);
            }

            return [];
          };

          const normalizedSkills = normalizeSkills(questionData.skills);

          // Resolver URLs de imagens para exibição no editor (API devolve src="/questions/...")
          const textForEditor = resolveQuestionImageSrc(questionData.formattedText || questionData.text || "", BASE_URL);
          const solutionForEditor = resolveQuestionImageSrc(questionData.formattedSolution || questionData.solution || "", BASE_URL);
          const secondStatementForEditor = resolveQuestionImageSrc(questionData.secondStatement || "", BASE_URL);
          const optionsForEditor = (questionData.options || []).map((opt) =>
            mapOptionFromApi(opt as QuestionOptionApi, questionId)
          );

                     const formData: QuestionFormValues = { // Keep the explicit type here for clarity
             title: questionData.title || "",
             text: textForEditor,
             educationStageId: questionData.educationStage?.id || "",
             subjectId: questionData.subject?.id || "",
             grade: questionData.grade?.id || "",
             difficulty: questionData.difficulty || "",
             value: questionData.value?.toString() || "",
             solution: solutionForEditor,
             options: optionsForEditor.length > 0 ? optionsForEditor : [],
             secondStatement: secondStatementForEditor,
            skills: normalizedSkills,
            // Corrigir o mapeamento do tipo da questão
            questionType: (questionData.type === 'multipleChoice' || (questionData.type as any) === 'multiple_choice') 
              ? 'multipleChoice' 
              : 'dissertativa',
          };


                    // Map API data to form values
          hasLoadedInitialData.current = true; // Marcar ANTES do reset para que useEffects saibam
          
          form.reset(formData, { keepDefaultValues: false });
          
          // Forçar re-sincronização do form após reset
          await form.trigger();
          
          // PRESERVAR valores críticos para evitar que sejam perdidos
          preservedValues.current = {
            educationStageId: form.getValues("educationStageId"),
            subjectId: form.getValues("subjectId"),
            grade: form.getValues("grade"),
            skills: form.getValues("skills")
          };
          
          setQuestionType((questionData.type === 'multipleChoice' || (questionData.type as any) === 'multiple_choice') 
            ? 'multipleChoice' 
            : 'dissertativa');
          
          
        } catch (error) {
          console.error("Erro ao buscar dados da questão:", error);
          toast({
            title: "Erro",
            description: "Não foi possível carregar os dados da questão para edição.",
            variant: "destructive",
          });
        } finally {
          // Aguardar um tick antes de finalizar o carregamento para garantir que valores estejam preservados
          setTimeout(() => {
            setIsLoadingQuestion(false);
          }, 100);
        }
      } else {
        // Reset ao criar nova questão
        hasLoadedInitialData.current = false;
        preservedValues.current = {}; // Limpar valores preservados
      }
    };
    fetchQuestionData();
  }, [questionId]); // Removido 'form' e 'toast' das dependências para evitar loops

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [subjectsResponse, stagesResponse] = await Promise.all([
          api.get("/subjects"),
          api.get("/education_stages"),
        ]);
        setSubjects(subjectsResponse.data);
        setEducationStages(stagesResponse.data);
      } catch (error) {
        console.error("Erro ao buscar dados iniciais:", error);
        toast({
          title: "Erro",
          description: "Não foi possível carregar os dados iniciais do formulário.",
          variant: "destructive",
        });
      }
    };
    fetchInitialData();
  }, []); // Removido 'toast' das dependências para evitar loops

  useEffect(() => {
    const fetchGrades = async () => {
      // NÃO executar apenas se estiver carregando a questão inicial
      if (isLoadingQuestion) {
        return;
      }
      
      if (currentEducationStageId) {
        try {
          const response = await api.get(`/grades/education-stage/${currentEducationStageId}`);
          
          // Ordenar séries alfabeticamente/numericamente
          const sortedGrades = [...response.data].sort((a, b) => {
            const nameA = a.name.trim();
            const nameB = b.name.trim();
            
            // Extrair números do início do nome para ordenação numérica
            const numMatchA = nameA.match(/^(\d+)/);
            const numMatchB = nameB.match(/^(\d+)/);
            
            if (numMatchA && numMatchB) {
              const numA = parseInt(numMatchA[1], 10);
              const numB = parseInt(numMatchB[1], 10);
              if (numA !== numB) {
                return numA - numB;
              }
            } else if (numMatchA && !numMatchB) {
              return -1; // Números vêm antes de não-números
            } else if (!numMatchA && numMatchB) {
              return 1; // Não-números vêm depois de números
            }
            
            // Se ambos têm números iguais ou nenhum tem número, ordenar alfabeticamente
            return nameA.localeCompare(nameB, 'pt-BR', { numeric: true, sensitivity: 'base' });
          });
          
          setGrades(sortedGrades);

          // Aguardar um tick para garantir que setGrades foi aplicado
          await new Promise(resolve => setTimeout(resolve, 0));

          // Usar a mesma lógica que funcionou para skills
          const shouldResetGrade = !questionId || !hasLoadedInitialData.current;
          const currentGradeValue = form.getValues("grade");

          if (shouldResetGrade) {
            form.setValue("grade", ""); // Reseta a série apenas quando necessário
          }
        } catch (error) {
          console.error("Erro ao buscar séries:", error);
          toast({
            title: "Erro",
            description: "Não foi possível carregar as séries para este curso.",
            variant: "destructive",
          });
        }
      } else {
        setGrades([]);
      }
    };
    fetchGrades();
  }, [currentEducationStageId, questionId, isLoadingQuestion]); // Usar currentEducationStageId

  useEffect(() => {
    const fetchSkills = async () => {
      // NÃO executar apenas se estiver carregando a questão inicial
      if (isLoadingQuestion) {
        return;
      }
      
      if (currentSubjectId) {
        // Só reseta skills se:
        // 1. Não estiver editando (sem questionId), OU
        // 2. Estiver editando mas ainda não carregou os dados iniciais
        const shouldResetSkills = !questionId || !hasLoadedInitialData.current;
        if (shouldResetSkills) {
          form.setValue("skills", []); // Reseta apenas ao criar ou antes do primeiro load
        }
        
        try {
          const response = await api.get(`/skills/subject/${currentSubjectId}`);
          if (Array.isArray(response.data)) {
            const formattedSkills: SkillOption[] = response.data.map(skill => ({
              id: skill.id,
              name: `${skill.code} - ${skill.description}`,
              code: skill.code,
              description: skill.description,
              subjectId: selectedSubjectId,
              educationStageId: selectedEducationStageId,
            }));
            setSkills(formattedSkills);
          } else {
            setSkills([]);
          }
        } catch (error) {
          console.error("Erro ao buscar habilidades:", error);
          setSkills([]); // Garante que a lista esteja vazia em caso de erro
          toast({
            title: "Aviso",
            description: "Nenhuma habilidade encontrada para esta disciplina.",
            variant: "default",
          });
        }
      } else {
        setSkills([]);
      }
    };
    fetchSkills();
  }, [currentSubjectId, currentEducationStageId, isLoadingQuestion]); // Usar currentSubjectId e currentEducationStageId

  // REMOVIDO: useEffect problemático que estava resetando o form
  // O questionType já é definido no form.reset() durante o carregamento inicial

  // PROTETOR: Restaurar valores se eles forem perdidos após carregamento inicial
  useEffect(() => {
    if (questionId && !isLoadingQuestion && hasLoadedInitialData.current && preservedValues.current.educationStageId) {
      const currentValues = {
        educationStageId: form.getValues("educationStageId"),
        subjectId: form.getValues("subjectId"),
        grade: form.getValues("grade"),
        skills: form.getValues("skills")
      };

      // Verificar se algum campo foi perdido
      const lostFields: string[] = [];
      if (!currentValues.educationStageId && preservedValues.current.educationStageId) lostFields.push('educationStageId');
      if (!currentValues.subjectId && preservedValues.current.subjectId) lostFields.push('subjectId');
      if (!currentValues.grade && preservedValues.current.grade) lostFields.push('grade');
      if (!currentValues.skills?.length && preservedValues.current.skills?.length) lostFields.push('skills');

      if (lostFields.length > 0) {
        // Restaurar valores perdidos
        if (!currentValues.educationStageId && preservedValues.current.educationStageId) {
          form.setValue("educationStageId", preservedValues.current.educationStageId);
        }
        if (!currentValues.subjectId && preservedValues.current.subjectId) {
          form.setValue("subjectId", preservedValues.current.subjectId);
        }
        if (!currentValues.grade && preservedValues.current.grade) {
          form.setValue("grade", preservedValues.current.grade);
        }
        if (!currentValues.skills?.length && preservedValues.current.skills?.length) {
          form.setValue("skills", preservedValues.current.skills);
        }
      }
    }
  }, [questionId, isLoadingQuestion, currentEducationStageId, currentSubjectId]);


  const htmlToText = (html: string) => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return tempDiv.textContent || tempDiv.innerText || '';
  }

  const handleFormInvalid = (errors: FieldErrors<QuestionFormValues>) => {
    setHasAttemptedSubmit(true);
    scrollToFirstFormError(errors);
    toast({
      title: "Não foi possível salvar a questão",
      description: getFirstFormErrorMessage(errors),
      variant: "destructive",
    });
  };

  const handleFormSubmit = async (data: QuestionFormValues) => {
    setHasAttemptedSubmit(true);
    
    // Forçar validação do formulário
    const isValid = await form.trigger();
    
    if (!isValid) {
      const errors = form.formState.errors;
      const firstErrorField = Object.keys(errors)[0];
      scrollToFirstError(errors);
      
      toast({
        title: "Campo obrigatório não preenchido",
        description: `Por favor, preencha o campo "${getFieldLabel(firstErrorField)}"`,
        variant: "destructive",
      });
      return;
    }

    // Validação customizada para alternativas (múltipla escolha)
    if (data.questionType === 'multipleChoice') {
      const activeOptions = getActiveQuestionOptions(data.options);

      if (activeOptions.length < 2) {
        scrollToFirstFormError({ options: { message: 'Adicione pelo menos duas alternativas.' } });
        toast({
          title: "Alternativas insuficientes",
          description: "Adicione pelo menos 2 alternativas para questões de múltipla escolha",
          variant: "destructive",
        });
        return;
      }

      if (!activeOptions.some((opt) => opt.isCorrect)) {
        scrollToFirstFormError({ options: { message: 'Marque uma alternativa como correta.' } });
        toast({
          title: "Resposta correta não marcada",
          description: "Clique no círculo à esquerda de uma alternativa para marcá-la como correta",
          variant: "destructive",
        });
        return;
      }

      const emptyOptionIndex = activeOptions.findIndex((opt) => !optionHasContent(opt));
      if (emptyOptionIndex !== -1) {
        scrollToFirstFormError({
          options: [{ text: { message: 'Preencha o texto, uma expressão ou uma imagem na alternativa.' } }],
        });
        toast({
          title: "Alternativa incompleta",
          description: `Preencha texto, expressão LaTeX ou imagem na alternativa ${String.fromCharCode(65 + emptyOptionIndex)}`,
          variant: "destructive",
        });
        return;
      }
    }

    if (!user) {
      toast({
        title: "Erro de Autenticação",
        description: "Você precisa estar logado para criar uma questão.",
        variant: "destructive",
      });
      return;
    }

    // Corrigir: salvar solution como letra da alternativa correta
    let solution = data.solution ? htmlToText(data.solution) : "";
    if (data.questionType === 'multipleChoice' && data.options) {
      const correctIndex = data.options.findIndex(opt => opt.isCorrect);
      if (correctIndex !== -1) {
        solution = String.fromCharCode(65 + correctIndex); // "A", "B", ...
      }
    }

    // Mapear o tipo da questão para o formato esperado pela API
    const questionTypeForAPI = data.questionType === 'multipleChoice' ? 'multipleChoice' : 'dissertativa';
    
    // Reverter URLs de imagens para relativas antes de enviar à API
    const formattedTextForApi = toRelativeQuestionImageSrc(data.text, BASE_URL);
    const formattedSolutionForApi = toRelativeQuestionImageSrc(data.solution || "", BASE_URL);
    const secondStatementForApi = toRelativeQuestionImageSrc(data.secondStatement || '', BASE_URL);

    const options =
      data.questionType === 'multipleChoice' && data.options
        ? data.options.map((opt, index) => mapOptionToApiPayload(opt, index))
        : [];

    const payload = {
      title: data.title,
      text: htmlToText(data.text),
      formattedText: formattedTextForApi,
      type: questionTypeForAPI,
      subjectId: data.subjectId,
      educationStageId: data.educationStageId,
      grade: data.grade,
      difficulty: data.difficulty,
      value: data.value ? parseFloat(data.value) : 0,
      solution,
      formattedSolution: formattedSolutionForApi,
      options: options,
      skills: data.skills, // Agora é obrigatório, não precisa de fallback
      secondStatement: secondStatementForApi,
      lastModifiedBy: user.id,
      createdBy: user.id,
    };


    try {
      setIsSubmitting(true);
      
      if (questionId) {
        // Update existing question
        const response = await api.put<UpdateQuestionResponse>(`/questions/${questionId}`, payload);
        const updateResponse = response.data;
        
        // Verificar se houve mudança de gabarito
        if (updateResponse.gabarito_changed && updateResponse.recalculation) {
          const { status, students_recalculated, tests_affected, errors } = updateResponse.recalculation;
          const gabaritoMsg = `Gabarito alterado de "${updateResponse.old_answer}" para "${updateResponse.new_answer}".`;
          
          if (status === 'completed' && errors === 0) {
            toast({
              title: "Sucesso",
              description: `${gabaritoMsg} ${students_recalculated} ${students_recalculated === 1 ? 'aluno recalculado' : 'alunos recalculados'} em ${tests_affected} ${tests_affected === 1 ? 'teste' : 'testes'}.`,
              duration: 6000,
            });
          } else if (status === 'processing') {
            toast({
              title: "Sucesso",
              description: `${gabaritoMsg} Recalculação em andamento...`,
              duration: 5000,
            });
          } else if (status === 'error') {
            toast({
              title: "Questão atualizada com avisos",
              description: `${gabaritoMsg} Ocorreram ${errors} ${errors === 1 ? 'erro' : 'erros'} ao recalcular.`,
              variant: "default",
              duration: 6000,
            });
          } else {
            toast({
              title: "Sucesso",
              description: gabaritoMsg,
            });
          }
        } else {
          // Atualização normal sem mudança de gabarito
          toast({
            title: "Sucesso",
            description: "Questão atualizada com sucesso!",
          });
        }
        
        // Buscar a questão atualizada
        const updatedQuestionResponse = await api.get<Question>(`/questions/${questionId}`);
        const updatedQuestion = updatedQuestionResponse.data;
        
        if (externalOnSubmit) {
          externalOnSubmit(data);
        }
        if (onQuestionAdded) {
          onQuestionAdded(updatedQuestion);
        }
        onClose();
      } else {
        // Create new question
        const response = await api.post("/questions", payload);
        const newQuestion: Question = response.data;
        
        toast({
          title: "Sucesso",
          description: "Questão criada com sucesso!",
        });
        
        if (externalOnSubmit) {
          externalOnSubmit(data);
        }
        if (onQuestionAdded) {
          onQuestionAdded(newQuestion);
        }
        onClose();
      }
    } catch (error) {
      console.error(`Erro ao ${questionId ? 'atualizar' : 'criar'} questão:`, error);
      toast({
        title: "Erro",
        description: `Não foi possível ${questionId ? 'atualizar' : 'criar'} a questão`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetQuestionType = (type: 'multipleChoice' | 'dissertativa') => {
    setQuestionType(type);
    
    // Só resetar opções se não estiver carregando dados iniciais
    if (!isLoadingQuestion) {
      if (type === 'multipleChoice') {
        form.setValue('options', [
          { text: '', isCorrect: false, image: null },
          { text: '', isCorrect: false, image: null },
        ]);
        form.clearErrors('options');
      } else if (type === 'dissertativa') {
        form.setValue('options', []);
        form.clearErrors('options');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Botão de preview */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => setShowPreview(!showPreview)}
          type="button"
          className="flex items-center gap-2 text-foreground border-border"
        >
          <Eye className="h-4 w-4" />
          {showPreview ? "Voltar à Edição" : "Visualizar"}
        </Button>
      </div>

      {showPreview ? (
        <div className="bg-muted rounded-xl border-2 border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-foreground">Preview da Questão</h3>
          </div>
          {(() => {
            const formData = form.getValues();
            const previewQuestion: Question = {
              id: 'preview',
              title: formData.title,
              text: formData.text,
              formattedText: formData.text,
              type: formData.questionType,
              subjectId: formData.subjectId,
              subject: subjects.find(s => s.id === formData.subjectId) || { id: formData.subjectId, name: 'Carregando...' },
              grade: grades.find(g => g.id === formData.grade) || { id: formData.grade, name: 'Carregando...' },
              difficulty: formData.difficulty,
              value: Number(formData.value),
              solution: formData.solution || '',
              formattedSolution: formData.solution || '',
              options: formData.questionType === 'multipleChoice'
                ? (formData.options ?? []).map((o, i) => ({
                    id: o.id ?? `preview-${i}`,
                    text: o.text || '',
                    isCorrect: o.isCorrect || false,
                    image: o.image ?? undefined,
                  }))
                : [],
              skills: formData.skills || [],
              created_by: user?.id || '',
              secondStatement: formData.secondStatement,
              educationStage: null
            };
            return <QuestionPreview question={previewQuestion} />;
          })()}
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit, handleFormInvalid)} className="space-y-8">

            {/* Seção: Informações Básicas */}
            <div className="bg-blue-50 dark:bg-muted/40 rounded-xl p-6 border border-blue-200 dark:border-border">
              <div className="flex items-center gap-2 mb-4">
                <Book className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-lg font-semibold text-foreground">Informações Básicas</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="sm:col-span-2">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold text-foreground">Conteúdo da Questão *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Ex: Propriedades dos números naturais"
                            className="h-11 text-base"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="educationStageId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground">Curso *</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Selecione o curso" />
                          </SelectTrigger>
                          <SelectContent>
                            {educationStages.map((stage) => (
                              <SelectItem key={stage.id} value={stage.id}>
                                {stage.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="subjectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground">Disciplina *</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Selecione a disciplina" />
                          </SelectTrigger>
                          <SelectContent>
                            {subjects.map((subject) => (
                              <SelectItem key={subject.id} value={subject.id}>
                                {subject.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="grade"
                  render={({ field }) => {
                    const isDisabled = !currentEducationStageId || (grades.length === 0 && !questionId);
                    
                    return (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground">Série *</FormLabel>
                      <FormControl>
                        <Select
                          key={`grade-select-${currentEducationStageId}-${grades.length}`} // Force re-mount when dependencies change
                          onValueChange={field.onChange}
                          value={field.value}
                          disabled={!currentEducationStageId || (grades.length === 0 && !questionId)}
                        >
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder={currentEducationStageId ? "Selecione a série" : "Selecione um curso primeiro"} />
                          </SelectTrigger>
                          <SelectContent>
                            {grades.map((grade) => (
                              <SelectItem key={grade.id} value={grade.id}>
                                {grade.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="difficulty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground">Dificuldade *</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Selecione a dificuldade" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Abaixo do Básico">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                Abaixo do Básico
                              </div>
                            </SelectItem>
                            <SelectItem value="Básico">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                Básico
                              </div>
                            </SelectItem>
                            <SelectItem value="Adequado">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-green-400"></div>
                                Adequado
                              </div>
                            </SelectItem>
                            <SelectItem value="Avançado">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-green-700"></div>
                                Avançado
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground">Valor da Questão *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.1"
                          placeholder="Ex: 2.5"
                          className="h-11"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="skills"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2 min-w-0">
                      <FormLabel className="text-sm font-semibold text-foreground">
                        Habilidades (BNCC)
                        <span className="text-muted-foreground font-normal ml-1">
                          {skills.length > 0 ? `(${skills.length} disponíveis)` : ''}
                        </span>
                      </FormLabel>
                      <FormControl>
                        <SkillsSelector
                          skills={skills}
                          selected={field.value || []}
                          onChange={field.onChange}
                          placeholder={currentSubjectId ? "Clique para abrir o seletor de habilidades" : "Selecione uma disciplina primeiro"}
                          disabled={!currentSubjectId || skills.length === 0}
                          gradeId={form.watch('grade')}
                          gradeName={grades.find(g => g.id === form.watch('grade'))?.name}
                          subjectId={currentSubjectId}
                          subjectName={subjects.find(s => s.id === currentSubjectId)?.name}
                          allGrades={grades}
                        />
                      </FormControl>
                      <FormMessage />
                      {(field.value || []).length > 0 && (
                        <div className="mt-3 p-3 bg-blue-50 dark:bg-muted/40 rounded-lg border border-blue-200 dark:border-border">
                          <div className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                            Habilidades Selecionadas ({(field.value || []).length}):
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {(field.value || []).map((skillId: string) => {
                              const skill = skills.find(opt => opt.id === skillId);
                              return skill ? (
                                <Badge key={skillId} variant="outline" className="text-xs bg-card border-blue-300 dark:border-blue-800">
                                  {skill.code}
                                </Badge>
                              ) : null;
                            })}
                          </div>
                        </div>
                      )}
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Seção: Tipo de Questão */}
            <div className="bg-purple-50 dark:bg-muted/40 rounded-xl p-6 border border-purple-200 dark:border-border">
              <div className="flex items-center gap-2 mb-4">
                <ListIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <h3 className="text-lg font-semibold text-foreground">Tipo de Questão</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <Button
                  type="button"
                  variant={questionType === 'multipleChoice' ? 'default' : 'outline'}
                  size="lg"
                  onClick={() => handleSetQuestionType('multipleChoice')}
                  className={`w-full h-auto min-h-[4rem] p-4 ${questionType === 'multipleChoice'
                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg'
                    : 'hover:bg-purple-50 dark:hover:bg-muted/60 hover:border-purple-300 dark:hover:border-border'
                    }`}
                >
                  <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
                    <Check className="h-5 w-5 flex-shrink-0" />
                    <div className="text-center sm:text-left">
                      <div className="font-semibold text-sm sm:text-base">Múltipla Escolha</div>
                      <div className="text-xs opacity-80 hidden sm:block">Questão com alternativas A, B, C, D...</div>
                    </div>
                  </div>
                </Button>

                <Button
                  type="button"
                  variant={questionType === 'dissertativa' ? 'default' : 'outline'}
                  size="lg"
                  onClick={() => handleSetQuestionType('dissertativa')}
                  className={`w-full h-auto min-h-[4rem] p-4 ${questionType === 'dissertativa'
                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg'
                    : 'hover:bg-purple-50 dark:hover:bg-muted/60 hover:border-purple-300 dark:hover:border-border'
                    }`}
                >
                  <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
                    <Type className="h-5 w-5 flex-shrink-0" />
                    <div className="text-center sm:text-left">
                      <div className="font-semibold text-sm sm:text-base">Dissertativa</div>
                      <div className="text-xs opacity-80 hidden sm:block">Questão com resposta livre do aluno</div>
                    </div>
                  </div>
                </Button>
              </div>
            </div>

            {/* Seção: Enunciados */}
            <div className="bg-green-50 dark:bg-muted/40 rounded-xl p-6 border border-green-200 dark:border-border">
              <div className="flex items-center gap-2 mb-4">
                <Type className="h-5 w-5 text-green-600 dark:text-green-400" />
                <h3 className="text-lg font-semibold text-foreground">Enunciados</h3>
              </div>

              <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="text"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground">Enunciado Principal *</FormLabel>
                      <FormControl>
                        <MyEditor
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="secondStatement"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold text-foreground">
                        Segundo Enunciado
                        <span className="text-muted-foreground font-normal ml-1">(opcional)</span>
                      </FormLabel>
                      <FormControl>
                        <MyEditor
                          value={field.value || ""}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Seção: Alternativas (apenas para múltipla escolha) */}
            {questionType === 'multipleChoice' && (
              <div
                id="question-form-options"
                className={`bg-orange-50 dark:bg-muted/40 rounded-xl p-6 border transition-colors ${
                  form.formState.errors.options
                    ? 'border-red-500 dark:border-red-500 ring-2 ring-red-200 dark:ring-red-900/50'
                    : 'border-orange-200 dark:border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    <h3 className="text-lg font-semibold text-foreground">Alternativas</h3>
                  </div>
                  {fields.length < 5 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ text: "", isCorrect: false, image: null })}
                      className="flex items-center gap-2 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/50"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar Alternativa
                    </Button>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Clique no círculo à esquerda de uma alternativa para marcá-la como{" "}
                  <span className="font-medium text-green-700 dark:text-green-400">correta</span>.
                </p>

                {hasAttemptedSubmit && form.formState.errors.options?.message && (
                  <div
                    role="alert"
                    className="mb-4 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300"
                  >
                    {form.formState.errors.options.message}
                  </div>
                )}

                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex items-center gap-4 p-4 bg-card rounded-lg border border-border shadow-sm">
                      <button
                        type="button"
                        onClick={() => {
                          form.getValues("options").forEach((_, i) => {
                            form.setValue(`options.${i}.isCorrect`, i === index);
                          });
                          form.clearErrors('options');
                        }}
                        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${form.watch("options")?.[index]?.isCorrect
                            ? 'bg-green-500 border-green-500 text-white shadow-lg'
                            : hasAttemptedSubmit && form.formState.errors.options
                              ? 'bg-card border-red-400 dark:border-red-500 hover:border-red-500'
                              : 'bg-card border-border hover:border-green-400 dark:hover:border-green-600'
                          }`}
                        title="Marcar como alternativa correta"
                        aria-label={`Marcar alternativa ${String.fromCharCode(65 + index)} como correta`}
                      >
                        {form.watch("options")?.[index]?.isCorrect ? <Check className="w-4 h-4" /> : null}
                      </button>

                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground">
                        {String.fromCharCode(65 + index)}
                      </div>

                      <FormField
                        control={form.control}
                        name={`options.${index}.text`}
                        render={({ field }) => (
                          <FormItem className="flex-1 min-w-0">
                            <FormControl>
                              <QuestionOptionInput
                                value={field.value}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                ref={field.ref}
                                image={form.watch(`options.${index}.image`)}
                                onImageChange={(image) =>
                                  form.setValue(`options.${index}.image`, image, {
                                    shouldDirty: true,
                                  })
                                }
                                placeholder={`Digite a alternativa ${String.fromCharCode(65 + index)}`}
                                className="h-11 text-base"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {fields.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(index)}
                          className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50"
                          aria-label="Remover alternativa"
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

              </div>
            )}

            {/* Seção: Resolução */}
            <div className="bg-indigo-50 dark:bg-muted/40 rounded-xl p-6 border border-indigo-200 dark:border-border">
              <div className="flex items-center gap-2 mb-4">
                <Save className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-lg font-semibold text-foreground">
                  Resolução
                  <span className="text-muted-foreground font-normal ml-1">(opcional)</span>
                </h3>
              </div>

              <FormField
                control={form.control}
                name="solution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-foreground">
                      Explicação detalhada da resolução
                    </FormLabel>
                    <FormControl>
                      <MyEditor
                        value={field.value || ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Botões de ação */}
            <div className="flex flex-col sm:flex-row sm:justify-end gap-3 sm:gap-4 pt-6 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                size="lg"
                className="w-full sm:w-auto px-6 sm:px-8 order-2 sm:order-1"
              >
                Cancelar
              </Button>
                             <Button
                 type="submit"
                 disabled={isSubmitting}
                 size="lg"
                 className="w-full sm:w-auto px-6 sm:px-8 bg-blue-600 hover:bg-blue-700 order-1 sm:order-2"
               >
                {isSubmitting ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Salvando...</span>
                  </div>
                ) : questionId ? (
                  <div className="flex items-center justify-center gap-2">
                    <Save className="h-4 w-4" />
                    <span>Atualizar Questão</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <Plus className="h-4 w-4" />
                    <span>Criar Questão</span>
                  </div>
                )}
              </Button>
            </div>
          </form>
        </Form>
      )}
    </div>
  );
};

export default QuestionForm;
