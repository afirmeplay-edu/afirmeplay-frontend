import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  BarChart3,
  Calendar as CalendarIcon,
  Filter,
  Loader2,
  RefreshCw,
  Users,
  BookOpen,
  FileX,
  Check,
  LayoutGrid,
  Table2,
  Eye,
  FileText,
  Search,
} from 'lucide-react';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/api';
import { useAuth } from '@/context/authContext';
import {
  EvaluationResultsApiService,
  REPORT_ENTITY_TYPE_ANSWER_SHEET,
} from '@/services/evaluation/evaluationResultsApi';
import { cityIdQueryParamForAdmin, getUserHierarchyContext, type UserHierarchyContext } from '@/utils/userHierarchy';
import { buildAnswerSheetStudentDetailHref } from '@/utils/answer-sheet/buildAnswerSheetStudentDetailHref';
import { useToast } from '@/hooks/use-toast';
import { ResultsCharts } from '@/components/evaluations/results/ResultsCharts';
import { StudentRanking } from '@/components/evaluations/student/StudentRanking';
import { ClassStatistics } from '@/components/evaluations/results/ClassStatistics';
import { StudentCard } from '@/components/evaluations/student/StudentCard';
import { DisciplineTables } from '@/components/evaluations/results/DisciplineTables';
import { cn } from '@/lib/utils';
import { generatePendingStudentsPdf } from '@/services/reports/pendingStudentsPdf';
import { generateRankingPdf } from '@/services/reports/rankingPdf';
import { normalizeEvaluationResultsRanking } from '@/utils/evaluation/normalizeEvaluationResultsRanking';
import {
  normalizePendingStudentSearchText,
  parsePendingStudentSearchInput,
  getPendingStudentsSearchPlaceholder,
} from '@/utils/report/pendingStudentsSearch';
import { buildGeralAlunosFromDisciplinasAndRanking } from '@/utils/answer-sheet/buildTabelaDetalhadaGeral';
import {
  RESULTS_PERIOD_YEAR_MIN,
  getResultsPeriodYearMax,
  normalizeResultsPeriodYm,
  RESULTS_MONTH_NAMES_PT,
} from '@/utils/resultsPeriod';
import { getReportProficiencyTagClass } from '@/utils/report/reportTagStyles';
import { InstrumentPickerField } from '@/components/filters';
import {
  buildPickerContextLines,
  toInstrumentPickerItems,
  toInstrumentPickerSeries,
} from '@/components/filters/instrumentPickerHelpers';

// Opções dos filtros (resposta de GET /answer-sheets/opcoes-filtros-results)
interface FilterOption {
  id: string;
  nome?: string;
  name?: string;
  titulo?: string;
}

interface OpcoesFiltrosResponse {
  estados?: FilterOption[];
  municipios?: FilterOption[];
  gabaritos?: FilterOption[];
  series_disponiveis?: FilterOption[];
  escolas?: FilterOption[];
  series?: FilterOption[];
  turmas?: FilterOption[];
}

// Aluno pendente/faltoso detalhado em `estatisticas_gerais.alunos_pendentes_detalhe`
// (mesmo contrato usado pela rota das avaliações online — fonte oficial da lista).
interface AlunoPendenteDetalhe {
  id: string;
  nome: string;
  escola?: string;
  serie?: string;
  turma?: string;
}

// Resposta de GET /answer-sheets/resultados-agregados
interface EstatisticasGerais {
  tipo: string;
  nome?: string;
  estado?: string;
  municipio?: string;
  escola?: string;
  serie?: string;
  total_escolas?: number;
  total_series?: number;
  total_turmas?: number;
  total_gabaritos?: number;
  total_alunos: number;
  alunos_participantes: number;
  alunos_pendentes?: number;
  alunos_ausentes?: number;
  alunos_pendentes_detalhe?: AlunoPendenteDetalhe[];
  percentual_comparecimento?: number;
  nivel_classificacao?: string | null;
  media_nota_geral: number;
  media_proficiencia_geral: number;
  distribuicao_classificacao_geral?: {
    abaixo_do_basico: number;
    basico: number;
    adequado: number;
    avancado: number;
  };
  por_disciplina?: Array<{
    disciplina: string;
    media_nota?: number;
    media_proficiencia?: number;
    distribuicao_classificacao?: {
      abaixo_do_basico: number;
      basico: number;
      adequado: number;
      avancado: number;
    };
  }>;
}

interface GabaritoAgregado {
  id: string;
  titulo: string;
  serie?: string;
  turma?: string;
  escola?: string;
  escola_id?: string;
  municipio?: string;
  estado?: string;
  total_alunos: number;
  alunos_participantes: number;
  alunos_pendentes?: number;
  alunos_ausentes?: number;
  percentual_comparecimento?: number;
  media_nota: number;
  media_proficiencia: number;
  media_nota_lingua_portuguesa?: number | null;
  media_nota_matematica?: number | null;
  medias_por_disciplina?: Array<{
    disciplina: string;
    media_nota?: number;
    media_proficiencia?: number;
  }>;
  distribuicao_classificacao?: {
    abaixo_do_basico: number;
    basico: number;
    adequado: number;
    avancado: number;
  };
  nivel_classificacao?: string | null;
}

// Resultados por disciplina (para gráficos) — retornado por GET /answer-sheets/resultados-agregados
interface ResultadoPorDisciplina {
  disciplina: string;
  total_avaliacoes?: number;
  total_alunos?: number;
  alunos_participantes?: number;
  media_nota: number;
  media_proficiencia: number;
  distribuicao_classificacao?: {
    abaixo_do_basico: number;
    basico: number;
    adequado: number;
    avancado: number;
  };
}

// Aluno na visão geral (tabela_detalhada.geral.alunos)
interface GeralAluno {
  id: string;
  nome: string;
  escola?: string;
  serie?: string;
  turma?: string;
  nota_geral: number;
  proficiencia_geral: number;
  nivel_proficiencia_geral: string;
  total_acertos_geral: number;
  total_questoes_geral: number;
  total_respondidas_geral: number;
  total_em_branco_geral?: number;
  percentual_acertos_geral: number;
  status_geral: string;
  respostas_por_questao?: Array<{ questao: number; acertou: boolean; respondeu: boolean; resposta: string }>;
}

// Disciplina em tabela_detalhada.disciplinas (API pode enviar skills[] em vez de codigo_habilidade)
interface DisciplinaTabela {
  id: string;
  nome: string;
  questoes: Array<{
    numero: number;
    habilidade?: string;
    codigo_habilidade?: string;
    question_id?: string;
    /** Entradas da API podem usar várias chaves (name, descricao, etc.). */
    skills?: Array<Record<string, unknown>>;
  }>;
  alunos: Array<{
    id: string;
    nome: string;
    escola?: string;
    serie?: string;
    turma?: string;
    respostas_por_questao: Array<{ questao: number; acertou: boolean; respondeu: boolean; resposta: string }>;
    total_acertos: number;
    total_erros: number;
    total_respondidas: number;
    total_questoes_disciplina: number;
    total_em_branco?: number;
    nivel_proficiencia: string;
    nota: number;
    proficiencia: number;
    status?: string;
    percentual_acertos?: number;
  }>;
}

