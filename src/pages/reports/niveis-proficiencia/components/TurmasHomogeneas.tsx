import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProficiencyLevelsAluno } from '@/services/evaluation/proficiencyLevelsApi';
import { cn } from '@/lib/utils';
import { buildHomogeneousGroups } from '../lib/groupHomogeneousClasses';
import {
  formatPercent,
  getLevelSurfaceClasses,
} from '../lib/proficiencyLevelTokens';

const SIZE_OPTIONS = [8, 10, 12, 15, 20, 25] as const;

type TurmasHomogeneasProps = {
  alunos?: ProficiencyLevelsAluno[] | null;
  maxPerClass: number;
  onMaxPerClassChange: (value: number) => void;
};

export function TurmasHomogeneas({
  alunos,
  maxPerClass,
  onMaxPerClassChange,
}: TurmasHomogeneasProps) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  const groups = useMemo(
    () => buildHomogeneousGroups(alunos || [], maxPerClass),
    [alunos, maxPerClass]
  );

  return (
    <section className="mt-5">
      <h2 className="mb-3 mt-8 text-lg font-semibold tracking-tight text-foreground">
        Formação de turmas homogêneas
      </h2>
      <Card className="border-border/80">
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">Sugestões por série e nível</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Agrupa alunos com o mesmo nível de proficiência na mesma série e divide pelo
                tamanho máximo escolhido.
              </p>
            </div>
          </div>
          <div className="no-print w-full sm:w-44">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Alunos por turma
            </label>
            <Select
              value={String(maxPerClass)}
              onValueChange={(v) => onMaxPerClassChange(Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sem alunos suficientes para sugerir turmas.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {groups.map((g, idx) => {
                const surface = getLevelSurfaceClasses(g.nivel);
                const open = openIds[g.id] ?? false;
                return (
                  <div
                    key={g.id}
                    className={cn('rounded-lg border p-3', surface.soft)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn('text-sm font-semibold', surface.text)}>
                        Grupo {idx + 1} · {g.serie} · {g.nivel}
                      </p>
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums',
                          surface.badge
                        )}
                      >
                        {g.alunos.length}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Média do grupo:{' '}
                      <span className={cn('font-semibold', surface.text)}>
                        {formatPercent(g.mediaPercentual)}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Origens: {g.origens.join(' + ') || '—'}
                    </p>
                    <button
                      type="button"
                      className="no-print mt-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() =>
                        setOpenIds((prev) => ({ ...prev, [g.id]: !prev[g.id] }))
                      }
                    >
                      {open ? 'Ocultar alunos' : 'Ver alunos'}
                    </button>
                    <ul
                      className={cn(
                        'mt-2 space-y-1 border-t border-border/50 pt-2 text-xs text-foreground',
                        open ? 'block' : 'hidden print:block'
                      )}
                    >
                      {g.alunos.map((a) => (
                        <li key={a.id} className="flex justify-between gap-2">
                          <span className="truncate">{a.nome}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {formatPercent(a.percentual_acertos)}
                          </span>
                        </li>
                      ))}
                    </ul>
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
