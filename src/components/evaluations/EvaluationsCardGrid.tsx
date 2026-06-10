import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye,
  FileText,
  ClipboardCheck,
  MoreVertical,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import type { Evaluation } from "@/types/evaluation-types";
import {
  formatEvaluationListDate,
  formatEvaluationListDateTime,
  formatEvaluationQuestionCount,
  getEvaluationAppliedAt,
  getEvaluationApplicationEnd,
  getEvaluationApplicationStart,
  getEvaluationCreatedAt,
} from "./evaluationListUtils";
import { cn } from "@/lib/utils";

type VariantMode = "default" | "transformTab" | "correctionTab";

interface EvaluationsCardGridProps {
  evaluations: Evaluation[];
  isLoading: boolean;
  selectedIds: string[];
  onSelectOne: (id: string, checked: boolean) => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onStartEvaluation: (evaluation: Evaluation) => void;
  onNavigateToPhysical: (id: string) => void;
  variant?: VariantMode;
  getTypeColor: (type: string) => string;
  getModelColor: (model: string) => string;
  formatDate: (dateString: string) => string;
  SubjectsList: ComponentType<{ evaluation: Evaluation }>;
}

export function EvaluationsCardGrid({
  evaluations,
  isLoading,
  selectedIds,
  onSelectOne,
  onView,
  onEdit,
  onDelete,
  onStartEvaluation,
  onNavigateToPhysical,
  variant = "default",
  getTypeColor,
  getModelColor,
  SubjectsList,
}: EvaluationsCardGridProps) {
  const showSelection = variant !== "transformTab" && variant !== "correctionTab";

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardHeader className="space-y-2">
              <Skeleton className="h-5 w-[75%]" />
              <Skeleton className="h-3 w-full" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-6 w-1/2" />
            </CardContent>
            <CardFooter>
              <Skeleton className="h-9 w-full" />
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  const list = evaluations.filter((e) => e?.id);

  if (list.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">
            Nenhuma avaliação encontrada com os filtros atuais.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ul
      className="grid grid-cols-1 gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      role="list"
    >
      {list.map((evaluation) => {
        const checked = selectedIds.includes(evaluation.id);
        return (
          <li key={evaluation.id}>
            <Card
              className={cn(
                "flex h-full flex-col overflow-hidden border-border/80 shadow-sm transition-shadow hover:shadow-md",
                checked && "ring-2 ring-primary/30"
              )}
            >
              <CardHeader className="space-y-3 pb-3">
                <div className="flex items-start gap-3">
                  {showSelection && (
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) =>
                        onSelectOne(evaluation.id, !!c)
                      }
                      aria-label={`Selecionar avaliação ${evaluation.title}`}
                      className="mt-1"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="line-clamp-2 text-base font-semibold leading-tight">
                      {evaluation.title}
                    </h3>
                    {evaluation.description ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {evaluation.description}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SubjectsList evaluation={evaluation} />
                  <Badge
                    variant="outline"
                    className="text-xs tabular-nums border-border bg-muted/20 dark:bg-muted/40"
                  >
                    {formatEvaluationQuestionCount(evaluation)} questões
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {evaluation.type ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        getTypeColor(evaluation.type)
                      )}
                    >
                      {evaluation.type}
                    </Badge>
                  ) : null}
                  {evaluation.model ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        getModelColor(evaluation.model)
                      )}
                    >
                      {evaluation.model}
                    </Badge>
                  ) : null}
                  {evaluation.grade ? (
                    <Badge
                      variant="outline"
                      className="text-xs border-border bg-muted/20 dark:bg-muted/40"
                    >
                      {evaluation.grade.name}
                    </Badge>
                  ) : null}
                </div>
                <div className="space-y-1.5 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground/80">Criador: </span>
                    {evaluation.createdBy?.name ?? "—"}
                  </div>
                  <div className="grid gap-0.5">
                    <div>
                      <span className="font-medium text-foreground/80">Criada em: </span>
                      {formatEvaluationListDate(getEvaluationCreatedAt(evaluation))}
                    </div>
                    <div>
                      <span className="font-medium text-foreground/80">Aplicada em: </span>
                      {formatEvaluationListDateTime(getEvaluationAppliedAt(evaluation))}
                    </div>
                    <div>
                      <span className="font-medium text-foreground/80">Início: </span>
                      {formatEvaluationListDateTime(getEvaluationApplicationStart(evaluation))}
                    </div>
                    <div>
                      <span className="font-medium text-foreground/80">Término: </span>
                      {formatEvaluationListDateTime(getEvaluationApplicationEnd(evaluation))}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardFooter className="mt-auto border-t bg-muted/20 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  {variant === "transformTab" ? (
                    <Button
                      type="button"
                      className="w-fit gap-2 px-2 py-2 text-sm whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                      onClick={() => onNavigateToPhysical(evaluation.id)}
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="whitespace-nowrap">Transformar em física</span>
                    </Button>
                  ) : null}

                  {variant === "correctionTab" ? (
                    <Button
                      type="button"
                      className="w-fit gap-2 px-2 py-2 text-sm whitespace-nowrap bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
                      onClick={() => onNavigateToPhysical(evaluation.id)}
                    >
                      <ClipboardCheck className="h-4 w-4 shrink-0" />
                      <span className="whitespace-nowrap">Abrir correção</span>
                    </Button>
                  ) : null}

                  {variant !== "transformTab" && variant !== "correctionTab" ? (
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-9 min-w-0 flex-1 gap-1 whitespace-nowrap bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 sm:flex-none"
                      onClick={() => onStartEvaluation(evaluation)}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Aplicar
                    </Button>
                  ) : null}

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-h-9 w-9 shrink-0 px-0 sm:w-9"
                    onClick={() => onView(evaluation.id)}
                    aria-label={`Ver avaliação: ${evaluation.title ?? evaluation.id}`}
                    title="Ver"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        // Mantém o botão dos "3 pontos" alinhado (evita quebrar para a linha de baixo).
                        className="min-h-9 w-9 shrink-0 px-0 sm:w-9"
                        aria-label={`Mais ações: ${evaluation.title}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() => onEdit(evaluation.id)}
                        className="cursor-pointer"
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(evaluation.id)}
                        className="cursor-pointer text-red-600 focus:text-red-700 dark:text-red-400 dark:focus:text-red-300"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardFooter>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
