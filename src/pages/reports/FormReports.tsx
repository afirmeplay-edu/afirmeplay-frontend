import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { 
  BarChart3,
  Users, 
  FileText,
  Filter,
  AlertTriangle,
  TrendingDown,
  WifiOff,
  UserX,
  School,
  ChevronLeft,
  ChevronRight,
  Loader2,
  GraduationCap,
  Download,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { FormResultsFiltersApiService } from '@/services/formResultsFiltersApi';
import { FormFiltersApiService } from '@/services/formFiltersApi';
import { FormMultiSelect } from '@/components/ui/form-multi-select';
import {
  FormReportProfileTabContent,
  buildQuestionNumberMap,
  getOrderedProfileKeys,
} from '@/components/reports/form-reports/FormReportProfileCharts';
import { generateFormReportsProfilesPdf } from '@/services/reports/formReportsProfilesPdf';
import { generateFormReportsStudentsPdf } from '@/services/reports/formReportsStudentsPdf';

// Interfaces
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
}

interface Grade {
  id: string;
  name: string;
}

interface Class {
  id: string;
  name: string;
}

interface FormOption {
  id: string;
  name: string;
}

interface Student {
  alunoId: string;
  alunoNome: string;
  userId: string;
  dataNascimento?: string;
  escolaId: string;
  escolaNome: string;
  gradeId: string;
  gradeName: string;
  classId?: string;
  className?: string;
  resposta?: string;
}

interface IndexData {
  total: number;
  porcentagem: number;
  alunos: {
    data: Student[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

/** Normaliza resposta de índices (agregado usa indicesConsolidados; resultado de um formulário pode vir em outro campo) */
function normalizeIndicesResponse(data: any): any {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const consolidated =
    data.indicesConsolidados ?? data.indices ?? data;
  if (typeof consolidated !== 'object' || consolidated === null) return null;
  return { ...data, indicesConsolidados: consolidated };
}

/** Normaliza resposta de perfis (agregado usa perfisConsolidados; resultado de um formulário pode vir em outro campo) */
function normalizeProfilesResponse(data: any): any {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const consolidated =
    data.perfisConsolidados ?? data.perfis ?? data;
  if (typeof consolidated !== 'object' || consolidated === null) return null;
  return { ...data, perfisConsolidados: consolidated };
}

const INDEX_TYPE_TITLES: Record<string, { title: string; icon: typeof AlertTriangle; color: string }> = {
  distorcaoIdadeSerie: {
    title: 'Alunos com distorção idade-série',
    icon: AlertTriangle,
    color: 'bg-orange-500',
  },
  historicoReprovacao: {
    title: 'Alunos com histórico de reprovação',
    icon: TrendingDown,
    color: 'bg-red-500',
  },
  semAcessoInternet: {
    title: 'Alunos sem acesso a internet',
    icon: WifiOff,
    color: 'bg-blue-500',
  },
  baixoEngajamentoFamiliar: {
    title: 'Baixo engajamento familiar',
    icon: UserX,
    color: 'bg-purple-500',
  },
};

const FormReports = () => {
  const { toast } = useToast();

  // Estados dos filtros (formulário é obrigatório: 'all' = agregado ou UUID do formulário)
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('all');
  const [selectedForm, setSelectedForm] = useState<string>('');
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

  // Estados dos dados dos filtros (nova cascata: Estado → Município → Formulário → Escola → Série → Turma)
  const [states, setStates] = useState<State[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);

  // Estados de loading
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);

  // Dados do relatório
  const [indicesData, setIndicesData] = useState<any>(null);
  const [profilesData, setProfilesData] = useState<any>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingTaskId, setPollingTaskId] = useState<string | null>(null);
  const [filterDebounce, setFilterDebounce] = useState<NodeJS.Timeout | null>(null);

  // Aba ativa dos perfis
  const [activeTab, setActiveTab] = useState<string>('perfilDemografico');

  // Modal de alunos
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [selectedIndexType, setSelectedIndexType] = useState<string>('');
  const [currentStudentPage, setCurrentStudentPage] = useState(1);
  const [studentsData, setStudentsData] = useState<Student[]>([]);
  const [studentsPagination, setStudentsPagination] = useState<any>(null);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isExportingStudentsPdf, setIsExportingStudentsPdf] = useState(false);

