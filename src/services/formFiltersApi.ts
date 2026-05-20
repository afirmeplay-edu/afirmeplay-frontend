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
  }): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      // Tentar primeiro a rota unificada
      const response = await this.getFormFilterOptions({
        estado: params.estado,
        municipio: params.municipio
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
  }): Promise<Array<{
    id: string;
    nome: string;
    education_stage_id?: string;
    educationStageId?: string;
  }>> {
    try {
      // Tentar primeiro a rota unificada
      const response = await this.getFormFilterOptions({
        estado: params.estado,
        municipio: params.municipio,
        escola: params.escola
      });
      
      if (response.series && response.series.length > 0) {
        return response.series;
      }

      // Fallback: usar rota direta
      const gradeConfig = params.municipio ? { meta: { cityId: params.municipio } } : {};
      const directResponse = await api.get(`/forms/grades/school/${params.escola}`, gradeConfig);
      const grades = directResponse.data || [];
      return grades.map((grade: any) => ({
        id: grade.id,
        nome: grade.nome || grade.name || '',
        education_stage_id: grade.education_stage_id || grade.educationStageId,
        educationStageId: grade.education_stage_id || grade.educationStageId
      }));
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
        serie: params.serie
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
  static async getSchoolSubjects(schoolId: string): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      if (!schoolId || schoolId === 'all') return [];
      const response = await api.get(`/subjects/by-school/${schoolId}`);
      const subjects = response.data || [];
      if (!Array.isArray(subjects)) return [];
      return subjects.map((subject: any) => ({
        id: String(subject.id || ''),
        nome: subject.nome || subject.name || '',
      })).filter((subject: { id: string; nome: string }) => subject.nome !== '');
    } catch (error) {
      return [];
    }
  }
}

