import { jsPDF } from "jspdf";
import type { PdfImageAsset } from "@/utils/pdfCityBranding";
import { downloadBlob } from "@/services/reports/hierarchicalDownload";
import type {
  EtiquetaEditItem,
  EtiquetaTextoLivreAlinhamento,
  EtiquetasDadosResponse,
} from "@/types/etiquetas";
import { parseRichMarkers, truncateText } from "@/utils/richTextMarkers";
import {
  etiquetasSerieTurmaTurnoLine,
  TEXTO_ACIMA_ASSINATURA_MAX,
  TEXTO_LIVRE_TAMANHO_PADRAO,
} from "@/utils/etiquetasDisplay";

const PAGE_MARGIN = 10;
const COLS = 2;
const ROWS = 4;
const GAP_X = 4;
const GAP_Y = 4;
const LABELS_PER_PAGE = COLS * ROWS;
const LOGO_WIDTH = 8;

const PAD = 3;
/** 3px (96 dpi) em mm. */
const TITLE_OFFSET_Y = (3 * 25.4) / 96;

const RODAPE_BLOCK_H = 3.4;
const APLICADOR_SEPARATOR_GAP = 0.6;
const APLICADOR_NAME_GAP = 3.4;
const APLICADOR_ROW_GAP = 3.8;
const APLICADOR_BOTTOM_GAP = 1;
const APLICADOR_BLOCK_H =
  APLICADOR_SEPARATOR_GAP + APLICADOR_NAME_GAP + APLICADOR_ROW_GAP + APLICADOR_BOTTOM_GAP;

export type EtiquetaPdfEntry = {
  context: EtiquetasDadosResponse;
  label: EtiquetaEditItem;
};

type Rgb = [number, number, number];

type RichToken = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
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

function fontStyleFor(token: Pick<RichToken, "bold" | "italic">): "normal" | "bold" | "italic" | "bolditalic" {
  if (token.bold && token.italic) return "bolditalic";
  if (token.bold) return "bold";
  if (token.italic) return "italic";
  return "normal";
}

function measureTokenWidth(doc: jsPDF, token: RichToken, fontSize: number): number {
  doc.setFont("helvetica", fontStyleFor(token));
  doc.setFontSize(fontSize);
  return doc.getTextWidth(token.text);
}

