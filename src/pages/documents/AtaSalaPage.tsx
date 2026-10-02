import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ClipboardList, Download, Eye, FileText, Filter, List, Loader2, Plus, Printer, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AtaSalaSavedList } from "@/components/documents/AtaSalaSavedList";
import { useToast } from "@/hooks/use-toast";
import {
  createSavedAta,
  getAtaSalaApiError,
  getSavedAta,
  updateSavedAta,
} from "@/services/documents/ataSalaApi";
import type { AtaAssinaturaPessoa, AtaOptions, AtaSalaPdfData, AtaSalaSavePayload } from "@/types/ata-sala";
import { FormFiltersApiService } from "@/services/formFiltersApi";
import {
  getListaFrequenciaPorAvaliacao,
  getListaFrequenciaPorAvaliacaoTodasTurmas,
  getListaFrequenciaPorGabarito,
  getListaFrequenciaPorGabaritoTodasTurmas,
  getListaFrequenciaPorTurma,
} from "@/services/listaFrequenciaApi";
import type { ListaFrequenciaResponse } from "@/types/lista-frequencia";
import {
  EvaluationResultsApiService,
  REPORT_ENTITY_TYPE_ANSWER_SHEET,
} from "@/services/evaluation/evaluationResultsApi";
import { EvaluationInstrumentPicker } from "@/components/filters";
import {
  buildAtaSalaHierarchyPath,
  createAtaSalaPdfBlob,
  downloadAtaSalaPdf,
  previewAtaSalaPdf,
  printAtaSalaPdf,
} from "@/services/reports/ataSalaPdf";
import { ROSTER_CHANGED_EVENT } from "@/lib/rosterEvents";
import { getSerieTurmaDisplay } from "@/services/reports/listaFrequenciaPdf";
import { downloadBlob, generateZipBlob } from "@/services/reports/hierarchicalDownload";

type Option = { id: string; name: string };
type SerieOption = Option & { educationStageId?: string; educationStageName?: string };
type Mode = "turma" | "avaliacao" | "cartao_resposta";
type EvaluationOption = { id: string; titulo: string; disciplina?: string; disciplinas?: string[] };

/** Cursos canônicos associados às séries no sistema. */
const ATA_CURSO_OPTIONS: Option[] = [
  { id: "anos-iniciais", name: "Anos Iniciais" },
  { id: "anos-finais", name: "Anos Finais" },
  { id: "ensino-medio", name: "Ensino Médio" },
];

/** Turnos da ata (mesmo padrão de Etiquetas / criação de turma). */
const ATA_TURNO_OPTIONS: Option[] = [
  { id: "MATUTINO", name: "Matutino" },
  { id: "VESPERTINO", name: "Vespertino" },
  { id: "NOTURNO", name: "Noturno" },
];

/** Mapeamento série → curso já usado em relatórios (ex.: consolidado / proficiência). */
const GRADE_TO_COURSE: Record<string, string> = {
  "Grupo 3": "Anos Iniciais",
  "Grupo 4": "Anos Iniciais",
  "Grupo 5": "Anos Iniciais",
  "1º Ano": "Anos Iniciais",
  "2º Ano": "Anos Iniciais",
  "3º Ano": "Anos Iniciais",
  "4º Ano": "Anos Iniciais",
  "5º Ano": "Anos Iniciais",
  "6º Ano": "Anos Finais",
  "7º Ano": "Anos Finais",
  "8º Ano": "Anos Finais",
  "9º Ano": "Anos Finais",
  "1º Ano EM": "Ensino Médio",
  "2º Ano EM": "Ensino Médio",
  "3º Ano EM": "Ensino Médio",
};

/** Itens 7–12 do modelo oficial: dois dígitos numéricos (0 a 99) por pergunta. */
const Q712_MAX_DIGITS = 2;

type Q712Field =
  | "q7Responded"
  | "q8NotResponded"
  | "q9Tablets"
  | "q10SpecialStayed"
  | "q11SpecialRegularRoom"
  | "q12SpecialSupportRoom";

function digitsOnlyMax2(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, Q712_MAX_DIGITS);
}

/** Data da ata: ano permitido e dia coerente com mês/ano (incl. fevereiro bissexto). */
const ATA_YEAR_MIN = 2026;
const ATA_YEAR_MAX = 2050;

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(month: number, year: number): number {
  if (month < 1 || month > 12) return 31;
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1];
}

function maxDayForMonthYear(monthStr: string, yearStr: string): number {
  const m = parseInt(monthStr, 10);
  if (!Number.isFinite(m) || m < 1 || m > 12) return 31;
  if (yearStr.length !== 4) {
    if (m === 2) return 29;
    if ([4, 6, 9, 11].includes(m)) return 30;
    return 31;
  }
  let y = parseInt(yearStr, 10);
  if (!Number.isFinite(y)) return 31;
  y = Math.min(ATA_YEAR_MAX, Math.max(ATA_YEAR_MIN, y));
  return daysInMonth(m, y);
}

function sanitizeAtaYear(rawDigits: string): string {
  const d = rawDigits.slice(0, 4);
  if (d.length < 4) return d;
  let y = parseInt(d, 10);
  if (!Number.isFinite(y)) return String(ATA_YEAR_MIN);
  if (y < ATA_YEAR_MIN) y = ATA_YEAR_MIN;
  if (y > ATA_YEAR_MAX) y = ATA_YEAR_MAX;
  return String(y);
}

function sanitizeAtaMonth(rawDigits: string): string {
  const d = rawDigits.slice(0, 2);
  if (d.length === 0) return "";
  if (d.length === 1) {
    const c = d[0];
    if (c === "0" || c === "1") return d;
    if (c >= "2" && c <= "9") return `0${c}`;
    return "";
  }
  let m = parseInt(d, 10);
  if (!Number.isFinite(m) || m < 1) return "01";
  if (m > 12) return "12";
  return String(m).padStart(2, "0");
}

function sanitizeAtaDay(rawDigits: string, monthStr: string, yearStr: string): string {
  const d = rawDigits.slice(0, 2);
  if (d.length === 0) return "";
  if (d.length === 1) {
    const c = d[0];
    if (c === "0") return d;
    if (c >= "1" && c <= "9") return d;
    return "";
  }
  const day = parseInt(d, 10);
  const maxD = maxDayForMonthYear(monthStr, yearStr);
  if (!Number.isFinite(day) || day < 1) return "01";
  if (day > maxD) return String(maxD).padStart(2, "0");
  return String(day).padStart(2, "0");
}

const DEFAULT_OPTIONS: AtaOptions = {
  applicationDayLabel: "1º dia de aplicação",
  dateDay: "",
  dateMonth: "",
  dateYear: "",
  startHour: "",
  startMinute: "",
  endHour: "",
  endMinute: "",
  didNotOccurReason: "",
  occurrenceA: false,
  occurrenceB: false,
  occurrenceC: false,
  occurrenceD: false,
  occurrenceE: false,
  occurrenceDetail5: "",
  noOccurrences: false,
  occurrenceDetail6: "",
  q7Responded: "",
  q8NotResponded: "",
  q9Tablets: "",
  q10SpecialStayed: "",
  q11SpecialRegularRoom: "",
  q12SpecialSupportRoom: "",
  assinaturaAplicador: "",
  cpfAplicador: "",
  assinaturaApoioRegular: "",
  cpfApoioRegular: "",
  apoiosRegularExtras: [],
  assinaturaApoioSuporte: "",
  cpfApoioSuporte: "",
  apoiosSuporteExtras: [],
};

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[°º]/g, "o")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findOptionName(raw: string, options: Option[]): string {
  const key = normalizeKey(raw);
  if (!key) return "";
  const exact = options.find((item) => normalizeKey(item.name) === key);
  if (exact) return exact.name;
  const partial = options.filter((item) => {
    const name = normalizeKey(item.name);
    return name.includes(key) || key.includes(name);
  });
  return partial.length === 1 ? partial[0].name : "";
}

function inferCursoFromSerieName(serieName: string): string {
  const raw = (serieName || "").trim();
  if (!raw) return "";
  if (GRADE_TO_COURSE[raw]) return GRADE_TO_COURSE[raw];

  const key = normalizeKey(raw);
  for (const [grade, course] of Object.entries(GRADE_TO_COURSE)) {
    const gradeKey = normalizeKey(grade);
    if (key === gradeKey || key.includes(gradeKey)) return course;
  }

  if (key.includes("ensino medio") || /(^|\s)em(\s|$)/.test(key)) return "Ensino Médio";
  if (key.includes("anos finais") || /\b(6|7|8|9)\b/.test(key)) return "Anos Finais";
  if (key.includes("anos iniciais") || key.includes("grupo") || /\b(1|2|3|4|5)\b/.test(key)) {
    return "Anos Iniciais";
  }
  return "";
}

