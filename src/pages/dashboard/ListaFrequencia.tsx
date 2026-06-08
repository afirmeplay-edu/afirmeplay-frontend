import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { ClipboardList, Filter, Loader2, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { FormFiltersApiService } from '@/services/formFiltersApi';
import { EvaluationResultsApiService, REPORT_ENTITY_TYPE_ANSWER_SHEET } from '@/services/evaluation/evaluationResultsApi';
import { EvaluationInstrumentPicker } from '@/components/filters';
import {
  getListaFrequencia,
  getListaFrequenciaPorAvaliacao,
  getListaFrequenciaPorAvaliacaoTodasTurmas,
  getListaFrequenciaPorGabarito,
  getListaFrequenciaPorGabaritoTodasTurmas,
  getListaFrequenciaPorMunicipioTodasTurmas,
} from '@/services/listaFrequenciaApi';
import type {
  ListaFrequenciaResponse,
  Estudante,
} from '@/types/lista-frequencia';
import {
  buildListaFrequenciaHierarchyPath,
  createSingleListaFrequenciaPdfBlob,
  getSerieTurmaDisplay,
} from '@/services/reports/listaFrequenciaPdf';
import { downloadBlob, generateZipBlob, sanitizePathSegment } from '@/services/reports/hierarchicalDownload';
import { getClassShiftLabel } from '@/lib/classShift';

const STATUS_ORDER = ['P', 'A', 'T', 'NE', 'SE', 'SS', 'I'];

function formatLegenda(legenda: Record<string, string>): string {
  return Object.entries(legenda)
    .map(([cod, desc]) => `${cod} = ${desc}`)
    .join('; ');
}

export default function ListaFrequencia() {
  const { toast } = useToast();
  const [estados, setEstados] = useState<{ id: string; name: string }[]>([]);
  const [municipios, setMunicipios] = useState<{ id: string; name: string }[]>([]);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [series, setSeries] = useState<{ id: string; name: string }[]>([]);
  const [turmas, setTurmas] = useState<{ id: string; name: string }[]>([]);

  const [selectedEstado, setSelectedEstado] = useState('all');
  const [selectedMunicipio, setSelectedMunicipio] = useState('all');
  const [selectedSchool, setSelectedSchool] = useState('all');
  const [selectedSerie, setSelectedSerie] = useState('all');
  const [selectedTurma, setSelectedTurma] = useState('all');

  const [isLoadingEstados, setIsLoadingEstados] = useState(false);
  const [isLoadingMunicipios, setIsLoadingMunicipios] = useState(false);
  const [isLoadingSchools, setIsLoadingSchools] = useState(false);
  const [isLoadingSeries, setIsLoadingSeries] = useState(false);
  const [isLoadingTurmas, setIsLoadingTurmas] = useState(false);
  const [isLoadingLista, setIsLoadingLista] = useState(false);

  const [data, setData] = useState<ListaFrequenciaResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const [modoLista, setModoLista] = useState<'turma' | 'avaliacao' | 'cartao_resposta'>('turma');
  const [avaliacoes, setAvaliacoes] = useState<{ id: string; titulo: string }[]>([]);
  const [selectedAvaliacaoId, setSelectedAvaliacaoId] = useState('all');
  const [isLoadingAvaliacoes, setIsLoadingAvaliacoes] = useState(false);
  /** Turmas vinculadas à avaliação/cartão selecionado (GET /test/:id/classes ou opções cartão resposta). */
  const [turmasAvaliacao, setTurmasAvaliacao] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingTurmasAvaliacao, setIsLoadingTurmasAvaliacao] = useState(false);
  /** Só exibir ausência (A) quando a prova já tiver expirado. Por turma = null (não aplicável). */
  const [provaExpirada, setProvaExpirada] = useState<boolean | null>(null);
  /** Nome da avaliação customizado para impressão/PDF (editável antes de imprimir). */
  const [nomeAvaliacaoImpressao, setNomeAvaliacaoImpressao] = useState('');

  const isModoAplicada = modoLista === 'avaliacao' || modoLista === 'cartao_resposta';
  const tipoListaAplicada = modoLista === 'cartao_resposta' ? 'prova_fisica' : 'avaliacao';
  const labelItemAplicado = modoLista === 'cartao_resposta' ? 'Cartão resposta' : 'Avaliação';

  // Carregar estados
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoadingEstados(true);
      try {
        const list = await FormFiltersApiService.getFormFilterStates();
        if (!cancelled) {
          setEstados(list.map((e) => ({ id: e.id, name: e.nome })));
        }
      } catch (err) {
        if (!cancelled) {
          toast({ title: 'Erro', description: 'Não foi possível carregar os estados.', variant: 'destructive' });
        }
      } finally {
        if (!cancelled) setIsLoadingEstados(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  // Limpar dependentes ao mudar estado
  useEffect(() => {
    if (!selectedEstado || selectedEstado === 'all') {
      setMunicipios([]);
      setSelectedMunicipio('all');
      setSchools([]);
      setSelectedSchool('all');
      setSeries([]);
      setSelectedSerie('all');
      setTurmas([]);
      setSelectedTurma('all');
      return;
    }
    let cancelled = false;
    setIsLoadingMunicipios(true);
    FormFiltersApiService.getFormFilterMunicipalities(selectedEstado)
      .then((list) => {
        if (!cancelled) {
          setMunicipios(list.map((m) => ({ id: m.id, name: m.nome })));
          setSelectedMunicipio('all');
          setSchools([]);
          setSelectedSchool('all');
          setSeries([]);
          setSelectedSerie('all');
          setTurmas([]);
          setSelectedTurma('all');
        }
      })
      .catch(() => {
        if (!cancelled) setMunicipios([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMunicipios(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEstado]);

  // Carregar escolas ao mudar município
  useEffect(() => {
    if (!selectedMunicipio || selectedMunicipio === 'all' || !selectedEstado || selectedEstado === 'all') {
      setSchools([]);
      setSelectedSchool('all');
      setSeries([]);
      setSelectedSerie('all');
      setTurmas([]);
      setSelectedTurma('all');
      return;
    }
    let cancelled = false;
    setIsLoadingSchools(true);
    FormFiltersApiService.getFormFilterSchools({
      estado: selectedEstado,
      municipio: selectedMunicipio,
    })
      .then((list) => {
        if (!cancelled) {
          setSchools(list.map((s) => ({ id: s.id, name: s.nome })));
          setSelectedSchool('all');
          setSeries([]);
          setSelectedSerie('all');
          setTurmas([]);
          setSelectedTurma('all');
        }
      })
      .catch(() => {
        if (!cancelled) setSchools([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSchools(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMunicipio, selectedEstado]);

  // Carregar séries ao mudar escola
  useEffect(() => {
    if (!selectedSchool || selectedSchool === 'all' || !selectedMunicipio || selectedMunicipio === 'all' || !selectedEstado || selectedEstado === 'all') {
      setSeries([]);
      setSelectedSerie('all');
      setTurmas([]);
      setSelectedTurma('all');
      return;
    }
    let cancelled = false;
    setIsLoadingSeries(true);
    FormFiltersApiService.getFormFilterGrades({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      escola: selectedSchool,
    })
      .then((list) => {
        if (!cancelled) {
          setSeries(list.map((s) => ({ id: s.id, name: s.nome })));
          setSelectedSerie('all');
          setTurmas([]);
          setSelectedTurma('all');
        }
      })
      .catch(() => {
        if (!cancelled) setSeries([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSeries(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSchool, selectedMunicipio, selectedEstado]);

  // Carregar turmas ao mudar série
  useEffect(() => {
    if (!selectedSerie || selectedSerie === 'all' || !selectedSchool || selectedSchool === 'all' || !selectedMunicipio || selectedMunicipio === 'all' || !selectedEstado || selectedEstado === 'all') {
      setTurmas([]);
      setSelectedTurma('all');
      return;
    }
    let cancelled = false;
    setIsLoadingTurmas(true);
    FormFiltersApiService.getFormFilterClasses({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      escola: selectedSchool,
      serie: selectedSerie,
    })
      .then((list) => {
        if (!cancelled) {
          setTurmas(list.map((t) => ({ id: t.id, name: t.nome })));
          const stillExists = selectedTurma === 'all' || list.some((t) => t.id === selectedTurma);
          if (!stillExists) setSelectedTurma('all');
        }
      })
      .catch(() => {
        if (!cancelled) setTurmas([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTurmas(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSerie, selectedSchool, selectedMunicipio, selectedEstado]);

  useEffect(() => {
    if (!isModoAplicada) return;
    // Carrega opções após selecionar estado/município; escola é opcional (pode ser "Todas").
    if (
      !selectedEstado ||
      selectedEstado === 'all' ||
      !selectedMunicipio ||
      selectedMunicipio === 'all'
    ) {
      setAvaliacoes([]);
      setSelectedAvaliacaoId('all');
      return;
    }
    let cancelled = false;
    setIsLoadingAvaliacoes(true);
    EvaluationResultsApiService.getFilterEvaluations({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      escola: selectedSchool !== 'all' ? selectedSchool : undefined,
      ...(modoLista === 'cartao_resposta' ? { report_entity_type: REPORT_ENTITY_TYPE_ANSWER_SHEET } : {}),
    })
      .then((items) => {
        if (cancelled) return;
        setAvaliacoes((items ?? []).map((a) => ({ id: a.id, titulo: a.titulo || a.id })));
      })
      .catch(() => {
        if (!cancelled) setAvaliacoes([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAvaliacoes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isModoAplicada, modoLista, selectedEstado, selectedMunicipio, selectedSchool]);

  // Modo avaliação: turmas via GET /test/:id/classes. Modo cartão resposta: turmas via filtros de gabarito (answer_sheet).
  useEffect(() => {
    if (!isModoAplicada || !selectedAvaliacaoId || selectedAvaliacaoId === 'all') {
      setTurmasAvaliacao([]);
      setSelectedTurma('all');
      return;
    }
    if (modoLista === 'cartao_resposta') {
      if (
        !selectedEstado ||
        selectedEstado === 'all' ||
        !selectedMunicipio ||
        selectedMunicipio === 'all' ||
        !selectedSchool ||
        selectedSchool === 'all' ||
        !selectedSerie ||
        selectedSerie === 'all'
      ) {
        setTurmasAvaliacao([]);
        setSelectedTurma('all');
        return;
      }
      let cancelled = false;
      setIsLoadingTurmasAvaliacao(true);
      EvaluationResultsApiService.getFilterClassesByEvaluation({
        estado: selectedEstado,
        municipio: selectedMunicipio,
        avaliacao: selectedAvaliacaoId,
        escola: selectedSchool,
        serie: selectedSerie,
        report_entity_type: REPORT_ENTITY_TYPE_ANSWER_SHEET,
      })
        .then((list) => {
          if (cancelled) return;
          const mapped = (list ?? []).map((t) => ({
            id: t.id,
            name: t.nome || t.id,
          }));
          setTurmasAvaliacao(mapped);
          const stillExists = selectedTurma === 'all' || mapped.some((x) => x.id === selectedTurma);
          if (!stillExists) setSelectedTurma('all');
        })
        .catch(() => {
          if (!cancelled) setTurmasAvaliacao([]);
        })
        .finally(() => {
          if (!cancelled) setIsLoadingTurmasAvaliacao(false);
        });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    setIsLoadingTurmasAvaliacao(true);
    api
      .get<Array<{ class?: { id: string; name?: string }; class_id?: string; class_test_id?: string }>>(`/test/${selectedAvaliacaoId}/classes`)
      .then((res) => {
        if (cancelled) return;
        const data = res.data;
        if (!data || !Array.isArray(data)) {
          setTurmasAvaliacao([]);
          return;
        }
        const list = data.map((item) => {
          const cls = item.class ?? item;
          const id = typeof cls === 'object' && cls !== null ? (cls as { id?: string }).id ?? (item as { class_id?: string }).class_id : (item as { class_id?: string }).class_id;
          const name = typeof cls === 'object' && cls !== null ? (cls as { name?: string }).name ?? '' : '';
          return { id: String(id ?? ''), name: name || String(id ?? '') };
        }).filter((t) => t.id);
        setTurmasAvaliacao(list);
        const stillExists = selectedTurma === 'all' || list.some((t) => t.id === selectedTurma);
        if (!stillExists) setSelectedTurma('all');
      })
      .catch(() => {
        if (!cancelled) setTurmasAvaliacao([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTurmasAvaliacao(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    isModoAplicada,
    modoLista,
    selectedAvaliacaoId,
    selectedEstado,
    selectedMunicipio,
    selectedSchool,
    selectedSerie,
  ]);

  // Por avaliação online: expiração da prova. Por cartão resposta: P/A já vêm dos resultados — exibir coluna A normalmente.
  useEffect(() => {
    if (!isModoAplicada) {
      setProvaExpirada(null);
      return;
    }
    if (modoLista === 'cartao_resposta') {
      setProvaExpirada(true);
      return;
    }
    if (!data?.length || !selectedAvaliacaoId || selectedAvaliacaoId === 'all') {
      setProvaExpirada(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ application_info?: { expiration?: string }; prova_expirada?: boolean }>(`/test/${selectedAvaliacaoId}`);
        if (cancelled) return;
        const exp = res.data?.application_info?.expiration;
        if (typeof res.data?.prova_expirada === 'boolean') {
          setProvaExpirada(res.data.prova_expirada);
          return;
        }
        if (exp) {
          setProvaExpirada(new Date(exp).getTime() < Date.now());
          return;
        }
        setProvaExpirada(false); // sem informação: considerar em andamento para não marcar ninguém como ausente
      } catch {
        if (!cancelled) setProvaExpirada(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isModoAplicada, modoLista, data, selectedAvaliacaoId]);

  // Preencher o nome da avaliação para impressão quando a lista for carregada
  useEffect(() => {
    if (data?.length && data[0].cabecalho.nome_prova_ano) {
      setNomeAvaliacaoImpressao(data[0].cabecalho.nome_prova_ano);
    } else {
      setNomeAvaliacaoImpressao('');
    }
  }, [data]);

  const handleGerarLista = async () => {
    setError(null);
    setIsLoadingLista(true);
    try {
      if (isModoAplicada) {
        if (!selectedAvaliacaoId || selectedAvaliacaoId === 'all') {
          setError(`Selecione o(a) ${labelItemAplicado.toLowerCase()}.`);
          toast({ title: 'Aviso', description: `Selecione o(a) ${labelItemAplicado.toLowerCase()}.`, variant: 'destructive' });
          return;
        }
        const classId =
          selectedTurma && selectedTurma !== 'all' ? selectedTurma : undefined;
        if (modoLista === 'cartao_resposta') {
          if (!selectedMunicipio || selectedMunicipio === 'all') {
            setError('Selecione o município.');
            toast({ title: 'Aviso', description: 'Selecione o município para gerar a lista de cartão resposta.', variant: 'destructive' });
            return;
          }
          if (classId) {
            const res = await getListaFrequenciaPorGabarito(
              selectedAvaliacaoId,
              selectedMunicipio,
              classId,
              { tipo: tipoListaAplicada }
            );
            setData([res]);
          } else {
            const gradeId = selectedSerie && selectedSerie !== 'all' ? selectedSerie : undefined;
            const results = await getListaFrequenciaPorGabaritoTodasTurmas(selectedAvaliacaoId, selectedMunicipio, {
              grade_id: gradeId,
              tipo: tipoListaAplicada,
            });
            setData(results.length > 0 ? results : null);
          }
        } else if (classId) {
          const res = await getListaFrequenciaPorAvaliacao(selectedAvaliacaoId, classId, { tipo: tipoListaAplicada });
          setData([res]);
        } else {
          const gradeId = selectedSerie && selectedSerie !== 'all' ? selectedSerie : undefined;
          const results = await getListaFrequenciaPorAvaliacaoTodasTurmas(selectedAvaliacaoId, {
            grade_id: gradeId,
            tipo: tipoListaAplicada,
          });
          setData(results.length > 0 ? results : null);
        }
      } else {
        if (!selectedMunicipio || selectedMunicipio === 'all') {
          setError('Selecione o município.');
          return;
        }
        let classIds: { id: string }[] = [];
        if (selectedTurma && selectedTurma !== 'all') {
          classIds = [{ id: selectedTurma }];
        } else if (selectedSchool !== 'all' && selectedSerie && selectedSerie !== 'all' && turmas.length > 0) {
          classIds = turmas.map((t) => ({ id: t.id }));
        } else if (selectedSchool !== 'all') {
          const res = await api.get<{ id: string; name?: string }[]>(`/classes/school/${selectedSchool}`);
          const list = Array.isArray(res.data) ? res.data : [];
          classIds = list.map((c) => ({ id: c.id }));
        } else {
          const filtered = await EvaluationResultsApiService.getFilteredClasses({
            municipality_id: selectedMunicipio,
            ...(selectedSerie !== 'all' ? { grade_id: selectedSerie } : {}),
          });
          classIds = filtered
            .map((c) => ({ id: c.id }))
            .filter((c) => Boolean(c.id));
        }

        if (classIds.length > 1) {
          const seen = new Set<string>();
          classIds = classIds.filter((c) => {
            if (seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
          });
        }
        if (classIds.length === 0) {
          setError('Nenhuma turma encontrada.');
          setData(null);
          toast({ title: 'Aviso', description: 'Nenhuma turma encontrada para os filtros selecionados.', variant: 'destructive' });
          return;
        }
        const results: ListaFrequenciaResponse[] = [];
        const failures: Array<{ response?: { data?: { erro?: string } }; message?: string }> = [];
        const shouldUseMunicipalBulk = classIds.length > 1 && selectedMunicipio !== 'all';
        if (shouldUseMunicipalBulk) {
          try {
            const bulk = await getListaFrequenciaPorMunicipioTodasTurmas(selectedMunicipio, {
              ...(selectedSchool !== 'all' ? { school_id: selectedSchool } : {}),
              ...(selectedSerie !== 'all' ? { grade_id: selectedSerie } : {}),
              tipo: 'avaliacao',
            });
            if (bulk.length > 0) {
              setData(bulk);
              return;
            }
          } catch (bulkErr: unknown) {
            const ax = bulkErr as {
              response?: { data?: { erro?: string }; status?: number };
              message?: string;
              code?: string;
            };
            const transportFailure =
              !ax.response ||
              ax.code === 'ERR_NETWORK' ||
              ax.message === 'Network Error';
            if (transportFailure) {
              const msg =
                'O servidor não respondeu ao carregar todas as turmas do município. Aguarde alguns segundos e tente novamente.';
              setError(msg);
              setData(null);
              toast({ title: 'Erro', description: msg, variant: 'destructive' });
              return;
            }
            failures.push(bulkErr as { response?: { data?: { erro?: string } }; message?: string });
          }
        }

        const concurrency = 6;
        for (let i = 0; i < classIds.length; i += concurrency) {
          const chunk = classIds.slice(i, i + concurrency);
          const settled = await Promise.allSettled(
            chunk.map((c) => getListaFrequencia(c.id, 'avaliacao'))
          );
          settled.forEach((entry) => {
            if (entry.status === 'fulfilled') {
              results.push(entry.value);
            } else {
              failures.push(entry.reason as { response?: { data?: { erro?: string } }; message?: string });
            }
          });
        }

        if (results.length === 0) {
          const backendMsg = failures[0]?.response?.data?.erro || failures[0]?.message;
          setError(backendMsg || 'Não foi possível carregar a lista de frequência.');
          setData(null);
          toast({
            title: 'Erro',
            description: backendMsg || 'Não foi possível carregar a lista de frequência.',
            variant: 'destructive',
          });
          return;
        }

        const failedCount = failures.length;
        if (failedCount > 0) {
          toast({
            title: 'Atenção',
            description: `${failedCount} turma(s) não puderam ser carregadas e foram ignoradas.`,
            variant: 'destructive',
          });
        }
        setData(results);
      }
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: { erro?: string } } };
      const runtimeErrorMsg = err instanceof Error ? err.message : undefined;
      const msg =
        ax.response?.data?.erro ||
        (ax.response?.status === 404
          ? (isModoAplicada ? `${labelItemAplicado} ou turma não encontrada.` : 'Turma não encontrada')
          : 'Não foi possível carregar a lista de frequência.') ||
        (ax.response?.status === 400 ? 'Informe a turma (class_id) quando a avaliação tiver várias turmas.' : runtimeErrorMsg || 'Não foi possível carregar a lista de frequência.');
      setError(msg);
      setData(null);
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setIsLoadingLista(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!data || data.length === 0) return;
    setIsGeneratingPDF(true);
    try {
      const date = new Date().toISOString().split('T')[0];
      const cityId = selectedMunicipio !== 'all' ? selectedMunicipio : null;

      if (data.length === 1) {
        const singleBlob = await createSingleListaFrequenciaPdfBlob(data[0], {
          cityId,
          nomeAvaliacaoImpressao,
          provaExpirada,
        });
        const fileName = `lista-frequencia-${date}.pdf`;
        downloadBlob(singleBlob, fileName);
        toast({ title: 'PDF gerado', description: `Arquivo ${fileName} salvo.` });
        return;
      }

      const entries: Array<{ path: string; blob: Blob }> = [];
      for (const item of data) {
        const blob = await createSingleListaFrequenciaPdfBlob(item, {
          cityId,
          nomeAvaliacaoImpressao,
          provaExpirada,
        });
        const hierarchyPath = buildListaFrequenciaHierarchyPath(item);
        if (item.class_id) {
          const suffix = sanitizePathSegment(item.class_id).slice(0, 8);
          const withClassId = hierarchyPath.replace(/lista-frequencia\.pdf$/i, `lista-frequencia-${suffix}.pdf`);
          entries.push({ path: withClassId, blob });
        } else {
          entries.push({ path: hierarchyPath, blob });
        }
      }

      const zipBlob = await generateZipBlob(entries);
      const zipName = `lista-frequencia-${date}.zip`;
      downloadBlob(zipBlob, zipName);
      toast({ title: 'ZIP gerado', description: `Arquivo ${zipName} salvo.` });
    } catch (err) {
      toast({ title: 'Erro ao gerar PDF', description: 'Não foi possível gerar o arquivo.', variant: 'destructive' });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const codigosStatus =
    data && data.length > 0
      ? STATUS_ORDER.filter((c) => c in (data[0].cabecalho.legenda || {}))
      : STATUS_ORDER;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 print:p-0">
      {/* Header */}
      <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
            <ClipboardList className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 shrink-0" />
            Lista de Frequência
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Gere listas por turma (status vazios), por avaliação aplicada ou por cartão resposta (P/A conforme sessões).
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card className="no-print">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Modo</label>
              <Select value={modoLista} onValueChange={(v) => setModoLista(v as 'turma' | 'avaliacao' | 'cartao_resposta')}>
                <SelectTrigger className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="turma">Por turma (Estado → Escola → Série → Turma)</SelectItem>
                  <SelectItem value="avaliacao">Por avaliação aplicada</SelectItem>
                  <SelectItem value="cartao_resposta">Por cartão resposta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isModoAplicada && (
              <EvaluationInstrumentPicker
                label={labelItemAplicado}
                className="max-w-md"
                estado={selectedEstado}
                municipio={selectedMunicipio}
                escola={selectedSchool !== 'all' ? selectedSchool : undefined}
                reportEntityType={
                  modoLista === 'cartao_resposta' ? REPORT_ENTITY_TYPE_ANSWER_SHEET : undefined
                }
                value={selectedAvaliacaoId}
                onChange={setSelectedAvaliacaoId}
                disabled={!selectedMunicipio || selectedMunicipio === 'all'}
                loading={isLoadingAvaliacoes}
                allowAll
                allLabel={`Selecione o(a) ${labelItemAplicado.toLowerCase()}`}
                placeholder={
                  !selectedMunicipio || selectedMunicipio === 'all'
                    ? 'Selecione o município primeiro'
                    : `Selecione o(a) ${labelItemAplicado.toLowerCase()}`
                }
              />
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <Select
                value={selectedEstado}
                onValueChange={setSelectedEstado}
                disabled={isLoadingEstados}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {estados.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Município</label>
              <Select
                value={selectedMunicipio}
                onValueChange={setSelectedMunicipio}
                disabled={!selectedEstado || selectedEstado === 'all' || isLoadingMunicipios}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o município" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {municipios.map((m) => (
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
                disabled={!selectedMunicipio || selectedMunicipio === 'all' || isLoadingSchools}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a escola" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {schools.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Série</label>
              <Select
                value={selectedSerie}
                onValueChange={setSelectedSerie}
                disabled={!selectedSchool || selectedSchool === 'all' || isLoadingSeries}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a série" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {series.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Turma</label>
              <Select
                value={selectedTurma}
                onValueChange={setSelectedTurma}
                disabled={
                  isModoAplicada && turmasAvaliacao.length > 0
                    ? isLoadingTurmasAvaliacao
                    : !selectedSerie || selectedSerie === 'all' || isLoadingTurmas
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a turma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(isModoAplicada && turmasAvaliacao.length > 0 ? turmasAvaliacao : turmas).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Button
              onClick={handleGerarLista}
              disabled={
                isLoadingLista ||
                (isModoAplicada
                  ? !selectedAvaliacaoId || selectedAvaliacaoId === 'all'
                  : !selectedMunicipio || selectedMunicipio === 'all')
              }
            >
              {isLoadingLista ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Carregando...
                </>
              ) : (
                'Gerar lista'
              )}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            {modoLista === 'turma'
              ? 'Hierarquia: Estado → Município → Escola → Série → Turma. Com Escola = Todos, gera para todas as escolas do município.'
              : `Selecione município e o(a) ${labelItemAplicado}. Se desejar, filtre por escola e turma.`}
          </p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="no-print">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

{data && data.length > 0 && (
        <div className="space-y-3">
          <div className="no-print flex flex-col sm:flex-row gap-4 items-stretch sm:items-end justify-end">
            <div className="flex flex-col gap-2 min-w-0 sm:max-w-md">
              <Label htmlFor="nome-avaliacao-impressao">Nome da avaliação (impressão/PDF)</Label>
              <Input
                id="nome-avaliacao-impressao"
                placeholder="Ex.: Prova de Matemática - 1º Bimestre 2025"
                value={nomeAvaliacaoImpressao}
                onChange={(e) => setNomeAvaliacaoImpressao(e.target.value)}
                className="bg-background"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGeneratePDF}
              disabled={isGeneratingPDF}
              className="gap-2"
            >
              {isGeneratingPDF ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              {isGeneratingPDF ? (data.length === 1 ? 'Gerando PDF...' : 'Gerando ZIP...') : (data.length === 1 ? 'Baixar PDF' : 'Baixar ZIP')}
            </Button>
          </div>
          <div id="lista-frequencia-print" className="rounded-lg overflow-hidden bg-zinc-900 text-white shadow-lg">
          <div className="p-6">
            {data.map((item, sectionIndex) => (
              <div
                key={sectionIndex}
                className={`lista-frequencia-turma-section ${sectionIndex > 0 ? 'mt-8' : ''}`}
              >
                {/* Cabeçalho */}
                <header className="mb-6 text-center">
                  <h2 className="text-lg font-semibold">{(nomeAvaliacaoImpressao?.trim() || item.cabecalho.nome_prova_ano) || 'Nome da prova'}</h2>
                  <p className="text-sm mt-1">{item.cabecalho.lista_presenca_curso}</p>
                  <div className="mx-auto mt-4 max-w-4xl rounded border-2 border-pink-500/70 bg-zinc-800/80 p-4 text-left">
                    <div className="space-y-1 text-sm">
                      <p>MUNICÍPIO/UF: {item.cabecalho.municipio_uf}</p>
                      <p>NOME DA ESCOLA*: {item.cabecalho.nome_escola}</p>
                      <p>SÉRIE: {getSerieTurmaDisplay(item.cabecalho).serie}</p>
                      <p>TURMA: {getSerieTurmaDisplay(item.cabecalho).turma}</p>
                      <p>TURNO: {getClassShiftLabel(item.cabecalho.turno)}</p>
                      <p className="flex items-baseline gap-1">
                        DISCIPLINA:{' '}
                        {item.cabecalho.disciplina?.trim() ? (
                          item.cabecalho.disciplina
                        ) : (
                          <span className="inline-block min-w-[200px] border-b border-white/40" aria-hidden />
                        )}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-center text-xs">
                    Legenda: {formatLegenda(item.cabecalho.legenda)}
                  </p>
                  <p className="mt-2 text-center text-xs italic">
                    {item.cabecalho.instrucoes_aplicador}
                  </p>
                </header>

                {/* Tabela */}
                <div className="lista-frequencia-table-wrap overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-pink-600/80">
                        <th className="border border-pink-500/70 px-2 py-2 text-left font-medium">
                          N°
                        </th>
                        <th className="border border-pink-500/70 px-2 py-2 text-left font-medium">
                          NOME DO ESTUDANTE
                        </th>
                        {codigosStatus.map((cod) => (
                          <th
                            key={cod}
                            className="w-10 border border-pink-500/70 px-1 py-2 text-center font-medium"
                          >
                            {cod}
                          </th>
                        ))}
                        <th className="min-w-[120px] border border-pink-500/70 px-2 py-2 text-left font-medium">
                          ASSINATURA DO ESTUDANTE
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.estudantes.map((est: Estudante, idx: number) => (
                        <tr
                          key={`${sectionIndex}-${est.numero}-${idx}`}
                          className={idx % 2 === 0 ? 'bg-zinc-800' : 'bg-zinc-800/60'}
                        >
                          <td className="border border-pink-500/50 px-2 py-1.5">
                            {est.numero}.
                          </td>
                          <td className="border border-pink-500/50 px-2 py-1.5">
                            {est.nome_estudante}
                          </td>
                          {codigosStatus.map((cod) => {
                            const isAusente = cod === 'A';
                            const mostrarPreenchido =
                              est.status === cod &&
                              (!isAusente || provaExpirada === true);
                            return (
                              <td
                                key={cod}
                                className="border border-pink-500/50 px-1 py-1.5 text-center"
                              >
                                <span
                                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-pink-400/80"
                                  style={{
                                    backgroundColor: mostrarPreenchido
                                      ? 'rgba(236,72,153,0.6)'
                                      : 'transparent',
                                  }}
                                />
                              </td>
                            );
                          })}
                          <td className="border border-pink-500/50 px-2 py-1.5" />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Rodapé por turma: CPF à esquerda, Assinatura no meio, Data à direita */}
                <footer className="mt-8 border-t border-pink-500/50 pt-6">
                  <div className="grid grid-cols-3 gap-4 items-start">
                    <div className="text-left">
                      <p className="mb-2 text-xs font-medium">CPF DO(A) APLICADOR(A)</p>
                      <div className="flex gap-1">
                        {Array.from({ length: 11 }).map((_, i) => (
                          <span
                            key={i}
                            className="h-8 w-6 border border-white/40 bg-transparent"
                            aria-hidden
                          />
                        ))}
                      </div>
                    </div>
                    <div className="text-center flex flex-col items-center mt-8">
                      <div className="border-b-2 border-dashed border-pink-400/60 pb-1 w-72 min-w-[200px]" />
                      <p className="mt-2 text-xs">ASSINATURA DO(A) APLICADOR(A)</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium">DATA: ___/___/_______</p>
                    </div>
                  </div>
                </footer>
              </div>
            ))}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
