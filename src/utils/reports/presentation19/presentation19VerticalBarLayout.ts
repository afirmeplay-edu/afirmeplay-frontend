/** Geometria de colunas para gráficos de barras verticais (preview, PDF e PPTX). */

export type P19VerticalBarColumnSlot = {
  colWidth: number;
  slotX: number;
  innerW: number;
  barW: number;
  barX: number;
  labelCx: number;
};

export function resolveP19VerticalBarColumnSlot(
  barsStartX: number,
  barsW: number,
  index: number,
  total: number
): P19VerticalBarColumnSlot {
  const n = Math.max(1, total);
  const colWidth = barsW / n;
  const slotX = barsStartX + index * colWidth;
  const innerPad = Math.min(6, Math.max(1, colWidth * 0.1));
  const innerW = Math.max(2, colWidth - innerPad * 2);
  const barW = Math.max(2, Math.min(innerW * 0.88, 34));
  const barX = slotX + (colWidth - barW) / 2;
  const labelCx = slotX + colWidth / 2;
  return { colWidth, slotX, innerW, barW, barX, labelCx };
}

export function minP19VerticalBarInnerW(barsW: number, total: number): number {
  if (total <= 0) return barsW;
  const colWidth = barsW / total;
  const innerPad = Math.min(6, Math.max(1, colWidth * 0.1));
  return Math.max(2, colWidth - innerPad * 2);
}

/** Espaçamento horizontal entre colunas no preview (escala com o número de barras). */
export function p19VerticalBarGapPx(barCount: number): number {
  if (barCount <= 8) return 12;
  if (barCount <= 14) return 6;
  if (barCount <= 22) return 4;
  return 2;
}
