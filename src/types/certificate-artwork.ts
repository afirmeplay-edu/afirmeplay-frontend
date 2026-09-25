export interface CertificateArtwork {
  id: string;
  evaluation_id: string;
  name: string;
  status: 'draft' | 'active' | 'inactive';
  original_filename: string;
  mime_type: string;
  source_kind: 'pdf' | 'jpeg' | 'png';
  page_count: number;
  page_width_pt: number;
  page_height_pt: number;
  rotation: number;
  fields: { fields: unknown[] };
  version: number;
  created_at?: string;
  updated_at?: string;
}
