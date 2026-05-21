import { formatPt } from "@/components/ranking/RankingVisualPrimitives";

export function getAdequadoAvancadoPct(row: Record<string, unknown>): number {
  const rawPct = row.adequado_avancado_pct;
  if (rawPct != null && rawPct !== "") {
    return Number(rawPct);
  }
  const participating = Number(row.participating_students || 0);
  const count = Number(row.adequado_avancado_count ?? 0);
  if (participating > 0) {
    return (count / participating) * 100;
  }
  return 0;
}

export function getAdequadoAvancadoCount(row: Record<string, unknown>): number {
  return Number(row.adequado_avancado_count ?? 0);
}

export function formatParticipationCell(row: Record<string, unknown>): string {
  const hasParticipationData =
    row.participation_rate != null &&
    row.participation_rate !== "" &&
    (Number(row.participating_students || 0) > 0 || Number(row.total_students || 0) > 0);
  if (!hasParticipationData) {
    return "—";
  }
  return `${formatPt(Number(row.participation_rate || 0))}% (${Number(row.participating_students || 0)}/${Number(row.total_students || 0)})`;
}
