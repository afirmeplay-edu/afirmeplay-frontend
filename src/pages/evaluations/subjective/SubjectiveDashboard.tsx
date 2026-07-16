import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, ClipboardCheck, Filter, TrendingUp, UserX, Users } from "lucide-react";
import {
  subjectiveTestApi,
  type SubjectiveDashboardResponse,
  type SubjectiveTest,
} from "@/services/evaluation/subjectiveTestApi";
import { RUBRIC_COLORS, SAEB_LEVELS, saebFromLevel } from "@/lib/subjectiveSaeb";
import { cn } from "@/lib/utils";

const DISTRIBUTION_LABEL: Record<string, string> = {
  SIM: "SIM",
  PARCIAL: "PARCIAL",
  NAO: "NÃO",
  BRANCO: "BRANCO",
};

const SubjectiveDashboard = () => {
  const [tests, setTests] = useState<SubjectiveTest[]>([]);
  const [testId, setTestId] = useState<string>("");
  const [classId, setClassId] = useState<string>("all");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDash, setLoadingDash] = useState(false);
  const [dash, setDash] = useState<SubjectiveDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingList(true);
    subjectiveTestApi
      .list({ page: 1, per_page: 100 })
      .then((res) => {
        if (!active) return;
        setTests(res.items);
        if (res.items[0]?.id) setTestId(res.items[0].id);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar as avaliações subjetivas.");
      })
      .finally(() => {
        if (active) setLoadingList(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!testId) {
      setDash(null);
      return;
    }
    let active = true;
    setLoadingDash(true);
    setError(null);
    subjectiveTestApi
      .getDashboard(testId, classId === "all" ? null : classId)
      .then((data) => {
        if (active) setDash(data);
      })
      .catch((err) => {
        console.error(err);
        if (active) {
          setDash(null);
          setError("Não foi possível carregar o dashboard desta avaliação.");
        }
      })
      .finally(() => {
        if (active) setLoadingDash(false);
      });
    return () => {
      active = false;
    };
  }, [testId, classId]);

  const classes = dash?.filters?.classes || [];
  const kpis = dash?.kpis;
  const hitInfo = saebFromLevel(kpis?.saeb_level, kpis?.saeb_label);

  const distData = useMemo(() => {
    if (!dash?.distribution?.length) {
      const totals = dash?.totals;
      if (!totals) return [];
      const total = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
      return (["SIM", "PARCIAL", "NAO", "BRANCO"] as const).map((name) => ({
        name: DISTRIBUTION_LABEL[name],
        key: name,
        value: totals[name] || 0,
        pct: Math.round(((totals[name] || 0) / total) * 100),
        color: RUBRIC_COLORS[name],
      }));
    }
    return dash.distribution.map((d) => {
      const key = (d.name || "").toUpperCase().replace("NÃO", "NAO") as keyof typeof RUBRIC_COLORS;
      return {
        name: DISTRIBUTION_LABEL[key] || d.name,
        key,
        value: d.value,
        pct: d.pct,
        color: RUBRIC_COLORS[key] || "#94a3b8",
      };
    });
  }, [dash]);

  const chartByQuestion = useMemo(
    () =>
      (dash?.per_question || []).map((q) => ({
        codigo: q.code || `Q${q.number}`,
        SIM: q.SIM,
        PARCIAL: q.PARCIAL,
        NAO: q.NAO,
        BRANCO: q.BRANCO,
      })),
    [dash]
  );

  const saebCounts = dash?.saeb_levels;
  const saebTotalQuestions =
    (saebCounts?.abaixo || 0) +
      (saebCounts?.basico || 0) +
      (saebCounts?.adequado || 0) +
      (saebCounts?.avancado || 0) || 1;

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Painel de resultados</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground md:text-3xl">
          Análise de Avaliações Subjetivas
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Acompanhe desempenho por habilidade e turma. Selecione uma avaliação para explorar os resultados.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Avaliação</Label>
              <Select
                value={testId}
                onValueChange={(v) => {
                  setTestId(v);
                  setClassId("all");
                }}
                disabled={loadingList || tests.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a avaliação" />
                </SelectTrigger>
                <SelectContent>
                  {tests.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                      {t.subject?.name ? ` · ${t.subject.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Turma</Label>
              <Select value={classId} onValueChange={setClassId} disabled={!dash || loadingDash}>
                <SelectTrigger>
                  <SelectValue placeholder="Turma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as turmas</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loadingList || loadingDash ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : kpis ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard
              icon={<Users className="h-5 w-5" />}
              label="Alunos"
              value={kpis.total_students}
            />
            <ParticipationCard
              pct={kpis.participation_pct}
              respondents={kpis.respondents}
              total={kpis.total_students}
            />
            <KpiCard
              icon={<UserX className="h-5 w-5" />}
              label="Ausentes"
              value={kpis.absent}
            />
            <KpiCard
              icon={<span className="text-xl leading-none">{hitInfo.emoji}</span>}
              label="Índice de acerto"
              value={`${kpis.hit_rate_pct}%`}
              sub={`${hitInfo.label} · ${kpis.total_responses} respostas`}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm text-muted-foreground">Níveis de Proficiência</CardTitle>
                  <p className="text-xs text-muted-foreground/80">Distribuição das questões por nível de acerto</p>
                </div>
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {SAEB_LEVELS.map((level) => {
                  const count = saebCounts?.[level.level] || 0;
                  const pct = Math.round((count / saebTotalQuestions) * 100);
                  return (
                    <div key={level.level} className={cn("rounded-xl border p-4", level.bg)}>
                      <div className="flex items-center justify-between">
                        <span className="text-3xl leading-none">{level.emoji}</span>
                        <span className={cn("text-2xl font-bold", level.text)}>{count}</span>
                      </div>
                      <p className={cn("mt-2 text-sm font-semibold", level.text)}>{level.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {level.range} · {pct}% das questões
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/60">
                        <div className="h-full" style={{ width: `${pct}%`, background: level.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        !error && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {tests.length === 0
                ? "Nenhuma avaliação subjetiva cadastrada."
                : "Selecione uma avaliação para ver os resultados."}
            </CardContent>
          </Card>
        )
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm text-muted-foreground">Distribuição geral</CardTitle>
                <p className="text-xs text-muted-foreground/80">Quantidade e % por marcação</p>
              </div>
              <Activity className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {distData.length > 0 && (kpis?.total_responses || 0) > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distData} margin={{ top: 24, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      formatter={(v: number, _n, p: any) => [`${v} (${p.payload.pct}%)`, p.payload.name]}
                      contentStyle={{ borderRadius: 8 }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {distData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                      <LabelList dataKey="value" position="top" fontSize={11} fontWeight="bold" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Desempenho por habilidade</CardTitle>
            <p className="text-xs text-muted-foreground/80">Colunas por marcação com quantidades</p>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {chartByQuestion.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartByQuestion} margin={{ top: 24, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="codigo" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 8 }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="SIM" fill={RUBRIC_COLORS.SIM} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="PARCIAL" fill={RUBRIC_COLORS.PARCIAL} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="NAO" name="NÃO" fill={RUBRIC_COLORS.NAO} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="BRANCO" fill={RUBRIC_COLORS.BRANCO} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Questões / Habilidades avaliadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(dash?.per_question || []).length === 0 && (
            <p className="text-sm text-muted-foreground">Sem dados para exibir.</p>
          )}
          {(dash?.per_question || []).map((q) => {
            const total = q.total || 1;
            const info = saebFromLevel(q.saeb_level, q.saeb_label);
            return (
              <div key={q.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-primary text-primary-foreground">{q.code || `Q${q.number}`}</Badge>
                      <span className="truncate text-sm font-medium">{q.skill_description}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-right">
                    <span className="text-2xl leading-none" title={info.label}>
                      {info.emoji}
                    </span>
                    <div>
                      <span className="text-lg font-bold" style={{ color: info.color }}>
                        {q.hit_rate_pct}%
                      </span>
                      <p className="text-[11px] text-muted-foreground">{info.label}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
                  {(["SIM", "PARCIAL", "NAO", "BRANCO"] as const).map((k) => {
                    const pct = ((q[k] || 0) / total) * 100;
                    return <div key={k} style={{ width: `${pct}%`, background: RUBRIC_COLORS[k] }} />;
                  })}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <Chip color={RUBRIC_COLORS.SIM} label={`Sim ${q.SIM} (${Math.round((q.SIM / total) * 100)}%)`} />
                  <Chip
                    color={RUBRIC_COLORS.PARCIAL}
                    label={`Parcial ${q.PARCIAL} (${Math.round((q.PARCIAL / total) * 100)}%)`}
                  />
                  <Chip color={RUBRIC_COLORS.NAO} label={`Não ${q.NAO} (${Math.round((q.NAO / total) * 100)}%)`} />
                  <Chip
                    color={RUBRIC_COLORS.BRANCO}
                    label={`Branco ${q.BRANCO} (${Math.round((q.BRANCO / total) * 100)}%)`}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {testId && (
        <div className="flex justify-end">
          <Link
            to={`/app/avaliacoes-subjetivas/${testId}/correcao`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Ir para a correção →
          </Link>
        </div>
      )}
    </div>
  );
};

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <Card className="p-5">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function ParticipationCard({
  pct,
  respondents,
  total,
}: {
  pct: number;
  respondents: number;
  total: number;
}) {
  const color = pct >= 60 ? RUBRIC_COLORS.SIM : pct >= 40 ? RUBRIC_COLORS.PARCIAL : RUBRIC_COLORS.NAO;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <ClipboardCheck className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Taxa de participação</p>
      <p className="mt-1 text-4xl font-extrabold" style={{ color }}>
        {pct}%
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {respondents} de {total} alunos participaram
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </Card>
  );
}

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Sem dados para exibir.
    </div>
  );
}

export default SubjectiveDashboard;
