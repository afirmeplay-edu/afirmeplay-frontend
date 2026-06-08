import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Loader2, Users, GraduationCap, Trash2, Plus, Eye, EyeOff, UserPlus, CheckCircle2, AlertCircle, Upload, ArrowLeftRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LinkTeacherModal } from "./LinkTeacherModal";
import { LinkStudentModal } from "./LinkStudentModal";
import { BulkCreateStudentsByListModal } from "./BulkCreateStudentsByListModal";
import { TransferStudentModal } from "./TransferStudentModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useEmailCheck, generatePasswordFromName } from "@/hooks/useEmailCheck";
interface Teacher {
  id: string;
  name: string;
  email: string;
  registration?: string;
  role?: string;
  class_id?: string;
  vinculo_id?: string;
}

interface Student {
  id: string;
  name: string;
  email?: string;
  registration?: string;
  user?: {
    email: string;
  };
  class_id?: string;
}

interface EducationStage {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface GradeObject {
  id: string;
  name: string;
  education_stage: EducationStage;
}

interface ApiResponse<T = unknown> {
  data: T;
  [key: string]: unknown;
}

interface ApiError {
  response?: {
    data?: {
      error?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface ClassData {
  id: string;
  name: string;
  school_id?: string;
  grade?: string | GradeObject;
  grade_id?: string;
}

interface ManageClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolId: string;
  schoolName?: string;
  classData: ClassData;
  onSuccess: () => void;
  /** ID do município da escola (obrigatório para admin/tecadm criarem professor já na escola) */
  schoolCityId?: string;
}

export function ManageClassModal({
  isOpen,
  onClose,
  schoolId,
  schoolName,
  classData,
  onSuccess,
  schoolCityId,
}: ManageClassModalProps) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [showLinkTeacherModal, setShowLinkTeacherModal] = useState(false);
  const [showLinkStudentModal, setShowLinkStudentModal] = useState(false);
  const [showBulkStudentsModal, setShowBulkStudentsModal] = useState(false);
  const [transferStudent, setTransferStudent] = useState<Student | null>(null);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [viewingTeacher, setViewingTeacher] = useState<Teacher | null>(null);
  const [activeTab, setActiveTab] = useState("manage");
  const [isCreating, setIsCreating] = useState(false);
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    registration: "",
    birth_date: ""
  });
  const { toast } = useToast();

