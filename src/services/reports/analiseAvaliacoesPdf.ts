import type {
  NotaGeral,
  Proficiencia,
  RelatorioCompleto,
  NivelAprendizagemDisciplina,
  NivelAprendizagemGeral,
} from "@/types/evaluation-results";
import {
  loadCityBrandingForReportPdf,
  paintLetterheadBackground,
  type PdfImageAsset,
} from "@/utils/pdfCityBranding";
import { formatDecimal1PtBr, formatPercent1PtBr } from "@/utils/numberFormat";
import { getClassShiftLabel } from "@/lib/classShift";

type UnknownRecord = Record<string, unknown>;

const COLORS = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  borderLight: [229, 231, 235] as [number, number, number],
  bgLight: [250, 250, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  abaixo: [220, 83, 106] as [number, number, number],
  basico: [245, 158, 11] as [number, number, number],
  adequado: [59, 130, 246] as [number, number, number],
  avancado: [16, 185, 129] as [number, number, number],
};

/** Cabeçalhos da tabela de níveis (alinhado ao layout de referência: adequado verde claro, avançado verde escuro). */
const NIVEL_HEAD: [number, number, number][] = [
  COLORS.primary,
  COLORS.abaixo,
  COLORS.basico,
  [134, 239, 172],
  [22, 101, 52],
];

const NIVEL_CHART_FILL: [number, number, number][] = [
  COLORS.abaixo,
  COLORS.basico,
  [134, 239, 172],
  [22, 101, 52],
];

const MARGIN = 15;
const PARECER_NIVEL_ACCENT = [37, 99, 235] as [number, number, number];
const TOP_BAND_H = 18;

function tableFinalY(doc: import("jspdf").jsPDF, fallback: number): number {
  const ly = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  return typeof ly === "number" ? ly : fallback;
}

function stripHtml(html: unknown): string {
  if (html === null || html === undefined) return "";
  const s = String(html);
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type TurmaRowLike = {
  turma?: unknown;
  serie?: unknown;
  serie_nome?: unknown;
  grade?: unknown;
  ano?: unknown;
};

function formatTurmaLabel(row: TurmaRowLike): string {
  const turma = typeof row?.turma === "string" ? row.turma.trim() : "";
  const serie =
    (typeof row?.serie === "string" && row.serie.trim()) ||
    (typeof row?.serie_nome === "string" && row.serie_nome.trim()) ||
    (typeof row?.grade === "string" && row.grade.trim()) ||
    (typeof row?.ano === "string" && row.ano.trim()) ||
    "";

  if (!serie) return turma || "—";
  if (!turma) return serie;
  if (turma.toLowerCase().includes(serie.toLowerCase())) return turma;
  return `${serie} ${turma}`.trim();
}

function classificarAcertoPct(p: number): string {
  if (p <= 50) return "Revisar e Reavaliar";
  if (p <= 80) return "Reavaliar";
  return "Concluído";
}

function drawTopBand(doc: import("jspdf").jsPDF, pageWidth: number, title: string): void {
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, TOP_BAND_H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.white);
  const t = String(title || "").trim();
  if (t) doc.text(t.toUpperCase(), pageWidth / 2, 11.5, { align: "center" });
}

/** Mesma ordem do frontend: GERAL primeiro, depois por menor número de questão. */
function sortAcertosKeysFrontend(keys: string[], acertos: Record<string, unknown>): string[] {
  const without = keys.filter((k) => k !== "GERAL");
  without.sort((a, b) => {
    const qa = acertos[a] as { questoes?: { numero_questao?: number }[] } | undefined;
    const qb = acertos[b] as { questoes?: { numero_questao?: number }[] } | undefined;
    const aMin = Math.min(...(qa?.questoes?.map((q) => Number(q.numero_questao) || 999) ?? [999]));
    const bMin = Math.min(...(qb?.questoes?.map((q) => Number(q.numero_questao) || 999) ?? [999]));
    if (aMin !== bMin) return aMin - bMin;
    return a.localeCompare(b, "pt-BR");
  });
  if (keys.includes("GERAL")) return ["GERAL", ...without];
  return without;
}

function addFooters(doc: import("jspdf").jsPDF, dataGeracao: string): void {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const footerTextY = pageHeight - 7;
    const lineY = pageHeight - 11;
    doc.setDrawColor(...COLORS.borderLight);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, lineY, pageWidth - MARGIN, lineY);
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.textGray);
    doc.setFont("helvetica", "normal");
    doc.text("AfirmePlay: Sistema de Ensino e Avaliação", MARGIN, footerTextY);
    doc.text(`Página ${i} de ${n}`, pageWidth / 2, footerTextY, { align: "center" });
    doc.text(`Gerado em ${dataGeracao}`, pageWidth - MARGIN, footerTextY, { align: "right" });
  }
}

function escolaLabelForCover(data: RelatorioCompleto): string {
  const por = data.total_alunos?.por_escola;
  if (Array.isArray(por) && por.length === 1) return String(por[0].escola ?? "—");
  if (Array.isArray(por) && por.length > 1) return "Rede municipal (consolidado)";
  return "—";
}

function nTurmasCover(data: RelatorioCompleto): string {
  const pt = data.total_alunos?.por_turma;
  if (Array.isArray(pt) && pt.length > 0) return String(pt.length);
  return "—";
}

/**
 * Capa no mesmo padrão visual de `AcertoNiveis.tsx` (faixa roxa, card com acento lateral), em A4 retrato.
 * Conteúdo preenchido com os dados deste relatório.
 */
function drawCoverLikeAcertoNiveis(
  doc: import("jspdf").jsPDF,
  pageWidth: number,
  pageHeight: number,
  data: RelatorioCompleto,
  params: {
    logoDataUrl: string;
    logoW: number;
    logoH: number;
    municipio: string;
    uf: string;
    tituloAvaliacao: string;
    seriesLine: string;
    disciplinasLine: string;
    dataGeracao: string;
    coverLetterhead?: PdfImageAsset | null;
  }
): void {
  const {
    logoDataUrl,
    logoW,
    logoH,
    municipio,
    uf,
    tituloAvaliacao,
    seriesLine,
    disciplinasLine,
    dataGeracao,
    coverLetterhead,
  } = params;
  const centerX = pageWidth / 2;
  const BAND_H = 58;

  if (coverLetterhead) {
    paintLetterheadBackground(doc, coverLetterhead, pageWidth, pageHeight);
  } else {
    doc.setFillColor(...COLORS.white);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
  }

  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, BAND_H, "F");

  let logoBottomInBand = 0;
  if (logoDataUrl && logoW > 0) {
    const desiredLogoWidth = 38;
    const desiredLogoHeight = (logoH * desiredLogoWidth) / logoW;
    doc.addImage(logoDataUrl, "PNG", centerX - desiredLogoWidth / 2, 7, desiredLogoWidth, desiredLogoHeight);
    logoBottomInBand = 7 + desiredLogoHeight;
  } else {
    doc.setFontSize(18);
    doc.setTextColor(...COLORS.white);
    doc.setFont("helvetica", "bold");
    doc.text("AFIRME PLAY", centerX, 22, { align: "center" });
    logoBottomInBand = 28;
  }

  const titleY = Math.max(logoBottomInBand + 5, BAND_H - 17);
  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("ANÁLISE DAS AVALIAÇÕES", centerX, titleY, { align: "center" });
  doc.setFontSize(11);
  doc.text("INDICADORES E ANÁLISE PEDAGÓGICA", centerX, titleY + 8, { align: "center" });

  let y = BAND_H + 13;

  doc.setFontSize(13);
  doc.setTextColor(...COLORS.primary);
  doc.setFont("helvetica", "bold");
  doc.text(`${municipio.toUpperCase()} - ${uf}`, centerX, y, { align: "center" });
  y += 7;

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textGray);
  doc.setFont("helvetica", "normal");
  doc.text("SECRETARIA MUNICIPAL DE EDUCAÇÃO", centerX, y, { align: "center" });
  y += 13;

  const cardInset = 24;
  const cardWidth = pageWidth - 2 * cardInset;
  const cardX = cardInset;
  const ACCENT_W = 4;
  const inset = 10;
  const labelWidth = 38;
  const vMaxW = cardWidth - ACCENT_W - inset * 2 - labelWidth;
  const ROW_H = 5.5;
  doc.setFontSize(8);
  const avaliacaoLines = doc.splitTextToSize(tituloAvaliacao || "N/A", vMaxW);
  const escolaLines = doc.splitTextToSize(escolaLabelForCover(data).toUpperCase(), vMaxW);
  const discLines = disciplinasLine
    ? doc.splitTextToSize(disciplinasLine, vMaxW)
    : ["—"];

  const fieldRows: Array<{ label: string; lines: string[] }> = [
    { label: "AVALIAÇÃO:", lines: avaliacaoLines },
    { label: "MUNICÍPIO:", lines: [municipio] },
    { label: "ESCOLA:", lines: escolaLines },
    { label: "SÉRIE:", lines: [seriesLine] },
    { label: "DISCIPLINAS:", lines: discLines },
    { label: "DATA DE GERAÇÃO:", lines: [dataGeracao] },
    { label: "TOTAL DE TURMAS:", lines: [nTurmasCover(data)] },
  ];

  const CARD_TITLE_H = 14;
  const cardContentH = fieldRows.reduce((sum, f) => sum + Math.max(ROW_H, f.lines.length * (ROW_H - 0.5)), 0);
  const cardHeight = CARD_TITLE_H + cardContentH + 10;
  const maxCardY = pageHeight - cardHeight - 12;
  if (y > maxCardY) y = maxCardY;

  doc.setFillColor(...COLORS.bgLight);
  doc.rect(cardX, y, cardWidth, cardHeight, "F");
  doc.setFillColor(...COLORS.primary);
  doc.rect(cardX, y, ACCENT_W, cardHeight, "F");
  doc.setDrawColor(...COLORS.borderLight);
  doc.setLineWidth(0.4);
  doc.rect(cardX, y, cardWidth, cardHeight, "S");

  let cardY = y + 8;
  const cardContentCenterX = cardX + ACCENT_W + (cardWidth - ACCENT_W) / 2;
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.primary);
  doc.setFont("helvetica", "bold");
  doc.text("INFORMAÇÕES DA AVALIAÇÃO", cardContentCenterX, cardY, { align: "center" });
  cardY += 6;
  doc.setDrawColor(...COLORS.borderLight);
  doc.setLineWidth(0.3);
  doc.line(cardX + ACCENT_W + 4, cardY, cardX + cardWidth - 4, cardY);
  cardY += 4;

  doc.setFontSize(8);
  const lx = cardX + ACCENT_W + inset;
  const vx = lx + labelWidth;
  for (const field of fieldRows) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.primary);
    doc.text(field.label, lx, cardY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textDark);
    doc.text(field.lines, vx, cardY);
    cardY += Math.max(ROW_H, field.lines.length * (ROW_H - 0.5));
  }
}

