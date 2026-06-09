import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/authContext";
import { 
  Users, 
  Plus, 
  Loader2, 
  Eye, 
  BookOpen, 
  GraduationCap, 
  School,
  Check,
  AlertCircle,
  Sparkles,
  Copy,
  Trash2
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";

// Schema de validação
const classSchema = z
  .object({
  nameType: z.enum(['letter', 'number', 'custom', 'lines'], {
    required_error: "Selecione um tipo de nomenclatura",
  }),
  customName: z.string().optional(),
  selectedLetters: z.array(z.string()).optional(),
  selectedNumbers: z.array(z.string()).optional(),
  educationStageId: z.string().min(1, "Selecione um curso"),
  /** Uma série (obrigatória se `batchGradeIds` estiver vazio). */
  gradeId: z.string().optional(),
  /** Várias séries: combina com letras/números/lista (exceto nome completo por linha e nome personalizado único). */
  batchGradeIds: z.array(z.string()).default([]),
  description: z.string().optional(),
  capacity: z.string().optional(),
  shift: z.enum(['morning', 'afternoon', 'evening', 'full'], {
    required_error: "Selecione um turno",
  }),
  room: z.string().optional(),
  /** Modo `lines`: texto com uma turma por linha (lote). */
  batchLines: z.string().optional(),
  /** Se true, cada linha é o nome completo; se false, prefixa com o nome da série. */
  linesAreFullNames: z.boolean().optional(),
})
  .superRefine((data, ctx) => {
    const batch = data.batchGradeIds ?? [];
    const single = (data.gradeId ?? "").trim();
    if (batch.length === 0 && !single) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione uma série ou marque uma ou mais séries em lote",
        path: ["gradeId"],
      });
    }
  });

type ClassFormValues = z.infer<typeof classSchema>;

interface EducationStage {
  id: string;
  name: string;
}

interface Grade {
  id: string;
  name: string;
  education_stage_id: string;
}

interface CreateClassFormProps {
  schoolId?: string;
  schoolName?: string;
  onSuccess?: () => void;
  // Para permitir seleção de escola quando não houver schoolId
  showSchoolSelector?: boolean;
  availableSchools?: Array<{ id: string; name: string }>;
}

interface ClassPreview {
  /** Nome exibido no preview (série + sufixo, quando aplicável). */
  name: string;
  /** Valor enviado em `POST /classes` no campo `name` (só letra, número, sufixo ou nome completo por linha). */
  apiName: string;
  grade: string;
  /** `grade_id` enviado na API para esta turma. */
  gradeId: string;
  shift: string;
  capacity?: string;
  room?: string;
}

interface ClassCreatePayload {
  name: string;
  school_id: string;
  grade_id: string;
  description?: string;
  capacity?: number;
  shift: string;
  room?: string;
}

/** Cria várias turmas via `POST /classes`, reportando sucessos e falhas parciais. */
async function createClassesInBatch(
  previews: ClassPreview[],
  data: ClassFormValues,
  schoolId: string
): Promise<{ fulfilled: number; rejected: number; firstError?: string }> {
  const payloads: ClassCreatePayload[] = previews.map((classPreview) => ({
    name: classPreview.apiName,
    school_id: schoolId,
    grade_id: classPreview.gradeId,
    description: data.description?.trim() ? data.description.trim() : undefined,
    capacity: (() => {
      if (!data.capacity?.trim()) return undefined;
      const n = parseInt(data.capacity, 10);
      return Number.isFinite(n) ? n : undefined;
    })(),
    shift:
      (
        {
          morning: "Manhã",
          afternoon: "Tarde",
          evening: "Noturno",
          full: "Integral",
        } as Record<string, string>
      )[data.shift] ?? data.shift,
    room: data.room?.trim() ? data.room.trim() : undefined,
  }));

  const results = await Promise.allSettled(
    payloads.map((body) => api.post("/classes", body))
  );

  let fulfilled = 0;
  let rejected = 0;
  let firstError: string | undefined;

  for (const r of results) {
    if (r.status === "fulfilled") {
      fulfilled += 1;
    } else {
      rejected += 1;
      if (!firstError) {
        const reason = r.reason as { response?: { data?: { error?: string; message?: string } } };
        firstError =
          reason?.response?.data?.error ||
          reason?.response?.data?.message ||
          (r.reason instanceof Error ? r.reason.message : undefined);
      }
    }
  }

  return { fulfilled, rejected, firstError };
}

