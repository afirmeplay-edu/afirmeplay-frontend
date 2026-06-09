import type { ListaFrequenciaResponse, Cabecalho } from "@/types/lista-frequencia";
import {
  loadCityBrandingForReportPdf,
  paintLetterheadBackground,
  type PdfImageAsset,
} from "@/utils/pdfCityBranding";
import { buildHierarchyPath } from "@/services/reports/hierarchicalDownload";
import { getClassShiftLabel } from "@/lib/classShift";

const STATUS_ORDER = ["P", "A", "T", "NE", "SE", "SS", "I"];

export type ListaFrequenciaPdfOptions = {
  cityId: string | null;
  nomeAvaliacaoImpressao?: string;
  provaExpirada: boolean | null;
};

function formatLegenda(legenda: Cabecalho["legenda"]): string {
  return Object.entries(legenda)
    .map(([cod, desc]) => `${cod} = ${desc}`)
    .join("; ");
}

/** Remove traços/espaços iniciais do sufixo da turma (ex.: "- 4º ANO" → "4º ANO"). */
function normalizeTurmaSuffix(value: string): string {
  return value.replace(/^[\s\-–—]+/, "").trim();
}

function startsWithSerie(serie: string, serieTurma: string): boolean {
  const s = serie.trim().toLowerCase();
  const st = serieTurma.trim().toLowerCase();
  if (!s || !st) return false;
  if (st === s) return true;
  return st.startsWith(`${s} `) || st.startsWith(`${s}-`);
}

/** Detecta `turma` vindo truncado do backend (ex.: "ANO" em "- 4º ANO"). */
function isAmbiguousTurmaToken(turma: string, serieTurma: string): boolean {
  if (!turma || !serieTurma) return false;
  if (turma.toUpperCase() === "ANO") return true;

  const normalized = normalizeTurmaSuffix(serieTurma);
  if (normalized.length > turma.length && normalized.toUpperCase().includes(turma.toUpperCase())) {
    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length > 1 && parts[parts.length - 1] === turma) return true;
  }
  return false;
}

/**
 * Deriva o rótulo da turma a partir de `serie_turma` (= Class.name no cadastro).
 * Suporta letra única, número, nome personalizado e sufixos como "- 4º ANO".
 */
function deriveTurmaFromSerieTurma(serie: string, serieTurma: string): string {
  const s = serie.trim();
  const st = serieTurma.trim();
  if (!st) return "";

  if (s && !startsWithSerie(s, st)) {
    return normalizeTurmaSuffix(st);
  }

  const dashParts = st.split(/\s*-\s*/);
  if (dashParts.length >= 2) {
    const left = dashParts[0].trim();
    const right = normalizeTurmaSuffix(dashParts.slice(1).join(" - "));
    if (right && (!s || !left || left.toLowerCase() === s.toLowerCase())) {
      return right;
    }
  }

  if (s && st.toLowerCase().startsWith(s.toLowerCase())) {
    const rest = st.slice(s.length).replace(/^[\s\-–—]+/, "").trim();
    if (rest) return rest;
  }

  const parts = st.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return normalizeTurmaSuffix(parts[0]);
  }

  const last = parts[parts.length - 1] ?? "";
  if (last.length === 1 && /[A-Za-z0-9]/.test(last)) {
    return last;
  }

  if (!s) {
    return normalizeTurmaSuffix(st);
  }

  return "";
}

function deriveSerieLabel(serie: string, serieTurma: string, turma: string): string {
  const s = serie.trim();
  const st = serieTurma.trim();
  if (s) return s;
  if (!st) return "—";

  if (turma && turma !== "—") {
    const idx = st.lastIndexOf(turma);
    if (idx > 0) {
      const prefix = st.slice(0, idx).replace(/[\s\-–—]+$/, "").trim();
      if (prefix) return prefix;
    }
  }

  const dashParts = st.split(/\s*-\s*/);
  if (dashParts.length >= 2 && dashParts[0].trim()) {
    return dashParts[0].trim();
  }

  return st;
}

export function getSerieTurmaDisplay(cab: Cabecalho): { serie: string; turma: string } {
  const s = cab.serie?.trim() ?? "";
  const t = cab.turma?.trim() ?? "";
  const st = cab.serie_turma?.trim() ?? "";

  const derivedTurma = deriveTurmaFromSerieTurma(s, st);

  let turma = "—";
  if (derivedTurma) {
    turma = derivedTurma;
  } else if (t && !isAmbiguousTurmaToken(t, st)) {
    turma = t;
  }

  const serie = deriveSerieLabel(s, st, turma);

  return { serie, turma };
}

