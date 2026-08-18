import { api } from "@/lib/api";
import type { OmrCorrectionResult, OmrCorrectionStatus } from "@/types/answer-sheet";

export interface BatchCorrectionItem {
  status: 'pending' | 'processing' | 'done' | 'error';
  student_name?: string;
  student_id?: string;
  correct?: number;
  total?: number;
  percentage?: number;
  error?: string;
  aluno_ausente?: boolean;
  saved?: boolean;
}

export interface BatchCorrectionProgress {
  job_id: string;
  total: number;
  completed: number;
  successful: number;
  failed: number;
  status: 'processing' | 'completed' | 'error';
  percentage: number;
  items: Record<string, BatchCorrectionItem>;
  results?: SingleCorrectionResponse[];
}

export interface SingleCorrectionResponse extends OmrCorrectionResult {
  message: string;
  student_id: string;
  student_name: string;
  correct: number;
  total: number;
  percentage: number;
  grade?: number;
  proficiency?: number;
  classification?: string;
  aluno_ausente?: boolean;
  saved?: boolean;
  status?: OmrCorrectionStatus;
}

export interface BatchCorrectionStartResponse {
  job_id: string;
  message: string;
  total: number;
  status: 'processing';
}

class BatchCorrectionService {
  /**
   * Processar correção única (1 imagem) - Síncrono
   */
  async processSingleCorrection(testId: string, imageBase64: string): Promise<SingleCorrectionResponse> {
    const response = await api.post(`/physical-tests/test/${testId}/process-correction`, {
      image: imageBase64
    });
    return response.data;
  }

  /**
   * Iniciar correção em lote (múltiplas imagens) - Assíncrono
   * Retorna job_id para polling de progresso
   */
  async startBatchCorrection(testId: string, imagesBase64: string[]): Promise<BatchCorrectionStartResponse> {
    const response = await api.post(`/physical-tests/test/${testId}/process-correction`, {
      images: imagesBase64
    });
    return response.data;
  }

  /**
   * Obter progresso da correção em lote
   */
  async getCorrectionProgress(jobId: string): Promise<BatchCorrectionProgress> {
    const response = await api.get(`/physical-tests/correction-progress/${jobId}`);
    return response.data;
  }

  /**
   * Converter arquivo para base64
   */
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Converter múltiplos arquivos para base64
   */
  async filesToBase64(files: File[]): Promise<string[]> {
    return Promise.all(files.map(file => this.fileToBase64(file)));
  }
}

export const batchCorrectionService = new BatchCorrectionService();
