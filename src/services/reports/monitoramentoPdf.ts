/**
 * PDF de Monitoramento Pedagógico — capa, KPIs, consolidado por período,
 * tabela por escola (retrato) e detalhamento por aluno (paisagem).
 * Identidade visual alinhada ao ranking e relatórios institucionais.
 */
import { jsPDF } from "jspdf";
import type { CellHookData, UserOptions } from "jspdf-autotable";
import { urlToPngAsset } from "@/utils/pdfCityBranding";
import type { MonitoringReportData, MonitoringSchoolItem } from "@/services/monitoramento/monitoramentoApi";
import {
  normalizeProficiencyLevelLabel,
  type ReportProficiencyLabel,
} from "@/utils/report/reportTagStyles";

const C = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  borderLight: [229, 231, 235] as [number, number, number],
  bgLight: [250, 250, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  criticalBg: [254, 242, 242] as [number, number, number],
};

const fmtNow = () =>
  new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const fmtPt = (value: unknown, digits = 1) => Number(value || 0).toFixed(digits).replace(".", ",");

const fmtDate = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Date(value.slice(0, 10)).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
};

const fmtStatus = (status?: string | null) => {
  switch (status) {
    case "sendo_realizada":
      return "Sendo realizada";
    case "nao_realizado":
      return "Não realizado";
    default:
      return "Pendente";
  }
};

const scaledSize = (iw: number, ih: number, desiredW: number) => {
  if (iw <= 0 || ih <= 0) return { w: desiredW, h: desiredW * 0.3 };
  return { w: desiredW, h: (ih * desiredW) / iw };
};

const borderFromFill = (fill: [number, number, number]): [number, number, number] => {
  const [r, g, b] = fill;
  return [Math.max(0, r - 35), Math.max(0, g - 35), Math.max(0, b - 35)];
};

const proficiencyTagStyles = (level: ReportProficiencyLabel) => {
  switch (level) {
    case "Avançado":
      return { fill: [167, 243, 208] as [number, number, number], text: [6, 78, 59] as [number, number, number] };
    case "Adequado":
      return { fill: [209, 250, 229] as [number, number, number], text: [22, 101, 52] as [number, number, number] };
    case "Básico":
      return { fill: [254, 249, 195] as [number, number, number], text: [113, 63, 18] as [number, number, number] };
    case "Abaixo do Básico":
    default:
      return { fill: [254, 226, 226] as [number, number, number], text: [153, 27, 27] as [number, number, number] };
  }
};

const statusTagStyles = (status: string) => {
  switch (status) {
    case "sendo_realizada":
      return { fill: [254, 249, 195] as [number, number, number], text: [113, 63, 18] as [number, number, number] };
    case "nao_realizado":
      return { fill: [254, 226, 226] as [number, number, number], text: [153, 27, 27] as [number, number, number] };
    default:
      return { fill: [243, 244, 246] as [number, number, number], text: [75, 85, 99] as [number, number, number] };
  }
};

const ensurePageSpace = (doc: jsPDF, y: number, needed: number, margin: number) => {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed <= pageH - 20) return y;
  doc.addPage();
  return margin + 4;
};

const addFootersAllPages = (doc: jsPDF) => {
  const total = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textGray);
    doc.setFont("helvetica", "normal");
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
    doc.text("Afirme Play Soluções Educativas", margin, pageH - 9);
    doc.text(`Página ${i} de ${total}`, pageW / 2, pageH - 9, { align: "center" });
    doc.text(fmtNow(), pageW - margin, pageH - 9, { align: "right" });
  }
};

const drawFiltersCard = (doc: jsPDF, margin: number, pageW: number, titleY: number, filterLines: string[]) => {
  const cardPad = 5;
  const innerW = pageW - 2 * margin;
  const lineGap = 4.2;
  const titleLineH = 6;
  const bodyH = filterLines.reduce((acc, line) => {
    const wrapped = doc.splitTextToSize(line, innerW - 18 - cardPad * 2) as string[];
    return acc + wrapped.length * lineGap;
  }, 0);
  const cardH = titleLineH + bodyH + cardPad * 2 + 4;
  const yTop = titleY;

  doc.setFillColor(...C.white);
  doc.rect(margin, yTop, innerW, cardH, "F");
  doc.setFillColor(...C.primary);
  doc.rect(margin, yTop, 3.5, cardH, "F");
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.35);
  doc.rect(margin, yTop, innerW, cardH, "S");

  let cy = yTop + cardPad + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...C.primary);
  doc.text("Filtros aplicados", margin + 10, cy);
  cy += titleLineH + 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C.textDark);
  for (const line of filterLines) {
    const wrapped = doc.splitTextToSize(line, innerW - 18 - cardPad * 2) as string[];
    doc.text(wrapped, margin + 10, cy);
    cy += wrapped.length * lineGap;
  }

  return yTop + cardH + 10;
};