  // Função para buscar professores e alunos da turma
  const fetchClassData = useCallback(async () => {
    setIsLoading(true);
    try {
             // Buscar professores da turma
       let teachersData = [];
       try {
         const teachersResponse = await api.get<ApiResponse>(`/classes/${classData.id}/teachers`);
                 if (teachersResponse.data && typeof teachersResponse.data === 'object' && 'professores' in teachersResponse.data) {
          const professores = (teachersResponse.data as Record<string, unknown>).professores;
          teachersData = Array.isArray(professores) ? professores : [];
        } else if (Array.isArray(teachersResponse.data)) {
          teachersData = teachersResponse.data;
        }
       } catch (error) {
         console.error("Erro ao buscar professores da turma:", error);
         // Fallback: tentar buscar professores da escola
         try {
           const fallbackResponse = await api.get<ApiResponse>(`/teacher/school/${schoolId}`);
                     if (fallbackResponse.data && typeof fallbackResponse.data === 'object' && 'professores' in fallbackResponse.data) {
            const professores = (fallbackResponse.data as Record<string, unknown>).professores;
            teachersData = Array.isArray(professores) ? professores : [];
          } else if (Array.isArray(fallbackResponse.data)) {
            teachersData = fallbackResponse.data;
          }
         } catch (fallbackError) {
           console.error("Erro no fallback de busca de professores:", fallbackError);
           teachersData = [];
         }
       }
      
                           const classTeachers = teachersData.map((teacher: Record<string, unknown>) => {
          const t = teacher as Record<string, Record<string, unknown> | unknown>;
          return {
            id: String((t.professor as Record<string, unknown>)?.id || (t.usuario as Record<string, unknown>)?.id || t.id || ''),
            name: String((t.professor as Record<string, unknown>)?.name || (t.usuario as Record<string, unknown>)?.name || t.name || 'Nome não informado'),
            email: String((t.professor as Record<string, unknown>)?.email || (t.usuario as Record<string, unknown>)?.email || t.email || 'Email não informado'),
            vinculo_id: String((t.teacher_class as Record<string, unknown>)?.id || (t.vinculo_turma as Record<string, unknown>)?.teacher_class_id || t.vinculo_id || '')
          };
        });
      
      setTeachers(classTeachers);
      
             // Buscar alunos da turma
       let studentsData = [];
       try {
         const studentsResponse = await api.get<ApiResponse>(`/students/classes/${classData.id}`);
         if (Array.isArray(studentsResponse.data)) {
           studentsData = studentsResponse.data;
                 } else if (studentsResponse.data && typeof studentsResponse.data === 'object' && 'alunos' in studentsResponse.data) {
          const alunos = (studentsResponse.data as Record<string, unknown>).alunos;
          studentsData = Array.isArray(alunos) ? alunos : [];
        }
       } catch (error) {
         // Fallback: tentar buscar por escola
         try {
           const fallbackResponse = await api.get<ApiResponse>(`/students/school/${schoolId}/class/${classData.id}`);
           studentsData = Array.isArray(fallbackResponse.data) ? fallbackResponse.data : [];
         } catch (fallbackError) {
           console.error("Erro no fallback de busca de alunos:", fallbackError);
           studentsData = [];
         }
       }
      
             const classStudents = studentsData.map((student: Record<string, unknown>) => {
         const s = student as Record<string, Record<string, unknown> | unknown>;
         return {
           id: String(s.id || ''),
           name: String(s.name || (s.usuario as Record<string, unknown>)?.name || 'Nome não informado'),
           email: String(s.email || (s.user as Record<string, unknown>)?.email || (s.usuario as Record<string, unknown>)?.email || 'Email não informado'),
           registration: String(s.registration || '')
         };
       });
      
      setStudents(classStudents);
    } catch (error) {
      console.error("Erro ao carregar dados da turma:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados da turma",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [classData.id, schoolId, toast]);

  // Buscar professores e alunos da turma
  useEffect(() => {
    if (!isOpen) return;
    fetchClassData();
  }, [isOpen, fetchClassData]);

  useEffect(() => {
    if (!isOpen) setStudentSearchQuery("");
  }, [isOpen]);

  const filteredStudents = useMemo(() => {
    const q = studentSearchQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const name = String(s.name ?? "").toLowerCase();
      const email = String(s.email ?? s.user?.email ?? "").toLowerCase();
      const reg = String(s.registration ?? "").toLowerCase();
      return name.includes(q) || email.includes(q) || reg.includes(q);
    });
  }, [students, studentSearchQuery]);

  const handleRemoveTeacher = async (teacherId: string) => {
    setIsRemoving(`teacher-${teacherId}`);
    try {
      const teacher = teachers.find(t => t.id === teacherId);
      
      if (teacher?.vinculo_id) {
        await api.delete(`/teacher-class/${teacher.vinculo_id}`);
      }
      
      setTeachers(prevState => prevState.filter(t => t.id !== teacherId));
      
      toast({
        title: "Sucesso",
        description: "Professor removido com sucesso!",
      });
      
      await fetchClassData();
    } catch (error) {
      console.error("Erro ao remover professor:", error);
      toast({
        title: "Erro",
        description: "Erro ao remover professor da turma",
        variant: "destructive",
      });
    } finally {
      setIsRemoving(null);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    setIsRemoving(`student-${studentId}`);
    try {
      await api.put(`/classes/${classData.id}/remove_student`, {
        student_id: studentId
      });
      
      toast({
        title: "Sucesso",
        description: "Aluno removido com sucesso!",
      });
      
      await fetchClassData();
    } catch (error) {
      console.error("Erro ao remover aluno:", error);
      toast({
        title: "Erro",
        description: "Erro ao remover aluno da turma",
        variant: "destructive",
      });
    } finally {
      setIsRemoving(null);
    }
  };



  const handleCreateStudent = async () => {
    if (!formData.name || !formData.email || !formData.password || !formData.birth_date) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const gradeId =
        classData.grade_id ||
        (typeof classData.grade === "object" && classData.grade !== null ? classData.grade.id : undefined);

      if (!gradeId) {
        toast({
          title: "Erro",
          description: "Não foi possível identificar a série da turma. Tente novamente mais tarde.",
          variant: "destructive",
        });
        setIsCreating(false);
        return;
      }

      const studentData = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        registration: formData.registration || undefined,
        birth_date: formData.birth_date,
        class_id: classData.id,
        grade_id: gradeId
      };

      const response = await api.post("/students", studentData);

      toast({
        title: "Sucesso",
        description: "Aluno criado e vinculado à turma com sucesso!",
      });

      // Limpar formulário
      setFormData({
        name: "",
        email: "",
        password: "",
        registration: "",
        birth_date: ""
      });

      // Recarregar dados da turma
      await fetchClassData();
    } catch (error: unknown) {
      console.error("Erro ao criar aluno:", error);
      const errorMessage = (error as ApiError)?.response?.data?.error || "Erro ao criar aluno";
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prevState => ({
      ...prevState,
      [field]: value
    }));
  };

