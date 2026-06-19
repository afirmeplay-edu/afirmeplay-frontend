import type { CSSProperties } from 'react';
import type { MediasPdfMetricKind, MediasValorStyleContext } from '@/services/reports/relatorioConsolidadoPdf/classifyMediasPdfFaixa';
import { resolveMediasValorCellStyle } from '@/services/reports/relatorioConsolidadoPdf/classifyMediasPdfFaixa';
import {
  FREQUENCIA_PDF_CELL_COLORS,
  resolveFrequenciaSerieCellStyle,
} from '@/services/reports/relatorioConsolidadoPdf/frequenciaPdfCellStyles';
import { MEDIAS_PDF_COLUMN_COLORS } from '@/services/reports/relatorioConsolidadoPdf/proficienciaPdfCellStyles';

type Rgb = [number, number, number];

export function pdfRgbToCellStyle(fill: Rgb, text: Rgb): CSSProperties {
  return {
    backgroundColor: `rgb(${fill[0]}, ${fill[1]}, ${fill[2]})`,
    color: `rgb(${text[0]}, ${text[1]}, ${text[2]})`,
  };
}

export function getFrequenciaSerieCellStyle(value: number | null | undefined): CSSProperties {
  const { fill, text } = resolveFrequenciaSerieCellStyle(value);
  return pdfRgbToCellStyle(fill, text);
}

export function getFrequenciaTaxaGeralCellStyle(): CSSProperties {
  return pdfRgbToCellStyle(
    FREQUENCIA_PDF_CELL_COLORS.taxaGeral.fill,
    FREQUENCIA_PDF_CELL_COLORS.taxaGeral.text
  );
}

export function getFrequenciaFooterTaxaGeralCellStyle(): CSSProperties {
  return pdfRgbToCellStyle(
    FREQUENCIA_PDF_CELL_COLORS.footerTaxaGeral.fill,
    FREQUENCIA_PDF_CELL_COLORS.footerTaxaGeral.text
  );
}

export function getMediasSerieCellStyle(
  value: number | null | undefined,
  nivelLabel: string | null | undefined,
  context: MediasValorStyleContext
): CSSProperties {
  const { fill, text } = resolveMediasValorCellStyle(value, nivelLabel, context);
  return pdfRgbToCellStyle(fill, text);
}

export function getMediasMediaColumnCellStyle(): CSSProperties {
  return pdfRgbToCellStyle(MEDIAS_PDF_COLUMN_COLORS.media.fill, MEDIAS_PDF_COLUMN_COLORS.media.text);
}

export function getMediasFooterMediaCellStyle(): CSSProperties {
  return pdfRgbToCellStyle(
    MEDIAS_PDF_COLUMN_COLORS.footerMedia.fill,
    MEDIAS_PDF_COLUMN_COLORS.footerMedia.text
  );
}

export type { MediasPdfMetricKind, MediasValorStyleContext };
