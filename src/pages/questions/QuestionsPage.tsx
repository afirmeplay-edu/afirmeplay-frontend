import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Eye, Pencil, Trash2, Search, ChevronLeft, ChevronRight, ArrowUpDown, Copy, HelpCircle, BookOpen, FileUp } from "lucide-react";
import { Question } from "@/components/evaluations/types";
import { useAuth } from "@/context/authContext";
import { api } from "@/lib/api";
import { AxiosError } from "axios";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import QuestionPreview from "@/components/evaluations/questions/QuestionPreview";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { getDifficultyColor } from "@/lib/utils";
import { useSkillsStore } from "@/stores/useSkillsStore";


// Estilos customizados para skeleton mais fluído
const shimmerKeyframes = `
  @keyframes shimmer {
    0% { background-position: -200px 0; }
    100% { background-position: calc(200px + 100%) 0; }
  }
`;

const shimmerStyle = {
  background: 'linear-gradient(90deg, #f0f0f0 0px, #e0e0e0 40px, #f0f0f0 80px)',
  backgroundSize: '200px 100%',
  animation: 'shimmer 1.5s ease-in-out infinite',
} as React.CSSProperties;

interface Subject {
  id: string;
  name: string;
}

interface Grade {
  id: string;
  name: string;
}

interface QuestionApiResponse {
  id: string;
  title: string;
  text: string;
  secondStatement?: string;
  type: string;
  difficulty: string;
  value: number;
  skills?: string[] | string | { id: string; code?: string }[];
  skill_code?: string;
  topics: string[] | string;
  subject?: { id: string; name: string };
  grade?: { id: string; name: string };
  createdBy?: string | { id: string; name?: string }; // API pode retornar string ou objeto
  solution?: string;
  formattedText?: string;
  formattedSolution?: string;
  options?: {
    id?: string;
    text: string;
    isCorrect: boolean;
  }[];
}

interface Filters {
  subject: string;
  difficulty: string;
  grade: string;
  type: string;
}

interface SortOption {
  value: string;
  label: string;
  key: keyof Question | 'difficulty' | 'subjectName' | 'gradeName';
  direction: 'asc' | 'desc';
}

const getQuestionCreatorId = (question: Question): string => {
  if (!question) return "";
  const rawCreator = (question as any).created_by ?? (question as any).createdBy ?? (question as any).creator;

  if (typeof rawCreator === "string") {
    return rawCreator;
  }

  if (rawCreator && typeof rawCreator === "object") {
    if (typeof rawCreator.id === "string") return rawCreator.id;
    if (typeof rawCreator.user_id === "string") return rawCreator.user_id;
  }

  return question.created_by || "";
};

const DIFFICULTIES = ['Abaixo do Básico', 'Básico', 'Adequado', 'Avançado'];
const QUESTION_TYPES = [
  { value: 'multipleChoice', label: 'Múltipla Escolha' },
  { value: 'dissertativa', label: 'Dissertativa' }
];
const PAGE_SIZE_OPTIONS = [10, 15, 20, 25];

// Opções de ordenação
const SORT_OPTIONS: SortOption[] = [
  { value: 'title-asc', label: 'Conteúdo (A-Z)', key: 'title', direction: 'asc' },
  { value: 'title-desc', label: 'Conteúdo (Z-A)', key: 'title', direction: 'desc' },
  { value: 'subject-asc', label: 'Disciplina (A-Z)', key: 'subjectName', direction: 'asc' },
  { value: 'subject-desc', label: 'Disciplina (Z-A)', key: 'subjectName', direction: 'desc' },
  { value: 'grade-asc', label: 'Série (A-Z)', key: 'gradeName', direction: 'asc' },
  { value: 'grade-desc', label: 'Série (Z-A)', key: 'gradeName', direction: 'desc' },
      { value: 'difficulty-easy', label: 'Dificuldade (Básico → Avançado)', key: 'difficulty', direction: 'asc' },
    { value: 'difficulty-hard', label: 'Dificuldade (Avançado → Básico)', key: 'difficulty', direction: 'desc' },
  { value: 'value-asc', label: 'Valor (Menor → Maior)', key: 'value', direction: 'asc' },
  { value: 'value-desc', label: 'Valor (Maior → Menor)', key: 'value', direction: 'desc' },
  { value: 'type-asc', label: 'Tipo (Múltipla Escolha → Dissertativa)', key: 'type', direction: 'asc' },
  { value: 'type-desc', label: 'Tipo (Dissertativa → Múltipla Escolha)', key: 'type', direction: 'desc' },
];

// Hook para debounce
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Componentes de Loading mais fluídos
const SkeletonRow = ({ index }: { index: number }) => (
  <tr className="border-b">
    <td className="p-3">
      <div className="h-4 w-4 rounded" style={shimmerStyle} />
    </td>
    <td className="px-3 py-2">
      <div className="h-4 w-8 rounded" style={shimmerStyle} />
    </td>
    <td className="px-3 py-2">
      <div className="h-4 w-32 rounded" style={shimmerStyle} />
    </td>
    <td className="px-3 py-2">
      <div className="h-4 w-20 rounded" style={shimmerStyle} />
    </td>
    <td className="px-3 py-2">
      <div className="h-4 w-16 rounded" style={shimmerStyle} />
    </td>
    <td className="px-3 py-2">
      <div className="h-6 w-12 rounded-full" style={shimmerStyle} />
    </td>
    <td className="px-3 py-2">
      <div className="h-4 w-24 rounded" style={shimmerStyle} />
    </td>
    <td className="px-3 py-2">
      <div className="h-4 w-8 rounded" style={shimmerStyle} />
    </td>
    <td className="px-3 py-2">
      <div className="h-4 w-20 rounded" style={shimmerStyle} />
    </td>
    <td className="px-3 py-2">
      <div className="flex items-center gap-1">
        <div className="h-8 w-8 rounded" style={shimmerStyle} />
        <div className="h-8 w-8 rounded" style={shimmerStyle} />
        <div className="h-8 w-8 rounded" style={shimmerStyle} />
      </div>
    </td>
  </tr>
);

