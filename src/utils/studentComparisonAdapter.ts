import type {
  ComparisonResponse,
  Comparison,
  GeneralComparison,
  SubjectComparison,
  SkillsComparison,
  EvolutionMetrics,
  EvaluationInfo,
} from '@/services/evaluation/evaluationComparisonApi';
import type {
  EvolucaoAlunoItem,
  EvolucaoAlunoEvaluation,
  EvolucaoAlunoComparison,
} from '@/services/evaluation/evaluationResultsApi';
import { calcEvolution } from '@/utils/evolution/formatEvolutionMetric';

type MetricPair = {
  evaluation_1?: number;
  evaluation_2?: number;
  evolution?: EvolutionMetrics | { value?: number; percentage?: number; direction?: string };
};

type SubjectPayload = {
  subject_id?: string;
  student_grade?: MetricPair;
  student_proficiency?: MetricPair;
  student_classification?: { evaluation_1?: string; evaluation_2?: string };
  grade?: MetricPair;
  proficiency?: MetricPair;
  classification?: { evaluation_1?: string; evaluation_2?: string };
  correct_answers?: MetricPair;
  total_questions?: { evaluation_1?: number; evaluation_2?: number };
  score_percentage?: MetricPair;
};

/**
 * Resposta do endpoint de comparação do aluno (POST /test/student/compare)
 * ou item de GET /evaluation-results|answer-sheets/evolucao/alunos.
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
      student_grade?: MetricPair;
      student_proficiency?: MetricPair;
      student_classification?: { evaluation_1?: string; evaluation_2?: string };
      correct_answers?: MetricPair;
      total_questions?: { evaluation_1?: number; evaluation_2?: number };
      score_percentage?: MetricPair;
    };
    subject_comparison?: Record<string, SubjectPayload>;
    skills_comparison?: SkillsComparison | Record<string, unknown>;
  }>;
  total_comparisons?: number;
}

export const MAX_STUDENT_EVOLUTION_EVALUATIONS = 10;

function toEvolutionMetrics(ev?: { value?: number; percentage?: number; direction?: string }): EvolutionMetrics {
  const dir = ev?.direction === 'increase' || ev?.direction === 'decrease' ? ev.direction : 'stable';
  return {
    value: typeof ev?.value === 'number' ? ev.value : 0,
    percentage: typeof ev?.percentage === 'number' ? ev.percentage : 0,
    direction: dir as 'increase' | 'decrease' | 'stable',
  };
}

/** Usa valores reais quando existirem; não inventa 0 para métrica ausente (retorna null). */
function metricOrNull(metric?: MetricPair | null): {
  evaluation_1: number;
  evaluation_2: number;
  evolution: EvolutionMetrics;
} | null {
  if (!metric) return null;
  const e1 = metric.evaluation_1;
  const e2 = metric.evaluation_2;
  if (typeof e1 !== 'number' && typeof e2 !== 'number') return null;
  return {
    evaluation_1: typeof e1 === 'number' ? e1 : 0,
    evaluation_2: typeof e2 === 'number' ? e2 : 0,
    evolution: toEvolutionMetrics(metric.evolution),
  };
}

function metricOrZero(metric?: MetricPair | null) {
  return (
    metricOrNull(metric) ?? {
      evaluation_1: 0,
      evaluation_2: 0,
      evolution: { value: 0, percentage: 0, direction: 'stable' as const },
    }
  );
}

/** Aceita chaves digitais (student_*) e cartão (grade/proficiency/classification). */
function pickSubjectGrade(subj: SubjectPayload): MetricPair | undefined {
  return subj.student_grade ?? subj.grade;
}

function pickSubjectProficiency(subj: SubjectPayload): MetricPair | undefined {
  return subj.student_proficiency ?? subj.proficiency;
}

function pickSubjectClassification(
  subj: SubjectPayload
): { evaluation_1?: string; evaluation_2?: string } | undefined {
  return subj.student_classification ?? subj.classification;
}

function getEvaluationId(e: EvolucaoAlunoEvaluation | { id?: string }, index: number): string {
  return e.id || `eval-${index}`;
}