/** Remove blocos iniciais repetidos "PARECER TÉCNICO DE PARTICIPAÇÃO: …" vindos do HTML (mantém só o §4 como título). */
function stripDuplicatedParecerParticipacao(plain: string): string {
  const blocks = plain
    .trim()
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const isParecerOnlyBlock = (b: string) => {
    const lines = b
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return (
      lines.length > 0 &&
      lines.every((l) => /^PARECER TÉCNICO DE PARTICIPAÇÃO:/i.test(l.trim()))
    );
  };
  while (blocks.length > 0 && isParecerOnlyBlock(blocks[0])) {
    blocks.shift();
  }
  let rest = blocks.join("\n\n").trim();
  const lines = rest.split("\n");
  let i = 0;
  while (i < lines.length && /^PARECER TÉCNICO DE PARTICIPAÇÃO:/i.test(lines[i].trim())) {
    i++;
  }
  rest = lines.slice(i).join("\n").trim();
  return rest;
}

/** Texto sobre participação (HTML da API), com títulos de seção destacados. */
function renderParticipacaoIaPage(
  doc: import("jspdf").jsPDF,
  htmlParticipacao: unknown,
  pageWidth: number,
  pageHeight: number,
  startY: number
): number {
  let y = startY;
  const maxW = pageWidth - MARGIN * 2;
  const plain = stripDuplicatedParecerParticipacao(stripHtml(htmlParticipacao).trim());

  if (!plain) {
    return addBodyText(
      doc,
      "Análise automática de participação indisponível para este relatório.",
      y,
      pageWidth,
      pageHeight
    );
  }

  const blocks = plain.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const isLikelySubheading =
      lines.length === 1 &&
      lines[0].length < 120 &&
      /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9\s\-–—:]+$/.test(lines[0]) &&
      (lines[0].includes(":") || lines[0] === lines[0].toUpperCase());

    if (isLikelySubheading && lines[0].length > 5) {
      if (y > pageHeight - MARGIN - 22) {
        doc.addPage();
        y = MARGIN;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.textDark);
      const wrappedH = doc.splitTextToSize(lines[0], maxW);
      for (const wl of wrappedH) {
        doc.text(wl, MARGIN, y);
        y += 5;
      }
      y += 2;
      continue;
    }

    const para = lines.join(" ");
    y = addBodyText(doc, para, y, pageWidth, pageHeight);
  }
  return y;
}

function addHeading(
  doc: import("jspdf").jsPDF,
  title: string,
  y: number,
  pageWidth: number,
  pageHeight: number
): number {
  if (y > pageHeight - MARGIN - 30) {
    doc.addPage();
    y = MARGIN;
  }
  if (y <= MARGIN + 1) {
    drawTopBand(doc, pageWidth, title);
    return TOP_BAND_H + 12;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.primary);
  doc.text(title, MARGIN, y);
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 2, pageWidth - MARGIN, y + 2);
  return y + 10;
}

/** Título de seção longo em até 3 linhas, alinhado ao padrão do sistema. */
function addHeadingWrapped(
  doc: import("jspdf").jsPDF,
  title: string,
  y: number,
  pageWidth: number,
  pageHeight: number
): number {
  if (y <= MARGIN + 1) {
    drawTopBand(doc, pageWidth, title);
    return TOP_BAND_H + 12;
  }
  const maxW = pageWidth - 2 * MARGIN;
  let fs = 11;
  let lines: string[] = [];
  for (const size of [11, 10, 9]) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(...COLORS.primary);
    fs = size;
    lines = doc.splitTextToSize(title.trim().toUpperCase(), maxW);
    if (lines.length <= 3) break;
  }
  for (const line of lines) {
    if (y > pageHeight - MARGIN - 28) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(line, MARGIN, y);
    y += fs * 0.52;
  }
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 1, pageWidth - MARGIN, y + 1);
  return y + 9;
}

