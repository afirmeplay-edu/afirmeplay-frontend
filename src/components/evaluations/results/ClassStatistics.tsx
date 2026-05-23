import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/authContext";
import type { UserHierarchyContext } from "@/utils/userHierarchy";
import {
  filterInstitutionalRankingRowsByRoleAccess,
  type InstitutionalGranularity,
} from "@/utils/evaluation/institutionalRankingRoleFilter";

interface ClassData {
  name: string;
  seriesName?: string;
  totalStudents: number;
  participatingStudents: number;
  averageGrade: number;
  proficiency: number;
  proficiencyLabel?: string | null;
  distribution: {
    abaixo_do_basico: number;
    basico: number;
    adequado: number;
    avancado: number;
  };
}

function isNomeDisciplinaGeralAgregado(nome: string | undefined): boolean {
  const n = (nome ?? '').trim().toLowerCase();
  return n === 'geral' || n === 'total' || n === 'consolidado';
}

interface ClassStatisticsProps {
  apiData: {
    nivel_granularidade?: 'municipio' | 'escola' | 'serie' | 'turma' | 'avaliacao';
    resultados_detalhados?: {
      avaliacoes?: Array<{
        id: string;
        titulo: string;
        serie?: string;
        turma?: string;
        escola?: string;
        escola_id?: string;
        total_alunos?: number;
        alunos_participantes?: number;
        alunos_pendentes?: number;
        alunos_ausentes?: number;
        media_nota?: number;
        media_proficiencia?: number;
        distribuicao_classificacao?: {
          abaixo_do_basico: number;
          basico: number;
          adequado: number;
          avancado: number;
        };
      }>;
    };
    estatisticas_gerais?: {
      tipo?: string;
      nome?: string;
      serie?: string;
      escola?: string;
      municipio?: string;
      total_alunos?: number;
      alunos_participantes?: number;
      alunos_ausentes?: number;
      media_nota_geral?: number;
      media_proficiencia_geral?: number;
      nivel_classificacao?: string | null;
      distribuicao_classificacao?: {
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
    };
    tabela_detalhada?: {
      disciplinas?: Array<{
        id: string;
        nome: string;
        alunos: Array<{
          id: string;
          nome: string;
          turma: string;
          nivel_proficiencia: string;
          nota: number;
          proficiencia: number;
          total_acertos: number;
          total_erros: number;
          total_respondidas: number;
        }>;
      }>;
      geral?: {
        alunos: Array<{
          id: string;
          nome: string;
          turma: string;
          nivel_proficiencia_geral: string;
          nota_geral: number;
          proficiencia_geral: number;
          total_acertos_geral: number;
          total_erros_geral: number;
          total_respondidas_geral: number;
        }>;
      };
    };
  } | null;
  /** Visão município (ex.: escola = "all" nos filtros). */
  isMunicipalView?: boolean;
  /** Hierarquia do usuário (diretor, coordenador, professor). */
  userHierarchy?: UserHierarchyContext | null;
  /** Rótulos dos filtros para o PDF agregado. */
  rankingPdfFilterLabels?: {
    estado: string;
    municipio: string;
    escola: string;
    serie: string;
    turma: string;
  };
  /** Título da avaliação ou gabarito (capa do PDF). */
  escopoTitulo?: string;
  /** Contexto só para nome do arquivo. */
  reportContext?: "avaliacoes" | "cartao-resposta";
}

function buildFilterRowFromAvaliacao(
  avaliacao: NonNullable<
    NonNullable<ClassStatisticsProps["apiData"]>["resultados_detalhados"]
  >["avaliacoes"][number],
  index: number,
  granularidade: InstitutionalGranularity
): { turma: string; serie: string; escola_id?: string } {
  const escola_id =
    typeof (avaliacao as { escola_id?: string }).escola_id === "string"
      ? (avaliacao as { escola_id?: string }).escola_id
      : undefined;
  let turma = "";
  let serie = "";
  switch (granularidade) {
    case "municipio":
      turma = avaliacao.escola || `Escola ${index + 1}`;
      serie = avaliacao.serie === "Todas as séries" ? "" : avaliacao.serie || "";
      break;
    case "escola":
      turma =
        avaliacao.turma === "Todas as turmas"
          ? avaliacao.serie || `Série ${index + 1}`
          : `${avaliacao.serie} - ${avaliacao.turma}`;
      serie = avaliacao.serie || "";
      break;
    case "serie":
      turma = avaliacao.turma || `Turma ${index + 1}`;
      serie = avaliacao.serie || "";
      break;
    case "turma":
    case "avaliacao":
    default:
      turma = avaliacao.turma || `Turma ${index + 1}`;
      serie = avaliacao.serie || "";
      break;
  }
  return { turma, serie, escola_id };
}

export function ClassStatistics({
  apiData,
  isMunicipalView = false,
  userHierarchy = null,
}: ClassStatisticsProps) {
  const { user } = useAuth();

  const isAdminOrTecSemed = user?.role === "admin" || user?.role === "tecadm";

  const granularidade = (apiData?.nivel_granularidade || "turma") as InstitutionalGranularity;

  const pairedDetailed = useMemo(() => {
    if (!apiData?.resultados_detalhados?.avaliacoes?.length) return [];
    const g = granularidade;
    return apiData.resultados_detalhados.avaliacoes.map((avaliacao, index) => {
      const totalStudents = avaliacao.total_alunos || 0;
      const participatingStudents = avaliacao.alunos_participantes || 0;
      const averageGrade = avaliacao.media_nota || 0;
      const proficiency = avaliacao.media_proficiencia || 0;
      const distribution =
        avaliacao.distribuicao_classificacao || {
          abaixo_do_basico: 0,
          basico: 0,
          adequado: 0,
          avancado: 0,
        };
      let name: string;
      let seriesName: string | undefined;
      switch (g) {
        case "municipio":
          name = avaliacao.escola || `Escola ${index + 1}`;
          seriesName = avaliacao.serie === "Todas as séries" ? undefined : avaliacao.serie;
          break;
        case "escola":
          name =
            avaliacao.turma === "Todas as turmas"
              ? avaliacao.serie || `Série ${index + 1}`
              : `${avaliacao.serie} - ${avaliacao.turma}`;
          seriesName = avaliacao.serie;
          break;
        case "serie":
          name = avaliacao.turma || `Turma ${index + 1}`;
          seriesName = avaliacao.serie;
          break;
        case "turma":
        case "avaliacao":
        default:
          name = avaliacao.turma || `Turma ${index + 1}`;
          seriesName = avaliacao.serie;
          break;
      }
      const classData: ClassData = {
        name,
        seriesName,
        totalStudents,
        participatingStudents,
        averageGrade: Number(averageGrade.toFixed(1)),
        proficiency: Number(proficiency.toFixed(1)),
        distribution,
      };
      const filterRow = buildFilterRowFromAvaliacao(avaliacao, index, g);
      return { classData, filterRow };
    });
  }, [apiData, granularidade]);

  const detailedData = useMemo(() => {
    const enriched = pairedDetailed.map((p, i) => ({ ...p.filterRow, __i: i }));
    const allowedIdx = new Set(
      filterInstitutionalRankingRowsByRoleAccess(enriched, {
        role: user?.role,
        hierarchy: userHierarchy ?? null,
        granularidade,
        isMunicipalView,
      }).map((r) => (r as { __i: number }).__i)
    );
    return pairedDetailed.filter((_, i) => allowedIdx.has(i)).map((p) => p.classData);
  }, [pairedDetailed, user?.role, userHierarchy, granularidade, isMunicipalView]);

  const participantDetailedData = useMemo(
    () => detailedData.filter((item) => (item.participatingStudents || 0) > 0),
    [detailedData]
  );

  const pendingDetailedData = useMemo(
    () => detailedData.filter((item) => (item.participatingStudents || 0) <= 0),
    [detailedData]
  );

  // ✅ NOVO: Helpers de distribuição
  const emptyDistribution = {
    abaixo_do_basico: 0,
    basico: 0,
    adequado: 0,
    avancado: 0
  };

  const isDistributionEmpty = (d?: { abaixo_do_basico: number; basico: number; adequado: number; avancado: number; } | null) => {
    if (!d) return true;
    const total = (d.abaixo_do_basico || 0) + (d.basico || 0) + (d.adequado || 0) + (d.avancado || 0);
    return total === 0;
  };

  // Somar distribuição a partir de resultados detalhados por avaliação
  const getDistributionFromDetailed = () => {
    const list = apiData?.resultados_detalhados?.avaliacoes || [];
    if (!list.length) return null;
    return list.reduce((acc, curr) => {
      const d = curr.distribuicao_classificacao;
      if (d) {
        acc.abaixo_do_basico += d.abaixo_do_basico || 0;
        acc.basico += d.basico || 0;
        acc.adequado += d.adequado || 0;
        acc.avancado += d.avancado || 0;
      }
      return acc;
    }, { ...emptyDistribution });
  };

  // Somar distribuição a partir da lista geral de alunos (tabela_detalhada)
  const getDistributionFromGeralAlunos = () => {
    const alunos = apiData?.tabela_detalhada?.geral?.alunos || [];
    if (!alunos.length) return null;
    const map = { ...emptyDistribution };
    alunos.forEach(a => {
      const nivel = (a.nivel_proficiencia_geral || '').toLowerCase();
      if (nivel.includes('abaixo')) map.abaixo_do_basico += 1;
      else if (nivel.includes('básico') || nivel.includes('basico')) map.basico += 1;
      else if (nivel.includes('adequ')) map.adequado += 1;
      else if (nivel.includes('avanç') || nivel.includes('avanc')) map.avancado += 1;
    });
    return map;
  };
  
  // ✅ NOVO: Gerar dados gerais a partir de estatisticas_gerais
  const generateGeneralData = (): ClassData | null => {
    if (!apiData?.estatisticas_gerais) {
      return null;
    }

    const stats = apiData.estatisticas_gerais;
    const totalStudents = stats.total_alunos || 0;
    const participatingStudents = stats.alunos_participantes || 0;
    const averageGrade = stats.media_nota_geral || 0;
    const proficiency = stats.media_proficiencia_geral || 0;
    
    // Usar distribuição do backend se disponível; senão, fallbacks somando dados detalhados
    let distribution = stats.distribuicao_classificacao || { ...emptyDistribution };
    if (isDistributionEmpty(distribution)) {
      const fromDetailed = getDistributionFromDetailed();
      if (fromDetailed && !isDistributionEmpty(fromDetailed)) {
        distribution = fromDetailed;
      } else {
        const fromGeral = getDistributionFromGeralAlunos();
        if (fromGeral && !isDistributionEmpty(fromGeral)) {
          distribution = fromGeral;
        }
      }
    }

    // Determinar nome baseado na granularidade
    const granularidade = apiData.nivel_granularidade || 'turma';
    let name: string;
    let seriesName: string | undefined;

    switch (granularidade) {
      case 'municipio':
        name = stats.municipio || 'Município';
        seriesName = stats.serie;
        break;
      case 'escola':
        name = stats.escola || 'Escola';
        seriesName = stats.serie;
        break;
      case 'serie':
        name = stats.serie || 'Série';
        break;
      case 'avaliacao':
        // Visão geral de uma avaliação/competição inteira
        name = 'Geral';
        seriesName = stats.serie;
        break;
      case 'turma':
      default:
        name = stats.serie || 'Turma';
        break;
    }

    const proficiencyLabel =
      stats.nivel_classificacao != null && String(stats.nivel_classificacao).trim()
        ? String(stats.nivel_classificacao).trim()
        : null;

    return {
      name,
      seriesName,
      totalStudents,
      participatingStudents,
      averageGrade: Number(averageGrade.toFixed(1)),
      proficiency: Number(proficiency.toFixed(1)),
      proficiencyLabel,
      distribution,
    };
  };

  const disciplineCardsFromStats = useMemo((): ClassData[] => {
    const porDisciplina = apiData?.estatisticas_gerais?.por_disciplina ?? [];
    return porDisciplina
      .filter((row) => row.disciplina && !isNomeDisciplinaGeralAgregado(row.disciplina))
      .map((row) => ({
        name: String(row.disciplina),
        totalStudents: apiData?.estatisticas_gerais?.total_alunos ?? 0,
        participatingStudents: apiData?.estatisticas_gerais?.alunos_participantes ?? 0,
        averageGrade: Number(row.media_nota ?? 0),
        proficiency: Number(row.media_proficiencia ?? 0),
        distribution: row.distribuicao_classificacao ?? { ...emptyDistribution },
      }));
  }, [apiData?.estatisticas_gerais]);

  // ✅ NOVO: Componente para renderizar um card individual
  const renderStatisticsCard = (statisticsItem: ClassData, key: string) => {
    const participationRate = statisticsItem.totalStudents > 0 
      ? (statisticsItem.participatingStudents / statisticsItem.totalStudents) * 100 
      : 0;

    return (
      <div key={key} className="border rounded-lg p-4 hover:bg-muted/50 dark:hover:bg-muted transition-colors">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-lg">
            {statisticsItem.seriesName ? `${statisticsItem.seriesName} - ${statisticsItem.name}` : statisticsItem.name}
          </h3>
          <Badge variant="outline">{statisticsItem.totalStudents} alunos</Badge>
        </div>
        
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Participação:</span>
              <span className="font-medium">
                {statisticsItem.participatingStudents}/{statisticsItem.totalStudents} alunos — {participationRate.toFixed(0)}%
              </span>
            </div>
            <Progress value={participationRate} className="h-2" />
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Média Nota:</span>
            <span className="font-medium">{statisticsItem.averageGrade.toFixed(1)}</span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Proficiência:</span>
            <span className="font-medium">{statisticsItem.proficiency.toFixed(1)}</span>
          </div>

          {statisticsItem.proficiencyLabel ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Classificação:</span>
              <span className="font-medium">{statisticsItem.proficiencyLabel}</span>
            </div>
          ) : null}
          
          {/* Distribuição de classificação */}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Distribuição:</div>
            <div className="flex gap-1">
              <div 
                className="flex-1 bg-red-500 rounded-sm h-2" 
                title={`Abaixo do Básico: ${statisticsItem.distribution.abaixo_do_basico}`}
                style={{ 
                  width: `${statisticsItem.totalStudents > 0 ? (statisticsItem.distribution.abaixo_do_basico / statisticsItem.totalStudents) * 100 : 0}%` 
                }}
              ></div>
              <div 
                className="flex-1 bg-yellow-500 rounded-sm h-2" 
                title={`Básico: ${statisticsItem.distribution.basico}`}
                style={{ 
                  width: `${statisticsItem.totalStudents > 0 ? (statisticsItem.distribution.basico / statisticsItem.totalStudents) * 100 : 0}%` 
                }}
              ></div>
              <div 
                className="flex-1 bg-green-400 rounded-sm h-2" 
                title={`Adequado: ${statisticsItem.distribution.adequado}`}
                style={{ 
                  width: `${statisticsItem.totalStudents > 0 ? (statisticsItem.distribution.adequado / statisticsItem.totalStudents) * 100 : 0}%` 
                }}
              ></div>
              <div 
                className="flex-1 bg-green-600 rounded-sm h-2" 
                title={`Avançado: ${statisticsItem.distribution.avancado}`}
                style={{ 
                  width: `${statisticsItem.totalStudents > 0 ? (statisticsItem.distribution.avancado / statisticsItem.totalStudents) * 100 : 0}%` 
                }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{statisticsItem.distribution.abaixo_do_basico}</span>
              <span>{statisticsItem.distribution.basico}</span>
              <span>{statisticsItem.distribution.adequado}</span>
              <span>{statisticsItem.distribution.avancado}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ✅ NOVO: Determinar títulos baseado na granularidade
  const getTitles = () => {
    const granularidade = apiData?.nivel_granularidade || 'turma';
    
    switch (granularidade) {
      case 'municipio':
        return {
          general: 'Dados Gerais do Município',
          detailed: 'Dados por Escola'
        };
      case 'escola':
        return {
          general: 'Dados Gerais da Escola',
          detailed: 'Dados por Série'
        };
      case 'serie':
        return {
          general: 'Dados Gerais da Série',
          detailed: 'Dados por Turma'
        };
      case 'avaliacao':
        return {
          general: 'Dados gerais',
          detailed: 'Dados por turma',
        };
      case 'turma':
      default:
        return {
          general: 'Dados Gerais da Turma',
          detailed: 'Estatísticas da Turma'
        };
    }
  };

  const generalData = generateGeneralData();
  const titles = getTitles();

  // ✅ NOVO: Se não há dados, mostrar mensagem
  if (!generalData && detailedData.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <p className="text-muted-foreground">Não há dados disponíveis para os filtros selecionados.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ✅ NOVO: Seção de Dados Gerais - apenas para admin/tecadmin */}
      {isAdminOrTecSemed && generalData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{titles.general}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {renderStatisticsCard(generalData, 'general-data')}
              {disciplineCardsFromStats.map((item, index) =>
                renderStatisticsCard(item, `general-discipline-${index}`)
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ✅ NOVO: Seção de Dados Detalhados */}
      {detailedData.length > 0 && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
            <CardTitle className="text-lg">{titles.detailed}</CardTitle>
          </CardHeader>
          <CardContent>
            {participantDetailedData.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  Escolas/Turmas participantes
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {participantDetailedData.map((statisticsItem, index) =>
                    renderStatisticsCard(statisticsItem, `participants-${index}`)
                  )}
                </div>
              </div>
            )}

            {pendingDetailedData.length > 0 && (
              <div className="space-y-3 mt-6">
                <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                  Escolas/Turmas pendentes (sem participação)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingDetailedData.map((statisticsItem, index) =>
                    renderStatisticsCard(statisticsItem, `pending-${index}`)
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
