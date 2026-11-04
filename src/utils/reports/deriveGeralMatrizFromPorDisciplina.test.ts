import assert from 'node:assert/strict';
import test from 'node:test';
import type { MatrizEscolaSerie } from '../../types/relatorio-consolidado.ts';
import { deriveGeralMatrizFromPorDisciplina } from './deriveGeralMatrizFromPorDisciplina.ts';
import { formatDecimal1PtBr } from '../numberFormat.ts';

function matrizDisc(
  escolaId: string,
  escolaNome: string,
  valores: Array<number | null>,
  taxa: number,
  redePorSerie: Array<number | null>,
  taxaRede: number
): MatrizEscolaSerie {
  return {
    linhas: [
      {
        escola_id: escolaId,
        escola_nome: escolaNome,
        valores_por_serie: valores,
        taxa_geral_escola: taxa,
      },
    ],
    medias_da_rede: {
      por_serie: redePorSerie,
      taxa_geral: taxaRede,
    },
  };
}

test('GERAL = média simples Port+Mat (caso João de Deus 1º Ano)', () => {
  // Port nota 4,4; Mat = 2×6,1 − 4,4 = 7,8 → GERAL 6,1 (igual Resultados)
  const por = {
    'Língua Portuguesa': matrizDisc('esc-1', 'JOAO DE DEUS', [4.4, 5.0], 4.7, [4.5, 5.1], 4.8),
    Matemática: matrizDisc('esc-1', 'JOAO DE DEUS', [7.8, 6.0], 6.9, [7.5, 6.2], 6.85),
  };

  const geral = deriveGeralMatrizFromPorDisciplina(por);
  assert.ok(geral);
  const cell1Ano = geral!.linhas[0].valores_por_serie[0];
  assert.equal(cell1Ano, (4.4 + 7.8) / 2);
  assert.equal(formatDecimal1PtBr(cell1Ano), '6,1');

  assert.equal(geral!.linhas[0].valores_por_serie[1], (5.0 + 6.0) / 2);
  assert.equal(geral!.linhas[0].taxa_geral_escola, (4.7 + 6.9) / 2);
  assert.equal(geral!.medias_da_rede.por_serie[0], (4.5 + 7.5) / 2);
  assert.equal(geral!.medias_da_rede.taxa_geral, (4.8 + 6.85) / 2);
});

test('célula com só uma disciplina usa esse valor; nenhuma fica null', () => {
  const por = {
    'Língua Portuguesa': matrizDisc('esc-1', 'A', [4.4, null], 4.4, [4.4, null], 4.4),
    Matemática: matrizDisc('esc-1', 'A', [null, 7.0], 7.0, [null, 7.0], 7.0),
  };
  const geral = deriveGeralMatrizFromPorDisciplina(por)!;
  assert.equal(geral.linhas[0].valores_por_serie[0], 4.4);
  assert.equal(geral.linhas[0].valores_por_serie[1], 7.0);
});

test('proficiência GERAL 216,1 a partir da média das disciplinas', () => {
  // Ex.: Port 200,2 + Mat 232,0 = 432,2 / 2 = 216,1
  const por = {
    'Língua Portuguesa': matrizDisc('esc-1', 'JOAO DE DEUS', [200.2], 200.2, [200.2], 200.2),
    Matemática: matrizDisc('esc-1', 'JOAO DE DEUS', [232.0], 232.0, [232.0], 232.0),
  };
  const geral = deriveGeralMatrizFromPorDisciplina(por)!;
  const p = geral.linhas[0].valores_por_serie[0];
  assert.equal(p, 216.1);
  assert.equal(formatDecimal1PtBr(p), '216,1');
});
