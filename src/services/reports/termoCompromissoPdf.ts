import { jsPDF } from "jspdf";
import type { PdfImageAsset } from "@/utils/pdfCityBranding";
import { drawReportHeaderLogoWithFallback } from "@/utils/pdfCityBranding";
import { downloadBlob } from "@/services/reports/hierarchicalDownload";
import type { TermoCompromissoDadosResponse, TermoCompromissoFormData } from "@/types/termo-compromisso";

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

function formatDateLong(date = new Date()): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function cityDisplay(payload: TermoCompromissoDadosResponse): string {
  const city = normalizeSpaces(payload.municipio.name);
  const state = normalizeSpaces(payload.municipio.state);
  return state ? `${city}/${state}` : city;
}

function fieldDisplay(value: string): string {
  return normalizeSpaces(value);
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
  doc.text("SECRETARIA MUNICIPAL DE EDUCAÇÃO", pageWidth / 2, y, {
    align: "center",
  });

  return y + 10;
}

function drawSectionTitle(doc: jsPDF, title: string, x: number, y: number, maxWidth: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.text);
  doc.text(title, x, y);
  y += 5;
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.25);
  doc.line(x, y, x + maxWidth, y);
  return y + SECTION_GAP;
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
  return y + 8;
}

function drawIdentBlock(
  doc: jsPDF,
  form: TermoCompromissoFormData,
  x: number,
  y: number,
  maxWidth: number
): number {
  y = drawSectionTitle(doc, "DADOS DO(A) DECLARANTE", x, y, maxWidth);
  y = drawIdentField(doc, "Nome completo", form.nome, x, y, maxWidth);
  y = drawIdentField(doc, "CPF", form.cpf, x, y, maxWidth);
  y = drawIdentField(doc, "RG", form.rg, x, y, maxWidth);
  return y + SECTION_GAP;
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
  return y + lines.length * LINE_HEIGHT + 2.5;
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
  const city = cityDisplay(payload);
  const ano = payload.contexto.ano;

  let y = await drawHeader(doc, payload, logo);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.text);
  doc.text("TERMO DE COMPROMISSO E CONFIDENCIALIDADE", pageWidth / 2, y, { align: "center" });
  y += 12;

  y = drawIdentBlock(doc, form, MARGIN, y, contentWidth);

  y = drawParagraph(
    doc,
    `Assumo o compromisso de manter confidencialidade e sigilo sobre todas as informações e documentos confidenciais a que tiver acesso durante o desempenho de minhas funções de aplicador(a) e/ou coordenador(a) das aplicações do AVALIE — Avaliação Institucional da Educação do município de ${city}, no período de março a abril de ${ano}.`,
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

  y += SECTION_GAP;
  y = drawParagraph(
    doc,
    `Estou ciente de que a confidencialidade é obrigatória mesmo após o encerramento de minhas funções como aplicador(a) e/ou coordenador(a) das aplicações do AVALIE — Avaliação Institucional da Educação do município de ${city}.`,
    MARGIN,
    y,
    contentWidth,
    { gapAfter: 10 }
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...COLORS.text);
  doc.text(`${normalizeSpaces(payload.municipio.name)}, ${formatDateLong()}.`, MARGIN, y);
  y += 18;

  if (y > pageHeight - 28) {
    doc.addPage();
    y = MARGIN + 10;
  }

  const signatureLineWidth = contentWidth * 0.55;
  const signatureX = (pageWidth - signatureLineWidth) / 2;
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.35);
  doc.line(signatureX, y, signatureX + signatureLineWidth, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Assinatura do(a) declarante", pageWidth / 2, y, { align: "center" });

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
