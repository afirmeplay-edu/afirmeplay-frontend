import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Presentation19DeckData } from "@/types/presentation19-slides";
import type { ExportChart, Presentation19ExportSpec, Presentation19SlideSpec } from "@/types/presentation19-export-spec";
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
import { P19_QUESTION_NUM_LEVEL_STYLE } from "@/utils/reports/presentation19/questionAcertoLevel";
import {
  P19_CHART_AXIS_TICK_PX,
  P19_CHART_BAR_VALUE_TOP_PX,
  P19_CHART_CATEGORY_LABEL_PX,
  P19_CHART_H_BAR_LABEL_PX,
  P19_CHART_H_BAR_VALUE_PX,
  P19_CHART_SUBTITLE_GRADES,
  P19_CHART_SUBTITLE_PRESENCE,
  P19_CHART_SUBTITLE_PROFICIENCY,
  P19_CONTENT,
  P19_COVER_MAIN_LABEL_PX,
  P19_COVER_MAIN_TITLE_PX,
  P19_COVER_SUBTITLE_FONT_PX,
  P19_COVER_MAIN_VALUE_PX,
  P19_COVER_SCHOOL_LIST_LARGE_PX,
  P19_COVER_SCHOOL_LIST_SMALL_PX,
  P19_COVER_SCHOOL_MULTI_HEADER_PX,
  P19_COVER_SCHOOL_SINGLE_PX,
  P19_DYNAMIC_COVER_PX,
  P19_HORIZONTAL_CHART_LABEL_WIDTH_PX,
  P19_LEVELS_GUIDE_DESC_PX,
  P19_LEVELS_GUIDE_TITLE_PX,
  P19_METRIC_HEADER_PX,
  P19_METRIC_NUMBER_PX,
  P19_PAGE,
  P19_PAGE_INDICATOR_FONT_PX,
  P19_SEGMENT_FIELD_LABEL_PX,
  P19_SEGMENT_FIELD_VALUE_PX,
  P19_SECTION_TAGLINE_PX,
  P19_SECTION_TITLE_TAGLINE_GAP_PX,
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
} from "@/utils/reports/presentation19/presentation19ExportTypography";
import {
  P19_CHART_AREA_MIN_HEIGHT_PX,
  P19_ESCOLA_SUBTITLE_TO_TABLE_GAP_PX,
  P19_CHART_H_BAR_BAR_THICKNESS_MAX_PX,
  P19_CHART_H_BAR_BOTTOM_PAD_PX,
  P19_CHART_H_BAR_TOP_PAD_PX,
  P19_CHART_INNER_HORIZONTAL_PAD_PX,
  P19_CHART_V_BAR_TOP_PAD_PX,
  P19_CHART_V_BAR_VALUE_LABEL_RESERVE_PX,
  P19_DECK_LOGO_H_PX,
  P19_DECK_LOGO_RIGHT_MARGIN_PX,
  P19_DECK_LOGO_TOP_PX,
  P19_DECK_LOGO_W_PX,
  P19_LEVELS_GUIDE_CARD_BORDER_RGB,
  P19_LEVELS_GUIDE_CARD_FILL_RGB,
  P19_LEVELS_GUIDE_CARD_RADIUS_PX,
  P19_LEVELS_GUIDE_FIRST_ROW_TOP_PX,
  P19_LEVELS_GUIDE_ROW_STRIDE_PX,
  P19_QUESTIONS_PAGE_INDICATOR_RIGHT_PAD_PX,
  P19_SECTION_CENTER_VERTICAL_OFFSET_PX,
  P19_SLIDE_FOOTER_RESERVE_PX,
  P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX,
  P19_SUBTITLE_TO_CHART_GAP_PX,
  P19_TITLE_TO_ACCURACY_CHART_GAP_PX,
  P19_TITLE_TO_BODY_GAP_PX,
  P19_TITLE_TO_SUBTITLE_GAP_PX,
} from "@/utils/reports/presentation19/presentation19Layout";
import {
  presenceTablePctCellColors,
  presentation19CoverSchoolColumnCount,
  presentation19CoverSchoolListFontPx,
  PRESENTATION19_GRADES_NO_TURMA_NOTICE,
  resolvePresentation19BarTopLabel,
} from "@/utils/reports/presentation19/presentation19Labels";
import { resolveMunicipalReferenceXRatios } from "@/utils/reports/presentation19/municipalReferenceLine";
import {
  minP19VerticalBarInnerW,
  resolveP19VerticalBarColumnSlot,
} from "@/utils/reports/presentation19/presentation19VerticalBarLayout";

type RenderPdfArgs = {
  spec: Presentation19ExportSpec;
  fileName: string;
};

const page = P19_PAGE;
const content = P19_CONTENT;

function formatBarValueLabel(value: number, serieLabel?: string): string {
  if (!Number.isFinite(value)) return "0,0";
  const wantsPct = String(serieLabel ?? "").includes("%");
  const isInt = Math.abs(value - Math.round(value)) < 1e-9;
  if (!wantsPct && isInt) return String(Math.round(value));
  const base = Number(value).toFixed(1).replace(".", ",");
  return wantsPct ? `${base}%` : base;
}

function drawFrame(doc: jsPDF, primaryColor: string): void {
  // Fundo totalmente branco.
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, page.width, page.height, "F");
}

function drawDeckFooter(doc: jsPDF, deckData: Presentation19DeckData): void {
  const raw = deckData.footerText?.trim();
  if (!raw) return;
  doc.setFont("helvetica", "normal");
  const fs = 9;
  doc.setFontSize(fs);
  doc.setTextColor(82, 82, 91);
  const maxW = page.width - 96;
  const lines = doc.splitTextToSize(raw, maxW);
  const lineH = p19PdfLineHeightPx(fs);
  let y = page.height - 22 - (lines.length - 1) * lineH;
  lines.forEach((ln) => {
    doc.text(ln, page.width / 2, y, { align: "center" });
    y += lineH;
  });
}

