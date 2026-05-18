import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/authContext';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { getUserHierarchyContext, cityIdQueryParamForAdmin } from '@/utils/userHierarchy';
import { EvaluationResultsApiService } from '@/services/evaluation/evaluationResultsApi';
import type { OfflinePackScope } from '@/services/mobile/offlinePackApi';
import {
  OFFLINE_PACK_MAX_REDEMPTIONS_DEFAULT,
  OFFLINE_PACK_MAX_REDEMPTIONS_MAX,
  OFFLINE_PACK_MAX_REDEMPTIONS_MIN,
  OFFLINE_PACK_TTL_DEFAULT,
  OFFLINE_PACK_TTL_MAX,
  OFFLINE_PACK_TTL_MIN,
} from '@/services/mobile/offlinePackApi';
import {
  OFFLINE_SELECT_NONE,
  isValidSchoolCityId,
  applyScopeToSelectionState,
  normalizePackScope,
  normalizeToClassRows,
  scopeClassIdsFromPack,
  scopeSchoolIdsFromPack,
  scopeTestIdsFromPack,
  setsFromScope,
  type CityRow,
  type ClassRow,
  type SchoolRow,
  type StateOption,
  type StudentRow,
  type TestRow,
} from './offlinePackShared';

export interface UseOfflinePackFormOptions {
  /** Preenche escopo ao editar (após GET do pacote). */
  initialScope?: OfflinePackScope | null;
  initialTtlHours?: number;
  initialMaxRedemptions?: number;
  minMaxRedemptions?: number;
  /** Pré-seleciona município (edição ou retorno da lista). */
  initialCityId?: string;
}

