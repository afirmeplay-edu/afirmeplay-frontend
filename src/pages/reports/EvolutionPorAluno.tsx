import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Filter,
  RefreshCw,
  Search,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';
import {
  EvaluationResultsApiService,
  resolveEvolucaoAlunosPagination,
  type EvolucaoAlunoItem,
  type EvolucaoAlunoComparison,
  type EvolucaoAlunoEvaluation,
} from '@/services/evaluation/evaluationResultsApi';
import { AnswerSheetComparisonApiService } from '@/services/answer-sheet/answerSheetComparisonApi';
import { EvolutionCharts } from '@/components/evolution/EvolutionCharts';
import { processComparisonData } from '@/utils/evolution/evolutionDataProcessor';
import { studentComparisonToComparisonResponse } from '@/utils/studentComparisonAdapter';

type SourceMode = 'avaliacao' | 'cartao';

interface FilterOption {
  id: string;
  name: string;
}

function extractApiError(error: unknown): string {
  if (error && typeof error === 'object') {
    if ('response' in error) {
      const axiosError = error as { response?: { data?: { error?: string; message?: string } } };
      return axiosError.response?.data?.error || axiosError.response?.data?.message || '';
    }
    if ('message' in error && typeof (error as { message: unknown }).message === 'string') {
      return (error as { message: string }).message;
    }
  }
  return '';
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function getStudentName(student: EvolucaoAlunoItem): string {
  return student.name?.trim() || student.nome?.trim() || 'Aluno sem nome';
}

function resolveStudentMetaLabel(
  student: EvolucaoAlunoItem,
  schools: FilterOption[],
  grades: FilterOption[],
  classes: FilterOption[]
): string[] {
  const parts: string[] = [];
  const schoolLabel =
    student.school_name ||
    (student.school_id ? schools.find((s) => s.id === student.school_id)?.name : undefined);
  const gradeLabel =
    student.grade_name ||
    (student.grade_id ? grades.find((g) => g.id === student.grade_id)?.name : undefined);
  const classLabel =
    student.class_name ||
    (student.class_id ? classes.find((c) => c.id === student.class_id)?.name : undefined);
  if (schoolLabel) parts.push(schoolLabel);
  if (gradeLabel) parts.push(gradeLabel);
  if (classLabel) parts.push(classLabel);
  return parts;
}

function getEvaluationTitle(evaluation: EvolucaoAlunoEvaluation, index: number): string {
  return evaluation.title?.trim() || evaluation.titulo?.trim() || `Avaliação ${index + 1}`;
}

function getStudentKey(student: EvolucaoAlunoItem, index: number): string {
  return student.id || student.student_id || student.user_id || `student-${index}`;
}

function getOverallEvolution(comparisons: EvolucaoAlunoComparison[] | undefined) {
  if (!comparisons?.length) return null;
  const last = comparisons[comparisons.length - 1];
  return (
    last.general_comparison?.student_grade?.evolution ??
    last.general_comparison?.score_percentage?.evolution ??
    null
  );
}

function EvolutionBadge({
  percentage,
  direction,
}: {
  percentage?: number;
  direction?: string;
}) {
  if (percentage == null && !direction) {
    return <span className="text-sm text-muted-foreground">Sem comparação</span>;
  }

  const dir = (direction || 'stable').toLowerCase();
  const value = percentage != null ? Math.abs(percentage) : 0;
  const label = `${formatNumber(value, 1)}%`;

  if (dir === 'increase') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 gap-1">
        <TrendingUp className="h-3.5 w-3.5" />
        ↑ {label}
      </Badge>
    );
  }

  if (dir === 'decrease') {
    return (
      <Badge className="bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-800 gap-1">
        <TrendingDown className="h-3.5 w-3.5" />
        ↓ {label}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Minus className="h-3.5 w-3.5" />
      {label}
    </Badge>
  );
}

