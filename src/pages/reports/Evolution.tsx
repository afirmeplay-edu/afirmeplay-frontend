import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, Filter, RefreshCw, Download, X, AlertCircle, List, Table } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';
import { api } from '@/lib/api';
import { EvaluationResultsApiService } from '@/services/evaluation/evaluationResultsApi';
import { EvaluationComparisonApiService, ComparisonResponse } from '@/services/evaluation/evaluationComparisonApi';
import { EvolutionCharts } from '@/components/evolution/EvolutionCharts';
import type { ProcessedEvolutionData } from '@/components/evolution/EvolutionCharts';
import { processComparisonData } from '@/utils/evolution/evolutionDataProcessor';
import { generateEvolutionPDFFromHTML } from '@/utils/evolution/evolutionPdfService';
import { AREA_TYPE_FILTER_OPTIONS, areaTypeFilterLabel, canFilterByAreaType } from '@/lib/schoolAreaType';
import { EvolutionScopeMetaLines } from '@/components/evolution/EvolutionEvaluationsScopeList';
import { InstrumentPickerModal } from '@/components/filters/InstrumentPickerModal';
import { buildPickerContextLines, toInstrumentPickerItems } from '@/components/filters/instrumentPickerHelpers';
import { formatTurmasFromRefs } from '@/utils/evolution/formatTurmasAgrupadas';

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

interface EvaluationTurma {
  id: string;
  nome: string;
}

interface Evaluation {
  id: string;
  titulo: string;
  disciplina: string;
  disciplinas: string[];
  status: string;
  data_aplicacao: string | null;
  escola?: string | null;
  serie?: string | null;
  serieId?: string | null;
  serieNome?: string | null;
  turma?: string | null;
  turmas: EvaluationTurma[];
}

interface EvolutionPoint {
  ids: string[];
  members: Evaluation[];
}

function pointTitle(point: EvolutionPoint): string {
  if (point.members.length <= 1) return point.members[0]?.titulo ?? 'Avaliação';
  const subjects = point.members.flatMap((member) =>
    member.disciplinas.length > 0 ? member.disciplinas : member.disciplina ? [member.disciplina] : []
  );
  const unique = [...new Set(subjects.map((name) => name.trim()).filter(Boolean))];
  if (unique.length > 0) return unique.join(' + ');
  return point.members.map((member) => member.titulo).join(' + ');
}

function pointClasses(point: EvolutionPoint): { id: string; name: string }[] {
  const seen = new Set<string>();
  const classes: { id: string; name: string }[] = [];
  for (const member of point.members) {
    for (const turma of member.turmas) {
      const id = turma.id?.trim();
      const name = turma.nome?.trim();
      if (!name) continue;
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      classes.push({ id: id || name, name });
    }
  }
  return classes;
}

type EvolutionProps = {
  hidePageHeading?: boolean;
  /**
   * Aba hub "Escola · Série · Turma": mesma experiência da Avaliação online
   * (gráficos, PDF, Excel, Ver avaliações) + sub-aba de cards por grupo.
   */
  includeGroupsTab?: boolean;
};

