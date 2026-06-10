// Interfaces para o sistema de provas/avaliações

export interface TestSession {
    session_id: string;
    status: 'em_andamento' | 'finalizada' | 'expirada';
    started_at: string;
    actual_start_time?: string; // ✅ NOVO: campo para cronômetro real
    created_at?: string; // ✅ NOVO: campo para data de criação
    remaining_time_minutes: number;
    time_limit_minutes?: number; // ✅ NOVO: tempo limite da sessão
    is_expired: boolean;
    total_questions: number;
    correct_answers: number;
    score: number;
    grade: string | null;
}

export interface Question {
    id: string;
    number: number;
    type: "multiple_choice" | "true_false" | "essay" | "multiple_answer" | "multipleChoice" | "truefalse" | "open" | "dissertativa";
    text: string;
    formattedText?: string;
    imageUrl?: string;
    images?: (string | { url?: string; src?: string; name?: string })[];
    secondstatement?: string;
    secondStatement?: string;
    subject?: { id: string; name: string };
    options?: {
        id: string;
        text: string;
        isCorrect?: boolean;
        image?: import('@/types/question-option').QuestionOptionImageApi | string;
    }[];
    alternatives?: {
        id?: string;
        text: string;
        isCorrect?: boolean;
        image?: import('@/types/question-option').QuestionOptionImageApi | string;
    }[];
    points: number;
    difficulty: "easy" | "medium" | "hard";
    // ✅ NOVO: Mapeamento de posições embaralhadas para originais
    positionMapping?: Array<{
        shuffledIndex: number;
        originalIndex: number;
        originalLetter: string; // A, B, C, D...
        shuffledLetter: string; // A, B, C, D... (pode ser diferente)
        originalText: string;
        shuffledText: string;
    }>;
}

export interface TestData {
    id: string;
    title: string;
    /** Tipo da avaliação: AVALIACAO, OLIMPIADA, SIMULADO, COMPETICAO, etc. */
    type?: string;
    subject: { id: string; name: string };
    duration: number;
    duration_minutes?: number; // alternativo do backend (minutos)
    totalQuestions?: number; // ✅ CORRIGIDO: Tornar opcional
    total_questions?: number; // ✅ NOVO: Campo alternativo do backend
    instructions: string;
    questions: Question[];
    startDateTime?: string; // ✅ NOVO: Data/hora de início (usado para validação de período em olimpíadas)
    endDateTime?: string; // ✅ NOVO: Data/hora de término (usado para validação de período em olimpíadas)
}

export interface StudentAnswer {
    question_id: string;
    answer: string;
    // Para questões dissertativas, o answer será um JSON string com o formato:
    // [{"text": "Resposta do aluno", "student_answer": true, "score": null}]
}

export interface TestResults {
    total_questions: number;
    correct_answers: number;
    score_percentage: number;
    grade: string;
    answers_saved: number;
}

export type EvaluationState = 'loading' | 'instructions' | 'active' | 'completed' | 'expired' | 'error';

// Interfaces para as APIs
export interface StartSessionRequest {
    test_id: string;
    time_limit_minutes: number;
}

export interface StartSessionResponse {
    message: string;
    session_id: string;
    started_at: string;
    actual_start_time?: string;
    time_limit_minutes: number;
    remaining_time_minutes: number;
    test_id?: string; // ✅ NOVO: ID do teste para validação
}

export interface SessionStatusResponse {
    session_id: string;
    status: 'em_andamento' | 'finalizada' | 'expirada';
    started_at: string;
    actual_start_time?: string; // ✅ NOVO: campo para cronômetro real
    remaining_time_minutes: number;
    is_expired: boolean;
    total_questions: number;
    correct_answers: number;
    score: number;
    grade: string | null;
}



export interface SubmitTestRequest {
    session_id: string;
    test_id?: string; // ✅ Incluir test_id para o backend identificar o tipo (OLIMPIADA vs AVALIACAO)
    answers: {
        question_id: string;
        answer: string;
    }[];
}

