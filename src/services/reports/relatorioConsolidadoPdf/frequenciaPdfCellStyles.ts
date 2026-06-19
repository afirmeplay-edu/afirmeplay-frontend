import { RELATORIO_CONSOLIDADO_PDF_COLORS } from './drawCoverPage';

/** Cores alinhadas à legenda de frequência (seção 1.2). */
export const FREQUENCIA_PDF_CELL_COLORS = {
  excelente: {
    fill: [34, 197, 94] as [number, number, number],
    text: [255, 255, 255] as [number, number, number],
  },
  regular: {
    fill: [245, 158, 11] as [number, number, number],
    text: [17, 24, 39] as [number, number, number],
  },
  semDados: {
    fill: [255, 255, 255] as [number, number, number],
    text: [107, 114, 128] as [number, number, number],
  },
  taxaGeral: {
    fill: [233, 213, 255] as [number, number, number],
    text: [91, 33, 182] as [number, number, number],
  },
  footerTaxaGeral: {
    fill: [124, 62, 237] as [number, number, number],
    text: [255, 255, 255] as [number, number, number],
  },
  index: RELATORIO_CONSOLIDADO_PDF_COLORS.primary,
  escolaText: RELATORIO_CONSOLIDADO_PDF_COLORS.textDark,
  footerLabel: RELATORIO_CONSOLIDADO_PDF_COLORS.primary,
};

export type FrequenciaCellKind =
  | 'index'
  | 'escola'
  | 'serie'
  | 'taxa_geral'
  | 'footer_label'
  | 'footer_serie'
  | 'footer_taxa_geral';

export function resolveFrequenciaSerieCellStyle(value: number | null | undefined): {
  fill: [number, number, number];
  text: [number, number, number];
} {
  if (value == null || !Number.isFinite(value)) {
    return FREQUENCIA_PDF_CELL_COLORS.semDados;
  }
  if (value >= 100) {
    return FREQUENCIA_PDF_CELL_COLORS.excelente;
  }
  return FREQUENCIA_PDF_CELL_COLORS.regular;
}
