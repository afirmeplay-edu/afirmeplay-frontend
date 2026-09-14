export type QuestionImportSubjectRef = {
  id: string;
  name: string;
};

export type QuestionImportFormContext = {
  gradeId: string;
  gradeName: string;
  /** Legado / AVALIACAO 1 disciplina */
  subjectId?: string | null;
  subjectName?: string | null;
  subjects?: QuestionImportSubjectRef[];
  allowedSubjectIds?: string[];
  defaultSubjectId?: string | null;
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
  difficulty?: string | null;
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
  order?: number;
  difficulty?: string;
};

export type QuestionImportFailedItem = {
  index: number;
  errors: string[];
  warnings?: string[];
  valid?: boolean;
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

/** Params de disciplina: 1 → subjectId; N → subjectIds CSV. */
export type QuestionImportSubjectParams =
  | { subjectId: string; subjectIds?: never }
  | { subjectIds: string; subjectId?: never };

export type QuestionImportParams = QuestionImportSubjectParams & {
  grade: string;
};

export type TestImportDocxSummary = {
  totalInFile: number;
  selected: number;
  created: number;
  selectedIndexes: number[];
};

export type TestImportDocxSuccess = {
  message: string;
  id: string;
  evaluation_mode?: string;
  type?: string;
  form?: QuestionImportFormContext;
  summary: TestImportDocxSummary;
  created: QuestionImportCreatedItem[];
  questionsPreview?: QuestionImportItem[];
};

export type TestImportDocxErrorBody = {
  error: string;
  selectedIndexes?: number[];
  failed?: QuestionImportFailedItem[];
};