type ColumnStyle = { cellWidth: number; halign?: "left" | "center" | "right"; overflow?: "linebreak" | "hidden" };

/** Larguras fixas: assinatura ampla; demais colunas absorvem o restante sem ultrapassar a página. */
function buildListaTableColumnStyles(
  codigos: string[],
  tableWidth: number
): Record<number, ColumnStyle> {
  const numeroColW = 8;
  const assinaturaColW = 40;
  const assinaturaColIndex = 2 + codigos.length;
  const maxCodLen = Math.max(1, ...codigos.map((c) => c.length));
  const statusColW = maxCodLen >= 2 ? 8 : 6;
  const statusTotal = statusColW * codigos.length;
  const nomeColW = Math.max(28, tableWidth - numeroColW - statusTotal - assinaturaColW);

  const styles: Record<number, ColumnStyle> = {
    0: { cellWidth: numeroColW, halign: "center" },
    1: { cellWidth: nomeColW, overflow: "linebreak" },
  };
  codigos.forEach((_, i) => {
    styles[2 + i] = { cellWidth: statusColW, halign: "center", overflow: "hidden" };
  });
  styles[assinaturaColIndex] = { cellWidth: assinaturaColW };

  const sum = Object.values(styles).reduce((acc, s) => acc + s.cellWidth, 0);
  if (sum > tableWidth && sum > 0) {
    const excess = sum - tableWidth;
    styles[1].cellWidth = Math.max(24, styles[1].cellWidth - excess);
  }
  return styles;
}

/** Logo proporcional, sem esticar (tamanho moderado para lista de frequência). */
function drawListaHeaderLogo(
  doc: import("jspdf").default,
  pageWidth: number,
  y: number,
  logo: PdfImageAsset
): number {
  const maxW = 34;
  const maxH = 13;
  const ratio = logo.iw / logo.ih;
  let lw = maxW;
  let lh = lw / ratio;
  if (lh > maxH) {
    lh = maxH;
    lw = lh * ratio;
  }
  doc.addImage(logo.dataUrl, "PNG", (pageWidth - lw) / 2, y, lw, lh);
  return y + lh + 8;
}

