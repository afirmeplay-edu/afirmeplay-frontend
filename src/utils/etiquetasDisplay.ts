import type { EtiquetasDadosResponse } from "@/types/etiquetas";
import { getClassShiftLabel } from "@/lib/classShift";

export const TEXTO_ACIMA_ASSINATURA_MAX = 50;

export function cityStateDisplay(context: EtiquetasDadosResponse): string {
  const city = context.municipio.name.trim();
  const state = context.municipio.state.trim();
  return state ? `${city}/${state}` : city;
}

export function etiquetasTurnoLabel(context: EtiquetasDadosResponse): string {
  const raw = context.contexto.turno?.trim() || context.contexto.shift?.trim() || "";
  return getClassShiftLabel(raw || null);
}

export function etiquetasSerieTurmaLine(context: EtiquetasDadosResponse): string {
  const serie = context.contexto.serie?.trim() || "—";
  const turma = context.contexto.turma?.trim() || "—";
  return `${serie} | ${turma}`;
}