const SkeletonCard = ({ index }: { index: number }) => (
  <div className="border rounded-lg p-3 bg-background">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-3 w-6 rounded" style={shimmerStyle} />
          <div className="h-4 w-40 rounded" style={shimmerStyle} />
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          <div className="h-5 w-16 rounded-full" style={shimmerStyle} />
          <div className="h-5 w-12 rounded-full" style={shimmerStyle} />
          <div className="h-5 w-14 rounded-full" style={shimmerStyle} />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-3 w-24 rounded" style={shimmerStyle} />
          <div className="h-3 w-16 rounded" style={shimmerStyle} />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <div className="h-4 w-4 rounded" style={shimmerStyle} />
        <div className="h-8 w-8 rounded" style={shimmerStyle} />
        <div className="h-8 w-8 rounded" style={shimmerStyle} />
        <div className="h-8 w-8 rounded" style={shimmerStyle} />
      </div>
    </div>
  </div>
);

const QuestionsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  // Debug mode
  const isDebugMode = new URLSearchParams(window.location.search).has('debug') || 
                     import.meta.env.VITE_DEBUG_MODE === 'true';

  // Injetar estilos de shimmer no documento
  React.useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = shimmerKeyframes;
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  // Estado principal
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [questionsCache, setQuestionsCache] = useState<Record<string, Question[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Estados para controle de requisições múltiplas e otimização
  // - fetchedKeys: chaves que já foram buscadas (evita buscas redundantes)
  // - isCurrentlyFetching: chave sendo buscada no momento (evita calls simultâneos)
  // - emptyResults: chaves que retornaram vazio (evita re-buscar resultados vazios)
  const [fetchedKeys, setFetchedKeys] = useState<Set<string>>(new Set());
  const [isCurrentlyFetching, setIsCurrentlyFetching] = useState<string | null>(null);
  const [emptyResults, setEmptyResults] = useState<Set<string>>(new Set());

  // Estado de filtros e pesquisa
  const [filterType, setFilterType] = useState<'my' | 'all'>('my');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [filters, setFilters] = useState<Filters>({
    subject: 'all',
    difficulty: 'all',
    grade: 'all',
    type: 'all'
  });

  // Estado de ordenação
  const [sortBy, setSortBy] = useState<string>('title-asc');

  // Estado de paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Estado de modais e seleção
  const [viewQuestion, setViewQuestion] = useState<Question | null>(null);
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Mapeamento skillId -> code para exibir código da habilidade (não o id)
  const [skillIdToCode, setSkillIdToCode] = useState<Record<string, string>>({});
  const { fetchSkills } = useSkillsStore();

  // Função de ordenação
  const sortQuestions = (questions: Question[], sortBy: string): Question[] => {
    if (!sortBy || sortBy === 'default') return questions;

    const sortOption = SORT_OPTIONS.find(opt => opt.value === sortBy);
    if (!sortOption) return questions;

    return [...questions].sort((a, b) => {
      let aValue: string;
      let bValue: string;

      switch (sortOption.key) {
        case 'title':
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        case 'subjectName':
          aValue = a.subject?.name?.toLowerCase() || '';
          bValue = b.subject?.name?.toLowerCase() || '';
          break;
        case 'gradeName':
          aValue = a.grade?.name?.toLowerCase() || '';
          bValue = b.grade?.name?.toLowerCase() || '';
          break;
        case 'difficulty': {
          // Mapear dificuldades para valores numéricos
          const difficultyOrder = { 'Abaixo do Básico': 1, 'Básico': 2, 'Adequado': 3, 'Avançado': 4 };
          aValue = String(difficultyOrder[a.difficulty as keyof typeof difficultyOrder] || 0);
          bValue = String(difficultyOrder[b.difficulty as keyof typeof difficultyOrder] || 0);
          break;
        }
        case 'value':
          aValue = String(a.value || 0);
          bValue = String(b.value || 0);
          break;
        case 'type': {
          // Mapear tipos para valores numéricos
          const typeOrder = { 'multipleChoice': 1, 'dissertativa': 2, 'trueFalse': 3 };
          aValue = String(typeOrder[a.type as keyof typeof typeOrder] || 0);
          bValue = String(typeOrder[b.type as keyof typeof typeOrder] || 0);
          break;
        }
        default:
          aValue = a[sortOption.key as keyof Question] as string || '';
          bValue = b[sortOption.key as keyof Question] as string || '';
      }

      // Comparação
      if (aValue < bValue) {
        return sortOption.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortOption.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  // Questões filtradas e ordenadas (otimizado)
  const filteredAndSortedQuestions = useMemo(() => {
    if (questions.length === 0) return [];

    const term = debouncedSearchTerm.trim().toLowerCase();
    const getSearchableContent = (q: Question): string => {
      const raw = [
        q.title,
        (q as any).text ?? '',
        (q as any).formattedText ?? '',
        (q as any).secondStatement ?? (q as any).second_statement ?? '',
      ].join(' ');
      return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    };

    const filtered = questions.filter(question => {
      // Busca por título, id ou conteúdo do enunciado (texto, formattedText, secondStatement)
      if (term !== '') {
        const matchTitle = question.title.toLowerCase().includes(term);
        const matchId = question.id.includes(debouncedSearchTerm);
        const matchContent = getSearchableContent(question).includes(term);
        if (!matchTitle && !matchId && !matchContent) return false;
      }

      if (filters.subject !== 'all' && question.subject?.id !== filters.subject) {
        return false;
      }

      if (filters.difficulty !== 'all' && question.difficulty !== filters.difficulty) {
        return false;
      }

      if (filters.grade !== 'all' && question.grade?.id !== filters.grade) {
        return false;
      }

      if (filters.type !== 'all' && question.type !== filters.type) {
        return false;
      }

      return true;
    });

    return sortQuestions(filtered, sortBy);
  }, [questions, debouncedSearchTerm, filters, sortBy]);

  const totalPages = Math.ceil(filteredAndSortedQuestions.length / pageSize);
  const paginatedQuestions = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredAndSortedQuestions.slice(startIndex, startIndex + pageSize);
  }, [filteredAndSortedQuestions, currentPage, pageSize]);

  // --- Filtros com opções somente do que existe ---
  // Objetivo: evitar mostrar disciplinas/séries/tipos que não aparecem em nenhuma questão carregada.
  const availableSubjectIds = useMemo(() => {
    return new Set(
      questions
        .map((q) => q.subject?.id)
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    );
  }, [questions]);

  const availableGradeIds = useMemo(() => {
    return new Set(
      questions
        .map((q) => q.grade?.id)
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    );
  }, [questions]);

  const availableTypes = useMemo(() => {
    return new Set(
      questions
        .map((q) => q.type)
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    );
  }, [questions]);

  const availableDifficulties = useMemo(() => {
    return new Set(
      questions
        .map((q) => q.difficulty)
        .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
    );
  }, [questions]);

  const restrictFilterOptions = questions.length > 0;

  const questionSubjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of questions) {
      const sid = q.subject?.id;
      const sname = q.subject?.name;
      if (typeof sid === "string" && sid.trim() && typeof sname === "string" && sname.trim()) {
        map.set(sid, sname);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [questions]);

  const questionGradeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of questions) {
      const gid = q.grade?.id;
      const gname = q.grade?.name;
      if (typeof gid === "string" && gid.trim() && typeof gname === "string" && gname.trim()) {
        map.set(gid, gname);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [questions]);

  const subjectOptions = useMemo(() => {
    if (!restrictFilterOptions) return subjects;
    // Se a API `/subjects` ainda não carregou, deriva das próprias questões para não “sumir” com opções.
    if (subjects.length === 0) return questionSubjectOptions;
    return subjects.filter((s) => availableSubjectIds.has(s.id));
  }, [restrictFilterOptions, subjects, availableSubjectIds]);

  const gradeOptions = useMemo(() => {
    if (!restrictFilterOptions) return grades;
    // Se a API `/grades/` ainda não carregou, deriva das próprias questões para não “sumir” com opções.
    if (grades.length === 0) return questionGradeOptions;
    return grades.filter((g) => availableGradeIds.has(g.id));
  }, [restrictFilterOptions, grades, availableGradeIds]);

  const typeOptions = useMemo(() => {
    if (!restrictFilterOptions) return QUESTION_TYPES;
    return QUESTION_TYPES.filter((t) => availableTypes.has(t.value));
  }, [restrictFilterOptions, availableTypes]);

  const difficultyOptions = useMemo(() => {
    if (!restrictFilterOptions) return DIFFICULTIES;
    return DIFFICULTIES.filter((d) => availableDifficulties.has(d));
  }, [restrictFilterOptions, availableDifficulties]);

  // Se o usuário tinha um filtro, mas ele deixa de existir no dataset carregado, volta para "all".
  useEffect(() => {
    if (!restrictFilterOptions) return;
    setFilters((prev) => {
      const next = { ...prev };
      if (next.subject !== "all" && !availableSubjectIds.has(next.subject)) next.subject = "all";
      if (next.grade !== "all" && !availableGradeIds.has(next.grade)) next.grade = "all";
      if (next.type !== "all" && !availableTypes.has(next.type)) next.type = "all";
      if (next.difficulty !== "all" && !availableDifficulties.has(next.difficulty)) next.difficulty = "all";
      return next;
    });
  }, [
    restrictFilterOptions,
    availableSubjectIds,
    availableGradeIds,
    availableTypes,
    availableDifficulties,
  ]);

  // Definir filtro inicial para professores (removido - permite que professores escolham entre Minhas e Todas)
  // useEffect(() => {
  //   if (user.role === 'professor' && filterType === 'my') {
  //     setFilterType('all');
  //   }
  // }, [user.role, filterType]);

  // Limpar cache quando professor acessa "Todas as Questões" (apenas na primeira vez)
  useEffect(() => {
    if (user.role === 'professor' && filterType === 'all' && !fetchedKeys.has(`${filterType}-${user.id || 'all'}`)) {
      const cacheKey = `${filterType}-${user.id || 'all'}`;
      
      setQuestionsCache(prev => {
        const newCache = { ...prev };
        delete newCache[cacheKey];
        return newCache;
      });
      
      setEmptyResults(prev => {
        const newSet = new Set(prev);
        newSet.delete(cacheKey);
        return newSet;
      });
      
      setFetchedKeys(prev => {
        const newSet = new Set(prev);
        newSet.delete(cacheKey);
        return newSet;
      });
    }
  }, [user.role, filterType, user.id, fetchedKeys]);

  // Fetch inicial de dados (executar em paralelo)
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Carregar subjects e grades em paralelo, sem bloquear questões
        const promises = [
          api.get("/subjects").then(res => setSubjects(res.data)),
          api.get("/grades/").then(res => setGrades(res.data))
        ];
        
        await Promise.allSettled(promises);
      } catch (error) {
        console.error("Erro ao buscar dados iniciais:", error);
      }
    };
    
    fetchInitialData();
  }, []);

  // Fetch questões com cache e retry
  const fetchQuestions = useCallback(async (isRetry = false, forceRefresh = false) => {
    const cacheKey = `${filterType}-${user.id || 'all'}`;
    
    
    
    // Verificar se já está fazendo fetch da mesma chave
    if (!forceRefresh && isCurrentlyFetching === cacheKey) {

      return;
    }
    
    // Verificar cache primeiro (exceto se for retry ou forceRefresh)
    if (!isRetry && !forceRefresh && questionsCache[cacheKey]) {
      setQuestions(questionsCache[cacheKey]);
      setLoading(false);
      setError(null);
      setLoadingProgress(0);

      return;
    }
    
    // Verificar se já foi buscado e retornou vazio (exceto retry ou forceRefresh)
    if (!isRetry && !forceRefresh && emptyResults.has(cacheKey)) {
      setQuestions([]);
      setLoading(false);
      setError(null);
      setLoadingProgress(0);

      return;
    }

    // Marcar que está fazendo fetch desta chave
    setIsCurrentlyFetching(cacheKey);
    
    if (!isRetry) {
      setLoading(true);
      setError(null);
      setLoadingProgress(0);
      
      // Animação de progresso
      const progressInterval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 15;
        });
      }, 100);
    }

    try {
      const params: { created_by?: string; scope?: string; all?: string; admin_view?: string } = {};

      if (filterType === 'my' && user.id) {
        params.created_by = user.id;
      } else if (filterType === 'all' && (user.role === 'professor' || user.role === 'tecadm' || user.role === 'diretor' || user.role === 'coordenador')) {
        // Tentar diferentes parâmetros para forçar busca de todas as questões
        params.scope = 'global';
        params.all = 'true';
        params.admin_view = 'true';
      }



      // Log temporário para testar novos parâmetros
      if ((user.role === 'professor' || user.role === 'tecadm' || user.role === 'diretor' || user.role === 'coordenador') && filterType === 'all') {
        // console.log('🧪 TESTE - Usuário tentando ver todas as questões:', params);
      }

      if (isDebugMode) {
        // console.log('📡 Fazendo requisição para /questions/ com params:', params);
      }
      
      let response = await api.get("/questions/", { params });
    
      
      // Se professor não recebeu questões, tentar abordagem alternativa
      if (user.role === 'professor' && filterType === 'all' && 
          (!response.data || response.data.length === 0)) {
        // console.log('🔄 Primeira tentativa vazia, tentando endpoint alternativo...');
        
        try {
          // Tentar sem parâmetros especiais
          response = await api.get("/questions/");
          // console.log('🆔 Tentativa sem parâmetros:', response.data?.length);
        } catch (altError) {
          // console.log('❌ Falha na tentativa alternativa');
        }
        
        // Se ainda vazio, tentar com endpoint de admin (pode não existir)
        if (!response.data || response.data.length === 0) {
          try {
            response = await api.get("/admin/questions");
            // console.log('🔧 Tentativa com endpoint admin:', response.data?.length);
          } catch (adminError) {
            // console.log('❌ Endpoint admin não existe');
          }
        }
      }
      


      if (isDebugMode) {
        // console.log('✅ Resposta recebida:', response.status, response.data?.length);
      }
      
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Dados inválidos recebidos do servidor');
      }

      const normalizedQuestions: Question[] = response.data.map((q: QuestionApiResponse) => {
        // Normalizar o tipo da questão
        let normalizedType: "multipleChoice" | "trueFalse" | "dissertativa";
        
        if (q.type === "multiple_choice") {
          normalizedType = "multipleChoice";
        } else if (q.type === "true_false") {
          normalizedType = "trueFalse";
        } else if (q.type === "open" || q.type === "dissertativa") {
          normalizedType = "dissertativa";
        } else {
          // Fallback: se tem opções, é múltipla escolha, senão é dissertativa
          normalizedType = (q.options && q.options.length > 0) ? "multipleChoice" : "dissertativa";
        }

        const resolveCreatorId = (): string => {
          if (!q) return "";

          const candidate = q.createdBy;

          if (typeof candidate === "string") {
            return candidate;
          }

          if (candidate && typeof candidate === "object") {
            if (typeof candidate.id === "string") {
              return candidate.id;
            }
          }

          const alt = (q as any);
          return (
            (typeof alt.created_by === "string" && alt.created_by) ||
            (typeof alt.created_by_id === "string" && alt.created_by_id) ||
            (typeof alt.creator_id === "string" && alt.creator_id) ||
            (alt.creator && typeof alt.creator.id === "string" && alt.creator.id) ||
            ""
          );
        };

        const creatorId = resolveCreatorId();

        // Código da habilidade: API pode enviar skill_code, ou skills como array de { id, code }
        let skillCode: string | undefined;
        let skillsArr: string[] = [];
        if ((q as QuestionApiResponse).skill_code) {
          skillCode = (q as QuestionApiResponse).skill_code;
        } else if (Array.isArray(q.skills) && q.skills.length > 0) {
          const first = q.skills[0];
          if (typeof first === 'object' && first !== null && 'code' in first) {
            skillCode = (q.skills as { id: string; code?: string }[]).map(s => s.code).filter(Boolean).join(', ');
            skillsArr = (q.skills as { id: string; code?: string }[]).map(s => s.id);
          } else {
            skillsArr = (q.skills as string[]).map((s: string) => (typeof s === 'string' ? s.trim() : String(s)));
          }
        } else if (q.skills && typeof q.skills === 'string') {
          skillsArr = q.skills.split(',').map(s => s.trim());
        }
        
        return {
          id: q.id,
          title: q.title,
          text: q.text,
          secondStatement: q.secondStatement || '',
          type: normalizedType,
          subjectId: q.subject?.id || '',
          subject: q.subject || { id: '', name: '' },
          grade: q.grade || { id: '', name: '' },
          difficulty: q.difficulty,
          value: q.value,
          solution: q.solution || '',
          formattedText: q.formattedText,
          formattedSolution: q.formattedSolution,
          options: q.options || [],
          skills: skillsArr,
          skillCode,
          created_by: creatorId,
          educationStage: null
        };
      });
      
      // Log das questões normalizadas
      console.log('✅ Questões normalizadas:', {
        total: normalizedQuestions.length,
        byType: normalizedQuestions.reduce((acc, q) => {
          acc[q.type] = (acc[q.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      });
      
      // Salvar no cache
      setQuestionsCache(prev => ({
        ...prev,
        [cacheKey]: normalizedQuestions
      }));
      
      // Marcar como buscado
      setFetchedKeys(prev => new Set(prev).add(cacheKey));
      
      // Se resultado vazio, marcar para evitar buscas futuras
      if (normalizedQuestions.length === 0) {
        setEmptyResults(prev => new Set(prev).add(cacheKey));
        if (isDebugMode) {
          // console.log('🗳️ Marcando resultado vazio para:', cacheKey);
        }
      } else {
        // Remover dos resultados vazios se agora tem dados
        setEmptyResults(prev => {
          const newSet = new Set(prev);
          newSet.delete(cacheKey);
          return newSet;
        });
      }
      
      setQuestions(normalizedQuestions);
      setError(null);
      setRetryCount(0);
      setLoadingProgress(100);
      
      // Completar progresso suavemente
      setTimeout(() => {
        setLoadingProgress(0);
        setIsInitialLoad(false);
      }, 300);

      // Sem toast para loading bem-sucedido - mais fluído

    } catch (error) {
      if (isDebugMode) {
        // console.error("❌ Erro ao buscar questões:", error);
      }
      
      let errorMessage = "Erro desconhecido";
      
              if (error instanceof AxiosError) {
          // Erro de resposta do servidor
          if (error.response) {
            const status = error.response.status;
            if (isDebugMode) {
              // console.log('🔍 Status do erro:', status, error.response.data);
            }
          
          switch (status) {
            case 400:
              errorMessage = "Dados da requisição inválidos";
              break;
            case 401:
              errorMessage = "Não autorizado. Faça login novamente";
              break;
            case 403:
              errorMessage = "Acesso negado";
              break;
            case 404:
              errorMessage = "Endpoint não encontrado";
              break;
            case 500:
              errorMessage = "Erro interno do servidor";
              break;
            case 502:
            case 503:
            case 504:
              errorMessage = "Servidor temporariamente indisponível";
              break;
            default:
              errorMessage = `Erro do servidor (${status})`;
          }
        } else if (error.request) {
          // Erro de rede
          errorMessage = "Erro de conectividade. Verifique sua internet";
        } else {
          // Erro de configuração
          errorMessage = error.message || "Erro ao processar requisição";
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      setError(errorMessage);

      // Tentar usar cache antigo se disponível
      if (questionsCache[cacheKey] && questionsCache[cacheKey].length > 0) {
        if (isDebugMode) {
          // ✅ REMOVIDO: Console.log para apresentação
          // console.log('📦 Usando dados do cache devido ao erro');
        }
        setQuestions(questionsCache[cacheKey]);
        // ✅ REMOVIDO: Mensagem de erro para apresentação
        // setError(`${errorMessage} (usando dados em cache)`);
      } else {
        setQuestions([]);
      }

      // Retry automático para erros temporários (mas não para resultados vazios conhecidos)
      if (!isRetry && retryCount < 2 && !emptyResults.has(cacheKey) && error instanceof AxiosError && (
        (error.response?.status && error.response.status >= 500) || 
        error.code === 'NETWORK_ERROR' ||
        error.code === 'ECONNABORTED'
      )) {
        if (isDebugMode) {
          // console.log(`🔄 Tentativa ${retryCount + 1}/3 em 2 segundos...`);
        }
        setRetryCount(prev => prev + 1);
        setTimeout(() => {
          fetchQuestions(true);
        }, 2000);
      } else if (!questionsCache[cacheKey] || questionsCache[cacheKey].length === 0) {
        // Só mostrar toast se não há dados em cache
        toast({
          title: "Erro ao carregar questões",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      // Limpar flag de fetch em andamento
      setIsCurrentlyFetching(null);
      
      // Delay mínimo para UX mais suave
      setTimeout(() => {
        setLoading(false);
      }, isInitialLoad ? 400 : 100);
    }
  }, [user.id, filterType, questionsCache, retryCount, toast, isCurrentlyFetching, emptyResults, isDebugMode, isInitialLoad]);

  useEffect(() => {
    if (user.id || filterType === 'all' || filterType === 'my') {
      fetchQuestions();
    }
  }, [user.id, filterType, fetchQuestions]);

  // Carregar habilidades por disciplina/série em paralelo; atualizar o mapa assim que cada resposta chegar
  useEffect(() => {
    if (questions.length === 0) {
      setSkillIdToCode({});
      return;
    }
    const pairs = new Set<string>();
    questions.forEach(q => {
      const sid = q.subject?.id;
      const gid = q.grade?.id;
      if (sid) pairs.add(`${sid}:${gid || ''}`);
    });
    let cancelled = false;
    const keys = Array.from(pairs);
    // Buscar todas em paralelo; cada uma atualiza o estado ao terminar para exibir códigos o mais cedo possível
    keys.forEach((key) => {
      const [subjectId, gradeId] = key.split(':');
      fetchSkills(subjectId, gradeId || undefined)
        .then((skills) => {
          if (cancelled) return;
          const map: Record<string, string> = {};
          skills.forEach(s => { map[s.id] = s.code; });
          setSkillIdToCode(prev => ({ ...prev, ...map }));
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [questions, fetchSkills]);

  // Exibir código da habilidade: skillCode da API ou resolução por id
  const getSkillCodeDisplay = (question: Question): string => {
    if (question.skillCode) return question.skillCode;
    const arr = Array.isArray(question.skills) ? question.skills : [];
    if (arr.length === 0) return '—';
    const codes = arr.map(s => {
      const code = skillIdToCode[s];
      if (code) return code;
      // Se parece UUID (hex com hífens), ainda não resolvemos
      if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(s).trim())) return null;
      return s; // já é código
    }).filter(Boolean);
    return codes.length ? codes.join(', ') : '—';
  };

  // Reset page when filters or sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, filters, filterType, sortBy]);

  // Limpar estados de controle quando filtros principais mudam
  useEffect(() => {
    const cacheKey = `${filterType}-${user.id || 'all'}`;
    
    // Limpar estados de erro e retry quando mudar de aba
    setError(null);
    setRetryCount(0);
  }, [filterType, user.id]);

  // Limpar resultados vazios antigos periodicamente (limpeza de memória)
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      // Por simplicidade, limpar todos os resultados vazios a cada 10 minutos
      // Em produção, seria melhor armazenar timestamps
      setEmptyResults(new Set());
      
      if (isDebugMode) {
        // console.log('🧹 Limpeza periódica de resultados vazios');
      }
    }, 10 * 60 * 1000); // 10 minutos

    return () => clearInterval(cleanupInterval);
  }, [isDebugMode]);

  // Event handlers
  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const hasActiveQuestionFilters = Object.values(filters).some((v) => v !== "all");

  const clearQuestionFilters = () => {
    setFilters({
      subject: "all",
      difficulty: "all",
      grade: "all",
      type: "all",
    });
  };

  const handleDelete = async () => {
    if (!deleteQuestionId) return;

    try {
      // console.log(`🗑️ Tentando excluir questão: ${deleteQuestionId}`);
      await api.delete(`/questions/${deleteQuestionId}`);
      toast({
        title: "Sucesso!",
        description: "A questão foi excluída.",
      });
      setDeleteQuestionId(null);
      // Limpar cache e refetch
      setQuestionsCache({});
      fetchQuestions();
    } catch (error: any) {
      // console.error("❌ Erro detalhado ao excluir questão:", {
      //   error,
      //   questionId: deleteQuestionId,
      //   message: error.message,
      //   response: error.response,
      //   status: error.response?.status,
      //   data: error.response?.data
      // });
      
      let errorMessage = "Não foi possível excluir a questão.";
      
      if (error.response?.status === 404) {
        errorMessage = "Questão não encontrada ou já foi excluída.";
      } else if (error.response?.status === 403) {
        errorMessage = "Você não tem permissão para excluir esta questão.";
      } else if (error.response?.status === 409) {
        errorMessage = "Esta questão está sendo usada em avaliações e não pode ser excluída.";
      } else if (error.response?.status === 500) {
        errorMessage = "Erro interno do servidor. A questão pode ter dados corrompidos.";
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      
      toast({
        title: "Erro ao excluir questão",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleBulkDelete = async () => {
    try {
      // console.log(`🗑️ Tentando excluir ${selectedIds.length} questões:`, selectedIds);
      await api.delete("/questions", { data: { ids: selectedIds } });
      toast({
        title: "Sucesso!",
        description: `${selectedIds.length} questões foram excluídas.`,
      });
      setSelectedIds([]);
      // Limpar cache e refetch
      setQuestionsCache({});
      fetchQuestions();
    } catch (error: any) {
      // console.error("❌ Erro detalhado ao excluir questões em massa:", {
      //   error,
      //   selectedIds,
      //   message: error.message,
      //   response: error.response,
      //   status: error.response?.status,
      //   data: error.response?.data
      // });
      
      let errorMessage = "Não foi possível excluir as questões selecionadas.";
      
      if (error.response?.status === 404) {
        errorMessage = "Uma ou mais questões não foram encontradas.";
      } else if (error.response?.status === 403) {
        errorMessage = "Você não tem permissão para excluir uma ou mais questões.";
      } else if (error.response?.status === 409) {
        errorMessage = "Algumas questões estão sendo usadas em avaliações e não podem ser excluídas.";
      } else if (error.response?.status === 500) {
        errorMessage = "Erro interno do servidor. Algumas questões podem ter dados corrompidos.";
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      
      toast({
        title: "Erro ao excluir questões",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setDeleteQuestionId(null);
    }
  };

  const handleDuplicate = async (question: Question) => {
    try {
      // Criar uma cópia da questão sem o ID e com título modificado
      const duplicatedQuestion = {
        title: `[CÓPIA] ${question.title}`,
        text: question.text,
        formattedText: question.formattedText || question.text,
        second_statement: question.secondStatement,
        type: question.type,
        subjectId: question.subject?.id || question.subjectId,
        grade: question.grade?.id,
        gradeId: question.grade?.id,
        difficulty: question.difficulty,
        value: question.value || 0,
        solution: question.solution || "",
        formattedSolution: question.formattedSolution || question.solution || "",
        skills: question.skills || [],
        options: question.options?.map(opt => ({ text: opt.text, isCorrect: opt.isCorrect })) || [],
        created_by: user?.id,
        createdBy: user?.id,
        lastModifiedBy: user?.id
      };

      // console.log("📤 Payload sendo enviado:", duplicatedQuestion);

      const response = await api.post("/questions", duplicatedQuestion);
      
      // console.log("✅ Resposta da API:", response.data);
      
      toast({
        title: "Questão duplicada! 🎉",
        description: "Uma cópia da questão foi criada com sucesso.",
      });
      
      // Atualizar a lista de questões
      fetchQuestions(false, true);
    } catch (error: unknown) {
      // console.error("❌ Erro ao duplicar questão:", error);
      
      let errorMessage = "Erro desconhecido";
      
      if (error instanceof Error) {
        errorMessage = error.message;
        // Se for um erro do axios, tentar acessar a resposta
        if ('response' in error && error.response && typeof error.response === 'object') {
          const response = error.response as { data?: { message?: string } };
          // console.error("📄 Detalhes do erro:", response.data);
          errorMessage = response.data?.message || error.message;
        }
      }
      
      toast({
        title: "Erro ao duplicar questão",
        description: `Erro: ${errorMessage}`,
        variant: "destructive",
      });
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(paginatedQuestions.map((q) => q.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((selectedId) => selectedId !== id)
    );
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleRetry = () => {
    const cacheKey = `${filterType}-${user.id || 'all'}`;
    
    setError(null);
    setRetryCount(0);
    
    // Limpar cache e estados de controle para esta chave específica
    setQuestionsCache(prev => {
      const newCache = { ...prev };
      delete newCache[cacheKey];
      return newCache;
    });
    
    setFetchedKeys(prev => {
      const newSet = new Set(prev);
      newSet.delete(cacheKey);
      return newSet;
    });
    
    setEmptyResults(prev => {
      const newSet = new Set(prev);
      newSet.delete(cacheKey);
      return newSet;
    });
    
    // Forçar nova busca
    fetchQuestions(false, true);
  };



    const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    const maxVisiblePages = window.innerWidth < 640 ? 3 : 5; // Fewer pages on mobile
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1 py-3 border-t bg-muted/20">
        <div className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
          <span className="hidden xs:inline">Mostrando </span>
          {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredAndSortedQuestions.length)} 
          <span className="hidden xs:inline"> de </span>
          <span className="xs:hidden">/</span>
          {filteredAndSortedQuestions.length}
        </div>
        
        <div className="flex items-center justify-center space-x-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>

          {/* Show first page if not in range */}
          {startPage > 1 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(1)}
                className="h-8 w-8 p-0 text-xs"
              >
                1
              </Button>
              {startPage > 2 && <span className="text-muted-foreground">...</span>}
            </>
          )}

          {pages.map((page) => (
            <Button
              key={page}
              variant={currentPage === page ? "default" : "outline"}
              size="sm"
              onClick={() => handlePageChange(page)}
              className="h-8 w-8 p-0 text-xs"
            >
              {page}
            </Button>
          ))}

          {/* Show last page if not in range */}
          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && <span className="text-muted-foreground">...</span>}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(totalPages)}
                className="h-8 w-8 p-0 text-xs"
              >
                {totalPages}
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  };

  const FiltersContent = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div>
        <label className="text-sm font-medium mb-1 block text-muted-foreground">
          Disciplina
        </label>
        <Select
          onValueChange={(value) => handleFilterChange("subject", value)}
          value={filters.subject}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Todas as Disciplinas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Disciplinas</SelectItem>
            {subjectOptions.map((subject) => (
              <SelectItem key={subject.id} value={subject.id}>
                {subject.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block text-muted-foreground">
          Série
        </label>
        <Select
          onValueChange={(value) => handleFilterChange("grade", value)}
          value={filters.grade}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Todas as Séries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Séries</SelectItem>
            {gradeOptions.map((grade) => (
              <SelectItem key={grade.id} value={grade.id}>
                {grade.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block text-muted-foreground">
          Dificuldade
        </label>
        <Select
          onValueChange={(value) =>
            handleFilterChange("difficulty", value)
          }
          value={filters.difficulty}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Todas as Dificuldades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Dificuldades</SelectItem>
            {difficultyOptions.map((difficulty) => (
              <SelectItem key={difficulty} value={difficulty}>
                {difficulty}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block text-muted-foreground">
          Tipo
        </label>
        <Select
          onValueChange={(value) => handleFilterChange("type", value)}
          value={filters.type}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Todos os Tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Tipos</SelectItem>
            {typeOptions.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const QuestionCard = React.memo(({ question, index }: { question: Question; index: number }) => {
    const handleView = useCallback(() => setViewQuestion(question), [question]);
    const handleDeleteClick = useCallback(() => setDeleteQuestionId(question.id), [question.id]);
    const handleDuplicateClick = useCallback(() => handleDuplicate(question), [question]);
    const handleSelect = useCallback((checked: boolean) => handleSelectOne(question.id, checked), [question.id]);
    
    // Verificar se usuário pode editar/deletar (se é o criador ou admin)
    const creatorId = getQuestionCreatorId(question);
    const canEditDelete = !!user && (user.role === 'admin' || (!!creatorId && creatorId === user.id));
    
   

    return (
      <div 
        className="border rounded-lg p-4 bg-background hover:bg-muted/20 transition-colors shadow-sm"
      >
        {/* Header with number, title and checkbox */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedIds.includes(question.id)}
              onCheckedChange={handleSelect}
              aria-label={`Selecionar questão ${question.id}`}
              className="mt-0.5"
            />
            <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
              #{((currentPage - 1) * pageSize) + index + 1}
            </span>
          </div>
          <h3 className="font-medium leading-tight flex-1 min-w-0">{question.title}</h3>
        </div>
        
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge variant="secondary" className="text-xs font-medium">
            {question.subject?.name}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {question.grade?.name}
          </Badge>
          <Badge 
            variant="outline"
            className={`text-xs font-medium ${getDifficultyColor(question.difficulty)}`}
          >
            {question.difficulty}
          </Badge>
          {getSkillCodeDisplay(question) !== '—' && (
            <Badge variant="secondary" className="text-xs font-mono" title="Habilidade vinculada">
              {getSkillCodeDisplay(question)}
            </Badge>
          )}
        </div>
        
        {/* Meta info and actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex flex-col xs:flex-row xs:items-center gap-1 xs:gap-3 text-xs text-muted-foreground">
            <span className="font-medium">
              {question.type === "multipleChoice" ? "Múltipla Escolha" : "Dissertativa"}
            </span>
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">
              Valor: {question.value}
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleView}
              className="h-8 w-8 p-0 hover:bg-blue-100 dark:hover:bg-blue-950/30"
              title="Visualizar"
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleDuplicateClick}
              className="h-8 w-8 p-0 hover:bg-green-100 dark:hover:bg-green-950/30"
              title="Duplicar questão"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            {canEditDelete && (
              <>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  asChild
                  className="h-8 w-8 p-0 hover:bg-orange-100 dark:hover:bg-orange-950/30"
                  title="Editar (clique com botão direito para abrir em nova guia)"
                >
                  <Link to={`/app/cadastros/questao/editar/${question.id}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleDeleteClick}
                  className="h-8 w-8 p-0 hover:bg-red-100 dark:hover:bg-red-950/30"
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  });

  return (
    <div className="container mx-auto py-2 px-2 sm:py-4 sm:px-4 space-y-4">
      {/* Loading Progress Bar */}
      {(loading || loadingProgress > 0) && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20">
          <div 
            className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-300 ease-out rounded-r-full"
            style={{ 
              width: `${loadingProgress}%`,
              boxShadow: '0 0 10px rgba(var(--primary), 0.5)'
            }}
          />
        </div>
      )}
      
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5 flex items-start gap-2 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
            <HelpCircle className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
            Questões
          </h1>
          <div className="flex items-center gap-1">
            {error && (
              <Badge variant="destructive" className="text-xs">
                Erro de Conexão
              </Badge>
            )}
            {loading && (
              <Badge variant="secondary" className="text-xs animate-pulse">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-current animate-bounce"></div>
                  <span className="hidden sm:inline">Carregando...</span>
                </div>
              </Badge>
            )}
            {retryCount > 0 && (
              <Badge variant="outline" className="text-xs">
                Tentativa {retryCount}/3
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2 w-full sm:w-auto sm:justify-end">
          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteQuestionId("bulk")}
              className="flex-1 sm:flex-none"
            >
              <Trash2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Excluir ({selectedIds.length})</span>
              <span className="sm:hidden">({selectedIds.length})</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/app/cadastros/habilidades")}
            className="flex-1 sm:flex-none"
          >
            <BookOpen className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Banco de Habilidades</span>
            <span className="sm:hidden">Habilidades</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/app/cadastros/questao/importar")}
            className="flex-1 sm:flex-none"
          >
            <FileUp className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Importar questões</span>
            <span className="sm:hidden">Importar</span>
          </Button>
          <Button
            size="sm"
            onClick={() => navigate("/app/cadastros/questao/criar")}
            className="flex-1 sm:flex-none"
          >
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Nova Questão</span>
            <span className="sm:hidden">Nova</span>
          </Button>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-muted/30 p-3 rounded-lg space-y-3">
        {/* Search and Main Tabs - Always on top */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Pesquisar por conteúdo ou número..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-9"
            />
          </div>

          <Tabs value={filterType} onValueChange={(value) => setFilterType(value as 'my' | 'all')} className="w-full sm:w-auto">
            <TabsList className="h-9 w-full sm:w-auto">
              <TabsTrigger value="my" className="text-sm flex-1 sm:flex-none">Minhas</TabsTrigger>
              {(user.role === 'admin' || user.role === 'professor' || user.role === 'tecadm' || user.role === 'diretor' || user.role === 'coordenador') && 
                <TabsTrigger value="all" className="text-sm flex-1 sm:flex-none">Todas</TabsTrigger>
              }
            </TabsList>
          </Tabs>
        </div>

        {/* Secondary Controls */}
        <div className="flex flex-col sm:flex-row gap-2 sm:justify-between sm:items-center">
          <div className="flex flex-col xs:flex-row gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:block">Ordenar:</span>
              <Select onValueChange={(value) => setSortBy(value)} value={sortBy}>
                <SelectTrigger className="w-full xs:w-40 sm:w-48 h-9">
                  <ArrowUpDown className="h-3 w-3 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:block">Por página:</span>
              <Select onValueChange={(value) => setPageSize(Number(value))} value={pageSize.toString()}>
                <SelectTrigger className="w-20 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Filters inline (sem abrir aba lateral) */}
        <div className="mt-2">
          <FiltersContent />
          {hasActiveQuestionFilters && (
            <div className="flex justify-end mt-3">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={clearQuestionFilters}
              >
                Limpar filtros
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{filteredAndSortedQuestions.length} questões encontradas</span>
          {searchTerm !== debouncedSearchTerm && (
            <div className="flex items-center gap-1 text-xs">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
              <span className="animate-pulse">Buscando...</span>
            </div>
          )}
        </div>
        {paginatedQuestions.length > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={paginatedQuestions.length > 0 && selectedIds.length === paginatedQuestions.length}
              onCheckedChange={handleSelectAll}
              aria-label="Selecionar todas da página"
            />
            <span className="text-xs xs:text-sm">Selecionar todas da página</span>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {/* Desktop Skeleton */}
          <div className="hidden md:block border rounded-lg overflow-hidden bg-background">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="p-3 w-12"><Skeleton className="h-4 w-4" /></th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Número</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Conteúdo</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Disciplina</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Série</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Dificuldade</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Tipo</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Valor</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Habilidade</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: pageSize }).map((_, index) => (
                  <SkeletonRow key={index} index={index} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Skeleton */}
          <div className="md:hidden space-y-3">
            {Array.from({ length: pageSize }).map((_, index) => (
              <SkeletonCard key={index} index={index} />
            ))}
          </div>
        </div>
      ) : paginatedQuestions.length > 0 ? (
        <div className="space-y-4">
          {/* Desktop Table */}
          <div className="hidden md:block border rounded-lg overflow-hidden bg-background">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="p-3 w-12">
                    <Checkbox
                      checked={paginatedQuestions.length > 0 && selectedIds.length === paginatedQuestions.length}
                      onCheckedChange={handleSelectAll}
                      aria-label="Selecionar todas"
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Número</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Conteúdo</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Disciplina</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Série</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Dificuldade</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Tipo</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Valor</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Habilidade</th>
                  <th className="px-3 py-2 text-left text-sm font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedQuestions.map((question, index) => {
                  const creatorId = getQuestionCreatorId(question);
                  const canEditDeleteDesktop = !!user && (user.role === 'admin' || (!!creatorId && creatorId === user.id));

                  return (
                    <tr 
                      key={question.id} 
                      className="border-b hover:bg-muted/20 transition-colors" 
                      data-state={selectedIds.includes(question.id) && "selected"}
                    >
                      <td className="p-3">
                        <Checkbox
                          checked={selectedIds.includes(question.id)}
                          onCheckedChange={(checked) => handleSelectOne(question.id, !!checked)}
                          aria-label={`Selecionar questão ${question.id}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-sm font-mono">{((currentPage - 1) * pageSize) + index + 1}</td>
                      <td className="px-3 py-2 max-w-xs truncate font-medium">{question.title}</td>
                      <td className="px-3 py-2 text-sm">{question.subject?.name}</td>
                      <td className="px-3 py-2 text-sm">{question.grade?.name}</td>
                      <td className="px-3 py-2">
                        <Badge 
                          variant="outline"
                          className={`text-xs ${getDifficultyColor(question.difficulty)}`}
                        >
                          {question.difficulty}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-sm">
                        {question.type === "multipleChoice" ? "Múltipla Escolha" : "Dissertativa"}
                      </td>
                      <td className="px-3 py-2 text-sm font-mono">{question.value}</td>
                      <td className="px-3 py-2 text-sm text-muted-foreground max-w-[140px] truncate" title={getSkillCodeDisplay(question)}>
                        {getSkillCodeDisplay(question)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setViewQuestion(question)}
                            className="h-8 w-8 p-0 hover:bg-blue-100 dark:hover:bg-blue-950/30"
                            title="Visualizar"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDuplicate(question)}
                            className="h-8 w-8 p-0 hover:bg-green-100 dark:hover:bg-green-950/30"
                            title="Duplicar questão"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          {canEditDeleteDesktop && (
                            <>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                asChild
                                className="h-8 w-8 p-0 hover:bg-orange-100 dark:hover:bg-orange-950/30"
                                title="Editar (clique com botão direito para abrir em nova guia)"
                              >
                                <Link to={`/app/cadastros/questao/editar/${question.id}`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setDeleteQuestionId(question.id)}
                                className="h-8 w-8 p-0 hover:bg-red-100 dark:hover:bg-red-950/30"
                                title="Excluir"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {paginatedQuestions.map((question, index) => (
              <QuestionCard key={question.id} question={question} index={index} />
            ))}
          </div>

          {/* Pagination */}
          {renderPagination()}
        </div>
      ) : error ? (
        <div className="border rounded-lg p-12 text-center bg-background">
          <div className="space-y-4">
            <div className="text-destructive">
              <p className="text-lg font-semibold">Erro ao carregar questões</p>
              <p className="text-sm mt-2">{error}</p>
            </div>
            <div className="flex justify-center gap-3">
              <Button onClick={handleRetry} size="sm">
                Tentar Novamente
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate("/app/cadastros/questao/criar")}
              >
                Criar Nova Questão
              </Button>
            </div>
            {retryCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Tentativa {retryCount}/3 realizada
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="border rounded-lg p-12 text-center text-muted-foreground bg-background">
          <div className="space-y-2">
            <p className="text-lg">Nenhuma questão encontrada</p>
            <p className="text-sm">Tente ajustar seus filtros ou termos de pesquisa</p>
          </div>
        </div>
      )}

      {/* Modals */}
      <Dialog open={!!viewQuestion} onOpenChange={(isOpen) => !isOpen && setViewQuestion(null)}>
        <DialogContent className="w-[95vw] max-w-4xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden p-0 sm:p-0">
          <DialogHeader className="shrink-0 px-4 pt-4 pb-2 sm:px-6 sm:pt-6 border-b border-border">
            <DialogTitle className="text-lg sm:text-xl">Visualizar Questão</DialogTitle>
            <DialogDescription className="sr-only">
              Visualização detalhada da questão selecionada, incluindo enunciado, alternativas e resolução quando disponível.
            </DialogDescription>
          </DialogHeader>
          <div
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-4 sm:px-6 sm:pb-6 view-question-scroll
              [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent
              [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full
              dark:[&::-webkit-scrollbar-thumb]:bg-gray-700
              hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 dark:hover:[&::-webkit-scrollbar-thumb]:bg-gray-600
              scroll-smooth"
          >
            {viewQuestion && <QuestionPreview question={viewQuestion} />}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteQuestionId} onOpenChange={(isOpen) => !isOpen && setDeleteQuestionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteQuestionId === 'bulk'
                ? `Tem certeza que deseja excluir as ${selectedIds.length} questões selecionadas?`
                : "Tem certeza que deseja excluir esta questão?"
              }
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteQuestionId(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteQuestionId === 'bulk' ? handleBulkDelete : handleDelete}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default QuestionsPage; 