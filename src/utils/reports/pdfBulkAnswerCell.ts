import type { jsPDF } from "jspdf";

export type PdfAnswerMarkKind = "correct" | "incorrect" | "blank";

/** Cores alinhadas ao relatório institucional (fundo suave + ícone contrastante). */
export const PDF_ANSWER_CELL = {
  correctBg: [220, 252, 231] as const,
  incorrectBg: [254, 226, 226] as const,
  blankBg: [249, 250, 251] as const,
  correctFg: [21, 128, 61] as const,
  incorrectFg: [220, 38, 38] as const,
  blankFg: [156, 163, 175] as const,
  border: [229, 231, 235] as const,
  skillHeaderBg: [219, 234, 254] as const,
  questionHeaderBg: [243, 244, 246] as const,
};

const ICON_CELL_PAD_MM = 0.55;

export function parsePdfAnswerMarkCell(val: unknown): PdfAnswerMarkKind | null {
  const s = String(val ?? "").trim();
  if (s === "✓" || s === "\u2713") return "correct";
  if (s === "✗" || s === "\u2717") return "incorrect";
  if (s === "—" || s === "-") return "blank";
  return null;
}

export function formatPdfSkillCodeForHeader(code: string): string {
  const trimmed = (code || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) return trimmed;
  return `(${trimmed})`;
}

/** Meio-extensão (mm) do ícone ✓/✗ — ocupa ~84% da menor dimensão interna da célula. */
export function computePdfAnswerMarkIconHalfExtentMm(
  cellWidth: number,
  cellHeight: number
): number {
  const innerW = Math.max(0, cellWidth - ICON_CELL_PAD_MM);
  const innerH = Math.max(0, cellHeight - ICON_CELL_PAD_MM);
  if (innerW <= 0.25 || innerH <= 0.25) return 0.95;
  const maxHalf = Math.min(innerW, innerH) * 0.46;
  return Math.max(0.95, Math.min(1.55, maxHalf));
}

function drawVectorCheck(
  d: jsPDF,
  cx: number,
  cy: number,
  half: number,
  fg: readonly [number, number, number]
): void {
  d.setDrawColor(fg[0], fg[1], fg[2]);
  d.setLineWidth(Math.max(0.38, Math.min(0.72, half * 0.28)));
  d.line(cx - half * 0.92, cy + half * 0.05, cx - half * 0.18, cy + half * 0.82);
  d.line(cx - half * 0.18, cy + half * 0.82, cx + half * 0.95, cy - half * 0.72);
}

function drawVectorCross(
  d: jsPDF,
  cx: number,
  cy: number,
  half: number,
  fg: readonly [number, number, number]
): void {
  d.setDrawColor(fg[0], fg[1], fg[2]);
  d.setLineWidth(Math.max(0.38, Math.min(0.72, half * 0.28)));
  const s = half * 0.82;
  d.line(cx - s, cy - s, cx + s, cy + s);
  d.line(cx + s, cy - s, cx - s, cy + s);
}

function drawVectorBlank(
  d: jsPDF,
  cx: number,
  cy: number,
  half: number,
  fg: readonly [number, number, number]
): void {
  d.setDrawColor(fg[0], fg[1], fg[2]);
  d.setLineWidth(Math.max(0.28, Math.min(0.5, half * 0.2)));
  const w = half * 0.75;
  d.line(cx - w, cy, cx + w, cy);
}