type KpiCardItem = {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "critical" | "primary";
};

const drawKpiCards = (doc: jsPDF, margin: number, pageW: number, startY: number, items: KpiCardItem[]) => {
  if (!items.length) return startY;
  const cols = 4;
  const gap = 4;
  const cardW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
  let y = startY;

  for (let idx = 0; idx < items.length; idx += cols) {
    const rowItems = items.slice(idx, idx + cols);
    const measured = rowItems.map((item) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      const labelLines = doc.splitTextToSize(item.label, cardW - 6) as string[];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.8);
      const valueLines = doc.splitTextToSize(item.value, cardW - 6) as string[];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      const hintLines = item.hint ? (doc.splitTextToSize(item.hint, cardW - 6) as string[]) : [];
      const height = 8 + labelLines.length * 3.2 + valueLines.length * 4.1 + hintLines.length * 3 + 4;
      return { item, labelLines, valueLines, hintLines, height: Math.max(22, height) };
    });
    const rowHeight = Math.max(...measured.map((m) => m.height));
    y = ensurePageSpace(doc, y, rowHeight + 2, margin);

    measured.forEach((m, col) => {
      const x = margin + col * (cardW + gap);
      const tone = m.item.tone ?? "default";
      if (tone === "critical") doc.setFillColor(255, 241, 242);
      else if (tone === "primary") doc.setFillColor(245, 243, 255);
      else doc.setFillColor(...C.bgLight);
      doc.setDrawColor(...C.borderLight);
      doc.setLineWidth(0.25);
      doc.roundedRect(x, y, cardW, rowHeight, 1.8, 1.8, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      if (tone === "critical") doc.setTextColor(127, 29, 29);
      else doc.setTextColor(...C.textGray);
      doc.text(m.labelLines, x + 3, y + 5);

      let ty = y + 5 + m.labelLines.length * 3.2 + 1;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.textDark);
      doc.setFontSize(9.8);
      doc.text(m.valueLines, x + 3, ty);
      ty += m.valueLines.length * 4.1 + 1;

      if (m.hintLines.length) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textGray);
        doc.setFontSize(6.8);
        doc.text(m.hintLines, x + 3, ty);
      }
    });
    y += rowHeight + gap;
  }
  return y + 2;
};

const drawProgressBar = (
  doc: jsPDF,
  margin: number,
  pageW: number,
  startY: number,
  label: string,
  pct: number
) => {
  const innerW = pageW - margin * 2;
  const barH = 5;
  let y = ensurePageSpace(doc, startY, 16, margin);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C.textDark);
  doc.text(label, margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.textGray);
  doc.text(`${pct}%`, pageW - margin, y, { align: "right" });
  y += 4;

  doc.setFillColor(...C.borderLight);
  doc.roundedRect(margin, y, innerW, barH, 2, 2, "F");
  const fillW = Math.max(0, Math.min(innerW, (innerW * pct) / 100));
  if (fillW > 0) {
    doc.setFillColor(...C.primary);
    doc.roundedRect(margin, y, fillW, barH, 2, 2, "F");
  }
  return y + barH + 8;
};

