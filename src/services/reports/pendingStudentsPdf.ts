
import { drawMunicipalLogoTopCenter, loadCityBrandingForReportPdf } from '@/utils/pdfCityBranding';

import { getClassShiftLabel } from "@/lib/classShift";


export type PendingStudentRow = {
  nome?: string;
  escola?: string;
  turma?: string;
  serie?: string;
  shift?: string;
  statusLabel?: string;
};

export async function generatePendingStudentsPdf(opts: {
  title: string;
  subtitle?: string;
  students: PendingStudentRow[];
  fileName?: string;
  /** UUID do município para logo municipal no PDF. */
  cityId?: string | null;
}) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 14;

  const { logo } = await loadCityBrandingForReportPdf(opts.cityId ?? null);
  let y = margin;
  if (logo) {
    y = drawMunicipalLogoTopCenter(pdf, pageWidth, y, logo, 34, 13);
    y += 2;
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(opts.title, pageWidth / 2, y, { align: 'center' });
  y += 8;

  const subtitle = (opts.subtitle ?? '').trim();
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  if (subtitle) {
    pdf.text(subtitle, pageWidth / 2, y, { align: 'center' });
    y += 6;
  }

  pdf.setFontSize(9);
  pdf.setTextColor(107, 114, 128);
  pdf.text(`Total: ${opts.students.length} • Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, y + 4);
  pdf.setTextColor(0, 0, 0);

  const rows = opts.students.map((s) => {
    const turno = s.shift ? getClassShiftLabel(s.shift) : "";
    const meta = [s.escola, s.turma, s.serie, turno && turno !== "Sem turno" ? turno : ""]
      .filter(Boolean)
      .join(' • ') || '—';
    return [s.nome?.trim() || '—', meta, (s.statusLabel ?? 'Pendente').trim() || 'Pendente'];
  });

  autoTable(pdf, {
    head: [['Aluno', 'Escola • Turma • Série', 'Status']],
    body: rows,
    startY: y + 10,
    theme: 'grid',
    margin: { left: margin, right: margin },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [124, 62, 237], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 90 },
      2: { cellWidth: 22, halign: 'center' },
    },
    didDrawPage: (data) => {
      const pageCount = pdf.getNumberOfPages();
      const pageNumber = pdf.getCurrentPageInfo().pageNumber;
      pdf.setFontSize(8);
      pdf.setTextColor(107, 114, 128);
      pdf.text(`Página ${pageNumber} de ${pageCount}`, pageWidth / 2, pdf.internal.pageSize.getHeight() - 8, {
        align: 'center',
      });
      pdf.setTextColor(0, 0, 0);
    },
  });

  const safeNameBase =
    (opts.fileName ?? opts.title)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'pendentes';

  const fileName = `${safeNameBase}-${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(fileName);
}