/** Desenha célula de acerto/erro/em branco com fundo colorido e ícones vetoriais (Helvetica-safe). */
export function drawPdfAnswerMarkCell(
  d: jsPDF,
  cell: { x: number; y: number; width: number; height: number },
  kind: PdfAnswerMarkKind,
  iconHalfExtentMm?: number
): void {
  const bg =
    kind === "correct"
      ? PDF_ANSWER_CELL.correctBg
      : kind === "incorrect"
        ? PDF_ANSWER_CELL.incorrectBg
        : PDF_ANSWER_CELL.blankBg;
  const fg =
    kind === "correct"
      ? PDF_ANSWER_CELL.correctFg
      : kind === "incorrect"
        ? PDF_ANSWER_CELL.incorrectFg
        : PDF_ANSWER_CELL.blankFg;

  d.setFillColor(bg[0], bg[1], bg[2]);
  d.rect(cell.x, cell.y, cell.width, cell.height, "F");

  const half =
    iconHalfExtentMm ??
    computePdfAnswerMarkIconHalfExtentMm(cell.width, cell.height);
  const cx = cell.x + cell.width / 2;
  const cy = cell.y + cell.height / 2;

  if (kind === "correct") {
    drawVectorCheck(d, cx, cy, half, fg);
  } else if (kind === "incorrect") {
    drawVectorCross(d, cx, cy, half, fg);
  } else {
    drawVectorBlank(d, cx, cy, half, fg);
  }

  d.setDrawColor(PDF_ANSWER_CELL.border[0], PDF_ANSWER_CELL.border[1], PDF_ANSWER_CELL.border[2]);
  d.setLineWidth(0.2);
  d.rect(cell.x, cell.y, cell.width, cell.height);
}

export function pdfTextColorForBg(r: number, g: number, b: number): [number, number, number] {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 165 ? [31, 41, 55] : [255, 255, 255];
}

/** Fonte compacta para coluna Nível nas tabelas bulk — proporcional à célula, legível sem estourar. */
export function computePdfProficiencyCompactTypography(
  cell: { width: number; height: number },
  label: string
): { fs: number; pad: number } {
  const pad = 0.5;
  const maxByHeight = (cell.height / 0.3528) * 0.34;
  const chars = Math.max(1, label.length);
  const maxByWidthSingle = ((cell.width - pad * 2) / 0.3528) / (chars * 0.52);
  let fs = Math.max(6.5, Math.min(maxByHeight, maxByWidthSingle, 11));
  if (chars > 12) {
    fs = Math.max(5.8, Math.min(fs, (cell.height / 0.3528) * 0.26));
  }
  return { fs, pad };
}

/**
 * Posições Y (baseline, mm) para centralizar blocos de texto Helvetica bold em uma célula.
 * jsPDF usa a baseline como referência — não o topo do glifo.
 */
export function pdfVerticalCenterBaselinesMm(
  topY: number,
  heightMm: number,
  fontSizePt: number,
  lineCount: number
): number[] {
  if (lineCount <= 0) return [];
  const lineHeightMm = fontSizePt * 0.3528 * 1.12;
  const blockHeight = lineCount * lineHeightMm;
  const firstBaseline = topY + (heightMm - blockHeight) / 2 + fontSizePt * 0.3528 * 0.82;
  return Array.from({ length: lineCount }, (_, i) => firstBaseline + i * lineHeightMm);
}

function parsePdfQuestionHeaderParts(raw: string): { qMark: string; numero: string } {
  const parts = String(raw ?? "")
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return { qMark: "Q", numero: parts[1].replace(/^Q\s*/i, "") || parts[1] };
  }
  const single = parts[0] || "";
  const stripped = single.replace(/^Q\s*/i, "").trim();
  return { qMark: "Q", numero: stripped || single };
}

/** Cabeçalho da questão: "Q" em cima e número embaixo (colunas estreitas). */
export function drawPdfQuestionHeaderCell(
  d: jsPDF,
  cell: { x: number; y: number; width: number; height: number },
  rawLabel: string,
  baseFontSizePt: number
): void {
  d.setFillColor(
    PDF_ANSWER_CELL.questionHeaderBg[0],
    PDF_ANSWER_CELL.questionHeaderBg[1],
    PDF_ANSWER_CELL.questionHeaderBg[2]
  );
  d.rect(cell.x, cell.y, cell.width, cell.height, "F");

  const { qMark, numero } = parsePdfQuestionHeaderParts(rawLabel);
  const cx = cell.x + cell.width / 2;
  const maxFs = Math.max(5, (cell.height / 0.3528) * 0.38);
  const qFs = Math.max(4.8, Math.min(baseFontSizePt * 0.78, maxFs * 0.72));
  const numFs = Math.max(5.2, Math.min(baseFontSizePt, maxFs));

  d.setFont("helvetica", "bold");
  d.setTextColor(55, 65, 81);

  d.setFontSize(qFs);
  d.text(qMark, cx, cell.y + cell.height * 0.36, { align: "center" });

  d.setFontSize(numFs);
  d.text(numero, cx, cell.y + cell.height * 0.82, { align: "center" });

  d.setDrawColor(PDF_ANSWER_CELL.border[0], PDF_ANSWER_CELL.border[1], PDF_ANSWER_CELL.border[2]);
  d.setLineWidth(0.2);
  d.rect(cell.x, cell.y, cell.width, cell.height);
}