function getEvaluationTitle(
  e: EvolucaoAlunoEvaluation | { title?: string; titulo?: string },
  index: number
): string {
  return (e.title ?? ('titulo' in e ? e.titulo : undefined) ?? `Avaliação ${index + 1}`) as string;
}

function sortEvaluations(evaluations: EvolucaoAlunoEvaluation[]): EvolucaoAlunoEvaluation[] {
  return [...evaluations].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Default: últimas 2 avaliações ordenadas. */
export function defaultSelectedEvaluationIds(evaluations: EvolucaoAlunoEvaluation[] | undefined): string[] {
  const ordered = sortEvaluations(evaluations ?? []);
  if (ordered.length < 2) return ordered.map((e, i) => getEvaluationId(e, i));
  const start = ordered.length - 2;
  return ordered.slice(-2).map((e, i) => getEvaluationId(e, start + i));
}

function synthesizeComparison(
  from: EvolucaoAlunoEvaluation,
  to: EvolucaoAlunoEvaluation,
  fromIndex: number,
  toIndex: number
): EvolucaoAlunoComparison {
  const g1 = from.result?.grade ?? 0;
  const g2 = to.result?.grade ?? 0;
  const p1 = from.result?.proficiency ?? 0;
  const p2 = to.result?.proficiency ?? 0;
  const c1 = from.result?.correct_answers ?? 0;
  const c2 = to.result?.correct_answers ?? 0;
  const s1 = from.result?.score_percentage ?? 0;
  const s2 = to.result?.score_percentage ?? 0;

  return {
    from_evaluation: {
      id: getEvaluationId(from, fromIndex),
      title: getEvaluationTitle(from, fromIndex),
      order: from.order ?? fromIndex + 1,
      grade_id: from.grade_id,
      grade_name: from.grade_name,
      grade_names: from.grade_names,
      classes: from.classes,
    },
    to_evaluation: {
      id: getEvaluationId(to, toIndex),
      title: getEvaluationTitle(to, toIndex),
      order: to.order ?? toIndex + 1,
      grade_id: to.grade_id,
      grade_name: to.grade_name,
      grade_names: to.grade_names,
      classes: to.classes,
    },
    general_comparison: {
      student_grade: {
        evaluation_1: g1,
        evaluation_2: g2,
        evolution: calcEvolution(g1, g2),
      },
      student_proficiency: {
        evaluation_1: p1,
        evaluation_2: p2,
        evolution: calcEvolution(p1, p2),
      },
      student_classification: {
        evaluation_1: from.result?.classification || 'Não definido',
        evaluation_2: to.result?.classification || 'Não definido',
      },
      correct_answers: {
        evaluation_1: c1,
        evaluation_2: c2,
        evolution: calcEvolution(c1, c2),
      },
      total_questions: {
        evaluation_1: from.result?.total_questions ?? 0,
        evaluation_2: to.result?.total_questions ?? 0,
      },
      score_percentage: {
        evaluation_1: s1,
        evaluation_2: s2,
        evolution: calcEvolution(s1, s2),
      },
    },
    subject_comparison: {},
    skills_comparison: {},
  };
}

/**
 * Filtra o aluno para apenas as avaliações selecionadas (em ordem cronológica)
 * e remonta comparações consecutivas entre elas.
 */
export function filterStudentEvolutionByEvaluationIds(
  student: EvolucaoAlunoItem | null | undefined,
  selectedIds: string[]
): EvolucaoAlunoItem | null {
  if (!student) return null;
  const idSet = new Set(selectedIds.filter(Boolean));
  if (idSet.size < 2) return null;

  const orderedAll = sortEvaluations(student.evaluations ?? []);
  const orderedWithIdx = orderedAll
    .map((e, idx) => ({ e, idx }))
    .filter(({ e, idx }) => idSet.has(getEvaluationId(e, idx)));
  if (orderedWithIdx.length < 2) return null;

  const existing = student.comparisons ?? [];
  const comparisons: EvolucaoAlunoComparison[] = [];

  const findExistingComparison = (
    from: EvolucaoAlunoEvaluation,
    to: EvolucaoAlunoEvaluation,
    fromIdx: number,
    toIdx: number
  ): EvolucaoAlunoComparison | undefined => {
    const fromId = getEvaluationId(from, fromIdx);
    const toId = getEvaluationId(to, toIdx);
    return existing.find((c) => {
      const cf = c.from_evaluation?.id;
      const ct = c.to_evaluation?.id;
      if (cf && ct && cf === fromId && ct === toId) return true;
      if (
        c.from_evaluation?.order != null &&
        c.to_evaluation?.order != null &&
        c.from_evaluation.order === (from.order ?? fromIdx + 1) &&
        c.to_evaluation.order === (to.order ?? toIdx + 1)
      ) {
        return true;
      }
      return false;
    });
  };

  for (let i = 0; i < orderedWithIdx.length - 1; i++) {
    const { e: from, idx: fromIdx } = orderedWithIdx[i];
    const { e: to, idx: toIdx } = orderedWithIdx[i + 1];
    const found = findExistingComparison(from, to, fromIdx, toIdx);
    const synthesized = synthesizeComparison(from, to, fromIdx, toIdx);
    if (found) {
      const hasSubject =
        found.subject_comparison &&
        typeof found.subject_comparison === 'object' &&
        Object.keys(found.subject_comparison).length > 0;
      comparisons.push(
        hasSubject
          ? found
          : {
              ...found,
              subject_comparison: found.subject_comparison ?? synthesized.subject_comparison,
              general_comparison: found.general_comparison ?? synthesized.general_comparison,
            }
      );
    } else {
      comparisons.push(synthesized);
    }
  }

  return {
    ...student,
    evaluations: orderedWithIdx.map(({ e, idx }, i) => ({
      ...e,
      order: e.order ?? i + 1,
      id: getEvaluationId(e, idx),
      title: getEvaluationTitle(e, idx),
    })),
    comparisons,
    total_evaluations: orderedWithIdx.length,
    total_comparisons: comparisons.length,
  };
}

/**
 * Converte a resposta da API de comparação do aluno para ComparisonResponse
 * (processComparisonData + EvolutionCharts).
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
    const genAny = gen as Record<string, MetricPair | undefined>;
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

    const gradeMetric = metricOrNull(gen.student_grade ?? genAny.grade);
    const profMetric = metricOrNull(gen.student_proficiency ?? genAny.proficiency);

    const general_comparison: GeneralComparison = {
      average_grade: gradeMetric ?? metricOrZero(undefined),
      average_proficiency: profMetric ?? metricOrZero(undefined),
      total_students: { evaluation_1: 1, evaluation_2: 1 },
      classification_distribution: classificationDistribution,
    };

    const subject_comparison: SubjectComparison = {};
    if (comp.subject_comparison && typeof comp.subject_comparison === 'object') {
      Object.entries(comp.subject_comparison as Record<string, SubjectPayload>).forEach(
        ([subjectName, subj]) => {
          const sc = pickSubjectClassification(subj);
          const dist1: Record<string, number> = sc?.evaluation_1 ? { [sc.evaluation_1]: 1 } : {};
          const dist2: Record<string, number> = sc?.evaluation_2 ? { [sc.evaluation_2]: 1 } : {};
          const sg = metricOrNull(pickSubjectGrade(subj));
          const sp = metricOrNull(pickSubjectProficiency(subj));
          // Pular disciplina sem nota e sem proficiência (evita barras zeradas falsas)
          if (!sg && !sp) return;
          subject_comparison[subjectName] = {
            subject_id: subj.subject_id ?? '',
            average_grade: sg ?? metricOrZero(undefined),
            average_proficiency: sp ?? metricOrZero(undefined),
            total_students: { evaluation_1: 1, evaluation_2: 1 },
            classification_distribution: { evaluation_1: dist1, evaluation_2: dist2 },
          };
        }
      );
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
    title: getEvaluationTitle(e, index),
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
