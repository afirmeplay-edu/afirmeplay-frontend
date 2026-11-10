/**
 * PDF de respostas individuais da correção subjetiva (aluno × questão).
 * Usado pelo botão "Exportar respostas" na matriz de correção e no Dashboard.
 */
import type {
  SubjectiveCorrectionMatrixResponse,
  SubjectiveCorrectionQuestion,
  SubjectiveCorrectionStudent,
  SubjectiveRubricMark,
} from "@/services/evaluation/subjectiveTestApi";
import { loadCityBrandingForReportPdf } from "@/utils/pdfCityBranding";
import { DEFAULT_RUBRIC_MARKS, rubricShortLabel } from "@/lib/subjectiveRubric";

const C = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
  borderLight: [229, 231, 235] as [number, number, number],
  bgHeader: [245, 243, 255] as [number, number, number],
  bgAlt: [250, 250, 250] as [number, number, number],
  bgGroup: [237, 233, 254] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

export type SubjectiveCorrectionPdfMeta = {
  municipio?: string;
  municipioId?: string | null;
  escola?: string;
  escolas?: string[];
  serie?: string;
  turma?: string;
  turmas?: string[];
  avaliacaoTitulo?: string;
};

type StudentWithLocation = SubjectiveCorrectionStudent & {
  school_name?: string | null;
  class_name?: string | null;
  subclass_name?: string | null;
};

function prefeituraTitle(municipio: string | undefined): string {
  const raw = String(municipio || "MUNICÍPIO").trim().toLocaleUpperCase("pt-BR");
  if (!raw || raw === "ALL" || raw === "TODAS" || raw === "TODOS") return "PREFEITURA MUNICIPAL";
  if (raw.startsWith("PREFEITURA")) return raw;
  return `PREFEITURA DE ${raw}`;
}

const MARGIN = 10;
const TOP_BAND_H = 14;
const FOOTER_H = 10;
const MIN_Q_COL_W = 10;
const INDEX_W = 24;
const PRESENCE_W = 14;

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

function questionShortLabel(q: { number?: number | null }): string {
  const n = Number(q.number);
  return Number.isFinite(n) && n > 0 ? `Q${n}` : "Q?";
}

function studentTurmaLabel(student: StudentWithLocation): string {
  return String(student.subclass_name || student.class_name || "").trim();
}

function studentSchoolLabel(student: StudentWithLocation): string {
  return String(student.school_name || "").trim();
}

