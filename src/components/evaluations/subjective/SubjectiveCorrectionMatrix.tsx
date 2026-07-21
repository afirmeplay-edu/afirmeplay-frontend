import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserCheck, UserX, ClipboardCheck } from "lucide-react";
import {
  subjectiveTestApi,
  type SubjectiveCorrectionMatrixResponse,
  type SubjectiveRubricValue,
  type FinalizeClassCorrectionResponse,
  type SubjectiveStudentEvaluation,
  type SubjectiveStudentResultPreview,
  type FinalizeProcessedStudent,
} from "@/services/evaluation/subjectiveTestApi";
import { cn } from "@/lib/utils";

interface SubjectiveCorrectionMatrixProps {
  testId: string;
  classId: string;
}

const RUBRIC_OPTIONS: {
  value: SubjectiveRubricValue;
  label: string;
  title: string;
  activeClass: string;
}[] = [
  { value: "SIM", label: "S", title: "Sim", activeClass: "bg-green-500 text-white border-green-500 shadow-sm scale-105" },
  { value: "PARCIAL", label: "P", title: "Parcial", activeClass: "bg-yellow-400 text-white border-yellow-400 shadow-sm scale-105" },
  { value: "NAO", label: "N", title: "Não", activeClass: "bg-red-500 text-white border-red-500 shadow-sm scale-105" },
  { value: "BRANCO", label: "B", title: "Branco", activeClass: "bg-slate-400 text-white border-slate-400 shadow-sm scale-105" },
];

function cellKey(questionId: string, studentId: string) {
  return `${questionId}::${studentId}`;
}

function evaluationFromPreview(preview: SubjectiveStudentResultPreview): SubjectiveStudentEvaluation | null {
  if (preview.skipped) return null;
  return {
    score_percentage: preview.score_percentage,
    grade: preview.grade,
    proficiency: preview.proficiency,
    classification: preview.classification,
    correct_answers: preview.correct_answers,
    total_questions: preview.total_questions,
    persisted: preview.persisted ?? false,
  };
}

function evaluationFromProcessed(processed: FinalizeProcessedStudent): SubjectiveStudentEvaluation {
  return {
    score_percentage: processed.score_percentage,
    grade: processed.grade,
    proficiency: processed.proficiency,
    classification: processed.classification,
    correct_answers: processed.correct_answers,
    total_questions: processed.total_questions,
    persisted: processed.persisted ?? true,
  };
}