function drawDeckLogo(doc: jsPDF, deckData: Presentation19DeckData): void {
  const url = deckData.logoDataUrl?.trim();
  if (!url || !url.startsWith("data:image")) return;
  const fmt: "PNG" | "JPEG" | "JPG" = url.includes("image/png") ? "PNG" : "JPEG";
  const logoW = P19_DECK_LOGO_W_PX;
  const logoH = P19_DECK_LOGO_H_PX;
  const x = page.width - P19_DECK_LOGO_RIGHT_MARGIN_PX - logoW;
  const y = P19_DECK_LOGO_TOP_PX;
  try {
    doc.addImage(url, fmt, x, y, logoW, logoH, undefined, "FAST");
  } catch {
    /* formato não suportado ou imagem inválida */
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const safe = hex.replace("#", "");
  const normalized = safe.length === 3 ? safe.split("").map((c) => `${c}${c}`).join("") : safe;
  const n = Number.parseInt(normalized, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function setPdfTextColorFromHex(doc: jsPDF, hex: string): void {
  const { r, g, b } = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

/**
 * Word-wrap que quebra linhas apenas por espaços (sem dividir palavras).
 * Se uma palavra isolada exceder `maxWidthPx`, cai no comportamento padrão do jsPDF para aquela palavra.
 */
function splitTextToSizeBySpaces(doc: jsPDF, text: string, maxWidthPx: number): string[] {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return [""];
  const words = raw.split(" ");
  const lines: string[] = [];
  let cur = "";

  const flush = () => {
    if (cur.trim()) lines.push(cur.trim());
    cur = "";
  };

  for (const w of words) {
    if (!w) continue;
    const next = cur ? `${cur} ${w}` : w;
    if (doc.getTextWidth(next) <= maxWidthPx) {
      cur = next;
      continue;
    }
    // Se não cabe, fecha linha atual e tenta colocar a palavra sozinha.
    flush();
    if (doc.getTextWidth(w) <= maxWidthPx) {
      cur = w;
      continue;
    }
    // Palavra maior que a largura: usa fallback do jsPDF (pode quebrar a palavra).
    const fallback = doc.splitTextToSize(w, maxWidthPx);
    for (const ln of fallback) lines.push(String(ln));
  }
  flush();
  return lines.length ? lines : [raw];
}

/**
 * Título de slide com barra lateral e quebra de linha. `firstLineBaselineY` é a baseline da primeira linha.
 * Retorna a baseline após a última linha do título.
 */
function drawWrappedSlideTitle(doc: jsPDF, title: string, primaryColor: string, firstLineBaselineY: number, maxWidthPx: number): number {
  const fs = P19_TITLE_FONT_PX;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fs);
  const lines = doc.splitTextToSize(title, maxWidthPx);
  const lineH = p19PdfLineHeightPx(fs);
  const rgb = hexToRgb(primaryColor);
  const accentTop = firstLineBaselineY - fs * 0.72;
  const blockBottom = firstLineBaselineY + (lines.length - 1) * lineH;
  const accentH = Math.max(P19_TITLE_ACCENT_H_PX, blockBottom - accentTop + 10);
  doc.setFillColor(rgb.r, rgb.g, rgb.b);
  doc.roundedRect(content.x, accentTop, P19_TITLE_ACCENT_W_PX, accentH, 6, 6, "F");
  doc.setTextColor(15, 23, 42);
  let y = firstLineBaselineY;
  lines.forEach((ln) => {
    doc.text(ln, content.x + P19_TITLE_TEXT_OFFSET_X_PX, y);
    y += lineH;
  });
  return y;
}

function drawWrappedSubtitle(doc: jsPDF, text: string, firstLineBaselineY: number, maxWidthPx: number): number {
  const fs = P19_SUBTITLE_FONT_PX;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fs);
  doc.setTextColor(82, 82, 91);
  const lines = doc.splitTextToSize(text, maxWidthPx);
  const lineH = p19PdfLineHeightPx(fs);
  let y = firstLineBaselineY;
  lines.forEach((ln) => {
    doc.text(ln, content.x + P19_TITLE_TEXT_OFFSET_X_PX, y);
    y += lineH;
  });
  return y;
}

/** Barras horizontais (categoria no eixo Y, valores crescendo para a direita). */
function drawHorizontalBarChart(doc: jsPDF, chart: ExportChart, area: { x: number; y: number; w: number; h: number }): void {
  const { x, y, w, h } = area;
  const topPad = P19_CHART_H_BAR_TOP_PAD_PX;
  const bottomPad = P19_CHART_H_BAR_BOTTOM_PAD_PX;
  const leftLabelW = P19_HORIZONTAL_CHART_LABEL_WIDTH_PX;
  const plotTop = y + topPad;
  const plotBottom = y + h - bottomPad;
  const plotH = plotBottom - plotTop;
  const baselineX = x + leftLabelW;
  const plotRight = x + w - 10;
  const chartAreaW = Math.max(40, plotRight - baselineX);

  const rawMax = Math.max(
    1,
    ...chart.data.flatMap((d) => chart.valueKeys.map((s) => Number(d[s.key] ?? 0)))
  );
  const axisMin = Number.isFinite(chart.yAxis?.min) ? Number(chart.yAxis?.min) : 0;
  const axisMax = Number.isFinite(chart.yAxis?.max) ? Number(chart.yAxis?.max) : Math.max(1, Math.ceil(rawMax * 1.15));
  const maxValue = Math.max(axisMin + 1, axisMax);
  const palette = ["#3B82F6", "#22C55E", "#F97316", "#A855F7", "#EF4444", "#06B6D4", "#EAB308", "#14B8A6"];

  const n = Math.max(1, chart.data.length);
  const rowH = plotH / n;
  const serie = chart.valueKeys[0];
  const labelFont = P19_CHART_H_BAR_LABEL_PX;
  const labelMaxW = leftLabelW - 12;

  chart.data.forEach((row, idx) => {
    const value = Number(row[serie.key] ?? 0);
    const barW = (Math.max(0, value - axisMin) / (maxValue - axisMin)) * chartAreaW;
    const rowCenterY = plotTop + (idx + 0.5) * rowH;
    const barThickness = Math.min(P19_CHART_H_BAR_BAR_THICKNESS_MAX_PX, rowH * 0.55);
    const barY = rowCenterY - barThickness / 2;
    const barColor = String(row.color ?? palette[idx % palette.length] ?? serie.color);
    const rgb = hexToRgb(barColor);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.rect(baselineX, barY, Math.max(0, barW), barThickness, "F");

    const cat = String(row[chart.categoryKey] ?? "");
    const maxTextH = Math.max(10, rowH * 0.88);
    let fs = labelFont;
    doc.setFont("helvetica", "normal");
    let catLines: string[] = [];
    let catLineH = p19PdfLineHeightPx(fs);
    while (fs >= 7) {
      doc.setFontSize(fs);
      catLines = doc.splitTextToSize(cat, labelMaxW);
      catLineH = p19PdfLineHeightPx(fs);
      if (catLines.length * catLineH <= maxTextH) break;
      fs -= 1;
    }
    if (catLines.length * catLineH > maxTextH) {
      const maxLines = Math.max(1, Math.floor(maxTextH / catLineH));
      catLines = catLines.slice(0, maxLines);
    }

    doc.setTextColor(51, 65, 85);
    doc.setFontSize(fs);
    const blockH = catLines.length * catLineH;
    const labelRightX = baselineX - 8;
    let catY = rowCenterY - blockH / 2 + catLineH * 0.72;
    catLines.forEach((ln) => {
      doc.text(ln, labelRightX, catY, { align: "right" });
      catY += catLineH;
    });

    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(P19_CHART_H_BAR_VALUE_PX);
    const valStr = formatBarValueLabel(value, serie.label);
    doc.setFontSize(P19_CHART_H_BAR_VALUE_PX);
    const valW = doc.getTextWidth(valStr);
    let valX = baselineX + barW + 4;
    if (valX + valW > plotRight - 1) {
      valX = Math.max(baselineX + 2, plotRight - valW - 2);
    }
    doc.text(valStr, valX, rowCenterY + 4, { align: "left" });
  });
}

function drawBarChart(doc: jsPDF, chart: ExportChart, area: { x: number; y: number; w: number; h: number }): void {
  if (chart.orientation === "horizontal") {
    drawHorizontalBarChart(doc, chart, area);
    return;
  }

  const { x, y, w, h } = area;
  const barsStartX = x + P19_CHART_INNER_HORIZONTAL_PAD_PX;
  const barsW = w - P19_CHART_INNER_HORIZONTAL_PAD_PX * 2;
  const plotTopInset = P19_CHART_V_BAR_TOP_PAD_PX + P19_CHART_V_BAR_VALUE_LABEL_RESERVE_PX;
  const barCount = Math.max(1, chart.data.length);
  const minInnerW = minP19VerticalBarInnerW(barsW, barCount);

  const rawMax = Math.max(
    1,
    ...chart.data.flatMap((d) => chart.valueKeys.map((s) => Number(d[s.key] ?? 0)))
  );
  const axisMin = Number.isFinite(chart.yAxis?.min) ? Number(chart.yAxis?.min) : 0;
  const axisMax = Number.isFinite(chart.yAxis?.max) ? Number(chart.yAxis?.max) : Math.max(1, Math.ceil(rawMax * 1.15));
  const maxValue = Math.max(axisMin + 1, axisMax);

  let catFs = P19_CHART_CATEGORY_LABEL_PX;
  let bottomPad = 34;
  const minChartPx = 72;
  doc.setFont("helvetica", "normal");
  for (;;) {
    doc.setFontSize(catFs);
    const lineH = p19PdfLineHeightPx(catFs);
    let maxCatLines = 1;
    chart.data.forEach((row) => {
      const catStr = String(row[chart.categoryKey] ?? "");
      const lines = splitTextToSizeBySpaces(doc, catStr, minInnerW);
      maxCatLines = Math.max(maxCatLines, lines.length);
    });
    const neededBottom = 8 + maxCatLines * lineH + 10;
    const maxBottom = Math.max(34, h - plotTopInset - minChartPx);
    if (neededBottom <= maxBottom || catFs <= 7) {
      bottomPad = Math.min(Math.max(34, neededBottom), maxBottom);
      break;
    }
    catFs -= 1;
  }

  const baselineY = y + h - bottomPad;
  const chartAreaH = baselineY - (y + plotTopInset);
  const catLineH = p19PdfLineHeightPx(catFs);

  const palette = ["#3B82F6", "#22C55E", "#F97316", "#A855F7", "#EF4444", "#06B6D4", "#EAB308", "#14B8A6"];
  const isStacked = chart.type === "stackedBar";
  const hasMultipleSeries = chart.valueKeys.length > 1;

  chart.data.forEach((row, idx) => {
    const slot = resolveP19VerticalBarColumnSlot(barsStartX, barsW, idx, barCount);
    if (hasMultipleSeries && !isStacked) {
      const gap = Math.min(8, Math.max(2, slot.innerW * 0.12));
      const seriesW = Math.max(
        2,
        Math.min(22, (slot.innerW - gap * (chart.valueKeys.length - 1)) / chart.valueKeys.length)
      );
      const groupW = chart.valueKeys.length * seriesW + gap * (chart.valueKeys.length - 1);
      const groupX = slot.slotX + (slot.colWidth - groupW) / 2;
      chart.valueKeys.forEach((serie, sIdx) => {
        const value = Number(row[serie.key] ?? 0);
        const barH = (Math.max(0, value - axisMin) / (maxValue - axisMin)) * chartAreaH;
        const barY = baselineY - barH;
        const barX = groupX + sIdx * (seriesW + gap);
        const rgb = hexToRgb(serie.color);
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.roundedRect(barX, barY, seriesW, barH, 4, 4, "F");
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(P19_CHART_BAR_VALUE_TOP_PX);
        doc.text(resolvePresentation19BarTopLabel(row, value, serie.label), barX + seriesW / 2, barY - 1, {
          align: "center",
          maxWidth: slot.colWidth,
        });
      });
    } else if (hasMultipleSeries && isStacked) {
      let currentTop = baselineY;
      let total = 0;
      chart.valueKeys.forEach((serie) => {
        const value = Number(row[serie.key] ?? 0);
        total += Math.max(0, value);
        const barH = (Math.max(0, value - axisMin) / (maxValue - axisMin)) * chartAreaH;
        const barY = currentTop - barH;
        const rgb = hexToRgb(serie.color);
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.roundedRect(slot.barX, barY, slot.barW, barH, 4, 4, "F");
        currentTop = barY;
      });
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(P19_CHART_BAR_VALUE_TOP_PX + 1);
      doc.text(resolvePresentation19BarTopLabel(row, total, chart.valueKeys[0]?.label), slot.labelCx, currentTop - 1, {
        align: "center",
        maxWidth: slot.colWidth,
      });
    } else {
      const serie = chart.valueKeys[0];
      const value = Number(row[serie.key] ?? 0);
      const barH = (Math.max(0, value - axisMin) / (maxValue - axisMin)) * chartAreaH;
      const barY = baselineY - barH;
      const barColor = String(row.color ?? palette[idx % palette.length] ?? serie.color);
      const rgb = hexToRgb(barColor);
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.roundedRect(slot.barX, barY, slot.barW, barH, 6, 6, "F");
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(P19_CHART_BAR_VALUE_TOP_PX);
      doc.text(resolvePresentation19BarTopLabel(row, value, serie.label), slot.labelCx, barY - 1, {
        align: "center",
        maxWidth: slot.colWidth,
      });
    }
  });

  if (chart.referenceLineY != null && Number.isFinite(chart.referenceLineY)) {
    const refVal = Number(chart.referenceLineY);
    const refY = baselineY - ((Math.max(0, refVal - axisMin) / (maxValue - axisMin)) * chartAreaH);
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.75);
    if (typeof doc.setLineDashPattern === "function") {
      doc.setLineDashPattern([3, 2], 0);
    }
    const ratios = resolveMunicipalReferenceXRatios(chart);
    const lineX1 = ratios
      ? barsStartX + 4 + ratios.startRatio * (barsW - 8)
      : barsStartX + 4;
    const lineX2 = ratios
      ? barsStartX + 4 + ratios.endRatio * (barsW - 8)
      : barsStartX + barsW - 4;
    doc.line(lineX1, refY, lineX2, refY);
    if (typeof doc.setLineDashPattern === "function") {
      doc.setLineDashPattern([], 0);
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(catFs);
  doc.setTextColor(51, 65, 85);
  chart.data.forEach((row, idx) => {
    const slot = resolveP19VerticalBarColumnSlot(barsStartX, barsW, idx, barCount);
    const catStr = String(row[chart.categoryKey] ?? "");
    const catLines = splitTextToSizeBySpaces(doc, catStr, slot.innerW);
    let labY = baselineY + 6 + catLineH * 0.72;
    catLines.forEach((ln) => {
      doc.text(ln, slot.labelCx, labY, { align: "center", maxWidth: slot.colWidth });
      labY += catLineH;
    });
  });
}

function drawCenteredSectionBlock(
  doc: jsPDF,
  title: string,
  tagline: string | undefined,
  primaryColor: string
): void {
  const maxW = content.w - 80;
  const titleFs = P19_TITLE_FONT_PX;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(titleFs);
  setPdfTextColorFromHex(doc, primaryColor);
  const titleLines = doc.splitTextToSize(title, maxW);
  const titleLineH = p19PdfLineHeightPx(titleFs);
  let y = page.height / 2 - P19_SECTION_CENTER_VERTICAL_OFFSET_PX - (titleLines.length * titleLineH) / 2;
  titleLines.forEach((ln) => {
    doc.text(ln, page.width / 2, y, { align: "center" });
    y += titleLineH;
  });
  if (tagline && tagline.trim()) {
    y += P19_SECTION_TITLE_TAGLINE_GAP_PX;
    const tagFs = P19_SECTION_TAGLINE_PX;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(tagFs);
    doc.setTextColor(82, 82, 91);
    const tagLines = doc.splitTextToSize(tagline, maxW);
    const tagLineH = p19PdfLineHeightPx(tagFs);
    tagLines.forEach((ln) => {
      doc.text(ln, page.width / 2, y, { align: "center" });
      y += tagLineH;
    });
  }
}

function slideLevelsGuidePdf(doc: jsPDF, spec: Presentation19ExportSpec): void {
  const guide = spec.deckData.levelGuide;
  const rowH = P19_LEVELS_GUIDE_ROW_STRIDE_PX;
  guide.forEach((lvl, idx) => {
    const bx = content.x;
    const y = P19_LEVELS_GUIDE_FIRST_ROW_TOP_PX + idx * rowH;
    const w = content.w;
    const h = rowH - 10;
    doc.setDrawColor(...P19_LEVELS_GUIDE_CARD_BORDER_RGB);
    doc.setFillColor(...P19_LEVELS_GUIDE_CARD_FILL_RGB);
    doc.roundedRect(bx, y, w, h, P19_LEVELS_GUIDE_CARD_RADIUS_PX, P19_LEVELS_GUIDE_CARD_RADIUS_PX, "FD");
    const rgb = hexToRgb(lvl.color);
    doc.setFillColor(rgb.r, rgb.g, rgb.b);
    doc.rect(bx, y, 8, h, "F");
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(P19_LEVELS_GUIDE_TITLE_PX);
    doc.text(lvl.label, bx + 18, y + 28);
    doc.setTextColor(63, 63, 70);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(P19_LEVELS_GUIDE_DESC_PX);
    const descLines = doc.splitTextToSize(lvl.description || "", w - 28);
    const lh = p19PdfLineHeightPx(P19_LEVELS_GUIDE_DESC_PX);
    let dy = y + 48;
    descLines.forEach((ln) => {
      doc.text(ln, bx + 18, dy);
      dy += lh;
    });
  });
}

function drawSlide(doc: jsPDF, slide: Presentation19SlideSpec, spec: Presentation19ExportSpec): void {
  const { deckData } = spec;
  drawFrame(doc, deckData.primaryColor);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(24, 24, 27);
  switch (slide.kind) {
    case "cover-main": {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(P19_COVER_MAIN_TITLE_PX);
      setPdfTextColorFromHex(doc, deckData.primaryColor);
      const titleLines = doc.splitTextToSize(deckData.avaliacaoNome || "N/A", content.w - 20);
      const titleLh = p19PdfLineHeightPx(P19_COVER_MAIN_TITLE_PX);
      let ty = 180;
      titleLines.forEach((ln) => {
        doc.text(ln, content.x, ty);
        ty += titleLh;
      });
      if (deckData.coverSubtitle?.trim()) {
        ty += 10;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(P19_COVER_SUBTITLE_FONT_PX);
        doc.setTextColor(51, 65, 85);
        const subLines = doc.splitTextToSize(deckData.coverSubtitle.trim(), content.w - 20);
        const subLh = p19PdfLineHeightPx(P19_COVER_SUBTITLE_FONT_PX);
        subLines.forEach((ln) => {
          doc.text(ln, content.x, ty);
          ty += subLh;
        });
      }
      const cardTop = Math.max(470, ty + 28);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(content.x, cardTop, content.w, 150, 14, 14, "FD");
      const colGap = 32;
      const colW = (content.w - 48 - colGap) / 2;
      const leftX = content.x + 24;
      const rightX = leftX + colW + colGap;
      doc.setTextColor(82, 82, 91);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(P19_COVER_MAIN_LABEL_PX);
      const labelY = cardTop + 40;
      const valueY = cardTop + 75;
      doc.text("MUNICÍPIO", leftX, labelY);
      doc.text("SÉRIE", rightX, labelY);
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(P19_COVER_MAIN_VALUE_PX);
      const munLines = doc.splitTextToSize(deckData.municipioNome || "N/A", colW);
      const serLines = doc.splitTextToSize(deckData.serie || "N/A", colW);
      const valLh = p19PdfLineHeightPx(P19_COVER_MAIN_VALUE_PX);
      let my = valueY;
      munLines.forEach((ln) => {
        doc.text(ln, leftX, my);
        my += valLh;
      });
      let sy = valueY;
      serLines.forEach((ln) => {
        doc.text(ln, rightX, sy);
        sy += valLh;
      });
      break;
    }
    case "cover-school": {
      if (deckData.slide2ShowSerieTurmas) {
        doc.setFont("helvetica", "bold");
        const x = content.x + 24;
        const maxW = content.w - 48;
        const escolaNomeCapa =
          deckData.escolasParticipantes.length === 1
            ? deckData.escolasParticipantes[0] ?? "N/A"
            : deckData.escolasParticipantes.filter(Boolean).join(", ") || "N/A";

        const drawLabelValueBlock = (args: { yTop: number; label: string; value: string; valueFontSize: number }) => {
          const labelFs = P19_SEGMENT_FIELD_LABEL_PX;
          const labelGap = 8;
          const blockGap = 22;

          doc.setFont("helvetica", "bold");
          doc.setFontSize(labelFs);
          doc.setTextColor(82, 82, 91);
          doc.text(args.label, x, args.yTop + labelFs);

          doc.setFont("helvetica", "bold");
          doc.setFontSize(args.valueFontSize);
          doc.setTextColor(24, 24, 27);
          const valueLines = doc.splitTextToSize(args.value, maxW);
          const valueLh = p19PdfLineHeightPx(args.valueFontSize);
          let y = args.yTop + labelFs + labelGap + args.valueFontSize;
          valueLines.forEach((ln) => {
            doc.text(ln, x, y);
            y += valueLh;
          });
          return { yTop: y + blockGap };
        };

        let yTop = 200;
        ({ yTop } = drawLabelValueBlock({
          yTop,
          label: "ESCOLA",
          value: escolaNomeCapa,
          valueFontSize: P19_SEGMENT_FIELD_VALUE_PX,
        }));
        ({ yTop } = drawLabelValueBlock({ yTop, label: "SÉRIE", value: deckData.serie || "N/A", valueFontSize: P19_SEGMENT_FIELD_VALUE_PX }));
        if (deckData.turno?.trim()) {
          ({ yTop } = drawLabelValueBlock({
            yTop,
            label: "TURNO",
            value: deckData.turno,
            valueFontSize: P19_SEGMENT_FIELD_VALUE_PX,
          }));
        }
        const turmaBody =
          deckData.turmasParticipantesCapa.length > 8
            ? deckData.turmasParticipantesCapa.map((t) => `• ${t}`).join("\n")
            : deckData.turma || "N/A";
        const fsTurma = turmaBody.length > 200 ? 16 : turmaBody.length > 100 ? 20 : 28;
        drawLabelValueBlock({
          yTop,
          label: deckData.turmasParticipantesCapa.length > 1 ? "TURMAS" : "TURMA",
          value: turmaBody,
          valueFontSize: fsTurma,
        });
        break;
      }

      doc.setFont("helvetica", "bold");
      const escolas = deckData.escolasParticipantes;
      if (escolas.length <= 1) {
        doc.setFontSize(P19_COVER_SCHOOL_SINGLE_PX);
        const lines = doc.splitTextToSize(escolas[0] || "N/A", content.w - 40);
        const lh = p19PdfLineHeightPx(P19_COVER_SCHOOL_SINGLE_PX);
        const startY = page.height / 2 - (lines.length * lh) / 2;
        let yy = startY;
        lines.forEach((ln) => {
          doc.text(ln, page.width / 2, yy, { align: "center" });
          yy += lh;
        });
      } else {
        doc.setTextColor(82, 82, 91);
        doc.setFontSize(P19_COVER_SCHOOL_MULTI_HEADER_PX);
        doc.text("ESCOLAS PARTICIPANTES", page.width / 2, 180, { align: "center" });
        doc.setTextColor(15, 23, 42);
        const colCount = presentation19CoverSchoolColumnCount(escolas.length);
        const colGap = 28;
        const maxW = (content.w - 32 - colGap * (colCount - 1)) / colCount;
        const fs = presentation19CoverSchoolListFontPx(escolas.length);
        doc.setFontSize(fs);
        const xStart = content.x + 16;
        const lh = p19PdfLineHeightPx(fs);
        const perCol = Math.ceil(escolas.length / colCount);
        const cols: string[][] = Array.from({ length: colCount }, () => []);
        escolas.forEach((s, i) => {
          cols[Math.floor(i / perCol)]!.push(s);
        });
        const colXs = cols.map((_, ci) => xStart + ci * (maxW + colGap));
        const colYs = cols.map(() => 200);
        cols.forEach((colItems, ci) => {
          let y = colYs[ci]!;
          for (const s of colItems) {
            const name = String(s || "—").trim() || "—";
            const lines = splitTextToSizeBySpaces(doc, `• ${name}`, maxW);
            doc.text(lines, colXs[ci]!, y);
            y += lines.length * lh + Math.max(3, lh * 0.2);
          }
        });
      }
      break;
    }
    case "metric-total-students":
      doc.setFont("helvetica", "bold");
      doc.setTextColor(82, 82, 91);
      doc.setFontSize(P19_METRIC_HEADER_PX);
      doc.text("MÉTRICA GERAL", page.width / 2, 280, { align: "center" });
      setPdfTextColorFromHex(doc, deckData.primaryColor);
      doc.setFontSize(P19_METRIC_NUMBER_PX);
      doc.text(Math.round(deckData.totalAlunosParticiparam).toLocaleString("pt-BR"), page.width / 2, 380, { align: "center" });
      doc.setTextColor(51, 65, 85);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(P19_METRIC_HEADER_PX);
      doc.text("Alunos que realizaram a avaliação", page.width / 2, 440, { align: "center" });
      break;
    case "cover-segment": {
      drawWrappedSlideTitle(doc, "CAPA DE SEGMENTO", deckData.primaryColor, P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX, content.w - P19_TITLE_TEXT_OFFSET_X_PX);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(content.x, 160, content.w, 440, 14, 14, "F");
      doc.setFont("helvetica", "bold");
      const x = content.x + 24;
      const maxW = content.w - 48;

      // Em jsPDF o Y é baseline; controlamos tudo em "top" para evitar sobreposição.
      const drawLabelValueBlock = (args: { yTop: number; label: string; value: string; valueFontSize: number; valueBold?: boolean }) => {
        const labelFs = P19_SEGMENT_FIELD_LABEL_PX;
        const labelGap = 8; // espaço real entre rótulo e valor
        const blockGap = 18; // espaço real entre blocos

        doc.setFont("helvetica", "bold");
        doc.setFontSize(labelFs);
        doc.setTextColor(82, 82, 91);
        doc.text(args.label, x, args.yTop + labelFs);

        doc.setFont("helvetica", args.valueBold === false ? "normal" : "bold");
        doc.setFontSize(args.valueFontSize);
        doc.setTextColor(24, 24, 27);
        const valueLines = doc.splitTextToSize(args.value, maxW);
        const valueLh = p19PdfLineHeightPx(args.valueFontSize);
        let y = args.yTop + labelFs + labelGap + args.valueFontSize;
        valueLines.forEach((ln) => {
          doc.text(ln, x, y);
          y += valueLh;
        });
        return { yTop: y + blockGap };
      };

      let yTop = 190;
      ({ yTop } = drawLabelValueBlock({ yTop, label: "CURSO", value: deckData.curso, valueFontSize: P19_SEGMENT_FIELD_VALUE_PX }));
      ({ yTop } = drawLabelValueBlock({ yTop, label: "SÉRIE", value: deckData.serie, valueFontSize: P19_SEGMENT_FIELD_VALUE_PX }));
      if (deckData.turno?.trim()) {
        ({ yTop } = drawLabelValueBlock({
          yTop,
          label: "TURNO",
          value: deckData.turno,
          valueFontSize: P19_SEGMENT_FIELD_VALUE_PX,
        }));
      }

      if (deckData.comparisonAxis !== "escola") {
        const turmaBody =
          deckData.turmasParticipantesCapa.length > 8
            ? deckData.turmasParticipantesCapa.map((t) => `• ${t}`).join("\n")
            : deckData.turma;
        const fsTurma = turmaBody.length > 200 ? 16 : turmaBody.length > 100 ? 20 : 28;
        ({ yTop } = drawLabelValueBlock({
          yTop,
          label: deckData.turmasParticipantesCapa.length > 1 ? "TURMAS" : "TURMA",
          value: turmaBody,
          valueFontSize: fsTurma,
        }));
      }
      break;
    }
    case "presence-table": {
      const titleText = presentationTitleTablePresence(deckData.comparisonAxis);
      const titleMaxW = content.w - P19_TITLE_TEXT_OFFSET_X_PX;
      const yAfter = drawWrappedSlideTitle(doc, titleText, deckData.primaryColor, P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX, titleMaxW);
      const tableStartY = yAfter + P19_TITLE_TO_BODY_GAP_PX;
      const pctValues = slide.presencePctValues ?? [];
      autoTable(doc, {
        startY: tableStartY,
        margin: { left: content.x, right: content.x },
        head: [slide.table.columns],
        body: slide.table.rows,
        styles: {
          fontSize: P19_TABLE_CELL_FONT_PX,
          lineColor: [226, 232, 240],
          lineWidth: 1,
          cellPadding: P19_TABLE_CELL_PADDING_PX,
          fillColor: [252, 252, 253],
          textColor: [15, 23, 42],
        },
        headStyles: { fillColor: [226, 232, 240], textColor: [51, 65, 85], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        columnStyles: Object.fromEntries(slide.table.columns.map((_, i) => [i, { halign: i === 0 ? "left" : "center" }])),
        didParseCell: (data) => {
          if (data.section !== "body" || data.column.index !== 3) return;
          const pct = pctValues[data.row.index];
          if (pct == null || !Number.isFinite(pct)) return;
          const { background, color } = presenceTablePctCellColors(pct);
          const bg = hexToRgb(background);
          const fg = hexToRgb(color);
          data.cell.styles.fillColor = [bg.r, bg.g, bg.b];
          data.cell.styles.textColor = [fg.r, fg.g, fg.b];
          data.cell.styles.fontStyle = "bold";
        },
      });
      break;
    }
    case "grades-table": {
      const titleText = presentationTitleTableGrades(deckData.comparisonAxis);
      const titleMaxW = content.w - P19_TITLE_TEXT_OFFSET_X_PX;
      const yAfter = drawWrappedSlideTitle(doc, titleText, deckData.primaryColor, P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX, titleMaxW);
      const tableStartY = yAfter + P19_TITLE_TO_BODY_GAP_PX;
      autoTable(doc, {
        startY: tableStartY,
        margin: { left: content.x, right: content.x },
        head: [slide.table.columns],
        body: slide.table.rows,
        styles: {
          fontSize: P19_TABLE_CELL_FONT_PX,
          lineColor: [226, 232, 240],
          lineWidth: 1,
          cellPadding: P19_TABLE_CELL_PADDING_PX,
          fillColor: [252, 252, 253],
          textColor: [15, 23, 42],
        },
        headStyles: { fillColor: [226, 232, 240], textColor: [51, 65, 85], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        columnStyles: Object.fromEntries(slide.table.columns.map((_, i) => [i, { halign: i === 0 ? "left" : "center" }])),
      });
      break;
    }
    case "grades-no-turma-notice": {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(180, 83, 9);
      const lines = doc.splitTextToSize(PRESENTATION19_GRADES_NO_TURMA_NOTICE, content.w - 80);
      const lh = p19PdfLineHeightPx(18);
      let y = page.height / 2 - (lines.length * lh) / 2;
      lines.forEach((ln) => {
        doc.text(ln, page.width / 2, y, { align: "center" });
        y += lh;
      });
      break;
    }
    case "questions-table": {
      const titleText =
        slide.questionsSubsection?.kind === "geral"
          ? "TABELA DE QUESTÕES — GERAL"
          : slide.questionsSubsection?.kind === "serie-geral"
            ? presentationTitleQuestionsSerieGeral(slide.questionsSubsection.serieLabel)
            : slide.questionsSubsection?.kind === "turma"
              ? `TABELA DE QUESTÕES — TURMA ${slide.questionsSubsection.turmaNome}`
              : "TABELA DE QUESTÕES";
      const pageInfo = slide.questionsPage;
      const titleMaxW =
        pageInfo != null && pageInfo.total > 1
          ? content.w - P19_QUESTIONS_PAGE_INDICATOR_RIGHT_PAD_PX
          : content.w - P19_TITLE_TEXT_OFFSET_X_PX;
      const yAfter = drawWrappedSlideTitle(doc, titleText, deckData.primaryColor, P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX, titleMaxW);
      if (pageInfo != null && pageInfo.total > 1) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(P19_PAGE_INDICATOR_FONT_PX);
        doc.setTextColor(82, 82, 91);
        doc.text(`Página ${pageInfo.current}/${pageInfo.total}`, content.x + content.w, P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX, { align: "right" });
      }
      const tableStartY = yAfter + P19_TITLE_TO_BODY_GAP_PX;
      const levels = slide.questionRowLevels;
      const qCols = slide.table.columns.length;
      const qW = content.w;
      const qWidths =
        qCols === 4
          ? {
              0: { cellWidth: qW * 0.09, halign: "center" as const },
              1: { cellWidth: qW * 0.16, halign: "left" as const },
              2: { cellWidth: qW * 0.58, halign: "left" as const },
              3: { cellWidth: qW * 0.12, halign: "center" as const },
            }
          : undefined;
      autoTable(doc, {
        startY: tableStartY,
        margin: { left: content.x, right: content.x },
        head: [slide.table.columns],
        body: slide.table.rows,
        styles: {
          fontSize: P19_TABLE_CELL_FONT_PX,
          lineColor: [226, 232, 240],
          lineWidth: 1,
          cellPadding: P19_TABLE_CELL_PADDING_PX,
          fillColor: [252, 252, 253],
          textColor: [15, 23, 42],
          overflow: "linebreak",
        },
        headStyles: { fillColor: [226, 232, 240], textColor: [51, 65, 85], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        columnStyles: qWidths,
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 2) {
            data.cell.styles.fontSize = P19_TABLE_QUESTIONS_DESC_FONT_PX;
          }
          if (!levels?.length || data.section !== "body") return;
          const lvl = levels[data.row.index];
          if (!lvl) return;
          const st = P19_QUESTION_NUM_LEVEL_STYLE[lvl];
          data.cell.styles.fillColor = st.pdfFill;
          data.cell.styles.textColor = st.pdfText;
          data.cell.styles.fontStyle = "bold";
        },
      });
      break;
    }
    case "questions-accuracy-chart": {
      const pageInfo = slide.accuracyPage;
      const titleMaxW =
        pageInfo != null && pageInfo.total > 1
          ? content.w - P19_QUESTIONS_PAGE_INDICATOR_RIGHT_PAD_PX
          : content.w - P19_TITLE_TEXT_OFFSET_X_PX;
      const yb = drawWrappedSlideTitle(
        doc,
        "PORCENTAGEM DE ACERTOS",
        deckData.primaryColor,
        P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX,
        titleMaxW
      );
      if (pageInfo != null && pageInfo.total > 1) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(P19_PAGE_INDICATOR_FONT_PX);
        doc.setTextColor(82, 82, 91);
        doc.text(`Página ${pageInfo.current}/${pageInfo.total}`, content.x + content.w, P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX, { align: "right" });
      }
      const chartY = yb + P19_TITLE_TO_ACCURACY_CHART_GAP_PX;
      const chartH = page.height - chartY - P19_SLIDE_FOOTER_RESERVE_PX;
      const inset = P19_TITLE_TEXT_OFFSET_X_PX;
      drawBarChart(doc, slide.chart, {
        x: content.x + inset,
        y: chartY,
        w: content.w - inset * 2,
        h: Math.max(P19_CHART_AREA_MIN_HEIGHT_PX, chartH),
      });
      break;
    }
    case "levels-table": {
      const titleText = niveisAprendizagemTituloPorEixo(deckData.comparisonAxis);
      const titleMaxW = content.w - P19_TITLE_TEXT_OFFSET_X_PX;
      const yAfter = drawWrappedSlideTitle(doc, titleText, deckData.primaryColor, P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX, titleMaxW);
      let tableStartY = yAfter + P19_TITLE_TO_BODY_GAP_PX;
      if (slide.escolaNome) {
        tableStartY =
          drawWrappedSubtitle(doc, slide.escolaNome, yAfter + P19_TITLE_TO_SUBTITLE_GAP_PX, content.w - P19_TITLE_TEXT_OFFSET_X_PX) +
          P19_ESCOLA_SUBTITLE_TO_TABLE_GAP_PX;
      }
      autoTable(doc, {
        startY: tableStartY,
        margin: { left: content.x, right: content.x },
        head: [slide.table.columns],
        body: slide.table.rows,
        styles: {
          fontSize: P19_TABLE_CELL_FONT_PX,
          lineColor: [226, 232, 240],
          lineWidth: 1,
          cellPadding: P19_TABLE_CELL_PADDING_PX,
          fillColor: [252, 252, 253],
          textColor: [15, 23, 42],
        },
        headStyles: { fillColor: [226, 232, 240], textColor: [51, 65, 85], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        columnStyles: Object.fromEntries(
          slide.table.columns.map((_, i) => [i, { halign: i === 0 ? ("left" as const) : ("center" as const) }])
        ),
        didParseCell: (data) => {
          if (data.section === "head" && data.column.index >= 1 && data.column.index <= 4) {
            const hx = P19_LEVELS_TABLE_LEVEL_HEADER_BG_HEX[data.column.index - 1];
            const rgb = hexToRgb(`#${hx}`);
            data.cell.styles.fillColor = [rgb.r, rgb.g, rgb.b];
            data.cell.styles.textColor = [248, 250, 252];
          }
          if (data.section === "body") {
            const row = data.row.raw as unknown[] | undefined;
            if (row && String(row[0]) === "TOTAL GERAL") {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [226, 232, 240];
            }
          }
        },
      });
      break;
    }
    case "presence-chart": {
      const titleMaxW = content.w - P19_TITLE_TEXT_OFFSET_X_PX;
      const yb = drawWrappedSlideTitle(
        doc,
        presentationTitleChartPresence(deckData.comparisonAxis),
        deckData.primaryColor,
        P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX,
        titleMaxW
      );
      const chartY =
        drawWrappedSubtitle(doc, P19_CHART_SUBTITLE_PRESENCE, yb + P19_TITLE_TO_SUBTITLE_GAP_PX, titleMaxW) + P19_SUBTITLE_TO_CHART_GAP_PX;
      const chartH = page.height - chartY - P19_SLIDE_FOOTER_RESERVE_PX;
      drawBarChart(doc, slide.chart, {
        x: content.x,
        y: chartY,
        w: content.w,
        h: Math.max(P19_CHART_AREA_MIN_HEIGHT_PX, chartH),
      });
      break;
    }
    case "section-levels":
      drawCenteredSectionBlock(doc, presentationSectionLevels(deckData.comparisonAxis), presentationSectionLevelsTagline(deckData.comparisonAxis), deckData.primaryColor);
      break;
    case "levels-guide":
      drawWrappedSlideTitle(doc, "GUIA DE NÍVEIS DE APRENDIZAGEM", deckData.primaryColor, P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX, content.w - P19_TITLE_TEXT_OFFSET_X_PX);
      slideLevelsGuidePdf(doc, spec);
      break;
    case "levels-chart": {
      const yb = drawWrappedSlideTitle(
        doc,
        presentationTitleChartLevels(deckData.comparisonAxis),
        deckData.primaryColor,
        P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX,
        content.w - P19_TITLE_TEXT_OFFSET_X_PX
      );
      let chartY = yb + P19_TITLE_TO_BODY_GAP_PX;
      if (slide.escolaNome) {
        chartY =
          drawWrappedSubtitle(doc, slide.escolaNome, yb + P19_TITLE_TO_SUBTITLE_GAP_PX, content.w - P19_TITLE_TEXT_OFFSET_X_PX) +
          P19_SUBTITLE_TO_CHART_GAP_PX;
      }
      const chartH = page.height - chartY - P19_SLIDE_FOOTER_RESERVE_PX;
      const inset = P19_TITLE_TEXT_OFFSET_X_PX;
      drawBarChart(doc, slide.chart, {
        x: content.x + inset,
        y: chartY,
        w: content.w - inset * 2,
        h: Math.max(P19_CHART_AREA_MIN_HEIGHT_PX, chartH),
      });
      break;
    }
    case "section-proficiency":
      drawCenteredSectionBlock(
        doc,
        presentationSectionProficiency(deckData.comparisonAxis),
        presentationSectionProficiencyTagline(deckData.comparisonAxis),
        deckData.primaryColor
      );
      break;
    case "proficiency-general-table": {
      const titleText = presentationTitleTableProficiency(deckData.comparisonAxis);
      const titleMaxW = content.w - P19_TITLE_TEXT_OFFSET_X_PX;
      const yAfter = drawWrappedSlideTitle(doc, titleText, deckData.primaryColor, P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX, titleMaxW);
      const tableStartY = yAfter + P19_TITLE_TO_BODY_GAP_PX;
      autoTable(doc, {
        startY: tableStartY,
        margin: { left: content.x, right: content.x },
        head: [slide.table.columns],
        body: slide.table.rows,
        styles: {
          fontSize: P19_TABLE_CELL_FONT_PX,
          lineColor: [226, 232, 240],
          lineWidth: 1,
          cellPadding: P19_TABLE_CELL_PADDING_PX,
          fillColor: [252, 252, 253],
          textColor: [15, 23, 42],
        },
        headStyles: { fillColor: [226, 232, 240], textColor: [51, 65, 85], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        columnStyles: Object.fromEntries(slide.table.columns.map((_, i) => [i, { halign: i === 0 ? "left" : "center" }])),
      });
      break;
    }
    case "proficiency-general-chart": {
      const yb = drawWrappedSlideTitle(
        doc,
        presentationTitleProficiencyGeneralChart(deckData.comparisonAxis),
        deckData.primaryColor,
        P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX,
        content.w - P19_TITLE_TEXT_OFFSET_X_PX
      );
      let chartY = yb + P19_TITLE_TO_BODY_GAP_PX;
      const profSub = [slide.escolaNome, P19_CHART_SUBTITLE_PROFICIENCY].filter(Boolean).join(" • ");
      if (profSub.trim()) {
        chartY =
          drawWrappedSubtitle(doc, profSub, yb + P19_TITLE_TO_SUBTITLE_GAP_PX, content.w - P19_TITLE_TEXT_OFFSET_X_PX) +
          P19_SUBTITLE_TO_CHART_GAP_PX;
      }
      const chartH = page.height - chartY - P19_SLIDE_FOOTER_RESERVE_PX;
      const profInset = P19_TITLE_TEXT_OFFSET_X_PX;
      drawBarChart(doc, slide.chart, {
        x: content.x + profInset,
        y: chartY,
        w: content.w - profInset,
        h: Math.max(P19_CHART_AREA_MIN_HEIGHT_PX, chartH),
      });
      break;
    }
    case "proficiency-by-discipline-chart": {
      const yb = drawWrappedSlideTitle(
        doc,
        presentationTitleProficiencyByDiscipline(deckData.comparisonAxis),
        deckData.primaryColor,
        P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX,
        content.w - P19_TITLE_TEXT_OFFSET_X_PX
      );
      let gridTop = yb + P19_TITLE_TO_BODY_GAP_PX;
      if (slide.escolaNome) {
        gridTop =
          drawWrappedSubtitle(doc, slide.escolaNome, yb + P19_TITLE_TO_SUBTITLE_GAP_PX, content.w - P19_TITLE_TEXT_OFFSET_X_PX) +
          P19_SUBTITLE_TO_CHART_GAP_PX;
      }
      const profInset = P19_TITLE_TEXT_OFFSET_X_PX;
      const gridLeft = content.x + profInset;
      const gridW = content.w - profInset;
      const gridPad = 8;
      /** Uma coluna: um gráfico por linha, largura total. */
      const boxW = gridW - gridPad * 2;
      const footerReserve = P19_SLIDE_FOOTER_RESERVE_PX;
      const rowGap = 10;
      const nCharts = slide.charts.length;
      const boxH = Math.max(
        120,
        (page.height - gridTop - footerReserve - Math.max(0, nCharts - 1) * rowGap) / Math.max(1, nCharts)
      );
      slide.charts.forEach((entry, idx) => {
        const boxX = gridLeft + gridPad;
        const boxY = gridTop + idx * (boxH + rowGap);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(212, 212, 216);
        doc.roundedRect(boxX, boxY, boxW, boxH, 10, 10, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(P19_CHART_H_BAR_LABEL_PX + 2);
        const tlines = doc.splitTextToSize(entry.title, boxW - 16);
        const tlh = p19PdfLineHeightPx(P19_CHART_H_BAR_LABEL_PX + 2);
        let tty = boxY + 16;
        tlines.forEach((ln) => {
          doc.text(ln, boxX + 8, tty);
          tty += tlh;
        });
        const chartInnerTop = tty + 4;
        const innerH = Math.max(80, boxY + boxH - chartInnerTop - 8);
        drawBarChart(doc, entry.chart, { x: boxX + 8, y: chartInnerTop, w: boxW - 16, h: innerH });
      });
      break;
    }
    case "grades-by-discipline-chart": {
      const yb = drawWrappedSlideTitle(
        doc,
        presentationTitleGradesByDiscipline(deckData.comparisonAxis),
        deckData.primaryColor,
        P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX,
        content.w - P19_TITLE_TEXT_OFFSET_X_PX
      );
      let gridTop = yb + P19_TITLE_TO_BODY_GAP_PX;
      if (slide.escolaNome) {
        gridTop =
          drawWrappedSubtitle(doc, slide.escolaNome, yb + P19_TITLE_TO_SUBTITLE_GAP_PX, content.w - P19_TITLE_TEXT_OFFSET_X_PX) +
          P19_SUBTITLE_TO_CHART_GAP_PX;
      }
      const profInset = P19_TITLE_TEXT_OFFSET_X_PX;
      const gridLeft = content.x + profInset;
      const gridW = content.w - profInset;
      const gridPad = 8;
      const boxW = gridW - gridPad * 2;
      const footerReserve = P19_SLIDE_FOOTER_RESERVE_PX;
      const rowGap = 10;
      const nCharts = slide.charts.length;
      const boxH = Math.max(
        120,
        (page.height - gridTop - footerReserve - Math.max(0, nCharts - 1) * rowGap) / Math.max(1, nCharts)
      );
      slide.charts.forEach((entry, idx) => {
        const boxX = gridLeft + gridPad;
        const boxY = gridTop + idx * (boxH + rowGap);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(212, 212, 216);
        doc.roundedRect(boxX, boxY, boxW, boxH, 10, 10, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(P19_CHART_H_BAR_LABEL_PX + 2);
        const tlines = doc.splitTextToSize(entry.title, boxW - 16);
        const tlh = p19PdfLineHeightPx(P19_CHART_H_BAR_LABEL_PX + 2);
        let tty = boxY + 16;
        tlines.forEach((ln) => {
          doc.text(ln, boxX + 8, tty);
          tty += tlh;
        });
        const chartInnerTop = tty + 4;
        const innerH = Math.max(80, boxY + boxH - chartInnerTop - 8);
        drawBarChart(doc, entry.chart, { x: boxX + 8, y: chartInnerTop, w: boxW - 16, h: innerH });
      });
      break;
    }
    case "section-grades":
      drawCenteredSectionBlock(
        doc,
        presentationSectionGrades(deckData.comparisonAxis),
        presentationSectionGradesTagline(deckData.comparisonAxis),
        deckData.primaryColor
      );
      break;
    case "grades-chart": {
      const yb = drawWrappedSlideTitle(
        doc,
        presentationTitleChartGrades(deckData.comparisonAxis),
        deckData.primaryColor,
        P19_SLIDE_TITLE_FIRST_BASELINE_Y_PX,
        content.w - P19_TITLE_TEXT_OFFSET_X_PX
      );
      let chartY = yb + P19_TITLE_TO_BODY_GAP_PX;
      const gradesSub = [slide.escolaNome, P19_CHART_SUBTITLE_GRADES].filter(Boolean).join(" • ");
      if (gradesSub.trim()) {
        chartY =
          drawWrappedSubtitle(doc, gradesSub, yb + P19_TITLE_TO_SUBTITLE_GAP_PX, content.w - P19_TITLE_TEXT_OFFSET_X_PX) +
          P19_SUBTITLE_TO_CHART_GAP_PX;
      }
      const chartH = page.height - chartY - P19_SLIDE_FOOTER_RESERVE_PX;
      drawBarChart(doc, slide.chart, {
        x: content.x,
        y: chartY,
        w: content.w,
        h: Math.max(P19_CHART_AREA_MIN_HEIGHT_PX, chartH),
      });
      break;
    }
    case "section-questions":
      drawCenteredSectionBlock(doc, presentationSectionQuestionsTitle(), presentationSectionQuestionsTagline(), deckData.primaryColor);
      break;
    case "dynamic-series-cover": {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(P19_DYNAMIC_COVER_PX);
      setPdfTextColorFromHex(doc, deckData.primaryColor);
      const lines = doc.splitTextToSize(`[${deckData.serieNomeCapas}]`, content.w - 80);
      const lh = p19PdfLineHeightPx(P19_DYNAMIC_COVER_PX);
      let yy = page.height / 2 - (lines.length * lh) / 2;
      lines.forEach((ln) => {
        doc.text(ln, page.width / 2, yy, { align: "center" });
        yy += lh;
      });
      break;
    }
    case "dynamic-class-cover": {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(P19_DYNAMIC_COVER_PX);
      setPdfTextColorFromHex(doc, deckData.primaryColor);
      const lines = doc.splitTextToSize(`[${deckData.turmaNomeCapas}]`, content.w - 80);
      const lh = p19PdfLineHeightPx(P19_DYNAMIC_COVER_PX);
      let yy = page.height / 2 - (lines.length * lh) / 2;
      lines.forEach((ln) => {
        doc.text(ln, page.width / 2, yy, { align: "center" });
        yy += lh;
      });
      break;
    }
    case "questions-turma-cover": {
      const line = presentationQuestionsTurmaCoverLine(slide.serieLabel, slide.turmaNome);
      doc.setFont("helvetica", "bold");
      const fs = line.length > 120 ? 22 : line.length > 80 ? 26 : 32;
      doc.setFontSize(fs);
      setPdfTextColorFromHex(doc, deckData.primaryColor);
      const lines = doc.splitTextToSize(line, content.w - 80);
      const lineHeight = fs * 1.25;
      const totalH = lines.length * lineHeight;
      let y = page.height / 2 - totalH / 2 + lineHeight * 0.35;
      lines.forEach((ln) => {
        doc.text(ln, page.width / 2, y, { align: "center" });
        y += lineHeight;
      });
      break;
    }
    case "thank-you":
      doc.setFont("helvetica", "bold");
      doc.setFontSize(P19_THANK_YOU_FONT_PX);
      setPdfTextColorFromHex(doc, deckData.primaryColor);
      doc.text(deckData.closingMessage || "Obrigado!!", page.width / 2, page.height / 2, { align: "center" });
      break;
  }
  drawDeckFooter(doc, deckData);
  drawDeckLogo(doc, deckData);
}

export async function renderPdfFromSlideSpec(args: RenderPdfArgs): Promise<void> {
  const { spec, fileName } = args;
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [page.width, page.height],
    compress: true,
    // Mantém a escala coerente ao usar unidade "px" (evita divergência vs CSS px do preview).
    hotfixes: ["px_scaling"],
  });
  spec.slides.forEach((slide, idx) => {
    if (idx > 0) doc.addPage([page.width, page.height], "landscape");
    drawSlide(doc, slide, spec);
  });
  doc.save(fileName);
}
