import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts';
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components';
import type { ComposeOption, ECharts } from 'echarts/core';
import {
  formatEvolutionMetric,
  formatSignedEvolutionPercent,
  type EvolutionMetricKind,
} from '@/utils/evolution/formatEvolutionMetric';
import { EVOLUTION_DELTA_COLORS, EVOLUTION_LINE_COLOR } from '@/utils/evolution/evolutionChartColors';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  LabelLayout,
  CanvasRenderer,
]);

type ComboOption = ComposeOption<
  BarSeriesOption | LineSeriesOption | GridComponentOption | TooltipComponentOption | LegendComponentOption
>;

export type EvolutionChartMetric = 'nota' | 'proficiencia' | 'quantidade';
export type EvolutionChartMode = 'screen' | 'pdf';

export interface EvolutionComboChartProps {
  metric: EvolutionChartMetric;
  evaluationNames: string[];
  values: number[];
  variations: Array<number | null>;
  colors: string[];
  /** [min, max]. Para quantidade, omita e o eixo vai de 0 até dataMax + 5. */
  yDomain?: [number, number];
  yAxisName?: string;
  mode?: EvolutionChartMode;
  seriesName?: string;
}

const METRIC_KIND: Record<EvolutionChartMetric, EvolutionMetricKind> = {
  nota: 'nota',
  proficiencia: 'proficiencia',
  quantidade: 'inteiro',
};

const METRIC_LABEL: Record<EvolutionChartMetric, string> = {
  nota: 'Nota',
  proficiencia: 'Proficiência',
  quantidade: 'Alunos',
};

const PDF_CHART_WIDTH = 720;
const PDF_CHART_HEIGHT = 260;

interface ChartThemeColors {
  foreground: string;
  border: string;
  background: string;
  card: string;
}

function hslTripleToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = lig - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function readCssColorHex(variable: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  const match = raw.match(/([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!match) return fallback;
  return hslTripleToHex(Number(match[1]), Number(match[2]), Number(match[3]));
}

function resolveThemeColors(mode: EvolutionChartMode): ChartThemeColors {
  if (mode === 'pdf') {
    return {
      foreground: '#374151',
      border: '#e5e7eb',
      background: '#ffffff',
      card: '#ffffff',
    };
  }
  const isDark = document.documentElement.classList.contains('dark');
  return {
    foreground: readCssColorHex('--foreground', isDark ? '#f8fafc' : '#0f172a'),
    border: readCssColorHex('--border', isDark ? '#334155' : '#e5e7eb'),
    background: readCssColorHex('--background', isDark ? '#0f172a' : '#ffffff'),
    card: readCssColorHex('--card', isDark ? '#111827' : '#ffffff'),
  };
}

function parseColorChannels(color: string): [number, number, number] | null {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const value = hex[1];
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  }
  const rgb = color.trim().match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (!rgb) return null;
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
}

/** Texto claro nas barras escuras e texto escuro nas barras claras. */
export function contrastTextOnFill(color: string): string {
  const channels = parseColorChannels(color);
  if (!channels) return '#ffffff';
  const [r, g, b] = channels.map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? '#1f2937' : '#ffffff';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Até duas linhas; o que passar da segunda vira reticências. */
export function wrapAxisLabel(name: string, maxChars: number): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  let cut = clean.lastIndexOf(' ', maxChars);
  if (cut < Math.floor(maxChars * 0.45)) cut = maxChars;
  const line1 = clean.slice(0, cut).trim();
  let rest = clean.slice(cut).trim();
  if (rest.length > maxChars) {
    rest = `${rest.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
  }
  return rest ? `${line1}\n${rest}` : line1;
}

function deltaTone(variation: number | null): 'up' | 'down' | 'flat' | null {
  if (variation == null) return null;
  if (variation > 0) return 'up';
  if (variation < 0) return 'down';
  return 'flat';
}

export function buildEvolutionComboOption(props: EvolutionComboChartProps, theme: ChartThemeColors): ComboOption {
  const mode = props.mode ?? 'screen';
  const metric = props.metric;
  const fontSize = mode === 'pdf' ? 11 : 12;
  const names = props.evaluationNames;
  const values = props.values;
  const variations = props.variations;
  const kind = METRIC_KIND[metric];
  const rotate = mode === 'pdf' && names.length >= 4 ? 28 : 0;
  const charsPerLine = rotate ? 16 : mode === 'pdf' ? 18 : 22;

  const yMin = props.yDomain ? props.yDomain[0] : 0;
  const yMax = props.yDomain
    ? props.yDomain[1]
    : Math.max(0, ...values) + 5;

  const barData = values.map((value, index) => {
    const fill = props.colors[index] ?? EVOLUTION_LINE_COLOR;
    return {
      value,
      itemStyle: { color: fill, borderRadius: [4, 4, 0, 0] },
      label: { color: contrastTextOnFill(fill) },
    };
  });

  const richBase = {
    fontSize,
    fontWeight: 'bold' as const,
    padding: [2, 5] as [number, number],
    borderRadius: 3,
    backgroundColor: theme.card,
    textBorderColor: theme.card,
    textBorderWidth: 2,
  };

  const seriesName = props.seriesName ?? METRIC_LABEL[metric];

  const option: ComboOption = {
    animation: mode === 'screen',
    animationDuration: mode === 'screen' ? 800 : 0,
    backgroundColor: mode === 'pdf' ? '#ffffff' : 'transparent',
    grid: {
      containLabel: true,
      left: 8,
      right: 16,
      top: 36,
      bottom: rotate ? 12 : 8,
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: theme.card,
      borderColor: theme.border,
      textStyle: { color: theme.foreground, fontSize },
      formatter: (raw) => {
        const items = Array.isArray(raw) ? raw : [raw];
        const index = items[0]?.dataIndex ?? 0;
        const fullName = names[index] ?? '';
        const value = values[index];
        const variation = variations[index] ?? null;
        const variationText =
          index === 0 ? '' : `<div>Variação: ${variation == null ? '—' : formatSignedEvolutionPercent(variation)}</div>`;
        return `<div><strong>${escapeHtml(fullName)}</strong><div>${METRIC_LABEL[metric]}: ${formatEvolutionMetric(value, kind)}</div>${variationText}</div>`;
      },
    },
    legend: { show: false },
    xAxis: {
      type: 'category',
      data: names,
      axisLabel: {
        interval: 0,
        width: rotate ? 78 : mode === 'pdf' ? 96 : 110,
        overflow: 'truncate',
        rotate,
        fontSize,
        color: theme.foreground,
        lineHeight: fontSize + 3,
        formatter: (value: string) => wrapAxisLabel(String(value), charsPerLine),
      },
      axisTick: { alignWithLabel: true },
      axisLine: { lineStyle: { color: theme.border } },
    },
    yAxis: {
      type: 'value',
      min: yMin,
      max: yMax,
      name: props.yAxisName,
      nameLocation: 'middle',
      nameGap: metric === 'nota' ? 36 : 48,
      nameTextStyle: { color: theme.foreground, fontSize },
      minInterval: metric === 'quantidade' ? 1 : undefined,
      axisLabel: {
        fontSize,
        color: theme.foreground,
        formatter: (value: number) =>
          formatEvolutionMetric(value, metric === 'nota' ? 'nota' : 'inteiro'),
      },
      splitLine: { lineStyle: { type: 'dashed', color: theme.border } },
    },
    series: [
      {
        name: seriesName,
        type: 'bar',
        data: barData,
        barMaxWidth: 60,
        label: {
          show: true,
          position: 'inside',
          fontSize,
          fontWeight: 'bold',
          formatter: (params) => formatEvolutionMetric(Number(params.value), kind),
        },
        labelLayout: { hideOverlap: true },
        z: 2,
      },
      {
        name: 'Evolução',
        type: 'line',
        data: values,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 3, color: EVOLUTION_LINE_COLOR },
        itemStyle: { color: EVOLUTION_LINE_COLOR, borderColor: theme.card, borderWidth: 2 },
        label: {
          show: true,
          position: 'top',
          distance: 8,
          fontSize,
          formatter: (params) => {
            const variation = variations[params.dataIndex] ?? null;
            const tone = deltaTone(variation);
            if (params.dataIndex === 0 || tone == null) return '';
            return `{${tone}|${formatSignedEvolutionPercent(variation)}}`;
          },
          rich: {
            up: { ...richBase, color: EVOLUTION_DELTA_COLORS.up },
            down: { ...richBase, color: EVOLUTION_DELTA_COLORS.down },
            flat: { ...richBase, color: EVOLUTION_DELTA_COLORS.flat },
          },
        },
        labelLayout: { hideOverlap: true },
        z: 3,
      },
    ],
  };

  return option;
}

export function EvolutionComboChart({
  metric,
  evaluationNames,
  values,
  variations,
  colors,
  yDomain,
  yAxisName,
  mode = 'screen',
  seriesName,
}: EvolutionComboChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    if (mode !== 'screen') return;
    const target = document.documentElement;
    const observer = new MutationObserver(() => setThemeTick((tick) => tick + 1));
    observer.observe(target, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [mode]);

  const yMin = yDomain?.[0];
  const yMax = yDomain?.[1];
  const option = useMemo(
    () =>
      buildEvolutionComboOption(
        {
          metric,
          evaluationNames,
          values,
          variations,
          colors,
          yDomain: yMin != null && yMax != null ? [yMin, yMax] : undefined,
          yAxisName,
          mode,
          seriesName,
        },
        resolveThemeColors(mode)
      ),
    [metric, evaluationNames, values, variations, colors, yMin, yMax, yAxisName, mode, seriesName, themeTick]
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let chart: ECharts | null = echarts.init(host, undefined, {
      renderer: 'canvas',
      width: mode === 'pdf' ? PDF_CHART_WIDTH : host.clientWidth || undefined,
      height: mode === 'pdf' ? PDF_CHART_HEIGHT : host.clientHeight || undefined,
    });
    let snapped = false;

    const markReady = () => {
      host.setAttribute('data-chart-ready', 'true');
    };

    const onFinished = () => {
      if (!chart || snapped) return;
      if (mode !== 'pdf') {
        markReady();
        return;
      }
      snapped = true;
      chart.off('finished', onFinished);
      const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
      chart.dispose();
      chart = null;
      host.replaceChildren();
      const img = document.createElement('img');
      img.alt = seriesName || METRIC_LABEL[metric];
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      img.style.display = 'block';
      img.onload = () => markReady();
      host.appendChild(img);
      img.src = url;
      if (img.complete) markReady();
    };

    chart.on('finished', onFinished);
    chart.setOption(option, true);

    const observer =
      mode === 'screen'
        ? new ResizeObserver(() => {
            chart?.resize();
          })
        : null;
    observer?.observe(host);

    return () => {
      observer?.disconnect();
      chart?.off('finished', onFinished);
      chart?.dispose();
      chart = null;
      host.replaceChildren();
      host.removeAttribute('data-chart-ready');
    };
  }, [option, mode, metric, seriesName]);

  return (
    <div
      ref={hostRef}
      data-evolution-chart=""
      style={{
        width: mode === 'pdf' ? PDF_CHART_WIDTH : '100%',
        height: mode === 'pdf' ? PDF_CHART_HEIGHT : 320,
      }}
    />
  );
}
