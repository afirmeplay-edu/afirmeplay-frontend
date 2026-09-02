import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import type { OmrCorrectionResult } from '@/types/answer-sheet';
import {
  alunoAusenteMessage,
  formatOmrBatchSummaryText,
  isAlunoAusente,
  summarizeOmrBatchResults,
} from '@/utils/omrCorrectionResult';

export interface AnswerSheetCorrectionItem {
  status: 'pending' | 'processing' | 'done' | 'error';
  student_name?: string;
  student_id?: string;
  correct?: number;
  total?: number;
  percentage?: number;
  grade?: number;
  error?: string;
  aluno_ausente?: boolean;
  saved?: boolean;
}

export interface AnswerSheetCorrectionProgress {
  job_id: string;
  total: number;
  completed: number;
  successful: number;
  failed: number;
  status: 'processing' | 'completed' | 'error';
  percentage: number;
  items: Record<string, AnswerSheetCorrectionItem>;
  results?: OmrCorrectionResult[];
}

export interface AnswerSheetCorrectionState {
  // Estado do job
  jobId: string | null;
  isProcessing: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  
  // Progresso
  progress: AnswerSheetCorrectionProgress | null;
  
  // Imagens selecionadas
  selectedImages: string[];
  
  // Erro
  error: string | null;
}

