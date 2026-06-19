import type { RelatorioConsolidado, SerieColuna } from '@/types/relatorio-consolidado';

const GRADE_TO_COURSE: Record<string, string> = {
  'Grupo 3': 'Anos Iniciais',
  'Grupo 4': 'Anos Iniciais',
  'Grupo 5': 'Anos Iniciais',
  '1º Ano': 'Anos Iniciais',
  '2º Ano': 'Anos Iniciais',
  '3º Ano': 'Anos Iniciais',
  '4º Ano': 'Anos Iniciais',
  '5º Ano': 'Anos Iniciais',
  '6º Ano': 'Anos Finais',
  '7º Ano': 'Anos Finais',
  '8º Ano': 'Anos Finais',
  '9º Ano': 'Anos Finais',
  '1º Ano EM': 'Ensino Médio',
  '2º Ano EM': 'Ensino Médio',
  '3º Ano EM': 'Ensino Médio',
};

function inferCursoFromSeries(colunas: SerieColuna[]): string | null {
  const cursos = new Set<string>();
  for (const col of colunas) {
    const curso = GRADE_TO_COURSE[col.serie_nome.trim()];
    if (curso) cursos.add(curso);
  }
  if (cursos.size === 1) return [...cursos][0];
  return null;
}

function buildIntervaloFromColunas(colunas: SerieColuna[]): string | null {
  if (!colunas.length) return null;
  const first = colunas[0].serie_nome.trim();
  const last = colunas[colunas.length - 1].serie_nome.trim();
  if (!first) return null;
  if (first === last) return first;
  return `${first} ao ${last}`;
}

function buildFromItensCurso(report: RelatorioConsolidado): string | null {
  const cursos = new Set<string>();
  for (const item of report.itens_selecionados) {
    const curso =
      'curso' in item && item.curso?.trim()
        ? item.curso.trim()
        : 'serie' in item && item.serie?.trim()
          ? item.serie.trim()
          : null;
    if (curso) cursos.add(curso);
  }
  if (cursos.size === 1) return [...cursos][0];
  return null;
}

export type FaixaSeriesSubtitle = {
  /** Texto exibido em "2.1. …" (ex.: "Anos Iniciais (1º ao 5º Ano)"). */
  titulo: string;
  /** `true` quando veio de `report.faixa_avaliacao.titulo`. */
  fromBackend: boolean;
};

/**
 * Rótulo da faixa de séries em que a avaliação foi aplicada.
 * Preferência: `faixa_avaliacao.titulo` do backend; senão deriva de `series_colunas` / itens.
 */
export function buildFaixaSeriesSubtitle(report: RelatorioConsolidado): FaixaSeriesSubtitle {
  const backendTitulo = report.faixa_avaliacao?.titulo?.trim();
  if (backendTitulo) {
    return { titulo: backendTitulo, fromBackend: true };
  }

  const colunas = report.series_colunas ?? [];
  const intervalo = buildIntervaloFromColunas(colunas);
  const curso = inferCursoFromSeries(colunas) ?? buildFromItensCurso(report);

  if (curso && intervalo) {
    return { titulo: `${curso} (${intervalo})`, fromBackend: false };
  }
  if (intervalo) {
    return { titulo: intervalo, fromBackend: false };
  }
  if (curso) {
    return { titulo: curso, fromBackend: false };
  }

  return { titulo: 'Séries da avaliação', fromBackend: false };
}
