// Classificações de proficiência
export type ProficiencyLevel = 'abaixo_do_basico' | 'basico' | 'adequado' | 'avancado';

// Interface para proficiência individual
export interface StudentProficiency {
  studentId: string;
  studentName: string;
  studentClass: string;
  rawScore: number; // Nota bruta (0-10)
  proficiencyScore: number; // Proficiência calculada (0-425 para Anos Finais/EM, 0-375 para Anos Iniciais)
  proficiencyLevel: ProficiencyLevel;
  classification: string; // Texto da classificação
  answeredQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  blankAnswers: number;
  timeSpent?: number; // Em minutos
  status: 'completed' | 'pending' | 'absent';
}

// Interface para dados de turma
export interface ClassPerformance {
  classId: string;
  className: string;
  averageProficiency: number;
  averageScore: number;
  totalStudents: number;
  completedStudents: number;
  distributionByLevel: {
    abaixo_do_basico: number;
    basico: number;
    adequado: number;
    avancado: number;
  };
}

// Interface para dados de avaliação completa
export interface EvaluationResultsData {
  id: string;
  evaluationId: string;
  evaluationTitle: string;
  subject: string;
  subjectId: string;
  course: string;
  courseId: string;
  grade: string;
  gradeId: string;
  school: string;
  schoolId: string;
  municipality: string;
  municipalityId: string;
  appliedAt: string;
  correctedAt?: string;
  status: 'completed' | 'pending' | 'in_progress';
  
  // Estatísticas gerais
  totalStudents: number;
  completedStudents: number;
  pendingStudents: number;
  absentStudents: number;
  
  // Médias gerais
  averageRawScore: number;
  averageProficiency: number;
  
  // Distribuição por classificação
  distributionByLevel: {
    abaixo_do_basico: number;
    basico: number;
    adequado: number;
    avancado: number;
  };
  
  // Dados por turma
  classesPerformance: ClassPerformance[];
  
  // Dados individuais dos alunos
  studentsData: StudentProficiency[];
}

// ✅ ATUALIZADO: Filtros conforme documentação dos endpoints
export interface ResultsFilters {
  // ✅ Novos filtros da documentação
  estado?: string;         // state
  municipio?: string;      // municipality  
  escola?: string;         // school
  serie?: string;          // grade
  turma?: string;          // class
  avaliacao?: string;      // evaluation
  
  // ✅ Filtros existentes mantidos para compatibilidade
  course?: string;
  subject?: string;
  class?: string;
  school?: string;
  state?: string;
  municipality?: string;
  grade?: string;
  evaluation?: string;
  
  proficiencyRange?: [number, number]; // Range de 0 a 425 (Anos Finais/EM) ou 0 a 375 (Anos Iniciais)
  scoreRange?: [number, number]; // Range de 0 a 10
  proficiencyLevels?: ProficiencyLevel[];
  status?: ('completed' | 'pending' | 'in_progress')[];
  dateRange?: {
    start: string;
    end: string;
  };
}

// Interface para dados de exportação
export interface ExportData {
  type: 'pdf' | 'excel';
  filters: ResultsFilters;
  data: EvaluationResultsData[];
  includeCharts?: boolean;
  includeDetails?: boolean;
}

// Cores para classificações
export const proficiencyColors = {
  abaixo_do_basico: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200',
    dot: 'bg-red-500'
  },
  basico: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-200',
    dot: 'bg-yellow-500'
  },
  adequado: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200',
    dot: 'bg-green-500'
  },
  avancado: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    dot: 'bg-emerald-600'
  }
};

// Textos das classificações
export const proficiencyLabels = {
  abaixo_do_basico: 'Abaixo do Básico',
  basico: 'Básico',
  adequado: 'Adequado',
  avancado: 'Avançado'
};

// ✅ TABELAS DE PROFICIÊNCIA OFICIAIS BASEADAS NAS IMAGENS

// Tabela para EDUCAÇÃO INFANTIL, ANOS INICIAIS, EDUCAÇÃO ESPECIAL E EJA - TODAS AS MATÉRIAS (EXCETO MATEMÁTICA)
// Proficiência Máxima (P.M) = 350
const PROFICIENCY_TABLE_ANOS_INICIAIS_GERAL = {
  abaixo_do_basico: { min: 0, max: 149 },
  basico: { min: 150, max: 199 },
  adequado: { min: 200, max: 249 },
  avancado: { min: 250, max: 350 }
};

// Tabela para EDUCAÇÃO INFANTIL, ANOS INICIAIS, EDUCAÇÃO ESPECIAL E EJA - MATEMÁTICA
// Proficiência Máxima (P.M) = 375
const PROFICIENCY_TABLE_ANOS_INICIAIS_MATEMATICA = {
  abaixo_do_basico: { min: 0, max: 174.99 },
  basico: { min: 175, max: 224.99 },
  adequado: { min: 225, max: 274.99 },
  avancado: { min: 275, max: 375 }
};

