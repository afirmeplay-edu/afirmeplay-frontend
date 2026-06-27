import { useState, useEffect, useRef, useMemo } from "react";
import { isAxiosError } from "axios";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileText,
  Download,
  Trash2,
  Users,
  Plus,
  Search,
  Filter,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  MoreVertical,
  Send,
  Upload,
  Images,
  X,
  Loader2,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBatchCorrection } from "@/hooks/useBatchCorrection";
import { api } from "@/lib/api";
import { fetchAuthenticatedDownload } from "@/lib/fetch-authenticated-download";
import { useAuth } from "@/context/authContext";
import { hasCorretorStyleEvalAccess } from "@/utils/restrictedStaffAccess";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/** Resposta GET /physical-tests/test/<test_id>/scope */
interface TestScopeClass {
  id: string;
  name: string;
}
interface TestScopeGrade {
  id: string;
  name: string;
  classes: TestScopeClass[];
}
interface TestScopeSchool {
  id: string;
  name: string;
  grades: TestScopeGrade[];
}
interface TestScopeResponse {
  test_id: string;
  test_title: string;
  schools: TestScopeSchool[];
}

interface PhysicalTestStatus {
  applied_applications: number;
  can_generate_forms: boolean;
  class_tests: Array<{
    id: string;
    class_id: string;
    status: string;
    application: string;
    expiration: string;
  }>;
  reason: string;
  total_applications: number;
  // Campos opcionais que podem não estar presentes
  test_id?: string;
  test_title?: string;
  test_status?: string;
  has_physical_forms?: boolean;
  total_forms?: number;
}

interface GeneratedForm {
  id: string;
  test_id: string;
  student_id: string;
  student_name: string;
  class_test_id: string;
  form_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  // Campos opcionais que podem não estar presentes na API
  form_pdf_url?: string | null;
  answer_sheet_url?: string | null;
  correction_image_url?: string | null;
  has_pdf_data?: boolean;
  has_answer_sheet_data?: boolean;
  has_correction_data?: boolean;
  qr_code_data?: string;
  qr_code_coordinates?: any;
  is_corrected?: boolean;
  generated_at?: string;
  corrected_at?: string | null;
  processed_at?: string | null;
  answer_sheet_sent_at?: string | null;
}

/** Resposta GET /physical-tests/task/<task_id>/status */
interface TaskStatusProgress {
  current: number;
  total: number;
  percentage: number;
}
interface TaskStatusSummary {
  total_classes: number;
  completed_classes: number;
  successful_classes: number;
  failed_classes: number;
  total_students: number;
  completed_students: number;
  successful_students: number;
  failed_students: number;
  zip_minio_url?: string | null;
  can_download: boolean;
}
interface TaskStatusClassError {
  student_id?: string;
  student_name?: string;
  error: string;
}
interface TaskStatusClass {
  class_id: string;
  class_name: string;
  school_name: string;
  status: "pending" | "processing" | "completed" | "completed_with_errors";
  total_students: number;
  completed: number;
  successful: number;
  failed: number;
  errors: TaskStatusClassError[];
}
interface TaskStatusErrorItem {
  class_id?: string;
  class_name?: string;
  school_name?: string;
  student_id?: string;
  student_name?: string;
  error: string;
}
interface TaskStatusResult {
  success?: boolean;
  test_id?: string;
  test_title?: string;
  total_questions?: number;
  total_students?: number;
  generated_forms?: number;
  minio_url?: string;
  download_size_bytes?: number;
  forms?: Array<{
    student_id?: string;
    student_name?: string;
    form_id?: string;
    form_type?: string;
    created_at?: string;
  }>;
  message?: string;
}
type TaskStatusPhase = "generating" | "saving" | "zipping" | "uploading" | "done";
interface TaskStatusResponse {
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  message?: string;
  phase?: TaskStatusPhase;
  error?: string;
  progress?: TaskStatusProgress;
  summary?: TaskStatusSummary | null;
  classes?: TaskStatusClass[];
  errors?: TaskStatusErrorItem[] | null;
  result?: TaskStatusResult;
}

const getGenerationStorageKey = (testId: string) =>
  `physical-test-generation:${testId}`;

function classStatusLabel(status: TaskStatusClass["status"]) {
  switch (status) {
    case "pending":
      return "Aguardando";
    case "processing":
      return "Processando";
    case "completed":
      return "Concluída";
    case "completed_with_errors":
      return "Concluída com erros";
    default:
      return status;
  }
}

function classStatusVariant(status: TaskStatusClass["status"]) {
  switch (status) {
    case "pending":
      return "secondary";
    case "processing":
      return "default";
    case "completed":
      return "default";
    case "completed_with_errors":
      return "destructive";
    default:
      return "secondary";
  }
}

function phaseLabel(phase: TaskStatusPhase | undefined) {
  switch (phase) {
    case "generating":
      return "Gerando PDFs";
    case "saving":
      return "Salvando no banco de dados";
    case "zipping":
      return "Criando ZIP para download";
    case "uploading":
      return "Enviando arquivos para o servidor";
    case "done":
      return "Concluído";
    default:
      return null;
  }
}

function phaseTone(phase: TaskStatusPhase | undefined) {
  switch (phase) {
    case "generating":
      return "text-primary";
    case "saving":
      return "text-primary";
    case "zipping":
      return "text-amber-700 dark:text-amber-300";
    case "uploading":
      return "text-amber-700 dark:text-amber-300";
    case "done":
      return "text-green-700 dark:text-green-300";
    default:
      return "text-muted-foreground";
  }
}

