import type { Gabarito, GabaritoGeneration, GabaritoScopeClassEntry } from '@/types/answer-sheet';

export function scopeTypeLabel(t?: string) {
  switch (t) {
    case 'class':
      return 'Turma';
    case 'grade':
      return 'Série';
    case 'school':
      return 'Escola';
    case 'city':
      return 'Município';
    default:
      return t ?? 'Escopo';
  }
}

function classEntryLabel(item: string | GabaritoScopeClassEntry): string {
  if (typeof item === 'string') {
    return item;
  }
  if (item.label && item.label.trim()) {
    return item.label.trim();
  }
  const parts = [item.grade_name, item.class_name].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(' - ');
  }
  return item.class_id;
}

/** Rótulos legíveis das turmas no snapshot (ordem preservada) */
export function generationClassLabelsFromSnapshot(gen: GabaritoGeneration): string[] {
  const s = gen.scope_snapshot;
  if (!s || typeof s !== 'object' || !Array.isArray(s.class_ids)) {
    return [];
  }
  return s.class_ids.map(classEntryLabel).filter(Boolean);
}

export function formatGenerationScopeSummary(gen: GabaritoGeneration): string {
  const s = gen.scope_snapshot;
  if (!s || typeof s !== 'object') {
    return scopeTypeLabel(gen.scope_type);
  }

  const labels = generationClassLabelsFromSnapshot(gen);
  if (labels.length > 0) {
    const shown = labels.length <= 4 ? labels.join(', ') : `${labels.slice(0, 3).join(', ')} +${labels.length - 3}`;
    return `${scopeTypeLabel(gen.scope_type)} · ${shown}`;
  }

  const parts: string[] = [];
  if (Array.isArray(s.class_ids) && s.class_ids.length > 0) {
    parts.push(`${s.class_ids.length} turma(s)`);
  }
  const gradeIds = s.grade_ids as string[] | undefined;
  if (Array.isArray(gradeIds) && gradeIds.length > 0) {
    parts.push(`${gradeIds.length} série(s)`);
  }
  const schoolIds = s.school_ids as string[] | undefined;
  if (Array.isArray(schoolIds) && schoolIds.length > 0) {
    parts.push(`${schoolIds.length} escola(s)`);
  }
  if (parts.length > 0) {
    return `${scopeTypeLabel(gen.scope_type)} · ${parts.join(' · ')}`;
  }
  return scopeTypeLabel(gen.scope_type);
}

/** Somente `download_url` da API (download autenticado com Bearer). */
export function resolveGenerationDownloadUrl(gen: GabaritoGeneration): string | null {
  const d = gen.download_url?.trim();
  return d || null;
}

/** Cartão na listagem: só `download_url`. */
export function resolveGabaritoDownloadUrl(g: Pick<Gabarito, 'download_url'>): string | null {
  const d = g.download_url?.trim();
  return d || null;
}

export function generationCanDownload(gen: GabaritoGeneration): boolean {
  if (gen.can_download === false) return false;
  if (gen.can_download === true) return true;
  if (gen.status === 'completed') {
    return !!resolveGenerationDownloadUrl(gen) || !!gen.job_id;
  }
  return false;
}

export function gabaritoDownloadLoadingKey(gabaritoId: string, generationId?: string): string {
  return generationId ? `${gabaritoId}__${generationId}` : gabaritoId;
}

/** Rótulo das séries do gabarito (coluna JSON `grades`, com fallback legado). */
export function formatGabaritoGradesLabel(
  g: Pick<Gabarito, 'grades' | 'grade_ids' | 'grade_name'>
): string {
  if (Array.isArray(g.grades) && g.grades.length > 0) {
    return g.grades.map((x) => x.name).filter(Boolean).join(', ');
  }
  return (g.grade_name ?? '').trim();
}
