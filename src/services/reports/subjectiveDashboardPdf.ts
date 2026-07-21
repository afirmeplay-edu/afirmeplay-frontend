/**
 * PDF do Dashboard de Avaliações Subjetivas.
 * Desenho programático com jsPDF (cores fixas de tema claro — evita bugs de dark mode).
 * Layout alinhado à UI: KPIs, níveis SAEB, distribuição da rubrica e habilidades.
 */
import { loadCityBrandingForReportPdf } from "@/utils/pdfCityBranding";
import { SAEB_LEVELS, saebFromLevel } from "@/lib/subjectiveSaeb";
import type {
  SubjectiveDashboardResponse,
  SubjectiveDashboardPerQuestion,
} from "@/services/evaluation/subjectiveTestApi";

const C = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  borderLight: [229, 231, 235] as [number, number, number],
  bgLight: [250, 250, 250] as [number, number, number],
  bgCard: [255, 255, 255] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  mutedBar: [241, 245, 249] as [number, number, number],
};

const RUBRIC_RGB: Record<"SIM" | "PARCIAL" | "NAO" | "BRANCO", [number, number, number]> = {
  SIM: [34, 197, 94],
  PARCIAL: [234, 179, 8],
  NAO: [239, 68, 68],
  BRANCO: [148, 163, 184],
};

const SAEB_RGB: Record<string, [number, number, number]> = {
  abaixo: [220, 38, 38],
  basico: [245, 158, 11],
  adequado: [101, 163, 13],
  avancado: [22, 163, 74],
};

const SAEB_BG_RGB: Record<string, [number, number, number]> = {
  abaixo: [254, 226, 226],
  basico: [254, 243, 199],
  adequado: [236, 252, 203],
  avancado: [220, 252, 231],
};

const MARGIN = 14;
const TOP_BAND_H = 16;
const FOOTER_H = 12;

export type SubjectiveDashboardPdfMeta = {
  estado?: string;
  municipio?: string;
  municipioId?: string | null;
  escola?: string;
  serie?: string;
  turma?: string;
  avaliacaoTitulo?: string;
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return C.textDark;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function fmtNow(): string {
  return new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sanitizeFileName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "avaliacao-subjetiva";
}

function ensureSpace(
  doc: import("jspdf").jsPDF,
  y: number,
  needed: number,
  pageWidth: number,
  pageHeight: number,
  title: string
): number {
  if (y + needed <= pageHeight - FOOTER_H - 4) return y;
  doc.addPage();
  drawTopBand(doc, pageWidth, title);
  return MARGIN + TOP_BAND_H + 4;
}

function drawTopBand(doc: import("jspdf").jsPDF, pageWidth: number, title: string): void {
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, pageWidth, TOP_BAND_H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...C.white);
  const t = String(title || "").trim();
  if (t) doc.text(t.toUpperCase(), pageWidth / 2, 10.5, { align: "center" });
}

function addFooters(doc: import("jspdf").jsPDF, dataGeracao: string): void {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const footerTextY = pageHeight - 6;
    const lineY = pageHeight - 10;
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, lineY, pageWidth - MARGIN, lineY);
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textGray);
    doc.setFont("helvetica", "normal");
    doc.text("AfirmePlay: Sistema de Ensino e Avaliação", MARGIN, footerTextY);
    doc.text(`Página ${i} de ${n}`, pageWidth / 2, footerTextY, { align: "center" });
    doc.text(`Gerado em ${dataGeracao}`, pageWidth - MARGIN, footerTextY, { align: "right" });
  }
}

function drawRoundedRect(
  doc: import("jspdf").jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: [number, number, number],
  border: [number, number, number] = C.borderLight
): void {
  doc.setFillColor(...fill);
  doc.setDrawColor(...border);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");
}

function drawSectionTitle(
  doc: import("jspdf").jsPDF,
  title: string,
  subtitle: string | undefined,
  y: number
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C.textDark);
  doc.text(title, MARGIN, y);
  y += 5;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.textGray);
    doc.text(subtitle, MARGIN, y);
    y += 5;
  }
  return y;
}

function participationColor(pct: number): [number, number, number] {
  if (pct >= 60) return RUBRIC_RGB.SIM;
  if (pct >= 40) return RUBRIC_RGB.PARCIAL;
  return RUBRIC_RGB.NAO;
}

