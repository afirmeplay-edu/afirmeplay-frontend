import { api } from '@/lib/api';

/**
 * Serviço de API para filtros de formulários socioeconômicos
 * Usa rotas específicas em /forms/ que não requerem avaliação
 */
export class FormFiltersApiService {
  /**
   * Método privado centralizado para buscar opções de filtros
   * Usa a rota unificada /forms/filter-options
   */
  private static async getFormFilterOptions(params: {
    estado?: string;
    municipio?: string;
    escola?: string;
    serie?: string;
    turma?: string;
    customName?: string;
  }): Promise<{
    estados?: Array<{ id: string; nome: string; name?: string }>;
    municipios?: Array<{ id: string; nome: string; name?: string; estado_id?: string }>;
    escolas?: Array<{ id: string; nome: string; name?: string; city_id?: string; municipio_id?: string }>;
    series?: Array<{ id: string; nome: string; name?: string; education_stage_id?: string; educationStageId?: string }>;
    turmas?: Array<{ id: string; nome: string; name?: string; grade_id?: string; school_id?: string }>;
    avaliacoes?: Array<any>;
  }> {
    try {
      const queryParams = new URLSearchParams();
      if (params.estado && params.estado !== 'all') queryParams.append('estado', params.estado);
      if (params.municipio && params.municipio !== 'all') queryParams.append('municipio', params.municipio);
      if (params.escola && params.escola !== 'all') queryParams.append('escola', params.escola);
      if (params.serie && params.serie !== 'all') queryParams.append('serie', params.serie);
      if (params.turma && params.turma !== 'all') queryParams.append('turma', params.turma);
      if (params.customName?.trim()) queryParams.append('customName', params.customName.trim());

      const url = `/forms/filter-options${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const requestConfig = params.municipio && params.municipio !== 'all' ? { meta: { cityId: params.municipio } } : {};
      const response = await api.get(url, requestConfig);
      return response.data || {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Buscar estados disponíveis
   */
  static async getFormFilterStates(): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      const response = await this.getFormFilterOptions({});
      return response.estados || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Buscar municípios de um estado
   */
  static async getFormFilterMunicipalities(state: string): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      const response = await this.getFormFilterOptions({ estado: state });
      return response.municipios || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Buscar escolas de um município
   * Tenta primeiro a rota unificada, depois fallback para rota direta
   */
  static async getFormFilterSchools(params: {
    estado: string;
    municipio: string;
    customName?: string;
  }): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      // Tentar primeiro a rota unificada
      const response = await this.getFormFilterOptions({
        estado: params.estado,
        municipio: params.municipio,
        customName: params.customName,
      });
      
      if (response.escolas && response.escolas.length > 0) {
        return response.escolas;
      }

      // Fallback: usar rota direta
      const directConfig = { meta: { cityId: params.municipio } };
      const directResponse = await api.get(`/forms/schools/city/${params.municipio}`, directConfig);
      const schools = directResponse.data || [];
      return schools.map((school: any) => ({
        id: school.id,
        nome: school.nome || school.name || ''
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Buscar séries de uma escola
   * Tenta primeiro a rota unificada, depois fallback para rota direta
   */
  static async getFormFilterGrades(params: {
    estado: string;
    municipio: string;
    escola: string;
    customName?: string;
  }): Promise<Array<{
    id: string;
    nome: string;
    education_stage_id?: string;
    educationStageId?: string;
    education_stage_name?: string;
  }>> {
    const mapGrade = (grade: Record<string, unknown>) => {
      const stage = (grade.education_stage ?? grade.educationStage) as
        | { id?: string; name?: string; nome?: string }
        | undefined;
      const stageId = String(grade.education_stage_id || grade.educationStageId || stage?.id || "");
      const stageName = String(stage?.name || stage?.nome || grade.education_stage_name || "");
      return {
        id: String(grade.id || ""),
        nome: String(grade.nome || grade.name || ""),
        ...(stageId ? { education_stage_id: stageId, educationStageId: stageId } : {}),
        ...(stageName ? { education_stage_name: stageName } : {}),
      };
    };

    try {
      // Tentar primeiro a rota unificada
      const response = await this.getFormFilterOptions({
        estado: params.estado,
        municipio: params.municipio,
        escola: params.escola,
        customName: params.customName,
      });
      
      if (response.series && response.series.length > 0) {
        return response.series.map((grade) => mapGrade(grade as Record<string, unknown>)).filter((grade) => grade.id);
      }

      // Fallback: usar rota direta
      const gradeConfig = params.municipio ? { meta: { cityId: params.municipio } } : {};
      const directResponse = await api.get(`/forms/grades/school/${params.escola}`, gradeConfig);
      const grades = directResponse.data || [];
      return (Array.isArray(grades) ? grades : []).map((grade: Record<string, unknown>) => mapGrade(grade)).filter((grade: { id: string }) => grade.id);
    } catch (error) {
      return [];
    }
  }

  /**
   * Buscar turmas de uma série
   * Tenta primeiro a rota unificada, depois fallback para rota direta
   */
  static async getFormFilterClasses(params: {
    estado: string;
    municipio: string;
    escola: string;
    serie: string;
    customName?: string;
  }): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      // Tentar primeiro a rota unificada
      const response = await this.getFormFilterOptions({
        estado: params.estado,
        municipio: params.municipio,
        escola: params.escola,
        serie: params.serie,
        customName: params.customName,
      });
      
      if (response.turmas && response.turmas.length > 0) {
        return response.turmas;
      }

      // Fallback: usar rota direta com filtro de escola
      const classConfig = params.municipio ? { meta: { cityId: params.municipio } } : {};
      const directResponse = await api.get(`/forms/classes/grade/${params.serie}?escola=${params.escola}`, classConfig);
      const classes = directResponse.data || [];
      return classes.map((classItem: any) => ({
        id: classItem.id,
        nome: classItem.nome || classItem.name || ''
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Buscar detalhes de uma série por ID
   * Retorna informações incluindo education_stage_id necessário para determinar tipo de formulário
   */
  static async getFormGradeDetails(gradeId: string): Promise<{
    id: string;
    name: string;
    nome: string;
    education_stage_id?: string;
    educationStageId?: string;
    education_stage?: {
      id: string;
      name: string;
      nome: string;
    };
  } | null> {
    try {
      const response = await api.get(`/forms/grades/${gradeId}`);
      return response.data || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Buscar disciplinas relacionadas à escola selecionada.
   */
  /**
   * Cursos já cadastrados no sistema (Anos Iniciais, Anos Finais e demais etapas).
   */
  static async getEducationStages(cityId?: string): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      const config = cityId && cityId !== "all" ? { meta: { cityId } } : {};
      const response = await api.get("/education_stages/all", config);
      const data = response.data;
      const list = Array.isArray(data) ? data : data?.data ?? data?.courses ?? [];
      if (!Array.isArray(list)) return [];
      return list
        .map((stage: { id?: string; name?: string; nome?: string }) => ({
          id: String(stage.id || ""),
          nome: stage.nome || stage.name || "",
        }))
        .filter((stage: { id: string; nome: string }) => stage.id !== "" && stage.nome !== "");
    } catch (error) {
      return [];
    }
  }

  /**
   * Disciplinas cadastradas no sistema.
   */
  static async getSubjects(): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      const response = await api.get("/subjects");
      const data = response.data;
      const list = Array.isArray(data) ? data : data?.data ?? data?.subjects ?? [];
      if (!Array.isArray(list)) return [];
      return list
        .map((subject: { id?: string; nome?: string; name?: string }) => ({
          id: String(subject.id || ""),
          nome: subject.nome || subject.name || "",
        }))
        .filter((subject: { id: string; nome: string }) => subject.nome !== "");
    } catch (error) {
      return [];
    }
  }

  static async getSchoolSubjects(schoolId: string): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      if (!schoolId || schoolId === 'all') return [];
      const response = await api.get(`/subjects/by-school/${schoolId}`);
      const data = response.data;
      const subjects = Array.isArray(data)
        ? data
        : data?.subjects ?? data?.data ?? data?.disciplinas ?? [];
      if (!Array.isArray(subjects)) return [];
      return subjects
        .map((subject: { id?: string; nome?: string; name?: string }) => ({
          id: String(subject.id || ""),
          nome: subject.nome || subject.name || "",
        }))
        .filter((subject: { id: string; nome: string }) => subject.nome !== "");
    } catch (error) {
      return [];
    }
  }
}

