import { jsPDF } from "jspdf";
import type { PdfImageAsset } from "@/utils/pdfCityBranding";
import { downloadBlob } from "@/services/reports/hierarchicalDownload";
import type { EtiquetaEditItem, EtiquetasDadosResponse } from "@/types/etiquetas";

const PAGE_MARGIN = 10;
const COLS = 2;
const ROWS = 4;
const GAP_X = 4;
const GAP_Y = 4;
const LABELS_PER_PAGE = COLS * ROWS;

function normalizeSpaces(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

type DrawWrappedTextOptions = {
  fontSize: number;
  style?: "normal" | "bold";
  lineHeight?: number;
  maxLines?: number;
  uppercase?: boolean;
};

function drawWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  opts: DrawWrappedTextOptions
): number {
  const content = normalizeSpaces(text);
  if (!content) return y;

  const lineHeight = opts.lineHeight ?? opts.fontSize * 0.42 + 1.2;
  doc.setFont("helvetica", opts.style ?? "normal");
  doc.setFontSize(opts.fontSize);

  const printable = opts.uppercase ? content.toUpperCase() : content;
  let lines = doc.splitTextToSize(printable, maxWidth) as string[];
  if (opts.maxLines) lines = lines.slice(0, opts.maxLines);

  lines.forEach((line) => {
    doc.text(line, x, y);
    y += lineHeight;
  });

  return y;
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
  const logoReservedW = logo ? 14 : 0;
  const titleWidth = innerW - logoReservedW;
  const signatureBlockHeight = item.exibirAssinatura ? 14 : 0;
  const bottomLimit = y + height - 4 - signatureBlockHeight;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(x, y, width, height);

  if (logo) {
    const logoW = 12;
    const logoH = Math.max(4, (logo.ih * logoW) / logo.iw);
    doc.addImage(logo.dataUrl, "PNG", x + width - logoW - 2, y + 2, logoW, logoH);
  }

  let cursorY = y + 4;

  cursorY = drawWrappedText(doc, item.titulo, innerX, cursorY, titleWidth, {
    fontSize: 9,
    style: "bold",
    lineHeight: 4.1,
    maxLines: 2,
    uppercase: true,
  });
  cursorY += 0.8;

  cursorY = drawWrappedText(doc, context.municipio.name, innerX, cursorY, innerW, {
    fontSize: 8,
    style: "bold",
    lineHeight: 3.6,
    maxLines: 2,
    uppercase: true,
  });

  cursorY = drawWrappedText(doc, context.contexto.escola, innerX, cursorY, innerW, {
    fontSize: 7.5,
    style: "bold",
    lineHeight: 3.4,
    maxLines: 3,
    uppercase: true,
  });
  cursorY += 0.4;

  cursorY = drawWrappedText(
    doc,
    `Nível: ${context.contexto.nivel}`,
    innerX,
    cursorY,
    innerW,
    { fontSize: 7.5, lineHeight: 3.6, maxLines: 2 }
  );

  cursorY = drawWrappedText(
    doc,
    `Série/Turma: ${context.contexto.serie} / ${context.contexto.turma}`,
    innerX,
    cursorY,
    innerW,
    { fontSize: 7.5, lineHeight: 3.6, maxLines: 2 }
  );

  cursorY = drawWrappedText(
    doc,
    `Turno: ${context.contexto.turno}`,
    innerX,
    cursorY,
    innerW,
    { fontSize: 7.5, lineHeight: 3.6, maxLines: 1 }
  );

  cursorY += 1;
  doc.setLineWidth(0.2);
  doc.line(innerX, cursorY, x + width - 3, cursorY);
  cursorY += 3.5;

  const freeTextLines = doc.splitTextToSize(normalizeSpaces(item.textoLivre), innerW) as string[];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  freeTextLines.forEach((line) => {
    if (cursorY > bottomLimit) return;
    doc.text(line, innerX, cursorY);
    cursorY += 3.6;
  });

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
    const x = PAGE_MARGIN + col * (labelWidth + GAP_X);
    const y = PAGE_MARGIN + row * (labelHeight + GAP_Y);
    drawEtiqueta(doc, x, y, labelWidth, labelHeight, context, label, logo);
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
