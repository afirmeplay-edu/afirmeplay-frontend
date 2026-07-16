import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, Trash2, ArrowLeft, Eye, Users, BookOpen, FileText, Calendar, User, MapPin, School, Play, Download, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { generateEvaluationExamPdf } from "@/services/reports/evaluationExamPdf";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DisciplineTag } from "@/components/ui/discipline-tag";
import { useToast } from "@/hooks/use-toast";
import { getSubjectColors } from "@/utils/competition/competitionSubjectColors";
import { EvaluationResultsApiService } from "@/services/evaluation/evaluationResultsApi";
import { OlimpiadasApiService } from "@/services/olimpiadasApi";
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import StartEvaluationModal from "@/components/evaluations/StartEvaluationModal";
import { convertDateTimeLocalToISO } from "@/utils/date";
import { Evaluation, Subject, Grade, Municipality, SchoolInfo, AppliedClass, Author, Question, getEvaluationSubjects, getEvaluationSubjectsCount } from "@/types/evaluation-types";
import QuestionPreview from "@/components/evaluations/questions/QuestionPreview";
import type { Question as EvaluationQuestion } from "@/components/evaluations/types";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "@/components/evaluations/results/constants";
import { useEvaluations } from "@/hooks/use-cache";

// Interfaces locais para questões (estendem a interface base)
interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

// Interface para questões agrupadas por matéria
interface QuestionsBySubject {
  [subjectId: string]: {
    subject: Subject;
    questions: Question[];
  };
}

interface ViewEvaluationProps {
  /** Usado quando a avaliação é exibida dentro de um modal (sem rota). */
  evaluationId?: string;
  /** Fecha o modal quando definido; caso contrário, usa navegação normal. */
  onClose?: () => void;
}