function fmtPctTable(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${Math.round(n)}%`;
}

function addBodyText(
  doc: import("jspdf").jsPDF,
  text: string,
  y: number,
  pageWidth: number,
  pageHeight: number
): number {
  if (!text) return y + 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textDark);
  const maxW = pageWidth - MARGIN * 2;
  const lines = doc.splitTextToSize(text, maxW);
  const lineH = 4.2;
  for (const line of lines) {
    if (y > pageHeight - MARGIN - 12) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(line, MARGIN, y);
    y += lineH;
  }
  return y + 4;
}

/** Palavras com alternância normal/negrito, quebra de linha por largura (pt-BR). */
function renderWrappedSegments(
  doc: import("jspdf").jsPDF,
  segments: { text: string; bold?: boolean }[],
  x: number,
  y: number,
  maxWidth: number,
  pageHeight: number,
  fontSize: number
): number {
  const words: { w: string; bold: boolean }[] = [];
  for (const seg of segments) {
    const parts = String(seg.text).split(/\s+/).filter(Boolean);
    for (const p of parts) {
      words.push({ w: p, bold: !!seg.bold });
    }
  }

  const lineH = fontSize * 0.48;
  let curY = y;
  let buf: { w: string; bold: boolean }[] = [];

  const lineWidth = (parts: typeof buf): number => {
    let tw = 0;
    for (const p of parts) {
      doc.setFont("helvetica", p.bold ? "bold" : "normal");
      doc.setFontSize(fontSize);
      tw += doc.getTextWidth(p.w + " ");
    }
    return tw;
  };

  const drawLine = (parts: typeof buf) => {
    if (parts.length === 0) return;
    let cx = x;
    for (const p of parts) {
      doc.setFont("helvetica", p.bold ? "bold" : "normal");
      doc.setFontSize(fontSize);
      doc.setTextColor(...COLORS.textDark);
      const piece = p.w + " ";
      doc.text(piece, cx, curY);
      cx += doc.getTextWidth(piece);
    }
    curY += lineH;
  };

  const ensureSpace = () => {
    if (curY > pageHeight - MARGIN - 14) {
      doc.addPage();
      curY = MARGIN;
    }
  };

  for (const w of words) {
    const trial = [...buf, w];
    if (lineWidth(trial) > maxWidth && buf.length > 0) {
      ensureSpace();
      drawLine(buf);
      buf = [w];
    } else {
      buf = trial;
    }
  }
  if (buf.length > 0) {
    ensureSpace();
    drawLine(buf);
  }
  return curY + 5;
}

function resolveNivelGeral(block: NivelAprendizagemDisciplina): NivelAprendizagemGeral | undefined {
  return block.geral ?? block.total_geral;
}

function niveisDisciplineSortKeys(keys: string[]): string[] {
  const geral = keys.filter((k) => k.trim().toUpperCase() === "GERAL");
  const rest = keys
    .filter((k) => k.trim().toUpperCase() !== "GERAL")
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [...geral, ...rest];
}

function buildNiveisEscolaTableRows(
  block: NivelAprendizagemDisciplina,
  opts?: { preferTurma?: boolean }
): { rows: (string | number)[][]; firstColHeader: string } {
  const preferTurma = !!opts?.preferTurma;
  const pe = block.por_escola;
  const pt = block.por_turma;

  if (preferTurma && Array.isArray(pt) && pt.length > 0) {
    return {
      firstColHeader: "TURMA",
      rows: pt.map((t) => [
        formatTurmaLabel(t as unknown as TurmaRowLike).toUpperCase(),
        getClassShiftLabel((t as { shift?: string }).shift),
        t.abaixo_do_basico ?? "—",
        t.basico ?? "—",
        t.adequado ?? "—",
        t.avancado ?? "—",
      ]),
    };
  }

  if (Array.isArray(pe) && pe.length > 0) {
    return {
      firstColHeader: "ESCOLA",
      rows: pe.map((e) => [
        String(e.escola ?? "—").toUpperCase(),
        e.abaixo_do_basico ?? "—",
        e.basico ?? "—",
        e.adequado ?? "—",
        e.avancado ?? "—",
      ]),
    };
  }
  if (Array.isArray(pt) && pt.length > 0) {
    return {
      firstColHeader: "TURMA",
      rows: pt.map((t) => [
        formatTurmaLabel(t as unknown as TurmaRowLike).toUpperCase(),
        getClassShiftLabel((t as { shift?: string }).shift),
        t.abaixo_do_basico ?? "—",
        t.basico ?? "—",
        t.adequado ?? "—",
        t.avancado ?? "—",
      ]),
    };
  }
  const g = resolveNivelGeral(block);
  if (g) {
    return {
      firstColHeader: "ESCOLA",
      rows: [["CONSOLIDADO", g.abaixo_do_basico, g.basico, g.adequado, g.avancado]],
    };
  }
  return { rows: [], firstColHeader: "ESCOLA" };
}

function stripDuplicatedParecerNiveis(plain: string): string {
  let t = plain.trim();
  if (!t) return t;
  const blocks = t
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const isDupTitleLine = (line: string) =>
    /^PARECER TÉCNICO/i.test(line.trim()) && /APRENDIZAGEM/i.test(line);
  const isDupTitleBlock = (b: string) => {
    const lines = b
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.length > 0 && lines.every((l) => isDupTitleLine(l));
  };
  while (blocks.length > 0 && isDupTitleBlock(blocks[0])) {
    blocks.shift();
  }
  let rest = blocks.join("\n\n").trim();
  const lines = rest.split("\n");
  let i = 0;
  while (i < lines.length && isDupTitleLine(lines[i])) {
    i++;
  }
  return lines.slice(i).join("\n").trim();
}

/** Parecer técnico dos níveis: fundo leve, tarja azul à esquerda, texto com blocos em destaque. */
function renderNiveisParecerIaPage(
  doc: import("jspdf").jsPDF,
  htmlNiveis: unknown,
  discKey: string,
  tituloAvaliacao: string,
  pageWidth: number,
  pageHeight: number
): void {
  const contentLeft = MARGIN + 5;
  const textLeft = MARGIN + 8;
  const maxW = pageWidth - textLeft - MARGIN;

  doc.setFillColor(...COLORS.bgLight);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawTopBand(doc, pageWidth, "PARECER TÉCNICO");
  doc.setDrawColor(...PARECER_NIVEL_ACCENT);
  doc.setLineWidth(0.8);
  doc.line(contentLeft, MARGIN, contentLeft, pageHeight - MARGIN);

  let y = TOP_BAND_H + 10;
  const discLabel = discKey.trim().toUpperCase() === "GERAL" ? "GERAL" : discKey.toUpperCase();
  const mainTitle = `PARECER TÉCNICO: NÍVEIS DE APRENDIZAGEM EM ${discLabel} (${tituloAvaliacao})`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textDark);
  const titleLines = doc.splitTextToSize(mainTitle.toUpperCase(), maxW);
  for (const tl of titleLines) {
    doc.text(tl, textLeft, y);
    y += 5.2;
  }
  y += 6;

  const plain = stripDuplicatedParecerNiveis(stripHtml(htmlNiveis).trim());
  if (!plain) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textGray);
    doc.text("Parecer técnico indisponível para este recorte.", textLeft, y);
    return;
  }

  const blocks = plain.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const isSub =
      lines.length === 1 &&
      lines[0].length < 140 &&
      /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9\s\-–—:]+$/.test(lines[0]) &&
      lines[0].includes(":") &&
      lines[0] === lines[0].toUpperCase();

    if (isSub && lines[0].length > 4) {
      if (y > pageHeight - MARGIN - 20) {
        doc.addPage();
        doc.setFillColor(...COLORS.bgLight);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
        doc.setDrawColor(...PARECER_NIVEL_ACCENT);
        doc.line(contentLeft, MARGIN, contentLeft, pageHeight - MARGIN);
        y = MARGIN + 4;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...COLORS.textDark);
      const wrapped = doc.splitTextToSize(lines[0], maxW);
      for (const w of wrapped) {
        doc.text(w, textLeft, y);
        y += 5;
      }
      y += 3;
      continue;
    }

    const para = lines.join(" ");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textDark);
    const wrappedP = doc.splitTextToSize(para, maxW);
    for (const ln of wrappedP) {
      if (y > pageHeight - MARGIN - 10) {
        doc.addPage();
        doc.setFillColor(...COLORS.bgLight);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
        doc.setDrawColor(...PARECER_NIVEL_ACCENT);
        doc.line(contentLeft, MARGIN, contentLeft, pageHeight - MARGIN);
        y = MARGIN + 4;
      }
      doc.text(ln, textLeft, y);
      y += 4.2;
    }
    y += 2;
  }
}

function drawNiveisBarChart(
  doc: import("jspdf").jsPDF,
  geral: NivelAprendizagemGeral,
  discDisplay: string,
  pageWidth: number,
  y: number,
  pageHeight: number
): number {
  const total = Math.max(Number(geral.total) || 0, 1);
  const parts = [
    { v: Number(geral.abaixo_do_basico) || 0, short: "Abaixo", long: "Abaixo do Básico" },
    { v: Number(geral.basico) || 0, short: "Básico", long: "Básico" },
    { v: Number(geral.adequado) || 0, short: "Adequado", long: "Adequado" },
    { v: Number(geral.avancado) || 0, short: "Avançado", long: "Avançado" },
  ];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textDark);
  const t1 = `${discDisplay} (total de ${total} alunos avaliados)`;
  doc.text(t1, MARGIN, y);
  y += 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textGray);
  doc.text(`Participantes no escopo: ${total}`, MARGIN, y);
  y += 8;

  const CHART_H = 46;
  const gap = 5;
  const areaW = pageWidth - 2 * MARGIN;
  const colW = (areaW - 3 * gap) / 4;
  const chartTop = y;
  const innerPad = 2.5;

  for (let i = 0; i < 4; i++) {
    const x = MARGIN + i * (colW + gap);
    const count = parts[i].v;
    const pct = (count / total) * 100;
    doc.setFillColor(243, 244, 246);
    doc.roundedRect(x, chartTop, colW, CHART_H, 2, 2, "F");
    doc.setDrawColor(...COLORS.borderLight);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, chartTop, colW, CHART_H, 2, 2, "S");

    const fillH = Math.max((pct / 100) * (CHART_H - 2 * innerPad), pct > 0 ? 3 : 0);
    const yBottom = chartTop + CHART_H - innerPad;
    const yTop = yBottom - fillH;
    if (fillH > 0) {
      doc.setFillColor(...NIVEL_CHART_FILL[i]);
      doc.rect(x + innerPad, yTop, colW - 2 * innerPad, fillH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      const ty = Math.min(yTop + fillH / 2 + 2, yBottom - 1);
      doc.text(formatPercent1PtBr(pct, "0,0%"), x + colW / 2, ty, { align: "center" });
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textDark);
    const cap = `${count} (${formatPercent1PtBr(pct, "0,0%")})`;
    doc.text(cap, x + colW / 2, chartTop + CHART_H + 5, { align: "center" });
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textGray);
    doc.text(parts[i].long, x + colW / 2, chartTop + CHART_H + 10, { align: "center" });
  }

  y = chartTop + CHART_H + 18;
  if (y > pageHeight - MARGIN - 15) {
    return pageHeight - MARGIN;
  }
  return y;
}

type PdfCell = string | number | { content: string | number; rowSpan?: number; styles?: Record<string, unknown> };

function fmtNumPtBr(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return formatDecimal1PtBr(n, "—");
}

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function meanNullable(nums: (number | null)[]): number | null {
  const ok = nums.filter((x): x is number => x != null && !Number.isNaN(x));
  if (ok.length === 0) return null;
  return ok.reduce((a, b) => a + b, 0) / ok.length;
}

/** Paleta gráfico proficiência/notas (azul, roxo, teal, cinza + extras). */
const CONSOL_BAR_COLORS: [number, number, number][] = [
  [59, 130, 246],
  [124, 62, 237],
  [20, 184, 166],
  [156, 163, 175],
  [245, 158, 11],
  [236, 72, 153],
];

function stringifyAnaliseIaMetric(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return stripHtml(raw).trim();
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const parts: string[] = [];
    for (const [, v] of Object.entries(raw as Record<string, unknown>)) {
      const t = stripHtml(v).trim();
      if (t) parts.push(t);
    }
    return parts.join("\n\n").trim();
  }
  return "";
}

function stripDupParecerProfOuNota(plain: string, kind: "prof" | "nota"): string {
  const re =
    kind === "prof"
      ? /^PARECER TÉCNICO.*PROFICIÊNCIA/i
      : /^PARECER TÉCNICO.*NOTAS?/i;
  let t = plain.trim();
  const blocks = t.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  while (blocks.length > 0 && blocks[0].split("\n").every((l) => re.test(l.trim()))) {
    blocks.shift();
  }
  t = blocks.join("\n\n").trim();
  const lines = t.split("\n");
  let i = 0;
  while (i < lines.length && re.test(lines[i].trim())) i++;
  return lines.slice(i).join("\n").trim();
}

function renderParecerProfOuNotaPage(
  doc: import("jspdf").jsPDF,
  kind: "prof" | "nota",
  tituloAvaliacao: string,
  htmlOrObj: unknown,
  pageWidth: number,
  pageHeight: number
): void {
  const contentLeft = MARGIN + 5;
  const textLeft = MARGIN + 8;
  const maxW = pageWidth - textLeft - MARGIN;
  doc.setFillColor(...COLORS.bgLight);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawTopBand(doc, pageWidth, "PARECER TÉCNICO");
  doc.setDrawColor(...PARECER_NIVEL_ACCENT);
  doc.setLineWidth(0.8);
  doc.line(contentLeft, MARGIN, contentLeft, pageHeight - MARGIN);

  let y = TOP_BAND_H + 10;
  const sub = kind === "prof" ? "PROFICIÊNCIA" : "NOTAS";
  const mainTitle = `PARECER TÉCNICO: ${sub} (${tituloAvaliacao})`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textDark);
  for (const tl of doc.splitTextToSize(mainTitle.toUpperCase(), maxW)) {
    doc.text(tl, textLeft, y);
    y += 5.2;
  }
  y += 6;

  const plain = stripDupParecerProfOuNota(stringifyAnaliseIaMetric(htmlOrObj), kind);
  if (!plain) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textGray);
    doc.text("Parecer técnico indisponível para este recorte.", textLeft, y);
    return;
  }

  const blocks = plain.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const isSub =
      lines.length === 1 &&
      lines[0].length < 140 &&
      /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9\s\-–—:]+$/.test(lines[0]) &&
      lines[0].includes(":") &&
      lines[0] === lines[0].toUpperCase();
    if (isSub && lines[0].length > 4) {
      if (y > pageHeight - MARGIN - 20) {
        doc.addPage();
        doc.setFillColor(...COLORS.bgLight);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
        doc.setDrawColor(...PARECER_NIVEL_ACCENT);
        doc.line(contentLeft, MARGIN, contentLeft, pageHeight - MARGIN);
        y = MARGIN + 4;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...COLORS.textDark);
      for (const w of doc.splitTextToSize(lines[0], maxW)) {
        doc.text(w, textLeft, y);
        y += 5;
      }
      y += 3;
      continue;
    }
    const para = lines.join(" ");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textDark);
    for (const ln of doc.splitTextToSize(para, maxW)) {
      if (y > pageHeight - MARGIN - 10) {
        doc.addPage();
        doc.setFillColor(...COLORS.bgLight);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
        doc.setDrawColor(...PARECER_NIVEL_ACCENT);
        doc.line(contentLeft, MARGIN, contentLeft, pageHeight - MARGIN);
        y = MARGIN + 4;
      }
      doc.text(ln, textLeft, y);
      y += 4.2;
    }
    y += 2;
  }
}

function drawConsolidadoMetricBarChart(
  doc: import("jspdf").jsPDF,
  bars: { label: string; value: number; color: [number, number, number] }[],
  chartTitle: string,
  pageWidth: number,
  y: number,
  pageHeight: number
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textDark);
  for (const ln of doc.splitTextToSize(chartTitle, pageWidth - 2 * MARGIN)) {
    doc.text(ln, MARGIN, y);
    y += 5;
  }
  y += 3;

  const CHART_H = 46;
  const gap = 2;
  const sidePad = 2;
  const areaW = pageWidth - 2 * MARGIN;
  const innerW = areaW - 2 * sidePad;
  const nB = Math.max(bars.length, 1);
  const colW = (innerW - gap * (nB - 1)) / nB;
  const innerPad = 1.8;
  const maxVal = Math.max(...bars.map((b) => b.value), 1);

  doc.setDrawColor(...COLORS.borderLight);
  doc.setLineWidth(0.35);
  doc.roundedRect(MARGIN, y, areaW, CHART_H + 18, 2.5, 2.5, "S");

  const chartTop = y + 4;
  let x = MARGIN + sidePad;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const frac = b.value / maxVal;
    const fillH = Math.max(frac * (CHART_H - 2 * innerPad), b.value > 0 ? 3.5 : 0);
    const yBottom = chartTop + CHART_H - innerPad;
    const yTop = yBottom - fillH;
    doc.setFillColor(243, 244, 246);
    doc.roundedRect(x, chartTop, colW, CHART_H, 1.5, 1.5, "F");
    if (fillH > 0) {
      doc.setFillColor(...b.color);
      doc.rect(x + innerPad, yTop, colW - 2 * innerPad, fillH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(fmtNumPtBr(b.value), x + colW / 2, Math.min(yTop + fillH / 2 + 1.5, yBottom - 0.5), {
        align: "center",
      });
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...COLORS.textDark);
    const shortL = doc.splitTextToSize(b.label, Math.max(colW - 1, 8));
    let ly = chartTop + CHART_H + 4;
    for (const sl of shortL.slice(0, 2)) {
      doc.text(sl, x + colW / 2, ly, { align: "center" });
      ly += 2.8;
    }
    doc.setFontSize(6);
    doc.setTextColor(...COLORS.textGray);
    doc.text(fmtNumPtBr(b.value), x + colW / 2, ly + 0.5, { align: "center" });
    x += colW + gap;
  }

  y = chartTop + CHART_H + 20;
  return y > pageHeight - MARGIN ? pageHeight - MARGIN : y;
}

function drawDisciplinaBanner(doc: import("jspdf").jsPDF, disc: string, y: number, pageWidth: number): number {
  const w = pageWidth - 2 * MARGIN;
  doc.setFillColor(243, 244, 246);
  doc.setDrawColor(...COLORS.borderLight);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN, y, w, 9, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textDark);
  doc.text(disc.toUpperCase(), pageWidth / 2, y + 6, { align: "center" });
  return y + 11;
}

/** Grade de questões (estilo AnaliseAvaliacoes): topo azul, código amarelo, % verde/vermelho. */
function drawAcertosQuestoesGrid(
  doc: import("jspdf").jsPDF,
  questoes: UnknownRecord[],
  startY: number,
  pageWidth: number,
  pageHeight: number
): number {
  let y = startY;
  const innerW = pageWidth - 2 * MARGIN;
  const gapC = 1;
  const maxCols = 7;
  let cols = Math.min(maxCols, Math.max(1, Math.floor((innerW + gapC) / (19 + gapC))));
  let cardW = (innerW - gapC * (cols - 1)) / cols;
  while (cardW < 12.5 && cols > 1) {
    cols -= 1;
    cardW = (innerW - gapC * (cols - 1)) / cols;
  }

  const hTop = 6.5;
  const hMid = 7.5;
  const hBot = 8;
  const rowH = hTop + hMid + hBot;

  const greenBg: [number, number, number] = [34, 197, 94];
  const redBg: [number, number, number] = [220, 53, 69];
  const yellowBg: [number, number, number] = [234, 179, 8];
  const blueTop: [number, number, number] = [37, 99, 235];

  for (let start = 0; start < questoes.length; start += cols) {
    if (y + rowH > pageHeight - MARGIN - 30) {
      doc.addPage();
      y = MARGIN;
    }
    const slice = questoes.slice(start, start + cols);
    const rowTop = y;
    for (let c = 0; c < slice.length; c++) {
      const q = slice[c] as UnknownRecord;
      const cx = MARGIN + c * (cardW + gapC);
      const num = q.numero_questao ?? q.numero ?? start + c + 1;
      const cod = String(q.codigo ?? "—");
      const pct = Number(q.percentual ?? 0);

      doc.setFillColor(...blueTop);
      doc.rect(cx, rowTop, cardW, hTop, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
      doc.text(`${num}ª Q`, cx + cardW / 2, rowTop + 4.2, { align: "center" });

      doc.setFillColor(...yellowBg);
      doc.rect(cx, rowTop + hTop, cardW, hMid, "F");
      doc.setFontSize(5.5);
      doc.setTextColor(30, 30, 30);
      const codLines = doc.splitTextToSize(cod, Math.max(cardW - 1.5, 8));
      let cy = rowTop + hTop + 3.5;
      for (const cl of codLines.slice(0, 2)) {
        doc.text(cl, cx + cardW / 2, cy, { align: "center" });
        cy += 2.8;
      }

      const ok = pct >= 70;
      doc.setFillColor(...(ok ? greenBg : redBg));
      doc.rect(cx, rowTop + hTop + hMid, cardW, hBot, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      const pctStr = formatPercent1PtBr(pct, "0,0%");
      doc.text(pctStr, cx + cardW / 2, rowTop + hTop + hMid + 5.2, { align: "center" });
    }
    y = rowTop + rowH + 3;
  }

  y += 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const cx0 = pageWidth / 2 - 32;
  doc.setFillColor(...greenBg);
  doc.rect(cx0, y, 3.2, 3.2, "F");
  doc.setTextColor(...COLORS.textDark);
  doc.text("> 70%", cx0 + 6, y + 2.5);
  doc.setFillColor(...redBg);
  doc.rect(cx0 + 36, y, 3.2, 3.2, "F");
  doc.text("< 70%", cx0 + 42, y + 2.5);
  return y + 8;
}

/** Corrige artefatos comuns do HTML/PDF (≥ vira "e", aspas estranhas). */
function fixAcertosParecerPlain(plain: string): string {
  let t = plain
    .replace(/^(PARECER (TÉCNICO|PEDAGÓGICO)[^\n]*\n?)+/gim, "")
    .replace(/Acertos\s*["'`´«»]?\s*e\s+70[,.]?\d*\s*%?/gi, "Acertos > 70%")
    .replace(/Acertos\s*[""''«»]?\s*e\s+(\d)/gi, "Acertos > $1")
    .replace(/Acertos\s+e\s+70/gi, "Acertos > 70")
    .replace(/\(\s*Acertos\s*≥\s*70/gi, "(Acertos > 70")
    .replace(/\(\s*Acertos\s*>\s*70/gi, "(Acertos > 70")
    .trim();
  return t;
}

function isAcertosSectionHeadingLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 15 || t.length > 220 || !t.includes(":")) return false;
  if (/^Habilidades\b/i.test(t)) return true;
  if (/^MAPA\s+DE\s+/i.test(t)) return true;
  if (/^PROPOSTA\s+DE\s+/i.test(t)) return true;
  return false;
}

