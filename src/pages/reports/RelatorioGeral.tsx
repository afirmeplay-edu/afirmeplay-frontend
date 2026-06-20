import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BarChart3,
  Filter,
  Layers,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { RelatorioConsolidadoItensPicker } from '@/components/reports/relatorio-geral/RelatorioConsolidadoItensPicker';
import type { RelatorioConsolidadoItemOption } from '@/components/reports/relatorio-geral/RelatorioConsolidadoItensModal';
import { RelatorioConsolidadoReportSections } from '@/components/reports/relatorio-geral/RelatorioConsolidadoReportSections';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';
import {
  getUserHierarchyContext,
  getRestrictionMessage,
  validateReportAccess,
  type UserHierarchyContext,
} from '@/utils/userHierarchy';
import {
  getApiErrorMessage,
  RelatorioConsolidadoApiService,
  type RelatorioConsolidadoFlow,
} from '@/services/reports/relatorioConsolidadoApi';
import { generateRelatorioConsolidadoPdf } from '@/services/reports/relatorioConsolidadoPdf';
import type { RelatorioConsolidado } from '@/types/relatorio-consolidado';
import { matrizHasLinhas } from '@/utils/reports/relatorioConsolidadoDisciplinas';

type FilterOption = { id: string; nome: string };

type RelatorioGeralProps = {
  flow: RelatorioConsolidadoFlow;
  hidePageHeading?: boolean;
};

