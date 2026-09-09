import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CLASS_SHIFT_OPTIONS } from '@/lib/classShift';
import { normalizeResultsPeriodYm } from '@/utils/resultsPeriod';
import {
  fetchAnswerSheetFilterOptions,
  fetchEvaluationFilterOptions,
  fetchProficiencyLevelsCartao,
  fetchProficiencyLevelsOnline,
  type ProficiencyLevelsResponse,
} from '@/services/evaluation/proficiencyLevelsApi';
import { generateNiveisProficienciaPdf } from '@/services/reports/niveisProficienciaPdf';
import { ReportHeader } from './components/ReportHeader';
import { FiltrosPainel, type FilterEntity, type FonteTab } from './components/FiltrosPainel';
import { KpiGrid } from './components/KpiGrid';
import { EscalaProficiencia } from './components/EscalaProficiencia';
import { ColunasNivel } from './components/ColunasNivel';
import { RelatorioTurmas } from './components/RelatorioTurmas';
import { TurmasHomogeneas } from './components/TurmasHomogeneas';
import { HabilidadesSection } from './components/HabilidadesSection';

function normEntities(items: unknown): FilterEntity[] {
  if (!Array.isArray(items)) return [];
  return items.map(
    (item: {
      id?: string;
      nome?: string;
      name?: string;
      titulo?: string;
      title?: string;
      shift?: string;
    }) => ({
      id: String(item.id ?? ''),
      nome: item.nome ?? item.name ?? item.titulo ?? item.title ?? '',
      shift: item.shift?.trim() || undefined,
    })
  ).filter((x) => x.id);
}

function deriveDisciplinas(data: ProficiencyLevelsResponse | null): FilterEntity[] {
  if (!data) return [];
  if (Array.isArray(data.disciplinas_disponiveis) && data.disciplinas_disponiveis.length) {
    return data.disciplinas_disponiveis.map((d) => ({
      id: String(d.id),
      nome: d.nome || String(d.id),
    }));
  }
  const map = new Map<string, string>();
  for (const h of data.habilidades || []) {
    const id = String(h.subject_id || h.componente || '').trim();
    const nome = String(h.componente || h.subject_id || '').trim();
    if (id && nome) map.set(id, nome);
  }
  return Array.from(map.entries()).map(([id, nome]) => ({ id, nome }));
}

function deriveTurnos(turmas: FilterEntity[]): string[] {
  const fromTurmas = Array.from(
    new Set(turmas.map((t) => t.shift?.trim()).filter(Boolean) as string[])
  );
  if (fromTurmas.length) return fromTurmas;
  return CLASS_SHIFT_OPTIONS.map((o) => o.value);
}

type BranchState = {
  estado: string;
  municipio: string;
  instrumento: string;
  escola: string;
  serie: string;
  turma: string;
  turno: string;
  nivel: string;
  disciplina: string;
  estados: FilterEntity[];
  municipios: FilterEntity[];
  escolas: FilterEntity[];
  series: FilterEntity[];
  turmas: FilterEntity[];
};

const initialBranch = (): BranchState => ({
  estado: 'all',
  municipio: 'all',
  instrumento: 'all',
  escola: 'all',
  serie: 'all',
  turma: 'all',
  turno: 'all',
  nivel: 'all',
  disciplina: 'all',
  estados: [],
  municipios: [],
  escolas: [],
  series: [],
  turmas: [],
});

