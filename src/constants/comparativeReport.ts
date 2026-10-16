import {
  RESULTADOS_ALUNOS_FILTRO_PADRAO,
  RESULTADOS_ALUNOS_OPCOES,
  type ResultadosAlunosFiltro,
} from '@/constants/resultadosAlunosFiltro';

export const COMPARATIVE_ALUNOS_PADRAO = RESULTADOS_ALUNOS_FILTRO_PADRAO;
export const COMPARATIVE_ALUNOS_OPCOES = RESULTADOS_ALUNOS_OPCOES;
export type ComparativeAlunosFiltro = ResultadosAlunosFiltro;

export const COMPARATIVE_INDICADORES = [
  {
    value: 'participacao',
    label: 'Participação',
    description: 'Esperados, avaliados e % de comparecimento',
  },
  {
    value: 'proficiencia_media',
    label: 'Proficiência média',
    description: 'Geral e por disciplina, quando houver',
  },
  {
    value: 'distribuicao_niveis',
    label: 'Distribuição por nível',
    description: 'Quantidade e % por nível de proficiência',
  },
  {
    value: 'alunos_avaliados',
    label: 'Nº de alunos avaliados',
    description: 'Alunos distintos com resultado',
  },
  {
    value: 'aplicacoes',
    label: 'Nº de aplicações',
    description: 'Quantidade de ClassTest no recorte',
  },
] as const;

export type ComparativeIndicador = (typeof COMPARATIVE_INDICADORES)[number]['value'];

export const COMPARATIVE_NIVEL_LABELS: Record<string, string> = {
  abaixo_do_basico: 'Abaixo do básico',
  basico: 'Básico',
  adequado: 'Adequado',
  avancado: 'Avançado',
};

export const COMPARATIVE_CHART_COLORS = [
  '#33658A',
  '#758E4F',
  '#F6AE2D',
  '#F26419',
  '#86BBD8',
  '#2F4858',
];
