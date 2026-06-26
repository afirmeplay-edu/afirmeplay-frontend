import { api } from '@/lib/api';

export type HostingMode = 'shared' | 'dedicated';

export interface MobileCityDirectory {
  id: string;
  city_id: string | null;
  city_name: string;
  city_slug: string;
  tenant_code: string;
  api_base_url: string;
  hosting_mode: HostingMode;
  mobile_visible: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AvailableCity {
  id: string;
  name: string;
  slug: string;
  state: string;
}

export interface AddCitySharedRequest {
  city_id: string;
  hosting_mode: 'shared';
}

export interface AddCityDedicatedRequest {
  city_name: string;
  city_slug: string;
  tenant_code: string;
  hosting_mode: 'dedicated';
  api_base_url: string;
}

export type AddCityRequest = AddCitySharedRequest | AddCityDedicatedRequest;

export interface UpdateCityRequest {
  mobile_visible?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export interface MobileCitiesListResponse {
  cities: MobileCityDirectory[];
  total: number;
}

export interface AvailableCitiesResponse {
  cities: AvailableCity[];
  total: number;
}

/**
 * Lista todos os municípios cadastrados no catálogo mobile
 */
export async function listMobileCities(): Promise<MobileCitiesListResponse> {
  const { data } = await api.get<MobileCitiesListResponse>('/mobile/v1/admin/cities');
  return data;
}

/**
 * Lista municípios da VPS central disponíveis para adicionar ao mobile
 */
export async function listAvailableCities(): Promise<AvailableCitiesResponse> {
  const { data } = await api.get<AvailableCitiesResponse>(
    '/mobile/v1/admin/cities/available-for-mobile'
  );
  return data;
}

/**
 * Adiciona um município ao catálogo mobile
 */
export async function addMobileCity(request: AddCityRequest): Promise<MobileCityDirectory> {
  const { data } = await api.post<MobileCityDirectory>('/mobile/v1/admin/cities', request);
  return data;
}

/**
 * Atualiza um município do catálogo mobile
 */
export async function updateMobileCity(
  cityId: string,
  request: UpdateCityRequest
): Promise<MobileCityDirectory> {
  const { data } = await api.put<MobileCityDirectory>(
    `/mobile/v1/admin/cities/${cityId}`,
    request
  );
  return data;
}

/**
 * Remove um município do catálogo mobile
 */
export async function deleteMobileCity(cityId: string): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>(`/mobile/v1/admin/cities/${cityId}`);
  return data;
}

/**
 * Extrai mensagem de erro da resposta da API
 */
export function getMobileCityApiError(err: unknown, fallback: string): string {
  const ax = err as { response?: { data?: { error?: string; message?: string } } };
  return String(ax.response?.data?.error || ax.response?.data?.message || fallback);
}