function buildDistribution(
  dash: SubjectiveDashboardResponse
): Array<{ key: "SIM" | "PARCIAL" | "NAO" | "BRANCO"; label: string; value: number; pct: number }> {
  const labels: Record<"SIM" | "PARCIAL" | "NAO" | "BRANCO", string> = {
    SIM: "SIM",
    PARCIAL: "PARCIAL",
    NAO: "NÃO",
    BRANCO: "BRANCO",
  };
  if (dash.distribution?.length) {
    return (["SIM", "PARCIAL", "NAO", "BRANCO"] as const).map((key) => {
      const found = dash.distribution.find((d) => {
        const n = (d.name || "").toUpperCase().replace("NÃO", "NAO");
        return n === key;
      });
      return {
        key,
        label: labels[key],
        value: found?.value ?? dash.totals?.[key] ?? 0,
        pct: found?.pct ?? 0,
      };
    });
  }
  const totals = dash.totals || { SIM: 0, PARCIAL: 0, NAO: 0, BRANCO: 0 };
  const total = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  return (["SIM", "PARCIAL", "NAO", "BRANCO"] as const).map((key) => ({
    key,
    label: labels[key],
    value: totals[key] || 0,
    pct: Math.round(((totals[key] || 0) / total) * 100),
  }));
}

function drawKpiCards(
  doc: import("jspdf").jsPDF,
  dash: SubjectiveDashboardResponse,
  y: number,
  pageWidth: number
): number {
  const kpis = dash.kpis;
  const hit = saebFromLevel(kpis.saeb_level, kpis.saeb_label);
  const gap = 4;
  const pad = 5;
  const contentW = pageWidth - MARGIN * 2;
  // 2x2: cards mais largos → fonte legível sem estourar a borda
  const cols = 2;
  const cardW = (contentW - gap) / cols;
  const innerW = cardW - pad * 2;
  const cardH = 28;

  const cards: Array<{
    label: string;
    value: string;
    sub?: string;
    valueColor?: [number, number, number];
  }> = [
    { label: "Alunos", value: String(kpis.total_students ?? 0) },
    {
      label: "Taxa de participacao",
      value: `${kpis.participation_pct ?? 0}%`,
      sub: `${kpis.respondents ?? 0} de ${kpis.total_students ?? 0} alunos`,
      valueColor: participationColor(Number(kpis.participation_pct) || 0),
    },
    { label: "Ausentes", value: String(kpis.absent ?? 0) },
    {
      label: "Indice de acerto",
      value: `${kpis.hit_rate_pct ?? 0}%`,
      sub: `${hit.label} · ${kpis.total_responses ?? 0} respostas`,
      valueColor: hexToRgb(hit.color),
    },
  ];

  cards.forEach((card, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN + col * (cardW + gap);
    const cy = y + row * (cardH + gap);
    drawRoundedRect(doc, x, cy, cardW, cardH, C.bgCard);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C.textGray);
    doc.text(card.label, x + pad, cy + 7);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...(card.valueColor || C.textDark));
    doc.text(card.value, x + pad, cy + 17);

    if (card.sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...C.textGray);
      const subLines = doc.splitTextToSize(card.sub, innerW);
      doc.text(subLines.slice(0, 1), x + pad, cy + 23);
    }
  });

  const rows = Math.ceil(cards.length / cols);
  return y + rows * cardH + (rows - 1) * gap + 8;
}

function saebRangeLabel(level: string, range: string): string {
  // Evita caracteres unicode (ex.: ≥) que o jsPDF renderiza mal.
  if (level === "avancado") return ">= 80%";
  if (level === "abaixo") return "< 40%";
  if (level === "basico") return "40-59%";
  if (level === "adequado") return "60-79%";
  return range.replace("–", "-").replace("≥", ">=");
}

