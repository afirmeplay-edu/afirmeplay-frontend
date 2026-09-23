/** Paleta única do Leiturômetro ICA (níveis 1–6). Espelho de afirmeplay-leitura-frontend. */

export type IcaLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type PerfilLeitorCode = 'PL1' | 'PL2' | 'PL3' | 'PL4' | 'LI' | 'LF';

export interface IcaLevelStyle {
  level: IcaLevel;
  label: string;
  /** Classe Tailwind da barra (mesmo tom de leiturometro.tsx). */
  bgClass: string;
  hex: string;
  /** Texto sobre o fundo sólido (contraste). */
  fgHex: string;
  /** Classes do badge ICA. */
  tagClass: string;
}

export const ICA_LEVELS: IcaLevelStyle[] = [
  {
    level: 1,
    label: 'Pré-alfabético',
    bgClass: 'bg-red-500',
    hex: '#ef4444',
    fgHex: '#ffffff',
    tagClass: 'bg-red-500 text-white border-red-600',
  },
  {
    level: 2,
    label: 'Alfabético',
    bgClass: 'bg-orange-500',
    hex: '#f97316',
    fgHex: '#ffffff',
    tagClass: 'bg-orange-500 text-white border-orange-600',
  },
  {
    level: 3,
    label: 'Silábico-alfabético',
    bgClass: 'bg-yellow-500',
    hex: '#eab308',
    fgHex: '#1e293b',
    tagClass: 'bg-yellow-500 text-slate-900 border-yellow-600',
  },
  {
    level: 4,
    label: 'Silábico',
    bgClass: 'bg-lime-500',
    hex: '#84cc16',
    fgHex: '#1e293b',
    tagClass: 'bg-lime-500 text-slate-900 border-lime-600',
  },
  {
    level: 5,
    label: 'Silábico com valor',
    bgClass: 'bg-emerald-500',
    hex: '#10b981',
    fgHex: '#ffffff',
    tagClass: 'bg-emerald-500 text-white border-emerald-600',
  },
  {
    level: 6,
    label: 'Alfabético pleno',
    bgClass: 'bg-blue-500',
    hex: '#3b82f6',
    fgHex: '#ffffff',
    tagClass: 'bg-blue-500 text-white border-blue-600',
  },
];

/** PL1–LF alinhados à escala ICA 1–6 (mesma paleta). */
export const PERFIL_LEITOR_TO_ICA: Record<PerfilLeitorCode, IcaLevel> = {
  PL1: 1,
  PL2: 2,
  PL3: 3,
  PL4: 4,
  LI: 5,
  LF: 6,
};

export const ICA_TO_PERFIL_LEITOR: Record<IcaLevel, PerfilLeitorCode> = {
  1: 'PL1',
  2: 'PL2',
  3: 'PL3',
  4: 'PL4',
  5: 'LI',
  6: 'LF',
};

export const PERFIL_LEITOR_LABEL: Record<PerfilLeitorCode, string> = {
  PL1: 'PL1',
  PL2: 'PL2',
  PL3: 'PL3',
  PL4: 'PL4',
  LI: 'Leitor Iniciante',
  LF: 'Leitor Fluente',
};

export const PERFIL_ALFABETOMETRO_LABEL: Record<PerfilLeitorCode, string> = {
  PL1: 'Pré-leitor 1',
  PL2: 'Pré-leitor 2',
  PL3: 'Pré-leitor 3',
  PL4: 'Pré-leitor 4',
  LI: 'Leitor iniciante',
  LF: 'Leitor fluente',
};

export function perfilFromIcaLevel(level?: number | null): PerfilLeitorCode | null {
  if (level == null || level < 1 || level > 6) return null;
  return ICA_TO_PERFIL_LEITOR[level as IcaLevel] ?? null;
}

export function getIcaLevelStyle(level?: string | number | null): IcaLevelStyle | null {
  if (level == null || level === '' || level === '-') return null;
  const num = typeof level === 'number' ? level : parseInt(String(level), 10);
  if (!Number.isFinite(num) || num < 1 || num > 6) return null;
  return ICA_LEVELS[num - 1] ?? null;
}

export function getPerfilLeitorStyle(code: PerfilLeitorCode | string): IcaLevelStyle {
  const ica = PERFIL_LEITOR_TO_ICA[code as PerfilLeitorCode] ?? 1;
  return ICA_LEVELS[ica - 1];
}
