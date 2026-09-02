import { useState, useEffect, useRef, useCallback } from 'react';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  ChevronRight, 
  ChevronLeft, 
  Download, 
  CheckCircle,
  AlertCircle,
  Users,
  School,
  FileText,
  X,
  RefreshCw,
  Clock,
  Loader2,
  Trash2,
  MapPin,
} from 'lucide-react';
import { api } from '@/lib/api';
import { fetchAuthenticatedDownload } from '@/lib/fetch-authenticated-download';
import {
  formatGenerationScopeSummary,
  formatGabaritoGradesLabel,
  generationCanDownload,
  generationClassLabelsFromSnapshot,
  gabaritoDownloadLoadingKey,
  resolveGabaritoDownloadUrl,
  resolveGenerationDownloadUrl,
} from '@/lib/gabarito-list-helpers';
import { MultiSelect } from '@/components/ui/multi-select';
import { AnswerSheetConfig, StudentAnswerSheet, School as SchoolType, Serie, Turma, Estado, Municipio, Gabarito, GabaritosResponse } from '@/types/answer-sheet';
import SkillsSelector from '@/components/evaluations/questions/SkillsSelector';
import { useSkillsStore } from '@/stores/useSkillsStore';

type Step = 1 | 2;

export default function AnswerSheetGenerator() {
  // LEGADO: este componente cobre o fluxo antigo em `/app/cartao-resposta`.
  // O submenu "Gerar cartões" usa `AnswerSheetGenerateCards` em `/app/cartao-resposta/gerar`.
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Estados da Etapa 1: Configuração
  // Filtros hierárquicos (cascata dinâmica)
  type FilterLevel = 'state' | 'city' | 'school' | 'grade' | 'class';
  
  interface FilterOption {
    id: string;
    name: string;
    count: number;
  }
  
  interface SelectedFilters {
    state?: string;
    city?: string;
    school_ids?: string[];
    grade_ids?: string[];
    class_ids?: string[];
  }

  const [estados, setEstados] = useState<Estado[]>([]);
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>({});
  const [currentFilterLevel, setCurrentFilterLevel] = useState<FilterLevel>('state');
  const [availableOptions, setAvailableOptions] = useState<FilterOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [filterLabels, setFilterLabels] = useState<Record<FilterLevel, string>>({
    state: '',
    city: '',
    school: '',
    grade: '',
    class: '',
  });

  // Cache de opções para cada nível (para não perder dados ao mudar de nível)
  const [stateOptions, setStateOptions] = useState<FilterOption[]>([]);
  const [cityOptions, setCityOptions] = useState<FilterOption[]>([]);
  const [schoolOptions, setSchoolOptions] = useState<FilterOption[]>([]);
  const [gradeOptions, setGradeOptions] = useState<FilterOption[]>([]);
  const [classOptions, setClassOptions] = useState<FilterOption[]>([]);

  // Configuração de questões e gabarito manual
  const [totalQuestoes, setTotalQuestoes] = useState<number>(0);
  const [gabaritoManual, setGabaritoManual] = useState<Record<number, 'A' | 'B' | 'C' | 'D'>>({});
  const [department, setDepartment] = useState<string>('Secretaria Municipal de Educação');
  const [provaTitulo, setProvaTitulo] = useState('');
  /** Séries do gabarito (persistidas em `grades`); distintas do escopo opcional de geração. */
  const [cartaoGradeIds, setCartaoGradeIds] = useState<string[]>([]);
  
  // Estados para alternativas personalizadas
  const [questionsOptions, setQuestionsOptions] = useState<Record<number, ('A' | 'B' | 'C' | 'D')[]>>({});
  const [useGlobalAlternatives, setUseGlobalAlternatives] = useState<boolean>(true);
  const [globalAlternatives, setGlobalAlternatives] = useState<('A' | 'B' | 'C' | 'D')[]>(['A', 'B', 'C', 'D']);
  const [editingQuestionAlternatives, setEditingQuestionAlternatives] = useState<number | null>(null);

  // Disciplina e série opcionais para habilidades do gabarito (todas as questões usam a mesma lista)
  const [skillSubjectId, setSkillSubjectId] = useState<string>('');
  const [skillGradeId, setSkillGradeId] = useState<string>('');
  const [subjectsForSkills, setSubjectsForSkills] = useState<{ id: string; name: string }[]>([]);
  const [gradesForSkills, setGradesForSkills] = useState<{ id: string; name: string }[]>([]);
  const [gabaritoSkills, setGabaritoSkills] = useState<{ id: string; code: string; description: string; name: string }[]>([]);
  const [isLoadingGabaritoSkills, setIsLoadingGabaritoSkills] = useState(false);
  const [questionSkills, setQuestionSkills] = useState<Record<number, string[]>>({});
  const [editingQuestionSkills, setEditingQuestionSkills] = useState<number | null>(null);

  // Blocos por disciplina (único modo de blocos)

  // Estados para separação por disciplina
  const [disciplines, setDisciplines] = useState<{id: string; name: string}[]>([]);
  const [isLoadingDisciplines, setIsLoadingDisciplines] = useState(false);
  const [blocksByDiscipline, setBlocksByDiscipline] = useState<Array<{
    block_id: number;
    subject_name: string;
    subject_id: string;
    questions_count: number;
    start_question: number;
    end_question: number;
  }>>([]);

  // Estados da Etapa 2: Geração e Download (NOVO - com job hierárquico)
  interface JobTask {
    parent_id: string;
    parent_type: string;
    parent_name: string;
    classes_count?: number;
    students_count: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    task_id: string;
    celery_task_id?: string;
    started_at?: string;
    completed_at?: string;
  }

  interface JobProgress {
    completed_tasks: number;
    total_tasks: number;
    percentage: number;
  }

  const [isGenerating, setIsGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobTasks, setJobTasks] = useState<JobTask[]>([]);
  const [jobProgress, setJobProgress] = useState<JobProgress>({ completed_tasks: 0, total_tasks: 0, percentage: 0 });
  const [jobScopeType, setJobScopeType] = useState<string>('');
  const [jobWarnings, setJobWarnings] = useState<string[]>([]);
  const [jobDownloadUrl, setJobDownloadUrl] = useState<string | null>(null);
  const [isSavingJobZip, setIsSavingJobZip] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Estados para cartões gerados
  const [gabaritos, setGabaritos] = useState<Gabarito[]>([]);
  const [isLoadingGabaritos, setIsLoadingGabaritos] = useState(false);
  const [downloadingGabaritoId, setDownloadingGabaritoId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('generate');
  const [selectedGabaritos, setSelectedGabaritos] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'single' | 'multiple'>('single');
  const [gabaritoToDelete, setGabaritoToDelete] = useState<string | null>(null);

  // Função para normalizar as opções recebidas do backend
  const normalizeOptions = (rawOptions: any): FilterOption[] => {
    if (!rawOptions) return [];

    // Se for array de objetos com id e nome/name
    if (Array.isArray(rawOptions) && rawOptions.length > 0 && typeof rawOptions[0] === 'object') {
      return rawOptions.map(item => ({
        id: item.id || item.uuid || item.value || String(item),
        name: item.nome || item.name || item.label || item.text || String(item),
        count: item.count || item.total || 0
      }));
    }
    
    // Se for array de strings (apenas códigos/nomes)
    if (Array.isArray(rawOptions)) {
      return rawOptions.map((item, idx) => ({
        id: typeof item === 'string' ? item : String(item.id || idx),
        name: typeof item === 'string' ? item : item.nome || item.name || String(item),
        count: 0
      }));
    }
    
    // Se for objeto (chaves são IDs)
    if (typeof rawOptions === 'object' && !Array.isArray(rawOptions)) {
      return Object.entries(rawOptions).map(([key, value]: [string, any]) => ({
        id: key,
        name: typeof value === 'string' ? value : value.nome || value.name || key,
        count: value.count || 0
      }));
    }
    
    return [];
  };

  // Carregar Estados iniciais ao montar (para o primeiro nível da cascata)
  useEffect(() => {
    const fetchInitialStates = async () => {
      try {
        setIsLoadingOptions(true);
        // Chamar GET /opcoes-filtros sem parâmetros para obter os Estados disponíveis
        const response = await api.get('/answer-sheets/opcoes-filtros');
        const data = response.data;

        // Resposta agora vem com: { estados, municipios, escolas, series, turmas }
        // Para o primeiro carregamento, mostrar apenas os estados
        const normalizedStates = normalizeOptions(data.estados);
        setStateOptions(normalizedStates);
        setAvailableOptions(normalizedStates);
        setCurrentFilterLevel('state');
      } catch (error) {
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar os estados.',
          variant: 'destructive',
        });
        setStateOptions([]);
        setAvailableOptions([]);
      } finally {
        setIsLoadingOptions(false);
      }
    };
    fetchInitialStates();
  }, [toast]);

  // Cleanup do polling interval ao desmontar componente
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // NOVO: Carregar próximas opções de filtro (cascata dinâmica)
  const loadNextFilterOptions = async (filters: SelectedFilters) => {
    try {
      setIsLoadingOptions(true);
      const firstSchoolId = filters.school_ids?.[0];
      const firstGradeId = filters.grade_ids?.[0];
      const schoolIds = filters.school_ids ?? [];

      if (!filters.state && !filters.city && !schoolIds.length) {
        const params = new URLSearchParams();
        const url = `/answer-sheets/opcoes-filtros`;
        const response = await api.get(url);
        const data = response.data;
        if (data.estados) {
          const normalized = normalizeOptions(data.estados);
          setStateOptions(normalized);
          setAvailableOptions(normalized);
        }
        return;
      }

      if (filters.state && !filters.city) {
        const params = new URLSearchParams();
        if (filters.state) params.append('estado', filters.state);
        const url = `/answer-sheets/opcoes-filtros?${params.toString()}`;
        const response = await api.get(url);
        const data = response.data;
        if (data.municipios) {
          const normalized = normalizeOptions(data.municipios);
          setCityOptions(normalized);
          setAvailableOptions(normalized);
        }
        return;
      }

      if (filters.city && !schoolIds.length) {
        const params = new URLSearchParams();
        if (filters.state) params.append('estado', filters.state);
        if (filters.city) params.append('municipio', filters.city);
        const url = `/answer-sheets/opcoes-filtros?${params.toString()}`;
        const response = await api.get(url);
        const data = response.data;
        if (data.escolas) {
          const normalized = normalizeOptions(data.escolas);
          setSchoolOptions(normalized);
          setAvailableOptions(normalized);
        }
        return;
      }

      // Múltiplas escolas: buscar séries de cada escola e unir (escolas sem turmas não preenchem série)
      if (schoolIds.length > 0 && !(filters.grade_ids?.length)) {
        const seriesById = new Map<string, { id: string; name: string; count?: number }>();
        for (const schoolId of schoolIds) {
          const params = new URLSearchParams();
          if (filters.state) params.append('estado', filters.state);
          if (filters.city) params.append('municipio', filters.city);
          params.append('escola', schoolId);
          const url = `/answer-sheets/opcoes-filtros?${params.toString()}`;
          const response = await api.get(url);
          const data = response.data;
          if (data.series) {
            const normalized = normalizeOptions(data.series);
            for (const opt of normalized) {
              if (!seriesById.has(opt.id)) seriesById.set(opt.id, { id: opt.id, name: opt.name, count: opt.count });
            }
          }
        }
        const merged = Array.from(seriesById.values());
        setGradeOptions(merged);
        setAvailableOptions(merged);
        return;
      }

      // Múltiplas escolas + série(s): buscar turmas de cada escola (com a série) e unir
      if (schoolIds.length > 0 && filters.grade_ids?.length && !(filters.class_ids?.length)) {
        const turmasById = new Map<string, { id: string; name: string; count?: number }>();
        for (const schoolId of schoolIds) {
          const params = new URLSearchParams();
          if (filters.state) params.append('estado', filters.state);
          if (filters.city) params.append('municipio', filters.city);
          params.append('escola', schoolId);
          if (firstGradeId) params.append('serie', firstGradeId);
          const url = `/answer-sheets/opcoes-filtros?${params.toString()}`;
          const response = await api.get(url);
          const data = response.data;
          if (data.turmas) {
            const normalized = normalizeOptions(data.turmas);
            for (const opt of normalized) {
              if (!turmasById.has(opt.id)) turmasById.set(opt.id, { id: opt.id, name: opt.name, count: opt.count });
            }
          }
        }
        const merged = Array.from(turmasById.values());
        setClassOptions(merged);
        setAvailableOptions(merged);
        return;
      }

      // Fluxo com uma escola apenas (ou quando já tem grade/turma selecionado)
      const params = new URLSearchParams();
      if (filters.state) params.append('estado', filters.state);
      if (filters.city) params.append('municipio', filters.city);
      if (firstSchoolId) params.append('escola', firstSchoolId);
      if (firstGradeId) params.append('serie', firstGradeId);
      if (filters.class_ids?.length) params.append('turma', filters.class_ids[0]);
      const queryString = params.toString();
      const url = `/answer-sheets/opcoes-filtros${queryString ? '?' + queryString : ''}`;
      const response = await api.get(url);
      const data = response.data;
      if (schoolIds.length > 0 && !(filters.grade_ids?.length) && data.series) {
        const normalized = normalizeOptions(data.series);
        setGradeOptions(normalized);
        setAvailableOptions(normalized);
      } else if (filters.grade_ids?.length && !(filters.class_ids?.length) && data.turmas) {
        const normalized = normalizeOptions(data.turmas);
        setClassOptions(normalized);
        setAvailableOptions(normalized);
      }
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as próximas opções.',
        variant: 'destructive',
      });
      setAvailableOptions([]);
    } finally {
      setIsLoadingOptions(false);
    }
  };

  // Selecionar filtro (apenas estado e município são single-select)
  const handleSelectFilter = async (level: FilterLevel, optionId: string, optionName: string) => {
    if (level !== 'state' && level !== 'city') return;
    const newFilters: SelectedFilters = { ...selectedFilters };
    if (level === 'state') {
      newFilters.state = optionId;
      newFilters.city = undefined;
      newFilters.school_ids = undefined;
      newFilters.grade_ids = undefined;
      newFilters.class_ids = undefined;
    } else {
      newFilters.city = optionId;
      newFilters.school_ids = undefined;
      newFilters.grade_ids = undefined;
      newFilters.class_ids = undefined;
    }
    setSelectedFilters(newFilters);
    setFilterLabels(prev => ({ ...prev, [level]: optionName, city: level === 'state' ? '' : prev.city, school: '', grade: '', class: '' }));
    if (level === 'state') setFilterLabels(prev => ({ ...prev, state: optionName }));
    await loadNextFilterOptions(newFilters);
  };

  // Handlers para multi-select (escola, série, turma)
  const handleSchoolIdsChange = useCallback((ids: string[]) => {
    const newFilters: SelectedFilters = { ...selectedFilters, school_ids: ids.length ? ids : undefined, grade_ids: undefined, class_ids: undefined };
    setSelectedFilters(newFilters);
    setFilterLabels(prev => ({ ...prev, grade: '', class: '' }));
    if (ids.length > 0) loadNextFilterOptions(newFilters);
    else { setGradeOptions([]); setClassOptions([]); }
  }, [selectedFilters]);

  const handleGradeIdsChange = useCallback((ids: string[]) => {
    const newFilters: SelectedFilters = { ...selectedFilters, grade_ids: ids.length ? ids : undefined, class_ids: undefined };
    setSelectedFilters(newFilters);
    setFilterLabels(prev => ({ ...prev, class: '' }));
    if (ids.length > 0) loadNextFilterOptions(newFilters);
    else setClassOptions([]);
  }, [selectedFilters]);

  const handleClassIdsChange = useCallback((ids: string[]) => {
    setSelectedFilters(prev => ({ ...prev, class_ids: ids.length ? ids : undefined }));
  }, []);

  // Limpar um nível de filtro
  const handleClearFilter = (level: FilterLevel) => {
    const newFilters = { ...selectedFilters };
    if (level === 'state') {
      setSelectedFilters({});
      setAvailableOptions(stateOptions);
      setCurrentFilterLevel('state');
      setFilterLabels({ state: '', city: '', school: '', grade: '', class: '' });
      setCityOptions([]);
      setSchoolOptions([]);
      setGradeOptions([]);
      setClassOptions([]);
    } else if (level === 'city') {
      delete newFilters.city;
      newFilters.school_ids = undefined;
      newFilters.grade_ids = undefined;
      newFilters.class_ids = undefined;
      setSelectedFilters(newFilters);
      setAvailableOptions(cityOptions);
      setCurrentFilterLevel('city');
      setFilterLabels(prev => ({ ...prev, city: '', school: '', grade: '', class: '' }));
      setSchoolOptions([]);
      setGradeOptions([]);
      setClassOptions([]);
    } else if (level === 'school') {
      newFilters.school_ids = undefined;
      newFilters.grade_ids = undefined;
      newFilters.class_ids = undefined;
      setSelectedFilters(newFilters);
      setAvailableOptions(schoolOptions);
      setCurrentFilterLevel('school');
      setFilterLabels(prev => ({ ...prev, school: '', grade: '', class: '' }));
      setGradeOptions([]);
      setClassOptions([]);
    } else if (level === 'grade') {
      newFilters.grade_ids = undefined;
      newFilters.class_ids = undefined;
      setSelectedFilters(newFilters);
      setAvailableOptions(gradeOptions);
      setCurrentFilterLevel('grade');
      setFilterLabels(prev => ({ ...prev, grade: '', class: '' }));
      setClassOptions([]);
    } else if (level === 'class') {
      newFilters.class_ids = undefined;
      setSelectedFilters(newFilters);
      setAvailableOptions(classOptions);
      setCurrentFilterLevel('class');
      setFilterLabels(prev => ({ ...prev, class: '' }));
    }
  };

  // Carregar disciplinas quando houver questões (para a seção de blocos)
  useEffect(() => {
    if (totalQuestoes > 0 && disciplines.length === 0) {
      fetchDisciplines();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalQuestoes]);

  // Carregar lista de disciplinas para o select de habilidades do gabarito
  useEffect(() => {
    const fetchSubjectsForSkills = async () => {
      try {
        const response = await api.get<{ id: string; name: string }[]>('/subjects');
        setSubjectsForSkills(Array.isArray(response.data) ? response.data : []);
      } catch {
        setSubjectsForSkills([]);
      }
    };
    fetchSubjectsForSkills();
  }, []);

  // Carregar séries para o select de habilidades do gabarito
  useEffect(() => {
    const fetchGrades = async () => {
      try {
        const response = await api.get<{ id: string; name: string }[]>('/grades/');
        setGradesForSkills(Array.isArray(response.data) ? response.data : []);
      } catch {
        setGradesForSkills([]);
      }
    };
    fetchGrades();
  }, []);

  // Carregar skills da disciplina + série selecionadas (para habilidades do gabarito)
  useEffect(() => {
    if (!skillSubjectId) {
      setGabaritoSkills([]);
      return;
    }
    if (!skillGradeId) {
      setGabaritoSkills([]);
      return;
    }
    const fetchSkills = async () => {
      try {
        setIsLoadingGabaritoSkills(true);
        const fetchSkillsBySubjectAndGrade = useSkillsStore.getState().fetchSkills;
        const list = await fetchSkillsBySubjectAndGrade(skillSubjectId, skillGradeId);
        setGabaritoSkills(
          Array.isArray(list)
            ? list.map((s) => ({
                id: s.id,
                code: s.code,
                description: s.description,
                name: s.name || `${s.code} - ${s.description}`,
              }))
            : []
        );
      } catch {
        setGabaritoSkills([]);
        toast({
          title: 'Aviso',
          description: 'Não foi possível carregar as habilidades para esta disciplina e série.',
          variant: 'default',
        });
      } finally {
        setIsLoadingGabaritoSkills(false);
      }
    };
    fetchSkills();
  }, [skillSubjectId, skillGradeId, toast]);

  const fetchDisciplines = async () => {
    try {
      setIsLoadingDisciplines(true);
      const response = await api.get('/subjects');
      setDisciplines(response.data || []);
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as disciplinas.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingDisciplines(false);
    }
  };

  // Funções para gerenciar blocos por disciplina
  const handleAddDisciplineBlock = (disciplineId: string, disciplineName: string) => {
    const currentTotalQuestions = blocksByDiscipline.reduce((sum, block) => sum + block.questions_count, 0);
    
    if (blocksByDiscipline.length >= 4) {
      toast({ 
        title: 'Limite atingido', 
        description: 'Máximo de 4 blocos permitidos.', 
        variant: 'destructive' 
      });
      return;
    }
    
    if (currentTotalQuestions >= totalQuestoes) {
      toast({ 
        title: 'Limite atingido', 
        description: 'Todas as questões já foram distribuídas nos blocos.', 
        variant: 'destructive' 
      });
      return;
    }
    
    const startQuestion = currentTotalQuestions + 1;
    const remainingQuestions = totalQuestoes - currentTotalQuestions;
    const defaultQuestionsCount = Math.min(26, remainingQuestions);
    
    const newBlock = {
      block_id: blocksByDiscipline.length + 1,
      subject_name: disciplineName,
      subject_id: disciplineId,
      questions_count: defaultQuestionsCount,
      start_question: startQuestion,
      end_question: startQuestion + defaultQuestionsCount - 1
    };
    
    setBlocksByDiscipline([...blocksByDiscipline, newBlock]);
  };

  const handleRemoveDisciplineBlock = (blockId: number) => {
    const filteredBlocks = blocksByDiscipline.filter(b => b.block_id !== blockId);
    
    // Recalcular IDs e posições dos blocos
    const updatedBlocks = filteredBlocks.map((block, index) => {
      const previousBlocks = filteredBlocks.slice(0, index);
      const startQuestion = previousBlocks.reduce((sum, b) => sum + b.questions_count, 0) + 1;
      return {
        ...block,
        block_id: index + 1,
        start_question: startQuestion,
        end_question: startQuestion + block.questions_count - 1
      };
    });
    
    setBlocksByDiscipline(updatedBlocks);
  };

  const handleUpdateBlockQuestions = (blockId: number, newCount: number) => {
    const maxPerBlock = 26;
    const validCount = Math.min(Math.max(1, newCount), maxPerBlock);
    
    const blockIndex = blocksByDiscipline.findIndex(b => b.block_id === blockId);
    if (blockIndex === -1) return;
    
    // Calcular quantas questões estão sendo usadas por outros blocos
    const otherBlocksTotal = blocksByDiscipline
      .filter(b => b.block_id !== blockId)
      .reduce((sum, b) => sum + b.questions_count, 0);
    
    // Verificar se a nova contagem não ultrapassa o total de questões disponível
    if (otherBlocksTotal + validCount > totalQuestoes) {
      toast({
        title: 'Limite excedido',
        description: `Você só pode distribuir até ${totalQuestoes} questões no total.`,
        variant: 'destructive'
      });
      return;
    }
    
    // Atualizar blocos recalculando as posições
    const updatedBlocks = blocksByDiscipline.map((block, index) => {
      if (block.block_id === blockId) {
        const previousBlocks = blocksByDiscipline.slice(0, index);
        const startQuestion = previousBlocks.reduce((sum, b) => sum + b.questions_count, 0) + 1;
        return {
          ...block,
          questions_count: validCount,
          start_question: startQuestion,
          end_question: startQuestion + validCount - 1
        };
      }
      
      // Recalcular blocos subsequentes
      if (index > blockIndex) {
        const previousBlocks = updatedBlocks.slice(0, index);
        const startQuestion = previousBlocks.reduce((sum, b) => sum + b.questions_count, 0) + 1;
        return {
          ...block,
          start_question: startQuestion,
          end_question: startQuestion + block.questions_count - 1
        };
      }
      
      return block;
    });
    
    setBlocksByDiscipline(updatedBlocks);
  };

  // Função para validar configurações de blocos por disciplina
  const validateDisciplineBlocks = (): { isValid: boolean; warnings: string[] } => {
    const warnings: string[] = [];
    
    if (blocksByDiscipline.length === 0) {
      warnings.push('❌ Adicione pelo menos uma disciplina aos blocos.');
      return { isValid: false, warnings };
    }
    
    if (blocksByDiscipline.length > 4) {
      warnings.push('❌ Máximo de 4 blocos permitidos.');
      return { isValid: false, warnings };
    }
    
    const totalBlockQuestions = blocksByDiscipline.reduce((sum, b) => sum + b.questions_count, 0);
    if (totalBlockQuestions !== totalQuestoes) {
      warnings.push(`❌ A soma das questões nos blocos (${totalBlockQuestions}) deve ser igual ao total de questões (${totalQuestoes}).`);
      return { isValid: false, warnings };
    }
    
    const hasInvalidBlock = blocksByDiscipline.some(b => b.questions_count > 26);
    if (hasInvalidBlock) {
      warnings.push('❌ Máximo de 26 questões por bloco.');
      return { isValid: false, warnings };
    }
    
    const hasInvalidBlockCount = blocksByDiscipline.some(b => b.questions_count <= 0);
    if (hasInvalidBlockCount) {
      warnings.push('❌ Cada bloco deve ter pelo menos 1 questão.');
      return { isValid: false, warnings };
    }
    
    return { isValid: true, warnings };
  };

  // Função para validar configurações de blocos (apenas por disciplina)
  const validateBlockSettings = (): { isValid: boolean; warnings: string[] } => {
    if (blocksByDiscipline.length > 0) {
      return validateDisciplineBlocks();
    }
    return { isValid: true, warnings: [] };
  };

  const hasDisciplineBlocks = blocksByDiscipline.length >= 2;

  const handleChangeRespostaQuestao = (numeroQuestao: number, alternativa: string) => {
    const alternativaUpper = alternativa.toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(alternativaUpper)) {
      return;
    }

    // Obter alternativas disponíveis para esta questão
    const availableAlternatives = useGlobalAlternatives
      ? globalAlternatives
      : (questionsOptions[numeroQuestao] || ['A', 'B', 'C', 'D']);

    // Validar se a alternativa está disponível para esta questão
    if (!availableAlternatives.includes(alternativaUpper as 'A' | 'B' | 'C' | 'D')) {
      toast({
        title: 'Alternativa inválida',
        description: `A alternativa ${alternativaUpper} não está disponível para a questão ${numeroQuestao}.`,
        variant: 'destructive',
      });
      return;
    }

    setGabaritoManual(prev => ({
      ...prev,
      [numeroQuestao]: alternativaUpper as 'A' | 'B' | 'C' | 'D',
    }));
  };

  const handleChangeTotalQuestoes = (value: string) => {
    const numValue = parseInt(value, 10);
    
    if (!value) {
      setTotalQuestoes(0);
      setQuestionSkills((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (Number(k) > 0) delete next[Number(k)];
        });
        return next;
      });
      return;
    }

    if (isNaN(numValue)) {
      return;
    }

    if (numValue < 1) {
      setTotalQuestoes(1);
      return;
    }

    if (numValue > 200) {
      setTotalQuestoes(200);
      return;
    }

    setTotalQuestoes(numValue);
    // Limpar skills de questões que ficaram além do novo total
    if (numValue < totalQuestoes) {
      setQuestionSkills((prev) => {
        const next = { ...prev };
        for (let n = numValue + 1; n <= totalQuestoes; n++) {
          delete next[n];
        }
        return next;
      });
    }
  };

  const handleClearGabarito = () => {
    setGabaritoManual({});
    setQuestionSkills({});
  };

  // Funções para gerenciar alternativas
  const getAvailableAlternatives = (questionNumber: number): ('A' | 'B' | 'C' | 'D')[] => {
    if (useGlobalAlternatives) {
      return globalAlternatives;
    }
    return questionsOptions[questionNumber] || ['A', 'B', 'C', 'D'];
  };

  const handleToggleGlobalAlternative = (alternative: 'A' | 'B' | 'C' | 'D', checked: boolean) => {
    if (checked) {
      // Adicionar alternativa
      if (globalAlternatives.length >= 4) {
        toast({
          title: 'Erro',
          description: 'Máximo de 4 alternativas (A, B, C, D).',
          variant: 'destructive',
        });
        return;
      }
      const newAlternatives = [...globalAlternatives, alternative].sort() as ('A' | 'B' | 'C' | 'D')[];
      setGlobalAlternatives(newAlternatives);
    } else {
      // Remover alternativa
      if (globalAlternatives.length <= 2) {
        toast({
          title: 'Erro',
          description: 'Selecione pelo menos 2 alternativas.',
          variant: 'destructive',
        });
        return;
      }
      const newAlternatives = globalAlternatives.filter(alt => alt !== alternative);
      setGlobalAlternatives(newAlternatives);
      
      // Limpar respostas que usam a alternativa removida
      setGabaritoManual(prev => {
        const updated = { ...prev };
        let clearedCount = 0;
        for (let i = 1; i <= totalQuestoes; i += 1) {
          if (updated[i] === alternative) {
            delete updated[i];
            clearedCount++;
          }
        }
        if (clearedCount > 0) {
          toast({
            title: 'Respostas removidas',
            description: `${clearedCount} questão(ões) tiveram a resposta removida pois a alternativa não está mais disponível.`,
            variant: 'default',
          });
        }
        return updated;
      });
    }
  };

  const handleToggleQuestionAlternative = (questionNumber: number, alternative: 'A' | 'B' | 'C' | 'D', checked: boolean) => {
    const currentAlternatives = questionsOptions[questionNumber] || ['A', 'B', 'C', 'D'];
    
    if (checked) {
      // Adicionar alternativa
      if (currentAlternatives.length >= 4) {
        toast({
          title: 'Erro',
          description: 'Máximo de 4 alternativas (A, B, C, D).',
          variant: 'destructive',
        });
        return;
      }
      const newAlternatives = [...currentAlternatives, alternative].sort() as ('A' | 'B' | 'C' | 'D')[];
      setQuestionsOptions(prev => ({
        ...prev,
        [questionNumber]: newAlternatives,
      }));
    } else {
      // Remover alternativa
      if (currentAlternatives.length <= 2) {
        toast({
          title: 'Erro',
          description: 'Selecione pelo menos 2 alternativas.',
          variant: 'destructive',
        });
        return;
      }
      const newAlternatives = currentAlternatives.filter(alt => alt !== alternative);
      setQuestionsOptions(prev => ({
        ...prev,
        [questionNumber]: newAlternatives,
      }));
      
      // Limpar resposta se usar a alternativa removida
      const currentAnswer = gabaritoManual[questionNumber];
      if (currentAnswer === alternative) {
        setGabaritoManual(prev => {
          const updated = { ...prev };
          delete updated[questionNumber];
          return updated;
        });
        toast({
          title: 'Resposta removida',
          description: `A resposta da questão ${questionNumber} foi removida pois a alternativa não está mais disponível.`,
          variant: 'default',
        });
      }
    }
  };

  const handleApplyGlobalToAll = () => {
    if (globalAlternatives.length < 2) {
      toast({
        title: 'Erro',
        description: 'Selecione pelo menos 2 alternativas antes de aplicar.',
        variant: 'destructive',
      });
      return;
    }
    
    // Aplicar alternativas globais a todas as questões
    const newOptions: Record<number, ('A' | 'B' | 'C' | 'D')[]> = {};
    for (let i = 1; i <= totalQuestoes; i += 1) {
      newOptions[i] = [...globalAlternatives];
    }
    setQuestionsOptions(newOptions);
    setUseGlobalAlternatives(false);
    
    // Limpar respostas inválidas
    setGabaritoManual(prev => {
      const updated = { ...prev };
      let clearedCount = 0;
      for (let i = 1; i <= totalQuestoes; i += 1) {
        if (updated[i] && !globalAlternatives.includes(updated[i])) {
          delete updated[i];
          clearedCount++;
        }
      }
      if (clearedCount > 0) {
        toast({
          title: 'Respostas removidas',
          description: `${clearedCount} questão(ões) tiveram a resposta removida pois não está mais disponível.`,
          variant: 'default',
        });
      }
      return updated;
    });
    
    toast({
      title: 'Alternativas aplicadas',
      description: `Alternativas globais aplicadas a todas as ${totalQuestoes} questões.`,
    });
  };

  const buildQuestionsOptions = (): Record<string, string[]> | undefined => {
    // Se modo global e todas questões têm padrão ['A', 'B', 'C', 'D'], pode omitir
    const sortedGlobal = [...globalAlternatives].sort();
    if (useGlobalAlternatives && JSON.stringify(sortedGlobal) === JSON.stringify(['A', 'B', 'C', 'D'])) {
      return undefined; // Omitir do payload (backend usa padrão)
    }

    // Se modo individual, verificar se todas têm o mesmo padrão
    if (!useGlobalAlternatives) {
      const allDefault = Array.from({ length: totalQuestoes }, (_, i) => {
        const num = i + 1;
        const options = questionsOptions[num] || ['A', 'B', 'C', 'D'];
        const sortedOptions = [...options].sort();
        return JSON.stringify(sortedOptions) === JSON.stringify(['A', 'B', 'C', 'D']);
      }).every(Boolean);

      if (allDefault) {
        return undefined; // Omitir do payload
      }
    }

    // Construir objeto com chaves como strings
    const result: Record<string, string[]> = {};
    for (let i = 1; i <= totalQuestoes; i += 1) {
      const alternatives = useGlobalAlternatives
        ? globalAlternatives
        : (questionsOptions[i] || ['A', 'B', 'C', 'D']);
      result[i.toString()] = [...alternatives];
    }
    return result;
  };



  // Validação para Etapa 1 (estado e município obrigatórios)
  const isStep1Valid = () => {
    const hasValidFilters = Boolean(selectedFilters.state && selectedFilters.city);
    
    if (!hasValidFilters || !provaTitulo || !department || cartaoGradeIds.length === 0) {
      return false;
    }

    if (totalQuestoes <= 0) {
      return false;
    }

    for (let i = 1; i <= totalQuestoes; i += 1) {
      if (!gabaritoManual[i]) {
        return false;
      }
      
      // Validar que a resposta está nas alternativas disponíveis
      const availableAlternatives = useGlobalAlternatives
        ? globalAlternatives
        : (questionsOptions[i] || ['A', 'B', 'C', 'D']);
      
      if (!availableAlternatives.includes(gabaritoManual[i])) {
        return false;
      }
    }

    if (blocksByDiscipline.length > 0) {
      const validation = validateDisciplineBlocks();
      if (!validation.isValid) {
        return false;
      }
    }

    return true;
  };

  const handleNextStep = () => {
    if (currentStep === 1 && isStep1Valid()) {
      setCurrentStep(2);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      if (currentStep === 2) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setJobId(null);
        setJobTasks([]);
        setJobProgress({ completed_tasks: 0, total_tasks: 0, percentage: 0 });
        setJobDownloadUrl(null);
        setJobWarnings([]);
        setJobScopeType('');
      }
      setCurrentStep((currentStep - 1) as Step);
    }
  };

  // Função para remover UUIDs das mensagens de aviso
  const cleanWarnings = (warnings: string[]): string[] => {
    return warnings.map(warning => 
      // Remove padrão "(UUID)" do final da mensagem
      warning.replace(/ \([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\)/gi, '')
    );
  };

  // Função para buscar gabaritos gerados
  const fetchGabaritos = useCallback(async () => {
    try {
      setIsLoadingGabaritos(true);
      const response = await api.get<GabaritosResponse>('/answer-sheets/gabaritos');
      setGabaritos(response.data.gabaritos || []);
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os cartões gerados.',
        variant: 'destructive',
      });
      setGabaritos([]);
    } finally {
      setIsLoadingGabaritos(false);
    }
  }, [toast]);

  // Carregar gabaritos quando a aba "generated" for selecionada
  useEffect(() => {
    if (activeTab === 'generated') {
      fetchGabaritos();
    }
  }, [activeTab, fetchGabaritos]);

  // Funções para gerenciar seleção de gabaritos
  const handleToggleSelectGabarito = (gabaritoId: string) => {
    setSelectedGabaritos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(gabaritoId)) {
        newSet.delete(gabaritoId);
      } else {
        newSet.add(gabaritoId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedGabaritos.size === gabaritos.length) {
      setSelectedGabaritos(new Set());
    } else {
      setSelectedGabaritos(new Set(gabaritos.map(g => g.id)));
    }
  };

  const isDownloadingGabaritoRow = (gabaritoId: string, generationId?: string) =>
    downloadingGabaritoId === gabaritoDownloadLoadingKey(gabaritoId, generationId);

  const isBusyDownloadingForGabaritoRow = (gabaritoId: string) =>
    downloadingGabaritoId === gabaritoId ||
    (downloadingGabaritoId?.startsWith(`${gabaritoId}__`) ?? false);

  // Download de gabarito: GET binário na API (ou `download_url` do JSON apontando para a mesma rota)
  const handleDownloadGabarito = async (
    gabaritoId: string,
    opts?: {
      generationId?: string;
      jobId?: string;
      /** `download_url` da API — sempre GET autenticado (blob) */
      downloadUrl?: string | null;
    }
  ) => {
    try {
      setDownloadingGabaritoId(gabaritoDownloadLoadingKey(gabaritoId, opts?.generationId));
      setDownloadProgress(0);

      const direct = opts?.downloadUrl?.trim();
      if (direct) {
        await fetchAuthenticatedDownload(direct, 'cartoes.zip');
        toast({
          title: '✅ Download iniciado',
          description: 'O arquivo será salvo pelo navegador.',
        });
        return;
      }

      const params: Record<string, string> = {};
      if (opts?.jobId) params.job_id = opts.jobId;
      await fetchAuthenticatedDownload(
        `answer-sheets/gabarito/${gabaritoId}/download`,
        'cartoes.zip',
        Object.keys(params).length > 0 ? { params } : undefined
      );
      toast({
        title: '✅ Download iniciado',
        description: 'O arquivo será salvo pelo navegador.',
      });
    } catch (error: unknown) {
      if (error instanceof Error && !isAxiosError(error)) {
        toast({
          title: 'Erro',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }
      const err = error as { response?: { status?: number; data?: { status?: string; error?: string; code?: string } } };
      let errorMessage = 'Não foi possível baixar o arquivo. Tente novamente.';
      const status = err.response?.status;
      const backendError = err.response?.data?.error;

      if (status === 404) {
        errorMessage = 'Os cartões solicitados não foram encontrados.';
      } else if (status === 400 && err.response?.data?.status === 'not_generated') {
        errorMessage = 'Os cartões ainda não foram gerados. Complete a geração primeiro.';
      } else if (status === 403) {
        errorMessage = err.response?.data?.code === 'NOT_AVAILABLE_TO_MUNICIPALITY' ||
          (backendError && backendError.includes('ainda não disponível'))
          ? (backendError || 'Conteúdo ainda não disponível para o município')
          : 'Você não tem permissão para acessar este arquivo.';
      } else if (backendError) {
        errorMessage = backendError;
      }
      
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setDownloadingGabaritoId(null);
      setDownloadProgress(0);
    }
  };

  // Deletar gabarito(s)
  const handleOpenDeleteDialog = (gabaritoId?: string) => {
    if (gabaritoId) {
      setGabaritoToDelete(gabaritoId);
      setDeleteMode('single');
    } else {
      setDeleteMode('multiple');
    }
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    try {
      setIsDeleting(true);
      
      if (deleteMode === 'single' && gabaritoToDelete) {
        await api.delete(`/answer-sheets/${gabaritoToDelete}`);
        setGabaritos(prev => prev.filter(g => g.id !== gabaritoToDelete));
      } else if (deleteMode === 'multiple') {
        const ids = Array.from(selectedGabaritos);
        await Promise.all(
          ids.map(id => api.delete(`/answer-sheets/${id}`))
        );
        setGabaritos(prev => prev.filter(g => !selectedGabaritos.has(g.id)));
        setSelectedGabaritos(new Set());
      }

      toast({
        title: 'Sucesso',
        description: deleteMode === 'single' ? 'Cartão deletado com sucesso.' : 'Cartões deletados com sucesso.',
      });
      
      setShowDeleteDialog(false);
      setGabaritoToDelete(null);
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível deletar o(s) cartão(ões).',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // NOVO: Função de polling para jobs hierárquicos
  const startPollingJob = (jobIdParam: string) => {
    // Limpar intervalo anterior se existir
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Iniciar polling a cada 2 segundos
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await api.get(`/answer-sheets/jobs/${jobIdParam}/status`);
        const data = response.data;


        // Usar estrutura correta da resposta da API
        const totalTasks = data.progress?.total || 0;
        const completedTasks = data.progress?.current || 0;
        const percentage = data.progress?.percentage || 0;

        // Atualizar progresso e tarefas
        setJobProgress({
          completed_tasks: completedTasks,
          total_tasks: totalTasks,
          percentage: percentage
        });
        setJobTasks(data.tasks || []);
        
        // Atualizar warnings se houver (removendo UUIDs)
        if (data.warnings && Array.isArray(data.warnings)) {
          setJobWarnings(cleanWarnings(data.warnings));
        } else {
          setJobWarnings([]);
        }

        // SUCESSO: parar polling
        if (data.status === 'completed') {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          setIsGenerating(false);

          const gabaritoId =
            typeof data.gabarito_id === 'string' ? data.gabarito_id.trim() : '';
          const resultDl =
            typeof data.result?.download_url === 'string' ? data.result.download_url.trim() : '';
          const summaryDl =
            data.summary && typeof data.summary.download_url === 'string'
              ? data.summary.download_url.trim()
              : '';

          let next: string | null = null;
          if (resultDl) {
            next = resultDl;
          } else if (summaryDl) {
            next = summaryDl;
          } else if (gabaritoId) {
            const jid = (jobIdParam || '').trim();
            next = jid
              ? `answer-sheets/gabarito/${gabaritoId}/download?job_id=${encodeURIComponent(jid)}`
              : `answer-sheets/gabarito/${gabaritoId}/download`;
          }
          setJobDownloadUrl(next);

          // Atualizar a lista de gabaritos independente da aba ativa
          await fetchGabaritos();

          toast({
            title: "✅ Geração concluída!",
            description: `${completedTasks} tarefas finalizadas com sucesso.`,
          });
        }

        // ERRO: parar polling
        if (data.status === 'failed') {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          setIsGenerating(false);
          setJobDownloadUrl(null);

          toast({
            title: "❌ Erro ao gerar cartões",
            description: data.error || "Erro desconhecido ao gerar cartões de resposta",
            variant: "destructive",
          });
        }

      } catch (error: any) {
        
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        setIsGenerating(false);

        toast({
          title: "Erro",
          description: "Erro ao verificar status da geração. Tente novamente.",
          variant: "destructive",
        });
      }
    }, 2000); // Polling a cada 2 segundos

    // Timeout de segurança (30 minutos)
    setTimeout(() => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }

      if (isGenerating) {
        setIsGenerating(false);
        
        toast({
          title: "⚠️ Timeout",
          description: "A geração está demorando muito. Verifique a lista ou tente novamente.",
          variant: "destructive",
        });
      }
    }, 30 * 60 * 1000); // 30 minutos
  };

  // Gerar cartões usando endpoint hierárquico (escopo em school_ids, grade_ids, class_ids)
  const handleGenerateCards = async () => {
    if (!selectedFilters.state || !selectedFilters.city) {
      toast({
        title: 'Erro',
        description: 'Selecione estado e município antes de gerar os cartões.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsGenerating(true);
      setJobTasks([]);
      setJobProgress({ completed_tasks: 0, total_tasks: 0, percentage: 0 });
      setJobDownloadUrl(null);

      const question_skills: Record<string, string[]> = {};
      for (let n = 1; n <= totalQuestoes; n++) {
        question_skills[String(n)] = questionSkills[n] ?? [];
      }

      const payload: any = {
        title: provaTitulo,
        grade_ids: cartaoGradeIds,
        num_questions: totalQuestoes,
        correct_answers: gabaritoManual,
        question_skills,
        use_blocks: hasDisciplineBlocks,
        ...(hasDisciplineBlocks && {
          blocks_config: {
            blocks: blocksByDiscipline.map(block => ({
              block_id: block.block_id,
              subject_id: block.subject_id,
              subject_name: block.subject_name,
              questions_count: block.questions_count,
              start_question: block.start_question,
              end_question: block.end_question
            }))
          }
        }),
        questions_options: buildQuestionsOptions() || {},
        test_data: {
          title: provaTitulo,
          department: department,
          municipality: filterLabels.city || undefined,
          state: filterLabels.state || undefined,
        },
      };
      if (selectedFilters.school_ids?.length) payload.school_ids = selectedFilters.school_ids;
      if (selectedFilters.class_ids?.length) payload.class_ids = selectedFilters.class_ids;

      // Chamar endpoint unificado
      const response = await api.post('/answer-sheets/generate', payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Verificar se retornou 202 Accepted
      if (response.status === 202) {
        const data = response.data;
        setJobId(data.job_id);
        setJobTasks(data.tasks || []);
        setJobProgress({
          completed_tasks: 0,
          total_tasks: data.total_tasks || 0,
          percentage: 0
        });
        setJobScopeType(data.scope_type);
        
        // Capturar warnings iniciais se houver (removendo UUIDs)
        if (data.warnings && Array.isArray(data.warnings)) {
          setJobWarnings(cleanWarnings(data.warnings));
        } else {
          setJobWarnings([]);
        }

        toast({
          title: "⏳ Geração iniciada",
          description: `Gerando cartões para ${data.total_students || 0} alunos em ${data.total_tasks || 1} tarefa(s).`,
        });

        // Iniciar polling
        startPollingJob(data.job_id);
      } else {
        setIsGenerating(false);

        toast({
          title: 'Aviso',
          description: 'A geração foi iniciada, mas o formato de resposta não é o esperado.',
        });
      }

    } catch (error: any) {
      setIsGenerating(false);

      let errorMessage = 'Não foi possível gerar os cartões resposta.';
      
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  // NOVO: Download do ZIP usando URL direta
  const handleDownloadZip = async () => {
    if (!jobDownloadUrl) {
      toast({
        title: 'Erro',
        description: 'URL de download não disponível. Aguarde a conclusão da geração.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSavingJobZip(true);
      await fetchAuthenticatedDownload(jobDownloadUrl, 'cartoes.zip');
      toast({
        title: '✅ Download iniciado',
        description: 'O arquivo será salvo pelo navegador.',
      });
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : 'Não foi possível iniciar o download. Tente novamente.';
      toast({
        title: 'Erro',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setIsSavingJobZip(false);
    }
  };

  const totalQuestoesRespondidas = totalQuestoes
    ? Array.from({ length: totalQuestoes }, (_, index) => index + 1).filter(
        numeroQuestao => !!gabaritoManual[numeroQuestao],
      ).length
    : 0;
  const totalQuestoesPendentes = totalQuestoes > 0 ? totalQuestoes - totalQuestoesRespondidas : 0;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header — mobile: título/desc alinhados */}
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
          <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
          Gerador de Cartões Resposta
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Configure e gere cartões resposta personalizados para provas físicas
        </p>
      </div>

      {/* Tabs — mobile: texto menor e layout que não empilha */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
<div className="flex items-center gap-2 flex-wrap">
  <TabsList className="flex flex-wrap w-full h-auto min-h-9 gap-1.5 p-1.5">
    <TabsTrigger value="generate" className="flex-1 min-w-0 text-xs sm:text-sm px-2 py-2 sm:px-3">
      <span className="truncate">Gerar Cartões</span>
    </TabsTrigger>
    <TabsTrigger value="generated" className="flex-1 min-w-0 text-xs sm:text-sm px-2 py-2 sm:px-3">
      <span className="truncate">Cartões Gerados</span>
    </TabsTrigger>
  </TabsList>
  <Button
    variant="outline"
    className="h-10 px-4"
    onClick={() => navigate('/app/resultados?aba=cartao')}
  >
    <FileText className="h-4 w-4 mr-2" />
    Resultados
  </Button>
</div>

        {/* Tab: Gerar Cartões */}
        <TabsContent value="generate" className="space-y-6">

      {/* Stepper */}
      <div className="flex items-center justify-center gap-4 mb-8">
        <div className={`flex items-center gap-2 ${currentStep >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
            currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'
          }`}>
            1
          </div>
          <span className="font-medium hidden sm:inline">Configurar</span>
        </div>
        <ChevronRight className="text-gray-400" />
        <div className={`flex items-center gap-2 ${currentStep >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
            currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'
          }`}>
            2
          </div>
          <span className="font-medium hidden sm:inline">Gerar</span>
        </div>
      </div>

      {/* Etapa 1: Configuração */}
      {currentStep === 1 && (
        <div className="space-y-6">
          {/* Card 1: Filtros Hierárquicos em Cascata */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <School className="h-5 w-5" />
                Seleção Hierárquica
              </CardTitle>
              <CardDescription>
                Selecione os níveis desejados na hierarquia (você pode parar em qualquer nível)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Exibir breadcrumb com filtros selecionados */}
              {(selectedFilters.state || selectedFilters.city || (selectedFilters.school_ids?.length ?? 0) > 0 || (selectedFilters.grade_ids?.length ?? 0) > 0 || (selectedFilters.class_ids?.length ?? 0) > 0) && (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
                  <p className="text-sm font-semibold mb-2 text-blue-900 dark:text-blue-100">Filtros Selecionados:</p>
                  <div className="flex flex-wrap gap-2">
                    {filterLabels.state && (
                      <div className="bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                        <span>📍 {filterLabels.state}</span>
                        <button
                          onClick={() => handleClearFilter('state')}
                          className="ml-1 hover:text-red-600 font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    {filterLabels.city && (
                      <div className="bg-green-100 dark:bg-green-900 text-green-900 dark:text-green-100 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                        <span>🏙️ {filterLabels.city}</span>
                        <button
                          onClick={() => handleClearFilter('city')}
                          className="ml-1 hover:text-red-600 font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    {(selectedFilters.school_ids?.length ?? 0) > 0 && (
                      <div className="bg-purple-100 dark:bg-purple-900 text-purple-900 dark:text-purple-100 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                        <span>🏫 {schoolOptions.filter(o => selectedFilters.school_ids!.includes(o.id)).map(o => o.name).join(', ') || `${selectedFilters.school_ids!.length} escola(s)`}</span>
                        <button
                          onClick={() => handleClearFilter('school')}
                          className="ml-1 hover:text-red-600 font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    {(selectedFilters.grade_ids?.length ?? 0) > 0 && (
                      <div className="bg-orange-100 dark:bg-orange-900 text-orange-900 dark:text-orange-100 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                        <span>📚 {gradeOptions.filter(o => selectedFilters.grade_ids!.includes(o.id)).map(o => o.name).join(', ') || `${selectedFilters.grade_ids!.length} série(s)`}</span>
                        <button
                          onClick={() => handleClearFilter('grade')}
                          className="ml-1 hover:text-red-600 font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    {(selectedFilters.class_ids?.length ?? 0) > 0 && (
                      <div className="bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                        <span>👥 {classOptions.filter(o => selectedFilters.class_ids!.includes(o.id)).map(o => o.name).join(', ') || `${selectedFilters.class_ids!.length} turma(s)`}</span>
                        <button
                          onClick={() => handleClearFilter('class')}
                          className="ml-1 hover:text-red-600 font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Cascata de Seletores */}
              <div className="grid gap-4">
                {/* State Selector */}
                <div className="space-y-2">
                  <Label>Estado *</Label>
                  <Select
                    value={selectedFilters.state || ''}
                    onValueChange={(value) => {
                      const option = stateOptions.find(o => o.id === value);
                      if (option) {
                        handleSelectFilter('state', value, option.name);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o estado..." />
                    </SelectTrigger>
                    <SelectContent>
                      {stateOptions.map(option => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* City Selector */}
                {selectedFilters.state && (
                  <div className="space-y-2 pl-4 border-l-2 border-blue-300">
                    <Label>Município {selectedFilters.city ? '(Selecionado ✓)' : '(Opcional)'}</Label>
                    {isLoadingOptions ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                      <Select
                        value={selectedFilters.city || ''}
                        onValueChange={(value) => {
                          if (value === '__back') {
                            handleClearFilter('city');
                          } else {
                            const option = cityOptions.find(o => o.id === value);
                            if (option) {
                              handleSelectFilter('city', value, option.name);
                            }
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o município..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__back">← Voltar para estado</SelectItem>
                          {cityOptions.map(option => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {/* School Multi-Select (opcional: vazio = todas as escolas do município) */}
                {selectedFilters.city && (
                  <div className="space-y-2 pl-4 border-l-2 border-green-300">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Escola(s) {(selectedFilters.school_ids?.length ?? 0) > 0 ? `(${selectedFilters.school_ids!.length} selecionada(s))` : '(Opcional — todas)'}</Label>
                      {schoolOptions.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => handleSchoolIdsChange(schoolOptions.map(o => o.id))}
                        >
                          Selecionar todas
                        </Button>
                      )}
                    </div>
                    {isLoadingOptions && schoolOptions.length === 0 ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                      <MultiSelect
                        options={schoolOptions.map(o => ({ id: o.id, name: o.name }))}
                        selected={selectedFilters.school_ids ?? []}
                        onChange={handleSchoolIdsChange}
                        placeholder="Selecione uma ou mais escolas (ou deixe vazio para todas)"
                        label=""
                        mode="popover"
                        className="w-full"
                      />
                    )}
                  </div>
                )}

                {/* Grade Multi-Select (ex.: só 5º ano das escolas selecionadas) */}
                {(selectedFilters.school_ids?.length ?? 0) > 0 && (
                  <div className="space-y-2 pl-4 border-l-2 border-purple-300">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Série(s)/Ano(s) {(selectedFilters.grade_ids?.length ?? 0) > 0 ? `(${selectedFilters.grade_ids!.length} selecionada(s))` : '(Opcional)'}</Label>
                      {gradeOptions.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => handleGradeIdsChange(gradeOptions.map(o => o.id))}
                        >
                          Selecionar todas
                        </Button>
                      )}
                    </div>
                    {isLoadingOptions && gradeOptions.length === 0 ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                      <MultiSelect
                        options={gradeOptions.map(o => ({ id: o.id, name: o.name }))}
                        selected={selectedFilters.grade_ids ?? []}
                        onChange={handleGradeIdsChange}
                        placeholder="Selecione uma ou mais séries (ou deixe vazio para todas)"
                        label=""
                        mode="popover"
                        className="w-full"
                      />
                    )}
                  </div>
                )}

                {/* Class Multi-Select */}
                {(selectedFilters.grade_ids?.length ?? 0) > 0 && (
                  <div className="space-y-2 pl-4 border-l-2 border-orange-300">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Turma(s) {(selectedFilters.class_ids?.length ?? 0) > 0 ? `(${selectedFilters.class_ids!.length} selecionada(s))` : '(Opcional)'}</Label>
                      {classOptions.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => handleClassIdsChange(classOptions.map(o => o.id))}
                        >
                          Selecionar todas
                        </Button>
                      )}
                    </div>
                    {isLoadingOptions && classOptions.length === 0 ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                      <MultiSelect
                        options={classOptions.map(o => ({ id: o.id, name: o.name }))}
                        selected={selectedFilters.class_ids ?? []}
                        onChange={handleClassIdsChange}
                        placeholder="Selecione uma ou mais turmas (ou deixe vazio para todas)"
                        label=""
                        mode="popover"
                        className="w-full"
                      />
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Informações da Prova */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Informações da Prova
              </CardTitle>
              <CardDescription>
                Configure os detalhes básicos da prova
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="prova">Nome da Prova *</Label>
                  <Input
                    id="prova"
                    placeholder="Ex: Prova de Matemática - 1º Bimestre"
                    value={provaTitulo}
                    onChange={(e) => setProvaTitulo(e.target.value)}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="department">Secretaria/Departamento *</Label>
                  <Input
                    id="department"
                    placeholder="Ex: Secretaria Municipal de Educação"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Nome da secretaria ou departamento responsável pela prova.
                  </p>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Série(s) / Ano(s) do cartão *</Label>
                  <MultiSelect
                    options={gradesForSkills.map((g) => ({ id: g.id, name: g.name }))}
                    selected={cartaoGradeIds}
                    onChange={(ids) => {
                      setCartaoGradeIds(ids);
                      if (ids.length > 0 && !ids.includes(skillGradeId)) {
                        setSkillGradeId(ids[0]);
                      }
                    }}
                    placeholder="Selecione uma ou mais séries"
                    mode="popover"
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Obrigatório. Define as séries do gabarito (não é inferido pelo título).
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Alternativas Disponíveis */}
          {totalQuestoes > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white">
                    A
                  </span>
                  Alternativas Disponíveis
                </CardTitle>
                <CardDescription>
                  Configure quais alternativas estarão disponíveis no cartão resposta (mínimo 2, máximo D)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="use-global-alternatives"
                    checked={useGlobalAlternatives}
                    onCheckedChange={(checked) => {
                      setUseGlobalAlternatives(checked === true);
                      if (checked === true) {
                        // Limpar configurações individuais ao voltar para global
                        setQuestionsOptions({});
                      }
                    }}
                  />
                  <Label htmlFor="use-global-alternatives" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Aplicar as mesmas alternativas a todas as questões
                  </Label>
                </div>

                {useGlobalAlternatives ? (
                  <div className="space-y-4 pl-6 border-l-2 border-purple-200">
                    <div className="space-y-2">
                      <Label>Alternativas Globais</Label>
                      <div className="flex gap-4">
                        {(['A', 'B', 'C', 'D'] as const).map((alt) => (
                          <div key={alt} className="flex items-center space-x-2">
                            <Checkbox
                              id={`global-alt-${alt}`}
                              checked={globalAlternatives.includes(alt)}
                              onCheckedChange={(checked) => handleToggleGlobalAlternative(alt, checked === true)}
                              disabled={!globalAlternatives.includes(alt) && globalAlternatives.length >= 4}
                            />
                            <Label
                              htmlFor={`global-alt-${alt}`}
                              className="text-sm font-medium cursor-pointer"
                            >
                              {alt}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {globalAlternatives.length < 2 && (
                          <span className="text-red-500">Selecione pelo menos 2 alternativas.</span>
                        )}
                        {globalAlternatives.length >= 2 && (
                          <span className="text-green-600">
                            {globalAlternatives.length} alternativa(s) selecionada(s): {globalAlternatives.join(', ')}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleApplyGlobalToAll}
                      disabled={globalAlternatives.length < 2}
                    >
                      Aplicar a todas as questões
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 pl-6 border-l-2 border-purple-200">
                    <Label>Modo Individual</Label>
                    <p className="text-xs text-muted-foreground">
                      Configure alternativas específicas para cada questão usando o botão "Configurar" em cada questão abaixo.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Card 4: Questões e Gabarito */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  Q
                </span>
                Questões e Gabarito
              </CardTitle>
              <CardDescription>
                Informe a quantidade de questões da prova e selecione a alternativa correta de cada uma
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
                <div className="space-y-2">
                  <Label htmlFor="total-questoes">Quantidade de Questões *</Label>
                  <Input
                    id="total-questoes"
                    type="number"
                    min={1}
                    max={200}
                    value={totalQuestoes || ''}
                    onChange={(event) => handleChangeTotalQuestoes(event.target.value)}
                    placeholder="Ex: 10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Máximo de 200 questões por prova.
                  </p>
                </div>

                {totalQuestoes > 0 && (
                  <div className="space-y-2 rounded-md border bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Status do gabarito
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary" className="text-xs">
                        Total: <span className="ml-1 font-semibold">{totalQuestoes}</span>
                      </Badge>
                      <Badge variant="default" className="bg-emerald-600 text-xs hover:bg-emerald-600">
                        Respondidas:{' '}
                        <span className="ml-1 font-semibold">{totalQuestoesRespondidas}</span>
                      </Badge>
                      <Badge
                        variant={totalQuestoesPendentes === 0 ? 'secondary' : 'outline'}
                        className={`text-xs ${
                          totalQuestoesPendentes === 0
                            ? 'border-emerald-500 text-emerald-600'
                            : 'border-amber-500 text-amber-600'
                        }`}
                      >
                        Pendentes:{' '}
                        <span className="ml-1 font-semibold">{totalQuestoesPendentes}</span>
                      </Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={handleClearGabarito}
                      >
                        Limpar gabarito
                      </Button>
                    </div>
                  </div>
                )}

                {totalQuestoes > 0 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">
                        Disciplina (para habilidades do gabarito)
                      </Label>
                      <Select
                        value={skillSubjectId || 'none'}
                        onValueChange={(v) => {
                          setSkillSubjectId(v === 'none' ? '' : v);
                          setSkillGradeId('');
                        }}
                      >
                        <SelectTrigger className="w-full max-w-xs">
                          <SelectValue placeholder="Opcional — selecione para definir habilidades por questão" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-muted-foreground">Nenhuma</span>
                          </SelectItem>
                          {subjectsForSkills.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {skillSubjectId && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                          Série (para habilidades do gabarito)
                        </Label>
                        <Select
                          value={skillGradeId || 'none'}
                          onValueChange={(v) => setSkillGradeId(v === 'none' ? '' : v)}
                        >
                          <SelectTrigger className="w-full max-w-xs">
                            <SelectValue placeholder="Selecione a série para ver as habilidades" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              <span className="text-muted-foreground">Nenhuma</span>
                            </SelectItem>
                            {gradesForSkills.map((g) => (
                              <SelectItem key={g.id} value={g.id}>
                                {g.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {skillSubjectId && skillGradeId && isLoadingGabaritoSkills && (
                      <p className="text-xs text-muted-foreground">Carregando habilidades...</p>
                    )}
                  </div>
                )}
              </div>

              {totalQuestoes > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Gabarito ({totalQuestoes} questão(ões))
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Selecione a alternativa correta para cada número de questão. As alternativas disponíveis podem ser personalizadas acima.
                    </p>
                  </div>

                  <div className="max-h-[360px] space-y-3 overflow-y-auto rounded-md border bg-background/40 p-3">
                    {Array.from({ length: totalQuestoes }, (_, index) => {
                      const numeroQuestao = index + 1;
                      const respostaSelecionada = gabaritoManual[numeroQuestao] || '';

                      return (
                        <div
                          key={numeroQuestao}
                          className="flex items-center justify-between gap-3 rounded-md border bg-muted/60 px-3 py-2 shadow-sm transition-colors hover:border-blue-500 hover:bg-muted dark:hover:border-blue-400 dark:hover:bg-slate-800/80"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">#{numeroQuestao}</Badge>
                            <span className="text-sm font-medium">
                              Questão {numeroQuestao}
                            </span>
                          </div>
                          <div className="flex gap-2 items-center">
                            {getAvailableAlternatives(numeroQuestao).map((alternativa) => {
                              const isAtiva = respostaSelecionada === alternativa;
                              return (
                                <button
                                  key={alternativa}
                                  type="button"
                                  onClick={() =>
                                    handleChangeRespostaQuestao(numeroQuestao, alternativa)
                                  }
                                  aria-pressed={isAtiva}
                                  aria-label={`Marcar alternativa ${alternativa} na questão ${numeroQuestao}`}
                                  className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                                    isAtiva
                                      ? 'border-blue-600 bg-blue-600 text-white shadow-sm dark:border-blue-400 dark:bg-blue-500'
                                      : 'border-border bg-background text-foreground hover:border-blue-400 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-blue-400 dark:hover:bg-blue-950'
                                  }`}
                                >
                                  {alternativa}
                                </button>
                              );
                            })}
                            {!useGlobalAlternatives && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-2 text-xs ml-2"
                                onClick={() => setEditingQuestionAlternatives(numeroQuestao)}
                              >
                                Configurar
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-xs ml-2"
                              onClick={() => setEditingQuestionSkills(numeroQuestao)}
                              disabled={!skillSubjectId || !skillGradeId || gabaritoSkills.length === 0}
                              title={
                                !skillSubjectId
                                  ? 'Selecione disciplina e série acima para habilitar'
                                  : !skillGradeId
                                    ? 'Selecione a série acima para habilitar'
                                    : undefined
                              }
                            >
                              Habilidade
                              {(questionSkills[numeroQuestao]?.length ?? 0) > 0 && (
                                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                                  {questionSkills[numeroQuestao].length}
                                </Badge>
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {Array.from({ length: totalQuestoes }, (_, index) => index + 1).some(
                    (numeroQuestao) => !gabaritoManual[numeroQuestao],
                  ) && (
                    <p className="text-xs text-red-500">
                      Preencha o gabarito de todas as questões para continuar.
                    </p>
                  )}
                </div>
              )}

              {/* Dialog para configurar alternativas individuais */}
              <Dialog open={editingQuestionAlternatives !== null} onOpenChange={(open) => {
                if (!open) setEditingQuestionAlternatives(null);
              }}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      Configurar Alternativas - Questão {editingQuestionAlternatives}
                    </DialogTitle>
                    <DialogDescription>
                      Selecione quais alternativas estarão disponíveis para esta questão (mínimo 2).
                    </DialogDescription>
                  </DialogHeader>
                  {editingQuestionAlternatives !== null && (
                    <div className="space-y-4 py-4">
                      <div className="flex gap-4">
                        {(['A', 'B', 'C', 'D'] as const).map((alt) => {
                          const currentAlternatives = questionsOptions[editingQuestionAlternatives] || ['A', 'B', 'C', 'D'];
                          const isChecked = currentAlternatives.includes(alt);
                          return (
                            <div key={alt} className="flex items-center space-x-2">
                              <Checkbox
                                id={`question-${editingQuestionAlternatives}-alt-${alt}`}
                                checked={isChecked}
                                onCheckedChange={(checked) => 
                                  handleToggleQuestionAlternative(editingQuestionAlternatives, alt, checked === true)
                                }
                                disabled={!isChecked && currentAlternatives.length >= 4}
                              />
                              <Label
                                htmlFor={`question-${editingQuestionAlternatives}-alt-${alt}`}
                                className="text-sm font-medium cursor-pointer"
                              >
                                {alt}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(() => {
                          const currentAlternatives = questionsOptions[editingQuestionAlternatives] || ['A', 'B', 'C', 'D'];
                          if (currentAlternatives.length < 2) {
                            return <span className="text-red-500">Selecione pelo menos 2 alternativas.</span>;
                          }
                          return (
                            <span className="text-green-600">
                              {currentAlternatives.length} alternativa(s) selecionada(s): {currentAlternatives.join(', ')}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            // Resetar para padrão
                            setQuestionsOptions(prev => {
                              const updated = { ...prev };
                              delete updated[editingQuestionAlternatives!];
                              return updated;
                            });
                            setEditingQuestionAlternatives(null);
                          }}
                        >
                          Usar Padrão (A, B, C, D)
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setEditingQuestionAlternatives(null)}
                        >
                          Fechar
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              {/* Dialog para habilidades por questão */}
              <Dialog open={editingQuestionSkills !== null} onOpenChange={(open) => {
                if (!open) setEditingQuestionSkills(null);
              }}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>
                      Habilidade — Questão {editingQuestionSkills}
                    </DialogTitle>
                    <DialogDescription>
                      Selecione a habilidade (BNCC) para esta questão.
                    </DialogDescription>
                  </DialogHeader>
                  {editingQuestionSkills !== null && (
                    <div className="space-y-4 py-4">
                      <SkillsSelector
                        skills={gabaritoSkills}
                        selected={questionSkills[editingQuestionSkills] ?? []}
                        onChange={(ids) =>
                          setQuestionSkills((prev) => ({ ...prev, [editingQuestionSkills]: ids }))
                        }
                        placeholder="Clique para abrir o seletor de habilidade"
                        disabled={gabaritoSkills.length === 0}
                      />
                      {(questionSkills[editingQuestionSkills]?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(questionSkills[editingQuestionSkills] ?? []).map((skillId) => {
                            const skill = gabaritoSkills.find((s) => s.id === skillId);
                            return skill ? (
                              <Badge key={skillId} variant="outline" className="text-xs">
                                {skill.code}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      )}
                      <div className="flex justify-end">
                        <Button type="button" onClick={() => setEditingQuestionSkills(null)}>
                          Fechar
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* Card 4: Configuração de Blocos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white">
                  B
                </span>
                Configuração de Blocos
              </CardTitle>
              <CardDescription>
                Configure como as questões serão organizadas nos cartões resposta
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Opcional: divida as questões em blocos por disciplina (2 a 4 blocos). Deixe vazio para um único bloco.
              </p>

              {totalQuestoes === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Defina a quantidade total de questões antes de configurar os blocos.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                  {blocksByDiscipline.length > 0 ? (
                    <>
                      <div className="space-y-2">
                        {blocksByDiscipline.map((block) => (
                          <Card key={block.block_id} className="p-4">
                            <div className="flex flex-wrap items-center gap-4">
                              <Badge variant="secondary" className="shrink-0">Bloco {block.block_id}</Badge>
                              <div className="min-w-[140px]">
                                <Label className="text-xs text-muted-foreground">Disciplina</Label>
                                <p className="font-medium text-sm text-foreground">{block.subject_name}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Questões</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  max="26"
                                  value={block.questions_count}
                                  onChange={(e) => handleUpdateBlockQuestions(block.block_id, parseInt(e.target.value) || 1)}
                                  className="h-9 w-20"
                                />
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0">Q{block.start_question}–{block.end_question}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveDisciplineBlock(block.block_id)}
                                className="ml-auto shrink-0"
                                aria-label="Remover bloco"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                      {blocksByDiscipline.length < 4 && (
                        <div>
                          {isLoadingDisciplines ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Carregando disciplinas...
                            </div>
                          ) : disciplines.length > 0 ? (
                            <Select
                              onValueChange={(value) => {
                                if (value === '__reset') return;
                                const discipline = disciplines.find(d => d.id === value);
                                if (discipline) handleAddDisciplineBlock(discipline.id, discipline.name);
                              }}
                              value="__reset"
                            >
                              <SelectTrigger className="w-full max-w-sm border-dashed">
                                <SelectValue placeholder="+ Adicionar outra disciplina" />
                              </SelectTrigger>
                              <SelectContent>
                                {disciplines
                                  .filter(d => !blocksByDiscipline.some(b => b.subject_id === d.id))
                                  .map(discipline => (
                                    <SelectItem key={discipline.id} value={discipline.id}>
                                      {discipline.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <p className="text-sm text-muted-foreground">Nenhuma disciplina disponível.</p>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-4 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                        <span className="font-medium text-foreground">
                          Total: {blocksByDiscipline.reduce((sum, b) => sum + b.questions_count, 0)} / {totalQuestoes} questões
                        </span>
                        <span className="text-muted-foreground">· {blocksByDiscipline.length} / 4 blocos</span>
                      </div>
                      {(() => {
                        const validation = validateDisciplineBlocks();
                        if (validation.warnings.length > 0) {
                          return (
                            <Alert variant={validation.isValid ? "default" : "destructive"}>
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>
                                <div className="space-y-2">
                                  {validation.warnings.map((warning, index) => (
                                    <p key={index} className="text-sm">{warning}</p>
                                  ))}
                                </div>
                              </AlertDescription>
                            </Alert>
                          );
                        }
                        return null;
                      })()}
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-background/50 py-8">
                      <p className="text-sm text-muted-foreground text-center">Nenhum bloco adicionado. Um único bloco será usado.</p>
                      {isLoadingDisciplines ? (
                        <p className="text-xs text-muted-foreground">Carregando disciplinas...</p>
                      ) : disciplines.length > 0 ? (
                        <Select
                          onValueChange={(value) => {
                            if (value === '__reset') return;
                            const discipline = disciplines.find(d => d.id === value);
                            if (discipline) handleAddDisciplineBlock(discipline.id, discipline.name);
                          }}
                          value="__reset"
                        >
                          <SelectTrigger className="w-64 border-primary/30">
                            <SelectValue placeholder="+ Adicionar disciplina para criar blocos" />
                          </SelectTrigger>
                          <SelectContent>
                            {disciplines.map(discipline => (
                              <SelectItem key={discipline.id} value={discipline.id}>
                                {discipline.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-xs text-muted-foreground">Nenhuma disciplina disponível.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleNextStep}
              disabled={!isStep1Valid()}
              size="lg"
            >
              Próximo: Gerar Cartões
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Etapa 2: Gerar e Download */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Gerar Cartões Resposta Hierarquicamente
              </CardTitle>
              <CardDescription>
                Gere cartões em lote para o escopo selecionado (cidade, escola, série ou turma)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Resumo dos Filtros Selecionados */}
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
                <h4 className="font-semibold mb-3 text-slate-700 dark:text-slate-300">Escopo de Geração:</h4>
                <div className="space-y-2 text-sm">
                  {filterLabels.state && (
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</span>
                      <span className="font-medium">Estado:</span>
                      <span className="text-slate-600 dark:text-slate-400">{filterLabels.state}</span>
                    </div>
                  )}
                  {filterLabels.city && (
                    <div className="flex items-center gap-2">
                      <span className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</span>
                      <span className="font-medium">Município:</span>
                      <span className="text-slate-600 dark:text-slate-400">{filterLabels.city}</span>
                    </div>
                  )}
                  {(selectedFilters.school_ids?.length ?? 0) > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">3</span>
                      <span className="font-medium">Escola(s):</span>
                      <span className="text-slate-600 dark:text-slate-400">
                        {schoolOptions.filter(o => selectedFilters.school_ids!.includes(o.id)).map(o => o.name).join(', ') || `${selectedFilters.school_ids!.length} escola(s)`}
                      </span>
                    </div>
                  )}
                  {(selectedFilters.grade_ids?.length ?? 0) > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="bg-orange-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">4</span>
                      <span className="font-medium">Série(s)/Ano(s):</span>
                      <span className="text-slate-600 dark:text-slate-400">
                        {gradeOptions.filter(o => selectedFilters.grade_ids!.includes(o.id)).map(o => o.name).join(', ') || `${selectedFilters.grade_ids!.length} série(s)`}
                      </span>
                    </div>
                  )}
                  {(selectedFilters.class_ids?.length ?? 0) > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">5</span>
                      <span className="font-medium">Turma(s):</span>
                      <span className="text-slate-600 dark:text-slate-400">
                        {classOptions.filter(o => selectedFilters.class_ids!.includes(o.id)).map(o => o.name).join(', ') || `${selectedFilters.class_ids!.length} turma(s)`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Informações da Prova */}
              <div className="border-t pt-4 space-y-3">
                <h4 className="font-semibold text-slate-700 dark:text-slate-300">Detalhes da Prova:</h4>
                <div className="grid gap-4 md:grid-cols-2 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Nome da Prova</Label>
                    <p className="font-medium mt-1">{provaTitulo}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Departamento</Label>
                    <p className="font-medium mt-1">{department}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Total de Questões</Label>
                    <p className="font-medium mt-1">{totalQuestoes}</p>
                  </div>
                </div>
              </div>

              {/* Seção de Geração e Progresso */}
              {!jobId ? (
                /* Antes de gerar */
                <div className="border-t pt-4 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Ao clicar em "Gerar Cartões", um job será criado no servidor para gerar os cartões resposta em lote. Você poderá acompanhar o progresso em tempo real.
                  </p>
                  <Button
                    onClick={handleGenerateCards}
                    disabled={isGenerating}
                    size="lg"
                    className="w-full"
                  >
                    <Download className="h-5 w-5 mr-2" />
                    {isGenerating ? 'Iniciando geração...' : 'Iniciar Geração em Lote'}
                  </Button>
                </div>
              ) : (
                /* Depois de gerar */
                jobProgress && jobProgress.percentage !== undefined ? (
                  <div className="border-t pt-4 space-y-4">
                    {/* Progress Bar Geral */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="font-semibold">Progresso Geral</Label>
                        <Badge variant={jobProgress.percentage === 100 ? 'success' : 'default'}>
                          {jobProgress.percentage.toFixed(0)}%
                        </Badge>
                      </div>
                      <Progress value={jobProgress.percentage} className="h-2.5" />
                      <p className="text-xs text-muted-foreground text-center">
                        {jobProgress.completed_tasks} de {jobProgress.total_tasks} tarefas concluídas
                      </p>
                    </div>

                    {/* Avisos de Geração */}
                    {jobWarnings.length > 0 && (
                      <Alert variant="destructive" className="border-amber-300 bg-amber-50 dark:bg-amber-950">
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <AlertDescription className="text-amber-800 dark:text-amber-200">
                          <div className="space-y-1">
                            <p className="font-semibold">Avisos durante a geração:</p>
                            {jobWarnings.map((warning, idx) => (
                              <div key={idx} className="text-sm">• {warning}</div>
                            ))}
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Lista de Tarefas */}
                    {jobTasks.length > 0 && (
                      <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-3">
                        <h5 className="font-semibold text-sm mb-2">Geração em andamento...</h5>
                        {jobTasks.map((task, idx) => (
                          <div
                            key={task.task_id}
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-2 text-xs space-y-1"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="font-semibold text-slate-700 dark:text-slate-300">
                                  {idx + 1}. {task.parent_name}
                                </p>
                              </div>
                              <div className="text-right">
                                {task.status === 'completed' && (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                )}
                                {task.status === 'processing' && (
                                  <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                                )}
                                {task.status === 'pending' && (
                                  <div className="h-4 w-4 rounded-full border-2 border-gray-300 border-t-gray-600" />
                                )}
                                {task.status === 'failed' && (
                                  <AlertCircle className="h-4 w-4 text-red-600" />
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {jobProgress.percentage === 100 && (
                      <p className="text-sm text-muted-foreground text-center">
                        Geração concluída. Faça o download na aba &quot;Cartões gerados&quot;.
                      </p>
                    )}

                    {jobProgress.percentage < 100 && (
                      <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
                        ⏳ Aguardando conclusão da geração antes de fazer o download...
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="border-t pt-4 space-y-4">
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Carregando informações da geração...
                    </p>
                  </div>
                )
              )}
            </CardContent>
          </Card>

          <div className="flex justify-start">
            <Button
              variant="outline"
              onClick={handlePreviousStep}
              disabled={isGenerating || (jobId && jobProgress?.percentage < 100)}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </div>
        </div>
      )}
        </TabsContent>

        {/* Tab: Cartões Gerados */}
        <TabsContent value="generated" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Cartões Gerados
                  </CardTitle>
                  <CardDescription>
                    Visualize, baixe e exclua os cartões resposta que você gerou
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {selectedGabaritos.size > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleOpenDeleteDialog()}
                      disabled={isDeleting}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir ({selectedGabaritos.size})
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchGabaritos}
                    disabled={isLoadingGabaritos}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingGabaritos ? 'animate-spin' : ''}`} />
                    Atualizar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingGabaritos ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : gabaritos.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-muted-foreground mb-2">
                    Nenhum cartão gerado ainda
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Os cartões que você gerar aparecerão aqui
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Header com seleção múltipla */}
                  {gabaritos.length > 0 && (
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="select-all"
                          checked={selectedGabaritos.size === gabaritos.length && gabaritos.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                        <Label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                          Selecionar todos ({selectedGabaritos.size}/{gabaritos.length})
                        </Label>
                      </div>
                      {selectedGabaritos.size > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedGabaritos(new Set())}
                        >
                          Limpar seleção
                        </Button>
                      )}
                    </div>
                  )}
                  
                  {gabaritos.map((gabarito) => {
                    const generationsSorted = [...(gabarito.generations ?? [])].sort((a, b) => {
                      const ta = new Date(a.zip_generated_at ?? a.created_at ?? 0).getTime();
                      const tb = new Date(b.zip_generated_at ?? b.created_at ?? 0).getTime();
                      return tb - ta;
                    });
                    const hasGenerationsList = generationsSorted.length > 0;

                    return (
                    <Card 
                      key={gabarito.id} 
                      className={`hover:shadow-md transition-shadow ${
                        selectedGabaritos.has(gabarito.id) ? 'ring-2 ring-blue-500' : ''
                      }`}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <Checkbox
                              id={`select-${gabarito.id}`}
                              checked={selectedGabaritos.has(gabarito.id)}
                              onCheckedChange={() => handleToggleSelectGabarito(gabarito.id)}
                              className="mt-1"
                            />
                            <div className="flex-1 space-y-3">
                            <div>
                              <div className="flex flex-wrap items-baseline gap-2 mb-1">
                                <h3 className="text-lg font-semibold">{gabarito.title}</h3>
                                {hasGenerationsList && (
                                  <Badge variant="outline" className="text-xs font-normal">
                                    {gabarito.generations_count ?? generationsSorted.length} geração(ões)
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                                {/* Badge de status */}
                                {gabarito.generation_status === 'completed' ? (
                                  <Badge variant="default" className="bg-green-600 flex items-center gap-1">
                                    <CheckCircle className="h-3 w-3" />
                                    Pronto
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="flex items-center gap-1 border-yellow-500 text-yellow-700">
                                    <Clock className="h-3 w-3" />
                                    Processando
                                  </Badge>
                                )}
                                
                                {/* Badge de escopo */}
                                {gabarito.scope_type === 'class' && gabarito.class_name && (
                                  <Badge variant="secondary" className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {gabarito.class_name}
                                  </Badge>
                                )}
                                {(gabarito.scope_type === 'grade' || formatGabaritoGradesLabel(gabarito)) && (
                                  <Badge variant="secondary" className="flex items-center gap-1 border-blue-500 text-blue-700">
                                    <School className="h-3 w-3" />
                                    {formatGabaritoGradesLabel(gabarito) || gabarito.grade_name}
                                  </Badge>
                                )}
                                {gabarito.scope_type === 'school' && (gabarito.school_name ?? '') && (
                                  <Badge variant="secondary" className="flex items-center gap-1 border-purple-500 text-purple-700">
                                    <School className="h-3 w-3" />
                                    {gabarito.school_name}
                                  </Badge>
                                )}
                                {gabarito.scope_type === 'city' && (gabarito.municipality || gabarito.state) && (
                                  <Badge variant="secondary" className="flex items-center gap-1 border-emerald-600 text-emerald-700">
                                    <MapPin className="h-3 w-3" />
                                    {[gabarito.municipality, gabarito.state].filter(Boolean).join(' - ')}
                                  </Badge>
                                )}
                                
                                {/* Contagem de alunos e turmas */}
                                <Badge variant="outline">
                                  {gabarito.students_count ?? 0} aluno(s)
                                </Badge>
                                {(gabarito.classes_count ?? 0) >= 1 && (
                                  <Badge variant="outline">
                                    {gabarito.classes_count} turma(s)
                                  </Badge>
                                )}
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground">Criado em</p>
                                <p className="font-medium">
                                  {new Date(gabarito.created_at).toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Criado por</p>
                                <p className="font-medium">{gabarito.creator_name}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Tipo de Escopo</p>
                                <p className="font-medium capitalize">
                                  {gabarito.scope_type === 'class' && 'Turma'}
                                  {gabarito.scope_type === 'grade' && 'Série'}
                                  {gabarito.scope_type === 'school' && 'Escola'}
                                  {gabarito.scope_type === 'city' && 'Município'}
                                </p>
                              </div>
                            </div>
                            {gabarito.scope_type === 'city' && gabarito.schools_summary && gabarito.schools_summary.length > 0 && (
                              <div className="mt-3 pt-3 border-t">
                                <p className="text-muted-foreground text-sm font-medium mb-2">Escolas no município</p>
                                <ul className="space-y-1 text-sm">
                                  {gabarito.schools_summary.map((s) => (
                                    <li key={s.school_id} className="flex items-center gap-2">
                                      <School className="h-3.5 w-3 text-muted-foreground shrink-0" />
                                      <span className="font-medium truncate">{s.school_name}</span>
                                      <span className="text-muted-foreground shrink-0">
                                        ({s.classes_count} turma(s), {s.students_count} aluno(s))
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {hasGenerationsList && (
                              <div className="rounded-lg border bg-muted/30 p-3 space-y-3 mt-3">
                                <p className="text-sm font-medium text-foreground">Gerações de PDF (por escopo)</p>
                                <ul className="space-y-3">
                                  {generationsSorted.map((gen) => {
                                    const canDl = generationCanDownload(gen);
                                    const genStatus = (gen.status ?? '').toLowerCase();
                                    const classLabels = generationClassLabelsFromSnapshot(gen);
                                    return (
                                      <li
                                        key={gen.id}
                                        className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                                      >
                                        <div className="min-w-0 flex-1 space-y-1">
                                          <p
                                            className="text-sm font-medium leading-snug"
                                            title={classLabels.length > 0 ? classLabels.join(', ') : undefined}
                                          >
                                            {formatGenerationScopeSummary(gen)}
                                          </p>
                                          {classLabels.length > 4 && (
                                            <p className="text-xs text-muted-foreground break-words">
                                              {classLabels.join(' · ')}
                                            </p>
                                          )}
                                          <p className="text-xs text-muted-foreground">
                                            {(gen.total_students ?? 0)} aluno(s) · {(gen.total_classes ?? 0)} turma(s)
                                            {(gen.zip_generated_at || gen.created_at) && (
                                              <>
                                                {' · '}
                                                {new Date(gen.zip_generated_at ?? gen.created_at ?? '').toLocaleString('pt-BR', {
                                                  day: '2-digit',
                                                  month: '2-digit',
                                                  year: 'numeric',
                                                  hour: '2-digit',
                                                  minute: '2-digit',
                                                })}
                                              </>
                                            )}
                                          </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                                          {genStatus === 'completed' ? (
                                            <Badge variant="default" className="bg-green-600 text-xs">
                                              Concluída
                                            </Badge>
                                          ) : genStatus === 'failed' ? (
                                            <Badge variant="destructive" className="text-xs">
                                              Falhou
                                            </Badge>
                                          ) : (
                                            <Badge variant="secondary" className="text-xs">
                                              {gen.status ?? '—'}
                                            </Badge>
                                          )}
                                          <Button
                                            size="sm"
                                            onClick={() => {
                                              handleDownloadGabarito(gabarito.id, {
                                                generationId: gen.id,
                                                jobId: gen.job_id,
                                                downloadUrl: resolveGenerationDownloadUrl(gen),
                                              })
                                            }}
                                            disabled={!canDl || isDeleting || isDownloadingGabaritoRow(gabarito.id, gen.id)}
                                          >
                                            {isDownloadingGabaritoRow(gabarito.id, gen.id) ? (
                                              <>
                                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                Baixando...
                                              </>
                                            ) : !canDl ? (
                                              <>
                                                <Clock className="h-4 w-4 mr-1" />
                                                Indisponível
                                              </>
                                            ) : (
                                              <>
                                                <Download className="h-4 w-4 mr-1" />
                                                Baixar ZIP
                                              </>
                                            )}
                                          </Button>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-2 min-w-[140px]">
                            {!hasGenerationsList && (
                            <Button
                              onClick={() => {
                                handleDownloadGabarito(gabarito.id, {
                                  jobId: gabarito.latest_generation_job_id ?? undefined,
                                  downloadUrl: resolveGabaritoDownloadUrl(gabarito),
                                })
                              }}
                              disabled={!gabarito.can_download || isDeleting || isDownloadingGabaritoRow(gabarito.id)}
                              className="w-full"
                            >
                              {isDownloadingGabaritoRow(gabarito.id) ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Baixando... {downloadProgress > 0 && `${downloadProgress}%`}
                                </>
                              ) : !gabarito.can_download ? (
                                <>
                                  <Clock className="h-4 w-4 mr-2" />
                                  Processando
                                </>
                              ) : (
                                <>
                                  <Download className="h-4 w-4 mr-2" />
                                  Baixar ZIP
                                </>
                              )}
                            </Button>
                            )}
                            {isDownloadingGabaritoRow(gabarito.id) && downloadProgress > 0 && (
                              <div className="space-y-1">
                                <Progress value={downloadProgress} className="h-2" />
                                <p className="text-xs text-center text-muted-foreground">
                                  Preparando download...
                                </p>
                              </div>
                            )}
                            <Button
                              variant="destructive"
                              onClick={() => handleOpenDeleteDialog(gabarito.id)}
                              disabled={isDeleting || isBusyDownloadingForGabaritoRow(gabarito.id)}
                              className="w-full"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Diálogo de confirmação de exclusão */}
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Confirmar Exclusão
                </DialogTitle>
                <DialogDescription>
                  {deleteMode === 'single' ? (
                    <>
                      Tem certeza que deseja excluir este gabarito? Esta ação não pode ser desfeita.
                    </>
                  ) : (
                    <>
                      Tem certeza que deseja excluir {selectedGabaritos.size} gabarito(s) selecionado(s)? 
                      Esta ação não pode ser desfeita.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setGabaritoToDelete(null);
                  }}
                  disabled={isDeleting}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Excluindo...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

      </Tabs>
    </div>
  );
}


