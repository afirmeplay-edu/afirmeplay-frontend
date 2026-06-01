import { jsPDF } from "jspdf";
import type { PdfImageAsset } from "@/utils/pdfCityBranding";
import {
  drawMunicipalLogoTopCenter,
  drawReportHeaderLogoWithFallback,
} from "@/utils/pdfCityBranding";
import type {
  FolhaRascunhoDadosResponse,
  FolhaRascunhoStudent,
} from "@/types/folha-rascunho";
import { buildHierarchyPath, downloadBlob } from "@/services/reports/hierarchicalDownload";

/** Rosa da lista de frequência (linha da folha do aluno). */
const PINK: [number, number, number] = [236, 72, 153];

/** Paleta institucional (AcertoNiveis / ranking / análise). */
const COLORS = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  borderLight: [229, 231, 235] as [number, number, number],
  bgLight: [250, 250, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const MARGIN = 18;
const HEADER_TOP = 10;

type PdfCtx = {
  doc: jsPDF;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;
  logo: PdfImageAsset | null;
  municipioLabel: string;
  municipioName: string;
  municipioState: string;
  ano: number;
  avaliacaoTitulo?: string | null;
};

function newPage(doc: jsPDF, pageWidth: number, pageHeight: number): void {
  doc.setFillColor(...COLORS.white);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
}

function drawPinkLine(doc: jsPDF, y: number, pageWidth: number): void {
  doc.setDrawColor(...PINK);
  doc.setLineWidth(0.45);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
}

function formatCoverValue(value: string): string {
  return String(value ?? "").trim().toLocaleUpperCase("pt-BR");
}

async function drawHeaderLogo(doc: jsPDF, pageWidth: number, y: number, logo: PdfImageAsset | null): Promise<number> {
  if (logo) {
    return drawMunicipalLogoTopCenter(doc, pageWidth, y, logo, 34, 14);
  }
  return drawReportHeaderLogoWithFallback(doc, pageWidth, y, null);
}

/**
 * Capa no padrão dos relatórios institucionais: faixa roxa superior, título na faixa
 * e card com acento lateral (como ranking / AcertoNiveis).
 */
function drawInstitutionalCoverPage(
  ctx: PdfCtx,
  opts: {
    bandTitle: string;
    bandSubtitle: string;
    sectionLabel: string;
    sectionName: string;
    cardTitle: string;
    cardLines: Array<{ label: string; value: string }>;
  }
): void {
  const { doc, pageWidth: pageW, pageHeight: pageH, logo } = ctx;
  const centerX = pageW / 2;
  const BAND_H = 50;

  newPage(doc, pageW, pageH);

  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageW, BAND_H, "F");
  doc.setFillColor(...COLORS.white);
  doc.setLineWidth(0.12);
  doc.setDrawColor(255, 255, 255);
  doc.line(16, BAND_H - 0.8, pageW - 16, BAND_H - 0.8);

  let logoBottomInBand = 0;
  if (logo) {
    const desiredLogoWidth = 30;
    const desiredLogoHeight = (logo.ih * desiredLogoWidth) / logo.iw;
    doc.addImage(logo.dataUrl, "PNG", centerX - desiredLogoWidth / 2, 5, desiredLogoWidth, desiredLogoHeight);
    logoBottomInBand = 5 + desiredLogoHeight;
  } else {
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.white);
    doc.setFont("helvetica", "bold");
    doc.text("AFIRME PLAY", centerX, 18, { align: "center" });
    logoBottomInBand = 22;
  }

  const titleY = Math.max(logoBottomInBand + 3, BAND_H - 14);
  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(opts.bandTitle, centerX, titleY, { align: "center" });
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  const subBand = doc.splitTextToSize(opts.bandSubtitle, pageW - 44) as string[];
  doc.text(subBand, centerX, titleY + 5.5, { align: "center" });

  let y = BAND_H + 10;
  const municipioLine = ctx.municipioState
    ? `${formatCoverValue(ctx.municipioName)} - ${formatCoverValue(ctx.municipioState)}`
    : formatCoverValue(ctx.municipioName);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text(municipioLine, centerX, y, { align: "center" });
  y += 5.5;

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textGray);
  doc.text("SECRETARIA MUNICIPAL DE EDUCAÇÃO", centerX, y, { align: "center" });
  y += 10;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text(opts.sectionLabel, centerX, y, { align: "center" });
  y += 5;

  doc.setFontSize(18);
  doc.setTextColor(...COLORS.textDark);
  const nameLines = doc.splitTextToSize(formatCoverValue(opts.sectionName), pageW - 40) as string[];
  doc.text(nameLines, centerX, y, { align: "center" });
  y += nameLines.length * 6.5 + 12;

  const cardW = pageW - 56;
  const cardX = (pageW - cardW) / 2;
  const ACCENT_W = 4;
  const rowH = 5.8;
  const labelX = cardX + ACCENT_W + 10;
  const valueX = cardX + 58;
  const maxValueW = cardW - 68;

  doc.setFontSize(7.5);
  let cardEstimateH = 22;
  for (const { value } of opts.cardLines) {
    const wrapped = doc.splitTextToSize(formatCoverValue(value), maxValueW) as string[];
    cardEstimateH += Math.max(rowH, wrapped.length * 4.2);
  }
  const cardH = Math.max(cardEstimateH, 48);
  const maxCardY = pageH - cardH - 14;
  if (y > maxCardY) y = maxCardY;

  doc.setFillColor(...COLORS.bgLight);
  doc.rect(cardX, y, cardW, cardH, "F");
  doc.setFillColor(...COLORS.primary);
  doc.rect(cardX, y, ACCENT_W, cardH, "F");
  doc.setDrawColor(...COLORS.borderLight);
  doc.setLineWidth(0.35);
  doc.rect(cardX, y, cardW, cardH, "S");

  const cardCenterX = cardX + ACCENT_W + (cardW - ACCENT_W) / 2;
  let cy = y + 9;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.primary);
  doc.text(opts.cardTitle, cardCenterX, cy, { align: "center" });
  cy += 5;
  doc.setDrawColor(...COLORS.borderLight);
  doc.setLineWidth(0.2);
  doc.line(cardX + ACCENT_W + 5, cy, cardX + cardW - 5, cy);
  cy += 7;

  doc.setFontSize(7.5);
  for (const { label, value } of opts.cardLines) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.primary);
    doc.text(`${label}:`, labelX, cy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textDark);
    const vLines = doc.splitTextToSize(formatCoverValue(value), maxValueW) as string[];
    doc.text(vLines, valueX, cy);
    cy += Math.max(rowH, vLines.length * 4.2);
  }
}

