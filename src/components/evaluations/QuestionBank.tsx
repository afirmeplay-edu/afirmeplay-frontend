import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DisciplineTag } from "@/components/ui/discipline-tag";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Book, Search, Plus, Eye, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import QuestionPreview from "./questions/QuestionPreview";
import { Question } from "./types";
import { mapApiQuestionTypeToForm } from "@/utils/questionTypeMapping";
import type { Interaction } from "@/lib/question-interactions";

interface ApiQuestionOption {
  id?: string;
  text: string;
  isCorrect?: boolean;
}

interface ApiQuestion {
  id: string;
  title?: string;
  text: string;
  formatted_text?: string;
  subject_id: string;
  subject?: { id: string; name: string };
  grade?: { id: string; name: string };
  grade_id?: string;
  difficulty_level?: string;
  difficulty?: string; // Campo alternativo da API
  /** Campo real retornado por /questions (ex.: "multiple_choice", "ligar_colunas", ...). */
  type?: string;
  /** Campo legado/alternativo, mantido por segurança — não é o nome usado por /questions. */
  question_type?: string;
  value?: number;
  correct_answer?: string;
  formatted_solution?: string;
  alternatives?: ApiQuestionOption[];
  skill?: string | string[];
  created_by?: string;
  secondStatement?: string;
  second_statement?: string;
  /** Configuração da interação, para as questões subjetivas (ligar colunas, arrastar e soltar, etc.). */
  interaction_config?: Interaction | null;
  interactionConfig?: Interaction | null;
}

interface Subject {
  id: string;
  name: string;
}

interface Grade {
  id: string;
  name: string;
}

interface Filters {
  subject: string;
  grade: string;
  difficulty: string;
  type: string;
}

interface QuestionBankProps {
  open?: boolean;
  onClose?: () => void;
  subjectId: string | null;
  onQuestionSelected: (question: Question) => void;
  onCreateEvaluation?: (evaluation: {
    title: string;
    subject: string;
    grade: string;
    questions: Question[];
  }) => void;
  gradeId?: string;
  gradeName?: string;
  subjects?: Subject[];
  selectedSubjectId?: string;
  /** Quando true, renderiza só o conteúdo (sem Dialog), para ser usado dentro de outro modal. */
  embedded?: boolean;
}

const DIFFICULTIES = ["Abaixo do Básico", "Básico", "Adequado", "Avançado"];
const QUESTION_TYPES = [
  { key: "multipleChoice", label: "Múltipla Escolha" },
  { key: "essay", label: "Dissertativa" },
  { key: "trueFalse", label: "Verdadeiro/Falso" }
];

/**
 * Função utilitária para mapear períodos EJA para anos equivalentes
 * 1º Período EJA = 1º Ano, 2º Período EJA = 2º Ano, etc.
 */
