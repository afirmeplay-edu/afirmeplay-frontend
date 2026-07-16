import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Eye, Pencil, Trash2, ChevronLeft, ChevronRight, RefreshCw, Play, MoreVertical, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { convertDateTimeLocalToISO } from "@/utils/date";
import StartEvaluationModal from "./StartEvaluationModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DisciplineTag } from "@/components/ui/discipline-tag";
import { getSubjectColors } from "@/utils/competition/competitionSubjectColors";
import { REPORT_TAG_BASE } from "@/utils/report/reportTagStyles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useEvaluations, useCache, useEvaluationsManager } from "@/hooks/use-cache";
import { useAuth } from "@/context/authContext";
import ErrorBoundary from "./ErrorBoundary";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "./results/constants";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Evaluation, Subject, Grade, getEvaluationSubjects, getEvaluationSubjectsCount } from "@/types/evaluation-types";
import { EvaluationsCardGrid } from "./EvaluationsCardGrid";
import { formatEvaluationQuestionCount } from "./evaluationListUtils";
import { cn } from "@/lib/utils";
import ViewEvaluation from "@/pages/evaluations/ViewEvaluation";

interface ReadyEvaluationsProps {
  onUseEvaluation?: (evaluation: Evaluation) => void;
  showMyEvaluations?: boolean; // true = mostrar apenas minhas avaliações, false = mostrar todas
  /** default: lista em cards com opção de tabela; transformTab/correctionTab: só cards, foco na ação */
  variant?: "default" | "transformTab" | "correctionTab";
  /** Se definido, substitui a navegação para `/app/avaliacao/:id/fisica` (ex.: fluxo embutido na Central). */
  onNavigateToPhysicalOverride?: (evaluationId: string) => void;
}

interface PaginationData {
  total?: number;
  pages?: number;
  page?: number;
  per_page?: number;
  has_next?: boolean;
  has_prev?: boolean;
}

interface FiltersData {
  subject: string;
  type: string;
  model: string;
  grade: string;
}

function isEligibleForPhysicalCorrection(evaluation: Evaluation): boolean {
  const status = String(evaluation.status || "")
    .trim()
    .toLowerCase();

  const hasAppliedFlag = Boolean(evaluation.is_applied);
  const hasAppliedClassesCount = Number(evaluation.applied_classes_count || 0) > 0;
  const hasAppliedClassesList = Array.isArray(evaluation.applied_classes) && evaluation.applied_classes.length > 0;
  const hasAppliedLikeStatus = [
    "applied",
    "completed",
    "finalizada",
    "concluida",
    "realizada",
    "corrigida",
  ].some((token) => status.includes(token));

  const physicalHints = evaluation as Evaluation & {
    has_physical_forms?: boolean;
    has_answer_sheet_data?: boolean;
    physical_test_generated?: boolean;
    has_physical_test?: boolean;
    is_physical_ready?: boolean;
  };

  const hasPhysicalGenerated =
    Boolean(physicalHints.has_physical_forms) ||
    Boolean(physicalHints.has_answer_sheet_data) ||
    Boolean(physicalHints.physical_test_generated) ||
    Boolean(physicalHints.has_physical_test) ||
    Boolean(physicalHints.is_physical_ready);

  return (
    hasAppliedFlag ||
    hasAppliedClassesCount ||
    hasAppliedClassesList ||
    hasAppliedLikeStatus ||
    hasPhysicalGenerated
  );
}

function isEligibleForPhysicalTransform(evaluation: Evaluation): boolean {
  const status = String(evaluation.status || "")
    .trim()
    .toLowerCase();

  const hasAppliedFlag = Boolean(evaluation.is_applied);
  const hasAppliedClassesCount = Number(evaluation.applied_classes_count || 0) > 0;
  const hasAppliedClassesList = Array.isArray(evaluation.applied_classes) && evaluation.applied_classes.length > 0;
  const hasAppliedLikeStatus = [
    "applied",
    "completed",
    "finalizada",
    "concluida",
    "realizada",
  ].some((token) => status.includes(token));

  return hasAppliedFlag || hasAppliedClassesCount || hasAppliedClassesList || hasAppliedLikeStatus;
}

