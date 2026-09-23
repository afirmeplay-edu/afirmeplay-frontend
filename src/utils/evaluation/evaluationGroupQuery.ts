/** Seleção de avaliação(ões) no filtro de Resultados: um ID, CSV, ou `"all"`. */

export function parseEvaluationSelection(value: string | undefined | null): string[] {
  if (!value || value === "all") return [];
  return [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))];
}

export function serializeEvaluationSelection(ids: string[]): string {
  const unique = parseEvaluationSelection(ids.join(","));
  return unique.length === 0 ? "all" : unique.join(",");
}

export function hasEvaluationSelection(value: string | undefined | null): boolean {
  return parseEvaluationSelection(value).length > 0;
}

export function isEvaluationGroup(value: string | undefined | null): boolean {
  return parseEvaluationSelection(value).length >= 2;
}

/** `avaliacao=id` ou `avaliacao=id1,id2&group_id=1`. Sem IDs, não manda nada. */
export function appendAvaliacaoQuery(
  params: URLSearchParams,
  avaliacao: string | undefined | null
): void {
  const ids = parseEvaluationSelection(avaliacao);
  if (ids.length === 0) return;
  params.append("avaliacao", ids.join(","));
  if (ids.length >= 2) params.append("group_id", "1");
}
