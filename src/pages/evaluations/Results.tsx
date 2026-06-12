import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DisciplineTag } from "@/components/ui/discipline-tag";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Calendar as CalendarIcon,
  Users,
  FileX,
  Eye,
  RefreshCw,
  School,
  MapPin,
  Filter,
  Search,
  BarChart3,
  BookOpen,
  Check,
  FileText
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EvaluationResultsApiService } from "@/services/evaluation/evaluationResultsApi";
import { EvaluationInstrumentPicker } from "@/components/filters";
import { api } from "@/lib/api";
import { useAuth } from "@/context/authContext";
import { getUserHierarchyContext, type UserHierarchyContext } from "@/utils/userHierarchy";
import { ResultsCharts } from "@/components/evaluations/results/ResultsCharts";
import { ClassStatistics } from "@/components/evaluations/results/ClassStatistics";
import { StudentRanking } from "@/components/evaluations/student/StudentRanking";
import { ResultsTable } from "@/components/evaluations/results-table/ResultsTable";
import type { DisciplineStatsMap } from "@/components/evaluations/student/StudentBulletin";
import { saveBulletinStatsToStorage } from "@/components/evaluations/utils/bulletinStorage";

import { cn } from "@/lib/utils";
import {
  RESULTS_PERIOD_YEAR_MIN,
  getResultsPeriodYearMax,
  normalizeResultsPeriodYm,
  RESULTS_MONTH_NAMES_PT,
} from "@/utils/resultsPeriod";
import { DisciplineTables } from "@/components/evaluations/results/DisciplineTables";
import { StudentCard } from "@/components/evaluations/student/StudentCard";
import { QuestionData as TableQuestionData, DetailedReport as TableDetailedReport } from "@/types/results-table";
import { generatePendingStudentsPdf } from "@/services/reports/pendingStudentsPdf";
import { generateRankingPdf } from "@/services/reports/rankingPdf";
import { getClassShiftLabel } from "@/lib/classShift";
import { normalizeEvaluationResultsRanking } from "@/utils/evaluation/normalizeEvaluationResultsRanking";
import {
  normalizePendingStudentSearchText,
  parsePendingStudentSearchInput,
  getPendingStudentsSearchPlaceholder,
} from "@/utils/report/pendingStudentsSearch";

// Interfaces para os dados da API - Nova estrutura baseada na implementação real
interface EvaluationResult {
  id: string;
  titulo: string;
  disciplina: string;
  curso?: string;
  serie?: string;
  turma?: string;
  escola?: string;
  municipio?: string;
  estado?: string;
  data_aplicacao: string;
  status: 'finalized' | 'in_progress' | 'pending' | string;
  // Campos agregados
  total_alunos: number;
  alunos_participantes: number;
  alunos_pendentes: number;
  alunos_ausentes: number;
  media_nota: number;
  media_proficiencia: number;
  distribuicao_classificacao: {
    abaixo_do_basico: number;
    basico: number;
    adequado: number;
    avancado: number;
  };
}

interface TabelaDetalhada {
  disciplinas: Array<{
    id: string;
    nome: string;
    questoes: Array<{
      numero: number;
      habilidade: string;
      codigo_habilidade: string;
      question_id: string;
    }>;
    alunos: Array<{
      id: string;
      nome: string;
      escola: string;
      serie: string;
      turma: string;
      respostas_por_questao: Array<{
        questao: number;
        acertou: boolean;
        respondeu: boolean;
        resposta: string;
      }>;
      total_acertos: number;
      total_erros: number;
      total_respondidas: number;
      total_questoes_disciplina: number;
      nivel_proficiencia: string;
      nota: number;
      proficiencia: number;
    }>;
  }>;
  geral?: {
    alunos: Array<{
      id: string;
      nome: string;
      escola: string;
      serie: string;
      turma: string;
      nota_geral: number;
      proficiencia_geral: number;
      nivel_proficiencia_geral: string;
      total_acertos_geral: number;
      total_questoes_geral: number;
      total_respondidas_geral: number;
      total_em_branco_geral: number;
      percentual_acertos_geral: number;
      status_geral: string;
    }>;
  };
}

// Importar tipos do serviço
import type { AlunoPendenteDetalheEstatisticas, NovaRespostaAPI } from '@/services/evaluation/evaluationResultsApi';

interface DetailedReportAluno {
  id: string;
  nome: string;
  turma: string;
  nota_final: number;
  proficiencia: number;
  classificacao: string;
  total_acertos: number;
  total_erros: number;
  total_em_branco: number;
  respostas?: Array<{ tempo_gasto: number }>;
  status: string;
}

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
  shift?: string;
}

// Tipagem auxiliar para lidar com respostas legadas que usam "data" e "total"
interface ResultadosDetalhadosFromAPI {
  avaliacoes?: EvaluationResult[];
  paginacao?: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
  data?: EvaluationResult[];
  total?: number;
}

interface EvaluationInfoSummary {
  id: string;
  titulo: string;
  disciplina?: string;
  disciplinas?: string[];
  curso?: string;
  serie?: string;
  grade_id?: string;
  escola?: string;
  municipio?: string;
  data_aplicacao?: string;
  status: 'concluida' | 'em_andamento' | 'pendente' | string;
  total_alunos: number;
  alunos_participantes: number;
  alunos_ausentes: number;
  media_nota: number;
  media_proficiencia: number;
}

// Tipo para StageGroup
type StageGroup = "group1" | "group2";

// Mapa de status estático (fora do componente)
const getStatusConfig = (status: 'concluida' | 'em_andamento' | 'pendente' | string) => {
  const configs: Record<string, { label: string; color: string }> = {
    concluida: {
      label: "Concluída",
      color: "bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-400 border-green-300 dark:border-green-800"
    },
    em_andamento: {
      label: "Em Andamento",
      color: "bg-blue-100 dark:bg-blue-950/30 text-blue-800 dark:text-blue-400 border-blue-300 dark:border-blue-800"
    },
    pendente: {
      label: "Pendente",
      color: "bg-muted text-foreground border-border"
    },
    agendada: {
      label: "Agendada",
      color: "bg-yellow-50 dark:bg-yellow-950/30 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800"
    },
    'concluído': {
      label: "Concluída",
      color: "bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-400 border-green-300 dark:border-green-800"
    },
    'em andamento': {
      label: "Em Andamento",
      color: "bg-blue-100 dark:bg-blue-950/30 text-blue-800 dark:text-blue-400 border-blue-300 dark:border-blue-800"
    },
    'finalizada': {
      label: "Concluída",
      color: "bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-400 border-green-300 dark:border-green-800"
    },
    'finalizado': {
      label: "Concluída",
      color: "bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-400 border-green-300 dark:border-green-800"
    },
    'agendado': {
      label: "Agendada",
      color: "bg-yellow-50 dark:bg-yellow-950/30 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800"
    }
  };

  const config = configs[status] || {
    label: "Desconhecido",
    color: "bg-muted text-foreground border-border"
  };

  return config;
};

// Interface para o relatório detalhado
interface DetailedReport {
  avaliacao: {
    id: string;
    titulo: string;
    disciplina: string;
    serie?: string;
    turma?: string;
    escola?: string;
    municipio?: string;
    estado?: string;
    data_aplicacao: string;
  };
  alunos: Array<{
    id: string;
    nome: string;
    turma: string;
    nota_final: number;
    proficiencia: number;
    classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
    total_acertos: number;
    total_erros: number;
    total_em_branco: number;
    status: 'concluida' | 'pendente';
    respostas: Array<{
      tempo_gasto: number;
    }>;
  }>;
}

// Interface para resposta de alunos da API
interface StudentResponse {
  id: string;
  nome: string;
  turma: string;
  nota: number;
  proficiencia: number;
  classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
  questoes_respondidas: number;
  acertos: number;
  erros: number;
  em_branco: number;
  tempo_gasto: number;
  status: 'concluida' | 'pendente';
}

// Interface simples para o relatório detalhado (evitando conflitos)
interface SimpleDetailedReport {
  avaliacao: {
    id: string;
    titulo: string;
    disciplina: string;
    total_questoes?: number;
    serie?: string;
    turma?: string;
    escola?: string;
    municipio?: string;
    estado?: string;
    data_aplicacao: string;
  };
  // Opcional: algumas respostas podem trazer a lista de questoes
  questoes?: Array<{
    numero: number;
  }>;
  alunos: Array<{
    id: string;
    nome: string;
    turma: string;
    nota_final: number;
    proficiencia: number;
    classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
    total_acertos: number;
    total_erros: number;
    total_em_branco: number;
    status: 'concluida' | 'pendente';
    respostas: Array<{
      tempo_gasto: number;
      // Opcional para inferência do total de questões
      questao_numero?: number;
    }>;
  }>;
}

// ----- Somente esta página: opcoes-filtros + listar avaliacoes com periodo=YYYY-MM (sem alterar o serviço compartilhado) -----

type ResultsOpcoesFiltrosParams = {
  estado?: string;
  municipio?: string;
  avaliacao?: string;
  escola?: string;
  serie?: string;
  turma?: string;
  periodo?: string;
};

interface ResultsFilterOptionsResponse {
  estados?: Array<{ id: string; nome: string }>;
  municipios?: Array<{ id: string; nome: string }>;
  avaliacoes?: Array<{
    id: string;
    titulo?: string;
    title?: string;
    type?: string;
    tipo?: string;
  }>;
  escolas?: Array<{ id: string; nome?: string; name?: string }>;
  series?: Array<{ id: string; nome?: string; name?: string }>;
  turmas?: Array<{ id: string; nome?: string; name?: string; shift?: string }>;
}

function resultsNormalizeFilterEntities(
  items: Array<{ id: string; nome?: string; name?: string; shift?: string }> | undefined
): Array<{ id: string; nome: string; shift?: string }> {
  if (!Array.isArray(items) || !items.length) return [];
  return items.map((item) => ({
    id: item.id,
    nome: item.nome ?? item.name ?? "",
    shift: item.shift?.trim() || undefined,
  }));
}

