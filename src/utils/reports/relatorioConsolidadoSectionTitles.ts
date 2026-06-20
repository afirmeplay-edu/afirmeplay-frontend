/** Títulos das seções numéricas do relatório consolidado (web + PDF + sumário). */
export const RELATORIO_SECAO_FREQUENCIA = 'Resultados de Frequência';
export const RELATORIO_SECAO_MEDIA_NOTA = 'Resultados de Média Nota';
export const RELATORIO_SECAO_MEDIA_PROFICIENCIA = 'Resultados de Média Proficiência';
export const RELATORIO_SECAO_ACERTOS_HABILIDADE = 'Acertos por Habilidade';
export const RELATORIO_SECAO_DISTRIBUICAO = 'Distribuição dos Níveis de Proficiência';

export function relatorioSecaoTitle(sectionNumber: number, title: string): string {
  return `${sectionNumber}. ${title}`;
}
