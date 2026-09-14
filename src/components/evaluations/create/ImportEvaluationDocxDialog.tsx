import { useCallback, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { QuestionsImportPreviewList } from "@/components/evaluations/questions/QuestionsImportPreviewList";
import {
  buildQuestionImportSubjectParams,
  downloadQuestionsImportTemplate,
  importQuestionsDocx,
  questionsImportApiError,
} from "@/services/questions/questionsImportApi";
import {
  getTestImportDocxFailed,
  importTestFromDocx,
  testImportDocxApiError,
} from "@/services/evaluation/testImportDocxApi";
import type { QuestionImportFailedItem, QuestionImportResponse } from "@/types/questions-import";
import type { Subject } from "@/components/evaluations/types";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function isDocxFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".docx") || file.type === DOCX_MIME;
}

export type ImportEvaluationDocxDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gradeId: string;
  gradeName?: string;
  subjects: Subject[];
  evaluation: {
    title: string;
    description: string;
    type: "AVALIACAO" | "SIMULADO";
    model: string;
    course: string;
    duration: string;
    createdBy: string;
    timeLimit: string;
    endTime: string;
    classes: string[];
    schools: string[];
    municipalities: string[];
    cityId?: string;
    available_to_municipality?: boolean;
    available_from?: string | null;
  };
  onSuccess: (testId: string) => void;
};

