import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileText,
  RefreshCw,
  Filter,
  BookOpen,
  LineChart,
  Trophy,
  GraduationCap,
  AlertCircle,
  Sparkles,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  EvaluationResultsApiService,
  NovaRespostaAPI,
  REPORT_ENTITY_TYPE_ANSWER_SHEET,
  type AnaliseIaRouteResponse,
} from "@/services/evaluation/evaluationResultsApi";
import { RelatorioCompleto } from "@/types/evaluation-results";
import { useAuth } from "@/context/authContext";
import { FilterComponentAnalise, ResultsPeriodMonthYearPicker } from "@/components/filters";
import { normalizeResultsPeriodYm } from "@/utils/resultsPeriod";
import { getUserHierarchyContext, getRestrictionMessage, validateReportAccess, UserHierarchyContext, cityIdQueryParamForAdmin } from "@/utils/userHierarchy";
import {
  normAggKey,
  filterInstitutionalRankingRowsByRoleAccess,
  sortInstitutionalRowsByPerformance,
} from "@/utils/evaluation/institutionalRankingRoleFilter";
import { cn } from "@/lib/utils";
import {
  getProficiencyLevelLabel,
  getProficiencyTableInfo,
  PROFICIENCY_TABLES,
  ProficiencyLevel,
  type ProficiencyTable,
} from "@/components/evaluations/results/utils/proficiency";
import { descricoesNiveisEscolares, aplicarSerieNaDescricao, type NivelDescricao } from "@/lib/relatorioEscolarDescricoesNiveis";
import { api } from "@/lib/api";
import { mapAnswerSheetResultadosAgregadosToNovaResposta, type AnswerSheetResultadosAgregadosRaw } from "@/utils/answer-sheet/mapAnswerSheetResultadosAgregadosToNovaResposta";
import { getReportProficiencyTagClass, normalizeProficiencyLevelLabel } from "@/utils/report/reportTagStyles";
import {
  filtrarGabaritosOpcoesSomenteComHabilidadesVinculadas,
  type GabaritoOpcaoFiltrosResults,
} from "@/utils/answer-sheet/answerSheetRelatorioGabaritoComHabilidades";
import {
  loadCityBrandingForReportPdf,
  urlToPngAsset,
} from "@/utils/pdfCityBranding";
import { getDisciplinaAnaliseFromIaRoot } from "@/utils/report/analiseIaPdfText";
import {
  buildDisciplineRecordToBlocks,
  buildGenericIaFallbackBlocks,
  renderStructuredIaPdfContent,
} from "@/utils/report/analiseIaPdfStructured";

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function readTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Mesmo padrão visual de `SkillsHeatMapPage` / `AnalysisLoadingCard` durante a geração da análise IA. */
function RelatorioEscolarAnalysisLoadingCard() {
  return (
    <Card className="mt-6 overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary animate-pulse" />
          Análise do relatório escolar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-background/70 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Processando análise dos resultados...
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-[pulse_1.1s_ease-in-out_infinite] rounded-full bg-primary/70" />
          </div>
          <div className="mt-4 space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Consolidando resultados por disciplina
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/80" />
              Cruzando proficiência, níveis e participação
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
              Estruturando recomendações para intervenção
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <div className="h-3 w-11/12 rounded bg-muted animate-pulse" />
            <div className="h-3 w-10/12 rounded bg-muted animate-pulse" />
            <div className="h-3 w-8/12 rounded bg-muted animate-pulse" />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="h-16 rounded-lg bg-muted animate-pulse" />
          <div className="h-16 rounded-lg bg-muted animate-pulse" />
          <div className="h-16 rounded-lg bg-muted animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

function novaRespostaSemAnaliseIa(payload: NovaRespostaAPI): NovaRespostaAPI {
  const { analise_ia_status: _s, analise_ia_cache_key: _k, analise_ia: _a, ...rest } = payload;
  void _s;
  void _k;
  void _a;
  return rest as NovaRespostaAPI;
}

function getNomeExibicaoAluno(aluno: unknown): string {
  if (!aluno || typeof aluno !== "object") return "";
  const o = aluno as Record<string, unknown>;
  const candidates = [
    o.nome_completo,
    o.nomeCompleto,
    o.full_name,
    o.fullName,
    o.student_name,
    o.studentName,
    o.nome_social,
    o.nomeSocial,
    o.nome,
    o.name,
  ]
    .map(readTrimmedString)
    .filter(Boolean);

  if (candidates.length === 0) return "";
  return candidates.reduce((best, cur) => (cur.length > best.length ? cur : best), candidates[0]);
}

function getAlunoClassificacaoLabel(aluno: unknown, apiData: NovaRespostaAPI | null): string {
  if (!aluno || typeof aluno !== "object") return "Abaixo do Básico";
  const o = aluno as Record<string, unknown>;

  const raw =
    readTrimmedString(o.classificacao) ||
    readTrimmedString(o.classificacao_geral) ||
    readTrimmedString(o.nivel_proficiencia) ||
    readTrimmedString(o.nivel_proficiencia_geral);

  if (raw) return normalizeProficiencyLevelLabel(raw);

  const profRaw = o.proficiencia ?? o.proficiencia_geral;
  const prof = typeof profRaw === "number" ? profRaw : Number(profRaw);
  if (!Number.isFinite(prof)) return "Abaixo do Básico";

  const serie = readTrimmedString(o.serie);
  const lvl = getProficiencyLevelAggregadoCartaoOuRelatorio(prof, apiData, serie || undefined);
  return normalizeProficiencyLevelLabel(getProficiencyLevelLabel(lvl));
}

/** Cartão-resposta: não exibir blocos de distribuição agregada só como "GERAL" — apenas por disciplina real. */
const isNomeDisciplinaGeralAgregado = (nome: string | undefined) =>
  normalizeText((nome ?? "").trim()) === "geral";

const findDisciplinaByAliases = <T,>(
  collection: Record<string, T> | undefined,
  aliases: string[]
): T | undefined => {
  if (!collection) return undefined;
  return Object.entries(collection).find(([key]) => {
    const normalizedKey = normalizeText(key);
    return aliases.some(alias => normalizedKey.includes(alias));
  })?.[1];
};

/** Cartão-resposta / JSON enxuto: `por_disciplina.X` pode vir só como `{ media, alunos }` sem `por_turma` nem `media_geral`. */
function readMediaNotaRelatorio(entry: unknown): number | undefined {
  if (entry == null || typeof entry !== "object") return undefined;
  const o = entry as Record<string, unknown>;
  if (typeof o.media === "number" && !Number.isNaN(o.media)) return o.media;
  if (typeof o.media_geral === "number" && !Number.isNaN(o.media_geral)) return o.media_geral;
  return undefined;
}

function readMediaProficienciaRelatorio(entry: unknown): number | undefined {
  if (entry == null || typeof entry !== "object") return undefined;
  const o = entry as Record<string, unknown>;
  if (typeof o.media === "number" && !Number.isNaN(o.media)) return o.media;
  if (typeof o.media_geral === "number" && !Number.isNaN(o.media_geral)) return o.media_geral;
  return undefined;
}

/** Campos opcionais numéricos do GET /answer-sheets/resultados-agregados (gabaritos/escolas). */
function readOptionalFiniteNumber(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const IA_ANALISE_SECTION_LABELS: Record<string, string> = {
  panorama_geral: "Panorama geral",
  reflexao_niveis: "Reflexao por niveis",
  reflexao_niveis_habilidades: "Reflexao por niveis",
  encaminhamentos_cultura_digital: "Encaminhamentos (cultura digital)",
  metadados_entrada: "Metadados de entrada",
  metadados_gerais: "Metadados gerais",
};

const IA_ANALISE_HIDDEN_KEYS = new Set([
  "warning",
  "error",
  "document_title",
  "metadados_entrada",
  "metadados_gerais",
]);

const IA_PANORAMA_GERAL_HIDDEN_KEYS = new Set([
  "componente_curricular",
  "distribuicao_niveis",
  "etapa_avaliada",
  "media_nota",
  "media_proficiencia",
]);

interface ClassSummaryRow {
  serie: string;
  turma: string;
  /** Quando a linha é uma escola (agregados / município), para cruzar com o vínculo do gestor. */
  escola_id?: string;
  mediaLP?: number;
  mediaMAT?: number;
  mediaGeral?: number;
  proficienciaMedia?: number;
  proficiencyLevel?: ProficiencyLevel;
  proficiencyLabel?: string;
  proficiencyColor?: string;
  matriculados?: number;
  avaliados?: number;
  comparecimento?: number;
}

interface DistributionChartData {
  title: string;
  total: number;
  segments: Array<{
    key: string;
    label: string;
    value: number;
    percentage: number;
    color: string;
  }>;
}

interface ProficiencyDistribution {
  title: string;
  color: string;
  columns: string[];
  rows: Array<{ label: string; data: number[] }>;
  bars: Array<{ label: string; value: number; quantidade: number }>;
  /** Nome da disciplina para buscar descrições dos níveis (mesma lógica de niveisEscolares) */
  disciplinaNome?: string;
  /** Listas de alunos para modal/PDF (sem novas rotas no backend). */
  alunosParticipantes?: Array<{
    id?: string;
    aluno_id?: string;
    nome?: string;
    escola?: string;
    serie?: string;
    turma?: string;
    proficiencia?: number;
  }>;
  alunosFaltosos?: Array<{
    id?: string;
    aluno_id?: string;
    nome?: string;
    escola?: string;
    serie?: string;
    turma?: string;
    proficiencia?: number;
  }>;
  alunosPorNivel?: Record<
    number,
    Array<{
      id?: string;
      aluno_id?: string;
      nome?: string;
      escola?: string;
      serie?: string;
      turma?: string;
      proficiencia?: number;
    }>
  >;
}

const formatAverage = (value?: number, decimals = 1) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "--";
  }
  return value.toFixed(decimals);
};

const formatProficiency = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "--";
  }
  return value.toFixed(1);
};

