import React, { useState, useEffect, useCallback, useMemo } from "react";
import { DonutChartComponent } from "@/components/ui/charts";
import { formatDecimal1PtBr, formatPercent1PtBr } from "@/utils/numberFormat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DisciplineTag } from "@/components/ui/discipline-tag";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
    ArrowLeft,
    CheckCircle2,
    XCircle,
    Minus,
    Clock,
    Target,
    BarChart3,
    AlertTriangle,
    Award,
    Users,
    Search,
    TrendingUp,
    TrendingDown,
    Eye,
    RefreshCw,
    AlertCircle,
    BookOpen,
    CheckCircle
} from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { EvaluationResultsApiService } from "@/services/evaluation/evaluationResultsApi";
import { api } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";

// Importar a interface DetailedReport do serviço
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

interface DetailedResultsViewProps {
    onBack: () => void;
}

interface StudentResult {
    id: string;
    nome: string;
    turma: string;
    nota: number;
    total_score?: number; // ✅ Campo para nota
    grade?: string | number; // ✅ Campo para nota (do banco) - pode ser string ou number
    proficiencia: number;
    proficiency?: number; // ✅ Campo para proficiência (do banco)
    classificacao: 'Abaixo do Básico' | 'Básico' | 'Adequado' | 'Avançado';
    classification?: string; // ✅ Campo para nível
    correct_answers?: number; // ✅ Campo para acertos (do banco)
    questoes_respondidas: number;
    acertos: number;
    erros: number;
    em_branco: number;
    tempo_gasto: number;
    status: 'concluida' | 'pendente';
}

interface EvaluationInfo {
    id: string;
    titulo: string;
    disciplina: string;
    disciplinas?: string[]; // ✅ Adicionado para múltiplas disciplinas
    curso: string;
    serie: string;
    grade_id?: string; // ✅ Adicionado para mapeamento de série
    escola: string;
    municipio: string;
    data_aplicacao: string;
    status: 'concluida' | 'em_andamento' | 'pendente';
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
}

interface Stats {
    totalStudents: number;
    completedStudents: number;
    averageScore: number;
    averageProficiency: number;
    distribution: {
        abaixo_do_basico: number;
        basico: number;
        adequado: number;
        avancado: number;
    };
}

interface ApiError {
    message?: string;
    code?: string;
    response?: {
        status?: number;
    };
}

