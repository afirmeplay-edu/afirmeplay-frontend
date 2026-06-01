import { useAuth } from '@/context/authContext';
import { shouldBypassPlanMenuFilter, type Entitlements } from '@/types/entitlements';

/** Entitlements efetivos para filtro de menu (plano do município do usuário). */
export function useEffectiveEntitlements(): Entitlements | null | undefined {
  const { user } = useAuth();
  if (shouldBypassPlanMenuFilter(user)) return null;
  return user.entitlements;
}

export function useCanUseFeature(feature: string): boolean {
  const { user } = useAuth();
  const entitlements = useEffectiveEntitlements();
  if (shouldBypassPlanMenuFilter(user)) return true;
  if (!entitlements) return true;
  return entitlements.features.includes(feature);
}
