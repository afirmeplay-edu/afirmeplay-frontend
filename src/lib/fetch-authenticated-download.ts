import { isAxiosError } from 'axios';
import { api } from '@/lib/api';
import { normalizeDownloadUrlForApi } from '@/lib/normalize-api-download-url';

export type FetchAuthenticatedDownloadOptions = {
  /** Query params (axios); não use junto com query string duplicada na URL. */
  params?: Record<string, string>;
};

async function messageFromBlobError(blob: Blob): Promise<string> {
  const text = await blob.text();
  try {
    const j = JSON.parse(text) as { error?: string; message?: string; detail?: string; code?: string };
    if (j.code === 'NOT_AVAILABLE_TO_MUNICIPALITY') {
      return j.error || 'Conteúdo ainda não disponível para o município';
    }
    return j.error || j.message || j.detail || text.slice(0, 300) || 'Erro ao baixar o arquivo.';
  } catch {
    return text.slice(0, 300) || 'Erro ao baixar o arquivo.';
  }
}

/**
 * GET autenticado (Bearer + headers do `api`) com `responseType: blob` e download na mesma página.
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

  let res;
  try {
    res = await api.get(pathOrUrl, {
      responseType: 'blob',
      params: options?.params,
      headers: {
        Accept: '*/*',
      },
    });
  } catch (err) {
    if (isAxiosError(err) && err.response?.data instanceof Blob) {
      throw new Error(await messageFromBlobError(err.response.data));
    }
    if (isAxiosError(err) && err.response?.data && typeof err.response.data === 'object') {
      const d = err.response.data as { error?: string; message?: string; code?: string };
      if (d.code === 'NOT_AVAILABLE_TO_MUNICIPALITY') {
        throw new Error(d.error || 'Conteúdo ainda não disponível para o município');
      }
      throw new Error(d.error || d.message || 'Erro ao baixar o arquivo.');
    }
    throw err;
  }

  const blob = res.data as Blob;

  if (blob.type?.includes('application/json')) {
    const text = await blob.text();
    try {
      const j = JSON.parse(text) as { error?: string; message?: string };
      throw new Error(j.error || j.message || 'Erro ao baixar o arquivo.');
    } catch (e) {
      if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
        throw e;
      }
      throw new Error('Resposta inválida do servidor.');
    }
  }

  let filename = fallbackFilename;
  const cd = res.headers['content-disposition'];
  if (cd && typeof cd === 'string') {
    const m = /filename\*?=(?:UTF-8'')?["']?([^";\n]+)["']?/i.exec(cd);
    if (m) {
      try {
        filename = decodeURIComponent(m[1].replace(/['"]/g, ''));
      } catch {
        filename = m[1].replace(/['"]/g, '');
      }
    }
  }

  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