/** Separa título (negrito) do parágrafo após o primeiro ":" útil — evita negritar o corpo inteiro. */
function splitAcertosHeadingFromBody(line: string): { heading: string; body: string } | null {
  const t = line.trim();
  if (!t.includes(":")) return null;

  if (/^Habilidades\b/i.test(t)) {
    const idxParen = t.indexOf("): ");
    if (idxParen !== -1) {
      const heading = `${t.slice(0, idxParen + 1).trim()}:`;
      const body = t.slice(idxParen + 3).trim();
      if (body.length > 0) return { heading, body };
    }
    const idx = t.indexOf(": ");
    if (idx > 12 && idx < 240) {
      const heading = `${t.slice(0, idx).trim()}:`;
      const body = t.slice(idx + 2).trim();
      if (body.length > 0) return { heading, body };
    }
    return null;
  }

  if (/^MAPA\s+DE\s+CALOR/i.test(t)) {
    const idx = t.indexOf(": ");
    if (idx > 15 && idx < 220) {
      const heading = `${t.slice(0, idx).trim()}:`;
      const body = t.slice(idx + 2).trim();
      if (body.length > 0) return { heading, body };
    }
  }

  if (/^PROPOSTA\s+DE\s+INTERVENÇÃO/i.test(t)) {
    const idx = t.indexOf(": ");
    if (idx > 20 && idx < 220) {
      const heading = `${t.slice(0, idx).trim()}:`;
      const body = t.slice(idx + 2).trim();
      if (body.length > 0) return { heading, body };
    }
  }

  return null;
}

