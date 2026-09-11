export type QuestionImportFormContext = {
  subjectId: string;
  subjectName: string;
  gradeId: string;
  gradeName: string;
};

export type QuestionImportSummary = {
  total: number;
  valid: number;
  invalid: number;
  created: number;
  failed: number;
  skipped?: number;
  selectedIndexes?: number[];
};

export type QuestionImportResolved = {
  subjectId: string | null;
  subjectName: string | null;
  gradeId: string | null;
  gradeName: string | null;
  educationStageId?: string | null;
  skillId?: string | null;
  type?: string | null;
  imagesInEnunciado?: number;
  alternativesCount?: number;
};

export type QuestionImportOption = {
  id?: string;
  text: string;
  isCorrect: boolean;
  image?: string;
};

export type QuestionImportPayload = {
  text?: string;
  title?: string;
  type?: string;
  subjectId?: string | null;
  grade?: string | null;
  createdBy?: string;
  formattedText?: string;
  /** Dificuldade por questão (DOCX). Labels canônicos do QuestionForm. */
  difficulty?: string;
  skills?: string[];
  educationStageId?: string | null;
  options?: QuestionImportOption[];
  solution?: string;
  formattedSolution?: string;
  version?: number;
  secondStatement?: string;
  interactionConfig?: unknown;
};

export type QuestionImportItem = {
  index: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  resolved: QuestionImportResolved;
  payload: QuestionImportPayload;
};

export type QuestionImportCreatedItem = {
  index: number;
  id: string;
  type?: string;
  warnings?: string[];
};

export type QuestionImportFailedItem = {
  index: number;
  errors: string[];
  warnings?: string[];
};

export type QuestionImportSkippedItem = {
  index: number;
  reason: string;
  valid?: boolean;
};

export type QuestionImportResponse = {
  mode: "preview" | "commit";
  form: QuestionImportFormContext;
  summary: QuestionImportSummary;
  questions: QuestionImportItem[];
  created: QuestionImportCreatedItem[];
  failed: QuestionImportFailedItem[];
  skipped?: QuestionImportSkippedItem[];
};

export type QuestionImportParams = {
  subjectId: string;
  grade: string;
};
