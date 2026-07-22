import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, ClipboardCheck, Download, Filter, RefreshCw, TrendingUp, UserX, Users } from "lucide-react";
import { InstrumentPickerField } from "@/components/filters";
import {
  buildPickerContextLines,
  toInstrumentPickerSeries,
} from "@/components/filters/instrumentPickerHelpers";
import type { InstrumentPickerItem } from "@/components/filters";
import {
  subjectiveTestApi,
  type SubjectiveDashboardResponse,
  type SubjectiveFilterEntity,
  type SubjectiveFilterEvaluation,
  type SubjectiveSaebLevel,
} from "@/services/evaluation/subjectiveTestApi";
import { generateSubjectiveDashboardPdf } from "@/services/reports/subjectiveDashboardPdf";
import { generateSubjectiveCorrectionResponsesPdf } from "@/services/reports/subjectiveCorrectionResponsesPdf";
import { RUBRIC_COLORS, SAEB_LEVELS, saebFromLevel } from "@/lib/subjectiveSaeb";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const DISTRIBUTION_LABEL: Record<string, string> = {
  SIM: "SIM",
  PARCIAL: "PARCIAL",
  NAO: "NÃO",
  BRANCO: "BRANCO",
};

function toPickerItems(evaluations: SubjectiveFilterEvaluation[]): InstrumentPickerItem[] {
  return evaluations.map((e) => {
    const badge = e.test_type?.trim() || undefined;
    return {
      id: e.id,
      label: e.titulo || "—",
      badge,
      badges: badge ? [badge] : [],
      subtitle: badge,
    };
  });
}

