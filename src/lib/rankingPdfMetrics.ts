import {
  formatAdequadoAvancado,
  formatParticipation,
  fmtPtNum,
} from '@/services/reports/rankingPdfFormat';
import { formatBestClassDisplay } from '@/lib/rankingLabels';

export type SchoolRankingMetricId = 'participation' | 'score' | 'adeq_avan' | 'proficiency';

export type SchoolRankingRow = Record<string, unknown>;

export type SchoolRankingMetricConfig = {
  id: SchoolRankingMetricId;
  sectionTitle: string;
  chartTitle: string;
  chartCaption: string;
  tableCaption: string;
  axisLabel: string;
  legendChart: string;
  footnote: string;
  maxChartValue?: number;
  sortValue: (row: SchoolRankingRow) => number;
  chartValue: (row: SchoolRankingRow) => number;
  formatChartValue: (value: number) => string;
  tableHead: string[][];
  tableBody: (rows: SchoolRankingRow[]) => Array<Array<string | number>>;
};

function participationSort(row: SchoolRankingRow): number {
  return Number(row.participation_rate || 0);
}

export const SCHOOL_RANKING_METRICS: SchoolRankingMetricConfig[] = [
  {
    id: 'participation',
    sectionTitle: 'Ranking por participação',
    chartTitle: 'Participação por escola',
    chartCaption: 'Comparativo de participação (% de alunos avaliados) por escola no recorte.',
    tableCaption: 'Tabela — Ranking por participação',
    axisLabel: 'Participação (%) →',
    legendChart: 'Cada barra usa uma cor distinta por escola; largura proporcional ao % de participação (0–100).',
    footnote: 'Ordenação por taxa de participação decrescente.',
    maxChartValue: 100,
    sortValue: participationSort,
    chartValue: participationSort,
    formatChartValue: (v) => `${fmtPtNum(v)}%`,
    tableHead: [['Pos.', 'Escola', 'Participação', 'Nível']],
    tableBody: (rows) =>
      rows.map((row) => [
        Number(row.position || 0),
        String(row.school_name || '—'),
        formatParticipation(
          row.participation_rate,
          row.participating_students,
          row.total_students
        ),
        String(row.level_tag || '—'),
      ]),
  },
  {
    id: 'score',
    sectionTitle: 'Ranking por nota média',
    chartTitle: 'Nota média por escola',
    chartCaption: 'Comparativo de nota média (0–10) por escola no recorte.',
    tableCaption: 'Tabela — Ranking por nota média',
    axisLabel: 'Nota média →',
    legendChart: 'Cada barra usa uma cor distinta por escola; largura proporcional à nota (0–10).',
    footnote: 'Ordenação por nota média decrescente.',
    maxChartValue: 10,
    sortValue: (row) => Number(row.average_score || 0),
    chartValue: (row) => Number(row.average_score || 0),
    formatChartValue: (v) => fmtPtNum(v),
    tableHead: [['Pos.', 'Escola', 'Nota média', 'Proficiência', 'Nível']],
    tableBody: (rows) =>
      rows.map((row) => [
        Number(row.position || 0),
        String(row.school_name || '—'),
        fmtPtNum(row.average_score),
        fmtPtNum(row.average_proficiency),
        String(row.level_tag || '—'),
      ]),
  },
  {
    id: 'adeq_avan',
    sectionTitle: 'Ranking por Adequado + Avançado',
    chartTitle: 'Adequado + Avançado por escola',
    chartCaption: 'Percentual de alunos nos níveis Adequado e Avançado por escola.',
    tableCaption: 'Tabela — Ranking por Adequado + Avançado',
    axisLabel: 'Adeq. + Avan. (%) →',
    legendChart: 'Cada barra usa uma cor distinta por escola; largura proporcional ao % Adequado + Avançado.',
    footnote: 'Ordenação por percentual de Adequado + Avançado decrescente.',
    maxChartValue: 100,
    sortValue: (row) => Number(row.adequado_avancado_pct || 0),
    chartValue: (row) => Number(row.adequado_avancado_pct || 0),
    formatChartValue: (v) => `${fmtPtNum(v)}%`,
    tableHead: [['Pos.', 'Escola', 'Adeq.+Avan.', 'Nível']],
    tableBody: (rows) =>
      rows.map((row) => [
        Number(row.position || 0),
        String(row.school_name || '—'),
        formatAdequadoAvancado(row.adequado_avancado_count, row.adequado_avancado_pct),
        String(row.level_tag || '—'),
      ]),
  },
  {
    id: 'proficiency',
    sectionTitle: 'Ranking por proficiência',
    chartTitle: 'Proficiência por escola',
    chartCaption: 'Comparativo de proficiência média por escola; barras proporcionais ao maior valor do gráfico.',
    tableCaption: 'Tabela — Ranking por proficiência',
    axisLabel: 'Proficiência →',
    legendChart: 'Cada barra usa uma cor distinta por escola; largura proporcional à proficiência.',
    footnote: 'Ordenação por proficiência média decrescente.',
    sortValue: (row) => Number(row.average_proficiency || 0),
    chartValue: (row) => Number(row.average_proficiency || 0),
    formatChartValue: (v) => fmtPtNum(v),
    tableHead: [['Pos.', 'Escola', 'Proficiência', 'Nota média', 'Nível']],
    tableBody: (rows) =>
      rows.map((row) => [
        Number(row.position || 0),
        String(row.school_name || '—'),
        fmtPtNum(row.average_proficiency),
        fmtPtNum(row.average_score),
        String(row.level_tag || '—'),
      ]),
  },
];

