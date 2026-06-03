import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/authContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import {
  extractApiError,
  fetchGabaritoStudents,
  fetchManualEntry,
  submitManualCorrection,
} from '@/services/answer-sheet/answerSheetManualApi';
import type {
  Gabarito,
  GabaritoStudentListItem,
  GabaritoStudentsClassGroup,
  GabaritoStudentsResponse,
  GabaritoStudentsQuery,
  GabaritosResponse,
  ManualAnswerValue,
  ManualCorrectionResponse,
  ManualEntryBlock,
  ManualEntryResponse,
} from '@/types/answer-sheet';
import {
  cartaoCorrectionStatusLabel,
  detectionMethodLabel,
  gabaritoEntryKindLabel,
  resolveStudentCorrectionStatus,
} from '@/utils/answer-sheet/cartaoCorrectionStatus';
import type { ManualCorrectionScope } from '@/services/answer-sheet/answerSheetManualApi';
import {
  buildAnswerSheetStudentDetailHref,
  resolveAnswerSheetDetailQueryContext,
  type AnswerSheetDetailQueryContext,
} from '@/utils/answer-sheet/buildAnswerSheetStudentDetailHref';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ClipboardList,
  Loader2,
  Pencil,
  Save,
  Search,
  User,
  Users,
} from 'lucide-react';

type ManualStep = 'pick' | 'form' | 'result';

function normalizeFilterOptions(
  items: { id: string; name: string }[]
): { id: string; name: string }[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (!i.id || seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}

function flattenClassGroups(classes: GabaritoStudentsClassGroup[]): GabaritoStudentListItem[] {
  return classes.flatMap((cls) =>
    cls.students.map((s) => ({
      ...s,
      class_id: s.class_id ?? cls.class_id,
      class_name: s.class_name ?? cls.class_name,
      grade_id: s.grade_id ?? cls.grade_id,
      grade_name: s.grade_name ?? cls.grade_name,
      school_id: s.school_id ?? cls.school_id,
      school_name: s.school_name ?? cls.school_name,
    }))
  );
}

function studentsFromResponse(data: GabaritoStudentsResponse): GabaritoStudentListItem[] {
  if (data.students?.length) return data.students;
  if (data.classes?.length) return flattenClassGroups(data.classes);
  return [];
}

function buildInitialAnswers(entry: ManualEntryResponse): Record<string, ManualAnswerValue> {
  const out: Record<string, ManualAnswerValue> = {};
  for (const block of entry.blocks) {
    for (const q of block.questions) {
      const key = String(q.q);
      const saved = entry.saved_answers?.[key];
      out[key] = saved === undefined || saved === '' ? null : saved;
    }
  }
  return out;
}

function buildAnswersPayload(
  blocks: ManualEntryBlock[],
  answers: Record<string, ManualAnswerValue>
): Record<string, ManualAnswerValue> {
  const out: Record<string, ManualAnswerValue> = {};
  for (const block of blocks) {
    for (const q of block.questions) {
      const key = String(q.q);
      const v = answers[key];
      out[key] = v === undefined || v === '' ? null : v;
    }
  }
  return out;
}

function isEditingPreviousEntry(entry: ManualEntryResponse): boolean {
  if (entry.existing_result_id) return true;
  const saved = entry.saved_answers;
  if (!saved) return false;
  return Object.values(saved).some((v) => v != null && v !== '');
}

/** Status abaixo do nome — só <span> (válido dentro de <button>; Badge/div some no DOM). */
function StudentStatusLine({ student }: { student: GabaritoStudentListItem }) {
  const status = resolveStudentCorrectionStatus(student);
  const label = cartaoCorrectionStatusLabel(status);
  const method = detectionMethodLabel(student.detection_method);
  const isCorrected = status === 'P';

  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
          isCorrected
            ? 'border-green-200 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-950/80 dark:text-green-300'
            : 'border-border bg-muted/60 text-foreground'
        )}
      >
        {label}
      </span>
      {method ? <span className="text-xs text-muted-foreground">{method}</span> : null}
    </span>
  );
}

