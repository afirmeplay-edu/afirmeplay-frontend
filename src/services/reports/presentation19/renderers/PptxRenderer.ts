import PptxGenJS from "pptxgenjs";
import type { ExportChart, Presentation19ExportSpec, Presentation19SlideSpec } from "@/types/presentation19-export-spec";
import type { Presentation19DeckData } from "@/types/presentation19-slides";
import { P19_QUESTION_NUM_LEVEL_STYLE } from "@/utils/reports/presentation19/questionAcertoLevel";
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
  presentationTitleTablePresence,
  niveisAprendizagemTituloPorEixo,
  P19_LEVELS_TABLE_LEVEL_HEADER_BG_HEX,
  presentationQuestionsTurmaCoverLine,
  presentationTitleQuestionsSerieGeral,
} from "@/utils/reports/presentation19/presentationScope";
import {
  P19_CHART_AXIS_TICK_PX,
  P19_CHART_BAR_VALUE_TOP_PX,
  P19_CHART_CATEGORY_LABEL_PX,
  P19_CHART_H_BAR_LABEL_PX,
  P19_CHART_H_BAR_VALUE_PX,
  P19_CHART_REF_H_PX,
  P19_CHART_REF_W_PX,
  P19_CHART_SUBTITLE_GRADES,
  P19_CHART_SUBTITLE_PRESENCE,
  P19_CHART_SUBTITLE_PROFICIENCY,
  P19_COVER_MAIN_LABEL_PX,
  P19_COVER_MAIN_TITLE_PX,
  P19_COVER_MAIN_VALUE_PX,
  P19_COVER_SUBTITLE_FONT_PX,
  P19_COVER_SCHOOL_LIST_LARGE_PX,
  P19_COVER_SCHOOL_LIST_SMALL_PX,
  P19_COVER_SCHOOL_MULTI_HEADER_PX,
  P19_COVER_SCHOOL_SINGLE_PX,
  P19_CONTENT,
  P19_DYNAMIC_COVER_PX,
  P19_HORIZONTAL_CHART_LABEL_WIDTH_PX,
  P19_LEVELS_GUIDE_DESC_PX,
  P19_LEVELS_GUIDE_TITLE_PX,
  P19_METRIC_HEADER_PX,
  P19_METRIC_NUMBER_PX,
  P19_PAGE,
  P19_PAGE_INDICATOR_FONT_PX,
  P19_PROFICIENCY_DISC_CARD_TITLE_PX,
  P19_SECTION_TAGLINE_PX,
  P19_SECTION_TITLE_TAGLINE_GAP_PX,
  P19_SEGMENT_FIELD_LABEL_PX,
  P19_SEGMENT_FIELD_VALUE_PX,
  P19_SUBTITLE_FONT_PX,
  P19_TABLE_CELL_FONT_PX,
  P19_TABLE_CELL_PADDING_PX,
  P19_TABLE_QUESTIONS_DESC_FONT_PX,
  P19_THANK_YOU_FONT_PX,
  P19_TITLE_ACCENT_H_PX,
  P19_TITLE_ACCENT_W_PX,
  P19_TITLE_FONT_PX,
  P19_TITLE_TEXT_OFFSET_X_PX,
  p19PdfLineHeightPx,
  p19PxToPtForPptx,
  p19PxToSlideInX,
  p19PxToSlideInY,
} from "@/utils/reports/presentation19/presentation19ExportTypography";
import {
  p19AccuracyChartRectPx,
  p19ChartAreaTopPxAfterTitle,
  p19ContentBoxInches,
  p19ContentWidthInches,
  p19FullWidthBarChartRectPx,
  p19LevelsGuideCardBorderHex,
  p19LevelsGuideCardFillHex,
  p19ProficiencyGeneralBarChartRectPx,
  p19RectPxToSlideInches,
  p19StandardBarChartRectPx,
  p19TableStartYAfterTitleBlockPx,
  P19_LEVELS_GUIDE_FIRST_ROW_TOP_PX,
  P19_LEVELS_GUIDE_ROW_STRIDE_PX,
  P19_LEVELS_GUIDE_CARD_RADIUS_PX,
  P19_QUESTIONS_PAGE_INDICATOR_RIGHT_PAD_PX,
  P19_SECTION_CENTER_VERTICAL_OFFSET_PX,
  P19_SLIDE_FOOTER_RESERVE_PX,
  P19_SLIDE_TITLE_FIRST_LINE_TOP_PX,
  P19_TITLE_TO_SUBTITLE_GAP_PX,
  P19_CHART_V_BAR_TOP_PAD_PX,
  P19_CHART_V_BAR_VALUE_LABEL_RESERVE_PX,
  P19_DECK_LOGO_H_PX,
  P19_DECK_LOGO_RIGHT_MARGIN_PX,
  P19_DECK_LOGO_TOP_PX,
  P19_DECK_LOGO_W_PX,
} from "@/utils/reports/presentation19/presentation19Layout";
import {
  presenceTablePctCellColors,
  presentation19CoverSchoolColumnCount,
  presentation19CoverSchoolListFontPx,
  PRESENTATION19_GRADES_NO_TURMA_NOTICE,
  resolvePresentation19BarTopLabel,
} from "@/utils/reports/presentation19/presentation19Labels";
import { resolveMunicipalReferenceXRatios } from "@/utils/reports/presentation19/municipalReferenceLine";
import { resolveP19VerticalBarColumnSlot } from "@/utils/reports/presentation19/presentation19VerticalBarLayout";

type RenderPptxArgs = {
  spec: Presentation19ExportSpec;
  fileName: string;
};

type PptxPresentation = InstanceType<typeof PptxGenJS>;

function hexNoHash(hex: string): string {
  return hex.replace("#", "").toUpperCase();
}

/** Mesmas proporções do `PdfRenderer.drawBarChart`. */
const PDF_CHART_REF_W = P19_CHART_REF_W_PX;
const PDF_CHART_REF_H = P19_CHART_REF_H_PX;

function resolveGridTicks(chart: ExportChart, axisMin: number, maxValue: number): number[] {
  const fromSpec = chart.yAxis?.ticks?.length
    ? chart.yAxis.ticks
    : Array.from({ length: 5 }, (_, i) => axisMin + ((maxValue - axisMin) * i) / 4);
  return fromSpec
    .filter((v, idx, arr) => Number.isFinite(v) && v >= axisMin && v <= maxValue && arr.indexOf(v) === idx)
    .sort((a, b) => a - b);
}

function formatAxisTick(tick: number): string {
  if (!Number.isFinite(tick)) return "0,0";
  return Number(tick).toFixed(1).replace(".", ",");
}

function formatBarValueLabel(value: number, serieLabel?: string): string {
  if (!Number.isFinite(value)) return "0,0";
  const wantsPct = String(serieLabel ?? "").includes("%");
  const isInt = Math.abs(value - Math.round(value)) < 1e-9;
  if (!wantsPct && isInt) return String(Math.round(value));
  const base = Number(value).toFixed(1).replace(".", ",");
  return wantsPct ? `${base}%` : base;
}

