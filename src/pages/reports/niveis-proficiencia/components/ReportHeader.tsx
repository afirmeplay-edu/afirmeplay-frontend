import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ProficiencyLevelsMeta } from '@/services/evaluation/proficiencyLevelsApi';
import { formatDatePt } from '../lib/proficiencyLevelTokens';

type ReportHeaderProps = {
  meta?: ProficiencyLevelsMeta | null;
  fonteLabel: string;
  onDownloadPdf?: () => void;
  downloadingPdf?: boolean;
  canDownloadPdf?: boolean;
};

export function ReportHeader({
  meta,
  fonteLabel,
  onDownloadPdf,
  downloadingPdf = false,
  canDownloadPdf = false,
}: ReportHeaderProps) {
  const titulo = meta?.titulo?.trim() || 'Níveis de Proficiência';
  const linha1 = [titulo, meta?.municipio].filter(Boolean).join(' · ');
  const linha2 = [meta?.escola, meta?.data_aplicacao ? formatDatePt(meta.data_aplicacao) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card className="overflow-hidden border-border/80">
      <div className="h-1 w-full bg-primary" aria-hidden />
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Afirme Play · {fonteLabel}
          </p>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Níveis de Proficiência
          </h1>
          <p className="text-sm text-muted-foreground">{linha1 || '—'}</p>
          {linha2 ? <p className="text-sm text-muted-foreground">{linha2}</p> : null}
          {meta?.rede ? (
            <p className="text-xs text-muted-foreground/90">{meta.rede}</p>
          ) : null}
        </div>
        <Button
          type="button"
          className="no-print shrink-0 gap-2"
          disabled={!canDownloadPdf || downloadingPdf || !onDownloadPdf}
          onClick={() => onDownloadPdf?.()}
        >
          {downloadingPdf ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {downloadingPdf ? 'Gerando PDF…' : 'Baixar PDF'}
        </Button>
      </CardContent>
    </Card>
  );
}
