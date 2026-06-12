import { ComparisonResponse, EvaluationInfo } from '@/services/evaluation/evaluationComparisonApi';
import { EvolutionData } from '@/components/evolution/EvolutionChart';
import { sortEvaluationsByOrder } from '@/utils/evolution/evaluationScopeLabels';

/**
 * Valida e limita variações percentuais extremas
 * Variações acima de 1000% ou abaixo de -1000% são provavelmente erros de cálculo
 */
function validateVariation(variation: number, _fromValue?: number, _toValue?: number, _context?: string): number {
  if (Math.abs(variation) > 1000) {
    return variation > 0 ? 1000 : -1000;
  }
  return variation;
}

export interface ProcessedEvolutionData {
  /** "Geral" por etapa (notas) */
  generalData: EvolutionData[];
  /** "Geral" por etapa (proficiência) */
  proficiencyData: EvolutionData[];
  /** "Classificação/Aprovação" geral */
  approvalData: EvolutionData[];
  /** por disciplina (notas) */
  subjectData: Record<string, EvolutionData[]>;
  /** por disciplina (proficiência) */
  subjectProficiencyData: Record<string, EvolutionData[]>;
  /** classificação por disciplina (opcional) */
  classificationData: Record<string, EvolutionData[]>;
  /** dados por nível de proficiência */
  levelsData: Record<string, EvolutionData[]>;
  /** nomes das avaliações para exibição */
  evaluationNames: string[];
  /** metadados completos (série, turmas, datas) */
  evaluations: EvaluationInfo[];
}

/**
 * Processa dados de comparação da API para formato dos gráficos
 */
export function processComparisonData(comparison: ComparisonResponse): ProcessedEvolutionData {
  const generalData = processGeneralComparison(comparison);
  const proficiencyData = processProficiencyComparison(comparison);
  const subjectData = processSubjectComparison(comparison);
  const subjectProficiencyData = processSubjectProficiencyComparison(comparison);
  const approvalData = processApprovalData(comparison);
  const classificationData = processClassificationData(comparison);
  const levelsData = processLevelsData(comparison);
  
  const evaluations = sortEvaluationsByOrder(comparison.evaluations ?? []);
  const evaluationNames = evaluations.map((evaluation) => evaluation.title);

  return {
    generalData,
    proficiencyData,
    subjectData,
    subjectProficiencyData,
    approvalData,
    classificationData,
    levelsData,
    evaluationNames,
    evaluations,
  };
}

/**
 * Processa dados gerais (média geral de todas as avaliações)
 */
function processGeneralComparison(comparison: ComparisonResponse): EvolutionData[] {
  if (!comparison.comparisons || comparison.comparisons.length === 0) {
    return [];
  }

  // Coletar todos os valores das avaliações
  const values: number[] = [];
  const variations: number[] = [];
  
  // Primeira comparação tem evaluation_1 e evaluation_2
  if (comparison.comparisons[0]) {
    const first = comparison.comparisons[0].general_comparison;
    if (first.average_grade) {
      values.push(first.average_grade.evaluation_1);
      values.push(first.average_grade.evaluation_2);
      variations.push(first.average_grade.evolution.percentage);
    }
  }
  
  // Comparações subsequentes só adicionam evaluation_2 (evita duplicatas)
  for (let i = 1; i < comparison.comparisons.length; i++) {
    const comp = comparison.comparisons[i].general_comparison;
    if (comp.average_grade) {
      values.push(comp.average_grade.evaluation_2);
      variations.push(comp.average_grade.evolution.percentage);
    }
  }

  // Criar UM único registro com todas as etapas dinamicamente
  const result: any = {
    name: "GERAL",
  };
  
  // Adicionar todas as etapas dinamicamente
  values.forEach((value, index) => {
    const etapaKey = `etapa${index + 1}`;
    result[etapaKey] = value;
  });
  
  // Adicionar todas as variações dinamicamente
  variations.forEach((variation, index) => {
    const variacaoKey = `variacao_${index + 1}_${index + 2}`;
    result[variacaoKey] = validateVariation(variation);
  });

  return [result];
}

/**
 * Processa dados de proficiência geral
 */
