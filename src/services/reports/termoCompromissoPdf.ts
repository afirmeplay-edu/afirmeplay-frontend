import { jsPDF } from "jspdf";
import type { PdfImageAsset } from "@/utils/pdfCityBranding";
import { drawReportHeaderLogoWithFallback } from "@/utils/pdfCityBranding";
import { downloadBlob } from "@/services/reports/hierarchicalDownload";
import type { TermoCompromissoDadosResponse, TermoCompromissoFormData } from "@/types/termo-compromisso";
import { getClassShiftLabel } from "@/lib/classShift";

const MARGIN = 18;
const LINE_HEIGHT = 5.4;
const SECTION_GAP = 4;
const PARAGRAPH_GAP = 3;

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
  logo: PdfImageAsset | null
): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 10;

  y = await drawReportHeaderLogoWithFallback(doc, pageWidth, y, logo);
  y += 2;

  doc.setTextColor(...COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(payload.municipio.prefeitura_label || "PREFEITURA MUNICIPAL", pageWidth / 2, y, {
    align: "center",
  });
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    payload.municipio.secretaria_label || "SECRETARIA MUNICIPAL DE EDUCAÇÃO",
    pageWidth / 2,
    y,
    { align: "center" }
  );

  return y + 10;
}

function drawParagraph(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  opts?: { fontSize?: number; style?: "normal" | "bold" | "italic"; gapAfter?: number }
): number {
  const fontSize = opts?.fontSize ?? 10.5;
  const style = opts?.style ?? "normal";
  doc.setFont("helvetica", style);
  doc.setFontSize(fontSize);
  doc.setTextColor(...COLORS.text);
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  lines.forEach((line) => {
    doc.text(line, x, y);
    y += LINE_HEIGHT;
  });
  return y + (opts?.gapAfter ?? PARAGRAPH_GAP);
}

function drawIdentField(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  maxWidth: number
): number {
  const labelText = `${label}:`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.text);
  doc.text(labelText, x, y);

  const labelWidth = doc.getTextWidth(`${labelText} `);
  const fieldX = x + labelWidth;
  const fieldWidth = maxWidth - labelWidth;
  const displayValue = fieldDisplay(value);

  if (displayValue) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const valueLines = doc.splitTextToSize(displayValue, fieldWidth) as string[];
    valueLines.forEach((line, index) => {
      doc.text(line, fieldX, y + index * LINE_HEIGHT);
    });
    return y + valueLines.length * LINE_HEIGHT + 3;
  }

  const lineY = y + 1.2;
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.3);
  doc.line(fieldX, lineY, x + maxWidth, lineY);
  return y + 7;
}

function drawContextBlock(
  doc: jsPDF,
  payload: TermoCompromissoDadosResponse,
  x: number,
  y: number,
  maxWidth: number
): number {
  const ctx = payload.contexto;
  const turno = getClassShiftLabel(ctx.turno ?? ctx.shift);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.text);
  doc.text("CONTEXTO DA APLICAÇÃO", x + maxWidth / 2, y, { align: "center" });
  y += 8;
  y = drawIdentField(doc, "Escola", ctx.escola, x, y, maxWidth);
  y = drawIdentField(doc, "Série", ctx.serie, x, y, maxWidth);
  y = drawIdentField(doc, "Turma", ctx.turma, x, y, maxWidth);
  y = drawIdentField(doc, "Turno", turno, x, y, maxWidth);
  return y + 2;
}

function drawIdentBlock(
  doc: jsPDF,
  form: TermoCompromissoFormData,
  x: number,
  y: number,
  maxWidth: number
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.text);
  doc.text("DADOS DO(A) DECLARANTE", x + maxWidth / 2, y, { align: "center" });
  y += 8;
  y = drawIdentField(doc, "Nome completo", form.nome, x, y, maxWidth);
  y = drawIdentField(doc, "CPF", form.cpf, x, y, maxWidth);
  y = drawIdentField(doc, "RG", form.rg, x, y, maxWidth);
  return y + 2;
}

function drawClause(
  doc: jsPDF,
  number: number,
  text: string,
  x: number,
  y: number,
  maxWidth: number
): number {
  const marker = `${number}.`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.text);
  doc.text(marker, x, y);

  const markerWidth = doc.getTextWidth(`${marker} `);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(text, maxWidth - markerWidth) as string[];
  lines.forEach((line, index) => {
    doc.text(line, x + markerWidth, y + index * LINE_HEIGHT);
  });
  return y + lines.length * LINE_HEIGHT + 2;
}

export async function generateTermoCompromissoPdf(
  payload: TermoCompromissoDadosResponse,
  form: TermoCompromissoFormData,
  logo: PdfImageAsset | null
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const city = municipioCorpoDisplay(payload);
  const periodoTexto = periodoAvaliacaoDisplay(payload);
  const nomeAplicacao = applicationNameDisplay(form, payload);
  const tituloDocumento =
    normalizeSpaces(payload.documento?.titulo) || "TERMO DE COMPROMISSO E CONFIDENCIALIDADE";

  let y = await drawHeader(doc, payload, logo);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.text);
  doc.text(tituloDocumento, pageWidth / 2, y, { align: "center" });
  y += 10;

  y = drawContextBlock(doc, payload, MARGIN, y, contentWidth);
  y = drawIdentBlock(doc, form, MARGIN, y, contentWidth);

  y = drawParagraph(
    doc,
    `Assumo o compromisso de manter confidencialidade e sigilo sobre todas as informações e documentos confidenciais a que tiver acesso durante o desempenho de minhas funções de aplicador(a) e/ou coordenador(a) das aplicações do ${nomeAplicacao} do município de ${city}, ${periodoTexto}.`,
    MARGIN,
    y,
    contentWidth,
    { gapAfter: SECTION_GAP }
  );

  y = drawParagraph(
    doc,
    "Por este Termo de Confidencialidade e Sigilo, comprometo-me a:",
    MARGIN,
    y,
    contentWidth,
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
    y = drawClause(doc, index + 1, clause, MARGIN, y, contentWidth);
  });

  y += 1;
  y = drawParagraph(
    doc,
    `Estou ciente de que a confidencialidade é obrigatória mesmo após o encerramento de minhas funções como aplicador(a) e/ou coordenador(a) das aplicações do ${nomeAplicacao} do município de ${city}.`,
    MARGIN,
    y,
    contentWidth,
    { gapAfter: 4 }
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...COLORS.text);
  doc.text(dataDocumentoDisplay(payload), MARGIN, y);

  const signatureLineY = pageHeight - 20;
  const signatureLabelY = pageHeight - 14;
  const signatureLineWidth = contentWidth * 0.55;
  const signatureX = (pageWidth - signatureLineWidth) / 2;
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.35);
  doc.line(signatureX, signatureLineY, signatureX + signatureLineWidth, signatureLineY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...COLORS.text);
  doc.text("Assinatura do(a) declarante", pageWidth / 2, signatureLabelY, { align: "center" });

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
