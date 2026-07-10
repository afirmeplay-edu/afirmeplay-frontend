import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DisciplineTag } from "@/components/ui/discipline-tag";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  TrendingUp,
  Users,
  FileText,
  FileX,
  Eye,
  AlertTriangle,
  Target,
  Award,
  RefreshCw,
  School,
  MapPin,
  GraduationCap,
  Filter,
  BarChart3
} from "lucide-react";

import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EvaluationResultsApiService, REPORT_ENTITY_TYPE_ANSWER_SHEET } from "@/services/evaluation/evaluationResultsApi";
import { RelatorioCompleto } from "@/types/evaluation-results";
import { getClassShiftLabel } from "@/lib/classShift";
import { useAuth } from "@/context/authContext";
import { BarChartComponent, DonutChartComponent } from "@/components/ui/charts";
import { FilterComponentAnalise } from "@/components/filters";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { getUserHierarchyContext, getRestrictionMessage, validateReportAccess, UserHierarchyContext, cityIdQueryParamForAdmin } from "@/utils/userHierarchy";
import { normalizeRelatorioCompletoForAnaliseUI } from "@/utils/report/relatorioCompletoNormalize";
import { generateRelatorioOrganizadoPdf } from "@/services/reports/analiseAvaliacoesPdf";
import { formatDecimal1PtBr, formatPercent1PtBr } from "@/utils/numberFormat";
import { isDisciplinaGeralAggregateKey } from "@/utils/reports/presentation19/presentation19MunicipalMedia";

// Interfaces para os dados da API
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
  total_alunos: number;
  alunos_participantes: number;
  alunos_pendentes?: number;
  alunos_ausentes: number;
  media_nota: number;
  media_proficiencia: number;
  distribuicao_classificacao: {
    abaixo_do_basico: number;
    basico: number;
    adequado: number;
    avancado: number;
  };
  status?: 'concluida' | 'em_andamento' | 'pendente' | string;
}

// Interfaces para os filtros (movidas para FilterComponentAnalise)

// Mapa de status estático
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
      color: "bg-muted text-muted-foreground border-border"
    },
    agendada: {
      label: "Agendada",
      color: "bg-yellow-50 dark:bg-yellow-950/30 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800"
    },
    'concluído': {
      label: "Concluída",
      color: "bg-green-100 text-green-800 border-green-300"
    },
    'em andamento': {
      label: "Em Andamento",
      color: "bg-blue-100 text-blue-800 border-blue-300"
    },
    'finalizada': {
      label: "Concluída",
      color: "bg-green-100 text-green-800 border-green-300"
    },
    'finalizado': {
      label: "Concluída",
      color: "bg-green-100 text-green-800 border-green-300"
    },
    'agendado': {
      label: "Agendada",
      color: "bg-yellow-50 dark:bg-yellow-950/30 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800"
    }
  };

  const config = configs[status] || {
    label: "Desconhecido",
    color: "bg-muted text-muted-foreground border-border"
  };

  return config;
};

const formatDecimal = (value?: number | null) => formatDecimal1PtBr(value, "0,0");

type TurmaRowLike = {
  turma?: unknown;
  serie?: unknown;
  serie_nome?: unknown;
  grade?: unknown;
  ano?: unknown;
};

const formatTurmaLabel = (row: TurmaRowLike) => {
  const turma = typeof row?.turma === "string" ? row.turma.trim() : "";
  const serie =
    (typeof row?.serie === "string" && row.serie.trim()) ||
    (typeof row?.serie_nome === "string" && row.serie_nome.trim()) ||
    (typeof row?.grade === "string" && row.grade.trim()) ||
    (typeof row?.ano === "string" && row.ano.trim()) ||
    "";

  if (!serie) return turma;
  if (!turma) return serie;
  // Evita duplicar se a API já mandar algo como "9º Ano 9º A"
  if (turma.toLowerCase().includes(serie.toLowerCase())) return turma;
  return `${serie} ${turma}`.trim();
};

