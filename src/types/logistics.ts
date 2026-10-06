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
}

export interface LogisticsSchedulePayload {
  test_id?: string;
  education_stage_id?: string | null;
  title?: string;
  notes?: string | null;
  items?: LogisticsItemPayload[];
}
