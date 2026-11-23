import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/authContext";
import { useToast } from "@/hooks/use-toast";
import {
  DetectedAnswer,
  DetectAnswersResponse,
  PhotoScanClass,
  PhotoScanKind,
  PhotoScanStudent,
  PhotoScanTest,
  ScanAnswersApiService,
} from "@/services/evaluation/scanAnswersApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronsUpDown,
  ImageIcon,
  Loader2,
  ScanLine,
  SkipForward,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STAFF_ROLES = new Set(["admin", "professor", "coordenador", "diretor", "tecadm", "aplicador"]);
const BLANK_VALUE = "__blank__";
const ALL_CLASSES = "__all__";

type EditableAnswer = {
  question_number: number;
  answer: string | null;
  status: DetectedAnswer["status"];
  alternatives: string[];
  subject_name?: string | null;
  block_id?: number | string;
  bubbles: NonNullable<DetectedAnswer["bubbles"]>;
};

const ERROR_HINTS: Record<string, string> = {
  not_objective_test:
    "Esta avaliação não é de múltipla escolha com bolhas. Use apenas provas objetivas (A, B, C…).",
  mixed_question_types:
    "A avaliação mistura questões objetivas com subjetivas/interativas. O scan por foto exige só múltipla escolha.",
  topology_image_mismatch:
    "A foto não corresponde ao cartão desta avaliação (número de colunas/questões diferente).",
  blocks_mismatch: "A quantidade de blocos na foto não bate com a configuração da prova.",
  bubbles_not_found:
    "Não encontramos as bolhas. Enquadre toda a área de respostas com boa luz e foco.",
  no_questions: "Avaliação sem questões para escanear.",
  missing_topology:
    "Este cartão não tem topologia (blocos/questões) ou gabarito configurados para leitura por foto.",
};

const KIND_LABELS: Record<PhotoScanKind, string> = {
  cartao: "Cartão-resposta",
  physical: "Prova física",
  virtual: "Prova online",
};
const KIND_ORDER: PhotoScanKind[] = ["cartao", "physical", "virtual"];

function isKind(value: string | null): value is PhotoScanKind {
  return value === "cartao" || value === "physical" || value === "virtual";
}

