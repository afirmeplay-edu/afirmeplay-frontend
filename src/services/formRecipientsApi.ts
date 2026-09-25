import { api } from '@/lib/api';

export interface SchoolInfo {
  name: string;
  cityName: string;
  stateUf: string;
}

export interface ClassInfo {
  id: string;
  name: string;
  schoolId: string;
  gradeId: string;
}

export interface RecipientClassScope {
  id: string;
  name: string;
}

export interface RecipientGradeScope {
  id: string;
  name: string;
  classes: RecipientClassScope[];
  /** Quando não há turmas específicas, indica escopo amplo (todas). */
  allClasses?: boolean;
}

export interface RecipientSchoolScope {
  id: string;
  name: string;
  grades: RecipientGradeScope[];
}

export interface ResolvedRecipients {
  states: string[];
  cities: string[];
  schools: string[];
  grades: string[];
  classes: string[];
  /** Hierarquia associativa escola → série → turma. */
  scopes: RecipientSchoolScope[];
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
const classCache = new Map<string, Promise<ClassInfo>>();

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

export async function getClassInfo(classId: string, cityId?: string): Promise<ClassInfo> {
  const key = cacheKey(classId, cityId);
  const cached = classCache.get(key);
  if (cached) return cached;

  const promise = (async (): Promise<ClassInfo> => {
    try {
      const response = await api.get(`/classes/${classId}`, requestConfig(cityId));
      const root = asRecord(response.data);
      const nested = asRecord(root?.data);
      const source = nested ?? root ?? {};
      const school = asRecord(source.school);
      const grade = asRecord(source.grade);
      return {
        id: classId,
        name: String(source.name ?? source.nome ?? '') || 'Turma',
        schoolId: String(
          source.school_id ?? source.schoolId ?? school?.id ?? '',
        ),
        gradeId: String(
          source.grade_id ?? source.gradeId ?? grade?.id ?? '',
        ),
      };
    } catch (error) {
      console.error(`Erro ao buscar turma ${classId}:`, error);
      classCache.delete(key);
      return { id: classId, name: 'Turma', schoolId: '', gradeId: '' };
    }
  })();

  classCache.set(key, promise);
  return promise;
}

export async function getClassName(classId: string, cityId?: string): Promise<string> {
  const info = await getClassInfo(classId, cityId);
  return info.name;
}

function buildScopes(params: {
  schoolIds: string[];
  gradeIds: string[];
  schoolNames: Map<string, string>;
  gradeNames: Map<string, string>;
  classInfos: ClassInfo[];
}): RecipientSchoolScope[] {
  const { schoolIds, gradeIds, schoolNames, gradeNames, classInfos } = params;
  const validClasses = classInfos.filter((c) => c.name && c.name !== 'Turma');

  // Prefer grouping by class associations when turmas estão definidas.
  if (validClasses.length > 0) {
    const schoolMap = new Map<string, RecipientSchoolScope>();

    for (const cls of validClasses) {
      const schoolId = cls.schoolId || '__unknown__';
      const schoolName =
        schoolNames.get(cls.schoolId) ||
        (schoolId === '__unknown__' ? 'Escola não identificada' : 'Escola');

      if (!schoolMap.has(schoolId)) {
        schoolMap.set(schoolId, {
          id: schoolId,
          name: schoolName,
          grades: [],
        });
      }

      const schoolScope = schoolMap.get(schoolId)!;
      const gradeId = cls.gradeId || '__unknown__';
      let gradeScope = schoolScope.grades.find((g) => g.id === gradeId);
      if (!gradeScope) {
        gradeScope = {
          id: gradeId,
          name:
            gradeNames.get(cls.gradeId) ||
            (gradeId === '__unknown__' ? 'Série não identificada' : 'Série'),
          classes: [],
        };
        schoolScope.grades.push(gradeScope);
      }

      if (!gradeScope.classes.some((c) => c.id === cls.id)) {
        gradeScope.classes.push({ id: cls.id, name: cls.name });
      }
    }

    // Preserve preferred school order from selectedSchools when possible.
    const ordered: RecipientSchoolScope[] = [];
    const seen = new Set<string>();
    for (const id of schoolIds) {
      const scope = schoolMap.get(id);
      if (scope) {
        ordered.push(scope);
        seen.add(id);
      }
    }
    for (const [id, scope] of schoolMap) {
      if (!seen.has(id)) ordered.push(scope);
    }
    return ordered;
  }

  // Sem turmas específicas: escola → série (todas as turmas) ou só escolas.
  if (schoolIds.length === 0) return [];

  return schoolIds.map((schoolId) => {
    const grades: RecipientGradeScope[] =
      gradeIds.length > 0
        ? gradeIds.map((gradeId) => ({
            id: gradeId,
            name: gradeNames.get(gradeId) || 'Série',
            classes: [],
            allClasses: true,
          }))
        : [
            {
              id: '__all__',
              name: 'Todas as séries',
              classes: [],
              allClasses: true,
            },
          ];

    return {
      id: schoolId,
      name: schoolNames.get(schoolId) || 'Escola',
      grades,
    };
  });
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
    Promise.allSettled(classIds.map((id) => getClassInfo(id, cityId))),
  ]);

  const schools: string[] = [];
  const schoolNames = new Map<string, string>();
  const cities = new Set<string>();
  const states = new Set<string>();

  if (form.cityName) cities.add(form.cityName);

  schoolResults.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    const schoolId = schoolIds[index];
    if (result.value.name) {
      schools.push(result.value.name);
      if (schoolId) schoolNames.set(schoolId, result.value.name);
    }
    if (result.value.cityName) cities.add(result.value.cityName);
    if (result.value.stateUf) states.add(result.value.stateUf);
  });

  const gradeNames = new Map<string, string>();
  const grades = gradeResults
    .map((result, index) => {
      if (result.status !== 'fulfilled') return null;
      const name = result.value;
      if (!name || name === 'Série') return null;
      const gradeId = gradeIds[index];
      if (gradeId) gradeNames.set(gradeId, name);
      return name;
    })
    .filter((name): name is string => Boolean(name));

  const classInfos = classResults
    .filter((r): r is PromiseFulfilledResult<ClassInfo> => r.status === 'fulfilled')
    .map((r) => r.value);

  // Preencher nomes de série/escola faltantes a partir das turmas.
  const missingGradeIds = [
    ...new Set(
      classInfos
        .map((c) => c.gradeId)
        .filter((id) => id && !gradeNames.has(id)),
    ),
  ];
  const missingSchoolIds = [
    ...new Set(
      classInfos
        .map((c) => c.schoolId)
        .filter((id) => id && !schoolNames.has(id)),
    ),
  ];

  await Promise.all([
    ...missingGradeIds.map(async (id) => {
      const name = await getGradeName(id, cityId);
      if (name && name !== 'Série') gradeNames.set(id, name);
    }),
    ...missingSchoolIds.map(async (id) => {
      const info = await getSchoolInfo(id, cityId);
      if (info.name) {
        schoolNames.set(id, info.name);
        if (!schools.includes(info.name)) schools.push(info.name);
        if (info.cityName) cities.add(info.cityName);
        if (info.stateUf) states.add(info.stateUf);
      }
    }),
  ]);

  const classes = classInfos
    .map((c) => c.name)
    .filter((name) => name && name !== 'Turma');

  const scopes = buildScopes({
    schoolIds,
    gradeIds,
    schoolNames,
    gradeNames,
    classInfos,
  });

  return {
    states: Array.from(states),
    cities: Array.from(cities),
    schools,
    grades,
    classes,
    scopes,
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
