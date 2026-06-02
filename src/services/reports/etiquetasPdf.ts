import { jsPDF } from "jspdf";
import type { PdfImageAsset } from "@/utils/pdfCityBranding";
import { downloadBlob } from "@/services/reports/hierarchicalDownload";
import type {
  EtiquetaEditItem,
  EtiquetaTextoLivreAlinhamento,
  EtiquetasDadosResponse,
} from "@/types/etiquetas";
import { parseBoldMarkers, truncateText } from "@/utils/richTextMarkers";

const PAGE_MARGIN = 10;
const COLS = 2;
const ROWS = 4;
const GAP_X = 4;
const GAP_Y = 4;
const LABELS_PER_PAGE = COLS * ROWS;
const LOGO_WIDTH = 8;
const TEXTO_ACIMA_ASSINATURA_MAX = 50;
const RODAPE_LINE_HEIGHT = 4.8;

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

function measureTokenWidth(doc: jsPDF, token: RichToken, fontSize: number): number {
  doc.setFont("helvetica", token.bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  return doc.getTextWidth(token.text);
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

function buildRichLines(doc: jsPDF, text: string, maxWidth: number, fontSize: number): RichLine[] {
  const tokens = segmentsToTokens(text);
  if (!tokens.length) return [];

  const lines: RichLine[] = [];
  let currentLine: RichLine = [];
  let currentWidth = 0;

  tokens.forEach((token) => {
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
  color: Rgb,
  verticalCenter: boolean
) {
  const content = normalizeSpaces(text);
  if (!content || areaH <= 0) return;

  const lineHeight = fontSize * 0.42 + 1.2;
  const lines = buildRichLines(doc, content, areaW, fontSize);
  if (!lines.length) return;

  const totalHeight = lines.length * lineHeight;
  let cursorY = verticalCenter
    ? areaY + Math.max(0, (areaH - totalHeight) / 2) + fontSize * 0.35
    : areaY + fontSize * 0.35;

  lines.forEach((line) => {
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

  const lineHeight = opts?.lineHeight ?? fontSize * 0.42 + 1.2;
  doc.setFont("helvetica", opts?.style ?? "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(0, 0, 0);

  const printable = opts?.uppercase ? content.toUpperCase() : content;
  let lines = doc.splitTextToSize(printable, maxWidth) as string[];
  if (opts?.maxLines) lines = lines.slice(0, opts.maxLines);

  lines.forEach((line) => {
    doc.text(line, x, y);
    y += lineHeight;
  });

  return y;
}

function cityStateDisplay(context: EtiquetasDadosResponse): string {
  const city = normalizeSpaces(context.municipio.name);
  const state = normalizeSpaces(context.municipio.state);
  return state ? `${city}/${state}` : city;
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
  const innerX = x + 3;
  const innerW = width - 6;
  const centerX = x + width / 2;
  const hasRodapeLine = item.exibirAssinatura && normalizeSpaces(item.textoAcimaAssinatura).length > 0;
  const signatureBlockHeight = item.exibirAssinatura ? 14 + (hasRodapeLine ? RODAPE_LINE_HEIGHT : 0) : 0;
  const bottomLimit = y + height - 4 - signatureBlockHeight;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(x, y, width, height);

  const titleMaxWidth = logo ? innerW - LOGO_WIDTH - 3 : innerW;
  let headerBottom = y + 4;

  if (logo) {
    const logoH = Math.min(11, Math.max(4, (logo.ih * LOGO_WIDTH) / logo.iw));
    doc.addImage(logo.dataUrl, "PNG", x + width - LOGO_WIDTH - 3, y + 3, LOGO_WIDTH, logoH);
    headerBottom = Math.max(headerBottom, y + 3 + logoH);
  }

  let cursorY = drawWrappedTextLeft(doc, item.titulo, innerX, y + 4, titleMaxWidth, 8.5, {
    style: "bold",
    uppercase: true,
    maxLines: 2,
    lineHeight: 3.8,
  });

  cursorY = Math.max(cursorY, headerBottom) + 1.2;

  drawCenteredParts(
    doc,
    [{ text: cityStateDisplay(context).toUpperCase(), bold: true }],
    centerX,
    cursorY,
    7.5
  );
  cursorY += 3.6;

  drawCenteredParts(
    doc,
    [{ text: normalizeSpaces(context.contexto.escola).toUpperCase(), bold: true }],
    centerX,
    cursorY,
    7.5
  );
  cursorY += 3.8;

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
  cursorY += 3.6;

  drawCenteredParts(
    doc,
    [
      { text: "Turma: ", underline: true },
      { text: normalizeSpaces(context.contexto.serie).toUpperCase() },
      { text: " | " },
      { text: "Turno: ", underline: true },
      { text: normalizeSpaces(context.contexto.turno).toUpperCase() },
    ],
    centerX,
    cursorY,
    7.2
  );
  cursorY += 3.8;

  doc.setLineWidth(0.2);
  doc.line(innerX, cursorY, x + width - 3, cursorY);

  const freeAreaTop = cursorY + 2;
  const rodapeAreaTop = hasRodapeLine ? bottomLimit - RODAPE_LINE_HEIGHT : bottomLimit;
  const freeAreaBottom = item.exibirAssinatura ? rodapeAreaTop - 1 : bottomLimit;
  const freeAreaHeight = freeAreaBottom - freeAreaTop;

  const freeFontSize = item.exibirAssinatura ? 8 : item.textoLivreTamanho || 16;
  const freeColor = item.exibirAssinatura ? ([0, 0, 0] as Rgb) : hexToRgb(item.textoLivreCor || "#000000");
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
    freeColor,
    !item.exibirAssinatura
  );

  if (hasRodapeLine) {
    const rodapeText = truncateText(item.textoAcimaAssinatura, TEXTO_ACIMA_ASSINATURA_MAX).toUpperCase();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text(rodapeText, centerX, rodapeAreaTop + 3.2, { align: "center", maxWidth: innerW });
  }

  if (!item.exibirAssinatura) return;

  const signatureY = y + height - 12.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);

  doc.text("NOME DO APLICADOR:", innerX, signatureY);
  doc.line(innerX + 29, signatureY + 0.5, x + width - 3, signatureY + 0.5);
  if (normalizeSpaces(item.nomeAplicador)) {
    doc.text(normalizeSpaces(item.nomeAplicador), innerX + 30, signatureY);
  }

  doc.text("CPF:", innerX, signatureY + 4.8);
  doc.line(innerX + 8, signatureY + 5.3, x + width - 3, signatureY + 5.3);
  if (normalizeSpaces(item.cpfAplicador)) {
    doc.text(normalizeSpaces(item.cpfAplicador), innerX + 9, signatureY + 4.8);
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
