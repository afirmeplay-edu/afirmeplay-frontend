import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DisciplineTag } from '@/components/ui/discipline-tag';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, FileCheck, Book, Eye, Trash2, Plus, School, Search, X, AlertCircle, Users, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/authContext';
import { EvaluationFormData, Question, Subject } from '../types';
import { ClassInfo } from '@/types/evaluation-types';
import { QuestionBank } from '../QuestionBank';
import QuestionPreview from '../questions/QuestionPreview';
import QuestionFormReadOnly from '../questions/QuestionFormReadOnly';
import { useEvaluationActions, useQuestions, useQuestionActions } from '@/stores/useEvaluationStore';
import { useEvaluationsManager } from '@/hooks/use-cache';
import { useNavigate } from 'react-router-dom';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../results/constants';
import { mapEvaluationQuestionOptions } from '@/utils/questionOptionImages';

interface CreateEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  evaluationId?: string; // Para modo de edição
  initialData?: EvaluationFormData | null;
}

interface Course {
  id: string;
  name: string;
}

interface Grade {
  id: string;
  name: string;
}

interface State {
  id: string;
  name: string;
}

interface Municipality {
  id: string;
  name: string;
}

interface School {
  id: string;
  name: string;
}

function normalizePreviewText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPlainText(content?: string): string {
  if (!content) return '';
  const source = content
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/gi, ' ');

  if (/<[a-z][\s\S]*>/i.test(source)) {
    const temp = document.createElement('div');
    temp.innerHTML = source;
    return normalizePreviewText(temp.textContent || temp.innerText || '');
  }

  return normalizePreviewText(source);
}

function getQuestionPreviewText(question: Question): string {
  const fromFormatted = extractPlainText(question.formattedText);
  if (fromFormatted) return fromFormatted;
  const fromText = extractPlainText(question.text);
  if (fromText) return fromText;
  return 'Sem texto disponível';
}

