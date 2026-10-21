import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { formatDecimal1PtBr } from "@/utils/numberFormat";
import { getReportProficiencyTagClass, normalizeProficiencyLevelLabel } from "@/utils/report/reportTagStyles";
import {
  adapTemResultado,
  classeBadgeSituacaoAdap,
  labelSituacaoAdap,
  type TabelaAdapLinha,
} from "@/utils/evaluation/tabelaAdap";

function valorOuTraco(mostrar: boolean, valor: number | null | undefined): string {
  if (!mostrar || valor == null || Number.isNaN(Number(valor))) return "—";
  return formatDecimal1PtBr(valor);
}

export function AdapStudentCard({ aluno }: { aluno: TabelaAdapLinha }) {
  const comResultado = adapTemResultado(aluno.situacao);
  const rotulo = aluno.rotulo || `ADAP ${aluno.nivel}`;
  const acertos =
    comResultado && aluno.acertos != null && aluno.total_questoes != null
      ? `${aluno.acertos}/${aluno.total_questoes}`
      : "—";

  return (
    <Card className="overflow-hidden border border-teal-200 bg-card shadow-sm dark:border-teal-800">
      <div className="bg-gradient-to-r from-teal-700 to-teal-600 px-3 py-3 text-white">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
              A
            </div>
            <CardTitle className="min-w-0 flex-1 text-sm font-semibold leading-snug text-white break-words sm:text-base">
              {aluno.nome || "—"}
            </CardTitle>
          </div>
          <Badge variant="secondary" className="shrink-0 border-white/30 bg-white/20 text-white">
            {aluno.turma?.trim() || "—"}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className="border-teal-300 bg-teal-100 text-teal-900">{rotulo}</Badge>
          <Badge variant="outline" className={`bg-white/95 ${classeBadgeSituacaoAdap(aluno.situacao)}`}>
            {labelSituacaoAdap(aluno.situacao)}
          </Badge>
        </div>
      </div>

      <CardContent className="space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-lg border border-border bg-muted/40 px-2.5 py-2">
            <div className="text-[clamp(0.95rem,2.2vw,1.15rem)] font-bold tabular-nums leading-none text-foreground">
              {valorOuTraco(comResultado, aluno.nota)}
            </div>
            <div className="text-[11px] text-muted-foreground">Nota</div>
          </div>
          <div className="min-w-0 rounded-lg border border-teal-200/70 bg-teal-50/80 px-2.5 py-2 dark:border-teal-900/50 dark:bg-teal-950/30">
            <div className="text-[clamp(0.95rem,2.2vw,1.15rem)] font-bold tabular-nums leading-none text-teal-800 dark:text-teal-200">
              {valorOuTraco(comResultado, aluno.proficiencia)}
            </div>
            <div className="text-[11px] text-teal-900/80 dark:text-teal-200/80">Proficiência</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-muted/40 px-2 py-2 text-center">
            <div className="text-sm font-bold tabular-nums text-foreground">{acertos}</div>
            <div className="text-[11px] text-muted-foreground">Acertos</div>
          </div>
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/40 px-2 py-2 text-center">
            {comResultado && aluno.classificacao ? (
              <span className={getReportProficiencyTagClass(normalizeProficiencyLevelLabel(aluno.classificacao))}>
                {normalizeProficiencyLevelLabel(aluno.classificacao)}
              </span>
            ) : (
              <span className="text-sm font-bold text-foreground">—</span>
            )}
            <div className="mt-1 text-[11px] text-muted-foreground">Classificação</div>
          </div>
        </div>

        <div className="border-t border-border pt-2 text-xs">
          <div className="mb-1 text-muted-foreground">Prova de origem</div>
          <div className="truncate font-medium text-foreground" title={aluno.prova_origem_titulo || undefined}>
            {aluno.prova_origem_titulo?.trim() || "—"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
