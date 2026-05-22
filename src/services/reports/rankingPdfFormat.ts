export function fmtPtNum(value: unknown, digits = 1): string {
  return Number(value || 0).toFixed(digits).replace('.', ',');
}

export function formatParticipation(rate: unknown, participating: unknown, total: unknown): string {
  return `${fmtPtNum(rate)}% (${Number(participating || 0)}/${Number(total || 0)})`;
}

export function formatAdequadoAvancado(count: unknown, pct: unknown): string {
  return `${Number(count ?? 0)} alunos · ${fmtPtNum(pct)}%`;
}
