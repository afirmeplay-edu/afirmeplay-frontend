import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { getReportProficiencyTagClass } from "@/utils/report/reportTagStyles";
import {
    ArrowLeft,
    CheckCircle2,
    Award,
    BarChart3,
    FileText,
    Users,
    XCircle,
    RefreshCw,
    GraduationCap,
    School
} from "lucide-react";
import { useLocation, useParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { EvaluationResultsApiService } from "@/services/evaluation/evaluationResultsApi";
import StudentBulletin, { type DisciplineStatsMap } from "./StudentBulletin";
import { loadBulletinStatsFromStorage } from "../utils/bulletinStorage";

interface StudentDetailedResultsProps {
    onBack: () => void;
}

interface StudentEvaluation {
    id: string;
    titulo: string;
    data_aplicacao: string;
    disciplina: string;
    serie: string;
    escola: string;
    turma?: string;
}

interface StudentData {
    student_name?: string;
    nome?: string;
    school_name?: string;
    class_name?: string;
    total_questions?: number;
    correct_answers?: number;
    grade?: number;
    proficiencia?: number;
    classificacao?: string;
}

interface StudentInfo {
    id: string;
    nome?: string;
    name?: string;
    escola?: string;
    grade?: string;
    serie?: string;
    turma?: string;
}

interface EvaluationInfo {
    titulo?: string;
    data_aplicacao?: string;
    disciplina?: string | string[];
    escola?: string;
    serie?: string;
}

/** Nota: 0 é válido; N/A só quando ausente ou não numérico. Inteiros sem casas decimais. */
function formatScoreForDisplay(value: unknown, decimals = 1): string {
    if (value === null || value === undefined || value === "") return "N/A";
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return "N/A";
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(decimals);
}

function formatProficiencyForDisplay(value: unknown): string {
    return formatScoreForDisplay(value);
}

// Error Boundary Component
class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error?: Error }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Error Boundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="container mx-auto px-4 py-6">
                    <div className="text-center py-12">
                        <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                            <XCircle className="w-8 h-8 text-red-600" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            Erro na Renderização
                        </h3>
                        <p className="text-gray-600 mb-4">
                            Ocorreu um erro inesperado ao carregar os dados.
                        </p>
                        <Button onClick={() => window.location.reload()}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Recarregar Página
                        </Button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