function drawCoverPage(
  ctx: PdfCtx,
  kind: "escola" | "serie" | "turma",
  title: string,
  subtitle?: string,
  escolaName?: string
): void {
  const labels = { escola: "ESCOLA", serie: "SÉRIE", turma: "TURMA" };
  const cardLines: Array<{ label: string; value: string }> = [
    { label: labels[kind], value: title },
    { label: "MUNICÍPIO", value: ctx.municipioName },
    { label: "ANO", value: String(ctx.ano) },
  ];
  if (kind === "serie" && subtitle) cardLines.splice(1, 0, { label: "ESCOLA", value: subtitle });
  if (kind === "turma") {
    if (escolaName) cardLines.splice(1, 0, { label: "ESCOLA", value: escolaName });
    if (subtitle) cardLines.splice(escolaName ? 2 : 1, 0, { label: "SÉRIE", value: subtitle });
  }
  if (ctx.avaliacaoTitulo) {
    cardLines.push({ label: "REFERÊNCIA", value: ctx.avaliacaoTitulo });
  }

  drawInstitutionalCoverPage(ctx, {
    bandTitle: "FOLHA DE RASCUNHO",
    bandSubtitle: `CAPA — ${labels[kind]}`,
    sectionLabel: labels[kind],
    sectionName: title,
    cardTitle: "INFORMAÇÕES",
    cardLines,
  });
}

async function drawInstitutionalHeader(
  ctx: PdfCtx,
  opts: {
    escola: string;
    ano: number;
    serie: string;
    turma: string;
    studentName?: string;
    subtitle?: string;
  }
): Promise<number> {
  const { doc, pageWidth } = ctx;
  let y = HEADER_TOP;
  y = await drawHeaderLogo(doc, pageWidth, y, ctx.logo);
  y -= 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.textDark);
  doc.text(ctx.municipioLabel, pageWidth / 2, y, { align: "center" });
  y += 4.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.textGray);
  doc.text("SECRETARIA MUNICIPAL DE EDUCAÇÃO", pageWidth / 2, y, { align: "center" });
  y += 5.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.textDark);
  const escolaLines = doc.splitTextToSize(opts.escola, ctx.contentWidth) as string[];
  escolaLines.forEach((line: string) => {
    const w = doc.getTextWidth(line);
    const x0 = (pageWidth - w) / 2;
    doc.text(line, x0, y);
    doc.setDrawColor(...COLORS.textDark);
    doc.setLineWidth(0.15);
    doc.line(x0, y + 0.9, x0 + w, y + 0.9);
    y += 4.5;
  });

  y += 1;
  const meta = `Ano: ${opts.ano} | Série: ${opts.serie} | Turma: ${opts.turma}`;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...COLORS.textGray);
  doc.text(meta, pageWidth / 2, y, { align: "center" });
  y += 5;

  if (opts.studentName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.textDark);
    doc.text(opts.studentName.toUpperCase(), pageWidth / 2, y, { align: "center" });
    y += 7;
  }

  if (opts.subtitle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...PINK);
    doc.text(opts.subtitle, pageWidth / 2, y, { align: "center" });
    y += 3;
    drawPinkLine(doc, y, pageWidth);
    y += 4;
  }

  return y;
}

