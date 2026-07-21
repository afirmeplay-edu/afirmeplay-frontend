import { DEFAULT_RUBRIC_CRITERIA } from "@/lib/question-types";
import {
  defaultInteraction,
  emptyResponse,
  gradeInteraction,
  proficiencyLevel,
  type Interaction,
  type Response,
} from "@/lib/question-interactions";

export type DemoQuestion = {
  id: string;
  author_id?: string;
  title: string;
  statement: string;
  support_text: string | null;
  statement_image?: string | null;
  statement_images?: string[];
  question_type: Interaction["type"];
  knowledge_area: string | null;
  school_year: string | null;
  bncc_code: string | null;
  saeb_descriptor: string | null;
  ability: string | null;
  competency: string | null;
  theme: string | null;
  difficulty: string;
  expected_time_min: number;
  weight: number;
  value: number;
  rubric: typeof DEFAULT_RUBRIC_CRITERIA;
  interaction: Interaction;
  status: "rascunho" | "revisao" | "aprovada" | "arquivada";
  updated_at: string;
};

export type DemoSubmission = {
  id: string;
  questionId: string;
  studentName: string;
  response: Response;
  score: number;
  maxScore: number;
  level: "Abaixo do básico" | "Básico" | "Adequado" | "Avançado";
  feedback: string;
  correct: number;
  total: number;
  createdAt: string;
};

const QUESTIONS_KEY = "afirmeplay_demo_questions_v2";
const SUBMISSIONS_KEY = "afirmeplay_demo_submissions_v2";

const seedQuestion: DemoQuestion = {
  id: "demo-brincadeiras",
  author_id: "demo-professor",
  title: "Complete as palavras das brincadeiras",
  statement:
    "USE AS LETRAS DO QUADRO PARA COMPLETAR AS PALAVRAS DE ACORDO COM A IMAGEM DE CADA BRINCADEIRA.",
  support_text: "Cards disponíveis: G · F · B · D · C",
  question_type: "arrastar_soltar",
  knowledge_area: "Linguagens",
  school_year: "2º Ano EF",
  bncc_code: "EF02LP01",
  saeb_descriptor: "D1",
  ability: "Reconhecer o valor sonoro de letras iniciais em palavras.",
  competency: "Análise linguística/semiótica",
  theme: "Brincadeiras infantis",
  difficulty: "basico",
  expected_time_min: 3,
  weight: 1,
  value: 1,
  rubric: DEFAULT_RUBRIC_CRITERIA,
  interaction: {
    type: "arrastar_soltar",
    bank: ["G", "F", "B", "D", "C"],
    slots: [
      { label: "___ALANÇO", answer: "B" },
      { label: "___ORDA", answer: "C" },
    ],
  },
  status: "aprovada",
  updated_at: new Date().toISOString(),
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}
function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}
function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getDemoQuestions(): DemoQuestion[] {
  const stored = readJson<DemoQuestion[]>(QUESTIONS_KEY, []);
  if (stored.length > 0) return stored;
  writeJson(QUESTIONS_KEY, [seedQuestion]);
  return [seedQuestion];
}

export function saveDemoQuestion(input: Omit<DemoQuestion, "id" | "updated_at">) {
  const questions = getDemoQuestions();
  const next: DemoQuestion = { ...input, id: createId("questao"), updated_at: new Date().toISOString() };
  writeJson(QUESTIONS_KEY, [next, ...questions]);
  return next;
}

export function getDemoQuestionById(id: string): DemoQuestion | undefined {
  return getDemoQuestions().find((q) => q.id === id);
}

export function updateDemoQuestion(id: string, patch: Omit<DemoQuestion, "id" | "updated_at">) {
  const questions = getDemoQuestions();
  const idx = questions.findIndex((q) => q.id === id);
  if (idx === -1) return saveDemoQuestion(patch);
  const updated: DemoQuestion = { ...patch, id, updated_at: new Date().toISOString() };
  const next = [...questions];
  next[idx] = updated;
  writeJson(QUESTIONS_KEY, next);
  return updated;
}


export function getLatestDemoQuestion() {
  return getDemoQuestions()[0] ?? seedQuestion;
}

export function getDemoSubmissions(): DemoSubmission[] {
  return readJson<DemoSubmission[]>(SUBMISSIONS_KEY, []);
}

export function saveDemoSubmission(input: {
  question: DemoQuestion;
  studentName: string;
  response: Response;
}) {
  const result = gradeInteraction(input.question.interaction, input.response);
  const level = proficiencyLevel(result.score);
  const feedback =
    result.score >= 7
      ? `Resposta demonstra compreensão do procedimento esperado no padrão SAEB. ${result.details}`
      : `Ainda há lacunas. ${result.details}`;
  const submission: DemoSubmission = {
    id: createId("resposta"),
    questionId: input.question.id,
    studentName: input.studentName || "Aluno demonstrativo",
    response: input.response,
    score: result.score,
    maxScore: 10,
    correct: result.correct,
    total: result.total,
    level,
    feedback,
    createdAt: new Date().toISOString(),
  };
  writeJson(SUBMISSIONS_KEY, [submission, ...getDemoSubmissions()]);
  return submission;
}

export { defaultInteraction, emptyResponse };
