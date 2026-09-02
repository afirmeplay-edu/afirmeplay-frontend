/**
 * Constantes do Sistema de Resultados de Avaliação
 * 
 * ✅ IMPORTANTE: Estas constantes são apenas para referência e configuração da UI
 * Os valores reais de cálculo vêm da API do backend
 */

// ===== CONSTANTES DE COMPLETUDE =====

/**
 * Thresholds padrão para validação de completude
 * ⚠️ REFERÊNCIA APENAS - Os valores reais vêm da API
 */
export const DEFAULT_COMPLETION_THRESHOLDS = {
  // Thresholds mínimos
  minimum_completion_percentage: 80, // 80% das questões respondidas
  minimum_quality_score: 70, // Score mínimo de qualidade
  minimum_answers_for_analysis: 10, // Mínimo de questões para análise
  
  // Thresholds de qualidade
  high_quality_threshold: 90, // 90% de qualidade
  medium_quality_threshold: 70, // 70% de qualidade
  suspicious_activity_threshold: 20, // 20% de atividade suspeita
  
  // Thresholds de tempo
  minimum_time_per_question: 10, // 10 segundos por questão
  maximum_time_per_question: 300, // 5 minutos por questão
  total_time_warning_threshold: 120, // 2 horas total
  
  // Configurações por contexto
  context_specific: {
    grade_adjustments: {
      '1º ano': 0.9, // Reduz threshold em 10% para 1º ano
      '2º ano': 0.95, // Reduz threshold em 5% para 2º ano
      '3º ano': 1.0, // Threshold normal
      '4º ano': 1.0,
      '5º ano': 1.0,
      '6º ano': 1.0,
      '7º ano': 1.0,
      '8º ano': 1.0,
      '9º ano': 1.0,
      '1º EM': 1.0,
      '2º EM': 1.0,
      '3º EM': 1.0
    },
    subject_adjustments: {
      'matemática': 0.95, // Reduz threshold em 5% para matemática
      'português': 1.0,
      'ciências': 1.0,
      'história': 1.0,
      'geografia': 1.0,
      'inglês': 1.0,
      'artes': 1.0,
      'educação física': 1.0
    },
    special_needs_adjustments: {
      'dislexia': 0.8, // Reduz threshold em 20% para alunos com dislexia
      'tdah': 0.85, // Reduz threshold em 15% para alunos com TDAH
      'autismo': 0.9, // Reduz threshold em 10% para alunos com autismo
      'deficiência_visual': 0.9,
      'deficiência_auditiva': 0.9,
      'deficiência_motora': 0.9
    }
  }
} as const;

// ===== CONSTANTES DE PROFICIÊNCIA =====

/**
 * Configurações de proficiência máxima por nível educacional
 * ⚠️ REFERÊNCIA APENAS - Os valores reais vêm da API
 */
export const PROFICIENCY_TABLES = {
  // Educação Infantil, Anos Iniciais, Educação Especial, EJA - Outras matérias
  ANOS_INICIAIS_OUTRAS: {
    abaixo_do_basico: { min: 0, max: 149 },
    basico: { min: 150, max: 199 },
    adequado: { min: 200, max: 249 },
    avancado: { min: 250, max: 350 }
  },
  
  // Educação Infantil, Anos Iniciais, Educação Especial, EJA - Matemática
  ANOS_INICIAIS_MATEMATICA: {
    abaixo_do_basico: { min: 0, max: 174.99 },
    basico: { min: 175, max: 224.99 },
    adequado: { min: 225, max: 274.99 },
    avancado: { min: 275, max: 375 }
  },
  
  // Anos Finais e Ensino Médio - Todas as matérias
  ANOS_FINAIS_TODAS: {
    abaixo_do_basico: { min: 0, max: 199 },
    basico: { min: 200, max: 274.99 },
    adequado: { min: 275, max: 324.99 },
    avancado: { min: 325, max: 400 }
  }
} as const;