function wrapTextBySpacesForPptx(text: string, maxCharsPerLine: number): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  const maxC = Math.max(8, Math.min(26, Math.floor(maxCharsPerLine)));
  const words = t.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) {
      cur = w;
      continue;
    }
    if ((cur + " " + w).length <= maxC) {
      cur = cur + " " + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

function approxMaxCharsForWidth(innerWIn: number, fontSizePt: number): number {
  // Aproximação conservadora: largura média de caractere ~0,55em.
  const pts = Math.max(1, innerWIn * 72);
  return Math.floor(pts / Math.max(8, fontSizePt) / 0.55);
}

/** Evita sobreposição de rótulos quando a área útil do gráfico é pequena (mini-gráficos PPTX). */
function selectTicksEvenly(ticks: number[], chartSpanIn: number, minPitchIn: number, hardCap: number): number[] {
  const maxLabels = Math.max(2, Math.min(hardCap, Math.floor(chartSpanIn / minPitchIn)));
  if (ticks.length <= maxLabels) return ticks;
  const picked: number[] = [];
  for (let i = 0; i < maxLabels; i++) {
    const idx = Math.round((i * (ticks.length - 1)) / Math.max(1, maxLabels - 1));
    picked.push(ticks[idx]);
  }
  return [...new Set(picked)].sort((a, b) => a - b);
}

/**
 * Espelha `PdfRenderer.drawBarChart` / `drawHorizontalBarChart` (fundo branco, grade, barras como shapes).
 */
function drawPdfAlignedBarChart(slide: PptxGenJS.Slide, chart: ExportChart, box: { x: number; y: number; w: number; h: number }, pptx: PptxPresentation): void {
  const palette = ["#3B82F6", "#22C55E", "#F97316", "#A855F7", "#EF4444", "#06B6D4", "#EAB308", "#14B8A6"];

  if (!chart.valueKeys.length || !chart.data.length) return;

  const xScale = (px: number) => (px / PDF_CHART_REF_W) * box.w;
  const yScale = (py: number) => (py / PDF_CHART_REF_H) * box.h;

  if (chart.orientation === "horizontal") {
    const topPad = yScale(8);
    const bottomPad = yScale(38);
    const leftLabelW = Math.max(xScale(P19_HORIZONTAL_CHART_LABEL_WIDTH_PX), 0.7);
    const plotTop = box.y + topPad;
    const plotBottom = box.y + box.h - bottomPad;
    const plotH = plotBottom - plotTop;
    const baselineX = box.x + leftLabelW;
    const plotRight = box.x + box.w - xScale(10);
    const chartAreaW = Math.max(0.15, plotRight - baselineX);
    const padX6 = xScale(6);
    const padX10 = xScale(10);

    const rawMax = Math.max(1, ...chart.data.flatMap((d) => chart.valueKeys.map((s) => Number(d[s.key] ?? 0))));
    const axisMin = Number.isFinite(chart.yAxis?.min) ? Number(chart.yAxis?.min) : 0;
    const axisMax = Number.isFinite(chart.yAxis?.max) ? Number(chart.yAxis?.max) : Math.max(1, Math.ceil(rawMax * 1.15));
    const maxValue = Math.max(axisMin + 1, axisMax);
    const serie = chart.valueKeys[0];

    const n = Math.max(1, chart.data.length);
    const rowH = plotH / n;
    chart.data.forEach((row, idx) => {
      const value = Number(row[serie.key] ?? 0);
      const barW = (Math.max(0, value - axisMin) / (maxValue - axisMin)) * chartAreaW;
      const rowCenterY = plotTop + (idx + 0.5) * rowH;
      const barThickness = Math.min(yScale(34), rowH * 0.55);
      const barY = rowCenterY - barThickness / 2;
      const barColor = String(row.color ?? palette[idx % palette.length] ?? serie.color);
      slide.addShape(pptx.ShapeType.rect, {
        x: baselineX,
        y: barY,
        w: Math.max(0.01, barW),
        h: barThickness,
        fill: { color: hexNoHash(barColor) },
        line: { color: hexNoHash(barColor), pt: 0 },
      });
      const catFontPt = p19PxToPtForPptx(P19_CHART_H_BAR_LABEL_PX);
      const maxChars = approxMaxCharsForWidth(Math.max(0.35, leftLabelW - padX10), catFontPt);
      slide.addText(wrapTextBySpacesForPptx(String(row[chart.categoryKey] ?? ""), maxChars), {
        x: box.x + padX6,
        y: barY - yScale(2),
        w: Math.max(0.35, leftLabelW - padX10),
        h: barThickness + yScale(6),
        fontSize: catFontPt,
        color: "334155",
        align: "left",
        valign: "middle",
        wrap: true,
      });
      const valW = Math.max(0.48, xScale(52));
      slide.addText(formatBarValueLabel(value, serie.label), {
        x: baselineX + barW + Math.max(0.04, padX6 * 0.92),
        y: barY,
        w: valW,
        h: Math.max(barThickness, 0.16),
        fontSize: p19PxToPtForPptx(P19_CHART_H_BAR_VALUE_PX),
        bold: true,
        color: "0F172A",
        valign: "middle",
        wrap: false,
      });
    });
    return;
  }

  const barsStartX = box.x + xScale(8);
  const barsW = Math.max(0.35, box.x + box.w - barsStartX - xScale(10));
  const topPad = yScale(P19_CHART_V_BAR_TOP_PAD_PX + P19_CHART_V_BAR_VALUE_LABEL_RESERVE_PX);
  /**
   * Em caixas pequenas (ex.: proficiência por disciplina), só `yScale(34)` deixa a faixa de rótulos
   * microscopic — preview reserva ~30px de linha + padding (`LABEL_ROW_H` + padding).
   * Garantimos altura mínima em polegadas para rótulos 10–11px legíveis e negrito.
   */
  const bottomPadIn = Math.max(0.6, yScale(42));
  const baselineY = box.y + box.h - bottomPadIn;
  const chartAreaH = Math.max(0.12, baselineY - (box.y + topPad));
  const isStacked = chart.type === "stackedBar";
  const rawMax = Math.max(1, ...chart.data.flatMap((d) => chart.valueKeys.map((s) => Number(d[s.key] ?? 0))));
  const axisMin = Number.isFinite(chart.yAxis?.min) ? Number(chart.yAxis?.min) : 0;
  const axisMax = Number.isFinite(chart.yAxis?.max) ? Number(chart.yAxis?.max) : Math.max(1, Math.ceil(rawMax * 1.15));
  const maxValue = Math.max(axisMin + 1, axisMax);
  const categories = chart.data.map((d) => String(d[chart.categoryKey] ?? ""));
  const barCount = Math.max(1, categories.length);
  const hasMultipleSeries = chart.valueKeys.length > 1;

  const catY = box.y + box.h - bottomPadIn + 0.04;
  const catH = Math.max(0.5, bottomPadIn - 0.08);

  chart.data.forEach((row, idx) => {
    const slotPx = resolveP19VerticalBarColumnSlot(0, PDF_CHART_REF_W, idx, barCount);
    const colWidth = (slotPx.colWidth / PDF_CHART_REF_W) * barsW;
    const slotX = barsStartX + idx * colWidth;
    const innerW = Math.max(0.02, colWidth * (slotPx.innerW / slotPx.colWidth));
    const barW = Math.max(0.02, Math.min(xScale(34), innerW * 0.88));
    const barX = slotX + (colWidth - barW) / 2;
    const labelCx = slotX + colWidth / 2;

    if (hasMultipleSeries && !isStacked) {
      const gapIn = Math.min(xScale(8), Math.max(0.02, innerW * 0.12));
      const seriesW = Math.max(
        0.02,
        Math.min(xScale(22), (innerW - gapIn * (chart.valueKeys.length - 1)) / chart.valueKeys.length)
      );
      const groupW = chart.valueKeys.length * seriesW + gapIn * (chart.valueKeys.length - 1);
      const groupX = slotX + (colWidth - groupW) / 2;
      chart.valueKeys.forEach((s, sIdx) => {
        const value = Number(row[s.key] ?? 0);
        const barH = (Math.max(0, value - axisMin) / (maxValue - axisMin)) * chartAreaH;
        const barY = baselineY - barH;
        const seriesBarX = groupX + sIdx * (seriesW + gapIn);
        slide.addShape(pptx.ShapeType.roundRect, {
          x: seriesBarX,
          y: barY,
          w: seriesW,
          h: barH,
          fill: { color: hexNoHash(s.color) },
          line: { color: hexNoHash(s.color), pt: 0 },
          rectRadius: 0.06,
        });
        const valBoxW = Math.max(0.58, Math.min(seriesW + 0.26, colWidth));
        slide.addText(resolvePresentation19BarTopLabel(row, value, s.label), {
          x: seriesBarX + seriesW / 2 - valBoxW / 2,
          y: barY - yScale(16) + yScale(1),
          w: valBoxW,
          h: yScale(18),
          fontSize: p19PxToPtForPptx(P19_CHART_BAR_VALUE_TOP_PX),
          bold: true,
          color: "0F172A",
          align: "center",
          wrap: false,
        });
      });
    } else if (hasMultipleSeries && isStacked) {
      let currentTop = baselineY;
      let total = 0;
      chart.valueKeys.forEach((s) => {
        const value = Number(row[s.key] ?? 0);
        total += Math.max(0, value);
        const barH = (Math.max(0, value - axisMin) / (maxValue - axisMin)) * chartAreaH;
        const barY = currentTop - barH;
        slide.addShape(pptx.ShapeType.roundRect, {
          x: barX,
          y: barY,
          w: barW,
          h: barH,
          fill: { color: hexNoHash(s.color) },
          line: { color: hexNoHash(s.color), pt: 0 },
          rectRadius: 0.08,
        });
        currentTop = barY;
      });
      const totW = Math.max(0.58, Math.min(barW + 0.28, colWidth));
      slide.addText(resolvePresentation19BarTopLabel(row, total, chart.valueKeys[0]?.label), {
        x: labelCx - totW / 2,
        y: currentTop - yScale(17) + yScale(1),
        w: totW,
        h: yScale(18),
        fontSize: p19PxToPtForPptx(P19_CHART_BAR_VALUE_TOP_PX + 1),
        bold: true,
        color: "0F172A",
        align: "center",
        wrap: false,
      });
    } else {
      const s = chart.valueKeys[0];
      const value = Number(row[s.key] ?? 0);
      const barH = (Math.max(0, value - axisMin) / (maxValue - axisMin)) * chartAreaH;
      const barY = baselineY - barH;
      const barColor = String(row.color ?? palette[idx % palette.length] ?? s.color);
      slide.addShape(pptx.ShapeType.roundRect, {
        x: barX,
        y: barY,
        w: barW,
        h: barH,
        fill: { color: hexNoHash(barColor) },
        line: { color: hexNoHash(barColor), pt: 0 },
        rectRadius: 0.1,
      });
      const oneSerW = Math.max(0.62, Math.min(barW + 0.32, colWidth));
      slide.addText(resolvePresentation19BarTopLabel(row, value, s.label), {
        x: labelCx - oneSerW / 2,
        y: barY - yScale(17) + yScale(1),
        w: oneSerW,
        h: yScale(18),
        fontSize: p19PxToPtForPptx(P19_CHART_BAR_VALUE_TOP_PX),
        bold: true,
        color: "0F172A",
        align: "center",
        wrap: false,
      });
    }

    const catFontPt = Math.max(9.5, p19PxToPtForPptx(P19_CHART_CATEGORY_LABEL_PX));
    const maxChars = approxMaxCharsForWidth(innerW, catFontPt);
    slide.addText(wrapTextBySpacesForPptx(String(row[chart.categoryKey] ?? ""), maxChars), {
      x: slotX,
      y: catY,
      w: colWidth,
      h: catH,
      fontSize: catFontPt,
      bold: true,
      color: "334155",
      align: "center",
      valign: "top",
      wrap: true,
    });
  });

  if (chart.referenceLineY != null && Number.isFinite(chart.referenceLineY)) {
    const refVal = Number(chart.referenceLineY);
    const refY = baselineY - ((Math.max(0, refVal - axisMin) / (maxValue - axisMin)) * chartAreaH);
    const ratios = resolveMunicipalReferenceXRatios(chart);
    const lineX1 = ratios ? barsStartX + ratios.startRatio * barsW : barsStartX;
    const lineX2 = ratios ? barsStartX + ratios.endRatio * barsW : barsStartX + barsW;
    slide.addShape(pptx.ShapeType.line, {
      x: lineX1,
      y: refY,
      w: Math.max(0.01, lineX2 - lineX1),
      h: 0,
      line: { color: "64748B", width: 1.25, dashType: "dash" },
    });
  }
}

function drawFrame(slide: PptxGenJS.Slide, primaryColor: string, pptx: PptxPresentation): void {
  // Fundo totalmente branco (sem faixa superior).
  slide.background = { color: "FFFFFF" };
}

function drawDeckChromePptx(slide: PptxGenJS.Slide, deckData: Presentation19DeckData): void {
  const footer = deckData.footerText?.trim();
  if (footer) {
    slide.addText(footer, {
      x: 0.45,
      y: 6.92,
      w: 12.4,
      h: 0.48,
      fontSize: 9,
      color: "52525B",
      align: "center",
      valign: "bottom",
      wrap: true,
    });
  }
  const raw = deckData.logoDataUrl?.trim();
  if (!raw?.startsWith("data:image")) return;
  const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(raw);
  if (!m) return;
  try {
    const logoW = (P19_DECK_LOGO_W_PX / P19_PAGE.width) * 13.333;
    const logoH = (P19_DECK_LOGO_H_PX / P19_PAGE.height) * 7.5;
    const logoX = 13.333 - (P19_DECK_LOGO_RIGHT_MARGIN_PX / P19_PAGE.width) * 13.333 - logoW;
    const logoY = (P19_DECK_LOGO_TOP_PX / P19_PAGE.height) * 7.5;
    slide.addImage({
      data: m[2],
      x: logoX,
      y: logoY,
      w: logoW,
      h: logoH,
      sizing: { type: "contain", w: logoW, h: logoH },
    });
  } catch {
    /* ignore */
  }
}

function drawTitle(
  slide: PptxGenJS.Slide,
  title: string,
  primaryColor: string,
  pptx: PptxPresentation,
  subtitle?: string,
  titleMaxRightPadPx = 0
): void {
  const titleTopPx = P19_SLIDE_TITLE_FIRST_LINE_TOP_PX;
  const titleRightPx = P19_CONTENT.x + P19_CONTENT.w - titleMaxRightPadPx;
  const titleWIn = p19PxToSlideInX(titleRightPx) - p19PxToSlideInX(62);
  slide.addShape(pptx.ShapeType.roundRect, {
    x: p19PxToSlideInX(40),
    y: p19PxToSlideInY(titleTopPx),
    w: p19PxToSlideInX(P19_TITLE_ACCENT_W_PX),
    h: p19PxToSlideInY(P19_TITLE_ACCENT_H_PX),
    rectRadius: 0.06,
    fill: { color: hexNoHash(primaryColor) },
    line: { color: hexNoHash(primaryColor) },
  });
  slide.addText(title, {
    x: p19PxToSlideInX(62),
    y: p19PxToSlideInY(titleTopPx),
    w: titleWIn,
    h: subtitle ? 0.85 : 1.45,
    bold: true,
    fontSize: p19PxToPtForPptx(P19_TITLE_FONT_PX),
    color: "0F172A",
    wrap: true,
  });
  if (subtitle?.trim()) {
    const subTopPx = titleTopPx + p19PdfLineHeightPx(P19_TITLE_FONT_PX) + P19_TITLE_TO_SUBTITLE_GAP_PX;
    slide.addText(subtitle.trim(), {
      x: p19PxToSlideInX(40 + P19_TITLE_TEXT_OFFSET_X_PX),
      y: p19PxToSlideInY(subTopPx),
      w: titleWIn,
      h: 0.45,
      fontSize: p19PxToPtForPptx(P19_SUBTITLE_FONT_PX),
      bold: true,
      color: "52525B",
      wrap: true,
    });
  }
}

/** Espelha `PdfRenderer.drawCenteredSectionBlock` (slides section-*). */
function drawCenteredSectionPptx(slide: PptxGenJS.Slide, title: string, tagline: string | undefined, primaryColor: string): void {
  const maxWPx = P19_CONTENT.w - 80;
  const titleFsPt = p19PxToPtForPptx(P19_TITLE_FONT_PX);
  const tagFsPt = p19PxToPtForPptx(P19_SECTION_TAGLINE_PX);
  const titleLineH = p19PdfLineHeightPx(P19_TITLE_FONT_PX);
  const maxChars = approxMaxCharsForWidth((maxWPx / P19_PAGE.width) * 13.333, titleFsPt);
  const wrappedTitle = wrapTextBySpacesForPptx(title, maxChars);
  const titleLineCount = Math.max(1, wrappedTitle.split("\n").length);
  const yPx = P19_PAGE.height / 2 - P19_SECTION_CENTER_VERTICAL_OFFSET_PX - (titleLineCount * titleLineH) / 2;
  const yTopIn = p19PxToSlideInY(yPx);
  slide.addText(wrappedTitle, {
    x: p19PxToSlideInX(40),
    y: yTopIn,
    w: p19ContentWidthInches(),
    h: Math.min(2.6, 0.34 * titleLineCount + 0.35),
    align: "center",
    fontSize: titleFsPt,
    bold: true,
    color: hexNoHash(primaryColor),
    wrap: true,
  });
  if (tagline?.trim()) {
    const tagYpx = yPx + titleLineCount * titleLineH + P19_SECTION_TITLE_TAGLINE_GAP_PX;
    const tagWrapped = wrapTextBySpacesForPptx(tagline.trim(), maxChars);
    const tagLines = Math.max(1, tagWrapped.split("\n").length);
    slide.addText(tagWrapped, {
      x: p19PxToSlideInX(40),
      y: p19PxToSlideInY(tagYpx),
      w: p19ContentWidthInches(),
      h: Math.min(1.35, 0.4 * tagLines + 0.2),
      align: "center",
      fontSize: tagFsPt,
      color: "52525B",
      wrap: true,
    });
  }
}

function drawTable(
  slide: PptxGenJS.Slide,
  columns: string[],
  rows: Array<Array<string | number>>,
  startY = p19PxToSlideInY(p19TableStartYAfterTitleBlockPx(false, 1)),
  colWFrac?: number[],
  presencePctValues?: number[]
): void {
  const { x: tableX, w: totalW } = p19ContentBoxInches();
  const cellPad = P19_TABLE_CELL_PADDING_PX / 72;
  const rowHeadH = 0.42;
  const rowBodyH = 0.38;
  const rowHeights = [rowHeadH, ...rows.map(() => rowBodyH)];
  const tableH = rowHeights.reduce((sum, h) => sum + h, 0);
  const cellFs = p19PxToPtForPptx(P19_TABLE_CELL_FONT_PX);
  const classificationIdx = columns.findIndex((c) => String(c).toLowerCase().includes("classifica"));
  const classificationColor = (raw: string): string | null => {
    const n = String(raw ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (n.includes("abaixo")) return "EF4444";
    if (n.includes("basico")) return "FACC15";
    if (n.includes("adequado")) return "22C55E";
    if (n.includes("avan")) return "166534";
    return null;
  };
  const tableRows: PptxGenJS.TableRow[] = [
    columns.map((c, ci) => ({
      text: c,
      options: {
        bold: true,
        fontSize: cellFs,
        color: "334155",
        fill: { color: "E2E8F0" },
        margin: cellPad,
        align: ci === 0 ? "left" : "center",
        valign: "middle",
      },
    })),
    ...rows.map((r, ri) =>
      r.map((c, ci) => {
        const baseColor = "0F172A";
        const maybe = classificationIdx === ci ? classificationColor(String(c)) : null;
        const pct = ci === 3 ? presencePctValues?.[ri] : undefined;
        const pctStyle = pct != null && Number.isFinite(pct) ? presenceTablePctCellColors(pct) : null;
        return {
          text: String(c),
          options: {
            fontSize: cellFs,
            color: pctStyle ? pctStyle.color.replace("#", "") : maybe ?? baseColor,
            bold: Boolean(maybe || pctStyle),
            fill: {
              color: pctStyle ? pctStyle.background.replace("#", "") : ri % 2 === 0 ? "FCFCFD" : "F1F5F9",
            },
            margin: cellPad,
            align: ci === 0 ? "left" : "center",
            valign: "middle",
          },
        };
      })
    ),
  ] as PptxGenJS.TableRow[];
  const colW =
    colWFrac && colWFrac.length === columns.length
      ? colWFrac.map((f) => totalW * f)
      : columns.map(() => totalW / columns.length);
  slide.addTable(tableRows, {
    x: tableX,
    y: startY,
    w: totalW,
    h: tableH,
    rowH: rowHeights,
    border: { type: "solid", pt: 1, color: "E2E8F0" },
    colW,
  });
}

function drawQuestionsTable(
  slide: PptxGenJS.Slide,
  columns: string[],
  rows: Array<Array<string | number>>,
  questionRowLevels: Array<keyof typeof P19_QUESTION_NUM_LEVEL_STYLE | undefined> | undefined,
  startY = p19PxToSlideInY(p19TableStartYAfterTitleBlockPx(false, 1))
): void {
  const { x: tableX, w: totalW } = p19ContentBoxInches();
  const cellPad = P19_TABLE_CELL_PADDING_PX / 72;
  const rowHeadH = 0.45;
  const rowBodyH = 0.52;
  const rowHeights = [rowHeadH, ...rows.map(() => rowBodyH)];
  const tableH = rowHeights.reduce((sum, h) => sum + h, 0);
  const cellFs = p19PxToPtForPptx(P19_TABLE_CELL_FONT_PX);
  const descFs = p19PxToPtForPptx(P19_TABLE_QUESTIONS_DESC_FONT_PX);
  const colW =
    columns.length === 4
      ? [totalW * 0.09, totalW * 0.16, totalW * 0.58, totalW * 0.12]
      : columns.map(() => totalW / columns.length);
  const tableRows: PptxGenJS.TableRow[] = [
    columns.map((c, ci) => ({
      text: c,
      options: {
        bold: true,
        fontSize: cellFs,
        color: "334155",
        fill: { color: "E2E8F0" },
        margin: cellPad,
        align: ci === 0 || ci === 3 ? "center" : "left",
        valign: "middle",
      },
    })),
    ...rows.map((r, ri) =>
      r.map((c, ci) => {
        const baseColor = "0F172A";
        const zebra = ri % 2 === 0 ? "FCFCFD" : "F1F5F9";
        const fs = ci === 2 ? descFs : cellFs;
        if (questionRowLevels?.[ri]) {
          const st = P19_QUESTION_NUM_LEVEL_STYLE[questionRowLevels[ri]];
          return {
            text: String(c),
            options: {
              fontSize: fs,
              color: hexNoHash(st.color),
              bold: true,
              fill: { color: hexNoHash(st.bg) },
              margin: cellPad,
              align: ci === 0 || ci === 3 ? "center" : "left",
              valign: "middle",
            },
          };
        }
        return {
          text: String(c),
          options: {
            fontSize: fs,
            color: baseColor,
            fill: { color: zebra },
            margin: cellPad,
            align: ci === 0 || ci === 3 ? "center" : "left",
            valign: "middle",
          },
        };
      })
    ),
  ] as PptxGenJS.TableRow[];
  slide.addTable(tableRows, {
    x: tableX,
    y: startY,
    w: totalW,
    h: tableH,
    rowH: rowHeights,
    border: { type: "solid", pt: 1, color: "E2E8F0" },
    colW,
  });
}

function drawLevelsTable(
  slide: PptxGenJS.Slide,
  columns: string[],
  rows: Array<Array<string | number>>,
  startY = p19PxToSlideInY(p19TableStartYAfterTitleBlockPx(false, 1))
): void {
  const { x: tableX, w: totalW } = p19ContentBoxInches();
  const cellPad = P19_TABLE_CELL_PADDING_PX / 72;
  const rowHeadH = 0.42;
  const rowBodyH = 0.38;
  const rowHeights = [rowHeadH, ...rows.map(() => rowBodyH)];
  const tableH = rowHeights.reduce((sum, h) => sum + h, 0);
  const cellFs = p19PxToPtForPptx(P19_TABLE_CELL_FONT_PX);
  const tableRows: PptxGenJS.TableRow[] = [
    columns.map((c, ci) => {
      if (ci >= 1 && ci <= 4) {
        const idx = ci - 1;
        return {
          text: c,
          options: {
            bold: true,
            fontSize: cellFs,
            color: "F8FAFC",
            fill: { color: P19_LEVELS_TABLE_LEVEL_HEADER_BG_HEX[idx] },
            margin: cellPad,
            align: "center",
            valign: "middle",
          },
        };
      }
      return {
        text: c,
        options: {
          bold: true,
          fontSize: cellFs,
          color: "334155",
          fill: { color: "E2E8F0" },
          margin: cellPad,
          align: "left",
          valign: "middle",
        },
      };
    }),
    ...rows.map((r, ri) => {
      const totalRow = String(r[0] ?? "") === "TOTAL GERAL";
      const bodyBg = totalRow ? "E2E8F0" : ri % 2 === 0 ? "FCFCFD" : "F1F5F9";
      return r.map((c, ci) => ({
        text: String(c),
        options: {
          fontSize: cellFs,
          color: "0F172A",
          bold: totalRow,
          fill: { color: bodyBg },
          margin: cellPad,
          align: ci === 0 ? "left" : "center",
          valign: "middle",
        },
      }));
    }),
  ] as PptxGenJS.TableRow[];
  const colW = columns.map((_, ci) => (ci === 0 ? totalW * 0.22 : (totalW - totalW * 0.22) / (columns.length - 1)));
  slide.addTable(tableRows, {
    x: tableX,
    y: startY,
    w: totalW,
    h: tableH,
    rowH: rowHeights,
    border: { type: "solid", pt: 1, color: "E2E8F0" },
    colW,
  });
}

function renderSlide(slide: PptxGenJS.Slide, slideSpec: Presentation19SlideSpec, spec: Presentation19ExportSpec, pptx: PptxPresentation): void {
  const { deckData } = spec;
  drawFrame(slide, deckData.primaryColor, pptx);
  switch (slideSpec.kind) {
    case "cover-main":
      slide.addText(deckData.avaliacaoNome || "N/A", {
        x: 0.48,
        y: 1.4,
        w: 10.8,
        h: deckData.coverSubtitle?.trim() ? 1.35 : 1.8,
        fontSize: p19PxToPtForPptx(P19_COVER_MAIN_TITLE_PX),
        bold: true,
        color: hexNoHash(deckData.primaryColor),
        wrap: true,
      });
      if (deckData.coverSubtitle?.trim()) {
        slide.addText(deckData.coverSubtitle.trim(), {
          x: 0.48,
          y: 2.72,
          w: 11.8,
          h: 0.55,
          fontSize: p19PxToPtForPptx(P19_COVER_SUBTITLE_FONT_PX),
          bold: true,
          color: "334155",
          wrap: true,
        });
      }
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.48,
        y: deckData.coverSubtitle?.trim() ? 3.45 : 4.9,
        w: 12.35,
        h: 1.85,
        fill: { color: "F8FAFC" },
        line: { color: "E2E8F0" },
        rectRadius: 0.12,
      });
      slide.addText(
        [
          { text: "MUNICÍPIO\n", options: { fontSize: p19PxToPtForPptx(P19_COVER_MAIN_LABEL_PX), color: "52525B", bold: true } },
          { text: deckData.municipioNome || "N/A", options: { fontSize: p19PxToPtForPptx(P19_COVER_MAIN_VALUE_PX), color: "0F172A", bold: true } },
        ],
        { x: 0.65, y: deckData.coverSubtitle?.trim() ? 3.68 : 5.12, w: 5.75, h: 1.35, valign: "top" }
      );
      slide.addText(
        [
          { text: "SÉRIE\n", options: { fontSize: p19PxToPtForPptx(P19_COVER_MAIN_LABEL_PX), color: "52525B", bold: true } },
          { text: deckData.serie || "N/A", options: { fontSize: p19PxToPtForPptx(P19_COVER_MAIN_VALUE_PX), color: "0F172A", bold: true } },
        ],
        { x: 6.75, y: deckData.coverSubtitle?.trim() ? 3.68 : 5.12, w: 5.75, h: 1.35, valign: "top" }
      );
      break;
    case "cover-school": {
      if (deckData.slide2ShowSerieTurmas) {
        const labPt = p19PxToPtForPptx(P19_SEGMENT_FIELD_LABEL_PX);
        const valPt = p19PxToPtForPptx(P19_SEGMENT_FIELD_VALUE_PX);
        const escolaNomeCapa =
          deckData.escolasParticipantes.length === 1
            ? deckData.escolasParticipantes[0] ?? "N/A"
            : deckData.escolasParticipantes.filter(Boolean).join(", ") || "N/A";
        const turmaList = deckData.turmasParticipantesCapa.length > 8;
        const turmaBodyPt = turmaList
          ? p19PxToPtForPptx(20)
          : p19PxToPtForPptx(deckData.turma.length > 120 ? 22 : 34);
        slide.addText(
          [
            { text: "ESCOLA\n", options: { fontSize: labPt, color: "52525B", bold: true } },
            { text: `${escolaNomeCapa}\n\n`, options: { fontSize: valPt, color: "18181B", bold: true } },
            { text: "SÉRIE\n", options: { fontSize: labPt, color: "52525B", bold: true } },
            { text: `${deckData.serie ?? "N/A"}\n\n`, options: { fontSize: valPt, color: "18181B", bold: true } },
            ...(deckData.turno?.trim()
              ? ([
                  { text: "TURNO\n", options: { fontSize: labPt, color: "52525B", bold: true } },
                  { text: `${deckData.turno}\n\n`, options: { fontSize: valPt, color: "18181B", bold: true } },
                ] as const)
              : []),
            {
              text: `${deckData.turmasParticipantesCapa.length > 1 ? "TURMAS" : "TURMA"}\n`,
              options: { fontSize: labPt, color: "52525B", bold: true },
            },
            {
              text: turmaList ? deckData.turmasParticipantesCapa.map((t) => `• ${t}`).join("\n") : deckData.turma,
              options: { fontSize: turmaBodyPt, color: "18181B", bold: true },
            },
          ],
          { x: 0.76, y: 1.55, w: 11.8, h: 4.9, valign: "top" }
        );
        break;
      }

      const escolas = deckData.escolasParticipantes;
      if (escolas.length <= 1) {
        slide.addText(escolas[0] || "N/A", {
          x: 0.8,
          y: 3,
          w: 11.7,
          h: 1,
          fontSize: p19PxToPtForPptx(P19_COVER_SCHOOL_SINGLE_PX),
          bold: true,
          align: "center",
          wrap: true,
        });
      } else {
        const listFsPx = presentation19CoverSchoolListFontPx(escolas.length);
        const colCount = presentation19CoverSchoolColumnCount(escolas.length);
        const perCol = Math.ceil(escolas.length / colCount);
        const colTexts = Array.from({ length: colCount }, (_, ci) =>
          escolas
            .slice(ci * perCol, (ci + 1) * perCol)
            .map((s) => `• ${s}`)
            .join("\n")
        );
        const colW = 12.1 / colCount - 0.15;
        slide.addText(
          [{ text: "ESCOLAS PARTICIPANTES\n", options: { fontSize: p19PxToPtForPptx(P19_COVER_SCHOOL_MULTI_HEADER_PX), color: "52525B", bold: true } }],
          { x: 0.65, y: 1.85, w: 12.1, h: 0.45, align: "center" }
        );
        colTexts.forEach((text, ci) => {
          if (!text.trim()) return;
          slide.addText(
            [{ text, options: { fontSize: p19PxToPtForPptx(listFsPx), color: "0F172A", bold: true } }],
            { x: 0.55 + ci * (colW + 0.15), y: 2.35, w: colW, h: 4.9, align: "left", valign: "top" }
          );
        });
      }
      break;
    }
    case "metric-total-students":
      slide.addText("MÉTRICA GERAL", {
        x: 0.8,
        y: 2.4,
        w: 11.7,
        h: 0.6,
        fontSize: p19PxToPtForPptx(P19_METRIC_HEADER_PX),
        bold: true,
        color: "52525B",
        align: "center",
      });
      slide.addText(Math.round(deckData.totalAlunosParticiparam).toLocaleString("pt-BR"), {
        x: 0.8,
        y: 3.1,
        w: 11.7,
        h: 1.2,
        fontSize: p19PxToPtForPptx(P19_METRIC_NUMBER_PX),
        bold: true,
        color: hexNoHash(deckData.primaryColor),
        align: "center",
      });
      slide.addText("Alunos que realizaram a avaliação", {
        x: 0.8,
        y: 4.5,
        w: 11.7,
        h: 0.6,
        fontSize: p19PxToPtForPptx(P19_METRIC_HEADER_PX),
        color: "334155",
        align: "center",
      });
      break;
    case "cover-segment": {
      drawTitle(slide, "CAPA DE SEGMENTO", deckData.primaryColor, pptx);
      const labPt = p19PxToPtForPptx(P19_SEGMENT_FIELD_LABEL_PX);
      const valPt = p19PxToPtForPptx(P19_SEGMENT_FIELD_VALUE_PX);
      const turmaList = deckData.turmasParticipantesCapa.length > 8;
      const turmaBodyPt = turmaList
        ? p19PxToPtForPptx(20)
        : p19PxToPtForPptx(deckData.turma.length > 120 ? 22 : 34);
      slide.addText(
        [
          { text: "CURSO\n", options: { fontSize: labPt, color: "52525B", bold: true } },
          { text: `${deckData.curso}\n\n`, options: { fontSize: valPt, color: "18181B", bold: true } },
          { text: "SÉRIE\n", options: { fontSize: labPt, color: "52525B", bold: true } },
          { text: `${deckData.serie}\n\n`, options: { fontSize: valPt, color: "18181B", bold: true } },
          ...(deckData.turno?.trim()
            ? ([
                { text: "TURNO\n", options: { fontSize: labPt, color: "52525B", bold: true } },
                { text: `${deckData.turno}\n\n`, options: { fontSize: valPt, color: "18181B", bold: true } },
              ] as const)
            : []),
          ...(deckData.comparisonAxis !== "escola"
            ? ([
                {
                  text: `${deckData.turmasParticipantesCapa.length > 1 ? "TURMAS" : "TURMA"}\n`,
                  options: { fontSize: labPt, color: "52525B", bold: true },
                },
                {
                  text: turmaList ? deckData.turmasParticipantesCapa.map((t) => `• ${t}`).join("\n") : deckData.turma,
                  options: { fontSize: turmaBodyPt, color: "18181B", bold: true },
                },
              ] as const)
            : []),
        ],
        { x: 0.76, y: 1.55, w: 11.8, h: 4.9, valign: "top" }
      );
      break;
    }
    case "presence-table":
      drawTitle(slide, presentationTitleTablePresence(deckData.comparisonAxis), deckData.primaryColor, pptx);
      drawTable(
        slide,
        slideSpec.table.columns,
        slideSpec.table.rows,
        undefined,
        [0.26, 0.185, 0.185, 0.185, 0.185],
        slideSpec.presencePctValues
      );
      break;
    case "presence-chart":
      drawTitle(slide, presentationTitleChartPresence(deckData.comparisonAxis), deckData.primaryColor, pptx, P19_CHART_SUBTITLE_PRESENCE);
      drawPdfAlignedBarChart(slide, slideSpec.chart, p19RectPxToSlideInches(p19FullWidthBarChartRectPx(1)), pptx);
      break;
    case "section-levels":
      drawCenteredSectionPptx(
        slide,
        presentationSectionLevels(deckData.comparisonAxis),
        presentationSectionLevelsTagline(deckData.comparisonAxis),
        deckData.primaryColor
      );
      break;
    case "levels-guide":
      drawTitle(slide, "GUIA DE NÍVEIS DE APRENDIZAGEM", deckData.primaryColor, pptx);
      spec.deckData.levelGuide.forEach((lvl, idx) => {
        const bx = P19_CONTENT.x;
        const y = P19_LEVELS_GUIDE_FIRST_ROW_TOP_PX + idx * P19_LEVELS_GUIDE_ROW_STRIDE_PX;
        const w = P19_CONTENT.w;
        const h = P19_LEVELS_GUIDE_ROW_STRIDE_PX - 10;
        const cardBox = p19RectPxToSlideInches({ x: bx, y, w, h });
        const rxIn = (P19_LEVELS_GUIDE_CARD_RADIUS_PX / P19_PAGE.width) * 13.333;
        slide.addShape(pptx.ShapeType.roundRect, {
          x: cardBox.x,
          y: cardBox.y,
          w: cardBox.w,
          h: cardBox.h,
          fill: { color: p19LevelsGuideCardFillHex() },
          line: { color: p19LevelsGuideCardBorderHex() },
          rectRadius: Math.min(0.35, Math.max(0.02, rxIn)),
        });
        const stripe = p19RectPxToSlideInches({ x: bx, y, w: 8, h });
        slide.addShape(pptx.ShapeType.rect, {
          x: stripe.x,
          y: stripe.y,
          w: stripe.w,
          h: stripe.h,
          fill: { color: hexNoHash(lvl.color) },
          line: { color: hexNoHash(lvl.color) },
        });
        slide.addText(lvl.label, {
          x: p19PxToSlideInX(bx + 18),
          y: p19PxToSlideInY(y + 16),
          w: p19PxToSlideInX(w - 28),
          h: 0.32,
          fontSize: p19PxToPtForPptx(P19_LEVELS_GUIDE_TITLE_PX),
          bold: true,
          color: hexNoHash(lvl.color),
        });
        slide.addText(lvl.description, {
          x: p19PxToSlideInX(bx + 18),
          y: p19PxToSlideInY(y + 48),
          w: p19PxToSlideInX(w - 28),
          h: 1.05,
          fontSize: p19PxToPtForPptx(P19_LEVELS_GUIDE_DESC_PX),
          color: "3F3F46",
          wrap: true,
        });
      });
      break;
    case "levels-chart": {
      drawTitle(slide, presentationTitleChartLevels(deckData.comparisonAxis), deckData.primaryColor, pptx, slideSpec.escolaNome);
      drawPdfAlignedBarChart(
        slide,
        slideSpec.chart,
        p19RectPxToSlideInches(p19StandardBarChartRectPx(slideSpec.escolaNome ? 1 : 0)),
        pptx
      );
      break;
    }
    case "levels-table":
      drawTitle(slide, niveisAprendizagemTituloPorEixo(deckData.comparisonAxis), deckData.primaryColor, pptx, slideSpec.escolaNome);
      drawLevelsTable(
        slide,
        slideSpec.table.columns,
        slideSpec.table.rows,
        p19PxToSlideInY(p19TableStartYAfterTitleBlockPx(Boolean(slideSpec.escolaNome), 1))
      );
      break;
    case "section-proficiency":
      drawCenteredSectionPptx(
        slide,
        presentationSectionProficiency(deckData.comparisonAxis),
        presentationSectionProficiencyTagline(deckData.comparisonAxis),
        deckData.primaryColor
      );
      break;
    case "proficiency-general-table":
      drawTitle(slide, presentationTitleTableProficiency(deckData.comparisonAxis), deckData.primaryColor, pptx);
      drawTable(slide, slideSpec.table.columns, slideSpec.table.rows, undefined, [0.52, 0.48]);
      break;
    case "proficiency-general-chart": {
      const profSub = [slideSpec.escolaNome, P19_CHART_SUBTITLE_PROFICIENCY].filter(Boolean).join(" • ");
      drawTitle(slide, presentationTitleProficiencyGeneralChart(deckData.comparisonAxis), deckData.primaryColor, pptx, profSub);
      drawPdfAlignedBarChart(
        slide,
        slideSpec.chart,
        p19RectPxToSlideInches(p19ProficiencyGeneralBarChartRectPx(profSub.trim() ? 1 : 0)),
        pptx
      );
      break;
    }
    case "proficiency-by-discipline-chart": {
      drawTitle(slide, presentationTitleProficiencyByDiscipline(deckData.comparisonAxis), deckData.primaryColor, pptx, slideSpec.escolaNome);
      /** Uma coluna: um mini-gráfico por linha, largura total (chunk = 1 em `buildSlideSpec`). */
      const gridTopPx = p19ChartAreaTopPxAfterTitle(slideSpec.escolaNome ? 1 : 0);
      const gridLeft = P19_CONTENT.x + P19_TITLE_TEXT_OFFSET_X_PX;
      const gridW = P19_CONTENT.w - P19_TITLE_TEXT_OFFSET_X_PX;
      const gridPad = 8;
      const boxWpx = gridW - gridPad * 2;
      const boxXpx = gridLeft + gridPad;
      const innerPadPx = 8;
      const innerWpx = boxWpx - innerPadPx * 2;
      const rowGapPx = 10;
      const n = Math.max(1, slideSpec.charts.length);
      const boxHPx = Math.max(
        148,
        (P19_PAGE.height - gridTopPx - P19_SLIDE_FOOTER_RESERVE_PX - Math.max(0, n - 1) * rowGapPx) / n
      );
      const titleLabFs = P19_PROFICIENCY_DISC_CARD_TITLE_PX;
      const titleLabLh = p19PdfLineHeightPx(titleLabFs);
      slideSpec.charts.forEach((entry, idx) => {
        const boxYpx = gridTopPx + idx * (boxHPx + rowGapPx);
        const titleWrapped = wrapTextBySpacesForPptx(
          entry.title,
          approxMaxCharsForWidth((innerWpx / P19_PAGE.width) * 13.333, p19PxToPtForPptx(titleLabFs))
        );
        const titleLineCount = Math.max(1, titleWrapped.split("\n").filter((l) => l.length > 0).length);
        const titleTopPx = boxYpx + 16;
        slide.addText(titleWrapped, {
          x: p19PxToSlideInX(boxXpx + innerPadPx),
          y: p19PxToSlideInY(titleTopPx),
          w: p19PxToSlideInX(innerWpx),
          h: Math.min(0.72, (titleLineCount * titleLabLh / P19_PAGE.height) * 7.5 + 0.08),
          fontSize: p19PxToPtForPptx(titleLabFs),
          bold: true,
          color: "0F172A",
          wrap: true,
        });
        const chartInnerTopPx = titleTopPx + titleLineCount * titleLabLh + 4;
        const innerHPx = Math.max(80, boxYpx + boxHPx - chartInnerTopPx - 8);
        drawPdfAlignedBarChart(
          slide,
          entry.chart,
          p19RectPxToSlideInches({ x: boxXpx + innerPadPx, y: chartInnerTopPx, w: boxWpx - 16, h: innerHPx }),
          pptx
        );
      });
      break;
    }
    case "grades-by-discipline-chart": {
      drawTitle(slide, presentationTitleGradesByDiscipline(deckData.comparisonAxis), deckData.primaryColor, pptx, slideSpec.escolaNome);
      const gridTopPx = p19ChartAreaTopPxAfterTitle(slideSpec.escolaNome ? 1 : 0);
      const gridLeft = P19_CONTENT.x + P19_TITLE_TEXT_OFFSET_X_PX;
      const gridW = P19_CONTENT.w - P19_TITLE_TEXT_OFFSET_X_PX;
      const gridPad = 8;
      const boxWpx = gridW - gridPad * 2;
      const boxXpx = gridLeft + gridPad;
      const innerPadPx = 8;
      const innerWpx = boxWpx - innerPadPx * 2;
      const rowGapPx = 10;
      const n = Math.max(1, slideSpec.charts.length);
      const boxHPx = Math.max(
        148,
        (P19_PAGE.height - gridTopPx - P19_SLIDE_FOOTER_RESERVE_PX - Math.max(0, n - 1) * rowGapPx) / n
      );
      const titleLabFs = P19_PROFICIENCY_DISC_CARD_TITLE_PX;
      const titleLabLh = p19PdfLineHeightPx(titleLabFs);
      slideSpec.charts.forEach((entry, idx) => {
        const boxYpx = gridTopPx + idx * (boxHPx + rowGapPx);
        const titleWrapped = wrapTextBySpacesForPptx(
          entry.title,
          approxMaxCharsForWidth((innerWpx / P19_PAGE.width) * 13.333, p19PxToPtForPptx(titleLabFs))
        );
        const titleLineCount = Math.max(1, titleWrapped.split("\n").filter((l) => l.length > 0).length);
        const titleTopPx = boxYpx + 16;
        slide.addText(titleWrapped, {
          x: p19PxToSlideInX(boxXpx + innerPadPx),
          y: p19PxToSlideInY(titleTopPx),
          w: p19PxToSlideInX(innerWpx),
          h: Math.min(0.72, (titleLineCount * titleLabLh / P19_PAGE.height) * 7.5 + 0.08),
          fontSize: p19PxToPtForPptx(titleLabFs),
          bold: true,
          color: "0F172A",
          wrap: true,
        });
        const chartInnerTopPx = titleTopPx + titleLineCount * titleLabLh + 4;
        const innerHPx = Math.max(80, boxYpx + boxHPx - chartInnerTopPx - 8);
        drawPdfAlignedBarChart(
          slide,
          entry.chart,
          p19RectPxToSlideInches({ x: boxXpx + innerPadPx, y: chartInnerTopPx, w: boxWpx - 16, h: innerHPx }),
          pptx
        );
      });
      break;
    }
    case "section-grades":
      drawCenteredSectionPptx(
        slide,
        presentationSectionGrades(deckData.comparisonAxis),
        presentationSectionGradesTagline(deckData.comparisonAxis),
        deckData.primaryColor
      );
      break;
    case "grades-table":
      drawTitle(slide, presentationTitleTableGrades(deckData.comparisonAxis), deckData.primaryColor, pptx);
      drawTable(slide, slideSpec.table.columns, slideSpec.table.rows, undefined, [0.52, 0.48]);
      break;
    case "grades-no-turma-notice":
      slide.addText(PRESENTATION19_GRADES_NO_TURMA_NOTICE, {
        x: 0.9,
        y: 2.6,
        w: 11.5,
        h: 2.2,
        fontSize: 16,
        bold: true,
        color: "B45309",
        align: "center",
        valign: "middle",
        wrap: true,
      });
      break;
    case "grades-chart": {
      const gradesSub = [slideSpec.escolaNome, P19_CHART_SUBTITLE_GRADES].filter(Boolean).join(" • ");
      drawTitle(slide, presentationTitleChartGrades(deckData.comparisonAxis), deckData.primaryColor, pptx, gradesSub);
      drawPdfAlignedBarChart(
        slide,
        slideSpec.chart,
        p19RectPxToSlideInches(p19FullWidthBarChartRectPx(gradesSub.trim() ? 1 : 0)),
        pptx
      );
      break;
    }
    case "section-questions":
      drawCenteredSectionPptx(slide, presentationSectionQuestionsTitle(), presentationSectionQuestionsTagline(), deckData.primaryColor);
      break;
    case "dynamic-series-cover":
      slide.addText(`[${deckData.serieNomeCapas}]`, {
        x: 0.8,
        y: 3.3,
        w: 11.7,
        h: 0.8,
        fontSize: p19PxToPtForPptx(P19_DYNAMIC_COVER_PX),
        bold: true,
        color: hexNoHash(deckData.primaryColor),
        align: "center",
        wrap: true,
      });
      break;
    case "dynamic-class-cover":
      slide.addText(`[${deckData.turmaNomeCapas}]`, {
        x: 0.8,
        y: 3.3,
        w: 11.7,
        h: 0.8,
        fontSize: p19PxToPtForPptx(P19_DYNAMIC_COVER_PX),
        bold: true,
        color: hexNoHash(deckData.primaryColor),
        align: "center",
        wrap: true,
      });
      break;
    case "questions-turma-cover": {
      const coverLine = presentationQuestionsTurmaCoverLine(slideSpec.serieLabel, slideSpec.turmaNome);
      slide.addText(coverLine, {
        x: 0.7,
        y: 2.6,
        w: 12.1,
        h: 2.4,
        fontSize: p19PxToPtForPptx(
          slideSpec.serieLabel.length + slideSpec.turmaNome.length > 80 ? 26 : 34
        ),
        bold: true,
        color: hexNoHash(deckData.primaryColor),
        align: "center",
        valign: "middle",
        wrap: true,
      });
      break;
    }
    case "questions-table": {
      const qt =
        slideSpec.questionsSubsection?.kind === "geral"
          ? "TABELA DE QUESTÕES — GERAL"
          : slideSpec.questionsSubsection?.kind === "serie-geral"
            ? presentationTitleQuestionsSerieGeral(slideSpec.questionsSubsection.serieLabel)
            : slideSpec.questionsSubsection?.kind === "turma"
              ? `TABELA DE QUESTÕES — TURMA ${slideSpec.questionsSubsection.turmaNome}`
              : "TABELA DE QUESTÕES";
      const qp = slideSpec.questionsPage;
      const pageMulti = qp != null && qp.total > 1;
      /** Títulos longos quebram em 2+ linhas; desce a tabela para não sobrepor o título. */
      const titleLineCount = Math.min(4, Math.max(1, Math.ceil(qt.length / 34)));
      const tableStartY = p19PxToSlideInY(p19TableStartYAfterTitleBlockPx(false, titleLineCount));
      drawTitle(slide, qt, deckData.primaryColor, pptx, undefined, pageMulti ? P19_QUESTIONS_PAGE_INDICATOR_RIGHT_PAD_PX : 0);
      if (pageMulti && qp) {
        slide.addText(`Página ${qp.current}/${qp.total}`, {
          x: p19PxToSlideInX(P19_CONTENT.x + P19_CONTENT.w) - 4.0,
          y: p19PxToSlideInY(P19_SLIDE_TITLE_FIRST_LINE_TOP_PX),
          w: 4.0,
          h: 0.35,
          fontSize: p19PxToPtForPptx(P19_PAGE_INDICATOR_FONT_PX),
          color: "52525B",
          align: "right",
        });
      }
      drawQuestionsTable(slide, slideSpec.table.columns, slideSpec.table.rows, slideSpec.questionRowLevels, tableStartY);
      break;
    }
    case "questions-accuracy-chart": {
      const ap = slideSpec.accuracyPage;
      const pageMulti = ap != null && ap.total > 1;
      drawTitle(
        slide,
        "PORCENTAGEM DE ACERTOS",
        deckData.primaryColor,
        pptx,
        undefined,
        pageMulti ? P19_QUESTIONS_PAGE_INDICATOR_RIGHT_PAD_PX : 0
      );
      if (pageMulti && ap) {
        slide.addText(`Página ${ap.current}/${ap.total}`, {
          x: p19PxToSlideInX(P19_CONTENT.x + P19_CONTENT.w) - 4.0,
          y: p19PxToSlideInY(P19_SLIDE_TITLE_FIRST_LINE_TOP_PX),
          w: 4.0,
          h: 0.35,
          fontSize: p19PxToPtForPptx(P19_PAGE_INDICATOR_FONT_PX),
          color: "52525B",
          align: "right",
        });
      }
      drawPdfAlignedBarChart(slide, slideSpec.chart, p19RectPxToSlideInches(p19AccuracyChartRectPx()), pptx);
      break;
    }
    case "thank-you":
      slide.addText(deckData.closingMessage || "Obrigado!!", {
        x: 0.8,
        y: 3.2,
        w: 11.7,
        h: 0.9,
        fontSize: p19PxToPtForPptx(P19_THANK_YOU_FONT_PX),
        bold: true,
        align: "center",
        color: hexNoHash(deckData.primaryColor),
      });
      break;
  }
  drawDeckChromePptx(slide, deckData);
}

export async function renderPptxFromSlideSpec(args: RenderPptxArgs): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "InnovPlay";
  args.spec.slides.forEach((specSlide) => {
    const slide = pptx.addSlide();
    renderSlide(slide, specSlide, args.spec, pptx);
  });
  await pptx.writeFile({ fileName: args.fileName });
}
