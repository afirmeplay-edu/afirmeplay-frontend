import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TrendingUp, Users, Filter, RefreshCw, Download, X, Check, AlertCircle, Search, Calendar, List, Table } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';
import { AnswerSheetComparisonApiService } from '@/services/answer-sheet/answerSheetComparisonApi';
import type { ComparisonResponse } from '@/services/evaluation/evaluationComparisonApi';
import { EvolutionCharts } from '@/components/evolution/EvolutionCharts';
import type { ProcessedEvolutionData } from '@/components/evolution/EvolutionCharts';
import { processComparisonData } from '@/utils/evolution/evolutionDataProcessor';
import { generateEvolutionPDFFromHTML } from '@/utils/evolution/evolutionPdfService';
import { EvolutionScopeMetaLines } from '@/components/evolution/EvolutionEvaluationsScopeList';

interface State {
  id: string;
  name: string;
}

interface Municipality {
  id: string;
  name: string;
}

interface School {
  id: string;
  name: string;
}

interface Grade {
  id: string;
  name: string;
}

interface ClassItem {
  id: string;
  name: string;
}

interface GabaritoItem {
  id: string;
  titulo: string;
  data?: string | null;
}

const MAX_GABARITOS = 10;

function isoDateToBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

function extractApiError(error: unknown): string {
  if (error && typeof error === 'object') {
    if ('response' in error) {
      const axiosError = error as { response?: { data?: { error?: string; message?: string } } };
      return axiosError.response?.data?.error || axiosError.response?.data?.message || '';
    }
    if ('message' in error && typeof (error as { message: unknown }).message === 'string') {
      return (error as { message: string }).message;
    }
  }
  return '';
}

type EvolutionCartaoRespostaProps = { hidePageHeading?: boolean };

