import type { NiveisBySeriesRow, Presentation19DeckData, SlideQuestionRow } from "@/types/presentation19-slides";
import type { ExportChart, Presentation19ExportSpec, Presentation19SlideSpec } from "@/types/presentation19-export-spec";
import { getProficiencyTableInfo } from "@/components/evaluations/results/utils/proficiency";
import { getSubjectPaletteIndex } from "@/utils/competition/competitionSubjectColors";
import { chunkPresentation19SlideQuestionRows } from "@/utils/reports/presentation19/questionsTablePagination";
import { comparisonColumnLabel } from "@/utils/reports/presentation19/presentationScope";
import { formatPctOneDecimalPtBr } from "@/utils/reports/presentation19/formatPctOneDecimalPtBr";
import {
  filterPresentation19RealDisciplineRows,
  PRESENTATION19_MUNICIPAL_AVG_LABEL,
  presentation19GradesDisciplineChartTitle,
  presentation19ProficiencyDisciplineChartTitle,
} from "@/utils/reports/presentation19/presentation19Labels";
import {
  mediaMunicipalRelatorioConsolidada,
  mediaMunicipalRelatorioPorDisciplinaResolved,
} from "@/utils/reports/presentation19/presentation19MunicipalMedia";
import { attachMunicipalReferenceLineToChart } from "@/utils/reports/presentation19/municipalReferenceLine";
import { expandDisciplineChartsWithCategoryChunks } from "@/utils/reports/presentation19/presentation19ChartCategoryChunk";

const MAX_CATEGORY_ROWS_PER_SLIDE = 14;
/** Proficiência por disciplina: 1 gráfico por slide (largura total, uma disciplina por “linha”). */
const MAX_PROF_DISC_CHARTS_PER_SLIDE = 1;
/** Barras por slide no gráfico “% de acertos por descritor” (legibilidade). */
const MAX_ACCURACY_CHART_BARS_PER_SLIDE = 9;

function chunkFlat<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

const levelColors = {
  abaixo_do_basico: "#EF4444",
  basico: "#FACC15",
  adequado: "#22C55E",
  avancado: "#166534",
} as const;

const disciplinePalette = ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#f43f5e", "#06b6d4", "#84cc16", "#d946ef"];

function buildLinearTicks(min: number, max: number, segments: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || segments <= 0) return [min, max];
  const step = (max - min) / segments;
  const ticks: number[] = [];
  for (let i = 0; i <= segments; i++) {
    ticks.push(Number((min + step * i).toFixed(1)));
  }
  return ticks;
}

function clampToRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function buildPresenceChart(deckData: Presentation19DeckData, rows = deckData.presencaPorSerie): ExportChart {
  const totals = rows.map((r) => Math.max(0, Number(r.totalPresentes ?? 0)));
  const rawMax = Math.max(1, ...totals);
  const axisMax = rawMax <= 10 ? 10 : Math.ceil(rawMax / 5) * 5;

  return {
    type: "bar",
    categoryKey: "label",
    valueKeys: [{ key: "total_presentes", label: "Alunos presentes", color: deckData.primaryColor }],
    data: rows.map((r) => {
      const presentes = Math.round(Math.max(0, Number(r.totalPresentes ?? 0)));
      const pctStr = formatPctOneDecimalPtBr(Number(r.presencaMediaPct ?? 0));
      return {
        label: r.label,
        total_presentes: presentes,
        barTopLabel: `${presentes} · ${pctStr}`,
      };
    }),
    yAxis: {
      min: 0,
      max: axisMax,
      ticks: Array.from({ length: 5 }, (_, i) => Math.round((axisMax * i) / 4)),
      scaleLabel: "alunos",
    },
  };
}

function isMunicipalMultiSchool(deckData: Presentation19DeckData): boolean {
  return deckData.comparisonAxis === "escola" && deckData.niveisPorSerie.length > 1;
}

function sumNiveisRows(rows: NiveisBySeriesRow[], label: string): NiveisBySeriesRow {
  return rows.reduce(
    (acc, r) => ({
      label,
      abaixoDoBasico: acc.abaixoDoBasico + Number(r.abaixoDoBasico || 0),
      basico: acc.basico + Number(r.basico || 0),
      adequado: acc.adequado + Number(r.adequado || 0),
      avancado: acc.avancado + Number(r.avancado || 0),
      total: acc.total + Number(r.total || 0),
    }),
    { label, abaixoDoBasico: 0, basico: 0, adequado: 0, avancado: 0, total: 0 }
  );
}

const TURMA_COMPARE_GERAL_LABEL = "Geral da série";

function niveisRowToTableRow(r: NiveisBySeriesRow): [string, number, number, number, number, number] {
  return [r.label, r.abaixoDoBasico, r.basico, r.adequado, r.avancado, r.total];
}

function shouldAppendTotalGeralNiveis(rows: NiveisBySeriesRow[], multiSchool: boolean): boolean {
  if (multiSchool) return rows.length > 0;
  if (rows.length <= 1) return false;
  if (rows.length === 2 && rows.some((r) => r.label.trim() === TURMA_COMPARE_GERAL_LABEL)) return false;
  return true;
}

function buildLevelsTableRows(deckData: Presentation19DeckData, multiSchool: boolean): NiveisBySeriesRow[] {
  const raw = multiSchool
    ? [...deckData.niveisPorSerie].sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))
    : [...deckData.niveisPorSerie];
  if (raw.length === 0) {
    return [{ label: "Sem dados", abaixoDoBasico: 0, basico: 0, adequado: 0, avancado: 0, total: 0 }];
  }
  if (!shouldAppendTotalGeralNiveis(raw, multiSchool)) {
    return raw;
  }
  return [...raw, sumNiveisRows(raw, "TOTAL GERAL")];
}