// Tabela para EDUCAÇÃO INFANTIL, ANOS INICIAIS, EDUCAÇÃO ESPECIAL E EJA - MÉDIA-NÍVEL
// Proficiência Máxima (P.M) = 375 (usando mesmo valor da matemática para média-nível)
const PROFICIENCY_TABLE_ANOS_INICIAIS_MEDIA = {
  abaixo_do_basico: { min: 0, max: 162 },
  basico: { min: 163, max: 212 },
  adequado: { min: 213, max: 262 },
  avancado: { min: 263, max: 375 }
};

// Tabela para ANOS FINAIS E ENSINO MÉDIO - TODAS AS MATÉRIAS (EXCETO MATEMÁTICA)
// Proficiência Máxima (P.M) = 400
const PROFICIENCY_TABLE_ANOS_FINAIS_GERAL = {
  abaixo_do_basico: { min: 0, max: 199 },
  basico: { min: 200, max: 274.99 },
  adequado: { min: 275, max: 324.99 },
  avancado: { min: 325, max: 400 }
};

// Tabela para ANOS FINAIS E ENSINO MÉDIO - MATEMÁTICA
// Proficiência Máxima (P.M) = 425
const PROFICIENCY_TABLE_ANOS_FINAIS_MATEMATICA = {
  abaixo_do_basico: { min: 0, max: 224.99 },
  basico: { min: 225, max: 299.99 },
  adequado: { min: 300, max: 349.99 },
  avancado: { min: 350, max: 425 }
};

// Tabela para ANOS FINAIS E ENSINO MÉDIO - MÉDIA-NÍVEL
// Proficiência Máxima (P.M) = 425 (usando mesmo valor da matemática para média-nível)
const PROFICIENCY_TABLE_ANOS_FINAIS_MEDIA = {
  abaixo_do_basico: { min: 0, max: 224.99 },
  basico: { min: 225, max: 299.99 },
  adequado: { min: 300, max: 349.99 },
  avancado: { min: 350, max: 425 }
};

// ✅ CONSTANTES DE PROFICIÊNCIA MÁXIMA OFICIAIS
// ATUALIZAÇÃO: Para cálculo geral, sempre usar os valores mais altos
// - Anos Iniciais: 375 (mesmo valor da matemática)
// - Anos Finais/EM: 425 (mesmo valor da matemática)
// Isso garante mais coerência entre disciplinas e padronização do cálculo
const PROFICIENCY_MAX_VALUES = {
  ANOS_INICIAIS_GERAL: 350,      // Todas as matérias exceto Matemática (valor original)
  ANOS_INICIAIS_MATEMATICA: 375, // Matemática
  ANOS_FINAIS_GERAL: 400,        // Todas as matérias exceto Matemática (valor original)
  ANOS_FINAIS_MATEMATICA: 425    // Matemática
};

// Mapeamento de séries para cursos (baseado na página de cadastros/séries)
const GRADE_TO_COURSE_MAPPING: Record<string, string> = {
  // Educação Infantil
  'Grupo 3': 'Anos Iniciais',
  'Grupo 4': 'Anos Iniciais', 
  'Grupo 5': 'Anos Iniciais',
  // Anos Iniciais
  '1º Ano': 'Anos Iniciais',
  '2º Ano': 'Anos Iniciais',
  '3º Ano': 'Anos Iniciais',
  '4º Ano': 'Anos Iniciais',
  '5º Ano': 'Anos Iniciais',
  // Anos Finais
  '6º Ano': 'Anos Finais',
  '7º Ano': 'Anos Finais',
  '8º Ano': 'Anos Finais',
  '9º Ano': 'Anos Finais',
  // Ensino Médio
  '1º Ano EM': 'Ensino Médio',
  '2º Ano EM': 'Ensino Médio',
  '3º Ano EM': 'Ensino Médio'
};

