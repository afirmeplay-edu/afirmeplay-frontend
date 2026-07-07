import { api } from '@/lib/api';
import type { 
  Certificate, 
  CertificateTemplate, 
  ApprovedStudent, 
  EvaluationWithCertificates,
  CertificateApprovalRequest,
  CertificateEvaluationListItem,
  CertificateBatchFilters,
  CertificateBatchResponse,
} from '@/types/certificates';

function mapCertificateEvaluationListItem(
  item: CertificateEvaluationListItem
): EvaluationWithCertificates {
  const subjectList = (item.subjects?.length
    ? item.subjects.map((s) => s.name)
    : item.subject?.name
      ? [item.subject.name]
      : []
  ).filter(Boolean);

  return {
    id: item.evaluation_id,
    title: item.title,
    subject: subjectList.length > 0 ? subjectList.join(', ') : 'Disciplina não informada',
    subjects: subjectList,
    applied_at: item.created_at || '',
    approved_students_count: item.eligible_students_count,
    total_students_count: item.eligible_students_count,
    certificate_status: item.certificate_status,
    approved_certificates_count: item.approved_certificates_count,
    pending_certificates_count: item.pending_certificates_count,
    certificates_count: item.certificates_count,
    has_template: item.has_template,
    created_by: item.created_by
      ? { id: item.created_by.id, name: item.created_by.name }
      : undefined,
    type: item.type?.toUpperCase() || 'AVALIACAO',
  };
}

export class CertificatesApiService {
  /**
   * Busca quantidade de certificados emitidos (respeita escopo do usuário logado).
   * GET /certificates/quantidade
   * Requer contexto de cidade (X-City-ID) quando aplicável.
   */
  static async getQuantidade(): Promise<number> {
    try {
      const response = await api.get<{ quantidade: number }>('/certificates/quantidade');
      return response.data?.quantidade ?? 0;
    } catch (error) {
      console.error('Erro ao buscar quantidade de certificados:', error);
      return 0;
    }
  }

  /**
   * Lista avaliações com status agregado de certificados.
   * GET /certificates/evaluations
   */
  static async getCertificateEvaluations(options?: {
    page?: number;
    per_page?: number;
    sort?: 'created_at' | 'title';
    order?: 'asc' | 'desc';
    municipalityId?: string;
    fetchAllPages?: boolean;
  }): Promise<EvaluationWithCertificates[]> {
    const perPage = Math.min(options?.per_page ?? 100, 100);
    const sort = options?.sort ?? 'created_at';
    const order = options?.order ?? 'desc';
    const fetchAllPages = options?.fetchAllPages ?? true;
    const requestConfig = options?.municipalityId
      ? { meta: { cityId: options.municipalityId } }
      : {};

    const fetchPage = async (page: number) => {
      const response = await api.get<CertificateEvaluationsResponse>('/certificates/evaluations', {
        params: { page, per_page: perPage, sort, order },
        ...requestConfig,
      });
      return response.data;
    };

    try {
      const first = await fetchPage(options?.page ?? 1);
      let items = [...(first.data ?? [])];

      if (fetchAllPages && first.pagination?.has_next) {
        let nextPage = first.pagination.next_num ?? 2;
        while (nextPage && nextPage <= (first.pagination.pages ?? nextPage)) {
          const pageData = await fetchPage(nextPage);
          items = items.concat(pageData.data ?? []);
          if (!pageData.pagination?.has_next) break;
          nextPage = pageData.pagination.next_num ?? nextPage + 1;
        }
      }

      return items.map(mapCertificateEvaluationListItem);
    } catch (error) {
      console.error('Erro ao listar avaliações de certificados:', error);
      return [];
    }
  }

