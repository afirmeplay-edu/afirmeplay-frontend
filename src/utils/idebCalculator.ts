/**
 * Utilitários para cálculo de IDEB e análise de metas
 * Baseado em afirme-calculo-de-meta/utils/idebCalculator.ts
 */

/**
 * Calcula o IDEB a partir das proficiências em Português e Matemática e o fluxo
 * @param port - Proficiência em Português
 * @param math - Proficiência em Matemática
 * @param fluxo - Taxa de aprovação/fluxo (0-1 ou 0-100)
 * @returns IDEB calculado
 */
export const calculateIdeb = (port: number, math: number, fluxo: number): number => {
  const averageProficiency = (port + math) / 2;
  const validFluxo = fluxo > 1 ? fluxo / 100 : fluxo;
  return Number((averageProficiency * validFluxo).toFixed(2));
};

export interface GrowthAnalysis {
  years: number[];
  values: number[];
  diffs: number[];
  maxDiff: number;
  projectedMeta: number;
}

export interface HistoricalDisplaySeries {
  years: number[];
  values: number[];
  /** ∆ entre anos consecutivos; null quando algum período não tem nota (ideb <= 0) */
  diffs: (number | null)[];
  hasMissingScores: boolean;
}

/** IDEB 0 indica período sem nota — usado só para demonstração, não entra no cálculo */
export const isValidIdebScore = (ideb: number | string): boolean => {
  const n = Number(ideb);
  return !Number.isNaN(n) && n > 0;
};

export const filterValidIdebHistory = <T extends { ano: number; ideb: number | string }>(
  history: T[]
): T[] => {
  return [...history]
    .filter((h) => isValidIdebScore(h.ideb))
    .sort((a, b) => a.ano - b.ano);
};

export const getLatestValidIdebFromHistory = (
  history: Array<{ ano: number; ideb: number | string }>
): { ano: number; ideb: number } | null => {
  const valid = filterValidIdebHistory(history);
  if (valid.length === 0) return null;
  const latest = valid[valid.length - 1];
  return { ano: latest.ano, ideb: Number(latest.ideb) };
};

/** Série completa para exibição (inclui períodos com nota 0) */
export const buildHistoricalDisplaySeries = (
  history: Array<{ ano: number; ideb: number | string }>
): HistoricalDisplaySeries => {
  if (!Array.isArray(history) || history.length === 0) {
    return { years: [], values: [], diffs: [], hasMissingScores: false };
  }

  const sorted = [...history].sort((a, b) => a.ano - b.ano);
  const years = sorted.map((h) => h.ano);
  const values = sorted.map((h) => Number(h.ideb) || 0);
  const diffs: (number | null)[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prevValid = isValidIdebScore(sorted[i - 1].ideb);
    const currValid = isValidIdebScore(sorted[i].ideb);
    if (prevValid && currValid) {
      diffs.push(Number((values[i] - values[i - 1]).toFixed(1)));
    } else {
      diffs.push(null);
    }
  }

  return {
    years,
    values,
    diffs,
    hasMissingScores: sorted.some((h) => !isValidIdebScore(h.ideb)),
  };
};

/**
 * Analisa o crescimento histórico e projeta uma meta baseada no maior crescimento.
 * Ignora anos com ideb <= 0 (períodos sem nota).
 */
export const analyzeHistoricalGrowth = (history: Array<{ ano: number; ideb: number | string }>): GrowthAnalysis => {
  const sorted = filterValidIdebHistory(history);
  if (sorted.length === 0) {
    return { years: [], values: [], diffs: [], maxDiff: 0, projectedMeta: 0 };
  }

  const years = sorted.map((h) => h.ano);
  const values = sorted.map((h) => Number(h.ideb));
  const diffs: number[] = [];

  for (let i = 1; i < values.length; i++) {
    const d = Number((values[i] - values[i - 1]).toFixed(1));
    diffs.push(d);
  }

  const maxDiff = diffs.length > 0 ? Math.max(...diffs) : 0;
  const latestValue = values[values.length - 1] || 0;
  const projectedMeta = Number((latestValue + maxDiff).toFixed(1));

  return {
    years,
    values,
    diffs,
    maxDiff,
    projectedMeta,
  };
};

/**
 * Calcula o esforço necessário para atingir uma meta
 * @param current - IDEB atual
 * @param target - IDEB meta desejado
 * @param previousGrowth - Crescimento anterior (diferença entre últimos dois valores)
 * @returns Percentual de esforço necessário e diferença absoluta
 */
export const calculateGrowthNeeded = (
  current: number, 
  target: number, 
  previousGrowth: number
): { percent: number; difference: number } => {
  if (!current || current <= 0) return { percent: 0, difference: 0 };
  const difference = Number((target - current).toFixed(2));
  
  const basePercent = (difference / current) * 100;
  // Incremento estratégico de 1% se houve estagnação
  const increment = previousGrowth <= 0 ? 1.0 : 0;
  
  return {
    percent: Number((basePercent + increment).toFixed(2)),
    difference: difference
  };
};

/**
 * Retorna o conceito IQEAL baseado na nota
 * @param nota - Nota do IQEAL (0-1)
 * @returns Conceito de 1 a 5
 */
export const getIqealConceito = (nota: number): number => {
  if (nota <= 0.1) return 1;
  if (nota <= 0.3) return 2;
  if (nota <= 0.5) return 3;
  if (nota <= 0.7) return 4;
  return 5;
};
