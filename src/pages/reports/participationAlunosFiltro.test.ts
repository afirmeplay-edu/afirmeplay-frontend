import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decidirFiltroAlunosParticipacao,
  situacaoPorNiveis,
} from './participationAlunosFiltro.ts';

test('gabarito ADAP de série única abre em ADAP', () => {
  assert.equal(situacaoPorNiveis([2]), 'adap');
  const decisao = decidirFiltroAlunosParticipacao({
    fonte: 'cartao',
    situacao: 'adap',
    selecao: 'gabarito-suporte-2',
    filtroAtual: 'regular',
    autoEm: null,
  });
  assert.equal(decisao.filtro, 'adap');
  assert.equal(decisao.autoEm, 'gabarito-suporte-2');
});

test('gabarito regular continua em Regular', () => {
  assert.equal(situacaoPorNiveis([null]), 'regular');
  const decisao = decidirFiltroAlunosParticipacao({
    fonte: 'cartao',
    situacao: 'regular',
    selecao: 'gabarito-regular',
    filtroAtual: 'regular',
    autoEm: null,
  });
  assert.equal(decisao.filtro, 'regular');
});

test('avaliação online não muda o filtro', () => {
  const decisao = decidirFiltroAlunosParticipacao({
    fonte: 'digital',
    situacao: 'adap',
    selecao: 'avaliacao-1',
    filtroAtual: 'regular',
    autoEm: null,
  });
  assert.equal(decisao.filtro, 'regular');
  assert.equal(decisao.autoEm, null);
});

test('Regular escolhido à mão no mesmo gabarito ADAP não volta sozinho para ADAP', () => {
  const decisao = decidirFiltroAlunosParticipacao({
    fonte: 'cartao',
    situacao: 'adap',
    selecao: 'gabarito-suporte-2',
    filtroAtual: 'regular',
    autoEm: 'gabarito-suporte-2',
  });
  assert.equal(decisao.filtro, 'regular');
});
