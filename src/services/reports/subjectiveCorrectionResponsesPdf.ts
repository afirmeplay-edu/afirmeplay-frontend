/**
 * PDF de respostas individuais da correção subjetiva (aluno × questão).
 * Usado pelo botão "Exportar respostas" na matriz de correção.
 */
import type {
  SubjectiveCorrectionMatrixResponse,
  SubjectiveRubricValue,
} from "@/services/evaluation/subjectiveTestApi";

const C = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  borderLight: [229, 231, 235] as [number, number, number],
  bgHeader: [245, 243, 255] as [number, number, number],
  bgAlt: [250, 250, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const RUBRIC_SHORT: Record<SubjectiveRubricValue, string> = {
  SIM: "S",
  PARCIAL: "P",
  NAO: "N",
  BRANCO: "B",
};

const MARGIN = 10;
const TOP_BAND_H = 14;
const FOOTER_H = 10;

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
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "respostas-subjetiva"
  );
}

function drawTopBand(doc: import("jspdf").jsPDF, pageWidth: number, title: string): void {
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, pageWidth, TOP_BAND_H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...C.white);
  const t = String(title || "").trim();
  if (t) doc.text(t.toUpperCase(), pageWidth / 2, 9.5, { align: "center" });
}

function addFooters(doc: import("jspdf").jsPDF, dataGeracao: string): void {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, pageHeight - FOOTER_H, pageWidth - MARGIN, pageHeight - FOOTER_H);
    doc.setFontSize(7);
    doc.setTextColor(...C.textGray);
    doc.setFont("helvetica", "normal");
    doc.text("AfirmePlay — Relatório de respostas (avaliação subjetiva)", MARGIN, pageHeight - 5);
    doc.text(`Página ${i} de ${n}`, pageWidth / 2, pageHeight - 5, { align: "center" });
    doc.text(`Gerado em ${dataGeracao}`, pageWidth - MARGIN, pageHeight - 5, { align: "right" });
  }
}

/**
 * Gera e baixa PDF landscape com a tabelinha aluno × questão (S/P/N/B).
 */
export async function generateSubjectiveCorrectionResponsesPdf(
  matrix: SubjectiveCorrectionMatrixResponse
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const dataGeracao = fmtNow();
  const title = "Relatório de respostas — Avaliação subjetiva";
  const avaliacaoTitulo = matrix.subjective_test?.title || "Avaliação subjetiva";
  const turmaNome = matrix.class?.name || "Turma";

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFillColor(...C.white);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawTopBand(doc, pageWidth, title);

  let y = MARGIN + TOP_BAND_H + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...C.textDark);
  doc.text(avaliacaoTitulo, MARGIN, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C.textGray);
  doc.text(
    `Turma: ${turmaNome}  ·  ${matrix.students.length} aluno(s)  ·  ${matrix.questions.length} questão(ões)`,
    MARGIN,
    y
  );
  y += 4;
  doc.text("Legenda: S = Sim · P = Parcial · N = Não · B = Branco · — = sem lançamento", MARGIN, y);
  y += 6;

  const questions = matrix.questions || [];
  const contentW = pageWidth - MARGIN * 2;
  const nameColW = Math.min(55, contentW * 0.28);
  const presenceW = 18;
  const indexW = 28;
  const remaining = contentW - nameColW - presenceW - indexW;
  const qColW = questions.length > 0 ? remaining / questions.length : remaining;

  const rowH = 7;
  const headerH = 12;

  const drawHeader = () => {
    doc.setFillColor(...C.bgHeader);
    doc.rect(MARGIN, y, contentW, headerH, "F");
    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.2);
    doc.rect(MARGIN, y, contentW, headerH, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textDark);
    doc.text("Aluno", MARGIN + 2, y + 7);

    let x = MARGIN + nameColW;
    doc.text("Pres.", x + presenceW / 2, y + 7, { align: "center" });
    x += presenceW;

    questions.forEach((q) => {
      const code = q.code || `Q${q.number}`;
      doc.text(code, x + qColW / 2, y + 5, { align: "center" });
      if (q.skill_description) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.5);
        doc.setTextColor(...C.textGray);
        const skill = doc.splitTextToSize(q.skill_description, qColW - 1);
        doc.text(skill.slice(0, 1), x + qColW / 2, y + 9, { align: "center" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...C.textDark);
      }
      x += qColW;
    });

    doc.text("Índice", x + indexW / 2, y + 7, { align: "center" });
    y += headerH;
  };

  const ensureRowSpace = () => {
    if (y + rowH <= pageHeight - FOOTER_H - 2) return;
    doc.addPage();
    drawTopBand(doc, pageWidth, title);
    y = MARGIN + TOP_BAND_H + 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.textGray);
    doc.text(`${avaliacaoTitulo} — ${turmaNome} (continuação)`, MARGIN, y);
    y += 5;
    drawHeader();
  };

  drawHeader();

  matrix.students.forEach((student, idx) => {
    ensureRowSpace();

    if (idx % 2 === 1) {
      doc.setFillColor(...C.bgAlt);
      doc.rect(MARGIN, y, contentW, rowH, "F");
    }

    doc.setDrawColor(...C.borderLight);
    doc.setLineWidth(0.15);
    doc.rect(MARGIN, y, contentW, rowH, "S");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.textDark);
    const nameLines = doc.splitTextToSize(student.name || "—", nameColW - 3);
    doc.text(nameLines.slice(0, 1), MARGIN + 2, y + 4.5);

    let x = MARGIN + nameColW;
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textGray);
    doc.text(student.present ? "Sim" : "Não", x + presenceW / 2, y + 4.5, { align: "center" });
    x += presenceW;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    questions.forEach((q) => {
      const raw = student.results?.[q.id] as SubjectiveRubricValue | undefined;
      const cell = raw ? RUBRIC_SHORT[raw] || raw : "—";
      doc.setTextColor(...(raw ? C.textDark : C.textGray));
      doc.text(cell, x + qColW / 2, y + 4.5, { align: "center" });
      x += qColW;
    });

    const evalPct = student.evaluation?.score_percentage;
    const classification = student.evaluation?.classification;
    const indexLabel =
      evalPct != null
        ? `${Number.isInteger(evalPct) ? evalPct : evalPct.toFixed(1)}%${classification ? ` ${classification}` : ""}`
        : "—";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...C.textGray);
    const indexLines = doc.splitTextToSize(indexLabel, indexW - 2);
    doc.text(indexLines.slice(0, 1), x + indexW / 2, y + 4.5, { align: "center" });

    y += rowH;
  });

  addFooters(doc, dataGeracao);

  const fileName = `respostas-subjetiva-${sanitizeFileName(avaliacaoTitulo)}-${sanitizeFileName(turmaNome)}-${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(fileName);
}

export default generateSubjectiveCorrectionResponsesPdf;