export default function RelatorioGeral({ flow, hidePageHeading = false }: RelatorioGeralProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const isCartao = flow === 'cartao';
  const instrumentLabel = isCartao ? 'Cartões resposta' : 'Avaliações';
  const instrumentSingular = isCartao ? 'cartão resposta' : 'avaliação';

  const normalizedRole = (user?.role ?? '').toLowerCase();
  const roleRequiresSpecificSchool = ['diretor', 'coordenador', 'professor'].includes(normalizedRole);

  const [userHierarchyContext, setUserHierarchyContext] = useState<UserHierarchyContext | null>(null);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(true);

  const [estados, setEstados] = useState<FilterOption[]>([]);
  const [municipios, setMunicipios] = useState<FilterOption[]>([]);
  const [escolas, setEscolas] = useState<FilterOption[]>([]);
  const [itensOpcoes, setItensOpcoes] = useState<RelatorioConsolidadoItemOption[]>([]);

  const [selectedEstado, setSelectedEstado] = useState('all');
  const [selectedMunicipio, setSelectedMunicipio] = useState('all');
  const [selectedEscola, setSelectedEscola] = useState('all');
  const [selectedPeriodo, setSelectedPeriodo] = useState('');
  const [selectedItens, setSelectedItens] = useState<string[]>([]);
  const [tituloAvaliacao, setTituloAvaliacao] = useState('');
  const [periodoLabel, setPeriodoLabel] = useState<string | null>(null);

  const [loadingEstados, setLoadingEstados] = useState(false);
  const [loadingMunicipios, setLoadingMunicipios] = useState(false);
  const [loadingEscolas, setLoadingEscolas] = useState(false);
  const [loadingItens, setLoadingItens] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const [report, setReport] = useState<RelatorioConsolidado | null>(null);

  const canGenerate =
    selectedEstado !== 'all' &&
    selectedMunicipio !== 'all' &&
    selectedItens.length > 0 &&
    (!roleRequiresSpecificSchool || selectedEscola !== 'all') &&
    tituloAvaliacao.trim().length > 0;

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
            const opcoes = await RelatorioConsolidadoApiService.getOpcoesFiltros(flow);
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
        if (context.school) {
          setSelectedEscola(context.school.id);
        }
      } catch {
        toast({
          title: 'Aviso',
          description: 'Não foi possível carregar suas permissões. Algumas funcionalidades podem estar limitadas.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingHierarchy(false);
      }
    };
    void loadHierarchy();
  }, [user?.id, user?.role, flow, toast]);

  useEffect(() => {
    let cancelled = false;
    setLoadingEstados(true);
    RelatorioConsolidadoApiService.getOpcoesFiltros(flow)
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
  }, [flow]);

  useEffect(() => {
    if (selectedEstado === 'all') {
      setMunicipios([]);
      return;
    }
    let cancelled = false;
    setLoadingMunicipios(true);
    RelatorioConsolidadoApiService.getOpcoesFiltros(flow, { estado: selectedEstado })
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
  }, [flow, selectedEstado]);

  useEffect(() => {
    if (selectedEstado === 'all' || selectedMunicipio === 'all') {
      setEscolas([]);
      return;
    }
    let cancelled = false;
    setLoadingEscolas(true);
    RelatorioConsolidadoApiService.getOpcoesFiltros(flow, {
      estado: selectedEstado,
      municipio: selectedMunicipio,
    })
      .then((data) => {
        if (cancelled) return;
        setEscolas(data.escolas ?? []);
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
  }, [flow, selectedEstado, selectedMunicipio]);

  useEffect(() => {
    if (selectedEstado === 'all' || selectedMunicipio === 'all') {
      setItensOpcoes([]);
      setPeriodoLabel(null);
      return;
    }
    let cancelled = false;
    setLoadingItens(true);
    RelatorioConsolidadoApiService.getOpcoesFiltros(flow, {
      estado: selectedEstado,
      municipio: selectedMunicipio,
      escola: selectedEscola,
      periodo: selectedPeriodo || undefined,
    })
      .then((data) => {
        if (cancelled) return;
        
        setPeriodoLabel(
          (data as { periodo_label?: string }).periodo_label ?? null
        );

        const raw = isCartao
          ? (data as { gabaritos?: Array<{ id: string; titulo: string; disciplinas?: string[] }> }).gabaritos
          : (data as { avaliacoes?: Array<{ id: string; titulo: string; disciplinas?: string[]; disciplina?: string }> })
              .avaliacoes;

        const options: RelatorioConsolidadoItemOption[] = (raw ?? []).map((item) => ({
          id: item.id,
          titulo: item.titulo,
          disciplinas:
            item.disciplinas?.length
              ? item.disciplinas
              : 'disciplina' in item && item.disciplina
                ? [item.disciplina]
                : undefined,
        }));
        setItensOpcoes(options);
        setSelectedItens((prev) => prev.filter((id) => options.some((o) => o.id === id)));
      })
      .catch(() => {
        if (!cancelled) setItensOpcoes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingItens(false);
      });
    return () => {
      cancelled = true;
    };
  }, [flow, isCartao, selectedEstado, selectedMunicipio, selectedEscola, selectedPeriodo]);

  const handleEstadoChange = useCallback((value: string) => {
    setSelectedEstado(value);
    setSelectedMunicipio('all');
    setSelectedEscola('all');
    setSelectedPeriodo('');
    setPeriodoLabel(null);
    setSelectedItens([]);
    setReport(null);
  }, []);

  const handleMunicipioChange = useCallback((value: string) => {
    setSelectedMunicipio(value);
    setSelectedEscola('all');
    setSelectedPeriodo('');
    setPeriodoLabel(null);
    setSelectedItens([]);
    setReport(null);
  }, []);

  const handleEscolaChange = useCallback((value: string) => {
    setSelectedEscola(value);
    setSelectedItens([]);
    setReport(null);
  }, []);

  const handlePeriodoChange = useCallback((value: string) => {
    setSelectedPeriodo(value);
    setSelectedItens([]);
    setPeriodoLabel(null);
    setReport(null);
  }, []);

  const handleItensChange = useCallback((ids: string[]) => {
    setSelectedItens(ids);
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
          school: selectedEscola,
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
      const data = await RelatorioConsolidadoApiService.getRelatorio(flow, {
        municipio: selectedMunicipio,
        escola: selectedEscola,
        estado: selectedEstado,
        itemIds: selectedItens,
      });
      setReport(data);
      if (
        !data.series_aplicadas?.length &&
        !matrizHasLinhas(data.consolidado_frequencia?.GERAL)
      ) {
        toast({
          title: 'Relatório gerado',
          description: 'Não há dados de aplicação no escopo selecionado.',
        });
      }
    } catch (error) {
      toast({
        title: 'Erro ao gerar relatório',
        description: getApiErrorMessage(error, 'Não foi possível gerar o relatório. Tente novamente.'),
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const isLoadingFilters =
    isLoadingHierarchy || loadingEstados || loadingMunicipios || loadingEscolas || loadingItens;

  const escolaLabel = useMemo(() => {
    if (selectedEscola === 'all') return 'Todas as escolas';
    return escolas.find((e) => e.id === selectedEscola)?.nome ?? selectedEscola;
  }, [selectedEscola, escolas]);

  const pdfScopeLabel = useMemo(
    () => (selectedEscola === 'all' ? 'REDE' : escolaLabel),
    [selectedEscola, escolaLabel]
  );

  const handleDownloadPdf = async () => {
    if (!report) return;
    try {
      setGeneratingPdf(true);
      await generateRelatorioConsolidadoPdf({
        report,
        cityId: selectedMunicipio,
        scopeLabel: pdfScopeLabel,
        tituloAvaliacao,
      });
      toast({
        title: 'PDF gerado',
        description: 'Relatório PDF gerado com capa, sumário e todas as seções.',
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Erro ao gerar PDF',
        description: 'Não foi possível gerar o PDF. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-6 pb-8">
      {!hidePageHeading && (
        <header className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
            <Layers className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" aria-hidden />
            Relatório Geral
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-3xl">
            Consolide {instrumentLabel.toLowerCase()} do município em um único relatório.
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
            Selecione estado, município e escola. Em seguida, escolha os {instrumentLabel.toLowerCase()} desejados e clique em Gerar relatório.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Escola</label>
              <Select
                value={selectedEscola}
                onValueChange={handleEscolaChange}
                disabled={selectedMunicipio === 'all' || loadingEscolas}
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
              <label className="text-sm font-medium">
                Período (opcional)
              </label>
              <Input
                type="month"
                value={selectedPeriodo}
                onChange={(e) => handlePeriodoChange(e.target.value)}
                disabled={selectedMunicipio === 'all' || loadingItens}
                placeholder="Selecione mês/ano"
                className="h-10"
              />
              {periodoLabel && (
                <p className="text-xs text-muted-foreground">
                  {periodoLabel}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <RelatorioConsolidadoItensPicker
                label={instrumentLabel}
                items={itensOpcoes}
                selected={selectedItens}
                onChange={handleItensChange}
                disabled={selectedMunicipio === 'all'}
                loading={loadingItens}
                placeholder={
                  selectedMunicipio === 'all'
                    ? 'Selecione o município primeiro'
                    : `Selecione ${instrumentLabel.toLowerCase()}`
                }
                modalTitle={isCartao ? 'Selecionar cartões resposta' : 'Selecionar avaliações'}
                entityLabel={isCartao ? 'cartões' : 'avaliações'}
                emptyMessage={
                  isCartao
                    ? 'Nenhum cartão resposta encontrado para os filtros.'
                    : 'Nenhuma avaliação encontrada para os filtros.'
                }
              />
              {periodoLabel && selectedPeriodo && (
                <p className="text-xs text-muted-foreground mt-1">
                  Mostrando apenas {instrumentLabel.toLowerCase()} do período: {periodoLabel}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Título da Avaliação <span className="text-destructive">*</span>
            </label>
            <Input
              type="text"
              placeholder="Ex: Avaliação Diagnóstica do 1º Bimestre de 2026"
              value={tituloAvaliacao}
              onChange={(e) => setTituloAvaliacao(e.target.value)}
              disabled={generating}
              className="max-w-2xl"
            />
            <p className="text-xs text-muted-foreground">
              Este texto aparecerá na apresentação do relatório: "referente a {tituloAvaliacao || '[título]'}".
            </p>
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

          {!canGenerate && selectedMunicipio !== 'all' && (
            <div className="space-y-1.5">
              {selectedItens.length === 0 && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Selecione ao menos um {instrumentSingular} para gerar o relatório.
                </p>
              )}
              {tituloAvaliacao.trim().length === 0 && selectedItens.length > 0 && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Preencha o título da avaliação para gerar o relatório.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {generating && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Consolidando dados do relatório…</p>
          </CardContent>
        </Card>
      )}

      {report && !generating && (
        <Card>
          <CardContent className="pt-6">
            <RelatorioConsolidadoReportSections
              report={report}
              escolaNome={selectedEscola === 'all' ? undefined : escolaLabel}
              tituloAvaliacao={tituloAvaliacao}
              onDownloadPdf={handleDownloadPdf}
              generatingPdf={generatingPdf}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
