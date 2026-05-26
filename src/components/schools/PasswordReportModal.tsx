import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { FileSpreadsheet, FileText, Download, Loader2, Calendar, Users } from "lucide-react";
import { useAuth } from "@/context/authContext";
import { generatePasswordFromName } from "@/hooks/useEmailCheck";
import {
  loadCityBrandingForReportPdf,
  paintLetterheadBackground,
} from "@/utils/pdfCityBranding";

type Rgb = [number, number, number];

const REPORT_COLORS: Record<"primary" | "textDark" | "textGray" | "borderLight" | "bgLight" | "white", Rgb> = {
  primary: [124, 62, 237],
  textDark: [31, 41, 55],
  textGray: [107, 114, 128],
  borderLight: [229, 231, 235],
  bgLight: [250, 250, 250],
  white: [255, 255, 255],
};

/** yyyy-mm-dd → dd/mm/aaaa (só exibição). */
function formatDateBr(iso: string): string {
  const day = iso.split("T")[0];
  const [y, m, d] = day.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return iso;
}

type ReportFormat = "excel" | "pdf";

interface PasswordReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolId: string;
  schoolName: string;
  cityId: string;
  classes: Array<{
    id: string;
    name: string;
    grade?: string | { id: string; name: string; education_stage: any };
  }>;
}

interface Grade {
  id: string;
  name: string;
}

interface UserExportRow {
  nome: string;
  email: string;
  senha: string;
  role: "diretor" | "coordenador" | "professor";
  roleLabel: string;
}

interface ManagerSchoolResponseItem {
  user?: {
    name?: string;
    email?: string;
    role?: string;
  };
  manager?: {
    name?: string;
    email?: string;
    role?: string;
  };
}

interface TeacherSchoolResponseItem {
  professor?: {
    name?: string;
    email?: string;
  };
  usuario?: {
    name?: string;
    email?: string;
    role?: string;
  };
}

