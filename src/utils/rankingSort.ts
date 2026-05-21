export type RankingSortKey = "participacao" | "media" | "proficiencia" | "adequado_avancado";
export type RankingSortDir = "asc" | "desc";

export const RANKING_SORT_FIELDS: { value: RankingSortKey; label: string }[] = [
  { value: "participacao", label: "Participação" },
  { value: "media", label: "Nota média" },
  { value: "proficiencia", label: "Proficiência" },
  { value: "adequado_avancado", label: "% Adequado + Avançado" },
];

export const DEFAULT_RANKING_SORT: RankingSortKey = "proficiencia";
export const DEFAULT_RANKING_SORT_DIR: RankingSortDir = "desc";

export function isRankingSortKey(value: string | null): value is RankingSortKey {
  return RANKING_SORT_FIELDS.some((field) => field.value === value);
}

export function isRankingSortDir(value: string | null): value is RankingSortDir {
  return value === "asc" || value === "desc";
}

export function getRankingSortValue(row: Record<string, unknown>, key: RankingSortKey): number {
  switch (key) {
    case "participacao":
      return Number(row.participation_rate ?? 0);
    case "media":
      return Number(row.average_score ?? 0);
    case "proficiencia":
      return Number(row.average_proficiency ?? 0);
    case "adequado_avancado": {
      const pct = row.adequado_avancado_pct;
      if (pct != null && pct !== "") return Number(pct);
      const count = Number(row.adequado_avancado_count || 0);
      const participating = Number(row.participating_students || 0);
      if (participating > 0) return (count / participating) * 100;
      const total = Number(row.total_students || 0);
      if (total > 0 && count) return (count / total) * 100;
      return 0;
    }
  }
}

function rowSortLabel(row: Record<string, unknown>): string {
  return String(
    row.school_name || row.class_name || row.teacher_name || row.series_class_name || row.student_name || ""
  );
}

export function sortRankingRows<T extends Record<string, unknown>>(
  rows: T[],
  sortBy: RankingSortKey,
  sortDir: RankingSortDir
): Array<T & { position: number }> {
  const sorted = [...rows].sort((a, b) => {
    const diff = getRankingSortValue(b, sortBy) - getRankingSortValue(a, sortBy);
    if (diff !== 0) return sortDir === "desc" ? diff : -diff;
    return rowSortLabel(a).localeCompare(rowSortLabel(b), "pt-BR");
  });
  return sorted.map((row, index) => ({ ...row, position: index + 1 }));
}
