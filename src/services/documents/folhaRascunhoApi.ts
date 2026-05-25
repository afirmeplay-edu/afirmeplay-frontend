import { api } from "@/lib/api";
import type {
  FolhaRascunhoClassStudentOption,
  FolhaRascunhoDadosParams,
  FolhaRascunhoDadosResponse,
} from "@/types/folha-rascunho";

export type FolhaRascunhoClassStudent = FolhaRascunhoClassStudentOption;

function requestConfig(cityId?: string) {
  return cityId && cityId !== "all" ? { meta: { cityId } } : {};
}

export async function getFolhaRascunhoDados(
  params: FolhaRascunhoDadosParams
): Promise<FolhaRascunhoDadosResponse> {
  const query = new URLSearchParams();
  query.append("modo", params.modo);
  if (params.estado?.trim()) query.append("estado", params.estado.trim());
  query.append("municipio", params.municipio);
  if (params.escola?.trim()) query.append("escola", params.escola.trim());
  if (params.serie?.trim()) query.append("serie", params.serie.trim());
  if (params.turma?.trim()) query.append("turma", params.turma.trim());
  if (params.evaluation_id?.trim()) query.append("evaluation_id", params.evaluation_id.trim());
  if (params.answer_sheet_id?.trim()) query.append("answer_sheet_id", params.answer_sheet_id.trim());
  if (params.student_ids?.length) query.append("student_ids", params.student_ids.join(","));

  const response = await api.get<FolhaRascunhoDadosResponse>(
    `/documentos/folha-rascunho/dados?${query.toString()}`,
    requestConfig(params.municipio)
  );
  return response.data;
}

function mapStudentRow(raw: Record<string, unknown>): FolhaRascunhoClassStudent | null {
  const id = String(raw.id ?? "").trim();
  const name = String(
    raw.name ?? (raw.usuario as Record<string, unknown> | undefined)?.name ?? ""
  ).trim();
  if (!id || !name) return null;
  const registration = String(raw.registration ?? raw.matricula ?? "").trim();
  return { id, name, registration: registration || undefined };
}

export async function fetchClassStudentsForFolhaRascunho(
  classId: string,
  schoolId?: string
): Promise<FolhaRascunhoClassStudent[]> {
  let rows: unknown[] = [];
  try {
    const res = await api.get(`/students/classes/${classId}`);
    const data = res.data;
    if (Array.isArray(data)) rows = data;
    else if (data && typeof data === "object" && Array.isArray((data as { alunos?: unknown[] }).alunos)) {
      rows = (data as { alunos: unknown[] }).alunos;
    }
  } catch {
    if (schoolId) {
      const fallback = await api.get(`/students/school/${schoolId}/class/${classId}`);
      rows = Array.isArray(fallback.data) ? fallback.data : [];
    }
  }
  return rows
    .map((row) => mapStudentRow(row as Record<string, unknown>))
    .filter((s): s is FolhaRascunhoClassStudent => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function getFolhaRascunhoApiError(err: unknown, fallback = "Erro na operação."): string {
  const axiosErr = err as { response?: { data?: { error?: string; details?: string } } };
  return axiosErr.response?.data?.error || axiosErr.response?.data?.details || fallback;
}
