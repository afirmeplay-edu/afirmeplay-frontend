import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  BarChart3,
  Users,
  Filter,
  Loader2,
  ChevronLeft,
  ChevronRight,
  FileText,
  TrendingUp,
  Activity,
  Download,
  Eye,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { InseSaebFiltersApiService } from '@/services/inseSaebFiltersApi';
import { InseEvaluationPicker } from '@/components/filters';
import { FormMultiSelect } from '@/components/ui/form-multi-select';
import { EvaluationApiService } from '@/services/evaluation/evaluationApi';
import { EvaluationResultsApiService } from '@/services/evaluation/evaluationResultsApi';
import type { StudentDetailedResult } from '@/services/evaluation/evaluationResultsApi';
import type { Question, TestData } from '@/types/evaluation-types';
import {
  loadCityBrandingPdfAssets,
  paintLetterheadBackground,
  urlToPngAsset,
} from '@/utils/pdfCityBranding';

// --- Tipos da API de resultados ---
interface DisciplinaAluno {
  id: string;
  nome: string;
  proficiencia: number;
  nota: number;
  nivel_proficiencia: string;
}

interface AlunoInseSaeb {
  id: string;
  nome_completo: string;
  disciplinas: DisciplinaAluno[];
  proficiencia_media: number;
  nota: number;
  nivel_proficiencia: string;
  inse_pontos: number;
  inse_nivel: number;
  inse_nivel_label: string;
}

interface DistribuicaoInseItem {
  nivel: number;
  label: string;
  quantidade: number;
  porcentagem: number;
}

