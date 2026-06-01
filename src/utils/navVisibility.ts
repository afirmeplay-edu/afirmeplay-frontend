import {
  canUseFeature,
  shouldBypassPlanMenuFilter,
  type Entitlements,
} from '@/types/entitlements';
import { resolveFeatureForHref } from '@/lib/featureCatalog';
import { hasRestrictedStaffAccess } from '@/utils/restrictedStaffAccess';

export type NavLinkLike = {
  href?: string;
  role: string[];
  feature?: string;
  children?: NavLinkLike[];
};

export function isNavItemVisible(
  link: NavLinkLike,
  userRole: string,
  entitlements: Entitlements | null | undefined,
  bypassPlanFilter: boolean,
  restrictedStaffAllowedHrefs?: Set<string>
): boolean {
  if (!link.role.includes(userRole)) return false;

  if (restrictedStaffAllowedHrefs) {
    const hasChildren = Boolean(link.children?.length);
    if (!hasChildren && (!link.href || !restrictedStaffAllowedHrefs.has(link.href))) {
      return false;
    }
  }

  if (!bypassPlanFilter) {
    const feature = link.feature ?? resolveFeatureForHref(link.href);
    if (feature && !canUseFeature(entitlements, feature)) {
      return false;
    }
  }

  return true;
}

export function filterNavLinks<T extends NavLinkLike>(
  links: T[],
  user: { role?: string | null; entitlements?: Entitlements },
  restrictedStaffAllowedHrefs?: Set<string>
): T[] {
  const role = user.role ?? '';
  const bypassPlan = shouldBypassPlanMenuFilter(user);
  const entitlements = user.entitlements;

  return links
    .map((link) => {
      if (!isNavItemVisible(link, role, entitlements, bypassPlan, restrictedStaffAllowedHrefs)) {
        return null;
      }
      if (link.children?.length) {
        const children = filterNavLinks(link.children, user, restrictedStaffAllowedHrefs);
        if (children.length === 0) return null;
        return { ...link, children };
      }
      return link;
    })
    .filter((link): link is T => Boolean(link));
}
