import { api } from "@/lib/api";

const ADAP_STAGE_ID = "247c4af5-2688-41b0-95fa-443f503a9d87";

export interface SubturmaAluno {
  id: string;
  name: string;
}

export interface SubturmaItem {
  id: string;
  support_level: number;
  display_name: string;
  alunos: SubturmaAluno[];
}

export interface SubturmaGrade {
  name?: string;
  education_stage_id?: string;
  education_stage?: { id?: string; name?: string } | null;
}

export function isSpecialEducationClass(grade?: SubturmaGrade | null): boolean {
  if (!grade) return false;
  const stageId = grade.education_stage?.id || grade.education_stage_id;
  if (stageId && stageId === ADAP_STAGE_ID) return true;
  const name = (grade.name || "").trim();
  return /^(suporte|adap)\s*[123]$/i.test(name);
}

export function levelsFromSubturmas(items: SubturmaItem[]): string[] {
  return [...items]
    .sort((a, b) => a.support_level - b.support_level)
    .map((item) => item.display_name || `ADAP ${item.support_level}`)
    .filter((name) => name.trim().length > 0);
}

export function badgesFromSubturmas(items: SubturmaItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of items) {
    for (const aluno of item.alunos || []) {
      map[aluno.id] = item.display_name;
    }
  }
  return map;
}

const NESTED_ID_KEYS = ["student", "aluno", "user", "usuario", "class", "turma", "classe", "data", "subturma", "result"];

export function extractCreatedId(payload: unknown, depth = 0): string | null {
  if (!payload || typeof payload !== "object" || depth > 4) return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.id === "string" && record.id.trim()) return record.id.trim();
  for (const key of NESTED_ID_KEYS) {
    const nested = record[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const id = extractCreatedId(nested, depth + 1);
      if (id) return id;
    }
  }
  return null;
}

export async function ensureSubturma(classId: string, level: number): Promise<string> {
  const response = await api.get(`/classes/${classId}/subturmas`);
  const list = (response.data?.subturmas || []) as SubturmaItem[];
  const found = list.find((item) => item.support_level === level);
  if (found?.id) return found.id;

  const created = await api.post(`/classes/${classId}/subturmas`, { support_level: level });
  const createdId = extractCreatedId(created.data);
  if (createdId) return createdId;

  const again = await api.get(`/classes/${classId}/subturmas`);
  const retry = ((again.data?.subturmas || []) as SubturmaItem[]).find((item) => item.support_level === level);
  if (retry?.id) return retry.id;
  throw new Error("Não foi possível identificar o nível ADAP criado.");
}

export async function linkStudentToSupportLevel(classId: string, studentId: string, level: number): Promise<void> {
  const subturmaId = await ensureSubturma(classId, level);
  await api.post(`/classes/${classId}/subturmas/${subturmaId}/alunos`, { student_id: studentId });
}