/** Escolas + linha municipal no mesmo gráfico (barras agrupadas por faixa de nível). */
function buildLevelsComparisonChartMultiSchool(deckData: Presentation19DeckData): ExportChart {
  const sorted = [...deckData.niveisPorSerie].sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" })
  );
  const municipal = sumNiveisRows(deckData.niveisPorSerie, PRESENTATION19_MUNICIPAL_AVG_LABEL);
  const allRows = [...sorted, municipal];
  const rawMax = Math.max(
    1,
    ...allRows.flatMap((r) => [r.abaixoDoBasico, r.basico, r.adequado, r.avancado])
  );
  const maxRounded = rawMax <= 10 ? 10 : Math.ceil(rawMax / 5) * 5;

  return {
    type: "bar",
    categoryKey: "label",
    valueKeys: [
      { key: "abaixo", label: "Abaixo do Básico", color: levelColors.abaixo_do_basico },
      { key: "basico", label: "Básico", color: levelColors.basico },
      { key: "adequado", label: "Adequado", color: levelColors.adequado },
      { key: "avancado", label: "Avançado", color: levelColors.avancado },
    ],
    data: allRows.map((r) => ({
      label: r.label,
      abaixo: Number(clampToRange(r.abaixoDoBasico, 0, maxRounded)),
      basico: Number(clampToRange(r.basico, 0, maxRounded)),
      adequado: Number(clampToRange(r.adequado, 0, maxRounded)),
      avancado: Number(clampToRange(r.avancado, 0, maxRounded)),
    })),
    yAxis: {
      min: 0,
      max: maxRounded,
      ticks: buildLinearTicks(0, maxRounded, 4),
      scaleLabel: "alunos",
    },
  };
}

function buildLevelsChart(deckData: Presentation19DeckData): ExportChart {
  // Comparativo (ex.: Turma selecionada vs Geral da série): barras empilhadas por nível por escopo.
  if (deckData.comparisonAxis === "turma" && deckData.niveisPorSerie.length > 1) {
    const sorted = [...deckData.niveisPorSerie].sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
    const rowSum = (r: (typeof sorted)[number]) =>
      Number(r.abaixoDoBasico ?? 0) + Number(r.basico ?? 0) + Number(r.adequado ?? 0) + Number(r.avancado ?? 0);
    const rawMax = Math.max(1, ...sorted.map(rowSum));
    const maxRounded = rawMax <= 10 ? 10 : Math.ceil(rawMax / 5) * 5;
    return {
      type: "stackedBar",
      categoryKey: "label",
      valueKeys: [
        { key: "abaixo", label: "Abaixo do Básico", color: levelColors.abaixo_do_basico },
        { key: "basico", label: "Básico", color: levelColors.basico },
        { key: "adequado", label: "Adequado", color: levelColors.adequado },
        { key: "avancado", label: "Avançado", color: levelColors.avancado },
      ],
      data: sorted.map((r) => ({
        label: r.label,
        abaixo: Number(clampToRange(r.abaixoDoBasico, 0, maxRounded)),
        basico: Number(clampToRange(r.basico, 0, maxRounded)),
        adequado: Number(clampToRange(r.adequado, 0, maxRounded)),
        avancado: Number(clampToRange(r.avancado, 0, maxRounded)),
      })),
      yAxis: {
        min: 0,
        max: maxRounded,
        ticks: buildLinearTicks(0, maxRounded, 4),
        scaleLabel: "alunos",
      },
    };
  }

  const totals = deckData.niveisPorSerie.reduce(
    (acc, r) => {
      acc.abaixo_do_basico += Number(r.abaixoDoBasico || 0);
      acc.basico += Number(r.basico || 0);
      acc.adequado += Number(r.adequado || 0);
      acc.avancado += Number(r.avancado || 0);
      return acc;
    },
    { abaixo_do_basico: 0, basico: 0, adequado: 0, avancado: 0 }
  );
  const maxByLevel = Math.max(1, totals.abaixo_do_basico, totals.basico, totals.adequado, totals.avancado);
  const maxRounded = maxByLevel <= 10 ? 10 : Math.ceil(maxByLevel / 5) * 5;

  const nivelRows: Array<Record<string, string | number>> = [
    { nivel: "Abaixo do Básico", valor: clampToRange(totals.abaixo_do_basico, 0, maxRounded), color: levelColors.abaixo_do_basico },
    { nivel: "Básico", valor: clampToRange(totals.basico, 0, maxRounded), color: levelColors.basico },
    { nivel: "Adequado", valor: clampToRange(totals.adequado, 0, maxRounded), color: levelColors.adequado },
    { nivel: "Avançado", valor: clampToRange(totals.avancado, 0, maxRounded), color: levelColors.avancado },
  ];

  return {
    type: "bar",
    orientation: "horizontal",
    categoryKey: "nivel",
    valueKeys: [{ key: "valor", label: "Alunos", color: levelColors.adequado }],
    data: nivelRows,
    yAxis: {
      min: 0,
      max: maxRounded,
      ticks: buildLinearTicks(0, maxRounded, 4),
      scaleLabel: "alunos",
    },
  };
}

