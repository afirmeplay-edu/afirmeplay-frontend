/** Imagem de alternativa conforme contrato da API (GET) */
export interface QuestionOptionImageApi {
  id?: string;
  type?: string;
  width?: number;
  height?: number;
  minio_bucket?: string;
  minio_object_name?: string;
  imageUrl?: string;
  /** Atalho na criação/edição */
  data?: string;
}

export interface QuestionOptionApi {
  id?: string;
  text: string;
  isCorrect: boolean;
  image?: QuestionOptionImageApi | string;
}

/** Estado da imagem no formulário */
export type QuestionOptionImageForm =
  | {
      kind: 'new';
      dataUrl: string;
      width?: number;
      height?: number;
    }
  | {
      kind: 'existing';
      id: string;
      imageUrl: string;
      width?: number;
      height?: number;
    };

export interface QuestionOptionFormValue {
  id?: string;
  text: string;
  isCorrect: boolean;
  image?: QuestionOptionImageForm | null;
}

/** Imagem para exibição (API ou preview no formulário) */
export type QuestionOptionImageDisplay =
  | QuestionOptionImageApi
  | QuestionOptionImageForm
  | null
  | undefined;
