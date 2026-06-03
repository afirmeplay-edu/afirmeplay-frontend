import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Search, Trash2, Users, Building, Loader2, AlertCircle, UserPlus, X, Eye, GraduationCap, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/authContext";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateClassForm } from "@/components/schools/CreateClassForm";
import { ClassShiftBadge } from "@/components/schools/ClassShiftBadge";
import { ClassShiftSelector } from "@/components/schools/ClassShiftSelector";
import { EditClassShiftDialog } from "@/components/schools/EditClassShiftDialog";
import { type ClassShiftCanonical, toApiShiftValue } from "@/lib/classShift";

interface School {
  id: string;
  name: string;
}

interface EducationStage {
  id: string;
  name: string;
}

interface Grade {
  id: string;
  name: string;
  education_stage_id: string;
  education_stage?: {
    id: string;
    name: string;
  };
}

interface Student {
  id: string;
  name: string;
  registration?: string;
  birth_date?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

interface Turma {
  id: string;
  name: string;
  school_id: string;
  grade_id?: string;
  shift?: string | null;
  students_count?: number;
  school?: {
    id: string;
    name: string;
  };
  grade?: {
    id: string;
    name: string;
    education_stage_id: string;
    education_stage?: {
      id: string;
      name: string;
    };
  };
}

interface FormData {
  name: string;
  school_id: string;
  grade_id?: string;
  shift: ClassShiftCanonical | null;
}

interface AddStudentFormData {
  name: string;
  email: string;
  registration: string;
  birthDate: string;
}

interface TurmasProps {
  /** Quando true, oculta o título da página (uso dentro de abas) */
  embedded?: boolean;
}

export default function Turmas({ embedded = false }: TurmasProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Turma | null>(null);
  const [deletingItem, setDeletingItem] = useState<Turma | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    school_id: "",
    grade_id: "",
    shift: null,
  });

  // Estados para gerenciar alunos
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [addStudentForm, setAddStudentForm] = useState<AddStudentFormData>({
    name: "",
    email: "",
    registration: "",
    birthDate: "",
  });
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [updatingCounters, setUpdatingCounters] = useState<Set<string>>(new Set());

  // Estados para visualização de alunos da turma
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewingClass, setViewingClass] = useState<Turma | null>(null);
  const [shiftEditTurma, setShiftEditTurma] = useState<Turma | null>(null);
  const [viewStudents, setViewStudents] = useState<Student[]>([]);
  /** Aba de escola ativa (modo embedded: turmas separadas por escola) */
  const [activeSchoolTab, setActiveSchoolTab] = useState<string>("");
  const [showFilters, setShowFilters] = useState(true);
  const [isLoadingViewStudents, setIsLoadingViewStudents] = useState(false);

  const { toast } = useToast();
  const { user } = useAuth();
  const canDeleteTurma = user?.role !== "professor";
  const classNameCollator = useMemo(
    () => new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" }),
    []
  );

  // Carregamento de alunos vinculado à edição foi removido com o botão Editar

  const fetchTurmas = useCallback(async () => {
    try {
      setIsLoading(true);

      // Buscar todas as escolas primeiro
      const schoolsResponse = await api.get("/school");
      const allSchools = schoolsResponse.data || [];

      // Buscar turmas de todas as escolas com contador de alunos
      const turmasPromises = allSchools.map(async (school: School) => {
        try {
          const response = await api.get(`/classes/school/${school.id}`);
          const classes = response.data || [];
          // Garantir que cada turma tenha o school_id
          const classesWithSchoolId = classes.map((classItem: any) => ({
            ...classItem,
            school_id: school.id
          }));
          console.log(`Turmas da escola ${school.name}:`, classesWithSchoolId);
          return classesWithSchoolId;
        } catch (error) {
          console.error(`Erro ao buscar turmas da escola ${school.name}:`, error);
          return [];
        }
      });

      const turmasArrays = await Promise.all(turmasPromises);
      const allTurmas = turmasArrays.flat();
      
      console.log('Turmas carregadas:', allTurmas);
      console.log('Exemplo de turma:', allTurmas[0]);
      console.log('Exemplo de turma school_id:', allTurmas[0]?.school_id);
      console.log('Exemplo de turma school_id tipo:', typeof allTurmas[0]?.school_id);
      console.log('Exemplo de turma school_id truthy?', !!allTurmas[0]?.school_id);

      setTurmas(allTurmas);
    } catch (error) {
      console.error("Erro ao buscar turmas:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar turmas. Verifique sua conexão.",
        variant: "destructive",
      });
      setTurmas([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const fetchSchools = async () => {
    try {
      const response = await api.get("/school");
      setSchools(response.data || []);
    } catch (error) {
      console.error("Erro ao buscar escolas:", error);
    }
  };

  const fetchGrades = async () => {
    try {
      const response = await api.get("/grades/");
      setGrades(response.data || []);
    } catch (error) {
      console.error("Erro ao buscar séries:", error);
    }
  };

  // Carregar dados iniciais após as funções estarem definidas
  useEffect(() => {
    fetchTurmas();
    fetchSchools();
    fetchGrades();
  }, [fetchTurmas]);

  // Quando embedded, definir primeira escola como aba ativa ao carregar escolas
  useEffect(() => {
    if (embedded && schools.length > 0 && !activeSchoolTab) {
      setActiveSchoolTab(schools[0].id);
    }
  }, [embedded, schools, activeSchoolTab]);

  const fetchStudentsForView = async (classId: string, schoolId?: string) => {
    console.log('fetchStudentsForView chamada com:', { classId, schoolId });
    setIsLoadingViewStudents(true);
    try {
      // Usar apenas a rota suportada pelo backend para evitar 404 no console
      const effectiveSchoolId = schoolId || viewingClass?.school_id;
      console.log('effectiveSchoolId:', effectiveSchoolId);
      if (!effectiveSchoolId) {
        console.log('Nenhum schoolId encontrado, limpando alunos');
        setViewStudents([]);
        return;
      }
      console.log('Fazendo requisição para:', `/students/school/${effectiveSchoolId}/class/${classId}`);
      let res;
      try {
        res = await api.get(`/students/school/${effectiveSchoolId}/class/${classId}`, {
          validateStatus: () => true,
        });
        console.log('Resposta da API:', res);
        console.log('Status da resposta:', res.status);
        console.log('Headers da resposta:', res.headers);
        console.log('Data da resposta:', res.data);
        console.log('Tipo da resposta:', typeof res.data);
        console.log('É array?', Array.isArray(res.data));
        console.log('Stringify da resposta:', JSON.stringify(res.data));
        console.log('Keys da resposta:', res.data ? Object.keys(res.data) : 'null');
        console.log('Valor da resposta:', res.data);
        console.log('Resposta completa:', res);
        console.log('Resposta completa stringify:', JSON.stringify(res));
        console.log('Resposta completa keys:', Object.keys(res));
        console.log('Resposta completa values:', Object.values(res));
        console.log('Resposta completa entries:', Object.entries(res));
        console.log('Resposta completa hasOwnProperty data:', res.hasOwnProperty('data'));
        console.log('Resposta completa data direto:', res.data);
        console.log('Resposta completa data tipo:', typeof res.data);
        console.log('Resposta completa data null?', res.data === null);
        console.log('Resposta completa data undefined?', res.data === undefined);
        console.log('Resposta completa data empty string?', res.data === '');
        console.log('Resposta completa data empty array?', JSON.stringify(res.data) === '[]');
        console.log('Resposta completa data length:', res.data ? res.data.length : 'N/A');
        console.log('Resposta completa data first item:', res.data && Array.isArray(res.data) ? res.data[0] : 'N/A');
        console.log('Resposta completa data first item keys:', res.data && Array.isArray(res.data) && res.data[0] ? Object.keys(res.data[0]) : 'N/A');
        console.log('Resposta completa data first item stringify:', res.data && Array.isArray(res.data) && res.data[0] ? JSON.stringify(res.data[0]) : 'N/A');
        console.log('Resposta completa data first item name:', res.data && Array.isArray(res.data) && res.data[0] ? res.data[0].name : 'N/A');
        console.log('Resposta completa data first item email:', res.data && Array.isArray(res.data) && res.data[0] ? res.data[0].email : 'N/A');
        console.log('Resposta completa data first item registration:', res.data && Array.isArray(res.data) && res.data[0] ? res.data[0].registration : 'N/A');
        console.log('Resposta completa data first item id:', res.data && Array.isArray(res.data) && res.data[0] ? res.data[0].id : 'N/A');
        console.log('Resposta completa data first item user:', res.data && Array.isArray(res.data) && res.data[0] ? res.data[0].user : 'N/A');
        console.log('Resposta completa data first item user email:', res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user ? res.data[0].user.email : 'N/A');
        console.log('Resposta completa data first item user keys:', res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user ? Object.keys(res.data[0].user) : 'N/A');
        console.log('Resposta completa data first item user stringify:', res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user ? JSON.stringify(res.data[0].user) : 'N/A');
        console.log('Resposta completa data first item user email direto:', res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email ? res.data[0].user.email : 'N/A');
        console.log('Resposta completa data first item user email tipo:', typeof (res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email ? res.data[0].user.email : 'N/A'));
        console.log('Resposta completa data first item user email null?', res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email === null);
        console.log('Resposta completa data first item user email undefined?', res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email === undefined);
        console.log('Resposta completa data first item user email empty string?', res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email === '');
        console.log('Resposta completa data first item user email falsy?', !res.data || !Array.isArray(res.data) || !res.data[0] || !res.data[0].user || !res.data[0].user.email);
        console.log('Resposta completa data first item user email truthy?', res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email);
        console.log('Resposta completa data first item user email truthy stringify:', JSON.stringify(res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email));
        console.log('Resposta completa data first item user email truthy stringify 2:', JSON.stringify(res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email ? res.data[0].user.email : 'N/A'));
        console.log('Resposta completa data first item user email truthy stringify 3:', JSON.stringify(res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email ? res.data[0].user.email : 'N/A'));
        console.log('Resposta completa data first item user email truthy stringify 4:', JSON.stringify(res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email ? res.data[0].user.email : 'N/A'));
        console.log('Resposta completa data first item user email truthy stringify 5:', JSON.stringify(res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email ? res.data[0].user.email : 'N/A'));
        console.log('Resposta completa data first item user email truthy stringify 6:', JSON.stringify(res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email ? res.data[0].user.email : 'N/A'));
        console.log('Resposta completa data first item user email truthy stringify 7:', JSON.stringify(res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email ? res.data[0].user.email : 'N/A'));
        console.log('Resposta completa data first item user email truthy stringify 8:', JSON.stringify(res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email ? res.data[0].user.email : 'N/A'));
        console.log('Resposta completa data first item user email truthy stringify 9:', JSON.stringify(res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email ? res.data[0].user.email : 'N/A'));
        console.log('Resposta completa data first item user email truthy stringify 10:', JSON.stringify(res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email ? res.data[0].user.email : 'N/A'));
        console.log('Resposta completa data first item user email truthy stringify 11:', JSON.stringify(res.data && Array.isArray(res.data) && res.data[0] && res.data[0].user && res.data[0].user.email ? res.data[0].user.email : 'N/A'));
      } catch (error) {
        console.error('Erro na requisição principal:', error);
        res = { status: 500, data: null };
      }
      
      // Se a primeira rota falhar, tentar rota alternativa
      if (res.status >= 400) {
        console.log('Primeira rota falhou, tentando rota alternativa...');
        try {
          res = await api.get(`/students/classes/${classId}`, {
            validateStatus: () => true,
          });
          console.log('Resposta da rota alternativa:', res);
          console.log('Status da rota alternativa:', res.status);
          console.log('Data da rota alternativa:', res.data);
        } catch (fallbackError) {
          console.error('Erro na rota alternativa:', fallbackError);
          // Tentar uma terceira rota
          try {
            console.log('Tentando terceira rota...');
            res = await api.get(`/classes/${classId}/students`, {
              validateStatus: () => true,
            });
            console.log('Resposta da terceira rota:', res);
            console.log('Status da terceira rota:', res.status);
            console.log('Data da terceira rota:', res.data);
          } catch (thirdError) {
            console.error('Erro na terceira rota:', thirdError);
          }
        }
      }
      
      if (res.status >= 200 && res.status < 300) {
        console.log('Alunos carregados:', res.data);
        console.log('Tipo de dados:', typeof res.data);
        console.log('É array?', Array.isArray(res.data));
        let studentsData = res.data || [];
        
        // Se não for array, tentar extrair do objeto
        if (!Array.isArray(studentsData) && typeof studentsData === 'object') {
          console.log('Dados não são array, tentando extrair...');
          if (studentsData.students) {
            studentsData = studentsData.students;
          } else if (studentsData.data) {
            studentsData = studentsData.data;
          } else if (studentsData.alunos) {
            studentsData = studentsData.alunos;
          }
        }
        
        console.log('Dados finais dos alunos:', studentsData);
        console.log('Número de alunos:', studentsData.length);
        setViewStudents(studentsData);
      } else {
        console.log('Erro na resposta da API:', res.status, res.data);
        setViewStudents([]);
      }
          } catch (error) {
        console.error('Erro ao buscar alunos:', error);
        setViewStudents([]);
      } finally {
        console.log('Finalizando fetchStudentsForView');
        setIsLoadingViewStudents(false);
      }
  };

  const openViewDialog = (turma: Turma) => {
    setViewingClass(turma);
    setIsViewDialogOpen(true);
    fetchStudentsForView(turma.id, turma.school_id);
  };

  const handleShiftSaved = (classId: string, shift: ClassShiftCanonical | null) => {
    setTurmas((prev) =>
      prev.map((t) => (t.id === classId ? { ...t, shift } : t))
    );
    setViewingClass((prev) => (prev?.id === classId ? { ...prev, shift } : prev));
    if (shiftEditTurma?.id === classId) {
      setShiftEditTurma((prev) => (prev ? { ...prev, shift } : null));
    }
  };

  const fetchStudentsByClass = async (classId: string) => {
    try {
      setIsLoadingStudents(true);
      const response = await api.get(`/classes/${classId}/students`);
      setStudents(response.data || []);
    } catch (error) {
      console.error("Erro ao buscar alunos da turma:", error);
      // Fallback: tentar buscar por escola
      if (editingItem?.school_id) {
        try {
          const fallbackResponse = await api.get(`/students/school/${editingItem.school_id}/class/${classId}`);
          setStudents(fallbackResponse.data || []);
        } catch (fallbackError) {
          console.error("Erro no fallback:", fallbackError);
          setStudents([]);
        }
      }
    } finally {
      setIsLoadingStudents(false);
    }
  };

  // Função para atualizar contador de uma turma específica
  const updateClassStudentCount = async (classId: string, schoolId: string) => {
    try {
      setUpdatingCounters(prev => new Set(prev).add(classId));

      const response = await api.get(`/classes/school/${schoolId}`);
      const schoolClasses = response.data || [];
      const updatedClass = schoolClasses.find((c: Turma) => c.id === classId);

      if (updatedClass) {
        setTurmas(prevTurmas =>
          prevTurmas.map(turma =>
            turma.id === classId
              ? { ...turma, students_count: updatedClass.students_count }
              : turma
          )
        );

        // Atualizar também o item sendo editado se for o mesmo
        if (editingItem?.id === classId) {
          setEditingItem(prev => prev ? { ...prev, students_count: updatedClass.students_count } : null);
        }
      }
    } catch (error) {
      console.error("Erro ao atualizar contador de alunos:", error);
    } finally {
      setUpdatingCounters(prev => {
        const newSet = new Set(prev);
        newSet.delete(classId);
        return newSet;
      });
    }
  };


  const openEditModal = (item: Turma) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      school_id: item.school_id,
      grade_id: item.grade_id || "",
      shift: toApiShiftValue(item.shift),
    });
    setIsModalOpen(true);
  };

  const openDeleteDialog = (item: Turma) => {
    setDeletingItem(item);
    setIsDeleteDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: "Erro",
        description: "Nome é obrigatório",
        variant: "destructive",
      });
      return;
    }

    if (!formData.school_id) {
      toast({
        title: "Erro",
        description: "Escola é obrigatória",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        name: formData.name,
        school_id: formData.school_id,
        grade_id: formData.grade_id || null,
        shift: formData.shift,
      };

      if (editingItem) {
        // Atualizar turma existente
        await api.put(`/classes/${editingItem.id}`, payload);
        toast({
          title: "Sucesso",
          description: "Turma atualizada com sucesso!",
        });
      } else {
        // Criar nova turma
        await api.post("/classes", payload);
        toast({
          title: "Sucesso",
          description: "Turma criada com sucesso!",
        });
      }

      setIsModalOpen(false);
      fetchTurmas(); // Recarregar a lista
    } catch (error) {
      console.error("Erro ao salvar turma:", error);
      toast({
        title: "Erro",
        description: (error as { response?: { data?: { error?: string } } }).response?.data?.error || "Erro ao salvar turma",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;

    try {
      setIsSubmitting(true);
      await api.delete(`/classes/${deletingItem.id}`);
      toast({
        title: "Sucesso",
        description: "Turma excluída com sucesso!",
      });
      setIsDeleteDialogOpen(false);
      setDeletingItem(null);
      fetchTurmas(); // Recarregar a lista
    } catch (error) {
      console.error("Erro ao excluir turma:", error);
      toast({
        title: "Erro",
        description: (error as { response?: { data?: { error?: string } } }).response?.data?.error || "Erro ao excluir turma",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateEmail = (fullName: string) => {
    const names = fullName.toLowerCase().split(" ");
    const initials = names.map(name => name[0]).join("");
    return `${initials}@afirmeplay.com.br`;
  };

  const generatePassword = (fullName: string) => {
    const firstName = fullName.split(" ")[0].toLowerCase();
    return `${firstName}@afirmeplay`;
  };

  const handleAddStudent = async () => {
    if (!addStudentForm.name || !addStudentForm.birthDate || !editingItem) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsAddingStudent(true);

      const studentData = {
        name: addStudentForm.name,
        email: addStudentForm.email || generateEmail(addStudentForm.name),
        password: generatePassword(addStudentForm.name),
        registration: addStudentForm.registration || undefined,
        birth_date: addStudentForm.birthDate,
        class_id: editingItem.id,
        grade_id: editingItem.grade_id,
        city_id: editingItem.school_id, // Usando school_id como city_id (ajustar conforme API)
      };

      await api.post("/students", studentData);

      toast({
        title: "Sucesso",
        description: "Aluno adicionado com sucesso!",
      });

      // Limpar formulário
      setAddStudentForm({
        name: "",
        email: "",
        registration: "",
        birthDate: "",
      });

      // Recarregar lista de alunos
      fetchStudentsByClass(editingItem.id);
      // Atualizar contador de alunos de forma mais eficiente
      updateClassStudentCount(editingItem.id, editingItem.school_id);
    } catch (error) {
      console.error("Erro ao adicionar aluno:", error);
      toast({
        title: "Erro",
        description: (error as { response?: { data?: { error?: string } } }).response?.data?.error || "Erro ao adicionar aluno",
        variant: "destructive",
      });
    } finally {
      setIsAddingStudent(false);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!editingItem) return;

    try {
      await api.put(`/classes/${editingItem.id}/remove_student`, { student_id: studentId });
      setStudents(students.filter(student => student.id !== studentId));
      // Atualizar contador de alunos de forma mais eficiente
      updateClassStudentCount(editingItem.id, editingItem.school_id);
      toast({
        title: "Sucesso",
        description: "Aluno removido da turma com sucesso",
      });
    } catch (error) {
      console.error("Erro ao remover aluno:", error);
      toast({
        title: "Erro",
        description: (error as { response?: { data?: { error?: string } } }).response?.data?.error || "Erro ao remover aluno da turma",
        variant: "destructive",
      });
    }
  };

  const filteredTurmas = useMemo(
    () =>
      turmas
        .filter(
          (turma) =>
            turma.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (turma.school?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (turma.grade?.name || "").toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => classNameCollator.compare(a.name || "", b.name || "")),
    [turmas, searchTerm, classNameCollator]
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="flex justify-center sm:justify-end">
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Skeleton className="h-10 w-64" />
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-8 w-16" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-4 w-24" />
                  <div className="flex gap-2 mt-4">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
              <Users className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
              Gerenciar Turmas
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Cadastre e gerencie as turmas das escolas
            </p>
          </div>
          <div className="flex justify-center w-full sm:w-auto sm:justify-end">
            <CreateClassForm
              showSchoolSelector={true}
              availableSchools={schools}
              onSuccess={() => {
                fetchTurmas();
              }}
            />
          </div>
        </div>
      )}
      {embedded && (
        <></>
      )}

      {embedded && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((prev) => !prev)}
          >
            {showFilters ? "Ocultar escolas" : "Ver escolas"}
          </Button>
        </div>
      )}
      <div className="flex items-center space-x-2 flex-wrap gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar turmas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {embedded && schools.length > 0 ? (
        <Tabs value={activeSchoolTab || schools[0]?.id} onValueChange={setActiveSchoolTab} className="w-full">
          {showFilters && (
            <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/60 p-1 rounded-lg w-full">
              {schools.map((school) => {
                const count = filteredTurmas.filter((t) => t.school_id === school.id).length;
                return (
                  <TabsTrigger
                    key={school.id}
                    value={school.id}
                    className="flex items-start gap-2 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-border rounded-md transition-all"
                  >
                    <Building className="h-3.5 w-3.5 shrink-0" />
                    <span className="whitespace-normal break-words max-w-[140px] sm:max-w-[200px] leading-tight">
                      {school.name}
                    </span>
                    <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                      {count}
                    </Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          )}
          {schools.map((school) => {
            const turmasDaEscola = filteredTurmas.filter((t) => t.school_id === school.id);
            return (
              <TabsContent key={school.id} value={school.id} className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  {turmasDaEscola.length} turma(s) em <strong className="text-foreground">{school.name}</strong>
                </p>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {turmasDaEscola.map((turma) => (
                    <Card key={turma.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-lg font-semibold flex items-center gap-2 flex-wrap">
                          <Users className="h-5 w-5 text-green-600" />
                          {turma.name}
                          <ClassShiftBadge shift={turma.shift} />
                        </CardTitle>
                        <Badge variant="default">Ativa</Badge>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {turma.grade && (
                            <div className="flex items-center gap-2">
                              <GraduationCap className="h-4 w-4 text-muted-foreground" />
                              <div className="text-sm">
                                <p><strong>Série:</strong> {turma.grade.name}</p>
                                {turma.grade.education_stage && (
                                  <p className="text-xs text-muted-foreground">
                                    <strong>Curso:</strong> {turma.grade.education_stage.name}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-3">
                            <div className="flex items-center space-x-1">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              {updatingCounters.has(turma.id) ? (
                                <div className="flex items-center space-x-1">
                                  <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                                  <span className="text-sm text-blue-600">Atualizando...</span>
                                </div>
                              ) : (
                                <span className="text-sm">{turma.students_count || 0} alunos</span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-4">
                            <Button variant="outline" size="sm" onClick={() => openViewDialog(turma)}>
                              <Eye className="h-3 w-3 mr-1" />
                              Visualizar
                            </Button>
                            {canDeleteTurma && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShiftEditTurma(turma)}
                              >
                                <Clock className="h-3 w-3 mr-1" />
                                Editar turno
                              </Button>
                            )}
                            {canDeleteTurma && (
                              <Button variant="outline" size="sm" onClick={() => openDeleteDialog(turma)}>
                                <Trash2 className="h-3 w-3 mr-1" />
                                Excluir
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {turmasDaEscola.length === 0 && (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10">
                      <Users className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">
                        {searchTerm ? "Nenhuma turma encontrada" : "Nenhuma turma nesta escola"}
                      </h3>
                      <p className="text-muted-foreground text-center">
                        {searchTerm ? "Tente ajustar sua pesquisa" : "Crie uma turma usando o botão acima."}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredTurmas.map((turma) => (
              <Card key={turma.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg font-semibold flex items-center gap-2 flex-wrap">
                    <Users className="h-5 w-5 text-green-600" />
                    {turma.name}
                    <ClassShiftBadge shift={turma.shift} />
                  </CardTitle>
                  <Badge variant="default">Ativa</Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {turma.school?.name || "Escola não definida"}
                      </p>
                    </div>
                    {turma.grade && (
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-4 w-4 text-muted-foreground" />
                        <div className="text-sm">
                          <p><strong>Série:</strong> {turma.grade.name}</p>
                          {turma.grade.education_stage && (
                            <p className="text-xs text-muted-foreground">
                              <strong>Curso:</strong> {turma.grade.education_stage.name}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center space-x-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {updatingCounters.has(turma.id) ? (
                          <div className="flex items-center space-x-1">
                            <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                            <span className="text-sm text-blue-600">Atualizando...</span>
                          </div>
                        ) : (
                          <span className="text-sm">{turma.students_count || 0} alunos</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-4">
                      <Button variant="outline" size="sm" onClick={() => openViewDialog(turma)}>
                        <Eye className="h-3 w-3 mr-1" />
                        Visualizar
                      </Button>
                      {canDeleteTurma && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShiftEditTurma(turma)}
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          Editar turno
                        </Button>
                      )}
                      {canDeleteTurma && (
                        <Button variant="outline" size="sm" onClick={() => openDeleteDialog(turma)}>
                          <Trash2 className="h-3 w-3 mr-1" />
                          Excluir
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredTurmas.length === 0 && !isLoading && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {searchTerm ? "Nenhuma turma encontrada" : "Nenhuma turma cadastrada"}
                </h3>
                <p className="text-muted-foreground text-center mb-4">
                  {searchTerm ? "Tente ajustar sua pesquisa" : "Use o botão acima para criar turmas"}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Modal Criar/Editar com Tabs */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Editar Turma" : "Nova Turma"}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Atualize as informações da turma e gerencie os alunos"
                : "Preencha os dados para criar uma nova turma"}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info">Informações da Turma</TabsTrigger>
              <TabsTrigger value="students" disabled={!editingItem}>
                Alunos ({students.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Turma *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: 5º Ano A"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="school">Escola *</Label>
                  <Select
                    value={formData.school_id}
                    onValueChange={(value) => setFormData({ ...formData, school_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma escola" />
                    </SelectTrigger>
                    <SelectContent>
                      {schools.filter(school => school.id && school.name).map((school) => (
                        <SelectItem key={school.id} value={school.id}>
                          {school.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grade">Série (Opcional)</Label>
                  <Select
                    value={formData.grade_id || "none"}
                    onValueChange={(value) => setFormData({ ...formData, grade_id: value === "none" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma série" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma série</SelectItem>
                      {grades.filter(grade => grade.id && grade.name).map((grade) => (
                        <SelectItem key={grade.id} value={grade.id}>
                          <div className="flex flex-col">
                            <span>{grade.name}</span>
                            {grade.education_stage && (
                              <span className="text-xs text-muted-foreground">
                                {grade.education_stage.name}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <ClassShiftSelector
                  value={formData.shift}
                  onChange={(shift) => setFormData({ ...formData, shift })}
                  disabled={isSubmitting}
                />
                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsModalOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      editingItem ? "Atualizar" : "Criar"
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="students" className="space-y-4">
              {editingItem && (
                <div className="space-y-6">
                  {/* Formulário para adicionar aluno */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5" />
                        Adicionar Novo Aluno
                      </CardTitle>
                      <div className="text-sm text-muted-foreground bg-blue-50 p-3 rounded-lg border border-blue-200">
                        <p className="font-medium text-blue-800 mb-2">📧 Credenciais Automáticas:</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div>
                            <p><strong>Email:</strong> Iniciais do nome + "@afirmeplay.com.br"</p>
                            <p className="text-blue-600 font-mono">Ex: "João Silva" → jss@afirmeplay.com.br</p>
                          </div>
                          <div>
                            <p><strong>Senha:</strong> Primeiro nome + "@afirmeplay"</p>
                            <p className="text-blue-600 font-mono">Ex: "João Silva" → joão@afirmeplay</p>
                          </div>
                        </div>
                        <p className="text-xs mt-2 text-blue-600 font-medium">✨ As credenciais aparecerão automaticamente conforme você digita o nome</p>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-4">
                        {/* Nome - Campo principal em destaque */}
                        <div className="space-y-2">
                          <Label htmlFor="student-name">Nome Completo *</Label>
                          <Input
                            id="student-name"
                            value={addStudentForm.name}
                            onChange={(e) => {
                              const name = e.target.value;
                              setAddStudentForm({
                                ...addStudentForm,
                                name,
                                email: name ? generateEmail(name) : ""
                              });
                            }}
                            placeholder="Digite o nome completo do aluno"
                            disabled={isAddingStudent}
                            className="text-lg"
                          />
                        </div>

                        {/* Credenciais geradas automaticamente */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="student-email">Email (Gerado automaticamente)</Label>
                            <Input
                              id="student-email"
                              value={addStudentForm.email}
                              readOnly
                              className="bg-muted font-mono"
                              placeholder="Email será gerado automaticamente"
                              disabled={isAddingStudent}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="student-password">Senha (Gerada automaticamente)</Label>
                            <Input
                              id="student-password"
                              value={addStudentForm.name ? generatePassword(addStudentForm.name) : ""}
                              readOnly
                              className="bg-muted font-mono"
                              placeholder="Senha será gerada automaticamente"
                              disabled={isAddingStudent}
                            />
                          </div>
                        </div>

                        {/* Campos adicionais */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="student-registration">Matrícula (Opcional)</Label>
                            <Input
                              id="student-registration"
                              value={addStudentForm.registration}
                              onChange={(e) => setAddStudentForm({ ...addStudentForm, registration: e.target.value })}
                              placeholder="Número de matrícula"
                              disabled={isAddingStudent}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="student-birthdate">Data de Nascimento *</Label>
                            <Input
                              id="student-birthdate"
                              type="date"
                              value={addStudentForm.birthDate}
                              onChange={(e) => setAddStudentForm({ ...addStudentForm, birthDate: e.target.value })}
                              disabled={isAddingStudent}
                            />
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={handleAddStudent}
                        disabled={isAddingStudent}
                        className="w-full"
                      >
                        {isAddingStudent ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Adicionando...
                          </>
                        ) : (
                          <>
                            <UserPlus className="mr-2 h-4 w-4" />
                            Adicionar Aluno
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Lista de alunos */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Alunos da Turma ({students.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {isLoadingStudents ? (
                        <div className="space-y-2">
                          <Skeleton className="h-12 w-full" />
                          <Skeleton className="h-12 w-full" />
                          <Skeleton className="h-12 w-full" />
                        </div>
                      ) : students.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                          <p>Nenhum aluno cadastrado nesta turma</p>
                          <p className="text-sm">Use o formulário acima para adicionar alunos</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nome</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Matrícula</TableHead>
                              <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {students.map((student) => (
                              <TableRow key={student.id}>
                                <TableCell className="font-medium">{student.name}</TableCell>
                                <TableCell>{student.user?.email || '-'}</TableCell>
                                <TableCell>{student.registration || "-"}</TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRemoveStudent(student.id)}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Dialog Confirmar Exclusão */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a turma "{deletingItem?.name}"?
              Esta ação não pode ser desfeita e todos os alunos associados serão removidos da turma.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Visualizar Alunos da Turma */}
      <Dialog open={isViewDialogOpen} onOpenChange={(open) => {
        setIsViewDialogOpen(open);
        if (!open) {
          setViewingClass(null);
          setViewStudents([]);
        }
      }}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              Alunos da Turma {viewingClass?.name || ""}
              {viewingClass ? <ClassShiftBadge shift={viewingClass.shift} /> : null}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-2">
              <span>Lista de alunos vinculados a esta turma</span>
              {viewingClass && canDeleteTurma ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-primary"
                  onClick={() => {
                    setShiftEditTurma(viewingClass);
                    setIsViewDialogOpen(false);
                  }}
                >
                  Editar turno
                </Button>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {isLoadingViewStudents ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div>
              {viewStudents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p>Nenhum aluno cadastrado nesta turma</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Matrícula</TableHead>
                    </TableRow>
                  </TableHeader>
                                       <TableBody>
                       {viewStudents.map((student) => (
                         <TableRow key={student.id}>
                           <TableCell className="font-medium">{student.name}</TableCell>
                           <TableCell>{student.user?.email || '-'}</TableCell>
                           <TableCell>{student.registration || '-'}</TableCell>
                         </TableRow>
                       ))}
                     </TableBody>
                </Table>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {shiftEditTurma ? (
        <EditClassShiftDialog
          open={!!shiftEditTurma}
          onOpenChange={(open) => {
            if (!open) setShiftEditTurma(null);
          }}
          classId={shiftEditTurma.id}
          className={shiftEditTurma.name}
          initialShift={shiftEditTurma.shift}
          onSaved={(shift) => handleShiftSaved(shiftEditTurma.id, shift)}
        />
      ) : null}
    </div>
  );
} 