function buildGradesChartRowsYMax(
  rows: Array<Record<string, string | number>>,
  primaryColor: string
): ExportChart {
  if (rows.length === 0) {
    rows.push({ escopo: "Sem dados", nota: 0, color: "#94A3B8" });
  }
  const rawMax = Math.max(10, ...rows.map((r) => Number(r.nota ?? 0)));
  const yMax = Math.min(1000, Math.ceil(rawMax / 5) * 5);

  return {
    type: "bar",
    categoryKey: "escopo",
    valueKeys: [{ key: "nota", label: "Nota média", color: primaryColor }],
    data: rows.map((r) => ({
      ...r,
      nota: Number(clampToRange(Number(r.nota), 0, yMax).toFixed(1)),
    })),
    yAxis: {
      min: 0,
      max: yMax,
      ticks: buildLinearTicks(0, yMax, 4),
      scaleLabel: "nota",
    },
  };
}

/** Municipal multi-escola: todas as escolas + «Média municipal» no mesmo gráfico (como proficiência geral). */
function buildGradesChartMunicipalCompare(deckData: Presentation19DeckData): ExportChart {
  const rows: Array<Record<string, string | number>> = [];
  const sortedSchools = [...deckData.notasPorCategoria].sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" })
  );
  sortedSchools.forEach((cat, idx) => {
    rows.push({
      escopo: cat.label,
      nota: Number(clampToRange(cat.mediaNota, 0, 1000).toFixed(1)),
      color: disciplinePalette[idx % disciplinePalette.length],
    });
  });
  const notaMunicipalOficial = mediaMunicipalRelatorioConsolidada(
    deckData.notaMediaMunicipalPorDisciplinaRelatorio ?? undefined,
    deckData.notaDisciplinasRelatorioKeys
  );
  let munNotaRounded: number | null = null;
  if (notaMunicipalOficial != null && Number.isFinite(notaMunicipalOficial)) {
    munNotaRounded = Number(clampToRange(notaMunicipalOficial, 0, 1000).toFixed(1));
    rows.push({
      escopo: PRESENTATION19_MUNICIPAL_AVG_LABEL,
      nota: munNotaRounded,
      color: deckData.primaryColor,
    });
  }
  const chart = buildGradesChartRowsYMax(rows, deckData.primaryColor);
  return attachMunicipalReferenceLineToChart(chart);
}

function buildGradesChart(deckData: Presentation19DeckData): ExportChart {
  const rows: Array<Record<string, string | number>> = [];
  if (deckData.mediaNotaGeral != null && Number.isFinite(deckData.mediaNotaGeral)) {
    rows.push({
      escopo: "Média geral",
      nota: Number(clampToRange(deckData.mediaNotaGeral, 0, 1000).toFixed(1)),
      color: deckData.primaryColor,
    });
  }
  deckData.notasPorDisciplina.forEach((d, idx) => {
    rows.push({
      escopo: d.disciplina,
      nota: Number(clampToRange(d.mediaNota, 0, 1000).toFixed(1)),
      color: disciplinePalette[idx % disciplinePalette.length],
    });
  });
  if (deckData.notasPorCategoria.length > 0) {
    deckData.notasPorCategoria.forEach((c, idx) => {
      rows.push({
        escopo: c.label,
        nota: Number(clampToRange(c.mediaNota, 0, 1000).toFixed(1)),
        color: disciplinePalette[(idx + deckData.notasPorDisciplina.length) % disciplinePalette.length],
      });
    });
  }
  const mun = resolveMunicipalNotaGeral(deckData);
  let munRounded: number | null = null;
  if (mun != null && Number.isFinite(mun) && !rows.some((r) => r.escopo === PRESENTATION19_MUNICIPAL_AVG_LABEL)) {
    munRounded = Number(clampToRange(mun, 0, 1000).toFixed(1));
    rows.push({
      escopo: PRESENTATION19_MUNICIPAL_AVG_LABEL,
      nota: munRounded,
      color: deckData.primaryColor,
    });
  }
  const chart = buildGradesChartRowsYMax(rows, deckData.primaryColor);
  return attachMunicipalReferenceLineToChart(chart);
}

function buildGeneralProficiencyChart(deckData: Presentation19DeckData, rows = deckData.proficienciaGeralPorTurma): ExportChart {
  const maxMath = getProficiencyTableInfo(deckData.serie, "Matemática").maxProficiency;
  const maxOutras = getProficiencyTableInfo(deckData.serie, "Português").maxProficiency;
  const yMax = Math.max(maxMath, maxOutras);

  const mun = resolveMunicipalProficiencyGeral(deckData);
  const baseRows = rows.map((r) => ({
    label: r.label,
    proficiencia: Number(clampToRange(r.proficiencia, 0, yMax).toFixed(1)),
  }));
  const hasMunicipalBar = baseRows.some((r) => r.label === PRESENTATION19_MUNICIPAL_AVG_LABEL);
  const dataRows =
    mun != null && Number.isFinite(mun) && !hasMunicipalBar
      ? [
          ...baseRows,
          {
            label: PRESENTATION19_MUNICIPAL_AVG_LABEL,
            proficiencia: Number(clampToRange(mun, 0, yMax).toFixed(1)),
          },
        ]
      : baseRows;

  return attachMunicipalReferenceLineToChart({
    type: "bar",
    categoryKey: "label",
    valueKeys: [{ key: "proficiencia", label: "Proficiência", color: deckData.primaryColor }],
    data: dataRows,
    yAxis: {
      min: 0,
      max: yMax,
      ticks: buildLinearTicks(0, yMax, 4),
    },
  });
}