export default function ManualCorrectionPanel() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [gabaritos, setGabaritos] = useState<Gabarito[]>([]);
  const [loadingGabaritos, setLoadingGabaritos] = useState(true);
  const [selectedGabaritoId, setSelectedGabaritoId] = useState('');

  const [studentFilters, setStudentFilters] = useState<GabaritoStudentsQuery>({});
  const [studentsData, setStudentsData] = useState<GabaritoStudentsResponse | null>(null);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  const [step, setStep] = useState<ManualStep>('pick');
  const [selectedStudent, setSelectedStudent] = useState<GabaritoStudentListItem | null>(null);
  const [manualEntry, setManualEntry] = useState<ManualEntryResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, ManualAnswerValue>>({});
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<ManualCorrectionResponse | null>(null);
  const [detailQueryContext, setDetailQueryContext] = useState<AnswerSheetDetailQueryContext | null>(
    null
  );

  const selectedGabarito = gabaritos.find((g) => g.id === selectedGabaritoId);

  const selectedScope = useMemo((): ManualCorrectionScope | null => {
    if (!selectedGabarito) return null;
    return { gabaritoId: selectedGabarito.id, testId: selectedGabarito.test_id };
  }, [selectedGabarito]);

  const filterOptions = useMemo(() => {
    const classes = studentsData?.classes ?? [];
    const schools = normalizeFilterOptions(
      classes.map((c) => ({ id: c.school_id ?? '', name: c.school_name ?? 'Escola' })).filter((x) => x.id)
    );
    const grades = normalizeFilterOptions(
      classes
        .filter((c) => !studentFilters.school_id || c.school_id === studentFilters.school_id)
        .map((c) => ({ id: c.grade_id ?? '', name: c.grade_name ?? 'Série' }))
        .filter((x) => x.id)
    );
    const classOpts = normalizeFilterOptions(
      classes
        .filter((c) => {
          if (studentFilters.school_id && c.school_id !== studentFilters.school_id) return false;
          if (studentFilters.grade_id && c.grade_id !== studentFilters.grade_id) return false;
          return true;
        })
        .map((c) => ({ id: c.class_id, name: c.class_name }))
    );
    return { schools, grades, classOpts };
  }, [studentsData, studentFilters.school_id, studentFilters.grade_id]);

  const allStudents = useMemo(
    () => (studentsData ? studentsFromResponse(studentsData) : []),
    [studentsData]
  );

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return allStudents;
    return allStudents.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.registration ?? '').toLowerCase().includes(q) ||
        (s.class_name ?? '').toLowerCase().includes(q)
    );
  }, [allStudents, studentSearch]);

  const groupedByClass = useMemo(() => {
    if (studentsData?.classes?.length) {
      return studentsData.classes
        .map((cls) => ({
          ...cls,
          students: cls.students.filter((s) =>
            filteredStudents.some((f) => f.student_id === s.student_id)
          ),
        }))
        .filter((cls) => cls.students.length > 0);
    }
    const byClass = new Map<string, GabaritoStudentListItem[]>();
    for (const s of filteredStudents) {
      const key = s.class_id ?? 'unknown';
      if (!byClass.has(key)) byClass.set(key, []);
      byClass.get(key)!.push(s);
    }
    return Array.from(byClass.entries()).map(([classId, students]) => ({
      class_id: classId,
      class_name: students[0]?.class_name ?? 'Turma',
      grade_name: students[0]?.grade_name,
      school_name: students[0]?.school_name,
      students,
    }));
  }, [studentsData, filteredStudents]);

  const loadGabaritos = useCallback(async () => {
    try {
      setLoadingGabaritos(true);
      const res = await api.get<GabaritosResponse>('/answer-sheets/gabaritos');
      setGabaritos(res.data?.gabaritos ?? []);
    } catch (error) {
      toast({
        title: 'Erro',
        description: extractApiError(error),
        variant: 'destructive',
      });
      setGabaritos([]);
    } finally {
      setLoadingGabaritos(false);
    }
  }, [toast]);

  const loadStudents = useCallback(
    async (gabaritoId: string, filters: GabaritoStudentsQuery) => {
      try {
        setLoadingStudents(true);
        const data = await fetchGabaritoStudents(gabaritoId, filters);
        setStudentsData(data);
      } catch (error) {
        toast({
          title: 'Erro',
          description: extractApiError(error),
          variant: 'destructive',
        });
        setStudentsData(null);
      } finally {
        setLoadingStudents(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    loadGabaritos();
  }, [loadGabaritos]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ctx = await resolveAnswerSheetDetailQueryContext({
        userId: user?.id,
        userRole: user?.role,
        tenantId: user?.tenant_id,
        escola: studentFilters.school_id,
        serie: studentFilters.grade_id,
        turma: studentFilters.class_id,
      });
      if (!cancelled) setDetailQueryContext(ctx);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    user?.role,
    user?.tenant_id,
    studentFilters.school_id,
    studentFilters.grade_id,
    studentFilters.class_id,
  ]);

  const studentDetailHref = useMemo(() => {
    if (!selectedGabaritoId || !saveResult?.student_id || !detailQueryContext) return null;
    return buildAnswerSheetStudentDetailHref(selectedGabaritoId, saveResult.student_id, {
      ...detailQueryContext,
      escola:
        studentFilters.school_id ??
        selectedStudent?.school_id ??
        detailQueryContext.escola,
      serie:
        studentFilters.grade_id ??
        selectedStudent?.grade_id ??
        detailQueryContext.serie,
      turma:
        studentFilters.class_id ??
        selectedStudent?.class_id ??
        detailQueryContext.turma,
    });
  }, [
    selectedGabaritoId,
    saveResult?.student_id,
    detailQueryContext,
    studentFilters.school_id,
    studentFilters.grade_id,
    studentFilters.class_id,
    selectedStudent?.school_id,
    selectedStudent?.grade_id,
    selectedStudent?.class_id,
  ]);

  useEffect(() => {
    if (!selectedGabaritoId) {
      setStudentsData(null);
      return;
    }
    loadStudents(selectedGabaritoId, studentFilters);
  }, [selectedGabaritoId, studentFilters, loadStudents]);

  const resetToPick = () => {
    setStep('pick');
    setSelectedStudent(null);
    setManualEntry(null);
    setAnswers({});
    setSaveResult(null);
  };

  const handleGabaritoChange = (id: string) => {
    setSelectedGabaritoId(id);
    setStudentFilters({});
    setStudentSearch('');
    resetToPick();
  };

  const handleFilterSchool = (schoolId: string) => {
    setStudentFilters((prev) => ({
      school_id: schoolId === 'all' ? undefined : schoolId,
      grade_id: undefined,
      class_id: undefined,
    }));
  };

  const handleFilterGrade = (gradeId: string) => {
    setStudentFilters((prev) => ({
      ...prev,
      grade_id: gradeId === 'all' ? undefined : gradeId,
      class_id: undefined,
    }));
  };

  const handleFilterClass = (classId: string) => {
    setStudentFilters((prev) => ({
      ...prev,
      class_id: classId === 'all' ? undefined : classId,
    }));
  };

  const handleSelectStudent = async (student: GabaritoStudentListItem) => {
    if (!student.can_manual_correct) {
      toast({
        title: 'Correção não permitida',
        description: 'Você não pode registrar correção manual para este aluno.',
        variant: 'destructive',
      });
      return;
    }
    if (!selectedScope) return;

    try {
      setLoadingEntry(true);
      setSelectedStudent(student);
      const entry = await fetchManualEntry(selectedScope, student.student_id);
      setManualEntry(entry);
      setAnswers(buildInitialAnswers(entry));
      setSaveResult(null);
      setStep('form');
    } catch (error) {
      toast({
        title: 'Erro',
        description: extractApiError(error),
        variant: 'destructive',
      });
    } finally {
      setLoadingEntry(false);
    }
  };

  const handleAnswerChange = (questionKey: string, value: ManualAnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionKey]: value }));
  };

  const handleSave = async () => {
    if (!manualEntry || !selectedScope || !selectedStudent) return;
    try {
      setSaving(true);
      const payload = buildAnswersPayload(manualEntry.blocks, answers);
      const result = await submitManualCorrection(selectedScope, selectedStudent.student_id, payload);
      setSaveResult(result);
      setStep('result');
      toast({
        title: 'Respostas registradas',
        description: result.message || 'Correção salva com sucesso.',
      });
      if (selectedGabaritoId) {
        loadStudents(selectedGabaritoId, studentFilters);
      }
    } catch (error) {
      toast({
        title: 'Erro ao salvar',
        description: extractApiError(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const editingPrevious = manualEntry ? isEditingPreviousEntry(manualEntry) : false;

  if (step === 'result' && saveResult) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetToPick}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Corrigir outro aluno
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setStep('form')}>
            <Pencil className="h-4 w-4 mr-1" />
            Ajustar respostas
          </Button>
        </div>

        <Alert className="border-green-200 bg-green-50 dark:bg-green-950/30">
          <AlertTitle className="text-green-800 dark:text-green-300">Correção registrada</AlertTitle>
          <AlertDescription>
            {saveResult.student_name} — {saveResult.correct} acerto(s), {saveResult.wrong} erro(s),{' '}
            {saveResult.blank} em branco
            {saveResult.invalid > 0 ? `, ${saveResult.invalid} inválido(s)` : ''} de {saveResult.total}{' '}
            ({saveResult.percentage?.toFixed(1)}%)
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Comparativo com gabarito</CardTitle>
            <CardDescription>Exibido após o envio das respostas.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[min(420px,50vh)] rounded-md border">
              <div className="p-3 space-y-1 text-sm">
                {(saveResult.detailed_answers ?? []).map((row) => (
                  <div
                    key={row.question}
                    className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded ${
                      row.is_correct
                        ? 'bg-green-50 dark:bg-green-950/20'
                        : row.marked == null || row.marked === ''
                          ? 'bg-muted/50'
                          : 'bg-destructive/10'
                    }`}
                  >
                    <span className="font-medium">Q{row.question}</span>
                    <span className="text-muted-foreground">
                      Marcada: {row.marked ?? '—'} · Gabarito: {row.correct ?? '—'}
                    </span>
                    <Badge variant={row.is_correct ? 'default' : 'outline'} className="shrink-0">
                      {row.is_correct ? 'Certa' : row.marked == null || row.marked === '' ? 'Branco' : 'Errada'}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
            {saveResult.answer_sheet_result_id && selectedGabaritoId && (
              <div className="mt-4 space-y-2">
                {studentDetailHref ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={studentDetailHref}>Ver resultado detalhado</Link>
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" disabled>
                      Ver resultado detalhado
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Não foi possível montar o link automático (estado/município). Abra o aluno pela
                      página de{' '}
                      <Link to="/app/cartao-resposta/resultados" className="text-primary underline">
                        Resultados
                      </Link>{' '}
                      com os filtros do município.
                    </p>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'form' && manualEntry && selectedStudent) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetToPick} disabled={saving}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar à lista
          </Button>
        </div>

        {editingPrevious && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Editando correção anterior</AlertTitle>
            <AlertDescription>
              Este aluno já possui resultado para este cartão. As marcações abaixo podem ser alteradas e salvas
              novamente.
              {manualEntry.detection_method && (
                <> Método anterior: {detectionMethodLabel(manualEntry.detection_method) ?? manualEntry.detection_method}.</>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5" />
              {manualEntry.student.name}
            </CardTitle>
            <CardDescription>
              {manualEntry.title} · {manualEntry.num_questions} questões
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {manualEntry.blocks.map((block) => (
              <div key={block.block_id} className="space-y-3">
                {manualEntry.use_blocks && block.subject_name && (
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">
                    {block.subject_name}
                  </h3>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {block.questions.map((q) => {
                    const key = String(q.q);
                    const selected = answers[key] ?? null;
                    return (
                      <div
                        key={key}
                        className="flex flex-wrap items-center gap-2 rounded-lg border p-3 bg-muted/20"
                      >
                        <span className="w-8 text-sm font-semibold text-muted-foreground">{q.q}</span>
                        <div className="flex flex-wrap gap-1">
                          {q.alternatives.map((letter) => (
                            <Button
                              key={letter}
                              type="button"
                              size="sm"
                              variant={selected === letter ? 'default' : 'outline'}
                              className="h-8 w-8 p-0"
                              disabled={saving}
                              onClick={() => handleAnswerChange(key, letter)}
                            >
                              {letter}
                            </Button>
                          ))}
                          <Button
                            type="button"
                            size="sm"
                            variant={selected == null || selected === '' ? 'secondary' : 'ghost'}
                            className="h-8 px-2 text-xs"
                            disabled={saving}
                            onClick={() => handleAnswerChange(key, null)}
                          >
                            Branco
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar correção
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-5 w-5" />
            Avaliação
          </CardTitle>
          <CardDescription>
            Selecione cartão resposta ou prova física e o aluno para registrar as respostas manualmente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingGabaritos ? (
            <Skeleton className="h-10 w-full" />
          ) : gabaritos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum gabarito disponível.{' '}
              <Link to="/app/cartao-resposta/cadastrar" className="text-primary underline">
                Cadastrar gabarito
              </Link>
            </p>
          ) : (
            <Select value={selectedGabaritoId || ''} onValueChange={handleGabaritoChange}>
              <SelectTrigger className="h-auto min-h-10 py-2">
                <SelectValue placeholder="Selecione uma avaliação..." />
              </SelectTrigger>
              <SelectContent>
                {gabaritos.map((g) => {
                  const kind = gabaritoEntryKindLabel(g.test_id);
                  const isPhysical = Boolean(g.test_id);
                  return (
                    <SelectItem key={g.id} value={g.id} className="py-2.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge
                          variant={isPhysical ? 'secondary' : 'outline'}
                          className="shrink-0 text-[10px] font-medium"
                        >
                          {kind}
                        </Badge>
                        <span className="font-medium">{g.title}</span>
                        <span className="text-xs text-muted-foreground w-full sm:w-auto">
                          {g.num_questions ?? '?'} questões
                          {g.grade_name ? ` · ${g.grade_name}` : ''}
                          {g.class_name ? ` · ${g.class_name}` : ''}
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedGabaritoId && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filtrar alunos</CardTitle>
              {studentsData?.scope_summary && (
                <CardDescription>
                  {studentsData.scope_summary.student_count ?? allStudents.length} aluno(s) no escopo
                  {studentsData.scope_summary.class_count != null &&
                    ` · ${studentsData.scope_summary.class_count} turma(s)`}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {filterOptions.schools.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Escola</Label>
                  <Select
                    value={studentFilters.school_id ?? 'all'}
                    onValueChange={handleFilterSchool}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {filterOptions.schools.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {filterOptions.grades.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Série</Label>
                  <Select
                    value={studentFilters.grade_id ?? 'all'}
                    onValueChange={handleFilterGrade}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {filterOptions.grades.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {filterOptions.classOpts.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Turma</Label>
                  <Select
                    value={studentFilters.class_id ?? 'all'}
                    onValueChange={handleFilterClass}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {filterOptions.classOpts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[28rem_minmax(0,1fr)]">
            <Card className="lg:col-span-1 min-w-0 w-full">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5" />
                  Alunos
                </CardTitle>
                <CardDescription>{selectedGabarito?.title}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar nome ou matrícula..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {loadingStudents ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-[4.5rem] w-full" />
                    ))}
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nenhum aluno encontrado neste filtro.
                  </p>
                ) : (
                  <ScrollArea className="h-[min(420px,55vh)] w-full">
                    <div className="space-y-4 px-0.5 pb-1">
                      {groupedByClass.map((cls) => (
                        <Collapsible key={cls.class_id} defaultOpen>
                          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm font-medium hover:bg-muted">
                            <span className="truncate text-left">
                              {cls.class_name}
                              {cls.school_name ? ` · ${cls.school_name}` : ''}
                            </span>
                            <ChevronDown className="h-4 w-4 shrink-0" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-1 pt-2 overflow-visible">
                            {cls.students.map((student) => {
                              const disabled = !student.can_manual_correct;
                              const status = resolveStudentCorrectionStatus(student);
                              return (
                                <button
                                  key={student.student_id}
                                  type="button"
                                  disabled={disabled || loadingEntry}
                                  onClick={() => handleSelectStudent(student)}
                                  className={cn(
                                    'w-full block rounded-lg border p-3 text-left transition-colors',
                                    disabled
                                      ? 'opacity-50 cursor-not-allowed bg-muted/30'
                                      : 'hover:bg-accent hover:border-primary/30 cursor-pointer',
                                    selectedStudent?.student_id === student.student_id &&
                                      'border-primary bg-primary/5'
                                  )}
                                  title={
                                    disabled
                                      ? 'Correção manual não permitida para este aluno'
                                      : `${student.name} — ${cartaoCorrectionStatusLabel(status)}`
                                  }
                                >
                                  <span className="block font-medium text-sm leading-snug line-clamp-2">
                                    {student.name}
                                  </span>
                                  <StudentStatusLine student={student} />
                                </button>
                              );
                            })}
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-1 flex flex-col justify-center">
              <CardContent className="py-12 text-center text-muted-foreground">
                {loadingEntry ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p>Carregando formulário...</p>
                  </div>
                ) : (
                  <>
                    <Pencil className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">Selecione um aluno na lista para registrar ou editar as respostas.</p>
                    <p className="text-xs mt-2">
                      <span className="font-medium text-foreground">Corrigido</span> = já tem resultado ·{' '}
                      <span className="font-medium text-foreground">Pendente</span> = sem correção
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