function drawSaebLevels(
  doc: import("jspdf").jsPDF,
  dash: SubjectiveDashboardResponse,
  y: number,
  pageWidth: number
): number {
  y = drawSectionTitle(
    doc,
    "Niveis de Proficiencia",
    "Distribuicao das questoes por nivel de acerto",
    y
  );

  const counts = dash.saeb_levels || { abaixo: 0, basico: 0, adequado: 0, avancado: 0 };
  const total =
    (counts.abaixo || 0) + (counts.basico || 0) + (counts.adequado || 0) + (counts.avancado || 0) || 1;
  const gap = 4;
  const pad = 5;
  const contentW = pageWidth - MARGIN * 2;
  const cols = 2;
  const cardW = (contentW - gap) / cols;
  const innerW = cardW - pad * 2;
  const cardH = 30;

  SAEB_LEVELS.forEach((level, i) => {
    const count = counts[level.level] || 0;
    const pct = Math.round((count / total) * 100);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN + col * (cardW + gap);
    const cy = y + row * (cardH + gap);
    const bg = SAEB_BG_RGB[level.level] || C.bgLight;
    const fg = SAEB_RGB[level.level] || C.textDark;
    drawRoundedRect(doc, x, cy, cardW, cardH, bg, fg);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...fg);
    doc.text(level.label, x + pad, cy + 8);

    doc.setFontSize(18);
    doc.text(String(count), x + cardW - pad, cy + 9, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.textGray);
    doc.text(
      `${saebRangeLabel(level.level, level.range)} · ${pct}% das questoes`,
      x + pad,
      cy + 16
    );

    const barY = cy + cardH - 7;
    const barW = innerW;
    doc.setFillColor(...C.white);
    doc.roundedRect(x + pad, barY, barW, 3, 1, 1, "F");
    doc.setFillColor(...fg);
    if (pct > 0) {
      doc.roundedRect(x + pad, barY, Math.min(barW, Math.max(1, (barW * pct) / 100)), 3, 1, 1, "F");
    }
  });

  const rows = Math.ceil(SAEB_LEVELS.length / cols);
  return y + rows * cardH + (rows - 1) * gap + 8;
}

function drawDistributionChart(
  doc: import("jspdf").jsPDF,
  dash: SubjectiveDashboardResponse,
  y: number,
  pageWidth: number
): number {
  y = drawSectionTitle(doc, "Distribuição geral", "Quantidade e % por marcação", y);

  const dist = buildDistribution(dash);
  const maxVal = Math.max(...dist.map((d) => d.value), 1);
  const chartH = 42;
  const chartW = pageWidth - MARGIN * 2;
  const barGap = 8;
  const barW = (chartW - barGap * 5) / 4;
  const baseY = y + chartH;

  drawRoundedRect(doc, MARGIN, y, chartW, chartH + 12, C.bgLight);

  dist.forEach((d, i) => {
    const x = MARGIN + barGap + i * (barW + barGap);
    const h = (d.value / maxVal) * (chartH - 10);
    const barY = baseY - h;
    const color = RUBRIC_RGB[d.key];
    doc.setFillColor(...color);
    doc.roundedRect(x, barY, barW, Math.max(h, 0.8), 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C.textDark);
    doc.text(String(d.value), x + barW / 2, barY - 2, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.textGray);
    doc.text(d.label, x + barW / 2, baseY + 5, { align: "center" });
    doc.text(`${d.pct}%`, x + barW / 2, baseY + 9, { align: "center" });
  });

  return y + chartH + 18;
}

function drawQuestionRow(
  doc: import("jspdf").jsPDF,
  q: SubjectiveDashboardPerQuestion,
  y: number,
  pageWidth: number
): number {
  const contentW = pageWidth - MARGIN * 2;
  const info = saebFromLevel(q.saeb_level, q.saeb_label);
  const total = q.total || 1;
  const code = q.code || `Q${q.number}`;
  const skillLines = doc.splitTextToSize(q.skill_description || "—", contentW - 42);
  const skillH = Math.min(skillLines.length, 3) * 3.5;
  const rowH = Math.max(22, 10 + skillH + 10);

  drawRoundedRect(doc, MARGIN, y, contentW, rowH, C.bgCard);

  // badge código
  doc.setFillColor(...C.primary);
  doc.roundedRect(MARGIN + 2.5, y + 2.5, 14, 5.5, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...C.white);
  doc.text(code, MARGIN + 9.5, y + 6.2, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C.textDark);
  doc.text(skillLines.slice(0, 3), MARGIN + 19, y + 6.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...hexToRgb(info.color));
  doc.text(`${q.hit_rate_pct}%`, pageWidth - MARGIN - 3, y + 7, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...C.textGray);
  doc.text(info.label, pageWidth - MARGIN - 3, y + 11, { align: "right" });

  // stacked bar
  const barY = y + rowH - 9;
  const barW = contentW - 6;
  const barX = MARGIN + 3;
  doc.setFillColor(...C.mutedBar);
  doc.roundedRect(barX, barY, barW, 2.8, 1, 1, "F");
  let cursor = barX;
  (["SIM", "PARCIAL", "NAO", "BRANCO"] as const).forEach((k) => {
    const pct = ((q[k] || 0) / total) * 100;
    const w = (barW * pct) / 100;
    if (w <= 0) return;
    doc.setFillColor(...RUBRIC_RGB[k]);
    doc.rect(cursor, barY, w, 2.8, "F");
    cursor += w;
  });

  doc.setFontSize(6);
  doc.setTextColor(...C.textGray);
  const legend = [
    `Sim ${q.SIM} (${Math.round((q.SIM / total) * 100)}%)`,
    `Parcial ${q.PARCIAL} (${Math.round((q.PARCIAL / total) * 100)}%)`,
    `Não ${q.NAO} (${Math.round((q.NAO / total) * 100)}%)`,
    `Branco ${q.BRANCO} (${Math.round((q.BRANCO / total) * 100)}%)`,
  ].join("   ");
  doc.text(legend, barX, barY + 6.5);

  return y + rowH + 3;
}

