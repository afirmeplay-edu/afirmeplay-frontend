import type {
  ComparisonResponse,
  Comparison,
  GeneralComparison,
  SubjectComparison,
  SkillsComparison,
  EvolutionMetrics,
  EvaluationInfo,
} from '@/services/evaluation/evaluationComparisonApi';
import type { EvolucaoAlunoItem } from '@/services/evaluation/evaluationResultsApi';

/**
 * Resposta do endpoint de comparação do aluno (POST /test/student/compare)
 * ou item de GET /evaluation-results|answer-sheets/evolucao/alunos.
 * Usa student_grade, student_proficiency etc. em vez de average_grade, average_proficiency.
 */
export interface StudentCompareApiResponse {
  student?: { id: string; user_id: string; name: string };
  id?: string;
  user_id?: string;
  name?: string;
  evaluations?: Array<{
    order?: number;
    id?: string;
    title?: string;
    titulo?: string;
    created_at?: string | null;
    application_date?: string | null;
    grade_id?: string;
    grade_name?: string;
    grade_names?: string[];
    classes?: EvaluationInfo['classes'];
    result?: unknown;
  }>;
  total_evaluations?: number;
  comparisons?: Array<{
    from_evaluation?: {
      id?: string;
      title?: string;
      order?: number;
      grade_id?: string;
      grade_name?: string;
      grade_names?: string[];
      classes?: EvaluationInfo['classes'];
    };
    to_evaluation?: {
      id?: string;
      title?: string;
      order?: number;
      grade_id?: string;
      grade_name?: string;
      grade_names?: string[];
      classes?: EvaluationInfo['classes'];
    };
    general_comparison?: {
      student_grade?: {
        evaluation_1?: number;
        evaluation_2?: number;
        evolution?: EvolutionMetrics | { value?: number; percentage?: number; direction?: string };
      };
      student_proficiency?: {
        evaluation_1?: number;
        evaluation_2?: number;
        evolution?: EvolutionMetrics | { value?: number; percentage?: number; direction?: string };
      };
      student_classification?: { evaluation_1?: string; evaluation_2?: string };
      correct_answers?: {
        evaluation_1?: number;
        evaluation_2?: number;
        evolution?: EvolutionMetrics | { value?: number; percentage?: number; direction?: string };
      };
      total_questions?: { evaluation_1?: number; evaluation_2?: number };
      score_percentage?: {
        evaluation_1?: number;
        evaluation_2?: number;
        evolution?: EvolutionMetrics | { value?: number; percentage?: number; direction?: string };
      };
    };
    subject_comparison?: Record<
      string,
      {
        subject_id?: string;
        student_grade?: {
          evaluation_1?: number;
          evaluation_2?: number;
          evolution?: EvolutionMetrics | { value?: number; percentage?: number; direction?: string };
        };
        student_proficiency?: {
          evaluation_1?: number;
          evaluation_2?: number;
          evolution?: EvolutionMetrics | { value?: number; percentage?: number; direction?: string };
        };
        student_classification?: { evaluation_1?: string; evaluation_2?: string };
        correct_answers?: {
          evaluation_1?: number;
          evaluation_2?: number;
          evolution?: EvolutionMetrics | { value?: number; percentage?: number; direction?: string };
        };
        total_questions?: { evaluation_1?: number; evaluation_2?: number };
        score_percentage?: {
          evaluation_1?: number;
          evaluation_2?: number;
          evolution?: EvolutionMetrics | { value?: number; percentage?: number; direction?: string };
        };
      }
    >;
    skills_comparison?: SkillsComparison | Record<string, unknown>;
  }>;
  total_comparisons?: number;
}

function toEvolutionMetrics(ev?: { value?: number; percentage?: number; direction?: string }): EvolutionMetrics {
  const dir = ev?.direction === 'increase' || ev?.direction === 'decrease' ? ev.direction : 'stable';
  return {
    value: typeof ev?.value === 'number' ? ev.value : 0,
    percentage: typeof ev?.percentage === 'number' ? ev.percentage : 0,
    direction: dir as 'increase' | 'decrease' | 'stable',
  };
}

