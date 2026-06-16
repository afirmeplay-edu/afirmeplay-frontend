import React, { useState, useEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EvaluationInstrumentPicker } from "@/components/filters";
import { useToast } from "@/hooks/use-toast";
import { FileText, Filter, Loader2 } from "lucide-react";
import { useAuth } from "@/context/authContext";
import { EvaluationResultsApiService } from "@/services/evaluation/evaluationResultsApi";
import { getUserHierarchyContext, getRestrictionMessage, validateReportAccess, UserHierarchyContext, cityIdQueryParamForAdmin } from "@/utils/userHierarchy";
import { api } from "@/lib/api";
import type { jsPDF } from "jspdf";
import type { CellHookData, Styles } from "jspdf-autotable";
import { normalizeProficiencyLevelLabel, type ReportProficiencyLabel } from "@/utils/report/reportTagStyles";
import { loadLogoAssetForLandscapePdf, urlToPngAsset } from "@/utils/pdfCityBranding";
import { ResultsPeriodMonthYearPicker } from "@/components/filters";
import { normalizeResultsPeriodYm } from "@/utils/resultsPeriod";
import { formatApplicationDateForPdf } from "@/utils/reports/formatApplicationDateForPdf";
import {
  computePdfBulkTableVerticalLayout,
  computePdfSummaryTableBodyFontPt,
  computePdfProficiencyCompactTypography,
  drawPdfAnswerMarkCell,
  drawPdfQuestionHeaderCell,
  formatPdfSkillCodeForHeader,
  parsePdfAnswerMarkCell,
  PDF_ANSWER_CELL,
  pdfTextColorForBg,
  pdfVerticalCenterBaselinesMm,
} from "@/utils/reports/pdfBulkAnswerCell";
import {
  extractQuestoesNumeros,
  resolveGlobalQuestionNumber,
} from "@/utils/reports/resolveGlobalQuestionNumber";
import { enrichTabelaDetalhadaGeralFromRanking } from "@/utils/evaluation/enrichTabelaDetalhadaGeralFromRanking";

// Types from the original component
type StudentResult = {
  id: string;
  nome: string;
  turma: string;
  nota: number;
  proficiencia: number;
  classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
  acertos: number;
  erros: number;
  questoes_respondidas: number;
  status: 'concluida' | 'pendente';
  serie?: string;
  // Removidos campos específicos de disciplinas (LP/MAT)
  respostas?: Record<string, boolean | null>;
};

type EvaluationInfo = {
  id: string;
  titulo: string;
  disciplina: string;
  disciplinas?: string[];
  serie: string;
  escola: string;
  municipio: string;
  data_aplicacao: string;
  logo_url?: string;
};

type DetailedReport = {
  avaliacao: {
    id: string;
    titulo: string;
    disciplina: string;
    total_questoes: number;
  };
  questoes: Array<{
    id: string;
    numero: number;
    texto: string;
    habilidade: string;
    codigo_habilidade: string;
    tipo: 'multipleChoice' | 'open' | 'trueFalse';
    dificuldade: 'Fácil' | 'Médio' | 'Difícil';
    porcentagem_acertos: number;
    porcentagem_erros: number;
  }>;
  alunos: Array<{
    id: string;
    nome: string;
    turma: string;
    respostas: Array<{
      questao_id: string;
      questao_numero: number;
      resposta_correta: boolean;
      resposta_em_branco: boolean;
      tempo_gasto: number;
    }>;
    total_acertos: number;
    total_erros: number;
    total_em_branco: number;
    nota_final: number;
    proficiencia: number;
    classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
    status: 'concluida' | 'nao_respondida';
  }>;
};

// Tabela detalhada por disciplina (shape compatível com Results.tsx)
type TabelaDetalhadaPorDisciplina = {
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
      id?: string;
      aluno_id?: string;
      nome: string;
      escola: string;
      serie: string;
      turma: string;
      classificacao?: string;
      respostas_por_questao?: Array<{
        questao: number;
        acertou: boolean;
        respondeu: boolean;
        resposta: string;
      }>;
      total_acertos: number;
      total_erros: number;
      total_respondidas: number;
      total_questoes_disciplina: number;
      nivel_proficiencia: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado' | string;
      nota: number;
      proficiencia: number;
    }>;
  }>;
  geral?: {
    alunos: Array<{
      id?: string;
      aluno_id?: string;
      nome: string;
      escola?: string;
      serie?: string;
      turma?: string;
      nota_geral?: number;
      proficiencia_geral?: number;
      classificacao?: string;
      nivel_proficiencia_geral?: string;
      total_acertos_geral?: number;
      total_em_branco_geral?: number;
      total_questoes_geral?: number;
      total_respondidas_geral?: number;
      status_geral?: string;
      [key: string]: unknown;
    }>;
  };
} | null;

/** Linhas da API podem usar `aluno_id` (cartão-resposta) em vez de `id`. */
function alunoRowId(aluno: { id?: string; aluno_id?: string }): string {
  return String(aluno.id ?? aluno.aluno_id ?? "").trim();
}

function getProficiencyLevelRgb(level: ReportProficiencyLabel): [number, number, number] {
  switch (level) {
    case "Avançado":
      return [21, 128, 61];
    case "Adequado":
      return [74, 222, 128];
    case "Básico":
      return [250, 204, 21];
    case "Abaixo do Básico":
      return [239, 68, 68];
  }
}

/**
 * Tabelas massivas (detalhada por questão / por disciplina) — alta densidade.
 * Não usar na tabela "RELATÓRIO DE DESEMPENHO GERAL" (resumo).
 */
const PDF_TABLE_SCALE = 1.25;
const scalePdfTable = (value: number) => value * PDF_TABLE_SCALE;
const PDF_DETAIL_TABLE_EXTRA_SCALE = 1.25;
const scaleDetailTableExtra = (value: number) => value * PDF_DETAIL_TABLE_EXTRA_SCALE;
const PDF_COMPACT_TABLE_SCALE = 0.5;
const scaleCompactTable = (value: number) => value * PDF_COMPACT_TABLE_SCALE;
const PDF_BULK_DENSITY = 0.62 * PDF_TABLE_SCALE;

const PDF_BULK_LANDSCAPE_FONT = (numCols: number) =>
  Math.max(0.9, Math.min(2.45, 2.35 * (18 / Math.max(1, numCols)) * PDF_BULK_DENSITY));

const PDF_BULK_LANDSCAPE_CELL_PAD_H = (numCols: number) =>
  Math.max(0.014, Math.min(0.065, 0.07 * (18 / Math.max(1, numCols)) * PDF_BULK_DENSITY));

const PDF_BULK_LANDSCAPE_CELL_PAD_V = (numCols: number) =>
  Math.max(0.004, Math.min(0.018, 0.022 * (18 / Math.max(1, numCols)) * PDF_BULK_DENSITY));

const PDF_BULK_HEAD_CELL_PAD: { vertical: number; horizontal: number } = {
  vertical: 0.038 * PDF_BULK_DENSITY,
  horizontal: 0.095 * PDF_BULK_DENSITY,
};

type DrawProficiencyNivelPdfOpts = {
  compact?: boolean;
  chipMaxHeightMm?: number;
};

function drawProficiencyNivelInPdfCell(
  d: jsPDF,
  cell: { x: number; y: number; width: number; height: number },
  rawLabel: string,
  fontSize: number,
  opts: DrawProficiencyNivelPdfOpts = {}
): void {
  const compact = opts.compact ?? false;
  const chipMax = opts.chipMaxHeightMm;

  const label = normalizeProficiencyLevelLabel(
    rawLabel === "—" || rawLabel === "-" ? "" : rawLabel
  );
  const [r, g, b] = getProficiencyLevelRgb(label);

  let fillY = cell.y;
  let fillH = cell.height;
  if (chipMax != null && chipMax > 0 && Number.isFinite(chipMax)) {
    const m = scalePdfTable(0.1);
    fillH = Math.min(chipMax, Math.max(scalePdfTable(1.05), cell.height - m * 2));
    fillY = cell.y + (cell.height - fillH) / 2;
  }

  d.setFillColor(r, g, b);
  d.rect(cell.x, fillY, cell.width, fillH, "F");
  const [tr, tg, tb] = pdfTextColorForBg(r, g, b);
  d.setTextColor(tr, tg, tb);
  d.setFont("helvetica", "bold");

  let fs: number;
  let pad: number;

  if (compact) {
    const typo = computePdfProficiencyCompactTypography(cell, label);
    fs = typo.fs;
    pad = typo.pad;
  } else {
    fs = Math.max(scalePdfTable(5), label.length > 24 && fontSize > scalePdfTable(6) ? fontSize - scalePdfTable(1.25) : fontSize);
    pad = scalePdfTable(2);
  }

  d.setFontSize(fs);
  const maxW = Math.max(compact ? 1.5 : scalePdfTable(4), cell.width - pad * 2);
  const lines = d.splitTextToSize(label, maxW);
  const baselines = pdfVerticalCenterBaselinesMm(fillY, fillH, fs, lines.length);
  lines.forEach((line, i) => {
    d.text(line, cell.x + cell.width / 2, baselines[i], { align: "center" });
  });
  d.setDrawColor(200, 200, 200);
  d.setLineWidth(0.05);
  d.rect(cell.x, cell.y, cell.width, cell.height);
}

type AnswerSheetSkillRow = { id?: string; code?: string; description?: string };

/** Preenche `questoes` vazias com a lista de habilidades da avaliação (cartão-resposta). */
function enrichTabelaDetalhadaAnswerSheetSkills(
  tabela: TabelaDetalhadaPorDisciplina | null,
  skills: AnswerSheetSkillRow[] | undefined,
  isAnswerSheet: boolean
): TabelaDetalhadaPorDisciplina | null {
  if (!isAnswerSheet || !tabela?.disciplinas?.length || !skills?.length) return tabela;
  const sorted = [...skills].filter((s) => s?.id).sort((a, b) => {
    const ca = (a.code || a.id || "").toString();
    const cb = (b.code || b.id || "").toString();
    return ca.localeCompare(cb, undefined, { sensitivity: "base" });
  });
  if (sorted.length === 0) return tabela;
  return {
    ...tabela,
    disciplinas: tabela.disciplinas.map((d) => {
      if (Array.isArray(d.questoes) && d.questoes.length > 0) return d;
      return {
        ...d,
        questoes: sorted.map((s, idx) => ({
          numero: idx + 1,
          habilidade: s.description || "",
          codigo_habilidade: s.code || s.id || "",
          question_id: s.id || String(idx + 1),
        })),
      };
    }),
  };
}

const mapDetailedStudentsToResults = (alunos: DetailedReport['alunos'] | undefined): StudentResult[] => {
  if (!alunos) return [];

  return alunos.map((aluno) => {
    const respostasMap: Record<string, boolean | null> = {};
    aluno.respostas?.forEach((resp) => {
      const key = `q${resp.questao_numero}`;
      if (resp.resposta_em_branco) {
        respostasMap[key] = null;
      } else {
        respostasMap[key] = resp.resposta_correta;
      }
    });

    return {
      id: aluno.id,
      nome: aluno.nome,
      turma: aluno.turma,
      nota: aluno.nota_final,
      proficiencia: aluno.proficiencia,
      classificacao: aluno.classificacao,
      acertos: aluno.total_acertos,
      erros: aluno.total_erros,
      questoes_respondidas: aluno.total_acertos + aluno.total_erros + aluno.total_em_branco,
      status: aluno.status === 'concluida' ? 'concluida' : 'pendente',
      respostas: respostasMap
    } as StudentResult;
  });
};

function formatAlunoEscolaTurmaSerie(a: { escola?: string; turma?: string; serie?: string }): string {
  const parts: string[] = [];
  if (a.escola) parts.push(a.escola);
  if (a.turma) parts.push(a.turma);
  if (a.serie) parts.push(a.serie);
  return parts.join(' · ') || '-';
}

function formatOneDecimalStable(value: number): string {
  if (!Number.isFinite(value)) return "0.0";
  return Number(value).toFixed(1);
}

/** Conta chaves q1, q2, … no mapa de respostas (ignora metadados acidentais). */
const perQuestionRespostasCount = (r?: Record<string, boolean | null>): number =>
  r ? Object.keys(r).filter((k) => /^q\d+$/i.test(k)).length : 0;

const mapUnifiedStudents = (tabela: TabelaDetalhadaPorDisciplina): StudentResult[] => {
  const studentsMap = new Map<string, StudentResult>();

  const classifFromRow = (aluno: {
    nivel_proficiencia?: string;
    nivel_proficiencia_geral?: string;
    classificacao?: string;
  }): StudentResult["classificacao"] =>
    normalizeProficiencyLevelLabel(
      aluno.nivel_proficiencia_geral ||
        aluno.nivel_proficiencia ||
        aluno.classificacao ||
        ""
    );

  tabela?.geral?.alunos?.forEach((aluno) => {
    const rowId = alunoRowId(aluno);
    if (!rowId) return;
    const totalQuestoes = aluno.total_questoes_geral ?? aluno.total_respondidas_geral ?? 0;
    const totalRespondidas = aluno.total_respondidas_geral ?? totalQuestoes;
    const totalAcertos = aluno.total_acertos_geral ?? 0;
    const totalEmBranco = aluno.total_em_branco_geral ?? Math.max(0, totalQuestoes - totalRespondidas);
    const totalErros = Math.max(0, totalRespondidas - totalAcertos - totalEmBranco);

    // Determinar status: verificar se participou (respondeu pelo menos uma questão)
    // Não apenas confiar em status_geral, mas também verificar se há respostas
    const statusFromField = (aluno.status_geral ?? "pendente") === "concluida";
    const participou = totalRespondidas > 0 || totalAcertos > 0 || totalErros > 0;
    const statusFinal = statusFromField || participou ? "concluida" : "pendente";

    studentsMap.set(rowId, {
      id: rowId,
      nome: aluno.nome,
      turma: aluno.turma || "",
      nota: Number(aluno.nota_geral ?? 0),
      proficiencia: Number(aluno.proficiencia_geral ?? 0),
      classificacao: classifFromRow(aluno),
      acertos: totalAcertos,
      erros: totalErros,
      questoes_respondidas: totalRespondidas || totalQuestoes,
      status: statusFinal,
      respostas: {},
    });
  });

  const geralIds = new Set(
    (tabela?.geral?.alunos ?? []).map((a) => alunoRowId(a)).filter(Boolean)
  );

  // Offset global por disciplina para numerar questões 1..N em todas as disciplinas (ex.: LP 1-20, MAT 21-40)
  let questionOffset = 0;

  tabela?.disciplinas?.forEach((disciplina) => {
    const numQuestoesDisc = disciplina.questoes?.length ?? 0;
    const questoesNumeros = extractQuestoesNumeros(disciplina.questoes);

    disciplina.alunos?.forEach((aluno) => {
      const rowId = alunoRowId(aluno);
      if (!rowId) return;

      let student = studentsMap.get(rowId);

      const hasAnsweredAny =
        Array.isArray(aluno.respostas_por_questao) &&
        aluno.respostas_por_questao.some((r) => r.respondeu);
      const summarySemQuestoes =
        !hasAnsweredAny &&
        (Number(aluno.nota) > 0 ||
          Number(aluno.proficiencia) > 0 ||
          Boolean(aluno.classificacao));

      if (!student) {
        const totalQuestoesDisciplina =
          aluno.total_questoes_disciplina ?? aluno.respostas_por_questao?.length ?? 0;
        const totalRespondidas = aluno.total_respondidas ?? totalQuestoesDisciplina;
        const totalAcertos = aluno.total_acertos ?? 0;
        const totalEmBranco = Math.max(0, totalQuestoesDisciplina - totalRespondidas);
        const totalErros = aluno.total_erros ?? Math.max(0, totalRespondidas - totalAcertos - totalEmBranco);

        student = {
          id: rowId,
          nome: aluno.nome,
          turma: aluno.turma || "",
          nota: Number(aluno.nota ?? 0),
          proficiencia: Number(aluno.proficiencia ?? 0),
          classificacao: classifFromRow(aluno),
          acertos: totalAcertos,
          erros: totalErros,
          questoes_respondidas: totalRespondidas,
          status: hasAnsweredAny || summarySemQuestoes ? "concluida" : "pendente",
          respostas: {},
        };
        studentsMap.set(rowId, student);
      }

      const respostasMap = student.respostas || (student.respostas = {});

      aluno.respostas_por_questao?.forEach((resp) => {
        const numeroQuestao = Number(resp.questao);
        if (Number.isNaN(numeroQuestao) || numeroQuestao <= 0) return;
        const globalNumero = resolveGlobalQuestionNumber(
          numeroQuestao,
          questionOffset,
          numQuestoesDisc,
          questoesNumeros
        );
        const key = `q${globalNumero}`;

        if (!resp.respondeu) {
          if (!(key in respostasMap)) {
            respostasMap[key] = null;
          }
        } else {
          respostasMap[key] = Boolean(resp.acertou);
        }
      });

      if (!geralIds.has(rowId)) {
        const totalQuestoesDisciplina =
          aluno.total_questoes_disciplina ?? aluno.respostas_por_questao?.length ?? 0;
        const totalRespondidas = aluno.total_respondidas ?? totalQuestoesDisciplina;
        const totalAcertos = aluno.total_acertos ?? 0;
        const totalEmBranco = Math.max(0, totalQuestoesDisciplina - totalRespondidas);
        const totalErros = aluno.total_erros ?? Math.max(0, totalRespondidas - totalAcertos - totalEmBranco);

        student.acertos += totalAcertos;
        student.erros += totalErros;
        student.questoes_respondidas += totalRespondidas || totalQuestoesDisciplina;

        if ((hasAnsweredAny || summarySemQuestoes) && student.status !== "concluida") {
          student.status = "concluida";
        }
      } else {
        // Aluno está em geral.alunos - verificar se participou mesmo que status_geral não indique
        // Isso garante que alunos que participaram sejam marcados corretamente
        if ((hasAnsweredAny || summarySemQuestoes) && student.status !== "concluida") {
          student.status = "concluida";
        }
      }
    });

    questionOffset += numQuestoesDisc;
  });

  const mappedStudents = Array.from(studentsMap.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
  );

  return mappedStudents;
};

/** `opcoes_proximos_filtros` pode trazer escolas/séries/turmas com `nome` ou `name` (igual à rota opcoes-filtros). */
function normalizeOpcoesProximosFiltrosShape(
  raw: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const mapArr = (arr: unknown) => {
    if (!Array.isArray(arr)) return arr;
    return arr.map((item: { id: string; nome?: string; name?: string }) => ({
      ...item,
      nome: item.nome ?? item.name ?? '',
    }));
  };
  return {
    ...raw,
    ...(raw.escolas !== undefined ? { escolas: mapArr(raw.escolas) } : {}),
    ...(raw.series !== undefined ? { series: mapArr(raw.series) } : {}),
    ...(raw.turmas !== undefined ? { turmas: mapArr(raw.turmas) } : {}),
  };
}