export default function EvolutionPorAluno() {
  const { autoLogin } = useAuth();
  const { toast } = useToast();

  const [sourceMode, setSourceMode] = useState<SourceMode>('avaliacao');
  const [selectedState, setSelectedState] = useState('all');
  const [selectedMunicipality, setSelectedMunicipality] = useState('all');
  const [selectedSchool, setSelectedSchool] = useState('all');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [selectedClass, setSelectedClass] = useState('all');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [studentNameSearch, setStudentNameSearch] = useState('');

  const [states, setStates] = useState<FilterOption[]>([]);
  const [municipalities, setMunicipalities] = useState<FilterOption[]>([]);
  const [schools, setSchools] = useState<FilterOption[]>([]);
  const [grades, setGrades] = useState<FilterOption[]>([]);
  const [classes, setClasses] = useState<FilterOption[]>([]);

  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [students, setStudents] = useState<EvolucaoAlunoItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedStudentKey, setSelectedStudentKey] = useState<string | null>(null);

  const prevMunicipalityRef = useRef(selectedMunicipality);
  const prevSchoolRef = useRef(selectedSchool);
  const prevGradeRef = useRef(selectedGrade);
  const prevSourceModeRef = useRef<SourceMode>(sourceMode);

  const fetchOpcoesFiltros = useCallback(
    async (params: { estado?: string; municipio?: string; escola?: string; serie?: string }) => {
      if (sourceMode === 'cartao') {
        return AnswerSheetComparisonApiService.getEvolucaoOpcoesFiltros(params);
      }
      return EvaluationResultsApiService.getEvolucaoOpcoesFiltros(params);
    },
    [sourceMode]
  );

  const loadInitialFilters = useCallback(async () => {
    try {
      setIsLoadingFilters(true);
      const response = await fetchOpcoesFiltros({});
      const list = response.estados ?? [];
      setStates(
        list.map((s) => ({
          id: s.id,
          name: s.nome ?? s.name ?? s.id,
        }))
      );
    } catch (error) {
      console.error('Erro ao carregar filtros (evolução por aluno):', error);
      toast({
        title: 'Erro ao carregar filtros',
        description: 'Não foi possível carregar os filtros. Tente novamente.',
        variant: 'destructive',
      });
      setStates([]);
    } finally {
      setIsLoadingFilters(false);
    }
  }, [fetchOpcoesFiltros, toast]);

  useEffect(() => {
    const initialize = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        try {
          await autoLogin();
        } catch (error) {
          console.error('Erro no login automático:', error);
          toast({
            title: 'Erro de Autenticação',
            description: 'Não foi possível fazer login automático. Verifique suas credenciais.',
            variant: 'destructive',
          });
          return;
        }
      }
      await loadInitialFilters();
    };
    void initialize();
  }, [autoLogin, loadInitialFilters, toast]);

  // Reset ao trocar fonte (online ↔ cartão) — não roda no mount
  useEffect(() => {
    if (prevSourceModeRef.current === sourceMode) return;
    prevSourceModeRef.current = sourceMode;
    setSelectedState('all');
    setSelectedMunicipality('all');
    setSelectedSchool('all');
    setSelectedGrade('all');
    setSelectedClass('all');
    setPeriodStart('');
    setPeriodEnd('');
    setStudentNameSearch('');
    setMunicipalities([]);
    setSchools([]);
    setGrades([]);
    setClasses([]);
    setStudents([]);
    setHasSearched(false);
    setSearchError(null);
    setPage(1);
    setTotal(0);
    setTotalPages(1);
    setSelectedStudentKey(null);
    void loadInitialFilters();
  }, [sourceMode, loadInitialFilters]);

  useEffect(() => {
    const loadMunicipalities = async () => {
      if (selectedState === 'all') {
        setMunicipalities([]);
        setSelectedMunicipality('all');
        setSelectedSchool('all');
        setSelectedGrade('all');
        setSelectedClass('all');
        return;
      }
      try {
        setIsLoadingFilters(true);
        const response = await fetchOpcoesFiltros({ estado: selectedState });
        const list = (response.municipios ?? []).map((m) => ({
          id: m.id,
          name: m.nome ?? m.name ?? m.id,
        }));
        setMunicipalities(list);
        if (selectedMunicipality !== 'all' && !list.some((m) => m.id === selectedMunicipality)) {
          setSelectedMunicipality('all');
          setSelectedSchool('all');
          setSelectedGrade('all');
          setSelectedClass('all');
        }
      } catch (error) {
        console.error('Erro ao carregar municípios:', error);
        setMunicipalities([]);
        toast({
          title: 'Erro ao carregar municípios',
          description: 'Não foi possível carregar os municípios. Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingFilters(false);
      }
    };
    void loadMunicipalities();
  }, [selectedState, fetchOpcoesFiltros, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (prevMunicipalityRef.current !== selectedMunicipality) {
      prevMunicipalityRef.current = selectedMunicipality;
      setSelectedSchool('all');
      setSelectedGrade('all');
      setSelectedClass('all');
    }
  }, [selectedMunicipality]);

  useEffect(() => {
    if (prevSchoolRef.current !== selectedSchool) {
      prevSchoolRef.current = selectedSchool;
      setSelectedGrade('all');
      setSelectedClass('all');
    }
  }, [selectedSchool]);

  useEffect(() => {
    if (prevGradeRef.current !== selectedGrade) {
      prevGradeRef.current = selectedGrade;
      setSelectedClass('all');
    }
  }, [selectedGrade]);

  useEffect(() => {
    const loadSchools = async () => {
      if (selectedState === 'all' || selectedMunicipality === 'all') {
        setSchools([]);
        return;
      }
      try {
        setIsLoadingFilters(true);
        const response = await fetchOpcoesFiltros({
          estado: selectedState,
          municipio: selectedMunicipality,
        });
        setSchools(
          (response.escolas ?? []).map((s) => ({
            id: s.id,
            name: s.nome ?? s.name ?? s.id,
          }))
        );
      } catch (error) {
        console.error('Erro ao carregar escolas:', error);
        setSchools([]);
      } finally {
        setIsLoadingFilters(false);
      }
    };
    void loadSchools();
  }, [selectedState, selectedMunicipality, fetchOpcoesFiltros]);

  useEffect(() => {
    const loadGrades = async () => {
      if (selectedState === 'all' || selectedMunicipality === 'all' || selectedSchool === 'all') {
        setGrades([]);
        return;
      }
      try {
        setIsLoadingFilters(true);
        const response = await fetchOpcoesFiltros({
          estado: selectedState,
          municipio: selectedMunicipality,
          escola: selectedSchool,
        });
        setGrades(
          (response.series ?? []).map((g) => ({
            id: g.id,
            name: g.nome ?? g.name ?? g.id,
          }))
        );
      } catch (error) {
        console.error('Erro ao carregar séries:', error);
        setGrades([]);
      } finally {
        setIsLoadingFilters(false);
      }
    };
    void loadGrades();
  }, [selectedState, selectedMunicipality, selectedSchool, fetchOpcoesFiltros]);

  useEffect(() => {
    const loadClasses = async () => {
      if (
        selectedState === 'all' ||
        selectedMunicipality === 'all' ||
        selectedSchool === 'all' ||
        selectedGrade === 'all'
      ) {
        setClasses([]);
        return;
      }
      try {
        setIsLoadingFilters(true);
        const response = await fetchOpcoesFiltros({
          estado: selectedState,
          municipio: selectedMunicipality,
          escola: selectedSchool,
          serie: selectedGrade,
        });
        setClasses(
          (response.turmas ?? []).map((c) => ({
            id: c.id,
            name: c.nome ?? c.name ?? c.id,
          }))
        );
      } catch (error) {
        console.error('Erro ao carregar turmas:', error);
        setClasses([]);
      } finally {
        setIsLoadingFilters(false);
      }
    };
    void loadClasses();
  }, [selectedState, selectedMunicipality, selectedSchool, selectedGrade, fetchOpcoesFiltros]);

  const searchStudents = useCallback(
    async (pageToLoad = 1) => {
      if (selectedState === 'all' || selectedMunicipality === 'all') {
        toast({
          title: 'Filtros obrigatórios',
          description: 'Selecione pelo menos Estado e Município para buscar alunos.',
          variant: 'destructive',
        });
        return;
      }

      try {
        setIsSearching(true);
        setSearchError(null);
        setHasSearched(true);

        const filters = {
          estado: selectedState,
          municipio: selectedMunicipality,
          escola: selectedSchool !== 'all' ? selectedSchool : undefined,
          serie: selectedGrade !== 'all' ? selectedGrade : undefined,
          turma: selectedClass !== 'all' ? selectedClass : undefined,
          nome_aluno: studentNameSearch.trim() || undefined,
          data_inicio: periodStart || undefined,
          data_fim: periodEnd || undefined,
          page: pageToLoad,
          per_page: perPage,
        };

        const response =
          sourceMode === 'cartao'
            ? await AnswerSheetComparisonApiService.getEvolucaoAlunos(filters)
            : await EvaluationResultsApiService.getEvolucaoAlunos(filters);

        const list = response.students ?? [];
        const pagination = resolveEvolucaoAlunosPagination(response, pageToLoad, perPage, list.length);
        setStudents(list);
        setPage(pagination.page);
        setTotal(pagination.total);
        setTotalPages(pagination.total_pages);

        const firstWithCharts = list.findIndex((s) => (s.comparisons?.length ?? 0) > 0);
        const autoIndex = firstWithCharts >= 0 ? firstWithCharts : 0;
        setSelectedStudentKey(list.length > 0 ? getStudentKey(list[autoIndex], autoIndex) : null);
      } catch (error) {
        console.error('Erro ao buscar evolução por aluno:', error);
        const message =
          extractApiError(error) || 'Não foi possível carregar a evolução dos alunos. Tente novamente.';
        setSearchError(message);
        setStudents([]);
        setTotal(0);
        setTotalPages(1);
        setSelectedStudentKey(null);
        toast({
          title: 'Erro ao buscar alunos',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setIsSearching(false);
      }
    },
    [
      selectedState,
      selectedMunicipality,
      selectedSchool,
      selectedGrade,
      selectedClass,
      studentNameSearch,
      periodStart,
      periodEnd,
      perPage,
      sourceMode,
      toast,
    ]
  );

  const canSearch = selectedState !== 'all' && selectedMunicipality !== 'all';

  const selectedStudent = useMemo(() => {
    if (!selectedStudentKey) return null;
    const idx = students.findIndex((s, i) => getStudentKey(s, i) === selectedStudentKey);
    return idx >= 0 ? students[idx] : null;
  }, [students, selectedStudentKey]);

  const selectedStudentProcessedData = useMemo(() => {
    const adapted = studentComparisonToComparisonResponse(selectedStudent);
    return adapted ? processComparisonData(adapted) : null;
  }, [selectedStudent]);

  const instrumentLabel = sourceMode === 'cartao' ? 'gabaritos' : 'avaliações';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-center gap-2 w-full sm:w-auto sm:justify-end">
        <Button
          variant="outline"
          onClick={() => void searchStudents(page)}
          disabled={isSearching || !canSearch}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isSearching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Fonte dos resultados</label>
            <Tabs
              value={sourceMode}
              onValueChange={(v) => setSourceMode(v as SourceMode)}
              className="w-full max-w-md"
            >
              <TabsList className="w-full">
                <TabsTrigger value="avaliacao" className="flex-1">
                  Avaliação online
                </TabsTrigger>
                <TabsTrigger value="cartao" className="flex-1">
                  Cartão-resposta
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <Select value={selectedState} onValueChange={setSelectedState} disabled={isLoadingFilters}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {states.map((state) => (
                    <SelectItem key={state.id} value={state.id}>
                      {state.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Município</label>
              <Select
                value={selectedMunicipality}
                onValueChange={setSelectedMunicipality}
                disabled={isLoadingFilters || selectedState === 'all'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o município" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {municipalities.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Escola</label>
              <Select
                value={selectedSchool}
                onValueChange={setSelectedSchool}
                disabled={isLoadingFilters || selectedMunicipality === 'all'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a escola" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Série</label>
              <Select
                value={selectedGrade}
                onValueChange={setSelectedGrade}
                disabled={isLoadingFilters || selectedSchool === 'all'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a série" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {grades.map((grade) => (
                    <SelectItem key={grade.id} value={grade.id}>
                      {grade.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Turma</label>
              <Select
                value={selectedClass}
                onValueChange={setSelectedClass}
                disabled={isLoadingFilters || selectedGrade === 'all'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a turma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {classes.map((classItem) => (
                    <SelectItem key={classItem.id} value={classItem.id}>
                      {classItem.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedMunicipality !== 'all' && (
            <div className="pt-6 border-t border-border">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Data Início</label>
                  <Input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Data Fim</label>
                  <Input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    min={periodStart}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nome do aluno</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Buscar por nome..."
                      value={studentNameSearch}
                      onChange={(e) => setStudentNameSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && canSearch) void searchStudents(1);
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void searchStudents(1)}
              disabled={!canSearch || isSearching}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            >
              {isSearching ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Buscar
            </Button>
            {!canSearch && (
              <p className="text-sm text-muted-foreground">
                Selecione Estado e Município para consultar a evolução dos alunos.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Evolução por aluno
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasSearched && (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium text-foreground mb-1">Nenhuma busca realizada</p>
              <p className="text-sm">
                Use os filtros acima e clique em Buscar para listar os alunos e a evolução de cada um.
              </p>
            </div>
          )}

          {hasSearched && isSearching && (
            <div className="flex items-center justify-center gap-2 py-12 text-blue-600 dark:text-blue-400">
              <RefreshCw className="h-5 w-5 animate-spin" />
              <span>Carregando evolução dos alunos...</span>
            </div>
          )}

          {hasSearched && !isSearching && searchError && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-red-800 dark:text-red-200">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Não foi possível carregar os resultados</p>
                <p className="text-sm mt-1">{searchError}</p>
              </div>
            </div>
          )}

          {hasSearched && !isSearching && !searchError && students.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium text-foreground mb-1">Nenhum aluno encontrado</p>
              <p className="text-sm">Ajuste os filtros e tente novamente.</p>
            </div>
          )}

          {hasSearched && !isSearching && !searchError && students.length > 0 && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge
                  variant="outline"
                  className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                >
                  {total} aluno(s) encontrado(s)
                </Badge>
                {(sourceMode === 'cartao' ||
                  students.some((s) => s.source_type === 'cartao_resposta')) && (
                  <Badge variant="outline">Cartão-resposta</Badge>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                Selecione um aluno para ver os gráficos de evolução (mesmo formato das outras abas).
              </p>

              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {students.map((student, studentIndex) => {
                  const name = getStudentName(student);
                  const evolution = getOverallEvolution(student.comparisons);
                  const metaParts = resolveStudentMetaLabel(student, schools, grades, classes);
                  const key = getStudentKey(student, studentIndex);
                  const isSelected = selectedStudentKey === key;
                  const hasCharts = (student.comparisons?.length ?? 0) > 0;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedStudentKey(key)}
                      className={`w-full text-left rounded-xl border p-3 sm:p-4 transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border bg-gradient-to-br from-blue-50/60 dark:from-blue-950/20 to-indigo-50/40 dark:to-indigo-950/10 hover:border-primary/40'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-foreground truncate">{name}</h3>
                            {hasCharts ? (
                              <Badge variant="outline" className="gap-1 text-xs shrink-0">
                                <BarChart3 className="h-3 w-3" />
                                Gráficos
                              </Badge>
                            ) : null}
                          </div>
                          {metaParts.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {metaParts.join(' • ')}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                            Evolução
                          </span>
                          <EvolutionBadge
                            percentage={evolution?.percentage}
                            direction={evolution?.direction}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-muted-foreground">
                    Página {page} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || isSearching}
                      onClick={() => void searchStudents(page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages || isSearching}
                      onClick={() => void searchStudents(page + 1)}
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {hasSearched && !isSearching && !searchError && selectedStudent && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                <Users className="h-5 w-5 shrink-0" />
                {getStudentName(selectedStudent)}
              </CardTitle>
              {resolveStudentMetaLabel(selectedStudent, schools, grades, classes).length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {resolveStudentMetaLabel(selectedStudent, schools, grades, classes).join(' • ')}
                </p>
              )}
            </CardHeader>
            <CardContent>
              {(() => {
                const evaluations = [...(selectedStudent.evaluations ?? [])].sort(
                  (a, b) => (a.order ?? 0) - (b.order ?? 0)
                );
                if (evaluations.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground">Sem avaliações neste recorte.</p>
                  );
                }
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {evaluations.map((evaluation, evalIndex) => {
                      const result = evaluation.result;
                      return (
                        <div
                          key={evaluation.id || `sel-eval-${evalIndex}`}
                          className="rounded-lg border border-border/80 bg-background/80 p-3 space-y-2"
                        >
                          <p className="font-medium text-sm text-foreground leading-snug">
                            {getEvaluationTitle(evaluation, evalIndex)}
                          </p>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:text-sm">
                            <span className="text-muted-foreground">Nota</span>
                            <span className="font-medium text-right">{formatNumber(result?.grade)}</span>
                            <span className="text-muted-foreground">Proficiência</span>
                            <span className="font-medium text-right">
                              {formatNumber(result?.proficiency, 0)}
                            </span>
                            <span className="text-muted-foreground">Classificação</span>
                            <span className="font-medium text-right">
                              {result?.classification || '—'}
                            </span>
                            {result?.correct_answers != null && (
                              <>
                                <span className="text-muted-foreground">Acertos</span>
                                <span className="font-medium text-right">
                                  {result.correct_answers}
                                  {result.total_questions != null ? ` / ${result.total_questions}` : ''}
                                  {result.score_percentage != null
                                    ? ` (${formatNumber(result.score_percentage, 0)}%)`
                                    : ''}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {selectedStudentProcessedData ? (
            <EvolutionCharts
              data={selectedStudentProcessedData}
              isLoading={false}
              instrumentLabel={instrumentLabel}
            />
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium text-foreground mb-1">Sem comparação para gráficos</p>
                <p className="text-sm max-w-md mx-auto">
                  Este aluno precisa de pelo menos 2 {instrumentLabel} com resultado neste recorte
                  para exibir os gráficos de evolução (Nota Geral, Proficiência, etc.).
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
