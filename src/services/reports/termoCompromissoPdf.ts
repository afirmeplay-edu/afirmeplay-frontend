import { jsPDF } from "jspdf";
import type { PdfImageAsset } from "@/utils/pdfCityBranding";
import { drawMunicipalLogoTopCenter, loadDefaultReportLogoAsset } from "@/utils/pdfCityBranding";
import { generateZipBlob, sanitizePathSegment } from "@/services/reports/hierarchicalDownload";
import type {
  TermoCompromissoExportFormat,
  TermoCompromissoLoteResponse,
  TermoCompromissoTurma,
} from "@/types/termo-compromisso";
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
/** A cada N termos, devolve o controle ao navegador para não travar a interface. */
const YIELD_EVERY = 10;

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

const DEFAULT_NOME_APLICACAO = "AVALIE — Avaliação Institucional da Educação";

/** Logo resolvido uma única vez por exportação (municipal ou institucional). */
type TermoHeaderLogo = { asset: PdfImageAsset; maxW: number; maxH: number } | null;

type TermoExportProgress = (current: number, total: number) => void;

export type TermoCompromissoExportResult = {
  blob: Blob;
  fileName: string;
  totalTermos: number;
  totalArquivos: number;
};

function normalizeSpaces(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function compareNatural(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

function sortTurmas(turmas: TermoCompromissoTurma[]): TermoCompromissoTurma[] {
  return [...turmas].sort(
    (a, b) =>
      compareNatural(a.escola, b.escola) ||
      compareNatural(a.serie, b.serie) ||
      compareNatural(a.turma, b.turma)
  );
}

function groupTurmas(
  turmas: TermoCompromissoTurma[],
  keyOf: (turma: TermoCompromissoTurma) => string
): TermoCompromissoTurma[][] {
  const groups = new Map<string, TermoCompromissoTurma[]>();
  for (const turma of turmas) {
    const key = keyOf(turma);
    const group = groups.get(key);
    if (group) group.push(turma);
    else groups.set(key, [turma]);
  }
  return Array.from(groups.values());
}

async function resolveHeaderLogo(municipalLogo: PdfImageAsset | null): Promise<TermoHeaderLogo> {
  if (municipalLogo) return { asset: municipalLogo, maxW: 50, maxH: 26 };
  try {
    const fallback = await loadDefaultReportLogoAsset();
    return fallback ? { asset: fallback, maxW: 50, maxH: 22 } : null;
  } catch {
    return null;
  }
}

function municipioCorpoDisplay(lote: TermoCompromissoLoteResponse): string {
  const fromPayload = normalizeSpaces(lote.contexto.municipio_corpo);
  if (fromPayload) return fromPayload;
  const city = normalizeSpaces(lote.municipio.name);
  const state = normalizeSpaces(lote.municipio.state);
  return state ? `${city}/${state}` : city;
}

function applicationNameDisplay(nomeAplicacao: string, lote: TermoCompromissoLoteResponse): string {
  return (
    normalizeSpaces(nomeAplicacao) ||
    normalizeSpaces(lote.contexto.nome_aplicacao_referencia) ||
    DEFAULT_NOME_APLICACAO
  );
}

function periodoAvaliacaoDisplay(lote: TermoCompromissoLoteResponse): string {
  const fromPayload = normalizeSpaces(lote.contexto.periodo_texto);
  if (fromPayload) return fromPayload;
  const mes =
    normalizeSpaces(lote.contexto.mes_avaliacao) ||
    new Date().toLocaleDateString("pt-BR", { month: "long" });
  const ano = lote.contexto.ano || new Date().getFullYear();
  return `no período de ${mes} de ${ano}`;
}

function dataDocumentoDisplay(lote: TermoCompromissoLoteResponse): string {
  const fromPayload = normalizeSpaces(lote.contexto.data_documento);
  if (fromPayload) return `${fromPayload}.`;
  const city = normalizeSpaces(lote.municipio.name);
  const date = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return `${city}, ${date}.`;
}

function drawHeader(
  doc: jsPDF,
  lote: TermoCompromissoLoteResponse,
  logo: TermoHeaderLogo,
  typography: TermoTypography
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 8;

  if (logo) {
    y = drawMunicipalLogoTopCenter(doc, pageWidth, y, logo.asset, logo.maxW, logo.maxH);
  }
  y += 1;

  doc.setTextColor(...COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(typography.headerPrefeituraFontSize);
  doc.text(lote.municipio.prefeitura_label || "PREFEITURA MUNICIPAL", pageWidth / 2, y, {
    align: "center",
  });
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(typography.headerSecretariaFontSize);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    lote.municipio.secretaria_label || "SECRETARIA MUNICIPAL DE EDUCAÇÃO",
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
  const displayValue = normalizeSpaces(value);

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
  turma: TermoCompromissoTurma,
  x: number,
  y: number,
  maxWidth: number,
  typography: TermoTypography
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(typography.sectionTitleFontSize);
  doc.setTextColor(...COLORS.text);
  doc.text("CONTEXTO DA APLICAÇÃO", x + maxWidth / 2, y, { align: "center" });
  y += typography.sectionTitleGap;
  y = drawIdentField(doc, "Escola", turma.escola, x, y, maxWidth, typography);
  y = drawIdentField(doc, "Série", turma.serie, x, y, maxWidth, typography);
  y = drawIdentField(doc, "Turma", turma.turma, x, y, maxWidth, typography);
  y = drawIdentField(doc, "Turno", getClassShiftLabel(turma.shift), x, y, maxWidth, typography);
  return y + BLOCK_GAP;
}

/** Dados do(a) declarante são sempre preenchidos à mão no documento impresso. */
function drawIdentBlock(
  doc: jsPDF,
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
  y = drawIdentField(doc, "Nome completo", "", x, y, maxWidth, typography);
  y = drawIdentField(doc, "CPF", "", x, y, maxWidth, typography);
  y = drawIdentField(doc, "RG", "", x, y, maxWidth, typography);
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

function renderTermoContent(
  doc: jsPDF,
  lote: TermoCompromissoLoteResponse,
  turma: TermoCompromissoTurma,
  nomeAplicacao: string,
  logo: TermoHeaderLogo,
  typography: TermoTypography
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;
  const city = municipioCorpoDisplay(lote);
  const periodoTexto = periodoAvaliacaoDisplay(lote);
  const nomeAplicacaoTexto = applicationNameDisplay(nomeAplicacao, lote);
  const tituloDocumento =
    normalizeSpaces(lote.documento?.titulo) || "TERMO DE COMPROMISSO E CONFIDENCIALIDADE";

  let y = drawHeader(doc, lote, logo, typography);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(typography.docTitleFontSize);
  doc.setTextColor(...COLORS.text);
  doc.text(tituloDocumento, pageWidth / 2, y, { align: "center" });
  y += typography.titleBottomGap;

  y = drawContextBlock(doc, turma, MARGIN, y, contentWidth, typography);
  y = drawIdentBlock(doc, MARGIN, y, contentWidth, typography);

  y = drawParagraph(
    doc,
    `Assumo o compromisso de manter confidencialidade e sigilo sobre todas as informações e documentos confidenciais a que tiver acesso durante o desempenho de minhas funções de aplicador(a) e/ou coordenador(a) das aplicações do ${nomeAplicacaoTexto} do município de ${city}, ${periodoTexto}.`,
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
    `Estou ciente de que a confidencialidade é obrigatória mesmo após o encerramento de minhas funções como aplicador(a) e/ou coordenador(a) das aplicações do ${nomeAplicacaoTexto} do município de ${city}.`,
    MARGIN,
    y,
    contentWidth,
    typography,
    { gapAfter: 3 }
  );

  return drawParagraph(doc, dataDocumentoDisplay(lote), MARGIN, y, contentWidth, typography, {
    gapAfter: 0,
  });
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

/**
 * Acrescenta uma página com o termo da turma. Tenta a tipografia padrão e, se o conteúdo
 * colidir com a assinatura, descarta a página e redesenha com a compacta.
 */
function appendTermoPage(
  doc: jsPDF,
  lote: TermoCompromissoLoteResponse,
  turma: TermoCompromissoTurma,
  nomeAplicacao: string,
  logo: TermoHeaderLogo
): void {
  const pageHeight = doc.internal.pageSize.getHeight();

  for (const typography of [TERMO_TYPOGRAPHY_DEFAULT, TERMO_TYPOGRAPHY_COMPACT]) {
    doc.addPage();
    const y = renderTermoContent(doc, lote, turma, nomeAplicacao, logo, typography);
    if (contentFitsWithBottomSignature(y, pageHeight)) {
      drawSignatureBlock(doc, typography);
      return;
    }
    doc.deletePage(doc.getNumberOfPages());
  }

  doc.addPage();
  renderTermoContent(doc, lote, turma, nomeAplicacao, logo, TERMO_TYPOGRAPHY_COMPACT);
  drawSignatureBlock(doc, TERMO_TYPOGRAPHY_COMPACT);
}

async function buildTermosPdfBlob(
  lote: TermoCompromissoLoteResponse,
  turmas: TermoCompromissoTurma[],
  nomeAplicacao: string,
  logo: TermoHeaderLogo,
  onTermo: () => void
): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  for (const [index, turma] of turmas.entries()) {
    appendTermoPage(doc, lote, turma, nomeAplicacao, logo);
    onTermo();
    if ((index + 1) % YIELD_EVERY === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  // jsPDF nasce com uma página em branco; os termos são acrescentados após ela.
  doc.deletePage(1);
  return doc.output("blob");
}

/**
 * Gera os termos do lote no formato escolhido:
 * - `pdf_unico`: um PDF com todos os termos (escola → série → turma);
 * - `zip_escola`: ZIP com um PDF por escola;
 * - `zip_serie`: ZIP com pastas por escola e um PDF por série (todas as turmas).
 */
export async function exportTermoCompromisso(params: {
  lote: TermoCompromissoLoteResponse;
  format: TermoCompromissoExportFormat;
  nomeAplicacao: string;
  municipalLogo: PdfImageAsset | null;
  onProgress?: TermoExportProgress;
}): Promise<TermoCompromissoExportResult> {
  const { lote, format, nomeAplicacao, municipalLogo, onProgress } = params;
  const turmas = sortTurmas(lote.turmas);
  if (turmas.length === 0) {
    throw new Error("Nenhuma turma encontrada para os filtros selecionados.");
  }

  const logo = await resolveHeaderLogo(municipalLogo);
  const total = turmas.length;
  let done = 0;
  const onTermo = () => {
    done += 1;
    onProgress?.(done, total);
  };
  const date = new Date().toISOString().slice(0, 10);

  if (format === "pdf_unico") {
    const blob = await buildTermosPdfBlob(lote, turmas, nomeAplicacao, logo, onTermo);
    return { blob, fileName: `termo-compromisso-${date}.pdf`, totalTermos: total, totalArquivos: 1 };
  }

  const groups =
    format === "zip_escola"
      ? groupTurmas(turmas, (t) => t.escola_id)
      : groupTurmas(turmas, (t) => `${t.escola_id}|${t.serie_id}`);

  const entries: Array<{ path: string; blob: Blob }> = [];
  for (const group of groups) {
    const first = group[0];
    const escola = sanitizePathSegment(first.escola, "Escola");
    const path =
      format === "zip_escola"
        ? `${escola}.pdf`
        : `${escola}/${sanitizePathSegment(first.serie, "Serie")}.pdf`;
    entries.push({
      path,
      blob: await buildTermosPdfBlob(lote, group, nomeAplicacao, logo, onTermo),
    });
  }

  const suffix = format === "zip_escola" ? "por-escola" : "por-serie";
  return {
    blob: await generateZipBlob(entries),
    fileName: `termo-compromisso-${suffix}-${date}.zip`,
    totalTermos: total,
    totalArquivos: entries.length,
  };
}