const formatPercentageValue = (value?: number, decimals = 1) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(decimals)}%`;
};

// Intervalos de níveis de proficiência por curso e disciplina
const niveisEscolares = {
  // Anos Finais e Ensino Médio (Exceto matemática)
  ANOS_FINAIS_GERAL: [
    { level: 0, min: 0, max: 199 },
    { level: 1, min: 200, max: 224 },
    { level: 2, min: 225, max: 249 },
    { level: 3, min: 250, max: 274 },
    { level: 4, min: 275, max: 299 },
    { level: 5, min: 300, max: 324 },
    { level: 6, min: 325, max: 349 },
    { level: 7, min: 350, max: 374 },
    { level: 8, min: 375, max: null },
  ],

  // Anos Finais e Ensino Médio (Matemática)
  ANOS_FINAIS_MAT: [
    { level: 0, min: 0, max: 199 },
    { level: 1, min: 200, max: 224 },
    { level: 2, min: 225, max: 249 },
    { level: 3, min: 250, max: 274 },
    { level: 4, min: 275, max: 299 },
    { level: 5, min: 300, max: 324 },
    { level: 6, min: 325, max: 349 },
    { level: 7, min: 350, max: 374 },
    { level: 8, min: 375, max: 399 },
    { level: 9, min: 400, max: null },
  ],

  // Anos Iniciais/Educação Infantil/EJA (Exceto Matemática)
  ANOS_INICIAIS_GERAL: [
    { level: 0, min: 0, max: 124 },
    { level: 1, min: 125, max: 149 },
    { level: 2, min: 150, max: 174 },
    { level: 3, min: 175, max: 199 },
    { level: 4, min: 200, max: 224 },
    { level: 5, min: 225, max: 249 },
    { level: 6, min: 250, max: 274 },
    { level: 7, min: 275, max: 299 },
    { level: 8, min: 300, max: 324 },
    { level: 9, min: 325, max: null },
  ],

  // Anos Iniciais/EDUCAÇÃO INFANTIL/EJA (Apenas Matemática)
  ANOS_INICIAIS_MAT: [
    { level: 0, min: 0, max: 124 },
    { level: 1, min: 125, max: 149 },
    { level: 2, min: 150, max: 174 },
    { level: 3, min: 175, max: 199 },
    { level: 4, min: 200, max: 224 },
    { level: 5, min: 225, max: 249 },
    { level: 6, min: 250, max: 274 },
    { level: 7, min: 275, max: 299 },
    { level: 8, min: 300, max: 324 },
    { level: 9, min: 325, max: 349 },
    { level: 10, min: 350, max: null },
  ]
};

// Função para classificar proficiência em nível
const classificarNivel = (proficiencia: number, niveis: Array<{level: number, min: number, max: number | null}>): number => {
  for (const nivel of niveis) {
    if (proficiencia >= nivel.min && (nivel.max === null || proficiencia <= nivel.max)) {
      return nivel.level;
    }
  }
  return 0; // Fallback
};

// ✅ NOVA FUNÇÃO: Validar nível de proficiência por disciplina
interface ValidacaoNivelResult {
  nivel: number;
  valido: boolean;
  motivo?: string;
  detalhes?: {
    proficiencia: number;
    disciplina: string;
    curso: string;
    nivelMaximo: number;
    proficienciaMaximaEsperada: number;
    intervaloUsado: { min: number; max: number | null };
  };
}

const validarNivelProficiencia = (
  proficiencia: number,
  disciplina: string,
  curso: string,
  intervalos: Array<{level: number, min: number, max: number | null}>
): ValidacaoNivelResult => {
  const disciplinaNormalizada = normalizeText(disciplina);
  const isMatematica = disciplinaNormalizada.includes('matematica') || disciplinaNormalizada.includes('matemática');
  const isAnosFinais = curso?.toLowerCase().includes('anos finais') || curso?.toLowerCase().includes('ensino médio') || curso?.toLowerCase().includes('medio');
  
  // Determinar proficiência máxima esperada
  let proficienciaMaximaEsperada: number;
  if (isAnosFinais) {
    proficienciaMaximaEsperada = isMatematica ? 425 : 400;
  } else {
    proficienciaMaximaEsperada = isMatematica ? 375 : 350;
  }
  
  // Encontrar o nível máximo
  const maxLevel = Math.max(...intervalos.map(i => i.level));
  const nivelMaximo = intervalos.find(i => i.level === maxLevel);
  
  // Validar se a proficiência está dentro do range esperado
  if (proficiencia < 0) {
    return {
      nivel: 0,
      valido: false,
      motivo: `Proficiência negativa: ${proficiencia}`,
      detalhes: {
        proficiencia,
        disciplina,
        curso,
        nivelMaximo: maxLevel,
        proficienciaMaximaEsperada,
        intervaloUsado: { min: 0, max: null }
      }
    };
  }
  
  if (proficiencia > proficienciaMaximaEsperada * 1.1) {
    return {
      nivel: maxLevel,
      valido: false,
      motivo: `Proficiência acima do máximo esperado: ${proficiencia} (máximo esperado: ${proficienciaMaximaEsperada})`,
      detalhes: {
        proficiencia,
        disciplina,
        curso,
        nivelMaximo: maxLevel,
        proficienciaMaximaEsperada,
        intervaloUsado: nivelMaximo ? { min: nivelMaximo.min, max: nivelMaximo.max } : { min: 0, max: null }
      }
    };
  }
  
  // Classificar o nível
  const nivel = classificarNivel(proficiencia, intervalos);
  
  // Verificar se o nível está correto
  const intervaloDoNivel = intervalos.find(i => i.level === nivel);
  if (!intervaloDoNivel) {
    return {
      nivel,
      valido: false,
      motivo: `Nível ${nivel} não encontrado nos intervalos`,
      detalhes: {
        proficiencia,
        disciplina,
        curso,
        nivelMaximo: maxLevel,
        proficienciaMaximaEsperada,
        intervaloUsado: { min: 0, max: null }
      }
    };
  }
  
  // Validar se a proficiência está dentro do intervalo do nível calculado
  const dentroDoIntervalo = proficiencia >= intervaloDoNivel.min && 
    (intervaloDoNivel.max === null || proficiencia <= intervaloDoNivel.max);
  
  if (!dentroDoIntervalo) {
    return {
      nivel,
      valido: false,
      motivo: `Proficiência ${proficiencia} não está dentro do intervalo do nível ${nivel} (${intervaloDoNivel.min} - ${intervaloDoNivel.max ?? '∞'})`,
      detalhes: {
        proficiencia,
        disciplina,
        curso,
        nivelMaximo: maxLevel,
        proficienciaMaximaEsperada,
        intervaloUsado: { min: intervaloDoNivel.min, max: intervaloDoNivel.max }
      }
    };
  }
  
  // Se a proficiência está no máximo ou acima, deve ser o nível máximo
  if (nivelMaximo && proficiencia >= nivelMaximo.min && (nivelMaximo.max === null || proficiencia <= nivelMaximo.max)) {
    if (nivel !== maxLevel) {
      return {
        nivel: maxLevel,
        valido: false,
        motivo: `Proficiência ${proficiencia} está no intervalo do nível máximo (${maxLevel}) mas foi classificada como nível ${nivel}`,
        detalhes: {
          proficiencia,
          disciplina,
          curso,
          nivelMaximo: maxLevel,
          proficienciaMaximaEsperada,
          intervaloUsado: { min: nivelMaximo.min, max: nivelMaximo.max }
        }
      };
    }
  }
  
  return {
    nivel,
    valido: true,
    detalhes: {
      proficiencia,
      disciplina,
      curso,
      nivelMaximo: maxLevel,
      proficienciaMaximaEsperada,
      intervaloUsado: { min: intervaloDoNivel.min, max: intervaloDoNivel.max }
    }
  };
};

// Função para determinar qual conjunto de intervalos usar
const obterIntervalosNiveis = (curso: string | undefined, disciplina: string): Array<{level: number, min: number, max: number | null}> => {
  const disciplinaNormalizada = normalizeText(disciplina);
  const isMatematica = disciplinaNormalizada.includes('matematica') || disciplinaNormalizada.includes('matemática');
  const isAnosFinais = curso?.toLowerCase().includes('anos finais') || curso?.toLowerCase().includes('ensino médio') || curso?.toLowerCase().includes('medio');
  
  if (isAnosFinais) {
    return isMatematica ? niveisEscolares.ANOS_FINAIS_MAT : niveisEscolares.ANOS_FINAIS_GERAL;
  } else {
    return isMatematica ? niveisEscolares.ANOS_INICIAIS_MAT : niveisEscolares.ANOS_INICIAIS_GERAL;
  }
};

// Função para obter descrições dos níveis (mesma lógica de obterIntervalosNiveis)
const obterDescricoesNiveis = (
  curso: string | undefined,
  disciplina: string,
  serieDaAvaliacao?: string
): NivelDescricao[] => {
  const disciplinaNormalizada = normalizeText(disciplina);
  const isMatematica = disciplinaNormalizada.includes('matematica') || disciplinaNormalizada.includes('matemática');
  const isAnosFinais = curso?.toLowerCase().includes('anos finais') || curso?.toLowerCase().includes('ensino médio') || curso?.toLowerCase().includes('medio');
  const key = isAnosFinais
    ? (isMatematica ? 'ANOS_FINAIS_MAT' : 'ANOS_FINAIS_GERAL')
    : (isMatematica ? 'ANOS_INICIAIS_MAT' : 'ANOS_INICIAIS_GERAL');
  return aplicarSerieNaDescricao(descricoesNiveisEscolares[key] ?? [], serieDaAvaliacao);
};

const inferirSerieParaDescricao = (apiData: NovaRespostaAPI | null): string | undefined => {
  if (!apiData) return undefined;
  const serieFromStats = apiData.estatisticas_gerais?.serie;
  if (serieFromStats && String(serieFromStats).trim()) return String(serieFromStats).trim();

  const geralFirst = apiData.tabela_detalhada?.geral?.alunos?.find((a) => a?.serie && String(a.serie).trim());
  if (geralFirst?.serie) return String(geralFirst.serie).trim();

  const alunosDasDisciplinas =
    apiData.tabela_detalhada?.disciplinas?.flatMap((d) => d.alunos ?? []) ?? [];
  const discFirst = alunosDasDisciplinas.find((a) => a?.serie && String(a.serie).trim());
  if (discFirst?.serie) return String(discFirst.serie).trim();

  return undefined;
};

const getProficiencyLevelColorRelatorio = (level: ProficiencyLevel): string => {
  // Paleta usada no sistema (ex.: `AcertoNiveis.tsx`) — aqui "Adequado" é verde.
  const colors: Record<ProficiencyLevel, string> = {
    abaixo_do_basico: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800',
    basico: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950/30 dark:text-yellow-300 dark:border-yellow-800',
    adequado: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800',
    avancado: 'bg-green-200 text-green-900 border-green-400 dark:bg-green-950/50 dark:text-green-200 dark:border-green-700',
  };

  return colors[level] || colors.abaixo_do_basico;
};

type BackendDistribuicaoClassificacaoGeral = {
  abaixo_do_basico: number;
  basico: number;
  adequado: number;
  avancado: number;
};

const backendNivelProficienciaToLevel = (label?: string): ProficiencyLevel | null => {
  if (!label || typeof label !== 'string') return null;
  const normalized = normalizeText(label);
  if (!normalized) return null;

  if (normalized.includes('abaixo')) return 'abaixo_do_basico';
  // "abaixo do básico" também contém "basico", então checar "abaixo" primeiro.
  if (normalized.includes('basico')) return 'basico';
  if (normalized.includes('adequado')) return 'adequado';
  if (normalized.includes('avancado')) return 'avancado';

  return null;
};

const getBestProficiencyLevelFromBackendDistribution = (
  dist?: BackendDistribuicaoClassificacaoGeral | null
): ProficiencyLevel | null => {
  if (!dist) return null;

  const candidates: Array<{ level: ProficiencyLevel; value: number }> = [
    { level: 'abaixo_do_basico', value: Number(dist.abaixo_do_basico ?? 0) },
    { level: 'basico', value: Number(dist.basico ?? 0) },
    { level: 'adequado', value: Number(dist.adequado ?? 0) },
    { level: 'avancado', value: Number(dist.avancado ?? 0) },
  ];

  const max = Math.max(...candidates.map((c) => c.value));
  if (max <= 0) return null;

  // Empate: favorecer o nível mais alto
  const ordered: ProficiencyLevel[] = ['abaixo_do_basico', 'basico', 'adequado', 'avancado'];
  let best: ProficiencyLevel | null = null;
  for (const level of ordered) {
    const found = candidates.find((c) => c.level === level);
    if (!found) continue;
    if (found.value === max) best = level;
  }

  return best;
};

const getBestProficiencyLevelFromBackendLabels = (labels: string[]): ProficiencyLevel | null => {
  if (!labels?.length) return null;

  const counts: Record<ProficiencyLevel, number> = {
    abaixo_do_basico: 0,
    basico: 0,
    adequado: 0,
    avancado: 0,
  };

  for (const l of labels) {
    const level = backendNivelProficienciaToLevel(l);
    if (!level) continue;
    counts[level] += 1;
  }

  const max = Math.max(...Object.values(counts));
  if (max <= 0) return null;

  // Empate: favorecer o nível mais alto
  const ordered: ProficiencyLevel[] = ['abaixo_do_basico', 'basico', 'adequado', 'avancado'];
  let best: ProficiencyLevel | null = null;
  for (const level of ordered) {
    if (counts[level] === max) best = level;
  }

  return best;
};

// Função para obter cor da disciplina
const obterCorDisciplina = (nomeDisciplina: string, index: number): string => {
  const nomeNormalizado = normalizeText(nomeDisciplina);
  
  // Cores específicas para disciplinas conhecidas
  if (nomeNormalizado.includes('portugues') || nomeNormalizado.includes('português') || nomeNormalizado.includes('lingua portuguesa')) {
    return "#16A34A"; // Verde
  }
  if (nomeNormalizado.includes('matematica') || nomeNormalizado.includes('matemática')) {
    return "#1D4ED8"; // Azul
  }
  
  // Paleta de cores para outras disciplinas
  const coresPaleta = [
    "#DC2626", // Vermelho
    "#EA580C", // Laranja
    "#CA8A04", // Amarelo
    "#059669", // Verde esmeralda
    "#0891B2", // Ciano
    "#7C3AED", // Roxo
    "#DB2777", // Rosa
    "#BE185D", // Rosa escuro
  ];
  
  return coresPaleta[index % coresPaleta.length];
};

const sanitizeFileName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

// Inferir curso (Anos Iniciais x Anos Finais/Ensino Médio) a partir dos dados da API
const inferirCursoFromApiData = (apiData: NovaRespostaAPI | null): string => {
  if (!apiData) {
    return "Anos Iniciais";
  }

  // Prioridade 1: Inferir do nome em estatisticas_gerais (pode conter informações do curso)
  const nome = apiData.estatisticas_gerais?.nome;
  if (nome) {
    const nomeLower = nome.toLowerCase();
    if (
      nomeLower.includes("anos finais") ||
      nomeLower.includes("ensino médio") ||
      nomeLower.includes("medio") ||
      nomeLower.includes("médio")
    ) {
      return "Anos Finais";
    }
    if (
      nomeLower.includes("anos iniciais") ||
      nomeLower.includes("educação infantil") ||
      nomeLower.includes("educacao infantil") ||
      nomeLower.includes("eja") ||
      nomeLower.includes("especial")
    ) {
      return "Anos Iniciais";
    }
  }

  // Prioridade 2: Inferir da série em estatisticas_gerais
  const serieEstatistica = apiData.estatisticas_gerais?.serie;
  if (serieEstatistica) {
    const serieLower = serieEstatistica.toLowerCase();
    if (
      serieLower.includes("6") ||
      serieLower.includes("7") ||
      serieLower.includes("8") ||
      serieLower.includes("9") ||
      serieLower.includes("em") ||
      serieLower.includes("médio") ||
      serieLower.includes("medio")
    ) {
      return "Anos Finais";
    }
  }

  // Prioridade 3: Inferir do tipo em estatisticas_gerais
  const tipo = apiData.estatisticas_gerais?.tipo;
  if (tipo) {
    const tipoLower = tipo.toLowerCase();
    if (tipoLower.includes("anos finais") || tipoLower.includes("ensino médio")) {
      return "Anos Finais";
    }
  }

  // Prioridade 4: Fallback - inferir da primeira série dos alunos na tabela detalhada
  if (apiData.tabela_detalhada?.disciplinas && apiData.tabela_detalhada.disciplinas.length > 0) {
    const seriesEncontradas = new Set<string>();
    apiData.tabela_detalhada.disciplinas.forEach((disciplina) => {
      disciplina.alunos?.forEach((aluno) => {
        if (aluno.serie) {
          seriesEncontradas.add(aluno.serie.toLowerCase());
        }
      });
    });

    for (const serie of seriesEncontradas) {
      if (
        serie.includes("6") ||
        serie.includes("7") ||
        serie.includes("8") ||
        serie.includes("9") ||
        serie.includes("em") ||
        serie.includes("médio") ||
        serie.includes("medio")
      ) {
        return "Anos Finais";
      }
    }
  }

  // Padrão: Anos Iniciais/Educação Infantil/EJA
  return "Anos Iniciais";
};

// ✅ FUNÇÃO AUXILIAR: Calcular nível de proficiência para dados agregados (escola/turma)
// Usa apenas curso/série, sem disciplina específica, para usar a tabela geral
const getProficiencyLevelForAggregatedData = (
  proficiency: number,
  grade?: string,
  course?: string
): ProficiencyLevel => {
  if (proficiency === null || proficiency === undefined || isNaN(proficiency)) {
    return 'abaixo_do_basico';
  }

  // Inferir curso da grade se não fornecido
  let inferredCourse = course;
  if (!inferredCourse && grade) {
    const gradeLower = grade.toLowerCase();
    if (
      gradeLower.includes('6') ||
      gradeLower.includes('7') ||
      gradeLower.includes('8') ||
      gradeLower.includes('9') ||
      gradeLower.includes('em') ||
      gradeLower.includes('médio') ||
      gradeLower.includes('medio')
    ) {
      inferredCourse = 'Anos Finais';
    } else {
      inferredCourse = 'Anos Iniciais';
    }
  }

  // Usar getProficiencyTableInfo com undefined como subject para usar tabela geral
  // Passar course como terceiro parâmetro (mesmo que não seja usado atualmente, pode ser útil no futuro)
  const tableInfo = getProficiencyTableInfo(grade, undefined, inferredCourse);
  const table = tableInfo.table;
  
  if (proficiency <= table.abaixo_do_basico.max) return 'abaixo_do_basico';
  if (proficiency <= table.basico.max) return 'basico';
  if (proficiency <= table.adequado.max) return 'adequado';
  return 'avancado';
};

/**
 * Nível a partir da média de proficiência exibida — alinhado ao relatório escolar digital (SAEB)
 * e à rota `resultados_detalhados`: usa faixas de Anos Finais quando o contexto é SAEB (6º–EM),
 * senão a tabela de Anos Iniciais por série.
 */
const getProficiencyLevelAggregadoCartaoOuRelatorio = (
  proficiency: number,
  apiData: NovaRespostaAPI | null,
  serieLinha?: string
): ProficiencyLevel => {
  if (proficiency === null || proficiency === undefined || Number.isNaN(Number(proficiency))) {
    return "abaixo_do_basico";
  }
  const p = Number(proficiency);
  const curso = inferirCursoFromApiData(apiData);
  const cursoL = curso.toLowerCase();

  const serieFocal =
    (serieLinha && String(serieLinha).trim() && String(serieLinha).trim() !== "—"
      ? String(serieLinha).trim()
      : undefined) ?? inferirSerieParaDescricao(apiData);

  const isIniciaisExplicit =
    cursoL.includes("anos iniciais") ||
    cursoL.includes("educação infantil") ||
    cursoL.includes("educacao infantil") ||
    cursoL.includes("eja");

  const serieNorm = normalizeText(serieFocal || "");
  const looksFinaisOuMedio =
    serieNorm.includes("6") ||
    serieNorm.includes("7") ||
    serieNorm.includes("8") ||
    serieNorm.includes("9") ||
    serieNorm.includes("medio") ||
    serieNorm.includes("médio") ||
    serieNorm.includes("ensino medio");

  let table: ProficiencyTable = PROFICIENCY_TABLES.ANOS_FINAIS_TODAS;
  if (isIniciaisExplicit && !looksFinaisOuMedio) {
    table = getProficiencyTableInfo(serieFocal, undefined, curso).table;
  }

  if (p <= table.abaixo_do_basico.max) return "abaixo_do_basico";
  if (p <= table.basico.max) return "basico";
  if (p <= table.adequado.max) return "adequado";
  return "avancado";
};

type TabelaDetalhadaRelatorio = NonNullable<NovaRespostaAPI["tabela_detalhada"]>;

/** API de cartão-resposta pode enviar `aluno_id` em vez de `id`. */
function alunoRowId(aluno: { id?: string; aluno_id?: string }): string {
  return String(aluno.id ?? aluno.aluno_id ?? "").trim();
}

/** Respondeu ao menos uma questão da disciplina (`tabela_detalhada.disciplinas`). */
function alunoDisciplinaRespondeu(aluno: {
  status?: string;
  total_respondidas?: number;
}): boolean {
  return (
    (aluno.status ?? "") === "concluida" ||
    ((aluno.total_respondidas ?? 0) > 0)
  );
}

/** Resultado consolidado em `tabela_detalhada.geral.alunos` (não é só matrícula). */
function alunoGeralNaTabelaParticipou(aluno: {
  nivel_proficiencia_geral?: string | null;
  total_respondidas_geral?: number;
  status_geral?: string;
}): boolean {
  // Em alguns payloads, `nivel_proficiencia_geral` vem preenchido mesmo com
  // aluno pendente e sem respostas; por isso ele não pode definir participação.
  return (
    ((aluno.total_respondidas_geral ?? 0) > 0) ||
    aluno.status_geral === "concluida"
  );
}

function nomeDisciplinaEhPortugues(nome: string | undefined): boolean {
  const n = normalizeText((nome ?? "").trim());
  if (!n) return false;
  if (
    n.includes("ingles") ||
    n.includes("espanhol") ||
    n.includes("frances") ||
    n.includes("lingua estrangeira")
  ) {
    return false;
  }
  return (
    n.includes("portugues") ||
    n.includes("lingua portuguesa") ||
    n.includes("lingua port") ||
    (n.includes("lingua") && n.includes("materna")) ||
    (n.includes("linguagens") && !n.includes("matematica")) ||
    n.includes("letramento") ||
    n.includes("alfabetizacao") ||
    n.includes("redacao") ||
    n.includes("literacia")
  );
}

function nomeDisciplinaEhMatematica(nome: string | undefined): boolean {
  const n = normalizeText((nome ?? "").trim());
  return n.includes("matematica");
}

/** Média da nota na disciplina, só entre alunos que responderam (inclui nota 0). */
function mediaNotasDisciplinaNaTabela(
  tabela: TabelaDetalhadaRelatorio | undefined,
  matchNome: (nome: string | undefined) => boolean
): number | undefined {
  if (!tabela?.disciplinas?.length) return undefined;
  const notas: number[] = [];
  for (const disc of tabela.disciplinas) {
    if (!matchNome(disc.nome)) continue;
    disc.alunos?.forEach((aluno) => {
      if (!alunoRowId(aluno)) return;
      if (!alunoDisciplinaRespondeu(aluno)) return;
      if (aluno.nota === undefined || aluno.nota === null || Number.isNaN(aluno.nota)) return;
      notas.push(Number(aluno.nota));
    });
  }
  if (!notas.length) return undefined;
  return notas.reduce((a, b) => a + b, 0) / notas.length;
}

function mediasComparecimentoFromTabelaGeral(
  tabela: TabelaDetalhadaRelatorio | undefined
): {
  mediaGeral?: number;
  proficienciaMedia?: number;
  totalMatriculados: number;
  totalAvaliados: number;
} | null {
  const alunos = tabela?.geral?.alunos;
  if (!alunos?.length) return null;
  const idsTodos = new Set(
    alunos.map((a) => alunoRowId(a)).filter((id): id is string => Boolean(id))
  );
  const participantes = alunos.filter(alunoGeralNaTabelaParticipou);
  const idsPart = new Set(
    participantes.map((a) => alunoRowId(a)).filter((id): id is string => Boolean(id))
  );
  const notas = participantes
    .map((a) => Number(a.nota_geral))
    .filter((n) => Number.isFinite(n));
  const profs = participantes
    .map((a) => Number(a.proficiencia_geral))
    .filter((n) => Number.isFinite(n));
  return {
    mediaGeral: notas.length
      ? notas.reduce((s, n) => s + n, 0) / notas.length
      : undefined,
    proficienciaMedia: profs.length
      ? profs.reduce((s, p) => s + p, 0) / profs.length
      : undefined,
    totalMatriculados: idsTodos.size,
    totalAvaliados: idsPart.size,
  };
}

function escolaChaveAgrupamento(
  aluno: { escola?: string },
  reportAnswerSheet: boolean,
  nomeMunicipioOuGeral?: string
): string {
  const raw = (aluno.escola ?? "").trim();
  if (raw && raw.toUpperCase() !== "N/A") return raw;
  if (reportAnswerSheet) return (nomeMunicipioOuGeral ?? "").trim() || "Total";
  return "";
}

function turmaChaveAgrupamento(aluno: { turma?: string }, reportAnswerSheet: boolean): string {
  const raw = (aluno.turma ?? "").trim();
  if (raw && raw.toUpperCase() !== "N/A") return raw;
  if (reportAnswerSheet) return "—";
  return "";
}

/**
 * Rótulos de linha alinhados a {@link ClassStatistics} / `generateDetailedData`
 * (proficiência e nota vêm de `media_proficiencia` / `media_nota` por item da API).
 */
function labelsFromAvaliacaoClassStatistics(
  granularidade: NovaRespostaAPI["nivel_granularidade"],
  avaliacao: {
    escola?: string;
    serie?: string;
    turma?: string;
  },
  index: number
): { turmaLabel: string; serieVal: string } {
  const g = granularidade ?? "turma";
  let turmaLabel: string;
  let serieVal: string;

  switch (g) {
    case "municipio":
      turmaLabel = avaliacao.escola || `Escola ${index + 1}`;
      serieVal =
        avaliacao.serie && avaliacao.serie !== "Todas as séries"
          ? avaliacao.serie
          : turmaLabel.split(/\s+/)[0] || "—";
      break;
    case "escola":
      turmaLabel =
        avaliacao.turma === "Todas as turmas"
          ? avaliacao.serie || `Série ${index + 1}`
          : `${avaliacao.serie} - ${avaliacao.turma}`;
      serieVal = avaliacao.serie || "—";
      break;
    case "serie":
      turmaLabel = avaliacao.turma || `Turma ${index + 1}`;
      serieVal = avaliacao.serie || "—";
      break;
    case "turma":
    default:
      turmaLabel = avaliacao.turma || `Turma ${index + 1}`;
      serieVal = avaliacao.serie || turmaLabel.split(/\s+/)[0] || "—";
      break;
  }

  return { turmaLabel, serieVal };
}

type LinhaResultadoDetalhadoChave = {
  escola?: string;
  serie?: string;
  turma?: string;
};

/**
 * Indica se o aluno da tabela detalhada pertence à mesma linha que `resultados_detalhados.avaliacoes[]`
 * (evita cruzar escola/turma só pelo rótulo exibido na tabela).
 */
function alunoPertenceLinhaAvaliacao(
  aluno: { escola?: string; serie?: string; turma?: string },
  av: LinhaResultadoDetalhadoChave,
  granularidade: NovaRespostaAPI["nivel_granularidade"] | undefined
): boolean {
  const escAv = normAggKey(av.escola);
  const serAv = normAggKey(av.serie);
  const turAv = normAggKey(av.turma);
  const todasSeries = normAggKey("Todas as séries");
  const todasTurmas = normAggKey("Todas as turmas");

  const escOk = !escAv || normAggKey(aluno.escola) === escAv;
  const serOk = !serAv || serAv === todasSeries || normAggKey(aluno.serie) === serAv;
  const turOk = !turAv || turAv === todasTurmas || normAggKey(aluno.turma) === turAv;

  switch (granularidade ?? "turma") {
    case "municipio":
      return normAggKey(aluno.escola) === escAv && !!escAv;
    case "escola":
    case "serie":
    case "turma":
    case "avaliacao":
    default:
      return escOk && serOk && turOk;
  }
}

function mediasLPeMatematicaPorLinhaAvaliacao(
  avaliacao: LinhaResultadoDetalhadoChave,
  tabela: TabelaDetalhadaRelatorio | undefined,
  granularidade: NovaRespostaAPI["nivel_granularidade"] | undefined
): { mediaLP?: number; mediaMAT?: number } {
  if (!tabela?.disciplinas?.length) return {};

  const notasLP: number[] = [];
  const notasMAT: number[] = [];

  for (const disc of tabela.disciplinas) {
    const isLP = nomeDisciplinaEhPortugues(disc.nome);
    const isMAT = nomeDisciplinaEhMatematica(disc.nome);
    if (!isLP && !isMAT) continue;

    disc.alunos?.forEach((aluno) => {
      if (!alunoRowId(aluno)) return;
      if (!alunoPertenceLinhaAvaliacao(aluno, avaliacao, granularidade)) return;
      if (aluno.nota === undefined || aluno.nota === null || Number.isNaN(aluno.nota)) return;
      if (!alunoDisciplinaRespondeu(aluno)) return;
      if (isLP) notasLP.push(Number(aluno.nota));
      else notasMAT.push(Number(aluno.nota));
    });
  }

  return {
    mediaLP: notasLP.length
      ? notasLP.reduce((a, b) => a + b, 0) / notasLP.length
      : undefined,
    mediaMAT: notasMAT.length
      ? notasMAT.reduce((a, b) => a + b, 0) / notasMAT.length
      : undefined,
  };
}

export interface RelatorioEscolarProps {
  /** Dados e filtros de cartão-resposta (`report_entity_type=answer_sheet`). */
  reportAnswerSheet?: boolean;
  /** Usa GET `/answer-sheets/resultados-agregados` (filtros: estado, município, gabarito, …). */
  answerSheetsResultadosAgregados?: boolean;
  /** Quando true, omite o bloco de título (usado no hub com abas). */
  hidePageHeading?: boolean;
}

export default function RelatorioEscolar({
  reportAnswerSheet: reportAnswerSheetProp = false,
  answerSheetsResultadosAgregados = false,
  hidePageHeading = false,
}: RelatorioEscolarProps = {}) {
  const isAnswerSheetAgregados = answerSheetsResultadosAgregados;
  const reportAnswerSheet = reportAnswerSheetProp || isAnswerSheetAgregados;
  const { autoLogin, user } = useAuth();
  const [apiData, setApiData] = useState<NovaRespostaAPI | null>(null);
  const [analiseEscolarIa, setAnaliseEscolarIa] = useState<
    Pick<NovaRespostaAPI, "analise_ia_status" | "analise_ia_cache_key" | "analise_ia"> | null
  >(null);
  /** > 0 somente após o usuário clicar em “Gerar análise da IA”; evita chamar analise-ia ao carregar os dados. */
  const [iaRequestSeq, setIaRequestSeq] = useState(0);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);
  const [aiVisualLoading, setAiVisualLoading] = useState(false);
  const [relatorioCompleto, setRelatorioCompleto] = useState<RelatorioCompleto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [selectedSchoolInfo, setSelectedSchoolInfo] = useState<{ id: string; name: string } | null>(null);
  const [studentsModalOpen, setStudentsModalOpen] = useState(false);
  const [studentsModalDisciplina, setStudentsModalDisciplina] = useState<string>("");
  const [studentsModalNivel, setStudentsModalNivel] = useState<number | null>(null);
  const [studentsModalData, setStudentsModalData] = useState<{
    participantes: Array<{ nome?: string; escola?: string; serie?: string; turma?: string; id?: string; aluno_id?: string }>;
    faltosos: Array<{ nome?: string; escola?: string; serie?: string; turma?: string; id?: string; aluno_id?: string }>;
    porNivel: Record<number, Array<{ nome?: string; escola?: string; serie?: string; turma?: string; id?: string; aluno_id?: string }>>;
  }>({ participantes: [], faltosos: [], porNivel: {} });
  const { toast } = useToast();
  const navigate = useNavigate();
  const aiPollingTimeoutRef = useRef<number | null>(null);
  const relatorioEscolarIaPollGenRef = useRef(0);
  const aiVisualLoadingTimeoutRef = useRef<number | null>(null);
  const aiVisualLoadingMinUntilRef = useRef<number>(0);

  const clearAiPollingTimeout = useCallback(() => {
    if (aiPollingTimeoutRef.current != null) {
      window.clearTimeout(aiPollingTimeoutRef.current);
      aiPollingTimeoutRef.current = null;
    }
  }, []);

  const clearAiVisualLoadingTimeout = useCallback(() => {
    if (aiVisualLoadingTimeoutRef.current != null) {
      window.clearTimeout(aiVisualLoadingTimeoutRef.current);
      aiVisualLoadingTimeoutRef.current = null;
    }
  }, []);

  const startAiVisualLoading = useCallback(() => {
    aiVisualLoadingMinUntilRef.current = Date.now() + 6000;
    clearAiVisualLoadingTimeout();
    setAiVisualLoading(true);
  }, [clearAiVisualLoadingTimeout]);

  const stopAiVisualLoading = useCallback(() => {
    const remaining = aiVisualLoadingMinUntilRef.current - Date.now();
    if (remaining <= 0) {
      clearAiVisualLoadingTimeout();
      setAiVisualLoading(false);
      return;
    }
    clearAiVisualLoadingTimeout();
    aiVisualLoadingTimeoutRef.current = window.setTimeout(() => {
      setAiVisualLoading(false);
      aiVisualLoadingTimeoutRef.current = null;
    }, remaining);
  }, [clearAiVisualLoadingTimeout]);

  // Estados dos filtros
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('all');
  const [selectedSchool, setSelectedSchool] = useState<string>('all');
  const [selectedEvaluation, setSelectedEvaluation] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const reportEntityTypeParam =
    reportAnswerSheet && !isAnswerSheetAgregados ? REPORT_ENTITY_TYPE_ANSWER_SHEET : undefined;

  // Filtros cartão-resposta → GET /answer-sheets/resultados-agregados
  const [asEstado, setAsEstado] = useState<string>('all');
  const [asMunicipio, setAsMunicipio] = useState<string>('all');
  const [asGabarito, setAsGabarito] = useState<string>('all');
  const [asEscola, setAsEscola] = useState<string>('all');
  const [asSerie, setAsSerie] = useState<string>('all');
  const [asTurma, setAsTurma] = useState<string>('all');
  const [asOpcoes, setAsOpcoes] = useState<{
    estados?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
    municipios?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
    gabaritos?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
    escolas?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
    series?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
    turmas?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
  }>({});

  const asNorm = (o: { id: string; nome?: string; name?: string; titulo?: string }) =>
    o.nome ?? o.name ?? o.titulo ?? o.id;

  const municipalityForAdmin = isAnswerSheetAgregados ? asMunicipio : selectedMunicipality;
  const adminCityIdQuery = useMemo(
    () => cityIdQueryParamForAdmin(user?.role, municipalityForAdmin === 'all' ? undefined : municipalityForAdmin),
    [user?.role, municipalityForAdmin]
  );

  const periodoYmRelatorio = useMemo(() => {
    if (selectedPeriod === 'all') return undefined;
    const n = normalizeResultsPeriodYm(selectedPeriod);
    return n === 'all' ? undefined : n;
  }, [selectedPeriod]);

  // Estados para hierarquia do usuário
  const [userHierarchyContext, setUserHierarchyContext] = useState<UserHierarchyContext | null>(null);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(true);

  const isMunicipalView = isAnswerSheetAgregados ? asEscola === 'all' : selectedSchool === 'all';

  const repState = isAnswerSheetAgregados ? asEstado : selectedState;
  const repMunicipality = isAnswerSheetAgregados ? asMunicipio : selectedMunicipality;
  const repSchool = isAnswerSheetAgregados ? asEscola : selectedSchool;
  const repGabaritoOrEval = isAnswerSheetAgregados ? asGabarito : selectedEvaluation;

  const aiAnaliseStatus = analiseEscolarIa?.analise_ia_status ?? apiData?.analise_ia_status;
  const aiAnalise = analiseEscolarIa?.analise_ia ?? apiData?.analise_ia;
  const aiAnaliseObject =
    aiAnalise && typeof aiAnalise === "object" && !Array.isArray(aiAnalise)
      ? (aiAnalise as Record<string, unknown>)
      : null;
  const aiAnaliseErrorDetails = readTrimmedString(aiAnaliseObject?.details);
  const aiAnaliseErrorTitle = readTrimmedString(aiAnaliseObject?.error);
  const hasAiAnaliseContent = !!(aiAnaliseObject && Object.keys(aiAnaliseObject).length > 0);

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

  // Calcular distribuição de níveis de proficiência dinamicamente
  const proficiencyDistributions = useMemo<ProficiencyDistribution[]>(() => {
    if (!apiData) {
      return [];
    }

    // Se tabela_detalhada não estiver disponível, retornar array vazio (gráficos não aparecerão)
    if (!apiData.tabela_detalhada) {
      return [];
    }

    // Processar todas as disciplinas que têm dados
    const scopeLabel = isMunicipalView ? "Total Município" : "Total Escola";
    
    const curso = inferirCursoFromApiData(apiData);

    const geralById = new Map<string, { nome?: string }>();
    const geralAlunos = apiData.tabela_detalhada?.geral?.alunos ?? [];
    for (const ga of geralAlunos) {
      const id = alunoRowId(ga);
      if (!id) continue;
      geralById.set(id, { nome: getNomeExibicaoAluno(ga) || (ga.nome ?? "") });
    }

    const mergeAlunoNomeFromGeral = <T extends { id?: string; aluno_id?: string; nome?: string }>(aluno: T): T => {
      const id = alunoRowId(aluno);
      if (!id) return aluno;
      const geral = geralById.get(id);
      if (!geral) return aluno;
      const nomeDisc = getNomeExibicaoAluno(aluno) || (aluno.nome ?? "");
      const nomeGeral = (geral.nome ?? "").trim();
      if (nomeGeral && nomeGeral.length > nomeDisc.trim().length) {
        return { ...aluno, nome: nomeGeral } as T;
      }
      return aluno;
    };

    // Processar TODAS as disciplinas que têm dados em apiData.tabela_detalhada
    if (!apiData.tabela_detalhada.disciplinas || apiData.tabela_detalhada.disciplinas.length === 0) {
      return [];
    }

    return apiData.tabela_detalhada.disciplinas
      .filter(disciplinaData => {
        // ✅ VALIDADO: Filtrar disciplinas que têm alunos
        if (!disciplinaData.alunos || disciplinaData.alunos.length === 0) {
          return false;
        }
        if (isAnswerSheetAgregados && isNomeDisciplinaGeralAgregado(disciplinaData.nome)) {
          return false;
        }
        return true;
      })
      .map((disciplinaData, index) => {
        const nomeDisciplina = disciplinaData.nome;
        
        if (!nomeDisciplina || nomeDisciplina.trim() === '') {
          return null;
        }

        // ✅ VALIDADO: Obter intervalos corretos usando o nome exato da disciplina
        const intervalos = obterIntervalosNiveis(curso, nomeDisciplina);
        if (!intervalos || intervalos.length === 0) {
          return null;
        }

        const maxLevel = Math.max(...intervalos.map(i => i.level));

        // Inicializar contagem por nível
        const contagemPorNivel: Record<number, number> = {};
        for (let i = 0; i <= maxLevel; i++) {
          contagemPorNivel[i] = 0;
        }

        // ✅ MELHORADO: Filtrar apenas alunos que participaram da avaliação
        const alunosParticipantes = disciplinaData.alunos.filter((aluno) => {
          // ✅ VALIDAÇÃO: Garantir que está usando proficiência específica da disciplina (não geral)
          if (aluno.proficiencia === undefined || aluno.proficiencia === null || Number.isNaN(aluno.proficiencia)) {
            return false;
          }

          const hasAnsweredAny =
            Array.isArray(aluno.respostas_por_questao) &&
            aluno.respostas_por_questao.some((resposta) => resposta.respondeu === true);
          const classif = (aluno as { classificacao?: string }).classificacao;
          const summarySemQuestoes =
            !hasAnsweredAny &&
            (Number(aluno.nota) > 0 ||
              Number(aluno.proficiencia) > 0 ||
              Boolean(classif && String(classif).trim()));

          if (!hasAnsweredAny && !summarySemQuestoes) {
            return false;
          }

          return true;
        });

        // Faltosos/não participantes: tudo que veio na API e não passou no filtro de participação.
        const participantesKey = new Set<string>();
        const alunoKey = (a: { id?: string; aluno_id?: string; nome?: string; turma?: string; serie?: string; escola?: string }) => {
          const id = alunoRowId(a);
          if (id) return id;
          return `${(a.nome ?? "").trim()}|${(a.turma ?? "").trim()}|${(a.serie ?? "").trim()}|${(a.escola ?? "").trim()}`.trim();
        };
        for (const a of alunosParticipantes as Array<{ id?: string; aluno_id?: string; nome?: string; turma?: string; serie?: string; escola?: string }>) {
          const k = alunoKey(a);
          if (k) participantesKey.add(k);
        }
        const alunosFaltosos = (disciplinaData.alunos as Array<{ id?: string; aluno_id?: string; nome?: string; turma?: string; serie?: string; escola?: string; proficiencia?: number }>)
          .filter((a) => {
            const k = alunoKey(a);
            if (!k) return true;
            return !participantesKey.has(k);
          });

        const alunosPorNivel: Record<number, Array<{ id?: string; aluno_id?: string; nome?: string; escola?: string; serie?: string; turma?: string; proficiencia?: number }>> = {};
        for (let i = 0; i <= maxLevel; i++) alunosPorNivel[i] = [];

        // ✅ MELHORADO: Classificar cada aluno participante por nível usando validação rigorosa
        alunosParticipantes.forEach((aluno) => {
          const proficiencia = Number(aluno.proficiencia);
          
          // ✅ VALIDAÇÃO: Garantir que a proficiência é válida
          if (Number.isNaN(proficiencia) || proficiencia < 0) {
            return;
          }

          // ✅ VALIDAÇÃO RIGOROSA: Usar função de validação
          const validacao = validarNivelProficiencia(proficiencia, nomeDisciplina, curso, intervalos);

          // Usar o nível da validação (que pode ter sido corrigido)
          const nivel = validacao.nivel;
          
          if (nivel >= 0 && nivel <= maxLevel) {
            contagemPorNivel[nivel] = (contagemPorNivel[nivel] || 0) + 1;
            (alunosPorNivel[nivel] ||= []).push(mergeAlunoNomeFromGeral(aluno));
          }
        });

        const totalAlunos = alunosParticipantes.length;

        if (totalAlunos === 0) {
          return null;
        }

        // ✅ VALIDADO: Calcular percentuais corretamente
        const percentuaisPorNivel: number[] = [];
        const bars: Array<{ label: string; value: number; quantidade: number }> = [];
        let somaPercentuais = 0;

        for (let i = 0; i <= maxLevel; i++) {
          const quantidade = contagemPorNivel[i] || 0;
          const percentual = totalAlunos > 0 ? (quantidade / totalAlunos) * 100 : 0;
          const percentualArredondado = Number(percentual.toFixed(2));
          
          percentuaisPorNivel.push(percentualArredondado);
          somaPercentuais += percentualArredondado;
          
          bars.push({
            label: `Nível ${i}`,
            value: percentualArredondado,
            quantidade: quantidade
          });
        }

        // Validar que a soma dos percentuais está próxima de 100% (com tolerância para arredondamento)
        if (Math.abs(somaPercentuais - 100) > 1) {
          // Soma de percentuais não está próxima de 100%, mas não vamos logar
        }

        // Obter cor da disciplina
        const color = obterCorDisciplina(nomeDisciplina, index);

        const alunosParticipantesExib = alunosParticipantes.map(mergeAlunoNomeFromGeral);
        const alunosFaltososExib = alunosFaltosos.map(mergeAlunoNomeFromGeral);

        return {
          title: `Distribuição percentual dos estudantes por Nível de Proficiência - ${nomeDisciplina}`,
          color,
          columns: Array.from({ length: maxLevel + 1 }, (_, i) => `Nível ${i}`),
          rows: [
            { label: scopeLabel, data: percentuaisPorNivel }
          ],
          bars,
          disciplinaNome: nomeDisciplina,
          alunosParticipantes: alunosParticipantesExib,
          alunosFaltosos: alunosFaltososExib,
          alunosPorNivel,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [apiData, isAnswerSheetAgregados, isMunicipalView]);

  const formatAlunoLine = useCallback(
    (aluno: { nome?: string; turma?: string; serie?: string; escola?: string }) => {
      const nome = getNomeExibicaoAluno(aluno) || (aluno.nome ?? "").trim() || "—";
      const turma = (aluno.turma ?? "").trim();
      const serie = (aluno.serie ?? "").trim();
      const escola = (aluno.escola ?? "").trim();
      const meta = [turma && `Turma ${turma}`, serie && `Série ${serie}`, escola && escola]
        .filter(Boolean)
        .join(" — ");
      return meta ? `${nome} — ${meta}` : nome;
    },
    []
  );

  const openStudentsModalForDistribution = useCallback(
    (distribution: ProficiencyDistribution, nivel: number | null) => {
      const disc = (distribution.disciplinaNome ?? "").trim() || "Disciplina";
      setStudentsModalDisciplina(disc);
      setStudentsModalNivel(nivel);
      setStudentsModalData({
        participantes: (distribution.alunosParticipantes ?? []) as Array<{
          nome?: string;
          escola?: string;
          serie?: string;
          turma?: string;
          id?: string;
          aluno_id?: string;
        }>,
        faltosos: (distribution.alunosFaltosos ?? []) as Array<{
          nome?: string;
          escola?: string;
          serie?: string;
          turma?: string;
          id?: string;
          aluno_id?: string;
        }>,
        porNivel: (distribution.alunosPorNivel ?? {}) as Record<
          number,
          Array<{ nome?: string; escola?: string; serie?: string; turma?: string; id?: string; aluno_id?: string }>
        >,
      });
      setStudentsModalOpen(true);
    },
    []
  );

  // Estados dos dados dos filtros (movidos para FilterComponentAnalise)

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
        if (context.municipality) {
          setSelectedMunicipality(context.municipality.id);
          // Definir estado para que allRequiredFiltersSelected seja satisfeito (professor/diretor/coordenador)
          try {
            const statesList = await EvaluationResultsApiService.getFilterStates();
            const matchedState = statesList.find(
              (s) =>
                s.id === context.municipality!.state ||
                s.nome?.toLowerCase() === context.municipality!.state?.toLowerCase()
            );
            if (matchedState) {
              setSelectedState(matchedState.id);
            }
          } catch (e) {
            // Silenciar erro ao mapear estado
          }
        }

        if (context.school) {
          setSelectedSchool(context.school.id);
        }

        // Para professor, carregar escolas das suas turmas
        if (context.classes && context.classes.length > 0) {
          const schoolEntries = context.classes.map(c => ({ id: c.school_id, name: c.school_name }));
          const uniqueSchoolIds = Array.from(new Set(schoolEntries.map(s => s.id)));
          const uniqueSchools = uniqueSchoolIds
            .map(id => schoolEntries.find(s => s.id === id))
            .filter((school): school is { id: string; name: string } => Boolean(school))
            .map(s => ({ id: s.id, nome: s.name }));

          // Se só tem uma escola, pre-selecionar
          if (uniqueSchools.length === 1) {
            setSelectedSchool(uniqueSchools[0].id);
          }
        }

      } catch (error) {
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
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          try {
            await autoLogin();
          } catch (error) {
            toast({
              title: "Erro de Autenticação",
              description: "Não foi possível fazer login automático. Verifique suas credenciais.",
              variant: "destructive",
            });
            return;
          }
        }
      } finally {
        // Sempre encerrar o loading para não travar a tela (ex.: autoLogin falha ou demora)
        setIsLoading(false);
      }
    };

    initializeData();
  }, [autoLogin, toast]);

  // Verificar se todos os filtros obrigatórios estão selecionados
  const allRequiredFiltersSelected = isAnswerSheetAgregados
    ? asEstado !== 'all' && asMunicipio !== 'all' && asGabarito !== 'all'
    : selectedState !== 'all' && selectedMunicipality !== 'all' && selectedEvaluation !== 'all';

  const setAsEstadoAndReset = useCallback((v: string) => {
    setAsEstado(v);
    setAsMunicipio('all');
    setAsGabarito('all');
    setAsEscola('all');
    setAsSerie('all');
    setAsTurma('all');
    setApiData(null);
  }, []);

  const setAsMunicipioAndReset = useCallback((v: string) => {
    setAsMunicipio(v);
    setAsGabarito('all');
    setAsEscola('all');
    setAsSerie('all');
    setAsTurma('all');
    setApiData(null);
  }, []);

  const setAsGabaritoAndReset = useCallback((v: string) => {
    setAsGabarito(v);
    setAsEscola('all');
    setAsSerie('all');
    setAsTurma('all');
    setApiData(null);
  }, []);

  const setAsEscolaAndReset = useCallback((v: string) => {
    setAsEscola(v);
    setAsSerie('all');
    setAsTurma('all');
    setApiData(null);
  }, []);

  const setAsSerieAndReset = useCallback((v: string) => {
    setAsSerie(v);
    setAsTurma('all');
    setApiData(null);
  }, []);

  const asPeriodResetInitRef = useRef(false);
  useEffect(() => {
    if (!isAnswerSheetAgregados) return;
    if (!asPeriodResetInitRef.current) {
      asPeriodResetInitRef.current = true;
      return;
    }
    setAsGabarito('all');
    setAsEscola('all');
    setAsSerie('all');
    setAsTurma('all');
    setApiData(null);
  }, [selectedPeriod, isAnswerSheetAgregados]);

  const fetchAsOpcoesFiltros = useCallback(async () => {
    if (!isAnswerSheetAgregados) return;
    const params = new URLSearchParams();
    if (asEstado && asEstado !== 'all') params.set('estado', asEstado);
    if (asMunicipio && asMunicipio !== 'all') params.set('municipio', asMunicipio);
    if (asGabarito && asGabarito !== 'all') params.set('gabarito', asGabarito);
    if (asEscola && asEscola !== 'all') params.set('escola', asEscola);
    if (asSerie && asSerie !== 'all') params.set('serie', asSerie);
    if (asTurma && asTurma !== 'all') params.set('turma', asTurma);
    if (periodoYmRelatorio) params.set('periodo', periodoYmRelatorio);
    const query = params.toString();
    try {
      setIsLoadingFilters(true);
      const url = `/answer-sheets/opcoes-filtros-results${query ? `?${query}` : ''}`;
      const res = await api.get<{
        estados?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
        municipios?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
        gabaritos?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
        escolas?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
        series?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
        turmas?: Array<{ id: string; nome?: string; name?: string; titulo?: string }>;
      }>(url);
      const raw = res.data || {};
      const gabaritosFiltrados = await filtrarGabaritosOpcoesSomenteComHabilidadesVinculadas(
        (raw.gabaritos ?? []) as GabaritoOpcaoFiltrosResults[]
      );
      setAsOpcoes({ ...raw, gabaritos: gabaritosFiltrados });
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os filtros de cartão resposta.',
        variant: 'destructive',
      });
      setAsOpcoes({});
    } finally {
      setIsLoadingFilters(false);
    }
  }, [
    isAnswerSheetAgregados,
    asEstado,
    asMunicipio,
    asGabarito,
    asEscola,
    asSerie,
    asTurma,
    periodoYmRelatorio,
    toast,
  ]);

  useEffect(() => {
    if (isAnswerSheetAgregados) {
      void fetchAsOpcoesFiltros();
    }
  }, [isAnswerSheetAgregados, fetchAsOpcoesFiltros]);

  useEffect(() => {
    if (!isAnswerSheetAgregados || asGabarito === "all") return;
    const ids = (asOpcoes.gabaritos ?? []).map((g) => g.id);
    if (ids.length === 0) return;
    if (!ids.includes(asGabarito)) {
      setAsGabarito("all");
      setAsEscola("all");
      setAsSerie("all");
      setAsTurma("all");
      setApiData(null);
    }
  }, [isAnswerSheetAgregados, asGabarito, asOpcoes.gabaritos]);

  const classSummaryRows = useMemo<ClassSummaryRow[]>(() => {
    // Fonte única da tabela: agregados prontos do backend em `resultados_detalhados.avaliacoes`.
    if (apiData?.resultados_detalhados?.avaliacoes?.length) {
      const granularidade = apiData.nivel_granularidade;
      const avaliacoes = apiData.resultados_detalhados.avaliacoes;
      const porDisciplina = apiData.resultados_por_disciplina ?? [];

      const rowAggKey = (value?: string | null) =>
        normalizeText((value ?? "").trim()).replace(/\s+/g, " ");

      const resolveRowDisciplineMedia = (
        rowKey: string,
        match: (disciplina: string | undefined) => boolean
      ): number | undefined => {
        if (!rowKey?.trim()) return undefined;
        const key = rowAggKey(rowKey);
        const item = porDisciplina.find((d) => {
          const groupLabel =
            granularidade === "municipio"
              ? (d as { escola?: string | null }).escola
              : granularidade === "turma"
                ? null
                : (d as { turma?: string | null }).turma;
          if (groupLabel == null) return false;
          return rowAggKey(groupLabel) === key && match(d.disciplina);
        });
        return item ? readOptionalFiniteNumber(item.media_nota) : undefined;
      };

      const rows: ClassSummaryRow[] = avaliacoes.map((avaliacao, index) => {
        const { turmaLabel, serieVal } = labelsFromAvaliacaoClassStatistics(
          granularidade,
          avaliacao,
          index
        );
        const totalAlunos = avaliacao.total_alunos ?? 0;
        const participantes = avaliacao.alunos_participantes ?? 0;
        const pctAgregados = readOptionalFiniteNumber(
          (avaliacao as { percentual_comparecimento?: number }).percentual_comparecimento
        );
        const comparecimento =
          pctAgregados ??
          (
            avaliacao.total_alunos && avaliacao.total_alunos > 0
              ? (Number(avaliacao.alunos_participantes ?? 0) / Number(avaliacao.total_alunos)) * 100
              : undefined
          );
        const proficienciaMedia = avaliacao.media_proficiencia;
        const mediaGeral = avaliacao.media_nota;

        const disciplinaDaLinha = String(avaliacao.disciplina ?? "");
        const mediaDisciplinaDaLinha = readOptionalFiniteNumber(avaliacao.media_nota);
        const lpAg = readOptionalFiniteNumber(
          (avaliacao as { media_nota_lingua_portuguesa?: number | null }).media_nota_lingua_portuguesa
        );
        const matAg = readOptionalFiniteNumber(
          (avaliacao as { media_nota_matematica?: number | null }).media_nota_matematica
        );
        const rowGroupKey =
          granularidade === "municipio"
            ? String(avaliacao.escola ?? turmaLabel)
            : granularidade === "escola"
              ? String(
                  (avaliacao.turma && avaliacao.turma !== "Todas as turmas")
                    ? avaliacao.turma
                    : (avaliacao.serie && avaliacao.serie !== "Todas as séries")
                      ? avaliacao.serie
                      : turmaLabel
                )
              : String(avaliacao.turma ?? turmaLabel);

        const mediaLP =
          lpAg ??
          resolveRowDisciplineMedia(rowGroupKey, nomeDisciplinaEhPortugues) ??
          (nomeDisciplinaEhPortugues(disciplinaDaLinha) ? mediaDisciplinaDaLinha : undefined);
        const mediaMAT =
          matAg ??
          resolveRowDisciplineMedia(rowGroupKey, nomeDisciplinaEhMatematica) ??
          (nomeDisciplinaEhMatematica(disciplinaDaLinha) ? mediaDisciplinaDaLinha : undefined);

        const row: ClassSummaryRow = {
          turma: turmaLabel,
          serie: serieVal,
          escola_id: (avaliacao as { escola_id?: string }).escola_id,
          mediaLP,
          mediaMAT,
          mediaGeral,
          proficienciaMedia,
          matriculados: totalAlunos,
          avaliados: participantes,
          comparecimento,
        };

        const ne = (avaliacao as { nivel_classificacao?: string | null }).nivel_classificacao;
        if (ne !== undefined && ne !== null && String(ne).trim()) {
          const text = String(ne).trim();
          row.proficiencyLabel = text;
          const mapped = backendNivelProficienciaToLevel(text);
          if (mapped) {
            row.proficiencyLevel = mapped;
            row.proficiencyColor = getProficiencyLevelColorRelatorio(mapped);
          } else {
            row.proficiencyColor = "bg-muted text-muted-foreground border-border";
          }
        } else {
          const pNum = Number(proficienciaMedia);
          const levelFromDist = getBestProficiencyLevelFromBackendDistribution(
            avaliacao.distribuicao_classificacao
          );
          const levelFromMedia =
            proficienciaMedia !== undefined &&
            proficienciaMedia !== null &&
            !Number.isNaN(pNum)
              ? getProficiencyLevelAggregadoCartaoOuRelatorio(
                  pNum,
                  apiData,
                  avaliacao.serie ?? serieVal
                )
              : null;
          // Prioriza distribuição/classificação agregada do backend para evitar divergência
          // quando a conversão por média usa faixas de outra série/escopo.
          const level = levelFromDist ?? levelFromMedia;
          if (level) {
            row.proficiencyLevel = level;
            row.proficiencyLabel = getProficiencyLevelLabel(level);
            row.proficiencyColor = getProficiencyLevelColorRelatorio(level);
          }
        }

        return row;
      });

      return rows.sort((a, b) =>
        a.turma.localeCompare(b.turma, "pt-BR", { sensitivity: "base" })
      );
    }

    // ✅ PRIORIDADE: Usar dados do relatório completo se disponível (dados agregados corretos)
    if (relatorioCompleto) {
      const curso = inferirCursoFromApiData(apiData);
      // Normaliza chaves de turma/escola para evitar divergências por espaços/capitalização.
      // Isso garante que a classificação vinda de `tabela_detalhada.geral.alunos` sobrescreva corretamente.
      const turmaKey = (value?: string | null) =>
        (value ?? '')
          .trim()
          .replace(/\s+/g, ' ')
          .toLowerCase();
      const turmasMap = new Map<string, ClassSummaryRow>();
      
      // ✅ MELHORADO: Verificar se temos dados por_escola ou por_turma
      // Quando escola está selecionada, pode vir por_escola ou por_turma dependendo da API
      const hasPorEscola = relatorioCompleto.total_alunos.por_escola && relatorioCompleto.total_alunos.por_escola.length > 0;
      const hasPorTurma = relatorioCompleto.total_alunos.por_turma && relatorioCompleto.total_alunos.por_turma.length > 0;
      
      // Processar dados de nota_geral e proficiencia
      Object.entries(relatorioCompleto.nota_geral.por_disciplina).forEach(([disciplina, dadosDisciplina]) => {
        const disciplinaLower = disciplina.toLowerCase();
        const isPortugues = disciplinaLower.includes('português') || disciplinaLower.includes('portugues');
        const isMatematica = disciplinaLower.includes('matemática') || disciplinaLower.includes('matematica');
        
        // Processar por_turma se disponível
        if (dadosDisciplina.por_turma && dadosDisciplina.por_turma.length > 0) {
          dadosDisciplina.por_turma.forEach(turmaData => {
            const turmaNome = (turmaData.turma ?? '').trim();
            if (!turmaNome) return;
            if (!turmasMap.has(turmaNome)) {
              turmasMap.set(turmaNome, {
                turma: turmaNome,
                serie: turmaNome.split(' ')[0] || '-',
                mediaLP: undefined,
                mediaMAT: undefined,
                mediaGeral: undefined,
                proficienciaMedia: undefined,
                matriculados: undefined,
                avaliados: undefined,
                comparecimento: undefined
              });
            }
            
            const row = turmasMap.get(turmaNome)!;
            if (isPortugues) {
              row.mediaLP = turmaData.nota;
            } else if (isMatematica) {
              row.mediaMAT = turmaData.nota;
            }
            
            // Se for GERAL, usar como média geral
            if (disciplina === 'GERAL') {
              row.mediaGeral = turmaData.nota;
            }
          });
        }
        
        // ✅ NOVO: Processar por_escola se disponível (quando escola está selecionada mas API retorna por escola)
        if (dadosDisciplina.por_escola && dadosDisciplina.por_escola.length > 0 && !hasPorTurma) {
          dadosDisciplina.por_escola.forEach(escolaData => {
            const escolaNome = (escolaData.escola ?? '').trim();
            if (!escolaNome) return;
            if (!turmasMap.has(escolaNome)) {
              turmasMap.set(escolaNome, {
                turma: escolaNome,
                serie: escolaNome.split(' ')[0] || '-',
                mediaLP: undefined,
                mediaMAT: undefined,
                mediaGeral: undefined,
                proficienciaMedia: undefined,
                matriculados: undefined,
                avaliados: undefined,
                comparecimento: undefined
              });
            }
            
            const row = turmasMap.get(escolaNome)!;
            if (isPortugues) {
              row.mediaLP = escolaData.nota ?? escolaData.media;
            } else if (isMatematica) {
              row.mediaMAT = escolaData.nota ?? escolaData.media;
            }
            
            // Se for GERAL, usar como média geral
            if (disciplina === 'GERAL') {
              row.mediaGeral = escolaData.nota ?? escolaData.media;
            }
          });
        }
      });
      
      // Processar proficiência - coletar todas as proficiências primeiro
      const proficienciasPorItem = new Map<string, number[]>();
      Object.entries(relatorioCompleto.proficiencia.por_disciplina).forEach(([disciplina, dadosDisciplina]) => {
        // Processar por_turma se disponível
        if (dadosDisciplina.por_turma && dadosDisciplina.por_turma.length > 0) {
          dadosDisciplina.por_turma.forEach(turmaData => {
            const turmaNome = (turmaData.turma ?? '').trim();
            if (!turmaNome) return;
            if (!proficienciasPorItem.has(turmaNome)) {
              proficienciasPorItem.set(turmaNome, []);
            }
            proficienciasPorItem.get(turmaNome)!.push(turmaData.proficiencia);
          });
        }
        
        // ✅ NOVO: Processar por_escola se disponível (quando escola está selecionada mas API retorna por escola)
        if (dadosDisciplina.por_escola && dadosDisciplina.por_escola.length > 0 && !hasPorTurma) {
          dadosDisciplina.por_escola.forEach(escolaData => {
            const escolaNome = (escolaData.escola ?? '').trim();
            if (!escolaNome) return;
            if (!proficienciasPorItem.has(escolaNome)) {
              proficienciasPorItem.set(escolaNome, []);
            }
            proficienciasPorItem.get(escolaNome)!.push(escolaData.proficiencia ?? escolaData.media);
          });
        }
      });
      
      // Calcular média de proficiência para cada item (turma ou escola)
      proficienciasPorItem.forEach((proficiencias, itemNome) => {
        const row = turmasMap.get(itemNome);
        if (row && proficiencias.length > 0) {
          row.proficienciaMedia = proficiencias.reduce((sum, p) => sum + p, 0) / proficiencias.length;
        }
      });
      
      // Se não encontrou proficiência por disciplina, usar GERAL
      if (relatorioCompleto.proficiencia.por_disciplina['GERAL']) {
        // Tentar por_turma primeiro
        if (relatorioCompleto.proficiencia.por_disciplina['GERAL'].por_turma) {
          relatorioCompleto.proficiencia.por_disciplina['GERAL'].por_turma.forEach(turmaData => {
            const row = turmasMap.get((turmaData.turma ?? '').trim());
            if (row && row.proficienciaMedia === undefined) {
              row.proficienciaMedia = turmaData.proficiencia;
            }
          });
        }
        // ✅ NOVO: Tentar por_escola se por_turma não estiver disponível
        if (relatorioCompleto.proficiencia.por_disciplina['GERAL'].por_escola && !hasPorTurma) {
          relatorioCompleto.proficiencia.por_disciplina['GERAL'].por_escola.forEach(escolaData => {
            const row = turmasMap.get((escolaData.escola ?? '').trim());
            if (row && row.proficienciaMedia === undefined) {
              row.proficienciaMedia = escolaData.proficiencia ?? escolaData.media;
            }
          });
        }
      }
      
      // Processar dados de comparecimento de total_alunos
      // ✅ MELHORADO: Verificar tanto por_turma quanto por_escola
      if (relatorioCompleto.total_alunos.por_turma && relatorioCompleto.total_alunos.por_turma.length > 0) {
        relatorioCompleto.total_alunos.por_turma.forEach(turmaAlunos => {
          const row = turmasMap.get((turmaAlunos.turma ?? '').trim());
          if (row) {
            row.matriculados = turmaAlunos.matriculados;
            row.avaliados = turmaAlunos.avaliados;
            row.comparecimento = turmaAlunos.percentual;
          }
        });
      } else if (relatorioCompleto.total_alunos.por_escola && relatorioCompleto.total_alunos.por_escola.length > 0) {
        // ✅ NOVO: Processar por_escola se por_turma não estiver disponível
        relatorioCompleto.total_alunos.por_escola.forEach(escolaAlunos => {
          const row = turmasMap.get((escolaAlunos.escola ?? '').trim());
          if (row) {
            row.matriculados = escolaAlunos.matriculados;
            row.avaliados = escolaAlunos.avaliados;
            row.comparecimento = escolaAlunos.percentual;
          }
        });
      }

      // Cartão-resposta: `nota_geral` / `proficiencia` por disciplina podem vir só com `media` (sem `por_turma`).
      // Nesse caso o mapa fica vazio e a tabela "Desempenho" não renderiza — sintetizamos linhas a partir de total_alunos.
      if (turmasMap.size === 0) {
        const nd = relatorioCompleto.nota_geral.por_disciplina;
        const pd = relatorioCompleto.proficiencia.por_disciplina;
        const lpEntry = findDisciplinaByAliases(nd, ["portugues", "português", "lingua portuguesa"]);
        const matEntry = findDisciplinaByAliases(nd, ["matematica", "matemática"]);
        const mediaLP = readMediaNotaRelatorio(lpEntry);
        const mediaMAT = readMediaNotaRelatorio(matEntry);
        const mediaGeral =
          readMediaNotaRelatorio(nd?.GERAL) ?? readMediaNotaRelatorio(findDisciplinaByAliases(nd, ["geral"]));
        const profGeral =
          readMediaProficienciaRelatorio(pd?.GERAL) ??
          readMediaProficienciaRelatorio(findDisciplinaByAliases(pd, ["geral"]));

        const preencherLinha = (nome: string, serieFallback: string, t: {
          matriculados?: number;
          avaliados?: number;
          percentual?: number;
        }) => {
          const row: ClassSummaryRow = {
            turma: nome,
            serie: serieFallback,
            mediaLP,
            mediaMAT,
            mediaGeral,
            proficienciaMedia: profGeral,
            matriculados: t.matriculados,
            avaliados: t.avaliados,
            comparecimento: t.percentual,
          };
          if (row.proficienciaMedia !== undefined) {
            const level = getProficiencyLevelForAggregatedData(row.proficienciaMedia, row.serie, curso);
            row.proficiencyLevel = level;
            row.proficiencyLabel = getProficiencyLevelLabel(level);
            row.proficiencyColor = getProficiencyLevelColorRelatorio(level);
          }
          turmasMap.set(nome, row);
        };

        const porTurma = relatorioCompleto.total_alunos.por_turma;
        if (porTurma && porTurma.length > 0) {
          porTurma.forEach((turmaAlunos) => {
            const nome = (turmaAlunos.turma ?? "").trim();
            if (!nome) return;
            const serieFallback = nome.split(/\s+/)[0] || "-";
            preencherLinha(nome, serieFallback, turmaAlunos);
          });
        } else {
          const porEscola = relatorioCompleto.total_alunos.por_escola;
          if (porEscola && porEscola.length > 0) {
            porEscola.forEach((escolaAlunos) => {
              const nome = (escolaAlunos.escola ?? "").trim();
              if (!nome) return;
              const serieFallback = nome.split(/\s+/)[0] || "-";
              preencherLinha(nome, serieFallback, escolaAlunos);
            });
          }
        }
      }
      
      // Calcular média geral se não foi definida
      Array.from(turmasMap.values()).forEach(row => {
        if (row.mediaGeral === undefined && (row.mediaLP !== undefined || row.mediaMAT !== undefined)) {
          const mediasDisciplinas = [row.mediaLP, row.mediaMAT].filter((m): m is number => m !== undefined);
          if (mediasDisciplinas.length > 0) {
            row.mediaGeral = mediasDisciplinas.reduce((sum, m) => sum + m, 0) / mediasDisciplinas.length;
          }
        }
        
        // Calcular nível de proficiência
        if (row.proficienciaMedia !== undefined) {
          const level = getProficiencyLevelForAggregatedData(row.proficienciaMedia, row.serie, curso);
          row.proficiencyLevel = level;
          row.proficiencyLabel = getProficiencyLevelLabel(level);
          row.proficiencyColor = getProficiencyLevelColorRelatorio(level);
        }
      });
      
      const sortedRows = Array.from(turmasMap.values()).sort((a, b) => 
        a.turma.localeCompare(b.turma, 'pt-BR', { sensitivity: 'base' })
      );

      // ✅ Coerência com a página de Resultados:
      // A classificação (Básico/Adequado/etc) vem do backend em `nivel_proficiencia_geral`.
      // Aqui a gente escolhe o nível mais frequente por item (escola/turma).
      if (apiData?.tabela_detalhada?.geral?.alunos?.length) {
        const labelsByKey = new Map<string, string[]>();
        apiData.tabela_detalhada.geral.alunos.forEach((aluno) => {
          if (!alunoRowId(aluno)) return;
          const keyRaw = isMunicipalView
            ? escolaChaveAgrupamento(aluno, reportAnswerSheet, apiData.estatisticas_gerais?.nome)
            : turmaChaveAgrupamento(aluno, reportAnswerSheet);
          const key = turmaKey(keyRaw);
          if (!key) return;

          const list = labelsByKey.get(key) ?? [];
          const label =
            aluno.nivel_proficiencia_geral ||
            (aluno as { classificacao?: string }).classificacao;
          if (label) {
            list.push(label);
            labelsByKey.set(key, list);
          }
        });

        sortedRows.forEach((row) => {
          const backendLabels = labelsByKey.get(turmaKey(row.turma)) ?? [];
          const level = getBestProficiencyLevelFromBackendLabels(backendLabels);
          if (!level) return;
          row.proficiencyLevel = level;
          row.proficiencyLabel = getProficiencyLevelLabel(level);
          row.proficiencyColor = getProficiencyLevelColorRelatorio(level);
        });
      }

      return sortedRows;
    }
    
    // Avaliação online: usar agregados por linha em resultados_detalhados.avaliacoes
    // para evitar agrupamento inválido quando turma/escola vem vazia em tabela_detalhada.
    if (!reportAnswerSheet && !isAnswerSheetAgregados && apiData?.resultados_detalhados?.avaliacoes?.length) {
      const granularidade = apiData.nivel_granularidade;
      const disciplinas = apiData.resultados_por_disciplina ?? [];
      const mediaLpGlobal = readOptionalFiniteNumber(
        disciplinas.find((d) => nomeDisciplinaEhPortugues(d.disciplina))?.media_nota
      );
      const mediaMatGlobal = readOptionalFiniteNumber(
        disciplinas.find((d) => nomeDisciplinaEhMatematica(d.disciplina))?.media_nota
      );
      const rows: ClassSummaryRow[] = apiData.resultados_detalhados.avaliacoes.map((avaliacao, index) => {
        const { turmaLabel, serieVal } = labelsFromAvaliacaoClassStatistics(
          granularidade,
          avaliacao,
          index
        );

        const computedMedias = mediasLPeMatematicaPorLinhaAvaliacao(
          avaliacao,
          apiData.tabela_detalhada,
          granularidade
        );
        const lpAg = readOptionalFiniteNumber(
          (avaliacao as { media_nota_lingua_portuguesa?: number | null }).media_nota_lingua_portuguesa
        );
        const matAg = readOptionalFiniteNumber(
          (avaliacao as { media_nota_matematica?: number | null }).media_nota_matematica
        );

        // `tabela_detalhada.geral.alunos` traz TODOS os alunos do escopo,
        // inclusive ausentes (com `nota_geral=0` e `proficiencia_geral=0`).
        // Para evitar inflar/zerar médias, contabilizamos separadamente
        // todos os alunos da linha vs. apenas quem efetivamente fez.
        const alunosLinhaTodos =
          apiData.tabela_detalhada?.geral?.alunos?.filter((aluno) =>
            alunoRowId(aluno) && alunoPertenceLinhaAvaliacao(aluno, avaliacao, granularidade)
          ) ?? [];
        const idsLinhaTodos = new Set(
          alunosLinhaTodos.map((aluno) => alunoRowId(aluno)).filter((id): id is string => Boolean(id))
        );
        const alunosLinhaParticipantes = alunosLinhaTodos.filter((aluno) =>
          alunoGeralNaTabelaParticipou(aluno)
        );
        const idsParticipantes = new Set(
          alunosLinhaParticipantes
            .map((aluno) => alunoRowId(aluno))
            .filter((id): id is string => Boolean(id))
        );

        const notasParticipantes = alunosLinhaParticipantes
          .map((aluno) => Number(aluno.nota_geral))
          .filter((n) => Number.isFinite(n));
        const profsParticipantes = alunosLinhaParticipantes
          .map((aluno) => Number(aluno.proficiencia_geral))
          .filter((n) => Number.isFinite(n));

        // Prioriza a contagem real (tabela_detalhada.geral.alunos), pois o
        // agregado do backend pode trazer total/participantes inconsistentes
        // por agrupamento; só usa o agregado quando a tabela detalhada não
        // tem alunos para a linha.
        const totalAlunos = idsLinhaTodos.size > 0
          ? idsLinhaTodos.size
          : (avaliacao.total_alunos ?? 0);
        const participantes = idsLinhaTodos.size > 0
          ? idsParticipantes.size
          : (avaliacao.alunos_participantes ?? 0);

        const comparecimento =
          totalAlunos > 0 ? (participantes / totalAlunos) * 100 : undefined;

        const mediaGeralFromParticipantes = notasParticipantes.length
          ? notasParticipantes.reduce((sum, n) => sum + n, 0) / notasParticipantes.length
          : undefined;
        const profMediaFromParticipantes = profsParticipantes.length
          ? profsParticipantes.reduce((sum, p) => sum + p, 0) / profsParticipantes.length
          : undefined;

        const proficienciaMedia =
          profMediaFromParticipantes ??
          readOptionalFiniteNumber(avaliacao.media_proficiencia) ??
          readOptionalFiniteNumber(apiData.estatisticas_gerais?.media_proficiencia_geral);
        const mediaGeral =
          mediaGeralFromParticipantes ??
          readOptionalFiniteNumber(avaliacao.media_nota) ??
          readOptionalFiniteNumber(apiData.estatisticas_gerais?.media_nota_geral);

        const row: ClassSummaryRow = {
          turma: turmaLabel,
          serie: serieVal,
          escola_id: (avaliacao as { escola_id?: string }).escola_id,
          mediaLP,
          mediaMAT,
          mediaGeral,
          proficienciaMedia,
          matriculados: totalAlunos,
          avaliados: participantes,
          comparecimento,
        };

        const labelsDaLinha = alunosLinhaParticipantes
          .map(
            (aluno) =>
              aluno.nivel_proficiencia_geral ||
              (aluno as { classificacao?: string }).classificacao
          )
          .filter((lbl): lbl is string => Boolean(lbl));

        const pNum = Number(proficienciaMedia);
        const levelFromMedia =
          proficienciaMedia !== undefined &&
          proficienciaMedia !== null &&
          !Number.isNaN(pNum)
            ? getProficiencyLevelAggregadoCartaoOuRelatorio(
                pNum,
                apiData,
                avaliacao.serie ?? serieVal
              )
            : null;
        const levelFromDist = getBestProficiencyLevelFromBackendDistribution(
          avaliacao.distribuicao_classificacao
        );
        const levelFromAlunos = getBestProficiencyLevelFromBackendLabels(labelsDaLinha);
        const level = levelFromMedia ?? levelFromDist ?? levelFromAlunos;
        if (level) {
          row.proficiencyLevel = level;
          row.proficiencyLabel = getProficiencyLevelLabel(level);
          row.proficiencyColor = getProficiencyLevelColorRelatorio(level);
        }

        return row;
      });

      return rows.sort((a, b) =>
        a.turma.localeCompare(b.turma, "pt-BR", { sensitivity: "base" })
      );
    }

    // Fallback: usar dados de tabela_detalhada se relatório completo não estiver disponível
    if (!apiData || !apiData.tabela_detalhada) {
      return [];
    }

    const curso = inferirCursoFromApiData(apiData);

    // ✅ NOVO: Processar dados reais de tabela_detalhada
    if (isMunicipalView) {
      // Agrupar por escola usando tabela_detalhada
      const escolasMap = new Map<string, {
        alunos: Set<string>;
        notasLP: number[];
        notasMAT: number[];
        notasGeral: number[];
        proficiencias: number[];
        serie: string;
      }>();

      // Processar alunos de todas as disciplinas
      apiData.tabela_detalhada.disciplinas.forEach(disciplina => {
        const disciplinaNome = disciplina.nome?.toLowerCase() || '';
        const isPortugues = disciplinaNome.includes('português') || disciplinaNome.includes('portugues');
        const isMatematica = disciplinaNome.includes('matemática') || disciplinaNome.includes('matematica');

        disciplina.alunos?.forEach(aluno => {
          const rowId = alunoRowId(aluno);
          if (!rowId) return;
          const escolaNome = escolaChaveAgrupamento(aluno, reportAnswerSheet, apiData.estatisticas_gerais?.nome);
          if (!escolaNome) return;

          const serieAluno =
            (aluno.serie?.trim() && aluno.serie.trim().toUpperCase() !== "N/A")
              ? aluno.serie.trim()
              : reportAnswerSheet
                ? "—"
                : "-";
          if (!escolasMap.has(escolaNome)) {
            escolasMap.set(escolaNome, {
              alunos: new Set(),
              notasLP: [],
              notasMAT: [],
              notasGeral: [],
              proficiencias: [],
              serie: serieAluno
            });
          }

          const escola = escolasMap.get(escolaNome)!;
          escola.alunos.add(rowId);

          // Coletar notas e proficiências por disciplina
          if (aluno.nota !== undefined && aluno.nota !== null && !Number.isNaN(aluno.nota)) {
            if (isPortugues) {
              escola.notasLP.push(aluno.nota);
            } else if (isMatematica) {
              escola.notasMAT.push(aluno.nota);
            } else if (!reportAnswerSheet) {
              escola.notasGeral.push(aluno.nota);
            }
          }

          // Cartão-resposta: proficiência por escola/turma vem de `geral.proficiencia_geral` (escala SAEB);
          // `proficiencia` por disciplina costuma ser outro recorte — não misturar na média.
          if (
            !reportAnswerSheet &&
            aluno.proficiencia !== undefined &&
            aluno.proficiencia !== null &&
            !Number.isNaN(aluno.proficiencia)
          ) {
            escola.proficiencias.push(aluno.proficiencia);
          }
        });
      });

      // Processar dados gerais se disponível
      if (apiData.tabela_detalhada.geral?.alunos) {
        apiData.tabela_detalhada.geral.alunos.forEach(aluno => {
          const rowId = alunoRowId(aluno);
          if (!rowId) return;
          const escolaNome = escolaChaveAgrupamento(aluno, reportAnswerSheet, apiData.estatisticas_gerais?.nome);
          if (!escolaNome) return;
          const escola = escolasMap.get(escolaNome);
          if (escola) {
            if (aluno.nota_geral !== undefined && aluno.nota_geral !== null && !Number.isNaN(aluno.nota_geral)) {
              escola.notasGeral.push(aluno.nota_geral);
            }
            if (aluno.proficiencia_geral !== undefined && aluno.proficiencia_geral !== null && !Number.isNaN(aluno.proficiencia_geral)) {
              escola.proficiencias.push(aluno.proficiencia_geral);
            }
          }
        });
      }

      // Cartão-resposta (visão município): fallback de proficiência = média LP+MAT por aluno
      if (reportAnswerSheet) {
        escolasMap.forEach((dados, escolaNome) => {
          if (dados.proficiencias.length > 0) return;
          const byStudent = new Map<string, number[]>();
          apiData.tabela_detalhada!.disciplinas.forEach((disciplina) => {
            const disciplinaNome = disciplina.nome?.toLowerCase() || "";
            const isLP = disciplinaNome.includes("português") || disciplinaNome.includes("portugues");
            const isMAT = disciplinaNome.includes("matemática") || disciplinaNome.includes("matematica");
            if (!isLP && !isMAT) return;
            disciplina.alunos?.forEach((aluno) => {
              const rowId = alunoRowId(aluno);
              if (!rowId) return;
              if (
                (escolaChaveAgrupamento(aluno, reportAnswerSheet, apiData.estatisticas_gerais?.nome) || "") !==
                escolaNome
              )
                return;
              if (aluno.proficiencia === undefined || aluno.proficiencia === null || Number.isNaN(aluno.proficiencia))
                return;
              const list = byStudent.get(rowId) ?? [];
              list.push(Number(aluno.proficiencia));
              byStudent.set(rowId, list);
            });
          });
          byStudent.forEach((vals) => {
            if (vals.length === 0) return;
            dados.proficiencias.push(vals.reduce((a, b) => a + b, 0) / vals.length);
          });
        });
      }

      // Converter para ClassSummaryRow
      const rows: ClassSummaryRow[] = Array.from(escolasMap.entries()).map(([escolaNome, dados]) => {
        // Calcular médias de notas por disciplina
        const mediaLP = dados.notasLP.length > 0 
          ? dados.notasLP.reduce((sum, nota) => sum + nota, 0) / dados.notasLP.length 
          : undefined;
        const mediaMAT = dados.notasMAT.length > 0 
          ? dados.notasMAT.reduce((sum, nota) => sum + nota, 0) / dados.notasMAT.length 
          : undefined;
        
        // Priorizar média geral dos dados agregados, depois calcular a partir das médias por disciplina
        let mediaGeral = dados.notasGeral.length > 0 
          ? dados.notasGeral.reduce((sum, nota) => sum + nota, 0) / dados.notasGeral.length 
          : undefined;
        
        // Se não tem média geral direta, calcular a partir das médias das disciplinas
        if (mediaGeral === undefined && (mediaLP !== undefined || mediaMAT !== undefined)) {
          const mediasDisciplinas = [mediaLP, mediaMAT].filter((m): m is number => m !== undefined);
          if (mediasDisciplinas.length > 0) {
            mediaGeral = mediasDisciplinas.reduce((sum, m) => sum + m, 0) / mediasDisciplinas.length;
          }
        }
        
        const proficienciaMedia = dados.proficiencias.length > 0 
          ? dados.proficiencias.reduce((sum, prof) => sum + prof, 0) / dados.proficiencias.length 
          : undefined;

        const avaliados = dados.alunos.size;
        // Cartão-resposta: denominador global distorce comparecimento por escola — usar só o recorte agregado
        const matriculados = reportAnswerSheet
          ? Math.max(avaliados, 1)
          : apiData.estatisticas_gerais?.total_alunos || avaliados;
        const comparecimento = matriculados > 0 ? (avaliados / matriculados) * 100 : undefined;

        const row: ClassSummaryRow = {
          turma: escolaNome,
          serie: dados.serie,
          mediaLP,
          mediaMAT,
          mediaGeral,
          proficienciaMedia,
          matriculados,
          avaliados,
          comparecimento
        };

        if (row.proficienciaMedia !== undefined) {
          const level = getProficiencyLevelForAggregatedData(row.proficienciaMedia, row.serie, curso);
          row.proficiencyLevel = level;
          row.proficiencyLabel = getProficiencyLevelLabel(level);
          row.proficiencyColor = getProficiencyLevelColorRelatorio(level);
        }

        return row;
      });

      const sortedRows = rows.sort((a, b) => a.turma.localeCompare(b.turma, 'pt-BR', { sensitivity: 'base' }));
      if (apiData?.tabela_detalhada?.geral?.alunos?.length) {
        const labelsByKey = new Map<string, string[]>();
        apiData.tabela_detalhada.geral.alunos.forEach((aluno) => {
          if (!alunoRowId(aluno)) return;
          const key = isMunicipalView
            ? escolaChaveAgrupamento(aluno, reportAnswerSheet, apiData.estatisticas_gerais?.nome)
            : turmaChaveAgrupamento(aluno, reportAnswerSheet);
          if (!key) return;
          const list = labelsByKey.get(key) ?? [];
          const label =
            aluno.nivel_proficiencia_geral ||
            (aluno as { classificacao?: string }).classificacao;
          if (label) {
            list.push(label);
            labelsByKey.set(key, list);
          }
        });

        sortedRows.forEach((row) => {
          const backendLabels = labelsByKey.get(row.turma) ?? [];
          const level = getBestProficiencyLevelFromBackendLabels(backendLabels);
          if (!level) return;
          row.proficiencyLevel = level;
          row.proficiencyLabel = getProficiencyLevelLabel(level);
          row.proficiencyColor = getProficiencyLevelColorRelatorio(level);
        });
      }

      return sortedRows;
    }

    // ✅ NOVO: Agrupar por turma usando tabela_detalhada
    const turmasMap = new Map<string, {
      alunos: Set<string>;
      notasLP: number[];
      notasMAT: number[];
      notasGeral: number[];
      proficiencias: number[];
      serie: string;
    }>();

    // Processar alunos de todas as disciplinas
    apiData.tabela_detalhada.disciplinas.forEach(disciplina => {
      const disciplinaNome = disciplina.nome?.toLowerCase() || '';
      const isPortugues = disciplinaNome.includes('português') || disciplinaNome.includes('portugues');
      const isMatematica = disciplinaNome.includes('matemática') || disciplinaNome.includes('matematica');

      disciplina.alunos?.forEach(aluno => {
        const rowId = alunoRowId(aluno);
        if (!rowId) return;
        const turmaNome = turmaChaveAgrupamento(aluno, reportAnswerSheet);
        if (!turmaNome) return;

        const serieAluno =
          (aluno.serie?.trim() && aluno.serie.trim().toUpperCase() !== "N/A")
            ? aluno.serie.trim()
            : reportAnswerSheet
              ? "—"
              : turmaNome.split(" ")[0] || "-";
        if (!turmasMap.has(turmaNome)) {
          turmasMap.set(turmaNome, {
            alunos: new Set(),
            notasLP: [],
            notasMAT: [],
            notasGeral: [],
            proficiencias: [],
            serie: serieAluno
          });
        }

        const turma = turmasMap.get(turmaNome)!;
        turma.alunos.add(rowId);

        // Coletar notas e proficiências por disciplina
        if (aluno.nota !== undefined && aluno.nota !== null && !Number.isNaN(aluno.nota)) {
          if (isPortugues) {
            turma.notasLP.push(aluno.nota);
          } else if (isMatematica) {
            turma.notasMAT.push(aluno.nota);
          } else if (!reportAnswerSheet) {
            turma.notasGeral.push(aluno.nota);
          }
        }

        if (
          !reportAnswerSheet &&
          aluno.proficiencia !== undefined &&
          aluno.proficiencia !== null &&
          !Number.isNaN(aluno.proficiencia)
        ) {
          turma.proficiencias.push(aluno.proficiencia);
        }
      });
    });

    // Processar dados gerais se disponível
    if (apiData.tabela_detalhada.geral?.alunos) {
      apiData.tabela_detalhada.geral.alunos.forEach(aluno => {
        const rowId = alunoRowId(aluno);
        if (!rowId) return;
        const turmaNome = turmaChaveAgrupamento(aluno, reportAnswerSheet);
        if (!turmaNome) return;
        const turma = turmasMap.get(turmaNome);
        if (turma) {
          if (aluno.nota_geral !== undefined && aluno.nota_geral !== null && !Number.isNaN(aluno.nota_geral)) {
            turma.notasGeral.push(aluno.nota_geral);
          }
          if (aluno.proficiencia_geral !== undefined && aluno.proficiencia_geral !== null && !Number.isNaN(aluno.proficiencia_geral)) {
            turma.proficiencias.push(aluno.proficiencia_geral);
          }
        }
      });
    }

    // Cartão-resposta: se não houver `geral`, uma proficiência por aluno = média LP+MAT (evita média sobre 2N valores)
    if (reportAnswerSheet) {
      turmasMap.forEach((dados, turmaNome) => {
        if (dados.proficiencias.length > 0) return;
        const byStudent = new Map<string, number[]>();
        apiData.tabela_detalhada!.disciplinas.forEach((disciplina) => {
          const disciplinaNome = disciplina.nome?.toLowerCase() || "";
          const isLP = disciplinaNome.includes("português") || disciplinaNome.includes("portugues");
          const isMAT = disciplinaNome.includes("matemática") || disciplinaNome.includes("matematica");
          if (!isLP && !isMAT) return;
          disciplina.alunos?.forEach((aluno) => {
            const rowId = alunoRowId(aluno);
            if (!rowId) return;
            if ((turmaChaveAgrupamento(aluno, reportAnswerSheet) || "") !== turmaNome) return;
            if (aluno.proficiencia === undefined || aluno.proficiencia === null || Number.isNaN(aluno.proficiencia)) return;
            const list = byStudent.get(rowId) ?? [];
            list.push(Number(aluno.proficiencia));
            byStudent.set(rowId, list);
          });
        });
        byStudent.forEach((vals) => {
          if (vals.length === 0) return;
          dados.proficiencias.push(vals.reduce((a, b) => a + b, 0) / vals.length);
        });
      });
    }

    // Converter para ClassSummaryRow
    const rows: ClassSummaryRow[] = Array.from(turmasMap.entries()).map(([turmaNome, dados]) => {
      // Calcular médias de notas por disciplina
      const mediaLP = dados.notasLP.length > 0 
        ? dados.notasLP.reduce((sum, nota) => sum + nota, 0) / dados.notasLP.length 
        : undefined;
      const mediaMAT = dados.notasMAT.length > 0 
        ? dados.notasMAT.reduce((sum, nota) => sum + nota, 0) / dados.notasMAT.length 
        : undefined;
      
      // Priorizar média geral dos dados agregados, depois calcular a partir das médias por disciplina
      let mediaGeral = dados.notasGeral.length > 0 
        ? dados.notasGeral.reduce((sum, nota) => sum + nota, 0) / dados.notasGeral.length 
        : undefined;
      
      // Se não tem média geral direta, calcular a partir das médias das disciplinas
      if (mediaGeral === undefined && (mediaLP !== undefined || mediaMAT !== undefined)) {
        const mediasDisciplinas = [mediaLP, mediaMAT].filter((m): m is number => m !== undefined);
        if (mediasDisciplinas.length > 0) {
          mediaGeral = mediasDisciplinas.reduce((sum, m) => sum + m, 0) / mediasDisciplinas.length;
        }
      }
      
      const proficienciaMedia = dados.proficiencias.length > 0 
        ? dados.proficiencias.reduce((sum, prof) => sum + prof, 0) / dados.proficiencias.length 
        : undefined;

      const avaliados = dados.alunos.size;
      const matriculados = reportAnswerSheet
        ? Math.max(avaliados, 1)
        : apiData.estatisticas_gerais?.total_alunos || avaliados;
      const comparecimento = matriculados > 0 ? (avaliados / matriculados) * 100 : undefined;

      const row: ClassSummaryRow = {
        turma: turmaNome,
        serie: dados.serie,
        mediaLP,
        mediaMAT,
        mediaGeral,
        proficienciaMedia,
        matriculados,
        avaliados,
        comparecimento
      };

      if (row.proficienciaMedia !== undefined) {
        const level = getProficiencyLevelForAggregatedData(row.proficienciaMedia, row.serie, curso);
        row.proficiencyLevel = level;
        row.proficiencyLabel = getProficiencyLevelLabel(level);
        row.proficiencyColor = getProficiencyLevelColorRelatorio(level);
      }

      return row;
    });

    const sortedRows = rows.sort((a, b) => a.turma.localeCompare(b.turma, 'pt-BR', { sensitivity: 'base' }));
    if (apiData?.tabela_detalhada?.geral?.alunos?.length) {
      const labelsByKey = new Map<string, string[]>();
      apiData.tabela_detalhada.geral.alunos.forEach((aluno) => {
        if (!alunoRowId(aluno)) return;
        const key = isMunicipalView
          ? escolaChaveAgrupamento(aluno, reportAnswerSheet, apiData.estatisticas_gerais?.nome)
          : turmaChaveAgrupamento(aluno, reportAnswerSheet);
        if (!key) return;
        const list = labelsByKey.get(key) ?? [];
        const label =
          aluno.nivel_proficiencia_geral ||
          (aluno as { classificacao?: string }).classificacao;
        if (label) {
          list.push(label);
          labelsByKey.set(key, list);
        }
      });

      sortedRows.forEach((row) => {
        const backendLabels = labelsByKey.get(row.turma) ?? [];
        const level = getBestProficiencyLevelFromBackendLabels(backendLabels);
        if (!level) return;
        row.proficiencyLevel = level;
        row.proficiencyLabel = getProficiencyLevelLabel(level);
        row.proficiencyColor = getProficiencyLevelColorRelatorio(level);
      });
    }

    return sortedRows;
  }, [apiData, isMunicipalView, relatorioCompleto, reportAnswerSheet, isAnswerSheetAgregados]);

  const classSummaryRowsRanked = useMemo(() => {
    const sorted = sortInstitutionalRowsByPerformance(classSummaryRows);
    return filterInstitutionalRankingRowsByRoleAccess(sorted, {
      role: user?.role,
      hierarchy: userHierarchyContext,
      granularidade: apiData?.nivel_granularidade,
      isMunicipalView,
    });
  }, [classSummaryRows, user?.role, userHierarchyContext, apiData?.nivel_granularidade, isMunicipalView]);

  const distributionCharts = useMemo<DistributionChartData[]>(() => {
    if (!apiData) return [];

    const pdStats = (
      apiData.estatisticas_gerais as {
        por_disciplina?: Array<{
          disciplina: string;
          distribuicao_classificacao?: Record<string, number>;
        }>;
      }
    )?.por_disciplina;
    const fromStats = Array.isArray(pdStats) && pdStats.length > 0;
    const baseList = fromStats ? pdStats : (apiData.resultados_por_disciplina ?? []);
    if (!baseList.length) return [];

    const REL_DIST_COLORS = ["#EF4444", "#FACC15", "#22C55E", "#16A34A", "#6366f1", "#a855f7"];

    return baseList
      .filter((dadosDisciplina) => {
        if (fromStats) return true;
        if (!isAnswerSheetAgregados) return true;
        return !isNomeDisciplinaGeralAgregado(dadosDisciplina.disciplina);
      })
      .map((dadosDisciplina) => {
        const distribuicao = dadosDisciplina.distribuicao_classificacao as
          | Record<string, number>
          | undefined;
        if (!distribuicao || typeof distribuicao !== "object") return null;

        const d = distribuicao as Record<string, unknown>;
        const hasStandard =
          "abaixo_do_basico" in d ||
          "basico" in d ||
          "adequado" in d ||
          "avancado" in d;

        const disciplinaNome = dadosDisciplina.disciplina || "Disciplina";
        const title = disciplinaNome.toUpperCase();

        if (hasStandard) {
          const abaixo_do_basico = Number(d.abaixo_do_basico ?? 0);
          const basico = Number(d.basico ?? 0);
          const adequado = Number(d.adequado ?? 0);
          const avancado = Number(d.avancado ?? 0);
          const total = abaixo_do_basico + basico + adequado + avancado;
          if (total === 0) return null;
          const segments = [
            { key: "abaixo", label: "Abaixo do Básico", value: abaixo_do_basico, color: "#EF4444" },
            { key: "basico", label: "Básico", value: basico, color: "#FACC15" },
            { key: "adequado", label: "Adequado", value: adequado, color: "#22C55E" },
            { key: "avancado", label: "Avançado", value: avancado, color: "#16A34A" },
          ].map((segment) => ({
            ...segment,
            percentage: total > 0 ? Number(((segment.value / total) * 100).toFixed(1)) : 0,
          }));
          return { title, total, segments } as DistributionChartData;
        }

        const entries = Object.entries(distribuicao).filter(([, v]) => Number(v) > 0);
        const total = entries.reduce((s, [, v]) => s + (Number(v) || 0), 0);
        if (total === 0) return null;
        const segments = entries
          .map(([label, value], idx) => ({
            key: `dyn-${idx}-${normalizeText(label)}`,
            label,
            value: Number(value) || 0,
            color: REL_DIST_COLORS[idx % REL_DIST_COLORS.length],
          }))
          .map((segment) => ({
            ...segment,
            percentage: total > 0 ? Number(((segment.value / total) * 100).toFixed(1)) : 0,
          }));
        return { title, total, segments } as DistributionChartData;
      })
      .filter((item): item is DistributionChartData => Boolean(item));
  }, [apiData, isAnswerSheetAgregados]);

  const summaryStats = useMemo(() => {
    // ✅ PRIORIDADE: Usar dados do relatório completo se disponível (nunca no fluxo cartão-resposta agregados)
    if (relatorioCompleto && !isAnswerSheetAgregados) {
      const nd = relatorioCompleto.nota_geral.por_disciplina;
      const pd = relatorioCompleto.proficiencia.por_disciplina;

      const portuguesNota =
        readMediaNotaRelatorio(nd['Português']) ??
        readMediaNotaRelatorio(nd['Língua Portuguesa']) ??
        readMediaNotaRelatorio(
          Object.entries(nd).find(([key]) =>
            key.toLowerCase().includes('português') || key.toLowerCase().includes('portugues')
          )?.[1]
        );

      const matematicaNota =
        readMediaNotaRelatorio(nd['Matemática']) ??
        readMediaNotaRelatorio(
          Object.entries(nd).find(([key]) =>
            key.toLowerCase().includes('matemática') || key.toLowerCase().includes('matematica')
          )?.[1]
        );

      const geralNota = readMediaNotaRelatorio(nd['GERAL']);

      const portuguesProf =
        readMediaProficienciaRelatorio(pd['Português']) ??
        readMediaProficienciaRelatorio(pd['Língua Portuguesa']) ??
        readMediaProficienciaRelatorio(
          Object.entries(pd).find(([key]) =>
            key.toLowerCase().includes('português') || key.toLowerCase().includes('portugues')
          )?.[1]
        );

      const matematicaProf =
        readMediaProficienciaRelatorio(pd['Matemática']) ??
        readMediaProficienciaRelatorio(
          Object.entries(pd).find(([key]) =>
            key.toLowerCase().includes('matemática') || key.toLowerCase().includes('matematica')
          )?.[1]
        );

      const proficienciasValidas = [portuguesProf, matematicaProf].filter((p): p is number => p !== undefined);
      const proficienciaMedia =
        proficienciasValidas.length > 0
          ? proficienciasValidas.reduce((sum, p) => sum + p, 0) / proficienciasValidas.length
          : readMediaProficienciaRelatorio(pd['GERAL']) ?? null;
      
      const totalGeral = relatorioCompleto.total_alunos.total_geral;
      const totalMatriculados = totalGeral?.matriculados ?? null;
      const totalAvaliados = totalGeral?.avaliados ?? null;
      const comparecimentoGeral = totalGeral?.percentual ?? null;

      const serieKpiRc =
        apiData?.estatisticas_gerais?.serie?.trim() ||
        (apiData ? inferirSerieParaDescricao(apiData) : undefined) ||
        undefined;
      const pKpiRc = proficienciaMedia != null ? Number(proficienciaMedia) : NaN;
      const proficiencyLevel =
        apiData && !Number.isNaN(pKpiRc)
          ? getProficiencyLevelAggregadoCartaoOuRelatorio(pKpiRc, apiData, serieKpiRc)
          : getBestProficiencyLevelFromBackendDistribution(
              apiData?.estatisticas_gerais?.distribuicao_classificacao_geral
            );

      return {
        mediaLP: portuguesNota ?? null,
        mediaMAT: matematicaNota ?? null,
        mediaGeral: geralNota ?? null,
        proficienciaMedia,
        proficiencyLevel,
        proficiencyLabel: proficiencyLevel ? getProficiencyLevelLabel(proficiencyLevel) : null,
        proficiencyColor: proficiencyLevel ? getProficiencyLevelColorRelatorio(proficiencyLevel) : null,
        totalMatriculados,
        totalAvaliados,
        comparecimentoGeral
      };
    }
    
    if (!apiData) return null;

    const porDisciplinaFromStats = (
      apiData.estatisticas_gerais as { por_disciplina?: NovaRespostaAPI["resultados_por_disciplina"] }
    )?.por_disciplina;
    const porDisciplinaFiltrado = (
      Array.isArray(porDisciplinaFromStats) && porDisciplinaFromStats.length > 0
        ? porDisciplinaFromStats
        : (apiData.resultados_por_disciplina ?? [])
    ).filter((d) => !isNomeDisciplinaGeralAgregado(d.disciplina));

    // ✅ Cartão resposta (GET /answer-sheets/resultados-agregados): KPIs alinhados ao payload da rota
    if (isAnswerSheetAgregados) {
      const portuguesDisciplina = porDisciplinaFiltrado.find(
        (d) =>
          d.disciplina?.toLowerCase().includes('português') || d.disciplina?.toLowerCase().includes('portugues')
      );
      const matematicaDisciplina = porDisciplinaFiltrado.find(
        (d) =>
          d.disciplina?.toLowerCase().includes('matemática') || d.disciplina?.toLowerCase().includes('matematica')
      );

      const mediaLP =
        portuguesDisciplina?.media_nota != null && !Number.isNaN(Number(portuguesDisciplina.media_nota))
          ? Number(portuguesDisciplina.media_nota)
          : null;
      const mediaMAT =
        matematicaDisciplina?.media_nota != null && !Number.isNaN(Number(matematicaDisciplina.media_nota))
          ? Number(matematicaDisciplina.media_nota)
          : null;

      const eg = apiData.estatisticas_gerais;
      const mediaGeral =
        eg?.media_nota_geral != null && !Number.isNaN(Number(eg.media_nota_geral))
          ? Number(eg.media_nota_geral)
          : null;

      const proficienciaMedia =
        eg?.media_proficiencia_geral != null && !Number.isNaN(Number(eg.media_proficiencia_geral))
          ? Number(eg.media_proficiencia_geral)
          : null;

      if (mediaLP === null && mediaMAT === null && mediaGeral === null && proficienciaMedia === null) {
        return null;
      }

      const ncStats = apiData.estatisticas_gerais?.nivel_classificacao;
      const levelFromNc =
        ncStats !== undefined && ncStats !== null && String(ncStats).trim()
          ? backendNivelProficienciaToLevel(String(ncStats).trim())
          : null;
      const proficiencyLevelFromDist = getBestProficiencyLevelFromBackendDistribution(
        apiData.estatisticas_gerais?.distribuicao_classificacao_geral
      );
      const proficiencyLevel = levelFromNc ?? proficiencyLevelFromDist;

      const totalMatriculados = apiData.estatisticas_gerais?.total_alunos ?? null;
      const totalAvaliados = apiData.estatisticas_gerais?.alunos_participantes ?? null;
      const pctEg = readOptionalFiniteNumber(apiData.estatisticas_gerais?.percentual_comparecimento);
      const comparecimentoGeral =
        pctEg !== undefined
          ? pctEg
          : totalMatriculados && totalMatriculados > 0
            ? ((totalAvaliados ?? 0) / totalMatriculados) * 100
            : null;

      const proficiencyLabel =
        ncStats !== undefined && ncStats !== null && String(ncStats).trim()
          ? String(ncStats).trim()
          : proficiencyLevel
            ? getProficiencyLevelLabel(proficiencyLevel)
            : null;

      return {
        mediaLP,
        mediaMAT,
        mediaGeral,
        proficienciaMedia,
        proficiencyLevel,
        proficiencyLabel,
        proficiencyColor: proficiencyLevel ? getProficiencyLevelColorRelatorio(proficiencyLevel) : null,
        totalMatriculados,
        totalAvaliados,
        comparecimentoGeral
      };
    }

    // ✅ Avaliação digital: agregados do backend (`por_disciplina` nas estatísticas gerais, quando existir).
    const porDisciplinaDigital =
      (Array.isArray(porDisciplinaFromStats) && porDisciplinaFromStats.length > 0
        ? porDisciplinaFromStats
        : apiData.resultados_por_disciplina) ?? [];
    const portuguesDisciplina = porDisciplinaDigital.find((d) =>
      nomeDisciplinaEhPortugues(d.disciplina)
    );
    const matematicaDisciplina = porDisciplinaDigital.find((d) =>
      nomeDisciplinaEhMatematica(d.disciplina)
    );

    const mediaLpApi =
      portuguesDisciplina?.media_nota != null &&
      !Number.isNaN(Number(portuguesDisciplina.media_nota))
        ? Number(portuguesDisciplina.media_nota)
        : null;
    const mediaMatApi =
      matematicaDisciplina?.media_nota != null &&
      !Number.isNaN(Number(matematicaDisciplina.media_nota))
        ? Number(matematicaDisciplina.media_nota)
        : null;

    const mediaLP: number | null = mediaLpApi;
    const mediaMAT: number | null = mediaMatApi;

    const mediaGeral = readOptionalFiniteNumber(
      apiData.estatisticas_gerais?.media_nota_geral
    );
    const proficienciaMedia = readOptionalFiniteNumber(
      apiData.estatisticas_gerais?.media_proficiencia_geral
    );

    if (
      mediaLP === null &&
      mediaMAT === null &&
      mediaGeral === null &&
      proficienciaMedia === null
    ) {
      return null;
    }

    const ncStatsDigital = apiData.estatisticas_gerais?.nivel_classificacao;
    const levelFromNcDigital =
      ncStatsDigital !== undefined && ncStatsDigital !== null && String(ncStatsDigital).trim()
        ? backendNivelProficienciaToLevel(String(ncStatsDigital).trim())
        : null;
    const levelFromDistDigital = getBestProficiencyLevelFromBackendDistribution(
      apiData.estatisticas_gerais?.distribuicao_classificacao_geral
    );
    const serieKpiDigital =
      apiData.estatisticas_gerais?.serie?.trim() ||
      inferirSerieParaDescricao(apiData) ||
      undefined;
    const pKpiDigital = proficienciaMedia != null ? Number(proficienciaMedia) : NaN;
    const levelFromProficienciaMediaDigital =
      !Number.isNaN(pKpiDigital)
        ? getProficiencyLevelAggregadoCartaoOuRelatorio(
            pKpiDigital,
            apiData,
            serieKpiDigital
          )
        : null;
    const proficiencyLevel =
      levelFromNcDigital ?? levelFromDistDigital ?? levelFromProficienciaMediaDigital;

    const totalMatriculados = apiData.estatisticas_gerais?.total_alunos ?? null;
    const totalAvaliados = apiData.estatisticas_gerais?.alunos_participantes ?? null;
    const comparecimentoFromStats = readOptionalFiniteNumber(
      apiData.estatisticas_gerais?.percentual_comparecimento
    );
    const comparecimentoGeral =
      comparecimentoFromStats ??
      (
        totalMatriculados && totalMatriculados > 0
          ? ((Number(totalAvaliados ?? 0) / Number(totalMatriculados)) * 100)
          : null
      );

    return {
      mediaLP,
      mediaMAT,
      mediaGeral,
      proficienciaMedia,
      proficiencyLevel,
      proficiencyLabel:
        ncStatsDigital !== undefined && ncStatsDigital !== null && String(ncStatsDigital).trim()
          ? String(ncStatsDigital).trim()
          : proficiencyLevel
            ? getProficiencyLevelLabel(proficiencyLevel)
            : null,
      proficiencyColor: proficiencyLevel
        ? getProficiencyLevelColorRelatorio(proficiencyLevel)
        : null,
      totalMatriculados,
      totalAvaliados,
      comparecimentoGeral
    };
  }, [apiData, relatorioCompleto, isAnswerSheetAgregados]);

  const disciplineSummaryCards = useMemo(() => {
    if (!apiData) return [];

    const fromStats = (apiData.estatisticas_gerais as { por_disciplina?: { disciplina?: string; media_nota?: number }[] })
      ?.por_disciplina;
    let list =
      Array.isArray(fromStats) && fromStats.length > 0
        ? fromStats.filter((d) => !isNomeDisciplinaGeralAgregado(d.disciplina))
        : (apiData.resultados_por_disciplina ?? []).filter((d) => !isNomeDisciplinaGeralAgregado(d.disciplina));

    if (!list.length && apiData.resultados_por_disciplina?.length) {
      list = apiData.resultados_por_disciplina.filter((d) => !isNomeDisciplinaGeralAgregado(d.disciplina));
    }

    return list
      .map((d) => {
        const media = readOptionalFiniteNumber(d.media_nota);
        if (media === undefined) return null;
        const nome = (d.disciplina ?? "").trim() || "Disciplina";
        return {
          key: normalizeText(nome),
          label: `Média ${nome}`,
          value: media,
          badge: nome,
        };
      })
      .filter((item): item is { key: string; label: string; value: number; badge: string } => Boolean(item));
  }, [apiData]);

  const performanceDisciplineColumns = useMemo<
    Array<{ key: "lp" | "mat"; label: string }>
  >(() => {
    const hasLp = disciplineSummaryCards.some((c) =>
      nomeDisciplinaEhPortugues(c.badge)
    );
    const hasMat = disciplineSummaryCards.some((c) =>
      nomeDisciplinaEhMatematica(c.badge)
    );
    const cols: Array<{ key: "lp" | "mat"; label: string }> = [];
    if (hasLp) cols.push({ key: "lp", label: "Média LP" });
    if (hasMat) cols.push({ key: "mat", label: "Média MAT" });
    return cols;
  }, [disciplineSummaryCards]);

  const serieDaAvaliacao = useMemo(() => inferirSerieParaDescricao(apiData), [apiData]);



  const handleDownloadReport = useCallback(async () => {
    if (!apiData || !repGabaritoOrEval || repGabaritoOrEval === 'all') {
      toast({
        title: "Dados insuficientes",
        description: "Carregue os dados do relatório antes de gerar o PDF.",
        variant: "destructive"
      });
      return;
    }

    const tituloDaOpcaoProxima = apiData?.opcoes_proximos_filtros?.avaliacoes
      ?.find((a) => a.id === repGabaritoOrEval)
      ?.titulo?.trim();
    const tituloDaAvaliacaoDetalhada =
      apiData?.resultados_detalhados?.avaliacoes?.find((a) => a.id === repGabaritoOrEval)?.titulo?.trim() ||
      apiData?.resultados_detalhados?.avaliacoes?.[0]?.titulo?.trim();
    const opcaoGabaritoFiltro = (asOpcoes.gabaritos ?? []).find((g) => g.id === repGabaritoOrEval);
    const tituloDoSelectCartao = (
      opcaoGabaritoFiltro?.titulo ??
      opcaoGabaritoFiltro?.nome ??
      opcaoGabaritoFiltro?.name ??
      ""
    ).trim();
    const nomeStats = apiData?.estatisticas_gerais?.nome?.trim() ?? "";
    const nomeMunicipioStats = (apiData?.estatisticas_gerais?.municipio ?? "").trim();
    const nomeMunicipioFiltro =
      repMunicipality !== "all" ? String(repMunicipality).trim() : "";

    let evaluationTitle: string;
    if (reportAnswerSheet) {
      evaluationTitle =
        tituloDaOpcaoProxima ||
        tituloDaAvaliacaoDetalhada ||
        tituloDoSelectCartao ||
        (nomeStats &&
        nomeMunicipioStats &&
        normalizeText(nomeStats) !== normalizeText(nomeMunicipioStats) &&
        (!nomeMunicipioFiltro || normalizeText(nomeStats) !== normalizeText(nomeMunicipioFiltro))
          ? nomeStats
          : "") ||
        "CARTÃO RESPOSTA";
    } else {
      evaluationTitle =
        tituloDaOpcaoProxima ||
        nomeStats ||
        "AVALIAÇÃO";
    }
    
    if (userHierarchyContext && user?.role) {
      const validation = validateReportAccess(
        user.role,
        {
        state: repState,
        municipality: repMunicipality,
        school: repSchool
        },
        userHierarchyContext
      );

      if (!validation.isValid) {
        toast({
          title: "Acesso Negado",
          description: validation.reason || "Você não tem permissão para gerar este relatório.",
          variant: "destructive"
        });
        return;
      }
    }

      setIsGeneratingReport(true);

    try {
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;

      const brandingCityId = repMunicipality !== "all" ? repMunicipality : null;
      const cityBranding = await loadCityBrandingForReportPdf(brandingCityId);

      let logoDataUrl = '';
      let logoWidth = 0;
      let logoHeight = 0;
      if (cityBranding.logo) {
        logoDataUrl = cityBranding.logo.dataUrl;
        logoWidth = cityBranding.logo.iw;
        logoHeight = cityBranding.logo.ih;
      }

      // Ícone usado nos cabeçalhos internos (faixa compacta)
      let icoDataUrl = '';
      let icoWidth = 0;
      let icoHeight = 0;
      const icoAsset = await urlToPngAsset('/AFIRME-PLAY-ico.png');
      if (icoAsset) {
        icoDataUrl = icoAsset.dataUrl;
        icoWidth = icoAsset.iw;
        icoHeight = icoAsset.ih;
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      
      // Paleta de cores institucional
      const COLORS = {
        primary: [124, 62, 237] as [number, number, number],      // #7c3aed - roxo principal
        textDark: [31, 41, 55] as [number, number, number],        // #1f2937 - preto texto
        textGray: [107, 114, 128] as [number, number, number],     // #6b7280 - cinza texto
        borderLight: [229, 231, 235] as [number, number, number],  // #e5e7eb - cinza borda
        bgLight: [250, 250, 250] as [number, number, number],      // #fafafa - fundo claro
        white: [255, 255, 255] as [number, number, number]         // branco
      };
      
      let pageCount = 0;
      const margin = 15;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Função auxiliar: Adicionar rodapé
      const addFooter = (pageNum: number) => {
        const centerX = pageWidth / 2;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(156, 163, 175);
        doc.text('AFIRME EDUCACIONAL', margin, pageHeight - 10);
        doc.text(`Página ${pageNum}`, centerX, pageHeight - 10, { align: 'center' });
        doc.text(new Date().toLocaleString('pt-BR'), pageWidth - margin, pageHeight - 10, { align: 'right' });
      };

      // Função auxiliar: Obter cor para badges de proficiência
      const generateClassificationColor = (label: string): [number, number, number] => {
        const labelLower = label.toLowerCase();
        // Paleta oficial usada no sistema (ex.: `AcertoNiveis.tsx`)
        if (labelLower.includes('avançado')) return [22, 163, 74]; // #16A34A
        if (labelLower.includes('adequado')) return [34, 197, 94]; // #22C55E
        // Atenção: "abaixo do básico" contém "básico" - checar "abaixo" antes do "básico"
        if (labelLower.includes('abaixo')) return [239, 68, 68]; // #EF4444
        if (labelLower.includes('básico')) return [250, 204, 21]; // #FACC15
        return [156, 163, 175]; // Cinza padrão
      };

      // Função para adicionar capa inicial
      const addInitialCover = () => {
        // Fundo branco limpo (independente do letterhead)
        doc.setFillColor(...COLORS.white);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');

        const centerX = pageWidth / 2;
        const BAND_H = 58;

        // Faixa superior roxa
        doc.setFillColor(...COLORS.primary);
        doc.rect(0, 0, pageWidth, BAND_H, 'F');

        // Logo na faixa (LOGO-1.png) - centralizada
        let logoBottomInBand = 0;
        if (logoDataUrl && logoWidth > 0 && logoHeight > 0) {
          const desiredLogoWidth = 38;
          const desiredLogoHeight = (logoHeight * desiredLogoWidth) / logoWidth;
          doc.addImage(
            logoDataUrl,
            'PNG',
            centerX - desiredLogoWidth / 2,
            7,
            desiredLogoWidth,
            desiredLogoHeight
          );
          logoBottomInBand = 7 + desiredLogoHeight;
        } else {
          doc.setFontSize(18);
          doc.setTextColor(...COLORS.white);
          doc.setFont('helvetica', 'bold');
          doc.text('AFIRME PLAY', centerX, 22, { align: 'center' });
          logoBottomInBand = 28;
        }

        // Determinar o tipo de relatório baseado nos dados da API
        const reportType = apiData.estatisticas_gerais?.tipo || (isMunicipalView ? 'municipio' : 'escola');
        const serieFromApi = apiData.estatisticas_gerais?.serie;
        const escolaFromApi = apiData.estatisticas_gerais?.escola;

        let mainTitle = 'RELATÓRIO ESCOLAR';
        if (reportType === 'municipio' || isMunicipalView) {
          mainTitle = 'RELATÓRIO MUNICIPAL';
        } else if (reportType === 'turma') {
          mainTitle = 'RELATÓRIO POR TURMA';
        } else if (reportType === 'serie') {
          mainTitle = 'RELATÓRIO POR SÉRIE';
        } else if (reportType === 'escola') {
          mainTitle = 'RELATÓRIO POR ESCOLA';
        }

        // Título + subtítulo na faixa
        const titleY = Math.max(logoBottomInBand + 5, BAND_H - 17);
        doc.setTextColor(...COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(17);
        doc.text(mainTitle, centerX, titleY, { align: 'center' });
        doc.setFontSize(11);
        doc.text('RESULTADOS E INDICADORES', centerX, titleY + 8, { align: 'center' });

        let y = BAND_H + 13;

        // Município - Estado
        const municipalityName = apiData.estatisticas_gerais?.municipio || repMunicipality;
        const stateName = apiData.estatisticas_gerais?.estado || (repState !== 'all' ? repState : 'AL');
        doc.setFontSize(14);
        doc.setTextColor(...COLORS.primary);
        doc.setFont('helvetica', 'bold');
        const locationText = `${municipalityName?.toUpperCase() || 'MUNICÍPIO'} - ${String(stateName).toUpperCase()}`;
        doc.text(locationText, centerX, y, { align: 'center' });

        y += 8;

        // Secretaria
        doc.setFontSize(11);
        doc.setTextColor(...COLORS.textGray);
        doc.setFont('helvetica', 'normal');
        doc.text('SECRETARIA MUNICIPAL DE EDUCAÇÃO', centerX, y, { align: 'center' });

        y += 20;

        // Card de informações (padrão Evoluções)
        const cardWidth = pageWidth - 80;
        const cardX = (pageWidth - cardWidth) / 2;
        const ACCENT_W = 4;

        let estimatedCardHeight = 60;
        estimatedCardHeight += 7; // avaliação
        estimatedCardHeight += 7; // município
        estimatedCardHeight += (!isMunicipalView || escolaFromApi) ? 12 : 0;
        estimatedCardHeight += serieFromApi ? 7 : 0;
        const dataAplicacao = apiData.estatisticas_gerais?.data_aplicacao;
        estimatedCardHeight += dataAplicacao ? 7 : 0;
        const cardHeight = Math.max(estimatedCardHeight, 100);

        doc.setFillColor(...COLORS.bgLight);
        doc.rect(cardX, y, cardWidth, cardHeight, 'F');
        doc.setFillColor(...COLORS.primary);
        doc.rect(cardX, y, ACCENT_W, cardHeight, 'F');
        doc.setDrawColor(...COLORS.borderLight);
        doc.setLineWidth(0.4);
        doc.rect(cardX, y, cardWidth, cardHeight, 'S');

        let cardY = y + 12;
        const cardContentCenterX = cardX + ACCENT_W + (cardWidth - ACCENT_W) / 2;
        doc.setFontSize(13);
        doc.setTextColor(...COLORS.primary);
        doc.setFont('helvetica', 'bold');
        doc.text('INFORMAÇÕES DO RELATÓRIO', cardContentCenterX, cardY, { align: 'center' });

        cardY += 6;
        doc.setDrawColor(...COLORS.borderLight);
        doc.setLineWidth(0.3);
        doc.line(cardX + ACCENT_W + 4, cardY, cardX + cardWidth - 4, cardY);
        cardY += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const leftColX = cardX + ACCENT_W + 15;
        const labelWidth = 50;
        const valueMaxWidth = cardWidth - labelWidth - 30;

        // AVALIAÇÃO
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.primary);
        doc.text(reportAnswerSheet ? 'CARTÃO RESPOSTA:' : 'AVALIAÇÃO:', leftColX, cardY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.textDark);
        const avaliacaoText = evaluationTitle || 'N/A';
        const avaliacaoLines = doc.splitTextToSize(avaliacaoText, valueMaxWidth);
        doc.text(avaliacaoLines, leftColX + labelWidth, cardY);
        cardY += Math.max(7, avaliacaoLines.length * 5);

        // MUNICÍPIO
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.primary);
        doc.text('MUNICÍPIO:', leftColX, cardY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.textDark);
        doc.text(municipalityName || 'N/A', leftColX + labelWidth, cardY);
        cardY += 7;

        // ESCOLA
        if (!isMunicipalView || escolaFromApi) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...COLORS.primary);
          doc.text('ESCOLA:', leftColX, cardY);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.textDark);
          const escolaText =
            escolaFromApi ||
            selectedSchoolInfo?.name ||
            apiData.estatisticas_gerais?.escola ||
            'Escola Selecionada';
          const escolaLines = doc.splitTextToSize(String(escolaText).toUpperCase(), valueMaxWidth);
          doc.text(escolaLines, leftColX + labelWidth, cardY);
          cardY += Math.max(7, escolaLines.length * 5);
        }

        // SÉRIE
        if (serieFromApi) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...COLORS.primary);
          doc.text('SÉRIE:', leftColX, cardY);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.textDark);
          doc.text(String(serieFromApi).toUpperCase(), leftColX + labelWidth, cardY);
          cardY += 7;
        }

        // DATA
        if (dataAplicacao) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...COLORS.primary);
          doc.text('DATA:', leftColX, cardY);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.textDark);
          doc.text(new Date(dataAplicacao).toLocaleDateString('pt-BR'), leftColX + labelWidth, cardY);
          cardY += 7;
        }
      };

      // Função auxiliar: Adicionar cabeçalho institucional
      const addHeader = (): number => {
        const centerX = pageWidth / 2;
        const BAND_H = 20;

        // Faixa compacta
        doc.setFillColor(...COLORS.primary);
        doc.rect(0, 0, pageWidth, BAND_H, 'F');

        // Ícone na faixa
        if (icoDataUrl && icoWidth > 0 && icoHeight > 0) {
          const icoH = 14;
          const icoW = (icoWidth * icoH) / icoHeight;
          doc.addImage(icoDataUrl, 'PNG', margin, (BAND_H - icoH) / 2, icoW, icoH);
        } else {
          doc.setFontSize(8);
          doc.setTextColor(...COLORS.white);
          doc.setFont('helvetica', 'bold');
          doc.text('AFIRME PLAY', margin, BAND_H / 2 + 2);
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...COLORS.white);
        doc.text('RELATÓRIO ESCOLAR', pageWidth - margin, BAND_H / 2 + 2, { align: 'right' });

        let y = BAND_H + 8;

        // Prefeitura
        const municipalityName = apiData.estatisticas_gerais?.municipio || repMunicipality;
        const stateName = apiData.estatisticas_gerais?.estado || (repState !== 'all' ? repState : 'AL');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.textDark);
        doc.text(`PREFEITURA DE ${municipalityName?.toUpperCase() || 'MUNICÍPIO'} - ${stateName}`, centerX, y, {
          align: 'center',
          maxWidth: pageWidth - 2 * margin,
        });
        y += 6;

        // Metadados
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...COLORS.textGray);
        const schoolLabel = isMunicipalView
          ? 'RELATÓRIO MUNICIPAL'
          : (selectedSchoolInfo?.name || apiData.estatisticas_gerais?.escola || 'ESCOLA SELECIONADA').toUpperCase();
        const metaParts = [schoolLabel];
        if (evaluationTitle) metaParts.push(evaluationTitle.toUpperCase());
        doc.text(metaParts.join('  •  '), centerX, y, { align: 'center', maxWidth: pageWidth - 2 * margin });
        y += 6;

        doc.setDrawColor(...COLORS.borderLight);
        doc.setLineWidth(0.3);
        doc.line(margin, y, pageWidth - margin, y);
        y += 5;

        return y;
      };

      // ===== CAPA INICIAL =====
      addInitialCover();
      pageCount++;

      // ===== PÁGINA 1: Cards de resumo + Tabela de desempenho =====
      doc.addPage();
      pageCount++;
      let startY = addHeader();

      // Cards de resumo (grid 2x2)
      if (summaryStats) {
        const cardWidth = (pageWidth - 2 * margin - 5) / 2;
        const cardHeight = 28;
        const gap = 5;

        const cards = [
          { 
            label: 'MÉDIA GERAL LP', 
            value: formatAverage(summaryStats.mediaLP),
            badge: 'LP',
            badgeBg: [237, 233, 254],
            badgeText: [124, 58, 237]
          },
          { 
            label: 'MÉDIA GERAL MAT', 
            value: formatAverage(summaryStats.mediaMAT),
            badge: 'MAT',
            badgeBg: [254, 243, 199],
            badgeText: [217, 119, 6]
          },
          { 
            label: 'MÉDIA GERAL', 
            value: formatAverage(summaryStats.mediaGeral),
            badge: 'Todas',
            badgeBg: [224, 231, 255],
            badgeText: [79, 70, 229]
          },
          { 
            label: 'PROFICIÊNCIA MÉDIA', 
            value: formatProficiency(summaryStats.proficienciaMedia),
            badge: summaryStats.proficiencyLabel || '--',
            badgeBg: summaryStats.proficiencyLabel ? generateClassificationColor(summaryStats.proficiencyLabel) : [229, 231, 235],
            badgeText: [255, 255, 255]
          }
        ];

        cards.forEach((card, index) => {
          const row = Math.floor(index / 2);
          const col = index % 2;
          const x = margin + col * (cardWidth + gap);
          const y = startY + row * (cardHeight + gap);

          // Card background
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(229, 231, 235);
          doc.setLineWidth(0.1);
          doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');

          // Card header
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(107, 114, 128);
          doc.text(card.label, x + 3, y + 5, { maxWidth: cardWidth - 6 });

          // Card value
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(20);
          doc.setTextColor(17, 24, 39);
          doc.text(card.value, x + 3, y + 17);

          // Badge
          const badgeBgColor = Array.isArray(card.badgeBg) ? card.badgeBg : [card.badgeBg];
          const badgeTextColor = Array.isArray(card.badgeText) ? card.badgeText : [card.badgeText];
          
          // Calcular largura do badge baseado no texto
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          const badgeTextWidth = doc.getTextWidth(card.badge);
          const badgeWidth = Math.max(20, badgeTextWidth + 6);
          
          doc.setFillColor(badgeBgColor[0], badgeBgColor[1], badgeBgColor[2]);
          doc.roundedRect(x + 3, y + 20, badgeWidth, 5, 1, 1, 'F');
          doc.setTextColor(badgeTextColor[0], badgeTextColor[1], badgeTextColor[2]);
          doc.text(card.badge, x + 3 + badgeWidth / 2, y + 23.5, { align: 'center' });
        });

        startY += 2 * (cardHeight + gap) + 5;
      }

      // Título da seção
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(124, 58, 237);
      const sectionTitle = `Ranking — desempenho por ${isMunicipalView ? 'escola' : 'turma/série'} (maior média primeiro)`;
      doc.text(sectionTitle, margin, startY, { maxWidth: pageWidth - 2 * margin });
      startY += 8;

      // Tabela de desempenho
      if (classSummaryRowsRanked.length > 0) {
        const tableData: (string | number)[][] = [];
        const hasLpCol = performanceDisciplineColumns.some((c) => c.key === "lp");
        const hasMatCol = performanceDisciplineColumns.some((c) => c.key === "mat");
        
        classSummaryRowsRanked.forEach((row, rankIdx) => {
          // Truncar nomes muito longos
          const turmaName = row.turma.length > 35 ? row.turma.substring(0, 32) + '...' : row.turma;
          const rowValues: (string | number)[] = [rankIdx + 1, turmaName];
          if (hasLpCol) rowValues.push(formatAverage(row.mediaLP));
          if (hasMatCol) rowValues.push(formatAverage(row.mediaMAT));
          rowValues.push(
            formatAverage(row.mediaGeral),
            formatPercentageValue(row.comparecimento),
            formatProficiency(row.proficienciaMedia),
            row.proficiencyLabel || '--'
          );
          tableData.push(rowValues);
        });

        // Adicionar linha total
        if (summaryStats) {
          const totalRow: (string | number)[] = [
            '',
            isMunicipalView ? 'Total Município' : 'Total Escola',
          ];
          if (hasLpCol) totalRow.push(formatAverage(summaryStats.mediaLP));
          if (hasMatCol) totalRow.push(formatAverage(summaryStats.mediaMAT));
          totalRow.push(
            formatAverage(summaryStats.mediaGeral),
            formatPercentageValue(summaryStats.comparecimentoGeral),
            formatProficiency(summaryStats.proficienciaMedia),
            summaryStats.proficiencyLabel || '--'
          );
          tableData.push(totalRow);
        }

        const levelColIndex =
          2 + (hasLpCol ? 1 : 0) + (hasMatCol ? 1 : 0) + 3;
        const nonLevelColsCount = levelColIndex;
        const headColumns = [
          '#',
          isMunicipalView ? 'ESCOLA' : 'TURMA',
          ...(hasLpCol ? ['MÉDIA LP'] : []),
          ...(hasMatCol ? ['MÉDIA MAT'] : []),
          'MÉDIA GERAL',
          'COMPAREC.',
          'PROFIC. MÉDIA',
          'NÍVEL PROFIC.'
        ];

        autoTable(doc, {
          startY: startY,
          head: [headColumns],
          body: tableData,
          theme: 'grid',
          margin: { left: margin, right: margin },
          styles: {
            fontSize: 8,
            cellPadding: 2.5,
            lineColor: [229, 231, 235],
            lineWidth: 0.1,
            valign: 'middle',
            overflow: 'linebreak'
          },
          headStyles: {
            fillColor: [124, 58, 237],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 8
          },
          bodyStyles: { textColor: [55, 65, 81] },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: (() => {
            const styles: Record<number, { halign: 'left' | 'center'; fontStyle?: 'bold'; cellWidth?: number | 'auto'; minCellWidth?: number }> = {
              0: { halign: 'center', fontStyle: 'bold', cellWidth: 10 },
              1: { halign: 'left', fontStyle: 'bold', cellWidth: 'auto', minCellWidth: 32 },
            };
            for (let i = 2; i < levelColIndex; i += 1) {
              styles[i] = { halign: 'center', cellWidth: 19 };
            }
            styles[levelColIndex] = { halign: 'center', cellWidth: 'auto', minCellWidth: 30 };
            return styles;
          })(),
          didDrawCell: (data) => {
            // Colorir última coluna (Nível Proficiência)
            if (data.section === 'body' && data.column.index === levelColIndex) {
              const textValue = (Array.isArray(data.cell.text) ? data.cell.text[0] : data.cell.text || '').toString().trim();
              
              if (textValue !== '--') {
                const [r, g, b] = generateClassificationColor(textValue);
                
                doc.setFillColor(r, g, b);
                doc.roundedRect(data.cell.x + 1.5, data.cell.y + 1.5, data.cell.width - 3, data.cell.height - 3, 2, 2, 'F');
                
                doc.setTextColor(255, 255, 255);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7);
                doc.text(
                  textValue,
                  data.cell.x + data.cell.width / 2,
                  data.cell.y + data.cell.height / 2 + 2,
                  { align: 'center', maxWidth: data.cell.width - 4 }
                );
              }
            }

            // Destacar linha total
            if (data.section === 'body' && data.row.index === tableData.length - 1) {
              if (data.column.index < nonLevelColsCount) {
                data.cell.styles.fillColor = [238, 242, 255];
                data.cell.styles.fontStyle = 'bold';
              }
            }
          }
        });
      }

      addFooter(pageCount);

      // ===== PÁGINA 2: Gráficos de distribuição por classificação =====
      if (distributionCharts.length > 0) {
        doc.addPage();
        pageCount++;
        
        let yPos = addHeader();

        // Título da seção
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(124, 58, 237);
        doc.text('Distribuição Percentual por Nível de Proficiência', margin, yPos, { maxWidth: pageWidth - 2 * margin });
        yPos += 10;

        distributionCharts.forEach((chart, chartIndex) => {
          // Calcular altura necessária para o gráfico
          const numSegments = chart.segments.length;
          const barHeight = 14; // Aumentado de 10 para 14 (barras mais robustas)
          const barGap = 5;
          const chartHeight = 18 + (numSegments * (barHeight + barGap)) + 12;
          
          // Verificar se precisa de nova página
          if (yPos + chartHeight + 10 > pageHeight - 20) {
            addFooter(pageCount);
            doc.addPage();
            pageCount++;
            yPos = addHeader() + 10;
          }

          // Card do gráfico com sombra mais profissional
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(229, 231, 235);
          doc.setLineWidth(0.2);
          doc.roundedRect(margin, yPos, pageWidth - 2 * margin, chartHeight, 3, 3, 'FD');

          // Título do gráfico
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(17, 24, 39);
          doc.text(chart.title, pageWidth / 2, yPos + 9, { align: 'center', maxWidth: pageWidth - 2 * margin - 10 });

          let barY = yPos + 18;
          const maxValue = Math.max(...chart.segments.map(s => s.value), 1);

          chart.segments.forEach((segment) => {
            const labelWidth = 48;
            const barStartX = margin + 10 + labelWidth;
            const barMaxWidth = pageWidth - 2 * margin - labelWidth - 42;
            const barWidth = (segment.value / maxValue) * barMaxWidth;

            // Label
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(55, 65, 81);
            const labelText = segment.label.length > 18 ? segment.label.substring(0, 16) + '...' : segment.label;
            doc.text(labelText, margin + 10, barY + 9);

            // Extrair cor RGB
            const hexColor = segment.color;
            const r = parseInt(hexColor.slice(1, 3), 16);
            const g = parseInt(hexColor.slice(3, 5), 16);
            const b = parseInt(hexColor.slice(5, 7), 16);

            // Barra com estilo mais profissional
            if (segment.value > 0) {
              // Sombra sutil da barra
              doc.setFillColor(r * 0.8, g * 0.8, b * 0.8);
              doc.rect(barStartX + 0.5, barY + 0.5, Math.max(barWidth, 3), barHeight, 'F');
              
              // Barra principal com bordas retas (mais profissional)
              doc.setFillColor(r, g, b);
              doc.rect(barStartX, barY, Math.max(barWidth, 3), barHeight, 'F');

              // Borda da barra
              doc.setDrawColor(r * 0.7, g * 0.7, b * 0.7);
              doc.setLineWidth(0.3);
              doc.rect(barStartX, barY, Math.max(barWidth, 3), barHeight);

              // Valor dentro da barra (se houver espaço)
              if (barWidth > 25) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(255, 255, 255);
                doc.text(segment.value.toString(), barStartX + barWidth - 5, barY + 9, { align: 'right' });
              }
            } else {
              // Barra vazia (apenas contorno)
              doc.setDrawColor(200, 200, 200);
              doc.setLineWidth(0.5);
              doc.rect(barStartX, barY, 3, barHeight);
            }

            // Quantidade e Percentual fora da barra
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(55, 65, 81);
            const valueText = segment.value > 0 && barWidth <= 25 ? `${segment.value} ` : '';
            doc.text(`${valueText}(${segment.percentage.toFixed(1)}%)`, barStartX + barMaxWidth + 5, barY + 9);

            barY += barHeight + barGap;
          });

          // Total com destaque
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(107, 114, 128);
          doc.text(`Total: ${chart.total} alunos`, pageWidth / 2, yPos + chartHeight - 5, { align: 'center' });

          yPos += chartHeight + 12;
        });

        // Resumo de totais
        if (summaryStats) {
          if (yPos + 15 > pageHeight - 20) {
            addFooter(pageCount);
            doc.addPage();
            pageCount++;
            yPos = addHeader() + 10;
          }

          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(229, 231, 235);
          doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 12, 2, 2, 'FD');
          
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(107, 114, 128);
          const totalText = `Matrículas: ${summaryStats.totalMatriculados || 0} · Avaliados: ${summaryStats.totalAvaliados || 0} · Comparecimento: ${formatPercentageValue(summaryStats.comparecimentoGeral)}`;
          doc.text(totalText, pageWidth / 2, yPos + 7.5, { align: 'center' });
        }

        addFooter(pageCount);
      }

      // ===== PÁGINAS 3+: Distribuição por níveis de proficiência =====
      if (proficiencyDistributions.length > 0) {
        for (const distribution of proficiencyDistributions) {
          doc.addPage();
          pageCount++;
          
          let yPos = addHeader();

          // Título
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(14);
          doc.setTextColor(17, 24, 39);
          doc.text(distribution.title, pageWidth / 2, yPos, { align: 'center', maxWidth: pageWidth - 2 * margin });
          yPos += 12;

          // Tabela de percentuais
          const tableBody = distribution.rows.map(row => [
            row.label,
            ...row.data.map((v, index) => {
              const quantidade = distribution.bars[index]?.quantidade || 0;
              return `${quantidade}\n${v.toFixed(2)}%`;
            })
          ]);

          const hexColor = distribution.color;
          const r = parseInt(hexColor.slice(1, 3), 16);
          const g = parseInt(hexColor.slice(3, 5), 16);
          const b = parseInt(hexColor.slice(5, 7), 16);

          // Definir largura da primeira coluna (label)
          const labelColumnWidth = 50;
          
          autoTable(doc, {
            startY: yPos,
            head: [['', ...distribution.columns]],
            body: tableBody,
            theme: 'grid',
            margin: { left: margin, right: margin },
            styles: {
              fontSize: 9,
              cellPadding: 2,
              halign: 'center',
              valign: 'middle'
            },
            headStyles: {
              fillColor: [r, g, b],
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              fontSize: 9
            },
            columnStyles: {
              0: { halign: 'left', fontStyle: 'bold', cellWidth: labelColumnWidth }
            },
            bodyStyles: { textColor: [55, 65, 81] },
            alternateRowStyles: { fillColor: [248, 250, 252] }
          });

          const finalY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || yPos) + 10;

          // Gráfico de barras verticais (verificar espaço disponível)
          const requiredSpace = 110; // Espaço necessário para o gráfico
          let chartStartY = finalY;
          
          // Se não há espaço suficiente, criar nova página
          if (finalY + requiredSpace > pageHeight - 20) {
            addFooter(pageCount);
            doc.addPage();
            pageCount++;
            chartStartY = addHeader() + 10;
          }

          const chartHeight = 80;
          const barCount = distribution.bars.length;
          
          // Calcular área disponível para as barras (excluindo a primeira coluna de label)
          const availableWidth = pageWidth - 2 * margin - labelColumnWidth;
          
          // Calcular largura de cada barra para alinhar com as colunas da tabela
          const barWidth = availableWidth / barCount;
          const barPadding = barWidth * 0.15; // 15% de padding em cada lado
          const actualBarWidth = barWidth - (2 * barPadding);
          
          const maxValue = Math.max(...distribution.bars.map(b => b.value), 1);
          
          // Desenhar linha vertical sutil para marcar o início da área de dados (alinhamento visual)
          doc.setDrawColor(229, 231, 235);
          doc.setLineWidth(0.5);
          doc.line(margin + labelColumnWidth, chartStartY - 2, margin + labelColumnWidth, chartStartY + chartHeight + 8);
          
          // Label do eixo Y (à esquerda das barras)
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(107, 114, 128);
          doc.text('Percentual', margin + 2, chartStartY + chartHeight / 2, { angle: 90 });

          distribution.bars.forEach((bar, index) => {
            // Alinhar com as colunas da tabela
            const barX = margin + labelColumnWidth + (index * barWidth) + barPadding;
            const barHeight = (bar.value / maxValue) * chartHeight;
            const barY = chartStartY + chartHeight - barHeight;

            // Quantidade acima da barra
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(107, 114, 128);
            const quantityText = `${bar.quantidade || 0}`;
            doc.text(quantityText, barX + actualBarWidth / 2, Math.max(chartStartY + 5, barY - 2), { align: 'center' });

            // Fundo da barra
            doc.setFillColor(241, 245, 249);
            doc.rect(barX, chartStartY, actualBarWidth, chartHeight, 'F');

            // Barra colorida
            if (barHeight > 0) {
              doc.setFillColor(r, g, b);
              doc.rect(barX, barY, actualBarWidth, Math.max(barHeight, 2), 'F');
            }

            // Label do nível (alinhado com a coluna)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(55, 65, 81);
            doc.text(bar.label, barX + actualBarWidth / 2, chartStartY + chartHeight + 5, { align: 'center' });
          });

          // Lista de alunos por nível (participantes) — padrão similar ao "Mapa de Habilidades".
          const alunosPorNivelPdf = (distribution.alunosPorNivel ?? {}) as Record<
            number,
            Array<{ nome?: string; escola?: string; serie?: string; turma?: string }>
          >;
          const levelsWithStudentsPdf = Object.keys(alunosPorNivelPdf)
            .map((k) => Number(k))
            .filter((n) => Number.isFinite(n) && (alunosPorNivelPdf[n]?.length ?? 0) > 0)
            .sort((a, b) => a - b);

          let yAfterProficiencyContent = chartStartY + chartHeight + 14;

          if (levelsWithStudentsPdf.length > 0) {
            let yList = chartStartY + chartHeight + 14;
            if (yList > pageHeight - 60) {
              addFooter(pageCount);
              doc.addPage();
              pageCount++;
              yList = addHeader() + 6;
            }

            const sectionW = pageWidth - 2 * margin;
            const headerH = 7;
            doc.setFillColor(r, g, b);
            doc.rect(margin, yList, sectionW, headerH, "F");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.setTextColor(255, 255, 255);
            doc.text("Alunos participantes por nível de proficiência", pageWidth / 2, yList + 5, {
              align: "center",
              maxWidth: sectionW - 6,
            });
            yList += headerH + 4;

            for (const nivel of levelsWithStudentsPdf) {
              const list = alunosPorNivelPdf[nivel] ?? [];
              const title = `Nível ${nivel} (${list.length})`;
              doc.setFont("helvetica", "bold");
              doc.setFontSize(9);
              doc.setTextColor(31, 41, 55);
              if (yList > pageHeight - 35) {
                addFooter(pageCount);
                doc.addPage();
                pageCount++;
                yList = addHeader() + 6;
              }
              doc.text(title, margin, yList);
              yList += 3;

              autoTable(doc, {
                startY: yList,
                margin: { left: margin, right: margin },
                head: [["Nome", "Escola", "Série", "Turma", "Classificação"]],
                body:
                  list.length > 0
                    ? list.map((a) => [
                        getNomeExibicaoAluno(a) || String(a.nome ?? "—").trim() || "—",
                        String(a.escola ?? "—").trim() || "—",
                        String(a.serie ?? "—").trim() || "—",
                        String(a.turma ?? "—").trim() || "—",
                        getAlunoClassificacaoLabel(a, apiData),
                      ])
                    : [["—", "—", "—", "—", "—"]],
                theme: "grid",
                styles: {
                  fontSize: 7.5,
                  cellPadding: 2,
                  textColor: [31, 41, 55],
                  overflow: "linebreak",
                  valign: "middle",
                },
                headStyles: { fillColor: [243, 244, 246], textColor: [31, 41, 55], fontStyle: "bold" },
                columnStyles: {
                  0: { cellWidth: sectionW - 104, halign: "left" },
                  1: { cellWidth: 34, halign: "left" },
                  2: { cellWidth: 14, halign: "center" },
                  3: { cellWidth: 18, halign: "center" },
                  4: { cellWidth: 38, halign: "center" },
                },
                didDrawCell: (data) => {
                  if (data.section === "body" && data.column.index === 4) {
                    const rawText = data.cell?.text;
                    const firstText =
                      Array.isArray(rawText)
                        ? (rawText.find((t) => t !== undefined && t !== null && String(t).trim() !== "") ?? "")
                        : (rawText ?? "");
                    const textValue = (firstText === undefined || firstText === null ? "" : String(firstText)).trim();
                    if (!textValue || textValue === "—") return;

                    const [rTag, gTag, bTag] = generateClassificationColor(textValue);
                    const pad = 1.2;
                    const w = (data.cell?.width ?? 0) - pad * 2;
                    const h = (data.cell?.height ?? 0) - pad * 2;
                    if (w <= 1 || h <= 1) return;

                    doc.setFillColor(rTag, gTag, bTag);
                    doc.roundedRect((data.cell?.x ?? 0) + pad, (data.cell?.y ?? 0) + pad, w, h, 2, 2, "F");

                    doc.setTextColor(255, 255, 255);
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(7);
                    doc.text(textValue, (data.cell?.x ?? 0) + (data.cell?.width ?? 0) / 2, (data.cell?.y ?? 0) + (data.cell?.height ?? 0) / 2 + 2, {
                      align: "center",
                      maxWidth: Math.max(1, (data.cell?.width ?? 0) - 4),
                    });
                    doc.setTextColor(31, 41, 55);
                  }
                },
                pageBreak: "auto",
              });

              const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
              yList = (typeof finalY === "number" ? finalY : yList) + 6;
            }
            yAfterProficiencyContent = yList;
          }

          if (
            iaRequestSeq > 0 &&
            analiseEscolarIa?.analise_ia_status === "ready" &&
            analiseEscolarIa.analise_ia &&
            typeof analiseEscolarIa.analise_ia === "object" &&
            !Array.isArray(analiseEscolarIa.analise_ia)
          ) {
            const iaRoot = analiseEscolarIa.analise_ia as Record<string, unknown>;
            const discPayload = getDisciplinaAnaliseFromIaRoot(
              iaRoot,
              distribution.disciplinaNome
            );
            let iaBlocks = buildDisciplineRecordToBlocks(discPayload);
            if (!iaBlocks.length && discPayload) {
              iaBlocks = buildGenericIaFallbackBlocks(discPayload);
            }
            if (iaBlocks.length > 0) {
              let yIa = yAfterProficiencyContent + 6;

              if (yIa > pageHeight - 40) {
                addFooter(pageCount);
                doc.addPage();
                pageCount++;
                yIa = addHeader() + 10;
              }

              const maxWIa = pageWidth - 2 * margin;
              const bumpIaPage = (): number => {
                addFooter(pageCount);
                doc.addPage();
                pageCount++;
                return addHeader() + 10;
              };

              await renderStructuredIaPdfContent(
                {
                  doc,
                  margin,
                  maxW: maxWIa,
                  contentBottom: pageHeight - 20,
                  palette: COLORS,
                  bumpPage: bumpIaPage,
                },
                yIa,
                {
                  sectionTitle: "Análise com IA",
                  showSectionHeading: true,
                  footnote:
                    "Conteúdo gerado automaticamente com base nos dados desta disciplina e nos filtros aplicados.",
                  segments: [
                    {
                      disciplineBand: distribution.disciplinaNome?.trim() || null,
                      blocks: iaBlocks,
                    },
                  ],
                }
              );
            }
          }

          addFooter(pageCount);
        }
      }

      // Salvar PDF
      const evaluationName = evaluationTitle || "relatorio_escolar";
      const scopeLabel = isMunicipalView
        ? `municipio_${repMunicipality !== "all" ? repMunicipality : "todos"}`
        : `escola_${selectedSchoolInfo?.name || apiData.estatisticas_gerais?.escola || repSchool || "selecionada"}`;

      const fileName = `relatorio_escolar_${sanitizeFileName(evaluationName)}_${sanitizeFileName(scopeLabel)}_${new Date()
        .toISOString()
        .split("T")[0]}.pdf`;

      doc.save(fileName);

      toast({
        title: "Relatório gerado com sucesso",
        description: `O PDF "${fileName}" foi criado com sucesso.`
      });

    } catch (error) {
      console.error("Erro ao gerar PDF RelatorioEscolar", error);
      toast({
        title: "Erro ao gerar PDF",
        description: "Não foi possível criar o arquivo. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingReport(false);
    }
  }, [
    apiData,
    classSummaryRowsRanked,
    distributionCharts,
    isMunicipalView,
    proficiencyDistributions,
    selectedSchoolInfo,
    summaryStats,
    toast,
    user?.role,
    userHierarchyContext,
    reportAnswerSheet,
    repState,
    repMunicipality,
    repSchool,
    repGabaritoOrEval,
    asOpcoes.gabaritos,
    performanceDisciplineColumns,
    iaRequestSeq,
    analiseEscolarIa,
  ]);

  // Carregar dados quando todos os filtros estiverem selecionados (avaliação / report_entity_type)
  useEffect(() => {
    if (isAnswerSheetAgregados) return;
    let cancelled = false;
    const loadData = async () => {
      if (allRequiredFiltersSelected) {
        try {
          clearAiPollingTimeout();
          setAiErrorMessage(null);
          setAnaliseEscolarIa(null);
          setIaRequestSeq(0);
          setIsLoadingData(true);

          // Usar getEvaluationsList como em Results.tsx para obter tabela_detalhada com alunos por disciplina
          const filters = {
            estado: selectedState,
            municipio: selectedMunicipality,
            avaliacao: selectedEvaluation !== 'all' ? selectedEvaluation : undefined,
            escola: selectedSchool !== 'all' ? selectedSchool : undefined,
            ...(adminCityIdQuery ? { city_id: adminCityIdQuery } : {}),
            ...(reportEntityTypeParam ? { report_entity_type: reportEntityTypeParam } : {}),
            ...(periodoYmRelatorio ? { periodo: periodoYmRelatorio } : {}),
          };

          const evaluationsResponse = await EvaluationResultsApiService.getEvaluationsList(1, 200, filters);
          if (cancelled) return;

          // Fluxo online do Relatório Escolar usa apenas /evaluation-results/avaliacoes.
          setRelatorioCompleto(null);

          if (evaluationsResponse) {
            // Fallback - Se disciplina está vazia quando escola específica está selecionada, buscar dados do município e filtrar
            if (evaluationsResponse.tabela_detalhada) {
              const tabela = evaluationsResponse.tabela_detalhada;
              const disciplinasComAlunos =
                tabela.disciplinas?.filter((d) => d.alunos && Array.isArray(d.alunos) && d.alunos.length > 0)
                  .length || 0;

              if (disciplinasComAlunos === 0 && selectedSchool !== 'all' && filters.escola) {
                try {
                  const municipioFilters = {
                    estado: filters.estado,
                    municipio: filters.municipio,
                    avaliacao: filters.avaliacao,
                    escola: undefined,
                    ...(adminCityIdQuery ? { city_id: adminCityIdQuery } : {}),
                    ...(reportEntityTypeParam ? { report_entity_type: reportEntityTypeParam } : {}),
                    ...(periodoYmRelatorio ? { periodo: periodoYmRelatorio } : {}),
                  };

                  const municipioResponse = await EvaluationResultsApiService.getEvaluationsList(
                    1,
                    200,
                    municipioFilters
                  );

                  if (municipioResponse?.tabela_detalhada?.disciplinas) {
                    const municipioDisciplinasComAlunos =
                      municipioResponse.tabela_detalhada.disciplinas.filter(
                        (d) => d.alunos && Array.isArray(d.alunos) && d.alunos.length > 0
                      ).length;

                    const nomeEscolaSelecionada = evaluationsResponse.estatisticas_gerais?.escola;

                    if (municipioDisciplinasComAlunos > 0 && nomeEscolaSelecionada) {
                      const alunosDaEscola = new Set<string>();

                      if (municipioResponse.tabela_detalhada.geral?.alunos) {
                        municipioResponse.tabela_detalhada.geral.alunos.forEach((aluno) => {
                          const escolaDoAluno = aluno.escola;
                          if (
                            escolaDoAluno &&
                            escolaDoAluno.toLowerCase().includes(nomeEscolaSelecionada.toLowerCase())
                          ) {
                            const rid = alunoRowId(aluno);
                            if (rid) alunosDaEscola.add(rid);
                          }
                        });
                      }

                      if (alunosDaEscola.size === 0) {
                        municipioResponse.tabela_detalhada.disciplinas.forEach((disciplina) => {
                          disciplina.alunos?.forEach((aluno) => {
                            if (
                              aluno.escola &&
                              aluno.escola.toLowerCase().includes(nomeEscolaSelecionada.toLowerCase())
                            ) {
                              const rid = alunoRowId(aluno);
                              if (rid) alunosDaEscola.add(rid);
                            }
                          });
                        });
                      }

                      if (alunosDaEscola.size > 0) {
                        const disciplinasComAlunosFiltrados = municipioResponse.tabela_detalhada.disciplinas.map(
                          (disciplina) => {
                            const alunosFiltrados =
                              disciplina.alunos?.filter((aluno) => alunosDaEscola.has(alunoRowId(aluno))) || [];

                            return {
                              ...disciplina,
                              alunos: alunosFiltrados,
                            };
                          }
                        );

                        const alunosGeralFiltrados =
                          municipioResponse.tabela_detalhada.geral?.alunos?.filter((aluno) =>
                            alunosDaEscola.has(alunoRowId(aluno))
                          ) || [];

                        evaluationsResponse.tabela_detalhada = {
                          ...municipioResponse.tabela_detalhada,
                          disciplinas: disciplinasComAlunosFiltrados,
                          geral: {
                            ...municipioResponse.tabela_detalhada.geral,
                            alunos: alunosGeralFiltrados,
                          },
                        };
                      }
                    }
                  }
                } catch {
                  // fallback silencioso
                }
              }
            }

            setApiData(novaRespostaSemAnaliseIa(evaluationsResponse));
          } else {
            setApiData(null);
            setIaRequestSeq(0);
          }
        } catch {
          if (cancelled) return;
          toast({
            title: "Erro ao carregar dados",
            description: "Não foi possível carregar os dados do relatório. Tente novamente.",
            variant: "destructive",
          });
          setApiData(null);
          setIaRequestSeq(0);
        } finally {
          if (!cancelled) {
            setIsLoadingData(false);
          }
        }
      }
    };

    loadData();
    return () => {
      cancelled = true;
      clearAiPollingTimeout();
    };
  }, [
    isAnswerSheetAgregados,
    allRequiredFiltersSelected,
    selectedState,
    selectedMunicipality,
    selectedSchool,
    selectedEvaluation,
    periodoYmRelatorio,
    adminCityIdQuery,
    reportEntityTypeParam,
    clearAiPollingTimeout,
    toast,
  ]);

  /** Polling da IA apenas em `/evaluation-results/avaliacoes/analise-ia`. */
  useEffect(() => {
    if (isAnswerSheetAgregados || !allRequiredFiltersSelected || apiData === null) {
      return;
    }
    if (iaRequestSeq === 0) {
      return;
    }

    let cancelled = false;
    relatorioEscolarIaPollGenRef.current += 1;
    const pollGen = relatorioEscolarIaPollGenRef.current;

    clearAiPollingTimeout();
    startAiVisualLoading();
    setAiErrorMessage(null);

    const iaFilters = {
      estado: selectedState,
      municipio: selectedMunicipality,
      avaliacao: selectedEvaluation !== 'all' ? selectedEvaluation : undefined,
      escola: selectedSchool !== 'all' ? selectedSchool : undefined,
      ...(adminCityIdQuery ? { city_id: adminCityIdQuery } : {}),
      ...(reportEntityTypeParam ? { report_entity_type: reportEntityTypeParam } : {}),
      ...(periodoYmRelatorio ? { periodo: periodoYmRelatorio } : {}),
    };

    const applyIaErrorMessage = (ia: AnaliseIaRouteResponse) => {
      const details = readTrimmedString(ia.details);
      const title = readTrimmedString(ia.error);
      setAiErrorMessage(
        details || title || "Nao foi possivel gerar o relatorio detalhado. Tente novamente."
      );
    };

    const runPoll = async (attempt: number) => {
      if (cancelled || pollGen !== relatorioEscolarIaPollGenRef.current) return;
      const ia = await EvaluationResultsApiService.fetchAvaliacoesAnaliseIa(iaFilters);
      if (cancelled || pollGen !== relatorioEscolarIaPollGenRef.current) return;

      if (!ia) {
        setAnaliseEscolarIa({
          analise_ia_status: "error",
          analise_ia: { error: "Falha ao consultar analise IA", details: "" },
        });
        applyIaErrorMessage({ details: "", error: "" });
        stopAiVisualLoading();
        return;
      }

      const st = ia.analise_ia_status ?? "processing";
      if (st === "processing") {
        setAnaliseEscolarIa({
          analise_ia_status: "processing",
          analise_ia_cache_key: ia.analise_ia_cache_key,
        });
        const delayMs = Math.min(4000, 1000 + attempt * 500);
        clearAiPollingTimeout();
        aiPollingTimeoutRef.current = window.setTimeout(() => {
          void runPoll(attempt + 1);
        }, delayMs);
        return;
      }

      clearAiPollingTimeout();

      if (st === "error") {
        setAnaliseEscolarIa({
          analise_ia_status: "error",
          analise_ia_cache_key: ia.analise_ia_cache_key,
          analise_ia: {
            error: readTrimmedString(ia.error) || "Erro ao gerar análise",
            details: readTrimmedString(ia.details),
          },
        });
        applyIaErrorMessage(ia);
        stopAiVisualLoading();
        return;
      }

      setAnaliseEscolarIa({
        analise_ia_status: "ready",
        analise_ia_cache_key: ia.analise_ia_cache_key,
        analise_ia: ia.analise_ia ?? {},
      });
      setAiErrorMessage(null);
      stopAiVisualLoading();
    };

    void runPoll(0);

    return () => {
      cancelled = true;
      clearAiPollingTimeout();
      clearAiVisualLoadingTimeout();
    };
  }, [
    isAnswerSheetAgregados,
    allRequiredFiltersSelected,
    apiData,
    selectedState,
    selectedMunicipality,
    selectedSchool,
    selectedEvaluation,
    periodoYmRelatorio,
    adminCityIdQuery,
    reportEntityTypeParam,
    iaRequestSeq,
    clearAiPollingTimeout,
    clearAiVisualLoadingTimeout,
    startAiVisualLoading,
    stopAiVisualLoading,
  ]);

  // Cartão resposta: GET /answer-sheets/resultados-agregados
  useEffect(() => {
    if (!isAnswerSheetAgregados) return;
    let cancelled = false;
    const load = async () => {
      if (!allRequiredFiltersSelected) {
        setApiData(null);
        setAiErrorMessage(null);
        setAnaliseEscolarIa(null);
        setIaRequestSeq(0);
        clearAiPollingTimeout();
        return;
      }
      try {
        clearAiPollingTimeout();
        setAiErrorMessage(null);
        setAnaliseEscolarIa(null);
        setIaRequestSeq(0);
        setIsLoadingData(true);
        setRelatorioCompleto(null);
        const params = new URLSearchParams();
        params.set('estado', asEstado);
        params.set('municipio', asMunicipio);
        params.set('gabarito', asGabarito);
        if (asEscola !== 'all') params.set('escola', asEscola);
        if (asSerie !== 'all') params.set('serie', asSerie);
        if (asTurma !== 'all') params.set('turma', asTurma);
        if (periodoYmRelatorio) params.set('periodo', periodoYmRelatorio);

        const res = await api.get<AnswerSheetResultadosAgregadosRaw>(
          `/answer-sheets/resultados-agregados?${params.toString()}`
        );
        if (cancelled) return;

        const mapped = mapAnswerSheetResultadosAgregadosToNovaResposta(res.data, {
          estado: asEstado,
          municipio: asMunicipio,
          gabarito: asGabarito,
          escola: asEscola,
          serie: asSerie,
          turma: asTurma,
        });
        setApiData(novaRespostaSemAnaliseIa(mapped));
      } catch {
        if (cancelled) return;
        toast({
          title: 'Erro ao carregar dados',
          description: 'Não foi possível carregar os resultados agregados do cartão resposta.',
          variant: 'destructive',
        });
        setApiData(null);
        setIaRequestSeq(0);
      } finally {
        if (!cancelled) {
          setIsLoadingData(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearAiPollingTimeout();
    };
  }, [
    isAnswerSheetAgregados,
    allRequiredFiltersSelected,
    asEstado,
    asMunicipio,
    asGabarito,
    asEscola,
    asSerie,
    asTurma,
    periodoYmRelatorio,
    clearAiPollingTimeout,
    toast,
  ]);

  /** Polling da IA em `/answer-sheets/resultados-agregados/analise-ia` (cartão). */
  useEffect(() => {
    if (!isAnswerSheetAgregados || !allRequiredFiltersSelected || apiData === null) {
      return;
    }
    if (iaRequestSeq === 0) {
      return;
    }

    let cancelled = false;
    relatorioEscolarIaPollGenRef.current += 1;
    const pollGen = relatorioEscolarIaPollGenRef.current;

    clearAiPollingTimeout();
    startAiVisualLoading();
    setAiErrorMessage(null);

    const iaParams = new URLSearchParams();
    iaParams.set('estado', asEstado);
    iaParams.set('municipio', asMunicipio);
    iaParams.set('gabarito', asGabarito);
    if (asEscola !== 'all') iaParams.set('escola', asEscola);
    if (asSerie !== 'all') iaParams.set('serie', asSerie);
    if (asTurma !== 'all') iaParams.set('turma', asTurma);
    if (periodoYmRelatorio) iaParams.set('periodo', periodoYmRelatorio);

    const applyAgregadosIaErrorMessage = (ia: AnaliseIaRouteResponse) => {
      const details = readTrimmedString(ia.details);
      const title = readTrimmedString(ia.error);
      setAiErrorMessage(
        details || title || "Nao foi possivel gerar o relatorio detalhado. Tente novamente."
      );
    };

    const axiosConfigCartaoAgregadosIa =
      asMunicipio !== 'all' ? { meta: { cityId: asMunicipio } as { cityId: string } } : {};

    const runPollCartao = async (attempt: number) => {
      if (cancelled || pollGen !== relatorioEscolarIaPollGenRef.current) return;

      let ia: AnaliseIaRouteResponse | null = null;
      try {
        const res = await api.get<AnaliseIaRouteResponse>(
          `/answer-sheets/resultados-agregados/analise-ia?${iaParams.toString()}`,
          axiosConfigCartaoAgregadosIa
        );
        ia = res.data ?? null;
      } catch {
        ia = null;
      }

      if (cancelled || pollGen !== relatorioEscolarIaPollGenRef.current) return;

      if (!ia) {
        setAnaliseEscolarIa({
          analise_ia_status: "error",
          analise_ia: { error: "Falha ao consultar analise IA", details: "" },
        });
        applyAgregadosIaErrorMessage({ details: "", error: "" });
        stopAiVisualLoading();
        return;
      }

      const st = ia.analise_ia_status ?? "processing";
      if (st === "processing") {
        setAnaliseEscolarIa({
          analise_ia_status: "processing",
          analise_ia_cache_key: ia.analise_ia_cache_key,
        });
        const delayMs = Math.min(4000, 1000 + attempt * 500);
        clearAiPollingTimeout();
        aiPollingTimeoutRef.current = window.setTimeout(() => {
          void runPollCartao(attempt + 1);
        }, delayMs);
        return;
      }

      clearAiPollingTimeout();

      if (st === "error") {
        setAnaliseEscolarIa({
          analise_ia_status: "error",
          analise_ia_cache_key: ia.analise_ia_cache_key,
          analise_ia: {
            error: readTrimmedString(ia.error) || "Erro ao gerar análise",
            details: readTrimmedString(ia.details),
          },
        });
        applyAgregadosIaErrorMessage(ia);
        stopAiVisualLoading();
        return;
      }

      setAnaliseEscolarIa({
        analise_ia_status: "ready",
        analise_ia_cache_key: ia.analise_ia_cache_key,
        analise_ia: ia.analise_ia ?? {},
      });
      setAiErrorMessage(null);
      stopAiVisualLoading();
    };

    void runPollCartao(0);

    return () => {
      cancelled = true;
      clearAiPollingTimeout();
      clearAiVisualLoadingTimeout();
    };
  }, [
    isAnswerSheetAgregados,
    allRequiredFiltersSelected,
    apiData,
    asEstado,
    asMunicipio,
    asGabarito,
    asEscola,
    asSerie,
    asTurma,
    periodoYmRelatorio,
    iaRequestSeq,
    clearAiPollingTimeout,
    clearAiVisualLoadingTimeout,
    startAiVisualLoading,
    stopAiVisualLoading,
  ]);

  const formatAnaliseIaKey = useCallback((key: string) => {
    if (IA_ANALISE_SECTION_LABELS[key]) return IA_ANALISE_SECTION_LABELS[key];
    return key
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }, []);

  const renderAnaliseIaValue = useCallback((value: unknown, keyPrefix: string): JSX.Element => {
    if (value == null || value === "") {
      return <span className="text-sm text-muted-foreground">Sem dados.</span>;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return <span className="text-sm text-foreground whitespace-pre-wrap">{String(value)}</span>;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-sm text-muted-foreground">Sem dados.</span>;
      }
      return (
        <ul className="space-y-2">
          {value.map((item, index) => (
            <li key={`${keyPrefix}-${index}`} className="rounded-md border bg-background/70 p-3">
              {renderAnaliseIaValue(item, `${keyPrefix}-${index}`)}
            </li>
          ))}
        </ul>
      );
    }
    if (typeof value === "object") {
      const isPanoramaGeral = normalizeText(keyPrefix).includes("panorama_geral");
      const entries = Object.entries(value as Record<string, unknown>).filter(([k]) => {
        if (IA_ANALISE_HIDDEN_KEYS.has(k)) return false;
        if (isPanoramaGeral && IA_PANORAMA_GERAL_HIDDEN_KEYS.has(k)) return false;
        return true;
      });
      if (!entries.length) {
        return <span className="text-sm text-muted-foreground">Sem dados.</span>;
      }
      return (
        <div className="space-y-2">
          {entries.map(([key, item]) => (
            <div key={`${keyPrefix}-${key}`} className="rounded-md border bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {formatAnaliseIaKey(key)}
              </p>
              {renderAnaliseIaValue(item, `${keyPrefix}-${key}`)}
            </div>
          ))}
        </div>
      );
    }
    return <span className="text-sm text-muted-foreground">Sem dados.</span>;
  }, [formatAnaliseIaKey]);

  const renderReflexaoNiveis = useCallback((value: unknown, keyPrefix: string) => {
    if (!Array.isArray(value) || value.length === 0) return renderAnaliseIaValue(value, keyPrefix);

    type ReflexaoNivelLegacy = {
      nivel_identificado?: string;
      significado_e_impacto?: string;
      analise_habilidades?: Array<{
        habilidade_foco?: string;
        reflexao_pedagogica?: string;
      }>;
    };

    type ReflexaoNivelNovo = {
      nivel?: string;
      descricao_desempenho?: string;
      habilidades_analisadas?: Array<{
        codigo?: string;
        descricao?: string;
        reflexao?: string;
      }>;
    };

    const items = value as Array<ReflexaoNivelLegacy | ReflexaoNivelNovo>;
    return (
      <div className="space-y-3">
        {items.map((item, idx) => {
          const asAny = item as Record<string, unknown>;

          const nivel =
            readTrimmedString(asAny.nivel_identificado) || readTrimmedString(asAny.nivel) || "—";

          const significado =
            readTrimmedString(asAny.significado_e_impacto) || readTrimmedString(asAny.descricao_desempenho);

          const analiseDireta = readTrimmedString(asAny.analise);
          const quantidadeAlunosRaw = asAny.quantidade_alunos;
          const quantidadeAlunos =
            typeof quantidadeAlunosRaw === "number" && Number.isFinite(quantidadeAlunosRaw)
              ? quantidadeAlunosRaw
              : undefined;

          const habilidadesLegacy = Array.isArray(asAny.analise_habilidades) ? asAny.analise_habilidades : null;
          const habilidadesNovo = Array.isArray(asAny.habilidades_analisadas) ? asAny.habilidades_analisadas : null;

          return (
            <div
              key={`${keyPrefix}-${idx}`}
              className="rounded-lg border border-border bg-background/70 p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Nível identificado
                  </p>
                  <p className="text-sm font-semibold text-foreground">{nivel}</p>
                </div>
                {quantidadeAlunos != null ? (
                  <Badge variant="secondary" className="font-semibold">
                    {quantidadeAlunos} {quantidadeAlunos === 1 ? "aluno" : "alunos"}
                  </Badge>
                ) : null}
              </div>

              {significado ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Descrição do desempenho
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{significado}</p>
                </div>
              ) : null}

              {!significado && analiseDireta ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Análise
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{analiseDireta}</p>
                </div>
              ) : null}

              {habilidadesNovo && habilidadesNovo.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Habilidades analisadas
                  </p>
                  <div className="space-y-2">
                    {habilidadesNovo.map((h, hIdx) => {
                      const codigo = readTrimmedString((h as Record<string, unknown>)?.codigo);
                      const descricao = readTrimmedString((h as Record<string, unknown>)?.descricao);
                      const reflexao = readTrimmedString((h as Record<string, unknown>)?.reflexao);
                      return (
                        <div
                          key={`${keyPrefix}-${idx}-hab2-${hIdx}`}
                          className="rounded-md border border-border bg-card p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Código
                            </span>
                            <span className="text-xs font-semibold text-foreground">{codigo || "—"}</span>
                          </div>
                          {descricao ? (
                            <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">{descricao}</p>
                          ) : null}
                          {reflexao ? (
                            <div className="mt-2 pt-2 border-t border-border/60">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Reflexão
                              </p>
                              <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{reflexao}</p>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {(!habilidadesNovo || habilidadesNovo.length === 0) && habilidadesLegacy && habilidadesLegacy.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Análise de habilidades
                  </p>
                  <div className="space-y-2">
                    {habilidadesLegacy.map((h, hIdx) => {
                      const foco = readTrimmedString((h as Record<string, unknown>)?.habilidade_foco);
                      const reflexao = readTrimmedString((h as Record<string, unknown>)?.reflexao_pedagogica);
                      return (
                        <div
                          key={`${keyPrefix}-${idx}-hab-${hIdx}`}
                          className="rounded-md border border-border bg-card p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Habilidade foco
                            </span>
                            <span className="text-xs font-semibold text-foreground">{foco || "—"}</span>
                          </div>
                          {reflexao ? (
                            <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">{reflexao}</p>
                          ) : (
                            <p className="mt-2 text-sm text-muted-foreground">Sem descrição.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }, [renderAnaliseIaValue]);

  const getAnaliseIaPorDisciplina = useCallback(
    (disciplinaNome?: string): unknown => {
      if (!aiAnaliseObject || !disciplinaNome) return null;
      const alvo = normalizeText(disciplinaNome);

      // Novo formato: analises_por_disciplina.{Disciplina}
      const analisesPorDisciplina = (aiAnaliseObject as Record<string, unknown>).analises_por_disciplina;
      if (
        analisesPorDisciplina &&
        typeof analisesPorDisciplina === "object" &&
        !Array.isArray(analisesPorDisciplina)
      ) {
        const entries = Object.entries(analisesPorDisciplina as Record<string, unknown>);
        const found = entries.find(([k]) => {
          const n = normalizeText(k);
          return n.includes(alvo) || alvo.includes(n);
        });
        if (found) return found[1];
      }

      // Formato antigo: por_disciplina.{Disciplina}
      const porDisciplina = (aiAnaliseObject as Record<string, unknown>).por_disciplina;
      if (porDisciplina && typeof porDisciplina === "object" && !Array.isArray(porDisciplina)) {
        const entries = Object.entries(porDisciplina as Record<string, unknown>);
        const found = entries.find(([k]) => {
          const n = normalizeText(k);
          return n.includes(alvo) || alvo.includes(n);
        });
        if (found) return found[1];
      }

      const entries = Object.entries(aiAnaliseObject).filter(([key]) => !IA_ANALISE_HIDDEN_KEYS.has(key));
      const direct = entries.find(([key]) => {
        const n = normalizeText(key);
        return n.includes(alvo) || alvo.includes(n);
      });
      if (direct) return direct[1];

      for (const [, value] of entries) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const obj = value as Record<string, unknown>;
        const disc = readTrimmedString(
          obj.disciplina ??
            obj.componente_curricular ??
            obj.componenteCurricular ??
            obj.subject
        );
        if (!disc) continue;
        const n = normalizeText(disc);
        if (n.includes(alvo) || alvo.includes(n)) return value;
      }

      return null;
    },
    [aiAnaliseObject]
  );

  // Removido: useEffect de getTabelaDetalhada - os dados já vêm de getEvaluationsList em apiData.tabela_detalhada

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
        <span className="ml-2 text-foreground">Carregando...</span>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <Dialog open={studentsModalOpen} onOpenChange={setStudentsModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              <div className="flex flex-wrap items-center gap-2">
                <span>Alunos</span>
                <Badge variant="secondary" className="font-semibold">
                  {studentsModalDisciplina}
                </Badge>
                {studentsModalNivel != null ? (
                  <Badge variant="outline" className="font-semibold">
                    Nível {studentsModalNivel}
                  </Badge>
                ) : null}
              </div>
            </DialogTitle>
          </DialogHeader>

          {(() => {
            const StudentRow = ({
              aluno,
              tone,
            }: {
              aluno: { nome?: string; escola?: string; serie?: string; turma?: string };
              tone?: "default" | "danger";
            }) => {
              const nome = getNomeExibicaoAluno(aluno) || (aluno.nome ?? "").trim() || "—";
              const turma = (aluno.turma ?? "").trim();
              const serie = (aluno.serie ?? "").trim();
              const escola = (aluno.escola ?? "").trim();
              const classificacao = getAlunoClassificacaoLabel(aluno, apiData);
              const showClassificacao = tone !== "danger";
              const toneCls =
                tone === "danger"
                  ? "border-red-200 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/20"
                  : "border-border bg-card";

              const tagClsBase =
                "text-[11px] font-semibold px-2 py-0.5 rounded-md border";
              const tagCls =
                tone === "danger"
                  ? "border-red-200 text-red-700 bg-white/60 dark:border-red-900/40 dark:text-red-300 dark:bg-red-950/20"
                  : "border-border text-muted-foreground bg-background";

              return (
                <div className={cn("rounded-lg border p-3", toneCls)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground whitespace-normal break-words">
                        {nome}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {escola ? (
                          <span className={cn(tagClsBase, tagCls)}>{escola}</span>
                        ) : null}
                        {serie ? (
                          <span className={cn(tagClsBase, tagCls)}>Série {serie}</span>
                        ) : null}
                        {turma ? (
                          <span className={cn(tagClsBase, tagCls)}>Turma {turma}</span>
                        ) : null}
                        {showClassificacao && classificacao ? (
                          <span className={getReportProficiencyTagClass(classificacao)}>{classificacao}</span>
                        ) : null}
                        {!turma && !serie && !escola ? (
                          <span className={cn(tagClsBase, tagCls)}>Sem metadados</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            };

            const SectionHeader = ({
              title,
              subtitle,
              right,
            }: {
              title: string;
              subtitle?: string;
              right?: React.ReactNode;
            }) => (
              <div className="flex items-end justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-foreground">{title}</div>
                  {subtitle ? (
                    <div className="text-xs text-muted-foreground">{subtitle}</div>
                  ) : null}
                </div>
                {right ? <div className="shrink-0">{right}</div> : null}
              </div>
            );

            return (
          <Tabs defaultValue="por-nivel">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="por-nivel">Por nível</TabsTrigger>
              <TabsTrigger value="participantes">Participantes</TabsTrigger>
              <TabsTrigger value="faltosos">Faltosos</TabsTrigger>
            </TabsList>

            <TabsContent value="por-nivel" className="mt-4">
              <ScrollArea className="h-[60vh] pr-4">
                <div className="space-y-4">
                  {(() => {
                    const entries = Object.entries(studentsModalData.porNivel ?? {})
                      .map(([k, v]) => [Number(k), v] as const)
                      .filter(([n, v]) => Number.isFinite(n) && Array.isArray(v) && v.length > 0)
                      .sort(([a], [b]) => a - b);

                    const filtered = studentsModalNivel != null
                      ? entries.filter(([n]) => n === studentsModalNivel)
                      : entries;

                    if (filtered.length === 0) {
                      return (
                        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                          Nenhuma lista por nível disponível.
                        </div>
                      );
                    }

                    return filtered.map(([nivel, alunos], i) => (
                      <div key={`nivel-${nivel}`} className="rounded-xl border border-border bg-card p-4">
                        <SectionHeader
                          title={`Nível ${nivel}`}
                          subtitle="Alunos participantes classificados neste nível"
                          right={
                            <Badge variant="secondary" className="font-semibold">
                              {alunos.length} alunos
                            </Badge>
                          }
                        />
                        <Separator className="my-3" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {alunos
                            .slice()
                            .sort((a, b) => String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR"))
                            .map((a, idx) => (
                              <StudentRow key={`${String(a.id ?? a.aluno_id ?? idx)}-n${nivel}`} aluno={a} />
                            ))}
                        </div>
                        {i < filtered.length - 1 && <div className="h-2" />}
                      </div>
                    ));
                  })()}
                </div>
              </ScrollArea>
            </TabsContent>            

            <TabsContent value="participantes" className="mt-4">
              <ScrollArea className="h-[60vh] pr-4">
                <div className="space-y-3">
                  <SectionHeader
                    title="Participantes"
                    subtitle="Alunos considerados participantes (com respostas/dados válidos)"
                    right={
                      <Badge variant="secondary" className="font-semibold">
                        {studentsModalData.participantes.length}
                      </Badge>
                    }
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(studentsModalData.participantes ?? [])
                      .slice()
                      .sort((a, b) => String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR"))
                      .map((a, idx) => (
                        <StudentRow key={`${String(a.id ?? a.aluno_id ?? idx)}-p`} aluno={a} />
                      ))}
                  </div>
                  {(studentsModalData.participantes ?? []).length === 0 && (
                    <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                      Nenhum aluno participante encontrado.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="faltosos" className="mt-4">
              <ScrollArea className="h-[60vh] pr-4">
                <div className="space-y-3">
                  <SectionHeader
                    title="Faltosos"
                    subtitle="Alunos presentes na base, mas fora do critério de participação"
                    right={
                      <Badge variant="destructive" className="font-semibold">
                        {studentsModalData.faltosos.length}
                      </Badge>
                    }
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(studentsModalData.faltosos ?? [])
                      .slice()
                      .sort((a, b) => String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR"))
                      .map((a, idx) => (
                        <StudentRow key={`${String(a.id ?? a.aluno_id ?? idx)}-f`} aluno={a} tone="danger" />
                      ))}
                  </div>
                  {(studentsModalData.faltosos ?? []).length === 0 && (
                    <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                      Nenhum aluno faltoso encontrado.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
            );
          })()}
        </DialogContent>
      </Dialog>

      {!hidePageHeading && (
        <>
          {/* Header — mobile: título/desc alinhados, badge centralizado abaixo */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
                <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 shrink-0" />
                {reportAnswerSheet ? "Relatório Escolar — Cartão resposta" : "Relatório Escolar"}
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                {reportAnswerSheet
                  ? "Relatórios escolares com base em cartões-resposta corrigidos"
                  : "Relatórios escolares detalhados do seu município"}
              </p>
              {user?.role && (
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
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
        </>
      )}

      {/* Filtros */}
      {isAnswerSheetAgregados ? (
        <Card className="overflow-visible">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
            </CardTitle>
            <CardDescription>
              Estado, município e cartão resposta são obrigatórios.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-visible">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4 w-full min-w-0">
              <div className="space-y-2">
                <label className="text-sm font-medium">Estado</label>
                <Select value={asEstado} onValueChange={setAsEstadoAndReset} disabled={isLoadingFilters}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Selecione o estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {(asOpcoes.estados ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {asNorm(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Município</label>
                <Select value={asMunicipio} onValueChange={setAsMunicipioAndReset} disabled={isLoadingFilters || asEstado === 'all'}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Selecione o município" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {(asOpcoes.municipios ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {asNorm(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ResultsPeriodMonthYearPicker
                value={selectedPeriod}
                onChange={(p) => {
                  setSelectedPeriod(p);
                  setApiData(null);
                }}
                disabled={isLoadingFilters || asMunicipio === 'all'}
              />
              <div className="space-y-2">
                <label className="text-sm font-medium">Cartão resposta</label>
                <Select value={asGabarito} onValueChange={setAsGabaritoAndReset} disabled={isLoadingFilters || asMunicipio === 'all'}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Selecione o cartão resposta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {(asOpcoes.gabaritos ?? []).map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {asNorm(g)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Escola</label>
                <Select value={asEscola} onValueChange={setAsEscolaAndReset} disabled={isLoadingFilters || asGabarito === 'all'}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Selecione a escola" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {(asOpcoes.escolas ?? []).map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {asNorm(e)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Série</label>
                <Select value={asSerie} onValueChange={setAsSerieAndReset} disabled={isLoadingFilters || asEscola === 'all'}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Selecione a série" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {(asOpcoes.series ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {asNorm(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Turma</label>
                <Select value={asTurma} onValueChange={setAsTurma} disabled={isLoadingFilters || asSerie === 'all'}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Selecione a turma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {(asOpcoes.turmas ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {asNorm(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <FilterComponentAnalise
          selectedState={selectedState}
          selectedMunicipality={selectedMunicipality}
          selectedSchool={selectedSchool}
          selectedEvaluation={selectedEvaluation}
          onStateChange={handleStateChange}
          onMunicipalityChange={handleMunicipalityChange}
          onSchoolChange={(schoolId) => {
            if (schoolId !== selectedSchool) {
              setApiData(null);
            }
            setSelectedSchool(schoolId);
          }}
          onSchoolSelectDetail={setSelectedSchoolInfo}
          onEvaluationChange={(evaluationId) => {
            if (evaluationId !== selectedEvaluation) {
              setApiData(null);
            }
            setSelectedEvaluation(evaluationId);
          }}
          isLoadingFilters={isLoadingFilters}
          onLoadingChange={setIsLoadingFilters}
          adminCityIdQuery={adminCityIdQuery}
          userRole={user?.role}
          canSelectState={userHierarchyContext?.restrictions.canSelectState}
          canSelectMunicipality={userHierarchyContext?.restrictions.canSelectMunicipality}
          canSelectSchool={userHierarchyContext?.restrictions.canSelectSchool}
          fallbackSchools={fallbackSchools}
          loadSchoolsAfterEvaluation={true}
          reportEntityType={reportEntityTypeParam}
          selectedPeriod={selectedPeriod}
          onPeriodChange={(p) => {
            setSelectedPeriod(p);
            setApiData(null);
          }}
        />
      )}

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
              {isAnswerSheetAgregados ? (
                <>
                  Selecione <strong>Estado</strong>, <strong>Município</strong> e <strong>Cartão resposta</strong>.{" "}
                  <strong>Escola</strong>, <strong>Série</strong> e <strong>Turma</strong> são opcionais para refinar o recorte.
                </>
              ) : (
                <>
                  Para visualizar o relatório escolar, você precisa selecionar: <strong>Estado</strong>, <strong>Município</strong> e{" "}
                  <strong>{reportAnswerSheet ? "Cartão resposta" : "Avaliação"}</strong>. A <strong>Escola</strong> pode ser &quot;Todas&quot; para ver todas as escolas do município.
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
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400 mb-4" />
            <p className="text-muted-foreground">Carregando dados do relatório...</p>
          </CardContent>
        </Card>
      )}

      {/* Dados do Relatório */}
      {allRequiredFiltersSelected && !isLoadingData && apiData && (
        <div className="space-y-6">
          {summaryStats && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
              {disciplineSummaryCards.map((card) => (
                <Card key={card.key} className="shadow-sm border border-border">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between text-sm font-semibold text-purple-600 dark:text-purple-400">
                      <span className="uppercase tracking-wide text-muted-foreground">{card.label}</span>
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="mt-2 text-3xl font-bold text-foreground">
                      {formatAverage(card.value)}
                    </div>
                    <div className="mt-4">
                      <span className="inline-flex rounded-md bg-purple-100 dark:bg-purple-900/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
                        {card.badge}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Card className="shadow-sm border border-border">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between text-sm font-semibold text-purple-600 dark:text-purple-400">
                    <span className="uppercase tracking-wide text-muted-foreground">Média Geral</span>
                    <LineChart className="h-5 w-5" />
                  </div>
                  <div className="mt-2 text-3xl font-bold text-foreground">
                    {formatAverage(summaryStats.mediaGeral)}
                  </div>
                  <div className="mt-4">
                    <span className="inline-flex rounded-md bg-purple-100 dark:bg-purple-900/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
                      Todas
                    </span>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-sm border border-border">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between text-sm font-semibold text-purple-600 dark:text-purple-400">
                    <span className="uppercase tracking-wide text-muted-foreground">Proficiência Média</span>
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div className="mt-2 text-3xl font-bold text-foreground">
                    {formatProficiency(summaryStats.proficienciaMedia)}
                  </div>
                  <div className="mt-4">
                    {summaryStats.proficiencyLabel ? (
                      <span
                        className={cn(
                          'inline-flex rounded-md border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
                          summaryStats.proficiencyLabel === 'Adequado'
                            ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800'
                            : summaryStats.proficiencyColor ??
                              'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800'
                        )}
                      >
                        {summaryStats.proficiencyLabel}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem classificação</span>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-sm border border-border">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between text-sm font-semibold text-purple-600 dark:text-purple-400">
                    <span className="uppercase tracking-wide text-muted-foreground">Série da Avaliação</span>
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div className="mt-2 text-3xl font-bold text-foreground">
                    {serieDaAvaliacao || '-'}
                  </div>
                  <div className="mt-4">
                    <span className="inline-flex rounded-md bg-purple-100 dark:bg-purple-900/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
                      Série
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {proficiencyDistributions.length > 0 && (
            <Card className="shadow-md border border-border">
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    Análise com IA
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Gere uma análise textual para os filtros e o recorte exibidos na página. A consulta pode levar alguns
                    segundos.
                  </p>
                </div>
                <Button
                  type="button"
                  className="shrink-0"
                  disabled={iaRequestSeq > 0 && (aiAnaliseStatus === "processing" || aiVisualLoading)}
                  onClick={() => {
                    clearAiPollingTimeout();
                    setAiErrorMessage(null);
                    setAnaliseEscolarIa(null);
                    setIaRequestSeq((n) => n + 1);
                  }}
                >
                  Gerar análise da IA para os dados mostrados
                </Button>
              </CardContent>
            </Card>
          )}

          {proficiencyDistributions.length > 0 &&
            iaRequestSeq > 0 &&
            (aiAnaliseStatus === "processing" || aiVisualLoading) && (
              <RelatorioEscolarAnalysisLoadingCard />
            )}

          {/* ✅ SEMPRE MOSTRAR: Seção de desempenho e botão de download sempre aparecem quando há apiData */}
          <Card className="mt-6 overflow-hidden shadow-md">
            <CardHeader className="flex flex-col gap-3 border-b border-border md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 space-y-1">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  {isMunicipalView ? 'Ranking por escola' : 'Ranking por turma/série'}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Ordenado por média geral (maior primeiro). Visível conforme seu perfil (SEMED: município;
                  diretor/coordenador: sua escola; professor: suas turmas).
                </p>
              </div>
              <Button
                onClick={handleDownloadReport}
                disabled={isGeneratingReport || !apiData}
                className="flex items-center gap-2"
                variant="outline"
                data-export-hide="true"
                aria-label="Baixar relatório escolar em PDF"
              >
                {isGeneratingReport ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Baixando Relatório...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Baixar Relatório
                  </>
                )}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {classSummaryRowsRanked.length > 0 ? (
                <div className="overflow-hidden">
                  <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr>
                        <th className="bg-[#6C2BD9] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white">
                          #
                        </th>
                        <th className="bg-[#6C2BD9] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white">
                          {isMunicipalView ? 'Escola' : 'Turma'}
                        </th>
                        {performanceDisciplineColumns.map((col) => (
                          <th
                            key={col.key}
                            className="bg-[#6C2BD9] px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white"
                          >
                            {col.label}
                          </th>
                        ))}
                        <th className="bg-[#6C2BD9] px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Média Geral</th>
                        <th className="bg-[#6C2BD9] px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Comparecimento</th>
                        <th className="bg-[#6C2BD9] px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Proficiência Média</th>
                        <th className="bg-[#6C2BD9] px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Nível Proficiência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classSummaryRowsRanked.map((row, index) => (
                        <tr
                          key={`${row.turma}-${row.serie}-${index}`}
                          className={cn(
                            index % 2 === 0 ? 'bg-card' : 'bg-muted/50'
                          )}
                        >
                          <td className="px-4 py-3 text-center text-sm font-semibold text-muted-foreground border-t border-border">
                            {index + 1}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-foreground border-t border-border">
                            {row.turma}
                          </td>
                          {performanceDisciplineColumns.map((col) => (
                            <td
                              key={`${row.turma}-${col.key}`}
                              className="px-4 py-3 text-center text-sm font-semibold text-foreground border-t border-border"
                            >
                              {col.key === 'lp'
                                ? formatAverage(row.mediaLP)
                                : formatAverage(row.mediaMAT)}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-center text-sm font-semibold text-foreground border-t border-border">
                            {formatAverage(row.mediaGeral)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-semibold text-foreground border-t border-border">
                            {formatPercentageValue(row.comparecimento)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-semibold text-foreground border-t border-border">
                            {formatProficiency(row.proficienciaMedia)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm border-t border-border">
                            {row.proficiencyLabel ? (
                              <span
                                className={cn(
                                  'inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
                                  row.proficiencyColor ?? 'bg-muted text-muted-foreground border-border'
                                )}
                              >
                                {row.proficiencyLabel}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">--</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {summaryStats && (
                        <tr className="bg-muted">
                          <td className="px-4 py-3 border-t border-border" />
                          <td className="px-4 py-3 text-sm font-semibold text-foreground border-t border-border">
                            {isMunicipalView ? 'Total Município' : 'Total Escola'}
                          </td>
                          {performanceDisciplineColumns.map((col) => (
                            <td
                              key={`total-${col.key}`}
                              className="px-4 py-3 text-center text-sm font-semibold text-foreground border-t border-border"
                            >
                              {col.key === 'lp'
                                ? formatAverage(summaryStats.mediaLP)
                                : formatAverage(summaryStats.mediaMAT)}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-center text-sm font-semibold text-foreground border-t border-border">
                            {formatAverage(summaryStats.mediaGeral)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-semibold text-foreground border-t border-border">
                            {formatPercentageValue(summaryStats.comparecimentoGeral)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-semibold text-foreground border-t border-border">
                            {formatProficiency(summaryStats.proficienciaMedia)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm border-t border-border">
                            {summaryStats.proficiencyLabel ? (
                              <span
                                className={cn(
                                  'inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
                                  summaryStats.proficiencyColor ?? 'bg-muted text-muted-foreground border-border'
                                )}
                              >
                                {summaryStats.proficiencyLabel}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">--</span>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum dado disponível para os filtros selecionados.
                </div>
              )}
            </CardContent>
          </Card>

          {distributionCharts.length > 0 && (
            <div className="mt-6 space-y-6">
              {distributionCharts.map(chart => {
                const maxPercentage = Math.max(...chart.segments.map(segment => segment.percentage), 0);

                return (
                  <Card key={chart.title} className="shadow-md">
                    <CardContent className="space-y-6 pt-6 overflow-x-auto">
                      <div className="flex items-center justify-between min-w-[320px]">
                        <h3 className="text-base font-semibold uppercase tracking-wide text-foreground">{chart.title}</h3>
                        <span className="text-sm font-semibold text-muted-foreground">Total: {chart.total}</span>
                      </div>
                      <div className="space-y-4 min-w-[320px]">
                        {chart.segments.map(segment => {
                          const width = `${segment.percentage}%`;

                          return (
                            <div key={segment.key} className="flex items-center gap-3">
                              <div className="flex w-32 shrink-0 items-center gap-2 text-sm font-medium text-foreground">
                                <span
                                  className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: segment.color }}
                                ></span>
                                <span className="truncate">{segment.label}</span>
                              </div>
                              <div className="relative flex flex-1 items-center rounded-full bg-muted overflow-hidden min-w-0">
                                <div
                                  className="h-3 rounded-full transition-all"
                                  style={{
                                    width,
                                    backgroundColor: segment.color
                                  }}
                                ></div>
                              </div>
                              <span className="w-10 shrink-0 text-right text-xs font-semibold text-foreground whitespace-nowrap">
                                {segment.value}
                              </span>
                              <span className="w-12 shrink-0 text-right text-xs font-semibold text-foreground whitespace-nowrap">
                                {segment.percentage.toFixed(1)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Gráficos de distribuição de níveis de proficiência */}
          {proficiencyDistributions.length > 0 ? (
            <div className="mt-6 space-y-6">
              {proficiencyDistributions.map(distribution => {
                const maxValue = Math.max(...distribution.bars.map(bar => bar.value), 1);
                const analiseDisciplina = getAnaliseIaPorDisciplina(distribution.disciplinaNome);

                return (
                  <Card key={distribution.title} className="shadow-md">
                    <CardHeader>
                      <CardTitle className="text-base font-semibold uppercase tracking-wide text-foreground">
                        {distribution.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Versão Mobile: Layout compacto sem scroll */}
                      <div className="block md:hidden space-y-4">
                        {/* Tabela compacta mobile - Grid responsivo */}
                        <div className="space-y-3">
                          {distribution.rows.map(row => (
                            <div key={row.label} className="border rounded-lg p-3 bg-muted/20">
                              <div className="font-semibold text-sm mb-2.5 text-foreground pb-2 border-b">{row.label}</div>
                              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                {row.data.map((value, index) => (
                                  <div key={index} className="flex flex-col items-center p-2 bg-background rounded-md border border-border/50">
                                    <span className="text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">
                                      {distribution.columns[index]}
                                    </span>
                                    <span className="text-sm font-bold text-foreground">{value.toFixed(1)}%</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Gráfico de barras mobile - Grid compacto */}
                        <div className="border rounded-lg p-4 bg-muted/20">
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                            {distribution.bars.map((bar, index) => {
                              const heightPercentage = (bar.value / maxValue) * 100;
                              return (
                                <div key={bar.label} className="flex flex-col items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-muted-foreground">
                                    {bar.quantidade || 0} {bar.quantidade === 1 ? 'aluno' : 'alunos'}
                                  </span>
                                  <div className="flex h-28 w-full max-w-[70px] items-end justify-center rounded-t-md bg-muted/50">
                                    <div
                                      className="w-full rounded-t-md transition-all shadow-sm"
                                      style={{
                                        height: `${heightPercentage}%`,
                                        backgroundColor: distribution.color,
                                        minHeight: heightPercentage > 0 ? '3px' : '0'
                                      }}
                                    ></div>
                                  </div>
                                  <span className="text-[10px] font-semibold text-foreground text-center leading-tight">
                                    {bar.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Versão Desktop: Tabela e gráfico alinhados */}
                      <div className="hidden md:block overflow-x-auto">
                        {/* Tabela de percentuais */}
                        <div className="mb-6 min-w-[640px]">
                          <table className="w-full border-collapse text-sm">
                            <colgroup>
                              <col className="w-[150px]" />
                              {distribution.columns.map((_, index) => (
                                <col key={index} className="w-[80px]" />
                              ))}
                            </colgroup>
                            <thead>
                              <tr>
                                <th
                                  className="px-3 py-2 text-left font-semibold text-white"
                                  style={{ backgroundColor: distribution.color }}
                                ></th>
                                {distribution.columns.map(column => (
                                  <th
                                    key={column}
                                    className="px-3 py-2 text-center font-semibold text-white text-sm"
                                    style={{ backgroundColor: distribution.color }}
                                  >
                                    {column}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {distribution.rows.map(row => (
                                <tr key={row.label} className="odd:bg-muted/50">
                                  <td className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap">
                                    {row.label}
                                  </td>
                                  {row.data.map((value, index) => (
                                    <td key={index} className="px-3 py-2 text-center text-muted-foreground text-sm">
                                      {value.toFixed(2)}%
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Gráfico de barras alinhado com a tabela */}
                        <div className="mt-6 min-w-[640px]">
                          <table className="w-full border-collapse">
                            <colgroup>
                              <col className="w-[150px]" />
                              {distribution.columns.map((_, index) => (
                                <col key={index} className="w-[80px]" />
                              ))}
                            </colgroup>
                            <tbody>
                              <tr>
                                <td className="px-3"></td>
                                {distribution.bars.map((bar, index) => {
                                  const heightPercentage = (bar.value / maxValue) * 100;
                                  return (
                                    <td key={bar.label} className="px-3 align-bottom">
                                      <div className="flex flex-col items-center gap-2 w-full">
                                        <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                                          {bar.quantidade || 0} {bar.quantidade === 1 ? 'aluno' : 'alunos'}
                                        </span>
                                        <div
                                          className="flex h-40 w-full max-w-[60px] mx-auto items-end justify-center rounded-t-lg bg-muted cursor-pointer"
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => openStudentsModalForDistribution(distribution, index)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                              e.preventDefault();
                                              openStudentsModalForDistribution(distribution, index);
                                            }
                                          }}
                                          aria-label={`Ver lista de alunos do ${bar.label}`}
                                        >
                                          <div
                                            className="w-full rounded-t-lg transition-all"
                                            style={{
                                              height: `${heightPercentage}%`,
                                              backgroundColor: distribution.color,
                                              minHeight: heightPercentage > 0 ? '2px' : '0'
                                            }}
                                          ></div>
                                        </div>
                                        <span className="text-xs font-semibold text-foreground text-center whitespace-nowrap">
                                          {bar.label}
                                        </span>
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {iaRequestSeq > 0 &&
                      !(aiAnaliseStatus === "processing" || aiVisualLoading) ? (
                      <div className="border-t border-border pt-5 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          Análise IA - {distribution.disciplinaNome ?? "Disciplina"}
                        </p>
                        {aiAnaliseStatus === "error" && !aiVisualLoading && (
                          <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
                            <div className="flex items-start gap-2 text-sm text-destructive">
                              <AlertCircle className="h-4 w-4 mt-0.5" />
                              <div className="space-y-1">
                                <span>
                                  {aiErrorMessage || aiAnaliseErrorTitle || "Nao foi possivel gerar o relatorio detalhado para esta disciplina."}
                                </span>
                                {aiAnaliseErrorDetails && aiAnaliseErrorDetails !== aiErrorMessage && (
                                  <p className="text-xs text-destructive/80">{aiAnaliseErrorDetails}</p>
                                )}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                clearAiPollingTimeout();
                                startAiVisualLoading();
                                setIaRequestSeq((prev) => prev + 1);
                              }}
                            >
                              Tentar novamente
                            </Button>
                          </div>
                        )}
                        {aiAnaliseStatus === "ready" && !aiVisualLoading && analiseDisciplina && (
                          <div className="space-y-2">
                            {renderAnaliseIaValue(
                              analiseDisciplina,
                              `analise-disciplina-${normalizeText(distribution.disciplinaNome ?? "geral")}`
                            )}
                          </div>
                        )}
                        {aiAnaliseStatus === "ready" && !aiVisualLoading && !analiseDisciplina && (
                          <p className="text-sm text-muted-foreground">
                            A IA nao retornou analise especifica para esta disciplina.
                          </p>
                        )}
                      </div>
                      ) : null}

                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : apiData && !apiData.tabela_detalhada ? (
            <Card className="mt-6">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400 mb-4" />
                <p className="text-muted-foreground text-center">
                  Carregando dados de proficiência dos alunos...
                </p>
              </CardContent>
            </Card>
          ) : apiData && apiData.tabela_detalhada && proficiencyDistributions.length === 0 ? (
            <Card className="mt-6">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-8 w-8 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center mb-2 font-semibold">
                  Não foi possível calcular a distribuição de níveis de proficiência.
                </p>
                <p className="text-sm text-muted-foreground text-center mb-4">
                  {(isAnswerSheetAgregados ? asEscola : selectedSchool) !== 'all' 
                    ? "Quando uma escola específica é selecionada, o servidor não está retornando dados individuais de alunos por disciplina. Tente selecionar 'Todas' as escolas para visualizar os dados do município."
                    : apiData.tabela_detalhada.disciplinas?.some(d => d.alunos && d.alunos.length > 0)
                      ? "Os dados de proficiência dos alunos não estão disponíveis para os filtros selecionados."
                      : reportAnswerSheet
                        ? "O servidor não retornou dados de alunos na tabela detalhada. Verifique se há alunos cadastrados para este cartão resposta e filtros."
                        : "O servidor não retornou dados de alunos na tabela detalhada. Verifique se há alunos cadastrados para esta avaliação e filtros."}
                </p>
                {apiData.tabela_detalhada?.disciplinas && (
                  <div className="mt-4 p-4 bg-muted rounded-lg border border-border">
                    <p className="text-xs font-semibold text-foreground mb-2">Informações de Debug:</p>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>• Disciplinas encontradas: {apiData.tabela_detalhada.disciplinas.length}</p>
                      <p>• Disciplinas com alunos: {apiData.tabela_detalhada.disciplinas.filter(d => d.alunos && d.alunos.length > 0).length}</p>
                      {apiData.tabela_detalhada.geral?.alunos && (
                        <p>• Alunos em geral: {apiData.tabela_detalhada.geral.alunos.length}</p>
                      )}
                      {apiData.estatisticas_gerais && (
                        <>
                          <p>• Total de alunos (estatísticas): {apiData.estatisticas_gerais.total_alunos}</p>
                          <p>• Alunos participantes: {apiData.estatisticas_gerais.alunos_participantes}</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

        </div>
      )}
    </div>
  );
}