async function drawListaSection(
  doc: import("jspdf").default,
  autoTable: (doc: import("jspdf").default, options: object) => void,
  item: ListaFrequenciaResponse,
  options: {
    sectionIndex: number;
    cityBranding: Awaited<ReturnType<typeof loadCityBrandingForReportPdf>>;
    nomeAvaliacaoImpressao?: string;
    provaExpirada: boolean | null;
  }
): Promise<void> {
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - 2 * margin;

  const textBlack: [number, number, number] = [0, 0, 0];
  const textGray: [number, number, number] = [80, 80, 80];
  const pink: [number, number, number] = [236, 72, 153];
  const pinkLight: [number, number, number] = [251, 207, 232];
  const statusCircleOn: [number, number, number] = [95, 95, 95];
  const statusCircleOff: [number, number, number] = [95, 95, 95];
  const statusHeaderText: [number, number, number] = [72, 18, 50];

  const headerLogoHeight = (() => {
    if (!options.cityBranding.logo) return 0;
    const maxW = 34;
    const maxH = 13;
    const ratio = options.cityBranding.logo.iw / options.cityBranding.logo.ih;
    let lh = maxW / ratio;
    if (lh > maxH) lh = maxH;
    return lh + 8;
  })();

  const drawPageLogo = (): number => {
    if (!options.cityBranding.logo) return margin;
    return drawListaHeaderLogo(doc, pageWidth, margin, options.cityBranding.logo);
  };

  const tableTopMargin = margin + headerLogoHeight;
  const footerReserveMm = 38;

  if (options.sectionIndex > 0) doc.addPage();
  let y = margin;

  if (options.sectionIndex === 0 && options.cityBranding.letterhead) {
    paintLetterheadBackground(doc, options.cityBranding.letterhead, pageWidth, pageHeight);
  } else {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
  }
  y = drawPageLogo();
  doc.setTextColor(...textBlack);

  const tituloProva = (options.nomeAvaliacaoImpressao?.trim() || item.cabecalho.nome_prova_ano) || "Nome da prova";
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...pink);
  doc.text(tituloProva, pageWidth / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...textBlack);
  doc.text(item.cabecalho.lista_presenca_curso, pageWidth / 2, y, { align: "center" });
  y += 8;

  const cab = item.cabecalho;
  const { serie: serieDisplay, turma: turmaDisplay } = getSerieTurmaDisplay(cab);
  doc.setFontSize(9);
  const escolaLines = doc.splitTextToSize(`NOME DA ESCOLA*: ${cab.nome_escola}`, contentWidth - 8);
  const turnoDisplay = getClassShiftLabel(cab.turno);
  const boxHeight = 8 + 5 + 5 + escolaLines.length * 4.5 + 5 + 5 + 5 + 5 + 6 + 4;
  doc.setDrawColor(...pink);
  doc.setLineWidth(0.4);
  doc.rect(margin, y, contentWidth, boxHeight, "S");
  doc.setDrawColor(180, 180, 180);
  const boxX = margin + 4;
  let boxY = y + 6;
  doc.text(`MUNICÍPIO/UF: ${cab.municipio_uf}`, boxX, boxY, { align: "left" });
  boxY += 5;
  doc.text(escolaLines, boxX, boxY, { align: "left" });
  boxY += escolaLines.length * 4.5;
  doc.text(`SÉRIE: ${serieDisplay}`, boxX, boxY, { align: "left" });
  boxY += 5;
  doc.text(`TURMA: ${turmaDisplay}`, boxX, boxY, { align: "left" });
  boxY += 5;
  doc.text(`TURNO: ${turnoDisplay}`, boxX, boxY, { align: "left" });
  boxY += 5;
  const disciplinaVal = cab.disciplina?.trim() ?? "";
  doc.text(disciplinaVal ? `DISCIPLINA: ${disciplinaVal}` : "DISCIPLINA: ", boxX, boxY, { align: "left" });
  if (!disciplinaVal) {
    const lineX0 = boxX + doc.getTextWidth("DISCIPLINA: ");
    doc.setDrawColor(120, 120, 120);
    doc.line(lineX0, boxY + 1.5, lineX0 + 50, boxY + 1.5);
  }
  y = boxY + 8;

  doc.setFontSize(8);
  doc.setTextColor(...textGray);
  const legendaStr = `Legenda: ${formatLegenda(cab.legenda)}`;
  const legendaLines = doc.splitTextToSize(legendaStr, contentWidth);
  legendaLines.forEach((line: string) => {
    doc.text(line, pageWidth / 2, y, { align: "center" });
    y += 4;
  });
  y += 4;
  doc.setFont("helvetica", "italic");
  const instLines = doc.splitTextToSize(cab.instrucoes_aplicador, contentWidth);
  instLines.forEach((line: string) => {
    doc.text(line, pageWidth / 2, y, { align: "center" });
    y += 4;
  });
  y += 6;

  const codigos = STATUS_ORDER.filter((c) => c in (cab.legenda || {}));
  const tableHead = [["N°", "NOME DO ESTUDANTE", ...codigos, "ASSINATURA"]];
  const tableBody = item.estudantes.map((est) => {
    const statusPlaceholders = codigos.map(() => "");
    return [`${est.numero}.`, est.nome_estudante, ...statusPlaceholders, ""];
  });

  const statusColStart = 2;
  const assinaturaColIndex = 2 + codigos.length;
  const tableWidth = contentWidth - 1;
  const columnStyles = buildListaTableColumnStyles(codigos, tableWidth);
  const tableStartPage = doc.getNumberOfPages();

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
    theme: "grid",
    margin: {
      left: margin,
      right: margin,
      top: tableTopMargin,
      bottom: margin + footerReserveMm,
    },
    tableWidth,
    styles: {
      fontSize: 8,
      cellPadding: { top: 1.5, right: 1, bottom: 1.5, left: 1 },
      textColor: textBlack,
      lineColor: [140, 140, 140],
      lineWidth: 0.18,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: pinkLight,
      textColor: statusHeaderText,
      fontStyle: "bold",
      overflow: "hidden",
    },
    columnStyles,
    didParseCell: (tableData: {
      section: string;
      column: { index: number };
      cell: {
        text: string | string[];
        styles: {
          halign?: string;
          overflow?: string;
          cellPadding?: { top: number; right: number; bottom: number; left: number };
        };
      };
    }) => {
      if (
        tableData.section === "head" &&
        tableData.column.index >= statusColStart &&
        tableData.column.index < assinaturaColIndex
      ) {
        tableData.cell.text = "";
        tableData.cell.styles.halign = "center";
        tableData.cell.styles.overflow = "hidden";
        tableData.cell.styles.cellPadding = { top: 1.5, right: 0.4, bottom: 1.5, left: 0.4 };
      }
    },
    didDrawPage: (pageData: { pageNumber: number }) => {
      if (options.cityBranding.logo && pageData.pageNumber > tableStartPage) {
        drawPageLogo();
      }
    },
    didDrawCell: (tableData: {
      section: string;
      column: { index: number };
      row: { index: number };
      cell: { x: number; y: number; width: number; height: number };
      doc: import("jspdf").default;
    }) => {
      if (
        tableData.column.index < statusColStart ||
        tableData.column.index >= assinaturaColIndex
      )
        return;

      const colIdx = tableData.column.index - statusColStart;
      const cod = codigos[colIdx];
      const cx = tableData.cell.x + tableData.cell.width / 2;
      const cy = tableData.cell.y + tableData.cell.height / 2;

      if (tableData.section === "head") {
        tableData.doc.setFont("helvetica", "bold");
        tableData.doc.setFontSize(8);
        tableData.doc.setTextColor(...statusHeaderText);
        tableData.doc.text(cod, cx, cy, { align: "center", baseline: "middle" });
        return;
      }

      if (tableData.section !== "body") return;
      const est = item.estudantes[tableData.row.index];
      const isAusente = cod === "A";
      const mostrarPreenchido =
        est &&
        est.status === cod &&
        (!isAusente || options.provaExpirada === true);
      const r = 2.2;
      tableData.doc.setLineWidth(0.18);
      if (mostrarPreenchido) {
        tableData.doc.setFillColor(...statusCircleOn);
        tableData.doc.circle(cx, cy, r, "F");
        tableData.doc.setDrawColor(...statusCircleOn);
        tableData.doc.circle(cx, cy, r, "S");
      } else {
        tableData.doc.setDrawColor(...statusCircleOff);
        tableData.doc.circle(cx, cy, r, "S");
      }
    },
  });
  y = (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y;
  y += 10;

  const footerBlockHeight = 34;
  if (y + footerBlockHeight > pageHeight - margin) {
    doc.addPage();
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    y = options.cityBranding.logo ? drawPageLogo() : margin;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...textBlack);
  doc.text("CPF DO(A) APLICADOR(A)", margin, y);
  const boxW = 4;
  const boxH = 5;
  const cpfBoxY = y + 2;
  for (let i = 0; i < 11; i++) {
    doc.rect(margin + i * (boxW + 1), cpfBoxY, boxW, boxH, "S");
  }
  doc.text("DATA: ___/___/_______", pageWidth - margin, y, { align: "right" });
  y = cpfBoxY + boxH + 14;
  doc.setDrawColor(180, 180, 180);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineDashPattern([], 0);
  y += 6;
  doc.text("ASSINATURA DO(A) APLICADOR(A)", pageWidth / 2, y, { align: "center" });
}

