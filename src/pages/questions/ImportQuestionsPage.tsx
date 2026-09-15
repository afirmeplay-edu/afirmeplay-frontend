import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { QuestionsImportPreviewList } from "@/components/evaluations/questions/QuestionsImportPreviewList";
import {
  buildQuestionImportSubjectParams,
  downloadQuestionsImportTemplate,
  importQuestionsDocx,
  questionsImportApiError,
} from "@/services/questions/questionsImportApi";
import type { QuestionImportResponse } from "@/types/questions-import";

type SubjectOption = { id: string; name: string };
type GradeOption = { id: string; name: string };

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function isDocxFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".docx") || file.type === DOCX_MIME;
}

const ImportQuestionsPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [grades, setGrades] = useState<GradeOption[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [gradeId, setGradeId] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);

  const [preview, setPreview] = useState<QuestionImportResponse | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());

  const subjectParams = useMemo(
    () => buildQuestionImportSubjectParams(selectedSubjectIds),
    [selectedSubjectIds]
  );
  const formReady = Boolean(gradeId && subjectParams);

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
  }, []);

  const toggleSubject = (id: string) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    resetPreview();
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
          "Preencha enunciados, disciplina (SubjectId) e dificuldade por questão.",
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
    try {
      const data = await importQuestionsDocx({
        file: selectedFile,
        grade: gradeId,
        ...subjectParams,
        commit: false,
      });

      if (data.mode === "commit") {
        toast({
          title: "Resposta inesperada",
          description: "O servidor retornou commit em vez de preview. Tente novamente.",
          variant: "destructive",
        });
        return;
      }

      setPreview(data);
      setSelectedIndexes(
        new Set((data.questions || []).filter((q) => q.valid).map((q) => q.index))
      );

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

  const handleCommit = async () => {
    if (!formReady || !selectedFile || !preview || !subjectParams) return;
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
        grade: gradeId,
        ...subjectParams,
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
            Selecione série e uma ou mais disciplinas, baixe o template e confira o preview antes de importar.
          </p>
        </div>

        <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">1. Contexto da importação</h2>
            <p className="text-sm text-muted-foreground">
              A série é obrigatória. Com 1 disciplina enviamos <code>subjectId</code>; com várias,{" "}
              <code>subjectIds</code>.
            </p>
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
              <SelectTrigger className="max-w-md">
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

          <div className="space-y-2">
            <Label>Disciplinas *</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto rounded-lg border p-3">
              {loadingMeta ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : (
                subjects.map((s) => {
                  const checked = selectedSubjectIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleSubject(s.id)}
                      />
                      {s.name}
                    </label>
                  );
                })
              )}
            </div>
            {selectedSubjectIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedSubjectIds.length} disciplina(s) selecionada(s)
              </p>
            )}
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
            <p className="text-xs text-muted-foreground mb-4">Apenas arquivos Word (.docx)</p>
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

        {preview && (
          <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
            <h2 className="text-lg font-semibold">3. Preview e seleção</h2>
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
            />

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
    </div>
  );
};

export default ImportQuestionsPage;
