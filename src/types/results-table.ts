// Tipos para a tabela de resultados detalhados
export interface QuestionData {
  id: string;
  numero: number;
  texto: string;
  habilidade: string;
  codigo_habilidade: string;
  tipo: 'multipleChoice' | 'open' | 'trueFalse';
  dificuldade: 'Fácil' | 'Médio' | 'Difícil';
  porcentagem_acertos: number;
  porcentagem_erros: number;
}

export interface QuestionWithSkills {
  id: string;
  number: number;
  text: string;
  formattedText: string;
  alternatives?: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
  }>;
  skills: string[];
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
}

export interface SkillMapping {
  id: string | null;
  code: string;
  description: string;
  source: 'database' | 'question';
}

export interface SkillsBySubject {
  [subjectId: string]: SkillMapping[];
}

export interface StudentResult {
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
  // ✅ ADICIONAR: Propriedade respostas para compatibilidade com TableRow
  respostas?: Array<{
    questao_id: string;
    questao_numero: number;
    resposta_correta: boolean;
    resposta_em_branco: boolean;
    tempo_gasto: number;
  }>;
  // ✅ NOVO: Moedas ganhas (para competições)
  moedas_ganhas?: number;
}

export interface DetailedReport {
  avaliacao: {
    id: string;
    titulo: string;
    disciplina: string;
    total_questoes: number;
  };
  questoes: QuestionData[];
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

export interface DisciplineMetricCell {
  disciplina: string;
  nota: number;
  proficiencia: number;
  nivel: string;
}

export interface VisibleFields {
  turma: boolean;
  habilidade: boolean;
  questoes: boolean;
  percentualTurma: boolean;
  total: boolean;
  nota: boolean;
  proficiencia: boolean;
  nivel: boolean;
}

export interface ResultsTableProps {
  students: StudentResult[];
  totalQuestions: number;
  startQuestionNumber?: number;
  onViewStudentDetails: (studentId: string) => void;
  questoes?: QuestionData[];
  questionsWithSkills?: QuestionWithSkills[];
  skillsMapping?: Record<string, string>;
  skillsBySubject?: SkillsBySubject;
  detailedReport?: DetailedReport;
  visibleFields?: VisibleFields;
  subjectFilter?: string;
  evaluationId?: string;
  successThreshold?: number; // porcentagem para considerar desempenho bom
}

export interface SkillCodeGeneratorParams {
  questionNumber: number;
  questao: {
    id?: string;
    numero?: number;
    codigo_habilidade?: string;
    skills?: string[];
    difficulty?: string;
    type?: string;
    subject?: {
      id: string;
      name: string;
    };
  } | null;
  skillsMapping?: Record<string, string>;
  detailedReport?: DetailedReport;
  questionsWithSkills?: QuestionWithSkills[];
} 