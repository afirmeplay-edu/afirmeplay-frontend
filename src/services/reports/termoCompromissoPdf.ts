import { jsPDF } from "jspdf";
import type { PdfImageAsset } from "@/utils/pdfCityBranding";
import { drawReportHeaderLogoWithFallback } from "@/utils/pdfCityBranding";
import { downloadBlob } from "@/services/reports/hierarchicalDownload";
import type { TermoCompromissoDadosResponse, TermoCompromissoFormData } from "@/types/termo-compromisso";
import { getClassShiftLabel } from "@/lib/classShift";

const MARGIN = 16;
const SECTION_GAP = 3;
const PARAGRAPH_GAP = 3;
const BLOCK_GAP = 4;
/** Espaço entre a borda inferior da página e o rótulo da assinatura. */
const SIGNATURE_BOTTOM_MARGIN = 18;
const SIGNATURE_LINE_ABOVE_LABEL = 5;
/** Espaço mínimo entre o fim do texto (data) e a linha de assinatura. */
const MIN_GAP_CONTENT_TO_SIGNATURE = 10;

type TermoTypography = {
  lineHeight: number;
  bodyFontSize: number;
  clauseFontSize: number;
  labelFontSize: number;
  valueFontSize: number;
  sectionTitleFontSize: number;
  docTitleFontSize: number;
  headerPrefeituraFontSize: number;
  headerSecretariaFontSize: number;
  signatureFontSize: number;
  sectionTitleGap: number;
  identFieldGap: number;
  clauseGap: number;
  headerBottomGap: number;
  titleBottomGap: number;
};

const TERMO_TYPOGRAPHY_COMPACT: TermoTypography = {
  lineHeight: 4.1,
  bodyFontSize: 8,
  clauseFontSize: 8,
  labelFontSize: 7.5,
  valueFontSize: 8,
  sectionTitleFontSize: 8.5,
  docTitleFontSize: 10.5,
  headerPrefeituraFontSize: 9,
  headerSecretariaFontSize: 7.5,
  signatureFontSize: 8.5,
  sectionTitleGap: 5,
  identFieldGap: 2,
  clauseGap: 1.2,
  headerBottomGap: 6,
  titleBottomGap: 7,
};

const TERMO_TYPOGRAPHY_DEFAULT: TermoTypography = {
  lineHeight: 4.7,
  bodyFontSize: 8.5,
  clauseFontSize: 8.5,
  labelFontSize: 8,
  valueFontSize: 8.5,
  sectionTitleFontSize: 9,
  docTitleFontSize: 11,
  headerPrefeituraFontSize: 9.5,
  headerSecretariaFontSize: 8,
  signatureFontSize: 9,
  sectionTitleGap: 7,
  identFieldGap: 3,
  clauseGap: 2,
  headerBottomGap: 8,
  titleBottomGap: 9,
};

const COLORS = {
  text: [28, 28, 28] as [number, number, number],
  muted: [90, 90, 90] as [number, number, number],
  line: [140, 140, 140] as [number, number, number],
};

