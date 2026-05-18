import { jsPDF } from "jspdf";

type AtaOptions = {
  dateDay: string;
  dateMonth: string;
  dateYear: string;
  startHour: string;
  startMinute: string;
  endHour: string;
  endMinute: string;
  didNotOccurReason: string;
  occurrenceA: boolean;
  occurrenceB: boolean;
  occurrenceC: boolean;
  occurrenceD: boolean;
  occurrenceE: boolean;
  occurrenceDetail5: string;
  noOccurrences: boolean;
  occurrenceDetail6: string;
  q7Responded: string;
  q8NotResponded: string;
  q9Tablets: string;
  q10SpecialStayed: string;
  q11SpecialRegularRoom: string;
  q12SpecialSupportRoom: string;
  assinaturaAplicador: string;
  cpfAplicador: string;
  assinaturaApoioRegular: string;
  cpfApoioRegular: string;
  assinaturaApoioSuporte: string;
  cpfApoioSuporte: string;
};

export type AtaSalaPdfData = {
  nomeAvaliacao: string;
  cursoLabel: string;
  municipioUf: string;
  rede: string;
  escola: string;
  serieTurma: string;
  turno: string;
  disciplina: string;
  options: AtaOptions;
};

const C = {
  bg: [236, 236, 236] as [number, number, number],
  text: [28, 28, 28] as [number, number, number],
  pink: [223, 31, 166] as [number, number, number],
};

/** Borda / título do cabeçalho no estilo lista de frequência. */
const PINK_LISTA: [number, number, number] = [236, 72, 153];
const LINE_GRAY_HEADER: [number, number, number] = [120, 120, 120];

/** Mesmo modelo visual da lista de frequência (marcador em círculo). */
const MARK_PINK: [number, number, number] = [236, 72, 153];
const MARK_GRAY: [number, number, number] = [180, 180, 180];
const MARK_RADIUS_MM = 2;

const M = 14;
const PINK_LW = 0.2;

/** Espaço entre blocos rosa e margens internas de texto livre no PDF. */
const SECTION_V_GAP = 5.5;
const OPEN_PAD_X = 3.8;
const OPEN_PAD_BOTTOM = 2.8;
const OPEN_LINE_STEP = 5.6;
const Q712_ROW_H = 14;
const Q712_ROW_GAP = 2.2;

function drawText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  size = 8,
  style: "normal" | "bold" | "italic" = "normal",
  align: "left" | "center" | "right" = "left",
  baseline: "alphabetic" | "middle" | "top" | "bottom" = "alphabetic"
): void {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(...C.text);
  doc.text(text, x, y, { align, baseline });
}

function drawPinkRect(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  doc.setDrawColor(...C.pink);
  doc.setLineWidth(PINK_LW);
  doc.rect(x, y, w, h);
}

/** Dígito centralizado na caixa (eixo X/Y ao centro da célula). */
function drawCodeBoxes(doc: jsPDF, x: number, y: number, values: string[], boxW = 6, boxH = 7): void {
  values.forEach((v, i) => {
    const bx = x + i * boxW;
    drawPinkRect(doc, bx, y, boxW, boxH);
    const ch = (v || "").trim().slice(0, 1);
    if (!ch) return;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C.text);
    doc.text(ch, bx + boxW / 2, y + boxH / 2, { align: "center", baseline: "middle" });
  });
}

/** Marcação tipo lista de frequência: círculo preenchido (marcado) ou só contorno (vazio). */
function drawMarkCircle(doc: jsPDF, cx: number, cy: number, checked: boolean): void {
  const r = MARK_RADIUS_MM;
  if (checked) {
    doc.setFillColor(...MARK_PINK);
    doc.circle(cx, cy, r, "F");
    doc.setDrawColor(...MARK_PINK);
    doc.setLineWidth(0.15);
    doc.circle(cx, cy, r, "S");
  } else {
    doc.setDrawColor(...MARK_GRAY);
    doc.setLineWidth(0.15);
    doc.circle(cx, cy, r, "S");
  }
}

