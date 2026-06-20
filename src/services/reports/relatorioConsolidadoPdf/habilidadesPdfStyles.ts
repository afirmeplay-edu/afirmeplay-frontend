import { HABILIDADE_META_THRESHOLD, type HabilidadeMetaVariant } from '@/utils/reports/relatorioConsolidadoHabilidades';

export type HabilidadePdfCardStyle = {
  fill: [number, number, number];
  border: [number, number, number];
  text: [number, number, number];
  divider: [number, number, number];
};

export const HABILIDADES_PDF_CARD_STYLES: Record<HabilidadeMetaVariant, HabilidadePdfCardStyle> = {
  dentro: {
    fill: [236, 253, 245],
    border: [16, 185, 129],
    text: [6, 95, 70],
    divider: [167, 243, 208],
  },
  abaixo: {
    fill: [254, 226, 226],
    border: [239, 68, 68],
    text: [153, 27, 27],
    divider: [254, 202, 202],
  },
};

export function resolveAcertosMetaPdfCellStyle(value: number | null | undefined): {
  fill: [number, number, number];
  text: [number, number, number];
} | null {
  if (value == null || !Number.isFinite(value)) return null;
  const variant: HabilidadeMetaVariant =
    value >= HABILIDADE_META_THRESHOLD ? 'dentro' : 'abaixo';
  const style = HABILIDADES_PDF_CARD_STYLES[variant];
  return { fill: style.fill, text: style.text };
}
