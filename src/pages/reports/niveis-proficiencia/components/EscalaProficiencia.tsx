import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProficiencyLevelCount } from '@/services/evaluation/proficiencyLevelsApi';
import { cn } from '@/lib/utils';
import {
  LEVEL_DESCRIPTION,
  LEVEL_FAIXA_LABEL,
  PROFICIENCY_LEVELS,
  formatPercent,
  getLevelSurfaceClasses,
} from '../lib/proficiencyLevelTokens';

type EscalaProficienciaProps = {
  distribuicao?: Record<string, ProficiencyLevelCount> | null;
};

export function EscalaProficiencia({ distribuicao }: EscalaProficienciaProps) {
  return (
    <Card className="mt-5 border-border/80">
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Escala de proficiência</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Distribuição dos alunos por nível de classificação.
          </p>
        </div>
        <div className="flex justify-between gap-3 text-[10px] font-medium tabular-nums text-muted-foreground sm:min-w-[220px]">
          <span>0%</span>
          <span>30%</span>
          <span>60%</span>
          <span>80%</span>
          <span>100%</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="h-3 w-full rounded-full bg-gradient-to-r from-red-600 via-yellow-400 via-green-500 to-green-800"
          role="img"
          aria-label="Escala visual de níveis de proficiência"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROFICIENCY_LEVELS.map((nivel) => {
            const item = distribuicao?.[nivel];
            const qtd = item?.quantidade ?? 0;
            const pct = item?.percentual ?? 0;
            const surface = getLevelSurfaceClasses(nivel);
            return (
              <div
                key={nivel}
                className={cn('rounded-lg border p-3', surface.soft)}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={cn('text-sm font-semibold', surface.text)}>{nivel}</p>
                  <span className="text-[11px] text-muted-foreground">
                    {LEVEL_FAIXA_LABEL[nivel]}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{qtd}</p>
                <p className="text-xs text-muted-foreground">
                  alunos · {formatPercent(pct)}
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background/70">
                  <div
                    className={cn('h-full rounded-full transition-all', surface.bar)}
                    style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  {LEVEL_DESCRIPTION[nivel]}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