export default function AnaliseAvaliacoes() {
  const { autoLogin, user } = useAuth();
  const [apiData, setApiData] = useState<RelatorioCompleto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isGeneratingOrganizedPdf, setIsGeneratingOrganizedPdf] = useState(false);
  const [isProcessingReport, setIsProcessingReport] = useState(false);
  const [processingTime, setProcessingTime] = useState(0);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Estados dos filtros
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('all');
  const [selectedSchool, setSelectedSchool] = useState<string>('all');
  const [selectedEvaluation, setSelectedEvaluation] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [reportAnswerSheet, setReportAnswerSheet] = useState(false);

  // Estados para hierarquia do usuário
  const [userHierarchyContext, setUserHierarchyContext] = useState<UserHierarchyContext | null>(null);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(true);
  
  // Estado para determinar o modo de renderização (escola ou turma)
  const [renderMode, setRenderMode] = useState<'escola' | 'turma'>('turma');
  const normalizedRole = user?.role?.toLowerCase();
  const roleRequiresSpecificSchool = normalizedRole ? ['diretor', 'coordenador', 'professor'].includes(normalizedRole) : false;

  const adminCityIdQuery = useMemo(
    () => cityIdQueryParamForAdmin(user?.role, selectedMunicipality === 'all' ? undefined : selectedMunicipality),
    [user?.role, selectedMunicipality]
  );

  const handleStateChange = useCallback((stateId: string) => {
    if (stateId === selectedState) return;

    setSelectedState(stateId);
    setSelectedMunicipality('all');
    setSelectedSchool('all');
    setSelectedEvaluation('all');
    setApiData(null);
  }, [selectedState]);

  const handleMunicipalityChange = useCallback((municipalityId: string) => {
    if (municipalityId === selectedMunicipality) return;

    setSelectedMunicipality(municipalityId);
    setSelectedSchool('all');
    setSelectedEvaluation('all');
    setApiData(null);
  }, [selectedMunicipality]);

  // Estados dos dados dos filtros (movidos para FilterComponentAnalise)

  const fallbackSchools = useMemo(() => {
    const uniqueSchools = new Map<string, { id: string; name: string; municipalityId?: string }>();

    if (userHierarchyContext?.school?.id) {
      uniqueSchools.set(userHierarchyContext.school.id, {
        id: userHierarchyContext.school.id,
        name: userHierarchyContext.school.name,
        municipalityId: userHierarchyContext.school.municipality_id,
      });
    }

    if (Array.isArray(userHierarchyContext?.classes)) {
      userHierarchyContext!.classes!.forEach((classe) => {
        if (classe.school_id) {
          uniqueSchools.set(classe.school_id, {
            id: classe.school_id,
            name: classe.school_name,
            municipalityId: userHierarchyContext?.municipality?.id,
          });
        }
      });
    }

    return Array.from(uniqueSchools.values());
  }, [userHierarchyContext]);

  // Verificar se o usuário tem permissão
  useEffect(() => {
    if (user && !['admin', 'professor', 'diretor', 'coordenador', 'tecadm'].includes(user.role)) {
      toast({
        title: "Acesso Negado",
        description: "Você não tem permissão para acessar esta página.",
        variant: "destructive",
      });
      navigate("/app");
      return;
    }
  }, [user, navigate, toast]);

  // Carregar contexto hierárquico do usuário
  useEffect(() => {
    const loadUserHierarchy = async () => {
      if (!user?.id || !user?.role) {
        setIsLoadingHierarchy(false);
        return;
      }

      try {
        setIsLoadingHierarchy(true);
        const context = await getUserHierarchyContext(user.id, user.role);
        setUserHierarchyContext(context);

        // Pre-selecionar filtros baseado na hierarquia
        if (context.municipality?.state) {
          try {
            const statesList = await EvaluationResultsApiService.getFilterStates();
            const matchedState = statesList.find(
              (state) =>
                state.id === context.municipality!.state ||
                state.nome?.toLowerCase() === context.municipality!.state.toLowerCase()
            );
            setSelectedState(matchedState ? matchedState.id : context.municipality.state);
          } catch (error) {
            console.error('Erro ao mapear estado do contexto:', error);
            setSelectedState(context.municipality.state);
          }
        }

        if (context.municipality) {
          setSelectedMunicipality(context.municipality.id);
        }

        if (context.school) {
          setSelectedSchool(context.school.id);
        }

        // Para professor, carregar escolas das suas turmas
        if (context.classes && Array.isArray(context.classes) && context.classes.length > 0) {
          const uniqueSchools = Array.from(new Set(context.classes.map(c => c.school_id)))
            .map(id => context.classes!.find(c => c.school_id === id))
            .filter(Boolean);

          if (uniqueSchools.length > 0) {
            setSelectedSchool(uniqueSchools[0]!.school_id);
          }
        }

      } catch (error) {
        console.error('Erro ao carregar contexto hierárquico:', error);
        toast({
          title: "Aviso",
          description: "Não foi possível carregar suas permissões. Algumas funcionalidades podem estar limitadas.",
          variant: "destructive"
        });
      } finally {
        setIsLoadingHierarchy(false);
      }
    };

    loadUserHierarchy();
  }, [user?.id, user?.role, toast]);

  // Inicialização e carregamento de filtros movido para FilterComponentAnalise
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
      setIsLoading(false);
    };

    initializeData();
  }, [autoLogin, toast]);

  // Verificar se todos os filtros obrigatórios estão selecionados
  // Estado e Município são obrigatórios, Escola pode ser "Todas", Avaliação é obrigatória
  const allRequiredFiltersSelected =
    selectedState !== 'all' &&
    selectedMunicipality !== 'all' &&
    selectedEvaluation !== 'all' &&
    (!roleRequiresSpecificSchool || selectedSchool !== 'all');



  const downloadOrganizedPdfLocal = async () => {
    if (!apiData) return;
    if (userHierarchyContext && user?.role) {
      const validation = validateReportAccess(
        user.role,
        {
          state: selectedState,
          municipality: selectedMunicipality,
          school: selectedSchool,
          evaluation: selectedEvaluation,
        } as unknown as { state?: string; municipality?: string; school?: string; grade?: string; class?: string },
        userHierarchyContext
      );
      if (!validation.isValid) {
        toast({
          title: "Acesso negado",
          description: validation.reason || "Você não tem permissão para gerar este relatório.",
          variant: "destructive",
        });
        return;
      }
    }
    try {
      setIsGeneratingOrganizedPdf(true);
      const normalized = normalizeRelatorioCompletoForAnaliseUI(apiData);
      await generateRelatorioOrganizadoPdf(normalized);
      toast({
        title: "Relatório baixado",
        description: "O PDF Análise das avaliações foi salvo no seu dispositivo.",
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Erro ao gerar PDF",
        description: "Não foi possível gerar o relatório no navegador. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingOrganizedPdf(false);
    }
  };

  // Carregar dados quando todos os filtros estiverem selecionados
  useEffect(() => {
    const loadData = async () => {
      if (allRequiredFiltersSelected) {
        try {
          setIsLoadingData(true);
          setIsProcessingReport(false);
          
          // Buscar relatório completo da avaliação selecionada
          // Determinar qual tipo de relatório buscar baseado na seleção da escola
          const options =
            selectedSchool !== 'all'
              ? {
                  schoolId: selectedSchool,
                  ...(selectedMunicipality !== 'all' ? { cityId: selectedMunicipality } : {}),
                }
              : { cityId: selectedMunicipality };
          const reportOptions = {
            ...options,
            ...(adminCityIdQuery ? { adminCityIdQuery } : {}),
            ...(reportAnswerSheet ? { reportEntityType: REPORT_ENTITY_TYPE_ANSWER_SHEET } : {}),
          };
          
          // ✅ NOVO: Verificar status antes de buscar (para mostrar feedback visual)
          let wasProcessing = false;
          let timerInterval: NodeJS.Timeout | null = null;
          
          try {
            const status = await EvaluationResultsApiService.checkReportStatus(selectedEvaluation, reportOptions);
            if (status.status === 'processing') {
              wasProcessing = true;
              setIsProcessingReport(true);
              setProcessingTime(0);
              
              // Iniciar timer para mostrar tempo decorrido
              timerInterval = setInterval(() => {
                setProcessingTime(prev => prev + 1);
              }, 1000);
              
              toast({
                title: "Gerando relatório",
                description: "O relatório está sendo processado. Isso pode levar alguns minutos...",
              });
            }
          } catch (statusError) {
            // Se não conseguir verificar status, continuar normalmente
            console.log('Não foi possível verificar status inicial:', statusError);
          }
          
          try {
            // Buscar relatório (método já implementa polling internamente)
            const relatorio = await EvaluationResultsApiService.getRelatorioCompleto(selectedEvaluation, reportOptions);
            
            // ✅ LOG: Ver o que está sendo retornado pela API
            console.log('📊 LOG - Resultado da rota getRelatorioCompleto:');
            console.log('  - Filtros aplicados:', {
              selectedState,
              selectedMunicipality,
              selectedSchool,
              selectedEvaluation,
              options
            });
            console.log('  - Dados completos retornados:', relatorio);
            console.log('  - total_alunos:', relatorio.total_alunos);
            console.log('  - por_escola:', relatorio.total_alunos?.por_escola);
            console.log('  - por_turma:', relatorio.total_alunos?.por_turma);
            console.log('  - niveis_aprendizagem:', relatorio.niveis_aprendizagem);
            console.log('  - proficiencia:', relatorio.proficiencia);
            console.log('  - nota_geral:', relatorio.nota_geral);
            
            // Limpar timer se existir
            if (timerInterval) {
              clearInterval(timerInterval);
            }
            
            setIsProcessingReport(false);
            setProcessingTime(0);
            setApiData(normalizeRelatorioCompletoForAnaliseUI(relatorio));
            
            // ✅ CORREÇÃO: Determinar o modo de renderização baseado na seleção da escola
            // Se uma escola específica foi selecionada (não "all"), mostrar turmas
            // Se "all" foi selecionado, mostrar escolas
            if (selectedSchool !== 'all') {
              // Escola específica selecionada -> mostrar turmas
              setRenderMode('turma');
              console.log('  - Modo definido como: turma (escola específica selecionada)');
            } else {
              // "Todas" as escolas -> mostrar escolas
              setRenderMode('escola');
              console.log('  - Modo definido como: escola (todas as escolas)');
            }
            
            if (wasProcessing) {
              toast({
                title: "Relatório pronto",
                description: "O relatório foi gerado com sucesso!",
              });
            }
          } finally {
            // Garantir que o timer seja limpo
            if (timerInterval) {
              clearInterval(timerInterval);
            }
          }
        } catch (error) {
          console.error("Erro ao carregar dados:", error);
          setIsProcessingReport(false);
          setProcessingTime(0);
          
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
          const isTimeout = errorMessage.includes('Timeout') || errorMessage.includes('timeout');
          
          toast({
            title: isTimeout ? "Timeout ao gerar relatório" : "Erro ao carregar dados",
            description: isTimeout 
              ? "O relatório está demorando mais que o esperado. Tente novamente em alguns instantes."
              : "Não foi possível carregar os dados da análise. Tente novamente.",
            variant: "destructive",
          });
        } finally {
          setIsLoadingData(false);
        }
      }
    };

    loadData();
  }, [allRequiredFiltersSelected, selectedState, selectedMunicipality, selectedSchool, selectedEvaluation, selectedPeriod, reportAnswerSheet, adminCityIdQuery, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Carregando...</span>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* Header — mobile: título/desc alinhados, badge centralizado abaixo */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
            <BarChart3 className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
            Análise das avaliações
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Análise detalhada das avaliações do seu município
          </p>
          {user?.role && (
            <p className="text-sm text-blue-600 mt-1">
              {getRestrictionMessage(user.role)}
            </p>
          )}
        </div>
        <div className="flex justify-center w-full sm:w-auto sm:justify-end">
          <Badge variant="outline" className="text-sm">
            {user?.role === 'admin' ? 'Administrador' :
             user?.role === 'professor' ? 'Professor' :
             user?.role === 'diretor' ? 'Diretor' :
             user?.role === 'coordenador' ? 'Coordenador' : 'Técnico Administrativo'}
          </Badge>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
        <Checkbox
          id="report-answer-sheet-analise"
          checked={reportAnswerSheet}
          onCheckedChange={(v) => {
            const checked = v === true;
            setReportAnswerSheet(checked);
            setSelectedEvaluation('all');
            setApiData(null);
          }}
        />
        <Label htmlFor="report-answer-sheet-analise" className="text-sm font-normal leading-snug cursor-pointer">
          Marque para ver relatórios de um cartão resposta
        </Label>
      </div>

      {/* Filtros */}
      <FilterComponentAnalise
        selectedState={selectedState}
        selectedMunicipality={selectedMunicipality}
        selectedSchool={selectedSchool}
        selectedEvaluation={selectedEvaluation}
        onStateChange={handleStateChange}
        onMunicipalityChange={handleMunicipalityChange}
        onSchoolChange={(schoolId) => {
          // Só limpar dados se a escola realmente mudou
          if (schoolId !== selectedSchool) {
            setApiData(null);
          }
          setSelectedSchool(schoolId);
        }}
        onEvaluationChange={(evaluationId) => {
          // Só limpar dados se a avaliação realmente mudou
          if (evaluationId !== selectedEvaluation) {
            setApiData(null);
          }
          setSelectedEvaluation(evaluationId);
        }}
        isLoadingFilters={isLoadingFilters}
        onLoadingChange={setIsLoadingFilters}
        reportEntityType={reportAnswerSheet ? REPORT_ENTITY_TYPE_ANSWER_SHEET : undefined}
        adminCityIdQuery={adminCityIdQuery}
        // Props para hierarquia
        userRole={user?.role}
        canSelectState={userHierarchyContext?.restrictions.canSelectState}
        canSelectMunicipality={userHierarchyContext?.restrictions.canSelectMunicipality}
        canSelectSchool={userHierarchyContext?.restrictions.canSelectSchool}
        fallbackSchools={fallbackSchools}
        // Prop para ordenação personalizada: Avaliação antes de Escola
        loadSchoolsAfterEvaluation={true}
        selectedPeriod={selectedPeriod}
        onPeriodChange={(p) => {
          setSelectedPeriod(p);
          setApiData(null);
        }}
      />

      {/* Mensagem quando não há filtros suficientes */}
      {!allRequiredFiltersSelected && !isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Filter className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              Selecione todos os filtros para continuar
            </h3>
            <p className="text-muted-foreground text-center max-w-md">
              Para visualizar a análise das avaliações, você precisa selecionar: <strong>Estado</strong>, <strong>Município</strong> e{" "}
              <strong>{reportAnswerSheet ? "cartão resposta" : "Avaliação"}</strong>. A <strong>Escola</strong> pode ser "Todas" para ver todas as escolas do município.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading dos dados */}
      {allRequiredFiltersSelected && isLoadingData && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-primary mb-4" />
            {isProcessingReport ? (
              <>
                <p className="text-lg font-medium text-foreground mb-2">Gerando relatório...</p>
                <p className="text-muted-foreground text-center max-w-md mb-2">
                  O relatório está sendo processado em background. Isso pode levar alguns minutos.
                </p>
                {processingTime > 0 && (
                  <p className="text-sm text-muted-foreground mb-4">
                    Tempo decorrido: {Math.floor(processingTime / 60)}m {processingTime % 60}s
                  </p>
                )}
                <div className="mt-4 w-full max-w-md">
                  <Progress value={undefined} className="h-2" />
                </div>
                <p className="text-xs text-muted-foreground mt-4 text-center max-w-md">
                  Por favor, aguarde. O processamento pode levar até 10 minutos para relatórios grandes.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Carregando dados da análise...</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dados da Análise */}
      {allRequiredFiltersSelected && !isLoadingData && apiData && (
        <div className="space-y-6">
          {/* Informações da Avaliação */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Informações da Avaliação
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={downloadOrganizedPdfLocal}
                    disabled={isGeneratingOrganizedPdf}
                    className="flex items-center gap-2"
                  >
                    {isGeneratingOrganizedPdf ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Baixando relatório...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Baixar relatório
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-lg font-medium mb-2">{apiData.avaliacao.titulo}</h4>
                  <p className="text-muted-foreground">{apiData.avaliacao.descricao}</p>
                </div>
                <div>
                  <h5 className="font-medium mb-2">Disciplinas:</h5>
                  <div className="flex flex-wrap gap-2">
                    {apiData.avaliacao.disciplinas?.map((disciplina: string, index: number) => (
                      <Badge key={index} variant="secondary">
                        {disciplina}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabela de Total de Alunos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Total de Alunos {renderMode === 'escola' ? 'por Escola' : 'por Turma'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-border">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border border-border px-4 py-2 text-left font-medium">
                        {renderMode === 'escola' ? 'Escola' : 'Série/Turma'}
                      </th>
                      {renderMode !== 'escola' ? (
                        <th className="border border-border px-4 py-2 text-left font-medium">Turno</th>
                      ) : null}
                      <th className="border border-border px-4 py-2 text-center font-medium">Matriculados</th>
                      <th className="border border-border px-4 py-2 text-center font-medium">Avaliados</th>
                      <th className="border border-border px-4 py-2 text-center font-medium">Percentual</th>
                      <th className="border border-border px-4 py-2 text-center font-medium">Faltosos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderMode === 'escola' 
                      ? apiData.total_alunos.por_escola?.map((escola, index: number) => (
                          <tr key={index} className="hover:bg-muted transition-colors">
                            <td className="border border-border px-4 py-2">{escola.escola}</td>
                            {renderMode !== 'escola' ? <td className="border border-border px-4 py-2">—</td> : null}
                            <td className="border border-border px-4 py-2 text-center">{escola.matriculados}</td>
                            <td className="border border-border px-4 py-2 text-center">{escola.avaliados}</td>
                            <td className="border border-border px-4 py-2 text-center">{formatPercent1PtBr(escola.percentual, "0,0%")}</td>
                            <td className="border border-border px-4 py-2 text-center">{escola.faltosos}</td>
                          </tr>
                        ))
                      : apiData.total_alunos.por_turma?.map((turma, index: number) => (
                          <tr key={index} className="hover:bg-muted transition-colors">
                            <td className="border border-border px-4 py-2">
                              {formatTurmaLabel(turma as unknown as TurmaRowLike) || String((turma as { turma?: string }).turma ?? "")}
                            </td>
                            <td className="border border-border px-4 py-2">
                              {getClassShiftLabel((turma as { shift?: string }).shift)}
                            </td>
                            <td className="border border-border px-4 py-2 text-center">{turma.matriculados}</td>
                            <td className="border border-border px-4 py-2 text-center">{turma.avaliados}</td>
                            <td className="border border-border px-4 py-2 text-center">{formatPercent1PtBr(turma.percentual, "0,0%")}</td>
                            <td className="border border-border px-4 py-2 text-center">{turma.faltosos}</td>
                          </tr>
                        ))}
                    <tr className="bg-blue-50 dark:bg-blue-950/30 font-semibold">
                      <td className="border border-border px-4 py-2">TOTAL GERAL</td>
                      {renderMode !== 'escola' ? <td className="border border-border px-4 py-2" /> : null}
                      <td className="border border-border px-4 py-2 text-center">{apiData.total_alunos.total_geral.matriculados}</td>
                      <td className="border border-border px-4 py-2 text-center">{apiData.total_alunos.total_geral.avaliados}</td>
                      <td className="border border-border px-4 py-2 text-center">{formatPercent1PtBr(apiData.total_alunos.total_geral.percentual, "0,0%")}</td>
                      <td className="border border-border px-4 py-2 text-center">{apiData.total_alunos.total_geral.faltosos}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

                     {/* Tabela de Níveis de Aprendizagem */}
           <Card>
             <CardHeader>
               <CardTitle className="flex items-center gap-2">
                 <Target className="h-5 w-5" />
                 Níveis de Aprendizagem {renderMode === 'escola' ? 'por Escola' : 'por Turma'}
               </CardTitle>
             </CardHeader>
             <CardContent>
               <div className="space-y-8">
                 {Object.entries(apiData.niveis_aprendizagem)
                   .filter(([disciplina]) => !isDisciplinaGeralAggregateKey(disciplina))
                   .map(([disciplina, dadosDisciplina]) => (
                   <div key={disciplina} className="space-y-4">
                     <h4 className="text-xl font-bold text-foreground text-center uppercase">
                       {disciplina}
                     </h4>
                     <div className="overflow-x-auto">
                       <table className="w-full border-collapse border border-border">
                         <thead>
                           <tr className="bg-muted">
                             <th className="border border-border px-4 py-2 text-left font-medium">
                               {renderMode === 'escola' ? 'Escola' : 'Turma'}
                             </th>
                             <th className="border border-border px-4 py-2 text-center font-medium bg-red-100 dark:bg-red-950/30">Abaixo do Básico</th>
                             <th className="border border-border px-4 py-2 text-center font-medium bg-yellow-100 dark:bg-yellow-950/30">Básico</th>
                             <th className="border border-border px-4 py-2 text-center font-medium bg-green-100 dark:bg-green-700/35 text-green-900 dark:text-green-200">Adequado</th>
                             <th className="border border-border px-4 py-2 text-center font-medium bg-green-600/20 dark:bg-green-950/60 text-green-900 dark:text-green-100">Avançado</th>
                             <th className="border border-border px-4 py-2 text-center font-medium">Total</th>
                           </tr>
                         </thead>
                         <tbody>
                           {renderMode === 'escola'
                             ? dadosDisciplina.por_escola?.map((escola, index: number) => (
                                 <tr key={index} className="hover:bg-muted transition-colors">
                                   <td className="border border-border px-4 py-2 font-medium">{escola.escola}</td>
                                   <td className="border border-border px-4 py-2 text-center bg-red-50 dark:bg-red-950/20">{escola.abaixo_do_basico}</td>
                                   <td className="border border-border px-4 py-2 text-center bg-yellow-50 dark:bg-yellow-950/20">{escola.basico}</td>
                                  <td className="border border-border px-4 py-2 text-center bg-green-50 dark:bg-green-700/25 text-green-900 dark:text-green-200">{escola.adequado}</td>
                                   <td className="border border-border px-4 py-2 text-center bg-green-600/25 dark:bg-green-950/55 text-green-900 dark:text-green-100">{escola.avancado}</td>
                                   <td className="border border-border px-4 py-2 text-center font-medium">{escola.total}</td>
                                 </tr>
                               ))
                             : dadosDisciplina.por_turma?.map((turma, index: number) => (
                                 <tr key={index} className="hover:bg-muted transition-colors">
                                   <td className="border border-border px-4 py-2 font-medium">
                                     {formatTurmaLabel(turma as unknown as TurmaRowLike) || String((turma as { turma?: string }).turma ?? "")}
                                   </td>
                                   <td className="border border-border px-4 py-2 text-center bg-red-50 dark:bg-red-950/20">{turma.abaixo_do_basico}</td>
                                   <td className="border border-border px-4 py-2 text-center bg-yellow-50 dark:bg-yellow-950/20">{turma.basico}</td>
                                  <td className="border border-border px-4 py-2 text-center bg-green-50 dark:bg-green-700/25 text-green-900 dark:text-green-200">{turma.adequado}</td>
                                  <td className="border border-border px-4 py-2 text-center bg-green-600/25 dark:bg-green-950/55 text-green-900 dark:text-green-100">{turma.avancado}</td>
                                   <td className="border border-border px-4 py-2 text-center font-medium">{turma.total}</td>
                                 </tr>
                               ))}
                           <tr className="bg-muted dark:bg-muted/50 font-semibold">
                             <td className="border border-border px-4 py-2">TOTAL GERAL</td>
                             <td className="border border-border px-4 py-2 text-center bg-red-100 dark:bg-red-950/30">
                               {dadosDisciplina.total_geral?.abaixo_do_basico ?? dadosDisciplina.geral?.abaixo_do_basico ?? 
                                (renderMode === 'escola' 
                                  ? dadosDisciplina.por_escola?.reduce((sum, e) => sum + (e.abaixo_do_basico || 0), 0) ?? 0
                                  : dadosDisciplina.por_turma?.reduce((sum, t) => sum + (t.abaixo_do_basico || 0), 0) ?? 0)}
                             </td>
                             <td className="border border-border px-4 py-2 text-center bg-yellow-100 dark:bg-yellow-950/30">
                               {dadosDisciplina.total_geral?.basico ?? dadosDisciplina.geral?.basico ?? 
                                (renderMode === 'escola' 
                                  ? dadosDisciplina.por_escola?.reduce((sum, e) => sum + (e.basico || 0), 0) ?? 0
                                  : dadosDisciplina.por_turma?.reduce((sum, t) => sum + (t.basico || 0), 0) ?? 0)}
                             </td>
                             <td className="border border-border px-4 py-2 text-center bg-green-100 dark:bg-green-700/35 text-green-900 dark:text-green-200">
                               {dadosDisciplina.total_geral?.adequado ?? dadosDisciplina.geral?.adequado ?? 
                                (renderMode === 'escola' 
                                  ? dadosDisciplina.por_escola?.reduce((sum, e) => sum + (e.adequado || 0), 0) ?? 0
                                  : dadosDisciplina.por_turma?.reduce((sum, t) => sum + (t.adequado || 0), 0) ?? 0)}
                             </td>
                             <td className="border border-border px-4 py-2 text-center bg-green-600/25 dark:bg-green-950/55 text-green-900 dark:text-green-100">
                               {dadosDisciplina.total_geral?.avancado ?? dadosDisciplina.geral?.avancado ?? 
                                (renderMode === 'escola' 
                                  ? dadosDisciplina.por_escola?.reduce((sum, e) => sum + (e.avancado || 0), 0) ?? 0
                                  : dadosDisciplina.por_turma?.reduce((sum, t) => sum + (t.avancado || 0), 0) ?? 0)}
                             </td>
                             <td className="border border-border px-4 py-2 text-center">
                               {dadosDisciplina.total_geral?.total ?? dadosDisciplina.geral?.total ?? 
                                (renderMode === 'escola' 
                                  ? dadosDisciplina.por_escola?.reduce((sum, e) => sum + (e.total || 0), 0) ?? 0
                                  : dadosDisciplina.por_turma?.reduce((sum, t) => sum + (t.total || 0), 0) ?? 0)}
                             </td>
                           </tr>
                         </tbody>
                       </table>
                     </div>
                   </div>
                 ))}
               </div>
             </CardContent>
           </Card>

                     {/* Tabela de Proficiência */}
           <Card>
             <CardHeader>
               <CardTitle className="flex items-center gap-2">
                 <TrendingUp className="h-5 w-5" />
                 Proficiência {renderMode === 'escola' ? 'por Escola' : 'por Turma'}
               </CardTitle>
             </CardHeader>
             <CardContent>
               <div className="space-y-8">
                 {Object.entries(apiData.proficiencia.por_disciplina)
                   .filter(([disciplina]) => !isDisciplinaGeralAggregateKey(disciplina))
                   .map(([disciplina, dadosDisciplina]) => (
                   <div key={disciplina} className="space-y-4">
                     <h4 className="text-xl font-bold text-foreground text-center uppercase">
                       {disciplina}
                     </h4>
                     <div className="overflow-x-auto">
                       <table className="w-full border-collapse border border-border">
                         <thead>
                           <tr className="bg-muted">
                             <th className="border border-border px-4 py-2 text-left font-medium">
                               {renderMode === 'escola' ? 'Escola' : 'Turma'}
                             </th>
                             <th className="border border-border px-4 py-2 text-center font-medium">Proficiência</th>
                           </tr>
                         </thead>
                         <tbody>
                           {renderMode === 'escola'
                             ? dadosDisciplina.por_escola?.map((escola, index: number) => (
                                 <tr key={index} className="hover:bg-muted transition-colors">
                                   <td className="border border-border px-4 py-2 font-medium">{escola.escola}</td>
                                   <td className="border border-border px-4 py-2 text-center">{formatDecimal(escola.proficiencia ?? escola.media)}</td>
                                 </tr>
                               ))
                             : dadosDisciplina.por_turma?.map((turma, index: number) => (
                                 <tr key={index} className="hover:bg-muted transition-colors">
                                   <td className="border border-border px-4 py-2 font-medium">
                                     {formatTurmaLabel(turma as unknown as TurmaRowLike) || String((turma as { turma?: string }).turma ?? "")}
                                   </td>
                                   <td className="border border-border px-4 py-2 text-center">{formatDecimal(turma.proficiencia ?? (turma as { media?: number }).media)}</td>
                                 </tr>
                               ))}
                           <tr className="bg-blue-50 dark:bg-blue-950/30 font-semibold">
                             <td className="border border-border px-4 py-2">MÉDIA GERAL</td>
                             <td className="border border-border px-4 py-2 text-center">{formatDecimal(dadosDisciplina.media_geral)}</td>
                           </tr>
                           {disciplina !== 'GERAL' && renderMode === 'turma' && apiData.proficiencia.media_municipal_por_disciplina && apiData.proficiencia.media_municipal_por_disciplina[disciplina] !== undefined && (
                             <tr className="bg-green-50 dark:bg-green-950/30 font-semibold">
                               <td className="border border-border px-4 py-2">MÉDIA MUNICIPAL</td>
                               <td className="border border-border px-4 py-2 text-center">{formatDecimal(apiData.proficiencia.media_municipal_por_disciplina[disciplina])}</td>
                             </tr>
                           )}
                         </tbody>
                       </table>
                     </div>
                   </div>
                 ))}
               </div>
             </CardContent>
           </Card>

                     {/* Tabela de Nota Geral */}
           <Card>
             <CardHeader>
               <CardTitle className="flex items-center gap-2">
                 <Award className="h-5 w-5" />
                 Nota Geral {renderMode === 'escola' ? 'por Escola' : 'por Turma'}
               </CardTitle>
             </CardHeader>
             <CardContent>
               <div className="space-y-8">
                 {Object.entries(apiData.nota_geral.por_disciplina)
                   .filter(([disciplina]) => !isDisciplinaGeralAggregateKey(disciplina))
                   .map(([disciplina, dadosDisciplina]) => (
                   <div key={disciplina} className="space-y-4">
                     <h4 className="text-xl font-bold text-foreground text-center uppercase">
                       {disciplina}
                     </h4>
                     <div className="overflow-x-auto">
                       <table className="w-full border-collapse border border-border">
                         <thead>
                           <tr className="bg-muted">
                             <th className="border border-border px-4 py-2 text-left font-medium">
                               {renderMode === 'escola' ? 'Escola' : 'Turma'}
                             </th>
                             <th className="border border-border px-4 py-2 text-center font-medium">Nota</th>
                           </tr>
                         </thead>
                         <tbody>
                           {renderMode === 'escola'
                             ? dadosDisciplina.por_escola?.map((escola, index: number) => (
                                 <tr key={index} className="hover:bg-muted transition-colors">
                                   <td className="border border-border px-4 py-2 font-medium">{escola.escola}</td>
                                   <td className="border border-border px-4 py-2 text-center">{formatDecimal(escola.nota ?? escola.media)}</td>
                                 </tr>
                               ))
                             : dadosDisciplina.por_turma?.map((turma, index: number) => (
                                 <tr key={index} className="hover:bg-muted transition-colors">
                                   <td className="border border-border px-4 py-2 font-medium">
                                     {formatTurmaLabel(turma as unknown as TurmaRowLike) || String((turma as { turma?: string }).turma ?? "")}
                                   </td>
                                   <td className="border border-border px-4 py-2 text-center">{formatDecimal(turma.nota ?? (turma as { media?: number }).media)}</td>
                                 </tr>
                               ))}
                           <tr className="bg-blue-50 dark:bg-blue-950/30 font-semibold">
                             <td className="border border-border px-4 py-2">MÉDIA GERAL</td>
                             <td className="border border-border px-4 py-2 text-center">{formatDecimal(dadosDisciplina.media_geral)}</td>
                           </tr>
                           {disciplina !== 'GERAL' && renderMode === 'turma' && apiData.nota_geral.media_municipal_por_disciplina && apiData.nota_geral.media_municipal_por_disciplina[disciplina] !== undefined && (
                             <tr className="bg-green-50 dark:bg-green-950/30 font-semibold">
                               <td className="border border-border px-4 py-2">MÉDIA MUNICIPAL</td>
                               <td className="border border-border px-4 py-2 text-center">{formatDecimal(apiData.nota_geral.media_municipal_por_disciplina[disciplina])}</td>
                             </tr>
                           )}
                         </tbody>
                       </table>
                     </div>
                   </div>
                 ))}
               </div>
             </CardContent>
           </Card>

                                           {/* Tabela de Acertos por Habilidade */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Acertos por Habilidade
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-8">
                  {Object.entries(apiData.acertos_por_habilidade)
                    .filter(([disciplina]) => !isDisciplinaGeralAggregateKey(disciplina))
                    .sort(([aKey, aVal], [bKey, bVal]) => {
                      if (aKey === 'GERAL') return -1;
                      if (bKey === 'GERAL') return 1;
                      const aMin = Math.min(...(((aVal as any)?.questoes?.map((q: any) => q.numero_questao) ?? [Infinity]) as number[]));
                      const bMin = Math.min(...(((bVal as any)?.questoes?.map((q: any) => q.numero_questao) ?? [Infinity]) as number[]));
                      return aMin - bMin;
                    })
                    .map(([disciplina, dadosDisciplina]) => (
                    <div key={disciplina} className="space-y-4">
                      <h4 className="text-xl font-bold text-foreground text-center uppercase">
                        {disciplina}
                      </h4>
                      
                      {/* Grid de questões */}
                      <div className="grid grid-cols-13 gap-0 border border-border">
                        {(dadosDisciplina as any)?.questoes && (dadosDisciplina as any).questoes.length > 0 ? (dadosDisciplina as any).questoes.map((questao: any, index: number) => (
                          <div key={index} className="flex flex-col">
                            {/* Header da questão */}
                            <div className="bg-blue-600 dark:bg-blue-700 text-white text-center py-2 px-1 text-sm font-medium border-r border-border last:border-r-0">
                              {questao.numero_questao}ª Q
                            </div>
                            
                            {/* Código da habilidade */}
                            <div className="bg-yellow-400 dark:bg-yellow-600 text-black dark:text-white text-center py-2 px-1 text-sm font-medium border-r border-border last:border-r-0 border-t border-border">
                              {questao.codigo}
                            </div>
                            
                            {/* Percentual com cor baseada no valor */}
                            <div 
                              className={`text-center py-2 px-1 text-sm font-medium border-r border-border last:border-r-0 border-t border-border ${
                                questao.percentual >= 70 
                                  ? 'bg-green-500 dark:bg-green-600 text-white' 
                                  : 'bg-card text-foreground'
                              }`}
                            >
                              {formatPercent1PtBr(questao.percentual, "0,0%")}
                            </div>
                          </div>
                        )) : (
                          <div className="col-span-13 text-center py-8 text-muted-foreground">
                            Nenhuma questão encontrada para esta disciplina.
                          </div>
                        )}
                      </div>
                      
                      {/* Legenda */}
                      <div className="flex justify-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-green-500 dark:bg-green-600 border border-border"></div>
                          <span>≥ 70%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-card border border-border"></div>
                          <span>&lt; 70%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
        </div>
      )}
    </div>
  );
}