function metricOrZero(metric?: {
  evaluation_1?: number;
  evaluation_2?: number;
  evolution?: { value?: number; percentage?: number; direction?: string };
}) {
  if (!metric) {
    return {
      evaluation_1: 0,
      evaluation_2: 0,
      evolution: { value: 0, percentage: 0, direction: 'stable' as const },
    };
  }
  return {
    evaluation_1: typeof metric.evaluation_1 === 'number' ? metric.evaluation_1 : 0,
    evaluation_2: typeof metric.evaluation_2 === 'number' ? metric.evaluation_2 : 0,
    evolution: toEvolutionMetrics(metric.evolution),
  };
}

/**
 * Converte a resposta da API de comparação do aluno para o formato ComparisonResponse
 * usado por processComparisonData e EvolutionCharts (mesmos gráficos da Evolution.tsx).
 */
export function studentComparisonToComparisonResponse(
  student: StudentCompareApiResponse | EvolucaoAlunoItem | null | undefined
): ComparisonResponse | null {
  if (!student) return null;

  const evaluationsRaw = student.evaluations ?? [];
  const comparisonsRaw = student.comparisons ?? [];
  if (!comparisonsRaw.length || !evaluationsRaw.length) return null;

  const comparisons: Comparison[] = comparisonsRaw.map((comp) => {
    const gen = comp.general_comparison ?? {};
    const studentClass = gen.student_classification;

    const classificationDistribution = {
      evaluation_1: {} as Record<string, number>,
      evaluation_2: {} as Record<string, number>,
    };
    if (studentClass?.evaluation_1) {
      classificationDistribution.evaluation_1[studentClass.evaluation_1] = 1;
    }
    if (studentClass?.evaluation_2) {
      classificationDistribution.evaluation_2[studentClass.evaluation_2] = 1;
    }

    const general_comparison: GeneralComparison = {
      average_grade: metricOrZero(gen.student_grade),
      average_proficiency: metricOrZero(gen.student_proficiency),
      total_students: { evaluation_1: 1, evaluation_2: 1 },
      classification_distribution: classificationDistribution,
    };

    const subject_comparison: SubjectComparison = {};
    if (comp.subject_comparison && typeof comp.subject_comparison === 'object') {
      Object.entries(comp.subject_comparison).forEach(([subjectName, subj]) => {
        const sc = subj.student_classification;
        const dist1: Record<string, number> = sc?.evaluation_1 ? { [sc.evaluation_1]: 1 } : {};
        const dist2: Record<string, number> = sc?.evaluation_2 ? { [sc.evaluation_2]: 1 } : {};
        subject_comparison[subjectName] = {
          subject_id: subj.subject_id ?? '',
          average_grade: metricOrZero(subj.student_grade),
          average_proficiency: metricOrZero(subj.student_proficiency),
          total_students: { evaluation_1: 1, evaluation_2: 1 },
          classification_distribution: { evaluation_1: dist1, evaluation_2: dist2 },
        };
      });
    }

    const skills_comparison: SkillsComparison =
      comp.skills_comparison && typeof comp.skills_comparison === 'object'
        ? (comp.skills_comparison as SkillsComparison)
        : {};

    const from = comp.from_evaluation ?? { id: '', title: '', order: 0 };
    const to = comp.to_evaluation ?? { id: '', title: '', order: 0 };

    return {
      from_evaluation: {
        id: from.id ?? '',
        title: from.title ?? '',
        order: from.order ?? 0,
        grade_id: from.grade_id,
        grade_name: from.grade_name,
        grade_names: from.grade_names,
        classes: from.classes,
      },
      to_evaluation: {
        id: to.id ?? '',
        title: to.title ?? '',
        order: to.order ?? 0,
        grade_id: to.grade_id,
        grade_name: to.grade_name,
        grade_names: to.grade_names,
        classes: to.classes,
      },
      general_comparison,
      subject_comparison,
      skills_comparison,
    };
  });

  const evaluations: EvaluationInfo[] = evaluationsRaw.map((e, index) => ({
    order: e.order ?? index + 1,
    id: e.id ?? `eval-${index}`,
    title: (e.title ?? ('titulo' in e ? e.titulo : undefined) ?? `Avaliação ${index + 1}`) as string,
    created_at: e.created_at ?? undefined,
    application_date: e.application_date ?? undefined,
    grade_id: e.grade_id,
    grade_name: e.grade_name,
    grade_names: e.grade_names,
    classes: e.classes,
  }));

  return {
    evaluations,
    total_evaluations: student.total_evaluations ?? evaluations.length,
    comparisons,
    total_comparisons: student.total_comparisons ?? comparisons.length,
  };
}