function normalizeSpaces(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function municipioCorpoDisplay(payload: TermoCompromissoDadosResponse): string {
  const fromPayload = normalizeSpaces(payload.contexto.municipio_corpo);
  if (fromPayload) return fromPayload;
  const city = normalizeSpaces(payload.municipio.name);
  const state = normalizeSpaces(payload.municipio.state);
  return state ? `${city}/${state}` : city;
}

function fieldDisplay(value: string): string {
  return normalizeSpaces(value);
}

const DEFAULT_NOME_APLICACAO = "AVALIE — Avaliação Institucional da Educação";

function applicationNameDisplay(
  form: TermoCompromissoFormData,
  payload: TermoCompromissoDadosResponse
): string {
  return (
    fieldDisplay(form.nomeAplicacao) ||
    normalizeSpaces(payload.contexto.nome_aplicacao_referencia) ||
    DEFAULT_NOME_APLICACAO
  );
}

function periodoAvaliacaoDisplay(payload: TermoCompromissoDadosResponse): string {
  const fromPayload = normalizeSpaces(payload.contexto.periodo_texto);
  if (fromPayload) return fromPayload;
  const mes =
    normalizeSpaces(payload.contexto.mes_avaliacao) ||
    new Date().toLocaleDateString("pt-BR", { month: "long" });
  const ano = payload.contexto.ano || new Date().getFullYear();
  return `no período de ${mes} de ${ano}`;
}

function dataDocumentoDisplay(payload: TermoCompromissoDadosResponse): string {
  const fromPayload = normalizeSpaces(payload.contexto.data_documento);
  if (fromPayload) return `${fromPayload}.`;
  const city = normalizeSpaces(payload.municipio.name);
  const date = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return `${city}, ${date}.`;
}

async function drawHeader(
  doc: jsPDF,
  payload: TermoCompromissoDadosResponse,
  logo: PdfImageAsset | null,
  typography: TermoTypography
): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 8;

  y = await drawReportHeaderLogoWithFallback(doc, pageWidth, y, logo);
  y += 1;

  doc.setTextColor(...COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(typography.headerPrefeituraFontSize);
  doc.text(payload.municipio.prefeitura_label || "PREFEITURA MUNICIPAL", pageWidth / 2, y, {
    align: "center",
  });
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(typography.headerSecretariaFontSize);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    payload.municipio.secretaria_label || "SECRETARIA MUNICIPAL DE EDUCAÇÃO",
    pageWidth / 2,
    y,
    { align: "center" }
  );

  return y + typography.headerBottomGap;
}

function drawParagraph(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  typography: TermoTypography,
  opts?: { fontSize?: number; style?: "normal" | "bold" | "italic"; gapAfter?: number }
): number {
  const fontSize = opts?.fontSize ?? typography.bodyFontSize;
  const style = opts?.style ?? "normal";
  doc.setFont("helvetica", style);
  doc.setFontSize(fontSize);
  doc.setTextColor(...COLORS.text);
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  lines.forEach((line) => {
    doc.text(line, x, y);
    y += typography.lineHeight;
  });
  return y + (opts?.gapAfter ?? PARAGRAPH_GAP);
}

function drawIdentField(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  typography: TermoTypography
): number {
  const labelText = `${label}:`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(typography.labelFontSize);
  doc.setTextColor(...COLORS.text);
  doc.text(labelText, x, y);

  const labelWidth = doc.getTextWidth(`${labelText} `);
  const fieldX = x + labelWidth;
  const fieldWidth = maxWidth - labelWidth;
  const displayValue = fieldDisplay(value);

  if (displayValue) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(typography.valueFontSize);
    const valueLines = doc.splitTextToSize(displayValue, fieldWidth) as string[];
    valueLines.forEach((line, index) => {
      doc.text(line, fieldX, y + index * typography.lineHeight);
    });
    return y + valueLines.length * typography.lineHeight + typography.identFieldGap;
  }

  const lineY = y + 1.2;
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.3);
  doc.line(fieldX, lineY, x + maxWidth, lineY);
  return y + 6;
}

function drawContextBlock(
  doc: jsPDF,
  payload: TermoCompromissoDadosResponse,
  x: number,
  y: number,
  maxWidth: number,
  typography: TermoTypography
): number {
  const ctx = payload.contexto;
  const turno = getClassShiftLabel(ctx.turno ?? ctx.shift);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(typography.sectionTitleFontSize);
  doc.setTextColor(...COLORS.text);
  doc.text("CONTEXTO DA APLICAÇÃO", x + maxWidth / 2, y, { align: "center" });
  y += typography.sectionTitleGap;
  y = drawIdentField(doc, "Escola", ctx.escola, x, y, maxWidth, typography);
  y = drawIdentField(doc, "Série", ctx.serie, x, y, maxWidth, typography);
  y = drawIdentField(doc, "Turma", ctx.turma, x, y, maxWidth, typography);
  y = drawIdentField(doc, "Turno", turno, x, y, maxWidth, typography);
  return y + BLOCK_GAP;
}

