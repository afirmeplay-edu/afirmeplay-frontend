import { formatDecimal1PtBr } from "@/utils/numberFormat";

export const DISCIPLINA_AUSENTE_LABEL = "Ausente";

export type DisciplinaResultadoLike = {
  absent?: boolean | null;
  status?: string | null;
  nota?: number | null;
  nota_geral?: number | null;
  grade?: number | null;
  proficiencia?: number | null;
  proficiencia_geral?: number | null;
  proficiency?: number | null;
  nivel?: string | null;
  nivel_proficiencia?: string | null;
  nivel_proficiencia_geral?: string | null;
  classificacao?: string | null;
  classification?: string | null;
};

function _fold(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function _pickNota(entry: DisciplinaResultadoLike | null | undefined): number | null | undefined {
  if (!entry) return undefined;
  if (entry.nota !== undefined) return entry.nota;
  if (entry.nota_geral !== undefined) return entry.nota_geral;
  if (entry.grade !== undefined) return entry.grade;
  return undefined;
}

function _pickProf(entry: DisciplinaResultadoLike | null | undefined): number | null | undefined {
  if (!entry) return undefined;
  if (entry.proficiencia !== undefined) return entry.proficiencia;
  if (entry.proficiencia_geral !== undefined) return entry.proficiencia_geral;
  if (entry.proficiency !== undefined) return entry.proficiency;
  return undefined;
}

function _pickNivel(entry: DisciplinaResultadoLike | null | undefined): string {
  if (!entry) return "";
  return String(
    entry.nivel_proficiencia ??
      entry.nivel_proficiencia_geral ??
      entry.nivel ??
      entry.classificacao ??
      entry.classification ??
      ""
  );
}

/**
 * Disciplina ausente no cartão (bloco em branco / PBS absent).
 * Nota 0 real (marcou e errou) NÃO é ausente.
 */
export function isDisciplinaAusente(
  entry: DisciplinaResultadoLike | null | undefined
): boolean {
  if (!entry) return false;
  if (entry.absent === true) return true;
  if (_fold(entry.status) === "ausente") return true;
  if (_fold(_pickNivel(entry)) === "ausente") return true;
  return false;
}

/** Valor numérico para médias: null se ausente (ignorado). */
export function valorNotaParaMedia(
  entry: DisciplinaResultadoLike | null | undefined
): number | null {
  if (isDisciplinaAusente(entry)) return null;
  const n = _pickNota(entry);
  if (n === null || n === undefined) return null;
  const num = Number(n);
  return Number.isFinite(num) ? num : null;
}

export function valorProficienciaParaMedia(
  entry: DisciplinaResultadoLike | null | undefined
): number | null {
  if (isDisciplinaAusente(entry)) return null;
  const n = _pickProf(entry);
  if (n === null || n === undefined) return null;
  const num = Number(n);
  return Number.isFinite(num) ? num : null;
}

export function formatarNotaDisciplina(
  entry: DisciplinaResultadoLike | null | undefined,
  fallbackWhenPresent: string = "0,0"
): string {
  if (isDisciplinaAusente(entry)) return DISCIPLINA_AUSENTE_LABEL;
  const n = _pickNota(entry);
  if (n === null || n === undefined) return fallbackWhenPresent;
  return formatDecimal1PtBr(Number(n), fallbackWhenPresent);
}

export function formatarProficienciaDisciplina(
  entry: DisciplinaResultadoLike | null | undefined,
  fallbackWhenPresent: string = "0,0"
): string {
  if (isDisciplinaAusente(entry)) return DISCIPLINA_AUSENTE_LABEL;
  const n = _pickProf(entry);
  if (n === null || n === undefined) return fallbackWhenPresent;
  return formatDecimal1PtBr(Number(n), fallbackWhenPresent);
}

export function formatarNivelDisciplina(
  entry: DisciplinaResultadoLike | null | undefined,
  normalizePresent?: (raw: string | null | undefined) => string
): string {
  if (isDisciplinaAusente(entry)) return DISCIPLINA_AUSENTE_LABEL;
  const raw = _pickNivel(entry);
  if (normalizePresent) return normalizePresent(raw);
  return raw || "—";
}