function processProficiencyComparison(comparison: ComparisonResponse): EvolutionData[] {
  if (!comparison.comparisons || comparison.comparisons.length === 0) {
    return [];
  }

  // NOVO: Coletar todos os valores de proficiência
  const values: number[] = [];
  const variations: number[] = [];
  
  // Primeira comparação tem evaluation_1 e evaluation_2
  if (comparison.comparisons[0]) {
    const first = comparison.comparisons[0].general_comparison;
    
    // Verificar se average_proficiency existe
    if (first.average_proficiency) {
      values.push(first.average_proficiency.evaluation_1);
      values.push(first.average_proficiency.evaluation_2);
      variations.push(first.average_proficiency.evolution.percentage);
    } else {
      // Se não há dados de proficiência, retornar array vazio
      return [];
    }
  }
  
  // Comparações subsequentes só adicionam evaluation_2 (evita duplicatas)
  for (let i = 1; i < comparison.comparisons.length; i++) {
    const comp = comparison.comparisons[i].general_comparison;
    if (comp.average_proficiency) {
      values.push(comp.average_proficiency.evaluation_2);
      variations.push(comp.average_proficiency.evolution.percentage);
    }
  }
  
  // Criar UM único registro com todas as etapas dinamicamente
  const result: any = {
    name: "PROFICIÊNCIA",
  };
  
  // Adicionar todas as etapas dinamicamente
  values.forEach((value, index) => {
    const etapaKey = `etapa${index + 1}`;
    result[etapaKey] = value;
  });
  
  // Adicionar todas as variações dinamicamente
  variations.forEach((variation, index) => {
    const variacaoKey = `variacao_${index + 1}_${index + 2}`;
    const validVariation = validateVariation(
      variation,
      values[index],
      values[index + 1],
      `proficiência etapa ${index + 1} → ${index + 2}`
    );
    result[variacaoKey] = validVariation;
  });
  
  return [result];
}

/**
 * Normaliza nome de disciplina para comparação
 */
function normalizeSubjectName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Processa dados por disciplina
 */
function processSubjectComparison(comparison: ComparisonResponse): { [subjectName: string]: EvolutionData[] } {
  if (!comparison.comparisons || comparison.comparisons.length === 0) {
    return {};
  }

  const subjectData: { [subjectName: string]: EvolutionData[] } = {};
  
  // Coletar todas as disciplinas de todas as comparações e normalizar
  const allSubjectsMap = new Map<string, string>(); // normalized -> original
  
  comparison.comparisons.forEach(comp => {
    Object.keys(comp.subject_comparison).forEach(subjectName => {
      const normalized = normalizeSubjectName(subjectName);
      if (!allSubjectsMap.has(normalized)) {
        allSubjectsMap.set(normalized, subjectName);
      }
    });
  });
  
  // Para cada disciplina normalizada, verificar se existe em todas as comparações
  allSubjectsMap.forEach((originalName, normalizedName) => {
    // Verificar se a disciplina existe em todas as comparações
    const existsInAll = comparison.comparisons.every(comp => {
      return Object.keys(comp.subject_comparison).some(name => 
        normalizeSubjectName(name) === normalizedName
      );
    });
    
    if (!existsInAll) {
      // Pular disciplinas que não existem em todas as comparações
      return;
    }
    
    const values: number[] = [];
    const variations: number[] = [];
    
    // Primeira comparação
    if (comparison.comparisons[0]) {
      // Encontrar a disciplina na primeira comparação (pode ter case diferente)
      const firstCompSubjectKey = Object.keys(comparison.comparisons[0].subject_comparison).find(
        name => normalizeSubjectName(name) === normalizedName
      );
      
      if (firstCompSubjectKey) {
        const subj = comparison.comparisons[0].subject_comparison[firstCompSubjectKey];
        if (subj && subj.average_grade) {
          values.push(subj.average_grade.evaluation_1);
          values.push(subj.average_grade.evaluation_2);
          variations.push(subj.average_grade.evolution.percentage);
        }
      }
    }
    
    // Comparações subsequentes
    for (let i = 1; i < comparison.comparisons.length; i++) {
      const compSubjectKey = Object.keys(comparison.comparisons[i].subject_comparison).find(
        name => normalizeSubjectName(name) === normalizedName
      );
      
      if (compSubjectKey) {
        const subj = comparison.comparisons[i].subject_comparison[compSubjectKey];
        if (subj && subj.average_grade) {
          values.push(subj.average_grade.evaluation_2);
          variations.push(subj.average_grade.evolution.percentage);
        }
      }
    }
    
    // Só adicionar se tiver valores válidos
    if (values.length > 0) {
      const result: any = {
        name: originalName.toUpperCase(),
      };
      
      // Adicionar todas as etapas dinamicamente
      values.forEach((value, index) => {
        const etapaKey = `etapa${index + 1}`;
        result[etapaKey] = value;
      });
      
      // Adicionar todas as variações dinamicamente
      variations.forEach((variation, index) => {
        const variacaoKey = `variacao_${index + 1}_${index + 2}`;
        const validVariation = validateVariation(
          variation,
          values[index],
          values[index + 1],
          `${originalName} etapa ${index + 1} → ${index + 2}`
        );
        result[variacaoKey] = validVariation;
      });
      
      subjectData[originalName] = [result];
    }
  });
  
  return subjectData;
}

