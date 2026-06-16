import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Book, Eye, Trash2, Plus } from "lucide-react";
import { EvaluationData, Question, Subject } from "../types";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { QuestionBank } from "../QuestionBank";
import QuestionPreview from "../questions/QuestionPreview";
import QuestionFormReadOnly from "../questions/QuestionFormReadOnly";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEvaluationActions, useQuestions, useQuestionActions } from "@/stores/useEvaluationStore";
import { api } from "@/lib/api";
import { useAuth } from "@/context/authContext";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "../results/constants";
import { scrollToFirstError, getFieldLabel } from "@/utils/formValidation";
import { useEvaluationsManager } from "@/hooks/use-cache";
import { mapEvaluationQuestionOptions } from "@/utils/questionOptionImages";

interface CreateEvaluationStep2Props {
  data: {
    title: string;
    municipalities: string[];
    schools: string[];
    course: string;
    grade: string;
    classId: string;
    type: "AVALIACAO" | "SIMULADO";
    model: "SAEB" | "PROVA" | "AVALIE";
    subjects: Subject[];
    selectedClasses?: { id: string; name: string; school?: { id: string; name: string; } }[];
    selectedSchools?: { id: string; name: string; }[];
    subject: string;
    description?: string;
    startDateTime?: string;
    endDateTime?: string;
    duration?: string;
    classes?: string[];
    municipality?: string;
    questions?: Question[];
  };
  onBack: () => void;
  onComplete?: (updatedQuestions?: Question[]) => void;
  editMode?: boolean;
  evaluationId?: string;
}

interface QuestionsBySubject {
  [subjectId: string]: Question[];
}

