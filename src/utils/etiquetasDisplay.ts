import type { EtiquetaAplicadorExtra, EtiquetaEditItem, EtiquetasDadosResponse } from "@/types/etiquetas";
import { getClassShiftLabel } from "@/lib/classShift";

export const TEXTO_ACIMA_ASSINATURA_MAX = 50;
export const TEXTO_LIVRE_TAMANHO_PADRAO = 10;
export const TEXTO_LIVRE_TAMANHO_MIN = 8;
export const TEXTO_LIVRE_TAMANHO_MAX = 10;
/** Tamanho (pt) dos textos fixos da etiqueta; título, município/UF e escola vão em negrito. */
export const ETIQUETA_FONTE = 9;
/** A partir desta quantidade, os aplicadores são dispostos em grade de 2 colunas. */
export const ETIQUETA_APLICADORES_GRADE_MIN = 3;

export type EtiquetaAplicador = EtiquetaAplicadorExtra;

/** Aplicadores exibidos na etiqueta, na ordem (vazio se a assinatura estiver oculta). */
export function etiquetaAplicadores(item: EtiquetaEditItem): EtiquetaAplicador[] {
  if (!item.exibirAssinatura) return [];
  const list: EtiquetaAplicador[] = [
    { textoAcima: item.textoAcimaAssinatura, nome: item.nomeAplicador, cpf: item.cpfAplicador },
  ];
  if (item.exibirSegundoAplicador) {
    list.push({ textoAcima: item.textoAcimaAssinatura2 ?? "", nome: item.nomeAplicador2, cpf: item.cpfAplicador2 });
    list.push(...(item.aplicadoresExtras ?? []));
  }
  return list;
}

/** Bloco dos aplicadores: mesmo tamanho geral com um aplicador, 1pt menor com mais de um. */
export function etiquetaFonteAplicadores(quantidade: number): number {
  return quantidade > 1 ? ETIQUETA_FONTE - 1 : ETIQUETA_FONTE;
}

export function clampTextoLivreTamanho(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return TEXTO_LIVRE_TAMANHO_PADRAO;
  return Math.min(TEXTO_LIVRE_TAMANHO_MAX, Math.max(TEXTO_LIVRE_TAMANHO_MIN, Math.round(value as number)));
}

export function cityStateDisplay(context: EtiquetasDadosResponse): string {
  const city = context.municipio.name.trim();
  const state = context.municipio.state.trim();
  return state ? `${city}/${state}` : city;
}

/** Chave de agrupamento por escola: etiquetas de escolas distintas não dividem página. */
export function etiquetaEscolaKey(context: EtiquetasDadosResponse): string {
  const nome = context.contexto.escola?.replace(/\s+/g, " ").trim().toLowerCase();
  return nome || context.filters.escola?.trim() || "";
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

export function etiquetasSerieTurmaTurnoLine(context: EtiquetasDadosResponse): string {
  const turno = etiquetasTurnoLabel(context).trim() || "—";
  return `${etiquetasSerieTurmaLine(context)} | ${turno}`;
}
