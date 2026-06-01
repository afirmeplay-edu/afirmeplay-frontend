export type PlanCode = 'basic' | 'plus';

export type Entitlements = {
  plan_code: PlanCode;
  features: string[];
  plus_only_features: string[];
};

export type PlanInsufficientError = {
  erro?: string;
  mensagem?: string;
  plan_code?: PlanCode;
  required_plan?: PlanCode;
  feature?: string;
};

export function canUseFeature(
  entitlements: Entitlements | null | undefined,
  code: string
): boolean {
  if (!entitlements) return true;
  return entitlements.features.includes(code);
}

export function isPlusLocked(
  entitlements: Entitlements | null | undefined,
  code: string
): boolean {
  if (!entitlements) return false;
  return (
    entitlements.plus_only_features.includes(code) &&
    !entitlements.features.includes(code)
  );
}

export function isPlusPlan(entitlements: Entitlements | null | undefined): boolean {
  return entitlements?.plan_code === 'plus';
}

/** Admin global: menu mostra tudo; plano não filtra navegação. */
export function shouldBypassPlanMenuFilter(user?: {
  role?: string | null;
} | null): boolean {
  return (user?.role ?? '').toLowerCase() === 'admin';
}

export function mergeUserPreservingEntitlements<T extends Record<string, unknown>>(
  base: T,
  patch: Record<string, unknown>
): T {
  const planCode = patch.plan_code ?? base.plan_code;
  const entitlements = patch.entitlements ?? base.entitlements;
  return {
    ...base,
    ...patch,
    ...(planCode !== undefined ? { plan_code: planCode } : {}),
    ...(entitlements !== undefined ? { entitlements } : {}),
  } as T;
}

export function isPlanInsufficientError(data: unknown): data is PlanInsufficientError {
  if (!data || typeof data !== 'object') return false;
  const err = data as PlanInsufficientError;
  return err.erro === 'Plano insuficiente';
}
