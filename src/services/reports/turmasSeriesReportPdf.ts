import { getClassShiftLabel } from "@/lib/classShift";
import {
  aggregateTurmasBySerie,
  aggregateTurmasByTurno,
  type TurmasSeriesReportTurma,
} from "@/lib/turmasSeriesReport";
import {
  buildStandardPdfFileName,
  drawStandardPageNumbers,
  drawStandardReportCover,
  drawStandardSectionTitle,
  ensureStandardSpace,
  getLastAutoTableFinalY,
  loadStandardPdfBranding,
  STANDARD_PDF_COLORS,
  STANDARD_PDF_MARGIN,
  standardAutoTableStyles,
} from "@/services/reports/standardReportPdfLayout";

export type TurmasSeriesReportPdfFilterLabels = {
  escola: string;
  turno: string;
  curso: string;
};

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function formatPercent(part: number, total: number): string {
  if (!total) return "0%";
  return `${((part / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export async function generateTurmasSeriesReportPdf(args: {
  /** Turmas já filtradas conforme o que está visível na tela. */
  turmas: TurmasSeriesReportTurma[];
  filterLabels: TurmasSeriesReportPdfFilterLabels;
  cityId?: string | null;
}): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const turmas = args.turmas;
  const bySerie = aggregateTurmasBySerie(turmas);
  const byTurno = aggregateTurmasByTurno(turmas);
  const totalTurmas = turmas.length;
  const totalAlunos = turmas.reduce((acc, t) => acc + (Number(t.students_count) || 0), 0);
  const totalEscolas = new Set(turmas.map((t) => t.school_id).filter(Boolean)).size;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const branding = await loadStandardPdfBranding(args.cityId);

  drawStandardReportCover(doc, {
    title: "Relatório de Turmas e Séries",
    subtitle:
      args.filterLabels.escola === "Todas as escolas"
        ? "Visão consolidada"
        : args.filterLabels.escola,
    summaryRows: [
      ["TOTAL DE TURMAS:", String(totalTurmas)],
      ["SÉRIES DISTINTAS:", String(bySerie.length)],
      ["ESCOLAS:", String(totalEscolas)],
      ["ALUNOS:", String(totalAlunos)],
    ],
    filterRows: [
      ["ESCOLA:", args.filterLabels.escola],
      ["TURNO:", args.filterLabels.turno],
      ["CURSO:", args.filterLabels.curso],
    ],
    note: "Observação: o total de alunos corresponde à soma dos contadores cadastrados em cada turma.",
    branding,
  });

  doc.addPage();
  let y = drawStandardSectionTitle(doc, "Turmas por série", STANDARD_PDF_MARGIN);
  autoTable(doc, {
    ...standardAutoTableStyles,
    startY: y,
    head: [["Série", "Turmas", "Alunos"]],
    body: bySerie.length
      ? bySerie.map((row) => [row.name, String(row.turmas), String(row.alunos)])
      : [["Nenhuma turma encontrada com os filtros aplicados.", "", ""]],
    foot: bySerie.length ? [["Total", String(totalTurmas), String(totalAlunos)]] : undefined,
    footStyles: { fillColor: STANDARD_PDF_COLORS.bgLight, textColor: STANDARD_PDF_COLORS.textDark, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 30 }, 2: { halign: "right", cellWidth: 30 } },
  });
  y = getLastAutoTableFinalY(doc, y + 40);

  y = ensureStandardSpace(doc, y);
  y = drawStandardSectionTitle(doc, "Distribuição por turno", y);
  autoTable(doc, {
    ...standardAutoTableStyles,
    startY: y,
    head: [["Turno", "Turmas", "Percentual"]],
    body: byTurno.length
      ? byTurno.map((row) => [row.name, String(row.value), formatPercent(row.value, totalTurmas)])
      : [["Nenhuma turma encontrada com os filtros aplicados.", "", ""]],
    columnStyles: { 1: { halign: "right", cellWidth: 30 }, 2: { halign: "right", cellWidth: 30 } },
  });
  y = getLastAutoTableFinalY(doc, y + 40);

  const bySchool = new Map<string, TurmasSeriesReportTurma[]>();
  for (const turma of turmas) {
    const schoolName = str(turma.school?.name) || "Escola não informada";
    const group = bySchool.get(schoolName) ?? [];
    group.push(turma);
    bySchool.set(schoolName, group);
  }
  const schoolGroups = Array.from(bySchool.entries()).sort(([a], [b]) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  );
  const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

  for (const [schoolName, rows] of schoolGroups) {
    y = ensureStandardSpace(doc, y);
    y = drawStandardSectionTitle(doc, `Turmas - ${schoolName}`, y);
    const sorted = [...rows].sort(
      (a, b) =>
        collator.compare(str(a.grade?.name), str(b.grade?.name)) ||
        collator.compare(str(a.name), str(b.name))
    );
    autoTable(doc, {
      ...standardAutoTableStyles,
      startY: y,
      head: [["Série", "Turma", "Turno", "Curso", "Alunos"]],
      body: sorted.map((t) => [
        str(t.grade?.name) || "—",
        str(t.name) || "—",
        getClassShiftLabel(t.shift),
        str(t.grade?.education_stage?.name) || "—",
        String(Number(t.students_count) || 0),
      ]),
      columnStyles: { 4: { halign: "right", cellWidth: 20 } },
    });
    y = getLastAutoTableFinalY(doc, y + 40);
  }

  drawStandardPageNumbers(doc);
  doc.save(
    buildStandardPdfFileName(
      "relatorio_turmas_series",
      args.filterLabels.escola === "Todas as escolas" ? undefined : args.filterLabels.escola
    )
  );
}