function getGradeIdsForEJA(
  currentGradeId: string,
  currentGradeName: string,
  allGrades: Array<{ id: string; name: string }>
): string[] {
  if (!currentGradeName || !allGrades || allGrades.length === 0) {
    return [currentGradeId];
  }

  const normalizedGradeName = currentGradeName.trim().toLowerCase();
  
  // Verificar se é EJA
  const isEJA = normalizedGradeName.includes('período') || 
                normalizedGradeName.includes('periodo') ||
                normalizedGradeName.includes('eja') ||
                allGrades.some(g => {
                  const gradeLower = g.name.toLowerCase();
                  return gradeLower.includes('eja') && g.id === currentGradeId;
                });

  if (!isEJA) {
    return [currentGradeId];
  }

  // Extrair número do período (ex: "1º Período" -> 1)
  const periodoMatch = normalizedGradeName.match(/(\d+)[º°o]?\s*per[ií]odo/i);
  if (!periodoMatch) {
    return [currentGradeId];
  }

  const periodoNum = parseInt(periodoMatch[1], 10);
  
  // Tentar múltiplas variações do nome do ano
  const possibleYearNames = [
    `${periodoNum}º Ano`,
    `${periodoNum}° Ano`,
    `${periodoNum}o Ano`,
    `${periodoNum} Ano`,
    `Ano ${periodoNum}`
  ];
  
  // Buscar o ano equivalente nas séries disponíveis
  // IMPORTANTE: Apenas séries dos Anos Iniciais (1º ao 5º ano)
  // Excluir: Ensino Médio, Anos Finais (6º ao 9º), e EJA
  const targetGrade = allGrades.find(g => {
    const gradeName = g.name.trim().toLowerCase();
    
    // Excluir Ensino Médio
    if (gradeName.includes('em') || gradeName.includes('médio') || gradeName.includes('medio')) {
      return false;
    }
    
    // Excluir Anos Finais (6º ao 9º ano)
    if (gradeName.includes('6º') || gradeName.includes('6°') || gradeName.includes('6o') ||
        gradeName.includes('7º') || gradeName.includes('7°') || gradeName.includes('7o') ||
        gradeName.includes('8º') || gradeName.includes('8°') || gradeName.includes('8o') ||
        gradeName.includes('9º') || gradeName.includes('9°') || gradeName.includes('9o')) {
      return false;
    }
    
    // Excluir EJA
    if (gradeName.includes('eja') || gradeName.includes('período') || gradeName.includes('periodo')) {
      return false;
    }
    
    // Garantir que seja apenas Anos Iniciais (1º ao 5º ano)
    // Verificar se o número do período está entre 1 e 5
    if (periodoNum < 1 || periodoNum > 5) {
      return false;
    }
    
    // Verificar se corresponde ao ano dos Anos Iniciais
    return possibleYearNames.some(name => 
      gradeName === name.toLowerCase() ||
      gradeName.includes(`${periodoNum}º ano`) ||
      gradeName.includes(`${periodoNum}° ano`) ||
      gradeName.includes(`${periodoNum}o ano`) ||
      gradeName.includes(`${periodoNum} ano`)
    );
  });
  
  // Retornar o ID do ano equivalente ou o gradeId atual como fallback
  if (targetGrade) {
    return [targetGrade.id];
  }
  
  return [currentGradeId];
}

/**
 * Verifica se uma questão deve ser incluída baseado no mapeamento EJA
 */
function shouldIncludeQuestionForEJA(
  question: Question,
  evaluationGradeId: string | undefined,
  evaluationGradeName: string | undefined,
  allGrades: Array<{ id: string; name: string }>
): boolean {
  if (!evaluationGradeId || !evaluationGradeName || !question.grade) {
    return true; // Se não temos informações suficientes, incluir a questão
  }

  // Obter gradeIds equivalentes para EJA
  const equivalentGradeIds = getGradeIdsForEJA(
    evaluationGradeId,
    evaluationGradeName,
    allGrades
  );

  // Se a questão pertence a um dos anos equivalentes, incluir
  return equivalentGradeIds.includes(question.grade.id);
}

