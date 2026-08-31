import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Loader2,
  Percent,
  RefreshCw,
  Trophy,
  UserRound,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { InstrumentPickerField } from '@/components/filters';
import {
  buildPickerContextLines,
  toInstrumentPickerItems,
} from '@/components/filters/instrumentPickerHelpers';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';
import {
  getUserHierarchyContext,
  getRestrictionMessage,
  validateReportAccess,
  type UserHierarchyContext,
} from '@/utils/userHierarchy';
import { formatDecimal1PtBr, formatPercent1PtBr } from '@/utils/numberFormat';
import { getReportProficiencyTagClass } from '@/utils/report/reportTagStyles';
import { cn } from '@/lib/utils';
import {
  alunoPickerLabel,
  getBoletimMarkStatus,
  questionAlternativeLetters,
} from '@/utils/reports/boletimAlunoHelpers';
import {
  BoletimAlunoApiService,
  boletimReportEntityTypeForFlow,
  getBoletimAlunoApiErrorMessage,
} from '@/services/reports/boletimAlunoApi';
import { generateBoletimAlunoPdf } from '@/services/reports/boletimAlunoPdf';
import type {
  BoletimAlunoFilterAluno,
  BoletimAlunoFilterAvaliacao,
  BoletimAlunoFilterEntity,
  BoletimAlunoFilterTurma,
  BoletimAlunoItem,
  BoletimAlunoPaginacao,
  BoletimAlunoQuestao,
  BoletimAlunoReportFlow,
  BoletimAlunoResumo,
} from '@/types/boletim-aluno';

const ALUNOS_PER_PAGE = 20;
const RESUMO_PER_PAGE = 20;

type FilterOption = BoletimAlunoFilterEntity;

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR');
}

function MarkCircle({ status }: { status: 'correct' | 'wrong' | 'empty' }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded-full border-2',
        status === 'correct' && 'border-emerald-600 bg-emerald-500',
        status === 'wrong' && 'border-red-600 bg-red-500',
        status === 'empty' && 'border-border bg-background'
      )}
      aria-hidden
    />
  );
}

