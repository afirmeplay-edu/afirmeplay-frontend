import { useState } from "react";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import QuestionPreview from "@/components/evaluations/questions/QuestionPreview";
import type { Question } from "@/components/evaluations/types";
import type {
  QuestionImportItem,
  QuestionImportResponse,
} from "@/types/questions-import";

export function toImportPreviewQuestion(item: QuestionImportItem): Question {
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
    difficulty: payload.difficulty || item.resolved?.difficulty || "",
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

function formContextLabel(preview: QuestionImportResponse): string {
  const form = preview.form;
  if (!form) return "";
  const subjects =
    form.subjects?.map((s) => s.name).filter(Boolean).join(", ") ||
    form.subjectName ||
    "";
  const parts = [subjects, form.gradeName].filter(Boolean);
  return parts.join(" · ");
}

type QuestionsImportPreviewListProps = {
  preview: QuestionImportResponse;
  selectedIndexes: Set<number>;
  onToggleIndex: (index: number, valid: boolean) => void;
  onSelectAllValid: () => void;
  onClearSelection: () => void;
  checkboxIdPrefix?: string;
};

export function QuestionsImportPreviewList({
  preview,
  selectedIndexes,
  onToggleIndex,
  onSelectAllValid,
  onClearSelection,
  checkboxIdPrefix = "import-q",
}: QuestionsImportPreviewListProps) {
  const [previewDialogItem, setPreviewDialogItem] = useState<QuestionImportItem | null>(null);

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Preview e seleção</h3>
          <p className="text-sm text-muted-foreground">{formContextLabel(preview)}</p>
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
        <Button type="button" variant="outline" size="sm" onClick={onSelectAllValid}>
          Marcar válidas
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onClearSelection}>
          Limpar seleção
        </Button>
      </div>

      <ul className="space-y-3">
        {preview.questions.map((item) => {
          const checked = selectedIndexes.has(item.index);
          const subjectLabel =
            item.resolved?.subjectName || item.payload?.subjectId || null;
          const difficulty =
            item.payload?.difficulty || item.resolved?.difficulty || null;
          const checkboxId = `${checkboxIdPrefix}-${item.index}`;

          return (
            <li
              key={item.index}
              className={cn(
                "rounded-lg border p-4 space-y-3",
                item.valid ? "bg-background" : "bg-destructive/5 border-destructive/40"
              )}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  id={checkboxId}
                  checked={checked}
                  disabled={!item.valid}
                  onCheckedChange={() => onToggleIndex(item.index, item.valid)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor={checkboxId} className="font-semibold cursor-pointer">
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
                    {subjectLabel && <Badge variant="secondary">{subjectLabel}</Badge>}
                    {difficulty && <Badge variant="outline">{difficulty}</Badge>}
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

      <Dialog
        open={Boolean(previewDialogItem)}
        onOpenChange={(open) => {
          if (!open) setPreviewDialogItem(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview — Questão {previewDialogItem?.index}</DialogTitle>
          </DialogHeader>
          {previewDialogItem && (
            <QuestionPreview question={toImportPreviewQuestion(previewDialogItem)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