export async function createListaFrequenciaPdfDoc(
  items: ListaFrequenciaResponse[],
  options: ListaFrequenciaPdfOptions
): Promise<import("jspdf").default> {
  const jsPDF = (await import("jspdf")).default;
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const cityBranding = await loadCityBrandingForReportPdf(options.cityId);

  for (let sectionIndex = 0; sectionIndex < items.length; sectionIndex += 1) {
    await drawListaSection(doc, autoTable, items[sectionIndex], {
      sectionIndex,
      cityBranding,
      nomeAvaliacaoImpressao: options.nomeAvaliacaoImpressao,
      provaExpirada: options.provaExpirada,
    });
  }

  return doc;
}

export async function createSingleListaFrequenciaPdfBlob(
  item: ListaFrequenciaResponse,
  options: ListaFrequenciaPdfOptions
): Promise<Blob> {
  const doc = await createListaFrequenciaPdfDoc([item], options);
  return doc.output("blob");
}

export function buildListaFrequenciaHierarchyPath(item: ListaFrequenciaResponse): string {
  const { serie, turma } = getSerieTurmaDisplay(item.cabecalho);
  return buildHierarchyPath({
    escola: item.cabecalho.nome_escola,
    serie,
    turma,
    fileName: "lista-frequencia.pdf",
  });
}