async function resultsFetchOpcoesFiltros(
  params: ResultsOpcoesFiltrosParams
): Promise<ResultsFilterOptionsResponse> {
  const queryParams = new URLSearchParams();
  if (params.estado && params.estado !== "all") queryParams.append("estado", params.estado);
  if (params.municipio && params.municipio !== "all") queryParams.append("municipio", params.municipio);
  if (params.avaliacao && params.avaliacao !== "all") queryParams.append("avaliacao", params.avaliacao);
  if (params.escola && params.escola !== "all") queryParams.append("escola", params.escola);
  if (params.serie && params.serie !== "all") queryParams.append("serie", params.serie);
  if (params.turma && params.turma !== "all") queryParams.append("turma", params.turma);
  if (params.periodo && /^\d{4}-\d{2}$/.test(params.periodo)) {
    queryParams.append("periodo", params.periodo);
  }
  const url = `/evaluation-results/opcoes-filtros${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
  const requestConfig =
    params.municipio && params.municipio !== "all" ? { meta: { cityId: params.municipio } } : {};
  const response = await api.get(url, requestConfig);
  const data = response.data || {};
  return {
    ...data,
    estados: resultsNormalizeFilterEntities(data.estados),
    municipios: resultsNormalizeFilterEntities(data.municipios),
    escolas: resultsNormalizeFilterEntities(data.escolas),
    series: resultsNormalizeFilterEntities(data.series),
    turmas: resultsNormalizeFilterEntities(data.turmas),
  } as ResultsFilterOptionsResponse;
}

function resultsFilterEvaluationsForDropdown(
  avaliacoes: ResultsFilterOptionsResponse["avaliacoes"]
): Array<{ id: string; titulo: string }> {
  const list = avaliacoes || [];
  return list
    .filter((evaluation) => {
      const raw = (evaluation.type ?? evaluation.tipo ?? "").toString().trim();
      const type = raw.toUpperCase();
      const title = String(evaluation.titulo ?? evaluation.title ?? "").toUpperCase();
      if (type === "OLIMPIADAS" || type === "OLIMPIADA" || type.includes("OLIMPI")) return false;
      if (type === "COMPETICAO" || type === "COMPETIÇÃO" || type.includes("COMPET")) return false;
      if (title.includes("OLIMPI") || title.includes("OLÍMPIC")) return false;
      return type === "" || type === "AVALIACAO" || type === "SIMULADO";
    })
    .map((e) => ({
      id: e.id,
      titulo: e.titulo ?? e.title ?? "Sem título",
    }));
}

async function resultsGetFilterMunicipalities(
  stateId: string,
  periodo?: string
): Promise<Array<{ id: string; nome: string }>> {
  try {
    const response = await resultsFetchOpcoesFiltros({
      estado: stateId,
      ...(periodo ? { periodo } : {}),
    });
    if (response.municipios && response.municipios.length > 0) {
      return response.municipios;
    }
    console.warn(
      `⚠️ Endpoint de opções de filtros não retornou municípios para estado: ${stateId}, tentando fallback...`
    );
  } catch (error) {
    console.error(`❌ Erro ao buscar municípios via opções de filtros para estado: ${stateId}`, error);
    const axiosError = error as { response?: { status?: number } };
    if (axiosError.response?.status === 400) throw error;
    if (axiosError.response?.status === 500) {
      console.warn(`⚠️ Erro 500 do backend ao buscar municípios para estado: ${stateId}, tentando fallback...`);
    }
  }
  try {
    const res = await api.get(`/city/municipalities/state/${stateId}`);
    if (res.data && Array.isArray(res.data)) {
      const municipios = res.data
        .map((municipality: { id: string; name?: string; nome?: string }) => ({
          id: municipality.id,
          nome: municipality.nome || municipality.name || "",
        }))
        .filter((m: { nome: string }) => m.nome !== "");
      if (municipios.length > 0) return municipios;
    }
  } catch (fallbackError) {
    console.error(`❌ Erro também no fallback ao buscar municípios para estado: ${stateId}`, fallbackError);
  }
  console.error(`❌ Não foi possível carregar municípios para o estado: ${stateId}`);
  return [];
}

type ResultsEvaluationsListFilters = {
  estado?: string;
  municipio?: string;
  escola?: string;
  serie?: string;
  turma?: string;
  avaliacao?: string;
  periodo?: string;
};

async function resultsFetchEvaluationsList(
  page: number,
  perPage: number,
  filters: ResultsEvaluationsListFilters
): Promise<NovaRespostaAPI> {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  if (filters.estado && filters.estado !== "all") params.append("estado", filters.estado);
  if (filters.municipio && filters.municipio !== "all") params.append("municipio", filters.municipio);
  if (filters.avaliacao && filters.avaliacao !== "all") params.append("avaliacao", filters.avaliacao);
  if (filters.escola && filters.escola !== "all") params.append("escola", filters.escola);
  if (filters.serie && filters.serie !== "all") params.append("serie", filters.serie);
  if (filters.turma && filters.turma !== "all") params.append("turma", filters.turma);
  if (filters.periodo && /^\d{4}-\d{2}$/.test(filters.periodo)) {
    params.append("periodo", filters.periodo);
  }
  const requestConfig =
    filters.municipio && filters.municipio !== "all"
      ? { meta: { cityId: filters.municipio } }
      : {};
  const response = await api.get(`/evaluation-results/avaliacoes?${params}`, requestConfig);
  const data = response.data;
  if (data?.resultados_detalhados?.avaliacoes) {
    data.resultados_detalhados.avaliacoes = data.resultados_detalhados.avaliacoes.filter(
      (evaluation: {
        type?: string;
        tipo?: string;
        titulo?: string;
        title?: string;
      }) => {
        const type = String(evaluation.type ?? evaluation.tipo ?? "").toUpperCase().trim();
        const title = String(evaluation.titulo ?? evaluation.title ?? "").toUpperCase();
        if (type === "OLIMPIADA" || type === "OLIMPIADAS" || type.includes("OLIMPI")) return false;
        if (type === "COMPETICAO" || type === "COMPETIÇÃO" || type.includes("COMPET")) return false;
        if (title.includes("[OLIMPÍADA]") || title.includes("OLIMPÍADA") || title.includes("OLIMPIADA"))
          return false;
        if (title.includes("COMPETIÇÃO") || title.includes("COMPETICAO")) return false;
        return type === "" || type === "AVALIACAO" || type === "SIMULADO";
      }
    );
  }
  return data as NovaRespostaAPI;
}

type ResultsProps = { hidePageHeading?: boolean };

export default function Results({ hidePageHeading = false }: ResultsProps = {}) {
  const { autoLogin, user } = useAuth();

  const [apiData, setApiData] = useState<NovaRespostaAPI | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Chave para persistência dos filtros no localStorage
  const FILTERS_STORAGE_KEY = 'results_filters';
  
  // ✅ NOVO: Ref para controlar se já carregamos os filtros do storage
  const filtersLoadedFromStorageRef = useRef(false);
  
  // ✅ NOVO: Ref para controlar se estamos restaurando filtros (evita resets em cascata)
  const isRestoringFiltersRef = useRef(false);

  // Estados dos filtros
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('all');
  /** `all` = sem filtro de mês/ano; senão `YYYY-MM` (mês de aplicação). */
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  /** Mês exibido no calendário (0–11) e ano — sincronizado com selects (tema escuro OK). */
  const [periodDraft, setPeriodDraft] = useState<{ y: number; m: number }>(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [selectedEvaluation, setSelectedEvaluation] = useState<string>('all');
  const [selectedSchool, setSelectedSchool] = useState<string>('all');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');

  const normalizedSelectedPeriod = useMemo(
    () => (selectedPeriod === 'all' ? 'all' : normalizeResultsPeriodYm(selectedPeriod)),
    [selectedPeriod]
  );

  const periodoApi = normalizedSelectedPeriod === 'all' ? undefined : normalizedSelectedPeriod;

  const periodCalendarSelected = useMemo(() => {
    if (normalizedSelectedPeriod === 'all') return undefined;
    return parse(`${normalizedSelectedPeriod}-01`, 'yyyy-MM-dd', new Date());
  }, [normalizedSelectedPeriod]);

  /** Corrige período inválido ou fora da faixa (ex. 0002-03 de sessão antiga). */
  useEffect(() => {
    if (selectedPeriod === 'all') return;
    const n = normalizeResultsPeriodYm(selectedPeriod);
    if (n === 'all') setSelectedPeriod('all');
    else if (n !== selectedPeriod) setSelectedPeriod(n);
  }, [selectedPeriod]);

  useEffect(() => {
    if (!periodPickerOpen) return;
    if (normalizedSelectedPeriod !== 'all') {
      const [yy, mm] = normalizedSelectedPeriod.split('-').map(Number);
      setPeriodDraft({ y: yy, m: mm - 1 });
      return;
    }
    const n = new Date();
    setPeriodDraft({ y: n.getFullYear(), m: n.getMonth() });
  }, [periodPickerOpen, normalizedSelectedPeriod]);

  const previousPeriodRef = useRef<string | undefined>(undefined);
  /** Para não zerar município ao mudar só o período: reset em cascata só quando o estado (UF) muda. */
  const previousStateForMunicipalitiesRef = useRef<string | null>(null);

  // Estados dos dados dos filtros
  const [states, setStates] = useState<State[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [evaluationsByMunicipality, setEvaluationsByMunicipality] = useState<Array<{ 
    id: string; 
    titulo: string; 
    disciplina: string; 
    status: string; 
    data_aplicacao: string; 
  }>>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [evaluationInfo, setEvaluationInfo] = useState<EvaluationInfoSummary | null>(null);

  // Turmas do professor + hierarquia (diretor/coordenador/professor) para estatísticas agregadas e PDF
  const [professorClassNames, setProfessorClassNames] = useState<Set<string>>(new Set());
  const [userHierarchyContext, setUserHierarchyContext] = useState<UserHierarchyContext | null>(null);

  // Estados para controles da tabela

  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');


  const [selectedStudentForDetails, setSelectedStudentForDetails] = useState<string | null>(null);
  const [studentDetailedAnswers, setStudentDetailedAnswers] = useState<{
    student: {
      id: string;
      nome: string;
      turma: string;
      nota: number;
      proficiencia: number;
      classificacao: string;
    };
    answers: Array<{
      question_id: string;
      question_number: number;
      question_text: string;
      is_correct: boolean;
      score: number;
    }>;
  } | null>(null);
  const [isLoadingStudentAnswers, setIsLoadingStudentAnswers] = useState(false);

  // Estados de paginação
  const currentPage = 1;
  // Busca mais itens por página para não ocultar escolas na aba de estatísticas.
  const perPage = 200;

  // Extrai nome de disciplina de respostas variadas (string ou objeto)
  const extractSubjectName = useCallback((subject: unknown): string => {
    if (typeof subject === 'string') return subject;
    if (subject && typeof subject === 'object') {
      const possible = subject as { name?: string; nome?: string };
      return possible.name || possible.nome || '';
    }
    return '';
  }, []);

  // ✅ NOVO: Função para salvar filtros no sessionStorage
  const saveFiltersToStorage = useCallback(() => {
    try {
      const filters = {
        selectedState,
        selectedMunicipality,
        selectedPeriod,
        selectedEvaluation,
        selectedSchool,
        selectedGrade,
        selectedClass,
        timestamp: Date.now()
      };
      sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch (error) {
      console.error('Erro ao salvar filtros no sessionStorage:', error);
    }
  }, [selectedState, selectedMunicipality, selectedPeriod, selectedEvaluation, selectedSchool, selectedGrade, selectedClass]);

  // ✅ NOVO: Função para carregar e validar filtros do sessionStorage
  const loadFiltersFromStorage = useCallback((): {
    selectedState: string;
    selectedMunicipality: string;
    selectedPeriod: string;
    selectedEvaluation: string;
    selectedSchool: string;
    selectedGrade: string;
    selectedClass: string;
  } | null => {
    try {
      // Tentar primeiro sessionStorage
      let stored = sessionStorage.getItem(FILTERS_STORAGE_KEY);
      
      // Se não encontrar no sessionStorage, tentar migrar do localStorage (uma vez)
      if (!stored) {
        const oldStored = localStorage.getItem(FILTERS_STORAGE_KEY);
        if (oldStored) {
          // Migrar do localStorage para sessionStorage
          sessionStorage.setItem(FILTERS_STORAGE_KEY, oldStored);
          localStorage.removeItem(FILTERS_STORAGE_KEY);
          stored = oldStored;
        }
      }
      
      if (!stored) return null;

      const filters = JSON.parse(stored);
      
      // ✅ VALIDAÇÃO: Verificar estrutura básica e valores válidos
      // Aceita "all" como valor válido (é o valor padrão)
      if (
        typeof filters.selectedState === 'string' &&
        typeof filters.selectedMunicipality === 'string' &&
        typeof filters.selectedEvaluation === 'string' &&
        typeof filters.selectedSchool === 'string' &&
        typeof filters.selectedGrade === 'string' &&
        typeof filters.selectedClass === 'string'
      ) {
        const rawPeriod =
          typeof filters.selectedPeriod === 'string' ? filters.selectedPeriod : 'all';
        const selectedPeriodNorm =
          rawPeriod === 'all' ? 'all' : normalizeResultsPeriodYm(rawPeriod);
        // Retornar filtros validados (aceita "all" e outros valores)
        return {
          selectedState: filters.selectedState || 'all',
          selectedMunicipality: filters.selectedMunicipality || 'all',
          selectedPeriod: selectedPeriodNorm,
          selectedEvaluation: filters.selectedEvaluation || 'all',
          selectedSchool: filters.selectedSchool || 'all',
          selectedGrade: filters.selectedGrade || 'all',
          selectedClass: filters.selectedClass || 'all'
        };
      }
      
      // Se a validação falhar, limpar dados inválidos do sessionStorage
      sessionStorage.removeItem(FILTERS_STORAGE_KEY);
      return null;
    } catch (error) {
      console.error('Erro ao carregar filtros do sessionStorage:', error);
      // Limpar dados corrompidos
      try {
        sessionStorage.removeItem(FILTERS_STORAGE_KEY);
        // Também limpar do localStorage caso exista
        localStorage.removeItem(FILTERS_STORAGE_KEY);
      } catch (cleanupError) {
        console.error('Erro ao limpar storage:', cleanupError);
      }
      return null;
    }
  }, []);

  // ✅ NOVO: Salvar filtros no localStorage sempre que mudarem
  useEffect(() => {
    // Não salvar se ainda não carregamos os filtros do storage (evita salvar na primeira renderização)
    if (!filtersLoadedFromStorageRef.current) {
      return;
    }
    
    // Salvar filtros quando mudarem
    saveFiltersToStorage();
  }, [selectedState, selectedMunicipality, selectedPeriod, selectedEvaluation, selectedSchool, selectedGrade, selectedClass, saveFiltersToStorage]);

  const toastFilterOptionsError = useCallback(
    (error: unknown) => {
      const ax = error as { response?: { status?: number; data?: { error?: string; details?: string } } };
      if (ax.response?.status !== 400) return;
      const d = ax.response.data;
      const description = d?.details ? `${d.error ?? ''}${d.error ? ' ' : ''}(${d.details})`.trim() : d?.error;
      toast({
        title: 'Filtro inválido',
        description: description || 'Verifique o período (formato AAAA-MM).',
        variant: 'destructive',
      });
    },
    [toast]
  );

  // Carregar filtros iniciais
  const loadInitialFilters = useCallback(async (periodFromStorage?: string) => {
    try {
      setIsLoadingFilters(true);

      const periodoRaw =
        periodFromStorage !== undefined && periodFromStorage !== 'all'
          ? normalizeResultsPeriodYm(periodFromStorage)
          : 'all';
      const periodo = periodoRaw === 'all' ? undefined : periodoRaw;

      const opcoes = await resultsFetchOpcoesFiltros({ ...(periodo ? { periodo } : {}) });
      const statesData = opcoes.estados || [];
      console.log('Estados carregados:', statesData);
      
      if (statesData && statesData.length > 0) {
        setStates(statesData.map(state => ({
          id: state.id,
          name: state.nome,
          uf: state.id
        })));
      } else {
        console.warn('Nenhum estado foi retornado pela API');
        setStates([]);
      }
    } catch (error) {
      console.error("Erro ao carregar filtros iniciais:", error);
      const ax = error as { response?: { status?: number } };
      if (ax.response?.status === 400) {
        toastFilterOptionsError(error);
      } else {
        toast({
          title: "Erro ao carregar filtros",
          description: "Não foi possível carregar os filtros. Tente novamente.",
          variant: "destructive",
        });
      }
      setStates([]);
    } finally {
      setIsLoadingFilters(false);
      setIsLoading(false);
    }
  }, [toast, toastFilterOptionsError]);

  useEffect(() => {
    const initializeData = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        try {
          await autoLogin();
        } catch (error) {
          console.error("Erro no login automático:", error);
          toast({
            title: "Erro de Autenticação",
            description: "Não foi possível fazer login automático. Verifique suas credenciais.",
            variant: "destructive",
          });
          return;
        }
      }
      
      // ✅ NOVO: Carregar filtros salvos do sessionStorage antes de carregar filtros iniciais
      const savedFilters = loadFiltersFromStorage();
      if (savedFilters) {
        // Marcar que estamos restaurando filtros (evita resets em cascata)
        isRestoringFiltersRef.current = true;
        
        // Definir todos os filtros de uma vez
        setSelectedState(savedFilters.selectedState);
        setSelectedMunicipality(savedFilters.selectedMunicipality);
        setSelectedPeriod(savedFilters.selectedPeriod ?? 'all');
        setSelectedEvaluation(savedFilters.selectedEvaluation);
        setSelectedSchool(savedFilters.selectedSchool);
        setSelectedGrade(savedFilters.selectedGrade);
        setSelectedClass(savedFilters.selectedClass);
        
        // Aguardar todos os useEffects e chamadas assíncronas serem executados antes de desabilitar a flag
        // Usar múltiplos requestAnimationFrame e timeout para garantir que todas as requisições foram concluídas
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              isRestoringFiltersRef.current = false;
            }, 1500);
          });
        });
      }
      
      // Marcar que os filtros foram carregados do storage
      filtersLoadedFromStorageRef.current = true;
      
      await loadInitialFilters(savedFilters?.selectedPeriod);
    };

    initializeData();
  }, [autoLogin, loadInitialFilters, toast, loadFiltersFromStorage]);

  // Helpers de reset em cascata
  const resetAfterGrade = useCallback(() => {
    setSelectedClass('all');
    setClasses([]);
  }, []);

  const resetAfterSchool = useCallback(() => {
    setSelectedGrade('all');
    setGrades([]);
    resetAfterGrade();
  }, [resetAfterGrade]);

  const resetAfterEvaluation = useCallback(() => {
    setSelectedSchool('all');
    setSchools([]);
    resetAfterSchool();
  }, [resetAfterSchool]);

  const resetAfterState = useCallback(() => {
    setSelectedMunicipality('all');
    setSelectedEvaluation('all');
    resetAfterEvaluation();
  }, [resetAfterEvaluation]);

  // Ao mudar o período (fora da restauração), atualizar estados e zerar Avaliação → … ; municípios/aval. recarregam pelos efeitos.
  useEffect(() => {
    if (!filtersLoadedFromStorageRef.current) return;
    if (previousPeriodRef.current === undefined) {
      previousPeriodRef.current = selectedPeriod;
      return;
    }
    if (isRestoringFiltersRef.current) {
      previousPeriodRef.current = selectedPeriod;
      return;
    }
    if (previousPeriodRef.current === selectedPeriod) return;
    previousPeriodRef.current = selectedPeriod;

    resetAfterEvaluation();

    let cancelled = false;
    (async () => {
      try {
        setIsLoadingFilters(true);
        const opcoes = await resultsFetchOpcoesFiltros({ ...(periodoApi ? { periodo: periodoApi } : {}) });
        const statesData = opcoes.estados || [];
        if (cancelled) return;
        if (statesData?.length) {
          setStates(
            statesData.map((state) => ({
              id: state.id,
              name: state.nome,
              uf: state.id,
            }))
          );
        } else {
          setStates([]);
        }
      } catch (error) {
        if (!cancelled) toastFilterOptionsError(error);
      } finally {
        if (!cancelled) setIsLoadingFilters(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPeriod, periodoApi, resetAfterEvaluation, toastFilterOptionsError]);

  // Carregar municípios quando estado ou período mudam (período só refiltra a lista; não limpa município já escolhido)
  useEffect(() => {
    const loadMunicipalities = async () => {
      const previousState = previousStateForMunicipalitiesRef.current;
      const stateChanged =
        previousState !== null && previousState !== selectedState;
      previousStateForMunicipalitiesRef.current = selectedState;

      if (selectedState !== 'all') {
        try {
          setIsLoadingFilters(true);
          const municipalitiesData = await resultsGetFilterMunicipalities(
            selectedState,
            periodoApi
          );
          setMunicipalities(municipalitiesData.map(municipality => ({
            id: municipality.id,
            name: municipality.nome,
            state: selectedState
          })));
          if (!isRestoringFiltersRef.current) {
            setEvaluationsByMunicipality([]);
            if (stateChanged) {
              resetAfterState();
            } else {
              resetAfterEvaluation();
            }
          }
        } catch (error) {
          console.error("Erro ao carregar municípios:", error);
          toastFilterOptionsError(error);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setMunicipalities([]);
        setEvaluationsByMunicipality([]);
        if (!isRestoringFiltersRef.current) {
          if (stateChanged) {
            resetAfterState();
          } else {
            resetAfterEvaluation();
          }
        }
      }
    };

    loadMunicipalities();
  }, [selectedState, resetAfterState, resetAfterEvaluation, periodoApi, toastFilterOptionsError]);

  // Carregar avaliações quando município for selecionado
  useEffect(() => {
    const loadEvaluations = async () => {
      // Só carregar avaliações se Estado e Município estiverem selecionados
      if (selectedState !== 'all' && selectedMunicipality !== 'all') {
        try {
          setIsLoadingFilters(true);

          const opEv = await resultsFetchOpcoesFiltros({
            estado: selectedState,
            municipio: selectedMunicipality,
            ...(periodoApi ? { periodo: periodoApi } : {}),
          });
          const evaluationsData = resultsFilterEvaluationsForDropdown(opEv.avaliacoes);
          setEvaluationsByMunicipality(evaluationsData.map(evaluation => ({
                    id: evaluation.id || 'unknown',
        titulo: evaluation.titulo || 'Sem título',
            disciplina: '',
            status: 'concluida',
            data_aplicacao: new Date().toISOString()
          })));

          // ✅ CORRIGIDO: Não resetar em cascata se estamos restaurando filtros
          if (!isRestoringFiltersRef.current) {
            resetAfterEvaluation();
          }
        } catch (error) {
          console.error("Erro ao carregar avaliações:", error);
          toastFilterOptionsError(error);
          setEvaluationsByMunicipality([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setEvaluationsByMunicipality([]);
        // ✅ CORRIGIDO: Não resetar em cascata se estamos restaurando filtros
        if (!isRestoringFiltersRef.current) {
          resetAfterEvaluation();
        }
      }
    };

    loadEvaluations();
  }, [selectedMunicipality, selectedState, resetAfterEvaluation, periodoApi, toastFilterOptionsError]);

  // Carregar escolas quando avaliação for selecionada
  useEffect(() => {
    const loadSchools = async () => {
      // Só carregar escolas se os 3 filtros obrigatórios estiverem selecionados
      if (selectedState !== 'all' && selectedMunicipality !== 'all' && selectedEvaluation !== 'all') {
        try {
          setIsLoadingFilters(true);
          const opSc = await resultsFetchOpcoesFiltros({
            estado: selectedState,
            municipio: selectedMunicipality,
            avaliacao: selectedEvaluation,
            ...(periodoApi ? { periodo: periodoApi } : {}),
          });
          const schoolsData = opSc.escolas || [];
          setSchools(schoolsData.map(school => ({
            id: school.id,
            name: school.nome
          })));

          // ✅ CORRIGIDO: Não resetar em cascata se estamos restaurando filtros
          if (!isRestoringFiltersRef.current) {
            resetAfterSchool();
          }
        } catch (error) {
          console.error("Erro ao carregar escolas:", error);
          toastFilterOptionsError(error);
          setSchools([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setSchools([]);
        // ✅ CORRIGIDO: Não resetar em cascata se estamos restaurando filtros
        if (!isRestoringFiltersRef.current) {
          resetAfterSchool();
        }
      }
    };

    loadSchools();
  }, [selectedEvaluation, selectedState, selectedMunicipality, resetAfterSchool, periodoApi, toastFilterOptionsError]);

  // Carregar séries quando escola for selecionada
  useEffect(() => {
    const loadGrades = async () => {
      // Só carregar séries se os 3 filtros obrigatórios estiverem selecionados
      if (selectedState !== 'all' && selectedMunicipality !== 'all' && selectedEvaluation !== 'all' && selectedSchool !== 'all') {
        try {
          setIsLoadingFilters(true);
          const opGr = await resultsFetchOpcoesFiltros({
            estado: selectedState,
            municipio: selectedMunicipality,
            avaliacao: selectedEvaluation,
            escola: selectedSchool,
            ...(periodoApi ? { periodo: periodoApi } : {}),
          });
          const gradesData = opGr.series || [];
          setGrades(gradesData.map(grade => ({
            id: grade.id,
            name: grade.nome
          })));

          // ✅ CORRIGIDO: Não resetar em cascata se estamos restaurando filtros
          if (!isRestoringFiltersRef.current) {
            resetAfterGrade();
          }
        } catch (error) {
          console.error("Erro ao carregar séries:", error);
          toastFilterOptionsError(error);
          setGrades([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setGrades([]);
        // ✅ CORRIGIDO: Não resetar em cascata se estamos restaurando filtros
        if (!isRestoringFiltersRef.current) {
          resetAfterGrade();
        }
      }
    };

    loadGrades();
  }, [selectedSchool, selectedState, selectedMunicipality, selectedEvaluation, resetAfterGrade, periodoApi, toastFilterOptionsError]);

  // Carregar turmas quando série for selecionada
  useEffect(() => {
    const loadClasses = async () => {
      // Só carregar turmas se os 3 filtros obrigatórios estiverem selecionados
      if (selectedState !== 'all' && selectedMunicipality !== 'all' && selectedEvaluation !== 'all' && selectedSchool !== 'all' && selectedGrade !== 'all') {
        try {
          setIsLoadingFilters(true);
          const opCl = await resultsFetchOpcoesFiltros({
            estado: selectedState,
            municipio: selectedMunicipality,
            avaliacao: selectedEvaluation,
            escola: selectedSchool,
            serie: selectedGrade,
            ...(periodoApi ? { periodo: periodoApi } : {}),
          });
          const classesData = opCl.turmas || [];
          setClasses(classesData.map(classItem => ({
            id: classItem.id,
            name: classItem.nome,
            shift: classItem.shift,
          })));

          // ✅ CORRIGIDO: Não resetar seleção dependente se estamos restaurando filtros
          if (!isRestoringFiltersRef.current) {
            setSelectedClass('all');
          }
        } catch (error) {
          console.error("Erro ao carregar turmas:", error);
          toastFilterOptionsError(error);
          setClasses([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setClasses([]);
        // ✅ CORRIGIDO: Não resetar seleção dependente se estamos restaurando filtros
        if (!isRestoringFiltersRef.current) {
          setSelectedClass('all');
        }
      }
    };

    loadClasses();
  }, [selectedGrade, selectedState, selectedMunicipality, selectedEvaluation, selectedSchool, periodoApi, toastFilterOptionsError]);

  // ✅ NOVO: Refs para debounce
  const loadAllDataTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadStudentsDataTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ✅ NOVA IMPLEMENTAÇÃO: CARREGAMENTO SIMPLIFICADO COM A NOVA API UNIFICADA
  const loadAllData = useCallback(async () => {

    try {
      setIsLoadingData(true);
      setIsTableReady(false);
      
      const filters = {
        estado: selectedState,
        municipio: selectedMunicipality,
        avaliacao: selectedEvaluation !== 'all' ? selectedEvaluation : undefined,
        escola: selectedSchool !== 'all' ? selectedSchool : undefined,
        serie: selectedGrade !== 'all' ? selectedGrade : undefined,
        turma: selectedClass !== 'all' ? selectedClass : undefined,
        ...(periodoApi ? { periodo: periodoApi } : {}),
      };

      // 🚀 CARREGAMENTO UNIFICADO: tenta buscar já filtrado (inclui escola/série/turma quando selecionados)
      let evaluationsResponse = await resultsFetchEvaluationsList(currentPage, perPage, filters);
      
   
      if (evaluationsResponse) {
        let dataToSet = evaluationsResponse;

        // Importante: esta tela não deve derivar/filtrar dados no frontend.
        // O backend é a fonte da verdade para estatísticas e tabelas, inclusive para recortes por escola/série/turma.

        setApiData(dataToSet);

        // ✅ CORRIGIDO: Usar APENAS dados de estatisticas_gerais do backend
        if (selectedEvaluation !== 'all' && dataToSet.estatisticas_gerais) {
          const resumo: EvaluationInfoSummary = {
            id: selectedEvaluation,
            titulo: dataToSet.estatisticas_gerais.nome || 'Avaliação',
            status: 'pendente',
            total_alunos: dataToSet.estatisticas_gerais.total_alunos,
            alunos_participantes: dataToSet.estatisticas_gerais.alunos_participantes,
            alunos_ausentes: dataToSet.estatisticas_gerais.alunos_pendentes,
            media_nota: dataToSet.estatisticas_gerais.media_nota_geral,
            media_proficiencia: dataToSet.estatisticas_gerais.media_proficiencia_geral,
            escola: selectedSchool === 'all' 
              ? 'Todas as Escolas' 
              : dataToSet.estatisticas_gerais.escola,
            municipio: dataToSet.estatisticas_gerais.municipio,
            serie: dataToSet.estatisticas_gerais.serie,
          };

        // Coletar disciplinas: prioridade `estatisticas_gerais.por_disciplina` (backend), fallback `resultados_por_disciplina`
        const fromPorDisciplina = (dataToSet.estatisticas_gerais as { por_disciplina?: { disciplina: string }[] })
          ?.por_disciplina;
        const subjectsFromResults = (
          Array.isArray(fromPorDisciplina) && fromPorDisciplina.length > 0
            ? fromPorDisciplina
            : dataToSet.resultados_por_disciplina || []
        )
          .map(d => {
            const subject = d.disciplina;
            if (typeof subject === 'string') return subject;
            if (subject && typeof subject === 'object') {
              const possible = subject as { name?: string; nome?: string };
              return possible.name || possible.nome || '';
            }
            return '';
          })
          .filter(Boolean);
          
          if (subjectsFromResults.length > 0) {
            resumo.disciplinas = subjectsFromResults;
            resumo.disciplina = subjectsFromResults[0];
          }

          setEvaluationInfo(resumo);
        } else {
          setEvaluationInfo(null);
        }
      } else {
        setApiData(null);
        setEvaluationInfo(null);
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      const ax = error as { response?: { status?: number; data?: { error?: string } } };
      if (ax.response?.status === 400) {
        toastFilterOptionsError(error);
      } else {
        toast({
          title: "Erro ao carregar dados",
          description: "Não foi possível carregar os dados. Tente novamente.",
          variant: "destructive",
        });
      }
      setApiData(null);
      setEvaluationInfo(null);
    } finally {
      setIsLoadingData(false);
    }
  }, [
    selectedState,
    selectedMunicipality,
    selectedEvaluation,
    selectedSchool,
    selectedGrade,
    selectedClass,
    periodoApi,
    schools,
    grades,
    classes,
    toast,
    currentPage,
    perPage,
    toastFilterOptionsError
  ]);

  // Usuários com restrição: obrigatório selecionar Escola. Admin e tecadmin usam o mesmo fluxo (Estado, Município, Avaliação).
  const isRestrictedUser = user?.role === 'professor' ||
                          user?.role === 'diretor' ||
                          user?.role === 'coordenador';

  // Verificar se é professor especificamente (para mensagens específicas)
  const isProfessor = user?.role === 'professor';

  useEffect(() => {
    if (!user?.id) {
      setProfessorClassNames(new Set());
      setUserHierarchyContext(null);
      return;
    }
    const rolesNeedHierarchy = ["professor", "diretor", "coordenador"];
    if (!user.role || !rolesNeedHierarchy.includes(user.role)) {
      setProfessorClassNames(new Set());
      setUserHierarchyContext(null);
      return;
    }
    let cancelled = false;
    getUserHierarchyContext(user.id, user.role).then((ctx) => {
      if (cancelled) return;
      setUserHierarchyContext(ctx);
      if (user.role === "professor") {
        const names = (ctx.classes ?? [])
          .map((c) => (c.class_name ?? "").trim())
          .filter(Boolean);
        setProfessorClassNames(new Set(names));
      } else {
        setProfessorClassNames(new Set());
      }
    }).catch(() => {
      if (!cancelled) {
        setUserHierarchyContext(null);
        setProfessorClassNames(new Set());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role]);

  // ✅ Carregar dados quando os filtros obrigatórios estiverem preenchidos.
  // Admin e tecadmin: Estado, Município e Avaliação. Professor/diretor/coordenador: + Escola obrigatória.
  useEffect(() => {
    const requiredFiltersFilled = selectedState !== 'all' && 
                                 selectedMunicipality !== 'all' && 
                                 selectedEvaluation !== 'all' &&
                                 (!isRestrictedUser || selectedSchool !== 'all');
    
    if (!requiredFiltersFilled) {
      // ✅ CORRIGIDO: Só limpar dados se realmente não temos os filtros mínimos
      // Não limpar se apenas estamos mudando filtros opcionais (escola, série, turma)
      const hasMinimumFilters = selectedState !== 'all' && 
                                selectedMunicipality !== 'all' && 
                                selectedEvaluation !== 'all';
      
      if (!hasMinimumFilters) {
        // Só limpar se não temos os filtros mínimos obrigatórios
        setApiData(null);
        setEvaluationInfo(null);
      }
      return;
    }
    
    // Limpar timeout anterior
    if (loadAllDataTimeoutRef.current) {
      clearTimeout(loadAllDataTimeoutRef.current);
    }
    
    // Criar novo timeout com debounce de 500ms
    loadAllDataTimeoutRef.current = setTimeout(() => {
      loadAllData();
    }, 500);
    
    // Cleanup function
    return () => {
      if (loadAllDataTimeoutRef.current) {
        clearTimeout(loadAllDataTimeoutRef.current);
      }
    };
  }, [loadAllData, selectedState, selectedMunicipality, selectedEvaluation, selectedSchool, selectedPeriod, isRestrictedUser]);

  // Descobre se a disciplina é Matemática
  const isMath = useCallback((name?: string) => (name || "").toLowerCase().includes("matem"), []);

  // Infere o grupo do nível (group1 = EI/AI/EJA/Especial; group2 = AF/EM)
  const inferStageGroup = useCallback((): StageGroup => {
    const names: string[] = [
      grades.find(g => g.id === selectedGrade)?.name,
      apiData?.estatisticas_gerais?.serie,
      apiData?.resultados_detalhados?.avaliacoes?.[0]?.serie,
    ]
      .filter(Boolean)
      .map((s) => (s as string).toLowerCase());

    const has = (re: RegExp) => names.some(n => re.test(n));

    if (has(/infantil|eja|especial/)) return "group1";
    if (has(/\b(1º|1o|1°|1)\s*ano\b|\b(2º|2o|2°|2)\s*ano\b|\b(3º|3o|3°|3)\s*ano\b|\b(4º|4o|4°|4)\s*ano\b|\b(5º|5o|5°|5)\s*ano\b/) && !has(/m[eé]dio/)) {
      return "group1";
    }
    return "group2";
  }, [grades, selectedGrade, apiData]);

  // Retorna o teto por disciplina x grupo
  const getMaxForDiscipline = useCallback((discipline: string, group: StageGroup) => {
    if (group === "group1") return isMath(discipline) ? 375 : 350; // AI/EI/EJA/Especial
    return isMath(discipline) ? 425 : 400; // AF/EM
  }, [isMath]);

  // Normalizador de status para manter o tipo estrito
  const normalizeStatus = useCallback((status: string | undefined): 'concluida' | 'em_andamento' | 'pendente' => {
    if (status === 'concluida' || status === 'em_andamento' || status === 'pendente') return status;
    return 'pendente';
  }, []);

  // Verificar se todos os filtros obrigatórios estão selecionados
  // Para todos: Estado, Município e Avaliação são obrigatórios
  // Para professores, diretores e coordenadores: Escola também é obrigatória
  const allRequiredFiltersSelected = selectedState !== 'all' && 
                                    selectedMunicipality !== 'all' && 
                                    selectedEvaluation !== 'all' &&
                                    (!isRestrictedUser || selectedSchool !== 'all');

  // Estados para dados reais dos alunos (como no DetailedResultsView)
  const [students, setStudents] = useState<Array<{
    id: string;
    nome: string;
    turma: string;
    nota: number;
    proficiencia: number;
    classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
    questoes_respondidas: number;
    acertos: number;
    erros: number;
    em_branco: number;
    tempo_gasto: number;
    status: 'concluida' | 'pendente';
  }>>([]);
  
  const [detailedReport, setDetailedReport] = useState<SimpleDetailedReport | null>(null);
  const [questionsWithSkills, setQuestionsWithSkills] = useState<Array<{
    id: string;
    number: number;
    text: string;
    formattedText: string;
    alternatives?: Array<{
      id: string;
      text: string;
      isCorrect: boolean;
    }>;
    skills: string[];
    difficulty: 'Fácil' | 'Médio' | 'Difícil';
    solution: string;
    type: 'multipleChoice' | 'open' | 'trueFalse';
    value: number;
    subject: {
      id: string;
      name: string;
    };
    grade: {
      id: string;
      name: string;
    };
  }>>([]);
  
  const [skillsMapping, setSkillsMapping] = useState<Record<string, string>>({});
  const [skillsBySubject, setSkillsBySubject] = useState<Record<string, Array<{
    id: string | null;
    code: string;
    description: string;
    source: 'database' | 'question';
  }>>>({});

  // Modal: alunos pendentes (`estatisticas_gerais.alunos_pendentes_detalhe`)
  const [showPendingStudentsModal, setShowPendingStudentsModal] = useState(false);
  const [pendingStudentsModalSearch, setPendingStudentsModalSearch] = useState('');

  
  
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isTableReady, setIsTableReady] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [loadingDetails, setLoadingDetails] = useState<{
    detailedReport: boolean;
    questionsWithSkills: boolean;
    skills: boolean;
    students: boolean;
  }>({
    detailedReport: false,
    questionsWithSkills: false,
    skills: false,
    students: false
  });

    // ✅ CORRIGIDO: Consolidar dados por aluno (evitar duplicatas)
  const processTableData = useCallback(() => {
    if (!apiData?.tabela_detalhada?.disciplinas?.length) {
      return {
        students: [],
        questions: [],
        totalQuestions: 0
      };
    }

    // ✅ Agrupar alunos por ID para evitar duplicatas
    const studentsMap = new Map<string, {
      id: string;
      nome: string;
      turma: string;
      escola?: string;
      serie?: string;
      nota: number;
      proficiencia: number;
      classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
      questoes_respondidas: number;
      acertos: number;
      erros: number;
      em_branco: number;
      tempo_gasto: number;
      status: 'concluida' | 'pendente';
      respostas: Array<{
        questao_id: string;
        questao_numero: number;
        resposta_correta: boolean;
        resposta_em_branco: boolean;
        tempo_gasto: number;
      }>;
    }>();

    // ✅ Processar cada disciplina e consolidar dados por aluno
    apiData.tabela_detalhada.disciplinas.forEach(disciplina => {
      disciplina.alunos.forEach(aluno => {
        if (!studentsMap.has(aluno.id)) {
          // Primeira vez vendo este aluno - criar entrada
          studentsMap.set(aluno.id, {
            id: aluno.id,
            nome: aluno.nome,
            turma: aluno.turma,
            escola: aluno.escola ?? undefined,
            serie: aluno.serie ?? undefined,
            nota: aluno.nota,
            proficiencia: aluno.proficiencia,
            classificacao: aluno.nivel_proficiencia as 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado',
            questoes_respondidas: aluno.total_respondidas,
            acertos: aluno.total_acertos,
            erros: aluno.total_erros,
            em_branco: aluno.total_questoes_disciplina - aluno.total_respondidas,
            tempo_gasto: 0,
            status: 'concluida' as const,
            respostas: aluno.respostas_por_questao.map(resposta => ({
              questao_id: `q${resposta.questao}`,
              questao_numero: resposta.questao,
              resposta_correta: resposta.acertou,
              resposta_em_branco: !resposta.respondeu,
              tempo_gasto: 0
            }))
          });
        } else {
          // Aluno já existe - consolidar dados
          const existingStudent = studentsMap.get(aluno.id)!;

          // Importante: não calcular agregações no frontend; apenas anexar as respostas.
          const newRespostas = aluno.respostas_por_questao.map(resposta => ({
            questao_id: `q${resposta.questao}`,
            questao_numero: resposta.questao,
            resposta_correta: resposta.acertou,
            resposta_em_branco: !resposta.respondeu,
            tempo_gasto: 0
          }));
          
          existingStudent.respostas.push(...newRespostas);
        }
      });
    });

    // ✅ Alinhar nota/proficiência/nível com a tabela geral (mesmos valores exibidos na tabela do aluno)
    // Quando existir tabela_detalhada.geral, ela é a fonte correta para nota_geral/proficiencia_geral/nivel_proficiencia_geral.
    const geralAlunos = apiData.tabela_detalhada.geral?.alunos ?? [];
    if (geralAlunos.length > 0) {
      const geralById = new Map(geralAlunos.map((a) => [a.id, a]));
      studentsMap.forEach((student, studentId) => {
        const geral = geralById.get(studentId);
        if (!geral) {
          // Linha só por disciplinas sem correspondência na visão geral: não tratar como concluído
          student.status = 'pendente';
          return;
        }
        student.nota = Number(geral.nota_geral ?? student.nota ?? 0);
        student.proficiencia = Number(geral.proficiencia_geral ?? student.proficiencia ?? 0);
        student.classificacao = (geral.nivel_proficiencia_geral ?? student.classificacao) as
          | 'Abaixo do Básico'
          | 'Básico'
          | 'Adequado'
          | 'Avançado';
        student.questoes_respondidas = Number(geral.total_respondidas_geral ?? student.questoes_respondidas ?? 0);
        student.acertos = Number(geral.total_acertos_geral ?? student.acertos ?? 0);
        student.erros = Number((geral as unknown as { total_erros_geral?: number }).total_erros_geral ?? student.erros ?? 0);
        student.em_branco = Number(geral.total_em_branco_geral ?? student.em_branco ?? 0);
        student.status =
          String(geral.status_geral || '').trim().toLowerCase() === 'concluida'
            ? 'concluida'
            : 'pendente';
      });
    }

    // ✅ Usar questões exatamente como vêm do backend
    const allQuestions = apiData.tabela_detalhada.disciplinas.flatMap(disciplina => 
      disciplina.questoes.map(questao => ({
        id: questao.question_id,
        numero: questao.numero,
        habilidade: questao.habilidade,
        codigo_habilidade: questao.codigo_habilidade,
        question_id: questao.question_id
      }))
    );

    return {
      students: Array.from(studentsMap.values()),
      questions: allQuestions.sort((a, b) => a.numero - b.numero),
      totalQuestions: allQuestions.length
    };
  }, [apiData]);

  // ✅ NOVO: Processar dados do ranking usando tabela_detalhada.geral
  const processRankingData = useCallback(() => {
    // Prioridade 1: Usar dados da tabela_detalhada.geral (mesma fonte da visão geral)
    const tabelaDetalhada = apiData?.tabela_detalhada as TabelaDetalhada | undefined;
    if (tabelaDetalhada?.geral?.alunos?.length) {
      return tabelaDetalhada.geral.alunos
        .map(aluno => ({
          id: aluno.id,
          nome: aluno.nome,
          turma: aluno.turma || 'N/A',
          escola: aluno.escola ?? '',
          serie: aluno.serie ?? '',
          nota: aluno.nota_geral,
          proficiencia: aluno.proficiencia_geral,
          classificacao: aluno.nivel_proficiencia_geral as 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado',
          questoes_respondidas: aluno.total_respondidas_geral,
          acertos: aluno.total_acertos_geral,
          erros: (aluno as unknown as { total_erros_geral?: number }).total_erros_geral ?? 0,
          em_branco: aluno.total_em_branco_geral,
          tempo_gasto: 0,
          status: ((aluno.status_geral || '').toLowerCase() === 'concluida' ? 'concluida' : 'pendente') as 'concluida' | 'pendente'
        }));
    }
    
    // Prioridade 2: Fallback — mesmo formato aninhado/plano que a aba Ranking (fonte: `ranking[]`).
    if (apiData?.ranking?.length) {
      return normalizeEvaluationResultsRanking(apiData.ranking as unknown[]).map((r) => ({
        id: r.id,
        nome: r.nome,
        turma: r.turma || 'N/A',
        escola: r.escola ?? '',
        serie: r.serie ?? '',
        nota: r.nota,
        proficiencia: r.proficiencia,
        classificacao: r.classificacao as unknown as 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado',
        questoes_respondidas: r.questoes_respondidas,
        acertos: r.acertos,
        erros: r.erros,
        em_branco: r.em_branco,
        tempo_gasto: 0,
        status: r.status,
      }));
    }

    return [];
  }, [apiData]);

  // ✅ NOVA IMPLEMENTAÇÃO: Processar dados dos alunos da tabela_detalhada da nova API
  const loadStudentsData = useCallback(async () => {
    // ✅ MODIFICADO: Permitir carregamento quando avaliação específica estiver selecionada
    if (selectedEvaluation === 'all' || !apiData) {
      setStudents([]);
      setDetailedReport(null);
      setQuestionsWithSkills([]);
      setSkillsMapping({});
      setSkillsBySubject({});
      setIsTableReady(false);
      setLoadingStep('');
      setLoadingProgress(0);
      setLoadingDetails({
        detailedReport: false,
        questionsWithSkills: false,
        skills: false,
        students: false
      });
      return;
    }

    try {
      setIsLoadingStudents(true);
      setIsTableReady(false);
      setLoadingStep('Processando dados dos alunos...');
      setLoadingProgress(20);

      // ✅ NOVO: Usar dados da tabela_detalhada se disponível
      if (apiData.tabela_detalhada?.disciplinas?.length) {
        setLoadingStep('Processando dados da tabela detalhada...');
        setLoadingProgress(50);
        
        // Usar a função processTableData para obter dados estruturados
        const tableData = processTableData();
        setStudents(tableData.students);
        setLoadingProgress(80);
        } else if (apiData.ranking?.length) {
          // ✅ Usar dados do ranking quando disponível (já filtrados)
          setLoadingStep('Processando dados do ranking...');
          setLoadingProgress(50);
          const studentsFromRanking = processRankingData();
          setStudents(studentsFromRanking);
          setLoadingProgress(80);
        } else {
          // Sem tabela_detalhada nem ranking: não chamar relatorio-detalhado na página de resultados.
          // Os dados devem vir da API principal (relatório filtrado). Exibir lista vazia.
          setStudents([]);
        }
      
      // Marcar tabela como pronta
      setIsTableReady(true);
      setLoadingProgress(100);
      setLoadingStep('Dados carregados com sucesso!');

      // ✅ OTIMIZADO: Removidas chamadas em background desnecessárias
      
    } catch (error) {
      console.error('Erro ao carregar dados dos alunos:', error);
      setStudents([]);
      setIsTableReady(false);
      setLoadingStep('Erro no carregamento');
      setLoadingProgress(0);
    } finally {
      setIsLoadingStudents(false);
      // Pequeno delay para mostrar a etapa final
      setTimeout(() => {
        setLoadingStep('');
        setLoadingProgress(0);
      }, 1000);
    }
  }, [selectedEvaluation, apiData, processTableData, processRankingData]);

  // ✅ OTIMIZADO: Carregar dados dos alunos quando a avaliação mudar com debounce
  useEffect(() => {
    // Limpar timeout anterior
    if (loadStudentsDataTimeoutRef.current) {
      clearTimeout(loadStudentsDataTimeoutRef.current);
    }
    
    // Criar novo timeout com debounce de 300ms
    loadStudentsDataTimeoutRef.current = setTimeout(() => {
      loadStudentsData();
    }, 300);
    
    // Cleanup function
    return () => {
      if (loadStudentsDataTimeoutRef.current) {
        clearTimeout(loadStudentsDataTimeoutRef.current);
      }
    };
  }, [loadStudentsData]);

  // ✅ REMOVIDO: loadExtraData que estava causando chamadas desnecessárias

    // ✅ CORRIGIDO: Usar APENAS dados do backend sem geração de dados simulados
  const transformedStudents = useMemo(() => {
    // Prioridade 1: Dados da tabela_detalhada (mais completos)
    const tableData = processTableData();
    if (tableData.students.length > 0) {
      return tableData.students;
    }
    
    // Prioridade 2: Dados do ranking (já processados)
    const rankingData = processRankingData();
    if (rankingData.length > 0) {
      return rankingData;
    }
    
    // Prioridade 3: Dados carregados separadamente (fallback)
    if (students.length > 0) {
      return students;
    }
    
    // ✅ REMOVIDO: Geração de dados simulados - usar apenas dados do backend
    return [];
  }, [students, processTableData, processRankingData]);

  // Filtrar estudantes baseado nos filtros (nome pode vir undefined da API)
  const filteredStudents = useMemo(() => {
    return [...transformedStudents].sort((a, b) =>
      (a.nome ?? '').localeCompare(b.nome ?? '', undefined, { sensitivity: 'base' })
    );
  }, [transformedStudents]);

  /** Ranking = sempre `apiData.ranking[]` do backend (posição e critério do servidor). */
  const rankingStudents = useMemo(() => {
    if (!apiData?.ranking?.length) return [];
    return normalizeEvaluationResultsRanking(apiData.ranking as unknown[]).map((r) => ({
      id: r.id,
      nome: r.nome,
      turma: r.turma,
      shift: r.shift,
      escola: r.escola || undefined,
      serie: r.serie || undefined,
      nota: r.nota,
      proficiencia: r.proficiencia,
      classificacao: r.classificacao,
      status: r.status,
      posicao: r.posicao,
      questoes_respondidas: r.questoes_respondidas,
      acertos: r.acertos,
      erros: r.erros,
      em_branco: r.em_branco,
    }));
  }, [apiData?.ranking]);

  const rankingPdfFilterLabels = useMemo(() => {
    const estadoLabel =
      selectedState === 'all'
        ? 'Todos'
        : (() => {
            const st = states.find((s) => s.id === selectedState);
            return st ? `${st.name} (${st.uf})` : selectedState;
          })();
    const municipioLabel =
      selectedMunicipality === 'all'
        ? 'Todos'
        : municipalities.find((m) => m.id === selectedMunicipality)?.name ?? selectedMunicipality;
    const escolaLabel =
      selectedSchool === 'all'
        ? 'Todas'
        : schools.find((s) => s.id === selectedSchool)?.name ?? selectedSchool;
    const serieLabel =
      selectedGrade === 'all'
        ? 'Todas'
        : grades.find((g) => g.id === selectedGrade)?.name ?? selectedGrade;
    const turmaSelecionada = selectedClass === 'all'
      ? undefined
      : classes.find((c) => c.id === selectedClass);
    const turmaLabel =
      selectedClass === 'all'
        ? 'Todas'
        : turmaSelecionada?.name ?? selectedClass;
    const turnoLabel =
      selectedClass === 'all'
        ? 'Todos'
        : getClassShiftLabel(turmaSelecionada?.shift);
    return {
      estado: estadoLabel,
      municipio: municipioLabel,
      escola: escolaLabel,
      serie: serieLabel,
      turma: turmaLabel,
      turno: turnoLabel,
    };
  }, [
    selectedState,
    selectedMunicipality,
    selectedSchool,
    selectedGrade,
    selectedClass,
    states,
    municipalities,
    schools,
    grades,
    classes,
  ]);

  const handleExportRankingPdf = useCallback(async () => {
    if (rankingStudents.length === 0) return;
    try {
      await generateRankingPdf({
        context: 'avaliacoes',
        escopoTitulo: evaluationInfo?.titulo,
        filterLabels: rankingPdfFilterLabels,
        cityId: selectedMunicipality !== 'all' ? selectedMunicipality : null,
        students: rankingStudents.map((s) => ({
          nome: s.nome,
          turma: s.turma,
          shift: s.shift,
          escola: s.escola,
          serie: s.serie,
          nota: s.nota,
          proficiencia: s.proficiencia,
          classificacao: s.classificacao,
          status: s.status,
          posicao: s.posicao,
          questoes_respondidas: s.questoes_respondidas,
          acertos: s.acertos,
          erros: s.erros,
          em_branco: s.em_branco,
        })),
        maxRows: rankingStudents.length,
        fileNameBase: `ranking-avaliacoes-${evaluationInfo?.titulo ?? 'resultados'}`,
        respectBackendRankingOrder: true,
      });
      toast({ title: 'PDF gerado', description: 'O ranking foi exportado com sucesso.' });
    } catch (e) {
      console.error(e);
      toast({
        title: 'Erro ao gerar PDF',
        description: 'Não foi possível exportar o ranking. Tente novamente.',
        variant: 'destructive',
      });
    }
  }, [rankingStudents, rankingPdfFilterLabels, evaluationInfo?.titulo, selectedMunicipality, toast]);

  const buildDisciplineStatsForStudent = useCallback((studentId: string): DisciplineStatsMap | null => {
    const tabelaDetalhada = apiData?.tabela_detalhada as TabelaDetalhada | undefined;
    if (!tabelaDetalhada?.disciplinas?.length) {
      return null;
    }

    const stats: DisciplineStatsMap = {};

    tabelaDetalhada.disciplinas.forEach((disciplina) => {
      if (!disciplina?.nome) return;
      const aluno = disciplina.alunos?.find((item) => item.id === studentId);
      if (!aluno) return;

      stats[disciplina.nome] = {
        nota: Number(aluno.nota ?? 0),
        proficiencia: Number(aluno.proficiencia ?? 0),
        totalQuestions: Number(aluno.total_questoes_disciplina ?? disciplina.questoes?.length ?? 0),
        correctAnswers: Number(aluno.total_acertos ?? 0)
      };
    });

    const geralAluno = tabelaDetalhada.geral?.alunos?.find((item) => item.id === studentId);
    if (geralAluno) {
      stats.GERAL = {
        nota: Number(geralAluno.nota_geral ?? 0),
        proficiencia: Number(geralAluno.proficiencia_geral ?? 0),
        totalQuestions: Number(geralAluno.total_questoes_geral ?? 0),
        correctAnswers: Number(geralAluno.total_acertos_geral ?? 0)
      };
    }

    return Object.keys(stats).length > 0 ? stats : null;
  }, [apiData]);

  // ✅ NOVO: Função para carregar respostas detalhadas de um aluno
  const handleLoadStudentAnswers = useCallback(async (studentId: string) => {
    if (!selectedEvaluation || selectedEvaluation === 'all') return;
    
    setIsLoadingStudentAnswers(true);
    setSelectedStudentForDetails(studentId);
    
    try {
      const answers = await EvaluationResultsApiService.getStudentDetailedAnswers(
        selectedEvaluation,
        studentId
      );
      
      if (answers) {
        setStudentDetailedAnswers(answers);
      }
    } catch (error) {
      console.error('Erro ao carregar respostas detalhadas:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as respostas detalhadas.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingStudentAnswers(false);
    }
  }, [selectedEvaluation, toast]);

  // Função para visualizar detalhes do estudante (adaptada)
  const handleViewStudentDetails = (studentId: string) => {
    if (selectedEvaluation && selectedEvaluation !== 'all') {
      const stats = buildDisciplineStatsForStudent(studentId);
      if (stats && Object.keys(stats).length > 0) {
        saveBulletinStatsToStorage(selectedEvaluation, studentId, stats);
      }
      // Carregar respostas detalhadas antes de navegar
      handleLoadStudentAnswers(studentId);
      const path = `/app/avaliacao/${selectedEvaluation}/aluno/${studentId}/resultados`;
      if (stats && Object.keys(stats).length > 0) {
        navigate(path, { state: { disciplineStats: stats } });
      } else {
        navigate(path);
      }
    }
  };

  // ✅ NOVO: Função para abrir página detalhada em nova guia
  const handleOpenInNewTab = (studentId: string) => {
    if (selectedEvaluation && selectedEvaluation !== 'all') {
      const stats = buildDisciplineStatsForStudent(studentId);
      if (stats && Object.keys(stats).length > 0) {
        saveBulletinStatsToStorage(selectedEvaluation, studentId, stats);
      }
      const url = `/app/avaliacao/${selectedEvaluation}/aluno/${studentId}/resultados`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // Total de questões calculado a partir das fontes disponíveis
  const computedTotalQuestions = useMemo(() => {
    // 1) Valor explícito na avaliação, se existir
    const byEvaluation = detailedReport?.avaliacao?.total_questoes;
    if (typeof byEvaluation === 'number' && byEvaluation > 0) return byEvaluation;

    // 2) Lista de questões vinda no relatório detalhado
    const byReportQuestions = detailedReport?.questoes?.length;
    if (typeof byReportQuestions === 'number' && byReportQuestions > 0) return byReportQuestions;

    // 3) Lista de questões com skills
    if (questionsWithSkills.length > 0) return questionsWithSkills.length;

    // 4) Inferir pelo maior questao_numero nas respostas dos alunos do relatório
    if (detailedReport?.alunos?.length) {
      const maxFromAnswers = detailedReport.alunos.reduce((globalMax, aluno) => {
        const localMax = (aluno.respostas || []).reduce((m, r) => {
          const n = typeof r.questao_numero === 'number' ? r.questao_numero : 0;
          return n > m ? n : m;
        }, 0);
        return localMax > globalMax ? localMax : globalMax;
      }, 0);
      if (maxFromAnswers > 0) return maxFromAnswers;
    }

    // 5) Fallback: inferir pelo maior total por aluno
    //    Regra:
    //    - Se o campo questoes_respondidas já representa o total da avaliação, use-o
    //    - Caso contrário, use a soma acertos+erros+em_branco (quando disponível)
    if (students.length > 0) {
      const maxFromStudents = students.reduce((currentMax, student) => {
        const fromQuestoesRespondidas = Number(student.questoes_respondidas || 0);
        const fromSum = Number((student.acertos || 0) + (student.erros || 0) + (student.em_branco || 0));
        const candidate = Math.max(fromQuestoesRespondidas, fromSum);
        return candidate > currentMax ? candidate : currentMax;
      }, 0);
      if (maxFromStudents > 0) return maxFromStudents;
    }

    return 0;
  }, [detailedReport, questionsWithSkills, students]);

  // Tipos auxiliares para normalização
  type IncomingQuestion = {
    id?: string;
    numero: number;
    texto?: string;
    habilidade?: string;
    codigo_habilidade?: string;
    tipo?: 'multipleChoice' | 'open' | 'trueFalse';
    dificuldade?: 'Fácil' | 'Médio' | 'Difícil';
    porcentagem_acertos?: number;
    porcentagem_erros?: number;
  };

  const normalizedQuestoes = useMemo<TableQuestionData[] | undefined>(() => {
    if (!detailedReport?.questoes) return undefined;
    return (detailedReport.questoes as unknown as IncomingQuestion[]).map((q) => ({
      id: q.id ?? String(q.numero),
      numero: q.numero,
      texto: q.texto ?? '',
      habilidade: q.habilidade ?? '',
      codigo_habilidade: q.codigo_habilidade ?? '',
      tipo: q.tipo ?? 'multipleChoice',
      dificuldade: q.dificuldade ?? 'Médio',
      porcentagem_acertos: q.porcentagem_acertos ?? 0,
      porcentagem_erros: q.porcentagem_erros ?? 0,
    }));
  }, [detailedReport?.questoes]);

  const normalizedDetailedReport = useMemo<TableDetailedReport | undefined>(() => {
    if (!detailedReport) return undefined;
    const totalQ = detailedReport.avaliacao.total_questoes ?? normalizedQuestoes?.length ?? computedTotalQuestions ?? 0;
    return {
      avaliacao: {
        id: detailedReport.avaliacao.id,
        titulo: detailedReport.avaliacao.titulo,
        disciplina: detailedReport.avaliacao.disciplina,
        total_questoes: totalQ,
      },
      questoes: normalizedQuestoes ?? [],
      alunos: detailedReport.alunos.map((a) => ({
        id: a.id,
        nome: a.nome,
        turma: a.turma,
        respostas: (a.respostas || []).map((r) => ({
          questao_id: String(r.questao_numero ?? ''),
          questao_numero: r.questao_numero ?? 0,
          resposta_correta: false,
          resposta_em_branco: true,
          tempo_gasto: r.tempo_gasto ?? 0,
        })),
        total_acertos: a.total_acertos,
        total_erros: a.total_erros,
        total_em_branco: a.total_em_branco,
        nota_final: a.nota_final,
        proficiencia: a.proficiencia,
        classificacao: a.classificacao,
        status: a.status === 'concluida' ? 'concluida' : 'nao_respondida',
      })),
    };
  }, [detailedReport, normalizedQuestoes, computedTotalQuestions]);

  // Métricas gerais: sempre do backend (sem derivar/calcular no frontend).
  const backendStats = useMemo(() => {
    const s = apiData?.estatisticas_gerais;
    const pct =
      s?.percentual_comparecimento != null && Number.isFinite(Number(s.percentual_comparecimento))
        ? Number(s.percentual_comparecimento)
        : null;
    return {
      totalAlunos: s?.total_alunos ?? 0,
      participantes: s?.alunos_participantes ?? 0,
      pendentes: s?.alunos_pendentes ?? 0,
      mediaNota: s?.media_nota_geral ?? 0,
      mediaProficiencia: s?.media_proficiencia_geral ?? 0,
      percentualComparecimento: pct,
    };
  }, [apiData?.estatisticas_gerais]);

  const pendingStudents = useMemo((): AlunoPendenteDetalheEstatisticas[] => {
    const raw = apiData?.estatisticas_gerais?.alunos_pendentes_detalhe;
    if (!Array.isArray(raw)) return [];
    return raw.map((a, i) => ({
      id: String(a.id ?? `sem-id-${i}`),
      nome: String(a.nome ?? ''),
      escola: a.escola,
      serie: a.serie,
      turma: a.turma,
    }));
  }, [apiData?.estatisticas_gerais]);

  const filteredPendingStudents = useMemo(() => {
    const q = pendingStudentsModalSearch.trim();
    if (!q) return pendingStudents;
    const parsed = parsePendingStudentSearchInput(q);
    const n = normalizePendingStudentSearchText;

    if (parsed.kind === 'general' && !parsed.needle) return pendingStudents;

    return pendingStudents.filter((a) => {
      if (parsed.kind === 'turma') {
        return n(String(a.turma ?? '')).includes(parsed.needle);
      }
      if (parsed.kind === 'escola') {
        return n(String(a.escola ?? '')).includes(parsed.needle);
      }
      if (parsed.kind === 'serie') {
        return n(String(a.serie ?? '')).includes(parsed.needle);
      }
      const needle = parsed.needle;
      return (
        n(String(a.nome ?? '')).includes(needle) ||
        n(String(a.escola ?? '')).includes(needle) ||
        n(String(a.serie ?? '')).includes(needle) ||
        n(String(a.turma ?? '')).includes(needle)
      );
    });
  }, [pendingStudents, pendingStudentsModalSearch]);

  const pendingStudentsSearchPlaceholder = useMemo(
    () =>
      getPendingStudentsSearchPlaceholder(
        apiData?.nivel_granularidade ?? apiData?.estatisticas_gerais?.tipo
      ),
    [apiData?.nivel_granularidade, apiData?.estatisticas_gerais?.tipo]
  );

  // Disciplinas derivadas unificando múltiplas fontes
  const derivedSubjects = useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(evaluationInfo?.disciplinas)) {
      evaluationInfo!.disciplinas!.forEach(s => { if (s) set.add(String(s)); });
    }
    if (evaluationInfo?.disciplina) set.add(String(evaluationInfo.disciplina));
    const porDisciplinaStats = (apiData?.estatisticas_gerais as { por_disciplina?: { disciplina: string }[] })
      ?.por_disciplina;
    if (Array.isArray(porDisciplinaStats) && porDisciplinaStats.length > 0) {
      porDisciplinaStats.forEach((d) => {
        const name = extractSubjectName(d.disciplina as unknown);
        if (name) set.add(name);
      });
    } else if (Array.isArray(apiData?.resultados_por_disciplina)) {
      apiData!.resultados_por_disciplina.forEach(d => {
        const name = extractSubjectName(d.disciplina as unknown);
        if (name) set.add(name);
      });
    }

    if (Array.isArray(questionsWithSkills) && questionsWithSkills.length > 0) {
      questionsWithSkills.forEach(q => {
        const name = q.subject?.name;
        if (name) set.add(name);
      });
    }
    return Array.from(set);
  }, [evaluationInfo, apiData, questionsWithSkills, extractSubjectName]);

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* Título da página — o botão Atualizar fica na mesma linha das abas (Gráficos / Tabelas / …) */}
      {!hidePageHeading && (
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
            <BarChart3 className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
            Resultados das Avaliações
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Acompanhe o desempenho das avaliações e gere relatórios
          </p>
        </div>
      )}



      {/* Filtros - overflow-visible e grid responsivo para não cortar no mobile */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-visible">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4 w-full min-w-0">
            {/* Estado */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <Select
                value={selectedState}
                onValueChange={setSelectedState}
                disabled={isLoadingFilters}
              >
                <SelectTrigger className="w-full min-w-0">
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
              <label className="text-sm font-medium">Município</label>
              <Select
                value={selectedMunicipality}
                onValueChange={setSelectedMunicipality}
                disabled={isLoadingFilters || selectedState === 'all'}
              >
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="Selecione o município" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {municipalities.map(municipality => (
                    <SelectItem key={municipality.id} value={municipality.id}>
                      {municipality.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Período de aplicação (opcional): calendário — seleção efetiva só mês/ano (YYYY-MM) */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Período (mês/ano)</label>
              <Popover open={periodPickerOpen} onOpenChange={setPeriodPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isLoadingFilters || selectedMunicipality === 'all'}
                    className={cn(
                      'w-full min-w-0 justify-start text-left font-normal',
                      selectedPeriod === 'all' && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {periodCalendarSelected
                        ? format(periodCalendarSelected, "MMMM 'de' yyyy", { locale: ptBR })
                        : 'Selecionar mês e ano'}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto max-w-[min(100vw-1rem,20rem)] overflow-hidden border-border bg-popover p-0 text-popover-foreground shadow-lg"
                  align="start"
                >
                  <div className="grid grid-cols-2 gap-2 border-b border-border px-3 pt-3 pb-2">
                    <div className="min-w-0 space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Mês</span>
                      <Select
                        value={String(periodDraft.m)}
                        onValueChange={(v) => {
                          const mi = parseInt(v, 10);
                          const y = periodDraft.y;
                          setPeriodDraft({ y, m: mi });
                          const p = normalizeResultsPeriodYm(
                            `${y}-${String(mi + 1).padStart(2, '0')}`
                          );
                          if (p !== 'all') setSelectedPeriod(p);
                        }}
                      >
                        <SelectTrigger className="h-9 w-full min-w-0">
                          <SelectValue placeholder="Mês" />
                        </SelectTrigger>
                        <SelectContent>
                          {RESULTS_MONTH_NAMES_PT.map((name, i) => (
                            <SelectItem key={i} value={String(i)}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Ano</span>
                      <Select
                        value={String(periodDraft.y)}
                        onValueChange={(v) => {
                          const y = parseInt(v, 10);
                          const mi = periodDraft.m;
                          setPeriodDraft({ y, m: mi });
                          const p = normalizeResultsPeriodYm(
                            `${y}-${String(mi + 1).padStart(2, '0')}`
                          );
                          if (p !== 'all') setSelectedPeriod(p);
                        }}
                      >
                        <SelectTrigger className="h-9 w-full min-w-0">
                          <SelectValue placeholder="Ano" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {Array.from(
                            {
                              length:
                                getResultsPeriodYearMax() - RESULTS_PERIOD_YEAR_MIN + 1,
                            },
                            (_, i) => RESULTS_PERIOD_YEAR_MIN + i
                          ).map((y) => (
                            <SelectItem key={y} value={String(y)}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Calendar
                    mode="single"
                    locale={ptBR}
                    month={new Date(periodDraft.y, periodDraft.m, 1)}
                    onMonthChange={(d) => {
                      const y = d.getFullYear();
                      const m = d.getMonth();
                      setPeriodDraft({ y, m });
                      const p = normalizeResultsPeriodYm(
                        `${y}-${String(m + 1).padStart(2, '0')}`
                      );
                      if (p !== 'all') setSelectedPeriod(p);
                    }}
                    selected={periodCalendarSelected}
                    captionLayout="buttons"
                    fromYear={RESULTS_PERIOD_YEAR_MIN}
                    toYear={getResultsPeriodYearMax()}
                    className="rounded-none border-0 bg-transparent p-0 text-popover-foreground shadow-none"
                    onSelect={(date) => {
                      if (date) {
                        const y = date.getFullYear();
                        const m = date.getMonth();
                        setPeriodDraft({ y, m });
                        const p = normalizeResultsPeriodYm(format(date, 'yyyy-MM'));
                        if (p !== 'all') {
                          setSelectedPeriod(p);
                          setPeriodPickerOpen(false);
                        }
                      }
                    }}
                    initialFocus
                  />
                  <div className="space-y-2 border-t border-border bg-muted/15 px-3 py-2.5 dark:bg-muted/25">
                    <p className="text-center text-xs leading-snug text-muted-foreground">
                      Altere mês ou ano nos seletores, use as setas do calendário ou toque em um dia
                      para aplicar e fechar.
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-full text-muted-foreground hover:text-foreground"
                      disabled={selectedPeriod === 'all'}
                      onClick={() => {
                        setSelectedPeriod('all');
                        setPeriodPickerOpen(false);
                      }}
                    >
                      Limpar período
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <EvaluationInstrumentPicker
              label="Avaliações"
              estado={selectedState}
              municipio={selectedMunicipality}
              value={selectedEvaluation}
              onChange={setSelectedEvaluation}
              periodo={periodoApi}
              estadoLabel={states.find((s) => s.id === selectedState)?.name}
              municipioLabel={municipalities.find((m) => m.id === selectedMunicipality)?.name}
              periodoLabel={periodoApi}
              disabled={isLoadingFilters}
              loading={isLoadingFilters}
              allowAll
              allLabel="Todas"
              placeholder="Selecione a avaliação"
            />

            {/* Escola */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Escola
                {isRestrictedUser && <span className="text-red-500 ml-1">*</span>}
              </label>
              <Select
                value={selectedSchool}
                onValueChange={setSelectedSchool}
                disabled={isLoadingFilters || selectedEvaluation === 'all'}
              >
                <SelectTrigger className={cn("w-full min-w-0", isRestrictedUser && selectedSchool === 'all' && "border-red-300 focus:border-red-500")}>
                  <SelectValue placeholder={isRestrictedUser ? "Selecione a escola (obrigatório)" : "Selecione a escola"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {schools.map(school => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isRestrictedUser && selectedSchool === 'all' && (
                <p className="text-xs text-red-600">
                  Escola é obrigatória para {isProfessor ? 'professores' : 'diretores e coordenadores'}
                </p>
              )}
            </div>

            {/* Série */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Série</label>
              <Select
                value={selectedGrade}
                onValueChange={setSelectedGrade}
                disabled={isLoadingFilters || selectedSchool === 'all'}
              >
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="Selecione a série" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {grades.map(grade => (
                    <SelectItem key={grade.id} value={grade.id}>
                      {grade.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Turma */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Turma</label>
              <Select
                value={selectedClass}
                onValueChange={setSelectedClass}
                disabled={isLoadingFilters || selectedGrade === 'all'}
              >
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="Selecione a turma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {classes.map(classItem => (
                    <SelectItem key={classItem.id} value={classItem.id}>
                      {classItem.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Informação sobre filtros */}
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-400">
              💡 <strong>Hierarquia dos Filtros:</strong> Estado → Município → Período (opcional) → Avaliação → Escola → Série → Turma
            </p>
            <p className="text-sm text-blue-700 mt-1">
              {isRestrictedUser ? (
                <>
                  <strong>Estado</strong>, <strong>Município</strong>, <strong>Avaliação</strong> e <strong>Escola</strong> são obrigatórios para {isProfessor ? 'professores' : 'diretores e coordenadores'}. <strong>Período</strong>, Série e Turma são opcionais.
                </>
              ) : (
                <>
                  <strong>Estado</strong>, <strong>Município</strong> e <strong>Avaliação</strong> são obrigatórios. <strong>Período</strong> restringe listas ao mês de aplicação (AAAA-MM). Escola, Série e Turma são opcionais e podem ser "Todos".
                </>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Mensagem quando não há filtros suficientes */}
      {!allRequiredFiltersSelected && !isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Filter className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              Selecione os filtros obrigatórios para continuar
            </h3>
            <p className="text-gray-600 text-center max-w-md">
              {isRestrictedUser ? (
                <>
                  Para visualizar os resultados das avaliações, você precisa selecionar: <strong>Estado</strong>, <strong>Município</strong>, <strong>Avaliação</strong> e <strong>Escola</strong>. Os filtros Série e Turma são opcionais e podem ser "Todos".
                </>
              ) : (
                <>
                  Para visualizar os resultados das avaliações, você precisa selecionar: <strong>Estado</strong>, <strong>Município</strong> e <strong>Avaliação</strong>. Os filtros Escola, Série e Turma são opcionais e podem ser "Todos".
                </>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading dos dados */}
      {allRequiredFiltersSelected && isLoadingData && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Carregando dados...</p>
          </CardContent>
        </Card>
      )}

      {/* Gráficos e Dados */}
      {allRequiredFiltersSelected && !isLoadingData && apiData && (
        <>
          {/* Informações da Avaliação (resumo) */}
          {evaluationInfo && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>
                  <span>Informações da Avaliação</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Disciplinas</div>
                    <div className="font-semibold">
                      {derivedSubjects.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {derivedSubjects.map((subject) => (
                            <DisciplineTag
                              key={subject}
                              name={subject}
                              className="text-xs"
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-foreground">{evaluationInfo?.disciplina || 'Disciplina não informada'}</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Série</div>
                    <div className="font-semibold">
                      {evaluationInfo?.serie || 
                       apiData?.estatisticas_gerais?.serie || 
                       (selectedGrade !== 'all' ? grades.find(g => g.id === selectedGrade)?.name : null) ||
                       (apiData?.opcoes_proximos_filtros?.series?.length === 1 
                         ? apiData.opcoes_proximos_filtros.series[0].name 
                         : 'Série não informada')}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Escola</div>
                    <div className="font-semibold">
                      {evaluationInfo?.escola || (selectedSchool === 'all' ? 'Todas as Escolas' : 'Escola não informada')}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Município</div>
                    <div className="font-semibold">{evaluationInfo?.municipio || 'Município não informado'}</div>
                  </div>
                </div>

                <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 mt-6">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Total de Alunos</div>
                    <div className="text-2xl font-bold text-blue-600">{backendStats.totalAlunos}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Participantes</div>
                    <div className="text-2xl font-bold text-green-600">{backendStats.participantes}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium text-muted-foreground leading-tight">
                        Faltosos /<br />Pendentes
                      </div>
                      {backendStats.pendentes > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowPendingStudentsModal(true)}
                          className="h-auto p-0 text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-transparent"
                        >
                          Ver lista
                        </Button>
                      )}
                    </div>
                    <div className="text-2xl font-bold text-red-600">{backendStats.pendentes}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Taxa de participação</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {backendStats.percentualComparecimento != null
                        ? `${backendStats.percentualComparecimento.toFixed(1)}%`
                        : '-'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Nota Geral</div>
                    <div className="text-2xl font-bold text-purple-600">{Number(backendStats.mediaNota || 0).toFixed(1)}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Proficiência</div>
                    <div className="text-2xl font-bold text-orange-600">{Number(backendStats.mediaProficiencia || 0).toFixed(1)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Verificar se há avaliações detalhadas disponíveis */}
          {(() => {
            const avaliacoesLength = apiData.resultados_detalhados?.avaliacoes?.length || 0;
            const dataLength = (apiData.resultados_detalhados as ResultadosDetalhadosFromAPI)?.data?.length || 0;
            // Mostrar conteúdo se houver avaliações detalhadas, independente das estatísticas gerais
            return (avaliacoesLength === 0 && dataLength === 0);
          })() ? (
            <>
              <div className="flex w-full min-w-0 flex-row flex-wrap items-center justify-end gap-3">
                <Button variant="outline" onClick={() => loadAllData()} disabled={isLoadingData} className="shrink-0 gap-2">
                  <RefreshCw className={`h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
              </div>
              <Card>
                <CardContent className="text-center py-12">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    <FileX className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    Nenhum resultado para mostrar
                  </h3>
                  <p className="text-muted-foreground">
                    Não foram encontrados resultados para os filtros selecionados.
                  </p>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              {/* Abas com diferentes visualizações */}
              <Tabs defaultValue="charts" className="w-full">
                <div className="flex w-full min-w-0 flex-row flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 basis-[min(100%,36rem)]">
                    <TabsList
                      className={`grid w-full min-w-0 ${
                        selectedEvaluation !== 'all'
                          ? 'grid-cols-2 sm:grid-cols-4'
                          : 'grid-cols-2 sm:grid-cols-3'
                      }`}
                    >
                      <TabsTrigger value="charts">Gráficos</TabsTrigger>
                      <TabsTrigger value="tables">Tabelas</TabsTrigger>
                      <TabsTrigger value="statistics">Estatísticas</TabsTrigger>
                      {selectedEvaluation !== 'all' && (
                        <TabsTrigger value="ranking">Ranking</TabsTrigger>
                      )}
                    </TabsList>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => loadAllData()}
                      disabled={isLoadingData}
                      className="gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                  </div>
                </div>

                <TabsContent value="charts" className="space-y-6">
                  
                  {apiData && apiData.estatisticas_gerais ? (
                    <ResultsCharts
                      apiData={{
                        estatisticas_gerais: apiData.estatisticas_gerais,
                      }}
                      evaluationInfo={evaluationInfo ? {
                        id: evaluationInfo?.id || '',
                        titulo: evaluationInfo?.titulo || '',
                        disciplina: (evaluationInfo?.disciplinas && evaluationInfo.disciplinas.length > 0)
                          ? evaluationInfo.disciplinas[0]
                          : (evaluationInfo?.disciplina || ''),
                        serie: evaluationInfo?.serie || '',
                        escola: evaluationInfo?.escola || '',
                        municipio: evaluationInfo?.municipio || '',
                        data_aplicacao: evaluationInfo?.data_aplicacao || '',
                        total_alunos: evaluationInfo?.total_alunos || 0,
                        alunos_participantes: evaluationInfo?.alunos_participantes || 0,
                        alunos_ausentes: evaluationInfo?.alunos_ausentes ?? 0,
                        media_nota: evaluationInfo?.media_nota || 0,
                        media_proficiencia: evaluationInfo?.media_proficiencia || 0
                      } : null}
                      inferStageGroup={inferStageGroup}
                      getMaxForDiscipline={getMaxForDiscipline}
                    />
                  ) : (
                    <Card>
                      <CardContent className="text-center py-12">
                        <p className="text-muted-foreground">Não há dados suficientes para gerar os gráficos.</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="tables" className="space-y-6" id="results-tables">
                  {selectedEvaluation === 'all' ? (
                    // Estado inicial: Nenhuma avaliação selecionada
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center py-16">
                        <div className="w-20 h-20 bg-blue-50 dark:bg-blue-950/30 rounded-full flex items-center justify-center mb-6">
                          <BookOpen className="h-10 w-10 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-foreground mb-3">
                          Selecione uma Avaliação
                        </h3>
                        <p className="text-muted-foreground text-center max-w-md mb-6">
                          Para visualizar os resultados detalhados dos alunos, é necessário selecionar uma avaliação específica nos filtros acima.
                        </p>
                        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 max-w-md">
                          <div className="flex items-start gap-3">
                            <div className="w-5 h-5 bg-blue-600 dark:bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-white text-xs font-bold">!</span>
                            </div>
                            <div className="text-sm text-blue-800 dark:text-blue-400">
                              <strong>Por que essa restrição?</strong><br />
                              Isso garante maior estabilidade, carregamento mais rápido e dados sempre precisos.
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    // Conteúdo normal da tabela quando avaliação está selecionada
                    <>


                  {/* Tabela de Resultados */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>Resultados dos Alunos</span>
                        <Badge variant="outline">
                          {filteredStudents.length} {filteredStudents.length === 1 ? 'aluno' : 'alunos'}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {/* Loading State */}
                      {isLoadingStudents && (
                        <div className="mb-6 p-6 bg-gradient-to-r from-blue-50 dark:from-blue-950/30 to-indigo-50 dark:to-indigo-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                          <div className="text-center space-y-4">
                            {/* Spinner animado */}
                            <div className="relative mx-auto w-16 h-16">
                              <div className="absolute inset-0 rounded-full border-4 border-blue-200 dark:border-blue-800"></div>
                              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 dark:border-t-blue-400 animate-spin"></div>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-6 h-6 bg-blue-600 dark:bg-blue-500 rounded-full"></div>
                              </div>
                            </div>
                            
                            {/* Texto do passo atual */}
                            <div className="space-y-2">
                              <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-400">
                                {loadingStep}
                              </h3>
                              
                              {/* Barra de progresso */}
                              <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-2">
                                <div 
                                  className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                                  style={{ width: `${loadingProgress}%` }}
                                ></div>
                              </div>
                              <p className="text-sm text-blue-600 dark:text-blue-400">{loadingProgress}%</p>
                            </div>
                            
                            {/* Indicadores de status */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${loadingDetails.detailedReport ? 'bg-blue-500 animate-pulse' : 'bg-muted-foreground'}`}></div>
                                <span className="text-xs text-muted-foreground">Relatório</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${loadingDetails.questionsWithSkills ? 'bg-blue-500 animate-pulse' : 'bg-muted-foreground'}`}></div>
                                <span className="text-xs text-muted-foreground">Questões</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${loadingDetails.skills ? 'bg-blue-500 animate-pulse' : 'bg-muted-foreground'}`}></div>
                                <span className="text-xs text-muted-foreground">Skills</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${loadingDetails.students ? 'bg-blue-500 animate-pulse' : 'bg-muted-foreground'}`}></div>
                                <span className="text-xs text-muted-foreground">Alunos</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {filteredStudents.length > 0 ? (
                        <>


                          {/* Toggle entre Tabela e Cards */}
                          <div className="mb-4 flex justify-end">
                            <div className="flex items-center gap-1 border rounded-lg p-1">
                              <Button
                                variant={viewMode === 'table' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setViewMode('table')}
                                className="h-8 px-3"
                              >
                                <BarChart3 className="h-4 w-4 mr-1" />
                                Tabela
                              </Button>
                              <Button
                                variant={viewMode === 'cards' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setViewMode('cards')}
                                className="h-8 px-3"
                              >
                                <Users className="h-4 w-4 mr-1" />
                                Cards
                              </Button>
                            </div>
                          </div>

                          {/* Estado de carregamento inicial */}
                          {!isTableReady && (
                            <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
                              <div className="flex items-center gap-3">
                                <div className="w-4 h-4 bg-yellow-500 dark:bg-yellow-600 rounded-full animate-pulse"></div>
                                <span className="text-sm text-yellow-700 dark:text-yellow-400">
                                  Preparando dados para exibição...
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Conteúdo baseado no modo de visualização */}
                          {viewMode === 'table' ? (
                            isTableReady && !isLoadingStudents && apiData?.tabela_detalhada ? (
                              <DisciplineTables
                                tabelaDetalhada={{
                                  disciplinas: apiData.tabela_detalhada.disciplinas,
                                  geral: apiData.tabela_detalhada.geral ? {
                                    alunos: apiData.tabela_detalhada.geral.alunos.map(aluno => ({
                                      id: aluno.id,
                                      nome: aluno.nome,
                                      escola: aluno.escola || '',
                                      serie: aluno.serie || '',
                                      turma: aluno.turma || '',
                                      nota_geral: aluno.nota_geral || 0,
                                      proficiencia_geral: aluno.proficiencia_geral || 0,
                                      nivel_proficiencia_geral: aluno.nivel_proficiencia_geral || '',
                                      total_acertos_geral: aluno.total_acertos_geral || 0,
                                      total_questoes_geral: aluno.total_questoes_geral || 0,
                                      total_respondidas_geral: aluno.total_respondidas_geral || 0,
                                      total_em_branco_geral: aluno.total_em_branco_geral || 0,
                                      percentual_acertos_geral: aluno.percentual_acertos_geral || 0,
                                      status_geral: aluno.status_geral || ''
                                    }))
                                  } : undefined
                                }}
                                onViewStudentDetails={handleViewStudentDetails}
                                onOpenInNewTab={handleOpenInNewTab}
                              />
                            ) : (
                              <div className="text-center py-12">
                                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
                                </div>
                                <h3 className="text-lg font-semibold text-foreground mb-2">
                                  Carregando tabelas por disciplina...
                                </h3>
                                <p className="text-muted-foreground">
                                  Aguarde enquanto finalizamos o processamento dos dados.
                                </p>
                              </div>
                            )
                          ) : (
                            /* Visão em Cards Melhorada */
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
                              {filteredStudents.map((student, index) => (
                                <StudentCard
                                  key={`${student.id}-${index}`}
                                  student={student}
                                  totalQuestions={computedTotalQuestions || student.questoes_respondidas || 0}
                                  subjects={derivedSubjects}
                                  onViewDetails={handleViewStudentDetails}
                                />
                              ))}
                            </div>
              )}
            </>
                      ) : (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                            <BarChart3 className="h-8 w-8 text-muted-foreground" />
                          </div>
                          <h3 className="text-lg font-semibold text-foreground mb-2">
                            Nenhum dado encontrado
                          </h3>
                          <p className="text-muted-foreground">
                            Não há dados disponíveis para exibir na tabela.
                          </p>
                        </div>
                      )}
                    </CardContent>
                                     </Card>
                    </>
                  )}
                 </TabsContent>

                <TabsContent value="statistics" className="space-y-6">
                  <ClassStatistics
                    apiData={apiData ? (() => {
                    const hasSpecificFilters = selectedClass !== 'all' || selectedGrade !== 'all' || selectedSchool !== 'all';
                    const base = {
                      ...apiData,
                      tabela_detalhada: apiData.tabela_detalhada ? {
                        ...apiData.tabela_detalhada,
                        geral: apiData.tabela_detalhada.geral ? {
                          alunos: apiData.tabela_detalhada.geral.alunos.map(aluno => ({
                            id: aluno.id,
                            nome: aluno.nome,
                            turma: aluno.turma || '',
                            nivel_proficiencia_geral: aluno.nivel_proficiencia_geral || '',
                            nota_geral: aluno.nota_geral || 0,
                            proficiencia_geral: aluno.proficiencia_geral || 0,
                            total_acertos_geral: aluno.total_acertos_geral || 0,
                            total_erros_geral: (aluno as unknown as { total_erros_geral?: number }).total_erros_geral || 0,
                            total_respondidas_geral: aluno.total_respondidas_geral || 0
                          }))
                        } : undefined
                      } : undefined
                    };
                    if (hasSpecificFilters && apiData.estatisticas_gerais) {
                      base.estatisticas_gerais = apiData.estatisticas_gerais;
                    }
                    return base;
                  })() : null}
                    isMunicipalView={selectedSchool === 'all'}
                    userHierarchy={userHierarchyContext}
                    rankingPdfFilterLabels={rankingPdfFilterLabels}
                    escopoTitulo={evaluationInfo?.titulo}
                    reportContext="avaliacoes"
                  />
                </TabsContent>

                {selectedEvaluation !== 'all' && (
                  <TabsContent value="ranking" className="space-y-6">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={rankingStudents.length === 0}
                        onClick={() => void handleExportRankingPdf()}
                      >
                        <FileText className="h-4 w-4" />
                        Exportar PDF
                      </Button>
                    </div>
                    <StudentRanking
                      students={rankingStudents}
                      backendRankingOrder
                    />
                  </TabsContent>
                )}
              </Tabs>
            </>
          )}
        </>
      )}

      {/* Modal: Alunos Pendentes */}
      <Dialog
        open={showPendingStudentsModal}
        onOpenChange={(open) => {
          setShowPendingStudentsModal(open);
          if (!open) setPendingStudentsModalSearch('');
        }}
      >
        <DialogContent className="w-[96vw] max-w-5xl h-[88vh] max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-red-600" />
              Alunos pendentes
              {evaluationInfo?.titulo && (
                <span className="text-sm font-normal text-muted-foreground ml-1">· {evaluationInfo.titulo}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 py-2">
            {backendStats.pendentes > 0 ? (
              <div className="space-y-4">
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 bg-red-500 dark:bg-red-400 rounded-full shrink-0" />
                    <span className="font-semibold text-red-800 dark:text-red-400">
                      {backendStats.pendentes}{' '}
                      {backendStats.pendentes === 1 ? 'aluno' : 'alunos'} pendente(s)
                    </span>
                  </div>
                  <p className="text-sm text-red-700 dark:text-red-400">
                    Estes alunos ainda não entregaram ou não tiveram a avaliação concluída.
                  </p>
                </div>
                {pendingStudents.length > 0 ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search
                        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
                        aria-hidden
                      />
                      <Input
                        type="search"
                        placeholder={pendingStudentsSearchPlaceholder}
                        value={pendingStudentsModalSearch}
                        onChange={(e) => setPendingStudentsModalSearch(e.target.value)}
                        className="pl-9"
                        autoComplete="off"
                      />
                    </div>
                    {pendingStudentsModalSearch.trim() !== '' && (
                      <p className="text-xs text-muted-foreground">
                        Exibindo {filteredPendingStudents.length} de {pendingStudents.length}{' '}
                        {pendingStudents.length === 1 ? 'aluno' : 'alunos'}
                      </p>
                    )}
                    {filteredPendingStudents.length > 0 ? (
                      <div className="grid gap-3">
                        {filteredPendingStudents.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-red-100 dark:bg-red-950/30 rounded-full flex items-center justify-center shrink-0">
                                <span className="text-red-600 dark:text-red-400 font-semibold text-sm">
                                  {(a.nome || '').charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-foreground truncate">{a.nome}</div>
                                <div className="text-sm text-muted-foreground truncate">
                                  {[
                                    a.escola,
                                    a.turma != null && String(a.turma).trim() !== ''
                                      ? `Turma ${String(a.turma).trim()}`
                                      : '',
                                    a.serie,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ') || '—'}
                                </div>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-red-600 dark:text-red-400 border-red-300 dark:border-red-800">
                              Pendente
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground rounded-lg border border-border bg-muted/50 p-4 text-center">
                        Nenhum aluno encontrado com esse nome. Tente outro termo ou limpe a pesquisa.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground rounded-lg border border-border bg-muted/50 p-4">
                    O total de pendentes foi informado nas estatísticas, mas a lista detalhada de alunos não veio nesta resposta.
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum pendente</h3>
                <p className="text-muted-foreground">
                  Todos os alunos do escopo já têm resultado concluído.
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 pt-4 border-t mt-4">
            {pendingStudents.length > 0 ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={filteredPendingStudents.length === 0}
                  onClick={async () => {
                    try {
                      await generatePendingStudentsPdf({
                        title: "Alunos pendentes — Avaliação",
                        subtitle: evaluationInfo?.titulo ? String(evaluationInfo.titulo) : undefined,
                        cityId: selectedMunicipality !== 'all' ? selectedMunicipality : null,
                        students: filteredPendingStudents.map((a) => ({
                          nome: a.nome,
                          escola: a.escola,
                          turma: a.turma,
                          serie: a.serie,
                          statusLabel: "Pendente",
                        })),
                        fileName: "alunos-pendentes-avaliacao",
                      });
                      toast({
                        title: "PDF gerado com sucesso!",
                        description: "A lista de alunos pendentes foi baixada em PDF.",
                      });
                    } catch {
                      toast({
                        title: "Erro ao gerar PDF",
                        description: "Não foi possível gerar o PDF da lista.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  PDF
                </Button>
              </div>
            ) : (
              <span />
            )}
            <Button variant="outline" onClick={() => setShowPendingStudentsModal(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
} 