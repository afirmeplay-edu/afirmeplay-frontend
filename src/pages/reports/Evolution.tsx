import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TrendingUp, Users, Target, Award, Filter, RefreshCw, Download, Plus, X, Check, AlertCircle, Search, Calendar, List, Table } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';
import { api } from '@/lib/api';
import { EvaluationResultsApiService } from '@/services/evaluation/evaluationResultsApi';
import { EvaluationComparisonApiService, ComparisonResponse } from '@/services/evaluation/evaluationComparisonApi';
import { EvolutionCharts } from '@/components/evolution/EvolutionCharts';
import type { ProcessedEvolutionData } from '@/components/evolution/EvolutionCharts';
import { processComparisonData } from '@/utils/evolution/evolutionDataProcessor';
import { generateEvolutionPDFFromHTML } from '@/utils/evolution/evolutionPdfService';
import { EvolutionScopeMetaLines } from '@/components/evolution/EvolutionEvaluationsScopeList';

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

interface Evaluation {
  id: string;
  titulo: string;
  disciplina: string;
  status: string;
  data_aplicacao: string | null;
  escola?: string | null;
  serie?: string | null;
  turma?: string | null;
}

type EvolutionProps = { hidePageHeading?: boolean };

export default function Evolution({ hidePageHeading = false }: EvolutionProps) {
  const { autoLogin } = useAuth();
  const { toast } = useToast();

  // Estados dos filtros (simplificados)
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('all');
  const [selectedSchool, setSelectedSchool] = useState<string>('all');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [periodStart, setPeriodStart] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');
  const [evaluationSearch, setEvaluationSearch] = useState<string>('');
  
  // Estados do carrinho de avaliações
  const [selectedEvaluationsForComparison, setSelectedEvaluationsForComparison] = useState<Evaluation[]>([]);
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

  // Função para adicionar avaliação ao carrinho (validação acontece apenas quando há 2+ avaliações)
  const handleAddEvaluation = useCallback((evaluationId: string) => {
    const evaluation = availableEvaluationsForPicker.find(e => e.id === evaluationId);
    if (!evaluation) return;
    
    // Adicionar diretamente ao carrinho com verificação atômica dentro do setState
    // Isso previne race conditions em cliques rápidos
    setSelectedEvaluationsForComparison(prev => {
      // Verificar limite máximo
      if (prev.length >= MAX_EVALUATIONS) {
        toast({
          title: "Limite de avaliações atingido",
          description: `Você pode comparar no máximo ${MAX_EVALUATIONS} avaliações por vez. Remova uma avaliação antes de adicionar outra.`,
          variant: "destructive",
        });
        return prev; // Retornar estado inalterado
      }
      
      // Verificar duplicata dentro do setState (garantido que usa o estado mais recente)
      if (prev.some(e => e.id === evaluationId)) {
        // Se já existe, retornar estado inalterado e mostrar toast
        toast({
          title: "Avaliação já adicionada",
          description: "Esta avaliação já está na lista de comparação.",
          variant: "destructive",
        });
        return prev; // Retornar estado inalterado
      }
      
      // Se não existe, adicionar e mostrar toast de sucesso
      const newState = [...prev, evaluation];
      const remaining = MAX_EVALUATIONS - newState.length;
      const message = prev.length === 0
        ? `"${evaluation.titulo}" foi adicionada à comparação. Selecione mais uma avaliação para comparar.${remaining > 0 ? ` (${remaining} restantes)` : ''}`
        : `"${evaluation.titulo}" foi adicionada à comparação.${remaining > 0 ? ` (${remaining} restantes)` : ' (limite atingido)'}`;
      
      toast({
        title: "Avaliação adicionada",
        description: message,
      });
      
      return newState;
    });
  }, [availableEvaluationsForPicker, toast]);

  // Função para remover avaliação do carrinho
  const handleRemoveEvaluation = useCallback((evaluationId: string) => {
    setSelectedEvaluationsForComparison(prev => prev.filter(e => e.id !== evaluationId));
    
    toast({
      title: "Avaliação removida",
      description: "A avaliação foi removida da comparação.",
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

  // Ao mudar município: limpar escola, série e turma
  useEffect(() => {
    if (prevMunicipalityRef.current !== selectedMunicipality) {
      prevMunicipalityRef.current = selectedMunicipality;
      setSelectedSchool('all');
      setSelectedGrade('all');
      setSelectedClass('all');
    }
  }, [selectedMunicipality]);

  // Ao mudar escola: limpar série e turma
  useEffect(() => {
    if (prevSchoolRef.current !== selectedSchool) {
      prevSchoolRef.current = selectedSchool;
      setSelectedGrade('all');
      setSelectedClass('all');
    }
  }, [selectedSchool]);

  // Ao mudar série: limpar turma
  useEffect(() => {
    if (prevGradeRef.current !== selectedGrade) {
      prevGradeRef.current = selectedGrade;
      setSelectedClass('all');
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
        const raiz = Array.isArray((response as { avaliacoes?: unknown[] })?.avaliacoes)
          ? (response as { avaliacoes: unknown[] }).avaliacoes
          : [];
        const rawList = detalhes.length > 0 ? detalhes : opcoes.length > 0 ? opcoes : raiz;
        type Item = {
          id?: string; titulo?: string; title?: string; test_id?: string; avaliacao_id?: string;
          data_aplicacao?: string | null; data?: string | null; applied_at?: string | null;
          created_at?: string | null; createdAt?: string | null;
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
          .map((a) => ({
            id: String(a.test_id ?? a.avaliacao_id ?? a.id ?? ''),
            titulo: (a.titulo ?? a.title ?? 'Sem título').toString(),
            disciplina: '',
            status: 'concluida',
            data_aplicacao: pickDate(a),
            escola: null,
            serie: null,
            turma: null,
          }));
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
  }, [selectedState, selectedMunicipality, selectedSchool, selectedGrade, selectedClass, periodStart, periodEnd, evaluationSearch, toast]);

  // Filtro por busca: só mostrar avaliações cujo título ou id contenha o termo (backend pode não filtrar corretamente)
  const filteredEvaluations = useMemo(() => {
    const term = evaluationSearch.trim().toLowerCase();
    if (!term) return [...availableEvaluationsForPicker];
    return availableEvaluationsForPicker.filter((e) => {
      const titulo = (e.titulo ?? '').toLowerCase();
      const id = (e.id ?? '').toLowerCase();
      return titulo.includes(term) || id.includes(term);
    });
  }, [availableEvaluationsForPicker, evaluationSearch]);

  // Carregar escolas: GET /evolucao/opcoes-filtros?estado=X&municipio=id (só escolas com avaliações)
  useEffect(() => {
    const loadSchools = async () => {
      if (selectedState !== 'all' && selectedMunicipality !== 'all') {
        try {
          setIsLoadingFilters(true);
          const response = await EvaluationResultsApiService.getEvolucaoOpcoesFiltros({
            estado: selectedState,
            municipio: selectedMunicipality,
          });
          const list = response.escolas ?? [];
          setSchools(list.map((s: { id: string; nome?: string; name?: string }) => ({
            id: s.id,
            name: s.nome ?? s.name ?? s.id,
          })));
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
  }, [selectedState, selectedMunicipality]);

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
  const handleCompareEvaluations = useCallback(async () => {
    if (selectedEvaluationsForComparison.length < 2) {
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
      const evaluationIds = Array.from(
        new Set(selectedEvaluationsForComparison.map(e => e.id))
      );
      console.log('IDs finais para comparação:', evaluationIds);

      const comparison = await EvaluationComparisonApiService.compareEvaluations(evaluationIds);
      setComparisonData(comparison);

      // Processar dados para os gráficos
      const processed = processComparisonData(comparison);
      console.log('📊 Dados processados:', {
        totalEvaluations: comparison.total_evaluations,
        evaluationNames: processed.evaluationNames,
        evaluationNamesCount: processed.evaluationNames.length,
        generalData: processed.generalData,
      });
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
  }, [selectedEvaluationsForComparison, toast]);

  // Chave estável da seleção atual (qualquer mudança em quais avaliações estão marcadas dispara nova comparação)
  const selectedIdsKey = useMemo(
    () => selectedEvaluationsForComparison.map(e => e.id).sort().join(','),
    [selectedEvaluationsForComparison]
  );

  // Carregar gráficos automaticamente quando a seleção mudar (2+ avaliações); só aplica resultado se ainda for a seleção atual
  useEffect(() => {
    selectedIdsRef.current = selectedIdsKey;

    const autoCompare = async () => {
      if (selectedEvaluationsForComparison.length < 2) {
        setComparisonData(null);
        setProcessedData(null);
        setComparisonError(null);
        lastComparisonIdsRef.current = '';
        return;
      }

      const currentIds = selectedEvaluationsForComparison
        .map(e => e.id)
        .sort()
        .join(',');
      if (currentIds !== selectedIdsKey) return;
      if (currentIds === lastComparisonIdsRef.current) return;

      lastComparisonIdsRef.current = currentIds;
      const requestedIds = currentIds;

      setIsLoadingComparison(true);
      setComparisonError(null);

      try {
        const evaluationIds = Array.from(new Set(selectedEvaluationsForComparison.map(e => e.id)));
        const comparison = await EvaluationComparisonApiService.compareEvaluations(evaluationIds);

        if (selectedIdsRef.current !== requestedIds) return;
        setComparisonData(comparison);

        const processed = processComparisonData(comparison);
        if (selectedIdsRef.current !== requestedIds) return;
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
            const axiosError = error as { response?: { data?: { error?: string } } };
            errorMessage = axiosError.response?.data?.error || '';
          }
          if ('message' in error && typeof error.message === 'string') {
            errorMessage = error.message;
          }
        }
        if (selectedIdsRef.current !== requestedIds) return;
        if (errorMessage.includes('não possui resultados calculados')) {
          setComparisonError('Avaliação sem resultados calculados');
          toast({
            title: "Avaliação sem resultados",
            description: "Uma ou mais avaliações selecionadas ainda não possuem resultados calculados.",
            variant: "destructive",
          });
        } else if (errorMessage.includes('Avaliação')) {
          setComparisonError(errorMessage);
          toast({ title: "Erro na avaliação", description: errorMessage, variant: "destructive" });
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
    };

    autoCompare();
  }, [selectedIdsKey, selectedEvaluationsForComparison, toast]);

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
        
        {/* Botão para ver avaliações selecionadas */}
        {selectedEvaluationsForComparison.length > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button 
                  variant="outline"
                  className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border-0"
                >
                  <List className="h-4 w-4 mr-2" />
                  Avaliações Selecionadas ({selectedEvaluationsForComparison.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-lg">
                      <Users className="h-6 w-6 text-white" />
                    </div>
                    Avaliações Selecionadas
                  </DialogTitle>
                  <DialogDescription>
                    {selectedEvaluationsForComparison.length} de {MAX_EVALUATIONS}{' '}
                    {selectedEvaluationsForComparison.length === 1
                      ? 'avaliação selecionada para comparação'
                      : 'avaliações selecionadas para comparação'}
                    {selectedEvaluationsForComparison.length >= MAX_EVALUATIONS && (
                      <span className="block mt-1 text-amber-600 dark:text-amber-400 text-xs">
                        Limite máximo atingido. Remova uma avaliação para adicionar outra.
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedEvaluationsForComparison.map((evaluation, index) => (
                      <div 
                        key={evaluation.id} 
                        className="group relative p-4 bg-gradient-to-br from-blue-50 dark:from-blue-950/30 to-indigo-50 dark:to-indigo-950/30 rounded-xl border-2 border-blue-200 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                              {index + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-foreground text-sm leading-tight mb-1">
                                {evaluation.titulo}
                              </h4>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {formatDate(evaluation.data_aplicacao)}
                              </div>
                              {(() => {
                                const scopeMeta = comparisonData?.evaluations?.find((e) => e.id === evaluation.id);
                                return scopeMeta ? <EvolutionScopeMetaLines evaluation={scopeMeta} /> : null;
                              })()}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveEvaluation(evaluation.id)}
                            className="hover:bg-red-100 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-colors duration-200"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {selectedEvaluationsForComparison.length < 2 && (
                    <div className="pt-4 border-t border-border">
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground">
                          Selecione pelo menos 2 avaliações para iniciar a comparação automática
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
          
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
                    
                    selectedEvaluationsForComparison.forEach(evaluation => {
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
                    });
                    
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
                  if (selectedEvaluationsForComparison.length < 2) {
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
                    const uniqueTestIds = Array.from(
                      new Set(selectedEvaluationsForComparison.map(e => e.id))
                    );
                    
                    const payload = {
                      test_ids: uniqueTestIds,
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
                        selectedEvaluationsForComparison.length === 1
                          ? 'Arquivo gerado com sucesso para 1 avaliação.'
                          : `Arquivo gerado com sucesso para ${selectedEvaluationsForComparison.length} avaliações.`,
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
                disabled={isGeneratingPDF || isExportingExcel || selectedEvaluationsForComparison.length < 2}
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
          {selectedMunicipality !== 'all' && (
            <div className="mt-6 pt-6 border-t border-border">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-foreground mb-1">Avaliações Disponíveis</h3>
                <p className="text-sm text-muted-foreground">
                  Selecione as avaliações para comparação
                </p>
              </div>
              <div className="flex items-center gap-3 mb-4">
                {isLoadingFilters && (
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Carregando avaliações...</span>
                  </div>
                )}
                {!isLoadingFilters && filteredEvaluations.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                      {filteredEvaluations.length} encontrada(s)
                    </Badge>
                    {selectedEvaluationsForComparison.length > 0 && (
                      <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                        {selectedEvaluationsForComparison.length}/{MAX_EVALUATIONS} selecionada(s)
                      </Badge>
                    )}
                  </div>
                )}
                {!isLoadingFilters && filteredEvaluations.length === 0 && availableEvaluationsForPicker.length === 0 && (
                  <Badge variant="outline" className="bg-muted text-muted-foreground">
                    Nenhuma avaliação encontrada
                  </Badge>
                )}
              </div>

              {/* Busca de avaliações */}
              {!isLoadingFilters && availableEvaluationsForPicker.length > 0 && (
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Buscar por nome ou número da avaliação..."
                      value={evaluationSearch}
                      onChange={(e) => setEvaluationSearch(e.target.value)}
                      className="pl-9 h-10"
                    />
                  </div>
                </div>
              )}

              {isLoadingFilters ? (
                  <div className="flex items-center justify-center py-12 border-2 border-dashed border-border rounded-xl bg-muted/50">
                    <div className="text-center">
                      <RefreshCw className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">Carregando avaliações...</p>
                    </div>
                  </div>
                ) : filteredEvaluations.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                    {filteredEvaluations.map((evaluation) => {
                      const isAlreadyAdded = selectedEvaluationsForComparison.some(e => e.id === evaluation.id);
                      const isInvalid = invalidEvaluationIds.has(evaluation.id);
                      
                      return (
                        <div
                          key={evaluation.id}
                          className={`group relative p-4 rounded-lg border transition-all duration-200 ${
                            isAlreadyAdded
                              ? 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800'
                              : isInvalid
                              ? 'bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-800 opacity-60'
                              : selectedEvaluationsForComparison.length >= MAX_EVALUATIONS
                              ? 'bg-muted/50 border-border opacity-50 cursor-not-allowed'
                              : 'bg-card border-border hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isAlreadyAdded}
                              disabled={isInvalid || (!isAlreadyAdded && selectedEvaluationsForComparison.length >= MAX_EVALUATIONS)}
                              onCheckedChange={(checked) => {
                                if (checked && !isAlreadyAdded) {
                                  handleAddEvaluation(evaluation.id);
                                } else if (!checked && isAlreadyAdded) {
                                  handleRemoveEvaluation(evaluation.id);
                                }
                              }}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-foreground text-sm leading-tight mb-1">
                                    {evaluation.titulo}
                                  </h4>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    {formatDate(evaluation.data_aplicacao)}
                                  </div>
                                  {(() => {
                                    const scopeMeta = comparisonData?.evaluations?.find((e) => e.id === evaluation.id);
                                    return scopeMeta ? <EvolutionScopeMetaLines evaluation={scopeMeta} /> : null;
                                  })()}
                                </div>
                                {isAlreadyAdded && (
                                  <Badge variant="outline" className="bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-400 border-green-300 dark:border-green-800">
                                    <Check className="h-3 w-3 mr-1" />
                                    Selecionada
                                  </Badge>
                                )}
                                {isInvalid && (
                                  <Badge variant="outline" className="bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-400 border-red-300 dark:border-red-800">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    Sem resultados
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-border rounded-xl bg-muted/50">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                      <TrendingUp className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h4 className="text-lg font-medium text-foreground mb-2">Nenhuma avaliação encontrada</h4>
                    <p className="text-sm text-muted-foreground text-center max-w-sm">
                      {evaluationSearch || periodStart || periodEnd
                        ? 'Tente ajustar os filtros de busca ou período.'
                        : 'Tente ajustar os filtros ou verifique se existem avaliações para os critérios selecionados.'}
                    </p>
                  </div>
                )}
              </div>
            )}
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

      {/* Gráficos de Evolução — exibidos apenas quando não estiver carregando nova comparação */}
      {processedData && !isLoadingComparison && (
        <EvolutionCharts 
          data={processedData} 
          isLoading={false}
          instrumentLabel="avaliações"
        />
      )}
    </div>
  );
}