export function PasswordReportModal({
  isOpen,
  onClose,
  schoolId,
  schoolName,
  cityId,
  classes,
}: PasswordReportModalProps) {
  const { user } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingUsers, setIsGeneratingUsers] = useState(false);
  const [isLoadingGrades, setIsLoadingGrades] = useState(false);
  const { toast } = useToast();

  // Formato do relatório: Excel ou PDF
  const [reportFormat, setReportFormat] = useState<ReportFormat>("excel");

  // Estados dos filtros
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // Estados dos dados
  const [grades, setGrades] = useState<Grade[]>([]);

  // Carregar séries disponíveis das turmas da escola
  useEffect(() => {
    const loadGrades = async () => {
      if (!isOpen || classes.length === 0) {
        setGrades([]);
        return;
      }

      setIsLoadingGrades(true);
      try {
        // Extrair séries únicas das turmas
        const gradeMap = new Map<string, Grade>();
        
        classes.forEach((classItem) => {
          if (classItem.grade) {
            if (typeof classItem.grade === "object" && classItem.grade !== null) {
              const grade = classItem.grade as { id: string; name: string };
              if (grade.id && !gradeMap.has(grade.id)) {
                gradeMap.set(grade.id, {
                  id: grade.id,
                  name: grade.name || "",
                });
              }
            }
          }
        });

        setGrades(Array.from(gradeMap.values()));
      } catch (error) {
        setGrades([]);
      } finally {
        setIsLoadingGrades(false);
      }
    };

    loadGrades();
  }, [isOpen, classes]);

  // Resetar filtros quando o modal fechar
  useEffect(() => {
    if (!isOpen) {
      setReportFormat("excel");
      setSelectedGrade("all");
      setSelectedClass("all");
      setDateFrom("");
      setDateTo("");
    }
  }, [isOpen]);

  // Filtrar turmas por série selecionada
  const filteredClasses = selectedGrade === "all" 
    ? classes 
    : classes.filter((classItem) => {
        if (!classItem.grade) return false;
        if (typeof classItem.grade === "object" && classItem.grade !== null) {
          return (classItem.grade as { id: string }).id === selectedGrade;
        }
        return false;
      });

  const filterSummaryLines = useMemo(() => {
    const formatLabel = reportFormat === "excel" ? "Excel (.xlsx)" : "PDF";
    const gradeLabel =
      selectedGrade === "all"
        ? "Todas as séries"
        : grades.find((g) => g.id === selectedGrade)?.name?.trim() || `Série (id: ${selectedGrade})`;
    const classLabel =
      selectedClass === "all"
        ? "Todas as turmas"
        : classes.find((c) => c.id === selectedClass)?.name?.trim() || `Turma (id: ${selectedClass})`;

    const lines: { key: string; label: string; value: string }[] = [
      { key: "school", label: "Escola", value: schoolName },
      { key: "format", label: "Formato", value: formatLabel },
      { key: "grade", label: "Série", value: gradeLabel },
      { key: "class", label: "Turma", value: classLabel },
    ];

    if (reportFormat === "excel") {
      let period = "Sem filtro de período (todos no escopo acima)";
      if (dateFrom && dateTo) {
        period = `${formatDateBr(dateFrom)} a ${formatDateBr(dateTo)}`;
      } else if (dateFrom) {
        period = `A partir de ${formatDateBr(dateFrom)}`;
      } else if (dateTo) {
        period = `Até ${formatDateBr(dateTo)}`;
      }
      lines.push({ key: "period", label: "Período (cadastro)", value: period });
    }

    return lines;
  }, [
    schoolName,
    reportFormat,
    selectedGrade,
    selectedClass,
    grades,
    classes,
    dateFrom,
    dateTo,
  ]);

  const handleGenerateReport = async () => {
    // Validação de datas (apenas para Excel)
    if (reportFormat === "excel" && dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
      toast({
        title: "Erro de validação",
        description: "A data inicial não pode ser maior que a data final.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsGenerating(true);

      if (reportFormat === "pdf") {
        // --- Relatório PDF ---
        // O layout deste PDF é gerado no backend (endpoint /students/password-report/pdf).
        const params = new URLSearchParams();
        if (schoolId) params.append("school_id", schoolId);
        if (selectedGrade !== "all") params.append("grade_id", selectedGrade);
        if (selectedClass !== "all") params.append("class_id", selectedClass);

        const url = `/students/password-report/pdf?${params.toString()}`;
        const response = await api.get(url, {
          responseType: "blob",
          validateStatus: (status) => status < 500,
        });

        const contentType = response.headers["content-type"] || response.headers["Content-Type"] || "";
        if (contentType.includes("application/json") || (response.status >= 400 && response.status < 500)) {
          const text = await response.data.text();
          let errorData: { error?: string };
          try {
            errorData = JSON.parse(text);
          } catch {
            errorData = { error: "Erro ao processar resposta do servidor." };
          }
          toast({
            title: "Erro ao gerar relatório",
            description: errorData.error || "Não foi possível gerar o relatório PDF. Tente novamente.",
            variant: "destructive",
          });
          return;
        }

        const blob = new Blob([response.data], { type: "application/pdf" });
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;

        const contentDisposition = response.headers["content-disposition"] || response.headers["Content-Disposition"];
        let fileName = `relatorio_acesso_alunos_${schoolName.replace(/\s+/g, "_")}_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.pdf`;
        if (typeof contentDisposition === "string" && contentDisposition.includes("filename=")) {
          const match = contentDisposition.match(/filename[*]?=(?:UTF-8'')?["']?([^"'\s;]+)["']?/i);
          if (match?.[1]) fileName = match[1].trim();
        }
        link.download = fileName;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);

        toast({
          title: "Relatório gerado com sucesso!",
          description: "O arquivo PDF foi baixado automaticamente.",
        });
        onClose();
        return;
      }

      // --- Relatório Excel ---
      const params = new URLSearchParams();
      if (cityId) params.append("city_id", cityId);
      if (schoolId) params.append("school_id", schoolId);
      if (selectedClass !== "all") params.append("class_id", selectedClass);
      if (selectedGrade !== "all") params.append("grade_id", selectedGrade);
      if (dateFrom) params.append("date_from", dateFrom);
      if (dateTo) params.append("date_to", dateTo);

      const url = `/students/password-report?${params.toString()}`;
      const response = await api.get(url, {
        responseType: "blob",
        validateStatus: (status) => status < 500,
      });

      const contentType = response.headers["content-type"] || response.headers["Content-Type"] || "";
      if (contentType.includes("application/json") || (response.status >= 400 && response.status < 500)) {
        const text = await response.data.text();
        let errorData: { error?: string };
        try {
          errorData = JSON.parse(text);
        } catch {
          errorData = { error: "Erro ao processar resposta do servidor." };
        }
        toast({
          title: "Erro ao gerar relatório",
          description: errorData.error || "Não foi possível gerar o relatório. Tente novamente.",
          variant: "destructive",
        });
        return;
      }

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `relatorio-senhas-${schoolName.replace(/\s+/g, "_")}-${new Date().toISOString().split("T")[0]}.xlsx`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      toast({
        title: "Relatório gerado com sucesso!",
        description: "O arquivo Excel foi baixado automaticamente.",
      });
      onClose();
    } catch (error: unknown) {
      let errorMessage = "Não foi possível gerar o relatório. Tente novamente.";

      if (error && typeof error === "object" && "response" in error) {
        const err = error as { response?: { data?: Blob | { error?: string } } };
        if (err.response?.data instanceof Blob) {
          try {
            const text = await err.response.data.text();
            const errorData = JSON.parse(text);
            errorMessage = errorData.error || errorMessage;
          } catch {
            // ignore
          }
        } else if (err.response?.data && typeof err.response.data === "object" && "error" in err.response.data) {
          errorMessage = (err.response.data as { error: string }).error;
        }
      } else if (error instanceof Error && error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Erro ao gerar relatório",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const roleLabel = (role: string): string => {
    const r = role.toLowerCase();
    if (r === "diretor") return "Diretor";
    if (r === "coordenador") return "Coordenador";
    return "Professor";
  };

  const safeFileSchoolName = schoolName.replace(/\s+/g, "_");

  const downloadBlob = (blob: Blob, filename: string) => {
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  };

  const isDefined = <T,>(value: T | null | undefined): value is T => value != null;

  const fetchUsersByRole = async (): Promise<UserExportRow[]> => {
    const [managersResp, teachersResp] = await Promise.all([
      api.get(`/managers/school/${schoolId}`),
      api.get(`/teacher/school/${schoolId}`),
    ]);

    const managers = (managersResp.data?.managers ?? []) as ManagerSchoolResponseItem[];
    const teachers = (teachersResp.data?.professores ?? []) as TeacherSchoolResponseItem[];

    const managerRows = managers
      .map((item) => {
        const usr = item.user ?? item.manager;
        const name = String(usr?.name ?? "").trim();
        const email = String(usr?.email ?? "").trim();
        const role = String(usr?.role ?? "").toLowerCase();
        if (!name || !email || (role !== "diretor" && role !== "coordenador")) return null;
        return {
          nome: name,
          email,
          senha: generatePasswordFromName(name),
          role: role as "diretor" | "coordenador",
          roleLabel: roleLabel(role),
        };
      })
      .filter(isDefined);

    const teacherRows = teachers
      .map((item) => {
        const name = String(item.professor?.name ?? item.usuario?.name ?? "").trim();
        const email = String(item.professor?.email ?? item.usuario?.email ?? "").trim();
        if (!name || !email) return null;
        return {
          nome: name,
          email,
          senha: generatePasswordFromName(name),
          role: "professor" as const,
          roleLabel: "Professor",
        };
      })
      .filter(isDefined);

    const dedup = new Map<string, UserExportRow>();
    [...managerRows, ...teacherRows].forEach((row) => {
      const key = `${row.role}:${row.email.toLowerCase()}`;
      if (!dedup.has(key)) dedup.set(key, row);
    });

    return Array.from(dedup.values()).sort((a, b) => {
      const roleOrder = ["diretor", "coordenador", "professor"];
      const roleDiff = roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
      if (roleDiff !== 0) return roleDiff;
      return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
    });
  };

  const exportUsersExcel = async (rows: UserExportRow[]) => {
    const XLSX = (await import("xlsx-js-style")).default;
    const wb = XLSX.utils.book_new();

    const roleCounts = {
      diretor: rows.filter((row) => row.role === "diretor").length,
      coordenador: rows.filter((row) => row.role === "coordenador").length,
      professor: rows.filter((row) => row.role === "professor").length,
    };

    const purpleHeader = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
      fill: { fgColor: { rgb: "7C3AED" } },
      alignment: { horizontal: "center" as const, vertical: "center" as const },
    };

    const capaData: (string | number)[][] = [
      ["RELATÓRIO DE ACESSO — GESTÃO ESCOLAR"],
      ["Diretores, coordenadores e professores"],
      [""],
      ["Escola", schoolName],
      ["Gerado em", new Date().toLocaleString("pt-BR")],
      ["Total de contas", rows.length],
      ["Diretores", roleCounts.diretor],
      ["Coordenadores", roleCounts.coordenador],
      ["Professores", roleCounts.professor],
      [""],
      [
        "As senhas seguem o mesmo padrão de geração utilizado no cadastro de usuários (relatório de acesso dos alunos).",
      ],
    ];
    const capaSheet = XLSX.utils.aoa_to_sheet(capaData);
    capaSheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
      { s: { r: 10, c: 0 }, e: { r: 10, c: 5 } },
    ];
    capaSheet["!cols"] = [{ wch: 22 }, { wch: 52 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }];
    const addr = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
    capaSheet[addr(0, 0)]!.s = { ...purpleHeader, font: { bold: true, color: { rgb: "FFFFFF" }, sz: 14 } };
    capaSheet[addr(1, 0)]!.s = { ...purpleHeader, font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 } };
    for (let r = 3; r <= 8; r++) {
      capaSheet[addr(r, 0)]!.s = {
        font: { bold: true, color: { rgb: "7C3AED" } },
        alignment: { horizontal: "left" },
      };
    }
    capaSheet[addr(10, 0)]!.s = {
      font: { italic: true, color: { rgb: "6B7280" }, sz: 10 },
      alignment: { horizontal: "left", vertical: "top", wrapText: true },
    };
    XLSX.utils.book_append_sheet(wb, capaSheet, "Capa");

    const groups: Array<{ role: UserExportRow["role"]; label: string }> = [
      { role: "diretor", label: "Diretores" },
      { role: "coordenador", label: "Coordenadores" },
      { role: "professor", label: "Professores" },
    ];

    groups.forEach((group) => {
      const groupRows = rows
        .filter((row) => row.role === group.role)
        .map((row) => [row.nome, row.email, row.senha, row.roleLabel]);
      const sheet = XLSX.utils.aoa_to_sheet([
        ["Nome", "E-mail", "Senha", "Perfil"],
        ...groupRows,
      ]);
      const ref = sheet["!ref"];
      if (ref) {
        const decoded = XLSX.utils.decode_range(ref);
        for (let c = decoded.s.c; c <= decoded.e.c; c++) {
          const a = XLSX.utils.encode_cell({ r: 0, c });
          const cell = sheet[a];
          if (cell) cell.s = purpleHeader;
        }
      }
      sheet["!cols"] = [{ wch: 36 }, { wch: 38 }, { wch: 14 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, sheet, group.label);
    });

    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    downloadBlob(blob, `relatorio_senhas_usuarios_escola_${safeFileSchoolName}.xlsx`);
  };

  const exportUsersPdf = async (rows: UserExportRow[]) => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    type PdfDoc = InstanceType<typeof jsPDF> & { lastAutoTable?: { finalY?: number } };
    const groups: Array<{ role: UserExportRow["role"]; label: string }> = [
      { role: "diretor", label: "Diretores" },
      { role: "coordenador", label: "Coordenadores" },
      { role: "professor", label: "Professores" },
    ];

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pdfDoc = doc as PdfDoc;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const centerX = pageWidth / 2;
    const margin = 14;
    const generatedAt = new Date().toLocaleString("pt-BR");

    const passwordBranding = await loadCityBrandingForReportPdf(cityId);
    const logoAsset = passwordBranding.logo;
    const coverLetterhead = passwordBranding.letterhead;
    const C = REPORT_COLORS;

    const roleCounts = {
      diretor: rows.filter((row) => row.role === "diretor").length,
      coordenador: rows.filter((row) => row.role === "coordenador").length,
      professor: rows.filter((row) => row.role === "professor").length,
    };

    const drawCover = () => {
      const BAND_H = 58;
      if (coverLetterhead) {
        paintLetterheadBackground(doc, coverLetterhead, pageWidth, pageHeight);
      } else {
        doc.setFillColor(...C.white);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
      }
      doc.setFillColor(...C.primary);
      doc.rect(0, 0, pageWidth, BAND_H, "F");

      let logoBottom = 0;
      if (logoAsset?.dataUrl && logoAsset.iw > 0 && logoAsset.ih > 0) {
        const desiredW = 38;
        const desiredH = (logoAsset.ih * desiredW) / logoAsset.iw;
        doc.addImage(logoAsset.dataUrl, "PNG", centerX - desiredW / 2, 7, desiredW, desiredH);
        logoBottom = 7 + desiredH;
      } else {
        doc.setFontSize(18);
        doc.setTextColor(...C.white);
        doc.setFont("helvetica", "bold");
        doc.text("AFIRME PLAY", centerX, 22, { align: "center" });
        logoBottom = 28;
      }

      const titleY = Math.max(logoBottom + 5, BAND_H - 17);
      doc.setTextColor(...C.white);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text("RELATÓRIO DE ACESSO", centerX, titleY, { align: "center" });
      doc.setFontSize(11);
      doc.text("GESTÃO ESCOLAR — CONTAS E SENHAS", centerX, titleY + 8, { align: "center" });

      const y = BAND_H + 18;
      const cardW = pageWidth - 40;
      const cardX = (pageWidth - cardW) / 2;
      const cardH = 70;
      const ACCENT_W = 4;
      doc.setFillColor(...C.bgLight);
      doc.rect(cardX, y, cardW, cardH, "F");
      doc.setFillColor(...C.primary);
      doc.rect(cardX, y, ACCENT_W, cardH, "F");
      doc.setDrawColor(...C.borderLight);
      doc.setLineWidth(0.4);
      doc.rect(cardX, y, cardW, cardH, "S");

      let cy = y + 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...C.primary);
      doc.text("INFORMAÇÕES", cardX + ACCENT_W + (cardW - ACCENT_W) / 2, cy, { align: "center" });
      cy += 6;
      doc.setDrawColor(...C.borderLight);
      doc.setLineWidth(0.3);
      doc.line(cardX + ACCENT_W + 4, cy, cardX + cardW - 4, cy);
      cy += 8;

      const labelX = cardX + ACCENT_W + 10;
      const valueX = labelX + 52;
      const rowH = 7;
      const infoRows: Array<[string, string]> = [
        ["Escola:", schoolName],
        ["Gerado em:", generatedAt],
        ["Total de contas:", String(rows.length)],
        ["Diretores:", String(roleCounts.diretor)],
        ["Coordenadores:", String(roleCounts.coordenador)],
        ["Professores:", String(roleCounts.professor)],
      ];
      doc.setFontSize(10);
      for (const [label, value] of infoRows) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.primary);
        doc.text(label, labelX, cy);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textDark);
        doc.text(value, valueX, cy, { maxWidth: cardW - (valueX - cardX) - 12 });
        cy += rowH;
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...C.textGray);
      doc.text(
        "As senhas seguem o mesmo padrão de geração utilizado no cadastro de usuários (relatório de acesso dos alunos).",
        margin,
        y + cardH + 10,
        { maxWidth: pageWidth - 2 * margin }
      );
    };

    drawCover();
    doc.addPage();
    let startY = margin;

    groups.forEach((group) => {
      const groupRows = rows
        .filter((row) => row.role === group.role)
        .map((row) => [row.nome, row.email, row.senha]);

      if (startY > 240) {
        doc.addPage();
        startY = margin;
      }

      doc.setTextColor(...C.textDark);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`${group.label} (${groupRows.length})`, margin, startY);

      autoTable(doc, {
        startY: startY + 3,
        head: [["Nome", "E-mail", "Senha"]],
        body: groupRows.length > 0 ? groupRows : [["Sem registros", "-", "-"]],
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 2, textColor: [31, 41, 55] },
        headStyles: { fillColor: [124, 62, 237], textColor: 255 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        margin: { left: margin, right: margin },
        columnStyles: {
          0: { cellWidth: 58 },
          1: { cellWidth: 78 },
          2: { cellWidth: 36 },
        },
      });

      startY = (pdfDoc.lastAutoTable?.finalY ?? startY) + 10;
    });

    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page++) {
      doc.setPage(page);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text("AFIRME EDUCACIONAL", margin, pageHeight - 10);
      doc.text(`Página ${page} de ${totalPages}`, centerX, pageHeight - 10, { align: "center" });
      doc.text(generatedAt, pageWidth - margin, pageHeight - 10, { align: "right" });
    }

    doc.save(`relatorio_senhas_usuarios_escola_${safeFileSchoolName}.pdf`);
  };

  const handleGenerateUsersReport = async () => {
    try {
      setIsGeneratingUsers(true);
      const rows = await fetchUsersByRole();
      if (rows.length === 0) {
        toast({
          title: "Sem dados para exportar",
          description: "Não foram encontrados diretores, coordenadores ou professores nesta escola.",
          variant: "destructive",
        });
        return;
      }

      if (reportFormat === "pdf") {
        await exportUsersPdf(rows);
      } else {
        await exportUsersExcel(rows);
      }

      toast({
        title: "Relatório gerado com sucesso!",
        description: `Relatório de contas e senhas (${reportFormat.toUpperCase()}) baixado.`,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Não foi possível gerar o relatório de usuários.";
      toast({
        title: "Erro ao gerar relatório",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingUsers(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-2xl lg:max-w-3xl max-h-[95vh] overflow-y-auto">
        <DialogHeader className="pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Relatório de Senhas e Logins
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base mt-2">
            Gere um relatório com as senhas e logins dos alunos da escola{" "}
            <strong>{schoolName}</strong>. Escolha o formato (Excel ou PDF) e opcionalmente filtre por série ou turma.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Formato do relatório */}
          <div className="space-y-2">
            <Label>Formato do relatório</Label>
            <Select
              value={reportFormat}
              onValueChange={(v) => setReportFormat(v as ReportFormat)}
              disabled={isGenerating}
            >
              <SelectTrigger className="max-w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excel">
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    Excel (.xlsx)
                  </span>
                </SelectItem>
                <SelectItem value="pdf">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-red-600" />
                    PDF
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Informações pré-preenchidas */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="font-medium text-sm mb-2 text-blue-800 dark:text-blue-400">
              Filtros aplicados neste relatório:
            </h4>
            <div className="space-y-1 text-sm text-blue-700 dark:text-blue-300">
              {filterSummaryLines.map((line) => (
                <p key={line.key}>
                  <strong>{line.label}:</strong> {line.value}
                </p>
              ))}
              {reportFormat === "excel" && (
                <p className="text-xs text-blue-600/90 dark:text-blue-400/90 pt-1 border-t border-blue-200/60 dark:border-blue-800/60 mt-2">
                  No Excel, a cidade já entra no escopo da escola selecionada na exportação.
                </p>
              )}
            </div>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Série */}
            <div className="space-y-2">
              <Label htmlFor="grade">Série</Label>
              <Select
                value={selectedGrade}
                onValueChange={setSelectedGrade}
                disabled={isLoadingGrades || isGenerating}
              >
                <SelectTrigger id="grade">
                  <SelectValue placeholder="Selecione a série (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as séries</SelectItem>
                  {grades.map((grade) => (
                    <SelectItem key={grade.id} value={grade.id}>
                      {grade.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Turma */}
            <div className="space-y-2">
              <Label htmlFor="class">Turma</Label>
              <Select
                value={selectedClass}
                onValueChange={setSelectedClass}
                disabled={isGenerating || (selectedGrade !== "all" && filteredClasses.length === 0)}
              >
                <SelectTrigger id="class">
                  <SelectValue placeholder="Selecione a turma (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as turmas</SelectItem>
                  {filteredClasses.map((classItem) => (
                    <SelectItem key={classItem.id} value={classItem.id}>
                      {classItem.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedGrade !== "all" && filteredClasses.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma turma encontrada para esta série.
                </p>
              )}
            </div>

            {/* Datas: apenas para Excel */}
            {reportFormat === "excel" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="dateFrom">
                    <Calendar className="inline h-4 w-4 mr-1" />
                    Data Inicial (opcional)
                  </Label>
                  <Input
                    id="dateFrom"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    disabled={isGenerating}
                    max={dateTo || undefined}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateTo">
                    <Calendar className="inline h-4 w-4 mr-1" />
                    Data Final (opcional)
                  </Label>
                  <Input
                    id="dateTo"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    disabled={isGenerating}
                    min={dateFrom || undefined}
                  />
                </div>
              </>
            )}
          </div>

          {/* Informação sobre filtros */}
          <div className="bg-muted/50 border border-border rounded-lg p-4">
            <p className="text-sm text-muted-foreground">
              💡 <strong>Dica:</strong> Se nenhum filtro for selecionado, o relatório incluirá
              todos os alunos da escola. Use série ou turma para refinar.
              {reportFormat === "excel" && " No Excel, você também pode filtrar por período (datas)."}
            </p>
          </div>

          <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
            <p className="text-sm text-orange-800 dark:text-orange-300">
              <strong>Contas de gestão:</strong> você também pode exportar diretor, coordenador e professor,
              separados por perfil, com senha gerada no mesmo padrão atual do sistema.
            </p>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isGenerating}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleGenerateUsersReport}
              disabled={isGenerating || isGeneratingUsers}
              className="w-full sm:w-auto"
            >
              {isGeneratingUsers ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exportando contas...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 mr-2" />
                  Exportar contas (gestão)
                </>
              )}
            </Button>
            <Button
              onClick={handleGenerateReport}
              disabled={isGenerating || isGeneratingUsers}
              className="w-full sm:w-auto"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando relatório...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Gerar Relatório (alunos)
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

