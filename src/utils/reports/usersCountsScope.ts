import type { UsersCountsReportResponse } from "@/utils/reports/usersMunicipioCountsPdf";

type NullableNumber = number | null | undefined;

function n(value: NullableNumber): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(v: unknown): string {
  return String(v ?? "").trim();
}

function schoolKey(input: { school_id?: string; school_name?: string }): string {
  const id = text(input.school_id);
  if (id) return `id:${id}`;
  const name = text(input.school_name).toLowerCase();
  if (name) return `name:${name}`;
  return "none";
}

function gradeKey(input: { grade_id?: string; grade_name?: string }): string {
  const id = text(input.grade_id);
  if (id) return `id:${id}`;
  const name = text(input.grade_name).toLowerCase();
  if (name) return `name:${name}`;
  return "none";
}

export function normalizeUsersCountsReport(
  raw: UsersCountsReportResponse | null | undefined
): UsersCountsReportResponse {
  const bySchool = Array.isArray(raw?.by_school) ? [...raw.by_school] : [];
  const byGrade = Array.isArray(raw?.by_grade) ? [...raw.by_grade] : [];
  const byClass = Array.isArray(raw?.by_class) ? [...raw.by_class] : [];

  const schoolBaseMap = new Map<
    string,
    {
      school_id?: string;
      school_name?: string;
      students: number;
      teachers: number;
      directors: number;
      coordinators: number;
    }
  >();

  for (const row of bySchool) {
    const key = schoolKey(row);
    const prev = schoolBaseMap.get(key);
    if (prev) {
      prev.students = n(row.students);
      prev.directors = n(row.directors);
      prev.coordinators = n(row.coordinators);
      prev.teachers = Math.max(prev.teachers, n(row.teachers));
      if (!prev.school_name && row.school_name) prev.school_name = row.school_name;
      if (!prev.school_id && row.school_id) prev.school_id = row.school_id;
      continue;
    }
    schoolBaseMap.set(key, {
      school_id: row.school_id,
      school_name: row.school_name,
      students: n(row.students),
      teachers: n(row.teachers),
      directors: n(row.directors),
      coordinators: n(row.coordinators),
    });
  }

  // Garante que escolas presentes apenas em `by_class` também existam no mapa.
  // Não soma professores por turma: isso contaria o mesmo usuário várias vezes.
  for (const row of byClass) {
    const key = schoolKey(row);
    if (key === "none") continue;
    const prev = schoolBaseMap.get(key) ?? {
      school_id: row.school_id,
      school_name: row.school_name,
      students: 0,
      teachers: 0,
      directors: 0,
      coordinators: 0,
    };
    if (!prev.school_name && row.school_name) prev.school_name = row.school_name;
    if (!prev.school_id && row.school_id) prev.school_id = row.school_id;
    schoolBaseMap.set(key, prev);
  }

  const normalizedByClass = byClass.map((row) => {
    const schoolStats = schoolBaseMap.get(schoolKey(row));
    return {
      ...row,
      directors: n(row.directors) || n(schoolStats?.directors),
      coordinators: n(row.coordinators) || n(schoolStats?.coordinators),
    };
  });

  // Recalcula por série com base em turmas e com deduplicação por escola para diretor/coordenador.
  const gradeAggMap = new Map<
    string,
    {
      grade_id?: string;
      grade_name?: string;
      students: number;
      teachers: number;
      schoolKeys: Set<string>;
    }
  >();

  for (const row of normalizedByClass) {
    const gKey = gradeKey(row);
    if (gKey === "none") continue;
    const prev = gradeAggMap.get(gKey) ?? {
      grade_id: row.grade_id,
      grade_name: row.grade_name,
      students: 0,
      teachers: 0,
      schoolKeys: new Set<string>(),
    };
    prev.students += n(row.students);
    prev.teachers += n(row.teachers);
    const sKey = schoolKey(row);
    if (sKey !== "none") prev.schoolKeys.add(sKey);
    if (!prev.grade_name && row.grade_name) prev.grade_name = row.grade_name;
    if (!prev.grade_id && row.grade_id) prev.grade_id = row.grade_id;
    gradeAggMap.set(gKey, prev);
  }

  const existingByGrade = new Map<string, (typeof byGrade)[number]>();
  for (const row of byGrade) {
    existingByGrade.set(gradeKey(row), row);
  }

  const normalizedByGrade = Array.from(
    new Set<string>([...existingByGrade.keys(), ...gradeAggMap.keys()])
  ).map((key) => {
    const original = existingByGrade.get(key);
    const agg = gradeAggMap.get(key);
    const gradeSchools = agg?.schoolKeys ?? new Set<string>();
    let directors = 0;
    let coordinators = 0;
    for (const sKey of gradeSchools) {
      const schoolStats = schoolBaseMap.get(sKey);
      directors += n(schoolStats?.directors);
      coordinators += n(schoolStats?.coordinators);
    }
    return {
      grade_id: original?.grade_id ?? agg?.grade_id,
      grade_name: original?.grade_name ?? agg?.grade_name,
      students: agg ? agg.students : n(original?.students),
      teachers: agg ? agg.teachers : n(original?.teachers),
      directors: directors || n(original?.directors),
      coordinators: coordinators || n(original?.coordinators),
    };
  });

  const normalizedBySchool = Array.from(schoolBaseMap.values()).map((row) => ({
    school_id: row.school_id,
    school_name: row.school_name,
    students: row.students,
    teachers: row.teachers,
    directors: row.directors,
    coordinators: row.coordinators,
  }));

  return {
    general: raw?.general ?? {},
    by_school: normalizedBySchool,
    by_grade: normalizedByGrade,
    by_class: normalizedByClass,
  };
}