  /**
   * @deprecated Use getCertificateEvaluations para a tela de certificados.
   * Buscar avaliações da escola do diretor com contagem de alunos aprovados
   * - Admin: GET /test/ (todas as avaliações)
   * - Tecadm: GET /test/ com types=AVALIACAO,SIMULADO (backend retorna escopo do município)
   * - Diretor/coordenador: GET /evaluation-results/avaliacoes com filtros
   */
  static async getEvaluationsBySchool(
    schoolId?: string, 
    municipalityId?: string, 
    isAdmin: boolean = false
  ): Promise<EvaluationWithCertificates[]> {
    try {
      let evaluations: any[] = [];
      const isTecadm = !isAdmin && !!municipalityId && !schoolId;

      if (isAdmin || isTecadm) {
        const response = await api.get('/test/', {
          params: {
            page: 1,
            per_page: 1000,
            ...(isTecadm ? { types: 'AVALIACAO,SIMULADO' } : {})
          }
        });

        const testsData = response.data?.data || response.data || [];
        evaluations = Array.isArray(testsData) ? testsData : testsData.tests || [];
      } else {
        if (!municipalityId) {
          return [];
        }
        
        // Buscar o município para obter o estado
        try {
          const municipalityResponse = await api.get(`/city/${municipalityId}`);
          const municipalityData = municipalityResponse.data;
          
          const params: Record<string, string> = {
            estado: municipalityData.state || '',
            municipio: municipalityId,
            avaliacao: 'all',
            escola: schoolId ?? '', // vazio = todas as escolas do município (tecadm)
            page: '1',
            per_page: '1000'
          };
          const response = await api.get('/evaluation-results/avaliacoes', { params });
          
          // Extrair avaliações da resposta
          const data = response.data;
          // O endpoint retorna em resultados_detalhados.avaliacoes
          if (data?.resultados_detalhados?.avaliacoes && Array.isArray(data.resultados_detalhados.avaliacoes)) {
            // Incluir todas as avaliações (incluindo olimpíadas) para certificados
            evaluations = data.resultados_detalhados.avaliacoes;
            
            // Extrair avaliações únicas do objeto evaluation dentro de cada resultado
            // Como os resultados são agregados, precisamos extrair o ID da avaliação do objeto evaluation
            const uniqueEvaluationsMap = new Map<string, any>();
            
            evaluations.forEach((result: any) => {
              // Tentar extrair a avaliação de diferentes formas
              const evaluation = result.test || result.evaluation;
              if (evaluation) {
                const evalId = evaluation.id || result.id;
                if (evalId && !uniqueEvaluationsMap.has(evalId)) {
                  uniqueEvaluationsMap.set(evalId, {
                    ...result,
                    id: evalId,
                    evaluation: evaluation
                  });
                }
              } else if (result.id && (result.id.startsWith('escola_') || result.id.startsWith('serie_') || result.id.startsWith('turma_'))) {
                // Se o ID é agregado, tentar buscar a avaliação original
                // Por enquanto, vamos usar o título para identificar
                const title = result.titulo || result.title;
                if (title && !uniqueEvaluationsMap.has(title)) {
                  uniqueEvaluationsMap.set(title, result);
                }
              } else {
                uniqueEvaluationsMap.set(result.id || result.test_id, result);
              }
            });
            
            evaluations = Array.from(uniqueEvaluationsMap.values());
          } else if (data?.data && Array.isArray(data.data)) {
            evaluations = data.data;
          } else if (Array.isArray(data)) {
            evaluations = data;
          }
        } catch (error: any) {
          return [];
        }
      }
      
      // Transformar dados da API para o formato esperado
      return evaluations.map((evaluation: any) => {
        // Extrair ID da avaliação corretamente
        const evaluationObj = evaluation.test || evaluation.evaluation || evaluation;
        const evaluationId = evaluation.id || evaluation.test_id || evaluationObj?.id;
        
        // Extrair total de alunos participantes de múltiplas fontes possíveis
        const totalStudents = 
          evaluation.total_students || 
          evaluation.total_alunos || 
          evaluation.alunos_participantes ||
          evaluation.studentCount ||
          evaluation.studentsCount ||
          evaluation.participants_count ||
          evaluation.totalParticipants ||
          evaluationObj?.total_students ||
          evaluationObj?.total_alunos ||
          evaluationObj?.alunos_participantes ||
          evaluationObj?.studentCount ||
          evaluationObj?.studentsCount ||
          0;
        
        // Extrair created_by da avaliação
        const createdBy = evaluation.created_by || evaluation.createdBy || evaluationObj?.created_by || evaluationObj?.createdBy;
        
        // Extrair tipo da avaliação (AVALIACAO ou OLIMPIADA)
        const evaluationType = evaluation.type || evaluation.tipo || evaluationObj?.type || evaluationObj?.tipo || 'AVALIACAO';
        
        // Extrair data de aplicação de múltiplas fontes possíveis
        const appliedAt = 
          evaluation.applied_at || 
          evaluation.data_aplicacao ||
          evaluation.createdAt ||                          // Campo padrão do /test/
          evaluation.startDateTime ||                      // Campo de olimpíadas
          evaluation.application_info?.application ||      // Campo de aplicação de olimpíadas
          evaluationObj?.createdAt ||                      // Campo do objeto de avaliação
          evaluationObj?.created_at ||
          evaluationObj?.startDateTime ||
          evaluationObj?.application_info?.application ||
          evaluation.created_at ||
          null;
        
        return {
          id: evaluationId,
          title: evaluation.title || evaluation.titulo || evaluationObj?.title || 'Avaliação sem título',
          subject: evaluation.subject?.name || evaluation.subject_rel?.name || evaluation.disciplina || evaluationObj?.subject_rel?.name || 'Disciplina não informada',
          applied_at: appliedAt,
          approved_students_count: 0, // Será calculado quando necessário via endpoint específico
          total_students_count: totalStudents,
          certificate_status: evaluation.certificate_status || 'none',
          created_by: createdBy ? {
            id: createdBy.id || createdBy._id || '',
            name: createdBy.name || createdBy.nome || ''
          } : undefined,
          type: evaluationType
        };
      });
    } catch (error: any) {
      return [];
    }
  }