function normalizeAtaDisciplina(raw: string): string {
  const key = normalizeKey(raw);
  if (!key) return "";
  if (key.includes("geral") || key === "todas") return "Geral";
  if (key.includes("matem")) return "Matemática";
  if (key.includes("portug") || key.includes("lingua") || key === "lp") return "Português";
  return raw.trim();
}

function parseDisciplinaList(raw: string): string[] {
  return String(raw || "")
    .split(/\s*(?:\/|,|·|;|\||\be\b)\s*/i)
    .map((part) => normalizeAtaDisciplina(part))
    .filter(Boolean);
}

function formatDisciplinaList(names: string[]): string {
  return names.map((name) => name.trim()).filter(Boolean).join(" / ");
}

function uniqueDisciplineOptions(items: Array<{ id?: string; name: string }>): Option[] {
  const seen = new Set<string>();
  const out: Option[] = [];
  for (const item of items) {
    const name = item.name.trim();
    if (!name) continue;
    const key = normalizeKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: item.id?.trim() || key, name });
  }
  return out;
}

function normalizeAtaTurno(raw: string): string {
  const key = normalizeKey(raw);
  if (!key) return "";
  if (key.includes("matut") || key.includes("manha") || key === "morning") return "Matutino";
  if (key.includes("vespert") || key.includes("tarde") || key === "afternoon") return "Vespertino";
  if (key.includes("noturn") || key.includes("noite") || key === "evening") return "Noturno";
  return findOptionName(raw, ATA_TURNO_OPTIONS);
}

function withSignatureLists(options: AtaOptions): AtaOptions {
  return {
    ...options,
    apoiosRegularExtras: Array.isArray(options.apoiosRegularExtras) ? options.apoiosRegularExtras : [],
    apoiosSuporteExtras: Array.isArray(options.apoiosSuporteExtras) ? options.apoiosSuporteExtras : [],
  };
}

function countByStatus(data: ListaFrequenciaResponse | null, status: string): number {
  if (!data) return 0;
  return data.estudantes.filter((s) => (s.status || "").toUpperCase() === status).length;
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function isValidCpf(value: string): boolean {
  const cpf = normalizeDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(cpf[i]) * (10 - i);
  }
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(cpf[i]) * (11 - i);
  }
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  return digit === Number(cpf[10]);
}

/** Mantém seleção ao recarregar opções do filtro pai (ex.: hidratar ata salva). */
function preserveFilterSelection(prev: string, options: { id: string }[]): string {
  if (prev && prev !== "all" && options.some((o) => o.id === prev)) {
    return prev;
  }
  return "all";
}

