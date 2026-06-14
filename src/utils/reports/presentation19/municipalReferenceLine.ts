import type { ExportChart } from "@/types/presentation19-export-spec";
import {
  isPresentation19MunicipalAvgLabel,
  PRESENTATION19_MUNICIPAL_AVG_LABEL,
} from "@/utils/reports/presentation19/presentation19Labels";

export function isMunicipalScopeAverageLabel(label: string): boolean {
  const n = String(label ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return isPresentation19MunicipalAvgLabel(label) || n === "municipal";
}

export function findMunicipalAnchorIndex(chart: ExportChart): number {
  const { categoryKey, data, referenceLineAnchorCategory } = chart;
  if (referenceLineAnchorCategory) {
    const idx = data.findIndex((r) => String(r[categoryKey] ?? "") === referenceLineAnchorCategory);
    if (idx >= 0) return idx;
  }
  return data.findIndex((r) => isMunicipalScopeAverageLabel(String(r[categoryKey] ?? "")));
}

/** Anexa `referenceLineY` alinhado ao topo da barra municipal (valor da barra, não o rótulo acima). */
export function attachMunicipalReferenceLineToChart(chart: ExportChart): ExportChart {
  const idx = findMunicipalAnchorIndex(chart);
  if (idx < 0) return chart;
  const valueKey = chart.valueKeys[0]?.key;
  if (!valueKey) return chart;
  const y = Number(chart.data[idx][valueKey]);
  if (!Number.isFinite(y)) return chart;
  return {
    ...chart,
    referenceLineY: y,
    referenceLineAnchorCategory: String(chart.data[idx][chart.categoryKey] ?? PRESENTATION19_MUNICIPAL_AVG_LABEL),
  };
}

export type MunicipalReferenceSegment = {
  y: number;
  /** Categoria X inicial do segmento (Recharts). */
  xStart: string;
  /** Categoria X final do segmento (Recharts). */
  xEnd: string;
};

/**
 * Segmento horizontal saindo do topo da barra municipal:
 * - municipal à direita → linha até o início do gráfico (esquerda);
 * - municipal à esquerda → linha até o fim do gráfico (demais barras).
 */
export function resolveMunicipalReferenceSegment(chart: ExportChart): MunicipalReferenceSegment | null {
  if (chart.referenceLineY == null || !Number.isFinite(Number(chart.referenceLineY))) return null;
  const idx = findMunicipalAnchorIndex(chart);
  if (idx < 0 || chart.data.length < 2) return null;

  const catKey = chart.categoryKey;
  const y = Number(chart.referenceLineY);
  const anchorX = String(chart.data[idx][catKey] ?? "");
  if (!anchorX) return null;

  if (idx === 0) {
    const endX = String(chart.data[chart.data.length - 1][catKey] ?? "");
    return endX ? { y, xStart: anchorX, xEnd: endX } : null;
  }

  const startX = String(chart.data[0][catKey] ?? "");
  return startX ? { y, xStart: startX, xEnd: anchorX } : null;
}

/** Frações 0–1 da largura do plot (para PDF/PPTX/preview nativo). */
export function resolveMunicipalReferenceXRatios(chart: ExportChart): {
  y: number;
  startRatio: number;
  endRatio: number;
} | null {
  const segment = resolveMunicipalReferenceSegment(chart);
  if (!segment) return null;

  const n = chart.data.length;
  const idx = findMunicipalAnchorIndex(chart);
  if (idx < 0 || n < 2) return null;

  const anchorCenter = (idx + 0.5) / n;
  if (idx === 0) {
    return { y: segment.y, startRatio: anchorCenter, endRatio: 1 };
  }
  return { y: segment.y, startRatio: 0, endRatio: anchorCenter };
}

export function resolveMunicipalReferenceSegmentFromBarData(
  data: Array<{ name: string; value: number }>,
  anchorName: string,
  y: number
): MunicipalReferenceSegment | null {
  if (!Number.isFinite(y) || data.length < 2) return null;
  const idx = data.findIndex(
    (d) => d.name === anchorName || isMunicipalScopeAverageLabel(d.name)
  );
  if (idx < 0) return null;
  const anchorX = data[idx].name;
  if (idx === 0) {
    return { y, xStart: anchorX, xEnd: data[data.length - 1].name };
  }
  return { y, xStart: data[0].name, xEnd: anchorX };
}
