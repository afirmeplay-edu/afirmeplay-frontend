import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  ArrowLeft, 
  Users, 
  GraduationCap, 
  UserCheck, 
  Building2,
  Eye,
  Send,
  CheckCircle,
  Circle,
  ChevronDown,
  ChevronRight,
  Target,
  Calendar,
  Settings,
  Loader2,
  FileText
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { questionsAlunoJovem, questionsAlunoVelho, professorQuestions, diretorQuestions, secretarioQuestions } from '@/data';
import { Question, SubQuestion } from '@/types/forms';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// ✅ IDs de Education Stages pré-definidos para cada tipo de formulário
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

// Função para filtrar grades EJA por período
const filterEJAGrades = (grades: Array<{ id: string; name: string }>, formType: string): Array<{ id: string; name: string }> => {
  if (formType === 'aluno-jovem') {
    // Filtrar apenas períodos 1-5 para EJA Inicial
    return grades.filter(grade => {
      const name = grade.name.toLowerCase();
      return /^(1°|2°|3°|4°|5°)/.test(name) || 
             /^1[°º]/.test(name) || 
             /^2[°º]/.test(name) || 
             /^3[°º]/.test(name) || 
             /^4[°º]/.test(name) || 
             /^5[°º]/.test(name) ||
             (name.includes('período') && (name.includes('1') || name.includes('2') || name.includes('3') || name.includes('4') || name.includes('5')));
    });
  } else if (formType === 'aluno-velho') {
    // Filtrar apenas períodos 6-9 para EJA Avançado
    return grades.filter(grade => {
      const name = grade.name.toLowerCase();
      return /^(6°|7°|8°|9°)/.test(name) || 
             /^6[°º]/.test(name) || 
             /^7[°º]/.test(name) || 
             /^8[°º]/.test(name) || 
             /^9[°º]/.test(name) ||
             (name.includes('período') && (name.includes('6') || name.includes('7') || name.includes('8') || name.includes('9')));
    });
  }
  return grades;
};

// Função assíncrona para buscar IDs das séries baseado no tipo de formulário
const getGradeIdsForFormType = async (formType: string | null): Promise<string[]> => {
  if (!formType || formType === 'professor' || formType === 'diretor' || formType === 'secretario') {
    return []; // Esses tipos não precisam de séries
  }

  const educationStageIds = EDUCATION_STAGE_IDS_BY_FORM_TYPE[formType] || [];
  
  if (educationStageIds.length === 0) {
    console.warn(`Nenhum education stage definido para o tipo de formulário: ${formType}`);
    return [];
  }

  const allGradeIds: string[] = [];

  // Buscar séries de cada education stage
  for (const stageId of educationStageIds) {
    try {
      const response = await api.get(`/grades/education-stage/${stageId}`);
      const grades = response.data || [];
      
      // Se for EJA, filtrar os períodos corretos
      if (stageId === '63cb6876-3221-4fa2-89e8-a82ad1733032') {
        const filteredGrades = filterEJAGrades(grades, formType);
        const gradeIds = filteredGrades.map((grade: { id: string }) => grade.id);
        allGradeIds.push(...gradeIds);
        console.log(`📋 EJA ${formType}: ${filteredGrades.length} períodos encontrados`);
      } else {
        // Para outros education stages, incluir todas as grades
        const gradeIds = grades.map((grade: { id: string }) => grade.id);
        allGradeIds.push(...gradeIds);
        console.log(`📋 ${stageId}: ${grades.length} séries encontradas`);
      }
    } catch (error) {
      console.error(`Erro ao buscar séries do education stage ${stageId}:`, error);
    }
  }

  // Remover duplicatas (caso uma série apareça em múltiplos stages)
  const uniqueGradeIds = [...new Set(allGradeIds)];
  console.log(`✅ Total de séries únicas para ${formType}: ${uniqueGradeIds.length}`);
  
  return uniqueGradeIds;
};

// Tipos para as escolas
interface School {
  id: string;
  name: string;
  domain?: string;
  address?: string;
  city_id?: string;
  created_at?: string;
  students_count?: number;
  classes_count?: number;
  city?: {
    id: string;
    name: string;
    state: string;
    created_at?: string;
  };
}

// Tipos para usuários TecAdmin
interface TecAdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at?: string;
  last_login?: string;
  status?: string;
}

