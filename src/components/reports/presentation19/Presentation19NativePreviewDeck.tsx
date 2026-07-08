import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildSlideSpec } from "@/utils/reports/presentation19/buildSlideSpec";
import type { ExportChart, Presentation19ExportSpec, Presentation19SlideSpec } from "@/types/presentation19-export-spec";
import type { Presentation19DeckData } from "@/types/presentation19-slides";
import {
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
  presentationTitleGradesByDiscipline,
  presentationTitleProficiencyByDiscipline,
  presentationTitleProficiencyGeneralChart,
  presentationTitleTableGrades,
  presentationTitleTableProficiency,
  presentationTitleTableLevels,
  presentationTitleTablePresence,
  presentationQuestionsTurmaCoverLine,
  presentationTitleQuestionsSerieGeral,
  niveisAprendizagemTituloPorEixo,
  P19_LEVELS_TABLE_LEVEL_HEADER_BG_HEX,
} from "@/utils/reports/presentation19/presentationScope";
import { P19_QUESTION_NUM_LEVEL_STYLE } from "@/utils/reports/presentation19/questionAcertoLevel";
import {
  P19_CHART_AXIS_TICK_PX,
  P19_CHART_BAR_VALUE_TOP_PX,
  P19_CHART_CATEGORY_LABEL_PX,
  P19_CHART_REF_H_PX,
  P19_CONTENT,
  P19_COVER_MAIN_LABEL_PX,
  P19_COVER_MAIN_TITLE_PX,
  P19_COVER_MAIN_VALUE_PX,
  P19_COVER_SCHOOL_MULTI_HEADER_PX,
  P19_COVER_SCHOOL_SINGLE_PX,
  P19_COVER_SCHOOL_LIST_SMALL_PX,
  P19_COVER_SCHOOL_LIST_LARGE_PX,
  P19_DYNAMIC_COVER_PX,
  P19_HORIZONTAL_CHART_LABEL_WIDTH_PX,
  P19_LEVELS_GUIDE_DESC_PX,
  P19_LEVELS_GUIDE_TITLE_PX,
  P19_CHART_SUBTITLE_GRADES,
  P19_CHART_SUBTITLE_PRESENCE,
  P19_CHART_SUBTITLE_PROFICIENCY,
  P19_METRIC_HEADER_PX,
  P19_METRIC_NUMBER_PX,
  P19_PAGE,
  P19_PAGE_INDICATOR_FONT_PX,
  P19_SEGMENT_FIELD_LABEL_PX,
  P19_SEGMENT_FIELD_VALUE_PX,
  P19_BORDER_NEUTRAL,
  P19_BORDER_SOFT,
  P19_SURFACE_CARD,
  P19_TABLE_CELL_FONT_PX,
  P19_TABLE_CELL_PADDING_PX,
  P19_TABLE_QUESTIONS_DESC_FONT_PX,
  P19_TEXT_BASE,
  P19_TEXT_MUTED,
  P19_TEXT_STRONG,
  P19_TITLE_ACCENT_H_PX,
  P19_TITLE_ACCENT_W_PX,
  P19_TITLE_FONT_PX,
  P19_TITLE_SUBTITLE_GAP_PX,
  P19_TITLE_TEXT_OFFSET_X_PX,
  P19_SUBTITLE_FONT_PX,
  P19_PROFICIENCY_DISC_CARD_TITLE_PX,
  P19_THANK_YOU_FONT_PX,
} from "@/utils/reports/presentation19/presentation19ExportTypography";
import { P19_CHART_V_BAR_VALUE_LABEL_RESERVE_PX } from "@/utils/reports/presentation19/presentation19Layout";
import {
  presenceTablePctCellColors,
  presentation19CoverSchoolColumnCount,
  presentation19CoverSchoolListFontPx,
  PRESENTATION19_GRADES_NO_TURMA_NOTICE,
  resolvePresentation19BarTopLabel,
} from "@/utils/reports/presentation19/presentation19Labels";
import { resolveMunicipalReferenceXRatios } from "@/utils/reports/presentation19/municipalReferenceLine";
import { p19VerticalBarGapPx } from "@/utils/reports/presentation19/presentation19VerticalBarLayout";

type Props = {
  deckData: Presentation19DeckData;
  /** Se a página já montou com `useMemo(buildSlideSpec)`, evita recalcular o spec a cada render. */
  spec?: Presentation19ExportSpec | null;
};

export type Presentation19NativePreviewDeckHandle = {
  openFullscreen: () => void;
};