function DisciplinaQuestoesTable({
  questoes,
}: {
  questoes: BoletimAlunoQuestao[];
}) {
  const letters = questionAlternativeLetters(questoes);
  return (
    <Table className="border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border">
      <TableHeader>
        <TableRow className="bg-muted/60 hover:bg-muted/60">
          <TableHead className="w-14 text-center text-foreground/80">#</TableHead>
          {letters.map((letter) => (
            <TableHead key={letter} className="w-12 text-center text-foreground/80">
              {letter}
            </TableHead>
          ))}
          <TableHead className="w-16 text-center text-foreground/80">GAB</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {questoes.map((q) => (
          <TableRow key={q.numero}>
            <TableCell className="text-center">
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary">
                Q{q.numero}
              </span>
            </TableCell>
            {letters.map((letter) => (
              <TableCell key={letter} className="text-center">
                <MarkCircle status={getBoletimMarkStatus(q, letter)} />
              </TableCell>
            ))}
            <TableCell className="text-center">
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-emerald-500 px-2 text-xs font-bold text-white">
                {q.gabarito || '—'}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BoletimCard({
  item,
  avaliacaoNome,
}: {
  item: BoletimAlunoItem;
  avaliacaoNome: string;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-primary/15 bg-card p-4 sm:p-6">
      <header className="space-y-1 text-center">
        <p className="text-xs font-semibold tracking-wide text-primary">BOLETIM DIAGNÓSTICO DO ALUNO</p>
        <h3 className="text-lg font-semibold tracking-tight">{item.aluno.nome}</h3>
        <p className="text-sm text-muted-foreground">{avaliacaoNome}</p>
        <p className="text-xs text-muted-foreground">
          {[item.aluno.escola, item.aluno.serie, item.aluno.turma && `Turma ${item.aluno.turma}`, item.aluno.matricula && `Matrícula ${item.aluno.matricula}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {(item.por_disciplina ?? []).map((bloco) => (
          <Card key={bloco.disciplina_id || bloco.disciplina} className="overflow-hidden border-primary/15">
            <CardHeader className="bg-primary py-2.5">
              <CardTitle className="flex items-center gap-2 text-sm text-primary-foreground">
                <BookOpen className="h-4 w-4" />
                {bloco.disciplina}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {bloco.questoes?.length ? (
                <DisciplinaQuestoesTable questoes={bloco.questoes} />
              ) : (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  Nenhuma questão nesta disciplina.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="overflow-hidden border-0 bg-primary text-primary-foreground">
          <CardHeader className="pb-1 pt-3">
            <CardDescription className="flex items-center gap-2 text-primary-foreground/80">
              <BarChart3 className="h-4 w-4" />
              Acertos totais
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatNumber(item.cards.acertos_totais.acertou)} / {formatNumber(item.cards.acertos_totais.total)}
            </CardTitle>
            <p className="text-xs text-primary-foreground/80">
              {formatPercent1PtBr(item.cards.acertos_totais.percentual)}
            </p>
          </CardHeader>
        </Card>
        <Card className="overflow-hidden border-0 bg-primary text-primary-foreground">
          <CardHeader className="pb-2 pt-3">
            <CardDescription className="flex items-center gap-2 text-primary-foreground/80">
              <Percent className="h-4 w-4" />
              Nota
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatDecimal1PtBr(item.cards.nota)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="overflow-hidden border-0 bg-primary text-primary-foreground">
          <CardHeader className="pb-2 pt-3">
            <CardDescription className="flex items-center gap-2 text-primary-foreground/80">
              <Trophy className="h-4 w-4" />
              Proficiência
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatDecimal1PtBr(item.cards.proficiencia)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="overflow-hidden border-0 bg-primary text-primary-foreground">
          <CardHeader className="pb-2 pt-3">
            <CardDescription className="text-primary-foreground/80">Nível geral</CardDescription>
            <CardTitle className="text-xl">
              <Badge className={cn(getReportProficiencyTagClass(item.cards.nivel), 'normal-case tracking-normal')}>
                {item.cards.nivel || '—'}
              </Badge>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

type RelatorioBoletimAlunoProps = {
  flow?: BoletimAlunoReportFlow;
  hidePageHeading?: boolean;
};

export default function RelatorioBoletimAluno({
  flow = 'digital',
  hidePageHeading = false,
}: RelatorioBoletimAlunoProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const isCartao = flow === 'cartao';
  const instrumentLabel = isCartao ? 'Cartão-resposta' : 'Avaliação';
  const instrumentSingular = isCartao ? 'cartão-resposta' : 'avaliação';
  const reportEntityType = boletimReportEntityTypeForFlow(flow);

  const normalizedRole = (user?.role ?? '').toLowerCase();
  const roleRequiresSpecificSchool = ['diretor', 'coordenador', 'professor'].includes(normalizedRole);

  const [userHierarchyContext, setUserHierarchyContext] = useState<UserHierarchyContext | null>(null);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(true);

  const [estados, setEstados] = useState<FilterOption[]>([]);
  const [municipios, setMunicipios] = useState<FilterOption[]>([]);
  const [avaliacoesOpcoes, setAvaliacoesOpcoes] = useState<BoletimAlunoFilterAvaliacao[]>([]);
  const [escolas, setEscolas] = useState<FilterOption[]>([]);
  const [series, setSeries] = useState<FilterOption[]>([]);
  const [turmas, setTurmas] = useState<BoletimAlunoFilterTurma[]>([]);
  const [alunos, setAlunos] = useState<BoletimAlunoFilterAluno[]>([]);
  const [alunosPaginacao, setAlunosPaginacao] = useState<BoletimAlunoPaginacao>({
    page: 1,
    per_page: ALUNOS_PER_PAGE,
    total: 0,
    total_pages: 0,
  });

  const [selectedEstado, setSelectedEstado] = useState('all');
  const [selectedMunicipio, setSelectedMunicipio] = useState('all');
  const [selectedAvaliacao, setSelectedAvaliacao] = useState('all');
  const [selectedEscola, setSelectedEscola] = useState('all');
  const [selectedSerie, setSelectedSerie] = useState('all');
  const [selectedTurma, setSelectedTurma] = useState('all');
  const [selectedAluno, setSelectedAluno] = useState('all');
  const [selectedAlunoMeta, setSelectedAlunoMeta] = useState<BoletimAlunoFilterAluno | null>(null);
  const [alunoSearch, setAlunoSearch] = useState('');
  const [alunoSearchDebounced, setAlunoSearchDebounced] = useState('');
  const [alunoPickerOpen, setAlunoPickerOpen] = useState(false);

  const [loadingEstados, setLoadingEstados] = useState(false);
  const [loadingMunicipios, setLoadingMunicipios] = useState(false);
  const [loadingAvaliacoes, setLoadingAvaliacoes] = useState(false);
  const [loadingEscolas, setLoadingEscolas] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingTurmas, setLoadingTurmas] = useState(false);
  const [loadingAlunos, setLoadingAlunos] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [resultPage, setResultPage] = useState(1);

  const [report, setReport] = useState<BoletimAlunoResumo | null>(null);

  const canGenerate =
    selectedEstado !== 'all' && selectedMunicipio !== 'all' && selectedAvaliacao !== 'all';

  const lockedSchoolId = roleRequiresSpecificSchool ? userHierarchyContext?.school?.id : undefined;

  const avaliacaoPickerItems = useMemo(
    () => toInstrumentPickerItems(avaliacoesOpcoes),
    [avaliacoesOpcoes]
  );

  const pickerContextLines = useMemo(
    () =>
      buildPickerContextLines({
        estado:
          selectedEstado !== 'all'
            ? estados.find((s) => s.id === selectedEstado)?.nome || selectedEstado
            : undefined,
        municipio:
          selectedMunicipio !== 'all'
            ? municipios.find((m) => m.id === selectedMunicipio)?.nome || selectedMunicipio
            : undefined,
      }),
    [selectedEstado, selectedMunicipio, estados, municipios]
  );

  const alunoDisplayLabel = useMemo(() => {
    if (selectedAluno === 'all') return 'Todos os alunos';
    if (selectedAlunoMeta && selectedAlunoMeta.id === selectedAluno) {
      return alunoPickerLabel(selectedAlunoMeta);
    }
    const found = alunos.find((a) => a.id === selectedAluno);
    return found ? alunoPickerLabel(found) : 'Aluno selecionado';
  }, [selectedAluno, selectedAlunoMeta, alunos]);

  useEffect(() => {
    const timer = window.setTimeout(() => setAlunoSearchDebounced(alunoSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [alunoSearch]);

  useEffect(() => {
    if (user && !['admin', 'professor', 'diretor', 'coordenador', 'tecadm'].includes(user.role)) {
      toast({
        title: 'Acesso negado',
        description: 'Você não tem permissão para acessar esta página.',
        variant: 'destructive',
      });
      navigate('/app');
    }
  }, [user, navigate, toast]);

  useEffect(() => {
    const loadHierarchy = async () => {
      if (!user?.id || !user?.role) {
        setIsLoadingHierarchy(false);
        return;
      }
      try {
        setIsLoadingHierarchy(true);
        const context = await getUserHierarchyContext(user.id, user.role);
        setUserHierarchyContext(context);
        if (context.municipality) {
          setSelectedMunicipio(context.municipality.id);
          try {
            const opcoes = await BoletimAlunoApiService.getOpcoesFiltros({
              report_entity_type: reportEntityType,
            });
            const matched = opcoes.estados.find(
              (s) =>
                s.id === context.municipality!.state ||
                s.nome.toLowerCase() === context.municipality!.state?.toLowerCase()
            );
            if (matched) setSelectedEstado(matched.id);
          } catch {
            // silenciar
          }
        }
      } catch {
        toast({
          title: 'Aviso',
          description:
            'Não foi possível carregar suas permissões. Algumas funcionalidades podem estar limitadas.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingHierarchy(false);
      }
    };
    void loadHierarchy();
  }, [user?.id, user?.role, toast, reportEntityType]);

  useEffect(() => {
    let cancelled = false;
    setLoadingEstados(true);
    BoletimAlunoApiService.getOpcoesFiltros({ report_entity_type: reportEntityType })
      .then((data) => {
        if (!cancelled) setEstados(data.estados ?? []);
      })
      .catch(() => {
        if (!cancelled) setEstados([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingEstados(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportEntityType]);

  useEffect(() => {
    if (selectedEstado === 'all') {
      setMunicipios([]);
      return;
    }
    let cancelled = false;
    setLoadingMunicipios(true);
    BoletimAlunoApiService.getOpcoesFiltros({
      estado: selectedEstado,
      report_entity_type: reportEntityType,
    })
      .then((data) => {
        if (!cancelled) setMunicipios(data.municipios ?? []);
      })
      .catch(() => {
        if (!cancelled) setMunicipios([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMunicipios(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEstado, reportEntityType]);

  useEffect(() => {
    if (selectedEstado === 'all' || selectedMunicipio === 'all') {
      setAvaliacoesOpcoes([]);
      return;
    }
    let cancelled = false;
    setLoadingAvaliacoes(true);
    BoletimAlunoApiService.getOpcoesFiltros({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      report_entity_type: reportEntityType,
    })
      .then((data) => {
        if (!cancelled) setAvaliacoesOpcoes(data.avaliacoes ?? []);
      })
      .catch(() => {
        if (!cancelled) setAvaliacoesOpcoes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAvaliacoes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEstado, selectedMunicipio, reportEntityType]);

  useEffect(() => {
    if (selectedEstado === 'all' || selectedMunicipio === 'all' || selectedAvaliacao === 'all') {
      setEscolas([]);
      return;
    }
    let cancelled = false;
    setLoadingEscolas(true);
    BoletimAlunoApiService.getOpcoesFiltros({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      avaliacao: selectedAvaliacao,
      report_entity_type: reportEntityType,
    })
      .then((data) => {
        if (cancelled) return;
        const nextEscolas = data.escolas ?? [];
        setEscolas(nextEscolas);
        setSelectedEscola((prev) => {
          if (lockedSchoolId && nextEscolas.some((e) => e.id === lockedSchoolId)) return lockedSchoolId;
          if (prev !== 'all' && !nextEscolas.some((e) => e.id === prev)) return 'all';
          return prev;
        });
      })
      .catch(() => {
        if (!cancelled) setEscolas([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingEscolas(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEstado, selectedMunicipio, selectedAvaliacao, reportEntityType, lockedSchoolId]);

  useEffect(() => {
    if (selectedEstado === 'all' || selectedMunicipio === 'all' || selectedAvaliacao === 'all') {
      setSeries([]);
      return;
    }
    let cancelled = false;
    setLoadingSeries(true);
    BoletimAlunoApiService.getOpcoesFiltros({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      avaliacao: selectedAvaliacao,
      escola: selectedEscola !== 'all' ? selectedEscola : undefined,
      report_entity_type: reportEntityType,
    })
      .then((data) => {
        if (cancelled) return;
        const nextSeries = data.series ?? [];
        setSeries(nextSeries);
        setSelectedSerie((prev) =>
          prev !== 'all' && !nextSeries.some((s) => s.id === prev) ? 'all' : prev
        );
      })
      .catch(() => {
        if (!cancelled) setSeries([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSeries(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEstado, selectedMunicipio, selectedAvaliacao, selectedEscola, reportEntityType]);

  useEffect(() => {
    if (
      selectedEstado === 'all' ||
      selectedMunicipio === 'all' ||
      selectedAvaliacao === 'all' ||
      selectedSerie === 'all'
    ) {
      setTurmas([]);
      return;
    }
    let cancelled = false;
    setLoadingTurmas(true);
    BoletimAlunoApiService.getOpcoesFiltros({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      avaliacao: selectedAvaliacao,
      escola: selectedEscola !== 'all' ? selectedEscola : undefined,
      serie: selectedSerie,
      report_entity_type: reportEntityType,
    })
      .then((data) => {
        if (cancelled) return;
        const nextTurmas = data.turmas ?? [];
        setTurmas(nextTurmas);
        setSelectedTurma((prev) =>
          prev !== 'all' && !nextTurmas.some((t) => t.id === prev) ? 'all' : prev
        );
      })
      .catch(() => {
        if (!cancelled) setTurmas([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTurmas(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    selectedEstado,
    selectedMunicipio,
    selectedAvaliacao,
    selectedEscola,
    selectedSerie,
    reportEntityType,
  ]);

  const fetchAlunos = useCallback(
    async (page: number, append: boolean) => {
      if (selectedEstado === 'all' || selectedMunicipio === 'all' || selectedAvaliacao === 'all') {
        setAlunos([]);
        return;
      }
      setLoadingAlunos(true);
      try {
        const data = await BoletimAlunoApiService.getOpcoesFiltros({
          estado: selectedEstado,
          municipio: selectedMunicipio,
          avaliacao: selectedAvaliacao,
          escola: selectedEscola !== 'all' ? selectedEscola : undefined,
          serie: selectedSerie !== 'all' ? selectedSerie : undefined,
          turma: selectedTurma !== 'all' ? selectedTurma : undefined,
          nome: alunoSearchDebounced || undefined,
          page,
          per_page: ALUNOS_PER_PAGE,
          report_entity_type: reportEntityType,
        });
        const next = data.alunos ?? [];
        setAlunos((prev) => (append ? [...prev, ...next.filter((a) => !prev.some((p) => p.id === a.id))] : next));
        if (data.alunos_paginacao) setAlunosPaginacao(data.alunos_paginacao);
      } catch {
        if (!append) setAlunos([]);
      } finally {
        setLoadingAlunos(false);
      }
    },
    [
      selectedEstado,
      selectedMunicipio,
      selectedAvaliacao,
      selectedEscola,
      selectedSerie,
      selectedTurma,
      alunoSearchDebounced,
      reportEntityType,
    ]
  );

  useEffect(() => {
    void fetchAlunos(1, false);
  }, [fetchAlunos]);

  const resetAluno = useCallback(() => {
    setSelectedAluno('all');
    setSelectedAlunoMeta(null);
    setAlunoSearch('');
    setAlunoSearchDebounced('');
  }, []);

  const handleEstadoChange = useCallback(
    (value: string) => {
      setSelectedEstado(value);
      setSelectedMunicipio('all');
      setSelectedAvaliacao('all');
      setSelectedEscola(lockedSchoolId ?? 'all');
      setSelectedSerie('all');
      setSelectedTurma('all');
      resetAluno();
      setReport(null);
    },
    [lockedSchoolId, resetAluno]
  );

  const handleMunicipioChange = useCallback(
    (value: string) => {
      setSelectedMunicipio(value);
      setSelectedAvaliacao('all');
      setSelectedEscola(lockedSchoolId ?? 'all');
      setSelectedSerie('all');
      setSelectedTurma('all');
      resetAluno();
      setReport(null);
    },
    [lockedSchoolId, resetAluno]
  );

  const handleAvaliacaoChange = useCallback(
    (value: string) => {
      setSelectedAvaliacao(value);
      setSelectedEscola(lockedSchoolId ?? 'all');
      setSelectedSerie('all');
      setSelectedTurma('all');
      resetAluno();
      setReport(null);
    },
    [lockedSchoolId, resetAluno]
  );

  const handleEscolaChange = useCallback(
    (value: string) => {
      setSelectedEscola(lockedSchoolId ?? value);
      setSelectedSerie('all');
      setSelectedTurma('all');
      resetAluno();
      setReport(null);
    },
    [lockedSchoolId, resetAluno]
  );

  const handleSerieChange = useCallback(
    (value: string) => {
      setSelectedSerie(value);
      setSelectedTurma('all');
      resetAluno();
      setReport(null);
    },
    [resetAluno]
  );

  const handleTurmaChange = useCallback(
    (value: string) => {
      setSelectedTurma(value);
      resetAluno();
      setReport(null);
    },
    [resetAluno]
  );

  const buildResumoParams = useCallback(
    (page = 1) => ({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      avaliacao: selectedAvaliacao,
      aluno: selectedAluno !== 'all' ? selectedAluno : undefined,
      escola: selectedEscola !== 'all' ? selectedEscola : undefined,
      serie: selectedSerie !== 'all' ? selectedSerie : undefined,
      turma: selectedTurma !== 'all' ? selectedTurma : undefined,
      page: selectedAluno === 'all' ? page : 1,
      per_page: RESUMO_PER_PAGE,
      report_entity_type: reportEntityType,
    }),
    [
      selectedEstado,
      selectedMunicipio,
      selectedAvaliacao,
      selectedAluno,
      selectedEscola,
      selectedSerie,
      selectedTurma,
      reportEntityType,
    ]
  );

  const validateAccess = useCallback(() => {
    if (!userHierarchyContext || !user?.role) return true;
    const validation = validateReportAccess(
      user.role,
      {
        state: selectedEstado,
        municipality: selectedMunicipio,
        school:
          selectedEscola !== 'all'
            ? selectedEscola
            : roleRequiresSpecificSchool
              ? userHierarchyContext.school?.id
              : undefined,
        class: selectedTurma !== 'all' ? selectedTurma : undefined,
      },
      userHierarchyContext
    );
    if (!validation.isValid) {
      toast({
        title: 'Acesso negado',
        description: validation.reason || 'Você não tem permissão para gerar este relatório.',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  }, [
    userHierarchyContext,
    user?.role,
    selectedEstado,
    selectedMunicipio,
    selectedEscola,
    selectedTurma,
    roleRequiresSpecificSchool,
    toast,
  ]);

  const loadResumo = useCallback(
    async (page: number) => {
      if (!canGenerate || !validateAccess()) return;
      try {
        setGenerating(true);
        const data = await BoletimAlunoApiService.getResumo(buildResumoParams(page));
        setReport(data);
        setResultPage(data.paginacao.page || page);
        if (!data.boletins.length) {
          toast({
            title: 'Relatório gerado',
            description: 'Não há boletins no escopo selecionado.',
          });
        }
      } catch (error) {
        setReport(null);
        toast({
          title: 'Erro ao gerar relatório',
          description: getBoletimAlunoApiErrorMessage(
            error,
            'Não foi possível gerar o boletim. Tente novamente.'
          ),
          variant: 'destructive',
        });
      } finally {
        setGenerating(false);
      }
    },
    [canGenerate, validateAccess, buildResumoParams, toast]
  );

  const handleGenerate = () => {
    void loadResumo(1);
  };

  const handleDownloadPdf = async () => {
    if (!report || !validateAccess()) return;
    try {
      setGeneratingPdf(true);
      let boletins = report.boletins;
      const pages = report.paginacao.total_pages || 1;
      if (selectedAluno === 'all' && pages > 1) {
        const collected = [...report.boletins];
        const maxPages = Math.min(pages, 30);
        for (let page = 2; page <= maxPages; page++) {
          const next = await BoletimAlunoApiService.getResumo(buildResumoParams(page));
          collected.push(...next.boletins);
        }
        boletins = collected;
      }

      await generateBoletimAlunoPdf({
        boletins,
        avaliacaoNome: report.avaliacao.nome,
        labels: {
          estado: estados.find((s) => s.id === selectedEstado)?.nome || selectedEstado,
          municipio: municipios.find((m) => m.id === selectedMunicipio)?.nome || selectedMunicipio,
          avaliacao: report.avaliacao.nome,
          escola: escolas.find((e) => e.id === selectedEscola)?.nome,
          serie: series.find((s) => s.id === selectedSerie)?.nome,
          turma: turmas.find((t) => t.id === selectedTurma)?.label || turmas.find((t) => t.id === selectedTurma)?.nome,
          aluno: alunoDisplayLabel,
        },
        cityId: selectedMunicipio !== 'all' ? selectedMunicipio : null,
        flow,
      });
      toast({
        title: 'Relatório baixado',
        description: 'O PDF do Boletim do aluno foi salvo no seu dispositivo.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao gerar PDF',
        description: getBoletimAlunoApiErrorMessage(error, 'Não foi possível gerar o PDF.'),
        variant: 'destructive',
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const isLoadingFilters =
    isLoadingHierarchy ||
    loadingEstados ||
    loadingMunicipios ||
    loadingAvaliacoes ||
    loadingEscolas ||
    loadingSeries ||
    loadingTurmas;

  const hasMoreAlunos = alunosPaginacao.page < alunosPaginacao.total_pages;
  const resultPages = report?.paginacao.total_pages || 1;

  return (
    <div className="space-y-6">
      {!hidePageHeading && (
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Boletim do aluno</h1>
          <p className="text-muted-foreground">
            Marcações, gabarito e indicadores do aluno na avaliação selecionada.
          </p>
          {user?.role && (
            <p className="text-sm text-blue-600 dark:text-blue-400">{getRestrictionMessage(user.role)}</p>
          )}
        </header>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
          <CardDescription>
            Estado, município e {instrumentSingular} são obrigatórios. Aluno pode ser um específico ou
            todos os que realizaram a prova.
          </CardDescription>
          {hidePageHeading && user?.role && (
            <p className="text-sm text-blue-600 dark:text-blue-400">{getRestrictionMessage(user.role)}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <Select value={selectedEstado} onValueChange={handleEstadoChange} disabled={loadingEstados}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Selecione…</SelectItem>
                  {estados.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Município</label>
              <Select
                value={selectedMunicipio}
                onValueChange={handleMunicipioChange}
                disabled={selectedEstado === 'all' || loadingMunicipios}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o município" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Selecione…</SelectItem>
                  {municipios.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <InstrumentPickerField
              label={instrumentLabel}
              value={selectedAvaliacao}
              onChange={handleAvaliacaoChange}
              items={avaliacaoPickerItems}
              disabled={selectedMunicipio === 'all'}
              loading={loadingAvaliacoes}
              placeholder={
                selectedMunicipio === 'all'
                  ? 'Selecione o município primeiro'
                  : `Selecione o ${instrumentSingular}`
              }
              modalTitle={`Selecionar ${instrumentSingular}`}
              emptyMessage={`Nenhum ${instrumentSingular} encontrado para os filtros.`}
              contextLines={pickerContextLines}
              contextRequiredMessage="Selecione estado e município nos filtros antes de escolher."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Escola</label>
              <Select
                value={selectedEscola}
                onValueChange={handleEscolaChange}
                disabled={selectedAvaliacao === 'all' || loadingEscolas || roleRequiresSpecificSchool}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as escolas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as escolas</SelectItem>
                  {escolas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Série</label>
              <Select
                value={selectedSerie}
                onValueChange={handleSerieChange}
                disabled={selectedAvaliacao === 'all' || loadingSeries}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as séries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as séries</SelectItem>
                  {series.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Turma</label>
              <Select
                value={selectedTurma}
                onValueChange={handleTurmaChange}
                disabled={selectedSerie === 'all' || loadingTurmas}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as turmas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as turmas</SelectItem>
                  {turmas.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label || t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Aluno</label>
              <Popover open={alunoPickerOpen} onOpenChange={setAlunoPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={selectedAvaliacao === 'all'}
                    className="w-full justify-between font-normal h-10"
                  >
                    <span className="truncate text-left flex-1">{alunoDisplayLabel}</span>
                    {loadingAlunos ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-50" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar aluno..."
                      value={alunoSearch}
                      onValueChange={setAlunoSearch}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {loadingAlunos ? 'Carregando…' : 'Nenhum aluno encontrado.'}
                      </CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="all"
                          onSelect={() => {
                            setSelectedAluno('all');
                            setSelectedAlunoMeta(null);
                            setAlunoPickerOpen(false);
                            setReport(null);
                          }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', selectedAluno === 'all' ? 'opacity-100' : 'opacity-0')} />
                          Todos os alunos
                        </CommandItem>
                        {alunos.map((aluno) => (
                          <CommandItem
                            key={aluno.id}
                            value={aluno.id}
                            onSelect={() => {
                              setSelectedAluno(aluno.id);
                              setSelectedAlunoMeta(aluno);
                              setAlunoPickerOpen(false);
                              setReport(null);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                selectedAluno === aluno.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <span className="min-w-0">
                              <span className="block truncate">{aluno.nome}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {[aluno.serie, aluno.turma, aluno.escola].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                    {hasMoreAlunos && (
                      <div className="border-t p-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          disabled={loadingAlunos}
                          onClick={() => void fetchAlunos(alunosPaginacao.page + 1, true)}
                        >
                          {loadingAlunos ? 'Carregando…' : 'Carregar mais'}
                        </Button>
                      </div>
                    )}
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button onClick={handleGenerate} disabled={!canGenerate || generating || isLoadingFilters}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Gerando boletim…
                </>
              ) : (
                <>
                  <UserRound className="h-4 w-4 mr-2" />
                  Gerar boletim
                </>
              )}
            </Button>
            {report && (
              <Button variant="outline" onClick={() => setReport(null)} disabled={generating}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Limpar resultado
              </Button>
            )}
          </div>

          {!canGenerate && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Selecione estado, município e {instrumentSingular} para gerar o boletim.
            </p>
          )}
        </CardContent>
      </Card>

      {generating && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Carregando boletim do aluno…</p>
          </CardContent>
        </Card>
      )}

      {report && !generating && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{report.avaliacao.nome}</h2>
              <p className="text-sm text-muted-foreground">
                {selectedAluno === 'all'
                  ? `${formatNumber(report.paginacao.total)} aluno(s) no recorte`
                  : alunoDisplayLabel}
              </p>
            </div>
            <Button onClick={() => void handleDownloadPdf()} disabled={generatingPdf || !report.boletins.length}>
              {generatingPdf ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Gerando PDF…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Baixar PDF
                </>
              )}
            </Button>
          </div>

          <div className="space-y-8">
            {report.boletins.map((item) => (
              <BoletimCard
                key={item.aluno.id}
                item={item}
                avaliacaoNome={report.avaliacao.nome}
              />
            ))}
          </div>

          {selectedAluno === 'all' && resultPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={resultPage <= 1 || generating}
                onClick={() => void loadResumo(resultPage - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                Página {resultPage} de {resultPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={resultPage >= resultPages || generating}
                onClick={() => void loadResumo(resultPage + 1)}
              >
                Próxima
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