function resolveMunicipalProficiencyGeral(deckData: Presentation19DeckData): number | null {
  return mediaMunicipalRelatorioConsolidada(
    deckData.proficienciaMediaMunicipalPorDisciplinaRelatorio ?? undefined,
    deckData.proficienciaDisciplinasRelatorioKeys
  );
}

/** Todas as escolas + barra «Média municipal» no mesmo gráfico. */
function buildGeneralProficiencyChartMultiSchool(deckData: Presentation19DeckData): ExportChart {
  const maxMath = getProficiencyTableInfo(deckData.serie, "Matemática").maxProficiency;
  const maxOutras = getProficiencyTableInfo(deckData.serie, "Português").maxProficiency;
  const yMax = Math.max(maxMath, maxOutras);

  const schoolRows = [...deckData.proficienciaGeralPorTurma]
    .filter((r) => r.label !== PRESENTATION19_MUNICIPAL_AVG_LABEL)
    .map((r) => ({ label: r.label, proficiencia: r.proficiencia }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));

  const mun = resolveMunicipalProficiencyGeral(deckData);
  const dataRows =
    mun != null && Number.isFinite(mun)
      ? [...schoolRows, { label: PRESENTATION19_MUNICIPAL_AVG_LABEL, proficiencia: mun }]
      : schoolRows;

  return attachMunicipalReferenceLineToChart({
    type: "bar",
    categoryKey: "label",
    valueKeys: [{ key: "proficiencia", label: "Proficiência", color: deckData.primaryColor }],
    data: dataRows.map((r) => ({
      label: r.label,
      proficiencia: Number(clampToRange(r.proficiencia, 0, yMax).toFixed(1)),
    })),
    yAxis: {
      min: 0,
      max: yMax,
      ticks: buildLinearTicks(0, yMax, 4),
    },
  });
}

