import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Eye,
  GraduationCap,
  Layers,
  Loader2,
  RotateCcw,
  School,
  Search,
  Settings2,
  SunMedium,
  Tablet,
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
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { LogisticsApiService, getLogisticsApiErrorMessage } from '@/services/logisticsApi';
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
  ano: number | null;
  etapa: string;
  avaliacao: string;
  escola: string;
  serie: string;
  turno: string;
  formato: string;
  dataInicio: string;
  dataFim: string;
  status: '' | LogisticsScheduleStatus;
  aplicador: string;
}

function currentYear(): number {
  return new Date().getFullYear();
}

function defaultFilters(): GradeFilters {
  return {
    ano: currentYear(),
    etapa: '',
    avaliacao: '',
    escola: '',
    serie: '',
    turno: '',
    formato: '',
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
        ano: filters.ano ?? undefined,
        etapa: filters.etapa || undefined,
        avaliacao: filters.avaliacao || undefined,
        escola: filters.escola || undefined,
        serie: filters.serie || undefined,
        turno: filters.turno || undefined,
        formato: filters.formato || undefined,
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

  const anos = useMemo(() => {
    const years = new Set<number>(options?.anos ?? []);
    years.add(currentYear());
    if (filters.ano) years.add(filters.ano);
    return Array.from(years).sort((a, b) => b - a);
  }, [options, filters.ano]);

  const avaliacoes = useMemo(() => {
    const all = options?.avaliacoes ?? [];
    if (!filters.etapa) return all;
    return all.filter((item) => item.etapa_ids.includes(filters.etapa));
  }, [options, filters.etapa]);

  const series = useMemo(() => {
    return (options?.series ?? []).filter((item) => {
      if (filters.etapa && item.etapa_id !== filters.etapa) return false;
      if (filters.escola && !item.escola_ids.includes(filters.escola)) return false;
      return true;
    });
  }, [options, filters.etapa, filters.escola]);

  const formatos = useMemo(() => {
    const known = ['virtual', 'physical', 'subjective'];
    const extra = (options?.formatos ?? []).filter((mode) => !known.includes(mode));
    return [...known, ...extra];
  }, [options]);

  const statusOptions = options?.status?.length
    ? options.status
    : canManage
      ? (['rascunho', 'publicado', 'cancelado'] as LogisticsScheduleStatus[])
      : (['publicado'] as LogisticsScheduleStatus[]);

  const applyFilters = (patch: Partial<GradeFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const handleEtapa = (value: string) => {
    applyFilters({ etapa: value === ALL ? '' : value, avaliacao: '', serie: '' });
  };

  const handleEscola = (value: string) => {
    applyFilters({ escola: value === ALL ? '' : value, serie: '' });
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
          {canManage && (
            <Button variant="outline" onClick={onManage}>
              <Settings2 className="mr-2 h-4 w-4" />
              Gerenciar cronogramas
            </Button>
          )}
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
                Os totais e a tabela usam os mesmos filtros. Itens sem data ficam de fora quando há ano ou intervalo de datas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <FilterField icon={CalendarDays} label="Ano Letivo">
                  <Select
                    value={filters.ano === null ? ALL : String(filters.ano)}
                    onValueChange={(value) => applyFilters({ ano: value === ALL ? null : Number(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Ano letivo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todos os anos</SelectItem>
                      {anos.map((year) => (
                        <SelectItem key={year} value={String(year)}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField icon={Layers} label="Etapa">
                  <Select value={filters.etapa || ALL} onValueChange={handleEtapa} disabled={loadingOptions && !options}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todas as etapas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todas as etapas</SelectItem>
                      {(options?.etapas ?? []).map((etapa) => (
                        <SelectItem key={etapa.id} value={etapa.id}>
                          {etapa.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField icon={ClipboardList} label="Avaliação">
                  <Select
                    value={filters.avaliacao || ALL}
                    onValueChange={(value) => applyFilters({ avaliacao: value === ALL ? '' : value })}
                    disabled={loadingOptions && !options}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas as avaliações" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todas as avaliações</SelectItem>
                      {avaliacoes.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.titulo}
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
                      {(options?.escolas ?? []).map((escola) => (
                        <SelectItem key={escola.id} value={escola.id}>
                          {escola.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField icon={GraduationCap} label="Série/Ano">
                  <Select
                    value={filters.serie || ALL}
                    onValueChange={(value) => applyFilters({ serie: value === ALL ? '' : value })}
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

                <FilterField icon={SunMedium} label="Turno">
                  <Select
                    value={filters.turno || ALL}
                    onValueChange={(value) => applyFilters({ turno: value === ALL ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos os turnos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todos os turnos</SelectItem>
                      {(options?.turnos ?? []).map((turno) => (
                        <SelectItem key={turno} value={turno}>
                          {turno}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>

                <FilterField icon={Tablet} label="Formato">
                  <Select
                    value={filters.formato || ALL}
                    onValueChange={(value) => applyFilters({ formato: value === ALL ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos os formatos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todos os formatos</SelectItem>
                      {formatos.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {formatoLabel(mode)}
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
    </div>
  );
}