function strUnknown(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** API às vezes manda "?", "—" ou vazio como placeholder em habilidade/código. */
function isPlaceholderHabilidadeText(t: string): boolean {
  const s = t.trim();
  if (!s) return true;
  if (/^[\?\uFF1F]$/.test(s)) return true;
  if (/^[—\u2013\u2014\-]$/.test(s)) return true;
  if (/^n\/?a$/i.test(s)) return true;
  return false;
}

/** Lê código e descrição de um item em skills[] (formatos variam na API). */
function parseSkillEntry(raw: unknown): { description: string; code: string } {
  if (!raw || typeof raw !== 'object') return { description: '', code: '' };
  const o = raw as Record<string, unknown>;
  const code =
    strUnknown(o.code) ||
    strUnknown(o.codigo) ||
    strUnknown(o.codigo_habilidade) ||
    '';
  const id = strUnknown(o.id);
  const description =
    strUnknown(o.description) ||
    strUnknown(o.descricao) ||
    strUnknown(o.name) ||
    strUnknown(o.nome) ||
    strUnknown(o.title) ||
    strUnknown(o.label) ||
    strUnknown(o.text) ||
    '';
  let resolvedCode = code;
  if (isPlaceholderHabilidadeText(resolvedCode)) {
    resolvedCode = isPlaceholderHabilidadeText(id) ? '' : id;
  }
  return { description, code: resolvedCode };
}

/** Campos opcionais na questão (API agregada pode usar nomes diferentes de `habilidade`). */
function descricaoHabilidadeFromQuestaoPlana(
  q: DisciplinaTabela['questoes'][number]
): string {
  const rec = q as Record<string, unknown>;
  const candidates = [
    'descricao_habilidade',
    'habilidade_descricao',
    'skill_description',
    'texto_habilidade',
    'bncc_description',
  ];
  for (const k of candidates) {
    const t = strUnknown(rec[k]);
    if (t && !isPlaceholderHabilidadeText(t)) return t;
  }
  return '';
}

/** Descrição para tooltip: habilidade plana (se útil) ou textos em skills[]. */
function habilidadeTooltipFromQuestao(
  q: DisciplinaTabela['questoes'][number]
): string {
  const direct = (q.habilidade ?? '').trim();
  if (!isPlaceholderHabilidadeText(direct)) return direct;
  const fromPlano = descricaoHabilidadeFromQuestaoPlana(q);
  if (fromPlano) return fromPlano;
  const parts: string[] = [];
  for (const s of q.skills ?? []) {
    const { description } = parseSkillEntry(s);
    if (description && !isPlaceholderHabilidadeText(description)) parts.push(description);
  }
  if (parts.length > 0) return parts.join(' · ');
  return '';
}

function codigoHabilidadeResolvido(
  q: DisciplinaTabela['questoes'][number]
): string {
  const flat = (q.codigo_habilidade ?? '').trim();
  if (flat && !isPlaceholderHabilidadeText(flat)) return flat;
  const codes: string[] = [];
  for (const s of q.skills ?? []) {
    const { code } = parseSkillEntry(s);
    if (code && !isPlaceholderHabilidadeText(code)) codes.push(code);
  }
  if (codes.length > 0) return codes.join(', ');
  return flat;
}

function normalizeSkillIdKey(u: string): string {
  return u.replace(/[{}]/g, '').trim().toLowerCase();
}

/** Mapa código/id → descrição a partir de GET /skills/evaluation/:id (cartão resposta). */
function buildSkillDescriptionLookup(
  skills: Array<{ id?: string | null; code?: string; description?: string }> | null
): Map<string, string> {
  const m = new Map<string, string>();
  if (!skills?.length) return m;
  for (const s of skills) {
    const desc = (s.description ?? '').trim();
    if (!desc || isPlaceholderHabilidadeText(desc)) continue;
    const code = (s.code ?? '').trim();
    if (code) {
      m.set(code, desc);
      m.set(code.toUpperCase(), desc);
    }
    const id = s.id != null ? String(s.id).trim() : '';
    if (id) {
      m.set(id, desc);
      m.set(normalizeSkillIdKey(id), desc);
    }
  }
  return m;
}

/** Resolve descrições para um ou mais códigos (ex.: "EF05LP03, EF05LP04"). */
function descriptionFromSkillLookup(codigoHabilidade: string, lookup: Map<string, string>): string {
  if (!lookup.size || !codigoHabilidade.trim()) return '';
  const segments = codigoHabilidade
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const seg of segments) {
    const d =
      lookup.get(seg) ||
      lookup.get(seg.toUpperCase()) ||
      lookup.get(normalizeSkillIdKey(seg));
    if (d && !isPlaceholderHabilidadeText(d)) out.push(d);
  }
  return out.length > 0 ? out.join(' · ') : '';
}

interface RankingItem {
  posicao: number;
  student_id: string;
  nome: string;
  escola_id: string | null;
  escola: string;
  serie: string;
  turma: string;
  grade: number;
  proficiency: number;
  classification: string;
  score_percentage: number;
  total_acertos: number;
  total_respondidas: number;
  total_questoes: number;
}

interface ResultadosAgregadosResponse {
  nivel_granularidade?: string;
  filtros_aplicados?: Record<string, string>;
  estatisticas_gerais: EstatisticasGerais;
  resultados_por_disciplina?: ResultadoPorDisciplina[];
  resultados_detalhados?: {
    gabaritos: GabaritoAgregado[];
    paginacao?: { page: number; per_page: number; total: number; total_pages: number };
  };
  tabela_detalhada?: {
    disciplinas?: DisciplinaTabela[];
    geral?: { alunos: GeralAluno[] };
  };
  ranking?: RankingItem[];
}

const norm = (o: FilterOption) => o.nome ?? o.name ?? o.titulo ?? o.id;

const FILTERS_STORAGE_KEY = 'answer_sheet_results_filters';
const RESULTADOS_AGREGADOS_PER_PAGE = 200;

type AnswerSheetStoredFilters = {
  estado: string;
  municipio: string;
  /** '' ou `YYYY-MM` — mês da correção (`corrected_at`). */
  periodo: string;
  gabarito: string;
  escola: string;
  serie: string;
  turma: string;
};

type AnswerSheetResultsProps = { hidePageHeading?: boolean };