/**
 * Valores máximos de proficiência por nível e disciplina
 * ⚠️ REFERÊNCIA APENAS - Os valores reais vêm da API
 */
export const PROFICIENCY_MAX_VALUES = {
  // Educação Infantil, Anos Iniciais, Educação Especial, EJA
  ANOS_INICIAIS_OUTRAS: 350,
  ANOS_INICIAIS_MATEMATICA: 375,
  
  // Anos Finais e Ensino Médio
  ANOS_FINAIS_OUTRAS: 400,
  ANOS_FINAIS_MATEMATICA: 425
} as const;

// ===== CONSTANTES DE CLASSIFICAÇÃO =====

/**
 * Níveis de classificação disponíveis
 */
export const CLASSIFICATION_LEVELS = [
  'abaixo_do_basico',
  'basico', 
  'adequado',
  'avancado'
] as const;

/**
 * Labels para os níveis de classificação
 */
export const CLASSIFICATION_LABELS = {
  abaixo_do_basico: 'Abaixo do Básico',
  basico: 'Básico',
  adequado: 'Adequado',
  avancado: 'Avançado'
} as const;

/**
 * Cores para os níveis de classificação
 */
export const CLASSIFICATION_COLORS = {
  abaixo_do_basico: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-300'
  },
  basico: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-300'
  },
  adequado: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-300'
  },
  avancado: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-300'
  }
} as const;

// ===== CONSTANTES DE STATUS =====

/**
 * Status de avaliação disponíveis
 */
export const EVALUATION_STATUS = {
  CONCLUIDA: 'concluida',
  EM_ANDAMENTO: 'em_andamento',
  PENDENTE: 'pendente',
  AGENDADA: 'agendada',
  CANCELADA: 'cancelada'
} as const;

/**
 * Labels para status de avaliação
 */
export const EVALUATION_STATUS_LABELS = {
  [EVALUATION_STATUS.CONCLUIDA]: 'Concluída',
  [EVALUATION_STATUS.EM_ANDAMENTO]: 'Em Andamento',
  [EVALUATION_STATUS.PENDENTE]: 'Pendente',
  [EVALUATION_STATUS.AGENDADA]: 'Agendada',
  [EVALUATION_STATUS.CANCELADA]: 'Cancelada'
} as const;

/**
 * Cores para status de avaliação
 */
export const EVALUATION_STATUS_COLORS = {
  [EVALUATION_STATUS.CONCLUIDA]: 'bg-green-100 text-green-800 border-green-300',
  [EVALUATION_STATUS.EM_ANDAMENTO]: 'bg-blue-100 text-blue-800 border-blue-300',
  [EVALUATION_STATUS.PENDENTE]: 'bg-gray-100 text-gray-800 border-gray-300',
  [EVALUATION_STATUS.AGENDADA]: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  [EVALUATION_STATUS.CANCELADA]: 'bg-red-100 text-red-800 border-red-300'
} as const;

// ===== CONSTANTES DE CONFIGURAÇÃO =====

/**
 * Configurações de paginação
 */
export const PAGINATION_CONFIG = {
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [5, 10, 20, 50, 100],
  MAX_PAGE_SIZE: 100
} as const;

/**
 * Configurações de cache
 */
export const CACHE_CONFIG = {
  DEFAULT_TTL: 5 * 60 * 1000, // 5 minutos
  LONG_TTL: 30 * 60 * 1000, // 30 minutos
  SHORT_TTL: 1 * 60 * 1000, // 1 minuto
  MAX_CACHE_SIZE: 100 // Máximo de 100 itens em cache
} as const;

/**
 * Configurações de refresh automático
 */
export const AUTO_REFRESH_CONFIG = {
  DEFAULT_INTERVAL: 30 * 1000, // 30 segundos
  MIN_INTERVAL: 10 * 1000, // 10 segundos
  MAX_INTERVAL: 5 * 60 * 1000, // 5 minutos
  ENABLED_BY_DEFAULT: false
} as const;