function renderAcertosHabilidadeParecerPage(
  doc: import("jspdf").jsPDF,
  discKey: string,
  tituloAvaliacao: string,
  htmlBlock: unknown,
  pageWidth: number,
  pageHeight: number
): void {
  const contentLeft = MARGIN + 5;
  const textLeft = MARGIN + 8;
  const maxW = pageWidth - textLeft - MARGIN;
  doc.setFillColor(...COLORS.bgLight);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawTopBand(doc, pageWidth, "PARECER TÉCNICO");
  doc.setDrawColor(...PARECER_NIVEL_ACCENT);
  doc.setLineWidth(0.8);
  doc.line(contentLeft, MARGIN, contentLeft, pageHeight - MARGIN);

  let y = TOP_BAND_H + 10;
  const lab = discKey.toUpperCase();
  const mainTitle = `PARECER TÉCNICO: ACERTOS POR HABILIDADE — ${lab} (${tituloAvaliacao})`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textDark);
  for (const tl of doc.splitTextToSize(mainTitle.toUpperCase(), maxW)) {
    doc.text(tl, textLeft, y);
    y += 5.2;
  }
  y += 6;

  let plain = fixAcertosParecerPlain(stripHtml(htmlBlock).trim());

  if (!plain) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textGray);
    doc.text("Parecer técnico indisponível para este recorte.", textLeft, y);
    return;
  }

  const blocks = plain.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);

    if (lines.length === 1) {
      const splitHb = splitAcertosHeadingFromBody(lines[0]);
      if (splitHb) {
        if (y > pageHeight - MARGIN - 20) {
          doc.addPage();
          doc.setFillColor(...COLORS.bgLight);
          doc.rect(0, 0, pageWidth, pageHeight, "F");
          doc.setDrawColor(...PARECER_NIVEL_ACCENT);
          doc.line(contentLeft, MARGIN, contentLeft, pageHeight - MARGIN);
          y = MARGIN + 4;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...COLORS.textDark);
        for (const w of doc.splitTextToSize(splitHb.heading, maxW)) {
          doc.text(w, textLeft, y);
          y += 5;
        }
        y += 2;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        for (const ln of doc.splitTextToSize(splitHb.body, maxW)) {
          if (y > pageHeight - MARGIN - 10) {
            doc.addPage();
            doc.setFillColor(...COLORS.bgLight);
            doc.rect(0, 0, pageWidth, pageHeight, "F");
            doc.setDrawColor(...PARECER_NIVEL_ACCENT);
            doc.line(contentLeft, MARGIN, contentLeft, pageHeight - MARGIN);
            y = MARGIN + 4;
          }
          doc.setFont("helvetica", "normal");
          doc.text(ln, textLeft, y);
          y += 4.2;
        }
        y += 2;
        continue;
      }
    }

    const isSub =
      lines.length === 1 &&
      (isAcertosSectionHeadingLine(lines[0]) ||
        (lines[0].length < 140 &&
          /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9\s\-–—:]+$/.test(lines[0]) &&
          lines[0].includes(":") &&
          lines[0] === lines[0].toUpperCase()));
    if (isSub && lines[0].length > 4) {
      if (y > pageHeight - MARGIN - 20) {
        doc.addPage();
        doc.setFillColor(...COLORS.bgLight);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
        doc.setDrawColor(...PARECER_NIVEL_ACCENT);
        doc.line(contentLeft, MARGIN, contentLeft, pageHeight - MARGIN);
        y = MARGIN + 4;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...COLORS.textDark);
      for (const w of doc.splitTextToSize(lines[0], maxW)) {
        doc.text(w, textLeft, y);
        y += 5;
      }
      y += 3;
      continue;
    }
    const para = lines.join(" ");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textDark);
    for (const ln of doc.splitTextToSize(para, maxW)) {
      if (y > pageHeight - MARGIN - 10) {
        doc.addPage();
        doc.setFillColor(...COLORS.bgLight);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
        doc.setDrawColor(...PARECER_NIVEL_ACCENT);
        doc.line(contentLeft, MARGIN, contentLeft, pageHeight - MARGIN);
        y = MARGIN + 4;
      }
      doc.setFont("helvetica", "normal");
      doc.text(ln, textLeft, y);
      y += 4.2;
    }
    y += 2;
  }
}

function buildProficienciaConsolidada(prof: Proficiencia | undefined, opts?: { preferTurma?: boolean }) {
  const preferTurma = !!opts?.preferTurma;
  const porDisc = prof?.por_disciplina;
  if (!porDisc) return null;
  const discKeys = Object.keys(porDisc)
    .filter((k) => k !== "GERAL")
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (discKeys.length === 0) return null;

  const mm = prof?.media_municipal_por_disciplina ?? {};

  const hasEscola = discKeys.some(
    (d) => Array.isArray(porDisc[d]?.por_escola) && (porDisc[d]!.por_escola!.length ?? 0) > 0
  );
  const hasTurma = discKeys.some(
    (d) => Array.isArray(porDisc[d]?.por_turma) && (porDisc[d]!.por_turma!.length ?? 0) > 0
  );

  let firstColHeader = "ESCOLA";
  const labelSet = new Set<string>();
  if (!preferTurma && hasEscola) {
    firstColHeader = "ESCOLA";
    for (const d of discKeys) {
      for (const r of porDisc[d]?.por_escola ?? []) {
        const lab = String((r as { escola?: string }).escola ?? "").trim().toUpperCase();
        if (lab) labelSet.add(lab);
      }
    }
  } else if (hasTurma) {
    firstColHeader = "TURMA";
    for (const d of discKeys) {
      for (const r of porDisc[d]?.por_turma ?? []) {
        const lab = formatTurmaLabel(r as unknown as TurmaRowLike).trim().toUpperCase();
        if (lab) labelSet.add(lab);
      }
    }
  }

  let labels = [...labelSet].sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (labels.length === 0) labels = ["CONSOLIDADO"];

  const getProf = (disc: string, lab: string): number | null => {
    if (!preferTurma && hasEscola) {
      const row = porDisc[disc]?.por_escola?.find(
        (r) => String((r as { escola?: string }).escola ?? "").trim().toUpperCase() === lab
      );
      return row ? numOrNull((row as { proficiencia?: number; media?: number }).proficiencia ?? (row as { media?: number }).media) : null;
    }
    if (hasTurma) {
      const row = porDisc[disc]?.por_turma?.find(
        (r) => formatTurmaLabel(r as unknown as TurmaRowLike).trim().toUpperCase() === lab
      );
      return row ? numOrNull((row as { proficiencia?: number }).proficiencia) : null;
    }
    return null;
  };

  const rowData = labels.map((lab) => {
    const vals = discKeys.map((d) => getProf(d, lab));
    return { lab, vals, rowMean: meanNullable(vals) };
  });

  if (
    rowData.length === 1 &&
    rowData[0].lab === "CONSOLIDADO" &&
    rowData[0].vals.every((v) => v == null)
  ) {
    rowData[0].vals = discKeys.map((d) => numOrNull(porDisc[d]?.media_geral));
    rowData[0].rowMean = meanNullable(rowData[0].vals);
  }

  const footerDisc = discKeys.map((d) => {
    const muni = (mm as Record<string, unknown>)[d];
    if (muni !== undefined && muni !== null && String(muni) !== "") return Number(muni) || 0;
    return Number(porDisc[d]?.media_geral ?? 0) || 0;
  });
  const footerMean =
    footerDisc.length > 0 ? footerDisc.reduce((a, b) => a + b, 0) / footerDisc.length : 0;
  const footerMunicipal = footerMean;

  const n = rowData.length;
  const body: PdfCell[][] = [];
  for (let i = 0; i < n; i++) {
    const { lab, vals, rowMean } = rowData[i];
    const row: PdfCell[] = [
      lab,
      ...vals.map((v) => (v == null ? "—" : fmtNumPtBr(v))),
      rowMean == null ? "—" : fmtNumPtBr(rowMean),
    ];
    if (i === 0) {
      row.push({
        content: fmtNumPtBr(footerMunicipal),
        rowSpan: n,
        styles: { valign: "middle", halign: "center", fontStyle: "bold" },
      });
    }
    body.push(row);
  }

  const foot: PdfCell[][] = [
    [
      "MUNICIPAL GERAL",
      ...footerDisc.map((v) => fmtNumPtBr(v)),
      fmtNumPtBr(footerMean),
      fmtNumPtBr(footerMunicipal),
    ],
  ];

  const chartBars = [
    ...discKeys.map((d, i) => ({
      label: d,
      value: footerDisc[discKeys.indexOf(d)] ?? 0,
      color: CONSOL_BAR_COLORS[i % CONSOL_BAR_COLORS.length],
    })),
    {
      label: "Média",
      value: footerMean,
      color: CONSOL_BAR_COLORS[discKeys.length % CONSOL_BAR_COLORS.length],
    },
    {
      label: "Média Municipal",
      value: footerMunicipal,
      color: [156, 163, 175] as [number, number, number],
    },
  ];

  return { discKeys, firstColHeader, body, foot, chartBars, chartTitle: "Proficiência Geral (MUNICIPAL GERAL)" };
}

