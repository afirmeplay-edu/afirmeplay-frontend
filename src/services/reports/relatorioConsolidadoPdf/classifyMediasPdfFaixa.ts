import type { ProficiencyLevel } from '@/components/evaluations/results/utils/proficiency';
import { getProficiencyLevel } from '@/components/evaluations/results/utils/proficiency';
import type { ProficienciaFaixaKey } from './proficienciaPdfCellStyles';
import {
  MEDIAS_PDF_COLUMN_COLORS,
  PROFICIENCIA_PDF_CELL_COLORS,
  resolveProficienciaNivelStyle,
  type ProficienciaPdfCellStyle,
} from './proficienciaPdfCellStyles';

export type MediasPdfMetricKind = 'nota' | 'proficiencia';

export type MediasValorStyleContext = {
  metricKind: MediasPdfMetricKind;
  disciplina: string;
  /** Nome da coluna de série (ex.: "2º Ano") — refina a tabela de proficiência. */
  serieNome?: string;
  /** Texto da faixa (ex.: "Anos Iniciais (1º ao 5º Ano)"). */
  faixaTitulo?: string;
};

/** Faixas de nota (0–10) alinhadas ao layout de referência do relatório. */
const NOTA_FAIXAS: Record<ProficienciaFaixaKey, { min: number; max: number }> = {
  abaixo_do_basico: { min: 0, max: 3.7 },
  basico: { min: 3.8, max: 5.4 },
  adequado: { min: 5.5, max: 7.9 },
  avancado: { min: 8, max: 10 },
};

const PROFICIENCIA_MEDIA_INICIAIS: Record<ProficienciaFaixaKey, { min: number; max: number }> = {
  abaixo_do_basico: { min: 0, max: 162 },
  basico: { min: 163, max: 212 },
  adequado: { min: 213, max: 262 },
  avancado: { min: 263, max: 375 },
};

const PROFICIENCIA_MEDIA_FINAIS: Record<ProficienciaFaixaKey, { min: number; max: number }> = {
  abaixo_do_basico: { min: 0, max: 224.99 },
  basico: { min: 225, max: 299.99 },
  adequado: { min: 300, max: 349.99 },
  avancado: { min: 350, max: 425 },
};

function isGeralDisciplina(disciplina: string): boolean {
  return disciplina.trim().toUpperCase() === 'GERAL';
}

function isAnosFinaisFaixa(faixaTitulo?: string): boolean {
  const t = (faixaTitulo ?? '').toLowerCase();
  return t.includes('anos finais') || t.includes('ensino médio') || t.includes('medio');
}

function classifyByRanges(
  valor: number,
  ranges: Record<ProficienciaFaixaKey, { min: number; max: number }>
): ProficienciaFaixaKey {
  if (valor <= ranges.abaixo_do_basico.max) return 'abaixo_do_basico';
  if (valor <= ranges.basico.max) return 'basico';
  if (valor <= ranges.adequado.max) return 'adequado';
  return 'avancado';
}

function classifyNotaFaixa(nota: number): ProficienciaFaixaKey {
  return classifyByRanges(nota, NOTA_FAIXAS);
}

function classifyProficienciaGeralFaixa(valor: number, faixaTitulo?: string): ProficienciaFaixaKey {
  const ranges = isAnosFinaisFaixa(faixaTitulo)
    ? PROFICIENCIA_MEDIA_FINAIS
    : PROFICIENCIA_MEDIA_INICIAIS;
  return classifyByRanges(valor, ranges);
}

function classifyProficienciaDisciplinaFaixa(
  valor: number,
  disciplina: string,
  serieNome?: string
): ProficienciaFaixaKey {
  const level = getProficiencyLevel(valor, serieNome, disciplina) as ProficiencyLevel;
  return level;
}

function inferFaixaFromValor(
  valor: number,
  context: MediasValorStyleContext
): ProficienciaFaixaKey {
  if (context.metricKind === 'nota') {
    return classifyNotaFaixa(valor);
  }
  if (isGeralDisciplina(context.disciplina)) {
    return classifyProficienciaGeralFaixa(valor, context.faixaTitulo);
  }
  return classifyProficienciaDisciplinaFaixa(valor, context.disciplina, context.serieNome);
}

/**
 * Cor da célula de série: prioriza nível da API; senão classifica pelo valor (tabelas oficiais).
 */
export function resolveMediasValorCellStyle(
  valor: number | null | undefined,
  nivelLabel: string | null | undefined,
  context?: MediasValorStyleContext
): ProficienciaPdfCellStyle {
  if (valor == null || !Number.isFinite(valor)) {
    return MEDIAS_PDF_COLUMN_COLORS.semDados;
  }

  const fromApi = resolveProficienciaNivelStyle(nivelLabel);
  if (fromApi) return fromApi;

  if (!context) {
    return { fill: [255, 255, 255], text: [17, 24, 39] };
  }

  const faixa = inferFaixaFromValor(valor, context);
  return PROFICIENCIA_PDF_CELL_COLORS[faixa];
}
