import { jsPDF } from "jspdf";
import type { PdfImageAsset } from "@/utils/pdfCityBranding";
import { downloadBlob } from "@/services/reports/hierarchicalDownload";
import type {
  EtiquetaEditItem,
  EtiquetaTextoLivreAlinhamento,
  EtiquetasDadosResponse,
} from "@/types/etiquetas";
import { parseBoldMarkers, truncateText } from "@/utils/richTextMarkers";
import { etiquetasSerieTurmaLine, etiquetasTurnoLabel } from "@/utils/etiquetasDisplay";

const PAGE_MARGIN = 10;
const COLS = 2;
const ROWS = 4;
const GAP_X = 4;
const GAP_Y = 4;
const LABELS_PER_PAGE = COLS * ROWS;
const LOGO_WIDTH = 8;
const TEXTO_ACIMA_ASSINATURA_MAX = 50;

const PAD = 3;
const RODAPE_BLOCK_H = 4.8;

type Rgb = [number, number, number];

type TextPart = {
  text: string;
  underline?: boolean;
  bold?: boolean;
};

type RichToken = {
  text: string;
  bold: boolean;
};

type RichLine = RichToken[];

function normalizeSpaces(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function preserveParagraphs(value: string): string {
  return String(value || "").replace(/\r\n/g, "\n");
}

function hexToRgb(hex: string): Rgb {
  const normalized = hex.replace("#", "").trim();
  if (normalized.length === 3) {
    const r = parseInt(normalized[0] + normalized[0], 16);
    const g = parseInt(normalized[1] + normalized[1], 16);
    const b = parseInt(normalized[2] + normalized[2], 16);
    return [r, g, b];
  }
  if (normalized.length === 6) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    if ([r, g, b].every((channel) => Number.isFinite(channel))) {
      return [r, g, b];
    }
  }
  return [0, 0, 0];
}

function lineHeightFor(fontSize: number): number {
  return fontSize * 0.42 + 1.2;
}