const drawLevelDistribution = (
  doc: jsPDF,
  margin: number,
  pageW: number,
  startY: number,
  totals: { abaixo: number; basico: number; adequado: number; avancado: number }
) => {
  const innerW = pageW - margin * 2;
  const chartH = 42;
  const y = ensurePageSpace(doc, startY, chartH + 6, margin);

  doc.setFillColor(...C.white);
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, innerW, chartH, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C.textDark);
  doc.text("Distribuição por níveis de aprendizagem", margin + 4, y + 6);

  const levels: Array<{ label: string; value: number; color: [number, number, number] }> = [
    { label: "Abaixo", value: totals.abaixo, color: [239, 68, 68] },
    { label: "Básico", value: totals.basico, color: [245, 158, 11] },
    { label: "Adequado", value: totals.adequado, color: [124, 62, 237] },
    { label: "Avançado", value: totals.avancado, color: [16, 185, 129] },
  ];
  const maxVal = Math.max(1, ...levels.map((l) => l.value));
  const barAreaW = innerW - 16;
  const barW = barAreaW / levels.length;
  const baseY = y + chartH - 8;

  levels.forEach((level, i) => {
    const bx = margin + 8 + i * barW;
    const bh = (level.value / maxVal) * 24;
    doc.setFillColor(...level.color);
    doc.roundedRect(bx + 4, baseY - bh, barW - 8, bh, 1.2, 1.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...C.textDark);
    doc.text(String(level.value), bx + barW / 2, baseY - bh - 2, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textGray);
    doc.text(level.label, bx + barW / 2, y + chartH - 2, { align: "center" });
  });

  return y + chartH + 8;
};

const drawSectionHeader = (
  doc: jsPDF,
  margin: number,
  pageW: number,
  y: number,
  sectionNumber: string,
  title: string,
  subtitle?: string
) => {
  const innerW = pageW - margin * 2;
  const headerH = subtitle ? 16 : 12;
  doc.setFillColor(...C.primary);
  doc.roundedRect(margin, y, innerW, headerH, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(230, 220, 255);
  doc.text(`SEÇÃO ${sectionNumber}`, margin + 4, y + 4.8);
  doc.setFontSize(11.5);
  doc.setTextColor(...C.white);
  doc.text(title, margin + 4, y + (subtitle ? 9.5 : 9));
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(235, 230, 255);
    const subLines = doc.splitTextToSize(subtitle, innerW - 8) as string[];
    doc.text(subLines, margin + 4, y + 12.8);
  }
  return y + headerH + 7;
};

const drawClassificationLegend = (doc: jsPDF, margin: number, pageW: number, startY: number) => {
  const levels: ReportProficiencyLabel[] = ["Avançado", "Adequado", "Básico", "Abaixo do Básico"];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.textGray);
  doc.text("Níveis de aprendizagem:", margin, startY);

  let x = margin;
  const yChip = startY + 5;
  const chipH = 4.8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);

  for (const level of levels) {
    const { fill, text } = proficiencyTagStyles(level);
    const labelShort = level === "Abaixo do Básico" ? "Abaixo bás." : level;
    const chipW = doc.getTextWidth(labelShort) + 8;
    doc.setFillColor(...fill);
    doc.setDrawColor(...borderFromFill(fill));
    doc.setLineWidth(0.2);
    doc.rect(x, yChip, chipW, chipH, "FD");
    doc.setTextColor(...text);
    doc.text(labelShort, x + 2.2, yChip + chipH / 2 + 1.35);
    x += chipW + 6;
  }
  return yChip + chipH + 8;
};

const drawStatusLegend = (doc: jsPDF, margin: number, startY: number) => {
  const items = [
    { label: "Pendente", status: "pendente" },
    { label: "Sendo realizada", status: "sendo_realizada" },
    { label: "Não realizado", status: "nao_realizado" },
  ];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.textGray);
  doc.text("Status das ações:", margin, startY);

  let x = margin;
  const yChip = startY + 5;
  const chipH = 4.8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);

  for (const item of items) {
    const { fill, text } = statusTagStyles(item.status);
    const chipW = doc.getTextWidth(item.label) + 8;
    doc.setFillColor(...fill);
    doc.setDrawColor(...borderFromFill(fill));
    doc.setLineWidth(0.2);
    doc.rect(x, yChip, chipW, chipH, "FD");
    doc.setTextColor(...text);
    doc.text(item.label, x + 2.2, yChip + chipH / 2 + 1.35);
    x += chipW + 6;
  }
  return yChip + chipH + 8;
};

const computeLevelTotals = (schools: MonitoringSchoolItem[]) =>
  schools.reduce(
    (acc, s) => ({
      abaixo: acc.abaixo + s.abaixo_basico,
      basico: acc.basico + s.basico,
      adequado: acc.adequado + s.adequado,
      avancado: acc.avancado + s.avancado,
    }),
    { abaixo: 0, basico: 0, adequado: 0, avancado: 0 }
  );

