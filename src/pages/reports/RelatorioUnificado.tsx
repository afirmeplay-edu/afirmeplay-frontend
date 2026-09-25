import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  Download,
  Filter,
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
  type UserHierarchyContext,
} from '@/utils/userHierarchy';
import { getReportProficiencyTagClass } from '@/utils/report/reportTagStyles';
import { getPerfilLeitorStyle, type PerfilLeitorCode } from '@/lib/colors/reading-levels';
import { cn } from '@/lib/utils';
import {
  getRelatorioUnificadoApiErrorMessage,
  RelatorioUnificadoApiService,
  unifiedReportEntityTypeForFlow,
} from '@/services/reports/relatorioUnificadoApi';
import { generateRelatorioUnificadoPdf } from '@/services/reports/relatorioUnificadoPdf';
import type {
  RelatorioUnificadoDados,
  RelatorioUnificadoFilterAvaliacao,
  RelatorioUnificadoFilterEntity,
  RelatorioUnificadoFilterTurma,
  RelatorioUnificadoLeituraAvaliacao,
  RelatorioUnificadoMetricas,
  RelatorioUnificadoModoLeitura,
  RelatorioUnificadoReportFlow,
} from '@/types/relatorio-unificado';

const NAO_AVALIADO = 'não avaliado';
const REPORT_ROLES = ['admin', 'professor', 'diretor', 'coordenador', 'tecadm'];

/** Larguras das colunas sticky (Aluno + Nível + Alfabetizado). */
const STICKY_ALUNO_W = 180;
const STICKY_NIVEL_W = 132;
const STICKY_ALFAB_W = 108;

type RelatorioUnificadoProps = {
  flow?: RelatorioUnificadoReportFlow;
  hidePageHeading?: boolean;
};

function formatMetricNumber(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function MutedText({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

/** Célula de métrica da prova: valor, "—" se ausente (com prova), nunca "não avaliado". */
function MetricCell({
  value,
  kind,
}: {
  value: RelatorioUnificadoMetricas | null | undefined;
  kind: 'proficiencia' | 'nota' | 'classificacao';
}) {
  if (!value) {
    return <MutedText>—</MutedText>;
  }
  if (kind === 'classificacao') {
    const label = value.classificacao;
    if (!label) return <MutedText>—</MutedText>;
    return (
      <span className={cn(getReportProficiencyTagClass(label), 'whitespace-nowrap')}>{label}</span>
    );
  }
  const num = kind === 'nota' ? value.nota : value.proficiencia;
  if (num === null || num === undefined) {
    return <MutedText>—</MutedText>;
  }
  return <span>{formatMetricNumber(num)}</span>;
}

function ReadingLevelBadge({
  code,
  label,
}: {
  code: string | null;
  label: string | null;
}) {
  if (!code) {
    return <MutedText>{NAO_AVALIADO}</MutedText>;
  }
  const style = getPerfilLeitorStyle(code as PerfilLeitorCode);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold',
        style.tagClass
      )}
    >
      {label || code}
    </span>
  );
}

function stickyStyle(left: number, width: number): CSSProperties {
  return { left, minWidth: width, width, maxWidth: width };
}

