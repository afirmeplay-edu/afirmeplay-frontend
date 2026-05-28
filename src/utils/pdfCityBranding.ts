import { getCityBranding, resolveBrandingUrls } from '@/services/cityBrandingApi';
import { BASE_URL } from '@/lib/api';

export type PdfImageAsset = { dataUrl: string; iw: number; ih: number };
type BrandingAssetSet = { letterhead: PdfImageAsset | null; logo: PdfImageAsset | null };

const brandingAssetCache = new Map<string, Promise<BrandingAssetSet>>();

/**
 * Detecta URLs servidas pelas rotas proxy autenticadas do backend para branding municipal.
 * O backend passou a devolver URLs relativas no formato `/city/<id>/branding/...` em vez
 * de URLs presigned do MinIO; essas rotas exigem JWT.
 */
function isAuthenticatedBrandingPath(url: string): boolean {
  if (!url) return false;
  if (/^https?:\/\//i.test(url)) return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return false;
  const path = url.startsWith('/') ? url : `/${url}`;
  return /^\/city\/[^/]+\/branding(\/|$)/.test(path);
}

function buildAuthenticatedBrandingUrl(url: string): string {
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${BASE_URL}${path}`;
}

function getStoredJwt(): string | null {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

function getStoredCityId(): string | null {
  try {
    const userJson = localStorage.getItem('user');
    if (!userJson) return null;
    const user = JSON.parse(userJson) as { city_id?: string; tenant_id?: string };
    return user.city_id || user.tenant_id || null;
  } catch {
    return null;
  }
}

/**
 * Extrai o cityId embutido em uma rota `/city/<id>/branding/...`, quando aplicável.
 */
function extractCityIdFromBrandingPath(url: string): string | null {
  const path = url.startsWith('/') ? url : `/${url}`;
  const match = /^\/city\/([^/]+)\/branding(\/|$)/.exec(path);
  return match?.[1] ?? null;
}

async function fetchAsBlob(url: string): Promise<Blob | null> {
  try {
    if (isAuthenticatedBrandingPath(url)) {
      const target = buildAuthenticatedBrandingUrl(url);
      const headers: Record<string, string> = { Accept: 'image/*,application/pdf;q=0.8,*/*;q=0.5' };
      const token = getStoredJwt();
      if (token) headers.Authorization = `Bearer ${token}`;
      const cityId = extractCityIdFromBrandingPath(url) || getStoredCityId();
      if (cityId) headers['X-City-ID'] = cityId;
      const res = await fetch(target, { headers });
      if (!res.ok) return null;
      return await res.blob();
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export async function urlToPngAsset(url: string): Promise<PdfImageAsset | null> {
  try {
    const blob = await fetchAsBlob(url);
    if (!blob) return null;
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bmp.close();
      return null;
    }
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    return { dataUrl: canvas.toDataURL('image/png'), iw: canvas.width, ih: canvas.height };
  } catch {
    return null;
  }
}

export async function loadCityBrandingPdfAssets(
  cityId: string | null | undefined
): Promise<{ letterhead: PdfImageAsset | null; logo: PdfImageAsset | null }> {
  if (!cityId || cityId === 'all') return { letterhead: null, logo: null };
  const key = String(cityId);
  const cached = brandingAssetCache.get(key);
  if (cached) return cached;

  const loadPromise = (async (): Promise<BrandingAssetSet> => {
    try {
      const branding = await getCityBranding(cityId);
      const urls = resolveBrandingUrls(branding);
      const lhUrl = urls.letterhead_image_url;
      const logoUrl = urls.logo_url;
      const [letterhead, logo] = await Promise.all([
        lhUrl ? urlToPngAsset(lhUrl) : Promise.resolve(null),
        logoUrl ? urlToPngAsset(logoUrl) : Promise.resolve(null),
      ]);
      return { letterhead, logo };
    } catch {
      return { letterhead: null, logo: null };
    }
  })();

  brandingAssetCache.set(key, loadPromise);
  try {
    return await loadPromise;
  } catch {
    brandingAssetCache.delete(key);
    return { letterhead: null, logo: null };
  }
}

export function paintLetterheadBackground(
  doc: { addImage: (src: string, fmt: string, x: number, y: number, w: number, h: number) => void },
  letterhead: PdfImageAsset,
  pageWidthMm: number,
  pageHeightMm: number
): void {
  const imgRatio = letterhead.iw / letterhead.ih;
  const pageRatio = pageWidthMm / pageHeightMm;
  let drawW: number;
  let drawH: number;
  let drawX: number;
  let drawY: number;
  if (imgRatio > pageRatio) {
    drawH = pageHeightMm;
    drawW = pageHeightMm * imgRatio;
    drawX = (pageWidthMm - drawW) / 2;
    drawY = 0;
  } else {
    drawW = pageWidthMm;
    drawH = pageWidthMm / imgRatio;
    drawX = 0;
    drawY = (pageHeightMm - drawH) / 2;
  }
  doc.addImage(letterhead.dataUrl, 'PNG', drawX, drawY, drawW, drawH);
}

export function drawMunicipalLogoTopCenter(
  doc: { addImage: (src: string, fmt: string, x: number, y: number, w: number, h: number) => void },
  pageWidthMm: number,
  y: number,
  logo: PdfImageAsset,
  maxW = 50,
  maxH = 26
): number {
  let lw = maxW;
  let lh = (logo.ih / logo.iw) * lw;
  if (lh > maxH) {
    lh = maxH;
    lw = (logo.iw / logo.ih) * lh;
  }
  doc.addImage(logo.dataUrl, 'PNG', (pageWidthMm - lw) / 2, y, lw, lh);
  return y + lh + 10;
}

export async function resolveReportLogoForPdf(
  cityId: string | null | undefined
): Promise<PdfImageAsset | null> {
  if (!cityId || cityId === 'all') return null;
  try {
    const branding = await getCityBranding(cityId);
    const { logo_url: logoUrl } = resolveBrandingUrls(branding);
    if (!logoUrl) return null;
    return await urlToPngAsset(logoUrl);
  } catch {
    return null;
  }
}

export async function loadDefaultReportLogoAsset(): Promise<PdfImageAsset | null> {
  try {
    const logoPath = '/LOGO-1-menor.png';
    const response = await fetch(logoPath);
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const logoImg = new Image();
    await new Promise<void>((resolve, reject) => {
      logoImg.onload = () => resolve();
      logoImg.onerror = reject;
      logoImg.src = objectUrl;
    });
    URL.revokeObjectURL(objectUrl);
    const iw = logoImg.width;
    const ih = logoImg.height;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    if (iw <= 0 || ih <= 0) return null;
    return { dataUrl, iw, ih };
  } catch {
    return null;
  }
}

export async function loadLogoAssetForLandscapePdf(
  cityId: string | null | undefined
): Promise<PdfImageAsset | null> {
  const municipal = await resolveReportLogoForPdf(cityId);
  if (municipal) return municipal;
  return loadDefaultReportLogoAsset();
}

/**
 * Carrega o conjunto de assets do município para uso em relatórios:
 *  - `logo`: logo municipal quando configurado, com fallback para o logo institucional (`/LOGO-1.png`).
 *  - `letterhead`: timbrado municipal apenas quando configurado (sem fallback).
 *
 * Usar em relatórios que queiram exibir o timbrado **somente na capa** e o logo em todas as páginas.
 */
export async function loadCityBrandingForReportPdf(
  cityId: string | null | undefined
): Promise<{ logo: PdfImageAsset | null; letterhead: PdfImageAsset | null }> {
  const branding = await loadCityBrandingPdfAssets(cityId);
  if (branding.logo) return branding;
  const fallback = await loadDefaultReportLogoAsset();
  return { logo: fallback, letterhead: branding.letterhead };
}

export async function drawReportHeaderLogoWithFallback(
  doc: { addImage: (src: string, fmt: string, x: number, y: number, w: number, h: number) => void },
  pageWidthMm: number,
  y: number,
  municipalLogo: PdfImageAsset | null
): Promise<number> {
  if (municipalLogo) {
    return drawMunicipalLogoTopCenter(doc, pageWidthMm, y, municipalLogo);
  }
  try {
    const def = await loadDefaultReportLogoAsset();
    if (def) {
      return drawMunicipalLogoTopCenter(doc, pageWidthMm, y, def, 50, 22);
    }
  } catch {
    /* ignore */
  }
  return y;
}
