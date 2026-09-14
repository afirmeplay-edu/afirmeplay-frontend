import { useMemo } from 'react';
import type { ProficiencyLevelsAluno } from '@/services/evaluation/proficiencyLevelsApi';
import { normalizeProficiencyLevelLabel } from '@/utils/report/reportTagStyles';
import { cn } from '@/lib/utils';
import {
  LEVEL_FAIXA_LABEL,
  PROFICIENCY_LEVELS,
  getLevelSurfaceClasses,
} from '../lib/proficiencyLevelTokens';
import { AlunoCard } from './AlunoCard';

type ColunasNivelProps = {
  alunos?: ProficiencyLevelsAluno[] | null;
};

export function ColunasNivel({ alunos }: ColunasNivelProps) {
  const byLevel = useMemo(() => {
    const map: Record<string, ProficiencyLevelsAluno[]> = Object.fromEntries(
      PROFICIENCY_LEVELS.map((n) => [n, [] as ProficiencyLevelsAluno[]])
    );
    for (const aluno of alunos || []) {
      const nivel = normalizeProficiencyLevelLabel(aluno.nivel);
      map[nivel].push(aluno);
    }
    for (const nivel of PROFICIENCY_LEVELS) {
      map[nivel].sort(
        (a, b) => Number(b.percentual_acertos ?? 0) - Number(a.percentual_acertos ?? 0)
      );
    }
    return map;
  }, [alunos]);

  return (
    <section className="mt-5">
      <h2 className="mb-3 mt-8 text-lg font-semibold tracking-tight text-foreground">
        Alunos por nível de proficiência
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {PROFICIENCY_LEVELS.map((nivel) => {
          const list = byLevel[nivel] || [];
          const surface = getLevelSurfaceClasses(nivel);
          return (
            <div key={nivel} className="flex min-h-[280px] flex-col overflow-hidden rounded-lg border border-border/80">
              <div
                className={cn(
                  'flex items-center justify-between gap-2 border-b px-3 py-2.5',
                  surface.soft
                )}
              >
                <div>
                  <p className={cn('text-sm font-semibold', surface.text)}>{nivel}</p>
                  <p className="text-[11px] text-muted-foreground">{LEVEL_FAIXA_LABEL[nivel]}</p>
                </div>
                <span
                  className={cn(
                    'inline-flex min-w-7 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums',
                    surface.badge
                  )}
                >
                  {list.length}
                </span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2 print:overflow-visible">
                {list.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    Nenhum aluno neste nível
                  </p>
                ) : (
                  list.map((aluno) => (
                    <AlunoCard key={aluno.id} aluno={aluno} nivel={nivel} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
