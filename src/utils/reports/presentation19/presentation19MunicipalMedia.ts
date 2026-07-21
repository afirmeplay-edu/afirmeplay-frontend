/** Leitura de `media_municipal_por_disciplina` do RelatorioCompleto (mesma fonte que Análise de Avaliações). */

function normDiscKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isGeralDisciplineKey(key: string): boolean {
  return normDiscKey(key) === "geral";
}

/** Agregado redundante da API (ex.: "Disciplina Geral") — distinto da chave `GERAL`. */
export function isDisciplinaGeralAggregateKey(key: string): boolean {
  return normDiscKey(key) === "disciplina geral";
}

/** Chaves de disciplina reais do relatório (`por_disciplina`), excluindo GERAL. */
export function relatorioRealDisciplineKeys(porDisciplina: Record<string, unknown> | null | undefined): string[] {
  if (!porDisciplina || typeof porDisciplina !== "object") return [];
  return Object.keys(porDisciplina)
    .filter((k) => !isGeralDisciplineKey(k))
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

/** Chave `GERAL` — média municipal consolidada explícita no mapa. */
export function mediaMunicipalRelatorioGeral(mm: Record<string, number> | null | undefined): number | null {
  if (!mm) return null;
  if (mm.GERAL != null && Number.isFinite(Number(mm.GERAL))) return Number(mm.GERAL);
  const e = Object.entries(mm).find(([k]) => k.trim().toUpperCase() === "GERAL");
  return e != null && Number.isFinite(Number(e[1])) ? Number(e[1]) : null;
}

export function mediaMunicipalRelatorioPorDisciplina(
  mm: Record<string, number> | null | undefined,
  disciplina: string
): number | null {
  if (!mm || !String(disciplina ?? "").trim()) return null;
  const d = String(disciplina).trim();
  if (mm[d] != null && Number.isFinite(Number(mm[d]))) return Number(mm[d]);
  const nk = normDiscKey(d);
  const found = Object.entries(mm).find(([k]) => normDiscKey(k) === nk);
  return found != null && Number.isFinite(Number(found[1])) ? Number(found[1]) : null;
}

/**
 * Resolve média municipal por disciplina alinhando rótulos do deck (ex.: NovaResposta)
 * às chaves do relatório — mesma estratégia do Análise (`por_disciplina` + `media_municipal_por_disciplina`).
 */
export function mediaMunicipalRelatorioPorDisciplinaResolved(
  mm: Record<string, number> | null | undefined,
  disciplinaLabel: string,
  relatorioDiscKeys: readonly string[]
): number | null {
  if (!mm) return null;

  const direct = mediaMunicipalRelatorioPorDisciplina(mm, disciplinaLabel);
  if (direct != null) return direct;

  const nkLabel = normDiscKey(disciplinaLabel);
  if (!nkLabel) return null;

  const relKey = relatorioDiscKeys.find((k) => normDiscKey(k) === nkLabel);
  if (relKey) {
    const viaRel = mediaMunicipalRelatorioPorDisciplina(mm, relKey);
    if (viaRel != null) return viaRel;
  }

  for (const rk of relatorioDiscKeys) {
    const nk = normDiscKey(rk);
    if (!nk) continue;
    if (nk === nkLabel || nk.includes(nkLabel) || nkLabel.includes(nk)) {
      const v = mediaMunicipalRelatorioPorDisciplina(mm, rk);
      if (v != null) return v;
    }
  }

  return null;
}

/**
 * Média municipal consolidada: chave `GERAL` do backend ou, se ausente,
 * média aritmética das entradas por disciplina **já presentes em `media_municipal_por_disciplina`**
 * (mesma regra do PDF consolidado do Análise — sem recalcular a partir de turmas/escolas).
 */
export function mediaMunicipalRelatorioConsolidada(
  mm: Record<string, number> | null | undefined,
  relatorioDiscKeys: readonly string[]
): number | null {
  const geral = mediaMunicipalRelatorioGeral(mm);
  if (geral != null) return geral;
  if (!mm || relatorioDiscKeys.length === 0) return null;

  const vals: number[] = [];
  for (const d of relatorioDiscKeys) {
    const v = mediaMunicipalRelatorioPorDisciplina(mm, d);
    if (v != null) vals.push(v);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function hasMediaMunicipalRelatorioData(mm: Record<string, number> | null | undefined): boolean {
  if (!mm || typeof mm !== "object") return false;
  return Object.values(mm).some((v) => v != null && Number.isFinite(Number(v)));
}

/** Completa `media_municipal_por_disciplina` a partir de relatório no escopo município (sem escola). */
type NovaEstatisticasGeraisMunicipal = {
  media_nota_geral?: number;
  media_proficiencia_geral?: number;
  por_disciplina?: Array<{
    disciplina?: string;
    media_nota?: number;
    media_proficiencia?: number;
  }>;
};

/** Médias municipais a partir de `estatisticas_gerais` (NovaResposta / resultados-agregados). */
export function buildMediaMunicipalPorDisciplinaFromNovaEstatisticas(
  eg: NovaEstatisticasGeraisMunicipal | null | undefined,
  metric: "nota" | "proficiencia"
): Record<string, number> | null {
  if (!eg) return null;
  const out: Record<string, number> = {};
  const geralRaw = metric === "nota" ? eg.media_nota_geral : eg.media_proficiencia_geral;
  if (geralRaw != null && Number.isFinite(Number(geralRaw))) {
    out.GERAL = Number(geralRaw);
  }
  const itemKey = metric === "nota" ? "media_nota" : "media_proficiencia";
  for (const item of eg.por_disciplina ?? []) {
    const disciplina = String(item.disciplina ?? "").trim();
    const v = item[itemKey];
    if (disciplina && v != null && Number.isFinite(Number(v))) {
      out[disciplina] = Number(v);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Relatório PDF tem prioridade; `estatisticas_gerais` preenche chaves ausentes. */
export function mergeMediaMunicipalPorDisciplinaMaps(
  primary: Record<string, number> | null | undefined,
  fallback: Record<string, number> | null | undefined
): Record<string, number> | null {
  const out: Record<string, number> = { ...(fallback ?? {}) };
  if (primary) {
    for (const [k, v] of Object.entries(primary)) {
      if (v != null && Number.isFinite(Number(v))) out[k] = Number(v);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function disciplineKeysFromNovaPorDisciplina(
  porDisciplina: Array<{ disciplina?: string }> | null | undefined
): string[] {
  if (!Array.isArray(porDisciplina)) return [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const item of porDisciplina) {
    const d = String(item.disciplina ?? "").trim();
    if (!d || isGeralDisciplineKey(d) || seen.has(d)) continue;
    seen.add(d);
    keys.push(d);
  }
  return keys.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

export function mergeDisciplineKeyLists(...lists: readonly string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const k of list) {
      const d = String(k ?? "").trim();
      if (!d || isGeralDisciplineKey(d) || seen.has(d)) continue;
      seen.add(d);
      out.push(d);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

export function mergeRelatorioMediaMunicipalIfMissing<T extends {
  proficiencia?: { media_municipal_por_disciplina?: Record<string, number> };
  nota_geral?: { media_municipal_por_disciplina?: Record<string, number> };
}>(
  scoped: T,
  municipalSource: T | null | undefined
): T {
  if (!municipalSource) return scoped;

  const profMm = scoped.proficiencia?.media_municipal_por_disciplina;
  const notaMm = scoped.nota_geral?.media_municipal_por_disciplina;
  const needsProf = !hasMediaMunicipalRelatorioData(profMm);
  const needsNota = !hasMediaMunicipalRelatorioData(notaMm);
  if (!needsProf && !needsNota) return scoped;

  return {
    ...scoped,
    ...(needsProf && municipalSource.proficiencia?.media_municipal_por_disciplina
      ? {
          proficiencia: {
            ...scoped.proficiencia,
            media_municipal_por_disciplina: municipalSource.proficiencia.media_municipal_por_disciplina,
          },
        }
      : {}),
    ...(needsNota && municipalSource.nota_geral?.media_municipal_por_disciplina
      ? {
          nota_geral: {
            ...scoped.nota_geral,
            media_municipal_por_disciplina: municipalSource.nota_geral.media_municipal_por_disciplina,
          },
        }
      : {}),
  };
}
