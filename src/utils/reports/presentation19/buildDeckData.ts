import type { NivelAprendizagemGeral, RelatorioCompleto } from "@/types/evaluation-results";
import type { NovaRespostaAPI } from "@/services/evaluation/evaluationResultsApi";
import type {
  BuildDeckDataArgs,
  NotaByDisciplineByTurmaRow,
  NotaPorDisciplinaDeck,
  NotaPorCategoriaDeck,
  NiveisBySeriesRow,
  PresenceBySeriesRow,
  ProficiencyByDisciplineByTurmaRow,
  ProficiencyGeneralByTurmaRow,
  Presentation19DeckData,
  PresentationComparisonAxis,
  AlunoPresentationRow,
  SlideQuestionRow,
  Presentation19Mode,
} from "@/types/presentation19-slides";
import { getClassShiftLabel, hasClassShift } from "@/lib/classShift";
import { getProficiencyLevelDescription, type ProficiencyLevel } from "@/components/evaluations/results/utils/proficiency";
import { getProficiencyTableInfo } from "@/components/evaluations/results/utils/proficiency";
import {
  filterPresentation19RealDisciplineRows,
  hasPresentation19RealDisciplineBreakdown,
} from "@/utils/reports/presentation19/presentation19Labels";
import {
  buildMediaMunicipalPorDisciplinaFromNovaEstatisticas,
  disciplineKeysFromNovaPorDisciplina,
  mergeDisciplineKeyLists,
  mergeMediaMunicipalPorDisciplinaMaps,
  relatorioRealDisciplineKeys,
} from "@/utils/reports/presentation19/presentation19MunicipalMedia";

type AnyRecord = Record<string, unknown>;

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

function extractSerieFromTurma(turma?: string | null): string {
  const t = (turma ?? "").trim();
  if (!t) return "N/A";
  if (/^[A-Za-z]$/.test(t)) return "N/A";

  // ex.: "5º Ano A" => "5º Ano"
  const match = t.match(/(\d+º)\s*(?:ano)?/i);
  if (match?.[1]) return `${match[1]} Ano`;

  // fallback: até o primeiro espaço
  return t.split(/\s+/)[0] || "N/A";
}

function isTurmaOnlyLabel(value?: string | null): boolean {
  const v = String(value ?? "").trim();
  return /^[A-Za-z]$/.test(v);
}

function isValidSerieLabel(value?: string | null): boolean {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (v === "N/A") return false;
  if (isTurmaOnlyLabel(v)) return false;
  const normalized = normalizeText(v).toLowerCase();
  if (normalized.includes("escola")) return false;
  if (normalized.includes("municipal")) return false;
  if (normalized.includes("estadual")) return false;
  return true;
}

function findGeralKey(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const entries = Object.entries(obj as AnyRecord);
  const geral = entries.find(([k]) => normalizeText(k).toLowerCase() === "geral");
  return geral?.[0] ?? null;
}

function clampToNumber(n: unknown, fallback = 0): number {
  const num = typeof n === "number" ? n : Number(n);
  return Number.isFinite(num) ? num : fallback;
}

function safeSum(nums: number[]): number {
  return nums.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}

