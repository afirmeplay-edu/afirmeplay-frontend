import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  Download,
  Eye,
  Filter,
  ListChecks,
  Loader2,
  Percent,
  RefreshCw,
  Users,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { formatPercent1PtBr } from '@/utils/numberFormat';
import { cn } from '@/lib/utils';
import {
  getMapaQuestoesApiErrorMessage,
  MapaQuestoesApiService,
  reportEntityTypeForFlow,
} from '@/services/reports/mapaQuestoesApi';
import { generateMapaQuestoesPdf } from '@/services/reports/mapaQuestoesPdf';
import QuestionPreview from '@/components/evaluations/questions/QuestionPreview';
import type { Question } from '@/components/evaluations/types';
import type {
  MapaQuestoesFilterAvaliacao,
  MapaQuestoesFilterEntity,
  MapaQuestoesFilterTurma,
  MapaQuestoesMarcacao,
  MapaQuestoesQuestao,
  MapaQuestoesReportFlow,
  MapaQuestoesResumo,
} from '@/types/mapa-questoes';

type FilterOption = MapaQuestoesFilterEntity;

function collectQuestionIds(report: MapaQuestoesResumo | null): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const bloco of report?.por_disciplina ?? []) {
    for (const q of bloco.questoes ?? []) {
      const id = (q.question_id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR');
}

function taxaAcertosClass(percentual: number): string {
  if (percentual >= 80) return 'text-emerald-700 dark:text-emerald-400';
  if (percentual >= 60) return 'text-lime-700 dark:text-lime-400';
  if (percentual >= 30) return 'text-amber-700 dark:text-amber-400';
  return 'text-red-700 dark:text-red-400';
}

function taxaBarClass(percentual: number): string {
  if (percentual >= 80) return 'bg-emerald-500';
  if (percentual >= 60) return 'bg-lime-500';
  if (percentual >= 30) return 'bg-amber-500';
  return 'bg-red-500';
}

function completeMarcacoes(
  marcacoes: MapaQuestoesMarcacao[] | undefined,
  gabarito: string
): MapaQuestoesMarcacao[] {
  const byAlt = new Map<string, MapaQuestoesMarcacao>();
  for (const item of marcacoes ?? []) {
    if (item.alternativa === 'sem_resposta') continue;
    byAlt.set(item.alternativa.toUpperCase(), item);
  }

  const lettersInData = [...byAlt.keys()].filter((key) => /^[A-E]$/.test(key));
  if (/^[A-E]$/i.test(gabarito)) {
    lettersInData.push(gabarito.toUpperCase());
  }

  const lastCode = Math.max(
    'D'.charCodeAt(0),
    ...lettersInData.map((letter) => letter.charCodeAt(0))
  );

  const completed: MapaQuestoesMarcacao[] = [];
  for (let code = 65; code <= lastCode && code <= 69; code++) {
    const alt = String.fromCharCode(code);
    completed.push(byAlt.get(alt) ?? { alternativa: alt, alunos: 0, percentual: 0 });
  }
  return completed;
}

function getSemResposta(marcacoes: MapaQuestoesMarcacao[] | undefined): MapaQuestoesMarcacao {
  const found = (marcacoes ?? []).find((item) => item.alternativa === 'sem_resposta');
  return found ?? { alternativa: 'sem_resposta', alunos: 0, percentual: 0 };
}

function MarcacoesCell({
  marcacoes,
  gabarito,
}: {
  marcacoes: MapaQuestoesMarcacao[];
  gabarito: string;
}) {
  const items = completeMarcacoes(marcacoes, gabarito);

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((m) => {
        const isGabarito = m.alternativa.toUpperCase() === gabarito.toUpperCase();
        const isZero = m.alunos === 0 && m.percentual === 0;
        return (
          <div
            key={m.alternativa}
            title={`${m.alternativa}: ${formatNumber(m.alunos)} aluno(s) · ${formatPercent1PtBr(m.percentual)}`}
            className={cn(
              'min-w-[3.75rem] rounded-lg border px-2 py-1.5 text-center',
              isGabarito &&
                'border-emerald-400/70 bg-emerald-500 text-white shadow-sm dark:border-emerald-500 dark:bg-emerald-600',
              !isGabarito && isZero && 'border-border/70 bg-muted/30 text-muted-foreground',
              !isGabarito && !isZero && 'border-primary/20 bg-primary/5 text-foreground'
            )}
          >
            <p className={cn('text-[10px] font-semibold leading-none', isGabarito ? 'text-white/90' : 'text-muted-foreground')}>
              {m.alternativa.toUpperCase()}
            </p>
            <p className="mt-0.5 text-xs font-semibold tabular-nums leading-tight">
              {formatPercent1PtBr(m.percentual)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

type RelatorioMapaQuestoesProps = {
  flow?: MapaQuestoesReportFlow;
  hidePageHeading?: boolean;
};

export default function RelatorioMapaQuestoes({
  flow = 'digital',
  hidePageHeading = false,
}: RelatorioMapaQuestoesProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const isCartao = flow === 'cartao';
  const instrumentLabel = isCartao ? 'Cartão-resposta' : 'Avaliação';
  const instrumentSingular = isCartao ? 'cartão-resposta' : 'avaliação';
  const reportEntityType = reportEntityTypeForFlow(flow);

  const normalizedRole = (user?.role ?? '').toLowerCase();
  const roleRequiresSpecificSchool = ['diretor', 'coordenador', 'professor'].includes(normalizedRole);

  const [userHierarchyContext, setUserHierarchyContext] = useState<UserHierarchyContext | null>(null);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(true);

  const [estados, setEstados] = useState<FilterOption[]>([]);
  const [municipios, setMunicipios] = useState<FilterOption[]>([]);
  const [avaliacoesOpcoes, setAvaliacoesOpcoes] = useState<MapaQuestoesFilterAvaliacao[]>([]);
  const [escolas, setEscolas] = useState<FilterOption[]>([]);
  const [series, setSeries] = useState<FilterOption[]>([]);
  const [turmas, setTurmas] = useState<MapaQuestoesFilterTurma[]>([]);

  const [selectedEstado, setSelectedEstado] = useState('all');
  const [selectedMunicipio, setSelectedMunicipio] = useState('all');
  const [selectedAvaliacao, setSelectedAvaliacao] = useState('all');
  const [selectedEscola, setSelectedEscola] = useState('all');
  const [selectedSerie, setSelectedSerie] = useState('all');
  const [selectedTurma, setSelectedTurma] = useState('all');

  const [loadingEstados, setLoadingEstados] = useState(false);
  const [loadingMunicipios, setLoadingMunicipios] = useState(false);
  const [loadingAvaliacoes, setLoadingAvaliacoes] = useState(false);
  const [loadingEscolas, setLoadingEscolas] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingTurmas, setLoadingTurmas] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const [report, setReport] = useState<MapaQuestoesResumo | null>(null);
  const [questionById, setQuestionById] = useState<Map<string, Question>>(new Map());
  const [questionsBatchStatus, setQuestionsBatchStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewQuestionId, setPreviewQuestionId] = useState<string | null>(null);

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
            const opcoes = await MapaQuestoesApiService.getOpcoesFiltros({
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
    MapaQuestoesApiService.getOpcoesFiltros({ report_entity_type: reportEntityType })
      .then((data) => {
        if (cancelled) return;
        setEstados(data.estados ?? []);
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
    MapaQuestoesApiService.getOpcoesFiltros({
      estado: selectedEstado,
      report_entity_type: reportEntityType,
    })
      .then((data) => {
        if (cancelled) return;
        setMunicipios(data.municipios ?? []);
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
    MapaQuestoesApiService.getOpcoesFiltros({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      report_entity_type: reportEntityType,
    })
      .then((data) => {
        if (cancelled) return;
        setAvaliacoesOpcoes(data.avaliacoes ?? []);
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
    MapaQuestoesApiService.getOpcoesFiltros({
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
          if (lockedSchoolId && nextEscolas.some((e) => e.id === lockedSchoolId)) {
            return lockedSchoolId;
          }
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
  }, [
    selectedEstado,
    selectedMunicipio,
    selectedAvaliacao,
    reportEntityType,
    lockedSchoolId,
  ]);

  useEffect(() => {
    if (selectedEstado === 'all' || selectedMunicipio === 'all' || selectedAvaliacao === 'all') {
      setSeries([]);
      return;
    }
    let cancelled = false;
    setLoadingSeries(true);
    MapaQuestoesApiService.getOpcoesFiltros({
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
    MapaQuestoesApiService.getOpcoesFiltros({
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

  const handleEstadoChange = useCallback(
    (value: string) => {
      setSelectedEstado(value);
      setSelectedMunicipio('all');
      setSelectedAvaliacao('all');
      setSelectedEscola(lockedSchoolId ?? 'all');
      setSelectedSerie('all');
      setSelectedTurma('all');
      setReport(null);
    },
    [lockedSchoolId]
  );

  const handleMunicipioChange = useCallback(
    (value: string) => {
      setSelectedMunicipio(value);
      setSelectedAvaliacao('all');
      setSelectedEscola(lockedSchoolId ?? 'all');
      setSelectedSerie('all');
      setSelectedTurma('all');
      setReport(null);
    },
    [lockedSchoolId]
  );

  const handleAvaliacaoChange = useCallback(
    (value: string) => {
      setSelectedAvaliacao(value);
      setSelectedEscola(lockedSchoolId ?? 'all');
      setSelectedSerie('all');
      setSelectedTurma('all');
      setReport(null);
    },
    [lockedSchoolId]
  );

  const handleEscolaChange = useCallback(
    (value: string) => {
      setSelectedEscola(lockedSchoolId ?? value);
      setSelectedSerie('all');
      setSelectedTurma('all');
      setReport(null);
    },
    [lockedSchoolId]
  );

  const handleSerieChange = useCallback((value: string) => {
    setSelectedSerie(value);
    setSelectedTurma('all');
    setReport(null);
  }, []);

  const handleTurmaChange = useCallback((value: string) => {
    setSelectedTurma(value);
    setReport(null);
  }, []);

  const handleGenerate = async () => {
    if (!canGenerate) return;

    if (userHierarchyContext && user?.role) {
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
        return;
      }
    }

    try {
      setGenerating(true);
      const data = await MapaQuestoesApiService.getResumo({
        estado: selectedEstado,
        municipio: selectedMunicipio,
        avaliacao: selectedAvaliacao,
        escola: selectedEscola !== 'all' ? selectedEscola : undefined,
        serie: selectedSerie !== 'all' ? selectedSerie : undefined,
        turma: selectedTurma !== 'all' ? selectedTurma : undefined,
        report_entity_type: reportEntityType,
      });
      setReport(data);
      if (!data.por_disciplina?.some((d) => d.questoes?.length) && data.metricas.total_alunos_realizaram === 0) {
        toast({
          title: 'Relatório gerado',
          description: 'Não há respostas no escopo selecionado.',
        });
      }
    } catch (error) {
      toast({
        title: 'Erro ao gerar relatório',
        description: getMapaQuestoesApiErrorMessage(
          error,
          'Não foi possível gerar o relatório. Tente novamente.'
        ),
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!report) return;
    try {
      setGeneratingPdf(true);
      await generateMapaQuestoesPdf({
        report,
        labels: {
          estado:
            selectedEstado !== 'all'
              ? estados.find((s) => s.id === selectedEstado)?.nome || selectedEstado
              : '',
          municipio:
            selectedMunicipio !== 'all'
              ? municipios.find((m) => m.id === selectedMunicipio)?.nome || selectedMunicipio
              : '',
          avaliacao: report.avaliacao.nome,
          escola:
            selectedEscola !== 'all' ? escolas.find((e) => e.id === selectedEscola)?.nome : undefined,
          serie:
            selectedSerie !== 'all' ? series.find((s) => s.id === selectedSerie)?.nome : undefined,
          turma:
            selectedTurma !== 'all'
              ? turmas.find((t) => t.id === selectedTurma)?.label ||
                turmas.find((t) => t.id === selectedTurma)?.nome
              : undefined,
        },
        cityId: selectedMunicipio !== 'all' ? selectedMunicipio : null,
        flow,
      });
      toast({
        title: 'Relatório baixado',
        description: 'O PDF do Mapa de questões foi salvo no seu dispositivo.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao gerar PDF',
        description: getMapaQuestoesApiErrorMessage(error, 'Não foi possível gerar o PDF.'),
        variant: 'destructive',
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  useEffect(() => {
    if (!report || isCartao) {
      setQuestionById(new Map());
      setQuestionsBatchStatus('idle');
      setPreviewOpen(false);
      setPreviewQuestionId(null);
      return;
    }

    const ids = collectQuestionIds(report);
    if (!ids.length) {
      setQuestionById(new Map());
      setQuestionsBatchStatus('ready');
      return;
    }

    let cancelled = false;
    setQuestionsBatchStatus('loading');
    MapaQuestoesApiService.getQuestionsBatch(
      ids,
      selectedMunicipio !== 'all' ? selectedMunicipio : undefined
    )
      .then((byId) => {
        if (cancelled) return;
        setQuestionById(byId);
        setQuestionsBatchStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setQuestionById(new Map());
        setQuestionsBatchStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [report, isCartao, selectedMunicipio]);

  const openQuestionPreview = (questao: MapaQuestoesQuestao) => {
    const id = (questao.question_id || '').trim();
    setPreviewQuestionId(id || null);
    setPreviewOpen(true);
  };

  const previewQuestion = previewQuestionId ? questionById.get(previewQuestionId) : undefined;
  const previewUnavailable =
    previewOpen &&
    questionsBatchStatus !== 'loading' &&
    (!previewQuestionId || !previewQuestion);

  const isLoadingFilters =
    isLoadingHierarchy ||
    loadingEstados ||
    loadingMunicipios ||
    loadingAvaliacoes ||
    loadingEscolas ||
    loadingSeries ||
    loadingTurmas;

  const disciplinaNomes = report?.avaliacao.disciplinas?.map((d) => d.nome).filter(Boolean) ?? [];

  return (
    <div className="space-y-6">
      {!hidePageHeading && (
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Mapa de questões</h1>
          <p className="text-muted-foreground">
            Taxa de acertos e distribuição de marcações por questão, separados por disciplina.
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
            Estado, município e {instrumentSingular} são obrigatórios. Escola, série e turma são
            opcionais (Todas = agregado do escopo).
          </CardDescription>
          {hidePageHeading && user?.role && (
            <p className="text-sm text-blue-600 dark:text-blue-400">{getRestrictionMessage(user.role)}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <Select
                value={selectedEstado}
                onValueChange={handleEstadoChange}
                disabled={loadingEstados}
              >
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Escola</label>
              <Select
                value={selectedEscola}
                onValueChange={handleEscolaChange}
                disabled={
                  selectedAvaliacao === 'all' || loadingEscolas || roleRequiresSpecificSchool
                }
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
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button onClick={handleGenerate} disabled={!canGenerate || generating || isLoadingFilters}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Gerando relatório…
                </>
              ) : (
                <>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Gerar relatório
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
              Selecione estado, município e {instrumentSingular} para gerar o relatório.
            </p>
          )}
        </CardContent>
      </Card>

      {generating && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Carregando mapa de questões…</p>
          </CardContent>
        </Card>
      )}

      {report && !generating && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{report.avaliacao.nome}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {disciplinaNomes.length > 0 ? (
                  disciplinaNomes.map((nome) => (
                    <Badge key={nome} variant="secondary">
                      {nome}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">Sem disciplinas informadas</span>
                )}
              </div>
            </div>
            <Button
              onClick={() => void handleDownloadPdf()}
              disabled={generatingPdf || !report.por_disciplina?.some((d) => d.questoes?.length)}
            >
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Alunos que realizaram
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatNumber(report.metricas.total_alunos_realizaram)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  Média de acertos
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatPercent1PtBr(report.metricas.media_acertos_percentual)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />
                  Questões
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatNumber(report.metricas.total_questoes)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {(report.por_disciplina ?? []).map((bloco) => (
            <Card key={bloco.disciplina_id || bloco.disciplina} className="overflow-hidden border-primary/15">
              <CardHeader className="pb-3 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  {bloco.disciplina}
                </CardTitle>
                <CardDescription>
                  {bloco.questoes?.length
                    ? `${bloco.questoes.length} questão(ões)`
                    : 'Nenhuma questão nesta disciplina'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {bloco.questoes?.length ? (
                  <Table className="border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border">
                    <TableHeader>
                      <TableRow className="bg-muted/60 hover:bg-muted/60">
                        <TableHead className="w-[72px] text-foreground/80">Questão</TableHead>
                        <TableHead className="text-foreground/80">Disciplina</TableHead>
                        <TableHead className="text-foreground/80">Habilidade</TableHead>
                        <TableHead className="w-24 text-center text-foreground/80">Gabarito</TableHead>
                        <TableHead className="min-w-[160px] text-foreground/80">Taxa de acertos</TableHead>
                        <TableHead className="text-foreground/80">Marcações</TableHead>
                        <TableHead className="w-[120px] text-center text-foreground/80">Sem resposta</TableHead>
                        {!isCartao && (
                          <TableHead className="w-[140px] text-center text-foreground/80">Ver questão</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bloco.questoes.map((q, index) => {
                        const semResposta = getSemResposta(q.marcacoes);
                        const semRespostaZero = semResposta.alunos === 0 && semResposta.percentual === 0;
                        return (
                        <TableRow
                          key={`${bloco.disciplina_id}-${q.numero}`}
                          className={index % 2 === 1 ? 'bg-muted/25' : undefined}
                        >
                          <TableCell>
                            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-primary/10 px-2 text-sm font-semibold tabular-nums text-primary">
                              Q{q.numero}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {q.disciplina || bloco.disciplina}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex rounded-md border border-primary/15 bg-primary/5 px-2 py-0.5 font-mono text-xs text-foreground">
                              {q.habilidade || '—'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-emerald-500 px-2.5 text-sm font-bold text-white shadow-sm dark:bg-emerald-600">
                              {q.gabarito || '—'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="min-w-[140px] space-y-1.5">
                              <div className="flex items-baseline justify-between gap-2">
                                <span
                                  className={cn(
                                    'text-sm font-semibold tabular-nums',
                                    taxaAcertosClass(q.taxa_acertos.percentual)
                                  )}
                                >
                                  {formatPercent1PtBr(q.taxa_acertos.percentual)}
                                </span>
                                <span className="text-[11px] text-muted-foreground tabular-nums">
                                  {formatNumber(q.taxa_acertos.acertaram)} de{' '}
                                  {formatNumber(q.taxa_acertos.total)}
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn('h-full rounded-full', taxaBarClass(q.taxa_acertos.percentual))}
                                  style={{
                                    width: `${Math.min(100, Math.max(0, q.taxa_acertos.percentual))}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <MarcacoesCell marcacoes={q.marcacoes} gabarito={q.gabarito} />
                          </TableCell>
                          <TableCell className="text-center">
                            <div
                              title={`${formatNumber(semResposta.alunos)} aluno(s) · ${formatPercent1PtBr(semResposta.percentual)}`}
                              className={cn(
                                'inline-flex min-w-[4.5rem] flex-col items-center rounded-lg border px-2.5 py-1.5',
                                semRespostaZero
                                  ? 'border-border/70 bg-muted/30 text-muted-foreground'
                                  : 'border-border bg-muted/60 text-foreground'
                              )}
                            >
                              <span className="text-sm font-semibold tabular-nums leading-tight">
                                {formatPercent1PtBr(semResposta.percentual)}
                              </span>
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                {formatNumber(semResposta.alunos)}
                              </span>
                            </div>
                          </TableCell>
                          {!isCartao && (
                            <TableCell className="text-center">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={() => openQuestionPreview(q)}
                              >
                                <Eye className="h-3.5 w-3.5 mr-1.5" />
                                Ver questão
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground px-6 py-8">
                    Não há questões para esta disciplina no escopo selecionado.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPreviewQuestionId(null);
        }}
      >
        <DialogContent className="w-[95vw] max-w-4xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden p-0 sm:p-0">
          <DialogHeader className="shrink-0 px-4 pt-4 pb-2 sm:px-6 sm:pt-6 border-b border-border">
            <DialogTitle className="text-lg sm:text-xl">Visualizar questão</DialogTitle>
            <DialogDescription>
              Enunciado, alternativas e gabarito cadastrados no banco de questões.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-4 sm:px-6 sm:pb-6">
            {questionsBatchStatus === 'loading' ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-3" />
                <p>Carregando questão…</p>
              </div>
            ) : previewQuestion ? (
              <QuestionPreview key={previewQuestion.id} question={previewQuestion} />
            ) : previewUnavailable ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <AlertCircle className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">
                  Questão não disponível para visualização
                </p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  O enunciado desta questão não foi encontrado no banco (pode ter sido excluída
                  depois da prova).
                </p>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
