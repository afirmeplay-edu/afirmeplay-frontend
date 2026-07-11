import {
  loadCityBrandingPdfAssets,
  paintLetterheadBackground,
  urlToPngAsset,
} from '@/utils/pdfCityBranding';

export type FormReportsStudentPdfItem = {
  alunoNome: string;
  escolaNome: string;
  gradeName: string;
  className?: string;
  resposta?: string;
};

export type FormReportsStudentsPdfInput = {
  indexTitle: string;
  students: FormReportsStudentPdfItem[];
  municipalityId?: string;
  municipalityName?: string;
  schoolNames?: string;
  formTitle?: string;
  gradeNames?: string;
  classNames?: string;
};

export async function generateFormReportsStudentsPdf(
  input: FormReportsStudentsPdfInput
): Promise<void> {
  const jsPDFModule = await import('jspdf');
  const jsPDF = (jsPDFModule as { default?: typeof jsPDFModule }).default || jsPDFModule;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const centerX = pageWidth / 2;
  const bottomLimit = pageHeight - margin;

  const primaryRgb: [number, number, number] = [124, 58, 237];
  const textDark: [number, number, number] = [31, 41, 55];
  const textMuted: [number, number, number] = [107, 114, 128];
  const cardBg: [number, number, number] = [248, 250, 252];
  const cardBorder: [number, number, number] = [226, 232, 240];
  const mutedBg: [number, number, number] = [241, 245, 249];

  const branding =
    input.municipalityId && input.municipalityId !== 'all'
      ? await loadCityBrandingPdfAssets(input.municipalityId)
      : { letterhead: null, logo: null };

  if (branding.letterhead) {
    paintLetterheadBackground(doc, branding.letterhead, pageWidth, pageHeight);
  }
  const hasLetterhead = Boolean(branding.letterhead);
  const logoAsset = branding.logo ?? (await urlToPngAsset('/LOGO-1.png'));

  let y = hasLetterhead ? 22 : 14;

  const ensureSpace = (heightNeeded: number) => {
    if (y + heightNeeded > bottomLimit) {
      doc.addPage();
      if (branding.letterhead) {
        paintLetterheadBackground(doc, branding.letterhead!, pageWidth, pageHeight);
      }
      y = hasLetterhead ? 22 : 14;
      drawPageHeader();
    }
  };

  const drawPageHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...primaryRgb);
    const shortTitle =
      input.indexTitle.length > 52 ? `${input.indexTitle.slice(0, 49)}…` : input.indexTitle;
    doc.text(shortTitle, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...textMuted);
    doc.text(`${input.students.length} aluno(s)`, pageWidth - margin, y, { align: 'right' });
    y += 6;
    doc.setDrawColor(...cardBorder);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  };

  if (logoAsset?.dataUrl && logoAsset.iw > 0 && logoAsset.ih > 0) {
    const desiredLogoWidth = 32;
    const desiredLogoHeight = (logoAsset.ih * desiredLogoWidth) / logoAsset.iw;
    doc.addImage(
      logoAsset.dataUrl,
      'PNG',
      centerX - desiredLogoWidth / 2,
      y,
      desiredLogoWidth,
      desiredLogoHeight
    );
    y += desiredLogoHeight + 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...primaryRgb);
  doc.text(input.indexTitle, centerX, y, { align: 'center' });
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...textMuted);
  doc.text('Lista de alunos identificados nesta categoria', centerX, y, { align: 'center' });
  y += 10;

  const filterRows: Array<{ label: string; value?: string }> = [
    { label: 'Município', value: input.municipalityName },
    { label: 'Formulário', value: input.formTitle },
    { label: 'Escola(s)', value: input.schoolNames },
    { label: 'Série(s)', value: input.gradeNames },
    { label: 'Turma(s)', value: input.classNames },
  ].filter((row) => row.value && row.value !== '—');

  if (filterRows.length > 0) {
    ensureSpace(filterRows.length * 5 + 8);
    doc.setFillColor(...cardBg);
    doc.setDrawColor(...cardBorder);
    doc.setLineWidth(0.25);
    const infoHeight = filterRows.length * 5 + 6;
    doc.rect(margin, y, contentWidth, infoHeight, 'FD');
    let infoY = y + 5;
    filterRows.forEach((row) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...textDark);
      doc.text(`${row.label}:`, margin + 3, infoY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...textMuted);
      const valueLines = doc.splitTextToSize(row.value ?? '', contentWidth - 38) as string[];
      doc.text(valueLines, margin + 32, infoY);
      infoY += Math.max(5, valueLines.length * 4);
    });
    y += infoHeight + 8;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...textDark);
  doc.text(`Total: ${input.students.length} aluno(s)`, margin, y);
  y += 8;

  drawPageHeader();

  const drawStudentCard = (student: FormReportsStudentPdfItem) => {
    const gradeLine = student.className
      ? `${student.gradeName} - Turma ${student.className}`
      : student.gradeName;
    const resposta = student.resposta?.trim() ?? '';
    const respostaLines = resposta
      ? (doc.splitTextToSize(`Resposta: ${resposta}`, contentWidth - 14) as string[])
      : [];
    const respostaBlockH = respostaLines.length > 0 ? respostaLines.length * 4 + 6 : 0;
    const cardHeight = 10 + 5 + 5 + (respostaBlockH > 0 ? respostaBlockH + 3 : 0) + 4;

    ensureSpace(cardHeight + 2);

    doc.setFillColor(...cardBg);
    doc.setDrawColor(...cardBorder);
    doc.setLineWidth(0.25);
    doc.rect(margin, y, contentWidth, cardHeight, 'FD');

    let cardY = y + 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...textDark);
    const nameLines = doc.splitTextToSize(student.alunoNome || '—', contentWidth - 8) as string[];
    doc.text(nameLines, margin + 4, cardY);
    cardY += nameLines.length * 5 + 2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...textMuted);
    doc.text(`Escola: ${student.escolaNome || '—'}`, margin + 4, cardY);
    cardY += 5;
    doc.text(`Série: ${gradeLine || '—'}`, margin + 4, cardY);
    cardY += 5;

    if (respostaLines.length > 0) {
      doc.setFillColor(...mutedBg);
      doc.rect(margin + 4, cardY, contentWidth - 8, respostaBlockH, 'F');
      doc.setFontSize(8);
      doc.setTextColor(...textDark);
      doc.text(respostaLines, margin + 6, cardY + 4);
    }

    y += cardHeight + 3;
  };

  if (input.students.length === 0) {
    ensureSpace(10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...textMuted);
    doc.text('Nenhum aluno encontrado.', centerX, y, { align: 'center' });
  } else {
    input.students.forEach(drawStudentCard);
  }

  const safeTitle = input.indexTitle.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  doc.save(`Alunos_${safeTitle}_${dateStr}.pdf`);
}