/**
 * Configurações de exportação
 */
export const EXPORT_CONFIG = {
  SUPPORTED_FORMATS: ['xlsx', 'csv', 'pdf'] as const,
  DEFAULT_FORMAT: 'xlsx' as const,
  MAX_ROWS_PER_EXPORT: 10000,
  FILENAME_PREFIX: 'resultados-avaliacao'
} as const;

// ===== CONSTANTES DE VALIDAÇÃO =====

/**
 * Configurações de validação de dados
 */
export const VALIDATION_CONFIG = {
  MIN_GRADE: 0,
  MAX_GRADE: 10,
  MIN_PROFICIENCY: 0,
  MAX_PROFICIENCY: 500, // Valor máximo teórico
  MIN_COMPLETION_RATE: 0,
  MAX_COMPLETION_RATE: 100,
  MIN_TIME_SPENT: 0,
  MAX_TIME_SPENT: 24 * 60 * 60 // 24 horas em segundos
} as const;

/**
 * Mensagens de erro padrão
 */
export const ERROR_MESSAGES = {
  INVALID_GRADE: 'Nota deve estar entre 0 e 10',
  INVALID_PROFICIENCY: 'Proficiência deve estar entre 0 e 500',
  INVALID_COMPLETION_RATE: 'Taxa de conclusão deve estar entre 0% e 100%',
  INVALID_TIME_SPENT: 'Tempo gasto deve ser positivo',
  DATA_NOT_FOUND: 'Dados não encontrados',
  NETWORK_ERROR: 'Erro de conexão com o servidor',
  UNAUTHORIZED: 'Acesso não autorizado',
  FORBIDDEN: 'Acesso negado',
  SERVER_ERROR: 'Erro interno do servidor',
  TIMEOUT_ERROR: 'Tempo limite excedido',
  // Mensagens específicas do fluxo de avaliações
  EVALUATION_NOT_FOUND: 'Avaliação não encontrada',
  EVALUATION_CREATE_FAILED: 'Erro ao criar avaliação. Tente novamente.',
  EVALUATION_UPDATE_FAILED: 'Erro ao atualizar avaliação. Tente novamente.',
  EVALUATION_DELETE_FAILED: 'Erro ao excluir avaliação. Tente novamente.',
  EVALUATION_APPLY_FAILED: 'Erro ao aplicar avaliação. Tente novamente.',
  EVALUATION_LOAD_FAILED: 'Erro ao carregar avaliação. Tente novamente.',
  EVALUATION_INVALID_DATA: 'Dados inválidos para a avaliação',
  INVALID_CLASSES_SCHOOLS: 'Algumas turmas não pertencem às escolas selecionadas',
  INVALID_QUESTIONS: 'Questões inválidas. Verifique se todas têm alternativas e resposta correta.',
  INVALID_DATES: 'Datas inválidas. Verifique se a data de término é posterior à data de início.',
  EVALUATION_START_FAILED: 'Erro ao iniciar avaliação. Tente novamente.',
  EVALUATION_RESULTS_NOT_AVAILABLE: 'Resultados ainda não disponíveis. Aguarde o processamento.',
  EVALUATION_ALREADY_COMPLETED: 'Esta avaliação já foi concluída.',
  EVALUATION_EXPIRED: 'Esta avaliação expirou.',
  EVALUATION_NOT_AVAILABLE: 'Avaliação não disponível no momento.',
  NOT_AVAILABLE_TO_MUNICIPALITY: 'Conteúdo ainda não disponível para o município',
  RETRY_FAILED: 'Não foi possível conectar após várias tentativas. Verifique sua conexão.',
  VALIDATION_REQUIRED_FIELD: 'Campo obrigatório não preenchido',
  VALIDATION_INVALID_FORMAT: 'Formato inválido',
  VALIDATION_MIN_LENGTH: 'Valor muito curto',
  VALIDATION_MAX_LENGTH: 'Valor muito longo'
} as const;