export interface SubmitTestResponse {
    message: string;
    session_id: string;
    submitted_at: string;
    duration_minutes: number;
    results: TestResults;
}

// Interface unificada de Evaluation
export interface Subject {
    id: string;
    name: string;
}

export interface Grade {
    id: string;
    name: string;
}

export interface Course {
    id: string;
    name: string;
}

export interface Author {
    id: string;
    name: string;
}

export interface Municipality {
    id: string;
    name: string;
}

export interface SchoolInfo {
    id: string;
    name: string;
}

export interface AppliedClass {
    class_test_id: string | null;
    class: {
        id: string;
        name: string;
        students_count: number;
        school?: {
            id: string;
            name: string;
        };
        grade?: {
            id: string;
            name: string;
        };
    };
    application: string | null;
    expiration: string | null;
    status?: "applied" | "configured";
}

export interface Evaluation {
    id: string;
    title: string;
    description?: string | null;
    type: "AVALIACAO" | "SIMULADO" | "EVALUATION" | "SIMULATION";
    model: "SAEB" | "PROVA" | "AVALIE";
    course?: Course | null;
    grade?: Grade | null;
    grade_id?: string; // Campo alternativo do backend
    subject?: Subject; // Campo singular (fallback para compatibilidade)
    subjects?: Subject[]; // Campo oficial (array de disciplinas)
    subjects_info?: Subject[]; // Campo alternativo (fallback)
    subjects_count?: number; // Quantidade de disciplinas
    questions?: Array<Question | {
        id: string;
        number?: number;
        title?: string;
        text: string;
        formattedText?: string;
        question_type?: string;
        type?: string;
        command?: string;
        value?: number;
        points?: number;
        difficulty?: string;
        solution?: string;
        options?: Array<{
          id: string;
          text: string;
          isCorrect?: boolean;
          image?: import('@/types/question-option').QuestionOptionImageApi | string;
        }>;
        alternatives?: Array<{
          id?: string;
          text: string;
          isCorrect?: boolean;
          image?: import('@/types/question-option').QuestionOptionImageApi | string;
        }>;
        subject?: Subject;
        skills?: string[];
    }>;
    duration?: number; // Duração em minutos
    duration_minutes?: number; // alternativo do backend
    max_score?: number | null;
    createdAt?: string;
    created_at?: string; // Campo alternativo
    updatedAt?: string;
    updated_at?: string; // Campo alternativo
    createdBy?: Author;
    created_by?: Author; // Campo alternativo
    startDateTime?: string; // Data de início quando ativada
    endDateTime?: string; // Data de fim quando ativada
    municipalities?: Municipality[];
    municipalities_count?: number;
    schools?: SchoolInfo[];
    schools_count?: number;
    classes?: string[]; // IDs das turmas selecionadas (fallback)
    total_students?: number;
    applied_classes_count?: number;
    applied_classes?: AppliedClass[];
    status?: string;
    is_applied?: boolean;
    is_active?: boolean;
    archived?: boolean;
    deleted_at?: string | null;
}

/**
 * Função helper para padronizar acesso a disciplinas
 * Verifica na ordem: subjects > subjects_info > subject
 */
export function getEvaluationSubjects(evaluation: Evaluation): Subject[] {
    // Prioridade 1: subjects (campo oficial do backend)
    if (evaluation.subjects && Array.isArray(evaluation.subjects) && evaluation.subjects.length > 0) {
        return evaluation.subjects;
    }

    // Prioridade 2: subjects_info (fallback)
    if (evaluation.subjects_info && Array.isArray(evaluation.subjects_info) && evaluation.subjects_info.length > 0) {
        return evaluation.subjects_info;
    }

    // Prioridade 3: subject único (fallback para compatibilidade)
    if (evaluation.subject && evaluation.subject.name) {
        return [evaluation.subject];
    }

    return [];
}

/**
 * Função helper para obter a contagem de disciplinas
 */
export function getEvaluationSubjectsCount(evaluation: Evaluation): number {
    if (evaluation.subjects_count !== undefined) {
        return evaluation.subjects_count;
    }
    return getEvaluationSubjects(evaluation).length;
}