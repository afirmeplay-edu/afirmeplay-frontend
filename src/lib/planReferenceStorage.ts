/** Município de referência do admin (subdomínio ou seletor global). */
export const PLAN_REFERENCE_CITY_ID_KEY = 'plan_reference_city_id';

export function getStoredReferenceCityId(): string | null {
  try {
    const id = localStorage.getItem(PLAN_REFERENCE_CITY_ID_KEY);
    return id?.trim() || null;
  } catch {
    return null;
  }
}

export function setStoredReferenceCityId(cityId: string | null): void {
  try {
    if (!cityId?.trim()) {
      localStorage.removeItem(PLAN_REFERENCE_CITY_ID_KEY);
    } else {
      localStorage.setItem(PLAN_REFERENCE_CITY_ID_KEY, cityId.trim());
    }
  } catch {
    // ignore quota / private mode
  }
}
