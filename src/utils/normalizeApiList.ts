export function normalizeApiList<T>(data: unknown): T[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const inner = obj.data ?? obj.classes ?? obj.items ?? obj.results ?? obj.records;
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
}
