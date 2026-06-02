import type { EtiquetasDadosResponse } from "@/types/etiquetas";

export const TEXTO_ACIMA_ASSINATURA_MAX = 50;

export function cityStateDisplay(context: EtiquetasDadosResponse): string {
  const city = context.municipio.name.trim();
  const state = context.municipio.state.trim();
  return state ? `${city}/${state}` : city;
}
