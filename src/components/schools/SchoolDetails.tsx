import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/authContext";
import { UserPlus, Eye, Pencil, Trash2, Edit, Loader2, ArrowLeft, Building, Users, GraduationCap, MapPin, Globe, BookOpen, MoveRight, Link2, KeyRound, Clock, MoreHorizontal } from "lucide-react";
import { CreateClassForm } from "./CreateClassForm";
import { LinkTeacherModal } from "./LinkTeacherModal";
import { ManageClassModal } from "./ManageClassModal";
import { ClassShiftBadge } from "./ClassShiftBadge";
import { EditClassShiftDialog } from "./EditClassShiftDialog";
import type { ClassShiftCanonical } from "@/lib/classShift";
import { schoolAreaTypeLabel } from "@/lib/schoolAreaType";
import { LinkDirectorCoordinatorModal } from "./LinkDirectorCoordinatorModal";
import { ManageSchoolLinksModal } from "./ManageSchoolLinksModal";
import { BulkUploadStudentsModal } from "./BulkUploadStudentsModal";
import { BulkManageTeachersModal, type BulkTeachersModalInitialEntry } from "./BulkManageTeachersModal";
import { BulkCreateCoordinatorsModal } from "./BulkCreateCoordinatorsModal";
import { PasswordReportModal } from "./PasswordReportModal";
import { SchoolCoursesTab } from "./SchoolCoursesTab";
import { InstituicaoDisciplinasTab } from "./InstituicaoDisciplinasTab";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { api } from "@/lib/api";
import SchoolForm from "./SchoolForm";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SCHOOL_TABS = ["overview", "classes", "courses", "disciplinas"] as const;
type SchoolTab = (typeof SCHOOL_TABS)[number];

function isSchoolTab(value: string | null): value is SchoolTab {
  return !!value && (SCHOOL_TABS as readonly string[]).includes(value);
}

interface City {
  id: string;
  name: string;
  state: string;
  created_at: string;
}

interface School {
  id: string;
  name: string;
  city_id: string;
  address: string;
  domain: string;
  area_type?: string | null;
  created_at: string;
  city: City;
}

interface Class {
  id: string;
  name: string;
  shift?: string | null;
  grade?: string | { id: string; name: string; education_stage: any };
  teachers?: Teacher[];
  students?: Student[];
}

interface Teacher {
  id: string;
  name: string;
  email: string;
  registration?: string;
  birth_date?: string;
  role?: string;
  class_id?: string;
  user_id?: string;
}

interface Student {
  id: string;
  name: string;
  email?: string;
  registration?: string;
  birth_date?: string;
  user?: {
    email: string;
  };
  class_id?: string;
}

/** Ordena turmas: primeiro pelo número da série (1º, 2º…), depois pelo nome da turma (A, B, C). */
function getClassGradeSortNumber(cls: Class): number {
  const grade = cls.grade;
  const label =
    typeof grade === "object" && grade !== null
      ? String((grade as { name?: string }).name ?? "")
      : String(grade ?? "");
  const m = label.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return Number.MAX_SAFE_INTEGER;
}

