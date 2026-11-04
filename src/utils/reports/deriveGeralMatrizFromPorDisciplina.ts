import type { MatrizEscolaSerie } from '@/types/relatorio-consolidado';

/**
 * GERAL derivado no frontend para alinhar com Resultados: o endpoint
 * relatorio-consolidado ainda calcula GERAL com outra regra; aqui usamos a
 * média aritmética simples das células de por_disciplina (escola × série).
 * Sem arredondamento intermediário — a exibição continua com formatDecimal1PtBr.
 */

function meanOfFinite(values: Array<number | null | undefined>): number | null {
  const nums: number[] = [];
  for (const v of values) {
    if (v != null && Number.isFinite(v)) nums.push(v);
  }
  if (nums.length === 0) return null;
  return nums.reduce((acc, n) => acc + n, 0) / nums.length;
}

function meanOfFiniteOrZero(values: Array<number | null | undefined>): number {
  return meanOfFinite(values) ?? 0;
}

function serieCount(matrizes: MatrizEscolaSerie[]): number {
  let max = 0;
  for (const m of matrizes) {
    for (const linha of m.linhas) {
      max = Math.max(max, linha.valores_por_serie?.length ?? 0);
    }
    max = Math.max(max, m.medias_da_rede?.por_serie?.length ?? 0);
  }
  return max;
}

function collectEscolaOrder(matrizes: MatrizEscolaSerie[]): Array<{ escola_id: string; escola_nome: string }> {
  const seen = new Set<string>();
  const order: Array<{ escola_id: string; escola_nome: string }> = [];
  for (const m of matrizes) {
    for (const linha of m.linhas) {
      const id = String(linha.escola_id ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      order.push({ escola_id: id, escola_nome: linha.escola_nome ?? '' });
    }
  }
  return order;
}

function linhaByEscola(matriz: MatrizEscolaSerie, escolaId: string) {
  return matriz.linhas.find((l) => String(l.escola_id) === String(escolaId));
}

/**
 * Monta a matriz GERAL a partir de `por_disciplina` (sem usar o GERAL da API).
 */
export function deriveGeralMatrizFromPorDisciplina(
  porDisciplina: Record<string, MatrizEscolaSerie> | undefined | null
): MatrizEscolaSerie | null {
  if (!porDisciplina) return null;

  const matrizes = Object.entries(porDisciplina)
    .filter(([nome, m]) => nome !== 'GERAL' && m?.linhas)
    .map(([, m]) => m);

  if (matrizes.length === 0) return null;

  const colCount = serieCount(matrizes);
  const escolas = collectEscolaOrder(matrizes);

  const linhas = escolas.map(({ escola_id, escola_nome }) => {
    const linhasDisc = matrizes.map((m) => linhaByEscola(m, escola_id));

    const valores_por_serie: Array<number | null> = [];
    for (let j = 0; j < colCount; j++) {
      valores_por_serie.push(
        meanOfFinite(linhasDisc.map((l) => l?.valores_por_serie?.[j] ?? null))
      );
    }

    const taxa_geral_escola = meanOfFiniteOrZero(
      linhasDisc.map((l) => (l ? l.taxa_geral_escola : null))
    );

    return {
      escola_id,
      escola_nome,
      valores_por_serie,
      // Níveis limpos: a cor/faixa sai do valor derivado (não do GERAL antigo da API).
      niveis_por_serie: Array.from({ length: colCount }, () => null),
      taxa_geral_escola,
      nivel_media_escola: null,
    };
  });

  const por_serie: Array<number | null> = [];
  for (let j = 0; j < colCount; j++) {
    por_serie.push(meanOfFinite(matrizes.map((m) => m.medias_da_rede?.por_serie?.[j] ?? null)));
  }

  const taxa_geral = meanOfFiniteOrZero(matrizes.map((m) => m.medias_da_rede?.taxa_geral ?? null));

  return {
    linhas,
    medias_da_rede: {
      por_serie,
      niveis_por_serie: Array.from({ length: colCount }, () => null),
      taxa_geral,
      nivel_media_geral: null,
    },
  };
}
