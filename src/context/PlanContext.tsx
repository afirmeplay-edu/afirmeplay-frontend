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
import { setStoredReferenceCityId } from '@/lib/planReferenceStorage';
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
};

const PlanContext = createContext<PlanContextValue | null>(null);

function normalizeCityList(data: unknown): ReferenceCity[] {
  if (Array.isArray(data)) return data as ReferenceCity[];
  if (data && typeof data === 'object' && Array.isArray((data as { cities?: unknown }).cities)) {
    return (data as { cities: ReferenceCity[] }).cities;
  }
  return [];
}

function resolveReferenceCityId(cities: ReferenceCity[]): string | null {
  const subdomain = getSubdomainFromHost();
  if (subdomain) {
    const match = cities.find((c) => (c.slug ?? '').toLowerCase() === subdomain);
    if (match) return match.id;
  }
  if (cities.length === 1) return cities[0].id;
  return null;
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = (user.role ?? '').toLowerCase();
  const isAdmin = role === 'admin';

  const [referenceCityId, setReferenceCityIdState] = useState<string | null>(null);
  const [referenceCity, setReferenceCity] = useState<ReferenceCity | null>(null);

  const applyReferenceCityId = useCallback((cityId: string | null) => {
    setReferenceCityIdState(cityId);
    setStoredReferenceCityId(cityId);
  }, []);

  useEffect(() => {
    if (!isAdmin || !user.id) {
      applyReferenceCityId(null);
      setReferenceCity(null);
      return;
    }

    let cancelled = false;
    api
      .get('/city/')
      .then((res) => {
        if (cancelled) return;
        const cities = normalizeCityList(res.data);
        applyReferenceCityId(resolveReferenceCityId(cities));
      })
      .catch(() => {
        if (!cancelled) applyReferenceCityId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, user.id, applyReferenceCityId]);

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
    }),
    [referenceCityId, referenceCity, referenceEntitlements]
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