const SubjectiveDashboard = () => {
  const { toast } = useToast();
  const [selectedState, setSelectedState] = useState("all");
  const [selectedMunicipality, setSelectedMunicipality] = useState("all");
  const [selectedSchool, setSelectedSchool] = useState("all");
  const [selectedGrade, setSelectedGrade] = useState("all");
  const [gradeTouched, setGradeTouched] = useState(false);
  const [selectedEvaluation, setSelectedEvaluation] = useState("");
  const [selectedClass, setSelectedClass] = useState("all");

  const [states, setStates] = useState<SubjectiveFilterEntity[]>([]);
  const [municipalities, setMunicipalities] = useState<SubjectiveFilterEntity[]>([]);
  const [schools, setSchools] = useState<SubjectiveFilterEntity[]>([]);
  const [grades, setGrades] = useState<SubjectiveFilterEntity[]>([]);
  const [evaluations, setEvaluations] = useState<SubjectiveFilterEvaluation[]>([]);
  const [classes, setClasses] = useState<SubjectiveFilterEntity[]>([]);
  const [escolaPreSelecionada, setEscolaPreSelecionada] = useState<string | null>(null);

  const [modalSerieFiltro, setModalSerieFiltro] = useState("all");
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingDash, setLoadingDash] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isExportingResponses, setIsExportingResponses] = useState(false);
  const [dash, setDash] = useState<SubjectiveDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtersRequestIdRef = useRef(0);
  const schoolLocked = Boolean(escolaPreSelecionada);
  const schoolsForSelect = useMemo(() => {
    if (selectedSchool === "all") return schools;
    if (schools.some((s) => s.id === selectedSchool)) return schools;
    const preName =
      schools.find((s) => s.id === selectedSchool)?.nome ||
      (escolaPreSelecionada === selectedSchool ? "Escola vinculada" : "Carregando…");
    return [...schools, { id: selectedSchool, nome: preName }];
  }, [schools, selectedSchool, escolaPreSelecionada]);

  const resetFromMunicipality = useCallback(() => {
    setSelectedSchool("all");
    setSelectedGrade("all");
    setGradeTouched(false);
    setSelectedEvaluation("");
    setSelectedClass("all");
    setEscolaPreSelecionada(null);
    setSchools([]);
    setGrades([]);
    setEvaluations([]);
    setClasses([]);
  }, []);

  const resetFromSchool = useCallback(() => {
    setSelectedGrade("all");
    setGradeTouched(false);
    setSelectedEvaluation("");
    setSelectedClass("all");
  }, []);

  const resetFromGrade = useCallback(() => {
    setSelectedEvaluation("");
    setSelectedClass("all");
  }, []);

  const resetFromEvaluation = useCallback(() => {
    setSelectedClass("all");
  }, []);

  // Cascata: GET /subjective-tests/opcoes-filtros
  useEffect(() => {
    const requestId = ++filtersRequestIdRef.current;
    let active = true;

    const load = async () => {
      setLoadingFilters(true);
      try {
        const opts = await subjectiveTestApi.getFilterOptions({
          estado: selectedState,
          municipio: selectedMunicipality,
          escola: selectedSchool,
          serie: selectedGrade,
          avaliacao: selectedEvaluation || undefined,
        });

        if (!active || requestId !== filtersRequestIdRef.current) return;

        if (opts.error) {
          setError(opts.error);
        } else {
          setError((prev) =>
            prev === "Não foi possível carregar os filtros." ? null : prev
          );
        }

        setStates(opts.estados || []);
        setMunicipalities(opts.municipios || []);
        setSchools(opts.escolas || []);
        setGrades(opts.series || []);
        setEvaluations(opts.avaliacoes || []);
        setClasses(opts.turmas || []);

        const pre = opts.escola_pre_selecionada ? String(opts.escola_pre_selecionada) : null;
        setEscolaPreSelecionada(pre);

        if (pre && selectedMunicipality !== "all" && selectedSchool !== pre) {
          setSelectedSchool(pre);
        }

        if (
          selectedEvaluation &&
          !(opts.avaliacoes || []).some((a) => a.id === selectedEvaluation)
        ) {
          setSelectedEvaluation("");
          setSelectedClass("all");
        } else if (
          selectedClass !== "all" &&
          !(opts.turmas || []).some((t) => t.id === selectedClass)
        ) {
          setSelectedClass("all");
        }
      } catch (err) {
        console.error(err);
        if (active && requestId === filtersRequestIdRef.current) {
          setError("Não foi possível carregar os filtros.");
          if (selectedState === "all") setStates([]);
          if (selectedMunicipality === "all") {
            setMunicipalities([]);
            setSchools([]);
            setGrades([]);
            setEvaluations([]);
            setClasses([]);
          }
        }
      } finally {
        if (active && requestId === filtersRequestIdRef.current) {
          setLoadingFilters(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [selectedState, selectedMunicipality, selectedSchool, selectedGrade, selectedEvaluation]);

  // Dashboard
  useEffect(() => {
    if (!selectedEvaluation || selectedMunicipality === "all") {
      setDash(null);
      return;
    }
    let active = true;
    setLoadingDash(true);
    setError(null);
    subjectiveTestApi
      .getDashboard(
        selectedEvaluation,
        selectedClass === "all" ? null : selectedClass,
        selectedMunicipality
      )
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
  }, [selectedEvaluation, selectedClass, selectedMunicipality]);

  const pickerItems = useMemo(() => toPickerItems(evaluations), [evaluations]);

  const modalItems = useMemo(() => {
    if (modalSerieFiltro === "all") return pickerItems;
    return toPickerItems(evaluations.filter((e) => e.grade_id === modalSerieFiltro));
  }, [evaluations, modalSerieFiltro, pickerItems]);

  const seriesOptions = useMemo(() => toInstrumentPickerSeries(grades), [grades]);

  const contextLines = useMemo(
    () =>
      buildPickerContextLines({
        estado: states.find((s) => s.id === selectedState)?.nome,
        municipio: municipalities.find((m) => m.id === selectedMunicipality)?.nome,
        escola:
          selectedSchool !== "all"
            ? schools.find((s) => s.id === selectedSchool)?.nome
            : undefined,
      }),
    [states, municipalities, schools, selectedState, selectedMunicipality, selectedSchool]
  );

  const kpis = dash?.kpis;
  const hitInfo = saebFromLevel(kpis?.saeb_level, kpis?.saeb_label);
  const filtersReady = selectedState !== "all" && selectedMunicipality !== "all";
  const canLoadDashboard = filtersReady && Boolean(selectedEvaluation);

  const scope = useMemo(
    () => ({
      estado: states.find((s) => s.id === selectedState)?.nome ?? "—",
      municipio: municipalities.find((m) => m.id === selectedMunicipality)?.nome ?? "—",
      escola:
        selectedSchool !== "all"
          ? schools.find((s) => s.id === selectedSchool)?.nome ?? "—"
          : "Todas",
      serie:
        selectedGrade !== "all"
          ? grades.find((g) => g.id === selectedGrade)?.nome ?? "—"
          : "Todas",
      avaliacao: evaluations.find((e) => e.id === selectedEvaluation)?.titulo ?? "—",
      turma:
        selectedClass !== "all"
          ? classes.find((c) => c.id === selectedClass)?.nome ?? "—"
          : "Todas",
    }),
    [
      states,
      municipalities,
      schools,
      grades,
      evaluations,
      classes,
      selectedState,
      selectedMunicipality,
      selectedSchool,
      selectedGrade,
      selectedEvaluation,
      selectedClass,
    ]
  );

  const downloadPdf = async () => {
    if (!dash) return;
    try {
      setIsGeneratingPdf(true);
      await generateSubjectiveDashboardPdf(dash, {
        estado: states.find((s) => s.id === selectedState)?.nome,
        municipio: municipalities.find((m) => m.id === selectedMunicipality)?.nome,
        municipioId: selectedMunicipality !== "all" ? selectedMunicipality : null,
        escola:
          selectedSchool !== "all"
            ? schools.find((s) => s.id === selectedSchool)?.nome
            : "Todas",
        serie:
          selectedGrade !== "all" ? grades.find((g) => g.id === selectedGrade)?.nome : "Todas",
        turma:
          selectedClass !== "all"
            ? classes.find((c) => c.id === selectedClass)?.nome
            : "Todas as turmas",
        avaliacaoTitulo:
          evaluations.find((e) => e.id === selectedEvaluation)?.titulo ||
          dash.subjective_test?.title,
      });
      toast({
        title: "Relatório baixado",
        description: "O PDF da análise subjetiva foi salvo no seu dispositivo.",
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Erro ao gerar PDF",
        description: "Não foi possível gerar o relatório no navegador. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const downloadResponsesPdf = async () => {
    if (!dash?.students?.length || !dash.per_question?.length) {
      toast({
        title: "Sem respostas para exportar",
        description: "Selecione uma avaliação com lançamentos de alunos.",
        variant: "destructive",
      });
      return;
    }
    try {
      setIsExportingResponses(true);
      const turmaLabel =
        selectedClass !== "all"
          ? classes.find((c) => c.id === selectedClass)?.nome || "Turma"
          : "Todas as turmas";
      await generateSubjectiveCorrectionResponsesPdf({
        subjective_test: dash.subjective_test,
        class: { id: dash.filters.class_id || "all", name: turmaLabel },
        questions: dash.per_question.map((q) => ({
          id: q.id,
          number: q.number,
          code: q.code,
          skill_description: q.skill_description,
        })),
        students: dash.students.map((s) => ({
          id: s.id,
          name: s.name,
          registration: s.registration || "",
          present: s.present,
          results: s.results || {},
          evaluation:
            s.score_percentage != null
              ? {
                  score_percentage: s.score_percentage,
                  grade: 0,
                  proficiency: s.score_percentage,
                  classification: s.saeb_label || "",
                  correct_answers: 0,
                  total_questions: dash.per_question.length,
                  persisted: false,
                }
              : null,
        })),
      });
      toast({
        title: "Respostas exportadas",
        description: "O PDF com as respostas dos alunos foi baixado.",
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Erro ao exportar respostas",
        description: "Não foi possível gerar o relatório de respostas.",
        variant: "destructive",
      });
    } finally {
      setIsExportingResponses(false);
    }
  };

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

  const studentSaebCounts = dash?.student_saeb_levels;
  const studentsByLevel = dash?.students_by_saeb_level;
  const saebTotalStudents =
    (studentSaebCounts?.abaixo || 0) +
      (studentSaebCounts?.basico || 0) +
      (studentSaebCounts?.adequado || 0) +
      (studentSaebCounts?.avancado || 0) || 1;

  const studentsTable = dash?.students || [];
  const getStudentsForLevel = (level: SubjectiveSaebLevel) => studentsByLevel?.[level] || [];

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Painel de resultados</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground md:text-3xl">
            Análise de Avaliações Subjetivas
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Acompanhe desempenho por habilidade e turma. Selecione uma avaliação para explorar os
            resultados.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void downloadResponsesPdf()}
            disabled={!dash || loadingDash || isExportingResponses || !(dash.students?.length)}
            className="flex items-center gap-2"
          >
            {isExportingResponses ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Exportar respostas
              </>
            )}
          </Button>
          <Button
            onClick={() => void downloadPdf()}
            disabled={!dash || loadingDash || isGeneratingPdf}
            className="flex items-center gap-2"
          >
            {isGeneratingPdf ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Baixando relatório...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Baixar relatório
              </>
            )}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <Select
                value={selectedState}
                onValueChange={(v) => {
                  setSelectedState(v);
                  setSelectedMunicipality("all");
                  resetFromMunicipality();
                }}
                disabled={loadingFilters && states.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {states.map((state) => (
                    <SelectItem key={state.id} value={state.id}>
                      {state.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Município</label>
              <Select
                value={selectedMunicipality}
                onValueChange={(v) => {
                  setSelectedMunicipality(v);
                  resetFromMunicipality();
                }}
                disabled={loadingFilters || selectedState === "all"}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o município" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {municipalities.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Escola</label>
              <Select
                value={selectedSchool}
                onValueChange={(v) => {
                  setSelectedSchool(v);
                  resetFromSchool();
                }}
                disabled={loadingFilters || selectedMunicipality === "all" || schoolLocked}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a escola" />
                </SelectTrigger>
                <SelectContent>
                  {(!schoolLocked || selectedSchool === "all") && (
                    <SelectItem value="all">Todas</SelectItem>
                  )}
                  {schoolsForSelect.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {schoolLocked && (
                <p className="text-xs text-muted-foreground">Escola definida pelo seu perfil.</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Série</label>
              <Select
                value={selectedGrade}
                onValueChange={(v) => {
                  setSelectedGrade(v);
                  setGradeTouched(true);
                  resetFromGrade();
                }}
                disabled={loadingFilters || selectedMunicipality === "all"}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a série" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {grades.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <InstrumentPickerField
              label="Avaliação"
              value={selectedEvaluation}
              onChange={(v) => {
                setSelectedEvaluation(v);
                resetFromEvaluation();
              }}
              items={pickerItems}
              modalItems={modalItems}
              seriesOptions={seriesOptions}
              disabled={loadingFilters || !filtersReady}
              loading={loadingFilters && filtersReady}
              placeholder="Selecione a avaliação"
              modalTitle="Selecionar avaliação"
              emptyMessage="Nenhuma avaliação subjetiva com correção neste recorte."
              contextLines={contextLines}
              contextRequiredMessage="Selecione estado e município antes de buscar."
              onModalOpen={() => setModalSerieFiltro("all")}
              onModalFiltersChange={({ serieFiltro }) => setModalSerieFiltro(serieFiltro)}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium">Turma</label>
              <Select
                value={selectedClass}
                onValueChange={setSelectedClass}
                disabled={loadingFilters || !selectedEvaluation || loadingDash}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a turma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as turmas</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
            <p className="text-sm text-blue-700 dark:text-blue-400">
              <strong>Hierarquia dos Filtros:</strong> Estado → Município → Escola → Série → Avaliação →
              Turma
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
              <strong>Estado</strong>, <strong>Município</strong> e <strong>Avaliação</strong> são
              obrigatórios. Escola, Série e Turma podem ser &quot;Todas&quot;.
            </p>
          </div>
        </CardContent>
      </Card>

      {canLoadDashboard && gradeTouched && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4" />
              Escopo da pesquisa
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Recorte atual dos dados exibidos abaixo.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <ScopeItem label="Estado" value={scope.estado} />
              <ScopeItem label="Município" value={scope.municipio} />
              <ScopeItem label="Escola" value={scope.escola} />
              <ScopeItem label="Série" value={scope.serie} />
              <ScopeItem label="Turma" value={scope.turma} />
              <ScopeItem label="Avaliação" value={scope.avaliacao} />
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!canLoadDashboard && !error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Filter className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-medium">Selecione os filtros para continuar</h3>
            <p className="max-w-md text-center text-sm text-muted-foreground">
              Para visualizar os resultados, selecione <strong>Estado</strong>,{" "}
              <strong>Município</strong> e uma <strong>Avaliação</strong> com correção lançada.
            </p>
          </CardContent>
        </Card>
      )}

      {canLoadDashboard && loadingDash ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : null}

      {canLoadDashboard && !loadingDash && kpis ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard icon={<Users className="h-5 w-5" />} label="Alunos" value={kpis.total_students} />
            <ParticipationCard
              pct={kpis.participation_pct}
              respondents={kpis.respondents}
              total={kpis.total_students}
            />
            <KpiCard icon={<UserX className="h-5 w-5" />} label="Ausentes" value={kpis.absent} />
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
                  <p className="text-xs text-muted-foreground/80">
                    Passe o mouse sobre o nível para ver quais alunos estão nele
                  </p>
                </div>
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <TooltipProvider delayDuration={150}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {SAEB_LEVELS.map((level) => {
                    const count = studentSaebCounts?.[level.level] || 0;
                    const pct = Math.round((count / saebTotalStudents) * 100);
                    const levelStudents = getStudentsForLevel(level.level);
                    return (
                      <UiTooltip key={level.level}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "cursor-default rounded-xl border p-4 outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
                              level.bg
                            )}
                            tabIndex={0}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-3xl leading-none">{level.emoji}</span>
                              <span className={cn("text-2xl font-bold", level.text)}>{count}</span>
                            </div>
                            <p className={cn("mt-2 text-sm font-semibold", level.text)}>{level.label}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {level.range} · {pct}% dos alunos
                            </p>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/60">
                              <div className="h-full" style={{ width: `${pct}%`, background: level.color }} />
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          align="start"
                          className="max-h-64 max-w-xs overflow-y-auto border bg-popover p-3 text-popover-foreground shadow-md"
                        >
                          <p className="mb-2 text-xs font-semibold">
                            {level.label} · {count} aluno(s)
                          </p>
                          {levelStudents.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Nenhum aluno neste nível.</p>
                          ) : (
                            <ul className="space-y-1">
                              {levelStudents.map((student) => (
                                <li key={student.id} className="text-xs leading-snug">
                                  <span className="font-medium">{student.name}</span>
                                  <span className="text-muted-foreground">
                                    {" "}
                                    · {student.score_percentage}%
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </TooltipContent>
                      </UiTooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            </CardContent>
          </Card>
        </>
      ) : null}

      {canLoadDashboard && !loadingDash && dash && (
        <>
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
                          <Badge className="bg-primary text-primary-foreground">
                            {q.code || `Q${q.number}`}
                          </Badge>
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
                      <Chip
                        color={RUBRIC_COLORS.SIM}
                        label={`Sim ${q.SIM} (${Math.round((q.SIM / total) * 100)}%)`}
                      />
                      <Chip
                        color={RUBRIC_COLORS.PARCIAL}
                        label={`Parcial ${q.PARCIAL} (${Math.round((q.PARCIAL / total) * 100)}%)`}
                      />
                      <Chip
                        color={RUBRIC_COLORS.NAO}
                        label={`Não ${q.NAO} (${Math.round((q.NAO / total) * 100)}%)`}
                      />
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

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Alunos por nível</CardTitle>
              <p className="text-xs text-muted-foreground/80">
                Tabelinha individual com índice SAEB simplificado da avaliação subjetiva
              </p>
            </CardHeader>
            <CardContent>
              {studentsTable.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem alunos no escopo selecionado.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[520px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted/60">
                        <th className="border-b border-border p-3 text-left font-semibold">Aluno</th>
                        <th className="border-b border-border p-3 text-center font-semibold">Presença</th>
                        <th className="border-b border-border p-3 text-center font-semibold">Acerto</th>
                        <th className="border-b border-border p-3 text-center font-semibold">Nível</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentsTable.map((student, idx) => {
                        const info = student.saeb_level
                          ? saebFromLevel(student.saeb_level, student.saeb_label)
                          : null;
                        return (
                          <tr
                            key={student.id}
                            className={cn(idx % 2 === 1 && "bg-muted/20", !student.present && "opacity-60")}
                          >
                            <td className="border-b border-border p-3">
                              <div className="font-medium">{student.name}</div>
                              {student.registration ? (
                                <div className="text-xs text-muted-foreground">{student.registration}</div>
                              ) : null}
                            </td>
                            <td className="border-b border-border p-3 text-center text-xs">
                              {student.present ? "Presente" : "Ausente"}
                            </td>
                            <td className="border-b border-border p-3 text-center font-semibold">
                              {student.score_percentage != null ? `${student.score_percentage}%` : "—"}
                            </td>
                            <td className="border-b border-border p-3 text-center">
                              {info ? (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                    info.bg,
                                    info.text
                                  )}
                                >
                                  <span>{info.emoji}</span>
                                  {info.label}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Link
              to={`/app/avaliacoes-subjetivas/${selectedEvaluation}/correcao`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Ir para a correção →
            </Link>
          </div>
        </>
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

function ScopeItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="font-medium">{value}</span>
    </div>
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