/**
 * Processa dados de proficiência por disciplina
 */
function processSubjectProficiencyComparison(comparison: ComparisonResponse): { [subjectName: string]: EvolutionData[] } {
  if (!comparison.comparisons || comparison.comparisons.length === 0) {
    return {};
  }

  const subjectData: { [subjectName: string]: EvolutionData[] } = {};
  
  // Coletar todas as disciplinas de todas as comparações e normalizar
  const allSubjectsMap = new Map<string, string>(); // normalized -> original
  
  comparison.comparisons.forEach(comp => {
    Object.keys(comp.subject_comparison).forEach(subjectName => {
      const normalized = normalizeSubjectName(subjectName);
      if (!allSubjectsMap.has(normalized)) {
        allSubjectsMap.set(normalized, subjectName);
      }
    });
  });
  
  // Para cada disciplina normalizada, verificar se existe em todas as comparações
  allSubjectsMap.forEach((originalName, normalizedName) => {
    // Verificar se a disciplina existe em todas as comparações
    const existsInAll = comparison.comparisons.every(comp => {
      return Object.keys(comp.subject_comparison).some(name => 
        normalizeSubjectName(name) === normalizedName
      );
    });
    
    if (!existsInAll) {
      // Pular disciplinas que não existem em todas as comparações
      return;
    }
    
    const values: number[] = [];
    const variations: number[] = [];
    
    // Primeira comparação
    if (comparison.comparisons[0]) {
      // Encontrar a disciplina na primeira comparação (pode ter case diferente)
      const firstCompSubjectKey = Object.keys(comparison.comparisons[0].subject_comparison).find(
        name => normalizeSubjectName(name) === normalizedName
      );
      
      if (firstCompSubjectKey) {
        const subj = comparison.comparisons[0].subject_comparison[firstCompSubjectKey];
        if (subj && subj.average_proficiency) {
          values.push(subj.average_proficiency.evaluation_1);
          values.push(subj.average_proficiency.evaluation_2);
          variations.push(subj.average_proficiency.evolution.percentage);
        }
      }
    }
    
    // Comparações subsequentes
    for (let i = 1; i < comparison.comparisons.length; i++) {
      const compSubjectKey = Object.keys(comparison.comparisons[i].subject_comparison).find(
        name => normalizeSubjectName(name) === normalizedName
      );
      
      if (compSubjectKey) {
        const subj = comparison.comparisons[i].subject_comparison[compSubjectKey];
        if (subj && subj.average_proficiency) {
          values.push(subj.average_proficiency.evaluation_2);
          variations.push(subj.average_proficiency.evolution.percentage);
        }
      }
    }
    
    // Só adicionar se tiver valores válidos
    if (values.length > 0) {
      const result: any = {
        name: originalName.toUpperCase(),
      };
      
      // Adicionar todas as etapas dinamicamente
      values.forEach((value, index) => {
        const etapaKey = `etapa${index + 1}`;
        result[etapaKey] = value;
      });
      
      // Adicionar todas as variações dinamicamente
      variations.forEach((variation, index) => {
        const variacaoKey = `variacao_${index + 1}_${index + 2}`;
        const validVariation = validateVariation(
          variation,
          values[index],
          values[index + 1],
          `${originalName} etapa ${index + 1} → ${index + 2}`
        );
        result[variacaoKey] = validVariation;
      });
      
      subjectData[originalName] = [result];
    }
  });
  
  return subjectData;
}