export function useOfflinePackForm(options: UseOfflinePackFormOptions = {}) {
  const {
    initialScope,
    initialTtlHours,
    initialMaxRedemptions,
    minMaxRedemptions = 1,
    initialCityId,
  } = options;
  const { user } = useAuth();
  const { toast } = useToast();
  const scopeInitialSyncDoneRef = useRef(false);
  const packScopeRef = useRef(initialScope ? normalizePackScope(initialScope) : null);
  const locationHydratedRef = useRef(false);
  const pendingCityIdRef = useRef<string | undefined>(initialCityId);

  if (initialScope) {
    packScopeRef.current = normalizePackScope(initialScope);
  }

  const [states, setStates] = useState<StateOption[]>([]);
  const [cities, setCities] = useState<CityRow[]>([]);
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [grades, setGrades] = useState<Array<{ id: string; name: string }>>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);

  const [selectedStateId, setSelectedStateId] = useState(OFFLINE_SELECT_NONE);
  const [selectedCityId, setSelectedCityId] = useState(OFFLINE_SELECT_NONE);
  const [scopeMode, setScopeMode] = useState<'municipality' | 'custom'>('municipality');
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<Set<string>>(new Set());
  const [selectedGradeIds, setSelectedGradeIds] = useState<Set<string>>(new Set());
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  const [ttlHours, setTtlHours] = useState(initialTtlHours ?? OFFLINE_PACK_TTL_DEFAULT);
  const [maxRedemptions, setMaxRedemptions] = useState(
    initialMaxRedemptions ?? OFFLINE_PACK_MAX_REDEMPTIONS_DEFAULT
  );

  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadingTests, setLoadingTests] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const effectiveCityIdForQuery =
    selectedCityId === OFFLINE_SELECT_NONE ? undefined : selectedCityId;

  const adminCityIdQuery = useMemo(
    () => cityIdQueryParamForAdmin(user?.role, effectiveCityIdForQuery),
    [user?.role, effectiveCityIdForQuery]
  );

  const isAdmin = (user?.role ?? '').toLowerCase() === 'admin';

  const hasCityContext = isAdmin
    ? Boolean(effectiveCityIdForQuery)
    : Boolean(effectiveCityIdForQuery || user?.tenant_id);

  const cityIdForAdminHeader =
    isAdmin && effectiveCityIdForQuery ? effectiveCityIdForQuery : undefined;

  const visibleClasses = useMemo(() => {
    if (selectedGradeIds.size === 0) return classes;
    return classes.filter((c) => c.grade?.id && selectedGradeIds.has(c.grade.id));
  }, [classes, selectedGradeIds]);

  const singleClassIdForStudents = useMemo(() => {
    if (selectedClassIds.size !== 1) return null;
    return [...selectedClassIds][0];
  }, [selectedClassIds]);

  useEffect(() => {
    const run = async () => {
      setLoadingStates(true);
      try {
        const res = await api.get<unknown[]>('/city/states');
        const raw = Array.isArray(res.data) ? res.data : [];
        setStates(
          raw
            .map((s: Record<string, unknown>) => ({
              id: String(s.id ?? s.sigla ?? ''),
              name: String(s.name ?? s.nome ?? s.id ?? ''),
            }))
            .filter((s) => s.id)
        );
      } catch {
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar os estados.',
          variant: 'destructive',
        });
      } finally {
        setLoadingStates(false);
      }
    };
    run();
  }, [toast]);

  useEffect(() => {
    EvaluationResultsApiService.getGrades().then((g) =>
      setGrades(Array.isArray(g) ? g.map((x) => ({ id: x.id, name: x.name })) : [])
    );
  }, []);

  useEffect(() => {
    if (selectedStateId === OFFLINE_SELECT_NONE) {
      setCities([]);
      setSelectedCityId(OFFLINE_SELECT_NONE);
      return;
    }
    setLoadingCities(true);
    api
      .get<CityRow[] | { data?: CityRow[] }>(`/city/municipalities/state/${selectedStateId}`)
      .then((res) => {
        let data = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
        if (!Array.isArray(data)) data = [];
        if (user?.role !== 'admin' && user?.tenant_id) {
          data = data.filter((c) => c.id === user.tenant_id);
        }
        setCities(data);

        const pendingCity = pendingCityIdRef.current;
        if (pendingCity && data.some((c) => c.id === pendingCity)) {
          setSelectedCityId(pendingCity);
          pendingCityIdRef.current = undefined;
        } else if (data.length === 1) {
          setSelectedCityId(data[0].id);
        } else if (
          selectedCityId !== OFFLINE_SELECT_NONE &&
          !data.some((c) => c.id === selectedCityId)
        ) {
          setSelectedCityId(OFFLINE_SELECT_NONE);
        }
      })
      .catch(() => setCities([]))
      .finally(() => setLoadingCities(false));
  }, [selectedStateId, user?.role, user?.tenant_id]);

  useEffect(() => {
    const cityId = initialCityId ?? (user?.role !== 'admin' ? user?.tenant_id : undefined);
    if (!cityId || locationHydratedRef.current || states.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<Record<string, unknown>>(`/city/${cityId}`);
        if (cancelled) return;
        const municipality = res.data;
        const stateVal = String(municipality.state ?? municipality.state_id ?? '');
        const stateMatch = states.find((s) => s.id === stateVal || s.name === stateVal);
        pendingCityIdRef.current = cityId;
        if (stateMatch) {
          setSelectedStateId(stateMatch.id);
        } else if (stateVal) {
          setSelectedStateId(stateVal);
        } else {
          setSelectedCityId(cityId);
          pendingCityIdRef.current = undefined;
        }
        locationHydratedRef.current = true;
      } catch {
        if (!cancelled) {
          pendingCityIdRef.current = cityId;
          setSelectedCityId(cityId);
          locationHydratedRef.current = true;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialCityId, user?.role, user?.tenant_id, states]);

  useEffect(() => {
    if (!user?.id || user.role === 'admin') return;
    if (initialCityId || user?.tenant_id) return;

    getUserHierarchyContext(user.id, user.role).then((ctx) => {
      if (ctx.municipality?.state && states.length > 0) {
        const stateMatch = states.find(
          (s) => s.id === ctx.municipality?.state || s.name === ctx.municipality?.state
        );
        if (stateMatch) setSelectedStateId(stateMatch.id);
      }
      if (ctx.municipality?.id) {
        pendingCityIdRef.current = ctx.municipality.id;
        if (selectedStateId === OFFLINE_SELECT_NONE) {
          setSelectedCityId(ctx.municipality.id);
        }
      }
    });
  }, [user?.id, user?.role, states, initialCityId, user?.tenant_id, selectedStateId]);

  useEffect(() => {
    if (!isValidSchoolCityId(selectedCityId)) {
      setSchools([]);
      setLoadingSchools(false);
      return;
    }
    setLoadingSchools(true);
    const cityId = selectedCityId.trim();
    const req = { meta: { cityId } };
    api
      .get<SchoolRow[] | { schools: SchoolRow[]; data?: SchoolRow[] }>(
        `/school/city/${cityId}`,
        req
      )
      .then((res) => {
        const raw = res.data;
        let list: SchoolRow[] = [];
        if (Array.isArray(raw)) list = raw;
        else if (raw && typeof raw === 'object') {
          list = raw.schools ?? raw.data ?? [];
        }
        const normalized = (Array.isArray(list) ? list : [])
          .map((s) => {
            const r = s as Record<string, unknown>;
            return {
              id: String(r.id ?? r.school_id ?? ''),
              name: String(r.name ?? r.nome ?? ''),
            };
          })
          .filter((s) => s.id);
        setSchools(normalized);

        const scopeSchoolIds = scopeSchoolIdsFromPack(packScopeRef.current);
        if (scopeSchoolIds.length > 0) {
          const allowed = new Set(normalized.map((s) => s.id));
          setSelectedSchoolIds(
            new Set(scopeSchoolIds.filter((id) => allowed.has(id)))
          );
        }
      })
      .catch(() => setSchools([]))
      .finally(() => setLoadingSchools(false));
  }, [selectedCityId]);

  const refreshClasses = useCallback(async () => {
    if (selectedCityId === OFFLINE_SELECT_NONE) {
      setClasses([]);
      return;
    }
    setLoadingClasses(true);
    try {
      const req = { meta: { cityId: selectedCityId } };
      const schoolList = [...selectedSchoolIds];
      let list: ClassRow[] = [];
      if (schoolList.length === 0) {
        const raw = await EvaluationResultsApiService.getFilteredClasses({
          municipality_id: selectedCityId,
        });
        list = normalizeToClassRows(raw);
      } else {
        const chunks = await Promise.all(
          schoolList.map((sid) =>
            api.get<unknown>(`/classes/school/${sid}`, req).then((r) => normalizeToClassRows(r.data))
          )
        );
        list = chunks.flat();
      }
      setClasses(list);
      const allowed = new Set(list.map((c) => c.id));
      const scopeClassIds = scopeClassIdsFromPack(packScopeRef.current);
      setSelectedClassIds((prev) => {
        const merged = new Set([...prev, ...scopeClassIds]);
        return new Set([...merged].filter((id) => allowed.has(id)));
      });
    } catch {
      setClasses([]);
    } finally {
      setLoadingClasses(false);
    }
  }, [selectedCityId, selectedSchoolIds]);

  useEffect(() => {
    refreshClasses();
  }, [refreshClasses]);

  useEffect(() => {
    if (selectedStateId === OFFLINE_SELECT_NONE || selectedCityId === OFFLINE_SELECT_NONE) {
      setTests([]);
      return;
    }
    setLoadingTests(true);
    EvaluationResultsApiService.getFilterEvaluations({
      estado: selectedStateId,
      municipio: selectedCityId,
      ...(adminCityIdQuery ? { city_id: adminCityIdQuery } : {}),
    })
      .then((av) => {
        const rows = Array.isArray(av) ? av : [];
        const normalized = rows.map((t) => ({
          id: String(t.id),
          titulo: String(t.titulo),
        }));
        setTests(normalized);

        const scopeTestIds = scopeTestIdsFromPack(packScopeRef.current);
        if (scopeTestIds.length > 0) {
          const allowed = new Set(normalized.map((t) => t.id));
          setSelectedTestIds(new Set(scopeTestIds.filter((id) => allowed.has(id))));
        }
      })
      .catch(() => setTests([]))
      .finally(() => setLoadingTests(false));
  }, [selectedStateId, selectedCityId, adminCityIdQuery]);

  useEffect(() => {
    if (!singleClassIdForStudents || selectedCityId === OFFLINE_SELECT_NONE) {
      setStudents([]);
      return;
    }
    let cancelled = false;
    setLoadingStudents(true);
    const req = { meta: { cityId: selectedCityId } };
    (async () => {
      try {
        let res;
        try {
          res = await api.get<Record<string, unknown>[]>(
            `/classes/${singleClassIdForStudents}/students`,
            req
          );
        } catch {
          res = await api.get(`/students/classes/${singleClassIdForStudents}`, req);
        }
        if (cancelled) return;
        const data = res.data as Record<string, unknown>[] | undefined;
        const rows = Array.isArray(data) ? data : [];
        setStudents(
          rows.map((s) => ({
            id: String(s.id ?? ''),
            name: String(s.nome ?? s.name ?? '—'),
          }))
        );
      } catch {
        if (!cancelled) setStudents([]);
      } finally {
        if (!cancelled) setLoadingStudents(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [singleClassIdForStudents, selectedCityId]);

  /** Pré-seleciona escopo do GET assim que o município existe (antes das listas). */
  useEffect(() => {
    const scope = packScopeRef.current;
    if (!scope || scopeInitialSyncDoneRef.current) return;
    if (selectedCityId === OFFLINE_SELECT_NONE) return;

    applyScopeToSelectionState(scope, {
      setScopeMode,
      setSelectedSchoolIds,
      setSelectedTestIds,
      setSelectedClassIds,
      setSelectedStudentIds,
    });
  }, [initialScope, selectedCityId]);

  /** Reforça seleções após escolas/turmas/provas carregarem (edição). */
  useEffect(() => {
    const scope = packScopeRef.current;
    if (!scope || scopeInitialSyncDoneRef.current) return;
    if (selectedCityId === OFFLINE_SELECT_NONE) return;
    if (loadingSchools || loadingClasses || loadingTests) return;

    const parsed = setsFromScope(scope);
    if (parsed.scopeMode === 'municipality') {
      scopeInitialSyncDoneRef.current = true;
      return;
    }

    if (parsed.schoolIds.size > 0 && schools.length === 0) return;
    if (parsed.classIds.size > 0 && classes.length === 0) return;
    if (parsed.testIds.size > 0 && tests.length === 0) return;

    applyScopeToSelectionState(scope, {
      setScopeMode,
      setSelectedSchoolIds,
      setSelectedTestIds,
      setSelectedClassIds,
      setSelectedStudentIds,
    });
    scopeInitialSyncDoneRef.current = true;
  }, [
    initialScope,
    selectedCityId,
    loadingSchools,
    loadingClasses,
    loadingTests,
    schools.length,
    classes.length,
    tests.length,
  ]);

  useEffect(() => {
    if (initialTtlHours != null) setTtlHours(initialTtlHours);
  }, [initialTtlHours]);

  useEffect(() => {
    if (initialMaxRedemptions != null) setMaxRedemptions(initialMaxRedemptions);
  }, [initialMaxRedemptions]);

  const customScopeValid = useMemo(
    () =>
      selectedSchoolIds.size +
        selectedClassIds.size +
        selectedTestIds.size +
        selectedStudentIds.size >
      0,
    [selectedSchoolIds, selectedClassIds, selectedTestIds, selectedStudentIds]
  );

  const ttlValid = ttlHours >= OFFLINE_PACK_TTL_MIN && ttlHours <= OFFLINE_PACK_TTL_MAX;
  const maxRedemptionsValid =
    maxRedemptions >= Math.max(OFFLINE_PACK_MAX_REDEMPTIONS_MIN, minMaxRedemptions) &&
    maxRedemptions <= OFFLINE_PACK_MAX_REDEMPTIONS_MAX;

  const scopeFormValid = scopeMode === 'municipality' || customScopeValid;
  const canSubmit = hasCityContext && ttlValid && maxRedemptionsValid && scopeFormValid;

  const selections = useMemo(
    () => ({
      schoolIds: selectedSchoolIds,
      testIds: selectedTestIds,
      classIds: selectedClassIds,
      studentIds: selectedStudentIds,
    }),
    [selectedSchoolIds, selectedTestIds, selectedClassIds, selectedStudentIds]
  );

  return {
    user,
    isAdmin,
    hasCityContext,
    cityIdForAdminHeader,
    effectiveCityIdForQuery,
    states,
    cities,
    schools,
    grades,
    classes,
    tests,
    students,
    visibleClasses,
    singleClassIdForStudents,
    selectedStateId,
    setSelectedStateId,
    selectedCityId,
    setSelectedCityId,
    scopeMode,
    setScopeMode,
    selectedSchoolIds,
    setSelectedSchoolIds,
    selectedGradeIds,
    setSelectedGradeIds,
    selectedClassIds,
    setSelectedClassIds,
    selectedTestIds,
    setSelectedTestIds,
    selectedStudentIds,
    setSelectedStudentIds,
    ttlHours,
    setTtlHours,
    maxRedemptions,
    setMaxRedemptions,
    loadingStates,
    loadingCities,
    loadingSchools,
    loadingClasses,
    loadingTests,
    loadingStudents,
    customScopeValid,
    canSubmit,
    scopeFormValid,
    ttlValid,
    maxRedemptionsValid,
    selections,
    minMaxRedemptions,
  };
}
