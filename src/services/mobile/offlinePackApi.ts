import { api } from '@/lib/api';

export const OFFLINE_PACK_TTL_MIN = 1;
export const OFFLINE_PACK_TTL_MAX = 336;
export const OFFLINE_PACK_TTL_DEFAULT = 48;
export const OFFLINE_PACK_MAX_REDEMPTIONS_MIN = 1;
export const OFFLINE_PACK_MAX_REDEMPTIONS_MAX = 10000;
export const OFFLINE_PACK_MAX_REDEMPTIONS_DEFAULT = 50;

export type OfflinePackScopeMunicipality = { type: 'municipality' };

export type OfflinePackScopeCustom = {
  type: 'custom';
  school_ids?: string[];
  test_ids?: string[];
  class_ids?: string[];
  student_ids?: string[];
};

export type OfflinePackScope = OfflinePackScopeMunicipality | OfflinePackScopeCustom;

export type OfflinePackScopePayload =
  | { type: 'municipality' }
  | {
      type: 'custom';
      school_ids: string[];
      test_ids: string[];
      class_ids: string[];
      student_ids: string[];
    };

export interface OfflinePackItem {
  offline_pack_id: string;
  code: string | null;
  scope: OfflinePackScope;
  expires_at: string;
  max_redemptions: number;
  redemptions_count: number;
  revoked_at: string | null;
  created_at: string | null;
  is_expired: boolean;
}

export interface OfflinePackListResponse {
  items: OfflinePackItem[];
  total: number;
}

export interface RegisterOfflinePackRequest {
  scope: OfflinePackScopePayload;
  ttl_hours: number;
  max_redemptions: number;
}

export interface RegisterOfflinePackResponse {
  code: string;
  offline_pack_id: string;
  expires_at: string;
  max_redemptions: number;
  scope: OfflinePackScope;
}

export interface PatchOfflinePackRequest {
  scope?: OfflinePackScopePayload;
  ttl_hours?: number;
  max_redemptions?: number;
}

function offlinePackConfig(cityIdForAdmin?: string) {
  return cityIdForAdmin ? { meta: { cityId: cityIdForAdmin } } : {};
}

export async function registerOfflinePack(
  body: RegisterOfflinePackRequest,
  cityIdForAdmin?: string
): Promise<RegisterOfflinePackResponse> {
  const { data } = await api.post<RegisterOfflinePackResponse>(
    '/mobile/v1/offline-pack/register',
    body,
    offlinePackConfig(cityIdForAdmin)
  );
  return data;
}

export async function listOfflinePacks(
  includeExpired = true,
  cityIdForAdmin?: string
): Promise<OfflinePackListResponse> {
  const { data } = await api.get<OfflinePackListResponse>('/mobile/v1/offline-pack', {
    params: includeExpired ? { include_expired: 1 } : undefined,
    ...offlinePackConfig(cityIdForAdmin),
  });
  return data;
}

export async function getOfflinePack(
  offlinePackId: string,
  cityIdForAdmin?: string
): Promise<OfflinePackItem> {
  const { data } = await api.get<OfflinePackItem>(
    `/mobile/v1/offline-pack/${offlinePackId}`,
    offlinePackConfig(cityIdForAdmin)
  );
  return data;
}

export async function patchOfflinePack(
  offlinePackId: string,
  body: PatchOfflinePackRequest,
  cityIdForAdmin?: string
): Promise<OfflinePackItem> {
  const { data } = await api.patch<OfflinePackItem>(
    `/mobile/v1/offline-pack/${offlinePackId}`,
    body,
    offlinePackConfig(cityIdForAdmin)
  );
  return data;
}

export interface DeleteOfflinePackResponse {
  deleted: boolean;
  offline_pack_id: string;
}

export interface BulkDeleteOfflinePacksResponse {
  deleted: string[];
  not_found: string[];
}

export async function deleteOfflinePack(
  offlinePackId: string,
  cityIdForAdmin?: string
): Promise<DeleteOfflinePackResponse> {
  const { data } = await api.delete<DeleteOfflinePackResponse>(
    `/mobile/v1/offline-pack/${offlinePackId}`,
    offlinePackConfig(cityIdForAdmin)
  );
  return data;
}

export async function bulkDeleteOfflinePacks(
  offlinePackIds: string[],
  cityIdForAdmin?: string
): Promise<BulkDeleteOfflinePacksResponse> {
  const { data } = await api.post<BulkDeleteOfflinePacksResponse>(
    '/mobile/v1/offline-pack/bulk-delete',
    { offline_pack_ids: offlinePackIds },
    offlinePackConfig(cityIdForAdmin)
  );
  return data;
}

export function buildScopePayload(
  scopeMode: 'municipality' | 'custom',
  selections: {
    schoolIds: Set<string>;
    testIds: Set<string>;
    classIds: Set<string>;
    studentIds: Set<string>;
  }
): OfflinePackScopePayload {
  if (scopeMode === 'municipality') {
    return { type: 'municipality' };
  }
  return {
    type: 'custom',
    school_ids: [...selections.schoolIds],
    test_ids: [...selections.testIds],
    class_ids: [...selections.classIds],
    student_ids: [...selections.studentIds],
  };
}

export function getOfflinePackApiError(err: unknown, fallback: string): string {
  const ax = err as { response?: { data?: { message?: string; error?: string } } };
  return String(ax.response?.data?.error || ax.response?.data?.message || fallback);
}
