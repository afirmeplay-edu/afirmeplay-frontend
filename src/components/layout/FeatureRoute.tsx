import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/authContext';
import { useEffectiveEntitlements } from '@/hooks/useEffectiveEntitlements';
import {
  canUseFeature,
  shouldBypassPlanMenuFilter,
} from '@/types/entitlements';

interface FeatureRouteProps {
  feature: string;
  children: ReactNode;
  /** Rota quando a feature não está no plano do município (não-admin). */
  fallbackTo?: string;
}

export function FeatureRoute({
  feature,
  children,
  fallbackTo = '/app',
}: FeatureRouteProps) {
  const { user } = useAuth();
  const entitlements = useEffectiveEntitlements();

  if (shouldBypassPlanMenuFilter(user)) {
    return <>{children}</>;
  }

  if (!canUseFeature(entitlements, feature)) {
    return <Navigate to={fallbackTo} replace />;
  }

  return <>{children}</>;
}