const buildDefaultFilterLines = (payload: MonitoringReportData, periodicidade: string) => {
  const f = payload.filtros_aplicados || {};
  const tipo =
    f.tipo_origem === "cartao_resposta" ? "Cartão-resposta" : "Avaliação online";
  const lines = [
    `Tipo de origem: ${tipo}`,
    `Periodicidade do relatório: ${periodicidade === "semanal" ? "Semanal" : "Mensal"}`,
  ];
  if (payload.metadata.periodo_referencia) {
    lines.push(`Período de referência: ${payload.metadata.periodo_referencia}`);
  }
  if (f.estado) lines.push(`Estado: ${f.estado}`);
  if (f.municipio) lines.push(`Município: ${f.municipio}`);
  if (f.escola_id) lines.push(`Escola: ${f.escola_id}`);
  if (f.disciplina) lines.push(`Disciplina: ${f.disciplina}`);
  if (f.coordenador_id) lines.push(`Coordenador (editor): ${f.coordenador_id}`);
  lines.push(`Gerado em: ${fmtNow()}`);
  if (payload.metadata.usuario_gerador) {
    lines.push(`Usuário: ${payload.metadata.usuario_gerador}`);
  }
  return lines;
};

async function addMonitoringCoverPage(
  doc: jsPDF,
  title: string,
  periodicidade: "semanal" | "mensal",
  cardLines: Array<{ label: string; value: string }>
) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const centerX = pageW / 2;
  const BAND_H = 62;

  doc.setFillColor(...C.white);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, pageW, BAND_H, "F");
  doc.setFillColor(...C.white);
  doc.setLineWidth(0.15);
  doc.setDrawColor(255, 255, 255);
  doc.line(18, BAND_H - 1, pageW - 18, BAND_H - 1);

  let logoBottomInBand = 0;
  const logoAsset = await urlToPngAsset("/LOGO-1.png");
  if (logoAsset?.dataUrl && logoAsset.iw > 0 && logoAsset.ih > 0) {
    const { w, h } = scaledSize(logoAsset.iw, logoAsset.ih, 40);
    doc.addImage(logoAsset.dataUrl, "PNG", centerX - w / 2, 8, w, h);
    logoBottomInBand = 8 + h;
  } else {
    doc.setFontSize(18);
    doc.setTextColor(...C.white);
    doc.setFont("helvetica", "bold");
    doc.text("AFIRME PLAY", centerX, 24, { align: "center" });
    logoBottomInBand = 30;
  }

  const titleY = Math.max(logoBottomInBand + 6, BAND_H - 16);
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("MONITORAMENTO PEDAGÓGICO", centerX, titleY, { align: "center" });
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "normal");
  doc.text(title, centerX, titleY + 7, { align: "center" });

  let y = BAND_H + 14;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.textGray);
  doc.text("SECRETARIA MUNICIPAL DE EDUCAÇÃO", centerX, y, { align: "center" });
  y += 14;

  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.textDark);
  doc.text("PLANO DE AÇÃO", centerX, y, { align: "center" });
  y += 12;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.primary);
  const sub = `Relatório ${periodicidade === "semanal" ? "semanal" : "mensal"} de acompanhamento pedagógico`;
  doc.text(sub, centerX, y, { align: "center" });
  y += 18;

  const cardW = pageW - 72;
  const cardX = (pageW - cardW) / 2;
  const rowH = 7;
  let cardEstimateH = 28;
  for (const { value } of cardLines) {
    const wrapped = doc.splitTextToSize(value, cardW - 74) as string[];
    cardEstimateH += Math.max(rowH, wrapped.length * 4.8);
  }
  const cardH = Math.max(cardEstimateH, 72);

  doc.setFillColor(...C.bgLight);
  doc.rect(cardX, y, cardW, cardH, "F");
  doc.setFillColor(...C.primary);
  doc.rect(cardX, y, 5, cardH, "F");
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.35);
  doc.rect(cardX, y, cardW, cardH, "S");

  let cy = y + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C.primary);
  doc.text("INFORMAÇÕES DO RECORTE", cardX + 12, cy);
  cy += 8;

  for (const { label, value } of cardLines) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textGray);
    doc.text(label, cardX + 12, cy);
    cy += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C.textDark);
    const wrapped = doc.splitTextToSize(value || "—", cardW - 74) as string[];
    doc.text(wrapped, cardX + 12, cy);
    cy += Math.max(rowH, wrapped.length * 4.8) + 2;
  }
}

