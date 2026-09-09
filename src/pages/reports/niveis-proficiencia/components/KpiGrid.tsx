import {
  BarChart3,
  GraduationCap,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { ProficiencyLevelsIndicadores, ProficiencyLevelsMeta } from '@/services/evaluation/proficiencyLevelsApi';
import { formatNumber, formatPercent } from '../lib/proficiencyLevelTokens';

type KpiGridProps = {
  indicadores?: ProficiencyLevelsIndicadores | null;
  meta?: ProficiencyLevelsMeta | null;
};

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Users;
}) {
  return (
    <Card className="border-border/80">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        </div>
        <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground">
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function KpiGrid({ indicadores, meta }: KpiGridProps) {
  const alunos = indicadores?.alunos_avaliados ?? 0;
  const turmas = indicadores?.turmas ?? 0;
  const totalItens = meta?.total_itens;

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard
        label="Alunos avaliados"
        value={String(alunos)}
        detail={`${turmas} turma${turmas === 1 ? '' : 's'}`}
        icon={Users}
      />
      <KpiCard
        label="Média de acertos"
        value={formatPercent(indicadores?.media_acertos_percentual)}
        detail={totalItens != null ? `${totalItens} itens` : 'Itens da prova'}
        icon={BarChart3}
      />
      <KpiCard
        label="Proficiência média"
        value={formatNumber(indicadores?.media_proficiencia)}
        detail="Escala de proficiência"
        icon={TrendingUp}
      />
      <KpiCard
        label="Adequado + Avançado"
        value={formatPercent(indicadores?.adequado_avancado?.percentual)}
        detail={`${indicadores?.adequado_avancado?.quantidade ?? 0} alunos`}
        icon={Target}
      />
      <KpiCard
        label="Atenção prioritária"
        value={String(indicadores?.abaixo_do_basico?.quantidade ?? 0)}
        detail="Abaixo do Básico"
        icon={GraduationCap}
      />
    </div>
  );
}