function normEscolaKey(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function buildDefaultProficiencyByDisciplineCharts(deckData: Presentation19DeckData): Array<{ title: string; chart: ExportChart }> {
  return filterPresentation19RealDisciplineRows(deckData.proficienciaPorDisciplinaPorTurma)
    .map((disciplina) => {
      const paletteIdx = getSubjectPaletteIndex(disciplina.disciplina, disciplina.disciplina);
      const yMax = getProficiencyTableInfo(deckData.serie, disciplina.disciplina).maxProficiency;
      const turmaData = disciplina.valuesByTurma.map((v) => ({
        turma: v.turma,
        proficiencia: Number(clampToRange(v.proficiencia, 0, yMax).toFixed(1)),
      }));
      const mun = municipalProficiencyForDiscipline(deckData, disciplina.disciplina);
      const data =
        mun != null && Number.isFinite(mun) && !turmaData.some((t) => t.turma === PRESENTATION19_MUNICIPAL_AVG_LABEL)
          ? [
              ...turmaData,
              {
                turma: PRESENTATION19_MUNICIPAL_AVG_LABEL,
                proficiencia: Number(clampToRange(mun, 0, yMax).toFixed(1)),
              },
            ]
          : turmaData;
      return {
        title: presentation19ProficiencyDisciplineChartTitle(disciplina.disciplina),
        chart: attachMunicipalReferenceLineToChart({
          type: "bar" as const,
          categoryKey: "turma",
          valueKeys: [
            {
              key: "proficiencia",
              label: "Proficiência",
              color: disciplinePalette[paletteIdx % disciplinePalette.length],
            },
          ],
          data,
          yAxis: {
            min: 0,
            max: yMax,
            ticks: buildLinearTicks(0, yMax, 4),
          },
        }),
      };
    });
}

function municipalProficiencyForDiscipline(deckData: Presentation19DeckData, disciplinaNome: string): number | null {
  return mediaMunicipalRelatorioPorDisciplinaResolved(
    deckData.proficienciaMediaMunicipalPorDisciplinaRelatorio ?? undefined,
    disciplinaNome,
    deckData.proficienciaDisciplinasRelatorioKeys
  );
}

/** Por disciplina: todas as escolas + «Média municipal» no mesmo mini-gráfico. */
function buildProficiencyByDisciplineChartsMunicipalCompare(
  deckData: Presentation19DeckData
): Array<{ title: string; chart: ExportChart }> {
  return filterPresentation19RealDisciplineRows(deckData.proficienciaPorDisciplinaPorTurma)
    .map((disciplina) => {
    const paletteIdx = getSubjectPaletteIndex(disciplina.disciplina, disciplina.disciplina);
    const yMax = getProficiencyTableInfo(deckData.serie, disciplina.disciplina).maxProficiency;
    const schoolData = deckData.niveisPorSerie
      .map((n) => {
        const nk = normEscolaKey(n.label);
        const v = disciplina.valuesByTurma.find((t) => normEscolaKey(t.turma) === nk);
        return v
          ? {
              escola: n.label,
              proficiencia: Number(clampToRange(v.proficiencia, 0, yMax).toFixed(1)),
            }
          : null;
      })
      .filter((x): x is { escola: string; proficiencia: number } => x != null)
      .sort((a, b) => a.escola.localeCompare(b.escola, "pt-BR", { sensitivity: "base" }));
    const mun = municipalProficiencyForDiscipline(deckData, disciplina.disciplina);
    const data =
      mun != null && Number.isFinite(mun)
        ? [
            ...schoolData,
            {
              escola: PRESENTATION19_MUNICIPAL_AVG_LABEL,
              proficiencia: Number(clampToRange(mun, 0, yMax).toFixed(1)),
            },
          ]
        : schoolData;
    return {
      title: presentation19ProficiencyDisciplineChartTitle(disciplina.disciplina),
      chart: attachMunicipalReferenceLineToChart({
        type: "bar" as const,
        categoryKey: "escola",
        valueKeys: [
          {
            key: "proficiencia",
            label: "Proficiência",
            color: disciplinePalette[paletteIdx % disciplinePalette.length],
          },
        ],
        data,
        yAxis: {
          min: 0,
          max: yMax,
          ticks: buildLinearTicks(0, yMax, 4),
        },
      }),
    };
  })
    .filter((entry) => entry.chart.data.length > 0);
}

function gradesYMaxFromValues(values: number[]): number {
  const rawMax = Math.max(10, ...values.map((n) => Number(n ?? 0)));
  return Math.min(1000, Math.ceil(rawMax / 5) * 5);
}

function buildDefaultGradesByDisciplineCharts(deckData: Presentation19DeckData): Array<{ title: string; chart: ExportChart }> {
  return filterPresentation19RealDisciplineRows(deckData.notasPorDisciplinaPorTurma).map((disciplina) => {
    const paletteIdx = getSubjectPaletteIndex(disciplina.disciplina, disciplina.disciplina);
    const mun = municipalNotaForDiscipline(deckData, disciplina.disciplina);
    const yMax = gradesYMaxFromValues([
      ...disciplina.valuesByTurma.map((v) => v.mediaNota),
      ...(mun != null && Number.isFinite(mun) ? [mun] : []),
    ]);
    const turmaData = disciplina.valuesByTurma.map((v) => ({
      turma: v.turma,
      nota: Number(clampToRange(v.mediaNota, 0, yMax).toFixed(1)),
    }));
    const data =
      mun != null && Number.isFinite(mun) && !turmaData.some((t) => t.turma === PRESENTATION19_MUNICIPAL_AVG_LABEL)
        ? [
            ...turmaData,
            {
              turma: PRESENTATION19_MUNICIPAL_AVG_LABEL,
              nota: Number(clampToRange(mun, 0, yMax).toFixed(1)),
            },
          ]
        : turmaData;
    return {
      title: presentation19GradesDisciplineChartTitle(disciplina.disciplina),
      chart: attachMunicipalReferenceLineToChart({
        type: "bar" as const,
        categoryKey: "turma",
        valueKeys: [
          {
            key: "nota",
            label: "Nota média",
            color: disciplinePalette[paletteIdx % disciplinePalette.length],
          },
        ],
        data,
        yAxis: {
          min: 0,
          max: yMax,
          ticks: buildLinearTicks(0, yMax, 4),
          scaleLabel: "nota",
        },
      }),
    };
  });
}

function municipalNotaForDiscipline(deckData: Presentation19DeckData, disciplinaNome: string): number | null {
  return mediaMunicipalRelatorioPorDisciplinaResolved(
    deckData.notaMediaMunicipalPorDisciplinaRelatorio ?? undefined,
    disciplinaNome,
    deckData.notaDisciplinasRelatorioKeys
  );
}

function resolveMunicipalNotaGeral(deckData: Presentation19DeckData): number | null {
  return mediaMunicipalRelatorioConsolidada(
    deckData.notaMediaMunicipalPorDisciplinaRelatorio ?? undefined,
    deckData.notaDisciplinasRelatorioKeys
  );
}

function buildGradesByDisciplineChartsMunicipalCompare(
  deckData: Presentation19DeckData
): Array<{ title: string; chart: ExportChart }> {
  return filterPresentation19RealDisciplineRows(deckData.notasPorDisciplinaPorTurma)
    .map((disciplina) => {
    const paletteIdx = getSubjectPaletteIndex(disciplina.disciplina, disciplina.disciplina);
    const schoolData = deckData.niveisPorSerie
      .map((n) => {
        const nk = normEscolaKey(n.label);
        const v = disciplina.valuesByTurma.find((t) => normEscolaKey(t.turma) === nk);
        return v ? { escola: n.label, nota: v.mediaNota } : null;
      })
      .filter((x): x is { escola: string; nota: number } => x != null)
      .sort((a, b) => a.escola.localeCompare(b.escola, "pt-BR", { sensitivity: "base" }));
    const mun = municipalNotaForDiscipline(deckData, disciplina.disciplina);
    const yMax = gradesYMaxFromValues([
      ...schoolData.map((s) => s.nota),
      ...(mun != null && Number.isFinite(mun) ? [mun] : []),
    ]);
    const data =
      mun != null && Number.isFinite(mun)
        ? [
            ...schoolData.map((s) => ({
              escola: s.escola,
              nota: Number(clampToRange(s.nota, 0, yMax).toFixed(1)),
            })),
            {
              escola: PRESENTATION19_MUNICIPAL_AVG_LABEL,
              nota: Number(clampToRange(mun, 0, yMax).toFixed(1)),
            },
          ]
        : schoolData.map((s) => ({
            escola: s.escola,
            nota: Number(clampToRange(s.nota, 0, yMax).toFixed(1)),
          }));
    return {
      title: presentation19GradesDisciplineChartTitle(disciplina.disciplina),
      chart: attachMunicipalReferenceLineToChart({
        type: "bar" as const,
        categoryKey: "escola",
        valueKeys: [
          {
            key: "nota",
            label: "Nota média",
            color: disciplinePalette[paletteIdx % disciplinePalette.length],
          },
        ],
        data,
        yAxis: {
          min: 0,
          max: yMax,
          ticks: buildLinearTicks(0, yMax, 4),
          scaleLabel: "nota",
        },
      }),
    };
  })
    .filter((entry) => entry.chart.data.length > 0);
}

function buildProficiencyGeneralTableRows(deckData: Presentation19DeckData): Array<Array<string | number>> {
  const escolaMulti = isMunicipalMultiSchool(deckData);
  const hasMunicipalProf = resolveMunicipalProficiencyGeral(deckData) != null;
  const out: Array<Array<string | number>> = [];
  const medLabel = escolaMulti || hasMunicipalProf ? PRESENTATION19_MUNICIPAL_AVG_LABEL : "Média geral";
  const profMedResumo =
    escolaMulti || hasMunicipalProf
      ? resolveMunicipalProficiencyGeral(deckData)
      : deckData.proficienciaGeralPorTurma.length === 1
        ? deckData.proficienciaGeralPorTurma[0]?.proficiencia
        : null;
  if (profMedResumo != null && Number.isFinite(profMedResumo)) {
    out.push([medLabel, Number(profMedResumo).toFixed(1).replace(".", ",")]);
  }
  for (const r of deckData.proficienciaGeralPorTurma) {
    if (r.label === PRESENTATION19_MUNICIPAL_AVG_LABEL) continue;
    out.push([r.label, Number(r.proficiencia).toFixed(1).replace(".", ",")]);
  }
  if (out.length === 0) out.push(["—", "Sem dados de proficiência"]);
  return out;
}

function buildGradesTableRows(deckData: Presentation19DeckData): Array<Array<string | number>> {
  const escolaMulti = isMunicipalMultiSchool(deckData);
  const hasMunicipalNota = resolveMunicipalNotaGeral(deckData) != null;
  const out: Array<Array<string | number>> = [];
  const medLabel = escolaMulti || hasMunicipalNota ? PRESENTATION19_MUNICIPAL_AVG_LABEL : "Média geral";
  const notaMedResumo =
    escolaMulti || hasMunicipalNota ? resolveMunicipalNotaGeral(deckData) : deckData.mediaNotaGeral;
  if (notaMedResumo != null && Number.isFinite(notaMedResumo)) {
    out.push([medLabel, Number(notaMedResumo).toFixed(1).replace(".", ",")]);
  }
  if (!escolaMulti) {
    for (const d of deckData.notasPorDisciplina) {
      out.push([d.disciplina, Number(d.mediaNota).toFixed(1).replace(".", ",")]);
    }
  }
  for (const c of deckData.notasPorCategoria) {
    out.push([c.label, Number(c.mediaNota).toFixed(1).replace(".", ",")]);
  }
  if (out.length === 0) out.push(["—", "Sem dados de nota"]);
  return out;
}

export function buildSlideSpec(deckData: Presentation19DeckData): Presentation19ExportSpec {
  const catLabel = comparisonColumnLabel(deckData.comparisonAxis);
  const multiSchool = isMunicipalMultiSchool(deckData);

  const presenceChunks = chunkFlat(deckData.presencaPorSerie, MAX_CATEGORY_ROWS_PER_SLIDE);
  const presenceTableSlides: Array<Omit<Presentation19SlideSpec, "index">> = presenceChunks.map((chunk) => ({
    kind: "presence-table" as const,
    table: {
      columns: [catLabel, "Total de Alunos", "Total de Avaliados", "Presença Média (%)", "Alunos Faltosos"],
      rows: chunk.map((r) => [
        r.label,
        Math.round(Number(r.totalAlunos ?? 0)),
        Math.round(Number(r.totalPresentes ?? 0)),
        formatPctOneDecimalPtBr(Number(r.presencaMediaPct ?? 0)),
        Math.round(Number(r.alunosFaltosos ?? 0)),
      ]),
    },
    presencePctValues: chunk.map((r) => Number(r.presencaMediaPct ?? 0)),
  }));

  const presenceChartSlides: Array<Omit<Presentation19SlideSpec, "index">> = presenceChunks.map((chunk) => ({
    kind: "presence-chart" as const,
    chart: buildPresenceChart(deckData, chunk),
  }));

  const levelsTableRowModels = buildLevelsTableRows(deckData, multiSchool);
  const levelsTableTuples = levelsTableRowModels.map(niveisRowToTableRow);
  const niveisChunks = chunkFlat(levelsTableTuples, MAX_CATEGORY_ROWS_PER_SLIDE);
  const levelsTableSlides: Presentation19SlideSpec[] = niveisChunks.map((chunk) => ({
    index: 0,
    kind: "levels-table" as const,
    escolaNome: "GERAL",
    table: {
      columns: [catLabel, "Abaixo do Básico", "Básico", "Adequado", "Avançado", "Total"],
      rows: chunk.map((row) => [...row]),
    },
  }));

  const levelsChartSlides: Presentation19SlideSpec[] = multiSchool
    ? [
        {
          index: 0,
          kind: "levels-chart" as const,
          chart: buildLevelsComparisonChartMultiSchool(deckData),
        },
      ]
    : [
        {
          index: 0,
          kind: "levels-chart" as const,
          chart: buildLevelsChart(deckData),
        },
      ];

  const proficiencyDiscChartsAll = expandDisciplineChartsWithCategoryChunks(
    multiSchool
      ? buildProficiencyByDisciplineChartsMunicipalCompare(deckData)
      : buildDefaultProficiencyByDisciplineCharts(deckData),
    MAX_CATEGORY_ROWS_PER_SLIDE
  );

  const profGeralChartSlides: Presentation19SlideSpec[] = multiSchool
    ? [
        {
          index: 0,
          kind: "proficiency-general-chart" as const,
          chart: buildGeneralProficiencyChartMultiSchool(deckData),
        },
      ]
    : chunkFlat(deckData.proficienciaGeralPorTurma, MAX_CATEGORY_ROWS_PER_SLIDE).map((chunk) => ({
        index: 0,
        kind: "proficiency-general-chart" as const,
        chart: buildGeneralProficiencyChart(deckData, chunk),
      }));

  const proficiencyDiscChartChunks = chunkFlat(proficiencyDiscChartsAll, MAX_PROF_DISC_CHARTS_PER_SLIDE);
  const proficiencyByDisciplineSlides: Presentation19SlideSpec[] =
    proficiencyDiscChartChunks.length > 0
      ? proficiencyDiscChartChunks.map((chunk) => ({
          index: 0,
          kind: "proficiency-by-discipline-chart" as const,
          charts: chunk,
        }))
      : [];

  const gradesDiscChartsAll = expandDisciplineChartsWithCategoryChunks(
    multiSchool
      ? buildGradesByDisciplineChartsMunicipalCompare(deckData)
      : buildDefaultGradesByDisciplineCharts(deckData),
    MAX_CATEGORY_ROWS_PER_SLIDE
  );
  const gradesDiscChartChunks = chunkFlat(gradesDiscChartsAll, MAX_PROF_DISC_CHARTS_PER_SLIDE);
  const gradesByDisciplineSlides: Presentation19SlideSpec[] =
    gradesDiscChartChunks.length > 0
      ? gradesDiscChartChunks.map((chunk) => ({
          index: 0,
          kind: "grades-by-discipline-chart" as const,
          charts: chunk,
        }))
      : [];

  const questoesToTableRows = (questoes: SlideQuestionRow[]) =>
    questoes.map((q) => [
      q.questao,
      q.habilidade,
      String(q.habilidadeDescricao ?? "—"),
      `${q.percentualAcertos.toFixed(1).replace(".", ",")}%`,
    ]);

  const questionDescriptorLabel = (habilidadeCodigoRaw: string, questao: number): string => {
    const h = String(habilidadeCodigoRaw ?? "").trim();
    if (!h || h === "—") return `Q${questao}`;
    // Padrão comum: "D16 ..." — usar o primeiro token como descritor
    const first = h.split(/\s+/)[0]?.trim() ?? "";
    if (first.length >= 2 && first.length <= 12) return first;
    return h.length > 12 ? h.slice(0, 12) : h;
  };

  const prepareQuestionsAccuracyRows = (rows: SlideQuestionRow[]): SlideQuestionRow[] =>
    (rows ?? [])
      .filter((r) => Number(r.questao) > 0)
      .slice()
      .sort((a, b) => Number(a.questao) - Number(b.questao));

  const buildQuestionsAccuracyChartFromRows = (list: SlideQuestionRow[]): ExportChart => ({
    type: "bar",
    orientation: "vertical",
    categoryKey: "descritor",
    valueKeys: [{ key: "percentual", label: "% Acertos", color: "#64748B" }],
    data: list.map((r) => {
      const pct = Math.max(0, Math.min(100, Number(r.percentualAcertos) || 0));
      return {
        descritor: questionDescriptorLabel(String(r.habilidade ?? ""), Number(r.questao)),
        percentual: Math.round(pct * 10) / 10,
        color: pct >= 70 ? "#22C55E" : "#94A3B8",
      };
    }),
    yAxis: { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], scaleLabel: "% de acertos" },
  });

  // Regra: só destacar questões com >= 70% de acertos (verde). O resto fica sem cor.
  const questionLevelsForChunk = (questChunk: SlideQuestionRow[]): Array<"adequado" | undefined> =>
    questChunk.map((q) => (Number(q.percentualAcertos) >= 70 ? "adequado" : undefined));

  const questionSlidesFromDeck: Presentation19SlideSpec[] = [];
  const serieDeckHint = deckData.serie?.trim() || "GERAL";

  if (deckData.questoesTabelaGeral.length > 0) {
    const geralQuestChunks = chunkPresentation19SlideQuestionRows(deckData.questoesTabelaGeral);
    geralQuestChunks.forEach((questChunk, pageIdx) => {
      const rows = questoesToTableRows(questChunk);
      const questionRowLevels = questionLevelsForChunk(questChunk);
      questionSlidesFromDeck.push({
        index: 0,
        kind: "questions-table" as const,
        table: {
          columns: ["Questão", "Habilidade", "Descrição", "% Acertos"],
          rows,
        },
        questionRowLevels,
        ...(geralQuestChunks.length > 1
          ? { questionsPage: { current: pageIdx + 1, total: geralQuestChunks.length } }
          : {}),
        questionsSubsection: { kind: "geral" },
      });
    });
  }
  for (const bloco of deckData.questoesPorSerie) {
    if (bloco.questoes.length === 0) continue;
    const serieLabel = String(bloco.serie ?? "").trim() || "—";
    questionSlidesFromDeck.push({
      index: 0,
      kind: "questions-turma-cover" as const,
      serieLabel,
      turmaNome: "Geral da série",
    });
    const serieQuestChunks = chunkPresentation19SlideQuestionRows(bloco.questoes);
    serieQuestChunks.forEach((questChunk, pageIdx) => {
      const rows = questoesToTableRows(questChunk);
      const questionRowLevels = questionLevelsForChunk(questChunk);
      questionSlidesFromDeck.push({
        index: 0,
        kind: "questions-table" as const,
        table: {
          columns: ["Questão", "Habilidade", "Descrição", "% Acertos"],
          rows,
        },
        questionRowLevels,
        ...(serieQuestChunks.length > 1
          ? { questionsPage: { current: pageIdx + 1, total: serieQuestChunks.length } }
          : {}),
        questionsSubsection: { kind: "serie-geral", serieLabel },
      });
    });
  }
  for (const bloco of deckData.questoesPorTurma) {
    if (bloco.questoes.length === 0) continue;
    const serieLabel = String(bloco.serieTurma ?? deckData.serie ?? "").trim() || "—";
    questionSlidesFromDeck.push({
      index: 0,
      kind: "questions-turma-cover" as const,
      serieLabel,
      turmaNome: bloco.turma,
    });
    const turmaQuestChunks = chunkPresentation19SlideQuestionRows(bloco.questoes);
    turmaQuestChunks.forEach((questChunk, pageIdx) => {
      const rows = questoesToTableRows(questChunk);
      const questionRowLevels = questionLevelsForChunk(questChunk);
      questionSlidesFromDeck.push({
        index: 0,
        kind: "questions-table" as const,
        table: {
          columns: ["Questão", "Habilidade", "Descrição", "% Acertos"],
          rows,
        },
        questionRowLevels,
        ...(turmaQuestChunks.length > 1
          ? { questionsPage: { current: pageIdx + 1, total: turmaQuestChunks.length } }
          : {}),
        questionsSubsection: { kind: "turma", turmaNome: bloco.turma },
      });
    });
  }

  const slides: Presentation19SlideSpec[] = [];
  let idx = 1;
  const push = <S extends Omit<Presentation19SlideSpec, "index">>(slide: S) => {
    slides.push({ ...slide, index: idx } as Presentation19SlideSpec);
    idx += 1;
  };

  push({ kind: "cover-main" });
  push({ kind: "cover-school" });
  push({ kind: "metric-total-students" });
  push({ kind: "cover-segment" });

  for (const s of presenceTableSlides) {
    if (s.kind === "presence-table") push(s);
  }
  for (const s of presenceChartSlides) {
    if (s.kind === "presence-chart") push(s);
  }

  push({ kind: "section-levels" });
  push({ kind: "levels-guide" });
  for (const s of levelsTableSlides) {
    if (s.kind === "levels-table") push(s);
  }
  for (const s of levelsChartSlides) {
    if (s.kind === "levels-chart") push(s);
  }

  push({ kind: "section-proficiency" });
  push({
    kind: "proficiency-general-table",
    table: {
      columns: ["Escopo", "Proficiência"],
      rows: buildProficiencyGeneralTableRows(deckData),
    },
  });
  for (const s of profGeralChartSlides) {
    if (s.kind === "proficiency-general-chart") push(s);
  }
  for (const s of proficiencyByDisciplineSlides) {
    if (s.kind === "proficiency-by-discipline-chart") push(s);
  }

  push({ kind: "section-grades" });
  push({
    kind: "grades-table",
    table: {
      columns: ["Escopo", "Média da nota"],
      rows: buildGradesTableRows(deckData),
    },
  });
  if (deckData.schoolMissingRegisteredTurma) {
    push({ kind: "grades-no-turma-notice" });
  }
  if (multiSchool) {
    push({ kind: "grades-chart", chart: buildGradesChartMunicipalCompare(deckData) });
  } else {
    push({ kind: "grades-chart", chart: buildGradesChart(deckData) });
  }
  for (const s of gradesByDisciplineSlides) {
    if (s.kind === "grades-by-discipline-chart") push(s);
  }

  push({ kind: "section-questions" });
  // No municipal (comparação por escola), evitar capas extras (“[SÉRIE]” e “[TURMA]”)
  // logo após a seção de questões: elas poluem o fluxo e não agregam informação.
  if (!multiSchool) {
    push({ kind: "dynamic-series-cover" });
    push({ kind: "dynamic-class-cover" });
  }

  for (const s of questionSlidesFromDeck) {
    if (s.kind === "questions-table" || s.kind === "questions-turma-cover") push(s);
  }

  // Ao final das questões: gráfico de % acertos por descritor (verde >= 70%), até 9 barras por slide.
  const baseForAccuracy =
    deckData.questoesTabelaGeral.length > 0
      ? { rows: deckData.questoesTabelaGeral }
      : deckData.questoesPorSerie.length === 1
        ? { rows: deckData.questoesPorSerie[0]!.questoes }
        : deckData.questoesPorTurma.length === 1
          ? { rows: deckData.questoesPorTurma[0]!.questoes }
          : null;

  if (baseForAccuracy) {
    const accuracyRows = prepareQuestionsAccuracyRows(baseForAccuracy.rows);
    if (accuracyRows.length > 0) {
      const chunks = chunkFlat(accuracyRows, MAX_ACCURACY_CHART_BARS_PER_SLIDE);
      chunks.forEach((chunk, pageIdx) => {
        push({
          kind: "questions-accuracy-chart",
          chart: buildQuestionsAccuracyChartFromRows(chunk),
          ...(chunks.length > 1 ? { accuracyPage: { current: pageIdx + 1, total: chunks.length } } : {}),
        });
      });
    }
  }

  push({ kind: "thank-you" });

  return { deckData, slides };
}