function hasLocationData(students: StudentWithLocation[]): boolean {
  return students.some((s) => Boolean(studentSchoolLabel(s) || studentTurmaLabel(s)));
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

function chunkQuestions<T>(items: T[], maxPerChunk: number): T[][] {
  if (items.length === 0) return [[]];
  const size = Math.max(1, maxPerChunk);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function sortStudents(students: StudentWithLocation[]): StudentWithLocation[] {
  return [...students].sort((a, b) => {
    const schoolCmp = studentSchoolLabel(a).localeCompare(studentSchoolLabel(b), "pt-BR", {
      sensitivity: "base",
    });
    if (schoolCmp !== 0) return schoolCmp;
    const turmaCmp = studentTurmaLabel(a).localeCompare(studentTurmaLabel(b), "pt-BR", {
      sensitivity: "base",
    });
    if (turmaCmp !== 0) return turmaCmp;
    return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" });
  });
}

/**
 * Gera e baixa PDF landscape com a tabelinha aluno × questão (S/P/N/B).
 */
export async function generateSubjectiveCorrectionResponsesPdf(
  matrix: SubjectiveCorrectionMatrixResponse,
  meta: SubjectiveCorrectionPdfMeta = {}
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const dataGeracao = fmtNow();
  const title = "Relatório de respostas — Avaliação subjetiva";
  const avaliacaoTitulo =
    meta.avaliacaoTitulo?.trim() || matrix.subjective_test?.title || "Avaliação subjetiva";
  const turmaNome = meta.turma || matrix.class?.name || "Turma";
  const marks: SubjectiveRubricMark[] =
    matrix.rubric_marks && matrix.rubric_marks.length > 0
      ? matrix.rubric_marks
      : DEFAULT_RUBRIC_MARKS;
  const shortByCode = Object.fromEntries(marks.map((m) => [m.code, rubricShortLabel(m)]));
  const branding = await loadCityBrandingForReportPdf(meta.municipioId || null);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentW = pageWidth - MARGIN * 2;
  const textMaxW = contentW;

  doc.setFillColor(...C.white);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawTopBand(doc, pageWidth, title);

  let y = MARGIN + TOP_BAND_H + 3;

  if (branding.logo?.dataUrl) {
    let logoW = 22;
    let logoH = (branding.logo.ih * logoW) / Math.max(branding.logo.iw, 1);
    if (logoH > 14) {
      logoH = 14;
      logoW = (branding.logo.iw * logoH) / Math.max(branding.logo.ih, 1);
    }
    doc.addImage(branding.logo.dataUrl, "PNG", (pageWidth - logoW) / 2, y, logoW, logoH);
    y += logoH + 4;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C.textDark);
  doc.text(prefeituraTitle(meta.municipio), pageWidth / 2, y, { align: "center" });
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C.textGray);
  doc.text("SECRETARIA MUNICIPAL DE EDUCAÇÃO", pageWidth / 2, y, { align: "center" });
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...C.textDark);
  const titleLines = doc.splitTextToSize(avaliacaoTitulo, textMaxW);
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 5 + 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...C.textGray);

  const scopeSchools = meta.escolas?.filter(Boolean) || [];
  const escolaLine = meta.escola
    ? `Escola: ${meta.escola}`
    : scopeSchools.length > 0
      ? `Escolas: ${scopeSchools.join("; ")}`
      : null;
  const turmaLine =
    meta.turmas && meta.turmas.length > 0
      ? `Turmas: ${meta.turmas.join("; ")}`
      : `Turma: ${turmaNome}`;

  const metaLines = [
    meta.municipio ? `Município: ${meta.municipio}` : null,
    escolaLine,
    meta.serie ? `Série: ${meta.serie}` : null,
    turmaLine,
    `${matrix.students.length} aluno(s) · ${matrix.questions.length} questão(ões)`,
  ].filter(Boolean) as string[];

  for (const line of metaLines) {
    const wrapped = doc.splitTextToSize(line, textMaxW);
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 3.8 + 0.8;
  }

  const legend = marks.map((m) => `${rubricShortLabel(m)} = ${m.label}`).join(" · ");
  const legendLines = doc.splitTextToSize(`Legenda: ${legend} · — = sem lançamento`, textMaxW);
  doc.text(legendLines, MARGIN, y);
  y += legendLines.length * 3.8 + 4;

  const questions = matrix.questions || [];
  const students = sortStudents((matrix.students || []) as StudentWithLocation[]);
  const showLocation = hasLocationData(students);

  const nameColW = showLocation ? Math.min(42, contentW * 0.2) : Math.min(55, contentW * 0.28);
  const schoolColW = showLocation ? Math.min(40, contentW * 0.18) : 0;
  const turmaColW = showLocation ? Math.min(30, contentW * 0.14) : 0;
  const fixedWithoutIndex = nameColW + schoolColW + turmaColW + PRESENCE_W;
  const remainingForMax = Math.max(40, contentW - fixedWithoutIndex - INDEX_W);
  const maxQuestionsPerChunk = Math.max(1, Math.floor(remainingForMax / MIN_Q_COL_W));
  const questionChunks = chunkQuestions(questions, maxQuestionsPerChunk);

  const rowH = 7;
  const headerH = 8;
  const groupH = 7;

  const ensureSpace = (needed: number, continuationLabel: string, redrawHeader: () => void) => {
    if (y + needed <= pageHeight - FOOTER_H - 2) return;
    doc.addPage();
    drawTopBand(doc, pageWidth, title);
    y = MARGIN + TOP_BAND_H + 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.textGray);
    const cont = doc.splitTextToSize(continuationLabel, textMaxW);
    doc.text(cont, MARGIN, y);
    y += cont.length * 3.6 + 3;
    redrawHeader();
  };

  questionChunks.forEach((chunk, chunkIdx) => {
    const isLastChunk = chunkIdx === questionChunks.length - 1;
    const fixedW = fixedWithoutIndex + (isLastChunk ? INDEX_W : 0);
    const remaining = Math.max(40, contentW - fixedW);
    const qColW = chunk.length > 0 ? remaining / chunk.length : remaining;
    const chunkLabel =
      questionChunks.length > 1
        ? `${avaliacaoTitulo} — questões ${questionShortLabel(chunk[0])} a ${questionShortLabel(
            chunk[chunk.length - 1]
          )} (bloco ${chunkIdx + 1}/${questionChunks.length})`
        : `${avaliacaoTitulo} — ${turmaNome}`;

    if (chunkIdx > 0) {
      doc.addPage();
      drawTopBand(doc, pageWidth, title);
      y = MARGIN + TOP_BAND_H + 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...C.textGray);
      const cont = doc.splitTextToSize(chunkLabel, textMaxW);
      doc.text(cont, MARGIN, y);
      y += cont.length * 3.6 + 3;
    }

    const drawHeader = () => {
      doc.setFillColor(...C.bgHeader);
      doc.rect(MARGIN, y, contentW, headerH, "F");
      doc.setDrawColor(...C.borderLight);
      doc.setLineWidth(0.2);
      doc.rect(MARGIN, y, contentW, headerH, "S");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...C.textDark);
      let x = MARGIN;
      doc.text("Aluno", x + 2, y + 5.2);
      x += nameColW;
      if (showLocation) {
        doc.text("Escola", x + 1.5, y + 5.2);
        x += schoolColW;
        doc.text("Turma", x + 1.5, y + 5.2);
        x += turmaColW;
      }
      doc.text("Pres.", x + PRESENCE_W / 2, y + 5.2, { align: "center" });
      x += PRESENCE_W;

      chunk.forEach((q) => {
        doc.text(questionShortLabel(q), x + qColW / 2, y + 5.2, { align: "center" });
        x += qColW;
      });

      if (isLastChunk) {
        doc.text("Índice", x + INDEX_W / 2, y + 5.2, { align: "center" });
      }
      y += headerH;
    };

    drawHeader();

    let lastGroupKey = "";
    students.forEach((student, idx) => {
      const school = studentSchoolLabel(student) || "—";
      const turma = studentTurmaLabel(student) || matrix.class?.name || "—";
      const groupKey = showLocation ? `${school}||${turma}` : "";

      if (showLocation && groupKey !== lastGroupKey) {
        ensureSpace(groupH + rowH, chunkLabel, drawHeader);
        doc.setFillColor(...C.bgGroup);
        doc.rect(MARGIN, y, contentW, groupH, "F");
        doc.setDrawColor(...C.borderLight);
        doc.setLineWidth(0.15);
        doc.rect(MARGIN, y, contentW, groupH, "S");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...C.textDark);
        const groupLabel = `Escola: ${school}  ·  Turma: ${turma}`;
        const groupLines = doc.splitTextToSize(groupLabel, contentW - 4);
        doc.text(groupLines[0], MARGIN + 2, y + 4.6);
        y += groupH;
        lastGroupKey = groupKey;
      }

      ensureSpace(rowH, chunkLabel, drawHeader);

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
      let x = MARGIN;
      const nameLines = doc.splitTextToSize(student.name || "—", nameColW - 3);
      doc.text(nameLines[0], x + 2, y + 4.5);
      x += nameColW;

      if (showLocation) {
        doc.setFontSize(6.5);
        doc.setTextColor(...C.textGray);
        const schoolLines = doc.splitTextToSize(school, schoolColW - 2);
        doc.text(schoolLines[0], x + 1.5, y + 4.5);
        x += schoolColW;
        const turmaLines = doc.splitTextToSize(turma, turmaColW - 2);
        doc.text(turmaLines[0], x + 1.5, y + 4.5);
        x += turmaColW;
      }

      doc.setFontSize(6.5);
      doc.setTextColor(...C.textGray);
      doc.text(student.present ? "Sim" : "Não", x + PRESENCE_W / 2, y + 4.5, { align: "center" });
      x += PRESENCE_W;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      chunk.forEach((q: SubjectiveCorrectionQuestion) => {
        const raw = student.results?.[q.id];
        const cell = raw ? shortByCode[raw] || String(raw).slice(0, 2) : "—";
        doc.setTextColor(...(raw ? C.textDark : C.textGray));
        doc.text(cell, x + qColW / 2, y + 4.5, { align: "center" });
        x += qColW;
      });

      if (isLastChunk) {
        const evalPct = student.evaluation?.score_percentage;
        const classification = student.evaluation?.classification;
        const indexLabel =
          evalPct != null
            ? `${Number.isInteger(evalPct) ? evalPct : evalPct.toFixed(1)}%${
                classification ? ` ${classification}` : ""
              }`
            : "—";
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.setTextColor(...C.textGray);
        const indexLines = doc.splitTextToSize(indexLabel, INDEX_W - 2);
        doc.text(indexLines[0], x + INDEX_W / 2, y + 4.5, { align: "center" });
      }

      y += rowH;
    });
  });

  // Legenda das questões (Qn → nome — descrição), com wrap completo e paginação.
  ensureSpace(18, `${avaliacaoTitulo} — legenda`, () => undefined);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...C.textDark);
  doc.text("Legenda das questões", MARGIN, y);
  y += 5;

  questions.forEach((q) => {
    const short = questionShortLabel(q);
    const skillName = String(q.code || "").trim();
    const skillDesc = String(q.skill_description || "").trim();
    const parts = [skillName, skillDesc].filter(Boolean);
    const line = parts.length > 0 ? `${short} → ${parts.join(" — ")}` : `${short} → —`;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.textDark);
    const wrapped = doc.splitTextToSize(line, textMaxW);
    ensureSpace(wrapped.length * 3.8 + 2, `${avaliacaoTitulo} — legenda`, () => undefined);
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 3.8 + 1.5;
  });

  addFooters(doc, dataGeracao);

  const fileName = `respostas-subjetiva-${sanitizeFileName(avaliacaoTitulo)}-${sanitizeFileName(
    turmaNome
  )}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

export default generateSubjectiveCorrectionResponsesPdf;
