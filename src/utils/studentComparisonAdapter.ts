import type {
  ComparisonResponse,
  Comparison,
  GeneralComparison,
  SubjectComparison,
  SkillsComparison,
  EvolutionMetrics,
  EvaluationInfo,
} from '@/services/evaluation/evaluationComparisonApi';

/**
 * Resposta do endpoint de comparação do aluno (POST /test/student/compare).
 * Usa student_grade, student_proficiency etc. em vez de average_grade, average_proficiency.
 */
export interface StudentCompareApiResponse {
  student?: { id: string; user_id: string; name: string };
  evaluations: Array<{ order: number; id: string; title: string; created_at?: string; application_date?: string }>;
  total_evaluations: number;
  comparisons: Array<{
    from_evaluation: { id: string; title: string; order: number };
    to_evaluation: { id: string; title: string; order: number };
    general_comparison: {
      student_grade?: { evaluation_1: number; evaluation_2: number; evolution: EvolutionMetrics };
      student_proficiency?: { evaluation_1: number; evaluation_2: number; evolution: EvolutionMetrics };
      student_classification?: { evaluation_1: string; evaluation_2: string };
      correct_answers?: { evaluation_1: number; evaluation_2: number; evolution: EvolutionMetrics };
      total_questions?: { evaluation_1: number; evaluation_2: number };
      score_percentage?: { evaluation_1: number; evaluation_2: number; evolution: EvolutionMetrics };
    };
    subject_comparison: Record<
      string,
      {
        subject_id?: string;
        student_grade?: { evaluation_1: number; evaluation_2: number; evolution: EvolutionMetrics };
        student_proficiency?: { evaluation_1: number; evaluation_2: number; evolution: EvolutionMetrics };
        student_classification?: { evaluation_1: string; evaluation_2: string };
        correct_answers?: { evaluation_1: number; evaluation_2: number; evolution: EvolutionMetrics };
        total_questions?: { evaluation_1: number; evaluation_2: number };
      }
    >;
  }>;
  total_comparisons: number;
}

function toEvolutionMetrics(ev?: { value?: number; percentage?: number; direction?: string }): EvolutionMetrics {
  const dir = ev?.direction === 'increase' || ev?.direction === 'decrease' ? ev.direction : 'stable';
  return {
    value: typeof ev?.value === 'number' ? ev.value : 0,
    percentage: typeof ev?.percentage === 'number' ? ev.percentage : 0,
    direction: dir as 'increase' | 'decrease' | 'stable',
  };
}

/**
 * Converte a resposta da API de comparação do aluno para o formato ComparisonResponse
 * usado por processComparisonData e EvolutionCharts (mesmos gráficos e parâmetros da Evolution.tsx).
 */
export function studentComparisonToComparisonResponse(
  student: StudentCompareApiResponse | null | undefined
): ComparisonResponse | null {
  if (!student?.comparisons?.length || !student.evaluations?.length) return null;

  const comparisons: Comparison[] = student.comparisons.map((comp) => {
    const gen = comp.general_comparison;
    const studentGrade = gen.student_grade;
    const studentProf = gen.student_proficiency;
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
      average_grade: studentGrade
        ? {
            evaluation_1: studentGrade.evaluation_1,
            evaluation_2: studentGrade.evaluation_2,
            evolution: toEvolutionMetrics(studentGrade.evolution),
          }
        : { evaluation_1: 0, evaluation_2: 0, evolution: { value: 0, percentage: 0, direction: 'stable' } },
      average_proficiency: studentProf
        ? {
            evaluation_1: studentProf.evaluation_1,
            evaluation_2: studentProf.evaluation_2,
            evolution: toEvolutionMetrics(studentProf.evolution),
          }
        : { evaluation_1: 0, evaluation_2: 0, evolution: { value: 0, percentage: 0, direction: 'stable' } },
      total_students: { evaluation_1: 1, evaluation_2: 1 },
      classification_distribution: classificationDistribution,
    };

    const subject_comparison: SubjectComparison = {};
    if (comp.subject_comparison && typeof comp.subject_comparison === 'object') {
      Object.entries(comp.subject_comparison).forEach(([subjectName, subj]) => {
        const sg = subj.student_grade;
        const sp = subj.student_proficiency;
        const sc = subj.student_classification;
        const dist1: Record<string, number> = sc?.evaluation_1 ? { [sc.evaluation_1]: 1 } : {};
        const dist2: Record<string, number> = sc?.evaluation_2 ? { [sc.evaluation_2]: 1 } : {};
        subject_comparison[subjectName] = {
          subject_id: subj.subject_id ?? '',
          average_grade: sg
            ? {
                evaluation_1: sg.evaluation_1,
                evaluation_2: sg.evaluation_2,
                evolution: toEvolutionMetrics(sg.evolution),
              }
            : { evaluation_1: 0, evaluation_2: 0, evolution: { value: 0, percentage: 0, direction: 'stable' } },
          average_proficiency: sp
            ? {
                evaluation_1: sp.evaluation_1,
                evaluation_2: sp.evaluation_2,
                evolution: toEvolutionMetrics(sp.evolution),
              }
            : { evaluation_1: 0, evaluation_2: 0, evolution: { value: 0, percentage: 0, direction: 'stable' } },
          total_students: { evaluation_1: 1, evaluation_2: 1 },
          classification_distribution: { evaluation_1: dist1, evaluation_2: dist2 },
        };
      });
    }

    const skills_comparison: SkillsComparison = {};

    return {
      from_evaluation: comp.from_evaluation,
      to_evaluation: comp.to_evaluation,
      general_comparison,
      subject_comparison,
      skills_comparison,
    };
  });

  const evaluations = student.evaluations.map((e) => ({
    order: e.order ?? 0,
    id: e.id,
    title: e.title,
    created_at: e.created_at,
    application_date: e.application_date,
    grade_id: (e as { grade_id?: string }).grade_id,
    grade_name: (e as { grade_name?: string }).grade_name,
    grade_names: (e as { grade_names?: string[] }).grade_names,
    classes: (e as { classes?: EvaluationInfo['classes'] }).classes,
  }));

  return {
    evaluations,
    total_evaluations: student.total_evaluations,
    comparisons,
    total_comparisons: student.total_comparisons,
  };
}
