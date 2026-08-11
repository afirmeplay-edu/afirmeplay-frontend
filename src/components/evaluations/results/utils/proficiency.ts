/**
 * Utilitários de Proficiência para Resultados de Avaliação
 * 
 * ✅ IMPORTANTE: Estes utilitários apenas exibem dados já calculados pela API
 * NÃO fazem cálculos locais - todos os cálculos vêm do backend
 * 
 * As fórmulas e configurações estão documentadas para referência,
 * mas os valores reais são sempre obtidos da API
 */

// ===== TIPOS =====

export type ProficiencyLevel = 'abaixo_do_basico' | 'basico' | 'adequado' | 'avancado';

export interface ProficiencyTable {
  abaixo_do_basico: { min: number; max: number };
  basico: { min: number; max: number };
  adequado: { min: number; max: number };
  avancado: { min: number; max: number };
}

export interface ProficiencyTableInfo {
  table: ProficiencyTable;
  maxProficiency: number;
  description: string;
}

// ===== CONFIGURAÇÕES DE REFERÊNCIA (Documentação) =====

/**
 * Configurações de proficiência máxima por nível educacional e disciplina
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

/**
 * Tabelas de classificação por nível educacional e disciplina
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
  // Limites .99 alinhados ao EvaluationCalculator (evita buraco 224 < p < 225).
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

// ===== UTILITÁRIOS DE EXIBIÇÃO =====

/**
 * Obtém informações da tabela de proficiência baseada no contexto
 * ⚠️ RETORNA APENAS REFERÊNCIA - Os valores reais vêm da API
 * @param grade - Série/nível educacional
 * @param subject - Disciplina
 * @param course - Curso (opcional)
 */
export const getProficiencyTableInfo = (
  grade?: string, 
  subject?: string, 
  course?: string
): ProficiencyTableInfo => {
  // Determina se é anos iniciais ou finais baseado na série
  const isAnosIniciais = grade && (
    grade.includes('1º') || 
    grade.includes('2º') || 
    grade.includes('3º') || 
    grade.includes('4º') || 
    grade.includes('5º') ||
    grade.toLowerCase().includes('inicial')
  );

  // Determina se é matemática
  const isMatematica = subject && (
    subject.toLowerCase().includes('matemática') ||
    subject.toLowerCase().includes('matematica') ||
    subject.toLowerCase().includes('math')
  );

  if (isAnosIniciais) {
    if (isMatematica) {
      return {
        table: PROFICIENCY_TABLES.ANOS_INICIAIS_MATEMATICA,
        maxProficiency: PROFICIENCY_MAX_VALUES.ANOS_INICIAIS_MATEMATICA,
        description: 'Anos Iniciais - Matemática'
      };
    } else {
      return {
        table: PROFICIENCY_TABLES.ANOS_INICIAIS_OUTRAS,
        maxProficiency: PROFICIENCY_MAX_VALUES.ANOS_INICIAIS_OUTRAS,
        description: 'Anos Iniciais - Outras Disciplinas'
      };
    }
  } else {
    // Anos Finais e Ensino Médio
    return {
      table: PROFICIENCY_TABLES.ANOS_FINAIS_TODAS,
      maxProficiency: isMatematica 
        ? PROFICIENCY_MAX_VALUES.ANOS_FINAIS_MATEMATICA 
        : PROFICIENCY_MAX_VALUES.ANOS_FINAIS_OUTRAS,
      description: 'Anos Finais/Ensino Médio'
    };
  }
};

/**
 * Obtém o nível de proficiência baseado no valor já calculado pela API
 * ⚠️ FUNÇÃO DE REFERÊNCIA - O nível real já vem calculado da API
 * @param proficiency - Proficiência já calculada pela API
 * @param grade - Série/nível educacional
 * @param subject - Disciplina
 */
export const getProficiencyLevel = (
  proficiency: number, 
  grade?: string, 
  subject?: string
): ProficiencyLevel => {
  if (proficiency === null || proficiency === undefined || isNaN(proficiency)) {
    return 'abaixo_do_basico';
  }

  const tableInfo = getProficiencyTableInfo(grade, subject);
  const table = tableInfo.table;
  
  if (proficiency <= table.abaixo_do_basico.max) return 'abaixo_do_basico';
  if (proficiency <= table.basico.max) return 'basico';
  if (proficiency <= table.adequado.max) return 'adequado';
  return 'avancado';
};