export default function AcertoNiveis({ hidePageHeading = false }: { hidePageHeading?: boolean } = {}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSchools, setIsLoadingSchools] = useState(false);
  const [states, setStates] = useState<Array<{ id: string; nome: string }>>([]);
  const [municipalities, setMunicipalities] = useState<Array<{ id: string; nome: string }>>([]);
  const [schools, setSchools] = useState<Array<{ id: string; nome: string }>>([]);
  const [grades, setGrades] = useState<Array<{ id: string; nome: string }>>([]);
  const [classes, setClasses] = useState<Array<{ id: string; nome: string }>>([]);
  const [selectedState, setSelectedState] = useState<string>("");
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>("");
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string>("");
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");
  const [selectedGradeId, setSelectedGradeId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const adminCityIdQuery = useMemo(
    () => cityIdQueryParamForAdmin(user?.role, selectedMunicipality || undefined),
    [user?.role, selectedMunicipality]
  );

  const [selectedPeriod, setSelectedPeriod] = useState<string>("all");
  const periodoYmRelatorio = useMemo(() => {
    if (selectedPeriod === "all") return undefined;
    const n = normalizeResultsPeriodYm(selectedPeriod);
    return n === "all" ? undefined : n;
  }, [selectedPeriod]);

  // Estados para hierarquia do usuário
  const [userHierarchyContext, setUserHierarchyContext] = useState<UserHierarchyContext | null>(null);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(true);

  const [evaluationInfo, setEvaluationInfo] = useState<EvaluationInfo | null>(null);
  const [students, setStudents] = useState<StudentResult[]>([]);
  // Estados para armazenar todos os dados carregados (sem filtros aplicados)
  const [allStudents, setAllStudents] = useState<StudentResult[]>([]);
  const [allTabelaDetalhada, setAllTabelaDetalhada] = useState<TabelaDetalhadaPorDisciplina>(null);
  const [detailedReport, setDetailedReport] = useState<DetailedReport | null>(null);
  const fallbackAnswersCache = React.useRef<Map<string, Map<number, boolean>>>(new Map());
  /** Habilidades da rota `/skills/evaluation/...` para sintetizar colunas em cartão-resposta. */
  const answerSheetSkillsRef = React.useRef<AnswerSheetSkillRow[]>([]);
  // Nova: tabela detalhada por disciplina do backend
  const [tabelaDetalhada, setTabelaDetalhada] = useState<TabelaDetalhadaPorDisciplina>(null);
  // Ref para debounce dos filtros
  const filterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Cache de fetchEvaluationData para evitar requisições idênticas (mesma avaliação + filtros)
  type FetchEvaluationDataResult = {
    students: StudentResult[];
    report: DetailedReport | null;
    tabelaDetalhada: TabelaDetalhadaPorDisciplina | null;
    estatisticas: { [key: string]: unknown } | null;
    opcoesProximosFiltros: { [key: string]: unknown } | null;
  };
  const fetchEvaluationDataCacheRef = useRef<Map<string, FetchEvaluationDataResult>>(new Map());
  const fetchEvaluationDataInFlightRef = useRef<Map<string, Promise<FetchEvaluationDataResult>>>(new Map());

  const acertoPeriodResetRef = useRef(false);
  useEffect(() => {
    if (!acertoPeriodResetRef.current) {
      acertoPeriodResetRef.current = true;
      return;
    }
    setSelectedEvaluationId("");
    setSchools([]);
    setGrades([]);
    setClasses([]);
    setSelectedSchoolId("");
    setSelectedGradeId("");
    setSelectedClassId("");
    setEvaluationInfo(null);
    setStudents([]);
    setAllStudents([]);
    setDetailedReport(null);
    setTabelaDetalhada(null);
    setAllTabelaDetalhada(null);
    fetchEvaluationDataCacheRef.current.clear();
    fetchEvaluationDataInFlightRef.current.clear();
  }, [selectedPeriod]);

  // Estado para estatísticas gerais (similar ao apiData em Results.tsx)
  type EstatisticasGeraisState = {
    serie?: string;
    escola?: string;
    municipio?: string;
    total_alunos?: number;
    alunos_participantes?: number;
    alunos_ausentes?: number;
    media_nota_geral?: number;
    media_proficiencia_geral?: number;
    percentual_comparecimento?: number;
    participantes_distribuicao?: number;
    distribuicao_classificacao_geral?: {
      abaixo_do_basico?: number;
      basico?: number;
      adequado?: number;
      avancado?: number;
    };
    alunos_pendentes_detalhe?: Array<{
      nome?: string;
      escola?: string;
      serie?: string;
      turma?: string;
    }>;
    [key: string]: unknown;
  };

  const [estatisticasGerais, setEstatisticasGerais] = useState<EstatisticasGeraisState | null>(null);
  // Estado para opcoes_proximos_filtros (para obter série correta do endpoint)
  const [opcoesProximosFiltros, setOpcoesProximosFiltros] = useState<{
    series?: Array<{ id: string; name: string }>;
    [key: string]: unknown;
  } | null>(null);

  // Total de questões a partir da tabela (soma de todas as disciplinas: ex. 20 LP + 20 MAT = 40)
  const totalQuestoesFromTabela = React.useMemo(() => {
    const t = allTabelaDetalhada || tabelaDetalhada;
    if (!t?.disciplinas?.length) return 0;
    return t.disciplinas.reduce((acc, d) => acc + (d.questoes?.length ?? 0), 0);
  }, [allTabelaDetalhada, tabelaDetalhada]);

  const isPlaceholderCodigoHabilidade = (value?: string) => {
    const raw = (value || '').trim();
    if (!raw) return true;
    if (/^n\/a$/i.test(raw)) return true;
    if (raw === '—' || raw === '-' || raw === '?') return true;
    return false;
  };

  const getStateFilterValue = React.useCallback(() => {
    if (!selectedState) return undefined;
    const stateObj = states.find((state) => state.id === selectedState);
    return stateObj?.nome || selectedState;
  }, [selectedState, states]);

  const buildUnifiedFilters = React.useCallback((
    evaluationId: string,
    overrides: { schoolId?: string; gradeId?: string; classId?: string } = {}
  ) => {
    const filters: {
      estado?: string;
      municipio?: string;
      avaliacao?: string;
      escola?: string;
      serie?: string;
      turma?: string;
      city_id?: string;
      periodo?: string;
    } = {};

    const estadoValor = getStateFilterValue();
    if (estadoValor) filters.estado = estadoValor;
    if (selectedMunicipality) filters.municipio = selectedMunicipality;
    filters.avaliacao = evaluationId;
    if (overrides.schoolId) filters.escola = overrides.schoolId;
    if (overrides.gradeId) filters.serie = overrides.gradeId;
    if (overrides.classId) filters.turma = overrides.classId;
    if (adminCityIdQuery) filters.city_id = adminCityIdQuery;
    if (periodoYmRelatorio) filters.periodo = periodoYmRelatorio;

    return filters;
  }, [selectedMunicipality, getStateFilterValue, adminCityIdQuery, periodoYmRelatorio]);

  const fetchEvaluationData = React.useCallback(
    async (
      evaluationId: string,
      overrides: { schoolId?: string; gradeId?: string; classId?: string } = {}
    ): Promise<FetchEvaluationDataResult> => {
      const cacheKey = `${evaluationId}|${overrides.schoolId ?? ''}|${overrides.gradeId ?? ''}|${overrides.classId ?? ''}|ev|${adminCityIdQuery ?? ''}|${periodoYmRelatorio ?? ''}`;

      // Reutilizar requisição já em andamento (evita duplicatas)
      const inFlight = fetchEvaluationDataInFlightRef.current.get(cacheKey);
      if (inFlight) return inFlight;

      // Retornar cache se existir (evita nova requisição idêntica)
      const cached = fetchEvaluationDataCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const doFetch = async (): Promise<FetchEvaluationDataResult> => {
        const filters = buildUnifiedFilters(evaluationId, overrides);
        try {
          const unifiedResponse = await EvaluationResultsApiService.getEvaluationsList(1, 1, filters);

          let tabelaDetalhada: TabelaDetalhadaPorDisciplina | null =
            unifiedResponse?.tabela_detalhada &&
              Array.isArray(unifiedResponse.tabela_detalhada.disciplinas)
              ? {
                ...unifiedResponse.tabela_detalhada,
                disciplinas: unifiedResponse.tabela_detalhada.disciplinas.map((disciplina) => ({
                  ...disciplina,
                  alunos: [...(disciplina.alunos || [])].sort((a, b) =>
                    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
                  )
                })),
                geral: unifiedResponse.tabela_detalhada.geral
                  ? {
                    alunos: [...(unifiedResponse.tabela_detalhada.geral.alunos || [])].sort((a, b) =>
                      a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
                    )
                  }
                  : undefined
              }
              : null;

          tabelaDetalhada = enrichTabelaDetalhadaGeralFromRanking(
            tabelaDetalhada,
            unifiedResponse?.ranking as unknown[] | undefined
          );

          tabelaDetalhada = enrichTabelaDetalhadaAnswerSheetSkills(
            tabelaDetalhada,
            undefined,
            false
          );

          const studentsMapped = tabelaDetalhada ? mapUnifiedStudents(tabelaDetalhada) : [];

          const result: FetchEvaluationDataResult = {
            students: studentsMapped,
            report: null,
            tabelaDetalhada,
            estatisticas: unifiedResponse?.estatisticas_gerais
              ? (unifiedResponse.estatisticas_gerais as unknown as { [key: string]: unknown })
              : null,
            opcoesProximosFiltros: normalizeOpcoesProximosFiltrosShape(
              unifiedResponse?.opcoes_proximos_filtros
                ? (unifiedResponse.opcoes_proximos_filtros as Record<string, unknown>)
                : null
            )
          };
          fetchEvaluationDataCacheRef.current.set(cacheKey, result);
          return result;
        } catch (error) {
          return {
            students: [],
            report: null,
            tabelaDetalhada: null,
            estatisticas: null,
            opcoesProximosFiltros: null
          };
        } finally {
          fetchEvaluationDataInFlightRef.current.delete(cacheKey);
        }
      };

      const promise = doFetch();
      fetchEvaluationDataInFlightRef.current.set(cacheKey, promise);
      return promise;
    },
    [buildUnifiedFilters, adminCityIdQuery, periodoYmRelatorio]
  );

  const applyFetchResult = React.useCallback((
    result: FetchEvaluationDataResult,
    options?: { updateBaseCache?: boolean }
  ) => {
    const {
      students: fetchedStudents,
      report,
      tabelaDetalhada: tabela,
      estatisticas,
      opcoesProximosFiltros: opcoes,
    } = result;

    if (options?.updateBaseCache) {
      setAllStudents(fetchedStudents);
      setAllTabelaDetalhada(tabela || null);
    }

    setStudents(fetchedStudents);
    setDetailedReport(report || null);
    setTabelaDetalhada(tabela || null);
    if (estatisticas) setEstatisticasGerais(estatisticas as EstatisticasGeraisState);
    if (opcoes) {
      setOpcoesProximosFiltros(opcoes as unknown as {
        series?: Array<{ id: string; name: string }>;
        [key: string]: unknown;
      });
    }
  }, []);

  const resumoStats = useMemo(() => {
    const totalAlunos =
      typeof estatisticasGerais?.total_alunos === 'number'
        ? estatisticasGerais.total_alunos
        : students.length;
    const participantes =
      typeof estatisticasGerais?.alunos_participantes === 'number'
        ? estatisticasGerais.alunos_participantes
        : students.filter((s) => s.status === 'concluida').length;
    const faltosos =
      typeof estatisticasGerais?.alunos_ausentes === 'number'
        ? estatisticasGerais.alunos_ausentes
        : 0;
    const taxaParticipacao =
      totalAlunos > 0 ? ((participantes / totalAlunos) * 100).toFixed(1) : '0';
    const mediaNota = Number(estatisticasGerais?.media_nota_geral ?? 0);
    const mediaProficiencia = Number(estatisticasGerais?.media_proficiencia_geral ?? 0);

    return { totalAlunos, participantes, faltosos, taxaParticipacao, mediaNota, mediaProficiencia };
  }, [estatisticasGerais, students]);

  const isLoadingResumoStats = isLoading && Boolean(selectedEvaluationId);

  // Filtrar dados no frontend (PDF e fallbacks); estatísticas vêm sempre da API com escopo.
  const filteredStudents = useMemo(() => {
    if (!selectedSchoolId && !selectedGradeId && !selectedClassId) {
      return allStudents;
    }

    if (allStudents.length === 0) {
      return [];
    }

    let filtered = [...allStudents];

    // ✅ OTIMIZAÇÃO: Filtrar por escola e série primeiro (usando tabela detalhada)
    // Isso reduz o dataset antes de aplicar o filtro de turma (mais eficiente)
    if ((selectedSchoolId || selectedGradeId) && allTabelaDetalhada?.disciplinas) {
      const validIds = new Set<string>();

      // Pré-calcular valores de comparação para evitar múltiplos finds
      const selectedSchool = selectedSchoolId ? schools.find(s => s.id === selectedSchoolId) : null;
      const selectedGrade = selectedGradeId ? grades.find(g => g.id === selectedGradeId) : null;
      const escolaNome = selectedSchool?.nome;
      const serieNome = selectedGrade?.nome;

      // Otimização: iterar apenas uma vez sobre todas as disciplinas
      for (const disciplina of allTabelaDetalhada.disciplinas) {
        if (!disciplina.alunos) continue;

        for (const aluno of disciplina.alunos) {
          // Verificar escola
          if (selectedSchoolId) {
            if (escolaNome && aluno.escola !== escolaNome && aluno.escola !== selectedSchoolId) {
              continue; // Pular este aluno
            }
          }

          // Verificar série
          if (selectedGradeId) {
            if (serieNome && aluno.serie !== serieNome && aluno.serie !== selectedGradeId) {
              continue; // Pular este aluno
            }
          }

          const rid = alunoRowId(aluno);
          if (rid) validIds.add(rid);
        }
      }

      filtered = filtered.filter(s => validIds.has(s.id));
    }

    // ✅ OTIMIZAÇÃO: Filtrar por turma depois (filtro simples sobre dataset já reduzido)
    if (selectedClassId) {
      const selectedClass = classes.find(c => c.id === selectedClassId);
      if (selectedClass) {
        filtered = filtered.filter(s => s.turma === selectedClass.nome);
      }
    }

    return filtered;
  }, [allStudents, allTabelaDetalhada, selectedSchoolId, selectedGradeId, selectedClassId, schools, grades, classes]);

  // ✅ OTIMIZAÇÃO: Limpar timeout quando componente for desmontado
  useEffect(() => {
    return () => {
      if (filterTimeoutRef.current) {
        clearTimeout(filterTimeoutRef.current);
      }
    };
  }, []);

  // ✅ MODIFICADO: Usar apenas a proficiência do backend (tabela evaluation_results)
  // Removidas as funções de cálculo de proficiência por disciplina do frontend
  // Agora todas as tabelas usam a mesma proficiência calculada pelo backend

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

          // Carregar estado baseado no município
          const statesResp = await EvaluationResultsApiService.getFilterStates(undefined, adminCityIdQuery, periodoYmRelatorio);
          setStates(statesResp);
          const userState = statesResp.find(
            (s) =>
              s.id === context.municipality!.state ||
              s.nome?.toLowerCase() === context.municipality!.state?.toLowerCase()
          );
          if (userState) {
            setSelectedState(userState.id);

            // Carregar municípios do estado pré-selecionado
            try {
              const mun = await EvaluationResultsApiService.getFilterMunicipalities(userState.id, undefined, adminCityIdQuery, periodoYmRelatorio);
              setMunicipalities(mun);
            } catch (error) {
              // Silenciar
            }
          }
        } else if (context.school && context.school.municipality_id) {
          try {
            const municipalityResponse = await api.get(`/city/${context.school.municipality_id}`);
            const municipalityData = municipalityResponse.data;

            setSelectedMunicipality(municipalityData.id);

            const statesResp = await EvaluationResultsApiService.getFilterStates(undefined, adminCityIdQuery, periodoYmRelatorio);
            setStates(statesResp);
            const userState = statesResp.find(
              (s) =>
                s.id === municipalityData.state ||
                s.nome?.toLowerCase() === municipalityData.state?.toLowerCase()
            );
            if (userState) {
              setSelectedState(userState.id);

              try {
                const mun = await EvaluationResultsApiService.getFilterMunicipalities(userState.id, undefined, adminCityIdQuery, periodoYmRelatorio);
                setMunicipalities(mun);
              } catch (error) {
                // Silenciar
              }
            }
          } catch (error) {
            // Silenciar
          }
        }

        if (context.school) {
          setSelectedSchoolId(context.school.id);
          // Adicionar escola na lista de escolas disponíveis
          setSchools([{
            id: context.school.id,
            nome: context.school.name
          }]);
        } else if (context.municipality && !context.school) {
          try {
            // Buscar escolas do município via API de escolas
            const schoolMeta = context.municipality?.id ? { meta: { cityId: context.municipality.id } } : {};
            const schoolsResponse = await api.get(`/school`, schoolMeta as any);
            const allSchools = Array.isArray(schoolsResponse.data)
              ? schoolsResponse.data
              : (schoolsResponse.data?.data || []);

            // Filtrar escolas do município
            const municipalitySchools = allSchools.filter(
              (school: { city_id?: string }) => school.city_id === context.municipality.id
            );

            // Converter para formato esperado pelo componente
            const schoolsFormatted = municipalitySchools.map((school: { id: string; name?: string; nome?: string }) => ({
              id: school.id,
              nome: school.name || school.nome
            }));

            setSchools(schoolsFormatted);
          } catch (error) {
            // Silenciar
          }
        }

        if (context.classes && context.classes.length > 0) {
          const uniqueSchools = Array.from(
            new Set(context.classes.map(c => ({ id: c.school_id, name: c.school_name })))
          ).map(s => ({ id: s.id, nome: s.name }));

          setSchools(uniqueSchools);

          if (uniqueSchools.length === 1) {
            setSelectedSchoolId(uniqueSchools[0].id);
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
  }, [user?.id, user?.role, toast, adminCityIdQuery, periodoYmRelatorio]);

  useEffect(() => {
    // Carregar lista de estados (apenas se for admin)
    const loadStates = async () => {
      // Pular se já foi carregado no useEffect anterior
      if (states.length > 0) return;

      // Carregar apenas para admin
      if (user?.role !== 'admin' || states.length > 0) return;

      try {
        setIsLoading(true);
        const resp = await EvaluationResultsApiService.getFilterStates(undefined, adminCityIdQuery, periodoYmRelatorio);
        setStates(resp);
      } catch (e) {
        toast({ title: "Erro", description: "Não foi possível carregar estados", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    if (!isLoadingHierarchy) {
      loadStates();
    }
  }, [toast, user?.role, isLoadingHierarchy, states.length, adminCityIdQuery, periodoYmRelatorio]);

  const handleChangeState = async (stateId: string) => {
    // Verificar se usuário pode alterar estado
    if (userHierarchyContext?.restrictions.canSelectState === false) {
      toast({
        title: "Acesso Restrito",
        description: "Você não pode alterar o estado. Este filtro está definido conforme suas permissões.",
        variant: "destructive"
      });
      return;
    }

    setSelectedState(stateId);
    setSelectedMunicipality("");
    setSelectedEvaluationId("");
    setMunicipalities([]);
    setSchools([]);
    setGrades([]);
    setClasses([]);
    setSelectedSchoolId("");
    setSelectedGradeId("");
    setSelectedClassId("");
    setEvaluationInfo(null);
    setStudents([]);
    setDetailedReport(null);
    if (!stateId) return;
    try {
      setIsLoading(true);
      const mun = await EvaluationResultsApiService.getFilterMunicipalities(stateId, undefined, adminCityIdQuery, periodoYmRelatorio);
      setMunicipalities(mun);
    } catch (e) {
      toast({ title: "Erro", description: "Não foi possível carregar municípios", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeMunicipality = async (municipioId: string) => {
    // Verificar se usuário pode alterar município
    if (userHierarchyContext?.restrictions.canSelectMunicipality === false) {
      toast({
        title: "Acesso Restrito",
        description: "Você não pode alterar o município. Este filtro está definido conforme suas permissões.",
        variant: "destructive"
      });
      return;
    }

    setSelectedMunicipality(municipioId);
    setSelectedEvaluationId("");
    setSchools([]);
    setGrades([]);
    setClasses([]);
    setSelectedSchoolId("");
    setSelectedGradeId("");
    setSelectedClassId("");
    setEvaluationInfo(null);
    setStudents([]);
    setDetailedReport(null);
  };

  const handleSelectSchool = async (schoolId: string) => {
    // Verificar se usuário pode alterar escola
    if (userHierarchyContext?.restrictions.canSelectSchool === false) {
      toast({
        title: "Acesso Restrito",
        description: "Você não pode alterar a escola. Este filtro está definido conforme suas permissões.",
        variant: "destructive"
      });
      return;
    }

    // Para diretor/coordenador, validar se pode acessar esta escola
    if (user?.role === 'diretor' || user?.role === 'coordenador') {
      if (userHierarchyContext?.school && userHierarchyContext.school.id !== schoolId && schoolId !== "") {
        toast({
          title: "Acesso Negado",
          description: "Você só pode visualizar dados da sua escola.",
          variant: "destructive"
        });
        return;
      }
    }

    setSelectedSchoolId(schoolId || "");
    setSelectedGradeId("");
    setSelectedClassId("");
    setGrades([]);
    setClasses([]);

    if (!selectedState || !selectedMunicipality || !selectedEvaluationId) return;

    const filterScopeParams = {
      estado: selectedState,
      municipio: selectedMunicipality,
      avaliacao: selectedEvaluationId,
      ...(adminCityIdQuery ? { city_id: adminCityIdQuery } : {}),
      ...(periodoYmRelatorio ? { periodo: periodoYmRelatorio } : {}),
    };

    try {
      setIsLoading(true);

      if (!schoolId || schoolId === "") {
        const dataResult = await fetchEvaluationData(selectedEvaluationId);
        applyFetchResult(dataResult, { updateBaseCache: true });
        return;
      }

      const [series, dataResult] = await Promise.all([
        EvaluationResultsApiService.getFilterGradesByEvaluation({
          ...filterScopeParams,
          escola: schoolId,
        }),
        fetchEvaluationData(selectedEvaluationId, { schoolId }),
      ]);
      setGrades(series);
      applyFetchResult(dataResult);
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar dados da escola", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectGrade = async (gradeId: string) => {
    setSelectedGradeId(gradeId || "");
    setSelectedClassId("");
    setClasses([]);

    if (!selectedState || !selectedMunicipality || !selectedEvaluationId) return;

    const filterScopeParams = {
      estado: selectedState,
      municipio: selectedMunicipality,
      avaliacao: selectedEvaluationId,
      ...(adminCityIdQuery ? { city_id: adminCityIdQuery } : {}),
      ...(periodoYmRelatorio ? { periodo: periodoYmRelatorio } : {}),
    };

    try {
      setIsLoading(true);

      if (!gradeId || gradeId === "") {
        const dataResult = await fetchEvaluationData(
          selectedEvaluationId,
          selectedSchoolId ? { schoolId: selectedSchoolId } : {}
        );
        applyFetchResult(dataResult);
        return;
      }

      if (!selectedSchoolId) return;

      const [turmas, dataResult] = await Promise.all([
        EvaluationResultsApiService.getFilterClassesByEvaluation({
          ...filterScopeParams,
          escola: selectedSchoolId,
          serie: gradeId,
        }),
        fetchEvaluationData(selectedEvaluationId, {
          schoolId: selectedSchoolId,
          gradeId,
        }),
      ]);
      setClasses(turmas);
      applyFetchResult(dataResult);
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar dados da série", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectClass = async (classId: string) => {
    setSelectedClassId(classId || "");

    if (!selectedState || !selectedMunicipality || !selectedEvaluationId || !selectedSchoolId || !selectedGradeId) {
      return;
    }

    const scopeOverrides: { schoolId: string; gradeId: string; classId?: string } = {
      schoolId: selectedSchoolId,
      gradeId: selectedGradeId,
    };
    if (classId) {
      scopeOverrides.classId = classId;
    }

    try {
      setIsLoading(true);
      const dataResult = await fetchEvaluationData(selectedEvaluationId, scopeOverrides);
      applyFetchResult(dataResult);
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar dados da turma", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectEvaluation = async (evaluationId: string) => {
    setSelectedEvaluationId(evaluationId);
    setSelectedSchoolId("");
    setSelectedGradeId("");
    setSelectedClassId("");
    setSchools([]);
    setGrades([]);
    setClasses([]);
    setEstatisticasGerais(null);
    setOpcoesProximosFiltros(null);
    // Limpar cache ao trocar de avaliação para não reutilizar dados de outra avaliação
    fetchEvaluationDataCacheRef.current.clear();
    fetchEvaluationDataInFlightRef.current.clear();

    if (!evaluationId) {
      answerSheetSkillsRef.current = [];
      setIsLoadingSchools(false);
      return;
    }

    // ✅ Indicador de carregamento de escolas - ATIVAR IMEDIATAMENTE com flushSync para renderização síncrona
    flushSync(() => {
      setIsLoadingSchools(true);
    });

    try {
      setIsLoading(true);

      const info = await EvaluationResultsApiService.getEvaluationById(evaluationId, {
        ...(adminCityIdQuery ? { city_id: adminCityIdQuery } : {}),
        ...(periodoYmRelatorio ? { periodo: periodoYmRelatorio } : {}),
        ...(selectedMunicipality ? { metaCityId: selectedMunicipality } : {}),
      });

      if (!info) throw new Error("Avaliação não encontrada");

      answerSheetSkillsRef.current = [];

      // Processar informações da avaliação primeiro
      const evaluationData = info as unknown as Record<string, unknown>;
      // ✅ OTIMIZAÇÃO: Carregar escolas em paralelo com fetchEvaluationData
      const [fetchDataResult, escolasFromApi] = await Promise.all([
        fetchEvaluationData(evaluationId),
        (selectedState && selectedMunicipality && evaluationId)
          ? EvaluationResultsApiService.getFilterSchoolsByEvaluation({
            estado: selectedState,
            municipio: selectedMunicipality,
            avaliacao: evaluationId,
            ...(adminCityIdQuery ? { city_id: adminCityIdQuery } : {}),
            ...(periodoYmRelatorio ? { periodo: periodoYmRelatorio } : {}),
          }).catch(() => [])
          : Promise.resolve([])
      ]);

      const { students: unifiedStudents, estatisticas, opcoesProximosFiltros: opcoes } = fetchDataResult;

      // ✅ OTIMIZAÇÃO: Popular escolas imediatamente - priorizar opcoes, senão usar API
      if (opcoes?.escolas && Array.isArray(opcoes.escolas) && opcoes.escolas.length > 0) {
        const escolasFromOpcoes = opcoes.escolas.map((esc: { id: string; nome?: string; name?: string }) => ({
          id: esc.id,
          nome: esc.nome ?? esc.name ?? ""
        }));
        setSchools(escolasFromOpcoes);
      } else if (Array.isArray(escolasFromApi) && escolasFromApi.length > 0) {
        setSchools(escolasFromApi);
      }

      setIsLoadingSchools(false);
      applyFetchResult(fetchDataResult, { updateBaseCache: true });

      // Priorizar série do endpoint antes de usar extractSerie
      let serieExtraida = 'N/A';

      // 1. Tentar obter série das estatísticas gerais do endpoint
      if (estatisticas?.serie != null && estatisticas.serie !== 'N/A' && String(estatisticas.serie) !== '') {
        serieExtraida = String(estatisticas.serie);
      }
      // 2. Tentar obter série de opcoes_proximos_filtros (se houver apenas uma série)
      else if (opcoes && Array.isArray(opcoes.series) && opcoes.series.length === 1) {
        const s0 = opcoes.series[0] as { nome?: string; name?: string };
        serieExtraida = s0.nome ?? s0.name ?? 'N/A';
      }
      // 3. Se não houver série do endpoint, usar extractSerie como fallback
      else {
        // Função para extrair série de diferentes fontes (NÃO priorizar título)
        const extractSerie = (data: Record<string, unknown>): string => {
          // 1. Tentar campo série direto (prioridade máxima - série específica)
          if (data.serie && data.serie !== 'N/A' && data.serie !== '') {
            const serie = data.serie as string;
            // Se a série contém um número específico (ex: "4º ano"), usar ela
            if (serie.match(/\d+º|\d+º ano|\d+ ano/i)) {
              return serie;
            }
          }

          // 2. Tentar campo grade ou nível (prioridade sobre título)
          if (data.grade && data.grade !== 'N/A' && data.grade !== '') {
            const grade = data.grade as string;
            if (grade.match(/\d+º|\d+º ano|\d+ ano/i)) {
              return grade;
            }
          }
          if (data.nivel && data.nivel !== 'N/A' && data.nivel !== '') {
            const nivel = data.nivel as string;
            if (nivel.match(/\d+º|\d+º ano|\d+ ano/i)) {
              return nivel;
            }
          }

          // 3. Título da avaliação como ÚLTIMO recurso (pode conter números que não correspondem à série real)
          // Exemplo: "4° avalie teotonio" pode ser para 5° ano
          if (data.titulo) {
            const titulo = data.titulo as string;
            const serieMatch = titulo.match(/(\d+º|\d+º ano|\d+ ano)/i);
            if (serieMatch) return serieMatch[1];
          }

          // 4. NÃO usar campo curso como fallback genérico (retorna "1º ao 5º ano" que é muito genérico)
          // Retornar 'N/A' para que seja extraído de outras fontes (alunos, escolas, estatisticas_gerais) depois

          return 'N/A';
        };

        serieExtraida = extractSerie(evaluationData);
      }

      // Tentar extrair série das escolas se não estiver na avaliação
      const escolasAtuais =
        schools.length > 0
          ? schools
          : Array.isArray(opcoes?.escolas)
            ? opcoes.escolas.map((esc: { id: string; nome?: string; name?: string }) => ({
                id: esc.id,
                nome: esc.nome ?? esc.name ?? ""
              }))
            : [];
      if (serieExtraida === 'N/A' && escolasAtuais.length > 0) {
        const escolaComSerie = escolasAtuais.find(esc => esc.nome && (esc.nome.includes('º') || esc.nome.includes('ano')));
        if (escolaComSerie) {
          const serieMatch = escolaComSerie.nome.match(/(\d+º|\d+º ano|\d+ ano)/i);
          if (serieMatch) {
            serieExtraida = serieMatch[1];
          }
        }
      }

      setEvaluationInfo({
        id: info.id,
        titulo: (evaluationData.titulo as string) || 'Avaliação',
        disciplina: (evaluationData.disciplina as string) || 'N/A',
        disciplinas: (evaluationData.disciplinas as string[]) || [(evaluationData.disciplina as string)].filter(Boolean),
        serie: serieExtraida,
        escola: (evaluationData.escola as string) || 'N/A',
        municipio: (evaluationData.municipio as string) || 'N/A',
        data_aplicacao: (evaluationData.data_aplicacao as string) || '',
        logo_url: evaluationData.logo_url as string | undefined
      });

      // Tentar extrair série dos alunos se não estiver na avaliação
      if (serieExtraida === 'N/A' && unifiedStudents.length > 0) {
        const alunosComSerie = unifiedStudents.filter(
          (s) => s.turma && (s.turma.includes('º') || s.turma.includes('ano'))
        );
        if (alunosComSerie.length > 0) {
          const turma = alunosComSerie[0].turma;
          const serieMatch = turma.match(/(\d+º|\d+º ano|\d+ ano)/i);
          if (serieMatch) {
            serieExtraida = serieMatch[1];
          }
        }
      }
    } catch (e) {
      toast({ title: "Erro", description: "Falha ao carregar dados da avaliação", variant: "destructive" });
      setIsLoadingSchools(false); // Garantir que o loading seja resetado em caso de erro
    } finally {
      setIsLoading(false);
      setIsLoadingSchools(false); // Garantir que o loading seja resetado
    }
  };

  const generateClassificationColor = (classification: string): [number, number, number] => {
    switch (classification) {
      case 'Avançado': return [22, 163, 74]; // Verde escuro
      case 'Adequado': return [34, 197, 94]; // Verde claro
      case 'Básico': return [250, 204, 21]; // Amarelo
      case 'Abaixo do Básico': return [239, 68, 68]; // Vermelho
      default: return [156, 163, 175]; // Cinza
    }
  };

  const generateHabilidadeCode = (questao: {
    codigo_habilidade?: string;
    numero?: number;
  }): string => {
    const raw = (questao.codigo_habilidade || '').trim();
    if (!isPlaceholderCodigoHabilidade(raw)) return raw.toUpperCase();
    const numero = questao.numero || 1;
    return `Q${numero}`;
  };

  const handleGeneratePDF = async () => {
    if (!evaluationInfo) {
      toast({
        title: "Atenção",
        description: "Selecione uma avaliação.",
        variant: "destructive",
      });
      return;
    }

    // Professor só pode imprimir quando tiver turma selecionada
    if (user?.role === "professor" && !selectedClassId) {
      toast({
        title: "Turma obrigatória",
        description: "Selecione uma turma para imprimir o relatório.",
        variant: "destructive"
      });
      return;
    }

    // Verificação mais robusta: checar múltiplas fontes de dados
    let hasStudentsInState = students.length > 0;
    const hasStudentsInDetailed = detailedReport?.alunos && detailedReport.alunos.length > 0;
    const hasStudentsInTabela = tabelaDetalhada?.geral?.alunos && tabelaDetalhada.geral.alunos.length > 0;
    const hasStudentsInDisciplinas = tabelaDetalhada?.disciplinas?.some(d => d.alunos && d.alunos.length > 0);

    // Se students estiver vazio mas tabelaDetalhada tiver dados, reconstruir students
    if (!hasStudentsInState && tabelaDetalhada && (hasStudentsInTabela || hasStudentsInDisciplinas)) {
      const reconstructedStudents = mapUnifiedStudents(tabelaDetalhada);
      if (reconstructedStudents.length > 0) {
        setStudents(reconstructedStudents);
        hasStudentsInState = true;
      }
    }

    const hasAnyStudents = hasStudentsInState || hasStudentsInDetailed || hasStudentsInTabela || hasStudentsInDisciplinas;

    if (!hasAnyStudents) {
      toast({
        title: "Atenção",
        description: "Nenhum aluno encontrado para os filtros selecionados. Tente remover alguns filtros.",
        variant: "destructive"
      });
      return;
    }

    // Validar acesso baseado na hierarquia
    if (userHierarchyContext && user?.role) {
      const validation = validateReportAccess(user.role, {
        state: selectedState,
        municipality: selectedMunicipality,
        school: selectedSchoolId,
        grade: selectedGradeId,
        class: selectedClassId
      }, userHierarchyContext);

      if (!validation.isValid) {
        toast({
          title: "Acesso Negado",
          description: validation.reason || "Você não tem permissão para gerar este relatório.",
          variant: "destructive"
        });
        return;
      }
    }

    try {
      setIsLoading(true);

      const pdfScopeOverrides: { schoolId?: string; gradeId?: string; classId?: string } = {};
      if (selectedSchoolId) pdfScopeOverrides.schoolId = selectedSchoolId;
      if (selectedGradeId) pdfScopeOverrides.gradeId = selectedGradeId;
      if (selectedClassId) pdfScopeOverrides.classId = selectedClassId;

      const pdfFetchResult = await fetchEvaluationData(selectedEvaluationId!, pdfScopeOverrides);
      const pdfTabela = pdfFetchResult.tabelaDetalhada;
      const pdfEstatisticas = (pdfFetchResult.estatisticas ?? null) as EstatisticasGeraisState | null;
      let pdfStudents = pdfFetchResult.students;

      if (pdfStudents.length === 0 && pdfTabela) {
        pdfStudents = mapUnifiedStudents(pdfTabela);
      }

      const pdfHasData =
        pdfStudents.length > 0 ||
        Boolean(pdfTabela?.geral?.alunos?.length) ||
        Boolean(pdfTabela?.disciplinas?.some((d) => (d.alunos?.length ?? 0) > 0));

      if (!pdfHasData) {
        toast({
          title: "Atenção",
          description: "Nenhum dado encontrado para o escopo selecionado.",
          variant: "destructive",
        });
        return;
      }

      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;

      const brandingCityId =
        selectedMunicipality && selectedMunicipality !== "all"
          ? selectedMunicipality
          : userHierarchyContext?.school?.municipality_id ??
            userHierarchyContext?.municipality?.id ??
            null;

      let logoDataUrl = '';
      let logoWidth = 0;
      let logoHeight = 0;
      const logoLand = await loadLogoAssetForLandscapePdf(brandingCityId);
      if (logoLand) {
        logoDataUrl = logoLand.dataUrl;
        logoWidth = logoLand.iw;
        logoHeight = logoLand.ih;
      }

      // Ícone usado nos cabeçalhos internos (addHeader e páginas landscape)
      let icoDataUrl = '';
      let icoWidth = 0;
      let icoHeight = 0;
      const icoAsset = await urlToPngAsset('/AFIRME-PLAY-ico.png');
      if (icoAsset) {
        icoDataUrl = icoAsset.dataUrl;
        icoWidth = icoAsset.iw;
        icoHeight = icoAsset.ih;
      }

      // Documento começa em landscape para a capa inicial
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      // Paleta de cores institucional (baseada em institutional_test_hybrid.html)
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
      let pageWidth = doc.internal.pageSize.getWidth();
      let pageHeight = doc.internal.pageSize.getHeight();

      // Utilitário: extrair série a partir do nome da turma
      const extractSerieFromTurma = (turma?: string): string | null => {
        if (!turma) return null;
        const match = turma.match(/(\d+º(?:\s*ano)?)/i);
        return match ? match[1] : null;
      };

      // Utilitário: obter texto de série confiável (recebe lista de alunos como parâmetro)
      const getHeaderSerieText = (alunosRef: StudentResult[] = students): string | null => {
        // 1) Se o usuário selecionou explicitamente uma série, priorizar
        if (selectedGradeId) {
          const g = grades.find((gr) => gr.id === selectedGradeId)?.nome;
          if (g) return g;
        }
        const fromAlunoSerie = new Set<string>();
        alunosRef.forEach((s) => {
          const t = (s.serie || "").trim();
          if (t) fromAlunoSerie.add(t);
        });
        if (fromAlunoSerie.size === 1) return Array.from(fromAlunoSerie)[0];
        const inferred = new Set<string>();
        alunosRef.forEach((s) => {
          const ser = extractSerieFromTurma(s.turma);
          if (ser) inferred.add(ser);
        });
        if (inferred.size === 1) return Array.from(inferred)[0];
        const eg = (evaluationInfo?.serie || "").trim();
        if (eg && eg !== "N/A") return eg;
        return null;
      };

      const resolveSerieDisplayForPdf = (alunosRef: StudentResult[]): string =>
        getHeaderSerieText(alunosRef) ?? "N/A";

      const getPdfEscolaDisplayText = (): string =>
        selectedSchoolId
          ? schools.find((s) => s.id === selectedSchoolId)?.nome || "Escola Selecionada"
          : "Todas as Escolas";

      /** Tipografia única dos cards do PDF (capa, faltosos, turma) — título e corpo 12 pt; espaçamentos proporcionais à fonte */
      const PDF_CARD_TITLE_PT = 12;
      const PDF_CARD_BODY_PT = 12;
      /** Espaço horizontal entre o fim da coluna de rótulos e o texto do valor (ex.: ESCOLA: ···· Nome) */
      const pdfLabelValueGapMm = 4;
      const pdfCardRowH = PDF_CARD_BODY_PT * 0.43;
      const pdfCardWrapStep = PDF_CARD_BODY_PT * 0.4;
      /** Altura reservada ao bloco título + linha + margem até os campos (coerente com o desenho abaixo) */
      const pdfCardTitleBlockH =
        9 + PDF_CARD_TITLE_PT * 0.48 + 1 + 4 + PDF_CARD_BODY_PT * 0.32;
      const pdfTituloNorm = (evaluationInfo.titulo || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
      const pdfEhCartaoResposta =
        pdfTituloNorm.includes("CARTAO RESPOSTA") ||
        (pdfTituloNorm.includes("CARTAO") && pdfTituloNorm.includes("RESPOSTA")) ||
        pdfTituloNorm.includes("ANSWER SHEET");
      const pdfTituloBlocoInformacoes = pdfEhCartaoResposta
        ? "INFORMAÇÕES DO CARTÃO RESPOSTA"
        : "INFORMAÇÕES DA AVALIAÇÃO";
      const pdfLabelPrimeiroItem = pdfEhCartaoResposta ? "CARTÃO:" : "AVALIAÇÃO:";

      // Função para adicionar capa inicial
      const addInitialCover = () => {
        doc.setFillColor(...COLORS.white);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        const centerX = pageWidth / 2;
        const BAND_H = 58;

        // Faixa superior roxa
        doc.setFillColor(...COLORS.primary);
        doc.rect(0, 0, pageWidth, BAND_H, 'F');

        // Logo na faixa
        let logoBottomInBand = 0;
        if (logoDataUrl && logoWidth > 0 && logoHeight > 0) {
          const desiredLogoWidth = 38;
          const desiredLogoHeight = (logoHeight * desiredLogoWidth) / logoWidth;
          doc.addImage(logoDataUrl, 'PNG', centerX - desiredLogoWidth / 2, 7, desiredLogoWidth, desiredLogoHeight);
          logoBottomInBand = 7 + desiredLogoHeight;
        } else {
          doc.setFontSize(20);
          doc.setTextColor(...COLORS.white);
          doc.setFont('helvetica', 'bold');
          doc.text('AFIRME PLAY', centerX, 22, { align: 'center' });
          logoBottomInBand = 28;
        }

        // Títulos na faixa (~+10% legibilidade)
        const titleY = Math.max(logoBottomInBand + 5, BAND_H - 17);
        doc.setTextColor(...COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(19);
        doc.text('RELATÓRIO DE DESEMPENHO', centerX, titleY, { align: 'center' });
        doc.setFontSize(12);
        doc.text('ACERTO E NÍVEIS DE PROFICIÊNCIA', centerX, titleY + 8, { align: 'center' });

        let y = BAND_H + 13;

        // Município
        doc.setFontSize(14);
        doc.setTextColor(...COLORS.primary);
        doc.setFont('helvetica', 'bold');
        doc.text(`${evaluationInfo.municipio?.toUpperCase() || 'MUNICÍPIO'} - ALAGOAS`, centerX, y, { align: 'center' });
        y += 7;

        // Secretaria
        doc.setFontSize(11);
        doc.setTextColor(...COLORS.textGray);
        doc.setFont('helvetica', 'normal');
        doc.text('SECRETARIA MUNICIPAL DE EDUCAÇÃO', centerX, y, { align: 'center' });
        y += 13;

        // Card mais largo e centralizado na página (tipografia só dentro do card)
        const pwCover = doc.internal.pageSize.getWidth();
        const cardWidth = pwCover - 72;
        const cardX = (pwCover - cardWidth) / 2;
        const ACCENT_W = 4;
        const inset = 11;
        const labelWidth = 52;
        const vMaxW = cardWidth - ACCENT_W - inset * 2 - labelWidth - pdfLabelValueGapMm;
        const ROW_H = pdfCardRowH;
        const fieldLineStep = pdfCardWrapStep;
        doc.setFontSize(PDF_CARD_BODY_PT);
        const avaliacaoLines = doc.splitTextToSize(evaluationInfo.titulo || 'N/A', vMaxW);
        const escolaLines = doc.splitTextToSize(getPdfEscolaDisplayText().toUpperCase(), vMaxW);

        const fieldRows: Array<{ label: string; lines: string[] }> = [
          { label: pdfLabelPrimeiroItem, lines: avaliacaoLines },
          { label: 'MUNICÍPIO:', lines: [evaluationInfo.municipio || 'N/A'] },
          { label: 'ESCOLA:', lines: escolaLines },
          { label: 'SÉRIE:', lines: [resolveSerieDisplayForPdf(studentsToUse)] },
        ];
        if (selectedClassId) {
          const turmaNome = classes.find(c => c.id === selectedClassId)?.nome || selectedClassId;
          fieldRows.push({ label: 'TURMA:', lines: [turmaNome] });
        }
        const dataAplicacaoPdf = formatApplicationDateForPdf(evaluationInfo.data_aplicacao);
        if (dataAplicacaoPdf) {
          fieldRows.push({ label: 'DATA:', lines: [dataAplicacaoPdf] });
        }
        if (selectedPeriod && selectedPeriod !== 'all') {
          fieldRows.push({ label: 'PERÍODO:', lines: [selectedPeriod] });
        }
        const turmasMapInitial = new Map<string, StudentResult[]>();
        studentsToUse.forEach(s => {
          const turma = s.turma || 'Sem Turma';
          if (!turmasMapInitial.has(turma)) turmasMapInitial.set(turma, []);
          turmasMapInitial.get(turma)!.push(s);
        });
        fieldRows.push({ label: 'TOTAL DE TURMAS:', lines: [`${turmasMapInitial.size}`] });

        const CARD_TITLE_H = pdfCardTitleBlockH;
        const cardContentH = fieldRows.reduce(
          (sum, f) => sum + Math.max(ROW_H, f.lines.length * fieldLineStep),
          0
        );
        const cardHeight = CARD_TITLE_H + cardContentH + 8;
        const phCover = doc.internal.pageSize.getHeight();
        const yCardTop =
          y + Math.max(0, (phCover - y - 14 - cardHeight) / 2);
        let yCard = yCardTop;
        if (yCard + cardHeight > phCover - 12) yCard = phCover - 12 - cardHeight;
        if (yCard < y) yCard = y;

        // Card background + acento lateral roxo + borda
        doc.setFillColor(...COLORS.bgLight);
        doc.rect(cardX, yCard, cardWidth, cardHeight, 'F');
        doc.setFillColor(...COLORS.primary);
        doc.rect(cardX, yCard, ACCENT_W, cardHeight, 'F');
        doc.setDrawColor(...COLORS.borderLight);
        doc.setLineWidth(0.4);
        doc.rect(cardX, yCard, cardWidth, cardHeight, 'S');

        // Título do card
        let cardY = yCard + 9;
        const cardContentCenterX = cardX + ACCENT_W + (cardWidth - ACCENT_W) / 2;
        doc.setFontSize(PDF_CARD_TITLE_PT);
        doc.setTextColor(...COLORS.primary);
        doc.setFont('helvetica', 'bold');
        doc.text(pdfTituloBlocoInformacoes, cardContentCenterX, cardY, { align: 'center' });
        cardY += PDF_CARD_TITLE_PT * 0.48;
        doc.setDrawColor(...COLORS.borderLight);
        doc.setLineWidth(0.3);
        doc.line(cardX + ACCENT_W + 4, cardY, cardX + cardWidth - 4, cardY);
        cardY += 4;

        // Campos (rótulo | gap | valor)
        doc.setFontSize(PDF_CARD_BODY_PT);
        const lx = cardX + ACCENT_W + inset;
        const vx = lx + labelWidth + pdfLabelValueGapMm;
        for (const field of fieldRows) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...COLORS.primary);
          doc.text(field.label, lx, cardY);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.textDark);
          doc.text(field.lines, vx, cardY);
          cardY += Math.max(ROW_H, field.lines.length * fieldLineStep);
        }
      };

      // Função para adicionar capa de faltosos
      const addFaltososCover = (turmaName: string | null, totalFaltosos: number, alunosParaSerie: StudentResult[]) => {
        doc.setFillColor(...COLORS.white);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        const centerX = pageWidth / 2;
        const BAND_H = 58;

        // Faixa superior roxa
        doc.setFillColor(...COLORS.primary);
        doc.rect(0, 0, pageWidth, BAND_H, 'F');

        // Logo na faixa
        let logoBottomInBand = 0;
        if (logoDataUrl && logoWidth > 0 && logoHeight > 0) {
          const desiredLogoWidth = 38;
          const desiredLogoHeight = (logoHeight * desiredLogoWidth) / logoWidth;
          doc.addImage(logoDataUrl, 'PNG', centerX - desiredLogoWidth / 2, 7, desiredLogoWidth, desiredLogoHeight);
          logoBottomInBand = 7 + desiredLogoHeight;
        } else {
          doc.setFontSize(20);
          doc.setTextColor(...COLORS.white);
          doc.setFont('helvetica', 'bold');
          doc.text('AFIRME PLAY', centerX, 22, { align: 'center' });
          logoBottomInBand = 28;
        }

        // Título da seção na faixa
        const sectionTitleY = Math.max(logoBottomInBand + 5, BAND_H - 14);
        doc.setTextColor(...COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.text('ALUNOS FALTOSOS', centerX, sectionTitleY, { align: 'center' });

        let y = BAND_H + 13;

        // Município
        doc.setFontSize(14);
        doc.setTextColor(...COLORS.primary);
        doc.setFont('helvetica', 'bold');
        doc.text(`${evaluationInfo.municipio?.toUpperCase() || 'MUNICÍPIO'} - ALAGOAS`, centerX, y, { align: 'center' });
        y += 7;

        // Secretaria
        doc.setFontSize(11);
        doc.setTextColor(...COLORS.textGray);
        doc.setFont('helvetica', 'normal');
        doc.text('SECRETARIA MUNICIPAL DE EDUCAÇÃO', centerX, y, { align: 'center' });
        y += 14;

        // Nome da turma em destaque
        if (turmaName) {
          const len = (turmaName || '').length;
          const subtitleSize = len > 28 ? 15 : len > 20 ? 20 : 24;
          doc.setFontSize(subtitleSize);
          doc.setTextColor(...COLORS.primary);
          doc.setFont('helvetica', 'bold');
          const maxWidth = pageWidth - 40;
          const lines = doc.splitTextToSize(turmaName.toUpperCase(), maxWidth);
          lines.forEach((line: string, i: number) => {
            doc.text(line, centerX, y + i * subtitleSize * 0.5, { align: 'center' });
          });
          y += Math.max(16, lines.length * subtitleSize * 0.5) + 8;
        } else {
          y += 5;
        }

        // Card de estatísticas (mesma tipografia dos demais cards)
        const pwF = doc.internal.pageSize.getWidth();
        const phF = doc.internal.pageSize.getHeight();
        const cardWidth = pwF - 72;
        const cardHeight = 56;
        const cardX = (pwF - cardWidth) / 2;
        const ACCENT_W = 4;
        const minSpaceAtBottom = 20;
        const yBelowHeader = y;
        let yCard =
          yBelowHeader + Math.max(0, (phF - yBelowHeader - minSpaceAtBottom - cardHeight) / 2);
        if (yCard + cardHeight > phF - minSpaceAtBottom) {
          yCard = phF - minSpaceAtBottom - cardHeight;
        }
        if (yCard < yBelowHeader) yCard = yBelowHeader;

        doc.setFillColor(...COLORS.bgLight);
        doc.rect(cardX, yCard, cardWidth, cardHeight, 'F');
        doc.setFillColor(...COLORS.primary);
        doc.rect(cardX, yCard, ACCENT_W, cardHeight, 'F');
        doc.setDrawColor(...COLORS.borderLight);
        doc.setLineWidth(0.4);
        doc.rect(cardX, yCard, cardWidth, cardHeight, 'S');

        let cardY = yCard + 9;
        const cardContentCenterX = cardX + ACCENT_W + (cardWidth - ACCENT_W) / 2;
        doc.setFontSize(PDF_CARD_TITLE_PT);
        doc.setTextColor(...COLORS.primary);
        doc.setFont('helvetica', 'bold');
        doc.text('ESTATÍSTICAS', cardContentCenterX, cardY, { align: 'center' });
        cardY += PDF_CARD_TITLE_PT * 0.48;
        doc.setDrawColor(...COLORS.borderLight);
        doc.setLineWidth(0.3);
        doc.line(cardX + ACCENT_W + 4, cardY, cardX + cardWidth - 4, cardY);
        cardY += 4;

        const leftColX = cardX + ACCENT_W + 12;
        const labelWidth = 58;
        const rowStepFalt = pdfCardRowH;
        doc.setFontSize(PDF_CARD_BODY_PT);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.primary);
        doc.text('TOTAL DE FALTOSOS:', leftColX, cardY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.textDark);
        doc.text(`${totalFaltosos}`, leftColX + labelWidth + pdfLabelValueGapMm, cardY);
        cardY += rowStepFalt;

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.primary);
        doc.text('SÉRIE:', leftColX, cardY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.textDark);
        doc.text(resolveSerieDisplayForPdf(alunosParaSerie), leftColX + labelWidth + pdfLabelValueGapMm, cardY);

        const cardBottom = yCard + cardHeight;
        const noteY = cardBottom + 8;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.textGray);
        const avisoFaltosos = 'Estes alunos ainda não realizaram a avaliação ou não constam nos resultados consolidados.';
        const splitAviso = doc.splitTextToSize(avisoFaltosos, cardWidth - 24);
        doc.text(splitAviso, centerX, noteY, { align: 'center', maxWidth: cardWidth - 24 });
      };

      // Função para adicionar capa de turma
      const addTurmaCover = (turmaName: string, alunosTurma: StudentResult[], totalQuestoes?: number) => {
        const pw = doc.internal.pageSize.getWidth();
        const ph = doc.internal.pageSize.getHeight();
        doc.setFillColor(...COLORS.white);
        doc.rect(0, 0, pw, ph, 'F');
        const centerX = pw / 2;
        const BAND_H = 45;

        doc.setFillColor(...COLORS.primary);
        doc.rect(0, 0, pw, BAND_H, 'F');

        // Logo na faixa
        let logoBottomInBand = 0;
        if (logoDataUrl && logoWidth > 0 && logoHeight > 0) {
          const desiredLogoWidth = 33;
          const desiredLogoHeight = (logoHeight * desiredLogoWidth) / logoWidth;
          doc.addImage(logoDataUrl, 'PNG', centerX - desiredLogoWidth / 2, 5, desiredLogoWidth, desiredLogoHeight);
          logoBottomInBand = 5 + desiredLogoHeight;
        } else {
          doc.setFontSize(18);
          doc.setTextColor(...COLORS.white);
          doc.setFont('helvetica', 'bold');
          doc.text('AFIRME PLAY', centerX, 18, { align: 'center' });
          logoBottomInBand = 24;
        }

        // Título da seção na faixa
        const sectionTitleY = Math.max(logoBottomInBand + 4, BAND_H - 10);
        doc.setTextColor(...COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.text('ANÁLISE POR TURMA', centerX, sectionTitleY, { align: 'center' });

        const yBelowBand = BAND_H + 14;

        // Card centralizado na página (nome da turma só dentro do card)
        const cardWidth = pw - 48;
        const cardX = (pw - cardWidth) / 2;
        const ACCENT_W = 4;
        const inset = 8;
        const labelW = 62;
        const valueX = cardX + ACCENT_W + inset + labelW + pdfLabelValueGapMm;
        const valueMaxW = cardWidth - ACCENT_W - inset * 2 - labelW - pdfLabelValueGapMm;
        const rowStep = pdfCardRowH;
        const padTop = PDF_CARD_BODY_PT * 0.38;
        const padBottom = PDF_CARD_BODY_PT * 0.38;

        doc.setFontSize(PDF_CARD_BODY_PT);
        const escolaCapLines = doc.splitTextToSize(getPdfEscolaDisplayText(), valueMaxW);
        const turmaCapLines = doc.splitTextToSize(turmaName || '—', valueMaxW);

        const concluidos = alunosTurma.filter((s) => s.status === 'concluida');
        const isVisaoGeral = turmaName.toUpperCase().includes('VISÃO GERAL');
        const useScopedStats = pdfEstatisticas && (isVisaoGeral || Boolean(selectedClassId));
        const totalAlunos =
          useScopedStats && typeof pdfEstatisticas.total_alunos === 'number'
            ? pdfEstatisticas.total_alunos
            : alunosTurma.length;
        const participantesCount =
          useScopedStats && typeof pdfEstatisticas.alunos_participantes === 'number'
            ? pdfEstatisticas.alunos_participantes
            : concluidos.length;
        const mediaNota =
          useScopedStats && typeof pdfEstatisticas.media_nota_geral === 'number'
            ? formatOneDecimalStable(Number(pdfEstatisticas.media_nota_geral))
            : concluidos.length > 0
              ? (concluidos.reduce((sum, s) => sum + s.nota, 0) / concluidos.length).toFixed(1)
              : '0.0';
        const mediaProficiencia =
          useScopedStats && typeof pdfEstatisticas.media_proficiencia_geral === 'number'
            ? formatOneDecimalStable(Number(pdfEstatisticas.media_proficiencia_geral))
            : concluidos.length > 0
              ? (concluidos.reduce((sum, s) => sum + s.proficiencia, 0) / concluidos.length).toFixed(1)
              : '0.0';
        const taxaParticipacao =
          useScopedStats && pdfEstatisticas.percentual_comparecimento != null
            ? formatOneDecimalStable(Number(pdfEstatisticas.percentual_comparecimento))
            : totalAlunos > 0
              ? ((participantesCount / totalAlunos) * 100).toFixed(1)
              : '0.0';

        const titleBlockH = PDF_CARD_TITLE_PT * 0.48 + 4;
        const bodyH =
          padTop +
          titleBlockH +
          escolaCapLines.length * rowStep +
          rowStep +
          turmaCapLines.length * rowStep +
          PDF_CARD_BODY_PT * 0.28 +
          6 * rowStep +
          padBottom;
        const cardHeight = bodyH;

        const minSpaceAtBottom = 20;
        let cardTopY =
          yBelowBand + Math.max(0, (ph - yBelowBand - minSpaceAtBottom - cardHeight) / 2);
        if (cardTopY + cardHeight > ph - minSpaceAtBottom) {
          cardTopY = ph - minSpaceAtBottom - cardHeight;
        }
        if (cardTopY < yBelowBand) cardTopY = yBelowBand;

        doc.setFillColor(...COLORS.bgLight);
        doc.rect(cardX, cardTopY, cardWidth, cardHeight, 'F');
        doc.setFillColor(...COLORS.primary);
        doc.rect(cardX, cardTopY, ACCENT_W, cardHeight, 'F');
        doc.setDrawColor(...COLORS.borderLight);
        doc.setLineWidth(0.35);
        doc.rect(cardX, cardTopY, cardWidth, cardHeight, 'S');

        const lx = cardX + ACCENT_W + inset;
        let cardY = cardTopY + padTop;

        doc.setFontSize(PDF_CARD_TITLE_PT);
        doc.setTextColor(...COLORS.primary);
        doc.setFont('helvetica', 'bold');
        doc.text('ESTATÍSTICAS DA TURMA', cardX + ACCENT_W + (cardWidth - ACCENT_W) / 2, cardY, { align: 'center' });
        cardY += PDF_CARD_TITLE_PT * 0.52;

        doc.setFontSize(PDF_CARD_BODY_PT);
        const drawLabeledBlock = (label: string, valueLines: string[]) => {
          doc.setFontSize(PDF_CARD_BODY_PT);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...COLORS.primary);
          doc.text(label, lx, cardY);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.textDark);
          valueLines.forEach((line, i) => {
            doc.text(line, valueX, cardY + i * rowStep);
          });
          cardY += Math.max(rowStep, valueLines.length * rowStep);
        };

        drawLabeledBlock('ESCOLA:', escolaCapLines);
        drawLabeledBlock('SÉRIE:', [resolveSerieDisplayForPdf(alunosTurma)]);
        drawLabeledBlock('TURMA:', turmaCapLines);

        cardY += 2;

        const drawStatRow = (label: string, value: string) => {
          doc.setFontSize(PDF_CARD_BODY_PT);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...COLORS.primary);
          doc.text(label, lx, cardY);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.textDark);
          doc.text(value, valueX, cardY);
          cardY += rowStep;
        };

        drawStatRow('TOTAL DE ALUNOS:', `${totalAlunos}`);
        drawStatRow('ALUNOS CONCLUÍRAM:', `${participantesCount}`);
        drawStatRow('MÉDIA DE NOTA:', `${mediaNota}`);
        drawStatRow('MÉDIA PROFICIÊNCIA:', `${mediaProficiencia}`);
        drawStatRow('TAXA DE PARTICIPAÇÃO:', `${taxaParticipacao}%`);
        drawStatRow('TOTAL DE QUESTÕES:', typeof totalQuestoes === 'number' ? `${totalQuestoes}` : '—');
      };

      // Função para adicionar rodapé
      const addFooter = (pageNum: number) => {
        const centerX = pageWidth / 2;
        const footerY = pageHeight - 10;

        // Linha sutil acima do rodapé
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.3);
        doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

        // Configuração de texto do rodapé
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);

        // Esquerda: Nome da empresa
        doc.text('Afirme Play Soluções Educativas', margin, footerY);

        // Centro: Número da página
        doc.text(`Página ${pageNum}`, centerX, footerY, { align: 'center' });

        // Direita: Data e hora formatada
        const now = new Date();
        const dateTimeStr = now.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        doc.text(dateTimeStr, pageWidth - margin, footerY, { align: 'right' });
      };

      // Função para adicionar cabeçalho
      const addHeader = (title: string, turmaOverride?: string, alunosParaSerie?: StudentResult[]): number => {
        const centerX = pageWidth / 2;
        const BAND_H = 20;

        // Faixa compacta de cabeçalho
        doc.setFillColor(...COLORS.primary);
        doc.rect(0, 0, pageWidth, BAND_H, 'F');

        // Ícone pequeno à esquerda na faixa
        if (icoDataUrl && icoWidth > 0 && icoHeight > 0) {
          const icoH_desired = 14;
          const icoW_desired = (icoWidth * icoH_desired) / icoHeight;
          doc.addImage(icoDataUrl, 'PNG', margin, (BAND_H - icoH_desired) / 2, icoW_desired, icoH_desired);
        } else {
          doc.setFontSize(8);
          doc.setTextColor(...COLORS.white);
          doc.setFont('helvetica', 'bold');
          doc.text('AFIRME PLAY', margin, BAND_H / 2 + 2);
        }

        // Título da seção na faixa (alinhado à direita)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...COLORS.white);
        doc.text(title, pageWidth - margin, BAND_H / 2 + 2, { align: 'right' });

        let y = BAND_H + 8;

        // Município
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.textDark);
        doc.text(`PREFEITURA DE ${evaluationInfo.municipio?.toUpperCase() || 'MUNICÍPIO'}`, centerX, y, { align: 'center' });
        y += 6;

        // Metadados: escola, série, turma
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...COLORS.textGray);
        const escolaTextH = getPdfEscolaDisplayText();
        const serieTextH = getHeaderSerieText(alunosParaSerie || studentsToUse);
        const turmaText = turmaOverride !== undefined
          ? turmaOverride
          : (selectedClassId ? classes.find(c => c.id === selectedClassId)?.nome || 'Selecionada' : (studentsToUse[0]?.turma || 'Todas'));
        const metaLineParts = [`Escola: ${escolaTextH}`];
        if (serieTextH) metaLineParts.push(`Série: ${serieTextH}`);
        metaLineParts.push(`Turma: ${turmaText}`);
        doc.text(metaLineParts.join('  •  '), centerX, y, { align: 'center', maxWidth: pageWidth - 2 * margin });
        y += 6;

        // Linha separadora
        doc.setDrawColor(...COLORS.borderLight);
        doc.setLineWidth(0.3);
        doc.line(margin, y, pageWidth - margin, y);
        y += 5;

        return y;
      };

      // Tipo mínimo de questão para o PDF (id, dificuldade, habilidade, tipo, % acertos/erros) — reduz memória e processamento
      type QuestaoMinima = {
        id: string;
        numero: number;
        dificuldade: 'Fácil' | 'Médio' | 'Difícil';
        habilidade: string;
        codigo_habilidade: string;
        tipo: 'multipleChoice' | 'open' | 'trueFalse';
        porcentagem_acertos: number;
        porcentagem_erros: number;
      };
      const normalizeReportQuestionTipo = (raw: unknown): QuestaoMinima['tipo'] => {
        const t = String(raw ?? '')
          .toLowerCase()
          .replace(/-/g, '_');
        if (t === 'multiple_choice' || t === 'multiplechoice') return 'multipleChoice';
        if (t === 'true_false' || t === 'truefalse') return 'trueFalse';
        if (t === 'open') return 'open';
        return 'multipleChoice';
      };
      const mapToMinimal = (q: NonNullable<DetailedReport['questoes']>[number]): QuestaoMinima => ({
        id: q.id,
        numero: q.numero,
        dificuldade: q.dificuldade,
        habilidade: q.habilidade,
        codigo_habilidade: q.codigo_habilidade,
        tipo: normalizeReportQuestionTipo(q.tipo),
        porcentagem_acertos: q.porcentagem_acertos,
        porcentagem_erros: q.porcentagem_erros
      });

      const sortQuestoes = (qs: QuestaoMinima[]) =>
        [...(qs || [])].sort((a, b) => (a?.numero || 0) - (b?.numero || 0));

      const buildQuestoesFromTabelaDetalhada = (
        tabelaFonte: typeof tabelaDetalhada
      ): QuestaoMinima[] => {
        // Unificar questões de todas as disciplinas com numero global (1..N), evitando colisão quando LP e MAT têm 1-20 cada
        const list: QuestaoMinima[] = [];
        let globalNumero = 0;
        tabelaFonte?.disciplinas?.forEach((disc) => {
          const sorted = [...(disc.questoes || [])].sort((a, b) => (a?.numero ?? 0) - (b?.numero ?? 0));
          sorted.forEach((q) => {
            globalNumero += 1;
            list.push({
              id: q.question_id || String(globalNumero),
              numero: globalNumero,
              habilidade: q.habilidade || '',
              codigo_habilidade: q.codigo_habilidade || '',
              tipo: 'multipleChoice',
              dificuldade: 'Médio',
              porcentagem_acertos: 0,
              porcentagem_erros: 0,
            });
          });
        });
        return list;
      };

      const buildQuestoesFallback = (): QuestaoMinima[] =>
        buildQuestoesFromTabelaDetalhada(pdfTabela);

      let questoesParaUsar: QuestaoMinima[] = buildQuestoesFallback();

      // Enriquecer questões da tabela geral com códigos de habilidade das disciplinas
      const activeTabParaEnrich = pdfTabela;
      if (activeTabParaEnrich?.disciplinas?.length) {
        const discQByQuestionId = new Map<string, { codigo_habilidade: string; habilidade: string }>();
        activeTabParaEnrich.disciplinas.forEach((disc) => {
          disc.questoes?.forEach((q) => {
            if (q.question_id) {
              discQByQuestionId.set(q.question_id, {
                codigo_habilidade: q.codigo_habilidade || '',
                habilidade: q.habilidade || '',
              });
            }
          });
        });
        if (discQByQuestionId.size > 0) {
          questoesParaUsar = questoesParaUsar.map((q) => {
            if (!isPlaceholderCodigoHabilidade(q.codigo_habilidade)) return q;
            const discQ = discQByQuestionId.get(q.id);
            if (discQ)
              return {
                ...q,
                codigo_habilidade: discQ.codigo_habilidade || q.codigo_habilidade,
                habilidade: discQ.habilidade || q.habilidade,
              };
            return q;
          });
        }
      }

      // Total de questões para fallback determinístico
      const totalQuestionsAll = questoesParaUsar.length;

      // Utilitário: obter resposta coerente (detalhado -> fallback determinístico)
      const getAnswer = (student: StudentResult, questionNumber: number): boolean => {
        const direct = student.respostas?.[`q${questionNumber}`];
        if (typeof direct === 'boolean') return direct;
        // Fallback estável por aluno
        let cache = fallbackAnswersCache.current.get(student.id);
        if (!cache) {
          cache = new Map<number, boolean>();
          const totalQ = Math.max(1, totalQuestionsAll);
          // seed a partir do id
          let seed = 0;
          for (let i = 0; i < student.id.length; i++) seed = (seed * 31 + student.id.charCodeAt(i)) >>> 0;
          const order = Array.from({ length: totalQ }, (_, i) => i + 1);
          for (let i = order.length - 1; i > 0; i--) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            const j = seed % (i + 1);
            [order[i], order[j]] = [order[j], order[i]];
          }
          const correctSet = new Set(order.slice(0, Math.max(0, Math.min(student.acertos || 0, totalQ))));
          for (let k = 1; k <= totalQ; k++) cache.set(k, correctSet.has(k));
          fallbackAnswersCache.current.set(student.id, cache);
        }
        return cache.get(questionNumber) ?? false;
      };

      const countCorrectFor = (student: StudentResult, qs: QuestaoMinima[]): number => {
        if (!qs || qs.length === 0) return 0;
        let count = 0;
        qs.forEach(q => { if (getAnswer(student, q.numero)) count++; });
        return count;
      };

      const getAnswerMarkForPdf = (student: StudentResult, questionNumber: number): string =>
        getAnswer(student, questionNumber) ? "\u2713" : "\u2717";

      // ===== Funções de gráficos =====
      const pdfTextColorForBarFill = (r: number, g: number, b: number): [number, number, number] => {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        return lum > 175 ? [33, 33, 33] : [255, 255, 255];
      };

      const drawClassificationChart = (
        x: number,
        y: number,
        w: number,
        h: number,
        studentsToUse: StudentResult[] = students,
        distribuicaoApi?: EstatisticasGeraisState['distribuicao_classificacao_geral'] | null
      ) => {
        const categorias: ReportProficiencyLabel[] = [
          'Abaixo do Básico',
          'Básico',
          'Adequado',
          'Avançado',
        ];
        let counts: number[];
        let total: number;
        let participantesLabel: number;

        if (distribuicaoApi) {
          counts = [
            distribuicaoApi.abaixo_do_basico ?? 0,
            distribuicaoApi.basico ?? 0,
            distribuicaoApi.adequado ?? 0,
            distribuicaoApi.avancado ?? 0,
          ];
          participantesLabel = counts.reduce((sum, n) => sum + n, 0);
          total = Math.max(
            1,
            typeof pdfEstatisticas?.participantes_distribuicao === 'number'
              ? pdfEstatisticas.participantes_distribuicao
              : participantesLabel
          );
        } else {
          const concluidos = studentsToUse.filter((s) => s.status === 'concluida');
          counts = categorias.map(
            (c) =>
              concluidos.filter((s) => normalizeProficiencyLevelLabel(s.classificacao) === c).length
          );
          participantesLabel = concluidos.length;
          total = Math.max(1, concluidos.length);
        }

        const titleH = 8;
        const labelUnderH = 12;
        const rx = 2;
        const gap = 4;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text('Distribuição por Classificação', x, y + 5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(70);
        doc.text(`Participantes: ${participantesLabel}`, x + w, y + 5, { align: 'right' });

        const cardsTop = y + titleH + 2;
        const cardBlockH = Math.max(24, h - titleH - labelUnderH - 4);
        const nCards = categorias.length;
        const cardW = (w - (nCards - 1) * gap) / nCards;

        categorias.forEach((cat, i) => {
          const count = counts[i];
          const perc = (count / total) * 100;
          const percStr = `${perc.toFixed(1)}%`;

          const cardX = x + i * (cardW + gap);
          const cardY = cardsTop;

          doc.setFillColor(243, 244, 246);
          doc.roundedRect(cardX, cardY, cardW, cardBlockH, rx, rx, 'F');
          doc.setDrawColor(214, 214, 214);
          doc.setLineWidth(0.25);
          doc.roundedRect(cardX, cardY, cardW, cardBlockH, rx, rx, 'S');

          const pad = 2.5;
          const innerX = cardX + pad;
          const innerW = cardW - pad * 2;
          const innerY = cardY + pad;
          const innerH = cardBlockH - pad * 2;

          const fillH = Math.max(0, (perc / 100) * innerH);
          const barBottom = innerY + innerH;
          const barTop = barBottom - fillH;

          if (fillH > 0.2) {
            const [br, bg, bb] = generateClassificationColor(cat);
            doc.setFillColor(br, bg, bb);
            doc.rect(innerX, barTop, innerW, fillH, 'F');

            const [tr, tg, tb] = pdfTextColorForBarFill(br, bg, bb);
            doc.setTextColor(tr, tg, tb);
            doc.setFont('helvetica', 'bold');
            const fs = Math.min(10, Math.max(5.5, Math.min(innerW * 0.42, fillH * 0.5)));
            doc.setFontSize(fs);
            if (fillH > fs * 0.45) {
              doc.text(percStr, innerX + innerW / 2, barTop + fillH / 2 + fs * 0.12, { align: 'center' });
            }
          }

          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(40, 40, 40);
          const line1Y = cardY + cardBlockH + 4;
          doc.text(`${count} (${percStr})`, cardX + cardW / 2, line1Y, { align: 'center' });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(70, 70, 70);
          doc.text(cat, cardX + cardW / 2, line1Y + 4, { align: 'center' });
        });
      };

      /** Cabeçalho azul dos cards de questão (referência visual; distinto do roxo institucional). */
      const PDF_QUESTION_CARD_HEADER_RGB: [number, number, number] = [37, 99, 235];

      const drawQuestionAccuracyChart = (
        x: number,
        y: number,
        w: number,
        h: number,
        qs: QuestaoMinima[],
        studentsToUse: StudentResult[] = students
      ) => {
        if (!qs || qs.length === 0) return;
        const completed = studentsToUse.filter((s) => s.status === 'concluida');
        const denom = Math.max(1, completed.length);
        const counts = qs.map((q) => {
          let correct = 0;
          completed.forEach((s) => {
            if (getAnswer(s, q.numero)) correct++;
          });
          return correct;
        });
        const values = counts.map((c) => Math.round((c / denom) * 100));

        const pad = 3;
        const titleH = 7;
        const areaW = w - 2 * pad;
        const areaH = Math.max(1, h - titleH - 1);
        const contentTop = y + titleH;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text('Acerto por Questão', x + pad, y + 4);

        const gapX = 2.5;
        const gapY = 3;
        const n = values.length;
        const minCardW = 6.2;
        const minCardH = 7;

        let colsPerRow = 4;
        let rows = Math.ceil(n / colsPerRow);
        let cardW = (areaW - (colsPerRow - 1) * gapX) / colsPerRow;
        let cardH = (areaH - Math.max(0, rows - 1) * gapY) / Math.max(1, rows);
        let layoutOk = false;
        for (let c = Math.min(20, Math.max(4, n)); c >= 4; c--) {
          const r = Math.ceil(n / c);
          const cw = (areaW - (c - 1) * gapX) / c;
          const ch = (areaH - Math.max(0, r - 1) * gapY) / Math.max(1, r);
          if (cw >= minCardW && ch >= minCardH) {
            colsPerRow = c;
            rows = r;
            cardW = cw;
            cardH = ch;
            layoutOk = true;
            break;
          }
        }
        if (!layoutOk) {
          colsPerRow = Math.min(20, Math.max(4, n));
          rows = Math.ceil(n / colsPerRow);
          cardW = (areaW - (colsPerRow - 1) * gapX) / colsPerRow;
          cardH = Math.max(5, (areaH - Math.max(0, rows - 1) * gapY) / Math.max(1, rows));
        }

        const greenBg: [number, number, number] = [22, 163, 74];
        const redBg: [number, number, number] = [239, 68, 68];

        let idx = 0;
        for (let row = 0; row < rows; row++) {
          const rowY = contentTop + row * (cardH + gapY);
          for (let col = 0; col < colsPerRow && idx < n; col++, idx++) {
            const v = values[idx];
            const qNum = qs[idx]?.numero ?? idx + 1;
            const cardX = x + pad + col * (cardW + gapX);
            const headH = Math.max(4, Math.min(cardH * 0.26, 6));
            const pctBandH = cardH - headH;

            doc.setDrawColor(220);
            doc.setLineWidth(0.2);
            doc.setFillColor(255, 255, 255);
            doc.rect(cardX, rowY, cardW, cardH, 'FD');

            const [hr, hg, hb] = PDF_QUESTION_CARD_HEADER_RGB;
            doc.setFillColor(hr, hg, hb);
            doc.rect(cardX, rowY, cardW, headH, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            const headFs = Math.min(11, Math.max(7, cardW * 0.48));
            doc.setFontSize(headFs);
            doc.text(`${qNum}ª Q`, cardX + cardW / 2, rowY + headH * 0.64, { align: 'center' });

            const ok = v >= 60;
            const [pr, pg, pb] = ok ? greenBg : redBg;
            doc.setFillColor(pr, pg, pb);
            doc.rect(cardX, rowY + headH, cardW, pctBandH, 'F');
            doc.setTextColor(255, 255, 255);
            const pctFs = Math.min(
              14,
              Math.max(8, Math.min(cardW * 0.52, pctBandH * 0.58))
            );
            doc.setFontSize(pctFs);
            doc.text(`${v}%`, cardX + cardW / 2, rowY + headH + pctBandH / 2 + pctFs * 0.11, {
              align: 'center',
            });
          }
        }
      };

      // Função para gerar página de resumo para uma turma específica
      const renderSummaryPageForTurma = (turmaName: string, alunosTurma: StudentResult[], isFirstTurma: boolean = false) => {
        if (alunosTurma.length === 0) return;

        doc.addPage('landscape');
        pageCount++;

        const title = `RELATÓRIO DE DESEMPENHO GERAL`;
        const questoes: QuestaoMinima[] = sortQuestoes(questoesParaUsar);

        const startY = addHeader(title, turmaName, alunosTurma);
        const availableWidth = pageWidth - (2 * margin);
        const MIN_NIVEL_MM = 40;
        const nameWidth = Math.min(140, availableWidth * 0.5);
        const restWidth = availableWidth - nameWidth - MIN_NIVEL_MM;
        const otherWidth = Math.max(16, restWidth / 3);

        // Preparar dados da tabela (usando sempre a mesma regra de acerto)
        const bodyRows: (string | number)[][] = [];
        const completedStudents = alunosTurma.filter(s => s.status === 'concluida');

        completedStudents.forEach((s, i) => {
          const subset = questoes;
          const acertos = countCorrectFor(s, subset);
          const total = subset.length;

          const row = [
            `${i + 1}. ${s.nome}`,
            `${acertos}/${total}`,
            formatOneDecimalStable(s.nota),
            s.proficiencia.toFixed(1),
            normalizeProficiencyLevelLabel(s.classificacao),
          ];
          bodyRows.push(row);
        });

        // Gerar tabela
        autoTable(doc, {
          startY: startY,
          head: [["Aluno", "Acertos", "Nota", "Proficiência", "Nível"]],
          body: bodyRows,
          theme: 'grid',
          margin: { left: margin, right: margin },
          styles: {
            fontSize: scaleCompactTable(scalePdfTable(16)),
            cellPadding: scaleCompactTable(scalePdfTable(2.5)),
            lineColor: [200, 200, 200],
            lineWidth: 0.1,
            valign: 'middle'
          },
          headStyles: {
            fillColor: COLORS.primary,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            fontSize: scaleCompactTable(scalePdfTable(16)),
            cellPadding: scaleCompactTable(scalePdfTable(2.5)),
          },
          bodyStyles: { textColor: [33, 33, 33] },
          alternateRowStyles: { fillColor: [250, 250, 250] },
          columnStyles: {
            0: { cellWidth: nameWidth, halign: 'left' },
            1: { cellWidth: otherWidth, halign: 'center' },
            2: { cellWidth: otherWidth, halign: 'center' },
            3: { cellWidth: otherWidth, halign: 'center' },
            4: { cellWidth: MIN_NIVEL_MM, halign: 'center' }
          },
          didParseCell: (data: CellHookData) => {
            if (data.section === 'body' && data.column.index === 4) {
              data.cell.styles.minCellHeight = scaleCompactTable(scalePdfTable(16));
            }
          },
          didDrawCell: (data: CellHookData) => {
            if (data.section !== 'body' || data.column.index !== 4) return;

            const cellRaw = Array.isArray(data.cell.text) ? data.cell.text[0] : data.cell.text;
            const textValue = String(cellRaw ?? '').trim();
            drawProficiencyNivelInPdfCell(
              data.doc as jsPDF,
              data.cell,
              textValue,
              scaleCompactTable(scalePdfTable(16))
            );
          }
        });

        addFooter(pageCount);
      };

      // Uma única página por tabela: todas as questões na mesma página, com fonte e colunas adaptáveis
      // Função para gerar página detalhada (landscape) para uma turma específica — todas as questões em uma página
      const renderDetailedPageForTurma = (subtitle: string, turmaName: string, alunosTurma: StudentResult[], questoes: QuestaoMinima[]) => {
        const completedStudentsLocal = alunosTurma.filter(s => s.status === 'concluida');
        if (!questoes || questoes.length === 0 || completedStudentsLocal.length === 0) return;
        questoes = sortQuestoes(questoes);

        const landscapeWidth = 297;
        const landscapeHeight = 210;
        const landscapeMargin = 10;
        const denomLocal = Math.max(1, completedStudentsLocal.length);
        const totalQuestoes = questoes.length;
        const acertosPorAluno = completedStudentsLocal.map(s => countCorrectFor(s, questoes));

        const drawTableChunk = (
          chunk: typeof questoes,
          isLastChunk: boolean,
          startY: number
        ) => {
          const headerRow1 = ["Aluno"];
          const headerRow2 = ["Habilidade"];
          const headerRow3 = ["% Turma"];
          chunk.forEach(q => {
            // Apenas o número (sem prefixo "Q")
            headerRow1.push(`Q\n${q.numero}`);
            const code = generateHabilidadeCode(q);
            headerRow2.push(code);
            let correct = 0;
            completedStudentsLocal.forEach(s => { if (getAnswer(s, q.numero)) correct++; });
            headerRow3.push(`${Math.round((correct / denomLocal) * 100)}%`);
          });
          if (isLastChunk) {
            headerRow1.push("Total de acertos", "Nota", "Proficiência", "Nível");
            headerRow2.push("", "", "", "");
            headerRow3.push("", "", "", "");
          }

          const bodyRows: (string | number)[][] = [];
          completedStudentsLocal.forEach((s, idx) => {
            const row: (string | number)[] = [s.nome];
            chunk.forEach(q => {
              row.push(getAnswerMarkForPdf(s, q.numero));
            });
            if (isLastChunk) {
              row.push(`${acertosPorAluno[idx]}/${totalQuestoes}`);
              row.push(formatOneDecimalStable(s.nota));
              row.push(s.proficiencia.toFixed(1));
              row.push(normalizeProficiencyLevelLabel(s.classificacao));
            }
            bodyRows.push(row);
          });

          const availableWidth = landscapeWidth - (2 * landscapeMargin);
          const MIN_NIVEL_WIDTH_MM = 20;
          const colTotalAcertos = chunk.length > 28 ? 8 : 11;
          const colNota = chunk.length > 28 ? 8 : 11;
          const colProficiencia = chunk.length > 28 ? 9 : 12;
          const colNivel = Math.max(MIN_NIVEL_WIDTH_MM, chunk.length > 28 ? 17 : 21);
          const finalColsWidth = isLastChunk ? (colTotalAcertos + colNota + colProficiencia + colNivel) : 0;

          const numCols = Math.max(1, chunk.length);

          const dynamicFontSize = scaleDetailTableExtra(PDF_BULK_LANDSCAPE_FONT(numCols));
          const bulkPadH = scaleDetailTableExtra(PDF_BULK_LANDSCAPE_CELL_PAD_H(numCols));
          const bulkPadV = scaleDetailTableExtra(PDF_BULK_LANDSCAPE_CELL_PAD_V(numCols));
          const numQuestoesThisChunk = chunk.length;
          const summaryNameFontPt = computePdfSummaryTableBodyFontPt(scalePdfTable, scaleCompactTable);
          const {
            bodyRowHeightMm,
            skillRowHMm: SKILL_ROW_H,
            pctRowHMm: PCT_ROW_H,
            qHeaderRowHMm: Q_ROW_H,
            nameBodyFontPt: nameBodyFont,
            namePadVerticalMm: namePadV,
            skillCodeFontSize,
          } = computePdfBulkTableVerticalLayout({
            pageHeightMm: landscapeHeight,
            startYMm: startY,
            studentCount: bodyRows.length,
            questionCount: numQuestoesThisChunk,
            dynamicFontSize,
            bulkPadV,
            rowMinMm: scalePdfTable(2.5),
            nameBodyFontPt: summaryNameFontPt,
            footerReserveMm: 10,
            extraBottomReserveMm: 5,
            scaleDetailTableExtra,
            scalePdfTable,
          });

          // Largura da coluna de nomes baseada no maior nome real
          doc.setFontSize(nameBodyFont);
          doc.setFont('helvetica', 'normal');
          const longestNameMm = completedStudentsLocal.reduce((maxW, s) => {
            const w = doc.getStringUnitWidth(s.nome) * nameBodyFont * 0.3528;
            return Math.max(maxW, w);
          }, 0);
          const nameColWidth = Math.min(65, Math.max(20, longestNameMm + 4));

          const spaceForQuestions = Math.max(0, availableWidth - nameColWidth - finalColsWidth);
          // Colunas estreitas para cabeçalho vertical
          const questionColWidth = spaceForQuestions / numCols;

          const columnStyles: Record<string, Partial<Styles>> = {
            '0': { cellWidth: nameColWidth, halign: 'left', overflow: 'ellipsize' },
          };
          for (let i = 1; i <= chunk.length; i++) {
            columnStyles[String(i)] = { cellWidth: questionColWidth, halign: 'center' };
          }

          if (isLastChunk) {
            columnStyles[String(chunk.length + 1)] = { cellWidth: colTotalAcertos, halign: 'center' };
            columnStyles[String(chunk.length + 2)] = { cellWidth: colNota, halign: 'center' };
            columnStyles[String(chunk.length + 3)] = { cellWidth: colProficiencia, halign: 'center' };
            columnStyles[String(chunk.length + 4)] = {
              cellWidth: colNivel,
              halign: 'center',
              overflow: 'ellipsize',
            };
          }

          autoTable(doc, {
            startY: startY,
            head: [headerRow1, headerRow2, headerRow3],
            body: bodyRows,
            theme: 'grid',
            margin: { left: landscapeMargin, right: landscapeMargin },
            tableWidth: availableWidth,
            showHead: 'everyPage',
            styles: {
              fontSize: dynamicFontSize,
              cellPadding: { vertical: bulkPadV, horizontal: bulkPadH },
              lineColor: [0, 0, 0],
              lineWidth: 0.25,
              overflow: 'linebreak',
              valign: 'middle',
              halign: 'center'
            },
            headStyles: {
              fillColor: [240, 240, 240],
              textColor: [0, 0, 0],
              fontStyle: 'bold',
              halign: 'center',
              fontSize: dynamicFontSize,
              cellPadding: PDF_BULK_HEAD_CELL_PAD,
            },
            columnStyles: columnStyles,
            bodyStyles: { textColor: [33, 33, 33] },
            alternateRowStyles: { fillColor: [252, 252, 252] },
            didParseCell: (data: CellHookData) => {
              if (data.section === 'body') {
                data.cell.styles.minCellHeight = bodyRowHeightMm;
                if (data.column.index === 0) {
                  data.cell.styles.fontSize = nameBodyFont;
                  data.cell.styles.cellPadding = { vertical: namePadV, horizontal: bulkPadH };
                } else if (data.column.index > numQuestoesThisChunk) {
                  // Colunas de resumo (Total de acertos, Nota, Proficiência, Nível)
                  data.cell.styles.fontSize = scalePdfTable(6);
                  data.cell.styles.fontStyle = 'bold';
                }
              }
              if (data.section === 'head') {
                data.cell.styles.cellPadding = PDF_BULK_HEAD_CELL_PAD;
                if (data.row.index === 0) {
                  data.cell.styles.minCellHeight = Q_ROW_H;
                  // Número da questão: fonte legível mínima de 6pt
                  data.cell.styles.fontSize = Math.max(scalePdfTable(6), dynamicFontSize);
                  data.cell.styles.fontStyle = 'bold';
                  data.cell.styles.cellPadding = { vertical: scalePdfTable(0.8), horizontal: scalePdfTable(0.5) };
                  if (data.column.index > 0 && data.column.index <= numQuestoesThisChunk) {
                    data.cell.text = [''];
                  }
                } else if (data.row.index === 1) {
                  data.cell.styles.minCellHeight = SKILL_ROW_H;
                  data.cell.styles.cellPadding = scalePdfTable(0.5);
                  if (data.column.index === 0) {
                    // Label "Habilidade" na primeira coluna — fonte legível
                    data.cell.styles.fontSize = scalePdfTable(7);
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.valign = 'middle';
                  } else if (data.column.index <= numQuestoesThisChunk) {
                    // Suprimir texto nas colunas de questão (será desenhado verticalmente)
                    data.cell.text = [''];
                  }
                } else if (data.row.index === 2) {
                  data.cell.styles.minCellHeight = PCT_ROW_H;
                  data.cell.styles.cellPadding = scalePdfTable(0.5);
                  if (data.column.index === 0) {
                    // Label "% Turma" na primeira coluna — fonte legível
                    data.cell.styles.fontSize = scalePdfTable(7);
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.valign = 'middle';
                  } else if (data.column.index <= numQuestoesThisChunk) {
                    // Suprimir texto nas colunas de questão (será desenhado verticalmente)
                    data.cell.text = [''];
                  }
                }
              }
            },
            didDrawCell: (data: CellHookData) => {
              const { doc: d, cell, column, section, row } = data;
              const val = Array.isArray(cell.text) ? cell.text[0] : cell.text;

              if (section === 'body' && column.index > 0 && column.index <= numQuestoesThisChunk) {
                const markKind = parsePdfAnswerMarkCell(val);
                if (markKind) {
                  drawPdfAnswerMarkCell(d, cell, markKind);
                }
              }
              if (section === 'head' && row.index === 0 && column.index > 0 && column.index <= numQuestoesThisChunk) {
                const qLabel = headerRow1[column.index] || '';
                drawPdfQuestionHeaderCell(
                  d,
                  cell,
                  qLabel,
                  Math.max(scalePdfTable(6), dynamicFontSize)
                );
              }
              if (section === 'head' && row.index === 1 && column.index > 0 && column.index <= numQuestoesThisChunk) {
                const skillCode = formatPdfSkillCodeForHeader(headerRow2[column.index] || '');
                if (skillCode) {
                  d.setFillColor(...PDF_ANSWER_CELL.skillHeaderBg);
                  d.rect(cell.x, cell.y, cell.width, cell.height, 'F');
                  d.setFontSize(skillCodeFontSize);
                  d.setFont('helvetica', 'bold');
                  d.setTextColor(30, 58, 95);
                  const cx = cell.x + cell.width / 2;
                  const textWidthMm = d.getStringUnitWidth(skillCode) * skillCodeFontSize / d.internal.scaleFactor;
                  const cy = cell.y + (cell.height + textWidthMm) / 2;
                  d.text(skillCode, cx, cy, { angle: 90 });
                  d.setDrawColor(...PDF_ANSWER_CELL.border);
                  d.setLineWidth(0.2);
                  d.rect(cell.x, cell.y, cell.width, cell.height);
                }
              }
              if (section === 'head' && row.index === 2 && column.index > 0 && column.index <= numQuestoesThisChunk) {
                const pctText = headerRow3[column.index] || '';
                const pct = parseInt(pctText.replace(/[^0-9]/g, ''));
                const isGood = !isNaN(pct) && pct >= 60;
                const fillRgb = isGood ? PDF_ANSWER_CELL.correctBg : PDF_ANSWER_CELL.incorrectBg;
                const textRgb = isGood ? PDF_ANSWER_CELL.correctFg : PDF_ANSWER_CELL.incorrectFg;
                d.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
                d.rect(cell.x, cell.y, cell.width, cell.height, 'F');
                if (pctText) {
                  d.setFontSize(scaleDetailTableExtra(scalePdfTable(5)));
                  d.setFont('helvetica', 'bold');
                  d.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
                  const cx = cell.x + cell.width / 2;
                  const cy = cell.y + cell.height - 1;
                  d.text(pctText, cx, cy, { angle: 90 });
                }
                d.setDrawColor(...PDF_ANSWER_CELL.border);
                d.setLineWidth(0.2);
                d.rect(cell.x, cell.y, cell.width, cell.height);
              }
              if (isLastChunk && section === 'body' && column.index === chunk.length + 4) {
                const cellRawNivel = Array.isArray(cell.text) ? cell.text[0] : cell.text;
                const raw = String(cellRawNivel ?? '').trim();
                drawProficiencyNivelInPdfCell(
                  d,
                  cell,
                  raw,
                  Math.max(scalePdfTable(4), Math.min(scalePdfTable(5.5), cell.height / 0.3528 * 0.65)),
                  { compact: true }
                );
              }
            },
          });
        };

        doc.addPage('landscape');
        pageCount++;

        // Faixa compacta de cabeçalho
        const DETAIL_BAND_H = 14;
        doc.setFillColor(...COLORS.primary);
        doc.rect(0, 0, landscapeWidth, DETAIL_BAND_H, 'F');
        if (icoDataUrl && icoWidth > 0 && icoHeight > 0) {
          const lh = 10;
          const lw = (icoWidth * lh) / icoHeight;
          doc.addImage(icoDataUrl, 'PNG', landscapeMargin, (DETAIL_BAND_H - lh) / 2, lw, lh);
        }
        doc.setTextColor(...COLORS.white);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`${evaluationInfo.titulo} — ${subtitle}`, landscapeWidth / 2, DETAIL_BAND_H / 2 + 1.5, { align: 'center' });

        let y = DETAIL_BAND_H + 4;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.textGray);
        const metaDetalheGeral = `Escola: ${getPdfEscolaDisplayText()}  •  Série: ${resolveSerieDisplayForPdf(alunosTurma)}  •  Turma: ${turmaName}`;
        const metaDetalheLines = doc.splitTextToSize(metaDetalheGeral, landscapeWidth - 2 * landscapeMargin);
        metaDetalheLines.forEach((ln: string, i: number) => {
          doc.text(ln, landscapeWidth / 2, y + i * 3.2, { align: 'center' });
        });
        y += Math.max(3.2, metaDetalheLines.length * 3.2) + 1;
        doc.setTextColor(...COLORS.textDark);

        drawTableChunk(questoes, true, y);

        const finalY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y) + 1.2;
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        let legendX = landscapeMargin;
        doc.setDrawColor(22, 163, 74);
        doc.setLineWidth(0.28);
        const iconSize = 1.05;
        const legendY = finalY + 1.1;
        const legendTextY = finalY + 1.85;
        doc.line(legendX - iconSize, legendY, legendX - iconSize / 2, legendY + iconSize);
        doc.line(legendX - iconSize / 2, legendY + iconSize, legendX + iconSize, legendY - iconSize);
        doc.setTextColor(90, 90, 90);
        doc.text('Correto', legendX + 3.2, legendTextY);
        legendX += 16;
        doc.setDrawColor(239, 68, 68);
        doc.setLineWidth(0.28);
        doc.line(legendX - iconSize, legendY - iconSize, legendX + iconSize, legendY + iconSize);
        doc.line(legendX + iconSize, legendY - iconSize, legendX - iconSize, legendY + iconSize);
        doc.setTextColor(90, 90, 90);
        doc.text('Incorretas', legendX + 3.2, legendTextY);

        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text('Afirme Play Soluções Educativas', landscapeMargin, landscapeHeight - 8);
        doc.text(`Página ${pageCount}`, landscapeWidth / 2, landscapeHeight - 8, { align: 'center' });
        doc.text(new Date().toLocaleString('pt-BR'), landscapeWidth - landscapeMargin, landscapeHeight - 8, { align: 'right' });
      };

      // Função para renderizar gráficos para uma turma específica
      const renderChartsForTurma = (turmaName: string, alunosTurma: StudentResult[]) => {
        if (alunosTurma.length === 0) return;

        doc.addPage('landscape');
        pageCount++;
        const yCharts = addHeader('VISÃO GRÁFICA DOS RESULTADOS', turmaName, alunosTurma);
        const chartsTop = yCharts + 2;
        const chartsLeft = margin;
        const chartsWidth = pageWidth - 2 * margin;
        const chartsHeight = pageHeight - chartsTop - margin - 6;
        const classificationChartMinH = 40;
        const classificationChartH = Math.max(classificationChartMinH, Math.floor(chartsHeight * 0.38));
        const questionChartStartY = chartsTop + classificationChartH + 4;
        const CHART_FOOTER_CLEAR_MM = 14;
        const questionChartH = Math.max(
          20,
          pageHeight - questionChartStartY - margin - CHART_FOOTER_CLEAR_MM
        );
        drawClassificationChart(
          chartsLeft,
          chartsTop,
          chartsWidth,
          classificationChartH,
          alunosTurma,
          turmaName.toUpperCase().includes('VISÃO GERAL') || selectedClassId
            ? pdfEstatisticas?.distribuicao_classificacao_geral ?? null
            : null
        );
        const qsAll = sortQuestoes(questoesParaUsar);
        drawQuestionAccuracyChart(chartsLeft, questionChartStartY, chartsWidth, questionChartH, qsAll, alunosTurma);
        addFooter(pageCount);
      };

      // ====== Páginas por disciplina (consumindo diretamente tabela_detalhada) ======
      const renderDisciplineTablesPagesForTurma = (turmaName: string, alunosTurma: StudentResult[], customTabela?: typeof pdfTabela) => {
        const activeTabela = customTabela !== undefined ? customTabela : pdfTabela;
        if (!activeTabela || !Array.isArray(activeTabela.disciplinas)) return;
        const disciplinas = activeTabela.disciplinas;

        disciplinas.forEach((disc) => {
          if (!Array.isArray(disc.questoes) || disc.questoes.length === 0) return;

          // Filtrar alunos da disciplina para incluir apenas os da turma específica
          const alunosTurmaDisciplina = (disc.alunos || []).filter(al => al.turma === turmaName);
          if (alunosTurmaDisciplina.length === 0) return; // Pular se não houver alunos desta turma nesta disciplina

          // Ordenar questões por número
          const qs = [...disc.questoes].sort((a, b) => (a?.numero || 0) - (b?.numero || 0));
          const totalQuestoesDisc = qs.length;

          const landscapeWidth = 297;
          const landscapeHeight = 210;
          const landscapeMargin = 10;
          const escolaText = selectedSchoolId ? (schools.find(s => s.id === selectedSchoolId)?.nome || '') : 'Todas as Escolas';
          const alunosParticipantes = alunosTurmaDisciplina.filter(al => Array.isArray(al.respostas_por_questao) && al.respostas_por_questao.some(r => r.respondeu));
          const serieHeuristicaGlobal = getHeaderSerieText(studentsToUse);
          let serieText = selectedGradeId ? (grades.find(g => g.id === selectedGradeId)?.nome || '') : (serieHeuristicaGlobal || '');
          if (!serieText) {
            const setSeries = new Set<string>();
            (alunosParticipantes || []).forEach(a => {
              const ser = extractSerieFromTurma(a.turma);
              if (ser) setSeries.add(ser);
            });
            if (setSeries.size === 1) serieText = Array.from(setSeries)[0];
            else if (evaluationInfo?.serie && evaluationInfo.serie !== 'N/A') serieText = evaluationInfo.serie;
          }
          const denomLocal = Math.max(1, alunosParticipantes.length);

          // Uma única página por disciplina: todas as questões na mesma página, tabela adaptável
          const chunk = qs;
          const isLastChunk = true;

          doc.addPage('landscape');
          pageCount++;

          // Faixa compacta de cabeçalho
          const DETAIL_BAND_H_DISC = 14;
          doc.setFillColor(...COLORS.primary);
          doc.rect(0, 0, landscapeWidth, DETAIL_BAND_H_DISC, 'F');
          if (icoDataUrl && icoWidth > 0 && icoHeight > 0) {
            const lh = 10;
            const lw = (icoWidth * lh) / icoHeight;
            doc.addImage(icoDataUrl, 'PNG', landscapeMargin, (DETAIL_BAND_H_DISC - lh) / 2, lw, lh);
          }
          doc.setTextColor(...COLORS.white);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          const headerDisc = `DISCIPLINA: ${disc.nome || 'N/A'}`;
          doc.text(`${evaluationInfo?.titulo || 'Avaliação'} — ${headerDisc}`, landscapeWidth / 2, DETAIL_BAND_H_DISC / 2 + 1.5, { align: 'center' });

          let y = DETAIL_BAND_H_DISC + 4;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(...COLORS.textGray);
          doc.text(`Escola: ${escolaText}  •  Série: ${serieText || 'N/A'}  •  Turma: ${turmaName}`, landscapeWidth / 2, y, { align: 'center' });
          y += 5;
          doc.setTextColor(...COLORS.textDark);

            const headerRow1 = ['Aluno'];
            const headerRow2 = ['Habilidade'];
            const headerRow3 = ['% Turma'];
            chunk.forEach(q => {
              // Apenas o número (sem prefixo "Q")
              headerRow1.push(`Q\n${q.numero}`);
              const codeDisc = generateHabilidadeCode({
                codigo_habilidade: q.codigo_habilidade,
                numero: q.numero,
              });
              headerRow2.push(codeDisc);
              let correct = 0;
              alunosParticipantes.forEach(s => {
                const r = (s.respostas_por_questao || []).find(rr => rr.questao === q.numero);
                if (r && r.respondeu && r.acertou) correct++;
              });
              headerRow3.push(`${Math.round((correct / denomLocal) * 100)}%`);
            });
            if (isLastChunk) {
              headerRow1.push('Total de acertos', 'Nota', 'Proficiência', 'Nível');
              headerRow2.push('', '', '', '');
              headerRow3.push('', '', '', '');
            }

            const bodyRows: (string | number)[][] = [];
            alunosTurmaDisciplina.forEach(al => {
              const hasAnsweredAny = Array.isArray(al.respostas_por_questao) && al.respostas_por_questao.some(r => r.respondeu);
              if (!hasAnsweredAny) return;
              const row: (string | number)[] = [al.nome];
              chunk.forEach(q => {
                const resp = (al.respostas_por_questao || []).find(r => r.questao === q.numero);
                if (!resp) { row.push(''); return; }
                if (resp.respondeu) {
                  if (resp.acertou) { row.push('\u2713'); }
                  else row.push('\u2717');
                } else row.push('');
              });
              if (isLastChunk) {
                row.push(`${al.total_acertos ?? 0}/${totalQuestoesDisc}`);
                row.push(formatOneDecimalStable(Number(al.nota ?? 0)));
                row.push(Number(al.proficiencia ?? 0).toFixed(1));
                row.push(normalizeProficiencyLevelLabel(al.nivel_proficiencia));
              }
              bodyRows.push(row);
            });

            const availableWidth = landscapeWidth - (2 * landscapeMargin);
            const MIN_NIVEL_WIDTH_MM_DISC = 20;
            const colTotalAcertosDisc = chunk.length > 28 ? 8 : 11;
            const colNotaDisc = chunk.length > 28 ? 8 : 11;
            const colProficienciaDisc = chunk.length > 28 ? 9 : 12;
            const colNivelDisc = Math.max(MIN_NIVEL_WIDTH_MM_DISC, chunk.length > 28 ? 17 : 21);
            const finalColsWidth = isLastChunk ? (colTotalAcertosDisc + colNotaDisc + colProficienciaDisc + colNivelDisc) : 0;

            const numColsDisc = Math.max(1, chunk.length);

            const dynamicFontSize = scaleDetailTableExtra(PDF_BULK_LANDSCAPE_FONT(numColsDisc));
            const bulkPadHDisc = scaleDetailTableExtra(PDF_BULK_LANDSCAPE_CELL_PAD_H(numColsDisc));
            const bulkPadVDisc = scaleDetailTableExtra(PDF_BULK_LANDSCAPE_CELL_PAD_V(numColsDisc));
            const numQuestoesThisChunk = chunk.length;
            const summaryNameFontPt = computePdfSummaryTableBodyFontPt(scalePdfTable, scaleCompactTable);
            const {
              bodyRowHeightMm: bodyRowHeightMmDisc,
              skillRowHMm: SKILL_ROW_H_DISC,
              pctRowHMm: PCT_ROW_H_DISC,
              qHeaderRowHMm: Q_ROW_H_DISC,
              nameBodyFontPt: nameBodyFontDisc,
              namePadVerticalMm: namePadVDisc,
              skillCodeFontSize,
            } = computePdfBulkTableVerticalLayout({
              pageHeightMm: landscapeHeight,
              startYMm: y,
              studentCount: bodyRows.length,
              questionCount: numQuestoesThisChunk,
              dynamicFontSize,
              bulkPadV: bulkPadVDisc,
              rowMinMm: scalePdfTable(2.5),
              nameBodyFontPt: summaryNameFontPt,
              footerReserveMm: 10,
              extraBottomReserveMm: 0,
              scaleDetailTableExtra,
              scalePdfTable,
            });

            // Largura da coluna de nomes baseada no maior nome real
            doc.setFontSize(nameBodyFontDisc);
            doc.setFont('helvetica', 'normal');
            const longestNameMmDisc = alunosTurmaDisciplina.reduce((maxW, al) => {
              const w = doc.getStringUnitWidth(al.nome || '') * nameBodyFontDisc * 0.3528;
              return Math.max(maxW, w);
            }, 0);
            const nameColWidth = Math.min(65, Math.max(20, longestNameMmDisc + 4));

            const spaceForQuestionsDisc = Math.max(0, availableWidth - nameColWidth - finalColsWidth);
            // Colunas estreitas para cabeçalho vertical
            const questionColWidth = spaceForQuestionsDisc / numColsDisc;

            const columnStyles: Record<string, Partial<Styles>> = {
              '0': { cellWidth: nameColWidth, halign: 'left', overflow: 'ellipsize' },
            };
            for (let i = 1; i <= chunk.length; i++) {
              columnStyles[String(i)] = { cellWidth: questionColWidth, halign: 'center' };
            }
            if (isLastChunk) {
              columnStyles[String(chunk.length + 1)] = { cellWidth: colTotalAcertosDisc, halign: 'center' };
              columnStyles[String(chunk.length + 2)] = { cellWidth: colNotaDisc, halign: 'center' };
              columnStyles[String(chunk.length + 3)] = { cellWidth: colProficienciaDisc, halign: 'center' };
              columnStyles[String(chunk.length + 4)] = {
                cellWidth: colNivelDisc,
                halign: 'center',
                overflow: 'ellipsize',
              };
            }
            autoTable(doc, {
              startY: y,
              head: [headerRow1, headerRow2, headerRow3],
              body: bodyRows,
              theme: 'grid',
              margin: { left: landscapeMargin, right: landscapeMargin },
              tableWidth: availableWidth,
              showHead: 'everyPage',
              styles: {
                fontSize: dynamicFontSize,
                cellPadding: { vertical: bulkPadVDisc, horizontal: bulkPadHDisc },
                lineColor: [0, 0, 0],
                lineWidth: 0.25,
                overflow: 'linebreak',
                valign: 'middle',
                halign: 'center'
              },
              headStyles: {
                fillColor: [240, 240, 240],
                textColor: [0, 0, 0],
                fontStyle: 'bold',
                halign: 'center',
                fontSize: dynamicFontSize,
                cellPadding: PDF_BULK_HEAD_CELL_PAD,
              },
              columnStyles: columnStyles,
              bodyStyles: { textColor: [33, 33, 33] },
              alternateRowStyles: { fillColor: [252, 252, 252] },
              didParseCell: (data: CellHookData) => {
                if (data.section === 'body') {
                  data.cell.styles.minCellHeight = bodyRowHeightMmDisc;
                  if (data.column.index === 0) {
                    data.cell.styles.fontSize = nameBodyFontDisc;
                    data.cell.styles.cellPadding = { vertical: namePadVDisc, horizontal: bulkPadHDisc };
                  } else if (data.column.index > numQuestoesThisChunk) {
                    // Colunas de resumo (Total de acertos, Nota, Proficiência, Nível)
                  data.cell.styles.fontSize = scalePdfTable(6);
                    data.cell.styles.fontStyle = 'bold';
                  }
                }
                if (data.section === 'head') {
                  data.cell.styles.cellPadding = PDF_BULK_HEAD_CELL_PAD;
                  if (data.row.index === 0) {
                    data.cell.styles.minCellHeight = Q_ROW_H_DISC;
                    // Número da questão: fonte legível mínima de 6pt
                    data.cell.styles.fontSize = Math.max(scalePdfTable(6), dynamicFontSize);
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.cellPadding = { vertical: scalePdfTable(0.8), horizontal: scalePdfTable(0.5) };
                    if (data.column.index > 0 && data.column.index <= numQuestoesThisChunk) {
                      data.cell.text = [''];
                    }
                  } else if (data.row.index === 1) {
                    data.cell.styles.minCellHeight = SKILL_ROW_H_DISC;
                    data.cell.styles.cellPadding = scalePdfTable(0.5);
                    if (data.column.index === 0) {
                      // Label "Habilidade" na primeira coluna — fonte legível
                      data.cell.styles.fontSize = scalePdfTable(7);
                      data.cell.styles.fontStyle = 'bold';
                      data.cell.styles.valign = 'middle';
                    } else if (data.column.index <= numQuestoesThisChunk) {
                      data.cell.text = [''];
                    }
                  } else if (data.row.index === 2) {
                    data.cell.styles.minCellHeight = PCT_ROW_H_DISC;
                    data.cell.styles.cellPadding = scalePdfTable(0.5);
                    if (data.column.index === 0) {
                      // Label "% Turma" na primeira coluna — fonte legível
                      data.cell.styles.fontSize = scalePdfTable(7);
                      data.cell.styles.fontStyle = 'bold';
                      data.cell.styles.valign = 'middle';
                    } else if (data.column.index <= numQuestoesThisChunk) {
                      data.cell.text = [''];
                    }
                  }
                }
              },
              didDrawCell: (data: CellHookData) => {
                const { doc: d, cell, column, section, row } = data;
                const val = Array.isArray(cell.text) ? cell.text[0] : cell.text;

                if (section === 'body' && column.index > 0 && column.index <= numQuestoesThisChunk) {
                  const markKind = parsePdfAnswerMarkCell(val);
                  if (markKind) {
                    drawPdfAnswerMarkCell(d, cell, markKind);
                  }
                }
                if (isLastChunk && section === 'body' && column.index === chunk.length + 4) {
                  const cellRawNivelDisc = Array.isArray(cell.text) ? cell.text[0] : cell.text;
                  const raw = String(cellRawNivelDisc ?? '').trim();
                  drawProficiencyNivelInPdfCell(
                    d,
                    cell,
                    raw,
                    Math.max(scalePdfTable(4), Math.min(scalePdfTable(5.5), cell.height / 0.3528 * 0.65)),
                    { compact: true }
                  );
                }
                if (section === 'head' && row.index === 0 && column.index > 0 && column.index <= numQuestoesThisChunk) {
                  const qLabel = headerRow1[column.index] || '';
                  drawPdfQuestionHeaderCell(
                    d,
                    cell,
                    qLabel,
                    Math.max(scalePdfTable(6), dynamicFontSize)
                  );
                }
                if (section === 'head' && row.index === 1 && column.index > 0 && column.index <= numQuestoesThisChunk) {
                  const skillCode = formatPdfSkillCodeForHeader(headerRow2[column.index] || '');
                  if (skillCode) {
                    d.setFillColor(...PDF_ANSWER_CELL.skillHeaderBg);
                    d.rect(cell.x, cell.y, cell.width, cell.height, 'F');
                    d.setFontSize(skillCodeFontSize);
                    d.setFont('helvetica', 'bold');
                    d.setTextColor(30, 58, 95);
                    const cx = cell.x + cell.width / 2;
                    const textWidthMm = d.getStringUnitWidth(skillCode) * skillCodeFontSize / d.internal.scaleFactor;
                    const cy = cell.y + (cell.height + textWidthMm) / 2;
                    d.text(skillCode, cx, cy, { angle: 90 });
                    d.setDrawColor(...PDF_ANSWER_CELL.border);
                    d.setLineWidth(0.2);
                    d.rect(cell.x, cell.y, cell.width, cell.height);
                  }
                }
                if (section === 'head' && row.index === 2 && column.index > 0 && column.index <= numQuestoesThisChunk) {
                  const pctText = headerRow3[column.index] || '';
                  const pct = parseInt(pctText.replace(/[^0-9]/g, ''));
                  const isGood = !isNaN(pct) && pct >= 60;
                  const fillRgb = isGood ? PDF_ANSWER_CELL.correctBg : PDF_ANSWER_CELL.incorrectBg;
                  const textRgb = isGood ? PDF_ANSWER_CELL.correctFg : PDF_ANSWER_CELL.incorrectFg;
                  d.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
                  d.rect(cell.x, cell.y, cell.width, cell.height, 'F');
                  if (pctText) {
                    d.setFontSize(scaleDetailTableExtra(scalePdfTable(5)));
                    d.setFont('helvetica', 'bold');
                    d.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
                    const cx = cell.x + cell.width / 2;
                    const cy = cell.y + cell.height - 1;
                    d.text(pctText, cx, cy, { angle: 90 });
                  }
                  d.setDrawColor(...PDF_ANSWER_CELL.border);
                  d.setLineWidth(0.2);
                  d.rect(cell.x, cell.y, cell.width, cell.height);
                }
              },
            });

            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text('Afirme Play Soluções Educativas', landscapeMargin, landscapeHeight - 8);
            doc.text(`Página ${pageCount}`, landscapeWidth / 2, landscapeHeight - 8, { align: 'center' });
            doc.text(new Date().toLocaleString('pt-BR'), landscapeWidth - landscapeMargin, landscapeHeight - 8, { align: 'right' });
        });
      };

      // ====== ESTRUTURA PRINCIPAL: Reorganizar por turma (dados scoped da rota) ======
      let studentsToUse = pdfStudents;
      const tabelaParaUsar = pdfTabela;

      if (studentsToUse.length === 0 && tabelaParaUsar) {
        studentsToUse = mapUnifiedStudents(tabelaParaUsar);
      }

      // Função auxiliar para normalizar nome de turma (case-insensitive, trim)
      const normalizeTurmaName = (nome: string | undefined): string => {
        return (nome || '').trim().toUpperCase();
      };

      // Construir mapa turma -> alunos uma única vez (evita N chamadas a obterTodosAlunosTurma)
      const alunosPorTurmaMap = new Map<string, StudentResult[]>();
      if (tabelaParaUsar) {
        const idsByTurma = new Map<string, Set<string>>();
        const addToMap = (turmaNorm: string, aluno: StudentResult) => {
          if (!turmaNorm) return;
          let list = alunosPorTurmaMap.get(turmaNorm);
          let ids = idsByTurma.get(turmaNorm);
          if (!list) {
            list = [];
            ids = new Set<string>();
            alunosPorTurmaMap.set(turmaNorm, list);
            idsByTurma.set(turmaNorm, ids);
          }
          if (!ids!.has(aluno.id)) {
            ids!.add(aluno.id);
            list.push(aluno);
          }
        };
        tabelaParaUsar.geral?.alunos?.forEach(aluno => {
          const rowId = alunoRowId(aluno);
          if (!rowId) return;
          const turmaNorm = normalizeTurmaName(aluno.turma);
          const totalQuestoes = aluno.total_questoes_geral ?? aluno.total_respondidas_geral ?? 0;
          const totalRespondidas = aluno.total_respondidas_geral ?? totalQuestoes;
          const totalAcertos = aluno.total_acertos_geral ?? 0;
          const totalEmBranco = aluno.total_em_branco_geral ?? Math.max(0, totalQuestoes - totalRespondidas);
          const totalErros = Math.max(0, totalRespondidas - totalAcertos - totalEmBranco);
          const participou =
            totalRespondidas > 0 || totalAcertos > 0 || totalErros > 0 ||
            Number(aluno.nota_geral) > 0 || Number(aluno.proficiencia_geral) > 0 ||
            Boolean(aluno.nivel_proficiencia_geral && String(aluno.nivel_proficiencia_geral).trim());
          addToMap(turmaNorm, {
            id: rowId,
            nome: aluno.nome,
            turma: aluno.turma || '',
            nota: Number(aluno.nota_geral ?? 0),
            proficiencia: Number(aluno.proficiencia_geral ?? 0),
            classificacao: normalizeProficiencyLevelLabel(
              aluno.nivel_proficiencia_geral || aluno.classificacao || ""
            ),
            acertos: totalAcertos,
            erros: totalErros,
            questoes_respondidas: totalRespondidas || totalQuestoes,
            status: participou ? 'concluida' : 'pendente',
            respostas: {}
          });
        });
        tabelaParaUsar.disciplinas?.forEach(disciplina => {
          disciplina.alunos?.forEach(aluno => {
            const rowId = alunoRowId(aluno);
            if (!rowId) return;
            const turmaNorm = normalizeTurmaName(aluno.turma);
            const totalQuestoesDisciplina = aluno.total_questoes_disciplina ?? aluno.respostas_por_questao?.length ?? 0;
            const totalRespondidas = aluno.total_respondidas ?? totalQuestoesDisciplina;
            const totalAcertos = aluno.total_acertos ?? 0;
            const totalEmBranco = Math.max(0, totalQuestoesDisciplina - totalRespondidas);
            const totalErros = aluno.total_erros ?? Math.max(0, totalRespondidas - totalAcertos - totalEmBranco);
            const hasAnsweredAny = Array.isArray(aluno.respostas_por_questao) && aluno.respostas_por_questao.some(r => r.respondeu);
            const summarySemQuestoes =
              !hasAnsweredAny &&
              (Number(aluno.nota) > 0 ||
                Number(aluno.proficiencia) > 0 ||
                Boolean(aluno.classificacao));
            const participou = hasAnsweredAny || summarySemQuestoes;
            addToMap(turmaNorm, {
              id: rowId,
              nome: aluno.nome,
              turma: aluno.turma || '',
              nota: Number(aluno.nota ?? 0),
              proficiencia: Number(aluno.proficiencia ?? 0),
              classificacao: normalizeProficiencyLevelLabel(
                aluno.nivel_proficiencia || aluno.classificacao || ""
              ),
              acertos: totalAcertos,
              erros: totalErros,
              questoes_respondidas: totalRespondidas,
              status: participou ? 'concluida' : 'pendente',
              respostas: {}
            });
          });
        });
      }

      const obterTodosAlunosTurma = (turmaNome: string): StudentResult[] => {
        return alunosPorTurmaMap.get(normalizeTurmaName(turmaNome)) ?? [];
      };

      // Aplicar filtro de turma se uma turma foi selecionada (dados já vêm scoped da API; fallback local)
      if (selectedClassId) {
        const selectedClass = classes.find(c => c.id === selectedClassId);
        if (selectedClass) {
          const turmaSelecionadaNormalizada = normalizeTurmaName(selectedClass.nome);

          // Filtrar com comparação normalizada (otimizado: normalizar uma vez e comparar)
          studentsToUse = studentsToUse.filter(s => {
            const turmaAlunoNormalizada = normalizeTurmaName(s.turma);
            return turmaAlunoNormalizada === turmaSelecionadaNormalizada;
          });

          // Se não encontrou alunos em studentsToUse, buscar TODOS os alunos da turma (incluindo faltosos)
          if (studentsToUse.length === 0 && tabelaParaUsar) {
            studentsToUse = obterTodosAlunosTurma(selectedClass.nome);
          }
        }
      }

      // Não bloquear geração de PDF mesmo se não houver alunos participantes
      // Turmas com todos os alunos faltosos ainda devem aparecer no relatório

      // Agrupar alunos por turma (incluindo turmas com apenas faltosos)
      const turmasMap = new Map<string, StudentResult[]>();
      studentsToUse.forEach(s => {
        const turma = s.turma || 'Sem Turma';
        if (!turmasMap.has(turma)) {
          turmasMap.set(turma, []);
        }
        turmasMap.get(turma)!.push(s);
      });

      // Se uma turma específica foi selecionada e não encontramos alunos em studentsToUse,
      // mas a turma existe na lista de turmas, garantir que ela apareça no relatório
      if (selectedClassId && studentsToUse.length === 0) {
        const selectedClass = classes.find(c => c.id === selectedClassId);
        if (selectedClass && tabelaParaUsar) {
          const alunosTurma = obterTodosAlunosTurma(selectedClass.nome);
          if (alunosTurma.length > 0) {
            studentsToUse = alunosTurma;
            const turma = selectedClass.nome || 'Sem Turma';
            turmasMap.set(turma, alunosTurma);
          }
        }
      }

      // IMPORTANTE: Quando filtro "todos" está ativo, garantir que TODAS as turmas sejam incluídas,
      // mesmo as que têm apenas faltosos (sem participantes)
      if (!selectedClassId && tabelaParaUsar) {
        const todasTurmas = new Set<string>();

        tabelaParaUsar.geral?.alunos?.forEach(aluno => {
          if (aluno.turma) todasTurmas.add(aluno.turma);
        });
        tabelaParaUsar.disciplinas?.forEach(disciplina => {
          disciplina.alunos?.forEach(aluno => {
            if (aluno.turma) todasTurmas.add(aluno.turma);
          });
        });

        // Garantir que todas as turmas estejam no turmasMap
        todasTurmas.forEach(turmaNome => {
          if (!turmasMap.has(turmaNome)) {
            // Se a turma não está no mapa, obter todos os alunos dela (incluindo faltosos)
            const alunosTurma = obterTodosAlunosTurma(turmaNome);
            if (alunosTurma.length > 0) {
              turmasMap.set(turmaNome, alunosTurma);
            } else {
              // Mesmo sem alunos, adicionar a turma vazia para garantir que apareça
              turmasMap.set(turmaNome, []);
            }
          }
        });
      }


      // Ordenar turmas alfabeticamente
      const turmasOrdenadas = Array.from(turmasMap.keys()).sort((a, b) => a.localeCompare(b));

      // Adicionar capa inicial (já em landscape)
      addInitialCover();
      pageCount++;

      // === SEÇÃO GERAL (Todas as Escolas / Turmas) ===
      // Renderiza um consolidado geral se o usuário não filtrou por uma turma específica
      // e há alunos participantes no total.
      const todosAlunosParticipantes = studentsToUse.filter(s => s.status === 'concluida');

      if (!selectedClassId && todosAlunosParticipantes.length > 0 && questoesParaUsar.length > 0) {
        // Adicionar capa da seção Geral
        doc.addPage('landscape');
        pageWidth = doc.internal.pageSize.getWidth();
        pageHeight = doc.internal.pageSize.getHeight();
        doc.setFillColor(...COLORS.white);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        addTurmaCover('VISÃO GERAL (TODAS AS TURMAS)', studentsToUse, questoesParaUsar.length);
        pageCount++;

        // 1. Resumo Geral
        renderSummaryPageForTurma('VISÃO GERAL', todosAlunosParticipantes, true);

        // 2. Gráficos Gerais
        renderChartsForTurma('VISÃO GERAL', todosAlunosParticipantes);

        // 3. Tabela Detalhada Geral
        renderDetailedPageForTurma('GERAL', 'VISÃO GERAL', todosAlunosParticipantes, questoesParaUsar);

        // 4. Resultado por disciplina Geral
        if (tabelaParaUsar && Array.isArray(tabelaParaUsar.disciplinas) && tabelaParaUsar.disciplinas.length > 0) {
          const fakeTurmaName = 'VISÃO GERAL';
          const previousDisciplinas = tabelaParaUsar.disciplinas.map(d => ({
            ...d,
            alunos: d.alunos?.map(a => ({ ...a, originalTurma: a.turma, turma: fakeTurmaName }))
          }));
          const temporarioTabelaDetalhada = { ...tabelaParaUsar, disciplinas: previousDisciplinas };
          const alunosParticipantesCopiados = todosAlunosParticipantes.map(a => ({ ...a, turma: fakeTurmaName }));

          renderDisciplineTablesPagesForTurma(fakeTurmaName, alunosParticipantesCopiados, temporarioTabelaDetalhada as any);
        }
      }

      // Para cada turma, renderizar todas as seções na ordem correta
      // IMPORTANTE: Incluir turmas mesmo quando todos os alunos são faltosos
      turmasOrdenadas.forEach((turmaName, turmaIndex) => {
        const alunosTurma = turmasMap.get(turmaName) || [];
        // Remover verificação que impedia turmas vazias - agora incluímos turmas com todos os alunos faltosos
        // if (alunosTurma.length === 0) return;

        // Filtrar alunos participantes uma única vez
        const alunosParticipantesTurma = alunosTurma.filter(s => s.status === 'concluida');

        // Adicionar capa da turma (em landscape)
        doc.addPage('landscape');
        pageWidth = doc.internal.pageSize.getWidth();
        pageHeight = doc.internal.pageSize.getHeight();
        // Garantir fundo branco limpo na nova página antes de desenhar a capa
        doc.setFillColor(...COLORS.white);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        addTurmaCover(turmaName, alunosTurma, questoesParaUsar.length);
        pageCount++;

        // 1. RELATÓRIO DE DESEMPENHO GERAL (resumo)
        // Renderizar resumo apenas se houver alunos participantes
        if (questoesParaUsar.length > 0 && alunosParticipantesTurma.length > 0) {
          renderSummaryPageForTurma(turmaName, alunosParticipantesTurma, false);
        }

        // 2. VISÃO GRÁFICA DOS RESULTADOS (gráficos)
        // Renderizar gráficos apenas se houver alunos participantes
        if (alunosParticipantesTurma.length > 0) {
          renderChartsForTurma(turmaName, alunosParticipantesTurma);
        }

        // 3. Resultado geral (tabela detalhada landscape)
        // Renderizar apenas se houver alunos participantes
        if (questoesParaUsar.length > 0 && alunosParticipantesTurma.length > 0) {
          renderDetailedPageForTurma('GERAL', turmaName, alunosParticipantesTurma, questoesParaUsar);
        }

        // 4. Resultado por disciplina (tabelas por disciplina)
        // Renderizar apenas se houver alunos participantes
        if (tabelaParaUsar && Array.isArray(tabelaParaUsar.disciplinas) && tabelaParaUsar.disciplinas.length > 0 && alunosParticipantesTurma.length > 0) {
          renderDisciplineTablesPagesForTurma(turmaName, alunosParticipantesTurma);
        }

        // 5. ALUNOS FALTOSOS DA TURMA
        // Renderizar faltosos desta turma específica
        const renderFaltososTurma = () => {
          if (!tabelaParaUsar) return;

          const turmaNormalizada = normalizeTurmaName(turmaName);
          let faltososTurma: Array<{ nome: string; turma: string; escola?: string; serie?: string }> = [];

          const pendentesDetalhe = pdfEstatisticas?.alunos_pendentes_detalhe;
          if (Array.isArray(pendentesDetalhe) && pendentesDetalhe.length > 0) {
            faltososTurma = pendentesDetalhe
              .filter((a) => normalizeTurmaName(a.turma) === turmaNormalizada)
              .map((a) => ({
                nome: a.nome ?? '',
                turma: a.turma ?? turmaName,
                escola: a.escola,
                serie: a.serie,
              }));
          }

          if (faltososTurma.length === 0) {
            const alunosIdsProcessados = new Set<string>();

            tabelaParaUsar.geral?.alunos?.forEach(aluno => {
              const rowId = alunoRowId(aluno);
              if (!rowId || normalizeTurmaName(aluno.turma) !== turmaNormalizada || alunosIdsProcessados.has(rowId)) return;

              const statusGeral = (aluno.status_geral ?? '').toLowerCase();
              const participou = statusGeral === 'concluida';

              if (!participou && aluno.turma) {
                alunosIdsProcessados.add(rowId);
                faltososTurma.push({
                  nome: aluno.nome,
                  turma: aluno.turma,
                  escola: aluno.escola,
                  serie: aluno.serie,
                });
              }
            });

            tabelaParaUsar.disciplinas?.forEach(disciplina => {
              disciplina.alunos?.forEach(aluno => {
                const rowId = alunoRowId(aluno);
                if (!rowId || normalizeTurmaName(aluno.turma) !== turmaNormalizada || alunosIdsProcessados.has(rowId)) return;

                const statusDisc = (aluno.status ?? '').toLowerCase();
                const participou = statusDisc === 'concluida';

                if (!participou && aluno.turma) {
                  alunosIdsProcessados.add(rowId);
                  faltososTurma.push({
                    nome: aluno.nome,
                    turma: aluno.turma,
                    escola: aluno.escola,
                    serie: aluno.serie,
                  });
                }
              });
            });
          }

          if (faltososTurma.length === 0) return;

          // Adicionar capa de faltosos da turma
          doc.addPage('landscape');
          pageCount++;
          pageWidth = doc.internal.pageSize.getWidth();
          pageHeight = doc.internal.pageSize.getHeight();
          addFaltososCover(turmaName, faltososTurma.length, alunosTurma);

          // Nova página para a tabela
          doc.addPage('portrait');
          pageCount++;
          pageWidth = doc.internal.pageSize.getWidth();
          pageHeight = doc.internal.pageSize.getHeight();

          // Faixa compacta de cabeçalho portrait
          const FALT_BAND_H = 26;
          doc.setFillColor(...COLORS.primary);
          doc.rect(0, 0, pageWidth, FALT_BAND_H, 'F');
          if (icoDataUrl && icoWidth > 0 && icoHeight > 0) {
            const lh = 15;
            const lw = (icoWidth * lh) / icoHeight;
            doc.addImage(icoDataUrl, 'PNG', margin, (FALT_BAND_H - lh) / 2, lw, lh);
          } else {
            doc.setFontSize(10);
            doc.setTextColor(...COLORS.white);
            doc.setFont('helvetica', 'bold');
            doc.text('AFIRME PLAY', margin, FALT_BAND_H / 2 + 2);
          }
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(13);
          doc.setTextColor(...COLORS.white);
          doc.text('FALTOSOS / PENDENTES', pageWidth - margin, FALT_BAND_H / 2 + 2, { align: 'right' });

          let y = FALT_BAND_H + 9;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(...COLORS.textGray);
          const metaFaltososTbl = `Escola: ${getPdfEscolaDisplayText()}  •  Série: ${resolveSerieDisplayForPdf(alunosTurma)}  •  Turma: ${turmaName}`;
          const metaFaltososLines = doc.splitTextToSize(metaFaltososTbl, pageWidth - 2 * margin);
          metaFaltososLines.forEach((ln: string, i: number) => {
            doc.text(ln, pageWidth / 2, y + i * 4.6, { align: 'center' });
          });
          y += metaFaltososLines.length * 4.6 + 4;
          doc.setTextColor(0, 0, 0);

          // Preparar dados da tabela
          const bodyRows: string[][] = faltososTurma
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
            .map((faltoso) => [
              faltoso.nome,
              formatAlunoEscolaTurmaSerie(faltoso),
              'Pendente',
            ]);

          // Gerar tabela (colunas: Nome | localização | Situação — como modal AnswerSheetResults)
          autoTable(doc, {
            startY: y,
            head: [['Nome do aluno', 'Escola · Turma · Série', 'Situação']],
            body: bodyRows,
            theme: 'grid',
            margin: { left: margin, right: margin },
            styles: {
              fontSize: scaleCompactTable(scalePdfTable(17)),
              cellPadding: scaleCompactTable(scalePdfTable(2.7)),
              minCellHeight: scaleCompactTable(scalePdfTable(8.2)),
              lineColor: [200, 200, 200],
              lineWidth: 0.1,
              valign: 'middle',
            },
            headStyles: {
              fillColor: COLORS.primary,
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              halign: 'center',
              fontSize: scaleCompactTable(scalePdfTable(17)),
              cellPadding: scaleCompactTable(scalePdfTable(2.7)),
            },
            bodyStyles: { textColor: [33, 33, 33] },
            alternateRowStyles: { fillColor: [250, 250, 250] },
            columnStyles: {
              0: { halign: 'left', cellWidth: (pageWidth - 2 * margin) * 0.37 },
              1: { halign: 'left', cellWidth: (pageWidth - 2 * margin) * 0.44 },
              2: { halign: 'center', cellWidth: (pageWidth - 2 * margin) * 0.19 }
            }
          });

          // Rodapé
          addFooter(pageCount);
        };

        // Renderizar faltosos desta turma
        renderFaltososTurma();
      });


      // Salvar PDF
      const fileName = `relatorio-${evaluationInfo.titulo?.replace(/[^a-zA-Z0-9]/g, '-') || 'avaliacao'}-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      toast({ title: 'PDF gerado com sucesso!', description: `Relatório salvo como ${fileName}` });

    } catch (error) {
      toast({ title: 'Erro ao gerar PDF', description: 'Não foi possível gerar o relatório', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-6">
      {!hidePageHeading && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
              <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 shrink-0" />
              Acerto e Níveis
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Selecione estado, município e avaliação para ver resultados e exportar o PDF consolidado.
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
      )}

      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
          <CardDescription>
            Estado, município e avaliação são obrigatórios. Escola, série e turma refinam o recorte.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-visible">
          {/* Filtros Principais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 w-full min-w-0">
            <div>
              <div className="text-sm font-medium mb-2 flex items-center gap-2">
                Estado
                {userHierarchyContext?.restrictions.canSelectState === false && (
                  <Badge variant="secondary" className="text-xs">Pré-selecionado</Badge>
                )}
              </div>
              <Select
                value={selectedState}
                onValueChange={handleChangeState}
                disabled={isLoading || userHierarchyContext?.restrictions.canSelectState === false}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um estado" />
                </SelectTrigger>
                <SelectContent>
                  {states.map(st => (
                    <SelectItem key={st.id} value={st.id}>{st.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-sm font-medium mb-2 flex items-center gap-2">
                Município
                {userHierarchyContext?.restrictions.canSelectMunicipality === false && (
                  <Badge variant="secondary" className="text-xs">Pré-selecionado</Badge>
                )}
              </div>
              <Select
                value={selectedMunicipality}
                onValueChange={handleChangeMunicipality}
                disabled={isLoading || !selectedState || userHierarchyContext?.restrictions.canSelectMunicipality === false}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={selectedState ? "Selecione um município" : "Primeiro selecione um estado"} />
                </SelectTrigger>
                <SelectContent>
                  {municipalities.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ResultsPeriodMonthYearPicker
              value={selectedPeriod}
              onChange={setSelectedPeriod}
              disabled={isLoading || !selectedMunicipality}
            />
            <EvaluationInstrumentPicker
              label="Avaliação"
              estado={selectedState}
              municipio={selectedMunicipality}
              value={selectedEvaluationId}
              onChange={handleSelectEvaluation}
              cityId={adminCityIdQuery}
              periodo={periodoYmRelatorio}
              estadoLabel={states.find((s) => s.id === selectedState)?.nome}
              municipioLabel={municipalities.find((m) => m.id === selectedMunicipality)?.nome}
              periodoLabel={periodoYmRelatorio}
              disabled={!selectedMunicipality}
              loading={isLoading}
              placeholder={
                selectedMunicipality ? "Selecione uma avaliação" : "Primeiro selecione um município"
              }
            />
          </div>

          {/* Filtros Específicos (apenas quando avaliação selecionada) */}
          {selectedEvaluationId && (
            <div className="border-t pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Filtros Específicos</h3>
                {(selectedSchoolId || selectedGradeId || selectedClassId) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={async () => {
                      setSelectedSchoolId("");
                      setSelectedGradeId("");
                      setSelectedClassId("");
                      setGrades([]);
                      setClasses([]);

                      if (!selectedEvaluationId) return;
                      try {
                        setIsLoading(true);
                        const dataResult = await fetchEvaluationData(selectedEvaluationId);
                        applyFetchResult(dataResult, { updateBaseCache: true });
                      } catch {
                        toast({ title: "Erro", description: "Não foi possível recarregar os dados", variant: "destructive" });
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                  >
                    Limpar Filtros
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-sm font-medium mb-2 flex items-center gap-2">
                    Escola
                    {userHierarchyContext?.restrictions.canSelectSchool === false && (
                      <Badge variant="secondary" className="text-xs">Pré-selecionado</Badge>
                    )}
                  </div>
                  <Select
                    value={selectedSchoolId || "all"}
                    onValueChange={(value) => handleSelectSchool(value === "all" ? "" : value)}
                    disabled={!selectedEvaluationId || isLoadingSchools || userHierarchyContext?.restrictions.canSelectSchool === false}
                  >
                    <SelectTrigger className="w-full">
                      {isLoadingSchools && selectedEvaluationId ? (
                        <div className="flex items-center gap-2 text-muted-foreground w-full">
                          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                          <span className="truncate">Carregando escolas...</span>
                        </div>
                      ) : (
                        <SelectValue
                          placeholder={
                            selectedEvaluationId
                              ? "Todas as escolas"
                              : "Primeiro selecione uma avaliação"
                          }
                        />
                      )}
                    </SelectTrigger>
                    {!isLoadingSchools && (
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {schools.map(sc => (
                          <SelectItem key={sc.id} value={sc.id}>{sc.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    )}
                  </Select>
                </div>
                <div>
                  <div className="text-sm font-medium mb-2">Série</div>
                  <Select value={selectedGradeId || "all"} onValueChange={(value) => handleSelectGrade(value === "all" ? "" : value)} disabled={!selectedSchoolId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={selectedSchoolId ? "Todas as séries" : "Primeiro selecione uma escola"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {grades.map(gr => (
                        <SelectItem key={gr.id} value={gr.id}>{gr.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="text-sm font-medium mb-2">Turma</div>
                  <Select value={selectedClassId || "all"} onValueChange={(value) => handleSelectClass(value === "all" ? "" : value)} disabled={!selectedGradeId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={selectedGradeId ? "Todas as turmas" : "Primeiro selecione uma série"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {classes.map(cls => (
                        <SelectItem key={cls.id} value={cls.id}>{cls.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-400 text-sm leading-relaxed">
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full mt-2 shrink-0" />
              <div>
                <span className="font-semibold">Ordem dos filtros:</span> Estado → Município → Avaliação → Escola →
                Série → Turma. Escola, série e turma são opcionais para refinar os resultados.
              </div>
            </div>
          </div>

          {/* Botão de Geração */}
          <div className="mt-6 flex flex-col items-end gap-2">
            {user?.role === "professor" && !selectedClassId && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Selecione uma turma para imprimir o relatório.
              </p>
            )}
            <Button
              onClick={handleGeneratePDF}
              disabled={
                !selectedEvaluationId ||
                isLoading ||
                (!allTabelaDetalhada && !detailedReport && allStudents.length === 0) ||
                (user?.role === "professor" && !selectedClassId)
              }
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Gerar Relatório PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {evaluationInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full"></div>
              Resumo da avaliação
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Informações Básicas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-6">
              <div className="p-3 bg-muted rounded-lg">
                <span className="text-muted-foreground text-xs uppercase tracking-wide">Avaliação</span>
                <div className="font-semibold text-foreground mt-1">{evaluationInfo.titulo}</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <span className="text-muted-foreground text-xs uppercase tracking-wide">Escola</span>
                <div className="font-semibold text-foreground mt-1">
                  {selectedSchoolId ? schools.find(s => s.id === selectedSchoolId)?.nome || 'Escola Selecionada' : 'Todas as Escolas'}
                </div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <span className="text-muted-foreground text-xs uppercase tracking-wide">Município</span>
                <div className="font-semibold text-foreground mt-1">{evaluationInfo.municipio}</div>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <span className="text-muted-foreground text-xs uppercase tracking-wide">Série</span>
                <div className="font-semibold text-foreground mt-1">
                  {estatisticasGerais?.serie ||
                    (opcoesProximosFiltros?.series?.length === 1
                      ? ((r: { nome?: string; name?: string }) => r.nome ?? r.name)(
                          opcoesProximosFiltros.series[0] as { nome?: string; name?: string }
                        )
                      : null) ||
                    evaluationInfo?.serie ||
                    (selectedGradeId ? grades.find(g => g.id === selectedGradeId)?.nome : null) ||
                    'Série não informada'}
                </div>
              </div>
            </div>

            {/* Estatísticas da Avaliação — único bloco de cards (sem repetir Informações Gerais) */}
            {(detailedReport || students.length > 0 || estatisticasGerais || isLoadingResumoStats) && (
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Estatísticas da avaliação</h3>
                <div className="relative min-h-[7rem]">
                  <div
                    className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4 transition-opacity ${
                      isLoadingResumoStats ? "opacity-40 pointer-events-none" : ""
                    }`}
                  >
                  <div className="text-center p-4 bg-slate-50 dark:bg-slate-900/40 rounded-lg">
                    <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                      {totalQuestoesFromTabela || detailedReport?.questoes?.length || 0}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">Total de Questões</div>
                  </div>
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {resumoStats.totalAlunos}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">Total de Alunos</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 dark:bg-green-950/30 rounded-lg">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {resumoStats.participantes}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">Participantes</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 dark:bg-red-950/30 rounded-lg">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {resumoStats.faltosos}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">Faltosos</div>
                  </div>
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {resumoStats.taxaParticipacao}%
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">Taxa de Participação</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {resumoStats.mediaNota.toFixed(1)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">Nota Geral</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {resumoStats.mediaProficiencia.toFixed(1)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">Proficiência</div>
                  </div>
                  </div>
                  {isLoadingResumoStats && (
                    <div
                      className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/50 backdrop-blur-[1px]"
                      aria-live="polite"
                      aria-busy="true"
                    >
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                        <span className="text-sm font-medium">Atualizando estatísticas...</span>
                      </div>
                    </div>
                  )}
                </div>

                {(selectedSchoolId || selectedGradeId || selectedClassId) && (
                  <div className="mt-6 p-4 bg-muted rounded-lg">
                    <h4 className="font-medium text-foreground mb-2">Filtros Aplicados:</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedSchoolId && (
                        <Badge variant="secondary" className="text-xs">
                          Escola: {schools.find(s => s.id === selectedSchoolId)?.nome || 'Selecionada'}
                        </Badge>
                      )}
                      {selectedGradeId && (
                        <Badge variant="secondary" className="text-xs">
                          Série: {grades.find(g => g.id === selectedGradeId)?.nome || 'Selecionada'}
                        </Badge>
                      )}
                      {selectedClassId && (
                        <Badge variant="secondary" className="text-xs">
                          Turma: {classes.find(c => c.id === selectedClassId)?.nome || 'Selecionada'}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

