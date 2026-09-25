/**
 * Paleta já usada nos gráficos da Evolução.
 * Não introduz cores novas: customColors, variações por disciplina e níveis.
 */
import { EVOLUTION_LEVEL_COLORS, type EvolutionLevelLabel } from '@/utils/evolution/evolutionLevelColors';

export const EVOLUTION_CUSTOM_COLORS = ['#81338A', '#758E4F', '#F6AE2D', '#33658A', '#86BBD8'] as const;

export const EVOLUTION_PROFICIENCY_COLORS = ['#059669', '#10B981', '#34D399', '#6EE7B7', '#A7F3D0'] as const;

/** Cor da linha de evolução (já presente na paleta de barras). */
export const EVOLUTION_LINE_COLOR = '#33658A';

export const EVOLUTION_DELTA_COLORS = {
  up: '#10B981',
  down: '#EF4444',
  flat: '#6B7280',
} as const;

export function getEvolutionColorByIndex(index: number): string {
  return EVOLUTION_CUSTOM_COLORS[index % EVOLUTION_CUSTOM_COLORS.length];
}

export function getEvolutionProficiencyColorByIndex(index: number): string {
  return EVOLUTION_PROFICIENCY_COLORS[index % EVOLUTION_PROFICIENCY_COLORS.length];
}

export function getProficiencyDomain(subjectName: string): [number, number] {
  const name = subjectName.toLowerCase();
  if (name.includes('matemática') || name.includes('matematica') || name.includes('math')) {
    return [0, 425];
  }
  return [0, 400];
}

const SUBJECT_COLOR_MAP: Record<string, string> = {
  matemática: '#0077B6',
  matematica: '#0077B6',
  math: '#0077B6',
  'língua portuguesa': '#E63946',
  'lingua portuguesa': '#E63946',
  português: '#E63946',
  portugues: '#E63946',
  ciências: '#2A9D8F',
  ciencias: '#2A9D8F',
  ciência: '#2A9D8F',
  ciencia: '#2A9D8F',
  história: '#8D6E63',
  historia: '#8D6E63',
  geografia: '#6B8E23',
  inglês: '#6A4C93',
  ingles: '#6A4C93',
  english: '#6A4C93',
  'educação física': '#F4A261',
  'educacao fisica': '#F4A261',
  'educação fisica': '#F4A261',
  'educacao física': '#F4A261',
  física: '#F4A261',
  fisica: '#F4A261',
  arte: '#E76F51',
  art: '#E76F51',
};

function generateColorVariations(baseColor: string): string[] {
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if ([r, g, b].some((channel) => Number.isNaN(channel))) {
    return [baseColor, baseColor, baseColor];
  }
  return [
    `rgb(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)})`,
    baseColor,
    `rgb(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)})`,
  ];
}

export function getSubjectColors(subjectName: string, subjectIndex: number) {
  const match = Object.keys(SUBJECT_COLOR_MAP).find((key) =>
    subjectName.toLowerCase().includes(key.toLowerCase())
  );
  const primaryColor = match
    ? SUBJECT_COLOR_MAP[match]
    : EVOLUTION_CUSTOM_COLORS[subjectIndex % EVOLUTION_CUSTOM_COLORS.length];
  const palette = generateColorVariations(primaryColor);
  return {
    bar: palette[0],
    line: palette[1],
    palette,
    primaryColor,
  };
}

export function getLevelColor(levelName: string): string {
  if (levelName in EVOLUTION_LEVEL_COLORS) {
    return EVOLUTION_LEVEL_COLORS[levelName as EvolutionLevelLabel];
  }
  return '#6B7280';
}
