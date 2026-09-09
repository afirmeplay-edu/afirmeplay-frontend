import type { ProficiencyLevelsAluno } from '@/services/evaluation/proficiencyLevelsApi';
import { cn } from '@/lib/utils';
import {
  formatNumber,
  formatPercent,
  getLevelSurfaceClasses,
} from '../lib/proficiencyLevelTokens';

type AlunoCardProps = {
  aluno: ProficiencyLevelsAluno;
  nivel: string;
};

export function AlunoCard({ aluno, nivel }: AlunoCardProps) {
  const surface = getLevelSurfaceClasses(nivel);
  const pct = Number(aluno.percentual_acertos ?? 0);

  return (
    <div className="rounded-lg border border-border/80 bg-card p-3 shadow-sm">
      <p className="text-sm font-semibold leading-snug text-foreground">{aluno.nome}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {[aluno.serie, aluno.turma ? `Turma ${aluno.turma}` : null].filter(Boolean).join(' · ') ||
          '—'}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className={cn('text-lg font-bold tabular-nums', surface.text)}>
          {formatPercent(aluno.percentual_acertos)}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {aluno.acertos ?? '—'}/{aluno.total_itens ?? '—'}
          {aluno.nota != null ? ` · nota ${formatNumber(aluno.nota)}` : ''}
        </span>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', surface.bar)}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}
