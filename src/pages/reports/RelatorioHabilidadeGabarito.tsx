import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BookMarked,
  BookOpen,
  Download,
  Filter,
  Loader2,
  RefreshCw,
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
import { RelatorioConsolidadoItensPicker } from '@/components/reports/relatorio-geral/RelatorioConsolidadoItensPicker';
import type { RelatorioConsolidadoItemOption } from '@/components/reports/relatorio-geral/RelatorioConsolidadoItensModal';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';
import {
  getRestrictionMessage,
  getUserHierarchyContext,
  validateReportAccess,
  type UserHierarchyContext,
} from '@/utils/userHierarchy';
import { cn } from '@/lib/utils';
import {
  getHabilidadeGabaritoApiErrorMessage,
  HabilidadeGabaritoApiService,
  reportEntityTypeForFlow,
} from '@/services/reports/habilidadeGabaritoApi';
import { generateHabilidadeGabaritoPdf } from '@/services/reports/habilidadeGabaritoPdf';
import type {
  HabilidadeGabaritoFilterEntity,
  HabilidadeGabaritoFilterTurma,
  HabilidadeGabaritoReportFlow,
  HabilidadeGabaritoResumo,
} from '@/types/habilidade-gabarito';

function uniqueSorted(values: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    names.push(text);
  }
  return names.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
}

/** Um item selecionado, os ids devolvidos no escopo ou o catálogo inteiro quando o filtro é "todas". */
function resolveScopeNames(
  selectedId: string,
  catalog: Array<{ id: string; nome: string }>,
  escopoIds?: string[]
): string[] {
  if (selectedId !== 'all') {
    const found = catalog.find((item) => item.id === selectedId);
    return [found?.nome.trim() || selectedId];
  }
  const ids = (escopoIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (ids.length > 0) {
    return uniqueSorted(ids.map((id) => catalog.find((item) => item.id === id)?.nome.trim() || id));
  }
  return uniqueSorted(catalog.map((item) => item.nome));
}

type FilterOption = HabilidadeGabaritoFilterEntity;

function isMissingSkill(code: string): boolean {
  const text = code.trim();
  return !text || text.toUpperCase() === 'N/A';
}

function formatGabarito(value: string): string {
  const text = value.trim();
  if (!text) return '';
  return /^[a-e]$/i.test(text) ? text.toUpperCase() : text;
}

function SkillCode({ code }: { code: string }) {
  if (isMissingSkill(code)) {
    return <span className="text-sm text-muted-foreground">N/A</span>;
  }
  return (
    <span className="inline-flex rounded-md border border-primary/15 bg-primary/5 px-2 py-0.5 font-mono text-xs text-foreground">
      {code.trim()}
    </span>
  );
}

function GabaritoMark({ value }: { value: string }) {
  const letter = formatGabarito(value);
  if (!letter) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-emerald-500 px-2.5 text-sm font-bold text-white shadow-sm ring-2 ring-emerald-300/80 dark:bg-emerald-600 dark:ring-emerald-400/50">
      {letter}
    </span>
  );
}

type RelatorioHabilidadeGabaritoProps = {
  flow?: HabilidadeGabaritoReportFlow;
  hidePageHeading?: boolean;
};

