import { api } from '@/lib/api';

// Interfaces baseadas no retorno do backend (evaluation_comparison_service.py)
export interface EvolutionMetrics {
  value: number;
  percentage: number;
  direction: 'increase' | 'decrease' | 'stable';
}

export interface EvaluationClassRef {
  id: string;
  name: string;
}

export interface EvaluationScopeFields {
  grade_id?: string;
  grade_name?: string;
  grade_names?: string[];
  classes?: EvaluationClassRef[];
}

export interface EvaluationInfo extends EvaluationScopeFields {
  order: number;
  id: string;
  title: string;
  created_at?: string;
  application_date?: string;
}

export interface ComparisonEvaluationRef extends EvaluationScopeFields {
  id: string;
  title: string;
  order: number;
  created_at?: string;
  application_date?: string;
}

export interface GeneralComparison {
  average_grade: {
    evaluation_1: number;
    evaluation_2: number;
    evolution: EvolutionMetrics;
  };
  average_proficiency: {
    evaluation_1: number;
    evaluation_2: number;
    evolution: EvolutionMetrics;
  };
  total_students: {
    evaluation_1: number;
    evaluation_2: number;
  };
  classification_distribution: {
    evaluation_1: Record<string, number>;
    evaluation_2: Record<string, number>;
  };
  // Taxa de aprovação/classificação calculada pelo backend
  approval_rate?: {
    evaluation_1: number;
    evaluation_2: number;
    evolution: EvolutionMetrics;
  };
  // Evoluções por nível de classificação (calculadas pelo backend)
  classification_levels_evolution?: {
    [levelName: string]: {
      evaluation_1: number;
      evaluation_2: number;
      evolution: EvolutionMetrics;
    };
  };
}

export interface SubjectComparison {
  [subjectName: string]: {
    subject_id: string;
    average_grade: {
      evaluation_1: number;
      evaluation_2: number;
      evolution: EvolutionMetrics;
    };
    average_proficiency: {
      evaluation_1: number;
      evaluation_2: number;
      evolution: EvolutionMetrics;
    };
    total_students: {
      evaluation_1: number;
      evaluation_2: number;
    };
    classification_distribution: {
      evaluation_1: Record<string, number>;
      evaluation_2: Record<string, number>;
    };
    // Taxa de aprovação/classificação por disciplina calculada pelo backend
    approval_rate?: {
      evaluation_1: number;
      evaluation_2: number;
      evolution: EvolutionMetrics;
    };
    // Evoluções por nível de classificação por disciplina (calculadas pelo backend)
    classification_levels_evolution?: {
      [levelName: string]: {
        evaluation_1: number;
        evaluation_2: number;
        evolution: EvolutionMetrics;
      };
    };
  };
}

export interface SkillsComparison {
  [subjectName: string]: {
    [skillCode: string]: {
      code: string;
      description: string;
      evaluation_1: {
        correct_answers: number;
        total_questions: number;
        percentage: number;
      };
      evaluation_2: {
        correct_answers: number;
        total_questions: number;
        percentage: number;
      };
      evolution: EvolutionMetrics;
    };
  };
}

export interface Comparison {
  from_evaluation: ComparisonEvaluationRef;
  to_evaluation: ComparisonEvaluationRef;
  general_comparison: GeneralComparison;
  subject_comparison: SubjectComparison;
  skills_comparison: SkillsComparison;
}

export interface ParticipationSnapshot {
  total_students: number;
  participating_students: number;
  participation_rate: number;
}

export interface ComparisonParticipation {
  general?: {
    evaluation_1?: ParticipationSnapshot;
    evaluation_2?: ParticipationSnapshot;
  };
  by_school?: {
    evaluation_1?: Record<string, ParticipationSnapshot & { school_name?: string }>;
    evaluation_2?: Record<string, ParticipationSnapshot & { school_name?: string }>;
  };
}

export interface ComparisonResponse {
  source_type?: 'cartao_resposta' | string;
  evaluations: EvaluationInfo[];
  total_evaluations: number;
  comparisons: Comparison[];
  total_comparisons: number;
  participation?: ComparisonParticipation;
}

export interface StudentComparisonResponse {
  student: {
    id: string;
    user_id: string;
    name: string;
  };
  evaluations: EvaluationInfo[];
  total_evaluations: number;
  comparisons: Comparison[];
  total_comparisons: number;
}

// Interfaces para a nova API de filtros de comparação
export interface ComparisonFilterOptions {
  estado?: string;
  municipio?: string;
  avaliacoes?: string;
}

export interface ComparisonFilterResponse {
  filtros_aplicados: {
    avaliacoes?: string[];
    estado?: string;
    municipio?: string;
  };
  opcoes: {
    avaliacoes?: Array<{
      id: string;
      titulo: string;
    }>;
    escolas?: Array<{
      id: string;
      nome: string;
    }>;
    estados?: Array<{
      id: string;
      nome: string;
    }>;
    municipios?: Array<{
      id: string;
      nome: string;
    }>;
  };
}

