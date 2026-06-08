import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Search,
  ClipboardList,
  Filter,
  RefreshCw,
  MapPin,
  School,
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  Users,
  RotateCcw,
  FileImage,
  Trash2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EvaluationResultsApiService } from "@/services/evaluation/evaluationResultsApi";
import { EvaluationInstrumentPicker } from "@/components/filters";
import { api } from "@/lib/api";
import { useBatchCorrection } from "@/hooks/useBatchCorrection";
import { BatchCorrectionImage } from "@/services/evaluation/batchCorrectionService";

// Interfaces reutilizadas da página Results.tsx
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

interface AppliedEvaluation {
  id: string;
  titulo: string;
  disciplina: string;
  curso?: string;
  serie?: string;
  turma?: string;
  escola?: string;
  municipio?: string;
  estado?: string;
  data_aplicacao: string;
  status: 'finalized' | 'in_progress' | 'pending' | string;
  total_alunos: number;
  alunos_participantes: number;
  alunos_pendentes: number;
  alunos_ausentes: number;
  media_nota: number;
  media_proficiencia: number;
}

export default function PhysicalEvaluationTab() {
  const [appliedEvaluations, setAppliedEvaluations] = useState<AppliedEvaluation[]>([]);
  const [isLoadingPhysical, setIsLoadingPhysical] = useState(true);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const { toast } = useToast();

  // Estados para o modal de upload
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedEvaluationForUpload, setSelectedEvaluationForUpload] = useState<AppliedEvaluation | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<any>(null);

  // Estados dos filtros - mesma estrutura da página Results.tsx
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('all');
  const [selectedEvaluation, setSelectedEvaluation] = useState<string>('all');
  const [selectedSchool, setSelectedSchool] = useState<string>('all');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Estados dos dados dos filtros
  const [states, setStates] = useState<State[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [evaluationsByMunicipality, setEvaluationsByMunicipality] = useState<Array<{ 
    id: string; 
    titulo: string; 
    disciplina: string; 
    status: string; 
    data_aplicacao: string; 
  }>>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);

  // Hook para correção em lote
  const batchCorrection = useBatchCorrection();

  // Carregar filtros iniciais
  useEffect(() => {
    loadInitialFilters();
  }, []);

  // Carregar dados quando filtros mudarem
  useEffect(() => {
    fetchAppliedEvaluations();
  }, [selectedState, selectedMunicipality, selectedEvaluation, selectedSchool, selectedGrade, selectedClass, searchTerm]);

  const loadInitialFilters = async () => {
    try {
      setIsLoadingFilters(true);
      const statesData = await EvaluationResultsApiService.getFilterStates();
      setStates(statesData.map(state => ({
        id: state.id,
        name: state.nome,
        uf: state.id
      })));
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

  const fetchAppliedEvaluations = async () => {
    // Verificar se os filtros obrigatórios estão selecionados (Estado e Município)
    if (selectedState === 'all' || selectedMunicipality === 'all') {
      setAppliedEvaluations([]);
      setIsLoadingPhysical(false);
      return;
    }

    try {
      setIsLoadingPhysical(true);
      
      const filters = {
        estado: selectedState,
        municipio: selectedMunicipality,
        avaliacao: selectedEvaluation !== 'all' ? selectedEvaluation : undefined,
        escola: selectedSchool !== 'all' ? selectedSchool : undefined,
        serie: selectedGrade !== 'all' ? selectedGrade : undefined,
        turma: selectedClass !== 'all' ? selectedClass : undefined,
      };

      // Usar a mesma API da página Results.tsx
      const evaluationsResponse = await EvaluationResultsApiService.getEvaluationsList(1, 100, filters);
      
      if (evaluationsResponse && evaluationsResponse.resultados_detalhados?.avaliacoes) {
        // Filtrar avaliações baseado na seleção específica E excluir olimpíadas
        const filteredEvaluations = evaluationsResponse.resultados_detalhados.avaliacoes.filter(evaluation => {
          // Excluir olimpíadas
          const type = evaluation.type || evaluation.tipo;
          const title = evaluation.titulo || evaluation.title || '';
          const isOlimpiada = type === 'OLIMPIADA' || 
                             title.includes('[OLIMPÍADA]') || 
                             title.toUpperCase().includes('OLIMPÍADA');
          if (isOlimpiada) {
            return false;
          }
          
          const matchesSearch = !searchTerm || evaluation.titulo.toLowerCase().includes(searchTerm.toLowerCase());
          
          // Se uma avaliação específica foi selecionada, mostrar ela independente do status
          if (selectedEvaluation !== 'all') {
            return evaluation.id === selectedEvaluation && matchesSearch;
          }
          
          // Caso contrário, filtrar apenas avaliações aplicadas (finalizadas)
          const isFinalized = evaluation.status === 'finalized' || evaluation.status === 'concluida' || evaluation.status === 'finalizada';
          return isFinalized && matchesSearch;
        });

        setAppliedEvaluations(filteredEvaluations);
      } else {
        setAppliedEvaluations([]);
      }
      
    } catch (error) {
      console.error("Erro ao buscar avaliações aplicadas:", error);
      setAppliedEvaluations([]);
      toast({
        title: "Erro ao carregar avaliações aplicadas",
        description: "Não foi possível carregar as avaliações aplicadas. Verifique a conexão com o servidor.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPhysical(false);
    }
  };

  // Carregar municípios quando estado for selecionado
  useEffect(() => {
    const loadMunicipalities = async () => {
      if (selectedState !== 'all') {
        try {
          setIsLoadingFilters(true);
          const municipalitiesData = await EvaluationResultsApiService.getFilterMunicipalities(selectedState);
          setMunicipalities(municipalitiesData.map(municipality => ({
            id: municipality.id,
            name: municipality.nome,
            state: selectedState
          })));
          setEvaluationsByMunicipality([]);
          setSelectedMunicipality('all');
          setSelectedEvaluation('all');
          setSelectedSchool('all');
          setSelectedGrade('all');
          setSelectedClass('all');
        } catch (error) {
          console.error("Erro ao carregar municípios:", error);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setMunicipalities([]);
        setEvaluationsByMunicipality([]);
        setSelectedMunicipality('all');
        setSelectedEvaluation('all');
        setSelectedSchool('all');
        setSelectedGrade('all');
        setSelectedClass('all');
      }
    };

    loadMunicipalities();
  }, [selectedState]);

  // Carregar avaliações quando município for selecionado
  useEffect(() => {
    const loadEvaluations = async () => {
      if (selectedMunicipality !== 'all') {
        try {
          setIsLoadingFilters(true);
          const evaluationsData = await EvaluationResultsApiService.getFilterEvaluations({
            estado: selectedState,
            municipio: selectedMunicipality
          });
          setEvaluationsByMunicipality(evaluationsData.map(evaluation => ({
            id: evaluation.id || 'unknown',
            titulo: evaluation.titulo || 'Sem título',
            disciplina: '',
            status: 'concluida',
            data_aplicacao: new Date().toISOString()
          })));
          setSelectedEvaluation('all');
          setSelectedSchool('all');
          setSelectedGrade('all');
          setSelectedClass('all');
        } catch (error) {
          console.error("Erro ao carregar avaliações:", error);
          setEvaluationsByMunicipality([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setEvaluationsByMunicipality([]);
        setSelectedEvaluation('all');
        setSelectedSchool('all');
        setSelectedGrade('all');
        setSelectedClass('all');
      }
    };

    loadEvaluations();
  }, [selectedMunicipality, selectedState]);

  // Carregar escolas quando avaliação for selecionada
  useEffect(() => {
    const loadSchools = async () => {
      if (selectedEvaluation !== 'all') {
        try {
          setIsLoadingFilters(true);
          const schoolsData = await EvaluationResultsApiService.getFilterSchoolsByEvaluation({
            estado: selectedState,
            municipio: selectedMunicipality,
            avaliacao: selectedEvaluation
          });
          setSchools(schoolsData.map(school => ({
            id: school.id,
            name: school.nome
          })));
          setSelectedSchool('all');
          setSelectedGrade('all');
          setSelectedClass('all');
        } catch (error) {
          console.error("Erro ao carregar escolas:", error);
          setSchools([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setSchools([]);
        setSelectedSchool('all');
        setSelectedGrade('all');
        setSelectedClass('all');
      }
    };

    loadSchools();
  }, [selectedEvaluation, selectedState, selectedMunicipality]);

  // Carregar séries quando escola for selecionada
  useEffect(() => {
    const loadGrades = async () => {
      if (selectedSchool !== 'all') {
        try {
          setIsLoadingFilters(true);
          const gradesData = await EvaluationResultsApiService.getFilterGradesByEvaluation({
            estado: selectedState,
            municipio: selectedMunicipality,
            avaliacao: selectedEvaluation,
            escola: selectedSchool
          });
          setGrades(gradesData.map(grade => ({
            id: grade.id,
            name: grade.nome
          })));
          setSelectedGrade('all');
          setSelectedClass('all');
        } catch (error) {
          console.error("Erro ao carregar séries:", error);
          setGrades([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setGrades([]);
        setSelectedGrade('all');
        setSelectedClass('all');
      }
    };

    loadGrades();
  }, [selectedSchool, selectedState, selectedMunicipality, selectedEvaluation]);

  // Carregar turmas quando série for selecionada
  useEffect(() => {
    const loadClasses = async () => {
      if (selectedGrade !== 'all') {
        try {
          setIsLoadingFilters(true);
          const classesData = await EvaluationResultsApiService.getFilterClassesByEvaluation({
            estado: selectedState,
            municipio: selectedMunicipality,
            avaliacao: selectedEvaluation,
            escola: selectedSchool,
            serie: selectedGrade
          });
          setClasses(classesData.map(classItem => ({
            id: classItem.id,
            name: classItem.nome
          })));
          setSelectedClass('all');
        } catch (error) {
          console.error("Erro ao carregar turmas:", error);
          setClasses([]);
        } finally {
          setIsLoadingFilters(false);
        }
      } else {
        setClasses([]);
        setSelectedClass('all');
      }
    };

    loadClasses();
  }, [selectedGrade, selectedState, selectedMunicipality, selectedEvaluation, selectedSchool]);

  const handleRefresh = () => {
    fetchAppliedEvaluations();
  };

  // Funções para o modal de upload
  const openUploadModal = (evaluation: AppliedEvaluation) => {
    setSelectedEvaluationForUpload(evaluation);
    setSelectedFile(null);
    setUploadResult(null);
    setUploadProgress(0);
    setShowUploadModal(true);
  };

  const closeUploadModal = () => {
    setShowUploadModal(false);
    setSelectedEvaluationForUpload(null);
    setSelectedFile(null);
    setUploadResult(null);
    setUploadProgress(0);
    setIsUploading(false);
    
    // Limpar estado da correção em lote
    batchCorrection.reset();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // Validar tipos de arquivo
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    const invalidFiles = files.filter(file => !validTypes.includes(file.type));
    
    if (invalidFiles.length > 0) {
      toast({
        title: "Tipo de arquivo inválido",
        description: "Por favor, selecione apenas imagens (JPG, PNG ou GIF).",
        variant: "destructive",
      });
      return;
    }

    // Validar tamanho dos arquivos (máximo 10MB cada)
    const maxSize = 10 * 1024 * 1024; // 10MB
    const oversizedFiles = files.filter(file => file.size > maxSize);
    
    if (oversizedFiles.length > 0) {
      toast({
        title: "Arquivo muito grande",
        description: "Alguns arquivos excedem o limite de 10MB.",
        variant: "destructive",
      });
      return;
    }

    // Converter para base64 e adicionar ao lote
    const convertFiles = async () => {
      const batchImages: BatchCorrectionImage[] = [];
      
      for (const file of files) {
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
          });
          
          batchImages.push({
            image: base64,
            studentName: file.name.replace(/\.[^/.]+$/, ""), // Remove extensão
          });
        } catch (error) {
          console.error("Erro ao converter arquivo:", error);
        }
      }
      
      batchCorrection.addImages(batchImages);
    };

    convertFiles();
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleUpload = async () => {
    if (batchCorrection.selectedImages.length === 0 || !selectedEvaluationForUpload) {
      toast({
        title: "Erro",
        description: "Selecione pelo menos uma imagem para processar.",
        variant: "destructive",
      });
      return;
    }

    try {
      await batchCorrection.startBatchCorrection(selectedEvaluationForUpload.id);
    } catch (error: any) {
      console.error("Erro no upload em lote:", error);
      toast({
        title: "Erro no upload",
        description: error.message || "Erro ao processar a correção em lote.",
        variant: "destructive",
      });
    }
  };

  // Verificar se todos os filtros obrigatórios estão selecionados (Estado e Município)
  const allRequiredFiltersSelected = selectedState !== 'all' && selectedMunicipality !== 'all';

  return (
    <div className="space-y-4">
      {/* Filtros para Avaliações Aplicadas - Mesma estrutura da página Results.tsx */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {/* Estado */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
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
                  {states.map(state => (
                    <SelectItem key={state.id} value={state.id}>
                      {state.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Município */}
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
                  {municipalities.map(municipality => (
                    <SelectItem key={municipality.id} value={municipality.id}>
                      {municipality.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <EvaluationInstrumentPicker
              label="Avaliações"
              estado={selectedState}
              municipio={selectedMunicipality}
              value={selectedEvaluation}
              onChange={setSelectedEvaluation}
              disabled={isLoadingFilters || selectedMunicipality === 'all'}
              loading={isLoadingFilters}
              allowAll
              allLabel="Todas"
              placeholder="Selecione a avaliação"
            />

            {/* Escola */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Escola</label>
              <Select
                value={selectedSchool}
                onValueChange={setSelectedSchool}
                disabled={isLoadingFilters || selectedEvaluation === 'all'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a escola" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {schools.map(school => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Série */}
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
                  <SelectItem value="all">Todos</SelectItem>
                  {grades.map(grade => (
                    <SelectItem key={grade.id} value={grade.id}>
                      {grade.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Turma */}
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
                  <SelectItem value="all">Todos</SelectItem>
                  {classes.map(classItem => (
                    <SelectItem key={classItem.id} value={classItem.id}>
                      {classItem.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Busca */}
          <div className="mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar Avaliação</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  placeholder="Digite o nome da avaliação..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* Informação sobre filtros */}
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-400">
              💡 <strong>Hierarquia dos Filtros:</strong> Estado → Município → Avaliação → Escola → Série → Turma
            </p>
            <p className="text-sm text-blue-700 mt-1 dark:text-blue-400">
              <strong>Estado</strong> e <strong>Município</strong> são obrigatórios. 
              {selectedEvaluation !== 'all' ? (
                <span> A <strong>avaliação selecionada</strong> será exibida independente do status.</span>
              ) : (
                <span> Apenas avaliações <strong>aplicadas (finalizadas)</strong> serão exibidas.</span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Mensagem quando não há filtros suficientes */}
      {!allRequiredFiltersSelected && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Filter className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Selecione os filtros obrigatórios para continuar
            </h3>
            <p className="text-gray-600 text-center max-w-md">
              Para visualizar as avaliações aplicadas, você precisa selecionar: <strong>Estado</strong> e <strong>Município</strong>. Os demais filtros são opcionais.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading dos dados */}
      {allRequiredFiltersSelected && isLoadingPhysical && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mb-4" />
            <p className="text-gray-600">Carregando avaliações aplicadas...</p>
          </CardContent>
        </Card>
      )}

      {/* Resumo das Avaliações Aplicadas */}
      {allRequiredFiltersSelected && !isLoadingPhysical && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">
                {appliedEvaluations.length}
              </div>
              <p className="text-sm text-muted-foreground">Avaliações Aplicadas</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">
                {appliedEvaluations.reduce((sum, e) => sum + (e.total_alunos || 0), 0)}
              </div>
              <p className="text-sm text-muted-foreground">Total de Alunos</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-purple-600">
                {appliedEvaluations.reduce((sum, e) => sum + (e.alunos_participantes || 0), 0)}
              </div>
              <p className="text-sm text-muted-foreground">Participantes</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Lista de Avaliações */}
      {allRequiredFiltersSelected && !isLoadingPhysical && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {selectedEvaluation !== 'all' ? 'Avaliação Selecionada' : 'Avaliações Aplicadas'}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {appliedEvaluations.length} {appliedEvaluations.length === 1 ? 'avaliação' : 'avaliações'}
                </Badge>
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {appliedEvaluations.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {selectedEvaluation !== 'all' ? 
                    "Nenhuma avaliação encontrada" : 
                    "Nenhuma avaliação aplicada encontrada"
                  }
                </h3>
                <p className="text-gray-600">
                  {searchTerm ? 
                    "Tente ajustar o termo de busca para ver mais resultados." :
                    selectedEvaluation !== 'all' ?
                      "A avaliação selecionada não foi encontrada ou não possui dados." :
                      "Não há avaliações aplicadas para os filtros selecionados."
                  }
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {appliedEvaluations.map((evaluation) => (
                  <Card key={evaluation.id} className={`cursor-pointer hover:shadow-lg transition-shadow border-l-4 ${
                  evaluation.status === 'finalized' || evaluation.status === 'concluida' || evaluation.status === 'finalizada'
                    ? 'border-l-green-500' 
                    : evaluation.status === 'em_andamento' || evaluation.status === 'in_progress'
                    ? 'border-l-blue-500'
                    : 'border-l-orange-500'
                }`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base truncate">{evaluation.titulo}</CardTitle>
                        <Badge 
                          variant={
                            evaluation.status === 'finalized' || evaluation.status === 'concluida' || evaluation.status === 'finalizada'
                              ? "default" 
                              : evaluation.status === 'em_andamento' || evaluation.status === 'in_progress'
                              ? "secondary"
                              : "outline"
                          } 
                          className={
                            evaluation.status === 'finalized' || evaluation.status === 'concluida' || evaluation.status === 'finalizada'
                              ? "bg-green-600" 
                              : evaluation.status === 'em_andamento' || evaluation.status === 'in_progress'
                              ? "bg-blue-600"
                              : ""
                          }
                        >
                          {evaluation.status === 'finalized' || evaluation.status === 'concluida' || evaluation.status === 'finalizada'
                            ? "Aplicada"
                            : evaluation.status === 'em_andamento' || evaluation.status === 'in_progress'
                            ? "Em Andamento"
                            : evaluation.status === 'pendente' || evaluation.status === 'pending'
                            ? "Pendente"
                            : evaluation.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {evaluation.disciplina} • {evaluation.serie || 'Série não informada'}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2">
                        <School className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{evaluation.escola || 'Escola não informada'}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{evaluation.municipio || 'Município não informado'}</span>
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        Aplicada em: {evaluation.data_aplicacao ? new Date(evaluation.data_aplicacao).toLocaleDateString('pt-BR') : 'Data não informada'}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Total:</span>
                          <span className="ml-1 font-medium">{evaluation.total_alunos || 0}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Participantes:</span>
                          <span className="ml-1 font-medium text-green-600">{evaluation.alunos_participantes || 0}</span>
                        </div>
                      </div>
                      
                       <div className="grid grid-cols-2 gap-4 text-sm">
                         <div>
                           <span className="text-muted-foreground">Nota Média:</span>
                           <span className="ml-1 font-medium">{(evaluation.media_nota || 0).toFixed(1)}</span>
                         </div>
                         <div>
                           <span className="text-muted-foreground">Proficiência:</span>
                           <span className="ml-1 font-medium">{(evaluation.media_proficiencia || 0).toFixed(1)}</span>
                         </div>
                       </div>
                       
                       <Button 
                         className="w-full mt-4"
                         variant="outline"
                         onClick={() => openUploadModal(evaluation)}
                       >
                         <ClipboardList className="h-4 w-4 mr-2" />
                         Gerar Resultado de Avaliação Física
                       </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
         </Card>
       )}

       {/* Modal de Upload de Gabarito Físico - Correção em Lote */}
       <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
         <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <Users className="h-5 w-5 text-blue-600" />
               Correção em Lote de Avaliações Físicas
             </DialogTitle>
             <div className="text-sm text-muted-foreground">
               {selectedEvaluationForUpload && (
                 <span>
                   <strong>Avaliação:</strong> {selectedEvaluationForUpload.titulo} • 
                   <strong> Escola:</strong> {selectedEvaluationForUpload.escola}
                 </span>
               )}
             </div>
           </DialogHeader>

           <div className="space-y-6">
             {/* Instruções */}
             <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
               <h4 className="font-medium text-blue-800 mb-2">Como usar:</h4>
               <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                 <li>Selecione múltiplas imagens de gabaritos preenchidos (máximo 10)</li>
                 <li><strong>Envie fotos cortadas exatamente na borda grossa do formulário para melhor detecção</strong></li>
                 <li><strong>A borda deve estar visível em todas as fotos</strong></li>
                 <li>Certifique-se de que as imagens estão claras e bem iluminadas</li>
                 <li>O processamento será feito em lote (muito mais rápido!)</li>
                 <li>Acompanhe o progresso em tempo real</li>
               </ol>
             </div>

             {/* Upload Múltiplo */}
             <div className="space-y-4">
               <Label className="text-sm font-medium">
                 Imagens dos Gabaritos Preenchidos ({batchCorrection.selectedImages.length}/10)
               </Label>
               <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                 <input
                   type="file"
                   accept="image/*"
                   multiple
                   onChange={handleFileSelect}
                   className="hidden"
                   id="gabarito-upload-batch"
                 />
                 <label htmlFor="gabarito-upload-batch" className="cursor-pointer">
                   <Upload className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                   <p className="text-lg font-medium text-gray-700 mb-1">
                     Clique para selecionar múltiplas imagens
                   </p>
                   <p className="text-sm text-gray-500">
                     JPG, PNG ou GIF até 10MB cada • Máximo 10 imagens
                   </p>
                 </label>
               </div>
               
               {/* Lista de Imagens Selecionadas */}
               {batchCorrection.selectedImages.length > 0 && (
                 <div className="space-y-2">
                   <h4 className="font-medium text-sm">Imagens Selecionadas:</h4>
                   <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                     {batchCorrection.selectedImages.map((img, index) => (
                       <div key={index} className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded">
                         <div className="flex items-center gap-2">
                           <FileImage className="h-4 w-4 text-green-600" />
                           <span className="text-sm font-medium text-green-800 truncate">
                             {img.studentName || `Imagem ${index + 1}`}
                           </span>
                         </div>
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={() => batchCorrection.removeImage(index)}
                           className="h-6 w-6 p-0"
                         >
                           <X className="h-3 w-3" />
                         </Button>
                       </div>
                     ))}
                   </div>
                 </div>
               )}
             </div>

             {/* Barra de Progresso */}
             {batchCorrection.isProcessing && (
               <div className="space-y-4">
                 <div className="flex items-center justify-between">
                   <span className="text-sm font-medium">Processando correção em lote...</span>
                   <span className="text-sm text-muted-foreground">
                     {batchCorrection.progressPercentage}%
                   </span>
                 </div>
                 <Progress value={batchCorrection.progressPercentage} className="w-full" />
                 
                 {batchCorrection.currentStudentName && (
                   <div className="text-sm text-muted-foreground">
                     Processando: <strong>{batchCorrection.currentStudentName}</strong>
                   </div>
                 )}
                 
                 <div className="grid grid-cols-3 gap-4 text-sm">
                   <div className="text-center">
                     <div className="text-lg font-bold text-blue-600">{batchCorrection.processedImages}</div>
                     <div className="text-muted-foreground">Processadas</div>
                   </div>
                   <div className="text-center">
                     <div className="text-lg font-bold text-red-600">{batchCorrection.failedImages}</div>
                     <div className="text-muted-foreground">Com Erro</div>
                   </div>
                   <div className="text-center">
                     <div className="text-lg font-bold text-gray-600">{batchCorrection.totalImages}</div>
                     <div className="text-muted-foreground">Total</div>
                   </div>
                 </div>
               </div>
             )}

             {/* Resultados */}
             {batchCorrection.isCompleted && (batchCorrection.results ?? []).length > 0 && (
               <div className="space-y-4">
                 <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                   <div className="flex items-center gap-2 mb-3">
                     <CheckCircle className="h-6 w-6 text-green-600" />
                     <h4 className="font-medium text-green-800">
                       Correção em Lote Concluída! ({(batchCorrection.results ?? []).length} imagens processadas)
                     </h4>
                   </div>
                   
                   {/* Resumo dos Resultados */}
                   <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                     <div>
                       <span className="font-medium text-gray-600">Média de Acertos:</span>
                       <span className="ml-2 text-lg font-bold text-green-600">
                         {((batchCorrection.results ?? []).reduce((sum, r) => sum + (r.correct_answers ?? 0), 0) / (batchCorrection.results ?? []).length).toFixed(1)}
                       </span>
                     </div>
                     <div>
                       <span className="font-medium text-gray-600">Média de Notas:</span>
                       <span className="ml-2 text-lg font-bold text-blue-600">
                         {((batchCorrection.results ?? []).reduce((sum, r) => sum + (r.grade ?? 0), 0) / (batchCorrection.results ?? []).length).toFixed(1)}
                       </span>
                     </div>
                   </div>

                   {/* Lista de Resultados por Aluno */}
                   <div className="space-y-2 max-h-40 overflow-y-auto">
                     {(batchCorrection.results ?? []).map((result, index) => (
                       <div key={index} className="flex items-center justify-between p-2 bg-white rounded border">
                         <div className="flex items-center gap-2">
                           <CheckCircle className="h-4 w-4 text-green-600" />
                           <span className="text-sm font-medium">{result.student_name}</span>
                         </div>
                         <div className="flex items-center gap-4 text-sm">
                           <span className="text-green-600 font-bold">
                             {result.correct_answers}/{result.total_questions}
                           </span>
                           <span className="text-blue-600 font-bold">
                             {result.grade}
                           </span>
                           <span className="text-purple-600 font-bold">
                             {result.score_percentage}%
                           </span>
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               </div>
             )}

             {/* Erros */}
             {(batchCorrection.errors ?? []).length > 0 && (
               <div className="space-y-2">
                 <h4 className="font-medium text-red-800">Imagens com Erro:</h4>
                 <div className="space-y-1 max-h-32 overflow-y-auto">
                   {(batchCorrection.errors ?? []).map((error, index) => (
                     <div key={index} className="flex items-center justify-between p-2 bg-red-50 border border-red-200 rounded">
                       <div className="flex items-center gap-2">
                         <AlertCircle className="h-4 w-4 text-red-600" />
                         <span className="text-sm text-red-800">
                           {error.student_name || `Imagem ${(error.image_index ?? index) + 1}`}: {error.error_message}
                         </span>
                       </div>
                       {typeof batchCorrection.retryImage === "function" && (
                         <Button
                           variant="outline"
                           size="sm"
                           onClick={() => {
                             const imgIndex = error.image_index ?? index;
                             const image = (batchCorrection.selectedImages ?? [])[imgIndex];
                             if (image) batchCorrection.retryImage(imgIndex, image);
                           }}
                           className="h-6 text-xs"
                         >
                           <RotateCcw className="h-3 w-3 mr-1" />
                           Retry
                         </Button>
                       )}
                     </div>
                   ))}
                 </div>
               </div>
             )}
           </div>

           <DialogFooter className="gap-2">
             {!batchCorrection.isProcessing && !batchCorrection.isCompleted && (
               <>
                 <Button variant="outline" onClick={closeUploadModal}>
                   Cancelar
                 </Button>
                 <Button 
                   onClick={handleUpload} 
                   disabled={batchCorrection.selectedImages.length === 0}
                   className="bg-blue-600 hover:bg-blue-700"
                 >
                   <Users className="h-4 w-4 mr-2" />
                   Processar Lote ({batchCorrection.selectedImages.length})
                 </Button>
               </>
             )}
             
             {batchCorrection.isProcessing && (
               <Button 
                 onClick={batchCorrection.cancelBatchCorrection}
                 variant="destructive"
               >
                 <X className="h-4 w-4 mr-2" />
                 Cancelar Processamento
               </Button>
             )}
             
             {batchCorrection.isCompleted && (
               <div className="flex gap-2 w-full">
                 <Button onClick={closeUploadModal} className="flex-1">
                   Fechar
                 </Button>
               </div>
             )}
           </DialogFooter>
         </DialogContent>
       </Dialog>
     </div>
   );
 }
