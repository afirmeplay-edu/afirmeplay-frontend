import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  Upload,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import QuestionPreview from "@/components/evaluations/questions/QuestionPreview";
import type { Question } from "@/components/evaluations/types";
import {
  downloadQuestionsImportTemplate,
  importQuestionsDocx,
  questionsImportApiError,
} from "@/services/questions/questionsImportApi";
import {
  type QuestionImportItem,
  type QuestionImportResponse,
} from "@/types/questions-import";

type SubjectOption = { id: string; name: string };
type GradeOption = { id: string; name: string };

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function isDocxFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".docx") || file.type === DOCX_MIME;
}

function toPreviewQuestion(item: QuestionImportItem): Question {
  const payload = item.payload || {};
  const rawType = payload.type || item.resolved?.type || "multipleChoice";
  const type = (rawType === "multiple_choice" ? "multipleChoice" : rawType) as Question["type"];

  return {
    id: "preview",
    title: payload.title || `Questão ${item.index}`,
    text: payload.text || "",
    formattedText: payload.formattedText,
    type,
    subjectId: payload.subjectId || item.resolved?.subjectId || "",
    subject: item.resolved?.subjectName
      ? { id: item.resolved.subjectId || "", name: item.resolved.subjectName }
      : undefined,
    grade: item.resolved?.gradeName
      ? { id: item.resolved.gradeId || "", name: item.resolved.gradeName }
      : undefined,
    difficulty: payload.difficulty || "",
    value: 1,
    solution: payload.solution,
    formattedSolution: payload.formattedSolution,
    options: (payload.options || []).map((opt) => ({
      id: opt.id,
      text: opt.text,
      isCorrect: Boolean(opt.isCorrect),
      image: opt.image,
    })),
    secondStatement: payload.secondStatement,
    skills: payload.skills,
    created_by: payload.createdBy || "",
    interactionConfig: payload.interactionConfig as Question["interactionConfig"],
  };
}

const ImportQuestionsPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [grades, setGrades] = useState<GradeOption[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);

  const [preview, setPreview] = useState<QuestionImportResponse | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [previewDialogItem, setPreviewDialogItem] = useState<QuestionImportItem | null>(null);

  const formReady = Boolean(subjectId && gradeId);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingMeta(true);
      try {
        const [subjectsRes, gradesRes] = await Promise.allSettled([
          api.get("/subjects"),
          api.get("/grades/"),
        ]);
        if (cancelled) return;
        if (subjectsRes.status === "fulfilled") {
          setSubjects(Array.isArray(subjectsRes.value.data) ? subjectsRes.value.data : []);
        }
        if (gradesRes.status === "fulfilled") {
          setGrades(Array.isArray(gradesRes.value.data) ? gradesRes.value.data : []);
        }
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetPreview = useCallback(() => {
    setPreview(null);
    setSelectedIndexes(new Set());
    setPreviewDialogItem(null);
  }, []);

  const handleFileSelect = (file: File | null) => {
    if (!file) return;
    if (!isDocxFile(file)) {
      toast({
        title: "Formato inválido",
        description: "Selecione um arquivo .docx",
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
    resetPreview();
  };

  const handleDownloadTemplate = async () => {
    if (!formReady) return;
    setDownloadingTemplate(true);
    try {
      await downloadQuestionsImportTemplate({
        subjectId,
        grade: gradeId,
      });
      toast({
        title: "Template baixado",
        description:
          "Preencha enunciados e dificuldade por questão (Abaixo do Básico, Básico, Adequado ou Avançado).",
      });
    } catch (error) {
      toast({
        title: "Erro ao baixar template",
        description: questionsImportApiError(error, "Não foi possível baixar o template."),
        variant: "destructive",
      });
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handlePreview = async () => {
    if (!formReady || !selectedFile) return;
    setPreviewLoading(true);
    try {
      const data = await importQuestionsDocx({
        file: selectedFile,
        subjectId,
        grade: gradeId,
        commit: false,
      });

      if (data.mode === "commit") {
        // Resposta inesperada no preview
        toast({
          title: "Resposta inesperada",
          description: "O servidor retornou commit em vez de preview. Tente novamente.",
          variant: "destructive",
        });
        return;
      }

      setPreview(data);
      const validIndexes = (data.questions || [])
        .filter((q) => q.valid)
        .map((q) => q.index);
      setSelectedIndexes(new Set(validIndexes));

      if ((data.summary?.total ?? 0) === 0) {
        toast({
          title: "Nenhuma questão encontrada",
          description: "O arquivo não contém questões reconhecíveis.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Pré-visualização pronta",
          description: `${data.summary.valid} válida(s), ${data.summary.invalid} inválida(s).`,
        });
      }
    } catch (error) {
      resetPreview();
      toast({
        title: "Erro na pré-visualização",
        description: questionsImportApiError(error, "Não foi possível analisar o arquivo."),
        variant: "destructive",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const selectedValidCount = useMemo(() => {
    if (!preview) return 0;
    return preview.questions.filter((q) => q.valid && selectedIndexes.has(q.index)).length;
  }, [preview, selectedIndexes]);

  const toggleIndex = (index: number, valid: boolean) => {
    if (!valid) return;
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAllValid = () => {
    if (!preview) return;
    setSelectedIndexes(
      new Set(preview.questions.filter((q) => q.valid).map((q) => q.index))
    );
  };

  const clearSelection = () => setSelectedIndexes(new Set());

  const handleCommit = async () => {
    if (!formReady || !selectedFile || !preview) return;
    if (selectedValidCount === 0) {
      toast({
        title: "Nenhuma questão selecionada",
        description: "Marque ao menos uma questão válida para importar.",
        variant: "destructive",
      });
      return;
    }

    const indexes = Array.from(selectedIndexes)
      .filter((idx) => preview.questions.some((q) => q.index === idx && q.valid))
      .sort((a, b) => a - b);

    setCommitLoading(true);
    try {
      const data = await importQuestionsDocx({
        file: selectedFile,
        subjectId,
        grade: gradeId,
        commit: true,
        indexes,
      });

      const created = data.summary?.created ?? data.created?.length ?? 0;
      const failed = data.summary?.failed ?? data.failed?.length ?? 0;

      if (created > 0) {
        toast({
          title: "Importação concluída",
          description:
            failed > 0
              ? `${created} criada(s), ${failed} falha(s).`
              : `${created} questão(ões) importada(s) com sucesso.`,
        });
        navigate("/app/cadastros/questao");
        return;
      }

      toast({
        title: "Nenhuma questão importada",
        description:
          failed > 0
            ? `Todas as selecionadas falharam (${failed}).`
            : "Revise o arquivo e tente novamente.",
        variant: "destructive",
      });
      setPreview(data);
    } catch (error) {
      toast({
        title: "Erro ao importar",
        description: questionsImportApiError(error, "Não foi possível importar as questões."),
        variant: "destructive",
      });
    } finally {
      setCommitLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 dark:from-blue-950/30 dark:via-background dark:to-slate-950/30">
      <div className="container max-w-5xl mx-auto py-8 px-4 space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => navigate("/app/cadastros/questao")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <FileUp className="h-7 w-7 text-primary" />
            Importar questões
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Selecione disciplina e série, baixe o template, preencha as questões (incluindo dificuldade no Word) e confira o preview antes de importar.
          </p>
        </div>

        {/* Step 1: context */}
        <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">1. Contexto da importação</h2>
            <p className="text-sm text-muted-foreground">
              Esses campos são obrigatórios e prevalecem sobre o conteúdo do DOCX.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Disciplina *</Label>
              <Select
                value={subjectId || undefined}
                onValueChange={(v) => {
                  setSubjectId(v);
                  resetPreview();
                }}
                disabled={loadingMeta}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingMeta ? "Carregando..." : "Selecione"} />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Série *</Label>
              <Select
                value={gradeId || undefined}
                onValueChange={(v) => {
                  setGradeId(v);
                  resetPreview();
                }}
                disabled={loadingMeta}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingMeta ? "Carregando..." : "Selecione"} />
                </SelectTrigger>
                <SelectContent>
                  {grades.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => void handleDownloadTemplate()}
            disabled={!formReady || downloadingTemplate}
          >
            {downloadingTemplate ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Baixar template
          </Button>
        </section>

        {/* Step 2: upload */}
        <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">2. Upload do arquivo</h2>
            <p className="text-sm text-muted-foreground">
              Envie o .docx preenchido para gerar o preview.
            </p>
          </div>

          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25",
              !formReady && "opacity-60 pointer-events-none"
            )}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileSelect(file);
            }}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium mb-1">
              Arraste o .docx aqui ou escolha um arquivo
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Apenas arquivos Word (.docx)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!formReady}
              onClick={() => fileInputRef.current?.click()}
            >
              Selecionar arquivo
            </Button>
            {selectedFile && (
              <p className="mt-3 text-sm text-foreground">
                Arquivo: <span className="font-medium">{selectedFile.name}</span>
              </p>
            )}
          </div>

          <Button
            onClick={() => void handlePreview()}
            disabled={!formReady || !selectedFile || previewLoading}
          >
            {previewLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Analisar arquivo
          </Button>
        </section>

        {/* Step 3: preview */}
        {preview && (
          <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">3. Preview e seleção</h2>
                <p className="text-sm text-muted-foreground">
                  {preview.form?.subjectName} · {preview.form?.gradeName}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Total: {preview.summary.total}</Badge>
                <Badge className="bg-green-600 hover:bg-green-600">
                  Válidas: {preview.summary.valid}
                </Badge>
                <Badge variant="destructive">Inválidas: {preview.summary.invalid}</Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={selectAllValid}>
                Marcar válidas
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={clearSelection}>
                Limpar seleção
              </Button>
            </div>

            <ul className="space-y-3">
              {preview.questions.map((item) => {
                const checked = selectedIndexes.has(item.index);
                return (
                  <li
                    key={item.index}
                    className={cn(
                      "rounded-lg border p-4 space-y-3",
                      item.valid
                        ? "bg-background"
                        : "bg-destructive/5 border-destructive/40"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={`import-q-${item.index}`}
                        checked={checked}
                        disabled={!item.valid}
                        onCheckedChange={() => toggleIndex(item.index, item.valid)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Label
                            htmlFor={`import-q-${item.index}`}
                            className="font-semibold cursor-pointer"
                          >
                            Questão {item.index}
                          </Label>
                          {item.valid ? (
                            <Badge
                              variant="outline"
                              className="text-green-700 border-green-300 gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Válida
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              Inválida
                            </Badge>
                          )}
                          {item.payload?.type && (
                            <Badge variant="secondary">{item.payload.type}</Badge>
                          )}
                          {item.payload?.difficulty && (
                            <Badge variant="outline">{item.payload.difficulty}</Badge>
                          )}
                          {item.payload?.title && (
                            <span className="text-sm text-muted-foreground truncate">
                              {item.payload.title}
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-foreground line-clamp-2">
                          {item.payload?.text || "Sem enunciado"}
                        </p>

                        {item.errors?.length > 0 && (
                          <ul className="space-y-1">
                            {item.errors.map((err) => (
                              <li
                                key={err}
                                className="text-sm text-destructive flex items-start gap-1.5"
                              >
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                {err}
                              </li>
                            ))}
                          </ul>
                        )}

                        {item.warnings?.length > 0 && (
                          <ul className="space-y-1">
                            {item.warnings.map((warn) => (
                              <li
                                key={warn}
                                className="text-sm text-amber-700 dark:text-amber-400"
                              >
                                {warn}
                              </li>
                            ))}
                          </ul>
                        )}

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="px-0 h-auto"
                          onClick={() => setPreviewDialogItem(item)}
                        >
                          Ver preview completo
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-2 border-t">
              <p className="text-sm text-muted-foreground">
                {selectedValidCount} questão(ões) válida(s) selecionada(s) para importar
              </p>
              <Button
                onClick={() => void handleCommit()}
                disabled={commitLoading || selectedValidCount === 0}
              >
                {commitLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Importar selecionadas
              </Button>
            </div>
          </section>
        )}
      </div>

      <Dialog
        open={Boolean(previewDialogItem)}
        onOpenChange={(open) => {
          if (!open) setPreviewDialogItem(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Preview — Questão {previewDialogItem?.index}
            </DialogTitle>
          </DialogHeader>
          {previewDialogItem && (
            <QuestionPreview
              question={toPreviewQuestion(previewDialogItem)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ImportQuestionsPage;