export default function AtaSalaPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeId } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const hydratingRef = useRef(false);
  const listaRequestRef = useRef(0);
  const listaLoadedRef = useRef(false);
  const loadListaRef = useRef<(() => Promise<ListaFrequenciaResponse[] | null>) | null>(null);

  const activeTab = searchParams.get("tab") === "salvas" && !routeId ? "salvas" : "editor";
  const editingId = routeId || null;

  const [savedMeta, setSavedMeta] = useState<{ created_by_name: string; is_owner: boolean } | null>(null);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveAsNew, setSaveAsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [listRefreshToken, setListRefreshToken] = useState(0);

  const [estados, setEstados] = useState<Option[]>([]);
  const [municipios, setMunicipios] = useState<Option[]>([]);
  const [schools, setSchools] = useState<Option[]>([]);
  const [series, setSeries] = useState<SerieOption[]>([]);
  const [turmas, setTurmas] = useState<Option[]>([]);

  const [selectedEstado, setSelectedEstado] = useState("all");
  const [selectedMunicipio, setSelectedMunicipio] = useState("all");
  const [selectedSchool, setSelectedSchool] = useState("all");
  const [selectedSerie, setSelectedSerie] = useState("all");
  const [selectedTurma, setSelectedTurma] = useState("all");
  const [modoLista, setModoLista] = useState<Mode>("turma");
  const [avaliacoes, setAvaliacoes] = useState<EvaluationOption[]>([]);
  const [selectedAvaliacaoId, setSelectedAvaliacaoId] = useState("all");
  const [turmasAvaliacao, setTurmasAvaliacao] = useState<Option[]>([]);

  const [loading, setLoading] = useState({
    estados: false,
    municipios: false,
    escolas: false,
    series: false,
    turmas: false,
    disciplinas: false,
    avaliacoes: false,
    turmasAvaliacao: false,
    lista: false,
    pdf: false,
  });

  const [error, setError] = useState<string | null>(null);

  const [nomeAvaliacao, setNomeAvaliacao] = useState("NOME DA AVALIAÇÃO");
  const [cursoLabel, setCursoLabel] = useState("");
  const [municipioUf, setMunicipioUf] = useState("");
  const [rede, setRede] = useState("MUNICIPAL");
  const [escola, setEscola] = useState("");
  const [serieTurma, setSerieTurma] = useState("");
  const [turno, setTurno] = useState("");
  const [selectedDisciplinas, setSelectedDisciplinas] = useState<string[]>([]);
  const [disciplinasDisponiveis, setDisciplinasDisponiveis] = useState<Option[]>([]);

  const [options, setOptions] = useState<AtaOptions>(DEFAULT_OPTIONS);
  const isModoAplicada = modoLista === "avaliacao" || modoLista === "cartao_resposta";
  const labelItemAplicado = modoLista === "cartao_resposta" ? "Cartão resposta" : "Avaliação";
  const disciplina = formatDisciplinaList(selectedDisciplinas);

  useEffect(() => {
    let cancelled = false;
    setLoading((s) => ({ ...s, estados: true }));
    FormFiltersApiService.getFormFilterStates()
      .then((list) => {
        if (cancelled) return;
        setEstados(list.map((e) => ({ id: e.id, name: e.nome })));
      })
      .finally(() => {
        if (!cancelled) setLoading((s) => ({ ...s, estados: false }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedEstado || selectedEstado === "all") {
      setMunicipios([]);
      setSelectedMunicipio("all");
      setSchools([]);
      setSelectedSchool("all");
      setSeries([]);
      setSelectedSerie("all");
      setTurmas([]);
      setSelectedTurma("all");
      return;
    }
    let cancelled = false;
    setLoading((s) => ({ ...s, municipios: true }));
    FormFiltersApiService.getFormFilterMunicipalities(selectedEstado)
      .then((list) => {
        if (cancelled) return;
        const mapped = list.map((m) => ({ id: m.id, name: m.nome }));
        setMunicipios(mapped);
        setSelectedMunicipio((prev) => preserveFilterSelection(prev, mapped));
      })
      .finally(() => {
        if (!cancelled) setLoading((s) => ({ ...s, municipios: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEstado]);

  useEffect(() => {
    if (!selectedMunicipio || selectedMunicipio === "all" || !selectedEstado || selectedEstado === "all") {
      setSchools([]);
      setSelectedSchool("all");
      setSeries([]);
      setSelectedSerie("all");
      setTurmas([]);
      setSelectedTurma("all");
      return;
    }
    let cancelled = false;
    setLoading((s) => ({ ...s, escolas: true }));
    FormFiltersApiService.getFormFilterSchools({ estado: selectedEstado, municipio: selectedMunicipio })
      .then((list) => {
        if (cancelled) return;
        const mapped = list.map((s) => ({ id: s.id, name: s.nome }));
        setSchools(mapped);
        setSelectedSchool((prev) => preserveFilterSelection(prev, mapped));
      })
      .finally(() => {
        if (!cancelled) setLoading((s) => ({ ...s, escolas: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMunicipio, selectedEstado]);

  useEffect(() => {
    if (
      !selectedSchool ||
      selectedSchool === "all" ||
      !selectedMunicipio ||
      selectedMunicipio === "all" ||
      !selectedEstado ||
      selectedEstado === "all"
    ) {
      setSeries([]);
      setSelectedSerie("all");
      setTurmas([]);
      setSelectedTurma("all");
      return;
    }
    let cancelled = false;
    setLoading((s) => ({ ...s, series: true }));
    FormFiltersApiService.getFormFilterGrades({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      escola: selectedSchool,
    })
      .then((list) => {
        if (cancelled) return;
        const mapped = list.map((s) => ({
          id: s.id,
          name: s.nome,
          educationStageId: s.education_stage_id || s.educationStageId || "",
          educationStageName: s.education_stage_name || "",
        }));
        setSeries(mapped);
        setSelectedSerie((prev) => preserveFilterSelection(prev, mapped));
      })
      .finally(() => {
        if (!cancelled) setLoading((s) => ({ ...s, series: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSchool, selectedMunicipio, selectedEstado]);

  useEffect(() => {
    if (
      !selectedSerie ||
      selectedSerie === "all" ||
      !selectedSchool ||
      selectedSchool === "all" ||
      !selectedMunicipio ||
      selectedMunicipio === "all" ||
      !selectedEstado ||
      selectedEstado === "all"
    ) {
      setTurmas([]);
      setSelectedTurma("all");
      return;
    }
    let cancelled = false;
    setLoading((s) => ({ ...s, turmas: true }));
    FormFiltersApiService.getFormFilterClasses({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      escola: selectedSchool,
      serie: selectedSerie,
    })
      .then((list) => {
        if (cancelled) return;
        const mapped = list.map((t) => ({ id: t.id, name: t.nome }));
        setTurmas(mapped);
        setSelectedTurma((prev) => preserveFilterSelection(prev, mapped));
      })
      .finally(() => {
        if (!cancelled) setLoading((s) => ({ ...s, turmas: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSerie, selectedSchool, selectedMunicipio, selectedEstado]);

  useEffect(() => {
    if (hydratingRef.current) return;
    setSelectedAvaliacaoId("all");
    setAvaliacoes([]);
    setTurmasAvaliacao([]);
    setSelectedTurma("all");
  }, [modoLista]);

  useEffect(() => {
    if (!isModoAplicada) {
      setAvaliacoes([]);
      setSelectedAvaliacaoId("all");
      return;
    }
    if (
      !selectedEstado ||
      selectedEstado === "all" ||
      !selectedMunicipio ||
      selectedMunicipio === "all"
    ) {
      setAvaliacoes([]);
      setSelectedAvaliacaoId("all");
      return;
    }
    let cancelled = false;
    setLoading((s) => ({ ...s, avaliacoes: true }));
    EvaluationResultsApiService.getFilterEvaluations({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      escola: selectedSchool !== "all" ? selectedSchool : undefined,
      ...(modoLista === "cartao_resposta" ? { report_entity_type: REPORT_ENTITY_TYPE_ANSWER_SHEET } : {}),
    })
      .then((items) => {
        if (cancelled) return;
        setAvaliacoes(
          (items ?? []).map((a) => ({
            id: a.id,
            titulo: a.titulo || a.id,
            disciplina: a.disciplina || "",
            disciplinas: a.disciplinas?.length
              ? a.disciplinas
              : a.disciplina
                ? [a.disciplina]
                : [],
          }))
        );
      })
      .finally(() => {
        if (!cancelled) setLoading((s) => ({ ...s, avaliacoes: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [isModoAplicada, modoLista, selectedEstado, selectedMunicipio, selectedSchool]);

  useEffect(() => {
    if (!isModoAplicada || !selectedAvaliacaoId || selectedAvaliacaoId === "all") {
      setTurmasAvaliacao([]);
      if (isModoAplicada) setSelectedTurma("all");
      return;
    }
    if (
      !selectedEstado ||
      selectedEstado === "all" ||
      !selectedMunicipio ||
      selectedMunicipio === "all" ||
      !selectedSchool ||
      selectedSchool === "all" ||
      !selectedSerie ||
      selectedSerie === "all"
    ) {
      setTurmasAvaliacao([]);
      setSelectedTurma("all");
      return;
    }
    let cancelled = false;
    setLoading((s) => ({ ...s, turmasAvaliacao: true }));
    EvaluationResultsApiService.getFilterClassesByEvaluation({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      avaliacao: selectedAvaliacaoId,
      escola: selectedSchool !== "all" ? selectedSchool : undefined,
      serie: selectedSerie !== "all" ? selectedSerie : undefined,
      ...(modoLista === "cartao_resposta" ? { report_entity_type: REPORT_ENTITY_TYPE_ANSWER_SHEET } : {}),
    })
      .then((list) => {
        if (cancelled) return;
        const mapped = (list ?? []).map((t) => ({ id: t.id, name: t.nome || t.id }));
        setTurmasAvaliacao(mapped);
        const stillExists = selectedTurma === "all" || mapped.some((t) => t.id === selectedTurma);
        if (!stillExists) setSelectedTurma("all");
      })
      .finally(() => {
        if (!cancelled) setLoading((s) => ({ ...s, turmasAvaliacao: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [
    isModoAplicada,
    modoLista,
    selectedAvaliacaoId,
    selectedEstado,
    selectedMunicipio,
    selectedSchool,
    selectedSerie,
    selectedTurma,
  ]);

  const selectedMunicipioLabel = useMemo(
    () => municipios.find((m) => m.id === selectedMunicipio)?.name || "",
    [municipios, selectedMunicipio]
  );
  const selectedEstadoLabel = useMemo(
    () => estados.find((s) => s.id === selectedEstado)?.name || "",
    [estados, selectedEstado]
  );
  const selectedSchoolLabel = useMemo(
    () => schools.find((s) => s.id === selectedSchool)?.name || "",
    [schools, selectedSchool]
  );
  const selectedSerieLabel = useMemo(
    () => series.find((s) => s.id === selectedSerie)?.name || "",
    [series, selectedSerie]
  );
  const selectedTurmaLabel = useMemo(
    () => (isModoAplicada ? turmasAvaliacao : turmas).find((t) => t.id === selectedTurma)?.name || "",
    [isModoAplicada, turmasAvaliacao, turmas, selectedTurma]
  );
  const selectedAvaliacaoTitulo = useMemo(
    () => avaliacoes.find((a) => a.id === selectedAvaliacaoId)?.titulo || "",
    [avaliacoes, selectedAvaliacaoId]
  );
  const hasContextForAta = selectedEstado !== "all" && selectedMunicipio !== "all";
  const turmaOptions = isModoAplicada ? turmasAvaliacao : turmas;
  useEffect(() => {
    if (!selectedMunicipioLabel && !selectedEstadoLabel) {
      setMunicipioUf("");
      return;
    }
    const uf = selectedEstadoLabel ? `/${selectedEstadoLabel}` : "";
    setMunicipioUf(`${selectedMunicipioLabel}${uf}`);
  }, [selectedMunicipioLabel, selectedEstadoLabel]);

  useEffect(() => {
    if (selectedSchoolLabel) setEscola(selectedSchoolLabel);
  }, [selectedSchoolLabel]);

  useEffect(() => {
    const val = [selectedSerieLabel, selectedTurmaLabel].filter(Boolean).join(" ");
    if (val) setSerieTurma(val);
  }, [selectedSerieLabel, selectedTurmaLabel]);

  useEffect(() => {
    if (isModoAplicada && selectedAvaliacaoTitulo) {
      setNomeAvaliacao(selectedAvaliacaoTitulo);
    }
  }, [isModoAplicada, selectedAvaliacaoTitulo]);

  useEffect(() => {
    if (hydratingRef.current) return;
    if (!selectedSerie || selectedSerie === "all") return;
    const serie = series.find((item) => item.id === selectedSerie);
    const fromSerie =
      inferCursoFromSerieName(serie?.name || selectedSerieLabel) ||
      findOptionName(serie?.educationStageName || "", ATA_CURSO_OPTIONS);
    if (fromSerie) setCursoLabel(fromSerie);
  }, [selectedSerie, selectedSerieLabel, series]);

  useEffect(() => {
    let cancelled = false;
    const loadDisciplinas = async () => {
      setLoading((s) => ({ ...s, disciplinas: true }));
      try {
        let optionsList: Option[] = [];

        if (isModoAplicada && selectedAvaliacaoId && selectedAvaliacaoId !== "all") {
          const avaliacao = avaliacoes.find((item) => item.id === selectedAvaliacaoId);
          const fromFilter = (avaliacao?.disciplinas?.length
            ? avaliacao.disciplinas
            : avaliacao?.disciplina
              ? [avaliacao.disciplina]
              : []
          )
            .map((name) => normalizeAtaDisciplina(name))
            .filter(Boolean);

          if (fromFilter.length > 0) {
            optionsList = uniqueDisciplineOptions(fromFilter.map((name) => ({ name })));
          } else if (modoLista === "avaliacao") {
            const detail = await EvaluationResultsApiService.getTestEvaluationById<{
              subjects_info?: Array<{ id?: string; name?: string; nome?: string }>;
              subjects?: Array<{ id?: string; name?: string; nome?: string } | string>;
              disciplina?: string;
            }>(selectedAvaliacaoId);
            if (!cancelled && detail) {
              const fromInfo = (detail.subjects_info ?? [])
                .map((item) => normalizeAtaDisciplina(item.name || item.nome || ""))
                .filter(Boolean);
              const fromSubjects = (detail.subjects ?? [])
                .map((item) =>
                  normalizeAtaDisciplina(typeof item === "string" ? item : item.name || item.nome || "")
                )
                .filter(Boolean);
              const single = normalizeAtaDisciplina(detail.disciplina || "");
              optionsList = uniqueDisciplineOptions(
                [...fromInfo, ...fromSubjects, ...(single ? [single] : [])].map((name) => ({ name }))
              );
            }
          }
        }

        if (optionsList.length === 0 && selectedSchool && selectedSchool !== "all") {
          const schoolSubjects = await FormFiltersApiService.getSchoolSubjects(selectedSchool);
          if (!cancelled) {
            optionsList = uniqueDisciplineOptions(
              schoolSubjects.map((item) => ({ id: item.id, name: normalizeAtaDisciplina(item.nome) || item.nome }))
            );
          }
        }

        if (optionsList.length === 0) {
          const allSubjects = await FormFiltersApiService.getSubjects();
          if (!cancelled) {
            optionsList = uniqueDisciplineOptions(
              allSubjects.map((item) => ({ id: item.id, name: normalizeAtaDisciplina(item.nome) || item.nome }))
            );
          }
        }

        if (cancelled) return;

        if (!optionsList.some((item) => normalizeKey(item.name) === "geral")) {
          optionsList = [{ id: "geral", name: "Geral" }, ...optionsList];
        }

        setDisciplinasDisponiveis(optionsList);
        setSelectedDisciplinas((prev) => {
          const availableKeys = new Set(optionsList.map((item) => normalizeKey(item.name)));
          const kept = prev.filter((name) => availableKeys.has(normalizeKey(name)));
          if (kept.length > 0) return kept;
          if (isModoAplicada && selectedAvaliacaoId !== "all") {
            const avaliacao = avaliacoes.find((item) => item.id === selectedAvaliacaoId);
            const fromAvaliacao = (avaliacao?.disciplinas?.length
              ? avaliacao.disciplinas
              : avaliacao?.disciplina
                ? [avaliacao.disciplina]
                : []
            )
              .map((name) => normalizeAtaDisciplina(name))
              .filter((name) => availableKeys.has(normalizeKey(name)));
            if (fromAvaliacao.length > 0) return fromAvaliacao;
          }
          return prev;
        });
      } finally {
        if (!cancelled) setLoading((s) => ({ ...s, disciplinas: false }));
      }
    };

    void loadDisciplinas();
    return () => {
      cancelled = true;
    };
  }, [
    isModoAplicada,
    modoLista,
    selectedAvaliacaoId,
    selectedSchool,
    avaliacoes,
  ]);

  useEffect(() => {
    listaRequestRef.current += 1;
    listaLoadedRef.current = false;
    setLoading((current) => ({ ...current, lista: false }));
  }, [modoLista, selectedEstado, selectedMunicipio, selectedSchool, selectedSerie, selectedTurma, selectedAvaliacaoId]);

  useEffect(() => {
    if (!editingId) {
      setSavedMeta(null);
      setSaveTitle("");
      return;
    }
    let cancelled = false;
    setLoadingSaved(true);
    const cityIdHint = (location.state as { cityId?: string } | null)?.cityId;
    getSavedAta(editingId, cityIdHint)
      .then((detail) => {
        if (cancelled) return;
        hydratingRef.current = true;
        setSavedMeta({ created_by_name: detail.created_by_name, is_owner: detail.is_owner });
        setSaveTitle(detail.title);
        const filters = detail.filters;
        const content = detail.content;
        setModoLista(filters.modo_lista);
        setSelectedEstado(filters.estado_id);
        setSelectedMunicipio(filters.municipio_id);
        setSelectedSchool(filters.escola_id);
        setSelectedSerie(filters.serie_id || "all");
        setSelectedTurma(filters.turma_id || "all");
        setSelectedAvaliacaoId(filters.avaliacao_id || "all");
        setNomeAvaliacao(content.nomeAvaliacao || "NOME DA AVALIAÇÃO");
        setCursoLabel(findOptionName(content.cursoLabel || "", ATA_CURSO_OPTIONS) || content.cursoLabel || "");
        setMunicipioUf(content.municipioUf || "");
        setRede(content.rede || "MUNICIPAL");
        setEscola(content.escola || "");
        setSerieTurma(content.serieTurma || "");
        setTurno(normalizeAtaTurno(content.turno || "") || content.turno || "");
        setSelectedDisciplinas(parseDisciplinaList(content.disciplina || ""));
        setOptions(withSignatureLists({ ...DEFAULT_OPTIONS, ...(content.options || {}) }));
        setTimeout(() => {
          hydratingRef.current = false;
        }, 0);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast({
          title: "Erro ao carregar ata",
          description: getAtaSalaApiError(err),
          variant: "destructive",
        });
        navigate("/app/documentos/ata-sala");
      })
      .finally(() => {
        if (!cancelled) setLoadingSaved(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editingId, location.state, navigate, toast]);

  const applyAtaAutofill = (results: ListaFrequenciaResponse[]) => {
    if (!results.length) {
      setError("Nenhum dado de lista de frequência encontrado para os filtros selecionados.");
      return;
    }
    const header = results[0].cabecalho;

    if (header.nome_prova_ano && (!isModoAplicada || selectedAvaliacaoId === "all")) {
      setNomeAvaliacao(header.nome_prova_ano);
    }
    setEscola(header.nome_escola || selectedSchoolLabel);
    setSerieTurma([header.serie, header.turma || header.serie_turma].filter(Boolean).join(" "));
    const turnoNormalizado = normalizeAtaTurno(header.turno || "");
    if (turnoNormalizado) setTurno(turnoNormalizado);
    else if (header.turno) setTurno(header.turno);
    const disciplinaNormalizada = parseDisciplinaList(header.disciplina || "");
    if (disciplinaNormalizada.length > 0) setSelectedDisciplinas(disciplinaNormalizada);
    setRede(header.rede || "MUNICIPAL");
    setMunicipioUf(header.municipio_uf || municipioUf);
  };

  const resolveCursoFromContext = (results: ListaFrequenciaResponse[]): string => {
    const labels = new Set<string>();
    const add = (value: string) => {
      const canonical =
        findOptionName(value, ATA_CURSO_OPTIONS) || inferCursoFromSerieName(value);
      if (canonical) labels.add(canonical);
    };

    if (selectedSerie !== "all") {
      const serie = series.find((item) => item.id === selectedSerie);
      add(serie?.name || selectedSerieLabel);
      add(serie?.educationStageName || "");
    }

    results.forEach((item) => {
      add(item.cabecalho.serie || "");
      add(item.cabecalho.lista_presenca_curso || "");
    });

    if (labels.size === 1) return [...labels][0];
    if (selectedSerie !== "all") {
      const serie = series.find((item) => item.id === selectedSerie);
      return (
        inferCursoFromSerieName(serie?.name || selectedSerieLabel) ||
        findOptionName(serie?.educationStageName || "", ATA_CURSO_OPTIONS)
      );
    }
    return "";
  };

  const buildAtaDataForClass = (item: ListaFrequenciaResponse): AtaSalaPdfData => {
    const header = item.cabecalho;
    const serieTurmaDisplay = getSerieTurmaDisplay(header);
    const cursoDaTurma =
      inferCursoFromSerieName(header.serie || "") ||
      findOptionName(header.lista_presenca_curso || "", ATA_CURSO_OPTIONS) ||
      pdfData.cursoLabel;

    return {
      ...pdfData,
      nomeAvaliacao: selectedAvaliacaoTitulo || header.nome_prova_ano || pdfData.nomeAvaliacao,
      cursoLabel: cursoDaTurma,
      municipioUf: header.municipio_uf || pdfData.municipioUf,
      rede: header.rede || pdfData.rede,
      escola: header.nome_escola || pdfData.escola,
      serieTurma: `${serieTurmaDisplay.serie} ${serieTurmaDisplay.turma}`.trim(),
      turno: normalizeAtaTurno(header.turno || "") || header.turno || pdfData.turno,
      disciplina:
        formatDisciplinaList(parseDisciplinaList(header.disciplina || "")) || pdfData.disciplina,
    };
  };

  const buildAtaDataFromLista = (results: ListaFrequenciaResponse[]): AtaSalaPdfData => {
    if (results.length === 1) return buildAtaDataForClass(results[0]);
    return pdfData;
  };

  const loadLista = async (): Promise<ListaFrequenciaResponse[] | null> => {
    const seq = ++listaRequestRef.current;
    const stillCurrent = () => seq === listaRequestRef.current;
    const commit = async (results: ListaFrequenciaResponse[]) => {
      if (!stillCurrent()) return null;
      if (results.length === 0) {
        listaLoadedRef.current = false;
        applyAtaAutofill(results);
        return null;
      }
      listaLoadedRef.current = true;
      applyAtaAutofill(results);
      const curso = resolveCursoFromContext(results);
      if (!stillCurrent()) return null;
      if (curso) setCursoLabel(curso);
      return results;
    };
    try {
      setError(null);
      setLoading((s) => ({ ...s, lista: true }));

      if (modoLista === "turma") {
        if (selectedTurma && selectedTurma !== "all") {
          const data = await getListaFrequenciaPorTurma(selectedTurma, "avaliacao");
          return await commit([data]);
        }

        let classIds: string[] = [];
        if (selectedSchool !== "all" && selectedSerie !== "all" && turmas.length > 0) {
          classIds = turmas.map((t) => t.id);
        } else if (selectedSchool !== "all") {
          const classes = await EvaluationResultsApiService.getFilteredClasses({
            municipality_id: selectedMunicipio,
            school_id: selectedSchool,
            ...(selectedSerie !== "all" ? { grade_id: selectedSerie } : {}),
          });
          classIds = classes.map((c) => c.id);
        } else {
          const classes = await EvaluationResultsApiService.getFilteredClasses({
            municipality_id: selectedMunicipio,
            ...(selectedSerie !== "all" ? { grade_id: selectedSerie } : {}),
          });
          classIds = classes.map((c) => c.id);
        }

        if (classIds.length === 0) {
          if (!stillCurrent()) return null;
          setError("Nenhuma turma encontrada para os filtros selecionados.");
          listaLoadedRef.current = false;
          return null;
        }

        const results: ListaFrequenciaResponse[] = [];
        const concurrency = 6;
        for (let i = 0; i < classIds.length; i += concurrency) {
          const chunk = classIds.slice(i, i + concurrency);
          const settled = await Promise.allSettled(
            chunk.map((classId) => getListaFrequenciaPorTurma(classId, "avaliacao"))
          );
          settled.forEach((entry) => {
            if (entry.status === "fulfilled") {
              results.push(entry.value);
            }
          });
        }

        if (!stillCurrent()) return null;
        if (results.length === 0) {
          setError("Não foi possível carregar os dados da lista de frequência para autopreenchimento.");
          listaLoadedRef.current = false;
          return null;
        }
        return await commit(results);
      }

      if (!selectedAvaliacaoId || selectedAvaliacaoId === "all") {
        setError(`Selecione o(a) ${labelItemAplicado.toLowerCase()}.`);
        listaLoadedRef.current = false;
        return null;
      }

      if (!stillCurrent()) return null;

      const classId = selectedTurma && selectedTurma !== "all" ? selectedTurma : undefined;
      if (modoLista === "cartao_resposta") {
        if (!selectedMunicipio || selectedMunicipio === "all") {
          setError("Selecione o município para usar cartão resposta.");
          listaLoadedRef.current = false;
          return null;
        }
        if (classId) {
          const res = await getListaFrequenciaPorGabarito(selectedAvaliacaoId, selectedMunicipio, classId, {
            tipo: "prova_fisica",
          });
          return await commit([res]);
        }
        const results = await getListaFrequenciaPorGabaritoTodasTurmas(selectedAvaliacaoId, selectedMunicipio, {
          grade_id: selectedSerie !== "all" ? selectedSerie : undefined,
          tipo: "prova_fisica",
        });
        return await commit(results);
      }

      if (classId) {
        const res = await getListaFrequenciaPorAvaliacao(selectedAvaliacaoId, classId, {
          tipo: "avaliacao",
        });
        return await commit([res]);
      }
      const results = await getListaFrequenciaPorAvaliacaoTodasTurmas(selectedAvaliacaoId, {
        grade_id: selectedSerie !== "all" ? selectedSerie : undefined,
        tipo: "avaliacao",
      });
      return await commit(results);
    } catch (_err) {
      if (!stillCurrent()) return null;
      setError("Não foi possível carregar os dados da lista de frequência para autopreenchimento.");
      listaLoadedRef.current = false;
      return null;
    } finally {
      if (stillCurrent()) setLoading((s) => ({ ...s, lista: false }));
    }
  };

  loadListaRef.current = loadLista;

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "hidden") return;
      if (!listaLoadedRef.current) return;
      void loadListaRef.current?.();
    };
    const onRoster = () => refreshIfVisible();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshIfVisible();
    };
    window.addEventListener(ROSTER_CHANGED_EVENT, onRoster);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(ROSTER_CHANGED_EVENT, onRoster);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const setOpt = <K extends keyof AtaOptions>(key: K, value: AtaOptions[K]) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const addApoio = (key: "apoiosRegularExtras" | "apoiosSuporteExtras") => {
    setOptions((prev) => ({
      ...prev,
      [key]: [...prev[key], { assinatura: "", cpf: "" }],
    }));
  };

  const updateApoio = (
    key: "apoiosRegularExtras" | "apoiosSuporteExtras",
    index: number,
    field: keyof AtaAssinaturaPessoa,
    value: string
  ) => {
    setOptions((prev) => {
      const list = prev[key].map((person, personIndex) =>
        personIndex === index ? { ...person, [field]: value } : person
      );
      return { ...prev, [key]: list };
    });
  };

  const removeApoio = (key: "apoiosRegularExtras" | "apoiosSuporteExtras", index: number) => {
    setOptions((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, personIndex) => personIndex !== index),
    }));
  };

  const cursoSelectValue =
    ATA_CURSO_OPTIONS.find((course) => normalizeKey(course.name) === normalizeKey(cursoLabel))?.id || "none";
  const turnoSelectValue =
    ATA_TURNO_OPTIONS.find((item) => normalizeKey(item.name) === normalizeKey(turno))?.id ||
    (turno.trim() ? `atual:${turno}` : "none");
  const turnoOptions =
    turnoSelectValue.startsWith("atual:")
      ? [{ id: turnoSelectValue, name: turno }, ...ATA_TURNO_OPTIONS]
      : ATA_TURNO_OPTIONS;

  const toggleDisciplina = (name: string) => {
    setSelectedDisciplinas((prev) => {
      const exists = prev.some((item) => normalizeKey(item) === normalizeKey(name));
      if (exists) return prev.filter((item) => normalizeKey(item) !== normalizeKey(name));
      return [...prev, name];
    });
  };

  const setQ712 = (key: Q712Field, raw: string) => {
    const digits = digitsOnlyMax2(raw);
    setOptions((prev) => ({ ...prev, [key]: digits }));
  };

  const setDateField = (key: "dateDay" | "dateMonth" | "dateYear", raw: string) => {
    const digits = normalizeDigits(raw).slice(0, key === "dateYear" ? 4 : 2);
    setOptions((prev) => {
      const dateYear = key === "dateYear" ? sanitizeAtaYear(digits) : prev.dateYear;
      const dateMonth = key === "dateMonth" ? sanitizeAtaMonth(digits) : prev.dateMonth;
      let dateDay =
        key === "dateDay" ? sanitizeAtaDay(digits, prev.dateMonth, prev.dateYear) : prev.dateDay;
      if (key === "dateMonth" && prev.dateDay.length === 2) {
        dateDay = sanitizeAtaDay(prev.dateDay, dateMonth, prev.dateYear);
      }
      if (key === "dateYear" && prev.dateDay.length === 2) {
        dateDay = sanitizeAtaDay(prev.dateDay, prev.dateMonth, dateYear);
      }
      return { ...prev, dateYear, dateMonth, dateDay };
    });
  };

  const pdfData = useMemo<AtaSalaPdfData>(
    () => ({
      nomeAvaliacao,
      cursoLabel,
      municipioUf,
      rede,
      escola,
      serieTurma,
      turno,
      disciplina,
      options,
    }),
    [nomeAvaliacao, cursoLabel, municipioUf, rede, escola, serieTurma, turno, disciplina, options]
  );

  const cpfValidation = useMemo(
    () => ({
      cpfAplicador: options.cpfAplicador.trim() === "" || isValidCpf(options.cpfAplicador),
      cpfApoioRegular: options.cpfApoioRegular.trim() === "" || isValidCpf(options.cpfApoioRegular),
      cpfApoioSuporte: options.cpfApoioSuporte.trim() === "" || isValidCpf(options.cpfApoioSuporte),
      regularExtras: options.apoiosRegularExtras.map((person) => person.cpf.trim() === "" || isValidCpf(person.cpf)),
      suporteExtras: options.apoiosSuporteExtras.map((person) => person.cpf.trim() === "" || isValidCpf(person.cpf)),
    }),
    [options.cpfAplicador, options.cpfApoioRegular, options.cpfApoioSuporte, options.apoiosRegularExtras, options.apoiosSuporteExtras]
  );

  const invalidCpfLabels = useMemo(() => {
    const labels: string[] = [];
    if (options.cpfAplicador.trim() && !cpfValidation.cpfAplicador) labels.push("CPF Aplicador(a)");
    if (options.cpfApoioRegular.trim() && !cpfValidation.cpfApoioRegular) labels.push("CPF Apoio Regular");
    options.apoiosRegularExtras.forEach((person, index) => {
      if (person.cpf.trim() && !cpfValidation.regularExtras[index]) {
        labels.push(`CPF Apoio Regular ${index + 2}`);
      }
    });
    if (options.cpfApoioSuporte.trim() && !cpfValidation.cpfApoioSuporte) labels.push("CPF Apoio Suporte");
    options.apoiosSuporteExtras.forEach((person, index) => {
      if (person.cpf.trim() && !cpfValidation.suporteExtras[index]) {
        labels.push(`CPF Apoio Suporte ${index + 2}`);
      }
    });
    return labels;
  }, [options, cpfValidation]);

  const warnInvalidCpf = () => {
    if (invalidCpfLabels.length === 0) return;
    toast({
      title: "Atenção: CPF(s) inválido(s)",
      description: `${invalidCpfLabels.join(", ")}. O PDF será gerado normalmente.`,
      variant: "destructive",
    });
  };

  const onDownload = async () => {
    warnInvalidCpf();
    const ataCityId = selectedMunicipio !== "all" ? selectedMunicipio : null;
    const wantsBatch = selectedTurma === "all";

    setLoading((s) => ({ ...s, pdf: true }));
    try {
      const lista = await loadLista();
      if (!lista || lista.length === 0) {
        toast({
          title: "Sem dados",
          description: "Não foi possível atualizar a lista de frequência para a ata.",
          variant: "destructive",
        });
        return;
      }

      const shouldZip = wantsBatch && lista.length >= 1;
      if (!shouldZip) {
        await downloadAtaSalaPdf(buildAtaDataFromLista(lista), "ata-de-sala.pdf", ataCityId);
        toast({ title: "PDF baixado", description: "A ata de sala foi baixada com a frequência atual." });
        return;
      }

      const zipEntries: Array<{ path: string; blob: Blob }> = [];
      for (const item of lista) {
        const ataData = buildAtaDataForClass(item);
        const blob = await createAtaSalaPdfBlob(ataData, ataCityId);
        const serieTurma = getSerieTurmaDisplay(item.cabecalho);
        zipEntries.push({
          path: buildAtaSalaHierarchyPath({
            escola: item.cabecalho.nome_escola || ataData.escola,
            serie: serieTurma.serie,
            turma: serieTurma.turma,
          }),
          blob,
        });
      }
      const zipBlob = await generateZipBlob(zipEntries);
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(zipBlob, `ata-sala-${date}.zip`);
      toast({ title: "ZIP baixado", description: `${zipEntries.length} atas foram exportadas.` });
    } catch {
      toast({
        title: "Erro ao gerar arquivo",
        description: "Não foi possível gerar o PDF/ZIP da ata de sala.",
        variant: "destructive",
      });
    } finally {
      setLoading((s) => ({ ...s, pdf: false }));
    }
  };

  const onPreview = async () => {
    warnInvalidCpf();
    const lista = await loadLista();
    if (!lista || lista.length === 0) {
      toast({
        title: "Sem dados",
        description: "Não foi possível atualizar a lista de frequência para a ata.",
        variant: "destructive",
      });
      return;
    }
    const ataCityId = selectedMunicipio !== "all" ? selectedMunicipio : null;
    await previewAtaSalaPdf(buildAtaDataFromLista(lista), ataCityId);
    toast({ title: "PDF gerado", description: "A ata de sala foi aberta com a frequência atual." });
  };

  const onPrint = async () => {
    warnInvalidCpf();
    const lista = await loadLista();
    if (!lista || lista.length === 0) {
      toast({
        title: "Sem dados",
        description: "Não foi possível atualizar a lista de frequência para a ata.",
        variant: "destructive",
      });
      return;
    }
    const ataCityId = selectedMunicipio !== "all" ? selectedMunicipio : null;
    await printAtaSalaPdf(buildAtaDataFromLista(lista), ataCityId);
    toast({ title: "Abrindo impressão", description: "A janela de impressão usa a frequência atual." });
  };

  const defaultSaveTitle = useMemo(() => {
    const parts = [escola, serieTurma, disciplina].map((p) => (p || "").trim()).filter(Boolean);
    return parts.length ? parts.join(" — ") : "Ata de sala";
  }, [escola, serieTurma, disciplina]);

  const buildSavePayload = (title: string): AtaSalaSavePayload => ({
    title: title.trim() || defaultSaveTitle,
    filters: {
      modo_lista: modoLista,
      estado_id: selectedEstado,
      municipio_id: selectedMunicipio,
      escola_id: selectedSchool,
      serie_id: selectedSerie,
      turma_id: selectedTurma === "all" ? null : selectedTurma,
      avaliacao_id: isModoAplicada && selectedAvaliacaoId !== "all" ? selectedAvaliacaoId : null,
    },
    content: pdfData,
  });

  const openSaveDialog = (asNew: boolean) => {
    if (!hasContextForAta) {
      toast({
        title: "Selecione os filtros",
        description: "Informe estado, município e escola antes de salvar.",
        variant: "destructive",
      });
      return;
    }
    if (editingId && savedMeta && !savedMeta.is_owner && !asNew) {
      toast({
        title: "Somente leitura",
        description: "Apenas o autor pode alterar esta ata.",
        variant: "destructive",
      });
      return;
    }
    setSaveAsNew(asNew);
    setSaveTitle(saveTitle || defaultSaveTitle);
    setSaveDialogOpen(true);
  };

  const confirmSave = async () => {
    setSaving(true);
    try {
      const lista = await loadLista();
      if (!lista || lista.length === 0) {
        toast({
          title: "Sem dados",
          description: "Não foi possível atualizar a lista de frequência antes de salvar.",
          variant: "destructive",
        });
        return;
      }
      const payload = {
        ...buildSavePayload(saveTitle),
        content: buildAtaDataFromLista(lista),
      };
      const cityId = selectedMunicipio !== "all" ? selectedMunicipio : undefined;
      if (editingId && !saveAsNew && savedMeta?.is_owner) {
        await updateSavedAta(editingId, payload, cityId);
        toast({ title: "Ata atualizada", description: "As alterações foram salvas." });
      } else {
        await createSavedAta(payload, cityId);
        toast({ title: "Ata salva", description: "A ata foi salva com sucesso." });
      }
      setListRefreshToken((n) => n + 1);
      navigate("/app/documentos/ata-sala?tab=salvas");
      setSaveDialogOpen(false);
    } catch (err: unknown) {
      toast({
        title: "Erro ao salvar",
        description: getAtaSalaApiError(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const canEditSaved = !editingId || (savedMeta?.is_owner ?? true);

  const editorContent = (
    <>
      {loadingSaved ? (
        <Alert>
          <AlertDescription className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando ata salva…
          </AlertDescription>
        </Alert>
      ) : null}

      {editingId && savedMeta ? (
        <Alert>
          <AlertDescription>
            {canEditSaved
              ? `Editando ata criada por ${savedMeta.created_by_name}.`
              : `Visualizando ata de ${savedMeta.created_by_name} (somente leitura para salvar alterações).`}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Modo</Label>
              <Select value={modoLista} onValueChange={(value) => setModoLista(value as Mode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="turma">Personalizável</SelectItem>
                  <SelectItem value="avaliacao">Avaliação</SelectItem>
                  <SelectItem value="cartao_resposta">Cartão resposta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isModoAplicada ? (
              <EvaluationInstrumentPicker
                label={labelItemAplicado}
                estado={selectedEstado}
                municipio={selectedMunicipio}
                escola={selectedSchool !== "all" ? selectedSchool : undefined}
                reportEntityType={
                  modoLista === "cartao_resposta" ? REPORT_ENTITY_TYPE_ANSWER_SHEET : undefined
                }
                value={selectedAvaliacaoId}
                onChange={setSelectedAvaliacaoId}
                disabled={!hasContextForAta}
                loading={loading.avaliacoes}
                allowAll
                allLabel="Selecione"
                placeholder={
                  !hasContextForAta
                    ? "Selecione estado e município"
                    : `Selecione ${labelItemAplicado.toLowerCase()}`
                }
              />
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={selectedEstado} onValueChange={setSelectedEstado}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Selecione</SelectItem>
                  {estados.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Município</Label>
              <Select
                value={selectedMunicipio}
                onValueChange={setSelectedMunicipio}
                disabled={selectedEstado === "all" || loading.municipios}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Selecione</SelectItem>
                  {municipios.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Escola</Label>
              <Select
                value={selectedSchool}
                onValueChange={setSelectedSchool}
                disabled={selectedMunicipio === "all" || loading.escolas}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Selecione</SelectItem>
                  {schools.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Série</Label>
              <Select value={selectedSerie} onValueChange={setSelectedSerie} disabled={selectedSchool === "all" || loading.series}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Selecione</SelectItem>
                  {series.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Turma</Label>
              <Select
                value={selectedTurma}
                onValueChange={setSelectedTurma}
                disabled={
                  selectedSerie === "all" ||
                  (isModoAplicada
                    ? selectedAvaliacaoId === "all" || loading.turmasAvaliacao
                    : loading.turmas)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {turmaOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={loadLista}
            disabled={
              loading.lista ||
              !hasContextForAta ||
              (isModoAplicada && selectedAvaliacaoId === "all")
            }
          >
            {loading.lista ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Carregar dados da ata
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!hasContextForAta ? (
        <Alert>
          <AlertDescription>
            Selecione estado e município para liberar os campos da Ata.
          </AlertDescription>
        </Alert>
      ) : null}

      {hasContextForAta ? (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Campos da Ata
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-xl border-2 border-fuchsia-500/35 bg-muted/30 p-4 shadow-sm md:p-5">
            <p className="mb-4 text-xs font-medium uppercase tracking-wide text-fuchsia-700/90 dark:text-fuchsia-300/90">
              Cabeçalho da ata (como na lista de frequência)
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="ata-nome-avaliacao">Nome da avaliação</Label>
                <Input
                  id="ata-nome-avaliacao"
                  value={nomeAvaliacao}
                  onChange={(e) => setNomeAvaliacao(e.target.value)}
                  placeholder="Editável antes de gerar o PDF"
                  className="bg-background"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="ata-curso-label">Curso</Label>
                <Select
                  value={cursoSelectValue}
                  onValueChange={(value) =>
                    setCursoLabel(
                      value === "none"
                        ? ""
                        : ATA_CURSO_OPTIONS.find((course) => course.id === value)?.name || ""
                    )
                  }
                >
                  <SelectTrigger id="ata-curso-label" className="bg-background">
                    <SelectValue placeholder="Preenchido pela série selecionada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione</SelectItem>
                    {ATA_CURSO_OPTIONS.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Município/UF</Label>
                <Input value={municipioUf} readOnly className="bg-background" />
              </div>
              <div className="space-y-2">
                <Label>Rede</Label>
                <Input value={rede} readOnly className="bg-background" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Escola</Label>
                <Input value={escola} readOnly className="bg-background" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Série/Turma</Label>
                <Input value={serieTurma} readOnly className="bg-background" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ata-turno">Turno</Label>
                <Select
                  value={turnoSelectValue}
                  onValueChange={(value) => {
                    if (value === "none") {
                      setTurno("");
                      return;
                    }
                    if (value.startsWith("atual:")) {
                      setTurno(value.slice("atual:".length));
                      return;
                    }
                    setTurno(ATA_TURNO_OPTIONS.find((item) => item.id === value)?.name || "");
                  }}
                >
                  <SelectTrigger id="ata-turno" className="bg-background">
                    <SelectValue placeholder="Selecione o turno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione</SelectItem>
                    {turnoOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Disciplina</Label>
                {loading.disciplinas ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando disciplinas dos filtros…
                  </p>
                ) : disciplinasDisponiveis.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma disciplina disponível para os filtros selecionados.
                  </p>
                ) : (
                  <div className="grid max-h-44 grid-cols-1 gap-2 overflow-y-auto rounded-md border bg-background p-3 sm:grid-cols-2">
                    {disciplinasDisponiveis.map((item) => {
                      const checked = selectedDisciplinas.some(
                        (name) => normalizeKey(name) === normalizeKey(item.name)
                      );
                      return (
                        <div key={item.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`ata-disciplina-${item.id}`}
                            checked={checked}
                            onCheckedChange={() => toggleDisciplina(item.name)}
                          />
                          <Label htmlFor={`ata-disciplina-${item.id}`} className="cursor-pointer font-normal">
                            {item.name}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                )}
                {selectedDisciplinas.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Selecionadas: {formatDisciplinaList(selectedDisciplinas)}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Selecione uma ou mais disciplinas.</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ata-application-day-label">Texto do dia de aplicação</Label>
            <Input
              id="ata-application-day-label"
              value={options.applicationDayLabel}
              onChange={(e) => setOpt("applicationDayLabel", e.target.value)}
              placeholder="Ex.: 1º dia de aplicação, 2º dia de aplicação..."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Data</Label>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="ata-date-day">Dia</Label>
                <Input
                  id="ata-date-day"
                  maxLength={2}
                  inputMode="numeric"
                  autoComplete="off"
                  value={options.dateDay}
                  onChange={(e) => setDateField("dateDay", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ata-date-month">Mês</Label>
                <Input
                  id="ata-date-month"
                  maxLength={2}
                  inputMode="numeric"
                  autoComplete="off"
                  value={options.dateMonth}
                  onChange={(e) => setDateField("dateMonth", e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ata-date-year">Ano</Label>
                <Input
                  id="ata-date-year"
                  maxLength={4}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={`${ATA_YEAR_MIN}–${ATA_YEAR_MAX}`}
                  value={options.dateYear}
                  onChange={(e) => setDateField("dateYear", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Início (hora)</Label>
              <Input maxLength={2} value={options.startHour} onChange={(e) => setOpt("startHour", e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </div>
            <div className="space-y-1.5">
              <Label>Início (min)</Label>
              <Input maxLength={2} value={options.startMinute} onChange={(e) => setOpt("startMinute", e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </div>
            <div className="space-y-1.5">
              <Label>Término (hora)</Label>
              <Input maxLength={2} value={options.endHour} onChange={(e) => setOpt("endHour", e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </div>
            <div className="space-y-1.5">
              <Label>Término (min)</Label>
              <Input maxLength={2} value={options.endMinute} onChange={(e) => setOpt("endMinute", e.target.value.replace(/\D/g, "").slice(0, 2))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>4. Motivo se a aplicação não ocorreu</Label>
            <Textarea value={options.didNotOccurReason} onChange={(e) => setOpt("didNotOccurReason", e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>5. Ocorrências que incomodaram</Label>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[
                ["occurrenceA", "A) Turma indisciplinada, inquieta."],
                ["occurrenceB", "B) Barulho externo."],
                ["occurrenceC", "C) Estudantes desmotivados."],
                ["occurrenceD", "D) Recusa à realização do(s) teste(s)."],
                ["occurrenceE", "E) Outro."],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    checked={Boolean(options[key as keyof AtaOptions])}
                    onCheckedChange={(v) => setOpt(key as keyof AtaOptions, Boolean(v) as never)}
                  />
                  <span className="text-sm">{label}</span>
                </div>
              ))}
            </div>
            <Textarea
              placeholder="Detalhe as ocorrências (opcional)"
              value={options.occurrenceDetail5}
              onChange={(e) => setOpt("occurrenceDetail5", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox checked={options.noOccurrences} onCheckedChange={(v) => setOpt("noOccurrences", Boolean(v))} />
              <span className="text-sm">Não houve ocorrências.</span>
            </div>
            <Label>6. Ocorrências que interferiram</Label>
            <Textarea value={options.occurrenceDetail6} onChange={(e) => setOpt("occurrenceDetail6", e.target.value)} />
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Itens 7 a 12: resposta <strong className="font-medium text-foreground">somente numérica</strong>, até{" "}
              <strong className="font-medium text-foreground">2 dígitos</strong> por campo (0 a 99), como no formulário
              impresso.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(
                [
                  ["q7Responded", "7. Quantidade de estudantes presentes que responderam ao teste."] as const,
                  ["q8NotResponded", "8. Quantidade de estudantes presentes que NÃO responderam ao teste."] as const,
                  ["q9Tablets", "9. Quantidade de tablets/cadernos que foram utilizados nesta sala."] as const,
                  [
                    "q10SpecialStayed",
                    "10. Quantidade de estudantes com necessidades específicas que permaneceram na sala.",
                  ] as const,
                  [
                    "q11SpecialRegularRoom",
                    "11. Quantidade de estudantes com necessidades específicas direcionados para sala extra com Prova Regular.",
                  ] as const,
                  [
                    "q12SpecialSupportRoom",
                    "12. Quantidade de estudantes com necessidades específicas direcionados para sala extra com Prova de Suporte.",
                  ] as const,
                ] as const
              ).map(([k, lbl]) => (
                <div key={k} className="space-y-1.5">
                  <Label htmlFor={`ata-${k}`}>{lbl}</Label>
                  <Input
                    id={`ata-${k}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    placeholder="00"
                    maxLength={Q712_MAX_DIGITS}
                    className="font-mono tabular-nums tracking-widest"
                    aria-describedby={`ata-${k}-hint`}
                    value={options[k]}
                    onChange={(e) => setQ712(k, e.target.value)}
                  />
                  <p id={`ata-${k}-hint`} className="text-xs text-muted-foreground">
                    Numérico, máximo 2 caracteres.
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Assinatura Aplicador(a)</Label>
                <Input value={options.assinaturaAplicador} onChange={(e) => setOpt("assinaturaAplicador", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>CPF Aplicador(a)</Label>
                <Input value={options.cpfAplicador} onChange={(e) => setOpt("cpfAplicador", e.target.value)} />
                {!cpfValidation.cpfAplicador && options.cpfAplicador.trim() ? (
                  <p className="text-xs text-amber-600">CPF inválido</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">Apoio Prova Regular</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Assinatura</Label>
                  <Input value={options.assinaturaApoioRegular} onChange={(e) => setOpt("assinaturaApoioRegular", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>CPF</Label>
                  <Input value={options.cpfApoioRegular} onChange={(e) => setOpt("cpfApoioRegular", e.target.value)} />
                  {!cpfValidation.cpfApoioRegular && options.cpfApoioRegular.trim() ? (
                    <p className="text-xs text-amber-600">CPF inválido</p>
                  ) : null}
                </div>
              </div>
              {options.apoiosRegularExtras.map((person, index) => (
                <div key={`regular-${index}`} className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <div className="space-y-1.5">
                    <Label>Assinatura {index + 2}</Label>
                    <Input
                      value={person.assinatura}
                      onChange={(e) => updateApoio("apoiosRegularExtras", index, "assinatura", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>CPF {index + 2}</Label>
                    <Input
                      value={person.cpf}
                      onChange={(e) => updateApoio("apoiosRegularExtras", index, "cpf", e.target.value)}
                    />
                    {person.cpf.trim() && !cpfValidation.regularExtras[index] ? (
                      <p className="text-xs text-amber-600">CPF inválido</p>
                    ) : null}
                  </div>
                  <Button type="button" variant="outline" onClick={() => removeApoio("apoiosRegularExtras", index)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remover
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => addApoio("apoiosRegularExtras")}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar integrante
              </Button>
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">Apoio Prova Suporte</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Assinatura</Label>
                  <Input value={options.assinaturaApoioSuporte} onChange={(e) => setOpt("assinaturaApoioSuporte", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>CPF</Label>
                  <Input value={options.cpfApoioSuporte} onChange={(e) => setOpt("cpfApoioSuporte", e.target.value)} />
                  {!cpfValidation.cpfApoioSuporte && options.cpfApoioSuporte.trim() ? (
                    <p className="text-xs text-amber-600">CPF inválido</p>
                  ) : null}
                </div>
              </div>
              {options.apoiosSuporteExtras.map((person, index) => (
                <div key={`suporte-${index}`} className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <div className="space-y-1.5">
                    <Label>Assinatura {index + 2}</Label>
                    <Input
                      value={person.assinatura}
                      onChange={(e) => updateApoio("apoiosSuporteExtras", index, "assinatura", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>CPF {index + 2}</Label>
                    <Input
                      value={person.cpf}
                      onChange={(e) => updateApoio("apoiosSuporteExtras", index, "cpf", e.target.value)}
                    />
                    {person.cpf.trim() && !cpfValidation.suporteExtras[index] ? (
                      <p className="text-xs text-amber-600">CPF inválido</p>
                    ) : null}
                  </div>
                  <Button type="button" variant="outline" onClick={() => removeApoio("apoiosSuporteExtras", index)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remover
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => addApoio("apoiosSuporteExtras")}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar integrante
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {canEditSaved ? (
              <>
                <Button onClick={() => openSaveDialog(false)} disabled={saving || loadingSaved}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {editingId ? "Salvar alterações" : "Salvar ata"}
                </Button>
                {editingId ? (
                  <Button variant="outline" onClick={() => openSaveDialog(true)} disabled={saving || loadingSaved}>
                    <Plus className="mr-2 h-4 w-4" />
                    Salvar como nova
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button variant="secondary" onClick={onPreview} disabled={loading.lista || loading.pdf}>
              <Eye className="mr-2 h-4 w-4" />
              Gerar PDF
            </Button>
            <Button onClick={onDownload} disabled={loading.pdf || loading.lista}>
              {loading.pdf ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {selectedTurma === "all" ? "Baixar ZIP" : "Baixar PDF"}
            </Button>
            <Button variant="outline" onClick={onPrint} disabled={loading.lista || loading.pdf}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir PDF
            </Button>
          </div>
        </CardContent>
      </Card>
      ) : null}
    </>
  );

  return (
    <div className="container mx-auto space-y-6 px-4 py-6">
      <header className="space-y-1.5">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
          <ClipboardList className="h-8 w-8 text-primary" />
          {editingId ? "Editar Ata de Sala" : "Impressão de Ata de Sala"}
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Preencha os campos da ata, salve para continuar depois ou gere o PDF pronto para impressão.
        </p>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === "salvas") {
            setSearchParams({ tab: "salvas" });
            return;
          }
          setSearchParams({});
        }}
      >
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="editor" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {editingId ? "Editar ata" : "Nova ata"}
          </TabsTrigger>
          <TabsTrigger value="salvas" className="flex items-center gap-2" disabled={Boolean(routeId)}>
            <List className="h-4 w-4" />
            Atas salvas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="mt-6 space-y-6">
          {editorContent}
        </TabsContent>

        <TabsContent value="salvas" className="mt-6">
          <AtaSalaSavedList
            refreshToken={listRefreshToken}
            defaultCityId={selectedMunicipio !== "all" ? selectedMunicipio : undefined}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{saveAsNew ? "Salvar como nova ata" : editingId ? "Salvar alterações" : "Salvar ata"}</DialogTitle>
            <DialogDescription>Defina um título para identificar esta ata na listagem.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ata-save-title">Título</Label>
            <Input
              id="ata-save-title"
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder={defaultSaveTitle}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={confirmSave} disabled={saving || loading.lista}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
