import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  Cell,
  LabelList,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import type { Presentation19DeckData, NiveisBySeriesRow, SlideQuestionRow } from "@/types/presentation19-slides";
import {
  comparisonColumnLabel,
  presentationSectionGrades,
  presentationSectionGradesTagline,
  presentationSectionLevels,
  presentationSectionLevelsTagline,
  presentationSectionProficiency,
  presentationSectionProficiencyTagline,
  presentationSectionQuestionsTagline,
  presentationSectionQuestionsTitle,
  presentationTitleChartGrades,
  presentationTitleChartLevels,
  presentationTitleChartPresence,
  presentationTitleProficiencyByDiscipline,
  presentationTitleProficiencyGeneralChart,
  presentationTitleTableGrades,
  presentationTitleTableLevels,
  presentationTitleTablePresence,
  presentationQuestionsTurmaCoverLine,
} from "@/utils/reports/presentation19/presentationScope";
import { getProficiencyTableInfo } from "@/components/evaluations/results/utils/proficiency";
import { getSubjectPaletteIndex } from "@/utils/competition/competitionSubjectColors";
import { chunkPresentation19SlideQuestionRows } from "@/utils/reports/presentation19/questionsTablePagination";
import { formatPctOneDecimalPtBr } from "@/utils/reports/presentation19/formatPctOneDecimalPtBr";
import {
  P19_CHART_V_BAR_TOP_PAD_PX,
  P19_CHART_V_BAR_VALUE_LABEL_RESERVE_PX,
} from "@/utils/reports/presentation19/presentation19Layout";

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex ?? "").trim());
  if (!m) return `rgba(124, 58, 237, ${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type SlideFrameProps = {
  children: React.ReactNode;
  primaryColor: string;
  logoDataUrl?: string;
};

function linearTicks(min: number, max: number, segments = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min, max];
  const step = (max - min) / segments;
  return Array.from({ length: segments + 1 }, (_, i) => Number((min + i * step).toFixed(1)));
}

function clampToRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

const P19_RECHARTS_V_BAR_MARGIN_TOP =
  P19_CHART_V_BAR_TOP_PAD_PX + P19_CHART_V_BAR_VALUE_LABEL_RESERVE_PX + 4;

/** Margem inferior ampla para o eixo X ficar abaixo da linha zero; barras encostam no zero. */
const P19_BAR_MARGIN = { top: P19_RECHARTS_V_BAR_MARGIN_TOP, right: 16, bottom: 56, left: 8 } as const;

function p19XAxisProps(fontSize: number) {
  return {
    tickLine: false as const,
    tickMargin: 12,
    axisLine: { stroke: "#64748b" },
    tick: { fontSize, fill: "#334155", dy: 6 },
  };
}

function SlideFrame({ children, primaryColor, logoDataUrl }: SlideFrameProps) {
  return (
    <div
      data-slide-frame
      className="bg-zinc-200 text-zinc-900 relative overflow-hidden border border-zinc-300"
      style={{
        width: 1123,
        height: 793,
        borderRadius: 16,
        boxShadow: "0 18px 50px rgba(2,6,23,0.12)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 10,
          backgroundColor: primaryColor,
        }}
      />

      {logoDataUrl && (
        <img
          src={logoDataUrl}
          alt="Logo"
          crossOrigin="anonymous"
          style={{
            position: "absolute",
            top: 18,
            right: 24,
            width: 86,
            height: "auto",
            objectFit: "contain",
          }}
        />
      )}

      <div className="absolute inset-0 px-10 py-14">{children}</div>
    </div>
  );
}

function SlideTitle({ title, primaryColor }: { title: string; primaryColor: string }) {
  return (
    <div className="flex items-center gap-4">
      <div
        style={{
          width: 12,
          height: 38,
          backgroundColor: primaryColor,
          borderRadius: 999,
        }}
      />
      <h2 className="text-3xl font-extrabold tracking-wide text-zinc-900">{title}</h2>
    </div>
  );
}

function SimpleTable({
  columns,
  rows,
  accentColor: _accentColor,
}: {
  columns: string[];
  rows: Array<Array<React.ReactNode>>;
  accentColor?: string;
}) {
  return (
    <div className="rounded-2xl overflow-hidden border border-zinc-300">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-zinc-100">
            {columns.map((c) => (
              <th
                key={c}
                className="border-b border-zinc-300 px-3 py-2 text-left text-sm font-semibold text-zinc-700"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-zinc-50/60"}>
              {r.map((cell, i) => (
                <td key={i} className="border-b border-zinc-300 px-3 py-2 text-sm text-zinc-800">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Presentation19SlidesDeck({ deckData }: { deckData: Presentation19DeckData }) {
  const fixedLevelColors = useMemo(
    () => ({
      abaixo: "#EF4444", // Vermelho
      basico: "#FACC15", // Amarelo
      adequado: "#22C55E", // Verde
      avancado: "#166534", // Verde escuro
    }),
    []
  );

  const presenceRows = deckData.presencaPorSerie;
  const niveisRows = deckData.niveisPorSerie;
  const multiSchool = deckData.comparisonAxis === "escola" && deckData.niveisPorSerie.length > 1;

  const levelsChartData = useMemo(() => {
    const totals = niveisRows.reduce(
      (acc, r: NiveisBySeriesRow) => {
        acc.abaixo += Number(r.abaixoDoBasico || 0);
        acc.basico += Number(r.basico || 0);
        acc.adequado += Number(r.adequado || 0);
        acc.avancado += Number(r.avancado || 0);
        return acc;
      },
      { abaixo: 0, basico: 0, adequado: 0, avancado: 0 }
    );

    return [
      { nivel: "Abaixo do Básico", valor: totals.abaixo, color: fixedLevelColors.abaixo },
      { nivel: "Básico", valor: totals.basico, color: fixedLevelColors.basico },
      { nivel: "Adequado", valor: totals.adequado, color: fixedLevelColors.adequado },
      { nivel: "Avançado", valor: totals.avancado, color: fixedLevelColors.avancado },
    ];
  }, [niveisRows, fixedLevelColors]);

  const levelsAxisMax = useMemo(() => {
    const maxByLevel = Math.max(
      1,
      ...levelsChartData.map((r) => Number(r.valor || 0))
    );
    return maxByLevel <= 10 ? 10 : Math.ceil(maxByLevel / 5) * 5;
  }, [levelsChartData]);

  const generalProfAxisMax = useMemo(() => {
    const maxMath = getProficiencyTableInfo(deckData.serie, "Matemática").maxProficiency;
    const maxOutras = getProficiencyTableInfo(deckData.serie, "Português").maxProficiency;
    return Math.max(maxMath, maxOutras);
  }, [deckData.serie]);

  const presenceAxisMax = useMemo(() => {
    const raw = Math.max(1, ...presenceRows.map((r) => Math.max(0, Number(r.totalPresentes ?? 0))));
    return raw <= 10 ? 10 : Math.ceil(raw / 5) * 5;
  }, [presenceRows]);

  const presenceChartData = useMemo(() => {
    return presenceRows.map((r) => ({
      label: r.label,
      total_presentes: Math.max(0, Math.round(Number(r.totalPresentes ?? 0))),
    }));
  }, [presenceRows]);

  const presenceYTicks = useMemo(
    () => Array.from({ length: 5 }, (_, i) => Math.round((presenceAxisMax * i) / 4)),
    [presenceAxisMax]
  );

  const profGeneralData = useMemo(() => {
    const maxMath = getProficiencyTableInfo(deckData.serie, "Matemática").maxProficiency;
    const maxOutras = getProficiencyTableInfo(deckData.serie, "Português").maxProficiency;
    const axisMax = Math.max(maxMath, maxOutras);
    return deckData.proficienciaGeralPorTurma.map((r) => ({
      label: r.label,
      proficiencia: clampToRange(r.proficiencia, 0, axisMax),
    }));
  }, [deckData.proficienciaGeralPorTurma, deckData.serie]);

  const profByDiscSeparate = useMemo(() => {
    return deckData.proficienciaPorDisciplinaPorTurma
      .map((d) => ({
        disciplina: d.disciplina,
        data: d.valuesByTurma
          .map((v) => ({
            turma: v.turma,
            proficiencia: clampToRange(
              v.proficiencia,
              0,
              getProficiencyTableInfo(deckData.serie, d.disciplina).maxProficiency
            ),
          }))
          .sort((a, b) => a.turma.localeCompare(b.turma, "pt-BR", { sensitivity: "base" })),
      }))
      .filter((d) => d.data.length > 0);
  }, [deckData.proficienciaPorDisciplinaPorTurma, deckData.serie]);

  const disciplinePalette = useMemo(
    () => [
      "#f59e0b", // amber-500
      "#10b981", // emerald-500
      "#3b82f6", // blue-500
      "#8b5cf6", // violet-500
      "#f43f5e", // rose-500
      "#06b6d4", // cyan-500
      "#84cc16", // lime-500
      "#d946ef", // fuchsia-500
    ],
    []
  );

  const gradesChartData = useMemo(() => {
    const rows: Array<{ escopo: string; nota: number; fill: string }> = [];
    const notaMunicipalOficialGeral = (() => {
      const mm = deckData.notaMediaMunicipalPorDisciplinaRelatorio;
      if (!mm) return null;
      if (mm.GERAL != null && Number.isFinite(Number(mm.GERAL))) return Number(mm.GERAL);
      const e = Object.entries(mm).find(([k]) => k.trim().toUpperCase() === "GERAL");
      return e != null && Number.isFinite(Number(e[1])) ? Number(e[1]) : null;
    })();
    if (multiSchool) {
      const sortedSchools = [...deckData.niveisPorSerie].sort((a, b) =>
        a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" })
      );
      sortedSchools.forEach((row, idx) => {
        const cat = deckData.notasPorCategoria.find((c) => c.label === row.label);
        if (!cat) return;
        rows.push({
          escopo: row.label,
          nota: cat.mediaNota,
          fill: disciplinePalette[idx % disciplinePalette.length],
        });
      });
      const notaBarraMunicipal = notaMunicipalOficialGeral ?? deckData.mediaNotaGeral;
      if (notaBarraMunicipal != null && Number.isFinite(notaBarraMunicipal)) {
        rows.push({ escopo: "MÉDIA MUNICIPAL", nota: notaBarraMunicipal, fill: deckData.primaryColor });
      }
    } else {
      if (deckData.mediaNotaGeral != null && Number.isFinite(deckData.mediaNotaGeral)) {
        rows.push({ escopo: "Média geral", nota: deckData.mediaNotaGeral, fill: deckData.primaryColor });
      }
      deckData.notasPorDisciplina.forEach((d, idx) => {
        rows.push({ escopo: d.disciplina, nota: d.mediaNota, fill: disciplinePalette[idx % disciplinePalette.length] });
      });
      deckData.notasPorCategoria.forEach((c, idx) => {
        rows.push({
          escopo: c.label,
          nota: c.mediaNota,
          fill: disciplinePalette[(idx + deckData.notasPorDisciplina.length) % disciplinePalette.length],
        });
      });
    }
    if (rows.length === 0) rows.push({ escopo: "Sem dados", nota: 0, fill: "#94a3b8" });
    return rows;
  }, [
    multiSchool,
    deckData.mediaNotaGeral,
    deckData.notaMediaMunicipalPorDisciplinaRelatorio,
    deckData.niveisPorSerie,
    deckData.notasPorCategoria,
    deckData.notasPorDisciplina,
    deckData.primaryColor,
    disciplinePalette,
  ]);

  const gradesAxisMax = useMemo(() => {
    const raw = Math.max(10, ...gradesChartData.map((r) => Number(r.nota || 0)));
    return Math.ceil(raw / 5) * 5;
  }, [gradesChartData]);

  const levelGuide = deckData.levelGuide ?? [
    { label: "AVANÇADO", description: "", color: fixedLevelColors.avancado },
    { label: "ADEQUADO", description: "", color: fixedLevelColors.adequado },
    { label: "BÁSICO", description: "", color: fixedLevelColors.basico },
    { label: "ABAIXO DO BÁSICO", description: "", color: fixedLevelColors.abaixo },
  ];

  type QuestoesSlideEntry =
    | { kind: "cover"; serieLabel: string; turmaNome: string }
    | { kind: "table"; chunk: SlideQuestionRow[]; titulo: string; page: string };

  const questoesSlides = useMemo((): QuestoesSlideEntry[] => {
    const out: QuestoesSlideEntry[] = [];
    const geralPages = chunkPresentation19SlideQuestionRows(deckData.questoesTabelaGeral ?? []);
    geralPages.forEach((chunk, i) => {
      out.push({
        kind: "table",
        chunk,
        titulo: "Geral",
        page: geralPages.length > 1 ? `${i + 1}/${geralPages.length}` : "",
      });
    });
    for (const bloco of deckData.questoesPorSerie ?? []) {
      const serieLabel = String(bloco.serie ?? "").trim() || "—";
      out.push({ kind: "cover", serieLabel, turmaNome: "Geral da série" });
      const seriePages = chunkPresentation19SlideQuestionRows(bloco.questoes);
      seriePages.forEach((chunk, i) => {
        out.push({
          kind: "table",
          chunk,
          titulo: `Geral da série — ${serieLabel}`,
          page: seriePages.length > 1 ? `${i + 1}/${seriePages.length}` : "",
        });
      });
    }
    for (const bloco of deckData.questoesPorTurma ?? []) {
      const serieLabel = String(bloco.serieTurma ?? deckData.serie ?? "").trim() || "—";
      out.push({ kind: "cover", serieLabel, turmaNome: bloco.turma });
      const turmaPages = chunkPresentation19SlideQuestionRows(bloco.questoes);
      turmaPages.forEach((chunk, i) => {
        out.push({
          kind: "table",
          chunk,
          titulo: bloco.turma,
          page: turmaPages.length > 1 ? `${i + 1}/${turmaPages.length}` : "",
        });
      });
    }
    return out;
  }, [deckData.questoesTabelaGeral, deckData.questoesPorSerie, deckData.questoesPorTurma, deckData.serie]);

  const firstQuestionsSlideIndex = 20;
  const thanksSlideIndex = firstQuestionsSlideIndex + questoesSlides.length;

  return (
    <div data-presentation19-root className="space-y-6">
      {/* Slide 1 */}
      <div data-slide-index={1}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="flex flex-col h-full justify-between">
            <div className="pt-10">
              <h1
                className="text-6xl font-black tracking-tight leading-tight break-words"
                style={{ color: deckData.primaryColor }}
              >
                {deckData.avaliacaoNome}
              </h1>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6">
              <div className="text-sm text-zinc-500 font-semibold">MUNICÍPIO</div>
              <div className="text-2xl font-extrabold">{deckData.municipioNome}</div>
              <div className="h-2" />
              <div className="text-sm text-zinc-500 font-semibold">SÉRIE</div>
              <div className="text-2xl font-extrabold">{deckData.serie}</div>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="font-semibold">AFIRME EDUCACIONAL</span>
              <span>
                {deckData.mode === "answer_sheet" ? "Cartão-resposta" : "Avaliações"}
              </span>
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 2 */}
      <div data-slide-index={2}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex flex-col">
            <div className="flex-1 flex items-center justify-center min-h-0">
              <div className="text-center w-full max-w-4xl px-2">
                {deckData.slide2ShowSerieTurmas ? (
                  <div className="text-left w-full max-w-4xl mx-auto space-y-6">
                    <div>
                      <div className="text-sm text-zinc-500 font-semibold">ESCOLA</div>
                      <div className="text-3xl font-black text-zinc-900 mt-1 leading-snug break-words">
                        {deckData.escolasParticipantes.length === 1
                          ? (deckData.escolasParticipantes[0] ?? "N/A")
                          : deckData.escolasParticipantes.filter(Boolean).join(", ") || "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-zinc-500 font-semibold">SÉRIE</div>
                      <div className="text-3xl font-black text-zinc-900 mt-1">{deckData.serie}</div>
                    </div>
                    <div>
                      <div className="text-sm text-zinc-500 font-semibold">
                        {deckData.turmasParticipantesCapa.length > 1 ? "TURMAS" : "TURMA"}
                      </div>
                      {deckData.turmasParticipantesCapa.length > 8 ? (
                        <ul className="mt-2 list-disc pl-5 text-lg font-black text-zinc-900 space-y-1 max-h-64 overflow-y-auto">
                          {deckData.turmasParticipantesCapa.map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      ) : (
                        <div
                          className={`font-black mt-1 text-zinc-900 ${deckData.turma.length > 120 ? "text-lg leading-snug" : "text-3xl"}`}
                        >
                          {deckData.turma}
                        </div>
                      )}
                    </div>
                  </div>
                ) : deckData.escolasParticipantes.length <= 1 ? (
                  <div className="text-4xl font-black text-zinc-900">{deckData.escolasParticipantes[0] ?? "N/A"}</div>
                ) : (
                  <>
                    <div className="text-lg font-extrabold text-zinc-500 tracking-tight mb-3">ESCOLAS PARTICIPANTES</div>
                    <ul className="text-left list-disc pl-6 space-y-1.5 text-xl font-black text-zinc-900 max-h-[min(360px,55vh)] overflow-y-auto">
                      {deckData.escolasParticipantes.map((nome) => (
                        <li key={nome}>{nome}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>

            <div className="text-xs text-zinc-500">
              Seleção aplicada{" "}
              <span className="font-semibold" style={{ color: deckData.primaryColor }}>
                {deckData.mode === "answer_sheet" ? "Cartão resposta" : "Avaliações"}
              </span>
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 3 */}
      <div data-slide-index={3}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex items-center justify-center flex-col">
            <div className="text-2xl font-extrabold text-zinc-700">MÉTRICA GERAL</div>
            <div className="mt-4 text-7xl font-black" style={{ color: deckData.primaryColor }}>
              {Math.round(deckData.totalAlunosParticiparam).toLocaleString("pt-BR")}
            </div>
            <div className="mt-4 text-2xl font-extrabold text-zinc-900">Alunos que realizaram a avaliação</div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 4 */}
      <div data-slide-index={4}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex flex-col justify-between">
            <div>
              <SlideTitle title="CAPA DE SEGMENTO" primaryColor={deckData.primaryColor} />
              <div className="mt-8 grid grid-cols-1 gap-4">
                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6">
                  <div className="text-sm text-zinc-500 font-semibold">CURSO</div>
                  <div className="text-3xl font-black">{deckData.curso}</div>
                </div>
                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6">
                  <div className="text-sm text-zinc-500 font-semibold">SÉRIE</div>
                  <div className="text-3xl font-black">{deckData.serie}</div>
                </div>
                {deckData.comparisonAxis !== "escola" ? (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6">
                    <div className="text-sm text-zinc-500 font-semibold">
                      {deckData.turmasParticipantesCapa.length > 1 ? "TURMAS" : "TURMA"}
                    </div>
                    {deckData.turmasParticipantesCapa.length > 8 ? (
                      <ul className="mt-2 list-disc pl-5 text-lg font-black space-y-1 max-h-64 overflow-y-auto">
                        {deckData.turmasParticipantesCapa.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    ) : (
                      <div
                        className={`font-black mt-1 ${deckData.turma.length > 120 ? "text-lg leading-snug" : "text-3xl"}`}
                      >
                        {deckData.turma}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="text-xs text-zinc-500">
              Documento gerado em apresentação (landscape)
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 5 */}
      <div data-slide-index={5}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex flex-col">
            <SlideTitle
              title={presentationTitleTablePresence(deckData.comparisonAxis)}
              primaryColor={deckData.primaryColor}
            />
            <div className="mt-6 flex-1">
              <SimpleTable
                columns={[
                  comparisonColumnLabel(deckData.comparisonAxis),
                  "Total de Alunos",
                  "Total de Presentes",
                  "Presença Média (%)",
                  "Alunos Faltosos",
                ]}
                rows={presenceRows.map((r) => [
                  <span key="s" className="font-semibold">
                    {r.label}
                  </span>,
                  r.totalAlunos,
                  r.totalPresentes,
                  formatPctOneDecimalPtBr(r.presencaMediaPct),
                  r.alunosFaltosos,
                ])}
                accentColor={deckData.primaryColor}
              />
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 6 */}
      <div data-slide-index={6}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex flex-col">
            <SlideTitle
              title={presentationTitleChartPresence(deckData.comparisonAxis)}
              primaryColor={deckData.primaryColor}
            />
            <div className="mt-6 flex-1">
              <BarChart width={980} height={520} data={presenceChartData} margin={P19_BAR_MARGIN}>
                <CartesianGrid stroke="#94a3b8" strokeOpacity={0.55} strokeDasharray="3 3" />
                <XAxis dataKey="label" interval={0} {...p19XAxisProps(12)} />
                <YAxis
                  width={52}
                  domain={[0, presenceAxisMax]}
                  ticks={presenceYTicks}
                  padding={{ top: 0, bottom: 0 }}
                  tick={{ fontSize: 12, fill: "#334155" }}
                  tickFormatter={(v) => String(Math.round(v))}
                />
                <Tooltip
                  wrapperStyle={{ borderRadius: 10, overflow: "hidden" }}
                  contentStyle={{ borderColor: "#e4e4e7" }}
                />
                <Bar
                  dataKey="total_presentes"
                  fill={deckData.primaryColor}
                  radius={[8, 8, 0, 0]}
                >
                  <LabelList
                    dataKey="total_presentes"
                    position="top"
                    offset={2}
                    formatter={(v: number) => String(Math.round(Number(v)))}
                    style={{ fontSize: 11, fill: "#0f172a", fontWeight: 700 }}
                  />
                </Bar>
              </BarChart>
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 7 */}
      <div data-slide-index={7}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <SlideTitle title={presentationSectionLevels(deckData.comparisonAxis)} primaryColor={deckData.primaryColor} />
              <div className="mt-6 text-zinc-600 text-xl font-semibold">
                {presentationSectionLevelsTagline(deckData.comparisonAxis)}
              </div>
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 8 */}
      <div data-slide-index={8}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex flex-col">
            <SlideTitle title="GUIA DE NÍVEIS" primaryColor={deckData.primaryColor} />
            <div className="mt-6 flex-1 grid grid-cols-2 gap-5">
              {levelGuide.map((lvl, idx) => (
                <div key={idx} className="rounded-2xl border border-zinc-200 p-5">
                  <div className="flex items-center gap-3">
                    <div style={{ width: 12, height: 12, borderRadius: 999, background: lvl.color }} />
                    <div className="text-xl font-black" style={{ color: lvl.color }}>
                      {lvl.label}
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-zinc-700 leading-relaxed">{lvl.description}</div>
                </div>
              ))}
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 9 */}
      <div data-slide-index={9}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex flex-col">
            <SlideTitle title={presentationTitleChartLevels(deckData.comparisonAxis)} primaryColor={deckData.primaryColor} />
            <div
              className="mt-6 flex-1 min-h-0 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-xl"
              style={{
                boxShadow: `0 16px 40px rgba(15, 23, 42, 0.10), 0 0 0 1px ${hexToRgba(deckData.primaryColor, 0.12)}`,
              }}
            >
              <BarChart
                width={940}
                height={500}
                data={levelsChartData}
                layout="vertical"
                margin={{ top: P19_BAR_MARGIN.top, right: 36, bottom: 34, left: 10 }}
              >
                <CartesianGrid
                  stroke="#64748b"
                  strokeOpacity={0.40}
                  strokeDasharray="3 3"
                  horizontal={false}
                  vertical
                />
                <XAxis
                  type="number"
                  domain={[0, levelsAxisMax]}
                  ticks={linearTicks(0, levelsAxisMax, 4)}
                  tick={{ fontSize: 12, fill: "#0f172a", fontWeight: 600 }}
                  tickLine={false}
                  tickMargin={10}
                  axisLine={{ stroke: "#475569", strokeWidth: 1.5 }}
                />
                <YAxis
                  type="category"
                  dataKey="nivel"
                  width={200}
                  tick={{ fontSize: 11, fill: "#0f172a", fontWeight: 700 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderWidth: 2,
                    borderColor: hexToRgba(deckData.primaryColor, 0.35),
                    fontWeight: 600,
                  }}
                />
                <Bar dataKey="valor" barSize={28} radius={[0, 8, 8, 0]}>
                  {levelsChartData.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.color} />
                  ))}
                  <LabelList
                    dataKey="valor"
                    position="right"
                    formatter={(v: number) => String(v)}
                    style={{ fontSize: 11, fill: "#0f172a", fontWeight: 700 }}
                  />
                </Bar>
              </BarChart>
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 10 */}
      <div data-slide-index={10}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex flex-col">
            <SlideTitle title={presentationTitleTableLevels(deckData.comparisonAxis)} primaryColor={deckData.primaryColor} />
            <div className="mt-6 flex-1">
              <SimpleTable
                columns={[
                  comparisonColumnLabel(deckData.comparisonAxis),
                  "Abaixo do Básico",
                  "Básico",
                  "Adequado",
                  "Avançado",
                  "Total",
                ]}
                rows={niveisRows.map((r) => [
                  <span key="s" className="font-semibold">
                    {r.label}
                  </span>,
                  r.abaixoDoBasico,
                  r.basico,
                  r.adequado,
                  r.avancado,
                  r.total,
                ])}
                accentColor={deckData.primaryColor}
              />
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 11 */}
      <div data-slide-index={11}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <SlideTitle title={presentationSectionProficiency(deckData.comparisonAxis)} primaryColor={deckData.primaryColor} />
              <div className="mt-6 text-zinc-600 text-xl font-semibold">
                {presentationSectionProficiencyTagline(deckData.comparisonAxis)}
              </div>
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 12 */}
      <div data-slide-index={12}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex flex-col">
            <SlideTitle
              title={presentationTitleProficiencyGeneralChart(deckData.comparisonAxis)}
              primaryColor={deckData.primaryColor}
            />
            <div className="mt-6 flex-1">
              <BarChart width={980} height={520} data={profGeneralData} margin={P19_BAR_MARGIN}>
                <CartesianGrid stroke="#94a3b8" strokeOpacity={0.55} strokeDasharray="3 3" />
                <XAxis dataKey="label" interval={0} {...p19XAxisProps(12)} />
                <YAxis
                  width={52}
                  domain={[0, generalProfAxisMax]}
                  ticks={linearTicks(0, generalProfAxisMax, 4)}
                  padding={{ top: 0, bottom: 0 }}
                  tick={{ fontSize: 12, fill: "#334155" }}
                />
                <Tooltip wrapperStyle={{ borderRadius: 10, overflow: "hidden" }} />
                <Bar dataKey="proficiencia" fill={deckData.primaryColor} radius={[8, 8, 0, 0]}>
                  <LabelList
                    dataKey="proficiencia"
                    position="top"
                    offset={2}
                    formatter={(v: number) => Number(v).toFixed(1)}
                    style={{ fontSize: 11, fill: "#0f172a", fontWeight: 700 }}
                  />
                </Bar>
              </BarChart>
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 13 */}
      <div data-slide-index={13}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex flex-col">
            <SlideTitle
              title={presentationTitleProficiencyByDiscipline(deckData.comparisonAxis)}
              primaryColor={deckData.primaryColor}
            />
            <div className="mt-4 flex-1 grid grid-cols-2 gap-3">
              {profByDiscSeparate.map((disc) => {
                const paletteIndex = getSubjectPaletteIndex(disc.disciplina, disc.disciplina);
                const barColor = disciplinePalette[paletteIndex % disciplinePalette.length];
                const maxDisc = getProficiencyTableInfo(deckData.serie, disc.disciplina).maxProficiency;
                const maxAtual = Math.max(
                  0,
                  ...disc.data.map((d) => (Number.isFinite(d.proficiencia) ? Number(d.proficiencia) : 0))
                );
                const pctTeto = maxDisc > 0 ? (maxAtual / maxDisc) * 100 : 0;
                const step = maxDisc <= 350 ? 50 : 100;

                return (
                  <div key={disc.disciplina} className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-zinc-700 truncate">{disc.disciplina}</div>
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: barColor }} />
                    </div>
                    <div className="grid grid-cols-[1fr_132px] gap-2">
                      <BarChart
                        width={308}
                        height={176}
                        data={disc.data}
                        margin={{
                          top: Math.max(18, P19_CHART_V_BAR_TOP_PAD_PX + P19_CHART_V_BAR_VALUE_LABEL_RESERVE_PX - 8),
                          right: 6,
                          bottom: 44,
                          left: 2,
                        }}
                      >
                        <XAxis dataKey="turma" interval={0} {...p19XAxisProps(10)} />
                        <YAxis
                          width={40}
                          domain={[0, maxDisc]}
                          ticks={linearTicks(0, maxDisc, 4)}
                          padding={{ top: 0, bottom: 0 }}
                          tick={{ fontSize: 10, fill: "#334155" }}
                        />
                        <Tooltip wrapperStyle={{ borderRadius: 10, overflow: "hidden" }} />
                        <ReferenceLine y={0} stroke="#64748b" strokeOpacity={0.25} />
                        <ReferenceLine y={step} stroke="#64748b" strokeOpacity={0.18} strokeDasharray="3 3" />
                        <ReferenceLine y={step * 2} stroke="#64748b" strokeOpacity={0.18} strokeDasharray="3 3" />
                        <ReferenceLine y={step * 3} stroke="#64748b" strokeOpacity={0.18} strokeDasharray="3 3" />
                        <ReferenceLine y={maxDisc} stroke="#0f172a" strokeOpacity={0.22} strokeDasharray="4 4" />
                        <Bar dataKey="proficiencia" fill={barColor} radius={[6, 6, 0, 0]}>
                          <LabelList
                            dataKey="proficiencia"
                            position="top"
                            offset={2}
                            formatter={(v: number) => (Number(v) > 0 ? Number(v).toFixed(1) : "")}
                            style={{ fontSize: 10, fill: "#0f172a", fontWeight: 600 }}
                          />
                        </Bar>
                      </BarChart>
                      <div className="rounded-lg border border-zinc-200 bg-white px-2 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">Máx. Disc.</div>
                        <div className="text-lg font-black leading-tight" style={{ color: barColor }}>
                          {maxDisc.toFixed(1)}
                        </div>
                        <div className="mt-2 text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">Atual</div>
                        <div className="text-base font-extrabold text-zinc-800 leading-tight">
                          {maxAtual.toFixed(1)}
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-600">{pctTeto.toFixed(1)}% do teto</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {profByDiscSeparate.length === 0 && (
                <div className="col-span-2 flex items-center justify-center text-sm text-zinc-500">
                  Sem dados de proficiência por disciplina para exibir.
                </div>
              )}
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 14 */}
      <div data-slide-index={14}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex flex-col items-center justify-center text-center gap-4">
            <SlideTitle title={presentationSectionGrades(deckData.comparisonAxis)} primaryColor={deckData.primaryColor} />
            <div className="text-zinc-600 text-xl font-semibold max-w-3xl">
              {presentationSectionGradesTagline(deckData.comparisonAxis)}
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 15 */}
      <div data-slide-index={15}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex flex-col">
            <SlideTitle title={presentationTitleTableGrades(deckData.comparisonAxis)} primaryColor={deckData.primaryColor} />
            <div className="mt-6 flex-1">
              <SimpleTable
                columns={["Escopo", "Média da nota"]}
                rows={(() => {
                  const out: Array<Array<string | number>> = [];
                  const medLabel = multiSchool ? "MÉDIA MUNICIPAL" : "Média geral";
                  const mm = deckData.notaMediaMunicipalPorDisciplinaRelatorio;
                  const notaMunGeral =
                    multiSchool && mm
                      ? (() => {
                          if (mm.GERAL != null && Number.isFinite(Number(mm.GERAL))) return Number(mm.GERAL);
                          const e = Object.entries(mm).find(([k]) => k.trim().toUpperCase() === "GERAL");
                          return e != null && Number.isFinite(Number(e[1])) ? Number(e[1]) : null;
                        })() ?? deckData.mediaNotaGeral
                      : deckData.mediaNotaGeral;
                  if (notaMunGeral != null && Number.isFinite(notaMunGeral)) {
                    out.push([medLabel, notaMunGeral.toFixed(1).replace(".", ",")]);
                  }
                  if (!multiSchool) {
                    for (const d of deckData.notasPorDisciplina) {
                      out.push([d.disciplina, Number(d.mediaNota).toFixed(1).replace(".", ",")]);
                    }
                  }
                  for (const c of deckData.notasPorCategoria) {
                    out.push([c.label, Number(c.mediaNota).toFixed(1).replace(".", ",")]);
                  }
                  if (out.length === 0) out.push(["—", "Sem dados de nota"]);
                  return out;
                })()}
                accentColor={deckData.primaryColor}
              />
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 16 */}
      <div data-slide-index={16}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex flex-col">
            <SlideTitle title={presentationTitleChartGrades(deckData.comparisonAxis)} primaryColor={deckData.primaryColor} />
            <div className="mt-6 flex-1">
              <BarChart width={980} height={520} data={gradesChartData} margin={P19_BAR_MARGIN}>
                <CartesianGrid stroke="#94a3b8" strokeOpacity={0.55} strokeDasharray="3 3" />
                <XAxis dataKey="escopo" interval={0} {...p19XAxisProps(12)} />
                <YAxis
                  width={52}
                  domain={[0, gradesAxisMax]}
                  ticks={linearTicks(0, gradesAxisMax, 4)}
                  padding={{ top: 0, bottom: 0 }}
                  tick={{ fontSize: 12, fill: "#334155" }}
                />
                <Tooltip wrapperStyle={{ borderRadius: 10, overflow: "hidden" }} />
                <Bar dataKey="nota" radius={[8, 8, 0, 0]}>
                  {gradesChartData.map((entry, idx) => (
                    <Cell key={`grade-${idx}`} fill={entry.fill} />
                  ))}
                  <LabelList
                    dataKey="nota"
                    position="top"
                    offset={2}
                    formatter={(v: number) => Number(v).toFixed(1).replace(".", ",")}
                    style={{ fontSize: 11, fill: "#0f172a", fontWeight: 700 }}
                  />
                </Bar>
              </BarChart>
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 17 */}
      <div data-slide-index={17}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <SlideTitle title={presentationSectionQuestionsTitle()} primaryColor={deckData.primaryColor} />
              <div className="mt-6 text-zinc-600 text-xl font-semibold">
                {presentationSectionQuestionsTagline()}
              </div>
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 18 */}
      <div data-slide-index={18}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl font-black" style={{ color: deckData.primaryColor }}>
                [{deckData.serieNomeCapas}]
              </div>
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 19 */}
      <div data-slide-index={19}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl font-black" style={{ color: deckData.primaryColor }}>
                [{deckData.turmaNomeCapas}]
              </div>
            </div>
          </div>
        </SlideFrame>
      </div>

      {/* Slide 20+ (15 questões por página): Geral, depois capa + páginas por turma */}
      {questoesSlides.map((slide, pageIdx) => (
        <div
          key={slide.kind === "cover" ? `questions-cover-${slide.turmaNome}-${pageIdx}` : `questions-${slide.titulo}-${pageIdx}`}
          data-slide-index={firstQuestionsSlideIndex + pageIdx}
        >
          <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
            {slide.kind === "cover" ? (
              <div className="h-full flex items-center justify-center px-10 text-center">
                <div
                  className="max-w-5xl text-3xl sm:text-4xl font-black leading-snug break-words"
                  style={{ color: deckData.primaryColor }}
                >
                  {presentationQuestionsTurmaCoverLine(slide.serieLabel, slide.turmaNome)}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <SlideTitle
                    title={`TABELA DE QUESTÕES — ${slide.titulo === "Geral" ? "Geral" : `Turma ${slide.titulo}`}`}
                    primaryColor={deckData.primaryColor}
                  />
                  {slide.page !== "" && (
                    <div className="text-sm font-semibold text-zinc-600 shrink-0">Página {slide.page}</div>
                  )}
                </div>
                <div className="mt-6 flex-1">
                  <SimpleTable
                    columns={["Questão", "Habilidade", "% Acertos"]}
                    rows={slide.chunk.map((q) => [
                      q.questao,
                      q.habilidade,
                      `${q.percentualAcertos.toFixed(1).replace(".", ",")}%`,
                    ])}
                    accentColor={deckData.primaryColor}
                  />
                </div>
              </div>
            )}
          </SlideFrame>
        </div>
      ))}

      {/* Último slide */}
      <div data-slide-index={thanksSlideIndex}>
        <SlideFrame primaryColor={deckData.primaryColor} logoDataUrl={deckData.logoDataUrl}>
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl font-black" style={{ color: deckData.primaryColor }}>
                Obrigado!!
              </div>
            </div>
          </div>
        </SlideFrame>
      </div>
    </div>
  );
}