  // Carregar estados iniciais (rota de resultados: GET /forms/results/filter-options)
  useEffect(() => {
    const loadInitialFilters = async () => {
      try {
        setIsLoadingFilters(true);
        const options = await FormResultsFiltersApiService.getFilterOptions({});
        if (options.estados.length > 0) {
          setStates(options.estados.map((e) => ({ id: e.id, name: e.name, uf: e.uf ?? e.id })));
        }
      } catch (error) {
        console.error("Erro ao carregar filtros iniciais:", error);
        toast({
          title: "Erro ao carregar filtros",
          description: "Não foi possível carregar os filtros. Tente novamente.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingFilters(false);
      }
    };

    loadInitialFilters();
  }, [toast]);

  // Carregar municípios quando estado for selecionado
  useEffect(() => {
    const loadMunicipalities = async () => {
      if (selectedState !== 'all') {
        try {
          setIsLoadingFilters(true);
          setSelectedMunicipality('all');
          setSelectedForm('');
          setSelectedSchools([]);
          setSelectedGrades([]);
          setSelectedClasses([]);
          const options = await FormResultsFiltersApiService.getFilterOptions({ estado: selectedState });
          setMunicipalities(options.municipios.map((m) => ({ id: m.id, name: m.name, state: selectedState })));
          setForms([]);
          setSchools([]);
        } catch (error) {
          console.error("Erro ao carregar municípios:", error);
          setMunicipalities([]);
          setForms([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setMunicipalities([]);
        setForms([]);
        setSelectedMunicipality('all');
        setSelectedForm('');
        setSelectedSchools([]);
        setSelectedGrades([]);
        setSelectedClasses([]);
      }
    };

    loadMunicipalities();
  }, [selectedState]);

  // Carregar formulários quando município for selecionado
  useEffect(() => {
    const loadForms = async () => {
      if (selectedState !== 'all' && selectedMunicipality !== 'all') {
        try {
          setIsLoadingFilters(true);
          setSelectedForm('');
          setSelectedSchools([]);
          setSelectedGrades([]);
          setSelectedClasses([]);
          const options = await FormResultsFiltersApiService.getFilterOptions({
            estado: selectedState,
            municipio: selectedMunicipality,
          });
          setForms(options.formularios);
          setSchools([]);
        } catch (error) {
          console.error("Erro ao carregar formulários:", error);
          setForms([]);
          setSchools([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setForms([]);
        setSelectedForm('');
        setSchools([]);
      }
    };

    loadForms();
  }, [selectedState, selectedMunicipality]);

  // Carregar escolas quando formulário for selecionado (obrigatório)
  useEffect(() => {
    const loadSchools = async () => {
      if (
        selectedState !== 'all' &&
        selectedMunicipality !== 'all' &&
        selectedForm &&
        selectedForm !== 'all'
      ) {
        try {
          setIsLoadingFilters(true);
          setSelectedSchools([]);
          setSelectedGrades([]);
          setSelectedClasses([]);
          const options = await FormResultsFiltersApiService.getFilterOptions({
            estado: selectedState,
            municipio: selectedMunicipality,
            formulario: selectedForm,
          });
          const sorted = [...options.escolas].sort((a, b) => a.name.localeCompare(b.name));
          setSchools(sorted);
        } catch (error) {
          console.error("Erro ao carregar escolas:", error);
          setSchools([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else if (selectedForm === 'all') {
        // Agregado: rota de resultados exige formulário para retornar escolas; usa rota antiga só para escolas
        if (selectedState !== 'all' && selectedMunicipality !== 'all') {
          try {
            setIsLoadingFilters(true);
            setSelectedSchools([]);
            setSelectedGrades([]);
            setSelectedClasses([]);
            const schoolsData = await FormFiltersApiService.getFormFilterSchools({
              estado: selectedState,
              municipio: selectedMunicipality,
            });
            const uniqueSchools = Array.from(
              new Map(schoolsData.map((s) => [s.id, { id: s.id, name: s.nome || s.name || '' }])).values()
            ).sort((a, b) => a.name.localeCompare(b.name));
            setSchools(uniqueSchools);
          } catch (error) {
            console.error("Erro ao carregar escolas (agregado):", error);
            setSchools([]);
          } finally {
            setIsLoadingFilters(false);
          }
        } else {
          setSchools([]);
        }
      } else {
        setSchools([]);
        setSelectedSchools([]);
      }
    };

    loadSchools();
  }, [selectedState, selectedMunicipality, selectedForm]);

  // Carregar séries quando escola(s) for(em) selecionada(s)
  useEffect(() => {
    const loadGrades = async () => {
      if (
        selectedState !== 'all' &&
        selectedMunicipality !== 'all' &&
        selectedForm &&
        selectedSchools.length > 0
      ) {
        try {
          setIsLoadingFilters(true);
          const allGradesById = new Map<string, { id: string; name: string }>();
          const allGradesByName = new Map<string, string>();

          if (selectedForm === 'all') {
            for (const schoolId of selectedSchools) {
              try {
                const gradesData = await FormFiltersApiService.getFormFilterGrades({
                  estado: selectedState,
                  municipio: selectedMunicipality,
                  escola: schoolId,
                });
                gradesData.forEach((grade) => {
                  const gradeName = grade.nome?.trim() || '';
                  const normalizedName = gradeName.toLowerCase().trim();
                  if (!allGradesById.has(grade.id) && !allGradesByName.has(normalizedName)) {
                    allGradesById.set(grade.id, { id: grade.id, name: gradeName });
                    allGradesByName.set(normalizedName, grade.id);
                  }
                });
              } catch (error) {
                console.error(`Erro ao carregar séries da escola ${schoolId}:`, error);
              }
            }
          } else {
            for (const schoolId of selectedSchools) {
              try {
                const options = await FormResultsFiltersApiService.getFilterOptions({
                  estado: selectedState,
                  municipio: selectedMunicipality,
                  formulario: selectedForm,
                  escola: schoolId,
                });
                (options.series || []).forEach((grade) => {
                  const gradeName = grade.name?.trim() || '';
                  const normalizedName = gradeName.toLowerCase().trim();
                  if (!allGradesById.has(grade.id) && !allGradesByName.has(normalizedName)) {
                    allGradesById.set(grade.id, { id: grade.id, name: gradeName });
                    allGradesByName.set(normalizedName, grade.id);
                  }
                });
              } catch (error) {
                console.error(`Erro ao carregar séries da escola ${schoolId}:`, error);
              }
            }
          }

          const uniqueGrades = Array.from(allGradesById.values()).sort((a, b) =>
            a.name.localeCompare(b.name)
          );
          setGrades(uniqueGrades);
        } catch (error) {
          console.error("Erro ao carregar séries:", error);
          setGrades([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setGrades([]);
      }
    };

    loadGrades();
  }, [selectedSchools, selectedState, selectedMunicipality, selectedForm]);

  // Carregar turmas quando série(s) for(em) selecionada(s)
  useEffect(() => {
    const loadClasses = async () => {
      if (
        selectedState !== 'all' &&
        selectedMunicipality !== 'all' &&
        selectedForm &&
        selectedSchools.length > 0 &&
        selectedGrades.length > 0
      ) {
        try {
          setIsLoadingFilters(true);
          const allClassesById = new Map<string, { id: string; name: string }>();
          const allClassesByName = new Map<string, string>();

          if (selectedForm === 'all') {
            for (const schoolId of selectedSchools) {
              for (const gradeId of selectedGrades) {
                try {
                  const classesData = await FormFiltersApiService.getFormFilterClasses({
                    estado: selectedState,
                    municipio: selectedMunicipality,
                    escola: schoolId,
                    serie: gradeId,
                  });
                  classesData.forEach((classItem) => {
                    const className = classItem.nome?.trim() || '';
                    const normalizedName = className.toLowerCase().trim();
                    if (!allClassesById.has(classItem.id) && !allClassesByName.has(normalizedName)) {
                      allClassesById.set(classItem.id, { id: classItem.id, name: className });
                      allClassesByName.set(normalizedName, classItem.id);
                    }
                  });
                } catch (error) {
                  console.error(
                    `Erro ao carregar turmas da escola ${schoolId} e série ${gradeId}:`,
                    error
                  );
                }
              }
            }
          } else {
            for (const schoolId of selectedSchools) {
              for (const gradeId of selectedGrades) {
                try {
                  const options = await FormResultsFiltersApiService.getFilterOptions({
                    estado: selectedState,
                    municipio: selectedMunicipality,
                    formulario: selectedForm,
                    escola: schoolId,
                    serie: gradeId,
                  });
                  (options.turmas || []).forEach((classItem) => {
                    const className = classItem.name?.trim() || '';
                    const normalizedName = className.toLowerCase().trim();
                    if (!allClassesById.has(classItem.id) && !allClassesByName.has(normalizedName)) {
                      allClassesById.set(classItem.id, { id: classItem.id, name: className });
                      allClassesByName.set(normalizedName, classItem.id);
                    }
                  });
                } catch (error) {
                  console.error(
                    `Erro ao carregar turmas da escola ${schoolId} e série ${gradeId}:`,
                    error
                  );
                }
              }
            }
          }

          const uniqueClasses = Array.from(allClassesById.values()).sort((a, b) =>
            a.name.localeCompare(b.name)
          );
          setClasses(uniqueClasses);
        } catch (error) {
          console.error("Erro ao carregar turmas:", error);
          setClasses([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setClasses([]);
      }
    };

    loadClasses();
  }, [selectedGrades, selectedSchools, selectedState, selectedMunicipality, selectedForm]);

  // Polling via endpoint de status (apenas relatório agregado)
  const startPollingStatus = useCallback(
    (taskId: string, type: 'indices' | 'profiles') => {
      const statusPath = `/forms/aggregated/results/status/${taskId}`;
      const pollInterval = setInterval(async () => {
        try {
          const statusConfig =
            selectedMunicipality !== 'all' ? { meta: { cityId: selectedMunicipality } } : {};
          const statusResponse = await api.get(statusPath, statusConfig);
          const status = statusResponse.data;

          if (status.status === 'completed') {
            clearInterval(pollInterval);
            setIsPolling(false);
            setPollingTaskId(null);
            if (type === 'indices') {
              setIndicesData(normalizeIndicesResponse(status.result));
            } else {
              setProfilesData(normalizeProfilesResponse(status.result));
            }
            toast({
              title: "Relatório processado",
              description: "O relatório foi gerado com sucesso!",
            });
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            setIsPolling(false);
            setPollingTaskId(null);
            toast({
              title: "Erro ao processar relatório",
              description: status.error || "Ocorreu um erro ao processar o relatório.",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error("Erro ao verificar status da task:", error);
          clearInterval(pollInterval);
          setIsPolling(false);
          setPollingTaskId(null);
        }
      }, 2000);
    },
    [toast, selectedMunicipality]
  );

  // Polling repetindo o mesmo GET até 200 (resultados de um formulário; não usa endpoint de status)
  const startPollingSameGet = useCallback(
    (
      basePath: string,
      type: 'indices' | 'profiles',
      requestConfig: { params: any; meta?: { cityId: string } }
    ) => {
      const url = `${basePath}/${type}`;
      const pollInterval = setInterval(async () => {
        try {
          const response = await api.get(url, requestConfig);
          if (response.status === 200) {
            clearInterval(pollInterval);
            setIsPolling(false);
            setPollingTaskId(null);
            if (type === 'indices') {
              setIndicesData(normalizeIndicesResponse(response.data));
            } else {
              setProfilesData(normalizeProfilesResponse(response.data));
            }
            toast({
              title: "Relatório processado",
              description: "O relatório foi gerado com sucesso!",
            });
          }
          // 202: continua o intervalo
        } catch (error) {
          console.error("Erro ao buscar relatório (polling):", error);
          clearInterval(pollInterval);
          setIsPolling(false);
          setPollingTaskId(null);
        }
      }, 2500);
    },
    [toast]
  );

  // Função para buscar relatório (agregado ou de um formulário); formulário é obrigatório
  const fetchReport = useCallback(async () => {
    if (
      selectedState === 'all' ||
      selectedMunicipality === 'all' ||
      !selectedForm ||
      selectedSchools.length === 0
    ) {
      return;
    }

    setIsLoadingReport(true);
    setIndicesData(null);
    setProfilesData(null);

    const params: any = {
      state: selectedState,
      municipio: selectedMunicipality,
      page: 1,
      limit: 20,
    };
    if (selectedSchools.length > 0) params.escola = selectedSchools.join(',');
    if (selectedGrades.length > 0) params.serie = selectedGrades.join(',');
    if (selectedClasses.length > 0) params.turma = selectedClasses.join(',');

    const isAggregated = selectedForm === 'all';
    const basePath = isAggregated
      ? '/forms/aggregated/results'
      : `/forms/${selectedForm}/results`;
    const requestConfig =
      selectedMunicipality !== 'all' ? { params, meta: { cityId: selectedMunicipality } } : { params };

    try {
      const indicesResponse = await api.get(`${basePath}/indices`, requestConfig);
      if (indicesResponse.status === 200) {
        setIndicesData(normalizeIndicesResponse(indicesResponse.data));
      } else if (indicesResponse.status === 202) {
        if (isAggregated) {
          const taskId = indicesResponse.data.taskId;
          setPollingTaskId(taskId);
          setIsPolling(true);
          startPollingStatus(taskId, 'indices');
        } else {
          setIsPolling(true);
          startPollingSameGet(basePath, 'indices', requestConfig);
        }
      }

      const profilesResponse = await api.get(`${basePath}/profiles`, requestConfig);
      if (profilesResponse.status === 200) {
        setProfilesData(normalizeProfilesResponse(profilesResponse.data));
      } else if (profilesResponse.status === 202) {
        if (isAggregated) {
          const taskId = profilesResponse.data.taskId;
          startPollingStatus(taskId, 'profiles');
        } else {
          startPollingSameGet(basePath, 'profiles', requestConfig);
        }
      }
    } catch (error: any) {
      console.error("Erro ao buscar relatório:", error);
      if (error.response?.status === 202) {
        if (isAggregated) {
          const taskId = error.response.data.taskId;
          setPollingTaskId(taskId);
          setIsPolling(true);
          startPollingStatus(taskId, 'indices');
        } else {
          setIsPolling(true);
          startPollingSameGet(basePath, 'indices', requestConfig);
        }
      } else {
        toast({
          title: "Erro ao carregar relatório",
          description: error.response?.data?.message || "Não foi possível carregar o relatório.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoadingReport(false);
    }
  }, [
    selectedState,
    selectedMunicipality,
    selectedForm,
    selectedSchools,
    selectedGrades,
    selectedClasses,
    toast,
    startPollingStatus,
    startPollingSameGet,
  ]);

  // Buscar relatório automaticamente quando filtros mínimos forem preenchidos (formulário obrigatório)
  useEffect(() => {
    if (filterDebounce) clearTimeout(filterDebounce);

    const hasMinimumFilters =
      selectedState !== 'all' &&
      selectedMunicipality !== 'all' &&
      selectedForm !== '' &&
      selectedSchools.length > 0;

    if (hasMinimumFilters) {
      const timeoutId = setTimeout(() => fetchReport(), 500);
      setFilterDebounce(timeoutId);
    } else {
      setIndicesData(null);
      setProfilesData(null);
    }

    return () => {
      if (filterDebounce) clearTimeout(filterDebounce);
    };
  }, [
    selectedState,
    selectedMunicipality,
    selectedForm,
    selectedSchools,
    selectedGrades,
    selectedClasses,
    fetchReport,
  ]);

  // Função para abrir modal de alunos
  const handleOpenStudentModal = async (indexType: string, page: number = 1) => {
    const indicesMap = indicesData?.indicesConsolidados ?? indicesData?.indices;
    if (!indicesMap?.[indexType]) return;

    setSelectedIndexType(indexType);
    setCurrentStudentPage(page);
    setStudentModalOpen(true);
    setIsLoadingStudents(true);

    try {
      // Buscar alunos com paginação
      const params: any = {
        state: selectedState,
        municipio: selectedMunicipality,
        page: page,
        limit: 20
      };

      if (selectedSchools.length > 0) {
        params.escola = selectedSchools.join(',');
      }

      if (selectedGrades.length > 0) {
        params.serie = selectedGrades.join(',');
      }

      if (selectedClasses.length > 0) {
        params.turma = selectedClasses.join(',');
      }

      const listConfig =
        selectedMunicipality !== 'all' ? { params, meta: { cityId: selectedMunicipality } } : { params };
      const basePath =
        selectedForm === 'all' ? '/forms/aggregated/results' : `/forms/${selectedForm}/results`;
      const response = await api.get(`${basePath}/indices`, listConfig);

      if (response.status === 200) {
        const raw = response.data;
        const indexData = raw?.indicesConsolidados?.[indexType] ?? raw?.indices?.[indexType];
        if (indexData?.alunos) {
          setStudentsData(indexData.alunos.data ?? []);
          setStudentsPagination(indexData.alunos.pagination ?? null);
        }
      }
    } catch (error) {
      console.error("Erro ao buscar alunos:", error);
      toast({
        title: "Erro ao carregar alunos",
        description: "Não foi possível carregar a lista de alunos.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingStudents(false);
    }
  };

  const fetchAllStudentsForIndex = useCallback(
    async (indexType: string): Promise<Student[]> => {
      const params: Record<string, string | number> = {
        state: selectedState,
        municipio: selectedMunicipality,
        page: 1,
        limit: 100,
      };

      if (selectedSchools.length > 0) {
        params.escola = selectedSchools.join(',');
      }
      if (selectedGrades.length > 0) {
        params.serie = selectedGrades.join(',');
      }
      if (selectedClasses.length > 0) {
        params.turma = selectedClasses.join(',');
      }

      const listConfig =
        selectedMunicipality !== 'all' ? { params, meta: { cityId: selectedMunicipality } } : { params };
      const basePath =
        selectedForm === 'all' ? '/forms/aggregated/results' : `/forms/${selectedForm}/results`;

      const allStudents: Student[] = [];
      let page = 1;
      let totalPages = 1;

      do {
        const response = await api.get(`${basePath}/indices`, {
          ...listConfig,
          params: { ...params, page },
        });

        if (response.status !== 200) break;

        const raw = response.data;
        const indexData = raw?.indicesConsolidados?.[indexType] ?? raw?.indices?.[indexType];
        const pageStudents = indexData?.alunos?.data ?? [];
        allStudents.push(...pageStudents);
        totalPages = indexData?.alunos?.pagination?.totalPages ?? 1;
        page += 1;
      } while (page <= totalPages);

      return allStudents;
    },
    [selectedState, selectedMunicipality, selectedSchools, selectedGrades, selectedClasses, selectedForm]
  );

  const handleExportStudentsPdf = useCallback(async () => {
    if (!selectedIndexType || !INDEX_TYPE_TITLES[selectedIndexType]) return;

    try {
      setIsExportingStudentsPdf(true);

      const students =
        studentsPagination?.totalPages && studentsPagination.totalPages <= 1
          ? studentsData
          : await fetchAllStudentsForIndex(selectedIndexType);

      const municipioName =
        municipalities.find((m) => m.id === selectedMunicipality)?.name ||
        selectedMunicipality ||
        '';
      const escolaNames =
        selectedSchools.length === 0
          ? '—'
          : selectedSchools
              .map((id) => schools.find((s) => s.id === id)?.name)
              .filter(Boolean)
              .join(', ') || '—';
      const formTitle =
        selectedForm === 'all'
          ? 'Todos (agregado)'
          : forms.find((f) => f.id === selectedForm)?.name || selectedForm;
      const serieNames =
        selectedGrades.length === 0
          ? '—'
          : selectedGrades
              .map((id) => grades.find((g) => g.id === id)?.name)
              .filter(Boolean)
              .join(', ') || '—';
      const turmaNames =
        selectedClasses.length === 0
          ? '—'
          : selectedClasses
              .map((id) => classes.find((c) => c.id === id)?.name)
              .filter(Boolean)
              .join(', ') || '—';

      await generateFormReportsStudentsPdf({
        indexTitle: INDEX_TYPE_TITLES[selectedIndexType].title,
        students: students.map((student) => ({
          alunoNome: student.alunoNome,
          escolaNome: student.escolaNome,
          gradeName: student.gradeName,
          className: student.className,
          resposta: student.resposta,
        })),
        municipalityId: selectedMunicipality,
        municipalityName: municipioName,
        schoolNames: escolaNames,
        formTitle,
        gradeNames: serieNames,
        classNames: turmaNames,
      });

      toast({
        title: 'PDF gerado',
        description: 'A lista de alunos foi exportada com sucesso.',
      });
    } catch (error) {
      console.error('Erro ao gerar PDF da lista de alunos:', error);
      toast({
        title: 'Erro ao gerar PDF',
        description: 'Não foi possível exportar a lista de alunos.',
        variant: 'destructive',
      });
    } finally {
      setIsExportingStudentsPdf(false);
    }
  }, [
    selectedIndexType,
    studentsPagination,
    studentsData,
    fetchAllStudentsForIndex,
    municipalities,
    selectedMunicipality,
    selectedSchools,
    schools,
    selectedForm,
    forms,
    selectedGrades,
    grades,
    selectedClasses,
    classes,
    toast,
  ]);

  // Tradução das abas de perfis
  const profileTabTitles: Record<string, string> = {
    perfilDemografico: 'Perfil demográfico do estudante',
    contextoFamiliar: 'Contexto Familiar e socioeconômico',
    trajetoriaEscolar: 'Trajetória e contexto escolar',
    ambienteEscolar: 'Percepções sobre o ambiente escolar'
  };

  const questionNumberById = useMemo(() => {
    if (!profilesData?.perfisConsolidados) return {};
    return buildQuestionNumberMap(profilesData.perfisConsolidados);
  }, [profilesData?.perfisConsolidados]);

  const orderedProfileKeys = useMemo(() => {
    if (!profilesData?.perfisConsolidados) return [];
    return getOrderedProfileKeys(profilesData.perfisConsolidados);
  }, [profilesData?.perfisConsolidados]);

  const handleExportPdf = useCallback(async () => {
    if (!profilesData?.perfisConsolidados) return;

    try {
      setIsGeneratingPdf(true);

      const municipioName =
        municipalities.find((m) => m.id === selectedMunicipality)?.name ||
        selectedMunicipality ||
        '';
      const escolaNames =
        selectedSchools.length === 0
          ? '—'
          : selectedSchools
              .map((id) => schools.find((s) => s.id === id)?.name)
              .filter(Boolean)
              .join(', ') || '—';
      const formTitle =
        selectedForm === 'all'
          ? 'Todos (agregado)'
          : forms.find((f) => f.id === selectedForm)?.name || selectedForm;
      const serieNames =
        selectedGrades.length === 0
          ? '—'
          : selectedGrades
              .map((id) => grades.find((g) => g.id === id)?.name)
              .filter(Boolean)
              .join(', ') || '—';
      const turmaNames =
        selectedClasses.length === 0
          ? '—'
          : selectedClasses
              .map((id) => classes.find((c) => c.id === id)?.name)
              .filter(Boolean)
              .join(', ') || '—';

      const indicesMap = indicesData?.indicesConsolidados ?? indicesData?.indices;
      const indicesSummary = indicesMap
        ? Object.entries(indicesMap)
            .map(([key, data]: [string, any]) => {
              const info = INDEX_TYPE_TITLES[key];
              if (!info || !data) return null;
              return {
                title: info.title,
                total: Number(data.total ?? 0),
                porcentagem: Number(data.porcentagem ?? 0),
              };
            })
            .filter(Boolean) as Array<{ title: string; total: number; porcentagem: number }>
        : [];

      await generateFormReportsProfilesPdf({
        perfis: profilesData.perfisConsolidados,
        profileTitles: profileTabTitles,
        municipalityId: selectedMunicipality,
        municipalityName: municipioName,
        schoolNames: escolaNames,
        formTitle,
        gradeNames: serieNames,
        classNames: turmaNames,
        totalRespostas:
          profilesData.totalRespostas ??
          indicesData?.totalRespostas ??
          undefined,
        indicesSummary,
      });

      toast({
        title: 'PDF gerado',
        description: 'O dashboard foi exportado com sucesso.',
      });
    } catch (error) {
      console.error('Erro ao gerar PDF do dashboard:', error);
      toast({
        title: 'Erro ao gerar PDF',
        description: 'Não foi possível exportar o dashboard em PDF.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [
    profilesData,
    indicesData,
    municipalities,
    selectedMunicipality,
    selectedSchools,
    schools,
    selectedForm,
    forms,
    selectedGrades,
    grades,
    selectedClasses,
    classes,
    profileTabTitles,
    toast,
  ]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
            <BarChart3 className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
            Dashboard dos Formulários Socioeconômicos
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Visualize os resultados dos questionários socioeconômicos aplicados
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros de Relatório
          </CardTitle>
          <CardDescription>
            Selecione os filtros para gerar o relatório
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {/* Estado */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado *</label>
              <Select
                value={selectedState}
                onValueChange={setSelectedState}
                disabled={isLoadingFilters}
              >
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

            {/* Município */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Município *</label>
              <Select
                value={selectedMunicipality}
                onValueChange={setSelectedMunicipality}
                disabled={isLoadingFilters || selectedState === 'all'}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoadingFilters
                        ? "Carregando municípios..."
                        : municipalities.length === 0
                          ? "Nenhum município disponível"
                          : "Selecione o município"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {municipalities.map((municipality) => (
                    <SelectItem key={municipality.id} value={municipality.id}>
                      {municipality.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Formulário (obrigatório) */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Formulário *</label>
              <Select
                value={selectedForm}
                onValueChange={setSelectedForm}
                disabled={isLoadingFilters || selectedState === 'all' || selectedMunicipality === 'all'}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoadingFilters
                        ? "Carregando formulários..."
                        : forms.length === 0 && selectedMunicipality !== 'all'
                          ? "Nenhum formulário disponível"
                          : "Selecione o formulário"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos (agregado)</SelectItem>
                  {forms.map((form) => (
                    <SelectItem key={form.id} value={form.id}>
                      {form.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Escola */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Escola(s) *</label>
              <FormMultiSelect
                options={schools.map((school) => ({ id: school.id, name: school.name }))}
                selected={selectedSchools}
                onChange={setSelectedSchools}
                placeholder={
                  selectedSchools.length === 0 ? "Selecione escolas" : `${selectedSchools.length} selecionada(s)`
                }
              />
            </div>

            {/* Série */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Série(s)</label>
              <FormMultiSelect
                options={grades.map(grade => ({ id: grade.id, name: grade.name }))}
                selected={selectedGrades}
                onChange={setSelectedGrades}
                placeholder={selectedGrades.length === 0 ? "Todas as séries" : `${selectedGrades.length} selecionada(s)`}
              />
            </div>

            {/* Turma */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Turma(s)</label>
              <FormMultiSelect
                options={classes.map(classItem => ({ id: classItem.id, name: classItem.name }))}
                selected={selectedClasses}
                onChange={setSelectedClasses}
                placeholder={selectedClasses.length === 0 ? "Todas as turmas" : `${selectedClasses.length} selecionada(s)`}
              />
            </div>
          </div>

          {/* Loading ou Info */}
          {(isLoadingReport || isPolling) && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  {isPolling ? 'Processando relatório consolidado...' : 'Carregando dados...'}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sumário Executivo */}
      {indicesData && indicesData.indicesConsolidados && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">Sumário Executivo</h2>
            <p className="text-muted-foreground">
              Principais indicadores socioeconômicos dos alunos
            </p>
            {/* Badge informativo com total de formulários */}
            {indicesData.totalFormularios && (
              <div className="mt-2">
                <Badge variant="outline" className="text-sm">
                  <FileText className="h-3 w-3 mr-1" />
                  {indicesData.totalFormularios} formulário{indicesData.totalFormularios !== 1 ? 's' : ''} incluído{indicesData.totalFormularios !== 1 ? 's' : ''}
                  {indicesData.totalRespostas && ` | ${indicesData.totalRespostas} respostas`}
                </Badge>
              </div>
            )}
          </div>

          {/* Cards de Estatísticas */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(indicesData.indicesConsolidados).map(([key, data]: [string, any]) => {
              const indexInfo = INDEX_TYPE_TITLES[key];
              if (!indexInfo) return null;

              const Icon = indexInfo.icon;

              return (
                <Card 
                  key={key}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => handleOpenStudentModal(key)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className={`p-3 rounded-lg ${indexInfo.color}`}>
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <Badge variant="secondary" className="text-lg font-bold">
                        {data.porcentagem.toFixed(1)}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <h3 className="font-semibold text-sm mb-1">{indexInfo.title}</h3>
                    <p className="text-2xl font-bold text-muted-foreground">
                      {data.total} <span className="text-sm font-normal">alunos</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Clique para ver detalhes
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Sistema de Abas com Perfis */}
          {profilesData && profilesData.perfisConsolidados && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <CardTitle>Análise Detalhada por Perfil</CardTitle>
                    <CardDescription>
                      Visualize as respostas dos alunos organizadas por categoria
                    </CardDescription>
                  </div>
                  <Button
                    onClick={handleExportPdf}
                    disabled={isGeneratingPdf}
                    className="shrink-0"
                  >
                    {isGeneratingPdf ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Gerando PDF...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Exportar PDF
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-auto gap-2">
                    {orderedProfileKeys.map((profileKey) => (
                      <TabsTrigger 
                        key={profileKey} 
                        value={profileKey}
                        className="text-xs sm:text-sm px-2 py-2 whitespace-normal h-auto min-h-[40px]"
                      >
                        {profileTabTitles[profileKey] || profileKey}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {orderedProfileKeys.map((profileKey) => {
                    const profileData = profilesData.perfisConsolidados[profileKey];
                    return (
                    <TabsContent key={profileKey} value={profileKey} className="mt-6">
                      <FormReportProfileTabContent
                        profileKey={profileKey}
                        profileTitle={profileTabTitles[profileKey] || profileData?.nome || profileKey}
                        profileData={profileData}
                        questionNumberById={questionNumberById}
                      />
                    </TabsContent>
                    );
                  })}
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      )}


      {/* Dialog de Lista de Alunos */}
      <Dialog open={studentModalOpen} onOpenChange={setStudentModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-6">
              <div className="space-y-1.5">
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {selectedIndexType && INDEX_TYPE_TITLES[selectedIndexType]?.title}
                </DialogTitle>
                <DialogDescription>
                  Lista de alunos identificados nesta categoria
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportStudentsPdf}
                disabled={
                  isExportingStudentsPdf ||
                  isLoadingStudents ||
                  !studentsPagination?.total
                }
                className="shrink-0"
              >
                {isExportingStudentsPdf ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando PDF...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Baixar PDF
                  </>
                )}
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {isLoadingStudents ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : studentsData.length > 0 ? (
              <div className="space-y-3">
                {studentsData.map((student) => (
                  <Card key={student.alunoId} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-base">{student.alunoNome}</h4>
                        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <School className="h-4 w-4" />
                            <span>{student.escolaNome}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <GraduationCap className="h-4 w-4" />
                            <span>
                              {student.gradeName}
                              {student.className && ` - Turma ${student.className}`}
                            </span>
                          </div>
                          {student.resposta && (
                            <div className="mt-2 p-2 bg-muted rounded text-xs">
                              <strong>Resposta:</strong> {student.resposta}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum aluno encontrado
              </div>
            )}
          </div>

          {/* Paginação */}
          {studentsPagination && studentsPagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Página {studentsPagination.page} de {studentsPagination.totalPages}
                <span className="ml-2">
                  ({studentsPagination.total} alunos no total)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenStudentModal(selectedIndexType, currentStudentPage - 1)}
                  disabled={currentStudentPage === 1 || isLoadingStudents}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenStudentModal(selectedIndexType, currentStudentPage + 1)}
                  disabled={currentStudentPage === studentsPagination.totalPages || isLoadingStudents}
                >
                  Próxima
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FormReports;
