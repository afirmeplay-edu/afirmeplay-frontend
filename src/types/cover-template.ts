export type CoverTemplateStatus = "draft" | "active" | "inactive";
export type CoverSourceKind = "pdf" | "jpeg" | "png";
export type CoverFieldAlign = "left" | "center" | "right";
export type CoverFieldValign = "top" | "middle" | "bottom";
export type CoverFieldOverflow = "ellipsis" | "wrap" | "clip";

export const COVER_ALLOWED_FONTS = [
  "Helvetica",
  "Helvetica-Bold",
  "Helvetica-Oblique",
  "Helvetica-BoldOblique",
  "Times-Roman",
  "Times-Bold",
  "Times-Italic",
  "Times-BoldItalic",
  "Courier",
  "Courier-Bold",
  "Courier-Oblique",
  "Courier-BoldOblique",
] as const;

export type CoverAllowedFont = (typeof COVER_ALLOWED_FONTS)[number];

export const COVER_MIN_FONT_SIZE_PT = 6;
export const COVER_MAX_FONT_SIZE_PT = 72;

export interface CoverField {
  id: string;
  key: string;
  page?: number;
  x_norm: number;
  y_norm_from_top: number;
  w_norm: number;
  h_norm: number;
  x_pt?: number;
  y_pt?: number;
  width_pt?: number;
  height_pt?: number;
  font_name: CoverAllowedFont | string;
  font_size_pt: number;
  align: CoverFieldAlign;
  valign: CoverFieldValign;
  color: string;
  uppercase: boolean;
  max_chars?: number | null;
  overflow: CoverFieldOverflow;
}

export interface CoverTemplateFields {
  fields: CoverField[];
}

export interface CoverTemplate {
  id: string;
  test_id: string;
  evaluation_id: string;
  name: string;
  status: CoverTemplateStatus;
  original_filename: string | null;
  mime_type: string;
  source_kind: CoverSourceKind;
  minio_bucket: string;
  minio_object_name: string;
  normalized_object_name: string | null;
  page_count: number;
  page_width_pt: number;
  page_height_pt: number;
  page_width_mm: number | null;
  page_height_mm: number | null;
  rotation: number;
  fields: CoverTemplateFields;
  version: number;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CoverCatalogField {
  key: string;
  label: string;
  group: string;
}

export interface CoverFieldCatalog {
  fields: CoverCatalogField[];
  sample_values: Record<string, string>;
}

export interface CoverTemplatePatchPayload {
  name?: string;
  fields?: CoverTemplateFields;
  status?: CoverTemplateStatus;
}

export interface CoverPreviewPayload {
  sample?: boolean;
  format?: "pdf" | "png";
  fields?: CoverTemplateFields;
  test_data?: Record<string, unknown>;
}

/** Campos preenchidos no PDF genérico da ficha (sem aluno / sem cartão-resposta). */
export const GENERIC_EXAM_COVER_FIELD_KEYS = [
  "avaliacao.titulo",
  "disciplinas.nomes",
  "serie.nome",
] as const;

export const COVER_GROUP_LABELS: Record<string, string> = {
  aluno: "Aluno",
  avaliacao: "Avaliação",
  turma: "Turma",
  serie: "Série",
  escola: "Escola",
  municipio: "Município",
  disciplinas: "Disciplinas",
};
