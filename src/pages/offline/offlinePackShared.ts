import type { OfflinePackScope } from '@/services/mobile/offlinePackApi';
import { normalizeApiList } from '@/utils/normalizeApiList';

export const OFFLINE_SELECT_NONE = '__offline_none__';

/** UUID de município válido para GET /school/city/{city_id} (evita /school/city/ vazio). */
export function isValidSchoolCityId(cityId: string | undefined): boolean {
  if (!cityId || cityId === OFFLINE_SELECT_NONE) return false;
  const trimmed = cityId.trim();
  if (trimmed.length < 32) return false;
  return /^[0-9a-f-]{36}$/i.test(trimmed);
}

export interface StateOption {
  id: string;
  name: string;
}

export interface CityRow {
  id: string;
  name: string;
}

export interface SchoolRow {
  id: string;
  name: string;
}

export interface ClassRow {
  id: string;
  name: string;
  school?: { id: string; name: string };
  grade?: { id: string; name: string };
}

export interface TestRow {
  id: string;
  titulo: string;
}

export interface StudentRow {
  id: string;
  name: string;
}

export interface GabaritoRow {
  id: string;
  title: string;
  num_questions?: number;
}

export interface SocioeconomicFormRow {
  id: string;
  title: string;
  formType?: string;
  recipientsCount?: number;
}

export function normalizeToClassRows(data: unknown): ClassRow[] {
  return normalizeApiList<ClassRow>(data);
}

export function toggleInSet(ids: Set<string>, id: string, checked: boolean): Set<string> {
  const next = new Set(ids);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
}

/** Séries das turmas selecionadas — usado para pré-preencher filtro de série na edição. */
export function gradeIdsFromClassIds(
  classIds: Iterable<string>,
  classes: ClassRow[]
): Set<string> {
  const selected = new Set(classIds);
  const gradeIds = new Set<string>();
  for (const cl of classes) {
    if (selected.has(cl.id) && cl.grade?.id) gradeIds.add(cl.grade.id);
  }
  return gradeIds;
}

/** Remove turmas que não pertencem às séries filtradas na UI. */
export function pruneClassIdsByGrades(
  classIds: Set<string>,
  classes: ClassRow[],
  gradeIds: Set<string>
): Set<string> {
  if (gradeIds.size === 0) return classIds;
  const visible = new Set(
    classes.filter((c) => c.grade?.id && gradeIds.has(c.grade.id)).map((c) => c.id)
  );
  return new Set([...classIds].filter((id) => visible.has(id)));
}

/** Remove turmas que não pertencem às escolas selecionadas. */
export function pruneClassIdsBySchools(
  classIds: Set<string>,
  classes: ClassRow[],
  schoolIds: Set<string>
): Set<string> {
  if (schoolIds.size === 0) return classIds;
  const visible = new Set(
    classes.filter((c) => c.school?.id && schoolIds.has(c.school.id)).map((c) => c.id)
  );
  return new Set([...classIds].filter((id) => visible.has(id)));
}

export function formatExpiresAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function scopeSummary(scope: OfflinePackScope): string {
  if (scope.type === 'municipality') return 'Município inteiro';
  const parts: string[] = [];
  const n = (arr?: string[]) => arr?.length ?? 0;
  if (n(scope.school_ids)) parts.push(`${n(scope.school_ids)} escola(s)`);
  if (n(scope.class_ids)) parts.push(`${n(scope.class_ids)} turma(s)`);
  if (n(scope.test_ids)) parts.push(`${n(scope.test_ids)} prova(s)`);
  if (n(scope.gabarito_ids)) parts.push(`${n(scope.gabarito_ids)} gabarito(s)`);
  if (n(scope.form_ids)) parts.push(`${n(scope.form_ids)} formulário(s)`);
  if (n(scope.student_ids)) parts.push(`${n(scope.student_ids)} aluno(s)`);
  return parts.length ? parts.join(' · ') : 'Personalizado (sem filtros)';
}

