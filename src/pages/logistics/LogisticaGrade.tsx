import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Loader2,
  RotateCcw,
  School,
  Search,
  Settings2,
  Truck,
  UserRound,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { LogisticsApiService, getLogisticsApiErrorMessage } from '@/services/logisticsApi';
import {
  generateLogisticsGradePdf,
  type LogisticsPdfOrientation,
} from '@/services/reports/logisticsPdf';
import type {
  LogisticsGradeCards,
  LogisticsGradeItem,
  LogisticsGradeOptions,
  LogisticsScheduleStatus,
} from '@/types/logistics';

const PER_PAGE = 20;
const ALL = 'all';
const SEM_APLICADOR = 'sem_aplicador';

const STATUS_LABEL: Record<LogisticsScheduleStatus, string> = {
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  cancelado: 'Cancelado',
};

const FORMATO_LABEL: Record<string, string> = {
  virtual: 'Online',
  physical: 'Impressa',
  subjective: 'Subjetiva',
};

const EMPTY_CARDS: LogisticsGradeCards = {
  total_agendamentos: 0,
  total_alunos_previstos: 0,
  escolas_atendidas: 0,
  turmas_agendadas: 0,
};

interface GradeFilters {
  avaliacao: string;
  escola: string;
  serie: string;
  turma: string;
  dataInicio: string;
  dataFim: string;
  status: '' | LogisticsScheduleStatus;
  aplicador: string;
}

function defaultFilters(): GradeFilters {
  return {
    avaliacao: '',
    escola: '',
    serie: '',
    turma: '',
    dataInicio: '',
    dataFim: '',
    status: '',
    aplicador: '',
  };
}

function formatoLabel(mode?: string | null): string {
  if (!mode) return 'Online';
  return FORMATO_LABEL[mode] ?? mode;
}

function formatDateBR(iso?: string | null): string {
  if (!iso) return 'Sem data';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy');
  } catch {
    return iso;
  }
}

function weekdayLabel(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const label = format(parseISO(iso), 'EEEE', { locale: ptBR });
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return '—';
  }
}

function StatusBadge({ status }: { status: LogisticsScheduleStatus }) {
  if (status === 'publicado') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">{STATUS_LABEL[status]}</Badge>;
  }
  if (status === 'cancelado') return <Badge variant="destructive">{STATUS_LABEL[status]}</Badge>;
  return <Badge variant="secondary">{STATUS_LABEL[status]}</Badge>;
}

function FilterField({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 min-w-0">
      <label className="flex items-center gap-1.5 text-sm font-medium">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        {label}
      </label>
      {children}
    </div>
  );
}

interface LogisticaGradeProps {
  cityId: string;
  cityName: string;
  municipioSelector: ReactNode;
  onOpenSchedule: (scheduleId: string) => void;
  onManage: () => void;
}

