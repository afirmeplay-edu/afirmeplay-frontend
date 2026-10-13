import { AlertCircle, CheckCircle2, Download, FileDown, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormPrintPackageActions } from '@/hooks/useFormPrintPackage';

const formatDateTime = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const pluralAlunos = (n: number) => `${n} aluno${n !== 1 ? 's' : ''}`;

export function FormPrintPackageCard({ formId }: { formId: string }) {
  const {
    state,
    isLoading,
    isStarting,
    isDownloading,
    pollError,
    refresh,
    handleStart,
    handleDownload,
  } = useFormPrintPackageActions(formId);

  const isProcessing = state?.status === 'processing';

  const renderStatus = () => {
    if (isLoading && !state) {
      return (
        <div className="space-y-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-2 w-full" />
        </div>
      );
    }

    if (state?.status === 'idle') {
      return (
        <p className="text-sm text-muted-foreground">
          Há um ZIP gerado anteriormente disponível para download.
        </p>
      );
    }

    if (!state) {
      return (
        <p className="text-sm text-muted-foreground">
          Nenhum pacote gerado ainda. Gere os PDFs para baixar o ZIP organizado por município, escola,
          série e turma.
        </p>
      );
    }

    const processed = state.generatedCount + state.failedCount;
    const percent = state.studentCount > 0 ? Math.round((processed / state.studentCount) * 100) : 0;
    const startedAt = formatDateTime(state.startedAt);
    const finishedAt = formatDateTime(state.finishedAt);

    if (state.status === 'processing') {
      return (
        <div className="space-y-2" aria-live="polite">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 font-medium text-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Gerando PDFs: {state.generatedCount} de {state.studentCount}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">{percent}%</span>
          </div>
          <Progress value={percent} className="h-2" aria-label="Progresso da geração dos PDFs" />
          <p className="text-xs text-muted-foreground">
            {startedAt && `Iniciada em ${startedAt}. `}
            O progresso é atualizado a cada 25 alunos.
            {state.failedCount > 0 && ` ${pluralAlunos(state.failedCount)} com falha até agora.`}
            {state.zipAvailable && ' O ZIP anterior continua disponível para download.'}
          </p>
        </div>
      );
    }

    if (state.status === 'completed' && state.failedCount > 0) {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Pacote publicado com {state.generatedCount} de {state.studentCount} PDFs.{' '}
            {pluralAlunos(state.failedCount)} ficaram de fora por falha na geração. Gere novamente para
            tentar incluí-los.
            {finishedAt && <span className="block text-xs opacity-80">Concluído em {finishedAt}.</span>}
          </p>
        </div>
      );
    }

    if (state.status === 'completed') {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {state.generatedCount} PDF{state.generatedCount !== 1 ? 's' : ''} gerado
            {state.generatedCount !== 1 ? 's' : ''}
            {finishedAt && <span className="block text-xs opacity-80">Concluído em {finishedAt}.</span>}
          </p>
        </div>
      );
    }

    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          A geração falhou{state.error ? `: ${state.error}` : '.'}{' '}
          {state.zipAvailable
            ? 'O ZIP anterior foi mantido e continua disponível.'
            : 'Nenhum arquivo foi publicado.'}{' '}
          Tente gerar novamente.
          {finishedAt && <span className="block text-xs opacity-80">Encerrada em {finishedAt}.</span>}
        </p>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileDown className="h-4 w-4 text-primary" />
          PDFs para impressão
        </CardTitle>
        <CardDescription className="text-xs">
          Um PDF por aluno do escopo, inclusive quem não tem usuário. Não cria destinatários. Uma nova
          geração substitui o ZIP atual quando termina.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {renderStatus()}

        {pollError && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Não foi possível atualizar o andamento: {pollError}</span>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => void refresh()}>
              <RefreshCw className="mr-1 h-3 w-3" />
              Tentar novamente
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={handleStart} disabled={isStarting || isProcessing || isLoading}>
            {isStarting || isProcessing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-1.5 h-4 w-4" />
            )}
            {isProcessing ? 'Gerando PDFs…' : state ? 'Gerar novamente' : 'Gerar PDFs'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={!state?.zipAvailable || isDownloading}
            title={state?.zipAvailable ? undefined : 'O ZIP ainda não foi gerado'}
          >
            {isDownloading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            Baixar ZIP
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
