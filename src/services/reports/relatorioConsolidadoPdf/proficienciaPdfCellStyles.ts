import type { FaixaDistribuicao } from '@/types/relatorio-consolidado';

/** Chaves das faixas de proficiência (escala Saeb). */
export type ProficienciaFaixaKey = keyof FaixaDistribuicao;

export type ProficienciaPdfCellStyle = {
  fill: [number, number, number];
  text: [number, number, number];
};

/**
 * Cores oficiais da legenda de proficiência (seção 3.2).
 * Reutilizar nas tabelas de médias e distribuição.
 */
export const PROFICIENCIA_PDF_CELL_COLORS: Record<ProficienciaFaixaKey, ProficienciaPdfCellStyle> = {
  abaixo_do_basico: {
    fill: [220, 38, 38],
    text: [255, 255, 255],
  },
  basico: {
    fill: [251, 191, 36],
    text: [17, 24, 39],
  },
  adequado: {
    fill: [163, 230, 53],
    text: [17, 24, 39],
  },
  avancado: {
    fill: [4, 120, 87],
    text: [255, 255, 255],
  },
};

export const PROFICIENCIA_FAIXA_ORDER: ProficienciaFaixaKey[] = [
  'abaixo_do_basico',
  'basico',
  'adequado',
  'avancado',
];

export type LegendaProficienciaRow = {
  key: ProficienciaFaixaKey;
  label: string;
  description: string;
};

/** Linhas fixas da tabela 3.2 — Legenda de Proficiência. */
export const LEGENDA_PROFICIENCIA_ROWS: LegendaProficienciaRow[] = [
  {
    key: 'abaixo_do_basico',
    label: 'Abaixo do Básico',
    description: 'Domínio insuficiente das habilidades essenciais.',
  },
  {
    key: 'basico',
    label: 'Básico',
    description: 'Desenvolvimento parcial das habilidades esperadas.',
  },
  {
    key: 'adequado',
    label: 'Adequado',
    description: 'Domínio adequado das habilidades para o ano escolar.',
  },
  {
    key: 'avancado',
    label: 'Avançado',
    description: 'Conhecimento e habilidades além do esperado.',
  },
];

const NIVEL_LABEL_TO_KEY: Record<string, ProficienciaFaixaKey> = {
  'abaixo do básico': 'abaixo_do_basico',
  'abaixo do basico': 'abaixo_do_basico',
  básico: 'basico',
  basico: 'basico',
  adequado: 'adequado',
  avançado: 'avancado',
  avancado: 'avancado',
};

/** Resolve rótulo vindo da API (ex.: `media_da_rede_nivel`) para a faixa e estilo PDF. */
export function resolveProficienciaNivelStyle(
  nivelLabel: string | null | undefined
): ProficienciaPdfCellStyle | null {
  if (!nivelLabel?.trim()) return null;
  const key = NIVEL_LABEL_TO_KEY[nivelLabel.trim().toLowerCase()];
  return key ? PROFICIENCIA_PDF_CELL_COLORS[key] : null;
}

export function getProficienciaFaixaStyle(faixa: ProficienciaFaixaKey): ProficienciaPdfCellStyle {
  return PROFICIENCIA_PDF_CELL_COLORS[faixa];
}

/** Coluna MÉDIA das tabelas de nota/proficiência. */
export const MEDIAS_PDF_COLUMN_COLORS = {
  media: {
    fill: [233, 213, 255] as [number, number, number],
    text: [91, 33, 182] as [number, number, number],
  },
  footerMedia: {
    fill: [124, 62, 237] as [number, number, number],
    text: [255, 255, 255] as [number, number, number],
  },
  semDados: {
    fill: [255, 255, 255] as [number, number, number],
    text: [107, 114, 128] as [number, number, number],
  },
};