/** Ajustes de layout das tabelas bulk (nomes vs. habilidades). */
export const PDF_BULK_TABLE_LAYOUT = {
  namePadVMul: 0.95,
  nameRowExtraMm: 0.35,
  /** Altura base (mm) da linha de habilidade antes dos scales locais do PDF. */
  skillHeaderRowBaseMm: 11,
  pctHeaderRowBaseMm: 5.5,
  qHeaderRowBaseMm: 5.5,
  /** Teto de altura por linha de aluno quando preenchendo a página. */
  bodyRowFillMaxMm: 9,
  skillRowFillMaxMm: 24,
  /** Acima deste número de alunos, expande linhas para preencher a página landscape. */
  pageFillMinStudents: 16,
} as const;

export type PdfBulkTableVerticalLayoutInput = {
  pageHeightMm: number;
  startYMm: number;
  studentCount: number;
  questionCount: number;
  dynamicFontSize: number;
  bulkPadV: number;
  rowMinMm: number;
  /** Fonte dos nomes — mesma da tabela "Relatório de Desempenho Geral". */
  nameBodyFontPt: number;
  footerReserveMm?: number;
  /** Espaço reservado abaixo da tabela (legenda, etc.). */
  extraBottomReserveMm?: number;
  scaleDetailTableExtra: (v: number) => number;
  scalePdfTable: (v: number) => number;
};

export type PdfBulkTableVerticalLayout = {
  bodyRowHeightMm: number;
  skillRowHMm: number;
  pctRowHMm: number;
  qHeaderRowHMm: number;
  nameBodyFontPt: number;
  namePadVerticalMm: number;
  skillCodeFontSize: number;
  /** true quando o layout expandiu para ocupar a página (turma cabe inteira). */
  pageFilled: boolean;
};

/**
 * Calcula alturas de linha compactas (turmas grandes) ou expandidas (turmas que cabem
 * em uma página) para a tabela bulk preencher a altura útil da folha landscape.
 */