export default function ViewEvaluation({
  evaluationId,
  onClose,
}: ViewEvaluationProps = {}) {
  const { id: routeId } = useParams<{ id: string }>();
  const id = evaluationId ?? routeId;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { invalidateAfterCRUD } = useEvaluations();
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  /** Turmas da avaliação via GET /test/:id/classes (fonte única; evita applied_classes com turmas erradas) */
  const [testClasses, setTestClasses] = useState<AppliedClass[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showStartEvaluationModal, setShowStartEvaluationModal] = useState(false);
  const [individualStudentNamesMap, setIndividualStudentNamesMap] = useState<Record<string, string>>({});
  const [applicationStudents, setApplicationStudents] = useState<Array<{
    id: string;
    nome: string;
    turma?: string;
    escola?: string;
    status: 'realizado' | 'pendente';
  }>>([]);
  const [loadingApplicationStudents, setLoadingApplicationStudents] = useState(false);
  const [includeGabarito, setIncludeGabarito] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Estados para mapeamento de habilidades
  const [skillsMapping, setSkillsMapping] = useState<Record<string, string>>({});
  const [skillsBySubject, setSkillsBySubject] = useState<Record<string, Array<{
    id: string | null;
    code: string;
    description: string;
    source: 'database' | 'question';
  }>>>({});

  useEffect(() => {
    const fetchEvaluation = async () => {
      if (!id) return;
      try {
        // Buscar base para identificar se é olimpíada
        const baseResponse = await api.get(`/test/${id}`);
        const base = baseResponse.data;

        const isOlimpiadaFromBase =
          base?.type === "OLIMPIADA" ||
          base?.title?.includes("[OLIMPÍADA]") ||
          base?.title?.toUpperCase?.().includes("OLIMPÍADA");

        // Para olimpíada: usar serviço que enriquece selected_students/aplicação individual
        const data = isOlimpiadaFromBase ? await OlimpiadasApiService.getOlimpiada(id) : base;

        console.log("Resposta da API:", data);
        console.log(
          "Campo secondStatement nas questões:",
          data.questions?.map((q: any) => ({
            id: q.id,
            secondStatement: q.secondStatement,
            text: q.text,
            formattedText: q.formattedText,
          }))
        );
        setEvaluation(data);

        // Buscar turmas da avaliação via GET /test/:id/classes (fonte única; retorna test.classes ou aplicadas)
        try {
          const classesRes = await api.get(`/test/${id}/classes`);
          const raw = classesRes.data;
          const arr = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && (raw as any).data ? (raw as any).data : Array.isArray((raw as any)?.results) ? (raw as any).results : []);
          const normalized: AppliedClass[] = arr.map((item: any) => {
            const cls = item?.class ?? item;
            if (typeof cls === 'object' && cls !== null && (cls.id || (item?.class_id))) {
              return {
                class_test_id: item?.class_test_id ?? null,
                class: {
                  id: String(cls.id ?? item?.class_id ?? ''),
                  name: String(cls.name ?? ''),
                  students_count: typeof cls.students_count === 'number' ? cls.students_count : (typeof item?.students_count === 'number' ? item.students_count : 0),
                  school: cls.school,
                  grade: cls.grade,
                },
                application: item?.application ?? null,
                expiration: item?.expiration ?? null,
                status: item?.status,
              } as AppliedClass;
            }
            return null;
          }).filter((x: AppliedClass | null): x is AppliedClass => x != null);
          setTestClasses(normalized);
        } catch {
          setTestClasses([]);
        }

        // Buscar relatório detalhado uma única vez para status/nomes de alunos
        let detailedReportCache: any = null;
        try {
          detailedReportCache = await EvaluationResultsApiService.getDetailedReport(id);
        } catch {
          detailedReportCache = null;
        }

        // ✅ Se houver aplicação individual, buscar nomes dos alunos para exibir no detalhe
        if (isOlimpiadaFromBase && Array.isArray((data as any).selected_students) && (data as any).selected_students.length > 0) {
          try {
            const selectedIds: string[] = (data as any).selected_students.map((s: any) => String(s));
            const namesMap: Record<string, string> = {};
            
            // Tentar buscar do relatório detalhado primeiro (pode ter alunos que já fizeram)
            try {
              const detailedReport = detailedReportCache;
              if (detailedReport?.alunos) {
                selectedIds.forEach((studentId) => {
                  const student = detailedReport.alunos.find(
                    (s: any) => String(s.id || s.student_id || "") === String(studentId)
                  );
                  if (student) {
                    namesMap[studentId] = (student as any)?.nome || (student as any)?.name || studentId;
                  }
                });
              }
            } catch (err) {
              // Continuar com método alternativo
            }
            
            // Para alunos que não foram encontrados, buscar das turmas da olimpíada
            const missingIds = selectedIds.filter((id) => !namesMap[id]);
            if (missingIds.length > 0 && data.classes && Array.isArray(data.classes) && data.classes.length > 0) {
              for (const classItem of data.classes) {
                if (missingIds.length === 0) break;
                try {
                  const classId = typeof classItem === 'object' && classItem !== null && 'id' in classItem 
                    ? classItem.id 
                    : String(classItem);
                  const response = await api.get(`/students/classes/${classId}`);
                  const students = Array.isArray(response.data) 
                    ? response.data 
                    : (response.data?.alunos || response.data?.students || []);
                  
                  missingIds.forEach((studentId) => {
                    const student = students.find(
                      (s: any) => String(s.id || s.student_id || "") === String(studentId)
                    );
                    if (student) {
                      namesMap[studentId] = String(student.name || student.nome || studentId);
                    }
                  });
                } catch (err) {
                  // Continuar para próxima turma
                }
              }
            }
            
            // Fallback: usar ID para alunos não encontrados
            selectedIds.forEach((studentId) => {
              if (!namesMap[studentId]) {
                namesMap[studentId] = studentId;
              }
            });
            
            setIndividualStudentNamesMap(namesMap);
          } catch (err) {
            console.warn('Erro ao buscar nomes dos alunos:', err);
            // fallback: manter IDs
            const selectedIds: string[] = (data as any).selected_students.map((s: any) => String(s));
            const fallbackMap: Record<string, string> = {};
            selectedIds.forEach((sid) => (fallbackMap[sid] = sid));
            setIndividualStudentNamesMap(fallbackMap);
          }
        } else {
          setIndividualStudentNamesMap({});
        }

        // Lista de alunos para acompanhamento da aplicação (aplicado / realizou / pendente)
        setLoadingApplicationStudents(true);
        try {
          const statusById = new Map<string, 'realizado' | 'pendente'>();
          const namesById = new Map<string, string>();
          const turmaById = new Map<string, string>();
          if (detailedReportCache?.alunos && Array.isArray(detailedReportCache.alunos)) {
            detailedReportCache.alunos.forEach((a: any) => {
              const sid = String(a.id || a.student_id || '');
              if (!sid) return;
              const rawStatus = String(a.status || '').toLowerCase();
              statusById.set(sid, rawStatus === 'concluida' ? 'realizado' : 'pendente');
              namesById.set(sid, String(a.nome || a.name || sid));
              if (a.turma) turmaById.set(sid, String(a.turma));
            });
          }

          const studentsMap = new Map<string, { id: string; nome: string; turma?: string; escola?: string; status: 'realizado' | 'pendente' }>();
          const addStudent = (student: any, fallback?: { turma?: string; escola?: string }) => {
            const sid = String(student?.id || student?.student_id || '');
            if (!sid) return;
            const existing = studentsMap.get(sid);
            const nome = String(
              student?.name ||
              student?.nome ||
              namesById.get(sid) ||
              sid
            );
            const turma = String(
              student?.class_name ||
              student?.turma ||
              fallback?.turma ||
              turmaById.get(sid) ||
              ''
            );
            const escola = String(
              student?.school_name ||
              student?.escola ||
              fallback?.escola ||
              ''
            );
            const status = statusById.get(sid) ?? 'pendente';
            studentsMap.set(sid, {
              id: sid,
              nome,
              turma: turma || existing?.turma,
              escola: escola || existing?.escola,
              status,
            });
          };

          const selectedStudents = (data as any).selected_students;
          if (Array.isArray(selectedStudents) && selectedStudents.length > 0) {
            selectedStudents.forEach((sid: any) => {
              const idStr = String(sid);
              addStudent({ id: idStr, name: namesById.get(idStr) || individualStudentNamesMap[idStr] || idStr });
            });
          } else if (Array.isArray(testClasses) && testClasses.length > 0) {
            for (const cls of testClasses) {
              try {
                const classId = String(cls.class?.id || '');
                if (!classId) continue;
                const response = await api.get(`/students/classes/${classId}`);
                const classStudents = Array.isArray(response.data)
                  ? response.data
                  : (response.data?.alunos || response.data?.students || []);
                classStudents.forEach((s: any) =>
                  addStudent(s, {
                    turma: cls.class?.name || '',
                    escola: cls.class?.school?.name || '',
                  })
                );
              } catch {
                // ignora turma com erro e continua demais
              }
            }
          }

          if (studentsMap.size === 0 && detailedReportCache?.alunos?.length) {
            detailedReportCache.alunos.forEach((a: any) => addStudent(a));
          }

          const ordered = Array.from(studentsMap.values()).sort((a, b) => a.nome.localeCompare(b.nome));
          setApplicationStudents(ordered);
        } catch {
          setApplicationStudents([]);
        } finally {
          setLoadingApplicationStudents(false);
        }
        
        // Buscar skills da avaliação para mapeamento
        try {
          const evaluationSkills = await EvaluationResultsApiService.getSkillsByEvaluation(id);
          
          if (evaluationSkills && evaluationSkills.length > 0) {
            // Criar mapeamento UUID -> Código real organizado por disciplina
            const newSkillsMapping: Record<string, string> = {};
            const skillsBySubject: Record<string, Array<{
              id: string | null;
              code: string;
              description: string;
              source: 'database' | 'question';
            }>> = {};
            
            evaluationSkills.forEach(skill => {
              // Mapear UUID para código real
              if (skill.id && skill.code) {
                newSkillsMapping[skill.id] = skill.code;
              }
              
              // Organizar skills por disciplina
              const subjectId = skill.subject_id;
              if (!skillsBySubject[subjectId]) {
                skillsBySubject[subjectId] = [];
              }
              skillsBySubject[subjectId].push({
                id: skill.id,
                code: skill.code,
                description: skill.description,
                source: skill.source
              });
            });
            
            setSkillsMapping(newSkillsMapping);
            setSkillsBySubject(skillsBySubject);
            
          }
        } catch (error) {
          console.error("Erro ao carregar skills da avaliação:", error);
          // Continuar sem skills se houver erro
        }
      } catch (error) {
        console.error("Erro ao buscar avaliação:", error);
        toast({
          title: "Erro",
          description: ERROR_MESSAGES.EVALUATION_LOAD_FAILED,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvaluation();
  }, [id, toast]);

  // Função auxiliar para verificar se é uma olimpíada
  const isOlimpiada = () => {
    return evaluation?.type === 'OLIMPIADA' || 
           evaluation?.title?.includes('[OLIMPÍADA]') ||
           evaluation?.title?.toUpperCase().includes('OLIMPÍADA');
  };

  // Função auxiliar para navegar de volta baseado no tipo
  const navigateBack = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (isOlimpiada()) {
      navigate("/app/olimpiadas");
    } else {
      navigate("/app/avaliacoes");
    }
  };

  const handleEdit = () => {
    // Para olimpíadas, ainda usar a rota de edição de avaliação (mesma estrutura)
    navigate(`/app/avaliacao/${id}/editar`);
  };

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!id) return;

    try {
      setIsDeleting(true);
      await api.delete(`/test/${id}`);

      // Invalidar cache após exclusão
      await invalidateAfterCRUD();

      toast({
        title: SUCCESS_MESSAGES.EVALUATION_DELETED,
        description: SUCCESS_MESSAGES.EVALUATION_DELETED,
      });

      navigateBack();
    } catch (error: unknown) {
      const apiError = error as { 
        message?: string; 
        response?: { 
          status?: number; 
          data?: { 
            error?: string;
            details?: string;
          } 
        } 
      };
      
      console.error("❌ Erro detalhado ao excluir:", {
        error,
        message: apiError.message,
        response: apiError.response,
        status: apiError.response?.status,
        data: apiError.response?.data
      });

      let errorMessage = ERROR_MESSAGES.EVALUATION_DELETE_FAILED;

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
        
        // Verificar se é erro de tabela não existente (especificamente competition_results)
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
      } else if (apiError.message) {
        errorMessage = apiError.message;
      }

      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleBack = () => {
    if (onClose) {
      onClose();
      return;
    }
    navigateBack();
  };

  const handleStartEvaluation = () => {
    setShowStartEvaluationModal(true);
  };

  const handleDownloadPdf = async () => {
    if (!evaluation || isGeneratingPdf || (evaluation.questions?.length ?? 0) === 0) return;

    setIsGeneratingPdf(true);
    try {
      const grouped = groupQuestionsBySubject();
      const subjects = Object.values(grouped).map(({ subject, questions }) => ({
        subject,
        questions,
      }));
      const cityId = evaluation.municipalities?.[0]?.id ?? null;

      await generateEvaluationExamPdf({
        title: evaluation.title,
        gradeName: evaluation.grade?.name,
        courseName: evaluation.course?.name,
        subjects,
        includeGabarito,
        cityId,
      });

      toast({
        title: "PDF gerado",
        description: includeGabarito
          ? "O download da prova com gabarito foi iniciado."
          : "O download da prova foi iniciado.",
      });
    } catch (error) {
      console.error("Erro ao gerar PDF da prova:", error);
      toast({
        title: "Erro ao gerar PDF",
        description: "Não foi possível gerar o PDF da prova. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleConfirmStartEvaluation = async (startDateTime: string, endDateTime: string, classIds: string[]) => {
    if (!evaluation) return;

    // Capturar timezone do usuário automaticamente
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // ✅ CORREÇÃO: Verificar se já está em formato ISO com timezone antes de converter
    // O StartEvaluationModal já converte para ISO, então só precisamos converter se ainda não estiver
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

    console.log("🚀 Aplicando avaliação (ViewEvaluation):", {
      evaluationId: evaluation.id,
      classIds,
      original: { startDateTime, endDateTime },
      converted: { startDateTimeISO, endDateTimeISO },
      timezone: userTimezone
    });

    try {
      // ✅ CORREÇÃO: Usar o mesmo endpoint e formato que ReadyEvaluations.tsx
      // Mudar de PUT /test/${id}/start para POST /test/${id}/apply
      const classesData = classIds.map(classId => ({
        class_id: classId,
        application: startDateTimeISO,
        expiration: endDateTimeISO
      }));

      console.log("📡 Enviando dados para API:", {
        url: `/test/${evaluation.id}/apply`,
        data: { classes: classesData, timezone: userTimezone }
      });

      const applyResponse = await api.post(`/test/${evaluation.id}/apply`, {
        classes: classesData,
        timezone: userTimezone
      });

      console.log("✅ Resposta da API:", applyResponse.data);

      // Invalidar cache após aplicar avaliação
      await invalidateAfterCRUD();

      toast({
        title: SUCCESS_MESSAGES.EVALUATION_APPLIED,
        description: `A ${entityName} "${evaluation.title}" foi aplicada para ${classIds.length} turma(s) e ficará disponível no horário configurado.`,
      });

      setShowStartEvaluationModal(false);
      
      // Recarregar os dados da avaliação para refletir o novo status
      const evaluationResponse = await api.get(`/test/${evaluation.id}`);
      setEvaluation(evaluationResponse.data);
      
    } catch (error: unknown) {
      console.error("❌ Erro ao aplicar avaliação:", error);

      let errorMessage: string = ERROR_MESSAGES.EVALUATION_APPLY_FAILED;

      const apiError = error as {
        response?: {
          status?: number;
          data?: { error?: string; classes_nao_vinculadas?: string[] };
        };
      };
      
      if (apiError.response?.status === 404) {
        errorMessage = ERROR_MESSAGES.EVALUATION_NOT_FOUND;
      } else if (apiError.response?.status === 403) {
        const classesNaoVinculadas = apiError.response.data?.classes_nao_vinculadas ?? [];
        const backendMsg = apiError.response.data?.error;
        if (backendMsg && classesNaoVinculadas.length > 0) {
          errorMessage = `${backendMsg}. Turmas: ${classesNaoVinculadas.join(", ")}`;
        } else if (backendMsg) {
          errorMessage = backendMsg;
        } else {
          errorMessage = ERROR_MESSAGES.FORBIDDEN;
        }
      } else if (apiError.response?.status === 400) {
        errorMessage = apiError.response.data?.error || ERROR_MESSAGES.EVALUATION_INVALID_DATA;
      } else if (apiError.response?.data?.error) {
        errorMessage = apiError.response.data.error;
      }

      toast({
        title: ERROR_MESSAGES.EVALUATION_APPLY_FAILED,
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Função para buscar descrição da habilidade
  const getSkillDescription = (skillId: string) => {
    // Limpar o skillId removendo chaves se existirem
    const cleanSkillId = skillId.replace(/[{}]/g, '');
    
    // Primeiro, tentar mapear UUID para código se necessário
    const skillCode = skillsMapping[cleanSkillId] || cleanSkillId;
    
    // Buscar em todas as disciplinas - tentar tanto por ID quanto por código
    for (const [subjectId, skills] of Object.entries(skillsBySubject)) {
      // Tentar encontrar por ID limpo primeiro
      let skill = skills.find(s => s.id === cleanSkillId);
      if (skill) {
        return skill.description;
      }
      
      // Tentar encontrar por ID original (com chaves)
      skill = skills.find(s => s.id === skillId);
      if (skill) {
        return skill.description;
      }
      
      // Tentar encontrar por código
      skill = skills.find(s => s.code === skillCode);
      if (skill) {
        return skill.description;
      }
    }
    
    return null;
  };

  // Função para obter o código da habilidade (para exibição)
  const getSkillCode = (skillId: string) => {
    // Limpar o skillId removendo chaves se existirem
    const cleanSkillId = skillId.replace(/[{}]/g, '');
    
    const mappedCode = skillsMapping[cleanSkillId];
    if (mappedCode) {
      return mappedCode;
    }
    
    // Se não encontrou no mapeamento, tentar buscar diretamente nas skills
    for (const [subjectId, skills] of Object.entries(skillsBySubject)) {
      const skill = skills.find(s => s.id === cleanSkillId);
      if (skill) {
        return skill.code;
      }
    }
    
    // Fallback: retornar o ID limpo se não encontrar
    return cleanSkillId;
  };

  // Função para agrupar questões por matéria
  const groupQuestionsBySubject = (): QuestionsBySubject => {
    if (!evaluation) {
      return {};
    }

    const questionsBySubject: QuestionsBySubject = {};

    // Usar função helper padronizada para obter disciplinas
    const subjects = getEvaluationSubjects(evaluation);

    // Criar estrutura para cada disciplina
    if (subjects.length > 0) {
      subjects.forEach(subject => {
        questionsBySubject[subject.id] = {
          subject,
          questions: []
        };
      });
    } else {
      // Fallback: se não há disciplinas, criar uma estrutura vazia
      return {};
    }

    // Distribuir questões pelas matérias
    evaluation.questions?.forEach((question) => {
      const q = question as Question & { value?: number; solution?: string; skills?: string[] };
      const subjId = q.subject?.id;
      
      if (subjId && questionsBySubject[subjId]) {
        questionsBySubject[subjId].questions.push(q);
      } else {
        // Se não tem subject ou não encontrou a matéria, coloca na primeira
        const firstSubjectId = Object.keys(questionsBySubject)[0];
        if (firstSubjectId) {
          questionsBySubject[firstSubjectId].questions.push(q);
        }
      }
    });

    return questionsBySubject;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-2 md:px-4 py-4 md:py-6 space-y-6">
        {/* Breadcrumb */}
        <Skeleton className="h-5 w-64" />
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-80" />
            <Skeleton className="h-4 w-60" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-36" />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-12 mb-1" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Content Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
            <CardContent className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
            <CardContent className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Questions skeleton */}
        <Card>
          <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
          <CardContent><Skeleton className="h-40 w-full" /></CardContent>
        </Card>
      </div>
    );
  }

  // Verificar se é uma olimpíada para adaptar textos (mesmo que evaluation seja null, podemos verificar pelo ID na URL)
  // Para o caso de evaluation null, assumir que não é olimpíada (padrão)
  const isOlimpiadaType = evaluation ? isOlimpiada() : false;
  const entityName = isOlimpiadaType ? 'olimpíada' : 'avaliação';
  const entityNameCapitalized = isOlimpiadaType ? 'Olimpíada' : 'Avaliação';
  const entityNamePlural = isOlimpiadaType ? 'Olimpíadas' : 'Avaliações';
  const isModalView = Boolean(onClose);
  const formatStatusLabel = (rawStatus: string) => {
    const normalized = String(rawStatus || '')
      .trim()
      .replace(/_/g, ' ')
      .toLowerCase();
    if (!normalized) return 'Não informado';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  if (!evaluation) {
    return (
      <div className="container mx-auto px-2 md:px-4 py-4 md:py-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{entityNameCapitalized} não encontrada</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">A {entityName} que você está procurando não foi encontrada.</p>
          <Button onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para {entityNamePlural}
          </Button>
        </div>
      </div>
    );
  }

  const questionsBySubject = groupQuestionsBySubject();
  const totalQuestions = evaluation.questions.length;
  const subjectsCount = getEvaluationSubjectsCount(evaluation);
  const municipalitiesCount = evaluation.municipalities_count || evaluation.municipalities?.length || 0;
  const schoolsCount = evaluation.schools_count || evaluation.schools?.length || 0;
  const hasIndividualSelected =
    Array.isArray((evaluation as any).selected_students) &&
    (evaluation as any).selected_students.length > 0;
  const totalStudents = hasIndividualSelected
    ? (evaluation as any).selected_students.length
    : (testClasses !== null && testClasses.length > 0
        ? testClasses.reduce((sum, ac) => sum + (ac.class?.students_count ?? 0), 0)
        : (evaluation.total_students || 0));
  const appliedClassesCount = testClasses !== null ? testClasses.length : (evaluation.applied_classes_count ?? 0);
  const isAppliedForDisplay = Boolean((evaluation as any).is_applied) || hasIndividualSelected;
  const displayClasses = testClasses ?? evaluation.applied_classes ?? [];
  const completedStudentsCount = applicationStudents.filter((s) => s.status === 'realizado').length;
  const pendingStudentsCount = Math.max(0, applicationStudents.length - completedStudentsCount);

  return (
    <div className="container mx-auto px-2 md:px-4 py-4 md:py-6 space-y-6">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/60 pt-4 pb-4">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink onClick={handleBack} className="cursor-pointer">
                {entityNamePlural}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{evaluation.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mt-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className={isModalView ? "flex" : "hidden sm:flex"}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {isModalView ? "Sair" : "Voltar"}
              </Button>
            </div>
            <h1 className="text-xl md:text-2xl font-bold dark:text-gray-100">{evaluation.title}</h1>
            <p className="text-muted-foreground">
              Visualize os detalhes e questões da {entityName}
            </p>
          </div>
          
          <div className="flex flex-col items-stretch sm:items-end gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <Switch
                id="include-gabarito-pdf"
                checked={includeGabarito}
                onCheckedChange={setIncludeGabarito}
                disabled={isGeneratingPdf || totalQuestions === 0}
              />
              <Label htmlFor="include-gabarito-pdf" className="text-sm cursor-pointer whitespace-nowrap">
                Incluir gabarito
              </Label>
            </div>
            <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDownloadPdf()}
              disabled={isGeneratingPdf || totalQuestions === 0}
            >
              {isGeneratingPdf ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {isGeneratingPdf ? "Gerando PDF..." : "Baixar PDF"}
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={handleStartEvaluation}
              className={isOlimpiadaType 
                ? "bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600 text-white" 
                : "bg-green-600 hover:bg-green-700 text-white"
              }
            >
              <Play className="h-4 w-4 mr-2" />
              {isOlimpiadaType ? 'Aplicar Olimpíada' : 'Aplicar Avaliação'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDelete} 
              disabled={isDeleting}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isDeleting ? "Excluindo..." : "Excluir"}
            </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Questões
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-gray-100">{totalQuestions}</div>
            <p className="text-xs text-muted-foreground">
              Total de questões
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Alunos
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{totalStudents}</div>
            <p className="text-xs text-muted-foreground">Total de alunos</p>
          </CardContent>
        </Card>
      </div>

      {/* Information Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Informações Gerais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Curso</label>
              <p className="text-sm dark:text-gray-300">{evaluation.course?.name || 'Não informado'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Disciplinas</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {(() => {
                  const subjects = getEvaluationSubjects(evaluation);
                  if (subjects.length > 0) {
                    return (
                      <>
                        {subjects.map((subject) => (
                          <DisciplineTag
                            key={subject.id}
                            subjectId={subject.id}
                            name={subject.name}
                            className="text-xs"
                          />
                        ))}
                        {evaluation.subjects_count && evaluation.subjects_count > subjects.length && (
                          <Badge variant="outline" className="text-xs bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700">
                            +{evaluation.subjects_count - subjects.length} outras
                          </Badge>
                        )}
                      </>
                    );
                  }
                  return (
                    <Badge variant="outline" className="text-xs">
                      Não informado
                    </Badge>
                  );
                })()}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Série</label>
              <p className="text-sm dark:text-gray-300">{evaluation.grade?.name || 'Não informada'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Modelo</label>
              <p className="text-sm dark:text-gray-300">{evaluation.model || 'Não informado'}</p>
            </div>
            <div className="flex items-center gap-4 pt-2 border-t dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {new Date(evaluation.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {evaluation.createdBy?.name || 'Não informado'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Aplicação da {entityNameCapitalized}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status de Aplicação */}
            <div className="flex items-center gap-3 mb-4">
                             <Badge 
                 variant={isAppliedForDisplay ? "default" : "secondary"}
                 className={isAppliedForDisplay 
                   ? "bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800" 
                   : "bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800"
                 }
               >
                 {isAppliedForDisplay ? "✅ Aplicada" : "❌ Não aplicada"}
               </Badge>
              {evaluation.status && (
                <Badge variant="outline" className="text-xs">
                  Status: {formatStatusLabel(evaluation.status)}
                </Badge>
              )}
            </div>

            {/* Lista única de alunos da aplicação */}
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Aplicado para: {applicationStudents.length || totalStudents}</Badge>
                <Badge variant="outline" className="text-emerald-700 border-emerald-300">
                  Realizaram: {completedStudentsCount}
                </Badge>
                <Badge variant="outline" className="text-amber-700 border-amber-300">
                  Pendentes: {pendingStudentsCount}
                </Badge>
              </div>

              {loadingApplicationStudents ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="animate-spin">◌</span>
                  Carregando alunos da aplicação...
                </div>
              ) : applicationStudents.length > 0 ? (
                <div className="max-h-64 overflow-y-auto application-scroll pr-1 space-y-2">
                  {applicationStudents.map((student) => (
                    <div
                      key={student.id}
                      className="flex items-center justify-between gap-2 rounded-lg border bg-background/80 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{student.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[student.turma, student.escola].filter(Boolean).join(" · ") || "Sem turma/escola informada"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            student.status === 'realizado'
                              ? "text-emerald-700 border-emerald-300"
                              : "text-amber-700 border-amber-300"
                          }
                        >
                          {student.status === 'realizado' ? 'Realizou' : 'Pendente'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum aluno encontrado para esta aplicação.</p>
              )}
            </div>
            
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Municípios
              </label>
              <div className="max-h-32 overflow-y-auto application-scroll pr-1">
                {(evaluation.municipalities && evaluation.municipalities.length > 0) ? (
                  <ul className="space-y-1">
                    {evaluation.municipalities.map((m: Municipality, idx: number) => (
                      <li key={m.id || m.name || idx} className="text-sm bg-blue-50 dark:bg-blue-950/30 px-3 py-2 rounded border border-blue-200 dark:border-blue-800 flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="font-medium dark:text-gray-300">{m.name}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum município selecionado</p>
                )}
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Escolas
              </label>
              <div className="max-h-32 overflow-y-auto application-scroll pr-1">
                {(evaluation.schools && evaluation.schools.length > 0) ? (
                  <ul className="space-y-1">
                    {evaluation.schools.map((s: SchoolInfo, idx: number) => (
                      <li key={s.id || s.name || idx} className="text-sm bg-gray-50 dark:bg-muted/50 px-3 py-2 rounded border border-gray-200 dark:border-gray-800 flex items-center gap-2">
                        <School className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        <span className="font-medium dark:text-gray-300">{s.name}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma escola selecionada</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Questions by Subject */}
      <div className="space-y-8">
        {Object.keys(questionsBySubject).length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Questões da {entityNameCapitalized}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center py-12">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-gray-100 dark:bg-muted rounded-full flex items-center justify-center mx-auto">
                  <FileText className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Nenhuma questão encontrada
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Esta {entityName} ainda não possui questões cadastradas.
                  </p>
                  <Button onClick={handleEdit} variant="outline">
                    <Pencil className="h-4 w-4 mr-2" />
                    Adicionar Questões
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          Object.entries(questionsBySubject).map(([subjectId, subjectData]) => (
            <Card key={subjectId} className="overflow-hidden">
              <CardHeader
                className={`border-b dark:border-gray-800 bg-muted/30 dark:bg-muted/20 ${getSubjectColors(subjectData.subject.id, subjectData.subject.name).border} border-l-4 pl-3`}
              >
                <CardTitle className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${getSubjectColors(
                      subjectData.subject.id,
                      subjectData.subject.name
                    ).badge}`}
                  >
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">{subjectData.subject.name}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {subjectData.questions.length} questões cadastradas
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`border-transparent ${getSubjectColors(
                      subjectData.subject.id,
                      subjectData.subject.name
                    ).badge}`}
                  >
                    {subjectData.questions.length} questões
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-8">
                  {subjectData.questions.map((question, index) => {
                    const q = question as Question & { value?: number; solution?: string; skills?: string[]; secondStatement?: string; formattedSolution?: string; grade?: { id: string; name: string }; title?: string };
                    const opts = q.options || q.alternatives || [];
                    const previewQuestion: EvaluationQuestion = {
                      id: q.id,
                      title: q.title ?? `Questão ${index + 1}`,
                      text: q.text ?? '',
                      formattedText: q.formattedText ?? q.text ?? '',
                      secondStatement: q.secondStatement ?? '',
                      type: (q.type === 'multiple_choice' ? 'multipleChoice' : q.type === 'open' ? 'dissertativa' : q.type) as 'multipleChoice' | 'dissertativa' | 'trueFalse',
                      subjectId: q.subject?.id ?? '',
                      subject: q.subject ?? { id: '', name: '' },
                      grade: q.grade ?? { id: '', name: '' },
                      difficulty: String(q.difficulty ?? ''),
                      value: Number(q.value ?? (q as { points?: number }).points ?? 0),
                      solution: q.solution ?? '',
                      formattedSolution: q.formattedSolution ?? q.solution ?? '',
                      options: opts.map((opt: { id?: string; text: string; isCorrect?: boolean }, i: number) => ({
                        id: opt.id ?? String.fromCharCode(65 + i),
                        text: opt.text,
                        isCorrect: opt.isCorrect ?? false
                      })),
                      created_by: ''
                    };

                    return (
                    <div key={q.id} className="question-preview-content bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                      {/* Header da questão */}
                      <div className="bg-gradient-to-r from-gray-50 dark:from-muted/50 to-gray-100 dark:to-muted/70 border-b border-gray-200 dark:border-gray-800 p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-3">
                              Questão {index + 1}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {Array.isArray(q.skills) && q.skills.length > 0 && (
                                q.skills.map((skill, skillIndex) => {
                                  const skillCode = getSkillCode(skill);
                                  const skillDescription = getSkillDescription(skill);
                                  return (
                                    <div key={skillIndex} className="group relative">
                                      <Badge 
                                        variant="outline" 
                                          className={`text-xs border-transparent font-medium cursor-help ${getSubjectColors(
                                            subjectData.subject.id,
                                            subjectData.subject.name
                                          ).badge} transition-colors`}
                                        title={skillDescription || skillCode}
                                      >
                                        {skillCode}
                                        {skillDescription && (
                                            <span
                                              className={`ml-1 ${getSubjectColors(
                                                subjectData.subject.id,
                                                subjectData.subject.name
                                              ).accent} opacity-0 group-hover:opacity-100 transition-opacity`}
                                            >
                                              ℹ️
                                            </span>
                                        )}
                                      </Badge>
                                      {skillDescription && (
                                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10 bg-gray-900 dark:bg-gray-800 text-white dark:text-gray-100 text-xs rounded-lg p-3 max-w-xs shadow-lg border dark:border-gray-700">
                                            <div
                                              className={`font-bold ${getSubjectColors(
                                                subjectData.subject.id,
                                                subjectData.subject.name
                                              ).accent} mb-1`}
                                            >
                                              {skillCode}
                                            </div>
                                          <div className="leading-relaxed">{skillDescription}</div>
                                          <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-800"></div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Conteúdo da questão — mesmo layout da aplicação da prova */}
                      <div className="p-6 space-y-6">
                        <QuestionPreview question={previewQuestion} hideHeader />

                        {/* Metadados da questão */}
                        <div className="bg-gray-50 dark:bg-muted/50 rounded-lg p-4 border-t border-gray-200 dark:border-gray-800">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${getSubjectColors(
                                  subjectData.subject.id,
                                  subjectData.subject.name
                                ).badge}`}
                              ></span>
                              <span className="font-medium text-gray-600 dark:text-gray-400">Dificuldade:</span> 
                              <span className="text-gray-700 dark:text-gray-300">{q.difficulty}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 bg-green-400 dark:bg-green-500 rounded-full"></span>
                              <span className="font-medium text-gray-600 dark:text-gray-400">Valor:</span> 
                              <span className="text-gray-700 dark:text-gray-300">{q.value || q.points || 0} pontos</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 bg-purple-400 dark:bg-purple-500 rounded-full"></span>
                              <span className="font-medium text-gray-600 dark:text-gray-400">Habilidades:</span> 
                              <span className="text-gray-700 dark:text-gray-300">
                                {Array.isArray(q.skills) && q.skills.length > 0
                                  ? `${q.skills.length} habilidade${q.skills.length > 1 ? 's' : ''}`
                                  : 'Nenhuma habilidade definida'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Modal de Aplicar {entityNameCapitalized} */}
      <StartEvaluationModal
        isOpen={showStartEvaluationModal}
        onClose={() => setShowStartEvaluationModal(false)}
        onConfirm={handleConfirmStartEvaluation}
        evaluation={evaluation}
      />

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a {entityName} "{evaluation?.title}"?
              Esta ação não pode ser desfeita e todas as questões associadas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 