// Função removida - não é usada e tinha bugs de cálculo
// Se necessário, o backend deve enviar participation_rate calculado

/**
 * Processa dados de aprovação - usa dados calculados do backend
 */
function processApprovalData(comparison: ComparisonResponse): EvolutionData[] {
  if (!comparison.comparisons || comparison.comparisons.length === 0) {
    return [];
  }

  // Verificar se o backend envia approval_rate
  if (!comparison.comparisons[0]?.general_comparison?.approval_rate) {
    // Se o backend não enviar, retornar vazio (não calcular no frontend)
    return [];
  }

  // Coletar todos os valores de aprovação do backend
  const values: number[] = [];
  const variations: number[] = [];
  
  // Primeira comparação tem evaluation_1 e evaluation_2
  if (comparison.comparisons[0]) {
    const approval = comparison.comparisons[0].general_comparison.approval_rate;
    values.push(approval.evaluation_1);
    values.push(approval.evaluation_2);
    variations.push(approval.evolution.percentage);
  }
  
  // Comparações subsequentes só adicionam evaluation_2 (evita duplicatas)
  for (let i = 1; i < comparison.comparisons.length; i++) {
    const approval = comparison.comparisons[i].general_comparison.approval_rate;
    if (approval) {
      values.push(approval.evaluation_2);
      variations.push(approval.evolution.percentage);
    }
  }
  
  // Criar UM único registro com todas as etapas dinamicamente
  const result: any = {
    name: "APROVAÇÃO",
  };
  
  // Adicionar todas as etapas dinamicamente
  values.forEach((value, index) => {
    const etapaKey = `etapa${index + 1}`;
    result[etapaKey] = value;
  });
  
  // Adicionar todas as variações dinamicamente (do backend)
  variations.forEach((variation, index) => {
    const variacaoKey = `variacao_${index + 1}_${index + 2}`;
    const validVariation = validateVariation(
      variation,
      values[index],
      values[index + 1],
      `aprovação etapa ${index + 1} → ${index + 2}`
    );
    result[variacaoKey] = validVariation;
  });
  
  return [result];
}

/**
 * Processa dados de classificação por disciplina - usa dados calculados do backend
 */
