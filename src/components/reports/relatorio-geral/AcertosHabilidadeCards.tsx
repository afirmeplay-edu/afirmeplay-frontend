import { AlertTriangle, Check } from 'lucide-react';
import type { HabilidadeConsolidada } from '@/types/relatorio-consolidado';
import { cn } from '@/lib/utils';
import {
  buildHabilidadeLinhaTexto,
  formatHabilidadePercentDisplay,
  getHabilidadeMetaCardTitle,
  splitHabilidadesPorMeta,
  type HabilidadeMetaVariant,
} from '@/utils/reports/relatorioConsolidadoHabilidades';

type AcertosHabilidadeCardsProps = {
  habilidades: HabilidadeConsolidada[];
  className?: string;
};

const CARD_STYLES: Record<
  HabilidadeMetaVariant,
  {
    container: string;
    header: string;
    rowBorder: string;
    icon: typeof Check;
  }
> = {
  dentro: {
    container: 'bg-emerald-50 border-emerald-500 dark:bg-emerald-950/25 dark:border-emerald-600',
    header: 'text-emerald-800 dark:text-emerald-200',
    rowBorder: 'border-emerald-100 dark:border-emerald-900/60',
    icon: Check,
  },
  abaixo: {
    container: 'bg-red-50 border-red-500 dark:bg-red-950/25 dark:border-red-600',
    header: 'text-red-800 dark:text-red-200',
    rowBorder: 'border-red-100 dark:border-red-900/60',
    icon: AlertTriangle,
  },
};

function HabilidadeMetaCard({
  variant,
  habilidades,
}: {
  variant: HabilidadeMetaVariant;
  habilidades: HabilidadeConsolidada[];
}) {
  const styles = CARD_STYLES[variant];
  const Icon = styles.icon;

  return (
    <div
      className={cn(
        'rounded-xl border-l-4 px-4 py-3 sm:px-5 sm:py-4',
        styles.container
      )}
    >
      <div className={cn('flex items-center gap-2 font-bold text-sm sm:text-base mb-3', styles.header)}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span>{getHabilidadeMetaCardTitle(variant)}</span>
      </div>
      <ul className="divide-y">
        {habilidades.map((h) => (
          <li
            key={`${h.itens_origem[0] || 'unknown'}-${h.numero_questao}-${h.codigo}`}
            className={cn(
              'flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0',
              styles.rowBorder,
              'border-b last:border-b-0'
            )}
          >
            <span className={cn('text-sm leading-snug flex-1 min-w-0', styles.header)}>
              {buildHabilidadeLinhaTexto(h)}
            </span>
            <span
              className={cn(
                'text-sm font-bold tabular-nums shrink-0 pt-0.5',
                styles.header
              )}
            >
              {formatHabilidadePercentDisplay(h.percentual)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AcertosHabilidadeCards({ habilidades, className }: AcertosHabilidadeCardsProps) {
  const { dentroDaMeta, abaixoDaMeta } = splitHabilidadesPorMeta(habilidades);

  if (!habilidades.length) {
    return <p className="text-sm text-muted-foreground">Nenhuma habilidade consolidada.</p>;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {dentroDaMeta.length > 0 && (
        <HabilidadeMetaCard variant="dentro" habilidades={dentroDaMeta} />
      )}
      {abaixoDaMeta.length > 0 && (
        <HabilidadeMetaCard variant="abaixo" habilidades={abaixoDaMeta} />
      )}
    </div>
  );
}
