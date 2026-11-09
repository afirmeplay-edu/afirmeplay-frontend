import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/context/authContext";
import { Card, CardContent } from "@/components/ui/card";
import { User } from "lucide-react";
import { AvatarPreview } from "@/components/profile/AvatarPreview";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api"
import { DashboardApiService } from "@/services/dashboardApi";
import ConquistasCard from "@/components/dashboard/ConquistasCard";
import InnovCoinsCard from "@/components/dashboard/InnovCoinsCard";
import RankingCard from "@/components/dashboard/RankingCard";
import { EvolutionCharts } from "@/components/evolution/EvolutionCharts";
import type { ProcessedEvolutionData } from "@/components/evolution/EvolutionCharts";
import { processComparisonData } from "@/utils/evolution/evolutionDataProcessor";
import { studentComparisonToComparisonResponse } from "@/utils/studentComparisonAdapter";
import StudentFriendlyResultCard from "@/components/dashboard/StudentFriendlyResultCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronRight, X, Sparkles, Trophy, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

// Interface para avaliações do aluno
interface StudentEvaluation {
  id: string;
  titulo: string;
  data_aplicacao: string;
  disciplina: string;
  total_disciplinas: number;
  total_questions: number;
  serie: string;
  escola: string;
  turma?: string;
  type?: string;
}

/** Formata data/hora ISO ou string genérica para formato legível em PT-BR */
function formatDataAplicacaoHuman(value: string): string {
  if (!value || value === "—") return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const dia = d.getDate();
  const mes = d.toLocaleDateString("pt-BR", { month: "short" });
  const ano = d.getFullYear();
  const horas = d.getHours();
  const minutos = d.getMinutes();
  if (horas === 0 && minutos === 0) {
    return `${dia} de ${mes} de ${ano}`;
  }
  const h = String(horas).padStart(2, "0");
  const m = String(minutos).padStart(2, "0");
  return `${dia} de ${mes} de ${ano} às ${h}h${m}`;
}

// Interface para dados específicos de uma avaliação
interface StudentEvaluationResults {
  test_id: string;
  student_id: string;
  student_db_id: string;
  total_questions: number;
  answered_questions: number;
  correct_answers: number;
  score_percentage: number;
  total_score: number;
  max_possible_score: number;
  proficiency: number;
  proficiencia: number; // Campo com acento da API
  grade: number;
  classification: string;
  classificacao: string; // Campo com acento da API
  calculated_at: string;
  answers: unknown[];
  rankings?: {
    class?: ApiRankingGroup;
    school?: ApiRankingGroup;
    municipality?: ApiRankingGroup;
  };
}

// Interface para avaliações completadas do aluno
interface StudentCompletedResponse {
  student: {
    id: string;
    name: string;
    user_id: string;
  };
  total_completed: number;
  returned_count: number;
  pagination: {
    limit: number;
    offset: number;
    has_more: boolean;
  };
  evaluations: Array<{
    test_id: string;
    title: string;
    description: string;
    type: string;
    subject: {
      id: string;
      name: string;
    };
    grade: {
      id: string;
      name: string;
    };
    subjects_info: Array<{
      id: string;
      name: string;
    }>;
    total_questions: number;
    application_info: {
      application: string;
      expiration: string;
    };
    student_results: {
      correct_answers: number;
      total_questions: number;
      score_percentage: number;
      grade: number;
      proficiency: number;
      classification: string;
      calculated_at: string;
    };
  }>;
}

// Interface para dados de comparação entre avaliações
interface StudentCompareResponse {
  student: {
    id: string;
    user_id: string;
    name: string;
  };
  evaluations: Array<{
    order: number;
    id: string;
    title: string;
    created_at: string;
    application_date: string;
  }>;
  total_evaluations: number;
  comparisons: Array<{
    from_evaluation: {
      id: string;
      title: string;
      order: number;
    };
    to_evaluation: {
      id: string;
      title: string;
      order: number;
    };
    general_comparison: {
      student_grade: {
        evaluation_1: number;
        evaluation_2: number;
        evolution: EvolutionData;
      };
      student_proficiency: {
        evaluation_1: number;
        evaluation_2: number;
        evolution: EvolutionData;
      };
      student_classification: {
        evaluation_1: string;
        evaluation_2: string;
      };
      correct_answers: {
        evaluation_1: number;
        evaluation_2: number;
        evolution: EvolutionData;
      };
      total_questions: {
        evaluation_1: number;
        evaluation_2: number;
      };
      score_percentage: {
        evaluation_1: number;
        evaluation_2: number;
        evolution: EvolutionData;
      };
    };
    subject_comparison: Record<string, {
      subject_id: string;
      student_grade: {
        evaluation_1: number;
        evaluation_2: number;
        evolution: EvolutionData;
      };
      student_proficiency: {
        evaluation_1: number;
        evaluation_2: number;
        evolution: EvolutionData;
      };
      student_classification: {
        evaluation_1: string;
        evaluation_2: string;
      };
      correct_answers: {
        evaluation_1: number;
        evaluation_2: number;
        evolution: EvolutionData;
      };
      total_questions: {
        evaluation_1: number;
        evaluation_2: number;
      };
    }>;
  }>;
  total_comparisons: number;
}

interface EvolutionData {
  value: number;
  percentage: number;
  direction: 'increase' | 'decrease' | 'stable';
}

interface ApiRankingEntry {
  position: number;
  student_id: string;
  student_name: string;
  proficiency: number | string;
}

