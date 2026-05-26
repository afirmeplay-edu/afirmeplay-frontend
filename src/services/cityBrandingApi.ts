import { api } from '@/lib/api';
import type { AxiosRequestConfig } from 'axios';

export interface CityBrandingPresigned {
  logo_url: string | null;
  letterhead_image_url: string | null;
  letterhead_pdf_url: string | null;
}

export type CityBrandingUrls = CityBrandingPresigned;

export interface CityBrandingResponse {
  city_id: string;
  logo_object_key: string | null;
  letterhead_image_object_key: string | null;
  letterhead_pdf_object_key: string | null;
  presigned: CityBrandingPresigned;
  urls?: CityBrandingUrls;
}

export interface UploadLogoResponse {
  mensagem: string;
  logo_object_key: string;
  presigned: string;
  url?: string;
}

export interface UploadLetterheadPresigned {
  letterhead_image_url: string;
  letterhead_pdf_url: string | null;
}

export interface UploadLetterheadResponse {
  mensagem: string;
  letterhead_image_object_key: string;
  letterhead_pdf_object_key: string | null;
  presigned: UploadLetterheadPresigned;
  urls?: UploadLetterheadPresigned;
}

export interface DeleteBrandingResponse {
  mensagem: string;
  city_id: string;
}

function cityMeta(cityId: string): Pick<AxiosRequestConfig, 'meta'> {
  return { meta: { cityId } };
}

export async function getCityBranding(cityId: string): Promise<CityBrandingResponse> {
  const { data } = await api.get<CityBrandingResponse>(`/city/${cityId}/branding`, cityMeta(cityId));
  return data;
}

export async function uploadCityLogo(cityId: string, file: File, replace: boolean): Promise<UploadLogoResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const q = replace ? '?replace=true' : '';
  const { data } = await api.post<UploadLogoResponse>(`/city/${cityId}/branding/logo${q}`, formData, {
    ...cityMeta(cityId),
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function uploadCityLetterhead(
  cityId: string,
  file: File,
  options: { replace: boolean; storePdf: boolean }
): Promise<UploadLetterheadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const params = new URLSearchParams();
  if (options.replace) params.set('replace', 'true');
  if (!options.storePdf) params.set('store_pdf', 'false');
  const q = params.toString() ? `?${params.toString()}` : '';
  const { data } = await api.post<UploadLetterheadResponse>(
    `/city/${cityId}/branding/letterhead${q}`,
    formData,
    {
      ...cityMeta(cityId),
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  );
  return data;
}

export async function deleteCityBranding(
  cityId: string,
  flags: { logo: boolean; letterhead: boolean }
): Promise<DeleteBrandingResponse> {
  const params = new URLSearchParams();
  if (flags.logo) params.set('logo', 'true');
  if (flags.letterhead) params.set('letterhead', 'true');
  const q = params.toString() ? `?${params.toString()}` : '';
  const { data } = await api.delete<DeleteBrandingResponse>(`/city/${cityId}/branding${q}`, cityMeta(cityId));
  return data;
}

export function getBrandingErrorMessage(err: unknown): string {
  const ax = err as { response?: { data?: { erro?: string; message?: string } } };
  const d = ax?.response?.data;
  return d?.erro || d?.message || 'Não foi possível concluir a operação.';
}

/**
 * Retorna o conjunto de URLs do branding municipal preferindo o campo novo `urls`,
 * com fallback para `presigned` por compatibilidade.
 */
export function resolveBrandingUrls(
  branding: CityBrandingResponse | null | undefined
): CityBrandingPresigned {
  if (!branding) {
    return { logo_url: null, letterhead_image_url: null, letterhead_pdf_url: null };
  }
  const source = branding.urls ?? branding.presigned ?? null;
  return {
    logo_url: source?.logo_url ?? null,
    letterhead_image_url: source?.letterhead_image_url ?? null,
    letterhead_pdf_url: source?.letterhead_pdf_url ?? null,
  };
}

/**
 * Retorna a URL preferencial do logo retornada pelo POST /branding/logo.
 * Prefere o campo novo `url` e mantém compat com `presigned`.
 */
export function resolveUploadedLogoUrl(resp: UploadLogoResponse | null | undefined): string | null {
  if (!resp) return null;
  return resp.url ?? resp.presigned ?? null;
}

/**
 * Retorna o conjunto preferencial de URLs após upload do timbrado.
 * Prefere `urls` e cai em `presigned`.
 */
export function resolveUploadedLetterheadUrls(
  resp: UploadLetterheadResponse | null | undefined
): UploadLetterheadPresigned | null {
  if (!resp) return null;
  return resp.urls ?? resp.presigned ?? null;
}