export default function Evolution({ hidePageHeading = false, includeGroupsTab = false }: EvolutionProps) {
  const { autoLogin, user } = useAuth();
  const { toast } = useToast();

  // Estados dos filtros (simplificados)
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('all');
  const [selectedSchool, setSelectedSchool] = useState<string>('all');
  const [selectedAreaType, setSelectedAreaType] = useState<string>('all');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [periodStart, setPeriodStart] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');
  const [evaluationSearch, setEvaluationSearch] = useState<string>('');
  
  // Estados do carrinho de avaliações
  const [comparisonPoints, setComparisonPoints] = useState<EvolutionPoint[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [availableEvaluationsForPicker, setAvailableEvaluationsForPicker] = useState<Evaluation[]>([]);
  const [selectedEvaluationToPick, setSelectedEvaluationToPick] = useState<string>('all');
  const [invalidEvaluationIds, setInvalidEvaluationIds] = useState<Set<string>>(new Set());

  // Estados dos dados dos filtros
  const [states, setStates] = useState<State[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);

  // Estados de loading e dados
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [comparisonData, setComparisonData] = useState<ComparisonResponse | null>(null);
  const [processedData, setProcessedData] = useState<ProcessedEvolutionData | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [comparisonProgress, setComparisonProgress] = useState(0);

  // Ref para evitar chamadas duplicadas e para só aplicar resultado se a seleção não mudou
  const lastComparisonIdsRef = useRef<string>('');
  const selectedIdsRef = useRef<string>('');
  // Refs para limpar filtros abaixo quando um filtro acima mudar
  const prevMunicipalityRef = useRef<string>(selectedMunicipality);
  const prevSchoolRef = useRef<string>(selectedSchool);
  const prevGradeRef = useRef<string>(selectedGrade);

  // Barra de carregamento ao adicionar avaliação à comparação
  useEffect(() => {
    if (!isLoadingComparison) {
      setComparisonProgress(0);
      return;
    }
    setComparisonProgress(0);
    const t = setInterval(() => {
      setComparisonProgress((prev) => (prev >= 90 ? 15 : prev + 15));
    }, 400);
    return () => clearInterval(t);
  }, [isLoadingComparison]);

  // Carregar estados via GET /evaluation-results/evolucao/opcoes-filtros (sem params)
  const loadInitialFilters = useCallback(async () => {
    try {
      setIsLoadingFilters(true);
      const response = await EvaluationResultsApiService.getEvolucaoOpcoesFiltros({});
      const list = response.estados ?? [];
      setStates(list.map((s: { id: string; nome?: string; name?: string }) => ({
        id: s.id,
        name: s.nome ?? s.name ?? s.id,
        uf: s.id,
      })));
    } catch (error) {
      console.error("Erro ao carregar filtros iniciais:", error);
      toast({
        title: "Erro ao carregar filtros",
        description: "Não foi possível carregar os filtros. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFilters(false);
      setIsLoading(false);
    }
  }, [toast]);

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
      await loadInitialFilters();
    };

    initializeData();
  }, [autoLogin, loadInitialFilters, toast]);

  // Limite máximo de avaliações para comparação (suportado pelo sistema)
  const MAX_EVALUATIONS = 10;

  const rememberInvalidIds = useCallback((message: string) => {
    const found = message.match(/[0-9a-fA-F-]{8,}/g) ?? [];
    if (found.length === 0) return;
    setInvalidEvaluationIds((prev) => {
      const next = new Set(prev);
      found.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const confirmComparisonPoint = useCallback((rawIds: string) => {
    const ids = [...new Set(rawIds.split(',').map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return;
    const members = ids
      .map((id) => availableEvaluationsForPicker.find((item) => item.id === id))
      .filter((item): item is Evaluation => Boolean(item));
    if (members.length !== ids.length) return;

    setComparisonPoints((prev) => {
      if (prev.length >= MAX_EVALUATIONS) {
        toast({
          title: 'Limite de avaliações atingido',
          description: `Você pode comparar no máximo ${MAX_EVALUATIONS} pontos por vez. Remova um antes de adicionar outro.`,
          variant: 'destructive',
        });
        return prev;
      }
      const used = new Set(prev.flatMap((point) => point.ids));
      if (ids.some((id) => used.has(id))) {
        toast({
          title: 'Avaliação já adicionada',
          description: 'Esta avaliação já está na comparação.',
          variant: 'destructive',
        });
        return prev;
      }
      const point: EvolutionPoint = { ids, members };
      const remaining = MAX_EVALUATIONS - (prev.length + 1);
      toast({
        title: ids.length > 1 ? 'Avaliações mescladas' : 'Avaliação adicionada',
        description:
          ids.length > 1
            ? `${pointTitle(point)} entrou como um único ponto.${remaining > 0 ? ` (${remaining} restantes)` : ''}`
            : `"${pointTitle(point)}" foi adicionada à comparação.${remaining > 0 ? ` (${remaining} restantes)` : ''}`,
      });
      return [...prev, point];
    });
  }, [availableEvaluationsForPicker, toast]);

  const handleRemovePoint = useCallback((index: number) => {
    setComparisonPoints((prev) => prev.filter((_, pointIndex) => pointIndex !== index));
    toast({
      title: 'Avaliação removida',
      description: 'A avaliação foi removida da comparação.',
    });
  }, [toast]);

  const handleClearEvaluations = useCallback(() => {
    setComparisonPoints([]);
    setInvalidEvaluationIds(new Set());
    lastComparisonIdsRef.current = '';
    toast({
      title: 'Seleção limpa',
      description: 'Todas as provas foram removidas da comparação.',
    });
  }, [toast]);

  // Carregar municípios: GET /evolucao/opcoes-filtros?estado=X. Ao mudar estado, limpar municipio → escola → serie → turma.
  useEffect(() => {
    const loadMunicipalities = async () => {
      if (selectedState !== 'all') {
        try {
          const response = await EvaluationResultsApiService.getEvolucaoOpcoesFiltros({ estado: selectedState });
          const list = response.municipios ?? [];
          const newMunicipalities = list.map((m: { id: string; nome?: string; name?: string }) => ({
            id: m.id,
            name: m.nome ?? m.name ?? m.id,
            state: selectedState,
          }));
          setMunicipalities(newMunicipalities);
          const currentExists = newMunicipalities.some((m: { id: string }) => m.id === selectedMunicipality);
          if (!currentExists && selectedMunicipality !== 'all') {
            setSelectedMunicipality('all');
            setSelectedSchool('all');
            setSelectedGrade('all');
            setSelectedClass('all');
          }
        } catch (error) {
          console.error("Erro ao carregar municípios:", error);
          toast({
            title: "Erro ao carregar municípios",
            description: "Não foi possível carregar os municípios. Tente novamente.",
            variant: "destructive",
          });
          setMunicipalities([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setMunicipalities([]);
        setSelectedMunicipality('all');
        setSelectedSchool('all');
        setSelectedGrade('all');
        setSelectedClass('all');
      }
    };

    loadMunicipalities();
  }, [selectedState, toast]);

  // Ao mudar município: limpar escola, série, turma e carrinho de provas
  useEffect(() => {
    if (prevMunicipalityRef.current !== selectedMunicipality) {
      prevMunicipalityRef.current = selectedMunicipality;
      setSelectedSchool('all');
      setSelectedGrade('all');
      setSelectedClass('all');
      setComparisonPoints([]);
      setInvalidEvaluationIds(new Set());
      lastComparisonIdsRef.current = '';
    }
  }, [selectedMunicipality]);

  // Ao mudar escola: limpar série, turma e carrinho (evita provas de outro escopo)
  useEffect(() => {
    if (prevSchoolRef.current !== selectedSchool) {
      prevSchoolRef.current = selectedSchool;
      setSelectedGrade('all');
      setSelectedClass('all');
      setComparisonPoints([]);
      setInvalidEvaluationIds(new Set());
      lastComparisonIdsRef.current = '';
    }
  }, [selectedSchool]);

  // Ao mudar série: limpar turma e carrinho (integração série × provas)
  useEffect(() => {
    if (prevGradeRef.current !== selectedGrade) {
      prevGradeRef.current = selectedGrade;
      setSelectedClass('all');
      setComparisonPoints([]);
      setInvalidEvaluationIds(new Set());
      lastComparisonIdsRef.current = '';
    }
  }, [selectedGrade]);

  // Carregar avaliações: GET /evaluation-results/evolucao/avaliacoes (estado, municipio obrigatórios; escola, serie, turma, nome, data_inicio, data_fim opcionais)
  useEffect(() => {
    const loadEvaluations = async () => {
      const estadoValido = selectedState && selectedState !== 'all';
      const municipioValido = selectedMunicipality && selectedMunicipality !== 'all';
      if (!estadoValido || !municipioValido) {
        setAvailableEvaluationsForPicker([]);
        return;
      }
      setIsLoadingFilters(true);
      try {
        const response = await EvaluationResultsApiService.getEvolucaoAvaliacoes(
          {
            estado: selectedState,
            municipio: selectedMunicipality,
            escola: selectedSchool === 'all' ? undefined : selectedSchool,
            ...(selectedAreaType !== 'all' ? { tipo_area: selectedAreaType } : {}),
            serie: selectedGrade === 'all' ? undefined : selectedGrade,
            turma: selectedClass === 'all' ? undefined : selectedClass,
            data_inicio: periodStart || undefined,
            data_fim: periodEnd || undefined,
            nome: evaluationSearch.trim() || undefined,
          },
          1,
          100
        );
        if (response == null) {
          setAvailableEvaluationsForPicker([]);
          toast({
            title: 'Erro ao carregar avaliações',
            description: 'O servidor não respondeu. Verifique a disponibilidade do serviço e tente novamente.',
            variant: 'destructive',
          });
          return;
        }
        // Backend pode devolver: resultados_detalhados.avaliacoes, .avaliacoes.items, opcoes_proximos_filtros.avaliacoes ou avaliacoes na raiz
        const rd = response?.resultados_detalhados;
        const detalhes = Array.isArray(rd?.avaliacoes)
          ? rd.avaliacoes
          : (rd?.avaliacoes && typeof rd.avaliacoes === 'object' && Array.isArray((rd.avaliacoes as { items?: unknown[] }).items))
            ? (rd.avaliacoes as { items: unknown[] }).items
            : [];
        const opcoes = response?.opcoes_proximos_filtros?.avaliacoes ?? [];
        const raizPayload = response as unknown as { avaliacoes?: unknown[] };
        const raiz = Array.isArray(raizPayload?.avaliacoes) ? raizPayload.avaliacoes : [];
        const rawList = detalhes.length > 0 ? detalhes : opcoes.length > 0 ? opcoes : raiz;
        type Item = {
          id?: string; titulo?: string; title?: string; test_id?: string; avaliacao_id?: string;
          data_aplicacao?: string | null; data?: string | null; applied_at?: string | null;
          created_at?: string | null; createdAt?: string | null;
          disciplina?: string; disciplinas?: string[];
          grade_id?: string; grade_nome?: string; serie_id?: string; serie_nome?: string;
          turmas?: Array<{ id?: string; nome?: string; name?: string }>;
        };
        // Backend pode enviar "data" em dd/mm/yyyy; converter para ISO para exibição correta
        const pickDate = (a: Item): string | null => {
          const v = a.data_aplicacao ?? a.data ?? a.applied_at ?? a.created_at ?? a.createdAt;
          if (v == null || v === '') return null;
          if (typeof v === 'number') return new Date(v).toISOString();
          if (typeof v === 'string') {
            const trimmed = v.trim();
            const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
            if (match) {
              const [, d, m, y] = match;
              const day = parseInt(d!, 10);
              let year = parseInt(y!, 10);
              if (year < 100) year += 2000;
              const date = new Date(year, parseInt(m!, 10) - 1, day);
              if (!Number.isNaN(date.getTime())) return date.toISOString();
            }
            return trimmed;
          }
          return null;
        };
        const seen = new Set<string>();
        const list: Evaluation[] = (rawList as Item[])
          .filter((a) => {
            const id = a?.test_id ?? a?.avaliacao_id ?? a?.id;
            if (id == null) return false;
            const key = String(id).trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((a) => {
            const disciplinas = (a.disciplinas ?? [])
              .map((name) => String(name).trim())
              .filter(Boolean);
            const disciplina = String(a.disciplina ?? disciplinas[0] ?? '').trim();
            const turmas = (a.turmas ?? [])
              .map((turma) => ({
                id: String(turma.id ?? '').trim(),
                nome: String(turma.nome ?? turma.name ?? '').trim(),
              }))
              .filter((turma) => turma.nome);
            const serieId = String(a.serie_id ?? a.grade_id ?? '').trim() || null;
            const serieNome = String(a.serie_nome ?? a.grade_nome ?? '').trim() || null;
            return {
              id: String(a.test_id ?? a.avaliacao_id ?? a.id ?? ''),
              titulo: (a.titulo ?? a.title ?? 'Sem título').toString(),
              disciplina,
              disciplinas: disciplinas.length > 0 ? disciplinas : disciplina ? [disciplina] : [],
              status: 'concluida',
              data_aplicacao: pickDate(a),
              escola: null,
              serie: serieNome,
              serieId,
              serieNome,
              turma: null,
              turmas,
            };
          });
        setAvailableEvaluationsForPicker(list);
      } catch (error) {
        console.error('Erro ao carregar avaliações:', error);
        setAvailableEvaluationsForPicker([]);
        toast({
          title: 'Erro ao carregar avaliações',
          description: 'Não foi possível carregar as avaliações. Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingFilters(false);
      }
    };

    loadEvaluations();
  }, [selectedState, selectedMunicipality, selectedSchool, selectedAreaType, selectedGrade, selectedClass, periodStart, periodEnd, evaluationSearch, toast]);

  // Carregar escolas: GET /evolucao/opcoes-filtros?estado=X&municipio=id (só escolas com avaliações)
  useEffect(() => {
    const loadSchools = async () => {
      if (selectedState !== 'all' && selectedMunicipality !== 'all') {
        try {
          setIsLoadingFilters(true);
          const response = await EvaluationResultsApiService.getEvolucaoOpcoesFiltros({
            estado: selectedState,
            municipio: selectedMunicipality,
            ...(selectedAreaType !== 'all' ? { tipo_area: selectedAreaType } : {}),
          });
          const list = response.escolas ?? [];
          const mapped = list.map((s: { id: string; nome?: string; name?: string }) => ({
            id: s.id,
            name: s.nome ?? s.name ?? s.id,
          }));
          setSchools(mapped);
          setSelectedSchool((prev) => (prev !== 'all' && !mapped.some((school) => school.id === prev) ? 'all' : prev));
        } catch (error) {
          console.error("Erro ao carregar escolas:", error);
          setSchools([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setSchools([]);
      }
    };

    loadSchools();
  }, [selectedState, selectedMunicipality, selectedAreaType]);

  // Carregar séries: GET /evolucao/opcoes-filtros?estado=X&municipio=id&escola=id (só séries com avaliações)
  useEffect(() => {
    const loadGrades = async () => {
      if (selectedState !== 'all' && selectedMunicipality !== 'all' && selectedSchool !== 'all') {
        try {
          setIsLoadingFilters(true);
          const response = await EvaluationResultsApiService.getEvolucaoOpcoesFiltros({
            estado: selectedState,
            municipio: selectedMunicipality,
            escola: selectedSchool,
          });
          const list = response.series ?? [];
          setGrades(list.map((s: { id: string; nome?: string; name?: string }) => ({
            id: s.id,
            name: s.nome ?? s.name ?? s.id,
          })));
        } catch (error) {
          console.error("Erro ao carregar séries:", error);
          setGrades([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setGrades([]);
      }
    };

    loadGrades();
  }, [selectedState, selectedMunicipality, selectedSchool]);

  // Carregar turmas: GET /evolucao/opcoes-filtros?estado=X&municipio=id&escola=id&serie=id (só turmas com avaliações)
  useEffect(() => {
    const loadClasses = async () => {
      if (selectedState !== 'all' && selectedMunicipality !== 'all' && selectedSchool !== 'all' && selectedGrade !== 'all') {
        try {
          setIsLoadingFilters(true);
          const response = await EvaluationResultsApiService.getEvolucaoOpcoesFiltros({
            estado: selectedState,
            municipio: selectedMunicipality,
            escola: selectedSchool,
            serie: selectedGrade,
          });
          const list = response.turmas ?? [];
          setClasses(list.map((c: { id: string; nome?: string; name?: string }) => ({
            id: c.id,
            name: c.nome ?? c.name ?? c.id,
          })));
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
  }, [selectedState, selectedMunicipality, selectedSchool, selectedGrade]);

  // Função para comparar avaliações
  const scopeFilters = useMemo(
    () => ({
      estado: selectedState !== 'all' ? selectedState : null,
      municipio: selectedMunicipality !== 'all' ? selectedMunicipality : null,
      escola: selectedSchool !== 'all' ? selectedSchool : null,
      serie: selectedGrade !== 'all' ? selectedGrade : null,
      turma: selectedClass !== 'all' ? selectedClass : null,
      tipo_area: selectedAreaType !== 'all' ? selectedAreaType : null,
    }),
    [selectedState, selectedMunicipality, selectedSchool, selectedAreaType, selectedGrade, selectedClass]
  );

  const handleCompareEvaluations = useCallback(async () => {
    if (comparisonPoints.length < 2) {
      toast({
        title: "Selecione pelo menos 2 avaliações",
        description: "Para comparar, você precisa adicionar pelo menos 2 avaliações.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoadingComparison(true);
      setComparisonError(null);

      // Remover duplicatas usando Set para garantir IDs únicos
      const evaluationIds = comparisonPoints.flatMap((point) => point.ids);
      const grupos = comparisonPoints.map((point) => point.ids);

      const comparison = await EvaluationComparisonApiService.compareEvaluations(
        evaluationIds,
        scopeFilters,
        grupos
      );
      setComparisonData(comparison);

      // Processar dados para os gráficos
      const processed = processComparisonData(comparison);
      setProcessedData(processed);
      // Visibilidade de gráficos agora é controlada localmente em EvolutionCharts

      toast({
        title: "Comparação realizada com sucesso!",
        description: `Comparando ${comparison.total_evaluations} avaliações com ${comparison.total_comparisons} comparações.`,
      });
    } catch (error: unknown) {
      console.error('Erro ao comparar avaliações:', error);
      
      // Extrair mensagem de erro do backend
      let errorMessage = 'Erro desconhecido';
      if (error && typeof error === 'object') {
        if ('response' in error) {
          const axiosError = error as { response?: { data?: { error?: string } } };
          errorMessage = axiosError.response?.data?.error || '';
        }
        if ('message' in error && typeof error.message === 'string') {
          errorMessage = error.message;
        }
      }
      
      if (errorMessage) rememberInvalidIds(errorMessage);
      if (errorMessage.includes('não possui resultados calculados')) {
        setComparisonError('Avaliação sem resultados calculados');
        toast({
          title: "Avaliação sem resultados",
          description: "Uma ou mais avaliações selecionadas ainda não possuem resultados calculados. Selecione apenas avaliações finalizadas.",
          variant: "destructive",
        });
      } else if (errorMessage.includes('Avaliação')) {
        setComparisonError(errorMessage);
        toast({
          title: "Erro na avaliação",
          description: errorMessage,
          variant: "destructive",
        });
      } else {
        setComparisonError('Erro ao carregar dados de comparação');
        toast({
          title: "Erro na comparação",
          description: "Não foi possível comparar as avaliações. Tente novamente.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoadingComparison(false);
    }
  }, [comparisonPoints, scopeFilters, toast, rememberInvalidIds]);

  // Chave estável da seleção atual + escopo (mudança de filtro dispara nova comparação)
  const selectedIdsKey = useMemo(
    () => comparisonPoints.map((point) => [...point.ids].sort().join(',')).sort().join('|'),
    [comparisonPoints]
  );

  const comparisonRequestKey = useMemo(
    () =>
      [
        selectedIdsKey,
        scopeFilters.estado ?? '',
        scopeFilters.municipio ?? '',
        scopeFilters.escola ?? '',
        scopeFilters.serie ?? '',
        scopeFilters.turma ?? '',
      ].join('|'),
    [selectedIdsKey, scopeFilters]
  );

  // Carregar gráficos automaticamente quando a seleção ou o escopo mudarem (2+ avaliações).
  // Debounce evita cascata de compares ao marcar várias provas rapidamente.
  useEffect(() => {
    selectedIdsRef.current = comparisonRequestKey;

    if (comparisonPoints.length < 2) {
      setComparisonData(null);
      setProcessedData(null);
      setComparisonError(null);
      lastComparisonIdsRef.current = '';
      return;
    }

    if (comparisonRequestKey === lastComparisonIdsRef.current) return;

    const requestedKey = comparisonRequestKey;
    const debounceMs = 450;
    const timer = window.setTimeout(async () => {
      if (selectedIdsRef.current !== requestedKey) return;
      if (requestedKey === lastComparisonIdsRef.current) return;

      lastComparisonIdsRef.current = requestedKey;
      setIsLoadingComparison(true);
      setComparisonError(null);

      try {
        const evaluationIds = comparisonPoints.flatMap((point) => point.ids);
        const grupos = comparisonPoints.map((point) => point.ids);
        const comparison = await EvaluationComparisonApiService.compareEvaluations(
          evaluationIds,
          scopeFilters,
          grupos
        );

        if (selectedIdsRef.current !== requestedKey) return;
        setComparisonData(comparison);

        const processed = processComparisonData(comparison);
        if (selectedIdsRef.current !== requestedKey) return;
        setProcessedData(processed);

        toast({
          title: "Comparação atualizada",
          description: `Comparando ${comparison.total_evaluations} avaliações com ${comparison.total_comparisons} comparações.`,
        });
      } catch (error: unknown) {
        console.error('Erro na comparação automática:', error);
        let errorMessage = '';
        if (error && typeof error === 'object') {
          if ('response' in error) {
            const axiosError = error as {
              response?: { data?: { error?: string; details?: string; message?: string } };
              message?: string;
            };
            errorMessage =
              axiosError.response?.data?.error ||
              axiosError.response?.data?.details ||
              axiosError.response?.data?.message ||
              '';
          }
          if (!errorMessage && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
            errorMessage = (error as { message: string }).message;
          }
        }
        if (selectedIdsRef.current !== requestedKey) return;
        if (errorMessage) rememberInvalidIds(errorMessage);
        if (errorMessage.includes('não possui resultados calculados')) {
          setComparisonError('Avaliação sem resultados calculados');
          toast({
            title: "Avaliação sem resultados",
            description: "Uma ou mais avaliações selecionadas ainda não possuem resultados calculados.",
            variant: "destructive",
          });
        } else if (errorMessage.includes('não possui resultados no escopo')) {
          setComparisonError('Sem resultados no escopo selecionado (escola/série/turma).');
          toast({
            title: "Sem resultados no escopo",
            description: "As avaliações não têm resultados para o filtro atual. Ajuste escola, série ou turma.",
            variant: "destructive",
          });
        } else if (errorMessage) {
          setComparisonError(errorMessage);
          toast({ title: "Erro na comparação", description: errorMessage, variant: "destructive" });
        } else {
          setComparisonError('Erro ao carregar dados de comparação');
          toast({
            title: "Erro na comparação",
            description: "Não foi possível comparar as avaliações. Tente novamente.",
            variant: "destructive",
          });
        }
        lastComparisonIdsRef.current = '';
      } finally {
        if (selectedIdsRef.current === requestedKey) {
          setIsLoadingComparison(false);
        }
      }
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [comparisonRequestKey, comparisonPoints, scopeFilters, toast, rememberInvalidIds]);

  // Controles de visibilidade agora são por gráfico, definidos em EvolutionCharts

  // Função para formatar data (aceita ISO, dd/mm/yyyy, timestamp ou string vazia)
  const formatDate = (dateString: string | null | undefined) => {
    if (dateString == null || String(dateString).trim() === '') return 'Data não disponível';
    try {
      let d: Date;
      if (typeof dateString === 'number') {
        d = new Date(dateString);
      } else {
        const s = String(dateString).trim();
        const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (match) {
          const [, day, month, year] = match;
          let y = parseInt(year!, 10);
          if (y < 100) y += 2000;
          d = new Date(y, parseInt(month!, 10) - 1, parseInt(day!, 10));
        } else {
          d = new Date(s);
        }
      }
      if (Number.isNaN(d.getTime())) return 'Data não disponível';
      return d.toLocaleDateString('pt-BR');
    } catch {
      return 'Data não informada';
    }
  };

  const pickerItems = useMemo(
    () =>
      availableEvaluationsForPicker.map((evaluation) => {
        const base = toInstrumentPickerItems([
          {
            id: evaluation.id,
            titulo: evaluation.titulo,
            disciplinas: evaluation.disciplinas,
            disciplina: evaluation.disciplina,
            grade_id: evaluation.serieId ?? undefined,
            grade_nome: evaluation.serieNome ?? undefined,
          },
        ])[0];
        const turmas = formatTurmasFromRefs(
          evaluation.turmas.map((turma) => ({ id: turma.id, name: turma.nome }))
        );
        return {
          ...base,
          subtitle: turmas ? `Turmas: ${turmas}` : base.subtitle,
        };
      }),
    [availableEvaluationsForPicker]
  );

  const pickerContextLines = useMemo(
    () =>
      buildPickerContextLines({
        estado:
          states.find((state) => state.id === selectedState)?.name
          ?? (selectedState !== 'all' ? selectedState : undefined),
        municipio:
          municipalities.find((city) => city.id === selectedMunicipality)?.name
          ?? (selectedMunicipality !== 'all' ? selectedMunicipality : undefined),
        escola:
          selectedSchool !== 'all'
            ? schools.find((school) => school.id === selectedSchool)?.name
            : undefined,
        periodo:
          periodStart || periodEnd
            ? `${periodStart || '…'} — ${periodEnd || '…'}`
            : undefined,
      }),
    [states, selectedState, municipalities, selectedMunicipality, schools, selectedSchool, periodStart, periodEnd]
  );

  const pickerSeries = useMemo(() => {
    if (grades.length > 0) return grades.map((grade) => ({ id: grade.id, name: grade.name }));
    const unique = new Map<string, string>();
    for (const evaluation of availableEvaluationsForPicker) {
      if (evaluation.serieId && evaluation.serieNome) unique.set(evaluation.serieId, evaluation.serieNome);
    }
    return [...unique.entries()].map(([id, name]) => ({ id, name }));
  }, [grades, availableEvaluationsForPicker]);

  const geoReady = selectedState !== 'all' && selectedMunicipality !== 'all';

  return (
    <div className={hidePageHeading ? 'space-y-6' : 'container mx-auto px-4 py-6 space-y-6'}>
      {!hidePageHeading && (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
            <TrendingUp className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 shrink-0" />
            Análise de Evolução
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Compare múltiplas avaliações e acompanhe a evolução dos resultados ao longo do tempo com insights detalhados.
          </p>
        </div>
      </div>
      )}

      <div className="flex flex-wrap justify-center gap-2 w-full sm:w-auto sm:justify-end">
          <Button 
            variant="outline" 
            onClick={() => window.location.reload()} 
            disabled={isLoadingComparison}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingComparison ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        
          {comparisonData && processedData && (
            <>
              <Button 
                onClick={async () => {
                  if (!processedData || !comparisonData) {
                    toast({
                      title: "Dados insuficientes",
                      description: "Não há dados disponíveis para gerar o relatório.",
                      variant: "destructive",
                    });
                    return;
                  }

                  try {
                    setIsGeneratingPDF(true);
                    
                    // Preparar informações dos filtros
                    // Extrair escolas únicas das avaliações selecionadas
                    const uniqueSchools = new Map<string, { id?: string; name: string }>();
                    
                    comparisonPoints.forEach((point) => point.members.forEach(evaluation => {
                      if (evaluation.escola) {
                        // Se já não existe, adicionar
                        if (!uniqueSchools.has(evaluation.escola)) {
                          // Tentar encontrar na lista de escolas carregadas
                          const foundSchool = schools.find(s => s.id === evaluation.escola || s.name === evaluation.escola);
                          uniqueSchools.set(evaluation.escola, {
                            id: foundSchool?.id,
                            name: foundSchool?.name || evaluation.escola
                          });
                        }
                      }
                    }));
                    
                    const schoolsArray = Array.from(uniqueSchools.values());
                    
                    const filterInfo = {
                      state: selectedState !== 'all' 
                        ? states.find(s => s.id === selectedState) 
                          ? { id: selectedState, name: states.find(s => s.id === selectedState)!.name }
                          : undefined
                        : undefined,
                      municipality: selectedMunicipality !== 'all'
                        ? municipalities.find(m => m.id === selectedMunicipality)
                          ? { id: selectedMunicipality, name: municipalities.find(m => m.id === selectedMunicipality)!.name }
                          : undefined
                        : undefined,
                      // Manter escola única para compatibilidade se apenas uma escola foi selecionada manualmente
                      school: selectedSchool !== 'all' && schoolsArray.length <= 1
                        ? schools.find(s => s.id === selectedSchool)
                          ? { id: selectedSchool, name: schools.find(s => s.id === selectedSchool)!.name }
                          : undefined
                        : undefined,
                      // Adicionar array de escolas quando houver múltiplas
                      schools: schoolsArray.length > 0 ? schoolsArray : undefined,
                      areaTypeLabel: areaTypeFilterLabel(selectedAreaType),
                      grade: selectedGrade !== 'all'
                        ? grades.find(g => g.id === selectedGrade)
                          ? { id: selectedGrade, name: grades.find(g => g.id === selectedGrade)!.name }
                          : undefined
                        : undefined,
                      class: selectedClass !== 'all'
                        ? classes.find(c => c.id === selectedClass)
                          ? { id: selectedClass, name: classes.find(c => c.id === selectedClass)!.name }
                          : undefined
                        : undefined,
                      periodStart: periodStart || undefined,
                      periodEnd: periodEnd || undefined,
                    };
                    
                    await generateEvolutionPDFFromHTML(
                      processedData,
                      comparisonData,
                      processedData.evaluationNames,
                      filterInfo,
                      'avaliações'
                    );
                    toast({
                      title: "PDF gerado com sucesso!",
                      description: "O relatório foi salvo no seu dispositivo.",
                    });
                  } catch (error) {
                    console.error('Erro ao gerar PDF:', error);
                    toast({
                      title: "Erro ao gerar PDF",
                      description: "Não foi possível gerar o relatório. Tente novamente.",
                      variant: "destructive",
                    });
                  } finally {
                    setIsGeneratingPDF(false);
                  }
                }}
                disabled={isGeneratingPDF || isExportingExcel || !processedData || !comparisonData}
                className="w-full sm:w-auto bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              >
                <Download className={`h-4 w-4 mr-2 ${isGeneratingPDF ? 'animate-spin' : ''}`} />
                {isGeneratingPDF ? 'Gerando PDF...' : 'Exportar PDF'}
              </Button>
              
              <Button 
                onClick={async () => {
                  // Validar se há avaliações selecionadas
                  if (comparisonPoints.length < 2) {
                    toast({
                      title: "Selecione pelo menos 2 avaliações",
                      description: "Para exportar, você precisa ter pelo menos 2 avaliações selecionadas.",
                      variant: "destructive",
                    });
                    return;
                  }

                  try {
                    setIsExportingExcel(true);

                    // Preparar payload com os IDs das avaliações selecionadas
                    // Remover duplicatas usando Set para garantir IDs únicos
                    const uniqueTestIds = comparisonPoints.flatMap((point) => point.ids);
                    const grupos = comparisonPoints.map((point) => point.ids);
                    
                    const payload = {
                      test_ids: uniqueTestIds,
                      grupos,
                      estado: selectedState !== 'all' ? selectedState : null,
                      municipio: selectedMunicipality !== 'all' ? selectedMunicipality : null,
                      escola: selectedSchool !== 'all' ? selectedSchool : null,
                      serie: selectedGrade !== 'all' ? selectedGrade : null,
                      turma: selectedClass !== 'all' ? selectedClass : null,
                      tipo_area: selectedAreaType !== 'all' ? selectedAreaType : null,
                    };

                    // Fazer requisição POST para o backend
                    const exportConfig = selectedMunicipality !== 'all'
                      ? { responseType: 'blob' as const, meta: { cityId: selectedMunicipality } }
                      : { responseType: 'blob' as const };
                    const response = await api.post('/test/evolution/export-excel', payload, exportConfig);

                    // Criar blob a partir da resposta
                    const blob = new Blob([response.data], {
                      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    });

                    // Extrair nome do arquivo do header Content-Disposition ou usar padrão
                    const contentDisposition = response.headers['content-disposition'];
                    let fileName = `exportacao-evolucao-${new Date().toISOString().split('T')[0]}.xlsx`;
                    
                    if (contentDisposition) {
                      const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                      if (fileNameMatch && fileNameMatch[1]) {
                        fileName = fileNameMatch[1].replace(/['"]/g, '');
                      }
                    }

                    // Criar link temporário e fazer download
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', fileName);
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.URL.revokeObjectURL(url);

                    toast({
                      title: "Excel exportado com sucesso!",
                      description:
                        comparisonPoints.length === 1
                          ? 'Arquivo gerado com sucesso para 1 avaliação.'
                          : `Arquivo gerado com sucesso para ${comparisonPoints.length} avaliações.`,
                    });
                  } catch (error: any) {
                    console.error('Erro ao exportar Excel:', error);

                    // Tratar erro que pode vir como blob
                    let errorMessage = "Não foi possível exportar as avaliações.";

                    if (error.response?.data instanceof Blob) {
                      try {
                        const text = await error.response.data.text();
                        const errorData = JSON.parse(text);
                        errorMessage = errorData.message || errorMessage;
                      } catch {
                        // Se não conseguir parsear, usar mensagem padrão
                      }
                    } else if (error.response?.data?.message) {
                      errorMessage = error.response.data.message;
                    } else if (error.response?.status === 400) {
                      errorMessage = "Dados inválidos para exportação.";
                    } else if (error.response?.status === 404) {
                      errorMessage = "Rota de exportação não encontrada.";
                    } else if (error.response?.status === 500) {
                      errorMessage = "Erro interno do servidor ao gerar o arquivo.";
                    }

                    toast({
                      title: "Erro ao exportar Excel",
                      description: errorMessage,
                      variant: "destructive",
                    });
                  } finally {
                    setIsExportingExcel(false);
                  }
                }}
                disabled={isGeneratingPDF || isExportingExcel || comparisonPoints.length < 2}
                className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              >
                <Table className={`h-4 w-4 mr-2 ${isExportingExcel ? 'animate-spin' : ''}`} />
                {isExportingExcel ? 'Exportando...' : 'Exportar Excel'}
              </Button>
            </>
        )}
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Estado */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
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
                  {municipalities.map(municipality => (
                    <SelectItem key={municipality.id} value={municipality.id}>
                      {municipality.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {canFilterByAreaType(user?.role) && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo de área</label>
                <Select
                  value={selectedAreaType}
                  onValueChange={(value) => {
                    setSelectedAreaType(value);
                    setSelectedSchool('all');
                  }}
                  disabled={isLoadingFilters || selectedMunicipality === 'all'}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    {AREA_TYPE_FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Escola */}
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
                  {schools.map(school => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Série */}
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
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a turma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {classes.map(classItem => (
                    <SelectItem key={classItem.id} value={classItem.id}>
                      {classItem.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Filtro de Período */}
          {selectedMunicipality !== 'all' && (
            <div className="mt-6 pt-6 border-t border-border">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>
            </div>
          )}

          {/* Seção de Avaliações */}
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => {
                  setEvaluationSearch('');
                  setPickerOpen(true);
                }}
                disabled={!geoReady}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
              >
                <List className="h-4 w-4 mr-2" />
                Selecionar avaliações
              </Button>
              <Badge variant="outline">
                {comparisonPoints.length}/{MAX_EVALUATIONS} selecionada(s)
              </Badge>
              {pickerContextLines.map((line) => (
                <Badge key={line} variant="secondary" className="font-normal">
                  {line}
                </Badge>
              ))}
              {comparisonPoints.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={handleClearEvaluations}>
                  Limpar
                </Button>
              )}
            </div>
            {comparisonPoints.length > 0 && comparisonPoints.length < 2 && (
              <p className="mt-3 text-sm text-muted-foreground">
                Selecione pelo menos 2 pontos para iniciar a comparação. Avaliações da mesma série e de disciplinas diferentes podem ser mescladas em um único ponto.
              </p>
            )}
          </div>

          </CardContent>
        </Card>




      {/* Loading dos dados: não exibe a evolução enquanto adiciona avaliação à comparação */}
      {isLoadingComparison && (
        <Card className="shadow-lg border-0 bg-card/90 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-6">
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center mb-6">
                <RefreshCw className="h-10 w-10 animate-spin text-white" />
              </div>
              <div className="absolute -inset-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full opacity-20 animate-pulse"></div>
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">Processando Análise</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Estamos comparando suas avaliações e gerando insights detalhados. Isso pode levar alguns momentos...
            </p>
            <div className="w-full max-w-sm">
              <Progress value={comparisonProgress} className="h-2" aria-label="Carregando comparação" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Erro na comparação com design melhorado */}
      {comparisonError && (
        <Card className="shadow-lg border-0 bg-card/90 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 bg-gradient-to-r from-red-500 to-rose-500 rounded-full flex items-center justify-center mb-6">
              <AlertCircle className="h-10 w-10 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Erro na Análise
            </h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              {comparisonError}
            </p>
            <Button 
              variant="outline" 
              onClick={() => setComparisonError(null)}
              className="border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              Tentar Novamente
            </Button>
          </CardContent>
        </Card>
      )}

      <InstrumentPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Selecionar avaliações"
        items={pickerItems}
        value=""
        multiple
        maxSelection={MAX_EVALUATIONS}
        excludeIds={comparisonPoints.flatMap((point) => point.ids)}
        invalidIds={[...invalidEvaluationIds]}
        seriesOptions={pickerSeries}
        seriesFilterMode="local"
        loading={isLoadingFilters}
        emptyMessage="Nenhuma avaliação encontrada."
        contextLines={geoReady ? pickerContextLines : []}
        contextRequiredMessage="Selecione estado e município antes de buscar avaliações."
        onSelect={confirmComparisonPoint}
        onViewItem={(id) => window.open(`/app/avaliacao/${id}`, "_blank", "noopener,noreferrer")}
        onFiltersChange={({ nome }) => setEvaluationSearch(nome)}
        committedSection={
          comparisonPoints.length === 0 ? undefined : (
            <div className="mb-4 space-y-2">
              <p className="text-sm font-medium">Selecionadas ({comparisonPoints.length})</p>
              {comparisonPoints.map((point, index) => {
                const scopeMeta =
                  comparisonData?.evaluations?.find((item) => item.id === point.ids.join(",")) ??
                  comparisonData?.evaluations?.find((item) => point.ids.includes(item.id));
                const localScope = {
                  title: pointTitle(point),
                  order: index + 1,
                  grade_name: point.members.find((member) => member.serieNome)?.serieNome ?? undefined,
                  classes: pointClasses(point),
                };
                return (
                  <div key={point.ids.join(",")} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {index + 1}. {pointTitle(point)}
                        </p>
                        {point.ids.length > 1 && (
                          <Badge variant="secondary" className="mt-1">Mesclada</Badge>
                        )}
                        <EvolutionScopeMetaLines evaluation={scopeMeta ?? localScope} />
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {point.members.map((member) => (
                          <Button
                            key={member.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/app/avaliacao/${member.id}`, "_blank", "noopener,noreferrer")}
                          >
                            Ver avaliação
                          </Button>
                        ))}
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleRemovePoint(index)} aria-label="Remover da comparação">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
      />

      {/* Mesmos gráficos da Avaliação online; com includeGroupsTab, inclui sub-aba Escola/Série/Turma */}
      {processedData && !isLoadingComparison && (
        <EvolutionCharts
          data={processedData}
          isLoading={false}
          instrumentLabel="avaliações"
          defaultTab={includeGroupsTab ? 'groups' : 'general'}
          groupTestIds={
            includeGroupsTab
              ? comparisonPoints.flatMap((point) => point.ids)
              : undefined
          }
          groupPoints={
            includeGroupsTab
              ? comparisonPoints.map((point) => point.ids)
              : undefined
          }
          groupScopeFilters={includeGroupsTab ? scopeFilters : undefined}
          groupRefreshKey={includeGroupsTab ? comparisonRequestKey : undefined}
        />
      )}
    </div>
  );
}