export function QuestionBank({
  open = true,
  onClose = () => {},
  subjectId,
  onQuestionSelected,
  gradeId,
  gradeName,
  subjects: propsSubjects,
  selectedSubjectId,
  embedded = false,
}: QuestionBankProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewQuestion, setViewQuestion] = useState<Question | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const { toast } = useToast();
  
  const [filters, setFilters] = useState<Filters>({
    subject: subjectId || "all",
    grade: "all",
    difficulty: "all",
    type: "all",
  });

  const [erro, setErro] = useState<string | null>(null);

  // [QuestionBank] Log para debug: props ao abrir
  useEffect(() => {
    if (open) {
      const selectedFromList = propsSubjects?.find((s) => String(s.id) === String(subjectId));
      console.log("[QuestionBank] props ao abrir:", {
        open,
        subjectId,
        selectedSubjectId,
        filtersSubject: filters.subject,
        selectedSubjectName: selectedFromList?.name,
        subjectsFromModal: propsSubjects?.map((s) => ({ id: s.id, name: s.name })),
      });
    }
  }, [open, subjectId, selectedSubjectId, propsSubjects]);

  // Atualizar filtro quando subjectId mudar
  useEffect(() => {
    if (subjectId) {
      setFilters(prev => ({ ...prev, subject: subjectId }));
    }
  }, [subjectId]);

  const isActive = open || embedded;

  useEffect(() => {
    if (isActive) {
      fetchQuestions();
      fetchSubjects();
      fetchGrades();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  useEffect(() => {
    if (isActive) {
      fetchQuestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, subjectId, isActive]);

  const fetchQuestions = async () => {
    try {
      setIsLoading(true);
      setErro(null);
      
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error("Token de autenticação não encontrado");
      }
      
      const response = await api.get("/questions/");
      
      let questionsData: ApiQuestion[] = [];
      
      if (Array.isArray(response.data)) {
        questionsData = response.data;
      } else if (response.data && Array.isArray(response.data.questions)) {
        questionsData = response.data.questions;
      } else if (response.data && Array.isArray(response.data.data)) {
        questionsData = response.data.data;
      } else {
        questionsData = [];
      }

      const convertedQuestions: Question[] = questionsData.map((apiQuestion) => {
        // ✅ CORRIGIDO: preserva os tipos de interação subjetiva (ligar_colunas, arrastar_soltar, etc.)
        // em vez de rotulá-los como "multipleChoice" — isso fazia a validação de alternativas
        // marcar essas questões como inválidas ao criar/editar uma avaliação.
        const getQuestionType = (type: string | undefined): Question["type"] => {
          if (type === "trueFalse" || type === "true_false") return "trueFalse";
          return mapApiQuestionTypeToForm(type);
        };

        // Mapear dificuldades corretamente
        const mapDifficulty = (difficulty: string | undefined): string => {
          if (!difficulty) return "Básico";
          
          // Normalizar dificuldades
          const normalized = difficulty.trim();
          switch (normalized.toLowerCase()) {
            case 'avançado':
            case 'avancado':
            case 'advanced':
              return 'Avançado';
            case 'adequado':
            case 'adequada':
            case 'adequate':
              return 'Adequado';
            case 'básico':
            case 'basico':
            case 'basic':
              return 'Básico';
            case 'abaixo do básico':
            case 'abaixo do basico':
            case 'below basic':
              return 'Abaixo do Básico';
            default:
              return normalized; // Manter o valor original se não for reconhecido
          }
        };

        const question: Question = {
          id: apiQuestion.id,
          text: apiQuestion.text || apiQuestion.formatted_text || "",
          title: apiQuestion.title || "",
          type: getQuestionType(apiQuestion.type ?? apiQuestion.question_type),
          difficulty: mapDifficulty(apiQuestion.difficulty_level || apiQuestion.difficulty),
          subjectId: apiQuestion.subject_id || apiQuestion.subject?.id || "",
          subject: apiQuestion.subject ? {
            id: apiQuestion.subject.id,
            name: apiQuestion.subject.name
          } : undefined,
          grade: apiQuestion.grade ? {
            id: apiQuestion.grade.id,
            name: apiQuestion.grade.name
          } : undefined,
          value: apiQuestion.value || 1,
          options: apiQuestion.alternatives?.map(alt => ({
            id: alt.id || "",
            text: alt.text,
            isCorrect: alt.isCorrect || false
          })) || [],
          interactionConfig: apiQuestion.interaction_config || apiQuestion.interactionConfig || undefined,
          created_by: apiQuestion.created_by || "",
          skills: Array.isArray(apiQuestion.skill) && apiQuestion.skill.length > 0 
            ? apiQuestion.skill[0] 
            : (apiQuestion.skill && typeof apiQuestion.skill === 'string' ? apiQuestion.skill : undefined),
          solution: apiQuestion.formatted_solution || apiQuestion.correct_answer || "",
          formattedText: apiQuestion.formatted_text || "",
          formattedSolution: apiQuestion.formatted_solution || "",
          secondStatement: apiQuestion.second_statement || "",
        };
        return question;
      });

      // [QuestionBank] Log para debug: resposta da API e disciplina filtrada
      const sample = convertedQuestions.slice(0, 3).map((q) => ({
        id: q.id,
        subjectId: q.subjectId,
        "subject?.id": q.subject?.id,
        "subject?.name": q.subject?.name,
      }));
      console.log("[QuestionBank] fetchQuestions:", {
        rawLength: questionsData.length,
        convertedLength: convertedQuestions.length,
        subjectIdProp: subjectId,
        filtersSubject: filters.subject,
        sampleQuestions: sample,
      });

      setQuestions(convertedQuestions);
      
    } catch (error) {
      let errorMessage = "Erro ao carregar questões do banco.";
      
      if (error instanceof Error) {
        if (error.message.includes("Token")) {
          errorMessage = "Sessão expirada. Faça login novamente.";
        } else if (error.message.includes("Network")) {
          errorMessage = "Erro de conexão. Verifique sua internet.";
        }
      }
      
      setErro(errorMessage);
      setQuestions([]);
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSubjects = async () => {
    try {
      const response = await api.get("/subjects");
      
      if (Array.isArray(response.data)) {
        setSubjects(response.data);
      } else if (response.data && Array.isArray(response.data.data)) {
        setSubjects(response.data.data);
      } else {
        setSubjects([]);
      }
    } catch (error) {
      setSubjects([]);
    }
  };

  const fetchGrades = async () => {
    try {
      const response = await api.get("/grades/");
      
      if (Array.isArray(response.data)) {
        setGrades(response.data);
      } else if (response.data && Array.isArray(response.data.data)) {
        setGrades(response.data.data);
      } else {
        setGrades([]);
      }
    } catch (error) {
      setGrades([]);
    }
  };

  // Filtrar questões (subjectMatch: compara por subject.id e subjectId, com String() para evitar tipo diferente)
  const filteredQuestions = useMemo(() => {
    const subjectMatch = (q: Question, id: string) =>
      !id || id === "all" ||
      (q.subject && String(q.subject.id) === String(id)) ||
      String(q.subjectId) === String(id);

    const filtered = (questions || []).filter((question) => {
      const matchesSearch = (question.text || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (question.title || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSubjectId = subjectMatch(question, subjectId);
      const matchesSubject = subjectMatch(question, filters.subject);
      const matchesGrade = !filters.grade || filters.grade === "all" || (question.grade && question.grade.id === filters.grade);
      const matchesDifficulty = !filters.difficulty || filters.difficulty === "all" || question.difficulty === filters.difficulty;
      const matchesType = !filters.type || filters.type === "all" || question.type === filters.type;

      // ✅ CORREÇÃO: Remover filtro automático por gradeId para permitir que o usuário
      // visualize questões de todas as séries usando o filtro dropdown
      // O filtro de série agora é controlado apenas pelo dropdown (matchesGrade)
      
      return matchesSearch && matchesSubjectId && matchesSubject && matchesGrade && matchesDifficulty && matchesType;
    });

    // [QuestionBank] Log para debug: filtro por disciplina
    const sampleForLog = (questions || []).slice(0, 5).map((q) => ({
      id: q.id?.slice(0, 8),
      "subject?.id": q.subject?.id,
      subjectId: q.subjectId,
      "subject?.name": q.subject?.name,
      matchById: subjectMatch(q, subjectId),
      matchByFilter: subjectMatch(q, filters.subject),
    }));
    console.log("[QuestionBank] filter:", {
      subjectId,
      filtersSubject: filters.subject,
      totalQuestions: (questions || []).length,
      filteredCount: filtered.length,
      sampleCheck: sampleForLog,
    });

    return filtered;
  }, [questions, searchTerm, subjectId, filters, gradeId, gradeName, grades]);

  // Paginação
  const totalPages = Math.ceil(filteredQuestions.length / pageSize);
  const paginatedQuestions = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredQuestions.slice(startIndex, startIndex + pageSize);
  }, [filteredQuestions, currentPage, pageSize]);

  const toggleQuestionSelection = (questionId: string) => {
    setSelectedQuestions((prev) =>
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedQuestions(paginatedQuestions.map(q => q.id));
    } else {
      setSelectedQuestions([]);
    }
  };

  const handleSelectQuestions = () => {
    const selectedQuestionObjects = (questions || []).filter(q => selectedQuestions.includes(q.id));
    selectedQuestionObjects.forEach(q => onQuestionSelected(q));
    setSelectedQuestions([]);
    toast({
      title: "Questões adicionadas",
      description: `${selectedQuestionObjects.length} questões foram adicionadas à avaliação.`,
    });
  };

  const handleQuickAdd = (question: Question) => {
    onQuestionSelected(question);
    toast({
      title: "Questão adicionada",
      description: "A questão foi adicionada à avaliação.",
    });
  };

  const resetFilters = () => {
    setFilters({
      subject: subjectId || "all",
      grade: "all",
      difficulty: "all",
      type: "all",
    });
    setSearchTerm("");
    setCurrentPage(1);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Avançado': return 'bg-green-800 dark:bg-green-900 text-green-100 dark:text-green-200';
      case 'Adequado': return 'bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-400';
      case 'Básico': return 'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-400';
      case 'Abaixo do Básico': return 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-400';
      default: return 'bg-muted text-foreground';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'multipleChoice': return 'Múltipla Escolha';
      case 'dissertativa': return 'Dissertativa';
      case 'trueFalse': return 'Verdadeiro/Falso';
      default: return type;
    }
  };

  if (!Array.isArray(questions) || !Array.isArray(grades) || !Array.isArray(subjects)) {
    return <div className="text-red-600 p-4">Erro: Dados inválidos.</div>;
  }

  const innerContent = (
    <>
          <DialogHeader className={embedded ? "pb-2" : undefined}>
            <DialogTitle className="flex items-center gap-2">
              <Book className="h-5 w-5" />
              Banco de Questões
            </DialogTitle>
            <DialogDescription>
              Pesquise e selecione questões para adicionar. Use os filtros para refinar a lista.
            </DialogDescription>
          </DialogHeader>

          {/* Filtros e Pesquisa */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="search" className="text-sm font-medium">Pesquisar</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Buscar por título ou conteúdo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2">
                <div>
                  <Label htmlFor="subject-filter" className="text-sm font-medium">Disciplina</Label>
                  <Select
                    value={filters.subject}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, subject: value }))}
                  >
                    <SelectTrigger id="subject-filter" className="w-full sm:w-40">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as disciplinas</SelectItem>
                      {subjects.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="grade-filter" className="text-sm font-medium">Série</Label>
                  <Select
                    value={filters.grade}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, grade: value }))}
                  >
                    <SelectTrigger id="grade-filter" className="w-full sm:w-32">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as séries</SelectItem>
                      {grades.map((grade) => (
                        <SelectItem key={grade.id} value={grade.id}>
                          {grade.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="difficulty-filter" className="text-sm font-medium">Dificuldade</Label>
                  <Select
                    value={filters.difficulty}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, difficulty: value }))}
                  >
                    <SelectTrigger id="difficulty-filter" className="w-full sm:w-40">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as dificuldades</SelectItem>
                      {DIFFICULTIES.map((difficulty) => (
                        <SelectItem key={difficulty} value={difficulty}>
                          {difficulty}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="type-filter" className="text-sm font-medium">Tipo</Label>
                  <Select
                    value={filters.type}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, type: value }))}
                  >
                    <SelectTrigger id="type-filter" className="w-full sm:w-40">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      {QUESTION_TYPES.map((type) => (
                        <SelectItem key={type.key} value={type.key}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="text-xs"
              >
                Limpar Filtros
              </Button>
              
              {selectedQuestions.length > 0 && (
                <Button
                  onClick={handleSelectQuestions}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  Adicionar {selectedQuestions.length} questões
                </Button>
              )}
            </div>
          </div>

          {/* Lista de Questões */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-4 w-4 mt-1" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/2" />
                        <div className="flex gap-2">
                          <Skeleton className="h-5 w-16 rounded-full" />
                          <Skeleton className="h-5 w-12 rounded-full" />
                          <Skeleton className="h-5 w-20 rounded-full" />
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Skeleton className="h-8 w-8 rounded" />
                        <Skeleton className="h-8 w-8 rounded" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {paginatedQuestions.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2 p-3 bg-muted dark:bg-muted/50 rounded-lg border border-border">
                      <Checkbox
                        checked={selectedQuestions.length === paginatedQuestions.length && paginatedQuestions.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                      <Label className="text-sm font-medium">
                        Selecionar todas desta página ({paginatedQuestions.length})
                      </Label>
                    </div>

                    {paginatedQuestions.map((question, index) => (
                      <Card key={question.id} className={cn(
                        "transition-all duration-200 hover:shadow-md dark:hover:shadow-lg",
                        selectedQuestions.includes(question.id) && "ring-2 ring-blue-500 dark:ring-blue-400 bg-blue-50 dark:bg-blue-950/30"
                      )}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex items-center mt-1">
                              <Checkbox
                                checked={selectedQuestions.includes(question.id)}
                                onCheckedChange={(checked) => toggleQuestionSelection(question.id)}
                              />
                              <span className="ml-2 text-xs text-muted-foreground font-mono">
                                #{index + 1 + (currentPage - 1) * pageSize}
                              </span>
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm md:text-base mb-2 line-clamp-2">
                                {question.title || question.text}
                              </h4>
                              
                              <div className="flex flex-wrap gap-1 md:gap-2">
                                {question.subject && (
                                  <DisciplineTag
                                    subjectId={question.subject.id}
                                    name={question.subject.name}
                                    className="text-xs"
                                  />
                                )}
                                {question.grade && (
                                  <Badge variant="outline" className="text-xs">
                                    {question.grade.name}
                                  </Badge>
                                )}
                                <Badge className={cn("text-xs", getDifficultyColor(question.difficulty))}>
                                  {question.difficulty}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {getTypeLabel(question.type)}
                                </Badge>
                                <Badge variant="outline" className="text-xs font-semibold">
                                  {question.value} pt(s)
                                </Badge>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleQuickAdd(question)}
                                className="transition-colors hover:bg-green-50 dark:hover:bg-green-950/30 hover:text-green-700 dark:hover:text-green-400"
                                title="Adicionar questão"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewQuestion(question)}
                                className="transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-700 dark:hover:text-blue-400"
                                title="Visualizar questão"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 bg-muted dark:bg-muted/50 rounded-full flex items-center justify-center border border-border">
                          <Search className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div className="space-y-2">
                          <p className="text-lg font-medium text-foreground">
                            {erro ? "Erro ao carregar questões" : "Nenhuma questão encontrada"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {erro 
                              ? "Verifique sua conexão e tente novamente" 
                              : subjectId
                                ? `Não há questões disponíveis para esta disciplina`
                                : "Ajuste os filtros para encontrar questões"
                            }
                          </p>
                        </div>
                        {erro && (
                          <Button 
                            variant="outline" 
                            onClick={fetchQuestions}
                            className="mt-2"
                          >
                            Tentar novamente
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {(currentPage - 1) * pageSize + 1} a {Math.min(currentPage * pageSize, filteredQuestions.length)} de {filteredQuestions.length} questões
                  </p>
                  
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    
                    <div className="flex items-center space-x-2">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let page;
                        if (totalPages <= 5) {
                          page = i + 1;
                        } else if (currentPage <= 3) {
                          page = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          page = totalPages - 4 + i;
                        } else {
                          page = currentPage - 2 + i;
                        }

                        return (
                          <Button
                            key={page}
                            variant={currentPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(page)}
                          >
                            {page}
                          </Button>
                        );
                      })}
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {filteredQuestions.length > 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {filteredQuestions.length} questões encontradas • {selectedQuestions.length} selecionadas
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </>
  );

  return (
    <>
      {embedded ? (
        <div className="max-w-7xl max-h-[75vh] w-full overflow-y-auto space-y-4">
          {innerContent}
        </div>
      ) : (
        <Dialog open={open} onOpenChange={onClose}>
          <DialogContent className="max-w-7xl max-h-[90vh] w-[95vw] overflow-y-auto">
            {innerContent}
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Visualização da Questão */}
      <Dialog open={!!viewQuestion} onOpenChange={() => setViewQuestion(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Visualizar Questão</DialogTitle>
            <DialogDescription>Visualização em modo somente leitura.</DialogDescription>
          </DialogHeader>
          {viewQuestion && (
            <QuestionPreview question={viewQuestion} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function QuestionBankWithBoundary(props: QuestionBankProps) {
  return <QuestionBank {...props} />;
}