function splitToLines(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text || "", maxWidth) as string[];
}

function fitSingleLine(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  size = 8,
  style: "normal" | "bold" | "italic" = "normal"
): string {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (doc.getTextWidth(raw) <= maxWidth) return raw;
  const ellipsis = "...";
  let end = raw.length;
  while (end > 0) {
    const candidate = raw.slice(0, end).trimEnd() + ellipsis;
    if (doc.getTextWidth(candidate) <= maxWidth) return candidate;
    end -= 1;
  }
  return ellipsis;
}

function drawWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineH = 4.2,
  size = 8,
  style: "normal" | "bold" | "italic" = "normal"
): number {
  drawText(doc, "", 0, 0, size, style);
  const lines = splitToLines(doc, text, maxWidth);
  lines.forEach((line, i) => drawText(doc, line, x, y + i * lineH, size, style));
  return y + lines.length * lineH;
}

function drawHeaderRowValueOrUnderline(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  value: string,
  endX: number,
  isEmpty: boolean
): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C.text);
  doc.text(label, x, y, { align: "left", baseline: "alphabetic" });
  const after = x + doc.getTextWidth(label) + 2.2;
  if (isEmpty) {
    doc.setDrawColor(...LINE_GRAY_HEADER);
    doc.setLineWidth(0.2);
    doc.line(after, y + 1.2, endX, y + 1.2);
  } else {
    const line = fitSingleLine(doc, value.trim(), endX - after - 0.5, 9);
    doc.text(line, after, y, { align: "left", baseline: "alphabetic" });
  }
}

/** Retorna baseline Y após o bloco ESCOLA (uma linha vazia ou várias linhas de texto). */
function drawHeaderEscolaBlock(doc: jsPDF, x: number, y: number, escolaRaw: string, endX: number): number {
  const label = "ESCOLA: ";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C.text);
  const t = (escolaRaw || "").trim();
  const empty = !t || t === "ESCOLA MUNICIPAL";
  const xVal = x + doc.getTextWidth(label) + 1;
  doc.text(label, x, y, { align: "left", baseline: "alphabetic" });
  if (empty) {
    doc.setDrawColor(...LINE_GRAY_HEADER);
    doc.setLineWidth(0.2);
    doc.line(xVal, y + 1.2, endX, y + 1.2);
    return y + 5;
  }
  const lines = splitToLines(doc, t, endX - xVal) as string[];
  let cy = y;
  lines.forEach((ln) => {
    doc.text(ln, xVal, cy, { align: "left", baseline: "alphabetic" });
    cy += 5;
  });
  return cy;
}

/** Altura interna da caixa (conteúdo + margens), espelhando o layout desenhado. */
function measureAtaHeaderBoxInnerHeight(
  doc: jsPDF,
  escolaEmpty: boolean,
  escolaT: string,
  tx0: number,
  lineEnd: number,
  rowGap: number
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const escolaLw = doc.getTextWidth("ESCOLA: ") + 1;
  const nl = escolaEmpty ? 1 : Math.max(1, (splitToLines(doc, escolaT, lineEnd - tx0 - escolaLw) as string[]).length);
  const escolaH = escolaEmpty ? rowGap : nl * 5 + 0.5;
  return 6 + rowGap + rowGap + escolaH + 1 + rowGap + rowGap + 5;
}

