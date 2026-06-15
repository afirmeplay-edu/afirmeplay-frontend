import { api, apiWithRetry, apiWithTimeout } from '@/lib/api';
import { EvaluationResultsData, StudentProficiency, ResultsFilters, calculateProficiency, RelatorioCompleto } from '@/types/evaluation-results';
import { normalizeApiList } from '@/utils/normalizeApiList';
import { normalizeResultsPeriodYm } from '@/utils/resultsPeriod';

/** Query param para relatórios baseados em cartão-resposta (gabarito), alinhado ao backend. */
export const REPORT_ENTITY_TYPE_ANSWER_SHEET = 'answer_sheet' as const;
export type ReportEntityTypeQuery = typeof REPORT_ENTITY_TYPE_ANSWER_SHEET;

/** Query/header opcionais para `/evaluation-results/avaliacoes/:id` e sub-rotas (`verificar-status`, `status-resumo`). */
export type AvaliacaoResourceRequestOptions = {
  report_entity_type?: ReportEntityTypeQuery;
  city_id?: string;
  metaCityId?: string;
  /** YYYY-MM: mês de aplicação (ClassTest.application), quando suportado pelo endpoint. */
  periodo?: string;
};

// ✅ NOVO: Interfaces para status e processamento de relatórios
interface ReportStatus {
  status: 'ready' | 'processing' | 'not_found';
  has_payload: boolean;
  has_ai_analysis: boolean;
  is_dirty: boolean;
  ai_analysis_is_dirty: boolean;
  last_update: string | null;
}

interface ProcessingResponse {
  status: 'processing';
  message: string;
  has_payload: boolean;
  has_ai_analysis: boolean;
  is_dirty: boolean;
  ai_analysis_is_dirty: boolean;
  last_update: string | null;
  evaluation_id: string;
  scope_type: 'school' | 'city';
  scope_id: string;
}

// ===== INTERFACES PARA BACKEND REAL =====

/** Item cru em `resultados_detalhados.avaliacoes` ao filtrar olimpíadas/competição na listagem. */
type ListaAvaliacoesDetalhesItem = {
  type?: unknown;
  tipo?: unknown;
  titulo?: unknown;
  title?: unknown;
};

// ✅ NOVO: Interfaces para a nova estrutura de resposta em cascata
interface FiltrosAplicados {
  estado: string;
  municipio: string;
  escola: string | null;
  serie: string | null;
  turma: string | null;
  avaliacao: string;
}

/** Aluno pendente/faltoso no recorte (lista em `estatisticas_gerais.alunos_pendentes_detalhe`). */
export interface AlunoPendenteDetalheEstatisticas {
  id: string;
  nome: string;
  escola?: string;
  serie?: string;
  turma?: string;
}

/** Estatísticas por disciplina no mesmo escopo da rota (GET /evaluation-results/avaliacoes). */
export interface EstatisticasGeraisPorDisciplinaItem {
  disciplina: string;
  total_avaliacoes?: number;
  total_alunos: number;
  alunos_participantes: number;
  alunos_pendentes?: number;
  alunos_ausentes?: number;
  media_nota: number;
  media_proficiencia: number;
  /** Faixas padrão (online) ou chaves livres (ex.: cartão-resposta). */
  distribuicao_classificacao: Record<string, number>;
}

interface EstatisticasGerais {
  tipo: 'municipio' | 'escola' | 'serie' | 'turma' | 'avaliacao';
  nome: string;
  estado: string;
  municipio?: string;
  escola?: string;
  serie?: string;
  data_aplicacao?: string;
  total_escolas?: number;
  total_series?: number;
  total_turmas?: number;
  /** Cartão-resposta agregado: quantidade de gabaritos no recorte (quando o backend envia). */
  total_gabaritos?: number;
  total_avaliacoes: number;
  total_alunos: number;
  alunos_participantes: number;
  alunos_pendentes: number;
  alunos_ausentes: number;
  /** Lista de pendentes/faltosos alinhada a `alunos_pendentes` no consolidado. */
  alunos_pendentes_detalhe?: AlunoPendenteDetalheEstatisticas[];
  /** Comparecimento agregado (GET /answer-sheets/resultados-agregados). */
  percentual_comparecimento?: number;
  /**
   * Classificação do recorte (ex.: município) — GET /answer-sheets/resultados-agregados.
   * `null` = sem classificação.
   */
  nivel_classificacao?: string | null;
  media_nota_geral: number;
  media_proficiencia_geral: number;
  distribuicao_classificacao_geral: {
    abaixo_do_basico: number;
    basico: number;
    adequado: number;
    avancado: number;
  };
  participantes_distribuicao?: number;
  report_entity_type?: string;
  /** Agregado por disciplina no escopo atual; ausente ou `[]` em alguns branches — tratar como []. */
  por_disciplina?: EstatisticasGeraisPorDisciplinaItem[];
}

interface OpcoesProximosFiltros {
  avaliacoes?: Array<{ id: string; titulo: string }>;
  escolas?: Array<{ id: string; name: string }>;
  series?: Array<{ id: string; name: string }>;
  turmas?: Array<{ id: string; name: string }>;
  maximo_alcancado?: boolean;
}

/** Parâmetros para GET /evaluation-results/evolucao/opcoes-filtros (Evolução: Estado → Município → Escola → Série → Turma) */
export interface EvolucaoOpcoesFiltrosParams {
  estado?: string;
  municipio?: string;
  escola?: string;
  serie?: string;
}

/** Resposta de GET /evaluation-results/evolucao/opcoes-filtros */
export interface EvolucaoOpcoesFiltrosResponse {
  estados?: Array<{ id: string; nome?: string; name?: string }>;
  municipios?: Array<{ id: string; nome?: string; name?: string }>;
  escolas?: Array<{ id: string; nome?: string; name?: string }>;
  series?: Array<{ id: string; nome?: string; name?: string }>;
  turmas?: Array<{ id: string; nome?: string; name?: string }>;
}

// ✅ NOVO: Interfaces para tabela detalhada
interface TabelaDetalhada {
  disciplinas: Array<{
    id: string;
    nome: string;
    questoes: Array<{
      numero: number;
      habilidade: string;
      codigo_habilidade: string;
      question_id: string;
    }>;
    alunos: Array<{
      id: string;
      nome: string;
      escola: string;
      serie: string;
      turma: string;
      respostas_por_questao: Array<{
        questao: number;
        acertou: boolean;
        respondeu: boolean;
        resposta: string;
      }>;
      total_acertos: number;
      total_erros: number;
      total_respondidas: number;
      total_questoes_disciplina: number;
      nivel_proficiencia: string;
      nota: number;
      proficiencia: number;
    }>;
  }>;
  geral?: {
    alunos: Array<{
      id: string;
      nome: string;
      escola?: string;
      serie?: string;
      turma?: string;
      nota_geral?: number;
      proficiencia_geral?: number;
      nivel_proficiencia_geral?: string;
      total_acertos_geral?: number;
      total_em_branco_geral?: number;
      total_questoes_geral?: number;
      total_respondidas_geral?: number;
      percentual_acertos_geral?: number;
      status_geral?: string;
    }>;
  };
}

// ✅ NOVO: Interface para ranking
export interface RankingItem {
  posicao: number;
  aluno_id: string;
  nome: string;
  escola: string;
  serie: string;
  turma: string;
  nota_geral: number;
  proficiencia_geral: number;
  classificacao_geral: string;
  total_acertos: number;
  total_questoes: number;
}

export interface NovaRespostaAPI {
  nivel_granularidade: 'municipio' | 'escola' | 'serie' | 'turma' | 'avaliacao';
  filtros_aplicados: FiltrosAplicados;
  estatisticas_gerais: EstatisticasGerais;
  resultados_por_disciplina: Array<{
    disciplina: string;
    total_avaliacoes: number;
    total_alunos: number;
    alunos_participantes: number;
    alunos_pendentes: number;
    alunos_ausentes: number;
    media_nota: number;
    media_proficiencia: number;
    distribuicao_classificacao: {
      abaixo_do_basico: number;
      basico: number;
      adequado: number;
      avancado: number;
    };
  }>;
  resultados_detalhados: {
    avaliacoes: EvaluationResult[];
    paginacao: {
      page: number;
      per_page: number;
      total: number;
      total_pages: number;
    };
  };
  tabela_detalhada?: TabelaDetalhada;
  ranking?: RankingItem[];
  opcoes_proximos_filtros: OpcoesProximosFiltros;
  analise_ia_status?: 'processing' | 'ready' | 'error';
  analise_ia_cache_key?: string;
  analise_ia?: Record<string, unknown>;
}

/** Resposta mínima de rotas GET `.../analise-ia` (avaliações, agregados, mapa). */
export type AnaliseIaRouteResponse = {
  analise_ia_status?: 'processing' | 'ready' | 'error';
  analise_ia_cache_key?: string;
  analise_ia?: Record<string, unknown>;
  error?: string;
  details?: string;
};









interface BackendEvaluationResult {
  id: string;
  session_id: string;
  test_id: string;
  test_title: string;
  student_id: string;
  student_name: string;
  class_id: string;
  class_name: string;
  school_id: string;
  school_name: string;
  subject_id: string;
  subject_name: string;
  grade_id: string;
  grade_name: string;
  course_id: string;
  course_name: string;
  started_at: string;
  submitted_at: string;
  status: 'completed' | 'pending' | 'in_progress';
  score: number;
  total_questions: number;
  correct_answers: number;
  wrong_answers: number;
  blank_answers: number;
  time_spent: number; // em segundos
  answers: Array<{
    question_id: string;
    question_number: number;
    answer: string;
    is_correct: boolean;
    points_earned: number;
    max_points: number;
  }>;
}

interface BackendStudentResult {
  id: string;
  name: string;
  class: string;
  score: number;
  total_questions: number;
  correct_answers: number;
  wrong_answers: number;
  blank_answers: number;
  percentage: number;
  proficiency_score: number;
  proficiency_level: string;
  time_spent: number;
  status: 'completed' | 'pending' | 'absent';
  submitted_at: string;
}

interface BackendSubmissionResult {
  session_id: string;
  test_id: string;
  student_id: string;
  status: 'completed' | 'pending';
  score: number;
  percentage: number;
  total_questions: number;
  correct_answers: number;
  wrong_answers: number;
  blank_answers: number;
  time_spent: number;
  submitted_at: string;
  answers: Array<{
    question_id: string;
    answer: string;
    is_correct: boolean;
    points_earned: number;
    max_points: number;
  }>;
}

interface StudentResult {
  id: string;
  nome: string;
  turma: string;
  nota: number;
  grade: string;
  total_score?: number;
  proficiencia: number;
  proficiency?: number;
  classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
  classification?: string;
  correct_answers?: number;
  questoes_respondidas: number;
  acertos: number;
  erros: number;
  em_branco: number;
  tempo_gasto: number;
  status: 'concluida' | 'pendente';
}

// ===== INTERFACES PARA API DE RESULTADOS =====

interface EvaluationResult {
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
  status: 'finalized' | 'in_progress' | 'pending' | 'concluida' | 'em_andamento' | 'pendente' | string;
  total_alunos: number;
  alunos_participantes: number;
  alunos_pendentes: number;
  alunos_ausentes: number;
  media_nota: number;
  media_proficiencia: number;
  distribuicao_classificacao: {
    abaixo_do_basico: number;
    basico: number;
    adequado: number;
    avancado: number;
  };
  /**
   * Cartão-resposta agregado: classificação da linha (escola/série/turma conforme granularidade).
   * `null` = sem classificação (ex.: sem correções).
   */
  nivel_classificacao?: string | null;
  /** GET /answer-sheets/resultados-agregados — escola da linha (escopo município). */
  escola_id?: string;
  /** Comparecimento já calculado no backend (2 casas). */
  percentual_comparecimento?: number;
  media_nota_lingua_portuguesa?: number | null;
  media_nota_matematica?: number | null;
  medias_por_disciplina?: Array<{
    disciplina: string;
    media_nota?: number;
    media_proficiencia?: number;
  }>;
}

interface StudentResult {
  id: string;
  nome: string;
  turma: string;
  nota: number;
  proficiencia: number;
  classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
  questoes_respondidas: number;
  acertos: number;
  erros: number;
  em_branco: number;
  tempo_gasto: number;
  status: 'concluida' | 'pendente';
}

export interface StudentDetailedResult {
  test_id: string;
  student_id: string;
  student_db_id: string;
  student_name?: string; // ✅ Adicionado para exibir o nome do aluno
  total_questions: number;
  answered_questions: number;
  correct_answers: number;
  score_percentage: number;
  total_score: number;
  max_possible_score: number;
  grade: number;
  proficiencia: number;
  classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
  calculated_at: string;
  status?: 'concluida' | 'nao_respondida';
  answers: Array<{
    question_id: string;
    question_number: number;
    question_text: string;
    question_type: 'multipleChoice' | 'open' | 'trueFalse';
    question_value: number;
    student_answer: string;
    answered_at: string;
    is_correct: boolean;
    score: number;
    feedback: string | null;
    corrected_by: string | null;
    corrected_at: string | null;
  }>;
}

