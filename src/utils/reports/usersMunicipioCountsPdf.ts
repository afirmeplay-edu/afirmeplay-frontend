import {
  loadCityBrandingForReportPdf,
  paintLetterheadBackground,
} from "@/utils/pdfCityBranding";
import { getClassShiftLabel } from "@/lib/classShift";

type Rgb = [number, number, number];
type UserRoleGroup = "diretor" | "coordenador" | "professor" | "aluno";

export interface UsersCountsReportResponse {
  general?: Partial<{
    students: number;
    teachers: number;
    directors: number;
    coordinators: number;
    tecadm: number;
  }>;
  by_school?: Array<{
    school_id?: string;
    school_name?: string;
    students?: number;
    teachers?: number;
    directors?: number;
    coordinators?: number;
    tecadm?: number;
  }>;
  by_grade?: Array<{
    grade_id?: string;
    grade_name?: string;
    students?: number;
    teachers?: number;
    directors?: number;
    coordinators?: number;
    tecadm?: number;
  }>;
  by_class?: Array<{
    class_id?: string;
    class_name?: string;
    school_id?: string;
    school_name?: string;
    grade_id?: string;
    grade_name?: string;
    students?: number;
    teachers?: number;
    directors?: number;
    coordinators?: number;
    tecadm?: number;
  }>;
}

export interface UsersReportScope {
  type: "city" | "school";
  schoolName?: string;
}

export interface ReportContact {
  name: string;
  email: string;
  gradeName?: string;
  className?: string;
}

export type ContactsByRole = Partial<Record<UserRoleGroup, ReportContact[]>>;

export interface ReportSchoolClass {
  id?: string;
  name: string;
  gradeName?: string;
  educationStageName?: string;
  shift?: string | null;
  students?: number;
  teachers?: number;
}

