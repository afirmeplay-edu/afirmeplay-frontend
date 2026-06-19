import { cn } from '@/lib/utils';

type RelatorioSectionTitleProps = {
  title: string;
  className?: string;
};

/** Título de seção com barra roxa (mesmo padrão do PDF). */
export function RelatorioSectionTitle({ title, className }: RelatorioSectionTitleProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="w-1 self-stretch min-h-[2rem] rounded-sm bg-primary shrink-0" aria-hidden />
      <h2 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">{title}</h2>
    </div>
  );
}

type RelatorioSubsectionTitleProps = {
  label: string;
  className?: string;
};

export function RelatorioSubsectionTitle({ label, className }: RelatorioSubsectionTitleProps) {
  return <h3 className={cn('text-base font-bold text-primary', className)}>{label}</h3>;
}

export function RelatorioTableBand({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-md bg-violet-100 dark:bg-violet-950/40 px-3 py-2 text-sm font-bold text-primary',
        className
      )}
    >
      {label}
    </div>
  );
}