export default function RelatorioUnificado({
  flow = 'digital',
  hidePageHeading = false,
}: RelatorioUnificadoProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const isCartao = flow === 'cartao';
  const instrumentLabel = isCartao ? 'Cartão-resposta' : 'Avaliação';
  const instrumentSingular = isCartao ? 'cartão-resposta' : 'avaliação';
  const reportEntityType = unifiedReportEntityTypeForFlow(flow);

  const normalizedRole = (user?.role ?? '').toLowerCase();
  const roleRequiresSpecificSchool = ['diretor', 'coordenador', 'professor'].includes(
    normalizedRole
  );

  const [userHierarchyContext, setUserHierarchyContext] =
    useState<UserHierarchyContext | null>(null);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(true);

  const [estados, setEstados] = useState<RelatorioUnificadoFilterEntity[]>([]);
  const [municipios, setMunicipios] = useState<RelatorioUnificadoFilterEntity[]>([]);
  const [avaliacoesOpcoes, setAvaliacoesOpcoes] = useState<RelatorioUnificadoFilterAvaliacao[]>(
    []
  );
  const [escolas, setEscolas] = useState<RelatorioUnificadoFilterEntity[]>([]);
  const [series, setSeries] = useState<RelatorioUnificadoFilterEntity[]>([]);
  const [turmas, setTurmas] = useState<RelatorioUnificadoFilterTurma[]>([]);

  const [leituraAnos, setLeituraAnos] = useState<number[]>([]);
  const [leituraEdicoes, setLeituraEdicoes] = useState<RelatorioUnificadoFilterEntity[]>([]);
  const [leituraAvaliacoesAll, setLeituraAvaliacoesAll] = useState<
    RelatorioUnificadoLeituraAvaliacao[]
  >([]);

  const [selectedEstado, setSelectedEstado] = useState('all');
  const [selectedMunicipio, setSelectedMunicipio] = useState('all');
  const [selectedAvaliacao, setSelectedAvaliacao] = useState('all');
  const [selectedEscola, setSelectedEscola] = useState('all');
  const [selectedSerie, setSelectedSerie] = useState('all');
  const [selectedTurma, setSelectedTurma] = useState('all');
  const [selectedLeituraAno, setSelectedLeituraAno] = useState('all');
  const [selectedLeituraEdicao, setSelectedLeituraEdicao] = useState('all');
  const [selectedLeituraAvaliacao, setSelectedLeituraAvaliacao] = useState('all');
  const [modoLeitura, setModoLeitura] = useState<RelatorioUnificadoModoLeitura>('avaliacao');

  const [loadingEstados, setLoadingEstados] = useState(false);
  const [loadingMunicipios, setLoadingMunicipios] = useState(false);
  const [loadingAvaliacoes, setLoadingAvaliacoes] = useState(false);
  const [loadingEscolas, setLoadingEscolas] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingTurmas, setLoadingTurmas] = useState(false);
  const [loadingLeitura, setLoadingLeitura] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const [report, setReport] = useState<RelatorioUnificadoDados | null>(null);

  const lockedSchoolId = roleRequiresSpecificSchool
    ? userHierarchyContext?.school?.id
    : undefined;

  const canGenerate =
    selectedEstado !== 'all' &&
    selectedMunicipio !== 'all' &&
    selectedAvaliacao !== 'all' &&
    (selectedEscola !== 'all' || selectedTurma !== 'all') &&
    (modoLeitura === 'avaliacao'
      ? selectedLeituraAvaliacao !== 'all'
      : selectedLeituraAno !== 'all' && selectedLeituraEdicao !== 'all');

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

  const leituraAvaliacoesFiltradas = useMemo(() => {
    return leituraAvaliacoesAll.filter((a) => {
      if (selectedLeituraAno !== 'all' && String(a.ano ?? '') !== selectedLeituraAno) {
        return false;
      }
      if (selectedLeituraEdicao !== 'all' && a.edicao !== selectedLeituraEdicao) {
        return false;
      }
      return true;
    });
  }, [leituraAvaliacoesAll, selectedLeituraAno, selectedLeituraEdicao]);

  useEffect(() => {
    if (user && !REPORT_ROLES.includes(user.role)) {
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
            const opcoes = await RelatorioUnificadoApiService.getOpcoesFiltros({
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
    RelatorioUnificadoApiService.getOpcoesFiltros({ report_entity_type: reportEntityType })
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
    RelatorioUnificadoApiService.getOpcoesFiltros({
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
      setLeituraAnos([]);
      setLeituraEdicoes([]);
      setLeituraAvaliacoesAll([]);
      return;
    }
    let cancelled = false;
    setLoadingAvaliacoes(true);
    setLoadingLeitura(true);
    RelatorioUnificadoApiService.getOpcoesFiltros({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      report_entity_type: reportEntityType,
    })
      .then((data) => {
        if (cancelled) return;
        setAvaliacoesOpcoes(data.avaliacoes ?? []);
        setLeituraAnos(data.leitura?.anos ?? []);
        setLeituraEdicoes(data.leitura?.edicoes ?? []);
        setLeituraAvaliacoesAll(data.leitura?.avaliacoes ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setAvaliacoesOpcoes([]);
        setLeituraAnos([]);
        setLeituraEdicoes([]);
        setLeituraAvaliacoesAll([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingAvaliacoes(false);
          setLoadingLeitura(false);
        }
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
    RelatorioUnificadoApiService.getOpcoesFiltros({
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
  }, [selectedEstado, selectedMunicipio, selectedAvaliacao, reportEntityType, lockedSchoolId]);

  useEffect(() => {
    if (
      selectedEstado === 'all' ||
      selectedMunicipio === 'all' ||
      selectedAvaliacao === 'all' ||
      selectedEscola === 'all'
    ) {
      setSeries([]);
      return;
    }
    let cancelled = false;
    setLoadingSeries(true);
    RelatorioUnificadoApiService.getOpcoesFiltros({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      avaliacao: selectedAvaliacao,
      escola: selectedEscola,
      report_entity_type: reportEntityType,
    })
      .then((data) => {
        if (cancelled) return;
        const next = data.series ?? [];
        setSeries(next);
        setSelectedSerie((prev) =>
          prev !== 'all' && !next.some((s) => s.id === prev) ? 'all' : prev
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
      selectedEscola === 'all'
    ) {
      setTurmas([]);
      return;
    }
    let cancelled = false;
    setLoadingTurmas(true);
    RelatorioUnificadoApiService.getOpcoesFiltros({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      avaliacao: selectedAvaliacao,
      escola: selectedEscola,
      serie: selectedSerie !== 'all' ? selectedSerie : undefined,
      report_entity_type: reportEntityType,
    })
      .then((data) => {
        if (cancelled) return;
        const next = data.turmas ?? [];
        setTurmas(next);
        setSelectedTurma((prev) =>
          prev !== 'all' && !next.some((t) => t.id === prev) ? 'all' : prev
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

  useEffect(() => {
    if (
      selectedLeituraAvaliacao !== 'all' &&
      !leituraAvaliacoesFiltradas.some((a) => a.id === selectedLeituraAvaliacao)
    ) {
      setSelectedLeituraAvaliacao('all');
    }
  }, [leituraAvaliacoesFiltradas, selectedLeituraAvaliacao]);

  const handleEstadoChange = (value: string) => {
    setSelectedEstado(value);
    setSelectedMunicipio('all');
    setSelectedAvaliacao('all');
    setSelectedEscola('all');
    setSelectedSerie('all');
    setSelectedTurma('all');
    setSelectedLeituraAno('all');
    setSelectedLeituraEdicao('all');
    setSelectedLeituraAvaliacao('all');
    setReport(null);
  };

  const handleMunicipioChange = (value: string) => {
    setSelectedMunicipio(value);
    setSelectedAvaliacao('all');
    setSelectedEscola('all');
    setSelectedSerie('all');
    setSelectedTurma('all');
    setSelectedLeituraAno('all');
    setSelectedLeituraEdicao('all');
    setSelectedLeituraAvaliacao('all');
    setReport(null);
  };

  const handleAvaliacaoChange = (value: string) => {
    setSelectedAvaliacao(value);
    setSelectedEscola(lockedSchoolId || 'all');
    setSelectedSerie('all');
    setSelectedTurma('all');
    setReport(null);
  };

  const escopoSubtitulo = useMemo(() => {
    if (!report) return '';
    const parts: string[] = [report.metadados.municipioNome];
    if (selectedEscola !== 'all') {
      const nomeEscola = escolas.find((e) => e.id === selectedEscola)?.nome;
      if (nomeEscola) parts.push(nomeEscola);
    }
    if (selectedTurma !== 'all') {
      const turma = turmas.find((t) => t.id === selectedTurma);
      const label = turma?.label || turma?.nome;
      if (label) parts.push(label);
    }
    const n = report.resumo.totalAlunos;
    parts.push(`${n} aluno${n === 1 ? '' : 's'}`);
    return parts.join(' · ');
  }, [report, selectedEscola, selectedTurma, escolas, turmas]);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      const data = await RelatorioUnificadoApiService.getDados({
        estado: selectedEstado,
        municipio: selectedMunicipio,
        avaliacao: selectedAvaliacao,
        modo_leitura: modoLeitura,
        avaliacao_leitura:
          modoLeitura === 'avaliacao' ? selectedLeituraAvaliacao : undefined,
        ano: modoLeitura === 'edicao' ? selectedLeituraAno : undefined,
        edicao: modoLeitura === 'edicao' ? selectedLeituraEdicao : undefined,
        report_entity_type: reportEntityType,
        escola: selectedEscola !== 'all' ? selectedEscola : undefined,
        serie: selectedSerie !== 'all' ? selectedSerie : undefined,
        turma: selectedTurma !== 'all' ? selectedTurma : undefined,
      });
      setReport(data);
    } catch (error) {
      setReport(null);
      toast({
        title: 'Erro ao gerar relatório',
        description: getRelatorioUnificadoApiErrorMessage(
          error,
          'Não foi possível gerar o relatório unificado.'
        ),
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  }, [
    canGenerate,
    selectedEstado,
    selectedMunicipio,
    selectedAvaliacao,
    modoLeitura,
    selectedLeituraAvaliacao,
    selectedLeituraAno,
    selectedLeituraEdicao,
    reportEntityType,
    selectedEscola,
    selectedSerie,
    selectedTurma,
    toast,
  ]);

  const handleDownloadPdf = useCallback(async () => {
    if (!report) return;
    try {
      setGeneratingPdf(true);
      await generateRelatorioUnificadoPdf({
        report,
        escopoSubtitulo,
        flow,
        cityId: selectedMunicipio !== 'all' ? selectedMunicipio : null,
        escolaNome:
          selectedEscola !== 'all'
            ? escolas.find((e) => e.id === selectedEscola)?.nome
            : undefined,
        turmaNome:
          selectedTurma !== 'all'
            ? turmas.find((t) => t.id === selectedTurma)?.label ||
              turmas.find((t) => t.id === selectedTurma)?.nome
            : undefined,
      });
      toast({
        title: 'Relatório baixado',
        description: 'O PDF do Relatório Unificado foi salvo no seu dispositivo.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao gerar PDF',
        description: getRelatorioUnificadoApiErrorMessage(
          error,
          'Não foi possível gerar o PDF.'
        ),
        variant: 'destructive',
      });
    } finally {
      setGeneratingPdf(false);
    }
  }, [
    report,
    escopoSubtitulo,
    flow,
    selectedMunicipio,
    selectedEscola,
    selectedTurma,
    escolas,
    turmas,
    toast,
  ]);

  if (isLoadingHierarchy) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
      </div>
    );
  }

  const resumo = report?.resumo;
  const disciplinas = report?.disciplinas ?? [];
  const provaColSpan = 3 + disciplinas.length * 3;
  const stickyNivelLeft = STICKY_ALUNO_W;
  const stickyAlfabLeft = STICKY_ALUNO_W + STICKY_NIVEL_W;

  return (
    <div className="space-y-6">
      {!hidePageHeading && (
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Relatório Unificado</h1>
          <p className="text-muted-foreground">
            Junta por aluno os resultados da avaliação com o nível de leitura (Afirme Ler).
          </p>
          {user?.role && (
            <p className="text-sm text-blue-600 dark:text-blue-400">
              {getRestrictionMessage(user.role)}
            </p>
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
            Selecione estado, município, {instrumentSingular}, avaliação de leitura e ao menos
            escola ou turma.
          </CardDescription>
          {hidePageHeading && user?.role && (
            <p className="text-sm text-blue-600 dark:text-blue-400">
              {getRestrictionMessage(user.role)}
            </p>
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
                onValueChange={(v) => {
                  setSelectedEscola(v);
                  setSelectedSerie('all');
                  setSelectedTurma('all');
                  setReport(null);
                }}
                disabled={selectedAvaliacao === 'all' || loadingEscolas || roleRequiresSpecificSchool}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a escola" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Selecione…</SelectItem>
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
                onValueChange={(v) => {
                  setSelectedSerie(v);
                  setSelectedTurma('all');
                  setReport(null);
                }}
                disabled={selectedEscola === 'all' || loadingSeries}
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
                onValueChange={(v) => {
                  setSelectedTurma(v);
                  setReport(null);
                }}
                disabled={selectedEscola === 'all' || loadingTurmas}
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

          <div className="rounded-md border bg-muted/30 p-4 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Avaliação de leitura (Afirme Ler)
            </p>
            <div className="space-y-2 max-w-md">
              <label className="text-sm font-medium">Leitura</label>
              <Select
                value={modoLeitura}
                onValueChange={(v) => {
                  const next = v as RelatorioUnificadoModoLeitura;
                  setModoLeitura(next);
                  if (next === 'edicao') {
                    if (selectedLeituraAno === 'all' && leituraAnos.length === 1) {
                      setSelectedLeituraAno(String(leituraAnos[0]));
                    }
                    if (selectedLeituraEdicao === 'all' && leituraEdicoes.length === 1) {
                      setSelectedLeituraEdicao(leituraEdicoes[0].id);
                    }
                  }
                  setReport(null);
                }}
                disabled={selectedMunicipio === 'all' || loadingLeitura}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="avaliacao">Por avaliação</SelectItem>
                  <SelectItem value="edicao">Por edição</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Ano{modoLeitura === 'edicao' ? ' *' : ''}
                </label>
                <Select
                  value={selectedLeituraAno}
                  onValueChange={(v) => {
                    setSelectedLeituraAno(v);
                    setSelectedLeituraAvaliacao('all');
                    setReport(null);
                  }}
                  disabled={selectedMunicipio === 'all' || loadingLeitura}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        modoLeitura === 'edicao' ? 'Selecione o ano' : 'Todos os anos'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {modoLeitura === 'avaliacao' && (
                      <SelectItem value="all">Todos os anos</SelectItem>
                    )}
                    {leituraAnos.map((ano) => (
                      <SelectItem key={ano} value={String(ano)}>
                        {ano}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Edição{modoLeitura === 'edicao' ? ' *' : ''}
                </label>
                <Select
                  value={selectedLeituraEdicao}
                  onValueChange={(v) => {
                    setSelectedLeituraEdicao(v);
                    setSelectedLeituraAvaliacao('all');
                    setReport(null);
                  }}
                  disabled={selectedMunicipio === 'all' || loadingLeitura}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        modoLeitura === 'edicao'
                          ? 'Selecione a edição'
                          : 'Todas as edições'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {modoLeitura === 'avaliacao' && (
                      <SelectItem value="all">Todas as edições</SelectItem>
                    )}
                    {leituraEdicoes.map((ed) => (
                      <SelectItem key={ed.id} value={ed.id}>
                        {ed.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {modoLeitura === 'avaliacao' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Avaliação de leitura *</label>
                  <Select
                    value={selectedLeituraAvaliacao}
                    onValueChange={(v) => {
                      setSelectedLeituraAvaliacao(v);
                      setReport(null);
                    }}
                    disabled={selectedMunicipio === 'all' || loadingLeitura}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a avaliação de leitura" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Selecione…</SelectItem>
                      {leituraAvaliacoesFiltradas.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.titulo}
                          {a.edicaoLabel ? ` (${a.edicaoLabel})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleGenerate()} disabled={!canGenerate || generating}>
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Gerar relatório
                </>
              )}
            </Button>
            {!canGenerate && (
              <p className="text-sm text-muted-foreground self-center flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Preencha os filtros obrigatórios (incluindo escola ou turma).
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {report && resumo && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <header className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">
                {report.metadados.rotuloCombinado}
              </h2>
              <p className="text-sm text-muted-foreground">{escopoSubtitulo}</p>
              {report.metadados.leitura?.escopoMensagem && (
                <p className="text-sm text-muted-foreground">
                  {report.metadados.leitura.escopoMensagem}
                </p>
              )}
            </header>
            <Button
              onClick={() => void handleDownloadPdf()}
              disabled={generatingPdf || generating || !report}
            >
              {generatingPdf ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Gerando PDF…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar PDF
                </>
              )}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  ICA (alfabetizados)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tracking-tight">
                  {formatMetricNumber(resumo.icaPctLf)}% alfabetizados
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {resumo.alunosLf} de {resumo.alunosComLeitura} avaliados
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Sem leitura
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tracking-tight">
                  {resumo.alunosSemLeitura} aluno
                  {resumo.alunosSemLeitura === 1 ? '' : 's'} sem leitura
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Inclui ausentes e leituras não concluídas
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/60 border-b">
                      <th
                        rowSpan={2}
                        className="sticky z-20 bg-muted px-3 py-2 text-left font-medium border-r"
                        style={stickyStyle(0, STICKY_ALUNO_W)}
                      >
                        Aluno
                      </th>
                      <th
                        rowSpan={2}
                        className="sticky z-20 bg-muted px-2 py-2 text-center font-medium border-r whitespace-nowrap"
                        style={stickyStyle(stickyNivelLeft, STICKY_NIVEL_W)}
                      >
                        Nível de leitura
                      </th>
                      <th
                        rowSpan={2}
                        className="sticky z-20 bg-muted px-2 py-2 text-center font-medium border-r whitespace-nowrap"
                        style={stickyStyle(stickyAlfabLeft, STICKY_ALFAB_W)}
                      >
                        Alfabetizado
                      </th>
                      <th
                        colSpan={3}
                        className="px-3 py-2 text-center font-medium border-r whitespace-nowrap"
                      >
                        Geral
                      </th>
                      {disciplinas.map((d) => (
                        <th
                          key={d.id}
                          colSpan={3}
                          className="px-3 py-2 text-center font-medium border-r whitespace-nowrap"
                        >
                          {d.nome}
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-muted/40 border-b">
                      <FragmentHeads />
                      {disciplinas.map((d) => (
                        <FragmentHeads key={d.id} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.alunos.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3 + provaColSpan}
                          className="px-3 py-8 text-center text-muted-foreground"
                        >
                          Nenhum aluno no recorte selecionado.
                        </td>
                      </tr>
                    ) : (
                      report.alunos.map((aluno) => (
                        <tr key={aluno.id} className="border-b hover:bg-muted/30 group">
                          <td
                            className="sticky z-10 bg-background group-hover:bg-muted/30 px-3 py-2 font-medium border-r whitespace-nowrap"
                            style={stickyStyle(0, STICKY_ALUNO_W)}
                          >
                            <div className="truncate">{aluno.nome}</div>
                            <div className="text-xs text-muted-foreground font-normal truncate">
                              {aluno.turmaNome || '—'}
                            </div>
                          </td>
                          <td
                            className="sticky z-10 bg-background group-hover:bg-muted/30 px-2 py-2 text-center border-r"
                            style={stickyStyle(stickyNivelLeft, STICKY_NIVEL_W)}
                          >
                            {aluno.semLeitura ? (
                              <MutedText>{NAO_AVALIADO}</MutedText>
                            ) : (
                              <ReadingLevelBadge
                                code={aluno.nivelLeitura}
                                label={aluno.nivelLeituraLabel}
                              />
                            )}
                          </td>
                          <td
                            className="sticky z-10 bg-background group-hover:bg-muted/30 px-2 py-2 text-center border-r"
                            style={stickyStyle(stickyAlfabLeft, STICKY_ALFAB_W)}
                          >
                            {aluno.semLeitura || aluno.alfabetizado === null ? (
                              <MutedText>{NAO_AVALIADO}</MutedText>
                            ) : aluno.alfabetizado ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600">Sim</Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">
                                Não
                              </Badge>
                            )}
                          </td>
                          {aluno.semProva ? (
                            <td
                              colSpan={provaColSpan}
                              className="px-3 py-2 text-center text-muted-foreground border-r"
                            >
                              Não fez a avaliação
                            </td>
                          ) : (
                            <>
                              <FragmentCells metrics={aluno.geral} />
                              {disciplinas.map((d) => (
                                <FragmentCells
                                  key={d.id}
                                  metrics={aluno.porDisciplina?.[d.id]}
                                />
                              ))}
                            </>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {report.metadados.leitura?.modo === 'edicao' &&
            (report.metadados.leitura.avaliacoesIncluidas?.length ?? 0) > 0 && (
              <p className="text-sm text-muted-foreground">
                Avaliações de leitura incluídas:{' '}
                {report.metadados.leitura.avaliacoesIncluidas!
                  .map((a) => a.titulo || a.id)
                  .join(' · ')}
              </p>
            )}
        </>
      )}
    </div>
  );
}

function FragmentHeads() {
  return (
    <>
      <th className="px-2 py-1.5 text-center font-normal text-muted-foreground border-r whitespace-nowrap">
        Proficiência
      </th>
      <th className="px-2 py-1.5 text-center font-normal text-muted-foreground border-r whitespace-nowrap">
        Nota
      </th>
      <th className="px-2 py-1.5 text-center font-normal text-muted-foreground border-r whitespace-nowrap">
        Classificação
      </th>
    </>
  );
}

function FragmentCells({ metrics }: { metrics: RelatorioUnificadoMetricas | undefined }) {
  return (
    <>
      <td className="px-2 py-2 text-center border-r whitespace-nowrap">
        <MetricCell value={metrics} kind="proficiencia" />
      </td>
      <td className="px-2 py-2 text-center border-r whitespace-nowrap">
        <MetricCell value={metrics} kind="nota" />
      </td>
      <td className="px-2 py-2 text-center border-r whitespace-nowrap">
        <MetricCell value={metrics} kind="classificacao" />
      </td>
    </>
  );
}