function compareClassesForDisplay(a: Class, b: Class): number {
  const byGrade = getClassGradeSortNumber(a) - getClassGradeSortNumber(b);
  if (byGrade !== 0) return byGrade;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

/** Caixa alta só na interface (não altera dados vindos da API). */
function upperDisplay(value: string | undefined | null): string {
  return String(value ?? "").toUpperCase();
}

export default function SchoolDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [school, setSchool] = useState<School | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [directors, setDirectors] = useState<Teacher[]>([]);
  const [coordinators, setCoordinators] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isLoadingSchool, setIsLoadingSchool] = useState(true);
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(false);
  const [selectedDirectors, setSelectedDirectors] = useState<string[]>([]);
  const [selectedCoordinators, setSelectedCoordinators] = useState<string[]>([]);
  const activeTab: SchoolTab = useMemo(() => {
    const tab = searchParams.get("tab");
    return isSchoolTab(tab) ? tab : "overview";
  }, [searchParams]);
  const setActiveTab = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams);
      if (value === "overview") {
        next.delete("tab");
      } else {
        next.set("tab", value);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );
  const [showManageClassModal, setShowManageClassModal] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [shiftEditClass, setShiftEditClass] = useState<Class | null>(null);
  const [classTeachers, setClassTeachers] = useState<{[key: string]: Teacher[]}>({});
  const [classStudents, setClassStudents] = useState<{[key: string]: Student[]}>({});
  const [showLinkDirectorModal, setShowLinkDirectorModal] = useState(false);
  const [showLinkCoordinatorModal, setShowLinkCoordinatorModal] = useState(false);
  const [showBulkCoordinatorModal, setShowBulkCoordinatorModal] = useState(false);
  const [showManageSchoolLinksModal, setShowManageSchoolLinksModal] = useState(false);
  const [showLinkTeacherModal, setShowLinkTeacherModal] = useState(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [showBulkTeachersModal, setShowBulkTeachersModal] = useState(false);
  const [bulkTeachersModalEntry, setBulkTeachersModalEntry] =
    useState<BulkTeachersModalInitialEntry>("import");
  const [showPasswordReportModal, setShowPasswordReportModal] = useState(false);
  const [currentTeacherUserId, setCurrentTeacherUserId] = useState<string | null>(null);
  const [showStudentsDialog, setShowStudentsDialog] = useState(false);
  const [studentsDialogClass, setStudentsDialogClass] = useState<Class | null>(null);
  
  // Estados para gerenciamento de turmas
  const [showDeleteClassDialog, setShowDeleteClassDialog] = useState(false);
  const [showMoveClassDialog, setShowMoveClassDialog] = useState(false);
  const [classToDelete, setClassToDelete] = useState<Class | null>(null);
  const [classToMove, setClassToMove] = useState<Class | null>(null);
  const [targetSchoolId, setTargetSchoolId] = useState<string>("");
  const [availableSchools, setAvailableSchools] = useState<School[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  // Lista única de séries (grade_id + nome) a partir das turmas da escola, para o template de importação
  const schoolGrades = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    for (const c of classes) {
      if (!c.grade) continue;
      const id = typeof c.grade === "object" && c.grade !== null ? (c.grade as { id: string }).id : undefined;
      const name = typeof c.grade === "object" && c.grade !== null ? (c.grade as { name: string }).name : String(c.grade);
      if (id && !seen.has(id)) {
        seen.add(id);
        list.push({ id, name });
      }
    }
    return list;
  }, [classes]);

  const sortedClasses = useMemo(() => [...classes].sort(compareClassesForDisplay), [classes]);

  useEffect(() => {
    const fetchSchool = async () => {
      if (!id) return;
      setIsLoadingSchool(true);
      try {
        const response = await api.get(`/school/${id}`);
        setSchool(response.data);
      } catch (error) {
        toast({
          title: "Erro",
          description: user.role === 'professor' 
            ? "Você não tem acesso a esta instituição ou ela não existe" 
            : "Escola não encontrada",
          variant: "destructive",
        });
        navigate("/app/cadastros/gestao");
      } finally {
        setIsLoadingSchool(false);
      }
    };

    fetchSchool();
  }, [id, navigate, toast]);

  // Para professor: descobrir teacher.user_id via /school-teacher e comparar com user.id
  useEffect(() => {
    const fetchCurrentTeacherUserId = async () => {
      if (!user?.id) return;
      if (String(user.role).toLowerCase() !== "professor") {
        setCurrentTeacherUserId(null);
        return;
      }

      try {
        const resp = await api.get("/school-teacher");
        const vinculos = resp.data?.vinculos ?? resp.data?.data ?? resp.data ?? [];
        const list: any[] = Array.isArray(vinculos) ? vinculos : [];

        // Pode vir como vinculo.professor (teacher) ou vinculo.teacher/professor
        const found = list.find((v) => v?.professor?.user_id === user.id || v?.teacher?.user_id === user.id);
        const userIdCandidate: unknown = found?.professor?.user_id ?? found?.teacher?.user_id;
        setCurrentTeacherUserId(userIdCandidate ? String(userIdCandidate) : null);
      } catch {
        setCurrentTeacherUserId(null);
      }
    };

    fetchCurrentTeacherUserId();
  }, [user?.id, user.role]);

  const canManageSchool =
    user.role === "admin" ||
    user.role === "tecadm" ||
    user.role === "diretor" ||
    user.role === "coordenador";

  const canManageClasses = canManageSchool;

  const canBulkCoordinators = user.role === "admin" || user.role === "tecadm";

  const handleClassShiftSaved = (classId: string, shift: ClassShiftCanonical | null) => {
    setClasses((prev) =>
      prev.map((c) => (c.id === classId ? { ...c, shift } : c))
    );
    setSelectedClass((prev) =>
      prev?.id === classId ? { ...prev, shift } : prev
    );
  };

  // Carregar turmas da escola
  useEffect(() => {
    const fetchClasses = async () => {
      if (!id) return;
      
      setIsLoadingClasses(true);
      try {
        const response = await api.get(`/classes/school/${id}`);
        const classesData = response.data || [];
        setClasses(classesData);
        
        // Buscar professores e alunos de cada turma
        if (classesData.length > 0) {
          await fetchClassDetails(classesData);
        }
      } catch (error) {
        setClasses([]);
      } finally {
        setIsLoadingClasses(false);
      }
    };

    fetchClasses();
  }, [id]);

  // Função para buscar detalhes de professores e alunos de cada turma
  const fetchClassDetails = async (classesData: Class[]) => {
    const teachersData: {[key: string]: Teacher[]} = {};
    const studentsData: {[key: string]: Student[]} = {};

    try {
      // Buscar dados de todas as turmas em paralelo
      const promises = classesData.map(async (classItem) => {
        try {
          // Buscar professores da turma
          const teachersResponse = await api.get(`/classes/${classItem.id}/teachers`);
          let classTeachers = [];
          
          if (teachersResponse.data && teachersResponse.data.professores) {
            classTeachers = teachersResponse.data.professores.map((item: any) => ({
              // id é usado como key local, mas guardamos user_id separado para comparação
              id: item.professor?.id || item.usuario?.id,
              name: item.professor?.name || item.usuario?.name,
              email: item.professor?.email || item.usuario?.email,
              registration: item.professor?.registration || item.usuario?.registration,
              role: item.usuario?.role || 'professor',
              class_id: classItem.id,
              user_id: item.usuario?.id,
              vinculo_id: item.teacher_class?.id || item.vinculo_turma?.teacher_class_id
            }));
          }
          
          // Buscar alunos da turma
          const studentsResponse = await api.get(`/students/classes/${classItem.id}`);
          const classStudents = Array.isArray(studentsResponse.data) ? studentsResponse.data.map((student: any) => ({
            id: student.id,
            name: student.name,
            email: student.email || student.user?.email,
            registration: student.registration,
            user: student.user,
            class_id: student.class_id
          })) : [];

          return {
            classId: classItem.id,
            teachers: classTeachers,
            students: classStudents
          };
        } catch (error) {
          return {
            classId: classItem.id,
            teachers: [],
            students: []
          };
        }
      });

      const results = await Promise.all(promises);
      
      // Organizar dados por turma
      results.forEach(({ classId, teachers, students }) => {
        teachersData[classId] = teachers;
        studentsData[classId] = students;
      });

      setClassTeachers(teachersData);
      setClassStudents(studentsData);
    } catch (error) {
      // Silenciar erro ao buscar detalhes das turmas
    }
  };

  const loadSchoolTeachers = useCallback(async () => {
    if (!id) return;

    setIsLoadingTeachers(true);
    try {
      const response = await api.get(`/school-teacher`);
      const vinculos = response.data?.vinculos || [];
      const allTeachers = vinculos.reduce((acc: any[], vinculo: any) => {
        const professor = vinculo?.professor;
        if (!professor) return acc;

        acc.push({
          id: professor.id,
          name: professor.name,
          email: professor.email,
          registration: vinculo.registration,
          school_id: vinculo.school_id,
          teacher_id: vinculo.teacher_id,
          role: "professor",
        });

        return acc;
      }, []);
      const filtered = allTeachers.filter((teacher) => teacher.school_id === id);
      setTeachers(filtered);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao carregar professores",
        variant: "destructive",
      });
      setTeachers([]);
    } finally {
      setIsLoadingTeachers(false);
    }
  }, [id, toast]);

  useEffect(() => {
    loadSchoolTeachers();
  }, [loadSchoolTeachers]);

  useEffect(() => {
    const shouldOpenBulk = searchParams.get("professoresLote") === "1";
    if (!shouldOpenBulk) return;
    setBulkTeachersModalEntry("import");
    setShowBulkTeachersModal(true);
    const next = new URLSearchParams(searchParams);
    next.delete("professoresLote");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Buscar managers da escola
  useEffect(() => {
    const fetchSchoolManagers = async () => {
      if (!id) return;

      try {
        const response = await api.get(`/managers/school/${id}`);
        const managers = response.data?.managers;
        if (Array.isArray(managers)) {
          const getRole = (m: any) => String(m?.user?.role ?? m?.manager?.role ?? "").toLowerCase();
          const getUser = (m: any) => m?.user ?? m?.manager ?? {};

          const schoolDirectors = managers.filter((m: any) => getRole(m) === "diretor");
          const schoolCoordinators = managers.filter((m: any) => getRole(m) === "coordenador");

          const directorsData = schoolDirectors.map((m: any) => {
            const u = getUser(m);
            return ({
              id: u.id,
              name: u.name,
              email: u.email,
              registration: u.registration,
              role: u.role
            });
          });
          
          const coordinatorsData = schoolCoordinators.map((m: any) => {
            const u = getUser(m);
            return ({
              id: u.id,
              name: u.name,
              email: u.email,
              registration: u.registration,
              role: u.role
            });
          });
          
          setDirectors(directorsData);
          setCoordinators(coordinatorsData);
        }
      } catch (error) {
        // Silenciar erro ao carregar managers
      }
    };

    fetchSchoolManagers();
  }, [id, toast]);

  useEffect(() => {
    const fetchStudents = async () => {
      if (!id) return;

      try {
        const response = await api.get(`/students/school/${id}`);
        const allStudents = Array.isArray(response.data) ? response.data : [];
        setStudents(allStudents);
      } catch (error) {
        toast({
          title: "Erro",
          description: "Erro ao carregar alunos",
          variant: "destructive",
        });
        setStudents([]);
      }
    };

    fetchStudents();
  }, [id, toast]);

  // Buscar escolas disponíveis do mesmo município
  const fetchAvailableSchools = async () => {
    if (!school) return;

    try {
      const response = await api.get("/school");
      const allSchools = response.data || [];
      
      // Filtrar escolas do mesmo município, exceto a escola atual
      const filteredSchools = allSchools.filter(
        (s: School) => s.city_id === school.city_id && s.id !== school.id
      );
      
      setAvailableSchools(filteredSchools);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao carregar escolas disponíveis",
        variant: "destructive",
      });
    }
  };

  // Excluir turma
  const handleDeleteClass = async () => {
    if (!classToDelete || isDeleting) return;

    const deletedId = classToDelete.id;
    setIsDeleting(true);
    try {
      await api.delete(`/classes/${deletedId}`);

      setShowDeleteClassDialog(false);
      setClassToDelete(null);

      setClasses((prev) => prev.filter((c) => c.id !== deletedId));
      setClassTeachers((prev) => {
        const next = { ...prev };
        delete next[deletedId];
        return next;
      });
      setClassStudents((prev) => {
        const next = { ...prev };
        delete next[deletedId];
        return next;
      });

      toast({
        title: "Sucesso",
        description: "Turma excluída com sucesso",
      });
    } catch (error: unknown) {
      let errorTitle = "Erro ao excluir";
      let errorMessage = "Ocorreu um erro ao excluir a turma";

      // Verificar se é um erro do Axios com resposta
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { 
          response?: { 
            status?: number;
            data?: { 
              mensagem?: string; 
              erro?: string;
              message?: string;
            } 
          } 
        };
        
        if (axiosError.response?.data) {
          const data = axiosError.response.data;
          
          // Se houver mensagem específica do backend, usar ela
          if (data.mensagem) {
            errorMessage = data.mensagem;
            errorTitle = data.erro || "Não é possível excluir";
          } else if (data.erro) {
            errorMessage = data.erro;
          } else if (data.message) {
            errorMessage = data.message;
          }
        }
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Mover turma para outra escola
  const handleMoveClass = async () => {
    if (!classToMove || !targetSchoolId) return;

    setIsMoving(true);
    try {
      const response = await api.put(`/classes/${classToMove.id}`, {
        school_id: targetSchoolId
      });
      
      let successMessage = "Turma movida com sucesso";
      
      // Verificar se houve renomeação automática
      if (response.data?.auto_renamed) {
        successMessage = `Turma movida e renomeada de "${response.data.auto_renamed.old_name}" para "${response.data.auto_renamed.new_name}" (nome já existia na escola destino)`;
      }
      
      toast({
        title: "Sucesso",
        description: successMessage,
      });
      
      // Recarregar turmas
      window.location.reload();
    } catch (error: unknown) {
      let errorTitle = "Erro ao mover turma";
      let errorMessage = "Ocorreu um erro ao mover a turma";

      // Verificar se é um erro do Axios com resposta
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { 
          response?: { 
            status?: number;
            data?: { 
              mensagem?: string; 
              erro?: string;
              error?: string;
              details?: string;
            } 
          } 
        };
        
        if (axiosError.response?.data) {
          const data = axiosError.response.data;
          
          if (data.details) {
            errorMessage = data.details;
            errorTitle = data.error || "Erro ao mover turma";
          } else if (data.mensagem) {
            errorMessage = data.mensagem;
            errorTitle = data.erro || "Erro ao mover turma";
          } else if (data.erro) {
            errorMessage = data.erro;
          } else if (data.error) {
            errorMessage = data.error;
          }
        }
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsMoving(false);
      setShowMoveClassDialog(false);
      setClassToMove(null);
      setTargetSchoolId("");
    }
  };

  // Abrir diálogo de mover turma
  const handleOpenMoveClassDialog = async (classItem: Class) => {
    setClassToMove(classItem);
    await fetchAvailableSchools();
    setShowMoveClassDialog(true);
  };

  if (isLoadingSchool) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando detalhes da instituição...</p>
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="text-center py-8">
        <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {user.role === 'professor' ? "Instituição não encontrada" : "Escola não encontrada"}
        </h2>
        <p className="text-muted-foreground mb-4">
          {user.role === 'professor' 
            ? "A instituição que você está procurando não existe ou você não tem acesso a ela. Entre em contato com o diretor ou coordenador da sua escola."
            : "A escola que você está procurando não existe ou foi removida."}
        </p>
        <Button onClick={() => navigate("/app/cadastros/gestao")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para Gestão Escolar
        </Button>
      </div>
    );
  }





  const totalUsers = directors.length + coordinators.length + teachers.length + students.length;
  const teachersWithoutClass = teachers.filter((teacher) => !teacher.class_id).length;

  const goToPeopleSection = () => {
    const scroll = () =>
      document.getElementById("school-people")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

    if (activeTab !== "overview") {
      setActiveTab("overview");
      window.setTimeout(scroll, 80);
      return;
    }
    scroll();
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate("/app/cadastros/gestao")}
              className="shrink-0 mt-0.5"
              aria-label="Voltar para Gestão Escolar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">
                  {school.name}
                </h1>
                <Badge
                  variant="outline"
                  className="text-[11px] font-medium text-emerald-700 border-emerald-300 bg-emerald-50 shrink-0"
                >
                  Ativa
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {school.city.name} — {school.city.state}
              </p>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1 sm:gap-x-4 text-xs text-muted-foreground pt-1 border-t border-border/80 mt-2">
                <span className="inline-flex items-start gap-1.5 min-w-0 pt-2 sm:pt-2">
                  <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span className="break-words">{school.address || "Endereço não informado"}</span>
                </span>
                <span className="inline-flex items-start gap-1.5 min-w-0 sm:pt-2">
                  <span className="font-medium">Tipo de área:</span>
                  <span>{schoolAreaTypeLabel(school.area_type)}</span>
                </span>
                <span className="inline-flex items-start gap-1.5 min-w-0 sm:pt-2">
                  <Globe className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span className="break-words">{school.domain || "Domínio não informado"}</span>
                </span>
              </div>
            </div>
          </div>
          {canManageSchool && (
            <Button
              onClick={() => setIsEditDialogOpen(true)}
              variant="outline"
              size="sm"
              className="w-full sm:w-auto shrink-0"
            >
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={goToPeopleSection}
          className="rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="text-xs text-muted-foreground">Usuários</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{totalUsers}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {totalUsers === 1 ? "cadastrado" : "cadastrados"}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("classes")}
          className="rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="text-xs text-muted-foreground">Turmas</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{classes.length}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {classes.length === 1 ? "turma" : "turmas"}
          </p>
        </button>

        <button
          type="button"
          onClick={goToPeopleSection}
          className="rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="text-xs text-muted-foreground">Professores</p>
          {isLoadingTeachers ? (
            <div className="mt-2 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">…</span>
            </div>
          ) : (
            <>
              <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{teachers.length}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {teachersWithoutClass} sem turma
              </p>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={goToPeopleSection}
          className="rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="text-xs text-muted-foreground">Alunos</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{students.length}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {students.length === 1 ? "aluno" : "alunos"}
          </p>
        </button>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
        <TabsList className="grid h-10 w-full grid-cols-4 rounded-lg border border-border bg-muted p-1">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Visão Geral</TabsTrigger>
          <TabsTrigger value="classes" className="text-xs sm:text-sm">Turmas</TabsTrigger>
          <TabsTrigger value="courses" className="text-xs sm:text-sm">Cursos</TabsTrigger>
          <TabsTrigger value="disciplinas" className="text-xs sm:text-sm">Disciplinas</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5 mt-0">
          {canManageSchool && (
            <section className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
                    Ações da instituição
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Importação, vínculos e relatórios
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setShowBulkUploadModal(true)}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Importar Alunos
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <MoreHorizontal className="h-4 w-4 mr-2" />
                        Mais ações
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setShowManageSchoolLinksModal(true)}>
                        <Users className="h-4 w-4 mr-2" />
                        Gerenciar vínculos
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowPasswordReportModal(true)}>
                        <KeyRound className="h-4 w-4 mr-2" />
                        Relatório de Senhas
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </section>
          )}

          {/* People management */}
          <section
            id="school-people"
            className="scroll-mt-6 rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-5"
          >
            <div className="pb-1 border-b border-border">
              <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
                Pessoas da instituição
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5 pb-3">
                Diretores, coordenadores e professores
              </p>
            </div>

            {/* Directors */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-medium text-foreground">
                  Diretores
                  <span className="ml-1.5 text-muted-foreground font-normal">({directors.length})</span>
                </h3>
                {canManageSchool && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowLinkDirectorModal(true)}
                  >
                    <UserPlus className="h-4 w-4 mr-1.5" />
                    Adicionar
                  </Button>
                )}
              </div>
              {directors.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted px-3 py-4 text-center">
                  <p className="text-sm text-muted-foreground">Nenhum diretor cadastrado</p>
                  {canManageSchool && (
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-1 h-auto p-0"
                      onClick={() => setShowLinkDirectorModal(true)}
                    >
                      Adicionar o primeiro diretor
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border bg-background">
                  {directors.map((director) => (
                    <div key={director.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{director.name}</div>
                        {user.role !== "professor" && (
                          <div className="text-xs text-muted-foreground truncate">{director.email}</div>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
                        Diretor
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Coordinators */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-medium text-foreground">
                  Coordenadores
                  <span className="ml-1.5 text-muted-foreground font-normal">({coordinators.length})</span>
                </h3>
                <div className="flex gap-1 flex-wrap items-center">
                  {canManageSchool && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowLinkCoordinatorModal(true)}
                    >
                      <UserPlus className="h-4 w-4 mr-1.5" />
                      Adicionar
                    </Button>
                  )}
                  {canBulkCoordinators && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <MoreHorizontal className="h-4 w-4 mr-2" />
                          Mais
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setShowBulkCoordinatorModal(true)}>
                          <Users className="h-4 w-4 mr-2" />
                          Coordenador em lote
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              {coordinators.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted px-3 py-4 text-center">
                  <p className="text-sm text-muted-foreground">Nenhum coordenador cadastrado</p>
                  {canManageSchool && (
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-1 h-auto p-0"
                      onClick={() => setShowLinkCoordinatorModal(true)}
                    >
                      Adicionar o primeiro coordenador
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border bg-background">
                  {coordinators.map((coordinator) => (
                    <div key={coordinator.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{coordinator.name}</div>
                        {user.role !== "professor" && (
                          <div className="text-xs text-muted-foreground truncate">{coordinator.email}</div>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
                        Coordenador
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Teachers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-medium text-foreground">
                  Professores
                  <span className="ml-1.5 text-muted-foreground font-normal">
                    ({isLoadingTeachers ? "…" : teachers.length})
                  </span>
                </h3>
                <div className="flex gap-1 flex-wrap items-center">
                  {canManageSchool && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowLinkTeacherModal(true)}
                      >
                        <UserPlus className="h-4 w-4 mr-1.5" />
                        Adicionar
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            <MoreHorizontal className="h-4 w-4 mr-2" />
                            Mais
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setBulkTeachersModalEntry("link-classes");
                              setShowBulkTeachersModal(true);
                            }}
                          >
                            <Link2 className="h-4 w-4 mr-2" />
                            Atrelar turmas
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setBulkTeachersModalEntry("import");
                              setShowBulkTeachersModal(true);
                            }}
                          >
                            <GraduationCap className="h-4 w-4 mr-2" />
                            Professores em lote
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </div>
              </div>
              {isLoadingTeachers ? (
                <div className="rounded-lg border border-border bg-muted px-3 py-6 text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Carregando professores…</p>
                </div>
              ) : teachers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted px-3 py-4 text-center">
                  <p className="text-sm text-muted-foreground">Nenhum professor cadastrado</p>
                  {canManageSchool && (
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-1 h-auto p-0"
                      onClick={() => setShowLinkTeacherModal(true)}
                    >
                      Adicionar o primeiro professor
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border bg-background">
                  {teachers.slice(0, 5).map((teacher) => (
                    <div key={teacher.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{teacher.name}</div>
                        {user.role !== "professor" && (
                          <div className="text-xs text-muted-foreground truncate">{teacher.email}</div>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
                        Professor
                      </Badge>
                    </div>
                  ))}
                  {teachers.length > 5 && (
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-xs text-primary hover:bg-muted"
                      onClick={() => {
                        setBulkTeachersModalEntry("link-classes");
                        setShowBulkTeachersModal(true);
                      }}
                    >
                      Ver todos (+{teachers.length - 5})
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Classes Overview */}
          <section className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1 border-b border-border">
              <div className="pb-3 sm:pb-0">
                <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
                  Turmas
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Resumo — gerencie na aba Turmas
                </p>
              </div>
              <Button
                variant="default"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => setActiveTab("classes")}
              >
                Gerenciar turmas
              </Button>
            </div>

            {isLoadingClasses ? (
              <div className="rounded-lg border border-border bg-muted px-3 py-8 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Carregando turmas…</p>
              </div>
            ) : classes.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted px-4 py-8 text-center">
                <BookOpen className="h-8 w-8 text-muted-foreground/70 mx-auto mb-3" />
                <h3 className="text-sm font-medium mb-1">Nenhuma turma ainda</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Crie a primeira turma para organizar alunos e professores
                </p>
                {canManageSchool && (
                  <CreateClassForm
                    schoolId={school.id}
                    schoolName={school.name}
                    onSuccess={() => {
                      window.location.reload();
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sortedClasses.map((classItem) => (
                  <button
                    key={classItem.id}
                    type="button"
                    className="rounded-xl border border-border bg-background p-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setActiveTab("classes")}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-medium text-sm flex items-center gap-2 flex-wrap">
                        {upperDisplay(classItem.name)}
                        <ClassShiftBadge shift={classItem.shift} />
                      </h4>
                      {classItem.grade && (
                        <Badge variant="secondary" className="text-[10px] font-normal shrink-0">
                          {upperDisplay(
                            typeof classItem.grade === "object" && classItem.grade !== null
                              ? String((classItem.grade as { name?: string }).name ?? "")
                              : typeof classItem.grade === "string"
                                ? classItem.grade
                                : ""
                          )}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>{classTeachers[classItem.id]?.length || 0} prof.</span>
                      <span>{classStudents[classItem.id]?.length || 0} alunos</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="classes" className="space-y-4 mt-0">
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-border mb-4">
              <div>
                <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
                  Gerenciamento de turmas
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Organize alunos e professores por turma
                </p>
              </div>
              {canManageSchool && (
                <CreateClassForm
                  schoolId={school.id}
                  schoolName={school.name}
                  onSuccess={() => {
                    window.location.reload();
                  }}
                />
              )}
            </div>

          {isLoadingClasses ? (
            <div className="rounded-lg border border-border bg-muted px-3 py-8 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Carregando turmas…</p>
            </div>
          ) : classes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted px-4 py-10 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground/70 mx-auto mb-3" />
              <h3 className="text-sm font-medium mb-1">Nenhuma turma ainda</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Crie a primeira turma para começar a vincular alunos
              </p>
              {canManageSchool && (
                <CreateClassForm
                  schoolId={school.id}
                  schoolName={school.name}
                  onSuccess={() => {
                    window.location.reload();
                  }}
                />
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {sortedClasses.map((classItem) => {
                return (
                  <div
                    key={classItem.id}
                    className="rounded-xl border border-border bg-background p-4 sm:p-5"
                  >
                    <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
                      <div className="min-w-0 space-y-1">
                        <h4 className="font-medium text-base flex items-center gap-2 flex-wrap">
                          {upperDisplay(classItem.name)}
                          <ClassShiftBadge shift={classItem.shift} />
                        </h4>
                        {classItem.grade && (
                          <div className="text-sm text-muted-foreground">
                            <p>
                              Série:{" "}
                              {upperDisplay(
                                typeof classItem.grade === "object" && classItem.grade !== null
                                  ? String((classItem.grade as { name?: string }).name ?? "")
                                  : typeof classItem.grade === "string"
                                    ? classItem.grade
                                    : ""
                              )}
                            </p>
                            {typeof classItem.grade === "object" &&
                              classItem.grade !== null &&
                              (classItem.grade as any).education_stage && (
                                <p className="text-xs text-muted-foreground">
                                  Curso:{" "}
                                  {upperDisplay((classItem.grade as any).education_stage.name)}
                                </p>
                              )}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {String(user.role).toLowerCase() === "professor" &&
                          (classTeachers[classItem.id] || []).some(
                            (t) => t?.user_id && t.user_id === user.id
                          ) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setStudentsDialogClass(classItem);
                                setShowStudentsDialog(true);
                              }}
                              title="Visualizar alunos desta turma"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Ver alunos
                            </Button>
                          )}

                        {canManageClasses && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShiftEditClass(classItem)}
                            >
                              <Clock className="h-4 w-4 mr-2" />
                              Editar turno
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => {
                                setSelectedClass(classItem);
                                setShowManageClassModal(true);
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Gerenciar
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <MoreHorizontal className="h-4 w-4 mr-2" />
                                  Mais
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => handleOpenMoveClassDialog(classItem)}
                                >
                                  <MoveRight className="h-4 w-4 mr-2" />
                                  Mover para outra escola
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-700"
                                  onClick={() => {
                                    setClassToDelete(classItem);
                                    setShowDeleteClassDialog(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Excluir turma
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h5 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                          Professores ({classTeachers[classItem.id]?.length || 0})
                        </h5>
                        <div className="rounded-lg border border-border bg-muted p-3 max-h-32 overflow-y-auto">
                          {classTeachers[classItem.id]?.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center">
                              Nenhum professor vinculado
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {classTeachers[classItem.id]?.slice(0, 3).map((teacher) => (
                                <div
                                  key={teacher.id}
                                  className="text-xs text-muted-foreground truncate"
                                >
                                  {upperDisplay(teacher.name)}
                                </div>
                              ))}
                              {classTeachers[classItem.id]?.length > 3 && (
                                <div className="text-xs text-primary">
                                  +{classTeachers[classItem.id].length - 3} mais
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <h5 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                          Alunos ({classStudents[classItem.id]?.length || 0})
                        </h5>
                        <div className="rounded-lg border border-border bg-muted p-3 max-h-32 overflow-y-auto">
                          {classStudents[classItem.id]?.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center">
                              Nenhum aluno vinculado
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {classStudents[classItem.id]?.slice(0, 3).map((student) => (
                                <div
                                  key={student.id}
                                  className="text-xs text-muted-foreground truncate"
                                >
                                  {upperDisplay(student.name)}
                                </div>
                              ))}
                              {classStudents[classItem.id] &&
                                classStudents[classItem.id].length > 3 && (
                                  <div className="text-xs text-primary">
                                    +{classStudents[classItem.id].length - 3} mais
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </TabsContent>

        <TabsContent value="courses" className="space-y-6 mt-0">
          <SchoolCoursesTab schoolId={school.id} schoolName={school.name} />
        </TabsContent>

        <TabsContent value="disciplinas" className="space-y-6 mt-0">
          <InstituicaoDisciplinasTab />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      {isEditDialogOpen && (
        <SchoolForm
          school={school}
          onClose={() => setIsEditDialogOpen(false)}
          onSave={(updatedSchool) => {
            if (school) {
              setSchool({ ...school, ...updatedSchool });
            }
            setIsEditDialogOpen(false);
          }}
        />
      )}

      {shiftEditClass ? (
        <EditClassShiftDialog
          open={!!shiftEditClass}
          onOpenChange={(open) => {
            if (!open) setShiftEditClass(null);
          }}
          classId={shiftEditClass.id}
          className={shiftEditClass.name}
          initialShift={shiftEditClass.shift}
          onSaved={(shift) => handleClassShiftSaved(shiftEditClass.id, shift)}
        />
      ) : null}

      {/* Manage Class Modal */}
      {showManageClassModal && selectedClass && school && (
        <ManageClassModal
          isOpen={showManageClassModal}
          onClose={() => {
            setShowManageClassModal(false);
            setSelectedClass(null);
          }}
          schoolId={school.id}
          schoolName={school.name}
          schoolCityId={school.city_id}
          classData={selectedClass}
          onSuccess={async () => {
            if (classes.length > 0) {
              await fetchClassDetails(classes);
            }
            if (id) {
              try {
                const response = await api.get(`/students/school/${id}`);
                setStudents(Array.isArray(response.data) ? response.data : []);
              } catch {
                /* ignore */
              }
            }
          }}
        />
      )}

      {/* Link Teacher Modal */}
      {showLinkTeacherModal && school && (
        <LinkTeacherModal
          isOpen={showLinkTeacherModal}
          onClose={() => setShowLinkTeacherModal(false)}
          schoolId={school.id}
          classId=""
          className={`Escola ${school.name}`}
          schoolCityId={school.city_id}
          onSuccess={async () => {
            await loadSchoolTeachers();
            if (classes.length > 0) {
              await fetchClassDetails(classes);
            }
          }}
          schoolOnlyMode
        />
      )}

      {/* Link Director Modal */}
      <LinkDirectorCoordinatorModal
        isOpen={showLinkDirectorModal}
        onClose={() => setShowLinkDirectorModal(false)}
        schoolId={school.id}
        schoolName={school.name}
        schoolCityId={school.city_id}
        userType="diretor"
        onSuccess={() => {
          // Recarregar dados da escola
          window.location.reload();
        }}
      />

      {/* Link Coordinator Modal */}
      <LinkDirectorCoordinatorModal
        isOpen={showLinkCoordinatorModal}
        onClose={() => setShowLinkCoordinatorModal(false)}
        schoolId={school.id}
        schoolName={school.name}
        schoolCityId={school.city_id}
        userType="coordenador"
        onSuccess={() => {
          // Recarregar dados da escola
          window.location.reload();
        }}
      />

      {/* Bulk Coordinator Modal */}
      {showBulkCoordinatorModal && (
        <BulkCreateCoordinatorsModal
          isOpen={showBulkCoordinatorModal}
          onClose={() => setShowBulkCoordinatorModal(false)}
          schoolId={school.id}
          schoolName={school.name}
          schoolCityId={school.city_id}
          onSuccess={() => {
            window.location.reload();
          }}
        />
      )}

      {/* Manage School Links Modal */}
      <ManageSchoolLinksModal
        isOpen={showManageSchoolLinksModal}
        onClose={() => setShowManageSchoolLinksModal(false)}
        schoolId={school.id}
        schoolName={school.name}
        onSuccess={() => {
          // Recarregar dados da escola
          window.location.reload();
        }}
      />

      {/* Bulk Upload Students Modal */}
      {showBulkUploadModal && (
        <BulkUploadStudentsModal
          isOpen={showBulkUploadModal}
          onClose={() => setShowBulkUploadModal(false)}
          schoolId={school.id}
          schoolName={school.name}
          schoolAddress={school.address}
          schoolState={school.city.state}
          schoolMunicipality={school.city.name}
          grades={schoolGrades}
          onSuccess={() => {
            // Recarregar dados da escola
            window.location.reload();
          }}
        />
      )}

      {/* Bulk Manage Teachers Modal */}
      {showBulkTeachersModal && (
        <BulkManageTeachersModal
          isOpen={showBulkTeachersModal}
          onClose={() => {
            setShowBulkTeachersModal(false);
            setBulkTeachersModalEntry("import");
          }}
          schoolId={school.id}
          schoolName={school.name}
          schoolCityId={school.city_id}
          classes={classes}
          classTeachers={classTeachers}
          initialEntry={bulkTeachersModalEntry}
          onSuccess={async () => {
            await loadSchoolTeachers();
            if (classes.length > 0) {
              await fetchClassDetails(classes);
            }
          }}
        />
      )}

      {/* Password Report Modal */}
      {showPasswordReportModal && school && (
        <PasswordReportModal
          isOpen={showPasswordReportModal}
          onClose={() => setShowPasswordReportModal(false)}
          schoolId={school.id}
          schoolName={school.name}
          cityId={school.city_id}
          classes={classes}
        />
      )}

      {/* Delete Class Dialog */}
      <AlertDialog
        open={showDeleteClassDialog}
        onOpenChange={(open) => {
          if (!open && isDeleting) return;
          setShowDeleteClassDialog(open);
          if (!open && !isDeleting) {
            setClassToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão de Turma</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a turma <strong>{upperDisplay(classToDelete?.name)}</strong>?
              <br /><br />
              Esta ação não pode ser desfeita. Todos os alunos e professores serão desvinculados da turma.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
              onClick={() => void handleDeleteClass()}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir Turma"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Class Dialog */}
      <Dialog open={showMoveClassDialog} onOpenChange={setShowMoveClassDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Mover Turma para Outra Escola</DialogTitle>
            <DialogDescription>
              Mova a turma <strong>{upperDisplay(classToMove?.name)}</strong> para outra escola do mesmo município.
              <br /><br />
              Os alunos da turma serão automaticamente transferidos para a nova escola.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Escola de destino</label>
              <Select
                value={targetSchoolId}
                onValueChange={setTargetSchoolId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma escola" />
                </SelectTrigger>
                <SelectContent>
                  {availableSchools.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      Nenhuma outra escola disponível no mesmo município
                    </div>
                  ) : (
                    availableSchools.map((school) => (
                      <SelectItem key={school.id} value={school.id}>
                        {upperDisplay(school.name)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {availableSchools.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Apenas escolas do mesmo município ({school?.city.name}) estão disponíveis
                </p>
              )}
            </div>

            {targetSchoolId && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Atenção:</strong> Se já existir uma turma com o mesmo nome na escola destino, 
                  a turma será automaticamente renomeada (ex: "5º Ano A" → "5º Ano A (2)").
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMoveClassDialog(false);
                setClassToMove(null);
                setTargetSchoolId("");
              }}
              disabled={isMoving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleMoveClass}
              disabled={!targetSchoolId || isMoving}
            >
              {isMoving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Movendo...
                </>
              ) : (
                <>
                  <MoveRight className="h-4 w-4 mr-2" />
                  Mover Turma
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Students Dialog (somente para professor na própria turma) */}
      <Dialog
        open={showStudentsDialog}
        onOpenChange={(open) => {
          setShowStudentsDialog(open);
          if (!open) setStudentsDialogClass(null);
        }}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              Alunos da turma{" "}
              {studentsDialogClass?.name ? `"${upperDisplay(studentsDialogClass.name)}"` : ""}
            </DialogTitle>
            <DialogDescription>
              Lista completa de alunos vinculados à sua turma.
            </DialogDescription>
          </DialogHeader>

          <div className="border rounded-lg p-3 max-h-[55vh] overflow-y-auto">
            {studentsDialogClass ? (
              (classStudents[studentsDialogClass.id] || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center">Nenhum aluno vinculado</p>
              ) : (
                <div className="space-y-2">
                  {(classStudents[studentsDialogClass.id] || []).map((s) => (
                    <div key={s.id} className="text-sm text-foreground">
                      {upperDisplay(s.name)}
                    </div>
                  ))}
                </div>
              )
            ) : (
              <p className="text-sm text-muted-foreground text-center">Selecione uma turma.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}