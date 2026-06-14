/** Rótulo padrão da média municipal em gráficos da Apresentação 19. */
export const PRESENTATION19_MUNICIPAL_AVG_LABEL = "Municipal";

export function isPresentation19MunicipalAvgLabel(label: string): boolean {
  const n = String(label ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  return n === "MUNICIPAL" || n === "MEDIA MUNICIPAL" || n === "MÉDIA MUNICIPAL";
}

/** Cor da célula de presença média na tabela (≥ 80% verde; &lt; 80% amarelo). */
export function presenceTablePctCellColors(pct: number): { background: string; color: string } {
  if (!Number.isFinite(pct) || pct >= 80) {
    return { background: "#DCFCE7", color: "#166534" };
  }
  return { background: "#FEF9C3", color: "#854D0E" };
}

/** Fonte da lista de escolas na capa (sem scroll). */
export function presentation19CoverSchoolListFontPx(count: number): number {
  if (count <= 4) return 30;
  if (count <= 8) return 26;
  if (count <= 12) return 22;
  if (count <= 18) return 18;
  if (count <= 24) return 15;
  return 12;
}

export function presentation19CoverSchoolColumnCount(count: number): number {
  if (count <= 8) return 1;
  if (count <= 18) return 2;
  return 3;
}

/** Rótulo acima da barra: usa `barTopLabel` da série quando definido (ex.: presença). */
export function resolvePresentation19BarTopLabel(
  row: Record<string, string | number>,
  value: number,
  serieLabel?: string
): string {
  const custom = row.barTopLabel;
  if (typeof custom === "string" && custom.trim()) return custom.trim();
  if (!Number.isFinite(value)) return "0,0";
  const wantsPct = String(serieLabel ?? "").includes("%");
  const isInt = Math.abs(value - Math.round(value)) < 1e-9;
  if (!wantsPct && isInt) return String(Math.round(value));
  const base = Number(value).toFixed(1).replace(".", ",");
  return wantsPct ? `${base}%` : base;
}

export const PRESENTATION19_GRADES_NO_TURMA_NOTICE =
  "A escola selecionada não possui turma cadastrada. Os gráficos por disciplina não estão disponíveis neste recorte.";

function normDisciplineKey(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Disciplina agregada (geral) — não deve gerar slide “por disciplina”. */
export function isPresentation19AggregateDiscipline(disciplina: string): boolean {
  const n = normDisciplineKey(disciplina);
  return n === "geral" || n === "geral da serie" || n === "geral da série" || n.startsWith("proficiencia geral");
}

export function hasPresentation19RealDisciplineBreakdown<T extends { disciplina: string }>(rows: T[]): boolean {
  return rows.some((r) => !isPresentation19AggregateDiscipline(r.disciplina));
}

export function filterPresentation19RealDisciplineRows<T extends { disciplina: string }>(rows: T[]): T[] {
  return rows.filter((r) => !isPresentation19AggregateDiscipline(r.disciplina));
}

export function presentation19ProficiencyDisciplineChartTitle(disciplina: string): string {
  const d = String(disciplina ?? "").trim() || "—";
  return `PROFICIÊNCIA — ${d.toUpperCase()}`;
}

export function presentation19GradesDisciplineChartTitle(disciplina: string): string {
  const d = String(disciplina ?? "").trim() || "—";
  return `NOTA — ${d.toUpperCase()}`;
}