function splitOversizedToken(doc: jsPDF, token: RichToken, maxWidth: number, fontSize: number): RichToken[] {
  if (measureTokenWidth(doc, token, fontSize) <= maxWidth) return [token];

  const parts: RichToken[] = [];
  let chunk = "";
  for (const char of token.text) {
    const candidate = chunk + char;
    if (
      chunk &&
      measureTokenWidth(
        doc,
        { text: candidate, bold: token.bold, italic: token.italic, underline: token.underline },
        fontSize
      ) > maxWidth
    ) {
      parts.push({ text: chunk, bold: token.bold, italic: token.italic, underline: token.underline });
      chunk = char;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) parts.push({ text: chunk, bold: token.bold, italic: token.italic, underline: token.underline });
  return parts.length ? parts : [token];
}

function segmentsToTokens(text: string): RichToken[] {
  const segments = parseRichMarkers(text);
  const tokens: RichToken[] = [];

  segments.forEach((segment) => {
    const chunks = segment.text.split(/(\s+)/).filter(Boolean);
    chunks.forEach((chunk) =>
      tokens.push({
        text: chunk,
        bold: Boolean(segment.bold),
        italic: Boolean(segment.italic),
        underline: Boolean(segment.underline),
      })
    );
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
    doc.setFont("helvetica", fontStyleFor(token));
    doc.setFontSize(fontSize);
    doc.text(token.text, x, y);
    const tokenWidth = doc.getTextWidth(token.text);
    if (token.underline && token.text.trim()) {
      doc.setDrawColor(...color);
      doc.setLineWidth(0.18);
      doc.line(x, y + 0.45, x + tokenWidth, y + 0.45);
      doc.setDrawColor(0, 0, 0);
    }
    x += tokenWidth;
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

  let size = Math.min(20, Math.max(8, fontSize || TEXTO_LIVRE_TAMANHO_PADRAO));
  let lineHeight = lineHeightFor(size);
  let lines = buildRichLines(doc, content, areaW, size);

  while (size > 8 && lines.length * lineHeight > areaH) {
    size -= 0.5;
    lineHeight = lineHeightFor(size);
    lines = buildRichLines(doc, content, areaW, size);
  }

  if (!lines.length) return;

  const maxLines = Math.max(1, Math.floor(areaH / lineHeight));
  const visibleLines = lines.slice(0, maxLines);
  const totalHeight = visibleLines.length * lineHeight;
  let cursorY = areaY + Math.max(0, (areaH - totalHeight) / 2) + size * 0.32;

  visibleLines.forEach((line) => {
    if (cursorY > areaY + areaH + size * 0.2) return;
    drawRichLine(doc, line, areaX, areaW, cursorY, size, align, color);
    cursorY += lineHeight;
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

type AplicadorBlock = {
  textoAcima: string;
  nome: string;
  cpf: string;
};

function aplicadorBlocksFor(item: EtiquetaEditItem): AplicadorBlock[] {
  if (!item.exibirAssinatura) return [];
  const blocks: AplicadorBlock[] = [
    { textoAcima: item.textoAcimaAssinatura, nome: item.nomeAplicador, cpf: item.cpfAplicador },
  ];
  if (item.exibirSegundoAplicador) {
    blocks.push({
      textoAcima: item.textoAcimaAssinatura2 ?? "",
      nome: item.nomeAplicador2,
      cpf: item.cpfAplicador2,
    });
  }
  return blocks;
}

function aplicadorBlockHeight(block: AplicadorBlock): number {
  const hasRodapeLine = normalizeSpaces(block.textoAcima).length > 0;
  return APLICADOR_BLOCK_H + (hasRodapeLine ? RODAPE_BLOCK_H : 0);
}

function footerHeightFor(item: EtiquetaEditItem): number {
  return aplicadorBlocksFor(item).reduce((total, block) => total + aplicadorBlockHeight(block), 0);
}

function drawAplicadorBlock(
  doc: jsPDF,
  rightX: number,
  innerX: number,
  innerW: number,
  centerX: number,
  top: number,
  block: AplicadorBlock
): number {
  let cursorY = top;
  doc.setTextColor(0, 0, 0);

  if (normalizeSpaces(block.textoAcima)) {
    const rodapeText = truncateText(block.textoAcima, TEXTO_ACIMA_ASSINATURA_MAX).toUpperCase();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(rodapeText, centerX, cursorY + 2.6, { align: "center", maxWidth: innerW });
    cursorY += RODAPE_BLOCK_H;
  }

  cursorY += APLICADOR_SEPARATOR_GAP;
  doc.setLineWidth(0.2);
  doc.line(innerX, cursorY, rightX, cursorY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);

  cursorY += APLICADOR_NAME_GAP;
  const nomeLabel = "NOME DO APLICADOR:";
  doc.text(nomeLabel, innerX, cursorY);
  if (normalizeSpaces(block.nome)) {
    const valueX = innerX + doc.getTextWidth(nomeLabel) + 1;
    doc.text(normalizeSpaces(block.nome), valueX, cursorY, { maxWidth: rightX - valueX });
  }

  cursorY += APLICADOR_ROW_GAP;
  const cpfLabel = "CPF:";
  doc.text(cpfLabel, innerX, cursorY);
  if (normalizeSpaces(block.cpf)) {
    doc.text(normalizeSpaces(block.cpf), innerX + doc.getTextWidth(cpfLabel) + 1, cursorY);
  }

  return cursorY + APLICADOR_BOTTOM_GAP;
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
  let cursorY = footerTop;
  aplicadorBlocksFor(item).forEach((block) => {
    cursorY = drawAplicadorBlock(doc, x + width - PAD, innerX, innerW, centerX, cursorY, block);
  });
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

  let cursorY = drawWrappedTextLeft(
    doc,
    item.titulo,
    innerX,
    y + PAD + TITLE_OFFSET_Y,
    titleMaxWidth,
    8.5,
    {
      style: "bold",
      uppercase: true,
      maxLines: 2,
      lineHeight: 3.8,
    }
  );

  cursorY = Math.max(cursorY, headerBottom) + 1;

  cursorY = drawCenteredWrapped(
    doc,
    cityStateDisplay(context),
    centerX,
    cursorY,
    innerW,
    5.5,
    { style: "bold", uppercase: true, maxLines: 2 }
  );
  cursorY += 0.3;

  cursorY = drawCenteredWrapped(
    doc,
    context.contexto.escola,
    centerX,
    cursorY,
    innerW,
    5.5,
    { style: "bold", uppercase: true, maxLines: 3 }
  );
  cursorY += 0.3;

  cursorY = drawCenteredWrapped(
    doc,
    `Modalidade/Etapa: ${normalizeSpaces(context.contexto.nivel).toUpperCase()}`,
    centerX,
    cursorY,
    innerW,
    5.2,
    { style: "normal", uppercase: false, maxLines: 2 }
  );
  cursorY += 0.2;

  const serieTurmaTurnoText = normalizeSpaces(etiquetasSerieTurmaTurnoLine(context)).toUpperCase();
  cursorY = drawCenteredWrapped(
    doc,
    `Série | Turma | Turno: ${serieTurmaTurnoText}`,
    centerX,
    cursorY,
    innerW,
    4.8,
    { style: "normal", uppercase: false, maxLines: 2 }
  );

  cursorY += 0.6;
  doc.setLineWidth(0.2);
  doc.line(innerX, cursorY, x + width - PAD, cursorY);

  const freeAreaTop = cursorY + 1.5;
  const freeAreaBottom = footerTop - 0.5;
  const freeAreaHeight = freeAreaBottom - freeAreaTop;

  const freeFontSize = item.textoLivreTamanho || TEXTO_LIVRE_TAMANHO_PADRAO;
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

/** Etiquetas de várias turmas/séries seguem em sequência contínua na grade, sem quebra de página entre grupos. */
export function generateEtiquetasPdf(entries: EtiquetaPdfEntry[], logo: PdfImageAsset | null): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - PAGE_MARGIN * 2;
  const usableHeight = pageHeight - PAGE_MARGIN * 2;
  const labelWidth = (usableWidth - GAP_X * (COLS - 1)) / COLS;
  const labelHeight = (usableHeight - GAP_Y * (ROWS - 1)) / ROWS;

  entries.forEach(({ context, label }, index) => {
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

export function createEtiquetasPdfBlob(entries: EtiquetaPdfEntry[], logo: PdfImageAsset | null): Blob {
  const doc = generateEtiquetasPdf(entries, logo);
  return doc.output("blob");
}

export async function downloadEtiquetasPdf(
  entries: EtiquetaPdfEntry[],
  logo: PdfImageAsset | null
): Promise<void> {
  const blob = createEtiquetasPdfBlob(entries, logo);
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `etiquetas-${date}.pdf`;
  downloadBlob(blob, fileName);
}