function processClassificationData(comparison: ComparisonResponse): { [subjectName: string]: EvolutionData[] } {
  if (!comparison.comparisons || comparison.comparisons.length === 0) {
    return {};
  }

  const classificationData: { [subjectName: string]: EvolutionData[] } = {};
  
  // Coletar todas as disciplinas de todas as comparações e normalizar
  const allSubjectsMap = new Map<string, string>(); // normalized -> original
  
  comparison.comparisons.forEach(comp => {
    Object.keys(comp.subject_comparison).forEach(subjectName => {
      const normalized = normalizeSubjectName(subjectName);
      if (!allSubjectsMap.has(normalized)) {
        allSubjectsMap.set(normalized, subjectName);
      }
    });
  });
  
  // Para cada disciplina normalizada, verificar se existe em todas as comparações
  allSubjectsMap.forEach((originalName, normalizedName) => {
    // Verificar se a disciplina existe em todas as comparações
    const existsInAll = comparison.comparisons.every(comp => {
      return Object.keys(comp.subject_comparison).some(name => 
        normalizeSubjectName(name) === normalizedName
      );
    });
    
    if (!existsInAll) {
      // Pular disciplinas que não existem em todas as comparações
      return;
    }
    
    // Verificar se o backend envia approval_rate para esta disciplina
    const firstCompSubjectKey = Object.keys(comparison.comparisons[0].subject_comparison).find(
      name => normalizeSubjectName(name) === normalizedName
    );
    
    if (!firstCompSubjectKey) {
      return;
    }
    
    const firstSubjectData = comparison.comparisons[0].subject_comparison[firstCompSubjectKey];
    if (!firstSubjectData?.approval_rate) {
      // Se o backend não enviar approval_rate, pular esta disciplina (não calcular no frontend)
      return;
    }
    
    const values: number[] = [];
    const variations: number[] = [];
    
    // Primeira comparação
    if (comparison.comparisons[0]) {
      const approval = firstSubjectData.approval_rate;
      values.push(approval.evaluation_1);
      values.push(approval.evaluation_2);
      variations.push(approval.evolution.percentage);
    }
    
    // Comparações subsequentes
    for (let i = 1; i < comparison.comparisons.length; i++) {
      const compSubjectKey = Object.keys(comparison.comparisons[i].subject_comparison).find(
        name => normalizeSubjectName(name) === normalizedName
      );
      
      if (compSubjectKey) {
        const subjectData = comparison.comparisons[i].subject_comparison[compSubjectKey];
        if (subjectData?.approval_rate) {
          values.push(subjectData.approval_rate.evaluation_2);
          variations.push(subjectData.approval_rate.evolution.percentage);
        }
      }
    }
    
    // Só adicionar se tiver valores válidos
    if (values.length > 0) {
      const result: any = {
        name: originalName.toUpperCase(),
      };
      
      // Adicionar todas as etapas dinamicamente
      values.forEach((value, index) => {
        const etapaKey = `etapa${index + 1}`;
        result[etapaKey] = value;
      });
      
      // Adicionar todas as variações dinamicamente (do backend)
      variations.forEach((variation, index) => {
        const variacaoKey = `variacao_${index + 1}_${index + 2}`;
        const validVariation = validateVariation(
          variation,
          values[index],
          values[index + 1],
          `${originalName} etapa ${index + 1} → ${index + 2}`
        );
        result[variacaoKey] = validVariation;
      });
      
      classificationData[originalName] = [result];
    }
  });
  
  return classificationData;
}

/**
 * Busca valor de um nível na distribuição, tentando diferentes variações do nome
 */
function getLevelValue(distribution: Record<string, number>, levelName: string): number {
  if (!distribution) return 0;
  
  // Tentar diferentes variações do nome
  const variations = [
    levelName,
    levelName.toLowerCase(),
    levelName.toUpperCase(),
    levelName.replace(/[áàâã]/gi, 'a').replace(/[éê]/gi, 'e').replace(/[íî]/gi, 'i').replace(/[óôõ]/gi, 'o').replace(/[úû]/gi, 'u').replace(/[ç]/gi, 'c'),
    levelName.replace(/[áàâã]/gi, 'a').replace(/[éê]/gi, 'e').replace(/[íî]/gi, 'i').replace(/[óôõ]/gi, 'o').replace(/[úû]/gi, 'u').replace(/[ç]/gi, 'c').toLowerCase(),
  ];
  
  // Variações específicas por nível
  if (levelName === 'Abaixo do Básico') {
    variations.push('abaixo_do_basico', 'Abaixo do básico', 'abaixo do básico', 'Abaixo do Basico');
  } else if (levelName === 'Básico') {
    variations.push('basico', 'Basico', 'BÁSICO');
  } else if (levelName === 'Adequado') {
    variations.push('adequado', 'ADEQUADO', 'Adequado');
  } else if (levelName === 'Avançado') {
    variations.push('avancado', 'Avançado', 'AVANÇADO', 'Avançado');
  }
  
  // Buscar o primeiro valor encontrado
  for (const variation of variations) {
    if (distribution[variation] !== undefined) {
      return distribution[variation];
    }
  }
  
  return 0;
}

/**
 * Processa dados de níveis de proficiência - usa dados calculados do backend
 */
