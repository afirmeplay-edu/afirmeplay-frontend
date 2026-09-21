import { api } from '@/lib/api';

export interface SchoolInfo {
  name: string;
  cityName: string;
  stateUf: string;
}

export interface ResolvedRecipients {
  states: string[];
  cities: string[];
  schools: string[];
  grades: string[];
  classes: string[];
}

export interface ListedFormForResolve {
  selectedSchools?: string[];
  selectedGrades?: string[];
  selectedClasses?: string[];
  cityId?: string;
  cityName?: string;
}

type RequestConfig = { meta?: { cityId?: string } };

function requestConfig(cityId?: string): RequestConfig | undefined {
  return cityId ? { meta: { cityId } } : undefined;
}

function cacheKey(id: string, cityId?: string): string {
  return `${cityId ?? ''}:${id}`;
}

const schoolCache = new Map<string, Promise<SchoolInfo>>();
const gradeCache = new Map<string, Promise<string>>();
const classCache = new Map<string, Promise<string>>();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readName(data: unknown): string {
  const root = asRecord(data);
  const nested = asRecord(root?.data);
  const source = nested ?? root;
  if (!source) return '';
  return String(source.name ?? source.nome ?? '');
}

export async function getSchoolInfo(schoolId: string, cityId?: string): Promise<SchoolInfo> {
  const key = cacheKey(schoolId, cityId);
  const cached = schoolCache.get(key);
  if (cached) return cached;

  const promise = (async (): Promise<SchoolInfo> => {
    try {
      const response = await api.get(`/school/${schoolId}`, requestConfig(cityId));
      const data = asRecord(response.data) ?? {};
      const city = asRecord(data.city);
      return {
        name: String(data.name ?? ''),
        cityName: String(city?.name ?? ''),
        stateUf: String(city?.state ?? ''),
      };
    } catch (error) {
      console.error(`Erro ao buscar escola ${schoolId}:`, error);
      schoolCache.delete(key);
      return { name: '', cityName: '', stateUf: '' };
    }
  })();

  schoolCache.set(key, promise);
  return promise;
}

export async function getGradeName(gradeId: string, cityId?: string): Promise<string> {
  const key = cacheKey(gradeId, cityId);
  const cached = gradeCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const response = await api.get(`/forms/grades/${gradeId}`, requestConfig(cityId));
      return readName(response.data) || 'Série';
    } catch (error) {
      console.error(`Erro ao buscar série ${gradeId}:`, error);
      gradeCache.delete(key);
      return 'Série';
    }
  })();

  gradeCache.set(key, promise);
  return promise;
}

export async function getClassName(classId: string, cityId?: string): Promise<string> {
  const key = cacheKey(classId, cityId);
  const cached = classCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const response = await api.get(`/classes/${classId}`, requestConfig(cityId));
      return readName(response.data) || 'Turma';
    } catch (error) {
      console.error(`Erro ao buscar turma ${classId}:`, error);
      classCache.delete(key);
      return 'Turma';
    }
  })();

  classCache.set(key, promise);
  return promise;
}

export async function resolveFormRecipients(
  form: ListedFormForResolve
): Promise<ResolvedRecipients> {
  const schoolIds = form.selectedSchools || [];
  const gradeIds = form.selectedGrades || [];
  const classIds = form.selectedClasses || [];
  const cityId = form.cityId;

  const [schoolResults, gradeResults, classResults] = await Promise.all([
    Promise.allSettled(schoolIds.map((id) => getSchoolInfo(id, cityId))),
    Promise.allSettled(gradeIds.map((id) => getGradeName(id, cityId))),
    Promise.allSettled(classIds.map((id) => getClassName(id, cityId))),
  ]);

  const schools: string[] = [];
  const cities = new Set<string>();
  const states = new Set<string>();

  if (form.cityName) cities.add(form.cityName);

  schoolResults.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    if (result.value.name) schools.push(result.value.name);
    if (result.value.cityName) cities.add(result.value.cityName);
    if (result.value.stateUf) states.add(result.value.stateUf);
  });

  const grades = gradeResults
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((name) => name && name !== 'Série');

  const classes = classResults
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((name) => name && name !== 'Turma');

  return {
    states: Array.from(states),
    cities: Array.from(cities),
    schools,
    grades,
    classes,
  };
}

export function invalidateRecipientsCache() {
  schoolCache.clear();
  gradeCache.clear();
  classCache.clear();
}

export function formatRecipientsList(items: string[], maxVisible = 3): string {
  if (items.length === 0) return '—';
  if (items.length <= maxVisible) return items.join(', ');
  const visible = items.slice(0, maxVisible);
  const remaining = items.length - maxVisible;
  return `${visible.join(', ')} +${remaining}`;
}

export function formatScopeLabel(
  resolvedNames: string[],
  selectedIds?: string[],
  emptyLabel = 'Todas',
  maxVisible = 3,
): string {
  if (resolvedNames.length > 0) return formatRecipientsList(resolvedNames, maxVisible);
  if (selectedIds && selectedIds.length > 0) {
    return `${selectedIds.length} selecionada${selectedIds.length === 1 ? '' : 's'}`;
  }
  return emptyLabel;
}

export function getFormTypeDisplayName(formType: string): string {
  const names: Record<string, string> = {
    'aluno-jovem': 'Anos iniciais e educação infantil',
    'aluno-velho': 'EJA e anos finais',
    professor: 'Professores',
    diretor: 'Diretor',
    secretario: 'Secretário',
  };
  return names[formType] || formType;
}