/** Primeiro número finito; se nenhum, retorna `fallback`. */
function firstFinite(...vals: Array<number | undefined | null>): number {
  for (const v of vals) {
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return 0;
}

/**
 * Participantes que realizaram a prova: prioriza agregados (mesma base da distribuição),
 * com fallback ao relatório. Não usa `||` para não trocar 0 legítimo por outra fonte.
 */
function pickAlunosParticipantes(
  mode: Presentation19Mode,
  relatorio: Partial<RelatorioCompleto> | null,
  nova: NovaRespostaAPI | null
): number {
  const fromNovaRaw = nova?.estatisticas_gerais?.alunos_participantes;
  const fromRelRaw = relatorio?.total_alunos?.total_geral?.avaliados;

  const preferNovaFirst =
    mode === "answer_sheet" ||
    (fromNovaRaw != null && Number.isFinite(Number(fromNovaRaw)));

  if (preferNovaFirst && fromNovaRaw != null && Number.isFinite(Number(fromNovaRaw))) {
    return clampToNumber(fromNovaRaw, 0);
  }
  if (fromRelRaw != null && Number.isFinite(Number(fromRelRaw))) {
    return clampToNumber(fromRelRaw, 0);
  }
  if (fromNovaRaw != null && Number.isFinite(Number(fromNovaRaw))) {
    return clampToNumber(fromNovaRaw, 0);
  }
  return 0;
}

/**
 * Cartão-resposta (`/answer-sheets/resultados-agregados`): proficiência geral exibida deve ser
 * `estatisticas_gerais.media_proficiencia_geral` (e por escola via `avaliacoes` no município), não médias do relatório PDF.
 */
function applyAnswerSheetCanonicalProficiencyGeral(
  mode: Presentation19Mode,
  comparisonAxis: PresentationComparisonAxis,
  nova: NovaRespostaAPI | null,
  current: ProficiencyGeneralByTurmaRow[]
): ProficiencyGeneralByTurmaRow[] {
  if (mode !== "answer_sheet" || !nova?.estatisticas_gerais) return current;

  const byEscola = proficiencyGeralPorEscolaFromNovaAvaliacoes(nova);
  const geralNova = buildProficiencyGeneralByTurmaFromNova(nova);

  if (comparisonAxis === "escola") {
    if (current.length > 0) return current;
    if (byEscola.length > 0) return byEscola;
    if (geralNova.length > 0) return geralNova;
    return current;
  }

  if (geralNova.length > 0) return geralNova;
  return current;
}

function buildNotasFromNova(nova: NovaRespostaAPI | null): { geral: number | null; porDisciplina: NotaPorDisciplinaDeck[] } {
  if (!nova?.estatisticas_gerais && !(nova?.resultados_por_disciplina && nova.resultados_por_disciplina.length > 0)) {
    return { geral: null, porDisciplina: [] };
  }
  const eg = nova.estatisticas_gerais;
  const geralRaw = eg?.media_nota_geral;
  let geral = geralRaw != null && Number.isFinite(Number(geralRaw)) ? clampToNumber(geralRaw, NaN) : null;

  const porDisciplina = (nova.resultados_por_disciplina ?? [])
    .map((d) => ({
      disciplina: String(d.disciplina ?? "").trim(),
      mediaNota: clampToNumber(d.media_nota, 0),
    }))
    .filter((d) => d.disciplina.length > 0);

  // Se o backend não envia média geral mas envia por disciplina, usa a média aritmética **só** dos dados da nova resposta
  // (evita misturar com `buildNotasFromRelatorio`, que pode divergir do endpoint de avaliações/cartão-resposta).
  if (!Number.isFinite(geral as number) && porDisciplina.length > 0) {
    const medias = porDisciplina.map((d) => d.mediaNota).filter((m) => Number.isFinite(m));
    geral = medias.length > 0 ? medias.reduce((a, b) => a + b, 0) / medias.length : null;
  }

  return { geral: Number.isFinite(geral as number) ? (geral as number) : null, porDisciplina };
}

function buildNotasFromRelatorio(relatorio: Partial<RelatorioCompleto> | null): { geral: number | null; porDisciplina: NotaPorDisciplinaDeck[] } {
  const pd = relatorio?.nota_geral?.por_disciplina;
  if (!pd || typeof pd !== "object") return { geral: null, porDisciplina: [] };

  const porDisciplina = Object.entries(pd as Record<string, { media_geral?: number }>)
    .map(([disciplina, v]) => ({
      disciplina,
      mediaNota: clampToNumber(v?.media_geral, 0),
    }))
    .filter((d) => d.disciplina.length > 0);

  const medias = porDisciplina.map((d) => d.mediaNota).filter((m) => Number.isFinite(m));
  const geral = medias.length > 0 ? medias.reduce((a, b) => a + b, 0) / medias.length : null;
  return { geral, porDisciplina };
}

function groupPresenceFromRelatorio(relatorio: Partial<RelatorioCompleto> | null): PresenceBySeriesRow[] {
  const total = relatorio?.total_alunos;
  const porTurma = total?.por_turma ?? [];
  const porEscola = total?.por_escola ?? [];

  type PresenceSourceRow = {
    serie?: string;
    turma?: string;
    escola?: string;
    matriculados?: number;
    avaliados?: number;
    percentual?: number;
  };

  const source = (porTurma.length > 0 ? porTurma : porEscola) as PresenceSourceRow[];

  if (!source || source.length === 0) return [];

  // agrupar por "serie": prioriza campo explícito `serie`, fallback para extração de `turma`
  const map = new Map<string, PresenceBySeriesRow>();
  for (const row of source) {
    const turmaLabel = String(row.turma ?? "").trim();
    const serieRaw = String(row.serie ?? "").trim();
    const serie = serieRaw || extractSerieFromTurma(turmaLabel);
    if (!isValidSerieLabel(serie)) continue;
    const matriculados = clampToNumber(row.matriculados, 0);
    const avaliados = clampToNumber(row.avaliados, 0);
    const presencaMediaPct = matriculados > 0 ? (avaliados / matriculados) * 100 : 0;

    const cur = map.get(serie);
    if (!cur) {
      map.set(serie, {
        label: serie,
        totalAlunos: matriculados,
        totalPresentes: avaliados,
        presencaMediaPct,
        alunosFaltosos: Math.max(0, matriculados - avaliados),
        turmaLabel,
      });
      continue;
    }

    const totalAlunos = cur.totalAlunos + matriculados;
    const totalPresentes = cur.totalPresentes + avaliados;
    const presencaMediaPctAtualizada = totalAlunos > 0 ? (totalPresentes / totalAlunos) * 100 : 0;
    const alunosFaltosos = Math.max(0, totalAlunos - totalPresentes);

    map.set(serie, { ...cur, totalAlunos, totalPresentes, presencaMediaPct: presencaMediaPctAtualizada, alunosFaltosos });
  }

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function groupPresenceFromNova(novaRespostaAgregados: NovaRespostaAPI | null, serieFallback?: string): PresenceBySeriesRow[] {
  if (!novaRespostaAgregados?.estatisticas_gerais) return [];
  const eg = novaRespostaAgregados.estatisticas_gerais;
  const serie = String(eg.serie ?? "").trim();
  const serieResolved = isValidSerieLabel(serie) ? serie : (isValidSerieLabel(serieFallback) ? String(serieFallback).trim() : "GERAL");

  const totalAlunos = clampToNumber(eg.total_alunos, 0);
  const totalPresentes = clampToNumber(eg.alunos_participantes, 0);
  /** Cartão resposta: faltosos = total de alunos − presentes (não usar só alunos_ausentes da API). */
  const alunosFaltosos = Math.max(0, totalAlunos - totalPresentes);
  const presencaMediaPct = totalAlunos > 0 ? (totalPresentes / totalAlunos) * 100 : 0;

  return [
    {
      label: serieResolved,
      totalAlunos,
      totalPresentes,
      presencaMediaPct,
      alunosFaltosos,
    },
  ];
}

function buildPresenceFinalFallback(
  relatorio: Partial<RelatorioCompleto> | null,
  novaRespostaAgregados: NovaRespostaAPI | null,
  serieFallback?: string
): PresenceBySeriesRow[] {
  const totalAlunos = firstFinite(
    clampToNumber(relatorio?.total_alunos?.total_geral?.matriculados, NaN),
    clampToNumber(novaRespostaAgregados?.estatisticas_gerais?.total_alunos, NaN)
  );
  const totalPresentes = firstFinite(
    clampToNumber(relatorio?.total_alunos?.total_geral?.avaliados, NaN),
    clampToNumber(novaRespostaAgregados?.estatisticas_gerais?.alunos_participantes, NaN)
  );
  const serie = isValidSerieLabel(serieFallback) ? String(serieFallback).trim() : "GERAL";

  // Se não há nenhuma base numérica, não inventar linha.
  if (!Number.isFinite(totalAlunos) || totalAlunos <= 0) return [];

  const presentesOk = Number.isFinite(totalPresentes) ? totalPresentes : 0;
  const alunosFaltosos = Math.max(0, totalAlunos - presentesOk);

  return [
    {
      label: serie,
      totalAlunos,
      totalPresentes: presentesOk,
      presencaMediaPct: totalAlunos > 0 ? (presentesOk / totalAlunos) * 100 : 0,
      alunosFaltosos,
    },
  ];
}

function groupNiveisFromRelatorio(relatorio: Partial<RelatorioCompleto> | null, series: string[]): NiveisBySeriesRow[] {
  const niveis = relatorio?.niveis_aprendizagem;
  if (!niveis) return [];

  const geralKey = findGeralKey(niveis) ?? "GERAL";
  type NiveisDiscipline = {
    por_turma?: Array<{
      turma: string;
      abaixo_do_basico: number;
      basico: number;
      adequado: number;
      avancado: number;
      total: number;
    }>;
    total_geral?: {
      abaixo_do_basico: number;
      basico: number;
      adequado: number;
      avancado: number;
      total: number;
    };
  };

  const disciplinaGeral = (niveis as AnyRecord)[geralKey] as NiveisDiscipline | undefined;

  const porTurma = (disciplinaGeral?.por_turma ?? []) as Array<{
    serie?: string;
    turma: string;
    abaixo_do_basico: number;
    basico: number;
    adequado: number;
    avancado: number;
    total: number;
  }>;
  if (!porTurma || porTurma.length === 0) {
    // fallback: total_geral
    const totalGeral = disciplinaGeral?.total_geral;
    if (!totalGeral) return [];
    return [
      {
        label: series[0] ?? "N/A",
        abaixoDoBasico: clampToNumber(totalGeral.abaixo_do_basico),
        basico: clampToNumber(totalGeral.basico),
        adequado: clampToNumber(totalGeral.adequado),
        avancado: clampToNumber(totalGeral.avancado),
        total: clampToNumber(
          totalGeral.total,
          clampToNumber(totalGeral.abaixo_do_basico, 0) +
            clampToNumber(totalGeral.basico, 0) +
            clampToNumber(totalGeral.adequado, 0) +
            clampToNumber(totalGeral.avancado, 0)
        ),
      },
    ];
  }

  // agrupar por "serie"
  const map = new Map<string, NiveisBySeriesRow>();
  for (const row of porTurma) {
    const serieRaw = String(row.serie ?? "").trim();
    const serie = serieRaw || extractSerieFromTurma(row.turma);
    if (!isValidSerieLabel(serie)) continue;
    const cur = map.get(serie);
    const abaixoDoBasico = clampToNumber(row.abaixo_do_basico, 0);
    const basico = clampToNumber(row.basico, 0);
    const adequado = clampToNumber(row.adequado, 0);
    const avancado = clampToNumber(row.avancado, 0);
    const total = clampToNumber(row.total, abaixoDoBasico + basico + adequado + avancado);

    if (!cur) {
      map.set(serie, { label: serie, abaixoDoBasico, basico, adequado, avancado, total });
      continue;
    }

    const next: NiveisBySeriesRow = {
      label: serie,
      abaixoDoBasico: cur.abaixoDoBasico + abaixoDoBasico,
      basico: cur.basico + basico,
      adequado: cur.adequado + adequado,
      avancado: cur.avancado + avancado,
      total: cur.total + total,
    };
    map.set(serie, next);
  }

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function groupNiveisFromNova(novaRespostaAgregados: NovaRespostaAPI | null, serieFallback: string): NiveisBySeriesRow[] {
  if (!novaRespostaAgregados?.estatisticas_gerais) return [];
  const eg = novaRespostaAgregados.estatisticas_gerais;
  const dist = eg.distribuicao_classificacao_geral;
  if (!dist) return [];

  const serieRaw = String(eg.serie ?? "").trim();
  const serie = isValidSerieLabel(serieRaw) ? serieRaw : (isValidSerieLabel(serieFallback) ? serieFallback : "GERAL");

  const abaixoDoBasico = clampToNumber(dist.abaixo_do_basico, 0);
  const basico = clampToNumber(dist.basico, 0);
  const adequado = clampToNumber(dist.adequado, 0);
  const avancado = clampToNumber(dist.avancado, 0);
  const total = safeSum([abaixoDoBasico, basico, adequado, avancado]);

  return [{ label: serie, abaixoDoBasico, basico, adequado, avancado, total }];
}

function buildProficiencyGeneralByTurma(
  relatorio: Partial<RelatorioCompleto> | null
): ProficiencyGeneralByTurmaRow[] {
  const prof = relatorio?.proficiencia?.por_disciplina;
  if (!prof) return [];
  const geralKey = findGeralKey(prof) ?? "GERAL";
  type ProficienciaGeral = {
    por_turma?: Array<{ turma: string; proficiencia: number }>;
  };
  const geral = (prof as AnyRecord)[geralKey] as ProficienciaGeral | undefined;
  const porTurma = (geral?.por_turma ?? []) as Array<{ turma: string; proficiencia: number }>;
  if (porTurma.length === 0) {
    const mediaGeral = clampToNumber((geral as AnyRecord | undefined)?.media_geral, NaN);
    return Number.isFinite(mediaGeral) ? [{ label: "GERAL", proficiencia: mediaGeral }] : [];
  }
  const avMap = buildRelatorioTurmaAvaliadosMap(relatorio);
  return porTurma
    .filter((r) => deveIncluirLinhaPorTurmaRelatorio(relatorio, String(r.turma ?? "").trim(), avMap))
    .map((r) => ({
      label: String(r.turma ?? "").trim(),
      proficiencia: clampToNumber(r.proficiencia, 0),
    }))
    .filter((r) => r.label !== "")
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function buildProficiencyGeneralByTurmaFromNova(novaRespostaAgregados: NovaRespostaAPI | null): ProficiencyGeneralByTurmaRow[] {
  if (!novaRespostaAgregados) return [];
  // Usar apenas métrica oficial do backend, sem recálculo por alunos.
  const mediaGeral = clampToNumber(novaRespostaAgregados.estatisticas_gerais?.media_proficiencia_geral, NaN);
  return Number.isFinite(mediaGeral) ? [{ label: "GERAL", proficiencia: mediaGeral }] : [];
}

function buildProficiencyByDisciplineByTurma(
  relatorio: Partial<RelatorioCompleto> | null
): ProficiencyByDisciplineByTurmaRow[] {
  const profDisc = relatorio?.proficiencia?.por_disciplina;
  if (!profDisc) return [];

  const geralKey = findGeralKey(profDisc) ?? "GERAL";

  const avMap = buildRelatorioTurmaAvaliadosMap(relatorio);

  const disciplines = Object.entries(profDisc as AnyRecord)
    .filter(([k]) => normalizeText(k).toLowerCase() !== normalizeText(geralKey).toLowerCase())
    .map(([disciplina, dadosDisc]) => {
      const porTurma = (dadosDisc as AnyRecord)?.por_turma as Array<{ turma: string; proficiencia: number }>;
      const valuesByTurma = (porTurma ?? [])
        .filter((r) => deveIncluirLinhaPorTurmaRelatorio(relatorio, String(r.turma ?? "").trim(), avMap))
        .map((r) => ({
          turma: String(r.turma ?? "").trim(),
          proficiencia: clampToNumber(r.proficiencia, 0),
        }));
      return { disciplina, valuesByTurma };
    })
    .filter((d) => d.valuesByTurma.length > 0);

  return disciplines;
}

function buildProficiencyByDisciplineByTurmaFromNova(novaRespostaAgregados: NovaRespostaAPI | null): ProficiencyByDisciplineByTurmaRow[] {
  if (!novaRespostaAgregados) return [];
  // Usar apenas métricas oficiais agregadas por disciplina do backend.
  const disciplinas = novaRespostaAgregados.resultados_por_disciplina ?? [];
  return disciplinas
    .map((d) => {
      const disciplina = String(d.disciplina ?? "").trim();
      const media = clampToNumber(d.media_proficiencia, NaN);
      if (!disciplina || !Number.isFinite(media)) return null;
      return {
        disciplina,
        valuesByTurma: [{ turma: "GERAL", proficiencia: media }],
      };
    })
    .filter((d): d is ProficiencyByDisciplineByTurmaRow => Boolean(d));
}

function buildNotasByDisciplineByTurma(relatorio: Partial<RelatorioCompleto> | null): NotaByDisciplineByTurmaRow[] {
  const ng = relatorio?.nota_geral?.por_disciplina;
  if (!ng) return [];
  const geralKey = findGeralKey(ng) ?? "GERAL";

  const avMap = buildRelatorioTurmaAvaliadosMap(relatorio);

  return Object.entries(ng as AnyRecord)
    .filter(([k]) => normalizeText(k).toLowerCase() !== normalizeText(geralKey).toLowerCase())
    .map(([disciplina, dadosDisc]) => {
      const porTurma = (dadosDisc as AnyRecord)?.por_turma as Array<{ turma: string; nota: number }>;
      const valuesByTurma = (porTurma ?? [])
        .filter((r) => deveIncluirLinhaPorTurmaRelatorio(relatorio, String(r.turma ?? "").trim(), avMap))
        .map((r) => ({
          turma: String(r.turma ?? "").trim(),
          mediaNota: clampToNumber(r.nota, 0),
        }));
      return { disciplina, valuesByTurma };
    })
    .filter((d) => d.valuesByTurma.length > 0);
}

function buildNotasByDisciplineByTurmaFromNova(nova: NovaRespostaAPI | null): NotaByDisciplineByTurmaRow[] {
  const disciplinas = nova?.resultados_por_disciplina ?? [];
  return disciplinas
    .map((d) => {
      const disciplina = String(d.disciplina ?? "").trim();
      const media = clampToNumber(d.media_nota, NaN);
      if (!disciplina || !Number.isFinite(media)) return null;
      return {
        disciplina,
        valuesByTurma: [{ turma: "GERAL", mediaNota: media }],
      };
    })
    .filter((x): x is NotaByDisciplineByTurmaRow => Boolean(x));
}

function buildNotasByDisciplinePorCategoria(
  relatorio: Partial<RelatorioCompleto> | null,
  axis: "escola" | "serie" | "turma",
  serieFilterLabel?: string
): NotaByDisciplineByTurmaRow[] {
  const ng = relatorio?.nota_geral?.por_disciplina;
  if (!ng) return [];
  const geralKey = findGeralKey(ng) ?? "GERAL";
  const avMap = buildRelatorioTurmaAvaliadosMap(relatorio);

  return Object.entries(ng as AnyRecord)
    .filter(([k]) => normalizeText(k).toLowerCase() !== normalizeText(geralKey).toLowerCase())
    .map(([disciplina, dadosDisc]) => {
      const porTurma = (dadosDisc as AnyRecord)?.por_turma as Array<{ turma: string; nota: number; serie?: string }>;
      const porEscola = (dadosDisc as AnyRecord)?.por_escola as Array<{ escola: string; nota?: number; media?: number }>;
      if (axis === "escola" && porEscola?.length) {
        return {
          disciplina,
          valuesByTurma: porEscola.map((r) => ({
            turma: String(r.escola ?? "").trim(),
            mediaNota: clampToNumber(r.nota ?? r.media, 0),
          })),
        };
      }
      const rows = (porTurma ?? []).filter((r) => {
        const t = String(r.turma ?? "").trim();
        if (axis === "serie" || axis === "turma") {
          if (!deveIncluirLinhaPorTurmaRelatorio(relatorio, t, avMap)) return false;
        }
        if (axis === "turma" && serieFilterLabel) {
          const s = String(r.serie ?? "").trim() || extractSerieFromTurma(r.turma);
          return normKey(s) === normKey(serieFilterLabel);
        }
        return true;
      });
      const valuesByTurma =
        axis === "serie"
          ? (() => {
              const m = new Map<string, { sum: number; n: number }>();
              for (const r of rows) {
                const lab = extractSerieFromTurma(r.turma);
                if (!isValidSerieLabel(lab)) continue;
                const cur = m.get(lab) ?? { sum: 0, n: 0 };
                cur.sum += clampToNumber(r.nota, 0);
                cur.n += 1;
                m.set(lab, cur);
              }
              return Array.from(m.entries()).map(([turma, v]) => ({
                turma,
                mediaNota: v.n > 0 ? v.sum / v.n : 0,
              }));
            })()
          : rows.map((r) => ({
              turma: String(r.turma ?? "").trim(),
              mediaNota: clampToNumber(r.nota, 0),
            }));
      return { disciplina, valuesByTurma };
    })
    .filter((d) => d.valuesByTurma.length > 0);
}

function notasByDisciplinePorEscolaFromNovaAvaliacoes(nova: NovaRespostaAPI | null): NotaByDisciplineByTurmaRow[] {
  const g = nova?.nivel_granularidade;
  const av = nova?.resultados_detalhados?.avaliacoes;
  if (g !== "municipio" || !av?.length) return [];

  const byDisc = new Map<string, Array<{ turma: string; mediaNota: number }>>();
  for (const a of av) {
    if (!novaAvaliacaoTeveParticipantes(a)) continue;
    const escola = String(a.escola ?? "").trim();
    if (!escola) continue;
    const mds = a.medias_por_disciplina;
    if (mds?.length) {
      for (const md of mds) {
        const disciplina = String(md.disciplina ?? "").trim();
        if (!disciplina) continue;
        const n = clampToNumber(md.media_nota, NaN);
        if (!Number.isFinite(n)) continue;
        const arr = byDisc.get(disciplina) ?? [];
        arr.push({ turma: escola, mediaNota: n });
        byDisc.set(disciplina, arr);
      }
    } else {
      const n = clampToNumber(a.media_nota, NaN);
      if (!Number.isFinite(n)) continue;
      const disciplina = "Geral";
      const arr = byDisc.get(disciplina) ?? [];
      arr.push({ turma: escola, mediaNota: n });
      byDisc.set(disciplina, arr);
    }
  }

  return Array.from(byDisc.entries())
    .map(([disciplina, valuesByTurma]) => ({
      disciplina,
      valuesByTurma: valuesByTurma.sort((x, y) => x.turma.localeCompare(y.turma, "pt-BR", { sensitivity: "base" })),
    }))
    .filter((d) => d.valuesByTurma.length > 0)
    .sort((a, b) => a.disciplina.localeCompare(b.disciplina, "pt-BR", { sensitivity: "base" }));
}

function notasByDisciplinePorSerieFromNovaAvaliacoes(nova: NovaRespostaAPI | null): NotaByDisciplineByTurmaRow[] {
  const av = nova?.resultados_detalhados?.avaliacoes;
  if (!av?.length) return [];
  const byDisc = new Map<string, Map<string, { sum: number; n: number }>>();
  for (const a of av) {
    if (!deveIncluirLinhaNovaAvaliacao(a)) continue;
    const serieRaw = String(a.serie ?? "").trim();
    const serie = serieRaw || extractSerieFromTurma(String(a.turma ?? ""));
    if (!isValidSerieLabel(serie)) continue;
    const mds = a.medias_por_disciplina;
    if (!mds?.length) continue;
    for (const md of mds) {
      const disciplina = String(md.disciplina ?? "").trim();
      if (!disciplina) continue;
      const n = clampToNumber(md.media_nota, NaN);
      if (!Number.isFinite(n)) continue;
      const dm = byDisc.get(disciplina) ?? new Map();
      const cur = dm.get(serie) ?? { sum: 0, n: 0 };
      cur.sum += n;
      cur.n += 1;
      dm.set(serie, cur);
      byDisc.set(disciplina, dm);
    }
  }
  if (byDisc.size === 0) return [];
  return Array.from(byDisc.entries())
    .map(([disciplina, turmaMap]) => ({
      disciplina,
      valuesByTurma: Array.from(turmaMap.entries())
        .map(([tt, v]) => ({ turma: tt, mediaNota: v.n > 0 ? v.sum / v.n : 0 }))
        .sort((x, y) => x.turma.localeCompare(y.turma, "pt-BR", { sensitivity: "base" })),
    }))
    .filter((d) => d.valuesByTurma.length > 0)
    .sort((a, b) => a.disciplina.localeCompare(b.disciplina, "pt-BR", { sensitivity: "base" }));
}

function notasByDisciplinePorTurmaFromNovaAvaliacoes(nova: NovaRespostaAPI | null): NotaByDisciplineByTurmaRow[] {
  const av = nova?.resultados_detalhados?.avaliacoes;
  if (!av?.length) return [];
  const byDisc = new Map<string, Map<string, { sum: number; n: number }>>();
  for (const a of av) {
    if (!deveIncluirLinhaNovaAvaliacao(a)) continue;
    const turma = String(a.turma ?? "").trim();
    if (!turma) continue;
    const mds = a.medias_por_disciplina;
    if (!mds?.length) continue;
    for (const md of mds) {
      const disciplina = String(md.disciplina ?? "").trim();
      if (!disciplina) continue;
      const n = clampToNumber(md.media_nota, NaN);
      if (!Number.isFinite(n)) continue;
      const dm = byDisc.get(disciplina) ?? new Map();
      const cur = dm.get(turma) ?? { sum: 0, n: 0 };
      cur.sum += n;
      cur.n += 1;
      dm.set(turma, cur);
      byDisc.set(disciplina, dm);
    }
  }
  if (byDisc.size === 0) return [];
  return Array.from(byDisc.entries())
    .map(([disciplina, turmaMap]) => ({
      disciplina,
      valuesByTurma: Array.from(turmaMap.entries())
        .map(([tt, v]) => ({ turma: tt, mediaNota: v.n > 0 ? v.sum / v.n : 0 }))
        .sort((x, y) => x.turma.localeCompare(y.turma, "pt-BR", { sensitivity: "base" })),
    }))
    .filter((d) => d.valuesByTurma.length > 0)
    .sort((a, b) => a.disciplina.localeCompare(b.disciplina, "pt-BR", { sensitivity: "base" }));
}

function applyTurmaAllowToNotasByDiscipline(
  rows: NotaByDisciplineByTurmaRow[],
  turmaAllow: Set<string>
): NotaByDisciplineByTurmaRow[] {
  if (turmaAllow.size === 0) return rows;
  return rows
    .map((d) => ({
      ...d,
      valuesByTurma: d.valuesByTurma.filter((v) => turmaAllow.has(String(v.turma ?? "").trim())),
    }))
    .filter((d) => d.valuesByTurma.length > 0);
}

function warnIfProficiencyOutOfRange(
  serieHint: string,
  profGeral: ProficiencyGeneralByTurmaRow[],
  profPorDisciplina: ProficiencyByDisciplineByTurmaRow[]
): void {
  const maxGeral = getProficiencyTableInfo(serieHint, "Matemática").maxProficiency;

  for (const row of profGeral) {
    if (row.proficiencia > maxGeral) {
      console.warn("[presentation19] proficiência geral fora da faixa esperada", {
        serieHint,
        categoria: row.label,
        proficiencia: row.proficiencia,
        maxEsperado: maxGeral,
      });
    }
  }

  for (const disc of profPorDisciplina) {
    const maxDisc = getProficiencyTableInfo(serieHint, disc.disciplina).maxProficiency;
    for (const row of disc.valuesByTurma) {
      if (row.proficiencia > maxDisc) {
        console.warn("[presentation19] proficiência por disciplina fora da faixa esperada", {
          serieHint,
          disciplina: disc.disciplina,
          turma: row.turma,
          proficiencia: row.proficiencia,
          maxEsperado: maxDisc,
        });
      }
    }
  }
}

function flattenQuestions(relatorio: Partial<RelatorioCompleto> | null): SlideQuestionRow[] {
  const map = relatorio?.acertos_por_habilidade;
  if (!map) return [];

  const geralKey = findGeralKey(map) ?? "GERAL";
  const disciplina = (map as AnyRecord)[geralKey] ?? (map as AnyRecord)[Object.keys(map)[0] ?? ""];
  if (!disciplina) return [];

  // `habilidades` (tipagem do RelatorioCompleto) — mas a API pode vir com `questoes` dependendo do contexto
  type QuestaoLike = {
    numero?: number;
    numero_questao?: number;
    percentual?: number;
    acertos?: number;
    total?: number;
    codigo?: string;
    descricao?: string;
  };

  type HabilidadeLike = {
    questoes?: QuestaoLike[];
    codigo?: string;
    descricao?: string;
  };

  const habilidades = (disciplina as AnyRecord).habilidades as HabilidadeLike[] | undefined;

  const questoesFlat: SlideQuestionRow[] = [];

  if (Array.isArray((disciplina as AnyRecord).questoes)) {
    // fallback: alguns payloads já podem vir “chapados” em `questoes`
    const qs = (disciplina as AnyRecord).questoes as QuestaoLike[];
    for (const q of qs) {
      const questao = clampToNumber(q.numero_questao ?? q.numero, 0);
      const percentualAcertos = clampToNumber(q.percentual ?? 0, 0);
      const habilidade = String(q.codigo ?? "").trim() || "—";
      const habilidadeDescricao = String(q.descricao ?? "").trim() || undefined;
      questoesFlat.push({ questao, habilidade, habilidadeDescricao, percentualAcertos });
    }
  } else if (habilidades && habilidades.length > 0) {
    for (const hab of habilidades) {
      const qs = hab.questoes ?? [];
      for (const q of qs) {
        const questao = clampToNumber(q.numero_questao ?? q.numero, 0);
        const percentualAcertos = clampToNumber(q.percentual ?? 0, 0);
        const habilidade = String(q.codigo ?? hab.codigo ?? "").trim() || "—";
        const habilidadeDescricao = String(q.descricao ?? hab.descricao ?? "").trim() || undefined;
        questoesFlat.push({ questao, habilidade, habilidadeDescricao, percentualAcertos });
      }
    }
  }

  return questoesFlat.map((r) => ({
    ...r,
    percentualAcertos: Math.round(r.percentualAcertos * 10) / 10,
  }));
}

/** Número da questão → metadados da habilidade (metadados em `tabela_detalhada.disciplinas[].questoes`). */
function buildQuestaoNumeroToHabilidadeMetaMap(
  novaRespostaAgregados: NovaRespostaAPI | null
): Map<number, { codigo?: string; descricao?: string }> {
  const map = new Map<number, { codigo?: string; descricao?: string }>();
  const disciplinas = novaRespostaAgregados?.tabela_detalhada?.disciplinas ?? [];
  for (const disc of disciplinas) {
    const qs =
      (disc as {
        questoes?: Array<{ numero?: number; habilidade?: string; codigo_habilidade?: string }>;
      }).questoes ?? [];
    for (const q of qs) {
      const num = clampToNumber(q.numero, 0);
      if (num <= 0) continue;
      const codigo = String(q.codigo_habilidade ?? "").trim() || undefined;
      const descricao = String(q.habilidade ?? "").trim() || undefined;
      if (!codigo && !descricao) continue;
      if (!map.has(num)) map.set(num, { codigo, descricao });
    }
  }
  return map;
}

/** Mapa questão → metadados a partir da tabela geral já montada (ex.: `acertos_por_habilidade` do relatório). */
function buildQuestaoMetaMapFromGeralRows(
  geral: SlideQuestionRow[]
): Map<number, { codigo?: string; descricao?: string }> {
  const map = new Map<number, { codigo?: string; descricao?: string }>();
  for (const r of geral) {
    const q = clampToNumber(r.questao, 0);
    if (q <= 0) continue;
    const codigo = String(r.habilidade ?? "").trim() || undefined;
    const descricao = String(r.habilidadeDescricao ?? "").trim() || undefined;
    if (!codigo && !descricao) continue;
    map.set(q, { codigo, descricao });
  }
  return map;
}

/** União: metadados da nova resposta + tabela geral (prioriza o que existir na geral quando ambas existem). */
function mergeHabilidadeMetaMaps(
  novaMap: Map<number, { codigo?: string; descricao?: string }>,
  geralMap: Map<number, { codigo?: string; descricao?: string }>
): Map<number, { codigo?: string; descricao?: string }> {
  const out = new Map(novaMap);
  for (const [q, meta] of geralMap) {
    const cur = out.get(q) ?? {};
    out.set(q, { ...cur, ...meta });
  }
  return out;
}

function flattenQuestionsFromNova(novaRespostaAgregados: NovaRespostaAPI | null): SlideQuestionRow[] {
  if (!novaRespostaAgregados) return [];

  const alunos = (novaRespostaAgregados.tabela_detalhada?.geral?.alunos ?? []) as Array<{
    respostas_por_questao?: Array<{ questao?: number; acertou?: boolean }>;
  }>;
  if (alunos.length === 0) return [];

  const habMetaMap = buildQuestaoNumeroToHabilidadeMetaMap(novaRespostaAgregados);

  const byQuestao = new Map<number, { total: number; acertos: number }>();
  for (const aluno of alunos) {
    for (const r of aluno.respostas_por_questao ?? []) {
      const q = clampToNumber(r.questao, 0);
      if (q <= 0) continue;
      const cur = byQuestao.get(q) ?? { total: 0, acertos: 0 };
      cur.total += 1;
      if (r.acertou) cur.acertos += 1;
      byQuestao.set(q, cur);
    }
  }

  return Array.from(byQuestao.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([questao, v]) => ({
      questao,
      habilidade: habMetaMap.get(questao)?.codigo?.trim() || "—",
      habilidadeDescricao: habMetaMap.get(questao)?.descricao?.trim() || undefined,
      percentualAcertos: v.total > 0 ? Math.round((v.acertos / v.total) * 1000) / 10 : 0,
    }));
}

/** % de acerto por questão, uma entrada por turma (alunos da tabela detalhada). */
function buildQuestoesPorTurmaFromNova(
  novaRespostaAgregados: NovaRespostaAPI | null,
  habilidadePorQuestao: Map<number, { codigo?: string; descricao?: string }>
): Array<{ turma: string; serieTurma: string; questoes: SlideQuestionRow[] }> {
  if (!novaRespostaAgregados) return [];

  const habMap = habilidadePorQuestao;

  const alunos = (novaRespostaAgregados.tabela_detalhada?.geral?.alunos ?? []) as Array<{
    turma?: string;
    serie?: string;
    respostas_por_questao?: Array<{ questao?: number; acertou?: boolean }>;
  }>;
  if (alunos.length === 0) return [];

  const byTurma = new Map<string, typeof alunos>();
  for (const aluno of alunos) {
    const t = String(aluno.turma ?? "").trim() || "—";
    if (!byTurma.has(t)) byTurma.set(t, []);
    byTurma.get(t)!.push(aluno);
  }

  const out: Array<{ turma: string; serieTurma: string; questoes: SlideQuestionRow[] }> = [];
  for (const [turma, lista] of [...byTurma.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "pt-BR", { sensitivity: "base" })
  )) {
    const serieTurma =
      String(lista.find((a) => String(a.serie ?? "").trim())?.serie ?? "").trim() || extractSerieFromTurma(turma);

    const byQuestao = new Map<number, { total: number; acertos: number }>();
    for (const aluno of lista) {
      for (const r of aluno.respostas_por_questao ?? []) {
        const q = clampToNumber(r.questao, 0);
        if (q <= 0) continue;
        const cur = byQuestao.get(q) ?? { total: 0, acertos: 0 };
        cur.total += 1;
        if (r.acertou) cur.acertos += 1;
        byQuestao.set(q, cur);
      }
    }
    const questoes = Array.from(byQuestao.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([questao, v]) => ({
        questao,
        habilidade: habMap.get(questao)?.codigo?.trim() || "—",
        habilidadeDescricao: habMap.get(questao)?.descricao?.trim() || undefined,
        percentualAcertos: v.total > 0 ? Math.round((v.acertos / v.total) * 1000) / 10 : 0,
      }));
    if (questoes.length > 0) out.push({ turma, serieTurma, questoes });
  }
  return out;
}

/** % de acerto por questão, agregado por série (município — sem blocos por turma). */
function buildQuestoesPorSerieFromNova(
  novaRespostaAgregados: NovaRespostaAPI | null,
  habilidadePorQuestao: Map<number, { codigo?: string; descricao?: string }>
): Array<{ serie: string; questoes: SlideQuestionRow[] }> {
  if (!novaRespostaAgregados) return [];

  const habMap = habilidadePorQuestao;

  const alunos = (novaRespostaAgregados.tabela_detalhada?.geral?.alunos ?? []) as Array<{
    turma?: string;
    serie?: string;
    respostas_por_questao?: Array<{ questao?: number; acertou?: boolean }>;
  }>;
  if (alunos.length === 0) return [];

  const bySerie = new Map<string, typeof alunos>();
  for (const aluno of alunos) {
    const turmaStr = String(aluno.turma ?? "").trim();
    const serieRaw = String(aluno.serie ?? "").trim();
    const serie = serieRaw || extractSerieFromTurma(turmaStr) || "GERAL";
    if (!bySerie.has(serie)) bySerie.set(serie, []);
    bySerie.get(serie)!.push(aluno);
  }

  const out: Array<{ serie: string; questoes: SlideQuestionRow[] }> = [];
  for (const [serie, lista] of [...bySerie.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "pt-BR", { sensitivity: "base" })
  )) {
    const byQuestao = new Map<number, { total: number; acertos: number }>();
    for (const aluno of lista) {
      for (const r of aluno.respostas_por_questao ?? []) {
        const q = clampToNumber(r.questao, 0);
        if (q <= 0) continue;
        const cur = byQuestao.get(q) ?? { total: 0, acertos: 0 };
        cur.total += 1;
        if (r.acertou) cur.acertos += 1;
        byQuestao.set(q, cur);
      }
    }
    const questoes = Array.from(byQuestao.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([questao, v]) => ({
        questao,
        habilidade: habMap.get(questao)?.codigo?.trim() || "—",
        habilidadeDescricao: habMap.get(questao)?.descricao?.trim() || undefined,
        percentualAcertos: v.total > 0 ? Math.round((v.acertos / v.total) * 1000) / 10 : 0,
      }));
    if (questoes.length > 0) out.push({ serie, questoes });
  }
  return out;
}

function buildCursoSerieTurma(
  relatorio: Partial<RelatorioCompleto> | null,
  deckPresence: PresenceBySeriesRow[],
  novaRespostaAgregados: NovaRespostaAPI | null
): { curso: string; serie: string; turma: string } {
  const serie = deckPresence[0]?.label ?? "N/A";
  const turmaFromNova = String(novaRespostaAgregados?.tabela_detalhada?.geral?.alunos?.[0]?.turma ?? "").trim();
  const turma = turmaFromNova || relatorio?.total_alunos?.por_turma?.[0]?.turma || deckPresence[0]?.turmaLabel || "N/A";

  // regra simples: se série tiver números "6-9" e "EM", tratamos como Anos Finais
  const serieLower = serie.toLowerCase();
  let curso = "Anos Iniciais";
  if (/\b(6|7|8|9)\b/.test(serieLower) || serieLower.includes("em") || serieLower.includes("medio") || serieLower.includes("médio") || serieLower.includes("ensino médio")) {
    curso = "Anos Finais";
  }
  if (serieLower.includes("grupo")) curso = "Anos Iniciais";

  return { curso, serie, turma };
}

function novaIsGranularidadeMunicipio(nova: NovaRespostaAPI | null | undefined): boolean {
  return String(nova?.nivel_granularidade ?? "") === "municipio";
}

/** Todas as turmas com participação no relatório agregado e/ou tabela detalhada da nova resposta. */
function collectTurmasParticipantes(
  relatorio: Partial<RelatorioCompleto> | null,
  novaRespostaAgregados: NovaRespostaAPI | null,
  presencaPorSerie: PresenceBySeriesRow[],
  proficienciaGeralPorTurma: ProficiencyGeneralByTurmaRow[],
  comparisonAxis: PresentationComparisonAxis,
  selectedSchoolId?: string
): string[] {
  const set = new Set<string>();
  const omitNovaWideTurmas =
    Boolean(selectedSchoolId?.trim()) && novaIsGranularidadeMunicipio(novaRespostaAgregados);

  for (const row of relatorio?.total_alunos?.por_turma ?? []) {
    const t = String((row as { turma?: string }).turma ?? "").trim();
    if (t) set.add(t);
  }

  if (!omitNovaWideTurmas) {
    const alunosGeral = novaRespostaAgregados?.tabela_detalhada?.geral?.alunos ?? [];
    for (const a of alunosGeral) {
      const t = String((a as { turma?: string }).turma ?? "").trim();
      if (t) set.add(t);
    }

    for (const d of novaRespostaAgregados?.tabela_detalhada?.disciplinas ?? []) {
      for (const a of d.alunos ?? []) {
        const t = String((a as { turma?: string }).turma ?? "").trim();
        if (t) set.add(t);
      }
    }
  }

  if (set.size === 0) {
    for (const r of presencaPorSerie) {
      if (r.turmaLabel?.trim()) set.add(r.turmaLabel.trim());
      if (comparisonAxis === "turma" && r.label?.trim()) set.add(r.label.trim());
    }
    for (const r of proficienciaGeralPorTurma) {
      const lab = String(r.label ?? "").trim();
      if (lab && lab !== "GERAL") set.add(lab);
    }
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

function buildLevelsBySeries(relatorio: Partial<RelatorioCompleto> | null, presenceSeries: PresenceBySeriesRow[]): NiveisBySeriesRow[] {
  if (!relatorio) return [];
  const series = presenceSeries.map((s) => s.label);
  return groupNiveisFromRelatorio(relatorio, series);
}

function normKey(s?: string | null): string {
  return normalizeText(String(s ?? "").trim())
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isTodasTurmasAggregateLabel(turma?: string | null): boolean {
  return normKey(turma) === normKey("Todas as turmas");
}

/** `null` = sem bloco por turma confiável (payload legado) → todas as linhas contam. */
function buildRelatorioTurmaAvaliadosMap(relatorio: Partial<RelatorioCompleto> | null): Map<string, number> | null {
  const rows = relatorio?.total_alunos?.por_turma;
  if (!rows?.length) return null;
  const m = new Map<string, number>();
  for (const row of rows) {
    const t = String((row as { turma?: string }).turma ?? "").trim();
    if (!t) continue;
    m.set(normKey(t), clampToNumber((row as { avaliados?: unknown }).avaliados, 0));
  }
  return m.size > 0 ? m : null;
}

function relatorioTurmaTeveAvaliados(avMap: Map<string, number> | null, turmaLabel: string): boolean {
  if (!avMap) return true;
  const k = normKey(turmaLabel);
  if (!avMap.has(k)) return true;
  return (avMap.get(k) ?? 0) > 0;
}

function deveIncluirLinhaPorTurmaRelatorio(
  relatorio: Partial<RelatorioCompleto> | null,
  turmaLabel: string,
  avMap?: Map<string, number> | null
): boolean {
  const t = String(turmaLabel ?? "").trim();
  if (!t) return false;
  if (isTodasTurmasAggregateLabel(t)) return false;
  const m = avMap !== undefined ? avMap : buildRelatorioTurmaAvaliadosMap(relatorio);
  return relatorioTurmaTeveAvaliados(m, t);
}

function novaAvaliacaoTeveParticipantes(a: { alunos_participantes?: unknown }): boolean {
  const raw = a.alunos_participantes;
  if (raw === undefined || raw === null || String(raw) === "") return true;
  const n = Number(raw);
  if (!Number.isFinite(n)) return true;
  return clampToNumber(n, 0) > 0;
}

function deveIncluirLinhaNovaAvaliacao(a: { turma?: string | null | undefined; alunos_participantes?: unknown }): boolean {
  if (!novaAvaliacaoTeveParticipantes(a)) return false;
  const turma = String(a.turma ?? "").trim();
  if (turma && isTodasTurmasAggregateLabel(turma)) return false;
  return true;
}

/** Média de proficiência geral só entre linhas elegíveis (participação + não agregado «Todas as turmas»). */
function mediaProficienciaGeralDasTurmasNoDeck(
  relatorio: Partial<RelatorioCompleto> | null,
  rows: ProficiencyGeneralByTurmaRow[],
  excludeLabelNorm?: string
): number {
  const avMap = buildRelatorioTurmaAvaliadosMap(relatorio);
  const ex = excludeLabelNorm ?? "";
  const filtered = rows.filter((r) => {
    const lab = String(r.label ?? "").trim();
    if (!lab) return false;
    if (ex && normKey(lab) === ex) return false;
    if (isTodasTurmasAggregateLabel(lab)) return false;
    return deveIncluirLinhaPorTurmaRelatorio(relatorio, lab, avMap);
  });
  const base =
    filtered.length > 0
      ? filtered
      : rows.filter((r) => {
          const lab = String(r.label ?? "").trim();
          if (!lab) return false;
          if (ex && normKey(lab) === ex) return false;
          return !isTodasTurmasAggregateLabel(lab);
        });
  const vals = base.map((r) => clampToNumber(r.proficiencia, 0));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function mediaProficienciaPorDisciplinaDasTurmasNoRelatorio(
  relatorio: Partial<RelatorioCompleto> | null,
  valuesByTurma: Array<{ turma: string; proficiencia: number }>,
  excludeTurmaNorm?: string
): number {
  const avMap = buildRelatorioTurmaAvaliadosMap(relatorio);
  const ex = excludeTurmaNorm ?? "";
  const filtered = valuesByTurma.filter((v) => {
    const t = String(v.turma ?? "").trim();
    if (!t) return false;
    if (ex && normKey(t) === ex) return false;
    if (isTodasTurmasAggregateLabel(t)) return false;
    return deveIncluirLinhaPorTurmaRelatorio(relatorio, t, avMap);
  });
  const base =
    filtered.length > 0
      ? filtered
      : valuesByTurma.filter((v) => {
          const t = String(v.turma ?? "").trim();
          if (!t) return false;
          if (ex && normKey(t) === ex) return false;
          return !isTodasTurmasAggregateLabel(t);
        });
  const vals = base.map((v) => clampToNumber(v.proficiencia, 0));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function mediaNotaDasTurmasNoRelatorio(
  relatorio: Partial<RelatorioCompleto> | null,
  rows: NotaPorCategoriaDeck[],
  excludeLabelNorm?: string
): number {
  const avMap = buildRelatorioTurmaAvaliadosMap(relatorio);
  const ex = excludeLabelNorm ?? "";
  const filtered = rows.filter((r) => {
    const lab = String(r.label ?? "").trim();
    if (!lab) return false;
    if (ex && normKey(lab) === ex) return false;
    if (isTodasTurmasAggregateLabel(lab)) return false;
    return deveIncluirLinhaPorTurmaRelatorio(relatorio, lab, avMap);
  });
  const base =
    filtered.length > 0
      ? filtered
      : rows.filter((r) => {
          const lab = String(r.label ?? "").trim();
          if (!lab) return false;
          if (ex && normKey(lab) === ex) return false;
          return !isTodasTurmasAggregateLabel(lab);
        });
  const vals = base.map((r) => clampToNumber(r.mediaNota, 0));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function inferSerieForTurmaFromNova(nova: NovaRespostaAPI | null, turmaLabel: string): string {
  const tKey = normKey(turmaLabel);
  if (!tKey) return "";
  const alunos = (nova?.tabela_detalhada?.geral?.alunos ?? []) as Array<{ turma?: string; serie?: string }>;
  const freq = new Map<string, number>();
  for (const a of alunos) {
    const t = String(a.turma ?? "").trim();
    const s = String(a.serie ?? "").trim();
    if (!t || !s) continue;
    if (normKey(t) !== tKey) continue;
    freq.set(s, (freq.get(s) ?? 0) + 1);
  }
  let best = "";
  let bestN = 0;
  for (const [serie, n] of freq.entries()) {
    if (n > bestN) {
      best = serie;
      bestN = n;
    }
  }
  return best;
}

function collectTurmasBySerieFromNova(nova: NovaRespostaAPI | null, serieFilterLabel?: string): Set<string> {
  const serieKey = serieFilterLabel?.trim() ? normKey(serieFilterLabel.trim()) : "";
  const set = new Set<string>();
  if (!serieKey) return set;
  const alunos = (nova?.tabela_detalhada?.geral?.alunos ?? []) as Array<{ turma?: string; serie?: string }>;
  for (const a of alunos) {
    const s = String(a.serie ?? "").trim();
    const t = String(a.turma ?? "").trim();
    if (t && s && normKey(s) === serieKey) set.add(t);
  }
  return set;
}

function groupPresencePorEscola(relatorio: Partial<RelatorioCompleto> | null): PresenceBySeriesRow[] {
  const rows = relatorio?.total_alunos?.por_escola ?? [];
  if (!rows.length) return [];
  return rows
    .map((row) => {
      const label = String(row.escola ?? "").trim();
      const matriculados = clampToNumber(row.matriculados, 0);
      const avaliados = clampToNumber(row.avaliados, 0);
      const presencaMediaPct = matriculados > 0 ? (avaliados / matriculados) * 100 : 0;
      return {
        label,
        totalAlunos: matriculados,
        totalPresentes: avaliados,
        presencaMediaPct,
        alunosFaltosos: Math.max(0, matriculados - avaliados),
      };
    })
    .filter((r) => r.label.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function groupPresencePorTurmaDireto(
  relatorio: Partial<RelatorioCompleto> | null,
  serieFilterLabel?: string
): PresenceBySeriesRow[] {
  const rows = relatorio?.total_alunos?.por_turma ?? [];
  if (!rows.length) return [];
  const filtered = serieFilterLabel
    ? rows.filter((row) => {
        const s = String((row as { serie?: string }).serie ?? "").trim() || extractSerieFromTurma(row.turma);
        return normKey(s) === normKey(serieFilterLabel);
      })
    : rows;
  return filtered
    .map((row) => {
      const label = String(row.turma ?? "").trim();
      const matriculados = clampToNumber(row.matriculados, 0);
      const avaliados = clampToNumber(row.avaliados, 0);
      const presencaMediaPct = matriculados > 0 ? (avaliados / matriculados) * 100 : 0;
      return {
        label,
        totalAlunos: matriculados,
        totalPresentes: avaliados,
        presencaMediaPct,
        alunosFaltosos: Math.max(0, matriculados - avaliados),
        turmaLabel: label,
      };
    })
    .filter((r) => r.label.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function groupNiveisPorEscola(relatorio: Partial<RelatorioCompleto> | null): NiveisBySeriesRow[] {
  const niveis = relatorio?.niveis_aprendizagem;
  if (!niveis) return [];
  const geralKey = findGeralKey(niveis) ?? "GERAL";
  const disciplinaGeral = (niveis as AnyRecord)[geralKey] as { por_escola?: Array<Record<string, number | string>> } | undefined;
  const porEscola = disciplinaGeral?.por_escola ?? [];
  if (!porEscola.length) return [];
  return porEscola
    .map((row) => {
      const label = String(row.escola ?? "").trim();
      const abaixoDoBasico = clampToNumber(row.abaixo_do_basico, 0);
      const basico = clampToNumber(row.basico, 0);
      const adequado = clampToNumber(row.adequado, 0);
      const avancado = clampToNumber(row.avancado, 0);
      const total = clampToNumber(row.total, abaixoDoBasico + basico + adequado + avancado);
      return { label, abaixoDoBasico, basico, adequado, avancado, total };
    })
    .filter((r) => r.label.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function groupNiveisPorTurmaDireto(
  relatorio: Partial<RelatorioCompleto> | null,
  serieFilterLabel?: string
): NiveisBySeriesRow[] {
  const niveis = relatorio?.niveis_aprendizagem;
  if (!niveis) return [];
  const geralKey = findGeralKey(niveis) ?? "GERAL";
  const disciplinaGeral = (niveis as AnyRecord)[geralKey] as {
    por_turma?: Array<{
      serie?: string;
      turma: string;
      abaixo_do_basico: number;
      basico: number;
      adequado: number;
      avancado: number;
      total: number;
    }>;
  };
  const porTurma = disciplinaGeral?.por_turma ?? [];
  const filtered = serieFilterLabel
    ? porTurma.filter((row) => {
        const s = String(row.serie ?? "").trim() || extractSerieFromTurma(row.turma);
        return normKey(s) === normKey(serieFilterLabel);
      })
    : porTurma;
  return filtered
    .map((row) => {
      const label = String(row.turma ?? "").trim();
      const abaixoDoBasico = clampToNumber(row.abaixo_do_basico, 0);
      const basico = clampToNumber(row.basico, 0);
      const adequado = clampToNumber(row.adequado, 0);
      const avancado = clampToNumber(row.avancado, 0);
      const total = clampToNumber(row.total, abaixoDoBasico + basico + adequado + avancado);
      return { label, abaixoDoBasico, basico, adequado, avancado, total };
    })
    .filter((r) => r.label.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function buildProficiencyGeneralPorEscola(relatorio: Partial<RelatorioCompleto> | null): ProficiencyGeneralByTurmaRow[] {
  const mapPorEscola = (
    porEscola: Array<{ escola?: string; proficiencia?: number; media?: number }> | undefined
  ): ProficiencyGeneralByTurmaRow[] =>
    (porEscola ?? [])
      .map((r) => ({
        label: String(r.escola ?? "").trim(),
        proficiencia: clampToNumber(r.proficiencia ?? r.media, 0),
      }))
      .filter((r) => r.label.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));

  const prof = relatorio?.proficiencia?.por_disciplina;
  if (prof) {
    const geralKey = findGeralKey(prof) ?? "GERAL";
    const geral = (prof as AnyRecord)[geralKey] as { por_escola?: Array<{ escola?: string; proficiencia?: number; media?: number }> };
    const fromDisc = mapPorEscola(geral?.por_escola);
    if (fromDisc.length > 0) return fromDisc;
  }

  const geralTop = (relatorio?.proficiencia as AnyRecord | undefined)?.geral as
    | { por_escola?: Array<{ escola?: string; proficiencia?: number; media?: number }> }
    | undefined;
  return mapPorEscola(geralTop?.por_escola);
}

function buildProficiencyGeneralPorSerieFromRelatorio(relatorio: Partial<RelatorioCompleto> | null): ProficiencyGeneralByTurmaRow[] {
  const prof = relatorio?.proficiencia?.por_disciplina;
  if (!prof) return [];
  const geralKey = findGeralKey(prof) ?? "GERAL";
  const geral = (prof as AnyRecord)[geralKey] as { por_turma?: Array<{ turma: string; proficiencia: number }> };
  const porTurma = geral?.por_turma ?? [];
  const avMap = buildRelatorioTurmaAvaliadosMap(relatorio);
  const map = new Map<string, { sum: number; n: number }>();
  for (const row of porTurma) {
    if (!deveIncluirLinhaPorTurmaRelatorio(relatorio, String(row.turma ?? "").trim(), avMap)) continue;
    const serie = extractSerieFromTurma(row.turma);
    if (!isValidSerieLabel(serie)) continue;
    const p = clampToNumber(row.proficiencia, 0);
    const cur = map.get(serie) ?? { sum: 0, n: 0 };
    cur.sum += p;
    cur.n += 1;
    map.set(serie, cur);
  }
  return Array.from(map.entries())
    .map(([label, v]) => ({ label, proficiencia: v.n > 0 ? v.sum / v.n : 0 }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function buildProficiencyByDisciplinePorCategoria(
  relatorio: Partial<RelatorioCompleto> | null,
  axis: "escola" | "serie" | "turma",
  serieFilterLabel?: string
): ProficiencyByDisciplineByTurmaRow[] {
  const profDisc = relatorio?.proficiencia?.por_disciplina;
  if (!profDisc) return [];
  const geralKey = findGeralKey(profDisc) ?? "GERAL";
  const avMap = buildRelatorioTurmaAvaliadosMap(relatorio);

  return Object.entries(profDisc as AnyRecord)
    .filter(([k]) => normalizeText(k).toLowerCase() !== normalizeText(geralKey).toLowerCase())
    .map(([disciplina, dadosDisc]) => {
      const porTurma = (dadosDisc as AnyRecord)?.por_turma as Array<{ turma: string; proficiencia: number; serie?: string }>;
      const porEscola = (dadosDisc as AnyRecord)?.por_escola as Array<{ escola: string; proficiencia?: number; media?: number }>;
      if (axis === "escola" && porEscola?.length) {
        return {
          disciplina,
          valuesByTurma: porEscola.map((r) => ({
            turma: String(r.escola ?? "").trim(),
            proficiencia: clampToNumber(r.proficiencia ?? r.media, 0),
          })),
        };
      }
      const rows = (porTurma ?? []).filter((r) => {
        const t = String(r.turma ?? "").trim();
        if (axis === "serie" || axis === "turma") {
          if (!deveIncluirLinhaPorTurmaRelatorio(relatorio, t, avMap)) return false;
        }
        if (axis === "turma" && serieFilterLabel) {
          const s = String(r.serie ?? "").trim() || extractSerieFromTurma(r.turma);
          return normKey(s) === normKey(serieFilterLabel);
        }
        return true;
      });
      const valuesByTurma =
        axis === "serie"
          ? (() => {
              const m = new Map<string, { sum: number; n: number }>();
              for (const r of rows) {
                const lab = extractSerieFromTurma(r.turma);
                if (!isValidSerieLabel(lab)) continue;
                const cur = m.get(lab) ?? { sum: 0, n: 0 };
                cur.sum += clampToNumber(r.proficiencia, 0);
                cur.n += 1;
                m.set(lab, cur);
              }
              return Array.from(m.entries()).map(([turma, v]) => ({
                turma,
                proficiencia: v.n > 0 ? v.sum / v.n : 0,
              }));
            })()
          : rows.map((r) => ({
              turma: String(r.turma ?? "").trim(),
              proficiencia: clampToNumber(r.proficiencia, 0),
            }));
      return { disciplina, valuesByTurma };
    })
    .filter((d) => d.valuesByTurma.length > 0);
}

function buildNotasPorCategoriaFromRelatorio(
  relatorio: Partial<RelatorioCompleto> | null,
  axis: "escola" | "serie" | "turma",
  serieFilterLabel?: string
): NotaPorCategoriaDeck[] {
  const ng = relatorio?.nota_geral?.por_disciplina;
  if (!ng || typeof ng !== "object") return [];

  if (axis === "escola") {
    const geralKey = findGeralKey(ng) ?? Object.keys(ng)[0];
    const disc = (ng as AnyRecord)[geralKey] as { por_escola?: Array<{ escola: string; nota?: number; media?: number }> };
    const porEscola = disc?.por_escola ?? [];
    return porEscola
      .map((e) => ({
        label: String(e.escola ?? "").trim(),
        mediaNota: clampToNumber(e.nota ?? e.media, 0),
      }))
      .filter((r) => r.label.length > 0);
  }

  const outMap = new Map<string, { sum: number; n: number }>();
  const avMap = buildRelatorioTurmaAvaliadosMap(relatorio);
  for (const [, dadosDisc] of Object.entries(ng as AnyRecord)) {
    const porTurma = (dadosDisc as AnyRecord)?.por_turma as Array<{ turma: string; nota: number; serie?: string }>;
    for (const r of porTurma ?? []) {
      const t = String(r.turma ?? "").trim();
      if (axis === "serie" || axis === "turma") {
        if (!deveIncluirLinhaPorTurmaRelatorio(relatorio, t, avMap)) continue;
      }
      if (axis === "turma" && serieFilterLabel) {
        const s = String(r.serie ?? "").trim() || extractSerieFromTurma(r.turma);
        if (normKey(s) !== normKey(serieFilterLabel)) continue;
      }
      const lab =
        axis === "serie" ? extractSerieFromTurma(r.turma) : String(r.turma ?? "").trim();
      if (axis === "serie" && !isValidSerieLabel(lab)) continue;
      if (!lab) continue;
      const cur = outMap.get(lab) ?? { sum: 0, n: 0 };
      cur.sum += clampToNumber(r.nota, 0);
      cur.n += 1;
      outMap.set(lab, cur);
    }
  }
  return Array.from(outMap.entries())
    .map(([label, v]) => ({ label, mediaNota: v.n > 0 ? v.sum / v.n : 0 }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

/**
 * Mesma lista usada na tela de resultados (GET evaluation-results/avaliacoes): priorizar estes agregados
 * em relação ao RelatorioCompleto quando existirem.
 */
function proficiencyGeralPorEscolaFromNovaAvaliacoes(nova: NovaRespostaAPI | null): ProficiencyGeneralByTurmaRow[] {
  const g = nova?.nivel_granularidade;
  const av = nova?.resultados_detalhados?.avaliacoes;
  if (g !== "municipio" || !av?.length) return [];
  return av
    .filter((a) => novaAvaliacaoTeveParticipantes(a))
    .map((a) => ({
      label: String(a.escola ?? "").trim(),
      proficiencia: clampToNumber(a.media_proficiencia, 0),
    }))
    .filter((r) => r.label.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function proficiencyByDisciplinePorEscolaFromNovaAvaliacoes(nova: NovaRespostaAPI | null): ProficiencyByDisciplineByTurmaRow[] {
  const g = nova?.nivel_granularidade;
  const av = nova?.resultados_detalhados?.avaliacoes;
  if (g !== "municipio" || !av?.length) return [];

  const byDisc = new Map<string, Array<{ turma: string; proficiencia: number }>>();
  for (const a of av) {
    if (!novaAvaliacaoTeveParticipantes(a)) continue;
    const escola = String(a.escola ?? "").trim();
    if (!escola) continue;
    const mds = a.medias_por_disciplina;
    if (mds?.length) {
      for (const md of mds) {
        const disciplina = String(md.disciplina ?? "").trim();
        if (!disciplina) continue;
        const p = clampToNumber(md.media_proficiencia, NaN);
        if (!Number.isFinite(p)) continue;
        const arr = byDisc.get(disciplina) ?? [];
        arr.push({ turma: escola, proficiencia: p });
        byDisc.set(disciplina, arr);
      }
    } else {
      const p = clampToNumber(a.media_proficiencia, NaN);
      if (!Number.isFinite(p)) continue;
      const disciplina = "Geral";
      const arr = byDisc.get(disciplina) ?? [];
      arr.push({ turma: escola, proficiencia: p });
      byDisc.set(disciplina, arr);
    }
  }

  return Array.from(byDisc.entries())
    .map(([disciplina, valuesByTurma]) => ({
      disciplina,
      valuesByTurma: valuesByTurma.sort((x, y) =>
        x.turma.localeCompare(y.turma, "pt-BR", { sensitivity: "base" })
      ),
    }))
    .filter((d) => d.valuesByTurma.length > 0)
    .sort((a, b) => a.disciplina.localeCompare(b.disciplina, "pt-BR", { sensitivity: "base" }));
}

function notasPorCategoriaEscolaFromNovaAvaliacoes(nova: NovaRespostaAPI | null): NotaPorCategoriaDeck[] {
  const g = nova?.nivel_granularidade;
  const av = nova?.resultados_detalhados?.avaliacoes;
  if (g !== "municipio" || !av?.length) return [];
  return av
    .filter((a) => novaAvaliacaoTeveParticipantes(a))
    .map((a) => ({
      label: String(a.escola ?? "").trim(),
      mediaNota: clampToNumber(a.media_nota, 0),
    }))
    .filter((r) => r.label.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

/** Uma linha por série quando `avaliacoes` traz `serie` (ou dá para inferir). */
function proficiencyGeralPorSerieFromNovaAvaliacoes(nova: NovaRespostaAPI | null): ProficiencyGeneralByTurmaRow[] {
  const av = nova?.resultados_detalhados?.avaliacoes;
  if (!av?.length) return [];

  const map = new Map<string, { sum: number; n: number }>();
  for (const a of av) {
    if (!deveIncluirLinhaNovaAvaliacao(a)) continue;
    const serieRaw = String(a.serie ?? "").trim();
    const serie = serieRaw || extractSerieFromTurma(String(a.turma ?? ""));
    if (!isValidSerieLabel(serie)) continue;
    const p = clampToNumber(a.media_proficiencia, NaN);
    if (!Number.isFinite(p)) continue;
    const cur = map.get(serie) ?? { sum: 0, n: 0 };
    cur.sum += p;
    cur.n += 1;
    map.set(serie, cur);
  }

  if (map.size === 0) return [];

  return Array.from(map.entries())
    .map(([label, v]) => ({ label, proficiencia: v.n > 0 ? v.sum / v.n : 0 }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

/** Uma linha por turma quando `avaliacoes` lista turmas com média agregada (mesma base da API). */
function proficiencyGeralPorTurmaFromNovaAvaliacoes(nova: NovaRespostaAPI | null): ProficiencyGeneralByTurmaRow[] {
  const av = nova?.resultados_detalhados?.avaliacoes;
  if (!av?.length) return [];
  const map = new Map<string, { sum: number; n: number }>();
  for (const a of av) {
    if (!deveIncluirLinhaNovaAvaliacao(a)) continue;
    const turma = String(a.turma ?? "").trim();
    if (!turma) continue;
    const p = clampToNumber(a.media_proficiencia, NaN);
    if (!Number.isFinite(p)) continue;
    const cur = map.get(turma) ?? { sum: 0, n: 0 };
    cur.sum += p;
    cur.n += 1;
    map.set(turma, cur);
  }
  if (map.size === 0) return [];
  return Array.from(map.entries())
    .map(([label, v]) => ({ label, proficiencia: v.n > 0 ? v.sum / v.n : 0 }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function notasPorCategoriaFromNovaAvaliacoesSerie(nova: NovaRespostaAPI | null): NotaPorCategoriaDeck[] {
  const av = nova?.resultados_detalhados?.avaliacoes;
  if (!av?.length) return [];
  const map = new Map<string, { sum: number; n: number }>();
  for (const a of av) {
    if (!deveIncluirLinhaNovaAvaliacao(a)) continue;
    const serieRaw = String(a.serie ?? "").trim();
    const serie = serieRaw || extractSerieFromTurma(String(a.turma ?? ""));
    if (!isValidSerieLabel(serie)) continue;
    const n = clampToNumber(a.media_nota, NaN);
    if (!Number.isFinite(n)) continue;
    const cur = map.get(serie) ?? { sum: 0, n: 0 };
    cur.sum += n;
    cur.n += 1;
    map.set(serie, cur);
  }
  if (map.size === 0) return [];
  return Array.from(map.entries())
    .map(([label, v]) => ({ label, mediaNota: v.n > 0 ? v.sum / v.n : 0 }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function notasPorCategoriaFromNovaAvaliacoesTurma(nova: NovaRespostaAPI | null): NotaPorCategoriaDeck[] {
  const av = nova?.resultados_detalhados?.avaliacoes;
  if (!av?.length) return [];
  const map = new Map<string, { sum: number; n: number }>();
  for (const a of av) {
    if (!deveIncluirLinhaNovaAvaliacao(a)) continue;
    const turma = String(a.turma ?? "").trim();
    if (!turma) continue;
    const n = clampToNumber(a.media_nota, NaN);
    if (!Number.isFinite(n)) continue;
    const cur = map.get(turma) ?? { sum: 0, n: 0 };
    cur.sum += n;
    cur.n += 1;
    map.set(turma, cur);
  }
  if (map.size === 0) return [];
  return Array.from(map.entries())
    .map(([label, v]) => ({ label, mediaNota: v.n > 0 ? v.sum / v.n : 0 }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function proficiencySerieOuGeralFromNovaEstatisticas(nova: NovaRespostaAPI | null): ProficiencyGeneralByTurmaRow[] {
  const media = clampToNumber(nova?.estatisticas_gerais?.media_proficiencia_geral, NaN);
  if (!Number.isFinite(media)) return [];
  const serieRaw = String(nova?.estatisticas_gerais?.serie ?? "").trim();
  const label = isValidSerieLabel(serieRaw) ? serieRaw : "GERAL";
  return [{ label, proficiencia: media }];
}

function presenceFromNovaAvaliacoesMunicipio(nova: NovaRespostaAPI | null): PresenceBySeriesRow[] {
  const g = nova?.nivel_granularidade;
  const av = nova?.resultados_detalhados?.avaliacoes;
  if (g !== "municipio" || !av?.length) return [];
  return av
    .map((a) => {
      const label = String(a.escola ?? "").trim();
      const totalAlunos = clampToNumber(a.total_alunos, 0);
      const totalPresentes = clampToNumber(a.alunos_participantes, 0);
      const presencaMediaPct = totalAlunos > 0 ? (totalPresentes / totalAlunos) * 100 : 0;
      return {
        label: label || "—",
        totalAlunos,
        totalPresentes,
        presencaMediaPct,
        alunosFaltosos: Math.max(0, totalAlunos - totalPresentes),
      };
    })
    .filter((r) => r.label.length > 0);
}

function niveisFromNovaAvaliacoesEscola(nova: NovaRespostaAPI | null): NiveisBySeriesRow[] {
  const g = nova?.nivel_granularidade;
  const av = nova?.resultados_detalhados?.avaliacoes;
  if (g !== "municipio" || !av?.length) return [];
  return av
    .map((a) => {
      const label = String(a.escola ?? "").trim();
      const d = a.distribuicao_classificacao;
      const abaixoDoBasico = clampToNumber(d?.abaixo_do_basico, 0);
      const basico = clampToNumber(d?.basico, 0);
      const adequado = clampToNumber(d?.adequado, 0);
      const avancado = clampToNumber(d?.avancado, 0);
      const total = safeSum([abaixoDoBasico, basico, adequado, avancado]);
      return { label: label || "—", abaixoDoBasico, basico, adequado, avancado, total };
    })
    .filter((r) => r.label.length > 0);
}

/**
 * Proficiência por disciplina real (Português, Matemática, …).
 * Se a Nova só trouxer agregado "Geral", usa `por_escola` do relatório completo.
 */
function resolveProficiencyPorDisciplinaPorTurma(
  relatorio: Partial<RelatorioCompleto> | null,
  nova: NovaRespostaAPI | null,
  axis: PresentationComparisonAxis,
  serieFilterLabel?: string
): ProficiencyByDisciplineByTurmaRow[] {
  const filter = filterPresentation19RealDisciplineRows;

  if (axis === "escola") {
    const fromRel = filter(buildProficiencyByDisciplinePorCategoria(relatorio, "escola"));
    if (fromRel.length > 0) return fromRel;
    const fromNova = filter(proficiencyByDisciplinePorEscolaFromNovaAvaliacoes(nova));
    if (hasPresentation19RealDisciplineBreakdown(fromNova)) return fromNova;
    return filter(buildProficiencyByDisciplineByTurma(relatorio));
  }

  if (axis === "serie") {
    const fromNova = filter(buildProficiencyByDisciplineByTurmaFromNova(nova));
    if (hasPresentation19RealDisciplineBreakdown(fromNova)) return fromNova;
    const fromRel = filter(buildProficiencyByDisciplinePorCategoria(relatorio, "serie"));
    if (fromRel.length > 0) return fromRel;
    return filter(buildProficiencyByDisciplineByTurma(relatorio));
  }

  if (axis === "turma") {
    const fromNova = filter(buildProficiencyByDisciplineByTurmaFromNova(nova));
    if (hasPresentation19RealDisciplineBreakdown(fromNova)) return fromNova;
    const fromRel = filter(buildProficiencyByDisciplinePorCategoria(relatorio, "turma", serieFilterLabel));
    if (fromRel.length > 0) return fromRel;
    return filter(buildProficiencyByDisciplineByTurma(relatorio));
  }

  return filter(buildProficiencyByDisciplineByTurma(relatorio));
}

function resolveNotasPorDisciplinaPorTurma(
  relatorio: Partial<RelatorioCompleto> | null,
  nova: NovaRespostaAPI | null,
  axis: PresentationComparisonAxis,
  serieFilterLabel?: string
): NotaByDisciplineByTurmaRow[] {
  const filter = filterPresentation19RealDisciplineRows;

  if (axis === "escola") {
    const fromRel = filter(buildNotasByDisciplinePorCategoria(relatorio, "escola"));
    if (fromRel.length > 0) return fromRel;
    const fromNova = filter(notasByDisciplinePorEscolaFromNovaAvaliacoes(nova));
    if (hasPresentation19RealDisciplineBreakdown(fromNova)) return fromNova;
    return filter(buildNotasByDisciplineByTurma(relatorio));
  }

  if (axis === "serie") {
    const fromNova = filter(notasByDisciplinePorSerieFromNovaAvaliacoes(nova));
    if (hasPresentation19RealDisciplineBreakdown(fromNova)) return fromNova;
    const fromRel = filter(buildNotasByDisciplinePorCategoria(relatorio, "serie"));
    if (fromRel.length > 0) return fromRel;
    return filter(buildNotasByDisciplineByTurma(relatorio));
  }

  if (axis === "turma") {
    const fromNova = filter(notasByDisciplinePorSerieFromNovaAvaliacoes(nova));
    if (hasPresentation19RealDisciplineBreakdown(fromNova)) return fromNova;
    const fromRel = filter(buildNotasByDisciplinePorCategoria(relatorio, "turma", serieFilterLabel));
    if (fromRel.length > 0) return fromRel;
    return filter(buildNotasByDisciplineByTurma(relatorio));
  }

  return filter(buildNotasByDisciplineByTurma(relatorio));
}

function buildMetricsForAxis(
  axis: PresentationComparisonAxis,
  relatorio: Partial<RelatorioCompleto> | null,
  nova: NovaRespostaAPI | null,
  serieFilterLabel: string | undefined,
  turmaFilterLabel: string | undefined
): {
  presencaPorSerie: PresenceBySeriesRow[];
  niveisPorSerie: NiveisBySeriesRow[];
  proficienciaGeralPorTurma: ProficiencyGeneralByTurmaRow[];
  proficienciaPorDisciplinaPorTurma: ProficiencyByDisciplineByTurmaRow[];
  notasPorDisciplinaPorTurma: NotaByDisciplineByTurmaRow[];
  notasPorCategoria: NotaPorCategoriaDeck[];
} {
  if (axis === "escola") {
    let presenca = groupPresencePorEscola(relatorio);
    if (presenca.length === 0) presenca = presenceFromNovaAvaliacoesMunicipio(nova);
    if (presenca.length === 0) presenca = groupPresenceFromRelatorio(relatorio);

    let niveis = groupNiveisPorEscola(relatorio);
    if (niveis.length === 0) niveis = niveisFromNovaAvaliacoesEscola(nova);
    if (niveis.length === 0) {
      niveis = groupNiveisFromNova(nova, presenca[0]?.label ?? "GERAL");
    }
    if (niveis.length === 0) {
      const fakePresence = groupPresenceFromRelatorio(relatorio);
      const series = fakePresence.map((p) => p.label);
      niveis = groupNiveisFromRelatorio(relatorio, series.length ? series : ["GERAL"]);
    }

    let profGeral = buildProficiencyGeneralPorEscola(relatorio);
    if (profGeral.length === 0) profGeral = proficiencyGeralPorEscolaFromNovaAvaliacoes(nova);
    if (profGeral.length === 0) {
      const fromNova = buildProficiencyGeneralByTurmaFromNova(nova);
      if (fromNova.length > 0) profGeral = fromNova;
    }
    if (profGeral.length === 0) {
      profGeral = buildProficiencyGeneralPorSerieFromRelatorio(relatorio);
    }
    if (profGeral.length === 0) profGeral = buildProficiencyGeneralByTurma(relatorio);

    const profDisc = resolveProficiencyPorDisciplinaPorTurma(relatorio, nova, "escola");

    let notasCat = buildNotasPorCategoriaFromRelatorio(relatorio, "escola");
    if (notasCat.length === 0) notasCat = notasPorCategoriaEscolaFromNovaAvaliacoes(nova);

    const notasDisc = resolveNotasPorDisciplinaPorTurma(relatorio, nova, "escola");

    return {
      presencaPorSerie: presenca,
      niveisPorSerie: niveis,
      proficienciaGeralPorTurma: profGeral,
      proficienciaPorDisciplinaPorTurma: profDisc,
      notasPorDisciplinaPorTurma: notasDisc,
      notasPorCategoria: notasCat,
    };
  }

  if (axis === "serie") {
    let presenca = groupPresenceFromRelatorio(relatorio);
    if (presenca.length === 0) presenca = groupPresenceFromNova(nova, nova?.estatisticas_gerais?.serie ?? "GERAL");

    let niveis = buildLevelsBySeries(relatorio, presenca);
    if (niveis.length === 0) niveis = groupNiveisFromNova(nova, presenca[0]?.label ?? "GERAL");

    let profGeral = proficiencyGeralPorSerieFromNovaAvaliacoes(nova);
    if (profGeral.length === 0) profGeral = proficiencySerieOuGeralFromNovaEstatisticas(nova);
    if (profGeral.length === 0) profGeral = buildProficiencyGeneralPorSerieFromRelatorio(relatorio);
    if (profGeral.length === 0) profGeral = buildProficiencyGeneralByTurmaFromNova(nova);
    if (profGeral.length === 0) profGeral = buildProficiencyGeneralByTurma(relatorio);

    const profDisc = resolveProficiencyPorDisciplinaPorTurma(relatorio, nova, "serie");

    let notasCat = notasPorCategoriaFromNovaAvaliacoesSerie(nova);
    if (notasCat.length === 0) notasCat = buildNotasPorCategoriaFromRelatorio(relatorio, "serie");

    const notasDisc = resolveNotasPorDisciplinaPorTurma(relatorio, nova, "serie");

    return {
      presencaPorSerie: presenca,
      niveisPorSerie: niveis,
      proficienciaGeralPorTurma: profGeral,
      proficienciaPorDisciplinaPorTurma: profDisc,
      notasPorDisciplinaPorTurma: notasDisc,
      notasPorCategoria: notasCat,
    };
  }

  if (axis === "turma") {
    const turmaAllow = collectTurmasBySerieFromNova(nova, serieFilterLabel);
    const applyTurmaAllow = <T extends { label: string }>(rows: T[]): T[] =>
      turmaAllow.size > 0 ? rows.filter((r) => turmaAllow.has(String(r.label ?? "").trim())) : rows;

    const presenca = applyTurmaAllow(
      turmaAllow.size > 0 ? groupPresencePorTurmaDireto(relatorio, undefined) : groupPresencePorTurmaDireto(relatorio, serieFilterLabel)
    );
    const niveis = applyTurmaAllow(
      turmaAllow.size > 0 ? groupNiveisPorTurmaDireto(relatorio, undefined) : groupNiveisPorTurmaDireto(relatorio, serieFilterLabel)
    );
    let profGeral = applyTurmaAllow(proficiencyGeralPorTurmaFromNovaAvaliacoes(nova));
    if (profGeral.length === 0) {
      profGeral = (() => {
        const prof = relatorio?.proficiencia?.por_disciplina;
        if (!prof) return [] as ProficiencyGeneralByTurmaRow[];
        const geralKey = findGeralKey(prof) ?? "GERAL";
        const geral = (prof as AnyRecord)[geralKey] as { por_turma?: Array<{ turma: string; proficiencia: number; serie?: string }> };
        const rows = (geral?.por_turma ?? []).filter((r) => {
          if (turmaAllow.size > 0) return turmaAllow.has(String(r.turma ?? "").trim());
          if (!serieFilterLabel) return true;
          const s = String(r.serie ?? "").trim() || extractSerieFromTurma(r.turma);
          return normKey(s) === normKey(serieFilterLabel);
        });
        return rows
          .map((r) => ({ label: String(r.turma ?? "").trim(), proficiencia: clampToNumber(r.proficiencia, 0) }))
          .filter((r) => r.label.length > 0)
          .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
      })();
    }
    if (profGeral.length === 0) {
      const fromNova = buildProficiencyGeneralByTurmaFromNova(nova);
      if (fromNova.length > 0) {
        if (turmaAllow.size === 0) profGeral = fromNova;
        else {
          const matched = applyTurmaAllow(fromNova);
          profGeral = matched.length > 0 ? matched : [];
        }
      }
    }
    if (profGeral.length === 0) profGeral = applyTurmaAllow(buildProficiencyGeneralByTurma(relatorio));

    let profDisc = resolveProficiencyPorDisciplinaPorTurma(relatorio, nova, "turma", serieFilterLabel);
    if (turmaAllow.size > 0) {
      profDisc = profDisc
        .map((d) => ({
          ...d,
          valuesByTurma: d.valuesByTurma.filter((v) => turmaAllow.has(String(v.turma ?? "").trim())),
        }))
        .filter((d) => d.valuesByTurma.length > 0);
    }

    let notasCat = applyTurmaAllow(notasPorCategoriaFromNovaAvaliacoesTurma(nova));
    if (notasCat.length === 0) {
      notasCat =
        turmaAllow.size > 0
          ? buildNotasPorCategoriaFromRelatorio(relatorio, "turma", undefined).filter((r) => turmaAllow.has(String(r.label ?? "").trim()))
          : buildNotasPorCategoriaFromRelatorio(relatorio, "turma", serieFilterLabel);
    }

    let notasDisc = resolveNotasPorDisciplinaPorTurma(relatorio, nova, "turma", serieFilterLabel);
    if (turmaAllow.size > 0) {
      notasDisc = notasDisc
        .map((d) => ({
          ...d,
          valuesByTurma: d.valuesByTurma.filter((v) => turmaAllow.has(String(v.turma ?? "").trim())),
        }))
        .filter((d) => d.valuesByTurma.length > 0);
    }

    return {
      presencaPorSerie: presenca,
      niveisPorSerie: niveis,
      proficienciaGeralPorTurma: profGeral,
      proficienciaPorDisciplinaPorTurma: profDisc,
      notasPorDisciplinaPorTurma: notasDisc,
      notasPorCategoria: notasCat,
    };
  }

  // Eixo legado "aluno": sem tabelas de alunos no deck; métricas alinhadas ao eixo turma.
  return buildMetricsForAxis("turma", relatorio, nova, serieFilterLabel, turmaFilterLabel);
}

function buildLevelGuideDescriptions(_serieNome?: string): Array<{ label: string; description: string; color: string }> {
  // Slide 8 exige textos do sistema (mesmas descrições padrão).
  // Aqui usamos as descrições curtas da camada de proficiência (já padronizadas no sistema).
  const colors = {
    avancado: "#166534",
    adequado: "#22C55E",
    basico: "#FACC15",
    abaixo_do_basico: "#EF4444",
  };

  const map: Array<{ level: ProficiencyLevel; label: string; color: string }> = [
    { level: "abaixo_do_basico", label: "ABAIXO DO BÁSICO", color: colors.abaixo_do_basico },
    { level: "basico", label: "BÁSICO", color: colors.basico },
    { level: "adequado", label: "ADEQUADO", color: colors.adequado },
    { level: "avancado", label: "AVANÇADO", color: colors.avancado },
  ];

  return map.map((m) => ({
    label: m.label,
    color: m.color,
    description: getProficiencyLevelDescription(m.level),
  }));
}

function cloneMediaMunicipalPorDisciplinaMap(
  src: Record<string, number> | undefined | null
): Record<string, number> | null {
  if (!src || typeof src !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(src)) {
    if (v != null && Number.isFinite(Number(v))) out[k] = Number(v);
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function buildDeckDataForPresentation19Slides(args: BuildDeckDataArgs): Presentation19DeckData {
  const {
    mode,
    comparisonAxis,
    selectedSchoolId,
    selectedSerieLabel,
    selectedTurmaLabel,
    selectedTurmaShift,
    relatorioDetalhado,
    novaRespostaAgregados,
    novaRespostaSerieAgregados,
    primaryColor,
    logoDataUrl,
    coverSubtitle,
    footerText,
    closingMessage,
  } = args;

  const municipioNome =
    novaRespostaAgregados?.estatisticas_gerais?.municipio ??
    novaRespostaAgregados?.estatisticas_gerais?.estado ??
    "MUNICÍPIO";

  const avaliacaoNome =
    relatorioDetalhado?.avaliacao?.titulo ??
    novaRespostaAgregados?.estatisticas_gerais?.nome ??
    "AVALIAÇÃO";

  const escolasParticipantes = (() => {
    const names = new Set<string>();

    for (const row of relatorioDetalhado?.total_alunos?.por_escola ?? []) {
      const e = String(row.escola ?? "").trim();
      if (e) names.add(e);
    }

    const niveis = relatorioDetalhado?.niveis_aprendizagem;
    if (niveis && typeof niveis === "object") {
      for (const disc of Object.values(niveis)) {
        for (const row of disc?.por_escola ?? []) {
          const e = String(row.escola ?? "").trim();
          if (e) names.add(e);
        }
      }
    }

    const profPorDisc = relatorioDetalhado?.proficiencia?.por_disciplina;
    if (profPorDisc && typeof profPorDisc === "object") {
      for (const disc of Object.values(profPorDisc)) {
        for (const row of disc?.por_escola ?? []) {
          const e = String(row.escola ?? "").trim();
          if (e) names.add(e);
        }
      }
    }

    const notasPorDisc = relatorioDetalhado?.nota_geral?.por_disciplina;
    if (notasPorDisc && typeof notasPorDisc === "object") {
      for (const disc of Object.values(notasPorDisc)) {
        for (const row of disc?.por_escola ?? []) {
          const e = String(row.escola ?? "").trim();
          if (e) names.add(e);
        }
      }
    }

    const omitNovaWideEscolas =
      Boolean(selectedSchoolId?.trim()) && novaIsGranularidadeMunicipio(novaRespostaAgregados);

    if (!omitNovaWideEscolas) {
      for (const a of novaRespostaAgregados?.tabela_detalhada?.geral?.alunos ?? []) {
        const e = String((a as { escola?: string }).escola ?? "").trim();
        if (e) names.add(e);
      }

      for (const disc of novaRespostaAgregados?.tabela_detalhada?.disciplinas ?? []) {
        for (const a of disc.alunos ?? []) {
          const e = String((a as { escola?: string }).escola ?? "").trim();
          if (e) names.add(e);
        }
      }
      for (const r of novaRespostaAgregados?.ranking ?? []) {
        const e = String((r as { escola?: string }).escola ?? "").trim();
        if (e) names.add(e);
      }
      for (const a of novaRespostaAgregados?.resultados_detalhados?.avaliacoes ?? []) {
        const e = String(a.escola ?? "").trim();
        if (e) names.add(e);
      }
    }

    return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  })();

  const serieFromEstatisticas = String(novaRespostaAgregados?.estatisticas_gerais?.serie ?? "").trim();
  const serieFromAlunoGeral = String(novaRespostaAgregados?.tabela_detalhada?.geral?.alunos?.[0]?.serie ?? "").trim();
  const serieFromDisciplinaAluno = String(novaRespostaAgregados?.tabela_detalhada?.disciplinas?.[0]?.alunos?.[0]?.serie ?? "").trim();
  const serieHintBase = selectedSerieLabel || serieFromEstatisticas || serieFromAlunoGeral || serieFromDisciplinaAluno || "GERAL";

  const metrics = buildMetricsForAxis(
    comparisonAxis,
    relatorioDetalhado,
    novaRespostaAgregados,
    selectedSerieLabel,
    selectedTurmaLabel
  );

  let presencaPorSerie = metrics.presencaPorSerie;
  if (presencaPorSerie.length === 0) {
    const a = groupPresenceFromRelatorio(relatorioDetalhado);
    const b = groupPresenceFromNova(novaRespostaAgregados, serieHintBase);
    const c = buildPresenceFinalFallback(relatorioDetalhado, novaRespostaAgregados, serieHintBase);
    presencaPorSerie = a.length > 0 ? a : b.length > 0 ? b : c;
  }

  let levelsPorSerie = metrics.niveisPorSerie;
  if (levelsPorSerie.length === 0) {
    levelsPorSerie = buildLevelsBySeries(relatorioDetalhado, presencaPorSerie);
  }
  if (levelsPorSerie.length === 0) {
    const serieHint =
      serieFromEstatisticas || serieFromAlunoGeral || presencaPorSerie[0]?.label || levelsPorSerie[0]?.label || "GERAL";
    levelsPorSerie = groupNiveisFromNova(novaRespostaAgregados, serieHint);
  }

  const totalAlunosParticiparam = pickAlunosParticipantes(mode, relatorioDetalhado, novaRespostaAgregados);

  const { curso, serie, turma } = buildCursoSerieTurma(relatorioDetalhado, presencaPorSerie, novaRespostaAgregados);

  let serieFinal = serieHintBase || serie;
  let cursoFinal = curso;
  const serieFromLevels = levelsPorSerie[0]?.label;
  if (isValidSerieLabel(serieFromLevels)) {
    serieFinal = serieFromLevels;
    const serieLower = serieFinal.toLowerCase();
    let inferredCurso = "Anos Iniciais";
    if (
      /\b(6|7|8|9)\b/.test(serieLower) ||
      serieLower.includes("em") ||
      serieLower.includes("medio") ||
      serieLower.includes("médio") ||
      serieLower.includes("ensino médio")
    ) {
      inferredCurso = "Anos Finais";
    }
    if (serieLower.includes("grupo")) inferredCurso = "Anos Iniciais";
    cursoFinal = inferredCurso;
  }

  let proficienciaGeralPorTurma = metrics.proficienciaGeralPorTurma;
  let proficienciaPorDisciplinaPorTurma = metrics.proficienciaPorDisciplinaPorTurma;
  proficienciaGeralPorTurma = applyAnswerSheetCanonicalProficiencyGeral(
    mode,
    comparisonAxis,
    novaRespostaAgregados,
    proficienciaGeralPorTurma
  );
  if (proficienciaGeralPorTurma.length === 0) {
    const fromNova = buildProficiencyGeneralByTurmaFromNova(novaRespostaAgregados);
    proficienciaGeralPorTurma = fromNova.length > 0 ? fromNova : buildProficiencyGeneralByTurma(relatorioDetalhado);
  }
  if (!hasPresentation19RealDisciplineBreakdown(proficienciaPorDisciplinaPorTurma)) {
    proficienciaPorDisciplinaPorTurma = resolveProficiencyPorDisciplinaPorTurma(
      relatorioDetalhado,
      novaRespostaAgregados,
      comparisonAxis,
      selectedSerieLabel
    );
  } else {
    proficienciaPorDisciplinaPorTurma = filterPresentation19RealDisciplineRows(proficienciaPorDisciplinaPorTurma);
  }

  let notasPorDisciplinaPorTurma = metrics.notasPorDisciplinaPorTurma;
  if (!hasPresentation19RealDisciplineBreakdown(notasPorDisciplinaPorTurma)) {
    notasPorDisciplinaPorTurma = resolveNotasPorDisciplinaPorTurma(
      relatorioDetalhado,
      novaRespostaAgregados,
      comparisonAxis,
      selectedSerieLabel
    );
  } else {
    notasPorDisciplinaPorTurma = filterPresentation19RealDisciplineRows(notasPorDisciplinaPorTurma);
  }

  proficienciaPorDisciplinaPorTurma = filterPresentation19RealDisciplineRows(proficienciaPorDisciplinaPorTurma);
  notasPorDisciplinaPorTurma = filterPresentation19RealDisciplineRows(notasPorDisciplinaPorTurma);

  const notasNova = buildNotasFromNova(novaRespostaAgregados);
  const notasRel = buildNotasFromRelatorio(relatorioDetalhado);
  const notasPorDisciplina = notasNova.porDisciplina.length > 0 ? notasNova.porDisciplina : notasRel.porDisciplina;
  /**
   * Média geral: no cartão-resposta só `buildNotasFromNova` (GET resultados-agregados / campos espelhados na NovaResposta).
   * Modo avaliações: mantém regra que evita misturar disciplinas da API com média geral recalculada no cliente a partir do PDF.
   */
  const mediaNotaGeral =
    mode === "answer_sheet"
      ? notasNova.geral
      : notasNova.porDisciplina.length > 0
        ? notasNova.geral
        : notasNova.geral ?? notasRel.geral;

  let notasPorCategoria = metrics.notasPorCategoria;
  if (notasPorCategoria.length === 0 && comparisonAxis !== "aluno") {
    notasPorCategoria = [];
  }

  const questoesTabelaGeralBase = flattenQuestions(relatorioDetalhado);
  const questoesTabelaGeral =
    questoesTabelaGeralBase.length > 0 ? questoesTabelaGeralBase : flattenQuestionsFromNova(novaRespostaAgregados);
  const habilidadePorQuestaoTurma = mergeHabilidadeMetaMaps(
    buildQuestaoNumeroToHabilidadeMetaMap(novaRespostaAgregados),
    buildQuestaoMetaMapFromGeralRows(questoesTabelaGeral)
  );
  const questoesPorTurma = buildQuestoesPorTurmaFromNova(novaRespostaAgregados, habilidadePorQuestaoTurma);
  const questoesPorSerieFromNova = buildQuestoesPorSerieFromNova(novaRespostaAgregados, habilidadePorQuestaoTurma);

  // Quando há turma selecionada, o deck deve comparar Turma vs Geral da série,
  // e as seções de capa/questões devem ser restritas à turma selecionada.
  const selectedTurmaEffective = selectedTurmaLabel?.trim() ? selectedTurmaLabel.trim() : undefined;
  const serieFromSelectedTurma = selectedTurmaEffective ? inferSerieForTurmaFromNova(novaRespostaAgregados, selectedTurmaEffective) : "";
  const serieForTurmaCompare =
    (selectedSerieLabel?.trim() ? selectedSerieLabel.trim() : "") ||
    (serieFromSelectedTurma?.trim() ? serieFromSelectedTurma.trim() : "") ||
    (selectedTurmaEffective ? extractSerieFromTurma(selectedTurmaEffective) : "") ||
    serieHintBase ||
    "GERAL";
  const TURMA_COMPARE_GERAL_LABEL = "Geral da série";

  let turmasParticipantesCapa = collectTurmasParticipantes(
    relatorioDetalhado,
    novaRespostaAgregados,
    presencaPorSerie,
    proficienciaGeralPorTurma,
    comparisonAxis,
    selectedSchoolId
  );
  if (selectedTurmaEffective) {
    turmasParticipantesCapa = [selectedTurmaEffective];
  }

  const turmaCapa = selectedTurmaEffective
    ? selectedTurmaEffective
    : turmasParticipantesCapa.length > 0
      ? turmasParticipantesCapa.join(", ")
      : selectedTurmaLabel ||
        String(novaRespostaAgregados?.tabela_detalhada?.geral?.alunos?.[0]?.turma ?? "").trim() ||
        turma ||
        "N/A";
  const serieNomeCapas = serieFinal;
  const turmaNomeCapas = turmaCapa;
  const turnoRaw =
    String(selectedTurmaShift ?? "").trim() ||
    String(
      (
        novaRespostaAgregados?.tabela_detalhada?.geral?.alunos as
          | Array<{ shift?: string; turma?: string }>
          | undefined
      )?.find((a) => {
        if (!selectedTurmaEffective) return Boolean(a.shift);
        return String(a.turma ?? "").trim() === selectedTurmaEffective;
      })?.shift ?? ""
    ).trim();
  const turnoCapa = hasClassShift(turnoRaw) ? getClassShiftLabel(turnoRaw) : undefined;

  const alunosDetalhados: AlunoPresentationRow[] = [];

  warnIfProficiencyOutOfRange(serieFinal, proficienciaGeralPorTurma, proficienciaPorDisciplinaPorTurma);

  // Pós-processamento do escopo TURMA selecionada:
  // - métricas/tabelas/gráficos: somente 2 linhas (Geral da série vs Turma selecionada)
  // - questões: somente a turma selecionada (sem bloco geral, sem outras turmas)
  let presencaFinal = presencaPorSerie;
  let niveisFinal = levelsPorSerie;
  let profGeralFinal = proficienciaGeralPorTurma;
  let profDiscFinal = proficienciaPorDisciplinaPorTurma;
  let notasPorDisciplinaPorTurmaFinal = notasPorDisciplinaPorTurma;
  let notasDiscFinal = notasPorDisciplina;
  let mediaNotaFinal = mediaNotaGeral;
  let notasCatFinal = notasPorCategoria;
  let questoesTabelaGeralFinal = questoesTabelaGeral;
  let questoesPorTurmaFinal = questoesPorTurma;
  let questoesPorSerieFinal = questoesPorSerieFromNova;

  if (selectedTurmaEffective) {
    // Presença: agrega a série a partir das turmas filtradas e pega a turma selecionada.
    const turmaPresence = presencaFinal.find((r) => normKey(r.label) === normKey(selectedTurmaEffective));
    const seriePresenceAgg = (() => {
      // Preferência: se houver linha por série em groupPresenceFromRelatorio, usar.
      const bySerie = groupPresenceFromRelatorio(relatorioDetalhado);
      const serieRow = bySerie.find((r) => normKey(r.label) === normKey(serieForTurmaCompare));
      if (serieRow) return { ...serieRow, label: TURMA_COMPARE_GERAL_LABEL };
      // Fallback: soma as turmas atuais (já filtradas por série quando aplicável).
      const totalAlunos = safeSum(presencaFinal.map((r) => clampToNumber(r.totalAlunos, 0)));
      const totalPresentes = safeSum(presencaFinal.map((r) => clampToNumber(r.totalPresentes, 0)));
      const alunosFaltosos = Math.max(0, totalAlunos - totalPresentes);
      const presencaMediaPct = totalAlunos > 0 ? (totalPresentes / totalAlunos) * 100 : 0;
      return { label: TURMA_COMPARE_GERAL_LABEL, totalAlunos, totalPresentes, presencaMediaPct, alunosFaltosos };
    })();
    // Ordem desejada: TURMA selecionada primeiro, depois Geral da série.
    presencaFinal = [turmaPresence, seriePresenceAgg].filter(Boolean) as PresenceBySeriesRow[];

    // Quando houver agregado "geral da série" vindo do backend (NovaResposta sem turma),
    // usar estes valores para evitar qualquer agregação no front.
    if (novaRespostaSerieAgregados?.estatisticas_gerais && novaRespostaAgregados?.estatisticas_gerais) {
      const turmaEg = novaRespostaAgregados.estatisticas_gerais;
      const serieEg = novaRespostaSerieAgregados.estatisticas_gerais;
      const totalAlunosSerie = clampToNumber(serieEg.total_alunos, 0);
      const presentesSerie = clampToNumber(serieEg.alunos_participantes, 0);
      const totalAlunosTurma = clampToNumber(turmaEg.total_alunos, 0);
      const presentesTurma = clampToNumber(turmaEg.alunos_participantes, 0);
      presencaFinal = [
        {
          label: selectedTurmaEffective,
          totalAlunos: totalAlunosTurma,
          totalPresentes: presentesTurma,
          presencaMediaPct: totalAlunosTurma > 0 ? (presentesTurma / totalAlunosTurma) * 100 : 0,
          alunosFaltosos: Math.max(0, totalAlunosTurma - presentesTurma),
        },
        {
          label: TURMA_COMPARE_GERAL_LABEL,
          totalAlunos: totalAlunosSerie,
          totalPresentes: presentesSerie,
          presencaMediaPct: totalAlunosSerie > 0 ? (presentesSerie / totalAlunosSerie) * 100 : 0,
          alunosFaltosos: Math.max(0, totalAlunosSerie - presentesSerie),
        },
      ];
    }

    // Níveis: série (agregado) vs turma selecionada.
    const turmaLevelsRow = (() => {
      // ✅ Usar dados do backend (por_turma) sem recalcular.
      const niveis = relatorioDetalhado?.niveis_aprendizagem;
      const geralKey = findGeralKey(niveis) ?? "GERAL";
      const disciplinaGeral = (niveis as AnyRecord | undefined)?.[geralKey] as
        | { por_turma?: Array<{ turma: string; abaixo_do_basico: number; basico: number; adequado: number; avancado: number; total: number }> }
        | undefined;
      const row = (disciplinaGeral?.por_turma ?? []).find((r) => normKey(r.turma) === normKey(selectedTurmaEffective));
      if (!row) return null;
      return {
        label: String(row.turma ?? "").trim() || selectedTurmaEffective,
        abaixoDoBasico: clampToNumber(row.abaixo_do_basico, 0),
        basico: clampToNumber(row.basico, 0),
        adequado: clampToNumber(row.adequado, 0),
        avancado: clampToNumber(row.avancado, 0),
        total: clampToNumber(row.total, 0),
      };
    })();
    const serieLevelsAgg = (() => {
      // ✅ Usar agregado do backend (total_geral/geral) e apenas renomear o label.
      const niveis = relatorioDetalhado?.niveis_aprendizagem;
      const geralKey = findGeralKey(niveis) ?? "GERAL";
      const disciplinaGeral = (niveis as AnyRecord | undefined)?.[geralKey] as
        | { total_geral?: NivelAprendizagemGeral; geral?: NivelAprendizagemGeral }
        | undefined;
      const g = disciplinaGeral?.total_geral ?? disciplinaGeral?.geral;
      if (!g) return null;
      return {
        label: TURMA_COMPARE_GERAL_LABEL,
        abaixoDoBasico: clampToNumber(g.abaixo_do_basico, 0),
        basico: clampToNumber(g.basico, 0),
        adequado: clampToNumber(g.adequado, 0),
        avancado: clampToNumber(g.avancado, 0),
        total: clampToNumber(g.total, 0),
      };
    })();
    niveisFinal = [turmaLevelsRow, serieLevelsAgg].filter(Boolean) as NiveisBySeriesRow[];

    if (novaRespostaSerieAgregados?.estatisticas_gerais?.distribuicao_classificacao_geral && novaRespostaAgregados?.estatisticas_gerais?.distribuicao_classificacao_geral) {
      const distSerie = novaRespostaSerieAgregados.estatisticas_gerais.distribuicao_classificacao_geral;
      const distTurma = novaRespostaAgregados.estatisticas_gerais.distribuicao_classificacao_geral;
      const mkRow = (dist: typeof distSerie, label: string): NiveisBySeriesRow => {
        const abaixoDoBasico = clampToNumber(dist.abaixo_do_basico, 0);
        const basico = clampToNumber(dist.basico, 0);
        const adequado = clampToNumber(dist.adequado, 0);
        const avancado = clampToNumber(dist.avancado, 0);
        const total = safeSum([abaixoDoBasico, basico, adequado, avancado]);
        return { label, abaixoDoBasico, basico, adequado, avancado, total };
      };
      niveisFinal = [mkRow(distTurma, selectedTurmaEffective), mkRow(distSerie, TURMA_COMPARE_GERAL_LABEL)];
    }

    // Proficiência (geral + por disciplina) e notas: preferir agregados do backend (NovaResposta) para
    // TURMA e GERAL DA SÉRIE, sem fazer médias/somas no front.
    if (novaRespostaSerieAgregados?.estatisticas_gerais && novaRespostaAgregados?.estatisticas_gerais) {
      const pSerie = clampToNumber(novaRespostaSerieAgregados.estatisticas_gerais.media_proficiencia_geral, 0);
      const pTurma = clampToNumber(novaRespostaAgregados.estatisticas_gerais.media_proficiencia_geral, 0);
      profGeralFinal = [
        { label: selectedTurmaEffective, proficiencia: pTurma },
        { label: TURMA_COMPARE_GERAL_LABEL, proficiencia: pSerie },
      ];

      const serieByDisc = new Map<string, number>();
      for (const d of novaRespostaSerieAgregados.resultados_por_disciplina ?? []) {
        const nome = String(d.disciplina ?? "").trim();
        if (!nome) continue;
        serieByDisc.set(nome, clampToNumber(d.media_proficiencia, 0));
      }
      const turmaByDisc = new Map<string, number>();
      for (const d of novaRespostaAgregados.resultados_por_disciplina ?? []) {
        const nome = String(d.disciplina ?? "").trim();
        if (!nome) continue;
        turmaByDisc.set(nome, clampToNumber(d.media_proficiencia, 0));
      }
      const allDisc = Array.from(new Set([...serieByDisc.keys(), ...turmaByDisc.keys()])).sort((a, b) =>
        a.localeCompare(b, "pt-BR", { sensitivity: "base" })
      );
      profDiscFinal = allDisc.map((disciplina) => ({
        disciplina,
        valuesByTurma: [
          { turma: selectedTurmaEffective, proficiencia: turmaByDisc.get(disciplina) ?? 0 },
          { turma: TURMA_COMPARE_GERAL_LABEL, proficiencia: serieByDisc.get(disciplina) ?? 0 },
        ],
      }));

      const serieNotaByDisc = new Map<string, number>();
      for (const d of novaRespostaSerieAgregados.resultados_por_disciplina ?? []) {
        const nome = String(d.disciplina ?? "").trim();
        if (!nome) continue;
        serieNotaByDisc.set(nome, clampToNumber(d.media_nota, 0));
      }
      const turmaNotaByDisc = new Map<string, number>();
      for (const d of novaRespostaAgregados.resultados_por_disciplina ?? []) {
        const nome = String(d.disciplina ?? "").trim();
        if (!nome) continue;
        turmaNotaByDisc.set(nome, clampToNumber(d.media_nota, 0));
      }
      const allDiscNota = Array.from(new Set([...serieNotaByDisc.keys(), ...turmaNotaByDisc.keys()])).sort((a, b) =>
        a.localeCompare(b, "pt-BR", { sensitivity: "base" })
      );
      notasPorDisciplinaPorTurmaFinal = allDiscNota.map((disciplina) => ({
        disciplina,
        valuesByTurma: [
          { turma: selectedTurmaEffective, mediaNota: turmaNotaByDisc.get(disciplina) ?? 0 },
          { turma: TURMA_COMPARE_GERAL_LABEL, mediaNota: serieNotaByDisc.get(disciplina) ?? 0 },
        ],
      }));

      const nSerie = clampToNumber(novaRespostaSerieAgregados.estatisticas_gerais.media_nota_geral, 0);
      const nTurma = clampToNumber(novaRespostaAgregados.estatisticas_gerais.media_nota_geral, 0);
      notasDiscFinal = [];
      mediaNotaFinal = null;
      notasCatFinal = [
        { label: selectedTurmaEffective, mediaNota: nTurma },
        { label: TURMA_COMPARE_GERAL_LABEL, mediaNota: nSerie },
      ];
    }

    // Proficiência geral: se não houver agregado da série via NovaResposta, mantém o fallback legado do relatório.
    if (!novaRespostaSerieAgregados?.estatisticas_gerais || !novaRespostaAgregados?.estatisticas_gerais) {
      const turmaProf = profGeralFinal.find((r) => normKey(r.label) === normKey(selectedTurmaEffective));
      const serieProf = (() => {
        const bySerie = buildProficiencyGeneralPorSerieFromRelatorio(relatorioDetalhado);
        const row = bySerie.find((r) => normKey(r.label) === normKey(serieForTurmaCompare));
        if (row) return row.proficiencia;
        return mediaProficienciaGeralDasTurmasNoDeck(relatorioDetalhado, profGeralFinal);
      })();
      profGeralFinal = [
        turmaProf ? { label: selectedTurmaEffective, proficiencia: clampToNumber(turmaProf.proficiencia, 0) } : null,
        { label: TURMA_COMPARE_GERAL_LABEL, proficiencia: serieProf },
      ].filter(Boolean) as ProficiencyGeneralByTurmaRow[];
    }

    // Proficiência por disciplina: se não houver agregado da série via NovaResposta, mantém o fallback legado.
    if (!novaRespostaSerieAgregados?.estatisticas_gerais || !novaRespostaAgregados?.estatisticas_gerais) {
      profDiscFinal = profDiscFinal
        .map((row) => {
          const turmaEntry = row.valuesByTurma.find((v) => normKey(v.turma) === normKey(selectedTurmaEffective));
          const avg = mediaProficienciaPorDisciplinaDasTurmasNoRelatorio(relatorioDetalhado, row.valuesByTurma);
          if (!turmaEntry) return null;
          return {
            disciplina: row.disciplina,
            valuesByTurma: [
              { turma: selectedTurmaEffective, proficiencia: clampToNumber(turmaEntry.proficiencia, 0) },
              { turma: TURMA_COMPARE_GERAL_LABEL, proficiencia: avg },
            ],
          };
        })
        .filter(Boolean) as ProficiencyByDisciplineByTurmaRow[];
    }

    // Notas: se não houver agregado da série via NovaResposta, mantém o fallback legado.
    if (!novaRespostaSerieAgregados?.estatisticas_gerais || !novaRespostaAgregados?.estatisticas_gerais) {
      const notasTurmaRows = buildNotasPorCategoriaFromRelatorio(relatorioDetalhado, "turma", serieForTurmaCompare);
      const turmaNota = notasTurmaRows.find((r) => normKey(r.label) === normKey(selectedTurmaEffective));
      const serieNotaAvg = mediaNotaDasTurmasNoRelatorio(relatorioDetalhado, notasTurmaRows);
      notasDiscFinal = [];
      mediaNotaFinal = null;
      notasCatFinal = [
        turmaNota ? { label: selectedTurmaEffective, mediaNota: clampToNumber(turmaNota.mediaNota, 0) } : null,
        { label: TURMA_COMPARE_GERAL_LABEL, mediaNota: serieNotaAvg },
      ].filter(Boolean) as NotaPorCategoriaDeck[];
    }

    // Questões: somente a turma selecionada.
    questoesTabelaGeralFinal = [];
    questoesPorTurmaFinal = questoesPorTurmaFinal.filter((b) => normKey(b.turma) === normKey(selectedTurmaEffective));
    questoesPorSerieFinal = [];
  } else if (comparisonAxis === "escola") {
    // Município: uma tabela por série (geral da série), sem blocos por turma.
    questoesPorTurmaFinal = [];
    if (questoesPorSerieFinal.length > 0) {
      questoesTabelaGeralFinal = [];
    }
  } else if (selectedSchoolId) {
    // Escola selecionada: mostrar tabelas de questões separadas por turma da escola.
    // Isso mantém a seção informativa sem gerar a explosão de slides do escopo municipal.
    if (selectedSerieLabel?.trim()) {
      const serieKey = normKey(selectedSerieLabel.trim());
      questoesPorTurmaFinal = questoesPorTurmaFinal.filter((b) => normKey(b.serieTurma ?? extractSerieFromTurma(b.turma)) === serieKey);
    }
    questoesPorSerieFinal = [];
  } else {
    // Performance: sem turma selecionada, não geramos blocos por turma na seção de questões,
    // pois isso pode criar dezenas/centenas de slides e travar preview/export.
    questoesPorTurmaFinal = [];
    questoesPorSerieFinal = [];
  }

  // Escola selecionada (sem turma específica): em notas, mostrar apenas as turmas (notasPorCategoria) + média geral,
  // removendo linhas por disciplina do gráfico/tabela.
  const schoolMissingRegisteredTurma =
    Boolean(selectedSchoolId?.trim()) && !selectedTurmaEffective && turmasParticipantesCapa.length === 0;
  if (schoolMissingRegisteredTurma) {
    notasDiscFinal = [];
    notasPorDisciplinaPorTurmaFinal = [];
  }

  profDiscFinal = filterPresentation19RealDisciplineRows(profDiscFinal);
  notasPorDisciplinaPorTurmaFinal = filterPresentation19RealDisciplineRows(notasPorDisciplinaPorTurmaFinal);

  const novaEg = novaRespostaAgregados?.estatisticas_gerais;
  const novaPorDisciplinaKeys = disciplineKeysFromNovaPorDisciplina(
    novaEg?.por_disciplina ?? novaRespostaAgregados?.resultados_por_disciplina
  );
  const proficienciaMediaMunicipalPorDisciplinaRelatorio = mergeMediaMunicipalPorDisciplinaMaps(
    cloneMediaMunicipalPorDisciplinaMap(
      relatorioDetalhado?.proficiencia?.media_municipal_por_disciplina as Record<string, number> | undefined
    ),
    buildMediaMunicipalPorDisciplinaFromNovaEstatisticas(novaEg, "proficiencia")
  );
  const notaMediaMunicipalPorDisciplinaRelatorio = mergeMediaMunicipalPorDisciplinaMaps(
    cloneMediaMunicipalPorDisciplinaMap(
      relatorioDetalhado?.nota_geral?.media_municipal_por_disciplina as Record<string, number> | undefined
    ),
    buildMediaMunicipalPorDisciplinaFromNovaEstatisticas(novaEg, "nota")
  );
  const proficienciaDisciplinasRelatorioKeys = mergeDisciplineKeyLists(
    relatorioRealDisciplineKeys(
      relatorioDetalhado?.proficiencia?.por_disciplina as Record<string, unknown> | undefined
    ),
    novaPorDisciplinaKeys
  );
  const notaDisciplinasRelatorioKeys = mergeDisciplineKeyLists(
    relatorioRealDisciplineKeys(
      relatorioDetalhado?.nota_geral?.por_disciplina as Record<string, unknown> | undefined
    ),
    novaPorDisciplinaKeys
  );

  return {
    mode,
    comparisonAxis,
    municipioNome,
    avaliacaoNome,
    escolasParticipantes,

    totalAlunosParticiparam,

    curso: cursoFinal,
    serie: serieFinal,
    turma: turmaCapa,
    turno: turnoCapa,
    turmasParticipantesCapa,
    slide2ShowSerieTurmas: Boolean(selectedSchoolId?.trim()),
    schoolMissingRegisteredTurma,

    presencaPorSerie: presencaFinal,
    niveisPorSerie: niveisFinal,

    proficienciaGeralPorTurma: profGeralFinal,
    proficienciaPorDisciplinaPorTurma: profDiscFinal,

    notasPorDisciplinaPorTurma: notasPorDisciplinaPorTurmaFinal,

    mediaNotaGeral: mediaNotaFinal,
    notasPorDisciplina: notasDiscFinal,
    notasPorCategoria: notasCatFinal,

    proficienciaMediaMunicipalPorDisciplinaRelatorio,
    notaMediaMunicipalPorDisciplinaRelatorio,

    proficienciaDisciplinasRelatorioKeys,
    notaDisciplinasRelatorioKeys,

    alunosDetalhados,

    questoesTabelaGeral: questoesTabelaGeralFinal,
    questoesPorTurma: questoesPorTurmaFinal,
    questoesPorSerie: questoesPorSerieFinal,

    levelGuide: buildLevelGuideDescriptions(serieFinal),

    primaryColor,
    logoDataUrl,
    coverSubtitle: coverSubtitle?.trim() || undefined,
    footerText: footerText?.trim() || undefined,
    closingMessage: (closingMessage?.trim() || "Obrigado!!").trim(),
    serieNomeCapas,
    turmaNomeCapas,
  };
}

export default buildDeckDataForPresentation19Slides;