function drawIdentBlock(
  doc: jsPDF,
  form: TermoCompromissoFormData,
  x: number,
  y: number,
  maxWidth: number,
  typography: TermoTypography
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(typography.sectionTitleFontSize);
  doc.setTextColor(...COLORS.text);
  doc.text("DADOS DO(A) DECLARANTE", x + maxWidth / 2, y, { align: "center" });
  y += typography.sectionTitleGap;
  y = drawIdentField(doc, "Nome completo", form.nome, x, y, maxWidth, typography);
  y = drawIdentField(doc, "CPF", form.cpf, x, y, maxWidth, typography);
  y = drawIdentField(doc, "RG", form.rg, x, y, maxWidth, typography);
  return y + BLOCK_GAP;
}

function getSignaturePositions(pageHeight: number): { lineY: number; labelY: number } {
  const labelY = pageHeight - SIGNATURE_BOTTOM_MARGIN;
  const lineY = labelY - SIGNATURE_LINE_ABOVE_LABEL;
  return { lineY, labelY };
}

function contentFitsWithBottomSignature(contentEndY: number, pageHeight: number): boolean {
  const { lineY } = getSignaturePositions(pageHeight);
  return contentEndY + MIN_GAP_CONTENT_TO_SIGNATURE <= lineY;
}

function drawClause(
  doc: jsPDF,
  number: number,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  typography: TermoTypography
): number {
  const marker = `${number}.`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(typography.clauseFontSize);
  doc.setTextColor(...COLORS.text);
  doc.text(marker, x, y);

  const markerWidth = doc.getTextWidth(`${marker} `);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(text, maxWidth - markerWidth) as string[];
  lines.forEach((line, index) => {
    doc.text(line, x + markerWidth, y + index * typography.lineHeight);
  });
  return y + lines.length * typography.lineHeight + typography.clauseGap;
}

