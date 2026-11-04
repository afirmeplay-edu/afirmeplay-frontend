import type {
  MatrizDistribuicao,
  MatrizEscolaSerie,
  SecaoAcertosHabilidade,
  SecaoMatrizDistribuicao,
  SecaoMatrizNumerica,
} from '@/types/relatorio-consolidado';
import { deriveGeralMatrizFromPorDisciplina } from '@/utils/reports/deriveGeralMatrizFromPorDisciplina';

/** Disciplinas reais primeiro (A–Z); GERAL sempre por último. */
export function sortDisciplinasDisponiveis(disciplinas: string[]): string[] {
  const rest = disciplinas.filter((d) => d !== 'GERAL').sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const hasGeral = disciplinas.includes('GERAL');
  return hasGeral ? [...rest, 'GERAL'] : rest;
}

export function defaultDisciplinaTab(disciplinas: string[]): string {
  const sorted = sortDisciplinasDisponiveis(disciplinas);
  return sorted.find((d) => d !== 'GERAL') ?? sorted[0] ?? 'GERAL';
}

export function getMatrizNumerica(secao: SecaoMatrizNumerica | undefined, disc: string): MatrizEscolaSerie | null {
  if (!secao) return null;
  if (disc === 'GERAL') return secao.GERAL ?? null;
  return secao.por_disciplina[disc] ?? null;
}

/**
 * Médias de nota/proficiência: GERAL vem da média de por_disciplina (igual Resultados),
 * não do campo GERAL do relatorio-consolidado.
 */
export function getMatrizMediasNumerica(
  secao: SecaoMatrizNumerica | undefined,
  disc: string
): MatrizEscolaSerie | null {
  if (!secao) return null;
  if (disc === 'GERAL') {
    return deriveGeralMatrizFromPorDisciplina(secao.por_disciplina) ?? secao.GERAL ?? null;
  }
  return secao.por_disciplina[disc] ?? null;
}

export function getMatrizDistribuicao(
  secao: SecaoMatrizDistribuicao | undefined,
  disc: string
): MatrizDistribuicao | null {
  if (!secao) return null;
  if (disc === 'GERAL') return secao.GERAL ?? null;
  return secao.por_disciplina[disc] ?? null;
}

export function getAcertosHabilidadeBloco(
  secao: SecaoAcertosHabilidade | undefined,
  disc: string
): { matriz: MatrizEscolaSerie; por_serie: SecaoAcertosHabilidade['GERAL']['por_serie'] } | null {
  if (!secao) return null;
  if (disc === 'GERAL') return secao.GERAL ?? null;
  return secao.por_disciplina[disc] ?? null;
}

export function matrizHasLinhas(matriz: MatrizEscolaSerie | MatrizDistribuicao | null | undefined): boolean {
  return Boolean(matriz?.linhas?.length);
}
