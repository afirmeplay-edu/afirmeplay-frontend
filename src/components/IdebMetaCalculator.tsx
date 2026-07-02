import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Calculator, Search, Loader2, 
  Zap, CheckCircle2, Layout, 
  Edit3, Save, School, Plus, Trash2, Target, TrendingUp, Calendar,
  LineChart as LineChartIcon, BarChart3, Download
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar, LabelList } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';
import { getUserHierarchyContext, type UserHierarchyContext } from '@/utils/userHierarchy';
import { EvaluationResultsApiService } from '@/services/evaluation/evaluationResultsApi';
import { 
  IdebData, 
  EducationLevel, 
  Escola, 
  HistoricoCompleto 
} from '@/types/idebMeta';
import { 
  analyzeHistoricalGrowth,
  buildHistoricalDisplaySeries,
  calculateGrowthNeeded,
  filterValidIdebHistory,
  getLatestValidIdebFromHistory,
} from '@/utils/idebCalculator';
import {
  getSavedData,
  saveData,
  addSchool as apiAddSchool,
  removeSchool as apiRemoveSchool,
  toApiMunicipalityData,
  type IdebMetaLevel,
} from '@/services/idebMetaApi';
import { generateIdebMetaPdf, captureIdebMetaChartElement } from '@/services/reports/idebMetaPdf';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** Linha do modal de edição (valores em string para inputs controlados) */
type EditingHistoryRow = { ano: string; ideb: string; port: string; math: string; fluxo: string };

/** Roles que devem ver resultado da escola (diretor/coordenador) */
const SCHOOL_RESULT_ROLES = ['diretor', 'coordenador'];
/** Roles que devem ver resultado municipal (admin/tec adm) */
const MUNICIPAL_RESULT_ROLES = ['admin', 'tecadm'];

