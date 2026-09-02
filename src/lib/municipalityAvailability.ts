import { convertDateTimeLocalToISO } from '@/utils/date';

export const NOT_AVAILABLE_TO_MUNICIPALITY_CODE = 'NOT_AVAILABLE_TO_MUNICIPALITY';
export const NOT_AVAILABLE_TO_MUNICIPALITY_MESSAGE =
  'Conteúdo ainda não disponível para o município';

export type MunicipalityAvailabilityStatus = 'released' | 'scheduled' | 'hidden';

export type MunicipalityAvailabilityFields = {
  available_to_municipality?: boolean | null;
  available_from?: string | null;
  is_available_to_municipality_now?: boolean | null;
};

type ApiErrorPayload = {
  status?: number;
  error?: string;
  code?: string;
  message?: string;
};

export function canControlMunicipalityAvailability(role?: string | null): boolean {
  const r = (role ?? '').toLowerCase();
  return r === 'admin' || r === 'tecadm';
}

export function isAvailableToMunicipalityNow(item: MunicipalityAvailabilityFields): boolean {
  if (typeof item.is_available_to_municipality_now === 'boolean') {
    return item.is_available_to_municipality_now;
  }
  if (item.available_to_municipality === false) return false;
  if (!item.available_from) return true;
  const from = new Date(item.available_from);
  if (Number.isNaN(from.getTime())) return true;
  return Date.now() >= from.getTime();
}

export function getMunicipalityAvailabilityStatus(
  item: MunicipalityAvailabilityFields
): MunicipalityAvailabilityStatus {
  if (item.available_to_municipality === false) return 'hidden';
  if (isAvailableToMunicipalityNow(item)) return 'released';
  if (item.available_from) return 'scheduled';
  return 'released';
}

export function formatMunicipalityAvailableFrom(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function municipalityAvailabilitySummary(
  availableToMunicipality: boolean,
  availableFromLocal: string
): string {
  if (!availableToMunicipality) return 'Oculto até liberação manual';
  if (!availableFromLocal.trim()) return 'Liberado para o município';
  try {
    const iso = convertDateTimeLocalToISO(availableFromLocal.trim());
    const formatted = formatMunicipalityAvailableFrom(iso);
    return formatted ? `Agendado para ${formatted}` : 'Agendado';
  } catch {
    return 'Agendado';
  }
}

export type MunicipalityAvailabilityPayload = {
  available_to_municipality: boolean;
  available_from: string | null;
};

export function buildMunicipalityAvailabilityPayload(
  role: string | null | undefined,
  values: { availableToMunicipality: boolean; availableFromLocal: string }
): MunicipalityAvailabilityPayload | null {
  if (!canControlMunicipalityAvailability(role)) return null;
  const available_to_municipality = values.availableToMunicipality;
  let available_from: string | null = null;
  if (available_to_municipality && values.availableFromLocal.trim()) {
    available_from = convertDateTimeLocalToISO(values.availableFromLocal.trim());
  }
  return { available_to_municipality, available_from };
}

export function getApiErrorPayload(error: unknown): ApiErrorPayload {
  if (!error || typeof error !== 'object') return {};
  const ax = error as { response?: { status?: number; data?: unknown }; message?: string };
  const status = ax.response?.status;
  const data = ax.response?.data;
  if (data && typeof data === 'object' && !(data instanceof Blob)) {
    const d = data as { error?: string; code?: string; message?: string };
    return { status, error: d.error, code: d.code, message: d.message };
  }
  return { status, message: typeof ax.message === 'string' ? ax.message : undefined };
}

export function isNotAvailableToMunicipalityError(error: unknown): boolean {
  const p = getApiErrorPayload(error);
  if (p.code === NOT_AVAILABLE_TO_MUNICIPALITY_CODE) return true;
  const text = `${p.error ?? ''} ${p.message ?? ''}`;
  if (p.status === 403 && text.includes(NOT_AVAILABLE_TO_MUNICIPALITY_MESSAGE)) return true;
  if (error instanceof Error && error.message.includes(NOT_AVAILABLE_TO_MUNICIPALITY_MESSAGE)) {
    return true;
  }
  return false;
}

export function municipalityAvailabilityErrorMessage(error: unknown, fallback?: string): string {
  if (isNotAvailableToMunicipalityError(error)) {
    const p = getApiErrorPayload(error);
    return p.error || p.message || NOT_AVAILABLE_TO_MUNICIPALITY_MESSAGE;
  }
  return fallback ?? NOT_AVAILABLE_TO_MUNICIPALITY_MESSAGE;
}