function drawHeader(doc: jsPDF, data: AtaSalaPdfData): number {
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - 2 * M;
  const tx0 = M + 4;
  const lineEnd = M + contentW - 4;
  const innerW = contentW - 8;
  const rowGap = 5.2;
  let y = M;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...PINK_LISTA);
  const title = fitSingleLine(doc, (data.nomeAvaliacao || "").trim() || "NOME DA AVALIAÇÃO", innerW, 12, "bold");
  doc.text(title, pageW / 2, y, { align: "center", baseline: "alphabetic" });
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...C.text);
  const sub = `ATA DE SALA - ${(data.cursoLabel || "").trim() || "CURSO (ANOS INICIAIS OU FINAIS)"}`;
  doc.text(fitSingleLine(doc, sub, innerW, 10), pageW / 2, y, { align: "center", baseline: "alphabetic" });
  y += 8;

  const municipio = (data.municipioUf || "").trim();
  const rede = (data.rede || "").trim();
  const escola = (data.escola || "").trim();
  const serieTurma = (data.serieTurma || "").trim();
  const turno = (data.turno || "").trim();
  const disciplina = (data.disciplina || "").trim();

  const mEmpty = !municipio || municipio === "—";
  const rEmpty = !rede;
  const sEmpty = !serieTurma || serieTurma === "—";
  const tEmpty = !turno;
  const dEmpty = !disciplina;

  const escolaT = (escola || "").trim();
  const escolaEmpty = !escolaT || escolaT === "ESCOLA MUNICIPAL";

  const boxTop = y;
  const mid = tx0 + innerW * 0.48;
  const boxH = measureAtaHeaderBoxInnerHeight(doc, escolaEmpty, escolaT, tx0, lineEnd, rowGap);

  doc.setDrawColor(...PINK_LISTA);
  doc.setLineWidth(0.35);
  doc.rect(M, boxTop, contentW, boxH, "S");

  let cy = boxTop + 6;
  drawHeaderRowValueOrUnderline(doc, tx0, cy, "MUNICÍPIO/UF: ", municipio, lineEnd, mEmpty);
  cy += rowGap;
  drawHeaderRowValueOrUnderline(doc, tx0, cy, "REDE: ", rede, lineEnd, rEmpty);
  cy += rowGap;
  cy = drawHeaderEscolaBlock(doc, tx0, cy, escola, lineEnd) + 1;
  drawHeaderRowValueOrUnderline(doc, tx0, cy, "SÉRIE/TURMA: ", serieTurma, lineEnd, sEmpty);
  cy += rowGap;

  doc.setFontSize(9);
  doc.setTextColor(...C.text);
  doc.text("TURNO: ", tx0, cy, { align: "left", baseline: "alphabetic" });
  let lx = tx0 + doc.getTextWidth("TURNO: ") + 1;
  if (tEmpty) {
    doc.setDrawColor(...LINE_GRAY_HEADER);
    doc.setLineWidth(0.2);
    doc.line(lx, cy + 1.2, mid - 2, cy + 1.2);
  } else {
    doc.text(fitSingleLine(doc, turno, mid - lx - 2, 9), lx, cy, { align: "left", baseline: "alphabetic" });
  }
  doc.text("DISCIPLINA: ", mid, cy, { align: "left", baseline: "alphabetic" });
  lx = mid + doc.getTextWidth("DISCIPLINA: ") + 1;
  if (dEmpty) {
    doc.setDrawColor(...LINE_GRAY_HEADER);
    doc.line(lx, cy + 1.2, lineEnd, cy + 1.2);
  } else {
    doc.text(fitSingleLine(doc, disciplina, lineEnd - lx - 0.5, 9), lx, cy, { align: "left", baseline: "alphabetic" });
  }

  return boxTop + boxH + 4;
}

/**
 * Opções do item 5: círculo como na lista de frequência + rótulo na mesma linha (A) texto…).
 * Retorna baseline Y útil para linha “Detalhes” ou próximo conteúdo (abaixo da grade).
 */
