export type LogisticsScheduleStatus = 'rascunho' | 'publicado' | 'cancelado';

export type LogisticsEvaluationMode = 'virtual' | 'physical' | 'subjective' | string;

export interface LogisticsFilterEntity {
  id: string;
  nome: string;
}

export interface LogisticsFilterAvaliacao {
  id: string;
  titulo: string;
  evaluation_mode: LogisticsEvaluationMode;
}

export interface LogisticsFilterTurma {
  id: string;
  name: string;
  shift: string;
  school_id: string;
  school_name: string;
  grade_id: string | null;
  grade_name: string | null;
}

export interface LogisticsOpcoesFiltros {
  etapas: LogisticsFilterEntity[];
  avaliacoes: LogisticsFilterAvaliacao[];
  escolas?: LogisticsFilterEntity[];
  series?: LogisticsFilterEntity[];
  turmas?: LogisticsFilterTurma[];
}

export interface LogisticsFilterParams {
  etapa?: string;
  avaliacao?: string;
  escolas?: string[];
  series?: string[];
  turmas?: string[];
}

export interface LogisticsPreviewItem {
  class_id: string;
  class_name: string;
  shift: string;
  school_id: string;
  school_name: string;
  grade_id: string | null;
  grade_name: string | null;
  students_count: number;
  suggested_tablets_qty: number;
  suggested_booklets_qty: number;
  suggested_date: string | null;
}

export interface LogisticsPreview {
  test: { id: string; title: string; evaluation_mode: LogisticsEvaluationMode };
  items: LogisticsPreviewItem[];
  totals: { classes: number; schools: number; students: number };
}

export interface LogisticsScheduleItem {
  id: string;
  school_id: string;
  school_name: string | null;
  grade_id: string | null;
  grade_name: string | null;
  class_id: string;
  class_name: string | null;
  shift: string;
  scheduled_date: string | null;
  students_count: number;
  tablets_qty: number;
  booklets_qty: number;
  notes: string | null;
  applicator_user_id?: string | null;
  applicator_name?: string | null;
  origem?: 'manual' | 'auto' | string;
  editado_manualmente?: boolean;
}

export interface LogisticsScheduleTotals {
  items: number;
  schools: number;
  students: number;
  tablets: number;
  booklets: number;
}

export interface LogisticsDateChange extends Partial<LogisticsScheduleItem> {
  item_id: string;
  class_id: string;
  school_id: string;
  old_date: string | null;
  new_date: string | null;
}

export interface LogisticsSchedule {
  id: string;
  test_id: string;
  test_title: string | null;
  evaluation_mode: LogisticsEvaluationMode;
  education_stage_id: string | null;
  title: string;
  status: LogisticsScheduleStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  published_at: string | null;
  cancelled_at: string | null;
  can_manage: boolean;
  totals: LogisticsScheduleTotals;
  dates: string[];
  items?: LogisticsScheduleItem[];
  date_changes?: LogisticsDateChange[];
  added_items?: LogisticsScheduleItem[];
  removed_items?: LogisticsScheduleItem[];
}

export interface LogisticsScheduleList {
  schedules: LogisticsSchedule[];
  can_manage: boolean;
}

export interface LogisticsItemPayload {
  id?: string;
  class_id: string;
  scheduled_date: string | null;
  tablets_qty: number;
  booklets_qty: number;
  notes?: string | null;
  applicator_user_id?: string | null;
}

export interface LogisticsSchedulePayload {
  test_id?: string;
  education_stage_id?: string | null;
  title?: string;
  notes?: string | null;
  items?: LogisticsItemPayload[];
}

export interface LogisticsGradeCards {
  total_agendamentos: number;
  total_alunos_previstos: number;
  escolas_atendidas: number;
  turmas_agendadas: number;
}

export interface LogisticsGradeItem {
  id: string;
  schedule_id: string;
  status: LogisticsScheduleStatus;
  test_id: string;
  test_title: string | null;
  evaluation_mode: LogisticsEvaluationMode;
  scheduled_date: string | null;
  school_id: string | null;
  school_name: string | null;
  grade_id: string | null;
  grade_name: string | null;
  class_id: string | null;
  class_name: string | null;
  turno: string | null;
  students_count: number;
  tablets_qty: number;
  booklets_qty: number;
  applicator_user_id: string | null;
  applicator_name: string | null;
  origem: 'manual' | 'auto' | string;
  editado_manualmente: boolean;
}

export interface LogisticsGradePage {
  items: LogisticsGradeItem[];
  total: number;
  page: number;
  per_page: number;
  cards: LogisticsGradeCards;
  can_manage: boolean;
}

export interface LogisticsGradeAvaliacao extends LogisticsFilterAvaliacao {
  etapa_ids: string[];
}

export interface LogisticsGradeSerie extends LogisticsFilterEntity {
  etapa_id: string | null;
  escola_ids: string[];
}

export interface LogisticsGradeOptions {
  anos: number[];
  etapas: LogisticsFilterEntity[];
  avaliacoes: LogisticsGradeAvaliacao[];
  escolas: LogisticsFilterEntity[];
  series: LogisticsGradeSerie[];
  turnos: string[];
  formatos: string[];
  aplicadores: LogisticsFilterEntity[];
  status: LogisticsScheduleStatus[];
  can_manage: boolean;
}

export interface LogisticsApplicatorOption {
  id: string;
  nome: string;
  perfil: string;
}

export interface LogisticsGradeQuery {
  ano?: number;
  etapa?: string;
  avaliacao?: string;
  escola?: string;
  serie?: string;
  turno?: string;
  formato?: string;
  data_inicio?: string;
  data_fim?: string;
  status?: LogisticsScheduleStatus;
  aplicador?: string;
  q?: string;
  page?: number;
  per_page?: number;
}
