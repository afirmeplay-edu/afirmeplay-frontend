import { api } from "@/lib/api";
import type {
  AtaSalaSavePayload,
  SavedAtaDetail,
  SavedAtaListResponse,
} from "@/types/ata-sala";

function requestConfig(cityId?: string) {
  return cityId && cityId !== "all" ? { meta: { cityId } } : {};
}

export async function listSavedAtas(params?: {
  page?: number;
  per_page?: number;
  search?: string;
  cityId?: string;
}): Promise<SavedAtaListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", String(params.page));
  if (params?.per_page) query.append("per_page", String(params.per_page));
  if (params?.search?.trim()) query.append("search", params.search.trim());
  const url = `/documentos/ata-sala/salvas${query.toString() ? `?${query}` : ""}`;
  const response = await api.get(url, requestConfig(params?.cityId));
  return response.data;
}

export async function getSavedAta(id: string, cityId?: string): Promise<SavedAtaDetail> {
  const response = await api.get(`/documentos/ata-sala/salvas/${id}`, requestConfig(cityId));
  return response.data;
}

export async function createSavedAta(
  payload: AtaSalaSavePayload,
  cityId?: string
): Promise<SavedAtaDetail> {
  const response = await api.post("/documentos/ata-sala/salvas", payload, requestConfig(cityId));
  return response.data;
}

export async function updateSavedAta(
  id: string,
  payload: AtaSalaSavePayload,
  cityId?: string
): Promise<SavedAtaDetail> {
  const response = await api.put(`/documentos/ata-sala/salvas/${id}`, payload, requestConfig(cityId));
  return response.data;
}

export async function deleteSavedAta(id: string, cityId?: string): Promise<{ message: string; id: string }> {
  const response = await api.delete(`/documentos/ata-sala/salvas/${id}`, requestConfig(cityId));
  return response.data;
}

export function getAtaSalaApiError(err: unknown, fallback = "Erro na operação."): string {
  const axiosErr = err as { response?: { data?: { error?: string; details?: string } } };
  return axiosErr.response?.data?.error || axiosErr.response?.data?.details || fallback;
}