interface InseSaebResultsResponse {
  formId: string;
  formTitle: string;
  avaliacaoId: string;
  avaliacaoTitulo: string;
  filtros?: Record<string, string>;
  resumo: {
    total_alunos_questionario: number;
    media_proficiencia_escopo: number;
    inse_medio: number;
    total_receberam_formulario?: number;
    total_nao_responderam?: number;
    porcentagem_participacao?: number;
    porcentagem_nao_responderam?: number;
  };
  distribuicao_inse: Record<string, DistribuicaoInseItem>;
  distribuicao_proficiencia: {
    abaixo_do_basico: number;
    basico: number;
    adequado: number;
    avancado: number;
    abaixo_do_basico_porcentagem: number;
    basico_porcentagem: number;
    adequado_porcentagem: number;
    avancado_porcentagem: number;
  };
  disciplinas_avaliacao: Array<{ id: string; nome: string }>;
  alunos: {
    data: AlunoInseSaeb[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

// Tipos para pré-visualização e PDF (respostas do formulário + boletim)
interface UserFormSubResponse {
  subQuestionId: string;
  textoSubpergunta: string;
  resposta: string | null;
}

interface UserFormQuestionResponse {
  questionId: string;
  textoPergunta: string;
  tipo: string;
  options?: string[];
  resposta?: string | null;
  subRespostas?: UserFormSubResponse[];
}

interface UserFormResponse {
  formId: string;
  formTitle: string;
  userId: string;
  userName: string;
  serie?: string | null;
  status: string;
  questions: UserFormQuestionResponse[];
}

interface BulletinRow {
  questionNumber: number;
  selectedLetter: string | null;
  correctLetter: string;
  isCorrect: boolean | null;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function getSelectedLetter(question: Question, studentAnswer: string | null): string | null {
  if (!studentAnswer || !question.alternatives?.length) return null;
  const normalized = studentAnswer.trim().toLowerCase();
  let idx = question.alternatives.findIndex(
    (alt) => alt.id === studentAnswer || alt.id === normalized
  );
  if (idx >= 0) return LETTERS[idx] ?? null;
  idx = question.alternatives.findIndex(
    (alt) => alt.text?.trim().toLowerCase() === normalized
  );
  if (idx >= 0) return LETTERS[idx] ?? null;
  const letterIdx = LETTERS.indexOf(studentAnswer.trim().toUpperCase());
  if (letterIdx >= 0 && letterIdx < question.alternatives.length) return LETTERS[letterIdx];
  const numIdx = parseInt(studentAnswer.trim(), 10);
  if (!isNaN(numIdx) && numIdx >= 0 && numIdx < question.alternatives.length) {
    return LETTERS[numIdx] ?? null;
  }
  return null;
}

function combineQuestionsAndAnswers(
  questions: Question[],
  answers: StudentDetailedResult | null
): BulletinRow[] {
  const validNumbers = questions
    .map((q) => q.number)
    .filter((num): num is number => num !== undefined && num !== null && num > 0);
  const hasValidNumbers =
    validNumbers.length === questions.length && new Set(validNumbers).size === questions.length;
  const sorted = hasValidNumbers
    ? [...questions].sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity))
    : [...questions];

  const answersMap = new Map<string, NonNullable<StudentDetailedResult['answers']>[0]>();
  if (answers?.answers?.length) {
    answers.answers.forEach((a) => {
      if (a.question_id) answersMap.set(a.question_id, a);
      if (a.question_number != null) answersMap.set(`num_${a.question_number}`, a);
    });
  }

  return sorted.map((q, i) => {
    const ans = answersMap.get(q.id) ?? answersMap.get(`num_${q.number}`);
    const studentAnswer = ans?.student_answer ?? null;
    const selectedLetter = getSelectedLetter(q, studentAnswer);
    const correctIdx = q.alternatives?.findIndex((a) => a.isCorrect) ?? -1;
    const correctLetter = correctIdx >= 0 ? LETTERS[correctIdx] ?? '—' : '—';
    let isCorrect: boolean | null = null;
    if (ans?.is_correct !== undefined && ans?.is_correct !== null) {
      isCorrect = ans.is_correct;
    } else if (studentAnswer && selectedLetter) {
      isCorrect = selectedLetter === correctLetter;
    } else if (studentAnswer) {
      isCorrect = false;
    }
    const questionNumber =
      hasValidNumbers && q.number && q.number > 0 ? q.number : i + 1;
    return {
      questionNumber,
      selectedLetter,
      correctLetter,
      isCorrect,
    };
  });
}

function groupBulletinBySubject(
  sortedQuestions: Question[],
  rows: BulletinRow[]
): Record<string, BulletinRow[]> {
  const bySubject: Record<string, BulletinRow[]> = {};
  sortedQuestions.forEach((q, i) => {
    const subjectName = q.subject?.name ?? 'Sem disciplina';
    if (!bySubject[subjectName]) bySubject[subjectName] = [];
    if (rows[i]) bySubject[subjectName].push(rows[i]);
  });
  Object.keys(bySubject).forEach((subj) => {
    bySubject[subj].sort((a, b) => a.questionNumber - b.questionNumber);
  });
  return bySubject;
}

const INSE_NIVEIS_ORDEM = ['6', '5', '4', '3', '2', '1'];
const INSE_CORES: Record<string, string> = {
  '6': 'bg-violet-800 text-white',
  '5': 'bg-violet-600 text-white',
  '4': 'bg-violet-500 text-white',
  '3': 'bg-violet-400 text-violet-900',
  '2': 'bg-violet-300 text-violet-900',
  '1': 'bg-violet-200 text-violet-900',
};

const NIVEL_PROFICIENCIA_CORES: Record<string, string> = {
  'Abaixo do Básico': 'bg-red-500 text-white',
  'Básico': 'bg-yellow-500 text-yellow-900',
  'Adequado': 'bg-green-600 text-white',
  'Avançado': 'bg-green-800 text-white',
};

function getProficienciaBadgeClass(nivel: string): string {
  return NIVEL_PROFICIENCIA_CORES[nivel] ?? 'bg-muted text-muted-foreground';
}

const InseSaebReport = () => {
  const { toast } = useToast();

  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('all');
  const [selectedForm, setSelectedForm] = useState<string>('');
  const [selectedAvaliacao, setSelectedAvaliacao] = useState<string>('');
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

  const [states, setStates] = useState<Array<{ id: string; name: string }>>([]);
  const [municipalities, setMunicipalities] = useState<Array<{ id: string; name: string }>>([]);
  const [forms, setForms] = useState<Array<{ id: string; name: string }>>([]);
  const [avaliacoes, setAvaliacoes] = useState<Array<{ id: string; name: string }>>([]);
  const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);
  const [grades, setGrades] = useState<Array<{ id: string; name: string }>>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);

  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [reportData, setReportData] = useState<InseSaebResultsResponse | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [downloadingAluno, setDownloadingAluno] = useState<string | null>(null);
  const [isGeneratingFullReport, setIsGeneratingFullReport] = useState(false);
  const reportContentRef = useRef<HTMLDivElement>(null);
  const reportSummaryRef = useRef<HTMLDivElement>(null);
  const reportTableRef = useRef<HTMLDivElement>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewAluno, setPreviewAluno] = useState<AlunoInseSaeb | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewFormResponse, setPreviewFormResponse] = useState<UserFormResponse | null>(null);
  const [previewEvaluationResult, setPreviewEvaluationResult] =
    useState<StudentDetailedResult | null>(null);
  const [previewTestData, setPreviewTestData] = useState<TestData | null>(null);

  const limit = 50;

  // Carregar estados iniciais
  useEffect(() => {
    const load = async () => {
      try {
        setIsLoadingFilters(true);
        const options = await InseSaebFiltersApiService.getFilterOptions({});
        setStates(options.estados);
      } catch (error) {
        console.error('Erro ao carregar filtros:', error);
        toast({ title: 'Erro ao carregar filtros', description: 'Tente novamente.', variant: 'destructive' });
      } finally {
        setIsLoadingFilters(false);
      }
    };
    load();
  }, [toast]);

  // Estado → municípios, limpar resto
  useEffect(() => {
    if (selectedState !== 'all') {
      setIsLoadingFilters(true);
      setSelectedMunicipality('all');
      setSelectedForm('');
      setSelectedAvaliacao('');
      setSelectedSchools([]);
      setSelectedGrades([]);
      setSelectedClasses([]);
      InseSaebFiltersApiService.getFilterOptions({ estado: selectedState })
        .then((options) => {
          setMunicipalities(options.municipios);
          setForms([]);
          setAvaliacoes([]);
          setSchools([]);
          setGrades([]);
          setClasses([]);
        })
        .catch(() => {
          setMunicipalities([]);
          setForms([]);
          setAvaliacoes([]);
        })
        .finally(() => setIsLoadingFilters(false));
    } else {
      setMunicipalities([]);
      setForms([]);
      setAvaliacoes([]);
      setSelectedMunicipality('all');
      setSelectedForm('');
      setSelectedAvaliacao('');
      setSelectedSchools([]);
      setSelectedGrades([]);
      setSelectedClasses([]);
    }
  }, [selectedState]);

  // Estado + Município → formulários e avaliações
  useEffect(() => {
    if (selectedState !== 'all' && selectedMunicipality !== 'all') {
      setIsLoadingFilters(true);
      setSelectedForm('');
      setSelectedAvaliacao('');
      setSelectedSchools([]);
      setSelectedGrades([]);
      setSelectedClasses([]);
      InseSaebFiltersApiService.getFilterOptions({
        estado: selectedState,
        municipio: selectedMunicipality,
      })
        .then((options) => {
          setForms(options.formularios);
          setAvaliacoes(options.avaliacoes);
          setSchools([]);
          setGrades([]);
          setClasses([]);
        })
        .catch(() => {
          setForms([]);
          setAvaliacoes([]);
          setSchools([]);
        })
        .finally(() => setIsLoadingFilters(false));
    } else {
      setForms([]);
      setAvaliacoes([]);
      setSelectedForm('');
      setSelectedAvaliacao('');
      setSchools([]);
    }
  }, [selectedState, selectedMunicipality]);

  // Formulário + Avaliação → escolas
  useEffect(() => {
    if (
      selectedState !== 'all' &&
      selectedMunicipality !== 'all' &&
      selectedForm &&
      selectedForm !== 'all' &&
      selectedAvaliacao &&
      selectedAvaliacao !== 'all'
    ) {
      setIsLoadingFilters(true);
      setSelectedSchools([]);
      setSelectedGrades([]);
      setSelectedClasses([]);
      InseSaebFiltersApiService.getFilterOptions({
        estado: selectedState,
        municipio: selectedMunicipality,
        formulario: selectedForm,
        avaliacao: selectedAvaliacao,
      })
        .then((options) => {
          const sorted = [...(options.escolas ?? [])].sort((a, b) => a.name.localeCompare(b.name));
          setSchools(sorted);
          setGrades([]);
          setClasses([]);
        })
        .catch(() => setSchools([]))
        .finally(() => setIsLoadingFilters(false));
    } else {
      setSchools([]);
      setSelectedSchools([]);
      setGrades([]);
      setClasses([]);
    }
  }, [selectedState, selectedMunicipality, selectedForm, selectedAvaliacao]);

  // Escola(s) → séries
  useEffect(() => {
    if (
      selectedState !== 'all' &&
      selectedMunicipality !== 'all' &&
      selectedForm &&
      selectedForm !== 'all' &&
      selectedAvaliacao &&
      selectedAvaliacao !== 'all' &&
      selectedSchools.length > 0
    ) {
      setIsLoadingFilters(true);
      const allGradesById = new Map<string, { id: string; name: string }>();
      const allGradesByName = new Map<string, string>();
      Promise.all(
        selectedSchools.map((schoolId) =>
          InseSaebFiltersApiService.getFilterOptions({
            estado: selectedState,
            municipio: selectedMunicipality,
            formulario: selectedForm,
            avaliacao: selectedAvaliacao,
            escola: schoolId,
          })
        )
      )
        .then((results) => {
          results.forEach((options) => {
            (options.series ?? []).forEach((grade: { id: string; name: string }) => {
              const name = (grade.name ?? '').trim().toLowerCase();
              if (!allGradesById.has(grade.id) && !allGradesByName.has(name)) {
                allGradesById.set(grade.id, { id: grade.id, name: grade.name?.trim() ?? '' });
                allGradesByName.set(name, grade.id);
              }
            });
          });
          setGrades(Array.from(allGradesById.values()).sort((a, b) => a.name.localeCompare(b.name)));
          setClasses([]);
        })
        .catch(() => setGrades([]))
        .finally(() => setIsLoadingFilters(false));
    } else {
      setGrades([]);
    }
  }, [selectedState, selectedMunicipality, selectedForm, selectedAvaliacao, selectedSchools]);

  // Série(s) → turmas
  useEffect(() => {
    if (
      selectedState !== 'all' &&
      selectedMunicipality !== 'all' &&
      selectedForm &&
      selectedForm !== 'all' &&
      selectedAvaliacao &&
      selectedAvaliacao !== 'all' &&
      selectedSchools.length > 0 &&
      selectedGrades.length > 0
    ) {
      setIsLoadingFilters(true);
      const allClassesById = new Map<string, { id: string; name: string }>();
      const allClassesByName = new Map<string, string>();
      const promises: Promise<ReturnType<typeof InseSaebFiltersApiService.getFilterOptions>>[] = [];
      selectedSchools.forEach((schoolId) => {
        selectedGrades.forEach((gradeId) => {
          promises.push(
            InseSaebFiltersApiService.getFilterOptions({
              estado: selectedState,
              municipio: selectedMunicipality,
              formulario: selectedForm,
              avaliacao: selectedAvaliacao,
              escola: schoolId,
              serie: gradeId,
            })
          );
        });
      });
      Promise.all(promises)
        .then((results) => {
          results.forEach((options) => {
            (options.turmas ?? []).forEach((t: { id: string; name: string }) => {
              const name = (t.name ?? '').trim().toLowerCase();
              if (!allClassesById.has(t.id) && !allClassesByName.has(name)) {
                allClassesById.set(t.id, { id: t.id, name: t.name?.trim() ?? '' });
                allClassesByName.set(name, t.id);
              }
            });
          });
          setClasses(Array.from(allClassesById.values()).sort((a, b) => a.name.localeCompare(b.name)));
        })
        .catch(() => setClasses([]))
        .finally(() => setIsLoadingFilters(false));
    } else {
      setClasses([]);
    }
  }, [selectedState, selectedMunicipality, selectedForm, selectedAvaliacao, selectedSchools, selectedGrades]);

  const fetchReport = useCallback(async (page: number = 1) => {
    if (
      selectedState === 'all' ||
      selectedMunicipality === 'all' ||
      !selectedForm ||
      selectedForm === 'all' ||
      !selectedAvaliacao ||
      selectedAvaliacao === 'all' ||
      selectedSchools.length === 0
    ) {
      return;
    }

    setIsLoadingReport(true);
    if (page === 1) setReportData(null);

    const params: Record<string, string | number> = {
      state: selectedState,
      municipio: selectedMunicipality,
      avaliacao: selectedAvaliacao,
      page,
      limit,
    };
    if (selectedSchools.length > 0) params.escola = selectedSchools.join(',');
    if (selectedGrades.length > 0) params.serie = selectedGrades.join(',');
    if (selectedClasses.length > 0) params.turma = selectedClasses.join(',');

    const requestConfig =
      selectedMunicipality !== 'all'
        ? { params, meta: { cityId: selectedMunicipality } }
        : { params };

    try {
      const response = await api.get<InseSaebResultsResponse>(
        `/forms/${selectedForm}/results/inse-saeb`,
        requestConfig
      );
      if (response.status === 200) {
        setReportData(response.data);
        setCurrentPage(page);
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast({
        title: 'Erro ao carregar relatório',
        description: err.response?.data?.message ?? 'Não foi possível carregar os resultados.',
        variant: 'destructive',
      });
      setReportData(null);
    } finally {
      setIsLoadingReport(false);
    }
  }, [
    selectedState,
    selectedMunicipality,
    selectedForm,
    selectedAvaliacao,
    selectedSchools,
    selectedGrades,
    selectedClasses,
    toast,
  ]);

  useEffect(() => {
    const hasMinimum =
      selectedState !== 'all' &&
      selectedMunicipality !== 'all' &&
      selectedForm !== '' &&
      selectedForm !== 'all' &&
      selectedAvaliacao !== '' &&
      selectedAvaliacao !== 'all' &&
      selectedSchools.length > 0;
    if (hasMinimum) {
      fetchReport(1);
    } else {
      setReportData(null);
    }
  }, [
    selectedState,
    selectedMunicipality,
    selectedForm,
    selectedAvaliacao,
    selectedSchools,
    selectedGrades,
    selectedClasses,
    fetchReport,
  ]);

  const handlePageChange = (newPage: number) => {
    if (!reportData?.alunos?.pagination || newPage < 1 || newPage > reportData.alunos.pagination.totalPages) return;
    fetchReport(newPage);
  };

  const requestConfigForForm = useMemo(
    () =>
      selectedMunicipality !== 'all'
        ? { meta: { cityId: selectedMunicipality } as { cityId: string } }
        : {},
    [selectedMunicipality]
  );

  const handleOpenPreview = useCallback(
    async (aluno: AlunoInseSaeb) => {
      if (!reportData?.formId || !reportData?.avaliacaoId) return;
      setPreviewAluno(aluno);
      setPreviewOpen(true);
      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewFormResponse(null);
      setPreviewEvaluationResult(null);
      setPreviewTestData(null);
      try {
        const [formRes, evalRes, testRes] = await Promise.allSettled([
          api.get<UserFormResponse>(
            `/forms/${reportData.formId}/responses/user/${aluno.id}`,
            requestConfigForForm
          ),
          EvaluationResultsApiService.getStudentDetailedResults(
            reportData.avaliacaoId,
            aluno.id,
            true
          ),
          EvaluationApiService.getTestData(reportData.avaliacaoId),
        ]);
        const formData =
          formRes.status === 'fulfilled' && formRes.value?.data
            ? formRes.value.data
            : null;
        const evalData =
          evalRes.status === 'fulfilled' ? evalRes.value : null;
        const testData =
          testRes.status === 'fulfilled' ? testRes.value : null;
        setPreviewFormResponse(formData);
        setPreviewEvaluationResult(evalData);
        setPreviewTestData(testData ?? null);
        if (!formData && !evalData) {
          setPreviewError(
            'Não foi possível carregar as respostas do formulário nem da avaliação.'
          );
        }
      } catch (err) {
        console.error('Erro ao carregar pré-visualização:', err);
        setPreviewError('Erro ao carregar dados. Tente novamente.');
      } finally {
        setPreviewLoading(false);
      }
    },
    [reportData?.formId, reportData?.avaliacaoId, requestConfigForForm]
  );

  const handleClosePreview = useCallback(() => {
    setPreviewOpen(false);
    setPreviewAluno(null);
    setPreviewError(null);
    setPreviewFormResponse(null);
    setPreviewEvaluationResult(null);
    setPreviewTestData(null);
  }, []);

  const handleExportAlunoPdf = useCallback(
    async (aluno: AlunoInseSaeb, indexOnPage: number) => {
      if (!reportData?.formId || !reportData?.avaliacaoId) return;
      const key = `${aluno.nome_completo}-${indexOnPage}`;
      try {
        setDownloadingAluno(key);
        const [formRes, evalRes, testRes] = await Promise.allSettled([
          api.get<UserFormResponse>(
            `/forms/${reportData.formId}/responses/user/${aluno.id}`,
            requestConfigForForm
          ),
          EvaluationResultsApiService.getStudentDetailedResults(
            reportData.avaliacaoId,
            aluno.id,
            true
          ),
          EvaluationApiService.getTestData(reportData.avaliacaoId),
        ]);
        const formData =
          formRes.status === 'fulfilled' && formRes.value?.data ? formRes.value.data : null;
        const evalData = evalRes.status === 'fulfilled' ? evalRes.value : null;
        const testData = testRes.status === 'fulfilled' ? testRes.value : null;

        if (!formData && !evalData) {
          toast({
            title: 'Dados não disponíveis',
            description:
              'Não foi possível obter as respostas do formulário nem da avaliação para este aluno.',
            variant: 'destructive',
          });
          setDownloadingAluno(null);
          return;
        }

        const jsPDFModule = await import('jspdf');
        const jsPDF = (jsPDFModule as { default?: unknown }).default || jsPDFModule;
        const doc = new (jsPDF as import('jspdf').jsPDF)({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });
        const margin = 15;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        const inseBrandingAluno = await loadCityBrandingPdfAssets(
          selectedMunicipality !== 'all' ? selectedMunicipality : null
        );
        if (inseBrandingAluno.letterhead) {
          paintLetterheadBackground(doc, inseBrandingAluno.letterhead, pageWidth, pageHeight);
        }

        let y = margin;
        const primaryRgb: [number, number, number] = [124, 58, 237];
        const textDark: [number, number, number] = [31, 41, 55];
        const textMuted: [number, number, number] = [107, 114, 128];
        const centerX = pageWidth / 2;

        const ensureSpace = (heightNeeded: number) => {
          if (y + heightNeeded > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
        };

        const drawAlunoHeaderLogo = async () => {
          if (inseBrandingAluno.logo) {
            const maxW = 50;
            const maxH = 22;
            let drawW = maxW;
            let drawH = (inseBrandingAluno.logo.ih / inseBrandingAluno.logo.iw) * drawW;
            if (drawH > maxH) {
              drawH = maxH;
              drawW = (inseBrandingAluno.logo.iw / inseBrandingAluno.logo.ih) * drawH;
            }
            doc.addImage(
              inseBrandingAluno.logo.dataUrl,
              'PNG',
              (pageWidth - drawW) / 2,
              y,
              drawW,
              drawH
            );
            y += drawH + 6;
            return;
          }
          try {
            const logoPath = '/LOGO-1.png';
            const logoResponse = await fetch(logoPath);
            const logoBlob = await logoResponse.blob();
            const logoDataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(logoBlob);
            });
            doc.addImage(logoDataUrl, 'PNG', (pageWidth - 50) / 2, y, 50, 22);
            y += 28;
          } catch {
            // segue sem logo
          }
        };
        await drawAlunoHeaderLogo();

        const municipioName =
          municipalities.find((m) => m.id === selectedMunicipality)?.name ?? '';

        // --- Parte 1: Respostas do questionário (cabeçalho igual à imagem, labels em negrito) ---
        if (formData?.questions?.length) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.setTextColor(...primaryRgb);
          doc.text('Relatório INSE x SAEB — Aluno', centerX, y, { align: 'center' });
          y += 12;
          doc.setFontSize(10);
          doc.setTextColor(...textDark);
          const alunoLines: { label: string; value: string } = [
            { label: 'Município: ', value: municipioName },
            { label: 'Formulário: ', value: formData.formTitle ?? reportData.formTitle },
            { label: 'Avaliação: ', value: reportData.avaliacaoTitulo },
            { label: 'Aluno: ', value: formData.userName ?? aluno.nome_completo },
          ];
          alunoLines.forEach(({ label, value }) => {
            if (!value) return;
            doc.setFont('helvetica', 'bold');
            const labelW = doc.getTextWidth(label);
            doc.setFont('helvetica', 'normal');
            const valueW = doc.getTextWidth(value);
            const totalW = labelW + valueW;
            const startX = centerX - totalW / 2;
            doc.setFont('helvetica', 'bold');
            doc.text(label, startX, y);
            doc.setFont('helvetica', 'normal');
            doc.text(value, startX + labelW, y);
            y += 7;
          });
          y += 8;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.setTextColor(...primaryRgb);
          doc.text('Respostas do Questionário Socioeconômico', centerX, y, { align: 'center' });
          doc.setTextColor(...textDark);
          y += 8;

          const autoTableModule = await import('jspdf-autotable');
          const autoTable = (autoTableModule as { default: (doc: import('jspdf').jsPDF, options: unknown) => void })
            .default;

          formData.questions.forEach((question, index) => {
            ensureSpace(25);
            const perguntaTexto = `${index + 1}. ${question.textoPergunta}`;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(perguntaTexto, margin, y);
            y += 6;
            const hasSub = question.subRespostas && question.subRespostas.length > 0;
            if (hasSub && question.options?.length) {
              const options = question.options;
              const subRespostas = question.subRespostas ?? [];
              const head = [['Item', ...options]];
              const body = subRespostas.map((sub) => {
                const row: string[] = [sub.textoSubpergunta];
                options.forEach(() => row.push(''));
                return row;
              });
              const startY = y;
              autoTable(doc, {
                startY,
                head,
                body,
                theme: 'grid',
                margin: { left: margin, right: margin },
                styles: { fontSize: 8, cellPadding: 2, halign: 'center', valign: 'middle' },
                headStyles: {
                  fillColor: primaryRgb,
                  textColor: [255, 255, 255],
                  fontStyle: 'bold',
                },
                columnStyles: { 0: { halign: 'left' } },
                didDrawCell: (cellData: { section: string; column?: { index: number }; row?: { index: number }; cell: { x: number; y: number; width: number; height: number } }) => {
                  if (cellData.section !== 'body') return;
                  const colIndex = cellData.column?.index ?? 0;
                  const rowIndex = cellData.row?.index ?? 0;
                  if (colIndex < 1 || rowIndex >= subRespostas.length) return;
                  const option = options[colIndex - 1];
                  const selected = subRespostas[rowIndex]?.resposta === option;
                  const cx = cellData.cell.x + cellData.cell.width / 2;
                  const cy = cellData.cell.y + cellData.cell.height / 2;
                  const r = 1.5;
                  if (selected) {
                    doc.setFillColor(...primaryRgb);
                    doc.circle(cx, cy, r, 'F');
                  } else {
                    doc.setDrawColor(...textMuted);
                    doc.setLineWidth(0.2);
                    doc.circle(cx, cy, r, 'S');
                  }
                },
              });
              const finalY = (doc as import('jspdf').jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY + 15;
              y = finalY + 6;
            } else {
              const respostaTexto = question.resposta ?? 'Não respondeu';
              ensureSpace(12);
              doc.setDrawColor(...primaryRgb);
              doc.setFillColor(243, 232, 255);
              const boxWidth = pageWidth - margin * 2;
              doc.rect(margin, y, boxWidth, 10, 'FD');
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(9);
              doc.setTextColor(...textDark);
              doc.text(respostaTexto, margin + 3, y + 6);
              y += 14;
            }
          });
          y += 5;
        }

        // --- Parte 2: Boletim diagnóstico (avaliação) ---
        if (testData?.questions?.length && evalData) {
          const autoTableBulletin = (
            await import('jspdf-autotable')
          ).default as (doc: import('jspdf').jsPDF, options: unknown) => void;
          if (formData?.questions?.length) {
            ensureSpace(30);
            doc.addPage();
          }
          y = margin;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(14);
          doc.setTextColor(...primaryRgb);
          doc.text('BOLETIM DIAGNÓSTICO DO ALUNO', centerX, y, { align: 'center' });
          y += 8;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(...textDark);
          doc.text(`Aluno: ${aluno.nome_completo}`, centerX, y, { align: 'center' });
          y += 6;
          doc.text(`Avaliação: ${reportData.avaliacaoTitulo}`, centerX, y, { align: 'center' });
          y += 10;

          const validNum = testData.questions
            .map((q) => q.number)
            .filter((n): n is number => n != null && n > 0);
          const hasValidNum =
            validNum.length === testData.questions.length &&
            new Set(validNum).size === testData.questions.length;
          const sortedQuestions = hasValidNum
            ? [...testData.questions].sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
            : [...testData.questions];
          const rows = combineQuestionsAndAnswers(sortedQuestions, evalData);
          const bySubject = groupBulletinBySubject(sortedQuestions, rows);

          const letters = ['A', 'B', 'C', 'D'];

          Object.entries(bySubject).forEach(([subjectName, subjectRows]) => {
            ensureSpace(50);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(...textDark);
            doc.text(subjectName.toUpperCase(), margin, y);
            y += 7;

            const head = [['#', 'A', 'B', 'C', 'D', 'GABARITO']];
            const body = subjectRows.map((row) => [
              String(row.questionNumber),
              '',
              '',
              '',
              '',
              row.correctLetter,
            ]);

            const startY = y;
            autoTableBulletin(doc, {
              startY,
              head,
              body,
              theme: 'grid',
              margin: { left: margin, right: margin },
              styles: {
                fontSize: 9,
                cellPadding: 3,
                halign: 'center',
                valign: 'middle',
              },
              headStyles: {
                fillColor: primaryRgb,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                lineWidth: 0.2,
                lineColor: [80, 50, 120],
              },
              bodyStyles: {
                lineWidth: 0.2,
                lineColor: [200, 200, 200],
              },
              columnStyles: {
                0: { cellWidth: 14 },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 'auto' },
                3: { cellWidth: 'auto' },
                4: { cellWidth: 'auto' },
                5: { cellWidth: 26 },
              },
              didDrawCell: (cellData: {
                section: string;
                column?: { index: number };
                row?: { index: number };
                cell: { x: number; y: number; width: number; height: number };
              }) => {
                if (cellData.section !== 'body' || cellData.column?.index == null) return;
                const colIdx = cellData.column.index;
                const rowIdx = cellData.row?.index ?? 0;
                if (rowIdx >= subjectRows.length) return;
                const row = subjectRows[rowIdx];
                const cell = cellData.cell;
                const cx = cell.x + cell.width / 2;
                const cy = cell.y + cell.height / 2;
                const r = 2;
                if (colIdx >= 1 && colIdx <= 4) {
                  const letter = letters[colIdx - 1];
                  const selected = row.selectedLetter === letter;
                  const correct = row.correctLetter === letter;
                  if (selected && correct) {
                    doc.setFillColor(34, 197, 94);
                    doc.circle(cx, cy, r, 'F');
                  } else if (selected && !correct) {
                    doc.setFillColor(239, 68, 68);
                    doc.circle(cx, cy, r, 'F');
                  } else {
                    doc.setDrawColor(200, 200, 200);
                    doc.setLineWidth(0.2);
                    doc.circle(cx, cy, r, 'S');
                  }
                }
              },
            });
            const finalY =
              (doc as import('jspdf').jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable
                ?.finalY ?? startY + 20;
            y = finalY + 5;

            const disc = aluno.disciplinas?.find(
              (d) => d.nome.toUpperCase().trim() === subjectName.toUpperCase().trim()
            ) ?? aluno.disciplinas?.find((d) =>
              d.nome.toLowerCase().includes(subjectName.toLowerCase())
            );
            const acertos = subjectRows.filter((r) => r.isCorrect === true).length;
            const notaDisc = disc?.nota ?? '—';
            const proficiencia = disc?.proficiencia ?? 0;
            const nivel = disc?.nivel_proficiencia ?? '—';

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...textDark);
            doc.text(
              `ACERTOS: ${acertos} | NOTA: ${notaDisc} | PROFICIÊNCIA: ${proficiencia}`,
              margin,
              y
            );
            y += 6;
            const badgeW = 28;
            doc.setFillColor(
              ...(nivel.includes('Avançado')
                ? [34, 197, 94]
                : nivel.includes('Adequado')
                  ? [22, 163, 74]
                  : nivel.includes('Básico')
                    ? [234, 179, 8]
                    : [239, 68, 68])
            );
            doc.rect(margin, y - 3, badgeW, 5, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.text(nivel, margin + 2, y + 0.5);
            doc.setTextColor(...textDark);
            y += 10;
          });

          ensureSpace(20);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          const totalAcertos = rows.filter((r) => r.isCorrect === true).length;
          const notaGeral = evalData?.grade ?? aluno.nota;
          doc.text(
            `TOTAL DE ACERTOS: ${totalAcertos} | NOTA: ${notaGeral} | MÉDIA PROFICIÊNCIA: ${aluno.proficiencia_media}`,
            margin,
            y
          );
          y += 6;
          doc.setFillColor(
            ...(aluno.nivel_proficiencia.includes('Avançado')
              ? [34, 197, 94]
              : aluno.nivel_proficiencia.includes('Adequado')
                ? [22, 163, 74]
                : aluno.nivel_proficiencia.includes('Básico')
                  ? [234, 179, 8]
                  : [239, 68, 68])
          );
          doc.rect(margin, y - 3, 30, 5, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(8);
          doc.text(aluno.nivel_proficiencia, margin + 2, y + 0.5);
        }

        const safeName = aluno.nome_completo.replace(/[\\/:*?"<>|]/g, '_');
        doc.save(`INSE_SAEB_Relatorio_${safeName}.pdf`);
        toast({ title: 'PDF gerado', description: 'Relatório do aluno exportado com sucesso.' });
      } catch (err) {
        console.error('Erro ao gerar PDF:', err);
        toast({
          title: 'Erro ao gerar PDF',
          description: 'Não foi possível exportar o relatório do aluno.',
          variant: 'destructive',
        });
      } finally {
        setDownloadingAluno(null);
      }
    },
    [
      reportData,
      requestConfigForForm,
      municipalities,
      selectedMunicipality,
      toast,
    ]
  );

  const handleExportFullReport = useCallback(async () => {
    const hasMin =
      selectedState !== 'all' &&
      selectedMunicipality !== 'all' &&
      selectedForm &&
      selectedForm !== 'all' &&
      selectedAvaliacao &&
      selectedAvaliacao !== 'all' &&
      selectedSchools.length > 0;
    if (!reportData || !hasMin) return;
    try {
      setIsGeneratingFullReport(true);
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default as (
        doc: import('jspdf').jsPDF,
        options: unknown
      ) => void;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const margin = 15;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const inseBrandingFull = await loadCityBrandingPdfAssets(selectedMunicipality);
      if (inseBrandingFull.letterhead) {
        paintLetterheadBackground(doc, inseBrandingFull.letterhead, pageWidth, pageHeight);
      }

      const primaryRgb: [number, number, number] = [124, 58, 237];
      const textDark: [number, number, number] = [31, 41, 55];
      const textMuted: [number, number, number] = [107, 114, 128];
      const centerX = pageWidth / 2;

      const icoAsset = await urlToPngAsset('/AFIRME-PLAY-ico.png');
      const drawCompactHeader = (title: string): number => {
        const BAND_H = 20;
        doc.setFillColor(...primaryRgb);
        doc.rect(0, 0, pageWidth, BAND_H, 'F');
        if (icoAsset?.dataUrl && icoAsset.iw > 0 && icoAsset.ih > 0) {
          const icoH = 14;
          const icoW = (icoAsset.iw * icoH) / icoAsset.ih;
          doc.addImage(icoAsset.dataUrl, 'PNG', margin, (BAND_H - icoH) / 2, icoW, icoH);
        } else {
          doc.setFontSize(8);
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.text('AFIRME PLAY', margin, BAND_H / 2 + 2);
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(255, 255, 255);
        doc.text(title, pageWidth - margin, BAND_H / 2 + 2, { align: 'right' });
        return BAND_H + 10;
      };
      // ===== CAPA (padrão Evoluções) =====
      const drawCover = async () => {
        const hasLetterhead = Boolean(inseBrandingFull.letterhead);
        const BAND_H = 58;
        if (!hasLetterhead) {
          doc.setFillColor(255, 255, 255);
          doc.rect(0, 0, pageWidth, pageHeight, 'F');
          doc.setFillColor(...primaryRgb);
          doc.rect(0, 0, pageWidth, BAND_H, 'F');
        }

        let logoBottomInBand = 0;
        const logoAsset = inseBrandingFull.logo ?? (await urlToPngAsset('/LOGO-1.png'));
        if (logoAsset?.dataUrl && logoAsset.iw > 0 && logoAsset.ih > 0) {
          const desiredLogoWidth = 38;
          const desiredLogoHeight = (logoAsset.ih * desiredLogoWidth) / logoAsset.iw;
          doc.addImage(
            logoAsset.dataUrl,
            'PNG',
            centerX - desiredLogoWidth / 2,
            hasLetterhead ? 18 : 7,
            desiredLogoWidth,
            desiredLogoHeight
          );
          logoBottomInBand = (hasLetterhead ? 18 : 7) + desiredLogoHeight;
        } else {
          doc.setFontSize(18);
          doc.setTextColor(...(hasLetterhead ? primaryRgb : ([255, 255, 255] as [number, number, number])));
          doc.setFont('helvetica', 'bold');
          doc.text('AFIRME PLAY', centerX, hasLetterhead ? 30 : 22, { align: 'center' });
          logoBottomInBand = hasLetterhead ? 36 : 28;
        }

        // Título + subtítulo
        const titleY = hasLetterhead
          ? logoBottomInBand + 10
          : Math.max(logoBottomInBand + 5, BAND_H - 17);
        doc.setTextColor(...(hasLetterhead ? primaryRgb : ([255, 255, 255] as [number, number, number])));
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(17);
        doc.text('RELATÓRIO INSE x SAEB', centerX, titleY, { align: 'center' });
        doc.setFontSize(11);
        doc.setTextColor(...(hasLetterhead ? textDark : ([255, 255, 255] as [number, number, number])));
        doc.text('ANÁLISE COMPARATIVA DE INDICADORES', centerX, titleY + 8, { align: 'center' });

        // Município / secretaria
        let y = hasLetterhead ? titleY + 14 : BAND_H + 13;
        const municipioName = municipalities.find((m) => m.id === selectedMunicipality)?.name ?? 'MUNICÍPIO';
        const stateLabel = selectedState !== 'all' ? selectedState : '';
        const locationText = stateLabel
          ? `${municipioName.toUpperCase()} - ${stateLabel.toUpperCase()}`
          : municipioName.toUpperCase();

        doc.setFontSize(14);
        doc.setTextColor(...primaryRgb);
        doc.setFont('helvetica', 'bold');
        doc.text(locationText, centerX, y, { align: 'center' });

        y += 8;
        doc.setFontSize(11);
        doc.setTextColor(...textMuted);
        doc.setFont('helvetica', 'normal');
        doc.text('SECRETARIA MUNICIPAL DE EDUCAÇÃO', centerX, y, { align: 'center' });

        y += 20;

        // Card com infos (accent bar 4mm)
        const cardWidth = pageWidth - 80;
        const cardX = (pageWidth - cardWidth) / 2;
        const ACCENT_W = 4;

        const cardHeight = 100;
        doc.setFillColor(250, 250, 250);
        doc.rect(cardX, y, cardWidth, cardHeight, 'F');
        doc.setFillColor(...primaryRgb);
        doc.rect(cardX, y, ACCENT_W, cardHeight, 'F');
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.4);
        doc.rect(cardX, y, cardWidth, cardHeight, 'S');

        let cardY = y + 12;
        const cardContentCenterX = cardX + ACCENT_W + (cardWidth - ACCENT_W) / 2;
        doc.setFontSize(13);
        doc.setTextColor(...primaryRgb);
        doc.setFont('helvetica', 'bold');
        doc.text('INFORMAÇÕES DO RELATÓRIO', cardContentCenterX, cardY, { align: 'center' });

        cardY += 6;
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.line(cardX + ACCENT_W + 4, cardY, cardX + cardWidth - 4, cardY);
        cardY += 8;

        doc.setFontSize(9);
        const leftColX = cardX + ACCENT_W + 15;
        const labelWidth = 48;
        const valueMaxWidth = cardWidth - labelWidth - 30;

        const rows: Array<{ label: string; value: string | undefined }> = [
          { label: 'MUNICÍPIO:', value: municipioName || undefined },
          { label: 'FORMULÁRIO:', value: reportData.formTitle || undefined },
          { label: 'AVALIAÇÃO:', value: reportData.avaliacaoTitulo || undefined },
          { label: 'ESCOLAS:', value: selectedSchools?.length ? `${selectedSchools.length} escolas` : undefined },
        ];

        for (const row of rows) {
          if (!row.value) continue;
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...primaryRgb);
          doc.text(row.label, leftColX, cardY);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...textDark);
          const lines = doc.splitTextToSize(String(row.value), valueMaxWidth);
          doc.text(lines, leftColX + labelWidth, cardY);
          cardY += Math.max(7, lines.length * 5);
        }
      };
      await drawCover();

      const resumo = reportData.resumo;
      const distInse = reportData.distribuicao_inse ?? {};
      const distProf = reportData.distribuicao_proficiencia;
      const disciplinasAvaliacao = reportData.disciplinas_avaliacao ?? [];
      const alunosData = reportData.alunos?.data ?? [];
      const pagination = reportData.alunos?.pagination;

      doc.addPage();
      let y = drawCompactHeader('RELATÓRIO INSE x SAEB');
      const ensureSpace = (heightNeeded: number) => {
        if (y + heightNeeded > pageHeight - margin) {
          doc.addPage();
          y = drawCompactHeader('RELATÓRIO INSE x SAEB');
        }
      };

      // --- Sessão geral ---
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(...primaryRgb);
      doc.text('Sessão geral', margin, y);
      y += 14;

      const cardWidth = (pageWidth - margin * 2 - 12) / 3;
      const cardHeight = 52;
      const cardGap = 6;
      const cardX1 = margin;
      const cardX2 = margin + cardWidth + cardGap;
      const cardX3 = margin + (cardWidth + cardGap) * 2;
      const cardPad = 8;

      const cardBg: [number, number, number] = [248, 250, 252];
      const cardBorder: [number, number, number] = [226, 232, 240];
      doc.setDrawColor(...cardBorder);
      doc.setLineWidth(0.35);
      doc.setFillColor(...cardBg);
      const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
        if (typeof (doc as import('jspdf').jsPDF & { roundedRect?: unknown }).roundedRect === 'function') {
          (doc as import('jspdf').jsPDF & { roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style: string) => void }).roundedRect(x, y, w, h, r, r, 'FD');
        } else {
          doc.rect(x, y, w, h, 'FD');
        }
      };
      drawRoundedRect(cardX1, y, cardWidth, cardHeight, 4);
      drawRoundedRect(cardX2, y, cardWidth, cardHeight, 4);
      drawRoundedRect(cardX3, y, cardWidth, cardHeight, 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(...textMuted);
      doc.text('Total de participação', cardX1 + cardPad, y + 12);
      doc.text('Proficiência Média', cardX2 + cardPad, y + 12);
      doc.text('INSE Médio', cardX3 + cardPad, y + 12);

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...textDark);
      const totalResp = resumo?.total_alunos_questionario ?? 0;
      const totalRec = resumo?.total_receberam_formulario ?? totalResp;
      const faltantes = totalRec - totalResp;
      doc.text(String(totalResp), cardX1 + cardPad, y + 28);
      const profMedia = resumo?.media_proficiencia_escopo != null ? Number(resumo.media_proficiencia_escopo).toFixed(0) : '—';
      doc.text(profMedia, cardX2 + cardPad, y + 28);
      const inseMed = resumo?.inse_medio != null ? Number(resumo.inse_medio).toFixed(1) : '—';
      doc.text(inseMed, cardX3 + cardPad, y + 28);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...textMuted);
      doc.text(`Realizado: ${totalResp}`, cardX1 + cardPad, y + 35);
      doc.text(`Faltantes: ${faltantes}`, cardX1 + cardPad, y + 40);
      if (resumo?.porcentagem_participacao != null) {
        const pctVal = Number(resumo.porcentagem_participacao).toFixed(1);
        const badgeW1 = Math.min(cardWidth - cardPad * 2, doc.getTextWidth(`${pctVal}%`) + 12);
        const badgeX1 = cardX1 + (cardWidth - badgeW1) / 2;
        const badgeY1 = y + 44;
        const badgeH1 = 7;
        doc.setFillColor(71, 85, 105);
        if (typeof (doc as import('jspdf').jsPDF & { roundedRect?: unknown }).roundedRect === 'function') {
          (doc as import('jspdf').jsPDF & { roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style: string) => void }).roundedRect(badgeX1, badgeY1, badgeW1, badgeH1, 2, 2, 'F');
        } else {
          doc.rect(badgeX1, badgeY1, badgeW1, badgeH1, 'F');
        }
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`${pctVal}%`, badgeX1 + badgeW1 / 2, badgeY1 + badgeH1 / 2 + 1.2, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...textMuted);
      }
      if (distProf) {
        const niveis = [
          { key: 'avancado', label: 'Avançado' },
          { key: 'adequado', label: 'Adequado' },
          { key: 'basico', label: 'Básico' },
          { key: 'abaixo_do_basico', label: 'Abaixo do Básico' },
        ];
        const withQtd = niveis.map((n) => ({ ...n, qtd: (distProf as Record<string, number>)[n.key] ?? 0 }));
        const maior = withQtd.reduce((a, b) => (a.qtd >= b.qtd ? a : b));
        const badgeW = 32;
        const badgeH = 9;
        const badgeY = y + 32;
        doc.setFillColor(234, 179, 8);
        doc.setDrawColor(202, 138, 4);
        doc.setLineWidth(0.2);
        if (typeof (doc as import('jspdf').jsPDF & { roundedRect?: unknown }).roundedRect === 'function') {
          (doc as import('jspdf').jsPDF & { roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style: string) => void }).roundedRect(cardX2 + cardPad, badgeY, badgeW, badgeH, 3, 3, 'FD');
        } else {
          doc.rect(cardX2 + cardPad, badgeY, badgeW, badgeH, 'FD');
        }
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(maior.label, cardX2 + cardPad + badgeW / 2, badgeY + badgeH / 2 + 1.5, { align: 'center' });
        doc.setTextColor(...textMuted);
        doc.setFont('helvetica', 'normal');
      }
      const inseLabel = Object.values(distInse).reduce<DistribuicaoInseItem | null>(
        (best, cur) => (!best || (cur.quantidade ?? 0) > (best.quantidade ?? 0) ? cur : best),
        null
      )?.label ?? '—';
      doc.setFontSize(10);
      doc.text(inseLabel, cardX3 + cardPad, y + 38);

      y += cardHeight + 16;

      // --- Distribuição (layout tabela, cores do HTML) ---
      const INSE_RGB: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
        '6': { bg: [91, 33, 182], text: [255, 255, 255] },
        '5': { bg: [124, 58, 237], text: [255, 255, 255] },
        '4': { bg: [139, 92, 246], text: [255, 255, 255] },
        '3': { bg: [167, 139, 250], text: [76, 29, 149] },
        '2': { bg: [196, 181, 253], text: [76, 29, 149] },
        '1': { bg: [221, 214, 254], text: [76, 29, 149] },
      };
      const profColors: [number, number, number][] = [
        [22, 101, 52],
        [22, 163, 74],
        [234, 179, 8],
        [239, 68, 68],
      ];

      ensureSpace(100);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(...primaryRgb);
      doc.text('Distribuição INSE e Níveis de Proficiência', margin, y);
      y += 12;

      const tableW = pageWidth - margin * 2;
      const col1W = 28;
      const col2W = tableW * 0.4;
      const col3W = 22;
      const col4W = 22;
      const headerH = 10;
      const rowH = 9;

      const drawTableHeader = (startX: number, title: string) => {
        doc.setFillColor(...primaryRgb);
        if (typeof (doc as import('jspdf').jsPDF & { roundedRect?: unknown }).roundedRect === 'function') {
          (doc as import('jspdf').jsPDF & { roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style: string) => void }).roundedRect(startX, y, tableW, headerH, 2, 2, 'F');
        } else {
          doc.rect(startX, y, tableW, headerH, 'F');
        }
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Nível INSE', startX + col1W / 2, y + headerH / 2 + 1.5, { align: 'center' });
        doc.text('Classificação', startX + col1W + col2W / 2, y + headerH / 2 + 1.5, { align: 'center' });
        doc.text('Qtd', startX + col1W + col2W + col3W / 2, y + headerH / 2 + 1.5, { align: 'center' });
        doc.text('%', startX + col1W + col2W + col3W + col4W / 2, y + headerH / 2 + 1.5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        y += headerH;
      };

      drawTableHeader(margin, 'INSE');
      INSE_NIVEIS_ORDEM.forEach((key, idx) => {
        const item = distInse[key];
        const qtd = item?.quantidade ?? 0;
        const pct = item?.porcentagem ?? 0;
        const label = item?.label ?? `Nível ${key}`;
        const rowY = y + idx * rowH;
        const rowFill: [number, number, number] =
          idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...rowFill);
        doc.rect(margin, rowY, tableW, rowH, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.1);
        doc.rect(margin, rowY, tableW, rowH, 'S');
        const badgeStyle = INSE_RGB[key] ?? { bg: [124, 58, 237], text: [255, 255, 255] };
        doc.setFillColor(...badgeStyle.bg);
        const badgeW = 18;
        const badgeX = margin + (col1W - badgeW) / 2;
        if (typeof (doc as import('jspdf').jsPDF & { roundedRect?: unknown }).roundedRect === 'function') {
          (doc as import('jspdf').jsPDF & { roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style: string) => void }).roundedRect(badgeX, rowY + 1.5, badgeW, rowH - 3, 3, 3, 'F');
        } else {
          doc.rect(badgeX, rowY + 1.5, badgeW, rowH - 3, 'F');
        }
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...badgeStyle.text);
        doc.text(`Nível ${key}`, margin + col1W / 2, rowY + rowH / 2 + 1, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...textDark);
        doc.setFontSize(9);
        doc.text(label, margin + col1W + 3, rowY + rowH / 2 + 1);
        doc.text(String(qtd), margin + col1W + col2W + col3W / 2, rowY + rowH / 2 + 1, { align: 'center' });
        doc.text(`${pct.toFixed(1)}%`, margin + col1W + col2W + col3W + col4W / 2, rowY + rowH / 2 + 1, { align: 'center' });
      });
      y += INSE_NIVEIS_ORDEM.length * rowH + 14;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...textDark);
      doc.text('Distribuição dos Níveis de Proficiência', margin, y);
      y += 8;

      doc.setFillColor(...primaryRgb);
      if (typeof (doc as import('jspdf').jsPDF & { roundedRect?: unknown }).roundedRect === 'function') {
        (doc as import('jspdf').jsPDF & { roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style: string) => void }).roundedRect(margin, y, tableW, headerH, 2, 2, 'F');
      } else {
        doc.rect(margin, y, tableW, headerH, 'F');
      }
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text('Nível', margin + col1W / 2, y + headerH / 2 + 1.5, { align: 'center' });
      doc.text('Classificação', margin + col1W + col2W / 2, y + headerH / 2 + 1.5, { align: 'center' });
      doc.text('Qtd', margin + col1W + col2W + col3W / 2, y + headerH / 2 + 1.5, { align: 'center' });
      doc.text('%', margin + col1W + col2W + col3W + col4W / 2, y + headerH / 2 + 1.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      y += headerH;

      [
        { label: 'Avançado', qtd: distProf?.avancado ?? 0, pct: distProf?.avancado_porcentagem ?? 0, color: profColors[0], textColor: [255, 255, 255] as [number, number, number] },
        { label: 'Adequado', qtd: distProf?.adequado ?? 0, pct: distProf?.adequado_porcentagem ?? 0, color: profColors[1], textColor: [255, 255, 255] as [number, number, number] },
        { label: 'Básico', qtd: distProf?.basico ?? 0, pct: distProf?.basico_porcentagem ?? 0, color: profColors[2], textColor: [113, 63, 18] as [number, number, number] },
        { label: 'Abaixo do Básico', qtd: distProf?.abaixo_do_basico ?? 0, pct: distProf?.abaixo_do_basico_porcentagem ?? 0, color: profColors[3], textColor: [255, 255, 255] as [number, number, number] },
      ].forEach(({ label, qtd, pct, color, textColor }, idx) => {
        const rowY = y + idx * rowH;
        const rowFill: [number, number, number] =
          idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...rowFill);
        doc.rect(margin, rowY, tableW, rowH, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.rect(margin, rowY, tableW, rowH, 'S');
        doc.setFillColor(...color);
        const badgeW = 22;
        const badgeX = margin + (col1W - badgeW) / 2;
        if (typeof (doc as import('jspdf').jsPDF & { roundedRect?: unknown }).roundedRect === 'function') {
          (doc as import('jspdf').jsPDF & { roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style: string) => void }).roundedRect(badgeX, rowY + 1.5, badgeW, rowH - 3, 3, 3, 'F');
        } else {
          doc.rect(badgeX, rowY + 1.5, badgeW, rowH - 3, 'F');
        }
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...textColor);
        doc.text(label, margin + col1W / 2, rowY + rowH / 2 + 1, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...textDark);
        doc.setFontSize(9);
        doc.text(label, margin + col1W + 3, rowY + rowH / 2 + 1);
        doc.text(String(qtd), margin + col1W + col2W + col3W / 2, rowY + rowH / 2 + 1, { align: 'center' });
        doc.text(`${pct.toFixed(1)}%`, margin + col1W + col2W + col3W + col4W / 2, rowY + rowH / 2 + 1, { align: 'center' });
      });
      y += 4 * rowH + 14;

      // --- Tabela INSE x SAEB ---
      doc.addPage();
      y = drawCompactHeader('RELATÓRIO INSE x SAEB');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(...primaryRgb);
      doc.text('INSE x SAEB', margin, y);
      y += 10;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(...textMuted);
      doc.text(`${reportData.formTitle} × ${reportData.avaliacaoTitulo}`, margin, y);
      y += 14;

      const head = [
        '#',
        'Aluno',
        ...disciplinasAvaliacao.map((d) => `Proficiência\n${d.nome}`),
        'Prof.\nMédia',
        'Nota',
        'Nível de\nAprendizagem',
        'INSE',
        'Nível\nINSE',
      ];
      const body =
        alunosData.length === 0
          ? [['Nenhum aluno no escopo.']]
          : alunosData.map((aluno, idx) => {
              const rowNum = pagination ? (pagination.page - 1) * pagination.limit + idx + 1 : idx + 1;
              const profs = disciplinasAvaliacao.map((d) => {
                const disc = aluno.disciplinas?.find((x) => x.id === d.id);
                return disc != null ? String(disc.proficiencia) : '—';
              });
              return [
                String(rowNum),
                aluno.nome_completo,
                ...profs,
                aluno.proficiencia_media != null ? String(aluno.proficiencia_media) : '—',
                aluno.nota != null ? String(aluno.nota) : '—',
                aluno.nivel_proficiencia ?? '—',
                aluno.inse_pontos != null ? String(aluno.inse_pontos) : '—',
                aluno.inse_nivel_label ?? '—',
              ];
            });

      const nivelColIndex = 4 + disciplinasAvaliacao.length;
      const inseColIndex = head.length - 1;
      const INSE_TABLE_RGB: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
        '6': { bg: [91, 33, 182], text: [255, 255, 255] },
        '5': { bg: [124, 58, 237], text: [255, 255, 255] },
        '4': { bg: [139, 92, 246], text: [255, 255, 255] },
        '3': { bg: [167, 139, 250], text: [76, 29, 149] },
        '2': { bg: [196, 181, 253], text: [76, 29, 149] },
        '1': { bg: [221, 214, 254], text: [76, 29, 149] },
      };
      const getNivelBadgeStyle = (nivel: string): { fill: [number, number, number]; text: [number, number, number] } => {
        if (nivel.includes('Avançado')) return { fill: [22, 101, 52], text: [255, 255, 255] };
        if (nivel.includes('Adequado')) return { fill: [22, 163, 74], text: [255, 255, 255] };
        if (nivel.includes('Básico')) return { fill: [234, 179, 8], text: [113, 63, 18] };
        if (nivel.includes('Abaixo')) return { fill: [239, 68, 68], text: [255, 255, 255] };
        return { fill: [248, 250, 252], text: textDark };
      };

      if (alunosData.length === 0) {
        doc.setFontSize(12);
        doc.setTextColor(...textMuted);
        doc.text('Nenhum aluno no escopo.', margin, y);
      } else {
        const usableTableWidth = pageWidth - margin * 2;
        const nDisc = disciplinasAvaliacao.length;
        const profMedIdx = 2 + nDisc;
        const notaIdx = profMedIdx + 1;
        const inseColIdx = head.length - 2;
        const floor = {
          num: 8,
          aluno: 30,
          profDisc: 22,
          profMed: 15,
          nota: 12,
          nivelApr: 26,
          inse: 12,
          nivelInse: 24,
        };
        const colWidths: Record<number, number> = {
          0: floor.num,
          1: floor.aluno,
          [nivelColIndex]: floor.nivelApr,
          [inseColIdx]: floor.inse,
          [head.length - 1]: floor.nivelInse,
        };
        for (let i = 0; i < nDisc; i++) colWidths[2 + i] = floor.profDisc;
        colWidths[profMedIdx] = floor.profMed;
        colWidths[notaIdx] = floor.nota;

        const sumWidths = (): number =>
          Object.values(colWidths).reduce((a, b) => a + b, 0);

        let delta = usableTableWidth - sumWidths();
        if (delta > 0) {
          const growWeight: Record<number, number> = { 0: 0, 1: 1.15 };
          for (let i = 0; i < nDisc; i++) growWeight[2 + i] = 1;
          growWeight[profMedIdx] = 0.45;
          growWeight[notaIdx] = 0.35;
          growWeight[nivelColIndex] = 0.85;
          growWeight[inseColIdx] = 0.35;
          growWeight[head.length - 1] = 0.75;
          const wsum = Object.values(growWeight).reduce((a, b) => a + b, 0);
          Object.entries(growWeight).forEach(([k, w]) => {
            const idx = Number(k);
            colWidths[idx] += (delta * w) / wsum;
          });
        } else if (delta < 0) {
          let d = -delta;
          const shrinkAluno = Math.min(d, Math.max(0, colWidths[1] - 26));
          colWidths[1] -= shrinkAluno;
          d -= shrinkAluno;
          if (nDisc > 0 && d > 0) {
            const removable = Array.from({ length: nDisc }, (_, i) =>
              Math.max(0, colWidths[2 + i] - 18)
            );
            const totalRemovable = removable.reduce((a, b) => a + b, 0);
            const take = Math.min(totalRemovable, d);
            if (totalRemovable > 0) {
              removable.forEach((r, i) => {
                colWidths[2 + i] -= (take * r) / totalRemovable;
              });
            }
            d -= take;
          }
          if (d > 0) {
            colWidths[nivelColIndex] = Math.max(22, colWidths[nivelColIndex] - d);
          }
        }
        const finalSum = sumWidths();
        if (Math.abs(finalSum - usableTableWidth) > 0.05) {
          colWidths[1] += usableTableWidth - finalSum;
        }

        autoTable(doc, {
          startY: y,
          head: [head],
          body,
          theme: 'grid',
          margin: { left: margin, right: margin },
          styles: {
            fontSize: 10,
            cellPadding: 2.5,
            overflow: 'linebreak',
            valign: 'middle',
          },
          headStyles: {
            fillColor: primaryRgb,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8.5,
            cellPadding: 2,
            valign: 'middle',
          },
          bodyStyles: {
            lineWidth: 0.1,
            lineColor: [226, 232, 240],
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
          columnStyles: Object.fromEntries(
            Object.entries(colWidths).map(([k, w]) => {
              const idx = Number(k);
              const centerNumeric =
                idx === 0 ||
                (idx >= 2 && idx <= notaIdx) ||
                idx === inseColIdx ||
                idx === nivelColIndex ||
                idx === head.length - 1;
              return [idx, { cellWidth: w, halign: centerNumeric ? 'center' : 'left' as const }];
            })
          ),
          didDrawCell: (data: { section: string; column?: { index: number }; row?: { index: number }; cell: { x: number; y: number; width: number; height: number }; cursor?: { x: number; y: number } }) => {
            if (data.section !== 'body') return;
            const colIdx = data.column?.index ?? 0;
            const rowIdx = data.row?.index ?? 0;
            if (rowIdx >= alunosData.length) return;
            const aluno = alunosData[rowIdx];
            const c = data.cell;
            if (colIdx === nivelColIndex) {
              const nivel = aluno?.nivel_proficiencia ?? '';
              const style = getNivelBadgeStyle(nivel);
              doc.setFillColor(...style.fill);
              if (typeof (doc as import('jspdf').jsPDF & { roundedRect?: unknown }).roundedRect === 'function') {
                (doc as import('jspdf').jsPDF & { roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, s: string) => void }).roundedRect(c.x + 1, c.y + 1, c.width - 2, c.height - 2, 2, 2, 'F');
              } else {
                doc.rect(c.x + 1, c.y + 1, c.width - 2, c.height - 2, 'F');
              }
              doc.setFontSize(9);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(...style.text);
              doc.text(nivel || '—', c.x + c.width / 2, c.y + c.height / 2 + 1.5, { align: 'center' });
            } else if (colIdx === inseColIndex) {
              const inseNivel = aluno?.inse_nivel != null ? String(aluno.inse_nivel) : '';
              const style = INSE_TABLE_RGB[inseNivel] ?? { bg: [124, 58, 237], text: [255, 255, 255] as [number, number, number] };
              doc.setFillColor(...style.bg);
              if (typeof (doc as import('jspdf').jsPDF & { roundedRect?: unknown }).roundedRect === 'function') {
                (doc as import('jspdf').jsPDF & { roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, s: string) => void }).roundedRect(c.x + 1, c.y + 1, c.width - 2, c.height - 2, 2, 2, 'F');
              } else {
                doc.rect(c.x + 1, c.y + 1, c.width - 2, c.height - 2, 'F');
              }
              doc.setFontSize(9);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(...style.text);
              doc.text(aluno?.inse_nivel_label ?? '—', c.x + c.width / 2, c.y + c.height / 2 + 1.5, { align: 'center' });
            }
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(...textDark);
          },
        });
      }

      const dateStr = new Date().toISOString().split('T')[0];
      const safeTitle = (reportData.formTitle + '_' + reportData.avaliacaoTitulo)
        .replace(/[\\/:*?"<>|]/g, '_')
        .slice(0, 60);
      doc.save(`INSE_SAEB_Relatorio_${safeTitle}_${dateStr}.pdf`);
      toast({
        title: 'PDF gerado',
        description: 'Relatório completo exportado com sucesso.',
      });
    } catch (err) {
      console.error('Erro ao gerar PDF do relatório:', err);
      toast({
        title: 'Erro ao gerar PDF',
        description: 'Não foi possível exportar o relatório.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingFullReport(false);
    }
  }, [
    reportData,
    selectedState,
    selectedMunicipality,
    selectedForm,
    selectedAvaliacao,
    selectedSchools.length,
    municipalities,
    toast,
  ]);

  const hasMinimumFilters =
    selectedState !== 'all' &&
    selectedMunicipality !== 'all' &&
    selectedForm &&
    selectedForm !== 'all' &&
    selectedAvaliacao &&
    selectedAvaliacao !== 'all' &&
    selectedSchools.length > 0;

  const resumo = reportData?.resumo;
  const distInse = reportData?.distribuicao_inse ?? {};
  const distProf = reportData?.distribuicao_proficiencia;
  const disciplinasAvaliacao = reportData?.disciplinas_avaliacao ?? [];
  const alunosData = reportData?.alunos?.data ?? [];
  const pagination = reportData?.alunos?.pagination;

  const previewSortedQuestions = useMemo(() => {
    if (!previewTestData?.questions?.length) return [];
    const qs = previewTestData.questions;
    const validNum = qs.map((q) => q.number).filter((n): n is number => n != null && n > 0);
    const hasValid =
      validNum.length === qs.length && new Set(validNum).size === qs.length;
    return hasValid
      ? [...qs].sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
      : [...qs];
  }, [previewTestData?.questions]);

  const previewBulletinRows = useMemo(
    () => combineQuestionsAndAnswers(previewSortedQuestions, previewEvaluationResult),
    [previewSortedQuestions, previewEvaluationResult]
  );

  const previewBySubject = useMemo(
    () => groupBulletinBySubject(previewSortedQuestions, previewBulletinRows),
    [previewSortedQuestions, previewBulletinRows]
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
          <BarChart3 className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
          INSE x SAEB
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Relatório socioeconômico (INSE) cruzado com resultados SAEB
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
          <CardDescription>
            Selecione estado, município, formulário, avaliação e ao menos uma escola para gerar o relatório
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado *</label>
              <Select value={selectedState} onValueChange={setSelectedState} disabled={isLoadingFilters}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {states.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Município *</label>
              <Select
                value={selectedMunicipality}
                onValueChange={setSelectedMunicipality}
                disabled={isLoadingFilters || selectedState === 'all'}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoadingFilters
                        ? 'Carregando...'
                        : municipalities.length === 0
                          ? 'Nenhum disponível'
                          : 'Selecione o município'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {municipalities.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Formulário *</label>
              <Select
                value={selectedForm}
                onValueChange={setSelectedForm}
                disabled={isLoadingFilters || selectedState === 'all' || selectedMunicipality === 'all'}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoadingFilters
                        ? 'Carregando...'
                        : forms.length === 0 && selectedMunicipality !== 'all'
                          ? 'Nenhum formulário'
                          : 'Selecione o formulário'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {forms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <InseEvaluationPicker
              label="Avaliação *"
              estado={selectedState}
              municipio={selectedMunicipality}
              value={selectedAvaliacao}
              onChange={setSelectedAvaliacao}
              estadoLabel={states.find((s) => s.id === selectedState)?.name}
              municipioLabel={municipalities.find((m) => m.id === selectedMunicipality)?.name}
              disabled={isLoadingFilters || selectedState === 'all' || selectedMunicipality === 'all'}
              loading={isLoadingFilters}
              placeholder={
                isLoadingFilters
                  ? 'Carregando...'
                  : avaliacoes.length === 0 && selectedMunicipality !== 'all'
                    ? 'Nenhuma avaliação'
                    : 'Selecione a avaliação'
              }
            />
            <div className="space-y-2">
              <label className="text-sm font-medium">Escola(s) *</label>
              <FormMultiSelect
                options={schools.map((s) => ({ id: s.id, name: s.name }))}
                selected={selectedSchools}
                onChange={setSelectedSchools}
                placeholder={
                  selectedSchools.length === 0 ? 'Selecione escolas' : `${selectedSchools.length} selecionada(s)`
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Série(s)</label>
              <FormMultiSelect
                options={grades.map((g) => ({ id: g.id, name: g.name }))}
                selected={selectedGrades}
                onChange={setSelectedGrades}
                placeholder={
                  selectedGrades.length === 0 ? 'Todas' : `${selectedGrades.length} selecionada(s)`
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Turma(s)</label>
              <FormMultiSelect
                options={classes.map((c) => ({ id: c.id, name: c.name }))}
                selected={selectedClasses}
                onChange={setSelectedClasses}
                placeholder={
                  selectedClasses.length === 0 ? 'Todas' : `${selectedClasses.length} selecionada(s)`
                }
              />
            </div>
          </div>
          {isLoadingReport && (
            <div className="mt-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <p className="text-sm text-primary">Carregando dados...</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {reportData && hasMinimumFilters && (
        <div ref={reportContentRef} className="space-y-6">
          <div ref={reportSummaryRef} className="space-y-6">
          {/* Sessão geral: 3 cards */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-semibold">Sessão geral</h2>
              <Button
                data-pdf-hide
                onClick={handleExportFullReport}
                disabled={isGeneratingFullReport}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isGeneratingFullReport ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando PDF...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Baixar relatório (PDF)
                  </>
                )}
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total de participação</p>
                      <p className="text-2xl font-bold mt-1">
                        {resumo?.total_alunos_questionario ?? 0}
                        {resumo?.total_receberam_formulario != null && (
                          <span className="text-lg font-normal text-muted-foreground">
                            {' '}/ {resumo.total_receberam_formulario}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Responderam / receberam o formulário
                      </p>
                      {resumo?.porcentagem_participacao != null && (
                        <p className="text-xs font-medium mt-1 text-primary">
                          {Number(resumo.porcentagem_participacao).toFixed(1)}% de participação
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 flex flex-col items-center">
                      <p className="text-sm text-muted-foreground w-full text-left">Proficiência Média</p>
                      <p className="text-2xl font-bold mt-1 w-full text-left">
                        {resumo?.media_proficiencia_escopo != null
                          ? Number(resumo.media_proficiencia_escopo).toFixed(0)
                          : '—'}
                      </p>
                      {distProf && (() => {
                        const niveis = [
                          { key: 'avancado', label: 'Avançado' },
                          { key: 'adequado', label: 'Adequado' },
                          { key: 'basico', label: 'Básico' },
                          { key: 'abaixo_do_basico', label: 'Abaixo do Básico' },
                        ];
                        const withQtd = niveis.map((n) => ({ ...n, qtd: (distProf as Record<string, number>)[n.key] ?? 0 }));
                        const maior = withQtd.reduce((a, b) => (a.qtd >= b.qtd ? a : b));
                        return (
                          <div className="mt-2 flex w-full justify-center">
                            <Badge className="bg-yellow-500 text-yellow-900 hover:bg-yellow-500/90">
                              {maior.label}
                            </Badge>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="rounded-lg bg-primary/10 p-2 flex-shrink-0">
                      <TrendingUp className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">INSE Médio</p>
                      <p className="text-2xl font-bold mt-1">
                        {resumo?.inse_medio != null ? Number(resumo.inse_medio).toFixed(1) : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {Object.values(distInse).reduce<DistribuicaoInseItem | null>(
                          (best, cur) => (!best || (cur.quantidade ?? 0) > (best.quantidade ?? 0) ? cur : best),
                          null
                        )?.label ?? '—'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Activity className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Distribuição: 2 cards */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Distribuição</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Distribuição dos Níveis INSE</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {INSE_NIVEIS_ORDEM.map((key) => {
                      const item = distInse[key];
                      const qtd = item?.quantidade ?? 0;
                      const pct = item?.porcentagem ?? 0;
                      const label = item?.label ?? `Nível ${key}`;
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between rounded-lg border p-2"
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <div
                              className={`w-3 h-3 rounded-full flex-shrink-0 ${INSE_CORES[key]?.split(' ')[0] ?? 'bg-muted'}`}
                            />
                            <span className="text-sm font-medium">{`Nível ${key} - ${label}`}</span>
                          </div>
                          <div className="flex gap-2 text-sm text-muted-foreground">
                            <span>{qtd}</span>
                            <span>{pct.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Distribuição dos Níveis de Proficiência</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      { key: 'avancado', label: 'Avançado', qtd: distProf?.avancado ?? 0, pct: distProf?.avancado_porcentagem ?? 0, cor: 'bg-green-800' },
                      { key: 'adequado', label: 'Adequado', qtd: distProf?.adequado ?? 0, pct: distProf?.adequado_porcentagem ?? 0, cor: 'bg-green-600' },
                      { key: 'basico', label: 'Básico', qtd: distProf?.basico ?? 0, pct: distProf?.basico_porcentagem ?? 0, cor: 'bg-yellow-500' },
                      { key: 'abaixo', label: 'Abaixo do Básico', qtd: distProf?.abaixo_do_basico ?? 0, pct: distProf?.abaixo_do_basico_porcentagem ?? 0, cor: 'bg-red-500' },
                    ].map(({ key, label, qtd, pct, cor }) => (
                      <div key={key} className="flex items-center justify-between rounded-lg border p-2">
                        <div className="flex items-center gap-2 flex-1">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${cor}`} />
                          <span className="text-sm font-medium">{label}</span>
                        </div>
                        <div className="flex gap-2 text-sm text-muted-foreground">
                          <span>{qtd}</span>
                          <span>{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          </div>

          {/* Tabela INSE x SAEB */}
          <Card ref={reportTableRef}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                INSE x SAEB
              </CardTitle>
              <CardDescription>
                Alunos no escopo dos filtros — {reportData.formTitle} × {reportData.avaliacaoTitulo}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary text-primary-foreground hover:bg-primary/90">
                      <TableHead className="text-primary-foreground font-medium w-12">#</TableHead>
                      <TableHead className="text-primary-foreground font-medium">Aluno</TableHead>
                      {disciplinasAvaliacao.map((d) => (
                        <TableHead key={d.id} className="text-primary-foreground font-medium">
                          Proficiência {d.nome}
                        </TableHead>
                      ))}
                      <TableHead className="text-primary-foreground font-medium">Proficiência Média</TableHead>
                      <TableHead className="text-primary-foreground font-medium">Nota</TableHead>
                      <TableHead className="text-primary-foreground font-medium text-center min-w-[140px]">Nível de Aprendizagem</TableHead>
                      <TableHead className="text-primary-foreground font-medium">INSE</TableHead>
                      <TableHead className="text-primary-foreground font-medium text-center min-w-[100px] whitespace-nowrap">Nível INSE</TableHead>
                      <TableHead className="text-primary-foreground font-medium w-[140px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alunosData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9 + disciplinasAvaliacao.length} className="text-center py-8 text-muted-foreground">
                          Nenhum aluno no escopo.
                        </TableCell>
                      </TableRow>
                    ) : (
                      alunosData.map((aluno, idx) => {
                        const rowNum = pagination ? (pagination.page - 1) * pagination.limit + idx + 1 : idx + 1;
                        const key = `${aluno.nome_completo}-${rowNum}`;
                        const isDownloading = downloadingAluno === key;
                        return (
                          <TableRow key={key}>
                            <TableCell className="font-medium">{rowNum}</TableCell>
                            <TableCell>{aluno.nome_completo}</TableCell>
                            {disciplinasAvaliacao.map((d) => {
                              const disc = aluno.disciplinas?.find((x) => x.id === d.id);
                              return (
                                <TableCell key={d.id}>
                                  {disc != null ? disc.proficiencia : '—'}
                                </TableCell>
                              );
                            })}
                            <TableCell>{aluno.proficiencia_media}</TableCell>
                            <TableCell>{aluno.nota}</TableCell>
                            <TableCell className="text-center">
                              <div className="flex justify-center">
                                <Badge className={getProficienciaBadgeClass(aluno.nivel_proficiencia)}>
                                  {aluno.nivel_proficiencia}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>{aluno.inse_pontos}</TableCell>
                            <TableCell className="text-center">
                              <div className="flex justify-center">
                                <Badge variant="secondary" className="bg-violet-100 text-violet-900 hover:bg-violet-100 whitespace-nowrap">
                                  {aluno.inse_nivel_label}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 p-0"
                                  onClick={() => handleOpenPreview(aluno)}
                                  title="Visualizar relatório"
                                  aria-label="Visualizar relatório"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="min-w-8 h-8 px-2 bg-primary text-primary-foreground hover:bg-primary/90"
                                  onClick={() => handleExportAlunoPdf(aluno, idx)}
                                  disabled={isDownloading}
                                  title={isDownloading ? 'Gerando PDF...' : 'Baixar PDF'}
                                  aria-label={isDownloading ? 'Gerando PDF' : 'Baixar PDF'}
                                >
                                  {isDownloading ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                                      <span className="ml-1.5 whitespace-nowrap text-xs">
                                        Gerando...
                                      </span>
                                    </>
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Página {pagination.page} de {pagination.totalPages} ({pagination.total} no total)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage <= 1 || isLoadingReport}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage >= pagination.totalPages || isLoadingReport}
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!hasMinimumFilters && !reportData && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Selecione estado, município, formulário, avaliação e ao menos uma escola para visualizar o relatório.
          </CardContent>
        </Card>
      )}

      <Dialog open={previewOpen} onOpenChange={(open) => !open && handleClosePreview()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Pré-visualização do relatório — {previewAluno?.nome_completo ?? 'Aluno'}
            </DialogTitle>
            <DialogDescription>
              Conteúdo que será incluído no PDF: respostas do questionário e boletim diagnóstico da avaliação.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            {previewLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : previewError ? (
              <p className="text-destructive text-sm">{previewError}</p>
            ) : (
              <>
                {previewFormResponse?.questions?.length ? (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-base">Respostas do questionário socioeconômico</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {previewFormResponse.questions.map((q, i) => (
                        <div key={q.questionId} className="space-y-2">
                          <p className="font-medium text-sm">
                            {i + 1}. {q.textoPergunta}
                          </p>
                          {q.subRespostas?.length ? (
                            <div className="overflow-x-auto border rounded-md">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="bg-primary/10">
                                    <th className="text-left p-2 border-b">Item</th>
                                    {(q.options ?? []).map((opt, j) => (
                                      <th key={j} className="p-2 border-b text-center">
                                        {opt}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {q.subRespostas.map((sub, si) => (
                                    <tr key={sub.subQuestionId}>
                                      <td className="p-2 border-b">{sub.textoSubpergunta}</td>
                                      {(q.options ?? []).map((opt, j) => (
                                        <td key={j} className="p-2 border-b text-center">
                                          {sub.resposta === opt ? (
                                            <span className="inline-block w-4 h-4 rounded-full bg-primary" />
                                          ) : (
                                            <span className="inline-block w-4 h-4 rounded-full border border-muted-foreground/30" />
                                          )}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="rounded-md border bg-primary/5 p-3 text-sm">
                              {q.resposta ?? 'Não respondeu'}
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : previewFormResponse && !previewFormResponse.questions?.length ? (
                  <p className="text-muted-foreground text-sm">Nenhuma resposta do formulário encontrada.</p>
                ) : null}

                {Object.keys(previewBySubject).length > 0 && previewAluno && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-base">Boletim diagnóstico — Avaliação</CardTitle>
                      <CardDescription>
                        {reportData?.avaliacaoTitulo} — Acertos e erros por questão
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {Object.entries(previewBySubject).map(([subjectName, subjectRows]) => {
                        const disc = previewAluno.disciplinas?.find(
                          (d) =>
                            d.nome.toUpperCase().trim() === subjectName.toUpperCase().trim() ||
                            d.nome.toLowerCase().includes(subjectName.toLowerCase())
                        );
                        const acertos = subjectRows.filter((r) => r.isCorrect === true).length;
                        const proficiencia = disc?.proficiencia ?? 0;
                        const nivel = disc?.nivel_proficiencia ?? '—';
                        return (
                          <div key={subjectName} className="space-y-2">
                            <h4 className="text-sm font-semibold text-primary uppercase">
                              {subjectName}
                            </h4>
                            <div className="overflow-x-auto rounded-md border">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="bg-primary text-primary-foreground">
                                    <th className="w-12 py-2 font-medium">#</th>
                                    <th className="w-12 py-2 font-medium">A</th>
                                    <th className="w-12 py-2 font-medium">B</th>
                                    <th className="w-12 py-2 font-medium">C</th>
                                    <th className="w-12 py-2 font-medium">D</th>
                                    <th className="w-14 py-2 font-medium whitespace-nowrap">GABARITO</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {subjectRows.map((row) => (
                                    <tr key={row.questionNumber} className="border-t border-border">
                                      <td className="py-1.5 text-center font-medium">
                                        {row.questionNumber}
                                      </td>
                                      {['A', 'B', 'C', 'D'].map((letter) => {
                                        const selected = row.selectedLetter === letter;
                                        const correct = row.correctLetter === letter;
                                        return (
                                          <td key={letter} className="py-1.5 text-center">
                                            {selected && correct && (
                                              <span className="inline-block w-4 h-4 rounded-full bg-green-500" />
                                            )}
                                            {selected && !correct && (
                                              <span className="inline-block w-4 h-4 rounded-full bg-red-500" />
                                            )}
                                            {!selected && (
                                              <span className="inline-block w-4 h-4 rounded-full border border-muted-foreground/50" />
                                            )}
                                          </td>
                                        );
                                      })}
                                      <td className="py-1.5 text-center font-medium">
                                        {row.correctLetter}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-muted-foreground">
                                ACERTOS: {acertos} | NOTA: {disc?.nota ?? '—'} | PROFICIÊNCIA: {proficiencia}
                              </span>
                              <Badge
                                className={
                                  nivel.includes('Avançado')
                                    ? 'bg-green-800 text-white'
                                    : nivel.includes('Adequado')
                                      ? 'bg-green-600 text-white'
                                      : nivel.includes('Básico')
                                        ? 'bg-yellow-500 text-yellow-900'
                                        : 'bg-red-500 text-white'
                                }
                              >
                                {nivel}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                      <div className="pt-2 border-t flex items-center justify-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          TOTAL DE ACERTOS:{' '}
                          {previewBulletinRows.filter((r) => r.isCorrect === true).length} | NOTA:{' '}
                          {previewEvaluationResult?.grade ?? previewAluno?.nota ?? '—'} | MÉDIA
                          PROFICIÊNCIA: {previewAluno?.proficiencia_media ?? '—'}
                        </span>
                        <Badge
                          className={getProficienciaBadgeClass(
                            previewAluno?.nivel_proficiencia ?? ''
                          )}
                        >
                          {previewAluno?.nivel_proficiencia ?? '—'}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {Object.keys(previewBySubject).length === 0 &&
                  previewTestData?.questions?.length > 0 && (
                    <p className="text-muted-foreground text-sm">
                      Não foi possível montar o boletim de questões.
                    </p>
                  )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InseSaebReport;
