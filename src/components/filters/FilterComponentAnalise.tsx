import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { ResultsPeriodMonthYearPicker } from "./ResultsPeriodMonthYearPicker";
import { normalizeResultsPeriodYm } from "@/utils/resultsPeriod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Filter } from "lucide-react";
import {
  EvaluationResultsApiService,
  REPORT_ENTITY_TYPE_ANSWER_SHEET,
  type ReportEntityTypeQuery,
} from "@/services/evaluation/evaluationResultsApi";
import { useToast } from "@/hooks/use-toast";
import { InstrumentPickerField } from "./InstrumentPickerField";
import {
  buildPickerContextLines,
  toInstrumentPickerItems,
  toInstrumentPickerSeries,
} from "./instrumentPickerHelpers";

// Interfaces para os filtros
interface State {
  id: string;
  name: string;
  uf: string;
}

interface Municipality { 
  id: string; 
  name: string; 
  state: string; 
}

interface School { 
  id: string; 
  name: string; 
  municipality: string; 
}

interface Evaluation {
  id: string;
  titulo: string;
  disciplina: string;
  disciplinas?: string[];
  status: string;
  data_aplicacao: string;
}

interface FilterComponentAnaliseProps {
  selectedState: string;
  selectedMunicipality: string;
  selectedSchool: string;
  selectedEvaluation: string;
  onStateChange: (state: string) => void;
  onMunicipalityChange: (municipality: string) => void;
  onSchoolChange: (school: string) => void;
  onSchoolSelectDetail?: (school: { id: string; name: string } | null) => void;
  onEvaluationChange: (evaluation: string) => void;
  isLoadingFilters: boolean;
  onLoadingChange: (loading: boolean) => void;
  // Props para hierarquia
  userRole?: string;
  canSelectState?: boolean;
  canSelectMunicipality?: boolean;
  canSelectSchool?: boolean;
  fallbackSchools?: Array<{
    id: string;
    name: string;
    municipalityId?: string;
  }>;
  // Prop para ordenação personalizada: quando true, Avaliação vem antes de Escola
  loadSchoolsAfterEvaluation?: boolean;
  /** Quando definido, envia `report_entity_type=answer_sheet` nas rotas de filtros. */
  reportEntityType?: ReportEntityTypeQuery;
  /** Somente admin: query `city_id` (município selecionado; token sem cidade). */
  adminCityIdQuery?: string;
  /**
   * Apenas troca a ordem visual dos selects (ex.: Avaliação/Cartão resposta antes de Escola),
   * sem alterar a lógica de carregamento (efeitos) baseada em `loadSchoolsAfterEvaluation`.
   */
  displayEvaluationFirst?: boolean;
  /** `all` ou `YYYY-MM` (mês de aplicação online / correção cartão). */
  selectedPeriod?: string;
  onPeriodChange?: (period: string) => void;
  /** Conteúdo extra no mesmo card (ex.: Série / Turma), abaixo da grade principal. */
  extraFilters?: ReactNode;
}

