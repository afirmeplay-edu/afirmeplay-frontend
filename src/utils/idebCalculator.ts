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

/** Par bienal usado na projeção (apenas anos consecutivos do IDEB com nota nos dois) */
export interface BiennialGrowthPair {
  from: number;
  to: number;
  diff: number;
}

export interface GrowthAnalysis {
  years: number[];
  values: number[];
  diffs: number[];
  /** Pares bienais válidos (gap de 2 anos e nota > 0 nos dois) */
  pairs: BiennialGrowthPair[];
  maxDiff: number;
  projectedMeta: number;
  /** true quando existe ao menos um par consecutivo válido para projetar */
  canProject: boolean;
}

export interface HistoricalDisplaySeries {
  years: number[];
  values: number[];
  /** ∆ entre anos consecutivos; null quando algum período não tem nota (ideb <= 0) ou gap ≠ 2 */
  diffs: (number | null)[];
  hasMissingScores: boolean;
}

/** Gap padrão entre edições do IDEB (bienal) */
export const IDEB_BIENNIAL_GAP = 2;

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

/**
 * Verifica se dois períodos adjacentes no histórico formam um par bienal válido
 * (ambos com nota e gap de exatamente 2 anos).
 */
export const isValidBiennialPair = (
  prev: { ano: number; ideb: number | string },
  curr: { ano: number; ideb: number | string }
): boolean => {
  return (
    isValidIdebScore(prev.ideb) &&
    isValidIdebScore(curr.ideb) &&
    curr.ano - prev.ano === IDEB_BIENNIAL_GAP
  );
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
    if (isValidBiennialPair(sorted[i - 1], sorted[i])) {
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
 * Só considera pares adjacentes com nota nos dois anos e gap bienal (2 anos).
 * Anos sem nota (ideb <= 0) não geram ∆ com vizinhos.
 */
export const analyzeHistoricalGrowth = (
  history: Array<{ ano: number; ideb: number | string }>
): GrowthAnalysis => {
  const empty: GrowthAnalysis = {
    years: [],
    values: [],
    diffs: [],
    pairs: [],
    maxDiff: 0,
    projectedMeta: 0,
    canProject: false,
  };

  if (!Array.isArray(history) || history.length === 0) {
    return empty;
  }

  const sorted = [...history].sort((a, b) => a.ano - b.ano);
  const pairs: BiennialGrowthPair[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!isValidBiennialPair(prev, curr)) continue;
    const diff = Number((Number(curr.ideb) - Number(prev.ideb)).toFixed(1));
    pairs.push({ from: prev.ano, to: curr.ano, diff });
  }

  const valid = filterValidIdebHistory(sorted);
  const years = valid.map((h) => h.ano);
  const values = valid.map((h) => Number(h.ideb));
  const diffs = pairs.map((p) => p.diff);

  if (pairs.length === 0 || valid.length === 0) {
    return {
      years,
      values,
      diffs: [],
      pairs: [],
      maxDiff: 0,
      projectedMeta: 0,
      canProject: false,
    };
  }

  const maxDiff = Math.max(...diffs);
  const latestValue = values[values.length - 1] || 0;
  const projectedMeta = Number((latestValue + maxDiff).toFixed(1));

  return {
    years,
    values,
    diffs,
    pairs,
    maxDiff,
    projectedMeta,
    canProject: true,
  };
};

/**
 * Retorna o ∆ do último par bienal válido, ou null se não houver.
 */
export const getLastValidBiennialDiff = (
  history: Array<{ ano: number; ideb: number | string }>
): number | null => {
  const analysis = analyzeHistoricalGrowth(history);
  if (analysis.pairs.length === 0) return null;
  return analysis.pairs[analysis.pairs.length - 1].diff;
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
    difference: difference,
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
