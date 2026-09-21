import { api } from '@/lib/api';
import type {
  StoreItemAdmin,
  StoreItemCreatePayload,
  StoreAdminItemsResponse,
  StoreAllowedScopesResponse,
  StoreRequirementOptionsResponse,
} from '@/types/store';

function cityConfig(cityId?: string | null): { meta?: { cityId: string } } {
  return cityId ? { meta: { cityId } } : {};
}

export const storeAdminApi = {
  getAdminItems(activeOnly?: boolean, cityId?: string | null) {
    const params = activeOnly !== undefined ? { active_only: String(activeOnly) } : undefined;
    return api.get<StoreAdminItemsResponse>('/store/admin/items', {
      params,
      ...cityConfig(cityId),
    });
  },

  getAllowedScopes(cityId?: string | null) {
    return api.get<StoreAllowedScopesResponse>('/store/admin/allowed-scopes', cityConfig(cityId));
  },

  getRequirementOptions(cityId?: string | null) {
    return api.get<StoreRequirementOptionsResponse>('/store/admin/requirement-options', cityConfig(cityId));
  },

  createItem(payload: StoreItemCreatePayload, cityId?: string | null) {
    return api.post<StoreItemAdmin>('/store/admin/items', payload, cityConfig(cityId));
  },

  updateItem(itemId: string, payload: Partial<StoreItemCreatePayload>, cityId?: string | null) {
    return api.put<StoreItemAdmin>(`/store/admin/items/${itemId}`, payload, cityConfig(cityId));
  },

  deleteItem(itemId: string, cityId?: string | null) {
    return api.delete(`/store/admin/items/${itemId}`, cityConfig(cityId));
  },
};