function drawOccurrenceOptions(doc: jsPDF, x: number, y: number, contentInnerW: number, opts: AtaOptions): number {
  const rows = [
    { key: "occurrenceA" as const, code: "A", label: "Turma indisciplinada, inquieta." },
    { key: "occurrenceB" as const, code: "B", label: "Barulho externo." },
    { key: "occurrenceC" as const, code: "C", label: "Estudantes desmotivados." },
    { key: "occurrenceD" as const, code: "D", label: "Recusa à realização do(s) teste(s)." },
    { key: "occurrenceE" as const, code: "E", label: "Outro." },
  ];

  const pad = 3.5;
  const colGap = 7;
  const usableW = Math.max(40, contentInnerW - 2 * pad);
  const colW = (usableW - 2 * colGap) / 3;
  const rowH = 8.8;
  const circleInset = MARK_RADIUS_MM + 2;
  const textXOffset = circleInset + MARK_RADIUS_MM + 2.2;
  const labelFs = 7.5;

  const drawOne = (col: number, row: number, code: string, label: string, checked: boolean) => {
    const colX = x + pad + col * (colW + colGap);
    const rowY = y + row * rowH;
    const cx = colX + circleInset;
    const cy = rowY + rowH / 2;
    drawMarkCircle(doc, cx, cy, checked);
    const labelText = fitSingleLine(doc, `${code}) ${label}`, colW - textXOffset - 1.5, labelFs);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(labelFs);
    doc.setTextColor(...C.text);
    doc.text(labelText, colX + textXOffset, cy, { align: "left", baseline: "middle" });
  };

  // Colunas 0,1,2 — linhas 0 e 1; E ocupa coluna 2 linha 0 (como formulário em 3 colunas)
  drawOne(0, 0, rows[0].code, rows[0].label, opts.occurrenceA);
  drawOne(1, 0, rows[2].code, rows[2].label, opts.occurrenceC);
  drawOne(2, 0, rows[4].code, rows[4].label, opts.occurrenceE);
  drawOne(0, 1, rows[1].code, rows[1].label, opts.occurrenceB);
  drawOne(1, 1, rows[3].code, rows[3].label, opts.occurrenceD);

  return y + rowH * 2 + 3.5;
}

/**
 * Texto multilinha em área retangular **sem** linhas timbradas (espaço único para escrita).
 * `bodyStartY` é o baseline da primeira linha do conteúdo.
 */
function fillTextInOpenBox(
  doc: jsPDF,
  text: string,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  padX: number,
  bodyStartY: number,
  lineStep = OPEN_LINE_STEP,
  fontSize = 7.2,
  padBottom = OPEN_PAD_BOTTOM
): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...C.text);
  const innerW = Math.max(8, boxW - 2 * padX);
  const lines = splitToLines(doc, text || "", innerW) as string[];
  let baseline = bodyStartY;
  const maxBaseline = boxY + boxH - padBottom;
  for (const line of lines) {
    if (baseline > maxBaseline) break;
    doc.text(line, boxX + padX, baseline, { align: "left", baseline: "alphabetic" });
    baseline += lineStep;
  }
}

