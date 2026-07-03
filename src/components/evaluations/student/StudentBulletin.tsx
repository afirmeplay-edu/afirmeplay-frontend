import React, { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Minus, Filter, BookOpen, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { EvaluationApiService } from "@/services/evaluation/evaluationApi";
import { EvaluationResultsApiService } from "@/services/evaluation/evaluationResultsApi";
import type { NovaRespostaAPI, StudentDetailedResult } from "@/services/evaluation/evaluationResultsApi";
import { Question, TestData } from "@/types/evaluation-types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/authContext";
import { BASE_URL } from "@/lib/api";
import { QuestionOptionContent } from "@/components/evaluations/questions/QuestionOptionContent";
import {
  loadCityBrandingPdfAssets,
  paintLetterheadBackground,
  drawMunicipalLogoTopCenter,
  urlToPngAsset,
} from "@/utils/pdfCityBranding";

// Helper robusto para extrair série e turma de uma string de turma
function parseGradeAndClassFromTurma(input?: string | null): { grade?: string; classLetter?: string } {
  if (!input) return {};
  const text = input.replace(/\(.*?\)/g, '').replace(/turma/gi, '').replace(/-+/g, ' ').trim();
  // Captura a última letra (A-Z) como turma
  const letterMatch = text.match(/([A-Za-z])\s*$/);
  if (letterMatch) {
    const classLetter = letterMatch[1].toUpperCase();
    const grade = text.slice(0, Math.max(0, text.lastIndexOf(classLetter))).trim();
    return { grade: grade || undefined, classLetter };
  }
  return { grade: text || undefined };
}

interface Alternative {
  id?: string;
  text: string;
  isCorrect?: boolean;
}

interface BulletinQuestion {
  question: Question;
  studentAnswer: string | null;
  isCorrect: boolean | null;
  selectedAlternative: Alternative | null;
  correctAlternative: Alternative | null;
  questionNumber: number;
  hasAnswer: boolean;
}

interface QuestionsBySubject {
  [subjectName: string]: BulletinQuestion[];
}

export interface DisciplineStats {
  nota: number;
  proficiencia: number;
  totalQuestions: number;
  correctAnswers: number;
}

export type DisciplineStatsMap = Record<string, DisciplineStats>;

interface StudentBulletinProps {
  testId: string;
  studentId: string;
  initialDisciplineStats?: DisciplineStatsMap;
  /** UUID do município para timbrado/logo na capa do PDF */
  brandingCityId?: string | null;
}

// Helper function para identificar alternativa selecionada com 4 métodos de matching
const getSelectedAlternative = (question: Question, studentAnswer: string | null): Alternative | null => {
  if (!studentAnswer || !question.alternatives?.length) return null;

  const alternatives = question.alternatives;
  const normalized = studentAnswer.trim().toLowerCase();

  // 1. Por ID (mais confiável)
  let selected = alternatives.find(alt => alt.id === studentAnswer || alt.id === normalized);
  if (selected) return selected;

  // 2. Por texto completo (case-insensitive)
  selected = alternatives.find(alt => 
    alt.text?.trim().toLowerCase() === normalized
  );
  if (selected) return selected;

  // 3. Por letra (A, B, C, D...)
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const letterIndex = letters.indexOf(studentAnswer.trim().toUpperCase());
  if (letterIndex >= 0 && alternatives[letterIndex]) {
    return alternatives[letterIndex];
  }

  // 4. Por índice numérico (se studentAnswer for "0", "1", "2"...)
  const numIndex = parseInt(studentAnswer.trim(), 10);
  if (!isNaN(numIndex) && numIndex >= 0 && numIndex < alternatives.length) {
    return alternatives[numIndex];
  }

  return null;
};

// Função para combinar questões e respostas com matching robusto
const combineQuestionsAndAnswers = (
  questions: Question[],
  answers: StudentDetailedResult | null
): BulletinQuestion[] => {
  // Verificar se as questões têm números válidos e únicos
  const validNumbers = questions
    .map(q => q.number)
    .filter((num): num is number => num !== undefined && num !== null && num > 0);
  const uniqueValidNumbers = new Set(validNumbers);
  const hasValidUniqueNumbers = uniqueValidNumbers.size === questions.length && questions.length > 0;
  
  // Se não há números válidos e únicos, usar sempre índice sequencial baseado em 1
  // Caso contrário, ordenar por número primeiro
  const sortedQuestions = hasValidUniqueNumbers 
    ? [...questions].sort((a, b) => {
        const numA = (a.number && a.number > 0) ? a.number : Infinity;
        const numB = (b.number && b.number > 0) ? b.number : Infinity;
        return numA - numB;
      })
    : [...questions]; // Manter ordem original se não há números válidos únicos

  if (!answers?.answers || !Array.isArray(answers.answers)) {
    // Se não há respostas, retornar questões sem marcação
    return sortedQuestions.map((question, index) => {
      const correctAlt = question.alternatives?.find(alt => alt.isCorrect) || null;
      // Se tem números válidos e únicos, usar o número da questão, senão sempre usar índice sequencial
      const questionNumber = hasValidUniqueNumbers && question.number && question.number > 0
        ? question.number
        : (index + 1);
      return {
        question,
        studentAnswer: null,
        isCorrect: null,
        selectedAlternative: null,
        correctAlternative: correctAlt,
        questionNumber,
        hasAnswer: false
      };
    });
  }

  const answersMap = new Map<string, typeof answers.answers[0]>();
  
  // Indexar respostas por question_id E question_number
  answers.answers.forEach(answer => {
    if (answer.question_id) {
      answersMap.set(answer.question_id, answer);
    }
    if (answer.question_number) {
      answersMap.set(`num_${answer.question_number}`, answer);
    }
  });

  // Mapear e atribuir números sequenciais
  const result = sortedQuestions.map((question, index) => {
    // Tentar match por ID primeiro
    let studentAnswer = answersMap.get(question.id);
    
    // Se não encontrou, tentar por número (se válido)
    if (!studentAnswer && question.number && question.number > 0) {
      studentAnswer = answersMap.get(`num_${question.number}`);
    }
    
    const studentAnswerValue = studentAnswer?.student_answer || null;
    const selectedAlt = getSelectedAlternative(question, studentAnswerValue);
    const correctAlt = question.alternatives?.find(alt => alt.isCorrect) || null;
    
    // Determinar se a resposta está correta
    // Prioridade 1: Usar is_correct da API se disponível
    // Prioridade 2: Comparar a alternativa selecionada com a correta
    let isCorrect: boolean | null = null;
    if (studentAnswer?.is_correct !== undefined && studentAnswer?.is_correct !== null) {
      isCorrect = studentAnswer.is_correct;
    } else if (studentAnswerValue && selectedAlt && correctAlt) {
      // Comparar IDs das alternativas
      isCorrect = selectedAlt.id === correctAlt.id;
    } else if (studentAnswerValue && !selectedAlt) {
      // Se há resposta mas não encontramos a alternativa, marcar como incorreta
      isCorrect = false;
    } else if (!studentAnswerValue) {
      // Se não há resposta, marcar como null
      isCorrect = null;
    }
    
    // Se tem números válidos e únicos nas questões, usar o número da questão quando disponível
    // Senão, sempre usar índice sequencial baseado em 1 para garantir Q1, Q2, Q3...
    const questionNumber = hasValidUniqueNumbers && question.number && question.number > 0
      ? question.number
      : (index + 1);
    
    return {
      question,
      studentAnswer: studentAnswerValue,
      isCorrect,
      selectedAlternative: selectedAlt,
      correctAlternative: correctAlt,
      questionNumber,
      hasAnswer: !!studentAnswerValue
    };
  });

  // Ordenar por questionNumber para garantir ordem correta
  return result.sort((a, b) => a.questionNumber - b.questionNumber);
};

// Função para agrupar questões por disciplina
const groupQuestionsBySubject = (questions: BulletinQuestion[]): QuestionsBySubject => {
  const grouped: QuestionsBySubject = {};

  questions.forEach(question => {
    const subjectName = question.question.subject?.name || 'Sem disciplina';
    if (!grouped[subjectName]) {
      grouped[subjectName] = [];
    }
    grouped[subjectName].push(question);
  });

  // Ordenar questões dentro de cada disciplina por número
  Object.keys(grouped).forEach(subjectName => {
    grouped[subjectName].sort((a, b) => a.questionNumber - b.questionNumber);
  });

  return grouped;
};

type FilterType = 'all' | 'correct' | 'incorrect' | 'unanswered';

export default function StudentBulletin({ testId, studentId, initialDisciplineStats, brandingCityId }: StudentBulletinProps) {
  const [bulletinQuestions, setBulletinQuestions] = useState<BulletinQuestion[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  /** 'all' ou nome exato da disciplina */
  const [disciplineFilter, setDisciplineFilter] = useState<string>('all');
  const [loadingState, setLoadingState] = useState<{
    questions: boolean;
    answers: boolean;
  }>({ questions: true, answers: true });
  const [error, setError] = useState<string | null>(null);
  const [disciplineStats, setDisciplineStats] = useState<DisciplineStatsMap>(() => initialDisciplineStats ?? {});
  const [studentName, setStudentName] = useState<string | null>(null);
  const [evaluationTitle, setEvaluationTitle] = useState<string | null>(null);
  const [studentGrade, setStudentGrade] = useState<string | null>(null);
  const [studentClass, setStudentClass] = useState<string | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const studentNameRef = useRef<string | null>(null);
  const studentGradeRef = useRef<string | null>(null);
  const studentClassRef = useRef<string | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  studentNameRef.current = studentName;
  studentGradeRef.current = studentGrade;
  studentClassRef.current = studentClass;

  const hasInitialStats = useMemo(() => {
    if (!initialDisciplineStats) return false;
    return Object.keys(initialDisciplineStats).length > 0;
  }, [initialDisciplineStats]);

  useEffect(() => {
    if (initialDisciplineStats && Object.keys(initialDisciplineStats).length > 0) {
      setDisciplineStats(initialDisciplineStats);
    }
  }, [initialDisciplineStats]);

  useEffect(() => {
    const fetchData = async () => {
      if (!testId || !studentId) return;

      setLoadingState({ questions: true, answers: true });
      setError(null);

      try {
        const shouldFetchDisciplineStats = !hasInitialStats;

        const promises: Promise<unknown>[] = [
          EvaluationApiService.getTestData(testId),
          EvaluationResultsApiService.getStudentDetailedResults(testId, studentId, true)
        ];

        if (shouldFetchDisciplineStats) {
          promises.push(EvaluationResultsApiService.getEvaluationsList(1, 1, { avaliacao: testId }));
        }

        const settled = await Promise.allSettled(promises);

        const questionsData = settled[0];
        const answersData = settled[1];
        const tabelaDetalhadaData = shouldFetchDisciplineStats ? settled[2] : undefined;

        setLoadingState({ questions: false, answers: false });

        let questions: Question[] = [];

        if (questionsData.status === "fulfilled" && questionsData.value) {
          const testData = questionsData.value;
          questions = Array.isArray(testData.questions) ? testData.questions : [];

          const testDataObj = testData as TestData & Record<string, unknown>;
          if (typeof testDataObj.title === "string") {
            setEvaluationTitle(testDataObj.title);
          } else if (typeof testDataObj.titulo === "string") {
            setEvaluationTitle(testDataObj.titulo);
          } else if (typeof testDataObj.name === "string") {
            setEvaluationTitle(testDataObj.name);
          }
        }

        let studentAnswers: StudentDetailedResult | null = null;
        if (answersData.status === "fulfilled" && answersData.value) {
          studentAnswers = answersData.value;

          if (!studentNameRef.current && studentAnswers.student_name) {
            studentNameRef.current = studentAnswers.student_name;
            setStudentName(studentAnswers.student_name);
          }
        }

        if (!studentNameRef.current || !studentGradeRef.current || !studentClassRef.current) {
          try {
            const studentsData = await EvaluationResultsApiService.getStudentsByEvaluation(testId);
            const studentData = studentsData?.find((s) => s.id === studentId);
            if (studentData) {
              if (!studentNameRef.current) {
                const foundName = studentData.nome || (studentData as { name?: string }).name || null;
                if (foundName) {
                  studentNameRef.current = foundName;
                  setStudentName(foundName);
                }
              }

              const possibleGrade =
                (studentData as { grade?: string; serie?: string; grade_name?: string }).grade ||
                (studentData as { grade?: string; serie?: string; grade_name?: string }).serie ||
                (studentData as { grade?: string; serie?: string; grade_name?: string }).grade_name;

              if (possibleGrade && !studentGradeRef.current) {
                setStudentGrade(possibleGrade);
              }

              if (studentData.turma) {
                const turmaText = String(studentData.turma);
                const parsed = parseGradeAndClassFromTurma(turmaText);
                if (parsed.grade && !studentGradeRef.current) setStudentGrade(parsed.grade);
                if (parsed.classLetter && !studentClassRef.current) setStudentClass(parsed.classLetter);
              }
            }
          } catch (error) {
            const axiosError = error as { response?: { status?: number } };
            if (axiosError.response?.status === 403) {
              console.log('ℹ️ Acesso negado ao endpoint de alunos (esperado para alunos)');
            } else {
              console.warn('⚠️ Erro ao buscar alunos para detectar série:', error);
            }
          }
        }

        if (questions.length === 0) {
          setError('Não foi possível carregar as questões da avaliação. Verifique se a avaliação existe e tente novamente.');
          return;
        }

        const combined = combineQuestionsAndAnswers(questions, studentAnswers);
        setBulletinQuestions(combined);

        if (shouldFetchDisciplineStats && tabelaDetalhadaData?.status === "fulfilled" && tabelaDetalhadaData.value) {
          const tabelaDetalhada = (tabelaDetalhadaData.value as NovaRespostaAPI | null)?.tabela_detalhada;

          if (tabelaDetalhada?.disciplinas?.length) {
            const statsFromBackend: DisciplineStatsMap = {};

            tabelaDetalhada.disciplinas.forEach((disciplina) => {
              if (!disciplina?.nome) return;
              const aluno = disciplina.alunos?.find((item) => String(item.id) === String(studentId));
              if (!aluno) return;

              statsFromBackend[disciplina.nome] = {
                nota: Number(aluno.nota ?? 0),
                proficiencia: Number(aluno.proficiencia ?? 0),
                totalQuestions: Number(
                  aluno.total_questoes_disciplina ??
                  disciplina.questoes?.length ??
                  0
                ),
                correctAnswers: Number(aluno.total_acertos ?? 0)
              };
            });

            const geralAluno = tabelaDetalhada.geral?.alunos?.find(
              (item) => String(item.id) === String(studentId)
            );

            if (geralAluno) {
              statsFromBackend.GERAL = {
                nota: Number(geralAluno.nota_geral ?? 0),
                proficiencia: Number(geralAluno.proficiencia_geral ?? 0),
                totalQuestions: Number(geralAluno.total_questoes_geral ?? 0),
                correctAnswers: Number(geralAluno.total_acertos_geral ?? 0)
              };
            }

            setDisciplineStats(Object.keys(statsFromBackend).length ? statsFromBackend : {});
          } else {
            setDisciplineStats({});
          }
        }
      } catch (err) {
        console.error('Erro ao carregar dados do boletim:', err);
        setError(err instanceof Error ? err.message : 'Erro ao carregar dados do boletim');
      }
    };

    fetchData();
  }, [testId, studentId, hasInitialStats]);

  const filteredQuestions = useMemo(() => {
    switch (filter) {
      case 'correct':
        return bulletinQuestions.filter(q => q.isCorrect === true);
      case 'incorrect':
        return bulletinQuestions.filter(q => q.isCorrect === false);
      case 'unanswered':
        return bulletinQuestions.filter(q => !q.hasAnswer);
      default:
        return bulletinQuestions;
    }
  }, [bulletinQuestions, filter]);

  // Agrupar questões filtradas por disciplina
  const questionsBySubject = useMemo(() => {
    return groupQuestionsBySubject(filteredQuestions);
  }, [filteredQuestions]);

  const availableDisciplines = useMemo(() => {
    const grouped = groupQuestionsBySubject(bulletinQuestions);
    return Object.keys(grouped)
      .filter((name) => name !== 'GERAL' && grouped[name].length > 0)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [bulletinQuestions]);

  const displayedSubjectEntries = useMemo(() => {
    const entries = Object.entries(questionsBySubject).filter(([name]) => name !== 'GERAL');
    if (disciplineFilter === 'all') return entries;
    return entries.filter(([name]) => name === disciplineFilter);
  }, [questionsBySubject, disciplineFilter]);

  useEffect(() => {
    if (disciplineFilter === 'all') return;
    if (!availableDisciplines.includes(disciplineFilter)) {
      setDisciplineFilter('all');
    }
  }, [availableDisciplines, disciplineFilter]);

  // Função auxiliar para normalizar nomes de disciplina (case-insensitive)
  const normalizeDisciplineName = (name: string): string => {
    return name
      .normalize('NFD')
      .replace(/[  -]/g, '')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  };

  // Função para encontrar estatísticas de uma disciplina
  const getDisciplineStats = (subjectName: string): DisciplineStats | null => {
    if (disciplineStats[subjectName]) {
      return disciplineStats[subjectName];
    }

    const normalized = normalizeDisciplineName(subjectName);
    const statsEntry = Object.entries(disciplineStats).find(([key]) => {
      const keyNormalized = normalizeDisciplineName(key);
      if (keyNormalized === normalized) return true;
      if (keyNormalized.includes(normalized)) return true;
      if (normalized.includes(keyNormalized)) return true;
      return false;
    });

    if (statsEntry) {
      return statsEntry[1];
    }

    if (disciplineStats.GERAL) {
      return disciplineStats.GERAL;
    }

    return null;
  };

  const getStatusIcon = (question: BulletinQuestion) => {
    if (!question.hasAnswer) {
      return <Minus className="h-4 w-4 text-gray-400" />;
    }
    if (question.isCorrect) {
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    }
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const handleExportToPDF = async () => {
    const cardElement = cardRef.current;
    if (!cardElement) {
      toast({
        title: "Erro ao Exportar PDF",
        description: "Não foi possível capturar o conteúdo do boletim.",
        variant: "destructive",
      });
      return;
    }

    setIsExportingPDF(true);

    try {
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;

      // Criar clone offscreen para captura sem alterar a UI
      const offscreenRoot = document.createElement('div');
      offscreenRoot.setAttribute('aria-hidden', 'true');
      offscreenRoot.style.position = 'fixed';
      offscreenRoot.style.left = '-10000px';
      offscreenRoot.style.top = '-10000px';
      offscreenRoot.style.zIndex = '-1';

      const clonedCard = cardElement.cloneNode(true) as HTMLElement;
      offscreenRoot.appendChild(clonedCard);
      document.body.appendChild(offscreenRoot);

      // Ocultar controles e header no clone
      const clonedHeader = clonedCard.querySelector('[data-pdf-header]') as HTMLElement | null;
      const clonedControls = clonedCard.querySelector('[data-pdf-controls]') as HTMLElement | null;
      if (clonedHeader) clonedHeader.style.display = 'none';
      if (clonedControls) clonedControls.style.display = 'none';

      // Expandir áreas roláveis no clone
      const clonedScrollArea = clonedCard.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      if (clonedScrollArea) {
        clonedScrollArea.style.height = 'auto';
        clonedScrollArea.style.maxHeight = 'none';
        clonedScrollArea.style.overflow = 'visible';
      }
      const clonedScrollRoot = clonedCard.querySelector('[data-radix-scroll-area]') as HTMLElement | null;
      if (clonedScrollRoot) {
        clonedScrollRoot.style.height = 'auto';
        clonedScrollRoot.style.maxHeight = 'none';
        clonedScrollRoot.style.overflow = 'visible';
      }
      // Remover truncamento/overflow horizontal no clone
      clonedCard.querySelectorAll('.truncate').forEach((el) => {
        const e = el as HTMLElement;
        e.className = e.className.replace(/\btruncate\b/g, '').trim();
        e.style.whiteSpace = 'normal';
        e.style.overflow = 'visible';
        e.style.textOverflow = 'clip';
      });
      clonedCard.querySelectorAll('.overflow-x-auto').forEach((el) => {
        const e = el as HTMLElement;
        e.className = e.className.replace(/\boverflow-x-auto\b/g, '').trim();
        e.style.overflowX = 'visible';
        e.style.overflow = 'visible';
      });

      const canvasOptions = {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
      } as const;

      // Seções no clone
      const subjectSections = Array.from(
        clonedCard.querySelectorAll('[data-subject-section]')
      ) as HTMLElement[];

      const pdf = new jsPDF('p', 'mm', 'a4');
      const margin = 10;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      const resolvedBrandingCityId =
        brandingCityId ?? user?.city_id ?? user?.tenant_id ?? null;
      const bulletinBranding = await loadCityBrandingPdfAssets(resolvedBrandingCityId);
      if (bulletinBranding.letterhead) {
        paintLetterheadBackground(pdf, bulletinBranding.letterhead, pageWidth, pageHeight);
      }

      const icoAsset = await urlToPngAsset('/AFIRME-PLAY-ico.png');

      const COLORS = {
        primary: [124, 62, 237] as [number, number, number],
        textDark: [31, 41, 55] as [number, number, number],
        textGray: [107, 114, 128] as [number, number, number],
        borderLight: [229, 231, 235] as [number, number, number],
        bgLight: [250, 250, 250] as [number, number, number],
        white: [255, 255, 255] as [number, number, number],
      };

      const drawCompactHeader = (title: string): number => {
        const BAND_H = 20;
        pdf.setFillColor(...COLORS.primary);
        pdf.rect(0, 0, pageWidth, BAND_H, 'F');
        if (icoAsset?.dataUrl && icoAsset.iw > 0 && icoAsset.ih > 0) {
          const icoH = 14;
          const icoW = (icoAsset.iw * icoH) / icoAsset.ih;
          pdf.addImage(icoAsset.dataUrl, 'PNG', margin, (BAND_H - icoH) / 2, icoW, icoH);
        } else {
          pdf.setFontSize(8);
          pdf.setTextColor(...COLORS.white);
          pdf.setFont('helvetica', 'bold');
          pdf.text('AFIRME PLAY', margin, BAND_H / 2 + 2);
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(...COLORS.white);
        pdf.text(title, pageWidth - margin, BAND_H / 2 + 2, { align: 'right' });
        return BAND_H + 10;
      };

      if (bulletinBranding.logo) {
        drawMunicipalLogoTopCenter(pdf, pageWidth, margin, bulletinBranding.logo);
      }

      // Capa
      const coverTitle = 'BOLETIM DO ALUNO';
      const nameLine = `Aluno: ${studentNameRef.current || studentName || 'Não informado'}`;
      const gradeLine = `Série: ${studentGrade || 'Não informada'}`;
      const classLine = `Turma: ${studentClass || 'Não informada'}`;

      const centerX = pageWidth / 2;
      const BAND_H = 58;
      const hasLetterhead = Boolean(bulletinBranding.letterhead);

      if (!hasLetterhead) {
        pdf.setFillColor(...COLORS.white);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');
        pdf.setFillColor(...COLORS.primary);
        pdf.rect(0, 0, pageWidth, BAND_H, 'F');
      }

      // Logo municipal (se houver) no topo da faixa
      if (bulletinBranding.logo) {
        const desiredLogoWidth = 38;
        const desiredLogoHeight = (bulletinBranding.logo.ih * desiredLogoWidth) / bulletinBranding.logo.iw;
        pdf.addImage(
          bulletinBranding.logo.dataUrl,
          'PNG',
          centerX - desiredLogoWidth / 2,
          hasLetterhead ? 18 : 7,
          desiredLogoWidth,
          desiredLogoHeight
        );
      }

      pdf.setTextColor(...(hasLetterhead ? COLORS.primary : COLORS.white));
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(17);
      pdf.text(coverTitle, centerX, hasLetterhead ? 66 : BAND_H - 17, { align: 'center' });

      let coverY = hasLetterhead ? 80 : BAND_H + 18;
      const cardWidth = pageWidth - 40;
      const cardX = (pageWidth - cardWidth) / 2;
      const ACCENT_W = 4;
      const inset = 10;
      const labelWidth = 18;
      const ROW_H = 6;

      const fieldRows: Array<{ label: string; lines: string[] }> = [
        { label: '', lines: [nameLine] },
        { label: '', lines: [gradeLine] },
        { label: '', lines: [classLine] },
      ];
      const cardHeight = 14 + fieldRows.length * ROW_H + 12;
      const maxCardY = pageHeight - cardHeight - 12;
      if (coverY > maxCardY) coverY = maxCardY;

      pdf.setFillColor(...COLORS.bgLight);
      pdf.rect(cardX, coverY, cardWidth, cardHeight, 'F');
      pdf.setFillColor(...COLORS.primary);
      pdf.rect(cardX, coverY, ACCENT_W, cardHeight, 'F');
      pdf.setDrawColor(...COLORS.borderLight);
      pdf.setLineWidth(0.4);
      pdf.rect(cardX, coverY, cardWidth, cardHeight, 'S');

      let cardY = coverY + 10;
      const lx = cardX + ACCENT_W + inset;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(...COLORS.primary);
      pdf.text('INFORMAÇÕES DO ALUNO', cardX + ACCENT_W + (cardWidth - ACCENT_W) / 2, cardY, { align: 'center' });
      cardY += 8;
      pdf.setDrawColor(...COLORS.borderLight);
      pdf.setLineWidth(0.3);
      pdf.line(cardX + ACCENT_W + 4, cardY, cardX + cardWidth - 4, cardY);
      cardY += 7;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(...COLORS.textDark);
      fieldRows.forEach((f) => {
        pdf.text(f.lines, lx + labelWidth, cardY);
        cardY += ROW_H;
      });

      // Conteúdo
      pdf.addPage();

      if (subjectSections.length > 0) {
        for (let s = 0; s < subjectSections.length; s += 1) {
          const sectionElement = subjectSections[s];

          // Preparar header da seção
          const headerEl = sectionElement.querySelector('[data-section-header]') as HTMLElement | null;
          let headerImgData: string | null = null;
          let headerImgHeight = 0;
          if (headerEl) {
            const headerCanvas = await html2canvas(headerEl, canvasOptions);
            headerImgData = headerCanvas.toDataURL('image/png');
            headerImgHeight = (headerCanvas.height * usableWidth) / headerCanvas.width;
          }

          const tableHeadEl = sectionElement.querySelector('thead') as HTMLElement | null;
          let tableHeadImgData: string | null = null;
          let tableHeadImgHeight = 0;
          if (tableHeadEl) {
            const tableHeadCanvas = await html2canvas(tableHeadEl, canvasOptions);
            tableHeadImgData = tableHeadCanvas.toDataURL('image/png');
            tableHeadImgHeight = (tableHeadCanvas.height * usableWidth) / tableHeadCanvas.width;
          }

          // Função para desenhar header (se existir)
          function drawHeaderIfAny(currentY: number): number {
            if (!headerImgData) return currentY;
            pdf.addImage(headerImgData, 'PNG', margin, currentY, usableWidth, headerImgHeight);
            return currentY + headerImgHeight + 2; // pequeno espaçamento
          }

          function drawTableHeadIfAny(currentY: number): number {
            if (!tableHeadImgData) return currentY;
            pdf.addImage(tableHeadImgData, 'PNG', margin, currentY, usableWidth, tableHeadImgHeight);
            return currentY + tableHeadImgHeight + 1;
          }

          let currentY = drawCompactHeader('BOLETIM DO ALUNO');
          currentY = drawHeaderIfAny(currentY);
          currentY = drawTableHeadIfAny(currentY);

          // Pegar linhas da tabela
          const rowNodes = Array.from(
            sectionElement.querySelectorAll('tbody > tr')
          ) as HTMLElement[];

          // Se não houver linhas (fallback), renderizar a seção inteira como antes
          if (rowNodes.length === 0) {
            const sectionCanvas = await html2canvas(sectionElement, canvasOptions);
            const sectionImgData = sectionCanvas.toDataURL('image/png');
            const sectionImgHeight = (sectionCanvas.height * usableWidth) / sectionCanvas.width;

            if (currentY + sectionImgHeight > pageHeight - margin) {
              pdf.addPage();
              currentY = drawCompactHeader('BOLETIM DO ALUNO');
              currentY = drawHeaderIfAny(currentY);
            }

            pdf.addImage(sectionImgData, 'PNG', margin, currentY, usableWidth, sectionImgHeight);
            // Após seção, começar nova página para próxima seção
            if (s < subjectSections.length - 1) {
              pdf.addPage();
            }
            continue;
          }

          // Paginar linha a linha
          for (let r = 0; r < rowNodes.length; r += 1) {
            const rowCanvas = await html2canvas(rowNodes[r], canvasOptions);
            const rowImgData = rowCanvas.toDataURL('image/png');
            const rowImgHeight = (rowCanvas.height * usableWidth) / rowCanvas.width;

            if (currentY + rowImgHeight > pageHeight - margin) {
              pdf.addPage();
              currentY = drawCompactHeader('BOLETIM DO ALUNO');
              currentY = drawHeaderIfAny(currentY);
              currentY = drawTableHeadIfAny(currentY);
            }

            pdf.addImage(rowImgData, 'PNG', margin, currentY, usableWidth, rowImgHeight);
            currentY += rowImgHeight + 2;
          }

          // Após seção, começar nova página para a próxima seção
          if (s < subjectSections.length - 1) {
            pdf.addPage();
          }
        }
      } else {
        const fallbackCanvas = await html2canvas(clonedCard, canvasOptions);
        const fallbackImgData = fallbackCanvas.toDataURL('image/png');
        const fallbackImgHeight = (fallbackCanvas.height * usableWidth) / fallbackCanvas.width;
        let heightLeft = fallbackImgHeight;
        let position = margin;

        pdf.addImage(fallbackImgData, 'PNG', margin, position, usableWidth, fallbackImgHeight);
        heightLeft -= usableHeight;

        while (heightLeft > 0) {
          position = margin - (fallbackImgHeight - heightLeft);
          pdf.addPage();
          pdf.addImage(fallbackImgData, 'PNG', margin, position, usableWidth, fallbackImgHeight);
          heightLeft -= usableHeight;
        }
      }

      const sanitizeFileName = (text: string | null): string => {
        if (!text) return '';
        return text
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase()
          .substring(0, 50);
      };

      const studentNameSanitized = sanitizeFileName(studentName);
      const evaluationTitleSanitized = sanitizeFileName(evaluationTitle);
      const dateStr = new Date().toISOString().split('T')[0];
      const nameParts = ['boletim', studentNameSanitized || 'aluno', evaluationTitleSanitized || 'avaliacao', dateStr].filter(Boolean);
      const fileName = `${nameParts.join('-')}.pdf`;
      pdf.save(fileName);

      toast({
        title: "PDF Exportado com Sucesso",
        description: `O boletim foi salvo como ${fileName}`,
      });

      // Limpar clone
      document.body.removeChild(offscreenRoot);
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      toast({
        title: "Erro ao Exportar PDF",
        description: "Não foi possível gerar o PDF. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsExportingPDF(false);
    }
  };

  const isLoading = loadingState.questions || loadingState.answers;

  // Animação da barra de carregamento (0 → 75% → 0) enquanto carrega
  useEffect(() => {
    if (!isLoading) {
      setLoadingProgress(0);
      return;
    }
    let cancelled = false;
    let value = 0;
    let direction = 1;
    const step = 8;
    const interval = setInterval(() => {
      if (cancelled) return;
      value += direction * step;
      if (value >= 75) {
        value = 75;
        direction = -1;
      } else if (value <= 0) {
        value = 0;
        direction = 1;
      }
      setLoadingProgress(Math.max(0, Math.min(75, value)));
    }, 120);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isLoading]);

  // Se há erro mas temos questões carregadas, mostrar com aviso
  if (error && bulletinQuestions.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center">
            <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Erro ao Carregar Boletim</h3>
          <p className="text-muted-foreground mb-4">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Boletim de Questões</CardTitle>
          <div className="mt-3 w-full" role="progressbar" aria-label="Carregando boletim" aria-valuenow={loadingProgress} aria-valuemin={0} aria-valuemax={100} aria-valuetext="Carregando">
            <Progress value={loadingProgress} className="h-2 bg-muted" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {[1, 2].map((section) => (
              <div key={section}>
                <Skeleton className="h-6 w-48 mb-4" />
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (bulletinQuestions.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">Nenhuma questão encontrada nesta avaliação.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card ref={cardRef} className="bg-card border-border">
      <CardHeader data-pdf-header className="border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg font-semibold text-foreground">Boletim de Questões</CardTitle>
            {error && bulletinQuestions.length > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Algumas informações podem estar incompletas
              </p>
            )}
          </div>
          <div ref={controlsRef} className="flex items-center gap-2 flex-shrink-0" data-pdf-controls>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportToPDF}
              disabled={isExportingPDF}
              className="h-9 whitespace-nowrap shrink-0 border-border hover:bg-muted"
              type="button"
              aria-label={isExportingPDF ? 'Exportando PDF' : 'Exportar PDF'}
            >
              <Download className="h-4 w-4 mr-2" />
              {isExportingPDF ? 'Exportando...' : 'Exportar PDF'}
            </Button>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filter} onValueChange={(value: FilterType) => setFilter(value)}>
                <SelectTrigger className="w-44 h-9 border-border">
                  <SelectValue placeholder="Filtrar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas ({bulletinQuestions.length})</SelectItem>
                  <SelectItem value="correct">
                    Corretas ({bulletinQuestions.filter(q => q.isCorrect === true).length})
                  </SelectItem>
                  <SelectItem value="incorrect">
                    Incorretas ({bulletinQuestions.filter(q => q.isCorrect === false).length})
                  </SelectItem>
                  <SelectItem value="unanswered">
                    Não respondidas ({bulletinQuestions.filter(q => !q.hasAnswer).length})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>
      {availableDisciplines.length > 1 ? (
        <div
          className="flex flex-wrap gap-2 border-b border-border bg-muted/20 px-4 py-3 sm:px-6"
          data-pdf-controls
          role="tablist"
          aria-label="Filtrar por disciplina"
        >
          <Button
            type="button"
            size="sm"
            variant={disciplineFilter === 'all' ? 'default' : 'outline'}
            className={cn(
              'rounded-full shrink-0',
              disciplineFilter === 'all' && 'shadow-sm'
            )}
            onClick={() => setDisciplineFilter('all')}
            role="tab"
            aria-selected={disciplineFilter === 'all'}
          >
            Todas
          </Button>
          {availableDisciplines.map((subjectName) => (
            <Button
              key={subjectName}
              type="button"
              size="sm"
              variant={disciplineFilter === subjectName ? 'default' : 'outline'}
              className={cn(
                'rounded-full shrink-0 max-w-[200px] truncate',
                disciplineFilter === subjectName && 'shadow-sm'
              )}
              onClick={() => setDisciplineFilter(subjectName)}
              role="tab"
              aria-selected={disciplineFilter === subjectName}
              title={subjectName}
            >
              {subjectName}
            </Button>
          ))}
        </div>
      ) : null}
      <CardContent className="p-0">
        <ScrollArea ref={scrollAreaRef} className="h-[600px]">
          <div className="p-6 space-y-8">
            {displayedSubjectEntries.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nenhuma questão nesta disciplina com o filtro atual.
              </p>
            ) : null}
            {displayedSubjectEntries.map(([subjectName, questions]) => (
              <div
                key={subjectName}
                data-subject-section
                data-subject-name={subjectName}
                className="space-y-4"
              >
                {/* Cabeçalho da Disciplina */}
                <div data-section-header className="flex items-center gap-2 pb-2 border-b border-border">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">{subjectName}</h3>
                  
                  {(() => {
                    const stats = getDisciplineStats(subjectName);
                    if (stats) {
                      return (
                        <div className="flex items-center gap-3 ml-3 text-xs">
                          <span className="text-muted-foreground">
                            Nota: <span className="font-semibold text-foreground">{stats.nota.toFixed(1)}</span>
                          </span>
                          <span className="text-muted-foreground">|</span>
                              <span className="text-muted-foreground">
                                Proficiência: <span className="font-semibold text-foreground">{stats.proficiencia.toFixed(1)}</span>
                              </span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  
                  <span className="text-xs text-muted-foreground ml-auto">
                    {questions.length} {questions.length === 1 ? 'questão' : 'questões'}
                  </span>
                </div>

                {/* Tabela de Questões */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-primary">
                        <th className="text-left py-2 px-3 text-xs font-medium text-primary-foreground w-20">Questão</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-primary-foreground">Alternativas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {questions.map((bulletinQuestion, index) => {
                        const question = bulletinQuestion.question;
                        
                        return (
                          <tr
                            key={`${question.id}-${index}`}
                            id={`question-${bulletinQuestion.questionNumber}`}
                            className="border-b border-border hover:bg-muted transition-colors"
                          >
                            {/* Coluna Questão */}
                            <td className="py-3 px-3">
                              <span className="text-sm font-medium text-foreground">
                                Q{bulletinQuestion.questionNumber}
                              </span>
                            </td>

                            {/* Coluna Alternativas */}
                            <td className="py-3 px-3">
                              {question.alternatives && question.alternatives.length > 0 ? (
                                <div className="space-y-1.5">
                                  {question.alternatives.map((alt, altIndex) => {
                                    const isSelected = bulletinQuestion.selectedAlternative?.id === alt.id;
                                    const isCorrect = alt.isCorrect;
                                    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
                                    const letter = letters[altIndex] || `${altIndex + 1}`;

                                    // Determinar classes de fundo e texto baseado no status
                                    let bgClass = '';
                                    let textClass = '';
                                    let borderClass = '';
                                    
                                    if (isSelected && isCorrect) {
                                      // Alternativa selecionada e correta
                                      bgClass = 'bg-green-100';
                                      textClass = 'text-green-900';
                                      borderClass = 'border-green-300';
                                    } else if (isSelected && !isCorrect) {
                                      // Alternativa selecionada mas incorreta
                                      bgClass = 'bg-red-100';
                                      textClass = 'text-red-900';
                                      borderClass = 'border-red-300';
                                    } else if (isCorrect) {
                                      // Alternativa correta mas não selecionada
                                      bgClass = 'bg-green-50';
                                      textClass = 'text-green-800';
                                      borderClass = 'border-green-200';
                                    } else {
                                      // Alternativa neutra
                                      bgClass = 'bg-muted';
                                      textClass = 'text-foreground';
                                      borderClass = 'border-border';
                                    }

                                    return (
                                      <div
                                        key={alt.id || altIndex}
                                        className={`flex items-start gap-2 text-xs px-2 py-1.5 rounded border ${bgClass} ${textClass} ${borderClass}`}
                                      >
                                        <span className="font-medium w-4 shrink-0 pt-0.5">{letter})</span>
                                        <QuestionOptionContent
                                          text={alt.text}
                                          image={alt.image}
                                          questionId={question.id}
                                          apiBase={BASE_URL}
                                          className="flex-1 min-w-0"
                                          textClassName="text-xs leading-relaxed [&_.katex]:text-inherit"
                                        />
                                        <div className="flex items-center gap-1.5 ml-auto shrink-0 pt-0.5">
                                          {isSelected && (
                                            <span className="text-[10px] font-medium text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200">Sua</span>
                                          )}
                                          {isCorrect && (
                                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                          )}
                                          {isSelected && !isCorrect && (
                                            <XCircle className="h-3.5 w-3.5 text-red-600" />
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                // Questão discursiva
                                <div className="text-xs text-muted-foreground">
                                  <p className="font-medium mb-1">Resposta:</p>
                                  <p className="truncate max-w-md">
                                    {bulletinQuestion.studentAnswer || "Não respondida"}
                                  </p>
                                </div>
                              )}

                              {/* Caso: resposta não identificada */}
                              {bulletinQuestion.hasAnswer && 
                               !bulletinQuestion.selectedAlternative && 
                               bulletinQuestion.studentAnswer && (
                                <div className="mt-2 text-[10px] text-gray-500">
                                  Registrada: {bulletinQuestion.studentAnswer}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {filteredQuestions.length === 0 && (
          <div className="text-center py-12 text-muted-foreground p-6">
            <p className="text-sm">Nenhuma questão encontrada com o filtro selecionado.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}