import type { ApprovedStudent } from '@/types/certificates';

export interface CertificateStats {
  total: number;
  approved: number;
  pending: number;
  notIssued: number;
  awaitingApproval: number;
}

export function getCertificateStats(students: ApprovedStudent[]): CertificateStats {
  let approved = 0;
  let pending = 0;
  let notIssued = 0;

  for (const student of students) {
    if (student.certificate_status === 'approved' && student.certificate_id) {
      approved++;
    } else if (student.certificate_status === 'pending') {
      pending++;
    } else {
      notIssued++;
    }
  }

  return {
    total: students.length,
    approved,
    pending,
    notIssued,
    awaitingApproval: students.length - approved,
  };
}

export function getStudentsAwaitingApproval(students: ApprovedStudent[]): ApprovedStudent[] {
  return students.filter((student) => student.certificate_status !== 'approved');
}