function drawPage1(doc: jsPDF, data: AtaSalaPdfData): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - 2 * M;
  const rightX = M + contentW;
  doc.setFillColor(...C.bg);
  doc.rect(0, 0, pageW, pageH, "F");

  let y = drawHeader(doc, data);
  y = drawWrappedText(
    doc,
    "Prezado(a) Aplicador(a), registre nesta ata as ocorrências referentes à aplicação e preencha obrigatoriamente todos os campos com as informações solicitadas.",
    M,
    y,
    pageW - 2 * M,
    4.6,
    8,
    "italic"
  );
  y += SECTION_V_GAP;

  drawPinkRect(doc, M, y, contentW, 18);
  drawText(doc, "1. Data do 1º dia de aplicação.", M + 2, y + 6, 7.4);
  const dateBoxW = 4.6;
  const dateFieldW = dateBoxW * 8 + 2 * 3.6;
  const dateX = rightX - dateFieldW - 2;
  drawCodeBoxes(doc, dateX, y + 3, [data.options.dateDay[0] || "", data.options.dateDay[1] || ""], dateBoxW, 7);
  drawText(doc, "/", dateX + dateBoxW * 2 + 1.2, y + 6.5, 9, "bold", "center", "middle");
  drawCodeBoxes(doc, dateX + dateBoxW * 2 + 3.2, y + 3, [data.options.dateMonth[0] || "", data.options.dateMonth[1] || ""], dateBoxW, 7);
  drawText(doc, "/", dateX + dateBoxW * 4 + 4.4, y + 6.5, 9, "bold", "center", "middle");
  drawCodeBoxes(doc, dateX + dateBoxW * 4 + 6.4, y + 3, [
    data.options.dateYear[0] || "",
    data.options.dateYear[1] || "",
    data.options.dateYear[2] || "",
    data.options.dateYear[3] || "",
  ], dateBoxW, 7);
  y += 18;

  drawPinkRect(doc, M, y, contentW, 14);
  const timeBoxW = 4.6;
  const hmFieldW = timeBoxW * 4 + 2.2;
  const q3FieldX = rightX - hmFieldW - 2;
  const q3TextX = q3FieldX - 56;
  const q2FieldX = q3TextX - hmFieldW - 16;

  drawText(doc, "2. Início do 1º dia de aplicação.", M + 2, y + 6, 7.0);
  drawCodeBoxes(doc, q2FieldX, y + 3, [data.options.startHour[0] || "", data.options.startHour[1] || ""], timeBoxW, 7);
  drawText(doc, ":", q2FieldX + timeBoxW * 2 + 0.9, y + 6.5, 9, "bold", "center", "middle");
  drawCodeBoxes(doc, q2FieldX + timeBoxW * 2 + 2.1, y + 3, [data.options.startMinute[0] || "", data.options.startMinute[1] || ""], timeBoxW, 7);

  drawText(doc, "3. Término do 1º dia de aplicação.", q3TextX, y + 6, 7.0);
  drawCodeBoxes(doc, q3FieldX, y + 3, [data.options.endHour[0] || "", data.options.endHour[1] || ""], timeBoxW, 7);
  drawText(doc, ":", q3FieldX + timeBoxW * 2 + 0.9, y + 6.5, 9, "bold", "center", "middle");
  drawCodeBoxes(doc, q3FieldX + timeBoxW * 2 + 2.1, y + 3, [data.options.endMinute[0] || "", data.options.endMinute[1] || ""], timeBoxW, 7);
  y += 14;

  const Q4_BOX_H = 50;
  drawPinkRect(doc, M, y, contentW, Q4_BOX_H);
  drawText(doc, "4. Caso a aplicação do(s) teste(s) NÃO tenha ocorrido, informe o motivo no campo abaixo.", M + 2, y + 5.5, 7.2);
  fillTextInOpenBox(doc, data.options.didNotOccurReason, M, y, contentW, Q4_BOX_H, OPEN_PAD_X, y + 12.5);
  y += Q4_BOX_H + SECTION_V_GAP;

  const Q5_H = 44;
  const q5Top = y;
  drawPinkRect(doc, M, q5Top, contentW, Q5_H);
  drawText(
    doc,
    "5. Indique as ocorrências que incomodaram, mas não impediram a aplicação do(s) teste(s). Detalhe as ocorrências no campo 4.",
    M + 2,
    q5Top + 5.5,
    7.2
  );
  const afterOccurrence = drawOccurrenceOptions(doc, M, q5Top + 11, contentW, data.options);
  if (data.options.occurrenceDetail5?.trim()) {
    const det = fitSingleLine(doc, `Detalhes: ${data.options.occurrenceDetail5.trim()}`, contentW - OPEN_PAD_X * 2, 7.1);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.1);
    doc.setTextColor(...C.text);
    doc.text(det, M + OPEN_PAD_X, afterOccurrence + 1.5, { align: "left", baseline: "alphabetic" });
  }
  y += Q5_H + SECTION_V_GAP;

  const Q6_BOX_H = 56;
  drawPinkRect(doc, M, y, contentW, Q6_BOX_H);
  drawText(
    doc,
    "6. Registre neste campo, de forma clara e objetiva, todas as ocorrências que interferiram, mas não impediram a realização da aplicação.",
    M + 2,
    y + 5.5,
    7.2
  );
  const checkCx = M + 2 + MARK_RADIUS_MM + 0.8;
  const checkCy = y + 12.5;
  drawMarkCircle(doc, checkCx, checkCy, data.options.noOccurrences);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(...C.text);
  doc.text("Não houve ocorrências.", M + 9, checkCy, { align: "left", baseline: "middle" });
  fillTextInOpenBox(doc, data.options.occurrenceDetail6, M, y, contentW, Q6_BOX_H, OPEN_PAD_X, y + 19.5);
}