function statusBadge(status: DetectedAnswer["status"]) {
  switch (status) {
    case "ok":
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">OK</Badge>;
    case "blank":
      return <Badge variant="outline" className="text-amber-700 border-amber-300">Em branco</Badge>;
    case "multiple":
      return <Badge variant="destructive">Ambígua</Badge>;
    case "low_confidence":
      return <Badge className="bg-orange-100 text-orange-800 border-orange-300">Baixa confiança</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function rowHighlight(status: DetectedAnswer["status"]) {
  switch (status) {
    case "multiple":
      return "bg-red-50/80 dark:bg-red-950/20";
    case "low_confidence":
      return "bg-orange-50/80 dark:bg-orange-950/20";
    case "blank":
      return "bg-amber-50/60 dark:bg-amber-950/10";
    default:
      return "";
  }
}

/** Combobox com busca (shadcn Popover + Command). */
function SearchCombobox<T extends { id: string }>(props: {
  items: T[];
  value: string;
  onChange: (id: string) => void;
  getLabel: (item: T) => string;
  renderItem?: (item: T) => React.ReactNode;
  /** Quando informado, agrupa os itens por rótulo (na ordem de `groupOrder`). */
  getGroup?: (item: T) => string;
  groupOrder?: string[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = props.items.find((i) => i.id === props.value);
  const groups = useMemo<[string, T[]][]>(() => {
    if (!props.getGroup) return [["", props.items]];
    const map = new Map<string, T[]>();
    props.items.forEach((item) => {
      const key = props.getGroup!(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    const order = props.groupOrder || [];
    return Array.from(map.entries()).sort(
      (a, b) =>
        (order.indexOf(a[0]) === -1 ? 99 : order.indexOf(a[0])) -
        (order.indexOf(b[0]) === -1 ? 99 : order.indexOf(b[0]))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.items, props.getGroup, props.groupOrder]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={props.disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selected ? props.getLabel(selected) : props.placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={props.searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{props.emptyText}</CommandEmpty>
            {groups.map(([heading, groupItems]) => (
              <CommandGroup key={heading || "all"} heading={heading || undefined}>
                {groupItems.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${props.getLabel(item)} ${item.id}`}
                    onSelect={() => {
                      props.onChange(item.id);
                      setOpen(false);
                    }}
                  >
                    {props.renderItem ? props.renderItem(item) : props.getLabel(item)}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Foto normalizada com as bolhas lidas sobrepostas. */
function ReviewOverlay({
  image,
  rows,
  focusQ,
}: {
  image: string;
  rows: EditableAnswer[];
  focusQ: number | null;
}) {
  return (
    <div className="relative w-full overflow-hidden rounded-md border bg-black/5">
      <img src={image} alt="Cartão lido" className="block w-full select-none" draggable={false} />
      {rows.flatMap((row) =>
        row.bubbles.map((b) => {
          const chosen = row.answer === b.letter;
          const detectedButNotChosen = b.marked && !chosen;
          const focused = focusQ === row.question_number;
          const color = chosen
            ? row.status === "ok"
              ? "border-emerald-500 bg-emerald-500/25"
              : "border-orange-500 bg-orange-500/30"
            : detectedButNotChosen
            ? "border-red-500 border-dashed"
            : "border-sky-400/40";
          return (
            <div
              key={`${row.question_number}-${b.letter}`}
              className={cn(
                "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2",
                color,
                focused && "ring-2 ring-primary ring-offset-1"
              )}
              style={{
                left: `${b.x * 100}%`,
                top: `${b.y * 100}%`,
                width: `${b.r * 2 * 100}%`,
                aspectRatio: "1 / 1",
              }}
            />
          );
        })
      )}
    </div>
  );
}

export default function PhotoCorrectionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const role = String(user?.role || "").toLowerCase();
  const isStaff = STAFF_ROLES.has(role);

  const [tests, setTests] = useState<PhotoScanTest[]>([]);
  const [loadingTests, setLoadingTests] = useState(true);
  const [testId, setTestId] = useState<string>(searchParams.get("prova") || "");
  const urlTipo = searchParams.get("tipo");
  const [urlKind] = useState<PhotoScanKind | null>(isKind(urlTipo) ? urlTipo : null);

  const [classes, setClasses] = useState<PhotoScanClass[]>([]);
  const [students, setStudents] = useState<PhotoScanStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [classId, setClassId] = useState<string>(ALL_CLASSES);
  const [studentId, setStudentId] = useState<string>(searchParams.get("aluno") || "");
  const [onlyPending, setOnlyPending] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [detection, setDetection] = useState<DetectAnswersResponse | null>(null);
  const [editable, setEditable] = useState<EditableAnswer[]>([]);
  const [focusQ, setFocusQ] = useState<number | null>(null);
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);
  const [savedInfo, setSavedInfo] = useState<{ name: string; score?: number | null } | null>(null);

  // --- Carrega provas elegíveis
  useEffect(() => {
    if (!isStaff) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await ScanAnswersApiService.listTests();
        if (!cancelled) setTests(list);
      } catch (err: any) {
        toast({
          title: "Erro ao carregar avaliações",
          description: err?.response?.data?.error || err?.message,
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoadingTests(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isStaff, toast]);

  const currentTest = tests.find((t) => t.id === testId) || null;
  // Tipo do instrumento selecionado; antes de a lista carregar, vale o `tipo` da URL.
  const kind: PhotoScanKind | null = currentTest?.kind ?? (testId ? urlKind : null);

  const loadStudents = useCallback(
    async (id: string, k: PhotoScanKind) => {
      setLoadingStudents(true);
      try {
        const res = await ScanAnswersApiService.listStudents(id, k);
        setClasses(res.classes || []);
        setStudents(res.students || []);
      } catch (err: any) {
        setClasses([]);
        setStudents([]);
        toast({
          title: "Erro ao carregar alunos",
          description: err?.response?.data?.error || err?.message,
          variant: "destructive",
        });
      } finally {
        setLoadingStudents(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (!testId) {
      setClasses([]);
      setStudents([]);
      return;
    }
    // Aguarda o tipo (lista de avaliações ou `tipo` da URL); sem ele cai em prova online.
    if (!kind && loadingTests) return;
    void loadStudents(testId, kind ?? "virtual");
  }, [testId, kind, loadingTests, loadStudents]);

  const resetCapture = useCallback(() => {
    setFile(null);
    setPreview(null);
    setDetection(null);
    setEditable([]);
    setDetectError(null);
    setFocusQ(null);
  }, []);

  const syncUrl = (nextTest: string, nextStudent: string, nextKind: PhotoScanKind | null = kind) => {
    const params: Record<string, string> = {};
    if (nextTest) params.prova = nextTest;
    if (nextTest && nextKind) params.tipo = nextKind;
    if (nextStudent) params.aluno = nextStudent;
    setSearchParams(params, { replace: true });
  };

  const onSelectTest = (id: string) => {
    const picked = tests.find((t) => t.id === id);
    setTestId(id);
    setStudentId("");
    setClassId(ALL_CLASSES);
    setSavedInfo(null);
    resetCapture();
    syncUrl(id, "", picked?.kind ?? null);
  };

  const onSelectStudent = (id: string) => {
    setStudentId(id);
    setSavedInfo(null);
    resetCapture();
    syncUrl(testId, id);
  };

  const visibleStudents = useMemo(
    () =>
      students.filter(
        (s) =>
          (classId === ALL_CLASSES || s.class_id === classId) &&
          (!onlyPending || s.status === "pendente" || s.id === studentId)
      ),
    [students, classId, onlyPending, studentId]
  );

  const currentStudent = students.find((s) => s.id === studentId) || null;

  const nextPending = useMemo(() => {
    const idx = visibleStudents.findIndex((s) => s.id === studentId);
    const after = visibleStudents.slice(idx + 1).find((s) => s.status === "pendente");
    return after || visibleStudents.find((s) => s.status === "pendente" && s.id !== studentId) || null;
  }, [visibleStudents, studentId]);

  const handleFile = useCallback(
    (next: File | null) => {
      if (!next) return;
      if (!next.type.startsWith("image/")) {
        toast({
          title: "Arquivo inválido",
          description: "Envie uma imagem (JPEG, PNG ou WebP).",
          variant: "destructive",
        });
        return;
      }
      setFile(next);
      setDetectError(null);
      setDetection(null);
      setEditable([]);
      const reader = new FileReader();
      reader.onload = () => setPreview(String(reader.result));
      reader.readAsDataURL(next);
    },
    [toast]
  );

  const runDetect = async () => {
    if (!testId || !studentId || !file) return;
    setDetecting(true);
    setDetectError(null);
    setSavedInfo(null);
    try {
      const result = await ScanAnswersApiService.detectAnswers(testId, studentId, file, kind ?? "virtual");
      setDetection(result);
      setEditable(
        (result.answers || []).map((a) => ({
          question_number: a.question_number,
          answer: a.answer,
          status: a.status,
          alternatives: a.alternatives?.length ? a.alternatives : ["A", "B", "C", "D"],
          subject_name: a.subject_name,
          block_id: a.block_id,
          bubbles: a.bubbles || [],
        }))
      );
      toast({
        title: "Respostas detectadas",
        description: `${result.summary?.ok ?? 0} OK · ${result.summary?.low_confidence ?? 0} baixa confiança · ${result.summary?.multiple ?? 0} ambíguas · ${result.summary?.blank ?? 0} em branco`,
      });
    } catch (err: any) {
      const data = err?.response?.data;
      const code = String(data?.code || "");
      const baseMsg =
        data?.error || err?.message || "Não foi possível detectar as respostas na foto.";
      const msg = ERROR_HINTS[code] ? `${ERROR_HINTS[code]}\n\n${baseMsg}` : baseMsg;
      setDetectError(msg);
      toast({
        title:
          code === "not_objective_test" || code === "mixed_question_types"
            ? "Avaliação incompatível"
            : "Falha na detecção",
        description: ERROR_HINTS[code] || baseMsg,
        variant: "destructive",
      });
    } finally {
      setDetecting(false);
    }
  };

  const setAnswer = (questionNumber: number, value: string | null) => {
    setEditable((prev) =>
      prev.map((row) =>
        row.question_number === questionNumber
          ? { ...row, answer: value, status: value ? "ok" : "blank" }
          : row
      )
    );
  };

  const answersPayload = useMemo(() => {
    const out: Record<string, string | null> = {};
    editable.forEach((row) => {
      out[String(row.question_number)] = row.answer;
    });
    return out;
  }, [editable]);

  const grouped = useMemo(() => {
    const map = new Map<string, EditableAnswer[]>();
    editable.forEach((row) => {
      const key = row.subject_name || `Bloco ${row.block_id ?? ""}`.trim() || "Questões";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return Array.from(map.entries());
  }, [editable]);

  const pendingReview = editable.filter(
    (r) => r.status === "multiple" || r.status === "low_confidence"
  ).length;

  const goToStudent = (s: PhotoScanStudent) => {
    setStudentId(s.id);
    resetCapture();
    syncUrl(testId, s.id);
  };

  const doSave = async (overwrite: boolean): Promise<boolean> => {
    if (!testId || !studentId) return false;
    setSaving(true);
    try {
      const result = await ScanAnswersApiService.saveAnswers(
        testId,
        studentId,
        answersPayload,
        overwrite,
        kind ?? "virtual"
      );
      toast({
        title: "Respostas salvas",
        description:
          result.score_percentage != null
            ? `${result.student_name || "Aluno"} · nota ${Number(result.score_percentage).toFixed(1)}%`
            : result.message,
      });
      setSavedInfo({ name: result.student_name || currentStudent?.name || "Aluno", score: result.score_percentage });
      resetCapture();
      await loadStudents(testId, kind ?? "virtual");
      return true;
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      if (status === 409 || data?.code === "answers_exist") {
        setConfirmOverwriteOpen(true);
        return false;
      }
      toast({
        title: "Erro ao salvar",
        description: data?.error || err?.message || "Falha ao gravar respostas",
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (!editable.length) return;
    if (detection?.has_existing_answers || currentStudent?.status === "corrigido") {
      setConfirmOverwriteOpen(true);
      return;
    }
    void doSave(false);
  };

  if (!user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!isStaff) return <Navigate to="/app" replace />;

  const canCapture = Boolean(testId && studentId);

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-4 pb-16">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Camera className="h-6 w-6" />
          Correção por Foto
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha a avaliação ou cartão e o aluno, fotografe a área das bolhas, revise e salve. Funciona com cartões
          de A–D ou A–E com bolhas circulares.
        </p>
      </div>

      {/* Passo 1: prova e aluno */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Prova e aluno</CardTitle>
          <CardDescription>
            Aparecem cartões-resposta, provas físicas e provas online objetivas (múltipla escolha) com turmas aplicadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Avaliação / cartão</label>
              <SearchCombobox
                items={tests}
                value={testId}
                onChange={onSelectTest}
                getLabel={(t) => t.title}
                getGroup={(t) => KIND_LABELS[t.kind] || KIND_LABELS.virtual}
                groupOrder={KIND_ORDER.map((k) => KIND_LABELS[k])}
                placeholder={loadingTests ? "Carregando..." : "Selecione a prova ou o cartão"}
                searchPlaceholder="Buscar prova ou cartão..."
                emptyText="Nenhuma prova objetiva ou cartão encontrado."
                disabled={loadingTests}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Turma</label>
              <Select
                value={classId}
                onValueChange={(v) => {
                  setClassId(v);
                  setStudentId("");
                  resetCapture();
                  syncUrl(testId, "");
                }}
                disabled={!testId || loadingStudents}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as turmas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLASSES}>Todas as turmas</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {[c.school_name, c.grade_name, c.name].filter(Boolean).join(" · ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Aluno</label>
              <SearchCombobox
                items={visibleStudents}
                value={studentId}
                onChange={onSelectStudent}
                getLabel={(s) => s.name}
                renderItem={(s) => (
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="truncate">{s.name}</span>
                    {s.status === "corrigido" ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                        Corrigido
                      </Badge>
                    ) : (
                      <Badge variant="outline">Pendente</Badge>
                    )}
                  </div>
                )}
                placeholder={loadingStudents ? "Carregando..." : "Selecione o aluno"}
                searchPlaceholder="Buscar aluno..."
                emptyText="Nenhum aluno encontrado."
                disabled={!testId || loadingStudents}
              />
            </div>
          </div>

          {testId && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <Badge variant="outline">
                {students.filter((s) => s.status === "corrigido").length} / {students.length} corrigidos
              </Badge>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={onlyPending}
                  onChange={(e) => setOnlyPending(e.target.checked)}
                />
                Mostrar só pendentes
              </label>
              {currentTest && (
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">{KIND_LABELS[currentTest.kind]}</Badge>
                  {currentTest.title}
                </span>
              )}
            </div>
          )}

          {savedInfo && (
            <Alert className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertTitle>{savedInfo.name} salvo(a)</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-3">
                {savedInfo.score != null && <span>Nota: {Number(savedInfo.score).toFixed(1)}%</span>}
                {nextPending ? (
                  <Button size="sm" onClick={() => goToStudent(nextPending)}>
                    <SkipForward className="mr-2 h-4 w-4" />
                    Próximo aluno: {nextPending.name}
                  </Button>
                ) : (
                  <span>Todos os alunos pendentes desta seleção foram corrigidos.</span>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Passo 2: foto */}
        <Card className={cn(!canCapture && "opacity-60")}>
          <CardHeader>
            <CardTitle className="text-lg">2. Foto das respostas</CardTitle>
            <CardDescription>
              Enquadre só a área de bolhas, sem cortar blocos. Boa luz e foco ajudam.
              {currentStudent ? ` Aluno: ${currentStudent.name}.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0] || null);
                e.target.value = "";
              }}
            />
            <div
              className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4 transition hover:bg-muted/50"
              onClick={() => canCapture && fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (canCapture) handleFile(e.dataTransfer.files?.[0] || null);
              }}
            >
              {preview ? (
                <img src={preview} alt="Pré-visualização" className="max-h-72 w-full rounded-md object-contain" />
              ) : (
                <>
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                  <p className="text-center text-sm text-muted-foreground">
                    {canCapture
                      ? "Arraste uma imagem ou clique para selecionar / tirar foto"
                      : "Selecione a avaliação ou cartão e o aluno primeiro"}
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={!canCapture} onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Escolher imagem
              </Button>
              <Button onClick={runDetect} disabled={!canCapture || !file || detecting}>
                {detecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ScanLine className="mr-2 h-4 w-4" />
                )}
                Detectar respostas
              </Button>
            </div>

            {detectError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Detecção falhou</AlertTitle>
                <AlertDescription className="whitespace-pre-line">{detectError}</AlertDescription>
              </Alert>
            )}

            {(detection?.has_existing_answers || currentStudent?.status === "corrigido") && editable.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Este aluno já foi corrigido</AlertTitle>
                <AlertDescription>
                  Ao salvar, as respostas atuais serão substituídas após confirmação.
                </AlertDescription>
              </Alert>
            )}

            {detection?.summary && (
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">Total: {detection.summary.total}</Badge>
                <Badge variant="outline" className="text-emerald-700 border-emerald-300">
                  OK: {detection.summary.ok}
                </Badge>
                <Badge variant="outline" className="text-orange-700 border-orange-300">
                  Baixa confiança: {detection.summary.low_confidence}
                </Badge>
                <Badge variant="outline" className="text-red-700 border-red-300">
                  Ambíguas: {detection.summary.multiple}
                </Badge>
                <Badge variant="outline" className="text-amber-700 border-amber-300">
                  Em branco: {detection.summary.blank}
                </Badge>
              </div>
            )}

            {detection?.overlay_image && editable.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Leitura sobreposta: verde = lida, laranja = revisar, vermelho tracejado = outra marca
                  detectada. Clique numa questão ao lado para destacá-la.
                </p>
                <ReviewOverlay image={detection.overlay_image} rows={editable} focusQ={focusQ} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Passo 3: revisão */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">3. Revisão e salvar</CardTitle>
            <CardDescription>
              Corrija qualquer leitura incorreta antes de salvar. Itens ambíguos ou de baixa confiança estão
              destacados.
              {pendingReview > 0 && ` ${pendingReview} para revisar.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!editable.length ? (
              <p className="text-sm text-muted-foreground">
                As respostas detectadas aparecerão aqui após o processamento da foto.
              </p>
            ) : (
              <div className="max-h-[36rem] space-y-5 overflow-y-auto pr-1">
                {grouped.map(([subject, rows]) => (
                  <div key={subject} className="space-y-2">
                    <h3 className="sticky top-0 z-10 bg-background/95 py-1 text-sm font-semibold">{subject}</h3>
                    <div className="overflow-hidden rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="w-16 px-3 py-2 text-left">Q</th>
                            <th className="px-3 py-2 text-left">Resposta</th>
                            <th className="w-36 px-3 py-2 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr
                              key={row.question_number}
                              className={cn(
                                "cursor-pointer border-t",
                                rowHighlight(row.status),
                                focusQ === row.question_number && "outline outline-2 -outline-offset-2 outline-primary"
                              )}
                              onClick={() => setFocusQ(row.question_number)}
                            >
                              <td className="px-3 py-2 font-medium">{row.question_number}</td>
                              <td className="px-3 py-2">
                                <Select
                                  value={row.answer ?? BLANK_VALUE}
                                  onValueChange={(v) =>
                                    setAnswer(row.question_number, v === BLANK_VALUE ? null : v)
                                  }
                                >
                                  <SelectTrigger className="h-8 w-28">
                                    <SelectValue placeholder="—" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={BLANK_VALUE}>Em branco</SelectItem>
                                    {row.alternatives.map((alt) => (
                                      <SelectItem key={alt} value={alt}>
                                        {alt}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-3 py-2">{statusBadge(row.status)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={handleSaveClick} disabled={!editable.length || saving || detecting}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Salvar respostas
              </Button>
              {nextPending && (
                <Button variant="outline" onClick={() => goToStudent(nextPending)} disabled={saving}>
                  <SkipForward className="mr-2 h-4 w-4" />
                  Pular para o próximo
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmOverwriteOpen} onOpenChange={setConfirmOverwriteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sobrescrever respostas existentes?</AlertDialogTitle>
            <AlertDialogDescription>
              Este aluno já possui respostas nesta avaliação. Ao confirmar, elas serão substituídas pelas
              respostas revisadas e o resultado será recalculado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void doSave(true).then(() => setConfirmOverwriteOpen(false));
              }}
            >
              {saving ? "Salvando..." : "Sobrescrever e salvar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