// Componente interno que contém a lógica principal
function StudentDetailedResultsContent({ onBack }: StudentDetailedResultsProps) {
    const { id: evaluationId, studentId } = useParams<{ id: string; studentId: string }>();
    const location = useLocation<{ disciplineStats?: DisciplineStatsMap }>();
    const { toast } = useToast();

    const [studentData, setStudentData] = useState<StudentData | null>(null);
    const [studentEvaluations, setStudentEvaluations] = useState<StudentEvaluation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [studentName, setStudentName] = useState<string | null>(null);
    const [testSubjects, setTestSubjects] = useState<string[]>([]);

    const initialDisciplineStats = useMemo<DisciplineStatsMap | undefined>(() => {
        if (!evaluationId || !studentId) {
            return undefined;
        }

        const stateStats = location.state?.disciplineStats;
        if (stateStats && Object.keys(stateStats).length > 0) {
            return stateStats;
        }

        return loadBulletinStatsFromStorage<DisciplineStatsMap | undefined>(evaluationId, studentId) || undefined;
    }, [evaluationId, studentId, location.state]);

    const loadStudentData = useCallback(async () => {
        if (!evaluationId || !studentId) {
            setError('IDs de avaliação ou aluno não fornecidos');
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            // 1. Disparar chamadas essenciais em paralelo
            const [currentResult, evaluationInfo, testEvaluation] = await Promise.all([
                EvaluationResultsApiService.getStudentDetailedResults(evaluationId, studentId).catch((err: Error) => {
                    console.error('Erro ao buscar resultado do aluno:', err);
                    return null;
                }),
                EvaluationResultsApiService.getEvaluationById(evaluationId).catch((err: Error) => {
                    console.warn('Erro ao buscar informações da avaliação:', err);
                    return null;
                }),
                EvaluationResultsApiService.getTestEvaluationById(evaluationId).catch((err: Error) => {
                    console.warn('Erro ao buscar dados de teste (subjects):', err);
                    return null;
                })
            ]) as [StudentData | null, EvaluationInfo | null, unknown | null];

            // 3. Buscar dados da turma/série dos alunos da avaliação (opcional)
            let classInfo = null;
            let foundStudentName = null;
            try {
                const studentsData = await EvaluationResultsApiService.getStudentsByEvaluation(evaluationId);
                console.log('🔍 DEBUG - Dados dos alunos:', studentsData);
                
                if (Array.isArray(studentsData)) {
                    const currentStudentData = studentsData.find((student: StudentInfo) => 
                        student && student.id === studentId
                    );
                    console.log('🔍 DEBUG - Dados do aluno atual:', currentStudentData);
                    
                                         if (currentStudentData) {
                         classInfo = {
                            school: (currentStudentData as any).escola || 'Não informada',
                             grade: currentStudentData.grade || (currentStudentData as any).serie || 'Não informada',
                             class: currentStudentData.turma || 'Não informada'
                         };
                         // Tentar obter o nome do aluno da lista de alunos
                         foundStudentName = currentStudentData.nome || (currentStudentData as any).name || null;
                         console.log('🔍 DEBUG - Nome do aluno encontrado:', foundStudentName);
                     }
                }
            } catch (err) {
                console.warn('Não foi possível buscar dados da turma/série:', err);
            }

            if (!currentResult) {
                throw new Error('Resultados do aluno não encontrados.');
            }

            console.log('🔍 DEBUG - Dados detalhados do aluno:', currentResult);
            setStudentData(currentResult);
            setStudentName(foundStudentName);

            // Extrair disciplinas do objeto de teste quando disponível
            try {
                const te = testEvaluation as { subjects?: Array<{ name?: string }>; subjects_info?: Array<{ name?: string }>; subject?: { name?: string } } | null;
                const subjectsFromArray = Array.isArray(te?.subjects)
                    ? te!.subjects.map(s => s?.name).filter(Boolean) as string[]
                    : Array.isArray(te?.subjects_info)
                        ? te!.subjects_info.map(s => s?.name).filter(Boolean) as string[]
                        : [];
                const singleSubject = te?.subject?.name ? [te.subject.name] : [];
                const fromEvaluationInfo = evaluationInfo?.disciplina
                    ? (Array.isArray(evaluationInfo.disciplina) ? evaluationInfo.disciplina : String(evaluationInfo.disciplina).split(',').map(v => v.trim()).filter(v => v.length > 0))
                    : [];
                const merged = Array.from(new Set([...
                    subjectsFromArray,
                    ...singleSubject,
                    ...fromEvaluationInfo
                ]));
                setTestSubjects(merged);
            } catch {
                setTestSubjects([]);
            }

            // 2. Consolidar informações da avaliação com prioridade
            const finalEvaluationData: StudentEvaluation = {
                id: evaluationId,
                titulo: evaluationInfo?.titulo || 'Avaliação',
                data_aplicacao: evaluationInfo?.data_aplicacao || new Date().toISOString(),
                disciplina: evaluationInfo?.disciplina || 'N/A',
                escola: classInfo?.school || currentResult.school_name || evaluationInfo?.escola || 'Não informada',
                serie: classInfo?.grade || evaluationInfo?.serie || 'Não informada',
                turma: classInfo?.class || currentResult.class_name || 'Não informada'
            };

            setStudentEvaluations([finalEvaluationData]);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
            console.error('Erro completo no loadStudentData:', err);
            setError(errorMessage || 'Não foi possível carregar os dados do aluno.');
        } finally {
            setIsLoading(false);
        }
    }, [evaluationId, studentId]);

    useEffect(() => {
        loadStudentData();
    }, [loadStudentData]);

    const handleRefresh = async () => {
        await loadStudentData();
        toast({
            title: "Dados Atualizados",
            description: "As informações foram atualizadas com sucesso.",
        });
    };

    if (isLoading) {
        return (
            <div className="container mx-auto px-4 py-6 space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="outline" onClick={onBack}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Voltar
                    </Button>
                    <Skeleton className="h-8 w-64" />
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Card key={i}>
                            <CardHeader className="pb-3">
                                <Skeleton className="h-4 w-32" />
                            </CardHeader>
                            <CardContent>
                                <Skeleton className="h-8 w-16 mb-2" />
                                <Skeleton className="h-3 w-24" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
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
                        <XCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                        Erro ao Carregar Dados
                    </h3>
                    <p className="text-gray-600 mb-4">
                        {error}
                    </p>
                    <Button onClick={handleRefresh}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Tentar Novamente
                    </Button>
                </div>
            </div>
        );
    }

    if (!studentData) {
        return (
            <div className="container mx-auto px-4 py-6">
                <div className="text-center py-12">
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                        Dados do aluno não encontrados
                    </h3>
                    <p className="text-gray-600 mb-4">
                        Não foi possível carregar os dados do aluno.
                    </p>
                </div>
            </div>
        );
    }

    const currentEvaluation = studentEvaluations[0];
    // Adicionar verificações de segurança
    const displayStudentName = studentName || studentData?.student_name || studentData?.nome || 'Nome não informado';
    const totalQuestions = studentData?.total_questions || 0;
    const correctAnswers = studentData?.correct_answers || 0;
    const grade = studentData?.grade;
    const proficiencia = studentData?.proficiencia;
    const classificacao = studentData?.classificacao || 'Não classificado';

    function getDisciplinesList(value?: string | string[]): string[] {
        if (!value) return [];
        if (Array.isArray(value)) return value.filter(Boolean).map(v => String(v).trim()).filter(v => v.length > 0);
        // suporta string única ou lista separada por vírgulas
        return value
            .split(',')
            .map(v => v.trim())
            .filter(v => v.length > 0);
    }

    const disciplinesRaw = testSubjects.length > 0 ? testSubjects : (currentEvaluation?.disciplina as unknown as (string | string[] | undefined));
    const disciplines = getDisciplinesList(disciplinesRaw);

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="outline" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar
                </Button>
                <div className="flex-1 space-y-1.5">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Resultados Detalhados do Aluno</h1>
                    <p className="text-muted-foreground text-sm sm:text-base">
                        Análise individual da avaliação
                    </p>
                </div>
            </div>

            {/* Escola (topo do layout) */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <School className="h-4 w-4 text-purple-600" />
                        Escola
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-purple-600">
                        {currentEvaluation?.escola || 'Não informada'}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Instituição de ensino
                    </p>
                </CardContent>
            </Card>

            {/* Informações do Aluno */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Users className="h-4 w-4 text-blue-600" />
                            Nome do Aluno
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">
                            {displayStudentName}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Aluno Avaliado
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <GraduationCap className="h-4 w-4 text-green-600" />
                            Série
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                            {currentEvaluation?.serie || 'Não informada'}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Nível educacional
                        </p>
                    </CardContent>
                </Card>

                {currentEvaluation?.turma && currentEvaluation.turma !== 'Não informada' && (
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Users className="h-4 w-4 text-orange-600" />
                                Turma
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-orange-600">
                                {currentEvaluation.turma}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Turma do aluno
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>



            {/* Estatísticas da Avaliação */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-600" />
                            Total de Questões
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">
                            {totalQuestions}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Questões da avaliação
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Acertos
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                            {correctAnswers}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {totalQuestions > 0 ? 
                                `${((correctAnswers / totalQuestions) * 100).toFixed(1)}% de acerto` 
                                : 'Taxa de acerto'
                            }
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Award className="h-4 w-4 text-purple-600" />
                            Nota
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-600">
                            {formatScoreForDisplay(grade)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Nota final da avaliação
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-orange-600" />
                            Proficiência
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-600">
                            {formatProficiencyForDisplay(proficiencia)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Nível: {classificacao}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Classificação */}
            {classificacao && classificacao !== 'Não classificado' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>Classificação de Proficiência</span>
                            <Badge className={getReportProficiencyTagClass(classificacao)}>
                                {classificacao}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span>Nível de Proficiência Alcançado</span>
                                    <span className="font-bold">
                                        {proficiencia != null && Number.isFinite(Number(proficiencia))
                                            ? `${formatProficiencyForDisplay(proficiencia)} pontos`
                                            : "0 pontos"}
                                    </span>
                                </div>
                                <Progress 
                                    value={Math.min(((proficiencia ?? 0) / 412.5) * 100, 100)} 
                                    className="h-3" 
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Informações da Avaliação */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-600" />
                        Informações da Avaliação
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <h4 className="font-medium text-sm text-gray-600">Título</h4>
                            <p className="text-lg">{currentEvaluation?.titulo || 'N/A'}</p>
                        </div>
                        <div>
                            <h4 className="font-medium text-sm text-gray-600">Disciplinas</h4>
                            {disciplines.length > 0 ? (
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {disciplines.map((d) => (
                                        <Badge key={d} variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">
                                            {d}
                                        </Badge>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-lg">N/A</p>
                            )}
                        </div>
                        <div>
                            <h4 className="font-medium text-sm text-gray-600">Data de Aplicação</h4>
                            <p className="text-lg">
                                {currentEvaluation?.data_aplicacao ? 
                                    new Date(currentEvaluation.data_aplicacao).toLocaleDateString('pt-BR') 
                                    : 'N/A'
                                }
                            </p>
                        </div>
                        <div>
                            <h4 className="font-medium text-sm text-gray-600">Status</h4>
                            <Badge className="bg-green-100 text-green-800 border-green-300">
                                Concluída
                            </Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Boletim de Questões */}
            {evaluationId && studentId && (
                <StudentBulletin
                    testId={evaluationId}
                    studentId={studentId}
                    initialDisciplineStats={initialDisciplineStats}
                />
            )}

            {/* Botão de Atualização */}
            <div className="flex justify-center">
                <Button onClick={handleRefresh} variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar Dados
                </Button>
            </div>
        </div>
    );
}

// Componente principal exportado com Error Boundary
export default function StudentDetailedResults(props: StudentDetailedResultsProps) {
    return (
        <ErrorBoundary>
            <StudentDetailedResultsContent {...props} />
        </ErrorBoundary>
    );
}