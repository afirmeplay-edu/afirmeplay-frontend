/**
 * Utilitários para busca/filtro do modal de "Alunos pendentes" (avaliação online e cartão-resposta).
 * Suportam prefixos `Turma …`, `Escola …`, `Série …` para restringir o filtro a um único campo.
 */

/** Normaliza texto da pesquisa de pendentes (acentos, caixa, símbolos comuns de grau). */
export function normalizePendingStudentSearchText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[°ºª]/g, '')
    .toLowerCase()
    .trim();
}

/** Interpreta prefixos "Turma …", "Escola …", "Série …" / "Serie …" (resto filtra só esse campo). */
export function parsePendingStudentSearchInput(raw: string): {
  kind: 'turma' | 'escola' | 'serie' | 'general';
  needle: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'general', needle: '' };
  const lowered = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[°ºª]/g, '')
    .toLowerCase()
    .trim();

  const turmaMatch = lowered.match(/^turma\s*:?\s*(.+)$/);
  if (turmaMatch?.[1]?.trim()) {
    return { kind: 'turma', needle: normalizePendingStudentSearchText(turmaMatch[1]) };
  }
  const escolaMatch = lowered.match(/^escola\s*:?\s*(.+)$/);
  if (escolaMatch?.[1]?.trim()) {
    return { kind: 'escola', needle: normalizePendingStudentSearchText(escolaMatch[1]) };
  }
  const serieMatch = lowered.match(/^serie\s*:?\s*(.+)$/);
  if (serieMatch?.[1]?.trim()) {
    return { kind: 'serie', needle: normalizePendingStudentSearchText(serieMatch[1]) };
  }

  return { kind: 'general', needle: normalizePendingStudentSearchText(trimmed) };
}

/** Placeholder do input por nível de granularidade da resposta agregada. */
export function getPendingStudentsSearchPlaceholder(
  granularity: string | undefined | null
): string {
  switch (granularity) {
    case 'municipio':
      return 'Nome ou trecho da escola, série, turma… Use Turma A ou Escola municipal…';
    case 'escola':
      return 'Nome, série, turma ou trecho… Use Turma A, Série 8º…';
    case 'serie':
      return 'Nome, turma ou trecho… Use Turma A…';
    case 'turma':
    case 'avaliacao':
      return 'Pesquisar por nome…';
    default:
      return 'Nome ou trecho (escola, série, turma)… Turma A, Escola cent…';
  }
}
