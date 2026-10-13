import { isAxiosError } from 'axios';
import { api } from '@/lib/api';
import { fetchAuthenticatedDownload } from '@/lib/fetch-authenticated-download';
import { isStudentFormType } from '@/services/formTemplatesApi';

/** `idle` é local: o backend não informou execução, mas há um ZIP publicado. */
export type FormPrintPackageStatus = 'processing' | 'completed' | 'failed' | 'idle';

export interface FormPrintPackageStartResponse {
  status: FormPrintPackageStatus;
  taskId: string;
  runId: string;
  formId: string;
  pollingUrl: string;
  downloadUrl: string;
  studentCount: number;
  coverYear: number;
}

export interface FormPrintPackageState {
  status: FormPrintPackageStatus;
  taskId: string | null;
  runId: string | null;
  zipAvailable: boolean;
  studentCount: number;
  generatedCount: number;
  failedCount: number;
  coverYear: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  formId: string;
  pollingUrl: string;
  downloadUrl: string;
}

export class FormPrintPackageError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'FormPrintPackageError';
  }
}

function toPrintPackageError(err: unknown, fallback: string): FormPrintPackageError {
  if (isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    return new FormPrintPackageError(data?.error || data?.message || fallback, err.response?.status);
  }
  return new FormPrintPackageError(err instanceof Error ? err.message : fallback);
}

const basePath = (formId: string) => `/forms/${formId}/print-packages`;

type PrintPackageFormLike = {
  formType: string;
  createdBy?: { id?: string } | string | null;
  createdById?: string;
};

/** Sem id do criador na resposta, a UI libera e o backend decide. */
export function canGenerateFormPrintPackage(
  form: PrintPackageFormLike,
  user: { id?: string; role?: string } | null | undefined,
): boolean {
  if (!isStudentFormType(form.formType)) return false;
  if (user?.role !== 'admin' && user?.role !== 'tecadm') return false;
  const creatorId =
    form.createdById ?? (typeof form.createdBy === 'string' ? form.createdBy : form.createdBy?.id);
  return !creatorId || creatorId === user?.id;
}

export async function startFormPrintPackage(formId: string): Promise<FormPrintPackageStartResponse> {
  try {
    const { data } = await api.post<FormPrintPackageStartResponse>(basePath(formId));
    return data;
  } catch (err) {
    throw toPrintPackageError(err, 'Não foi possível iniciar a geração dos PDFs.');
  }
}

/** Retorna `null` quando o formulário ainda não teve nenhuma geração. */
export async function getFormPrintPackageStatus(formId: string): Promise<FormPrintPackageState | null> {
  try {
    const { data } = await api.get<FormPrintPackageState | null>(basePath(formId));
    if (!data) return null;
    const hasRun = Boolean(data.runId || data.taskId || data.startedAt);
    const knownStatus = data.status === 'processing' || data.status === 'completed' || data.status === 'failed';
    if (!hasRun || !knownStatus) {
      return data.zipAvailable ? { ...data, status: 'idle' } : null;
    }
    return data;
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 404) return null;
    throw toPrintPackageError(err, 'Não foi possível consultar a geração dos PDFs.');
  }
}

export async function downloadFormPrintPackage(formId: string): Promise<void> {
  await fetchAuthenticatedDownload(`${basePath(formId)}/download`, `questionarios_${formId}.zip`, {
    timeout: 0,
  });
}
