import { AlertCircle, Trophy } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankingResponse } from "@/services/reports/rankingApi";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { rankingSchoolBarFill } from "@/lib/rankingChartColors";
import {
  RankingMetricsTableHead,
  RankingMetricsTableRow,
  RANKING_TABLE_SCROLL_CLASS,
} from "@/components/ranking/RankingMetricsTable";
import { SummaryCard, formatPt } from "@/components/ranking/RankingVisualPrimitives";
import { RankingContentShell, RankingLoadingState } from "@/components/ranking/RankingLoadingState";
import { RankingSortControls } from "@/components/ranking/RankingSortControls";
import { useRankingSort } from "@/components/ranking/useRankingSort";
import { getRankingSortValue, type RankingSortKey } from "@/utils/rankingSort";

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
  participation_rate?: number;
  adequado_avancado_pct?: number;
  adequado_avancado_count?: number;
  participating_students?: number;
  total_students?: number;
  metric_value?: number;
  barColor?: string;
};

type ChartTooltipEntry = {
  value?: number;
  payload?: ChartRow;
};

type ChartMetricDescriptor = {
  axisLabel: string;
  tooltipLabel: string;
  legend: string;
  isPercentage: boolean;
  decimals: number;
};

const CHART_METRIC_BY_SORT: Record<RankingSortKey, ChartMetricDescriptor> = {
  proficiencia: {
    axisLabel: "Proficiência média",
    tooltipLabel: "Proficiência",
    legend: "Métrica: proficiência média (valores ao lado de cada barra)",
    isPercentage: false,
    decimals: 1,
  },
  media: {
    axisLabel: "Nota média",
    tooltipLabel: "Nota média",
    legend: "Métrica: nota média (0–10) com valores ao lado de cada barra",
    isPercentage: false,
    decimals: 1,
  },
  participacao: {
    axisLabel: "Participação (%)",
    tooltipLabel: "Participação",
    legend: "Métrica: % de participação dos alunos com valores ao lado de cada barra",
    isPercentage: true,
    decimals: 1,
  },
  adequado_avancado: {
    axisLabel: "% Adequado + Avançado",
    tooltipLabel: "Adequado + Avançado",
    legend: "Métrica: % de alunos nos níveis Adequado e Avançado",
    isPercentage: true,
    decimals: 1,
  },
};

function formatMetricValue(value: number, descriptor: ChartMetricDescriptor): string {
  const safe = Number.isFinite(value) ? value : 0;
  const formatted = formatPt(safe, descriptor.decimals);
  return descriptor.isPercentage ? `${formatted}%` : formatted;
}

const SCHOOL_NAME_CHARS_PER_LINE = 26;

function normalizeSchoolName(value: unknown): string {
  const text = String(value || "—").replace(/\s+/g, " ").trim();
  return text || "—";
}

function wrapSchoolNameLines(text: string, maxLineLen = SCHOOL_NAME_CHARS_PER_LINE): string[] {
  const normalized = normalizeSchoolName(text);
  if (normalized === "—") return [normalized];

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxLineLen) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (word.length > maxLineLen) {
      for (let i = 0; i < word.length; i += maxLineLen) {
        lines.push(word.slice(i, i + maxLineLen));
      }
      current = "";
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["—"];
}

function maxWrappedNameLines(names: string[]): number {
  if (!names.length) return 1;
  return Math.max(1, ...names.map((name) => wrapSchoolNameLines(name).length));
}

function estimateYAxisWidth(names: string[]): number {
  let maxChars = 10;
  for (const name of names) {
    for (const line of wrapSchoolNameLines(name)) {
      maxChars = Math.max(maxChars, line.length);
    }
  }
  return Math.min(400, Math.max(200, Math.round(maxChars * 6.4 + 20)));
}

function estimateSchoolChartHeight(rowCount: number, nameLineCount: number): number {
  const rowSlot = Math.max(40, 22 + nameLineCount * 11);
  return Math.max(300, rowCount * rowSlot + 56);
}

type YAxisTickProps = {
  x?: number;
  y?: number;
  payload?: { value?: string };
};