/** Itens 7–12: duas caixas no modelo oficial (valores 0–99). */
const Q712_MAX_BOXES = 2;
const Q712_BOX_W = 6;

function drawValueLineItem(doc: jsPDF, number: string, text: string, y: number, value: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - 2 * M;
  drawPinkRect(doc, M, y, contentW, Q712_ROW_H);
  const digits = String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, Q712_MAX_BOXES);
  const padded = digits.padStart(Q712_MAX_BOXES, " ");
  const boxes = padded.split("").map((ch) => (ch === " " ? "" : ch));
  const boxesTotalW = Q712_MAX_BOXES * Q712_BOX_W;
  const labelMaxW = Math.max(40, contentW - boxesTotalW - 8);
  const labelText = fitSingleLine(doc, `${number}. ${text}`, labelMaxW, 7.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(...C.text);
  doc.text(labelText, M + 2.5, y + Q712_ROW_H / 2, { align: "left", baseline: "middle" });
  const boxY = y + (Q712_ROW_H - 7) / 2;
  drawCodeBoxes(doc, M + contentW - 2.5 - boxesTotalW, boxY, boxes, Q712_BOX_W, 7);
  return y + Q712_ROW_H + Q712_ROW_GAP;
}

/** CPF visual xxx.yyy.zzz-aa: caixas só nos 11 dígitos; `.` e `-` entre grupos. */
function drawCpfMaskedBoxes(
  doc: jsPDF,
  x: number,
  y: number,
  cpfRaw: string,
  digitBoxW: number,
  digitBoxH: number
): void {
  const digits = cpfRaw.replace(/\D/g, "").slice(0, 11).padEnd(11, " ");
  const cy = y + digitBoxH / 2;
  let curX = x;

  const drawDigit = (idx: number) => {
    const ch = digits[idx];
    drawPinkRect(doc, curX, y, digitBoxW, digitBoxH);
    if (ch && ch !== " ") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...C.text);
      doc.text(ch, curX + digitBoxW / 2, cy, { align: "center", baseline: "middle" });
    }
    curX += digitBoxW;
  };

  const drawSep = (sep: string, sepW: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C.text);
    doc.text(sep, curX + sepW / 2, cy, { align: "center", baseline: "middle" });
    curX += sepW;
  };

  drawDigit(0);
  drawDigit(1);
  drawDigit(2);
  drawSep(".", 1.6);
  drawDigit(3);
  drawDigit(4);
  drawDigit(5);
  drawSep(".", 1.6);
  drawDigit(6);
  drawDigit(7);
  drawDigit(8);
  drawSep("-", 2);
  drawDigit(9);
  drawDigit(10);
}

