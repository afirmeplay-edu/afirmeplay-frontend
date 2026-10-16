import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import type { BarSeriesOption } from 'echarts/charts';
import type {
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
} from 'echarts/components';
import type { ComposeOption, ECharts } from 'echarts/core';
import {
  COMPARATIVE_CHART_COLORS,
  COMPARATIVE_NIVEL_LABELS,
  type ComparativeIndicador,
} from '@/constants/comparativeReport';
import type { ComparativeResumo } from '@/services/reports/comparativeReportApi';

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, LabelLayout, CanvasRenderer]);

type ChartOption = ComposeOption<
  BarSeriesOption | GridComponentOption | TooltipComponentOption | LegendComponentOption
>;

export type ComparativeChartMode = 'screen' | 'pdf';

type ComparativeChartsProps = {
  report: ComparativeResumo;
  mode?: ComparativeChartMode;
};

const NIVEL_ORDER = ['abaixo_do_basico', 'basico', 'adequado', 'avancado'] as const;
const NIVEL_COLORS = ['#dc2626', '#f59e0b', '#22c55e', '#2563eb'];

function shortLabel(text: string, max = 28): string {
  const t = (text || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function useComparativeChart(
  option: ChartOption | null,
  mode: ComparativeChartMode
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !option) return;

    const chart = echarts.init(el, undefined, {
      renderer: 'canvas',
      width: mode === 'pdf' ? 720 : undefined,
      height: mode === 'pdf' ? 280 : undefined,
    });
    chartRef.current = chart;
    chart.setOption(option, true);
    el.setAttribute('data-chart-ready', '1');
    el.setAttribute('data-comparative-chart', '1');

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      el.removeAttribute('data-chart-ready');
      chart.dispose();
      chartRef.current = null;
    };
  }, [option, mode]);

  return ref;
}

function ChartCard({
  title,
  option,
  mode,
}: {
  title: string;
  option: ChartOption | null;
  mode: ComparativeChartMode;
}) {
  const ref = useComparativeChart(option, mode);
  if (!option) return null;
  return (
    <div className="space-y-2" data-pdf-section="chart">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div
        ref={ref}
        className="w-full rounded-md border border-border bg-card"
        style={{ height: mode === 'pdf' ? 280 : 320 }}
      />
    </div>
  );
}

function baseGrid(): GridComponentOption {
  return { left: 48, right: 24, top: 48, bottom: 72, containLabel: true };
}

function buildGroupedOption(
  categories: string[],
  series: Array<{ name: string; data: number[]; color: string }>,
  yName: string,
  valueDigits = 0
): ChartOption {
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => formatNumber(Number(v), valueDigits),
    },
    legend: {
      top: 0,
      type: 'scroll',
      textStyle: { fontSize: 11 },
    },
    grid: baseGrid(),
    xAxis: {
      type: 'category',
      data: categories.map((c) => shortLabel(c, 22)),
      axisLabel: { interval: 0, rotate: categories.length > 3 ? 25 : 0, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      name: yName,
      nameTextStyle: { fontSize: 11 },
      axisLabel: {
        formatter: (v: number) => formatNumber(v, valueDigits),
      },
    },
    series: series.map((s) => ({
      type: 'bar',
      name: s.name,
      data: s.data,
      barMaxWidth: 42,
      itemStyle: { color: s.color, borderRadius: [6, 6, 0, 0] },
      label: {
        show: true,
        position: 'top',
        fontSize: 10,
        formatter: (params: { value?: number | string }) =>
          formatNumber(Number(params.value ?? 0), valueDigits),
      },
    })),
  };
}