export function buildSchoolScopedUsersCountsReport(
  source: UsersCountsReportResponse,
  schoolId: string,
  fallbackSchoolName?: string
): UsersCountsReportResponse {
  const normalized = normalizeUsersCountsReport(source);
  const bySchool = Array.isArray(normalized.by_school) ? normalized.by_school : [];
  const byClass = Array.isArray(normalized.by_class) ? normalized.by_class : [];

  const schoolRow =
    bySchool.find((row) => text(row.school_id) === schoolId) ??
    bySchool.find((row) => text(row.school_name).toLowerCase() === text(fallbackSchoolName).toLowerCase()) ??
    null;

  const classRows = byClass
    .filter((row) => text(row.school_id) === schoolId)
    .map((row) => ({
      ...row,
      school_name: row.school_name ?? schoolRow?.school_name ?? fallbackSchoolName,
      directors: n(row.directors) || n(schoolRow?.directors),
      coordinators: n(row.coordinators) || n(schoolRow?.coordinators),
    }));

  const gradeMap = new Map<
    string,
    {
      grade_id?: string;
      grade_name?: string;
      students: number;
      teachers: number;
    }
  >();

  for (const row of classRows) {
    const key = gradeKey(row);
    if (key === "none") continue;
    const prev = gradeMap.get(key) ?? {
      grade_id: row.grade_id,
      grade_name: row.grade_name,
      students: 0,
      teachers: 0,
    };
    prev.students += n(row.students);
    prev.teachers += n(row.teachers);
    if (!prev.grade_name && row.grade_name) prev.grade_name = row.grade_name;
    if (!prev.grade_id && row.grade_id) prev.grade_id = row.grade_id;
    gradeMap.set(key, prev);
  }

  const schoolName = schoolRow?.school_name ?? fallbackSchoolName ?? "Escola";
  const schoolDirectors = n(schoolRow?.directors);
  const schoolCoordinators = n(schoolRow?.coordinators);
  const schoolTeachers = n(schoolRow?.teachers);
  const schoolStudents = n(schoolRow?.students) || classRows.reduce((sum, row) => sum + n(row.students), 0);

  const scopedByGrade = Array.from(gradeMap.values()).map((row) => ({
    ...row,
    directors: schoolDirectors,
    coordinators: schoolCoordinators,
  }));

  return {
    general: {
      students: schoolStudents,
      teachers: schoolTeachers,
      directors: schoolDirectors,
      coordinators: schoolCoordinators,
      tecadm: 0,
    },
    by_school: [
      {
        school_id: schoolId,
        school_name: schoolName,
        students: schoolStudents,
        teachers: schoolTeachers,
        directors: schoolDirectors,
        coordinators: schoolCoordinators,
        tecadm: 0,
      },
    ],
    by_grade: scopedByGrade,
    by_class: classRows,
  };
}

export function isSchoolScopedRole(role: string | null | undefined): boolean {
  const normalized = text(role).toLowerCase();
  return normalized === "diretor" || normalized === "coordenador";
}