export class EvaluationComparisonApiService {
  /**
   * Busca opções de filtros para comparação de avaliações
   * @param params Parâmetros opcionais para filtrar as opções
   * @returns Opções de filtros disponíveis
   */
  static async getComparisonFilterOptions(params?: ComparisonFilterOptions): Promise<ComparisonFilterResponse> {
    try {
      // Construir query params dinamicamente
      const queryParams = new URLSearchParams();
      
      if (params?.estado) queryParams.append('estado', params.estado);
      if (params?.municipio) queryParams.append('municipio', params.municipio);
      if (params?.avaliacoes) queryParams.append('avaliacoes', params.avaliacoes);

      // Usar endpoint correto - SEMPRE o mesmo, com ou sem params
      const url = queryParams.toString() 
        ? `/evaluation-results/opcoes-filtros-comparacao?${queryParams.toString()}`
        : '/evaluation-results/opcoes-filtros-comparacao';
      
      const requestConfig = params?.municipio ? { meta: { cityId: params.municipio } } : {};
      const response = await api.get(url, requestConfig);
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar opções de filtros de comparação:', error);
      throw error;
    }
  }

  /**
   * Compara múltiplas avaliações e mostra a evolução sequencial entre elas
   * @param testIds Array de IDs das avaliações (mínimo 2)
   * @returns Dados de comparação entre as avaliações
   */
  static async compareEvaluations(testIds: string[]): Promise<ComparisonResponse> {
    try {
      if (testIds.length < 2) {
        throw new Error('Mínimo de 2 avaliações necessário para comparação');
      }

      console.log('Enviando IDs para comparação:', testIds);
      console.log('Payload sendo enviado:', { test_ids: testIds });

      // Usar o endpoint /test/compare que existe no backend
      const response = await api.post('/test/compare', {
        test_ids: testIds
      });

      // Log detalhado da resposta completa
      console.log('=== RESPOSTA COMPLETA DA API /test/compare ===');
      console.log('Resposta completa:', JSON.stringify(response.data, null, 2));
      console.log('Estrutura da resposta:', {
        total_evaluations: response.data?.total_evaluations,
        total_comparisons: response.data?.total_comparisons,
        evaluations_count: response.data?.evaluations?.length,
        comparisons_count: response.data?.comparisons?.length,
      });
      
      // Log de cada comparação
      if (response.data?.comparisons) {
        response.data.comparisons.forEach((comp: any, index: number) => {
          console.log(`\n--- Comparação ${index + 1} ---`);
          console.log(`De: ${comp.from_evaluation?.title} (${comp.from_evaluation?.id})`);
          console.log(`Para: ${comp.to_evaluation?.title} (${comp.to_evaluation?.id})`);
          console.log('Geral:', {
            nota_1: comp.general_comparison?.average_grade?.evaluation_1,
            nota_2: comp.general_comparison?.average_grade?.evaluation_2,
            evolucao_percentual: comp.general_comparison?.average_grade?.evolution?.percentage,
            evolucao_direcao: comp.general_comparison?.average_grade?.evolution?.direction,
            proficiencia_1: comp.general_comparison?.average_proficiency?.evaluation_1,
            proficiencia_2: comp.general_comparison?.average_proficiency?.evaluation_2,
            proficiencia_evolucao: comp.general_comparison?.average_proficiency?.evolution?.percentage,
          });
          console.log('Disciplinas:', Object.keys(comp.subject_comparison || {}));
        });
      }
      console.log('=== FIM DA RESPOSTA ===\n');

      return response.data;
    } catch (error) {
      console.error('Erro ao comparar avaliações:', error);
      console.error('Detalhes do erro:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: error.config
      });
      throw error;
    }
  }

  /**
   * Compara múltiplas avaliações específicas de um aluno
   * @param studentId ID do aluno (pode ser user_id ou student_id)
   * @param testIds Array de IDs das avaliações (mínimo 2)
   * @returns Dados de comparação do aluno entre as avaliações
   */
  static async compareStudentEvaluations(
    studentId: string, 
    testIds: string[]
  ): Promise<StudentComparisonResponse> {
    try {
      if (testIds.length < 2) {
        throw new Error('Mínimo de 2 avaliações necessário para comparação');
      }

      const response = await api.post(`/student/${studentId}/compare`, {
        test_ids: testIds
      });

      return response.data;
    } catch (error) {
      console.error('Erro ao comparar avaliações do aluno:', error);
      throw error;
    }
  }

  /**
   * Valida se as avaliações podem ser comparadas
   * @param testIds Array de IDs das avaliações
   * @returns true se pode comparar, false caso contrário
   */
  static validateComparison(testIds: string[]): { valid: boolean; message?: string } {
    if (testIds.length < 2) {
      return { valid: false, message: 'Selecione pelo menos 2 avaliações para comparar' };
    }

    if (testIds.length > 10) {
      return { valid: false, message: 'Máximo de 10 avaliações por comparação' };
    }

    return { valid: true };
  }
}
