import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Users, 
  GraduationCap, 
  UserCheck, 
  Building2, 
  Plus, 
  Calendar,
  Target,
  Shield,
  Filter,
  Search,
  Check,
  X,
  CheckSquare,
  Square,
  Send,
  Loader2,
  Trash2,
  RotateCcw,
  Eye,
  FileText
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FormType } from '@/types/forms';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
import { FormMultiSelect, FormOption } from '@/components/ui/form-multi-select';
import { useToast } from '@/hooks/use-toast';
import { FormFiltersApiService } from '@/services/formFiltersApi';
import { api } from '@/lib/api';
import { 
  questionsAlunoJovem, 
  questionsAlunoVelho, 
  professorQuestions, 
  diretorQuestions, 
  secretarioQuestions 
} from '@/data/formsData';
import { Question } from '@/types/forms';

// IDs de Education Stages pré-definidos para cada tipo de formulário
const EDUCATION_STAGE_IDS_BY_FORM_TYPE: Record<string, string[]> = {
  'aluno-jovem': [
    'd1142d12-ed98-46f4-ae78-62c963371464', // Educação Infantil
    '614b7d10-b758-42ec-a04e-86f78dc7740a', // Anos Iniciais
    '63cb6876-3221-4fa2-89e8-a82ad1733032', // EJA (filtrar períodos 1-5)
  ],
  'aluno-velho': [
    'c78fcd8e-00a1-485d-8c03-70bcf59e3025', // Anos Finais
    '63cb6876-3221-4fa2-89e8-a82ad1733032', // EJA (filtrar períodos 6-9)
  ],
};

// Função para determinar o tipo de formulário baseado na série
const determineFormTypeFromGrade = async (gradeId: string): Promise<string | null> => {
  if (!gradeId || gradeId === 'all') return null;

  try {
    // Buscar informações da série usando a nova rota de formulários
    const grade = await FormFiltersApiService.getFormGradeDetails(gradeId);

    if (!grade || (!grade.name && !grade.nome)) return null;

    const gradeName = (grade.name || grade.nome || '').toLowerCase();
    const educationStageId = grade.education_stage_id || grade.educationStageId;

    // Verificar por education stage ID
    if (educationStageId) {
      // Anos Iniciais
      if (EDUCATION_STAGE_IDS_BY_FORM_TYPE['aluno-jovem'].includes(educationStageId)) {
        // Se for EJA, verificar período
        if (educationStageId === '63cb6876-3221-4fa2-89e8-a82ad1733032') {
          // EJA: verificar se é período 1-5 (aluno-jovem) ou 6-9 (aluno-velho)
          const periodoMatch = gradeName.match(/(\d+)[°º]/);
          if (periodoMatch) {
            const periodo = parseInt(periodoMatch[1], 10);
            return periodo >= 1 && periodo <= 5 ? 'aluno-jovem' : 'aluno-velho';
          }
          // Se não conseguir determinar, verificar pelo nome
          if (/[1-5][°º]/.test(gradeName) || gradeName.includes('período 1') || gradeName.includes('período 2') || 
              gradeName.includes('período 3') || gradeName.includes('período 4') || gradeName.includes('período 5')) {
            return 'aluno-jovem';
          }
          return 'aluno-velho';
        }
        return 'aluno-jovem';
      }
      // Anos Finais
      if (EDUCATION_STAGE_IDS_BY_FORM_TYPE['aluno-velho'].includes(educationStageId)) {
        return 'aluno-velho';
      }
    }

    // Fallback: verificar pelo nome da série
    // Anos Iniciais (1º ao 5º ano, Educação Infantil)
    if (
      /^(1|2|3|4|5)[°º]/.test(gradeName) ||
      gradeName.includes('infantil') ||
      gradeName.includes('inicial') ||
      gradeName.includes('iniciais') ||
      (gradeName.includes('eja') && /[1-5][°º]/.test(gradeName))
    ) {
      return 'aluno-jovem';
    }

    // Anos Finais (6º ao 9º ano)
    if (
      /^(6|7|8|9)[°º]/.test(gradeName) ||
      gradeName.includes('final') ||
      gradeName.includes('finais') ||
      (gradeName.includes('eja') && /[6-9][°º]/.test(gradeName))
    ) {
      return 'aluno-velho';
    }

    return null;
  } catch (error) {
    console.error('Erro ao determinar tipo de formulário pela série:', error);
    return null;
  }
};

// Interfaces para os filtros
interface State {
  id: string;
  name: string;
  uf: string;
}

interface Municipality {
  id: string;
  name: string;
  state: string;
}

interface School {
  id: string;
  name: string;
}

interface Grade {
  id: string;
  name: string;
}

interface Class {
  id: string;
  name: string;
}

interface ListedForm {
  id: string;
  title: string;
  formType: string;
  description?: string;
  isActive: boolean;
  deadline?: string;
  totalQuestions?: number;
  recipientsCount?: number;
  sentAt?: string;
  statistics?: { totalRecipients?: number; completedResponses?: number; completionRate?: number };
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  selectedSchools?: string[];
  selectedGrades?: string[];
  selectedClasses?: string[];
}

