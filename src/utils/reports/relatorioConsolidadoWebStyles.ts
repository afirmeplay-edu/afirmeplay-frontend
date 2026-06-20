import type { CSSProperties } from 'react';
import type { MediasPdfMetricKind, MediasValorStyleContext } from '@/services/reports/relatorioConsolidadoPdf/classifyMediasPdfFaixa';
import { resolveMediasValorCellStyle } from '@/services/reports/relatorioConsolidadoPdf/classifyMediasPdfFaixa';
import {
  FREQUENCIA_PDF_CELL_COLORS,
  resolveFrequenciaSerieCellStyle,
} from '@/services/reports/relatorioConsolidadoPdf/frequenciaPdfCellStyles';
import { HABILIDADES_PDF_CARD_STYLES } from '@/services/reports/relatorioConsolidadoPdf/habilidadesPdfStyles';
import { MEDIAS_PDF_COLUMN_COLORS } from '@/services/reports/relatorioConsolidadoPdf/proficienciaPdfCellStyles';
import {
  getProficienciaFaixaStyle,
  type ProficienciaFaixaKey,
} from '@/services/reports/relatorioConsolidadoPdf/proficienciaPdfCellStyles';
import { HABILIDADE_META_THRESHOLD } from '@/utils/reports/relatorioConsolidadoHabilidades';

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

/** Verde >= 60% / vermelho < 60% (mesmas cores dos cards de habilidades). */
export function getAcertosMetaCellStyle(value: number | null | undefined): CSSProperties | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const variant = value >= HABILIDADE_META_THRESHOLD ? 'dentro' : 'abaixo';
  const style = HABILIDADES_PDF_CARD_STYLES[variant];
  return pdfRgbToCellStyle(style.fill, style.text);
}

export function getDistribuicaoFaixaLabelStyle(faixa: ProficienciaFaixaKey): CSSProperties {
  const { fill, text } = getProficienciaFaixaStyle(faixa);
  return pdfRgbToCellStyle(fill, text);
}

export function getDistribuicaoMediaColumnStyle(): CSSProperties {
  return pdfRgbToCellStyle(MEDIAS_PDF_COLUMN_COLORS.media.fill, MEDIAS_PDF_COLUMN_COLORS.media.text);
}

export function getDistribuicaoFooterCellStyle(): CSSProperties {
  return pdfRgbToCellStyle([243, 232, 255], [91, 33, 182]);
}

export function getDistribuicaoFooterLabelStyle(): CSSProperties {
  return { color: 'rgb(91, 33, 182)', fontWeight: 700 };
}

export function getDistribuicaoFooterTotalStyle(): CSSProperties {
  return pdfRgbToCellStyle(MEDIAS_PDF_COLUMN_COLORS.footerMedia.fill, MEDIAS_PDF_COLUMN_COLORS.footerMedia.text);
}

export type { MediasPdfMetricKind, MediasValorStyleContext };