function SchoolNameYAxisTick({ x = 0, y = 0, payload }: YAxisTickProps) {
  const lines = wrapSchoolNameLines(payload?.value);
  const lineHeight = 12;
  const offset = ((lines.length - 1) * lineHeight) / 2;

  return (
    <g transform={`translate(${x},${y})`}>
      {lines.map((line, idx) => (
        <text
          key={`${line}-${idx}`}
          x={0}
          y={0}
          dy={idx * lineHeight - offset}
          textAnchor="end"
          fill="hsl(var(--muted-foreground))"
          fontSize={11}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

type BarValueLabelProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
};

function makeMetricBarValueLabel(descriptor: ChartMetricDescriptor) {
  return function MetricBarValueLabel({ x = 0, y = 0, width = 0, height = 0, value }: BarValueLabelProps) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return (
      <text
        x={x + width + 6}
        y={y + height / 2}
        dy={4}
        textAnchor="start"
        fill="hsl(var(--foreground))"
        fontSize={11}
        fontWeight={600}
      >
        {formatMetricValue(num, descriptor)}
      </text>
    );
  };
}

function makeChartTooltip(descriptor: ChartMetricDescriptor) {
  return function ChartTooltip({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: ChartTooltipEntry[];
  }) {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload;
    const rawValue = Number(payload[0]?.value ?? point?.metric_value ?? 0);
    const school = normalizeSchoolName(point?.school_name);
    const barColor = point?.barColor || "hsl(var(--primary))";

    return (
      <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
        <p className="font-semibold text-foreground">{school}</p>
        <p className="mt-1 text-muted-foreground">
          {descriptor.tooltipLabel}:{" "}
          <span className="font-bold" style={{ color: barColor }}>
            {formatMetricValue(rawValue, descriptor)}
          </span>
        </p>
      </div>
    );
  };
}

export default function RankingOverviewPanel({ data, isLoading, isRefreshing, errorMessage }: Props) {
  const { sortBy, sortDir, setSortBy, setSortDir, sortRows } = useRankingSort();
  const overview = data?.overview;
  const summary = overview?.summary;
  const byCourse = overview?.by_course || {};
  const courseEntries = Object.entries(byCourse);

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
      <RankingSortControls
        sortBy={sortBy}
        sortDir={sortDir}
        onSortByChange={setSortBy}
        onSortDirChange={setSortDir}
      />
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
          counts_by_status?: Record<string, number>;
        };
        const rows = sortRows(
          (typedCourseData.table_rows || []).map((row) => ({
            ...row,
            level_tag: String(row.level_tag || "N/A"),
            is_critical: Boolean(row.is_critical),
          }))
        );
        const metricDescriptor = CHART_METRIC_BY_SORT[sortBy];
        const chartRows = sortRows((typedCourseData.chart_rows || []) as Array<Record<string, unknown>>).map(
          (row, idx) => ({
            ...row,
            metric_value: getRankingSortValue(row, sortBy),
            barColor: rankingSchoolBarFill(idx),
          })
        );
        const chartMaxValue = Math.max(
          metricDescriptor.isPercentage ? 100 : 1,
          ...chartRows.map((row) => Number(row.metric_value || 0))
        );
        const chartDomainMax = metricDescriptor.isPercentage
          ? 100
          : Math.ceil(chartMaxValue * 1.05);
        const schoolNames = chartRows.map((row) => normalizeSchoolName(row.school_name));
        const yAxisWidth = estimateYAxisWidth(schoolNames);
        const nameLineCount = maxWrappedNameLines(schoolNames);
        const chartHeight = estimateSchoolChartHeight(chartRows.length, nameLineCount);
        const MetricBarValueLabel = makeMetricBarValueLabel(metricDescriptor);
        const MetricChartTooltip = makeChartTooltip(metricDescriptor);
        return (
          <Card key={courseLabel} className="overflow-hidden border border-border/70">
            <CardHeader className="border-b border-border/60 bg-muted/30 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                Ranking {courseLabel}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <SummaryCard
                  label="Destaque"
                  value={String(Number(typedCourseData.counts_by_status?.destaque || 0))}
                  hint="Níveis Adequado e Avançado"
                />
                <SummaryCard
                  label="Em desenvolvimento"
                  value={String(Number(typedCourseData.counts_by_status?.desenvolvimento || 0))}
                  hint="Nível Básico"
                />
                <SummaryCard
                  label="Atenção"
                  value={String(Number(typedCourseData.counts_by_status?.atencao || 0))}
                  hint="Abaixo do Básico"
                />
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-4">
                <p className="text-sm font-semibold text-foreground">Desempenho por escola</p>
                <p className="mt-0.5 mb-3 text-xs text-muted-foreground">{metricDescriptor.legend}</p>
                <div className="w-full" style={{ height: chartHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={chartRows}
                      margin={{ top: 8, right: 52, left: 8, bottom: 28 }}
                    >
                      <CartesianGrid strokeDasharray="2 4" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis
                        type="number"
                        domain={[0, chartDomainMax]}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(value) =>
                          metricDescriptor.isPercentage
                            ? `${formatPt(Number(value), 0)}%`
                            : formatPt(Number(value), 0)
                        }
                        label={{
                          value: metricDescriptor.axisLabel,
                          position: "insideBottom",
                          offset: -18,
                          style: { fontSize: 11, fill: "hsl(var(--muted-foreground))", fontWeight: 600 },
                        }}
                      />
                      <YAxis
                        dataKey="school_name"
                        type="category"
                        width={yAxisWidth}
                        tick={<SchoolNameYAxisTick />}
                        interval={0}
                      />
                      <Tooltip content={<MetricChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.35)" }} />
                      <Bar
                        dataKey="metric_value"
                        radius={[0, 6, 6, 0]}
                        barSize={18}
                        isAnimationActive={false}
                      >
                        {chartRows.map((row, idx) => (
                          <Cell
                            key={`${String(row.school_name || idx)}-${idx}`}
                            fill={String(row.barColor || rankingSchoolBarFill(idx))}
                          />
                        ))}
                        <LabelList dataKey="metric_value" content={<MetricBarValueLabel />} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={RANKING_TABLE_SCROLL_CLASS}>
                <table className="w-full min-w-[1100px] text-sm border-collapse">
                  <thead>
                    <RankingMetricsTableHead nameHeader="Escola" />
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <RankingMetricsTableRow
                        key={`${courseLabel}-${String(row.school_id || row.position)}`}
                        rowKey={`${courseLabel}-${String(row.school_id || row.position)}`}
                        row={row}
                        nameCell={String(row.school_name || "Escola")}
                      />
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
