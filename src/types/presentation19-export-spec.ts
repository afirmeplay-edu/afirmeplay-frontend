import type { ProficiencyLevel } from "@/components/evaluations/results/utils/proficiency";
import type { Presentation19DeckData } from "@/types/presentation19-slides";

export type ExportChartType = "bar" | "stackedBar";

export type ExportChartSeries = {
  key: string;
  label: string;
  color: string;
};

export type ExportChartAxis = {
  min: number;
  max: number;
  ticks?: number[];
  scaleLabel?: string;
};

export type ExportChart = {
  type: ExportChartType;
  /** `vertical` = barras verticais (categoria no X). `horizontal` = barras horizontais (categoria no Y). */
  orientation?: "vertical" | "horizontal";
  categoryKey: string;
  valueKeys: ExportChartSeries[];
  data: Array<Record<string, string | number>>;
  yAxis?: ExportChartAxis;
  /** Linha horizontal de referência no topo da barra municipal (valor Y da barra). */
  referenceLineY?: number;
  /** Categoria da barra municipal (`categoryKey`). */
  referenceLineAnchorCategory?: string;
};

export type ExportTable = {
  columns: string[];
  rows: Array<Array<string | number>>;
};

export type Presentation19SlideSpec =
  | { index: 1; kind: "cover-main" }
  | { index: 2; kind: "cover-school" }
  | { index: 3; kind: "metric-total-students" }
  | { index: 4; kind: "cover-segment" }
  | { index: 5; kind: "presence-table"; table: ExportTable; presencePctValues?: number[] }
  | { index: 6; kind: "presence-chart"; chart: ExportChart }
  | { index: number; kind: "section-levels" }
  | { index: number; kind: "levels-guide" }
  | { index: number; kind: "levels-chart"; chart: ExportChart; escolaNome?: string }
  | { index: number; kind: "levels-table"; table: ExportTable; escolaNome?: string }
  | { index: number; kind: "section-proficiency" }
  | { index: number; kind: "proficiency-general-table"; table: ExportTable }
  | { index: number; kind: "proficiency-general-chart"; chart: ExportChart; escolaNome?: string }
  | {
      index: number;
      kind: "proficiency-by-discipline-chart";
      charts: Array<{ title: string; chart: ExportChart }>;
      escolaNome?: string;
    }
  | { index: number; kind: "section-grades" }
  | { index: number; kind: "grades-table"; table: ExportTable }
  | { index: number; kind: "grades-no-turma-notice" }
  | {
      index: number;
      kind: "grades-by-discipline-chart";
      charts: Array<{ title: string; chart: ExportChart }>;
      escolaNome?: string;
    }
  | { index: number; kind: "grades-chart"; chart: ExportChart; escolaNome?: string }
  | { index: number; kind: "section-questions" }
  | { index: number; kind: "dynamic-series-cover" }
  | { index: number; kind: "dynamic-class-cover" }
  | {
      index: number;
      kind: "questions-table";
      table: ExportTable;
      /** Uma classificação por linha de corpo (coluna Questão), alinhada a `table.rows`. */
      questionRowLevels?: Array<ProficiencyLevel | undefined>;
      /** Só preenchido quando há mais de um slide de tabela de questões. */
      questionsPage?: { current: number; total: number };
      /** Bloco "Geral" vs uma turma específica. */
      questionsSubsection?:
        | { kind: "geral" }
        | { kind: "turma"; turmaNome: string }
        /** Escopo município: uma tabela por série (agregado “geral da série”), sem turmas. */
        | { kind: "serie-geral"; serieLabel: string };
    }
  | {
      index: number;
      kind: "questions-turma-cover";
      serieLabel: string;
      turmaNome: string;
    }
  | {
      index: number;
      kind: "questions-accuracy-chart";
      chart: ExportChart;
      /** @deprecated Reservado; subtítulo removido do layout. */
      scopeLabel?: string;
      /** Quando há mais de um slide de gráfico de acertos (máx. 9 barras por página). */
      accuracyPage?: { current: number; total: number };
    }
  | { index: number; kind: "thank-you" };

export type Presentation19ExportSpec = {
  deckData: Presentation19DeckData;
  slides: Presentation19SlideSpec[];
};