export default function RelatorioHabilidadeGabarito({
  flow = 'digital',
  hidePageHeading = false,
}: RelatorioHabilidadeGabaritoProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const isCartao = flow === 'cartao';
  const instrumentPlural = isCartao ? 'cartões-resposta' : 'avaliações';
  const reportEntityType = reportEntityTypeForFlow(flow);

  const normalizedRole = (user?.role ?? '').toLowerCase();
  const roleRequiresSpecificSchool = ['diretor', 'coordenador', 'professor'].includes(normalizedRole);

  const [userHierarchyContext, setUserHierarchyContext] = useState<UserHierarchyContext | null>(null);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(true);

  const [estados, setEstados] = useState<FilterOption[]>([]);
  const [municipios, setMunicipios] = useState<FilterOption[]>([]);
  const [avaliacoesOpcoes, setAvaliacoesOpcoes] = useState<RelatorioConsolidadoItemOption[]>([]);
  const [escolas, setEscolas] = useState<FilterOption[]>([]);
  const [series, setSeries] = useState<FilterOption[]>([]);
  const [turmas, setTurmas] = useState<HabilidadeGabaritoFilterTurma[]>([]);

  const [selectedEstado, setSelectedEstado] = useState('all');
  const [selectedMunicipio, setSelectedMunicipio] = useState('all');
  const [selectedAvaliacoes, setSelectedAvaliacoes] = useState<string[]>([]);
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

  const [report, setReport] = useState<HabilidadeGabaritoResumo | null>(null);

  const canGenerate =
    selectedEstado !== 'all' && selectedMunicipio !== 'all' && selectedAvaliacoes.length > 0;

  const lockedSchoolId = roleRequiresSpecificSchool ? userHierarchyContext?.school?.id : undefined;

  const avaliacoesKey = selectedAvaliacoes.join(',');

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
            const opcoes = await HabilidadeGabaritoApiService.getOpcoesFiltros({
              report_entity_type: reportEntityType,
            });
            const matched = opcoes.estados.find(
              (s) =>
                s.id === context.municipality!.state ||
                s.nome.toLowerCase() === context.municipality!.state?.toLowerCase()
            );
            if (matched) setSelectedEstado(matched.id);
          } catch {
            // O carregamento de estados trata o erro.
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
    HabilidadeGabaritoApiService.getOpcoesFiltros({ report_entity_type: reportEntityType })
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
    HabilidadeGabaritoApiService.getOpcoesFiltros({
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
    HabilidadeGabaritoApiService.getOpcoesFiltros({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      report_entity_type: reportEntityType,
    })
      .then((data) => {
        if (cancelled) return;
        setAvaliacoesOpcoes(
          (data.avaliacoes ?? []).map((item) => ({
            id: item.id,
            titulo: item.titulo,
            disciplinas: item.disciplinas,
          }))
        );
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
    if (selectedEstado === 'all' || selectedMunicipio === 'all' || selectedAvaliacoes.length === 0) {
      setEscolas([]);
      return;
    }
    let cancelled = false;
    setLoadingEscolas(true);
    HabilidadeGabaritoApiService.getOpcoesDoRecorte({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      avaliacoes: selectedAvaliacoes,
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
    avaliacoesKey,
    selectedAvaliacoes,
    reportEntityType,
    lockedSchoolId,
  ]);

  useEffect(() => {
    if (selectedEstado === 'all' || selectedMunicipio === 'all' || selectedAvaliacoes.length === 0) {
      setSeries([]);
      return;
    }
    let cancelled = false;
    setLoadingSeries(true);
    HabilidadeGabaritoApiService.getOpcoesDoRecorte({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      avaliacoes: selectedAvaliacoes,
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
  }, [
    selectedEstado,
    selectedMunicipio,
    avaliacoesKey,
    selectedAvaliacoes,
    selectedEscola,
    reportEntityType,
  ]);

  useEffect(() => {
    if (
      selectedEstado === 'all' ||
      selectedMunicipio === 'all' ||
      selectedAvaliacoes.length === 0 ||
      selectedSerie === 'all'
    ) {
      setTurmas([]);
      return;
    }
    let cancelled = false;
    setLoadingTurmas(true);
    HabilidadeGabaritoApiService.getOpcoesDoRecorte({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      avaliacoes: selectedAvaliacoes,
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
    avaliacoesKey,
    selectedAvaliacoes,
    selectedEscola,
    selectedSerie,
    reportEntityType,
  ]);

  const handleEstadoChange = useCallback(
    (value: string) => {
      setSelectedEstado(value);
      setSelectedMunicipio('all');
      setSelectedAvaliacoes([]);
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
      setSelectedAvaliacoes([]);
      setSelectedEscola(lockedSchoolId ?? 'all');
      setSelectedSerie('all');
      setSelectedTurma('all');
      setReport(null);
    },
    [lockedSchoolId]
  );

  const handleAvaliacoesChange = useCallback(
    (ids: string[]) => {
      setSelectedAvaliacoes(ids);
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

  const filterLabels = useMemo(() => {
    const avaliacaoNomes = selectedAvaliacoes
      .map((id) => avaliacoesOpcoes.find((item) => item.id === id)?.titulo || id)
      .filter(Boolean);
    return {
      estado:
        selectedEstado !== 'all'
          ? estados.find((s) => s.id === selectedEstado)?.nome || selectedEstado
          : '',
      municipio:
        selectedMunicipio !== 'all'
          ? municipios.find((m) => m.id === selectedMunicipio)?.nome || selectedMunicipio
          : '',
      avaliacoes: avaliacaoNomes.join(', '),
      escola:
        selectedEscola !== 'all'
          ? escolas.find((e) => e.id === selectedEscola)?.nome || selectedEscola
          : 'Todas',
      serie:
        selectedSerie !== 'all'
          ? series.find((s) => s.id === selectedSerie)?.nome || selectedSerie
          : 'Todas',
      turma:
        selectedTurma !== 'all'
          ? turmas.find((t) => t.id === selectedTurma)?.label ||
            turmas.find((t) => t.id === selectedTurma)?.nome ||
            selectedTurma
          : 'Todas',
      tipo: isCartao ? 'Cartão-resposta' : 'Avaliação online',
    };
  }, [
    selectedAvaliacoes,
    avaliacoesOpcoes,
    selectedEstado,
    estados,
    selectedMunicipio,
    municipios,
    selectedEscola,
    escolas,
    selectedSerie,
    series,
    selectedTurma,
    turmas,
    isCartao,
  ]);

  const omittedAvaliacoes = useMemo(() => {
    if (!report) return [];
    const returned = new Set(report.avaliacoes.map((item) => item.id));
    const matched = selectedAvaliacoes.filter((id) => returned.has(id));
    // Se nenhum id selecionado aparece nos blocos, o recorte pode usar outro identificador
    // (por exemplo, o id do gabarito). Não marcar tudo como fora do recorte nesse caso.
    if (report.avaliacoes.length > 0 && matched.length === 0) return [];
    return selectedAvaliacoes
      .filter((id) => !returned.has(id))
      .map((id) => avaliacoesOpcoes.find((item) => item.id === id)?.titulo || id);
  }, [report, selectedAvaliacoes, avaliacoesOpcoes]);

  const totalQuestoes = useMemo(
    () => (report?.avaliacoes ?? []).reduce((sum, bloco) => sum + bloco.questoes.length, 0),
    [report]
  );

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
      const data = await HabilidadeGabaritoApiService.getResumo({
        estado: selectedEstado,
        municipio: selectedMunicipio,
        avaliacoes: selectedAvaliacoes,
        escola: selectedEscola !== 'all' ? selectedEscola : undefined,
        serie: selectedSerie !== 'all' ? selectedSerie : undefined,
        turma: selectedTurma !== 'all' ? selectedTurma : undefined,
        report_entity_type: reportEntityType,
      });
      setReport(data);
      if (!data.avaliacoes.length) {
        toast({
          title: 'Relatório gerado',
          description: 'Nenhuma das avaliações selecionadas foi aplicada neste recorte.',
        });
      }
    } catch (error) {
      toast({
        title: 'Erro ao gerar relatório',
        description: getHabilidadeGabaritoApiErrorMessage(
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
      const escolaCatalog = escolas.map((item) => ({ id: item.id, nome: item.nome }));
      const serieCatalog = series.map((item) => ({ id: item.id, nome: item.nome }));
      const turmaCatalog = turmas.map((item) => ({ id: item.id, nome: item.label || item.nome }));
      const escolasEscopo = resolveScopeNames(selectedEscola, escolaCatalog, report.escopo?.escolas);
      const seriesEscopo = resolveScopeNames(selectedSerie, serieCatalog, report.escopo?.series);
      let turmasEscopo = resolveScopeNames(selectedTurma, turmaCatalog, report.escopo?.turmas);

      if (selectedTurma === 'all' && selectedSerie === 'all' && series.length > 0) {
        const settled = await Promise.allSettled(
          series.map(async (serie) => {
            const data = await HabilidadeGabaritoApiService.getOpcoesDoRecorte({
              estado: selectedEstado,
              municipio: selectedMunicipio,
              avaliacoes: selectedAvaliacoes,
              escola: selectedEscola !== 'all' ? selectedEscola : undefined,
              serie: serie.id,
              report_entity_type: reportEntityType,
            });
            return (data.turmas ?? []).map((turma) => {
              const nome = (turma.label || turma.nome).trim();
              return nome ? `${serie.nome} — ${nome}` : '';
            });
          })
        );
        const failed = settled.filter((item) => item.status === 'rejected');
        if (failed.length === settled.length) {
          throw failed[0].status === 'rejected' ? failed[0].reason : new Error('Não foi possível listar as turmas.');
        }
        turmasEscopo = uniqueSorted(
          settled.flatMap((item) => (item.status === 'fulfilled' ? item.value : []))
        );
      }

      await generateHabilidadeGabaritoPdf({
        report,
        scope: {
          estado: filterLabels.estado,
          municipio: filterLabels.municipio,
          tipo: filterLabels.tipo,
          avaliacoes: report.avaliacoes.map((item) => item.titulo).filter(Boolean),
          escolas: escolasEscopo,
          series: seriesEscopo,
          turmas: turmasEscopo,
          omitidas: omittedAvaliacoes,
        },
      });
      toast({
        title: 'Relatório baixado',
        description: 'O PDF de habilidade e gabarito foi salvo no seu dispositivo.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao gerar PDF',
        description: getHabilidadeGabaritoApiErrorMessage(error, 'Não foi possível gerar o PDF.'),
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

  return (
    <div className="space-y-6">
      {!hidePageHeading && (
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookMarked className="h-7 w-7 text-primary" aria-hidden />
            Relatório de habilidade e gabarito
          </h1>
          <p className="text-muted-foreground">
            Habilidade e gabarito de cada questão, em blocos separados por avaliação.
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
            Estado, município e ao menos um {isCartao ? 'cartão-resposta' : 'avaliação'} são
            obrigatórios. Escola, série e turma são opcionais: vazio significa todas.
          </CardDescription>
          {hidePageHeading && user?.role && (
            <p className="text-sm text-blue-600 dark:text-blue-400">{getRestrictionMessage(user.role)}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>

          <RelatorioConsolidadoItensPicker
            label={isCartao ? 'Cartões-resposta' : 'Avaliações'}
            items={avaliacoesOpcoes}
            selected={selectedAvaliacoes}
            onChange={handleAvaliacoesChange}
            disabled={selectedMunicipio === 'all'}
            loading={loadingAvaliacoes}
            placeholder={
              selectedMunicipio === 'all'
                ? 'Selecione o município primeiro'
                : `Selecione um ou mais ${instrumentPlural}`
            }
            modalTitle={isCartao ? 'Selecionar cartões-resposta' : 'Selecionar avaliações'}
            entityLabel={instrumentPlural}
            emptyMessage={`Nenhum ${isCartao ? 'cartão-resposta' : 'avaliação'} encontrado para os filtros.`}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Escola</label>
              <Select
                value={selectedEscola}
                onValueChange={handleEscolaChange}
                disabled={
                  selectedAvaliacoes.length === 0 || loadingEscolas || roleRequiresSpecificSchool
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
                disabled={selectedAvaliacoes.length === 0 || loadingSeries}
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
            <Button onClick={() => void handleGenerate()} disabled={!canGenerate || generating || isLoadingFilters}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Gerando relatório…
                </>
              ) : (
                <>
                  <BookMarked className="h-4 w-4 mr-2" />
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
              Selecione estado, município e ao menos um {isCartao ? 'cartão-resposta' : 'avaliação'}.
            </p>
          )}
        </CardContent>
      </Card>

      {generating && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Carregando habilidade e gabarito…</p>
          </CardContent>
        </Card>
      )}

      {report && !generating && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold tracking-tight">{report.nome}</h2>
              <p className="text-sm text-muted-foreground">
                {filterLabels.municipio}
                {filterLabels.estado ? ` · ${filterLabels.estado}` : ''}
                {' · '}
                {filterLabels.tipo}
                {' · Escola: '}
                {filterLabels.escola}
                {' · Série: '}
                {filterLabels.serie}
                {' · Turma: '}
                {filterLabels.turma}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">
                  {report.avaliacoes.length}{' '}
                  {report.avaliacoes.length === 1 ? 'avaliação' : 'avaliações'}
                </Badge>
                <Badge variant="secondary">{totalQuestoes} questões</Badge>
              </div>
            </div>
            <Button
              onClick={() => void handleDownloadPdf()}
              disabled={generatingPdf || report.avaliacoes.length === 0}
            >
              {generatingPdf ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Gerando PDF…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Baixar PDF do relatório
                </>
              )}
            </Button>
          </div>

          {omittedAvaliacoes.length > 0 && (
            <p className="text-sm text-muted-foreground flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Fora deste recorte:{' '}
                {omittedAvaliacoes.join(', ')}. Avaliação que não foi aplicada no recorte não entra
                no relatório.
              </span>
            </p>
          )}

          {report.avaliacoes.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Nenhuma das avaliações selecionadas foi aplicada neste recorte.
              </CardContent>
            </Card>
          ) : (
            report.avaliacoes.map((bloco) => {
              const semGabarito = bloco.questoes.filter((q) => !q.gabarito.trim()).length;
              const semHabilidade = bloco.questoes.filter((q) => isMissingSkill(q.habilidade)).length;
              return (
                <Card key={bloco.id} className="overflow-hidden border-primary/15">
                  <CardHeader className="pb-3 bg-gradient-to-r from-primary/8 via-primary/4 to-transparent">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                        <BookOpen className="h-4 w-4" />
                      </span>
                      {bloco.titulo}
                    </CardTitle>
                    <CardDescription>
                      {bloco.questoes.length
                        ? `${bloco.questoes.length} questão(ões)`
                        : 'Nenhuma questão neste bloco'}
                      {semHabilidade > 0 ? ` · ${semHabilidade} sem habilidade` : ''}
                      {semGabarito > 0 ? ` · ${semGabarito} sem gabarito` : ''}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {bloco.questoes.length ? (
                      <Table className="border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border [&_td]:py-2.5">
                        <TableHeader>
                          <TableRow className="bg-muted/60 hover:bg-muted/60">
                            <TableHead className="w-[88px] text-foreground/80">Questão</TableHead>
                            <TableHead className="w-[140px] text-foreground/80">Habilidade</TableHead>
                            <TableHead className="text-foreground/80">Descrição da habilidade</TableHead>
                            <TableHead className="w-[110px] text-center text-foreground/80">
                              Gabarito
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bloco.questoes.map((questao, index) => (
                            <TableRow
                              key={`${bloco.id}-${questao.numero}-${index}`}
                              className={cn(index % 2 === 1 && 'bg-muted/25')}
                            >
                              <TableCell>
                                <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-primary/10 px-2 text-sm font-semibold tabular-nums text-primary">
                                  Q{questao.numero}
                                </span>
                              </TableCell>
                              <TableCell>
                                <SkillCode code={questao.habilidade} />
                              </TableCell>
                              <TableCell className="text-sm leading-relaxed whitespace-pre-line">
                                {questao.descricao_habilidade.trim() ? (
                                  questao.descricao_habilidade
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <GabaritoMark value={questao.gabarito} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground px-6 py-8">
                        Não há questões para esta avaliação nos filtros selecionados.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