function processLevelsData(comparison: ComparisonResponse): Record<string, EvolutionData[]> {
  if (!comparison.comparisons || comparison.comparisons.length === 0) {
    return {};
  }

  const levelsData: Record<string, EvolutionData[]> = {};
  
  // Verificar se o backend envia classification_levels_evolution
  if (!comparison.comparisons[0]?.general_comparison?.classification_levels_evolution) {
    // Se o backend não enviar, tentar usar classification_distribution (sem evoluções)
    // Mas sem calcular variações - apenas valores
    const levelNames = ['Abaixo do Básico', 'Básico', 'Adequado', 'Avançado'];
    
    levelNames.forEach(levelName => {
      const values: number[] = [];
      
      // Primeira comparação tem evaluation_1 e evaluation_2
      if (comparison.comparisons[0]) {
        const general = comparison.comparisons[0].general_comparison;
        const dist1 = general.classification_distribution?.evaluation_1 || {};
        const dist2 = general.classification_distribution?.evaluation_2 || {};
        
        const actualValue1 = getLevelValue(dist1, levelName);
        const actualValue2 = getLevelValue(dist2, levelName);
        
        values.push(actualValue1);
        values.push(actualValue2);
      }
      
      // Comparações subsequentes só adicionam evaluation_2 (evita duplicatas)
      for (let i = 1; i < comparison.comparisons.length; i++) {
        const general = comparison.comparisons[i].general_comparison;
        const dist2 = general.classification_distribution?.evaluation_2 || {};
        
        const actualValue = getLevelValue(dist2, levelName);
        values.push(actualValue);
      }
      
      // Só adicionar se tiver valores válidos (sem variações - backend deve calcular)
      if (values.length > 0) {
        const result: any = {
          name: levelName.toUpperCase(),
        };
        
        // Adicionar todas as etapas dinamicamente
        values.forEach((value, index) => {
          const etapaKey = `etapa${index + 1}`;
          result[etapaKey] = value;
        });
        
        // Não adicionar variações - backend deve calcular
        levelsData[levelName] = [result];
      }
    });
    
    return levelsData;
  }
  
  // Usar dados calculados do backend (classification_levels_evolution)
  const firstComparison = comparison.comparisons[0];
  const levelsEvolution = firstComparison.general_comparison.classification_levels_evolution || {};
  
  Object.keys(levelsEvolution).forEach(levelName => {
    const values: number[] = [];
    const variations: number[] = [];
    
    // Primeira comparação
    const firstLevel = levelsEvolution[levelName];
    if (firstLevel) {
      values.push(firstLevel.evaluation_1);
      values.push(firstLevel.evaluation_2);
      variations.push(firstLevel.evolution.percentage);
    }
    
    // Comparações subsequentes
    for (let i = 1; i < comparison.comparisons.length; i++) {
      const comp = comparison.comparisons[i];
      const levelEvolution = comp.general_comparison.classification_levels_evolution?.[levelName];
      if (levelEvolution) {
        values.push(levelEvolution.evaluation_2);
        variations.push(levelEvolution.evolution.percentage);
      }
    }
    
    // Só adicionar se tiver valores válidos
    if (values.length > 0) {
      const result: any = {
        name: levelName.toUpperCase(),
      };
      
      // Adicionar todas as etapas dinamicamente
      values.forEach((value, index) => {
        const etapaKey = `etapa${index + 1}`;
        result[etapaKey] = value;
      });
      
      // Adicionar todas as variações dinamicamente (do backend)
      variations.forEach((variation, index) => {
        const variacaoKey = `variacao_${index + 1}_${index + 2}`;
        const validVariation = validateVariation(
          variation,
          values[index],
          values[index + 1],
          `${originalName} etapa ${index + 1} → ${index + 2}`
        );
        result[variacaoKey] = validVariation;
      });
      
      levelsData[levelName] = [result];
    }
  });
  
  return levelsData;
}

// Função removida - cálculo deve ser feito no backend
// O backend deve enviar approval_rate já calculado

/**
 * Obtém domínio do eixo Y baseado na métrica
 */
export function getYAxisDomain(metric: string): [number, number] {
  switch (metric) {
    case 'grade':
      return [0, 10];
    case 'proficiency':
      return [0, 425];
    case 'participation':
    case 'approval':
      return [0, 100];
    default:
      return [0, 10];
  }
}

/**
 * Obtém label do eixo Y baseado na métrica
 */
export function getYAxisLabel(metric: string): string {
  switch (metric) {
    case 'grade':
      return 'Nota (0-10)';
    case 'proficiency':
      return 'Proficiência';
    case 'participation':
      return 'Participação (%)';
    case 'approval':
      return 'Taxa de Aprovação (%)';
    default:
      return 'Valor';
  }
}