export function CreateClassForm({ schoolId, schoolName, onSuccess, showSchoolSelector, availableSchools }: CreateClassFormProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [educationStages, setEducationStages] = useState<EducationStage[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [classesToCreate, setClassesToCreate] = useState<ClassPreview[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(schoolId || "");
  const { toast } = useToast();
  
  // Use schoolId da prop ou do estado selecionado
  const currentSchoolId = schoolId || selectedSchoolId;

  const form = useForm<ClassFormValues>({
    resolver: zodResolver(classSchema),
    defaultValues: {
      nameType: 'letter',
      selectedLetters: [],
      selectedNumbers: [],
      customName: "",
      educationStageId: "",
      gradeId: "",
      batchGradeIds: [],
      description: "",
      capacity: "",
      shift: 'morning',
      room: "",
      batchLines: "",
      linesAreFullNames: false,
    },
  });

  const nameType = form.watch("nameType");
  const selectedStage = form.watch("educationStageId");
  const selectedGrade = form.watch("gradeId");
  const selectedLetters = form.watch("selectedLetters") || [];
  const selectedNumbers = form.watch("selectedNumbers") || [];
  const customName = form.watch("customName");
  const shift = form.watch("shift");
  const capacity = form.watch("capacity");
  const room = form.watch("room");
  const batchLines = form.watch("batchLines") || "";
  const linesAreFullNames = form.watch("linesAreFullNames") ?? false;
  const batchGradeIds = form.watch("batchGradeIds") ?? [];

  // Opções de letras e números
  const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
  const numbers = Array.from({ length: 20 }, (_, i) => (i + 1).toString());

  // Opções de turnos
  const shifts = [
    { value: 'morning', label: 'Matutino', icon: '🌅' },
    { value: 'afternoon', label: 'Vespertino', icon: '☀️' },
    { value: 'evening', label: 'Noturno', icon: '🌙' },
    { value: 'full', label: 'Integral', icon: '⏰' },
  ];

  useEffect(() => {
    const fetchEducationStages = async () => {
      // Admin: buscar todos os cursos sem restrição
      if (user?.role === 'admin') {
        try {
          const response = await api.get("/education_stages/all");
          setEducationStages(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
          toast({
            title: "Erro",
            description: "Erro ao carregar cursos",
            variant: "destructive",
          });
          setEducationStages([]);
        }
        return;
      }
      
      // Para outros usuários: buscar cursos vinculados à escola específica
      if (!currentSchoolId) {
        setEducationStages([]);
        return;
      }
      
      try {
        // Buscar cursos vinculados à escola específica
        const response = await api.get(`/school/${currentSchoolId}/courses`);
        const data = response.data;
        
        // A resposta tem formato: { school_id, school_name, courses: [...] }
        if (data?.courses && Array.isArray(data.courses)) {
          setEducationStages(data.courses);
        } else {
          setEducationStages([]);
        }
      } catch (error) {
        toast({
          title: "Erro",
          description: "Erro ao carregar cursos",
          variant: "destructive",
        });
        setEducationStages([]);
      }
    };

    if (open) {
      fetchEducationStages();
    }
  }, [open, currentSchoolId, user?.role, toast]);

  useEffect(() => {
    const fetchGrades = async () => {
      if (!selectedStage) {
        setGrades([]);
        return;
      }

      try {
        const response = await api.get(`/grades/by-education-stage/${selectedStage}`);
        setGrades(response.data);
      } catch (error) {
        toast({
          title: "Erro",
          description: "Erro ao carregar séries",
          variant: "destructive",
        });
      }
    };

    fetchGrades();
  }, [selectedStage, toast]);

  const { setValue } = form;

  /** Ao mudar o curso, limpa a seleção de séries em lote (séries pertencem ao curso). */
  useEffect(() => {
    setValue("batchGradeIds", []);
  }, [selectedStage, setValue]);

  // Gerar preview das turmas
  useEffect(() => {
    const generatePreview = () => {
      const shiftObj = shifts.find(s => s.value === shift);
      const shiftLabel = shiftObj?.label || "";

      const resolveGradeTargets = (): Grade[] => {
        if (nameType === "lines" && linesAreFullNames) {
          const g = grades.find((x) => x.id === selectedGrade);
          return g ? [g] : [];
        }
        if (nameType === "custom") {
          if (batchGradeIds.length > 0) {
            const list = batchGradeIds
              .map((id) => grades.find((x) => x.id === id))
              .filter((g): g is Grade => Boolean(g));
            return [...list].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
          }
          const g = grades.find((x) => x.id === selectedGrade);
          return g ? [g] : [];
        }
        if (batchGradeIds.length > 0) {
          const list = batchGradeIds
            .map((id) => grades.find((x) => x.id === id))
            .filter((g): g is Grade => Boolean(g));
          return [...list].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        }
        const g = grades.find((x) => x.id === selectedGrade);
        return g ? [g] : [];
      };

      const gradeTargets = resolveGradeTargets();
      if (gradeTargets.length === 0) {
        setClassesToCreate([]);
        return;
      }

      let classNames: string[] = [];

      if (nameType === "letter") {
        classNames = selectedLetters;
      } else if (nameType === "number") {
        classNames = selectedNumbers;
      } else if (nameType === "custom" && customName) {
        classNames = [customName];
      } else if (nameType === "lines") {
        classNames = batchLines
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
      }

      if (classNames.length === 0) {
        setClassesToCreate([]);
        return;
      }

      const previews: ClassPreview[] = [];
      for (const gradeObj of gradeTargets) {
        for (const suffix of classNames) {
          const apiName = suffix.trim();
          if (!apiName) continue;
          const displayName =
            nameType === "lines" && linesAreFullNames
              ? apiName
              : `${gradeObj.name} ${apiName}`;
          previews.push({
            name: displayName,
            apiName,
            grade: gradeObj.name,
            gradeId: gradeObj.id,
            shift: shiftLabel,
            capacity: capacity || undefined,
            room: room || undefined,
          });
        }
      }

      setClassesToCreate(previews);
    };

    generatePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedGrade,
    selectedLetters,
    selectedNumbers,
    customName,
    nameType,
    grades,
    shift,
    capacity,
    room,
    batchLines,
    linesAreFullNames,
    batchGradeIds,
  ]);

  const handleLetterToggle = (letter: string) => {
    const current = selectedLetters;
    if (current.includes(letter)) {
      form.setValue("selectedLetters", current.filter(l => l !== letter));
    } else {
      form.setValue("selectedLetters", [...current, letter]);
    }
  };

  const handleNumberToggle = (number: string) => {
    const current = selectedNumbers;
    if (current.includes(number)) {
      form.setValue("selectedNumbers", current.filter(n => n !== number));
    } else {
      form.setValue("selectedNumbers", [...current, number]);
    }
  };

  const handleSelectAllLetters = () => {
    const commonLetters = ['A', 'B', 'C', 'D', 'E'];
    form.setValue("selectedLetters", commonLetters);
  };

  const handleSelectAllNumbers = () => {
    const commonNumbers = ['1', '2', '3', '4', '5'];
    form.setValue("selectedNumbers", commonNumbers);
  };

  const handleSubmit = async (data: ClassFormValues) => {
    if (!currentSchoolId) {
      toast({
        title: "Erro",
        description: "Selecione uma escola primeiro",
        variant: "destructive",
      });
      return;
    }
    
    if (classesToCreate.length === 0) {
      toast({
        title: "Erro",
        description: "Configure pelo menos uma turma para criar",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { fulfilled, rejected, firstError } = await createClassesInBatch(
        classesToCreate,
        data,
        currentSchoolId
      );

      if (fulfilled > 0 && rejected === 0) {
        toast({
          title: "Sucesso",
          description: `${fulfilled} turma(s) criada(s) com sucesso.`,
        });
        form.reset();
        setOpen(false);
        onSuccess?.();
      } else if (fulfilled > 0 && rejected > 0) {
        toast({
          title: "Criação parcial",
          description: `${fulfilled} turma(s) criada(s). ${rejected} falha(s).${firstError ? ` Ex.: ${firstError}` : ""}`,
        });
        form.reset();
        setOpen(false);
        onSuccess?.();
      } else {
        toast({
          title: "Erro",
          description: firstError || "Não foi possível criar as turmas.",
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      const errorMessage =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Erro ao criar turma(s)";
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getShiftIcon = (shiftValue: string) => {
    return shifts.find(s => s.value === shiftValue)?.icon || '📚';
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <Users className="mr-2 h-4 w-4" />
          Criar Turma
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-4xl h-[95vh] max-h-[95vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-4 sm:px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Sparkles className="h-5 w-5 text-blue-600" />
            Criar Nova(s) Turma(s)
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base">
            Configure e crie uma ou múltiplas turmas para {schoolName || 'a escola selecionada'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-hidden px-4 sm:px-6">
              <Tabs defaultValue="basic" className="h-full flex flex-col">
                <TabsList className="grid w-full grid-cols-3 my-4">
                <TabsTrigger value="basic" className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Básico
                </TabsTrigger>
                <TabsTrigger value="naming" className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4" />
                  Nomenclatura
                </TabsTrigger>
                <TabsTrigger value="preview" className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Preview ({classesToCreate.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="basic"
                className="flex-1 min-h-0 overflow-y-auto pr-2 pb-4 space-y-6 scrollbar-thin scrollbar-thumb-muted-foreground/30 hover:scrollbar-thumb-muted-foreground/50 scrollbar-track-transparent scroll-smooth"
              >
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <School className="h-5 w-5" />
                      Informações Acadêmicas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Seletor de escola quando showSchoolSelector estiver ativo */}
                    {showSchoolSelector && availableSchools && (
                      <div className="space-y-2">
                        <Label>Escola *</Label>
                        <Select 
                          value={selectedSchoolId} 
                          onValueChange={setSelectedSchoolId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma escola" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableSchools.map((school) => (
                              <SelectItem key={school.id} value={school.id}>
                                {school.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="educationStageId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Curso *</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              value={field.value}
                              disabled={!currentSchoolId && user?.role !== 'admin'}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={
                                    user?.role === 'admin' ? "Selecione o curso" : 
                                    !currentSchoolId ? "Selecione uma escola primeiro" : 
                                    "Selecione o curso"
                                  } />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {educationStages.filter(stage => stage.id && stage.name).map((stage) => (
                                  <SelectItem key={stage.id} value={stage.id}>
                                    {stage.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="gradeId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Série *</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              value={field.value}
                              disabled={!selectedStage}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={!selectedStage ? "Selecione um curso primeiro" : "Selecione a série"} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {grades.filter(grade => grade.id && grade.name).map((grade) => (
                                  <SelectItem key={grade.id} value={grade.id}>
                                    {grade.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {grades.length > 0 && (
                      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <Label className="text-base">Séries em lote (opcional)</Label>
                            <p className="text-xs text-muted-foreground mt-1">
                              Marque várias séries para repetir as mesmas turmas (letras, números, lista ou nome personalizado) em cada uma.
                              Se nenhuma estiver marcada, usa só a série selecionada no campo &quot;Série&quot; acima.
                              Não se aplica à lista com &quot;nome completo&quot; por linha (usa só a série do campo Série).
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 shrink-0">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setValue(
                                  "batchGradeIds",
                                  grades.filter((g) => g.id).map((g) => g.id)
                                )
                              }
                            >
                              Marcar todas
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setValue("batchGradeIds", [])}
                            >
                              Limpar lote
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {grades
                            .filter((g) => g.id && g.name)
                            .map((g) => (
                              <div key={g.id} className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5">
                                <Checkbox
                                  id={`batch-grade-${g.id}`}
                                  checked={batchGradeIds.includes(g.id)}
                                  onCheckedChange={(checked) => {
                                    const cur = form.getValues("batchGradeIds") ?? [];
                                    if (checked === true) {
                                      if (!cur.includes(g.id)) {
                                        setValue("batchGradeIds", [...cur, g.id]);
                                      }
                                    } else {
                                      setValue(
                                        "batchGradeIds",
                                        cur.filter((id) => id !== g.id)
                                      );
                                    }
                                  }}
                                />
                                <Label
                                  htmlFor={`batch-grade-${g.id}`}
                                  className="cursor-pointer text-sm font-normal leading-tight"
                                >
                                  {g.name}
                                </Label>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    <FormField
                      control={form.control}
                      name="shift"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Turno *</FormLabel>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              value={field.value}
                              className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-3"
                            >
                              {shifts.map((shiftOption) => (
                                <div
                                  key={shiftOption.value}
                                  className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5"
                                >
                                  <RadioGroupItem value={shiftOption.value} id={shiftOption.value} />
                                  <Label htmlFor={shiftOption.value} className="flex items-center gap-2 cursor-pointer">
                                    <span>{shiftOption.icon}</span>
                                    {shiftOption.label}
                                  </Label>
                                </div>
                              ))}
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle>Informações Complementares</CardTitle>
                    <CardDescription>Dados opcionais para melhor organização</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="capacity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Capacidade (alunos)</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number" 
                                placeholder="Ex: 30" 
                                min="1"
                                max="50"
                              />
                            </FormControl>
                            <FormDescription>Número máximo de alunos</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="room"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sala</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Ex: Sala 101, Lab A" />
                            </FormControl>
                            <FormDescription>Localização da sala</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descrição</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              placeholder="Observações ou características especiais da turma..."
                              rows={3}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent
                value="naming"
                className="flex-1 min-h-0 overflow-y-auto pr-2 pb-4 space-y-6 scrollbar-thin scrollbar-thumb-muted-foreground/30 hover:scrollbar-thumb-muted-foreground/50 scrollbar-track-transparent scroll-smooth"
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Tipo de Nomenclatura</CardTitle>
                    <CardDescription>Escolha como nomear as turmas</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="nameType"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              value={field.value}
                              className="space-y-4"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="letter" id="letter" />
                                <Label htmlFor="letter" className="font-medium">
                                  Por Letras (A, B, C...)
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="number" id="number" />
                                <Label htmlFor="number" className="font-medium">
                                  Por Números (1, 2, 3...)
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="custom" id="custom" />
                                <Label htmlFor="custom" className="font-medium">
                                  Nome Personalizado
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="lines" id="lines" />
                                <Label htmlFor="lines" className="font-medium">
                                  Lista em lote (uma turma por linha)
                                </Label>
                              </div>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {nameType === 'letter' && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        Selecionar Letras
                        <div className="flex gap-2">
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            onClick={handleSelectAllLetters}
                          >
                            <Copy className="h-4 w-4 mr-1" />
                            A-E
                          </Button>
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            onClick={() => form.setValue("selectedLetters", [])}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Limpar
                          </Button>
                        </div>
                      </CardTitle>
                      <CardDescription>
                        Clique nas letras para selecionar as turmas que deseja criar
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-13 gap-2">
                        {letters.map((letter) => (
                          <Button
                            key={letter}
                            type="button"
                            variant={selectedLetters.includes(letter) ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleLetterToggle(letter)}
                            className={`h-9 w-9 sm:h-10 sm:w-10 ${selectedLetters.includes(letter) ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                          >
                            {letter}
                          </Button>
                        ))}
                      </div>
                      {selectedLetters.length > 0 && (
                        <div className="mt-4 rounded-lg border border-border bg-muted/50 p-3">
                          <p className="mb-2 text-sm font-medium text-foreground">
                            Letras selecionadas ({selectedLetters.length}):
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {selectedLetters.map((letter) => (
                              <Badge key={letter} variant="secondary">
                                {letter}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {nameType === 'number' && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        Selecionar Números
                        <div className="flex gap-2">
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            onClick={handleSelectAllNumbers}
                          >
                            <Copy className="h-4 w-4 mr-1" />
                            1-5
                          </Button>
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            onClick={() => form.setValue("selectedNumbers", [])}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Limpar
                          </Button>
                        </div>
                      </CardTitle>
                      <CardDescription>
                        Clique nos números para selecionar as turmas que deseja criar
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                        {numbers.map((number) => (
                          <Button
                            key={number}
                            type="button"
                            variant={selectedNumbers.includes(number) ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleNumberToggle(number)}
                            className={`h-9 w-9 sm:h-10 sm:w-10 ${selectedNumbers.includes(number) ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                          >
                            {number}
                          </Button>
                        ))}
                      </div>
                      {selectedNumbers.length > 0 && (
                        <div className="mt-4 rounded-lg border border-border bg-muted/50 p-3">
                          <p className="mb-2 text-sm font-medium text-foreground">
                            Números selecionados ({selectedNumbers.length}):
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {selectedNumbers.map((number) => (
                              <Badge key={number} variant="secondary">
                                {number}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {nameType === 'custom' && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Nome Personalizado</CardTitle>
                      <CardDescription>
                        Digite um nome único para a turma
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FormField
                        control={form.control}
                        name="customName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome da Turma</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="Ex: Turma Especial, Aceleração, Reforço..." 
                              />
                            </FormControl>
                            <FormDescription>
                              Este nome será usado como identificador da turma
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                {nameType === "lines" && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Criação em lote por linhas</CardTitle>
                      <CardDescription>
                        Informe uma turma por linha. Com &quot;nome completo&quot; desligado, cada linha vira sufixo após o nome da série (igual às letras/números).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="batchLines"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Lista de turmas</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                placeholder={"A\nB\nC"}
                                rows={10}
                                className="min-h-[160px] font-mono text-sm"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="linesAreFullNames"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5 pr-4">
                              <FormLabel className="text-base">Cada linha é o nome completo da turma</FormLabel>
                              <FormDescription>
                                Desligado: o nome da série escolhida no passo Básico será prefixado em cada linha.
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent
                value="preview"
                className="flex-1 min-h-0 overflow-y-auto pr-2 pb-4 space-y-6 scrollbar-thin scrollbar-thumb-muted-foreground/30 hover:scrollbar-thumb-muted-foreground/50 scrollbar-track-transparent scroll-smooth"
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      Preview das Turmas
                      <Badge variant="secondary">{classesToCreate.length} turma(s)</Badge>
                    </CardTitle>
                    <CardDescription>
                      Visualize como as turmas serão criadas antes de confirmar
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {classesToCreate.length === 0 ? (
                      <div className="text-center py-8">
                        <AlertCircle className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          Configure as informações básicas e a nomenclatura para ver o preview
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:gap-4">
                        {classesToCreate.map((classPreview, index) => (
                          <div 
                            key={`${classPreview.gradeId}-${classPreview.apiName}-${index}`}
                            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground transition-shadow hover:bg-muted/40 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:p-4"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground sm:h-10 sm:w-10">
                                {(classPreview.apiName || "").trim().slice(0, 1).toUpperCase() || "—"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4 className="truncate text-sm font-semibold sm:text-base">
                                  {classPreview.name}
                                </h4>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:gap-4 sm:text-sm">
                                  <Badge variant="outline" className="text-xs font-normal">
                                    {classPreview.grade}
                                  </Badge>
                                  <span className="flex items-center gap-1">
                                    {getShiftIcon(shift)} {classPreview.shift}
                                  </span>
                                  {classPreview.capacity && (
                                    <span className="flex items-center gap-1">
                                      <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                                      {classPreview.capacity} alunos
                                    </span>
                                  )}
                                  {classPreview.room && (
                                    <span className="flex items-center gap-1 truncate">
                                      <School className="h-3 w-3 sm:h-4 sm:w-4" />
                                      <span className="truncate">{classPreview.room}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <Check className="h-5 w-5 flex-shrink-0 self-end text-green-600 dark:text-green-400 sm:self-center" />
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              </Tabs>
            </div>

            <div className="shrink-0 border-t bg-muted/30 px-4 sm:px-6 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    form.reset();
                    setOpen(false);
                  }}
                  disabled={isSubmitting}
                  className="h-10 order-2 sm:order-1"
                >
                  Cancelar
                </Button>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 order-1 sm:order-2">
                  {classesToCreate.length > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {classesToCreate.length} turma(s) será(ão) criada(s)
                    </span>
                  )}
                  <Button 
                    type="submit" 
                    disabled={isSubmitting || classesToCreate.length === 0}
                    className="h-10 bg-blue-600 hover:bg-blue-700"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Criar {classesToCreate.length > 1 ? 'Turmas' : 'Turma'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 