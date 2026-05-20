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
import {
  getListaFrequencia,
  getListaFrequenciaPorAvaliacao,
  getListaFrequenciaPorAvaliacaoTodasTurmas,
  getListaFrequenciaPorGabarito,
  getListaFrequenciaPorGabaritoTodasTurmas,
} from '@/services/listaFrequenciaApi';
import type {
  ListaFrequenciaResponse,
  Cabecalho,
  Estudante,
} from '@/types/lista-frequencia';
import {
  loadCityBrandingPdfAssets,
  paintLetterheadBackground,
  drawMunicipalLogoTopCenter,
} from '@/utils/pdfCityBranding';

const STATUS_ORDER = ['P', 'A', 'T', 'NE', 'SE', 'SS', 'I'];

function formatLegenda(legenda: Cabecalho['legenda']): string {
  return Object.entries(legenda)
    .map(([cod, desc]) => `${cod} = ${desc}`)
    .join('; ');
}

/**
 * SÉRIE e TURMA para exibição.
 * Backend envia serie (Grade.name) e turma (removendo série do nome da turma, ou última palavra quando fizer sentido).
 * Fallback no frontend replica a mesma lógica quando turma não vier preenchida.
 */
function getSerieTurmaDisplay(cab: Cabecalho): { serie: string; turma: string } {
  const s = cab.serie?.trim() ?? '';
  const t = cab.turma?.trim() ?? '';
  const st = cab.serie_turma?.trim() ?? '';

  /** Turma removendo a série do início do nome (mesmo nº de caracteres da série em maiúsculas). */
  const turmaRemovendoSerie = (): string => {
    if (!s || !st) return '';
    const serieLen = s.toUpperCase().length;
    let rest = st.slice(serieLen);
    rest = rest.replace(/^[\s\-–—]+/, '').trim();
    return rest;
  };

  /** Última palavra como turma só quando fizer sentido: >2 palavras ou 2 palavras com última de 1 caractere. */
  const turmaUltimaPalavra = (): string => {
    if (!st) return '';
    const parts = st.split(/\s+/).filter(Boolean);
    if (parts.length > 2) return parts[parts.length - 1] ?? '';
    if (parts.length === 2 && parts[1]?.length === 1) return parts[1];
    return '';
  };

  if (s && t) return { serie: s, turma: t };
  if (t) return { serie: st || s || '—', turma: t };

  if (s) {
    const derived = turmaRemovendoSerie() || turmaUltimaPalavra();
    return { serie: s, turma: derived || '—' };
  }

  if (st) {
    const dashSplit = st.split(/\s*-\s*/);
    if (dashSplit.length >= 2) return { serie: dashSplit[0].trim(), turma: dashSplit[1].trim() };
    const derived = turmaUltimaPalavra();
    if (derived) {
      const parts = st.split(/\s+/).filter(Boolean);
      const serieFromSt = parts.length > 1 ? parts.slice(0, -1).join(' ') : st;
      return { serie: serieFromSt || st, turma: derived };
    }
    return { serie: st, turma: '—' };
  }

  return { serie: '—', turma: '—' };
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
    // Só carrega opções após selecionar contexto completo (estado/município/escola/série)
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
      setAvaliacoes([]);
      setSelectedAvaliacaoId('all');
      return;
    }
    let cancelled = false;
    setIsLoadingAvaliacoes(true);
    EvaluationResultsApiService.getFilterEvaluations({
      estado: selectedEstado,
      municipio: selectedMunicipio,
      escola: selectedSchool,
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
  }, [isModoAplicada, modoLista, selectedEstado, selectedMunicipio, selectedSchool, selectedSerie]);

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
        if (!selectedSchool || selectedSchool === 'all') {
          setError('Selecione a escola.');
          return;
        }
        let classIds: { id: string }[] = [];
        if (selectedTurma && selectedTurma !== 'all') {
          classIds = [{ id: selectedTurma }];
        } else if (selectedSerie && selectedSerie !== 'all' && turmas.length > 0) {
          classIds = turmas.map((t) => ({ id: t.id }));
        } else {
          const res = await api.get<{ id: string; name?: string }[]>(`/classes/school/${selectedSchool}`);
          const list = Array.isArray(res.data) ? res.data : [];
          classIds = list.map((c) => ({ id: c.id }));
        }
        if (classIds.length === 0) {
          setError('Nenhuma turma encontrada.');
          setData(null);
          toast({ title: 'Aviso', description: 'Nenhuma turma encontrada para os filtros selecionados.', variant: 'destructive' });
          return;
        }
        const results = await Promise.all(
          classIds.map((c) => getListaFrequencia(c.id, 'avaliacao'))
        );
        setData(results);
      }
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: { erro?: string } } };
      const msg =
        ax.response?.data?.erro ||
        (ax.response?.status === 404
          ? (isModoAplicada ? `${labelItemAplicado} ou turma não encontrada.` : 'Turma não encontrada')
          : 'Não foi possível carregar a lista de frequência.') ||
        (ax.response?.status === 400 ? 'Informe a turma (class_id) quando a avaliação tiver várias turmas.' : 'Não foi possível carregar a lista de frequência.');
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
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const margin = 15;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const cityBranding = await loadCityBrandingPdfAssets(
        selectedMunicipio !== 'all' ? selectedMunicipio : null
      );

      const textBlack: [number, number, number] = [0, 0, 0];
      const textGray: [number, number, number] = [80, 80, 80];
      const pink: [number, number, number] = [236, 72, 153];
      const pinkLight: [number, number, number] = [251, 207, 232];
      // Círculos no mesmo tom das linhas da tabela (mais uniforme visualmente).
      const statusCircleOn: [number, number, number] = [95, 95, 95];
      const statusCircleOff: [number, number, number] = [95, 95, 95];
      const statusHeaderText: [number, number, number] = [72, 18, 50];
      const contentWidth = pageWidth - 2 * margin;

      data.forEach((item, sectionIndex) => {
        if (sectionIndex > 0) doc.addPage();
        let y = margin;

        if (sectionIndex === 0) {
          if (cityBranding.letterhead) {
            paintLetterheadBackground(doc, cityBranding.letterhead, pageWidth, pageHeight);
          } else {
            doc.setFillColor(255, 255, 255);
            doc.rect(0, 0, pageWidth, pageHeight, 'F');
          }
          if (cityBranding.logo) {
            y = drawMunicipalLogoTopCenter(doc, pageWidth, margin, cityBranding.logo);
          }
        } else {
          doc.setFillColor(255, 255, 255);
          doc.rect(0, 0, pageWidth, pageHeight, 'F');
        }
        doc.setTextColor(...textBlack);

        const tituloProva = (nomeAvaliacaoImpressao?.trim() || item.cabecalho.nome_prova_ano) || 'Nome da prova';
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...pink);
        doc.text(tituloProva, pageWidth / 2, y, { align: 'center' });
        y += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...textBlack);
        doc.text(item.cabecalho.lista_presenca_curso, pageWidth / 2, y, { align: 'center' });
        y += 8;

        const cab = item.cabecalho;
        const { serie: serieDisplay, turma: turmaDisplay } = getSerieTurmaDisplay(cab);
        doc.setFontSize(9);
        const escolaLines = doc.splitTextToSize(`NOME DA ESCOLA*: ${cab.nome_escola}`, contentWidth - 8);
        const boxHeight = 8 + 5 + 5 + escolaLines.length * 4.5 + 5 + 5 + 5 + 6 + 4;
        doc.setDrawColor(...pink);
        doc.setLineWidth(0.4);
        doc.rect(margin, y, contentWidth, boxHeight, 'S');
        doc.setDrawColor(180, 180, 180);
        const boxX = margin + 4;
        let boxY = y + 6;
        doc.text(`MUNICÍPIO/UF: ${cab.municipio_uf}`, boxX, boxY, { align: 'left' });
        boxY += 5;
        doc.text(escolaLines, boxX, boxY, { align: 'left' });
        boxY += escolaLines.length * 4.5;
        doc.text(`SÉRIE: ${serieDisplay}`, boxX, boxY, { align: 'left' });
        boxY += 5;
        doc.text(`TURMA: ${turmaDisplay}`, boxX, boxY, { align: 'left' });
        boxY += 5;
        const disciplinaVal = cab.disciplina?.trim() ?? '';
        doc.text(disciplinaVal ? `DISCIPLINA: ${disciplinaVal}` : 'DISCIPLINA: ', boxX, boxY, { align: 'left' });
        if (!disciplinaVal) {
          const lineX0 = boxX + doc.getTextWidth('DISCIPLINA: ');
          doc.setDrawColor(120, 120, 120);
          doc.line(lineX0, boxY + 1.5, lineX0 + 50, boxY + 1.5);
        }
        y = boxY + 8;

        doc.setFontSize(8);
        doc.setTextColor(...textGray);
        const legendaStr = `Legenda: ${formatLegenda(cab.legenda)}`;
        const legendaLines = doc.splitTextToSize(legendaStr, contentWidth);
        legendaLines.forEach((line: string) => {
          doc.text(line, pageWidth / 2, y, { align: 'center' });
          y += 4;
        });
        y += 4;
        doc.setFont('helvetica', 'italic');
        const instLines = doc.splitTextToSize(cab.instrucoes_aplicador, contentWidth);
        instLines.forEach((line: string) => {
          doc.text(line, pageWidth / 2, y, { align: 'center' });
          y += 4;
        });
        y += 6;

        const codigos = STATUS_ORDER.filter((c) => c in (cab.legenda || {}));
        const tableHead = [['N°', 'NOME DO ESTUDANTE', ...codigos, 'ASSINATURA']];
        const tableBody = item.estudantes.map((est) => {
          const statusPlaceholders = codigos.map(() => '');
          return [`${est.numero}.`, est.nome_estudante, ...statusPlaceholders, ''];
        });

        const statusColStart = 2;
        const statusColEnd = 2 + codigos.length;
        autoTable(doc, {
          startY: y,
          head: tableHead,
          body: tableBody,
          theme: 'grid',
          margin: { left: margin, right: margin },
          tableWidth: 'auto',
          styles: {
            fontSize: 8,
            cellPadding: 2,
            textColor: textBlack,
            lineColor: [140, 140, 140],
            lineWidth: 0.18,
            overflow: 'linebreak',
          },
          headStyles: {
            fillColor: pinkLight,
            textColor: statusHeaderText,
            fontStyle: 'bold',
          },
          columnStyles: {
            0: { cellWidth: 10 },
            1: {
              cellWidth: Math.max(40, contentWidth - 10 - 8 * codigos.length - 35 - 4),
              overflow: 'linebreak',
            },
            ...Object.fromEntries(codigos.map((_, i) => [i + statusColStart, { cellWidth: 8, halign: 'center' }])),
            [statusColEnd]: { cellWidth: 35 },
          },
          didDrawCell: (data) => {
            if (data.section !== 'body' || data.column.index < statusColStart || data.column.index >= statusColEnd)
              return;
            const colIdx = data.column.index - statusColStart;
            const cod = codigos[colIdx];
            const est = item.estudantes[data.row.index];
            const isAusente = cod === 'A';
            const mostrarPreenchido =
              est &&
              est.status === cod &&
              (!isAusente || provaExpirada === true);
            const cx = data.cell.x + data.cell.width / 2;
            const cy = data.cell.y + data.cell.height / 2;
            const r = 2.2;
            data.doc.setLineWidth(0.18);
            if (mostrarPreenchido) {
              data.doc.setFillColor(...statusCircleOn);
              data.doc.circle(cx, cy, r, 'F');
              data.doc.setDrawColor(...statusCircleOn);
              data.doc.circle(cx, cy, r, 'S');
            } else {
              data.doc.setDrawColor(...statusCircleOff);
              data.doc.circle(cx, cy, r, 'S');
            }
          },
        });
        y = (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y;
        y += 12;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...textBlack);
        doc.text('CPF DO(A) APLICADOR(A)', margin, y);
        const boxW = 4;
        const boxH = 5;
        const cpfBoxY = y + 2;
        for (let i = 0; i < 11; i++) {
          doc.rect(margin + i * (boxW + 1), cpfBoxY, boxW, boxH, 'S');
        }
        doc.text('DATA: ___/___/_______', pageWidth - margin, y, { align: 'right' });
        y = cpfBoxY + boxH + 18;
        doc.setDrawColor(180, 180, 180);
        doc.setLineDashPattern([2, 2], 0);
        doc.line(margin, y, pageWidth - margin, y);
        doc.setLineDashPattern([], 0);
        y += 6;
        doc.text('ASSINATURA DO(A) APLICADOR(A)', pageWidth / 2, y, { align: 'center' });
      });

      const fileName = `lista-frequencia-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      toast({ title: 'PDF gerado', description: `Arquivo ${fileName} salvo.` });
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
              <div className="space-y-2">
                <label className="text-sm font-medium">{labelItemAplicado}</label>
                <Select
                  value={selectedAvaliacaoId}
                  onValueChange={setSelectedAvaliacaoId}
                  disabled={
                    isLoadingAvaliacoes ||
                    !selectedSchool ||
                    selectedSchool === 'all' ||
                    !selectedSerie ||
                    selectedSerie === 'all'
                  }
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue
                      placeholder={
                        !selectedSchool || selectedSchool === 'all'
                          ? 'Selecione a escola primeiro'
                          : !selectedSerie || selectedSerie === 'all'
                          ? 'Selecione a série primeiro'
                          : `Selecione o(a) ${labelItemAplicado.toLowerCase()}`
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{`Selecione o(a) ${labelItemAplicado.toLowerCase()}`}</SelectItem>
                    {avaliacoes.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.titulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                  : !selectedSchool || selectedSchool === 'all')
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
              ? 'Hierarquia: Estado → Município → Escola → Série → Turma. Selecione a escola para gerar por turma, por série ou pela escola inteira.'
              : `Selecione Escola e Série primeiro, depois escolha o(a) ${labelItemAplicado}. Se houver várias turmas, escolha a turma específica.`}
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
              {isGeneratingPDF ? 'Gerando PDF...' : 'Imprimir / Gerar PDF'}
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