/**
 * Obtém a cor da classificação para exibição
 * @param level - Nível de proficiência já calculado pela API
 */
export const getProficiencyLevelColor = (level: ProficiencyLevel): string => {
  const colors = {
    abaixo_do_basico: 'text-red-600 bg-red-100 border-red-300',
    basico: 'text-yellow-600 bg-yellow-100 border-yellow-300',
    adequado: 'text-blue-600 bg-blue-100 border-blue-300',
    avancado: 'text-green-600 bg-green-100 border-green-300'
  };
  
  return colors[level] || colors.abaixo_do_basico;
};

/**
 * Obtém o label da classificação para exibição
 * @param level - Nível de proficiência já calculado pela API
 */
export const getProficiencyLevelLabel = (level: ProficiencyLevel): string => {
  const labels = {
    abaixo_do_basico: 'Abaixo do Básico',
    basico: 'Básico',
    adequado: 'Adequado',
    avancado: 'Avançado'
  };
  
  return labels[level] || 'Desconhecido';
};

/**
 * Obtém a descrição detalhada do nível de proficiência
 * @param level - Nível de proficiência já calculado pela API
 */
export const getProficiencyLevelDescription = (level: ProficiencyLevel): string => {
  const descriptions = {
    abaixo_do_basico: 'O aluno demonstra dificuldades significativas nos conhecimentos e habilidades esperados para o nível.',
    basico: 'O aluno demonstra conhecimentos e habilidades básicos, mas ainda precisa de desenvolvimento.',
    adequado: 'O aluno demonstra conhecimentos e habilidades adequados para o nível esperado.',
    avancado: 'O aluno demonstra conhecimentos e habilidades acima do esperado para o nível.'
  };
  
  return descriptions[level] || 'Descrição não disponível.';
};

/**
 * Obtém o ícone da classificação para exibição
 * @param level - Nível de proficiência já calculado pela API
 */
export const getProficiencyLevelIcon = (level: ProficiencyLevel): string => {
  const icons = {
    abaixo_do_basico: '⚠️',
    basico: '📚',
    adequado: '✅',
    avancado: '🏆'
  };
  
  return icons[level] || '❓';
};

/**
 * Valida se uma proficiência está dentro do range esperado
 * @param proficiency - Proficiência já calculada pela API
 * @param grade - Série/nível educacional
 * @param subject - Disciplina
 */
export const isValidProficiency = (
  proficiency: number, 
  grade?: string, 
  subject?: string
): boolean => {
  if (proficiency === null || proficiency === undefined || isNaN(proficiency)) {
    return false;
  }

  const tableInfo = getProficiencyTableInfo(grade, subject);
  const maxProficiency = tableInfo.maxProficiency;
  
  return proficiency >= 0 && proficiency <= maxProficiency;
};

/**
 * Obtém a porcentagem de proficiência em relação ao máximo
 * @param proficiency - Proficiência já calculada pela API
 * @param grade - Série/nível educacional
 * @param subject - Disciplina
 */
export const getProficiencyPercentage = (
  proficiency: number, 
  grade?: string, 
  subject?: string
): number => {
  if (proficiency === null || proficiency === undefined || isNaN(proficiency)) {
    return 0;
  }

  const tableInfo = getProficiencyTableInfo(grade, subject);
  const maxProficiency = tableInfo.maxProficiency;
  
  return (proficiency / maxProficiency) * 100;
};

/**
 * Obtém o range de proficiência para um nível específico
 * @param level - Nível de proficiência
 * @param grade - Série/nível educacional
 * @param subject - Disciplina
 */
export const getProficiencyRange = (
  level: ProficiencyLevel, 
  grade?: string, 
  subject?: string
): { min: number; max: number } => {
  const tableInfo = getProficiencyTableInfo(grade, subject);
  const table = tableInfo.table;
  
  return table[level] || { min: 0, max: 0 };
};

/**
 * Obtém a posição relativa da proficiência dentro do seu nível
 * @param proficiency - Proficiência já calculada pela API
 * @param grade - Série/nível educacional
 * @param subject - Disciplina
 */