/**
 * Mensagens de sucesso padrão
 */
export const SUCCESS_MESSAGES = {
  DATA_LOADED: 'Dados carregados com sucesso',
  DATA_SAVED: 'Dados salvos com sucesso',
  DATA_UPDATED: 'Dados atualizados com sucesso',
  DATA_DELETED: 'Dados excluídos com sucesso',
  EXPORT_COMPLETED: 'Exportação concluída com sucesso',
  REFRESH_COMPLETED: 'Dados atualizados com sucesso',
  // Mensagens específicas do fluxo de avaliações
  EVALUATION_CREATED: 'Avaliação criada com sucesso!',
  EVALUATION_UPDATED: 'Avaliação atualizada com sucesso!',
  EVALUATION_DELETED: 'Avaliação excluída com sucesso!',
  EVALUATION_APPLIED: 'Avaliação aplicada com sucesso!',
  EVALUATION_STARTED: 'Avaliação iniciada com sucesso!',
  EVALUATION_COMPLETED: 'Avaliação concluída com sucesso!',
  EVALUATION_SAVED: 'Avaliação salva com sucesso!',
  QUESTIONS_SAVED: 'Questões salvas com sucesso!',
  CLASSES_UPDATED: 'Turmas atualizadas com sucesso!',
  INVALID_CLASSES_REMOVED: 'Turmas inválidas removidas automaticamente'
} as const;

// ===== CONSTANTES DE UI =====

/**
 * Configurações de loading
 */
export const LOADING_CONFIG = {
  MIN_LOADING_TIME: 500, // 500ms mínimo de loading
  SKELETON_ROWS: 5, // 5 linhas de skeleton por padrão
  SKELETON_CARDS: 4 // 4 cards de skeleton por padrão
} as const;

/**
 * Configurações de tooltip
 */
export const TOOLTIP_CONFIG = {
  DEFAULT_DELAY: 500, // 500ms de delay
  DEFAULT_DURATION: 3000 // 3 segundos de duração
} as const;

/**
 * Configurações de notificação
 */
export const NOTIFICATION_CONFIG = {
  DEFAULT_DURATION: 5000, // 5 segundos
  SUCCESS_DURATION: 3000, // 3 segundos para sucesso
  ERROR_DURATION: 8000, // 8 segundos para erro
  WARNING_DURATION: 5000, // 5 segundos para aviso
  INFO_DURATION: 4000 // 4 segundos para informação
} as const;

// ===== CONSTANTES DE PERFORMANCE =====

/**
 * Configurações de performance
 */
export const PERFORMANCE_CONFIG = {
  DEBOUNCE_DELAY: 300, // 300ms de debounce
  THROTTLE_DELAY: 100, // 100ms de throttle
  VIRTUALIZATION_THRESHOLD: 100, // Virtualizar listas com mais de 100 itens
  LAZY_LOADING_THRESHOLD: 50 // Lazy loading para mais de 50 itens
} as const;

// ===== CONSTANTES DE ACESSIBILIDADE =====

/**
 * Configurações de acessibilidade
 */
export const ACCESSIBILITY_CONFIG = {
  SKIP_LINK_TEXT: 'Pular para o conteúdo principal',
  LOADING_TEXT: 'Carregando...',
  ERROR_TEXT: 'Erro ao carregar dados',
  NO_DATA_TEXT: 'Nenhum dado encontrado',
  EXPAND_TEXT: 'Expandir',
  COLLAPSE_TEXT: 'Recolher',
  CLOSE_TEXT: 'Fechar',
  NEXT_TEXT: 'Próximo',
  PREVIOUS_TEXT: 'Anterior',
  FIRST_TEXT: 'Primeiro',
  LAST_TEXT: 'Último'
} as const;

 