/** Níveis SAEB do protótipo AVALIAÇÃO SUBJETIVA (emoji + cor por % / classificação). */
const SAEB_LEGEND = [
  { label: "Abaixo do Básico", emoji: "😠", range: "< 40%", className: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300" },
  { label: "Básico", emoji: "😕", range: "40–59%", className: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  { label: "Adequado", emoji: "😊", range: "60–79%", className: "bg-lime-100 text-lime-800 dark:bg-lime-950/40 dark:text-lime-300" },
  { label: "Avançado", emoji: "🤩", range: "≥ 80%", className: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" },
] as const;

function classificationStyle(classification: string, pct: number) {
  const c = classification.toLowerCase();
  if (c.includes("avançado") || c.includes("avancado") || pct >= 80) {
    return { emoji: "🤩", className: SAEB_LEGEND[3].className };
  }
  if (c.includes("adequado") || pct >= 60) {
    return { emoji: "😊", className: SAEB_LEGEND[2].className };
  }
  if (c.includes("básico") || c.includes("basico") || pct >= 40) {
    return { emoji: "😕", className: SAEB_LEGEND[1].className };
  }
  return { emoji: "😠", className: SAEB_LEGEND[0].className };
}

function formatPct(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function SubjectiveCorrectionMatrix({ testId, classId }: SubjectiveCorrectionMatrixProps) {
  const { toast } = useToast();
  const [data, setData] = useState<SubjectiveCorrectionMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [savingPresence, setSavingPresence] = useState<Set<string>>(new Set());
  const [previewingStudents, setPreviewingStudents] = useState<Set<string>>(new Set());
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<FinalizeClassCorrectionResponse | null>(null);

  const applyStudentEvaluation = (studentId: string, evaluation: SubjectiveStudentEvaluation | null) => {
    setData((prevData) => {
      if (!prevData) return prevData;
      return {
        ...prevData,
        students: prevData.students.map((student) =>
          student.id === studentId ? { ...student, evaluation } : student
        ),
      };
    });
  };

  const refreshStudentPreview = async (studentId: string) => {
    setPreviewingStudents((prev) => new Set(prev).add(studentId));
    try {
      const preview = await subjectiveTestApi.getStudentResultPreview(testId, studentId);
      applyStudentEvaluation(studentId, evaluationFromPreview(preview));
    } catch (err) {
      console.error("Erro ao buscar preview do resultado do aluno:", err);
    } finally {
      setPreviewingStudents((prev) => {
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setFinalizeResult(null);
    subjectiveTestApi
      .getCorrectionMatrix(testId, classId)
      .then(async (response) => {
        if (!active) return;
        setData(response);

        // Mid-correction reload: alunos com rubrica lançada mas sem evaluation persistida
        // recebem preview ao vivo (sem calcular no frontend).
        const needsPreview = response.students.filter(
          (s) =>
            s.present &&
            Object.keys(s.results).length > 0 &&
            !(s.evaluation && s.evaluation.persisted)
        );
        if (needsPreview.length === 0) return;

        setPreviewingStudents(new Set(needsPreview.map((s) => s.id)));
        const previews = await Promise.allSettled(
          needsPreview.map((s) => subjectiveTestApi.getStudentResultPreview(testId, s.id))
        );
        if (!active) return;

        const byStudent = new Map<string, SubjectiveStudentEvaluation | null>();
        previews.forEach((result, idx) => {
          const studentId = needsPreview[idx].id;
          if (result.status === "fulfilled") {
            byStudent.set(studentId, evaluationFromPreview(result.value));
          }
        });

        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            students: prev.students.map((student) =>
              byStudent.has(student.id)
                ? { ...student, evaluation: byStudent.get(student.id) ?? null }
                : student
            ),
          };
        });
        setPreviewingStudents(new Set());
      })
      .catch((err) => {
        console.error("Erro ao carregar matriz de correção subjetiva:", err);
        if (active) {
          const status = err?.response?.status;
          if (status === 400) setError("Esta avaliação não é do tipo subjetiva.");
          else if (status === 403) setError("Você não tem acesso a esta turma.");
          else if (status === 404) setError("Avaliação ou turma não encontrada.");
          else setError("Não foi possível carregar a matriz de correção.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [testId, classId]);

  const totalQuestions = data?.questions.length ?? 0;

  const handleRubricClick = async (
    questionId: string,
    studentId: string,
    current: SubjectiveRubricValue | null,
    clicked: SubjectiveRubricValue
  ) => {
    if (!data) return;
    const key = cellKey(questionId, studentId);
    if (savingCells.has(key)) return;

    // Clicar no mesmo valor remove o lançamento (toggle).
    const nextValue: SubjectiveRubricValue | null = current === clicked ? null : clicked;
    setSavingCells((prev) => new Set(prev).add(key));
    try {
      const response = await subjectiveTestApi.setCorrectionCell(testId, {
        subjective_question_id: questionId,
        student_id: studentId,
        value: nextValue,
      });
      const appliedValue = response.removed ? null : response.result.value;
      setData((prevData) => {
        if (!prevData) return prevData;
        return {
          ...prevData,
          students: prevData.students.map((student) => {
            if (student.id !== studentId) return student;
            const nextResults = { ...student.results };
            if (appliedValue) {
              nextResults[questionId] = appliedValue;
            } else {
              delete nextResults[questionId];
            }
            return { ...student, results: nextResults };
          }),
        };
      });
      await refreshStudentPreview(studentId);
    } catch (err) {
      console.error("Erro ao salvar rubrica:", err);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar a correção desta célula. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSavingCells((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleTogglePresence = async (studentId: string, currentPresent: boolean) => {
    if (savingPresence.has(studentId)) return;
    setSavingPresence((prev) => new Set(prev).add(studentId));
    try {
      await subjectiveTestApi.setPresence(testId, { student_id: studentId, present: !currentPresent });
      setData((prevData) => {
        if (!prevData) return prevData;
        return {
          ...prevData,
          students: prevData.students.map((student) =>
            student.id === studentId ? { ...student, present: !currentPresent } : student
          ),
        };
      });
      await refreshStudentPreview(studentId);
    } catch (err) {
      console.error("Erro ao salvar presença:", err);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível atualizar a presença do aluno.",
        variant: "destructive",
      });
    } finally {
      setSavingPresence((prev) => {
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      const result = await subjectiveTestApi.finalizeClassCorrection(testId, classId);
      setFinalizeResult(result);

      const processedById = new Map(
        result.processed.filter((p) => !p.skipped).map((p) => [p.student_id, p] as const)
      );
      const skipped = new Set(result.skipped_student_ids);
      const errored = new Set(result.error_student_ids);

      setData((prevData) => {
        if (!prevData) return prevData;
        return {
          ...prevData,
          students: prevData.students.map((student) => {
            if (skipped.has(student.id) || errored.has(student.id)) {
              return { ...student, evaluation: null };
            }
            const processed = processedById.get(student.id);
            if (processed) {
              return { ...student, evaluation: evaluationFromProcessed(processed) };
            }
            return student;
          }),
        };
      });

      toast({
        title: "Correção finalizada",
        description: `${result.processed_count} aluno(s) processado(s), ${result.skipped_count} sem lançamento, ${result.error_count} erro(s).`,
      });
    } catch (err) {
      console.error("Erro ao finalizar correção:", err);
      toast({
        title: "Erro ao finalizar",
        description: "Não foi possível finalizar a correção da turma.",
        variant: "destructive",
      });
    } finally {
      setFinalizing(false);
    }
  };

  const summary = useMemo(() => {
    if (!data) return null;
    const totalCells = data.students.length * data.questions.length;
    const filledCells = data.students.reduce((acc, s) => acc + Object.keys(s.results).length, 0);
    const presentCount = data.students.filter((s) => s.present).length;
    return { totalCells, filledCells, presentCount, totalStudents: data.students.length };
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <TooltipProvider>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">{data.subjective_test.title}</h3>
          <p className="text-sm text-muted-foreground">
            Turma {data.class.name} · {summary?.totalStudents ?? 0} aluno(s) · {totalQuestions} questão(ões)
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{summary?.presentCount ?? 0} presente(s)</span>
          <span>·</span>
          <span>
            {summary?.filledCells ?? 0}/{summary?.totalCells ?? 0} lançamentos
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        <span>
          Clique em <b>S</b> (Sim), <b>P</b> (Parcial), <b>N</b> (Não) ou <b>B</b> (Branco). Clique de novo no mesmo valor
          para remover. Aluno ausente bloqueia as respostas. O índice ao fim da linha vem do servidor após cada lançamento.
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {SAEB_LEGEND.map((level) => (
            <span
              key={level.label}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                level.className
              )}
              title={level.label}
            >
              <span>{level.emoji}</span>
              {level.label}{" "}
              <span className="opacity-70">{level.range}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60">
              <th className="sticky left-0 z-10 min-w-[220px] border-b border-r border-border bg-muted/60 p-3 text-left font-semibold text-foreground">
                Aluno
              </th>
              <th className="min-w-[90px] border-b border-r border-border p-3 text-center font-semibold text-foreground">
                Presença
              </th>
              {data.questions.map((q) => (
                <th
                  key={q.id}
                  className="min-w-[140px] max-w-[140px] border-b border-l border-border p-2 text-center align-bottom font-semibold text-foreground"
                >
                  <div className="mx-auto mb-1 inline-flex items-center justify-center rounded-md bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                    {q.code || `Q${q.number}`}
                  </div>
                  {q.skill_description && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="mx-auto mt-0.5 w-full cursor-default truncate px-1 text-[10px] font-normal leading-tight text-muted-foreground">
                          {q.skill_description}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs">{q.skill_description}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </th>
              ))}
              <th className="min-w-[120px] border-b border-l border-border p-3 text-center font-semibold text-foreground">
                Índice
              </th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((student, rowIdx) => {
              const evaluation = student.evaluation ?? null;
              const isPreviewing = previewingStudents.has(student.id);
              return (
              <tr
                key={student.id}
                className={cn(rowIdx % 2 === 1 && "bg-muted/20", !student.present && "opacity-50")}
              >
                <td className="sticky left-0 z-10 border-b border-r border-border bg-card p-3 font-medium text-foreground">
                  <div>{student.name}</div>
                  {student.registration && (
                    <div className="text-xs text-muted-foreground">{student.registration}</div>
                  )}
                </td>
                <td className="border-b border-r border-border p-2 text-center">
                  <Button
                    type="button"
                    size="sm"
                    variant={student.present ? "outline" : "destructive"}
                    className="h-8 gap-1 px-2 text-xs"
                    disabled={savingPresence.has(student.id)}
                    onClick={() => handleTogglePresence(student.id, student.present)}
                  >
                    {savingPresence.has(student.id) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : student.present ? (
                      <UserCheck className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <UserX className="h-3.5 w-3.5" />
                    )}
                    {student.present ? "Presente" : "Ausente"}
                  </Button>
                </td>
                {data.questions.map((q) => {
                  const value = student.results[q.id] ?? null;
                  const key = cellKey(q.id, student.id);
                  const isSaving = savingCells.has(key);
                  return (
                    <td key={q.id} className="border-b border-l border-border px-1.5 py-1.5">
                      <div className="flex justify-center gap-0.5">
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          RUBRIC_OPTIONS.map((option) => {
                            const active = value === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                title={option.title}
                                disabled={!student.present}
                                onClick={() => handleRubricClick(q.id, student.id, value, option.value)}
                                className={cn(
                                  "h-7 w-7 rounded-md border text-[11px] font-bold transition-all",
                                  active
                                    ? option.activeClass
                                    : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
                                  !student.present && "cursor-not-allowed"
                                )}
                              >
                                {option.label}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="border-b border-l border-border px-3 py-2 text-center">
                  {!student.present ? (
                    <span className="inline-flex min-w-[52px] justify-center rounded-full bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">
                      —
                    </span>
                  ) : isPreviewing ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                  ) : evaluation ? (
                    (() => {
                      const style = classificationStyle(
                        evaluation.classification,
                        evaluation.score_percentage
                      );
                      return (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className={cn(
                            "inline-flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-xs font-bold",
                            style.className
                          )}
                        >
                          <span className="inline-flex items-center gap-1">
                            <span className="text-sm leading-none">{style.emoji}</span>
                            {formatPct(evaluation.score_percentage)}%
                          </span>
                          <span className="text-[10px] font-semibold leading-tight opacity-90">
                            {evaluation.classification}
                          </span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs">
                          Nota {Number(evaluation.grade).toFixed(1)} · Proficiência{" "}
                          {typeof evaluation.proficiency === "number"
                            ? evaluation.proficiency.toFixed(1)
                            : evaluation.proficiency}
                          {evaluation.persisted ? " · gravado" : " · preview"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                      );
                    })()
                  ) : (
                    <span className="inline-flex min-w-[52px] justify-center rounded-full bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">
                      —
                    </span>
                  )}
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {RUBRIC_OPTIONS.map((option) => (
          <span key={option.value} className="flex items-center gap-1">
            <span
              className={cn(
                "grid h-5 w-5 place-items-center rounded border text-[10px] font-bold text-white",
                option.activeClass
              )}
            >
              {option.label}
            </span>
            {option.title}
          </span>
        ))}
      </div>

      <div className="flex flex-col items-stretch gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {finalizeResult ? (
            <span>
              Última finalização: {finalizeResult.processed_count} processado(s), {finalizeResult.skipped_count} sem
              lançamento, {finalizeResult.error_count} erro(s).
            </span>
          ) : (
            <span>
              O índice atualiza a cada lançamento. Finalize a turma para gravar nota e proficiência nos relatórios.
            </span>
          )}
        </div>
        <Button onClick={handleFinalize} disabled={finalizing} className="gap-2">
          {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
          Finalizar correção da turma
        </Button>
      </div>

      {finalizeResult &&
        (finalizeResult.skipped_student_ids.length > 0 || finalizeResult.error_student_ids.length > 0) && (
          <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400">
            {finalizeResult.skipped_student_ids.length > 0 && (
              <p>
                <Badge variant="outline" className="mr-2 border-yellow-400 text-yellow-700 dark:text-yellow-400">
                  Sem lançamento
                </Badge>
                {finalizeResult.skipped_student_ids.length} aluno(s) ausente(s) ou sem nenhuma rubrica lançada.
              </p>
            )}
            {finalizeResult.error_student_ids.length > 0 && (
              <p className="mt-1">
                <Badge variant="outline" className="mr-2 border-red-400 text-red-700 dark:text-red-400">
                  Erro
                </Badge>
                {finalizeResult.error_student_ids.length} aluno(s) com erro ao calcular.
              </p>
            )}
          </div>
        )}
    </div>
    </TooltipProvider>
  );
}

export default SubjectiveCorrectionMatrix;
