import type { ExportChart } from "@/types/presentation19-export-spec";
import { attachMunicipalReferenceLineToChart, isMunicipalScopeAverageLabel } from "@/utils/reports/presentation19/municipalReferenceLine";

function chunkFlat<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Divide barras por categoria, mantendo «Municipal» em cada fatia (como proficiência geral). */
export function chunkExportChartDataPreservingMunicipal(
  data: Array<Record<string, string | number>>,
  categoryKey: string,
  maxPerChunk: number
): Array<Array<Record<string, string | number>>> {
  if (data.length <= maxPerChunk || maxPerChunk < 2) return [data];

  const municipalRows = data.filter((r) => isMunicipalScopeAverageLabel(String(r[categoryKey] ?? "")));
  const otherRows = data.filter((r) => !isMunicipalScopeAverageLabel(String(r[categoryKey] ?? "")));
  const munSlots = municipalRows.length > 0 ? 1 : 0;
  const roomForOthers = Math.max(1, maxPerChunk - munSlots);
  const chunks = chunkFlat(otherRows, roomForOthers);
  return chunks.map((chunk) => [...chunk, ...municipalRows]);
}

export function expandDisciplineChartsWithCategoryChunks(
  entries: Array<{ title: string; chart: ExportChart }>,
  maxPerChunk: number
): Array<{ title: string; chart: ExportChart }> {
  const out: Array<{ title: string; chart: ExportChart }> = [];
  for (const entry of entries) {
    const chunks = chunkExportChartDataPreservingMunicipal(entry.chart.data, entry.chart.categoryKey, maxPerChunk);
    if (chunks.length <= 1) {
      out.push(entry);
      continue;
    }
    chunks.forEach((data, i) => {
      out.push({
        title: `${entry.title} (${i + 1}/${chunks.length})`,
        chart: attachMunicipalReferenceLineToChart({ ...entry.chart, data }),
      });
    });
  }
  return out;
}