export function computePdfBulkTableVerticalLayout(
  input: PdfBulkTableVerticalLayoutInput
): PdfBulkTableVerticalLayout {
  const footer = input.footerReserveMm ?? 10;
  const extraBottom = input.extraBottomReserveMm ?? 0;
  const availableBottom = input.pageHeightMm - footer - extraBottom;
  const tableBudget = Math.max(0, availableBottom - input.startYMm);

  const compactQ = input.scaleDetailTableExtra(
    input.scalePdfTable(PDF_BULK_TABLE_LAYOUT.qHeaderRowBaseMm)
  );
  const compactSkill = input.scaleDetailTableExtra(
    input.scalePdfTable(PDF_BULK_TABLE_LAYOUT.skillHeaderRowBaseMm)
  );
  const compactPct = input.scaleDetailTableExtra(
    input.scalePdfTable(PDF_BULK_TABLE_LAYOUT.pctHeaderRowBaseMm)
  );

  const namePadV = computePdfStudentNamePadVerticalMm(input.bulkPadV);
  const nameFont = input.nameBodyFontPt;
  const compactBodyRow = computePdfStudentBodyRowHeightMm(
    nameFont,
    namePadV,
    input.rowMinMm
  );
  const baseSkillFont = computePdfSkillCodeFontSize(
    input.questionCount,
    input.dynamicFontSize,
    input.scalePdfTable
  );

  let bodyRowHeight = compactBodyRow;
  let skillRow = compactSkill;
  let pctRow = compactPct;
  let qRow = compactQ;
  let skillFont = baseSkillFont;
  let pageFilled = false;

  const n = input.studentCount;
  const minTableHeight = compactQ + compactSkill + compactPct + n * compactBodyRow;
  const allowPageFill =
    n >= PDF_BULK_TABLE_LAYOUT.pageFillMinStudents && minTableHeight <= tableBudget;

  if (n > 0 && allowPageFill) {
    pageFilled = true;
    const extra = tableBudget - minTableHeight;

    const qShare = 0.05;
    const skillShare = 0.32;
    const pctShare = 0.08;
    const bodyShare = 0.55;

    qRow = compactQ + extra * qShare;
    let skillExtra = extra * skillShare;
    let pctExtra = extra * pctShare;
    let bodyExtra = extra * bodyShare;

    bodyRowHeight = compactBodyRow + bodyExtra / n;
    const maxBody = input.scalePdfTable(PDF_BULK_TABLE_LAYOUT.bodyRowFillMaxMm);
    if (bodyRowHeight > maxBody) {
      const overflow = (bodyRowHeight - maxBody) * n;
      bodyRowHeight = maxBody;
      skillExtra += overflow * 0.78;
      pctExtra += overflow * 0.22;
    }

    skillRow = compactSkill + skillExtra;
    pctRow = compactPct + pctExtra;
    skillRow = Math.min(skillRow, input.scalePdfTable(PDF_BULK_TABLE_LAYOUT.skillRowFillMaxMm));

    const used =
      qRow + skillRow + pctRow + bodyRowHeight * n;
    if (used < tableBudget) {
      bodyRowHeight += (tableBudget - used) / n;
    }

    const skillScale = skillRow / compactSkill;
    skillFont = Math.min(
      (skillRow / 0.3528) * 0.82,
      baseSkillFont * Math.max(1, skillScale * 0.92)
    );
  }

  return {
    bodyRowHeightMm: bodyRowHeight,
    skillRowHMm: skillRow,
    pctRowHMm: pctRow,
    qHeaderRowHMm: qRow,
    nameBodyFontPt: nameFont,
    namePadVerticalMm: namePadV,
    skillCodeFontSize: skillFont,
    pageFilled,
  };
}

/** Base em pt antes dos scales — igual à tabela "Relatório de Desempenho Geral". */
export const PDF_SUMMARY_TABLE_FONT_BASE_PT = 16;

export function computePdfSummaryTableBodyFontPt(
  scalePdfTable: (v: number) => number,
  scaleCompactTable: (v: number) => number
): number {
  return scaleCompactTable(scalePdfTable(PDF_SUMMARY_TABLE_FONT_BASE_PT));
}

export function computePdfStudentNamePadVerticalMm(bulkPadV: number): number {
  return bulkPadV * PDF_BULK_TABLE_LAYOUT.namePadVMul;
}

export function computePdfStudentBodyRowHeightMm(
  fontSizePt: number,
  padVerticalMm: number,
  rowMinMm = 2.5
): number {
  const lineMm = fontSizePt * 0.3528 * 1.06;
  return Math.max(rowMinMm, lineMm + padVerticalMm * 2 + PDF_BULK_TABLE_LAYOUT.nameRowExtraMm);
}

/** Fonte dos códigos BNCC no cabeçalho — compacta para liberar espaço aos nomes. */
export function computePdfSkillCodeFontSize(
  questionsCount: number,
  dynamicFontSize: number,
  scale: (v: number) => number = (v) => v
): number {
  const q = Math.max(1, questionsCount);
  if (q <= 10) return Math.max(scale(5.0), dynamicFontSize * 1.25);
  if (q <= 15) return Math.max(scale(4.4), dynamicFontSize * 1.1);
  if (q <= 22) return Math.max(scale(3.8), dynamicFontSize * 0.95);
  const infoFactor = Math.min(1.45, 24 / q);
  return Math.max(
    scale(3.0),
    Math.min(scale(5.8), dynamicFontSize * (0.72 + infoFactor * 0.15))
  );
}
