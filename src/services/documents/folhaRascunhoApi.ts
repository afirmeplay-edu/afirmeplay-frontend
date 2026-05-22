import { api } from "@/lib/api";
import type { FolhaRascunhoDadosParams, FolhaRascunhoDadosResponse } from "@/types/folha-rascunho";

function requestConfig(cityId?: string) {
  return cityId && cityId !== "all" ? { meta: { cityId } } : {};
}

export async function getFolhaRascunhoDados(
  params: FolhaRascunhoDadosParams
): Promise<FolhaRascunhoDadosResponse> {
  const query = new URLSearchParams();
  query.append("modo", params.modo);
  if (params.estado?.trim()) query.append("estado", params.estado.trim());
  query.append("municipio", params.municipio);
  if (params.escola?.trim()) query.append("escola", params.escola.trim());
  if (params.serie?.trim()) query.append("serie", params.serie.trim());
  if (params.turma?.trim()) query.append("turma", params.turma.trim());
  if (params.evaluation_id?.trim()) query.append("evaluation_id", params.evaluation_id.trim());
  if (params.answer_sheet_id?.trim()) query.append("answer_sheet_id", params.answer_sheet_id.trim());

  const response = await api.get<FolhaRascunhoDadosResponse>(
    `/documentos/folha-rascunho/dados?${query.toString()}`,
    requestConfig(params.municipio)
  );
  return response.data;
}

export function getFolhaRascunhoApiError(err: unknown, fallback = "Erro na operação."): string {
  const axiosErr = err as { response?: { data?: { error?: string; details?: string } } };
  return axiosErr.response?.data?.error || axiosErr.response?.data?.details || fallback;
}