/** Elemento em tela cheia (API padrão + prefixos WebKit legados). */
function getFullscreenElement(): Element | null {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

/** Solicita tela cheia do documento (gesto do usuário no mesmo clique). */
function requestBrowserFullscreen(): void {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  if (typeof el.requestFullscreen === "function") {
    void el.requestFullscreen().catch(() => {
      /* permissão negada, iOS, etc. */
    });
  } else if (typeof el.webkitRequestFullscreen === "function") {
    void el.webkitRequestFullscreen();
  }
}

function exitBrowserFullscreen(): void {
  if (!getFullscreenElement()) return;
  const d = document as Document & { webkitExitFullscreen?: () => Promise<void> };
  if (typeof document.exitFullscreen === "function") {
    void document.exitFullscreen().catch(() => {});
  } else if (typeof d.webkitExitFullscreen === "function") {
    void d.webkitExitFullscreen();
  }
}

const page = P19_PAGE;
const content = P19_CONTENT;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const safe = hex.replace("#", "");
  const normalized = safe.length === 3 ? safe.split("").map((c) => `${c}${c}`).join("") : safe;
  const n = Number.parseInt(normalized, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbCss(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

function Title({ text, primaryColor, subtitle }: { text: string; primaryColor: string; subtitle?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: subtitle ? P19_TITLE_SUBTITLE_GAP_PX : 0, maxWidth: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
        <div
          style={{
            width: P19_TITLE_ACCENT_W_PX,
            height: P19_TITLE_ACCENT_H_PX,
            borderRadius: 999,
            background: primaryColor,
            flexShrink: 0,
            marginTop: 4,
          }}
        />
        <h2
          style={{
            margin: 0,
            fontSize: P19_TITLE_FONT_PX,
            fontWeight: 800,
            color: P19_TEXT_STRONG,
            letterSpacing: 0.2,
            lineHeight: 1.2,
            flex: 1,
            minWidth: 0,
          }}
        >
          {text}
        </h2>
      </div>
      {subtitle ? (
        <div style={{ paddingLeft: P19_TITLE_TEXT_OFFSET_X_PX, fontSize: P19_SUBTITLE_FONT_PX, fontWeight: 700, color: P19_TEXT_MUTED, lineHeight: 1.25 }}>
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function tableCellTextAlign(slideKind: Presentation19SlideSpec["kind"], colIdx: number): "left" | "center" | "right" {
  if (slideKind === "presence-table") return colIdx === 0 ? "left" : "center";
  if (slideKind === "grades-table") return colIdx === 0 ? "left" : "center";
  if (slideKind === "proficiency-general-table") return colIdx === 0 ? "left" : "center";
  if (slideKind === "levels-table") return colIdx === 0 ? "left" : "center";
  if (slideKind === "questions-table") {
    if (colIdx === 0 || colIdx === 3) return "center";
    return "left";
  }
  return "left";
}

function HorizontalBarChartPreview({ chart, height = P19_CHART_REF_H_PX }: { chart: ExportChart; height?: number }) {
  const rawMax = Math.max(1, ...chart.data.flatMap((d) => chart.valueKeys.map((s) => Number(d[s.key] ?? 0))));
  const axisMin = Number.isFinite(chart.yAxis?.min) ? Number(chart.yAxis?.min) : 0;
  const axisMax = Number.isFinite(chart.yAxis?.max) ? Number(chart.yAxis?.max) : Math.max(1, Math.ceil(rawMax * 1.15));
  const maxValue = Math.max(axisMin + 1, axisMax);
  const ticks = (chart.yAxis?.ticks?.length
    ? chart.yAxis.ticks
    : [0, 0.25, 0.5, 0.75, 1].map((r) => axisMin + (maxValue - axisMin) * r)
  )
    .filter((v, idx, arr) => Number.isFinite(v) && v >= axisMin && v <= maxValue && arr.indexOf(v) === idx)
    .sort((a, b) => a - b);
  const ratioOf = (val: number) => (Math.max(0, val - axisMin) / (maxValue - axisMin));
  const serie = chart.valueKeys[0] ?? { key: "valor", label: "", color: "#22C55E" };
  const palette = ["#3B82F6", "#22C55E", "#F97316", "#A855F7", "#EF4444", "#06B6D4", "#EAB308", "#14B8A6"];

  return (
    <div
      style={{
        border: `1px solid ${P19_BORDER_SOFT}`,
        borderRadius: 12,
        background: "transparent",
        height,
        padding: "8px 12px 8px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 4, paddingBottom: 4 }}>
        {chart.data.map((row, idx) => {
          const value = Number(row[serie.key] ?? 0);
          const q = ratioOf(value);
          const color = String(row.color ?? palette[idx % palette.length] ?? serie.color);
          return (
            <div key={idx} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: P19_HORIZONTAL_CHART_LABEL_WIDTH_PX,
                  flexShrink: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  color: P19_TEXT_BASE,
                  textAlign: "right",
                  lineHeight: 1.2,
                }}
              >
                {String(row[chart.categoryKey] ?? "")}
              </div>
              <div style={{ flex: 1, minWidth: 0, height: 30, position: "relative", display: "flex", alignItems: "center" }}>
                <div
                  style={{
                    marginLeft: 0,
                    width: `${q * 100}%`,
                    height: "82%",
                    maxHeight: 26,
                    minHeight: value > 0 ? 6 : 0,
                    background: color,
                    borderRadius: "0 8px 8px 0",
                  }}
                />
                <span style={{ marginLeft: 6, fontSize: 14, fontWeight: 800, color: P19_TEXT_STRONG, whiteSpace: "nowrap" }}>
                  {(() => {
                    const wantsPct = String(serie.label ?? "").includes("%");
                    const isInt = Math.abs(Number(value) - Math.round(Number(value))) < 1e-9;
                    if (!wantsPct && isInt) return String(Math.round(Number(value)));
                    const base = Number(value).toFixed(1).replace(".", ",");
                    return wantsPct ? `${base}%` : base;
                  })()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BarChartPreview({ chart, height = P19_CHART_REF_H_PX }: { chart: ExportChart; height?: number }) {
  if (chart.orientation === "horizontal") {
    return <HorizontalBarChartPreview chart={chart} height={height} />;
  }

  const wrapLabelBySpaces = (text: string, maxCharsPerLine: number): string => {
    const t = (text ?? "").trim();
    if (!t) return "";
    const words = t.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if (!cur) {
        cur = w;
        continue;
      }
      if ((cur + " " + w).length <= maxCharsPerLine) {
        cur = cur + " " + w;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.join("\n");
  };

  const categories = chart.data.map((d) => String(d[chart.categoryKey] ?? ""));
  const barCount = Math.max(1, categories.length);
  const barGap = p19VerticalBarGapPx(barCount);
  const compactBars = barCount > 14;
  const valueLabelPx = compactBars ? Math.max(8, P19_CHART_BAR_VALUE_TOP_PX - 2) : P19_CHART_BAR_VALUE_TOP_PX;
  const barWidthCss = compactBars ? "min(24px, 88%)" : "min(40px, 88%)";
  const rawMax = Math.max(1, ...chart.data.flatMap((d) => chart.valueKeys.map((s) => Number(d[s.key] ?? 0))));
  const axisMin = Number.isFinite(chart.yAxis?.min) ? Number(chart.yAxis?.min) : 0;
  const axisMax = Number.isFinite(chart.yAxis?.max) ? Number(chart.yAxis?.max) : Math.max(1, Math.ceil(rawMax * 1.15));
  const maxValue = Math.max(axisMin + 1, axisMax);
  const hasMultipleSeries = chart.valueKeys.length > 1;
  const isStacked = chart.type === "stackedBar";
  const gridValues = (chart.yAxis?.ticks?.length ? chart.yAxis.ticks : [0, 0.25, 0.5, 0.75, 1].map((r) => axisMin + (maxValue - axisMin) * r))
    .filter((v, idx, arr) => Number.isFinite(v) && v >= axisMin && v <= maxValue && arr.indexOf(v) === idx)
    .sort((a, b) => b - a);

  const LABEL_ROW_H = 30;
  const AXIS_LAB_W = 24;

  const ratioOf = (val: number) => (Math.max(0, val - axisMin) / (maxValue - axisMin));
  const palette = ["#3B82F6", "#22C55E", "#F97316", "#A855F7", "#EF4444", "#06B6D4", "#EAB308", "#14B8A6"];

  return (
    <div
      style={{
        border: `1px solid ${P19_BORDER_SOFT}`,
        borderRadius: 12,
        background: "transparent",
        height,
        padding: "8px 12px 6px",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            gap: barGap,
            /* stretch: colunas precisam da altura total do plot; só `absolute` não gera altura no fluxo */
            alignItems: "stretch",
            // Reservar o mesmo espaço do "eixo" para alinhar com os rótulos.
            paddingLeft: AXIS_LAB_W + 6,
            paddingRight: AXIS_LAB_W + 6,
            zIndex: 2,
            overflow: "hidden",
          }}
        >
          {chart.data.map((row, idx) => (
            <div
              key={idx}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                overflow: "hidden",
              }}
            >
              <div style={{ flexShrink: 0, height: P19_CHART_V_BAR_VALUE_LABEL_RESERVE_PX }} aria-hidden />
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                }}
              >
              {hasMultipleSeries ? (
                isStacked ? (
                  (() => {
                    const stackTotal = chart.valueKeys.reduce((s, serie) => s + Math.max(0, Number(row[serie.key] ?? 0)), 0);
                    const stackFrac = Math.min(1, ratioOf(stackTotal));
                    const growStack = stackTotal > 0 ? Math.max(1e-6, stackFrac) : 0;
                    const growTop = stackTotal > 0 ? Math.max(1e-6, 1 - stackFrac) : 1;
                    return (
                      <div
                        style={{
                          flex: 1,
                          minHeight: 0,
                          width: "100%",
                          position: "relative",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <div style={{ flex: growTop, flexBasis: 0, minHeight: 0 }} aria-hidden />
                        {stackTotal > 0 && (
                          <div
                            style={{
                              flex: growStack,
                              flexBasis: 0,
                              minHeight: 0,
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "flex-end",
                            }}
                          >
                            <div
                              style={{
                                width: "min(28px, 72%)",
                                height: "100%",
                                display: "flex",
                                flexDirection: "column-reverse",
                                overflow: "hidden",
                                borderRadius: "8px 8px 0 0",
                              }}
                            >
                              {chart.valueKeys.map((serie) => {
                                const value = Number(row[serie.key] ?? 0);
                                const pct = stackTotal > 0 ? (value / stackTotal) * 100 : 0;
                                return (
                                  <div
                                    key={serie.key}
                                    style={{ height: `${pct}%`, minHeight: value > 0 ? 1 : 0, background: serie.color }}
                                    title={`${serie.label}: ${value}`}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {stackTotal > 0 && (
                          <div
                            style={{
                              position: "absolute",
                              left: "50%",
                              transform: "translateX(-50%)",
                              bottom: `calc(${stackFrac * 100}% + 3px)`,
                              fontSize: P19_CHART_AXIS_TICK_PX,
                              fontWeight: 700,
                              color: "#0F172A",
                              lineHeight: 1,
                              whiteSpace: "nowrap",
                              pointerEvents: "none",
                            }}
                          >
                            {Math.round(stackTotal)}
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div
                    style={{
                      height: "100%",
                      width: "100%",
                      minHeight: 0,
                      display: "flex",
                      alignItems: "stretch",
                      gap: 6,
                      paddingInline: 4,
                      justifyContent: "center",
                    }}
                  >
                    {chart.valueKeys.map((serie) => {
                      const value = Number(row[serie.key] ?? 0);
                      const q = ratioOf(value);
                      const growBar = value > 0 ? Math.max(1e-6, q) : 0;
                      const growTop = value > 0 ? Math.max(1e-6, 1 - q) : 1;
                      return (
                        <div
                          key={serie.key}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            maxWidth: 40,
                            minHeight: 0,
                            position: "relative",
                            display: "flex",
                            flexDirection: "column",
                          }}
                          title={`${serie.label}: ${value}`}
                        >
                          <div style={{ flex: growTop, flexBasis: 0, minHeight: 0 }} aria-hidden />
                          {value > 0 && (
                            <div
                              style={{
                                flex: growBar,
                                flexBasis: 0,
                                minHeight: 0,
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "flex-end",
                              }}
                            >
                              <div
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  minHeight: 2,
                                  background: serie.color,
                                  borderRadius: "8px 8px 0 0",
                                }}
                              />
                            </div>
                          )}
                          {value > 0 && (
                            <div
                              style={{
                                position: "absolute",
                                left: "50%",
                                transform: "translateX(-50%)",
                                bottom: `calc(${q * 100}% + 1px)`,
                                fontSize: P19_CHART_BAR_VALUE_TOP_PX,
                                fontWeight: 900,
                                color: "#0F172A",
                                whiteSpace: "nowrap",
                                lineHeight: 1,
                                pointerEvents: "none",
                              }}
                            >
                              {Math.round(value)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                (() => {
                  const serie = chart.valueKeys[0];
                  const value = Number(row[serie.key] ?? 0);
                  const q = ratioOf(value);
                  const rowColor = String(row.color ?? palette[idx % palette.length] ?? serie.color);
                  const labelText = resolvePresentation19BarTopLabel(row, value, serie.label);
                  const growBar = value > 0 ? Math.max(1e-6, q) : 0;
                  const growTop = value > 0 ? Math.max(1e-6, 1 - q) : 1;
                  return (
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        minHeight: 0,
                        height: "100%",
                        position: "relative",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div style={{ flex: growTop, flexBasis: 0, minHeight: 0 }} aria-hidden />
                      {value > 0 && (
                        <div
                          style={{
                            flex: growBar,
                            flexBasis: 0,
                            minHeight: 0,
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "flex-end",
                          }}
                        >
                          <div
                            style={{
                              width: barWidthCss,
                              height: "100%",
                              minHeight: 2,
                              background: rowColor,
                              borderRadius: "12px 12px 0 0",
                            }}
                          />
                        </div>
                      )}
                      {value > 0 && (
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            bottom: `calc(${q * 100}% + 1px)`,
                            fontSize: valueLabelPx,
                            fontWeight: 900,
                            color: "#0F172A",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            textAlign: "center",
                            lineHeight: 1,
                            pointerEvents: "none",
                            paddingInline: 1,
                          }}
                        >
                          {labelText}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
              </div>
            </div>
          ))}
        </div>
        {chart.referenceLineY != null && Number.isFinite(Number(chart.referenceLineY)) && (() => {
          const ratios = resolveMunicipalReferenceXRatios(chart);
          const q = ratioOf(Number(chart.referenceLineY));
          if (!ratios) return null;
          const widthPct = (ratios.endRatio - ratios.startRatio) * 100;
          const reservePx = P19_CHART_V_BAR_VALUE_LABEL_RESERVE_PX;
          return (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: AXIS_LAB_W + 6,
                right: AXIS_LAB_W + 6,
                /* Topo da barra = q·(H−reserva) a partir da base → calc(q·100% − q·reserva px) */
                bottom: `calc(${q * 100}% - ${q * reservePx}px)`,
                height: 0,
                zIndex: 4,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  marginLeft: `${ratios.startRatio * 100}%`,
                  width: `${widthPct}%`,
                  borderTop: "2px dashed #64748B",
                }}
              />
            </div>
          );
        })()}
      </div>
      <div
        style={{
          display: "flex",
          minHeight: LABEL_ROW_H,
          paddingTop: 6,
          gap: barGap,
          paddingLeft: AXIS_LAB_W + 6,
          paddingRight: AXIS_LAB_W + 6,
          overflow: "hidden",
        }}
      >
        {chart.data.map((row, idx) => (
          <div
            key={`lab-${idx}`}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: P19_CHART_CATEGORY_LABEL_PX,
              color: P19_TEXT_BASE,
              textAlign: "center",
              fontWeight: 600,
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {wrapLabelBySpaces(String(row[chart.categoryKey] ?? categories[idx]), 14)}
          </div>
        ))}
      </div>
    </div>
  );
}

const NativeSlideFrame = memo(function NativeSlideFrame({
  slide,
  deckData,
}: {
  slide: Presentation19SlideSpec;
  deckData: Presentation19DeckData;
}) {
  const footerH = deckData.footerText?.trim() ? 28 : 0;
  return (
    <div
            data-slide-frame
            style={{
              width: page.width,
              height: page.height,
              borderRadius: 16,
              overflow: "hidden",
              border: `1px solid ${P19_BORDER_SOFT}`,
              background: "#FFFFFF",
              color: P19_TEXT_STRONG,
              position: "relative",
            }}
          >
            {deckData.logoDataUrl ? (
              <img
                src={deckData.logoDataUrl}
                alt=""
                crossOrigin="anonymous"
                style={{
                  position: "absolute",
                  top: 18,
                  right: 24,
                  width: 86,
                  height: "auto",
                  maxHeight: 72,
                  objectFit: "contain",
                  zIndex: 2,
                  pointerEvents: "none",
                }}
              />
            ) : null}
            <div
              style={{
                position: "absolute",
                left: content.x,
                top: content.y,
                width: content.w,
                height: content.h - footerH,
                color: P19_TEXT_STRONG,
            }}
            >
              {slide.kind === "cover-main" && (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div style={{ minHeight: 0 }}>
                    <h1
                      style={{
                        margin: "72px 0 0",
                        color: rgbCss(deckData.primaryColor),
                        fontSize: P19_COVER_MAIN_TITLE_PX,
                        fontWeight: 900,
                        lineHeight: 1.15,
                        maxWidth: "100%",
                      }}
                    >
                      {deckData.avaliacaoNome}
                    </h1>
                    {deckData.coverSubtitle?.trim() ? (
                      <div
                        style={{
                          marginTop: 14,
                          fontSize: 15,
                          fontWeight: 700,
                          color: P19_TEXT_BASE,
                          lineHeight: 1.35,
                          maxWidth: 920,
                        }}
                      >
                        {deckData.coverSubtitle.trim()}
                      </div>
                    ) : null}
                  </div>
                  <div
                    style={{
                      background: P19_SURFACE_CARD,
                      border: `1px solid ${P19_BORDER_SOFT}`,
                      borderRadius: 16,
                      padding: 24,
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px 32px",
                      alignContent: "start",
                    }}
                  >
                    <div>
                      <div style={{ color: P19_TEXT_MUTED, fontSize: P19_COVER_MAIN_LABEL_PX, fontWeight: 700 }}>MUNICÍPIO</div>
                      <div style={{ color: P19_TEXT_STRONG, fontSize: P19_COVER_MAIN_VALUE_PX, fontWeight: 900, marginTop: 6, lineHeight: 1.2, wordBreak: "break-word" }}>
                        {deckData.municipioNome}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: P19_TEXT_MUTED, fontSize: P19_COVER_MAIN_LABEL_PX, fontWeight: 700 }}>SÉRIE</div>
                      <div style={{ color: P19_TEXT_STRONG, fontSize: P19_COVER_MAIN_VALUE_PX, fontWeight: 900, marginTop: 6, lineHeight: 1.2, wordBreak: "break-word" }}>
                        {deckData.serie}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {slide.kind === "cover-school" && (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 24,
                    overflow: "hidden",
                  }}
                >
                  {deckData.slide2ShowSerieTurmas ? (
                    <div style={{ width: "100%", maxWidth: 920, display: "flex", flexDirection: "column", gap: 24 }}>
                      <div>
                        <div style={{ fontSize: P19_SEGMENT_FIELD_LABEL_PX, fontWeight: 700, color: P19_TEXT_MUTED }}>ESCOLA</div>
                        <div style={{ marginTop: 6, fontSize: P19_SEGMENT_FIELD_VALUE_PX, fontWeight: 900, lineHeight: 1.25, wordBreak: "break-word", color: P19_TEXT_STRONG }}>
                          {deckData.escolasParticipantes.length === 1
                            ? (deckData.escolasParticipantes[0] ?? "N/A")
                            : deckData.escolasParticipantes.filter(Boolean).join(", ") || "N/A"}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: P19_SEGMENT_FIELD_LABEL_PX, fontWeight: 700, color: P19_TEXT_MUTED }}>SÉRIE</div>
                        <div style={{ marginTop: 6, fontSize: P19_SEGMENT_FIELD_VALUE_PX, fontWeight: 900, color: P19_TEXT_STRONG }}>{deckData.serie}</div>
                      </div>
                      {deckData.turno?.trim() ? (
                        <div>
                          <div style={{ fontSize: P19_SEGMENT_FIELD_LABEL_PX, fontWeight: 700, color: P19_TEXT_MUTED }}>TURNO</div>
                          <div style={{ marginTop: 6, fontSize: P19_SEGMENT_FIELD_VALUE_PX, fontWeight: 900, color: P19_TEXT_STRONG }}>{deckData.turno}</div>
                        </div>
                      ) : null}
                      <div>
                        <div style={{ fontSize: P19_SEGMENT_FIELD_LABEL_PX, fontWeight: 700, color: P19_TEXT_MUTED }}>
                          {deckData.turmasParticipantesCapa.length > 1 ? "TURMAS" : "TURMA"}
                        </div>
                        {deckData.turmasParticipantesCapa.length > 8 ? (
                          <ul
                            style={{
                              margin: "8px 0 0",
                              paddingLeft: 22,
                              fontSize: presentation19CoverSchoolListFontPx(deckData.turmasParticipantesCapa.length),
                              fontWeight: 800,
                              lineHeight: 1.35,
                            }}
                          >
                            {deckData.turmasParticipantesCapa.map((t) => (
                              <li key={t}>{t}</li>
                            ))}
                          </ul>
                        ) : (
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: deckData.turma.length > 120 ? 22 : 34,
                              fontWeight: 900,
                              lineHeight: 1.25,
                              wordBreak: "break-word",
                              color: P19_TEXT_STRONG,
                            }}
                          >
                            {deckData.turma}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : deckData.escolasParticipantes.length <= 1 ? (
                    <div style={{ fontSize: P19_COVER_SCHOOL_SINGLE_PX, fontWeight: 900, textAlign: "center" }}>
                      {deckData.escolasParticipantes[0] ?? "N/A"}
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: P19_COVER_SCHOOL_MULTI_HEADER_PX, fontWeight: 900, color: P19_TEXT_MUTED, marginBottom: 14 }}>
                        ESCOLAS PARTICIPANTES
                      </div>
                      <div
                        style={{
                          width: "100%",
                          maxWidth: 920,
                          display: "grid",
                          gridTemplateColumns: `repeat(${presentation19CoverSchoolColumnCount(deckData.escolasParticipantes.length)}, 1fr)`,
                          gap: "12px 32px",
                          fontSize: presentation19CoverSchoolListFontPx(deckData.escolasParticipantes.length),
                          fontWeight: 900,
                          lineHeight: 1.35,
                          fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                        }}
                      >
                        {deckData.escolasParticipantes.map((nome) => (
                          <div key={nome} style={{ breakInside: "avoid" }}>
                            • {nome}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {slide.kind === "metric-total-students" && (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
                  <div style={{ fontSize: P19_METRIC_HEADER_PX, fontWeight: 800, color: P19_TEXT_MUTED, letterSpacing: 0.4 }}>MÉTRICA GERAL</div>
                  <div style={{ fontSize: P19_METRIC_NUMBER_PX, fontWeight: 900, color: rgbCss(deckData.primaryColor), lineHeight: 1.05 }}>
                    {Math.round(deckData.totalAlunosParticiparam).toLocaleString("pt-BR")}
                  </div>
                  <div style={{ fontSize: P19_METRIC_HEADER_PX, fontWeight: 600, color: P19_TEXT_BASE, textAlign: "center", maxWidth: 720, lineHeight: 1.25 }}>
                    Alunos que realizaram a avaliação
                  </div>
                </div>
              )}
              {slide.kind === "cover-segment" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
                  <Title text="CAPA DE SEGMENTO" primaryColor={deckData.primaryColor} />
                  <div style={{ background: P19_SURFACE_CARD, border: `1px solid ${P19_BORDER_SOFT}`, borderRadius: 16, padding: 24 }}>
                    <div style={{ fontSize: P19_SEGMENT_FIELD_LABEL_PX, fontWeight: 700, color: P19_TEXT_MUTED }}>CURSO</div>
                    <div style={{ fontSize: P19_SEGMENT_FIELD_VALUE_PX, fontWeight: 900, color: P19_TEXT_STRONG }}>{deckData.curso}</div>
                    <div style={{ marginTop: 24, fontSize: P19_SEGMENT_FIELD_LABEL_PX, fontWeight: 700, color: P19_TEXT_MUTED }}>SÉRIE</div>
                    <div style={{ fontSize: P19_SEGMENT_FIELD_VALUE_PX, fontWeight: 900, color: P19_TEXT_STRONG }}>{deckData.serie}</div>
                    {deckData.turno?.trim() ? (
                      <>
                        <div style={{ marginTop: 24, fontSize: P19_SEGMENT_FIELD_LABEL_PX, fontWeight: 700, color: P19_TEXT_MUTED }}>TURNO</div>
                        <div style={{ fontSize: P19_SEGMENT_FIELD_VALUE_PX, fontWeight: 900, color: P19_TEXT_STRONG }}>{deckData.turno}</div>
                      </>
                    ) : null}
                    {deckData.comparisonAxis !== "escola" ? (
                      <>
                        <div style={{ marginTop: 24, fontSize: P19_SEGMENT_FIELD_LABEL_PX, fontWeight: 700, color: P19_TEXT_MUTED }}>
                          {deckData.turmasParticipantesCapa.length > 1 ? "TURMAS" : "TURMA"}
                        </div>
                        {deckData.turmasParticipantesCapa.length > 8 ? (
                          <ul
                            style={{
                              margin: "8px 0 0",
                              paddingLeft: 22,
                              fontSize: 20,
                              fontWeight: 800,
                              lineHeight: 1.45,
                              maxHeight: 280,
                              overflow: "auto",
                            }}
                          >
                            {deckData.turmasParticipantesCapa.map((t) => (
                              <li key={t}>{t}</li>
                            ))}
                          </ul>
                        ) : (
                          <div
                            style={{
                              fontSize: deckData.turma.length > 120 ? 22 : 34,
                              fontWeight: 900,
                              lineHeight: 1.25,
                              wordBreak: "break-word",
                            }}
                          >
                            {deckData.turma}
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              )}
              {(slide.kind === "presence-table" ||
                slide.kind === "levels-table" ||
                slide.kind === "proficiency-general-table" ||
                slide.kind === "grades-table" ||
                slide.kind === "questions-table") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <Title
                      text={
                        slide.kind === "presence-table"
                          ? presentationTitleTablePresence(deckData.comparisonAxis)
                          : slide.kind === "levels-table"
                            ? niveisAprendizagemTituloPorEixo(deckData.comparisonAxis)
                            : slide.kind === "proficiency-general-table"
                              ? presentationTitleTableProficiency(deckData.comparisonAxis)
                              : slide.kind === "grades-table"
                              ? presentationTitleTableGrades(deckData.comparisonAxis)
                              : slide.questionsSubsection?.kind === "geral"
                                ? "TABELA DE QUESTÕES — GERAL"
                                : slide.questionsSubsection?.kind === "serie-geral"
                                  ? presentationTitleQuestionsSerieGeral(slide.questionsSubsection.serieLabel)
                                  : slide.questionsSubsection?.kind === "turma"
                                    ? `TABELA DE QUESTÕES — TURMA ${slide.questionsSubsection.turmaNome}`
                                    : "TABELA DE QUESTÕES"
                      }
                      subtitle={slide.kind === "levels-table" && slide.escolaNome ? slide.escolaNome : undefined}
                      primaryColor={deckData.primaryColor}
                    />
                    </div>
                    {slide.kind === "questions-table" &&
                      slide.questionsPage != null &&
                      slide.questionsPage.total > 1 && (
                        <div style={{ fontSize: P19_PAGE_INDICATOR_FONT_PX, fontWeight: 700, color: "#52525B", flexShrink: 0 }}>
                          Página {slide.questionsPage.current}/{slide.questionsPage.total}
                        </div>
                      )}
                  </div>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      background: "#FCFCFD",
                      border: `1px solid ${P19_BORDER_SOFT}`,
                      borderRadius: 12,
                      overflow: "hidden",
                    }}
                  >
                    <thead>
                      <tr>
                        {slide.table.columns.map((c, cIdx) => {
                          const levelHdr =
                            slide.kind === "levels-table" && cIdx >= 1 && cIdx <= 4
                              ? {
                                  background: `#${P19_LEVELS_TABLE_LEVEL_HEADER_BG_HEX[cIdx - 1]}`,
                                  color: "#F8FAFC",
                                }
                              : { background: P19_BORDER_SOFT, color: P19_TEXT_BASE };
                          return (
                            <th
                              key={`${c}-${cIdx}`}
                              style={{
                                border: `1px solid ${P19_BORDER_SOFT}`,
                                textAlign: tableCellTextAlign(slide.kind, cIdx),
                                padding: P19_TABLE_CELL_PADDING_PX,
                                fontSize: P19_TABLE_CELL_FONT_PX,
                                ...levelHdr,
                              }}
                            >
                              {c}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {slide.table.rows.map((r, idx) => {
                        const isTotalRow =
                          slide.kind === "levels-table" && String(r[0] ?? "") === "TOTAL GERAL";
                        const questionRowStyle =
                          slide.kind === "questions-table" && slide.questionRowLevels?.[idx]
                            ? P19_QUESTION_NUM_LEVEL_STYLE[slide.questionRowLevels[idx]]
                            : null;
                        const presencePctRow =
                          slide.kind === "presence-table" ? slide.presencePctValues?.[idx] : undefined;
                        const rowBg = isTotalRow
                          ? "#E2E8F0"
                          : idx % 2 === 0
                            ? "#FCFCFD"
                            : "#F1F5F9";
                        return (
                        <tr
                          key={idx}
                          style={{
                            background: questionRowStyle?.bg ?? (isTotalRow ? "#E2E8F0" : idx % 2 === 0 ? "#FCFCFD" : "#F1F5F9"),
                          }}
                        >
                          {r.map((cell, cIdx) => {
                            const cellText = String(cell);
                            const presenceCellStyle =
                              slide.kind === "presence-table" &&
                              cIdx === 3 &&
                              presencePctRow != null &&
                              Number.isFinite(presencePctRow)
                                ? presenceTablePctCellColors(presencePctRow)
                                : null;
                            return (
                            <td
                              key={cIdx}
                              style={{
                                border: `1px solid ${P19_BORDER_SOFT}`,
                                padding: P19_TABLE_CELL_PADDING_PX,
                                fontSize:
                                  slide.kind === "questions-table" && cIdx === 2 ? P19_TABLE_QUESTIONS_DESC_FONT_PX : P19_TABLE_CELL_FONT_PX,
                                textAlign: tableCellTextAlign(slide.kind, cIdx),
                                background: presenceCellStyle?.background ?? questionRowStyle?.bg ?? rowBg,
                                color: presenceCellStyle?.color ?? questionRowStyle?.color ?? P19_TEXT_STRONG,
                                fontWeight: isTotalRow || presenceCellStyle ? 800 : questionRowStyle ? 700 : undefined,
                              }}
                            >
                              {cellText}
                            </td>
                          );
                          })}
                        </tr>
                      );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {slide.kind === "presence-chart" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <Title
                    text={presentationTitleChartPresence(deckData.comparisonAxis)}
                    subtitle={P19_CHART_SUBTITLE_PRESENCE}
                    primaryColor={deckData.primaryColor}
                  />
                  <BarChartPreview chart={slide.chart} />
                </div>
              )}
              {slide.kind === "levels-chart" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <Title
                    text={presentationTitleChartLevels(deckData.comparisonAxis)}
                    subtitle={slide.escolaNome}
                    primaryColor={deckData.primaryColor}
                  />
                  <div
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      paddingLeft: P19_TITLE_TEXT_OFFSET_X_PX,
                      paddingRight: P19_TITLE_TEXT_OFFSET_X_PX,
                    }}
                  >
                    <BarChartPreview chart={slide.chart} />
                  </div>
                </div>
              )}
              {slide.kind === "section-levels" && (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Title
                    text={presentationSectionLevels(deckData.comparisonAxis)}
                    subtitle={presentationSectionLevelsTagline(deckData.comparisonAxis)}
                    primaryColor={deckData.primaryColor}
                  />
                </div>
              )}
              {slide.kind === "levels-guide" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <Title text="GUIA DE NÍVEIS DE APRENDIZAGEM" primaryColor={deckData.primaryColor} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {deckData.levelGuide.map((lvl, idx) => (
                      <div
                        key={idx}
                        style={{
                          border: `1px solid ${P19_BORDER_NEUTRAL}`,
                          borderRadius: 12,
                          padding: "16px 18px",
                          background: P19_SURFACE_CARD,
                          borderLeftWidth: 6,
                          borderLeftColor: lvl.color,
                        }}
                      >
                        <div style={{ fontSize: P19_LEVELS_GUIDE_TITLE_PX, fontWeight: 900, color: lvl.color, letterSpacing: 0.3 }}>{lvl.label}</div>
                        <div style={{ marginTop: 10, fontSize: P19_LEVELS_GUIDE_DESC_PX, color: P19_TEXT_BASE, lineHeight: 1.55, maxWidth: 980 }}>
                          {lvl.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {slide.kind === "section-grades" && (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Title
                    text={presentationSectionGrades(deckData.comparisonAxis)}
                    subtitle={presentationSectionGradesTagline(deckData.comparisonAxis)}
                    primaryColor={deckData.primaryColor}
                  />
                </div>
              )}
              {slide.kind === "grades-no-turma-notice" && (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 32,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      maxWidth: 880,
                      textAlign: "center",
                      fontSize: 20,
                      fontWeight: 800,
                      lineHeight: 1.5,
                      color: "#B45309",
                    }}
                  >
                    {PRESENTATION19_GRADES_NO_TURMA_NOTICE}
                  </p>
                </div>
              )}
              {slide.kind === "grades-chart" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <Title
                    text={presentationTitleChartGrades(deckData.comparisonAxis)}
                    subtitle={[slide.escolaNome, P19_CHART_SUBTITLE_GRADES].filter(Boolean).join(" • ")}
                    primaryColor={deckData.primaryColor}
                  />
                  <BarChartPreview chart={slide.chart} />
                </div>
              )}
              {slide.kind === "grades-by-discipline-chart" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Title
                    text={presentationTitleGradesByDiscipline(deckData.comparisonAxis)}
                    subtitle={slide.escolaNome}
                    primaryColor={deckData.primaryColor}
                  />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr",
                      gap: 14,
                      width: "100%",
                      boxSizing: "border-box",
                      paddingLeft: P19_TITLE_TEXT_OFFSET_X_PX,
                    }}
                  >
                    {slide.charts.map((entry, chartIdx) => (
                      <div
                        key={`${entry.title}-${chartIdx}`}
                        style={{
                          border: `1px solid ${P19_BORDER_NEUTRAL}`,
                          borderRadius: 12,
                          padding: 10,
                          background: P19_SURFACE_CARD,
                          display: "flex",
                          flexDirection: "column",
                          minHeight: 0,
                        }}
                      >
                        <div
                          style={{
                            fontSize: P19_PROFICIENCY_DISC_CARD_TITLE_PX,
                            fontWeight: 900,
                            color: P19_TEXT_STRONG,
                            marginBottom: 8,
                            lineHeight: 1.2,
                            wordBreak: "break-word",
                            minHeight: 44,
                            maxHeight: 44,
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical" as const,
                          }}
                        >
                          {entry.title}
                        </div>
                        <div style={{ flex: 1, minHeight: 0 }}>
                          <BarChartPreview chart={entry.chart} height={380} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {slide.kind === "section-proficiency" && (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Title
                    text={presentationSectionProficiency(deckData.comparisonAxis)}
                    subtitle={presentationSectionProficiencyTagline(deckData.comparisonAxis)}
                    primaryColor={deckData.primaryColor}
                  />
                </div>
              )}
              {slide.kind === "proficiency-general-chart" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <Title
                    text={presentationTitleProficiencyGeneralChart(deckData.comparisonAxis)}
                    subtitle={[slide.escolaNome, P19_CHART_SUBTITLE_PROFICIENCY].filter(Boolean).join(" • ")}
                    primaryColor={deckData.primaryColor}
                  />
                  <div
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      paddingLeft: P19_TITLE_TEXT_OFFSET_X_PX,
                    }}
                  >
                    <BarChartPreview chart={slide.chart} />
                  </div>
                </div>
              )}
              {slide.kind === "proficiency-by-discipline-chart" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Title
                    text={presentationTitleProficiencyByDiscipline(deckData.comparisonAxis)}
                    subtitle={slide.escolaNome}
                    primaryColor={deckData.primaryColor}
                  />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr",
                      gap: 14,
                      width: "100%",
                      boxSizing: "border-box",
                      paddingLeft: P19_TITLE_TEXT_OFFSET_X_PX,
                    }}
                  >
                    {slide.charts.map((entry, chartIdx) => (
                      <div
                        key={`${entry.title}-${chartIdx}`}
                        style={{
                          border: `1px solid ${P19_BORDER_NEUTRAL}`,
                          borderRadius: 12,
                          padding: 10,
                          background: P19_SURFACE_CARD,
                          display: "flex",
                          flexDirection: "column",
                          minHeight: 0,
                        }}
                      >
                        <div
                          style={{
                            fontSize: P19_PROFICIENCY_DISC_CARD_TITLE_PX,
                            fontWeight: 900,
                            color: P19_TEXT_STRONG,
                            marginBottom: 8,
                            lineHeight: 1.2,
                            wordBreak: "break-word",
                            minHeight: 44,
                            maxHeight: 44,
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical" as const,
                          }}
                        >
                          {entry.title}
                        </div>
                        <div style={{ flex: 1, minHeight: 0 }}>
                          <BarChartPreview chart={entry.chart} height={380} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {slide.kind === "section-questions" && (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Title
                    text={presentationSectionQuestionsTitle()}
                    subtitle={presentationSectionQuestionsTagline()}
                    primaryColor={deckData.primaryColor}
                  />
                </div>
              )}
              {slide.kind === "questions-accuracy-chart" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                      <Title text="PORCENTAGEM DE ACERTOS" primaryColor={deckData.primaryColor} />
                    </div>
                    {slide.accuracyPage != null && slide.accuracyPage.total > 1 && (
                      <div style={{ fontSize: P19_PAGE_INDICATOR_FONT_PX, fontWeight: 700, color: P19_TEXT_MUTED, flexShrink: 0 }}>
                        Página {slide.accuracyPage.current}/{slide.accuracyPage.total}
                      </div>
                    )}
                  </div>
                  <BarChartPreview chart={slide.chart} />
                </div>
              )}
              {slide.kind === "dynamic-series-cover" && (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: P19_DYNAMIC_COVER_PX, fontWeight: 900, color: rgbCss(deckData.primaryColor) }}>
                  [{deckData.serieNomeCapas}]
                </div>
              )}
              {slide.kind === "dynamic-class-cover" && (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: P19_DYNAMIC_COVER_PX, fontWeight: 900, color: rgbCss(deckData.primaryColor) }}>
                  [{deckData.turmaNomeCapas}]
                </div>
              )}
              {slide.kind === "questions-turma-cover" && (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 48px",
                    textAlign: "center",
                    fontSize: slide.serieLabel.length + slide.turmaNome.length > 80 ? 26 : 34,
                    fontWeight: 900,
                    lineHeight: 1.35,
                    color: rgbCss(deckData.primaryColor),
                    wordBreak: "break-word",
                  }}
                >
                  {presentationQuestionsTurmaCoverLine(slide.serieLabel, slide.turmaNome)}
                </div>
              )}
              {slide.kind === "thank-you" && (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: P19_THANK_YOU_FONT_PX,
                    fontWeight: 900,
                    color: rgbCss(deckData.primaryColor),
                    letterSpacing: 0.5,
                  }}
                >
                  {deckData.closingMessage ?? "Obrigado!!"}
                </div>
              )}
            </div>
            {deckData.footerText?.trim() ? (
              <div
                style={{
                  position: "absolute",
                  left: 32,
                  right: 32,
                  bottom: 10,
                  textAlign: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  color: P19_TEXT_MUTED,
                  lineHeight: 1.35,
                  zIndex: 1,
                }}
              >
                {deckData.footerText.trim()}
              </div>
            ) : null}
          </div>
  );
});

export const Presentation19NativePreviewDeck = forwardRef<Presentation19NativePreviewDeckHandle, Props>(
  function Presentation19NativePreviewDeck({ deckData, spec: specProp }, ref) {
  const spec = useMemo(() => specProp ?? buildSlideSpec(deckData), [deckData, specProp]);
  const total = spec.slides.length;
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fsIndex, setFsIndex] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const exitPresentation = useCallback(() => {
    setFullscreenOpen(false);
    exitBrowserFullscreen();
  }, []);

  const openFullscreen = useCallback(() => {
    if (total === 0) return;
    setFsIndex(0);
    requestBrowserFullscreen();
    setFullscreenOpen(true);
  }, [total]);

  useImperativeHandle(
    ref,
    () => ({
      openFullscreen,
    }),
    [openFullscreen]
  );

  useLayoutEffect(() => {
    if (!fullscreenOpen || !stageRef.current) return;
    const run = () => {
      const el = stageRef.current;
      if (!el) return;
      const pw = el.clientWidth;
      const ph = el.clientHeight;
      // Sem teto em 1: em tela cheia o slide deve ampliar para caber no viewport (projeção).
      setScale(Math.min(pw / page.width, ph / page.height));
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [fullscreenOpen, fsIndex]);

  useEffect(() => {
    const onFsChange = () => {
      if (!getFullscreenElement()) {
        setFullscreenOpen(false);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!fullscreenOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        exitPresentation();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        setFsIndex((i) => Math.min(total - 1, i + 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        setFsIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setFsIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setFsIndex(Math.max(0, total - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exitPresentation, fullscreenOpen, total]);

  useEffect(() => {
    setFsIndex((i) => Math.min(i, Math.max(0, total - 1)));
  }, [total]);

  const safeFsIndex = Math.min(fsIndex, Math.max(0, total - 1));
  const currentFsSlide = total > 0 ? spec.slides[safeFsIndex] : undefined;

  return (
    <>
      <div data-presentation19-native-root style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {spec.slides.map((slide) => (
          <div
            key={`${slide.kind}-${slide.index}`}
            data-slide-index={slide.index}
            style={{
              contentVisibility: "auto",
              containIntrinsicSize: `${page.height}px`,
            }}
          >
            <NativeSlideFrame slide={slide} deckData={deckData} />
          </div>
        ))}
      </div>
      {fullscreenOpen && currentFsSlide
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-black">
              <div ref={stageRef} className="flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden">
                <div
                  style={{
                    width: page.width,
                    height: page.height,
                    transform: `scale(${scale})`,
                    transformOrigin: "center center",
                  }}
                >
                  <NativeSlideFrame slide={currentFsSlide} deckData={deckData} />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
});