function measureTokenWidth(doc: jsPDF, token: RichToken, fontSize: number): number {
  doc.setFont("helvetica", token.bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  return doc.getTextWidth(token.text);
}

function splitOversizedToken(doc: jsPDF, token: RichToken, maxWidth: number, fontSize: number): RichToken[] {
  if (measureTokenWidth(doc, token, fontSize) <= maxWidth) return [token];

  const parts: RichToken[] = [];
  let chunk = "";
  for (const char of token.text) {
    const candidate = chunk + char;
    if (chunk && measureTokenWidth(doc, { text: candidate, bold: token.bold }, fontSize) > maxWidth) {
      parts.push({ text: chunk, bold: token.bold });
      chunk = char;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) parts.push({ text: chunk, bold: token.bold });
  return parts.length ? parts : [token];
}

function segmentsToTokens(text: string): RichToken[] {
  const segments = parseBoldMarkers(text);
  const tokens: RichToken[] = [];

  segments.forEach((segment) => {
    const chunks = segment.text.split(/(\s+)/).filter(Boolean);
    chunks.forEach((chunk) => tokens.push({ text: chunk, bold: segment.bold }));
  });

  return tokens;
}

function packTokensIntoLines(doc: jsPDF, tokens: RichToken[], maxWidth: number, fontSize: number): RichLine[] {
  const expandedTokens = tokens.flatMap((token) => splitOversizedToken(doc, token, maxWidth, fontSize));
  const lines: RichLine[] = [];
  let currentLine: RichLine = [];
  let currentWidth = 0;

  expandedTokens.forEach((token) => {
    const tokenWidth = measureTokenWidth(doc, token, fontSize);
    const isWhitespace = /^\s+$/.test(token.text);

    if (currentLine.length > 0 && currentWidth + tokenWidth > maxWidth) {
      lines.push(currentLine);
      currentLine = [];
      currentWidth = 0;
      if (isWhitespace) return;
    }

    currentLine.push(token);
    currentWidth += tokenWidth;
  });

  if (currentLine.length) lines.push(currentLine);
  return lines;
}

function buildRichLines(doc: jsPDF, text: string, maxWidth: number, fontSize: number): RichLine[] {
  const paragraphs = preserveParagraphs(text).split("\n");
  const lines: RichLine[] = [];

  paragraphs.forEach((paragraph, index) => {
    const content = paragraph.replace(/\s+/g, " ").trim();
    if (!content) {
      if (index < paragraphs.length - 1) lines.push([]);
      return;
    }
    lines.push(...packTokensIntoLines(doc, segmentsToTokens(content), maxWidth, fontSize));
    if (index < paragraphs.length - 1) lines.push([]);
  });

  return lines;
}

function measureRichLineWidth(doc: jsPDF, line: RichLine, fontSize: number): number {
  return line.reduce((total, token) => total + measureTokenWidth(doc, token, fontSize), 0);
}

function drawRichLine(
  doc: jsPDF,
  line: RichLine,
  areaX: number,
  areaW: number,
  y: number,
  fontSize: number,
  align: EtiquetaTextoLivreAlinhamento,
  color: Rgb
) {
  if (!line.length) return;

  const lineWidth = measureRichLineWidth(doc, line, fontSize);
  let x = areaX;
  if (align === "center") x = areaX + Math.max(0, (areaW - lineWidth) / 2);
  if (align === "right") x = areaX + Math.max(0, areaW - lineWidth);

  doc.setTextColor(...color);
  line.forEach((token) => {
    doc.setFont("helvetica", token.bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    doc.text(token.text, x, y);
    x += doc.getTextWidth(token.text);
  });
  doc.setTextColor(0, 0, 0);
}

function drawAlignedRichText(
  doc: jsPDF,
  text: string,
  areaX: number,
  areaY: number,
  areaW: number,
  areaH: number,
  fontSize: number,
  align: EtiquetaTextoLivreAlinhamento,
  color: Rgb
) {
  const content = preserveParagraphs(text).trim();
  if (!content || areaH <= 1) return;

  const lineHeight = lineHeightFor(fontSize);
  const lines = buildRichLines(doc, content, areaW, fontSize);
  if (!lines.length) return;

  const totalHeight = lines.length * lineHeight;
  let cursorY = areaY + Math.max(0, (areaH - totalHeight) / 2) + fontSize * 0.35;

  lines.forEach((line) => {
    if (cursorY > areaY + areaH + fontSize * 0.2) return;
    drawRichLine(doc, line, areaX, areaW, cursorY, fontSize, align, color);
    cursorY += lineHeight;
  });
}

function measurePartsWidth(doc: jsPDF, parts: TextPart[], fontSize: number): number {
  return parts.reduce((total, part) => {
    doc.setFont("helvetica", part.bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    return total + doc.getTextWidth(part.text);
  }, 0);
}

function drawCenteredParts(
  doc: jsPDF,
  parts: TextPart[],
  centerX: number,
  y: number,
  fontSize: number
) {
  const totalWidth = measurePartsWidth(doc, parts, fontSize);
  let x = centerX - totalWidth / 2;

  parts.forEach((part) => {
    doc.setFont("helvetica", part.bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(0, 0, 0);
    doc.text(part.text, x, y);
    if (part.underline) {
      const labelWidth = doc.getTextWidth(part.text);
      doc.setLineWidth(0.2);
      doc.line(x, y + 0.55, x + labelWidth, y + 0.55);
    }
    x += doc.getTextWidth(part.text);
  });
}

function drawCenteredWrapped(
  doc: jsPDF,
  text: string,
  centerX: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  opts?: { style?: "normal" | "bold"; uppercase?: boolean; maxLines?: number }
): number {
  const content = normalizeSpaces(text);
  if (!content) return y;

  const lh = lineHeightFor(fontSize);
  doc.setFont("helvetica", opts?.style ?? "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(0, 0, 0);

  const printable = opts?.uppercase ? content.toUpperCase() : content;
  let lines = doc.splitTextToSize(printable, maxWidth) as string[];
  if (opts?.maxLines) lines = lines.slice(0, opts.maxLines);

  lines.forEach((line) => {
    doc.text(line, centerX, y, { align: "center" });
    y += lh;
  });

  return y;
}

function drawWrappedTextLeft(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  opts?: { style?: "normal" | "bold"; uppercase?: boolean; maxLines?: number; lineHeight?: number }
): number {
  const content = normalizeSpaces(text);
  if (!content) return y;

  const lh = opts?.lineHeight ?? lineHeightFor(fontSize);
  doc.setFont("helvetica", opts?.style ?? "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(0, 0, 0);

  const printable = opts?.uppercase ? content.toUpperCase() : content;
  let lines = doc.splitTextToSize(printable, maxWidth) as string[];
  if (opts?.maxLines) lines = lines.slice(0, opts.maxLines);

  lines.forEach((line) => {
    doc.text(line, x, y);
    y += lh;
  });

  return y;
}

function cityStateDisplay(context: EtiquetasDadosResponse): string {
  const city = normalizeSpaces(context.municipio.name);
  const state = normalizeSpaces(context.municipio.state);
  return state ? `${city}/${state}` : city;
}

function drawFooterBlock(
  doc: jsPDF,
  x: number,
  width: number,
  footerTop: number,
  innerX: number,
  innerW: number,
  centerX: number,
  item: EtiquetaEditItem
) {
  const hasRodapeLine = normalizeSpaces(item.textoAcimaAssinatura).length > 0;
  let cursorY = footerTop + 2.5;

  if (hasRodapeLine) {
    const rodapeText = truncateText(item.textoAcimaAssinatura, TEXTO_ACIMA_ASSINATURA_MAX).toUpperCase();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text(rodapeText, centerX, cursorY, { align: "center", maxWidth: innerW });
    cursorY += 3.8;
  }

  doc.setLineWidth(0.2);
  doc.line(innerX, cursorY, x + width - PAD, cursorY);
  cursorY += 4.2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("NOME DO APLICADOR:", innerX, cursorY);
  doc.line(innerX + 29, cursorY + 0.5, x + width - PAD, cursorY + 0.5);
  if (normalizeSpaces(item.nomeAplicador)) {
    doc.text(normalizeSpaces(item.nomeAplicador), innerX + 30, cursorY);
  }

  cursorY += 4.8;
  doc.text("CPF:", innerX, cursorY);
  doc.line(innerX + 8, cursorY + 0.5, x + width - PAD, cursorY + 0.5);
  if (normalizeSpaces(item.cpfAplicador)) {
    doc.text(normalizeSpaces(item.cpfAplicador), innerX + 9, cursorY);
  }
}

function footerHeightFor(item: EtiquetaEditItem): number {
  if (!item.exibirAssinatura) return 0;
  const hasRodapeLine = normalizeSpaces(item.textoAcimaAssinatura).length > 0;
  return 10.5 + (hasRodapeLine ? RODAPE_BLOCK_H : 0);
}

function drawEtiqueta(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  context: EtiquetasDadosResponse,
  item: EtiquetaEditItem,
  logo: PdfImageAsset | null
) {
  const innerX = x + PAD;
  const innerW = width - PAD * 2;
  const innerBottom = y + height - PAD;
  const centerX = x + width / 2;
  const hasRodapeLine = item.exibirAssinatura && normalizeSpaces(item.textoAcimaAssinatura).length > 0;
  const footerHeight = footerHeightFor(item);
  const footerTop = innerBottom - footerHeight;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(x, y, width, height);

  const titleMaxWidth = logo ? innerW - LOGO_WIDTH - 2 : innerW;
  let headerBottom = y + PAD;

  if (logo) {
    const logoH = Math.min(11, Math.max(4, (logo.ih * LOGO_WIDTH) / logo.iw));
    doc.addImage(logo.dataUrl, "PNG", x + width - LOGO_WIDTH - PAD, y + PAD, LOGO_WIDTH, logoH);
    headerBottom = Math.max(headerBottom, y + PAD + logoH);
  }

  let cursorY = drawWrappedTextLeft(doc, item.titulo, innerX, y + PAD, titleMaxWidth, 8.5, {
    style: "bold",
    uppercase: true,
    maxLines: 2,
    lineHeight: 3.8,
  });

  cursorY = Math.max(cursorY, headerBottom) + 1;

  cursorY = drawCenteredWrapped(
    doc,
    cityStateDisplay(context),
    centerX,
    cursorY,
    innerW,
    7.5,
    { style: "bold", uppercase: true, maxLines: 2 }
  );
  cursorY += 0.4;

  cursorY = drawCenteredWrapped(
    doc,
    context.contexto.escola,
    centerX,
    cursorY,
    innerW,
    7.5,
    { style: "bold", uppercase: true, maxLines: 3 }
  );
  cursorY += 0.4;

  drawCenteredParts(
    doc,
    [
      { text: "Modalidade/Etapa: ", underline: true },
      { text: normalizeSpaces(context.contexto.nivel).toUpperCase() },
    ],
    centerX,
    cursorY,
    7.2
  );
  cursorY += 3.4;

  const serieTurmaText = normalizeSpaces(etiquetasSerieTurmaLine(context)).toUpperCase();
  cursorY = drawCenteredWrapped(
    doc,
    `Série/Turma: ${serieTurmaText}`,
    centerX,
    cursorY,
    innerW,
    6.8,
    { style: "bold", uppercase: false, maxLines: 2 }
  );
  cursorY += 0.25;
  cursorY = drawCenteredWrapped(
    doc,
    `Turno: ${normalizeSpaces(etiquetasTurnoLabel(context)).toUpperCase()}`,
    centerX,
    cursorY,
    innerW,
    6.8,
    { style: "bold", uppercase: false, maxLines: 1 }
  );
  cursorY += 0.4;

  cursorY += 0.6;
  doc.setLineWidth(0.2);
  doc.line(innerX, cursorY, x + width - PAD, cursorY);

  const freeAreaTop = cursorY + 2;
  const freeAreaBottom = footerTop - 0.5;
  const freeAreaHeight = freeAreaBottom - freeAreaTop;

  const freeFontSize = item.textoLivreTamanho || 16;
  const freeColor = item.exibirAssinatura
    ? ([0, 0, 0] as Rgb)
    : hexToRgb(item.textoLivreCor || "#000000");
  const freeAlign = item.textoLivreAlinhamento || "center";

  drawAlignedRichText(
    doc,
    item.textoLivre,
    innerX,
    freeAreaTop,
    innerW,
    freeAreaHeight,
    freeFontSize,
    freeAlign,
    freeColor
  );

  if (item.exibirAssinatura) {
    drawFooterBlock(doc, x, width, footerTop, innerX, innerW, centerX, item);
  }
}

export function generateEtiquetasPdf(
  context: EtiquetasDadosResponse,
  labels: EtiquetaEditItem[],
  logo: PdfImageAsset | null
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - PAGE_MARGIN * 2;
  const usableHeight = pageHeight - PAGE_MARGIN * 2;
  const labelWidth = (usableWidth - GAP_X * (COLS - 1)) / COLS;
  const labelHeight = (usableHeight - GAP_Y * (ROWS - 1)) / ROWS;

  labels.forEach((label, index) => {
    if (index > 0 && index % LABELS_PER_PAGE === 0) {
      doc.addPage();
    }
    const indexOnPage = index % LABELS_PER_PAGE;
    const row = Math.floor(indexOnPage / COLS);
    const col = indexOnPage % COLS;
    const labelX = PAGE_MARGIN + col * (labelWidth + GAP_X);
    const labelY = PAGE_MARGIN + row * (labelHeight + GAP_Y);
    drawEtiqueta(doc, labelX, labelY, labelWidth, labelHeight, context, label, logo);
  });

  return doc;
}

export async function downloadEtiquetasPdf(
  context: EtiquetasDadosResponse,
  labels: EtiquetaEditItem[],
  logo: PdfImageAsset | null
): Promise<void> {
  const doc = generateEtiquetasPdf(context, labels, logo);
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `etiquetas-${date}.pdf`;
  downloadBlob(doc.output("blob"), fileName);
}