export function FilterComponentAnalise({
  selectedState,
  selectedMunicipality,
  selectedSchool,
  selectedEvaluation,
  onStateChange,
  onMunicipalityChange,
  onSchoolChange,
  onSchoolSelectDetail,
  onEvaluationChange,
  isLoadingFilters,
  onLoadingChange,
  // Props para hierarquia
  userRole,
  canSelectState = true,
  canSelectMunicipality = true,
  canSelectSchool = true,
  fallbackSchools = [],
  // Prop para ordenação personalizada
  loadSchoolsAfterEvaluation = false,
  reportEntityType,
  adminCityIdQuery,
  displayEvaluationFirst = false,
  selectedPeriod = "all",
  onPeriodChange = () => {},
  extraFilters,
}: FilterComponentAnaliseProps) {
  const { toast } = useToast();
  const periodoForApi = useMemo(() => {
    if (selectedPeriod === "all") return undefined;
    const n = normalizeResultsPeriodYm(selectedPeriod);
    return n === "all" ? undefined : n;
  }, [selectedPeriod]);

  const isAnswerSheetReport = reportEntityType === REPORT_ENTITY_TYPE_ANSWER_SHEET;
  const evaluationFilterLabel = isAnswerSheetReport ? "Cartão resposta" : "Avaliações";
  const evaluationPlaceholder = isAnswerSheetReport
    ? "Selecione o cartão resposta"
    : "Selecione a avaliação";
  const hierarchyEvaluationStep = isAnswerSheetReport ? "Cartão resposta" : "Avaliação";

  // Ordem visual de UI (não necessariamente acopla ao modo de carregamento)
  const uiEvaluationFirst = loadSchoolsAfterEvaluation || displayEvaluationFirst;
  const selectedEvaluationRequiredForSchools = loadSchoolsAfterEvaluation;

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const schoolsRequestIdRef = useRef(0);
  const evaluationsRequestIdRef = useRef(0);

  // Estados dos dados dos filtros
  const [states, setStates] = useState<State[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [evaluationsByMunicipality, setEvaluationsByMunicipality] = useState<Evaluation[]>([]);
  const [modalPickerEvaluations, setModalPickerEvaluations] = useState<Evaluation[]>([]);
  const [seriesDisponiveis, setSeriesDisponiveis] = useState<Array<{ id: string; nome: string }>>([]);
  const [modalSeriesDisponiveis, setModalSeriesDisponiveis] = useState<
    Array<{ id: string; nome: string }>
  >([]);
  const [modalPickerLoading, setModalPickerLoading] = useState(false);
  const normalizedRole = (userRole ?? "").toLowerCase();
  const mustSelectSpecificSchool = ["diretor", "coordenador", "professor"].includes(normalizedRole);
  const onMunicipalityChangeRef = useRef(onMunicipalityChange);

  // Garantir que o valor selecionado (vindo da hierarquia) exista nas opções do Select,
  // senão o dropdown pode não abrir (Radix exige valor presente nas opções)
  const statesForSelect = useMemo(() => {
    if (selectedState === "all") return states;
    const exists = states.some((s) => s.id === selectedState);
    if (exists) return states;
    return [...states, { id: selectedState, name: "Carregando…", uf: selectedState }];
  }, [states, selectedState]);

  const municipalitiesForSelect = useMemo(() => {
    if (selectedMunicipality === "all") return municipalities;
    const exists = municipalities.some((m) => m.id === selectedMunicipality);
    if (exists) return municipalities;
    return [...municipalities, { id: selectedMunicipality, name: "Carregando…", state: selectedState }];
  }, [municipalities, selectedMunicipality, selectedState]);

  const schoolsForSelect = useMemo(() => {
    if (selectedSchool === "all") return schools;
    const exists = schools.some((s) => s.id === selectedSchool);
    if (exists) return schools;
    return [...schools, { id: selectedSchool, name: "Carregando…", municipality: selectedMunicipality }];
  }, [schools, selectedSchool, selectedMunicipality]);

  const onSchoolChangeRef = useRef(onSchoolChange);
  const onEvaluationChangeRef = useRef(onEvaluationChange);

  useEffect(() => {
    onMunicipalityChangeRef.current = onMunicipalityChange;
  }, [onMunicipalityChange]);

  useEffect(() => {
    onSchoolChangeRef.current = onSchoolChange;
  }, [onSchoolChange]);

  useEffect(() => {
    onEvaluationChangeRef.current = onEvaluationChange;
  }, [onEvaluationChange]);

  const periodResetInitRef = useRef(false);
  useEffect(() => {
    if (!periodResetInitRef.current) {
      periodResetInitRef.current = true;
      return;
    }
    onEvaluationChangeRef.current("all");
    onSchoolChangeRef.current("all");
  }, [selectedPeriod]);

  // Carregar filtros iniciais
  const loadInitialFilters = useCallback(async () => {
    try {
      onLoadingChange(true);
      const statesData = await EvaluationResultsApiService.getFilterStates(
        reportEntityType,
        adminCityIdQuery,
        periodoForApi
      );
      setStates(statesData.map(state => ({
        id: state.id,
        name: state.nome,
        uf: state.id
      })));
    } catch (error) {
      toast({
        title: "Erro ao carregar filtros",
        description: "Não foi possível carregar os filtros. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      onLoadingChange(false);
    }
  }, [toast, onLoadingChange, reportEntityType, adminCityIdQuery, periodoForApi]);

  useEffect(() => {
    loadInitialFilters();
  }, [loadInitialFilters]);

  // Carregar municípios quando estado for selecionado
  useEffect(() => {
    const loadMunicipalities = async () => {
      if (selectedState !== 'all') {
        try {
          onLoadingChange(true);
          const municipalitiesData = await EvaluationResultsApiService.getFilterMunicipalities(
            selectedState,
            reportEntityType,
            adminCityIdQuery,
            periodoForApi
          );
          const formattedMunicipalities = municipalitiesData.map(municipality => ({
            id: municipality.id,
            name: municipality.nome,
            state: selectedState
          }));
          setMunicipalities(formattedMunicipalities);
          setSchools([]);
          setEvaluationsByMunicipality([]);

          const municipalityExists = formattedMunicipalities.some(
            (municipality) => municipality.id === selectedMunicipality
          );

          // Só resetar se o município não existir na lista E o usuário puder alterar (evita apagar pré-seleção do professor)
          if (!municipalityExists && canSelectMunicipality) {
            onMunicipalityChangeRef.current('all');
            onSchoolChangeRef.current('all');
            onEvaluationChangeRef.current('all');
          }
        } catch (error) {
          // Silenciar
        } finally {
          onLoadingChange(false);
        }
      } else {
        setMunicipalities([]);
        setSchools([]);
        setEvaluationsByMunicipality([]);
        // Só resetar no parent quando o usuário pode alterar (evita apagar pré-seleção do professor ao montar)
        if (canSelectMunicipality) {
          onMunicipalityChangeRef.current('all');
          onSchoolChangeRef.current('all');
          onEvaluationChangeRef.current('all');
        }
      }
    };

    loadMunicipalities();
  }, [selectedState, canSelectMunicipality, reportEntityType, adminCityIdQuery, periodoForApi]);

  // Carregar escolas quando `loadSchoolsAfterEvaluation=true` (modo dependente de avaliação)
  useEffect(() => {
    if (!loadSchoolsAfterEvaluation) return;

    const loadSchools = async () => {
      const requestId = ++schoolsRequestIdRef.current;

      if (selectedMunicipality !== 'all' && selectedState !== 'all' && selectedEvaluation !== 'all') {
        try {
          onLoadingChange(true);
          const schoolsData = await withTimeout(
            EvaluationResultsApiService.getFilterSchoolsByEvaluation({
              estado: selectedState,
              municipio: selectedMunicipality,
              avaliacao: selectedEvaluation,
              ...(reportEntityType ? { report_entity_type: reportEntityType } : {}),
              ...(adminCityIdQuery ? { city_id: adminCityIdQuery } : {}),
              ...(periodoForApi ? { periodo: periodoForApi } : {}),
            }),
            20000,
            'Tempo esgotado ao carregar escolas.'
          );

          let formattedSchools = schoolsData.map(school => ({
            id: school.id,
            name: school.nome,
            municipality: selectedMunicipality,
          }));

          if (formattedSchools.length === 0 && fallbackSchools.length > 0) {
            const fallbackMatches = fallbackSchools.filter(
              (school) =>
                !school.municipalityId || school.municipalityId === selectedMunicipality
            );
            formattedSchools = fallbackMatches.map((school) => ({
              id: school.id,
              name: school.name,
              municipality: selectedMunicipality,
            }));
          } else if (fallbackSchools.length > 0) {
            const existingIds = new Set(formattedSchools.map((school) => school.id));
            fallbackSchools.forEach((fallbackSchool) => {
              const matchesMunicipality =
                !fallbackSchool.municipalityId ||
                fallbackSchool.municipalityId === selectedMunicipality;
              if (matchesMunicipality && !existingIds.has(fallbackSchool.id)) {
                formattedSchools.push({
                  id: fallbackSchool.id,
                  name: fallbackSchool.name,
                  municipality: selectedMunicipality,
                });
              }
            });
          }

          if (requestId === schoolsRequestIdRef.current) setSchools(formattedSchools);

          if (mustSelectSpecificSchool && formattedSchools.length > 0) {
            const alreadySelected = formattedSchools.some(school => school.id === selectedSchool);
            if (!alreadySelected) {
              const schoolToSelect = formattedSchools[0].id;
              onSchoolChangeRef.current(schoolToSelect);
            }
          } else if (!mustSelectSpecificSchool) {
            const alreadySelected = formattedSchools.some(school => school.id === selectedSchool);
            if (!alreadySelected && selectedSchool !== 'all') {
              onSchoolChangeRef.current('all');
            }
          }
        } catch (error) {
          if (requestId === schoolsRequestIdRef.current) setSchools([]);
        } finally {
          onLoadingChange(false);
        }
      } else {
        // Se não tiver avaliação selecionada, limpar escolas
        if (requestId === schoolsRequestIdRef.current) setSchools([]);
        onSchoolChangeRef.current('all');
      }
    };

    loadSchools();
  }, [
    selectedMunicipality,
    selectedState,
    selectedEvaluation,
    selectedSchool,
    mustSelectSpecificSchool,
    fallbackSchools,
    loadSchoolsAfterEvaluation,
    reportEntityType,
    adminCityIdQuery,
    periodoForApi,
    onLoadingChange,
  ]);

  // Carregar escolas quando `loadSchoolsAfterEvaluation=false` (modo original dependente de Estado/Município)
  useEffect(() => {
    if (loadSchoolsAfterEvaluation) return;

    const loadSchools = async () => {
      const requestId = ++schoolsRequestIdRef.current;

      if (selectedMunicipality !== 'all' && selectedState !== 'all') {
        try {
          onLoadingChange(true);
          const schoolsData = await withTimeout(
            EvaluationResultsApiService.getFilterSchools({
              municipio: selectedMunicipality,
              estado: selectedState,
              ...(reportEntityType ? { report_entity_type: reportEntityType } : {}),
              ...(adminCityIdQuery ? { city_id: adminCityIdQuery } : {}),
              ...(periodoForApi ? { periodo: periodoForApi } : {}),
            }),
            20000,
            'Tempo esgotado ao carregar escolas.'
          );

          let formattedSchools = schoolsData.map(school => ({
            id: school.id,
            name: school.nome,
            municipality: selectedMunicipality,
          }));

          if (formattedSchools.length === 0 && fallbackSchools.length > 0) {
            const fallbackMatches = fallbackSchools.filter(
              (school) =>
                !school.municipalityId || school.municipalityId === selectedMunicipality
            );
            formattedSchools = fallbackMatches.map((school) => ({
              id: school.id,
              name: school.name,
              municipality: selectedMunicipality,
            }));
          } else if (fallbackSchools.length > 0) {
            const existingIds = new Set(formattedSchools.map((school) => school.id));
            fallbackSchools.forEach((fallbackSchool) => {
              const matchesMunicipality =
                !fallbackSchool.municipalityId ||
                fallbackSchool.municipalityId === selectedMunicipality;
              if (matchesMunicipality && !existingIds.has(fallbackSchool.id)) {
                formattedSchools.push({
                  id: fallbackSchool.id,
                  name: fallbackSchool.name,
                  municipality: selectedMunicipality,
                });
              }
            });
          }

          if (requestId === schoolsRequestIdRef.current) setSchools(formattedSchools);
          setEvaluationsByMunicipality([]);

          if (mustSelectSpecificSchool && formattedSchools.length > 0) {
            const alreadySelected = formattedSchools.some(school => school.id === selectedSchool);
            if (!alreadySelected) {
              const schoolToSelect = formattedSchools[0].id;
              onSchoolChangeRef.current(schoolToSelect);
              onEvaluationChangeRef.current('all');
            }
          } else if (!mustSelectSpecificSchool) {
            const alreadySelected = formattedSchools.some(school => school.id === selectedSchool);
            if (!alreadySelected && selectedSchool !== 'all') {
              onSchoolChangeRef.current('all');
              onEvaluationChangeRef.current('all');
            }
          }
        } catch (error) {
          if (requestId === schoolsRequestIdRef.current) setSchools([]);
        } finally {
          onLoadingChange(false);
        }
      } else {
        if (requestId === schoolsRequestIdRef.current) setSchools([]);
        setEvaluationsByMunicipality([]);
        onSchoolChangeRef.current('all');
        onEvaluationChangeRef.current('all');
      }
    };

    loadSchools();
  }, [
    selectedMunicipality,
    selectedState,
    selectedSchool,
    mustSelectSpecificSchool,
    fallbackSchools,
    loadSchoolsAfterEvaluation,
    reportEntityType,
    adminCityIdQuery,
    periodoForApi,
    onLoadingChange,
  ]);

  const mapEvaluationsResponse = useCallback(
    (
      evaluationsData: Array<{
        id: string;
        titulo: string;
        disciplina?: string;
        disciplinas?: string[];
      }>
    ) =>
      evaluationsData.map((evaluation) => ({
        id: evaluation.id,
        titulo: evaluation.titulo,
        disciplina: evaluation.disciplina ?? "",
        disciplinas: evaluation.disciplinas,
        status: "concluida",
        data_aplicacao: new Date().toISOString(),
      })),
    []
  );

  const fetchEvaluations = useCallback(
    async (modalFilters?: { serieFiltro: string; nome: string }, forModal = false) => {
      const requestId = ++evaluationsRequestIdRef.current;
      const geoReady = selectedState !== "all" && selectedMunicipality !== "all";
      if (!geoReady) {
        if (requestId === evaluationsRequestIdRef.current) {
          setEvaluationsByMunicipality([]);
          setSeriesDisponiveis([]);
        }
        onEvaluationChangeRef.current("all");
        return;
      }

      const baseFilters = {
        estado: selectedState,
        municipio: selectedMunicipality,
        ...(!forModal &&
        !loadSchoolsAfterEvaluation &&
        selectedSchool !== "all"
          ? { escola: selectedSchool }
          : {}),
        ...(reportEntityType ? { report_entity_type: reportEntityType } : {}),
        ...(adminCityIdQuery ? { city_id: adminCityIdQuery } : {}),
        ...(periodoForApi ? { periodo: periodoForApi } : {}),
        ...(modalFilters?.serieFiltro && modalFilters.serieFiltro !== "all"
          ? { serie_filtro: modalFilters.serieFiltro }
          : {}),
        ...(modalFilters?.nome?.trim() ? { nome: modalFilters.nome.trim() } : {}),
      };

      try {
        if (forModal) setModalPickerLoading(true);
        else onLoadingChange(true);

        const { evaluations, seriesDisponiveis: series } = await withTimeout(
          EvaluationResultsApiService.getFilterEvaluationsWithSeries(baseFilters),
          20000,
          "Tempo esgotado ao carregar avaliações."
        );
        const mappedEvaluations = mapEvaluationsResponse(evaluations);
        if (requestId === evaluationsRequestIdRef.current) {
          if (forModal) {
            setModalPickerEvaluations(mappedEvaluations);
            if (!modalFilters) setModalSeriesDisponiveis(series);
          } else {
            setEvaluationsByMunicipality(mappedEvaluations);
            if (!modalFilters) setSeriesDisponiveis(series);
          }
        }
        if (!forModal) {
          const evaluationExists = mappedEvaluations.some(
            (evaluation) => evaluation.id === selectedEvaluation
          );
          if (!evaluationExists && selectedEvaluation !== "all") {
            onEvaluationChangeRef.current("all");
          }
        }
      } catch {
        if (requestId === evaluationsRequestIdRef.current) setEvaluationsByMunicipality([]);
      } finally {
        if (forModal) setModalPickerLoading(false);
        else onLoadingChange(false);
      }
    },
    [
      selectedState,
      selectedMunicipality,
      selectedSchool,
      loadSchoolsAfterEvaluation,
      reportEntityType,
      adminCityIdQuery,
      periodoForApi,
      mapEvaluationsResponse,
      selectedEvaluation,
      onLoadingChange,
    ]
  );

  // Carregar avaliações quando município for selecionado (e escola se loadSchoolsAfterEvaluation for false)
  useEffect(() => {
    void fetchEvaluations();
  }, [fetchEvaluations]);

  const evaluationPickerItems = useMemo(() => {
    const base = toInstrumentPickerItems(evaluationsByMunicipality);
    if (
      selectedEvaluation === "all" ||
      !selectedEvaluation ||
      base.some((item) => item.id === selectedEvaluation)
    ) {
      return base;
    }
    const selected = modalPickerEvaluations.find((e) => e.id === selectedEvaluation);
    return selected ? [...base, ...toInstrumentPickerItems([selected])] : base;
  }, [evaluationsByMunicipality, modalPickerEvaluations, selectedEvaluation]);

  const modalEvaluationPickerItems = useMemo(
    () =>
      toInstrumentPickerItems(
        modalPickerEvaluations.length > 0 ? modalPickerEvaluations : evaluationsByMunicipality
      ),
    [modalPickerEvaluations, evaluationsByMunicipality]
  );

  const evaluationSeriesOptions = useMemo(
    () =>
      toInstrumentPickerSeries(
        modalSeriesDisponiveis.length > 0 ? modalSeriesDisponiveis : seriesDisponiveis
      ),
    [modalSeriesDisponiveis, seriesDisponiveis]
  );

  const evaluationPickerDisabled =
    isLoadingFilters || selectedState === "all" || selectedMunicipality === "all";

  const evaluationPickerDisabledWithSchool =
    evaluationPickerDisabled ||
    (!loadSchoolsAfterEvaluation && mustSelectSpecificSchool && selectedSchool === "all");

  const evaluationPickerContextLines = useMemo(
    () =>
      buildPickerContextLines({
        estado: statesForSelect.find((s) => s.id === selectedState)?.name ?? selectedState,
        municipio:
          municipalitiesForSelect.find((m) => m.id === selectedMunicipality)?.name ??
          selectedMunicipality,
        escola:
          !loadSchoolsAfterEvaluation && selectedSchool !== "all"
            ? schoolsForSelect.find((s) => s.id === selectedSchool)?.name ?? selectedSchool
            : undefined,
        periodo:
          selectedPeriod !== "all"
            ? normalizeResultsPeriodYm(selectedPeriod) !== "all"
              ? normalizeResultsPeriodYm(selectedPeriod)
              : selectedPeriod
            : undefined,
      }),
    [
      statesForSelect,
      selectedState,
      municipalitiesForSelect,
      selectedMunicipality,
      loadSchoolsAfterEvaluation,
      selectedSchool,
      schoolsForSelect,
      selectedPeriod,
    ]
  );

  const renderEvaluationPicker = (disabled: boolean) => (
    <InstrumentPickerField
      label={evaluationFilterLabel}
      value={selectedEvaluation}
      onChange={onEvaluationChange}
      items={evaluationPickerItems}
      modalItems={modalEvaluationPickerItems}
      seriesOptions={evaluationSeriesOptions}
      disabled={disabled}
      loading={isLoadingFilters && !modalPickerLoading}
      modalLoading={modalPickerLoading}
      placeholder={evaluationPlaceholder}
      modalTitle={isAnswerSheetReport ? "Selecionar cartão resposta" : "Selecionar avaliação"}
      allowAll
      allLabel="Todas"
      contextLines={evaluationPickerContextLines}
      contextRequiredMessage="Selecione estado e município nos filtros antes de escolher."
      emptyMessage={
        isAnswerSheetReport ? "Nenhum cartão resposta encontrado." : "Nenhuma avaliação encontrada."
      }
      onModalOpen={() => void fetchEvaluations(undefined, true)}
      onModalFiltersChange={(filters) => void fetchEvaluations(filters, true)}
    />
  );

  return (
    <Card className="overflow-visible">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Filtros
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-visible">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full min-w-0">
          {/* Estado */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              Estado
              {!canSelectState && (
                <Badge variant="secondary" className="text-xs">Pré-selecionado</Badge>
              )}
            </label>
            <Select
              value={selectedState}
              onValueChange={onStateChange}
              disabled={isLoadingFilters || !canSelectState}
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder="Selecione o estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {statesForSelect.map(state => (
                  <SelectItem key={state.id} value={state.id}>
                    {state.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Município */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              Município
              {!canSelectMunicipality && (
                <Badge variant="secondary" className="text-xs">Pré-selecionado</Badge>
              )}
            </label>
            <Select
              value={selectedMunicipality}
              onValueChange={onMunicipalityChange}
              disabled={isLoadingFilters || selectedState === 'all' || !canSelectMunicipality}
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder="Selecione o município" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {municipalitiesForSelect.map(municipality => (
                  <SelectItem key={municipality.id} value={municipality.id}>
                    {municipality.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ResultsPeriodMonthYearPicker
            value={selectedPeriod}
            onChange={onPeriodChange}
            disabled={isLoadingFilters || selectedMunicipality === "all"}
          />

          {/* Renderizar Avaliação antes de Escola quando uiEvaluationFirst for true */}
          {uiEvaluationFirst ? (
            <>
              {renderEvaluationPicker(evaluationPickerDisabled)}

              {/* Escola */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  Escola
                  {!canSelectSchool && (
                    <Badge variant="secondary" className="text-xs">Pré-selecionado</Badge>
                  )}
                </label>
                <Select
                  value={selectedSchool}
                  onValueChange={onSchoolChange}
                  disabled={
                    isLoadingFilters ||
                    selectedMunicipality === 'all' ||
                    (selectedEvaluationRequiredForSchools && selectedEvaluation === 'all') ||
                    !canSelectSchool
                  }
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Selecione a escola" />
                  </SelectTrigger>
                  <SelectContent>
                    {!mustSelectSpecificSchool && (
                      <SelectItem value="all">Todas</SelectItem>
                    )}
                    {schoolsForSelect.map(school => (
                      <SelectItem key={school.id} value={school.id}>
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              {/* Escola */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  Escola
                  {!canSelectSchool && (
                    <Badge variant="secondary" className="text-xs">Pré-selecionado</Badge>
                  )}
                </label>
                <Select
                  value={selectedSchool}
                  onValueChange={onSchoolChange}
                  disabled={isLoadingFilters || selectedMunicipality === 'all' || !canSelectSchool}
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Selecione a escola" />
                  </SelectTrigger>
                  <SelectContent>
                    {!mustSelectSpecificSchool && (
                      <SelectItem value="all">Todas</SelectItem>
                    )}
                    {schoolsForSelect.map(school => (
                      <SelectItem key={school.id} value={school.id}>
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {renderEvaluationPicker(evaluationPickerDisabledWithSchool)}
            </>
          )}
        </div>

        {extraFilters != null && extraFilters !== false && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full min-w-0">
              {extraFilters}
            </div>
          </div>
        )}

        {/* Informação sobre filtros */}
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-700 dark:text-blue-400">
            💡 <strong>Hierarquia dos Filtros:</strong> {uiEvaluationFirst 
              ? `Estado → Município → ${hierarchyEvaluationStep} → Escola`
              : `Estado → Município → Escola → ${hierarchyEvaluationStep}`}
          </p>
          <p className="text-sm text-blue-700 mt-1 dark:text-blue-400">
            <strong>Estado</strong> e <strong>Município</strong> são obrigatórios. 
            {loadSchoolsAfterEvaluation 
              ? isAnswerSheetReport ? (
                <> Selecione um <strong>cartão resposta</strong> para visualizar as escolas disponíveis.</>
              ) : (
                <> Selecione uma <strong>avaliação</strong> para visualizar as escolas disponíveis.</>
              )
              : <> Para diretores, coordenadores e professores, a seleção de <strong>Escola</strong> é sempre obrigatória.</>}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
