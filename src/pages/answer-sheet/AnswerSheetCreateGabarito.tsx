import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Steps } from '@/components/ui/steps';
import {
  FileText,
  ListOrdered,
  Layers,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Building2,
  AlertCircle,
  X,
  Target,
} from 'lucide-react';
import { api } from '@/lib/api';
import { MultiSelect } from '@/components/ui/multi-select';
import SkillsSelector from '@/components/evaluations/questions/SkillsSelector';
import { useSkillsStore } from '@/stores/useSkillsStore';

const STEPS = ['Informações', 'Questões', 'Blocos', 'Habilidades', 'Revisar'];

type BlockByDiscipline = {
  block_id: number;
  subject_name: string;
  subject_id: string;
  questions_count: number;
  start_question: number;
  end_question: number;
};

export default function AnswerSheetCreateGabarito() {
  const [step, setStep] = useState(0);
  const { toast } = useToast();

  // Step 0: básico
  const [title, setTitle] = useState('');
  const [institution, setInstitution] = useState('');
  /** Séries do gabarito (coluna JSON `grades`) — nunca inferidas do título. */
  const [gradeIds, setGradeIds] = useState<string[]>([]);

  // Step 1: questões e gabarito
  const [numQuestions, setNumQuestions] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState<Record<number, 'A' | 'B' | 'C' | 'D'>>({});
  const [useGlobalAlternatives, setUseGlobalAlternatives] = useState(true);
  const [globalAlternatives, setGlobalAlternatives] = useState<('A' | 'B' | 'C' | 'D')[]>(['A', 'B', 'C', 'D']);
  const [questionsOptions, setQuestionsOptions] = useState<Record<number, ('A' | 'B' | 'C' | 'D')[]>>({});
  const [editingQuestionAlternatives, setEditingQuestionAlternatives] = useState<number | null>(null);

  // Step 2: blocos (apenas por disciplina)
  const MIN_BLOCKS = 2;
  const MAX_BLOCKS = 4;
  const MIN_QUESTIONS_PER_BLOCK = 1;
  const MAX_QUESTIONS_PER_BLOCK = 22;
  // Máximo permitido: 22 questões por bloco, até 4 blocos => 88 questões no total
  const MAX_QUESTIONS_TOTAL = MAX_QUESTIONS_PER_BLOCK * MAX_BLOCKS;
  const [disciplines, setDisciplines] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingDisciplines, setIsLoadingDisciplines] = useState(false);
  const [blocksByDiscipline, setBlocksByDiscipline] = useState<BlockByDiscipline[]>([]);

  // Step 3: habilidades
  const [skillSubjectId, setSkillSubjectId] = useState('');
  const [skillGradeId, setSkillGradeId] = useState('');
  const [subjectsForSkills, setSubjectsForSkills] = useState<{ id: string; name: string }[]>([]);
  const [gradesForSkills, setGradesForSkills] = useState<{ id: string; name: string }[]>([]);
  const [gabaritoSkills, setGabaritoSkills] = useState<{ id: string; code: string; description: string; name: string }[]>([]);
  const [isLoadingGabaritoSkills, setIsLoadingGabaritoSkills] = useState(false);
  const [questionSkills, setQuestionSkills] = useState<Record<number, string[]>>({});
  const [editingQuestionSkills, setEditingQuestionSkills] = useState<number | null>(null);
  /** Cache id → code para não perder códigos ao trocar de disciplina */
  const [skillCodeCache, setSkillCodeCache] = useState<Record<string, string>>({});

  // Submit
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdGabarito, setCreatedGabarito] = useState<{ gabarito_id: string; title: string; num_questions: number } | null>(null);

  const handleResetForm = () => {
    setCreatedGabarito(null);
    setStep(0);
    setTitle('');
    setInstitution('');
    setGradeIds([]);
    setNumQuestions(0);
    setCorrectAnswers({});
    setUseGlobalAlternatives(true);
    setGlobalAlternatives(['A', 'B', 'C', 'D']);
    setQuestionsOptions({});
    setEditingQuestionAlternatives(null);
    setBlocksByDiscipline([]);
    setSkillSubjectId('');
    setSkillGradeId('');
    setQuestionSkills({});
    setEditingQuestionSkills(null);
    setSkillCodeCache({});
  };

  // Carregar disciplinas (para blocos)
  useEffect(() => {
    const fetchDisciplines = async () => {
      try {
        setIsLoadingDisciplines(true);
        const response = await api.get('/subjects');
        setDisciplines(Array.isArray(response.data) ? response.data : []);
      } catch {
        toast({ title: 'Erro', description: 'Não foi possível carregar as disciplinas.', variant: 'destructive' });
      } finally {
        setIsLoadingDisciplines(false);
      }
    };
    fetchDisciplines();
  }, [toast]);

  // Subjects e grades para habilidades
  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const response = await api.get<{ id: string; name: string }[]>('/subjects');
        setSubjectsForSkills(Array.isArray(response.data) ? response.data : []);
      } catch {
        setSubjectsForSkills([]);
      }
    };
    fetchSubjects();
  }, []);
  useEffect(() => {
    const fetchGrades = async () => {
      try {
        const response = await api.get<{ id: string; name: string }[]>('/grades/');
        setGradesForSkills(Array.isArray(response.data) ? response.data : []);
      } catch {
        setGradesForSkills([]);
      }
    };
    fetchGrades();
  }, []);

  useEffect(() => {
    if (!skillSubjectId || !skillGradeId) {
      setGabaritoSkills([]);
      return;
    }
    const fetchSkills = async () => {
      try {
        setIsLoadingGabaritoSkills(true);
        const fetchSkillsBySubjectAndGrade = useSkillsStore.getState().fetchSkills;
        const list = await fetchSkillsBySubjectAndGrade(skillSubjectId, skillGradeId);
        const next = Array.isArray(list)
          ? list.map((s) => ({ id: s.id, code: s.code, description: s.description, name: s.name || `${s.code} - ${s.description}` }))
          : [];
        setGabaritoSkills(next);
        setSkillCodeCache((prev) => {
          const merged = { ...prev };
          next.forEach((s) => { merged[s.id] = s.code; });
          return merged;
        });
      } catch {
        setGabaritoSkills([]);
        toast({ title: 'Aviso', description: 'Não foi possível carregar as habilidades.', variant: 'default' });
      } finally {
        setIsLoadingGabaritoSkills(false);
      }
    };
    fetchSkills();
  }, [skillSubjectId, skillGradeId, toast]);

  const handleAddDisciplineBlock = (disciplineId: string, disciplineName: string) => {
    if (blocksByDiscipline.length >= 4) {
      toast({ title: 'Limite', description: 'Máximo de 4 blocos.', variant: 'destructive' });
      return;
    }
    const currentTotal = blocksByDiscipline.reduce((s, b) => s + b.questions_count, 0);
    if (currentTotal >= numQuestions) {
      toast({ title: 'Limite', description: 'Todas as questões já estão nos blocos.', variant: 'destructive' });
      return;
    }
    const startQuestion = currentTotal + 1;
    const remaining = numQuestions - currentTotal;
    const defaultCount = Math.min(MAX_QUESTIONS_PER_BLOCK, Math.max(MIN_QUESTIONS_PER_BLOCK, remaining));
    setBlocksByDiscipline([
      ...blocksByDiscipline,
      {
        block_id: blocksByDiscipline.length + 1,
        subject_name: disciplineName,
        subject_id: disciplineId,
        questions_count: defaultCount,
        start_question: startQuestion,
        end_question: startQuestion + defaultCount - 1,
      },
    ]);
  };

  const handleRemoveDisciplineBlock = (blockId: number) => {
    const filtered = blocksByDiscipline.filter((b) => b.block_id !== blockId);
    const updated = filtered.map((block, index) => {
      const prevTotal = filtered.slice(0, index).reduce((s, b) => s + b.questions_count, 0);
      return {
        ...block,
        block_id: index + 1,
        start_question: prevTotal + 1,
        end_question: prevTotal + block.questions_count,
      };
    });
    setBlocksByDiscipline(updated);
  };

  const handleUpdateBlockQuestions = (blockId: number, newCount: number) => {
    const validCount = Math.min(Math.max(MIN_QUESTIONS_PER_BLOCK, newCount), MAX_QUESTIONS_PER_BLOCK);
    const blockIndex = blocksByDiscipline.findIndex((b) => b.block_id === blockId);
    if (blockIndex === -1) return;
    if (newCount < MIN_QUESTIONS_PER_BLOCK || newCount > MAX_QUESTIONS_PER_BLOCK) {
      toast({
        title: 'Limite',
        description: `Cada bloco deve ter entre ${MIN_QUESTIONS_PER_BLOCK} e ${MAX_QUESTIONS_PER_BLOCK} questões.`,
        variant: 'destructive',
      });
    }
    const otherTotal = blocksByDiscipline.filter((b) => b.block_id !== blockId).reduce((s, b) => s + b.questions_count, 0);
    if (otherTotal + validCount > numQuestions) {
      toast({ title: 'Limite', description: `Total de questões: ${numQuestions}.`, variant: 'destructive' });
      return;
    }
    let runningStart = 1;
    const updated = blocksByDiscipline.map((block) => {
      const count = block.block_id === blockId ? validCount : block.questions_count;
      const start = runningStart;
      const end = runningStart + count - 1;
      runningStart += count;
      return { ...block, questions_count: count, start_question: start, end_question: end };
    });
    setBlocksByDiscipline(updated);
  };

  const validateDisciplineBlocks = (): { isValid: boolean; warnings: string[] } => {
    const warnings: string[] = [];
    if (blocksByDiscipline.length === 0) {
      warnings.push('Adicione pelo menos 2 disciplinas (mín. 2, máx. 4 blocos).');
      return { isValid: false, warnings };
    }
    if (blocksByDiscipline.length < MIN_BLOCKS) {
      warnings.push(`Mínimo ${MIN_BLOCKS} blocos por disciplina.`);
      return { isValid: false, warnings };
    }
    if (blocksByDiscipline.length > MAX_BLOCKS) {
      warnings.push(`Máximo ${MAX_BLOCKS} blocos.`);
      return { isValid: false, warnings };
    }
    const total = blocksByDiscipline.reduce((s, b) => s + b.questions_count, 0);
    if (total !== numQuestions) {
      warnings.push(`Soma dos blocos (${total}) deve ser igual ao total de questões (${numQuestions}).`);
      return { isValid: false, warnings };
    }
    if (blocksByDiscipline.some((b) => b.questions_count < MIN_QUESTIONS_PER_BLOCK)) {
      warnings.push(`Mínimo ${MIN_QUESTIONS_PER_BLOCK} questões por bloco.`);
      return { isValid: false, warnings };
    }
    if (blocksByDiscipline.some((b) => b.questions_count > MAX_QUESTIONS_PER_BLOCK)) {
      warnings.push(`Máximo ${MAX_QUESTIONS_PER_BLOCK} questões por bloco.`);
      return { isValid: false, warnings };
    }
    return { isValid: true, warnings };
  };

  const getAvailableAlternatives = (q: number): ('A' | 'B' | 'C' | 'D')[] =>
    useGlobalAlternatives ? globalAlternatives : (questionsOptions[q] || ['A', 'B', 'C', 'D']);

  const handleToggleGlobalAlternative = (alternative: 'A' | 'B' | 'C' | 'D', checked: boolean) => {
    if (checked) {
      if (globalAlternatives.length >= 4) {
        toast({ title: 'Máximo 4 alternativas', description: 'Selecione no máximo 4 alternativas (A, B, C, D).', variant: 'destructive' });
        return;
      }
      setGlobalAlternatives([...globalAlternatives, alternative].sort() as ('A' | 'B' | 'C' | 'D')[]);
    } else {
      if (globalAlternatives.length <= 2) {
        toast({ title: 'Mínimo 2 alternativas', description: 'Cada questão deve ter pelo menos 2 alternativas.', variant: 'destructive' });
        return;
      }
      const next = globalAlternatives.filter((a) => a !== alternative);
      setGlobalAlternatives(next);
      setCorrectAnswers((prev) => {
        const updated = { ...prev };
        let cleared = 0;
        for (let i = 1; i <= numQuestions; i++) if (updated[i] === alternative) { delete updated[i]; cleared++; }
        if (cleared > 0) toast({ title: 'Respostas removidas', description: `${cleared} questão(ões) tiveram a resposta limpa.`, variant: 'default' });
        return updated;
      });
    }
  };

  const handleToggleQuestionAlternative = (questionNumber: number, alternative: 'A' | 'B' | 'C' | 'D', checked: boolean) => {
    const current = questionsOptions[questionNumber] || ['A', 'B', 'C', 'D'];
    if (checked) {
      if (current.length >= 4) {
        toast({ title: 'Máximo 4 alternativas', variant: 'destructive' });
        return;
      }
      setQuestionsOptions((prev) => ({ ...prev, [questionNumber]: [...current, alternative].sort() as ('A' | 'B' | 'C' | 'D')[] }));
    } else {
      if (current.length <= 2) {
        toast({ title: 'Mínimo 2 alternativas', variant: 'destructive' });
        return;
      }
      const next = current.filter((a) => a !== alternative);
      setQuestionsOptions((prev) => ({ ...prev, [questionNumber]: next }));
      if (correctAnswers[questionNumber] === alternative) {
        setCorrectAnswers((prev) => { const u = { ...prev }; delete u[questionNumber]; return u; });
        toast({ title: 'Resposta removida', description: `Questão ${questionNumber}: alternativa removida.`, variant: 'default' });
      }
    }
  };

  const handleApplyGlobalToAll = () => {
    if (globalAlternatives.length < 2) {
      toast({ title: 'Selecione pelo menos 2 alternativas', variant: 'destructive' });
      return;
    }
    const newOptions: Record<number, ('A' | 'B' | 'C' | 'D')[]> = {};
    for (let i = 1; i <= numQuestions; i++) newOptions[i] = [...globalAlternatives];
    setQuestionsOptions(newOptions);
    setUseGlobalAlternatives(false);
    setCorrectAnswers((prev) => {
      const updated = { ...prev };
      let cleared = 0;
      for (let i = 1; i <= numQuestions; i++) {
        if (updated[i] && !globalAlternatives.includes(updated[i])) { delete updated[i]; cleared++; }
      }
      if (cleared > 0) toast({ title: 'Respostas removidas', description: `${cleared} questão(ões) com resposta fora das alternativas.`, variant: 'default' });
      return updated;
    });
    toast({ title: 'Aplicado', description: `Alternativas aplicadas às ${numQuestions} questões.` });
  };

  const getSkillCodesForQuestion = (questionNum: number): string[] => {
    const ids = questionSkills[questionNum] ?? [];
    return ids.map((id) => skillCodeCache[id] ?? gabaritoSkills.find((s) => s.id === id)?.code).filter(Boolean) as string[];
  };

  const buildQuestionsOptions = (): Record<string, string[]> | undefined => {
    const sorted = [...globalAlternatives].sort();
    if (useGlobalAlternatives && JSON.stringify(sorted) === JSON.stringify(['A', 'B', 'C', 'D'])) return undefined;
    if (!useGlobalAlternatives) {
      const allDefault = Array.from({ length: numQuestions }, (_, i) => {
        const opts = questionsOptions[i + 1] || ['A', 'B', 'C', 'D'];
        return JSON.stringify([...opts].sort()) === JSON.stringify(['A', 'B', 'C', 'D']);
      }).every(Boolean);
      if (allDefault) return undefined;
    }
    const result: Record<string, string[]> = {};
    for (let i = 1; i <= numQuestions; i++)
      result[i.toString()] = useGlobalAlternatives ? [...globalAlternatives] : (questionsOptions[i] || ['A', 'B', 'C', 'D']);
    return result;
  };

  const canProceedStep0 = title.trim() !== '' && institution.trim() !== '' && gradeIds.length > 0;
  const canProceedStep1 =
    numQuestions >= 1 &&
    numQuestions <= MAX_QUESTIONS_TOTAL &&
    Array.from({ length: numQuestions }, (_, i) => i + 1).every((n) => {
      const ans = correctAnswers[n];
      const opts = getAvailableAlternatives(n);
      return ans && opts.includes(ans);
    });
  const hasDisciplineBlocks = blocksByDiscipline.length >= MIN_BLOCKS;
  const canSkipBlocks = numQuestions <= MAX_QUESTIONS_PER_BLOCK;
  const canProceedStep2 =
    blocksByDiscipline.length === 0 ? canSkipBlocks : validateDisciplineBlocks().isValid;

  const handleSubmit = async () => {
    // Se passar de 22 questões, é obrigatório distribuir em blocos (até 4 blocos / 22 por bloco).
    if (!hasDisciplineBlocks && numQuestions > MAX_QUESTIONS_PER_BLOCK) {
      toast({
        title: 'Limite',
        description: `Para ${numQuestions} questões, configure blocos (máx. ${MAX_BLOCKS} blocos x ${MAX_QUESTIONS_PER_BLOCK} questões).`,
        variant: 'destructive'
      });
      return;
    }

    const question_skills: Record<string, string[]> = {};
    for (let n = 1; n <= numQuestions; n++) question_skills[String(n)] = questionSkills[n] ?? [];

    const payload: Record<string, unknown> = {
      title: title.trim(),
      grade_ids: gradeIds,
      num_questions: numQuestions,
      correct_answers: correctAnswers,
      question_skills,
      use_blocks: hasDisciplineBlocks,
      separate_by_subject: hasDisciplineBlocks,
      questions_options: buildQuestionsOptions() || {},
      test_data: { institution: institution.trim(), title: title.trim() },
    };
    if (hasDisciplineBlocks) {
      payload.blocks_config = {
        blocks: blocksByDiscipline.map((b) => ({
          block_id: b.block_id,
          subject_id: b.subject_id,
          subject_name: b.subject_name,
          questions_count: b.questions_count,
          start_question: b.start_question,
          end_question: b.end_question,
        })),
      };
    } else {
      payload.blocks_config = { num_blocks: 1, questions_per_block: numQuestions };
    }

    try {
      setIsSubmitting(true);
      const response = await api.post('/answer-sheets/create-gabaritos', payload, { headers: { 'Content-Type': 'application/json' } });
      if (response.status === 201 && response.data?.gabarito_id) {
        setCreatedGabarito({
          gabarito_id: response.data.gabarito_id,
          title: response.data.title ?? title,
          num_questions: response.data.num_questions ?? numQuestions,
        });
        toast({ title: 'Gabarito criado!', description: 'Cartão resposta cadastrado com sucesso.' });
      } else {
        toast({ title: 'Resposta inesperada', description: 'Tente novamente.', variant: 'destructive' });
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err && typeof (err as { response?: { data?: { message?: string } } }).response?.data?.message === 'string'
        ? (err as { response: { data: { message: string } } }).response.data.message
        : 'Não foi possível criar o gabarito.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (createdGabarito) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <Card className="w-full max-w-lg border-2 border-emerald-200 bg-gradient-to-b from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-background shadow-xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
              <CheckCircle2 className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
            </div>
            <CardTitle className="text-2xl">Gabarito criado com sucesso</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 justify-center">
            <Button asChild variant="default">
              <Link to="/app/cartao-resposta/gerar">Gerar cartões</Link>
            </Button>
            <Button variant="outline" onClick={handleResetForm}>
              Cadastrar outro
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-primary/5 p-6 md:p-8">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Cadastrar cartão resposta</h1>
          <p className="mt-1 text-muted-foreground">Preencha as etapas abaixo para criar um novo gabarito. Depois você poderá gerar os cartões a partir dele.</p>
          <div className="mt-8">
            <Steps steps={STEPS} currentStep={step} />
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {step === 0 && (
            <Card className="border-2 shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Informações básicas</CardTitle>
                    <CardDescription>Título, secretaria e séries do cartão resposta.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Título da avaliação</Label>
                  <Input
                    id="title"
                    placeholder="Ex: Avaliação de Matemática - 5º ano"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="max-w-md"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="institution">Secretaria</Label>
                  <div className="relative max-w-md">
                    <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="institution"
                      placeholder="Ex: Secretaria Municipal de Educação"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2 max-w-md">
                  <Label>Série(s) / Ano(s)</Label>
                  <MultiSelect
                    options={gradesForSkills.map((g) => ({ id: g.id, name: g.name }))}
                    selected={gradeIds}
                    onChange={(ids) => {
                      setGradeIds(ids);
                      if (ids.length > 0 && !ids.includes(skillGradeId)) {
                        setSkillGradeId(ids[0]);
                      } else if (ids.length === 0) {
                        setSkillGradeId('');
                      }
                    }}
                    placeholder="Selecione uma ou mais séries"
                    mode="popover"
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Obrigatório. Define as séries do gabarito (não é inferido pelo título).
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 1 && (
            <Card className="border-2 shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <ListOrdered className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Questões e gabarito</CardTitle>
                    <CardDescription>Quantidade de questões e resposta correta de cada uma.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="numQuestions">Número de questões</Label>
                  <Input
                    id="numQuestions"
                    type="number"
                    min={1}
                    max={MAX_QUESTIONS_TOTAL}
                    value={numQuestions ? Math.min(MAX_QUESTIONS_TOTAL, Math.max(1, numQuestions)) : ''}
                    onChange={(e) => {
                      const raw = parseInt(e.target.value, 10);
                      if (Number.isNaN(raw) || e.target.value === '') {
                        setNumQuestions(0);
                        return;
                      }
                      const clamped = Math.min(MAX_QUESTIONS_TOTAL, Math.max(1, raw));
                      setNumQuestions(clamped);
                    }}
                    className="max-w-[120px]"
                  />
                  <p className="text-xs text-muted-foreground">Máximo {MAX_QUESTIONS_TOTAL} questões</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="global-alt"
                    checked={useGlobalAlternatives}
                    onCheckedChange={(c) => setUseGlobalAlternatives(c === true)}
                  />
                  <Label htmlFor="global-alt">Usar as mesmas alternativas em todas as questões</Label>
                </div>
                {useGlobalAlternatives && (
                  <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                    <Label>Alternativas disponíveis (mín. 2, máx. 4)</Label>
                    <div className="flex flex-wrap gap-4">
                      {(['A', 'B', 'C', 'D'] as const).map((alt) => (
                        <div key={alt} className="flex items-center space-x-2">
                          <Checkbox
                            id={`global-alt-${alt}`}
                            checked={globalAlternatives.includes(alt)}
                            onCheckedChange={(c) => handleToggleGlobalAlternative(alt, c === true)}
                            disabled={!globalAlternatives.includes(alt) && globalAlternatives.length >= 4}
                          />
                          <Label htmlFor={`global-alt-${alt}`} className="text-sm font-medium cursor-pointer">{alt}</Label>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {globalAlternatives.length} alternativa(s): {globalAlternatives.join(', ')}
                      {globalAlternatives.length < 2 && ' — Selecione pelo menos 2.'}
                    </p>
                    {numQuestions >= 1 && (
                      <Button type="button" variant="outline" size="sm" onClick={handleApplyGlobalToAll} disabled={globalAlternatives.length < 2}>
                        Usar estas alternativas e configurar por questão
                      </Button>
                    )}
                  </div>
                )}
                {!useGlobalAlternatives && numQuestions >= 1 && (
                  <p className="text-xs text-muted-foreground">Configure 2 a 4 alternativas por questão usando o botão &quot;Configurar&quot; em cada linha abaixo.</p>
                )}
                {numQuestions >= 1 && (
                  <>
                    <div className="space-y-2">
                      <Label>Gabarito (resposta correta por questão)</Label>
                      <p className="text-xs text-muted-foreground">Clique na letra para definir a resposta correta. Use &quot;Configurar&quot; para definir as alternativas da questão (mín. 2, máx. 4).</p>
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: numQuestions }, (_, i) => i + 1).map((n) => {
                          const opts = getAvailableAlternatives(n);
                          return (
                            <div key={n} className="flex items-center gap-1 rounded-md border bg-muted/30 p-1">
                              <span className="w-6 text-center text-xs font-medium text-muted-foreground">{n}</span>
                              {opts.map((letter) => (
                                <button
                                  key={letter}
                                  type="button"
                                  onClick={() => setCorrectAnswers((prev) => ({ ...prev, [n]: letter }))}
                                  className={`h-7 w-7 rounded text-xs font-semibold transition ${
                                    correctAnswers[n] === letter ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                                  }`}
                                >
                                  {letter}
                                </button>
                              ))}
                              {!useGlobalAlternatives && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-1.5 text-xs"
                                  onClick={() => setEditingQuestionAlternatives(editingQuestionAlternatives === n ? null : n)}
                                >
                                  Configurar
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <Dialog open={editingQuestionAlternatives !== null} onOpenChange={(open) => !open && setEditingQuestionAlternatives(null)}>
                      <DialogContent className="max-w-sm">
                        <DialogHeader>
                          <DialogTitle>Alternativas — Questão {editingQuestionAlternatives ?? ''}</DialogTitle>
                          <DialogDescription>Selecione de 2 a 4 alternativas para esta questão.</DialogDescription>
                        </DialogHeader>
                        {editingQuestionAlternatives !== null && (
                          <div className="flex flex-wrap gap-4 py-2">
                            {(['A', 'B', 'C', 'D'] as const).map((alt) => {
                              const cur = questionsOptions[editingQuestionAlternatives] || ['A', 'B', 'C', 'D'];
                              const isChecked = cur.includes(alt);
                              return (
                                <div key={alt} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`q${editingQuestionAlternatives}-${alt}`}
                                    checked={isChecked}
                                    onCheckedChange={(c) => handleToggleQuestionAlternative(editingQuestionAlternatives, alt, c === true)}
                                    disabled={!isChecked && cur.length >= 4}
                                  />
                                  <Label htmlFor={`q${editingQuestionAlternatives}-${alt}`} className="cursor-pointer">{alt}</Label>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {editingQuestionAlternatives !== null && (
                          <p className="text-xs text-muted-foreground">
                            {(questionsOptions[editingQuestionAlternatives] || ['A', 'B', 'C', 'D']).length} alternativa(s) selecionada(s)
                          </p>
                        )}
                      </DialogContent>
                    </Dialog>
                    {!canProceedStep1 && numQuestions >= 1 && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>Defina a resposta correta para todas as questões.</AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <Card className="border-2 shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Layers className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Blocos por disciplina</CardTitle>
                    <CardDescription>
                      Opcional: divida as questões em blocos por disciplina (2 a 4 blocos). Deixe vazio para um único bloco.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {numQuestions > 0 ? (
                  <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <p className="text-sm text-muted-foreground">
                      Adicione disciplinas abaixo. Cada bloco terá entre {MIN_QUESTIONS_PER_BLOCK} e {MAX_QUESTIONS_PER_BLOCK} questões.
                    </p>
                    {blocksByDiscipline.length > 0 ? (
                      <>
                        <div className="space-y-2">
                          {blocksByDiscipline.map((block) => (
                            <div key={block.block_id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3 shadow-sm">
                              <Badge variant="secondary" className="shrink-0">Bloco {block.block_id}</Badge>
                              <span className="min-w-[120px] font-medium text-foreground">{block.subject_name}</span>
                              <Input
                                type="number"
                                min={MIN_QUESTIONS_PER_BLOCK}
                                max={MAX_QUESTIONS_PER_BLOCK}
                                value={Math.min(MAX_QUESTIONS_PER_BLOCK, Math.max(MIN_QUESTIONS_PER_BLOCK, block.questions_count))}
                                onChange={(e) => {
                                  const raw = parseInt(e.target.value, 10);
                                  if (Number.isNaN(raw)) return;
                                  const clamped = Math.min(MAX_QUESTIONS_PER_BLOCK, Math.max(MIN_QUESTIONS_PER_BLOCK, raw));
                                  handleUpdateBlockQuestions(block.block_id, clamped);
                                  if (raw !== clamped) {
                                    toast({ title: 'Limite', description: `Entre ${MIN_QUESTIONS_PER_BLOCK} e ${MAX_QUESTIONS_PER_BLOCK} questões por bloco.`, variant: 'destructive' });
                                  }
                                }}
                                className="w-20 h-9"
                              />
                              <span className="text-xs text-muted-foreground">questões · Q{block.start_question}–{block.end_question}</span>
                              <Button type="button" variant="ghost" size="icon" className="ml-auto shrink-0" onClick={() => handleRemoveDisciplineBlock(block.block_id)} aria-label="Remover bloco">
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        {blocksByDiscipline.length < 4 && (
                          <Select
                            onValueChange={(value) => {
                              if (value === '__reset') return;
                              const d = disciplines.find((x) => x.id === value);
                              if (d) handleAddDisciplineBlock(d.id, d.name);
                            }}
                            value="__reset"
                          >
                            <SelectTrigger className="w-full max-w-sm border-dashed">
                              <SelectValue placeholder={isLoadingDisciplines ? 'Carregando...' : '+ Adicionar outra disciplina'} />
                            </SelectTrigger>
                            <SelectContent>
                              {disciplines.map((d) => (
                                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                          <span className="font-medium text-foreground">
                            Total: {blocksByDiscipline.reduce((s, b) => s + b.questions_count, 0)} / {numQuestions} questões
                          </span>
                          <span className="text-muted-foreground">· {blocksByDiscipline.length} / 4 blocos</span>
                        </div>
                        {validateDisciplineBlocks().warnings.length > 0 && (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{validateDisciplineBlocks().warnings.join(' ')}</AlertDescription>
                          </Alert>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-background/50 py-8">
                        <p className="text-sm text-muted-foreground text-center">Nenhum bloco adicionado. Um único bloco será usado.</p>
                        {isLoadingDisciplines ? (
                          <p className="text-xs text-muted-foreground">Carregando disciplinas...</p>
                        ) : disciplines.length > 0 ? (
                          <Select
                            onValueChange={(value) => {
                              if (value === '__reset') return;
                              const d = disciplines.find((x) => x.id === value);
                              if (d) handleAddDisciplineBlock(d.id, d.name);
                            }}
                            value="__reset"
                          >
                            <SelectTrigger className="w-64 border-primary/30">
                              <SelectValue placeholder="+ Adicionar disciplina para criar blocos" />
                            </SelectTrigger>
                            <SelectContent>
                              {disciplines.map((d) => (
                                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-xs text-muted-foreground">Nenhuma disciplina disponível.</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Defina a quantidade de questões na etapa anterior.</p>
                )}
              </CardContent>
            </Card>
          )}

          {step === 3 && (
            <Card className="border-2 shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Habilidades (opcional)</CardTitle>
                    <CardDescription>Associe habilidades às questões para relatórios.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Disciplina</Label>
                    <Select value={skillSubjectId} onValueChange={setSkillSubjectId}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {subjectsForSkills.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Série</Label>
                    <Select value={skillGradeId} onValueChange={setSkillGradeId}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {gradesForSkills.map((g) => (
                          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {(gabaritoSkills.length > 0 || Object.keys(skillCodeCache).length > 0) && numQuestions >= 1 && (
                  <div className="space-y-2">
                    <Label>Habilidades por questão</Label>
                    <p className="text-xs text-muted-foreground">Clique no número da questão para associar habilidades. Troque de disciplina/série para adicionar de outras — as já adicionadas são mantidas.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {Array.from({ length: numQuestions }, (_, i) => i + 1).map((n) => {
                        const codes = getSkillCodesForQuestion(n);
                        return (
                          <div key={n} className="flex flex-col gap-1 rounded-md border bg-muted/20 p-2">
                            <Button
                              type="button"
                              variant={editingQuestionSkills === n ? 'default' : 'outline'}
                              size="sm"
                              className="w-full justify-start"
                              onClick={() => setEditingQuestionSkills(editingQuestionSkills === n ? null : n)}
                            >
                              <Target className="h-3 w-3 mr-1.5 shrink-0" />
                              <span className="font-medium">Q{n}</span>
                              {codes.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{codes.length}</Badge>}
                            </Button>
                            {codes.length > 0 && (
                              <span className="text-[11px] text-muted-foreground font-mono leading-tight break-words">
                                {codes.join(', ')}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <Dialog open={editingQuestionSkills !== null} onOpenChange={(open) => !open && setEditingQuestionSkills(null)}>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Questão {editingQuestionSkills ?? ''}</DialogTitle>
                          <DialogDescription>Selecione as habilidades associadas a esta questão. Habilidades de outras disciplinas já escolhidas permanecem selecionadas.</DialogDescription>
                        </DialogHeader>
                        {editingQuestionSkills !== null && (() => {
                          const selectedIds = questionSkills[editingQuestionSkills] ?? [];
                          const currentIds = new Set(gabaritoSkills.map((s) => s.id));
                          const cachedSkills = selectedIds
                            .filter((id) => !currentIds.has(id))
                            .map((id) => ({
                              id,
                              code: skillCodeCache[id] ?? id,
                              description: '',
                              name: skillCodeCache[id] ?? id,
                            }));
                          const skillsForSelector = [...gabaritoSkills, ...cachedSkills];
                          return (
                            <SkillsSelector
                              skills={skillsForSelector}
                              selected={selectedIds}
                              onChange={(ids) => setQuestionSkills((prev) => ({ ...prev, [editingQuestionSkills]: ids }))}
                              placeholder="Habilidades"
                              allGrades={gradesForSkills}
                              subjectId={skillSubjectId}
                              subjectName={subjectsForSkills.find((s) => s.id === skillSubjectId)?.name}
                              gradeId={skillGradeId}
                              gradeName={gradesForSkills.find((g) => g.id === skillGradeId)?.name}
                            />
                          );
                        })()}
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
                {(!skillSubjectId || !skillGradeId) && (
                  <p className="text-sm text-muted-foreground">Selecione disciplina e série para carregar habilidades.</p>
                )}
              </CardContent>
            </Card>
          )}

          {step === 4 && (
            <Card className="border-2 shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Revisar e criar</CardTitle>
                    <CardDescription>Confira todos os dados antes de cadastrar o gabarito.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <dl className="grid gap-2 text-sm">
                  <div><dt className="text-muted-foreground">Título</dt><dd className="font-medium">{title || '—'}</dd></div>
                  <div><dt className="text-muted-foreground">Secretaria</dt><dd className="font-medium">{institution || '—'}</dd></div>
                  <div>
                    <dt className="text-muted-foreground">Séries</dt>
                    <dd className="font-medium">
                      {gradeIds.length > 0
                        ? gradesForSkills.filter((g) => gradeIds.includes(g.id)).map((g) => g.name).join(', ') || `${gradeIds.length} série(s)`
                        : '—'}
                    </dd>
                  </div>
                  <div><dt className="text-muted-foreground">Questões</dt><dd className="font-medium">{numQuestions}</dd></div>
                  {blocksByDiscipline.length > 0 && (
                    <div>
                      <dt className="text-muted-foreground">Blocos por disciplina</dt>
                      <dd className="font-medium">{blocksByDiscipline.map((b) => `${b.subject_name} (${b.questions_count})`).join(' · ')}</dd>
                    </div>
                  )}
                </dl>

                <div className="space-y-2">
                  <dt className="text-sm font-medium text-muted-foreground">Alternativas por questão</dt>
                  <dd className="text-sm">
                    {useGlobalAlternatives ? (
                      <p><span className="font-medium">Todas:</span> {globalAlternatives.join(', ')}</p>
                    ) : (
                      <ul className="list-none space-y-1 flex flex-wrap gap-x-4 gap-y-1">
                        {Array.from({ length: numQuestions }, (_, i) => i + 1).map((n) => {
                          const opts = questionsOptions[n] || ['A', 'B', 'C', 'D'];
                          return (
                            <li key={n} className="text-muted-foreground">
                              <span className="font-medium text-foreground">Q{n}:</span> {opts.join(', ')}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </dd>
                </div>

                <div className="space-y-2">
                  <dt className="text-sm font-medium text-muted-foreground">Habilidades por questão</dt>
                  <dd className="text-sm">
                    <ul className="list-none space-y-1 flex flex-wrap gap-x-4 gap-y-1">
                      {Array.from({ length: numQuestions }, (_, i) => i + 1).map((n) => {
                        const codes = getSkillCodesForQuestion(n);
                        return (
                          <li key={n} className="text-muted-foreground">
                            <span className="font-medium text-foreground">Q{n}:</span> {codes.length > 0 ? codes.join(', ') : '—'}
                          </li>
                        );
                      })}
                    </ul>
                  </dd>
                </div>

                <Button className="w-full sm:w-auto" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando...</> : <>Cadastrar gabarito</>}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="hidden lg:block">
          <Card className="sticky top-4 border bg-card/80 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Resumo</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              {title && <p><span className="text-foreground font-medium">Título:</span> {title}</p>}
              {institution && <p><span className="text-foreground font-medium">Secretaria:</span> {institution}</p>}
              {gradeIds.length > 0 && (
                <p>
                  <span className="text-foreground font-medium">Séries:</span>{' '}
                  {gradesForSkills.filter((g) => gradeIds.includes(g.id)).map((g) => g.name).join(', ') || gradeIds.length}
                </p>
              )}
              {numQuestions > 0 && <p><span className="text-foreground font-medium">Questões:</span> {numQuestions}</p>}
              {step >= 1 && numQuestions > 0 && (
                <p>
                  <span className="text-foreground font-medium">Gabarito:</span>{' '}
                  {Object.keys(correctAnswers).length === numQuestions ? (
                    <span className="text-emerald-600 dark:text-emerald-400">Completo</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">{Object.keys(correctAnswers).length}/{numQuestions}</span>
                  )}
                </p>
              )}
              {step >= 2 && blocksByDiscipline.length > 0 && (
                <p>
                  <span className="text-foreground font-medium">Blocos:</span>{' '}
                  {blocksByDiscipline.length} disciplinas
                </p>
              )}
              {!title && !institution && numQuestions === 0 && <p>Preencha as etapas para ver o resumo.</p>}
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="flex flex-wrap gap-3 justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        {step < 4 ? (
          <Button
            onClick={() => setStep((s) => s + 1)}
            disabled={
              (step === 0 && !canProceedStep0) ||
              (step === 1 && !canProceedStep1) ||
              (step === 2 && !canProceedStep2)
            }
          >
            Próximo
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
