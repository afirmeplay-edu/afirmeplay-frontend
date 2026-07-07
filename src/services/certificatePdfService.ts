import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { CertificateTemplateComponent } from '@/components/certificates/CertificateTemplate';
import { loadCertificateImage, getAccessToken, getCityId } from '@/utils/certificateImageUtils';
import type { Certificate, CertificateTemplate } from '@/types/certificates';

export interface ResolvedCertificateImages {
  logoUrl?: string;
  signatureUrl?: string;
}

export interface GenerateCertificatePdfOptions {
  brandingCityId?: string | null;
  scale?: number;
  resolvedImages?: ResolvedCertificateImages;
}

export async function preloadTemplateImages(
  template: CertificateTemplate,
  brandingCityId?: string | null
): Promise<ResolvedCertificateImages> {
  const token = getAccessToken();
  const cityId = brandingCityId ?? getCityId();
  const [logoUrl, signatureUrl] = await Promise.all([
    loadCertificateImage(template.logo_url, token, cityId),
    loadCertificateImage(template.signature_url, token, cityId),
  ]);
  return { logoUrl, signatureUrl };
}

async function renderCertificateToElement(
  certificate: Certificate,
  container: HTMLElement,
  resolvedImages?: ResolvedCertificateImages
): Promise<() => void> {
  const root: Root = createRoot(container);
  const usedTemplate = certificate.template;
  const textContent = usedTemplate.text_content.replace(
    /\{\{nome_aluno\}\}/g,
    certificate.student_name
  );

  root.render(
    createElement(CertificateTemplateComponent, {
      template: { ...usedTemplate, text_content: textContent },
      studentName: certificate.student_name,
      evaluationTitle: certificate.evaluation_title,
      grade: certificate.grade,
      className: 'w-full h-full',
      resolvedImages,
    })
  );

  await new Promise((resolve) => setTimeout(resolve, resolvedImages ? 80 : 600));

  return () => root.unmount();
}

export async function generateCertificatePdfBlob(
  certificate: Certificate,
  options: GenerateCertificatePdfOptions = {}
): Promise<Blob> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '1100px';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);

  const inner = document.createElement('div');
  inner.style.width = '100%';
  inner.style.aspectRatio = '297 / 210';
  container.appendChild(inner);

  let unmount = () => {};
  try {
    const resolvedImages =
      options.resolvedImages ??
      (await preloadTemplateImages(certificate.template, options.brandingCityId));

    unmount = await renderCertificateToElement(certificate, inner, resolvedImages);

    const canvas = await html2canvas(inner, {
      scale: options.scale ?? 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

    return pdf.output('blob');
  } finally {
    unmount();
    document.body.removeChild(container);
  }
}

export async function downloadCertificatePdf(
  certificate: Certificate,
  filename: string,
  options: GenerateCertificatePdfOptions = {}
): Promise<void> {
  const blob = await generateCertificatePdfBlob(certificate, options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
