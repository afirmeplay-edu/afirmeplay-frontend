/**
 * PDF de Detalhamento de Alunos — exporta a tabela do modal de monitoramento
 * com layout idêntico ao visualizado na tela.
 * Identidade visual alinhada aos relatórios de monitoramento do sistema.
 */
import { jsPDF } from "jspdf";
import type { CellHookData, UserOptions } from "jspdf-autotable";
import { loadCityBrandingForReportPdf } from "@/utils/pdfCityBranding";
import type { MonitoringStudentItem } from "@/services/monitoramento/monitoramentoApi";
import { getClassShiftLabel } from "@/lib/classShift";
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
    case "realizada":
      return "Realizada";
    case "sendo_realizada":
      return "Em andamento";
    case "nao_realizado":
      return "Não realizada";
    default:
      return "Pendente";
  }
};

const formatMonitoringCriticosResumo = (row: MonitoringStudentItem) => {
  const blocks = row.disciplinas_criticas ?? [];
  if (blocks.length) {
    return blocks
      .map((block) => {
        const disciplina = block.disciplina?.trim() || "Geral";
        const crit = (block.descritores_criticos ?? []).filter(Boolean).join(", ");
        if (crit) return `${disciplina}: ${crit}`;
        return `${disciplina} (${block.nivel})`;
      })
      .join(" · ");
  }
  return (row.descritores_criticos ?? []).filter(Boolean).join(", ");
};

const scaledSize = (iw: number, ih: number, desiredW: number) => {
  if (iw <= 0 || ih <= 0) return { w: desiredW, h: desiredW * 0.3 };
  return { w: desiredW, h: (ih * desiredW) / iw };
};

type ColumnStyle = { cellWidth?: number; [key: string]: unknown };

const scaleColumnWidths = (
  columnStyles: Record<number, ColumnStyle>,
  availableWidth: number
): Record<number, ColumnStyle> => {
  const entries = Object.entries(columnStyles);
  const sum = entries.reduce((acc, [, style]) => acc + (style.cellWidth ?? 0), 0);
  if (sum <= 0 || sum <= availableWidth) return columnStyles;
  const factor = availableWidth / sum;
  return Object.fromEntries(
    entries.map(([key, style]) => [
      key,
      { ...style, cellWidth: (style.cellWidth ?? 0) * factor },
    ])
  );
};

const borderFromFill = (fill: [number, number, number]): [number, number, number] => {
  const [r, g, b] = fill;
  return [Math.max(0, r - 35), Math.max(0, g - 35), Math.max(0, b - 35)];
};

const proficiencyTagStyles = (level: ReportProficiencyLabel) => {
  switch (level) {
    case "Avançado":
      return { fill: [22, 101, 52] as [number, number, number], text: [240, 253, 244] as [number, number, number] };
    case "Adequado":
      return { fill: [220, 252, 231] as [number, number, number], text: [22, 101, 52] as [number, number, number] };
    case "Básico":
      return { fill: [254, 249, 195] as [number, number, number], text: [113, 63, 18] as [number, number, number] };
    case "Abaixo do Básico":
    default:
      return { fill: [254, 226, 226] as [number, number, number], text: [153, 27, 27] as [number, number, number] };
  }
};

const statusTagStyles = (status: string) => {
  switch (status) {
    case "realizada":
      return { fill: [220, 252, 231] as [number, number, number], text: [22, 101, 52] as [number, number, number] };
    case "sendo_realizada":
      return { fill: [254, 249, 195] as [number, number, number], text: [113, 63, 18] as [number, number, number] };
    case "nao_realizado":
      return { fill: [254, 202, 202] as [number, number, number], text: [127, 29, 29] as [number, number, number] };
    case "pendente":
    default:
      return { fill: [254, 226, 226] as [number, number, number], text: [185, 28, 28] as [number, number, number] };
  }
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

const drawStatusLegend = (doc: jsPDF, margin: number, startY: number) => {
  const items = [
    { label: "Realizada", status: "realizada" },
    { label: "Em andamento", status: "sendo_realizada" },
    { label: "Pendente", status: "pendente" },
    { label: "Não realizada", status: "nao_realizado" },
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

const drawClassificationLegend = (doc: jsPDF, margin: number, startY: number) => {
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

async function addCoverHeader(
  doc: jsPDF,
  schoolName: string,
  cityId: string | null
) {
  const pageW = doc.internal.pageSize.getWidth();
  const centerX = pageW / 2;
  const BAND_H = 50;

  doc.setFillColor(...C.white);
  doc.rect(0, 0, pageW, doc.internal.pageSize.getHeight(), "F");
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, pageW, BAND_H, "F");

  let logoBottomInBand = 0;
  const { logo: logoAsset } = await loadCityBrandingForReportPdf(cityId);
  if (logoAsset?.dataUrl && logoAsset.iw > 0 && logoAsset.ih > 0) {
    const { w, h } = scaledSize(logoAsset.iw, logoAsset.ih, 35);
    doc.addImage(logoAsset.dataUrl, "PNG", centerX - w / 2, 8, w, h);
    logoBottomInBand = 8 + h;
  } else {
    doc.setFontSize(16);
    doc.setTextColor(...C.white);
    doc.setFont("helvetica", "bold");
    doc.text("AFIRME PLAY", centerX, 20, { align: "center" });
    logoBottomInBand = 26;
  }

  const titleY = Math.max(logoBottomInBand + 5, BAND_H - 14);
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("DETALHAMENTO DE ALUNOS", centerX, titleY, { align: "center" });
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.text(schoolName, centerX, titleY + 6, { align: "center" });

  return BAND_H + 8;
}

export async function generateDetalhamentoAlunosPdf(opts: {
  students: MonitoringStudentItem[];
  schoolName: string;
  cityId?: string | null;
}): Promise<void> {
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 15;

  let y = await addCoverHeader(doc, opts.schoolName, opts.cityId ?? null);

  const pageW = doc.internal.pageSize.getWidth();

  y = drawClassificationLegend(doc, margin, y);
  y = drawStatusLegend(doc, margin, y);
  y += 3;

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

  const studentsBody = opts.students.map((row) => [
    row.aluno_nome,
    `${row.serie || "—"} · ${row.turma || "—"} · ${getClassShiftLabel(row.shift)}`,
    fmtPt(row.nota),
    fmtPt(row.proficiencia),
    row.nivel,
    formatMonitoringCriticosResumo(row) || "—",
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
    margin: { left: margin, right: margin, bottom: 20 },
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
    columnStyles: scaleColumnWidths(
      {
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
      pageW - margin * 2
    ),
    didParseCell: (hookData) => {
      if (hookData.section !== "body" || !studentsBody.length) return;
      const row = opts.students[hookData.row.index];
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
  } as UserOptions);

  addFootersAllPages(doc);

  const safeSchoolName = opts.schoolName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s\-_]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

  doc.save(`detalhamento-alunos-${safeSchoolName}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