export default function EvolutionCartaoResposta({ hidePageHeading = false }: EvolutionCartaoRespostaProps) {
  const { autoLogin } = useAuth();
  const { toast } = useToast();

  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('all');
  const [selectedSchool, setSelectedSchool] = useState<string>('all');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [periodStart, setPeriodStart] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');
  const [gabaritoSearch, setGabaritoSearch] = useState<string>('');

  const [selectedGabaritosForComparison, setSelectedGabaritosForComparison] = useState<GabaritoItem[]>([]);
  const [availableGabaritosForPicker, setAvailableGabaritosForPicker] = useState<GabaritoItem[]>([]);

  const [states, setStates] = useState<State[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [comparisonData, setComparisonData] = useState<ComparisonResponse | null>(null);
  const [processedData, setProcessedData] = useState<ProcessedEvolutionData | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [comparisonProgress, setComparisonProgress] = useState(0);

  const lastComparisonIdsRef = useRef<string>('');
  const selectedIdsRef = useRef<string>('');
  const prevMunicipalityRef = useRef<string>(selectedMunicipality);
  const prevSchoolRef = useRef<string>(selectedSchool);
  const prevGradeRef = useRef<string>(selectedGrade);

  useEffect(() => {
    if (!isLoadingComparison) {
      setComparisonProgress(0);
      return;
    }
    setComparisonProgress(0);
    const t = setInterval(() => {
      setComparisonProgress((prev) => (prev >= 90 ? 15 : prev + 15));
    }, 400);
    return () => clearInterval(t);
  }, [isLoadingComparison]);

  const loadInitialFilters = useCallback(async () => {
    try {
      setIsLoadingFilters(true);
      const response = await AnswerSheetComparisonApiService.getEvolucaoOpcoesFiltros({});
      const list = response.estados ?? [];
      setStates(
        list.map((s) => ({
          id: s.id,
          name: s.nome ?? s.name ?? s.id,
        }))
      );
    } catch (error) {
      console.error('Erro ao carregar filtros iniciais (cartão-resposta):', error);
      toast({
        title: 'Erro ao carregar filtros',
        description: 'Não foi possível carregar os filtros. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingFilters(false);
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const ensureAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        try {
          await autoLogin();
        } catch (error) {
          console.error('Erro no login automático:', error);
          toast({
            title: 'Erro de Autenticação',
            description: 'Não foi possível fazer login automático. Verifique suas credenciais.',
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }
      }
      await loadInitialFilters();
    };
    ensureAuth();
  }, [autoLogin, loadInitialFilters, toast]);

  useEffect(() => {
    const loadMunicipalities = async () => {
      if (selectedState !== 'all') {
        try {
          setIsLoadingFilters(true);
          const response = await AnswerSheetComparisonApiService.getEvolucaoOpcoesFiltros({
            estado: selectedState,
          });
          const list = response.municipios ?? [];
          const newMunicipalities = list.map((m) => ({
            id: m.id,
            name: m.nome ?? m.name ?? m.id,
          }));
          setMunicipalities(newMunicipalities);
          const currentExists = newMunicipalities.some((m) => m.id === selectedMunicipality);
          if (!currentExists && selectedMunicipality !== 'all') {
            setSelectedMunicipality('all');
            setSelectedSchool('all');
            setSelectedGrade('all');
            setSelectedClass('all');
            setSelectedGabaritosForComparison([]);
          }
        } catch (error) {
          console.error('Erro ao carregar municípios:', error);
          toast({
            title: 'Erro ao carregar municípios',
            description: 'Não foi possível carregar os municípios. Tente novamente.',
            variant: 'destructive',
          });
          setMunicipalities([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setMunicipalities([]);
        setSelectedMunicipality('all');
        setSelectedSchool('all');
        setSelectedGrade('all');
        setSelectedClass('all');
        setAvailableGabaritosForPicker([]);
        setSelectedGabaritosForComparison([]);
      }
    };

    loadMunicipalities();
  }, [selectedState, selectedMunicipality, toast]);

  useEffect(() => {
    if (prevMunicipalityRef.current !== selectedMunicipality) {
      prevMunicipalityRef.current = selectedMunicipality;
      setSelectedSchool('all');
      setSelectedGrade('all');
      setSelectedClass('all');
      setSelectedGabaritosForComparison([]);
    }
  }, [selectedMunicipality]);

  useEffect(() => {
    if (prevSchoolRef.current !== selectedSchool) {
      prevSchoolRef.current = selectedSchool;
      setSelectedGrade('all');
      setSelectedClass('all');
    }
  }, [selectedSchool]);

  useEffect(() => {
    if (prevGradeRef.current !== selectedGrade) {
      prevGradeRef.current = selectedGrade;
      setSelectedClass('all');
    }
  }, [selectedGrade]);

  useEffect(() => {
    const loadSchools = async () => {
      if (selectedState !== 'all' && selectedMunicipality !== 'all') {
        try {
          setIsLoadingFilters(true);
          const response = await AnswerSheetComparisonApiService.getEvolucaoOpcoesFiltros({
            estado: selectedState,
            municipio: selectedMunicipality,
          });
          const list = response.escolas ?? [];
          setSchools(
            list.map((s) => ({
              id: s.id,
              name: s.nome ?? s.name ?? s.id,
            }))
          );
        } catch (error) {
          console.error('Erro ao carregar escolas:', error);
          setSchools([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setSchools([]);
      }
    };

    loadSchools();
  }, [selectedState, selectedMunicipality]);

  useEffect(() => {
    const loadGrades = async () => {
      if (selectedState !== 'all' && selectedMunicipality !== 'all' && selectedSchool !== 'all') {
        try {
          setIsLoadingFilters(true);
          const response = await AnswerSheetComparisonApiService.getEvolucaoOpcoesFiltros({
            estado: selectedState,
            municipio: selectedMunicipality,
            escola: selectedSchool,
          });
          const list = response.series ?? [];
          setGrades(
            list.map((s) => ({
              id: s.id,
              name: s.nome ?? s.name ?? s.id,
            }))
          );
        } catch (error) {
          console.error('Erro ao carregar séries:', error);
          setGrades([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setGrades([]);
      }
    };

    loadGrades();
  }, [selectedState, selectedMunicipality, selectedSchool]);

  useEffect(() => {
    const loadClasses = async () => {
      if (
        selectedState !== 'all' &&
        selectedMunicipality !== 'all' &&
        selectedSchool !== 'all' &&
        selectedGrade !== 'all'
      ) {
        try {
          setIsLoadingFilters(true);
          const response = await AnswerSheetComparisonApiService.getEvolucaoOpcoesFiltros({
            estado: selectedState,
            municipio: selectedMunicipality,
            escola: selectedSchool,
            serie: selectedGrade,
          });
          const list = response.turmas ?? [];
          setClasses(
            list.map((c) => {
              const nome = c.nome ?? c.name ?? c.id;
              const label = c.shift ? `${nome} (${c.shift})` : nome;
              return { id: c.id, name: label };
            })
          );
        } catch (error) {
          console.error('Erro ao carregar turmas:', error);
          setClasses([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setClasses([]);
      }
    };

    loadClasses();
  }, [selectedState, selectedMunicipality, selectedSchool, selectedGrade]);

  useEffect(() => {
    const loadGabaritos = async () => {
      const estadoValido = selectedState && selectedState !== 'all';
      const municipioValido = selectedMunicipality && selectedMunicipality !== 'all';
      if (!estadoValido || !municipioValido) {
        setAvailableGabaritosForPicker([]);
        return;
      }

      setIsLoadingFilters(true);
      try {
        const response = await AnswerSheetComparisonApiService.getEvolucaoGabaritos({
          estado: selectedState,
          municipio: selectedMunicipality,
          escola: selectedSchool === 'all' ? undefined : selectedSchool,
          serie: selectedGrade === 'all' ? undefined : selectedGrade,
          turma: selectedClass === 'all' ? undefined : selectedClass,
          data_inicio: periodStart ? isoDateToBR(periodStart) : undefined,
          data_fim: periodEnd ? isoDateToBR(periodEnd) : undefined,
          nome: gabaritoSearch.trim() || undefined,
        });

        const seen = new Set<string>();
        const list: GabaritoItem[] = (response.gabaritos ?? [])
          .filter((g) => {
            if (!g?.id) return false;
            const key = String(g.id).trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((g) => ({
            id: String(g.id),
            titulo: g.titulo ?? g.id,
            data: g.data ?? null,
          }));

        setAvailableGabaritosForPicker(list);
      } catch (error) {
        console.error('Erro ao carregar gabaritos:', error);
        setAvailableGabaritosForPicker([]);
        toast({
          title: 'Erro ao carregar gabaritos',
          description: 'Não foi possível carregar os gabaritos. Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingFilters(false);
      }
    };

    loadGabaritos();
  }, [
    selectedState,
    selectedMunicipality,
    selectedSchool,
    selectedGrade,
    selectedClass,
    periodStart,
    periodEnd,
    gabaritoSearch,
    toast,
  ]);

  const filteredGabaritos = useMemo(() => {
    const term = gabaritoSearch.trim().toLowerCase();
    if (!term) return [...availableGabaritosForPicker];
    return availableGabaritosForPicker.filter((g) => {
      const titulo = (g.titulo ?? '').toLowerCase();
      const id = (g.id ?? '').toLowerCase();
      const data = (g.data ?? '').toLowerCase();
      return titulo.includes(term) || id.includes(term) || data.includes(term);
    });
  }, [availableGabaritosForPicker, gabaritoSearch]);

  const handleAddGabarito = useCallback(
    (gabaritoId: string) => {
      const gabarito = availableGabaritosForPicker.find((g) => g.id === gabaritoId);
      if (!gabarito) return;

      setSelectedGabaritosForComparison((prev) => {
        if (prev.length >= MAX_GABARITOS) {
          toast({
            title: 'Limite de gabaritos atingido',
            description: `Você pode comparar no máximo ${MAX_GABARITOS} gabaritos por vez. Remova um antes de adicionar outro.`,
            variant: 'destructive',
          });
          return prev;
        }
        if (prev.some((g) => g.id === gabaritoId)) {
          toast({
            title: 'Gabarito já adicionado',
            description: 'Este gabarito já está na lista de comparação.',
            variant: 'destructive',
          });
          return prev;
        }
        const newState = [...prev, gabarito];
        const remaining = MAX_GABARITOS - newState.length;
        toast({
          title: 'Gabarito adicionado',
          description:
            prev.length === 0
              ? `"${gabarito.titulo}" foi adicionado. Selecione mais um gabarito para comparar.${remaining > 0 ? ` (${remaining} restantes)` : ''}`
              : `"${gabarito.titulo}" foi adicionado.${remaining > 0 ? ` (${remaining} restantes)` : ' (limite atingido)'}`,
        });
        return newState;
      });
    },
    [availableGabaritosForPicker, toast]
  );

  const handleRemoveGabarito = useCallback(
    (gabaritoId: string) => {
      setSelectedGabaritosForComparison((prev) => prev.filter((g) => g.id !== gabaritoId));
      toast({
        title: 'Gabarito removido',
        description: 'O gabarito foi removido da comparação.',
      });
    },
    [toast]
  );

  const handleComparisonError = useCallback(
    (errorMessage: string) => {
      if (errorMessage.includes('não possui resultados calculados')) {
        setComparisonError('Gabarito sem resultados calculados');
        toast({
          title: 'Gabarito sem resultados',
          description:
            'Um ou mais gabaritos selecionados ainda não possuem resultados calculados. Selecione apenas gabaritos corrigidos.',
          variant: 'destructive',
        });
      } else if (errorMessage.includes('Gabarito') || errorMessage.includes('gabarito')) {
        setComparisonError(errorMessage);
        toast({ title: 'Erro no gabarito', description: errorMessage, variant: 'destructive' });
      } else {
        setComparisonError('Erro ao carregar dados de comparação');
        toast({
          title: 'Erro na comparação',
          description: 'Não foi possível comparar os gabaritos. Tente novamente.',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  const selectedIdsKey = useMemo(
    () => selectedGabaritosForComparison.map((g) => g.id).sort().join(','),
    [selectedGabaritosForComparison]
  );

  useEffect(() => {
    selectedIdsRef.current = selectedIdsKey;

    const autoCompare = async () => {
      if (selectedGabaritosForComparison.length < 2) {
        setComparisonData(null);
        setProcessedData(null);
        setComparisonError(null);
        lastComparisonIdsRef.current = '';
        return;
      }

      const currentIds = selectedGabaritosForComparison.map((g) => g.id).sort().join(',');
      if (currentIds !== selectedIdsKey) return;
      if (currentIds === lastComparisonIdsRef.current) return;

      lastComparisonIdsRef.current = currentIds;
      const requestedIds = currentIds;

      setIsLoadingComparison(true);
      setComparisonError(null);

      try {
        const gabaritoIds = Array.from(new Set(selectedGabaritosForComparison.map((g) => g.id)));
        const cityId = selectedMunicipality !== 'all' ? selectedMunicipality : undefined;
        const comparison = await AnswerSheetComparisonApiService.compareAnswerSheets(gabaritoIds, cityId);

        if (selectedIdsRef.current !== requestedIds) return;
        setComparisonData(comparison);

        const processed = processComparisonData(comparison);
        if (selectedIdsRef.current !== requestedIds) return;
        setProcessedData(processed);

        toast({
          title: 'Comparação atualizada',
          description: `Comparando ${comparison.total_evaluations} gabaritos com ${comparison.total_comparisons} comparações.`,
        });
      } catch (error: unknown) {
        console.error('Erro na comparação automática:', error);
        const errorMessage = extractApiError(error);
        if (selectedIdsRef.current !== requestedIds) return;
        handleComparisonError(errorMessage);
      } finally {
        setIsLoadingComparison(false);
      }
    };

    autoCompare();
  }, [selectedIdsKey, selectedGabaritosForComparison, selectedMunicipality, toast, handleComparisonError]);

  const handleExportPdf = async () => {
    if (!processedData || !comparisonData) {
      toast({
        title: 'Dados insuficientes',
        description: 'Não há dados disponíveis para gerar o relatório.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsGeneratingPDF(true);
      const filterInfo = {
        state:
          selectedState !== 'all'
            ? { id: selectedState, name: states.find((s) => s.id === selectedState)?.name ?? selectedState }
            : undefined,
        municipality:
          selectedMunicipality !== 'all'
            ? {
                id: selectedMunicipality,
                name: municipalities.find((m) => m.id === selectedMunicipality)?.name ?? selectedMunicipality,
              }
            : undefined,
        school:
          selectedSchool !== 'all'
            ? { id: selectedSchool, name: schools.find((s) => s.id === selectedSchool)?.name ?? selectedSchool }
            : undefined,
        grade:
          selectedGrade !== 'all'
            ? { id: selectedGrade, name: grades.find((g) => g.id === selectedGrade)?.name ?? selectedGrade }
            : undefined,
        class:
          selectedClass !== 'all'
            ? { id: selectedClass, name: classes.find((c) => c.id === selectedClass)?.name ?? selectedClass }
            : undefined,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
      };

      await generateEvolutionPDFFromHTML(
        processedData,
        comparisonData,
        processedData.evaluationNames,
        filterInfo,
        'gabaritos'
      );
      toast({
        title: 'PDF gerado com sucesso!',
        description: 'O relatório foi salvo no seu dispositivo.',
      });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast({
        title: 'Erro ao gerar PDF',
        description: 'Não foi possível gerar o relatório. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleExportExcel = async () => {
    if (selectedGabaritosForComparison.length < 2) {
      toast({
        title: 'Selecione pelo menos 2 gabaritos',
        description: 'Para exportar, você precisa ter pelo menos 2 gabaritos selecionados.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsExportingExcel(true);
      const gabaritoIds = Array.from(new Set(selectedGabaritosForComparison.map((g) => g.id)));
      const municipalityName =
        selectedMunicipality !== 'all'
          ? municipalities.find((m) => m.id === selectedMunicipality)?.name
          : undefined;
      const stateName =
        selectedState !== 'all' ? states.find((s) => s.id === selectedState)?.name : undefined;

      const { data, headers } = await AnswerSheetComparisonApiService.exportEvolutionExcel(
        {
          gabarito_ids: gabaritoIds,
          municipality: municipalityName,
          state: stateName,
        },
        selectedMunicipality !== 'all' ? selectedMunicipality : undefined
      );

      const blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const contentDisposition = headers['content-disposition'];
      let fileName = `exportacao-evolucao-cartoes-${new Date().toISOString().split('T')[0]}.xlsx`;
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (fileNameMatch?.[1]) {
          fileName = fileNameMatch[1].replace(/['"]/g, '');
        }
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Excel exportado com sucesso!',
        description: `Arquivo gerado para ${gabaritoIds.length} gabaritos.`,
      });
    } catch (error: unknown) {
      console.error('Erro ao exportar Excel:', error);
      let errorMessage = 'Não foi possível exportar os gabaritos.';
      const err = error as { response?: { data?: Blob | { message?: string }; status?: number } };
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const errorData = JSON.parse(text) as { message?: string; error?: string };
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          /* ignore */
        }
      } else if (err.response?.data && typeof err.response.data === 'object' && 'message' in err.response.data) {
        errorMessage = String((err.response.data as { message: string }).message);
      }
      toast({
        title: 'Erro ao exportar Excel',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <div className={hidePageHeading ? 'space-y-6' : 'container mx-auto px-4 py-6 space-y-6'}>
      {!hidePageHeading && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
              <TrendingUp className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 shrink-0" />
              Análise de Evolução — Cartão-resposta
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Compare múltiplos gabaritos corrigidos e acompanhe a evolução dos resultados ao longo do tempo.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2 w-full sm:w-auto sm:justify-end">
        <Button variant="outline" onClick={() => window.location.reload()} disabled={isLoadingComparison}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingComparison ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>

        {selectedGabaritosForComparison.length > 0 && (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border-0"
              >
                <List className="h-4 w-4 mr-2" />
                Gabaritos Selecionados ({selectedGabaritosForComparison.length})
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-lg">
                    <Users className="h-6 w-6 text-white" />
                  </div>
                  Gabaritos Selecionados
                </DialogTitle>
                <DialogDescription>
                  {selectedGabaritosForComparison.length} de {MAX_GABARITOS}{' '}
                  {selectedGabaritosForComparison.length === 1
                    ? 'gabarito selecionado para comparação'
                    : 'gabaritos selecionados para comparação'}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {selectedGabaritosForComparison.map((gabarito, index) => (
                  <div
                    key={gabarito.id}
                    className="group relative p-4 bg-gradient-to-br from-blue-50 dark:from-blue-950/30 to-indigo-50 dark:to-indigo-950/30 rounded-xl border-2 border-blue-200 dark:border-blue-800"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-foreground text-sm leading-tight mb-1">{gabarito.titulo}</h4>
                          {gabarito.data ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {gabarito.data}
                            </div>
                          ) : null}
                          {(() => {
                            const scopeMeta = comparisonData?.evaluations?.find((e) => e.id === gabarito.id);
                            return scopeMeta ? <EvolutionScopeMetaLines evaluation={scopeMeta} /> : null;
                          })()}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveGabarito(gabarito.id)}
                        className="hover:bg-red-100 dark:hover:bg-red-950/30 hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        )}

        {comparisonData && processedData && (
          <>
            <Button
              onClick={handleExportPdf}
              disabled={isGeneratingPDF || isExportingExcel}
              className="w-full sm:w-auto bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
            >
              <Download className={`h-4 w-4 mr-2 ${isGeneratingPDF ? 'animate-spin' : ''}`} />
              {isGeneratingPDF ? 'Gerando PDF...' : 'Exportar PDF'}
            </Button>
            <Button
              onClick={handleExportExcel}
              disabled={isGeneratingPDF || isExportingExcel || selectedGabaritosForComparison.length < 2}
              className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            >
              <Table className={`h-4 w-4 mr-2 ${isExportingExcel ? 'animate-spin' : ''}`} />
              {isExportingExcel ? 'Exportando...' : 'Exportar Excel'}
            </Button>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <Select value={selectedState} onValueChange={setSelectedState} disabled={isLoadingFilters}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {states.map((state) => (
                    <SelectItem key={state.id} value={state.id}>
                      {state.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Município</label>
              <Select
                value={selectedMunicipality}
                onValueChange={setSelectedMunicipality}
                disabled={isLoadingFilters || selectedState === 'all'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o município" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {municipalities.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Escola</label>
              <Select
                value={selectedSchool}
                onValueChange={setSelectedSchool}
                disabled={isLoadingFilters || selectedMunicipality === 'all'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a escola" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Série</label>
              <Select
                value={selectedGrade}
                onValueChange={setSelectedGrade}
                disabled={isLoadingFilters || selectedSchool === 'all'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a série" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {grades.map((grade) => (
                    <SelectItem key={grade.id} value={grade.id}>
                      {grade.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Turma</label>
              <Select
                value={selectedClass}
                onValueChange={setSelectedClass}
                disabled={isLoadingFilters || selectedGrade === 'all'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a turma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {classes.map((classItem) => (
                    <SelectItem key={classItem.id} value={classItem.id}>
                      {classItem.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedMunicipality !== 'all' && (
            <div className="mt-6 pt-6 border-t border-border">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Data Início</label>
                  <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Data Fim</label>
                  <Input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    min={periodStart}
                  />
                </div>
              </div>
            </div>
          )}

          {selectedMunicipality !== 'all' && (
            <div className="mt-6 pt-6 border-t border-border">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-foreground mb-1">Gabaritos Disponíveis</h3>
                <p className="text-sm text-muted-foreground">Selecione os gabaritos corrigidos para comparação</p>
              </div>

              <div className="flex items-center gap-3 mb-4">
                {isLoadingFilters && (
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Carregando gabaritos...</span>
                  </div>
                )}
                {!isLoadingFilters && filteredGabaritos.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400">
                      {filteredGabaritos.length} encontrado(s)
                    </Badge>
                    {selectedGabaritosForComparison.length > 0 && (
                      <Badge variant="outline" className="bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400">
                        {selectedGabaritosForComparison.length}/{MAX_GABARITOS} selecionado(s)
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {!isLoadingFilters && availableGabaritosForPicker.length > 0 && (
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Buscar por nome do gabarito..."
                      value={gabaritoSearch}
                      onChange={(e) => setGabaritoSearch(e.target.value)}
                      className="pl-9 h-10"
                    />
                  </div>
                </div>
              )}

              {isLoadingFilters ? (
                <div className="flex items-center justify-center py-12 border-2 border-dashed border-border rounded-xl bg-muted/50">
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
                </div>
              ) : filteredGabaritos.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                  {filteredGabaritos.map((gabarito) => {
                    const isAlreadyAdded = selectedGabaritosForComparison.some((g) => g.id === gabarito.id);
                    return (
                      <div
                        key={gabarito.id}
                        className={`group relative p-4 rounded-lg border transition-all duration-200 ${
                          isAlreadyAdded
                            ? 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800'
                            : selectedGabaritosForComparison.length >= MAX_GABARITOS
                              ? 'bg-muted/50 border-border opacity-50 cursor-not-allowed'
                              : 'bg-card border-border hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={isAlreadyAdded}
                            disabled={!isAlreadyAdded && selectedGabaritosForComparison.length >= MAX_GABARITOS}
                            onCheckedChange={(checked) => {
                              if (checked && !isAlreadyAdded) handleAddGabarito(gabarito.id);
                              else if (!checked && isAlreadyAdded) handleRemoveGabarito(gabarito.id);
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-foreground text-sm leading-tight mb-1">{gabarito.titulo}</h4>
                            {gabarito.data ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {gabarito.data}
                              </div>
                            ) : null}
                            {(() => {
                              const scopeMeta = comparisonData?.evaluations?.find((e) => e.id === gabarito.id);
                              return scopeMeta ? <EvolutionScopeMetaLines evaluation={scopeMeta} /> : null;
                            })()}
                          </div>
                          {isAlreadyAdded && (
                            <Badge variant="outline" className="bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-400">
                              <Check className="h-3 w-3 mr-1" />
                              Selecionado
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-border rounded-xl bg-muted/50">
                  <TrendingUp className="h-8 w-8 text-muted-foreground mb-4" />
                  <h4 className="text-lg font-medium text-foreground mb-2">Nenhum gabarito encontrado</h4>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    Ajuste os filtros ou verifique se existem gabaritos corrigidos para os critérios selecionados.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoadingComparison && (
        <Card className="shadow-lg border-0 bg-card/90 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 space-y-6">
            <RefreshCw className="h-10 w-10 animate-spin text-blue-600" />
            <h3 className="text-xl font-semibold text-foreground">Processando Análise</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Estamos comparando seus gabaritos e gerando insights detalhados...
            </p>
            <div className="w-full max-w-sm">
              <Progress value={comparisonProgress} className="h-2" aria-label="Carregando comparação" />
            </div>
          </CardContent>
        </Card>
      )}

      {comparisonError && (
        <Card className="shadow-lg border-0 bg-card/90 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-10 w-10 text-red-500 mb-6" />
            <h3 className="text-xl font-semibold text-foreground mb-2">Erro na Análise</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">{comparisonError}</p>
            <Button variant="outline" onClick={() => setComparisonError(null)}>
              Tentar Novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {processedData && !isLoadingComparison && (
        <EvolutionCharts data={processedData} isLoading={false} instrumentLabel="gabaritos" />
      )}

      {isLoading && isLoadingFilters && selectedState === 'all' && (
        <div className="flex justify-center py-8 text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          Carregando...
        </div>
      )}
    </div>
  );
}
