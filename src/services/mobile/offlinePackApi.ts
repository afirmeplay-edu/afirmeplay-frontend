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
  gabarito_ids?: string[];
  form_ids?: string[];
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
      gabarito_ids: string[];
      form_ids: string[];
      class_ids: string[];
      /** Omitir quando o escopo é por turma/escola/prova — não enviar array vazio. */
      student_ids?: string[];
    };

export interface OfflinePackItem {
  offline_pack_id: string;
  code: string | null;
  scope: OfflinePackScope;
  content_type?: OfflinePackContentType;
  expires_at: string;
  max_redemptions: number;
  redemptions_count: number;
  revoked_at: string | null;
  created_at: string | null;
  is_expired: boolean;
  can_edit: boolean;
  can_delete: boolean;
  created_by_user_id: string | null;
}

export interface OfflinePackListResponse {
  items: OfflinePackItem[];
  total: number;
}

export interface OfflinePackContentType {
  include_tests: boolean;
  include_gabaritos: boolean;
  include_forms: boolean;
}

export interface RegisterOfflinePackRequest {
  scope: OfflinePackScopePayload;
  ttl_hours: number;
  max_redemptions: number;
  content_type: OfflinePackContentType;
}

export interface OfflinePackQrCodeFields {
  qr_code_png_base64: string;
  qr_code_data_url: string;
}

export interface RegisterOfflinePackResponse extends OfflinePackQrCodeFields {
  code: string;
  offline_pack_id: string;
  expires_at: string;
  max_redemptions: number;
  scope: OfflinePackScope;
}

export interface OfflinePackQrCodeResponse extends OfflinePackQrCodeFields {
  offline_pack_id: string;
  code: string;
}

export const OFFLINE_PACK_QR_LEGACY_MESSAGE =
  'Código indisponível para gerar QR — pacote legado sem código de ativação.';

export interface PatchOfflinePackRequest {
  scope?: OfflinePackScopePayload;
  ttl_hours?: number;
  max_redemptions?: number;
  content_type?: OfflinePackContentType;
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

export async function getOfflinePackQrCode(
  offlinePackId: string,
  cityIdForAdmin?: string
): Promise<OfflinePackQrCodeResponse> {
  const { data } = await api.get<OfflinePackQrCodeResponse>(
    `/mobile/v1/offline-pack/${offlinePackId}/qrcode`,
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
  forbidden: string[];
}

export const OFFLINE_PACK_DELETE_FORBIDDEN_MESSAGE =
  'Sem permissão — apenas o criador ou administrador pode excluir este código.';

export const OFFLINE_PACK_EDIT_FORBIDDEN_MESSAGE =
  'Sem permissão — apenas o criador ou administrador pode editar este código.';

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
    gabaritoIds: Set<string>;
    formIds: Set<string>;
    classIds: Set<string>;
    studentIds: Set<string>;
  }
): OfflinePackScopePayload {
  if (scopeMode === 'municipality') {
    return { type: 'municipality' };
  }
  const studentIds = [...selections.studentIds];
  return {
    type: 'custom',
    school_ids: [...selections.schoolIds],
    test_ids: [...selections.testIds],
    gabarito_ids: [...selections.gabaritoIds],
    form_ids: [...selections.formIds],
    class_ids: [...selections.classIds],
    ...(studentIds.length > 0 ? { student_ids: studentIds } : {}),
  };
}

export function isOfflinePackForbiddenError(err: unknown): boolean {
  const ax = err as { response?: { status?: number } };
  return ax.response?.status === 403;
}

export function getOfflinePackApiError(
  err: unknown,
  fallback: string,
  forbiddenFallback?: string
): string {
  const ax = err as { response?: { data?: { message?: string; error?: string } } };
  if (isOfflinePackForbiddenError(err) && forbiddenFallback) {
    return forbiddenFallback;
  }
  return String(ax.response?.data?.error || ax.response?.data?.message || fallback);
}