async function drawStudentScratchPage(
  ctx: PdfCtx,
  escola: string,
  serie: string,
  turma: string,
  student: FolhaRascunhoStudent
): Promise<void> {
  const { doc, pageWidth, pageHeight } = ctx;
  newPage(doc, pageWidth, pageHeight);
  await drawInstitutionalHeader(ctx, {
    escola,
    ano: ctx.ano,
    serie,
    turma,
    studentName: student.name,
    subtitle: "FOLHA DE RASCUNHO",
  });
}

export async function generateFolhaRascunhoPdf(
  payload: FolhaRascunhoDadosResponse,
  logo: PdfImageAsset | null
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const ctx: PdfCtx = {
    doc,
    pageWidth,
    pageHeight,
    contentWidth: pageWidth - 2 * MARGIN,
    logo,
    municipioLabel:
      payload.municipio.prefeitura_label || `PREFEITURA MUNICIPAL DE ${payload.municipio.name}`,
    municipioName: payload.municipio.name,
    municipioState: payload.municipio.state || "",
    ano: payload.ano,
    avaliacaoTitulo: payload.avaliacao_titulo,
  };

  const escolas = payload.escolas || [];
  const coverSchoolLevel = escolas.length > 1 || payload.modo !== "personalizada";
  let firstPage = true;

  for (const escola of escolas) {
    const series = escola.series || [];
    if (coverSchoolLevel) {
      if (!firstPage) doc.addPage();
      firstPage = false;
      drawCoverPage(ctx, "escola", escola.name);
    }

    for (const serie of series) {
      const classes = serie.classes || [];
      if (series.length > 1) {
        if (!firstPage) doc.addPage();
        firstPage = false;
        drawCoverPage(ctx, "serie", serie.name, escola.name);
      }

      for (const turma of classes) {
        if (classes.length > 1) {
          if (!firstPage) doc.addPage();
          firstPage = false;
          drawCoverPage(ctx, "turma", turma.name, serie.name, escola.name);
        }

        for (const student of turma.students || []) {
          if (!firstPage) doc.addPage();
          firstPage = false;
          await drawStudentScratchPage(ctx, escola.name, serie.name, turma.name, student);
        }
      }
    }
  }

  if (firstPage) {
    newPage(doc, pageWidth, pageHeight);
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textDark);
    doc.text("Nenhuma folha gerada.", pageWidth / 2, pageHeight / 2, { align: "center" });
  }

  return doc;
}

function buildFilename(payload: FolhaRascunhoDadosResponse): string {
  const date = new Date().toISOString().slice(0, 10);
  const escola = payload.escolas[0]?.name?.replace(/\s+/g, "-").slice(0, 40) || "folha";
  const suffix =
    payload.avaliacao_titulo?.replace(/\s+/g, "-").slice(0, 30) ||
    (payload.modo === "personalizada" ? "personalizada" : payload.modo);
  return `folha-rascunho-${escola}-${suffix}-${date}.pdf`.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export async function downloadFolhaRascunhoPdf(
  payload: FolhaRascunhoDadosResponse,
  logo: PdfImageAsset | null
): Promise<void> {
  const doc = await generateFolhaRascunhoPdf(payload, logo);
  downloadBlob(doc.output("blob"), buildFilename(payload));
}

export async function createFolhaRascunhoClassPdfBlob(
  payload: FolhaRascunhoDadosResponse,
  params: { schoolId: string; serieId: string; classId: string },
  logo: PdfImageAsset | null
): Promise<Blob> {
  const school = payload.escolas.find((item) => item.id === params.schoolId);
  const serie = school?.series.find((item) => item.id === params.serieId);
  const turma = serie?.classes.find((item) => item.id === params.classId);

  if (!school || !serie || !turma) {
    throw new Error("Turma não encontrada para geração da folha de rascunho.");
  }

  const singlePayload: FolhaRascunhoDadosResponse = {
    ...payload,
    escolas: [
      {
        ...school,
        series: [
          {
            ...serie,
            classes: [{ ...turma }],
          },
        ],
      },
    ],
    totals: {
      schools: 1,
      series: 1,
      classes: 1,
      students: turma.students.length,
      covers: 0,
      pages: turma.students.length,
    },
  };

  const doc = await generateFolhaRascunhoPdf(singlePayload, logo);
  return doc.output("blob");
}

export function buildFolhaRascunhoHierarchyPath(params: {
  escola: string;
  serie: string;
  turma: string;
}): string {
  return buildHierarchyPath({
    escola: params.escola,
    serie: params.serie,
    turma: params.turma,
    fileName: "folha-rascunho.pdf",
  });
}
