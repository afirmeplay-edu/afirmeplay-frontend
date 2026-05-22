/** Paleta fixa para barras do gráfico "Desempenho por escola" (tela + PDF). */
const RANKING_SCHOOL_BAR_PALETTE = [
  { rgb: [124, 62, 237] as [number, number, number], fill: '#7c3aed' },
  { rgb: [59, 130, 246] as [number, number, number], fill: '#3b82f6' },
  { rgb: [20, 184, 166] as [number, number, number], fill: '#14b8a6' },
  { rgb: [245, 158, 11] as [number, number, number], fill: '#f59e0b' },
  { rgb: [236, 72, 153] as [number, number, number], fill: '#ec4899' },
  { rgb: [34, 197, 94] as [number, number, number], fill: '#22c55e' },
  { rgb: [249, 115, 22] as [number, number, number], fill: '#f97316' },
  { rgb: [99, 102, 241] as [number, number, number], fill: '#6366f1' },
] as const;

export function rankingSchoolBarRgb(index: number): [number, number, number] {
  return RANKING_SCHOOL_BAR_PALETTE[index % RANKING_SCHOOL_BAR_PALETTE.length].rgb;
}

export function rankingSchoolBarFill(index: number): string {
  return RANKING_SCHOOL_BAR_PALETTE[index % RANKING_SCHOOL_BAR_PALETTE.length].fill;
}