  const { checkedEmail, isChecking, isAvailable } = useEmailCheck(formData.name);

  // Sincronizar email verificado com formData
  useEffect(() => {
    if (checkedEmail) {
      setFormData(prev => ({ ...prev, email: checkedEmail }));
    }
  }, [checkedEmail]);

  // Atualizar nome e senha quando o nome mudar (email é gerenciado pelo hook)
  const handleNameChange = (value: string) => {
    setFormData(prevState => ({
      ...prevState,
      name: value,
      password: generatePasswordFromName(value)
    }));
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setFormData({
        name: "",
        email: "",
        password: "",
        registration: "",
        birth_date: ""
      });
      onClose();
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="w-[95vw] max-w-7xl h-[95vh] max-h-[95vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-4 sm:px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950/40 dark:via-sky-950/30 dark:to-emerald-950/25">
            <DialogTitle className="font-semibold tracking-tight flex flex-col sm:flex-row sm:items-center gap-2 text-lg sm:text-xl text-foreground">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
                <span className="font-semibold">Gerenciar Turma</span>
              </div>
              <span className="text-base sm:text-lg font-medium text-blue-700 dark:text-blue-300 sm:ml-2">
                {classData.name}
              </span>
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm sm:text-base text-muted-foreground mt-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <span>Visualize e gerencie professores e alunos da turma</span>
                {classData.grade && (
                  <span className="flex items-center gap-1">
                    <span className="hidden sm:inline">•</span>
                    <span className="text-xs sm:text-sm bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 px-2 py-1 rounded-full font-medium">
                      Série: {typeof classData.grade === 'object' && classData.grade !== null ? (classData.grade as GradeObject).name : String(classData.grade)}
                    </span>
                  </span>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden px-4 sm:px-6 min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-2 gap-1 sm:gap-0 h-auto sm:h-10 p-1 bg-muted/60 rounded-lg my-4">
                <TabsTrigger 
                  value="manage" 
                  className="text-xs sm:text-sm py-2 sm:py-1.5 px-2 sm:px-3 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-border rounded-md transition-all"
                >
                  <Users className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden xs:inline">Gerenciar</span>
                  <span className="xs:hidden">Gerenciar</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="create-student" 
                  className="text-xs sm:text-sm py-2 sm:py-1.5 px-2 sm:px-3 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-border rounded-md transition-all"
                >
                  <UserPlus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden xs:inline">Novo Aluno</span>
                  <span className="xs:hidden">Aluno</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="manage" className="flex-1 flex flex-col mt-0 overflow-hidden data-[state=inactive]:hidden">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center p-8 h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                    <span className="text-sm sm:text-base text-muted-foreground">Carregando dados da turma...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 h-full overflow-y-auto pr-2 pb-4 scroll-smooth scrollbar-thin scrollbar-thumb-blue-300 dark:scrollbar-thumb-blue-700 scrollbar-track-transparent">
                    {/* Teachers Section */}
                    <div className="flex flex-col min-h-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                        <h3 className="font-semibold text-base sm:text-lg flex items-center gap-2 text-foreground">
                          <GraduationCap className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
                          <span>Professores</span>
                          <Badge variant="secondary" className="text-xs px-2 py-0.5">
                            {teachers.length}
                          </Badge>
                        </h3>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowLinkTeacherModal(true)}
                          className="w-full sm:w-auto text-xs sm:text-sm"
                        >
                          <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                          Vincular Professor
                        </Button>
                      </div>

                      <div className="border rounded-lg flex-1 overflow-hidden bg-card border-border">
                        {teachers.length === 0 ? (
                          <div className="flex flex-col items-center justify-center p-6 sm:p-8 h-full min-h-[200px]">
                            <div className="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-full mb-4">
                              <GraduationCap className="h-6 w-6 sm:h-8 sm:w-8 text-blue-400 dark:text-blue-300" />
                            </div>
                            <p className="text-sm sm:text-base text-muted-foreground text-center">
                              Nenhum professor vinculado
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground/80 text-center mt-1">
                              Clique em "Vincular Professor" para vincular
                            </p>
                          </div>
                        ) : (
                          <div className="p-3 sm:p-4 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-blue-300 dark:scrollbar-thumb-blue-700 scrollbar-track-transparent scroll-smooth">
                            <div className="space-y-2 sm:space-y-3">
                              {teachers.map((teacher) => (
                                <div
                                  key={teacher.id}
                                  className="flex items-center gap-3 p-3 sm:p-4 border rounded-lg hover:bg-muted transition-colors border-border"
                                >
                                  <div className="flex-shrink-0">
                                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 dark:bg-blue-950/30 rounded-full flex items-center justify-center">
                                      <GraduationCap className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-300" />
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm sm:text-base truncate text-foreground">
                                      {teacher.name}
                                    </div>
                                    <div className="text-xs sm:text-sm text-muted-foreground truncate">
                                      {teacher.email}
                                    </div>
                                  </div>
                                  <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 sm:h-8 sm:w-8 p-0 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                                      onClick={() => setViewingTeacher(teacher)}
                                    >
                                      <Eye className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600 dark:text-blue-300" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 sm:h-8 sm:w-8 p-0 hover:bg-red-50 dark:hover:bg-red-950/30"
                                      onClick={() => handleRemoveTeacher(teacher.id)}
                                      disabled={isRemoving === `teacher-${teacher.id}`}
                                    >
                                      {isRemoving === `teacher-${teacher.id}` ? (
                                        <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin text-red-600" />
                                      ) : (
                                        <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 text-red-600" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Students Section */}
                    <div className="flex flex-col min-h-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                        <h3 className="font-semibold text-base sm:text-lg flex items-center gap-2 text-foreground">
                          <Users className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
                          <span>Alunos</span>
                          <Badge variant="secondary" className="text-xs px-2 py-0.5">
                            {students.length}
                          </Badge>
                        </h3>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowLinkStudentModal(true)}
                          className="w-full sm:w-auto text-xs sm:text-sm"
                        >
                          <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                          Vincular Aluno
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowBulkStudentsModal(true)}
                          className="w-full sm:w-auto text-xs sm:text-sm"
                        >
                          <Upload className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                          Alunos em lote
                        </Button>
                      </div>

                      {students.length > 0 && (
                        <div className="relative mb-3">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                          <Input
                            id="student-search"
                            type="search"
                            placeholder="Pesquisar por nome, e-mail ou matrícula…"
                            value={studentSearchQuery}
                            onChange={(e) => setStudentSearchQuery(e.target.value)}
                            className="h-10 pl-9"
                            autoComplete="off"
                            aria-label="Pesquisar aluno na turma"
                          />
                          {studentSearchQuery.trim() !== "" && (
                            <p className="text-xs text-muted-foreground mt-1.5">
                              Mostrando {filteredStudents.length} de {students.length} aluno
                              {students.length === 1 ? "" : "s"}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="border rounded-lg flex-1 overflow-hidden bg-card border-border">
                        {students.length === 0 ? (
                          <div className="flex flex-col items-center justify-center p-6 sm:p-8 h-full min-h-[200px]">
                            <div className="bg-green-50 dark:bg-green-950/40 p-4 rounded-full mb-4">
                              <Users className="h-6 w-6 sm:h-8 sm:w-8 text-green-400 dark:text-green-300" />
                            </div>
                            <p className="text-sm sm:text-base text-muted-foreground text-center">
                              Nenhum aluno vinculado
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground/80 text-center mt-1">
                              Clique em "Vincular Aluno" para vincular
                            </p>
                          </div>
                        ) : filteredStudents.length === 0 ? (
                          <div className="flex flex-col items-center justify-center p-6 sm:p-8 h-full min-h-[160px]">
                            <p className="text-sm text-muted-foreground text-center">
                              Nenhum aluno corresponde à pesquisa.
                            </p>
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="text-xs mt-1"
                              onClick={() => setStudentSearchQuery("")}
                            >
                              Limpar pesquisa
                            </Button>
                          </div>
                        ) : (
                          <div className="p-3 sm:p-4 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-green-300 dark:scrollbar-thumb-green-700 scrollbar-track-transparent scroll-smooth">
                            <div className="space-y-2 sm:space-y-3">
                              {filteredStudents.map((student) => (
                                <div
                                  key={student.id}
                                  className="flex items-center gap-3 p-3 sm:p-4 border rounded-lg hover:bg-muted transition-colors border-border"
                                >
                                  <div className="flex-shrink-0">
                                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 dark:bg-green-950/30 rounded-full flex items-center justify-center">
                                      <Users className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-300" />
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-medium text-sm sm:text-base truncate text-foreground min-w-0">
                                        {student.name}
                                      </span>
                                      {schoolCityId ? (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 shrink-0 text-xs px-2"
                                          onClick={() => setTransferStudent(student)}
                                        >
                                          <ArrowLeftRight className="h-3 w-3 mr-1" />
                                          Transferir
                                        </Button>
                                      ) : null}
                                    </div>
                                    <div className="text-xs sm:text-sm text-muted-foreground truncate mt-0.5">
                                      {student.email || student.user?.email}
                                    </div>
                                  </div>
                                  <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 sm:h-8 sm:w-8 p-0 hover:bg-green-50 dark:hover:bg-green-950/30"
                                      onClick={() => setViewingStudent(student)}
                                    >
                                      <Eye className="h-3 w-3 sm:h-4 sm:w-4 text-green-600 dark:text-green-300" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 sm:h-8 sm:w-8 p-0 hover:bg-red-50 dark:hover:bg-red-950/30"
                                      onClick={() => handleRemoveStudent(student.id)}
                                      disabled={isRemoving === `student-${student.id}`}
                                    >
                                      {isRemoving === `student-${student.id}` ? (
                                        <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin text-red-600" />
                                      ) : (
                                        <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 text-red-600" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="create-student" className="flex-1 flex flex-col mt-0 overflow-hidden min-h-0 data-[state=inactive]:hidden">
                <div className="flex-1 overflow-y-auto border border-border rounded-lg bg-card p-4 sm:p-5 scrollbar-thin scrollbar-thumb-green-300 dark:scrollbar-thumb-green-700 scrollbar-track-transparent">
                  <p className="text-sm text-muted-foreground mb-4">
                    E-mail e senha são gerados automaticamente a partir do nome.
                    {!isChecking && isAvailable === false && (
                      <span className="text-amber-600 ml-1">Email original em uso — usando sugestão disponível.</span>
                    )}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="student-name" className="text-sm font-medium text-foreground">Nome Completo *</Label>
                      <Input
                        id="student-name"
                        placeholder="Digite o nome completo do aluno"
                        className="h-11 border-input bg-background focus:ring-2 focus:ring-green-500"
                        value={formData.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="student-email" className="text-sm font-medium text-foreground">E-mail (Gerado automaticamente)</Label>
                      <div className="relative">
                        <Input
                          id="student-email"
                          readOnly
                          className="h-11 bg-muted border-border font-mono text-sm cursor-not-allowed pr-8"
                          value={formData.email}
                          placeholder="Será gerado ao digitar o nome"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          {isChecking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                          {!isChecking && isAvailable === true && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                          {!isChecking && isAvailable === false && <AlertCircle className="h-4 w-4 text-amber-500" />}
                        </div>
                      </div>
                      {!isChecking && isAvailable === false && (
                        <p className="text-xs text-amber-600">E-mail original em uso. Usando sugestão disponível.</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="student-password" className="text-sm font-medium text-foreground">Senha (Gerada automaticamente)</Label>
                      <div className="relative">
                        <Input
                          id="student-password"
                          type={showStudentPassword ? "text" : "password"}
                          readOnly
                          className="h-11 bg-muted border-border font-mono text-sm cursor-not-allowed pr-10"
                          value={formData.password}
                          placeholder="Será gerada ao digitar o nome"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowStudentPassword(!showStudentPassword)}
                          aria-label={showStudentPassword ? "Ocultar senha" : "Ver senha"}
                        >
                          {showStudentPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="student-registration" className="text-sm font-medium text-foreground">Matrícula (Opcional)</Label>
                      <Input
                        id="student-registration"
                        placeholder="Número de matrícula"
                        className="h-11 border-input bg-background focus:ring-2 focus:ring-green-500"
                        value={formData.registration}
                        onChange={(e) => handleInputChange('registration', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="student-birthdate" className="text-sm font-medium text-foreground">Data de Nascimento *</Label>
                      <Input
                        id="student-birthdate"
                        type="date"
                        className="h-11 border-input bg-background focus:ring-2 focus:ring-green-500"
                        value={formData.birth_date}
                        onChange={(e) => handleInputChange('birth_date', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 pt-4 border-t bg-gray-50/50 dark:bg-muted px-4 py-3 rounded-b-lg">
                  <div className="text-xs sm:text-sm text-muted-foreground order-2 sm:order-1">
                    Novo aluno
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 order-1 sm:order-2">
                    <Button variant="outline" onClick={onClose} disabled={isCreating} className="h-10 order-2 sm:order-1">
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleCreateStudent}
                      disabled={isCreating || !formData.name.trim() || !formData.birth_date}
                      className="h-10 order-1 sm:order-2 bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-400"
                    >
                      {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                      Criar Aluno
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="px-4 sm:px-6 py-4 border-t bg-gray-50/50 dark:bg-muted">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="w-full sm:w-auto h-10"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Informações do Aluno */}
      <Dialog open={!!viewingStudent} onOpenChange={(open) => !open && setViewingStudent(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
                <Users className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              Informações do aluno
            </DialogTitle>
            <DialogDescription>
              Dados cadastrais do aluno na turma
            </DialogDescription>
          </DialogHeader>
          {viewingStudent && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Nome completo</p>
                <p className="text-base font-medium text-foreground">{viewingStudent.name}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">E-mail</p>
                <p className="text-base text-foreground">{viewingStudent.email || viewingStudent.user?.email || "—"}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Matrícula</p>
                <p className="text-base text-foreground">{viewingStudent.registration || "—"}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Informações do Professor */}
      <Dialog open={!!viewingTeacher} onOpenChange={(open) => !open && setViewingTeacher(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                <GraduationCap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              Informações do professor
            </DialogTitle>
            <DialogDescription>
              Dados cadastrais do professor na turma
            </DialogDescription>
          </DialogHeader>
          {viewingTeacher && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Nome completo</p>
                <p className="text-base font-medium text-foreground">{viewingTeacher.name}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">E-mail</p>
                <p className="text-base text-foreground">{viewingTeacher.email || "—"}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Matrícula</p>
                <p className="text-base text-foreground">{viewingTeacher.registration || "—"}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Link Teacher Modal */}
      <LinkTeacherModal
        isOpen={showLinkTeacherModal}
        onClose={() => setShowLinkTeacherModal(false)}
        schoolId={schoolId}
        classId={classData.id}
        className={classData.name}
        onSuccess={fetchClassData}
        schoolCityId={schoolCityId}
      />

      {/* Link Student Modal */}
      <LinkStudentModal
        isOpen={showLinkStudentModal}
        onClose={() => setShowLinkStudentModal(false)}
        schoolId={schoolId}
        classId={classData.id}
        className={classData.name}
        onSuccess={fetchClassData}
      />

      {/* Bulk Students by List Modal (fixed class context) */}
      <BulkCreateStudentsByListModal
        isOpen={showBulkStudentsModal}
        onClose={() => setShowBulkStudentsModal(false)}
        schoolName={schoolName || "Escola selecionada"}
        classId={classData.id}
        className={classData.name}
        gradeId={
          classData.grade_id ||
          (typeof classData.grade === "object" && classData.grade !== null
            ? (classData.grade as GradeObject).id
            : undefined)
        }
        gradeName={
          typeof classData.grade === "object" && classData.grade !== null
            ? (classData.grade as GradeObject).name
            : String(classData.grade || "")
        }
        onSuccess={fetchClassData}
      />

      {schoolCityId ? (
        <TransferStudentModal
          open={!!transferStudent}
          onOpenChange={(open) => {
            if (!open) setTransferStudent(null);
          }}
          municipalityId={schoolCityId}
          sourceClassId={classData.id}
          sourceClassName={classData.name}
          student={
            transferStudent
              ? { id: transferStudent.id, name: transferStudent.name }
              : null
          }
          onSuccess={async () => {
            await fetchClassData();
            onSuccess();
          }}
        />
      ) : null}
    </>
  );
}
