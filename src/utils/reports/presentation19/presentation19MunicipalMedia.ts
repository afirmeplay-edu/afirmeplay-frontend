/** Leitura de `media_municipal_por_disciplina` do RelatorioCompleto (mesma fonte que Análise de Avaliações). */

function normDiscKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Chave `GERAL` — média municipal consolidada. */
export function mediaMunicipalRelatorioGeral(mm: Record<string, number> | null | undefined): number | null {
  if (!mm) return null;
  if (mm.GERAL != null && Number.isFinite(Number(mm.GERAL))) return Number(mm.GERAL);
  const e = Object.entries(mm).find(([k]) => k.trim().toUpperCase() === "GERAL");
  return e != null && Number.isFinite(Number(e[1])) ? Number(e[1]) : null;
}

export function mediaMunicipalRelatorioPorDisciplina(
  mm: Record<string, number> | null | undefined,
  disciplina: string
): number | null {
  if (!mm || !String(disciplina ?? "").trim()) return null;
  const d = String(disciplina).trim();
  if (mm[d] != null && Number.isFinite(Number(mm[d]))) return Number(mm[d]);
  const nk = normDiscKey(d);
  const found = Object.entries(mm).find(([k]) => normDiscKey(k) === nk);
  return found != null && Number.isFinite(Number(found[1])) ? Number(found[1]) : null;
}
