import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import {
  subjectiveTestApi,
  type SubjectiveTestPayload,
  type SubjectiveTestType,
} from "@/services/evaluation/subjectiveTestApi";

interface Option {
  id: string;
  name: string;
}

interface SchoolOption {
  id: string;
  name: string;
}

interface ClassOption {
  id: string;
  name: string;
  school?: { id: string; name: string };
  grade?: { id: string; name: string };
  students_count?: number;
}

interface QuestionDraft {
  number: number;
  code: string;
  skill_description: string;
}

const CreateSubjectiveEvaluation = () => {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [testType, setTestType] = useState<SubjectiveTestType>("AVALIACAO");
  const [applicationDate, setApplicationDate] = useState(new Date().toISOString().slice(0, 10));
  const [subjectId, setSubjectId] = useState("");
  const [course, setCourse] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [state, setState] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [selectedSchools, setSelectedSchools] = useState<SchoolOption[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<ClassOption[]>([]);

  const [courses, setCourses] = useState<Option[]>([]);
  const [grades, setGrades] = useState<Option[]>([]);
  const [states, setStates] = useState<Option[]>([]);
  const [municipalities, setMunicipalities] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [availableClasses, setAvailableClasses] = useState<ClassOption[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [classesLoading, setClassesLoading] = useState(false);

  const [numQuestions, setNumQuestions] = useState(10);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [coursesRes, subjectsRes, statesRes] = await Promise.all([
          api.get("/education_stages"),
          api.get("/subjects"),
          api.get("/city/states"),
        ]);
        if (!active) return;
        setCourses(coursesRes.data || []);
        setSubjects(subjectsRes.data || []);
        setStates(statesRes.data || []);
      } catch (err) {
        console.error(err);
        toast({ title: "Erro", description: "Não foi possível carregar os dados básicos.", variant: "destructive" });
      } finally {
        if (active) setLoadingBootstrap(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [toast]);

  useEffect(() => {
    if (!course) {
      setGrades([]);
      return;
    }
    api
      .get(`/grades/education-stage/${course}`)
      .then((res) => setGrades(res.data || []))
      .catch(() => setGrades([]));
  }, [course]);

  useEffect(() => {
    if (!state) {
      setMunicipalities([]);
      return;
    }
    api
      .get(`/city/municipalities/state/${state}`)
      .then((res) => setMunicipalities(res.data || []))
      .catch(() => setMunicipalities([]));
  }, [state]);

  useEffect(() => {
    if (!municipality) {
      setSchools([]);
      return;
    }
    let active = true;
    setSchoolsLoading(true);
    const fetchSchools = async () => {
      try {
        let schoolsData: SchoolOption[] = [];

        if (gradeId) {
          // Mesmo contrato do CreateEvaluationModal: GET /school/by-grade retorna { schools: [...] }
          const byGrade = await api.get(`/school/by-grade/${gradeId}`);
          schoolsData = byGrade.data?.schools || [];

          if (schoolsData.length > 0) {
            const byCity = await api.get(`/school/city/${municipality}`);
            const cityIds = new Set((byCity.data || []).map((s: SchoolOption) => s.id));
            schoolsData = schoolsData.filter((s) => cityIds.has(s.id));
          }
        } else {
          const res = await api.get(`/school/city/${municipality}`);
          schoolsData = res.data || [];
        }

        if (active) setSchools(schoolsData);
      } catch (err) {
        console.error("Erro ao carregar escolas:", err);
        if (active) setSchools([]);
      } finally {
        if (active) setSchoolsLoading(false);
      }
    };
    fetchSchools();
    return () => {
      active = false;
    };
  }, [municipality, gradeId]);

  useEffect(() => {
    if (selectedSchools.length === 0) {
      setAvailableClasses([]);
      return;
    }
    let active = true;
    setClassesLoading(true);
    Promise.all(selectedSchools.map((s) => api.get(`/classes/school/${s.id}`)))
      .then((responses) => {
        if (!active) return;
        const all = responses.flatMap((r) => r.data || []) as ClassOption[];
        const filtered = gradeId ? all.filter((c) => c.grade?.id === gradeId) : all;
        const unique = Array.from(new Map(filtered.map((c) => [c.id, c])).values());
        setAvailableClasses(unique);
      })
      .catch(() => {
        if (active) setAvailableClasses([]);
      })
      .finally(() => {
        if (active) setClassesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedSchools, gradeId]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoadingDetail(true);
    subjectiveTestApi
      .getById(id)
      .then(async (detail) => {
        if (!active) return;
        setTitle(detail.title || "");
        setDescription(detail.description || "");
        setTestType(detail.test_type === "SIMULADO" ? "SIMULADO" : "AVALIACAO");
        setApplicationDate(detail.application_date || new Date().toISOString().slice(0, 10));
        setSubjectId(detail.subject?.id || "");
        setGradeId(detail.grade?.id || "");
        if (detail.municipalities?.[0]?.id) {
          // Estado não vem no detalhe; município sim — usuário pode reajustar se necessário
          setMunicipality(detail.municipalities[0].id);
        }
        setSelectedSchools((detail.schools || []).map((s) => ({ id: s.id, name: s.name })));
        setSelectedClasses(
          (detail.classes || []).map((c) => ({
            id: c.id,
            name: c.name,
            school: c.school,
            students_count: c.students_count,
          }))
        );
        const qs = (detail.questions || [])
          .slice()
          .sort((a, b) => a.number - b.number)
          .map((q) => ({
            number: q.number,
            code: q.code,
            skill_description: q.skill_description || "",
          }));
        setQuestions(qs);
        setNumQuestions(qs.length || 10);

        // Tentar descobrir o curso a partir da série
        if (detail.grade?.id) {
          try {
            const stages = await api.get("/education_stages");
            for (const stage of stages.data || []) {
              const gradesRes = await api.get(`/grades/education-stage/${stage.id}`);
              if ((gradesRes.data || []).some((g: Option) => g.id === detail.grade?.id)) {
                if (active) setCourse(stage.id);
                break;
              }
            }
          } catch {
            /* ignore */
          }
        }
      })
      .catch((err) => {
        console.error(err);
        toast({ title: "Erro", description: "Não foi possível carregar a avaliação.", variant: "destructive" });
        navigate("/app/avaliacoes-subjetivas");
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });
    return () => {
      active = false;
    };
  }, [id, navigate, toast]);

  const generateQuestions = () => {
    const n = Math.max(1, Math.min(60, numQuestions));
    setQuestions(
      Array.from({ length: n }, (_, i) => ({
        number: i + 1,
        code: `Q${String(i + 1).padStart(2, "0")}`,
        skill_description: questions[i]?.skill_description || "",
      }))
    );
  };

  const updateQuestion = (index: number, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((q, i) => ({ ...q, number: i + 1, code: q.code || `Q${String(i + 1).padStart(2, "0")}` }))
    );
  };

  const addQuestion = () => {
    const next = questions.length + 1;
    setQuestions((prev) => [
      ...prev,
      { number: next, code: `Q${String(next).padStart(2, "0")}`, skill_description: "" },
    ]);
  };

  const toggleSchool = (school: SchoolOption, checked: boolean) => {
    setSelectedSchools((prev) => {
      if (checked) return prev.some((s) => s.id === school.id) ? prev : [...prev, school];
      return prev.filter((s) => s.id !== school.id);
    });
    if (!checked) {
      setSelectedClasses((prev) => prev.filter((c) => c.school?.id !== school.id));
    }
  };

  const toggleClass = (cls: ClassOption, checked: boolean) => {
    setSelectedClasses((prev) => {
      if (checked) return prev.some((c) => c.id === cls.id) ? prev : [...prev, cls];
      return prev.filter((c) => c.id !== cls.id);
    });
  };

  const selectAllClasses = () => setSelectedClasses(availableClasses);
  const clearClasses = () => setSelectedClasses([]);

  const classesBySchool = useMemo(() => {
    const map = new Map<string, ClassOption[]>();
    for (const c of availableClasses) {
      const key = c.school?.id || "unknown";
      const arr = map.get(key) || [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [availableClasses]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: "Título obrigatório", variant: "destructive" });
      return;
    }
    if (!subjectId) {
      toast({ title: "Selecione a disciplina", variant: "destructive" });
      return;
    }
    if (!gradeId) {
      toast({ title: "Selecione a série", variant: "destructive" });
      return;
    }
    if (!applicationDate) {
      toast({ title: "Informe a data de aplicação", variant: "destructive" });
      return;
    }
    if (selectedClasses.length === 0) {
      toast({ title: "Selecione ao menos uma turma", variant: "destructive" });
      return;
    }
    if (questions.length === 0) {
      toast({ title: "Gere ao menos uma questão", variant: "destructive" });
      return;
    }
    if (questions.some((q) => !q.skill_description.trim())) {
      toast({ title: "Preencha a habilidade de todas as questões", variant: "destructive" });
      return;
    }

    const payload: SubjectiveTestPayload = {
      title: title.trim(),
      description: description.trim(),
      test_type: testType,
      subject_id: subjectId,
      grade_id: gradeId,
      application_date: applicationDate,
      municipalities: municipality && municipality !== "all" ? [municipality] : [],
      schools: selectedSchools.map((s) => s.id),
      classes: selectedClasses.map((c) => c.id),
      questions: questions.map((q, i) => ({
        number: i + 1,
        code: q.code.trim() || `Q${String(i + 1).padStart(2, "0")}`,
        skill_description: q.skill_description.trim(),
      })),
    };

    setSaving(true);
    try {
      if (isEdit && id) {
        await subjectiveTestApi.update(id, payload);
        toast({ title: "Avaliação atualizada" });
        navigate(`/app/avaliacoes-subjetivas/${id}`);
      } else {
        const created = await subjectiveTestApi.create(payload);
        toast({ title: "Avaliação subjetiva criada" });
        navigate(`/app/avaliacoes-subjetivas/${created.id}`);
      }
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Erro ao salvar",
        description: err?.response?.data?.message || "Não foi possível salvar a avaliação subjetiva.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loadingBootstrap || loadingDetail) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/avaliacoes-subjetivas")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isEdit ? "Editar avaliação subjetiva" : "Nova avaliação subjetiva"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Cartão-resposta digital: a prova do aluno é física; aqui só a estrutura e a correção por rubrica.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Abrangência</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Curso *</Label>
              <Select value={course} onValueChange={(v) => { setCourse(v); setGradeId(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o curso" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Série *</Label>
              <Select value={gradeId} onValueChange={setGradeId} disabled={!course}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a série" />
                </SelectTrigger>
                <SelectContent>
                  {grades.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={state} onValueChange={(v) => { setState(v); setMunicipality(""); setSelectedSchools([]); setSelectedClasses([]); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  {states.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Município</Label>
              <Select
                value={municipality}
                onValueChange={(v) => { setMunicipality(v); setSelectedSchools([]); setSelectedClasses([]); }}
                disabled={!state}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o município" />
                </SelectTrigger>
                <SelectContent>
                  {municipalities.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Escolas ({selectedSchools.length})</Label>
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
              {schoolsLoading && <p className="text-xs text-muted-foreground">Carregando escolas…</p>}
              {!schoolsLoading && schools.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {!municipality || !gradeId
                    ? "Selecione município e série para listar escolas."
                    : "Nenhuma escola encontrada para os filtros selecionados."}
                </p>
              )}
              {schools.map((school) => {
                const checked = selectedSchools.some((s) => s.id === school.id);
                return (
                  <label key={school.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={checked} onCheckedChange={(v) => toggleSchool(school, v === true)} />
                    {school.name}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Turmas ({selectedClasses.length} selecionadas)</Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectAllClasses} disabled={availableClasses.length === 0}>
                  Selecionar todas ({availableClasses.length})
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearClasses}>
                  Limpar
                </Button>
              </div>
            </div>
            <div className="max-h-56 space-y-3 overflow-y-auto rounded-md border p-3">
              {classesLoading && <p className="text-xs text-muted-foreground">Carregando turmas…</p>}
              {!classesLoading && availableClasses.length === 0 && (
                <p className="text-xs text-muted-foreground">Selecione escolas para listar turmas.</p>
              )}
              {classesBySchool.map(([schoolId, classes]) => (
                <div key={schoolId}>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                    {selectedSchools.find((s) => s.id === schoolId)?.name || "Escola"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {classes.map((cls) => {
                      const on = selectedClasses.some((c) => c.id === cls.id);
                      return (
                        <label
                          key={cls.id}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                            on ? "border-primary bg-primary/10" : "bg-card"
                          }`}
                        >
                          <Checkbox checked={on} onCheckedChange={(v) => toggleClass(cls, v === true)} />
                          {cls.name}
                          {typeof cls.students_count === "number" && (
                            <span className="text-muted-foreground">({cls.students_count})</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Dados da avaliação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Diagnóstica 1º bimestre" />
          </div>
          <div className="space-y-2">
            <Label>Disciplina *</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a disciplina" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select value={testType} onValueChange={(v) => setTestType(v as SubjectiveTestType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AVALIACAO">Avaliação</SelectItem>
                <SelectItem value="SIMULADO">Simulado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Data de aplicação *</Label>
            <Input type="date" value={applicationDate} onChange={(e) => setApplicationDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">Somente para consulta — não dispara aplicação automática.</p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Descrição</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <CardTitle className="text-base">3. Questões / Habilidades</CardTitle>
            <div className="flex items-end gap-2">
              <div>
                <Label className="text-xs">Nº de questões</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Number(e.target.value) || 1)}
                  className="w-24"
                />
              </div>
              <Button type="button" variant="outline" onClick={generateQuestions}>
                Gerar Q1..Q{numQuestions}
              </Button>
              <Button type="button" variant="outline" onClick={addQuestion}>
                <Plus className="mr-1 h-4 w-4" />
                Questão
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {questions.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Defina o número de questões e clique em <b>Gerar</b>.
            </p>
          ) : (
            <div className="space-y-2">
              {questions.map((q, i) => (
                <div key={i} className="grid gap-2 rounded-md border p-2 md:grid-cols-[70px_100px_1fr_auto]">
                  <Badge variant="outline" className="justify-center self-center">
                    #{q.number}
                  </Badge>
                  <Input
                    value={q.code}
                    onChange={(e) => updateQuestion(i, { code: e.target.value })}
                    placeholder="Q01"
                  />
                  <Input
                    value={q.skill_description}
                    onChange={(e) => updateQuestion(i, { skill_description: e.target.value })}
                    placeholder="Digite o nome da habilidade"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeQuestion(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pb-8">
        <Button variant="outline" onClick={() => navigate("/app/avaliacoes-subjetivas")}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? "Salvar alterações" : "Criar avaliação"}
        </Button>
      </div>
    </div>
  );
};

export default CreateSubjectiveEvaluation;
