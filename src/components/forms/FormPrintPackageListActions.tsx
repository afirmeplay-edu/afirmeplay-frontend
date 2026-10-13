import { AlertCircle, CheckCircle2, Download, FileDown, Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormPrintPackageActions } from '@/hooks/useFormPrintPackage';

const formatShortDateTime = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

export function FormPrintPackageListActions({ formId }: { formId: string }) {
  const { state, isLoading, isStarting, isDownloading, pollError, handleStart, handleDownload } =
    useFormPrintPackageActions(formId);

  const isProcessing = state?.status === 'processing';

  const renderStatus = () => {
    if (isLoading && !state) return <Skeleton className="h-3 w-2/3" />;

    if (pollError) {
      return (
        <span className="flex items-center gap-1 text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          Não foi possível consultar os PDFs
        </span>
      );
    }

    if (!state) return <span>PDFs ainda não gerados</span>;

    if (isProcessing) {
      const processed = state.generatedCount + state.failedCount;
      const percent = state.studentCount > 0 ? Math.round((processed / state.studentCount) * 100) : 0;
      return (
        <div className="space-y-1" aria-live="polite">
          <span className="flex items-center gap-1 text-foreground">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
            Gerando PDFs: {state.generatedCount} de {state.studentCount}
          </span>
          <Progress value={percent} className="h-1.5" aria-label="Progresso da geração dos PDFs" />
        </div>
      );
    }

    const finishedAt = formatShortDateTime(state.finishedAt);

    if (state.status === 'failed') {
      return (
        <span className="flex items-center gap-1 text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          Geração falhou{state.zipAvailable ? ', ZIP anterior mantido' : ''}
        </span>
      );
    }

    if (state.status === 'completed' && state.failedCount > 0) {
      return (
        <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
          <TriangleAlert className="h-3 w-3 shrink-0" />
          {state.generatedCount} de {state.studentCount} PDFs gerados
          {finishedAt && ` em ${finishedAt}`}
        </span>
      );
    }

    if (state.status === 'completed') {
      return (
        <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          {state.generatedCount} PDF{state.generatedCount !== 1 ? 's' : ''} gerado
          {state.generatedCount !== 1 ? 's' : ''}
          {finishedAt && ` em ${finishedAt}`}
        </span>
      );
    }

    return <span>ZIP anterior disponível</span>;
  };

  return (
    <div className="space-y-2">
      <div className="text-[11px] leading-snug text-muted-foreground">{renderStatus()}</div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-w-[8.5rem] flex-1"
          onClick={handleStart}
          disabled={isStarting || isProcessing || (isLoading && !state)}
        >
          {isStarting || isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4" />
          )}
          <span className="ml-1.5">{isProcessing ? 'Gerando…' : state ? 'Gerar de novo' : 'Gerar PDFs'}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-w-[8.5rem] flex-1"
          onClick={handleDownload}
          disabled={!state?.zipAvailable || isDownloading}
          title={state?.zipAvailable ? 'Baixar ZIP com os PDFs' : 'O ZIP ainda não foi gerado'}
        >
          {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="ml-1.5">Baixar ZIP</span>
        </Button>
      </div>
    </div>
  );
}
