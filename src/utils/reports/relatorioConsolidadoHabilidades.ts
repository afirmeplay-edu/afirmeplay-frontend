import type { HabilidadeConsolidada } from '@/types/relatorio-consolidado';

export const HABILIDADE_META_THRESHOLD = 60;

export type HabilidadeMetaVariant = 'dentro' | 'abaixo';

export function splitHabilidadesPorMeta(habilidades: HabilidadeConsolidada[]): {
  dentroDaMeta: HabilidadeConsolidada[];
  abaixoDaMeta: HabilidadeConsolidada[];
} {
  const sorted = [...habilidades].sort(
    (a, b) => 
      b.percentual - a.percentual || 
      a.ordem_original - b.ordem_original ||
      a.codigo.localeCompare(b.codigo, 'pt-BR')
  );

  return {
    dentroDaMeta: sorted.filter((h) => h.percentual >= HABILIDADE_META_THRESHOLD),
    abaixoDaMeta: sorted.filter((h) => h.percentual < HABILIDADE_META_THRESHOLD),
  };
}

/** Percentual inteiro para exibição (ex.: 85%). */
export function formatHabilidadePercentDisplay(percentual: number): string {
  return `${Math.round(percentual)}%`;
}

export function buildHabilidadeLinhaTexto(h: HabilidadeConsolidada): string {
  const questao = `Questão ${h.numero_questao}`;
  const codigo = h.codigo.trim();
  const descricao = h.descricao.trim();
  
  if (codigo && descricao) return `${questao}: ${codigo} - ${descricao}`;
  if (codigo) return `${questao}: ${codigo}`;
  if (descricao) return `${questao}: ${descricao}`;
  return questao;
}

export function getHabilidadeMetaCardTitle(variant: HabilidadeMetaVariant): string {
  return variant === 'dentro'
    ? 'Habilidades Dentro da Meta (>= 60%)'
    : 'Habilidades Abaixo da Meta (< 60%)';
}