function n(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function schoolNameWithoutRepeatedPrefix(value: unknown): string {
  const original = str(value);
  const withoutPrefix = original
    .replace(/^(?:(?:escola|de)(?:\s+|:\s*|-\s*))+/i, "")
    .trim();
  return withoutPrefix || original || "Não informada";
}

function normalizeSortTokens(input: string): { numeric: number; suffix: string } {
  const cleaned = str(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const match = cleaned.match(/^(\d+)/);
  if (!match) return { numeric: Number.MAX_SAFE_INTEGER, suffix: cleaned };
  return {
    numeric: Number(match[1]),
    suffix: cleaned
      .slice(match[0].length)
      .replace(/^\s*[º°oª]\s*/i, "")
      .trim(),
  };
}

function fullClassName(gradeName: unknown, className: unknown): string {
  const grade = str(gradeName);
  const classLabel = str(className);
  if (!grade) return classLabel || "Turma não informada";
  if (!classLabel) return grade;

  const normalizedGrade = grade.toLocaleLowerCase("pt-BR");
  const normalizedClass = classLabel.toLocaleLowerCase("pt-BR");
  return normalizedClass.startsWith(normalizedGrade)
    ? classLabel
    : `${grade} ${classLabel}`;
}

function sortGradeAndClass(a: { grade_name?: string; class_name?: string }, b: { grade_name?: string; class_name?: string }): number {
  const gradeA = normalizeSortTokens(a.grade_name || "");
  const gradeB = normalizeSortTokens(b.grade_name || "");
  if (gradeA.numeric !== gradeB.numeric) return gradeA.numeric - gradeB.numeric;
  const byGradeSuffix = gradeA.suffix.localeCompare(gradeB.suffix, "pt-BR", { sensitivity: "base" });
  if (byGradeSuffix !== 0) return byGradeSuffix;

  const classA = normalizeSortTokens(a.class_name || "");
  const classB = normalizeSortTokens(b.class_name || "");
  if (classA.numeric !== classB.numeric) return classA.numeric - classB.numeric;
  return classA.suffix.localeCompare(classB.suffix, "pt-BR", { sensitivity: "base" });
}

export async function generateUsersMunicipioCountsPdf(args: {
  cityId: string;
  cityName: string;
  report: UsersCountsReportResponse;
  scope?: UsersReportScope;
  contactsByRole?: ContactsByRole;
  schoolClasses?: ReportSchoolClass[];
}): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const COLORS: Record<string, Rgb> = {
    primary: [124, 62, 237],
    textDark: [31, 41, 55],
    textGray: [107, 114, 128],
    borderLight: [229, 231, 235],
    bgLight: [250, 250, 250],
    white: [255, 255, 255],
  };

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const centerX = pageW / 2;
  const margin = 15;
  const scope = args.scope ?? { type: "city" as const };
  const contextualSchoolName = schoolNameWithoutRepeatedPrefix(scope.schoolName);
  const reportLabel =
    scope.type === "school"
      ? `DA ESCOLA ${contextualSchoolName.toUpperCase()}`
      : `DO MUNICÍPIO ${str(args.cityName || "").toUpperCase()}`;

  const usersBranding = await loadCityBrandingForReportPdf(args.cityId);
  const logoAsset = usersBranding.logo;
  const coverLetterhead = usersBranding.letterhead;

  const drawCover = () => {
    let logoW = 0;
    let logoH = 0;
    let logoBottom = 28;
    if (logoAsset?.dataUrl && logoAsset.iw > 0 && logoAsset.ih > 0) {
      logoW = 38;
      logoH = (logoAsset.ih * logoW) / logoAsset.iw;
      if (logoH > 18) {
        logoW = (logoW * 18) / logoH;
        logoH = 18;
      }
      logoBottom = 7 + logoH;
    }

    const titleY = Math.max(logoBottom + 5, 39);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const reportLabelLines = doc.splitTextToSize(reportLabel, pageW - 34) as string[];
    const reportLabelLineH = 5;
    const BAND_H = Math.max(58, titleY + 8 + reportLabelLines.length * reportLabelLineH + 5);

    if (coverLetterhead) {
      paintLetterheadBackground(doc, coverLetterhead, pageW, pageH);
    } else {
      doc.setFillColor(...COLORS.white);
      doc.rect(0, 0, pageW, pageH, "F");
    }
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageW, BAND_H, "F");

    if (logoAsset?.dataUrl && logoW > 0 && logoH > 0) {
      doc.addImage(logoAsset.dataUrl, "PNG", centerX - logoW / 2, 7, logoW, logoH);
    } else {
      doc.setFontSize(18);
      doc.setTextColor(...COLORS.white);
      doc.setFont("helvetica", "bold");
      doc.text("AFIRME PLAY", centerX, 22, { align: "center" });
    }

    doc.setTextColor(...COLORS.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("RELATÓRIO DE USUÁRIOS", centerX, titleY, { align: "center" });
    doc.setFontSize(12);
    doc.text(reportLabelLines, centerX, titleY + 8, {
      align: "center",
      lineHeightFactor: 1.15,
    });

    const y = BAND_H + 10;

    const cardW = pageW - 40;
    const cardX = (pageW - cardW) / 2;
    const cardH = 72;
    const ACCENT_W = 4;
    doc.setFillColor(...COLORS.bgLight);
    doc.rect(cardX, y, cardW, cardH, "F");
    doc.setFillColor(...COLORS.primary);
    doc.rect(cardX, y, ACCENT_W, cardH, "F");
    doc.setDrawColor(...COLORS.borderLight);
    doc.setLineWidth(0.4);
    doc.rect(cardX, y, cardW, cardH, "S");

    const lx = cardX + ACCENT_W + 10;
    const labelW = 58;
    const vx = lx + labelW + 4;
    // A linha divisória do título fica em y+14; começar o conteúdo abaixo para não "cortar" a 1ª linha.
    let cy = y + 22;
    const rowH = 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.primary);
    doc.text("RESUMO", cardX + ACCENT_W + (cardW - ACCENT_W) / 2, y + 10, { align: "center" });
    doc.setDrawColor(...COLORS.borderLight);
    doc.setLineWidth(0.3);
    doc.line(cardX + ACCENT_W + 4, y + 14, cardX + cardW - 4, y + 14);

    const g = args.report.general ?? {};
    const rows: Array<[string, string]> = [
      ["ALUNOS:", String(n(g.students))],
      ["PROFESSORES:", String(n(g.teachers))],
      ["DIRETORES:", String(n(g.directors))],
      ["COORDENADORES:", String(n(g.coordinators))],
    ];
    if (scope.type === "city") rows.push(["TEC. ADM:", String(n(g.tecadm))]);

    doc.setFontSize(11);
    for (const [label, value] of rows) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.primary);
      doc.text(label, lx, cy);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.textDark);
      doc.text(value, vx, cy);
      cy += rowH;
    }

    // Observação sob o card (contexto importante para leitura dos totais)
    const note =
      "Observação: podem existir diretores e coordenadores com contas criadas, mas ainda não vinculadas a nenhuma escola.";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textGray);
    const noteY = y + cardH + 10;
    const noteW = cardW - 18;
    const noteLines = doc.splitTextToSize(note, noteW);
    doc.text(noteLines, cardX + 9, noteY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textGray);
    doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, centerX, pageH - 10, {
      align: "center",
    });
  };

  drawCover();
  doc.addPage();

  const addSectionTitle = (title: string, y: number): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...COLORS.primary);
    doc.text(title, margin, y);
    doc.setDrawColor(...COLORS.borderLight);
    doc.setLineWidth(0.3);
    doc.line(margin, y + 2, pageW - margin, y + 2);
    return y + 10;
  };

  let y = margin;

  y = addSectionTitle("Resultados gerais", y);
  const g = args.report.general ?? {};
  autoTable(doc, {
    startY: y,
    styles: { font: "helvetica", fontSize: 10, textColor: COLORS.textDark },
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white },
    bodyStyles: { fillColor: COLORS.white },
    head: [["Perfil", "Quantidade"]],
    body: [
      ["Alunos", n(g.students)],
      ["Professores", n(g.teachers)],
      ["Diretores", n(g.directors)],
      ["Coordenadores", n(g.coordinators)],
      ...(scope.type === "city" ? [["Técnico administrativo", n(g.tecadm)] as [string, number]] : []),
    ].map(([a, b]) => [String(a), String(b)]),
    theme: "striped",
    margin: { left: margin, right: margin },
  });
  y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
    ? (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12
    : y + 40;

  const addCountsTable = (title: string, head: string[], body: Array<Array<string | number>>) => {
    if (y > pageH - 60) {
      doc.addPage();
      y = margin;
    }
    y = addSectionTitle(title, y);
    autoTable(doc, {
      startY: y,
      styles: { font: "helvetica", fontSize: 9, textColor: COLORS.textDark },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white },
      bodyStyles: { fillColor: COLORS.white },
      head: [head],
      body: body.map((row) => row.map((c) => (typeof c === "number" ? String(c) : String(c ?? "")))),
      theme: "striped",
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
      ? (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12
      : y + 40;
  };

  const bySchool = Array.isArray(args.report.by_school) ? args.report.by_school : [];
  addCountsTable(
    "Por escola",
    ["Escola", "Alunos", "Professores", "Diretores", "Coordenadores"],
    bySchool.map((r) => [
      r.school_name ?? "—",
      n(r.students),
      n(r.teachers),
      n(r.directors),
      n(r.coordinators),
    ])
  );

  const byGrade = Array.isArray(args.report.by_grade)
    ? [...args.report.by_grade].sort(sortGradeAndClass)
    : [];
  addCountsTable(
    "Por série",
    ["Série", "Alunos", "Professores", "Diretores", "Coordenadores"],
    byGrade.map((r) => [
      r.grade_name ?? "—",
      n(r.students),
      n(r.teachers),
      n(r.directors),
      n(r.coordinators),
    ])
  );

  const byClass = Array.isArray(args.report.by_class) ? args.report.by_class : [];
  const byClassGroupedBySchool = new Map<string, typeof byClass>();
  for (const row of byClass) {
    const schoolName = str(row.school_name) || "Escola não informada";
    const existing = byClassGroupedBySchool.get(schoolName) ?? [];
    existing.push(row);
    byClassGroupedBySchool.set(schoolName, existing);
  }

  const sortedSchoolGroups = Array.from(byClassGroupedBySchool.entries()).sort(([a], [b]) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  );

  const drawSchoolClassCover = (schoolName: string) => {
    doc.addPage();
    y = margin + 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.text("Resultados por turma", margin, y);
    y += 8;
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textDark);
    const schoolLines = doc.splitTextToSize(
      `Escola: ${schoolNameWithoutRepeatedPrefix(schoolName)}`,
      pageW - margin * 2
    ) as string[];
    doc.text(schoolLines, margin, y, { lineHeightFactor: 1.15 });
    y += Math.max(6, schoolLines.length * 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textGray);
    const cityLabel = str(args.cityName) || "Município";
    doc.text(`Município: ${cityLabel}`, margin, y);
    y += 8;
    doc.setDrawColor(...COLORS.borderLight);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageW - margin, y);
    y += 5;
  };

  for (const [schoolName, rows] of sortedSchoolGroups) {
    drawSchoolClassCover(schoolName);
    const sortedRows = [...rows].sort(sortGradeAndClass);
    autoTable(doc, {
      startY: y,
      styles: { font: "helvetica", fontSize: 9, textColor: COLORS.textDark },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white },
      bodyStyles: { fillColor: COLORS.white },
      head: [["Série", "Turma", "Alunos", "Professores", "Diretores", "Coordenadores"]],
      body: sortedRows.map((r) => [
        str(r.grade_name) || "—",
        str(r.class_name) || "—",
        String(n(r.students)),
        String(n(r.teachers)),
        String(n(r.directors)),
        String(n(r.coordinators)),
      ]),
      theme: "striped",
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
      ? (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12
      : y + 40;
  }

  const schoolClasses = Array.isArray(args.schoolClasses) ? args.schoolClasses : [];
  if (schoolClasses.length > 0) {
    const sortedClasses = [...schoolClasses].sort((a, b) =>
      sortGradeAndClass(
        { grade_name: a.gradeName, class_name: a.name },
        { grade_name: b.gradeName, class_name: b.name }
      )
    );
    const cardGap = 6;
    const cardW = (pageW - margin * 2 - cardGap) / 2;
    const cardH = 39;
    const titleSpace = 12;

    if (y > pageH - 60) {
      doc.addPage();
      y = margin;
    }
    y = addSectionTitle("Turmas da escola", y);

    for (let index = 0; index < sortedClasses.length; index += 2) {
      if (y + cardH > pageH - margin) {
        doc.addPage();
        y = margin;
        y = addSectionTitle("Turmas da escola (continuação)", y);
      }

      for (let column = 0; column < 2; column += 1) {
        const item = sortedClasses[index + column];
        if (!item) continue;
        const x = margin + column * (cardW + cardGap);
        doc.setFillColor(...COLORS.bgLight);
        doc.setDrawColor(...COLORS.borderLight);
        doc.setLineWidth(0.35);
        doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD");
        doc.setFillColor(...COLORS.primary);
        doc.rect(x, y, 3, cardH, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.primary);
        const classTitle = doc.splitTextToSize(
          fullClassName(item.gradeName, item.name),
          cardW - 13
        ) as string[];
        doc.text(classTitle.slice(0, 2), x + 8, y + 7, { lineHeightFactor: 1.1 });

        let lineY = y + titleSpace + Math.max(0, classTitle.slice(0, 2).length - 1) * 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...COLORS.textDark);
        doc.text(`Série: ${str(item.gradeName) || "—"}`, x + 8, lineY);
        lineY += 5;
        if (str(item.educationStageName)) {
          doc.text(`Curso: ${str(item.educationStageName)}`, x + 8, lineY);
          lineY += 5;
        }
        doc.text(`Turno: ${getClassShiftLabel(item.shift)}`, x + 8, lineY);
        lineY += 5;
        doc.text(
          `Professores: ${n(item.teachers)}   |   Alunos: ${n(item.students)}`,
          x + 8,
          lineY
        );
      }
      y += cardH + cardGap;
    }
    y += 6;
  }

  const contactRoleLabels: Array<{ key: UserRoleGroup; label: string }> = [
    { key: "diretor", label: "Diretores" },
    { key: "coordenador", label: "Coordenadores" },
    { key: "professor", label: "Professores" },
    { key: "aluno", label: "Alunos" },
  ];

  if (args.contactsByRole) {
    for (const roleItem of contactRoleLabels) {
      const list = (args.contactsByRole[roleItem.key] ?? []).filter((c) => str(c.name) || str(c.email));
      const sortedList = [...list].sort((a, b) => {
        if (roleItem.key === "aluno") {
          const byClass = sortGradeAndClass(
            { grade_name: a.gradeName, class_name: a.className },
            { grade_name: b.gradeName, class_name: b.className }
          );
          if (byClass !== 0) return byClass;
        }
        return str(a.name).localeCompare(str(b.name), "pt-BR", { sensitivity: "base" });
      });
      if (sortedList.length === 0) continue;

      if (roleItem.key === "aluno") {
        const groupedStudents = new Map<string, ReportContact[]>();
        for (const student of sortedList) {
          const gradeName = str(student.gradeName);
          const className = str(student.className);
          const key = `${gradeName}\u0000${className}`;
          const group = groupedStudents.get(key) ?? [];
          group.push(student);
          groupedStudents.set(key, group);
        }

        for (const [key, students] of groupedStudents) {
          const [gradeName, className] = key.split("\u0000");
          const normalizedGrade = gradeName.toLocaleLowerCase("pt-BR");
          const normalizedClass = className.toLocaleLowerCase("pt-BR");
          const groupLabel =
            gradeName && className
              ? normalizedClass.startsWith(normalizedGrade)
                ? className
                : `${gradeName} ${className}`
              : gradeName || className || "Série e turma não informadas";

          if (y > pageH - 60) {
            doc.addPage();
            y = margin;
          }
          y = addSectionTitle(`Contatos - Alunos - ${groupLabel}`, y);
          autoTable(doc, {
            startY: y,
            styles: { font: "helvetica", fontSize: 9, textColor: COLORS.textDark },
            headStyles: { fillColor: COLORS.primary, textColor: COLORS.white },
            bodyStyles: { fillColor: COLORS.white },
            head: [["#", "Nome", "E-mail"]],
            body: students.map((item, idx) => [
              String(idx + 1),
              str(item.name) || "—",
              str(item.email) || "—",
            ]),
            theme: "striped",
            margin: { left: margin, right: margin },
            columnStyles: { 0: { cellWidth: 10, halign: "right" } },
          });
          y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
            ? (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12
            : y + 40;
        }
        continue;
      }

      if (y > pageH - 60) {
        doc.addPage();
        y = margin;
      }
      y = addSectionTitle(`Contatos - ${roleItem.label}`, y);
      const body: string[][] = sortedList.map((item, idx) => [
        String(idx + 1),
        str(item.name) || "—",
        str(item.email) || "—",
      ]);

      autoTable(doc, {
        startY: y,
        styles: { font: "helvetica", fontSize: 9, textColor: COLORS.textDark },
        headStyles: { fillColor: COLORS.primary, textColor: COLORS.white },
        bodyStyles: { fillColor: COLORS.white },
        head: [["#", "Nome", "E-mail"]],
        body,
        theme: "striped",
        margin: { left: margin, right: margin },
        columnStyles: { 0: { cellWidth: 10, halign: "right" } },
      });
      y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
        ? (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12
        : y + 40;
    }
  }

  const safeBase =
    scope.type === "school"
      ? str(scope.schoolName || "escola").replace(/\s+/g, "_")
      : str(args.cityName || "municipio").replace(/\s+/g, "_");
  const dateStr = new Date().toISOString().slice(0, 10);
  const prefix = scope.type === "school" ? "relatorio_usuarios_escola" : "relatorio_usuarios";
  doc.save(`${prefix}_${safeBase}_${dateStr}.pdf`);
}

