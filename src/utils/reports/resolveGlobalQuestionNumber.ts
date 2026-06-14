/**
 * Converte o número de uma questão (resposta ou metadado) para o índice global
 * usado no PDF consolidado (q1…qN).
 *
 * A API pode enviar numeração local por disciplina (1…20 em cada) ou global
 * (ex.: Matemática 1–20, Português 21–40).
 */
function disciplineUsesGlobalQuestionNumbers(
  questionOffset: number,
  numQuestoesDisc: number,
  questoesNumeros: number[]
): boolean {
  if (questoesNumeros.length === 0) return false;
  const min = Math.min(...questoesNumeros);
  const max = Math.max(...questoesNumeros);
  return min > questionOffset + 1 || max > numQuestoesDisc;
}

export function resolveGlobalQuestionNumber(
  respQuestao: number,
  questionOffset: number,
  numQuestoesDisc: number,
  questoesNumeros: number[] = []
): number {
  if (numQuestoesDisc > 0 && respQuestao > numQuestoesDisc) {
    return respQuestao;
  }

  const metaGlobal = disciplineUsesGlobalQuestionNumbers(
    questionOffset,
    numQuestoesDisc,
    questoesNumeros
  );

  if (metaGlobal && respQuestao <= numQuestoesDisc) {
    return questionOffset + respQuestao;
  }

  if (metaGlobal) {
    return respQuestao;
  }

  return questionOffset + respQuestao;
}

export function extractQuestoesNumeros(
  questoes: Array<{ numero?: number }> | undefined
): number[] {
  return (questoes ?? [])
    .map((q) => q.numero)
    .filter((n): n is number => typeof n === "number" && !Number.isNaN(n) && n > 0);
}
