const RESERVED_SUBDOMAINS = new Set(['www', 'localhost', '127', 'app']);

/**
 * Extrai o slug do subdomínio (ex.: jiparana.localhost → jiparana).
 * Retorna string vazia se não houver subdomínio válido.
 */
export function getSubdomainFromHost(hostname?: string): string {
  if (typeof window === 'undefined' && !hostname) return '';
  const host = (hostname ?? window.location.hostname).toLowerCase();
  const parts = host.split('.');
  if (parts.length < 2) return '';
  const first = parts[0] ?? '';
  if (!first || RESERVED_SUBDOMAINS.has(first)) return '';
  return first;
}

export function hasTenantSubdomain(hostname?: string): boolean {
  return Boolean(getSubdomainFromHost(hostname));
}
