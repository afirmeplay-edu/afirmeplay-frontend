import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ComparativePDFLayout,
  type ComparativePDFLayoutProps,
} from '@/components/comparative/ComparativePDFLayout';
import type { ComparativeResumo } from '@/services/reports/comparativeReportApi';

async function waitForChartsReady(root: HTMLElement, timeoutMs = 15000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const charts = Array.from(root.querySelectorAll('[data-comparative-chart]'));
    if (charts.length === 0) return;
    const ready = charts.every((el) => el.getAttribute('data-chart-ready') === '1');
    if (ready) {
      await new Promise((r) => setTimeout(r, 350));
      return;
    }
    await new Promise((r) => setTimeout(r, 120));
  }
}

async function captureSection(
  element: HTMLElement,
  html2canvas: (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>
): Promise<HTMLCanvasElement> {
  return html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    width: element.scrollWidth,
    height: element.scrollHeight,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });
}

function addCanvasToPdf(
  pdf: InstanceType<typeof import('jspdf').jsPDF>,
  canvas: HTMLCanvasElement,
  margin = 12
): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;
  const imgWidth = usableWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = margin;
  const imgData = canvas.toDataURL('image/png');

  pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
  heightLeft -= usableHeight;

  while (heightLeft > 0) {
    position = margin - (imgHeight - heightLeft);
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
    heightLeft -= usableHeight;
  }
}

export type ComparativePdfOptions = {
  report: ComparativeResumo;
  escolaNome?: string;
  serieNome?: string;
  turmaNome?: string;
};

export async function generateComparativePdf(options: ComparativePdfOptions): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const html2canvas = (await import('html2canvas')).default;

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.zIndex = '-1';
  document.body.appendChild(host);

  const generatedAt = new Date().toLocaleString('pt-BR');
  const layoutProps: ComparativePDFLayoutProps = {
    report: options.report,
    generatedAt,
    escolaNome: options.escolaNome,
    serieNome: options.serieNome,
    turmaNome: options.turmaNome,
  };

  const root = createRoot(host);
  try {
    root.render(React.createElement(ComparativePDFLayout, layoutProps));
    await new Promise((r) => setTimeout(r, 80));
    const pdfRoot = host.querySelector('[data-comparative-pdf-root]') as HTMLElement | null;
    if (!pdfRoot) {
      throw new Error('Falha ao montar o layout do PDF comparativo.');
    }
    await waitForChartsReady(pdfRoot);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const sections = Array.from(
      pdfRoot.querySelectorAll('[data-pdf-section]')
    ) as HTMLElement[];

    for (let i = 0; i < sections.length; i += 1) {
      const canvas = await captureSection(sections[i], html2canvas);
      if (i > 0) pdf.addPage();
      addCanvasToPdf(pdf, canvas);
    }

    const municipio = options.report.filtros_aplicados.municipio.nome.replace(/\s+/g, '_');
    pdf.save(`relatorio_comparativo_${municipio}_${Date.now()}.pdf`);
  } finally {
    root.unmount();
    host.remove();
  }
}
