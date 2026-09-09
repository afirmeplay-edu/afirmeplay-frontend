import type {
  ProficiencyLevelCount,
  ProficiencyLevelsPorTurma,
} from '@/services/evaluation/proficiencyLevelsApi';
import { cn } from '@/lib/utils';
import {
  PROFICIENCY_LEVELS,
  formatNumber,
  formatPercent,
  getLevelSurfaceClasses,
} from '../lib/proficiencyLevelTokens';
import { NivelBadge } from './NivelBadge';

type RelatorioTurmasProps = {
  porTurma?: ProficiencyLevelsPorTurma[] | null;
};

function SegmentedBar({
  distribuicao,
}: {
  distribuicao?: Record<string, ProficiencyLevelCount>;
}) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      {PROFICIENCY_LEVELS.map((nivel) => {
        const pct = distribuicao?.[nivel]?.percentual ?? 0;
        if (pct <= 0) return null;
        const surface = getLevelSurfaceClasses(nivel);
        return (
          <div
            key={nivel}
            className={cn('h-full', surface.bar)}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            title={`${nivel}: ${formatPercent(pct)}`}
          />
        );
      })}
    </div>
  );
}

export function RelatorioTurmas({ porTurma }: RelatorioTurmasProps) {
  const list = Array.isArray(porTurma) ? porTurma : [];

  return (
    <section className="mt-5">
      <h2 className="mb-3 mt-8 text-lg font-semibold tracking-tight text-foreground">
        Relatório detalhado por série e turma
      </h2>
      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/80 px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhuma turma no recorte selecionado.
        </p>
      ) : (
        <div className="space-y-4">
          {list.map((turma, idx) => {
            const title = [turma.serie, turma.turma ? `Turma ${turma.turma}` : null]
              .filter(Boolean)
              .join(' — ') || `Turma ${idx + 1}`;
            const subtitle = [
              `${turma.alunos_avaliados ?? turma.alunos?.length ?? 0} alunos`,
              turma.media_acertos_percentual != null
                ? `média ${formatPercent(turma.media_acertos_percentual)}`
                : null,
              turma.turno || null,
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <div
                key={`${turma.serie}-${turma.turma}-${turma.turno}-${idx}`}
                className="overflow-hidden rounded-lg border border-border/80 bg-card"
              >
                <div className="flex flex-col gap-3 border-b border-border/80 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PROFICIENCY_LEVELS.map((nivel) => (
                      <span
                        key={nivel}
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          getLevelSurfaceClasses(nivel).badge
                        )}
                      >
                        {nivel}: {turma.distribuicao?.[nivel]?.quantidade ?? 0}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="px-4 pt-3">
                  <SegmentedBar distribuicao={turma.distribuicao} />
                </div>
                <div className="overflow-x-auto p-4">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="pb-2 pr-2 font-semibold">#</th>
                        <th className="pb-2 pr-2 font-semibold">Aluno</th>
                        <th className="pb-2 pr-2 font-semibold">Acertos</th>
                        <th className="pb-2 pr-2 font-semibold">% Acertos</th>
                        <th className="pb-2 pr-2 font-semibold">Nota</th>
                        <th className="pb-2 pr-2 font-semibold">Proficiência</th>
                        <th className="pb-2 font-semibold">Nível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(turma.alunos || []).map((aluno, i) => {
                        const surface = getLevelSurfaceClasses(aluno.nivel);
                        return (
                          <tr key={aluno.id || `${i}`} className="border-b border-border/50 last:border-0">
                            <td className="py-2.5 pr-2 tabular-nums text-muted-foreground">{i + 1}</td>
                            <td className="py-2.5 pr-2 font-medium text-foreground">{aluno.nome}</td>
                            <td className="py-2.5 pr-2 tabular-nums">
                              {aluno.acertos ?? '—'}/{aluno.total_itens ?? '—'}
                            </td>
                            <td className={cn('py-2.5 pr-2 font-semibold tabular-nums', surface.text)}>
                              {formatPercent(aluno.percentual_acertos)}
                            </td>
                            <td className="py-2.5 pr-2 tabular-nums">{formatNumber(aluno.nota)}</td>
                            <td className="py-2.5 pr-2 tabular-nums">
                              {formatNumber(aluno.proficiencia)}
                            </td>
                            <td className="py-2.5">
                              <NivelBadge nivel={aluno.nivel} />
                            </td>
                          </tr>
                        );
                      })}
                      {(turma.alunos || []).length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-muted-foreground">
                            Sem alunos nesta turma.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