/** Garante `type: custom` quando a API envia apenas os arrays de ids. */
export function normalizePackScope(scope: OfflinePackScope): OfflinePackScope {
  if (scope.type === 'municipality') return scope;
  if (scope.type === 'custom') return scope;
  const raw = scope as OfflinePackScope & Record<string, unknown>;
  const hasCustomIds =
    (Array.isArray(raw.school_ids) && raw.school_ids.length > 0) ||
    (Array.isArray(raw.class_ids) && raw.class_ids.length > 0) ||
    (Array.isArray(raw.test_ids) && raw.test_ids.length > 0) ||
    (Array.isArray(raw.gabarito_ids) && raw.gabarito_ids.length > 0) ||
    (Array.isArray(raw.form_ids) && raw.form_ids.length > 0) ||
    (Array.isArray(raw.student_ids) && raw.student_ids.length > 0);
  if (hasCustomIds) {
    return {
      type: 'custom',
      school_ids: Array.isArray(raw.school_ids) ? raw.school_ids.map(String) : [],
      class_ids: Array.isArray(raw.class_ids) ? raw.class_ids.map(String) : [],
      test_ids: Array.isArray(raw.test_ids) ? raw.test_ids.map(String) : [],
      gabarito_ids: Array.isArray(raw.gabarito_ids) ? raw.gabarito_ids.map(String) : [],
      form_ids: Array.isArray(raw.form_ids) ? raw.form_ids.map(String) : [],
      student_ids: Array.isArray(raw.student_ids) ? raw.student_ids.map(String) : [],
    };
  }
  return { type: 'municipality' };
}

export function setsFromScope(scope: OfflinePackScope): {
  scopeMode: 'municipality' | 'custom';
  schoolIds: Set<string>;
  testIds: Set<string>;
  gabaritoIds: Set<string>;
  formIds: Set<string>;
  classIds: Set<string>;
  studentIds: Set<string>;
} {
  const normalized = normalizePackScope(scope);
  if (normalized.type === 'municipality') {
    return {
      scopeMode: 'municipality',
      schoolIds: new Set(),
      testIds: new Set(),
      gabaritoIds: new Set(),
      formIds: new Set(),
      classIds: new Set(),
      studentIds: new Set(),
    };
  }
  return {
    scopeMode: 'custom',
    schoolIds: new Set((normalized.school_ids ?? []).map(String)),
    testIds: new Set((normalized.test_ids ?? []).map(String)),
    gabaritoIds: new Set((normalized.gabarito_ids ?? []).map(String)),
    formIds: new Set((normalized.form_ids ?? []).map(String)),
    classIds: new Set((normalized.class_ids ?? []).map(String)),
    studentIds: new Set((normalized.student_ids ?? []).map(String)),
  };
}

export function scopeSchoolIdsFromPack(scope: OfflinePackScope | null): string[] {
  if (!scope) return [];
  const n = normalizePackScope(scope);
  return n.type === 'custom' ? (n.school_ids ?? []).map(String) : [];
}

export function scopeTestIdsFromPack(scope: OfflinePackScope | null): string[] {
  if (!scope) return [];
  const n = normalizePackScope(scope);
  return n.type === 'custom' ? (n.test_ids ?? []).map(String) : [];
}

export function scopeClassIdsFromPack(scope: OfflinePackScope | null): string[] {
  if (!scope) return [];
  const n = normalizePackScope(scope);
  return n.type === 'custom' ? (n.class_ids ?? []).map(String) : [];
}

export function scopeGabaritoIdsFromPack(scope: OfflinePackScope | null): string[] {
  if (!scope) return [];
  const n = normalizePackScope(scope);
  return n.type === 'custom' ? (n.gabarito_ids ?? []).map(String) : [];
}

export function scopeFormIdsFromPack(scope: OfflinePackScope | null): string[] {
  if (!scope) return [];
  const n = normalizePackScope(scope);
  return n.type === 'custom' ? (n.form_ids ?? []).map(String) : [];
}

export function applyScopeToSelectionState(
  scope: OfflinePackScope,
  setters: {
    setScopeMode: (m: 'municipality' | 'custom') => void;
    setSelectedSchoolIds: (s: Set<string>) => void;
    setSelectedTestIds: (s: Set<string>) => void;
    setSelectedGabaritoIds: (s: Set<string>) => void;
    setSelectedFormIds: (s: Set<string>) => void;
    setSelectedClassIds: (s: Set<string>) => void;
    setSelectedStudentIds: (s: Set<string>) => void;
  }
): void {
  const parsed = setsFromScope(scope);
  setters.setScopeMode(parsed.scopeMode);
  if (parsed.scopeMode === 'custom') {
    setters.setSelectedSchoolIds(new Set(parsed.schoolIds));
    setters.setSelectedTestIds(new Set(parsed.testIds));
    setters.setSelectedGabaritoIds(new Set(parsed.gabaritoIds));
    setters.setSelectedFormIds(new Set(parsed.formIds));
    setters.setSelectedClassIds(new Set(parsed.classIds));
    setters.setSelectedStudentIds(new Set(parsed.studentIds));
  }
}
