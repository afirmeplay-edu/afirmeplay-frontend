import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DisciplineTag } from "@/components/ui/discipline-tag";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Plus, 
  Trash2, 
  Eye, 
  Filter, 
  X, 
  BookOpen, 
  CheckCircle,
  AlertCircle,
  FileText
} from "lucide-react";
import { api, BASE_URL } from "@/lib/api";
import { QuestionOptionContent } from "@/components/evaluations/questions/QuestionOptionContent";
import { useToast } from "@/hooks/use-toast";
import { EvaluationFormData, Question, Subject } from "../types";
import { QuestionBank } from "../QuestionBank";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "../results/constants";

interface QuestionSelectionStepProps {
  evaluationData: EvaluationFormData;
  selectedQuestions: Question[];
  onQuestionsChange: (questions: Question[]) => void;
  gradeName?: string; // Nome da série opcional (para evitar chamada de API)
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
  question_type?: string;
  value?: number;
  correct_answer?: string;
  formatted_solution?: string;
  alternatives?: { id?: string; text: string; isCorrect?: boolean }[];
  skill?: string | string[];
  created_by?: string;
}

interface QuestionPreviewData {
  question: Question;
  isOpen: boolean;
}

export default function QuestionSelectionStep({
  evaluationData, 
  selectedQuestions,
  onQuestionsChange,
  gradeName: propGradeName
}: QuestionSelectionStepProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [availableQuestions, setAvailableQuestions] = useState<Question[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showQuestionBank, setShowQuestionBank] = useState(false);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [previewData, setPreviewData] = useState<QuestionPreviewData>({ question: {} as Question, isOpen: false });
  const [gradeName, setGradeName] = useState<string>(propGradeName || "");
  const [error, setError] = useState<string | null>(null);
  
  const { toast } = useToast();

  // Garantir que evaluationData.subjects seja sempre um array válido
  const safeSubjects = Array.isArray(evaluationData?.subjects) ? evaluationData.subjects : [];
  const safeGrade = evaluationData?.grade || '';

  // Carregar nome da série (só se não foi passado como prop)
  useEffect(() => {
    setError(null);
    
    // Se o nome da série já foi passado como prop, usar diretamente
    if (propGradeName) {
      setGradeName(propGradeName);
      return;
    }

    const fetchGradeName = async () => {
      if (!safeGrade) {
        setGradeName("");
        return;
      }

      try {
        // Primeiro tentar buscar todas as séries (endpoint mais confiável)
        const gradesResponse = await api.get("/grades");
        if (Array.isArray(gradesResponse.data)) {
          const grade = gradesResponse.data.find((g: { id: string; name: string }) => 
            String(g.id) === String(safeGrade)
          );
          if (grade && grade.name) {
            setGradeName(grade.name);
            return;
          }
        }
        
        // Fallback: tentar endpoint específico
        try {
          const response = await api.get(`/grades/${safeGrade}`);
          if (response.data && response.data.name) {
            setGradeName(response.data.name);
          } else {
            setGradeName(safeGrade);
          }
        } catch (specificError) {
          // Se o endpoint específico falhar, usar o ID como fallback
          console.warn("Não foi possível buscar o nome da série, usando ID:", safeGrade);
          setGradeName(safeGrade);
        }
      } catch (error: any) {
        // Erro ao buscar todas as séries - usar ID como fallback
        console.warn("Erro ao buscar nome da série, usando ID como fallback:", error);
        setGradeName(safeGrade);
        // Não definir erro aqui, apenas usar fallback
      }
    };
    
    fetchGradeName();
  }, [safeGrade, propGradeName]);

  // Carregar questões baseadas nas disciplinas selecionadas (apenas quando necessário)
  useEffect(() => {
    // Não carregar automaticamente - deixar o usuário usar o QuestionBank
    // Isso evita erros de API no carregamento inicial
    // if (safeSubjects.length > 0) {
    //   fetchQuestionsForSubjects();
    // }
  }, [safeSubjects]);

  // Aplicar filtros
  useEffect(() => {
    let filtered = availableQuestions;

    // Filtro por termo de busca
    if (searchTerm) {
      filtered = filtered.filter(q => 
        q.text?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (q.subject?.name && q.subject.name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Filtro por disciplina
    if (selectedSubjectFilter !== "all") {
      filtered = filtered.filter(q => q.subject?.id === selectedSubjectFilter);
    }

    // Filtro por dificuldade
    if (difficultyFilter !== "all") {
      filtered = filtered.filter(q => q.difficulty === difficultyFilter);
    }

    // Filtro por tipo
    if (typeFilter !== "all") {
      filtered = filtered.filter(q => q.type === typeFilter);
    }

    // Excluir questões já selecionadas
    filtered = filtered.filter(q => 
      !selectedQuestions.find(selected => selected.id === q.id)
    );

    setFilteredQuestions(filtered);
  }, [availableQuestions, searchTerm, selectedSubjectFilter, difficultyFilter, typeFilter, selectedQuestions]);

  const fetchQuestionsForSubjects = async () => {
    if (!safeSubjects || safeSubjects.length === 0) {
      setAvailableQuestions([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const subjectIds = safeSubjects.map(s => s.id);
      
      // Buscar questões para todas as disciplinas selecionadas
      const promises = subjectIds.map(subjectId => 
        api.get(`/questions/?subject_id=${subjectId}`)
      );
      
      const responses = await Promise.allSettled(promises);
      
      // Combinar todas as questões
      const allQuestions: Question[] = [];
      responses.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.data && Array.isArray(result.value.data)) {
          try {
            const transformedQuestions = result.value.data.map(transformApiQuestion);
            allQuestions.push(...transformedQuestions);
          } catch (transformError) {
            console.warn(`Erro ao transformar questões da disciplina ${subjectIds[index]}:`, transformError);
          }
        } else if (result.status === 'rejected') {
          console.warn(`Erro ao buscar questões da disciplina ${subjectIds[index]}:`, result.reason);
        }
      });

      // Remover duplicatas baseado no ID
      const uniqueQuestions = allQuestions.filter((question, index, self) =>
        index === self.findIndex(q => q.id === question.id)
      );

      setAvailableQuestions(uniqueQuestions);
      
    } catch (error: any) {
      console.error("Erro ao buscar questões:", error);
      const errorMessage = error?.response?.data?.message || error?.message || ERROR_MESSAGES.NETWORK_ERROR;
      setError(errorMessage);
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const transformApiQuestion = (apiQuestion: ApiQuestion): Question => {
    try {
      const currentGradeName = gradeName || propGradeName || "Série não definida";
      return {
        id: apiQuestion.id || "",
        title: apiQuestion.title || "",
        text: apiQuestion.text || "",
        formattedText: apiQuestion.formatted_text || apiQuestion.text || "",
        subjectId: apiQuestion.subject_id || "",
        subject: apiQuestion.subject || { id: apiQuestion.subject_id || "", name: "Disciplina não definida" },
        grade: apiQuestion.grade || { id: apiQuestion.grade_id || safeGrade, name: currentGradeName },
        difficulty: apiQuestion.difficulty_level || "Básico",
        type: apiQuestion.question_type === "essay" ? "open" : 
              apiQuestion.question_type === "trueFalse" ? "trueFalse" : "multipleChoice",
        value: String(apiQuestion.value || 1.0),
        solution: apiQuestion.correct_answer || "",
        formattedSolution: apiQuestion.formatted_solution || apiQuestion.correct_answer || "",
        options: apiQuestion.alternatives || [],
        skills: Array.isArray(apiQuestion.skill) ? apiQuestion.skill : [apiQuestion.skill || ""],
        created_by: apiQuestion.created_by || "",
      };
    } catch (error) {
      console.error("Erro ao transformar questão:", error, apiQuestion);
      const currentGradeName = gradeName || propGradeName || "Série não definida";
      // Retornar uma questão mínima válida para evitar quebrar o componente
      return {
        id: apiQuestion.id || "",
        title: "",
        text: apiQuestion.text || "Questão inválida",
        formattedText: apiQuestion.formatted_text || apiQuestion.text || "",
        subjectId: apiQuestion.subject_id || "",
        subject: { id: apiQuestion.subject_id || "", name: "Disciplina não definida" },
        grade: { id: apiQuestion.grade_id || safeGrade, name: currentGradeName },
        difficulty: "Básico",
        type: "multipleChoice",
        value: "1.0",
        solution: "",
        formattedSolution: "",
        options: [],
        skills: [],
        created_by: "",
      };
    }
  };

  const handleAddQuestion = (question: Question) => {
    const updated = [...selectedQuestions, question];
    onQuestionsChange(updated);
    
    toast({
      title: "Questão adicionada",
      description: `"${question.text.substring(0, 50)}..." foi adicionada à avaliação`,
    });
  };

  const handleRemoveQuestion = (questionId: string) => {
    const updated = selectedQuestions.filter(q => q.id !== questionId);
    onQuestionsChange(updated);
    
    toast({
      title: "Questão removida",
      description: "Questão removida da avaliação",
      variant: "destructive",
    });
  };

  const handleQuestionFromBank = (question: Question) => {
    if (!selectedQuestions.find(q => q.id === question.id)) {
      handleAddQuestion(question);
    }
  };

  const handlePreviewQuestion = (question: Question) => {
    setPreviewData({ question, isOpen: true });
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedSubjectFilter("all");
    setDifficultyFilter("all");
    setTypeFilter("all");
  };

  const getTotalPoints = () => {
    return selectedQuestions.reduce((sum, q) => sum + parseFloat(q.value || "1"), 0);
  };

  const getQuestionsBySubject = () => {
    const bySubject: { [key: string]: { subject: Subject; questions: Question[] } } = {};
    
    selectedQuestions.forEach(question => {
      const subjectId = question.subject?.id;
      if (subjectId && question.subject) {
        if (!bySubject[subjectId]) {
          bySubject[subjectId] = {
            subject: question.subject,
            questions: []
          };
        }
        bySubject[subjectId].questions.push(question);
      }
    });
    
    return bySubject;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-32 bg-muted rounded"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
    }

  const questionsBySubject = getQuestionsBySubject();

  return (
    <div className="space-y-6">
      {/* Resumo das Questões Selecionadas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Questões Selecionadas
          </div>
            <Badge variant="outline" className="text-lg px-3 py-1">
              {selectedQuestions.length} questões • {getTotalPoints().toFixed(1)} pts
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedQuestions.length > 0 ? (
            <div className="space-y-4">
              {/* Questões agrupadas por disciplina */}
              {Object.values(questionsBySubject).map(({ subject, questions }) => (
                <div key={subject.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <DisciplineTag subjectId={subject.id} name={subject.name} />
                    <span className="text-sm text-muted-foreground">
                      {questions.length} questões
                    </span>
                  </div>
                  <div className="grid gap-2">
                    {questions.map((question, index) => (
                      <div key={question.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">Q{index + 1}</span>
                            <Badge variant="outline" className="text-xs">
                              {question.difficulty}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {question.value} pts
                            </Badge>
                          </div>
                          <p className="text-sm text-foreground line-clamp-2">
                            {question.text}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePreviewQuestion(question)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                            onClick={() => handleRemoveQuestion(question.id)}
                            className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                          </div>
                        ))}
                      </div>
                    </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">Nenhuma questão selecionada</p>
              <p className="text-sm text-muted-foreground">
                Use os filtros abaixo ou o banco de questões para adicionar questões
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Busca e Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-500" />
              Adicionar Questões
            </div>
                <Button
                  variant="outline"
              onClick={() => setShowQuestionBank(true)}
            >
              <BookOpen className="h-4 w-4 mr-2" />
              Banco de Questões
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar questões..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={selectedSubjectFilter} onValueChange={setSelectedSubjectFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Disciplina" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as disciplinas</SelectItem>
                {safeSubjects.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id}>
                    {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Dificuldade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="Abaixo do Básico">Abaixo do Básico</SelectItem>
                <SelectItem value="Básico">Básico</SelectItem>
                <SelectItem value="Adequado">Adequado</SelectItem>
                <SelectItem value="Avançado">Avançado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="multipleChoice">Múltipla Escolha</SelectItem>
                <SelectItem value="trueFalse">Verdadeiro/Falso</SelectItem>
                <SelectItem value="open">Dissertativa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Info sobre filtros ativos */}
          {(searchTerm || selectedSubjectFilter !== "all" || difficultyFilter !== "all" || typeFilter !== "all") && (
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-800">
                  {filteredQuestions.length} questões encontradas com os filtros aplicados
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpar filtros
                </Button>
            </div>
          )}

          {/* Mensagem de Erro */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Mensagem informativa - usar QuestionBank para adicionar questões */}
          {filteredQuestions.length === 0 && !isLoading && (
            <Alert>
              <BookOpen className="h-4 w-4" />
              <AlertDescription>
                Use o botão "Banco de Questões" abaixo para adicionar questões à olimpíada.
              </AlertDescription>
            </Alert>
          )}

          {/* Lista de Questões Disponíveis */}
          {filteredQuestions.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Questão</TableHead>
                    <TableHead className="w-32">Disciplina</TableHead>
                    <TableHead className="w-24">Dificuldade</TableHead>
                    <TableHead className="w-20">Pontos</TableHead>
                    <TableHead className="w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQuestions.slice(0, 20).map((question, index) => (
                    <TableRow key={question.id}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddQuestion(question)}
                          className="hover:bg-green-100"
                        >
                          <Plus className="h-4 w-4 text-green-600" />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <p className="line-clamp-2 text-sm">{question.text}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {question.subject?.name || 'Disciplina não definida'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            question.difficulty === "Avançado" ? "text-green-700" :
                            question.difficulty === "Adequado" ? "text-green-600" :
                            question.difficulty === "Básico" ? "text-yellow-600" :
                            "text-red-600"
                          }`}
                        >
                          {question.difficulty}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">{question.value}</span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePreviewQuestion(question)}
                        >
                          <Eye className="h-4 w-4" />
                    </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {availableQuestions.length === 0 
                  ? "Nenhuma questão encontrada para as disciplinas selecionadas."
                  : "Nenhuma questão encontrada com os filtros aplicados."
                }
              </AlertDescription>
            </Alert>
          )}
              </CardContent>
            </Card>
            
      {/* Question Bank Modal */}
      <QuestionBank
        open={showQuestionBank}
        onClose={() => setShowQuestionBank(false)}
        subjectId={null}
        onQuestionSelected={handleQuestionFromBank}
        gradeId={safeGrade}
        gradeName={gradeName}
        subjects={safeSubjects}
        selectedSubjectId={undefined}
      />

      {/* Question Preview Modal */}
      <Dialog open={previewData.isOpen} onOpenChange={(open) => setPreviewData({ ...previewData, isOpen: open })}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
            <DialogTitle>Visualizar Questão</DialogTitle>
            <DialogDescription>
              Disciplina: {previewData.question.subject?.name} • 
              Dificuldade: {previewData.question.difficulty} • 
              Pontos: {previewData.question.value}
            </DialogDescription>
                    </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Enunciado:</Label>
              <p className="mt-1 text-sm">{previewData.question.text}</p>
            </div>
            
            {previewData.question.options && previewData.question.options.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Alternativas:</Label>
                <div className="mt-2 space-y-2">
                  {previewData.question.options.map((option, index) => (
                    <div key={index} className={`p-2 rounded border ${option.isCorrect ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' : 'bg-muted'}`}>
                      <div className="flex items-start gap-2">
                        <span className="font-medium shrink-0">
                          {String.fromCharCode(65 + index)})
                        </span>
                        <QuestionOptionContent
                          text={option.text}
                          image={option.image}
                          questionId={previewData.question.id}
                          apiBase={BASE_URL}
                          textClassName="text-sm"
                        />
                      </div>
                      {option.isCorrect && (
                        <Badge variant="secondary" className="mt-2 text-xs">
                          Correta
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {previewData.question.skills && previewData.question.skills.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Habilidades:</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {previewData.question.skills.map((skill, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
