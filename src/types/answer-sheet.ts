export interface Estado {
  id: string;
  name: string;
}

export interface Municipio {
  id: string;
  name: string;
  state: string;
}

export interface AnswerSheetConfig {
  estado: string;
  estado_sigla: string;
  municipio: string;
  municipio_id: string;
  escola_id: string;
  escola_nome: string;
  serie_id: string;
  serie_nome: string;
  turma_id: string;
  turma_nome: string;
  prova_titulo: string;
  total_questoes: number;
  gabarito: Record<number, 'A' | 'B' | 'C' | 'D'>;
  data_geracao: string;
  questoes_detalhes?: Array<{
    numero: number;
    id: string;
    disciplina: string;
  }>;
}

export interface StudentAnswerSheet {
  id: string;
  name: string;
  email?: string;
  class_name: string;
  presente: boolean;
}

export interface QRCodeData {
  aluno_id: string;
  escola_id: string;
  turma_id: string;
  prova_titulo: string;
  data_geracao: string;
  gabarito_hash?: string;
}

export interface School {
  id: string;
  name: string;
  city?: string;
  municipio?: string;
}

export interface Serie {
  id: string;
  name: string;
}

export interface Turma {
  id: string;
  name: string;
  serie_id?: string;
  escola_id?: string;
}

export interface Student {
  id: string;
  name: string;
  email?: string;
  class_name?: string;
  turma_id?: string;
  escola_id?: string;
}

/** Resumo de escola (apenas quando scope_type === 'city') */
export interface GabaritoSchoolSummary {
  school_id: string;
  school_name: string;
  classes_count: number;
  students_count: number;
}

/** Turma no snapshot (API pode enviar UUIDs ou objetos enriquecidos) */
export interface GabaritoScopeClassEntry {
  class_id: string;
  class_name?: string;
  grade_name?: string;
  /** Ex.: "9º Ano - A" */
  label?: string;
}

/** Snapshot do escopo no momento da geração (schema flexível por tenant) */
export interface GabaritoScopeSnapshot {
  scope?: string;
  city_id?: string;
  /** UUIDs ou lista detalhada por turma/série */
  class_ids?: Array<string | GabaritoScopeClassEntry>;
  school_ids?: string[];
  grade_ids?: string[];
  [key: string]: unknown;
}

/** Uma geração / ZIP distinta do mesmo cartão resposta (histórico no tenant) */
export interface GabaritoGeneration {
  id: string;
  gabarito_id: string;
  job_id?: string;
  scope_type?: 'class' | 'grade' | 'school' | 'city';
  scope_snapshot?: GabaritoScopeSnapshot | null;
  minio_url?: string | null;
  minio_object_name?: string;
  minio_bucket?: string;
  zip_generated_at?: string | null;
  total_classes?: number;
  total_students?: number;
  status?: string;
  created_by?: string;
  created_at?: string;
  can_download?: boolean;
  /** Caminho/URL da API para GET binário (ex.: `?job_id=` no histórico). */
  download_url?: string | null;
}

export interface Gabarito {
  id: string;
  test_id: string | null;
  class_id?: string | null;
  class_name?: string | null;
  grade_id?: string | null;
  grade_name?: string;
  num_questions?: number;
  use_blocks?: boolean;
  title: string;
  school_id?: string | null;
  school_name?: string;
  municipality?: string;
  state?: string;
  institution?: string;
  created_at: string;
  created_by?: string;
  creator_name?: string;
  // Novos campos para batch
  is_batch?: boolean;
  batch_id?: string | null;
  // Formato lista (GET /gabaritos): escopo escola/série/city
  scope_type?: 'class' | 'grade' | 'school' | 'city';
  classes_count?: number;
  students_count?: number;
  generation_status?: string;
  can_download?: boolean;
  minio_url?: string;
  /** Caminho/URL da API para GET binário autenticado (cartões ZIP); não usar minio_url no navegador. */
  download_url?: string;
  /** Apenas quando scope_type === 'city' */
  schools_summary?: GabaritoSchoolSummary[];
  /** Histórico de gerações (escopos diferentes do mesmo cartão) */
  generations?: GabaritoGeneration[];
  generations_count?: number;
  /** Job da geração mais recente (espelha em geral minio_url/download_url do cartão) */
  latest_generation_job_id?: string | null;
}

