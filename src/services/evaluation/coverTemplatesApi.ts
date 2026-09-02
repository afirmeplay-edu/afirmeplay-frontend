import { isAxiosError } from "axios";
import { api } from "@/lib/api";
import type {
  CoverField,
  CoverFieldCatalog,
  CoverPreviewPayload,
  CoverTemplate,
  CoverTemplatePatchPayload,
} from "@/types/cover-template";
import { GENERIC_EXAM_COVER_FIELD_KEYS } from "@/types/cover-template";

function templatesPath(testId: string) {
  return `/test/${testId}/cover-templates`;
}

async function messageFromUnknownBody(data: unknown, fallback: string): Promise<string> {
  if (data instanceof Blob) {
    const text = await data.text();
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      return parsed.error || parsed.message || fallback;
    } catch {
      return text.slice(0, 300) || fallback;
    }
  }
  if (data && typeof data === "object") {
    const parsed = data as { error?: string; message?: string };
    return parsed.error || parsed.message || fallback;
  }
  if (typeof data === "string" && data.trim()) return data;
  return fallback;
}

export async function coverTemplatesApiError(error: unknown, fallback: string): Promise<string> {
  if (isAxiosError(error)) {
    return messageFromUnknownBody(error.response?.data, fallback);
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function ensureBlobIsFile(blob: Blob, fallback: string): Promise<Blob> {
  if (blob.type?.includes("application/json")) {
    throw new Error(await messageFromUnknownBody(blob, fallback));
  }
  return blob;
}

export class CoverTemplatesApi {
  static async list(testId: string): Promise<CoverTemplate[]> {
    const { data } = await api.get<CoverTemplate[]>(templatesPath(testId));
    return Array.isArray(data) ? data : [];
  }

  static async get(testId: string, templateId: string): Promise<CoverTemplate> {
    const { data } = await api.get<CoverTemplate>(`${templatesPath(testId)}/${templateId}`);
    return data;
  }

  static async getFieldCatalog(testId: string): Promise<CoverFieldCatalog> {
    const { data } = await api.get<CoverFieldCatalog>(`${templatesPath(testId)}/field-catalog`);
    return data;
  }

  static async upload(testId: string, file: File, name?: string): Promise<CoverTemplate> {
    const formData = new FormData();
    formData.append("file", file);
    if (name?.trim()) formData.append("name", name.trim());

    const { data } = await api.post<CoverTemplate>(templatesPath(testId), formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  }

  static async update(
    testId: string,
    templateId: string,
    payload: CoverTemplatePatchPayload
  ): Promise<CoverTemplate> {
    const { data } = await api.patch<CoverTemplate>(
      `${templatesPath(testId)}/${templateId}`,
      payload
    );
    return data;
  }

  static async activate(testId: string, templateId: string): Promise<CoverTemplate> {
    const { data } = await api.post<CoverTemplate>(
      `${templatesPath(testId)}/${templateId}/activate`
    );
    return data;
  }

  static async delete(testId: string, templateId: string): Promise<void> {
    await api.delete(`${templatesPath(testId)}/${templateId}`);
  }

  static async getOriginalBlob(
    testId: string,
    templateId: string
  ): Promise<{ blob: Blob; mimeType: string }> {
    const { data, headers } = await api.get<Blob>(
      `${templatesPath(testId)}/${templateId}/original`,
      {
        responseType: "blob",
        headers: { Accept: "*/*" },
      }
    );
    const blob = await ensureBlobIsFile(data, "Não foi possível carregar o arquivo original da capa.");
    const mimeType =
      (typeof headers["content-type"] === "string" ? headers["content-type"].split(";")[0] : "") ||
      blob.type ||
      "application/octet-stream";
    return { blob, mimeType };
  }

  static async preview(
    testId: string,
    templateId: string,
    payload: CoverPreviewPayload
  ): Promise<Blob> {
    const { data } = await api.post<Blob>(
      `${templatesPath(testId)}/${templateId}/preview`,
      payload,
      {
        responseType: "blob",
        headers: { Accept: "*/*" },
      }
    );
    return ensureBlobIsFile(data, "Não foi possível gerar o preview da capa.");
  }

  static async getActive(testId: string): Promise<CoverTemplate | null> {
    const list = await this.list(testId);
    return list.find((item) => item.status === "active") ?? null;
  }

  /**
   * PNG da capa ativa para o PDF da ficha: sem aluno, só título / disciplinas / série.
   * Retorna null se não houver template ativo.
   */
  static async previewGenericExamCoverPng(
    testId: string,
    testData: CoverPreviewPayload["test_data"]
  ): Promise<Blob | null> {
    const active = await this.getActive(testId);
    if (!active) return null;

    const allowed = new Set<string>(GENERIC_EXAM_COVER_FIELD_KEYS);
    const saved = Array.isArray(active.fields?.fields) ? active.fields.fields : [];
    const fields: CoverField[] = saved.filter((field) => allowed.has(field.key));

    return this.preview(testId, active.id, {
      sample: false,
      format: "png",
      test_data: testData,
      fields: { fields },
    });
  }
}