/**
 * Gera e baixa o PDF do dashboard de avaliação subjetiva.
 * Cores sempre em tema claro (independente do tema da UI).
 */
export async function generateSubjectiveDashboardPdf(
  dash: SubjectiveDashboardResponse,
  meta: SubjectiveDashboardPdfMeta = {}
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const dataGeracao = fmtNow();
  const title = "Análise de Avaliações Subjetivas";
  const avaliacaoTitulo =
    meta.avaliacaoTitulo?.trim() || dash.subjective_test?.title || "Avaliação subjetiva";

  const branding = await loadCityBrandingForReportPdf(meta.municipioId || null);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Fundo branco explícito (tema claro)
  doc.setFillColor(...C.white);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  drawTopBand(doc, pageWidth, title);

  let y = MARGIN + TOP_BAND_H + 4;

  // Logo do município centralizado no topo (abaixo da faixa).
  if (branding.logo?.dataUrl) {
    let logoW = 32;
    let logoH = (branding.logo.ih * logoW) / Math.max(branding.logo.iw, 1);
    if (logoH > 32) {
      logoH = 32;
      logoW = (branding.logo.iw * logoH) / Math.max(branding.logo.ih, 1);
    }
    doc.addImage(
      branding.logo.dataUrl,
      "PNG",
      (pageWidth - logoW) / 2,
      y,
      logoW,
      logoH
    );
    y += logoH + 6;
  }

  const textMaxW = pageWidth - MARGIN * 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C.textDark);
  const titleLines = doc.splitTextToSize(avaliacaoTitulo, textMaxW);
  doc.text(titleLines, pageWidth / 2, y + 4, { align: "center" });
  y += titleLines.length * 5 + 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C.textGray);
  const metaLines = [
    meta.estado ? `Estado: ${meta.estado}` : null,
    meta.municipio ? `Município: ${meta.municipio}` : null,
    meta.escola ? `Escola: ${meta.escola}` : null,
    meta.serie ? `Série: ${meta.serie}` : null,
    meta.turma ? `Turma: ${meta.turma}` : null,
    dash.subjective_test?.test_type ? `Tipo: ${dash.subjective_test.test_type}` : null,
  ].filter(Boolean) as string[];

  for (const line of metaLines) {
    const wrapped = doc.splitTextToSize(line, textMaxW);
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 4 + 1.2;
  }

  y += 2;
  doc.setDrawColor(...C.borderLight);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 8;

  y = drawKpiCards(doc, dash, y, pageWidth);
  y = ensureSpace(doc, y, 85, pageWidth, pageHeight, title);
  y = drawSaebLevels(doc, dash, y, pageWidth);
  y = ensureSpace(doc, y, 70, pageWidth, pageHeight, title);
  y = drawDistributionChart(doc, dash, y, pageWidth);

  y = ensureSpace(doc, y, 30, pageWidth, pageHeight, title);
  y = drawSectionTitle(
    doc,
    "Questões / Habilidades avaliadas",
    "Desempenho por habilidade (rubrica SIM / PARCIAL / NÃO / BRANCO)",
    y
  );

  const questions = dash.per_question || [];
  if (questions.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C.textGray);
    doc.text("Sem dados para exibir.", MARGIN, y);
  } else {
    for (const q of questions) {
      y = ensureSpace(doc, y, 28, pageWidth, pageHeight, title);
      y = drawQuestionRow(doc, q, y, pageWidth);
    }
  }

  addFooters(doc, dataGeracao);

  const fileName = `analise-subjetiva-${sanitizeFileName(avaliacaoTitulo)}-${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(fileName);
}

export default generateSubjectiveDashboardPdf;