export function ImportEvaluationDocxDialog({
  open,
  onOpenChange,
  gradeId,
  gradeName,
  subjects,
  evaluation,
  onSuccess,
}: ImportEvaluationDocxDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [preview, setPreview] = useState<QuestionImportResponse | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [commitFailed, setCommitFailed] = useState<QuestionImportFailedItem[]>([]);

  const subjectIds = useMemo(() => subjects.map((s) => s.id).filter(Boolean), [subjects]);
  const subjectParams = useMemo(
    () => buildQuestionImportSubjectParams(subjectIds),
    [subjectIds]
  );
  const formReady = Boolean(gradeId && subjectParams);

  const resetPreview = useCallback(() => {
    setPreview(null);
    setSelectedIndexes(new Set());
    setCommitFailed([]);
  }, []);

  const resetAll = useCallback(() => {
    setSelectedFile(null);
    setDragActive(false);
    resetPreview();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [resetPreview]);

  const handleOpenChange = (next: boolean) => {
    if (!next) resetAll();
    onOpenChange(next);
  };

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
    if (!formReady || !subjectParams) return;
    setDownloadingTemplate(true);
    try {
      await downloadQuestionsImportTemplate({
        grade: gradeId,
        ...subjectParams,
      });
      toast({
        title: "Template baixado",
        description:
          "Use SubjectId/Disciplina por questão no Word. Dificuldade: Abaixo do Básico, Básico, Adequado ou Avançado.",
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
    if (!formReady || !selectedFile || !subjectParams) return;
    setPreviewLoading(true);
    setCommitFailed([]);
    try {
      const data = await importQuestionsDocx({
        file: selectedFile,
        grade: gradeId,
        ...subjectParams,
        commit: false,
      });
      if (data.mode !== "preview") {
        toast({
          title: "Resposta inesperada",
          description: "O servidor não retornou preview. Tente novamente.",
          variant: "destructive",
        });
        return;
      }
      setPreview(data);
      setSelectedIndexes(
        new Set((data.questions || []).filter((q) => q.valid).map((q) => q.index))
      );
      toast({
        title: "Pré-visualização pronta",
        description: `${data.summary.valid} válida(s), ${data.summary.invalid} inválida(s).`,
      });
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

  const handleCreate = async () => {
    if (!formReady || !selectedFile || !subjectParams || !preview) return;
    if (selectedValidCount === 0) {
      toast({
        title: "Nenhuma questão selecionada",
        description: "Marque ao menos uma questão válida.",
        variant: "destructive",
      });
      return;
    }

    const indexes = Array.from(selectedIndexes)
      .filter((idx) => preview.questions.some((q) => q.index === idx && q.valid))
      .sort((a, b) => a - b);

    const subjectsInfo = subjects.map((subject) => ({
      subject: subject.id,
      weight: Math.round(100 / Math.max(subjects.length, 1)),
    }));

    const needsSubjectsInfo =
      evaluation.type === "SIMULADO" || subjects.length > 1;

    setCommitLoading(true);
    setCommitFailed([]);
    try {
      const result = await importTestFromDocx({
        file: selectedFile,
        grade: gradeId,
        ...subjectParams,
        indexes,
        title: evaluation.title,
        type: evaluation.type,
        model: evaluation.model,
        course: evaluation.course,
        created_by: evaluation.createdBy,
        evaluation_mode: "virtual",
        description: evaluation.description,
        duration: parseInt(evaluation.duration, 10) || 60,
        time_limit: evaluation.timeLimit,
        end_time: evaluation.endTime,
        classes: evaluation.classes,
        schools: evaluation.schools,
        municipalities: evaluation.municipalities,
        cityId: evaluation.cityId,
        available_to_municipality: evaluation.available_to_municipality,
        available_from: evaluation.available_from,
        ...(needsSubjectsInfo ? { subjects_info: subjectsInfo } : {}),
      });

      toast({
        title: "Avaliação criada",
        description:
          result.summary?.created != null
            ? `${result.summary.created} questão(ões) importada(s) e vinculadas à prova.`
            : result.message || "Avaliação criada com questões do DOCX.",
      });
      handleOpenChange(false);
      onSuccess(result.id);
    } catch (error) {
      const body =
        getTestImportDocxFailed(error) ||
        (error as { importBody?: ReturnType<typeof getTestImportDocxFailed> }).importBody ||
        null;
      if (body?.failed?.length) {
        setCommitFailed(body.failed);
      }
      toast({
        title: "Não foi possível criar a avaliação",
        description: testImportDocxApiError(
          error,
          body?.error || "Ajuste as questões inválidas ou desmarque no preview."
        ),
        variant: "destructive",
      });
    } finally {
      setCommitLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            Importar questões do Word
          </DialogTitle>
          <DialogDescription>
            Cria a avaliação e as questões do DOCX de uma vez. Série:{" "}
            {gradeName || "selecionada"} · Disciplinas:{" "}
            {subjects.map((s) => s.name).join(", ") || "—"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!formReady || downloadingTemplate}
              onClick={() => void handleDownloadTemplate()}
            >
              {downloadingTemplate ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Baixar template
            </Button>
          </div>

          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
              dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"
            )}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileSelect(file);
            }}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium mb-1">Arraste o .docx ou selecione</p>
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
              onClick={() => fileInputRef.current?.click()}
            >
              Selecionar arquivo
            </Button>
            {selectedFile && (
              <p className="mt-2 text-sm">
                Arquivo: <span className="font-medium">{selectedFile.name}</span>
              </p>
            )}
          </div>

          <Button
            type="button"
            disabled={!selectedFile || previewLoading || !formReady}
            onClick={() => void handlePreview()}
          >
            {previewLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Analisar arquivo
          </Button>

          {preview && (
            <div className="space-y-4 border-t pt-4">
              <QuestionsImportPreviewList
                preview={preview}
                selectedIndexes={selectedIndexes}
                onToggleIndex={toggleIndex}
                onSelectAllValid={() =>
                  setSelectedIndexes(
                    new Set(preview.questions.filter((q) => q.valid).map((q) => q.index))
                  )
                }
                onClearSelection={() => setSelectedIndexes(new Set())}
                checkboxIdPrefix="eval-import-q"
              />

              {commitFailed.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                  <p className="text-sm font-medium text-destructive">
                    Nada foi gravado. Questões com problema:
                  </p>
                  <ul className="space-y-1">
                    {commitFailed.map((f) => (
                      <li key={f.index} className="text-sm text-destructive">
                        Questão {f.index}: {(f.errors || []).join("; ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-2">
                <p className="text-sm text-muted-foreground">
                  {selectedValidCount} questão(ões) selecionada(s)
                </p>
                <Button
                  type="button"
                  disabled={commitLoading || selectedValidCount === 0}
                  onClick={() => void handleCreate()}
                >
                  {commitLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Criar avaliação com selecionadas
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