function drawSignatureBlock(
  doc: jsPDF,
  y: number,
  leftLabel: string,
  leftValue: string,
  rightLabel: string,
  rightValue: string
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - 2 * M;
  const gap = 10;
  const leftW = 76;
  const rightW = contentW - leftW - gap;
  const rightX = M + leftW + gap;
  const boxH = 13;
  const innerPad = 2.4;
  const digitBoxH = 6.8;
  const sepTotal = 1.6 + 1.6 + 2;
  const avail = Math.max(0, rightW - 2 * innerPad - sepTotal);
  const digitBoxW = Math.max(4.4, avail / 11);

  drawText(doc, leftLabel, M, y, 7.8);
  drawText(doc, rightLabel, rightX, y, 7.8);

  drawPinkRect(doc, M, y + 2, leftW, boxH);
  const sigLineY = y + 2 + boxH - 2;
  doc.setDrawColor(...C.pink);
  doc.setLineWidth(PINK_LW);
  doc.line(M + 2, sigLineY, M + leftW - 2, sigLineY);

  const name = (leftValue || "").replace(/\s+/g, " ").trim();
  if (name) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor(...C.text);
    const line = fitSingleLine(doc, name, leftW - 4, 7.4);
    doc.text(line, M + 2, sigLineY - 0.6, { align: "left", baseline: "bottom" });
  }

  drawPinkRect(doc, rightX, y + 2, rightW, boxH);
  const cpfY = y + 2 + (boxH - digitBoxH) / 2;
  drawCpfMaskedBoxes(doc, rightX + innerPad, cpfY, rightValue, digitBoxW, digitBoxH);

  return y + 2 + boxH + 9;
}

function drawPage2(doc: jsPDF, data: AtaSalaPdfData): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  doc.addPage();
  doc.setFillColor(...C.bg);
  doc.rect(0, 0, pageW, pageH, "F");

  let y = M + 6;
  y = drawValueLineItem(doc, "7", "Quantidade de estudantes presentes que responderam ao teste.", y, data.options.q7Responded);
  y = drawValueLineItem(doc, "8", "Quantidade de estudantes presentes que NÃO responderam ao teste.", y, data.options.q8NotResponded);
  y = drawValueLineItem(doc, "9", "Quantidade de tabletes que foram utilizados nesta sala.", y, data.options.q9Tablets);
  y = drawValueLineItem(
    doc,
    "10",
    "Quantidade de estudantes com necessidades específicas que permaneceram na sala.",
    y,
    data.options.q10SpecialStayed
  );
  y = drawValueLineItem(
    doc,
    "11",
    "Quantidade de estudantes com necessidades específicas direcionados para sala extra com Prova Regular.",
    y,
    data.options.q11SpecialRegularRoom
  );
  y = drawValueLineItem(
    doc,
    "12",
    "Quantidade de estudantes com necessidades específicas direcionados para sala extra com Prova de Suporte.",
    y,
    data.options.q12SpecialSupportRoom
  );
  y += 6;

  y = drawSignatureBlock(
    doc,
    y,
    "ASSINATURA DO(A) APLICADOR(A)",
    data.options.assinaturaAplicador,
    "CPF DO(A) APLICADOR(A)",
    data.options.cpfAplicador
  );
  y += 5;

  y = drawSignatureBlock(
    doc,
    y,
    "ASSINATURA DO(A) APOIO PROVA REGULAR",
    data.options.assinaturaApoioRegular,
    "CPF DO(A) APOIO REGULAR",
    data.options.cpfApoioRegular
  );
  y += 5;

  drawSignatureBlock(
    doc,
    y,
    "ASSINATURA DO(A) APOIO PROVA SUPORTE",
    data.options.assinaturaApoioSuporte,
    "CPF DO(A) APOIO SUPORTE",
    data.options.cpfApoioSuporte
  );
}

export function createAtaSalaPdfDoc(data: AtaSalaPdfData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  drawPage1(doc, data);
  drawPage2(doc, data);
  return doc;
}

export function downloadAtaSalaPdf(data: AtaSalaPdfData, fileName = "ata-de-sala.pdf"): void {
  const doc = createAtaSalaPdfDoc(data);
  doc.save(fileName);
}

export function printAtaSalaPdf(data: AtaSalaPdfData): void {
  const doc = createAtaSalaPdfDoc(data);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) return;
  win.addEventListener("load", () => {
    win.focus();
    win.print();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
}

export function previewAtaSalaPdf(data: AtaSalaPdfData): void {
  const doc = createAtaSalaPdfDoc(data);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) return;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