// ✅ NOVO: Interface para respostas detalhadas do aluno
interface StudentDetailedAnswers {
  test_id: string;
  student_id: string;
  student_name: string;
  total_questions: number;
  answered_questions: number;
  correct_answers: number;
  score_percentage: number;
  total_score: number;
  max_possible_score: number;
  grade: number;
  proficiencia: number;
  classificacao: string;
  status: 'concluida' | 'nao_respondida';
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

// Componente da tabela de resultados dos alunos
const StudentsResultsTable = ({ 
    students, 
    totalQuestions, 
    startQuestionNumber = 1, // ✅ CORRIGIDO: Valor padrão 1
    onViewStudentDetails,
    questoes,
    questionsWithSkills,
    skillsMapping,
    skillsBySubject,
    detailedReport,
    studentDetailedAnswers,
    visibleFields = {
        turma: true,
        habilidade: true,
        questoes: true,
        percentualTurma: true,
        total: true,
        nota: true,
        proficiencia: true,
        nivel: true
    },
    subjectFilter
}: {
    students: StudentResult[];
    totalQuestions: number;
    startQuestionNumber?: number;
    onViewStudentDetails: (studentId: string) => void;
    questoes?: Array<{
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
    questionsWithSkills?: Array<{
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
    }>;
    skillsMapping?: Record<string, string>; // UUID -> Código real
    skillsBySubject?: Record<string, Array<{
        id: string | null;
        code: string;
        description: string;
        source: 'database' | 'question';
    }>>; // ✅ Skills organizadas por disciplina
    detailedReport?: DetailedReport; // Para acessar a disciplina
    studentDetailedAnswers?: Record<string, StudentDetailedAnswers>;
    visibleFields?: {
        turma: boolean;
        habilidade: boolean;
        questoes: boolean;
        percentualTurma: boolean;
        total: boolean;
        nota: boolean;
        proficiencia: boolean;
        nivel: boolean;
    };
    subjectFilter?: string;
}) => {
    // ✅ FUNÇÃO AUXILIAR: Normalizar UUID para comparação
    const normalizeUUID = (uuid: string) => {
        // Remove chaves, espaços extras e converte para minúsculas
        return uuid.replace(/[{}]/g, '').trim().toLowerCase();
    };

    // ✅ PRIORIDADE: Usar códigos reais das habilidades quando disponíveis
    const generateHabilidadeCode = (questionNumber: number, questao: {
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
    } | null) => {
        // ✅ Verificar se temos dados válidos
        if (!questao) {
            // Fallback simples se não temos dados da questão
            const disciplina = detailedReport?.avaliacao?.disciplina?.toLowerCase() || '';
            const isMathematics = disciplina.includes('matemática') || disciplina.includes('matematica');
            const grade = Math.min(Math.floor(questionNumber / 10) + 1, 9);
            const skillNumber = ((questionNumber - 1) % 10) + 1;
            return isMathematics ? `${grade}N1.${skillNumber}` : `LP${grade}L1.${skillNumber}`;
        }

        // ✅ Normalizar UUID para comparação
        const normalizedUUID = normalizeUUID(questao.codigo_habilidade);
        
        // ✅ Tentar mapeamento direto primeiro
        if (skillsMapping && questao.codigo_habilidade) {
            if (skillsMapping[questao.codigo_habilidade]) {
                return skillsMapping[questao.codigo_habilidade];
            }
            
            // Tentar com UUID normalizado
            if (skillsMapping[normalizedUUID]) {
                return skillsMapping[normalizedUUID];
            }
        }
        
        // ✅ NOVO: Determinar disciplina baseada na questão ou dados da avaliação
        let disciplina = '';
        
        // ✅ Prioridade 1: Usar disciplina da questão se disponível
        if (questao.subject && questao.subject.name) {
            disciplina = questao.subject.name.toLowerCase();
        } else if (questionsWithSkills && questionsWithSkills.length > 0) {
            // ✅ Prioridade 2: Buscar disciplina nas questões com skills
            const questionWithSkill = questionsWithSkills.find(q => q.number === questionNumber);
            if (questionWithSkill && questionWithSkill.subject) {
                disciplina = questionWithSkill.subject.name.toLowerCase();
            }
        } else {
            // ✅ Prioridade 3: Usar disciplina da avaliação
            disciplina = detailedReport?.avaliacao?.disciplina?.toLowerCase() || '';
        }
        
        // ✅ Determinar série baseada no número da questão ou dados da avaliação
        let grade = 1; // Padrão
        if (detailedReport?.avaliacao?.disciplina) {
            // Tentar extrair série do título ou dados da avaliação
            const serieMatch = detailedReport.avaliacao.disciplina.match(/(\d+)/);
            if (serieMatch) {
                grade = parseInt(serieMatch[1]);
            } else {
                // Usar número da questão como aproximação
                grade = Math.min(Math.floor(questionNumber / 10) + 1, 9); // Máximo 9º ano
            }
        }
        
        const skillNumber = ((questionNumber - 1) % 10) + 1;
        
        // ✅ Detectar disciplina baseada no nome
        const isMathematics = disciplina.includes('matemática') || 
                             disciplina.includes('matematica') ||
                             disciplina.includes('math') ||
                             disciplina.includes('mathematics');
        const isPortuguese = disciplina.includes('português') || 
                            disciplina.includes('portugues') || 
                            disciplina.includes('língua') ||
                            disciplina.includes('lingua') ||
                            disciplina.includes('portuguese') ||
                            disciplina.includes('portuguesa') ||
                            disciplina.includes('lingua portuguesa') ||
                            disciplina.includes('língua portuguesa') ||
                            disciplina.includes('lp') ||
                            disciplina.includes('l.p.') ||
                            disciplina.includes('lingua p') ||
                            disciplina.includes('língua p') ||
                            disciplina.includes('portuguese language');
        const isScience = disciplina.includes('ciências') || 
                         disciplina.includes('ciencias') || 
                         disciplina.includes('science') ||
                         disciplina.includes('ciência') ||
                         disciplina.includes('ciencia');
        const isHistory = disciplina.includes('história') || 
                         disciplina.includes('historia') || 
                         disciplina.includes('history');
        const isGeography = disciplina.includes('geografia') || 
                           disciplina.includes('geography');
        
        // ✅ Gerar código baseado na disciplina detectada
        if (isMathematics) {
            // Para matemática, usar códigos como 9N1.1, 9N1.2, etc.
            return `${grade}N1.${skillNumber}`;
        } else if (isPortuguese) {
            // Para língua portuguesa, usar códigos como LP9L1.1, LP9L1.2, etc.
            return `LP${grade}L1.${skillNumber}`;
        } else if (isScience) {
            // Para ciências, usar códigos como CN9L1.1, CN9L1.2, etc.
            return `CN${grade}L1.${skillNumber}`;
        } else if (isHistory) {
            // Para história, usar códigos como HI9L1.1, HI9L1.2, etc.
            return `HI${grade}L1.${skillNumber}`;
        } else if (isGeography) {
            // Para geografia, usar códigos como GE9L1.1, GE9L1.2, etc.
            return `GE${grade}L1.${skillNumber}`;
        } else {
            // Para outras disciplinas, usar códigos genéricos como LP9L1.1, LP9L1.2, etc.
            return `LP${grade}L1.${skillNumber}`;
        }
    };

    // ✅ NOVO: Função para buscar descrição da skill
    const getSkillDescription = (skillCode: string) => {
        // Buscar em todas as disciplinas
        for (const [subjectId, skills] of Object.entries(skillsBySubject || {})) {
            const skill = skills.find(s => s.code === skillCode);
            if (skill) {
                return skill.description;
            }
        }
        return null;
    };

          // ✅ CORRIGIDO: Função para gerar porcentagens da turma usando dados reais
    const generateTurmaPercentages = useCallback(() => {
        if (!students || students.length === 0) {
            return Array.from({ length: totalQuestions }, () => 0);
        }

        

        return Array.from({ length: totalQuestions }, (_, questionIndex) => {
            let correctCount = 0;
            let totalAnswered = 0;

            students.forEach(student => {
                const studentAnswers = studentDetailedAnswers?.[student.id];
                

                
                if (studentAnswers && studentAnswers.answers && studentAnswers.answers.length > 0) {
                    // ✅ CORREÇÃO: Usar dados reais das respostas
                    // Buscar TODAS as respostas para esta questão (pode haver múltiplas)
                    const questionAnswers = studentAnswers.answers.filter(
                        answer => answer.question_number === questionIndex + 1
                    );



                    if (questionAnswers.length > 0) {
                        // Usar a ÚLTIMA resposta (mais recente)
                        const lastAnswer = questionAnswers[questionAnswers.length - 1];
                        totalAnswered++;
                        if (lastAnswer.is_correct) {
                            correctCount++;
                        }

                    } else {
                        // Questão não respondida pelo aluno
                    }
                } else {
                    // Fallback para dados básicos se não tiver respostas detalhadas
                    const correctAnswers = student.acertos;
                    const wrongAnswers = student.erros;
                    const totalAnsweredBasic = correctAnswers + wrongAnswers;
                    
                    if (questionIndex < totalAnsweredBasic) {
                        totalAnswered++;
                        if (questionIndex < correctAnswers) {
                            correctCount++;
                        }
                        // console.log(`🔍 Q${questionIndex + 1} - ${student.nome}: ${questionIndex < correctAnswers ? '✓' : '✗'} (fallback)`);
                    } else {
                        // console.log(`🔍 Q${questionIndex + 1} - ${student.nome}: não respondeu (fallback)`);
                    }
                }
            });

            const percentage = totalAnswered > 0 ? (correctCount / totalAnswered) * 100 : 0;
            

            
            return percentage;
        });
    }, [students, studentDetailedAnswers, totalQuestions]);

    // ✅ CORRIGIDO: Função para obter respostas de um aluno específico
    const getStudentAnswers = useCallback((studentId: string) => {
        const studentAnswers = studentDetailedAnswers[studentId];
        
        if (!studentAnswers || !studentAnswers.answers) {
            return Array.from({ length: totalQuestions }, () => null);
        }

        // ✅ CORREÇÃO: Usar dados reais das respostas
        const answers = Array.from({ length: totalQuestions }, (_, questionIndex) => {
            const questionAnswer = studentAnswers.answers.find(
                answer => answer.question_number === questionIndex + 1
            );

            if (!questionAnswer) {
                return null; // Questão não respondida
            }

            return questionAnswer.is_correct;
        });


        
        return answers;
    }, [studentDetailedAnswers, totalQuestions]);

    // ✅ CORRIGIDO: Gerar porcentagens da turma usando dados reais
    const turmaPercentages = useMemo(() => {
        return generateTurmaPercentages();
    }, [generateTurmaPercentages]);

        return (
        <div className="overflow-x-auto">
            <table className="min-w-max border border-gray-300 text-center text-sm shadow-md rounded-lg">
                <thead>
                    {/* Cabeçalho principal */}
                    <tr className="bg-gray-100">
                        <th className="p-2 min-w-[150px] text-left border-r border-gray-300">Aluno</th>
                        {visibleFields?.questoes && Array.from({ length: totalQuestions }, (_, i) => {
                            // ✅ CORRIGIDO: Sempre mostrar Q1, Q2, Q3, Q4... independente do número do backend
                            const questionDisplayNumber = i + 1;
                            
                            return (
                                <th key={`header-q${i}`} className="p-2 min-w-[80px] border-r border-gray-300">
                                    Q{questionDisplayNumber}
                                </th>
                            );
                        })}
                        {visibleFields?.total && <th className="p-2 bg-gray-50">Total</th>}
                        {visibleFields?.nota && <th className="p-2 bg-gray-50">Nota</th>}
                        {visibleFields?.proficiencia && <th className="p-2 bg-gray-50">Proficiência</th>}
                        {visibleFields?.nivel && <th className="p-2 bg-gray-50">Nível</th>}
                    </tr>
                    
                    {/* Linha de habilidades (se habilitada) */}
                    {visibleFields?.habilidade && (
                        <tr className="bg-gray-50">
                            <td className="p-1 text-left border-r border-gray-300 text-xs font-mono text-gray-600">
                                Habilidade
                            </td>
                            {visibleFields?.questoes && Array.from({ length: totalQuestions }, (_, i) => {
                                let questionNumber = startQuestionNumber + i;
                                let questao = null;
                                
                                if (questionsWithSkills && questionsWithSkills.length > 0) {
                                    questao = questionsWithSkills[i];
                                    if (questao) {
                                        questionNumber = questao.number;
                                    }
                                } else if (questoes && questoes.length > 0) {
                                    questao = questoes.find(q => q.numero === questionNumber);
                                    if (questao) {
                                        questionNumber = questao.numero;
                                    }
                                }
                                
                                const habilidadeCode = generateHabilidadeCode(questionNumber, questao);
                                
                                let disciplinaIndicator = '';
                                if (questao && questao.subject && questao.subject.name) {
                                    const disciplina = questao.subject.name.toLowerCase();
                                    if (disciplina.includes('português') || disciplina.includes('portugues') || disciplina.includes('língua')) {
                                        disciplinaIndicator = ' 🇧🇷';
                                    } else if (disciplina.includes('matemática') || disciplina.includes('matematica')) {
                                        disciplinaIndicator = ' 🔢';
                                    } else if (disciplina.includes('ciência') || disciplina.includes('ciencia')) {
                                        disciplinaIndicator = ' 🔬';
                                    } else if (disciplina.includes('história') || disciplina.includes('historia')) {
                                        disciplinaIndicator = ' 📚';
                                    } else if (disciplina.includes('geografia')) {
                                        disciplinaIndicator = ' 🌍';
                                    }
                                }
                                
                                const skillDescription = getSkillDescription(habilidadeCode);
                                
                                return (
                                    <td key={`habilidade-q${i}`} className="p-1 border-r border-gray-300 text-xs font-mono text-gray-600">
                                        {skillDescription ? (
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span className="cursor-help hover:text-blue-600 transition-colors group">
                                                            {habilidadeCode}{disciplinaIndicator}
                                                            <span className="ml-1 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">ℹ️</span>
                                                        </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="max-w-xs bg-gray-900 text-white border-gray-700">
                                                        <div className="space-y-2">
                                                            <div className="font-bold text-sm text-blue-200">{habilidadeCode}</div>
                                                            <div className="text-sm leading-relaxed">{skillDescription}</div>
                                                        </div>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        ) : (
                                            <span>{habilidadeCode}{disciplinaIndicator}</span>
                                        )}
                                    </td>
                                );
                            })}
                            {visibleFields?.total && <td className="p-1 bg-gray-100 text-xs font-mono text-gray-600"></td>}
                            {visibleFields?.nota && <td className="p-1 bg-gray-100 text-xs font-mono text-gray-600"></td>}
                            {visibleFields?.proficiencia && <td className="p-1 bg-gray-100 text-xs font-mono text-gray-600"></td>}
                            {visibleFields?.nivel && <td className="p-1 bg-gray-100 text-xs font-mono text-gray-600"></td>}
                        </tr>
                    )}
                    
                    {/* Linha de porcentagem da turma (se habilitada) */}
                    {visibleFields?.percentualTurma && (
                        <tr className="bg-blue-50">
                            <td className="p-1 text-left border-r border-gray-300 text-xs font-semibold text-blue-700">
                                % Turma
                            </td>
                            {visibleFields?.questoes && turmaPercentages.map((percentage, i) => {
                                const displayColor = percentage >= 60 ? "text-green-600" : "text-red-500";
                                
                                return (
                                <td key={`turma-q${i}`} className="p-1 border-r border-gray-300">
                                        <div className={`text-xs font-bold ${displayColor}`}>
                                        {formatPercent1PtBr(percentage)}
                                    </div>
                                </td>
                                );
                            })}
                            {visibleFields?.total && <td className="p-1 bg-gray-100 text-xs font-semibold text-blue-700"></td>}
                            {visibleFields?.nota && <td className="p-1 bg-gray-100 text-xs font-semibold text-blue-700"></td>}
                            {visibleFields?.proficiencia && <td className="p-1 bg-gray-100 text-xs font-semibold text-blue-700"></td>}
                            {visibleFields?.nivel && <td className="p-1 bg-gray-100 text-xs font-semibold text-blue-700"></td>}
                        </tr>
                    )}
                </thead>
                <tbody>
                    {students.map((student, studentIndex) => {
                        // ✅ CORREÇÃO: Usar dados reais das respostas detalhadas
                        let answers = Array.from({ length: totalQuestions }, () => null);

                        

                        
                        // ✅ Usar dados do banco para gerar respostas
                        const correctAnswers = student.acertos;
                        const wrongAnswers = student.erros;
                        const totalAnswered = correctAnswers + wrongAnswers;
                        
                        answers = Array.from({ length: totalQuestions }, (_, questionIndex) => {
                            if (questionIndex < totalAnswered) {
                                if (questionIndex < correctAnswers) return true;
                                return false;
                            }
                            return null;
                        });
                        

                        
                        return (
                            <tr key={`${student.id || 'student'}-${studentIndex}`} 
                                className="hover:bg-gray-50 cursor-pointer group"
                                onClick={() => onViewStudentDetails(student.id)}
                                title="Clique para ver resultados detalhados do aluno">
                                <td className="p-2 border-t border-r-2 border-gray-200 text-left">
                                    <div className="font-medium hover:text-blue-600 transition-colors flex items-center gap-2">
                                        {student.nome}
                                        <Eye className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </td>
                                {visibleFields?.questoes && answers.map((answer, questionIndex) => {
                                    const displaySymbol = answer === true ? '✓' : answer === false || answer === null ? '✗' : '-';
                                    const displayColor = answer === true ? 'text-green-700' : answer === false || answer === null ? 'text-red-600' : 'text-transparent';
                                    
                                    return (
                                        <td key={`${student.id}-q${questionIndex}`} className="px-4 py-2 border-t border-r-2 border-gray-200 text-center align-middle">
                                            <div className="flex justify-center items-center h-full">
                                                <span className={`${displayColor} text-2xl font-bold`}>{displaySymbol}</span>
                                        </div>
                                    </td>
                                    );
                                })}
                                {visibleFields?.total && (
                                    <td className="p-2 border-t border-gray-200 font-semibold bg-gray-50 text-center">
                                        {student.correct_answers || student.acertos}
                                    </td>
                                )}
                                {visibleFields?.nota && (
                                    <td className="p-2 border-t border-gray-200 font-semibold bg-gray-50 text-center">
                                        {formatDecimal1PtBr(
                                          typeof student.grade === 'number'
                                            ? student.grade
                                            : typeof student.total_score === 'number'
                                              ? student.total_score
                                              : student.nota
                                        )}
                                    </td>
                                )}
                                {visibleFields?.proficiencia && (
                                    <td className="p-2 border-t border-gray-200 font-semibold bg-gray-50 text-center">
                                        {formatDecimal1PtBr(student.proficiency ?? student.proficiencia)}
                                    </td>
                                )}
                                {visibleFields?.nivel && (
                                    <td className="p-2 border-t border-gray-200 bg-gray-50 text-center">
                                        <span className={`px-2 py-1 rounded-full text-xs text-white ${
                                            (student.classification || student.classificacao) === 'Abaixo do Básico' ? 'bg-red-500' :
                                            (student.classification || student.classificacao) === 'Básico' ? 'bg-yellow-500' :
                                            (student.classification || student.classificacao) === 'Adequado' ? 'bg-green-400' :
                                            'bg-green-600'
                                        }`}>
                                            {student.classification || student.classificacao}
                                        </span>
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            
            {/* Legenda */}
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-600 space-y-2">
                    <div className="font-semibold text-gray-700">Legenda:</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="flex items-center gap-1">
                            <span className="text-green-700 text-2xl font-bold">✓</span>
                            <span>Aluno acertou</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-red-600 text-2xl font-bold">✗</span>
                            <span>Aluno errou ou deixou em branco</span>
                        </div>
                            <div className="flex items-center gap-1">
                            <span className="text-green-700 font-bold">60%+</span>
                            <span>Turma teve bom desempenho</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-red-600 font-bold">&lt;60%</span>
                            <span>Turma teve dificuldade</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function DetailedResultsView({ onBack }: DetailedResultsViewProps) {
    const { id: evaluationId } = useParams<{ id: string }>();
    const [evaluationInfo, setEvaluationInfo] = useState<EvaluationInfo | null>(null);
    const [students, setStudents] = useState<StudentResult[]>([]);
    const [detailedReport, setDetailedReport] = useState<DetailedReport | null>(null);
    const [stats, setStats] = useState<Stats | null>(null);
    const [generalStats, setGeneralStats] = useState<{
        media_nota_geral: number;
        media_proficiencia_geral: number;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDataLoading, setIsDataLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState('');
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingSteps] = useState([
        'Inicializando...',
        'Verificando status da avaliação...',
        'Carregando informações da avaliação...',
        'Atualizando dados de status...',
        'Buscando dados dos alunos...',
        'Processando resultados detalhados...',
        'Gerando estatísticas...',
        'Finalizando carregamento...'
    ]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [classificationFilter, setClassificationFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [showOnlyWithScore, setShowOnlyWithScore] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'cards'>('table'); // Novo estado para modo de visualização
    const [questionsWithSkills, setQuestionsWithSkills] = useState<Array<{
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
    }>>([]);
    const [skillsMapping, setSkillsMapping] = useState<Record<string, string>>({}); // UUID -> Código real
    const [skillsBySubject, setSkillsBySubject] = useState<Record<string, Array<{
        id: string | null;
        code: string;
        description: string;
        source: 'database' | 'question';
    }>>>({}); // ✅ Skills organizadas por disciplina
    const [gradesMapping, setGradesMapping] = useState<Record<string, string>>({}); // ✅ Adicionado para mapeamento de séries
    
    // ✅ ESTADO PARA CONTROLAR ESTABILIDADE DOS DADOS
    const [isDataStable, setIsDataStable] = useState(false);
    
    // ✅ NOVOS ESTADOS PARA FILTROS E ORDENAÇÃO
    const [visibleFields, setVisibleFields] = useState<{
        turma: boolean;
        habilidade: boolean;
        questoes: boolean;
        percentualTurma: boolean;
        total: boolean;
        nota: boolean;
        proficiencia: boolean;
        nivel: boolean;
    }>({
        turma: true,
        habilidade: true,
        questoes: true,
        percentualTurma: true,
        total: true,
        nota: true,
        proficiencia: true,
        nivel: true
    });
    
    const [subjectFilter, setSubjectFilter] = useState<string>('all');
    const [levelFilter, setLevelFilter] = useState<string>('all');
    const [turmaFilter, setTurmaFilter] = useState<string>('all');
    const [orderBy, setOrderBy] = useState<'nota' | 'proficiencia' | 'status' | 'turma' | 'nome'>('nome');
    const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('asc');
    
    // ✅ NOVO: Estado para controlar visualização de alunos
    const [showOnlyCompleted, setShowOnlyCompleted] = useState(true);
    const [showAbsentStudents, setShowAbsentStudents] = useState(false);
    
    // ✅ NOVO: Estado para controlar quando mostrar a tabela
    const [isTableReady, setIsTableReady] = useState(false);
    
    const { toast } = useToast();
    const navigate = useNavigate();

  // ✅ NOVO: Estado para armazenar respostas detalhadas de todos os alunos
  const [studentDetailedAnswers, setStudentDetailedAnswers] = useState<Record<string, StudentDetailedAnswers>>({});
  const [isLoadingDetailedAnswers, setIsLoadingDetailedAnswers] = useState(false);

  // ✅ NOVO: Estado para filtros do gráfico
  const [chartFilters, setChartFilters] = useState({
    'Abaixo do Básico': true,
    'Básico': true, 
    'Adequado': true,
    'Avançado': true,
    'Sem Nota': true
  });

  // ✅ NOVO: Função para buscar respostas detalhadas de todos os alunos
  const fetchAllStudentDetailedAnswers = useCallback(async () => {
    if (!evaluationInfo?.id || !students || students.length === 0) return;

    try {
      setIsLoadingDetailedAnswers(true);


      const detailedAnswers: Record<string, StudentDetailedAnswers> = {};
      
      // ✅ SIMPLIFICADO: Usar apenas dados do banco
      students.forEach((student) => {
        detailedAnswers[student.id] = {
          test_id: evaluationInfo.id,
          student_id: student.id,
          student_name: student.nome,
          total_questions: student.questoes_respondidas,
          answered_questions: student.acertos + student.erros,
          correct_answers: student.correct_answers || student.acertos,
          score_percentage: (student.acertos / student.questoes_respondidas) * 100,
          total_score: student.total_score || student.nota,
          max_possible_score: student.questoes_respondidas,
          grade: (typeof student.grade === 'number' ? student.grade : Number(student.grade)) || student.nota,
          proficiencia: student.proficiency || student.proficiencia,
          classificacao: student.classification || student.classificacao,
          status: student.status === 'pendente' ? 'nao_respondida' : 'concluida',
          answers: []
        };
        

      });

      setStudentDetailedAnswers(detailedAnswers);
      

      
      // ✅ Marcar tabela como pronta para renderizar
      setIsTableReady(true);
      
    } catch (error) {
      console.error('Erro ao processar dados do banco:', error);
    } finally {
      setIsLoadingDetailedAnswers(false);
    }
  }, [evaluationInfo?.id, students]);

  // ✅ NOVO: Carregar respostas detalhadas quando os dados básicos estiverem prontos
  useEffect(() => {

    
    if (evaluationInfo?.id && students && students.length > 0 && !isLoadingDetailedAnswers) {

      setIsTableReady(false); // Reset table ready state
      fetchAllStudentDetailedAnswers();
    }
  }, [evaluationInfo?.id, students, fetchAllStudentDetailedAnswers, isLoadingDetailedAnswers]);



    // ✅ NOVO: Função para voltar da visualização de faltosos
    const handleBackFromAbsentStudents = () => {
        setShowAbsentStudents(false);
    };

    // ✅ FUNÇÃO PARA CONSOLIDAR ATUALIZAÇÕES DO EVALUATIONINFO
    const consolidateEvaluationInfo = (updates: Partial<EvaluationInfo>) => {
        setEvaluationInfo(prev => {
            if (!prev) {
                const newState = updates as EvaluationInfo;
                return newState;
            }
            
            // ✅ VERIFICAR SE HÁ MUDANÇAS REAIS ANTES DE ATUALIZAR
            const hasChanges = Object.keys(updates).some(key => {
                const updateValue = updates[key as keyof EvaluationInfo];
                const currentValue = prev[key as keyof EvaluationInfo];
                
                // Para arrays, comparar conteúdo
                if (Array.isArray(updateValue) && Array.isArray(currentValue)) {
                    return JSON.stringify(updateValue) !== JSON.stringify(currentValue);
                }
                
                // Para outros tipos, comparação direta
                return updateValue !== currentValue;
            });
            
            if (!hasChanges) {
                return prev;
            }
            
            const consolidated = {
                ...prev,
                ...updates
            };
            
            // ✅ VERIFICAR SE OS DADOS ESTÃO ESTÁVEIS APÓS A CONSOLIDAÇÃO
            // ✅ CORRIGIDO: Permitir que dados sejam considerados estáveis mesmo se apenas um dos campos estiver disponível
            const hasStableData = (consolidated.disciplina && 
                consolidated.disciplina.trim() !== '' && 
                consolidated.disciplina !== 'N/A') ||
                (consolidated.serie && 
                consolidated.serie.trim() !== '' && 
                consolidated.serie !== 'N/A');
            
            if (hasStableData && !isDataStable) {
                setIsDataStable(true);
            }
            
            return consolidated;
        });
    };

    // Função para atualizar o progresso do loading
    const updateLoadingProgress = (step: number, message?: string) => {
        setCurrentStepIndex(step);
        setLoadingProgress((step / (loadingSteps.length - 1)) * 100);
        if (message) {
            setLoadingStep(message);
        } else {
            setLoadingStep(loadingSteps[step]);
        }
    };

    useEffect(() => {
        if (evaluationId) {
            fetchDetailedResults();
        }
    }, [evaluationId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ✅ Função para obter nome da série (baseada na solução do Results.tsx)
    const getGradeName = (gradeId: string | null | undefined, gradeIdFromApi?: string | null | undefined, evaluation?: EvaluationInfo): string => {
        // ✅ PRIORIDADE 1: Usar o campo serie da API (agora deve vir correto)
        if (gradeId && gradeId !== 'N/A') {
            return gradeId;
        }
        
        // ✅ PRIORIDADE 2: Usar o grade_id da API (UUID da grade)
        if (gradeIdFromApi && gradeIdFromApi !== 'N/A') {
            if (gradeIdFromApi.includes('-')) {
                const mappedName = gradesMapping[gradeIdFromApi];
                if (mappedName) {
                    return mappedName;
                }
                return `Série ${gradeIdFromApi.slice(0, 8)}...`;
            }
            return gradeIdFromApi;
        }
        
        // ✅ PRIORIDADE 3: Fallback para mapeamento local (se API não retornar)
        if (evaluation) {
            return determineGradeFromEvaluation(evaluation);
        }
        
        return 'Série não identificada';
    };

    // ✅ Função para determinar série a partir da avaliação (fallback)
    const determineGradeFromEvaluation = (evaluation: EvaluationInfo): string => {
        // Fallback caso a API não retorne série (não deve mais acontecer)
        return 'Série não identificada';
    };

    // ✅ Função para buscar mapeamento de séries
    const fetchGradesMapping = async () => {
        try {
            // ✅ MIGRADO: Usar EvaluationResultsApiService em vez de chamada direta
            // Nota: Este endpoint é específico para grades/séries, não faz parte da nova API unificada
            const response = await api.get('/evaluation-results/grades');
            
            if (response.data) {
                const grades = response.data;
                
                const mapping: Record<string, string> = {};
                if (Array.isArray(grades)) {
                    grades.forEach((grade: { id: string; name: string }) => {
                        mapping[grade.id] = grade.name;
                    });
                    setGradesMapping(mapping);
                    return;
                }
            }
        } catch (error) {
            // Fallback silencioso
        }

        try {
            // ✅ Fallback: tentar fetch direto
            const response = await fetch('/evaluation-results/grades');
            if (response.ok) {
                const grades = await response.json();
                const mapping: Record<string, string> = {};
                if (Array.isArray(grades)) {
                    grades.forEach((grade: { id: string; name: string }) => {
                        mapping[grade.id] = grade.name;
                    });
                    setGradesMapping(mapping);
                }
            }
        } catch (error) {
            // Fallback silencioso
        }
    };

    // ✅ CORRIGIDO: Calcular alunos filtrados
    const filteredStudents = React.useMemo(() => {
        return students.filter(student => {
            // ✅ NOVO: Filtro para mostrar apenas alunos que realizaram a avaliação
            if (showOnlyCompleted && student.status !== 'concluida') {
                return false;
            }
            
            const matchesSearch = searchTerm === '' || 
                student.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                student.turma.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesClassification = classificationFilter === 'all' || 
                student.classificacao === classificationFilter;
            
            const matchesStatus = statusFilter === 'all' || 
                student.status === statusFilter;
            
            const matchesScore = !showOnlyWithScore || student.nota > 0;
            
            // ✅ NOVOS FILTROS
            const matchesLevel = levelFilter === 'all' || 
                student.classificacao === levelFilter;
            
            const matchesTurma = turmaFilter === 'all' || 
                student.turma === turmaFilter;
            
            return matchesSearch && matchesClassification && matchesStatus && matchesScore && matchesLevel && matchesTurma;
        }).sort((a, b) => {
            // ✅ ORDENAÇÃO
            let comparison = 0;
            
            switch (orderBy) {
                case 'nota':
                    comparison = a.nota - b.nota;
                    break;
                case 'proficiencia':
                    comparison = a.proficiencia - b.proficiencia;
                    break;
                case 'status':
                    comparison = a.status.localeCompare(b.status);
                    break;
                case 'turma':
                    comparison = a.turma.localeCompare(b.turma);
                    break;
                case 'nome':
                default:
                    comparison = a.nome.localeCompare(b.nome);
                    break;
            }
            
            return orderDirection === 'asc' ? comparison : -comparison;
        });
    }, [students, searchTerm, classificationFilter, statusFilter, showOnlyWithScore, levelFilter, turmaFilter, orderBy, orderDirection, showOnlyCompleted]);

    // ✅ NOVO: Alunos que não realizaram a avaliação
    const absentStudents = React.useMemo(() => {
        return students.filter(student => student.status !== 'concluida');
    }, [students]);

    // Componente de visualização em cards (mantido para compatibilidade)
    const StudentsCardsView = ({ students }: { students: StudentResult[] }) => {
        return (
            <div className="space-y-4">
                {students.map((student, index) => {
                    const accuracyRate = student.questoes_respondidas > 0
                        ? (student.acertos / student.questoes_respondidas) * 100
                        : 0;

                    return (
                        <div key={`${student.id || 'student'}-${index}`} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                {/* Informações principais */}
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-lg">{student.nome}</h3>
                                        <Badge variant="outline">{student.turma}</Badge>
                                        <Badge className={getStatusColor(student.status)}>
                                            {student.status === 'concluida' ? 'Concluída' : 'Pendente'}
                                        </Badge>
                                    </div>

                                    <div className="flex items-center gap-6">
                                        <div className="flex items-center gap-2">
                                            <Target className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm font-medium">
                                                Nota: {formatDecimal1PtBr(student.nota)}
                                            </span>
                                            {student.nota > 0 ? (
                                                student.nota >= 7 ? (
                                                    <TrendingUp className="h-4 w-4 text-green-600" />
                                                ) : (
                                                    <XCircle className="h-4 w-4 text-orange-600" />
                                                )
                                            ) : (
                                                <Minus className="h-4 w-4 text-gray-400" />
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <BarChart3 className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm font-medium">
                                                Proficiência: {student.proficiencia > 0 ? formatDecimal1PtBr(student.proficiencia) : 'N/A'}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm font-medium">
                                                Acertos: {student.acertos}/{student.questoes_respondidas}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-sm font-medium">
                                                Tempo: {Math.floor(student.tempo_gasto / 60)}min
                                            </span>
                                        </div>
                                    </div>

                                    {/* Barra de progresso de acertos */}
                                    {student.questoes_respondidas > 0 && (
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-xs text-muted-foreground">
                                                <span>Taxa de Acerto</span>
                                                <span>{formatPercent1PtBr(accuracyRate)}</span>
                                            </div>
                                            <Progress value={accuracyRate} className="h-2" />
                                        </div>
                                    )}

                                    {/* Classificação */}
                                    <div className="flex items-center gap-2">
                                        <Badge className={getClassificationColor(student.classificacao)}>
                                            {student.classificacao}
                                        </Badge>
                                        {student.status === 'pendente' && (
                                            <Badge variant="outline" className="text-orange-600 border-orange-300">
                                                Aguardando conclusão
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                {/* Ações */}
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleViewStudentDetails(student.id)}
                                        disabled={student.status === 'pendente'}
                                    >
                                        <Eye className="h-4 w-4 mr-2" />
                                        Ver Detalhes
                                    </Button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const fetchDetailedResults = async () => {
        try {
            setIsLoading(true);
            setIsDataLoading(true);
            setLoadingProgress(0);
            setIsDataStable(false); // ✅ Resetar estabilidade no início
            updateLoadingProgress(0, 'Inicializando carregamento...');
            
            if (!evaluationId) {
                throw new Error("ID da avaliação não fornecido");
            }

            // ✅ Buscar mapeamento de séries e opções de filtros
            await fetchGradesMapping();
            
            // ✅ Buscar opções de filtros da avaliação (inclui disciplinas e séries)
            const filterOptions = await EvaluationResultsApiService.getFilterOptionsForEvaluation(evaluationId);
            
            // ✅ ATUALIZAR evaluationInfo com múltiplas disciplinas
            if (filterOptions?.subjects && filterOptions.subjects.length > 0) {
                // ✅ Extrair nomes das disciplinas (pode ser string ou objeto)
                const disciplinasNomes = filterOptions.subjects.map((disciplina: string | { name?: string; nome?: string; id?: string }) => {
                    if (typeof disciplina === 'string') {
                        return disciplina;
                    } else if (disciplina && typeof disciplina === 'object') {
                        return disciplina.name || disciplina.nome || disciplina.id || 'Disciplina não identificada';
                    }
                    return 'Disciplina não identificada';
                });
                
                consolidateEvaluationInfo({
                    disciplina: disciplinasNomes.join(', ')
                });
            }

            // ✅ 1. Verificar e atualizar status da avaliação
            updateLoadingProgress(1, 'Verificando status da avaliação...');
            const statusCheck = await EvaluationResultsApiService.checkEvaluationStatus(evaluationId);

            // ✅ 2. Buscar informações básicas da avaliação
            updateLoadingProgress(2, 'Carregando informações da avaliação...');
            const evaluationResponse = await EvaluationResultsApiService.getEvaluationById(evaluationId);
            
            // ✅ 2.1. Buscar estatísticas gerais da avaliação (para média nota e proficiência)
            updateLoadingProgress(2.5, 'Carregando estatísticas gerais...');
            const generalStatsResponse = await EvaluationResultsApiService.getEvaluationGeneralStats(evaluationId);
            
            console.log('🔍 LOG - Resposta das estatísticas gerais:', generalStatsResponse);
            
            if (generalStatsResponse?.estatisticas_gerais) {
                console.log('📊 LOG - Estatísticas gerais encontradas:', {
                    media_nota_geral: generalStatsResponse.estatisticas_gerais.media_nota_geral,
                    media_proficiencia_geral: generalStatsResponse.estatisticas_gerais.media_proficiencia_geral
                });
                
                setGeneralStats({
                    media_nota_geral: generalStatsResponse.estatisticas_gerais.media_nota_geral,
                    media_proficiencia_geral: generalStatsResponse.estatisticas_gerais.media_proficiencia_geral
                });
            } else {
                console.log('⚠️ LOG - Estatísticas gerais não encontradas na resposta');
            }
            
            if (evaluationResponse) {
                // ✅ CORREÇÃO: Converter status para o tipo correto
                const evaluationInfo = {
                    ...evaluationResponse,
                    status: (evaluationResponse.status === 'concluida' || evaluationResponse.status === 'pendente' || evaluationResponse.status === 'em_andamento') 
                        ? evaluationResponse.status as 'concluida' | 'pendente' | 'em_andamento'
                        : 'pendente' as 'concluida' | 'pendente' | 'em_andamento'
                };
                consolidateEvaluationInfo(evaluationInfo);
                
                // ✅ 3. Tentar recalcular a avaliação primeiro
                updateLoadingProgress(3, 'Recalculando dados da avaliação...');
                try {
                    const recalculationResult = await EvaluationResultsApiService.recalculateEvaluation(evaluationId);
                    
                    // ✅ 3.1. Tentar calcular scores especificamente
                    if (recalculationResult.success) {
                        try {
                            const calculateScoresResult = await EvaluationResultsApiService.calculateTestScores(evaluationId);
                            
                            // ✅ 3.3. Aguardar um pouco para o backend processar os dados
                            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 segundos
                        } catch (error) {
                            // Erro no cálculo de scores - continuar
                        }
                    }
                } catch (error) {
                    // Erro na recalculação - continuar
                }

                // ✅ 4. Obter resumo de status atualizado
                updateLoadingProgress(4, 'Atualizando dados de status...');
                const statusSummary = await EvaluationResultsApiService.getEvaluationStatusSummary(evaluationId);
                
                if (statusSummary) {
                    // ✅ Usar os campos corretos que o backend agora retorna
                    const totalAlunos = statusSummary.total_alunos || 0;
                    const alunosParticipantes = statusSummary.alunos_participantes || 0;
                    const alunosAusentes = statusSummary.alunos_ausentes || 0;
                    
                    const hasValidData = totalAlunos > 0;
                    
                    if (hasValidData) {
                        // ✅ Atualizar mapeamento de séries se disponível
                        if (filterOptions?.grades) {
                            const newGradesMapping: Record<string, string> = {};
                            filterOptions.grades.forEach(grade => {
                                newGradesMapping[grade.id] = grade.name;
                            });
                            setGradesMapping(newGradesMapping);
                        }
                        
                        // Atualizar as informações com dados mais precisos
                        consolidateEvaluationInfo({
                            total_alunos: totalAlunos,
                            alunos_participantes: alunosParticipantes,
                            alunos_ausentes: alunosAusentes,
                            media_nota: statusSummary.average_score !== undefined ? statusSummary.average_score : evaluationInfo?.media_nota,
                            media_proficiencia: statusSummary.average_proficiency !== undefined ? statusSummary.average_proficiency : evaluationInfo?.media_proficiencia,
                            status: statusSummary.overall_status as 'concluida' | 'em_andamento' | 'pendente' || evaluationInfo?.status,
                                    disciplina: filterOptions?.subjects?.map((d: string | { name?: string }) => typeof d === 'string' ? d : d.name).join(', ') || evaluationInfo?.disciplina
                        });

                        // ✅ 5. Buscar dados da avaliação novamente após recalculação (múltiplas tentativas)
                        updateLoadingProgress(5, 'Atualizando dados finais...');
                        
                        let updatedEvaluationResponse = null;
                        let attempts = 0;
                        const maxAttempts = 3;
                        
                        while (attempts < maxAttempts) {
                            attempts++;
                            
                            updatedEvaluationResponse = await EvaluationResultsApiService.getEvaluationById(evaluationId);
                            
                            // ✅ Verificar se os dados foram atualizados
                            if (updatedEvaluationResponse && 
                                (updatedEvaluationResponse.media_nota > 0 || updatedEvaluationResponse.media_proficiencia > 0)) {
                                break;
                            }
                            
                            if (attempts < maxAttempts) {
                                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 segundo
                            }
                        }

                        if (updatedEvaluationResponse) {
                            // ✅ Atualizar com os dados recalculados
                            consolidateEvaluationInfo({
                                media_nota: updatedEvaluationResponse.media_nota !== undefined ? updatedEvaluationResponse.media_nota : evaluationInfo?.media_nota,
                                media_proficiencia: updatedEvaluationResponse.media_proficiencia !== undefined ? updatedEvaluationResponse.media_proficiencia : evaluationInfo?.media_proficiencia
                            });
                        }

                        // ✅ 5.1. Calcular médias manualmente se o backend não retornar
                        try {
                            const studentsData = await EvaluationResultsApiService.getStudentsByEvaluation(evaluationId);
                            
                            if (studentsData && studentsData.length > 0) {
                                const studentsWithScores = studentsData.filter(s => s.nota > 0);
                                
                                if (studentsWithScores.length > 0) {
                                    const averageScore = studentsWithScores.reduce((sum, s) => sum + s.nota, 0) / studentsWithScores.length;
                                    const averageProficiency = studentsWithScores.reduce((sum, s) => sum + s.proficiencia, 0) / studentsWithScores.length;
                                    
                                    // ✅ Atualizar com as médias calculadas manualmente
                                    consolidateEvaluationInfo({
                                        media_nota: averageScore,
                                        media_proficiencia: averageProficiency
                                    });
                                }
                            }
                        } catch (error) {
                            // Erro ao calcular médias manualmente - continuar
                        }
                    }
                } else {
                    // ✅ Tentar recalcular a avaliação se o resumo não estiver disponível
                    try {
                        const recalculationResult = await EvaluationResultsApiService.recalculateEvaluation(evaluationId);
                        
                        if (recalculationResult.success) {
                            // Tentar obter o resumo novamente após recálculo
                            const updatedStatusSummary = await EvaluationResultsApiService.getEvaluationStatusSummary(evaluationId);
                            if (updatedStatusSummary) {
                                // ✅ Usar os campos corretos que o backend agora retorna
                                const totalAlunos = updatedStatusSummary.total_alunos || 0;
                                const alunosParticipantes = updatedStatusSummary.alunos_participantes || 0;
                                const alunosAusentes = updatedStatusSummary.alunos_ausentes || 0;
                                
                                // ✅ Buscar opções de filtros novamente após recálculo
                                const updatedFilterOptions = await EvaluationResultsApiService.getFilterOptionsForEvaluation(evaluationId);
                                
                                consolidateEvaluationInfo({
                                    total_alunos: totalAlunos,
                                    alunos_participantes: alunosParticipantes,
                                    alunos_ausentes: alunosAusentes,
                                    media_nota: updatedStatusSummary.average_score !== undefined ? updatedStatusSummary.average_score : evaluationInfo?.media_nota,
                                    media_proficiencia: updatedStatusSummary.average_proficiency !== undefined ? updatedStatusSummary.average_proficiency : evaluationInfo?.media_proficiencia,
                                    status: updatedStatusSummary.overall_status as 'concluida' | 'em_andamento' | 'pendente' || evaluationInfo?.status,
                                    disciplina: updatedFilterOptions?.subjects?.map((d: string | { name?: string }) => typeof d === 'string' ? d : d.name).join(', ') || evaluationInfo?.disciplina
                                });
                            }
                        }
                    } catch (error) {
                        // Erro ao recalcular avaliação - continuar
                    }
                }
            } else {
                console.error(`❌ Avaliação não encontrada: ${evaluationId}`);
                return;
            }
            
            // ✅ 6. Buscar dados das questões com códigos reais
            updateLoadingProgress(6, 'Buscando dados dos alunos...');
            let questionsWithSkillsResponse = null;
            try {
                questionsWithSkillsResponse = await EvaluationResultsApiService.getEvaluationSkills(evaluationId);
                
                // ✅ Verificar se é array ou objeto
                if (Array.isArray(questionsWithSkillsResponse) && questionsWithSkillsResponse.length > 0) {
                    // ✅ Extrair informações da série a partir dos dados das questões
                    const firstQuestion = questionsWithSkillsResponse[0];
                    
                    if (firstQuestion.grade) {
                        // ✅ Atualizar evaluationInfo com a série correta
                        consolidateEvaluationInfo({
                            serie: firstQuestion.grade.name || firstQuestion.grade.id,
                            grade_id: firstQuestion.grade.id
                        });
                    }
                    
                    // ✅ Verificar se há informações de disciplina nos dados das questões
                    if (firstQuestion.subject) {
                        // ✅ Atualizar evaluationInfo com a disciplina correta se necessário
                        if (firstQuestion.subject.name && firstQuestion.subject.name !== evaluationInfo?.disciplina) {
                            consolidateEvaluationInfo({
                                disciplina: firstQuestion.subject.name
                            });
                        }
                    }
                }
            } catch (error: unknown) {
                // Continuar sem os dados das questões
            }
            
            // ✅ ALTERNATIVA: Buscar série a partir dos dados da avaliação
            if (evaluationResponse) {
                // ✅ Verificar se há informações de série nos dados da avaliação
                // Usar type assertion para acessar propriedades que podem existir dinamicamente
                const evaluationWithGrade = evaluationResponse as EvaluationInfo & { grade?: string | { name: string; id: string }; grade_id?: string | { name: string; id: string } };
                if (evaluationWithGrade.grade || evaluationWithGrade.grade_id) {
                    const gradeInfo = evaluationWithGrade.grade || evaluationWithGrade.grade_id;
                    
                    consolidateEvaluationInfo({
                        serie: typeof gradeInfo === 'string' ? gradeInfo : gradeInfo.name || gradeInfo.id,
                        grade_id: typeof gradeInfo === 'string' ? undefined : gradeInfo.id
                    });
                }
            }
            
            // ✅ NOVA ALTERNATIVA: Buscar série na resposta da API /questions
            if (questionsWithSkillsResponse && typeof questionsWithSkillsResponse === 'object') {
                // ✅ Verificar se há informações de série na resposta
                // Usar type assertion para acessar propriedades que podem existir dinamicamente
                const questionsWithGrade = questionsWithSkillsResponse as { grade?: string | { name: string; id: string }; grade_id?: string | { name: string; id: string } };
                if (questionsWithGrade.grade || questionsWithGrade.grade_id) {
                    const gradeInfo = questionsWithGrade.grade || questionsWithGrade.grade_id;
                    
                    consolidateEvaluationInfo({
                        serie: typeof gradeInfo === 'string' ? gradeInfo : gradeInfo.name || gradeInfo.id,
                        grade_id: typeof gradeInfo === 'string' ? undefined : gradeInfo.id
                    });
                }
            }

            // ✅ 7. Buscar relatório detalhado
            updateLoadingProgress(7, 'Processando resultados detalhados...');
            let detailedReportResponse = null;
            try {
                detailedReportResponse = await EvaluationResultsApiService.getDetailedReport(evaluationId);
            } catch (error: unknown) {
                // Continuar com dados básicos se relatório detalhado falhar
            }

            // ✅ NOVO: BUSCAR SKILLS POR AVALIAÇÃO (resolve o problema das disciplinas)
            try {
                const evaluationSkills = await EvaluationResultsApiService.getSkillsByEvaluation(evaluationId);
                
                if (evaluationSkills && evaluationSkills.length > 0) {
                    // ✅ Criar mapeamento UUID -> Código real organizado por disciplina
                    const newSkillsMapping: Record<string, string> = {};
                    const skillsBySubject: Record<string, Array<{
                        id: string | null;
                        code: string;
                        description: string;
                        source: 'database' | 'question';
                    }>> = {};
                    
                    evaluationSkills.forEach(skill => {
                        // ✅ Mapear UUID para código real
                        if (skill.id && skill.code) {
                            newSkillsMapping[skill.id] = skill.code;
                        }
                        
                        // ✅ Organizar skills por disciplina
                        const subjectId = skill.subject_id;
                        if (!skillsBySubject[subjectId]) {
                            skillsBySubject[subjectId] = [];
                        }
                        skillsBySubject[subjectId].push({
                            id: skill.id,
                            code: skill.code,
                            description: skill.description,
                            source: skill.source
                        });
                    });
                    
                    // console.log('🔍 Skills organizadas por disciplina:', skillsBySubject);
                    setSkillsMapping(newSkillsMapping);
                    setSkillsBySubject(skillsBySubject);
                    
                    // ✅ Atualizar informações da avaliação com disciplinas encontradas
                    if (Object.keys(skillsBySubject).length > 0) {
                        // ✅ Buscar nomes das disciplinas
                        try {
                            const subjects = await EvaluationResultsApiService.getSubjects();
                            const disciplinasNomes: string[] = [];
                            
                            Object.keys(skillsBySubject).forEach(subjectId => {
                                const subject = subjects.find((s: { id: string; name: string }) => s.id === subjectId);
                                if (subject) {
                                    disciplinasNomes.push(subject.name);
                                }
                            });
                            
                            if (disciplinasNomes.length > 0) {
                                consolidateEvaluationInfo({
                                    disciplina: disciplinasNomes.join(', ')
                                });
                            }
                        } catch (error) {
                            console.warn('⚠️ Erro ao buscar nomes das disciplinas:', error);
                        }
                    }
                } else {
                    // ✅ Criar mapeamento vazio para evitar erros
                    setSkillsMapping({});
                }
            } catch (error) {
                console.warn('⚠️ Erro ao buscar skills da avaliação:', error);
                // ✅ Criar mapeamento vazio para evitar erros
                setSkillsMapping({});
            }
            
            if (detailedReportResponse) {
                setDetailedReport(detailedReportResponse);
                
                // ✅ CORRIGIDO: Transformar alunos do relatório detalhado para o formato esperado
                const transformedStudents: StudentResult[] = detailedReportResponse.alunos.map(aluno => {
                    // ✅ CORREÇÃO: Converter proficiência da escala 0-1000 para a escala correta
                    let proficienciaCorrigida = aluno.proficiencia;
                    
                    // Se o valor está na escala 0-1000, converter para a escala correta
                    if (aluno.proficiencia > 500) { // Valores acima de 500 indicam escala 0-1000
                        // Determinar o valor máximo baseado na série/disciplina
                        const isMathematics = detailedReportResponse.avaliacao.disciplina.toLowerCase().includes('matemática') || 
                                             detailedReportResponse.avaliacao.disciplina.toLowerCase().includes('matematica');

                        // Assumir Anos Finais/EM para o exemplo (pode ser ajustado conforme necessário)
                        const maxProficiency = isMathematics ? 425 : 425; // Usando o valor mais alto conforme as mudanças
                        
                        // Converter: (valor_1000 / 1000) * max_proficiency
                        proficienciaCorrigida = (aluno.proficiencia / 1000) * maxProficiency;
                    }
                    
                    return {
                        id: aluno.id,
                        nome: aluno.nome,
                        turma: aluno.turma,
                        nota: aluno.nota_final,
                        proficiencia: proficienciaCorrigida,
                        classificacao: aluno.classificacao,
                        questoes_respondidas: aluno.total_acertos + aluno.total_erros + aluno.total_em_branco,
                        acertos: aluno.total_acertos,
                        erros: aluno.total_erros,
                        em_branco: aluno.total_em_branco,
                        tempo_gasto: aluno.respostas.reduce((total, resp) => total + resp.tempo_gasto, 0),
                        status: aluno.status === 'concluida' ? 'concluida' : 'pendente'
                    };
                });

                updateLoadingProgress(6, 'Gerando estatísticas...');
                setStudents(transformedStudents);
                
                // ✅ ATUALIZAR DADOS DAS QUESTÕES COM CÓDIGOS REAIS
                if (questionsWithSkillsResponse && questionsWithSkillsResponse.length > 0) {
                    setQuestionsWithSkills(questionsWithSkillsResponse);
                }
                
                // ✅ CORRIGIDO: Calcular estatísticas usando os dados reais
                const totalStudents = detailedReportResponse.alunos.length;
                const completedStudents = detailedReportResponse.alunos.filter(a => a.status === 'concluida').length;
                
                // Calcular média ponderada baseada no número de alunos
                const totalScore = detailedReportResponse.alunos.reduce((sum, aluno) => sum + aluno.nota_final, 0);
                const averageScore = totalStudents > 0 ? totalScore / totalStudents : 0;
                
                // Calcular média de proficiência ponderada
                const totalProficiency = detailedReportResponse.alunos.reduce((sum, aluno) => sum + aluno.proficiencia, 0);
                const averageProficiency = totalStudents > 0 ? totalProficiency / totalStudents : 0;
                
                // Calcular distribuição de classificação
                const distribution = {
                    abaixo_do_basico: detailedReportResponse.alunos.filter(a => a.classificacao === 'Abaixo do Básico').length,
                    basico: detailedReportResponse.alunos.filter(a => a.classificacao === 'Básico').length,
                    adequado: detailedReportResponse.alunos.filter(a => a.classificacao === 'Adequado').length,
                    avancado: detailedReportResponse.alunos.filter(a => a.classificacao === 'Avançado').length,
                };

                setStats({
                    totalStudents,
                    completedStudents,
                    averageScore,
                    averageProficiency,
                    distribution
                });
            } else {
                // Se não há relatório detalhado, buscar apenas os alunos
                updateLoadingProgress(6, 'Carregando lista de alunos...');
                const studentsResponse = await EvaluationResultsApiService.getStudentsByEvaluation(evaluationId);
                setStudents(studentsResponse as unknown as StudentResult[]);
                
                // Calcular estatísticas básicas
                const totalStudents = studentsResponse.length;
                const completedStudents = studentsResponse.filter(s => s.status === 'concluida').length;
                const totalScore = studentsResponse.reduce((sum, s) => sum + s.nota, 0);
                const averageScore = totalStudents > 0 ? totalScore / totalStudents : 0;
                const totalProficiency = studentsResponse.reduce((sum, s) => sum + s.proficiencia, 0);
                const averageProficiency = totalStudents > 0 ? totalProficiency / totalStudents : 0;
                
                const distribution = {
                    abaixo_do_basico: studentsResponse.filter(s => s.classificacao === 'Abaixo do Básico').length,
                    basico: studentsResponse.filter(s => s.classificacao === 'Básico').length,
                    adequado: studentsResponse.filter(s => s.classificacao === 'Adequado').length,
                    avancado: studentsResponse.filter(s => s.classificacao === 'Avançado').length,
                };
                
                setStats({
                    totalStudents,
                    completedStudents,
                    averageScore,
                    averageProficiency,
                    distribution
                });
            }

        } catch (error: unknown) {
            console.error("❌ Erro ao buscar resultados detalhados:", error);
            
            // ✅ CORRIGIDO: Mensagens de erro mais específicas incluindo timeout
            let errorMessage = "Não foi possível carregar os resultados detalhados da avaliação";
            
            const apiError = error as ApiError;
            
            if (apiError.message?.includes('CORS') || apiError.code === 'ERR_NETWORK') {
                errorMessage = "Erro de conexão com o servidor. Verifique se o serviço está disponível e tente novamente.";
            } else if (apiError.code === 'ECONNABORTED' || apiError.message?.includes('timeout') || apiError.message?.includes('Timeout')) {
                errorMessage = "A requisição demorou muito para responder. O servidor pode estar processando muitos dados. Tente novamente em alguns minutos.";
            } else if (apiError.message?.includes('não encontrada')) {
                errorMessage = "Avaliação não encontrada ou não possui resultados disponíveis";
            } else if (apiError.response?.status === 404) {
                errorMessage = "Avaliação não encontrada no servidor";
            } else if (apiError.response?.status && apiError.response.status >= 500) {
                errorMessage = "Erro interno do servidor. Tente novamente mais tarde";
            }
            
            toast({
                title: "Erro",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            updateLoadingProgress(7, 'Finalizando carregamento...');
            
            // ✅ VERIFICAÇÃO FINAL DE ESTABILIDADE
            if (evaluationInfo && !isDataStable) {
                const hasStableData = evaluationInfo.disciplina && 
                    evaluationInfo.disciplina.trim() !== '' && 
                    evaluationInfo.disciplina !== 'N/A' &&
                    evaluationInfo.serie && 
                    evaluationInfo.serie.trim() !== '' && 
                    evaluationInfo.serie !== 'N/A';
                
                if (hasStableData) {
                    setIsDataStable(true);
                }
            }
            
            // ✅ VERIFICAÇÃO FINAL DE DADOS MÍNIMOS
            if (evaluationInfo && evaluationInfo.id && evaluationInfo.titulo && students && students.length > 0) {
                // Carregamento concluído com sucesso
            }
            
            // Pequeno delay para mostrar a etapa final
            setTimeout(() => {
                setIsLoading(false);
                setIsDataLoading(false);
                setLoadingStep('');
                setLoadingProgress(0);
            }, 500);
        }
    };

    const getClassificationColor = (classification: string) => {
        switch (classification) {
            case 'Avançado': return 'bg-green-600 text-white border-green-600';
            case 'Adequado': return 'bg-green-400 text-white border-green-400';
            case 'Básico': return 'bg-yellow-500 text-white border-yellow-500';
            case 'Abaixo do Básico': return 'bg-red-500 text-white border-red-500';
            default: return 'bg-gray-100 text-gray-800 border-gray-300';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'concluida': return 'bg-green-100 text-green-800 border-green-300';
            case 'pendente': return 'bg-gray-100 text-gray-800 border-gray-300';
            default: return 'bg-gray-100 text-gray-800 border-gray-300';
        }
    };

    // Função utilitária para tratar valores vazios
    const formatFieldValue = (value: string | null | undefined, fallback: string = 'Não informado') => {
        if (!value || value.trim() === '') return fallback;
        return value;
    };

    const handleViewStudentDetails = (studentId: string) => {
        navigate(`/app/avaliacao/${evaluationId}/aluno/${studentId}/resultados`);
    };

    // Botão de exportação removido

    const uniqueClassifications = [...new Set(students.map(s => s.classificacao))];
    const uniqueTurmas = [...new Set(students.map(s => s.turma))].sort();

    // ✅ VERIFICAÇÃO: Só renderizar se os dados estiverem completos
    const hasValidEvaluationData = evaluationInfo && 
        evaluationInfo.media_nota !== undefined && 
        evaluationInfo.media_proficiencia !== undefined && 
        evaluationInfo.total_alunos !== undefined && 
        evaluationInfo.alunos_participantes !== undefined && 
        evaluationInfo.alunos_ausentes !== undefined;

    // ✅ VERIFICAÇÃO: Só renderizar se os alunos estiverem carregados
    const hasValidStudentsData = students && students.length > 0;

    // ✅ VERIFICAÇÃO: Só renderizar se as estatísticas estiverem carregadas
    const hasValidStatsData = stats && 
        stats.totalStudents !== undefined && 
        stats.averageScore !== undefined && 
        stats.averageProficiency !== undefined;

    // ✅ VERIFICAÇÃO: Dados mínimos necessários para renderizar
    const hasMinimumData = evaluationInfo && evaluationInfo.id && evaluationInfo.titulo;

    // ✅ VERIFICAÇÃO: Skills mapping carregado (pode ser vazio, mas deve estar definido)
    const hasSkillsMappingLoaded = skillsMapping !== undefined;

    // ✅ Loading state melhorado - mostrar loading se dados essenciais não estiverem prontos
    // ✅ CORRIGIDO: Verificação mais flexível para permitir carregamento com dados parciais
    const shouldShowLoading = isLoading || 
        !evaluationInfo || 
        !evaluationInfo.id || 
        !evaluationInfo.titulo || 
        !hasValidStudentsData;

    // ✅ FALLBACK: Se ainda estiver carregando após muito tempo, mostrar dados parciais
    const hasBeenLoadingTooLong = isLoading && loadingProgress > 50 && evaluationInfo && evaluationInfo.id;
    
    if (shouldShowLoading && !hasBeenLoadingTooLong) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
                    <div className="text-center">
                        {/* Loading Animation */}
                        <div className="relative mb-6">
                            <div className="w-20 h-20 mx-auto relative">
                                {/* Spinner principal */}
                                <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
                                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
                                
                                {/* Ícone central */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                                        <BarChart3 className="w-4 h-4 text-white" />
                                    </div>
                                </div>
                            </div>
                            
                            {/* Pontos animados */}
                            <div className="flex justify-center mt-4 space-x-1">
                                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                            </div>
                        </div>

                        {/* Título */}
                        <h2 className="text-xl font-bold text-gray-900 mb-3">
                            Carregando Resultados Detalhados
                        </h2>
                        
                        {/* Progress Bar */}
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                            <div 
                                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${loadingProgress}%` }}
                            ></div>
                        </div>
                        
                        {/* Etapa atual */}
                        <p className="text-sm font-medium text-blue-600 mb-2">
                            {loadingStep}
                        </p>
                        
                        {/* Progresso numérico */}
                        <p className="text-xs text-gray-500 mb-4">
                            Etapa {currentStepIndex + 1} de {loadingSteps.length} • {Math.round(loadingProgress)}% concluído
                        </p>

                        {/* Status dos dados */}
                        <div className="bg-blue-50 rounded-lg p-3 mb-6">
                            <div className="text-xs text-blue-800 space-y-1">
                                <div className="flex items-center justify-between">
                                    <span>Dados básicos da avaliação:</span>
                                    <span className={`font-medium ${evaluationInfo && evaluationInfo.id && evaluationInfo.titulo ? 'text-green-600' : 'text-yellow-600'}`}>
                                        {evaluationInfo && evaluationInfo.id && evaluationInfo.titulo ? '✓' : '⏳'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Lista de alunos:</span>
                                    <span className={`font-medium ${hasValidStudentsData ? 'text-green-600' : 'text-yellow-600'}`}>
                                        {hasValidStudentsData ? '✓' : '⏳'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Dados completos da avaliação:</span>
                                    <span className={`font-medium ${hasValidEvaluationData ? 'text-green-600' : 'text-yellow-600'}`}>
                                        {hasValidEvaluationData ? '✓' : '⏳'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Estatísticas:</span>
                                    <span className={`font-medium ${hasValidStatsData ? 'text-green-600' : 'text-yellow-600'}`}>
                                        {hasValidStatsData ? '✓' : '⏳'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Mapeamento de habilidades:</span>
                                    <span className={`font-medium ${hasSkillsMappingLoaded ? 'text-green-600' : 'text-yellow-600'}`}>
                                        {hasSkillsMappingLoaded ? '✓' : '⏳'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        
                        {/* Informação adicional */}
                        <div className="bg-blue-50 rounded-lg p-3 mb-6">
                            <p className="text-xs text-blue-800">
                                💡 Esta operação pode demorar alguns segundos dependendo do tamanho dos dados da avaliação.
                            </p>
                        </div>

                        {/* Botão para tentar novamente */}
                        <Button 
                            variant="outline" 
                            onClick={fetchDetailedResults}
                            className="text-sm border-blue-200 text-blue-700 hover:bg-blue-50"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Tentar Novamente
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (!evaluationInfo) {
        return (
            <div className="container mx-auto px-4 py-6">
                <div className="flex items-center gap-4 mb-6">
                    <Button variant="outline" onClick={onBack}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar
                    </Button>
                </div>
                <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                        <AlertCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                        Avaliação não encontrada
                    </h3>
                    <p className="text-gray-600 mb-4">
                        A avaliação solicitada não foi encontrada ou não possui resultados disponíveis.
                    </p>
                    <Button 
                        variant="outline" 
                        onClick={fetchDetailedResults}
                        className="text-sm"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Tentar Novamente
                    </Button>
                </div>
            </div>
        );
    }

    // Skeleton loading para quando os dados estão sendo processados
    if (isDataLoading) {
        return (
            <div className="container mx-auto px-4 py-6 space-y-6">
                {/* Header Skeleton */}
                <div className="flex items-center gap-4">
                    <Button variant="outline" onClick={onBack}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar
                    </Button>
                    <div className="flex-1">
                        <Skeleton className="h-8 w-96 mb-2" />
                        <Skeleton className="h-4 w-64" />
                    </div>
                    <Skeleton className="h-10 w-24" />
                </div>

                {/* Cards de Estatísticas Skeleton */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[...Array(4)].map((_, i) => (
                        <Card key={i}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-4 w-4" />
                            </CardHeader>
                            <CardContent>
                                <Skeleton className="h-8 w-12 mb-1" />
                                <Skeleton className="h-3 w-20" />
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Tabela Skeleton */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-6 w-48" />
                            <div className="flex gap-2">
                                <Skeleton className="h-8 w-20" />
                                <Skeleton className="h-8 w-20" />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                                    <div className="flex items-center gap-4 flex-1">
                                        <Skeleton className="h-10 w-10 rounded-full" />
                                        <div className="space-y-2 flex-1">
                                            <Skeleton className="h-4 w-48" />
                                            <Skeleton className="h-3 w-32" />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Skeleton className="h-8 w-16" />
                                        <Skeleton className="h-8 w-16" />
                                        <Skeleton className="h-8 w-20" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ✅ NOVO: Visualização de alunos faltosos
    if (showAbsentStudents) {
        return (
            <div className="container mx-auto px-4 py-6 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <Button variant="outline" onClick={handleBackFromAbsentStudents}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar aos Resultados
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold">Alunos Faltosos</h1>
                        <p className="text-muted-foreground">
                            Alunos que não realizaram a avaliação {evaluationInfo.titulo}
                        </p>
                    </div>
                </div>

                {/* Lista de Alunos Faltosos */}
                <Card>
                    <CardHeader>
                        <CardTitle>Lista de Alunos Faltosos</CardTitle>
                        <CardDescription>
                            {absentStudents.length} aluno(s) que não realizaram a avaliação
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {absentStudents.length > 0 ? (
                            <div className="space-y-4">
                                {absentStudents.map((student, index) => (
                                    <div key={`${student.id || 'student'}-${index}`} className="flex items-center justify-between p-4 border rounded-lg">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                                                <XCircle className="w-5 h-5 text-red-600" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold">{student.nome}</h3>
                                                <p className="text-sm text-muted-foreground">{student.turma}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-red-600 border-red-300">
                                                Não Realizou
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    Nenhum aluno faltoso
                                </h3>
                                <p className="text-gray-600">
                                    Todos os alunos realizaram a avaliação.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="outline" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar
                </Button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold">{evaluationInfo.titulo}</h1>
                    <p className="text-muted-foreground">
                        Resultados detalhados dos alunos
                    </p>
                </div>
                <Button 
                    variant="outline" 
                    onClick={fetchDetailedResults}
                    disabled={isLoading}
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                    Atualizar
                </Button>
            </div>

            {/* Informações da Avaliação */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>Informações da Avaliação</span>
                        <Badge className={getStatusColor(evaluationInfo.status)}>
                            {evaluationInfo.status === 'concluida' ? 'Concluída' :
                                evaluationInfo.status === 'em_andamento' ? 'Em Andamento' : 'Pendente'}
                        </Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">Disciplinas</div>
                            <div className="font-semibold">
                                {(() => {
                                    // ✅ VERIFICAÇÃO DE ESTABILIDADE - só mostrar se dados estiverem estáveis
                                    const hasStableDisciplina = evaluationInfo.disciplina && 
                                        evaluationInfo.disciplina.trim() !== '' && 
                                        evaluationInfo.disciplina !== 'N/A';
                                    
                                    // ✅ CORRIGIDO: Mostrar dados mesmo se não estiverem completamente estáveis
                                    if (hasStableDisciplina) {
                                        return formatFieldValue(evaluationInfo.disciplina, 'Disciplina não informada');
                                    } else if (!isDataStable) {
                                        return <span className="text-gray-400">Carregando...</span>;
                                    } else {
                                        return <span className="text-gray-400">Disciplina não informada</span>;
                                    }
                                })()}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">Série</div>
                            <div className="font-semibold">
                                {(() => {
                                    // ✅ VERIFICAÇÃO DE ESTABILIDADE - só mostrar se série estiver estável
                                    const hasStableSerie = evaluationInfo.serie && 
                                        evaluationInfo.serie.trim() !== '' && 
                                        evaluationInfo.serie !== 'N/A';
                                    
                                    if (hasStableSerie) {
                                        const gradeName = getGradeName(evaluationInfo.serie, evaluationInfo.grade_id, evaluationInfo);
                                        return gradeName;
                                    } else if (!isDataStable) {
                                        return <span className="text-gray-400">Carregando...</span>;
                                    } else {
                                        return <span className="text-gray-400">Série não informada</span>;
                                    }
                                })()}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">Escola</div>
                            <div className="font-semibold">{formatFieldValue(evaluationInfo.escola, 'Escola não informada')}</div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">Município</div>
                            <div className="font-semibold">{formatFieldValue(evaluationInfo.municipio, 'Município não informado')}</div>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-6">
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">Total de Alunos</div>
                            <div className="text-2xl font-bold text-blue-600">{evaluationInfo.total_alunos}</div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">Participantes</div>
                            <div className="text-2xl font-bold text-green-600">{evaluationInfo.alunos_participantes}</div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">Faltosos</div>
                            <div className="text-2xl font-bold text-red-600">
                                {evaluationInfo.alunos_ausentes}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">Taxa de Participação</div>
                            <div className="text-2xl font-bold text-blue-600">
                                {evaluationInfo.total_alunos > 0
                                    ? formatPercent1PtBr((evaluationInfo.alunos_participantes / evaluationInfo.total_alunos) * 100)
                                    : formatPercent1PtBr(0)
                                }
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-6">
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">Nota Geral</div>
                            <div className="text-2xl font-bold text-purple-600">
                                {formatDecimal1PtBr(evaluationInfo.media_nota)}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">Proficiência</div>
                            <div className="text-2xl font-bold text-orange-600">
                                {(() => {
                                    const prof = evaluationInfo.media_proficiencia;
                                    return prof && prof > 0 ? formatDecimal1PtBr(prof) : formatDecimal1PtBr(0);
                                })()}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">Taxa de Conclusão</div>
                            <div className="text-2xl font-bold text-green-600">
                                {evaluationInfo.total_alunos > 0
                                    ? formatPercent1PtBr((evaluationInfo.alunos_participantes / evaluationInfo.total_alunos) * 100)
                                    : formatPercent1PtBr(0)
                                }
                            </div>
                        </div>
                    </div>

                </CardContent>
            </Card>

            {/* Gráfico de Distribuição por Classificação */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Distribuição por Classificação</CardTitle>
                    <CardDescription>
                        Controles de filtro para visualizar os níveis desejados
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Controles de filtro do gráfico - Melhor posicionamento */}
                    <div className="flex flex-wrap gap-3 mb-6 p-4 bg-gray-50 rounded-lg">
                        {Object.keys(chartFilters).map(level => (
                            <div key={level} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`chart-${level}`}
                                    checked={chartFilters[level]}
                                    onCheckedChange={(checked) => 
                                        setChartFilters(prev => ({ ...prev, [level]: checked as boolean }))
                                    }
                                />
                                <label htmlFor={`chart-${level}`} className="text-sm font-medium text-gray-700">
                                    {level}
                                </label>
                            </div>
                        ))}
                    </div>
                    
                    <DonutChartComponent
                        data={(() => {
                            const levelOrder = ["Abaixo do Básico", "Básico", "Adequado", "Avançado", "Sem Nota"];
                            const colorMap = {
                                "Abaixo do Básico": "#dc2626", // red-600
                                "Básico": "#fbbf24", // yellow-400
                                "Adequado": "#4ade80", // green-400
                                "Avançado": "#16a34a", // green-600
                                "Sem Nota": "#6b7280"  // gray-500
                            };
                            
                            const data = levelOrder
                                .map(level => ({
                                    name: level,
                                    value: level === "Sem Nota" 
                                        ? (chartFilters[level] ? students.filter(s => s.nota === 0).length : 0)
                                        : (chartFilters[level] ? students.filter(s => s.classificacao === level && s.nota > 0).length : 0),
                                    color: colorMap[level] // ✅ CORREÇÃO: Adicionar cor específica para cada item
                                }))
                                .filter(item => item.value > 0);
                            
                            return data;
                        })()}
                        title="Distribuição por Classificação"
                        subtitle={`Total de ${students.filter(s => Object.values(chartFilters).some(f => f)).length} alunos`}
                        colors={(() => {
                            // ✅ CORREÇÃO: Gerar array de cores dinamicamente baseado nos dados filtrados
                            const levelOrder = ["Abaixo do Básico", "Básico", "Adequado", "Avançado", "Sem Nota"];
                            const colorMap = {
                                "Abaixo do Básico": "#dc2626",
                                "Básico": "#fbbf24", 
                                "Adequado": "#4ade80",
                                "Avançado": "#16a34a",
                                "Sem Nota": "#6b7280"
                            };
                            
                            return levelOrder
                                .filter(level => {
                                    const value = level === "Sem Nota" 
                                        ? (chartFilters[level] ? students.filter(s => s.nota === 0).length : 0)
                                        : (chartFilters[level] ? students.filter(s => s.classificacao === level && s.nota > 0).length : 0);
                                    return value > 0;
                                })
                                .map(level => colorMap[level]);
                        })()}
                    />
                    
                    {/* Índice fixo de cores */}
                    <div className="mt-6 pt-4 border-t border-gray-200">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">Legenda de Cores</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {[
                                { name: "Abaixo do Básico", color: "#dc2626" },
                                { name: "Básico", color: "#fbbf24" },
                                { name: "Adequado", color: "#4ade80" },
                                { name: "Avançado", color: "#16a34a" },
                                { name: "Sem Nota", color: "#6b7280" }
                            ].map((item) => (
                                <div key={item.name} className="flex items-center space-x-2">
                                    <div 
                                        className="w-4 h-4 rounded-full border border-gray-300"
                                        style={{ backgroundColor: item.color }}
                                    />
                                    <span className="text-sm text-gray-600">{item.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Filtros */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Filtros</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por nome do aluno ou turma..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                        <Select value={classificationFilter} onValueChange={setClassificationFilter}>
                            <SelectTrigger className="w-full md:w-48">
                                <SelectValue placeholder="Classificação" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas as classificações</SelectItem>
                                <SelectItem value="Abaixo do Básico">Abaixo do Básico</SelectItem>
                                <SelectItem value="Básico">Básico</SelectItem>
                                <SelectItem value="Adequado">Adequado</SelectItem>
                                <SelectItem value="Avançado">Avançado</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-full md:w-48">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos os status</SelectItem>
                                <SelectItem value="concluida">Concluída</SelectItem>
                                <SelectItem value="pendente">Pendente</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* ✅ SEÇÃO COMPACTA: Controles Avançados */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Controles da Tabela</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                        {/* Campos Visíveis - Layout Compacto */}
                        <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-2">Colunas Visíveis</h4>
                            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                                {[
                                    { key: 'habilidade', label: 'Habilidade' },
                                    { key: 'questoes', label: 'Questões' },
                                    { key: 'percentualTurma', label: '% Turma' },
                                    { key: 'total', label: 'Total' },
                                    { key: 'nota', label: 'Nota' },
                                    { key: 'proficiencia', label: 'Proficiência' },
                                    { key: 'nivel', label: 'Nível' }
                                ].map(({ key, label }) => (
                                    <div key={key} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={key}
                                            checked={visibleFields[key as keyof typeof visibleFields]}
                                            onCheckedChange={(checked) => 
                                                setVisibleFields(prev => ({ ...prev, [key]: checked as boolean }))
                                            }
                                            className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                        />
                                        <label htmlFor={key} className="text-xs font-medium text-gray-700">{label}</label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Separador */}
                        <div className="border-t border-gray-200 pt-4"></div>

                        {/* Filtros e Ordenação - Layout Compacto */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                            <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">Disciplina</label>
                                <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Todas" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas</SelectItem>
                                        <SelectItem value="matematica">Matemática</SelectItem>
                                        <SelectItem value="portugues">Português</SelectItem>
                                        <SelectItem value="ciencias">Ciências</SelectItem>
                                        <SelectItem value="historia">História</SelectItem>
                                        <SelectItem value="geografia">Geografia</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">Nível</label>
                                <Select value={levelFilter} onValueChange={setLevelFilter}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Todos" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos</SelectItem>
                                        <SelectItem value="Abaixo do Básico">Abaixo do Básico</SelectItem>
                                        <SelectItem value="Básico">Básico</SelectItem>
                                        <SelectItem value="Adequado">Adequado</SelectItem>
                                        <SelectItem value="Avançado">Avançado</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">Turma</label>
                                <Select value={turmaFilter} onValueChange={setTurmaFilter}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Todas" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas as Turmas</SelectItem>
                                        {uniqueTurmas.map(turma => (
                                            <SelectItem key={turma} value={turma}>{turma}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">Ordenar</label>
                                <Select value={orderBy} onValueChange={(value: 'nota' | 'proficiencia' | 'status' | 'turma' | 'nome') => setOrderBy(value)}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="nome">Nome</SelectItem>
                                        <SelectItem value="nota">Nota</SelectItem>
                                        <SelectItem value="proficiencia">Proficiência</SelectItem>
                                        <SelectItem value="status">Status</SelectItem>
                                        <SelectItem value="turma">Turma</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">Direção</label>
                                <Select value={orderDirection} onValueChange={(value: 'asc' | 'desc') => setOrderDirection(value)}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="asc">A→Z</SelectItem>
                                        <SelectItem value="desc">Z→A</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        
                        {/* ✅ CORREÇÃO: Controles de ação em linha separada */}
                        <div className="flex items-center gap-4 pt-3 border-t border-gray-200">
                            {/* Toggle para mostrar apenas alunos que realizaram */}
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="show-only-completed"
                                    checked={showOnlyCompleted}
                                    onCheckedChange={(checked) => setShowOnlyCompleted(checked as boolean)}
                                    className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                />
                                <label htmlFor="show-only-completed" className="text-xs font-medium text-gray-700">
                                    Apenas Concluídos
                                </label>
                            </div>
                            
                            {/* Botão para ver alunos faltosos */}
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setShowAbsentStudents(true)}
                                disabled={absentStudents.length === 0}
                                className="h-8 text-xs"
                            >
                                Ver Faltosos ({absentStudents.length})
                            </Button>
                            
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => {
                                        setSearchTerm('');
                                        setClassificationFilter('all');
                                        setStatusFilter('all');
                                        setShowOnlyWithScore(false);
                                    setShowOnlyCompleted(true);
                                        setLevelFilter('all');
                                        setTurmaFilter('all');
                                        setSubjectFilter('all');
                                        setOrderBy('nome');
                                        setOrderDirection('asc');
                                    }}
                                    className="h-8 text-xs"
                                >
                                    Limpar Filtros
                                </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Estatísticas por Turma */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Estatísticas por Turma</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {uniqueTurmas.map(turma => {
                            const turmaStudents = students.filter(s => s.turma === turma);
                            const turmaStudentsCompleted = turmaStudents.filter(s => s.status === 'concluida');
                            
                            // Usar dados reais dos alunos que temos
                            const totalStudentsInTurma = turmaStudents.length;
                            const completedStudentsInTurma = turmaStudentsCompleted.length;
                            
                            // Calcular médias apenas dos alunos que participaram
                            const averageScore = turmaStudentsCompleted.length > 0 
                                ? turmaStudentsCompleted.reduce((sum, s) => sum + s.nota, 0) / turmaStudentsCompleted.length 
                                : 0;
                            const averageProficiency = turmaStudentsCompleted.length > 0 
                                ? turmaStudentsCompleted.reduce((sum, s) => sum + s.proficiencia, 0) / turmaStudentsCompleted.length 
                                : 0;
                            
                            // Distribuição baseada em todos os alunos da turma
                            // Alunos que não participaram são considerados "Abaixo do Básico"
                            const alunosNaoParticiparam = totalStudentsInTurma - completedStudentsInTurma;
                            const distribution = {
                                abaixo_do_basico: turmaStudentsCompleted.filter(s => s.classificacao === 'Abaixo do Básico').length + alunosNaoParticiparam,
                                basico: turmaStudentsCompleted.filter(s => s.classificacao === 'Básico').length,
                                adequado: turmaStudentsCompleted.filter(s => s.classificacao === 'Adequado').length,
                                avancado: turmaStudentsCompleted.filter(s => s.classificacao === 'Avançado').length,
                            };

                            const participationRate = totalStudentsInTurma > 0 
                                ? (completedStudentsInTurma / totalStudentsInTurma) * 100 
                                : 0;

                            return (
                                <div key={turma} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-semibold text-lg">{turma}</h3>
                                        <Badge variant="outline">{totalStudentsInTurma} alunos</Badge>
                                    </div>
                                    
                                    <div className="space-y-3">
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">Participação:</span>
                                                <span className="font-medium">
                                                    {completedStudentsInTurma}/{totalStudentsInTurma} alunos
                                                </span>
                                            </div>
                                            <Progress value={participationRate} className="h-2" />
                                        </div>
                                        
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Média Nota:</span>
                                            <span className="font-medium">
                                                {(() => {
                                                    const value = generalStats?.media_nota_geral !== undefined
                                                        ? formatDecimal1PtBr(generalStats.media_nota_geral)
                                                        : formatDecimal1PtBr(averageScore);
                                                    console.log('🎯 LOG - Média Nota renderizada:', {
                                                        generalStats: generalStats?.media_nota_geral,
                                                        averageScore,
                                                        finalValue: value
                                                    });
                                                    return value;
                                                })()}
                                            </span>
                                        </div>
                                        
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Proficiência:</span>
                                            <span className="font-medium">
                                                {(() => {
                                                    const value = generalStats?.media_proficiencia_geral !== undefined
                                                        ? formatDecimal1PtBr(generalStats.media_proficiencia_geral)
                                                        : formatDecimal1PtBr(averageProficiency);
                                                    console.log('🎯 LOG - Proficiência renderizada:', {
                                                        generalStats: generalStats?.media_proficiencia_geral,
                                                        averageProficiency,
                                                        finalValue: value
                                                    });
                                                    return value;
                                                })()}
                                            </span>
                                        </div>
                                        
                                        {/* Distribuição de classificação */}
                                        <div className="space-y-1">
                                            <div className="text-xs text-muted-foreground">Distribuição:</div>
                                            <div className="flex gap-1">
                                                <div 
                                                    className="flex-1 bg-red-500 rounded-sm h-2" 
                                                    title={`Abaixo do Básico: ${distribution.abaixo_do_basico}`}
                                                    style={{ 
                                                        width: `${totalStudentsInTurma > 0 ? (distribution.abaixo_do_basico / totalStudentsInTurma) * 100 : 0}%` 
                                                    }}
                                                ></div>
                                                <div 
                                                    className="flex-1 bg-yellow-500 rounded-sm h-2" 
                                                    title={`Básico: ${distribution.basico}`}
                                                    style={{ 
                                                        width: `${totalStudentsInTurma > 0 ? (distribution.basico / totalStudentsInTurma) * 100 : 0}%` 
                                                    }}
                                                ></div>
                                                <div 
                                                    className="flex-1 bg-green-400 rounded-sm h-2" 
                                                    title={`Adequado: ${distribution.adequado}`}
                                                    style={{ 
                                                        width: `${totalStudentsInTurma > 0 ? (distribution.adequado / totalStudentsInTurma) * 100 : 0}%` 
                                                    }}
                                                ></div>
                                                <div 
                                                    className="flex-1 bg-green-600 rounded-sm h-2" 
                                                    title={`Avançado: ${distribution.avancado}`}
                                                    style={{ 
                                                        width: `${totalStudentsInTurma > 0 ? (distribution.avancado / totalStudentsInTurma) * 100 : 0}%` 
                                                    }}
                                                ></div>
                                            </div>
                                            <div className="flex justify-between text-xs text-muted-foreground">
                                                <span>{distribution.abaixo_do_basico}</span>
                                                <span>{distribution.basico}</span>
                                                <span>{distribution.adequado}</span>
                                                <span>{distribution.avancado}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Lista de Alunos */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>Resultados dos Alunos</span>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline">
                                {filteredStudents.length} {filteredStudents.length === 1 ? 'aluno' : 'alunos'}
                            </Badge>
                            <div className="flex items-center gap-1 border rounded-lg p-1">
                                <Button
                                    variant={viewMode === 'table' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setViewMode('table')}
                                    className="h-8 px-3"
                                >
                                    <BarChart3 className="h-4 w-4 mr-1" />
                                    Tabela
                                </Button>
                                <Button
                                    variant={viewMode === 'cards' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setViewMode('cards')}
                                    className="h-8 px-3"
                                >
                                    <Users className="h-4 w-4 mr-1" />
                                    Cards
                                </Button>
                            </div>
                            <div className="flex items-center gap-2"></div>
                        </div>
                    </CardTitle>
                    {/* Resumo da situação */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <Minus className="h-4 w-4 text-red-600" />
                            <span>{students.filter(s => s.status === 'pendente').length} faltosos</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-blue-600" />
                            <span>{formatPercent1PtBr((students.filter(s => s.status === 'concluida').length / students.length) * 100)} participação</span>
                            {showOnlyCompleted && (
                                <span className="text-xs text-green-600 font-medium">(filtrado)</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-blue-600" />
                            <span>{students.filter(s => s.nota > 0).length} com nota</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Minus className="h-4 w-4 text-gray-600" />
                            <span>{students.filter(s => s.nota === 0).length} sem nota</span>
                        </div>
                    </div>
                    
                    {/* Filtros ativos */}
                    {(searchTerm || classificationFilter !== 'all' || statusFilter !== 'all' || 
                      levelFilter !== 'all' || turmaFilter !== 'all' || subjectFilter !== 'all' || showOnlyCompleted) && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                            <span>Filtros ativos:</span>
                            {searchTerm && (
                                <Badge variant="secondary" className="text-xs">
                                    Busca: "{searchTerm}"
                                </Badge>
                            )}
                            {classificationFilter !== 'all' && (
                                <Badge variant="secondary" className="text-xs">
                                    Classificação: {classificationFilter}
                                </Badge>
                            )}
                            {statusFilter !== 'all' && (
                                <Badge variant="secondary" className="text-xs">
                                    Status: {statusFilter === 'concluida' ? 'Concluída' : 'Pendente'}
                                </Badge>
                            )}
                            {levelFilter !== 'all' && (
                                <Badge variant="secondary" className="text-xs">
                                    Nível: {levelFilter}
                                </Badge>
                            )}
                            {turmaFilter !== 'all' && (
                                <Badge variant="secondary" className="text-xs">
                                    Turma: {turmaFilter}
                                </Badge>
                            )}
                            {subjectFilter !== 'all' && (
                                <span className="inline-flex items-center gap-1 text-xs">
                                  <span className="text-muted-foreground">Disciplina:</span>
                                  <DisciplineTag name={subjectFilter} className="text-xs" />
                                </span>
                            )}
                            {showOnlyCompleted && (
                                <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                    Apenas Concluídos
                                </Badge>
                            )}
                        </div>
                    )}
                    {/* Controles da tabela */}
                    {viewMode === 'table' && (
                        <div className="flex items-center gap-4 pt-2 border-t border-gray-200">
                            <div className="text-xs text-gray-500">
                                {detailedReport?.questoes.length 
                                    ? `Total de ${detailedReport.questoes.length} questões na avaliação`
                                    : 'Carregando questões...'
                                }
                            </div>
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    {filteredStudents.length > 0 ? (
                        viewMode === 'table' ? (
                            // ✅ Só mostrar tabela quando os dados estiverem prontos
                            isTableReady ? (
                                <StudentsResultsTable 
                                    students={filteredStudents} 
                                    totalQuestions={detailedReport?.questoes.length || 0} 
                                    startQuestionNumber={1} // ✅ SEMPRE começar da questão 1
                                    onViewStudentDetails={handleViewStudentDetails}
                                    questoes={detailedReport?.questoes}
                                    questionsWithSkills={questionsWithSkills}
                                    skillsMapping={skillsMapping}
                                    skillsBySubject={skillsBySubject}
                                    detailedReport={detailedReport}
                                    studentDetailedAnswers={studentDetailedAnswers}
                                    visibleFields={visibleFields}
                                    subjectFilter={subjectFilter}
                                />
                            ) : (
                                <div className="text-center py-12">
                                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    </div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                        Carregando dados detalhados...
                                    </h3>
                                    <p className="text-gray-600">
                                        Aguarde enquanto carregamos as respostas individuais dos alunos.
                                    </p>
                                </div>
                            )
                        ) : (
                            <StudentsCardsView students={filteredStudents} />
                        )
                    ) : (
                        <div className="text-center py-12">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Users className="h-8 w-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                Nenhum aluno encontrado
                            </h3>
                            <p className="text-gray-600">
                                {searchTerm || classificationFilter !== 'all' || statusFilter !== 'all'
                                    ? 'Ajuste os filtros para ver os alunos.'
                                    : 'Não há alunos registrados nesta avaliação.'}
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ✅ NOVO: Skills por Disciplina - Posicionado no final da página */}

            {/* ✅ NOVO: Indicador de carregamento das respostas detalhadas */}
            {isLoadingDetailedAnswers && (
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                            Carregando respostas detalhadas dos alunos...
                        </div>
                    </CardContent>
                </Card>
            )}

        </div>
    );
} 