interface DetailedReport {
  avaliacao: {
    id: string;
    titulo: string;
    disciplina: string;
    total_questoes: number;
  };
  questoes: Array<{
    id: string;
    numero: number;
    texto: string;
    habilidade: string;
    codigo_habilidade: string;
    tipo: 'multipleChoice' | 'open' | 'trueFalse';
    dificuldade: 'Fácil' | 'Médio' | 'Difícil';
    porcentagem_acertos: number;
    porcentagem_erros: number;
  }>;
  alunos: Array<{
    id: string;
    nome: string;
    turma: string;
    respostas: Array<{
      questao_id: string;
      questao_numero: number;
      resposta_correta: boolean;
      resposta_em_branco: boolean;
      tempo_gasto: number;
    }>;
    total_acertos: number;
    total_erros: number;
    total_em_branco: number;
    nota_final: number;
    proficiencia: number;
    classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
    status: 'concluida' | 'nao_respondida';
  }>;
}

// ===== SERVIÇO PRINCIPAL =====

// ✅ NOVO: Interface para resposta da rota unificada de filtros
interface FilterOptionsResponse {
  estados?: Array<{ id: string; nome: string }>;
  municipios?: Array<{ id: string; nome: string }>;
  avaliacoes?: Array<{ id: string; titulo: string }>;
  gabaritos?: Array<{ id: string; titulo: string }>;
  escolas?: Array<{ id: string; nome: string }>;
  series?: Array<{ id: string; nome: string }>;
  series_disponiveis?: Array<{ id: string; nome: string; name?: string }>;
  turmas?: Array<{ id: string; nome: string }>;
}

export class EvaluationResultsApiService {

  // ✅ NOVO: Buscar turma e série de um aluno (TEMPORARIAMENTE DESABILITADO)
  // static async getStudentClass(studentId: string): Promise<{
  //   grade: string;
  //   class: string;
  // } | null> {
  //   try {
  //     const response = await api.get(`/students/${studentId}/class`);
  //     return response.data;
  //   } catch (error) {
      //     // Erro ao buscar turma e série do aluno
  //     return null;
  //   }
  // }

  // ✅ NOVO: Buscar avaliações de um aluno específico
  static async getStudentEvaluations(studentId: string): Promise<Array<{
    id: string;
    titulo: string;
    data_aplicacao: string;
    disciplina: string;
    serie: string;
    escola: string;
    turma?: string;
  }>> {
    try {
      const response = await api.get(`/evaluation-results/student/${studentId}/evaluations`);
      return response.data || [];
    } catch (error) {
      // Erro ao buscar avaliações do aluno
      return [];
    }
  }

  // ✅ NOVO: Buscar avaliações por escola
  static async getEvaluationsBySchool(schoolId: string): Promise<Array<{
    id: string;
    titulo: string;
    disciplina: string;
    status: string;
    data_aplicacao: string;
  }> | null> {
    try {
      const response = await api.get(`/test?school_id=${schoolId}`);

      // ✅ CORREÇÃO: Extrair o array data da resposta
      const evaluationsData = response.data.data || response.data;

      if (!Array.isArray(evaluationsData)) {
        // ERRO: evaluationsData não é um array
        return [];
      }

      // ✅ CORREÇÃO: Mapear os campos corretos do backend
      const mappedEvaluations = evaluationsData.map((evaluation: Record<string, unknown>) => ({
        id: String(evaluation.id || ''),
        titulo: String(evaluation.title || evaluation.titulo || 'Sem título'),
        disciplina: String((evaluation.subject as Record<string, unknown>)?.name || evaluation.disciplina || 'Sem disciplina'),
        status: String(evaluation.status || 'desconhecido'),
        data_aplicacao: String(evaluation.createdAt || evaluation.data_aplicacao || new Date().toISOString())
      }));

      return mappedEvaluations;
    } catch (error) {
              // ERRO ao buscar avaliações da escola
      return [];
    }
  }



  /**
   * Opções de filtro para a página Evolução (Estado → Município → Escola → Série → Turma).
   * GET /evaluation-results/evolucao/opcoes-filtros
   * Sem params → estados; ?estado=X → municipios; +municipio → escolas; +escola → series; +serie → turmas.
   */
  static async getEvolucaoOpcoesFiltros(params: EvolucaoOpcoesFiltrosParams = {}): Promise<EvolucaoOpcoesFiltrosResponse> {
    const search = new URLSearchParams();
    if (params.estado != null && params.estado !== '') search.set('estado', params.estado);
    if (params.municipio != null && params.municipio !== '') search.set('municipio', params.municipio);
    if (params.escola != null && params.escola !== '') search.set('escola', params.escola);
    if (params.serie != null && params.serie !== '') search.set('serie', params.serie);
    const query = search.toString();
    const url = `/evaluation-results/evolucao/opcoes-filtros${query ? `?${query}` : ''}`;
    const requestConfig = params.municipio ? { meta: { cityId: params.municipio } } : {};
    const response = await api.get(url, requestConfig);
    return response.data ?? {};
  }