interface ApiRankingGroup {
  position?: number;
  total_students?: number;
  current_student?: ApiRankingEntry;
  ranking?: ApiRankingEntry[];
}

interface RankingCardData {
  posicaoAtual: number;
  pontos: number;
  mudancaPosicao: number;
  lista: Array<{
    id: number;
    nome: string;
    acertos: number;
    total: number;
    posicao: number;
    pontos: number;
    avatar?: string;
    profile_picture?: string | null;
    avatar_config?: Record<string, unknown> | null;
  }>;
  proximoObjetivo: {
    posicao: number;
    pontosNecessarios: number;
    progresso: number;
  };
}

interface StudentStats {
  proficiencia: { value: number; change: number; trend: 'up' | 'down' };
  nota: { value: number; change: number; trend: 'up' | 'down' };
  nivel: { value: string; change: number; trend: 'up' | 'down' };
  acertos: { value: number; change: number; trend: 'up' | 'down' };
  medalhas: { 
    total: number; 
    percentage: number;
    conquistadas: Array<{
      id: string;
      nome: string;
      tipo: 'ouro' | 'prata' | 'bronze';
      icone: string;
      descricao: string;
    }>;
    proximas: Array<{
      id: string;
      nome: string;
      requisito: string;
      progresso: number;
    }>;
  };
  moedas: { 
    total: number;
    ganhasHoje: number;
    historico: Array<{
      data: string;
      acao: string;
      valor: number;
    }>;
    loja: Array<{
      item: string;
      preco: number;
      disponivel: boolean;
    }>;
  };
  ranking: {
    posicaoAtual: number;
    pontos: number;
    mudancaPosicao: number;
    lista: Array<{
      id: number;
      nome: string;
      acertos: number;
      total: number;
      posicao: number;
      pontos: number;
      avatar?: string;
    }>;
    proximoObjetivo: {
      posicao: number;
      pontosNecessarios: number;
      progresso: number;
    };
  };
  estatisticas: {
    semana: Array<{ day: string; nota: number; avaliacao: string }>;
    mes: Array<{ week: string; nota: number; avaliacoes: number }>;
    ano: Array<{ month: string; nota: number; avaliacoes: number }>;
    resumo: {
      media: number;
      melhorNota: number;
      streak: number;
      metaAlcancada: boolean;
      progresso: number;
      totalAvaliacoes: number;
      tendencia: 'up' | 'down' | 'stable';
    };
  };
}

const emptyRankingCardData: RankingCardData = {
  posicaoAtual: 0,
  pontos: 0,
  mudancaPosicao: 0,
  lista: [],
  proximoObjetivo: {
    posicao: 1,
    pontosNecessarios: 0,
    progresso: 0
  }
};

const normalizeNumber = (value: unknown): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(',', '.'));
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const hasRankingPerformance = (value: unknown): boolean => normalizeNumber(value) > 0;

const transformRankingGroupToCardData = (group?: ApiRankingGroup): RankingCardData => {
  if (!group || !group.current_student) {
    return { ...emptyRankingCardData };
  }

  const rankingList = (group.ranking ?? [])
    .filter((item) => hasRankingPerformance(item.proficiency))
    .map((item) => ({
      id: item.position,
      nome: item.student_name,
      acertos: 0,
      total: 0,
      posicao: item.position,
      pontos: normalizeNumber(item.proficiency)
    }));

  const currentPosition = group.current_student?.position ?? group.position ?? 0;
  const currentProficiency = normalizeNumber(group.current_student?.proficiency);
  const previousRank = rankingList.find((item) => item.posicao === currentPosition - 1);
  const pontosNecessarios = previousRank
    ? Math.max(0, normalizeNumber(previousRank.pontos) - currentProficiency)
    : 0;

  const progresso = group.total_students && currentPosition
    ? Math.round(((group.total_students - currentPosition + 1) / group.total_students) * 100)
    : 0;

  return {
    posicaoAtual: currentPosition,
    pontos: currentProficiency,
    mudancaPosicao: 0,
    lista: rankingList,
    proximoObjetivo: {
      posicao: Math.max(1, currentPosition - 1),
      pontosNecessarios,
      progresso: Math.min(100, Math.max(0, progresso))
    }
  };
};

const StudentDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rankingFilter, setRankingFilter] = useState<"turma" | "escola">("turma");
  
  // Estados para avaliações
  const [evaluations, setEvaluations] = useState<StudentEvaluation[]>([]);
  const [selectedEvaluation, setSelectedEvaluation] = useState<string | null>(null);
  const [evaluationResults, setEvaluationResults] = useState<StudentEvaluationResults | null>(null);
  const [isLoadingEvaluations, setIsLoadingEvaluations] = useState(true);
  
  // Estados para gráfico de evolução (comparação dinâmica) — mesmo formato e gráficos da Evolution.tsx
  const [comparisonData, setComparisonData] = useState<StudentCompareResponse | null>(null);
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const processedComparisonData = useMemo((): ProcessedEvolutionData | null => {
    const adapted = studentComparisonToComparisonResponse(comparisonData);
    return adapted ? processComparisonData(adapted) : null;
  }, [comparisonData]);

  // Barra de carregamento ao adicionar avaliação à comparação (valor animado 0–90)
  const [comparisonProgress, setComparisonProgress] = useState(0);
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
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [evaluationIdsForComparison, setEvaluationIdsForComparison] = useState<string[]>([]);
  const [resultsByEvaluationId, setResultsByEvaluationId] = useState<Record<string, StudentEvaluationResults>>({});

  // Ref para rastrear a última avaliação carregada e evitar chamadas duplicadas
  const lastLoadedEvaluationRef = useRef<string | null>(null);

  // Ranking independente da avaliação (GET /dashboard/ranking-alunos)
  const [dashboardRanking, setDashboardRanking] = useState<RankingCardData | null>(null);
  const [isLoadingRanking, setIsLoadingRanking] = useState(true);
  // ID do aluno (tabela Student) para bater com student_id do ranking
  const [currentStudentId, setCurrentStudentId] = useState<string | null>(null);
  // IDs para ranking por escopo (turma, escola, município)
  const [rankingScopeIds, setRankingScopeIds] = useState<{
    class_id: string | null;
    school_id: string | null;
    city_id: string | null;
  }>({ class_id: null, school_id: null, city_id: null });

  // Atualizar saldo de moedas após resgatar conquista
  const [refreshCoinsTrigger, setRefreshCoinsTrigger] = useState(0);

  // Dados mockados baseados na imagem + dados de estatísticas
  const mockStats: StudentStats = useMemo(() => ({
    proficiencia: { value: 119, change: 2.1, trend: 'up' },
    nota: { value: 6.5, change: -3.4, trend: 'down' },
    nivel: { value: 'Abaixo do Básico', change: -3.1, trend: 'down' },
    acertos: { value: 18, change: 2.4, trend: 'up' },
    medalhas: { 
      total: 4, 
      percentage: 60,
      conquistadas: [
        { id: '1', nome: 'Primeira Nota 10', tipo: 'ouro', icone: '🏆', descricao: 'Primeira nota máxima' },
        { id: '2', nome: 'Streak 7 dias', tipo: 'prata', icone: '🔥', descricao: 'Uma semana consecutiva' },
        { id: '3', nome: 'Top 10', tipo: 'bronze', icone: '⭐', descricao: 'Entre os 10 melhores' },
      ],
      proximas: [
        { id: '4', nome: 'Estudioso', requisito: '5 avaliações em sequência', progresso: 60 },
        { id: '5', nome: 'Matemático', requisito: '3 notas 10 em matemática', progresso: 33 },
      ]
    },
    moedas: { 
      total: 21,
      ganhasHoje: 5,
      historico: [
        { data: 'hoje', acao: 'Avaliação Matemática', valor: 5 },
        { data: 'ontem', acao: 'Streak 3 dias', valor: 3 },
        { data: '2 dias', acao: 'Primeira Medalha', valor: 10 },
      ],
      loja: [
        { item: 'Avatar personalizado', preco: 50, disponivel: true },
        { item: 'Tema especial', preco: 100, disponivel: true },
        { item: 'Badge exclusivo', preco: 200, disponivel: false },
      ]
    },
    ranking: {
      ...emptyRankingCardData,
    },
    estatisticas: {
      semana: [
        { day: 'Seg', nota: 7.2, avaliacao: 'Matemática' },
        { day: 'Ter', nota: 8.5, avaliacao: 'Português' },
        { day: 'Qua', nota: 6.8, avaliacao: 'História' },
        { day: 'Qui', nota: 9.1, avaliacao: 'Ciências' },
        { day: 'Sex', nota: 7.7, avaliacao: 'Geografia' },
        { day: 'Sáb', nota: 8.9, avaliacao: 'Inglês' },
        { day: 'Dom', nota: 7.5, avaliacao: 'Arte' },
      ],
      mes: [
        { week: 'Sem 1', nota: 7.8, avaliacoes: 12 },
        { week: 'Sem 2', nota: 8.2, avaliacoes: 15 },
        { week: 'Sem 3', nota: 7.1, avaliacoes: 10 },
        { week: 'Sem 4', nota: 8.6, avaliacoes: 18 },
      ],
      ano: [
        { month: 'Jan', nota: 7.2, avaliacoes: 45 },
        { month: 'Fev', nota: 7.8, avaliacoes: 52 },
        { month: 'Mar', nota: 8.1, avaliacoes: 48 },
        { month: 'Abr', nota: 7.5, avaliacoes: 51 },
        { month: 'Mai', nota: 8.3, avaliacoes: 49 },
        { month: 'Jun', nota: 7.9, avaliacoes: 47 },
      ],
      resumo: {
        media: 7.8,
        melhorNota: 9.1,
        streak: 12,
        metaAlcancada: true,
        progresso: 78,
        totalAvaliacoes: 124,
        tendencia: 'up'
      }
    }
  }), []);

  // Função para obter dados do ranking baseado no filtro
  const getCurrentRankingData = () => {
    const rankings = evaluationResults?.rankings;
    const rankingKeyMap: Record<typeof rankingFilter, keyof NonNullable<StudentEvaluationResults['rankings']>> = {
      turma: 'class',
      escola: 'school'
    };

    if (rankings) {
      const apiGroup = rankings[rankingKeyMap[rankingFilter]];
      const transformed = transformRankingGroupToCardData(apiGroup);

      if (transformed.lista.length > 0 || transformed.posicaoAtual > 0) {
        return transformed;
      }
    }

    if (stats?.ranking && stats.ranking.lista.length > 0) {
      return stats.ranking;
    }

    return emptyRankingCardData;
  };

  // Função para alterar filtro do ranking
  const handleRankingFilterChange = (filter: 'turma' | 'escola') => {
    setRankingFilter(filter);
  };

  // Função para mapear dados completados para formato de avaliações
  const mapCompletedToEvaluations = (apiData: StudentCompletedResponse): StudentEvaluation[] => {
    const evaluations = apiData?.evaluations ?? [];
    if (!Array.isArray(evaluations)) return [];

    return evaluations.map(evaluation => {
      const subjects = evaluation.subjects_info ?? [];
      const firstSubject = evaluation.subject?.name ?? subjects[0]?.name ?? '—';
      const totalDisciplinas = subjects.length > 0 ? subjects.length : (evaluation.subject?.name ? 1 : 0) || 1;
      return {
        id: evaluation.test_id,
        titulo: evaluation.title ?? '—',
        disciplina: firstSubject,
        total_disciplinas: totalDisciplinas,
        total_questions: evaluation.total_questions ?? 0,
        data_aplicacao: evaluation.application_info?.application ?? '—',
        serie: evaluation.grade?.name ?? '—',
        escola: apiData?.student?.name ?? '—',
        turma: evaluation.grade?.name ?? '—',
        type: evaluation.type
      };
    });
  };

  // Função para buscar avaliações do aluno
  const fetchStudentEvaluations = useCallback(async (_userId: string): Promise<StudentEvaluation[]> => {
    const response = await api.get(`/test/student/completed`);
    const completedData: StudentCompletedResponse = response.data ?? {};
    const mappedEvaluations = mapCompletedToEvaluations(completedData);
    const filteredEvaluations = mappedEvaluations.filter((evaluation) => {
      const type = evaluation.type?.toLowerCase() ?? "";
      const isOlimpiada = type.includes("olimpi");
      const isCompeticao = type.includes("compet");
      return !isOlimpiada && !isCompeticao;
    })
    return filteredEvaluations
  }, []);

  // Função para buscar dados específicos de uma avaliação
  const fetchEvaluationResults = async (testId: string, studentId: string): Promise<StudentEvaluationResults> => {
    const response = await api.get(`/evaluation-results/${testId}/student/${studentId}/results`);
    return response.data;
  };

  // Função para buscar dados de comparação entre avaliações
  const fetchStudentComparison = async (studentId: string, testIds: string[]): Promise<StudentCompareResponse> => {
    // Primeiro buscar avaliações completadas para validar
    const completedResponse = await api.get(`/test/student/completed`);
    const completedData: StudentCompletedResponse = completedResponse.data ?? {};
    const evaluationsList = completedData.evaluations ?? [];
    
    // Filtrar apenas as avaliações solicitadas que existem nas completadas
    const availableTestIds = evaluationsList
      .map((evaluation) => evaluation.test_id)
      .filter((id) => testIds.includes(id));

    if (availableTestIds.length === 0) {
      throw new Error('Nenhuma avaliação completada encontrada para comparação');
    }
    
    const response = await api.post("/test/student/compare", {
      student_id: studentId,
      test_ids: availableTestIds,
    })
    return response.data;
  };

  // Função para mapear dados específicos de uma avaliação para a interface atual
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mapEvaluationResultsToStats = useCallback((evaluationResults: StudentEvaluationResults, _selectedEval: StudentEvaluation): StudentStats => {
    const classification = evaluationResults.classificacao || evaluationResults.classification || "N/A";
    const proficiency = normalizeNumber(evaluationResults.proficiencia ?? evaluationResults.proficiency);

    const gradeValue = normalizeNumber(evaluationResults.grade);
    const correctAnswers = normalizeNumber(evaluationResults.correct_answers);

    const rankingFromApi =
      [
        evaluationResults.rankings?.class,
        evaluationResults.rankings?.school,
        evaluationResults.rankings?.municipality,
      ]
        .map((group) => transformRankingGroupToCardData(group))
        .find((data) => data.lista.length > 0 || data.posicaoAtual > 0) ?? emptyRankingCardData;

    const rankingData = rankingFromApi.lista.length > 0 ? rankingFromApi : emptyRankingCardData;
    
    return {
      proficiencia: { 
        value: proficiency, 
        change: 0, 
        trend: 'up' 
      },
      nota: { 
        value: gradeValue, 
        change: 0, 
        trend: 'up' 
      },
      nivel: { 
        value: classification, 
        change: 0, 
        trend: 'up' 
      },
      acertos: { 
        value: correctAnswers, 
        change: 0, 
        trend: 'up' 
      },
      // Manter dados gamificados como mockados
      medalhas: mockStats.medalhas,
      moedas: mockStats.moedas,
      ranking: rankingData,
      estatisticas: {
        semana: [
          { day: 'Seg', nota: 7.2, avaliacao: 'Matemática' },
          { day: 'Ter', nota: 8.5, avaliacao: 'Português' },
          { day: 'Qua', nota: 6.8, avaliacao: 'História' },
          { day: 'Qui', nota: 9.1, avaliacao: 'Ciências' },
          { day: 'Sex', nota: 7.7, avaliacao: 'Geografia' },
          { day: 'Sáb', nota: 8.9, avaliacao: 'Inglês' },
          { day: 'Dom', nota: 7.5, avaliacao: 'Arte' },
        ],
        mes: [
          { week: 'Sem 1', nota: 7.8, avaliacoes: 12 },
          { week: 'Sem 2', nota: 8.2, avaliacoes: 15 },
          { week: 'Sem 3', nota: 7.1, avaliacoes: 10 },
          { week: 'Sem 4', nota: 8.6, avaliacoes: 18 },
        ],
        ano: [
          { month: 'Jan', nota: 7.2, avaliacoes: 45 },
          { month: 'Fev', nota: 7.8, avaliacoes: 52 },
          { month: 'Mar', nota: 8.1, avaliacoes: 48 },
          { month: 'Abr', nota: 7.5, avaliacoes: 51 },
          { month: 'Mai', nota: 8.3, avaliacoes: 49 },
          { month: 'Jun', nota: 7.9, avaliacoes: 47 },
        ],
        resumo: {
          media: evaluationResults.grade,
          melhorNota: evaluationResults.grade,
          streak: 1,
          metaAlcancada: evaluationResults.grade >= 7.0,
          progresso: Math.min(100, (evaluationResults.grade / 10) * 100),
          totalAvaliacoes: 1,
          tendencia: evaluationResults.grade >= 7.0 ? 'up' : 'stable'
        }
      }
    };
  }, []);

  // Função para carregar dados de uma avaliação específica
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadEvaluationData = useCallback(async (evaluationId: string) => {
    if (!user?.id || !evaluationId) return;

    const evaluation = evaluations.find((e) => e.id === evaluationId);
    if (evaluation) {
      const type = evaluation.type?.toLowerCase() ?? "";
      if (type.includes("olimpi")) return;
    }

    if (evaluationId !== selectedEvaluation) return;

    try {
      const evaluationResults = await fetchEvaluationResults(evaluationId, user.id);
      const selectedEval = evaluations.find(evaluation => evaluation.id === evaluationId);
      
      if (selectedEval) {
        // Validar novamente antes de setar os dados
        if (evaluationId === selectedEvaluation) {
          const mappedStats = mapEvaluationResultsToStats(evaluationResults, selectedEval);
          setStats(mappedStats);
          setEvaluationResults(evaluationResults);
          setResultsByEvaluationId((prev) => ({ ...prev, [evaluationId]: evaluationResults }));
          lastLoadedEvaluationRef.current = evaluationId;
        }
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados da avaliação selecionada.",
        variant: "destructive",
      });
    }
  }, [user?.id, evaluations, selectedEvaluation, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (hasLoadedData || !user?.id) return;
    
    const loadStudentData = async () => {
      try {
        setIsLoading(true);
        setIsLoadingEvaluations(true);
        setHasLoadedData(true);
        
        if (!user?.id) {
          throw new Error('ID do usuário não encontrado');
        }

        // Buscar apenas a lista de avaliações (nada pré-selecionado)
        const studentEvaluations = await fetchStudentEvaluations(user.id);
        setEvaluations(studentEvaluations)
          
      } catch (error) {
        toast({
          title: "Erro",
          description: "Não foi possível carregar seus dados.",
          variant: "destructive",
        });
        setHasLoadedData(false);
        setStats(null);
      } finally {
        setIsLoading(false);
        setIsLoadingEvaluations(false);
      }
    };

    loadStudentData();
  }, [user?.id]);

  // Buscar ID do aluno e IDs de escopo (turma, escola, município) para o ranking
  useEffect(() => {
    if (!user?.id || user?.role !== "aluno") return;
    let cancelled = false;
    api.get("/students/me")
      .then((res) => {
        if (cancelled) return;
        const data = res.data ?? {};
        const id = data.id ?? data.student_id ?? data.user_id ?? null;
        if (id) setCurrentStudentId(String(id));
        const turma = Array.isArray(data.turmas) && data.turmas.length > 0 ? data.turmas[0] : null;
        const vinculo = Array.isArray(data.vinculos_escolares) && data.vinculos_escolares.length > 0 ? data.vinculos_escolares[0] : null;
        setRankingScopeIds({
          class_id: data.class_id ?? turma?.class_id ?? null,
          school_id: data.school_id ?? turma?.school_id ?? null,
          city_id: data.city_id ?? vinculo?.school_city_id ?? data.school_city_id ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentStudentId(null);
          setRankingScopeIds({ class_id: null, school_id: null, city_id: null });
        }
      });
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  // Ranking independente da avaliação: GET /dashboard/ranking-alunos com scope (turma | escola | municipio)
  useEffect(() => {
    if (!user?.id) return;
    const scope = rankingFilter;
    let cancelled = false;
    setIsLoadingRanking(true);
    const studentIdToMatch = currentStudentId ?? user.id;
    DashboardApiService.getStudentRanking({
      scope,
      class_id: scope === "turma" ? rankingScopeIds.class_id : undefined,
      school_id: scope === "escola" ? rankingScopeIds.school_id : undefined,
      city_id: undefined,
      limit: 30,
      meta: rankingScopeIds.city_id ? { cityId: rankingScopeIds.city_id } : undefined,
    })
      .then((data) => {
        if (cancelled || !data?.ranking?.length) {
          setDashboardRanking(null);
          return;
        }
        const list = (data.ranking ?? []).filter((r) => {
          const completedEvaluations = Number(r.completed_evaluations ?? 0);
          return completedEvaluations > 0 && hasRankingPerformance(r.media);
        });
        if (!list.length) {
          setDashboardRanking(null);
          return;
        }
        const currentItem = list.find(
          (r) => String(r.student_id) === String(studentIdToMatch) || String(r.student_id) === String(user.id)
        );
        const posicaoAtual = currentItem?.position ?? 0;
        const pontos = currentItem ? Number(currentItem.media) : 0;
        const parseAvatarConfig = (val: unknown): Record<string, unknown> | null => {
          if (val == null) return null;
          if (typeof val === "object" && !Array.isArray(val)) return val as Record<string, unknown>;
          if (typeof val === "string") {
            try {
              const parsed = JSON.parse(val) as Record<string, unknown>;
              return parsed && typeof parsed === "object" ? parsed : null;
            } catch {
              return null;
            }
          }
          return null;
        };
        const lista = list.map((r) => ({
          id: r.position,
          nome: r.name,
          acertos: 0,
          total: 0,
          posicao: r.position,
          pontos: Number(r.media),
          profile_picture: r.profile_picture ?? null,
          avatar_config: parseAvatarConfig(r.avatar_config),
          medalha: r.medalha ?? null,
          serie: r.serie ?? "",
          class_name: r.class_name ?? "",
          school_name: r.school_name ?? "",
          avaliacoes: r.completed_evaluations ?? 0,
        }));
        const previousPosition = currentItem && currentItem.position > 1 ? list.find((r) => r.position === currentItem.position - 1) : null;
        const pontosNecessarios = previousPosition ? Math.max(0, Number(previousPosition.media) - pontos) : 0;
        const progresso = previousPosition && Number(previousPosition.media) > pontos
          ? Math.min(100, Math.round((pontos / Number(previousPosition.media)) * 100))
          : 0;
        setDashboardRanking({
          posicaoAtual,
          pontos,
          mudancaPosicao: 0,
          lista,
          proximoObjetivo: {
            posicao: currentItem && currentItem.position > 1 ? currentItem.position - 1 : 1,
            pontosNecessarios,
            progresso,
          },
        });
      })
      .catch(() => setDashboardRanking(null))
      .finally(() => { if (!cancelled) setIsLoadingRanking(false); });
    return () => { cancelled = true; };
  }, [user?.id, currentStudentId, rankingFilter, rankingScopeIds.class_id, rankingScopeIds.school_id, rankingScopeIds.city_id]);

  // Sincronizar selectedEvaluation com o primeiro id da lista de comparação
  useEffect(() => {
    const first = evaluationIdsForComparison[0] ?? null;
    setSelectedEvaluation(first);
    if (first === null) {
      setEvaluationResults(null);
      setStats(null);
      setComparisonData(null);
      lastLoadedEvaluationRef.current = null;
    }
  }, [evaluationIdsForComparison]);

  // useEffect que monitora selectedEvaluation e carrega dados automaticamente
  useEffect(() => {
    if (selectedEvaluation && user?.id && evaluations.length > 0) {
      const evaluationExists = evaluations.find((e) => e.id === selectedEvaluation);
      if (evaluationExists && lastLoadedEvaluationRef.current !== selectedEvaluation) {
        loadEvaluationData(selectedEvaluation);
      }
    }
  }, [selectedEvaluation, user?.id, evaluations.length, loadEvaluationData]);

  // Carregar resultados das avaliações selecionadas para comparação (2ª a 4ª, se ainda não carregados)
  useEffect(() => {
    if (evaluationIdsForComparison.length < 2 || !user?.id) return;
    const idsToLoad = evaluationIdsForComparison.slice(1).filter((id) => !resultsByEvaluationId[id]);
    if (idsToLoad.length === 0) return;
    const loadMissing = async () => {
      for (const evalId of idsToLoad) {
        try {
          const data = await fetchEvaluationResults(evalId, user!.id);
          setResultsByEvaluationId((prev) => ({ ...prev, [evalId]: data }));
        } catch {
          // ignore
        }
      }
    };
    loadMissing();
  }, [evaluationIdsForComparison, user?.id]);

  const loadComparisonData = useCallback(async (testIds: string[]) => {
    if (!user?.id || testIds.length < 2) return;
    try {
      setIsLoadingComparison(true);
      const comparisonResponse = await fetchStudentComparison(user.id, testIds);
      setComparisonData(comparisonResponse);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados de comparação entre avaliações.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingComparison(false);
    }
  }, [user?.id, toast]);

  // Comparação dinâmica: ao ter 2 selecionadas, buscar dados e exibir gráfico
  useEffect(() => {
    if (evaluationIdsForComparison.length >= 2 && user?.id) {
      loadComparisonData(evaluationIdsForComparison);
    } else {
      setComparisonData(null);
    }
  }, [evaluationIdsForComparison.join(","), user?.id, loadComparisonData]);

  const handleToggleEvaluation = useCallback((id: string) => {
    setEvaluationIdsForComparison((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? [...prev.slice(1), id] : [...prev, id]
    );
  }, []);





  if (isLoading) {
    return (
      <div className="container mx-auto py-6 px-4 min-h-screen">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse rounded-2xl border-2 border-violet-200/40 dark:border-violet-500/20">
              <CardContent className="p-6">
                <div className="h-20 bg-violet-200/50 dark:bg-violet-500/20 rounded-xl"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }


  return (
    <div className="container mx-auto py-4 sm:py-6 px-4 max-w-7xl space-y-6 sm:space-y-8 min-h-screen">
      {/* Hero: avatar + saudação — colorido e animado */}
      <header className="flex items-center gap-3 sm:gap-4 min-w-0 animate-fade-in-up">
        {user?.avatar_config ? (
          <div className="flex-shrink-0 relative">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 opacity-40 blur-xl animate-pulse" aria-hidden />
            <div className="relative ring-4 ring-violet-400/50 dark:ring-violet-400/30 rounded-full p-0.5 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-500 shadow-lg shadow-violet-500/25 transition-transform duration-300 hover:scale-105">
              <AvatarPreview
                config={user.avatar_config}
                size={56}
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border-2 border-background"
                aria-hidden
              />
            </div>
          </div>
        ) : (
          <div
            className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 shadow-lg shadow-fuchsia-500/30 animate-logo-float transition-transform duration-300 hover:scale-105"
            aria-hidden
          >
            <User className="w-6 h-6 sm:w-8 sm:h-8 text-white drop-shadow" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl lg:text-2xl font-bold truncate bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 dark:from-violet-400 dark:via-fuchsia-400 dark:to-pink-400 bg-clip-text text-transparent" id="dashboard-title">
            Olá, {user?.name || "Aluno"}!
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground font-medium">Bem vindo(a) ao sistema afirmeplay!</p>
          {evaluations.length > 0 && (
            <p className="text-xs mt-0.5 inline-flex items-center gap-1 rounded-full bg-violet-500/15 dark:bg-violet-400/20 text-violet-700 dark:text-violet-300 px-2.5 py-0.5 w-fit">
              <span className="size-1.5 rounded-full bg-violet-500 dark:bg-violet-400 animate-pulse" />
              {evaluations.length} {evaluations.length === 1 ? "avaliação concluída" : "avaliações concluídas"}
            </p>
          )}
        </div>
      </header>

      {/* Conquistas, Moedas, Ranking — mesmo tamanho sempre */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-stretch">
        <div className="h-full min-h-[320px] lg:min-h-[420px] flex flex-col transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-amber-500/15 rounded-2xl animate-fade-in-up">
          <ConquistasCard onRedeem={() => setRefreshCoinsTrigger((n) => n + 1)} />
        </div>
        <div className="h-full min-h-[320px] lg:min-h-[420px] flex flex-col transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-yellow-500/15 rounded-2xl animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
          <InnovCoinsCard refreshTrigger={refreshCoinsTrigger} />
        </div>
        <div className="h-full min-h-[320px] lg:min-h-[420px] flex flex-col transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-500/15 rounded-2xl animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            <RankingCard
            ranking={dashboardRanking ?? emptyRankingCardData}
            rankingFilter={rankingFilter}
            onRankingFilterChange={handleRankingFilterChange}
            isLoading={isLoadingRanking}
            userName={user?.name}
            currentUserAvatar={(() => {
              if (dashboardRanking?.lista?.length && dashboardRanking.posicaoAtual > 0) {
                const current = dashboardRanking.lista.find((i) => i.posicao === dashboardRanking.posicaoAtual);
                if (current?.profile_picture || (current?.avatar_config && Object.keys(current.avatar_config).length > 0))
                  return { profile_picture: current.profile_picture ?? undefined, avatar_config: current.avatar_config ?? undefined };
              }
              return { profile_picture: undefined, avatar_config: user?.avatar_config ?? undefined };
            })()}
          />
        </div>
      </div>

      {/* Suas avaliações — seção colorida e cards animados */}
      <section aria-labelledby="evaluations-heading" className="animate-fade-in-up">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
          <div>
            <h2 id="evaluations-heading" className="text-base sm:text-lg font-bold inline-flex items-center gap-2">
              <span className="bg-gradient-to-r from-violet-600 to-fuchsia-500 dark:from-violet-400 dark:to-fuchsia-400 bg-clip-text text-transparent">Suas avaliações</span>
              {evaluations.length > 0 && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gradient-to-r from-violet-500/25 to-fuchsia-500/25 text-violet-700 dark:text-violet-200 border border-violet-300/50 dark:border-violet-500/30 shadow-sm">
                  {evaluations.length}
                </span>
              )}
            </h2>
            {evaluations.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Cada prova concluída soma pontos e conquistas.</p>
            )}
          </div>
          {evaluations.length > 0 && (
            <Button variant="ghost" size="sm" className="group text-violet-600 dark:text-violet-400 hover:bg-violet-500/15 hover:text-violet-700 dark:hover:text-violet-300 transition-colors rounded-full" asChild>
              <Link to="/aluno/resultados">
                Ver todos os resultados
                <ArrowRight className="h-3.5 w-3.5 ml-1 transition-transform group-hover:translate-x-0.5 inline-block" />
              </Link>
            </Button>
          )}
        </div>
        {evaluations.length === 0 ? (
          <Card className="border-2 border-dashed border-violet-300/60 dark:border-violet-500/40 overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500/5 via-fuchsia-500/5 to-cyan-500/5 dark:from-violet-500/10 dark:via-fuchsia-500/10 dark:to-cyan-500/10">
            <CardContent className="py-10 sm:py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 dark:from-violet-500/30 dark:to-fuchsia-500/30 flex items-center justify-center mx-auto mb-4 animate-logo-float shadow-inner">
                <Trophy className="h-8 w-8 text-primary" />
              </div>
              <p className="font-bold text-foreground">Nenhuma avaliação concluída ainda</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Quando você concluir uma avaliação, ela aparecerá aqui. Você poderá ver seu resultado, medalhas e subir no ranking.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {evaluations.map((evaluation, index) => {
              const isSelected = evaluationIdsForComparison.includes(evaluation.id);
              const borderClasses = ["border-l-violet-400 dark:border-l-violet-500", "border-l-fuchsia-400 dark:border-l-fuchsia-500", "border-l-cyan-400 dark:border-l-cyan-500", "border-l-pink-400 dark:border-l-pink-500"];
              const borderClass = isSelected ? "border-l-violet-500 dark:border-l-violet-400" : borderClasses[index % borderClasses.length];
              return (
                <Card
                  key={evaluation.id}
                  className={`cursor-pointer transition-all duration-300 min-h-[44px] sm:min-h-[52px] rounded-xl border-l-4 ${borderClass} ${
                    isSelected
                      ? "ring-2 ring-violet-500 dark:ring-violet-400 bg-violet-500/10 dark:bg-violet-500/20 shadow-lg shadow-violet-500/20 hover:shadow-xl"
                      : "hover:bg-muted/50 hover:shadow-md hover:-translate-y-0.5"
                  }`}
                  onClick={() => handleToggleEvaluation(evaluation.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleToggleEvaluation(evaluation.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`${evaluation.titulo}, ${evaluation.disciplina}. ${isSelected ? "Selecionada. Clique para remover." : "Clique para ver resultado e comparar."}`}
                >
                  <CardContent className="p-3 sm:p-4 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate text-sm sm:text-base">{evaluation.titulo}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {evaluation.disciplina}
                        {evaluation.total_disciplinas > 1 && (
                          <span> +{evaluation.total_disciplinas - 1}</span>
                        )}
                        {" · "}
                        {formatDataAplicacaoHuman(evaluation.data_aplicacao)}
                        {evaluation.total_questions > 0 && (
                          <> · {evaluation.total_questions} {evaluation.total_questions === 1 ? "questão" : "questões"}</>
                        )}
                      </p>
                    </div>
                    {isSelected ? (
                      <Button type="button" variant="ghost" size="icon" className="flex-shrink-0 h-8 w-8 rounded-full hover:bg-violet-500/20" aria-label="Remover da seleção" onClick={(e) => { e.stopPropagation(); handleToggleEvaluation(evaluation.id); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    ) : (
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground group-hover:translate-x-0.5 transition-transform" aria-hidden />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        {evaluationIdsForComparison.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-violet-500 animate-pulse" />
            Selecione até 4 avaliações para ver resultado e comparar. Clique na avaliação ou no X para remover.
          </p>
        )}
      </section>

      {/* Resultado e comparação — seção colorida */}
      {evaluationIdsForComparison.length > 0 && (
        <section aria-labelledby="result-and-compare-heading" className="space-y-4 animate-fade-in-up">
          <h2 id="result-and-compare-heading" className="text-base sm:text-lg font-bold bg-gradient-to-r from-violet-600 to-cyan-500 dark:from-violet-400 dark:to-cyan-400 bg-clip-text text-transparent">
            Resultado e comparação
          </h2>
          {evaluationIdsForComparison.length === 1 && (() => {
            const firstId = evaluationIdsForComparison[0];
            const res = resultsByEvaluationId[firstId] ?? (firstId === selectedEvaluation ? evaluationResults : null);
            const gradeHigh = res && (res.grade ?? 0) >= 8;
            return (
            <>
              {gradeHigh && res && (
                <p className="text-sm font-bold flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 dark:from-emerald-500/30 dark:to-cyan-500/30 text-emerald-700 dark:text-emerald-300 px-4 py-2.5 border border-emerald-300/50 dark:border-emerald-500/30 shadow-sm">
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  Ótimo desempenho nesta avaliação! Continue assim.
                </p>
              )}
              {res ? (
                <StudentFriendlyResultCard
                  correctAnswers={res.correct_answers}
                  totalQuestions={res.total_questions}
                  grade={res.grade}
                  classification={res.classificacao || res.classification || ""}
                  evaluationTitle={evaluations.find((e) => e.id === firstId)?.titulo}
                />
              ) : (
                <Card className="rounded-2xl border-2 border-dashed border-violet-300/50 dark:border-violet-500/30 bg-violet-500/5">
                  <CardContent className="py-6 flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-200 border-t-violet-500 dark:border-t-violet-400" aria-label="Carregando resultado" />
                  </CardContent>
                </Card>
              )}
            </>
            );
          })()}
          {evaluationIdsForComparison.length >= 2 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {evaluationIdsForComparison.slice(0, 4).map((evalId) => {
                  const res = resultsByEvaluationId[evalId] ?? (evalId === selectedEvaluation ? evaluationResults : null);
                  const title = evaluations.find((e) => e.id === evalId)?.titulo;
                  if (!res) {
                    return (
                      <Card key={evalId} className="rounded-2xl border-2 border-dashed border-violet-300/50 bg-violet-500/5">
                        <CardContent className="py-6 flex justify-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-2 border-violet-200 border-t-violet-500" aria-label="Carregando" />
                        </CardContent>
                      </Card>
                    );
                  }
                  return (
                    <StudentFriendlyResultCard
                      key={evalId}
                      correctAnswers={res.correct_answers}
                      totalQuestions={res.total_questions}
                      grade={res.grade}
                      classification={res.classificacao || res.classification || ""}
                      evaluationTitle={title}
                    />
                  );
                })}
              </div>
              {isLoadingComparison && (
                <Card className="rounded-2xl border-2 border-dashed border-cyan-300/50 dark:border-cyan-500/30 bg-gradient-to-r from-cyan-500/5 to-violet-500/5">
                  <CardContent className="py-6 space-y-4">
                    <p className="text-sm font-medium text-center text-foreground">
                      Adicionando avaliação à comparação…
                    </p>
                    <Progress value={comparisonProgress} className="h-2 w-full" aria-label="Carregando comparação" />
                  </CardContent>
                </Card>
              )}
              {processedComparisonData && !isLoadingComparison && (
                <div className="w-full pt-2">
                  <EvolutionCharts data={processedComparisonData} isLoading={false} onlyOverviewTab />
                </div>
              )}
            </>
          )}
        </section>
      )}

    </div>
  )
};

export default StudentDashboard; 