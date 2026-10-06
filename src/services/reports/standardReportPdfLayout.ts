import type { jsPDF } from "jspdf";
import {
  loadCityBrandingForReportPdf,
  paintLetterheadBackground,
  type PdfImageAsset,
} from "@/utils/pdfCityBranding";

type Rgb = [number, number, number];

export const STANDARD_PDF_COLORS: Record<
  "primary" | "textDark" | "textGray" | "borderLight" | "bgLight" | "white",
  Rgb
> = {
  primary: [124, 62, 237],
  textDark: [31, 41, 55],
  textGray: [107, 114, 128],
  borderLight: [229, 231, 235],
  bgLight: [250, 250, 250],
  white: [255, 255, 255],
};

export const STANDARD_PDF_MARGIN = 15;

export type StandardPdfBranding = {
  logo: PdfImageAsset | null;
  letterhead: PdfImageAsset | null;
};

export async function loadStandardPdfBranding(
  cityId: string | null | undefined
): Promise<StandardPdfBranding> {
  try {
    return await loadCityBrandingForReportPdf(cityId);
  } catch {
    return { logo: null, letterhead: null };
  }
}

export type StandardCoverParams = {
  title: string;
  subtitle?: string;
  summaryRows: Array<[string, string]>;
  filterRows?: Array<[string, string]>;
  note?: string;
  branding: StandardPdfBranding;
};