export default function LogisticaGrade({
  cityId,
  cityName,
  municipioSelector,
  onOpenSchedule,
  onManage,
}: LogisticaGradeProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [options, setOptions] = useState<LogisticsGradeOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [filters, setFilters] = useState<GradeFilters>(defaultFilters);
  const [draftQuery, setDraftQuery] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<LogisticsGradeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [cards, setCards] = useState<LogisticsGradeCards>(EMPTY_CARDS);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfOrientation, setPdfOrientation] = useState<LogisticsPdfOrientation>('landscape');
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    if (!cityId) {
      setOptions(null);
      setCanManage(false);
      return;
    }
    let cancelled = false;
    setLoadingOptions(true);
    LogisticsApiService.getOpcoesGrade(cityId)
      .then((data) => {
        if (cancelled) return;
        setOptions(data);
        setCanManage(data.can_manage);
      })
      .catch((err) => {
        if (cancelled) return;
        setOptions(null);
        toast({
          title: 'Erro ao carregar filtros',
          description: getLogisticsApiErrorMessage(err, 'Tente novamente.'),
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cityId, toast]);

  useEffect(() => {
    if (!cityId) {
      setItems([]);
      setTotal(0);
      setCards(EMPTY_CARDS);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    LogisticsApiService.listItens(
      {
        avaliacao: filters.avaliacao || undefined,
        escola: filters.escola || undefined,
        serie: filters.serie || undefined,
        turma: filters.turma || undefined,
        data_inicio: filters.dataInicio || undefined,
        data_fim: filters.dataFim || undefined,
        status: filters.status || undefined,
        aplicador: filters.aplicador || undefined,
        q: query || undefined,
        page,
        per_page: PER_PAGE,
      },
      cityId
    )
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setCards(data.cards);
        setCanManage(data.can_manage);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = getLogisticsApiErrorMessage(err, 'Tente novamente.');
        setItems([]);
        setTotal(0);
        setCards(EMPTY_CARDS);
        setError(message);
        toast({ title: 'Erro ao carregar agendamentos', description: message, variant: 'destructive' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cityId, filters, query, page, toast]);

  const avaliacoes = options?.avaliacoes ?? [];

  const escolas = useMemo(() => {
    const all = options?.escolas ?? [];
    if (!filters.avaliacao) return all;
    return all.filter((item) => item.avaliacao_ids.includes(filters.avaliacao));
  }, [options, filters.avaliacao]);

  const series = useMemo(() => {
    return (options?.series ?? []).filter((item) => {
      if (filters.avaliacao && !item.avaliacao_ids.includes(filters.avaliacao)) return false;
      if (filters.escola && !item.escola_ids.includes(filters.escola)) return false;
      return true;
    });
  }, [options, filters.avaliacao, filters.escola]);

  const turmas = useMemo(() => {
    return (options?.turmas ?? []).filter((item) => {
      if (filters.avaliacao && !item.avaliacao_ids.includes(filters.avaliacao)) return false;
      if (filters.escola && !item.escola_ids.includes(filters.escola)) return false;
      if (filters.serie && !item.serie_ids.includes(filters.serie)) return false;
      return true;
    });
  }, [options, filters.avaliacao, filters.escola, filters.serie]);

  const statusOptions = options?.status?.length
    ? options.status
    : canManage
      ? (['rascunho', 'publicado', 'cancelado'] as LogisticsScheduleStatus[])
      : (['publicado'] as LogisticsScheduleStatus[]);

  const applyFilters = (patch: Partial<GradeFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const handleAvaliacao = (value: string) => {
    applyFilters({
      avaliacao: value === ALL ? '' : value,
      escola: '',
      serie: '',
      turma: '',
    });
  };

  const handleEscola = (value: string) => {
    applyFilters({
      escola: value === ALL ? '' : value,
      serie: '',
      turma: '',
    });
  };

  const handleSerie = (value: string) => {
    applyFilters({
      serie: value === ALL ? '' : value,
      turma: '',
    });
  };

  const clearFilters = () => {
    setFilters(defaultFilters());
    setDraftQuery('');
    setQuery('');
    setPage(1);
  };

  const submitSearch = () => {
    setQuery(draftQuery.trim());
    setPage(1);
  };

  const filterLabels = useMemo(() => {
    const avaliacaoNome =
      filters.avaliacao
        ? avaliacoes.find((a) => a.id === filters.avaliacao)?.titulo || filters.avaliacao
        : 'Todas';
    const escolaNome =
      filters.escola ? escolas.find((e) => e.id === filters.escola)?.nome || filters.escola : 'Todas';
    const serieNome =
      filters.serie ? series.find((s) => s.id === filters.serie)?.nome || filters.serie : 'Todas';
    const turmaNome =
      filters.turma ? turmas.find((t) => t.id === filters.turma)?.nome || filters.turma : 'Todas';
    const statusNome = filters.status ? STATUS_LABEL[filters.status] : 'Todos';
    const aplicadorNome =
      filters.aplicador === SEM_APLICADOR
        ? 'Sem aplicador'
        : filters.aplicador
          ? options?.aplicadores.find((a) => a.id === filters.aplicador)?.nome || filters.aplicador
          : 'Todos';
    return {
      avaliacao: avaliacaoNome,
      escola: escolaNome,
      serie: serieNome,
      turma: turmaNome,
      status: statusNome,
      aplicador: aplicadorNome,
      dataInicio: filters.dataInicio || null,
      dataFim: filters.dataFim || null,
      busca: query || null,
    };
  }, [filters, avaliacoes, escolas, series, turmas, options, query]);

  const handleExportPdf = async () => {
    if (!cityId) return;
    setExportingPdf(true);
    try {
      const data = await LogisticsApiService.listItens(
        {
          avaliacao: filters.avaliacao || undefined,
          escola: filters.escola || undefined,
          serie: filters.serie || undefined,
          turma: filters.turma || undefined,
          data_inicio: filters.dataInicio || undefined,
          data_fim: filters.dataFim || undefined,
          status: filters.status || undefined,
          aplicador: filters.aplicador || undefined,
          q: query || undefined,
          export: true,
        },
        cityId
      );
      if (data.truncated) {
        toast({
          title: 'PDF parcialmente gerado',
          description: `O filtro retornou ${data.total.toLocaleString('pt-BR')} linhas; o PDF inclui as primeiras ${(data.export_limit ?? data.items.length).toLocaleString('pt-BR')}.`,
        });
      }
      await generateLogisticsGradePdf({
        items: data.items,
        cards: data.cards,
        orientation: pdfOrientation,
        cityName,
        cityId,
        filterLabels,
      });
      setPdfDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Erro ao gerar PDF',
        description: getLogisticsApiErrorMessage(err, 'Tente novamente.'),
        variant: 'destructive',
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const recordLabel = total === 1 ? '1 registro' : `${total.toLocaleString('pt-BR')} registros`;

  const cardItems: Array<{ label: string; value: number; icon: React.ComponentType<{ className?: string }> }> = [
    { label: 'Total Agendamentos', value: cards.total_agendamentos, icon: CalendarDays },
    { label: 'Total Alunos Previstos', value: cards.total_alunos_previstos, icon: Users },
    { label: 'Escolas Atendidas', value: cards.escolas_atendidas, icon: School },
    { label: 'Turmas Agendadas', value: cards.turmas_agendadas, icon: GraduationCap },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink onClick={() => navigate('/app')}>Início</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <span>Relatórios</span>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Logística de Avaliação</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Truck className="h-6 w-6" />
              Logística de Avaliação
            </h1>
            <p className="text-muted-foreground">
              Planejamento, agendamento de escolas/turnos por data e cronograma de aplicação das avaliações.
            </p>
            {cityName && <p className="text-sm text-blue-600 dark:text-blue-400">Município: {cityName}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {cityId && (
              <Button variant="outline" onClick={() => setPdfDialogOpen(true)} disabled={loading || total === 0}>
                <FileText className="mr-2 h-4 w-4" />
                Gerar PDF
              </Button>
            )}
            {canManage && (
              <Button variant="outline" onClick={onManage}>
                <Settings2 className="mr-2 h-4 w-4" />
                Gerenciar cronogramas
              </Button>
            )}
          </div>
        </div>
      </header>

      {municipioSelector && (
        <Card>
          <CardContent className="pt-6">{municipioSelector}</CardContent>
        </Card>
      )}

      {!cityId ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Selecione estado e município para ver os agendamentos.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cardItems.map((card) => (
              <Card key={card.label}>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <card.icon className="h-4 w-4" />
                    {card.label}
                  </CardDescription>
                  <CardTitle className="text-2xl tabular-nums">
                    {loading ? '…' : card.value.toLocaleString('pt-BR')}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4" />
                Filtros de Pesquisa
              </CardTitle>
              <CardDescription>
                Avaliação → Escola → Série → Turma. Valor vazio significa Todas. Status, período e aplicador são
                opcionais; período vazio não esconde item sem data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <FilterField icon={ClipboardList} label="Avaliação">
                  <Select
                    value={filters.avaliacao || ALL}
                    onValueChange={handleAvaliacao}
                    disabled={loadingOptions && !options}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas as avaliações" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todas as avaliações</SelectItem>
                      {avaliacoes.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.source_badge ? `${item.titulo} · ${item.source_badge}` : item.titulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField icon={School} label="Escola">
                  <Select
                    value={filters.escola || ALL}
                    onValueChange={handleEscola}
                    disabled={loadingOptions && !options}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas as escolas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todas as escolas</SelectItem>
                      {escolas.map((escola) => (
                        <SelectItem key={escola.id} value={escola.id}>
                          {escola.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField icon={GraduationCap} label="Série">
                  <Select
                    value={filters.serie || ALL}
                    onValueChange={handleSerie}
                    disabled={loadingOptions && !options}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas as séries" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todas as séries</SelectItem>
                      {series.map((serie) => (
                        <SelectItem key={serie.id} value={serie.id}>
                          {serie.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField icon={Users} label="Turma">
                  <Select
                    value={filters.turma || ALL}
                    onValueChange={(value) => applyFilters({ turma: value === ALL ? '' : value })}
                    disabled={loadingOptions && !options}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas as turmas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todas as turmas</SelectItem>
                      {turmas.map((turma) => (
                        <SelectItem key={turma.id} value={turma.id}>
                          {turma.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField icon={CalendarRange} label="Data Início">
                  <Input
                    type="date"
                    value={filters.dataInicio}
                    onChange={(event) => applyFilters({ dataInicio: event.target.value })}
                  />
                </FilterField>

                <FilterField icon={CalendarRange} label="Data Fim">
                  <Input
                    type="date"
                    value={filters.dataFim}
                    onChange={(event) => applyFilters({ dataFim: event.target.value })}
                  />
                </FilterField>

                <FilterField icon={UserRound} label="Aplicador">
                  <Select
                    value={filters.aplicador || ALL}
                    onValueChange={(value) => applyFilters({ aplicador: value === ALL ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos os Aplicadores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todos os Aplicadores</SelectItem>
                      <SelectItem value={SEM_APLICADOR}>Sem aplicador</SelectItem>
                      {(options?.aplicadores ?? []).map((aplicador) => (
                        <SelectItem key={aplicador.id} value={aplicador.id}>
                          {aplicador.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField icon={ClipboardList} label="Status">
                  <Select
                    value={filters.status || ALL}
                    onValueChange={(value) =>
                      applyFilters({ status: value === ALL ? '' : (value as LogisticsScheduleStatus) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos os status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todos os status</SelectItem>
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABEL[status] ?? status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={clearFilters}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Limpar filtros
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-3 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Cronograma de Aplicação</CardTitle>
                  <CardDescription>{loading ? 'Carregando…' : recordLabel}</CardDescription>
                </div>
              </div>
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitSearch();
                }}
              >
                <Input
                  value={draftQuery}
                  onChange={(event) => setDraftQuery(event.target.value)}
                  placeholder="Buscar por escola, turma, série, aplicador..."
                  className="sm:max-w-md"
                />
                <Button type="submit" variant="secondary">
                  <Search className="mr-2 h-4 w-4" />
                  Buscar
                </Button>
              </form>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  {error}
                </p>
              )}
              {loading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Carregando agendamentos…
                </div>
              ) : items.length === 0 ? (
                <p className="py-10 text-center text-muted-foreground">Nenhum agendamento encontrado.</p>
              ) : (
                <Table className="min-w-[980px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Dia da semana</TableHead>
                      <TableHead>Turno</TableHead>
                      <TableHead>Instrumento</TableHead>
                      <TableHead>Escola</TableHead>
                      <TableHead>Série/Ano</TableHead>
                      <TableHead>Turma</TableHead>
                      <TableHead>Formato</TableHead>
                      <TableHead className="text-right">Qtd. Alunos</TableHead>
                      <TableHead>Aplicador</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="sticky right-0 z-20 bg-background shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.18)]">
                        Ações
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} className="group">
                        <TableCell className="whitespace-nowrap">{formatDateBR(item.scheduled_date)}</TableCell>
                        <TableCell className="whitespace-nowrap">{weekdayLabel(item.scheduled_date)}</TableCell>
                        <TableCell>
                          {item.turno ? <Badge variant="outline">{item.turno}</Badge> : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <span>{item.display_title || item.test_title || '—'}</span>
                            {item.source_badge && (
                              <Badge variant="outline" className="text-[10px] font-normal">
                                {item.source_badge}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{item.school_name || '—'}</TableCell>
                        <TableCell>{item.grade_name || '—'}</TableCell>
                        <TableCell>{item.class_name || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatoLabel(item.evaluation_mode)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{item.students_count.toLocaleString('pt-BR')}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <span>{item.applicator_name || '-'}</span>
                            {item.origem === 'auto' && (
                              <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                                Automático
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            'sticky right-0 z-10 bg-background shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.18)]',
                            'group-hover:bg-muted'
                          )}
                        >
                          <Button variant="outline" size="sm" onClick={() => onOpenSchedule(item.schedule_id)}>
                            <Eye className="mr-1 h-4 w-4" />
                            Abrir cronograma
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {total > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Página {Math.min(page, pageCount)} de {pageCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= pageCount || loading}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar PDF da logística</DialogTitle>
            <DialogDescription>
              O PDF usa todas as linhas do filtro atual (não só a página), agrupadas por avaliação e escola.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={pdfOrientation}
            onValueChange={(value) => setPdfOrientation(value as LogisticsPdfOrientation)}
            className="space-y-3"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="landscape" id="pdf-landscape" />
              <Label htmlFor="pdf-landscape">Paisagem</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="portrait" id="pdf-portrait" />
              <Label htmlFor="pdf-portrait">Retrato</Label>
            </div>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPdfDialogOpen(false)} disabled={exportingPdf}>
              Cancelar
            </Button>
            <Button onClick={() => void handleExportPdf()} disabled={exportingPdf}>
              {exportingPdf ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Gerar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