export function ComparativeCharts({ report, mode = 'screen' }: ComparativeChartsProps) {
  const evalLabels = useMemo(
    () => report.avaliacoes.map((a) => a.titulo || a.evaluation_id),
    [report.avaliacoes]
  );

  const selected = new Set(report.filtros_aplicados.indicadores as ComparativeIndicador[]);

  const participacaoOption = useMemo(() => {
    if (!selected.has('participacao')) return null;
    const esperados = report.avaliacoes.map((a) => a.indicadores.participacao?.esperados ?? 0);
    const avaliados = report.avaliacoes.map((a) => a.indicadores.participacao?.avaliados ?? 0);
    const pct = report.avaliacoes.map(
      (a) => a.indicadores.participacao?.percentual_comparecimento ?? 0
    );
    return {
      counts: buildGroupedOption(
        evalLabels,
        [
          { name: 'Esperados', data: esperados, color: COMPARATIVE_CHART_COLORS[0] },
          { name: 'Avaliados', data: avaliados, color: COMPARATIVE_CHART_COLORS[1] },
        ],
        'Alunos',
        0
      ),
      pct: buildGroupedOption(
        evalLabels,
        [{ name: '% Comparecimento', data: pct, color: COMPARATIVE_CHART_COLORS[2] }],
        '%',
        1
      ),
    };
  }, [report, evalLabels, selected]);

  const proficienciaOption = useMemo(() => {
    if (!selected.has('proficiencia_media')) return null;
    const gerais = report.avaliacoes.map((a) => Number(a.indicadores.proficiencia_media?.geral ?? 0));
    return buildGroupedOption(
      evalLabels,
      [{ name: 'Proficiência média', data: gerais, color: COMPARATIVE_CHART_COLORS[3] }],
      'Proficiência',
      2
    );
  }, [report, evalLabels, selected]);

  const distribuicaoOption = useMemo(() => {
    if (!selected.has('distribuicao_niveis')) return null;
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, type: 'scroll', textStyle: { fontSize: 11 } },
      grid: baseGrid(),
      xAxis: {
        type: 'category',
        data: evalLabels.map((c) => shortLabel(c, 22)),
        axisLabel: { interval: 0, rotate: evalLabels.length > 3 ? 25 : 0, fontSize: 11 },
      },
      yAxis: { type: 'value', name: 'Alunos', nameTextStyle: { fontSize: 11 } },
      series: NIVEL_ORDER.map((key, idx) => ({
        type: 'bar' as const,
        name: COMPARATIVE_NIVEL_LABELS[key] || key,
        stack: 'niveis',
        barMaxWidth: 48,
        itemStyle: { color: NIVEL_COLORS[idx] },
        emphasis: { focus: 'series' as const },
        data: report.avaliacoes.map(
          (a) => a.indicadores.distribuicao_niveis?.quantidades?.[key] ?? 0
        ),
        label: {
          show: true,
          fontSize: 10,
          formatter: (params: { value?: number | string }) => {
            const v = Number(params.value ?? 0);
            return v > 0 ? formatNumber(v) : '';
          },
        },
      })),
    } as ChartOption;
  }, [report, evalLabels, selected]);

  const avaliadosOption = useMemo(() => {
    if (!selected.has('alunos_avaliados')) return null;
    const values = report.avaliacoes.map(
      (a) => a.indicadores.alunos_avaliados?.quantidade ?? 0
    );
    return buildGroupedOption(
      evalLabels,
      [{ name: 'Alunos avaliados', data: values, color: COMPARATIVE_CHART_COLORS[4] }],
      'Alunos',
      0
    );
  }, [report, evalLabels, selected]);

  const aplicacoesOption = useMemo(() => {
    if (!selected.has('aplicacoes')) return null;
    const values = report.avaliacoes.map((a) => a.indicadores.aplicacoes?.quantidade ?? 0);
    return buildGroupedOption(
      evalLabels,
      [{ name: 'Aplicações', data: values, color: COMPARATIVE_CHART_COLORS[5] }],
      'Aplicações',
      0
    );
  }, [report, evalLabels, selected]);

  return (
    <div className="space-y-6">
      {participacaoOption && (
        <>
          <ChartCard
            title="Participação — esperados × avaliados"
            option={participacaoOption.counts}
            mode={mode}
          />
          <ChartCard
            title="Participação — % de comparecimento"
            option={participacaoOption.pct}
            mode={mode}
          />
        </>
      )}
      {proficienciaOption && (
        <ChartCard title="Proficiência média" option={proficienciaOption} mode={mode} />
      )}
      {distribuicaoOption && (
        <ChartCard
          title="Distribuição por nível de proficiência"
          option={distribuicaoOption}
          mode={mode}
        />
      )}
      {avaliadosOption && (
        <ChartCard title="Nº de alunos avaliados" option={avaliadosOption} mode={mode} />
      )}
      {aplicacoesOption && (
        <ChartCard title="Nº de aplicações" option={aplicacoesOption} mode={mode} />
      )}
    </div>
  );
}
