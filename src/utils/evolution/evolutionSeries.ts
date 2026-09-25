import type { EvolutionData } from '@/components/evolution/EvolutionChart';

export interface EvolutionMetricRow {
  name: string;
  [key: string]: string | number | null | undefined;
}

export interface EvolutionComboSeries {
  evaluationNames: string[];
  values: number[];
  /** Percentual do backend vs. a avaliação anterior. null na primeira ou se não veio na API. */
  variations: Array<number | null>;
  colors: string[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Une linhas com o mesmo nome. Não preenche variação ausente com recálculo local. */
export function mergeEvolutionRows(rows: EvolutionData[]): EvolutionMetricRow[] {
  const map = new Map<string, EvolutionMetricRow>();
  for (const row of rows) {
    const key = (row?.name || 'Geral').trim();
    const current = map.get(key) || { name: key };
    const merged: EvolutionMetricRow = { name: key };

    for (let i = 1; i <= 10; i++) {
      const etapaKey = `etapa${i}`;
      const incoming = row[etapaKey];
      const previous = current[etapaKey];
      merged[etapaKey] = isFiniteNumber(incoming)
        ? incoming
        : isFiniteNumber(previous)
          ? previous
          : undefined;
    }

    for (let i = 1; i <= 9; i++) {
      const variacaoKey = `variacao_${i}_${i + 1}`;
      const incoming = row[variacaoKey];
      const previous = current[variacaoKey];
      merged[variacaoKey] = isFiniteNumber(incoming)
        ? incoming
        : isFiniteNumber(previous)
          ? previous
          : undefined;
    }

    map.set(key, merged);
  }
  return [...map.values()];
}

/**
 * Pontos do gráfico. A variação é só `variacao_N_N+1` gravada a partir de
 * evolution.percentage. Se a avaliação anterior estiver oculta, o percentual
 * não é recalculado contra a vizinha visível.
 */
export function readEvolutionComboSeries(
  row: EvolutionMetricRow | undefined,
  evaluationNames: string[],
  colorAt: (index: number) => string,
  hidden?: ReadonlySet<string>
): EvolutionComboSeries {
  const names: string[] = [];
  const values: number[] = [];
  const variations: Array<number | null> = [];
  const colors: string[] = [];
  if (!row) return { evaluationNames: names, values, variations, colors };

  evaluationNames.forEach((name, index) => {
    if (hidden?.has(name)) return;
    const etapa = row[`etapa${index + 1}`];
    if (!isFiniteNumber(etapa)) return;

    let variation: number | null = null;
    if (index > 0 && !hidden?.has(evaluationNames[index - 1])) {
      const stored = row[`variacao_${index}_${index + 1}`];
      variation = isFiniteNumber(stored) ? stored : null;
    }

    names.push(name);
    values.push(etapa);
    variations.push(variation);
    colors.push(colorAt(index));
  });

  return { evaluationNames: names, values, variations, colors };
}

export function rowHasAllEvaluations(row: EvolutionMetricRow | undefined, evaluationCount: number): boolean {
  if (!row || evaluationCount <= 0) return false;
  for (let index = 0; index < evaluationCount; index++) {
    if (!isFiniteNumber(row[`etapa${index + 1}`])) return false;
  }
  return true;
}

/** Última variação consecutiva enviada pelo backend (a mesma da aba Por aluno no par mais recente). */
export function readLastStoredVariation(row: EvolutionMetricRow | undefined): number | null {
  if (!row) return null;
  for (let i = 9; i >= 1; i--) {
    const value = row[`variacao_${i}_${i + 1}`];
    if (isFiniteNumber(value)) return value;
  }
  return null;
}

export function readStageValues(row: EvolutionMetricRow | undefined): number[] {
  if (!row) return [];
  const values: number[] = [];
  for (let i = 1; i <= 10; i++) {
    const value = row[`etapa${i}`];
    if (isFiniteNumber(value)) values.push(value);
  }
  return values;
}

export interface EvolutionGeneralStats {
  media: number;
  variacaoTotal: number | null;
  totalAvaliacoes: number;
  tendencia: 'up' | 'down' | 'stable';
}

export function readGeneralGradeStats(rows: EvolutionData[]): EvolutionGeneralStats | null {
  const merged = mergeEvolutionRows(rows);
  if (merged.length === 0) return null;
  const etapas = readStageValues(merged[0]);
  if (etapas.length === 0) return null;
  const media = etapas.reduce((sum, value) => sum + value, 0) / etapas.length;
  const variacaoTotal = readLastStoredVariation(merged[0]);
  const tendencia: EvolutionGeneralStats['tendencia'] =
    variacaoTotal == null ? 'stable' : variacaoTotal > 0 ? 'up' : variacaoTotal < 0 ? 'down' : 'stable';
  return {
    media,
    variacaoTotal,
    totalAvaliacoes: etapas.length,
    tendencia,
  };
}