  /**
   * Buscar alunos aprovados (nota >= 6) de uma avaliação
   * Usa o endpoint /certificates/approved-students/{evaluation_id}
   */
  static async getApprovedStudents(evaluationId: string): Promise<ApprovedStudent[]> {
    try {
      const response = await api.get(`/certificates/approved-students/${evaluationId}`);
      
      // O endpoint retorna um array direto de alunos aprovados
      const students = Array.isArray(response.data) ? response.data : [];

      // Mapear para o formato esperado
      return students.map((student: any) => ({
        id: student.id || student.student_id,
        name: student.name || student.nome || 'Aluno sem nome',
        grade: Number(student.grade || student.nota || student.score || 0),
        class_id: student.class_id ?? student.class?.id ?? null,
        class_name: student.class_name ?? student.turma ?? student.class?.name ?? null,
        school_id: student.school_id ?? student.school?.id ?? null,
        school_name: student.school_name ?? student.escola ?? student.school?.name ?? null,
        grade_id: student.grade_id ?? student.serie_id ?? student.class?.grade?.id ?? null,
        grade_name: student.grade_name ?? student.serie_name ?? student.serie ?? student.class?.grade?.name ?? null,
        certificate_id: student.certificate_id ?? null,
        certificate_status: student.certificate_status ?? null,
      }));
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return [];
      }
      return [];
    }
  }

  /**
   * Buscar template de certificado de uma avaliação
   * Retorna null se não existir (comportamento esperado)
   */
  static async getCertificateTemplate(evaluationId: string): Promise<CertificateTemplate | null> {
    try {
      const response = await api.get(`/certificates/template/${evaluationId}`);
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return null;
      }
      return null;
    }
  }

  /**
   * Salvar ou atualizar template de certificado
   * Se o template tiver id, atualiza; caso contrário, cria novo
   */
  static async saveCertificateTemplate(template: CertificateTemplate): Promise<CertificateTemplate> {
    try {
      const response = await api.post('/certificates/template', template);
      return response.data;
    } catch (error: any) {
      // Se for erro de validação, lançar o erro
      if (error?.response?.status === 400) {
        throw new Error(error.response?.data?.erro || 'Erro ao salvar template');
      }
      // Para outros erros, retornar o template original para não quebrar o fluxo
      return template;
    }
  }

  /**
   * Aprovar e enviar certificados para alunos
   * Pode aprovar todos os aprovados (apenas evaluation_id) ou alunos específicos (evaluation_id + student_ids)
   */
  static async approveCertificates(
    evaluationId: string, 
    studentIds?: string[]
  ): Promise<{ 
    success: boolean; 
    message: string;
    certificates_issued?: number;
    certificates_updated?: number;
    total_processed?: number;
    errors?: string[];
  }> {
    try {
      const requestBody: { evaluation_id: string; student_ids?: string[] } = {
        evaluation_id: evaluationId
      };
      
      // Se studentIds for fornecido, incluir no body
      if (studentIds && studentIds.length > 0) {
        requestBody.student_ids = studentIds;
      }
      
      const response = await api.post('/certificates/approve', requestBody);
      return response.data;
    } catch (error: any) {
      // Se for erro de validação, lançar erro com mensagem
      if (error?.response?.status === 400) {
        throw new Error(error.response?.data?.erro || 'Erro ao aprovar certificados');
      }
      
      throw error;
    }
  }

  /**
   * Criar notificação para aluno sobre certificado aprovado
   * Nota: Normalmente feito automaticamente pelo backend, mas pode ser usado para notificações adicionais
   */
  static async notifyStudent(studentId: string, certificateId: string, evaluationTitle: string): Promise<void> {
    try {
      await api.post('/notifications', {
        user_id: studentId,
        type: 'success',
        title: 'Você recebeu um novo certificado!',
        message: `Parabéns! Você recebeu um certificado por sua excelente performance na avaliação "${evaluationTitle}".`,
        action_url: '/aluno/certificados',
        action_text: 'Ver Certificado',
        priority: 'high',
        category: 'student'
      });
    } catch (error) {
      // Silenciar se endpoint não existir
    }
  }

  /**
   * Buscar certificados do aluno
   */
  static async getStudentCertificates(studentId: string): Promise<Certificate[]> {
    try {
      const response = await api.get(`/certificates/student/${studentId}`);
      return response.data?.data || response.data || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Buscar certificados do aluno logado
   */
  static async getMyCertificates(): Promise<Certificate[]> {
    try {
      const response = await api.get('/certificates/me');
      return response.data?.data || response.data || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Buscar certificados em lote para download (JSON; PDF gerado no frontend)
   */
  static async getCertificatesBatch(
    evaluationId: string,
    filters: CertificateBatchFilters = {}
  ): Promise<CertificateBatchResponse> {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.school_id) params.set('school_id', filters.school_id);
    if (filters.grade_id) params.set('grade_id', filters.grade_id);
    if (filters.class_id) params.set('class_id', filters.class_id);

    const query = params.toString();
    const url = `/certificates/batch/${evaluationId}${query ? `?${query}` : ''}`;
    const response = await api.get(url);
    return response.data;
  }

  /**
   * Buscar certificado específico
   */
  static async getCertificate(certificateId: string): Promise<Certificate | null> {
    try {
      const response = await api.get(`/certificates/${certificateId}`);
      return response.data;
    } catch (error) {
      return null;
    }
  }
}

