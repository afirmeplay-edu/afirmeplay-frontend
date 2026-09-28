/** Códigos persistidos em school.area_type. Rótulos da interface ficam fixos. */

export const AREA_TYPE_URBANA = "urbana";
export const AREA_TYPE_RURAL = "rural";
export const AREA_TYPE_ALL = "all";

export type SchoolAreaTypeCode = typeof AREA_TYPE_URBANA | typeof AREA_TYPE_RURAL;
export type AreaTypeFilterValue = typeof AREA_TYPE_ALL | SchoolAreaTypeCode;

export const AREA_TYPE_FORM_OPTIONS: Array<{ value: SchoolAreaTypeCode; label: string }> = [
  { value: AREA_TYPE_URBANA, label: "Zona urbana" },
  { value: AREA_TYPE_RURAL, label: "Zona rural" },
];

export const AREA_TYPE_FILTER_OPTIONS: Array<{ value: AreaTypeFilterValue; label: string }> = [
  { value: AREA_TYPE_ALL, label: "Todas" },
  { value: AREA_TYPE_URBANA, label: "Zona urbana" },
  { value: AREA_TYPE_RURAL, label: "Zona rural" },
];

/** Filtro da Gestão Escolar. "nao_informado" só recorta a lista; não é valor gravado. */
export const AREA_TYPE_UNINFORMED = "nao_informado";

export const GESTAO_AREA_TYPE_FILTER_ALL = "ALL";

export const GESTAO_AREA_TYPE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: GESTAO_AREA_TYPE_FILTER_ALL, label: "Todos os Tipos de área" },
  ...AREA_TYPE_FORM_OPTIONS,
  { value: AREA_TYPE_UNINFORMED, label: schoolAreaTypeLabel(null) },
];

export function matchesGestaoAreaTypeFilter(
  areaType: string | null | undefined,
  filter: string
): boolean {
  if (!filter || filter === GESTAO_AREA_TYPE_FILTER_ALL) return true;
  if (filter === AREA_TYPE_UNINFORMED) return !areaType;
  return areaType === filter;
}

export function schoolAreaTypeLabel(value?: string | null): string {
  if (value === AREA_TYPE_URBANA) return "Zona urbana";
  if (value === AREA_TYPE_RURAL) return "Zona rural";
  return "Não informado";
}

export function areaTypeFilterLabel(value?: string | null): string {
  if (value === AREA_TYPE_URBANA) return "Zona urbana";
  if (value === AREA_TYPE_RURAL) return "Zona rural";
  return "Todas";
}

/** Diretor e coordenador só veem a própria escola; o filtro de zona não aparece. */
export function canFilterByAreaType(role?: string | null): boolean {
  const normalized = (role || "").toLowerCase();
  return normalized !== "diretor" && normalized !== "coordenador";
}

export function appendTipoAreaParam(
  params: URLSearchParams,
  value?: string | null
): void {
  if (value && value !== AREA_TYPE_ALL) {
    params.append("tipo_area", value);
  }
}

export function tipoAreaRequestValue(value?: string | null): string | undefined {
  if (!value || value === AREA_TYPE_ALL) return undefined;
  return value;
}