/** Capa padrão dos relatórios (faixa roxa + logo + card de resumo), igual ao relatório de usuários. */
export function drawStandardReportCover(doc: jsPDF, params: StandardCoverParams): void {
  const C = STANDARD_PDF_COLORS;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const centerX = pageW / 2;
  const { logo, letterhead } = params.branding;

  let logoW = 0;
  let logoH = 0;
  let logoBottom = 28;
  if (logo?.dataUrl && logo.iw > 0 && logo.ih > 0) {
    logoW = 38;
    logoH = (logo.ih * logoW) / logo.iw;
    if (logoH > 18) {
      logoW = (logoW * 18) / logoH;
      logoH = 18;
    }
    logoBottom = 7 + logoH;
  }

  const titleY = Math.max(logoBottom + 5, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const subtitleLines = params.subtitle
    ? (doc.splitTextToSize(params.subtitle.toUpperCase(), pageW - 34) as string[])
    : [];
  const subtitleLineH = 5;
  const generatedAtY =
    subtitleLines.length > 0
      ? titleY + 8 + (subtitleLines.length - 1) * subtitleLineH + 7
      : titleY + 8;
  const bandH = Math.max(58, generatedAtY + 6);

  if (letterhead) {
    paintLetterheadBackground(doc, letterhead, pageW, pageH);
  } else {
    doc.setFillColor(...C.white);
    doc.rect(0, 0, pageW, pageH, "F");
  }
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, pageW, bandH, "F");

  if (logo?.dataUrl && logoW > 0 && logoH > 0) {
    doc.addImage(logo.dataUrl, "PNG", centerX - logoW / 2, 7, logoW, logoH);
  } else {
    doc.setFontSize(18);
    doc.setTextColor(...C.white);
    doc.setFont("helvetica", "bold");
    doc.text("AFIRME PLAY", centerX, 22, { align: "center" });
  }

  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(params.title.toUpperCase(), centerX, titleY, { align: "center" });
  if (subtitleLines.length > 0) {
    doc.setFontSize(12);
    doc.text(subtitleLines, centerX, titleY + 8, { align: "center", lineHeightFactor: 1.15 });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C.borderLight);
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, centerX, generatedAtY, {
    align: "center",
  });

  const cardW = pageW - 40;
  const cardX = (pageW - cardW) / 2;
  const accentW = 4;
  const rowH = 7;
  const lx = cardX + accentW + 10;
  const labelW = 62;
  const vx = lx + labelW + 4;
  const valueMaxW = cardX + cardW - vx - 6;

  const drawCard = (heading: string, rows: Array<[string, string]>, top: number): number => {
    doc.setFontSize(10.5);
    const maxLines = 2;
    const wrapped = rows.map(([label, value]) => {
      const all = doc.splitTextToSize(value || "—", valueMaxW) as string[];
      const lines = all.slice(0, maxLines);
      if (all.length > maxLines) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/.{0,3}$/, "")}...`;
      return { label, lines };
    });
    const contentH = wrapped.reduce((acc, r) => acc + Math.max(1, r.lines.length) * (rowH - 1.5) + 1.5, 0);
    const cardH = 22 + contentH + 2;

    doc.setFillColor(...C.bgLight);
    doc.rect(cardX, top, cardW, cardH, "F");
    doc.setFillColor(...C.primary);
    doc.rect(cardX, top, accentW, cardH, "F");
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.4);
    doc.rect(cardX, top, cardW, cardH, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...C.primary);
    doc.text(heading, cardX + accentW + (cardW - accentW) / 2, top + 10, { align: "center" });
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.3);
    doc.line(cardX + accentW + 4, top + 14, cardX + cardW - 4, top + 14);

    let cy = top + 22;
    doc.setFontSize(10.5);
    for (const row of wrapped) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.primary);
      doc.text(row.label, lx, cy);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.textDark);
      doc.text(row.lines, vx, cy, { lineHeightFactor: 1.15 });
      cy += Math.max(1, row.lines.length) * (rowH - 1.5) + 1.5;
    }
    return top + cardH;
  };

  let y = drawCard("RESUMO", params.summaryRows, bandH + 10);
  if (params.filterRows && params.filterRows.length > 0) {
    y = drawCard("FILTROS APLICADOS", params.filterRows, y + 8);
  }

  if (params.note) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C.textGray);
    doc.text(doc.splitTextToSize(params.note, cardW - 18) as string[], cardX + 9, y + 10);
  }
}

export function drawStandardSectionTitle(doc: jsPDF, title: string, y: number): number {
  const C = STANDARD_PDF_COLORS;
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C.primary);
  doc.text(title, STANDARD_PDF_MARGIN, y);
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.3);
  doc.line(STANDARD_PDF_MARGIN, y + 2, pageW - STANDARD_PDF_MARGIN, y + 2);
  return y + 10;
}

export function getLastAutoTableFinalY(doc: jsPDF, fallback: number): number {
  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
  return typeof finalY === "number" ? finalY + 12 : fallback;
}

/** Garante espaço mínimo antes de iniciar uma nova seção; caso contrário, quebra a página. */
export function ensureStandardSpace(doc: jsPDF, y: number, minSpace = 60): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y > pageH - minSpace) {
    doc.addPage();
    return STANDARD_PDF_MARGIN;
  }
  return y;
}

/** Numeração "Página X de Y" em todas as páginas exceto a capa. */
export function drawStandardPageNumbers(doc: jsPDF): void {
  const total = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let page = 2; page <= total; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...STANDARD_PDF_COLORS.textGray);
    doc.text(`Página ${page} de ${total}`, pageW / 2, pageH - 8, { align: "center" });
  }
}

export function buildStandardPdfFileName(prefix: string, label?: string): string {
  const slug = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s\-_]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .toLowerCase();
  const base = [slug(prefix), label ? slug(label) : ""].filter(Boolean).join("_");
  return `${base || "relatorio"}_${new Date().toISOString().slice(0, 10)}.pdf`;
}

export const standardAutoTableStyles = {
  styles: { font: "helvetica", fontSize: 9, textColor: STANDARD_PDF_COLORS.textDark },
  headStyles: { fillColor: STANDARD_PDF_COLORS.primary, textColor: STANDARD_PDF_COLORS.white },
  bodyStyles: { fillColor: STANDARD_PDF_COLORS.white },
  theme: "striped" as const,
  margin: { left: STANDARD_PDF_MARGIN, right: STANDARD_PDF_MARGIN },
};