async function renderTermoContent(
  doc: jsPDF,
  payload: TermoCompromissoDadosResponse,
  form: TermoCompromissoFormData,
  logo: PdfImageAsset | null,
  typography: TermoTypography
): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;
  const city = municipioCorpoDisplay(payload);
  const periodoTexto = periodoAvaliacaoDisplay(payload);
  const nomeAplicacao = applicationNameDisplay(form, payload);
  const tituloDocumento =
    normalizeSpaces(payload.documento?.titulo) || "TERMO DE COMPROMISSO E CONFIDENCIALIDADE";

  let y = await drawHeader(doc, payload, logo, typography);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(typography.docTitleFontSize);
  doc.setTextColor(...COLORS.text);
  doc.text(tituloDocumento, pageWidth / 2, y, { align: "center" });
  y += typography.titleBottomGap;

  y = drawContextBlock(doc, payload, MARGIN, y, contentWidth, typography);
  y = drawIdentBlock(doc, form, MARGIN, y, contentWidth, typography);

  y = drawParagraph(
    doc,
    `Assumo o compromisso de manter confidencialidade e sigilo sobre todas as informações e documentos confidenciais a que tiver acesso durante o desempenho de minhas funções de aplicador(a) e/ou coordenador(a) das aplicações do ${nomeAplicacao} do município de ${city}, ${periodoTexto}.`,
    MARGIN,
    y,
    contentWidth,
    typography,
    { gapAfter: SECTION_GAP }
  );

  y = drawParagraph(
    doc,
    "Por este Termo de Confidencialidade e Sigilo, comprometo-me a:",
    MARGIN,
    y,
    contentWidth,
    typography,
    { style: "bold", gapAfter: 2 }
  );

  const clauses = [
    "A não utilizar as informações confidenciais a que tiver acesso para gerar benefício próprio exclusivo e/ou unilateral, presente ou futuro, ou para o uso de terceiros;",
    "A não efetuar nenhuma gravação, fotografia ou cópia de documentação, base de dados, sistemas computacionais, informações ou outras tecnologias a que tiver acesso;",
    "A não me apropriar de material confidencial e/ou sigiloso, de informações e documentos pessoais que venham a estar disponíveis;",
    "A não repassar o conhecimento das informações a que tiver acesso, responsabilizando-me por todas as pessoas que vierem a ter acesso às informações por meu intermédio, e me obrigando, assim, a ressarcir a ocorrência de qualquer dano e/ou prejuízo oriundo de uma eventual quebra de sigilo das informações fornecidas;",
    "A não divulgar, de nenhuma maneira ou por qualquer meio, as informações e/ou documentos a que tiver acesso;",
    "Entende-se como informação e documentos confidenciais: quaisquer informações, dados, processos, fórmulas, códigos, cadastros, fluxogramas, diagramas lógicos, dispositivos, modelos ou outros materiais de propriedade da equipe responsável pela avaliação.",
  ];

  clauses.forEach((clause, index) => {
    y = drawClause(doc, index + 1, clause, MARGIN, y, contentWidth, typography);
  });

  y += 1;
  y = drawParagraph(
    doc,
    `Estou ciente de que a confidencialidade é obrigatória mesmo após o encerramento de minhas funções como aplicador(a) e/ou coordenador(a) das aplicações do ${nomeAplicacao} do município de ${city}.`,
    MARGIN,
    y,
    contentWidth,
    typography,
    { gapAfter: 3 }
  );

  return drawParagraph(
    doc,
    dataDocumentoDisplay(payload),
    MARGIN,
    y,
    contentWidth,
    typography,
    { gapAfter: 0 }
  );
}

function drawSignatureBlock(doc: jsPDF, typography: TermoTypography): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const { lineY: signatureLineY, labelY: signatureLabelY } = getSignaturePositions(pageHeight);
  const signatureLineWidth = contentWidth * 0.55;
  const signatureX = (pageWidth - signatureLineWidth) / 2;
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.35);
  doc.line(signatureX, signatureLineY, signatureX + signatureLineWidth, signatureLineY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(typography.signatureFontSize);
  doc.setTextColor(...COLORS.text);
  doc.text("Assinatura do(a) declarante", pageWidth / 2, signatureLabelY, { align: "center" });
}

export async function generateTermoCompromissoPdf(
  payload: TermoCompromissoDadosResponse,
  form: TermoCompromissoFormData,
  logo: PdfImageAsset | null
): Promise<jsPDF> {
  const pageHeight = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }).internal.pageSize.getHeight();
  const typographyCandidates = [TERMO_TYPOGRAPHY_DEFAULT, TERMO_TYPOGRAPHY_COMPACT];

  for (const typography of typographyCandidates) {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const y = await renderTermoContent(doc, payload, form, logo, typography);
    if (contentFitsWithBottomSignature(y, pageHeight)) {
      drawSignatureBlock(doc, typography);
      return doc;
    }
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await renderTermoContent(doc, payload, form, logo, TERMO_TYPOGRAPHY_COMPACT);
  drawSignatureBlock(doc, TERMO_TYPOGRAPHY_COMPACT);
  return doc;
}

export async function downloadTermoCompromissoPdf(
  payload: TermoCompromissoDadosResponse,
  form: TermoCompromissoFormData,
  logo: PdfImageAsset | null
): Promise<void> {
  const doc = await generateTermoCompromissoPdf(payload, form, logo);
  const date = new Date().toISOString().slice(0, 10);
  const slug = fieldDisplay(form.nome).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const fileName = `termo-compromisso-${slug || "documento"}-${date}.pdf`;
  downloadBlob(doc.output("blob"), fileName);
}
