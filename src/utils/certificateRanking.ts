import type { ApprovedStudent } from '@/types/certificates';

export type CertificateRankingGroupBy = 'school' | 'grade' | 'class';

export interface CertificateRankingEntry {
  id: string;
  name: string;
  approved: number;
  eligible: number;
  pending: number;
  approvalRate: number;
}

export interface CertificateRankingOptions {
  groupBy: CertificateRankingGroupBy;
  schoolId?: string | null;
}

function getGroupKey(
  student: ApprovedStudent,
  groupBy: CertificateRankingGroupBy
): { id: string; name: string } {
  switch (groupBy) {
    case 'school':
      return {
        id: student.school_id || '__none__',
        name: student.school_name?.trim() || 'Sem escola',
      };
    case 'grade':
      return {
        id: student.grade_id || '__none__',
        name: student.grade_name?.trim() || 'Sem série',
      };
    case 'class':
      return {
        id: student.class_id || '__none__',
        name: student.class_name?.trim() || 'Sem turma',
      };
  }
}

export function buildCertificateRanking(
  students: ApprovedStudent[],
  options: CertificateRankingOptions
): CertificateRankingEntry[] {
  const filtered = options.schoolId
    ? students.filter((student) => student.school_id === options.schoolId)
    : students;

  const map = new Map<string, CertificateRankingEntry>();

  for (const student of filtered) {
    const { id, name } = getGroupKey(student, options.groupBy);
    let entry = map.get(id);
    if (!entry) {
      entry = { id, name, approved: 0, eligible: 0, pending: 0, approvalRate: 0 };
      map.set(id, entry);
    }

    entry.eligible += 1;
    if (student.certificate_status === 'approved' && student.certificate_id) {
      entry.approved += 1;
    } else if (student.certificate_status === 'pending') {
      entry.pending += 1;
    }
  }

  const entries = Array.from(map.values());
  for (const entry of entries) {
    entry.approvalRate =
      entry.eligible > 0 ? Math.round((entry.approved / entry.eligible) * 1000) / 10 : 0;
  }

  return entries.sort((a, b) => {
    if (b.approved !== a.approved) return b.approved - a.approved;
    if (b.approvalRate !== a.approvalRate) return b.approvalRate - a.approvalRate;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

export function getRankingSchoolOptions(students: ApprovedStudent[]): { id: string; name: string }[] {
  const map = new Map<string, string>();

  for (const student of students) {
    if (student.school_id) {
      map.set(student.school_id, student.school_name?.trim() || student.school_id);
    }
  }

  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
