import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { ProficiencyLevelsHabilidade } from '@/services/evaluation/proficiencyLevelsApi';
import { normalizeProficiencyLevelLabel } from '@/utils/report/reportTagStyles';
import { cn } from '@/lib/utils';
import {
  formatPercent,
  getLevelSurfaceClasses,
} from '../lib/proficiencyLevelTokens';

type HabilidadesSectionProps = {
  habilidades?: ProficiencyLevelsHabilidade[] | null;
};

export function HabilidadesSection({ habilidades }: HabilidadesSectionProps) {
  const sorted = useMemo(() => {
    return [...(habilidades || [])].sort(
      (a, b) => Number(a.percentual_acertos ?? 0) - Number(b.percentual_acertos ?? 0)
    );
  }, [habilidades]);

  return (
    <section className="mt-5">
      <h2 className="mb-3 mt-8 text-lg font-semibold tracking-tight text-foreground">
        Habilidades por nível de domínio
      </h2>
      <Card className="border-border/80">
        <CardContent className="p-4">
          {sorted.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma habilidade no recorte selecionado.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sorted.map((h, idx) => {
                const nivel = normalizeProficiencyLevelLabel(h.nivel);
                const surface = getLevelSurfaceClasses(nivel);
                const pct = Number(h.percentual_acertos ?? 0);
                return (
                  <div
                    key={`${h.codigo}-${h.subject_id ?? ''}-${h.serie ?? ''}-${idx}`}
                    className="rounded-lg border border-border/80 bg-card p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-foreground">{h.codigo || '—'}</p>
                      {h.serie ? (
                        <span className="text-[11px] text-muted-foreground">{h.serie}</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {h.componente || h.descricao || '—'}
                    </p>
                    <p className={cn('mt-2 text-2xl font-bold tabular-nums', surface.text)}>
                      {formatPercent(h.percentual_acertos)}
                    </p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full', surface.bar)}
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                      />
                    </div>
                    <p className={cn('mt-2 text-xs font-medium', surface.text)}>{nivel}</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