// ✅ FUNÇÃO ATUALIZADA: Calcular proficiência usando as tabelas corretas
// ATUALIZAÇÃO: Para cálculo geral (não-matemática), sempre usar os valores mais altos
// - Anos Iniciais: 375 (mesmo valor da matemática)
// - Anos Finais/EM: 425 (mesmo valor da matemática)
// Isso garante mais coerência entre disciplinas e padronização do cálculo
export function calculateProficiency(
  rawScore: number, 
  totalQuestions: number, 
  grade?: string, 
  subject?: string,
  course?: string
): {
  proficiencyScore: number;
  proficiencyLevel: ProficiencyLevel;
  classification: string;
} {
  // Conversão da nota bruta para proficiência usando os valores máximos oficiais (P.M)
  
  // Determinar o curso se não foi fornecido
  let educationalLevel = course;
  if (!educationalLevel && grade) {
    educationalLevel = GRADE_TO_COURSE_MAPPING[grade] || 'Anos Iniciais';
  }
  
  // Determinar se é matemática
  const isMathematics = subject?.toLowerCase().includes('matemática') || 
                       subject?.toLowerCase().includes('matematica') ||
                       subject?.toLowerCase() === 'math';
  
  // Selecionar a tabela correta e a proficiência máxima oficial
  let proficiencyTable;
  let maxProficiency: number;
  
  if (educationalLevel === 'Anos Iniciais') {
    if (isMathematics) {
      proficiencyTable = PROFICIENCY_TABLE_ANOS_INICIAIS_MATEMATICA;
      maxProficiency = PROFICIENCY_MAX_VALUES.ANOS_INICIAIS_MATEMATICA; // P.M = 375
    } else {
      proficiencyTable = PROFICIENCY_TABLE_ANOS_INICIAIS_GERAL;
      maxProficiency = PROFICIENCY_MAX_VALUES.ANOS_INICIAIS_MATEMATICA; // P.M = 375 (usando o valor mais alto)
    }
  } else {
    // Anos Finais ou Ensino Médio
    if (isMathematics) {
      proficiencyTable = PROFICIENCY_TABLE_ANOS_FINAIS_MATEMATICA;
      maxProficiency = PROFICIENCY_MAX_VALUES.ANOS_FINAIS_MATEMATICA; // P.M = 425
    } else {
      proficiencyTable = PROFICIENCY_TABLE_ANOS_FINAIS_GERAL;
      maxProficiency = PROFICIENCY_MAX_VALUES.ANOS_FINAIS_MATEMATICA; // P.M = 425 (usando o valor mais alto)
    }
  }
  
  // ✅ CÁLCULO OFICIAL: Usar a Proficiência Máxima (P.M) específica para cada categoria
  // Fórmula: (nota / 10) × P.M
  const proficiencyScore = Math.round((rawScore / 10) * maxProficiency);
  
  // Determinar o nível baseado na tabela selecionada
  let proficiencyLevel: ProficiencyLevel;
  let classification: string;
  
  if (proficiencyScore <= proficiencyTable.abaixo_do_basico.max) {
    proficiencyLevel = 'abaixo_do_basico';
    classification = 'Abaixo do Básico';
  } else if (proficiencyScore <= proficiencyTable.basico.max) {
    proficiencyLevel = 'basico';
    classification = 'Básico';
  } else if (proficiencyScore <= proficiencyTable.adequado.max) {
    proficiencyLevel = 'adequado';
    classification = 'Adequado';
  } else {
    proficiencyLevel = 'avancado';
    classification = 'Avançado';
  }
  
  return {
    proficiencyScore,
    proficiencyLevel,
    classification
  };
}

// ✅ NOVA FUNÇÃO: Obter informações da tabela de proficiência para uma série/disciplina
export function getProficiencyTableInfo(grade?: string, subject?: string, course?: string) {
  // Determinar o curso se não foi fornecido
  let educationalLevel = course;
  if (!educationalLevel && grade) {
    educationalLevel = GRADE_TO_COURSE_MAPPING[grade] || 'Anos Iniciais';
  }
  
  // Determinar se é matemática
  const isMathematics = subject?.toLowerCase().includes('matemática') || 
                       subject?.toLowerCase().includes('matematica') ||
                       subject?.toLowerCase() === 'math';
  
  // Selecionar a tabela correta
  if (educationalLevel === 'Anos Iniciais') {
    if (isMathematics) {
      return {
        table: PROFICIENCY_TABLE_ANOS_INICIAIS_MATEMATICA,
        tableName: 'Anos Iniciais - Matemática',
        educationalLevel: 'Anos Iniciais',
        subject: 'Matemática',
        maxProficiency: PROFICIENCY_MAX_VALUES.ANOS_INICIAIS_MATEMATICA, // P.M = 375
        pmDescription: 'P.M = 375 (Matemática - Anos Iniciais)'
      };
    } else {
      return {
        table: PROFICIENCY_TABLE_ANOS_INICIAIS_GERAL,
        tableName: 'Anos Iniciais - Todas as Matérias (exceto Matemática)',
        educationalLevel: 'Anos Iniciais',
        subject: 'Geral',
        maxProficiency: PROFICIENCY_MAX_VALUES.ANOS_INICIAIS_MATEMATICA, // P.M = 375 (usando o valor mais alto)
        pmDescription: 'P.M = 375 (Geral - Anos Iniciais) - Usando valor mais alto'
      };
    }
  } else {
    // Anos Finais ou Ensino Médio
    if (isMathematics) {
      return {
        table: PROFICIENCY_TABLE_ANOS_FINAIS_MATEMATICA,
        tableName: 'Anos Finais/Ensino Médio - Matemática',
        educationalLevel: educationalLevel || 'Anos Finais',
        subject: 'Matemática',
        maxProficiency: PROFICIENCY_MAX_VALUES.ANOS_FINAIS_MATEMATICA, // P.M = 425
        pmDescription: 'P.M = 425 (Matemática - Anos Finais/EM)'
      };
    } else {
      return {
        table: PROFICIENCY_TABLE_ANOS_FINAIS_GERAL,
        tableName: 'Anos Finais/Ensino Médio - Todas as Matérias (exceto Matemática)',
        educationalLevel: educationalLevel || 'Anos Finais',
        subject: 'Geral',
        maxProficiency: PROFICIENCY_MAX_VALUES.ANOS_FINAIS_MATEMATICA, // P.M = 425 (usando o valor mais alto)
        pmDescription: 'P.M = 425 (Geral - Anos Finais/EM) - Usando valor mais alto'
      };
    }
  }
} 