function buildNotasConsolidada(ng: NotaGeral | undefined, opts?: { preferTurma?: boolean }) {
  const preferTurma = !!opts?.preferTurma;
  const porDisc = ng?.por_disciplina;
  if (!porDisc) return null;
  const discKeys = Object.keys(porDisc)
    .filter((k) => k !== "GERAL")
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (discKeys.length === 0) return null;

  const mm = ng?.media_municipal_por_disciplina ?? {};

  const hasEscola = discKeys.some(
    (d) => Array.isArray(porDisc[d]?.por_escola) && (porDisc[d]!.por_escola!.length ?? 0) > 0
  );
  const hasTurma = discKeys.some(
    (d) => Array.isArray(porDisc[d]?.por_turma) && (porDisc[d]!.por_turma!.length ?? 0) > 0
  );

  let firstColHeader = "ESCOLA";
  const labelSet = new Set<string>();
  if (!preferTurma && hasEscola) {
    firstColHeader = "ESCOLA";
    for (const d of discKeys) {
      for (const r of porDisc[d]?.por_escola ?? []) {
        const lab = String((r as { escola?: string }).escola ?? "").trim().toUpperCase();
        if (lab) labelSet.add(lab);
      }
    }
  } else if (hasTurma) {
    firstColHeader = "TURMA";
    for (const d of discKeys) {
      for (const r of porDisc[d]?.por_turma ?? []) {
        const lab = formatTurmaLabel(r as unknown as TurmaRowLike).trim().toUpperCase();
        if (lab) labelSet.add(lab);
      }
    }
  }

  let labels = [...labelSet].sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (labels.length === 0) labels = ["CONSOLIDADO"];

  const getNota = (disc: string, lab: string): number | null => {
    if (!preferTurma && hasEscola) {
      const row = porDisc[disc]?.por_escola?.find(
        (r) => String((r as { escola?: string }).escola ?? "").trim().toUpperCase() === lab
      );
      return row ? numOrNull((row as { nota?: number; media?: number }).nota ?? (row as { media?: number }).media) : null;
    }
    if (hasTurma) {
      const row = porDisc[disc]?.por_turma?.find(
        (r) => formatTurmaLabel(r as unknown as TurmaRowLike).trim().toUpperCase() === lab
      );
      return row ? numOrNull((row as { nota?: number }).nota) : null;
    }
    return null;
  };

  const rowData = labels.map((lab) => {
    const vals = discKeys.map((d) => getNota(d, lab));
    return { lab, vals, rowMean: meanNullable(vals) };
  });

  if (
    rowData.length === 1 &&
    rowData[0].lab === "CONSOLIDADO" &&
    rowData[0].vals.every((v) => v == null)
  ) {
    rowData[0].vals = discKeys.map((d) => numOrNull(porDisc[d]?.media_geral));
    rowData[0].rowMean = meanNullable(rowData[0].vals);
  }

  const footerDisc = discKeys.map((d) => {
    const muni = (mm as Record<string, unknown>)[d];
    if (muni !== undefined && muni !== null && String(muni) !== "") return Number(muni) || 0;
    return Number(porDisc[d]?.media_geral ?? 0) || 0;
  });
  const footerMean =
    footerDisc.length > 0 ? footerDisc.reduce((a, b) => a + b, 0) / footerDisc.length : 0;
  const footerMunicipal = footerMean;

  const n = rowData.length;
  const body: PdfCell[][] = [];
  for (let i = 0; i < n; i++) {
    const { lab, vals, rowMean } = rowData[i];
    const row: PdfCell[] = [
      lab,
      ...vals.map((v) => (v == null ? "—" : fmtNumPtBr(v))),
      rowMean == null ? "—" : fmtNumPtBr(rowMean),
    ];
    if (i === 0) {
      row.push({
        content: fmtNumPtBr(footerMunicipal),
        rowSpan: n,
        styles: { valign: "middle", halign: "center", fontStyle: "bold" },
      });
    }
    body.push(row);
  }

  const foot: PdfCell[][] = [
    [
      "MUNICIPAL GERAL",
      ...footerDisc.map((v) => fmtNumPtBr(v)),
      fmtNumPtBr(footerMean),
      fmtNumPtBr(footerMunicipal),
    ],
  ];

  const chartBars = [
    ...discKeys.map((d, i) => ({
      label: d,
      value: footerDisc[discKeys.indexOf(d)] ?? 0,
      color: CONSOL_BAR_COLORS[i % CONSOL_BAR_COLORS.length],
    })),
    {
      label: "Média",
      value: footerMean,
      color: CONSOL_BAR_COLORS[discKeys.length % CONSOL_BAR_COLORS.length],
    },
    {
      label: "Média Municipal",
      value: footerMunicipal,
      color: [156, 163, 175] as [number, number, number],
    },
  ];

  return { discKeys, firstColHeader, body, foot, chartBars, chartTitle: "Notas Geral (MUNICIPAL GERAL)" };
}

function disciplinasComE(names: string[]): string {
  const n = names.map((s) => String(s).trim()).filter(Boolean);
  if (n.length === 0) return "—";
  return n.join(" e ");
}