export function useAnswerSheetCorrection() {
  const { toast } = useToast();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [state, setState] = useState<AnswerSheetCorrectionState>({
    jobId: null,
    isProcessing: false,
    isCompleted: false,
    isFailed: false,
    progress: null,
    selectedImages: [],
    error: null,
  });

  // Adicionar imagens (base64)
  const addImages = useCallback((images: string[]) => {
    setState(prev => {
      const newImages = [...prev.selectedImages, ...images];
      // Limitar a 10 imagens por lote (pode ser ajustado)
      const limitedImages = newImages.slice(0, 10);
      
      if (newImages.length > 10) {
        toast({
          title: "Limite de imagens excedido",
          description: "Máximo de 10 imagens por lote. Apenas as primeiras 10 foram selecionadas.",
          variant: "destructive",
        });
      }
      
      return {
        ...prev,
        selectedImages: limitedImages,
      };
    });
  }, [toast]);

  // Remover imagem
  const removeImage = useCallback((index: number) => {
    setState(prev => ({
      ...prev,
      selectedImages: prev.selectedImages.filter((_, i) => i !== index),
    }));
  }, []);

  // Limpar imagens
  const clearImages = useCallback(() => {
    setState(prev => ({
      ...prev,
      selectedImages: [],
    }));
  }, []);

  // Iniciar correção única (síncrona)
  // O backend identifica o gabarito automaticamente pelo QR code na imagem
  const startSingleCorrection = useCallback(async (image: string) => {
    try {
      setState(prev => ({
        ...prev,
        isProcessing: true,
        isCompleted: false,
        isFailed: false,
        error: null,
      }));

      // NOVA ROTA - POST /answer-sheets/correct-new
      // Usa o NOVO pipeline robusto
      // Suporta alternativas variáveis
      // Validação rigorosa
      // Grid matemático baseado no JSON
      const response = await api.post<OmrCorrectionResult>('/answer-sheets/correct-new', {
        image: image
      });
      const data = response.data;

      // Resposta síncrona - resultado imediato
      setState(prev => ({
        ...prev,
        isProcessing: false,
        isCompleted: true,
      }));

      if (isAlunoAusente(data)) {
        toast({
          title: 'Aluno ausente',
          description: `${data.student_name ? `${data.student_name}. ` : ''}${alunoAusenteMessage(data)}`,
        });
      } else {
        toast({
          title: 'Correção processada!',
          description: `Aluno: ${data.student_name || 'N/A'}. Acertos: ${data.correct}/${data.total} (${data.percentage?.toFixed(1)}%)`,
        });
      }

      return data;
    } catch (error: any) {
      console.error("Erro ao processar correção única:", error);
      
      const errorMessage = error.response?.data?.error || error.message || "Não foi possível processar a correção.";
      
      setState(prev => ({
        ...prev,
        isProcessing: false,
        isFailed: true,
        error: errorMessage,
      }));

      toast({
        title: "Erro ao processar correção",
        description: errorMessage,
        variant: "destructive",
      });

      throw error;
    }
  }, [toast]);

  // Iniciar correção em lote (assíncrona)
  // Rota: POST /answer-sheets/process-correction — 1 a 50 imagens; 202 com job_id; progresso via GET /answer-sheets/correction-progress/<job_id>
  const startBatchCorrection = useCallback(async (images?: string[]) => {
    const imagesToProcess = images || state.selectedImages;
    const MAX_BATCH = 50;

    if (imagesToProcess.length === 0) {
      toast({
        title: "Nenhuma imagem selecionada",
        description: "Selecione pelo menos uma imagem para processar.",
        variant: "destructive",
      });
      return null;
    }

    if (imagesToProcess.length > MAX_BATCH) {
      toast({
        title: "Limite excedido",
        description: `Máximo de ${MAX_BATCH} imagens por requisição. Você enviou ${imagesToProcess.length}.`,
        variant: "destructive",
      });
      return null;
    }

    try {
      setState(prev => ({
        ...prev,
        isProcessing: true,
        isCompleted: false,
        isFailed: false,
        error: null,
        progress: null,
      }));

      // POST /answer-sheets/process-correction — body: { images: base64[] }; resposta 202 com job_id
      const response = await api.post('/answer-sheets/process-correction', {
        images: imagesToProcess,
      });

      // 202 Accepted com job_id e polling_url
      if (response.data.job_id) {
        const jobId = response.data.job_id;
        const total = response.data.total ?? imagesToProcess.length;

        setState(prev => ({
          ...prev,
          jobId,
          progress: {
            job_id: jobId,
            total,
            completed: 0,
            successful: 0,
            failed: 0,
            percentage: 0,
            status: 'processing',
            items: {},
          },
        }));

        return jobId;
      }

      setState(prev => ({
        ...prev,
        isProcessing: false,
        isFailed: true,
        error: 'Resposta inválida: job_id não retornado.',
      }));
      toast({
        title: "Erro ao iniciar correção",
        description: "O servidor não retornou job_id.",
        variant: "destructive",
      });
      return null;
    } catch (error: unknown) {
      console.error("Erro ao iniciar correção em lote:", error);
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      const errorMessage = err.response?.data?.error || err.message || "Não foi possível iniciar a correção em lote.";
      
      setState(prev => ({
        ...prev,
        isProcessing: false,
        isFailed: true,
        error: errorMessage,
      }));

      toast({
        title: "Erro ao iniciar correção",
        description: errorMessage,
        variant: "destructive",
      });

      throw error;
    }
  }, [state.selectedImages, toast]);

  // Polling de progresso
  useEffect(() => {
    if (!state.jobId || !state.isProcessing) return;

    const pollProgress = async () => {
      try {
        const response = await api.get(`/answer-sheets/correction-progress/${state.jobId}`);
        const progressData: AnswerSheetCorrectionProgress = response.data;
        
        setState(prev => ({
          ...prev,
          progress: progressData,
        }));

        // Verificar se completou
        if (progressData.status === 'completed') {
          setState(prev => ({
            ...prev,
            isProcessing: false,
            isCompleted: true,
          }));

          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }

          const summary = summarizeOmrBatchResults(
            progressData.results,
            progressData.successful,
            progressData.failed
          );
          toast({
            title: 'Correção concluída!',
            description: formatOmrBatchSummaryText(summary),
          });
        } else if (progressData.status === 'error') {
          setState(prev => ({
            ...prev,
            isProcessing: false,
            isFailed: true,
            error: 'Erro durante o processamento',
          }));

          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (error) {
        console.error('Erro ao buscar progresso:', error);
      }
    };

    // Primeira consulta imediata
    pollProgress();

    // Polling a cada 1.5 segundos
    intervalRef.current = setInterval(pollProgress, 1500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.jobId, state.isProcessing, toast]);

  // Reset completo
  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    setState({
      jobId: null,
      isProcessing: false,
      isCompleted: false,
      isFailed: false,
      progress: null,
      selectedImages: [],
      error: null,
    });
  }, []);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    // Estado
    jobId: state.jobId,
    isProcessing: state.isProcessing,
    isCompleted: state.isCompleted,
    isFailed: state.isFailed,
    progress: state.progress,
    selectedImages: state.selectedImages,
    error: state.error,
    
    // Ações
    addImages,
    removeImage,
    clearImages,
    startSingleCorrection,
    startBatchCorrection,
    reset,
  };
}

