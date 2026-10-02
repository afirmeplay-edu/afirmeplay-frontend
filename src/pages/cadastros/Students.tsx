import { useEffect, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Eye, Pencil, Trash2, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/lib/api";
import { useParams } from "react-router-dom";
import { useDataContext } from "@/context/dataContext";

// Form schema for student data
const studentSchema = z.object({
  fullName: z.string().min(3, "Nome muito curto").max(100),
  email:z.string().email("Email inválido"),
  senha:z.string(),
  matricula:z.string(),
  birthDate: z.coerce.date({
    required_error: "Data de nascimento é obrigatória",
    invalid_type_error: "Data de nascimento inválida",
  }),
  grade: z.string().nonempty("Série é obrigatória"),
  course: z.string().nonempty("Curso é obrigatório"),
});

type StudentFormData = z.infer<typeof studentSchema>;

interface CoursesType {
  id: string;
  name: string;
}

interface StudentType {
  id: string;
  nome: string;
  matricula: string;
  brith_date: string;
  education_stage_id: string;
  grade_id: string;
  criado_em: string;
}

interface EscolaType {
  id: string;
  name: string;
}

export default function Students() {
  const [students, setStudents] = useState<StudentType[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentType | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [courses, setCourses] = useState<CoursesType[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CoursesType>({
    id: "",
    name: ""
  });
  const [gradesByStage, setGradesByStage] = useState([]);
  const [grades, setGrades] = useState([]);
  const [reloadAlunos, setReloadAlunos] = useState(false);
  const [escolaAtual, setEscolaAtual] = useState<EscolaType>({ id: "", name: "" });

  const { toast } = useToast();
  const { id } = useParams();
  const { escolas } = useDataContext();

  useEffect(() => {
    if (escolas && escolas.length > 0) {
      const escola = escolas.find((e: EscolaType) => e.id === id);
      if (escola) {
        setEscolaAtual(escola);
      }
    }
  }, [escolas, id]);

  useEffect(() => {
    api.get(`/students/school/${id}`).then((res) => {
      setStudents(res.data);
    }).catch(() => {});
  }, [reloadAlunos, id]);

  useEffect(() => {
    api.get("/education_stages").then((res) => {
      setCourses(res.data);
    }).catch(() => {});

    api.get("/grades/").then(res => {
      setGrades(res.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCourse.id) {
      api.get(`/education_stages/${selectedCourse.id}`).then(res => {
        setGradesByStage(res.data);
      }).catch(() => {});
    }
  }, [selectedCourse]);

  function returnEducationStage(id: string) {
    if (courses.length > 0) {
      const atualCourse = courses.filter(course => course.id === id);
      return atualCourse[0]?.name || "Carregando...";
    } else {
      return "Carregando...";
    }
  }

  function returnGrade(id: string) {
    if (grades.length > 0) {
      const atualGrade = grades.filter(grade => grade.id === id);
      return atualGrade[0]?.name || "Carregando...";
    } else {
      return "Carregando...";
    }
  }

  const {
    register: registerAdd,
    handleSubmit: handleSubmitAdd,
    formState: { errors: errorsAdd },
    reset: resetAdd,
  } = useForm<StudentFormData>({
    resolver: zodResolver(studentSchema),
  });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    formState: { errors: errorsEdit },
    reset: resetEdit,
  } = useForm<StudentFormData>({
    resolver: zodResolver(studentSchema),
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };

  const handleAddStudent = async (data: StudentFormData) => {
    const fullName = data.fullName.toLocaleUpperCase("pt-BR");
    const newStudent = {
      name: fullName,
      email: data.email,
      password: data.senha,
      registration: data.matricula,
      birth_date: data.birthDate,
      class_id: "", // This would need to be selected by the user
      city_id: "", // This would need to be retrieved from context or user
      grade_id: data.grade
    };
    await api.post("/students", newStudent).then((res) => {
      toast({
        title: "Aluno adicionado",
        description: `${fullName} foi adicionado com sucesso.`,
      });
    }).catch(e => {
      toast({
        title: "Erro ao adicionar o aluno!",
        description: e.response?.data?.error || "Erro desconhecido",
        variant: "destructive",
      });
    });

    setIsAddDialogOpen(false);
    resetAdd();
    setReloadAlunos(prev => !prev);
  };

  const handleEditStudent = async (data: StudentFormData) => {
    if (!selectedStudent) return;
    const editedStudent = {
      nome: data.fullName,
      email: data.email,
      senha: data.senha,
      matricula: data.matricula,
      birth_date: data.birthDate,
      education_stage_id: data.course,
      grade_id: data.grade
    };

    await api.put(`/students/${selectedStudent.id}`, editedStudent);
    setIsEditDialogOpen(false);
    setSelectedStudent(null);
    resetEdit();
    setReloadAlunos(prev => !prev);
    toast({
      title: "Aluno atualizado",
      description: `${data.fullName} foi atualizado com sucesso.`,
    });
  };

  const handleDeleteStudent = async (id: string) => {
    await api.delete(`/students/${id}`).then(() => {
      toast({
        title: "Aluno removido",
        variant: "destructive",
      });
      setReloadAlunos(prev => !prev);
    }).catch(e => {
      toast({
        title: "Aluno não encontrado!",
        description: `${e}`
      });
    });
  };

  const openEditDialog = (student: StudentType) => {
    setSelectedStudent(student);
    const courseId = student.education_stage_id || "";
    const courseName = courses.find((c) => c.id === courseId)?.name ?? "";
    setSelectedCourse({ id: courseId, name: courseName });
    setIsEditDialogOpen(true);
    resetEdit({
      fullName: student.nome,
      birthDate: new Date(student.brith_date),
      grade: student.grade_id || "",
      course: courseId,
      email: "",
      senha: "",
      matricula: student.matricula
    });
  };

  const filteredStudents = students.filter((student) =>
    student.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <div className="container mx-auto px-2 md:px-4 py-4 md:py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
              <Users className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 shrink-0" />
              Alunos da escola {escolaAtual.name}
            </h1>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto justify-center sm:justify-end">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Buscar alunos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-full"
              />
            </div>

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="whitespace-nowrap">
                  <Plus className="mr-2 h-4 w-4" /> Adicionar Aluno
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[900px] w-[95%] max-w-full sm:w-auto">
                <DialogHeader>
                  <DialogTitle>Adicionar Novo Aluno</DialogTitle>
                  <DialogDescription>
                    Preencha os dados do aluno para cadastrá-lo no sistema.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmitAdd(handleAddStudent)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="add-name">Nome Completo</Label>
                    <Input
                      id="add-name"
                      {...registerAdd("fullName")}
                      placeholder="Nome completo do aluno"
                    />
                    {errorsAdd.fullName && (
                      <p className="text-sm text-red-500">{errorsAdd.fullName.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="matricula">Número de Matrícula</Label>
                    <Input
                      id="matricula"
                      {...registerAdd("matricula")}
                      placeholder="Número de Matrícula"
                    />
                    {errorsAdd.matricula && (
                      <p className="text-sm text-red-500">{errorsAdd.matricula.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      {...registerAdd("email")}
                      placeholder="Email do aluno"
                      type="email"
                    />
                    {errorsAdd.email && (
                      <p className="text-sm text-red-500">{errorsAdd.email.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input
                      id="password"
                      {...registerAdd("senha")}
                      placeholder="Senha do aluno"
                      type="password"
                    />
                    {errorsAdd.senha && (
                      <p className="text-sm text-red-500">{errorsAdd.senha.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="add-birthDate">Data de Nascimento</Label>
                    <Input
                      id="add-birthDate"
                      type="date"
                      {...registerAdd("birthDate")}
                    />
                    {errorsAdd.birthDate && (
                      <p className="text-sm text-red-500">{errorsAdd.birthDate.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Curso */}
                    <div className="space-y-2">
                      <Label htmlFor="add-course">Curso</Label>
                      <select
                        id="add-course"
                        {...registerAdd("course")}
                        className="w-full p-2 border rounded-md"
                        onChange={e => setSelectedCourse({ id: e.target.value, name: "" })}
                      >
                        <option value="">Selecione um curso</option>
                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.name}
                          </option>
                        ))}
                      </select>
                      {errorsAdd.course && (
                        <p className="text-sm text-red-500">{errorsAdd.course.message}</p>
                      )}
                    </div>

                    {/* Série */}
                    <div className="space-y-2">
                      <Label htmlFor="add-grade">Série</Label>
                      <select
                        id="add-grade"
                        {...registerAdd("grade")}
                        className="w-full p-2 border rounded-md"
                      >
                        <option value="">Selecione uma série</option>
                        {gradesByStage.map((grade) => (
                          <option key={grade.id} value={grade.id}>
                            {grade.name}
                          </option>
                        ))}
                      </select>
                      {errorsAdd.grade && (
                        <p className="text-sm text-red-500">{errorsAdd.grade.message}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsAddDialogOpen(false);
                        resetAdd();
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit">Adicionar</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden overflow-x-auto">
          <div className="min-w-full">
            <Table>
              <TableCaption>Lista de alunos cadastrados</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Nome Completo</TableHead>
                  <TableHead className="hidden sm:table-cell">Curso</TableHead>
                  <TableHead className="hidden md:table-cell">Série</TableHead>
                  <TableHead className="hidden lg:table-cell">Data de Cadastro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{student.nome}</TableCell>
                    <TableCell className="hidden sm:table-cell">{returnEducationStage(student.education_stage_id)}</TableCell>
                    <TableCell className="hidden md:table-cell">{returnGrade(student.grade_id)}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {formatDate(student.criado_em)}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(student)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteStudent(student.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[500px] w-[95%] max-w-full sm:w-auto">
            <DialogHeader>
              <DialogTitle>Editar Aluno</DialogTitle>
              <DialogDescription>
                Edite os dados do aluno conforme necessário.
              </DialogDescription>
            </DialogHeader>

            {selectedStudent && (
              <form onSubmit={handleSubmitEdit(handleEditStudent)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Nome Completo</Label>
                  <Input
                    id="edit-name"
                    {...registerEdit("fullName")}
                    placeholder="Nome completo do aluno"
                  />
                  {errorsEdit.fullName && (
                    <p className="text-sm text-red-500">{errorsEdit.fullName.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="matricula">Número de Matrícula</Label>
                  <Input
                    id="matricula"
                    {...registerEdit("matricula")}
                    placeholder="Número de Matrícula"
                  />
                  {errorsEdit.matricula && (
                    <p className="text-sm text-red-500">{errorsEdit.matricula.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    {...registerEdit("email")}
                    placeholder="Email do aluno"
                    type="email"
                  />
                  {errorsEdit.email && (
                    <p className="text-sm text-red-500">{errorsEdit.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    {...registerEdit("senha")}
                    placeholder="Senha do aluno"
                    type="password"
                  />
                  {errorsEdit.senha && (
                    <p className="text-sm text-red-500">{errorsEdit.senha.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="add-birthDate">Data de Nascimento</Label>
                  <Input
                    id="add-birthDate"
                    type="date"
                    {...registerEdit("birthDate")}
                  />
                  {errorsEdit.birthDate && (
                    <p className="text-sm text-red-500">{errorsEdit.birthDate.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Curso */}
                  <div className="space-y-2">
                    <Label htmlFor="edit-course">Curso</Label>
                    <select
                      id="edit-course"
                      {...registerEdit("course")}
                      className="w-full p-2 border rounded-md"
                      onChange={e => setSelectedCourse({ id: e.target.value, name: "" })}
                    >
                      <option value="">Selecione um curso</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name}
                        </option>
                      ))}
                    </select>
                    {errorsEdit.course && (
                      <p className="text-sm text-red-500">{errorsEdit.course.message}</p>
                    )}
                  </div>

                  {/* Série */}
                  <div className="space-y-2">
                    <Label htmlFor="edit-grade">Série</Label>
                    <select
                      id="edit-grade"
                      {...registerEdit("grade")}
                      className="w-full p-2 border rounded-md"
                    >
                      <option value="">Selecione uma série</option>
                      {gradesByStage.map((grade) => (
                        <option key={grade.id} value={grade.id}>
                          {grade.name}
                        </option>
                      ))}
                    </select>
                    {errorsEdit.grade && (
                      <p className="text-sm text-red-500">{errorsEdit.grade.message}</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      setSelectedStudent(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit">Salvar Alterações</Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