function formatPctRelatorio(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${Math.round(n)}%`;
}

/**
 * Gera PDF do relatório organizado (layout próximo à análise Acertos/Níveis) a partir do JSON
 * já normalizado (`normalizeRelatorioCompletoForAnaliseUI`).
 */
export async function generateRelatorioOrganizadoPdf(data: RelatorioCompleto): Promise<void> {
  const ext = data as RelatorioCompleto & UnknownRecord;
  const meta = (ext.metadados || {}) as UnknownRecord;
  const analiseIa = (ext.analise_ia || {}) as UnknownRecord;

  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const municipio = String(meta.municipio ?? "—");
  const uf = String(meta.uf ?? "ALAGOAS");
  const dataGeracao = String(meta.data_geracao ?? new Date().toLocaleString("pt-BR"));
  const scopeType = String(meta.scope_type ?? ext.escopo?.tipo ?? "");
  const preferTurmaTables = scopeType === "school";
  const cityId = (meta.municipio_id as string | undefined) || (ext.escopo?.city_id as string | null) || null;

  let logoDataUrl = "";
  let logoW = 0;
  let logoH = 0;
  const analiseBranding = await loadCityBrandingForReportPdf(cityId);
  const coverLetterhead = analiseBranding.letterhead;
  if (analiseBranding.logo) {
    logoDataUrl = analiseBranding.logo.dataUrl;
    logoW = analiseBranding.logo.iw;
    logoH = analiseBranding.logo.ih;
  } else if (typeof ext.default_logo === "string" && ext.default_logo.length > 40) {
    logoDataUrl = ext.default_logo.startsWith("data:") ? ext.default_logo : `data:image/png;base64,${ext.default_logo}`;
    logoW = 120;
    logoH = 40;
  }

  const seriesLine = String(
    (meta.series_label ??
      (Array.isArray(meta.series) ? (meta.series as string[]).join(", ") : "")) ||
      "—"
  );
  const disciplinasList = Array.isArray(data.avaliacao?.disciplinas)
    ? (data.avaliacao!.disciplinas as string[]).filter((d) => String(d).trim() !== "")
    : [];
  const disciplinasLine = disciplinasList.join(", ");
  const tituloAval = String(data.avaliacao?.titulo ?? "avaliação").trim();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let pageWidth = doc.internal.pageSize.getWidth();
  let pageHeight = doc.internal.pageSize.getHeight();

  drawCoverLikeAcertoNiveis(doc, pageWidth, pageHeight, data, {
    logoDataUrl,
    logoW,
    logoH,
    municipio,
    uf,
    tituloAvaliacao: tituloAval,
    seriesLine,
    disciplinasLine,
    dataGeracao,
    coverLetterhead,
  });

  doc.addPage();
  pageWidth = doc.internal.pageSize.getWidth();
  pageHeight = doc.internal.pageSize.getHeight();
  let y = MARGIN;

  const tg = data.total_alunos?.total_geral;
  const porEscolas = data.total_alunos?.por_escola;
  const nEscolas = Array.isArray(porEscolas) && porEscolas.length > 0 ? porEscolas.length : 1;
  const avaliados = Number(tg?.avaliados ?? 0);
  const pctRede = formatPctRelatorio(tg?.percentual);
  const anoRel = Number(meta.ano) || new Date().getFullYear();
  const nomeEscola =
    scopeType === "school" && Array.isArray(porEscolas) && porEscolas[0]?.escola
      ? String(porEscolas[0].escola)
      : "";
  const trechoRede =
    scopeType === "school" && nomeEscola
      ? `referentes à unidade escolar de ${nomeEscola}`
      : `referentes à rede municipal de ensino de ${municipio}`;
  const disciplinasStr = disciplinasComE(disciplinasList);

  y = addHeading(doc, "1. APRESENTAÇÃO", y, pageWidth, pageHeight);

  const maxW = pageWidth - MARGIN * 2;
  const segIntro: { text: string; bold?: boolean }[] = [
    { text: "Este relatório apresenta os resultados consolidados do " },
    { text: tituloAval, bold: true },
    { text: ` ${trechoRede} no ano de ` },
    { text: String(anoRel), bold: true },
    { text: ". Foram avaliados " },
    { text: `${avaliados} alunos`, bold: true },
    { text: " em " },
    { text: `${nEscolas} ${nEscolas === 1 ? "escola" : "escolas"}`, bold: true },
    { text: ", o que corresponde a " },
    { text: pctRede, bold: true },
    { text: " do total de estudantes da rede." },
  ];
  y = renderWrappedSegments(doc, segIntro, MARGIN, y, maxW, pageHeight, 10);
  y += 3;

  y = addBodyText(doc, "Para a análise, utilizamos:", y, pageWidth, pageHeight);
  const bullets = [
    "Frequência absoluta (número de alunos)",
    "Frequência relativa (percentual)",
    "Média aritmética simples",
  ];
  for (const b of bullets) {
    if (y > pageHeight - MARGIN - 14) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.primary);
    doc.text("•", MARGIN + 2, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textDark);
    const wrapped = doc.splitTextToSize(b, maxW - 10);
    for (let i = 0; i < wrapped.length; i++) {
      doc.text(wrapped[i], MARGIN + 9, y);
      y += 4.2;
    }
  }
  y += 4;

  const segComp: { text: string; bold?: boolean }[] = [
    { text: "As competências avaliadas foram " },
    { text: disciplinasStr, bold: true },
    {
      text:
        ", com dados apresentados por turma, por série e consolidado para toda a rede. Gráficos nominais por aluno e rendimento de cada turma estão disponíveis na ",
    },
    { text: "Plataforma AfirmePlay", bold: true },
    { text: ", nas respectivas unidades de ensino." },
  ];
  y = renderWrappedSegments(doc, segComp, MARGIN, y, maxW, pageHeight, 10);

  const segEscala: { text: string; bold?: boolean }[] = [
    { text: "A escala de cores das médias variou do vermelho (" },
    { text: "0", bold: true },
    { text: ") ao verde (" },
    { text: "10", bold: true },
    {
      text:
        "). Para identificar descritores/habilidades com índice de erro superior a 40%, registramos esses itens em destaque vermelho, sinalizando prioridades de intervenção pedagógica.",
    },
  ];
  y = renderWrappedSegments(doc, segEscala, MARGIN, y, maxW, pageHeight, 10);
  y += 6;

  y = addHeading(doc, "2. CONSIDERAÇÕES GERAIS", y, pageWidth, pageHeight);
  const textoConsideracoes =
    "Antes de olharmos os resultados é importante nos atentarmos que cada escola tem suas especificidades, assim como cada turma. Existem resultados que só serão explicados considerando estas especificidades.";
  y = addBodyText(doc, textoConsideracoes, y, pageWidth, pageHeight);
  y = addBodyText(
    doc,
    "As turmas são únicas e, portanto, a observação das necessidades de cada turma deve ser analisada através do sistema.",
    y,
    pageWidth,
    pageHeight
  );

  const habilidadesIa = (analiseIa.habilidades || {}) as UnknownRecord;

  doc.addPage();
  y = MARGIN;

  y = addHeadingWrapped(
    doc,
    "3. Participação da rede no processo de avaliação diagnóstica",
    y,
    pageWidth,
    pageHeight
  );

  const subParticipacao = "TOTAL DE ALUNOS QUE REALIZARAM A AVALIAÇÃO DIAGNÓSTICA";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textDark);
  const subLines = doc.splitTextToSize(subParticipacao, pageWidth - 2 * MARGIN - 8);
  const bandPad = 4;
  const lineH = 4.2;
  const bandH = Math.max(subLines.length * lineH + bandPad * 2, 12);
  doc.setFillColor(...COLORS.bgLight);
  doc.setDrawColor(...COLORS.borderLight);
  doc.roundedRect(MARGIN, y, pageWidth - 2 * MARGIN, bandH, 1.5, 1.5, "FD");
  let bandY = y + bandPad + 3;
  for (const sl of subLines) {
    doc.text(sl, pageWidth / 2, bandY, { align: "center" });
    bandY += lineH;
  }
  y += bandH + 8;

  const porTurmas = data.total_alunos?.por_turma;
  const bodyParticipacao: (string | number)[][] = preferTurmaTables
    ? (Array.isArray(porTurmas) ? porTurmas : []).map((t) => [
        formatTurmaLabel(t as unknown as TurmaRowLike).toUpperCase(),
        (t as { matriculados?: number }).matriculados ?? "—",
        (t as { avaliados?: number }).avaliados ?? "—",
        fmtPctTable((t as { percentual?: number }).percentual),
        (t as { faltosos?: number }).faltosos ?? "—",
      ])
    : (Array.isArray(porEscolas) ? porEscolas : []).map((e) => [
        String(e.escola ?? "—"),
        e.matriculados ?? "—",
        e.avaliados ?? "—",
        fmtPctTable(e.percentual),
        e.faltosos ?? "—",
      ]);
  if (bodyParticipacao.length === 0 && tg) {
    bodyParticipacao.push([
      "—",
      tg.matriculados ?? "—",
      tg.avaliados ?? "—",
      fmtPctTable(tg.percentual),
      tg.faltosos ?? "—",
    ]);
  }
  const footParticipacao: (string | number)[][] = [
    [
      "MUNICIPAL GERAL",
      tg?.matriculados ?? "—",
      tg?.avaliados ?? "—",
      fmtPctTable(tg?.percentual),
      tg?.faltosos ?? "—",
    ],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [[preferTurmaTables ? "TURMA" : "ESCOLA", "MATRICULADOS", "AVALIADOS", "PERCENTUAL", "FALTOSOS"]],
    body: bodyParticipacao,
    foot: footParticipacao,
    showFoot: "lastPage",
    theme: "plain",
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: COLORS.textDark,
      lineColor: COLORS.borderLight,
      lineWidth: 0.12,
    },
    headStyles: {
      fillColor: COLORS.primary,
      textColor: 255,
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
    },
    footStyles: {
      fillColor: [243, 244, 246],
      textColor: COLORS.textDark,
      fontStyle: "bold",
      lineColor: COLORS.borderLight,
      halign: "center",
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 78, halign: "left", fontStyle: "normal" },
      1: { halign: "center", cellWidth: 26 },
      2: { halign: "center", cellWidth: 26 },
      3: { halign: "center", cellWidth: 26 },
      4: { halign: "center", cellWidth: 22 },
    },
    didParseCell: (hookData) => {
      if (hookData.section === "head") {
        if (hookData.column.index === 0) {
          hookData.cell.styles.halign = "left";
        }
      }
      if (hookData.section === "foot") {
        hookData.cell.styles.halign = hookData.column.index === 0 ? "left" : "center";
      }
    },
  });
  y = tableFinalY(doc, y) + 12;

  doc.addPage();
  y = MARGIN;
  pageWidth = doc.internal.pageSize.getWidth();
  pageHeight = doc.internal.pageSize.getHeight();
  y = addHeading(doc, "4. Parecer técnico de participação", y, pageWidth, pageHeight);
  y = renderParticipacaoIaPage(doc, analiseIa.participacao, pageWidth, pageHeight, y);

  const niveisData = data.niveis_aprendizagem || {};
  const niveisIa = (analiseIa.niveis_aprendizagem || {}) as UnknownRecord;
  const niveisKeysFiltered = niveisDisciplineSortKeys(
    Object.keys(niveisData).filter((k) => {
      const b = niveisData[k] as NivelAprendizagemDisciplina;
      return !!resolveNivelGeral(b);
    })
  );

  if (niveisKeysFiltered.length > 0) {
    doc.addPage();
    pageWidth = doc.internal.pageSize.getWidth();
    pageHeight = doc.internal.pageSize.getHeight();
    y = MARGIN;
    y = addHeading(doc, "5. Níveis de aprendizagem", y, pageWidth, pageHeight);

    let isFirstNivelBlock = true;
    for (const discKey of niveisKeysFiltered) {
      const block = niveisData[discKey] as NivelAprendizagemDisciplina;
      const geral = resolveNivelGeral(block);
      if (!geral) continue;

      if (!isFirstNivelBlock) {
        doc.addPage();
        y = MARGIN;
        pageWidth = doc.internal.pageSize.getWidth();
        pageHeight = doc.internal.pageSize.getHeight();
      }
      isFirstNivelBlock = false;

      const { rows, firstColHeader } = buildNiveisEscolaTableRows(block, { preferTurma: preferTurmaTables });
      const withTurno = firstColHeader === "TURMA";
      const bodyRows = rows.length > 0
        ? rows
        : withTurno
          ? [["—", "—", "—", "—", "—", "—"]]
          : [["—", "—", "—", "—", "—"]];
      const discSubtitle =
        discKey.trim().toUpperCase() === "GERAL" ? "GERAL" : discKey.toUpperCase();
      const tituloNivel1 = `NÍVEIS DE APRENDIZAGEM POR ESCOLA/GERAL – ${tituloAval.toUpperCase()}`;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.textDark);
      for (const tl of doc.splitTextToSize(tituloNivel1, pageWidth - 2 * MARGIN)) {
        doc.text(tl, MARGIN, y);
        y += 4.8;
      }
      doc.setFontSize(11);
      doc.text(discSubtitle, MARGIN, y);
      y += 9;

      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        head: [
          withTurno
            ? [firstColHeader, "TURNO", "ABAIXO DO BÁSICO", "BÁSICO", "ADEQUADO", "AVANÇADO"]
            : [firstColHeader, "ABAIXO DO BÁSICO", "BÁSICO", "ADEQUADO", "AVANÇADO"],
        ],
        body: bodyRows,
        foot: [
          withTurno
            ? [
                "MUNICIPAL GERAL",
                "—",
                geral.abaixo_do_basico ?? "—",
                geral.basico ?? "—",
                geral.adequado ?? "—",
                geral.avancado ?? "—",
              ]
            : [
                "MUNICIPAL GERAL",
                geral.abaixo_do_basico ?? "—",
                geral.basico ?? "—",
                geral.adequado ?? "—",
                geral.avancado ?? "—",
              ],
        ],
        showFoot: "lastPage",
        theme: "striped",
        styles: {
          fontSize: 8,
          cellPadding: 2.5,
          textColor: COLORS.textDark,
          lineColor: COLORS.borderLight,
          lineWidth: 0.12,
        },
        headStyles: {
          fontSize: 7,
          valign: "middle",
          fontStyle: "bold",
        },
        footStyles: {
          fillColor: [243, 244, 246],
          textColor: COLORS.textDark,
          fontStyle: "bold",
          lineColor: COLORS.borderLight,
          halign: "center",
          valign: "middle",
        },
        columnStyles: {
          0: { cellWidth: 75, halign: "left" },
          1: { halign: "center", cellWidth: 26 },
          2: { halign: "center", cellWidth: 26 },
          3: { halign: "center", cellWidth: 26 },
          4: { halign: "center", cellWidth: 22 },
        },
        didParseCell: (hookData) => {
          if (hookData.section === "head") {
            const idx = hookData.column.index;
            if (idx >= 0 && idx < NIVEL_HEAD.length) {
              hookData.cell.styles.fillColor = NIVEL_HEAD[idx];
              hookData.cell.styles.textColor = 255;
            }
            if (idx === 0) hookData.cell.styles.halign = "left";
          }
          if (hookData.section === "foot") {
            hookData.cell.styles.halign = hookData.column.index === 0 ? "left" : "center";
          }
        },
      });

      y = tableFinalY(doc, y) + 10;
      if (y + 88 > pageHeight - MARGIN) {
        doc.addPage();
        y = MARGIN;
        pageWidth = doc.internal.pageSize.getWidth();
        pageHeight = doc.internal.pageSize.getHeight();
      }
      y = drawNiveisBarChart(doc, geral, discSubtitle, pageWidth, y, pageHeight);

      doc.addPage();
      pageWidth = doc.internal.pageSize.getWidth();
      pageHeight = doc.internal.pageSize.getHeight();
      renderNiveisParecerIaPage(doc, niveisIa[discKey], discKey, tituloAval, pageWidth, pageHeight);
    }

    doc.addPage();
    pageWidth = doc.internal.pageSize.getWidth();
    pageHeight = doc.internal.pageSize.getHeight();
    y = MARGIN;
  }

  const profCons = buildProficienciaConsolidada(data.proficiencia, { preferTurma: preferTurmaTables });
  if (profCons) {
    doc.addPage();
    pageWidth = doc.internal.pageSize.getWidth();
    pageHeight = doc.internal.pageSize.getHeight();
    y = MARGIN;
    y = addHeading(doc, "6. Proficiência", y, pageWidth, pageHeight);

    const tituloProf = `PROFICIÊNCIA POR ESCOLA/GERAL – ${tituloAval.toUpperCase()}`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textDark);
    for (const tl of doc.splitTextToSize(tituloProf, pageWidth - 2 * MARGIN)) {
      doc.text(tl, MARGIN, y);
      y += 4.8;
    }
    y += 5;

    const headProf = [
      profCons.firstColHeader,
      ...profCons.discKeys.map((k) => k.toUpperCase()),
      "MÉDIA",
      "MÉDIA MUNICIPAL",
    ];
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [headProf],
      body: profCons.body as import("jspdf-autotable").CellDef[][],
      foot: profCons.foot as import("jspdf-autotable").CellDef[][],
      showFoot: "lastPage",
      theme: "striped",
      styles: {
        fontSize: 8,
        cellPadding: 2.2,
        textColor: COLORS.textDark,
        lineColor: COLORS.borderLight,
        lineWidth: 0.12,
      },
      headStyles: {
        fillColor: COLORS.primary,
        textColor: 255,
        fontStyle: "bold",
        fontSize: 7,
        valign: "middle",
      },
      footStyles: {
        fillColor: [243, 244, 246],
        textColor: COLORS.textDark,
        fontStyle: "bold",
        lineColor: COLORS.borderLight,
        halign: "center",
        valign: "middle",
      },
      didParseCell: (hookData) => {
        if (hookData.section === "head" && hookData.column.index === 0) {
          hookData.cell.styles.halign = "left";
        }
        if (hookData.section === "foot") {
          hookData.cell.styles.halign = hookData.column.index === 0 ? "left" : "center";
        }
      },
    });
    y = tableFinalY(doc, y) + 8;
    if (y + 92 > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
      pageWidth = doc.internal.pageSize.getWidth();
      pageHeight = doc.internal.pageSize.getHeight();
    }
    y = drawConsolidadoMetricBarChart(
      doc,
      profCons.chartBars,
      profCons.chartTitle,
      pageWidth,
      y,
      pageHeight
    );

    doc.addPage();
    pageWidth = doc.internal.pageSize.getWidth();
    pageHeight = doc.internal.pageSize.getHeight();
    renderParecerProfOuNotaPage(doc, "prof", tituloAval, analiseIa.proficiencia, pageWidth, pageHeight);

    doc.addPage();
    pageWidth = doc.internal.pageSize.getWidth();
    pageHeight = doc.internal.pageSize.getHeight();
    y = MARGIN;
  }

  const notaCons = buildNotasConsolidada(data.nota_geral, { preferTurma: preferTurmaTables });
  if (notaCons) {
    if (!profCons) {
      doc.addPage();
      pageWidth = doc.internal.pageSize.getWidth();
      pageHeight = doc.internal.pageSize.getHeight();
      y = MARGIN;
    }
    y = addHeading(doc, "7. Notas", y, pageWidth, pageHeight);

    const tituloNota = `NOTAS POR ESCOLA/GERAL – ${tituloAval.toUpperCase()}`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textDark);
    for (const tl of doc.splitTextToSize(tituloNota, pageWidth - 2 * MARGIN)) {
      doc.text(tl, MARGIN, y);
      y += 4.8;
    }
    y += 5;

    const headNota = [
      notaCons.firstColHeader,
      ...notaCons.discKeys.map((k) => k.toUpperCase()),
      "MÉDIA",
      "MÉDIA MUNICIPAL",
    ];
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [headNota],
      body: notaCons.body as import("jspdf-autotable").CellDef[][],
      foot: notaCons.foot as import("jspdf-autotable").CellDef[][],
      showFoot: "lastPage",
      theme: "striped",
      styles: {
        fontSize: 8,
        cellPadding: 2.2,
        textColor: COLORS.textDark,
        lineColor: COLORS.borderLight,
        lineWidth: 0.12,
      },
      headStyles: {
        fillColor: COLORS.primary,
        textColor: 255,
        fontStyle: "bold",
        fontSize: 7,
        valign: "middle",
      },
      footStyles: {
        fillColor: [243, 244, 246],
        textColor: COLORS.textDark,
        fontStyle: "bold",
        lineColor: COLORS.borderLight,
        halign: "center",
        valign: "middle",
      },
      didParseCell: (hookData) => {
        if (hookData.section === "head" && hookData.column.index === 0) {
          hookData.cell.styles.halign = "left";
        }
        if (hookData.section === "foot") {
          hookData.cell.styles.halign = hookData.column.index === 0 ? "left" : "center";
        }
      },
    });
    y = tableFinalY(doc, y) + 8;
    if (y + 92 > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
      pageWidth = doc.internal.pageSize.getWidth();
      pageHeight = doc.internal.pageSize.getHeight();
    }
    y = drawConsolidadoMetricBarChart(
      doc,
      notaCons.chartBars,
      notaCons.chartTitle,
      pageWidth,
      y,
      pageHeight
    );

    doc.addPage();
    pageWidth = doc.internal.pageSize.getWidth();
    pageHeight = doc.internal.pageSize.getHeight();
    renderParecerProfOuNotaPage(doc, "nota", tituloAval, analiseIa.notas, pageWidth, pageHeight);

    doc.addPage();
    pageWidth = doc.internal.pageSize.getWidth();
    pageHeight = doc.internal.pageSize.getHeight();
    y = MARGIN;
  }

  const acertos = (data.acertos_por_habilidade || {}) as UnknownRecord;
  const keysAc = sortAcertosKeysFrontend(Object.keys(acertos), acertos as Record<string, unknown>);

  if (keysAc.length > 0) {
    pageWidth = doc.internal.pageSize.getWidth();
    pageHeight = doc.internal.pageSize.getHeight();
    y = addHeading(doc, "8. Acertos por habilidade", y, pageWidth, pageHeight);

    let firstAcertoBlock = true;
    for (const disc of keysAc) {
      const block = acertos[disc] as { questoes?: unknown[]; habilidades?: unknown[] } | undefined;
      const questoes = Array.isArray(block?.questoes) ? (block!.questoes! as UnknownRecord[]) : [];
      if (questoes.length === 0) continue;

      if (!firstAcertoBlock) {
        doc.addPage();
        y = MARGIN;
        pageWidth = doc.internal.pageSize.getWidth();
        pageHeight = doc.internal.pageSize.getHeight();
      }
      firstAcertoBlock = false;

      y = drawDisciplinaBanner(doc, disc, y, pageWidth);
      y = drawAcertosQuestoesGrid(doc, questoes, y, pageWidth, pageHeight);

      if (y + 42 > pageHeight - MARGIN) {
        doc.addPage();
        y = MARGIN;
        pageWidth = doc.internal.pageSize.getWidth();
        pageHeight = doc.internal.pageSize.getHeight();
      }

      const qRows = questoes.map((q) => {
        const qq = q as UnknownRecord;
        const pct = Number(qq.percentual ?? 0);
        return [
          qq.numero_questao ?? qq.numero ?? "—",
          String(qq.codigo ?? "—"),
          String(qq.descricao ?? "—"),
          qq.acertos ?? "—",
          qq.total ?? "—",
          formatPercent1PtBr(pct, "0,0%"),
          classificarAcertoPct(pct),
        ];
      });
      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        head: [["QUESTÃO", "CÓDIGO", "DESCRIÇÃO", "ACERTOS", "TOTAL", "%", "CLASSIFICAÇÃO"]],
        body: qRows,
        theme: "striped",
        headStyles: { fillColor: COLORS.primary, textColor: 255, fontStyle: "bold", fontSize: 7 },
        styles: { fontSize: 6, cellPadding: 1.5, overflow: "linebreak", valign: "top" },
        columnStyles: {
          0: { cellWidth: 14, halign: "center" },
          1: { cellWidth: 22 },
          2: { cellWidth: 62 },
          3: { cellWidth: 16, halign: "center" },
          4: { cellWidth: 14, halign: "center" },
          5: { cellWidth: 14, halign: "center" },
          6: { cellWidth: 28, halign: "center" },
        },
      });
      y = tableFinalY(doc, y) + 6;

      doc.addPage();
      pageWidth = doc.internal.pageSize.getWidth();
      pageHeight = doc.internal.pageSize.getHeight();
      renderAcertosHabilidadeParecerPage(
        doc,
        disc,
        tituloAval,
        habilidadesIa[disc],
        pageWidth,
        pageHeight
      );
    }
  }

  addFooters(doc, dataGeracao);

  const safeName = String(data.avaliacao?.titulo ?? "avaliacao")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();
  doc.save(`analise_das_avaliacoes_${safeName}_${new Date().toISOString().split("T")[0]}.pdf`);
}
