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
  clampTextoLivreTamanho,
  ETIQUETA_APLICADORES_GRADE_MIN,
  ETIQUETA_FONTE,
  etiquetaAplicadores,
  type EtiquetaAplicador,
  etiquetaEscolaKey,
  etiquetaFonteAplicadores,
  etiquetasSerieTurmaTurnoLine,
  TEXTO_ACIMA_ASSINATURA_MAX,
} from "@/utils/etiquetasDisplay";
import { getCourseColor } from "@/utils/gradeToCourse";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const PAGE_MARGIN = 10;
const COLS = 2;
const ROWS = 4;
const GAP_X = 4;
const GAP_Y = 4;
const LABEL_WIDTH_DUPLA = PAGE_WIDTH - PAGE_MARGIN * 2;
const LABEL_WIDTH = (LABEL_WIDTH_DUPLA - GAP_X * (COLS - 1)) / COLS;
const LABEL_HEIGHT = (PAGE_HEIGHT - PAGE_MARGIN * 2 - GAP_Y * (ROWS - 1)) / ROWS;
const LOGO_WIDTH = 8;
const LOGO_MAX_HEIGHT = 11;
const LOGO_GAP = 1.5;
/** Abaixo do mínimo do editor: só usado para caber todas as linhas na área livre. */
const TEXTO_LIVRE_AUTO_FIT_MIN = 5;

/** Na largura normal as fontes encolhem até este fator antes de a etiqueta passar a ocupar a linha inteira. */
const ESCALA_MIN_NORMAL = 0.85;
const ESCALA_MIN = 0.6;
const ESCALA_PASSO = 0.05;

const PAD = 3;
const PT_TO_MM = 25.4 / 72;
/** Menor fração da fonte para o texto acima da assinatura caber em uma linha. */
const RODAPE_FONT_MIN_RATIO = 0.6;

const APLICADOR_SEPARATOR_GAP = 1;
const APLICADOR_BOX_PAD_X = 1.5;
const APLICADOR_BOX_PAD_Y = 0.6;
const APLICADOR_UNDERLINE_OFFSET = 0.6;
const APLICADOR_GRID_GAP = 1.5;
/** Colunas mais estreitas que isto usam "NOME:" em vez de "NOME DO APLICADOR:". */
const APLICADOR_COMPACTO_MAX_WIDTH = 60;

const MODALIDADE_PILL_PAD_X = 1.4;
const MODALIDADE_PILL_RADIUS = 0.9;

