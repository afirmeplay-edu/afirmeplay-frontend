import React from 'react';
import { createRoot } from 'react-dom/client';
import { api } from '@/lib/api';
import {
  EvaluationExamPdfLayout,
  type ExamPdfQuestion,
  type ExamPdfSubjectBlock,
} from '@/components/evaluations/exam-pdf/EvaluationExamPdfLayout';
import {
  drawMunicipalLogoTopCenter,
  loadCityBrandingForReportPdf,
} from '@/utils/pdfCityBranding';
import type { Question } from '@/types/evaluation-types';

const COLORS = {
  primary: [124, 62, 237] as [number, number, number],
  textDark: [31, 41, 55] as [number, number, number],
  textGray: [107, 114, 128] as [number, number, number],
};

function normalizeExamPdfQuestion(raw: Question & Record<string, unknown>): ExamPdfQuestion {
  const options =
    raw.options?.length
      ? raw.options
      : (raw.alternatives as ExamPdfQuestion['alternatives']) ?? [];

  return {
    id: raw.id,
    type: String(raw.type ?? ''),
    text: raw.text,
    formattedText: raw.formattedText,
    secondStatement: raw.secondStatement ?? (raw.secondstatement as string | undefined),
    subject: raw.subject,
    options,
    alternatives: raw.alternatives,
    value: Number(raw.value ?? raw.points ?? 0) || undefined,
    points: Number(raw.points ?? 0) || undefined,
    solution: (raw.solution as string | undefined) ?? '',
    formattedSolution: (raw.formattedSolution as string | undefined) ?? '',
    difficulty: String(raw.difficulty ?? ''),
  };
}

function questionNeedsDetails(q: ExamPdfQuestion, includeGabarito: boolean): boolean {
  const isMc =
    q.type === 'multipleChoice' ||
    q.type === 'multiple_choice' ||
    q.type === 'trueFalse' ||
    q.type === 'true_false';
  const missingOptions = isMc && !(q.options?.length || q.alternatives?.length);
  const missingHtml = !q.formattedText?.trim() && !q.text?.trim();
  const missingSolution =
    includeGabarito && !q.formattedSolution?.trim() && !q.solution?.trim();
  return Boolean(q.id && (missingOptions || missingHtml || missingSolution));
}

export async function preloadExamPdfQuestions(
  questions: Array<Question & Record<string, unknown>>,
  includeGabarito = false
): Promise<ExamPdfQuestion[]> {
  return Promise.all(
    questions.map(async (q) => {
      const base = normalizeExamPdfQuestion(q);
      if (!questionNeedsDetails(base, includeGabarito)) return base;

      try {
        const res = await api.get<Question & Record<string, unknown>>(`/questions/${q.id}`);
        return normalizeExamPdfQuestion({ ...q, ...res.data });
      } catch {
        return base;
      }
    })
  );
}

async function waitForImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              setTimeout(resolve, 8000);
            })
    )
  );
}

async function captureSection(
  element: HTMLElement,
  html2canvas: typeof import('html2canvas').default,
  scale = 2
): Promise<HTMLCanvasElement> {
  return html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    width: element.scrollWidth,
    height: element.scrollHeight,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
    letterRendering: true,
  });
}

function addSectionToPDF(
  pdf: import('jspdf').jsPDF,
  canvas: HTMLCanvasElement,
  currentY: number,
  pageHeight: number,
  marginTop: number,
  marginBottom: number,
  marginLeft: number,
  marginRight: number,
  imgWidth: number
): number {
  const usableHeight = pageHeight - marginTop - marginBottom;
  const usableWidth = imgWidth - marginLeft - marginRight;
  const imgHeight = (canvas.height * usableWidth) / canvas.width;

  let imgData: string;
  let imageFormat: 'PNG' | 'JPEG';
  try {
    imgData = canvas.toDataURL('image/png');
    imageFormat = 'PNG';
  } catch {
    imgData = canvas.toDataURL('image/jpeg', 0.92);
    imageFormat = 'JPEG';
  }

  if (currentY + imgHeight > pageHeight - marginBottom) {
    pdf.addPage();
    currentY = marginTop;
  }

  pdf.addImage(imgData, imageFormat, marginLeft, currentY, usableWidth, imgHeight);
  return currentY + imgHeight + 4;
}

