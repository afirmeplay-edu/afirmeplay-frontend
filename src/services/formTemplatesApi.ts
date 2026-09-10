import { api } from '@/lib/api';
import { Question } from '@/types/forms';

export type StudentFormType = 'aluno-jovem' | 'aluno-velho';

export function isStudentFormType(formType: string | null | undefined): formType is StudentFormType {
  return formType === 'aluno-jovem' || formType === 'aluno-velho';
}

export interface FormTemplate {
  formType?: string;
  title?: string;
  description?: string;
  questions: Question[];
  questionCount: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizeQuestion(raw: unknown, index: number): Question | null {
  const q = asRecord(raw);
  if (!q) return null;

  const id = String(q.id ?? `q${index + 1}`);
  const text = (q.text ?? q.texto ?? '') as string;
  const type = (q.type ?? q.tipo ?? 'selecao_unica') as Question['type'];
  const options = (q.options ?? q.opcoes) as string[] | undefined;
  const subQuestions = (q.subQuestions ?? q.subPerguntas) as Question['subQuestions'];
  const required =
    q.required !== undefined
      ? Boolean(q.required)
      : q.obrigatoria !== undefined
        ? Boolean(q.obrigatoria)
        : true;

  const normalized: Question = {
    id,
    text,
    texto: text,
    type,
    tipo: type as Question['tipo'],
    required,
    obrigatoria: required,
  };

  if (options) {
    normalized.options = options;
    normalized.opcoes = options;
  }
  if (subQuestions) {
    normalized.subQuestions = subQuestions;
    normalized.subPerguntas = subQuestions;
  }
  if (q.min !== undefined) normalized.min = Number(q.min);
  if (q.max !== undefined) normalized.max = Number(q.max);
  if (q.dependsOn) normalized.dependsOn = q.dependsOn as Question['dependsOn'];

  return normalized;
}

function extractQuestionsPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;

  const root = asRecord(data);
  if (!root) return [];

  if (Array.isArray(root.questions)) return root.questions;

  const nested = asRecord(root.data);
  if (nested) {
    if (Array.isArray(nested.questions)) return nested.questions;
    if (Array.isArray(nested.data)) return nested.data;
  }

  if (Array.isArray(root.data)) return root.data;

  return [];
}

/** Normaliza resposta de GET /forms/templates/:formType (ou /questions). */
export function normalizeFormTemplate(data: unknown, formType?: string): FormTemplate {
  const root = asRecord(data);
  const nested = asRecord(root?.data);
  const questions = extractQuestionsPayload(data)
    .map((item, index) => normalizeQuestion(item, index))
    .filter((q): q is Question => q !== null);

  return {
    formType: String(nested?.formType ?? root?.formType ?? formType ?? ''),
    title: (nested?.title ?? root?.title) as string | undefined,
    description: (nested?.description ?? root?.description) as string | undefined,
    questions,
    questionCount: questions.length,
  };
}

/**
 * Busca o template completo de um tipo de formulário de aluno.
 * Tenta GET /forms/templates/:formType e, se necessário, /questions.
 */
export async function fetchFormTemplate(formType: StudentFormType): Promise<FormTemplate> {
  try {
    const { data } = await api.get(`/forms/templates/${formType}`);
    const template = normalizeFormTemplate(data, formType);
    if (template.questions.length > 0) return template;
  } catch {
    // fallback para /questions abaixo
  }

  const { data } = await api.get(`/forms/templates/${formType}/questions`);
  return normalizeFormTemplate(data, formType);
}

export async function fetchFormTemplateQuestions(formType: StudentFormType): Promise<Question[]> {
  const template = await fetchFormTemplate(formType);
  return template.questions;
}
