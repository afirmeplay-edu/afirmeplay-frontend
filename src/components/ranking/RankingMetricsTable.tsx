import type { ReactNode } from "react";
import { LevelTag, NivelBar, PosBadge, formatPt } from "@/components/ranking/RankingVisualPrimitives";
import {
  formatParticipationCell,
  getAdequadoAvancadoCount,
  getAdequadoAvancadoPct,
} from "@/lib/rankingMetrics";

export const RANKING_METRICS_TABLE_MIN_WIDTH = 1100;

/** Wrapper das tabelas de ranking com scroll horizontal moderno. */
export const RANKING_TABLE_SCROLL_CLASS =
  "overflow-x-auto rounded-xl border border-border/70 ranking-table-scroll";

const thClass = "px-3 py-2 text-xs font-semibold uppercase";

type HeadProps = {
  nameHeader: string;
  leadingHeaders?: ReactNode;
  trailingHeaders?: ReactNode;
  showParticipation?: boolean;
};

export function RankingMetricsTableHead({
  nameHeader,
  leadingHeaders,
  trailingHeaders,
  showParticipation = true,
}: HeadProps) {
  return (
    <tr className="bg-primary text-primary-foreground">
      <th className={`${thClass} text-left`}>Pos.</th>
      <th className={`${thClass} text-left`}>{nameHeader}</th>
      {leadingHeaders}
      {showParticipation ? <th className={`${thClass} text-center`}>Participação</th> : null}
      <th className={`${thClass} text-right`}>Proficiência</th>
      <th className={`${thClass} text-right`}>Nota</th>
      <th className={`${thClass} text-right`}>Adeq.+Avan.</th>
      <th className={`${thClass} text-center`}>Nível</th>
      {trailingHeaders}
    </tr>
  );
}

type RowProps = {
  row: Record<string, unknown>;
  nameCell: ReactNode;
  leadingCells?: ReactNode;
  trailingCells?: ReactNode;
  rowKey: string;
  showParticipation?: boolean;
};

export function RankingMetricsTableRow({
  row,
  nameCell,
  leadingCells,
  trailingCells,
  rowKey,
  showParticipation = true,
}: RowProps) {
  const adequadoPct = getAdequadoAvancadoPct(row);
  const adequadoCount = getAdequadoAvancadoCount(row);
  const isCritical = Boolean(row.is_critical);

  return (
    <tr
      key={rowKey}
      className={`border-t border-border/60 odd:bg-muted/20 ${isCritical ? "bg-rose-50/90 dark:bg-rose-950/20" : ""}`}
    >
      <td className="px-3 py-2">
        <PosBadge position={Number(row.position || 0)} />
      </td>
      <td className="px-3 py-2 font-semibold">{nameCell}</td>
      {leadingCells}
      {showParticipation ? (
        <td className="px-3 py-2 text-center text-sm">{formatParticipationCell(row)}</td>
      ) : null}
      <td className="px-3 py-2 text-right font-semibold">{formatPt(Number(row.average_proficiency || 0))}</td>
      <td className="px-3 py-2 text-right font-semibold text-primary">{formatPt(Number(row.average_score || 0))}</td>
      <td className="px-3 py-2">
        <NivelBar value={adequadoPct} count={adequadoCount} />
      </td>
      <td className="px-3 py-2 text-center">
        <LevelTag value={row.level_tag ?? row.classification} />
      </td>
      {trailingCells}
    </tr>
  );
}
