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
  applied_at: string;
  approved_students_count: number;
  total_students_count: number;
  certificate_status: 'none' | 'pending' | 'approved';
  created_by?: {
    id: string;
    name: string;
  };
  type?: 'AVALIACAO' | 'OLIMPIADA' | string;
}

export interface CertificateApprovalRequest {
  evaluation_id: string;
  student_ids: string[];
  template: CertificateTemplate;
}