export const CreateEvaluationStep2 = ({
  data,
  onBack,
  onComplete,
  editMode = false,
  evaluationId,
}: CreateEvaluationStep2Props) => {
  const [loading, setLoading] = useState(false);
  const [questionsBySubject, setQuestionsBySubject] = useState<QuestionsBySubject>({});
  const [showQuestionBank, setShowQuestionBank] = useState(false);
  const [showQuestionPreview, setShowQuestionPreview] = useState(false);
  const [showCreateQuestion, setShowCreateQuestion] = useState(false);
  const [selectedSubjectForQuestion, setSelectedSubjectForQuestion] = useState<string>("");
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [gradeName, setGradeName] = useState<string>("");
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { updateAfterCRUD } = useEvaluationsManager();

  // Usar o store para criação de avaliação
  const { createEvaluation } = useEvaluationActions();
  const allQuestions = useQuestions();
  const { setQuestions, clearQuestions, addQuestion } = useQuestionActions();

  // Carregar nome da série
  useEffect(() => {
    const fetchGradeName = async () => {
      if (data.grade) {
        try {
          const response = await api.get(`/grades/${data.grade}`);
          if (response.data && response.data.name) {
            setGradeName(response.data.name);
          } else {
            // Tentar buscar todas as séries e encontrar pelo ID
            const gradesResponse = await api.get("/grades/");
            if (Array.isArray(gradesResponse.data)) {
              const grade = gradesResponse.data.find((g: { id: string; name: string }) => g.id === data.grade);
              if (grade) {
                setGradeName(grade.name);
              }
            }
          }
        } catch (error) {
          setGradeName("");
        }
      }
    };
    fetchGradeName();
  }, [data.grade]);

  // Carregar questões existentes quando entrar na edição
  useEffect(() => {
    if (data.questions && data.questions.length > 0) {
      setQuestions(data.questions);
    } else {
      clearQuestions();
    }
  }, [data.questions, setQuestions, clearQuestions]);

  // Inicializar estrutura de questões por disciplina
  useEffect(() => {
    const initialQuestionsBySubject: QuestionsBySubject = {};
    data.subjects.forEach(subject => {
      initialQuestionsBySubject[subject.id] = [];
    });
    setQuestionsBySubject(initialQuestionsBySubject);
  }, [data.subjects]);

  // Atualizar questionsBySubject quando questões do store mudarem
  useEffect(() => {
    if (allQuestions.length > 0) {
      const updatedQuestionsBySubject: QuestionsBySubject = {};
      data.subjects.forEach(subject => {
        const subjectQuestions = allQuestions.filter(q => {
          const questionWithSubjectId = q as { subjectId?: string; subject?: { id?: string }; subject_id?: string };
          return questionWithSubjectId.subjectId === subject.id || 
                 questionWithSubjectId.subject?.id === subject.id ||
                 questionWithSubjectId.subject_id === subject.id;
        });
        
        updatedQuestionsBySubject[subject.id] = subjectQuestions;
      });
      setQuestionsBySubject(updatedQuestionsBySubject);
    }
  }, [allQuestions, data.subjects]);

  const handleAddFromBank = (subjectId: string) => {
    setSelectedSubjectForQuestion(subjectId);
    setShowQuestionBank(true);
  };

  const handleCreateNewQuestion = (subjectId: string) => {
    setSelectedSubjectForQuestion(subjectId);
    setShowCreateQuestion(true);
  };

  const handleQuestionCreated = (question: Question) => {
    addQuestion(question);
    
    setShowCreateQuestion(false);
    toast({
      title: "Questão criada",
      description: "Nova questão adicionada à avaliação",
    });
  };

  const handleQuestionSelected = (question: Question) => {
    addQuestion(question);
    
    toast({
      title: "Questão adicionada",
      description: "Questão adicionada à avaliação",
    });
  };

  const handleRemoveQuestion = (questionId: string) => {
    const updatedQuestions = allQuestions.filter(q => q.id !== questionId);
    setQuestions(updatedQuestions);
    
    toast({
      title: "Questão removida",
      description: "Questão removida da avaliação",
    });
  };

  const handleViewQuestion = async (question: Question) => {
    try {
      if (question.id && question.id !== 'preview') {
        const response = await api.get(`/questions/${question.id}`);
        setPreviewQuestion(response.data);
      } else {
        setPreviewQuestion(question);
      }
      setShowQuestionPreview(true);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível carregar a questão",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);

      if (!user) {
        toast({
          title: "Erro",
          description: "Usuário não autenticado",
          variant: "destructive",
        });
        return;
      }

      if (allQuestions.length === 0) {
        // Scroll para a seção de questões
        const questionsSection = document.querySelector('[data-section="questions"]');
        if (questionsSection) {
          questionsSection.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
        }
        
        toast({
          title: "Erro",
          description: ERROR_MESSAGES.INVALID_QUESTIONS,
          variant: "destructive",
        });
        return;
      }

      // Validar se todas as questões têm alternativas válidas
      const invalidQuestions = allQuestions.filter(q => {
        if (q.type === 'multipleChoice' && (!q.options || q.options.length === 0)) return true;
        if (q.type === 'multipleChoice' && !q.options.some(opt => opt.isCorrect)) return true;
        return false;
      });

      if (invalidQuestions.length > 0) {
        // Scroll para a seção de questões
        const questionsSection = document.querySelector('[data-section="questions"]');
        if (questionsSection) {
          questionsSection.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
        }
        
        toast({
          title: "Erro de Validação",
          description:
            invalidQuestions.length === 1
              ? `1 questão: ${ERROR_MESSAGES.INVALID_QUESTIONS}`
              : `${invalidQuestions.length} questões: ${ERROR_MESSAGES.INVALID_QUESTIONS}`,
          variant: "destructive",
        });
        return;
      }

      // ✅ CORREÇÃO: Se estiver em modo de edição, delegar para o EditEvaluation
      if (editMode && onComplete) {
        onComplete(allQuestions);
        return;
      }

      // ✅ CORREÇÃO: Fluxo de criação (apenas quando não estiver editando)
      // ✅ CORREÇÃO: Log dos dados que serão enviados ao backend
      const classesToSend = data.selectedClasses?.map(c => c.id) || data.classes || [];
      const schoolsToSend = data.selectedSchools?.map(s => s.id) || data.schools || [];
      
      // Dados enviados ao backend
      void ({
        selectedClasses: data.selectedClasses?.map(c => ({ id: c.id, name: c.name, school: c.school?.name })),
        classes: data.classes,
        classesToSend,
        classesCount: classesToSend.length,
        selectedSchools: data.selectedSchools?.map(s => ({ id: s.id, name: s.name })),
        schools: data.schools,
        schoolsToSend,
        schoolsCount: schoolsToSend.length
      });
      
      const backendEvaluationData = {
        title: data.title,
        description: data.description || "",
        type: data.type,
        model: data.model,
        course: data.course,
        grade: data.grade,
        subject: data.subject,
        time_limit: data.startDateTime || new Date().toISOString(),
        end_time: data.endDateTime || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        duration: data.duration ? parseInt(data.duration, 10) : 60,
        evaluation_mode: "virtual",
        municipalities: data.municipalities || [],
        schools: schoolsToSend, // ✅ CORREÇÃO: Usar apenas escolas selecionadas
        classes: classesToSend, // ✅ CORREÇÃO: Usar apenas turmas selecionadas
        subjects: data.subjects.map(subject => subject.id),
        subjects_info: data.subjects.map(subject => ({
          subject: subject.id,
          weight: Math.round(100 / data.subjects.length)
        })),
        created_by: user?.id || "",
        questions: allQuestions.map((question, index) => {
          if (question.id && question.id !== 'preview') {
            return {
              id: question.id,
              number: index + 1
            };
          }

          return {
            number: index + 1,
            text: question.text,
            formattedText: question.formattedText || question.text,
             subjectId: question.subjectId,
             title: question.title,
             description: question.title,
             command: question.title,
             subtitle: question.title,
             secondStatement: question.secondStatement || '',
             options: mapEvaluationQuestionOptions(question.options),
             skills: question.skills || "", // String única (ID da habilidade)
             grade: question.grade?.id || data.grade,
             difficulty: question.difficulty,
             solution: question.solution || "",
             formattedSolution: question.formattedSolution || question.solution || "",
             type: question.type === 'multipleChoice' ? 'multiple_choice' : 'open',
             value: question.value || 0,
             topics: [],
             educationStageId: data.course,
             created_by: user?.id || "",
             lastModifiedBy: user?.id || ""
          };
        })
      };

      const response = await api.post("/test", backendEvaluationData);
      
      if (response.status === 201 || response.status === 200) {
        // Invalidar cache após criar avaliação
        await updateAfterCRUD();

        toast({
          title: SUCCESS_MESSAGES.EVALUATION_CREATED,
          description: `Avaliação "${data.title}" criada com sucesso!`,
        });

        clearQuestions();

        // 🔧 CORREÇÃO: Sempre redirecionar para página inicial
        navigate("/app/avaliacoes");
      }
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string; error?: string } }; message?: string };
      let errorMessage: string = ERROR_MESSAGES.EVALUATION_CREATE_FAILED;
      if (apiError?.response?.data?.message) {
        errorMessage = apiError.response.data.message;
      } else if (apiError?.response?.data?.error) {
        errorMessage = apiError.response.data.error;
      } else if (apiError?.message) {
        errorMessage = apiError.message;
      }

      toast({
        title: ERROR_MESSAGES.EVALUATION_CREATE_FAILED,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTotalQuestions = () => {
    return allQuestions.length;
  };

  const getQuestionsForSubject = (subjectId: string) => {
    return allQuestions.filter(q => {
      const questionWithSubjectId = q as { subjectId?: string; subject?: { id?: string }; subject_id?: string };
      return questionWithSubjectId.subjectId === subjectId || 
             questionWithSubjectId.subject?.id === subjectId ||
             questionWithSubjectId.subject_id === subjectId;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header com resumo */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Questões da Avaliação</h2>
          <p className="text-sm text-muted-foreground">
            Total: {getTotalQuestions()}{' '}
            {getTotalQuestions() === 1
              ? 'questão selecionada'
              : 'questões selecionadas'}
          </p>
        </div>
      </div>

      {/* Questões por disciplina */}
      <div className="space-y-6" data-section="questions">
        {data.subjects.map((subject) => {
          const subjectQuestions = getQuestionsForSubject(subject.id);
          
          return (
            <Card key={subject.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Book className="h-5 w-5" />
                    <h3 className="text-lg font-medium">{subject.name}</h3>
                    <Badge variant="outline">
                      {subjectQuestions.length}{' '}
                      {subjectQuestions.length === 1 ? 'questão' : 'questões'}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddFromBank(subject.id)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Banco de Questões
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCreateNewQuestion(subject.id)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Nova Questão
                    </Button>
                  </div>
                </div>

                {/* Lista de questões */}
                <div className="space-y-3">
                  {subjectQuestions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Book className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Nenhuma questão adicionada para {subject.name}</p>
                      <p className="text-sm">Use os botões acima para adicionar questões</p>
                    </div>
                  ) : (
                    subjectQuestions.map((question, index) => (
                      <div
                        key={question.id || index}
                        className="flex items-center justify-between p-3 border rounded-lg bg-muted"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary">#{index + 1}</Badge>
                            <span className="text-sm font-medium">
                              {question.title || `Questão ${index + 1}`}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {question.text || "Sem texto disponível"}
                          </p>
                          {question.options && question.options.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {question.options.length} alternativas
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewQuestion(question)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveQuestion(question.id || "")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Botões de ação */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button 
          onClick={handleSubmit} 
          disabled={loading || getTotalQuestions() === 0}
        >
          {loading ? (editMode ? "Salvando..." : "Criando...") : (editMode ? "Salvar Alterações" : "Finalizar Avaliação")}
        </Button>
      </div>

      {/* Modais */}
      <Dialog open={showQuestionBank} onOpenChange={setShowQuestionBank}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Banco de Questões</DialogTitle>
            <DialogDescription>
              Selecione questões do banco para adicionar à avaliação
            </DialogDescription>
          </DialogHeader>
          <QuestionBank
            open={showQuestionBank}
            subjectId={selectedSubjectForQuestion}
            onQuestionSelected={handleQuestionSelected}
            onClose={() => setShowQuestionBank(false)}
            gradeId={data.grade}
            gradeName={gradeName}
            subjects={data.subjects}
            selectedSubjectId={selectedSubjectForQuestion}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showQuestionPreview} onOpenChange={setShowQuestionPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Visualizar Questão</DialogTitle>
            <DialogDescription>
              Prévia completa da questão com alternativas e resolução
            </DialogDescription>
          </DialogHeader>
          {previewQuestion && (
            <QuestionPreview
              question={previewQuestion}
              onClose={() => setShowQuestionPreview(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateQuestion} onOpenChange={setShowCreateQuestion}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Criar Nova Questão</DialogTitle>
            <DialogDescription>
              Crie uma nova questão para adicionar à avaliação
            </DialogDescription>
          </DialogHeader>
          <QuestionFormReadOnly
            open={showCreateQuestion}
            onClose={() => setShowCreateQuestion(false)}
            onQuestionAdded={handleQuestionCreated}
            questionNumber={getTotalQuestions() + 1}
            evaluationData={{
              course: data.course,
              grade: data.grade,
              subject: selectedSubjectForQuestion
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};