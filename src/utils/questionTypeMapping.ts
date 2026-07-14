import {
  SUBJECTIVE_INTERACTION_TYPES,
  SUBJECTIVE_QUESTION_TYPES,
  isSubjectiveInteractionType,
  type InteractionType,
} from "@/lib/question-interactions";

/** Tipo de questão usado nos formulários (banco de questões / avaliação). */
export type FormQuestionType = "multipleChoice" | InteractionType;

/**
 * Normaliza o `type` retornado pela API (legado ou novo) para o valor usado nos formulários.
 *
 * - `multiple_choice` / `multipleChoice` → `multipleChoice`
 * - Qualquer um dos 9 tipos subjetivos (`dissertativa`, `arrastar_soltar`, ...) → preservado como está
 * - Tipos legados de questão aberta (`open`, `essay`, `discursive`) → `dissertativa` (retrocompatibilidade)
 * - Qualquer outro valor desconhecido → `multipleChoice` (comportamento anterior)
 */
export function mapApiQuestionTypeToForm(apiType: string | null | undefined): FormQuestionType {
  const raw = (apiType || "").toString().trim();

  if (isSubjectiveInteractionType(raw)) {
    return raw as InteractionType;
  }

  if (raw === "multiple_choice" || raw === "multipleChoice") {
    return "multipleChoice";
  }

  if (raw === "open" || raw === "essay" || raw === "discursive") {
    return "dissertativa";
  }

  return "multipleChoice";
}

/** Valor de `type` a ser enviado para a API a partir do tipo do formulário. */
export function mapFormQuestionTypeToApi(formType: FormQuestionType): string {
  return formType;
}

export function isSubjectiveFormType(formType: string | null | undefined): formType is InteractionType {
  return isSubjectiveInteractionType(formType);
}

/** Rótulo amigável (pt-BR) para exibição em badges/listas, a partir do `type` bruto da API ou do formulário. */
export function getQuestionTypeLabel(type: string | null | undefined): string {
  const raw = (type || "").toString().toLowerCase();

  if (raw.includes("multiple")) return "Múltipla Escolha";
  if (raw.includes("true")) return "Verdadeiro/Falso";

  const subjectiveMeta = SUBJECTIVE_QUESTION_TYPES.find((meta) => meta.value === raw);
  if (subjectiveMeta) return subjectiveMeta.label;

  if (raw.includes("dissert") || raw.includes("essay") || raw.includes("open") || raw.includes("discursive")) {
    return "Subjetiva (Dissertativa)";
  }

  return type || "Questão";
}

export { SUBJECTIVE_INTERACTION_TYPES };