export function sortSchoolRowsByMetric(
  rows: SchoolRankingRow[],
  metric: SchoolRankingMetricConfig
): SchoolRankingRow[] {
  return [...rows]
    .sort((a, b) => {
      const diff = metric.sortValue(b) - metric.sortValue(a);
      if (diff !== 0) return diff;
      return String(a.school_name || '').localeCompare(String(b.school_name || ''), 'pt-BR');
    })
    .map((row, idx) => ({ ...row, position: idx + 1 }));
}

export function buildCriticalRowIndexes(rows: SchoolRankingRow[]): Set<number> {
  const critical = new Set<number>();
  rows.forEach((row, idx) => {
    if (row.is_critical) critical.add(idx);
  });
  return critical;
}

/** Colunas da tabela municipal completa (referência). */
export function municipalConsolidatedBody(rows: SchoolRankingRow[]): Array<Array<string | number>> {
  return rows.map((row) => [
    Number(row.position || 0),
    String(row.school_name || '—'),
    formatParticipation(row.participation_rate, row.participating_students, row.total_students),
    fmtPtNum(row.average_proficiency),
    fmtPtNum(row.average_score),
    formatAdequadoAvancado(row.adequado_avancado_count, row.adequado_avancado_pct),
    String(row.level_tag || '—'),
    formatBestClassDisplay(row),
  ]);
}

export function municipalMetricTableColumnStyles(
  metricId: SchoolRankingMetricId
): Record<number, unknown> {
  if (metricId === 'participation') {
    return {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 78, halign: 'left' },
      2: { cellWidth: 32, halign: 'center' },
      3: { cellWidth: 30, halign: 'center' },
    };
  }
  if (metricId === 'score' || metricId === 'proficiency') {
    return {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 70, halign: 'left' },
      2: { cellWidth: 26, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 30, halign: 'center' },
    };
  }
  return {
    0: { cellWidth: 12, halign: 'center' },
    1: { cellWidth: 78, halign: 'left' },
    2: { cellWidth: 34, halign: 'right' },
    3: { cellWidth: 30, halign: 'center' },
  };
}

export function municipalMetricLevelColumn(metricId: SchoolRankingMetricId): number | undefined {
  if (metricId === 'participation') return 3;
  if (metricId === 'adeq_avan') return 3;
  return 4;
}