export default function NiveisProficienciaPage() {
  const { toast } = useToast();
  const [fonte, setFonte] = useState<FonteTab>('online');
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const periodoYm = useMemo(() => {
    if (selectedPeriod === 'all') return undefined;
    const n = normalizeResultsPeriodYm(selectedPeriod);
    return n === 'all' ? undefined : n;
  }, [selectedPeriod]);

  const [online, setOnline] = useState<BranchState>(initialBranch);
  const [cartao, setCartao] = useState<BranchState>(initialBranch);
  const branch = fonte === 'online' ? online : cartao;
  const setBranch = fonte === 'online' ? setOnline : setCartao;

  const [loadingFilters, setLoadingFilters] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [report, setReport] = useState<ProficiencyLevelsResponse | null>(null);
  const [disciplinas, setDisciplinas] = useState<FilterEntity[]>([]);
  const [maxPerHomogeneousClass, setMaxPerHomogeneousClass] = useState(15);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const turnos = useMemo(() => deriveTurnos(branch.turmas), [branch.turmas]);

  const canLoad =
    branch.estado !== 'all' &&
    branch.municipio !== 'all' &&
    branch.instrumento !== 'all';

  const patchBranch = useCallback(
    (patch: Partial<BranchState>) => {
      setBranch((prev) => ({ ...prev, ...patch }));
    },
    [setBranch]
  );

  // Reset downstream when period changes
  useEffect(() => {
    setOnline((prev) => ({
      ...initialBranch(),
      estados: prev.estados,
    }));
    setCartao((prev) => ({
      ...initialBranch(),
      estados: prev.estados,
    }));
    setDisciplinas([]);
    setReport(null);
  }, [selectedPeriod]);

  // Load estados (both branches)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingFilters(true);
        const [oData, cData] = await Promise.all([
          fetchEvaluationFilterOptions({ ...(periodoYm ? { periodo: periodoYm } : {}) }),
          fetchAnswerSheetFilterOptions({ ...(periodoYm ? { periodo: periodoYm } : {}) }),
        ]);
        if (cancelled) return;
        setOnline((prev) => ({ ...prev, estados: normEntities(oData.estados) }));
        setCartao((prev) => ({ ...prev, estados: normEntities(cData.estados) }));
      } catch {
        if (!cancelled) {
          toast({
            title: 'Erro',
            description: 'Não foi possível carregar estados.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoadingFilters(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [periodoYm, toast]);

  // Cascade: municipio
  useEffect(() => {
    if (branch.estado === 'all') {
      patchBranch({ municipios: [], municipio: 'all' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadingFilters(true);
        const data =
          fonte === 'online'
            ? await fetchEvaluationFilterOptions({
                estado: branch.estado,
                ...(periodoYm ? { periodo: periodoYm } : {}),
              })
            : await fetchAnswerSheetFilterOptions({
                estado: branch.estado,
                ...(periodoYm ? { periodo: periodoYm } : {}),
              });
        if (!cancelled) patchBranch({ municipios: normEntities(data.municipios) });
      } catch {
        if (!cancelled) patchBranch({ municipios: [] });
      } finally {
        if (!cancelled) setLoadingFilters(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cascade only on estado/fonte/periodo
  }, [branch.estado, fonte, periodoYm]);

  // Cascade: escolas / series when instrumento set
  useEffect(() => {
    if (
      branch.estado === 'all' ||
      branch.municipio === 'all' ||
      branch.instrumento === 'all'
    ) {
      patchBranch({ escolas: [], series: [], turmas: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadingFilters(true);
        const base =
          fonte === 'online'
            ? {
                estado: branch.estado,
                municipio: branch.municipio,
                avaliacao: branch.instrumento,
                ...(periodoYm ? { periodo: periodoYm } : {}),
              }
            : {
                estado: branch.estado,
                municipio: branch.municipio,
                gabarito: branch.instrumento,
                ...(periodoYm ? { periodo: periodoYm } : {}),
              };
        const data =
          fonte === 'online'
            ? await fetchEvaluationFilterOptions(base)
            : await fetchAnswerSheetFilterOptions(base);
        if (!cancelled) {
          const seriesRaw =
            Array.isArray(data.series) && data.series.length
              ? data.series
              : data.series_disponiveis;
          patchBranch({
            escolas: normEntities(data.escolas),
            series: normEntities(seriesRaw),
          });
        }
      } catch {
        if (!cancelled) patchBranch({ escolas: [], series: [] });
      } finally {
        if (!cancelled) setLoadingFilters(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch.estado, branch.municipio, branch.instrumento, fonte, periodoYm]);

  // Cascade: turmas when serie/escola change
  useEffect(() => {
    if (
      branch.estado === 'all' ||
      branch.municipio === 'all' ||
      branch.instrumento === 'all' ||
      branch.serie === 'all'
    ) {
      patchBranch({ turmas: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadingFilters(true);
        const base =
          fonte === 'online'
            ? {
                estado: branch.estado,
                municipio: branch.municipio,
                avaliacao: branch.instrumento,
                escola: branch.escola !== 'all' ? branch.escola : undefined,
                serie: branch.serie,
                ...(periodoYm ? { periodo: periodoYm } : {}),
              }
            : {
                estado: branch.estado,
                municipio: branch.municipio,
                gabarito: branch.instrumento,
                escola: branch.escola !== 'all' ? branch.escola : undefined,
                serie: branch.serie,
                ...(periodoYm ? { periodo: periodoYm } : {}),
              };
        const data =
          fonte === 'online'
            ? await fetchEvaluationFilterOptions(base)
            : await fetchAnswerSheetFilterOptions(base);
        if (!cancelled) patchBranch({ turmas: normEntities(data.turmas) });
      } catch {
        if (!cancelled) patchBranch({ turmas: [] });
      } finally {
        if (!cancelled) setLoadingFilters(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    branch.estado,
    branch.municipio,
    branch.instrumento,
    branch.escola,
    branch.serie,
    fonte,
    periodoYm,
  ]);

  const loadReport = useCallback(async () => {
    if (
      branch.estado === 'all' ||
      branch.municipio === 'all' ||
      branch.instrumento === 'all'
    ) {
      return;
    }
    try {
      setLoadingReport(true);
      const params = {
        estado: branch.estado,
        municipio: branch.municipio,
        escola: branch.escola,
        serie: branch.serie,
        turma: branch.turma,
        turno: branch.turno,
        nivel: branch.nivel,
        disciplina: branch.disciplina,
        ...(periodoYm ? { periodo: periodoYm } : {}),
        ...(fonte === 'online'
          ? { avaliacao: branch.instrumento }
          : { gabarito: branch.instrumento }),
      };
      const data =
        fonte === 'online'
          ? await fetchProficiencyLevelsOnline(params)
          : await fetchProficiencyLevelsCartao(params);
      setReport(data);
      const nextDisciplinas = deriveDisciplinas(data);
      if (nextDisciplinas.length) setDisciplinas(nextDisciplinas);
    } catch {
      setReport(null);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar o relatório de níveis de proficiência.',
        variant: 'destructive',
      });
    } finally {
      setLoadingReport(false);
    }
  }, [
    branch.estado,
    branch.municipio,
    branch.instrumento,
    branch.escola,
    branch.serie,
    branch.turma,
    branch.turno,
    branch.nivel,
    branch.disciplina,
    fonte,
    periodoYm,
    toast,
  ]);

  useEffect(() => {
    if (!canLoad) {
      setReport(null);
      return;
    }
    void loadReport();
  }, [canLoad, loadReport]);

  const fonteLabel =
    fonte === 'online' ? 'Avaliação online' : 'Cartão-resposta';

  const handleDownloadPdf = useCallback(async () => {
    if (!report) return;
    try {
      setDownloadingPdf(true);
      await generateNiveisProficienciaPdf({
        report,
        fonteLabel,
        cityId: branch.municipio !== 'all' ? branch.municipio : report.meta?.municipio_id,
        maxPerHomogeneousClass,
      });
      toast({ title: 'PDF gerado', description: 'O download deve começar em instantes.' });
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível gerar o PDF.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingPdf(false);
    }
  }, [report, fonteLabel, branch.municipio, maxPerHomogeneousClass, toast]);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <ReportHeader
        meta={report?.meta}
        fonteLabel={fonteLabel}
        canDownloadPdf={Boolean(report)}
        downloadingPdf={downloadingPdf}
        onDownloadPdf={() => void handleDownloadPdf()}
      />

      <FiltrosPainel
        fonte={fonte}
        onFonteChange={(f) => {
          setFonte(f);
          setDisciplinas([]);
          setReport(null);
        }}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        periodoYm={periodoYm}
        loadingFilters={loadingFilters}
        loadingReport={loadingReport}
        onRefresh={() => void loadReport()}
        canLoad={canLoad}
        estado={branch.estado}
        municipio={branch.municipio}
        instrumento={branch.instrumento}
        escola={branch.escola}
        serie={branch.serie}
        turma={branch.turma}
        turno={branch.turno}
        nivel={branch.nivel}
        disciplina={branch.disciplina}
        onEstadoChange={(v) => {
          setDisciplinas([]);
          patchBranch({
            estado: v,
            municipio: 'all',
            instrumento: 'all',
            escola: 'all',
            serie: 'all',
            turma: 'all',
            disciplina: 'all',
          });
        }}
        onMunicipioChange={(v) => {
          setDisciplinas([]);
          patchBranch({
            municipio: v,
            instrumento: 'all',
            escola: 'all',
            serie: 'all',
            turma: 'all',
            disciplina: 'all',
          });
        }}
        onInstrumentoChange={(v) => {
          setDisciplinas([]);
          patchBranch({
            instrumento: v,
            escola: 'all',
            serie: 'all',
            turma: 'all',
            disciplina: 'all',
          });
        }}
        onEscolaChange={(v) =>
          patchBranch({ escola: v, serie: 'all', turma: 'all' })
        }
        onSerieChange={(v) => patchBranch({ serie: v, turma: 'all' })}
        onTurmaChange={(v) => patchBranch({ turma: v })}
        onTurnoChange={(v) => patchBranch({ turno: v })}
        onNivelChange={(v) => patchBranch({ nivel: v })}
        onDisciplinaChange={(v) => patchBranch({ disciplina: v })}
        estados={branch.estados}
        municipios={branch.municipios}
        escolas={branch.escolas}
        series={branch.series}
        turmas={branch.turmas}
        turnos={turnos}
        disciplinas={disciplinas}
      />

      {!canLoad ? (
        <p className="mt-8 rounded-lg border border-dashed border-border/80 px-4 py-10 text-center text-sm text-muted-foreground">
          Selecione estado, município e {fonte === 'online' ? 'avaliação' : 'gabarito'} para
          carregar o relatório.
        </p>
      ) : loadingReport && !report ? (
        <div className="mt-10 flex justify-center text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : report ? (
        <>
          <KpiGrid indicadores={report.indicadores} meta={report.meta} />
          <EscalaProficiencia distribuicao={report.distribuicao} />
          <ColunasNivel alunos={report.alunos} />
          <RelatorioTurmas porTurma={report.por_turma} />
          <TurmasHomogeneas
            alunos={report.alunos}
            maxPerClass={maxPerHomogeneousClass}
            onMaxPerClassChange={setMaxPerHomogeneousClass}
          />
          <HabilidadesSection habilidades={report.habilidades} />
          <footer className="mt-10 border-t border-border/80 py-4 text-center text-xs text-muted-foreground">
            © Afirme Play
            {report.meta?.rede || report.meta?.municipio
              ? ` · ${[report.meta?.rede, report.meta?.municipio].filter(Boolean).join(' · ')}`
              : ''}
          </footer>
        </>
      ) : null}
    </main>
  );
}