const FormRegistration = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Estados dos filtros
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('all');
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]); // Array vazio = "Todas"
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]); // Array vazio = "Todas"
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]); // Array vazio = "Todas"

  // Estados dos dados dos filtros
  const [states, setStates] = useState<State[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  
  // Debug: Log quando municípios mudarem
  useEffect(() => {
    console.log('Estado de municípios atualizado:', municipalities.length, municipalities);
  }, [municipalities]);
  const [schools, setSchools] = useState<School[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);

  // Estados de loading
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);

  const [selectedFormType, setSelectedFormType] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formInstructions, setFormInstructions] = useState<string>('');
  const [formDeadline, setFormDeadline] = useState<string>('');

  // Estados para o editor de perguntas
  const [showQuestionEditor, setShowQuestionEditor] = useState(false);
  const [selectedFormTypeForEditor, setSelectedFormTypeForEditor] = useState<string | null>(null);
  const [availableQuestions, setAvailableQuestions] = useState<Question[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [searchQuestionTerm, setSearchQuestionTerm] = useState('');
  const [viewingQuestion, setViewingQuestion] = useState<Question | null>(null);

  // Ref para controlar resets em cascata
  const isRestoringFiltersRef = useRef(false);

  // Listagem de formulários cadastrados pelo usuário
  const [formsList, setFormsList] = useState<ListedForm[]>([]);
  const [formsPagination, setFormsPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [isLoadingForms, setIsLoadingForms] = useState(false);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [formToDeleteId, setFormToDeleteId] = useState<string | null>(null);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);

  const loadForms = useCallback(async (page = 1, limit = 20) => {
    try {
      setIsLoadingForms(true);
      const { data } = await api.get<{ data: ListedForm[]; pagination: typeof formsPagination }>('/forms', {
        params: { page, limit },
      });
      setFormsList(data.data || []);
      setFormsPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (err) {
      console.error('Erro ao carregar formulários:', err);
      setFormsList([]);
      toast({
        title: 'Erro ao carregar formulários',
        description: 'Não foi possível listar os questionários. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingForms(false);
    }
  }, [toast]);

  useEffect(() => {
    loadForms(formsPagination.page, formsPagination.limit);
  }, [loadForms]);

  const handleOpenDeleteConfirm = (formId: string) => {
    setFormToDeleteId(formId);
    setShowDeleteAlert(true);
  };

  const handleConfirmDeleteForm = useCallback(async () => {
    if (!formToDeleteId) return;
    try {
      setDeletingFormId(formToDeleteId);
      await api.delete(`/forms/${formToDeleteId}`);
      setShowDeleteAlert(false);
      setFormToDeleteId(null);
      toast({ title: 'Questionário excluído', description: 'O questionário foi excluído com sucesso.' });
      await loadForms(formsPagination.page, formsPagination.limit);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Não foi possível excluir o questionário.';
      toast({
        title: 'Erro ao excluir',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setDeletingFormId(null);
    }
  }, [formToDeleteId, loadForms, formsPagination.page, formsPagination.limit, toast]);

  const getFormTypeDisplayName = (formType: string): string => {
    const names: Record<string, string> = {
      'aluno-jovem': 'Anos iniciais e educação infantil',
      'aluno-velho': 'EJA e anos finais',
      professor: 'Professores',
      diretor: 'Diretor',
      secretario: 'Secretário',
    };
    return names[formType] || formType;
  };

  // Carregar estados iniciais
  useEffect(() => {
    const loadInitialFilters = async () => {
      try {
        setIsLoadingFilters(true);
        const statesData = await FormFiltersApiService.getFormFilterStates();
        if (statesData && statesData.length > 0) {
          setStates(statesData.map(state => ({
            id: state.id,
            name: state.nome,
            uf: state.id
          })));
        }
      } catch (error) {
        console.error("Erro ao carregar filtros iniciais:", error);
        toast({
          title: "Erro ao carregar filtros",
          description: "Não foi possível carregar os filtros. Tente novamente.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingFilters(false);
      }
    };

    loadInitialFilters();
  }, [toast]);

  // Helpers de reset em cascata
  const resetAfterMunicipality = useCallback(() => {
    setSelectedSchools([]);
    setSchools([]);
    resetAfterSchool();
  }, []);

  const resetAfterSchool = useCallback(() => {
    setSelectedGrades([]);
    setGrades([]);
    resetAfterGrade();
  }, []);

  const resetAfterGrade = useCallback(() => {
    setSelectedClasses([]);
    setClasses([]);
  }, []);

  const resetAfterState = useCallback(() => {
    // Não limpar municípios aqui, apenas resetar seleção
    // Os municípios serão carregados pelo useEffect
    setSelectedMunicipality('all');
    resetAfterMunicipality();
  }, [resetAfterMunicipality]);

  // Carregar municípios quando estado for selecionado
  useEffect(() => {
    const loadMunicipalities = async () => {
      if (selectedState !== 'all') {
        try {
          setIsLoadingFilters(true);
          
          // Resetar seleção de município antes de carregar novos (se não estiver restaurando)
          if (!isRestoringFiltersRef.current) {
            setSelectedMunicipality('all');
            resetAfterMunicipality();
          }
          
          const municipalitiesData = await FormFiltersApiService.getFormFilterMunicipalities(selectedState);
          console.log('Municípios recebidos da API:', municipalitiesData);
          
          const mappedMunicipalities = municipalitiesData.map(municipality => ({
            id: municipality.id,
            name: municipality.nome,
            state: selectedState
          }));
          
          console.log('Municípios mapeados:', mappedMunicipalities);
          console.log('Quantidade de municípios:', mappedMunicipalities.length);
          setMunicipalities(mappedMunicipalities);
        } catch (error) {
          console.error("Erro ao carregar municípios:", error);
          setMunicipalities([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setMunicipalities([]);
        if (!isRestoringFiltersRef.current) {
          resetAfterState();
        }
      }
    };

    loadMunicipalities();
  }, [selectedState, resetAfterState, resetAfterMunicipality]);

  // Carregar escolas quando município for selecionado
  useEffect(() => {
    const loadSchools = async () => {
      if (selectedState !== 'all' && selectedMunicipality !== 'all') {
        try {
          setIsLoadingFilters(true);
          const schoolsData = await FormFiltersApiService.getFormFilterSchools({
            estado: selectedState,
            municipio: selectedMunicipality
          });
          
          // Remover duplicatas por ID e por nome
          const uniqueSchoolsById = new Map<string, { id: string; name: string }>();
          const uniqueSchoolsByName = new Map<string, string>();
          
          schoolsData.forEach(school => {
            const schoolName = school.nome?.trim() || '';
            const normalizedName = schoolName.toLowerCase().trim();
            
            if (!uniqueSchoolsById.has(school.id) && !uniqueSchoolsByName.has(normalizedName)) {
              uniqueSchoolsById.set(school.id, {
                id: school.id,
                name: schoolName
              });
              uniqueSchoolsByName.set(normalizedName, school.id);
            }
          });
          
          // Converter para array e ordenar por nome
          const uniqueSchools = Array.from(uniqueSchoolsById.values()).sort((a, b) => 
            a.name.localeCompare(b.name)
          );
          
          setSchools(uniqueSchools);
          // Não resetar seleções automaticamente - permitir múltiplas seleções
        } catch (error) {
          console.error("Erro ao carregar escolas:", error);
          setSchools([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setSchools([]);
        if (!isRestoringFiltersRef.current) {
          setSelectedSchools([]);
        }
      }
    };

    loadSchools();
  }, [selectedMunicipality, selectedState]);

  // Carregar séries quando escola(s) for(em) selecionada(s)
  useEffect(() => {
    const loadGrades = async () => {
      if (selectedState !== 'all' && selectedMunicipality !== 'all' && selectedSchools.length > 0) {
        try {
          setIsLoadingFilters(true);
          // Carregar séries para todas as escolas selecionadas
          // Se múltiplas escolas, fazer requisições e unir resultados
          const allGradesById = new Map<string, { id: string; name: string }>();
          const allGradesByName = new Map<string, string>(); // Para detectar duplicatas por nome
          
          for (const schoolId of selectedSchools) {
            try {
              const gradesData = await FormFiltersApiService.getFormFilterGrades({
                estado: selectedState,
                municipio: selectedMunicipality,
                escola: schoolId
              });
              gradesData.forEach(grade => {
                const gradeName = grade.nome?.trim() || '';
                // Verificar se já existe por ID ou por nome (normalizado)
                const normalizedName = gradeName.toLowerCase().trim();
                
                if (!allGradesById.has(grade.id) && !allGradesByName.has(normalizedName)) {
                  allGradesById.set(grade.id, {
                    id: grade.id,
                    name: gradeName
                  });
                  allGradesByName.set(normalizedName, grade.id);
                }
              });
            } catch (error) {
              console.error(`Erro ao carregar séries da escola ${schoolId}:`, error);
            }
          }
          
          // Converter para array e ordenar por nome
          const uniqueGrades = Array.from(allGradesById.values()).sort((a, b) => 
            a.name.localeCompare(b.name)
          );
          
          setGrades(uniqueGrades);
        } catch (error) {
          console.error("Erro ao carregar séries:", error);
          setGrades([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        // Se nenhuma escola selecionada, limpar séries
        setGrades([]);
      }
    };

    loadGrades();
  }, [selectedSchools, selectedState, selectedMunicipality]);

  // Função para obter dados do formulário baseado no tipo
  const getFormData = useCallback((formType: string) => {
    switch (formType) {
      case 'aluno-jovem':
        return {
          name: 'Formulário socioeconômico para anos iniciais e educação infantil',
          description: 'Questionário socioeconômico para estudantes da Educação Infantil e anos iniciais do Ensino Fundamental (1º ao 5º ano).',
          questions: questionsAlunoJovem,
          icon: Users,
          color: 'bg-blue-500'
        };
      case 'aluno-velho':
        return {
          name: 'Formulário socioeconômico para EJA e anos finais',
          description: 'Questionário socioeconômico para estudantes dos anos finais do Ensino Fundamental (6º ao 9º ano) e EJA do 1º ao 9º período.',
          questions: questionsAlunoVelho,
          icon: GraduationCap,
          color: 'bg-green-500'
        };
      case 'professor':
        return {
          name: 'Formulário socioeconômico para professores',
          description: 'Questionário socioeconômico, de caracterização e condições de trabalho para professores da Educação Básica.',
          questions: professorQuestions,
          icon: UserCheck,
          color: 'bg-purple-500'
        };
      case 'diretor':
        return {
          name: 'Diretor',
          description: 'Questionário de caracterização da escola e condições de gestão para diretores escolares.',
          questions: diretorQuestions,
          icon: Building2,
          color: 'bg-orange-500'
        };
      case 'secretario':
        return {
          name: 'Secretário Municipal de Educação',
          description: 'Questionário de caracterização e gestão educacional para secretários municipais de educação.',
          questions: secretarioQuestions,
          icon: Shield,
          color: 'bg-indigo-500'
        };
      default:
        return null;
    }
  }, []);

  // Carregar turmas quando série(s) for(em) selecionada(s)
  useEffect(() => {
    const loadClasses = async () => {
      if (selectedState !== 'all' && selectedMunicipality !== 'all' && selectedSchools.length > 0 && selectedGrades.length > 0) {
        try {
          setIsLoadingFilters(true);
          // Carregar turmas para todas as combinações escola-série selecionadas
          const allClassesById = new Map<string, { id: string; name: string }>();
          const allClassesByName = new Map<string, string>(); // Para detectar duplicatas por nome
          
          for (const schoolId of selectedSchools) {
            for (const gradeId of selectedGrades) {
              try {
                const classesData = await FormFiltersApiService.getFormFilterClasses({
                  estado: selectedState,
                  municipio: selectedMunicipality,
                  escola: schoolId,
                  serie: gradeId
                });
                classesData.forEach(classItem => {
                  const className = classItem.nome?.trim() || '';
                  // Verificar se já existe por ID ou por nome (normalizado)
                  const normalizedName = className.toLowerCase().trim();
                  
                  if (!allClassesById.has(classItem.id) && !allClassesByName.has(normalizedName)) {
                    allClassesById.set(classItem.id, {
                      id: classItem.id,
                      name: className
                    });
                    allClassesByName.set(normalizedName, classItem.id);
                  }
                });
              } catch (error) {
                console.error(`Erro ao carregar turmas da escola ${schoolId} e série ${gradeId}:`, error);
              }
            }
          }
          
          // Converter para array e ordenar por nome
          const uniqueClasses = Array.from(allClassesById.values()).sort((a, b) => 
            a.name.localeCompare(b.name)
          );
          
          setClasses(uniqueClasses);
        } catch (error) {
          console.error("Erro ao carregar turmas:", error);
          setClasses([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setClasses([]);
      }
    };

    loadClasses();
  }, [selectedGrades, selectedSchools, selectedState, selectedMunicipality]);

  // Limpar informações adicionais quando o tipo de formulário é desmarcado
  useEffect(() => {
    if (!selectedFormType) {
      setFormTitle('');
      setFormDescription('');
      setFormInstructions('');
      setFormDeadline('');
    }
  }, [selectedFormType]);

  // Função para abrir editor de perguntas
  const handleOpenQuestionEditor = (formType: string) => {
    const formData = getFormData(formType);
    if (!formData) return;

    setSelectedFormTypeForEditor(formType);
    setAvailableQuestions(formData.questions);
    // Inicializar com todas as perguntas selecionadas
    setSelectedQuestionIds(new Set(formData.questions.map(q => q.id)));
    setSearchQuestionTerm('');
    setShowQuestionEditor(true);
  };

  // Função para alternar seleção de pergunta
  const toggleQuestionSelection = (questionId: string) => {
    setSelectedQuestionIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  };

  // Função para selecionar/deselecionar todas as perguntas
  const toggleAllQuestions = () => {
    if (selectedQuestionIds.size === filteredQuestions.length) {
      setSelectedQuestionIds(new Set());
    } else {
      setSelectedQuestionIds(new Set(filteredQuestions.map(q => q.id)));
    }
  };

  // Função para restaurar todas as perguntas
  const restoreAllQuestions = () => {
    setSelectedQuestionIds(new Set(availableQuestions.map(q => q.id)));
  };

  // Filtrar perguntas por termo de busca
  const filteredQuestions = useMemo(() => {
    if (!searchQuestionTerm.trim()) {
      return availableQuestions;
    }
    const term = searchQuestionTerm.toLowerCase();
    return availableQuestions.filter(q => {
      const text = (q.texto || q.text || '').toLowerCase();
      return text.includes(term);
    });
  }, [availableQuestions, searchQuestionTerm]);

  // Função para enviar formulário
  const handleSendForm = async () => {
    const formTypeToUse = selectedFormType;
    
    if (!formTypeToUse) {
      toast({
        title: "Erro",
        description: "Selecione um tipo de formulário antes de enviar.",
        variant: "destructive",
      });
      return;
    }

    if (selectedState === 'all' || selectedMunicipality === 'all' || selectedSchools.length === 0) {
      toast({
        title: "Erro",
        description: "Selecione Estado, Município e pelo menos uma Escola para enviar o formulário.",
        variant: "destructive",
      });
      return;
    }

    // Para formulários de alunos, garantir que as séries selecionadas (quando houver) são compatíveis com o tipo escolhido
    if ((formTypeToUse === 'aluno-jovem' || formTypeToUse === 'aluno-velho')) {
      // Se nenhuma série foi selecionada, o formulário será enviado para todas as séries da(s) escola(s)
      // Somente se houver séries selecionadas é que validamos compatibilidade com o tipo (anos iniciais vs finais/EJA)
      if (selectedGrades.length > 0) {
        try {
          const incompatibleGrades: string[] = [];

          for (const gradeId of selectedGrades) {
            const detectedType = await determineFormTypeFromGrade(gradeId);
            if (!detectedType || detectedType !== formTypeToUse) {
              incompatibleGrades.push(gradeId);
            }
          }

          if (incompatibleGrades.length > 0) {
            toast({
              title: "Séries incompatíveis com o formulário selecionado",
              description: "Remova as séries que não pertencem ao público-alvo deste formulário (anos iniciais/Educação Infantil ou EJA/anos finais) e tente novamente.",
              variant: "destructive",
            });
            return;
          }
        } catch (error) {
          console.error('Erro ao validar séries para o tipo de formulário selecionado:', error);
          toast({
            title: "Erro ao validar séries",
            description: "Não foi possível validar as séries selecionadas. Tente novamente.",
            variant: "destructive",
          });
          return;
        }
      }
    }

    // Preparar payload
    const formData = getFormData(formTypeToUse);
    if (!formData) return;

    // Usar perguntas selecionadas ou todas se não houver seleção específica
    const questionsToSend = selectedQuestionIds.size > 0 && selectedFormTypeForEditor === formTypeToUse
      ? formData.questions.filter(q => selectedQuestionIds.has(q.id))
      : formData.questions;

    // Normalizar perguntas para o formato do backend (formato da API)
    const normalizedQuestions = questionsToSend.map((q, index) => {
      const baseQuestion: any = {
        id: q.id,
        text: q.texto || q.text || '',
        type: q.tipo || q.type || 'selecao_unica',
        required: q.obrigatoria !== undefined ? q.obrigatoria : true,
        order: index + 1
      };

      // Adicionar opções se existirem
      if (q.opcoes || q.options) {
        baseQuestion.options = q.opcoes || q.options || [];
      }

      // Adicionar sub-perguntas se existirem
      if (q.subPerguntas || q.subQuestions) {
        baseQuestion.subQuestions = (q.subPerguntas || q.subQuestions || []).map((sp: any) => ({
          id: sp.id,
          text: sp.texto || sp.text || ''
        }));
      }

      // Adicionar campos opcionais se existirem
      if (q.min !== undefined) baseQuestion.min = q.min;
      if (q.max !== undefined) baseQuestion.max = q.max;
      if (q.dependsOn) baseQuestion.dependsOn = q.dependsOn;

      return baseQuestion;
    });

    if (!formTitle.trim()) {
      toast({
        title: "Erro",
        description: "O título do formulário é obrigatório.",
        variant: "destructive",
      });
      return;
    }

    // Validar data de expiração (obrigatória)
    if (!formDeadline.trim()) {
      toast({
        title: "Erro",
        description: "A data de expiração do formulário é obrigatória.",
        variant: "destructive",
      });
      return;
    }

    // Payload conforme spec POST /forms: formType + selectedSchools; séries/turmas só se preenchidos
    const payload: any = {
      formType: formTypeToUse,
      selectedSchools,
      isActive: true,
      questions: normalizedQuestions,
    };

    if (selectedGrades.length > 0) payload.selectedGrades = selectedGrades;
    if (selectedClasses.length > 0) payload.selectedClasses = selectedClasses;
    payload.title = formTitle.trim();
    if (formDescription.trim()) payload.description = formDescription.trim();
    if (formInstructions.trim()) payload.instructions = formInstructions.trim();
    if (formDeadline.trim()) {
      try {
        const deadlineDate = new Date(formDeadline);
        if (!isNaN(deadlineDate.getTime())) {
          payload.deadline = deadlineDate.toISOString();
        }
      } catch (error) {
        console.error('Erro ao processar data de expiração:', error);
      }
    }

    try {
      // Enviar para o backend usando a rota correta (admin: enviar contexto de cidade)
      const postConfig = selectedMunicipality !== 'all' ? { meta: { cityId: selectedMunicipality } } : {};
      const response = await api.post('/forms', payload, postConfig);
      const data = response.data;

      let successMessage: string;
      if (data?.forms && Array.isArray(data.forms)) {
        const totalRecipients = data.forms.reduce((sum: number, f: any) => sum + (f.recipientsCount || 0), 0);
        successMessage = data.message || `${data.forms.length} formulário(s) criado(s) com sucesso.`;
        if (totalRecipients > 0) {
          successMessage += ` ${totalRecipients} destinatário(s) notificado(s).`;
        }
      } else {
        const recipientsCount = data?.recipientsCount;
        successMessage = recipientsCount
          ? `Formulário criado e enviado com sucesso! ${recipientsCount} destinatário${recipientsCount !== 1 ? 's' : ''} notificado${recipientsCount !== 1 ? 's' : ''}.`
          : "Formulário criado com sucesso!";
      }

      const warnings = data?.warnings;
      if (warnings && Array.isArray(warnings) && warnings.length > 0) {
        successMessage += "\n\nAvisos: " + warnings.join(" ");
      }

      toast({
        title: "Sucesso!",
        description: successMessage,
      });

      await loadForms(formsPagination.page, formsPagination.limit);

      // Limpar seleções após sucesso (opcional)
      // setSelectedState('all');
      // setSelectedMunicipality('all');
      // setSelectedSchool('all');
      // setSelectedGrade('all');
      // setSelectedClass('all');
    } catch (error: any) {
      console.error('Erro ao enviar formulário:', error);
      toast({
        title: "Erro ao enviar formulário",
        description: error.response?.data?.message || "Não foi possível enviar o formulário. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  // Dados mockados dos tipos de questionários (para exibição quando não há série selecionada)
  const formTypes: FormType[] = [
    {
      id: 'aluno-jovem',
      name: 'Formulário socioeconômico para anos iniciais e educação infantil',
      description: 'Questionário socioeconômico para estudantes da Educação Infantil e anos iniciais do Ensino Fundamental (1º ao 5º ano).',
      targetAudience: 'Estudantes de 6 a 11 anos',
      educationLevel: 'Anos Iniciais, EJA Inicial, Educação Infantil',
      questions: [],
      icon: 'Users',
      color: 'bg-blue-500',
      ageRange: '6-11 anos',
      gradeRange: '1° ao 5° ano',
      specialBadge: 'Infantil'
    },
    {
      id: 'aluno-velho',
      name: 'Formulário socioeconômico para EJA e anos finais',
      description: 'Questionário socioeconômico para estudantes dos anos finais do Ensino Fundamental (6º ao 9º ano) e EJA do 1º ao 9º período.',
      targetAudience: 'Estudantes de 12 a 17 anos',
      educationLevel: 'Anos Finais, EJA Avançado',
      questions: [],
      icon: 'GraduationCap',
      color: 'bg-green-500',
      ageRange: '12-17 anos',
      gradeRange: '6° ao 9° ano',
      specialBadge: 'Adolescente'
    },
    {
      id: 'professor',
      name: 'Formulário socioeconômico para professores',
      description: 'Questionário socioeconômico, de caracterização e condições de trabalho para professores da Educação Básica.',
      targetAudience: 'Professores da Educação Básica',
      educationLevel: 'Todos os níveis',
      questions: [],
      icon: 'UserCheck',
      color: 'bg-purple-500'
    },
    {
      id: 'diretor',
      name: 'Diretor',
      description: 'Questionário de caracterização da escola e condições de gestão para diretores escolares.',
      targetAudience: 'Diretores de escolas',
      educationLevel: 'Todos os níveis',
      questions: [],
      icon: 'Building2',
      color: 'bg-orange-500'
    },
    {
      id: 'secretario',
      name: 'Secretário Municipal de Educação',
      description: 'Questionário de caracterização e gestão educacional para secretários municipais de educação.',
      targetAudience: 'Secretários Municipais de Educação',
      educationLevel: 'Gestão Municipal',
      questions: [],
      icon: 'Shield',
      color: 'bg-indigo-500'
    }
  ];

  const getIcon = (iconName: string) => {
    const icons = {
      Users,
      GraduationCap,
      UserCheck,
      Building2,
      Shield
    };
    return icons[iconName as keyof typeof icons] || Users;
  };

  // Função para formatar o tipo de pergunta de forma legível
  const formatQuestionType = (tipo: string | undefined): string => {
    if (!tipo) return '';
    
    const typeMap: Record<string, string> = {
      'selecao_unica': 'Seleção Única',
      'multipla_escolha': 'Múltipla Escolha',
      'matriz_selecao': 'Matriz de Seleção',
      'textarea': 'Texto Livre',
      'slider': 'Slider',
      'multipleChoice': 'Múltipla Escolha',
      'open': 'Texto Aberto',
      'trueFalse': 'Verdadeiro/Falso'
    };
    
    return typeMap[tipo.toLowerCase()] || tipo;
  };

  // Obter dados do formulário determinado ou selecionado
  const formTypeToShow = selectedFormType;
  const formDataToShow = formTypeToShow ? getFormData(formTypeToShow) : null;

  return (
    <div className="container mx-auto space-y-4 px-3 py-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
            <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 shrink-0" />
            Cadastro de Questionários
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Selecione os filtros para determinar o público-alvo e configure o questionário
          </p>
        </div>
      </div>

      {/* Formulários já cadastrados pelo usuário */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Formulários cadastrados
          </CardTitle>
          <CardDescription>
            Questionários criados por você. O servidor retorna apenas os formulários do usuário logado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingForms ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : formsList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum questionário cadastrado ainda. Selecione um tipo abaixo e preencha os filtros para criar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium">Título</th>
                    <th className="text-left py-3 px-2 font-medium">Tipo</th>
                    <th className="text-left py-3 px-2 font-medium">Prazo</th>
                    <th className="text-left py-3 px-2 font-medium">Destinatários</th>
                    <th className="text-left py-3 px-2 font-medium">Status</th>
                    <th className="text-right py-3 px-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {formsList.map((form) => (
                    <tr key={form.id} className="border-b last:border-0">
                      <td className="py-3 px-2 max-w-[240px] truncate" title={form.title}>{form.title}</td>
                      <td className="py-3 px-2">{getFormTypeDisplayName(form.formType)}</td>
                      <td className="py-3 px-2">
                        {form.deadline
                          ? new Date(form.deadline).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                          : '—'}
                      </td>
                      <td className="py-3 px-2">
                        {form.recipientsCount != null
                          ? `${form.statistics?.completedResponses ?? 0}/${form.recipientsCount}`
                          : '—'}
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={form.isActive ? 'default' : 'secondary'}>
                          {form.isActive ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleOpenDeleteConfirm(form.id)}
                          disabled={deletingFormId === form.id}
                        >
                          {deletingFormId === form.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          <span className="ml-1.5">Excluir</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {formsPagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Página {formsPagination.page} de {formsPagination.totalPages} ({formsPagination.total} no total)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={formsPagination.page <= 1}
                  onClick={() => loadForms(formsPagination.page - 1, formsPagination.limit)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={formsPagination.page >= formsPagination.totalPages}
                  onClick={() => loadForms(formsPagination.page + 1, formsPagination.limit)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seleção de tipo de formulário */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Selecione o tipo de formulário
          </CardTitle>
          <CardDescription>
            Primeiro escolha qual formulário socioeconômico deseja enviar e, em seguida, defina os filtros de destinatários.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {formTypes.map((formType) => {
              const Icon = getIcon(formType.icon);
              const isSelected = selectedFormType === formType.id;

              return (
                <Card
                  key={formType.id}
                  className={`cursor-pointer transition-all ${
                    isSelected
                      ? 'border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                      : 'border hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedFormType(formType.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-lg ${formType.color}`}>
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{formType.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formType.description}
                        </p>
                      </div>
                      {isSelected && (
                        <Check className="h-5 w-5 text-blue-600" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros de Destinatários
          </CardTitle>
          <CardDescription>
            Selecione Estado, Município, Escola e Série para determinar o tipo de formulário
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Estado */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado *</label>
              <Select
                value={selectedState}
                onValueChange={setSelectedState}
                disabled={isLoadingFilters}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {states.map(state => (
                    <SelectItem key={state.id} value={state.id}>
                      {state.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Município */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Município *</label>
              <Select
                key={`municipality-${selectedState}-${municipalities.length}`}
                value={selectedMunicipality}
                onValueChange={setSelectedMunicipality}
                disabled={isLoadingFilters || selectedState === 'all'}
              >
                <SelectTrigger>
                  <SelectValue placeholder={
                    isLoadingFilters 
                      ? "Carregando municípios..." 
                      : municipalities.length === 0 
                        ? "Nenhum município disponível" 
                        : "Selecione o município"
                  } />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {municipalities.length > 0 ? (
                    municipalities.map(municipality => (
                      <SelectItem key={municipality.id} value={municipality.id}>
                        {municipality.name}
                      </SelectItem>
                    ))
                  ) : (
                    !isLoadingFilters && selectedState !== 'all' && (
                      <SelectItem value="no-data" disabled>
                        Nenhum município encontrado
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              {municipalities.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {municipalities.length} município{municipalities.length !== 1 ? 's' : ''} disponível{municipalities.length !== 1 ? 'eis' : ''}
                </p>
              )}
            </div>

            {/* Escola */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Escola(s) *</label>
              <FormMultiSelect
                options={schools.map(school => ({ id: school.id, name: school.name }))}
                selected={selectedSchools}
                onChange={setSelectedSchools}
                placeholder={selectedSchools.length === 0 ? "Selecione escolas" : `${selectedSchools.length} selecionada(s)`}
              />
              {selectedSchools.length === 0 && selectedMunicipality !== 'all' && (
                <p className="text-xs text-muted-foreground">
                  Selecione pelo menos uma escola
                </p>
              )}
            </div>

            {/* Série */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Série(s)</label>
              <FormMultiSelect
                options={grades.map(grade => ({ id: grade.id, name: grade.name }))}
                selected={selectedGrades}
                onChange={setSelectedGrades}
                placeholder={selectedGrades.length === 0 ? "Selecione séries (opcional)" : `${selectedGrades.length} selecionada(s)`}
              />
              {selectedSchools.length > 0 && selectedGrades.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Deixe vazio para enviar a todas as séries
                </p>
              )}
            </div>

            {/* Turma */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Turma(s)</label>
              <FormMultiSelect
                options={classes.map(classItem => ({ id: classItem.id, name: classItem.name }))}
                selected={selectedClasses}
                onChange={setSelectedClasses}
                placeholder={selectedClasses.length === 0 ? "Selecione turmas (opcional)" : `${selectedClasses.length} selecionada(s)`}
              />
              {selectedGrades.length > 0 && selectedClasses.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Deixe vazio para enviar a todas as turmas
                </p>
              )}
            </div>
          </div>

          {/* Informação sobre filtros */}
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-400">
              💡 <strong>Hierarquia dos Filtros:</strong> Estado → Município → Escola → Série → Turma
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
              <strong>Estado</strong> e <strong>Município</strong> são obrigatórios. Você pode selecionar <strong>múltiplas Escolas, Séries e Turmas</strong>.
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
              Deixe <strong>Série</strong> ou <strong>Turma</strong> vazios para enviar a todas.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Formulário determinado pela série OU selecionado manualmente */}
      {formTypeToShow && formDataToShow && (
        <Card className="border-2 border-blue-500">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-lg ${formDataToShow.color}`}>
                  <formDataToShow.icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle>{formDataToShow.name}</CardTitle>
                  <CardDescription className="mt-1">
                    {formDataToShow.description}
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Campos de informações do formulário */}
              <div className="space-y-4 border-b pb-4">
                <div className="space-y-2">
                  <Label htmlFor="form-title" className="text-sm font-medium">
                    Título do Formulário <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="form-title"
                    placeholder="Digite o título do formulário"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="form-description" className="text-sm font-medium">
                    Descrição
                  </Label>
                  <Input
                    id="form-description"
                    placeholder="Digite a descrição do formulário (opcional)"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="form-instructions" className="text-sm font-medium">
                    Instruções
                  </Label>
                  <textarea
                    id="form-instructions"
                    placeholder="Digite as instruções para preenchimento do formulário (opcional)"
                    value={formInstructions}
                    onChange={(e) => setFormInstructions(e.target.value)}
                    className="w-full min-h-[80px] px-3 py-2 text-sm border border-input bg-background rounded-md ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="form-deadline" className="text-sm font-medium">
                    Data de Expiração <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="form-deadline"
                    type="datetime-local"
                    placeholder="Selecione a data e hora de expiração"
                    value={formDeadline}
                    onChange={(e) => setFormDeadline(e.target.value)}
                    className="w-full"
                    min={new Date().toISOString().slice(0, 16)}
                  />
                  {formDeadline && (
                    <p className="text-xs text-muted-foreground">
                      O formulário expirará em: {new Date(formDeadline).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Target className="h-4 w-4" />
                <span>
                  Total de perguntas: {
                    selectedQuestionIds.size > 0 && selectedFormTypeForEditor === formTypeToShow
                      ? selectedQuestionIds.size
                      : formDataToShow.questions.length
                  }
                  {selectedQuestionIds.size > 0 && selectedFormTypeForEditor === formTypeToShow && (
                    <span className="text-muted-foreground ml-1">
                      (de {formDataToShow.questions.length} disponíveis)
                    </span>
                  )}
                </span>
              </div>
              
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => handleOpenQuestionEditor(formTypeToShow)}
                    className="flex items-center justify-center gap-2"
                >
                  <CheckSquare className="h-4 w-4" />
                  Editar Perguntas
                </Button>
                <Button
                  onClick={handleSendForm}
                  className="flex items-center justify-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  Enviar Formulário
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mensagem quando não há filtros suficientes */}
      {(selectedState === 'all' || selectedMunicipality === 'all' || selectedSchools.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Filter className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              Selecione os filtros obrigatórios
            </h3>
            <p className="text-muted-foreground text-center max-w-md">
              Para criar um questionário, você precisa selecionar: <strong>Estado</strong>, <strong>Município</strong> e pelo menos uma <strong>Escola</strong>.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Dialog de Editor de Perguntas */}
      <Dialog open={showQuestionEditor} onOpenChange={setShowQuestionEditor}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              Editor de Perguntas
            </DialogTitle>
            <DialogDescription>
              Selecione as perguntas que deseja incluir no questionário. 
              {selectedFormTypeForEditor && (
                <span className="ml-1">
                  Total: {availableQuestions.length} perguntas disponíveis
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col space-y-4">
            {/* Barra de busca e ações */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar perguntas..."
                  value={searchQuestionTerm}
                  onChange={(e) => setSearchQuestionTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAllQuestions}
                className="flex items-center gap-2"
              >
                {selectedQuestionIds.size === filteredQuestions.length ? (
                  <>
                    <Square className="h-4 w-4" />
                    Desmarcar Todas
                  </>
                ) : (
                  <>
                    <CheckSquare className="h-4 w-4" />
                    Marcar Todas
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={restoreAllQuestions}
                className="flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Restaurar Todas
              </Button>
            </div>

            {/* Contador de seleção */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {selectedQuestionIds.size} de {filteredQuestions.length} perguntas selecionadas
              </span>
              {selectedQuestionIds.size < filteredQuestions.length && (
                <Badge variant="outline">
                  {filteredQuestions.length - selectedQuestionIds.size} removidas
                </Badge>
              )}
            </div>

            {/* Lista de perguntas */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {filteredQuestions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma pergunta encontrada
                </div>
              ) : (
                filteredQuestions.map((question) => {
                  const isSelected = selectedQuestionIds.has(question.id);
                  const questionText = question.texto || question.text || '';
                  const questionType = question.tipo || question.type || '';
                  const formattedType = formatQuestionType(questionType);

                  return (
                    <div
                      key={question.id}
                      className={`p-4 border rounded-lg transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700'
                          : 'bg-card dark:bg-card border-gray-200 dark:border-border hover:bg-muted dark:hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div 
                          className="mt-1 cursor-pointer"
                          onClick={() => toggleQuestionSelection(question.id)}
                        >
                          {isSelected ? (
                            <CheckSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Square className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div 
                          className="flex-1 cursor-pointer"
                          onClick={() => toggleQuestionSelection(question.id)}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-muted-foreground">
                              {question.id}
                            </span>
                            {question.obrigatoria !== false && (
                              <Badge variant="outline" className="text-xs">
                                Obrigatória
                              </Badge>
                            )}
                            {formattedType && (
                              <Badge variant="secondary" className="text-xs">
                                {formattedType}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-foreground dark:text-gray-100 line-clamp-2">
                            {questionText}
                          </p>
                          {(question.subPerguntas || question.subQuestions) && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {question.subPerguntas?.length || question.subQuestions?.length || 0} sub-pergunta{(question.subPerguntas?.length || question.subQuestions?.length || 0) !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingQuestion(question);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Rodapé com ações */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {selectedQuestionIds.size > 0 ? (
                <span>
                  {selectedQuestionIds.size} pergunta{selectedQuestionIds.size !== 1 ? 's' : ''} será{selectedQuestionIds.size === 1 ? '' : 'ão'} enviada{selectedQuestionIds.size === 1 ? '' : 's'}
                </span>
              ) : (
                <span className="text-red-600 dark:text-red-400">
                  Nenhuma pergunta selecionada
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowQuestionEditor(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  setShowQuestionEditor(false);
                  toast({
                    title: "Perguntas atualizadas",
                    description: `${selectedQuestionIds.size} pergunta(s) selecionada(s)`,
                  });
                }}
                disabled={selectedQuestionIds.size === 0}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para visualizar detalhes da pergunta */}
      <Dialog open={!!viewingQuestion} onOpenChange={() => setViewingQuestion(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Detalhes da Pergunta
            </DialogTitle>
            <DialogDescription>
              Visualização completa da pergunta e suas opções
            </DialogDescription>
          </DialogHeader>

          {viewingQuestion && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {/* ID e Tipo */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {viewingQuestion.id}
                </span>
                {viewingQuestion.obrigatoria !== false && (
                  <Badge variant="outline" className="text-xs">
                    Obrigatória
                  </Badge>
                )}
                {(viewingQuestion.tipo || viewingQuestion.type) && (
                  <Badge variant="secondary" className="text-xs">
                    {formatQuestionType(viewingQuestion.tipo || viewingQuestion.type)}
                  </Badge>
                )}
              </div>

              {/* Texto da Pergunta */}
              <div>
                <Label className="text-sm font-medium text-foreground dark:text-gray-300 mb-2 block">
                  Pergunta:
                </Label>
                <p className="text-base text-foreground dark:text-gray-100">
                  {viewingQuestion.texto || viewingQuestion.text || 'Sem texto'}
                </p>
              </div>

              {/* Opções */}
              {(viewingQuestion.opcoes || viewingQuestion.options) && (
                <div>
                  <Label className="text-sm font-medium text-foreground dark:text-gray-300 mb-2 block">
                    Opções de Resposta:
                  </Label>
                  <div className="space-y-2">
                    {(viewingQuestion.opcoes || viewingQuestion.options || []).map((opcao: string, index: number) => (
                      <div
                        key={index}
                        className="p-2 bg-muted dark:bg-card rounded border border-gray-200 dark:border-border"
                      >
                        <span className="text-sm text-foreground dark:text-gray-300">
                          {index + 1}. {opcao}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sub-perguntas */}
              {(viewingQuestion.subPerguntas || viewingQuestion.subQuestions) && (
                <div>
                  <Label className="text-sm font-medium text-foreground dark:text-gray-300 mb-2 block">
                    Sub-perguntas:
                  </Label>
                  <div className="space-y-2">
                    {(viewingQuestion.subPerguntas || viewingQuestion.subQuestions || []).map((subPergunta: any, index: number) => (
                      <div
                        key={subPergunta.id || index}
                        className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-800"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                            {subPergunta.id || `Sub-${index + 1}`}:
                          </span>
                          <span className="text-sm text-foreground dark:text-gray-300">
                            {subPergunta.texto || subPergunta.text || 'Sem texto'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Informações adicionais */}
              <div className="pt-4 border-t space-y-2">
                <div className="text-xs text-muted-foreground">
                  <strong>Tipo:</strong> {formatQuestionType(viewingQuestion.tipo || viewingQuestion.type) || 'Não especificado'}
                </div>
                {viewingQuestion.obrigatoria !== undefined && (
                  <div className="text-xs text-muted-foreground">
                    <strong>Obrigatória:</strong> {viewingQuestion.obrigatoria ? 'Sim' : 'Não'}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setViewingQuestion(null)}
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão de questionário */}
      <AlertDialog open={showDeleteAlert} onOpenChange={(open) => { setShowDeleteAlert(open); if (!open) setFormToDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir questionário</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente excluir este questionário? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteForm}
              disabled={!!deletingFormId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingFormId ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FormRegistration;
