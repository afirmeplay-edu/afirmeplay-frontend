export interface CertificateTemplate {
  id?: string;
  evaluation_id: string;
  title?: string;
  text_content: string;
  background_color: string;
  text_color: string;
  accent_color: string;
  logo_url?: string;
  signature_url?: string;
  custom_date?: string;
  font_size?: 'small' | 'medium' | 'large' | 'extra-large';
  created_at?: string;
  updated_at?: string;
}

export interface Certificate {
  id: string;
  student_id: string;
  student_name: string;
  evaluation_id: string;
  evaluation_title: string;
  grade: number;
  template_id?: string;  // ID do template (opcional, pode vir do backend)
  template: CertificateTemplate;  // Template completo aninhado
  issued_at: string;
  status: 'pending' | 'approved';
  created_at?: string;
}

export interface ApprovedStudent {
  id: string;
  name: string;
  grade: number;
  class_id?: string | null;
  class_name?: string | null;
  school_id?: string | null;
  school_name?: string | null;
  grade_id?: string | null;
  grade_name?: string | null;
  certificate_id?: string | null;
  certificate_status?: 'pending' | 'approved' | null;
}

export interface EvaluationWithCertificates {
  id: string;
  title: string;
  subject: string;
  subjects?: string[];
  applied_at: string;
  approved_students_count: number;
  total_students_count: number;
  certificate_status: 'none' | 'pending' | 'approved';
  approved_certificates_count?: number;
  pending_certificates_count?: number;
  certificates_count?: number;
  has_template?: boolean;
  created_by?: {
    id: string;
    name: string;
  };
  type?: 'AVALIACAO' | 'OLIMPIADA' | 'SIMULADO' | string;
}

export interface CertificateEvaluationSubject {
  id: string;
  name: string;
}

export interface CertificateEvaluationListItem {
  evaluation_id: string;
  title: string;
  type?: string | null;
  subject?: CertificateEvaluationSubject | null;
  subjects?: CertificateEvaluationSubject[];
  created_by?: { id: string; name: string } | null;
  created_at?: string | null;
  certificate_status: 'none' | 'pending' | 'approved';
  eligible_students_count: number;
  approved_certificates_count: number;
  pending_certificates_count: number;
  certificates_count: number;
  has_template: boolean;
}

export interface CertificateEvaluationsPagination {
  page: number;
  per_page: number;
  total: number;
  pages: number;
  has_next: boolean;
  has_prev: boolean;
  next_num: number | null;
  prev_num: number | null;
}

export interface CertificateEvaluationsResponse {
  data: CertificateEvaluationListItem[];
  pagination: CertificateEvaluationsPagination;
}

export interface CertificateApprovalRequest {
  evaluation_id: string;
  student_ids: string[];
  template: CertificateTemplate;
}

export interface CertificateBatchItem {
  certificate_id: string;
  student_id: string;
  student_name: string;
  grade: number;
  issued_at: string;
  certificate_status: 'approved' | 'pending';
  class_id?: string | null;
  class_name?: string | null;
  school_id?: string | null;
  school_name?: string | null;
  grade_id?: string | null;
  grade_name?: string | null;
}

export interface CertificateBatchResponse {
  evaluation_id: string;
  evaluation_title: string;
  template: CertificateTemplate;
  certificates: CertificateBatchItem[];
  meta: {
    total: number;
    filters_applied: {
      status: string;
      school_id: string | null;
      grade_id: string | null;
      class_id: string | null;
    };
  };
}

export interface CertificateBatchFilters {
  status?: 'approved' | 'pending';
  school_id?: string;
  grade_id?: string;
  class_id?: string;
}

