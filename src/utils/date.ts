/**
 * Converte string ISO 8601 do backend para valor do input datetime-local (YYYY-MM-DDTHH:mm).
 * Aceita formato com ou sem fração de segundos e com ou sem timezone (Z ou ±HH:mm).
 */
export function parseISOToDatetimeLocal(iso: string | undefined | null): string {
  if (iso == null || String(iso).trim() === '') return '';
  const s = String(iso).trim();
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}`;
  } catch {
    return '';
  }
}

/**
 * Converte datetime-local (YYYY-MM-DDTHH:mm) para ISO 8601 no padrão do backend.
 * Retorna "YYYY-MM-DDTHH:mm:00" (naive), alinhado a valor.isoformat().
 */
export function convertDateTimeLocalToISONaive(dateTimeString: string): string {
  if (!dateTimeString?.trim()) return '';
  const parsed = dateTimeString.trim().split('T');
  if (parsed.length !== 2) return '';
  const [datePart, timePart] = parsed;
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  if ([year, month, day, hour, minute].some(Number.isNaN)) return '';
  const d = new Date(year, month - 1, day, hour, minute ?? 0, 0, 0);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${dayStr}T${h}:${min}:00`;
}

// Gera ISO com offset local (+/-HH:MM) a partir de um Date
export function toLocalOffsetISO(date: Date): string {
  const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, '0');
  const tzOffsetMin = date.getTimezoneOffset(); // minutos atrás de UTC
  const sign = tzOffsetMin > 0 ? '-' : '+'; // ex.: Brasília (UTC-3) -> getTimezoneOffset() = 180 -> '-'
  const hh = pad(tzOffsetMin / 60);
  const mm = pad(tzOffsetMin % 60);
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${m}-${d}T${h}:${min}:${s}${sign}${hh}:${mm}`;
}

/**
 * Converte uma string datetime-local (formato "YYYY-MM-DDTHH:mm") para ISO string com timezone
 * Isso garante que a data seja interpretada corretamente sem ajustes de timezone
 * 
 * @param dateTimeString - String no formato "YYYY-MM-DDTHH:mm" (sem timezone)
 * @returns String ISO com timezone (ex: "2024-01-01T10:00:00-03:00")
 */
export function convertDateTimeLocalToISO(dateTimeString: string): string {
  if (!dateTimeString) {
    throw new Error("Data/hora não fornecida");
  }

  const [datePart, timePart] = dateTimeString.split('T');

  if (!datePart || !timePart) {
    throw new Error(`Formato inválido: ${dateTimeString}`);
  }

  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);

  if (
    [year, month, day, hour, minute].some((segment) => Number.isNaN(segment))
  ) {
    throw new Error(`Data/hora inválida: ${dateTimeString}`);
  }

  // Construir a data manualmente para evitar ajustes implícitos
  const localDate = new Date(year, month - 1, day, hour, minute, 0, 0);
  
  // Verificar se a data é válida
  if (isNaN(localDate.getTime())) {
    throw new Error(`Data/hora inválida: ${dateTimeString}`);
  }

  // Usar a função existente para converter para ISO com timezone
  return toLocalOffsetISO(localDate);
}

/** Formata um Date no valor de input datetime-local (YYYY-MM-DDTHH:mm), fuso local. */
export function formatDateToDatetimeLocal(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

/** Interpreta datetime-local como horário local do usuário. */
export function parseDatetimeLocalToDate(dateTimeString: string): Date | null {
  if (!dateTimeString?.trim()) return null;
  const parsed = dateTimeString.trim().split('T');
  if (parsed.length !== 2) return null;
  const [datePart, timePart] = parsed;
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  if ([year, month, day, hour, minute].some(Number.isNaN)) return null;
  const d = new Date(year, month - 1, day, hour, minute ?? 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Converte datetime-local (YYYY-MM-DDTHH:mm) para ISO UTC com Z
 * (ex.: "2026-09-20T21:30:00Z").
 */
export function datetimeLocalToUtcIsoZ(dateTimeString: string): string {
  const localDate = parseDatetimeLocalToDate(dateTimeString);
  if (!localDate) return '';
  return localDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Valor datetime-local equivalente a agora + N horas. */
export function addHoursToDatetimeLocal(hours: number, from: Date = new Date()): string {
  const d = new Date(from.getTime() + hours * 60 * 60 * 1000);
  return formatDateToDatetimeLocal(d);
}

/** Limite mínimo (agora) e máximo (agora + maxDays) para input datetime-local. */
export function datetimeLocalMinMax(
  maxDays: number,
  from: Date = new Date()
): { min: string; max: string } {
  const max = new Date(from.getTime() + maxDays * 24 * 60 * 60 * 1000);
  return {
    min: formatDateToDatetimeLocal(from),
    max: formatDateToDatetimeLocal(max),
  };
}

