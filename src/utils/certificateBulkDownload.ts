import { CertificatesApiService } from '@/services/certificatesApi';
import {
  generateCertificatePdfBlob,
  preloadTemplateImages,
} from '@/services/certificatePdfService';
import {
  buildHierarchyPath,
  downloadBlob,
  generateZipBlob,
  sanitizePathSegment,
} from '@/services/reports/hierarchicalDownload';
import type {
  Certificate,
  CertificateBatchFilters,
  CertificateBatchItem,
  CertificateBatchResponse,
} from '@/types/certificates';

export interface BulkDownloadProgress {
  phase: 'fetching' | 'generating' | 'zipping';
  current: number;
  total: number;
}

export interface DownloadCertificatesBatchOptions {
  evaluationId: string;
  evaluationTitle: string;
  filters?: CertificateBatchFilters;
  brandingCityId?: string | null;
  onProgress?: (progress: BulkDownloadProgress) => void;
  signal?: AbortSignal;
  clientFilter?: (item: CertificateBatchItem) => boolean;
}

function mapBatchItemToCertificate(
  item: CertificateBatchItem,
  batch: CertificateBatchResponse
): Certificate {
  return {
    id: item.certificate_id,
    student_id: item.student_id,
    student_name: item.student_name,
    evaluation_id: batch.evaluation_id,
    evaluation_title: batch.evaluation_title,
    grade: item.grade,
    template: batch.template,
    issued_at: item.issued_at,
    status: item.certificate_status === 'approved' ? 'approved' : 'pending',
  };
}

function certificateFileName(studentName: string): string {
  return `certificado-${sanitizePathSegment(studentName)}.pdf`;
}

export async function downloadCertificatesBatch(
  options: DownloadCertificatesBatchOptions
): Promise<void> {
  const {
    evaluationId,
    evaluationTitle,
    filters = { status: 'approved' },
    brandingCityId,
    onProgress,
    signal,
    clientFilter,
  } = options;

  onProgress?.({ phase: 'fetching', current: 0, total: 1 });

  const batch = await CertificatesApiService.getCertificatesBatch(evaluationId, {
    status: 'approved',
    ...filters,
  });

  if (signal?.aborted) {
    throw new DOMException('Download cancelado', 'AbortError');
  }

  const certificates = clientFilter
    ? batch.certificates.filter(clientFilter)
    : batch.certificates;

  if (!certificates.length) {
    throw new Error('Nenhum certificado aprovado encontrado para o escopo selecionado.');
  }

  const resolvedImages = await preloadTemplateImages(batch.template, brandingCityId);
  const total = certificates.length;
  const entries: { path: string; blob: Blob }[] = [];

  for (let i = 0; i < certificates.length; i++) {
    if (signal?.aborted) {
      throw new DOMException('Download cancelado', 'AbortError');
    }

    const item = certificates[i];
    const certificate = mapBatchItemToCertificate(item, batch);
    const blob = await generateCertificatePdfBlob(certificate, {
      brandingCityId,
      scale: 2,
      resolvedImages,
    });

    entries.push({
      path: buildHierarchyPath({
        escola: item.school_name ?? 'Sem escola',
        serie: item.grade_name ?? `Serie ${item.grade}`,
        turma: item.class_name ?? 'Sem turma',
        fileName: certificateFileName(item.student_name),
      }),
      blob,
    });

    onProgress?.({ phase: 'generating', current: i + 1, total });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (entries.length === 1) {
    downloadBlob(entries[0].blob, entries[0].path.split('/').pop()!);
    return;
  }

  onProgress?.({ phase: 'zipping', current: 0, total: entries.length });

  const zipBlob = await generateZipBlob(entries, (current, zipTotal) => {
    onProgress?.({ phase: 'zipping', current, total: zipTotal });
  });

  const safeTitle = sanitizePathSegment(evaluationTitle);
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(zipBlob, `certificados-${safeTitle}-${date}.zip`);
}