const drawSignaturesBlock = (doc: jsPDF, payload: MonitoringReportData) => {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const sigY = pageH - 42;
  const colW = (pageW - margin * 2 - 12) / 3;

  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.25);
  for (let i = 0; i < 3; i++) {
    const x = margin + i * (colW + 6);
    doc.line(x, sigY, x + colW, sigY);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C.textGray);
  doc.text(payload.assinaturas.professor_label || "Assinatura Professor(a)", margin, sigY + 5);
  doc.text(
    payload.assinaturas.coordenador_label || "Assinatura Coordenador(a)",
    margin + colW + 6,
    sigY + 5
  );
  doc.text(payload.assinaturas.semed_label || "Assinatura SEMED", margin + (colW + 6) * 2, sigY + 5);
};

const applyProficiencyCellStyle = (hookData: CellHookData, rawLevel: string) => {
  const level = normalizeProficiencyLevelLabel(rawLevel);
  const { fill, text } = proficiencyTagStyles(level);
  hookData.cell.styles.fillColor = fill;
  hookData.cell.styles.textColor = text;
  hookData.cell.styles.fontStyle = "bold";
  hookData.cell.styles.fontSize = 7.2;
};

const applyStatusCellStyle = (hookData: CellHookData, rawStatus: string) => {
  const { fill, text } = statusTagStyles(rawStatus);
  hookData.cell.styles.fillColor = fill;
  hookData.cell.styles.textColor = text;
  hookData.cell.styles.fontStyle = "bold";
  hookData.cell.styles.fontSize = 7;
};