export const getProficiencyPositionInLevel = (
  proficiency: number, 
  grade?: string, 
  subject?: string
): number => {
  if (proficiency === null || proficiency === undefined || isNaN(proficiency)) {
    return 0;
  }

  const level = getProficiencyLevel(proficiency, grade, subject);
  const range = getProficiencyRange(level, grade, subject);
  
  if (range.max === range.min) return 0;
  
  const position = (proficiency - range.min) / (range.max - range.min);
  return Math.max(0, Math.min(1, position));
};

/**
 * Obtém informações completas de proficiência para exibição
 * @param proficiency - Proficiência já calculada pela API
 * @param grade - Série/nível educacional
 * @param subject - Disciplina
 */
export const getProficiencyInfo = (
  proficiency: number, 
  grade?: string, 
  subject?: string
) => {
  if (proficiency === null || proficiency === undefined || isNaN(proficiency)) {
    return {
      level: 'abaixo_do_basico' as ProficiencyLevel,
      label: 'N/A',
      color: getProficiencyLevelColor('abaixo_do_basico'),
      description: 'Dados não disponíveis',
      icon: '❓',
      percentage: 0,
      isValid: false
    };
  }

  const level = getProficiencyLevel(proficiency, grade, subject);
  const tableInfo = getProficiencyTableInfo(grade, subject);
  
  return {
    level,
    label: getProficiencyLevelLabel(level),
    color: getProficiencyLevelColor(level),
    description: getProficiencyLevelDescription(level),
    icon: getProficiencyLevelIcon(level),
    percentage: getProficiencyPercentage(proficiency, grade, subject),
    maxProficiency: tableInfo.maxProficiency,
    isValid: isValidProficiency(proficiency, grade, subject),
    tableInfo: tableInfo.description
  };
};

// ===== UTILITÁRIOS DE COMPARAÇÃO =====

/**
 * Compara duas proficiências e retorna a diferença
 * @param proficiency1 - Primeira proficiência já calculada pela API
 * @param proficiency2 - Segunda proficiência já calculada pela API
 */
export const compareProficiencies = (proficiency1: number, proficiency2: number): {
  difference: number;
  percentageDifference: number;
  isHigher: boolean;
  isLower: boolean;
  isEqual: boolean;
} => {
  if (proficiency1 === null || proficiency1 === undefined || isNaN(proficiency1) ||
      proficiency2 === null || proficiency2 === undefined || isNaN(proficiency2)) {
    return {
      difference: 0,
      percentageDifference: 0,
      isHigher: false,
      isLower: false,
      isEqual: true
    };
  }

  const difference = proficiency1 - proficiency2;
  const percentageDifference = proficiency2 !== 0 ? (difference / proficiency2) * 100 : 0;

  return {
    difference,
    percentageDifference,
    isHigher: difference > 0,
    isLower: difference < 0,
    isEqual: difference === 0
  };
};

/**
 * Obtém a tendência de proficiência baseada em múltiplas medições
 * @param proficiencies - Array de proficiências já calculadas pela API
 */
export const getProficiencyTrend = (proficiencies: number[]): {
  trend: 'increasing' | 'decreasing' | 'stable' | 'unknown';
  averageChange: number;
  consistency: number;
} => {
  if (proficiencies.length < 2) {
    return {
      trend: 'unknown',
      averageChange: 0,
      consistency: 0
    };
  }

  const changes: number[] = [];
  for (let i = 1; i < proficiencies.length; i++) {
    const change = proficiencies[i] - proficiencies[i - 1];
    changes.push(change);
  }

  const averageChange = changes.reduce((sum, change) => sum + change, 0) / changes.length;
  
  // Calcula consistência baseada na variância
  const variance = changes.reduce((sum, change) => sum + Math.pow(change - averageChange, 2), 0) / changes.length;
  const consistency = Math.max(0, 100 - (Math.sqrt(variance) / Math.abs(averageChange || 1)) * 100);

  let trend: 'increasing' | 'decreasing' | 'stable' | 'unknown';
  if (Math.abs(averageChange) < 5) {
    trend = 'stable';
  } else if (averageChange > 0) {
    trend = 'increasing';
  } else {
    trend = 'decreasing';
  }

  return {
    trend,
    averageChange,
    consistency: Math.min(100, Math.max(0, consistency))
  };
};

 