const FormCreate = () => {
  const navigate = useNavigate();
  const { formType } = useParams<{ formType: string }>();
  const [currentStep, setCurrentStep] = useState<'config' | 'preview' | 'send'>('config');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [schools, setSchools] = useState<School[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados para usuários TecAdmin (apenas para questionário do secretário)
  const [tecAdminUsers, setTecAdminUsers] = useState<TecAdminUser[]>([]);
  const [loadingTecAdminUsers, setLoadingTecAdminUsers] = useState(false);
  const [searchTermUsers, setSearchTermUsers] = useState('');
  
  // Configurações do formulário
  const [formConfig, setFormConfig] = useState({
    title: '',
    description: '',
    targetGroups: [] as string[],
    selectedSchools: [] as string[],
    selectAllSchools: false,
    selectedTecAdminUsers: [] as string[],
    selectAllTecAdminUsers: false,
    isActive: true,
    deadline: '',
    instructions: ''
  });

  // Estado para armazenar valores dos sliders
  const [sliderValues, setSliderValues] = useState<Record<string, number>>({});
  
  // Estado para armazenar respostas das textareas
  const [textareaValues, setTextareaValues] = useState<Record<string, string>>({});
  
  // Estado para controlar erros de validação
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
  // Estado para controlar o envio
  const [isSending, setIsSending] = useState(false);
  
  // Hook para toast
  const { toast } = useToast();

  // Mapeamento de tipos de formulário para grupos de destino
  const getTargetGroupsForFormType = (formType: string) => {
    switch (formType) {
      case 'aluno-jovem':
      case 'aluno-velho':
        return ['alunos'];
      case 'professor':
        return ['professores'];
      case 'diretor':
        return ['diretores'];
      case 'secretario':
        return ['secretarios'];
      default:
        return [];
    }
  };

  // Atualizar grupos de destino quando o tipo de formulário mudar
  useEffect(() => {
    if (formType) {
      const targetGroups = getTargetGroupsForFormType(formType);
      setFormConfig(prev => ({
        ...prev,
        targetGroups
      }));
    }
  }, [formType]);

  // Buscar escolas quando o componente carregar
  useEffect(() => {
    fetchSchools();
  }, []);

  // Buscar usuários TecAdmin quando o tipo for 'secretario'
  useEffect(() => {
    if (formType === 'secretario') {
      fetchTecAdminUsers();
    }
  }, [formType]);

  // Filtrar escolas baseado no termo de busca
  const filteredSchools = schools.filter(school => 
    school.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (school.city && school.city.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (school.city && school.city.state.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (school.address && school.address.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Filtrar usuários TecAdmin baseado no termo de busca
  const filteredTecAdminUsers = tecAdminUsers.filter(user => 
    user.name.toLowerCase().includes(searchTermUsers.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTermUsers.toLowerCase())
  );

  // Dados do formulário baseado no tipo
  const getFormData = () => {
    console.log('getFormData called with formType:', formType);
    switch (formType) {
      case 'aluno-jovem':
        console.log('Returning aluno-jovem data with', questionsAlunoJovem.length, 'questions');
        return {
          name: 'Aluno (Anos Iniciais)',
          description: 'Questionário socioeconômico para estudantes dos anos iniciais do Ensino Fundamental (1° ao 5° ano), EJA 1° ao 5° período e Educação Infantil.',
          questions: questionsAlunoJovem,
          icon: Users,
          color: 'bg-blue-500'
        };
      case 'aluno-velho':
        console.log('Returning aluno-velho data with', questionsAlunoVelho.length, 'questions');
        return {
          name: 'Aluno (Anos Finais)',
          description: 'Questionário socioeconômico para estudantes dos anos finais do Ensino Fundamental (6° ao 9° ano) e EJA 6° ao 9° período.',
          questions: questionsAlunoVelho,
          icon: GraduationCap,
          color: 'bg-green-500'
        };
      case 'professor':
        console.log('Returning professor data with', professorQuestions.length, 'questions');
        return {
          name: 'Professor',
          description: 'Questionário de caracterização e condições de trabalho para professores da Educação Básica.',
          questions: professorQuestions,
          icon: UserCheck,
          color: 'bg-purple-500'
        };
      case 'diretor':
        console.log('Returning diretor data with', diretorQuestions.length, 'questions');
        return {
          name: 'Diretor',
          description: 'Questionário de caracterização da escola e condições de gestão para diretores escolares.',
          questions: diretorQuestions,
          icon: Building2,
          color: 'bg-orange-500'
        };
      case 'secretario':
        console.log('Returning secretario data with', secretarioQuestions.length, 'questions');
        return {
          name: 'Secretário Municipal de Educação',
          description: 'Questionário de caracterização e gestão educacional para secretários municipais de educação.',
          questions: secretarioQuestions,
          icon: Building2,
          color: 'bg-indigo-500'
        };
      default:
        console.log('No form type matched, returning null');
        return null;
    }
  };

  const formData = getFormData();
  const IconComponent = formData?.icon || Users;

  // Grupos de destino disponíveis
  const getTargetGroups = () => {
    switch (formType) {
      case 'aluno-jovem':
        return [
          { id: 'alunos', name: 'Alunos (Anos Iniciais)', description: 'Estudantes de 6 a 11 anos - 1° ao 5° ano, EJA Inicial e Educação Infantil' }
        ];
      case 'aluno-velho':
        return [
          { id: 'alunos', name: 'Alunos (Anos Finais)', description: 'Estudantes de 12 a 17 anos - 6° ao 9° ano e EJA Avançado' }
        ];
      case 'professor':
        return [
          { id: 'professores', name: 'Professores', description: 'Corpo docente da Educação Básica' }
        ];
      case 'diretor':
        return [
          { id: 'diretores', name: 'Diretores', description: 'Gestores escolares e coordenadores' }
        ];
      case 'secretario':
        return [
          { id: 'secretarios', name: 'Secretários Municipais de Educação', description: 'Gestores da educação municipal' }
        ];
      default:
        return [
          { id: 'alunos', name: 'Alunos', description: 'Todos os estudantes' },
          { id: 'professores', name: 'Professores', description: 'Corpo docente' },
          { id: 'diretores', name: 'Diretores', description: 'Gestores escolares' },
          { id: 'coordenadores', name: 'Coordenadores', description: 'Coordenadores pedagógicos' },
          { id: 'tecnicos', name: 'Técnicos', description: 'Equipe técnica' }
        ];
    }
  };

  const targetGroups = getTargetGroups();

  // Função para buscar escolas
  const fetchSchools = async () => {
    setLoadingSchools(true);
    try {
      const response = await api.get('/school');
      setSchools(response.data || []);
    } catch (error) {
      console.error('Erro ao buscar escolas:', error);
      // Em caso de erro, usar dados mockados como fallback
      setSchools([
        { 
          id: '1', 
          name: 'Escola Municipal João Silva', 
          address: 'Rua das Flores, 123',
          students_count: 150, 
          classes_count: 8,
          city: { id: '1', name: 'São Paulo', state: 'SP' }
        },
        { 
          id: '2', 
          name: 'Escola Estadual Maria Santos', 
          address: 'Av. Paulista, 456',
          students_count: 200, 
          classes_count: 10,
          city: { id: '1', name: 'São Paulo', state: 'SP' }
        },
        { 
          id: '3', 
          name: 'Escola Municipal Pedro Costa', 
          address: 'Rua Copacabana, 789',
          students_count: 120, 
          classes_count: 6,
          city: { id: '2', name: 'Rio de Janeiro', state: 'RJ' }
        },
        { 
          id: '4', 
          name: 'Escola Estadual Ana Oliveira', 
          address: 'Av. Ipanema, 321',
          students_count: 180, 
          classes_count: 9,
          city: { id: '2', name: 'Rio de Janeiro', state: 'RJ' }
        }
      ]);
    } finally {
      setLoadingSchools(false);
    }
  };

  // Função para buscar usuários TecAdmin (apenas para questionário do secretário)
  const fetchTecAdminUsers = async () => {
    setLoadingTecAdminUsers(true);
    try {
      const response = await api.get('/professores/tecadm');
      setTecAdminUsers(response.data || []);
    } catch (error) {
      console.error('Erro ao buscar usuários TecAdmin:', error);
      // Em caso de erro, usar dados mockados como fallback
      setTecAdminUsers([
        { 
          id: '1', 
          name: 'João Silva', 
          email: 'joao.silva@educacao.gov.br',
          role: 'tecadm',
          status: 'ativo',
          last_login: '2024-01-15'
        },
        { 
          id: '2', 
          name: 'Maria Santos', 
          email: 'maria.santos@educacao.gov.br',
          role: 'tecadm',
          status: 'ativo',
          last_login: '2024-01-14'
        },
        { 
          id: '3', 
          name: 'Pedro Costa', 
          email: 'pedro.costa@educacao.gov.br',
          role: 'tecadm',
          status: 'ativo',
          last_login: '2024-01-13'
        },
        { 
          id: '4', 
          name: 'Ana Oliveira', 
          email: 'ana.oliveira@educacao.gov.br',
          role: 'tecadm',
          status: 'ativo',
          last_login: '2024-01-12'
        }
      ]);
    } finally {
      setLoadingTecAdminUsers(false);
    }
  };

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };


  const handleSchoolToggle = (schoolId: string) => {
    setFormConfig(prev => ({
      ...prev,
      selectedSchools: prev.selectedSchools.includes(schoolId)
        ? prev.selectedSchools.filter(id => id !== schoolId)
        : [...prev.selectedSchools, schoolId],
      selectAllSchools: false
    }));
  };

  const handleSelectAllSchools = () => {
    setFormConfig(prev => ({
      ...prev,
      selectAllSchools: !prev.selectAllSchools,
      selectedSchools: !prev.selectAllSchools ? filteredSchools.map(school => school.id) : []
    }));
  };

  const handleTecAdminUserToggle = (userId: string) => {
    setFormConfig(prev => ({
      ...prev,
      selectedTecAdminUsers: prev.selectedTecAdminUsers.includes(userId)
        ? prev.selectedTecAdminUsers.filter(id => id !== userId)
        : [...prev.selectedTecAdminUsers, userId],
      selectAllTecAdminUsers: false
    }));
  };

  const handleSelectAllTecAdminUsers = () => {
    setFormConfig(prev => ({
      ...prev,
      selectAllTecAdminUsers: !prev.selectAllTecAdminUsers,
      selectedTecAdminUsers: !prev.selectAllTecAdminUsers ? filteredTecAdminUsers.map(user => user.id) : []
    }));
  };

  const renderQuestion = (question: Question, index: number) => {
    console.log('renderQuestion called with:', question, 'index:', index);
    // Inicializar valor do slider se não existir
    const sliderValue = sliderValues[question.id] ?? Math.floor(((question.min || 0) + (question.max || 100)) / 2);

    const handleSliderChange = (questionId: string, value: number) => {
      setSliderValues(prev => ({
        ...prev,
        [questionId]: value
      }));
    };

    const handleTextareaChange = (questionId: string, value: string) => {
      setTextareaValues(prev => ({
        ...prev,
        [questionId]: value
      }));
    };

    return (
      <div key={question.id} className="p-4 border rounded-lg bg-card">
        <div className="flex items-start gap-3">
          <span className="text-sm font-medium text-muted-foreground mt-1">
            {index + 1}.
          </span>
          <div className="flex-1">
            <h4 className="font-medium text-foreground mb-2">
              {question.texto || question.text}
            </h4>
            
            {(question.tipo === 'selecao_unica' || question.type === 'selecao_unica') && (
              <div className="space-y-2">
                {(question.opcoes || question.options)?.map((option: string, optIndex: number) => (
                  <label key={optIndex} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-muted transition-colors duration-200">
                    <span className="flex items-center justify-center w-6 h-6 bg-muted rounded-full text-xs font-medium text-muted-foreground">
                      {String.fromCharCode(65 + optIndex)}
                    </span>
                    <span className="text-sm text-foreground">{option}</span>
                  </label>
                ))}
              </div>
            )}

            {(question.tipo === 'multipla_escolha' || question.type === 'multipla_escolha') && (
              <div className="space-y-2">
                {(question.subPerguntas || question.subQuestions)?.map((subQ: SubQuestion, subIndex: number) => (
                  <div key={subQ.id} className="ml-4">
                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-muted transition-colors duration-200">
                      <span className="flex items-center justify-center w-6 h-6 bg-muted rounded-full text-xs font-medium text-muted-foreground">
                        {String.fromCharCode(65 + subIndex)}
                      </span>
                      <span className="text-sm text-foreground">{subQ.texto || subQ.text}</span>
                    </label>
                  </div>
                ))}
              </div>
            )}

            {(question.tipo === 'matriz_selecao' || question.type === 'matriz_selecao') && (
              <div className="space-y-3">
                {(question.subPerguntas || question.subQuestions)?.map((subQ: SubQuestion, subIndex: number) => (
                  <div key={subQ.id} className="ml-4">
                    <p className="text-sm font-medium text-foreground mb-2">
                      {subQ.texto || subQ.text}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {(question.opcoes || question.options)?.map((option: string, optIndex: number) => (
                        <label key={optIndex} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-muted transition-colors duration-200">
                          <span className="flex items-center justify-center w-6 h-6 bg-muted rounded-full text-xs font-medium text-muted-foreground">
                            {String.fromCharCode(65 + optIndex)}
                          </span>
                          <span className="text-sm text-muted-foreground">{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(question.tipo === 'matriz_selecao_complexa' || question.type === 'matriz_selecao_complexa') && (
              <div className="space-y-3">
                {(question.subPerguntas || question.subQuestions)?.map((subQ: SubQuestion, subIndex: number) => (
                  <div key={subQ.id} className="ml-4">
                    <p className="text-sm font-medium text-foreground mb-2">
                      {subQ.texto || subQ.text}
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {(question.opcoes || question.options)?.map((option: string, optIndex: number) => (
                        <label key={optIndex} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-muted transition-colors duration-200">
                          <span className="flex items-center justify-center w-6 h-6 bg-muted rounded-full text-xs font-medium text-muted-foreground">
                            {String.fromCharCode(65 + optIndex)}
                          </span>
                          <span className="text-sm text-muted-foreground">{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(question.tipo === 'matriz_slider' || question.type === 'matriz_slider') && (
              <div className="space-y-3">
                {(question.subPerguntas || question.subQuestions)?.map((subQ: SubQuestion, subIndex: number) => (
                  <div key={subQ.id} className="ml-4">
                    <p className="text-sm font-medium text-foreground mb-2">
                      {subQ.texto || subQ.text}
                    </p>
                    <div className="relative">
                      <input
                        type="range"
                        min={question.min || 0}
                        max={question.max || 100}
                        value={sliderValues[`${question.id}_${subQ.id}`] ?? Math.floor(((question.min || 0) + (question.max || 100)) / 2)}
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer slider-input"
                        style={{
                          background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((sliderValues[`${question.id}_${subQ.id}`] ?? Math.floor(((question.min || 0) + (question.max || 100)) / 2)) - (question.min || 0)) / ((question.max || 100) - (question.min || 0)) * 100}%, #e5e7eb ${((sliderValues[`${question.id}_${subQ.id}`] ?? Math.floor(((question.min || 0) + (question.max || 100)) / 2)) - (question.min || 0)) / ((question.max || 100) - (question.min || 0)) * 100}%, #e5e7eb 100%)`,
                          WebkitAppearance: 'none',
                          appearance: 'none'
                        }}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          setSliderValues(prev => ({
                            ...prev,
                            [`${question.id}_${subQ.id}`]: value
                          }));
                        }}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-2">
                        <span>{question.min || 0}</span>
                        <span className="font-medium text-foreground">
                          Valor: <span className="text-blue-600 font-semibold">
                            {sliderValues[`${question.id}_${subQ.id}`] ?? Math.floor(((question.min || 0) + (question.max || 100)) / 2)}
                          </span>
                        </span>
                        <span>{question.max || 100}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(question.tipo === 'slider_com_opcao' || question.type === 'slider_com_opcao') && (
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="range"
                    min={question.min || 0}
                    max={question.max || 100}
                    value={sliderValue}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer slider-input"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((sliderValue - (question.min || 0)) / ((question.max || 100) - (question.min || 0))) * 100}%, #e5e7eb ${((sliderValue - (question.min || 0)) / ((question.max || 100) - (question.min || 0))) * 100}%, #e5e7eb 100%)`,
                      WebkitAppearance: 'none',
                      appearance: 'none'
                    }}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      handleSliderChange(question.id, value);
                    }}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>{question.min || 0}</span>
                    <span className="font-medium text-foreground">
                      Valor: <span className="text-blue-600 font-semibold">
                        {sliderValue}
                      </span>
                    </span>
                    <span>{question.max || 100}</span>
                  </div>
                </div>
                {question.optionText && (
                  <div className="mt-2">
                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-muted transition-colors duration-200">
                      <input type="checkbox" className="w-4 h-4 text-blue-600 rounded" />
                      <span className="text-sm text-muted-foreground">{question.optionText}</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {(question.tipo === 'slider' || question.type === 'slider') && (
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="range"
                    min={question.min || 0}
                    max={question.max || 100}
                    value={sliderValue}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer slider-input"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((sliderValue - (question.min || 0)) / ((question.max || 100) - (question.min || 0))) * 100}%, #e5e7eb ${((sliderValue - (question.min || 0)) / ((question.max || 100) - (question.min || 0))) * 100}%, #e5e7eb 100%)`,
                      WebkitAppearance: 'none',
                      appearance: 'none'
                    }}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      handleSliderChange(question.id, value);
                    }}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>{question.min || 0}</span>
                    <span className="font-medium text-foreground">
                      Valor: <span className="text-blue-600 font-semibold">
                        {sliderValue}
                      </span>
                    </span>
                    <span>{question.max || 100}</span>
                  </div>
                </div>
              </div>
            )}

            {(question.tipo === 'textarea' || question.type === 'textarea') && (
              <div className="space-y-2">
                <textarea 
                  className="w-full p-3 border border-border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200" 
                  rows={4}
                  placeholder="Digite sua resposta aqui..."
                  value={textareaValues[question.id] || ''}
                  onChange={(e) => handleTextareaChange(question.id, e.target.value)}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Resposta livre</span>
                  <span>{textareaValues[question.id]?.length || 0} caracteres</span>
                </div>
              </div>
            )}

            {question.obrigatoria && (
              <Badge variant="destructive" className="mt-2 text-xs">
                Obrigatória
              </Badge>
            )}
          </div>
        </div>
      </div>
    );
  };


  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formConfig.title.trim()) {
      errors.title = 'Título é obrigatório';
    }

    // Validar prazo de resposta
    if (!formConfig.deadline) {
      errors.deadline = 'Prazo de resposta é obrigatório';
    } else {
      // Validar se a data não é no passado
      const selectedDate = new Date(formConfig.deadline);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Zerar horas para comparar apenas a data
      
      if (selectedDate < today) {
        errors.deadline = 'O prazo não pode ser uma data passada';
      }
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    if (currentStep === 'config') {
      if (validateForm()) {
        setCurrentStep('preview');
      }
    } else if (currentStep === 'preview') {
      setCurrentStep('send');
    }
  };

  // Função para normalizar questões do formato local para o formato da API
  const normalizeQuestions = (questions: Question[]): any[] => {
    return questions.map((question, index) => {
      const normalized: any = {
        id: question.id,
        text: question.text || question.texto || '',
        type: question.type || question.tipo || 'selecao_unica',
        required: question.required !== undefined ? question.required : (question.obrigatoria !== undefined ? question.obrigatoria : false),
        order: index + 1
      };

      // Adicionar opções se existirem
      if (question.options || question.opcoes) {
        normalized.options = question.options || question.opcoes;
      }

      // Adicionar subperguntas se existirem
      if (question.subQuestions || question.subPerguntas) {
        normalized.subQuestions = (question.subQuestions || question.subPerguntas)?.map(subQ => ({
          id: subQ.id,
          text: subQ.text || subQ.texto || ''
        }));
      }

      // Adicionar min/max para sliders
      if (question.min !== undefined) {
        normalized.min = question.min;
      }
      if (question.max !== undefined) {
        normalized.max = question.max;
      }

      // Adicionar optionId e optionText para slider_com_opcao
      if (question.optionId) {
        normalized.optionId = question.optionId;
      }
      if (question.optionText) {
        normalized.optionText = question.optionText;
      }

      // Adicionar dependsOn se existir
      if (question.dependsOn) {
        normalized.dependsOn = question.dependsOn;
      }

      return normalized;
    });
  };

  const handleSendForm = async () => {
    // Validar antes de enviar
    if (!validateForm()) {
      toast({
        title: "Erro de validação",
        description: "Por favor, corrija os erros antes de enviar o questionário.",
        variant: "destructive",
      });
      return;
    }

    // Validar seleção de escolas/usuários
    if (formType !== 'secretario') {
      const selectedSchoolsList = formConfig.selectAllSchools 
        ? schools.map(s => s.id) 
        : formConfig.selectedSchools;
      
      if (selectedSchoolsList.length === 0) {
        toast({
          title: "Seleção obrigatória",
          description: "Selecione pelo menos uma escola para enviar o questionário.",
          variant: "destructive",
        });
        return;
      }
    } else {
      const selectedUsersList = formConfig.selectAllTecAdminUsers
        ? tecAdminUsers.map(u => u.id)
        : formConfig.selectedTecAdminUsers;
      
      if (selectedUsersList.length === 0) {
        toast({
          title: "Seleção obrigatória",
          description: "Selecione pelo menos um usuário TecAdmin para enviar o questionário.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSending(true);

    try {
      // Preparar dados do questionário
      const questions = formData?.questions || [];
      const normalizedQuestions = normalizeQuestions(questions);

      // ✅ BUSCAR IDs das séries dinamicamente via API
      const gradeIds = await getGradeIdsForFormType(formType);
      
      if (gradeIds.length === 0 && (formType === 'aluno-jovem' || formType === 'aluno-velho')) {
        console.warn(`⚠️ Nenhuma série encontrada para ${formType}. Verifique os education stages.`);
      }

      // Preparar payload
      const formPayload: any = {
        title: formConfig.title.trim(),
        description: formConfig.description.trim() || undefined,
        formType: formType,
        targetGroups: formConfig.targetGroups,
        isActive: formConfig.isActive,
        deadline: formConfig.deadline ? new Date(formConfig.deadline).toISOString() : undefined,
        instructions: formConfig.instructions.trim() || undefined,
        questions: normalizedQuestions
      };

      // ✅ ADICIONAR: IDs das séries (apenas para tipos de alunos)
      if (gradeIds.length > 0) {
        formPayload.selectedGrades = gradeIds;
        console.log('📋 Séries adicionadas ao payload:', gradeIds.length, 'séries');
      }

      // Adicionar escolas ou usuários TecAdmin conforme o tipo
      if (formType === 'secretario') {
        formPayload.selectedTecAdminUsers = formConfig.selectAllTecAdminUsers
          ? tecAdminUsers.map(u => u.id)
          : formConfig.selectedTecAdminUsers;
      } else {
        formPayload.selectedSchools = formConfig.selectAllSchools
          ? schools.map(s => s.id)
          : formConfig.selectedSchools;
      }

      // 1. Criar o questionário
      toast({
        title: "Criando questionário...",
        description: "Aguarde enquanto o questionário é criado.",
      });

      const createResponse = await api.post('/forms', formPayload);
      const formId = createResponse.data.id;

      // 2. Enviar o questionário para os destinatários
      toast({
        title: "Enviando questionário...",
        description: "Aguarde enquanto o questionário é enviado para os destinatários.",
      });

      const sendResponse = await api.post(`/forms/${formId}/send`, {
        notifyUsers: true,
        sendNotification: true
      });

      // Sucesso!
      toast({
        title: "Questionário enviado com sucesso!",
        description: `Questionário enviado para ${sendResponse.data.totalRecipients || 0} destinatários.`,
      });

      // Navegar de volta para a lista
      navigate('/app/questionarios/cadastro');
    } catch (error: any) {
      console.error('Erro ao enviar questionário:', error);
      
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error 
        || error.message 
        || 'Erro desconhecido ao enviar o questionário';

      toast({
        title: "Erro ao enviar questionário",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  if (!formData) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Tipo de questionário não encontrado</h1>
          <Button onClick={() => navigate('/app/questionarios/cadastro')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-4 px-3 py-4 sm:space-y-6 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => navigate('/app/questionarios/cadastro')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div className="flex-1 space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
            <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
            Criar Questionário
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">Configure e envie um novo questionário</p>
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          <Badge variant="outline" className="flex items-center gap-1">
            <Settings className="h-3 w-3" />
            {formData.name}
          </Badge>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-start gap-3 overflow-x-auto pb-2 sm:justify-center sm:gap-8">
        <div className={`flex items-center gap-2 ${currentStep === 'config' ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            currentStep === 'config' ? 'bg-blue-600 text-white' : 'bg-muted'
          }`}>
            1
          </div>
          <span className="font-medium">Configuração</span>
        </div>
        <div className={`h-0.5 w-8 shrink-0 sm:w-16 ${currentStep === 'preview' || currentStep === 'send' ? 'bg-blue-600' : 'bg-muted'}`}></div>
        <div className={`flex items-center gap-2 ${currentStep === 'preview' ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            currentStep === 'preview' ? 'bg-blue-600 text-white' : 'bg-muted'
          }`}>
            2
          </div>
          <span className="font-medium">Visualização</span>
        </div>
        <div className={`h-0.5 w-8 shrink-0 sm:w-16 ${currentStep === 'send' ? 'bg-blue-600' : 'bg-muted'}`}></div>
        <div className={`flex items-center gap-2 ${currentStep === 'send' ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            currentStep === 'send' ? 'bg-blue-600 text-white' : 'bg-muted'
          }`}>
            3
          </div>
          <span className="font-medium">Envio</span>
        </div>
      </div>

      {/* Step 1: Configuration */}
      {currentStep === 'config' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuração do Questionário
            </CardTitle>
            <CardDescription>
              Configure as informações básicas e grupos de destino do questionário
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="title">
                  Título do Questionário <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="Digite o título do questionário"
                  value={formConfig.title}
                  onChange={(e) => {
                    setFormConfig(prev => ({ ...prev, title: e.target.value }));
                    if (validationErrors.title) {
                      setValidationErrors(prev => {
                        const newErrors = { ...prev };
                        delete newErrors.title;
                        return newErrors;
                      });
                    }
                  }}
                  className={validationErrors.title ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}
                />
                {validationErrors.title && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <span className="text-red-500">⚠</span>
                    {validationErrors.title}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="deadline">
                  Prazo de Resposta <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="deadline"
                  type="date"
                  value={formConfig.deadline}
                  onChange={(e) => {
                    setFormConfig(prev => ({ ...prev, deadline: e.target.value }));
                    // Limpar erro quando o usuário começar a digitar
                    if (validationErrors.deadline) {
                      setValidationErrors(prev => {
                        const newErrors = { ...prev };
                        delete newErrors.deadline;
                        return newErrors;
                      });
                    }
                  }}
                  className={validationErrors.deadline ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}
                />
                {validationErrors.deadline && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <span className="text-red-500">⚠</span>
                    {validationErrors.deadline}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Digite a descrição do questionário (opcional)"
                value={formConfig.description}
                onChange={(e) => setFormConfig(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructions">Instruções Especiais</Label>
              <Textarea
                id="instructions"
                placeholder="Instruções adicionais para os respondentes..."
                value={formConfig.instructions}
                onChange={(e) => setFormConfig(prev => ({ ...prev, instructions: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-4">
              <Label>Grupos de Destino</Label>
              <div className="p-4 bg-gray-50 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded border-2 border-blue-500 bg-blue-500 flex items-center justify-center">
                    <CheckCircle className="h-3 w-3 text-white" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">
                      {formConfig.targetGroups.map(id => targetGroups.find(g => g.id === id)?.name).join(', ')}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {formConfig.targetGroups.map(id => targetGroups.find(g => g.id === id)?.description).join(', ')}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  O grupo de destino é definido automaticamente baseado no tipo de questionário selecionado.
                </p>
              </div>
            </div>

            {/* Seção de seleção - Escolas para outros tipos, Usuários TecAdmin para secretário */}
            {formType === 'secretario' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Escolha o Secretário Municipal de destino</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllTecAdminUsers}
                      className="text-xs"
                      disabled={filteredTecAdminUsers.length === 0}
                    >
                      {formConfig.selectAllTecAdminUsers ? 'Desmarcar Todos' : 'Selecionar Todos'}
                    </Button>
                  </div>
                </div>
                
                {/* Campo de busca */}
                <div className="relative">
                  <Input
                    placeholder="Buscar usuários por nome ou email..."
                    value={searchTermUsers}
                    onChange={(e) => setSearchTermUsers(e.target.value)}
                    className="pr-10"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    {searchTermUsers ? (
                      <button
                        type="button"
                        onClick={() => setSearchTermUsers('')}
                        className="text-gray-400 hover:text-muted-foreground transition-colors"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    ) : (
                      <svg
                        className="h-4 w-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto border rounded-lg">
                  {loadingTecAdminUsers ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                      <span className="ml-2 text-sm text-muted-foreground">Carregando usuários TecAdmin...</span>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredTecAdminUsers.map((user) => (
                        <div
                          key={user.id}
                          className={`p-3 cursor-pointer transition-colors ${
                            formConfig.selectedTecAdminUsers.includes(user.id) || formConfig.selectAllTecAdminUsers
                              ? 'bg-blue-50 border-l-4 border-blue-500'
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => handleTecAdminUserToggle(user.id)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                              formConfig.selectedTecAdminUsers.includes(user.id) || formConfig.selectAllTecAdminUsers
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-border'
                            }`}>
                              {(formConfig.selectedTecAdminUsers.includes(user.id) || formConfig.selectAllTecAdminUsers) && (
                                <CheckCircle className="h-3 w-3 text-white" />
                              )}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{user.name}</h4>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>{user.email}</span>
                                <span className="text-xs text-muted-foreground">
                                  {user.status || 'ativo'}
                                </span>
                                {user.last_login && (
                                  <span className="text-xs text-muted-foreground">
                                    Último acesso: {new Date(user.last_login).toLocaleDateString('pt-BR')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {filteredTecAdminUsers.length === 0 && !loadingTecAdminUsers && (
                        <div className="p-8 text-center text-muted-foreground">
                          <UserCheck className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                          <p>
                            {searchTermUsers 
                              ? `Nenhum usuário encontrado para "${searchTermUsers}"`
                              : 'Nenhum usuário TecAdmin encontrado'
                            }
                          </p>
                          {searchTermUsers && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSearchTermUsers('')}
                              className="mt-2"
                            >
                              Limpar busca
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formConfig.selectAllTecAdminUsers 
                    ? `Todos os ${filteredTecAdminUsers.length} usuários selecionados`
                    : `${formConfig.selectedTecAdminUsers.length} de ${filteredTecAdminUsers.length} usuários selecionados`
                  }
                  {searchTermUsers && tecAdminUsers.length !== filteredTecAdminUsers.length && (
                    <span className="ml-2 text-blue-600">
                      (filtrados de {tecAdminUsers.length} total)
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Escolas de Destino</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllSchools}
                      className="text-xs"
                      disabled={filteredSchools.length === 0}
                    >
                      {formConfig.selectAllSchools ? 'Desmarcar Todas' : 'Selecionar Todas'}
                    </Button>
                  </div>
                </div>
                
                {/* Campo de busca */}
                <div className="relative">
                  <Input
                    placeholder="Buscar escolas por nome, cidade, estado ou endereço..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="text-gray-400 hover:text-muted-foreground transition-colors"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    ) : (
                      <svg
                        className="h-4 w-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto border rounded-lg">
                  {loadingSchools ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                      <span className="ml-2 text-sm text-muted-foreground">Carregando escolas...</span>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredSchools.map((school) => (
                        <div
                          key={school.id}
                          className={`p-3 cursor-pointer transition-colors ${
                            formConfig.selectedSchools.includes(school.id) || formConfig.selectAllSchools
                              ? 'bg-blue-50 border-l-4 border-blue-500'
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => handleSchoolToggle(school.id)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                              formConfig.selectedSchools.includes(school.id) || formConfig.selectAllSchools
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-border'
                            }`}>
                              {(formConfig.selectedSchools.includes(school.id) || formConfig.selectAllSchools) && (
                                <CheckCircle className="h-3 w-3 text-white" />
                              )}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">{school.name}</h4>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>
                                  {school.city ? `${school.city.name}, ${school.city.state}` : 'Localização não informada'}
                                </span>
                                {school.address && (
                                  <span className="text-xs text-muted-foreground">
                                    {school.address}
                                  </span>
                                )}
                                {school.students_count && (
                                  <span className="text-xs text-muted-foreground">
                                    {school.students_count} alunos
                                  </span>
                                )}
                                {school.classes_count && (
                                  <span className="text-xs text-muted-foreground">
                                    {school.classes_count} turmas
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {filteredSchools.length === 0 && !loadingSchools && (
                        <div className="p-8 text-center text-muted-foreground">
                          <Building2 className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                          <p>
                            {searchTerm 
                              ? `Nenhuma escola encontrada para "${searchTerm}"`
                              : 'Nenhuma escola encontrada'
                            }
                          </p>
                          {searchTerm && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSearchTerm('')}
                              className="mt-2"
                            >
                              Limpar busca
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formConfig.selectAllSchools 
                    ? `Todas as ${filteredSchools.length} escolas selecionadas`
                    : `${formConfig.selectedSchools.length} de ${filteredSchools.length} escolas selecionadas`
                  }
                  {searchTerm && schools.length !== filteredSchools.length && (
                    <span className="ml-2 text-blue-600">
                      (filtradas de {schools.length} total)
                    </span>
                  )}
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <Button 
                onClick={handleNextStep} 
                disabled={
                  !formConfig.title.trim() ||
                  !formConfig.deadline || 
                  (formType === 'secretario' 
                    ? (formConfig.selectedTecAdminUsers.length === 0 && !formConfig.selectAllTecAdminUsers)
                    : (formConfig.selectedSchools.length === 0 && !formConfig.selectAllSchools)
                  )
                }
                className={Object.keys(validationErrors).length > 0 ? 'bg-red-500 hover:bg-red-600' : ''}
              >
                {Object.keys(validationErrors).length > 0 ? 'Corrija os erros acima' : 'Próximo: Visualização'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {currentStep === 'preview' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Visualização do Questionário
              </CardTitle>
              <CardDescription>
                Veja como o questionário será apresentado aos respondentes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-6 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg border">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">{formConfig.title}</h2>
                  {formConfig.description && (
                    <p className="text-foreground mb-4">{formConfig.description}</p>
                  )}
                  {formConfig.instructions && (
                    <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                      <p className="text-sm text-yellow-800">
                        <strong>Instruções:</strong> {formConfig.instructions}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Target className="h-4 w-4" />
                      <span>Público: {formConfig.targetGroups.map(id => targetGroups.find(g => g.id === id)?.name).join(', ')}</span>
                    </div>
                    {formConfig.deadline && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>Prazo: {new Date(formConfig.deadline).toLocaleDateString('pt-BR')}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                    {formType === 'secretario' ? (
                      <>
                        <div className="flex items-center gap-2 text-sm text-blue-800">
                          <UserCheck className="h-4 w-4" />
                          <span className="font-medium">
                            {formConfig.selectAllTecAdminUsers 
                              ? `Todos os ${tecAdminUsers.length} usuários TecAdmin`
                              : `${formConfig.selectedTecAdminUsers.length} usuário(s) TecAdmin selecionado(s)`
                            }
                          </span>
                        </div>
                        {!formConfig.selectAllTecAdminUsers && formConfig.selectedTecAdminUsers.length > 0 && (
                          <div className="mt-2 text-xs text-blue-700">
                            {formConfig.selectedTecAdminUsers.slice(0, 3).map(id => {
                              const user = tecAdminUsers.find(u => u.id === id);
                              return user?.name;
                            }).join(', ')}
                            {formConfig.selectedTecAdminUsers.length > 3 && ` e mais ${formConfig.selectedTecAdminUsers.length - 3} usuário(s)`}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-sm text-blue-800">
                          <Building2 className="h-4 w-4" />
                          <span className="font-medium">
                            {formConfig.selectAllSchools 
                              ? `Todas as ${schools.length} escolas`
                              : `${formConfig.selectedSchools.length} escola(s) selecionada(s)`
                            }
                          </span>
                        </div>
                        {!formConfig.selectAllSchools && formConfig.selectedSchools.length > 0 && (
                          <div className="mt-2 text-xs text-blue-700">
                            {formConfig.selectedSchools.slice(0, 3).map(id => {
                              const school = schools.find(s => s.id === id);
                              return school?.name;
                            }).join(', ')}
                            {formConfig.selectedSchools.length > 3 && ` e mais ${formConfig.selectedSchools.length - 3} escola(s)`}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {(() => {
                    console.log('FormData:', formData);
                    console.log('FormType:', formType);
                    console.log('Questions type:', Array.isArray(formData?.questions) ? 'Array' : 'Sections');
                    console.log('Questions data:', formData?.questions);
                    
                    if (Array.isArray(formData.questions)) {
                      console.log('Rendering array questions:', formData.questions.length);
                      return formData.questions.map((question, index) => {
                        console.log('Rendering question:', question);
                        return renderQuestion(question, index);
                      });
                    } else {
                      console.log('Rendering section questions');
                      const allQuestions = (formData.questions as { title: string; questions: Question[] }[]).flatMap((section, sectionIndex) => {
                        console.log('Section:', section.title, 'Questions:', section.questions.length);
                        return section.questions.map((question, questionIndex) => {
                          console.log('Rendering question from section:', question);
                          return renderQuestion(question, sectionIndex * 1000 + questionIndex);
                        });
                      });
                      console.log('Total questions to render:', allQuestions.length);
                      return allQuestions;
                    }
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCurrentStep('config')}>
              Voltar: Configuração
            </Button>
            <Button onClick={handleNextStep}>
              Próximo: Envio
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Send */}
      {currentStep === 'send' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Enviar Questionário
            </CardTitle>
            <CardDescription>
              Revise as configurações e envie o questionário para os grupos selecionados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Resumo do Questionário</h3>
                <div className="space-y-2 text-sm">
                  <div><strong>Título:</strong> {formConfig.title}</div>
                  <div><strong>Público:</strong> {formConfig.targetGroups.map(id => targetGroups.find(g => g.id === id)?.name).join(', ')}</div>
                  <div><strong>{formType === 'secretario' ? 'Usuários TecAdmin:' : 'Escolas:'}</strong> {formType === 'secretario' 
                    ? (formConfig.selectAllTecAdminUsers 
                        ? `Todos os ${tecAdminUsers.length} usuários TecAdmin`
                        : `${formConfig.selectedTecAdminUsers.length} usuário(s) TecAdmin selecionado(s)`
                      )
                    : (formConfig.selectAllSchools 
                        ? `Todas as ${schools.length} escolas`
                        : `${formConfig.selectedSchools.length} escola(s) selecionada(s)`
                      )
                  }</div>
                  <div><strong>Prazo:</strong> {formConfig.deadline ? new Date(formConfig.deadline).toLocaleDateString('pt-BR') : 'Não definido'}</div>
                  <div><strong>Status:</strong> {formConfig.isActive ? 'Ativo' : 'Inativo'}</div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Ações Disponíveis</h3>
                <div className="space-y-2">
                  <Button 
                    className="w-full" 
                    onClick={handleSendForm}
                    disabled={isSending}
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Enviar Questionário
                      </>
                    )}
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setCurrentStep('preview')}
                    disabled={isSending}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Visualizar Novamente
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setCurrentStep('config')}
                    disabled={isSending}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Editar Configurações
                  </Button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-green-900">Pronto para Envio</h4>
                  <p className="text-sm text-green-700 mt-1">
                    O questionário está configurado e pronto para ser enviado. Após o envio, os usuários dos grupos selecionados receberão uma notificação para preenchimento.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <Button 
                variant="outline" 
                onClick={() => setCurrentStep('preview')}
                disabled={isSending}
              >
                Voltar: Visualização
              </Button>
              <Button 
                onClick={handleSendForm} 
                className="bg-green-600 hover:bg-green-700"
                disabled={isSending}
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Confirmar Envio
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default FormCreate;