  /**
   * Lista de avaliações para Evolução. GET /evaluation-results/evolucao/avaliacoes
   * Obrigatórios: estado, municipio. Opcionais: escola, serie, turma, nome (busca).
   */
  static async getEvolucaoAvaliacoes(
    filters: {
      estado: string;
      municipio: string;
      escola?: string;
      serie?: string;
      turma?: string;
      data_inicio?: string;
      data_fim?: string;
      nome?: string;
    },
    page: number = 1,
    perPage: number = 100
  ): Promise<NovaRespostaAPI | null> {
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
        estado: filters.estado,
        municipio: filters.municipio,
      });
      if (filters.escola != null && filters.escola !== '' && filters.escola !== 'all') params.append('escola', filters.escola);
      if (filters.serie != null && filters.serie !== '' && filters.serie !== 'all') params.append('serie', filters.serie);
      if (filters.turma != null && filters.turma !== '' && filters.turma !== 'all') params.append('turma', filters.turma);
      if (filters.data_inicio) params.append('data_inicio', filters.data_inicio);
      if (filters.data_fim) params.append('data_fim', filters.data_fim);
      if (filters.nome?.trim()) params.append('nome', filters.nome.trim());

      const requestConfig = { meta: { cityId: filters.municipio } } as const;
      const response = await api.get(`/evaluation-results/evolucao/avaliacoes?${params}`, requestConfig);

      if (response.data?.resultados_detalhados?.avaliacoes) {
        response.data.resultados_detalhados.avaliacoes =
          response.data.resultados_detalhados.avaliacoes.filter((evaluation: ListaAvaliacoesDetalhesItem) => {
            const type = String(evaluation.type ?? evaluation.tipo ?? '').toUpperCase().trim();
            const title = String(evaluation.titulo ?? evaluation.title ?? '').toUpperCase();
            if (type === 'OLIMPIADA' || type === 'OLIMPIADAS' || type.includes('OLIMPI')) return false;
            if (type === 'COMPETICAO' || type === 'COMPETIÇÃO' || type.includes('COMPET')) return false;
            if (title.includes('[OLIMPÍADA]') || title.includes('OLIMPÍADA') || title.includes('OLIMPIADA')) return false;
            if (title.includes('COMPETIÇÃO') || title.includes('COMPETICAO')) return false;
            return type === '' || type === 'AVALIACAO' || type === 'SIMULADO';
          });
      }
      return response.data;
    } catch {
      return null;
    }
  }

  static async getEvaluationsList(
    page: number = 1,
    perPage: number = 10,
    filters: {
      estado?: string;
      municipio?: string;
      escola?: string;
      serie?: string;
      turma?: string;
      avaliacao?: string;
      ai_analises?: boolean;
      report_entity_type?: ReportEntityTypeQuery;
      /** Somente admin: município selecionado (query). */
      city_id?: string;
      /** YYYY-MM: aplicação (online) ou corrected_at (cartão). */
      periodo?: string;
    } = {}
  ): Promise<NovaRespostaAPI | null> {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString(),
      });

      // ✅ NOVO: Ordem hierárquica dos filtros - Estado e Município obrigatórios, outros podem ser "all"
      if (filters.estado && filters.estado !== 'all') {
        params.append('estado', filters.estado);
      }
      if (filters.municipio && filters.municipio !== 'all') {
        params.append('municipio', filters.municipio);
      }
      // ✅ NOVO: Avaliação, Escola, Série e Turma: não enviar quando forem "all"
      if (filters.avaliacao && filters.avaliacao !== 'all') {
        params.append('avaliacao', filters.avaliacao);
      }
      if (filters.ai_analises) {
        params.append('ai_analises', 'true');
      }
      if (filters.escola && filters.escola !== 'all') {
        params.append('escola', filters.escola);
      }
      if (filters.serie && filters.serie !== 'all') {
        params.append('serie', filters.serie);
      }
      if (filters.turma && filters.turma !== 'all') {
        params.append('turma', filters.turma);
      }
      if (filters.report_entity_type) {
        params.append('report_entity_type', filters.report_entity_type);
      }
      if (filters.city_id) {
        params.append('city_id', filters.city_id);
      }
      const periodoYm = filters.periodo?.trim()
        ? normalizeResultsPeriodYm(filters.periodo)
        : 'all';
      if (periodoYm !== 'all') {
        params.append('periodo', periodoYm);
      }

      const requestConfig = filters.municipio && filters.municipio !== 'all'
        ? { meta: { cityId: filters.municipio } }
        : {};
      const response = await api.get(`/evaluation-results/avaliacoes?${params}`, requestConfig);

      // Filtrar olimpíadas e competição dos resultados (manter só AVALIACAO / SIMULADO)
      if (response.data?.resultados_detalhados?.avaliacoes) {
        response.data.resultados_detalhados.avaliacoes = 
          response.data.resultados_detalhados.avaliacoes.filter((evaluation: ListaAvaliacoesDetalhesItem) => {
            const type = String(evaluation.type ?? evaluation.tipo ?? '').toUpperCase().trim();
            const title = String(evaluation.titulo ?? evaluation.title ?? '').toUpperCase();
            if (type === 'OLIMPIADA' || type === 'OLIMPIADAS' || type.includes('OLIMPI')) return false;
            if (type === 'COMPETICAO' || type === 'COMPETIÇÃO' || type.includes('COMPET')) return false;
            if (title.includes('[OLIMPÍADA]') || title.includes('OLIMPÍADA') || title.includes('OLIMPIADA')) return false;
            if (title.includes('COMPETIÇÃO') || title.includes('COMPETICAO')) return false;
            return type === '' || type === 'AVALIACAO' || type === 'SIMULADO';
          });
      }

      return response.data;
    } catch (error: unknown) {
              // Erro ao buscar avaliações
      
      // ✅ NOVO: Tratamento específico de erros da API
      const axiosError = error as { response?: { status?: number; data?: { error?: string } } };
      if (axiosError.response?.status === 400) {
        const errorMessage = axiosError.response.data?.error || 'Erro de validação';
                  // Erro 400 - Validação
        
        // Log específico para diferentes tipos de erro 400
        if (errorMessage.includes('Estado')) {
          // Estado é obrigatório e não pode ser "all"
        } else if (errorMessage.includes('Município')) {
                      // Município é obrigatório
        } else if (errorMessage.includes('filtros válidos')) {
                      // É necessário aplicar pelo menos 2 filtros válidos (excluindo "all")
        }
      } else if (axiosError.response?.status === 403) {
        const errorMessage = axiosError.response.data?.error || 'Acesso negado';
                  // Erro 403 - Permissão
        
        if (errorMessage.includes('município')) {
                      // Acesso negado a este município
        }
      } else if (axiosError.response?.status === 404) {
                  // Erro 404 - Endpoint não encontrado
      } else if (axiosError.response?.status && axiosError.response.status >= 500) {
                  // Erro 500+ - Erro interno do servidor
      }
      
      // Retornar null para manter compatibilidade, mas com logs detalhados
      return null;
    }
  }

  /**
   * GET /evaluation-results/avaliacoes/analise-ia — só status/cache/resultado de IA para o mesmo recorte de filtros.
   */
  static async fetchAvaliacoesAnaliseIa(
    filters: {
      estado?: string;
      municipio?: string;
      escola?: string;
      serie?: string;
      turma?: string;
      avaliacao?: string;
      report_entity_type?: ReportEntityTypeQuery;
      city_id?: string;
      periodo?: string;
    } = {}
  ): Promise<AnaliseIaRouteResponse | null> {
    try {
      const params = new URLSearchParams();
      if (filters.estado && filters.estado !== 'all') {
        params.append('estado', filters.estado);
      }
      if (filters.municipio && filters.municipio !== 'all') {
        params.append('municipio', filters.municipio);
      }
      if (filters.avaliacao && filters.avaliacao !== 'all') {
        params.append('avaliacao', filters.avaliacao);
      }
      if (filters.escola && filters.escola !== 'all') {
        params.append('escola', filters.escola);
      }
      if (filters.serie && filters.serie !== 'all') {
        params.append('serie', filters.serie);
      }
      if (filters.turma && filters.turma !== 'all') {
        params.append('turma', filters.turma);
      }
      if (filters.report_entity_type) {
        params.append('report_entity_type', filters.report_entity_type);
      }
      if (filters.city_id) {
        params.append('city_id', filters.city_id);
      }
      const periodoYm = filters.periodo?.trim()
        ? normalizeResultsPeriodYm(filters.periodo)
        : 'all';
      if (periodoYm !== 'all') {
        params.append('periodo', periodoYm);
      }

      const requestConfig =
        filters.municipio && filters.municipio !== 'all'
          ? { meta: { cityId: filters.municipio } }
          : {};
      const response = await api.get<AnaliseIaRouteResponse>(
        `/evaluation-results/avaliacoes/analise-ia?${params}`,
        requestConfig
      );
      return response.data ?? null;
    } catch {
      return null;
    }
  }

  private static buildAvaliacaoResourceQuery(options?: AvaliacaoResourceRequestOptions): string {
    const params = new URLSearchParams();
    if (options?.report_entity_type) params.append('report_entity_type', options.report_entity_type);
    if (options?.city_id) params.append('city_id', options.city_id);
    if (options?.periodo?.trim()) {
      const p = normalizeResultsPeriodYm(options.periodo);
      if (p !== 'all') params.append('periodo', p);
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  private static avaliacaoResourceAxiosConfig(options?: AvaliacaoResourceRequestOptions) {
    return options?.metaCityId ? { meta: { cityId: options.metaCityId } } : {};
  }

  // Buscar avaliação específica por ID
  static async getEvaluationById(
    evaluationId: string,
    options?: AvaliacaoResourceRequestOptions
  ): Promise<EvaluationResult | null> {
    return apiWithTimeout(async () => {
      const q = this.buildAvaliacaoResourceQuery(options);
      const response = await api.get(
        `/evaluation-results/avaliacoes/${evaluationId}${q}`,
        this.avaliacaoResourceAxiosConfig(options)
      );
      return response.data;
    }, 20000); // 20s para dados básicos
  }

  // ✅ NOVO: Buscar avaliação (rota de teste) que retorna subjects_info processado
  static async getTestEvaluationById<T = { subjects_info?: Array<{ id?: string; name?: string }> }>(evaluationId: string): Promise<T | null> {
    try {
      // Tentar primeiro o endpoint /test/{id} (CORRIGIDO: endpoint correto)
      const response = await api.get(`/test/${evaluationId}`);
              // Sucesso com /test/{id}
      return response.data as T;
    } catch (error) {
              // Falha ao buscar /test/{id}, tentando /test/{id}/details
      try {
        // Tentar o endpoint /test/{id}/details como alternativa
        const response = await api.get(`/test/${evaluationId}/details`);
                  // Sucesso com /test/{id}/details
        return response.data as T;
      } catch (error2) {
                  // Falha ao buscar /test/{id}/details
        return null;
      }
    }
  }

  // Verificar e atualizar status da avaliação
  static async checkEvaluationStatus(
    evaluationId: string,
    options?: AvaliacaoResourceRequestOptions
  ): Promise<{
    success: boolean;
    message: string;
    status?: string;
  }> {
    try {
      const q = this.buildAvaliacaoResourceQuery(options);
      const response = await api.post(
        `/evaluation-results/avaliacoes/${evaluationId}/verificar-status${q}`,
        undefined,
        this.avaliacaoResourceAxiosConfig(options)
      );
      return response.data;
    } catch (error) {
              // Erro ao verificar status da avaliação
      return {
        success: false,
        message: 'Erro ao verificar status da avaliação'
      };
    }
  }

  // Obter resumo de status da avaliação
  static async getEvaluationStatusSummary(
    evaluationId: string,
    options?: AvaliacaoResourceRequestOptions
  ): Promise<{
    total_alunos: number;
    alunos_participantes: number;
    alunos_ausentes: number;
    alunos_pendentes: number;
    participation_rate: number;
    completion_rate: number;
    average_score: number;
    average_proficiency: number;
    overall_status: string;
  } | null> {
    try {
      const q = this.buildAvaliacaoResourceQuery(options);
      const response = await api.get(
        `/evaluation-results/avaliacoes/${evaluationId}/status-resumo${q}`,
        this.avaliacaoResourceAxiosConfig(options)
      );
      return response.data;
    } catch (error) {
              // Erro ao obter resumo de status da avaliação
      return null;
    }
  }

  // ✅ NOVA: Obter opções de filtros para uma avaliação específica
  static async getFilterOptionsForEvaluation(evaluationId: string): Promise<{
    subjects: string[];
    grades: Array<{ id: string; name: string }>;
    classes: string[];
    levels: string[];
  } | null> {
    try {
      const response = await api.get(`/evaluation-results/opcoes-filtros/${evaluationId}`);
      return response.data;
    } catch (error) {
              // Erro ao obter opções de filtros da avaliação
      return null;
    }
  }

  // Buscar alunos de uma avaliação específica (com filtros opcionais para escopo e performance)
  static async getStudentsByEvaluation(
    evaluationId: string,
    filters?: { municipio?: string; escola?: string; serie?: string; turma?: string }
  ): Promise<StudentResult[]> {
    return apiWithTimeout(async () => {
      const params = new URLSearchParams({ avaliacao_id: evaluationId });
      if (filters?.municipio && filters.municipio !== 'all') params.append('municipio', filters.municipio);
      if (filters?.escola && filters.escola !== 'all') params.append('escola', filters.escola);
      if (filters?.serie && filters.serie !== 'all') params.append('serie', filters.serie);
      if (filters?.turma && filters.turma !== 'all') params.append('turma', filters.turma);
      const requestConfig = filters?.municipio && filters.municipio !== 'all'
        ? { meta: { cityId: filters.municipio } }
        : {};
      const response = await api.get(`/evaluation-results/alunos?${params}`, requestConfig);
      return response.data.data || [];
    }, 25000); // 25s para lista de alunos
  }

  // ✅ NOVO: Método para buscar dados corretos usando o endpoint específico
  static async getCorrectStudentResults(evaluationId: string): Promise<{
    alunos: Array<{
      id: string;
      nome: string;
      turma: string;
      acertos: number;
      erros: number;
      em_branco: number;
      nota: number;
      proficiencia: number;
      classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
      status: 'concluida' | 'pendente';
      respostas: Array<{
        questao: number;
        resposta: string;
        correta: boolean;
        em_branco: boolean;
      }>;
    }>;
    questoes: Array<{
      numero: number;
      porcentagem_acertos: number;
    }>;
  } | null> {
    return apiWithTimeout(async () => {
      // ✅ Usar o endpoint específico que retorna os dados corretos
      const response = await api.get(`/evaluation-results/alunos?avaliacao_id=${evaluationId}`);

              // Dados corretos recebidos do endpoint

      return response.data;
    }, 25000); // 25s para lista de alunos
  }

  // Buscar resultados detalhados de um aluno específico
  static async getStudentDetailedResults(testId: string, studentId: string, includeAnswers: boolean = false): Promise<StudentDetailedResult | null> {
    try {
      const params = includeAnswers ? { include_answers: 'true' } : {};
      const response = await api.get(`/evaluation-results/${testId}/student/${studentId}/results`, { params });
      return response.data;
    } catch (error: unknown) {
      // Se o erro contém dados da resposta (aluno não respondeu), retornar os dados
      const errorResponse = error as { response?: { data?: Record<string, unknown> } };
      const errorData = errorResponse?.response?.data;
      if (errorData && errorData.test_id) {
        return {
          test_id: String(errorData.test_id),
          student_id: String(errorData.student_id),
          student_db_id: String(errorData.student_db_id),
          total_questions: Number(errorData.total_questions),
          answered_questions: Number(errorData.answered_questions),
          correct_answers: Number(errorData.correct_answers),
          score_percentage: Number(errorData.score_percentage),
          total_score: Number(errorData.total_score),
          max_possible_score: Number(errorData.max_possible_score),
          grade: Number(errorData.grade) || 0,
          proficiencia: Number(errorData.proficiencia) || 0,
          classificacao: (String(errorData.classificacao) as 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado') || 'Abaixo do Básico',
          calculated_at: String(errorData.calculated_at) || new Date().toISOString(),
          status: (String(errorData.status) as 'concluida' | 'nao_respondida'),
          answers: []
        };
      }

      return null;
    }
  }

  // Buscar relatório detalhado de uma avaliação
  static async getDetailedReport(
    evaluationId: string,
    options?: { report_entity_type?: ReportEntityTypeQuery; cityId?: string; city_id?: string }
  ): Promise<DetailedReport | null> {
    return apiWithRetry(async () => {
      const qs = new URLSearchParams();
      if (options?.report_entity_type) {
        qs.append('report_entity_type', options.report_entity_type);
      }
      if (options?.city_id) {
        qs.append('city_id', options.city_id);
      }
      const query = qs.toString();
      const url = `/evaluation-results/relatorio-detalhado/${evaluationId}${query ? `?${query}` : ''}`;
      const requestConfig =
        options?.cityId ? { meta: { cityId: options.cityId } } : {};
      const response = await api.get(url, requestConfig);
      return response.data;
    }, 2, 2000, 90000); // 2 retries, 2s delay, max 90s timeout
  }

  // Buscar resultados das sessões de teste
  static async getEvaluations(filters: ResultsFilters = {}, page = 1, perPage = 10): Promise<{
    results: EvaluationResultsData[];
    total: number;
    page: number;
    totalPages: number;
    isBackendConnected: boolean;
  }> {
    try {
      // Construir parâmetros para a API
      const params: Record<string, string | number> = {
        page,
        per_page: perPage
      };

      if (filters.course) params.course = filters.course;
      if (filters.subject) params.subject = filters.subject;
      if (filters.class) params.class_id = filters.class;
      if (filters.school) params.school_id = filters.school;
      if (filters.status && filters.status.length > 0) params.status = filters.status.join(',');
      if (filters.dateRange?.start) params.start_date = filters.dateRange.start;
      if (filters.dateRange?.end) params.end_date = filters.dateRange.end;

      // Buscar sessões de teste completadas
      const response = await api.get('/test-sessions/results', { params });

      if (!response.data || !Array.isArray(response.data.sessions)) {
        throw new Error('Resposta da API não possui estrutura esperada');
      }

      // Transformar dados da API para o formato esperado
      const sessions: BackendEvaluationResult[] = response.data.sessions;
      const results = await this.transformSessionsToResults(sessions);

      return {
        results,
        total: response.data.total || results.length,
        page: response.data.page || page,
        totalPages: response.data.total_pages || Math.ceil(results.length / perPage),
        isBackendConnected: true
      };
    } catch (error) {
              // Erro ao buscar avaliações
      return {
        results: [],
        total: 0,
        page,
        totalPages: 0,
        isBackendConnected: false
      };
    }
  }

  // Transformar sessões em resultados agrupados
  private static async transformSessionsToResults(sessions: BackendEvaluationResult[]): Promise<EvaluationResultsData[]> {
    // Agrupar sessões por teste
    const groupedByTest = sessions.reduce((acc, session) => {
      if (!acc[session.test_id]) {
        acc[session.test_id] = [];
      }
      acc[session.test_id].push(session);
      return acc;
    }, {} as Record<string, BackendEvaluationResult[]>);

    const results: EvaluationResultsData[] = [];

    for (const [testId, testSessions] of Object.entries(groupedByTest)) {
      const firstSession = testSessions[0];

      // Calcular estatísticas agregadas
      const completedSessions = testSessions.filter(s => s.status === 'completed');
      const totalStudents = testSessions.length;
      const completedStudents = completedSessions.length;
      const averageScore = completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => sum + s.score, 0) / completedSessions.length
        : 0;

      // Calcular distribuição por proficiência
      const distribution = {
        abaixo_do_basico: 0,
        basico: 0,
        adequado: 0,
        avancado: 0
      };

      const studentsData: StudentProficiency[] = completedSessions.map(session => {
        // Calcular proficiência usando a função oficial
        const proficiencyResult = calculateProficiency(
          session.score,
          session.total_questions,
          firstSession.grade_name,
          firstSession.subject_name,
          firstSession.course_name
        );

        // Incrementar distribuição
        distribution[proficiencyResult.proficiencyLevel]++;

        return {
          studentId: session.student_id,
          studentName: session.student_name,
          studentClass: session.class_name,
          rawScore: session.score,
          proficiencyScore: proficiencyResult.proficiencyScore,
          proficiencyLevel: proficiencyResult.proficiencyLevel,
          classification: proficiencyResult.classification,
          answeredQuestions: session.total_questions - session.blank_answers,
          correctAnswers: session.correct_answers,
          wrongAnswers: session.wrong_answers,
          blankAnswers: session.blank_answers,
          timeSpent: Math.floor(session.time_spent / 60), // converter para minutos
          status: session.status === 'completed' ? 'completed' : 'pending'
        };
      });

      const averageProficiency = studentsData.length > 0
        ? studentsData.reduce((sum, s) => sum + s.proficiencyScore, 0) / studentsData.length
        : 0;

      const result: EvaluationResultsData = {
        id: testId,
        evaluationId: testId,
        evaluationTitle: firstSession.test_title,
        subject: firstSession.subject_name,
        subjectId: firstSession.subject_id,
        course: firstSession.course_name,
        courseId: firstSession.course_id,
        grade: firstSession.grade_name,
        gradeId: firstSession.grade_id,
        school: firstSession.school_name,
        schoolId: firstSession.school_id,
        municipality: "São Paulo", // TODO: buscar do backend
        municipalityId: "sp-capital",
        appliedAt: firstSession.started_at,
        correctedAt: completedSessions.length > 0 ? completedSessions[0].submitted_at : undefined,
        status: completedStudents === totalStudents ? 'completed' :
          completedStudents > 0 ? 'in_progress' : 'pending',
        totalStudents,
        completedStudents,
        pendingStudents: totalStudents - completedStudents,
        absentStudents: 0, // TODO: implementar lógica de ausentes
        averageRawScore: averageScore,
        averageProficiency,
        distributionByLevel: distribution,
        classesPerformance: [],
        studentsData
      };

      results.push(result);
    }

    return results;
  }

  // Buscar alunos de uma avaliação específica
  static async getStudents(evaluationId: string, filters: ResultsFilters = {}): Promise<StudentProficiency[]> {
    try {
      const params: Record<string, string | number> = { test_id: evaluationId };
      if (filters.class) params.class_id = filters.class;
      if (filters.proficiencyRange) {
        params.proficiency_min = filters.proficiencyRange[0];
        params.proficiency_max = filters.proficiencyRange[1];
      }
      if (filters.scoreRange) {
        params.score_min = filters.scoreRange[0];
        params.score_max = filters.scoreRange[1];
      }

      const response = await api.get('/test-sessions/students', { params });

      if (!response.data || !Array.isArray(response.data.students)) {
        return [];
      }

      const students: BackendStudentResult[] = response.data.students;

      return students.map(student => ({
        studentId: student.id,
        studentName: student.name,
        studentClass: student.class,
        rawScore: student.score,
        proficiencyScore: student.proficiency_score,
        proficiencyLevel: this.mapProficiencyLevel(student.proficiency_level),
        classification: student.proficiency_level,
        answeredQuestions: student.total_questions - student.blank_answers,
        correctAnswers: student.correct_answers,
        wrongAnswers: student.wrong_answers,
        blankAnswers: student.blank_answers,
        timeSpent: Math.floor(student.time_spent / 60),
        status: student.status === 'completed' ? 'completed' : 'pending'
      }));
    } catch (error) {
              // Erro ao buscar alunos
      return [];
    }
  }

  // Recalcular avaliação
  static async recalculateEvaluation(evaluationId: string): Promise<{
    success: boolean;
    message: string;
    dados_atualizados: Record<string, unknown> | null;
  }> {
    try {
      // ✅ CORRIGIDO: Usar a rota correta da API do backend
      const response = await api.post('/evaluation-results/avaliacoes/calcular', {
        avaliacao_id: evaluationId
      });

      return {
        success: true,
        message: 'Avaliação recalculada com sucesso!',
        dados_atualizados: response.data
      };
    } catch (error: unknown) {
              // Erro ao recalcular avaliação
      const axiosError = error as { response?: { data?: { message?: string } } };
      return {
        success: false,
        message: axiosError.response?.data?.message || 'Erro ao recalcular avaliação',
        dados_atualizados: null
      };
    }
  }

  // Buscar avaliações enviadas para correção
  static async getSubmissionsForCorrection(evaluationId: string): Promise<BackendSubmissionResult[]> {
    // ✅ CORRIGIDO: Usar a rota correta da API do backend
    const response = await api.get(`/evaluation-results/admin/submitted-evaluations`, {
      params: {
        test_id: evaluationId,
        status: 'pending'
      }
    });
    return response.data.data || [];
  }

  // Corrigir submissão
  static async correctSubmission(sessionId: string, corrections: Record<string, unknown>): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // ✅ CORRIGIDO: Usar a rota correta da API do backend
      const response = await api.patch(`/evaluation-results/admin/evaluations/${sessionId}/correct`, corrections);

      return {
        success: true,
        message: 'Correção aplicada com sucesso!'
      };
    } catch (error: unknown) {
              // Erro ao corrigir submissão
      const axiosError = error as { response?: { data?: { message?: string } } };
      return {
        success: false,
        message: axiosError.response?.data?.message || 'Erro ao aplicar correção'
      };
    }
  }

  // Mapear nível de proficiência
  private static mapProficiencyLevel(level: string): 'abaixo_do_basico' | 'basico' | 'adequado' | 'avancado' {
    const normalized = level.toLowerCase().replace(/\s+/g, '_');

    if (normalized.includes('abaixo') || normalized.includes('below')) {
      return 'abaixo_do_basico';
    }
    if (normalized.includes('basico') || normalized.includes('basic')) {
      return 'basico';
    }
    if (normalized.includes('adequado') || normalized.includes('adequate')) {
      return 'adequado';
    }
    if (normalized.includes('avancado') || normalized.includes('advanced')) {
      return 'avancado';
    }

    return 'basico';
  }

  // ✅ NOVO: Buscar estados
  static async getStates(): Promise<Array<{
    id: string;
    name: string;
    uf: string;
  }>> {
    try {
      const response = await api.get('/city/states');
      return response.data || [];
    } catch (error) {
              // Erro ao buscar estados
      return [];
    }
  }

  // ✅ NOVO: Buscar municípios por estado
  static async getMunicipalitiesByState(state: string): Promise<Array<{
    id: string;
    name: string;
    state: string;
    created_at: string;
  }>> {
    try {
      const response = await api.get(`/city/municipalities/state/${state}`);
      return response.data || [];
    } catch (error) {
              // Erro ao buscar municípios
      return [];
    }
  }

  // ✅ NOVO: Buscar escolas por município
  static async getSchoolsByCity(cityId: string): Promise<Array<{
    id: string;
    name: string;
    city: {
      id: string;
      name: string;
      state: string;
    };
    students_count: number;
    classes_count: number;
  }>> {
    try {
      const response = await api.get(`/school/city/${cityId}`);
      return response.data || [];
    } catch (error) {
              // Erro ao buscar escolas
      return [];
    }
  }

  // ✅ NOVO: Buscar séries
  static async getGrades(): Promise<Array<{
    id: string;
    name: string;
    education_stage_id: string;
    education_stage: {
      id: string;
      name: string;
    };
  }>> {
    try {
      const response = await api.get('/grades');
      return response.data || [];
    } catch (error) {
              // Erro ao buscar séries
      return [];
    }
  }

  // ✅ NOVO: Buscar turmas por escola
  static async getClassesBySchool(schoolId: string): Promise<Array<{
    id: string;
    name: string;
    school: {
      id: string;
      name: string;
    };
    grade: {
      id: string;
      name: string;
    };
  }>> {
    try {
      const response = await api.get(`/classes/school/${schoolId}`);
      return response.data || [];
    } catch (error) {
              // Erro ao buscar turmas
      return [];
    }
  }

  // ✅ NOVO: Buscar turmas filtradas
  static async getFilteredClasses(filters: {
    municipality_id?: string;
    school_id?: string;
    grade_id?: string;
  }): Promise<Array<{
    id: string;
    name: string;
    school: {
      id: string;
      name: string;
    };
    grade: {
      id: string;
      name: string;
    };
  }>> {
    try {
      const params = new URLSearchParams();
      if (filters.municipality_id) params.append('municipality_id', filters.municipality_id);
      if (filters.school_id) params.append('school_id', filters.school_id);
      if (filters.grade_id) params.append('grade_id', filters.grade_id);

      const response = await api.get(`/classes/filtered?${params}`);
      return normalizeApiList(response.data);
    } catch (error) {
              // Erro ao buscar turmas filtradas
      return [];
    }
  }

  // ✅ NOVO: Buscar etapas educacionais
  static async getEducationStages(): Promise<Array<{
    id: string;
    name: string;
  }>> {
    try {
      const response = await api.get('/courses');
      return response.data || [];
    } catch (error) {
              // Erro ao buscar etapas educacionais
      return [];
    }
  }

  // Buscar opções de filtros (mantido para compatibilidade)
  // NOTA: Renomeado para evitar conflito com o método privado getFilterOptions
  static async getLegacyFilterOptions(): Promise<{
    courses: string[];
    subjects: string[];
    classes: string[];
    schools: string[];
  }> {
    try {
      const [coursesRes, subjectsRes, classesRes, schoolsRes] = await Promise.all([
        api.get('/courses').catch(() => ({ data: [] })),
        api.get('/subjects').catch(() => ({ data: [] })),
        api.get('/classes').catch(() => ({ data: [] })),
        api.get('/schools').catch(() => ({ data: [] }))
      ]);

      interface CourseItem { name?: string; nome?: string; }
      interface SubjectItem { name?: string; nome?: string; }
      interface ClassItem { name?: string; nome?: string; }
      interface SchoolItem { name?: string; nome?: string; }
      
      return {
        courses: Array.isArray(coursesRes.data) ? coursesRes.data.map((c: CourseItem) => c.name || c.nome) : [],
        subjects: Array.isArray(subjectsRes.data) ? subjectsRes.data.map((s: SubjectItem) => s.name || s.nome) : [],
        classes: Array.isArray(classesRes.data) ? classesRes.data.map((c: ClassItem) => c.name || c.nome) : [],
        schools: Array.isArray(schoolsRes.data) ? schoolsRes.data.map((s: SchoolItem) => s.name || s.nome) : []
      };

    } catch (error) {
              // Erro ao buscar opções de filtros
      return {
        courses: [],
        subjects: [],
        classes: [],
        schools: []
      };
    }
  }

  // Simular cálculo de proficiência (mantido para compatibilidade)
  // ✅ REMOVIDO: Função mockada de cálculo de proficiência
  // Os cálculos reais devem vir da API

  // ✅ NOVO: Finalizar avaliação
  static async finalizeEvaluation(testId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const response = await api.patch(`/evaluation-results/avaliacoes/${testId}/finalizar`);
      return {
        success: true,
        message: 'Avaliação finalizada com sucesso!'
      };
    } catch (error: unknown) {
              // Erro ao finalizar avaliação
      const axiosError = error as { response?: { data?: { message?: string } } };
      return {
        success: false,
        message: axiosError.response?.data?.message || 'Erro ao finalizar avaliação'
      };
    }
  }

  // ✅ NOVO: Calcular notas de teste
  static async calculateTestScores(testId: string, studentIds?: string[]): Promise<{
    success: boolean;
    message: string;
    data?: Record<string, unknown>;
  }> {
    try {
      const payload = studentIds ? { student_ids: studentIds } : {};
      const response = await api.post(`/evaluation-results/${testId}/calculate-scores`, payload);
      return {
        success: true,
        message: 'Notas calculadas com sucesso!',
        data: response.data
      };
    } catch (error: unknown) {
              // Erro ao calcular notas
      const axiosError = error as { response?: { data?: { message?: string } } };
      return {
        success: false,
        message: axiosError.response?.data?.message || 'Erro ao calcular notas'
      };
    }
  }

  // ✅ NOVO: Correção manual
  static async manualCorrection(testId: string, correctionData: {
    student_id: string;
    question_id: string;
    score: number;
    feedback?: string;
    is_correct: boolean;
  }): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const response = await api.post(`/evaluation-results/${testId}/manual-correction`, correctionData);
      return {
        success: true,
        message: 'Correção manual aplicada com sucesso!'
      };
    } catch (error: unknown) {
              // Erro ao aplicar correção manual
      const axiosError = error as { response?: { data?: { message?: string } } };
      return {
        success: false,
        message: axiosError.response?.data?.message || 'Erro ao aplicar correção manual'
      };
    }
  }

  // ✅ NOVO: Buscar estatísticas gerais
  // REMOVIDO: método antigo duplicado getGeneralStats (use a versão com filtros abaixo)

  // ✅ NOVO: Buscar resultados de aluno específico
  static async getStudentResults(testId: string, studentId: string): Promise<StudentDetailedResult | null> {
    // ✅ CORRIGIDO: Usar timeout específico para dados de aluno
    return apiWithTimeout(async () => {
      // ✅ CORRIGIDO: Buscar dados básicos primeiro
      const basicResponse = await api.get(`/evaluation-results/${testId}/student/${studentId}/results`);

      // ✅ CORRIGIDO: Buscar respostas detalhadas separadamente
      let detailedAnswers: unknown[] = [];

      try {
        const answersResponse = await api.get(`/evaluation-results/${testId}/student/${studentId}/answers`);
        detailedAnswers = (answersResponse.data as { answers?: unknown[] }).answers || Array.isArray(answersResponse.data) ? answersResponse.data : [];
      } catch {
        // Se não conseguir buscar respostas detalhadas, continuar com dados básicos
      }

      // ✅ CORRIGIDO: Combinar dados básicos com respostas detalhadas
      const combinedData = {
        ...basicResponse.data,
        answers: detailedAnswers
      };

      return combinedData;
    }, 45000); // 45s para dados completos
  }

  // ✅ NOVO: Correção em lote
  static async batchCorrection(testId: string, corrections: Array<Record<string, unknown>>): Promise<{
    success: boolean;
    message: string;
    processed: number;
    errors: number;
  }> {
    try {
      const response = await api.post(`/evaluation-results/${testId}/batch-correction`, {
        corrections: corrections
      });
      return {
        success: true,
        message: 'Correção em lote aplicada com sucesso!',
        processed: response.data.processed || 0,
        errors: response.data.errors || 0
      };
    } catch (error: unknown) {
              // Erro ao aplicar correção em lote
      const axiosError = error as { response?: { data?: { message?: string } } };
      return {
        success: false,
        message: axiosError.response?.data?.message || 'Erro ao aplicar correção em lote',
        processed: 0,
        errors: 0
      };
    }
  }

  // ✅ NOVO: Buscar correções pendentes
  static async getPendingCorrections(testId: string): Promise<BackendSubmissionResult[]> {
    const response = await api.get(`/evaluation-results/${testId}/pending-corrections`);
    return response.data.data || [];
  }

  // ✅ NOVO: Finalizar correção
  static async finishCorrection(evaluationId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const response = await api.patch(`/evaluation-results/admin/evaluations/${evaluationId}/finish`);
      return {
        success: true,
        message: 'Correção finalizada com sucesso!'
      };
    } catch (error: unknown) {
              // Erro ao finalizar correção
      const axiosError = error as { response?: { data?: { message?: string } } };
      return {
        success: false,
        message: axiosError.response?.data?.message || 'Erro ao finalizar correção'
      };
    }
  }

  // ✅ NOVO: Buscar dados das questões com códigos reais de habilidades
  static async getEvaluationSkills(testId: string): Promise<Array<{
    id: string;
    number: number;
    text: string;
    formattedText: string;
    alternatives?: Array<{
      id: string;
      text: string;
      isCorrect: boolean;
    }>;
    skills: string[]; // ✅ Códigos reais como "LP5L1.2"
    difficulty: 'Fácil' | 'Médio' | 'Difícil';
    solution: string;
    type: 'multipleChoice' | 'open' | 'trueFalse';
    value: number;
    subject: {
      id: string;
      name: string;
    };
    grade: {
      id: string;
      name: string;
    };
  }>> {
    return apiWithRetry(async () => {
      const response = await api.get(`/questions?test_id=${testId}`);
      return response.data;
    }, 2, 2000, 90000);
  }

  // ✅ NOVO: Buscar disciplinas para obter IDs
  static async getSubjects(): Promise<Array<{
    id: string;
    name: string;
    code?: string;
  }>> {
    return apiWithRetry(async () => {
      const response = await api.get('/subjects');
      return response.data;
    }, 2, 2000, 90000);
  }

  // ✅ ATUALIZADO: Buscar skills por disciplina usando ID
  static async getSkillsBySubject(subjectName: string): Promise<Array<{
    id: string;
    code: string; // ✅ Código real como "LP5L1.2"
    description: string;
  }>> {
    return apiWithRetry(async () => {
      // Primeiro, buscar todas as disciplinas
      const subjectsResponse = await api.get('/subjects');
      const subjects = subjectsResponse.data;

      // Encontrar a disciplina pelo nome
      interface SubjectItem { name?: string; id?: string; }
      const subject = (subjects as SubjectItem[]).find((s: SubjectItem) =>
        s.name?.toLowerCase() === subjectName.toLowerCase() ||
        s.name?.toLowerCase().includes(subjectName.toLowerCase()) ||
        subjectName.toLowerCase().includes(s.name?.toLowerCase() || '')
      );

      if (!subject) {
        // Disciplina não encontrada
        return [];
      }

              // Disciplina encontrada

      // Buscar skills usando o ID da disciplina
      const skillsResponse = await api.get(`/skills/subject/${subject.id}`);
      return skillsResponse.data;
    }, 2, 2000, 90000);
  }

  // ✅ NOVO: Buscar skills por avaliação (resolve o problema das disciplinas)
  static async getSkillsByEvaluation(
    testId: string,
    options?: {
      report_entity_type?: ReportEntityTypeQuery;
      /** Header X-City-ID */
      cityId?: string;
      /** Query city_id (somente admin). */
      city_id?: string;
    }
  ): Promise<Array<{
    id: string | null;
    code: string; // ✅ Código real como "LP5L1.2" ou UUID se não cadastrada
    description: string;
    subject_id: string;
    grade_id: string;
    source: 'database' | 'question'; // ✅ Indica se vem do banco ou da questão
  }>> {
    return apiWithRetry(async () => {
      const params = new URLSearchParams();
      if (options?.report_entity_type) {
        params.append('report_entity_type', options.report_entity_type);
      }
      if (options?.city_id) {
        params.append('city_id', options.city_id);
      }
      const qs = params.toString();
      const url = `/skills/evaluation/${testId}${qs ? `?${qs}` : ''}`;
      const requestConfig = options?.cityId ? { meta: { cityId: options.cityId } } : {};
      const response = await api.get(url, requestConfig);
      return response.data;
    }, 2, 2000, 90000);
  }

  // ===== NOVAS ROTAS DE FILTROS PROGRESSIVOS =====

  /** Backend pode devolver rótulo em `nome` ou `name`; a UI usa sempre `nome`. */
  private static normalizeFilterEntities(
    items: Array<{ id: string; nome?: string; name?: string }> | undefined
  ): Array<{ id: string; nome: string }> {
    if (!Array.isArray(items) || !items.length) return [];
    return items.map((item) => ({
      id: item.id,
      nome: item.nome ?? item.name ?? '',
    }));
  }

  // ✅ NOVO: Método privado centralizado para buscar opções de filtros
  private static async getFilterOptions(params: {
    estado?: string;
    municipio?: string;
    avaliacao?: string;
    escola?: string;
    serie?: string;
    turma?: string;
    report_entity_type?: ReportEntityTypeQuery;
    /** Somente admin: município selecionado (token sem cidade). */
    city_id?: string;
    /** YYYY-MM quando aplicável (avaliação online: aplicação; cartão: correções). */
    periodo?: string;
    /** Filtro do modal de seleção: série aplicada. */
    serie_filtro?: string;
    /** Filtro do modal de seleção: busca por nome. */
    nome?: string;
  }): Promise<FilterOptionsResponse> {
    try {
      const isAnswerSheet = params.report_entity_type === REPORT_ENTITY_TYPE_ANSWER_SHEET;
      const queryParams = new URLSearchParams();
      if (params.estado && params.estado !== 'all') queryParams.append('estado', params.estado);
      if (params.municipio && params.municipio !== 'all') queryParams.append('municipio', params.municipio);
      if (params.avaliacao && params.avaliacao !== 'all') {
        // /answer-sheets/opcoes-filtros-results espera "gabarito";
        // /evaluation-results/opcoes-filtros espera "avaliacao".
        queryParams.append(isAnswerSheet ? 'gabarito' : 'avaliacao', params.avaliacao);
      }
      if (params.escola && params.escola !== 'all') queryParams.append('escola', params.escola);
      if (params.serie && params.serie !== 'all') queryParams.append('serie', params.serie);
      if (params.turma && params.turma !== 'all') queryParams.append('turma', params.turma);
      if (params.report_entity_type) {
        queryParams.append('report_entity_type', params.report_entity_type);
      }
      if (params.city_id) {
        queryParams.append('city_id', params.city_id);
      }
      if (params.periodo?.trim()) {
        const p = normalizeResultsPeriodYm(params.periodo);
        if (p !== 'all') queryParams.append('periodo', p);
      }
      if (params.serie_filtro && params.serie_filtro !== 'all') {
        queryParams.append('serie_filtro', params.serie_filtro);
      }
      if (params.nome?.trim()) {
        queryParams.append('nome', params.nome.trim());
      }

      const basePath = isAnswerSheet
        ? '/answer-sheets/opcoes-filtros-results'
        : '/evaluation-results/opcoes-filtros';
      const url = `${basePath}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const requestConfig = params.municipio && params.municipio !== 'all'
        ? { meta: { cityId: params.municipio } }
        : {};
      const response = await api.get(url, requestConfig);
      const data = response.data || {};
      const avaliacoesNormalizadas =
        Array.isArray(data.avaliacoes) && data.avaliacoes.length > 0
          ? data.avaliacoes
          : Array.isArray(data.gabaritos)
            ? data.gabaritos
            : [];
      return {
        ...data,
        avaliacoes: avaliacoesNormalizadas,
        estados: this.normalizeFilterEntities(data.estados),
        municipios: this.normalizeFilterEntities(data.municipios),
        escolas: this.normalizeFilterEntities(data.escolas),
        series: this.normalizeFilterEntities(data.series),
        series_disponiveis: this.normalizeFilterEntities(data.series_disponiveis),
        turmas: this.normalizeFilterEntities(data.turmas),
      } as FilterOptionsResponse;
    } catch (error) {
      // ✅ MELHORADO: Log detalhado do erro para debug
      const axiosError = error as { response?: { status?: number; data?: unknown; config?: { url?: string } } };
      const status = axiosError.response?.status;
      const url = axiosError.response?.config?.url;

      console.error(`❌ Erro ao buscar opções de filtros (status: ${status}):`, {
        url,
        params,
        error: axiosError.response?.data || error
      });
      
      // ✅ AJUSTADO: Retornar objeto vazio em vez de lançar erro
      // Isso permite que o código que chama possa tentar fallback se necessário
      return {};
    }
  }

  // ✅ REFATORADO: Buscar estados usando rota unificada
  static async getFilterStates(
    reportEntityType?: ReportEntityTypeQuery,
    cityIdQuery?: string,
    periodo?: string
  ): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      const response = await this.getFilterOptions({
        ...(reportEntityType ? { report_entity_type: reportEntityType } : {}),
        ...(cityIdQuery ? { city_id: cityIdQuery } : {}),
        ...(periodo?.trim() ? { periodo } : {}),
      });
      return response.estados || [];
    } catch (error) {
      console.error('Erro ao buscar estados para filtros:', error);
      console.error('Erro ao buscar estados para filtros:', error);
      return [];
    }
  }

  // ✅ REFATORADO: Buscar municípios usando rota unificada com fallback
  static async getFilterMunicipalities(
    stateId: string,
    reportEntityType?: ReportEntityTypeQuery,
    cityIdQuery?: string,
    periodo?: string
  ): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    // Tentar primeiro o endpoint de opções de filtros
    try {
      // stateId pode ser nome (ex: "SP", "ALAGOAS") ou ID
      const response = await this.getFilterOptions({
        estado: stateId,
        ...(reportEntityType ? { report_entity_type: reportEntityType } : {}),
        ...(cityIdQuery ? { city_id: cityIdQuery } : {}),
        ...(periodo?.trim() ? { periodo } : {}),
      });
      
      if (response.municipios && Array.isArray(response.municipios) && response.municipios.length > 0) {
        return response.municipios;
      }
      
      // Se não retornou municípios, tentar fallback
      console.warn(`⚠️ Endpoint de opções de filtros não retornou municípios para estado: ${stateId}, tentando fallback...`);
    } catch (error) {
      console.error(`❌ Erro ao buscar municípios via opções de filtros para estado: ${stateId}`, error);
      
      // Verificar se é erro 500 (Internal Server Error) do backend
      const axiosError = error as { response?: { status?: number; data?: unknown } };
      if (axiosError.response?.status === 500) {
        console.warn(`⚠️ Erro 500 do backend ao buscar municípios para estado: ${stateId}, tentando fallback...`);
      }
    }
    
    // ✅ FALLBACK: Tentar endpoint alternativo /city/municipalities/state/{stateId}
    try {
      console.log(`🔄 Tentando buscar municípios via endpoint alternativo para estado: ${stateId}`);
      const response = await api.get(`/city/municipalities/state/${stateId}`);
      
      if (response.data && Array.isArray(response.data)) {
        // Converter formato do endpoint alternativo para o formato esperado
        const municipios = response.data.map((municipality: { id: string; name?: string; nome?: string }) => ({
          id: municipality.id,
          nome: municipality.nome || municipality.name || ''
        })).filter((m: { nome: string }) => m.nome !== '');
        
        if (municipios.length > 0) {
          console.log(`✅ Fallback bem-sucedido: ${municipios.length} municípios encontrados via endpoint alternativo`);
          return municipios;
        }
      }
    } catch (fallbackError) {
      console.error(`❌ Erro também no fallback ao buscar municípios para estado: ${stateId}`, fallbackError);
    }
    
    // Retornar array vazio se ambos os métodos falharem
    console.error(`❌ Não foi possível carregar municípios para o estado: ${stateId} (todos os métodos falharam)`);
    return [];
  }

  // ✅ REFATORADO: Buscar escolas usando rota unificada
  static async getFilterSchools(params: {
    municipio: string;
    estado?: string;
    report_entity_type?: ReportEntityTypeQuery;
    city_id?: string;
    periodo?: string;
  }): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      // Se não tiver estado, não podemos usar a nova rota unificada
      if (!params.estado) {
        console.warn('getFilterSchools requer estado para usar a nova rota unificada');
        return [];
      }
      
      const response = await this.getFilterOptions({
        estado: params.estado,
        municipio: params.municipio,
        ...(params.report_entity_type ? { report_entity_type: params.report_entity_type } : {}),
        ...(params.city_id ? { city_id: params.city_id } : {}),
        ...(params.periodo?.trim() ? { periodo: params.periodo } : {}),
      });
      return response.escolas || [];
    } catch (error) {
      console.error('Erro ao buscar escolas para filtros:', error);
      return [];
    }
  }

  // ✅ REFATORADO: Buscar séries usando rota unificada
  static async getFilterGrades(filters: {
    estado: string;
    municipio?: string;
    escola?: string;
    report_entity_type?: ReportEntityTypeQuery;
    city_id?: string;
    periodo?: string;
  }): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      const response = await this.getFilterOptions({
        estado: filters.estado,
        municipio: filters.municipio,
        escola: filters.escola,
        ...(filters.report_entity_type ? { report_entity_type: filters.report_entity_type } : {}),
        ...(filters.city_id ? { city_id: filters.city_id } : {}),
        ...(filters.periodo?.trim() ? { periodo: filters.periodo } : {}),
      });
      return response.series || [];
    } catch (error) {
      console.error('Erro ao buscar séries para filtros:', error);
      return [];
    }
  }

  // ✅ REFATORADO: Buscar turmas usando rota unificada
  static async getFilterClasses(filters: {
    estado: string;
    municipio?: string;
    escola?: string;
    serie?: string;
    report_entity_type?: ReportEntityTypeQuery;
    city_id?: string;
    periodo?: string;
  }): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      const response = await this.getFilterOptions({
        estado: filters.estado,
        municipio: filters.municipio,
        escola: filters.escola,
        serie: filters.serie,
        ...(filters.report_entity_type ? { report_entity_type: filters.report_entity_type } : {}),
        ...(filters.city_id ? { city_id: filters.city_id } : {}),
        ...(filters.periodo?.trim() ? { periodo: filters.periodo } : {}),
      });
      return response.turmas || [];
    } catch (error) {
      console.error('Erro ao buscar turmas para filtros:', error);
      return [];
    }
  }

  /** Filtra avaliações/gabaritos retornados por `opcoes-filtros` conforme o tipo de relatório. */
  private static filterEvaluationsFromOptions(
    avaliacoes: Array<{ id: string; titulo: string; disciplina?: string; disciplinas?: string[]; type?: unknown; tipo?: unknown; title?: unknown }>,
    reportEntityType?: ReportEntityTypeQuery
  ): Array<{ id: string; titulo: string; disciplina?: string; disciplinas?: string[] }> {
    if (reportEntityType === REPORT_ENTITY_TYPE_ANSWER_SHEET) {
      return avaliacoes;
    }

    return avaliacoes.filter((evaluation) => {
      const raw = (evaluation.type ?? evaluation.tipo ?? '').toString().trim();
      const type = raw.toUpperCase();
      const title = String(evaluation.titulo ?? evaluation.title ?? '').toUpperCase();
      const titleNormalized = title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (type === 'OLIMPIADAS' || type === 'OLIMPIADA' || type.includes('OLIMPI')) return false;
      if (type === 'COMPETICAO' || type === 'COMPETIÇÃO' || type.includes('COMPET')) return false;
      if (title.includes('OLIMPI') || title.includes('OLÍMPIC')) return false;
      if (
        titleNormalized.includes('GABARITO') ||
        titleNormalized.includes('CARTAO') ||
        titleNormalized.includes('CARTAO RESPOSTA')
      ) {
        return false;
      }
      if (type !== '') {
        return type === 'AVALIACAO' || type === 'SIMULADO';
      }
      return true;
    });
  }

  // ✅ REFATORADO: Buscar avaliações usando rota unificada
  static async getFilterEvaluations(filters: {
    estado: string;
    municipio: string;
    escola?: string;
    report_entity_type?: ReportEntityTypeQuery;
    city_id?: string;
    periodo?: string;
    serie_filtro?: string;
    nome?: string;
  }): Promise<Array<{
    id: string;
    titulo: string;
    disciplina?: string;
    disciplinas?: string[];
  }>> {
    try {
      const response = await this.getFilterOptions({
        estado: filters.estado,
        municipio: filters.municipio,
        escola: filters.escola,
        ...(filters.report_entity_type ? { report_entity_type: filters.report_entity_type } : {}),
        ...(filters.city_id ? { city_id: filters.city_id } : {}),
        ...(filters.periodo?.trim() ? { periodo: filters.periodo } : {}),
        ...(filters.serie_filtro && filters.serie_filtro !== 'all' ? { serie_filtro: filters.serie_filtro } : {}),
        ...(filters.nome?.trim() ? { nome: filters.nome.trim() } : {}),
      });
      return this.filterEvaluationsFromOptions(response.avaliacoes || [], filters.report_entity_type);
    } catch (error) {
      console.error('Erro ao buscar avaliações para filtros:', error);
      return [];
    }
  }

  static async getFilterEvaluationsWithSeries(filters: {
    estado: string;
    municipio: string;
    escola?: string;
    report_entity_type?: ReportEntityTypeQuery;
    city_id?: string;
    periodo?: string;
    serie_filtro?: string;
    nome?: string;
  }): Promise<{
    evaluations: Array<{ id: string; titulo: string; disciplina?: string; disciplinas?: string[] }>;
    seriesDisponiveis: Array<{ id: string; nome: string }>;
  }> {
    try {
      const response = await this.getFilterOptions({
        estado: filters.estado,
        municipio: filters.municipio,
        escola: filters.escola,
        ...(filters.report_entity_type ? { report_entity_type: filters.report_entity_type } : {}),
        ...(filters.city_id ? { city_id: filters.city_id } : {}),
        ...(filters.periodo?.trim() ? { periodo: filters.periodo } : {}),
        ...(filters.serie_filtro && filters.serie_filtro !== 'all' ? { serie_filtro: filters.serie_filtro } : {}),
        ...(filters.nome?.trim() ? { nome: filters.nome.trim() } : {}),
      });
      return {
        evaluations: this.filterEvaluationsFromOptions(response.avaliacoes || [], filters.report_entity_type),
        seriesDisponiveis: response.series_disponiveis ?? [],
      };
    } catch {
      return { evaluations: [], seriesDisponiveis: [] };
    }
  }

  // ✅ REFATORADO: Buscar escolas usando rota unificada
  static async getFilterSchoolsByEvaluation(filters: {
    estado: string;
    municipio: string;
    avaliacao: string;
    report_entity_type?: ReportEntityTypeQuery;
    city_id?: string;
    periodo?: string;
  }): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      const response = await this.getFilterOptions({
        estado: filters.estado,
        municipio: filters.municipio,
        avaliacao: filters.avaliacao,
        ...(filters.report_entity_type ? { report_entity_type: filters.report_entity_type } : {}),
        ...(filters.city_id ? { city_id: filters.city_id } : {}),
        ...(filters.periodo?.trim() ? { periodo: filters.periodo } : {}),
      });
      return response.escolas || [];
    } catch (error) {
      console.error('Erro ao buscar escolas por avaliação:', error);
      return [];
    }
  }

  // ✅ REFATORADO: Buscar séries usando rota unificada
  static async getFilterGradesByEvaluation(filters: {
    estado: string;
    municipio: string;
    avaliacao: string;
    escola: string;
    report_entity_type?: ReportEntityTypeQuery;
    city_id?: string;
    periodo?: string;
  }): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      const response = await this.getFilterOptions({
        estado: filters.estado,
        municipio: filters.municipio,
        avaliacao: filters.avaliacao,
        escola: filters.escola,
        ...(filters.report_entity_type ? { report_entity_type: filters.report_entity_type } : {}),
        ...(filters.city_id ? { city_id: filters.city_id } : {}),
        ...(filters.periodo?.trim() ? { periodo: filters.periodo } : {}),
      });
      return response.series || [];
    } catch (error) {
      console.error('Erro ao buscar séries por avaliação:', error);
      return [];
    }
  }

  // ✅ REFATORADO: Buscar turmas usando rota unificada
  static async getFilterClassesByEvaluation(filters: {
    estado: string;
    municipio: string;
    avaliacao: string;
    escola: string;
    serie: string;
    report_entity_type?: ReportEntityTypeQuery;
    city_id?: string;
    periodo?: string;
  }): Promise<Array<{
    id: string;
    nome: string;
  }>> {
    try {
      const response = await this.getFilterOptions({
        estado: filters.estado,
        municipio: filters.municipio,
        avaliacao: filters.avaliacao,
        escola: filters.escola,
        serie: filters.serie,
        ...(filters.report_entity_type ? { report_entity_type: filters.report_entity_type } : {}),
        ...(filters.city_id ? { city_id: filters.city_id } : {}),
        ...(filters.periodo?.trim() ? { periodo: filters.periodo } : {}),
      });
      return response.turmas || [];
    } catch (error) {
      console.error('Erro ao buscar turmas por avaliação:', error);
      return [];
    }
  }

  // ✅ NOVO: Buscar todas as opções de filtros de uma vez (rota principal)
  // REMOVIDO: método antigo duplicado getAllFilterOptions (use a versão otimizada no final do arquivo)

  // ✅ NOVO: Buscar relatório detalhado filtrado (endpoint otimizado)
  static async getDetailedReportFiltered(
    evaluationId: string, 
    fields: string[] = ['alunos', 'nota', 'proficiencia', 'classificacao'],
    orderBy: string = 'proficiencia',
    orderDirection: 'asc' | 'desc' = 'desc'
  ): Promise<{
    alunos: Array<{
      id: string;
      nome: string;
      turma: string;
      nota: number;
      proficiencia: number;
      classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
      status: 'concluida' | 'pendente';
    }>;
    total: number;
    paginacao: {
      page: number;
      per_page: number;
      total: number;
      total_pages: number;
    };
  } | null> {
    try {
      // Validar parâmetros antes de fazer a requisição
      if (!evaluationId || evaluationId === 'all') {
        console.warn('⚠️ ID de avaliação inválido para relatório filtrado:', evaluationId);
        return null;
      }

      // Mapear campos para garantir compatibilidade com a API
      const fieldMapping: Record<string, string> = {
        'nivel': 'classificacao', // Mapear nivel para classificacao se necessário
        'classificacao': 'classificacao',
        'alunos': 'alunos',
        'nota': 'nota',
        'proficiencia': 'proficiencia',
        'turma': 'turma',
        'status': 'status'
      };

      const validFields = fields.map(field => fieldMapping[field] || field)
                                .filter(field => Object.values(fieldMapping).includes(field));
      
      if (validFields.length === 0) {
        console.warn('⚠️ Nenhum campo válido fornecido para relatório filtrado');
        return null;
      }

      const params = new URLSearchParams({
        fields: validFields.join(','),
        order_by: orderBy,
        order_direction: orderDirection
      });


      const response = await api.get(`/evaluation-results/relatorio-detalhado-filtrado/${evaluationId}?${params}`);
      
      
      // Normalizar a resposta para garantir compatibilidade
      if (response.data && response.data.alunos) {
        interface AlunoItem {
          classificacao?: string;
          nivel?: string;
          [key: string]: unknown;
        }
        const normalizedData = {
          ...response.data,
          alunos: (response.data.alunos as AlunoItem[]).map((aluno: AlunoItem) => ({
            ...aluno,
            // Garantir que classificacao seja usado ao invés de nivel
            classificacao: aluno.classificacao || aluno.nivel || 'Abaixo do Básico'
          }))
        };
        return normalizedData;
      }
      
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao buscar relatório detalhado filtrado:', error);
      // Adicionar mais detalhes do erro para debugging
      if (error instanceof Error && 'response' in error) {
        interface AxiosErrorType {
          response?: { status?: number; data?: unknown };
          message?: string;
        }
        const axiosError = error as AxiosErrorType;
        console.error('❌ Status do erro:', axiosError.response?.status);
        console.error('❌ Dados do erro:', axiosError.response?.data);
        console.error('❌ Mensagem do erro:', axiosError.message);
      }
      return null;
    }
  }

  // ✅ NOVO: Buscar ranking otimizado de alunos por proficiência
  static async getRankingByProficiency(
    evaluationId: string,
    options: {
      limit?: number;
      includeAbsent?: boolean;
      schoolId?: string;
      classId?: string;
    } = {}
  ): Promise<{
    ranked: Array<{
      position: number;
      id: string;
      nome: string;
      turma: string;
      nota: number;
      proficiencia: number;
      classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
      status: 'concluida' | 'pendente';
    }>;
    absent: Array<{
      id: string;
      nome: string;
      turma: string;
      status: 'pendente';
    }>;
    total: number;
  } | null> {
    try {
      const params = new URLSearchParams({
        fields: 'alunos,nota,proficiencia,classificacao,turma,status',
        order_by: 'proficiencia',
        order_direction: 'desc'
      });
      
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.schoolId) params.append('escola', options.schoolId);
      if (options.classId) params.append('turma', options.classId);
      
     
      
      // Tentar usar endpoint otimizado específico para ranking
      let response;
      try {
        response = await api.get(`/evaluation-results/relatorio-detalhado-filtrado/${evaluationId}/ranking?${params}`);
      } catch (rankingError) {
        // Fallback para endpoint filtrado normal
        response = await api.get(`/evaluation-results/relatorio-detalhado-filtrado/${evaluationId}?${params}`);
      }
      
      if (response.data && response.data.alunos) {
        interface StudentItem {
          status?: string;
          id?: string;
          nome?: string;
          turma?: string;
          nota?: number;
          proficiencia?: number;
          nivel?: string;
          classificacao?: string;
        }
        const students = response.data.alunos as StudentItem[];
        
        // Separar alunos que concluíram dos ausentes
        const completed = students.filter((s: StudentItem) => s.status === 'concluida');
        const absent = students.filter((s: StudentItem) => s.status !== 'concluida');
        
        // Adicionar posição no ranking para alunos que concluíram
        const rankedStudents = completed.map((student: StudentItem, index: number) => ({
          position: index + 1,
          id: student.id,
          nome: student.nome,
          turma: student.turma,
          nota: student.nota || 0,
          proficiencia: student.proficiencia || 0,
          classificacao: (student.nivel || student.classificacao || 'Abaixo do Básico') as 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado',
          status: 'concluida' as const
        }));
        
       
        
        return {
          ranked: rankedStudents,
          absent: absent.map((s: StudentItem) => ({
            id: s.id,
            nome: s.nome,
            turma: s.turma,
            status: 'pendente' as const
          })),
          total: students.length
        };
      }
      
      return null;
    } catch (error) {
      console.error('❌ Erro ao carregar ranking:', error);
      return null;
    }
  }

  // ✅ NOVO: Buscar dados específicos de uma avaliação (endpoint dedicado)
  static async getEvaluationSpecificData(
    evaluationId: string,
    options?: AvaliacaoResourceRequestOptions
  ): Promise<{
    avaliacao: {
      id: string;
      titulo: string;
      disciplina: string;
      data_aplicacao: string;
      status: string;
      total_questoes: number;
      total_alunos: number;
      alunos_participantes: number;
      alunos_ausentes: number;
      media_nota: number;
      media_proficiencia: number;
    };
    questoes: Array<{
      id: string;
      numero: number;
      texto: string;
      habilidade: string;
      codigo_habilidade: string;
      tipo: 'multipleChoice' | 'open' | 'trueFalse';
      dificuldade: 'Fácil' | 'Médio' | 'Difícil';
      porcentagem_acertos: number;
      porcentagem_erros: number;
    }>;
    alunos: Array<{
      id: string;
      nome: string;
      turma: string;
      nota: number;
      proficiencia: number;
      classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
      total_acertos: number;
      total_erros: number;
      total_em_branco: number;
      status: 'concluida' | 'pendente';
    }>;
  } | null> {
    try {
      const q = this.buildAvaliacaoResourceQuery(options);
      const response = await api.get(
        `/evaluation-results/avaliacoes/${evaluationId}${q}`,
        this.avaliacaoResourceAxiosConfig(options)
      );
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao buscar dados específicos da avaliação:', error);
      return null;
    }
  }

  // ✅ NOVO: Buscar estatísticas gerais da avaliação (rota /evaluation-results/avaliacao)
  static async getEvaluationGeneralStats(evaluationId: string): Promise<{
    estatisticas_gerais: {
      media_nota_geral: number;
      media_proficiencia_geral: number;
      total_alunos: number;
      alunos_participantes: number;
      alunos_ausentes: number;
      alunos_pendentes: number;
      distribuicao_classificacao_geral: {
        abaixo_do_basico: number;
        basico: number;
        adequado: number;
        avancado: number;
      };
      nome: string;
      tipo: string;
      estado: string;
      municipio: string;
      escola: string;
      serie: string | null;
      total_avaliacoes: number;
      total_escolas: number;
      total_series: number;
      total_turmas: number;
    };
    filtros_aplicados: Record<string, unknown>;
    nivel_granularidade: string;
    opcoes_proximos_filtros: Record<string, unknown>;
    ranking: Array<Record<string, unknown>>;
  } | null> {
    try {
     
    
      
      const response = await api.get(`/evaluation-results/avaliacao?avaliacao_id=${evaluationId}`);
      
    console.log(response.data); 
      
     
      
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas gerais da avaliação:', error);
      return null;
    }
  }

  // ✅ MIGRADO: Buscar estatísticas gerais usando nova API unificada
  static async getGeneralStats(filters?: {
    estado?: string;
    municipio?: string;
    escola?: string;
    serie?: string;
    turma?: string;
  }): Promise<{
    total_avaliacoes: number;
    total_alunos: number;
    alunos_participantes: number;
    alunos_ausentes: number;
    media_nota_geral: number;
    media_proficiencia_geral: number;
    distribuicao_classificacao: {
      abaixo_do_basico: number;
      basico: number;
      adequado: number;
      avancado: number;
    };
    top_disciplinas: Array<{
      disciplina: string;
      media_nota: number;
      media_proficiencia: number;
    }>;
  } | null> {
    try {
      
      // Usar nova API unificada para obter estatísticas
      if (filters?.estado && filters?.municipio) {
        const response = await this.getEvaluationsList(1, 100, {
          estado: filters.estado,
          municipio: filters.municipio,
          escola: filters.escola,
          serie: filters.serie,
          turma: filters.turma
        });
        
        if (response?.estatisticas_gerais) {
          
          // Converter formato da nova API para o formato esperado
          const stats = response.estatisticas_gerais;
          const resultadosPorDisciplina = response.resultados_por_disciplina || [];
          
          return {
            total_avaliacoes: stats.total_avaliacoes,
            total_alunos: stats.total_alunos,
            alunos_participantes: stats.alunos_participantes,
            alunos_ausentes: stats.alunos_ausentes,
            media_nota_geral: stats.media_nota_geral,
            media_proficiencia_geral: stats.media_proficiencia_geral,
            distribuicao_classificacao: {
              abaixo_do_basico: stats.distribuicao_classificacao_geral.abaixo_do_basico,
              basico: stats.distribuicao_classificacao_geral.basico,
              adequado: stats.distribuicao_classificacao_geral.adequado,
              avancado: stats.distribuicao_classificacao_geral.avancado
            },
            top_disciplinas: resultadosPorDisciplina.map(d => ({
              disciplina: d.disciplina,
              media_nota: d.media_nota,
              media_proficiencia: d.media_proficiencia
            }))
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas gerais:', error);
      return null;
    }
  }



  // ✅ NOVO: Buscar respostas detalhadas de um aluno
  static async getStudentDetailedAnswers(
    testId: string,
    studentId: string
  ): Promise<{
    student: {
      id: string;
      nome: string;
      turma: string;
      nota: number;
      proficiencia: number;
      classificacao: string;
    };
    answers: Array<{
      question_id: string;
      question_number: number;
      question_text: string;
      question_type: 'multipleChoice' | 'open' | 'trueFalse';
      question_value: number;
      student_answer: string;
      correct_answer: string;
      is_correct: boolean;
      score: number;
      time_spent: number;
      answered_at: string;
      feedback: string | null;
    }>;
    summary: {
      total_questions: number;
      answered_questions: number;
      correct_answers: number;
      total_score: number;
      max_possible_score: number;
      accuracy_percentage: number;
      time_spent_total: number;
    };
  } | null> {
    try {
      
      const response = await api.get(`/evaluation-results/${testId}/student/${studentId}/answers`);
      
      
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao buscar respostas detalhadas:', error);
      return null;
    }
  }

  // ✅ NOVO: Buscar todas as opções de filtros otimizadas
  static async getAllFilterOptions(
    baseFilters?: {
      estado?: string;
      municipio?: string;
      avaliacao?: string;
    }
  ): Promise<{
    estados: Array<{ id: string; nome: string }>;
    municipios: Array<{ id: string; nome: string; estado_id: string }>;
    avaliacoes: Array<{ 
      id: string; 
      titulo: string; 
      disciplina: string; 
      municipio_id: string;
      status: string;
    }>;
    escolas: Array<{ 
      id: string; 
      nome: string; 
      municipio_id: string; 
      avaliacoes: string[];
    }>;
    series: Array<{ 
      id: string; 
      nome: string; 
      escola_id: string;
    }>;
    turmas: Array<{ 
      id: string; 
      nome: string; 
      serie_id: string; 
      escola_id: string;
    }>;
    disciplinas: Array<{ 
      id: string; 
      nome: string; 
      avaliacoes: string[];
    }>;
  } | null> {
    try {
      const params = new URLSearchParams();
      if (baseFilters?.estado) params.append('estado', baseFilters.estado);
      if (baseFilters?.municipio) params.append('municipio', baseFilters.municipio);
      if (baseFilters?.avaliacao) params.append('avaliacao', baseFilters.avaliacao);
      
      
      const response = await api.get(`/evaluation-results/opcoes-filtros?${params}`);
      
      
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao buscar opções de filtros:', error);
      return null;
    }
  }

  // ✅ ATUALIZADO: Verificar status do relatório (não lança erro em HTTP 5xx para permitir retry)
  static async checkReportStatus(
    evaluationId: string,
    options?: {
      schoolId?: string;
      cityId?: string;
      reportEntityType?: ReportEntityTypeQuery;
      /** Query `city_id` quando admin filtra por escola (token sem cidade). */
      adminCityIdQuery?: string;
    }
  ): Promise<ReportStatus> {
    const params = new URLSearchParams();
    
    if (options?.schoolId) {
      params.append('school_id', options.schoolId);
    }
    // Query `city_id`: somente admin (demais perfis: tenant no JWT)
    if (options?.adminCityIdQuery) {
      params.append('city_id', options.adminCityIdQuery);
    }
    if (options?.reportEntityType) {
      params.append('report_entity_type', options.reportEntityType);
    }
    
    const url = `/reports/status/${evaluationId}${params.toString() ? `?${params.toString()}` : ''}`;
    const metaCity = options?.cityId || options?.adminCityIdQuery;
    const requestConfig = metaCity ? { meta: { cityId: metaCity } } : {};
    
    try {
      const response = await api.get(url, requestConfig);
      return response.data;
    } catch (error: unknown) {
      // ✅ Não lançar erro - deixar o polling continuar tentando
      // O método pollUntilReady vai tratar o erro e continuar
      const axiosError = error as { response?: { status?: number; data?: unknown }; message?: string };
      
      // Re-lançar o erro para que pollUntilReady possa tratá-lo
      throw error;
    }
  }

  // ✅ ATUALIZADO: Fazer polling até o relatório ficar pronto (com timeout adequado e tratamento de erros)
  static async pollUntilReady(
    evaluationId: string,
    options?: {
      schoolId?: string;
      cityId?: string;
      reportEntityType?: ReportEntityTypeQuery;
      adminCityIdQuery?: string;
    },
    maxAttempts: number = 120, // 10 minutos (120 * 5s = 600s)
    pollInterval: number = 5000 // 5 segundos
  ): Promise<RelatorioCompleto> {
    const startTime = Date.now();
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        // Verificar status do relatório
        const status = await this.checkReportStatus(evaluationId, options);
        
        // ✅ CONTINUAR enquanto status for "processing"
        if (status.status === 'processing') {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          console.log(`Relatório processando... (tentativa ${attempts + 1}/${maxAttempts}, ${elapsed}s decorridos)`);
          
          // Aguardar antes da próxima verificação
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          attempts++;
          continue;
        }
        
        // ✅ PARAR apenas quando status for "ready"
        if (status.status === 'ready') {
          console.log('Relatório pronto! Buscando dados completos...');
          
          // Relatório pronto - buscar dados completos
          const params = new URLSearchParams();
          if (options?.schoolId) {
            params.append('school_id', options.schoolId);
          }
          if (options?.adminCityIdQuery) {
            params.append('city_id', options.adminCityIdQuery);
          }
          if (options?.reportEntityType) {
            params.append('report_entity_type', options.reportEntityType);
          }
          
          const url = `/reports/dados-json/${evaluationId}${params.toString() ? `?${params.toString()}` : ''}`;
          const metaCityPoll = options?.cityId || options?.adminCityIdQuery;
          const response = await api.get(url, metaCityPoll ? { meta: { cityId: metaCityPoll } } : {});
          
          return response.data;
        }
        
        // Se status for 'not_found', lançar erro
        if (status.status === 'not_found') {
          throw new Error('Relatório não encontrado');
        }
        
        // Status desconhecido - continuar tentando
        console.warn(`Status desconhecido: ${status.status}, continuando polling...`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        attempts++;
        continue;
        
      } catch (error: unknown) {
        const axiosError = error as { response?: { status?: number }; message?: string };
        
        // ✅ NÃO PARAR em erros HTTP (exceto 404 que indica not_found)
        if (axiosError.response) {
          const httpStatus = axiosError.response.status;
          
          // 404 = not_found, pode parar
          if (httpStatus === 404) {
            throw new Error('Relatório não encontrado');
          }
          
          // Outros erros HTTP (500, 503, etc.) - continuar tentando
          console.warn(`HTTP ${httpStatus} ao verificar status, continuando polling... (tentativa ${attempts + 1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          attempts++;
          continue;
        }
        
        // Erro de rede ou outro erro - continuar tentando até timeout
        console.error('Erro ao verificar status:', error);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        attempts++;
        
        // Se for o último attempt, lançar erro de timeout
        if (attempts >= maxAttempts) {
          const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
          throw new Error(`Timeout: O relatório demorou mais de ${elapsedMinutes} minutos para processar. Tente novamente em alguns instantes.`);
        }
      }
    }
    
    // Timeout após todas as tentativas
    const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
    throw new Error(`Timeout: O relatório demorou mais de ${elapsedMinutes} minutos para processar. Tente novamente em alguns instantes.`);
  }

  // ✅ ATUALIZADO: Buscar relatório completo de uma avaliação com suporte a polling
  static async getRelatorioCompleto(
    evaluationId: string, 
    options?: {
      schoolId?: string;
      cityId?: string;
      reportEntityType?: ReportEntityTypeQuery;
      adminCityIdQuery?: string;
    }
  ): Promise<RelatorioCompleto> {
    try {
      const params = new URLSearchParams();
      
      // Adicionar parâmetros opcionais baseado no que foi fornecido
      if (options?.schoolId) {
        params.append('school_id', options.schoolId);
      }
      if (options?.adminCityIdQuery) {
        params.append('city_id', options.adminCityIdQuery);
      }
      if (options?.reportEntityType) {
        params.append('report_entity_type', options.reportEntityType);
      }
      
      const url = `/reports/dados-json/${evaluationId}${params.toString() ? `?${params.toString()}` : ''}`;
      const metaCityRel = options?.cityId || options?.adminCityIdQuery;
      const requestConfig = metaCityRel ? { meta: { cityId: metaCityRel } } : {};
      
      const response = await api.get(url, requestConfig);
      
      // ✅ NOVO: Verificar status HTTP
      if (response.status === 202) {
        // Relatório está sendo processado - fazer polling
        return await this.pollUntilReady(evaluationId, options);
      }
      
      // ✅ NOVO: Verificar campo status na resposta (caso HTTP 200 mas status processing)
      if (response.status === 200) {
        const data = response.data;
        
        // Se a resposta tiver campo status, verificar
        if (data && typeof data === 'object' && 'status' in data) {
          if (data.status === 'ready') {
            // Relatório pronto - retornar dados normalmente
            return data as RelatorioCompleto;
          } else if (data.status === 'processing') {
            // Relatório sendo processado - fazer polling
            return await this.pollUntilReady(evaluationId, options);
          }
        }
        
        // Se não tiver campo status, assumir que está pronto (compatibilidade com API antiga)
        return data as RelatorioCompleto;
      }
    
      // Fallback: retornar dados mesmo se status for diferente
      return response.data as RelatorioCompleto;
    } catch (error: unknown) {
      console.error('❌ LOG - Erro ao buscar relatório completo:');
      console.error('  - Tipo do erro:', typeof error);
      console.error('  - Mensagem do erro:', error);
      
      const axiosError = error as { response?: { status?: number; data?: unknown; headers?: unknown }; request?: unknown; message?: string };
      
      if (axiosError.response) {
        console.error('  - Status do erro:', axiosError.response.status);
        console.error('  - Dados do erro:', axiosError.response.data);
        console.error('  - Headers do erro:', axiosError.response.headers);
      } else if (axiosError.request) {
        console.error('  - Erro de requisição (sem resposta):', axiosError.request);
      } else {
        console.error('  - Erro de configuração:', axiosError.message);
      }
      
      throw error;
    }
  }

  // ✅ NOVO: Buscar tabela detalhada com dados de alunos por disciplina
  static async getTabelaDetalhada(
    evaluationId: string,
    options?: {
      state?: string;
      municipality?: string;
      school?: string;
      report_entity_type?: ReportEntityTypeQuery;
      city_id?: string;
    }
  ): Promise<{
    disciplinas: Array<{
      nome: string;
      alunos: Array<{
        id: string;
        nome: string;
        turma: string;
        serie: string;
        proficiencia: number;
      }>;
    }>;
    geral: {
      alunos: Array<{
        id: string;
        nome: string;
        turma: string;
        serie: string;
        proficiencia_geral: number;
      }>;
    };
  } | null> {
    try {
      const params = new URLSearchParams();
      
      // Estado e município são obrigatórios para o endpoint
      if (!options?.state || options.state === 'all') {
        console.error('❌ Estado é obrigatório para buscar tabela detalhada', { state: options?.state });
        return null;
      }
      
      if (!options?.municipality || options.municipality === 'all') {
        console.error('❌ Município é obrigatório para buscar tabela detalhada', { municipality: options?.municipality });
        return null;
      }
      
      console.log('📊 Parâmetros para getTabelaDetalhada:', { 
        evaluationId, 
        state: options.state, 
        stateType: typeof options.state,
        stateValue: options.state,
        municipality: options.municipality, 
        school: options.school 
      });
      
      // Garantir que o estado seja uma string válida
      const estadoValue = String(options.state || '').trim();
      if (!estadoValue || estadoValue === 'all') {
        console.error('❌ Estado inválido após conversão:', estadoValue);
        return null;
      }
      
      params.append('estado', estadoValue);
      params.append('municipio', options.municipality);
      params.append('avaliacao', evaluationId);
      
      if (options?.school && options.school !== 'all') {
        params.append('escola', options.school);
      }
      if (options?.report_entity_type) {
        params.append('report_entity_type', options.report_entity_type);
      }
      if (options?.city_id) {
        params.append('city_id', options.city_id);
      }
      
      const url = `/evaluation-results/avaliacoes?${params.toString()}`;
      console.log('📊 URL da requisição:', url);
      console.log('📊 Params.toString():', params.toString());
      console.log('📊 Params.get("estado"):', params.get('estado'));
      
      const requestConfig =
        options.municipality && options.municipality !== 'all'
          ? { meta: { cityId: options.municipality } }
          : {};
      const response = await api.get(url, requestConfig);
      
      console.log('📊 Resposta completa do endpoint avaliacoes:', response.data);
      console.log('📊 tabela_detalhada:', response.data.tabela_detalhada);
      
      const tabelaDetalhada = response.data.tabela_detalhada;
      
      if (!tabelaDetalhada) {
        console.warn('⚠️ tabela_detalhada não encontrada na resposta');
        return null;
      }
      
      // Verificar se a estrutura está correta
      if (!tabelaDetalhada.disciplinas || !Array.isArray(tabelaDetalhada.disciplinas)) {
        console.warn('⚠️ tabela_detalhada.disciplinas não é um array válido');
        return null;
      }
      
      return tabelaDetalhada;
    } catch (error) {
      console.error('❌ Erro ao buscar tabela detalhada:', error);
      if (error.response) {
        console.error('❌ Status:', error.response.status);
        console.error('❌ Data:', error.response.data);
      }
      return null;
    }
  }



  // ===== NOVOS ENDPOINTS DE DASHBOARD E ESTATÍSTICAS =====

  // ✅ NOVO: Métricas gerais do painel (total/ativas/concluídas, alunos, taxa média de conclusão)
  static async getDashboardStats(): Promise<{
    total_evaluations: number;
    active_evaluations: number;
    completed_evaluations: number;
    total_students: number;
    average_completion_rate: number;
    pending_evaluations: number;
    this_month_evaluations: number;
  } | null> {
    try {
     
      const response = await api.get('/dashboard/stats');
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao buscar métricas do dashboard:', error);
      return null;
    }
  }

  // ✅ NOVO: Estatísticas ampliadas do painel (contagens diversas para cards/gráficos)
  static async getComprehensiveDashboardStats(): Promise<{
    evaluations: {
      total: number;
      by_status: Record<string, number>;
      by_type: Record<string, number>;
      by_subject: Record<string, number>;
    };
    students: {
      total: number;
      active: number;
      by_grade: Record<string, number>;
    };
    schools: {
      total: number;
      with_evaluations: number;
      by_municipality: Record<string, number>;
    };
    performance: {
      average_score: number;
      average_proficiency: number;
      completion_rate: number;
    };
  } | null> {
    try {
      const response = await api.get('/dashboard/comprehensive-stats');
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas ampliadas:', error);
      return null;
    }
  }

  // ✅ NOVO: Lista de avaliações com agregados (útil para tabelas/gráficos de ranking/andamento)
  static async getEvaluationsListWithAggregates(
    page: number = 1,
    perPage: number = 10,
    filters?: {
      status?: string;
      subject?: string;
      municipality?: string;
      school?: string;
    }
  ): Promise<{
    data: Array<{
      id: string;
      titulo: string;
      disciplina: string;
      municipio: string;
      escola: string;
      status: string;
      total_alunos: number;
      alunos_concluidos: number;
      media_nota: number;
      ultima_atualizacao: string;
      progress_percentage: number;
    }>;
    pagination: {
      current_page: number;
      per_page: number;
      total: number;
      total_pages: number;
    };
  } | null> {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString(),
      });

      if (filters?.status) params.append('status', filters.status);
      if (filters?.subject) params.append('subject', filters.subject);
      if (filters?.municipality) params.append('municipality', filters.municipality);
      if (filters?.school) params.append('school', filters.school);

      const response = await api.get(`/evaluation-results/list?${params}`);
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao buscar lista de avaliações:', error);
      return null;
    }
  }

  // ✅ NOVO: Estatísticas de uma avaliação específica
  static async getEvaluationSpecificStats(
    evaluationId: string,
    options?: AvaliacaoResourceRequestOptions
  ): Promise<{
    id: string;
    titulo: string;
    disciplina: string;
    total_alunos: number;
    alunos_participantes: number;
    alunos_ausentes: number;
    media_nota: number;
    media_proficiencia: number;
    distribuicao_classificacao: {
      abaixo_do_basico: number;
      basico: number;
      adequado: number;
      avancado: number;
    };
    tempo_medio_execucao: number;
    taxa_conclusao: number;
  } | null> {
    try {
      const q = this.buildAvaliacaoResourceQuery(options);
      const response = await api.get(
        `/evaluation-results/avaliacoes/${evaluationId}${q}`,
        this.avaliacaoResourceAxiosConfig(options)
      );
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas específicas:', error);
      return null;
    }
  }

  // ✅ NOVO: Contagem e porcentagem por status das avaliações (para gráfico de pizza/donut)
  static async getEvaluationStatusStats(): Promise<{
    total_evaluations: number;
    by_status: Array<{
      status: string;
      count: number;
      percentage: number;
      label: string;
    }>;
    last_updated: string;
  } | null> {
    try {
      const response = await api.get('/evaluation-results/avaliacoes/estatisticas-status');
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas de status:', error);
      return null;
    }
  }

  // ✅ MIGRADO: Estatísticas globais dos resultados (usando nova API quando possível)
  static async getGlobalResultsStats(): Promise<{
    total_avaliacoes_concluidas: number;
    total_avaliacoes_pendentes: number;
    media_nota_global: number;
    total_alunos: number;
    tempo_medio_execucao: number;
    disciplina_melhor_desempenho: {
      nome: string;
      media_nota: number;
      media_proficiencia: number;
    };
  } | null> {
    try {
      
      // Tentar usar nova API unificada primeiro
      try {
        // Fazer uma chamada ampla para obter estatísticas globais
        const unifiedResponse = await this.getEvaluationsList(1, 1, {});
        
        if (unifiedResponse?.estatisticas_gerais) {
          
          const stats = unifiedResponse.estatisticas_gerais;
          const disciplinas =
            (stats.por_disciplina && stats.por_disciplina.length > 0
              ? stats.por_disciplina
              : unifiedResponse.resultados_por_disciplina) ?? [];
          
          if (disciplinas.length === 0) {
            return null;
          }
          
          // Encontrar disciplina com melhor desempenho
          const melhorDisciplina = disciplinas.reduce((melhor, atual) => 
            atual.media_nota > melhor.media_nota ? atual : melhor
          , disciplinas[0]);
          
          return {
            total_avaliacoes_concluidas: stats.total_avaliacoes,
            total_avaliacoes_pendentes: 0, // Nova API não diferencia pendentes
            media_nota_global: stats.media_nota_geral,
            total_alunos: stats.total_alunos,
            tempo_medio_execucao: 0, // Não disponível na nova API
            disciplina_melhor_desempenho: {
              nome: melhorDisciplina.disciplina,
              media_nota: melhorDisciplina.media_nota,
              media_proficiencia: melhorDisciplina.media_proficiencia
            }
          };
        }
      } catch (unifiedError) {
        console.log('ℹ️ Nova API não disponível:', unifiedError);
      }
      
      return null;
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas globais:', error);
      return null;
    }
  }

  // ===== ENDPOINTS ESPECÍFICOS DE AVALIAÇÕES =====

  // ✅ NOVO: Verificar status de todas as avaliações
  static async verificarTodasAvaliacoes(filters?: {
    municipio?: string;
    escola?: string;
    status?: string;
  }): Promise<{
    total_verificadas: number;
    avaliacoes_atualizadas: number;
    avaliacoes_com_erro: number;
    detalhes: Array<{
      avaliacao_id: string;
      titulo: string;
      status_anterior: string;
      status_atual: string;
      atualizada: boolean;
      erro?: string;
    }>;
  } | null> {
    try {
      
      const body: Record<string, string> = {};
      if (filters?.municipio) body.municipio = filters.municipio;
      if (filters?.escola) body.escola = filters.escola;
      if (filters?.status) body.status = filters.status;
      
      const response = await api.post('/evaluation-results/avaliacoes/verificar-todas', body);
      
      
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao verificar todas as avaliações:', error);
      return null;
    }
  }

  // ✅ ORGANIZANDO: Métodos específicos por avaliação individual

  // GET /evaluation-results/avaliacoes/<evaluation_id> (já implementado como getEvaluationSpecificStats)
  
  // POST /evaluation-results/avaliacoes/calcular (já implementado como calculateEvaluationResults)
  
  // PATCH /evaluation-results/avaliacoes/<test_id>/finalizar (já implementado como finalizeEvaluation)
  
  // POST /evaluation-results/avaliacoes/<test_id>/verificar-status (já implementado como checkEvaluationStatus)
  
  // GET /evaluation-results/avaliacoes/<test_id>/status-resumo (já implementado como getEvaluationStatusSummary)
  
  // GET /evaluation-results/avaliacoes/estatisticas-status (já implementado como getEvaluationStatusStats)
} 