export type EtiquetaPdfEntry = {
  context: EtiquetasDadosResponse;
  label: EtiquetaEditItem;
  /** Etiquetas de grupos (escolas) distintos começam em nova página. */
  grupo?: string;
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

/** Um parágrafo por quebra de linha; marcadores abertos continuam valendo nas linhas seguintes. */
function textToParagraphTokens(text: string): RichToken[][] {
  const paragraphs: RichToken[][] = [[]];

  parseRichMarkers(text).forEach((segment) => {
    segment.text.split("\n").forEach((part, partIndex) => {
      if (partIndex > 0) paragraphs.push([]);
      const current = paragraphs[paragraphs.length - 1];
      part
        .split(/(\s+)/)
        .filter(Boolean)
        .forEach((chunk) =>
          current.push({
            text: /^\s+$/.test(chunk) ? " " : chunk,
            bold: Boolean(segment.bold),
            italic: Boolean(segment.italic),
            underline: Boolean(segment.underline),
          })
        );
    });
  });

  return paragraphs.map((tokens) => {
    const isBlank = (token: RichToken) => !token.text.trim();
    let start = 0;
    let end = tokens.length;
    while (start < end && isBlank(tokens[start])) start += 1;
    while (end > start && isBlank(tokens[end - 1])) end -= 1;
    return tokens.slice(start, end);
  });
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
  const lines: RichLine[] = [];
  textToParagraphTokens(preserveParagraphs(text).trim()).forEach((tokens) => {
    if (!tokens.length) {
      lines.push([]);
      return;
    }
    lines.push(...packTokensIntoLines(doc, tokens, maxWidth, fontSize));
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

  let size = fontSize;
  let lineHeight = lineHeightFor(size);
  let lines = buildRichLines(doc, content, areaW, size);

  while (size > TEXTO_LIVRE_AUTO_FIT_MIN && lines.length * lineHeight > areaH) {
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

/** Altura de uma linha de texto fixo (fonte em pt → mm, com entrelinha). */
function textLineHeight(fontSize: number): number {
  return fontSize * PT_TO_MM * 1.18;
}

function setFont(doc: jsPDF, fontSize: number, style: "normal" | "bold") {
  doc.setFont("helvetica", style);
  doc.setFontSize(fontSize);
}

function fitSingleLine(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && doc.getTextWidth(`${text.slice(0, end).trimEnd()}…`) > maxWidth) end -= 1;
  return `${text.slice(0, end).trimEnd()}…`;
}

/**
 * Desenha (ou só mede, com `draw = false`) linhas quebradas a partir de `top`.
 * Retorna o topo livre logo abaixo da última linha.
 */
function drawTextLines(
  doc: jsPDF,
  text: string,
  anchorX: number,
  top: number,
  maxWidth: number,
  fontSize: number,
  opts: { style: "normal" | "bold"; align: "left" | "center"; maxLines: number; draw: boolean }
): number {
  const content = normalizeSpaces(text);
  if (!content) return top;

  setFont(doc, fontSize, opts.style);
  const lh = textLineHeight(fontSize);
  const lines = (doc.splitTextToSize(content, maxWidth) as string[]).slice(0, opts.maxLines);
  if (opts.draw) {
    doc.setTextColor(0, 0, 0);
    lines.forEach((line, index) => {
      doc.text(line, anchorX, top + lh * index + lh / 2, { align: opts.align, baseline: "middle" });
    });
  }
  return top + lines.length * lh;
}

/** "Modalidade/Etapa:" seguido do curso em um selo com a cor associada ao curso. */
function drawModalidade(
  doc: jsPDF,
  nivel: string,
  centerX: number,
  top: number,
  innerW: number,
  fontSize: number,
  draw: boolean
): number {
  const label = "Modalidade/Etapa: ";
  const value = normalizeSpaces(nivel).toUpperCase();
  const lh = textLineHeight(fontSize);

  setFont(doc, fontSize, "normal");
  const labelW = doc.getTextWidth(label);

  if (!value) {
    if (draw) {
      doc.setTextColor(0, 0, 0);
      doc.text(`${label}—`, centerX, top + lh / 2, { align: "center", baseline: "middle" });
    }
    return top + lh;
  }

  setFont(doc, fontSize, "bold");
  const pillH = lh;
  const singleRow = labelW + doc.getTextWidth(value) + MODALIDADE_PILL_PAD_X * 2 <= innerW;
  const pillText = fitSingleLine(doc, value, innerW - MODALIDADE_PILL_PAD_X * 2);
  const pillW = doc.getTextWidth(pillText) + MODALIDADE_PILL_PAD_X * 2;
  const totalH = singleRow ? pillH : lh + pillH;
  if (!draw) return top + totalH + 0.4;

  const pillTop = singleRow ? top : top + lh;
  const rowStartX = singleRow ? centerX - (labelW + pillW) / 2 : centerX - labelW / 2;
  const pillX = singleRow ? rowStartX + labelW : centerX - pillW / 2;

  setFont(doc, fontSize, "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(label, rowStartX, top + lh / 2, { baseline: "middle" });

  doc.setFillColor(...hexToRgb(getCourseColor(nivel)));
  doc.roundedRect(pillX, pillTop, pillW, pillH, MODALIDADE_PILL_RADIUS, MODALIDADE_PILL_RADIUS, "F");
  setFont(doc, fontSize, "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(pillText, pillX + MODALIDADE_PILL_PAD_X, pillTop + pillH / 2, { baseline: "middle" });
  doc.setTextColor(0, 0, 0);

  return top + totalH + 0.4;
}

export type LogoDims = Pick<PdfImageAsset, "iw" | "ih">;

export function logoHeightFor(logo: LogoDims): number {
  return Math.min(LOGO_MAX_HEIGHT, Math.max(4, (logo.ih * LOGO_WIDTH) / logo.iw));
}

/**
 * Cabeçalho (logo, título, município, escola, modalidade, série/turma/turno e divisória).
 * As linhas centralizadas que ficam na altura do logo são estreitadas dos dois lados para não encostar nele.
 */
function layoutHeader(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  context: EtiquetasDadosResponse,
  item: EtiquetaEditItem,
  logo: (LogoDims & { dataUrl?: string }) | null,
  fontSize: number,
  draw: boolean
): number {
  const innerX = x + PAD;
  const innerW = width - PAD * 2;
  const centerX = x + width / 2;
  let top = y + PAD;
  let logoBottom = top;

  if (logo) {
    const logoH = logoHeightFor(logo);
    if (draw && logo.dataUrl) {
      doc.addImage(logo.dataUrl, "PNG", x + width - LOGO_WIDTH - PAD, top, LOGO_WIDTH, logoH);
    }
    logoBottom = top + logoH;
  }
  const widthAt = (lineTop: number) =>
    logo && lineTop < logoBottom ? innerW - 2 * (LOGO_WIDTH + LOGO_GAP) : innerW;

  top = drawTextLines(doc, item.titulo.toUpperCase(), innerX, top, innerW - LOGO_WIDTH - LOGO_GAP, fontSize, {
    style: "bold",
    align: "left",
    maxLines: 2,
    draw,
  });

  const destaque = { style: "bold" as const, align: "center" as const, draw };
  top = drawTextLines(doc, cityStateDisplay(context).toUpperCase(), centerX, top, widthAt(top), fontSize, {
    ...destaque,
    maxLines: 1,
  });
  top = drawTextLines(doc, context.contexto.escola.toUpperCase(), centerX, top, widthAt(top), fontSize, {
    ...destaque,
    maxLines: 2,
  });
  top = Math.max(top + 0.4, logoBottom);

  top = drawModalidade(doc, context.contexto.nivel, centerX, top, innerW, fontSize, draw);

  const serieTurmaTurnoText = normalizeSpaces(etiquetasSerieTurmaTurnoLine(context)).toUpperCase();
  top = drawTextLines(doc, `Série | Turma | Turno: ${serieTurmaTurnoText}`, centerX, top, innerW, fontSize, {
    style: "normal",
    align: "center",
    maxLines: 2,
    draw,
  });

  top += 0.6;
  if (draw) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(innerX, top, x + width - PAD, top);
  }
  return top;
}

function cityStateDisplay(context: EtiquetasDadosResponse): string {
  const city = normalizeSpaces(context.municipio.name);
  const state = normalizeSpaces(context.municipio.state);
  return state ? `${city}/${state}` : city;
}

/** Colunas do rodapé: 1 por linha; grade de 2 a partir de 3 aplicadores; na etiqueta dupla, até 4 lado a lado. */
function aplicadorColunas(quantidade: number, dupla: boolean): number {
  if (dupla) return Math.max(1, Math.min(quantidade, 4));
  return quantidade >= ETIQUETA_APLICADORES_GRADE_MIN ? 2 : 1;
}

function aplicadorRows(aplicadores: EtiquetaAplicador[], colunas: number): EtiquetaAplicador[][] {
  const rows: EtiquetaAplicador[][] = [];
  for (let i = 0; i < aplicadores.length; i += colunas) rows.push(aplicadores.slice(i, i + colunas));
  return rows;
}

function rowHasRodape(row: EtiquetaAplicador[]): boolean {
  return row.some((aplicador) => normalizeSpaces(aplicador.textoAcima).length > 0);
}

function aplicadorBoxHeight(hasRodapeLine: boolean, fontSize: number): number {
  const rows = (hasRodapeLine ? 1 : 0) + 2;
  return rows * textLineHeight(fontSize) + APLICADOR_BOX_PAD_Y * 2;
}

function footerHeightFor(aplicadores: EtiquetaAplicador[], colunas: number, fontSize: number): number {
  return aplicadorRows(aplicadores, colunas).reduce(
    (total, row) => total + APLICADOR_SEPARATOR_GAP + aplicadorBoxHeight(rowHasRodape(row), fontSize),
    0
  );
}

function drawUnderlinedField(
  doc: jsPDF,
  fieldLabel: string,
  value: string,
  innerX: number,
  rightX: number,
  y: number
) {
  doc.text(fieldLabel, innerX, y);
  const lineStartX = innerX + doc.getTextWidth(fieldLabel) + 0.8;
  doc.setLineWidth(0.15);
  doc.line(lineStartX, y + APLICADOR_UNDERLINE_OFFSET, rightX, y + APLICADOR_UNDERLINE_OFFSET);

  const content = normalizeSpaces(value);
  if (!content) return;
  const valueX = lineStartX + 0.5;
  const [firstLine] = doc.splitTextToSize(content, Math.max(1, rightX - valueX)) as string[];
  doc.text(firstLine ?? "", valueX, y);
}

/** Uma caixa de aplicador; em colunas estreitas (`compacto`) os rótulos são abreviados. */
function drawAplicadorBlock(
  doc: jsPDF,
  leftX: number,
  rightX: number,
  boxTop: number,
  boxHeight: number,
  hasRodapeRow: boolean,
  block: EtiquetaAplicador,
  fontSize: number,
  compacto: boolean
) {
  const contentX = leftX + APLICADOR_BOX_PAD_X;
  const contentRightX = rightX - APLICADOR_BOX_PAD_X;
  const centerX = (leftX + rightX) / 2;
  const lh = textLineHeight(fontSize);
  let rowTop = boxTop + APLICADOR_BOX_PAD_Y;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(leftX, boxTop, rightX - leftX, boxHeight);
  doc.setTextColor(0, 0, 0);

  if (hasRodapeRow) {
    const rodapeText = truncateText(block.textoAcima, TEXTO_ACIMA_ASSINATURA_MAX).toUpperCase();
    const maxWidth = contentRightX - contentX;
    let rodapeSize = fontSize;
    setFont(doc, rodapeSize, "bold");
    while (rodapeSize > fontSize * RODAPE_FONT_MIN_RATIO && doc.getTextWidth(rodapeText) > maxWidth) {
      rodapeSize -= 0.25;
      setFont(doc, rodapeSize, "bold");
    }
    doc.text(fitSingleLine(doc, rodapeText, maxWidth), centerX, rowTop + lh / 2, {
      align: "center",
      baseline: "middle",
    });
    rowTop += lh;
  }

  setFont(doc, fontSize, "normal");
  const baselineOffset = lh * 0.72;
  const nomeLabel = compacto ? "NOME:" : "NOME DO APLICADOR:";
  drawUnderlinedField(doc, nomeLabel, block.nome, contentX, contentRightX, rowTop + baselineOffset);
  rowTop += lh;
  drawUnderlinedField(doc, "CPF:", block.cpf, contentX, contentRightX, rowTop + baselineOffset);
}

function drawFooterBlock(
  doc: jsPDF,
  x: number,
  width: number,
  footerTop: number,
  aplicadores: EtiquetaAplicador[],
  plano: EtiquetaPlano
) {
  const leftX = x + PAD;
  const rightX = x + width - PAD;
  const colunas = plano.colunasAplicadores;
  const colW = (rightX - leftX - APLICADOR_GRID_GAP * (colunas - 1)) / colunas;

  let cursorY = footerTop;
  aplicadorRows(aplicadores, colunas).forEach((row) => {
    const boxTop = cursorY + APLICADOR_SEPARATOR_GAP;
    const hasRodape = rowHasRodape(row);
    const boxHeight = aplicadorBoxHeight(hasRodape, plano.fonteAplicadores);
    row.forEach((block, col) => {
      const cellLeft = leftX + col * (colW + APLICADOR_GRID_GAP);
      drawAplicadorBlock(
        doc,
        cellLeft,
        cellLeft + colW,
        boxTop,
        boxHeight,
        hasRodape,
        block,
        plano.fonteAplicadores,
        plano.aplicadoresCompactos
      );
    });
    cursorY = boxTop + boxHeight;
  });
}

/** Decisões de layout de uma etiqueta, compartilhadas entre PDF e pré-visualização. */
export type EtiquetaPlano = {
  /** Ocupa a largura das duas colunas da página (só quando o conteúdo não cabe na largura normal). */
  dupla: boolean;
  larguraMm: number;
  alturaMm: number;
  fonteFixa: number;
  fonteAplicadores: number;
  fonteTextoLivre: number;
  colunasAplicadores: number;
  aplicadoresCompactos: boolean;
};

function fitFreeTextSize(doc: jsPDF, text: string, areaW: number, areaH: number, startSize: number): number {
  const content = preserveParagraphs(text).trim();
  if (!content) return startSize;
  let size = startSize;
  while (
    size > TEXTO_LIVRE_AUTO_FIT_MIN &&
    buildRichLines(doc, content, areaW, size).length * lineHeightFor(size) > areaH
  ) {
    size -= 0.5;
  }
  return size;
}

function planWith(
  doc: jsPDF,
  context: EtiquetasDadosResponse,
  item: EtiquetaEditItem,
  logo: LogoDims | null,
  dupla: boolean,
  escala: number
): { plano: EtiquetaPlano; cabe: boolean } {
  const larguraMm = dupla ? LABEL_WIDTH_DUPLA : LABEL_WIDTH;
  const aplicadores = etiquetaAplicadores(item);
  const colunasAplicadores = aplicadorColunas(aplicadores.length, dupla);
  const fonteFixa = ETIQUETA_FONTE * escala;
  const fonteAplicadores = etiquetaFonteAplicadores(aplicadores.length) * escala;
  const innerW = larguraMm - PAD * 2;
  const colW = (innerW - APLICADOR_GRID_GAP * (colunasAplicadores - 1)) / colunasAplicadores;

  const headerBottom = layoutHeader(doc, 0, 0, larguraMm, context, item, logo, fonteFixa, false);
  const footerTop = LABEL_HEIGHT - PAD - footerHeightFor(aplicadores, colunasAplicadores, fonteAplicadores);
  const freeAreaH = footerTop - 0.5 - (headerBottom + 1.5);
  const tamanhoDesejado = clampTextoLivreTamanho(item.textoLivreTamanho) * escala;
  const content = preserveParagraphs(item.textoLivre).trim();
  const freeNeeded = content
    ? buildRichLines(doc, content, innerW, tamanhoDesejado).length * lineHeightFor(tamanhoDesejado)
    : 0;

  return {
    cabe: freeAreaH >= freeNeeded,
    plano: {
      dupla,
      larguraMm,
      alturaMm: LABEL_HEIGHT,
      fonteFixa,
      fonteAplicadores,
      fonteTextoLivre: fitFreeTextSize(doc, item.textoLivre, innerW, Math.max(1, freeAreaH), tamanhoDesejado),
      colunasAplicadores,
      aplicadoresCompactos: colW < APLICADOR_COMPACTO_MAX_WIDTH,
    },
  };
}

/**
 * Tenta, em ordem: largura normal reduzindo levemente as fontes; largura dupla reduzindo até o mínimo.
 * Se nada couber, usa a largura dupla na menor escala e o texto livre encolhe até caber.
 */
function planEtiquetaWith(
  doc: jsPDF,
  context: EtiquetasDadosResponse,
  item: EtiquetaEditItem,
  logo: LogoDims | null
): EtiquetaPlano {
  for (let escala = 1; escala >= ESCALA_MIN_NORMAL - 1e-6; escala -= ESCALA_PASSO) {
    const { plano, cabe } = planWith(doc, context, item, logo, false, escala);
    if (cabe) return plano;
  }
  for (let escala = 1; escala >= ESCALA_MIN - 1e-6; escala -= ESCALA_PASSO) {
    const { plano, cabe } = planWith(doc, context, item, logo, true, escala);
    if (cabe) return plano;
  }
  return planWith(doc, context, item, logo, true, ESCALA_MIN).plano;
}

export function planEtiqueta(
  context: EtiquetasDadosResponse,
  item: EtiquetaEditItem,
  logo: LogoDims | null
): EtiquetaPlano {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  return planEtiquetaWith(doc, context, item, logo);
}

function drawEtiqueta(
  doc: jsPDF,
  x: number,
  y: number,
  context: EtiquetasDadosResponse,
  item: EtiquetaEditItem,
  logo: PdfImageAsset | null,
  plano: EtiquetaPlano
) {
  const width = plano.larguraMm;
  const height = plano.alturaMm;
  const innerX = x + PAD;
  const innerW = width - PAD * 2;
  const aplicadores = etiquetaAplicadores(item);
  const footerTop =
    y + height - PAD - footerHeightFor(aplicadores, plano.colunasAplicadores, plano.fonteAplicadores);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(x, y, width, height);

  const headerBottom = layoutHeader(doc, x, y, width, context, item, logo, plano.fonteFixa, true);

  const freeAreaTop = headerBottom + 1.5;
  const freeAreaBottom = footerTop - 0.5;
  const freeColor = item.exibirAssinatura
    ? ([0, 0, 0] as Rgb)
    : hexToRgb(item.textoLivreCor || "#000000");

  drawAlignedRichText(
    doc,
    item.textoLivre,
    innerX,
    freeAreaTop,
    innerW,
    freeAreaBottom - freeAreaTop,
    plano.fonteTextoLivre,
    item.textoLivreAlinhamento || "center",
    freeColor
  );

  if (aplicadores.length) {
    drawFooterBlock(doc, x, width, footerTop, aplicadores, plano);
  }
}

/**
 * Etiquetas da mesma escola seguem em sequência contínua na grade 2×4; ao mudar de escola,
 * a próxima começa em nova página. Etiquetas duplas ocupam uma linha inteira.
 */
export function generateEtiquetasPdf(entries: EtiquetaPdfEntry[], logo: PdfImageAsset | null): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  let row = 0;
  let col = 0;
  let previousGroup: string | null = null;
  const newPage = () => {
    doc.addPage();
    row = 0;
    col = 0;
  };

  entries.forEach(({ context, label, grupo }, index) => {
    const group = grupo ?? etiquetaEscolaKey(context);
    const plano = planEtiquetaWith(doc, context, label, logo);

    if (index > 0 && group !== previousGroup) newPage();
    if (plano.dupla && col !== 0) {
      row += 1;
      col = 0;
    }
    if (row >= ROWS) newPage();

    const labelX = PAGE_MARGIN + col * (LABEL_WIDTH + GAP_X);
    const labelY = PAGE_MARGIN + row * (LABEL_HEIGHT + GAP_Y);
    drawEtiqueta(doc, labelX, labelY, context, label, logo, plano);

    col = plano.dupla ? COLS : col + 1;
    if (col >= COLS) {
      col = 0;
      row += 1;
    }
    previousGroup = group;
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
