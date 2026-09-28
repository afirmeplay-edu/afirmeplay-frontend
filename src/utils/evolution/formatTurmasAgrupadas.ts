/** Referência de turma para agrupar sem contar o mesmo class_id duas vezes. */
export type TurmaNomeRef = {
  id?: string | null;
  name?: string | null;
};

function seriesSortKey(name: string): [number, number, string] {
  const normalized = name.trim().toLowerCase();
  const match = normalized.match(/(\d+)/);
  if (match) return [0, Number.parseInt(match[1], 10), normalized];
  return [1, 0, normalized];
}

/**
 * Agrupa nomes de turma repetidos.
 * 1 ocorrência → o nome; N>1 → "N do NOME".
 * Comparação ignora espaços nas pontas e maiúsculas; a grafia exibida é a da primeira ocorrência.
 * Ordena pelo número da série quando houver, depois em ordem alfabética.
 */
export function formatTurmasAgrupadas(nomes: string[]): string {
  const counts = new Map<string, { label: string; count: number }>();
  const order: string[] = [];

  for (const raw of nomes) {
    if (raw == null) continue;
    const label = String(raw).trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { label, count: 1 });
      order.push(key);
    }
  }

  const keys = [...order].sort((a, b) => {
    const left = seriesSortKey(counts.get(a)?.label ?? a);
    const right = seriesSortKey(counts.get(b)?.label ?? b);
    if (left[0] !== right[0]) return left[0] - right[0];
    if (left[1] !== right[1]) return left[1] - right[1];
    return left[2].localeCompare(right[2], "pt-BR");
  });

  return keys
    .map((key) => {
      const entry = counts.get(key);
      if (!entry) return "";
      return entry.count > 1 ? `${entry.count} do ${entry.label}` : entry.label;
    })
    .filter(Boolean)
    .join(", ");
}

/** Deduplica por class_id e depois agrupa os nomes. Sem id, entra na contagem por nome. */
export function formatTurmasFromRefs(turmas: TurmaNomeRef[]): string {
  const seenIds = new Set<string>();
  const names: string[] = [];
  for (const turma of turmas) {
    const name = turma.name?.trim();
    if (!name) continue;
    const id = turma.id?.trim();
    if (id) {
      const key = id.toLowerCase();
      if (seenIds.has(key)) continue;
      seenIds.add(key);
    }
    names.push(name);
  }
  return formatTurmasAgrupadas(names);
}
