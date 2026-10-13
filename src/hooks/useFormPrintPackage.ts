import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  downloadFormPrintPackage,
  FormPrintPackageError,
  getFormPrintPackageStatus,
  startFormPrintPackage,
  type FormPrintPackageState,
} from '@/services/formPrintPackagesApi';

const POLL_INTERVAL_MS = 4000;
const MAX_CONSECUTIVE_POLL_ERRORS = 3;

export function useFormPrintPackage(formId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<FormPrintPackageState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollErrorsRef = useRef(0);
  const activeRef = useRef(true);

  const clearPoll = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!formId) return;
    clearPoll();
    try {
      const next = await getFormPrintPackageStatus(formId);
      if (!activeRef.current) return;
      pollErrorsRef.current = 0;
      setPollError(null);
      setState(next);
      if (next?.status === 'processing') {
        timeoutRef.current = setTimeout(fetchStatus, POLL_INTERVAL_MS);
      }
    } catch (err) {
      if (!activeRef.current) return;
      pollErrorsRef.current += 1;
      if (pollErrorsRef.current < MAX_CONSECUTIVE_POLL_ERRORS) {
        timeoutRef.current = setTimeout(fetchStatus, POLL_INTERVAL_MS * 2 ** pollErrorsRef.current);
      } else {
        setPollError(err instanceof Error ? err.message : 'Não foi possível consultar a geração dos PDFs.');
      }
    }
  }, [formId, clearPoll]);

  useEffect(() => {
    activeRef.current = true;
    if (!formId || !enabled) return;
    setIsLoading(true);
    fetchStatus().finally(() => {
      if (activeRef.current) setIsLoading(false);
    });
    return () => {
      activeRef.current = false;
      clearPoll();
    };
  }, [formId, enabled, fetchStatus, clearPoll]);

  const refresh = useCallback(() => {
    pollErrorsRef.current = 0;
    setPollError(null);
    return fetchStatus();
  }, [fetchStatus]);

  /** Lança `FormPrintPackageError` (400/409 etc.) para a tela exibir a mensagem. */
  const start = useCallback(async () => {
    if (!formId) return;
    setIsStarting(true);
    try {
      const started = await startFormPrintPackage(formId);
      setState((prev) => ({
        status: started.status,
        taskId: started.taskId,
        runId: started.runId,
        zipAvailable: prev?.zipAvailable ?? false,
        studentCount: started.studentCount,
        generatedCount: 0,
        failedCount: 0,
        coverYear: started.coverYear,
        error: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        formId: started.formId,
        pollingUrl: started.pollingUrl,
        downloadUrl: started.downloadUrl,
      }));
      pollErrorsRef.current = 0;
      setPollError(null);
      clearPoll();
      timeoutRef.current = setTimeout(fetchStatus, POLL_INTERVAL_MS);
      return started;
    } catch (err) {
      if (err instanceof FormPrintPackageError && err.status === 409) {
        void refresh();
      }
      throw err;
    } finally {
      setIsStarting(false);
    }
  }, [formId, clearPoll, fetchStatus, refresh]);

  const download = useCallback(async () => {
    if (!formId) return;
    setIsDownloading(true);
    try {
      await downloadFormPrintPackage(formId);
    } finally {
      setIsDownloading(false);
    }
  }, [formId]);

  return { state, isLoading, isStarting, isDownloading, pollError, start, download, refresh };
}

export function useFormPrintPackageActions(formId: string | undefined, enabled = true) {
  const { toast } = useToast();
  const printPackage = useFormPrintPackage(formId, enabled);
  const { start, download } = printPackage;

  const handleStart = useCallback(async () => {
    try {
      const started = await start();
      if (started) {
        toast({
          title: 'Geração iniciada',
          description: `${started.studentCount} aluno${started.studentCount !== 1 ? 's' : ''} no escopo. Capa com ano ${started.coverYear}.`,
        });
      }
    } catch (err) {
      const title =
        err instanceof FormPrintPackageError && err.status === 409
          ? 'Já existe uma geração em andamento'
          : 'Não foi possível gerar os PDFs';
      toast({
        title,
        description: err instanceof Error ? err.message : 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    }
  }, [start, toast]);

  const handleDownload = useCallback(async () => {
    try {
      await download();
    } catch (err) {
      toast({
        title: 'Não foi possível baixar o ZIP',
        description: err instanceof Error ? err.message : 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    }
  }, [download, toast]);

  return { ...printPackage, handleStart, handleDownload };
}