// ===== NOVAS INTERFACES PARA RELATÓRIO COMPLETO =====

export interface RelatorioCompletoAvaliacao {
  id: string;
  titulo: string;
  descricao: string;
  disciplinas: string[];
}

export interface TotalAlunosTurma {
  turma: string;
  matriculados: number;
  avaliados: number;
  percentual: number;
  faltosos: number;
}

export interface TotalAlunosEscola {
  escola: string;
  matriculados: number;
  avaliados: number;
  percentual: number;
  faltosos: number;
}

export interface TotalAlunosGeral {
  matriculados: number;
  avaliados: number;
  percentual: number;
  faltosos: number;
}

export interface TotalAlunos {
  por_turma?: TotalAlunosTurma[];
  por_escola?: TotalAlunosEscola[];
  total_geral: TotalAlunosGeral;
}

export interface NivelAprendizagemTurma {
  turma: string;
  abaixo_do_basico: number;
  basico: number;
  adequado: number;
  avancado: number;
  total: number;
}

export interface NivelAprendizagemEscola {
  escola: string;
  abaixo_do_basico: number;
  basico: number;
  adequado: number;
  avancado: number;
  total: number;
}

export interface NivelAprendizagemGeral {
  abaixo_do_basico: number;
  basico: number;
  adequado: number;
  avancado: number;
  total: number;
}

export interface NivelAprendizagemDisciplina {
  por_turma?: NivelAprendizagemTurma[];
  por_escola?: NivelAprendizagemEscola[];
  geral?: NivelAprendizagemGeral;
  total_geral?: NivelAprendizagemGeral;
}

export interface NiveisAprendizagem {
  [disciplina: string]: NivelAprendizagemDisciplina;
}

export interface ProficienciaTurma {
  turma: string;
  proficiencia: number;
}

export interface ProficienciaEscola {
  escola: string;
  proficiencia?: number;
  media?: number;
  total_alunos?: number;
}

export interface ProficienciaDisciplina {
  por_turma?: ProficienciaTurma[];
  por_escola?: ProficienciaEscola[];
  media_geral: number;
}

export interface Proficiencia {
  por_disciplina: {
    [disciplina: string]: ProficienciaDisciplina;
  };
  media_municipal_por_disciplina?: {
    [disciplina: string]: number;
  };
}

export interface NotaGeralTurma {
  turma: string;
  nota: number;
}

export interface NotaGeralEscola {
  escola: string;
  nota?: number;
  media?: number;
  total_alunos?: number;
}

export interface NotaGeralDisciplina {
  por_turma?: NotaGeralTurma[];
  por_escola?: NotaGeralEscola[];
  media_geral: number;
}

export interface NotaGeral {
  por_disciplina: {
    [disciplina: string]: NotaGeralDisciplina;
  };
  media_municipal_por_disciplina?: {
    [disciplina: string]: number;
  };
}

export interface QuestaoHabilidade {
  numero: number;
  numero_questao: number;
  acertos: number;
  total: number;
  percentual: number;
  codigo: string;
  descricao: string;
}

export interface Habilidade {
  ranking: number;
  codigo: string;
  descricao: string;
  acertos: number;
  total: number;
  percentual: number;
  questoes: QuestaoHabilidade[];
}

export interface AcertosPorHabilidadeDisciplina {
  habilidades: Habilidade[];
}

export interface AcertosPorHabilidade {
  [disciplina: string]: AcertosPorHabilidadeDisciplina;
}

export interface RelatorioCompleto {
  avaliacao: RelatorioCompletoAvaliacao;
  total_alunos: TotalAlunos;
  niveis_aprendizagem: NiveisAprendizagem;
  proficiencia: Proficiencia;
  nota_geral: NotaGeral;
  acertos_por_habilidade: AcertosPorHabilidade;
  escopo?: {
    tipo: string;
    id?: string;
    school_id?: string | null;
    city_id?: string | null;
  };
} 