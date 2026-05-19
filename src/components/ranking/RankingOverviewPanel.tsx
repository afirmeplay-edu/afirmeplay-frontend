import { AlertCircle, Trophy } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankingResponse } from "@/services/reports/rankingApi";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LevelTag, PosBadge, SummaryCard, formatPt } from "@/components/ranking/RankingVisualPrimitives";
import { RankingContentShell, RankingLoadingState } from "@/components/ranking/RankingLoadingState";

type Props = {
  data?: RankingResponse;
  isLoading: boolean;
  isRefreshing?: boolean;
  errorMessage?: string;
};

type ChartRow = {
  school_name?: string;
  average_score?: number;
  average_proficiency?: number;
};

type ChartTooltipEntry = {
  value?: number;
  payload?: ChartRow;
};

function truncateLabel(value: unknown, max = 42): string {
  const text = String(value || "—").trim();
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function chartAxisLabel(value: unknown): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "—";
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ChartTooltipEntry[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const value = Number(payload[0]?.value || point?.average_score || 0);
  const school = truncateLabel(point?.school_name, 56);
  const prof = Number(point?.average_proficiency || 0);

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-foreground">{school}</p>
      <p className="mt-1 text-muted-foreground">
        Nota média: <span className="font-bold text-primary">{formatPt(value, 1)}</span>
      </p>
      <p className="mt-1 text-muted-foreground">
        Proficiência: <span className="font-bold text-foreground">{formatPt(prof, 1)}</span>
      </p>
    </div>
  );
}

export default function RankingOverviewPanel({ data, isLoading, isRefreshing, errorMessage }: Props) {
  if (isLoading) {
    return <RankingLoadingState message="Carregando visão geral..." variant="overview" />;
  }

  if (errorMessage) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    );
  }

  const overview = data?.overview;
  const summary = overview?.summary;
  const byCourse = overview?.by_course || {};
  const courseEntries = Object.entries(byCourse);

  if (!summary && courseEntries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Nenhum dado de visão geral disponível para os filtros selecionados.
        </CardContent>
      </Card>
    );
  }

  return (
    <RankingContentShell isRefreshing={isRefreshing} refreshingMessage="Atualizando visão geral...">
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard label="Escolas avaliadas" value={String(Number(summary?.total_schools || 0))} />
        <SummaryCard
          label="Participação geral"
          value={`${formatPt(Number(summary?.participation_rate || 0))}%`}
          hint={`${Number(summary?.participating_students || 0)}/${Number(summary?.total_students || 0)} alunos`}
        />
        <SummaryCard
          label="Destaque do recorte"
          value={String(summary?.top_school?.school_name || "—")}
          valueClassName="text-base font-semibold leading-tight whitespace-normal break-words"
          hint={`Nota ${formatPt(Number(summary?.top_school?.average_score || 0))}`}
        />
      </div>

      {courseEntries.map(([courseLabel, courseData]) => {
        const typedCourseData = courseData as {
          table_rows?: Array<Record<string, unknown>>;
          chart_rows?: Array<Record<string, unknown>>;
          target_score?: number;
          counts_by_status?: Record<string, number>;
        };
        const rows = (typedCourseData.table_rows || []).map((row) => ({
          ...row,
          level_tag: String(row.level_tag || "N/A"),
          is_critical: Boolean(row.is_critical),
        }));
        const chartRows = typedCourseData.chart_rows || [];
        const chartGradientId = `ranking-bar-${String(courseLabel).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        return (
          <Card key={courseLabel} className="overflow-hidden border border-border/70">
            <CardHeader className="border-b border-border/60 bg-muted/30 pb-3">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" />
                  Ranking {courseLabel}
                </span>
                <Badge variant="outline">Meta {formatPt(Number(typedCourseData.target_score || 0))}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <SummaryCard
                  label="Destaque"
                  value={String(Number(typedCourseData.counts_by_status?.destaque || 0))}
                  hint="Escolas acima da meta"
                />
                <SummaryCard
                  label="Em desenvolvimento"
                  value={String(Number(typedCourseData.counts_by_status?.desenvolvimento || 0))}
                  hint="Faixa intermediária"
                />
                <SummaryCard
                  label="Atenção"
                  value={String(Number(typedCourseData.counts_by_status?.atencao || 0))}
                  hint="Abaixo da faixa de meta"
                />
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-4">
                <p className="mb-3 text-sm font-semibold text-foreground">Desempenho por escola</p>
                <div className="h-[380px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={chartRows} margin={{ top: 8, right: 24, left: 12, bottom: 8 }}>
                      <defs>
                        <linearGradient id={chartGradientId} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="hsl(var(--primary) / 0.75)" />
                          <stop offset="100%" stopColor="hsl(var(--primary))" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 4" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis
                        dataKey="school_name"
                        type="category"
                        width={190}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={chartAxisLabel}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.35)" }} />
                      <ReferenceLine
                        x={Number(typedCourseData.target_score || 0)}
                        stroke="hsl(var(--primary))"
                        strokeDasharray="4 4"
                        strokeOpacity={0.7}
                      />
                      <Bar
                        dataKey="average_score"
                        radius={[0, 6, 6, 0]}
                        barSize={18}
                        fill={`url(#${chartGradientId})`}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/70">
                <table className="w-full min-w-[760px] text-sm border-collapse">
                  <thead>
                    <tr className="bg-primary text-primary-foreground">
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase">Pos.</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase">Escola</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold uppercase">Proficiência</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold uppercase">Nota média</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase">Nível</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={`${courseLabel}-${String(row.school_id || row.position)}`}
                        className={`border-t border-border/60 odd:bg-muted/20 ${row.is_critical ? "bg-rose-50/90 dark:bg-rose-950/20" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <PosBadge position={Number(row.position || 0)} />
                        </td>
                        <td className="px-3 py-2 font-semibold">{String(row.school_name || "Escola")}</td>
                        <td className="px-3 py-2 text-right font-semibold text-foreground">
                          {formatPt(Number(row.average_proficiency || 0), 1)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-primary">
                          {formatPt(Number(row.average_score || 0), 1)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <LevelTag value={row.level_tag} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
    </RankingContentShell>
  );
}