export interface GabaritosResponse {
  gabaritos: Gabarito[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
  /** Município do contexto (tenant), quando disponível */
  city_id?: string | null;
}

// Novos tipos para batch
export interface BatchClass {
  gabarito_id: string;
  class_id: string;
  class_name: string;
  grade_name: string;
  filename?: string;
  total_students?: number;
  total_pages?: number;
  school_name?: string;
}

export interface GenerateResponseData {
  status: 'processing' | 'completed' | 'failed';
  message: string;
  task_id: string;
  scope: 'class' | 'grade' | 'school';
  scope_name: string;
  batch_id: string | null;
  gabarito_ids: string[];
  classes_count: number;
  classes: BatchClass[];
  num_questions: number;
  polling_url: string;
}

/** Turma pulada na geração (ex.: sem alunos cadastrados) */
export interface SkippedClass {
  class_name: string;
  grade_name: string;
}

export interface TaskStatusResult {
  success: boolean;
  scope: 'class' | 'grade' | 'school';
  batch_id?: string;
  gabarito_ids: string[];
  total_classes: number;
  total_students: number;
  total_pdfs: number;
  minio_url: string;
  download_size_bytes?: number;
  classes: BatchClass[];
  /** Turmas puladas (ex.: sem alunos) — mensagens legíveis em warnings */
  skipped_classes?: SkippedClass[];
  // Campos antigos (quando scope === 'class')
  sheets?: any[];
  generated_sheets?: number;
}

/** Resposta da rota GET /task/<task_id>/status */
export interface TaskStatusResponse {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message?: string;
  task_id: string;
  warnings?: string[];
  result?: TaskStatusResult;
  error?: string;
}

export interface BatchDownloadResponse {
  download_url: string;
  expires_in: string;
  batch_id: string;
  classes_count: number;
  classes: BatchClass[];
  title: string;
  num_questions: number;
  generated_at: string;
  created_at: string;
  minio_url: string;
}

/** P/A na rota de alunos do gabarito: com/sem AnswerSheetResult (não é lista de frequência). */
export type CartaoCorrectionStatus = 'P' | 'A';

export interface GabaritoStudentListItem {
  student_id: string;
  name: string;
  registration?: string | null;
  has_result: boolean;
  correction_status: CartaoCorrectionStatus;
  result_id?: string | null;
  detection_method?: string | null;
  corrected_at?: string | null;
  can_manual_correct: boolean;
  class_id?: string;
  class_name?: string;
  grade_id?: string;
  grade_name?: string;
  school_id?: string;
  school_name?: string;
}

export interface GabaritoStudentsClassGroup {
  class_id: string;
  class_name: string;
  grade_id?: string;
  grade_name?: string;
  school_id?: string;
  school_name?: string;
  students: GabaritoStudentListItem[];
}

export interface GabaritoStudentsScopeSummary {
  scope_type?: string;
  class_count?: number;
  student_count?: number;
}

export interface GabaritoStudentsResponse {
  gabarito_id: string;
  gabarito_title: string;
  test_id: string | null;
  entry_kind: 'cartao_resposta' | 'prova_fisica';
  num_questions?: number;
  scope_summary?: GabaritoStudentsScopeSummary;
  classes?: GabaritoStudentsClassGroup[];
  student_count?: number;
  students?: GabaritoStudentListItem[];
}

export interface GabaritoStudentsQuery {
  class_id?: string;
  grade_id?: string;
  school_id?: string;
  flat?: boolean;
}

export interface ManualEntryQuestion {
  q: number;
  alternatives: string[];
}

export interface ManualEntryBlock {
  block_id: number;
  subject_id?: string;
  subject_name?: string;
  questions: ManualEntryQuestion[];
}

export interface ManualEntryResponse {
  gabarito_id: string;
  test_id: string | null;
  kind: 'cartao_resposta' | 'prova_fisica';
  title: string;
  num_questions: number;
  use_blocks?: boolean;
  blocks: ManualEntryBlock[];
  correct_answers?: Record<string, string | null>;
  student: {
    id: string;
    name: string;
    class_id?: string;
  };
  saved_answers?: Record<string, string | null>;
  existing_result_id?: string | null;
  detection_method?: string | null;
}

export type ManualAnswerValue = string | null;

export interface ManualCorrectionDetailedAnswer {
  question: number;
  marked: string | null;
  correct: string | null;
  is_correct: boolean;
}

export interface ManualCorrectionResponse {
  message: string;
  system?: string;
  detection_method?: string;
  kind?: string;
  student_id: string;
  student_name: string;
  gabarito_id: string;
  test_id?: string | null;
  correct: number;
  wrong: number;
  blank: number;
  invalid: number;
  total: number;
  score: number;
  percentage: number;
  detailed_answers?: ManualCorrectionDetailedAnswer[];
  student_answers?: Record<string, ManualAnswerValue>;
  answer_key?: Record<string, string | null>;
  answer_sheet_result_id?: string;
}