function GenerationProgressPanel({
  taskStatusData,
  isGenerating,
  correctionProgress,
  onDownloadAll,
  canDownloadAll,
  isDownloadingAll,
  onDismiss,
}: {
  taskStatusData: TaskStatusResponse | null;
  isGenerating: boolean;
  correctionProgress: number;
  onDownloadAll: () => void;
  canDownloadAll: boolean;
  isDownloadingAll: boolean;
  onDismiss?: () => void;
}) {
  const [errorsOpen, setErrorsOpen] = useState(true);
  const progressPct = taskStatusData?.progress?.percentage ?? correctionProgress;
  const summary = taskStatusData?.summary;
  const classesList = taskStatusData?.classes ?? [];
  const errorsList = taskStatusData?.errors ?? [];
  const status = taskStatusData?.status;
  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const canDownload = !!(summary?.can_download && canDownloadAll);
  const phase = taskStatusData?.phase;
  const phaseText = phaseLabel(phase);
  const showPhasePill =
    !!phaseText &&
    (status === "processing" || status === "completed") &&
    (progressPct >= 100 || phase !== "generating");

  return (
    <div className="mb-6 rounded-xl border bg-muted/30 p-5 space-y-5">
      {/* Mensagem e barra de progresso */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-sm font-medium text-foreground">
            {taskStatusData?.message ?? (isGenerating ? "Conectando ao servidor..." : "Status da geração")}
          </p>
          {showPhasePill && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium ${phaseTone(phase)}`}
              title={phaseText ?? undefined}
            >
              {phaseText}
              {status === "processing" && <Loader2 className="h-3 w-3 animate-spin" />}
            </span>
          )}
        </div>
        <Progress value={progressPct} className="h-2.5 w-full" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{progressPct}%</span>
          {taskStatusData?.progress && (
            <span>
              {taskStatusData.progress.current} / {taskStatusData.progress.total} alunos
            </span>
          )}
        </div>
      </div>

      {/* Resumo (turmas e alunos) */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-background p-3">
            <p className="text-xs text-muted-foreground">Turmas</p>
            <p className="text-lg font-semibold">
              {summary.completed_classes}/{summary.total_classes}
            </p>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <p className="text-xs text-muted-foreground">Alunos processados</p>
            <p className="text-lg font-semibold">
              {summary.completed_students}/{summary.total_students}
            </p>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <p className="text-xs text-muted-foreground">Sucesso</p>
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
              {summary.successful_students}
            </p>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <p className="text-xs text-muted-foreground">Falhas</p>
            <p className="text-lg font-semibold text-red-600 dark:text-red-400">
              {summary.failed_students}
            </p>
          </div>
        </div>
      )}

      {/* Lista de turmas */}
      {classesList.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Turmas</p>
          <ScrollArea className="h-[180px] rounded-lg border p-2">
            <ul className="space-y-1.5">
              {classesList.map((c) => (
                <li
                  key={c.class_id}
                  className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {c.status === "processing" && (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                    )}
                    {c.status === "completed" && (
                      <CheckCircle className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                    )}
                    {c.status === "completed_with_errors" && (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    )}
                    {c.status === "pending" && (
                      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="font-medium truncate">{c.class_name}</span>
                    <span className="text-muted-foreground truncate text-xs hidden sm:inline">
                      {c.school_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground text-xs">
                      {c.completed}/{c.total_students}
                    </span>
                    <Badge variant={classStatusVariant(c.status)} className="text-xs">
                      {classStatusLabel(c.status)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>
      )}

      {/* Erros (lista única turma + aluno) */}
      {errorsList.length > 0 && (
        <Collapsible open={errorsOpen} onOpenChange={setErrorsOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-destructive hover:underline">
            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform duration-200 ${errorsOpen ? "rotate-90" : ""}`}
            />
            Erros na geração ({errorsList.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ScrollArea className="h-[140px] mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2">
              <ul className="space-y-2 text-sm">
                {errorsList.map((err, i) => (
                  <li key={i} className="rounded bg-background/80 px-2 py-1.5">
                    <span className="font-medium">
                      {err.class_name && `${err.class_name} · `}
                      {err.student_name ?? "Aluno"}:{" "}
                    </span>
                    <span className="text-muted-foreground text-xs">{err.error}</span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Falha global */}
      {isFailed && taskStatusData?.error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{taskStatusData.error}</AlertDescription>
        </Alert>
      )}

      {/* Concluído: mensagem + Baixar ZIP + Fechar */}
      {isCompleted && (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
          <p className="text-sm text-green-600 dark:text-green-400 font-medium flex-1 min-w-0">
            {taskStatusData?.message ?? "Geração concluída."}
          </p>
          <div className="flex items-center gap-2">
            {canDownload && (
              <Button
                onClick={onDownloadAll}
                size="sm"
                disabled={isDownloadingAll}
                className="bg-green-600 hover:bg-green-700"
              >
                {isDownloadingAll ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Baixando...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Baixar ZIP
                  </>
                )}
              </Button>
            )}
            {onDismiss && (
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                Fechar
              </Button>
            )}
          </div>
        </div>
      )}

      {isGenerating && !isCompleted && !isFailed && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Não feche esta página.
        </p>
      )}
    </div>
  );
}

export default function PhysicalTestPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const isCorretor = hasCorretorStyleEvalAccess(user);

  // Estados principais
  const [isLoading, setIsLoading] = useState(true);
  const [testStatus, setTestStatus] = useState<PhysicalTestStatus | null>(null);
  const [generatedForms, setGeneratedForms] = useState<GeneratedForm[]>([]);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  // Estados para geração de formulários
  const [isGenerating, setIsGenerating] = useState(false);
  const [correctionProgress, setCorrectionProgress] = useState(0);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatusData, setTaskStatusData] = useState<TaskStatusResponse | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Estados para configuração de blocos
  const [useBlocks, setUseBlocks] = useState(false);
  const [numBlocks, setNumBlocks] = useState(2);
  const [questionsPerBlock, setQuestionsPerBlock] = useState(5);
  const [minutesPerBlock, setMinutesPerBlock] = useState(30);
  const [separateBySubject, setSeparateBySubject] = useState(false);

  // Escopo da prova (GET /scope) e seleção para geração
  const [testScope, setTestScope] = useState<TestScopeResponse | null>(null);
  const [generateScopeSchoolIds, setGenerateScopeSchoolIds] = useState<string[]>([]);
  const [generateScopeGradeIds, setGenerateScopeGradeIds] = useState<string[]>([]);
  const [generateScopeClassIds, setGenerateScopeClassIds] = useState<string[]>([]);

  // Estados para informações da avaliação (para validação)
  const [testTotalQuestions, setTestTotalQuestions] = useState<number | null>(null);
  const [testSubjects, setTestSubjects] = useState<string[]>([]);

  // Estados para correção única
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Estados para correção em lote
  const [showBatchCorrectionDialog, setShowBatchCorrectionDialog] = useState(false);
  const [batchImages, setBatchImages] = useState<{ file: File; preview: string }[]>([]);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const {
    isProcessing: isBatchProcessing,
    isCompleted: isBatchCompleted,
    progress: batchProgress,
    error: batchError,
    startBatchCorrection,
    reset: resetBatchCorrection,
  } = useBatchCorrection();

  // Estados para gerenciamento de formulários
  const [formToDelete, setFormToDelete] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMarkingAsSent, setIsMarkingAsSent] = useState<string | null>(null);
  const [formsSearchTerm, setFormsSearchTerm] = useState("");

  // Estados para alunos
  const [students, setStudents] = useState<any[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isGeneratingIndividual, setIsGeneratingIndividual] = useState(false);
  const [studentSearchTerm, setStudentSearchTerm] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState("all");
  const [totalStudents, setTotalStudents] = useState(0);
  const [classes, setClasses] = useState<any[]>([]);

  // Listas planas do escopo (para multi-selects), deduplicadas por id
  const scopeSchoolsList = useMemo(() => {
    if (!testScope?.schools?.length) return [];
    return testScope.schools.map((s) => ({ id: s.id, name: s.name }));
  }, [testScope]);

  const scopeGradesList = useMemo(() => {
    if (!testScope?.schools?.length) return [];
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    for (const school of testScope.schools) {
      for (const g of school.grades || []) {
        if (!seen.has(g.id)) {
          seen.add(g.id);
          list.push({ id: g.id, name: g.name });
        }
      }
    }
    return list;
  }, [testScope]);

  const scopeClassesList = useMemo(() => {
    if (!testScope?.schools?.length) return [];
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    for (const school of testScope.schools) {
      for (const g of school.grades || []) {
        for (const c of g.classes || []) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            list.push({ id: c.id, name: c.name });
          }
        }
      }
    }
    return list;
  }, [testScope]);

  const filteredGeneratedForms = useMemo(() => {
    if (!formsSearchTerm.trim()) return generatedForms;
    const term = formsSearchTerm.trim().toLowerCase();
    return generatedForms.filter(
      (form) =>
        (form.student_name ?? "").toLowerCase().includes(term)
    );
  }, [generatedForms, formsSearchTerm]);

  const checkPendingGeneration = async () => {
    if (!id) return;
    if (typeof window === "undefined") return;

    try {
      const storageKey = getGenerationStorageKey(id);
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return;

      const parsed = JSON.parse(stored) as { taskId?: string | null };
      if (!parsed?.taskId) {
        window.localStorage.removeItem(storageKey);
        return;
      }

      const response = await api.get(`/physical-tests/task/${parsed.taskId}/status`);
      const data = response.data as TaskStatusResponse;

      if (data.status === "processing" || data.status === "pending") {
        setIsGenerating(true);
        setTaskStatusData(data);
        setCorrectionProgress(data.progress?.percentage ?? 0);
        startPolling(parsed.taskId);
        return;
      }

      window.localStorage.removeItem(storageKey);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404 && id) {
        window.localStorage.removeItem(getGenerationStorageKey(id));
      } else {
        console.error("Erro ao verificar geração pendente:", error);
      }
    }
  };

  // Carregar dados iniciais
  useEffect(() => {
    if (id) {
      loadTestData();
      checkPendingGeneration();
    }
  }, [id]);

  // Cleanup do polling interval ao desmontar componente
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const loadTestData = async () => {
    try {
      setIsLoading(true);

      // Carregar status da prova
      const statusResponse = await api.get(`/physical-tests/test/${id}/status`);
      console.log("📊 Resposta da API de status:", statusResponse.data);
      console.log("🔍 Campo test_status:", statusResponse.data.test_status);
      console.log("🔍 Tipo do test_status:", typeof statusResponse.data.test_status);
      setTestStatus(statusResponse.data);

      // Carregar formulários gerados
      const formsResponse = await api.get(`/physical-tests/test/${id}/forms`);
      console.log("📋 Resposta da API de formulários:", formsResponse.data);
      // Garantir que o campo answer_sheet_sent_at seja preservado
      const forms = (formsResponse.data.forms || []).map((form: any) => ({
        ...form,
        answer_sheet_sent_at: form.answer_sheet_sent_at || null
      }));
      setGeneratedForms(forms);

      // Carregar escopo da prova (escolas/séries/turmas) para filtro de geração
      try {
        const scopeResponse = await api.get(`/physical-tests/test/${id}/scope`);
        setTestScope(scopeResponse.data as TestScopeResponse);
      } catch (scopeErr) {
        console.warn("Não foi possível carregar escopo da prova:", scopeErr);
        setTestScope(null);
      }

      // Buscar informações da avaliação para validação de blocos
      try {
        const testDetailsResponse = await api.get(`/test/${id}/details`);
        const testData = testDetailsResponse.data;
        console.log("🔍 Dados completos da avaliação:", testData);
        console.log("🔍 Estrutura das questões:", testData.questions?.[0]);

        // Extrair número total de questões
        const totalQuestions = testData.total_questions || testData.totalQuestions || testData.questions?.length || null;
        setTestTotalQuestions(totalQuestions);

        // Extrair disciplinas (subjects)
        let extractedSubjects: string[] = [];

        // Função auxiliar para extrair nome de disciplina
        const extractSubjectName = (subject: any): string | null => {
          if (!subject) return null;
          if (typeof subject === 'string') return subject;
          // Tentar vários campos comuns
          return subject.name || subject.title || subject.label || subject.discipline_name ||
            subject.subject_name || subject.id || null;
        };

        if (testData.questions && Array.isArray(testData.questions)) {
          const uniqueSubjects = new Set<string>();
          testData.questions.forEach((q: any) => {
            const subjectName = extractSubjectName(q.subject);
            if (subjectName) uniqueSubjects.add(subjectName);

            const disciplineName = extractSubjectName(q.discipline);
            if (disciplineName) uniqueSubjects.add(disciplineName);
          });
          extractedSubjects = Array.from(uniqueSubjects);
          setTestSubjects(extractedSubjects);
        } else if (testData.subject) {
          const subjectName = extractSubjectName(testData.subject);
          if (subjectName) {
            extractedSubjects = [subjectName];
            setTestSubjects(extractedSubjects);
          }
        } else if (testData.disciplines && Array.isArray(testData.disciplines)) {
          // Se houver um array de disciplinas
          extractedSubjects = testData.disciplines
            .map(extractSubjectName)
            .filter((name): name is string => name !== null);
          setTestSubjects(extractedSubjects);
        }

        console.log("📚 Informações da avaliação:", {
          totalQuestions,
          subjects: extractedSubjects
        });
      } catch (error) {
        console.warn("Não foi possível carregar detalhes da avaliação para validação:", error);
        // Não é crítico, apenas não teremos validação
      }

    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os dados da prova física.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startPolling = (taskId: string) => {
    if (!id) return;

    // Limpar intervalo anterior se existir
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Iniciar polling a cada 3 segundos
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await api.get(`/physical-tests/task/${taskId}/status`);
        const data = response.data as TaskStatusResponse;

        setTaskStatusData(data);
        const pct = data.progress?.percentage ?? 0;
        setCorrectionProgress(pct);

        // SUCESSO: parar polling e exibir resultado
        if (data.status === "completed") {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          setCorrectionProgress(100);
          setIsGenerating(false);

          if (typeof window !== "undefined" && id) {
            window.localStorage.removeItem(getGenerationStorageKey(id));
          }

          const result = data.result;
          const mappedForms = (result?.forms || []).map((form: any) => ({
            ...form,
            id: form.form_id || form.id,
            created_at: form.created_at || new Date().toISOString(),
            updated_at: form.created_at || new Date().toISOString(),
            status: "gerado",
            answer_sheet_sent_at: form.answer_sheet_sent_at || null,
          }));
          setGeneratedForms(mappedForms);

          const total = result?.generated_forms ?? result?.forms?.length ?? mappedForms.length;
          const totalStudents = result?.total_students ?? data.summary?.total_students;
          toast({
            title: "✅ Avaliações geradas com sucesso!",
            description: data.message || `${total} avaliações foram geradas${totalStudents ? ` para ${totalStudents} alunos` : ""}.`,
          });
          setCorrectionProgress(0);
        }

        // ERRO: parar polling e exibir erro
        if (data.status === "failed") {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          setIsGenerating(false);
          setCorrectionProgress(0);

          if (typeof window !== "undefined" && id) {
            window.localStorage.removeItem(getGenerationStorageKey(id));
          }

          toast({
            title: "❌ Erro ao gerar formulários",
            description: data.error || data.message || "Erro desconhecido ao gerar avaliações",
            variant: "destructive",
          });
        }

        if (data.status === "retrying") {
          toast({
            title: "🔄 Tentando novamente...",
            description: data.message || "Erro detectado. Nova tentativa em andamento.",
          });
        }

      } catch (error: any) {
        console.error("Erro ao verificar status da geração:", error);

        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        setIsGenerating(false);
        setCorrectionProgress(0);
        setTaskStatusData(null);

        if (typeof window !== "undefined" && id) {
          window.localStorage.removeItem(getGenerationStorageKey(id));
        }

        toast({
          title: "Erro",
          description: "Erro ao verificar status da geração. Tente novamente.",
          variant: "destructive",
        });
      }
    }, 3000); // Polling a cada 3 segundos

    // Timeout de segurança (15 minutos)
    setTimeout(() => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }

      if (isGenerating) {
        setIsGenerating(false);
        setCorrectionProgress(0);

        if (typeof window !== "undefined" && id) {
          window.localStorage.removeItem(getGenerationStorageKey(id));
        }

        toast({
          title: "⚠️ Timeout",
          description: "A geração está demorando mais do que o esperado. Por favor, verifique o status manualmente ou tente novamente.",
          variant: "destructive",
        });
      }
    }, 15 * 60 * 1000); // 15 minutos
  };

  const handleGenerateForms = async () => {
    if (!id) return;

    try {
      setIsGenerating(true);
      setTaskStatusData(null);
      setCorrectionProgress(0);
      setShowGenerateDialog(false); // Fechar dialog ao iniciar geração

      // Preparar payload com parâmetros de blocos no formato esperado pelo backend
      const payload: any = {
        force_regenerate: false // Adicionar parâmetro force_regenerate
      };

      if (separateBySubject) {
        // Se separar por disciplina, enviar blocks_config com separate_by_subject
        payload.blocks_config = {
          use_blocks: true,
          separate_by_subject: true,
          minutes_per_block: minutesPerBlock
        };
      } else if (useBlocks) {
        // Se usar blocos normais, enviar configurações de blocos
        payload.blocks_config = {
          use_blocks: true,
          num_blocks: numBlocks,
          questions_per_block: questionsPerBlock,
          separate_by_subject: false,
          minutes_per_block: minutesPerBlock
        };
      } else {
        // Se não usar blocos, enviar blocks_config com use_blocks: false
        payload.blocks_config = {
          use_blocks: false
        };
      }

      // Adicionar use_hybrid ao payload
      payload.use_hybrid = true;

      if (generateScopeSchoolIds.length > 0) payload.school_ids = generateScopeSchoolIds;
      if (generateScopeGradeIds.length > 0) payload.grade_ids = generateScopeGradeIds;
      if (generateScopeClassIds.length > 0) payload.class_ids = generateScopeClassIds;

      // 1. DISPARAR GERAÇÃO (retorna imediatamente com 202)
      const response = await api.post(`/physical-tests/test/${id}/generate-forms`, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Verificar se a resposta é 202 Accepted (assíncrono)
      if (response.status === 202) {
        const data = response.data;
        setTaskId(data.task_id);

        if (typeof window !== "undefined" && id) {
          try {
            window.localStorage.setItem(
              getGenerationStorageKey(id),
              JSON.stringify({
                taskId: data.task_id,
                startedAt: new Date().toISOString(),
              })
            );
          } catch (storageError) {
            console.warn("Não foi possível salvar geração no localStorage:", storageError);
          }
        }

        toast({
          title: "⏳ Geração iniciada",
          description: "Os formulários estão sendo gerados em background. Isso pode levar alguns minutos.",
        });

        // 2. INICIAR POLLING
        startPolling(data.task_id);
      } else {
        // Resposta síncrona (fallback para compatibilidade)
        setCorrectionProgress(100);

        const mappedForms = (response.data.forms || []).map((form: any) => ({
          ...form,
          id: form.form_id || form.id,
          created_at: form.created_at || new Date().toISOString(),
          updated_at: form.created_at || new Date().toISOString(),
          status: 'gerado',
          answer_sheet_sent_at: form.answer_sheet_sent_at || null
        }));
        setGeneratedForms(mappedForms);

        toast({
          title: "Avaliações geradas!",
          description: `${response.data.generated_forms || response.data.forms?.length || 0} avaliações foram geradas com sucesso.`,
        });

        setIsGenerating(false);
        setCorrectionProgress(0);
      }

    } catch (error: any) {
      console.error("Erro ao gerar formulários:", error);

      setIsGenerating(false);
      setCorrectionProgress(0);

      toast({
        title: "Erro",
        description: error.response?.data?.error || "Erro ao iniciar geração de avaliações",
        variant: "destructive",
      });
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedImage(file);

      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      console.log("📸 Imagem selecionada:", file.name);
    }
  };

  const handleProcessCorrection = async () => {
    if (!uploadedImage || !id) return;

    try {
      setIsProcessing(true);
      setCorrectionProgress(0);

      // Converter imagem para base64
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(uploadedImage);
      });

      // Simular progresso
      const progressInterval = setInterval(() => {
        setCorrectionProgress(prev => Math.min(prev + 15, 90));
      }, 300);

      const response = await api.post(`/physical-tests/test/${id}/process-correction`, {
        image: base64Image,
        use_hybrid: true
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      clearInterval(progressInterval);
      setCorrectionProgress(100);

      toast({
        title: "Correção processada!",
        description: "A correção foi realizada com sucesso.",
      });

      setShowCorrectionDialog(false);
      setUploadedImage(null);
      setPreviewImage(null);

    } catch (error: any) {
      console.error("Erro ao processar correção:", error);

      // Exibir erro exatamente como vem do backend
      const errorMessage = error.response?.data?.error || error.message || "Não foi possível processar a correção. Tente novamente.";

      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setCorrectionProgress(0);
    }
  };

  // Funções para correção em lote
  const handleBatchImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // Limitar a 5 imagens
    const maxImages = 5;
    const remainingSlots = maxImages - batchImages.length;
    const filesToAdd = files.slice(0, remainingSlots);

    if (files.length > remainingSlots) {
      toast({
        title: "Limite de imagens",
        description: `Máximo de ${maxImages} imagens por lote. Apenas ${remainingSlots} imagens foram adicionadas.`,
        variant: "destructive",
      });
    }

    // Converter arquivos para base64 e criar previews
    const newImages = await Promise.all(
      filesToAdd.map(async (file) => {
        const preview = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        return { file, preview };
      })
    );

    setBatchImages(prev => [...prev, ...newImages]);

    // Limpar input para permitir selecionar os mesmos arquivos novamente
    if (batchFileInputRef.current) {
      batchFileInputRef.current.value = '';
    }
  };

  const handleRemoveBatchImage = (index: number) => {
    setBatchImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearBatchImages = () => {
    setBatchImages([]);
  };

  const handleStartBatchCorrection = async () => {
    if (!id || batchImages.length === 0) return;

    try {
      // Converter imagens para base64
      const base64Images = batchImages.map(img => img.preview);

      // Iniciar correção em lote
      await startBatchCorrection(id, base64Images);
    } catch (error) {
      console.error("Erro ao iniciar correção em lote:", error);
    }
  };

  const handleCloseBatchDialog = () => {
    if (!isBatchProcessing) {
      setShowBatchCorrectionDialog(false);
      setBatchImages([]);
      resetBatchCorrection();
    }
  };

  const handleDownloadForm = async (form: GeneratedForm) => {
    if (!id) return;
    const safe = (form.student_name || "formulario").replace(/[/\\?%*:|"<>]/g, "_");
    try {
      await fetchAuthenticatedDownload(
        `physical-tests/test/${id}/download/${form.id}`,
        `${safe.slice(0, 120)}.pdf`
      );

      toast({
        title: "Download iniciado",
        description: "O PDF será salvo pelo navegador.",
      });
    } catch (error: unknown) {
      console.error("Erro ao baixar formulário:", error);

      let description = "Não foi possível baixar o formulário.";
      const err = error as { response?: { status?: number; data?: { error?: string } }; message?: string };

      if (err.response) {
        const status = err.response.status;
        const backendError = err.response.data?.error;

        if (status === 404) {
          description = backendError || "Formulário não encontrado.";
        } else if (status === 400) {
          description = backendError || "Não foi possível concluir o download.";
        } else if (status === 500) {
          description = backendError || "Erro ao gerar o arquivo.";
        } else if (backendError) {
          description = backendError;
        }
      } else if (error instanceof Error && error.message) {
        description = error.message;
      }

      toast({
        title: "Erro",
        description,
        variant: "destructive",
      });
    }
  };

  const handleDownloadAll = async () => {
    if (!id) return;
    if (isDownloadingAll) return;

    try {
      setIsDownloadingAll(true);
      toast({
        title: "Baixando...",
        description: "Preparando o arquivo ZIP. Isso pode levar alguns instantes.",
      });

      await fetchAuthenticatedDownload(`physical-tests/test/${id}/download-all`, "formularios.zip");

      toast({
        title: "Download iniciado",
        description: "O arquivo ZIP será salvo pelo navegador.",
      });
    } catch (error: unknown) {
      console.error("Erro ao baixar todos os formulários:", error);

      if (isAxiosError(error) && error.response?.data?.status === "not_generated") {
        toast({
          title: "Aviso",
          description: "O ZIP ainda não foi gerado. Aguarde a conclusão da geração dos formulários.",
          variant: "destructive",
        });
      } else {
        const msg =
          error instanceof Error
            ? error.message
            : isAxiosError(error)
              ? (error.response?.data as { error?: string } | undefined)?.error
              : undefined;
        toast({
          title: "Erro",
          description: msg || "Não foi possível baixar os formulários.",
          variant: "destructive",
        });
      }
    }
    finally {
      setIsDownloadingAll(false);
    }
  };

  const handleDeleteForm = (formId: string) => {
    setFormToDelete(formId);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!formToDelete || !id) return;

    try {
      setIsDeleting(true);
      await api.delete(`/physical-tests/form/${formToDelete}`);

      setGeneratedForms(prev => prev.filter(form => form.id !== formToDelete));

      toast({
        title: "Avaliação excluída",
        description: "A avaliação foi excluída com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao excluir formulário:", error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir a avaliação.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setFormToDelete(null);
    }
  };

  const handleDeleteAllForms = async () => {
    if (!id) return;

    try {
      setIsDeleting(true);
      await api.delete(`/physical-tests/test/${id}/forms`);

      setGeneratedForms([]);

      toast({
        title: "Avaliações excluídas",
        description: "Todas as avaliações foram excluídas com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao excluir formulários:", error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir as avaliações.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleMarkAsSent = async (formId: string) => {
    if (!id) return;

    // Verificar se o formulário já foi corrigido
    const form = generatedForms.find(f => f.id === formId);
    if (form?.is_corrected || form?.corrected_at) {
      toast({
        title: "Ação não permitida",
        description: "Não é possível marcar como enviado um formulário que já foi corrigido.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsMarkingAsSent(formId);

      // Chamar API para marcar como enviado
      await api.post(`/physical-tests/form/${formId}/mark-as-sent`, {}, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Atualizar o estado local
      setGeneratedForms(prev => prev.map(form =>
        form.id === formId
          ? { ...form, answer_sheet_sent_at: new Date().toISOString() }
          : form
      ));

      toast({
        title: "Formulário marcado como enviado",
        description: "O formulário foi marcado como enviado com sucesso.",
      });
    } catch (error: any) {
      console.error("Erro ao marcar como enviado:", error);
      toast({
        title: "Erro",
        description: error.response?.data?.error || "Não foi possível marcar o formulário como enviado.",
        variant: "destructive",
      });
    } finally {
      setIsMarkingAsSent(null);
    }
  };

  const loadStudents = async () => {
    if (!id) return;

    try {
      setIsLoadingStudents(true);
      const response = await api.get(`/test/${id}/classes`);
      setStudents(response.data.students || []);
      setTotalStudents(response.data.total_students || 0);
      setClasses(response.data.classes || []);
    } catch (error) {
      console.error("Erro ao carregar alunos:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os alunos.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingStudents(false);
    }
  };

  const handleGenerateIndividual = async (studentId: string) => {
    if (!id) return;

    try {
      setIsGeneratingIndividual(true);
      const response = await api.post(`/physical-tests/test/${id}/student/${studentId}/generate`, {}, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Mapear form_id para id para compatibilidade
      const mappedForms = (response.data.forms || []).map((form: any) => ({
        ...form,
        id: form.form_id, // Mapear form_id para id
        created_at: new Date().toISOString(), // Adicionar timestamp se não existir
        answer_sheet_sent_at: form.answer_sheet_sent_at || null // Preservar campo de envio se existir
      }));
      setGeneratedForms(prev => [...prev, ...mappedForms]);

      toast({
        title: "Avaliação gerada!",
        description: "Avaliação individual gerada com sucesso.",
      });
    } catch (error: any) {
      console.error("Erro ao gerar formulário individual:", error);
      toast({
        title: "Erro",
        description: error.response?.data?.error || "Erro ao gerar avaliação individual",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingIndividual(false);
    }
  };

  const filteredStudents = students.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(studentSearchTerm.toLowerCase());
    const matchesClass = selectedClassFilter === "all" || student.class_id === selectedClassFilter;
    return matchesSearch && matchesClass;
  });

  // Função para validar configurações de blocos
  const validateBlockSettings = (): { isValid: boolean; warnings: string[] } => {
    const warnings: string[] = [];
    let hasCriticalError = false;

    // Se separar por disciplina, não precisa validar configurações de blocos
    if (separateBySubject) {
      return { isValid: true, warnings: [] };
    }

    if (!useBlocks) {
      return { isValid: true, warnings: [] };
    }

    // Se separar por disciplina, validar número de disciplinas
    if (separateBySubject) {
      if (testSubjects.length > 0) {
        warnings.push(
          `ℹ️ Será criado 1 bloco por disciplina. A avaliação possui ${testSubjects.length} disciplina(s). ` +
          `A configuração de quantidade de blocos e questões por bloco será ignorada.`
        );
      } else {
        warnings.push(
          `⚠️ Não foi possível identificar as disciplinas da avaliação. ` +
          `Verifique se a avaliação possui disciplinas cadastradas.`
        );
      }
      return { isValid: !hasCriticalError, warnings };
    }

    // Validar quantidade de blocos vs questões totais
    if (testTotalQuestions !== null) {
      const totalQuestionsNeeded = numBlocks * questionsPerBlock;

      if (numBlocks > testTotalQuestions) {
        warnings.push(
          `⚠️ A quantidade de blocos (${numBlocks}) é maior que o número total de questões da avaliação (${testTotalQuestions}). ` +
          `Isso pode resultar em blocos vazios ou com poucas questões. Considere reduzir a quantidade de blocos.`
        );
      }

      if (questionsPerBlock > testTotalQuestions) {
        warnings.push(
          `⚠️ A quantidade de questões por bloco (${questionsPerBlock}) é maior que o número total de questões da avaliação (${testTotalQuestions}). ` +
          `Cada bloco terá no máximo ${testTotalQuestions} questões. Considere reduzir a quantidade de questões por bloco.`
        );
      }

      if (totalQuestionsNeeded > testTotalQuestions) {
        warnings.push(
          `⚠️ A configuração atual (${numBlocks} blocos × ${questionsPerBlock} questões = ${totalQuestionsNeeded} questões) ` +
          `ultrapassa o número total de questões da avaliação (${testTotalQuestions}). ` +
          `Os blocos serão ajustados automaticamente para distribuir as questões disponíveis.`
        );
      }

      if (numBlocks > 0 && questionsPerBlock > 0 && totalQuestionsNeeded < testTotalQuestions) {
        const remainingQuestions = testTotalQuestions - totalQuestionsNeeded;
        if (remainingQuestions > 0) {
          warnings.push(
            `ℹ️ Com a configuração atual, restarão ${remainingQuestions} ` +
            (remainingQuestions === 1 ? 'questão' : 'questões') +
            ' sem distribuir nos blocos. ' +
            `Considere ajustar a quantidade de blocos ou questões por bloco para aproveitar todas as questões.`
          );
        }
      }

      // Validações críticas que impedem a geração
      if (numBlocks <= 0 || questionsPerBlock <= 0) {
        hasCriticalError = true;
        warnings.push(
          `❌ A quantidade de blocos e questões por bloco deve ser maior que zero.`
        );
      }
    } else {
      warnings.push(
        `ℹ️ Não foi possível carregar o número total de questões da avaliação. ` +
        `Verifique se a configuração de blocos está correta antes de gerar.`
      );
    }

    return { isValid: !hasCriticalError, warnings };
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!testStatus) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            Não foi possível carregar os dados da prova física.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{testStatus.test_title || "Prova Física"}</h1>
          <p className="text-muted-foreground">Gerenciamento de Prova Física</p>
        </div>
        <Button onClick={() => navigate(-1)} variant="outline">
          Voltar
        </Button>
      </div>

      {/* Cards de Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pode Gerar Formulários</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={testStatus.can_generate_forms ? "default" : "secondary"}>
              {testStatus.can_generate_forms ? "Sim" : "Não"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Turmas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{testStatus.class_tests.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aplicações</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{testStatus.applied_applications}/{testStatus.total_applications}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={testStatus.applied_applications > 0 ? "default" : "secondary"}>
              {testStatus.applied_applications > 0 ? "Aplicada" : "Não Aplicada"}
            </Badge>
            <div className="text-xs text-muted-foreground mt-1">
              {testStatus.reason}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={isCorretor ? "correction" : "forms"} className="space-y-6">
        <TabsList>
          {!isCorretor && <TabsTrigger value="forms">Avaliações Geradas</TabsTrigger>}
          <TabsTrigger value="correction">Correção</TabsTrigger>
          {!isCorretor && <TabsTrigger value="students">Alunos</TabsTrigger>}
        </TabsList>

        {/* Tab: Avaliações Geradas */}
        <TabsContent value="forms" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Avaliações Geradas</CardTitle>
                <div className="flex gap-2">
                  {generatedForms.length > 0 && (
                    <>
                      <Button
                        onClick={handleDownloadAll}
                        variant="outline"
                        disabled={isDownloadingAll}
                        className="border-purple-600 text-purple-600 hover:bg-purple-50"
                      >
                        {isDownloadingAll ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Baixando...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" />
                            Baixar Todos ({generatedForms.length})
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={handleDeleteAllForms}
                        variant="outline"
                        disabled={isDeleting}
                        className="border-red-600 text-red-600 hover:bg-red-50"
                      >
                        {isDeleting ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Excluindo...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir Todas
                          </>
                        )}
                      </Button>
                    </>
                  )}
                  <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
                    <DialogTrigger asChild>
                      <Button
                        disabled={isGenerating}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Gerar Avaliações
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Configurar Geração de Avaliações</DialogTitle>
                        <DialogDescription>
                          Escolha para qual escopo gerar e configure as opções de blocos.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-6 py-4">
                        {/* Gerar para escopo (escolas/séries/turmas) */}
                        {testScope && (
                          <div className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/30">
                            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Gerar para escopo</h4>
                            <p className="text-xs text-muted-foreground">
                              Deixe em branco para gerar para todo o escopo da prova. Selecione escolas, séries ou turmas para gerar apenas para elas.
                            </p>
                            {scopeSchoolsList.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Nenhuma turma com aplicação para esta prova.</p>
                            ) : (
                              <>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <Label className="text-sm">Escola(s)</Label>
                                    {scopeSchoolsList.length > 0 && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                        onClick={() => setGenerateScopeSchoolIds(scopeSchoolsList.map((o) => o.id))}
                                      >
                                        Selecionar todas
                                      </Button>
                                    )}
                                  </div>
                                  <MultiSelect
                                    options={scopeSchoolsList}
                                    selected={generateScopeSchoolIds}
                                    onChange={setGenerateScopeSchoolIds}
                                    placeholder="Todas as escolas"
                                    label=""
                                    mode="popover"
                                    className="w-full"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <Label className="text-sm">Série(s)/Ano(s)</Label>
                                    {scopeGradesList.length > 0 && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                        onClick={() => setGenerateScopeGradeIds(scopeGradesList.map((o) => o.id))}
                                      >
                                        Selecionar todas
                                      </Button>
                                    )}
                                  </div>
                                  <MultiSelect
                                    options={scopeGradesList}
                                    selected={generateScopeGradeIds}
                                    onChange={setGenerateScopeGradeIds}
                                    placeholder="Todas as séries"
                                    label=""
                                    mode="popover"
                                    className="w-full"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <Label className="text-sm">Turma(s)</Label>
                                    {scopeClassesList.length > 0 && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                        onClick={() => setGenerateScopeClassIds(scopeClassesList.map((o) => o.id))}
                                      >
                                        Selecionar todas
                                      </Button>
                                    )}
                                  </div>
                                  <MultiSelect
                                    options={scopeClassesList}
                                    selected={generateScopeClassIds}
                                    onChange={setGenerateScopeClassIds}
                                    placeholder="Todas as turmas"
                                    label=""
                                    mode="popover"
                                    className="w-full"
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {/* Opção de usar blocos */}
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="use-blocks"
                            checked={useBlocks}
                            onCheckedChange={(checked) => {
                              if (checked === true) {
                                setUseBlocks(true);
                                setSeparateBySubject(false); // Desmarcar "Separar por disciplina"
                              } else {
                                setUseBlocks(false);
                              }
                            }}
                          />
                          <Label htmlFor="use-blocks" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Separar avaliações em blocos
                          </Label>
                        </div>

                        {/* Opção de separar por disciplina */}
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="separate-by-subject"
                            checked={separateBySubject}
                            onCheckedChange={(checked) => {
                              if (checked === true) {
                                setSeparateBySubject(true);
                                setUseBlocks(false); // Desmarcar "Separar avaliações em blocos"
                              } else {
                                setSeparateBySubject(false);
                              }
                            }}
                          />
                          <Label htmlFor="separate-by-subject" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Separar por disciplina (1 bloco por disciplina)
                          </Label>
                        </div>

                        {separateBySubject && (
                          <p className="text-xs text-muted-foreground pl-6">
                            Quando ativado, cada disciplina terá seu próprio bloco.
                          </p>
                        )}

                        {/* Minutos por bloco (quando usar blocos ou separar por disciplina) */}
                        {(useBlocks || separateBySubject) && (
                          <div className="space-y-2 pl-6">
                            <Label htmlFor="minutes-per-block">Minutos por Bloco</Label>
                            <Input
                              id="minutes-per-block"
                              type="number"
                              min="1"
                              value={minutesPerBlock}
                              onChange={(e) => setMinutesPerBlock(parseInt(e.target.value) || 30)}
                            />
                            <p className="text-xs text-muted-foreground">
                              Tempo em minutos disponível para cada bloco na aplicação da prova.
                            </p>
                          </div>
                        )}

                        {/* Configurações de blocos (apenas se useBlocks estiver ativado) */}
                        {useBlocks && (
                          <div className="space-y-4 pl-6 border-l-2 border-gray-200">
                            {/* Informações sobre a avaliação */}
                            {(testTotalQuestions !== null || testSubjects.length > 0) && (
                              <Alert>
                                <AlertDescription className="text-sm">
                                  <div className="space-y-1">
                                    {testTotalQuestions !== null && (
                                      <p><strong>Total de questões:</strong> {testTotalQuestions}</p>
                                    )}
                                    {testSubjects.length > 0 && (
                                      <p><strong>Disciplinas:</strong> {testSubjects.join(", ")} ({testSubjects.length})</p>
                                    )}
                                    <p className="text-xs mt-2 text-muted-foreground">
                                      Os blocos serão criados de acordo com a quantidade de questões e disciplinas da avaliação.
                                    </p>
                                  </div>
                                </AlertDescription>
                              </Alert>
                            )}

                            <div className="space-y-2">
                              <Label htmlFor="num-blocks">Quantidade de Blocos</Label>
                              <Input
                                id="num-blocks"
                                type="number"
                                min="1"
                                value={numBlocks}
                                onChange={(e) => setNumBlocks(parseInt(e.target.value) || 2)}
                              />
                              <p className="text-xs text-muted-foreground">
                                Número de blocos que serão criados para cada avaliação.
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="questions-per-block">Questões por Bloco</Label>
                              <Input
                                id="questions-per-block"
                                type="number"
                                min="1"
                                value={questionsPerBlock}
                                onChange={(e) => setQuestionsPerBlock(parseInt(e.target.value) || 5)}
                              />
                              <p className="text-xs text-muted-foreground">
                                Quantidade de questões que cada bloco deve conter.
                              </p>
                            </div>

                            {/* Avisos de validação */}
                            {(() => {
                              const validation = validateBlockSettings();
                              if (validation.warnings.length > 0) {
                                return (
                                  <Alert variant={validation.isValid ? "default" : "destructive"}>
                                    <AlertDescription>
                                      <div className="space-y-2">
                                        {validation.warnings.map((warning, index) => (
                                          <p key={index} className="text-sm">
                                            {warning}
                                          </p>
                                        ))}
                                      </div>
                                    </AlertDescription>
                                  </Alert>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        )}

                        {/* Indicador de progresso */}
                        {isGenerating && (
                          <div className="space-y-2">
                            <Progress value={correctionProgress} className="w-full" />
                            <p className="text-sm text-muted-foreground text-center">
                              ⏳ Gerando formulários PDF em background... {correctionProgress}%
                            </p>
                            <p className="text-xs text-muted-foreground text-center">
                              Isso pode levar alguns minutos. Não feche esta página.
                            </p>
                          </div>
                        )}

                        {/* Botões de ação */}
                        <div className="flex justify-end gap-2 pt-4">
                          <Button
                            variant="outline"
                            onClick={() => setShowGenerateDialog(false)}
                            disabled={isGenerating}
                          >
                            Cancelar
                          </Button>
                          <Button
                            onClick={handleGenerateForms}
                            disabled={isGenerating || (useBlocks && !separateBySubject && !validateBlockSettings().isValid)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            {isGenerating ? (
                              <>
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                Gerando...
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Gerar Avaliações
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(isGenerating || taskStatusData) && (
                <GenerationProgressPanel
                  taskStatusData={taskStatusData}
                  isGenerating={isGenerating}
                  correctionProgress={correctionProgress}
                  onDownloadAll={handleDownloadAll}
                  canDownloadAll={!!id}
                  isDownloadingAll={isDownloadingAll}
                  onDismiss={() => setTaskStatusData(null)}
                />
              )}

              {generatedForms.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhuma avaliação gerada</h3>
                  <p className="text-muted-foreground mb-4">
                    Clique em "Gerar Avaliações" para criar os formulários para todos os alunos.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      type="search"
                      placeholder="Pesquisar aluno para baixar..."
                      value={formsSearchTerm}
                      onChange={(e) => setFormsSearchTerm(e.target.value)}
                      className="pl-9"
                      aria-label="Pesquisar aluno"
                    />
                    {formsSearchTerm && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {filteredGeneratedForms.length} {filteredGeneratedForms.length === 1 ? "resultado" : "resultados"}
                      </span>
                    )}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Aluno</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Gerado em</TableHead>
                        <TableHead>Corrigido em</TableHead>
                        <TableHead>Formulário Enviado</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredGeneratedForms.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            Nenhum aluno encontrado para &quot;{formsSearchTerm}&quot;.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredGeneratedForms.map((form) => (
                        <TableRow key={form.id}>
                          <TableCell className="font-medium">
                            {form.student_name}
                          </TableCell>
                          <TableCell>
                            <Badge variant={form.status === 'gerado' ? "default" : "secondary"}>
                              {form.status === 'gerado' ? "Gerado" : form.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(form.created_at).toLocaleDateString('pt-BR')}
                          </TableCell>
                          <TableCell>
                            {form.corrected_at
                              ? new Date(form.corrected_at).toLocaleDateString('pt-BR')
                              : '-'
                            }
                          </TableCell>
                          <TableCell>
                            {form.answer_sheet_sent_at ? (
                              <Badge className="bg-green-500/90 text-white border-green-400 flex items-center gap-1 w-fit">
                                <CheckCircle className="h-3 w-3" />
                                Enviado {new Date(form.answer_sheet_sent_at).toLocaleDateString('pt-BR')}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="flex items-center gap-1 w-fit">
                                <Send className="h-3 w-3" />
                                Não enviado
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleDownloadForm(form)}>
                                  <Download className="h-4 w-4 mr-2" />
                                  Baixar PDF
                                </DropdownMenuItem>
                                {!form.answer_sheet_sent_at && !form.is_corrected && !form.corrected_at && (
                                  <DropdownMenuItem
                                    onClick={() => handleMarkAsSent(form.id)}
                                    disabled={isMarkingAsSent === form.id}
                                  >
                                    {isMarkingAsSent === form.id ? (
                                      <>
                                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                        Marcando...
                                      </>
                                    ) : (
                                      <>
                                        <Send className="h-4 w-4 mr-2" />
                                        Marcar como Enviado
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => handleDeleteForm(form.id)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Correção */}
        <TabsContent value="correction" className="space-y-6">
          {/* Correção Única */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Correção Única
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="image-upload">Imagem do Gabarito Preenchido</Label>
                <Input
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">
                  Faça upload de uma foto do gabarito preenchido pelo aluno.
                </p>
              </div>

              {previewImage && (
                <div className="space-y-4">
                  <div>
                    <Label>Preview da Imagem</Label>
                    <div className="mt-2 border rounded-lg p-4">
                      <img
                        src={previewImage}
                        alt="Preview"
                        className="max-w-full h-auto max-h-64 mx-auto"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={handleProcessCorrection}
                    disabled={isProcessing}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Processando... {correctionProgress}%
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Processar Correção
                      </>
                    )}
                  </Button>

                  {isProcessing && (
                    <div className="space-y-2">
                      <Progress value={correctionProgress} className="w-full" />
                      <p className="text-sm text-muted-foreground text-center">
                        Analisando imagem e processando correção...
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Correção em Lote */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Images className="h-5 w-5" />
                Correção em Lote
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Processe múltiplas provas de uma vez. Selecione várias imagens de gabaritos preenchidos
                e o sistema irá corrigir todas automaticamente.
              </p>

              <Dialog open={showBatchCorrectionDialog} onOpenChange={(open) => {
                if (!open && !isBatchProcessing) {
                  handleCloseBatchDialog();
                } else if (open) {
                  setShowBatchCorrectionDialog(true);
                }
              }}>
                <DialogTrigger asChild>
                  <Button className="w-full bg-purple-600 hover:bg-purple-700">
                    <Upload className="h-4 w-4 mr-2" />
                    Iniciar Correção em Lote
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Images className="h-5 w-5" />
                      Correção em Lote
                    </DialogTitle>
                    <DialogDescription>
                      Selecione múltiplas imagens de gabaritos para processar de uma vez.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    {/* Upload de imagens */}
                    {!isBatchProcessing && !isBatchCompleted && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="batch-image-upload">Selecionar Imagens</Label>
                          <div className="flex gap-2">
                            <Input
                              id="batch-image-upload"
                              ref={batchFileInputRef}
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={handleBatchImageUpload}
                              className="cursor-pointer flex-1"
                            />
                            {batchImages.length > 0 && (
                              <Button
                                variant="outline"
                                onClick={handleClearBatchImages}
                                className="text-red-600 border-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Máximo de 5 imagens por lote. Formatos aceitos: JPG, PNG, GIF, WebP.
                          </p>
                        </div>

                        {/* Preview das imagens selecionadas */}
                        {batchImages.length > 0 && (
                          <div className="space-y-2">
                            <Label>{batchImages.length} imagem(ns) selecionada(s)</Label>
                            <ScrollArea className="h-48 border rounded-lg p-2">
                              <div className="grid grid-cols-4 gap-2">
                                {batchImages.map((img, index) => (
                                  <div key={index} className="relative group">
                                    <img
                                      src={img.preview}
                                      alt={`Preview ${index + 1}`}
                                      className="w-full h-24 object-cover rounded border"
                                    />
                                    <button
                                      onClick={() => handleRemoveBatchImage(index)}
                                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                    <span className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1 rounded">
                                      {index + 1}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        )}

                        {/* Botão para iniciar */}
                        <Button
                          onClick={handleStartBatchCorrection}
                          disabled={batchImages.length === 0}
                          className="w-full bg-purple-600 hover:bg-purple-700"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Iniciar Correção ({batchImages.length} provas)
                        </Button>
                      </>
                    )}

                    {/* Erro */}
                    {batchError && (
                      <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>{batchError}</AlertDescription>
                      </Alert>
                    )}

                    {/* Progresso */}
                    {(isBatchProcessing || isBatchCompleted) && batchProgress && (
                      <div className="space-y-4">
                        {/* Header de status */}
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            {isBatchCompleted ? (
                              <>
                                <CheckCircle className="h-5 w-5 text-green-500" />
                                <span className="font-medium text-green-600">Concluído!</span>
                              </>
                            ) : (
                              <>
                                <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                                <span className="font-medium">Processando...</span>
                              </>
                            )}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {batchProgress.completed}/{batchProgress.total} ({batchProgress.percentage.toFixed(0)}%)
                          </span>
                        </div>

                        {/* Barra de progresso */}
                        <Progress value={batchProgress.percentage} className="w-full h-3" />

                        {/* Lista de itens */}
                        <ScrollArea className="h-64 border rounded-lg">
                          <div className="p-2 space-y-1">
                            {Object.entries(batchProgress.items || {}).map(([index, item]) => (
                              <div
                                key={index}
                                className={`flex items-center justify-between p-2 rounded text-sm ${item.status === 'pending' ? 'bg-gray-100' :
                                    item.status === 'processing' ? 'bg-yellow-50 border border-yellow-200' :
                                      item.status === 'done' ? 'bg-green-50 border border-green-200' :
                                        'bg-red-50 border border-red-200'
                                  }`}
                              >
                                <span className="flex items-center gap-2">
                                  {item.status === 'pending' && <Clock className="h-4 w-4 text-gray-400" />}
                                  {item.status === 'processing' && <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />}
                                  {item.status === 'done' && <CheckCircle className="h-4 w-4 text-green-500" />}
                                  {item.status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                                  <span>
                                    {item.status === 'pending' && `Prova ${Number(index) + 1} - Aguardando...`}
                                    {item.status === 'processing' && `Prova ${Number(index) + 1} - Processando...`}
                                    {item.status === 'done' && (item.student_name || `Prova ${Number(index) + 1}`)}
                                    {item.status === 'error' && `Prova ${Number(index) + 1} - Erro`}
                                  </span>
                                </span>
                                {item.status === 'done' && (
                                  <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                                    {item.correct}/{item.total} ({item.percentage?.toFixed(0)}%)
                                  </Badge>
                                )}
                                {item.status === 'error' && item.error && (
                                  <span className="text-xs text-red-600 max-w-[200px] truncate">
                                    {item.error}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </ScrollArea>

                        {/* Resumo final */}
                        {isBatchCompleted && (
                          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div className="space-y-1">
                              <p className="text-sm font-medium">Resumo da Correção</p>
                              <div className="flex gap-4 text-sm">
                                <span className="text-green-600">
                                  ✅ Sucesso: {batchProgress.successful}
                                </span>
                                {batchProgress.failed > 0 && (
                                  <span className="text-red-600">
                                    ❌ Falhas: {batchProgress.failed}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button onClick={handleCloseBatchDialog}>
                              Fechar
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Alunos */}
        <TabsContent value="students" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Alunos da Prova</CardTitle>
                <Button onClick={loadStudents} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Carregar Alunos
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingStudents ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Filtros */}
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar aluno..."
                          value={studentSearchTerm}
                          onChange={(e) => setStudentSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>
                    <Select value={selectedClassFilter} onValueChange={setSelectedClassFilter}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Filtrar por turma" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as turmas</SelectItem>
                        {classes.map((cls) => (
                          <SelectItem key={cls.id} value={cls.id}>
                            {cls.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Lista de Alunos */}
                  <div className="space-y-2">
                    {filteredStudents.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <h4 className="font-medium">{student.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {student.class_name} • {student.email}
                          </p>
                        </div>
                        <Button
                          onClick={() => handleGenerateIndividual(student.id)}
                          disabled={isGeneratingIndividual}
                          size="sm"
                        >
                          {isGeneratingIndividual ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>

                  {filteredStudents.length === 0 && (
                    <div className="text-center py-8">
                      <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Nenhum aluno encontrado</h3>
                      <p className="text-muted-foreground">
                        {studentSearchTerm || selectedClassFilter !== "all"
                          ? "Tente ajustar os filtros de busca."
                          : "Clique em 'Carregar Alunos' para ver a lista de alunos."}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta avaliação? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