// Componente separado para listar disciplinas
const SubjectsList = ({ evaluation }: { evaluation: Evaluation }) => {
  // Usar função helper padronizada
  const subjects = getEvaluationSubjects(evaluation);
  const subjectsCount = getEvaluationSubjectsCount(evaluation);

  // Se não há disciplinas
  if (subjects.length === 0) {
    return (
      <div className="flex flex-wrap gap-1">
        <Badge variant="secondary" className="text-xs text-muted-foreground">
          Sem disciplina
        </Badge>
      </div>
    );
  }

  // Se há apenas uma disciplina
  if (subjects.length === 1) {
    return (
      <div className="flex flex-wrap gap-1">
        <DisciplineTag
          subjectId={subjects[0].id}
          name={subjects[0].name}
          className="text-xs"
        />
      </div>
    );
  }

  // Se há múltiplas disciplinas
  return (
    <div className="flex flex-wrap gap-1 max-w-[150px] sm:max-w-[200px]">
      {/* Mostrar as duas primeiras disciplinas */}
      {subjects.slice(0, 2).map((subject, index) => (
        <DisciplineTag
          key={subject.id || index}
          subjectId={subject.id}
          name={subject.name}
          className="text-xs"
        />
      ))}

      {/* Mostrar +n se houver mais de 2 disciplinas */}
      {subjectsCount > 2 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="text-xs cursor-help border-blue-300 font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/50"
            >
              +{subjectsCount - 2}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-2">
              <p className="font-semibold text-sm text-foreground">Outras disciplinas:</p>
              <div className="space-y-1">
                {subjects.slice(2).map((subject, index) => {
                  const dotBg = getSubjectColors(subject.id || '', subject.name).border.replace(
                    /^border-l-/,
                    'bg-'
                  );
                  return (
                    <div key={subject.id || index} className="flex items-center gap-2">
                      <div className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotBg)} />
                      <span className="text-sm text-foreground">{subject.name}</span>
                    </div>
                  );
                })}
                {subjectsCount > subjects.length && (
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full"></div>
                    <span className="text-sm text-muted-foreground">
                      +{subjectsCount - subjects.length} disciplinas adicionais
                    </span>
                  </div>
                )}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

// Componente para renderizar a tabela de avaliações
const EvaluationsTable = ({
  evaluations,
  pagination,
  isLoading,
  searchTerm,
  filters,
  selectedIds,
  currentPage,
  itemsPerPage,
  subjects,
  grades,
  showMyEvaluations,
  onPageChange,
  onFilterChange,
  onSearchChange,
  onSelectAll,
  onSelectOne,
  onView,
  onEdit,
  onDelete,
  onStartEvaluation,
  onRefresh,
  onClearFilters,
  hasActiveFilters,
  onNavigateToPhysical,
  onExport,
  isExporting,
  layout,
  variant,
}: {
  evaluations: Evaluation[];
  pagination: PaginationData | null | undefined;
  isLoading: boolean;
  searchTerm: string;
  filters: FiltersData;
  selectedIds: string[];
  currentPage: number;
  itemsPerPage: number;
  subjects: Subject[];
  grades: Grade[];
  showMyEvaluations?: boolean;
  onPageChange: (page: number) => void;
  onFilterChange: (key: string, value: string) => void;
  onSearchChange: (value: string) => void;
  onSelectAll: (checked: boolean) => void;
  onSelectOne: (id: string, checked: boolean) => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onStartEvaluation: (evaluation: Evaluation) => void;
  onRefresh: () => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  onNavigateToPhysical: (evaluationId: string) => void;
  onExport: () => void;
  isExporting: boolean;
  layout: "table" | "cards";
  variant: "default" | "transformTab" | "correctionTab";
}) => {
  const formatDate = (dateString: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("pt-BR");
  };

  const getTypeColor = (type: string) => {
    switch (type?.toUpperCase()) {
      case "AVALIACAO":
        return `${REPORT_TAG_BASE} border-transparent border-l-4 border-l-blue-500 bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/55 dark:text-blue-200 dark:hover:bg-blue-900/70`;
      case "SIMULADO":
        return `${REPORT_TAG_BASE} border-transparent border-l-4 border-l-emerald-500 bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/55 dark:text-green-200 dark:hover:bg-green-900/70`;
      default:
        return `${REPORT_TAG_BASE} border-transparent border-l-4 border-l-border bg-muted text-foreground hover:bg-muted/80 dark:bg-muted/60 dark:hover:bg-muted/80`;
    }
  };

  const getModelColor = (model: string) => {
    switch (model?.toUpperCase()) {
      case "SAEB":
        return `${REPORT_TAG_BASE} border-transparent border-l-4 border-l-violet-500 bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-900/55 dark:text-purple-200 dark:hover:bg-purple-900/70`;
      case "PROVA":
        return `${REPORT_TAG_BASE} border-transparent border-l-4 border-l-orange-500 bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900/55 dark:text-orange-200 dark:hover:bg-orange-900/70`;
      case "AVALIE":
        return `${REPORT_TAG_BASE} border-transparent border-l-4 border-l-cyan-500 bg-cyan-100 text-cyan-800 hover:bg-cyan-200 dark:bg-cyan-900/55 dark:text-cyan-200 dark:hover:bg-cyan-900/70`;
      default:
        return `${REPORT_TAG_BASE} border-transparent border-l-4 border-l-border bg-muted text-foreground hover:bg-muted/80 dark:bg-muted/60 dark:hover:bg-muted/80`;
    }
  };

  // Filtro de busca local (aplicado após dados já paginados)
  const filteredEvaluations = (evaluations || [])
    .filter(evaluation => evaluation && typeof evaluation === 'object' && evaluation.id)
    .filter(
      (evaluation) =>
        evaluation?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        evaluation?.subject?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        evaluation?.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        evaluation?.id?.includes(searchTerm)
    );

  // ✅ CORREÇÃO: Aplicar paginação local quando showMyEvaluations é true e há filtro no frontend
  // Isso garante que todas as avaliações filtradas sejam paginadas corretamente
  const needsLocalPagination = showMyEvaluations && !searchTerm;
  const currentItems = needsLocalPagination
    ? evaluations.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    : searchTerm
    ? filteredEvaluations
    : evaluations;
  
  const totalPages = pagination?.pages || 1;
  const hasNextPage = pagination?.has_next || false;
  const hasPrevPage = pagination?.has_prev || false;

  return (
    <div className="space-y-6">
      {/* Header com busca e filtros */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar avaliações..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={filters.subject} onValueChange={(value) => onFilterChange('subject', value)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Disciplina" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {(subjects || []).map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.type} onValueChange={(value) => onFilterChange('type', value)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="AVALIACAO">Avaliação</SelectItem>
              <SelectItem value="SIMULADO">Simulado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.model} onValueChange={(value) => onFilterChange('model', value)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Modelo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="SAEB">SAEB</SelectItem>
              <SelectItem value="PROVA">Prova</SelectItem>
              <SelectItem value="AVALIE">Avalie</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.grade} onValueChange={(value) => onFilterChange('grade', value)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Série" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {(grades || []).map((grade) => (
                <SelectItem key={grade.id} value={grade.id}>
                  {grade.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearFilters}
            >
              Limpar Filtros
            </Button>
          )}

          {/* Sempre renderizar cards (sem toggle de tabela) */}
        </div>
      </div>

      {/* Ações em lote */}
      {variant === "default" && selectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
          <span className="text-sm text-blue-800 dark:text-blue-400">
            {selectedIds.length}{' '}
            {selectedIds.length === 1
              ? 'avaliação selecionada'
              : 'avaliações selecionadas'}
          </span>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete('bulk')}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir ({selectedIds.length})
            </Button>
          </div>
        </div>
      )}

      {/* Lista: cards ou tabela */}
      <Card>
        <CardContent className={cn(layout === "cards" ? "p-4 sm:p-6" : "p-0")}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-0">
            <span className="text-sm font-medium text-foreground">
              {layout === "cards" ? "Avaliações" : "Lista de avaliações disponíveis"}
            </span>
            {!isLoading && (() => {
              const total = searchTerm
                ? filteredEvaluations.length
                : showMyEvaluations
                  ? evaluations.length
                  : pagination?.total || 0;
              return (
                <span className="text-sm text-muted-foreground">
                  {new Intl.NumberFormat("pt-BR").format(total)}{" "}
                  {total === 1 ? "avaliação encontrada" : "avaliações encontradas"}
                </span>
              );
            })()}
          </div>

          {layout === "cards" ? (
            <EvaluationsCardGrid
              evaluations={(currentItems || []) as Evaluation[]}
              isLoading={isLoading}
              selectedIds={selectedIds}
              onSelectOne={onSelectOne}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
              onStartEvaluation={onStartEvaluation}
              onNavigateToPhysical={onNavigateToPhysical}
              variant={variant}
              getTypeColor={getTypeColor}
              getModelColor={getModelColor}
              formatDate={formatDate}
              SubjectsList={SubjectsList}
            />
          ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {variant !== "transformTab" && variant !== "correctionTab" && (
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={
                        (currentItems || []).length > 0 &&
                        selectedIds.length === (currentItems || []).length
                      }
                      onCheckedChange={onSelectAll}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  )}
                  <TableHead className="min-w-[200px]">Título</TableHead>
                  <TableHead className="table-cell min-w-[120px]">Disciplina(s)</TableHead>
                  <TableHead className="hidden md:table-cell">Tipo/Modelo</TableHead>
                  <TableHead className="hidden md:table-cell">Questões</TableHead>
                  <TableHead className="hidden lg:table-cell">Série</TableHead>
                  <TableHead className="hidden lg:table-cell">Criador</TableHead>
                  <TableHead className="hidden lg:table-cell">Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {variant !== "transformTab" && variant !== "correctionTab" && (
                      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      )}
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell className="table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Skeleton className="h-8 w-8" />
                          <Skeleton className="h-8 w-8" />
                          <Skeleton className="h-8 w-8" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (currentItems || []).length > 0 ? (
                  (currentItems || [])
                    .filter(evaluation => evaluation && evaluation.id)
                    .map((evaluation) => (
                      <TableRow key={evaluation.id} data-state={selectedIds.includes(evaluation.id) && "selected"}>
                        {variant !== "transformTab" && variant !== "correctionTab" && (
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(evaluation.id)}
                            onCheckedChange={(checked) => onSelectOne(evaluation.id, !!checked)}
                            aria-label={`Selecionar ${evaluation.title}`}
                          />
                        </TableCell>
                        )}
                        <TableCell className="font-medium">
                          <div>
                            <div className="line-clamp-1">{evaluation.title}</div>
                            {evaluation.description && (
                              <div className="text-xs text-muted-foreground line-clamp-1 mt-1">
                                {evaluation.description}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="table-cell">
                          <SubjectsList evaluation={evaluation} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-col gap-1">
                            {evaluation.type && (
                              <Badge
                                variant="outline"
                                className={cn("text-xs w-fit", getTypeColor(evaluation.type))}
                              >
                                {evaluation.type}
                              </Badge>
                            )}
                            {evaluation.model && (
                              <Badge
                                variant="outline"
                                className={cn("text-xs w-fit", getModelColor(evaluation.model))}
                              >
                                {evaluation.model}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge
                            variant="outline"
                            className="text-xs tabular-nums border-border bg-muted/20 dark:bg-muted/40"
                          >
                            {formatEvaluationQuestionCount(evaluation)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {evaluation.grade && (
                            <Badge
                              variant="outline"
                              className="text-xs border-border bg-muted/20 dark:bg-muted/40"
                            >
                              {evaluation.grade.name}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {evaluation.createdBy?.name || 'N/A'}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {formatDate(evaluation.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {variant === "transformTab" && (
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 gap-1 bg-blue-600 px-2 text-xs text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                                onClick={() => onNavigateToPhysical(evaluation.id)}
                              >
                                <FileText className="h-3.5 w-3.5 shrink-0" />
                                <span className="hidden min-[480px]:inline">Transformar</span>
                              </Button>
                            )}

                            {variant === "correctionTab" && (
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 gap-1 bg-purple-600 px-2 text-xs text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
                                onClick={() => onNavigateToPhysical(evaluation.id)}
                              >
                                <FileText className="h-3.5 w-3.5 shrink-0" />
                                <span className="hidden min-[480px]:inline">Correção</span>
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 shrink-0 p-0"
                              onClick={() => onView(evaluation.id)}
                              aria-label={`Ver avaliação: ${evaluation.title ?? evaluation.id}`}
                              title="Ver"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  aria-label={`Mais ações: ${evaluation.title ?? evaluation.id}`}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {variant !== "transformTab" && variant !== "correctionTab" && (
                                  <DropdownMenuItem
                                    onClick={() => onStartEvaluation(evaluation)}
                                    className="cursor-pointer text-green-600 focus:text-green-700 dark:text-green-400 dark:focus:text-green-300"
                                  >
                                    <Play className="h-4 w-4 mr-2" />
                                    Aplicar
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => onEdit(evaluation.id)}
                                  className="cursor-pointer"
                                >
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => onDelete(evaluation.id)}
                                  className="cursor-pointer text-red-600 focus:text-red-700 dark:text-red-400 dark:focus:text-red-300"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={variant === "transformTab" || variant === "correctionTab" ? 8 : 9} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-muted-foreground">
                          {searchTerm || hasActiveFilters
                            ? "Nenhuma avaliação encontrada com os filtros aplicados"
                            : "Nenhuma avaliação encontrada"}
                        </p>
                        {(searchTerm || hasActiveFilters) && (
                          <Button variant="outline" size="sm" onClick={() => {
                            onSearchChange("");
                            onClearFilters();
                          }}>
                            Limpar filtros
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {!isLoading && !searchTerm && pagination && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, pagination.total)} de {pagination.total} avaliações
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={!hasPrevPage}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const page = i + 1;
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange(page)}
                >
                  {page}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={!hasNextPage}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export function ReadyEvaluations({
  onUseEvaluation,
  showMyEvaluations = false,
  variant = "default",
  onNavigateToPhysicalOverride,
}: ReadyEvaluationsProps) {
  const layout: "cards" = "cards";

  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [evaluationToDelete, setEvaluationToDelete] = useState<string | null>(null);
  const [viewEvaluationDialogOpen, setViewEvaluationDialogOpen] = useState(false);
  const [viewEvaluationId, setViewEvaluationId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    subject: 'all',
    type: 'all',
    model: 'all',
    grade: 'all'
  });
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [selectedEvaluationToStart, setSelectedEvaluationToStart] = useState<Evaluation | null>(null);
  const [forceUpdate, setForceUpdate] = useState(0); // Forçar re-render após exclusão
  const [isExporting, setIsExporting] = useState(false);
  const itemsPerPage = 10;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  // ✅ NOVO: Hook para gerenciar atualizações de avaliações
  const { updateAfterCRUD, isUpdating } = useEvaluationsManager();

  // ✅ NOVO: Hooks para dados de filtros (cache longo) - DEVE SER CHAMADO ANTES DE useEvaluations
  // para manter a ordem dos hooks consistente
  const {
    data: subjects = [],
    isLoading: isLoadingSubjects
  } = useCache<Subject[]>('/subjects', {
    staleTime: 30 * 60 * 1000 // 30 minutos
  });

  const {
    data: grades = [],
    isLoading: isLoadingGrades
  } = useCache<Grade[]>('/grades/', {
    staleTime: 30 * 60 * 1000 // 30 minutos
  });

  // ✅ CORREÇÃO: Preparar parâmetros de forma estável antes de chamar useEvaluations
  // Página de avaliações: apenas AVALIACAO e SIMULADO (não buscar competições nem olimpíadas)
  const evaluationParams = useMemo(() => ({
    // Quando showMyEvaluations é true, buscar todas as avaliações (sem paginação no backend)
    ...(showMyEvaluations && user?.id 
      ? { 
          page: 1, 
          per_page: 1000, // Buscar muitas avaliações para filtrar no frontend
          created_by: user.id 
        }
      : { 
          page: currentPage, 
          per_page: itemsPerPage 
        }
    ),
    // Restringir a apenas avaliações (backend pode usar types ou type)
    ...(filters.type === 'all'
      ? { types: 'AVALIACAO,SIMULADO' }
      : filters.type !== 'all' && { type: filters.type }
    ),
    ...(filters.subject !== 'all' && { subject_id: filters.subject }),
    ...(filters.model !== 'all' && { model: filters.model }),
    ...(filters.grade !== 'all' && { grade_id: filters.grade })
  }), [showMyEvaluations, user?.id, currentPage, itemsPerPage, filters.subject, filters.type, filters.model, filters.grade]);

  // ✅ Hook para todas as avaliações (mesma rota para todos)
  // ✅ CORREÇÃO: Quando showMyEvaluations é true, buscar todas as avaliações sem paginação
  // para aplicar paginação local no frontend após filtrar
  const {
    data: evaluationsData,
    isLoading,
    error: evaluationsError,
    refetch,
    invalidateCache,
    invalidateEvaluationsCache,
    forceRefresh,
    invalidateAfterCRUD
  } = useEvaluations(evaluationParams);

  // ✅ Preparar dados das avaliações com verificações de segurança
  const rawEvaluations = Array.isArray(evaluationsData?.data) ? evaluationsData.data : [];
  
  // ✅ Filtrar: apenas avaliações (AVALIACAO/SIMULADO); excluir competições e olimpíadas; ativas
  const allEvaluations = rawEvaluations
    .filter((evaluation: Record<string, unknown>) => {
      if (!evaluation || typeof evaluation !== 'object' || !evaluation.id) return false;

      const rawType = (evaluation.type ?? evaluation.tipo ?? '').toString().trim().toUpperCase();
      // Excluir olimpíadas e competições (não contabilizar nem mostrar)
      if (rawType === 'OLIMPIADA' || rawType === 'OLIMPIADAS' || rawType.includes('OLIMPI')) return false;
      if (rawType === 'COMPETICAO' || rawType === 'COMPETIÇÃO' || rawType.includes('COMPET')) return false;
      // Incluir apenas avaliação e simulado
      if (rawType !== '' && rawType !== 'AVALIACAO' && rawType !== 'SIMULADO') return false;

      const deletedAt = evaluation.deleted_at;
      const archived = evaluation.archived;
      const isActive = evaluation.is_active;
      return !deletedAt && !archived && isActive !== false;
    })
    .map(evaluation => evaluation as unknown as Evaluation);
  
  // ✅ CORREÇÃO: Aplicar filtro no frontend sempre que showMyEvaluations é true
  // como fallback caso o backend não aplique corretamente
  const filteredEvaluations = showMyEvaluations && user?.id
    ? allEvaluations.filter(evaluation => {
        // Verificar tanto createdBy quanto created_by para compatibilidade
        const createdByObj = evaluation.createdBy;
        const createdById = createdByObj?.id;
        
        // Verificar created_by como objeto ou string
        const createdByFallback = (evaluation as unknown as { created_by?: { id?: string } | string }).created_by;
        const createdByFallbackId = typeof createdByFallback === 'object' && createdByFallback !== null
          ? createdByFallback.id
          : typeof createdByFallback === 'string'
          ? createdByFallback
          : undefined;
        
        return (createdById || createdByFallbackId) === user.id;
      })
    : allEvaluations;
  
  // ✅ CORREÇÃO: Ajustar paginação sempre que showMyEvaluations é true e há filtro aplicado no frontend
  const backendPagination = evaluationsData?.pagination;
  const adjustedPagination = showMyEvaluations && user?.id && backendPagination
    ? {
        ...backendPagination,
        total: filteredEvaluations.length,
        pages: Math.ceil(filteredEvaluations.length / itemsPerPage),
        has_next: currentPage < Math.ceil(filteredEvaluations.length / itemsPerPage),
        has_prev: currentPage > 1
      }
    : backendPagination;
  
  const pagination = adjustedPagination;

  // ✅ CORREÇÃO: Usar avaliações filtradas + regra de elegibilidade para aba de correção física
  const evaluations = useMemo(() => {
    if (variant === "transformTab") {
      return filteredEvaluations.filter(isEligibleForPhysicalTransform);
    }
    if (variant === "correctionTab") {
      return filteredEvaluations.filter(isEligibleForPhysicalCorrection);
    }
    return filteredEvaluations;
  }, [filteredEvaluations, variant]);

  // ✅ MELHORADO: Função robusta para atualizar dados
  const refreshData = useCallback(async () => {
    try {
      await forceRefresh();
      setForceUpdate(prev => prev + 1);
    } catch (error) {
      // Silenciar erro
    }
  }, [forceRefresh]);

  // ✅ MELHORADO: Função específica para atualizar após operações CRUD
  const refreshAfterCRUD = useCallback(async () => {
    try {
      await updateAfterCRUD();
      await refetch();
      setForceUpdate(prev => prev + 1);
    } catch (error) {
      // Silenciar erro
    }
  }, [updateAfterCRUD, refetch]);

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // ✅ CORREÇÃO: Resetar para primeira página apenas quando filtros realmente mudarem
  // Usar useMemo para estabilizar a string de filtros usando valores individuais
  const filtersString = useMemo(() => {
    return JSON.stringify({
      subject: filters.subject,
      type: filters.type,
      model: filters.model,
      grade: filters.grade
    });
  }, [
    filters.subject,
    filters.type,
    filters.model,
    filters.grade
  ]);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [filtersString, showMyEvaluations]);

  // ✅ NOVO: Forçar atualização quando forceUpdate mudar
  useEffect(() => {
    // Este useEffect força a re-renderização da interface
    // quando uma avaliação é excluída ou aplicada
  }, [forceUpdate]);

  // ✅ NOVO: Listener para mudanças de avaliações (se implementado no futuro)
  useEffect(() => {
    // Aqui poderíamos implementar um listener para mudanças em tempo real
    // Por exemplo, usando WebSocket ou polling
  }, []);

  const handleView = (evaluationId: string) => {
    setViewEvaluationId(evaluationId);
    setViewEvaluationDialogOpen(true);
  };

  const closeViewDialog = () => {
    setViewEvaluationDialogOpen(false);
    setViewEvaluationId(null);
  };

  const handleEdit = (evaluationId: string) => {
    navigate(`/app/avaliacao/${evaluationId}/editar`);
  };

  const handleDelete = async (evaluationId: string) => {
    if (evaluationId === 'bulk') {
      // Exclusão em massa
      await handleBulkDelete();
      return;
    }

    setEvaluationToDelete(evaluationId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!evaluationToDelete) return;

    try {
      const response = await api.delete(`/test/${evaluationToDelete}`);

      toast({
        title: "Sucesso",
        description: SUCCESS_MESSAGES.DATA_DELETED,
      });

      // ✅ MELHORADO: Usar função específica para operações CRUD
      await refreshAfterCRUD();
      
    } catch (error: unknown) {
      const apiError = error as { message?: string; response?: { status?: number; data?: { error?: string } } };
      let errorMessage: string = ERROR_MESSAGES.SERVER_ERROR;

      if (apiError.response?.status === 404) {
        errorMessage = ERROR_MESSAGES.DATA_NOT_FOUND;
      } else if (apiError.response?.status === 403) {
        errorMessage = ERROR_MESSAGES.FORBIDDEN;
      } else if (apiError.response?.status === 401) {
        errorMessage = ERROR_MESSAGES.UNAUTHORIZED;
      } else if (apiError.response?.status === 500) {
        // Erro interno do servidor - pode ser problema de banco de dados
        const errorData = apiError.response?.data as { error?: string; details?: string };
        const errorDetails = errorData?.details || '';
        const errorText = errorData?.error || '';
        
        // Verificar se é erro de tabela não existente
        if (errorDetails.includes('does not exist') || 
            errorDetails.includes('relation') || 
            errorDetails.includes('competition_results') ||
            errorText.includes('competition_results')) {
          errorMessage = 'Erro no banco de dados. Entre em contato com o suporte técnico.';
        } else if (errorData?.error) {
          errorMessage = errorData.error;
        } else {
          errorMessage = 'Erro interno do servidor. Tente novamente mais tarde.';
        }
      } else if (apiError.response?.data?.error) {
        errorMessage = apiError.response.data.error;
      }

      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setEvaluationToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    try {
      const response = await api.delete("/test", { data: { ids: selectedIds } });

      toast({
        title: "Sucesso",
        description: SUCCESS_MESSAGES.DATA_DELETED,
      });

      // ✅ MELHORADO: Usar função específica para operações CRUD
      await refreshAfterCRUD();
      setSelectedIds([]);
      
    } catch (error: unknown) {
      const apiError = error as { message?: string; response?: { status?: number; data?: { error?: string } } };
      let errorMessage = "Não foi possível excluir as avaliações selecionadas";

      if (apiError.response?.status === 404) {
        errorMessage = "Uma ou mais avaliações não foram encontradas";
      } else if (apiError.response?.status === 403) {
        errorMessage = "Sem permissão para excluir estas avaliações";
      } else if (apiError.response?.status === 401) {
        errorMessage = "Sessão expirada. Faça login novamente.";
      } else if (apiError.response?.data?.error) {
        errorMessage = apiError.response.data.error;
      }

      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
    }
  };

  const handleExportToExcel = async () => {
    // Validação: verificar se há avaliações selecionadas
    if (selectedIds.length === 0) {
      toast({
        title: "Nenhuma avaliação selecionada",
        description: "Selecione pelo menos uma avaliação para exportar.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsExporting(true);

      // Preparar payload conforme especificação do backend
      const payload = {
        test_ids: selectedIds,
      };

      // Fazer requisição POST para o backend
      const response = await api.post('/test/evolution/export-excel', payload, {
        responseType: 'blob',
      });

      // Criar blob a partir da resposta
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      // Extrair nome do arquivo do header Content-Disposition ou usar padrão
      const contentDisposition = response.headers['content-disposition'];
      let fileName = `exportacao-avaliacoes-${new Date().toISOString().split('T')[0]}.xlsx`;
      
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (fileNameMatch && fileNameMatch[1]) {
          fileName = fileNameMatch[1].replace(/['"]/g, '');
        }
      }

      // Criar link temporário e fazer download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Exportação concluída!",
        description:
          selectedIds.length === 1
            ? 'Arquivo Excel gerado com sucesso para 1 avaliação.'
            : `Arquivo Excel gerado com sucesso para ${selectedIds.length} avaliações.`,
      });
    } catch (error: any) {
      // Tratar erro que pode vir como blob (alguns backends retornam erro JSON como blob)
      let errorMessage = "Não foi possível exportar as avaliações.";

      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const errorData = JSON.parse(text);
          errorMessage = errorData.message || errorMessage;
        } catch {
          // Se não conseguir parsear, usar mensagem padrão
        }
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.status === 400) {
        errorMessage = "Dados inválidos para exportação.";
      } else if (error.response?.status === 404) {
        errorMessage = "Rota de exportação não encontrada.";
      } else if (error.response?.status === 500) {
        errorMessage = "Erro interno do servidor ao gerar o arquivo.";
      }

      toast({
        title: "Erro ao exportar",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds((evaluations || []).map((item) => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id));
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({
      subject: 'all',
      type: 'all',
      model: 'all',
      grade: 'all'
    });
  };

  const handleStartEvaluation = (evaluation: Evaluation) => {
    setSelectedEvaluationToStart(evaluation);
    setStartModalOpen(true);
  };

  const handleNavigateToPhysical = (evaluationId: string) => {
    if (onNavigateToPhysicalOverride) {
      onNavigateToPhysicalOverride(evaluationId);
      return;
    }
    navigate(`/app/avaliacao/${evaluationId}/fisica`);
  };

  const handleConfirmStartEvaluation = async (startDateTime: string, endDateTime: string, classIds: string[]) => {
    if (!selectedEvaluationToStart) return;

    // Capturar timezone do usuário automaticamente
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // ✅ CORREÇÃO: Converter para ISO com timezone se ainda não estiver convertido
    // Verificar se já está em formato ISO com timezone (contém timezone offset no formato +/-HH:MM)
    // Um datetime-local tem formato "YYYY-MM-DDTHH:mm" (sem timezone)
    // Um ISO com timezone tem formato "YYYY-MM-DDTHH:mm:ss+HH:MM" ou "YYYY-MM-DDTHH:mm:ss-HH:MM"
    const isISOFormat = (dateStr: string) => {
      // Verifica se tem timezone offset (formato +/-HH:MM no final)
      const timezonePattern = /[+-]\d{2}:\d{2}$/;
      return timezonePattern.test(dateStr);
    };
    
    const startDateTimeISO = isISOFormat(startDateTime)
      ? startDateTime
      : convertDateTimeLocalToISO(startDateTime);
    const endDateTimeISO = isISOFormat(endDateTime)
      ? endDateTime
      : convertDateTimeLocalToISO(endDateTime);

    try {
      const classesData = classIds.map(classId => ({
        class_id: classId,
        application: startDateTimeISO,
        expiration: endDateTimeISO
      }));

      const response = await api.post(`/test/${selectedEvaluationToStart.id}/apply`, {
        classes: classesData,
        timezone: userTimezone
      });

      // ✅ MELHORADO: Usar função específica para operações CRUD
      await refreshAfterCRUD();

      toast({
        title: "🎉 Avaliação aplicada com sucesso!",
        description: `A avaliação "${selectedEvaluationToStart.title}" foi aplicada para ${classIds.length} turma(s) e ficará disponível no horário configurado.`,
      });

    } catch (error: unknown) {
      const apiError = error as {
        response?: {
          status?: number;
          data?: { error?: string; classes_nao_vinculadas?: string[] };
        };
      };
      let errorMessage = "Erro ao aplicar avaliação. Tente novamente.";

      if (apiError.response?.status === 404) {
        errorMessage = "Avaliação não encontrada";
      } else if (apiError.response?.status === 403) {
        // Quando o usuário é professor, o backend pode retornar quais turmas não têm vínculo
        const classesNaoVinculadas = apiError.response.data?.classes_nao_vinculadas ?? [];
        const backendMsg = apiError.response.data?.error;
        if (backendMsg && classesNaoVinculadas.length > 0) {
          errorMessage = `${backendMsg}. Turmas: ${classesNaoVinculadas.join(", ")}`;
        } else if (backendMsg) {
          errorMessage = backendMsg;
        } else {
          errorMessage = "Sem permissão para aplicar esta avaliação";
        }
      } else if (apiError.response?.status === 400) {
        errorMessage = apiError.response.data?.error || "Dados inválidos para aplicação";
      } else if (apiError.response?.data?.error) {
        errorMessage = apiError.response.data.error;
      }

      toast({
        title: "Erro ao aplicar avaliação",
        description: errorMessage,
        variant: "destructive",
      });
      throw error;
    } finally {
      setStartModalOpen(false);
      setSelectedEvaluationToStart(null);
    }
  };

  const hasActiveFilters = Object.values(filters).some(value => value !== 'all');

  // ✅ NOVO: Proteção adicional - se há erro de carregamento, mostrar componente simplificado
  if (evaluationsError && !evaluationsData) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <p className="text-muted-foreground mb-4">
            Erro ao carregar avaliações. Tente novamente.
          </p>
          <Button onClick={() => refreshData()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  // ✅ NOVO: Indicador de atualização em andamento
  const isAnyLoading = isLoading || isUpdating;

  // Renderizar a tabela de avaliações
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <div className="space-y-6">
          {/* ✅ NOVO: Indicador de atualização */}
          {isUpdating && (
            <div className="flex items-center justify-center p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <RefreshCw className="h-4 w-4 mr-2 animate-spin text-blue-600 dark:text-blue-400" />
              <span className="text-sm text-blue-700 dark:text-blue-400">
                Atualizando lista de avaliações...
              </span>
            </div>
          )}

          <EvaluationsTable
            evaluations={evaluations}
            pagination={pagination}
            isLoading={isAnyLoading}
            searchTerm={searchTerm}
            filters={filters}
            selectedIds={selectedIds}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            subjects={subjects}
            grades={grades}
            showMyEvaluations={showMyEvaluations}
            onPageChange={handlePageChange}
            onFilterChange={handleFilterChange}
            onSearchChange={setSearchTerm}
            onSelectAll={handleSelectAll}
            onSelectOne={handleSelectOne}
            onView={handleView}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onStartEvaluation={handleStartEvaluation}
            onRefresh={refreshData}
            onClearFilters={clearFilters}
            hasActiveFilters={hasActiveFilters}
            onNavigateToPhysical={handleNavigateToPhysical}
            onExport={handleExportToExcel}
            isExporting={isExporting}
            layout={layout}
            variant={variant}
          />

          {/* Dialog de confirmação de exclusão */}
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                <AlertDialogDescription>
                  {evaluationToDelete
                    ? "Tem certeza que deseja excluir esta avaliação? Esta ação não pode ser desfeita."
                    : `Tem certeza que deseja excluir ${selectedIds.length} avaliações? Esta ação não pode ser desfeita.`
                  }
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmDelete}>
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Modal de Iniciar Avaliação */}
          <StartEvaluationModal
            isOpen={startModalOpen}
            onClose={() => {
              setStartModalOpen(false);
              setSelectedEvaluationToStart(null);
            }}
            onConfirm={handleConfirmStartEvaluation}
            evaluation={selectedEvaluationToStart}
          />

          {/* Modal de Visualização da Avaliação */}
          <Dialog
            open={viewEvaluationDialogOpen}
            onOpenChange={(open) => {
              if (!open) closeViewDialog();
            }}
          >
            <DialogContent
              className="
                p-0 w-[95vw] max-w-6xl h-[90vh] max-h-[90vh] overflow-hidden flex flex-col
                sm:w-[calc(100vw-18rem)] sm:left-[18rem] sm:translate-x-0
              "
            >
              {viewEvaluationId ? (
                <div
                  className="flex-1 min-h-0 overflow-y-auto
                    [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent
                    [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full
                    dark:[&::-webkit-scrollbar-thumb]:bg-gray-700
                    hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 dark:hover:[&::-webkit-scrollbar-thumb]:bg-gray-600
                    scroll-smooth"
                >
                  <ViewEvaluation
                    evaluationId={viewEvaluationId}
                    onClose={closeViewDialog}
                  />
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </div>
      </TooltipProvider>
    </ErrorBoundary>
  );
}