export function CreateEvaluationModal({
  isOpen,
  onClose,
  onSuccess,
  evaluationId,
  initialData,
}: CreateEvaluationModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  
  // Dados básicos
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('60');
  const [type, setType] = useState<'AVALIACAO' | 'SIMULADO'>('AVALIACAO');
  const [model, setModel] = useState<'SAEB' | 'PROVA' | 'AVALIE'>('SAEB');
  
  // Seleções
  const [course, setCourse] = useState('');
  const [grade, setGrade] = useState('');
  const [state, setState] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchools, setSelectedSchools] = useState<{ id: string; name: string; }[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<ClassInfo[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<Subject[]>([]);
  const [showQuestionBank, setShowQuestionBank] = useState(false);
  const [showQuestionPreview, setShowQuestionPreview] = useState(false);
  const [showCreateQuestion, setShowCreateQuestion] = useState(false);
  const [selectedSubjectForQuestion, setSelectedSubjectForQuestion] = useState<string>("");
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  
  // Opções
  const [courses, setCourses] = useState<Course[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [schoolSearchTerm, setSchoolSearchTerm] = useState('');
  const [availableClasses, setAvailableClasses] = useState<ClassInfo[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [classSearchTerm, setClassSearchTerm] = useState('');

  // Store de questões
  const allQuestions = useQuestions();
  const { setQuestions, clearQuestions, addQuestion } = useQuestionActions();
  const { updateAfterCRUD } = useEvaluationsManager();
  
  // Estado para rastrear se as questões já foram carregadas (evita limpeza acidental)
  const [questionsLoaded, setQuestionsLoaded] = useState(false);
  
  // Estado para rastrear se está navegando (evita dupla navegação)
  const [isNavigating, setIsNavigating] = useState(false);
  const classNameCollator = useMemo(
    () => new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' }),
    []
  );

  // Carregar dados iniciais
  useEffect(() => {
    if (!isOpen) {
      // Não limpar questões quando o modal fechar, apenas quando realmente necessário
      return;
    }
    
    const loadInitialData = async () => {
      setLoadingData(true);
      try {
        // PRIMEIRO: Carregar opções (cursos, disciplinas, estados) para os Selects terem itens ao aplicar initialData
        const [coursesRes, subjectsRes, statesRes] = await Promise.all([
          api.get('/education_stages'),
          api.get('/subjects'),
          api.get('/city/states'),
        ]);
        
        setCourses(coursesRes.data || []);
        setAllSubjects(subjectsRes.data || []);
        setStates(statesRes.data || []);
        
        // DEPOIS: Se estiver editando, aplicar dados da avaliação (curso e disciplina aparecem selecionados)
        if (evaluationId || initialData) {
          await loadEvaluationData(evaluationId, initialData, {
            coursesOptions: coursesRes.data || [],
            subjectsOptions: subjectsRes.data || [],
          });
        } else {
          clearQuestions();
          setQuestionsLoaded(false);
        }
      } catch (error) {
        toast({
          title: 'Erro',
          description: error instanceof Error ? error.message : 'Erro ao carregar dados iniciais',
          variant: 'destructive',
        });
        // Não fechar o modal em caso de erro, apenas mostrar o toast
      } finally {
        setLoadingData(false);
      }
    };
    
    // ✅ CORREÇÃO: Adicionar try-catch externo para capturar erros de inicialização
    try {
      loadInitialData();
    } catch (error) {
      toast({
        title: 'Erro crítico',
        description: 'Não foi possível inicializar o modal. Tente novamente.',
        variant: 'destructive',
      });
      setLoadingData(false);
    }
  }, [isOpen, evaluationId, initialData, toast, clearQuestions]);

  // Carregar dados da avaliação para edição
  const loadEvaluationData = async (
    id?: string,
    data?: EvaluationFormData | null,
    options?: { coursesOptions?: Course[]; subjectsOptions?: Subject[] }
  ) => {
    try {
      if (!data && !id) return;
      if (data) {
        const subjectsOptions = options?.subjectsOptions || [];
        // Enriquecer disciplinas com nome quando vier vazio (ex.: API retorna só id em subjects_info)
        const subjectsWithNames = (data.subjects || []).map((s) => {
          const found = subjectsOptions.find((a) => a.id === s.id);
          return { id: s.id, name: (s.name && s.name.trim()) ? s.name : (found?.name || s.id) };
        }).filter((s) => s.id);

        setTitle(data.title || '');
        setDescription(data.description || '');
        setDuration(data.duration || '60');
        setType(data.type || 'AVALIACAO');
        setModel(data.model || 'SAEB');
        setCourse(data.course || '');
        setGrade(data.grade || '');
        setState(data.state || '');
        
        // Carregar municípios se houver estado
        if (data.state && data.state !== 'all') {
          try {
            const municipalitiesRes = await api.get(`/city/municipalities/state/${data.state}`);
            setMunicipalities(municipalitiesRes.data || []);
          } catch (err) {
            // Silenciar erro ao carregar municípios
          }
        }

        setMunicipality(data.municipality || '');
        setSelectedSchools(data.selectedSchools || []);
        setSelectedClasses(data.selectedClasses || []);
        setSelectedSubjects(subjectsWithNames.length > 0 ? subjectsWithNames : (data.subjects || []));
        
        // Carregar questões se disponíveis - PRIORIDADE MÁXIMA
        if (data.questions && data.questions.length > 0) {
          console.log('📚 Carregando questões do initialData:', data.questions.length, data.questions);
          // ✅ CORREÇÃO: Garantir que todas as questões tenham subjectId definido
          const questionsWithSubjectId = data.questions.map((q: any) => {
            const subjectId = q.subjectId || 
                             q.subject?.id || 
                             q.subject_id || 
                             data.subjects?.[0]?.id || 
                             '';
            return {
              ...q,
              subjectId: subjectId,
              subject: q.subject || (subjectId ? { id: subjectId } : undefined)
            };
          });
          // Garantir que as questões sejam setadas imediatamente
          setQuestions(questionsWithSubjectId);
          setQuestionsLoaded(true);
          console.log('✅ Questões setadas no store e marcadas como carregadas:', questionsWithSubjectId.map((q: any) => ({
            id: q.id,
            subjectId: q.subjectId
          })));
        } else if (id) {
          // Se não houver questões no initialData, tentar buscar da API
          console.log('📚 Buscando questões da API para avaliação:', id);
          try {
            const questionsResponse = await api.get(`/questions?test_id=${id}`);
            console.log('📚 Resposta da API:', {
              isArray: Array.isArray(questionsResponse.data),
              length: questionsResponse.data?.length || 0,
              data: questionsResponse.data
            });
            
            if (Array.isArray(questionsResponse.data) && questionsResponse.data.length > 0) {
              console.log('📚 Carregando questões da API:', questionsResponse.data.length);
              // ✅ CORREÇÃO: Garantir que todas as questões tenham subjectId definido
              const questionsData = questionsResponse.data.map((q: any) => {
                const subjectId = q.subject?.id || q.subject_id || q.subjectId || data.subjects?.[0]?.id || '';
                return {
                  id: q.id,
                  text: q.text || q.formattedText || '',
                  formattedText: q.formattedText || q.text || '',
                  title: q.title || q.command || '',
                  type: q.type === 'multiple_choice' ? 'multipleChoice' : (q.type === 'open' || q.type === 'essay' ? 'dissertativa' : 'multipleChoice'),
                  subjectId: subjectId,
                  subject: q.subject || (subjectId ? { id: subjectId } : undefined),
                  grade: q.grade,
                  difficulty: q.difficulty || '',
                  value: q.value || q.points || 0,
                  solution: q.solution || '',
                  formattedSolution: q.formattedSolution || q.solution || '',
                  options: q.alternatives?.map((alt: any) => ({
                    id: alt.id,
                    text: alt.text,
                    isCorrect: alt.isCorrect || false,
                  })) || q.options || [],
                  secondStatement: q.secondStatement || q.secondstatement || '',
                  skills: q.skills || '',
                };
              });
              setQuestions(questionsData);
              setQuestionsLoaded(true);
              console.log('✅ Questões da API setadas no store e marcadas como carregadas:', questionsData.map((q: any) => ({
                id: q.id,
                subjectId: q.subjectId
              })));
            } else {
              console.warn('⚠️ Nenhuma questão encontrada na API, tentando buscar evaluation completo...');
              // ✅ CORREÇÃO: Se API não retornou questões, buscar evaluation completo para verificar evaluation.questions
              try {
                const evaluationResponse = await api.get(`/test/${id}`);
                const evaluation = evaluationResponse.data;
                console.log('📊 Evaluation completo:', {
                  hasQuestions: !!evaluation.questions,
                  questionsLength: evaluation.questions?.length || 0,
                  questions: evaluation.questions
                });
                
                if (evaluation.questions && Array.isArray(evaluation.questions) && evaluation.questions.length > 0) {
                  console.log('📚 Usando questões do evaluation (fallback):', evaluation.questions.length);
                  // Mapear questões do evaluation para o formato esperado
                  // ✅ CORREÇÃO: Garantir que todas as questões tenham subjectId
                  const mappedQuestions = evaluation.questions.map((q: any) => {
                    const subjectId = q.subject?.id || q.subject_id || q.subjectId || evaluation.subjects?.[0]?.id || '';
                    return {
                      id: q.id || q.question_id || `temp-${Date.now()}-${Math.random()}`,
                      text: q.text || q.formattedText || '',
                      formattedText: q.formattedText || q.text || '',
                      title: q.title || q.command || '',
                      type: q.type === 'multiple_choice' ? 'multipleChoice' : (q.type === 'open' || q.type === 'essay' ? 'dissertativa' : 'multipleChoice'),
                      subjectId: subjectId,
                      subject: q.subject || (subjectId ? { id: subjectId } : undefined),
                      grade: q.grade,
                      difficulty: q.difficulty || '',
                      value: q.value || q.points || 0,
                      solution: q.solution || '',
                      formattedSolution: q.formattedSolution || q.solution || '',
                      options: q.alternatives?.map((alt: any) => ({
                        id: alt.id,
                        text: alt.text,
                        isCorrect: alt.isCorrect || false,
                      })) || q.options || [],
                      secondStatement: q.secondStatement || q.secondstatement || '',
                      skills: q.skills || '',
                    };
                  });
                  setQuestions(mappedQuestions);
                  setQuestionsLoaded(true);
                  console.log('✅ Questões do evaluation setadas no store');
                } else {
                  console.warn('⚠️ Nenhuma questão encontrada em nenhuma fonte');
                }
              } catch (evalErr) {
                console.error('❌ Erro ao buscar evaluation completo:', evalErr);
              }
            }
          } catch (err) {
            console.error('❌ Erro ao buscar questões do initialData:', err);
          }
        } else {
          console.warn('⚠️ Nenhuma questão disponível no initialData e sem ID para buscar');
        }
        
        // Carregar escolas quando município e série estiverem definidos
        if (data.municipality && data.municipality !== 'all' && data.grade) {
          // O useEffect já vai carregar as escolas, mas precisamos garantir que as selecionadas sejam preservadas
          // Isso será feito pelo useEffect que carrega escolas
        }
      } else if (id) {
        // Carregar da API se tiver ID
        const response = await api.get(`/test/${id}`);
        const evaluation = response.data;
        
        setTitle(evaluation.title || '');
        setDescription(evaluation.description || '');
        setDuration(String(evaluation.duration || 60));
        setType(evaluation.type === 'SIMULADO' ? 'SIMULADO' : 'AVALIACAO');
        setModel(evaluation.model || 'SAEB');
        setCourse(evaluation.course?.id || evaluation.course || '');
        setGrade(evaluation.grade?.id || evaluation.grade_id || evaluation.grade || '');
        
        if (evaluation.subjects) {
          setSelectedSubjects(Array.isArray(evaluation.subjects) ? evaluation.subjects : [evaluation.subjects]);
        }
        
        if (evaluation.schools) {
          const schoolsData = Array.isArray(evaluation.schools) 
            ? evaluation.schools.map((s: any) => ({ id: s.id || s, name: s.name || s }))
            : [{ id: evaluation.schools, name: evaluation.schools }];
          setSelectedSchools(schoolsData);
        }
        
        if (evaluation.classes) {
          // Carregar informações completas das turmas
          const classesData = await Promise.all(
            (Array.isArray(evaluation.classes) ? evaluation.classes : [evaluation.classes]).map(async (classId: string) => {
              try {
                const classRes = await api.get(`/classes/${classId}`);
                return {
                  id: classRes.data.id,
                  name: classRes.data.name,
                  school: classRes.data.school ? {
                    id: classRes.data.school.id,
                    name: classRes.data.school.name,
                  } : undefined,
                } as ClassInfo;
              } catch {
                return { id: classId, name: `Turma ${classId}` } as ClassInfo;
              }
            })
          );
          setSelectedClasses(classesData);
        }
        
        // Carregar municípios se houver estado
        if (evaluation.municipalities && evaluation.municipalities.length > 0) {
          const firstMunicipality = evaluation.municipalities[0];
          const municipalityId = typeof firstMunicipality === 'string' ? firstMunicipality : firstMunicipality.id;
          try {
            const municipalityRes = await api.get(`/city/${municipalityId}`);
            const stateName = municipalityRes.data?.state;
            if (stateName) {
              setState(stateName);
              const municipalitiesRes = await api.get(`/city/municipalities/state/${stateName}`);
              setMunicipalities(municipalitiesRes.data || []);
            }
          } catch (err) {
            console.error('Erro ao carregar estado do município:', err);
          }
        }
        
        // Carregar questões da avaliação
        try {
          console.log('📚 Buscando questões para avaliação:', id);
          const questionsResponse = await api.get(`/questions?test_id=${id}`);
          console.log('📚 Resposta da API de questões:', questionsResponse.data?.length || 0);
          
            if (Array.isArray(questionsResponse.data) && questionsResponse.data.length > 0) {
              // ✅ CORREÇÃO: Garantir que todas as questões tenham subjectId
              const questionsData = questionsResponse.data.map((q: any) => {
                const subjectId = q.subject?.id || q.subject_id || q.subjectId || evaluation.subjects?.[0]?.id || '';
                return {
                  id: q.id,
                  text: q.text || q.formattedText || '',
                  formattedText: q.formattedText || q.text || '',
                  title: q.title || q.command || '',
                  type: q.type === 'multiple_choice' ? 'multipleChoice' : (q.type === 'open' || q.type === 'essay' ? 'dissertativa' : 'multipleChoice'),
                  subjectId: subjectId,
                  subject: q.subject || (subjectId ? { id: subjectId } : undefined),
                  grade: q.grade,
                  difficulty: q.difficulty || '',
                  value: q.value || q.points || 0,
                  solution: q.solution || '',
                  formattedSolution: q.formattedSolution || q.solution || '',
                  options: q.alternatives?.map((alt: any) => ({
                    id: alt.id,
                    text: alt.text,
                    isCorrect: alt.isCorrect || false,
                  })) || q.options || [],
                  secondStatement: q.secondStatement || q.secondstatement || '',
                  skills: q.skills || '',
                };
              });
              console.log('📚 Carregando questões da API:', questionsData.length);
              setQuestions(questionsData);
              setQuestionsLoaded(true);
              console.log('✅ Questões da API setadas (fallback evaluation):', questionsData.map((q: any) => ({
                id: q.id,
                subjectId: q.subjectId
              })));
          } else if (evaluation.questions && Array.isArray(evaluation.questions) && evaluation.questions.length > 0) {
            // Fallback: usar questões do evaluation se disponíveis
            console.log('📚 Usando questões do evaluation (fallback):', evaluation.questions.length);
            setQuestions(evaluation.questions as unknown as Question[]);
            setQuestionsLoaded(true);
          } else {
            console.warn('⚠️ Nenhuma questão encontrada para a avaliação');
          }
        } catch (err) {
          console.error('❌ Erro ao carregar questões:', err);
          // Se falhar, tentar usar questões do evaluation se disponíveis
          if (evaluation.questions && Array.isArray(evaluation.questions) && evaluation.questions.length > 0) {
            console.log('📚 Usando questões do evaluation após erro:', evaluation.questions.length);
            setQuestions(evaluation.questions as unknown as Question[]);
            setQuestionsLoaded(true);
          }
        }
      }
    } catch (error) {
      console.error('❌ Erro ao carregar avaliação:', error);
      // ✅ CORREÇÃO: Tratamento de erro mais robusto
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido ao carregar dados da avaliação';
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
      // Não propagar o erro para evitar crash - apenas logar e mostrar toast
    }
  };

  // Carregar séries quando curso mudar
  useEffect(() => {
    // Não limpar se estiver carregando dados iniciais
    if (loadingData) return;
    
    if (!course) {
      setGrades([]);
      setGrade('');
      setSchools([]);
      // Só limpar escolas e turmas se realmente não houver curso
      setSelectedSchools([]);
      setSelectedClasses([]);
      return;
    }
    
    const loadGrades = async () => {
      try {
        const response = await api.get(`/grades/education-stage/${course}`);
        setGrades(response.data || []);
      } catch (err) {
        console.error('Erro ao carregar séries:', err);
        setGrades([]);
      }
    };
    
    loadGrades();
  }, [course, loadingData]);

  // Carregar municípios quando estado mudar
  useEffect(() => {
    // Não limpar se estiver carregando dados iniciais
    if (loadingData) return;
    
    if (!state || state === 'all') {
      setMunicipalities([]);
      setMunicipality('');
      // Só limpar escolas e turmas se realmente não houver estado
      if (!state) {
        setSchools([]);
        setSelectedSchools([]);
        setSelectedClasses([]);
      }
      return;
    }
    
    // Carregar municípios do estado
    api.get(`/city/municipalities/state/${state}`)
      .then(res => setMunicipalities(res.data || []))
      .catch(err => {
        console.error('Erro ao carregar municípios:', err);
        setMunicipalities([]);
      });
  }, [state, loadingData]);

  // Carregar escolas quando município ou série mudar
  // ✅ CORREÇÃO: Usar useRef para evitar loop infinito
  const schoolsValidationRef = useRef(false);
  
  useEffect(() => {
    // Resetar flag quando município ou grade mudarem
    schoolsValidationRef.current = false;
    
    // Não executar se estiver carregando dados iniciais
    if (loadingData) {
      return;
    }
    
    const loadSchools = async () => {
      if (!municipality || municipality === 'all') {
        setSchools([]);
        setSchoolSearchTerm('');
        // Limpar apenas se realmente não houver município
        if (!municipality) {
          setSelectedSchools([]);
          setSelectedClasses([]);
        }
        return;
      }
      
      setSchoolsLoading(true);
      setSchoolSearchTerm('');
      // Limpar escolas disponíveis, mas preservar selecionadas se ainda forem válidas
      setSchools([]);

      try {
        let schoolsData = [];
        
        if (grade) {
          try {
            const response = await api.get(`/school/by-grade/${grade}`);
            schoolsData = response.data?.schools || [];
            
            if (schoolsData.length > 0) {
              const municipalitySchoolsResponse = await api.get(`/school/city/${municipality}`);
              const municipalitySchoolIds = (municipalitySchoolsResponse.data || []).map((s: School) => s.id);
              
              schoolsData = schoolsData.filter((school: School) => 
                municipalitySchoolIds.includes(school.id)
              );
            }
          } catch (err: any) {
            const errorMessage = err?.message || '';
            const isNotFound = err?.response?.status === 404 || 
                               errorMessage.includes('não encontrado') || 
                               errorMessage.includes('not found');
            
            if (!isNotFound) {
              console.warn(`Erro ao buscar escolas por série ${grade}:`, err);
            }
            schoolsData = [];
          }
        } else {
          const response = await api.get(`/school/city/${municipality}`);
          schoolsData = response.data || [];
        }
        
        setSchools(schoolsData);
        
        // Se estiver carregando dados iniciais, preservar escolas selecionadas mesmo que não estejam na lista
        if (loadingData && selectedSchools.length > 0) {
          // Adicionar escolas selecionadas que não estão na lista disponível
          const selectedSchoolIds = new Set(selectedSchools.map(s => s.id));
          const availableSchoolIds = new Set(schoolsData.map((s: School) => s.id));
          
          const missingSchools = selectedSchools.filter(s => !availableSchoolIds.has(s.id));
          if (missingSchools.length > 0) {
            setSchools([...schoolsData, ...missingSchools]);
          }
        } else if (selectedSchools.length > 0 && !schoolsValidationRef.current) {
          // Validar escolas selecionadas apenas uma vez para evitar loop
          schoolsValidationRef.current = true;
          const validSchools = selectedSchools.filter(school =>
            schoolsData.find((s: School) => s.id === school.id)
          );
          if (validSchools.length !== selectedSchools.length) {
            setSelectedSchools(validSchools);
            if (validSchools.length === 0) {
              setSelectedClasses([]);
            }
          }
        }
      } catch (err) {
        console.error('Erro ao carregar escolas:', err);
        setSchools([]);
      } finally {
        setSchoolsLoading(false);
      }
    };
    
    loadSchools();
  }, [municipality, grade, loadingData]); // ✅ CORREÇÃO: Removido selectedSchools das dependências

  // Carregar turmas quando escolas, série e município estiverem selecionados
  useEffect(() => {
    const loadClasses = async () => {
      // Se estiver carregando dados iniciais e já tiver turmas selecionadas, não carregar novamente
      if (loadingData && selectedClasses.length > 0) {
        return;
      }
      
      if (!selectedSchools.length || !grade || !municipality) {
        // Se estiver carregando dados iniciais e tiver turmas selecionadas, não limpar
        if (!loadingData || selectedClasses.length === 0) {
          setAvailableClasses([]);
        }
        return;
      }

      setLoadingClasses(true);
      setClassSearchTerm(''); // Limpar busca quando filtros mudarem
      try {
        const allClasses: ClassInfo[] = [];

        // Carregar turmas de todas as escolas selecionadas
        for (const school of selectedSchools) {
          try {
            const response = await api.get(`/classes/school/${school.id}`);
            const schoolClasses = (response.data || []) as Array<{
              id: string;
              name: string;
              grade_id?: string;
              grade?: { id?: string };
              school_id?: string;
            }>;
            
            const classesWithSchool = schoolClasses
              .filter((classItem) => {
                // Filtrar por série
                const classGradeId = classItem.grade_id || classItem.grade?.id;
                return String(classGradeId || '').trim() === String(grade).trim();
              })
              .map((classItem) => ({
                id: classItem.id,
                name: classItem.name,
                school: {
                  id: school.id,
                  name: school.name,
                },
              } as ClassInfo));
            
            allClasses.push(...classesWithSchool);
          } catch (err) {
            console.error(`Erro ao buscar turmas da escola ${school.name}:`, err);
          }
        }

        setAvailableClasses(allClasses);
        
        // Se estiver carregando dados iniciais, preservar turmas selecionadas mesmo que não estejam na lista
        if (loadingData && selectedClasses.length > 0) {
          // Adicionar turmas selecionadas que não estão na lista disponível
          const selectedClassIds = new Set(selectedClasses.map(c => c.id));
          const availableClassIds = new Set(allClasses.map(c => c.id));
          
          const missingClasses = selectedClasses.filter(c => !availableClassIds.has(c.id));
          if (missingClasses.length > 0) {
            setAvailableClasses([...allClasses, ...missingClasses]);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar turmas:', error);
        // Se estiver carregando dados iniciais e tiver turmas selecionadas, não limpar
        if (!loadingData || selectedClasses.length === 0) {
          setAvailableClasses([]);
        }
      } finally {
        setLoadingClasses(false);
      }
    };

    loadClasses();
  }, [selectedSchools, grade, municipality, loadingData, selectedClasses]);

  const handleNext = () => {
    if (step === 1) {
      // Validar dados básicos
      if (!title || title.trim().length < 3) {
        toast({
          title: 'Campos obrigatórios',
          description: 'O título deve ter no mínimo 3 caracteres',
          variant: 'destructive',
        });
        return;
      }
      
      if (!course || !grade || !state || !municipality || selectedSchools.length === 0 || selectedSubjects.length === 0) {
        toast({
          title: 'Campos obrigatórios',
          description: 'Preencha todos os campos obrigatórios',
          variant: 'destructive',
        });
        return;
      }
      
      if (selectedClasses.length === 0) {
        toast({
          title: 'Turmas obrigatórias',
          description: 'Selecione pelo menos uma turma',
          variant: 'destructive',
        });
        return;
      }
      
      // ✅ CORREÇÃO: Se estiver em modo de edição, garantir que questões foram carregadas
      if (evaluationId || initialData) {
        // Se não há questões no store mas deveria haver (modo edição), tentar recarregar
          if (allQuestions.length === 0 && (initialData?.questions?.length || 0) > 0) {
            console.log('🔄 Recarregando questões antes de ir para step 2...');
            if (initialData?.questions && initialData.questions.length > 0) {
              // ✅ CORREÇÃO: Garantir que todas as questões tenham subjectId
              const questionsWithSubjectId = initialData.questions.map((q: any) => {
                const subjectId = q.subjectId || 
                                 q.subject?.id || 
                                 q.subject_id || 
                                 selectedSubjects[0]?.id || 
                                 '';
                return {
                  ...q,
                  subjectId: subjectId,
                  subject: q.subject || (subjectId ? { id: subjectId } : undefined)
                };
              });
              setQuestions(questionsWithSubjectId);
              setQuestionsLoaded(true);
              console.log('✅ Questões recarregadas do initialData:', questionsWithSubjectId.length, questionsWithSubjectId.map((q: any) => ({
                id: q.id,
                subjectId: q.subjectId
              })));
          } else if (evaluationId) {
            // Tentar buscar da API
            api.get(`/questions?test_id=${evaluationId}`)
              .then(questionsResponse => {
                if (Array.isArray(questionsResponse.data) && questionsResponse.data.length > 0) {
                  // ✅ CORREÇÃO: Garantir que todas as questões tenham subjectId
                  const questionsData = questionsResponse.data.map((q: any) => {
                    const subjectId = q.subject?.id || q.subject_id || q.subjectId || selectedSubjects[0]?.id || '';
                    return {
                      id: q.id,
                      text: q.text || q.formattedText || '',
                      formattedText: q.formattedText || q.text || '',
                      title: q.title || q.command || '',
                      type: q.type === 'multiple_choice' ? 'multipleChoice' : (q.type === 'open' || q.type === 'essay' ? 'dissertativa' : 'multipleChoice'),
                      subjectId: subjectId,
                      subject: q.subject || (subjectId ? { id: subjectId } : undefined),
                      grade: q.grade,
                      difficulty: q.difficulty || '',
                      value: q.value || q.points || 0,
                      solution: q.solution || '',
                      formattedSolution: q.formattedSolution || q.solution || '',
                      options: q.alternatives?.map((alt: any) => ({
                        id: alt.id,
                        text: alt.text,
                        isCorrect: alt.isCorrect || false,
                      })) || q.options || [],
                      secondStatement: q.secondStatement || q.secondstatement || '',
                      skills: q.skills || '',
                    };
                  });
                  setQuestions(questionsData);
                  setQuestionsLoaded(true);
                  console.log('✅ Questões recarregadas da API:', questionsData.length, questionsData.map((q: any) => ({
                    id: q.id,
                    subjectId: q.subjectId
                  })));
                }
              })
              .catch(err => {
                console.error('❌ Erro ao recarregar questões:', err);
              });
          }
        }
      }
      
      setStep(2);
    }
  };

  const handleSubmit = async () => {
    if (allQuestions.length === 0) {
      toast({
        title: 'Erro',
        description: ERROR_MESSAGES.INVALID_QUESTIONS,
        variant: 'destructive',
      });
      return;
    }

    // Validar se todas as questões têm alternativas válidas
    const invalidQuestions = allQuestions.filter(q => {
      if (q.type === 'multipleChoice' && (!q.options || q.options.length === 0)) return true;
      if (q.type === 'multipleChoice' && !q.options.some(opt => opt.isCorrect)) return true;
      return false;
    });

    if (invalidQuestions.length > 0) {
      toast({
        title: 'Erro de Validação',
        description:
          invalidQuestions.length === 1
            ? `1 questão: ${ERROR_MESSAGES.INVALID_QUESTIONS}`
            : `${invalidQuestions.length} questões: ${ERROR_MESSAGES.INVALID_QUESTIONS}`,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const classesToSend = selectedClasses.map(c => c.id);
      const schoolsToSend = selectedSchools.map(s => s.id);
      
      // ✅ CORREÇÃO: Log das turmas antes de enviar
      console.log('📋 Turmas selecionadas para envio:', {
        count: selectedClasses.length,
        classes: selectedClasses.map(c => ({ id: c.id, name: c.name, school: c.school?.id })),
        classesToSend: classesToSend,
        initialDataClasses: initialData?.selectedClasses?.map((c: any) => ({ id: c.id, name: c.name })) || []
      });
      
      const backendEvaluationData = {
        title,
        description: description || "",
        type,
        model,
        course,
        grade,
        subject: selectedSubjects[0]?.id || "",
        // ✅ CORREÇÃO: Em modo de edição, usar valores existentes ao invés de gerar novos
        time_limit: evaluationId && initialData?.startDateTime 
          ? initialData.startDateTime 
          : new Date().toISOString(),
        end_time: evaluationId && initialData?.startDateTime && initialData?.duration
          ? new Date(new Date(initialData.startDateTime).getTime() + (parseInt(initialData.duration, 10) || 60) * 60 * 1000).toISOString()
          : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        duration: parseInt(duration, 10) || 60,
        evaluation_mode: "virtual",
        municipalities: municipality === 'all' ? [] : [municipality],
        schools: schoolsToSend,
        classes: classesToSend,
        subjects: selectedSubjects.map(subject => subject.id),
        subjects_info: selectedSubjects.map(subject => ({
          subject: subject.id,
          weight: Math.round(100 / selectedSubjects.length)
        })),
        created_by: user?.id || "",
        questions: allQuestions.map((question, index) => {
          // ✅ CORREÇÃO: Garantir que subjectId seja sempre definido
          const questionSubjectId = question.subjectId || 
                                    question.subject?.id || 
                                    question.subject_id || 
                                    selectedSubjects[0]?.id || 
                                    '';
          
          // ✅ CORREÇÃO: Log para debug
          console.log(`📝 Processando questão ${index + 1}:`, {
            id: question.id,
            hasId: !!question.id,
            isPreview: question.id === 'preview',
            isTemp: question.id?.startsWith('temp-'),
            subjectId: questionSubjectId,
            originalSubjectId: question.subjectId,
            subject: question.subject?.id,
            title: question.title,
            text: question.text?.substring(0, 50)
          });
          
          // ✅ CORREÇÃO: Verificar se é questão existente que já está na avaliação
          // Questões existentes são aquelas que foram carregadas do initialData
          const initialQuestions = initialData?.questions || [];
          const initialQuestionIds = new Set(
            initialQuestions
              .map((q: any) => {
                // Normalizar ID - pode estar em diferentes formatos
                const id = q.id || (q as any).question_id || (q as any).questionId;
                return id ? String(id).trim() : null;
              })
              .filter(Boolean)
          );
          
          // Normalizar ID da questão atual para comparação
          const questionIdNormalized = question.id 
            ? String(question.id).trim() 
            : null;
          
          // ✅ CORREÇÃO: Log detalhado para debug (apenas na primeira questão para não poluir o console)
          if (index === 0) {
            console.log('🔍 Debug verificação de questões existentes:', {
              totalInitialQuestions: initialQuestions.length,
              initialQuestionIds: Array.from(initialQuestionIds),
              allQuestionIds: allQuestions.map(q => q.id).filter(Boolean),
              initialQuestionsDetails: initialQuestions.map((q: any) => ({
                id: q.id || (q as any).question_id || (q as any).questionId,
                hasId: !!(q.id || (q as any).question_id || (q as any).questionId)
              }))
            });
          }
          
          const isExistingQuestion = questionIdNormalized && 
                                     questionIdNormalized !== 'preview' && 
                                     !questionIdNormalized.startsWith('temp-') &&
                                     initialQuestionIds.has(questionIdNormalized);
          
          if (isExistingQuestion) {
            // Questão existente que já está na avaliação - apenas referência
            console.log(`✅ Questão ${index + 1} é existente (referência):`, questionIdNormalized);
            // ✅ CORREÇÃO: Garantir que apenas id e number são enviados (sem outros campos)
            return {
              id: questionIdNormalized,
              number: index + 1
            };
          }

          // ✅ CORREÇÃO: Questões com ID válido que não estão no initialData
          // Se a questão tem ID mas não estava no initialData, ela foi adicionada do banco de questões
          // Nesse caso, o backend precisa criar a associação. Para questões que já existem no banco,
          // o backend pode precisar apenas da referência {id, number}, mas como não estava na avaliação,
          // vamos tentar enviar como referência primeiro (igual às existentes)
          // Se isso não funcionar, o backend pode precisar de um formato diferente
          if (questionIdNormalized && 
              questionIdNormalized !== 'preview' && 
              !questionIdNormalized.startsWith('temp-')) {
            // Questão existe no banco mas não estava no initialData
            // Tentar enviar como referência (mesmo formato das existentes)
            // O backend deve criar a associação baseado no ID
            console.log(`✅ Questão ${index + 1} existe no banco mas não estava na avaliação (nova associação - referência):`, questionIdNormalized);
            return {
              id: questionIdNormalized,
              number: index + 1
            };
          }

          // ✅ CORREÇÃO: Questão verdadeiramente nova (sem ID válido) - criar completa
          // Questões novas NÃO devem incluir 'id' no payload completo
          const newQuestion: any = {
            number: index + 1,
            text: question.text || '',
            formattedText: question.formattedText || question.text || '',
            subjectId: questionSubjectId, // ✅ CORREÇÃO: Usar subjectId garantido
            title: question.title || '',
            description: question.title || '',
            command: question.title || '',
            subtitle: question.title || '',
            secondStatement: question.secondStatement || '',
            options: mapEvaluationQuestionOptions(question.options),
            skills: question.skills || "",
            grade: question.grade?.id || grade,
            difficulty: question.difficulty || '',
            solution: question.solution || "",
            formattedSolution: question.formattedSolution || question.solution || "",
            type: question.type === 'multipleChoice' ? 'multiple_choice' : 'open',
            value: question.value || 0,
            topics: [],
            educationStageId: course,
            created_by: user?.id || "",
            lastModifiedBy: user?.id || ""
            // ✅ CORREÇÃO: NÃO incluir 'id' aqui - questões novas não devem ter ID no payload
          };
          
          console.log(`✅ Questão ${index + 1} preparada para envio (nova):`, {
            number: newQuestion.number,
            title: newQuestion.title,
            subjectId: newQuestion.subjectId,
            text: newQuestion.text.substring(0, 50) + '...',
            optionsCount: newQuestion.options.length,
            hasId: false
          });
          return newQuestion;
        })
      };
      
      // ✅ CORREÇÃO: Validação final - garantir que questões existentes não têm campos extras
      const validatedQuestions = backendEvaluationData.questions.map((q: any) => {
        // Se a questão tem apenas 'id' e 'number', é uma referência (correto)
        const keys = Object.keys(q);
        const isReference = keys.length === 2 && keys.includes('id') && keys.includes('number');
        
        if (isReference) {
          // Garantir que apenas id e number estão presentes
          return {
            id: q.id,
            number: q.number
          };
        }
        
        // Se não é referência, é questão nova (deve ter todos os campos)
        return q;
      });
      
      backendEvaluationData.questions = validatedQuestions;

      // ✅ CORREÇÃO: Log completo do payload JSON antes de enviar
      console.log('📤 Payload final que será enviado (resumo):', {
        evaluationId,
        questionsCount: backendEvaluationData.questions.length,
        classesCount: backendEvaluationData.classes.length,
        classes: backendEvaluationData.classes,
        schoolsCount: backendEvaluationData.schools.length,
        questions: backendEvaluationData.questions.map((q: any, idx: number) => ({
          index: idx + 1,
          hasId: !!q.id,
          id: q.id,
          number: q.number,
          isReference: !q.text && !!q.id, // Se tem ID mas não tem text, é apenas referência
          isNew: !!q.text, // Se tem text, é questão nova
          title: q.title || 'Sem título',
          subjectId: q.subjectId
        }))
      });
      
      // ✅ CORREÇÃO: Log completo do payload JSON (stringify completo)
      try {
        console.log('📤 Payload JSON completo:', JSON.stringify(backendEvaluationData, null, 2));
      } catch (error) {
        console.error('❌ Erro ao serializar payload:', error);
      }

      if (evaluationId) {
        // ✅ CORREÇÃO: Log do payload antes de enviar
        console.log('📤 Enviando PUT para atualizar avaliação:', {
          evaluationId,
          questionsCount: backendEvaluationData.questions.length,
          questionsSummary: backendEvaluationData.questions.map((q: any) => ({
            number: q.number,
            hasId: !!q.id,
            id: q.id,
            isReference: !q.text && !!q.id,
            isNew: !!q.text,
            subjectId: q.subjectId,
            title: q.title || 'Sem título'
          }))
        });
        
        let response;
        try {
          response = await api.put(`/test/${evaluationId}`, backendEvaluationData);
          
          // ✅ CORREÇÃO: Log completo da resposta da API
          console.log('✅ Resposta da API após atualizar (resumo):', {
            status: response.status,
            statusText: response.statusText,
            questionsInResponse: response.data?.questions?.length || 0,
            hasData: !!response.data
          });
          
          // ✅ CORREÇÃO: Log completo da resposta JSON
          try {
            console.log('✅ Resposta JSON completa:', JSON.stringify(response.data, null, 2));
          } catch (error) {
            console.error('❌ Erro ao serializar resposta:', error);
          }
          
          // ✅ CORREÇÃO: Verificar se as questões e turmas foram salvas
          try {
            // Verificar questões (a API pode devolver array direto ou objeto com .data / .results / .items / .total)
            const verifyQuestionsResponse = await api.get(`/questions?test_id=${evaluationId}`);
            const raw = verifyQuestionsResponse.data;
            const questionsList = Array.isArray(raw)
              ? raw
              : Array.isArray((raw as any)?.data)
                ? (raw as any).data
                : Array.isArray((raw as any)?.results)
                  ? (raw as any).results
                  : Array.isArray((raw as any)?.items)
                    ? (raw as any).items
                    : [];
            const questionsCount = questionsList.length > 0
              ? questionsList.length
              : (typeof (raw as any)?.total === 'number' ? (raw as any).total : 0);
            const expectedQuestionsCount = backendEvaluationData.questions.length;
            
            // Verificar turmas através da avaliação
            const verifyEvaluationResponse = await api.get(`/test/${evaluationId}`);
            const savedClasses = verifyEvaluationResponse.data?.classes || [];
            const savedClassesCount = Array.isArray(savedClasses) ? savedClasses.length : 0;
            const expectedClassesCount = backendEvaluationData.classes.length;
            
            console.log('🔍 Verificação: Questões e turmas após atualização:', {
              questoes: {
                count: questionsCount,
                expected: expectedQuestionsCount,
                rawIsArray: Array.isArray(raw),
                listLength: questionsList.length
              },
              turmas: {
                count: savedClassesCount,
                expected: expectedClassesCount,
                saved: savedClasses,
                enviadas: backendEvaluationData.classes
              }
            });
            
            // ✅ CORREÇÃO: Avisar se as questões não foram salvas
            if (questionsCount !== expectedQuestionsCount) {
              console.error('❌ PROBLEMA: Questões não foram salvas corretamente!', {
                esperado: expectedQuestionsCount,
                encontrado: questionsCount,
                payloadEnviado: backendEvaluationData.questions.length,
                questoesEnviadas: backendEvaluationData.questions.map((q: any) => ({
                  id: q.id,
                  number: q.number,
                  isReference: !q.text && !!q.id
                }))
              });
              
              toast({
                title: 'Aviso',
                description: `A avaliação foi atualizada, mas apenas ${questionsCount} de ${expectedQuestionsCount} questões foram salvas. Isso pode ser um problema no sistema.`,
                variant: 'destructive',
              });
            }
            
            // ✅ CORREÇÃO: Avisar se as turmas não foram salvas
            if (savedClassesCount !== expectedClassesCount) {
              console.error('❌ PROBLEMA: Turmas não foram salvas corretamente!', {
                esperado: expectedClassesCount,
                encontrado: savedClassesCount,
                payloadEnviado: backendEvaluationData.classes,
                turmasSalvas: savedClasses
              });
              
              toast({
                title: 'Aviso',
                description: `A avaliação foi atualizada, mas apenas ${savedClassesCount} de ${expectedClassesCount} turma(s) foram salvas. Isso pode ser um problema no sistema.`,
                variant: 'destructive',
              });
            }
          } catch (verifyError) {
            console.warn('⚠️ Não foi possível verificar questões e turmas após atualização:', verifyError);
          }
          
          toast({
            title: SUCCESS_MESSAGES.EVALUATION_UPDATED || 'Avaliação atualizada!',
            description: `A avaliação "${title}" foi atualizada com sucesso!`,
          });
        } catch (error: any) {
          // ✅ CORREÇÃO: Tratamento de erro mais detalhado
          console.error('❌ Erro ao atualizar avaliação:', {
            message: error?.message,
            response: error?.response?.data,
            status: error?.response?.status,
            statusText: error?.response?.statusText,
            fullError: error
          });
          
          // Log completo do erro se disponível
          if (error?.response?.data) {
            try {
              console.error('❌ Detalhes do erro do servidor:', JSON.stringify(error.response.data, null, 2));
            } catch (e) {
              console.error('❌ Erro ao serializar detalhes do erro:', e);
            }
          }
          
          toast({
            title: 'Erro ao atualizar avaliação',
            description: error?.response?.data?.message || error?.message || 'Erro desconhecido ao atualizar a avaliação',
            variant: 'destructive',
          });
          throw error; // Re-throw para que o código não continue
        }
      } else {
        try {
          const response = await api.post("/test", backendEvaluationData);
          
          // ✅ CORREÇÃO: Log da resposta ao criar
          console.log('✅ Resposta da API após criar:', {
            status: response.status,
            statusText: response.statusText,
            data: response.data
          });
          
          if (response.status === 201 || response.status === 200) {
            await updateAfterCRUD();
            toast({
              title: SUCCESS_MESSAGES.EVALUATION_CREATED,
              description: `Avaliação "${title}" criada com sucesso!`,
            });
          }
        } catch (error: any) {
          // ✅ CORREÇÃO: Tratamento de erro ao criar
          console.error('❌ Erro ao criar avaliação:', {
            message: error?.message,
            response: error?.response?.data,
            status: error?.response?.status,
            statusText: error?.response?.statusText,
            fullError: error
          });
          
          if (error?.response?.data) {
            try {
              console.error('❌ Detalhes do erro do servidor:', JSON.stringify(error.response.data, null, 2));
            } catch (e) {
              console.error('❌ Erro ao serializar detalhes do erro:', e);
            }
          }
          
          toast({
            title: 'Erro ao criar avaliação',
            description: error?.response?.data?.message || error?.message || 'Erro desconhecido ao criar a avaliação',
            variant: 'destructive',
          });
          throw error;
        }
      }

      clearQuestions();
      setQuestionsLoaded(false);
      
      // Marcar que está navegando para evitar dupla navegação
      setIsNavigating(true);
      
      // Fechar o modal primeiro
      onClose();
      
      // Aguardar um pouco para o modal fechar antes de navegar
      setTimeout(() => {
        onSuccess();
        setIsNavigating(false);
      }, 150);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string; error?: string } }; message?: string };
      
      console.error("Erro ao salvar avaliação:", error);
      
      let errorMessage: string = ERROR_MESSAGES.EVALUATION_CREATE_FAILED;
      if (apiError?.response?.data?.message) {
        errorMessage = apiError.response.data.message;
      } else if (apiError?.response?.data?.error) {
        errorMessage = apiError.response.data.error;
      } else if (apiError?.message) {
        errorMessage = apiError.message;
      }

      toast({
        title: ERROR_MESSAGES.EVALUATION_CREATE_FAILED,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // ✅ CORREÇÃO: Apenas fechar o modal e voltar ao menu principal
    // Limpar estados apenas se necessário
    setStep(1);
    clearQuestions();
    setQuestionsLoaded(false);
    // Chamar onClose que vai fechar o modal e navegar
    onClose();
  };

  const handleSubjectToggle = (subject: Subject) => {
    const isSelected = selectedSubjects.some(s => s.id === subject.id);
    if (isSelected) {
      setSelectedSubjects(selectedSubjects.filter(s => s.id !== subject.id));
    } else {
      setSelectedSubjects([...selectedSubjects, subject]);
    }
  };

  const handleSchoolToggle = (school: School) => {
    const isSelected = selectedSchools.some(s => s.id === school.id);
    if (isSelected) {
      setSelectedSchools(selectedSchools.filter(s => s.id !== school.id));
      // Limpar turmas da escola removida
      setSelectedClasses(selectedClasses.filter(c => c.school?.id !== school.id));
    } else {
      setSelectedSchools([...selectedSchools, { id: school.id, name: school.name }]);
    }
  };

  const handleRemoveSchool = (schoolId: string) => {
    setSelectedSchools(selectedSchools.filter(s => s.id !== schoolId));
    // Limpar turmas da escola removida
    setSelectedClasses(selectedClasses.filter(c => c.school?.id !== schoolId));
  };

  const handleSelectAllSchools = () => {
    const schoolsToSelect = schools.map(s => ({ id: s.id, name: s.name }));
    setSelectedSchools(schoolsToSelect);
    toast({
      title: "Todas as escolas selecionadas",
      description: `${schoolsToSelect.length} escolas foram selecionadas`,
    });
  };

  const handleSelectAllClasses = () => {
    setSelectedClasses(availableClasses);
    toast({
      title: "Todas as turmas selecionadas",
      description: `${availableClasses.length} turmas foram selecionadas`,
    });
  };

  // Filtrar escolas por busca
  const filteredSchools = schools.filter(school =>
    school.name.toLowerCase().includes(schoolSearchTerm.toLowerCase())
  );

  const handleAddFromBank = (subjectId: string) => {
    setSelectedSubjectForQuestion(subjectId);
    setShowQuestionBank(true);
  };

  const handleCreateNewQuestion = (subjectId: string) => {
    setSelectedSubjectForQuestion(subjectId);
    setShowCreateQuestion(true);
  };

  const handleQuestionCreated = (question: Question) => {
    console.log('📝 handleQuestionCreated chamado:', {
      questionId: question.id,
      questionSubjectId: question.subjectId,
      selectedSubjectForQuestion,
      allQuestionsCount: allQuestions.length
    });
    
    // ✅ CORREÇÃO: Verificar se a questão já existe e garantir subjectId correto
    const questionId = question.id;
    
    // Verificar duplicatas apenas se tiver ID válido
    if (questionId && questionId !== '' && !questionId.startsWith('temp-')) {
      if (allQuestions.some(q => q.id === questionId)) {
        console.warn('⚠️ Questão já existe no store:', questionId);
        toast({
          title: "Questão já adicionada",
          description: "Esta questão já está na avaliação",
          variant: "destructive",
        });
        return;
      }
    }
    
    // Garantir que o subjectId está correto
    const questionWithSubject = {
      ...question,
      subjectId: selectedSubjectForQuestion || question.subjectId || question.subject?.id || question.subject_id || '',
      subject: question.subject || (selectedSubjectForQuestion ? { id: selectedSubjectForQuestion } : undefined),
    };
    
    console.log('✅ Adicionando questão ao store:', {
      id: questionWithSubject.id,
      subjectId: questionWithSubject.subjectId,
      title: questionWithSubject.title
    });
    
    try {
      addQuestion(questionWithSubject);
      setShowCreateQuestion(false);
      toast({
        title: "Questão criada",
        description: "Nova questão adicionada à avaliação",
      });
    } catch (error) {
      console.error('❌ Erro ao adicionar questão:', error);
      toast({
        title: "Erro",
        description: "Não foi possível adicionar a questão",
        variant: "destructive",
      });
    }
  };

  const handleQuestionSelected = (question: Question) => {
    // ✅ CORREÇÃO: Verificar se a questão já existe antes de adicionar
    const questionId = question.id;
    if (!questionId) {
      toast({
        title: "Erro",
        description: "Questão inválida - sem ID",
        variant: "destructive",
      });
      return;
    }
    
    // Verificar se a questão já foi adicionada
    if (allQuestions.some(q => q.id === questionId)) {
      toast({
        title: "Questão já adicionada",
        description: "Esta questão já está na avaliação",
        variant: "destructive",
      });
      return;
    }
    
    // ✅ CORREÇÃO: Garantir que o subjectId está correto
    const questionWithSubject = {
      ...question,
      subjectId: selectedSubjectForQuestion || question.subjectId || question.subject?.id || question.subject_id || '',
      subject: question.subject || (selectedSubjectForQuestion ? { id: selectedSubjectForQuestion } : undefined),
    };
    
    addQuestion(questionWithSubject);
    toast({
      title: "Questão adicionada",
      description: "Questão adicionada à avaliação",
    });
  };

  const handleRemoveQuestion = (questionId: string) => {
    const updatedQuestions = allQuestions.filter(q => q.id !== questionId);
    setQuestions(updatedQuestions);
    toast({
      title: "Questão removida",
      description: "Questão removida da avaliação",
    });
  };

  const handleViewQuestion = async (question: Question) => {
    try {
      if (question.id && question.id !== 'preview') {
        const response = await api.get(`/questions/${question.id}`);
        setPreviewQuestion(response.data);
      } else {
        setPreviewQuestion(question);
      }
      setShowQuestionPreview(true);
    } catch (error) {
      console.error("Erro ao buscar questão:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar a questão",
        variant: "destructive",
      });
    }
  };

  const getQuestionsForSubject = (subjectId: string) => {
    const filtered = allQuestions.filter(q => {
      const questionWithSubjectId = q as { subjectId?: string; subject?: { id?: string }; subject_id?: string };
      // ✅ CORREÇÃO: Melhorar comparação para lidar com diferentes formatos
      const qSubjectId = questionWithSubjectId.subjectId || 
                         questionWithSubjectId.subject?.id || 
                         questionWithSubjectId.subject_id ||
                         (questionWithSubjectId.subject as any)?.id;
      
      // Comparar como strings para garantir match correto
      return String(qSubjectId || '').trim() === String(subjectId || '').trim();
    });
    console.log(`🔍 getQuestionsForSubject(${subjectId}): encontradas ${filtered.length} questões de ${allQuestions.length} totais`);
    return filtered;
  };

  // Debug: Log das questões quando mudarem
  useEffect(() => {
    if (allQuestions.length > 0) {
      console.log('📚 Questões no store:', allQuestions.length, allQuestions.map(q => ({ id: q.id, subjectId: (q as any).subjectId || (q as any).subject?.id })));
    } else {
      console.log('⚠️ Nenhuma questão no store');
    }
  }, [allQuestions]);

  // ✅ CORREÇÃO: Garantir que questões sejam preservadas quando step 2 é acessado
  // Usar useRef para evitar loop infinito
  const step2QuestionsLoadedRef = useRef(false);
  
  useEffect(() => {
    // Quando o step 2 é acessado e está em modo de edição, garantir que questões estejam carregadas
    // Resetar a flag quando mudar de step
    if (step !== 2) {
      step2QuestionsLoadedRef.current = false;
      return;
    }
    
    // Se já tentou carregar para este step, não tentar novamente
    if (step2QuestionsLoadedRef.current) {
      return;
    }
    
    if (step === 2 && (evaluationId || initialData)) {
      console.log('📋 Step 2 acessado - Verificando questões:', {
        allQuestionsCount: allQuestions.length,
        initialDataQuestionsCount: initialData?.questions?.length || 0,
        questionsLoaded,
        evaluationId
      });
      
      // Marcar que já tentou carregar para evitar loops
      step2QuestionsLoadedRef.current = true;
      
      // Se não há questões no store mas deveria haver, recarregar
      if (allQuestions.length === 0 && (initialData?.questions?.length || 0) > 0) {
        console.log('🔄 Step 2: Recarregando questões do initialData...');
        // ✅ CORREÇÃO: Garantir que todas as questões tenham subjectId
        const questionsWithSubjectId = initialData.questions.map((q: any) => {
          const subjectId = q.subjectId || 
                           q.subject?.id || 
                           q.subject_id || 
                           selectedSubjects[0]?.id || 
                           '';
          return {
            ...q,
            subjectId: subjectId,
            subject: q.subject || (subjectId ? { id: subjectId } : undefined)
          };
        });
        setQuestions(questionsWithSubjectId);
        setQuestionsLoaded(true);
        console.log('✅ Step 2: Questões do initialData recarregadas:', questionsWithSubjectId.map((q: any) => ({
          id: q.id,
          subjectId: q.subjectId
        })));
      } else if (allQuestions.length === 0 && evaluationId && !questionsLoaded) {
        // Tentar buscar da API se não foram carregadas ainda
        console.log('🔄 Step 2: Buscando questões da API...');
        api.get(`/questions?test_id=${evaluationId}`)
          .then(questionsResponse => {
            if (Array.isArray(questionsResponse.data) && questionsResponse.data.length > 0) {
              // ✅ CORREÇÃO: Garantir que todas as questões tenham subjectId
              const questionsData = questionsResponse.data.map((q: any) => {
                const subjectId = q.subject?.id || q.subject_id || q.subjectId || selectedSubjects[0]?.id || '';
                return {
                  id: q.id,
                  text: q.text || q.formattedText || '',
                  formattedText: q.formattedText || q.text || '',
                  title: q.title || q.command || '',
                  type: q.type === 'multiple_choice' ? 'multipleChoice' : (q.type === 'open' || q.type === 'essay' ? 'dissertativa' : 'multipleChoice'),
                  subjectId: subjectId,
                  subject: q.subject || (subjectId ? { id: subjectId } : undefined),
                  grade: q.grade,
                  difficulty: q.difficulty || '',
                  value: q.value || q.points || 0,
                  solution: q.solution || '',
                  formattedSolution: q.formattedSolution || q.solution || '',
                  options: q.alternatives?.map((alt: any) => ({
                    id: alt.id,
                    text: alt.text,
                    isCorrect: alt.isCorrect || false,
                  })) || q.options || [],
                  secondStatement: q.secondStatement || q.secondstatement || '',
                  skills: q.skills || '',
                };
              });
              setQuestions(questionsData);
              setQuestionsLoaded(true);
              console.log('✅ Step 2: Questões carregadas da API:', questionsData.length, questionsData.map((q: any) => ({
                id: q.id,
                subjectId: q.subjectId
              })));
            }
          })
          .catch(err => {
            console.error('❌ Erro ao buscar questões no step 2:', err);
            // Resetar flag em caso de erro para permitir nova tentativa
            step2QuestionsLoadedRef.current = false;
          });
      } else if (allQuestions.length > 0) {
        console.log('✅ Step 2: Questões já estão carregadas:', allQuestions.length);
      }
    }
  }, [step, evaluationId, initialData, questionsLoaded, setQuestions]); // Removido allQuestions.length das dependências

  // Garantir que questões sejam carregadas quando o modal abrir para edição
  // Este useEffect serve como fallback caso as questões não sejam carregadas no loadEvaluationData
  // Usar useRef para evitar loop infinito
  const fallbackQuestionsLoadedRef = useRef(false);
  
  useEffect(() => {
    // Aguardar um pouco para garantir que loadEvaluationData terminou
    if (!isOpen || loadingData) {
      // Resetar flag quando modal fechar
      if (!isOpen) {
        fallbackQuestionsLoadedRef.current = false;
      }
      return;
    }
    
    // Se já tentou carregar, não tentar novamente
    if (fallbackQuestionsLoadedRef.current) {
      return;
    }
    
    // Se há dados iniciais ou evaluationId mas não há questões no store após um tempo, tentar carregar
    if ((evaluationId || initialData)) {
      // Marcar que já tentou carregar
      fallbackQuestionsLoadedRef.current = true;
      
      const timer = setTimeout(() => {
        console.log('🔄 Fallback: Tentando recarregar questões após delay...');
        if (initialData?.questions && initialData.questions.length > 0) {
          console.log('📚 Fallback: Recarregando questões do initialData');
          // ✅ CORREÇÃO: Garantir que todas as questões tenham subjectId
          const questionsWithSubjectId = initialData.questions.map((q: any) => {
            const subjectId = q.subjectId || 
                             q.subject?.id || 
                             q.subject_id || 
                             selectedSubjects[0]?.id || 
                             '';
            return {
              ...q,
              subjectId: subjectId,
              subject: q.subject || (subjectId ? { id: subjectId } : undefined)
            };
          });
          setQuestions(questionsWithSubjectId);
          setQuestionsLoaded(true);
          console.log('✅ Fallback: Questões do initialData recarregadas:', questionsWithSubjectId.map((q: any) => ({
            id: q.id,
            subjectId: q.subjectId
          })));
        } else if (evaluationId) {
          // Tentar buscar questões da API novamente
          api.get(`/questions?test_id=${evaluationId}`)
            .then(questionsResponse => {
              if (Array.isArray(questionsResponse.data) && questionsResponse.data.length > 0) {
                console.log('📚 Fallback: Recarregando questões da API');
                // ✅ CORREÇÃO: Garantir que todas as questões tenham subjectId
                const questionsData = questionsResponse.data.map((q: any) => {
                  const subjectId = q.subject?.id || q.subject_id || q.subjectId || selectedSubjects[0]?.id || '';
                  return {
                    id: q.id,
                    text: q.text || q.formattedText || '',
                    formattedText: q.formattedText || q.text || '',
                    title: q.title || q.command || '',
                    type: q.type === 'multiple_choice' ? 'multipleChoice' : (q.type === 'open' || q.type === 'essay' ? 'dissertativa' : 'multipleChoice'),
                    subjectId: subjectId,
                    subject: q.subject || (subjectId ? { id: subjectId } : undefined),
                    grade: q.grade,
                    difficulty: q.difficulty || '',
                    value: q.value || q.points || 0,
                    solution: q.solution || '',
                    formattedSolution: q.formattedSolution || q.solution || '',
                    options: q.alternatives?.map((alt: any) => ({
                      id: alt.id,
                      text: alt.text,
                      isCorrect: alt.isCorrect || false,
                    })) || q.options || [],
                    secondStatement: q.secondStatement || q.secondstatement || '',
                    skills: q.skills || '',
                  };
                });
                setQuestions(questionsData);
                setQuestionsLoaded(true);
                console.log('✅ Fallback: Questões recarregadas da API:', questionsData.length, questionsData.map((q: any) => ({
                  id: q.id,
                  subjectId: q.subjectId
                })));
              }
            })
            .catch(err => {
              console.error('❌ Erro ao recarregar questões (fallback):', err);
              // Resetar flag em caso de erro para permitir nova tentativa
              fallbackQuestionsLoadedRef.current = false;
            });
        }
      }, 500); // Aguardar 500ms para garantir que loadEvaluationData terminou
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, evaluationId, initialData, loadingData, setQuestions]); // Removido allQuestions.length das dependências

  // Validações para o indicador de progresso
  const isTitleValid = title && title.trim().length >= 3;
  const isBasicInfoValid = isTitleValid && type && model && duration;
  const isCourseValid = isBasicInfoValid && course;
  const isGradeValid = isCourseValid && grade;
  const isLocationValid = isGradeValid && state;
  const isMunicipalityValid = isLocationValid && municipality;
  const isSchoolsValid = isMunicipalityValid && selectedSchools.length > 0;
  const isSubjectsValid = isSchoolsValid && selectedSubjects.length > 0;
  const isClassesValid = isSubjectsValid && selectedClasses.length > 0;

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && isOpen) {
      // Se já está navegando (após sucesso), não chamar handleClose novamente
      if (isNavigating) {
        return;
      }
      // Quando o dialog fechar (por qualquer motivo), chamar handleClose
      // Usar setTimeout para garantir que o estado do dialog seja atualizado primeiro
      setTimeout(() => {
        handleClose();
      }, 0);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-blue-600" />
            {evaluationId ? 'Editar Avaliação' : 'Nova Avaliação'}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && 'Configure os dados básicos da avaliação e selecione as turmas'}
            {step === 2 && 'Selecione as questões do banco'}
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-12 flex-1">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-6 flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full dark:[&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 dark:hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
            {/* Indicador de Progresso - Step 1 */}
            {step === 1 && (
              <Card className="bg-gradient-to-r from-blue-50 dark:from-blue-950/30 to-indigo-50 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300">Progresso do Formulário</h3>
                    <span className="text-sm text-blue-700 dark:text-blue-400">
                      {[
                        isTitleValid && type && model && duration,
                        isCourseValid,
                        isGradeValid,
                        isLocationValid,
                        isMunicipalityValid,
                        isSchoolsValid,
                        isSubjectsValid,
                        isClassesValid
                      ].filter(Boolean).length} de 8 etapas concluídas
                    </span>
                  </div>
                  <div className="grid grid-cols-8 gap-2">
                    {[
                      { label: "Básico", valid: isTitleValid && type && model && duration },
                      { label: "Curso", valid: isCourseValid },
                      { label: "Série", valid: isGradeValid },
                      { label: "Estado", valid: isLocationValid },
                      { label: "Município", valid: isMunicipalityValid },
                      { label: "Escolas", valid: isSchoolsValid },
                      { label: "Disciplinas", valid: isSubjectsValid },
                      { label: "Turmas", valid: isClassesValid }
                    ].map((stepItem, index) => (
                      <div key={index} className="text-center">
                        <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs font-medium ${
                          stepItem.valid 
                            ? 'bg-green-500 text-white' 
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {stepItem.valid ? '✓' : index + 1}
                        </div>
                        <p className="text-xs mt-1 text-muted-foreground">{stepItem.label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 1: Configuração */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Título *</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Prova de Matemática - 5º Ano"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descreva a avaliação..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Duração (minutos) *</Label>
                    <Input
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      min="1"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Tipo *</Label>
                    <Select value={type} onValueChange={(value) => setType(value as 'AVALIACAO' | 'SIMULADO')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AVALIACAO">Avaliação</SelectItem>
                        <SelectItem value="SIMULADO">Simulado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Modelo *</Label>
                  <Select value={model} onValueChange={(value) => setModel(value as 'SAEB' | 'PROVA' | 'AVALIE')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SAEB">SAEB</SelectItem>
                      <SelectItem value="PROVA">Prova</SelectItem>
                      <SelectItem value="AVALIE">Avalie</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Curso *</Label>
                    <Select value={course} onValueChange={setCourse}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o curso" />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Série *</Label>
                    <Select value={grade} onValueChange={setGrade} disabled={!course}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a série" />
                      </SelectTrigger>
                      <SelectContent>
                        {grades.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Estado *</Label>
                    <Select value={state} onValueChange={setState}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o estado" />
                      </SelectTrigger>
                      <SelectContent>
                        {states.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Município *</Label>
                    <Select value={municipality} onValueChange={setMunicipality} disabled={!state}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o município" />
                      </SelectTrigger>
                      <SelectContent>
                        {municipalities.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Escolas *</Label>
                    {!municipality && (
                      <span className="text-sm text-muted-foreground">Selecione um município primeiro</span>
                    )}
                    {municipality && schools.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAllSchools}
                      >
                        Selecionar Todas
                      </Button>
                    )}
                  </div>
                  
                  {schoolsLoading ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span>Carregando escolas...</span>
                    </div>
                  ) : !municipality ? (
                    <div className="flex items-center gap-2 p-4 bg-muted border rounded-lg">
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Selecione um município primeiro</span>
                    </div>
                  ) : (
                    <>
                      {schools.length > 0 && (
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Buscar escolas..."
                            value={schoolSearchTerm}
                            onChange={(e) => setSchoolSearchTerm(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      )}

                      {filteredSchools.length === 0 ? (
                        <div className="flex items-center gap-2 p-4 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                          <span className="text-sm text-yellow-800 dark:text-yellow-400">
                            {schoolSearchTerm ? 'Nenhuma escola encontrada com esse termo' : 'Nenhuma escola encontrada para este município'}
                          </span>
                        </div>
                      ) : (
                        <div className="max-h-56 overflow-y-auto rounded-lg border p-2 pr-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full dark:[&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 dark:hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
                          <div className="grid gap-2">
                            {filteredSchools.map((school) => {
                              const isSelected = selectedSchools.some(s => s.id === school.id);
                              return (
                                <div key={school.id} className="flex items-center space-x-2 p-2 hover:bg-muted rounded transition-colors">
                                  <Checkbox
                                    id={`school-${school.id}`}
                                    checked={isSelected}
                                    onCheckedChange={() => handleSchoolToggle(school)}
                                  />
                                  <Label
                                    htmlFor={`school-${school.id}`}
                                    className="flex-1 cursor-pointer"
                                  >
                                    {school.name}
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Escolas Selecionadas */}
                  {selectedSchools.length > 0 && (
                    <div className="space-y-2">
                      <Label>Escolas Selecionadas ({selectedSchools.length})</Label>
                      <div className="flex flex-wrap gap-2">
                        {selectedSchools.map((school) => (
                          <Badge key={school.id} variant="secondary" className="flex items-center gap-1">
                            <School className="h-3 w-3" />
                            {school.name}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 hover:bg-transparent"
                              onClick={() => handleRemoveSchool(school.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Disciplinas *</Label>
                  <div className="flex flex-wrap gap-2">
                    {allSubjects.map((subject) => {
                      const isSelected = selectedSubjects.some(s => s.id === subject.id);
                      return (
                        <DisciplineTag
                          key={subject.id}
                          subjectId={subject.id}
                          name={subject.name}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSubjectToggle(subject)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSubjectToggle(subject);
                            }
                          }}
                          className={cn(
                            'cursor-pointer transition-opacity',
                            isSelected
                              ? 'ring-2 ring-primary ring-offset-2 ring-offset-background opacity-100'
                              : 'opacity-60 hover:opacity-90'
                          )}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Seleção de Turmas */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Turmas *</Label>
                    <div className="flex items-center gap-2">
                      {availableClasses.length > 0 && !loadingClasses && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleSelectAllClasses}
                        >
                          Selecionar Todas
                        </Button>
                      )}
                      {selectedClasses.length > 0 && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {selectedClasses.length} turma{selectedClasses.length !== 1 ? 's' : ''} selecionada{selectedClasses.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {!municipality || !grade || selectedSchools.length === 0 ? (
                    <div className="flex items-center gap-2 p-4 bg-muted border rounded-lg">
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {!municipality ? 'Selecione um município primeiro' :
                         !grade ? 'Selecione uma série primeiro' :
                         'Selecione pelo menos uma escola primeiro'}
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* Busca de turmas */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar turmas..."
                          value={classSearchTerm}
                          onChange={(e) => setClassSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>

                      {/* Lista de turmas */}
                      <div className="max-h-[400px] overflow-y-auto space-y-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full dark:[&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 dark:hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
                        {loadingClasses ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                          </div>
                        ) : (() => {
                          // Combinar turmas disponíveis com turmas selecionadas
                          // Garantir que turmas selecionadas sempre apareçam
                          const selectedClassIds = new Set(selectedClasses.map(c => c.id));
                          const availableClassIds = new Set(availableClasses.map(c => c.id));
                          
                          // Turmas selecionadas que não estão na lista disponível
                          const selectedButNotAvailable = selectedClasses.filter(
                            c => !availableClassIds.has(c.id)
                          );
                          
                          // Combinar: turmas disponíveis + turmas selecionadas que não estão disponíveis
                          const allClassesToShow = [
                            ...availableClasses,
                            ...selectedButNotAvailable
                          ];
                          
                          // Filtrar por busca
                          const filtered = classSearchTerm
                            ? allClassesToShow.filter(c =>
                                c.name.toLowerCase().includes(classSearchTerm.toLowerCase()) ||
                                c.school?.name.toLowerCase().includes(classSearchTerm.toLowerCase())
                              )
                            : allClassesToShow;
                          
                          // Remover duplicatas (caso uma turma selecionada também esteja disponível)
                          const uniqueClasses = Array.from(
                            new Map(filtered.map(c => [c.id, c])).values()
                          ).sort((a, b) =>
                            classNameCollator.compare(a.name || '', b.name || '')
                          );
                          
                          if (uniqueClasses.length === 0) {
                            return (
                              <div className="text-center py-8 text-muted-foreground">
                                {classSearchTerm
                                  ? 'Nenhuma turma encontrada com esse termo'
                                  : 'Nenhuma turma encontrada para os filtros selecionados'}
                              </div>
                            );
                          }
                          
                          return uniqueClasses.map((classItem) => {
                            const isSelected = selectedClassIds.has(classItem.id);
                            const isNotAvailable = !availableClassIds.has(classItem.id);
                            
                            return (
                              <Card
                                key={classItem.id}
                                className={`cursor-pointer transition-all hover:shadow-md ${
                                  isSelected
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                                    : 'hover:border-blue-300'
                                } ${isNotAvailable ? 'opacity-75' : ''}`}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedClasses(selectedClasses.filter(c => c.id !== classItem.id));
                                  } else {
                                    setSelectedClasses([...selectedClasses, classItem]);
                                  }
                                }}
                              >
                                <CardContent className="p-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 flex-1">
                                      <Checkbox checked={isSelected} readOnly />
                                      <div className="flex-1">
                                        <div className="font-medium">{classItem.name}</div>
                                        {classItem.school && (
                                          <div className="text-sm text-muted-foreground">
                                            {classItem.school.name}
                                          </div>
                                        )}
                                        {isNotAvailable && (
                                          <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                                            (Turma selecionada - não corresponde aos filtros atuais)
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    {isSelected && (
                                      <Check className="h-5 w-5 text-blue-600" />
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          });
                        })()}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Seleção de Questões */}
            {step === 2 && (
              <div className="space-y-6" data-section="questions">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Questões da Avaliação</h3>
                    <p className="text-sm text-muted-foreground">
                      Total: {allQuestions.length}{' '}
                      {allQuestions.length === 1
                        ? 'questão selecionada'
                        : 'questões selecionadas'}
                    </p>
                  </div>
                </div>

                {/* ✅ CORREÇÃO: Verificação adicional para modo de edição */}
                {step === 2 && (evaluationId || initialData) && allQuestions.length === 0 && (initialData?.questions?.length || 0) > 0 && (
                  <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                          Carregando questões da avaliação...
                        </p>
                        <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                          Aguarde enquanto as questões são carregadas.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedSubjects.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Book className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma disciplina selecionada</p>
                    <p className="text-sm">Volte ao passo anterior e selecione pelo menos uma disciplina</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {selectedSubjects.map((subject) => {
                      const subjectQuestions = getQuestionsForSubject(subject.id);
                      
                      // ✅ CORREÇÃO: Log para debug quando não há questões mas deveria haver
                      if ((evaluationId || initialData) && subjectQuestions.length === 0 && allQuestions.length > 0) {
                        console.log(`⚠️ Nenhuma questão encontrada para disciplina ${subject.name} (${subject.id})`, {
                          allQuestions: allQuestions.map(q => ({
                            id: q.id,
                            subjectId: (q as any).subjectId,
                            subject: (q as any).subject?.id,
                            subject_id: (q as any).subject_id
                          }))
                        });
                      }
                      
                      return (
                        <Card key={subject.id}>
                          <CardContent className="pt-6">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                <Book className="h-5 w-5" />
                                <h3 className="text-lg font-medium">{subject.name}</h3>
                                <Badge variant="outline">
                                  {subjectQuestions.length}{' '}
                                  {subjectQuestions.length === 1 ? 'questão' : 'questões'}
                                </Badge>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleAddFromBank(subject.id)}
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Banco de Questões
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCreateNewQuestion(subject.id)}
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Nova Questão
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-3">
                              {subjectQuestions.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                  <Book className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                  <p>Nenhuma questão adicionada para {subject.name}</p>
                                  <p className="text-sm">Use os botões acima para adicionar questões</p>
                                </div>
                              ) : (
                                subjectQuestions.map((question, index) => {
                                  // ✅ CORREÇÃO: Criar chave única combinando ID da questão com ID da disciplina e índice
                                  const uniqueKey = `${subject.id}-${question.id || `temp-${index}`}-${index}`;
                                  const questionTypeLabel = (() => {
                                    const rawType = (question.type || '').toString().toLowerCase();
                                    if (rawType.includes('multiple')) return 'Múltipla Escolha';
                                    if (rawType.includes('dissert') || rawType.includes('essay') || rawType.includes('open')) return 'Dissertativa';
                                    if (rawType.includes('true')) return 'Verdadeiro/Falso';
                                    return question.type || 'Questão';
                                  })();
                                  const questionDifficultyLabel = (() => {
                                    const rawDifficulty = (question.difficulty || '').toString().toLowerCase();
                                    if (rawDifficulty.includes('abaixo')) return 'Abaixo do Básico';
                                    if (rawDifficulty.includes('adequado')) return 'Adequado';
                                    if (rawDifficulty.includes('avanç') || rawDifficulty.includes('avanc')) return 'Avançado';
                                    if (rawDifficulty.includes('bás') || rawDifficulty.includes('bas')) return 'Básico';
                                    return question.difficulty || '';
                                  })();
                                  const gradeLabel =
                                    grades.find((g) => g.id === grade)?.name || 'Série não informada';
                                  const pointsLabel =
                                    Number((question as unknown as { value?: number }).value) > 0
                                      ? `${Number((question as unknown as { value?: number }).value)} pt(s)`
                                      : Number((question as unknown as { points?: number }).points) > 0
                                        ? `${Number((question as unknown as { points?: number }).points)} pt(s)`
                                        : null;
                                  return (
                                  <div
                                    key={uniqueKey}
                                    className="flex items-center justify-between p-3 border rounded-lg bg-muted"
                                  >
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <Badge variant="secondary">#{index + 1}</Badge>
                                        <span className="text-sm font-medium">
                                          {question.title || `Questão ${index + 1}`}
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                        <DisciplineTag
                                          subjectId={subject.id}
                                          name={subject.name}
                                          className="text-[10px]"
                                        />
                                        <Badge variant="outline" className="text-[10px]">
                                          {gradeLabel}
                                        </Badge>
                                        {questionDifficultyLabel ? (
                                          <Badge variant="outline" className="text-[10px]">
                                            {questionDifficultyLabel}
                                          </Badge>
                                        ) : null}
                                        <Badge variant="outline" className="text-[10px]">
                                          {questionTypeLabel}
                                        </Badge>
                                        {pointsLabel ? (
                                          <Badge variant="outline" className="text-[10px]">
                                            {pointsLabel}
                                          </Badge>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleViewQuestion(question)}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveQuestion(question.id || "")}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  );
                                })
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navegação fixa no rodapé do modal */}
        {!loadingData && (
          <div className="flex justify-between pt-4 mt-4 border-t">
            <Button variant="outline" onClick={step > 1 ? () => setStep(step - 1) : handleClose}>
              {step > 1 ? 'Voltar' : 'Cancelar'}
            </Button>
            <div className="flex gap-2">
              {step < 2 && (
                <Button onClick={handleNext}>
                  Próximo
                </Button>
              )}
              {step === 2 && (
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    evaluationId ? 'Atualizar Avaliação' : 'Criar Avaliação'
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>

      {/* Modais de Questões */}
      <Dialog open={showQuestionBank} onOpenChange={setShowQuestionBank}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Banco de Questões</DialogTitle>
            <DialogDescription>
              Selecione questões do banco para adicionar à avaliação
            </DialogDescription>
          </DialogHeader>
          <QuestionBank
            open={showQuestionBank}
            subjectId={selectedSubjectForQuestion}
            onQuestionSelected={handleQuestionSelected}
            onClose={() => setShowQuestionBank(false)}
            gradeId={grade}
            gradeName={grades.find(g => g.id === grade)?.name}
            subjects={selectedSubjects}
            selectedSubjectId={selectedSubjectForQuestion}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showQuestionPreview} onOpenChange={setShowQuestionPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full dark:[&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 dark:hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
          <DialogHeader>
            <DialogTitle>Visualizar Questão</DialogTitle>
            <DialogDescription>
              Prévia completa da questão com alternativas e resolução
            </DialogDescription>
          </DialogHeader>
          {previewQuestion && (
            <QuestionPreview
              question={previewQuestion}
              onClose={() => setShowQuestionPreview(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateQuestion} onOpenChange={setShowCreateQuestion}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full dark:[&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 dark:hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">
          <DialogHeader>
            <DialogTitle>Criar Nova Questão</DialogTitle>
            <DialogDescription>
              Crie uma nova questão para adicionar à avaliação
            </DialogDescription>
          </DialogHeader>
          <QuestionFormReadOnly
            open={showCreateQuestion}
            onClose={() => setShowCreateQuestion(false)}
            onQuestionAdded={handleQuestionCreated}
            questionNumber={allQuestions.length + 1}
            evaluationData={{
              course: course,
              grade: grade,
              subject: selectedSubjectForQuestion
            }}
          />
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
