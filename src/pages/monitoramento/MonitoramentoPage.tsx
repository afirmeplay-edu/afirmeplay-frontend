import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Calendar as CalendarIcon,
  Activity,
  AlertCircle,
  ArrowUpDown,
  Building2,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  EyeOff,
  FileText,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  FileClock,
  Filter,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/authContext";
import { cn } from "@/lib/utils";
import { InstrumentPickerField } from "@/components/filters";
import {
  buildPickerContextLines,
  toInstrumentPickerItems,
  toInstrumentPickerSeries,
} from "@/components/filters/instrumentPickerHelpers";
import {
  getReportProficiencyTagClass,
  type ReportProficiencyLabel,
} from "@/utils/report/reportTagStyles";
import {
  type MonitoringActionPayload,
  type MonitoringFilters,
  type MonitoringSourceType,
  type MonitoringStudentItem,
  MonitoramentoApiService,
} from "@/services/monitoramento/monitoramentoApi";
import { generateMonitoringPdf } from "@/services/reports/monitoramentoPdf";
import { generateDetalhamentoAlunosPdf } from "@/services/reports/detalhamentoAlunosPdf";
import {
  MonitoringSkillDetailDialog,
  type MonitoringSkillDetailRequest,
} from "@/pages/monitoramento/MonitoringSkillDetailDialog";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  RESULTS_MONTH_NAMES_PT,
  RESULTS_PERIOD_YEAR_MIN,
  getResultsPeriodYearMax,
  normalizeResultsPeriodYm,
} from "@/utils/resultsPeriod";

const defaultFilters: MonitoringFilters = {
  tipo_origem: "avaliacao",
  periodo: "",
  estado: "",
  municipio: "",
  escola_id: "",
  avaliacao_id: "",
  gabarito_id: "",
  disciplina: "",
  serie_id: "",
  turma_id: "",
  coordenador_id: "",
  page: 1,
  page_size: 20,
};

const statusOptions = [
  { id: "pendente", label: "Pendente" },
  { id: "sendo_realizada", label: "Em andamento" },
  { id: "realizada", label: "Realizada" },
  { id: "nao_realizado", label: "Não realizada" },
] as const;

const formatDateToInput = (date?: string | null) => (date ? date.slice(0, 10) : "");

const isAbaixoBasico = (nivel: string) => nivel.toLowerCase().includes("abaixo");

function CriticalSkillCodes({
  codes,
  disciplinaLabel,
  onOpen,
}: {
  codes: string[];
  disciplinaLabel: string;
  onOpen: (codigo: string, disciplina: string) => void;
}) {
  const list = codes.filter((code) => code?.trim());
  if (!list.length) return null;
  return (
    <span>
      {list.map((code, index) => (
        <span key={`${disciplinaLabel}-${code}-${index}`}>
          {index > 0 ? ", " : null}
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onOpen(code.trim(), disciplinaLabel)}
          >
            {code.trim()}
          </button>
        </span>
      ))}
    </span>
  );
}

const getStatusLabel = (status: string) =>
  statusOptions.find((item) => item.id === status)?.label ?? "Pendente";

const getMonitoringStatusClass = (status: string) => {
  switch (status) {
    case "realizada":
      return "border-green-400 bg-green-50 text-green-800 dark:border-green-600 dark:bg-green-950/40 dark:text-green-400";
    case "sendo_realizada":
      return "border-yellow-400 bg-yellow-50 text-yellow-800 dark:border-yellow-600 dark:bg-yellow-950/40 dark:text-yellow-400";
    case "nao_realizado":
      return "border-red-600 bg-red-200 text-red-950 font-semibold shadow-sm dark:border-red-500 dark:bg-red-600/30 dark:text-red-200";
    case "pendente":
    default:
      return "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400";
  }
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
  const maybe = error as { response?: { data?: { error?: string; details?: string } } };
  return maybe?.response?.data?.error || maybe?.response?.data?.details || fallback;
};

type MonitoringKpiVariant = "purple" | "green" | "red";

const monitoringKpiStyles: Record<
  MonitoringKpiVariant,
  { border: string; iconWrap: string; icon: string; footer?: string }
> = {
  purple: {
    border: "border-l-violet-500",
    iconWrap: "bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
    icon: "text-violet-600 dark:text-violet-400",
  },
  green: {
    border: "border-l-emerald-500",
    iconWrap: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    icon: "text-emerald-600 dark:text-emerald-400",
    footer: "text-emerald-600 dark:text-emerald-400",
  },
  red: {
    border: "border-l-red-500",
    iconWrap: "bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    icon: "text-red-600 dark:text-red-400",
    footer: "text-red-600 dark:text-red-400",
  },
};

function MonitoringKpiCard({
  variant,
  title,
  value,
  footer,
  icon,
  isLoading,
}: {
  variant: MonitoringKpiVariant;
  title: string;
  value: string | number;
  footer: ReactNode;
  icon: ReactNode;
  isLoading?: boolean;
}) {
  const styles = monitoringKpiStyles[variant];

  if (isLoading) {
    return (
      <div
        className={cn(
          "min-h-[168px] rounded-2xl border border-l-[6px] bg-card p-6 shadow-sm",
          styles.border
        )}
      >
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-6 h-12 w-20" />
        <Skeleton className="mt-6 h-4 w-40" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "min-h-[168px] rounded-2xl border border-l-[6px] bg-card p-6 shadow-sm transition-shadow hover:shadow-md",
        styles.border
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="mt-4 text-5xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
          <div
            className={cn(
              "mt-5 flex items-center gap-2 text-sm",
              styles.footer ?? "text-muted-foreground"
            )}
          >
            {footer}
          </div>
        </div>
        <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-full", styles.iconWrap)}>
          {icon}
        </div>
      </div>
    </div>
  );
}

const MonitoringSortableHead = ({
  label,
  sortKey,
  activeSort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: string;
  activeSort: { by: string; order: "asc" | "desc" };
  onSort: (key: string) => void;
  align?: "left" | "center" | "right";
}) => (
  <TableHead className={cn(align === "center" && "text-center", align === "right" && "text-right")}>
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "h-7 px-1 text-xs uppercase tracking-wide",
        activeSort.by === sortKey && "bg-muted/60",
        align === "center" && "mx-auto flex",
        align === "right" && "ml-auto flex"
      )}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3 shrink-0" />
    </Button>
  </TableHead>
);

const MonitoringLevelCount = ({
  count,
  total,
  nivel,
}: {
  count: number;
  total: number;
  nivel: ReportProficiencyLabel;
}) => {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <Badge variant="outline" className={cn(getReportProficiencyTagClass(nivel), "font-semibold tabular-nums")}>
      {count} · {pct.toFixed(0)}%
    </Badge>
  );
};

const MonitoringPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultsAppliedRef = useRef(false);
  const disciplinaAutoSourceRef = useRef("");

  const [filters, setFilters] = useState<MonitoringFilters>(defaultFilters);
  const [pickerModalFilters, setPickerModalFilters] = useState({ serieFiltro: "all", nome: "" });
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");
  const [studentsModalOpen, setStudentsModalOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [historyActionId, setHistoryActionId] = useState<string>("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [skillDetailOpen, setSkillDetailOpen] = useState(false);
  const [skillDetailRequest, setSkillDetailRequest] = useState<MonitoringSkillDetailRequest | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingDetalhamentoPdf, setIsGeneratingDetalhamentoPdf] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Partial<MonitoringStudentItem>>>({});
  const [schoolPage, setSchoolPage] = useState(1);
  const [studentPage, setStudentPage] = useState(1);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [savingAllRows, setSavingAllRows] = useState(false);
  const [schoolSort, setSchoolSort] = useState<{ by: string; order: "asc" | "desc" }>({
    by: "escola_nome",
    order: "asc",
  });
  const [studentSort, setStudentSort] = useState<{ by: string; order: "asc" | "desc" }>({
    by: "aluno_nome",
    order: "asc",
  });
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [editorComboOpen, setEditorComboOpen] = useState(false);
  const [periodDraft, setPeriodDraft] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });

  const normalizedSelectedPeriod = useMemo(
    () => (filters.periodo ? normalizeResultsPeriodYm(filters.periodo) : "all"),
    [filters.periodo]
  );

  const periodCalendarSelected = useMemo(() => {
    if (normalizedSelectedPeriod === "all") return undefined;
    try {
      return parse(`${normalizedSelectedPeriod}-01`, "yyyy-MM-dd", new Date());
    } catch {
      return undefined;
    }
  }, [normalizedSelectedPeriod]);

  useEffect(() => {
    if (!periodPickerOpen) return;
    if (normalizedSelectedPeriod !== "all") {
      const [y, m] = normalizedSelectedPeriod.split("-").map((v) => parseInt(v, 10));
      if (y && m) setPeriodDraft({ y, m: m - 1 });
    }
  }, [periodPickerOpen, normalizedSelectedPeriod]);

  useEffect(() => {
    const aba = searchParams.get("aba");
    if (aba === "cartao") {
      setFilters((prev) =>
        prev.tipo_origem === "cartao_resposta"
          ? prev
          : { ...prev, tipo_origem: "cartao_resposta", avaliacao_id: "", gabarito_id: "" }
      );
    }
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText.trim().toLowerCase());
      setStudentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const selectedSourceId =
    filters.tipo_origem === "avaliacao" ? filters.avaliacao_id || "" : filters.gabarito_id || "";
  const geoFiltersReady = Boolean(filters.estado && filters.municipio);
  const showClassTable = Boolean(
    filters.escola_id && (filters.serie_id || filters.turma_id) && selectedSourceId
  );
  const editorSchoolId = filters.escola_id || selectedSchoolId || "";
  const editorFieldLabel = editorSchoolId ? "Coordenador" : "Tec Admin";

  const optionsFilters = useMemo(
    () => ({
      ...filters,
      escola_id: editorSchoolId,
    }),
    [filters, editorSchoolId]
  );

  const pickerSourceFilters = useMemo(
    () => ({
      tipo_origem: filters.tipo_origem,
      periodo: filters.periodo,
      estado: filters.estado,
      municipio: filters.municipio,
      serie_filtro:
        pickerModalFilters.serieFiltro !== "all" ? pickerModalFilters.serieFiltro : undefined,
      nome: pickerModalFilters.nome.trim() || undefined,
    }),
    [
      filters.tipo_origem,
      filters.periodo,
      filters.estado,
      filters.municipio,
      pickerModalFilters,
    ]
  );

  const optionsQuery = useQuery({
    queryKey: [
      "monitoramento-options",
      optionsFilters.tipo_origem,
      optionsFilters.periodo,
      optionsFilters.estado,
      optionsFilters.municipio,
      optionsFilters.avaliacao_id,
      optionsFilters.gabarito_id,
      optionsFilters.escola_id,
      optionsFilters.serie_id,
    ],
    queryFn: () => MonitoramentoApiService.getFilterOptions(optionsFilters),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const pickerSourceQuery = useQuery({
    queryKey: [
      "monitoramento-picker-source",
      pickerSourceFilters.tipo_origem,
      pickerSourceFilters.periodo,
      pickerSourceFilters.estado,
      pickerSourceFilters.municipio,
      pickerSourceFilters.serie_filtro,
      pickerSourceFilters.nome,
    ],
    queryFn: () =>
      MonitoramentoApiService.getFilterOptions(
        pickerSourceFilters as Parameters<typeof MonitoramentoApiService.getFilterOptions>[0]
      ),
    enabled: geoFiltersReady,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const filterDefaults = optionsQuery.data?.defaults;
  const escolaLocked = Boolean(filterDefaults?.lock_escola);
  const municipioLocked = Boolean(filterDefaults?.lock_municipio);
  const canMarkSemed = user?.role === "admin" || user?.role === "tecadm";

  useEffect(() => {
    const d = optionsQuery.data?.defaults;
    if (!d || defaultsAppliedRef.current) return;
    if (!d.lock_municipio && !d.lock_escola) return;
    defaultsAppliedRef.current = true;
    setFilters((prev) => {
      const next = { ...prev };
      if (d.lock_municipio) {
        if (d.estado && !prev.estado) next.estado = d.estado;
        if (d.municipio && !prev.municipio) next.municipio = d.municipio;
        if (next.municipio && !next.estado) {
          const city = optionsQuery.data?.municipios?.find((m) => m.id === next.municipio);
          if (city?.state) next.estado = city.state;
        }
      }
      return next;
    });
  }, [optionsQuery.data?.defaults, optionsQuery.data?.municipios]);

  useEffect(() => {
    const d = optionsQuery.data?.defaults;
    if (!d?.lock_escola || !d.escola_id || !selectedSourceId) return;
    setFilters((prev) => {
      if (prev.escola_id === d.escola_id) return prev;
      return { ...prev, escola_id: d.escola_id };
    });
  }, [optionsQuery.data?.defaults, selectedSourceId]);

  const listSortBy = useMemo(() => {
    if (showClassTable && schoolSort.by === "escola_nome") return "turma_nome";
    return schoolSort.by;
  }, [showClassTable, schoolSort.by]);

  const schoolsFilters = useMemo(
    () => ({
      ...filters,
      page: schoolPage,
      page_size: 20,
      sort_by: listSortBy,
      sort_order: schoolSort.order,
    }),
    [filters, schoolPage, listSortBy, schoolSort.order]
  );

  const schoolsQuery = useQuery({
    queryKey: ["monitoramento-schools", schoolsFilters],
    queryFn: () => MonitoramentoApiService.getSchools(schoolsFilters),
    enabled: geoFiltersReady && Boolean(selectedSourceId) && !showClassTable,
    placeholderData: keepPreviousData,
  });

  const classesQuery = useQuery({
    queryKey: ["monitoramento-classes", schoolsFilters],
    queryFn: () => MonitoramentoApiService.getClasses(schoolsFilters),
    enabled: geoFiltersReady && showClassTable,
    placeholderData: keepPreviousData,
  });

  const listQuery = showClassTable ? classesQuery : schoolsQuery;

  const studentFilters = useMemo(
    () => ({
      ...filters,
      q: debouncedSearchText,
      escola_id: selectedSchoolId || filters.escola_id,
      page: studentPage,
      page_size: 30,
      sort_by: studentSort.by,
      sort_order: studentSort.order,
    }),
    [
      filters,
      selectedSchoolId,
      debouncedSearchText,
      studentPage,
      studentSort.by,
      studentSort.order,
    ]
  );

  const studentsQuery = useQuery({
    queryKey: ["monitoramento-students", studentFilters],
    queryFn: () => MonitoramentoApiService.getStudents(studentFilters),
    enabled: studentsModalOpen && Boolean(selectedSchoolId || filters.escola_id),
  });

  const historyQuery = useQuery({
    queryKey: ["monitoramento-history", historyActionId],
    queryFn: () => MonitoramentoApiService.getHistory(historyActionId),
    enabled: historyOpen && Boolean(historyActionId),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: { actionId: string | null; body: MonitoringActionPayload; rowId: string }) =>
      MonitoramentoApiService.updateAction(payload.actionId, payload.body),
    onMutate: ({ rowId }) => setSavingRowId(rowId),
    onSuccess: (_data, variables) => {
      toast({ title: "Ação pedagógica salva", description: "As alterações foram registradas no histórico." });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[variables.rowId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["monitoramento-students"] });
      queryClient.invalidateQueries({ queryKey: ["monitoramento-schools"] });
      queryClient.invalidateQueries({ queryKey: ["monitoramento-classes"] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar ação",
        description: getApiErrorMessage(error, "Não foi possível salvar as informações de monitoramento."),
        variant: "destructive",
      });
    },
    onSettled: () => setSavingRowId(null),
  });

  const resetAfterSource = (next: MonitoringFilters) => {
    next.escola_id = "";
    next.disciplina = "";
    next.serie_id = "";
    next.turma_id = "";
    setSelectedSchoolId("");
    setStudentsModalOpen(false);
  };

  const resetFromMunicipio = (next: MonitoringFilters) => {
    next.avaliacao_id = "";
    next.gabarito_id = "";
    resetAfterSource(next);
  };

  const handleFilterChange = useCallback((key: keyof MonitoringFilters, value: string) => {
    setSchoolPage(1);
    setStudentPage(1);
    if (key === "avaliacao_id" || key === "gabarito_id" || key === "tipo_origem") {
      disciplinaAutoSourceRef.current = "";
    }
    setFilters((prev) => {
      const next = { ...prev, [key]: value, page: 1 };
      if (key === "tipo_origem") {
        next.avaliacao_id = "";
        next.gabarito_id = "";
        resetAfterSource(next);
      }
      if (key === "periodo" || key === "estado" || key === "municipio") {
        resetFromMunicipio(next);
      }
      if (key === "avaliacao_id") {
        next.gabarito_id = "";
        resetAfterSource(next);
      }
      if (key === "gabarito_id") {
        next.avaliacao_id = "";
        resetAfterSource(next);
      }
      if (key === "escola_id") {
        next.turma_id = "";
        next.coordenador_id = "";
        setSelectedSchoolId("");
        setStudentsModalOpen(false);
        setStudentPage(1);
      }
      if (key === "serie_id") {
        next.turma_id = "";
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const disciplinas = optionsQuery.data?.disciplinas ?? [];
    if (!selectedSourceId || disciplinas.length !== 1) return;
    if (disciplinaAutoSourceRef.current === selectedSourceId) return;
    const only = disciplinas[0];
    if (filters.disciplina === only.name) {
      disciplinaAutoSourceRef.current = selectedSourceId;
      return;
    }
    disciplinaAutoSourceRef.current = selectedSourceId;
    setFilters((prev) => ({ ...prev, disciplina: only.name }));
  }, [optionsQuery.data?.disciplinas, selectedSourceId, filters.disciplina]);

  useEffect(() => {
    const series = optionsQuery.data?.series ?? [];
    if (!selectedSourceId) return;
    if (filters.serie_id && !series.some((item) => item.id === filters.serie_id)) {
      setFilters((prev) => ({ ...prev, serie_id: "", turma_id: "" }));
    }
  }, [optionsQuery.data?.series, selectedSourceId, filters.serie_id]);

  const handleOriginTabChange = useCallback(
    (value: string) => {
      const tipo = value as MonitoringSourceType;
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("aba", tipo === "cartao_resposta" ? "cartao" : "avaliacao");
      setSearchParams(nextParams, { replace: true });
      handleFilterChange("tipo_origem", tipo);
    },
    [handleFilterChange, searchParams, setSearchParams]
  );

  const clearAllFilters = useCallback(() => {
    defaultsAppliedRef.current = false;
    disciplinaAutoSourceRef.current = "";
    setFilters(defaultFilters);
    setSelectedSchoolId("");
    setStudentsModalOpen(false);
    setSearchText("");
    setSchoolPage(1);
    setStudentPage(1);
    setDrafts({});
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("aba", "avaliacao");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const openSchoolDetail = useCallback((schoolId: string) => {
    setSelectedSchoolId(schoolId);
    setStudentPage(1);
    setStudentsModalOpen(true);
    setFilters((prev) => ({
      ...prev,
      coordenador_id: prev.escola_id === schoolId ? prev.coordenador_id : "",
    }));
  }, []);

  const openClassDetail = useCallback(
    (turmaId: string) => {
      const escolaId = filters.escola_id || "";
      setSelectedSchoolId(escolaId);
      setStudentPage(1);
      setStudentsModalOpen(true);
      setFilters((prev) => ({
        ...prev,
        turma_id: turmaId,
        coordenador_id: prev.escola_id === escolaId ? prev.coordenador_id : "",
      }));
    },
    [filters.escola_id]
  );

  const getStudentRowId = useCallback(
    (row: MonitoringStudentItem) => row.linha_id || row.aluno_id,
    []
  );

  const openSkillDetail = useCallback(
    (codigo: string, disciplina: string, row: MonitoringStudentItem) => {
      setSkillDetailRequest({
        codigo,
        disciplina: disciplina || filters.disciplina || "",
        source_type: row.source_type,
        source_id: row.source_id,
      });
      setSkillDetailOpen(true);
    },
    [filters.disciplina]
  );

  const getDraftValue = <K extends keyof MonitoringStudentItem>(
    row: MonitoringStudentItem,
    key: K
  ): MonitoringStudentItem[K] => {
    const rowId = getStudentRowId(row);
    const draft = drafts[rowId];
    if (draft && key in draft) return draft[key] as MonitoringStudentItem[K];
    return row[key];
  };

  const updateDraft = (row: MonitoringStudentItem, patch: Partial<MonitoringStudentItem>) => {
    const rowId = getStudentRowId(row);
    setDrafts((prev) => ({
      ...prev,
      [rowId]: {
        ...prev[rowId],
        ...patch,
      },
    }));
  };

  const userRole = (user?.role || "").toLowerCase();
  const isSemedEditor = userRole === "admin" || userRole === "tecadm";
  const isSchoolEditor = userRole === "diretor" || userRole === "coordenador";

  const resolveCoordinatorId = useCallback((): string | null => {
    if (filters.coordenador_id) return filters.coordenador_id;
    if ((isSemedEditor || isSchoolEditor) && user?.id) return user.id;
    return null;
  }, [filters.coordenador_id, isSemedEditor, isSchoolEditor, user?.id]);

  const canEdit =
    Boolean(editorSchoolId) &&
    (isSemedEditor || isSchoolEditor || Boolean(filters.coordenador_id));

  const editorOptions = useMemo(() => {
    const base = optionsQuery.data?.coordenadores ?? [];
    if (!isSemedEditor || !user?.id || !editorSchoolId) return base;
    if (base.some((item) => item.id === user.id)) return base;
    return [{ id: user.id, name: user.name || "Você" }, ...base];
  }, [optionsQuery.data?.coordenadores, isSemedEditor, user?.id, user?.name, editorSchoolId]);

  const effectiveEditorId =
    filters.coordenador_id || (isSemedEditor && user?.id ? user.id : "") || "";

  const selectedEditorLabel = useMemo(() => {
    if (!effectiveEditorId) return null;
    const item = editorOptions.find((option) => option.id === effectiveEditorId);
    const name = item?.name || user?.name || "";
    if (!name) return null;
    return effectiveEditorId === user?.id ? `${name} (você)` : name;
  }, [editorOptions, effectiveEditorId, user?.id, user?.name]);

  const editorLabel = useMemo(() => {
    if (!filters.coordenador_id && !(isSemedEditor && user?.id)) return null;
    return selectedEditorLabel;
  }, [filters.coordenador_id, isSemedEditor, user?.id, selectedEditorLabel]);

  useEffect(() => {
    setEditorComboOpen(false);
  }, [editorSchoolId]);

  useEffect(() => {
    if (!editorSchoolId || !isSchoolEditor || !user?.id) return;
    if (filters.coordenador_id === user.id) return;
    const onList = editorOptions.some((item) => item.id === user.id);
    if (!onList) return;
    setFilters((prev) => ({ ...prev, coordenador_id: user.id }));
  }, [editorSchoolId, editorOptions, filters.coordenador_id, isSchoolEditor, user?.id]);

  const buildActionPayload = useCallback(
    (row: MonitoringStudentItem, coordinatorId: string): MonitoringActionPayload => ({
      source_type: row.source_type,
      source_id: row.source_id,
      student_id: row.aluno_id,
      school_id: row.escola_id,
      disciplina: "",
      acao_pedagogica: String(getDraftValue(row, "acao_pedagogica") || ""),
      responsavel_nome: String(getDraftValue(row, "responsavel_nome") || "").trim(),
      coordenador_id: coordinatorId,
      prazo: (getDraftValue(row, "prazo") as string | null) || null,
      status: (getDraftValue(row, "status") as MonitoringActionPayload["status"]) || "pendente",
      realizada_em: (getDraftValue(row, "realizada_em") as string | null) || null,
      feita_pela_escola: Boolean(getDraftValue(row, "feita_pela_escola")),
      vista_pela_semed: Boolean(getDraftValue(row, "vista_pela_semed")),
    }),
    [getDraftValue]
  );

  const saveRow = (row: MonitoringStudentItem) => {
    const coordinatorId = resolveCoordinatorId();
    if (!canEdit || !coordinatorId) {
      toast({
        title: "Edição não habilitada",
        description: editorSchoolId
          ? `Selecione o ${editorFieldLabel.toLowerCase()} ou use um perfil com permissão de edição.`
          : "Selecione uma escola (filtro ou Abrir na tabela) para habilitar a edição.",
        variant: "destructive",
      });
      return;
    }

    saveMutation.mutate({
      actionId: row.acao_id,
      body: buildActionPayload(row, coordinatorId),
      rowId: getStudentRowId(row),
    });
  };

  const saveAllRows = async () => {
    const coordinatorId = resolveCoordinatorId();
    if (!canEdit || !coordinatorId) {
      toast({
        title: "Edição não habilitada",
        description: editorSchoolId
          ? `Selecione o ${editorFieldLabel.toLowerCase()} ou use um perfil com permissão de edição.`
          : "Selecione uma escola (filtro ou Abrir na tabela) para habilitar a edição.",
        variant: "destructive",
      });
      return;
    }

    setSavingAllRows(true);
    try {
      const total = studentsPagination?.total ?? studentsRows.length;
      let rowsToSave = studentsRows;
      if (total > studentsRows.length) {
        const response = await MonitoramentoApiService.getStudents({
          ...studentFilters,
          page: 1,
          page_size: Math.min(300, total),
        });
        rowsToSave = response.items;
      }

      if (!rowsToSave.length) {
        toast({
          title: "Nada para salvar",
          description: "Não há alunos no recorte atual.",
        });
        return;
      }

      const results = await Promise.allSettled(
        rowsToSave.map((row) =>
          MonitoramentoApiService.updateAction(row.acao_id, buildActionPayload(row, coordinatorId))
        )
      );
      const saved = results.filter((result) => result.status === "fulfilled").length;
      const failed = results.length - saved;

      setDrafts((prev) => {
        const next = { ...prev };
        for (const row of rowsToSave) {
          delete next[getStudentRowId(row)];
        }
        return next;
      });

      await queryClient.invalidateQueries({ queryKey: ["monitoramento-students"] });
      await queryClient.invalidateQueries({ queryKey: ["monitoramento-schools"] });
      await queryClient.invalidateQueries({ queryKey: ["monitoramento-classes"] });

      if (failed === 0) {
        toast({
          title: "Ações salvas",
          description: `${saved} registro${saved === 1 ? "" : "s"} gravado${saved === 1 ? "" : "s"} com sucesso.`,
        });
      } else {
        toast({
          title: "Salvamento parcial",
          description: `${saved} salvo${saved === 1 ? "" : "s"}, ${failed} com erro. Revise e tente novamente.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: getApiErrorMessage(error, "Não foi possível salvar as ações em lote."),
        variant: "destructive",
      });
    } finally {
      setSavingAllRows(false);
    }
  };

  const handleGeneratePdf = async (periodicidade: "semanal" | "mensal") => {
    try {
      setIsGeneratingPdf(true);
      const payload = await MonitoramentoApiService.getReportData({
        ...studentFilters,
        periodicidade,
      });
      await generateMonitoringPdf({
        payload,
        periodicidade,
        title: periodicidade === "semanal" ? "Relatório Semanal" : "Relatório Mensal",
        filterLines: [
          `Recorte: ${recorteLabel}`,
          `Tipo: ${filters.tipo_origem === "avaliacao" ? "Avaliação online" : "Cartão-resposta"}`,
          `Periodicidade: ${periodicidade === "semanal" ? "Semanal" : "Mensal"}`,
          filters.coordenador_id
            ? `${editorFieldLabel}: ${
                optionsQuery.data?.coordenadores.find((c) => c.id === filters.coordenador_id)?.name ||
                filters.coordenador_id
              }`
            : `${editorFieldLabel}: não informado`,
          `Gerado por: ${payload.metadata.usuario_gerador || "—"}`,
        ],
        coverCardLines: [
          { label: "RECORTE", value: recorteLabel },
          {
            label: "TIPO",
            value: filters.tipo_origem === "avaliacao" ? "Avaliação online" : "Cartão-resposta",
          },
          {
            label: "PERIODICIDADE",
            value: periodicidade === "semanal" ? "Semanal" : "Mensal",
          },
          {
            label: "RESUMO",
            value: `${payload.resumo_geral.total_alunos} alunos · ${payload.resumo_geral.total_escolas} escolas · ${payload.resumo_geral.total_acoes} ações`,
          },
        ],
        cityId: filters.municipio || null,
      });
      toast({ title: "PDF gerado com sucesso", description: "O relatório de monitoramento foi exportado." });
    } catch {
      toast({
        title: "Erro ao gerar PDF",
        description: "Não foi possível gerar o relatório de monitoramento.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleExportDetalhamentoPdf = async () => {
    if (!studentsRows.length) {
      toast({
        title: "Nenhum aluno para exportar",
        description: "A tabela está vazia ou sem dados.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingDetalhamentoPdf(true);
    try {
      await generateDetalhamentoAlunosPdf({
        students: studentsRows,
        schoolName: activeSchoolName,
        cityId: filters.municipio || null,
      });
      toast({
        title: "PDF gerado com sucesso",
        description: "O detalhamento de alunos foi exportado.",
      });
    } catch {
      toast({
        title: "Erro ao gerar PDF",
        description: "Não foi possível gerar o detalhamento de alunos.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingDetalhamentoPdf(false);
    }
  };

  const sourceSelectValue =
    filters.tipo_origem === "avaliacao" ? filters.avaliacao_id || "all" : filters.gabarito_id || "all";
  const sourceItems =
    filters.tipo_origem === "avaliacao"
      ? pickerSourceQuery.data?.avaliacoes ?? []
      : pickerSourceQuery.data?.gabaritos ?? [];

  const pickerContextLines = useMemo(
    () =>
      buildPickerContextLines({
        estado: optionsQuery.data?.estados?.find((e) => e.id === filters.estado)?.name,
        municipio: optionsQuery.data?.municipios?.find((m) => m.id === filters.municipio)?.name,
        periodo: filters.periodo,
      }),
    [optionsQuery.data?.estados, optionsQuery.data?.municipios, filters.estado, filters.municipio, filters.periodo]
  );

  const isLoadingFilters = optionsQuery.isLoading && !optionsQuery.data;
  const isListLoading = listQuery.isLoading && !listQuery.data;

  const noSourceItems =
    geoFiltersReady &&
    !pickerSourceQuery.isLoading &&
    !pickerSourceQuery.isError &&
    sourceItems.length === 0;

  const sourceEmptyLabel =
    filters.tipo_origem === "avaliacao"
      ? "Nenhuma avaliação neste município (verifique o período)"
      : "Nenhum cartão-resposta neste município (verifique o período)";

  const listPagination = listQuery.data?.pagination;
  const studentsPagination = studentsQuery.data?.pagination;
  const listFrom =
    (listPagination?.total || 0) > 0
      ? ((listPagination?.page || 1) - 1) * (listPagination?.page_size || 20) + 1
      : 0;
  const listTo = Math.min(
    (listPagination?.page || 1) * (listPagination?.page_size || 20),
    listPagination?.total || 0
  );
  const studentsFrom =
    (studentsPagination?.total || 0) > 0
      ? ((studentsPagination?.page || 1) - 1) * (studentsPagination?.page_size || 30) + 1
      : 0;
  const studentsTo = Math.min(
    (studentsPagination?.page || 1) * (studentsPagination?.page_size || 30),
    studentsPagination?.total || 0
  );

  const summary = listQuery.data?.summary;
  const totalRelatorios = summary?.total_relatorios ?? 0;
  const totalVistos = summary?.total_vistos_semed ?? 0;
  const totalNaoVistos = summary?.total_nao_vistos ?? 0;
  const taxaVistos = summary?.taxa_vistos_pct ?? 0;
  const totalPreenchidas = summary?.total_preenchidas ?? 0;
  const totalRealizadas = summary?.total_realizadas ?? 0;
  const totalPendentesNaoRealizadas = summary?.total_pendentes_nao_realizadas ?? 0;
  const escolasNoRecorte = summary?.total_escolas ?? 0;
  const preenchidasPct =
    totalRelatorios > 0 ? Math.round((totalPreenchidas / totalRelatorios) * 100) : 0;
  const realizadasPct =
    totalRelatorios > 0 ? Math.round((totalRealizadas / totalRelatorios) * 100) : 0;
  const acoesPct = realizadasPct;

  const activeSchoolName = useMemo(() => {
    if (!selectedSchoolId) return null;
    const fromSchools = schoolsQuery.data?.items.find((s) => s.escola_id === selectedSchoolId)?.escola_nome;
    if (fromSchools) return fromSchools;
    const fromOptions = optionsQuery.data?.escolas.find((e) => e.id === selectedSchoolId)?.name;
    if (fromOptions) return fromOptions;
    return studentsQuery.data?.items?.[0]?.escola_nome || "Escola selecionada";
  }, [selectedSchoolId, schoolsQuery.data, optionsQuery.data, studentsQuery.data?.items]);

  const recorteLabel = useMemo(() => {
    const parts: string[] = [];
    if (periodCalendarSelected) {
      parts.push(format(periodCalendarSelected, "MMMM 'de' yyyy", { locale: ptBR }));
    } else if (filters.periodo) {
      parts.push(`Período ${filters.periodo}`);
    }
    const estado = optionsQuery.data?.estados.find((e) => e.id === filters.estado);
    if (estado) parts.push(estado.name);
    const municipio = optionsQuery.data?.municipios.find((m) => m.id === filters.municipio);
    if (municipio) parts.push(municipio.name);
    if (activeSchoolName) parts.push(activeSchoolName);
    else parts.push("Todas as escolas (visão SEMED)");
    if (filters.disciplina) parts.push(filters.disciplina);
    return parts.join(" · ");
  }, [filters.periodo, filters.estado, filters.municipio, filters.disciplina, optionsQuery.data, activeSchoolName, periodCalendarSelected]);

  const studentsRows = studentsQuery.data?.items ?? [];

  const handleSchoolSort = useCallback((by: string) => {
    setSchoolPage(1);
    setSchoolSort((prev) => ({
      by,
      order: prev.by === by && prev.order === "asc" ? "desc" : "asc",
    }));
  }, []);

  const handleStudentSort = useCallback((by: string) => {
    setStudentPage(1);
    setStudentSort((prev) => ({
      by,
      order: prev.by === by && prev.order === "asc" ? "desc" : "asc",
    }));
  }, []);

  return (
    <>
      <div className="w-full min-w-0 space-y-6 pb-8">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight sm:gap-3 sm:text-3xl">
              <Activity className="h-7 w-7 shrink-0 text-primary sm:h-8 sm:w-8" aria-hidden />
              Monitoramento
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                {isListLoading && !summary ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : null}
                {totalRelatorios} relatórios
              </Badge>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isGeneratingPdf}>
                    {isGeneratingPdf ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Exportar PDF
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Escolha a periodicidade</p>
                  <div className="grid gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleGeneratePdf("semanal")}>
                      Semanal
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleGeneratePdf("mensal")}>
                      Mensal
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            Acompanhe ações pedagógicas por escola e aluno, com histórico de alterações e relatório oficial.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{recorteLabel}</span>
            <span className="text-border">•</span>
            <span>{filters.tipo_origem === "avaliacao" ? "Avaliação online" : "Cartão-resposta"}</span>
          </div>
        </header>

        <Tabs value={filters.tipo_origem} onValueChange={handleOriginTabChange} className="w-full">
          <TabsList className="mb-0 w-full max-w-md">
            <TabsTrigger value="avaliacao" className="flex-1">
              Avaliação online
            </TabsTrigger>
            <TabsTrigger value="cartao_resposta" className="flex-1">
              Cartão-resposta
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Card className="overflow-visible">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="h-5 w-5 text-primary" />
                Filtros
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Limpar filtros
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 overflow-visible">
            {isLoadingFilters ? (
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                <span>Carregando opções dos filtros...</span>
              </div>
            ) : null}

            {optionsQuery.isError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {getApiErrorMessage(
                      optionsQuery.error,
                      "Não foi possível carregar os filtros. Verifique se o servidor está em execução."
                    )}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => optionsQuery.refetch()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Tentar novamente
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="monitoramento-estado">Estado</Label>
                <Select
                  value={filters.estado || "all"}
                  onValueChange={(v) => handleFilterChange("estado", v === "all" ? "" : v)}
                  disabled={isLoadingFilters || municipioLocked}
                >
                  <SelectTrigger id="monitoramento-estado" className="w-full min-w-0">
                    <SelectValue placeholder="Selecione o estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {(optionsQuery.data?.estados || []).map((state) => (
                      <SelectItem key={state.id} value={state.id}>
                        {state.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="monitoramento-municipio">Município</Label>
                <Select
                  value={filters.municipio || "all"}
                  onValueChange={(v) => handleFilterChange("municipio", v === "all" ? "" : v)}
                  disabled={!filters.estado || isLoadingFilters || municipioLocked}
                >
                  <SelectTrigger id="monitoramento-municipio" className="w-full min-w-0">
                    <SelectValue
                      placeholder={!filters.estado ? "Selecione o estado antes" : "Selecione o município"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {(optionsQuery.data?.municipios || []).map((city) => (
                      <SelectItem key={city.id} value={city.id}>
                        {city.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Período (mês/ano)</Label>
                <Popover open={periodPickerOpen} onOpenChange={setPeriodPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full min-w-0 justify-start text-left font-normal",
                        normalizedSelectedPeriod === "all" && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {periodCalendarSelected
                          ? format(periodCalendarSelected, "MMMM 'de' yyyy", { locale: ptBR })
                          : "Selecionar mês e ano"}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto max-w-[min(100vw-1rem,20rem)] overflow-hidden border-border bg-popover p-0 text-popover-foreground shadow-lg"
                    align="start"
                  >
                    <div className="grid grid-cols-2 gap-2 border-b border-border px-3 pb-2 pt-3">
                      <div className="min-w-0 space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Mês</span>
                        <Select
                          value={String(periodDraft.m)}
                          onValueChange={(v) => {
                            const mi = parseInt(v, 10);
                            const y = periodDraft.y;
                            setPeriodDraft({ y, m: mi });
                            const p = normalizeResultsPeriodYm(`${y}-${String(mi + 1).padStart(2, "0")}`);
                            if (p !== "all") handleFilterChange("periodo", p);
                          }}
                        >
                          <SelectTrigger className="h-9 w-full min-w-0">
                            <SelectValue placeholder="Mês" />
                          </SelectTrigger>
                          <SelectContent>
                            {RESULTS_MONTH_NAMES_PT.map((name, i) => (
                              <SelectItem key={name} value={String(i)}>
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
                            const p = normalizeResultsPeriodYm(`${y}-${String(mi + 1).padStart(2, "0")}`);
                            if (p !== "all") handleFilterChange("periodo", p);
                          }}
                        >
                          <SelectTrigger className="h-9 w-full min-w-0">
                            <SelectValue placeholder="Ano" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {Array.from(
                              { length: getResultsPeriodYearMax() - RESULTS_PERIOD_YEAR_MIN + 1 },
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
                        const p = normalizeResultsPeriodYm(`${y}-${String(m + 1).padStart(2, "0")}`);
                        if (p !== "all") handleFilterChange("periodo", p);
                      }}
                      selected={periodCalendarSelected}
                      captionLayout="buttons"
                      fromYear={RESULTS_PERIOD_YEAR_MIN}
                      toYear={getResultsPeriodYearMax()}
                      className="rounded-none border-0 bg-transparent p-0 text-popover-foreground shadow-none"
                      onSelect={(date) => {
                        if (!date) return;
                        const y = date.getFullYear();
                        const m = date.getMonth();
                        setPeriodDraft({ y, m });
                        const p = normalizeResultsPeriodYm(format(date, "yyyy-MM"));
                        if (p !== "all") {
                          handleFilterChange("periodo", p);
                          setPeriodPickerOpen(false);
                        }
                      }}
                      initialFocus
                    />
                    <div className="space-y-2 border-t border-border bg-muted/15 px-3 py-2.5 dark:bg-muted/25">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          handleFilterChange("periodo", "");
                          setPeriodPickerOpen(false);
                        }}
                      >
                        Limpar período
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="monitoramento-origem">
                  {filters.tipo_origem === "avaliacao" ? "Avaliação" : "Cartão-resposta"}
                </Label>
                <InstrumentPickerField
                  id="monitoramento-origem"
                  value={sourceSelectValue}
                  onChange={(value) => {
                    const nextValue = value === "all" ? "" : value;
                    if (filters.tipo_origem === "avaliacao") handleFilterChange("avaliacao_id", nextValue);
                    else handleFilterChange("gabarito_id", nextValue);
                  }}
                  items={toInstrumentPickerItems(
                    sourceItems.map((item) => ({ id: item.id, nome: item.name }))
                  )}
                  seriesOptions={toInstrumentPickerSeries(
                    pickerSourceQuery.data?.series_disponiveis ?? []
                  )}
                  disabled={!geoFiltersReady || isLoadingFilters || optionsQuery.isError}
                  loading={isLoadingFilters}
                  modalLoading={
                    pickerSourceQuery.isLoading ||
                    (pickerSourceQuery.isFetching && sourceItems.length === 0)
                  }
                  placeholder={
                    !geoFiltersReady
                      ? "Selecione estado e município antes"
                      : noSourceItems
                        ? sourceEmptyLabel
                        : "Selecione a avaliação ou cartão"
                  }
                  modalTitle={
                    filters.tipo_origem === "avaliacao"
                      ? "Selecionar avaliação"
                      : "Selecionar cartão resposta"
                  }
                  emptyMessage={sourceEmptyLabel}
                  contextLines={pickerContextLines}
                  contextRequiredMessage="Selecione estado e município nos filtros antes de escolher."
                  onModalOpen={() => {
                    setPickerModalFilters({ serieFiltro: "all", nome: "" });
                    void pickerSourceQuery.refetch();
                  }}
                  onModalFiltersChange={setPickerModalFilters}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="monitoramento-escola">Escola</Label>
                <Select
                  value={filters.escola_id || "all"}
                  onValueChange={(v) => handleFilterChange("escola_id", v === "all" ? "" : v)}
                  disabled={!selectedSourceId || isLoadingFilters || escolaLocked}
                >
                  <SelectTrigger id="monitoramento-escola" className="w-full min-w-0">
                    <SelectValue
                      placeholder={
                        !selectedSourceId
                          ? "Selecione a avaliação ou cartão antes"
                          : "Todas as escolas"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as escolas</SelectItem>
                    {(optionsQuery.data?.escolas || []).map((school) => (
                      <SelectItem key={school.id} value={school.id}>
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="monitoramento-disciplina">Disciplina</Label>
                <Select
                  value={filters.disciplina || "all"}
                  onValueChange={(v) => handleFilterChange("disciplina", v === "all" ? "" : v)}
                  disabled={!selectedSourceId || isLoadingFilters}
                >
                  <SelectTrigger id="monitoramento-disciplina" className="w-full min-w-0">
                    <SelectValue
                      placeholder={
                        !selectedSourceId ? "Selecione a avaliação ou cartão antes" : "Todas"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {(optionsQuery.data?.disciplinas || []).map((item) => (
                      <SelectItem key={item.id} value={item.name}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="monitoramento-serie">Série</Label>
                <Select
                  value={filters.serie_id || "all"}
                  onValueChange={(v) => handleFilterChange("serie_id", v === "all" ? "" : v)}
                  disabled={!selectedSourceId || isLoadingFilters}
                >
                  <SelectTrigger id="monitoramento-serie" className="w-full min-w-0">
                    <SelectValue
                      placeholder={
                        !selectedSourceId
                          ? "Selecione a avaliação ou cartão antes"
                          : (optionsQuery.data?.series?.length ?? 0) === 0
                            ? "Sem série nesta avaliação"
                            : "Todas"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {(optionsQuery.data?.series || []).map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="monitoramento-turma">Turma</Label>
                <Select
                  value={filters.turma_id || "all"}
                  onValueChange={(v) => handleFilterChange("turma_id", v === "all" ? "" : v)}
                  disabled={!filters.escola_id || !selectedSourceId || isLoadingFilters}
                >
                  <SelectTrigger id="monitoramento-turma" className="w-full min-w-0">
                    <SelectValue
                      placeholder={
                        !filters.escola_id ? "Selecione a escola antes" : "Todas"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {(optionsQuery.data?.turmas || []).map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="monitoramento-coordenador">{editorFieldLabel}</Label>
                <Popover open={editorComboOpen} onOpenChange={setEditorComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="monitoramento-coordenador"
                      variant="outline"
                      role="combobox"
                      aria-expanded={editorComboOpen}
                      disabled={!selectedSourceId || !editorSchoolId}
                      className="h-10 w-full min-w-0 justify-between font-normal"
                    >
                      <span className="truncate">
                        {selectedEditorLabel ||
                          (!selectedSourceId
                            ? "Selecione a avaliação ou cartão antes"
                            : !editorSchoolId
                              ? "Visão de todas as escolas — selecione uma escola"
                              : editorOptions.length
                                ? `Buscar ${editorFieldLabel.toLowerCase()}...`
                                : `Nenhum ${editorFieldLabel.toLowerCase()} disponível`)}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar por nome..." />
                      <CommandList>
                        <CommandEmpty>Nenhum nome encontrado.</CommandEmpty>
                        <CommandGroup>
                          {!isSemedEditor ? (
                            <CommandItem
                              value="__clear__"
                              onSelect={() => {
                                handleFilterChange("coordenador_id", "");
                                setEditorComboOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  !filters.coordenador_id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              Selecione
                            </CommandItem>
                          ) : null}
                          {editorOptions.map((item) => (
                            <CommandItem
                              key={item.id}
                              value={`${item.name} ${item.id}`}
                              onSelect={() => {
                                handleFilterChange("coordenador_id", item.id);
                                setEditorComboOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  effectiveEditorId === item.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span className="truncate">
                                {item.name}
                                {item.id === user?.id ? " (você)" : ""}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {isSemedEditor && canEdit && !filters.coordenador_id && user?.name ? (
                  <p className="text-xs text-muted-foreground">
                    Usando <strong>{user.name}</strong> como {editorFieldLabel.toLowerCase()}. Escolha outro nome na lista, se
                    necessário.
                  </p>
                ) : null}
              </div>
            </div>

            {!canEdit ? (
              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription>
                  {!editorSchoolId
                    ? "Na visão de todas as escolas, selecione uma escola no filtro ou em Abrir para escolher o Coordenador. Sem coordenador na escola, listamos Tec Admin do município."
                    : `Selecione o ${editorFieldLabel} no campo acima.`}
                </AlertDescription>
              </Alert>
            ) : editorLabel ? (
              <p className="text-xs text-muted-foreground">
                {editorFieldLabel}: <strong>{editorLabel}</strong>
              </p>
            ) : null}
          </CardContent>
        </Card>

        {selectedSourceId ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <MonitoringKpiCard
              variant="purple"
              title="Relatórios"
              value={totalRelatorios}
              isLoading={isListLoading}
              icon={<FileText className="h-7 w-7" />}
              footer={
                <>
                  <span className="text-muted-foreground">=</span>
                  <span>Total de alunos avaliados (Básico ou Abaixo do Básico)</span>
                </>
              }
            />
            <MonitoringKpiCard
              variant="green"
              title="Vistos"
              value={`${taxaVistos}%`}
              isLoading={isListLoading}
              icon={<Eye className="h-7 w-7" />}
              footer={
                <>
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  <span>
                    {totalVistos} de {totalRelatorios} relatórios · taxa de visualização
                  </span>
                </>
              }
            />
            <MonitoringKpiCard
              variant="red"
              title="Não vistos"
              value={totalNaoVistos}
              isLoading={isListLoading}
              icon={<EyeOff className="h-7 w-7" />}
              footer={
                <>
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="font-medium">Ação necessária</span>
                </>
              }
            />
          </div>
        ) : null}

        {selectedSourceId ? (
          <Card>
            <CardContent className="space-y-5 pt-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Preenchidas
                      </p>
                      <p className="mt-2 text-2xl font-bold tabular-nums">
                        {totalPreenchidas}/{totalRelatorios}
                        <span className="ml-2 text-base font-semibold text-muted-foreground">
                          · {preenchidasPct}%
                        </span>
                      </p>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
                      <ClipboardCheck className="h-5 w-5" />
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Realizadas
                      </p>
                      <p className="mt-2 text-2xl font-bold tabular-nums">
                        {totalRealizadas}
                        <span className="ml-2 text-base font-semibold text-muted-foreground">
                          · {realizadasPct}%
                        </span>
                      </p>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Pendentes / Não realizadas
                      </p>
                      <p className="mt-2 text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
                        {totalPendentesNaoRealizadas}
                      </p>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
                      <XCircle className="h-5 w-5" />
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {showClassTable ? "Turmas no recorte" : "Escolas no recorte"}
                      </p>
                      <p className="mt-2 text-2xl font-bold tabular-nums">{escolasNoRecorte}</p>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <Building2 className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              </div>
              {totalRelatorios > 0 ? (
                <div className="space-y-2 border-t pt-4">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      Progresso geral de execução das ações
                    </span>
                    <span className="tabular-nums">{acoesPct}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all"
                      style={{ width: `${acoesPct}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {selectedSourceId ? (
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building2 className="h-5 w-5 text-primary" />
                  Tabela de Monitoramento
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {showClassTable
                    ? "Linhas destacadas indicam turmas com ≥20% dos alunos em Abaixo do Básico."
                    : "Linhas destacadas indicam escolas com ≥20% dos alunos em Abaixo do Básico."}
                </p>
              </div>
              {!filters.escola_id ? (
                <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary/5 text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Visão SEMED
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!filters.escola_id ? (
              <div className="border-b bg-primary/5 px-4 py-3 text-xs font-medium text-primary">
                Visão SEMED · agregada por escola — clique em <strong>Abrir</strong> para ver os alunos em um modal (a lista de
                escolas permanece visível).
              </div>
            ) : showClassTable ? (
              <div className="border-b bg-primary/5 px-4 py-3 text-xs font-medium text-primary">
                Visão por turma
                {filters.serie_id ? " da série selecionada" : ""}
                {filters.turma_id ? " — turma filtrada" : ""} — clique em <strong>Abrir</strong> para ver os alunos.
              </div>
            ) : null}

            {isListLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-10 w-full" />
                ))}
              </div>
            ) : listQuery.isError ? (
              <div className="p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Erro ao carregar dados de {showClassTable ? "turmas" : "escolas"}.
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => listQuery.refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto max-w-full results-table-scroll">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-7 px-1 text-xs uppercase tracking-wide",
                              (showClassTable
                                ? schoolSort.by === "turma_nome" || schoolSort.by === "escola_nome"
                                : schoolSort.by === "escola_nome") && "bg-muted/60"
                            )}
                            onClick={() => handleSchoolSort(showClassTable ? "turma_nome" : "escola_nome")}
                          >
                            {showClassTable ? "Turma" : "Escola"}
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-7 px-1 text-xs uppercase tracking-wide",
                              schoolSort.by === "total_alunos" && "bg-muted/60"
                            )}
                            onClick={() => handleSchoolSort("total_alunos")}
                          >
                            Alunos
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-7 px-1 text-xs uppercase tracking-wide",
                              schoolSort.by === "abaixo_basico" && "bg-muted/60"
                            )}
                            onClick={() => handleSchoolSort("abaixo_basico")}
                          >
                            Abaixo Básico
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-7 px-1 text-xs uppercase tracking-wide",
                              schoolSort.by === "basico" && "bg-muted/60"
                            )}
                            onClick={() => handleSchoolSort("basico")}
                          >
                            Básico
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-7 px-1 text-xs uppercase tracking-wide",
                              schoolSort.by === "adequado" && "bg-muted/60"
                            )}
                            onClick={() => handleSchoolSort("adequado")}
                          >
                            Adequado
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-7 px-1 text-xs uppercase tracking-wide",
                              schoolSort.by === "avancado" && "bg-muted/60"
                            )}
                            onClick={() => handleSchoolSort("avancado")}
                          >
                            Avançado
                            <ArrowUpDown className="ml-1 h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead className="text-center text-xs uppercase tracking-wide">Ações</TableHead>
                        <TableHead className="text-center text-xs uppercase tracking-wide">Vistos SEMED</TableHead>
                        <TableHead className="text-right text-xs uppercase tracking-wide">Detalhar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {showClassTable
                        ? (classesQuery.data?.items || []).map((turma) => {
                            const pctAbaixo = turma.total_alunos
                              ? (turma.abaixo_basico / turma.total_alunos) * 100
                              : 0;
                            const isCritical = pctAbaixo >= 20;
                            const isDetailOpen =
                              studentsModalOpen && filters.turma_id === turma.turma_id;

                            return (
                              <TableRow
                                key={turma.turma_id}
                                className={cn(
                                  "transition-colors hover:bg-muted/30",
                                  isDetailOpen && "bg-primary/5",
                                  isCritical && "bg-destructive/5"
                                )}
                              >
                                <TableCell className="font-medium">
                                  <div>{turma.turma_nome}</div>
                                  <div className="text-xs font-normal text-muted-foreground">
                                    {turma.serie_nome}
                                    {turma.shift ? ` · ${turma.shift}` : ""}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center tabular-nums">{turma.total_alunos}</TableCell>
                                <TableCell className="text-center">
                                  <MonitoringLevelCount
                                    count={turma.abaixo_basico}
                                    total={turma.total_alunos}
                                    nivel="Abaixo do Básico"
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  <MonitoringLevelCount
                                    count={turma.basico}
                                    total={turma.total_alunos}
                                    nivel="Básico"
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  <MonitoringLevelCount
                                    count={turma.adequado}
                                    total={turma.total_alunos}
                                    nivel="Adequado"
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  <MonitoringLevelCount
                                    count={turma.avancado}
                                    total={turma.total_alunos}
                                    nivel="Avançado"
                                  />
                                </TableCell>
                                <TableCell className="text-center tabular-nums">
                                  {turma.acoes_realizadas}/{turma.total_alunos}
                                </TableCell>
                                <TableCell className="text-center tabular-nums">
                                  {turma.vistos_semed}/{turma.total_alunos}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant={isDetailOpen ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => openClassDetail(turma.turma_id)}
                                  >
                                    {isDetailOpen ? "Visualizando" : "Abrir"}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        : (schoolsQuery.data?.items || []).map((school) => {
                            const pctAbaixo = school.total_alunos
                              ? (school.abaixo_basico / school.total_alunos) * 100
                              : 0;
                            const isCritical = pctAbaixo >= 20;
                            const isDetailOpen =
                              studentsModalOpen && selectedSchoolId === school.escola_id;

                            return (
                              <TableRow
                                key={school.escola_id}
                                className={cn(
                                  "transition-colors hover:bg-muted/30",
                                  isDetailOpen && "bg-primary/5",
                                  isCritical && "bg-destructive/5"
                                )}
                              >
                                <TableCell className="font-medium">{school.escola_nome}</TableCell>
                                <TableCell className="text-center tabular-nums">{school.total_alunos}</TableCell>
                                <TableCell className="text-center">
                                  <MonitoringLevelCount
                                    count={school.abaixo_basico}
                                    total={school.total_alunos}
                                    nivel="Abaixo do Básico"
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  <MonitoringLevelCount
                                    count={school.basico}
                                    total={school.total_alunos}
                                    nivel="Básico"
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  <MonitoringLevelCount
                                    count={school.adequado}
                                    total={school.total_alunos}
                                    nivel="Adequado"
                                  />
                                </TableCell>
                                <TableCell className="text-center">
                                  <MonitoringLevelCount
                                    count={school.avancado}
                                    total={school.total_alunos}
                                    nivel="Avançado"
                                  />
                                </TableCell>
                                <TableCell className="text-center tabular-nums">
                                  {school.acoes_realizadas}/{school.total_alunos}
                                </TableCell>
                                <TableCell className="text-center tabular-nums">
                                  {school.vistos_semed}/{school.total_alunos}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant={isDetailOpen ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => openSchoolDetail(school.escola_id)}
                                  >
                                    {isDetailOpen ? "Visualizando" : "Abrir"}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      {!listQuery.data?.items?.length && (
                        <TableRow>
                          <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                            Nenhum resultado encontrado para os filtros selecionados.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    Mostrando {listFrom}-{listTo} de {listPagination?.total || 0}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!listPagination || listPagination.page <= 1}
                      onClick={() => setSchoolPage((prev) => Math.max(1, prev - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!listPagination || listPagination.page >= listPagination.total_pages}
                      onClick={() => setSchoolPage((prev) => prev + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        ) : null}

      </div>

      <Dialog
        open={studentsModalOpen}
        onOpenChange={(open) => {
          setStudentsModalOpen(open);
          if (!open) {
            setSelectedSchoolId("");
            setStudentPage(1);
            setSearchText("");
            setStudentSort({ by: "aluno_nome", order: "asc" });
          }
        }}
      >
        <DialogContent className="flex max-h-[92vh] w-[min(96vw,1400px)] max-w-[min(96vw,1400px)] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-3 border-b px-6 py-4 text-left">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div className="space-y-1">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5 text-primary" />
                  Detalhamento de Alunos
                </DialogTitle>
                {activeSchoolName ? (
                  <p className="text-sm text-muted-foreground">{activeSchoolName}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportDetalhamentoPdf}
                  disabled={isGeneratingDetalhamentoPdf || studentsQuery.isLoading || !studentsRows.length}
                >
                  {isGeneratingDetalhamentoPdf ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Exportar PDF
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={saveAllRows}
                  disabled={!canEdit || savingAllRows || saveMutation.isPending || studentsQuery.isLoading}
                >
                  {savingAllRows ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Salvar todas
                </Button>
              </div>
            </div>
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por aluno, turma ou série"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </DialogHeader>
          <div className="monitoring-modal-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {studentsQuery.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-12 w-full" />
                ))}
              </div>
            ) : studentsQuery.isError ? (
              <div className="p-6 text-center">
                <p className="text-sm text-muted-foreground">Erro ao carregar detalhamento de alunos.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => studentsQuery.refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <>
                <div className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                  Linhas em destaque = <strong>Abaixo do Básico</strong> · salve cada linha para registrar no histórico.
                </div>
                <div className="overflow-x-auto max-w-full pb-1 results-table-scroll">
                  <Table className="min-w-[1100px]">
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <MonitoringSortableHead
                          label="Aluno"
                          sortKey="aluno_nome"
                          activeSort={studentSort}
                          onSort={handleStudentSort}
                        />
                        <MonitoringSortableHead
                          label="Nota"
                          sortKey="nota"
                          activeSort={studentSort}
                          onSort={handleStudentSort}
                          align="center"
                        />
                        <MonitoringSortableHead
                          label="Nível"
                          sortKey="nivel"
                          activeSort={studentSort}
                          onSort={handleStudentSort}
                          align="center"
                        />
                        <MonitoringSortableHead
                          label="Ação pedagógica"
                          sortKey="acao_pedagogica"
                          activeSort={studentSort}
                          onSort={handleStudentSort}
                        />
                        <MonitoringSortableHead
                          label="Responsável"
                          sortKey="responsavel_nome"
                          activeSort={studentSort}
                          onSort={handleStudentSort}
                        />
                        <MonitoringSortableHead
                          label="Prazo"
                          sortKey="prazo"
                          activeSort={studentSort}
                          onSort={handleStudentSort}
                          align="center"
                        />
                        <MonitoringSortableHead
                          label="Status"
                          sortKey="status"
                          activeSort={studentSort}
                          onSort={handleStudentSort}
                          align="center"
                        />
                        <MonitoringSortableHead
                          label="Realizada em"
                          sortKey="realizada_em"
                          activeSort={studentSort}
                          onSort={handleStudentSort}
                          align="center"
                        />
                        <MonitoringSortableHead
                          label="Esc."
                          sortKey="feita_pela_escola"
                          activeSort={studentSort}
                          onSort={handleStudentSort}
                          align="center"
                        />
                        <MonitoringSortableHead
                          label="SEMED"
                          sortKey="vista_pela_semed"
                          activeSort={studentSort}
                          onSort={handleStudentSort}
                          align="center"
                        />
                        <TableHead className="text-right text-xs uppercase tracking-wide">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentsRows.map((row) => {
                        const rowStatus = (getDraftValue(row, "status") as string) || "pendente";
                        const rowId = getStudentRowId(row);
                        const isSaving = savingRowId === rowId;

                        return (
                          <TableRow
                            key={rowId}
                            className={cn(
                              "transition-colors hover:bg-muted/30",
                              isAbaixoBasico(row.nivel) && "bg-destructive/5"
                            )}
                          >
                            <TableCell className="min-w-[220px]">
                              <p className="font-medium">{row.aluno_nome}</p>
                              <p className="text-xs text-muted-foreground">
                                {row.serie} · {row.turma}
                                {row.shift ? ` · ${row.shift}` : ""}
                              </p>
                              {(row.disciplinas_criticas?.length || row.descritores_criticos?.length) ? (
                                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                  {(() => {
                                    const blocks =
                                      row.disciplinas_criticas?.length
                                        ? row.disciplinas_criticas
                                        : [
                                            {
                                              disciplina: "",
                                              nivel: row.nivel,
                                              descritores_criticos: row.descritores_criticos,
                                            },
                                          ];
                                    const filtroDisciplina = filters.disciplina?.trim();
                                    if (filtroDisciplina && blocks.length === 1) {
                                      const codes = (blocks[0].descritores_criticos ?? []).filter(Boolean);
                                      return codes.length ? (
                                        <p>
                                          <span className="font-medium text-foreground">Críticos:</span>{" "}
                                          <CriticalSkillCodes
                                            codes={codes}
                                            disciplinaLabel={filtroDisciplina}
                                            onOpen={(codigo, disciplina) =>
                                              openSkillDetail(codigo, disciplina, row)
                                            }
                                          />
                                        </p>
                                      ) : null;
                                    }
                                    return blocks.map((block) => {
                                      const disciplina = block.disciplina?.trim() || "Geral";
                                      const codes = (block.descritores_criticos ?? []).filter(Boolean);
                                      return (
                                        <p key={`${row.aluno_id}-${disciplina}`}>
                                          <span className="font-medium text-foreground">{disciplina}:</span>{" "}
                                          {codes.length ? (
                                            <CriticalSkillCodes
                                              codes={codes}
                                              disciplinaLabel={disciplina}
                                              onOpen={(codigo, disc) => openSkillDetail(codigo, disc, row)}
                                            />
                                          ) : (
                                            block.nivel
                                          )}
                                        </p>
                                      );
                                    });
                                  })()}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell className="font-semibold tabular-nums">
                              {Number(row.nota || 0).toFixed(1).replace(".", ",")}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={cn(getReportProficiencyTagClass(row.nivel), "normal-case tracking-normal")}
                              >
                                {row.nivel}
                              </Badge>
                            </TableCell>
                            <TableCell className="min-w-[240px]">
                              <Textarea
                                value={String(getDraftValue(row, "acao_pedagogica") || "")}
                                onChange={(e) => updateDraft(row, { acao_pedagogica: e.target.value })}
                                placeholder="Descreva a ação pedagógica..."
                                className="min-h-[84px] text-sm"
                                disabled={!canEdit}
                              />
                            </TableCell>
                            <TableCell className="min-w-[180px]">
                              <Input
                                value={String(getDraftValue(row, "responsavel_nome") || "")}
                                onChange={(e) => updateDraft(row, { responsavel_nome: e.target.value })}
                                placeholder="Nome do responsável"
                                className="min-w-[160px] text-sm"
                                disabled={!canEdit}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="date"
                                value={formatDateToInput(getDraftValue(row, "prazo") as string | null)}
                                onChange={(e) => updateDraft(row, { prazo: e.target.value || null })}
                                disabled={!canEdit}
                                className="min-w-[140px]"
                              />
                            </TableCell>
                            <TableCell className="min-w-[160px]">
                              <Select
                                value={rowStatus}
                                onValueChange={(value) =>
                                  updateDraft(row, { status: value as MonitoringStudentItem["status"] })
                                }
                                disabled={!canEdit}
                              >
                                <SelectTrigger
                                  className={cn("w-full min-w-0 font-medium", getMonitoringStatusClass(rowStatus))}
                                >
                                  <SelectValue>{getStatusLabel(rowStatus)}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {statusOptions.map((status) => (
                                    <SelectItem key={status.id} value={status.id}>
                                      {status.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="date"
                                value={formatDateToInput(getDraftValue(row, "realizada_em") as string | null)}
                                onChange={(e) => updateDraft(row, { realizada_em: e.target.value || null })}
                                disabled={!canEdit}
                                className="min-w-[140px]"
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={Boolean(getDraftValue(row, "feita_pela_escola"))}
                                onCheckedChange={(checked) =>
                                  updateDraft(row, { feita_pela_escola: Boolean(checked) })
                                }
                                disabled={!canEdit}
                                aria-label="Feita pela escola"
                              />
                            </TableCell>
                            <TableCell className="text-center">
                            <Checkbox
                              checked={Boolean(getDraftValue(row, "vista_pela_semed"))}
                              onCheckedChange={(checked) =>
                                updateDraft(row, { vista_pela_semed: Boolean(checked) })
                              }
                              disabled={!canEdit || !canMarkSemed}
                              aria-label="Vista pela SEMED"
                            />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => saveRow(row)}
                                  disabled={!canEdit || isSaving || savingAllRows}
                                  aria-label="Salvar ação pedagógica"
                                >
                                  {isSaving ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Save className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={!row.acao_id}
                                  onClick={() => {
                                    if (!row.acao_id) return;
                                    setHistoryActionId(row.acao_id);
                                    setHistoryOpen(true);
                                  }}
                                  aria-label="Ver histórico"
                                >
                                  <History className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {!studentsRows.length && (
                        <TableRow>
                          <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                            Nenhum aluno encontrado no recorte selecionado.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    Mostrando {studentsFrom}-{studentsTo} de {studentsPagination?.total || 0}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!studentsPagination || studentsPagination.page <= 1}
                      onClick={() => setStudentPage((prev) => Math.max(1, prev - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        !studentsPagination || studentsPagination.page >= studentsPagination.total_pages
                      }
                      onClick={() => setStudentPage((prev) => prev + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileClock className="h-4 w-4 text-primary" />
              Histórico da ação pedagógica
            </DialogTitle>
          </DialogHeader>
          {historyQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <Skeleton key={idx} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {(historyQuery.data?.items || []).map((entry) => (
                <Card key={entry.id}>
                  <CardContent className="pt-4 text-sm">
                    <p className="font-medium">{entry.changed_by_name || "Usuário"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.changed_at).toLocaleString("pt-BR")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(entry.changed_fields || []).map((field) => (
                        <Badge key={field} variant="outline">
                          {field}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!historyQuery.data?.items?.length && (
                <p className="text-sm text-muted-foreground">Ainda não há histórico para esta ação.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <MonitoringSkillDetailDialog
        open={skillDetailOpen}
        onOpenChange={setSkillDetailOpen}
        request={skillDetailRequest}
        pageFilters={filters}
      />
    </>
  );
};

export default MonitoringPage;
