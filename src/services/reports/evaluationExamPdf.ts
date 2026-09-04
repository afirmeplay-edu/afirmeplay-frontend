import { fetchAuthenticatedDownload } from '@/lib/fetch-authenticated-download';

const EXAM_PDF_TIMEOUT_MS = 180_000;

/** Mesma regra do backend (`exam_pdf_filename`): título da avaliação, sem prova-slug-data. */
function examPdfFallbackFilename(title: string | undefined, includeGabarito: boolean): string {
  let text = (title || '')
    .replace(/\x00/g, '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  if (!text) text = 'avaliacao';
  text = text.slice(0, 180).trim();
  return includeGabarito ? `${text} - gabarito.pdf` : `${text}.pdf`;
}

export async function downloadEvaluationExamPdf(opts: {
  testId: string;
  includeGabarito?: boolean;
  cityId?: string | null;
  title?: string;
}): Promise<void> {
  const includeGabarito = Boolean(opts.includeGabarito);
  await fetchAuthenticatedDownload(
    `/test/${opts.testId}/exam-pdf`,
    examPdfFallbackFilename(opts.title, includeGabarito),
    {
      method: 'POST',
      data: { include_gabarito: includeGabarito },
      timeout: EXAM_PDF_TIMEOUT_MS,
      cityId: opts.cityId ?? undefined,
    }
  );
}
