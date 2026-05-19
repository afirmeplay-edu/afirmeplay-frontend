import { AlertCircle, Building2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankingResponse } from "@/services/reports/rankingApi";
import { LevelTag, NivelBar, PosBadge, SummaryCard, formatPt } from "@/components/ranking/RankingVisualPrimitives";
import { RankingContentShell, RankingLoadingState } from "@/components/ranking/RankingLoadingState";

type Props = {
  data?: RankingResponse;
  isLoading: boolean;
  isRefreshing?: boolean;
  errorMessage?: string;
};

export default function RankingMunicipalPanel({ data, isLoading, isRefreshing, errorMessage }: Props) {
  if (isLoading) {
    return <RankingLoadingState message="Carregando ranking municipal..." variant="cards" />;
  }
  if (errorMessage) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    );
  }

  const items = data?.municipal_ranking?.items || [];
  const totalSchools = items.length;
  const participation = totalSchools
    ? items.reduce((acc, row) => acc + Number(row.participation_rate || 0), 0) / totalSchools
    : 0;
  const totalParticipating = items.reduce((acc, row) => acc + Number(row.participating_students || 0), 0);
  const totalAdequadoAvancado = items.reduce((acc, row) => acc + Number(row.adequado_avancado_count || 0), 0);
  const levelsPct = totalParticipating ? (totalAdequadoAvancado / totalParticipating) * 100 : 0;
  const topSchool = items[0];

  return (
    <RankingContentShell isRefreshing={isRefreshing} refreshingMessage="Atualizando ranking municipal...">
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Escolas avaliadas" value={String(totalSchools)} />
        <SummaryCard label="Participação geral" value={`${formatPt(participation)}%`} />
        <SummaryCard
          label="Adequado + Avançado"
          value={`${totalAdequadoAvancado} alunos`}
          hint={`${formatPt(levelsPct)}% dos participantes`}
        />
        <SummaryCard
          label="Destaque do mês"
          value={String(topSchool?.school_name || "—")}
          valueClassName="text-base font-semibold leading-tight whitespace-normal break-words"
          hint={`Nota ${formatPt(Number(topSchool?.average_score || 0))}`}
        />
      </div>
      <Card className="overflow-hidden border border-border/70">
        <CardHeader className="border-b border-border/60 bg-muted/30 pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Ranking municipal de escolas
            </span>
            <Badge variant="secondary">{items.length} escolas</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma escola encontrada para o recorte atual.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full min-w-[1100px] text-sm border-collapse">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Pos.</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Escola</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase">Participação</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Proficiência</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Nota</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Adeq.+Avan.</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase">Nível</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Melhor turma</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const participating = Number(row.participating_students || 0);
                  const adequadoCount = Number(row.adequado_avancado_count ?? 0);
                  const adequadoPct =
                    participating > 0
                      ? (adequadoCount / participating) * 100
                      : Number(row.adequado_avancado_pct || 0);
                  return (
                  <tr
                    key={String(row.school_id || row.position)}
                    className={`border-t border-border/60 odd:bg-muted/20 ${row.is_critical ? "bg-rose-50/90 dark:bg-rose-950/20" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <PosBadge position={Number(row.position || 0)} />
                    </td>
                    <td className="px-3 py-2 font-semibold">{String(row.school_name || "Escola")}</td>
                    <td className="px-3 py-2 text-center">
                      {formatPt(Number(row.participation_rate || 0))}% ({Number(row.participating_students || 0)}/
                      {Number(row.total_students || 0)})
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{formatPt(Number(row.average_proficiency || 0))}</td>
                    <td className="px-3 py-2 text-right font-semibold text-primary">{formatPt(Number(row.average_score || 0))}</td>
                    <td className="px-3 py-2">
                      <NivelBar value={adequadoPct} count={adequadoCount} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <LevelTag value={row.level_tag} />
                    </td>
                    <td className="px-3 py-2">{String(row.best_class_name || "N/A")}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </CardContent>
      </Card>
    </div>
    </RankingContentShell>
  );
}
