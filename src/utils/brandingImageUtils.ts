import { BASE_URL } from '@/lib/api';

/**
 * Cache de blob URLs do branding municipal para evitar refetch ao re-renderizar.
 * Key: `${url}_${token}_${cityId ?? ''}` -> blob URL.
 */
const brandingBlobCache = new Map<string, string>();

function getStoredJwt(): string {
  return localStorage.getItem('token') || '';
}

function getStoredCityId(): string | undefined {
  try {
    const userJson = localStorage.getItem('user');
    if (!userJson) return undefined;
    const user = JSON.parse(userJson) as { city_id?: string; tenant_id?: string };
    return user.city_id || user.tenant_id || undefined;
  } catch {
    return undefined;
  }
}

function extractCityIdFromBrandingPath(url: string): string | undefined {
  const path = url.startsWith('/') ? url : `/${url}`;
  const match = /^\/city\/([^/]+)\/branding(\/|$)/.exec(path);
  return match?.[1];
}

/**
 * Indica se a URL aponta para uma rota autenticada de branding municipal
 * (`/city/<id>/branding/...`). Essas rotas exigem `Authorization: Bearer <jwt>`.
 */
export function isBrandingProxyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (/^https?:\/\//i.test(url)) return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return false;
  const path = url.startsWith('/') ? url : `/${url}`;
  return /^\/city\/[^/]+\/branding(\/|$)/.test(path);
}

async function fetchBrandingBlob(
  url: string,
  token: string,
  cityId?: string
): Promise<Blob | null> {
  const path = url.startsWith('/') ? url : `/${url}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'image/*,application/pdf;q=0.8,*/*;q=0.5',
  };
  const resolvedCityId = cityId || extractCityIdFromBrandingPath(url);
  if (resolvedCityId) headers['X-City-ID'] = resolvedCityId;

  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) return null;
  return await res.blob();
}

/**
 * Carrega a URL servida pela rota proxy de branding e devolve um blob URL utilizável
 * em `<img src>` ou `<a href>`. Para URLs externas / data: / blob: retorna a própria URL.
 */
export async function loadBrandingImage(
  imageUrl: string | null | undefined,
  token?: string,
  cityId?: string
): Promise<string | undefined> {
  if (!imageUrl) return undefined;
  if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) return imageUrl;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;

  const effectiveToken = token ?? getStoredJwt();
  const effectiveCityId = cityId ?? getStoredCityId();

  if (!isBrandingProxyUrl(imageUrl)) {
    return imageUrl;
  }

  const cacheKey = `${imageUrl}_${effectiveToken}_${effectiveCityId ?? ''}`;
  const cached = brandingBlobCache.get(cacheKey);
  if (cached) return cached;

  try {
    const blob = await fetchBrandingBlob(imageUrl, effectiveToken, effectiveCityId);
    if (!blob) return undefined;
    const blobUrl = URL.createObjectURL(blob);
    brandingBlobCache.set(cacheKey, blobUrl);
    return blobUrl;
  } catch {
    return undefined;
  }
}

/**
 * Revoga um blob URL específico e remove do cache.
 */
export function revokeBrandingImage(
  imageUrl: string | null | undefined,
  token?: string,
  cityId?: string
): void {
  if (!imageUrl) return;
  const effectiveToken = token ?? getStoredJwt();
  const effectiveCityId = cityId ?? getStoredCityId();
  const cacheKey = `${imageUrl}_${effectiveToken}_${effectiveCityId ?? ''}`;
  const blobUrl = brandingBlobCache.get(cacheKey);
  if (blobUrl && blobUrl.startsWith('blob:')) {
    URL.revokeObjectURL(blobUrl);
    brandingBlobCache.delete(cacheKey);
  }
}

/**
 * Limpa todos os blobs do cache para liberar memória.
 */
export function revokeAllBrandingImages(): void {
  for (const blobUrl of brandingBlobCache.values()) {
    if (blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(blobUrl);
    }
  }
  brandingBlobCache.clear();
}
