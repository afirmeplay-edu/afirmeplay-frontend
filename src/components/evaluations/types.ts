export interface Subject {
  id: string;
  name: string;
}

// export interface Question {
//   id: string;
//   title: string;
//   text: string;
//   secondStatement?: string;
//   type: "multipleChoice" | "open" | "trueFalse";
//   subjectId: string;
//   subject: { id: string, name: string };
//   grade: { id: string, name: string };
//   difficulty: string;
//   value: string;
//   solution: string;
//   formattedText?: string;
//   formattedSolution?: string;
//   options: {
//     id?: string;
//     text: string;
//     isCorrect: boolean;
//   }[];
//   skills: string[];
//   created_by: string;
//   educationStage?: { id: string; name: string; } | null;
// }

// Em ./types.ts

export interface Subject {
  id: string;
  name: string;
}



export interface Student {
  id: string;
  name: string;
  grade: string;
  class: string;
  school: string;
  status: 'active' | 'inactive'; // Tipo específico, não 'string'
  createdAt: string;
}

export interface EvaluationData {
  title: string;
  description: string;
  subject: Subject;
  grade: string;
  course: string;
  school: string;
  municipality: string;
  type: "AVALIACAO" | "SIMULADO";
  model: "SAEB" | "PROVA" | "AVALIE";
  questions: Question[];
  students: Student[];
  startDateTime: string;
  endDateTime: string;
  duration: number;
}

export interface Question {
  id: string;
  title: string;
  text: string;
  formattedText?: string;
  type: 'multipleChoice' | 'dissertativa' | 'trueFalse'; // Atualizado para usar 'dissertativa' em vez de 'open'
  subjectId: string;
  subject?: Subject; // Assuming Subject is also defined
  educationStage?: EducationStage; // Assuming EducationStage is also defined
  grade?: Grade; // Assuming Grade is also defined
  difficulty: string;
  value: number; // Garantir que é number
  solution?: string;
  formattedSolution?: string;
  options?: {
    id?: string;
    text: string;
    isCorrect: boolean;
    image?: import('@/types/question-option').QuestionOptionImageApi | string;
  }[];
  secondStatement?: string;
  skills?: string | string[]; // id(s) ou códigos (normalizado como array no front)
  /** Código da habilidade vinculada (skill_code) para exibição */
  skillCode?: string;
  created_by: string;
  lastModifiedBy?: string;
  // Add other properties as needed
}

export interface EvaluationFormData {
  title: string;
  description?: string;
  municipalities: string[];
  schools: string[];
  course: string;
  grade: string;
  classId: string;
  type: "AVALIACAO" | "SIMULADO";
  model: "SAEB" | "PROVA" | "AVALIE";
  subjects: Subject[];
  subject: string;
  questions: Question[];
  startDateTime?: string;
  endDateTime?: string;
  duration?: string;
  classes?: string[];
  selectedClasses?: ClassInfo[];
  state?: string;
  municipality?: string;
  selectedSchools?: { id: string; name: string; }[];
}

// Define Subject, EducationStage, Grade interfaces if not already
export interface Subject {
  id: string;
  name: string;
}

export interface EducationStage {
  id: string;
  name: string;
}

export interface Grade {
  id: string;
  name: string;
}

export interface ClassInfo {
  id: string;
  name: string;
  students_count?: number;
  school?: {
    id: string;
    name: string;
  };
  grade?: {
    id: string;
    name: string;
    education_stage?: {
      id: string;
      name: string;
    };
  };
}

export interface TeacherSchool {
  id: string;
  name: string;
  city: string;
  state: string;
}

export interface SubjectModalProps {
  subjects: Subject[];
  onSubjectsChange: (subjects: Subject[]) => void;
  availableSubjects: Subject[];
  onClose: () => void;
} 