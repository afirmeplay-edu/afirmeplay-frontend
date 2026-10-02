import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Upload, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { AxiosError } from "axios";
import { useEmailCheck, generatePasswordFromName } from "@/hooks/useEmailCheck";

interface ApiError {
  error: string;
}

interface Class {
  id: string;
  name: string;
  grade_id: string;
  grade: {
    id: string;
    name: string;
  };
}

interface AddStudentFormProps {
  schoolId: string;
  schoolName: string;
  onSuccess?: () => void;
}

export function AddStudentForm({ schoolId, schoolName, onSuccess }: AddStudentFormProps) {
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [name, setName] = useState("");
  const [registration, setRegistration] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const response = await api.get(`/classes/school/${schoolId}`);
        setClasses(response.data);
      } catch (error) {
        console.error("Error fetching classes:", error);
        toast({
          title: "Erro",
          description: "Erro ao carregar turmas",
          variant: "destructive",
        });
      }
    };

    if (open) {
      fetchClasses();
    }
  }, [schoolId, open, toast]);

  const { checkedEmail, isChecking, isAvailable } = useEmailCheck(name);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const handleSubmit = async () => {
    if (!name || !selectedClass || !birthDate) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    const selectedClassData = classes.find(c => c.id === selectedClass);
    if (!selectedClassData) return;

    setIsLoading(true);
    try {
      // Single call to create user (if not exists) and student
      const response = await api.post("/students", {
        name: name.toLocaleUpperCase("pt-BR"),
        email: checkedEmail,
        password: generatePasswordFromName(name),
        registration: registration || undefined,
        birth_date: birthDate,
        class_id: selectedClass,
        grade_id: selectedClassData.grade_id,
        city_id: schoolId, // Add city_id using schoolId
      });


      toast({
        title: "Sucesso",
        description: "Aluno adicionado com sucesso", // Message might vary based on backend response
      });

      setOpen(false);
      setName("");
      setRegistration("");
      setBirthDate("");
      setSelectedClass("");
      onSuccess?.();
    } catch (error) {
      console.error("Error adding student:", error);
      const axiosError = error as AxiosError<ApiError>;
      toast({
        title: "Erro",
        description: axiosError.response?.data?.error || "Erro ao adicionar aluno",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFile) {
      toast({
        title: "Erro",
        description: "Selecione um arquivo CSV",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const formData = new FormData();
    formData.append("file", csvFile);
    formData.append("school_id", schoolId);

    try {
      await api.post("/students/csv", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      toast({
        title: "Sucesso",
        description: "Alunos importados com sucesso",
      });

      setOpen(false);
      setCsvFile(null);
      onSuccess?.();
    } catch (error) {
      console.error("Error uploading CSV:", error);
      const axiosError = error as AxiosError<ApiError>;
      toast({
        title: "Erro",
        description: axiosError.response?.data?.error || "Erro ao importar alunos",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Adicionar Aluno
        </Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-2xl lg:max-w-3xl max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-3 border-b">
          <DialogTitle className="text-lg sm:text-xl">Adicionar Aluno - {schoolName}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="manual" className="w-full flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="csv">CSV</TabsTrigger>
          </TabsList>
          <TabsContent value="manual" className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            <div className="space-y-6 py-4">
              {/* Info Box */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
                <p className="font-semibold text-blue-800 text-sm mb-2">📧 Credenciais Automáticas</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white/70 p-2 rounded">
                    <p><strong>Email:</strong> Iniciais + "@afirmeplay.com.br"</p>
                    <p className="text-blue-600 font-mono">Ex: "João Silva" → js@afirmeplay.com.br</p>
                  </div>
                  <div className="bg-white/70 p-2 rounded">
                    <p><strong>Senha:</strong> Primeiro nome + "@afirmeplay"</p>
                    <p className="text-blue-600 font-mono">Ex: "João Silva" → joão@afirmeplay</p>
                  </div>
                </div>
              </div>

              {/* Nome - Principal */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-base font-semibold flex items-center gap-1">
                  Nome Completo
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={handleNameChange}
                  placeholder="Digite o nome completo do aluno"
                  disabled={isLoading}
                  className="h-11 text-lg"
                />
              </div>

              {/* Email e Senha gerados */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm text-gray-600">Email (Gerado automaticamente)</Label>
                  <div className="relative">
                    <Input
                      id="email"
                      value={checkedEmail}
                      readOnly
                      className="bg-gray-50 border-gray-200 font-mono h-11 cursor-not-allowed pr-8"
                      placeholder="Email será gerado"
                      disabled={isLoading}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      {isChecking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      {!isChecking && isAvailable === true && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {!isChecking && isAvailable === false && <AlertCircle className="h-4 w-4 text-amber-500" />}
                    </div>
                  </div>
                  {!isChecking && isAvailable === false && (
                    <p className="text-xs text-amber-600">Email original em uso. Usando sugestão disponível.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm text-gray-600">Senha (Gerada automaticamente)</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={generatePasswordFromName(name)}
                      readOnly
                      className="bg-gray-50 border-gray-200 font-mono h-11 cursor-not-allowed pr-10"
                      placeholder="Senha será gerada"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Ocultar senha" : "Ver senha"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Matrícula e Data */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="registration">Matrícula (opcional)</Label>
                  <Input
                    id="registration"
                    value={registration}
                    onChange={(e) => setRegistration(e.target.value)}
                    placeholder="Número de matrícula"
                    disabled={isLoading}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="birthDate" className="flex items-center gap-1">
                    Data de Nascimento
                    <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="birthDate"
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    disabled={isLoading}
                    className="h-11"
                  />
                </div>
              </div>

              {/* Turma */}
              <div className="space-y-2">
                <Label htmlFor="class" className="flex items-center gap-1">
                  Turma
                  <span className="text-red-500">*</span>
                </Label>
                <Select 
                  value={selectedClass} 
                  onValueChange={setSelectedClass}
                  disabled={isLoading}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Selecione a turma" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((classItem) => (
                      <SelectItem key={classItem.id} value={classItem.id}>
                        {classItem.name} - {classItem.grade.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Botões */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                <Button 
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isLoading}
                  className="order-2 sm:order-1 h-11"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSubmit} 
                  disabled={isLoading}
                  className="order-1 sm:order-2 flex-1 h-11 bg-green-600 hover:bg-green-700"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Adicionar Aluno
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="csv" className="flex-1 overflow-y-auto pr-2">
            <div className="space-y-6 py-4">
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
                <p className="font-semibold text-green-800 text-sm mb-2">📄 Importação em Massa</p>
                <p className="text-xs text-green-700">
                  Faça upload de um arquivo CSV contendo dados de múltiplos alunos para importação rápida.
                </p>
              </div>

              <div className="space-y-3">
                <Label htmlFor="csv" className="text-base font-semibold">Arquivo CSV</Label>
                <Input
                  id="csv"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  disabled={isLoading}
                  className="h-11 cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                />
                <p className="text-xs text-gray-500">
                  Formato aceito: .csv
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                <Button 
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isLoading}
                  className="order-2 sm:order-1 h-11"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleCsvUpload} 
                  disabled={isLoading || !csvFile}
                  className="order-1 sm:order-2 flex-1 h-11 bg-green-600 hover:bg-green-700"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Importar CSV
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
} 