function drawCoverPage(
  pdf: import('jspdf').jsPDF,
  opts: {
    title: string;
    gradeName?: string;
    courseName?: string;
    totalQuestions: number;
    includeGabarito: boolean;
    logo: Awaited<ReturnType<typeof loadCityBrandingForReportPdf>>['logo'];
  }
): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  if (opts.logo) {
    y = drawMunicipalLogoTopCenter(pdf, pageWidth, y, opts.logo, 40, 16);
    y += 4;
  }

  pdf.setFillColor(...COLORS.primary);
  pdf.rect(0, y, pageWidth, 14, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Prova / Avaliação', pageWidth / 2, y + 9, { align: 'center' });
  y += 22;

  pdf.setTextColor(...COLORS.textDark);
  pdf.setFontSize(16);
  const titleLines = pdf.splitTextToSize(opts.title, pageWidth - margin * 2) as string[];
  pdf.text(titleLines, pageWidth / 2, y, { align: 'center' });
  y += titleLines.length * 7 + 6;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(...COLORS.textGray);

  const meta: string[] = [];
  if (opts.courseName) meta.push(`Curso: ${opts.courseName}`);
  if (opts.gradeName) meta.push(`Série: ${opts.gradeName}`);
  meta.push(`Total de questões: ${opts.totalQuestions}`);
  meta.push(opts.includeGabarito ? 'Documento com gabarito' : 'Documento para aplicação (sem gabarito)');

  meta.forEach((line) => {
    pdf.text(line, pageWidth / 2, y, { align: 'center' });
    y += 5.5;
  });

  y += 4;
  pdf.setFontSize(9);
  pdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, y, { align: 'center' });
}

function addFooters(pdf: import('jspdf').jsPDF, title: string): void {
  const pageCount = pdf.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const shortTitle = title.length > 60 ? `${title.slice(0, 57)}…` : title;

  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.textGray);
    pdf.text(shortTitle, 14, pageHeight - 8);
    pdf.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
  }
}

export async function generateEvaluationExamPdf(opts: {
  title: string;
  subjects: ExamPdfSubjectBlock[];
  includeGabarito: boolean;
  gradeName?: string;
  courseName?: string;
  cityId?: string | null;
}): Promise<void> {
  const allRawQuestions = opts.subjects.flatMap((s) => s.questions as Array<Question & Record<string, unknown>>);
  const loadedQuestions = await preloadExamPdfQuestions(allRawQuestions, opts.includeGabarito);

  const questionsById = new Map(loadedQuestions.map((q) => [q.id, q]));
  const subjects: ExamPdfSubjectBlock[] = opts.subjects.map(({ subject, questions }) => ({
    subject,
    questions: questions.map((q) => questionsById.get(q.id) ?? normalizeExamPdfQuestion(q as Question & Record<string, unknown>)),
  }));

  const totalQuestions = subjects.reduce((sum, s) => sum + s.questions.length, 0);
  if (totalQuestions === 0) {
    throw new Error('Nenhuma questão disponível para exportar.');
  }

  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  const container = document.createElement('div');
  container.style.cssText = `
    position: absolute;
    top: -10000px;
    left: -10000px;
    width: 180mm;
    background: white;
  `;
  document.body.appendChild(container);

  const root = createRoot(container);

  await new Promise<void>((resolve) => {
    root.render(
      React.createElement(EvaluationExamPdfLayout, {
        title: opts.title,
        subjects,
        includeGabarito: opts.includeGabarito,
        gradeName: opts.gradeName,
        courseName: opts.courseName,
      })
    );
    setTimeout(resolve, 400);
  });

  await waitForImages(container);
  await new Promise((r) => setTimeout(r, 300));

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const imgWidth = 210;
  const pageHeight = 297;
  const marginTop = 14;
  const marginBottom = 14;
  const marginLeft = 14;
  const marginRight = 14;

  const { logo } = await loadCityBrandingForReportPdf(opts.cityId ?? null);
  drawCoverPage(pdf, {
    title: opts.title,
    gradeName: opts.gradeName,
    courseName: opts.courseName,
    totalQuestions,
    includeGabarito: opts.includeGabarito,
    logo,
  });

  pdf.addPage();
  let currentY = marginTop;

  const sections = Array.from(container.querySelectorAll('[data-pdf-section]')) as HTMLElement[];

  for (const section of sections) {
    try {
      const canvas = await captureSection(section, html2canvas, 2);
      if (!canvas.width || !canvas.height) continue;
      currentY = addSectionToPDF(
        pdf,
        canvas,
        currentY,
        pageHeight,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        imgWidth
      );
    } catch (err) {
      console.warn('Falha ao capturar seção do PDF:', err);
    }
  }

  root.unmount();
  document.body.removeChild(container);

  addFooters(pdf, opts.title);

  const safeName = opts.title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase() || 'prova';

  const suffix = opts.includeGabarito ? 'gabarito' : 'prova';
  pdf.save(`${safeName}-${suffix}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
