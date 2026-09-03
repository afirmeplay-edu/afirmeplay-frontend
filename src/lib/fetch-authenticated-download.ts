import { isAxiosError } from 'axios';
import { api } from '@/lib/api';
import { normalizeDownloadUrlForApi } from '@/lib/normalize-api-download-url';

export type FetchAuthenticatedDownloadOptions = {
  /** Query params (axios); não use junto com query string duplicada na URL. */
  params?: Record<string, string>;
  method?: 'GET' | 'POST';
  data?: unknown;
  timeout?: number;
  /** Contexto de município para o interceptor enviar X-City-ID. */
  cityId?: string;
};

async function messageFromBlobError(blob: Blob): Promise<string> {
  const text = await blob.text();
  try {
    const j = JSON.parse(text) as { error?: string; message?: string; detail?: string };
    return j.error || j.message || j.detail || text.slice(0, 300) || 'Erro ao baixar o arquivo.';
  } catch {
    return text.slice(0, 300) || 'Erro ao baixar o arquivo.';
  }
}

function filenameFromContentDisposition(header: unknown, fallback: string): string {
  if (typeof header !== 'string' || !header) return fallback;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/['"]/g, '').trim());
    } catch {
      return star[1].replace(/['"]/g, '').trim() || fallback;
    }
  }
  const plain = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i.exec(header);
  if (plain?.[1]) {
    return plain[1].replace(/['"]/g, '').trim() || fallback;
  }
  return fallback;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

/**
 * Download autenticado (Bearer + headers do `api`) com `responseType: blob`.
 * GET por padrão; use `method: 'POST'` para rotas como `/test/:id/exam-pdf`.
 */
export async function fetchAuthenticatedDownload(
  url: string,
  fallbackFilename = 'download.bin',
  options?: FetchAuthenticatedDownloadOptions
): Promise<void> {
  const pathOrUrl = normalizeDownloadUrlForApi(url);
  if (!pathOrUrl) {
    throw new Error('URL de download inválida.');
  }

  const method = options?.method ?? 'GET';
  const requestConfig = {
    responseType: 'blob' as const,
    params: options?.params,
    timeout: options?.timeout,
    headers: {
      Accept: '*/*',
    },
    ...(options?.cityId ? { meta: { cityId: options.cityId } } : {}),
  };

  let res;
  try {
    res =
      method === 'POST'
        ? await api.post(pathOrUrl, options?.data ?? {}, requestConfig)
        : await api.get(pathOrUrl, requestConfig);
  } catch (err) {
    if (isAxiosError(err) && err.response?.data instanceof Blob) {
      throw new Error(await messageFromBlobError(err.response.data));
    }
    if (isAxiosError(err) && err.response?.data && typeof err.response.data === 'object') {
      const d = err.response.data as { error?: string; message?: string };
      throw new Error(d.error || d.message || 'Erro ao baixar o arquivo.');
    }
    throw err;
  }

  const blob = res.data as Blob;

  if (blob.type?.includes('application/json')) {
    throw new Error(await messageFromBlobError(blob));
  }

  triggerBlobDownload(
    blob,
    filenameFromContentDisposition(res.headers['content-disposition'], fallbackFilename)
  );
}
