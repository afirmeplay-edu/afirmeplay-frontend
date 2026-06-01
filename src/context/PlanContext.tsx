import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/authContext';
import {
  getStoredReferenceCityId,
  setStoredReferenceCityId,
} from '@/lib/planReferenceStorage';
import { getSubdomainFromHost } from '@/utils/subdomain';
import type { Entitlements, PlanCode } from '@/types/entitlements';

export type ReferenceCity = {
  id: string;
  name: string;
  state?: string;
  slug?: string;
  plan_code?: PlanCode;
  entitlements?: Entitlements;
};

type PlanContextValue = {
  referenceCityId: string | null;
  referenceCity: ReferenceCity | null;
  referenceEntitlements: Entitlements | null;
  cities: ReferenceCity[];
  citiesLoading: boolean;
  setReferenceCityId: (cityId: string | null) => void;
  refreshReferenceCity: () => Promise<void>;
};

const PlanContext = createContext<PlanContextValue | null>(null);

function normalizeCityList(data: unknown): ReferenceCity[] {
  if (Array.isArray(data)) return data as ReferenceCity[];
  if (data && typeof data === 'object' && Array.isArray((data as { cities?: unknown }).cities)) {
    return (data as { cities: ReferenceCity[] }).cities;
  }
  return [];
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = (user.role ?? '').toLowerCase();
  const isAdmin = role === 'admin';

  const [cities, setCities] = useState<ReferenceCity[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [referenceCityId, setReferenceCityIdState] = useState<string | null>(() =>
    getStoredReferenceCityId()
  );
  const [referenceCity, setReferenceCity] = useState<ReferenceCity | null>(null);

  const setReferenceCityId = useCallback((cityId: string | null) => {
    setReferenceCityIdState(cityId);
    setStoredReferenceCityId(cityId);
  }, []);

  useEffect(() => {
    if (!isAdmin || !user.id) {
      setCities([]);
      return;
    }

    let cancelled = false;
    setCitiesLoading(true);
    api
      .get('/city/')
      .then((res) => {
        if (cancelled) return;
        setCities(normalizeCityList(res.data));
      })
      .catch(() => {
        if (!cancelled) setCities([]);
      })
      .finally(() => {
        if (!cancelled) setCitiesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, user.id]);

  useEffect(() => {
    if (!isAdmin || cities.length === 0) return;

    const stored = getStoredReferenceCityId();
    if (stored && cities.some((c) => c.id === stored)) {
      if (stored !== referenceCityId) setReferenceCityIdState(stored);
      return;
    }

    const subdomain = getSubdomainFromHost();
    if (subdomain) {
      const match = cities.find((c) => (c.slug ?? '').toLowerCase() === subdomain);
      if (match) {
        setReferenceCityId(match.id);
        return;
      }
    }

    if (!referenceCityId && cities.length === 1) {
      setReferenceCityId(cities[0].id);
    }
  }, [isAdmin, cities, referenceCityId, setReferenceCityId]);

  const refreshReferenceCity = useCallback(async () => {
    if (!referenceCityId) {
      setReferenceCity(null);
      return;
    }
    try {
      const { data } = await api.get<ReferenceCity>(`/city/${referenceCityId}`);
      setReferenceCity(data);
    } catch {
      setReferenceCity(null);
    }
  }, [referenceCityId]);

  useEffect(() => {
    if (!isAdmin) {
      setReferenceCity(null);
      return;
    }
    void refreshReferenceCity();
  }, [isAdmin, refreshReferenceCity]);

  const referenceEntitlements = useMemo(
    () => referenceCity?.entitlements ?? null,
    [referenceCity?.entitlements]
  );

  const value = useMemo<PlanContextValue>(
    () => ({
      referenceCityId,
      referenceCity,
      referenceEntitlements,
      cities,
      citiesLoading,
      setReferenceCityId,
      refreshReferenceCity,
    }),
    [
      referenceCityId,
      referenceCity,
      referenceEntitlements,
      cities,
      citiesLoading,
      setReferenceCityId,
      refreshReferenceCity,
    ]
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlanContext(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    throw new Error('usePlanContext deve ser usado dentro de PlanProvider');
  }
  return ctx;
}

export function usePlanContextOptional(): PlanContextValue | null {
  return useContext(PlanContext);
}