export default function AnswerSheetResults({ hidePageHeading = false }: AnswerSheetResultsProps = {}) {
  const navigate = useNavigate();
  const { toast } = useToast();

  /** Pula a 1ª execução do efeito de persistência (estado inicial antes da hidratação). */
  const isFirstSaveEffectRunRef = useRef(true);

  // Filtros (cascata: estado -> municipio -> gabarito -> escola -> serie -> turma)
  const [estado, setEstado] = useState<string>('all');
  const [municipio, setMunicipio] = useState<string>('all');
  /** `all` = sem filtro; senão `YYYY-MM` (mês da correção). */
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [periodDraft, setPeriodDraft] = useState<{ y: number; m: number }>(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [gabarito, setGabarito] = useState<string>('all');
  const [escola, setEscola] = useState<string>('all');
  const [serie, setSerie] = useState<string>('all');
  const [turma, setTurma] = useState<string>('all');

  // Opções dos filtros (carregadas em cascata)
  const [opcoes, setOpcoes] = useState<OpcoesFiltrosResponse>({});
  const [pickerGabaritos, setPickerGabaritos] = useState<FilterOption[]>([]);
  const [pickerSeriesDisponiveis, setPickerSeriesDisponiveis] = useState<FilterOption[]>([]);
  const [pickerModalLoading, setPickerModalLoading] = useState(false);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);

  // Dados agregados
  const [apiData, setApiData] = useState<ResultadosAgregadosResponse | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Habilidades do gabarito (GET /skills/evaluation/:id) — descrição por código quando o JSON agregado só manda code. */
  const [gabaritoEvaluationSkills, setGabaritoEvaluationSkills] = useState<
    Array<{ id?: string | null; code?: string; description?: string }> | null
  >(null);

  const user = useAuth((s) => s.user);
  const [userHierarchyContext, setUserHierarchyContext] = useState<UserHierarchyContext | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setUserHierarchyContext(null);
      return;
    }
    const rolesNeedHierarchy = ['professor', 'diretor', 'coordenador'];
    if (!user.role || !rolesNeedHierarchy.includes(user.role)) {
      setUserHierarchyContext(null);
      return;
    }
    let cancelled = false;
    getUserHierarchyContext(user.id, user.role)
      .then((ctx) => {
        if (!cancelled) setUserHierarchyContext(ctx);
      })
      .catch(() => {
        if (!cancelled) setUserHierarchyContext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role]);

  const adminCityIdQuery = useMemo(
    () => cityIdQueryParamForAdmin(user?.role, municipio !== 'all' ? municipio : undefined),
    [user?.role, municipio]
  );

  const skillDescriptionLookup = useMemo(
    () => buildSkillDescriptionLookup(gabaritoEvaluationSkills),
    [gabaritoEvaluationSkills]
  );

  // UI: modo de visualização na aba Tabelas (tabela vs cards) e modal de faltosos
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [showAbsentStudentsModal, setShowAbsentStudentsModal] = useState(false);
  const [absentStudentsModalSearch, setAbsentStudentsModalSearch] = useState('');

  const loadFiltersFromStorage = useCallback((): AnswerSheetStoredFilters | null => {
    try {
      let stored = sessionStorage.getItem(FILTERS_STORAGE_KEY);
      if (!stored) {
        const legacy = localStorage.getItem(FILTERS_STORAGE_KEY);
        if (legacy) {
          sessionStorage.setItem(FILTERS_STORAGE_KEY, legacy);
          localStorage.removeItem(FILTERS_STORAGE_KEY);
          stored = legacy;
        }
      }
      if (!stored) return null;
      const f = JSON.parse(stored) as Record<string, unknown>;
      const periodoStored = typeof f.periodo === 'string' ? f.periodo : '';
      if (
        typeof f.estado === 'string' &&
        typeof f.municipio === 'string' &&
        typeof f.gabarito === 'string' &&
        typeof f.escola === 'string' &&
        typeof f.serie === 'string' &&
        typeof f.turma === 'string'
      ) {
        return {
          estado: f.estado || 'all',
          municipio: f.municipio || 'all',
          periodo: (() => {
            const n = normalizeResultsPeriodYm(periodoStored);
            return n === 'all' ? '' : n;
          })(),
          gabarito: f.gabarito || 'all',
          escola: f.escola || 'all',
          serie: f.serie || 'all',
          turma: f.turma || 'all',
        };
      }
      sessionStorage.removeItem(FILTERS_STORAGE_KEY);
      return null;
    } catch {
      try {
        sessionStorage.removeItem(FILTERS_STORAGE_KEY);
        localStorage.removeItem(FILTERS_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return null;
    }
  }, []);

  const saveFiltersToStorage = useCallback(() => {
    try {
      const payload: AnswerSheetStoredFilters & { timestamp: number } = {
        estado,
        municipio,
        periodo: selectedPeriod === 'all' ? '' : selectedPeriod,
        gabarito,
        escola,
        serie,
        turma,
        timestamp: Date.now(),
      };
      sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error('Erro ao salvar filtros (cartão resposta):', e);
    }
  }, [estado, municipio, selectedPeriod, gabarito, escola, serie, turma]);

  useEffect(() => {
    const saved = loadFiltersFromStorage();
    if (saved) {
      setEstado(saved.estado);
      setMunicipio(saved.municipio);
      const pNorm = normalizeResultsPeriodYm(saved.periodo ?? '');
      setSelectedPeriod(pNorm === 'all' ? 'all' : pNorm);
      setGabarito(saved.gabarito);
      setEscola(saved.escola);
      setSerie(saved.serie);
      setTurma(saved.turma);
    }
  }, [loadFiltersFromStorage]);

  useEffect(() => {
    if (isFirstSaveEffectRunRef.current) {
      isFirstSaveEffectRunRef.current = false;
      return;
    }
    saveFiltersToStorage();
  }, [estado, municipio, selectedPeriod, gabarito, escola, serie, turma, saveFiltersToStorage]);

  const normalizedSelectedPeriod = useMemo(
    () => (selectedPeriod === 'all' ? 'all' : normalizeResultsPeriodYm(selectedPeriod)),
    [selectedPeriod]
  );

  const periodoApi = normalizedSelectedPeriod === 'all' ? undefined : normalizedSelectedPeriod;

  const periodCalendarSelected = useMemo(() => {
    if (normalizedSelectedPeriod === 'all') return undefined;
    return parse(`${normalizedSelectedPeriod}-01`, 'yyyy-MM-dd', new Date());
  }, [normalizedSelectedPeriod]);

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

  const applyPeriodYmAndResetCascade = useCallback((ymRaw: string) => {
    const p = normalizeResultsPeriodYm(ymRaw);
    if (p === 'all') return;
    setSelectedPeriod(p);
    setGabarito('all');
    setEscola('all');
    setSerie('all');
    setTurma('all');
  }, []);

  const clearPeriodAndResetCascade = useCallback(() => {
    setSelectedPeriod('all');
    setGabarito('all');
    setEscola('all');
    setSerie('all');
    setTurma('all');
    setPeriodPickerOpen(false);
  }, []);

  // Carregar opções de filtros (cascata da página)
  const fetchOpcoesFiltros = useCallback(async () => {
    const params = new URLSearchParams();
    if (estado && estado !== 'all') params.set('estado', estado);
    if (municipio && municipio !== 'all') params.set('municipio', municipio);
    if (periodoApi) params.set('periodo', periodoApi);
    if (gabarito && gabarito !== 'all') params.set('gabarito', gabarito);
    if (escola && escola !== 'all') params.set('escola', escola);
    if (serie && serie !== 'all') params.set('serie', serie);
    if (turma && turma !== 'all') params.set('turma', turma);
    const query = params.toString();
    try {
      setIsLoadingFilters(true);
      const url = `/answer-sheets/opcoes-filtros-results${query ? `?${query}` : ''}`;
      const res = await api.get<OpcoesFiltrosResponse>(url);
      setOpcoes(res.data || {});
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err && typeof (err as { response?: { data?: { message?: string } } }).response?.data?.message === 'string'
        ? (err as { response: { data: { message: string } } }).response.data.message
        : 'Não foi possível carregar os filtros.';
      toast({
        title: 'Erro',
        description: message,
        variant: 'destructive',
      });
      setOpcoes({});
    } finally {
      setIsLoadingFilters(false);
    }
  }, [estado, municipio, periodoApi, gabarito, escola, serie, turma, toast]);

  // Lista do modal: apenas estado, município e período (filtros anteriores)
  const fetchPickerGabaritos = useCallback(
    async (modalFilters?: { serieFiltro: string; nome: string }) => {
      if (!estado || estado === 'all' || !municipio || municipio === 'all') {
        setPickerGabaritos([]);
        setPickerSeriesDisponiveis([]);
        return;
      }
      const params = new URLSearchParams();
      params.set('estado', estado);
      params.set('municipio', municipio);
      if (periodoApi) params.set('periodo', periodoApi);
      if (modalFilters?.serieFiltro && modalFilters.serieFiltro !== 'all') {
        params.set('serie_filtro', modalFilters.serieFiltro);
      }
      if (modalFilters?.nome?.trim()) params.set('nome', modalFilters.nome.trim());
      try {
        setPickerModalLoading(true);
        const url = `/answer-sheets/opcoes-filtros-results?${params.toString()}`;
        const res = await api.get<OpcoesFiltrosResponse>(url);
        const data = res.data || {};
        setPickerGabaritos(data.gabaritos ?? []);
        if (!modalFilters) setPickerSeriesDisponiveis(data.series_disponiveis ?? []);
      } catch {
        setPickerGabaritos([]);
      } finally {
        setPickerModalLoading(false);
      }
    },
    [estado, municipio, periodoApi]
  );

  useEffect(() => {
    fetchOpcoesFiltros();
  }, [fetchOpcoesFiltros]);

  // Reset em cascata ao mudar filtro superior
  const setEstadoAndReset = (v: string) => {
    setEstado(v);
    setMunicipio('all');
    setSelectedPeriod('all');
    setGabarito('all');
    setEscola('all');
    setSerie('all');
    setTurma('all');
  };
  const setMunicipioAndReset = (v: string) => {
    setMunicipio(v);
    setSelectedPeriod('all');
    setGabarito('all');
    setEscola('all');
    setSerie('all');
    setTurma('all');
  };
  const setGabaritoAndReset = (v: string) => {
    setGabarito(v);
    setEscola('all');
    setSerie('all');
    setTurma('all');
  };
  const setEscolaAndReset = (v: string) => {
    setEscola(v);
    setSerie('all');
    setTurma('all');
  };
  const setSerieAndReset = (v: string) => {
    setSerie(v);
    setTurma('all');
  };

  // Carregar resultados agregados (estado, município e cartão resposta obrigatórios)
  const loadResultadosAgregados = useCallback(async () => {
    if (!estado || estado === 'all' || !municipio || municipio === 'all' || !gabarito || gabarito === 'all') {
      setApiData(null);
      setGabaritoEvaluationSkills(null);
      return;
    }
    const params = new URLSearchParams();
    params.set('estado', estado);
    params.set('municipio', municipio);
    params.set('gabarito', gabarito);
    params.set('page', '1');
    params.set('per_page', String(RESULTADOS_AGREGADOS_PER_PAGE));
    if (periodoApi) params.set('periodo', periodoApi);
    if (escola && escola !== 'all') params.set('escola', escola);
    if (serie && serie !== 'all') params.set('serie', serie);
    if (turma && turma !== 'all') params.set('turma', turma);
    const skillsParams = {
      report_entity_type: REPORT_ENTITY_TYPE_ANSWER_SHEET,
      cityId: municipio,
      ...(adminCityIdQuery ? { city_id: adminCityIdQuery } : {}),
    } as const;
    try {
      setIsLoadingData(true);
      setError(null);
      const [res, skillsRaw] = await Promise.all([
        api.get<ResultadosAgregadosResponse>(`/answer-sheets/resultados-agregados?${params.toString()}`),
        EvaluationResultsApiService.getSkillsByEvaluation(gabarito, skillsParams).catch(() => []),
      ]);
      setApiData(res.data);
      setGabaritoEvaluationSkills(Array.isArray(skillsRaw) ? skillsRaw : []);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err && typeof (err as { response?: { data?: { message?: string } } }).response?.data?.message === 'string'
        ? (err as { response: { data: { message: string } } }).response.data.message
        : 'Não foi possível carregar os resultados.';
      setError(msg);
      setApiData(null);
      setGabaritoEvaluationSkills(null);
      toast({
        title: 'Erro',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setIsLoadingData(false);
    }
  }, [estado, municipio, gabarito, periodoApi, escola, serie, turma, toast, adminCityIdQuery]);

  useEffect(() => {
    loadResultadosAgregados();
  }, [loadResultadosAgregados]);

  const handleBack = () => navigate('/app/cartao-resposta');

  // Gráficos: usar por_disciplina aninhado em estatisticas_gerais (formato esperado por ResultsCharts).
  // Fallback para resultados_por_disciplina (raiz) caso o backend ainda não envie em estatisticas_gerais.
  const chartsApiData = useMemo(() => {
    if (!apiData?.estatisticas_gerais) return null;
    const porDisciplinaFromStats = apiData.estatisticas_gerais.por_disciplina;
    const porDisciplina =
      Array.isArray(porDisciplinaFromStats) && porDisciplinaFromStats.length > 0
        ? porDisciplinaFromStats
        : (apiData.resultados_por_disciplina ?? []);
    const porDisciplinaNormalized = porDisciplina.map((d) => ({
      disciplina: d.disciplina,
      media_nota: d.media_nota ?? 0,
      media_proficiencia: d.media_proficiencia ?? 0,
      distribuicao_classificacao: d.distribuicao_classificacao,
    }));
    return {
      estatisticas_gerais: {
        tipo: apiData.estatisticas_gerais.tipo,
        media_nota_geral: apiData.estatisticas_gerais.media_nota_geral ?? 0,
        media_proficiencia_geral: apiData.estatisticas_gerais.media_proficiencia_geral ?? 0,
        distribuicao_classificacao_geral: apiData.estatisticas_gerais.distribuicao_classificacao_geral,
        por_disciplina: porDisciplinaNormalized,
      },
    };
  }, [apiData]);

  const evaluationInfo = useMemo(() => {
    if (!apiData?.estatisticas_gerais) return null;
    const e = apiData.estatisticas_gerais;
    return {
      id: '',
      titulo: e.nome ?? 'Resultados',
      disciplina: '',
      serie: e.serie ?? '',
      escola: e.escola ?? '',
      municipio: e.municipio ?? '',
      estado: e.estado ?? '',
      data_aplicacao: '',
      total_alunos: e.total_alunos ?? 0,
      alunos_participantes: e.alunos_participantes ?? 0,
      alunos_ausentes: e.alunos_ausentes ?? 0,
      media_nota: e.media_nota_geral ?? 0,
      media_proficiencia: e.media_proficiencia_geral ?? 0,
    };
  }, [apiData]);

  const inferStageGroup = useCallback((): 'group1' | 'group2' => 'group2', []);
  const getMaxForDiscipline = useCallback(() => 400, []);

  const estados = opcoes.estados ?? [];
  const municipios = opcoes.municipios ?? [];
  const gabaritos = opcoes.gabaritos ?? [];
  const escolas = opcoes.escolas ?? [];
  const series = opcoes.series ?? [];
  const turmas = opcoes.turmas ?? [];

  const pickerGabaritoItems = useMemo(() => {
    const base = pickerGabaritos.length > 0 ? pickerGabaritos : gabaritos;
    if (gabarito === 'all' || base.some((g) => g.id === gabarito)) return base;
    const selected = gabaritos.find((g) => g.id === gabarito);
    return selected ? [...base, selected] : base;
  }, [pickerGabaritos, gabaritos, gabarito]);

  const pickerContextLines = useMemo(
    () =>
      buildPickerContextLines({
        estado: estado === 'all' ? undefined : norm(estados.find((e) => e.id === estado) ?? { id: estado }),
        municipio:
          municipio === 'all'
            ? undefined
            : norm(municipios.find((m) => m.id === municipio) ?? { id: municipio }),
        periodo: periodoApi,
      }),
    [estado, municipio, periodoApi, estados, municipios]
  );

  const disciplinasTabela = useMemo(() => apiData?.tabela_detalhada?.disciplinas ?? [], [apiData?.tabela_detalhada?.disciplinas]);
  const ranking = useMemo(() => apiData?.ranking ?? [], [apiData?.ranking]);
  const geralAlunos = useMemo(() => {
    const fromApi = apiData?.tabela_detalhada?.geral?.alunos ?? [];
    if (fromApi.length > 0) return fromApi;
    if (!disciplinasTabela.length) return [];
    return buildGeralAlunosFromDisciplinasAndRanking(disciplinasTabela, ranking);
  }, [apiData?.tabela_detalhada?.geral?.alunos, disciplinasTabela, ranking]);

  /** Ranking = `apiData.ranking[]` do backend (posição e critério do servidor), como na avaliação online. */
  const rankingStudents = useMemo(() => {
    if (!apiData?.ranking?.length) return [];
    return normalizeEvaluationResultsRanking(apiData.ranking as unknown[]).map((r) => ({
      id: r.id,
      nome: r.nome,
      turma: r.turma,
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

  const hasMinimumFilters =
    estado && estado !== 'all' &&
    municipio && municipio !== 'all' &&
    gabarito && gabarito !== 'all';

  const goToAnswerSheetStudentDetail = useCallback(
    (studentRowId: string) => {
      if (!hasMinimumFilters) return;
      navigate(
        buildAnswerSheetStudentDetailHref(gabarito, studentRowId, {
          estado,
          municipio,
          escola: escola && escola !== 'all' ? escola : undefined,
          serie: serie && serie !== 'all' ? serie : undefined,
          turma: turma && turma !== 'all' ? turma : undefined,
          periodo: periodoApi,
        })
      );
    },
    [navigate, hasMinimumFilters, estado, municipio, gabarito, escola, serie, turma, periodoApi]
  );

  // Métricas gerais: sempre de `estatisticas_gerais` do payload (sem recalcular no frontend)
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

  // Alunos faltosos/pendentes — fonte oficial: `estatisticas_gerais.alunos_pendentes_detalhe` (backend).
  // Fallback (compatibilidade): filtrar `tabela_detalhada.geral.alunos` por `status_geral !== 'concluida'`.
  const absentStudents = useMemo<AlunoPendenteDetalhe[]>(() => {
    const detalhe = apiData?.estatisticas_gerais?.alunos_pendentes_detalhe;
    if (Array.isArray(detalhe) && detalhe.length > 0) {
      return detalhe.map((a, i) => ({
        id: String(a.id ?? `sem-id-${i}`),
        nome: String(a.nome ?? ''),
        escola: a.escola,
        serie: a.serie,
        turma: a.turma,
      }));
    }
    return geralAlunos
      .filter((a) => (a.status_geral || '').toLowerCase() !== 'concluida')
      .map((a) => ({
        id: a.id,
        nome: a.nome ?? '',
        escola: a.escola,
        serie: a.serie,
        turma: a.turma,
      }));
  }, [apiData?.estatisticas_gerais?.alunos_pendentes_detalhe, geralAlunos]);

  const filteredAbsentStudents = useMemo(() => {
    const q = absentStudentsModalSearch.trim();
    if (!q) return absentStudents;
    const parsed = parsePendingStudentSearchInput(q);
    const n = normalizePendingStudentSearchText;

    if (parsed.kind === 'general' && !parsed.needle) return absentStudents;

    return absentStudents.filter((a) => {
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
  }, [absentStudents, absentStudentsModalSearch]);

  const absentStudentsSearchPlaceholder = useMemo(
    () =>
      getPendingStudentsSearchPlaceholder(
        apiData?.nivel_granularidade ?? apiData?.estatisticas_gerais?.tipo
      ),
    [apiData?.nivel_granularidade, apiData?.estatisticas_gerais?.tipo]
  );

  // Lista unificada para Ranking e Cards: partir de geral.alunos e enriquecer com ranking (posição)
  const filteredStudents = useMemo(() => {
    const byId = new Map<string, {
      id: string;
      nome: string;
      turma: string;
      escola?: string;
      serie?: string;
      nota: number;
      proficiencia: number;
      classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
      status: 'concluida' | 'pendente';
      posicao?: number;
      questoes_respondidas: number;
      acertos: number;
      erros: number;
      em_branco: number;
      tempo_gasto: number;
    }>();
    ranking.forEach((r, idx) => {
      const classNorm = (r.classification || 'Básico') as 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
      byId.set(r.student_id, {
        id: r.student_id,
        nome: r.nome ?? '',
        turma: '',
        escola: '',
        serie: '',
        nota: r.grade ?? 0,
        proficiencia: r.proficiency ?? 0,
        classificacao: classNorm,
        // Só marca como concluída após conciliar com `geral.alunos`.
        // Evita que faltosos/pendentes vindos no payload de ranking apareçam indevidamente.
        status: 'pendente',
        posicao: r.posicao ?? idx + 1,
        questoes_respondidas: 0,
        acertos: 0,
        erros: 0,
        em_branco: 0,
        tempo_gasto: 0,
      });
    });
    geralAlunos.forEach((a) => {
      const concluida = (a.status_geral || '').toLowerCase() === 'concluida';
      const erros = Math.max(0, (a.total_questoes_geral ?? 0) - (a.total_acertos_geral ?? 0) - (a.total_em_branco_geral ?? 0));
      const existing = byId.get(a.id);
      if (existing) {
        existing.turma = a.turma ?? '';
        existing.escola = a.escola;
        existing.serie = a.serie;
        existing.questoes_respondidas = a.total_respondidas_geral ?? 0;
        existing.acertos = a.total_acertos_geral ?? 0;
        existing.erros = erros;
        existing.em_branco = a.total_em_branco_geral ?? 0;
        existing.status = concluida ? 'concluida' : 'pendente';
        return;
      }
      byId.set(a.id, {
        id: a.id,
        nome: a.nome ?? '',
        turma: a.turma ?? '',
        escola: a.escola,
        serie: a.serie,
        nota: a.nota_geral ?? 0,
        proficiencia: a.proficiencia_geral ?? 0,
        classificacao: (a.nivel_proficiencia_geral as 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado') || 'Básico',
        status: concluida ? 'concluida' : 'pendente',
        questoes_respondidas: a.total_respondidas_geral ?? 0,
        acertos: a.total_acertos_geral ?? 0,
        erros,
        em_branco: a.total_em_branco_geral ?? 0,
        tempo_gasto: 0,
      });
    });
    return Array.from(byId.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [ranking, geralAlunos]);

  /** Participantes com correção concluída (ex.: cards na aba Tabelas e ranking — sem faltosos/pendentes) */
  const studentsParticipantesTabelas = useMemo(
    () => filteredStudents.filter((s) => s.status === 'concluida'),
    [filteredStudents]
  );

  // Dados no formato esperado por ClassStatistics (avaliacoes = gabaritos, geral = geralAlunos)
  const apiDataForClassStatistics = useMemo(() => {
    if (!apiData) return null;
    const gabaritos = apiData.resultados_detalhados?.gabaritos ?? [];
    const avaliacoes = gabaritos.map((g) => ({
      id: g.id,
      titulo: g.titulo ?? '',
      serie: g.serie,
      turma: g.turma,
      escola: g.escola,
      escola_id: g.escola_id,
      total_alunos: g.total_alunos ?? 0,
      alunos_participantes: g.alunos_participantes ?? 0,
      alunos_pendentes:
        g.alunos_pendentes ??
        Math.max(0, (g.total_alunos ?? 0) - (g.alunos_participantes ?? 0)),
      alunos_ausentes: g.alunos_ausentes ?? 0,
      percentual_comparecimento: g.percentual_comparecimento,
      media_nota: g.media_nota ?? 0,
      media_proficiencia: g.media_proficiencia ?? 0,
      media_nota_lingua_portuguesa: g.media_nota_lingua_portuguesa,
      media_nota_matematica: g.media_nota_matematica,
      medias_por_disciplina: g.medias_por_disciplina,
      distribuicao_classificacao: g.distribuicao_classificacao,
      nivel_classificacao: g.nivel_classificacao,
    }));
    const alunosParaStats = geralAlunos.map((a) => ({
      id: a.id,
      nome: a.nome ?? '',
      turma: a.turma ?? '',
      nivel_proficiencia_geral: a.nivel_proficiencia_geral ?? '',
      nota_geral: a.nota_geral ?? 0,
      proficiencia_geral: a.proficiencia_geral ?? 0,
      total_acertos_geral: a.total_acertos_geral ?? 0,
      total_erros_geral: Math.max(0, (a.total_questoes_geral ?? 0) - (a.total_acertos_geral ?? 0) - (a.total_em_branco_geral ?? 0)),
      total_respondidas_geral: a.total_respondidas_geral ?? 0,
    }));
    return {
      nivel_granularidade: (apiData.nivel_granularidade as 'municipio' | 'escola' | 'serie' | 'turma' | 'avaliacao') ?? 'escola',
      resultados_detalhados: { avaliacoes },
      estatisticas_gerais: apiData.estatisticas_gerais,
      tabela_detalhada: {
        disciplinas: disciplinasTabela.map((d) => ({
          id: d.id,
          nome: d.nome,
          alunos: (d.alunos ?? []).map((a) => ({
            id: a.id,
            nome: a.nome ?? '',
            turma: a.turma ?? '',
            nivel_proficiencia: a.nivel_proficiencia ?? '',
            nota: a.nota ?? 0,
            proficiencia: a.proficiencia ?? 0,
            total_acertos: a.total_acertos ?? 0,
            total_erros: a.total_erros ?? 0,
            total_respondidas: a.total_respondidas ?? 0,
          })),
        })),
        geral: { alunos: alunosParaStats },
      },
    };
  }, [apiData, geralAlunos, disciplinasTabela]);

  const isMunicipioScope =
    apiData?.estatisticas_gerais?.tipo === 'municipio' || apiData?.nivel_granularidade === 'municipio';
  const tituloGabaritoFromFilters =
    gabarito !== 'all' ? norm(gabaritos.find((g) => g.id === gabarito) ?? { id: gabarito }) : null;
  const tituloGabaritoFromApi = apiData?.resultados_detalhados?.gabaritos?.[0]?.titulo ?? null;
  const tituloGabarito = (
    isMunicipioScope
      ? (tituloGabaritoFromFilters ?? tituloGabaritoFromApi)
      : (tituloGabaritoFromApi ?? tituloGabaritoFromFilters)
  ) ?? 'Cartão Resposta';
  const hasNoData = !apiData?.resultados_detalhados?.gabaritos?.length && !geralAlunos.length && !disciplinasTabela.length;
  const totalQuestionsForCards = geralAlunos.find((a) => (a.total_questoes_geral ?? 0) > 0)?.total_questoes_geral ?? 0;
  const derivedSubjects = useMemo(() => {
    const fromDisciplinas = disciplinasTabela
      .map((d) => d.nome?.trim())
      .filter((n): n is string => Boolean(n));
    if (fromDisciplinas.length > 0) return fromDisciplinas;
    return [tituloGabarito].filter(Boolean);
  }, [disciplinasTabela, tituloGabarito]);

  const rankingPdfFilterLabels = useMemo(
    () => ({
      estado:
        estado === 'all' ? 'Todos' : norm(estados.find((e) => e.id === estado) ?? { id: estado }),
      municipio:
        municipio === 'all'
          ? 'Todos'
          : norm(municipios.find((m) => m.id === municipio) ?? { id: municipio }),
      escola:
        escola === 'all' ? 'Todas' : norm(escolas.find((e) => e.id === escola) ?? { id: escola }),
      serie:
        serie === 'all' ? 'Todas' : norm(series.find((s) => s.id === serie) ?? { id: serie }),
      turma:
        turma === 'all' ? 'Todas' : norm(turmas.find((t) => t.id === turma) ?? { id: turma }),
    }),
    [estado, municipio, escola, serie, turma, estados, municipios, escolas, series, turmas]
  );

  const handleExportRankingPdf = useCallback(async () => {
    if (rankingStudents.length === 0) return;
    try {
      await generateRankingPdf({
        context: 'cartao-resposta',
        escopoTitulo: tituloGabarito,
        filterLabels: rankingPdfFilterLabels,
        cityId: municipio !== 'all' ? municipio : null,
        students: rankingStudents.map((s) => ({
          nome: s.nome,
          turma: s.turma,
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
        maxRows: 100,
        fileNameBase: `ranking-cartao-${tituloGabarito}`,
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
  }, [rankingStudents, rankingPdfFilterLabels, tituloGabarito, municipio, toast]);

  // Mapear tabela_detalhada da API para o formato esperado por DisciplineTables (questões com numero + campos opcionais)
  const tabelaDetalhadaForDisciplineTables = useMemo(() => {
    if (!disciplinasTabela.length && !geralAlunos.length) return null;
    const disciplinas = disciplinasTabela.map((d) => ({
      id: d.id,
      nome: d.nome,
      questoes: (d.questoes || []).map((q) => {
        const codigo = codigoHabilidadeResolvido(q);
        const descTooltip = habilidadeTooltipFromQuestao(q);
        const descPorCodigo = descriptionFromSkillLookup(codigo, skillDescriptionLookup);
        const habilidadeParaHeader =
          descTooltip ||
          descPorCodigo ||
          (codigo && !isPlaceholderHabilidadeText(codigo) ? codigo : '');
        const rawQid = q.question_id != null ? String(q.question_id).trim() : '';
        const question_id = rawQid || `${d.id}-q-${q.numero}`;
        return {
          numero: q.numero,
          habilidade: habilidadeParaHeader,
          codigo_habilidade: codigo,
          question_id,
        };
      }),
      alunos: (d.alunos || []).map((a) => ({
        id: a.id,
        nome: a.nome,
        escola: a.escola ?? '',
        serie: a.serie ?? '',
        turma: a.turma ?? '',
        respostas_por_questao: a.respostas_por_questao ?? [],
        total_acertos: a.total_acertos ?? 0,
        total_erros: a.total_erros ?? 0,
        total_respondidas: a.total_respondidas ?? 0,
        total_questoes_disciplina: a.total_questoes_disciplina ?? 0,
        nivel_proficiencia: a.nivel_proficiencia ?? '',
        nota: a.nota ?? 0,
        proficiencia: a.proficiencia ?? 0,
      })),
    }));
    const geral = geralAlunos.length > 0 ? {
      alunos: geralAlunos.map((a) => ({
        id: a.id,
        nome: a.nome,
        escola: a.escola ?? '',
        serie: a.serie ?? '',
        turma: a.turma ?? '',
        nota_geral: a.nota_geral ?? 0,
        proficiencia_geral: a.proficiencia_geral ?? 0,
        nivel_proficiencia_geral: a.nivel_proficiencia_geral ?? '',
        total_acertos_geral: a.total_acertos_geral ?? 0,
        total_questoes_geral: a.total_questoes_geral ?? 0,
        total_respondidas_geral: a.total_respondidas_geral ?? 0,
        total_em_branco_geral: a.total_em_branco_geral ?? 0,
        percentual_acertos_geral: a.percentual_acertos_geral ?? 0,
        status_geral: a.status_geral ?? '',
      })),
    } : undefined;
    return { disciplinas, geral };
  }, [disciplinasTabela, geralAlunos, skillDescriptionLookup]);

  return (
    <div className={cn('w-full min-w-0 space-y-6', !hidePageHeading && 'pb-8')}>
      {/* Header */}
      <div
        className={cn(
          'flex flex-col gap-4 sm:flex-row sm:items-center',
          hidePageHeading ? 'sm:justify-end' : 'sm:justify-between'
        )}
      >
        {!hidePageHeading && (
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
              <BarChart3 className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
              Resultados dos Cartões Resposta
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Acompanhe o desempenho das correções por estado, município e cartão resposta
            </p>
            {apiData?.estatisticas_gerais && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Nível: {(apiData.nivel_granularidade || apiData.estatisticas_gerais.tipo || 'município').charAt(0).toUpperCase() + (apiData.nivel_granularidade || apiData.estatisticas_gerais.tipo || 'município').slice(1)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {apiData.estatisticas_gerais.nome || apiData.estatisticas_gerais.escola || 'Dados gerais'}
                </span>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-center sm:justify-end gap-2">
          {!hidePageHeading && (
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          )}
          {hasMinimumFilters && (
            <Button variant="outline" onClick={loadResultadosAgregados} disabled={isLoadingData}>
              <RefreshCw className={cn('h-4 w-4 mr-2', isLoadingData && 'animate-spin')} />
              Atualizar
            </Button>
          )}
        </div>
      </div>
      {hidePageHeading && apiData?.estatisticas_gerais && (
        <div className="flex flex-wrap items-center gap-2 -mt-2">
          <Badge variant="outline" className="text-xs">
            Nível: {(apiData.nivel_granularidade || apiData.estatisticas_gerais.tipo || 'município').charAt(0).toUpperCase() + (apiData.nivel_granularidade || apiData.estatisticas_gerais.tipo || 'município').slice(1)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {apiData.estatisticas_gerais.nome || apiData.estatisticas_gerais.escola || 'Dados gerais'}
          </span>
        </div>
      )}

      {/* Filtros */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
          <CardDescription>
            Estado, município e cartão resposta são obrigatórios. Opcionalmente restrinja pelo mês da correção. Refine com escola, série e turma.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-visible">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4 w-full min-w-0">
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <Select value={estado} onValueChange={setEstadoAndReset} disabled={isLoadingFilters}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {estados.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {norm(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Município</label>
              <Select value={municipio} onValueChange={setMunicipioAndReset} disabled={isLoadingFilters || estado === 'all'}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="Selecione o município" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {municipios.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {norm(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Período (mês/ano)</label>
              <Popover open={periodPickerOpen} onOpenChange={setPeriodPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isLoadingFilters || municipio === 'all'}
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
                          applyPeriodYmAndResetCascade(`${y}-${String(mi + 1).padStart(2, '0')}`);
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
                          applyPeriodYmAndResetCascade(`${y}-${String(mi + 1).padStart(2, '0')}`);
                        }}
                      >
                        <SelectTrigger className="h-9 w-full min-w-0">
                          <SelectValue placeholder="Ano" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {Array.from(
                            {
                              length: getResultsPeriodYearMax() - RESULTS_PERIOD_YEAR_MIN + 1,
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
                      applyPeriodYmAndResetCascade(`${y}-${String(m + 1).padStart(2, '0')}`);
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
                          setGabarito('all');
                          setEscola('all');
                          setSerie('all');
                          setTurma('all');
                          setPeriodPickerOpen(false);
                        }
                      }
                    }}
                    initialFocus
                  />
                  <div className="space-y-2 border-t border-border bg-muted/15 px-3 py-2.5 dark:bg-muted/25">
                    <p className="text-center text-xs leading-snug text-muted-foreground">
                      Filtro pelo mês de <strong>correção</strong> (data registrada). Altere mês/ano, use o calendário ou toque
                      em um dia para aplicar e fechar.
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-full text-muted-foreground hover:text-foreground"
                      disabled={selectedPeriod === 'all'}
                      onClick={clearPeriodAndResetCascade}
                    >
                      Limpar período
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <InstrumentPickerField
              label="Cartão resposta"
              value={gabarito}
              onChange={setGabaritoAndReset}
              items={toInstrumentPickerItems(
                pickerGabaritoItems.map((g) => ({ id: g.id, titulo: norm(g) }))
              )}
              seriesOptions={toInstrumentPickerSeries(
                pickerSeriesDisponiveis.length > 0
                  ? pickerSeriesDisponiveis
                  : (opcoes.series_disponiveis ?? [])
              )}
              disabled={isLoadingFilters || municipio === 'all'}
              loading={isLoadingFilters}
              modalLoading={pickerModalLoading}
              placeholder="Selecione o cartão resposta"
              modalTitle="Selecionar cartão resposta"
              allowAll
              allLabel="Todos"
              contextLines={pickerContextLines}
              contextRequiredMessage="Selecione estado e município nos filtros antes de escolher."
              onModalOpen={() => void fetchPickerGabaritos()}
              onModalFiltersChange={(filters) => void fetchPickerGabaritos(filters)}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium">Escola</label>
              <Select value={escola} onValueChange={setEscolaAndReset} disabled={isLoadingFilters || gabarito === 'all'}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="Selecione a escola" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {escolas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {norm(e)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Série</label>
              <Select value={serie} onValueChange={setSerieAndReset} disabled={isLoadingFilters || escola === 'all'}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="Selecione a série" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {series.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {norm(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Turma</label>
              <Select value={turma} onValueChange={setTurma} disabled={isLoadingFilters || serie === 'all'}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="Selecione a turma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {turmas.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {norm(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border col-span-full">
              <p className="text-sm text-muted-foreground">
                <strong>Ordem dos filtros:</strong> Estado → Município → Período (opcional) → Cartão resposta → Escola → Série → Turma
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Sem filtros obrigatórios */}
      {!hasMinimumFilters && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center mb-6">
              <BookOpen className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">Selecione os filtros para continuar</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              Escolha <strong>Estado</strong>, <strong>Município</strong> e <strong>Cartão resposta</strong> nos filtros acima para carregar os resultados.
            </p>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Escola, Série e Turma são opcionais e permitem refinar a visualização.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {hasMinimumFilters && isLoadingData && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground font-medium">Carregando resultados...</p>
            <p className="text-sm text-muted-foreground mt-1">Aguarde enquanto os dados são processados.</p>
          </CardContent>
        </Card>
      )}

      {/* Conteúdo principal: Card Informações + Abas */}
      {hasMinimumFilters && !isLoadingData && apiData && (
        <>
          {/* Card Informações do Cartão Resposta */}
          <Card className="border-0 shadow-sm bg-muted/30 dark:bg-muted/20">
            <CardHeader>
              <CardTitle className="text-lg">Informações do Cartão Resposta</CardTitle>
              <CardDescription>
                {tituloGabarito} ·{' '}
                {isMunicipioScope
                  ? (apiData.estatisticas_gerais.municipio || apiData.estatisticas_gerais.nome || 'Município selecionado')
                  : (apiData.estatisticas_gerais.escola || apiData.estatisticas_gerais.nome || 'Escopo selecionado')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Cartão / Série</div>
                  <div className="font-semibold">{tituloGabarito}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Escola</div>
                  <div className="font-semibold">{apiData.estatisticas_gerais.escola || '—'}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Município</div>
                  <div className="font-semibold">{apiData.estatisticas_gerais.municipio || '—'}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Série</div>
                  <div className="font-semibold">{apiData.estatisticas_gerais.serie || '—'}</div>
                </div>
              </div>
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Total de alunos</div>
                  <div className="text-2xl font-bold text-blue-600">{backendStats.totalAlunos}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Participantes</div>
                  <div className="text-2xl font-bold text-green-600">{backendStats.participantes}</div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-sm font-medium text-muted-foreground">Faltosos / Pendentes</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAbsentStudentsModal(true)}
                      className="h-7 px-2 text-xs text-red-600 hover:text-red-700 dark:hover:text-red-400"
                      aria-label="Ver faltosos"
                    >
                      Ver lista
                    </Button>
                  </div>
                  <div className="text-2xl font-bold text-red-600">{backendStats.pendentes}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Taxa de participação</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {backendStats.percentualComparecimento != null
                      ? `${backendStats.percentualComparecimento.toFixed(1)}%`
                      : '-'}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Nota geral</div>
                  <div className="text-2xl font-bold text-purple-600">{Number(backendStats.mediaNota).toFixed(1)}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Proficiência</div>
                  <div className="text-2xl font-bold text-orange-600">{Number(backendStats.mediaProficiencia).toFixed(1)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Nenhum dado para exibir */}
          {hasNoData ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <FileX className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Nenhum resultado para mostrar</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Não foram encontrados resultados para os filtros selecionados.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Tabs defaultValue="charts" className="w-full">
              <TabsList className="grid w-full grid-cols-4 h-11 bg-muted/50 p-1 rounded-lg">
                <TabsTrigger value="charts" className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Gráficos</TabsTrigger>
                <TabsTrigger value="tables" className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Tabelas</TabsTrigger>
                <TabsTrigger value="statistics" className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Estatísticas</TabsTrigger>
                <TabsTrigger value="ranking" className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">Ranking</TabsTrigger>
              </TabsList>

              <TabsContent value="charts" className="space-y-6 mt-6">
                {chartsApiData ? (
                  <ResultsCharts
                    apiData={chartsApiData}
                    evaluationInfo={evaluationInfo}
                    inferStageGroup={inferStageGroup}
                    getMaxForDiscipline={getMaxForDiscipline}
                  />
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <p className="text-muted-foreground">Não há dados suficientes para gerar os gráficos.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="tables" className="space-y-6 mt-6">
                <Card>
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        Resultados dos Alunos
                        <Badge variant="secondary">{filteredStudents.length} {filteredStudents.length === 1 ? 'aluno' : 'alunos'}</Badge>
                      </CardTitle>
                      <CardDescription>
                        Tabela por disciplina e geral, ou cards só para alunos com correção concluída (sem faltosos/pendentes)
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1 border rounded-lg p-1 bg-muted/30">
                      <Button
                        variant={viewMode === 'table' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setViewMode('table')}
                        className="h-8 px-3"
                      >
                        <Table2 className="h-4 w-4 mr-1.5" />
                        Tabela
                      </Button>
                      <Button
                        variant={viewMode === 'cards' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setViewMode('cards')}
                        className="h-8 px-3"
                      >
                        <LayoutGrid className="h-4 w-4 mr-1.5" />
                        Cards
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {tabelaDetalhadaForDisciplineTables && disciplinasTabela.length > 0 ? (
                      viewMode === 'table' ? (
                        <DisciplineTables
                          tabelaDetalhada={tabelaDetalhadaForDisciplineTables}
                          onViewStudentDetails={goToAnswerSheetStudentDetail}
                        />
                      ) : studentsParticipantesTabelas.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {studentsParticipantesTabelas.map((student) => (
                            <StudentCard
                              key={student.id}
                              student={{
                                id: student.id,
                                nome: student.nome,
                                turma: student.turma,
                                nota: student.nota,
                                proficiencia: student.proficiencia,
                                classificacao: student.classificacao,
                                questoes_respondidas: student.questoes_respondidas,
                                acertos: student.acertos,
                                erros: student.erros,
                                em_branco: student.em_branco,
                                tempo_gasto: student.tempo_gasto,
                                status: student.status,
                              }}
                              totalQuestions={totalQuestionsForCards || 1}
                              subjects={derivedSubjects}
                              onViewDetails={goToAnswerSheetStudentDetail}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <FileX className="h-10 w-10 text-muted-foreground mb-3" />
                          <p className="text-muted-foreground font-medium">Nenhum aluno com correção concluída</p>
                          <p className="text-sm text-muted-foreground mt-1 max-w-md">
                            Faltosos e pendentes não aparecem nos cards. Use a visão em tabela ou o botão &quot;Faltosos&quot; no topo.
                          </p>
                        </div>
                      )
                    ) : geralAlunos.length > 0 ? (
                      viewMode === 'table' ? (
                        <div className="overflow-x-auto rounded-lg border">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Escola</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Turma</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Série</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nota</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Proficiência</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Classificação</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Acertos / Erros</th>
                                <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {geralAlunos.map((a) => {
                                const erros = Math.max(0, (a.total_questoes_geral ?? 0) - (a.total_acertos_geral ?? 0) - (a.total_em_branco_geral ?? 0));
                                const acertos = a.total_acertos_geral ?? 0;
                                const emBranco = a.total_em_branco_geral ?? 0;
                                const totalRespondidas = a.total_respondidas_geral ?? 0;
                                const totalQDerived =
                                  (a.total_questoes_geral ?? 0) ||
                                  (totalRespondidas + emBranco) ||
                                  (acertos + erros + emBranco);
                                const pctLocal = totalQDerived > 0 ? (acertos / totalQDerived) * 100 : 0;
                                const apiPctRaw = (a as unknown as { percentual_acertos_geral?: unknown }).percentual_acertos_geral;
                                const apiPctNum =
                                  typeof apiPctRaw === 'number'
                                    ? apiPctRaw
                                    : typeof apiPctRaw === 'string'
                                      ? Number(apiPctRaw.replace(',', '.'))
                                      : NaN;
                                const pct =
                                  Number.isFinite(apiPctNum) && apiPctNum >= 0
                                    ? apiPctNum
                                    : pctLocal;
                                return (
                                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                    <td className="py-3 px-4 font-medium">{a.nome}</td>
                                    <td className="py-3 px-4 text-muted-foreground">{a.escola ?? '—'}</td>
                                    <td className="py-3 px-4 text-muted-foreground">{a.turma ?? '—'}</td>
                                    <td className="py-3 px-4 text-muted-foreground">{a.serie ?? '—'}</td>
                                    <td className="py-3 px-4">{(a.nota_geral ?? 0).toFixed(1)}</td>
                                    <td className="py-3 px-4">{(a.proficiencia_geral ?? 0).toFixed(1)}</td>
                                    <td className="py-3 px-4">
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          getReportProficiencyTagClass(a.nivel_proficiencia_geral),
                                          !a.nivel_proficiencia_geral && 'opacity-60'
                                        )}
                                      >
                                        {a.nivel_proficiencia_geral || 'Pendente'}
                                      </Badge>
                                    </td>
                                    <td className="py-3 px-4">
                                      {totalQDerived > 0 ? `${acertos} / ${erros} (${pct.toFixed(0)}%)` : `${acertos} / ${erros}`}
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8"
                                        onClick={() => goToAnswerSheetStudentDetail(a.id)}
                                      >
                                        <Eye className="h-3.5 w-3.5 mr-1" />
                                        Detalhes
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : studentsParticipantesTabelas.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {studentsParticipantesTabelas.map((student) => (
                            <StudentCard
                              key={student.id}
                              student={{
                                id: student.id,
                                nome: student.nome,
                                turma: student.turma,
                                nota: student.nota,
                                proficiencia: student.proficiencia,
                                classificacao: student.classificacao,
                                questoes_respondidas: student.questoes_respondidas,
                                acertos: student.acertos,
                                erros: student.erros,
                                em_branco: student.em_branco,
                                tempo_gasto: student.tempo_gasto,
                                status: student.status,
                              }}
                              totalQuestions={totalQuestionsForCards || 1}
                              subjects={derivedSubjects}
                              onViewDetails={goToAnswerSheetStudentDetail}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <FileX className="h-10 w-10 text-muted-foreground mb-3" />
                          <p className="text-muted-foreground font-medium">Nenhum aluno com correção concluída</p>
                          <p className="text-sm text-muted-foreground mt-1 max-w-md">
                            Faltosos e pendentes não aparecem nos cards. Use a visão em tabela ou o botão &quot;Faltosos&quot; no topo.
                          </p>
                        </div>
                      )
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <FileX className="h-10 w-10 text-muted-foreground mb-3" />
                        <p className="text-muted-foreground font-medium">Nenhum aluno no escopo</p>
                        <p className="text-sm text-muted-foreground mt-1">Ajuste os filtros para ver resultados.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="statistics" className="space-y-6 mt-6">
                {apiDataForClassStatistics ? (
                  <ClassStatistics
                    apiData={apiDataForClassStatistics}
                    isMunicipalView={isMunicipioScope}
                    userHierarchy={userHierarchyContext}
                    rankingPdfFilterLabels={rankingPdfFilterLabels}
                    escopoTitulo={tituloGabarito}
                    reportContext="cartao-resposta"
                  />
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <p className="text-muted-foreground">Não há dados para exibir as estatísticas.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="ranking" className="space-y-6 mt-6">
                {rankingStudents.length > 0 ? (
                  <>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 shrink-0"
                        onClick={() => void handleExportRankingPdf()}
                      >
                        <FileText className="h-4 w-4" />
                        Exportar PDF
                      </Button>
                    </div>
                    <StudentRanking
                      students={rankingStudents}
                      maxStudents={100}
                      backendRankingOrder
                    />
                  </>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <FileX className="h-10 w-10 text-muted-foreground mb-3" />
                      <p className="text-muted-foreground font-medium">Nenhum participante para ranking</p>
                      <p className="text-sm text-muted-foreground mt-1">Os alunos que realizarem a correção aparecerão aqui.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          )}
        </>
      )}

      {/* Modal Alunos Faltosos / Pendentes */}
      <Dialog
        open={showAbsentStudentsModal}
        onOpenChange={(open) => {
          setShowAbsentStudentsModal(open);
          if (!open) setAbsentStudentsModalSearch('');
        }}
      >
        <DialogContent className="w-[96vw] max-w-5xl h-[88vh] max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-red-600" />
              Faltosos / Pendentes
              {tituloGabarito && (
                <span className="text-sm font-normal text-muted-foreground ml-1">· {tituloGabarito}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 py-2">
            {absentStudents.length > 0 ? (
              <div className="space-y-4">
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 bg-red-500 dark:bg-red-400 rounded-full shrink-0" />
                    <span className="font-semibold text-red-800 dark:text-red-400">
                      {absentStudents.length} {absentStudents.length === 1 ? 'aluno' : 'alunos'} pendente(s)
                    </span>
                  </div>
                  <p className="text-sm text-red-700 dark:text-red-400">
                    Estes alunos ainda não entregaram ou não tiveram o cartão resposta corrigido.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
                      aria-hidden
                    />
                    <Input
                      type="search"
                      placeholder={absentStudentsSearchPlaceholder}
                      value={absentStudentsModalSearch}
                      onChange={(e) => setAbsentStudentsModalSearch(e.target.value)}
                      className="pl-9"
                      autoComplete="off"
                    />
                  </div>
                  {absentStudentsModalSearch.trim() !== '' && (
                    <p className="text-xs text-muted-foreground">
                      Exibindo {filteredAbsentStudents.length} de {absentStudents.length}{' '}
                      {absentStudents.length === 1 ? 'aluno' : 'alunos'}
                    </p>
                  )}
                  {filteredAbsentStudents.length > 0 ? (
                    <div className="grid gap-3">
                      {filteredAbsentStudents.map((a) => (
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
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum faltoso</h3>
                <p className="text-muted-foreground">
                  Todos os alunos do escopo já têm resultado ou estão como participantes.
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 pt-4 border-t mt-4">
            {absentStudents.length > 0 ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={filteredAbsentStudents.length === 0}
                  onClick={async () => {
                    try {
                      await generatePendingStudentsPdf({
                        title: 'Faltosos / Pendentes — Cartão Resposta',
                        subtitle: tituloGabarito ? String(tituloGabarito) : undefined,
                        cityId: municipio !== 'all' ? municipio : null,
                        students: filteredAbsentStudents.map((a) => ({
                          nome: a.nome,
                          escola: a.escola,
                          turma: a.turma,
                          serie: a.serie,
                          statusLabel: 'Pendente',
                        })),
                        fileName: 'faltosos-pendentes-cartao-resposta',
                      });
                      toast({
                        title: 'PDF gerado com sucesso!',
                        description: 'A lista de faltosos/pendentes foi baixada em PDF.',
                      });
                    } catch {
                      toast({
                        title: 'Erro ao gerar PDF',
                        description: 'Não foi possível gerar o PDF da lista.',
                        variant: 'destructive',
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
            <Button variant="outline" onClick={() => setShowAbsentStudentsModal(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
