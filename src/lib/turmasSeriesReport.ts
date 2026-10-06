import { getClassShiftLabel, normalizeClassShift } from "@/lib/classShift";

export interface TurmasSeriesReportSchool {
  id: string;
  name: string;
}

export interface TurmasSeriesReportTurma {
  id: string;
  name: string;
  school_id: string;
  grade_id?: string;
  shift?: string | null;
  students_count?: number;
  school?: { id: string; name: string };
  grade?: {
    id: string;
    name: string;
    education_stage_id?: string;
    education_stage?: { id: string; name: string };
  };
}

export interface TurmasSeriesReportFilters {
  schoolId: string;
  shift: string;
  courseId: string;
}

export const TURMAS_REPORT_ALL = "all";
export const TURMAS_REPORT_NO_SHIFT = "__none__";

export const DEFAULT_TURMAS_REPORT_FILTERS: TurmasSeriesReportFilters = {
  schoolId: TURMAS_REPORT_ALL,
  shift: TURMAS_REPORT_ALL,
  courseId: TURMAS_REPORT_ALL,
};

export function getTurmasReportCourseOptions(turmas: TurmasSeriesReportTurma[]) {
  const map = new Map<string, string>();
  for (const turma of turmas) {
    const stage = turma.grade?.education_stage;
    const id = stage?.id || turma.grade?.education_stage_id;
    const name = stage?.name?.trim();
    if (id && name) map.set(String(id), name);
  }
  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function filterTurmasForReport(
  turmas: TurmasSeriesReportTurma[],
  filters: TurmasSeriesReportFilters
): TurmasSeriesReportTurma[] {
  return turmas.filter((turma) => {
    if (filters.schoolId !== TURMAS_REPORT_ALL && turma.school_id !== filters.schoolId) return false;

    if (filters.shift !== TURMAS_REPORT_ALL) {
      const shift = normalizeClassShift(turma.shift);
      if (filters.shift === TURMAS_REPORT_NO_SHIFT) {
        if (shift) return false;
      } else if (shift !== filters.shift) {
        return false;
      }
    }

    if (filters.courseId !== TURMAS_REPORT_ALL) {
      const courseId = turma.grade?.education_stage?.id || turma.grade?.education_stage_id;
      if (String(courseId || "") !== filters.courseId) return false;
    }

    return true;
  });
}

export function aggregateTurmasBySerie(turmas: TurmasSeriesReportTurma[]) {
  const map = new Map<string, { name: string; turmas: number; alunos: number }>();
  for (const turma of turmas) {
    const key = turma.grade?.id || turma.grade_id || "__sem_serie__";
    const name = turma.grade?.name?.trim() || "Sem série";
    const prev = map.get(key) || { name, turmas: 0, alunos: 0 };
    prev.turmas += 1;
    prev.alunos += Number(turma.students_count) || 0;
    map.set(key, prev);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { numeric: true })
  );
}

export function aggregateTurmasByTurno(turmas: TurmasSeriesReportTurma[]) {
  const map = new Map<string, number>();
  for (const turma of turmas) {
    const label = getClassShiftLabel(turma.shift);
    map.set(label, (map.get(label) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