export async function generateMonitoringPdf(opts: {
  payload: MonitoringReportData;
  periodicidade: "semanal" | "mensal";
  title: string;
  filterLines?: string[];
  coverCardLines?: Array<{ label: string; value: string }>;
}): Promise<void> {
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 15;

  const resumo = opts.payload.resumo_geral;
  const acoesPct =
    resumo.total_alunos > 0 ? Math.round((resumo.total_acoes / resumo.total_alunos) * 100) : 0;
  const vistosPct =
    resumo.total_alunos > 0 ? Math.round((resumo.total_vistos_semed / resumo.total_alunos) * 100) : 0;
  const levelTotals = computeLevelTotals(opts.payload.tabela_escolas);

  const defaultCoverLines: Array<{ label: string; value: string }> = [
    {
      label: "PERIODICIDADE",
      value: opts.periodicidade === "semanal" ? "Semanal" : "Mensal",
    },
    {
      label: "TIPO",
      value:
        opts.payload.filtros_aplicados?.tipo_origem === "cartao_resposta"
          ? "Cartão-resposta"
          : "Avaliação online",
    },
    {
      label: "PERÍODO",
      value: opts.payload.metadata.periodo_referencia || "Não informado",
    },
    {
      label: "ALUNOS NO RECORTE",
      value: `${resumo.total_alunos} aluno(s) · ${resumo.total_escolas} escola(s)`,
    },
  ];

  await addMonitoringCoverPage(
    doc,
    opts.title,
    opts.periodicidade,
    opts.coverCardLines?.length ? opts.coverCardLines : defaultCoverLines
  );

  doc.addPage();
  let pageW = doc.internal.pageSize.getWidth();
  let y = 16;

  const filterLines = opts.filterLines?.length
    ? opts.filterLines
    : buildDefaultFilterLines(opts.payload, opts.periodicidade);
  y = drawFiltersCard(doc, margin, pageW, y, filterLines);

  y = drawKpiCards(doc, margin, pageW, y, [
    { label: "Escolas", value: String(resumo.total_escolas), tone: "primary" },
    { label: "Alunos monitorados", value: String(resumo.total_alunos) },
    {
      label: "Ações registradas",
      value: String(resumo.total_acoes),
      hint: `${acoesPct}% do total`,
      tone: "primary",
    },
    {
      label: "Vistos pela SEMED",
      value: String(resumo.total_vistos_semed),
      hint: `${vistosPct}% do total`,
    },
  ]);

  y = drawProgressBar(doc, margin, pageW, y, "Progresso geral de execução das ações pedagógicas", acoesPct);
  y = drawLevelDistribution(doc, margin, pageW, y, levelTotals);

  const periodEntries = Object.entries(opts.payload.agrupado_periodo || {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  if (periodEntries.length) {
    y = ensurePageSpace(doc, y, 40, margin);
    y = drawSectionHeader(
      doc,
      margin,
      pageW,
      y,
      "01",
      "Consolidado por período",
      opts.periodicidade === "semanal" ? "Agrupamento semanal (ISO)" : "Agrupamento mensal"
    );

    autoTable(doc, {
      startY: y,
      head: [["Período", "Ações", "Feitas pela escola", "Vistos SEMED"]],
      body: periodEntries.map(([period, values]) => [
        period,
        String(values.acoes),
        String(values.feitas_escola),
        String(values.vistos_semed),
      ]),
      theme: "striped",
      margin: { left: margin, right: margin, bottom: 18 },
      tableWidth: pageW - margin * 2,
      headStyles: {
        fillColor: C.primary,
        textColor: C.white,
        fontStyle: "bold",
        fontSize: 8.2,
        halign: "center",
      },
      bodyStyles: {
        fontSize: 8,
        lineColor: C.borderLight,
        lineWidth: 0.12,
        textColor: C.textDark,
      },
      columnStyles: {
        0: { cellWidth: 42, halign: "left", fontStyle: "bold" },
        1: { cellWidth: 24, halign: "center" },
        2: { cellWidth: 38, halign: "center" },
        3: { cellWidth: 38, halign: "center" },
      },
    } as UserOptions);

    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 10;
  }

  y = ensurePageSpace(doc, y, 50, margin);
  y = drawSectionHeader(
    doc,
    margin,
    pageW,
    y,
    "02",
    "Monitoramento por escola",
    "Visão SEMED agregada — linhas destacadas: ≥20% em Abaixo do Básico"
  );
  y = drawClassificationLegend(doc, margin, pageW, y);

  const schoolsHead = [["Escola", "Alunos", "Abaixo", "Básico", "Adequado", "Avançado", "Ações", "SEMED"]];
  const schoolsBody = opts.payload.tabela_escolas.map((row) => [
    row.escola_nome,
    String(row.total_alunos),
    String(row.abaixo_basico),
    String(row.basico),
    String(row.adequado),
    String(row.avancado),
    `${row.acoes_realizadas}/${row.total_alunos}`,
    `${row.vistos_semed}/${row.total_alunos}`,
  ]);

  autoTable(doc, {
    startY: y,
    head: schoolsHead,
    body: schoolsBody.length ? schoolsBody : [["Sem dados no recorte", "-", "-", "-", "-", "-", "-", "-"]],
    theme: "striped",
    showHead: "everyPage",
    margin: { left: margin, right: margin, bottom: 18 },
    tableWidth: pageW - margin * 2,
    headStyles: {
      fillColor: C.primary,
      textColor: C.white,
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
    },
    bodyStyles: {
      fontSize: 7.6,
      lineColor: C.borderLight,
      lineWidth: 0.12,
      textColor: C.textDark,
      valign: "middle",
    },
    alternateRowStyles: { fillColor: [253, 252, 254] },
    columnStyles: {
      0: { cellWidth: 54, halign: "left" },
      1: { cellWidth: 14, halign: "center", fontStyle: "bold" },
      2: { cellWidth: 16, halign: "center" },
      3: { cellWidth: 14, halign: "center" },
      4: { cellWidth: 16, halign: "center" },
      5: { cellWidth: 16, halign: "center" },
      6: { cellWidth: 18, halign: "center" },
      7: { cellWidth: 18, halign: "center" },
    },
    didParseCell: (hookData) => {
      if (hookData.section !== "body" || !schoolsBody.length) return;
      const school = opts.payload.tabela_escolas[hookData.row.index];
      if (!school) return;
      const pctAbaixo = school.total_alunos ? (school.abaixo_basico / school.total_alunos) * 100 : 0;
      if (pctAbaixo >= 20) {
        hookData.cell.styles.fillColor = C.criticalBg;
      }
      if (hookData.column.index === 2 && school.abaixo_basico > 0) {
        hookData.cell.styles.textColor = [185, 28, 28];
        hookData.cell.styles.fontStyle = "bold";
      }
    },
  } as UserOptions);

  doc.addPage("a4", "landscape");
  pageW = doc.internal.pageSize.getWidth();
  y = 16;

  y = drawSectionHeader(
    doc,
    margin,
    pageW,
    y,
    "03",
    "Detalhamento por aluno",
    "Ações pedagógicas, responsáveis, prazos e registros de acompanhamento"
  );
  y = drawStatusLegend(doc, margin, y);

  const studentsHead = [[
    "Aluno",
    "Série / Turma",
    "Nota",
    "Prof.",
    "Nível",
    "Descritores críticos",
    "Ação pedagógica",
    "Responsável",
    "Prazo",
    "Status",
    "Realizada em",
    "Esc.",
    "SEMED",
  ]];

  const studentsBody = opts.payload.tabela_alunos.map((row) => [
    row.aluno_nome,
    `${row.serie || "—"} · ${row.turma || "—"}`,
    fmtPt(row.nota),
    fmtPt(row.proficiencia),
    row.nivel,
    (row.descritores_criticos || []).join(", ") || "—",
    row.acao_pedagogica || "—",
    row.responsavel_nome || "—",
    fmtDate(row.prazo),
    fmtStatus(row.status),
    fmtDate(row.realizada_em),
    row.feita_pela_escola ? "Sim" : "Não",
    row.vista_pela_semed ? "Sim" : "Não",
  ]);

  autoTable(doc, {
    startY: y,
    head: studentsHead,
    body: studentsBody.length ? studentsBody : [["Sem dados", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"]],
    theme: "striped",
    showHead: "everyPage",
    margin: { left: margin, right: margin, bottom: 32 },
    tableWidth: pageW - margin * 2,
    headStyles: {
      fillColor: C.primary,
      textColor: C.white,
      fontStyle: "bold",
      fontSize: 7.2,
      halign: "center",
      cellPadding: { top: 4, bottom: 4, left: 2, right: 2 },
    },
    bodyStyles: {
      fontSize: 6.8,
      lineColor: C.borderLight,
      lineWidth: 0.12,
      textColor: C.textDark,
      valign: "top",
      overflow: "linebreak",
      cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
    },
    alternateRowStyles: { fillColor: [253, 252, 254] },
    columnStyles: {
      0: { cellWidth: 34 },
      1: { cellWidth: 24 },
      2: { cellWidth: 10, halign: "right", fontStyle: "bold", textColor: C.primary },
      3: { cellWidth: 10, halign: "right", fontStyle: "bold", textColor: C.primary },
      4: { cellWidth: 20, halign: "center" },
      5: { cellWidth: 28 },
      6: { cellWidth: 42 },
      7: { cellWidth: 22 },
      8: { cellWidth: 14, halign: "center" },
      9: { cellWidth: 18, halign: "center" },
      10: { cellWidth: 14, halign: "center" },
      11: { cellWidth: 9, halign: "center" },
      12: { cellWidth: 10, halign: "center" },
    },
    didParseCell: (hookData) => {
      if (hookData.section !== "body" || !studentsBody.length) return;
      const row = opts.payload.tabela_alunos[hookData.row.index];
      if (!row) return;

      const level = normalizeProficiencyLevelLabel(row.nivel);
      if (level === "Abaixo do Básico") {
        hookData.cell.styles.fillColor = C.criticalBg;
      }
      if (hookData.column.index === 4) {
        applyProficiencyCellStyle(hookData, row.nivel);
      }
      if (hookData.column.index === 9) {
        applyStatusCellStyle(hookData, row.status || "pendente");
      }
      if (hookData.column.index === 11 && row.feita_pela_escola) {
        hookData.cell.styles.textColor = [22, 101, 52];
        hookData.cell.styles.fontStyle = "bold";
      }
      if (hookData.column.index === 12 && row.vista_pela_semed) {
        hookData.cell.styles.textColor = [22, 101, 52];
        hookData.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: () => {
      drawSignaturesBlock(doc, opts.payload);
    },
  } as UserOptions);

  addFootersAllPages(doc);

  const safeTitle = opts.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s\-_]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

  doc.save(`monitoramento-${safeTitle || opts.periodicidade}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
