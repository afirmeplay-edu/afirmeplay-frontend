import type { EtiquetasDadosResponse } from "@/types/etiquetas";
import { getClassShiftLabel } from "@/lib/classShift";

export const TEXTO_ACIMA_ASSINATURA_MAX = 50;

export function cityStateDisplay(context: EtiquetasDadosResponse): string {
  const city = context.municipio.name.trim();
  const state = context.municipio.state.trim();
  return state ? `${city}/${state}` : city;
}

export function etiquetasTurnoLabel(context: EtiquetasDadosResponse): string {
  const ctx = enrichEtiquetasContext(context).contexto;
  const raw = ctx.turno?.trim() || ctx.shift?.trim() || "";
  return getClassShiftLabel(raw || null);
}

const PLACEHOLDER_TURMA = new Set(["", "—", "todas as turmas", "n/a"]);
const PLACEHOLDER_SERIE = new Set(["", "—", "todas as séries", "todas as series", "n/a"]);

function isPlaceholderTurma(value?: string | null): boolean {
  return PLACEHOLDER_TURMA.has(String(value ?? "").trim().toLowerCase());
}

function isPlaceholderSerie(value?: string | null): boolean {
  return PLACEHOLDER_SERIE.has(String(value ?? "").trim().toLowerCase());
}

export type EnrichEtiquetasContextOpts = {
  serieLabel?: string;
  turmaLabel?: string;
  turnoLabel?: string;
};

/** Garante série/turma/turno no contexto (API + rótulos do filtro selecionado). */
export function enrichEtiquetasContext(
  context: EtiquetasDadosResponse,
  opts?: EnrichEtiquetasContextOpts
): EtiquetasDadosResponse {
  const serieApi = context.contexto.serie?.trim() || "";
  const turmaApi = context.contexto.turma?.trim() || "";
  const turnoApi =
    context.contexto.turno?.trim() || context.contexto.shift?.trim() || "";

  const serie =
    (!isPlaceholderSerie(serieApi) ? serieApi : "") ||
    opts?.serieLabel?.trim() ||
    serieApi ||
    "—";
  const turma =
    (!isPlaceholderTurma(turmaApi) ? turmaApi : "") ||
    opts?.turmaLabel?.trim() ||
    turmaApi ||
    "—";
  const turno = turnoApi || opts?.turnoLabel?.trim() || "";

  return {
    ...context,
    contexto: {
      ...context.contexto,
      serie,
      turma,
      turno: turno || context.contexto.turno,
      shift: context.contexto.shift || turno,
    },
  };
}

export function etiquetasSerieTurmaLine(context: EtiquetasDadosResponse): string {
  const enriched = enrichEtiquetasContext(context);
  const serie = enriched.contexto.serie?.trim() || "—";
  const turma = enriched.contexto.turma?.trim() || "—";
  return `${serie} | ${turma}`;
}