export default function IdebMetaCalculator() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [userHierarchyContext, setUserHierarchyContext] = useState<UserHierarchyContext | null>(null);
  
  const userRole = user?.role?.toLowerCase();
  const showSchoolResult = userRole && SCHOOL_RESULT_ROLES.includes(userRole);
  const showMunicipalResult = userRole && MUNICIPAL_RESULT_ROLES.includes(userRole);
  
  const [loading, setLoading] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [isEditingHistory, setIsEditingHistory] = useState(false);
  const [editingHistory, setEditingHistory] = useState<EditingHistoryRow[] | null>(null);
  
  const [states, setStates] = useState<Array<{ id: string; nome: string }>>([]);
  const [selectedState, setSelectedState] = useState<string>('all');
  const [municipalities, setMunicipalities] = useState<Array<{ id: string; nome: string }>>([]);
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<EducationLevel>(EducationLevel.INICIAIS);
  
  const [municipalityData, setMunicipalityData] = useState<IdebData | null>(null);
  const [activeEntity, setActiveEntity] = useState<IdebData | Escola | null>(null);
  const [customTarget, setCustomTarget] = useState<number>(0);
  const [isAddingSchool, setIsAddingSchool] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolIdeb, setNewSchoolIdeb] = useState('0');
  const [schoolToDeleteId, setSchoolToDeleteId] = useState<string | null>(null);
  const [targetYear, setTargetYear] = useState<number>(2025);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedForRef = useRef<string | null>(null);
  const serieHistoricaExportRef = useRef<HTMLDivElement>(null);
  const crescimentoBienalExportRef = useRef<HTMLDivElement>(null);
  const memorialCalculoExportRef = useRef<HTMLDivElement>(null);

  const chartDataLabelFill =
    typeof document !== 'undefined' &&
    (document.documentElement.classList.contains('dark') ||
      document.body.classList.contains('dark'))
      ? '#f1f5f9'
      : '#374151';

  const levelAsApi = selectedLevel as IdebMetaLevel;
  const hasValidContext = selectedMunicipality && selectedMunicipality !== 'all' && selectedState !== 'all';

  const applyProjectedMeta = useCallback((historico: HistoricoCompleto[]) => {
    if (filterValidIdebHistory(historico).length > 0) {
      setCustomTarget(analyzeHistoricalGrowth(historico).projectedMeta);
    }
  }, []);

  const applyPayloadToState = useCallback(
    (payload: { municipalityData: IdebData; customTarget: number; activeEntityId: string | null; targetYear: number }) => {
      const { municipalityData, customTarget, activeEntityId, targetYear: ty } = payload;
      setMunicipalityData(municipalityData);
      setCustomTarget(customTarget);
      const entity =
        activeEntityId && municipalityData.escolas
          ? municipalityData.escolas.find((s) => s.id === activeEntityId)
          : null;
      setActiveEntity(entity ?? municipalityData);
      if (entity?.historico) applyProjectedMeta(entity.historico);
      else if (payload.customTarget != null) setCustomTarget(payload.customTarget);
      if (typeof ty === 'number' && ty >= 2020 && ty <= 2040) setTargetYear(ty);
    },
    [applyProjectedMeta]
  );

  // Carregar contexto hierárquico para diretor, coordenador e tecadm
  useEffect(() => {
    if (!user?.id || !user?.role) return;
    const role = user.role.toLowerCase();
    if (!['diretor', 'coordenador', 'tecadm'].includes(role)) return;
    getUserHierarchyContext(user.id, user.role).then(setUserHierarchyContext).catch(() => setUserHierarchyContext(null));
  }, [user?.id, user?.role]);

  // Carregar estados ao montar o componente
  useEffect(() => {
    const loadStates = async () => {
      try {
        const statesData = await EvaluationResultsApiService.getFilterStates();
        setStates(statesData);
      } catch (error) {
        console.error('Erro ao carregar estados:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar os estados.',
          variant: 'destructive',
        });
      }
    };
    loadStates();
  }, [toast]);

  // Preencher estado e município para diretor, coordenador e tecadm
  useEffect(() => {
    if (!userHierarchyContext?.municipality || !states.length) return;
    const mun = userHierarchyContext.municipality;
    const stateMatch = states.find((s) => s.id === mun.state || s.nome?.toLowerCase() === mun.state?.toLowerCase());
    if (stateMatch && selectedState === 'all') setSelectedState(stateMatch.id);
  }, [userHierarchyContext, states]);

  // Preencher município após carregar lista (para diretor, coordenador e tecadm)
  useEffect(() => {
    if (!userHierarchyContext?.municipality?.id || !municipalities.length) return;
    const exists = municipalities.some((m) => m.id === userHierarchyContext.municipality!.id);
    if (exists) setSelectedMunicipality(userHierarchyContext.municipality!.id);
  }, [userHierarchyContext, municipalities]);

  // Ao abrir a calculadora com city_id + level definidos, carregar dados salvos da API (uma vez por contexto)
  useEffect(() => {
    if (!hasValidContext) return;
    const key = `${selectedMunicipality}|${selectedLevel}`;
    if (loadedForRef.current === key) return;
    loadedForRef.current = key;
    getSavedData(selectedMunicipality, levelAsApi)
      .then((saved) => {
        if (saved?.municipalityData?.historico?.length) {
          applyPayloadToState({
            municipalityData: saved.municipalityData as IdebData,
            customTarget: saved.customTarget,
            activeEntityId: saved.activeEntityId,
            targetYear: saved.targetYear,
          });
          toast({ title: 'Dados restaurados', description: 'Seus dados salvos foram carregados.' });
        }
      })
      .catch(() => { loadedForRef.current = null; });
  }, [hasValidContext, selectedMunicipality, selectedLevel, levelAsApi, applyPayloadToState, toast]);

  // Carregar municípios quando estado for selecionado
  useEffect(() => {
    const loadMunicipalities = async () => {
      if (selectedState === 'all') {
        setMunicipalities([]);
        setSelectedMunicipality('all');
        return;
      }

      setLoadingCities(true);
      try {
        const municipalitiesData = await EvaluationResultsApiService.getFilterMunicipalities(selectedState);
        setMunicipalities(municipalitiesData);
        const ctxMunId = userHierarchyContext?.municipality?.id;
        const keepMunicipality = ctxMunId && municipalitiesData.some((m: { id: string }) => m.id === ctxMunId);
        setSelectedMunicipality(keepMunicipality ? ctxMunId : 'all');
      } catch (error) {
        console.error('Erro ao carregar municípios:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar os municípios.',
          variant: 'destructive',
        });
      } finally {
        setLoadingCities(false);
      }
    };

    loadMunicipalities();
  }, [selectedState, toast, userHierarchyContext?.municipality?.id]);

  useEffect(() => {
    if (
      !municipalityData ||
      selectedState === 'all' ||
      selectedMunicipality === 'all' ||
      !hasValidContext
    )
      return;
    const activeEntityId =
      activeEntity && 'id' in activeEntity ? activeEntity.id : null;
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      saveDebounceRef.current = null;
      saveData(selectedMunicipality, levelAsApi, {
        municipalityData: toApiMunicipalityData(municipalityData),
        customTarget,
        activeEntityId,
        targetYear,
      }).catch((err) => {
        console.error('Erro ao salvar IDEB meta na API:', err);
        toast({
          title: 'Erro',
          description: 'Não foi possível salvar os dados.',
          variant: 'destructive',
        });
      });
    }, 800);
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, [municipalityData, activeEntity, customTarget, targetYear, selectedState, selectedMunicipality, selectedLevel, hasValidContext, levelAsApi, toast]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMunicipality || selectedMunicipality === 'all' || !selectedState || selectedState === 'all') {
      toast({
        title: 'Campos obrigatórios',
        description: 'Selecione o estado e o município.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      if (hasValidContext) {
        const saved = await getSavedData(selectedMunicipality, levelAsApi);
        if (saved?.municipalityData?.historico?.length) {
          applyPayloadToState({
            municipalityData: saved.municipalityData as IdebData,
            customTarget: saved.customTarget,
            activeEntityId: saved.activeEntityId,
            targetYear: saved.targetYear,
          });
          toast({ title: 'Dados restaurados', description: 'Seus dados salvos foram carregados.' });
          return;
        }
      }

      // Sem dados salvos na API: criar dados de exemplo (sem API de dados históricos IDEB)
      // Em produção, isso viria de um endpoint específico
      const selectedMunicipalityData = municipalities.find(m => m.id === selectedMunicipality);
      const selectedStateData = states.find(s => s.id === selectedState);

      // Criar histórico de exemplo (em produção, viria da API)
      const historico: HistoricoCompleto[] = [
        { ano: 2007, ideb: 3.5, port: 180, math: 175, fluxo: 0.85 },
        { ano: 2009, ideb: 3.8, port: 190, math: 185, fluxo: 0.87 },
        { ano: 2011, ideb: 4.1, port: 200, math: 195, fluxo: 0.89 },
        { ano: 2013, ideb: 4.3, port: 210, math: 205, fluxo: 0.90 },
        { ano: 2015, ideb: 4.5, port: 220, math: 215, fluxo: 0.91 },
        { ano: 2017, ideb: 4.7, port: 230, math: 225, fluxo: 0.92 },
        { ano: 2019, ideb: 4.9, port: 240, math: 235, fluxo: 0.93 },
        { ano: 2021, ideb: 5.1, port: 250, math: 245, fluxo: 0.94 },
        { ano: 2023, ideb: 5.3, port: 260, math: 255, fluxo: 0.95 },
      ];

      if (!selectedMunicipalityData || !selectedStateData) {
        throw new Error('Dados do município ou estado não encontrados');
      }

      const sortedHist = [...historico].sort((a, b) => b.ano - a.ano);
      const latest = sortedHist[0];

      // Validar dados antes de criar
      if (!latest || isNaN(latest.ideb) || latest.ideb < 0) {
        throw new Error('Dados históricos inválidos');
      }

      const baseId = `esc_${selectedMunicipality}_${selectedLevel.replace(/\s/g, '_')}`;
      const escolasExemplo: Escola[] = [
        {
          id: `${baseId}_1`,
          nome: `Escola Municipal ${selectedMunicipalityData.nome} (1)`,
          level: selectedLevel,
          ideb: latest.ideb - 0.2,
          historico: [
            { ano: 2023, ideb: latest.ideb - 0.2, port: latest.port - 10, math: latest.math - 10, fluxo: latest.fluxo },
            { ano: 2021, ideb: latest.ideb - 0.4, port: latest.port - 20, math: latest.math - 20, fluxo: latest.fluxo },
          ],
        },
        {
          id: `${baseId}_2`,
          nome: `Escola Municipal ${selectedMunicipalityData.nome} (2)`,
          level: selectedLevel,
          ideb: latest.ideb + 0.1,
          historico: [
            { ano: 2023, ideb: latest.ideb + 0.1, port: latest.port + 5, math: latest.math + 5, fluxo: latest.fluxo },
            { ano: 2021, ideb: latest.ideb - 0.1, port: latest.port - 5, math: latest.math - 5, fluxo: latest.fluxo },
          ],
        },
      ].filter((e) => e.level === selectedLevel);

      const fullData: IdebData = {
        municipio: selectedMunicipalityData.nome,
        uf: selectedStateData.nome,
        escola: 'Rede Municipal',
        rede: 'Municipal',
        ano: latest.ano,
        ideb: latest.ideb,
        proficienciaPortugues: latest.port,
        proficienciaMatematica: latest.math,
        fluxo: latest.fluxo,
        level: selectedLevel,
        historico: sortedHist,
        escolas: escolasExemplo,
      };

      setMunicipalityData(fullData);
      applyProjectedMeta(fullData.historico);

      // Por perfil: diretor/coordenador veem resultado da escola; admin/tec admin veem municipal
      const hierarchyForSearch = userHierarchyContext ?? (user?.id && user?.role && showSchoolResult ? await getUserHierarchyContext(user.id, user.role) : null);
      const realSchoolName = hierarchyForSearch?.school?.name ?? hierarchyForSearch?.school?.nome;
      if (showSchoolResult && hierarchyForSearch?.school) {
        const schoolId = hierarchyForSearch.school.id;
        const schoolNameLower = (realSchoolName ?? '').toLowerCase();
        const school = fullData.escolas?.find(
          (s) => s.id === schoolId || (s.nome?.toLowerCase().includes(schoolNameLower) || schoolNameLower.includes(s.nome?.toLowerCase() ?? ''))
        );
        if (school) {
          const escolaComNomeReal = { ...school, nome: realSchoolName || school.nome };
          setActiveEntity(escolaComNomeReal);
          setMunicipalityData((prev) =>
            prev?.escolas
              ? { ...prev, escolas: prev.escolas.map((s) => (s.id === school.id ? escolaComNomeReal : s)) }
              : prev
          );
          if (school.historico?.length) applyProjectedMeta(school.historico);
        } else if (realSchoolName) {
          const escolaDoUsuario: Escola = {
            id: schoolId,
            nome: realSchoolName,
            level: selectedLevel,
            ideb: fullData.ideb,
            historico: fullData.historico,
          };
          setActiveEntity(escolaDoUsuario);
          applyProjectedMeta(fullData.historico);
          toast({ title: 'Sua escola', description: `Exibindo resultado para "${realSchoolName}" com dados da rede municipal.`, variant: 'default' });
        } else {
          setActiveEntity(fullData);
          toast({ title: 'Aviso', description: 'Nome da escola não disponível; exibindo rede municipal.', variant: 'default' });
        }
      } else {
        setActiveEntity(fullData);
      }
      
      toast({
        title: 'Sucesso',
        description: 'Dados carregados com sucesso.',
      });
    } catch (error) {
      console.error('Erro na busca:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro',
        description: `Erro ao buscar dados: ${errorMessage}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEntitySelect = (entity: IdebData | Escola) => {
    setActiveEntity(entity);
    if (entity.historico) {
      applyProjectedMeta(entity.historico);
    }
  };

  const handleAddSchoolSubmit = () => {
    if (!municipalityData || !newSchoolName.trim()) {
      toast({
        title: 'Campo obrigatório',
        description: 'Informe o nome da unidade escolar.',
        variant: 'destructive',
      });
      return;
    }
    const idebValue = parseFloat(newSchoolIdeb.replace(',', '.'));
    const newSchool: Escola = {
      id: `esc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      nome: newSchoolName.trim(),
      level: selectedLevel,
      ideb: isNaN(idebValue) ? 0 : idebValue,
      historico: [
        {
          ano: municipalityData.ano,
          ideb: isNaN(idebValue) ? 0 : idebValue,
          port: 0,
          math: 0,
          fluxo: 1,
        },
      ],
    };
    const updatedSchools = [...(municipalityData.escolas || []), newSchool];
    setMunicipalityData({ ...municipalityData, escolas: updatedSchools });
    setNewSchoolName('');
    setNewSchoolIdeb('0');
    setIsAddingSchool(false);
    if (hasValidContext) {
      apiAddSchool(selectedMunicipality, levelAsApi, newSchool).catch((err) => {
        console.error('Erro ao adicionar escola na API:', err);
        toast({
          title: 'Aviso',
          description: 'Escola adicionada localmente; não foi possível sincronizar na nuvem.',
          variant: 'default',
        });
      });
    }
    toast({ title: 'Sucesso', description: 'Unidade escolar adicionada.', variant: 'default' });
  };

  const confirmDeleteSchool = () => {
    if (!municipalityData || !schoolToDeleteId) return;
    const idToRemove = schoolToDeleteId;
    const updatedSchools = municipalityData.escolas?.filter((s) => s.id !== idToRemove) ?? [];
    const newData = { ...municipalityData, escolas: updatedSchools };
    setMunicipalityData(newData);
    if (activeEntity && 'id' in activeEntity && activeEntity.id === idToRemove) {
      setActiveEntity(newData);
      if (newData.historico) applyProjectedMeta(newData.historico);
    }
    setSchoolToDeleteId(null);
    if (hasValidContext) {
      apiRemoveSchool(selectedMunicipality, levelAsApi, idToRemove).catch((err) => {
        console.error('Erro ao remover escola na API:', err);
        toast({
          title: 'Aviso',
          description: 'Escola removida localmente; não foi possível sincronizar na nuvem.',
          variant: 'default',
        });
      });
    }
    toast({ title: 'Sucesso', description: 'Unidade escolar removida.', variant: 'default' });
  };

  const handleUpdateHistory = (updatedHistory: HistoricoCompleto[]) => {
    // Validar histórico
    if (!updatedHistory || updatedHistory.length === 0) {
      toast({
        title: 'Erro de validação',
        description: 'O histórico não pode estar vazio.',
        variant: 'destructive',
      });
      return;
    }

    // Validar dados de cada ano
    const invalidYears = updatedHistory.filter(h => 
      !h.ano || h.ano < 2000 || h.ano > 2030 ||
      isNaN(h.ideb) || h.ideb < 0 || h.ideb > 10 ||
      isNaN(h.port) || h.port < 0 ||
      isNaN(h.math) || h.math < 0 ||
      isNaN(h.fluxo) || h.fluxo < 0 || h.fluxo > 1
    );

    if (invalidYears.length > 0) {
      toast({
        title: 'Erro de validação',
        description: 'Alguns dados do histórico são inválidos. Verifique os valores inseridos.',
        variant: 'destructive',
      });
      return;
    }

    const sorted = [...updatedHistory].sort((a, b) => b.ano - a.ano);
    const latest = sorted[0];

    try {
      if (activeEntity && 'municipio' in activeEntity) {
        const newData = { 
          ...activeEntity, 
          historico: sorted, 
          ideb: latest.ideb, 
          ano: latest.ano,
          proficienciaPortugues: latest.port,
          proficienciaMatematica: latest.math,
          fluxo: latest.fluxo,
        };
        setMunicipalityData(newData);
        setActiveEntity(newData);
      } else if (activeEntity && municipalityData && 'id' in activeEntity) {
        const updatedEscolas = municipalityData.escolas?.map(s =>
          s.id === activeEntity.id
            ? { ...s, historico: sorted, ideb: latest.ideb }
            : s
        );
        const newMunicipality = { ...municipalityData, escolas: updatedEscolas };
        setMunicipalityData(newMunicipality);
        setActiveEntity({ ...activeEntity, historico: sorted, ideb: latest.ideb });
      }
      applyProjectedMeta(sorted);
      setIsEditingHistory(false);
      toast({
        title: 'Sucesso',
        description: 'Histórico atualizado com sucesso.',
      });
    } catch (error) {
      console.error('Erro ao atualizar histórico:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar histórico. Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const growthInfo = useMemo(() => {
    if (!activeEntity?.historico) return null;
    return analyzeHistoricalGrowth(activeEntity.historico);
  }, [activeEntity]);

  const displaySeries = useMemo(() => {
    if (!activeEntity?.historico) return null;
    return buildHistoricalDisplaySeries(activeEntity.historico);
  }, [activeEntity]);

  const latestValidIdeb = useMemo(() => {
    if (!activeEntity?.historico) return null;
    return getLatestValidIdebFromHistory(activeEntity.historico);
  }, [activeEntity]);

  const canCalculateMeta = Boolean(latestValidIdeb && growthInfo);

  const calculationData = useMemo(() => {
    if (!activeEntity?.historico || !growthInfo || !latestValidIdeb) return null;
    const validHist = filterValidIdebHistory(activeEntity.historico);
    if (validHist.length === 0) return null;
    const current = Number(validHist[validHist.length - 1].ideb);
    const prevValue = validHist.length > 1 ? Number(validHist[validHist.length - 2].ideb) : current;
    return calculateGrowthNeeded(current, customTarget, current - prevValue);
  }, [activeEntity, customTarget, growthInfo, latestValidIdeb]);

  const filteredEscolas = useMemo(() => {
    return municipalityData?.escolas?.filter(s => s.level === selectedLevel) || [];
  }, [municipalityData, selectedLevel]);

  const serieHistoricaChartData = useMemo(() => {
    if (!displaySeries?.years?.length) return [];
    return displaySeries.years.map((ano, i) => ({
      ano: String(ano),
      ideb: displaySeries.values[i] ?? 0,
    }));
  }, [displaySeries]);

  const crescimentoBienalChartData = useMemo(() => {
    if (!growthInfo?.years?.length || !growthInfo?.diffs?.length) return [];
    return growthInfo.diffs.map((diff, i) => ({
      periodo: `${growthInfo.years[i]}-${growthInfo.years[i + 1]}`,
      crescimento: diff,
    }));
  }, [growthInfo]);

  const activeEntityDisplayName = useMemo(() => {
    if (!activeEntity) return '';
    if ('municipio' in activeEntity) return activeEntity.municipio;
    const escola = activeEntity as Escola;
    const nomeContexto = userHierarchyContext?.school?.name ?? userHierarchyContext?.school?.nome;
    return (escola.nome || nomeContexto || 'Unidade escolar').trim() || 'Unidade escolar';
  }, [activeEntity, userHierarchyContext?.school]);

  const lockFilters = (showSchoolResult || userRole === 'tecadm') && !!userHierarchyContext?.municipality;

  const handleExportPdf = async () => {
    if (!activeEntity || !municipalityData) {
      toast({
        title: 'Sem dados',
        description: 'Carregue os dados do município antes de exportar o PDF.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setGeneratingPdf(true);
      const stateName = states.find((s) => s.id === selectedState)?.nome ?? municipalityData.uf;
      const municipalityName =
        municipalities.find((m) => m.id === selectedMunicipality)?.nome ?? municipalityData.municipio;

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const [serieHistoricaChart, crescimentoBienalChart, memorialCalculoChart] = await Promise.all([
        captureIdebMetaChartElement(serieHistoricaExportRef.current),
        captureIdebMetaChartElement(crescimentoBienalExportRef.current),
        captureIdebMetaChartElement(memorialCalculoExportRef.current),
      ]);

      const schoolsForPdf =
        'municipio' in activeEntity ? filteredEscolas : [activeEntity as Escola];

      await generateIdebMetaPdf({
        cityId: selectedMunicipality !== 'all' ? selectedMunicipality : null,
        municipalityData,
        activeEntity,
        activeEntityName: activeEntityDisplayName,
        entityType: 'municipio' in activeEntity ? 'municipal' : 'school',
        customTarget,
        targetYear,
        level: selectedLevel,
        stateName,
        municipalityName,
        schools: schoolsForPdf,
        fileNameBase: `metas-ideb-${municipalityName}-${activeEntityDisplayName}`,
        chartSnapshots: {
          serieHistorica: serieHistoricaChart,
          crescimentoBienal: crescimentoBienalChart,
          memorialCalculo: memorialCalculoChart,
        },
      });

      toast({
        title: 'PDF gerado',
        description: 'O relatório de metas IDEB foi baixado com sucesso.',
      });
    } catch (error) {
      console.error('Erro ao gerar PDF de metas IDEB:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível gerar o relatório em PDF.',
        variant: 'destructive',
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-full min-w-0">
      {/* Header */}
      <div className="space-y-2 min-w-0">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3 flex-wrap">
          <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-primary shrink-0" />
          <span className="break-words">Calculadora de Metas IDEB</span>
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm sm:text-base break-words">
          Calcule e projete metas IDEB baseadas em histórico de crescimento e análise de desempenho
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar - Filtros */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Search className="w-4 h-4" />
                Consultar Rede
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleSearch} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  <Select 
                    value={selectedState} 
                    onValueChange={setSelectedState}
                    disabled={lockFilters}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os estados</SelectItem>
                      {states.map(state => (
                        <SelectItem key={state.id} value={state.id}>
                          {state.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="municipality">Município</Label>
                  <Select 
                    value={selectedMunicipality} 
                    onValueChange={setSelectedMunicipality}
                    disabled={lockFilters || loadingCities || selectedState === 'all'}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingCities ? 'Carregando...' : 'Selecione o município'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os municípios</SelectItem>
                      {municipalities.map(municipality => (
                        <SelectItem key={municipality.id} value={municipality.id}>
                          {municipality.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Nível de Ensino</Label>
                  <div className="flex gap-2 bg-muted p-1 rounded-lg">
                    {Object.values(EducationLevel).map(level => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setSelectedLevel(level)}
                        className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-all ${
                          selectedLevel === level
                            ? 'bg-background shadow-sm text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {level.split(' ')[1]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="target-year">Ano da Meta</Label>
                  <div className="flex items-center gap-2 rounded-lg border bg-background px-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="target-year"
                      type="number"
                      min={2020}
                      max={2040}
                      value={targetYear}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v) && v >= 2020 && v <= 2040) setTargetYear(v);
                      }}
                      className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  disabled={loading || selectedMunicipality === 'all' || selectedState === 'all'}
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Carregando...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Sincronizar Dados
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {municipalityData && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm min-w-0">
                  <School className="w-4 h-4 shrink-0" />
                  <span className="truncate">{selectedLevel}</span>
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddingSchool(true)}
                  title="Adicionar Unidade Escolar"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[450px] overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => handleEntitySelect(municipalityData)}
                    className={`w-full p-3 rounded-lg flex items-center justify-between gap-2 border-2 transition-all min-w-0 ${
                      activeEntity === municipalityData
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted border-transparent hover:bg-muted/80'
                    }`}
                  >
                    <span className="text-xs font-bold uppercase truncate min-w-0">Rede Municipal</span>
                    <span className="text-sm font-bold tabular-nums shrink-0">{municipalityData.ideb.toFixed(1)}</span>
                  </button>
                  <div className="h-px bg-border my-2" />
                  {filteredEscolas.map((school) => (
                    <div
                      key={school.id}
                      className={`w-full p-3 rounded-lg flex items-center justify-between gap-2 border-2 transition-all group min-w-0 ${
                        activeEntity === school
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card border-border hover:border-primary/50'
                      }`}
                    >
                      <button
                        type="button"
                        className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left"
                        onClick={() => handleEntitySelect(school)}
                      >
                        <span className="text-xs font-semibold truncate min-w-0 flex-1" title={school.nome}>
                          {school.nome}
                        </span>
                        <span className="text-sm font-bold tabular-nums shrink-0">{school.ideb.toFixed(1)}</span>
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 h-8 w-8 p-0 text-muted-foreground hover:text-destructive group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSchoolToDeleteId(school.id);
                        }}
                        title="Excluir unidade escolar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {!activeEntity ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-6 sm:p-12 text-center min-h-[400px]">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Layout className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2 break-words">Portal de Metas</h2>
                <p className="text-muted-foreground max-w-sm text-sm sm:text-base break-words px-2">
                  Selecione o município e o nível de ensino para gerar o memorial de cálculo e as projeções bienais.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Card de Resumo */}
              <Card>
                <CardHeader className="flex flex-col gap-3">
                  <CardTitle className="flex items-start gap-2 min-w-0 text-base sm:text-lg leading-snug">
                    <Target className="w-5 h-5 mt-0.5 shrink-0" />
                    <span className="line-clamp-2 break-normal" title={activeEntityDisplayName}>
                      {activeEntityDisplayName.toUpperCase()}
                    </span>
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2 w-full">
                    <Badge variant="outline" className="text-[10px] sm:text-xs whitespace-normal break-words items-start h-auto py-1">
                      {'municipio' in activeEntity ? 'CONSOLIDADO MUNICIPAL' : 'UNIDADE ESCOLAR'}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] sm:text-xs whitespace-normal break-words items-start h-auto py-1">
                      {selectedLevel}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs sm:text-sm whitespace-nowrap"
                      onClick={handleExportPdf}
                      disabled={generatingPdf}
                    >
                      {generatingPdf ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4 mr-2" />
                      )}
                      Exportar PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs sm:text-sm whitespace-nowrap"
                      onClick={() => {
                          if (activeEntity?.historico?.length) {
                            setEditingHistory(
                              [...activeEntity.historico]
                                .sort((a, b) => b.ano - a.ano)
                                .map((h) => ({
                                  ano: String(h.ano),
                                  ideb: String(h.ideb),
                                  port: String(h.port),
                                  math: String(h.math),
                                  fluxo: String(h.fluxo),
                                }))
                            );
                            setIsEditingHistory(true);
                          }
                        }}
                      >
                        <Edit3 className="w-4 h-4 mr-2" />
                        Editar Base
                      </Button>
                    </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div className="bg-muted p-3 sm:p-6 rounded-lg text-center min-w-0 overflow-hidden">
                      <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase mb-1 sm:mb-2 truncate">
                        IDEB {'ano' in activeEntity ? activeEntity.ano : municipalityData?.ano}
                      </p>
                      <p className="text-2xl sm:text-4xl font-bold text-foreground tabular-nums break-keep">
                        {activeEntity.ideb.toFixed(1)}
                      </p>
                    </div>
                    <div className="bg-primary p-3 sm:p-6 rounded-lg text-center min-w-0 overflow-hidden">
                      <p className="text-[10px] sm:text-xs font-semibold text-primary-foreground/90 uppercase mb-1 sm:mb-2 truncate">
                        Meta {targetYear}
                      </p>
                      <p className="text-2xl sm:text-4xl font-bold text-primary-foreground tabular-nums break-keep">
                        {canCalculateMeta ? customTarget.toFixed(1) : '—'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tabela de Histórico */}
              {displaySeries && displaySeries.years.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Histórico de Evolução
                    </CardTitle>
                    {displaySeries.hasMissingScores && (
                      <p className="text-sm text-muted-foreground">
                        Períodos com IDEB 0,0 indicam ausência de nota e não entram no cálculo da meta.
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="w-full min-w-0 overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0 [-webkit-overflow-scrolling:touch]">
                      <Table className="min-w-[480px] w-max">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[60px] sm:w-[80px] min-w-[60px]">Ano</TableHead>
                            {displaySeries.years.slice(0, -1).map(year => (
                              <TableHead key={year} className="text-center min-w-[44px] whitespace-nowrap px-1 sm:px-2">
                                {year}
                              </TableHead>
                            ))}
                            <TableHead className="text-center bg-muted text-muted-foreground min-w-[44px] whitespace-nowrap px-1 sm:px-2">
                              {'ano' in activeEntity ? activeEntity.ano : municipalityData?.ano}
                            </TableHead>
                            <TableHead className="text-center bg-primary text-primary-foreground min-w-[50px] whitespace-nowrap px-1 sm:px-2">
                              Meta {targetYear}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-semibold whitespace-nowrap">IDEB</TableCell>
                            {displaySeries.values.slice(0, -1).map((value, idx) => (
                              <TableCell
                                key={idx}
                                className={`text-center font-bold tabular-nums px-1 sm:px-2 ${
                                  value <= 0 ? 'text-muted-foreground' : ''
                                }`}
                              >
                                {value.toFixed(1)}
                              </TableCell>
                            ))}
                            <TableCell className="text-center font-bold bg-muted text-foreground tabular-nums px-1 sm:px-2">
                              {activeEntity.ideb.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-center font-bold bg-primary text-primary-foreground tabular-nums px-1 sm:px-2">
                              {canCalculateMeta ? customTarget.toFixed(1) : '—'}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-semibold whitespace-nowrap">∆ Bienal</TableCell>
                            {displaySeries.diffs.map((diff, idx) => (
                              <TableCell key={idx} className="text-center tabular-nums px-1 sm:px-2">
                                {diff === null ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  <span className={`font-semibold whitespace-nowrap ${diff >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                                    {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}
                                  </span>
                                )}
                              </TableCell>
                            ))}
                            <TableCell colSpan={2}></TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Série histórica - Gráfico de evolução do IDEB (rolagem horizontal para separar os anos) */}
              {displaySeries && serieHistoricaChartData.length > 0 && (
                <div ref={serieHistoricaExportRef} className="rounded-lg border bg-card text-card-foreground shadow-sm">
                <Card className="border-0 shadow-none">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <LineChartIcon className="w-5 h-5" />
                      Série histórica
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Evolução do IDEB por ano. Role horizontalmente para ver todos os anos.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="w-full min-w-0 overflow-x-auto [-webkit-overflow-scrolling:touch]">
                      <ChartContainer
                        config={{
                          ano: { label: 'Ano' },
                          ideb: { label: 'IDEB', color: 'hsl(var(--chart-1))' },
                        }}
                        className="h-[280px] w-full"
                        style={{ minWidth: Math.max(320, serieHistoricaChartData.length * 56) }}
                      >
                        <LineChart data={serieHistoricaChartData} margin={{ left: 12, right: 12, top: 28, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="ano"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            tick={{ fontSize: 11 }}
                            interval={0}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            tick={{ fontSize: 11 }}
                            domain={[0, 10]}
                            tickFormatter={(v) => v.toFixed(1)}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Line
                            type="monotone"
                            dataKey="ideb"
                            stroke="var(--color-ideb)"
                            strokeWidth={2}
                            dot={{ r: 4 }}
                            activeDot={{ r: 6 }}
                            isAnimationActive={false}
                          >
                            <LabelList
                              dataKey="ideb"
                              position="top"
                              offset={10}
                              fill={chartDataLabelFill}
                              className="ideb-chart-data-label"
                              fontSize={11}
                              fontWeight={600}
                              formatter={(value: number) =>
                                value != null && Number.isFinite(Number(value))
                                  ? Number(value).toFixed(1)
                                  : ''
                              }
                            />
                          </Line>
                        </LineChart>
                      </ChartContainer>
                    </div>
                  </CardContent>
                </Card>
                </div>
              )}

              {/* Crescimento bienal - Gráfico de barras (rolagem horizontal para separar os períodos) */}
              {canCalculateMeta && growthInfo && crescimentoBienalChartData.length > 0 && (
                <div ref={crescimentoBienalExportRef} className="rounded-lg border bg-card text-card-foreground shadow-sm">
                <Card className="border-0 shadow-none">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      Crescimento bienal
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Variação do IDEB entre edições (∆ bienal). Role horizontalmente para ver todos os períodos.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="w-full min-w-0 overflow-x-auto [-webkit-overflow-scrolling:touch]">
                      <ChartContainer
                        config={{
                          periodo: { label: 'Período' },
                          crescimento: { label: '∆ Bienal', color: 'hsl(var(--chart-2))' },
                        }}
                        className="h-[280px] w-full"
                        style={{ minWidth: Math.max(320, crescimentoBienalChartData.length * 72) }}
                      >
                        <BarChart data={crescimentoBienalChartData} margin={{ left: 12, right: 12, top: 28, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="periodo"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            tick={{ fontSize: 11 }}
                            interval={0}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            tick={{ fontSize: 11 }}
                            tickFormatter={(v) => (v >= 0 ? `+${v}` : String(v))}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar
                            dataKey="crescimento"
                            fill="var(--color-crescimento)"
                            radius={[4, 4, 0, 0]}
                            nameKey="∆ Bienal"
                            isAnimationActive={false}
                          >
                            <LabelList
                              dataKey="crescimento"
                              position="top"
                              offset={6}
                              fill={chartDataLabelFill}
                              className="ideb-chart-data-label"
                              fontSize={11}
                              fontWeight={600}
                              formatter={(value: number) => {
                                const n = Number(value);
                                if (!Number.isFinite(n)) return '';
                                return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
                              }}
                            />
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    </div>
                  </CardContent>
                </Card>
                </div>
              )}

              {/* Memorial de Cálculo */}
              {canCalculateMeta && calculationData && growthInfo && latestValidIdeb && (
                <div
                  ref={memorialCalculoExportRef}
                  data-ideb-pdf-root="memorial-calculo"
                  className="rounded-lg border bg-muted border-border overflow-visible p-1"
                >
                <Card className="bg-muted border-0 shadow-none overflow-visible">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <Zap className="w-5 h-5 text-primary" />
                      Memorial de Cálculo
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6 text-foreground overflow-visible">
                    <div>
                      <p className="text-muted-foreground mb-4 text-sm sm:text-base break-words">
                        A projeção de meta em <strong className="tabular-nums">{customTarget.toFixed(1)}</strong> baseia-se no IDEB base de{' '}
                        <span className="tabular-nums">{latestValidIdeb.ideb.toFixed(1)}</span> ({latestValidIdeb.ano}) acrescido do pico de crescimento (+<span className="tabular-nums">{growthInfo.maxDiff.toFixed(1)}</span>).
                        {displaySeries?.hasMissingScores && (
                          <> Períodos com nota 0,0 foram ignorados no cálculo.</>
                        )}
                      </p>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-2 p-3 sm:p-4 bg-background/50 rounded-lg min-w-0 border border-border overflow-visible">
                          <span className="text-xs sm:text-sm font-semibold text-primary uppercase leading-normal">Alvo</span>
                          <span className="text-2xl sm:text-3xl font-bold tabular-nums shrink-0">{customTarget.toFixed(1)}</span>
                        </div>
                        <Slider
                          value={[customTarget]}
                          onValueChange={(value) => setCustomTarget(value[0])}
                          min={3}
                          max={10}
                          step={0.1}
                          className="w-full py-1"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                      <div className="p-3 sm:p-4 bg-background/50 rounded-lg min-w-0 border border-border overflow-visible">
                        <p className="text-[10px] sm:text-xs font-semibold text-primary uppercase mb-1 sm:mb-2 leading-normal">Diferença</p>
                        <p className="text-lg sm:text-2xl font-bold text-foreground tabular-nums break-keep">+{calculationData.difference.toFixed(2)}</p>
                      </div>
                      <div className="p-3 sm:p-4 bg-background/50 rounded-lg min-w-0 border border-border overflow-visible">
                        <p className="text-[10px] sm:text-xs font-semibold text-primary uppercase mb-1 sm:mb-2 leading-normal">Esforço %</p>
                        <p className="text-lg sm:text-2xl font-bold text-foreground tabular-nums break-keep">{calculationData.percent.toFixed(2)}%</p>
                      </div>
                      <div className="p-3 sm:p-4 bg-background/50 rounded-lg min-w-0 border border-border overflow-visible">
                        <p className="text-[10px] sm:text-xs font-semibold text-primary uppercase mb-1 sm:mb-2 leading-normal">Pico</p>
                        <p className="text-lg sm:text-2xl font-bold text-foreground tabular-nums break-keep">+{growthInfo.maxDiff.toFixed(1)}</p>
                      </div>
                      <div className="p-3 sm:p-4 bg-primary rounded-lg flex flex-col justify-center min-w-0 overflow-visible">
                        <p className="text-[10px] sm:text-xs font-semibold text-primary-foreground/90 uppercase mb-1 sm:mb-2 leading-normal">Diagnóstico</p>
                        <p className="text-base sm:text-xl font-bold text-primary-foreground flex items-center gap-2 flex-wrap">
                          <span className="whitespace-nowrap">VIÁVEL</span>
                          <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Edição de Histórico */}
      <Dialog
        open={isEditingHistory}
        onOpenChange={(open) => {
          if (!open) setEditingHistory(null);
          setIsEditingHistory(open);
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Série Histórica Dinâmica</DialogTitle>
            <p className="text-sm text-muted-foreground min-w-0 break-words">
              CONFIGURAÇÃO DE BASE: {activeEntityDisplayName.toUpperCase()}
            </p>
          </DialogHeader>
          {editingHistory && editingHistory.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    const maxAno = editingHistory.reduce((acc, row) => Math.max(acc, parseInt(row.ano, 10) || 0), 0);
                    setEditingHistory([
                      { ano: String(maxAno + 2), ideb: '0', port: '0', math: '0', fluxo: '1' },
                      ...editingHistory,
                    ]);
                  }}
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Ano
                </Button>
              </div>
              {editingHistory.map((row, idx) => (
                <div
                  key={`${row.ano}-${idx}`}
                  className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-2 sm:gap-3 p-3 sm:p-4 bg-muted rounded-lg items-center"
                >
                  <div className="col-span-1 lg:col-span-2 min-w-0">
                    <Label className="text-xs">Ano Base</Label>
                    <Input
                      type="number"
                      value={row.ano}
                      min={2000}
                      max={2030}
                      className="mt-1"
                      onChange={(e) => {
                        const next = [...editingHistory];
                        next[idx] = { ...next[idx], ano: e.target.value };
                        setEditingHistory(next);
                      }}
                    />
                  </div>
                  <div className="col-span-1 lg:col-span-2 min-w-0">
                    <Label className="text-xs">IDEB</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      max={10}
                      value={row.ideb}
                      className="mt-1"
                      onChange={(e) => {
                        const next = [...editingHistory];
                        next[idx] = { ...next[idx], ideb: e.target.value };
                        setEditingHistory(next);
                      }}
                    />
                  </div>
                  <div className="col-span-1 lg:col-span-2 min-w-0">
                    <Label className="text-xs">Português</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={row.port}
                      className="mt-1"
                      onChange={(e) => {
                        const next = [...editingHistory];
                        next[idx] = { ...next[idx], port: e.target.value };
                        setEditingHistory(next);
                      }}
                    />
                  </div>
                  <div className="col-span-1 lg:col-span-2 min-w-0">
                    <Label className="text-xs">Matemática</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={row.math}
                      className="mt-1"
                      onChange={(e) => {
                        const next = [...editingHistory];
                        next[idx] = { ...next[idx], math: e.target.value };
                        setEditingHistory(next);
                      }}
                    />
                  </div>
                  <div className="col-span-1 lg:col-span-2 min-w-0">
                    <Label className="text-xs">Fluxo</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      max={1}
                      value={row.fluxo}
                      className="mt-1"
                      onChange={(e) => {
                        const next = [...editingHistory];
                        next[idx] = { ...next[idx], fluxo: e.target.value };
                        setEditingHistory(next);
                      }}
                    />
                  </div>
                  <div className="col-span-2 lg:col-span-2 flex justify-end min-w-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (editingHistory.length <= 1) {
                          toast({
                            title: 'Aviso',
                            description: 'O histórico deve ter pelo menos um ano.',
                            variant: 'destructive',
                          });
                          return;
                        }
                        setEditingHistory(editingHistory.filter((_, i) => i !== idx));
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex justify-end gap-4 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingHistory(null);
                    setIsEditingHistory(false);
                  }}
                >
                  Descartar
                </Button>
                <Button
                  onClick={() => {
                    const consolidated: HistoricoCompleto[] = editingHistory
                      .map((row) => ({
                        ano: parseInt(row.ano, 10),
                        ideb: parseFloat(row.ideb.replace(',', '.')) || 0,
                        port: parseFloat(row.port.replace(',', '.')) || 0,
                        math: parseFloat(row.math.replace(',', '.')) || 0,
                        fluxo: parseFloat(row.fluxo.replace(',', '.')) || 0,
                      }))
                      .sort((a, b) => b.ano - a.ano);
                    const invalid = consolidated.filter(
                      (h) =>
                        !h.ano || h.ano < 2000 || h.ano > 2030 ||
                        isNaN(h.ideb) || h.ideb < 0 || h.ideb > 10 ||
                        isNaN(h.port) || h.port < 0 ||
                        isNaN(h.math) || h.math < 0 ||
                        isNaN(h.fluxo) || h.fluxo < 0 || h.fluxo > 1
                    );
                    if (invalid.length > 0) {
                      toast({
                        title: 'Erro de validação',
                        description: 'Alguns dados do histórico são inválidos. Verifique anos (2000-2030), IDEB (0-10) e fluxo (0-1).',
                        variant: 'destructive',
                      });
                      return;
                    }
                    handleUpdateHistory(consolidated);
                    setEditingHistory(null);
                    setIsEditingHistory(false);
                  }}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Consolidar Alterações
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Nova Unidade Escolar */}
      <Dialog open={isAddingSchool} onOpenChange={setIsAddingSchool}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Unidade Escolar</DialogTitle>
            <DialogDescription>
              Adicione uma escola ao município para acompanhar metas por unidade.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-school-name">Nome da escola</Label>
              <Input
                id="new-school-name"
                placeholder="Ex: Escola Municipal Profa. Maria Silva"
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-school-ideb">IDEB (último ano)</Label>
              <Input
                id="new-school-ideb"
                type="number"
                step="0.1"
                min={0}
                max={10}
                placeholder="0"
                value={newSchoolIdeb}
                onChange={(e) => setNewSchoolIdeb(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingSchool(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddSchoolSubmit}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação excluir escola */}
      <AlertDialog open={!!schoolToDeleteId} onOpenChange={(open) => !open && setSchoolToDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir unidade escolar?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Os dados de histórico desta escola serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteSchool} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
