/**
 * Alinhado a FormService no backend (socioeconomic_forms):
 * Educação Especial (ADAP) é compatível com aluno-jovem e aluno-velho.
 */

export const ADAP_EDUCATION_STAGE_ID = '247c4af5-2688-41b0-95fa-443f503a9d87';
export const EJA_EDUCATION_STAGE_ID = '63cb6876-3221-4fa2-89e8-a82ad1733032';

/** Stages por formType — inclui ADAP nos dois (wildcard). */
export const EDUCATION_STAGE_IDS_BY_FORM_TYPE: Record<string, string[]> = {
  'aluno-jovem': [
    'd1142d12-ed98-46f4-ae78-62c963371464', // Educação Infantil
    '614b7d10-b758-42ec-a04e-86f78dc7740a', // Anos Iniciais
    EJA_EDUCATION_STAGE_ID, // EJA (filtrar períodos 1-5)
    ADAP_EDUCATION_STAGE_ID, // Educação Especial (ADAP)
  ],
  'aluno-velho': [
    'c78fcd8e-00a1-485d-8c03-70bcf59e3025', // Anos Finais
    EJA_EDUCATION_STAGE_ID, // EJA (filtrar períodos 6-9)
    ADAP_EDUCATION_STAGE_ID, // Educação Especial (ADAP)
  ],
};

/** Stages rígidos 1:1 (ADAP não entra — é wildcard). */
export const RIGID_EDUCATION_STAGE_TO_FORM_TYPE: Record<string, 'aluno-jovem' | 'aluno-velho'> = {
  'd1142d12-ed98-46f4-ae78-62c963371464': 'aluno-jovem', // Educação Infantil
  '614b7d10-b758-42ec-a04e-86f78dc7740a': 'aluno-jovem', // Anos Iniciais
  'c78fcd8e-00a1-485d-8c03-70bcf59e3025': 'aluno-velho', // Anos Finais
};

export type DetectedStudentFormType = 'aluno-jovem' | 'aluno-velho' | 'adap';

export function isAdapEducationStage(educationStageId?: string | null): boolean {
  return Boolean(educationStageId && educationStageId === ADAP_EDUCATION_STAGE_ID);
}

/** Fallback por nome quando o stage ID não veio na resposta. */
export function looksLikeAdapGradeName(gradeName: string): boolean {
  const name = gradeName.toLowerCase();
  return (
    name.includes('adap') ||
    name.includes('educação especial') ||
    name.includes('educacao especial') ||
    name.includes('ed. especial') ||
    name.includes('ed especial') ||
    (name.includes('especial') && (name.includes('suporte') || name.includes('aee')))
  );
}

/**
 * Série detectada é compatível com o formType do request.
 * ADAP cola no formType escolhido (não trava num tipo).
 */
export function isDetectedTypeCompatibleWithFormType(
  detectedType: DetectedStudentFormType | null,
  formType: string,
): boolean {
  if (!detectedType || (formType !== 'aluno-jovem' && formType !== 'aluno-velho')) {
    return false;
  }
  if (detectedType === 'adap') {
    return true;
  }
  return detectedType === formType;
}
