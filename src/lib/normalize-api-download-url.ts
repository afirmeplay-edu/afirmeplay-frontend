/**
 * Converte `download_url` retornada pelo backend em caminho relativo ao `baseURL` do axios.
 *
 * - Produção (Nginx): só `/api/*` vai ao backend; URLs absolutas no domínio do site sem `/api/`
 *   caem no SPA — aqui viram `answer-sheets/...` para o axios juntar com `BASE_URL` (`/api`).
 * - Localhost (Vite): `baseURL` é `/api` e o proxy repassa; mesmo esquema.
 * - URL absoluta para outro host permanece intacta para o axios usar a URL completa
 *   (branding municipal agora é servido pela própria API via rotas /city/<id>/branding/...,
 *   então não há mais URLs presigned externas para tratar aqui).
 * - Rotas de download da própria API (play-tv, calendar, physical-tests, answer-sheets) normalizam mesmo com host da API.
 */
export function normalizeDownloadUrlForApi(raw: string): string {
  const s = raw.trim();
  if (!s) return s;

  // Caminho relativo (já adequado ao baseURL ou path cru)
  if (!/^https?:\/\//i.test(s)) {
    let path = s.startsWith('/') ? s : `/${s}`;
    if (path.startsWith('/api/')) {
      path = path.slice(5);
    } else if (path === '/api') {
      path = '/';
    }
    if (path === '/' || path === '') return '';
    return path.startsWith('/') ? path.slice(1) : path;
  }

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return s;
  }

  if (!isApiDownloadUrl(u)) {
    return s;
  }

  let pathname = u.pathname;
  if (pathname.startsWith('/api/')) {
    pathname = pathname.slice(5);
  } else if (pathname.startsWith('/')) {
    pathname = pathname.slice(1);
  }
  return pathname + u.search;
}

function isApiDownloadUrl(u: URL): boolean {
  const p = u.pathname;
  if (
    p.startsWith('/answer-sheets') ||
    p.startsWith('/api/answer-sheets') ||
    p.startsWith('/play-tv') ||
    p.startsWith('/api/play-tv') ||
    p.startsWith('/calendar') ||
    p.startsWith('/api/calendar') ||
    p.startsWith('/physical-tests') ||
    p.startsWith('/api/physical-tests')
  ) {
    return true;
  }
  if (typeof window !== 'undefined') {
    try {
      return u.origin === window.location.origin;
    } catch {
      return false;
    }
  }
  return false;
}
