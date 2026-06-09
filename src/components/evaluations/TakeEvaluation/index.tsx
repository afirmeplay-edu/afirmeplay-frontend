import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DisciplineTag } from "@/components/ui/discipline-tag";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    ChevronLeft,
    ChevronRight,
    Send,
    AlertTriangle,
    Home,
    Play,
    Loader2,
    CheckCircle2,
    Maximize2,
    X,
    Menu
} from "lucide-react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { EvaluationTimer } from "../EvaluationTimer";
import { useEvaluation } from "@/hooks/useEvaluation";
import { Question } from "@/types/evaluation-types";
import { CompetitionSubmitSuccessModal } from "@/components/competitions/CompetitionSubmitSuccessModal";
import { BASE_URL } from "@/lib/api";
import { resolveQuestionImageSrc, getQuestionHtmlForDisplay } from "@/utils/questionImages";
import { cleanLegacyText, isLikelyPlainText } from "@/utils/textFormatter";
import { QuestionRenderer } from "@/components/evaluations/questions/QuestionRenderer";
import { QuestionOptionContent } from "@/components/evaluations/questions/QuestionOptionContent";

/** State passado quando a prova é feita no contexto de uma competição. */
interface CompetitionLocationState {
  fromCompetition?: boolean;
  competitionId?: string;
  competitionName?: string;
  participationCoins?: number;
  rankingVisibility?: string;
  showRankingButton?: boolean;
}

/** Retorna o tipo de contexto da prova para redirecionar ao concluir: avaliação, competição ou olimpíada. */
function getEvaluationContext(pathname: string, state: CompetitionLocationState | null): 'avaliacao' | 'competicao' | 'olimpiada' {
  if (state?.fromCompetition) return 'competicao';
  if (pathname.includes('/aluno/olimpiada/')) return 'olimpiada';
  return 'avaliacao';
}


export default function TakeEvaluation() {
    const { id: evaluationId } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const competitionState = (location.state ?? null) as CompetitionLocationState | null;
    const evaluationContext = getEvaluationContext(location.pathname, competitionState);
    const returnPath = evaluationContext === 'olimpiada' ? '/aluno/olimpiadas' : evaluationContext === 'competicao' ? '/aluno/competitions' : '/aluno/avaliacoes';
    const returnLabel = evaluationContext === 'olimpiada' ? 'Voltar às Olimpíadas' : evaluationContext === 'competicao' ? 'Voltar às Competições' : 'Voltar às Avaliações';
    const { toast } = useToast();
    const [showSubmitDialog, setShowSubmitDialog] = useState(false);
    const [showCompletionDialog, setShowCompletionDialog] = useState(false);
    const [showFullscreenQuestion, setShowFullscreenQuestion] = useState(false);
    const [showMobileNav, setShowMobileNav] = useState(false);
    const [hasSeenCompletionDialog, setHasSeenCompletionDialog] = useState(false);
    const [isCompletionDialogClosed, setIsCompletionDialogClosed] = useState(false);
    const [shuffledQuestions, setShuffledQuestions] = useState<Question[]>([]);
    // ✅ NOVO: Manter referência às questões originais para mapeamento correto
    const [originalQuestions, setOriginalQuestions] = useState<Question[]>([]);
    const [showCompetitionSuccessModal, setShowCompetitionSuccessModal] = useState(false);
    const [isAutoAdvanceEnabled, setIsAutoAdvanceEnabled] = useState(true);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const saved = window.localStorage.getItem("take-evaluation:auto-advance-enabled");
        if (saved != null) {
            setIsAutoAdvanceEnabled(saved === "true");
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(
            "take-evaluation:auto-advance-enabled",
            String(isAutoAdvanceEnabled)
        );
    }, [isAutoAdvanceEnabled]);

    // ✅ NOVO: Função para mapear resposta da interface para letra original
    const mapAnswerToOriginalLetter = useCallback((questionId: string, selectedText: string | string[]): string => {
        // Se for array, pegar o primeiro elemento
        const textToMap = Array.isArray(selectedText) ? selectedText[0] : selectedText;
        
        // Buscar a questão embaralhada
        const shuffledQuestion = shuffledQuestions.find(q => q.id === questionId);
        if (!shuffledQuestion?.positionMapping) {
            return textToMap; // Fallback para resposta direta
        }
        
        // ✅ CORRIGIDO: Tentar encontrar a opção primeiro pelo ID (letra A, B, C, D)
        // Se textToMap for uma letra (A, B, C, D), procurar pelo ID
        let selectedOption = null;
        if (textToMap && textToMap.length === 1 && /^[A-Z]$/.test(textToMap)) {
            // É uma letra, procurar pelo ID
            selectedOption = shuffledQuestion.options?.find(opt => opt.id === textToMap);
        }
        
        // Se não encontrou pelo ID, tentar pelo texto
        if (!selectedOption) {
            selectedOption = shuffledQuestion.options?.find(opt => opt.text === textToMap);
        }
        
        // Se ainda não encontrou, tentar pelo ID mesmo que não seja uma letra única
        if (!selectedOption) {
            selectedOption = shuffledQuestion.options?.find(opt => opt.id === textToMap);
        }
        
        if (!selectedOption) {
            return textToMap; // Fallback para resposta direta
        }
        
        // Encontrar o índice embaralhado da opção selecionada
        const shuffledIndex = shuffledQuestion.options?.findIndex(opt => opt.id === selectedOption.id);
        if (shuffledIndex === -1 || shuffledIndex === undefined) {
            return textToMap; // Fallback para resposta direta
        }
        
        // Buscar o mapeamento para essa posição
        const mapping = shuffledQuestion.positionMapping[shuffledIndex];
        if (!mapping) {
            return textToMap; // Fallback para resposta direta
        }
        
        // Retornar a letra da posição original (A, B, C, D...)
        return mapping.originalLetter;
    }, [shuffledQuestions]);

    const {
        evaluationState,
        testData,
        session,
        currentQuestionIndex,
        answers,
        isSubmitting,
        isSaving,
        isSavingPartial,
        results,
        timeRemaining,
        isTimeUp,
        isPaused,
        startTestSession,
        saveAnswer,
        submitTest: handleSubmitTest,
        navigateToQuestion
    } = useEvaluation({ testId: evaluationId });



    // ✅ Verificar se avaliação já foi enviada antes de iniciar
    useEffect(() => {
        if (evaluationState === 'completed' && !results) {
            // Verificação adicional: se não há dados da avaliação ou sessão, pode ser erro de carregamento
            if (!testData || !session) {
                return;
            }
            
            toast({
                title: "Acesso Negado",
                description: "Esta avaliação já foi enviada anteriormente. Você será redirecionado.",
                variant: "destructive",
            });
            const timer = setTimeout(() => {
                navigate(returnPath);
            }, 2000);
            
            return () => clearTimeout(timer);
        }
    }, [evaluationState, results, testData, session, navigate, toast, returnPath]);

    // ✅ Auto-iniciar avaliação automaticamente
    useEffect(() => {
        if (evaluationState === 'instructions' && testData && !session) {
            startTestSession();
        }
    }, [evaluationState, testData, session, startTestSession]);

    // ✅ Fechar modal fullscreen com Escape e navegar com setas
    useEffect(() => {
        const handleKeyboard = (event: KeyboardEvent) => {
            if (!showFullscreenQuestion) return;
            
            switch(event.key) {
                case 'Escape':
                    setShowFullscreenQuestion(false);
                    break;
                case 'ArrowLeft':
                    if (currentQuestionIndex > 0) {
                        event.preventDefault();
                        navigateToQuestion(currentQuestionIndex - 1);
                    }
                    break;
                case 'ArrowRight':
                    if (currentQuestionIndex < shuffledQuestions.length - 1) {
                        event.preventDefault();
                        navigateToQuestion(currentQuestionIndex + 1);
                    }
                    break;
            }
        };

        if (showFullscreenQuestion) {
            document.addEventListener('keydown', handleKeyboard);
            return () => document.removeEventListener('keydown', handleKeyboard);
        }
    }, [showFullscreenQuestion, currentQuestionIndex, shuffledQuestions.length, navigateToQuestion]);

    // ✅ Limpar estado dos modais quando necessário
    useEffect(() => {
        if (!showFullscreenQuestion && !showCompletionDialog && !showSubmitDialog) {
            // Garantir que o body não tenha scroll bloqueado
            document.body.style.overflow = 'auto';
            document.body.removeAttribute('data-scroll-locked');
            
            // Remover qualquer overlay que possa ter ficado
            const overlays = document.querySelectorAll('[data-state="open"]');
            overlays.forEach(overlay => {
                if (overlay.classList.contains('fixed') && overlay.classList.contains('inset-0')) {
                    overlay.remove();
                }
            });
        }
    }, [showFullscreenQuestion, showCompletionDialog, showSubmitDialog]);

    // ✅ Garantir que apenas um modal esteja aberto por vez
    useEffect(() => {
        if (showFullscreenQuestion) {
            // Se o modal fullscreen está aberto, fechar outros modais
            setShowCompletionDialog(false);
            setShowSubmitDialog(false);
        }
    }, [showFullscreenQuestion]);

    // ✅ Fechar modais quando avaliação for enviada (agora feito no useEffect de redirecionamento)

    // ✅ REMOVIDO: useEffect que fechava automaticamente o fullscreen ao navegar
    // Agora o modo tela cheia persiste durante a navegação entre questões

    // ✅ NOVO: Scroll automático para o topo da questão quando mudar
    useEffect(() => {
        if (currentQuestionIndex >= 0) {
            // Scroll para o topo da área de conteúdo principal
            setTimeout(() => {
                const mainContent = document.querySelector('.evaluation-question-card');
                if (mainContent) {
                    mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                
                // Alternativa: scroll da área principal
                const contentArea = document.querySelector('.overflow-y-auto.bg-gray-50');
                if (contentArea) {
                    contentArea.scrollTop = 0;
                }
            }, 100);
        }
    }, [currentQuestionIndex]);

    // ✅ NOVO: Verificação adicional para tablets - garantir que modal seja exibido quando todas questões estiverem respondidas
    useEffect(() => {
        const totalQuestions = shuffledQuestions.length;
        const answeredQuestions = Object.keys(answers).length;
        
        // Se estamos em fullscreen e todas as questões foram respondidas, mostrar modal
        if (showFullscreenQuestion && totalQuestions > 0 && answeredQuestions >= totalQuestions) {
            setTimeout(() => {
                setShowFullscreenQuestion(false);
                setTimeout(() => {
                    setShowSubmitDialog(true);
                }, 150);
            }, 300);
        }
    }, [answers, shuffledQuestions.length, showFullscreenQuestion]);

    /** Normaliza questão para o mesmo modelo da prévia (QuestionBank): texto 1 = formattedText/text, texto 2 = secondStatement. */
    const normalizeQuestionForDisplay = useCallback((q: Question & { formatted_text?: string; second_statement?: string }): Question => {
        const text = q.text ?? '';
        const formattedText = q.formattedText ?? (q as { formatted_text?: string }).formatted_text ?? text;
        const secondStatement = (q.secondStatement ?? (q as { second_statement?: string }).second_statement ?? q.secondstatement ?? '').trim();
        return { ...q, text, formattedText: formattedText || text, secondStatement: secondStatement || '' };
    }, []);

    // ✅ Organizar questões por disciplina e embaralhar alternativas
    useEffect(() => {
        if (testData?.questions?.length && shuffledQuestions.length === 0) {
            // Agrupar questões por disciplina
            const questionsBySubject = testData.questions.reduce((acc, question) => {
                const subjectName = question.subject?.name || 'Sem disciplina';
                if (!acc[subjectName]) {
                    acc[subjectName] = [];
                }
                acc[subjectName].push(question);
                return acc;
            }, {} as Record<string, Question[]>);

            // Processar questões de cada disciplina (normalizar texto 1 / texto 2 como na prévia do QuestionBank)
            const processedQuestions: Question[] = [];

            Object.entries(questionsBySubject).forEach(([subject, questions]) => {
                const processedSubjectQuestions = questions.map((q, questionIndex) => {
                    const normalized = normalizeQuestionForDisplay(q as Question & { formatted_text?: string; second_statement?: string });
                    if (
                        ["multiple_choice", "multipleChoice", "multiple_choice"].includes(normalized.type) &&
                        (normalized.options || normalized.alternatives) &&
                        Array.isArray(normalized.options || normalized.alternatives) &&
                        (normalized.options || normalized.alternatives).length > 0
                    ) {
                        const optionsToShuffle = normalized.options || normalized.alternatives || [];
                        const shuffledOptions = [...optionsToShuffle].sort(() => Math.random() - 0.5);

                        const positionMapping = shuffledOptions.map((shuffledOpt, shuffledIndex) => {
                            const originalIndex = optionsToShuffle.findIndex(originalOpt => originalOpt.id === shuffledOpt.id);
                            return {
                                shuffledIndex,
                                originalIndex,
                                originalLetter: String.fromCharCode(65 + originalIndex),
                                shuffledLetter: String.fromCharCode(65 + shuffledIndex),
                                originalText: optionsToShuffle[originalIndex].text,
                                shuffledText: shuffledOpt.text
                            };
                        });

                        return {
                            ...normalized,
                            options: shuffledOptions,
                            alternatives: shuffledOptions,
                            positionMapping
                        } as Question;
                    }
                    return normalized;
                });

                processedQuestions.push(...processedSubjectQuestions);
            });

            setShuffledQuestions(processedQuestions);
        }
    }, [testData, shuffledQuestions.length, normalizeQuestionForDisplay]);





    // ✅ Processar imagens após carregamento do HTML
    useEffect(() => {
        if (currentQuestionIndex >= 0 && testData?.questions?.[currentQuestionIndex]) {
            const timeoutId = setTimeout(() => {
                const questionContent = document.querySelector('.evaluation-question-content');
                if (questionContent) {
                    const images = questionContent.querySelectorAll('img');

                    images.forEach((img) => {
                        const parent = img.parentElement;

                        // Marcar como inline: dentro de <p> com texto ao redor OU dentro de <p>/<li> (fórmulas, raiz, símbolos pequenos)
                        if (parent) {
                            const isInP = parent.tagName === 'P';
                            const isInLi = parent.tagName === 'LI';
                            if (isInP) {
                                const before = img.previousSibling?.textContent?.trim() || '';
                                const after = img.nextSibling?.textContent?.trim() || '';
                                const hasTextAround = before.length > 0 || after.length > 0;
                                if (hasTextAround) img.classList.add('inline-image');
                                // Imagem sozinha no parágrafo (ex.: raiz, fórmula) também fica pequena
                                else img.classList.add('inline-image');
                            } else if (isInLi) {
                                img.classList.add('inline-image');
                            }
                        }

                        img.onerror = () => {
                            img.style.display = 'none';
                        };
                    });
                }
            }, 100);

            return () => clearTimeout(timeoutId);
        }
    }, [currentQuestionIndex, testData]);

    // ✅ Detectar quando todas as questões são respondidas
    useEffect(() => {
        // Só executar se não foi visto antes E não foi fechado pelo usuário
        if (hasSeenCompletionDialog || isCompletionDialogClosed) {
            return;
        }

        if (shuffledQuestions.length > 0 && Object.keys(answers).length === shuffledQuestions.length) {
            // Verificar se todas as respostas têm conteúdo
            const allAnswered = shuffledQuestions.every(question => {
                const answer = answers[question.id]?.answer;
                return answer && answer.trim() !== '';
            });
            
            if (allAnswered) {
                setShowCompletionDialog(true);
                setHasSeenCompletionDialog(true);
            }
        }
    }, [answers, shuffledQuestions, hasSeenCompletionDialog, isCompletionDialogClosed]);

    // ✅ Quando conclusão é de prova de competição, abrir modal de sucesso em vez de redirecionar
    useEffect(() => {
        if (evaluationState === 'completed' && evaluationContext === 'competicao') {
            setShowFullscreenQuestion(false);
            setShowCompletionDialog(false);
            setShowSubmitDialog(false);
            setIsCompletionDialogClosed(false);
            setShowCompetitionSuccessModal(true);
        }
    }, [evaluationState, evaluationContext]);

    // ✅ Redirecionamento automático quando avaliação é concluída (avaliação ou olimpíada; competição usa modal)
    useEffect(() => {
        if (evaluationState === 'completed' && evaluationContext !== 'competicao') {
            setShowFullscreenQuestion(false);
            setShowCompletionDialog(false);
            setShowSubmitDialog(false);
            setIsCompletionDialogClosed(false);
            const targetLabel = evaluationContext === 'olimpiada' ? 'olimpíadas' : 'avaliações';
            const targetPath = evaluationContext === 'olimpiada' ? '/aluno/olimpiadas' : '/aluno/avaliacoes';
            toast({
                title: "✅ Prova enviada com sucesso!",
                description: `Redirecionando para ${targetLabel}...`,
            });
            const timer = setTimeout(() => {
                navigate(targetPath);
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [evaluationState, results, navigate, toast, evaluationContext]);

    // ✅ REMOVIDO: useEffect duplicado que estava causando conflitos



    // Se não há evaluationId, mostrar erro
    if (!evaluationId) {
        return (
            <div className="flex items-center justify-center h-screen w-screen bg-background">
                <div className="max-w-md w-full mx-4">
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            ID da avaliação não encontrado na URL. Verifique o link e tente novamente.
                        </AlertDescription>
                    </Alert>
                </div>
            </div>
        );
    }

    // Loading state
    if (evaluationState === 'loading') {
        return (
            <div className="flex items-center justify-center h-screen w-screen bg-background">
                <div className="max-w-lg w-full mx-4 text-center">
                    <Card className="p-8 shadow-xl border-0 bg-white/80 dark:bg-card/80 backdrop-blur-sm">
                        <div className="space-y-8">
                            {/* Ícone animado */}
                            <div className="flex justify-center">
                                <div className="relative">
                                    <div className="w-24 h-24 bg-gradient-to-r from-purple-500 to-blue-600 rounded-full flex items-center justify-center animate-pulse">
                                        <Play className="h-12 w-12 text-white ml-1" />
                                    </div>
                                    {/* Círculos animados */}
                                    <div className="absolute inset-0 rounded-full border-4 border-purple-200 animate-ping"></div>
                                    <div className="absolute inset-0 rounded-full border-4 border-blue-200 animate-ping" style={{ animationDelay: '0.5s' }}></div>
                                </div>
                            </div>

                            {/* Título */}
                            <div className="space-y-2">
                                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                                    Preparando sua avaliação...
                                </h2>
                            </div>

                            {/* Barra de progresso animada */}
                            <div className="space-y-3">
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                                    <div className="bg-gradient-to-r from-purple-500 to-blue-600 h-full rounded-full animate-pulse" style={{ width: '60%' }}></div>
                                </div>
                                <div className="flex items-center justify-center gap-3">
                                    <Loader2 className="h-5 w-5 animate-spin text-purple-600 dark:text-purple-400" />
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Carregando...
                                    </span>
                                </div>
                            </div>

                            {/* Dicas animadas */}
                            <div className="space-y-2">
                                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                                    <div className="flex items-center justify-center gap-2">
                                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                                        <span>Preparando questões...</span>
                                    </div>
                                    <div className="flex items-center justify-center gap-2">
                                        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                        <span>Quase pronto!</span>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </Card>
                </div>
            </div>
        );
    }

    // Error state
    if (evaluationState === 'error') {
        return (
            <div className="flex items-center justify-center h-screen w-screen bg-background">
                <div className="max-w-md w-full mx-4">
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            <div className="space-y-4">
                                <div>
                                    <strong>Erro ao carregar a avaliação</strong>
                                </div>
                                <div className="text-sm">
                                    Possíveis causas:
                                    <ul className="list-disc list-inside mt-2 space-y-1">
                                        <li>Problemas de conectividade de rede</li>
                                        <li>ID da avaliação inválido: {evaluationId}</li>
                                        <li>Tente recarregar a página</li>
                                    </ul>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.location.reload()}
                                    >
                                        Tentar Novamente
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => navigate(returnPath)}
                                    >
                                        {returnLabel}
                                    </Button>
                                </div>
                            </div>
                        </AlertDescription>
                    </Alert>
                </div>
            </div>
        );
    }

    // Results screen - Mostrar resultados imediatos (ou modal de competição)
    if (evaluationState === 'completed') {
        const isCompetition = evaluationContext === 'competicao';
        const isOlimpiada = evaluationContext === 'olimpiada';
        const backPath = isOlimpiada ? '/aluno/olimpiadas' : '/aluno/avaliacoes';
        const backLabel = isOlimpiada ? 'Voltar às Olimpíadas' : 'Voltar às Avaliações';
        return (
            <div className="flex items-center justify-center min-h-screen w-screen bg-background p-4">
                <div className="max-w-lg w-full">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-center">
                                {results ? "✅ Prova Concluída!" : "⚠️ Prova Já Enviada"}
                            </CardTitle>
                            <div className="text-center space-y-2">
                                <h2 className="text-xl font-semibold">{competitionState?.competitionName ?? testData?.title}</h2>
                                {testData?.subject && (
                                  <DisciplineTag
                                    subjectId={testData.subject.id ?? ''}
                                    name={testData.subject.name}
                                  />
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className={`text-center space-y-4 p-4 rounded-lg border ${
                                results 
                                    ? 'bg-green-50 border-green-200' 
                                    : 'bg-yellow-50 border-yellow-200'
                            }`}>
                                {results ? (
                                    <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto" />
                                ) : (
                                    <AlertTriangle className="h-8 w-8 text-yellow-600 mx-auto" />
                                )}
                                <div className="space-y-2">
                                    <h3 className={`text-lg font-semibold ${
                                        results ? 'text-green-800' : 'text-yellow-800'
                                    }`}>
                                        {results 
                                            ? "Prova Enviada com Sucesso!" 
                                            : "Prova Já Foi Enviada Anteriormente"
                                        }
                                    </h3>
                                    {!isCompetition && (
                                        <p className={`text-sm ${
                                            results ? 'text-green-700' : 'text-yellow-700'
                                        }`}>
                                            Redirecionando em 2 segundos...
                                        </p>
                                    )}
                                </div>
                            </div>

                            {!isCompetition && (
                                <div className="text-center">
                                    <Button
                                        onClick={() => navigate(backPath)}
                                        className="bg-purple-600 hover:bg-purple-700"
                                    >
                                        <Home className="h-4 w-4 mr-2" />
                                        {backLabel}
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
                {isCompetition && (
                    <CompetitionSubmitSuccessModal
                        open={showCompetitionSuccessModal}
                        onOpenChange={setShowCompetitionSuccessModal}
                        participationCoins={competitionState?.participationCoins ?? 50}
                        showRankingButton={competitionState?.showRankingButton === true}
                        competitionId={competitionState?.competitionId}
                    />
                )}
            </div>
        );
    }

    // Active test screen
    if (evaluationState === 'active' && testData && session) {
        // ✅ Verificação adicional para garantir que os dados estão carregados
        if (!shuffledQuestions || shuffledQuestions.length === 0) {
            if (testData?.questions?.length) {
                setShuffledQuestions(testData.questions);
                return null; // Aguardar re-render
            }
            return (
                <div className="container mx-auto px-4 py-6">
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            <div className="space-y-4">
                                <div>
                                    <strong>❌ Avaliação sem questões</strong>
                                </div>
                                <div className="text-sm">
                                    <p>Esta avaliação não possui questões cadastradas. Possíveis causas:</p>
                                    <ul className="list-disc list-inside mt-2 space-y-1">
                                        <li>A avaliação foi criada mas não teve questões adicionadas</li>
                                        <li>Problema na configuração da avaliação</li>
                                        <li>Questões foram removidas ou não estão disponíveis</li>
                                    </ul>
                                </div>
                                <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg">
                                    <p className="text-sm text-purple-800">
                                        <strong>O que fazer:</strong>
                                    </p>
                                    <ul className="list-disc list-inside mt-1 text-sm text-purple-700">
                                        <li>Entre em contato com seu professor</li>
                                        <li>Verifique se a avaliação está corretamente configurada</li>
                                        <li>Aguarde até que as questões sejam adicionadas</li>
                                    </ul>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.location.reload()}
                                    >
                                        Tentar Novamente
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => navigate(returnPath)}
                                    >
                                        {returnLabel}
                                    </Button>
                                </div>
                            </div>
                        </AlertDescription>
                    </Alert>
                </div>
            );
        }

        const currentQuestion = shuffledQuestions?.[currentQuestionIndex];

        // ✅ Verificação de segurança para currentQuestion
        if (!currentQuestion) {
            return (
                <div className="container mx-auto px-4 py-6">
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            <div className="space-y-4">
                                <div>
                                    <strong>Erro ao carregar questão</strong>
                                </div>
                                <div className="text-sm">
                                    Questão não encontrada. Possíveis causas:
                                    <ul className="list-disc list-inside mt-2 space-y-1">
                                        <li>Índice da questão inválido: {currentQuestionIndex}</li>
                                        <li>Total de questões: {testData.questions?.length || 0}</li>
                                        <li>Dados da avaliação incompletos</li>
                                    </ul>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.location.reload()}
                                    >
                                        Tentar Novamente
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => navigate(returnPath)}
                                    >
                                        {returnLabel}
                                    </Button>
                                </div>
                            </div>
                        </AlertDescription>
                    </Alert>
                </div>
            );
        }

        return (
            <div className="h-screen w-screen bg-background flex flex-col overflow-hidden">
<style>
  {`
    /* Respeitar tamanho definido pelo usuário ao criar/editar (atributos width/height ou style) */
    .evaluation-question-content img[width],
    .evaluation-question-content img[height],
    .evaluation-question-content img[style*="width"],
    .evaluation-question-content img[style*="height"] {
        display: block !important;
        margin: 1.2rem auto !important;
        max-width: 100% !important;
        max-height: none !important;
        object-fit: contain !important;
        border-radius: 8px !important;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08) !important;
    }

    /* Padrão: imagens sem dimensão explícita ficam no tamanho de fórmula/símbolo */
    .evaluation-question-content img:not([width]):not([height]) {
        display: inline-block !important;
        vertical-align: middle !important;
        max-height: 1.4em !important;
        max-width: 2em !important;
        width: auto !important;
        height: auto !important;
        object-fit: contain !important;
        margin: 0 0.2rem !important;
    }

    /* Apenas imagens com classe .block-image (sem width/height) podem ser grandes */
    .evaluation-question-content img.block-image:not([width]):not([height]) {
        display: block !important;
        margin: 2rem auto !important;
        min-width: unset !important;
        max-height: 350px !important;
        max-width: 90% !important;
    }

    /* Imagens inline (reforço do padrão) */
    .evaluation-question-content img.inline-image {
        max-height: 1.4em !important;
        max-width: 2em !important;
        border-radius: 4px !important;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08) !important;
    }

    /* Ajustes por alinhamento só para block-image */
    .evaluation-question-content p[style*="text-align: center"] img.block-image {
        max-width: 80% !important;
    }
    .evaluation-question-content p[style*="text-align: right"] img.block-image {
        margin: 2rem 0 2rem auto !important;
        max-width: 60% !important;
    }
    .evaluation-question-content p[style*="text-align: left"] img.block-image {
        margin: 2rem auto 2rem 0 !important;
        max-width: 60% !important;
    }
    .evaluation-question-content p[style*="text-align: justify"] img.block-image {
        display: block;
        max-width: 80%;
        margin-left: auto;
        margin-right: auto;
    }

    /* Modal fullscreen customizado */
    .fullscreen-modal {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: 100vw !important;
        max-height: 100vh !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
        transform: none !important;
    }

    /* Line clamp para truncar texto */
    .line-clamp-3 {
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    /* Fluxo de texto como no editor: parágrafos contínuos, sem quebra por \\n */
    .evaluation-question-content .question-text-block .prose,
    .evaluation-question-content .question-text-block .prose p,
    .evaluation-question-content .question-text-block .prose h1,
    .evaluation-question-content .question-text-block .prose h2,
    .evaluation-question-content .question-text-block .prose h3 {
        white-space: normal;
    }
    /* Pouco espaçamento entre quebras de linha (parágrafos) — igual ao editor */
    .evaluation-question-content .question-text-block p {
        margin-top: 0.35rem;
    }
    .evaluation-question-content .question-text-block p:first-of-type {
        margin-top: 0;
    }
    /* Separação extra antes da referência bibliográfica (último parágrafo do Texto 2) */
    .evaluation-question-content .question-second-statement p:last-of-type {
        margin-top: 1.75rem;
    }

    /* Forçar alinhamento da edição na prova (sobrepõe .prose e temas) */
    .evaluation-question-content .question-text-block p[style*="text-align: center"],
    .evaluation-question-content .question-text-block h1[style*="text-align: center"],
    .evaluation-question-content .question-text-block h2[style*="text-align: center"],
    .evaluation-question-content .question-text-block h3[style*="text-align: center"] {
        text-align: center !important;
    }
    .evaluation-question-content .question-text-block p[style*="text-align: right"],
    .evaluation-question-content .question-text-block h1[style*="text-align: right"],
    .evaluation-question-content .question-text-block h2[style*="text-align: right"],
    .evaluation-question-content .question-text-block h3[style*="text-align: right"] {
        text-align: right !important;
    }
    .evaluation-question-content .question-text-block p[style*="text-align: left"],
    .evaluation-question-content .question-text-block h1[style*="text-align: left"],
    .evaluation-question-content .question-text-block h2[style*="text-align: left"],
    .evaluation-question-content .question-text-block h3[style*="text-align: left"] {
        text-align: left !important;
    }
    .evaluation-question-content .question-text-block p[style*="text-align: justify"],
    .evaluation-question-content .question-text-block h1[style*="text-align: justify"],
    .evaluation-question-content .question-text-block h2[style*="text-align: justify"],
    .evaluation-question-content .question-text-block h3[style*="text-align: justify"] {
        text-align: justify !important;
    }

    /* Media queries para responsividade (não alterar imagens com tamanho do usuário) */
    @media (max-width: 768px) {
      .evaluation-question-content img:not([width]):not([height]) {
        max-height: 1.35em !important;
        max-width: 1.85em !important;
      }
      .evaluation-question-content img.block-image:not([width]):not([height]) {
        max-height: 280px !important;
        margin: 1rem auto !important;
      }
    }

    @media (min-width: 769px) and (max-width: 1024px) {
      .evaluation-question-content img.block-image:not([width]):not([height]) {
        max-height: 320px !important;
      }
    }

    @media (min-width: 1536px) {
      .evaluation-question-content img.block-image:not([width]):not([height]) {
        max-height: 450px !important;
      }
    }

    /* Melhorias específicas para mobile no modo fullscreen */
    @media (max-width: 767px) {
      /* Garantir que em mobile vertical, a questão ocupe no máximo 40% da altura */
      .fullscreen-question-container {
        max-height: 40vh;
      }
      
      /* E as alternativas ocupem o restante */
      .fullscreen-options-container {
        min-height: 50vh;
      }
    }

    /* Otimizações para tablet */
    @media (min-width: 768px) and (max-width: 1023px) {
      .fullscreen-question-container {
        width: 55% !important;
      }
      
      .fullscreen-options-container {
        width: 45% !important;
      }
    }

    /* Otimizações para desktop grande */
    @media (min-width: 1536px) {
      .fullscreen-question-container {
        width: 60% !important;
      }
      
      .fullscreen-options-container {
        width: 40% !important;
      }
    }
  `}
</style>



                {/* Header fixo */}
                <div className="bg-white dark:bg-card border-b border-border shadow-sm flex-shrink-0">
                    <div className="px-2 sm:px-4 py-2">
                        <div className="flex items-center justify-between gap-2">
                            {/* Botão menu mobile (só aparece em mobile) */}
                            <div className="md:hidden">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowMobileNav(true)}
                                    className="h-8 w-8 p-0"
                                >
                                    <Menu className="h-5 w-5" />
                                </Button>
                            </div>
                            
                            {/* Espaço vazio à esquerda para balancear (só desktop) */}
                            <div className="hidden md:block w-24 lg:w-32"></div>
                            
                            {/* Conteúdo centralizado */}
                            <div className="flex-1 flex flex-col items-center text-center min-w-0">
                                <h1 className="text-xs sm:text-sm md:text-base font-semibold truncate w-full px-1 dark:text-gray-100">
                                    {competitionState?.competitionName ?? testData.title}
                                </h1>
                                <div className="text-xs text-muted-foreground">
                                    <span className="hidden sm:inline">Questão </span>
                                    {currentQuestionIndex + 1}/{shuffledQuestions.length}
                                </div>
                            </div>

                            {/* Timer à direita */}
                            <div className="w-auto md:w-24 lg:w-32 flex justify-end">
                                <div className="flex items-center gap-1 sm:gap-3">
                                    <EvaluationTimer
                                        timeRemaining={timeRemaining}
                                        isTimeUp={isTimeUp}
                                        isPaused={isPaused}
                                        timeLimitMinutes={testData?.duration ?? testData?.duration_minutes}
                                    />

                                    {(isSaving || isSavingPartial) && (
                                        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            <span className="hidden md:inline">{isSavingPartial ? 'Salvando respostas...' : 'Salvando...'}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden">
                    <div className="h-full flex">
                        {/* Navegação lateral - design moderno */}
                        <div className="hidden md:flex md:w-64 lg:w-72 xl:w-80 flex-col shrink-0 bg-gradient-to-b from-card to-card/95 dark:from-card dark:to-card/90 border-r border-border/80 shadow-[4px_0_24px_-8px_rgba(0,0,0,0.08)] dark:shadow-[4px_0_24px_-8px_rgba(0,0,0,0.3)]">
                            {/* Header */}
                            <div className="p-4 lg:p-5 border-b border-border/60">
                                <div className="flex items-center justify-between gap-2 mb-4">
                                    <div className="flex items-center gap-2.5">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                                            <Menu className="h-4 w-4 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-semibold text-foreground tracking-tight">Questões</h3>
                                            <p className="text-[11px] text-muted-foreground">
                                                {Object.keys(answers).length} de {shuffledQuestions.length} respondidas
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => setShowSubmitDialog(true)}
                                        disabled={isTimeUp || isSubmitting || Object.keys(answers).length < shuffledQuestions.length}
                                        className={`shrink-0 h-8 px-3 text-xs font-medium rounded-xl shadow-sm transition-all ${
                                            Object.keys(answers).length >= shuffledQuestions.length
                                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-md'
                                                : 'bg-muted text-muted-foreground cursor-not-allowed'
                                        }`}
                                        title={
                                            Object.keys(answers).length < shuffledQuestions.length
                                                ? `Responda todas as ${shuffledQuestions.length} questões primeiro`
                                                : 'Enviar avaliação'
                                        }
                                    >
                                        <Send className="h-3.5 w-3 mr-1.5" />
                                        Enviar
                                    </Button>
                                </div>
                                {/* Barra de progresso */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                                        <span>Progresso</span>
                                        <span className="tabular-nums text-foreground/80">{Math.round((Object.keys(answers).length / shuffledQuestions.length) * 100)}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-muted/80 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 transition-all duration-500 ease-out shadow-sm"
                                            style={{ width: `${(Object.keys(answers).length / shuffledQuestions.length) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                            {/* Grid de questões */}
                            <div className="flex-1 overflow-y-auto p-3 lg:p-4 min-h-0 take-evaluation-questions-scroll pr-1">
                                <div className="grid grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                                    {shuffledQuestions.map((question, index) => {
                                        const hasAnswer = answers[question.id]?.answer && answers[question.id]?.answer !== "";
                                        const isCurrent = index === currentQuestionIndex;

                                        return (
                                            <button
                                                key={question.id}
                                                className={`
                                                    relative w-10 h-10 lg:w-11 lg:h-11 xl:w-12 xl:h-12 rounded-xl text-xs lg:text-sm font-semibold flex items-center justify-center
                                                    transition-all duration-200 ease-out
                                                    ${isCurrent
                                                        ? 'bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/30 ring-2 ring-violet-400/50 scale-105'
                                                        : hasAnswer
                                                            ? 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-400/40 dark:border-emerald-500/40 hover:bg-emerald-500/25 dark:hover:bg-emerald-500/30 hover:scale-105'
                                                            : 'bg-muted/70 dark:bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted hover:text-foreground hover:scale-105 hover:border-border'
                                                    }
                                                    ${isTimeUp ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                                                `}
                                                onClick={() => !isTimeUp && navigateToQuestion(index)}
                                                disabled={isTimeUp}
                                                title={`Questão ${index + 1}${hasAnswer ? ' (Respondida)' : ''}`}
                                            >
                                                {index + 1}
                                                {hasAnswer && !isCurrent && (
                                                    <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* ✅ Área principal - MAIS VISÍVEL e PROFISSIONAL */}
                        <div className="flex-1 overflow-y-auto bg-background">
                            <div className="max-w-4xl mx-2 sm:mx-4 md:mx-auto p-3 sm:p-4 md:p-6">
                                {/* Navegação no topo (somente mobile) */}
                                <div className="md:hidden mb-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                navigateToQuestion(currentQuestionIndex - 1);
                                            }}
                                            onTouchEnd={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                navigateToQuestion(currentQuestionIndex - 1);
                                            }}
                                            disabled={currentQuestionIndex === 0 || isTimeUp}
                                            className="flex-1 h-9 rounded-lg font-semibold"
                                        >
                                            Anterior
                                        </Button>

                                        <Button
                                            size="sm"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                navigateToQuestion(currentQuestionIndex + 1);
                                            }}
                                            onTouchEnd={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                navigateToQuestion(currentQuestionIndex + 1);
                                            }}
                                            disabled={currentQuestionIndex === shuffledQuestions.length - 1 || isTimeUp}
                                            className="flex-1 h-9 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                                        >
                                            Proximo
                                        </Button>
                                    </div>
                                </div>

                                <Card className="evaluation-question-card question-fade-in dark:bg-card dark:border-border">
                                    <CardHeader className="evaluation-question-header p-4 sm:p-5 md:p-6 dark:bg-card dark:border-border">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                                                <div className="flex items-center gap-1 sm:gap-2">
                                                    <Badge variant="outline" className="bg-white dark:bg-purple-950/30 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs sm:text-sm">
                                                        <span className="hidden sm:inline">{`Questão ${currentQuestionIndex + 1}`}</span>
                                                        <span className="sm:hidden">{currentQuestionIndex + 1}</span>
                                                    </Badge>
                                                    {currentQuestion?.subject?.name && (
                                                        <Badge variant="outline" className="bg-white dark:bg-blue-950/30 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs sm:text-sm truncate max-w-[120px] sm:max-w-none">
                                                            {currentQuestion.subject.name}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className={`text-[10px] sm:text-xs font-semibold ${isAutoAdvanceEnabled
                                                            ? "text-green-700 dark:text-green-400"
                                                            : "text-red-700 dark:text-red-400"
                                                            }`}
                                                    >
                                                        {isAutoAdvanceEnabled ? "Auto avanço: ON" : "Auto avanço: OFF"}
                                                    </span>
                                                    <label
                                                        className="relative inline-block w-12 h-6 sm:w-14 sm:h-7 cursor-pointer"
                                                        title={isAutoAdvanceEnabled ? "Desativar avanço automático" : "Ativar avanço automático"}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isAutoAdvanceEnabled}
                                                            onChange={() => setIsAutoAdvanceEnabled((prev) => !prev)}
                                                            className="peer sr-only"
                                                            aria-label="Auto avanço"
                                                        />
                                                        <div
                                                            className={`absolute inset-0 rounded-full transition-colors duration-300 ease-in-out shadow-[inset_0_0_0_2px] peer-focus-visible:ring-2 peer-focus-visible:ring-violet-400 peer-focus-visible:ring-offset-2 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 sm:after:w-6 sm:after:h-6 after:rounded-full after:bg-white after:shadow-[0_2px_5px_rgba(0,0,0,0.2)] after:transition-transform after:duration-300 after:ease-in-out peer-checked:after:translate-x-6 sm:peer-checked:after:translate-x-7 ${isAutoAdvanceEnabled
                                                                ? "bg-green-500 shadow-green-600/80"
                                                                : "bg-red-500 shadow-red-600/70"
                                                                }`}
                                                        />
                                                    </label>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setShowFullscreenQuestion(true);
                                                    }}
                                                    className="h-7 w-7 sm:h-8 sm:w-8 p-0 flex-shrink-0"
                                                    title="Visualizar questão em tela cheia"
                                                >
                                                    <Maximize2 className="h-3 w-3 sm:h-4 sm:w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 md:space-y-10 dark:bg-card">
                                        {/* Conteúdo da Questão — Texto 1, Texto 2 e referência com espaço entre cada um */}
                                        <div className="evaluation-question-content space-y-8 sm:space-y-10">
                                            {/* Texto 1 — Primeiro enunciado */}
                                            {(currentQuestion?.formattedText || currentQuestion?.text) && (() => {
                                                const str = currentQuestion?.formattedText || currentQuestion?.text || '';
                                                return (
                                                    <div className="question-text-block rounded-xl border border-border bg-muted/30 dark:bg-muted/10 p-5 sm:p-6 md:p-7">
                                                        <div className="prose dark:prose-invert max-w-none text-foreground dark:text-gray-100 text-sm sm:text-base md:text-lg leading-relaxed [&_*]:dark:text-gray-100">
                                                            {isLikelyPlainText(str) ? (
                                                                <QuestionRenderer rawText={cleanLegacyText(str)} />
                                                            ) : (
                                                                <div
                                                                    className="question-enunciado-html"
                                                                    dangerouslySetInnerHTML={{
                                                                        __html: getQuestionHtmlForDisplay(str, BASE_URL),
                                                                    }}
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* Texto 2 — Segundo enunciado (referência bibliográfica ganha espaço no final) */}
                                            {currentQuestion?.secondStatement?.trim() && (() => {
                                                const str = currentQuestion.secondStatement.trim();
                                                return (
                                                    <div className="question-text-block question-second-statement rounded-xl border border-border bg-muted/30 dark:bg-muted/10 p-5 sm:p-6 md:p-7">
                                                        <div className="prose dark:prose-invert max-w-none text-foreground dark:text-gray-100 text-sm sm:text-base md:text-lg leading-relaxed [&_*]:dark:text-gray-100">
                                                            {isLikelyPlainText(str) ? (
                                                                <QuestionRenderer rawText={cleanLegacyText(str)} />
                                                            ) : (
                                                                <div
                                                                    className="question-enunciado-html"
                                                                    dangerouslySetInnerHTML={{
                                                                        __html: getQuestionHtmlForDisplay(str, BASE_URL),
                                                                    }}
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Opções de Resposta */}
                                        <div className="rounded-xl sm:rounded-2xl border border-border bg-card shadow p-4 sm:p-5 md:p-6">
                                            <QuestionOptions
                                                question={currentQuestion}
                                                answer={answers[currentQuestion?.id]?.answer}
                                                onAnswerChange={(newAnswer) => {
                                                    if (currentQuestion?.id) {
                                                        const displayAnswer = Array.isArray(newAnswer) ? newAnswer[0] : newAnswer;
                                                        const originalLetter = mapAnswerToOriginalLetter(currentQuestion.id, displayAnswer);
                                                        saveAnswer(currentQuestion.id, originalLetter);

                                                        // Avanço automático
                                                        if (
                                                            isAutoAdvanceEnabled &&
                                                            ['multiple_choice', 'multipleChoice', 'true_false', 'truefalse'].includes(
                                                                currentQuestion.type,
                                                            ) &&
                                                            newAnswer &&
                                                            currentQuestionIndex < shuffledQuestions.length - 1
                                                        ) {
                                                            setTimeout(() => {
                                                                navigateToQuestion(currentQuestionIndex + 1);
                                                            }, 1000);
                                                        }
                                                    }
                                                }}
                                                disabled={isTimeUp}
                                            />
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* ✅ Navegação SIMPLIFICADA para crianças */}
                                <div className="hidden md:flex items-center justify-between pt-4 sm:pt-6 border-t border-border gap-2 sm:gap-4">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            navigateToQuestion(currentQuestionIndex - 1);
                                        }}
                                        onTouchEnd={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            navigateToQuestion(currentQuestionIndex - 1);
                                        }}
                                        disabled={currentQuestionIndex === 0 || isTimeUp}
                                        className="px-3 sm:px-6 md:px-8 py-2 sm:py-3 md:py-4 text-sm sm:text-base md:text-lg font-bold border-2 rounded-lg sm:rounded-xl hover:bg-muted active:bg-muted/80 disabled:opacity-50 touch-manipulation"
                                    >
                                        <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 mr-1 sm:mr-2 md:mr-3" />
                                        <span className="hidden xs:inline">← Voltar</span>
                                        <span className="xs:hidden">←</span>
                                    </Button>

                                    <div className="text-xs sm:text-sm md:text-base lg:text-lg font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 md:py-3 rounded-full whitespace-nowrap">
                                        {currentQuestionIndex + 1} <span className="hidden xs:inline">de</span><span className="xs:hidden">/</span> {shuffledQuestions.length}
                                    </div>

                                    <Button
                                        size="sm"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            navigateToQuestion(currentQuestionIndex + 1);
                                        }}
                                        onTouchEnd={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            navigateToQuestion(currentQuestionIndex + 1);
                                        }}
                                        disabled={currentQuestionIndex === shuffledQuestions.length - 1 || isTimeUp}
                                        className="px-3 sm:px-6 md:px-8 py-2 sm:py-3 md:py-4 text-sm sm:text-base md:text-lg font-bold bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-lg sm:rounded-xl shadow-lg hover:shadow-xl transition-all touch-manipulation"
                                    >
                                        <span className="hidden xs:inline">Avançar →</span>
                                        <span className="xs:hidden">→</span>
                                        <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 ml-1 sm:ml-2 md:ml-3" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                 {/* ✅ Botão flutuante mobile para navegação */}
                 <div className="md:hidden fixed bottom-4 right-4 z-30">
                    <Button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowMobileNav(true);
                        }}
                        onTouchEnd={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowMobileNav(true);
                        }}
                        className="rounded-full w-14 h-14 sm:w-16 sm:h-16 shadow-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white flex flex-col items-center justify-center p-2 touch-manipulation"
                        title="Abrir navegação"
                    >
                        <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
                        <span className="text-[10px] sm:text-xs font-semibold mt-0.5">
                            {Object.keys(answers).length}/{shuffledQuestions.length}
                        </span>
                    </Button>
                </div>

                 {/* ✅ Modal de navegação móvel */}
                 {showMobileNav && (
                     <>
                         {/* Overlay com blur ATRÁS */}
                         <div 
                             className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                             onClick={(e) => {
                                 e.preventDefault();
                                 e.stopPropagation();
                                 setShowMobileNav(false);
                             }}
                             onTouchEnd={(e) => {
                                 e.preventDefault();
                                 e.stopPropagation();
                                 setShowMobileNav(false);
                             }}
                         />
                         
                         {/* Modal de navegação - design moderno */}
                         <div className="fixed inset-x-0 bottom-0 z-50 bg-gradient-to-b from-card to-card/98 dark:from-card dark:to-card/95 rounded-t-3xl shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.4)] border-t border-border/60 max-h-[85vh] flex flex-col animate-slide-up">
                             {/* Alça visual */}
                             <div className="flex justify-center pt-3 pb-1">
                                 <div className="w-12 h-1 rounded-full bg-muted-foreground/20" />
                             </div>
                             {/* Header */}
                             <div className="px-4 pb-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                                        <Menu className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold text-foreground tracking-tight">Questões</h3>
                                        <p className="text-xs text-muted-foreground">
                                            {Object.keys(answers).length} de {shuffledQuestions.length} respondidas
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setShowMobileNav(false);
                                    }}
                                    onTouchEnd={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setShowMobileNav(false);
                                    }}
                                    className="h-9 w-9 rounded-xl touch-manipulation"
                                >
                                    <X className="h-5 w-5" />
                                </Button>
                             </div>
                             {/* Barra de progresso */}
                             <div className="px-4 pb-4">
                                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground mb-2">
                                    <span>Progresso</span>
                                    <span className="tabular-nums text-foreground/80">{Math.round((Object.keys(answers).length / shuffledQuestions.length) * 100)}%</span>
                                </div>
                                <div className="w-full h-2.5 bg-muted/80 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 transition-all duration-500 ease-out"
                                        style={{ width: `${(Object.keys(answers).length / shuffledQuestions.length) * 100}%` }}
                                    />
                                </div>
                             </div>
                             {/* Grid de questões */}
                             <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0 take-evaluation-questions-scroll pr-1">
                                <div className="grid grid-cols-5 sm:grid-cols-6 gap-2.5">
                                    {shuffledQuestions.map((question, index) => {
                                        const hasAnswer = answers[question.id]?.answer && answers[question.id]?.answer !== "";
                                        const isCurrent = index === currentQuestionIndex;

                                        return (
                                            <button
                                                key={question.id}
                                                className={`
                                                    relative w-full aspect-square rounded-xl text-sm font-semibold flex items-center justify-center
                                                    transition-all duration-200 ease-out
                                                    ${isCurrent
                                                        ? 'bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/30 ring-2 ring-violet-400/50 scale-105'
                                                        : hasAnswer
                                                            ? 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-400/40 dark:border-emerald-500/40 hover:bg-emerald-500/25 dark:hover:bg-emerald-500/30 hover:scale-105'
                                                            : 'bg-muted/70 dark:bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted hover:text-foreground hover:scale-105 hover:border-border'
                                                    }
                                                    ${isTimeUp ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                                                `}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (!isTimeUp) {
                                                        navigateToQuestion(index);
                                                        setShowMobileNav(false);
                                                    }
                                                }}
                                                onTouchEnd={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (!isTimeUp) {
                                                        navigateToQuestion(index);
                                                        setShowMobileNav(false);
                                                    }
                                                }}
                                                disabled={isTimeUp}
                                            >
                                                {index + 1}
                                                {hasAnswer && !isCurrent && (
                                                    <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                                        <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                             </div>
                             {/* Botão enviar */}
                             <div className="p-4 pt-3 border-t border-border/60 bg-muted/30 dark:bg-muted/20">
                                <Button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setShowMobileNav(false);
                                        setShowSubmitDialog(true);
                                    }}
                                    onTouchEnd={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setShowMobileNav(false);
                                        setShowSubmitDialog(true);
                                    }}
                                    disabled={isTimeUp || isSubmitting || Object.keys(answers).length < shuffledQuestions.length}
                                    className={`w-full py-4 text-base font-semibold rounded-xl touch-manipulation transition-all ${
                                        Object.keys(answers).length >= shuffledQuestions.length
                                            ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-lg hover:shadow-md'
                                            : 'bg-muted text-muted-foreground cursor-not-allowed'
                                    }`}
                                >
                                    <Send className="h-5 w-5 mr-2" />
                                    Enviar ({Object.keys(answers).length}/{shuffledQuestions.length})
                                </Button>
                                {Object.keys(answers).length < shuffledQuestions.length && (
                                    <p className="text-xs text-center text-muted-foreground mt-2">
                                        Responda todas as questões para enviar
                                    </p>
                                )}
                             </div>
                         </div>
                     </>
                 )}

                 {/* Dialog de confirmação de envio */}
                 {showSubmitDialog && (
                     <>
                         {/* Overlay com blur ATRÁS */}
                         <div 
                             className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm cursor-pointer"
                             onClick={(e) => {
                                 e.preventDefault();
                                 e.stopPropagation();
                                 setShowSubmitDialog(false);
                             }}
                             onTouchEnd={(e) => {
                                 e.preventDefault();
                                 e.stopPropagation();
                                 setShowSubmitDialog(false);
                             }}
                         />
                         
                         {/* Modal na FRENTE */}
                         <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pointer-events-none">
                             <div 
                                 className="bg-card rounded-xl sm:rounded-2xl shadow-2xl max-w-md w-full mx-2 sm:mx-4 border border-border pointer-events-auto"
                                 onClick={(e) => e.stopPropagation()}
                                 onTouchEnd={(e) => e.stopPropagation()}
                             >
                                 <div className="p-4 sm:p-6 pb-3 sm:pb-4">
                                     <div className="space-y-3 sm:space-y-4">
                                         <h2 className="text-lg sm:text-xl font-bold text-foreground">Confirmar envio da avaliação</h2>
                                         <div className="space-y-2">
                                             <p className="text-sm sm:text-base mb-3 sm:mb-4 text-muted-foreground">Você tem certeza que deseja enviar sua avaliação?</p>
                                             <div className="text-sm sm:text-base font-medium">
                                                 Questões respondidas: <span className="text-purple-600">{Object.keys(answers).length}</span> de {shuffledQuestions.length || 0}
                                             </div>
                                         </div>
                                     </div>
                                 </div>
                                 <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 px-4 sm:px-6 pb-4 sm:pb-6">
                                     <button
                                         className="flex-1 px-4 py-3 sm:py-2.5 text-sm sm:text-base border border-border rounded-lg hover:bg-muted active:bg-muted/80 disabled:opacity-50 font-medium order-2 sm:order-1 touch-manipulation"
                                         onClick={(e) => {
                                             e.preventDefault();
                                             e.stopPropagation();
                                             setShowSubmitDialog(false);
                                         }}
                                         onTouchEnd={(e) => {
                                             e.preventDefault();
                                             e.stopPropagation();
                                             setShowSubmitDialog(false);
                                         }}
                                         disabled={isSubmitting}
                                     >
                                         Cancelar
                                     </button>
                                     <button
                                         className="flex-1 px-4 py-3 sm:py-2.5 text-sm sm:text-base bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 font-semibold order-1 sm:order-2 touch-manipulation"
                                         onClick={(e) => {
                                             e.preventDefault();
                                             e.stopPropagation();
                                             
                                             if (isSubmitting) {
                                                 return;
                                             }
                                             // ✅ NOVO: Verificar se já foi enviada
                                             if (evaluationState !== 'active') {
                                                 return;
                                             }
                                             
                                             // ✅ CORRIGIDO: Chamar handleSubmitTest com proteção adicional
                                             handleSubmitTest(false);
                                         }}
                                         onTouchEnd={(e) => {
                                             e.preventDefault();
                                             e.stopPropagation();
                                             
                                             if (isSubmitting) {
                                                 return;
                                             }
                                             if (evaluationState !== 'active') {
                                                 return;
                                             }
                                             
                                             handleSubmitTest(false);
                                         }}
                                         disabled={isSubmitting}
                                     >
                                         {isSubmitting ? "Enviando..." : "Confirmar Envio"}
                                     </button>
                                 </div>
                             </div>
                         </div>
                     </>
                 )}

                 {/* ✅ Dialog de confirmação quando todas as questões são respondidas */}
                 {showCompletionDialog && (
                     <>
                         {/* Overlay com blur ATRÁS */}
                         <div 
                             className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm cursor-pointer"
                             onClick={(e) => {
                                 e.preventDefault();
                                 e.stopPropagation();
                                 setShowCompletionDialog(false);
                                 setHasSeenCompletionDialog(false);
                                 setIsCompletionDialogClosed(true);
                             }}
                             onTouchEnd={(e) => {
                                 e.preventDefault();
                                 e.stopPropagation();
                                 setShowCompletionDialog(false);
                                 setHasSeenCompletionDialog(false);
                                 setIsCompletionDialogClosed(true);
                             }}
                         />
                         
                         {/* Modal na FRENTE */}
                         <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pointer-events-none">
                             <div className="bg-white dark:bg-card rounded-xl sm:rounded-2xl shadow-2xl max-w-md w-full mx-2 sm:mx-4 border border-gray-200 dark:border-border pointer-events-auto">
                                 <div className="p-4 sm:p-6 pb-3 sm:pb-4">
                                     <div className="text-center space-y-3 sm:space-y-4">
                                         <div className="flex items-center justify-center">
                                             <CheckCircle2 className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-green-600 dark:text-green-400" />
                                         </div>
                                         <div className="space-y-2">
                                             <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-green-700 dark:text-green-400">
                                                 Avaliação Concluída
                                             </h2>
                                             <p className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 dark:text-gray-200 leading-relaxed px-2">
                                                 Todas as questões foram respondidas com sucesso.
                                             </p>
                                             <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 px-2">
                                                 Deseja enviar sua avaliação agora para finalização?
                                             </p>
                                         </div>
                                     </div>
                                 </div>

                                 <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 px-4 sm:px-6 pb-4 sm:pb-6">
                                     <button
                                         className="w-full sm:w-auto order-2 sm:order-1 bg-muted hover:bg-muted/80 text-foreground font-medium py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg transition-colors text-sm sm:text-base"
                                         onClick={() => {
                                             setShowCompletionDialog(false);
                                             setHasSeenCompletionDialog(false);
                                             setIsCompletionDialogClosed(true);
                                         }}
                                     >
                                         <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 inline" />
                                         Revisar Respostas
                                     </button>

                                     <button
                                         className="w-full sm:w-auto order-1 sm:order-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg transition-colors shadow-lg hover:shadow-xl text-sm sm:text-base flex items-center justify-center"
                                         onClick={() => {
                                             if (isSubmitting) {
                                                 return;
                                             }
                                             if (evaluationState !== 'active') {
                                                 return;
                                             }

                                             // Não fechar modal imediatamente - deixar o hook gerenciar - deixar o hook gerenciar
                                             // Apenas marcar que está enviando
                                             setHasSeenCompletionDialog(false);
                                             
                                             // ✅ NOVO: Chamar handleSubmitTest diretamente
                                             handleSubmitTest(false);
                                         }}
                                         disabled={isSubmitting}
                                     >
                                         {isSubmitting ? (
                                             <>
                                                 <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 animate-spin inline" />
                                                 Enviando...
                                             </>
                                         ) : (
                                             <>
                                                 <Send className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 inline" />
                                                 Confirmar Envio
                                             </>
                                         )}
                                     </button>
                                 </div>
                             </div>
                         </div>
                     </>
                 )}

               {/* ✅ Modal de visualização em tela cheia - MELHORADO */}
               {showFullscreenQuestion && (
                   <div 
                       className="fixed inset-0 z-[9999] bg-background flex flex-col"
                       style={{
                           position: 'fixed',
                           top: 0,
                           left: 0,
                           right: 0,
                           bottom: 0,
                           width: '100vw',
                           height: '100vh',
                           zIndex: 9999
                       }}
                   >
                       {/* Header - MELHORADO */}
                       <div className="flex items-center justify-between px-3 sm:px-4 md:px-6 lg:px-8 py-2 sm:py-3 bg-card border-b border-border shadow-sm flex-shrink-0">
                           <div className="flex items-center gap-2 sm:gap-3 md:gap-4 min-w-0 flex-1">
                               <h2 className="text-sm sm:text-base md:text-lg lg:text-xl font-bold truncate">
                                   <span className="hidden sm:inline">Questão </span>
                                   {currentQuestionIndex + 1}<span className="hidden xs:inline"> de {shuffledQuestions.length}</span>
                               </h2>
                               {currentQuestion?.subject?.name && (
                                   <Badge variant="outline" className="bg-purple-50 dark:bg-purple-950/30 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs sm:text-sm truncate max-w-[100px] sm:max-w-[150px] md:max-w-none">
                                       {currentQuestion.subject.name}
                                   </Badge>
                               )}
                           </div>
                           <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
                               {/* Status de resposta */}
                               <span className="text-xs sm:text-sm text-muted-foreground hidden xs:block">
                                   {answers[currentQuestion?.id]?.answer ? (
                                       <span className="flex items-center gap-1 sm:gap-2 text-green-600 font-medium">
                                           <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4" />
                                           <span className="hidden md:inline">Respondida</span>
                                           <span className="md:hidden">✓</span>
                                       </span>
                                   ) : (
                                       <span className="text-muted-foreground hidden lg:inline">
                                           Não respondida
                                       </span>
                                   )}
                               </span>
                               {/* Botão fechar */}
                               <Button
                                   variant="ghost"
                                   size="sm"
                                   onClick={(e) => {
                                       e.preventDefault();
                                       e.stopPropagation();
                                       setShowFullscreenQuestion(false);
                                   }}
                                   className="h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 p-0 hover:bg-muted rounded-full"
                                   title="Fechar visualização"
                               >
                                   <X className="h-4 w-4 sm:h-5 sm:w-5" />
                               </Button>
                           </div>
                       </div>
                       
                       {/* Conteúdo principal - MELHORADO */}
                       <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                           {/* Lado esquerdo/topo - Questão */}
                          <div className="fullscreen-question-container hide-scrollbar flex-1 bg-card overflow-y-auto md:w-1/2 lg:w-3/5 xl:w-2/3">
                               <div className="p-4 sm:p-5 md:p-6 lg:p-8 xl:p-10 max-w-4xl mx-auto">
                                   <div className="evaluation-question-content space-y-8 sm:space-y-10">
                                       {/* Texto 1 — Primeiro enunciado */}
                                       {(currentQuestion?.formattedText || currentQuestion?.text) && (() => {
                                           const str = currentQuestion?.formattedText || currentQuestion?.text || '';
                                           return (
                                               <div className="question-text-block rounded-xl border border-border bg-muted/30 dark:bg-muted/10 p-5 sm:p-6 md:p-7">
                                                   <div 
                                                       className="prose dark:prose-invert prose-sm sm:prose-base md:prose-lg lg:prose-xl max-w-none text-foreground dark:text-gray-100 [&_*]:dark:text-gray-100"
                                                       style={{ 
                                                           fontSize: 'clamp(0.875rem, 1.5vw + 0.5rem, 1.375rem)', 
                                                           lineHeight: '1.75' 
                                                       }}
                                                   >
                                                       {isLikelyPlainText(str) ? (
                                                           <QuestionRenderer rawText={cleanLegacyText(str)} />
                                                       ) : (
                                                           <div
                                                               className="question-enunciado-html"
                                                               dangerouslySetInnerHTML={{
                                                                   __html: getQuestionHtmlForDisplay(str, BASE_URL),
                                                               }}
                                                           />
                                                       )}
                                                   </div>
                                               </div>
                                           );
                                       })()}

                                       {/* Texto 2 — Segundo enunciado (referência bibliográfica com espaço abaixo) */}
                                       {currentQuestion?.secondStatement?.trim() && (() => {
                                           const str = currentQuestion.secondStatement.trim();
                                           return (
                                               <div className="question-text-block question-second-statement rounded-xl border border-border bg-muted/30 dark:bg-muted/10 p-5 sm:p-6 md:p-7">
                                                   <div 
                                                       className="prose dark:prose-invert prose-sm sm:prose-base md:prose-lg lg:prose-xl max-w-none text-foreground dark:text-gray-100 [&_*]:dark:text-gray-100"
                                                       style={{ 
                                                           fontSize: 'clamp(0.875rem, 1.5vw + 0.5rem, 1.375rem)', 
                                                           lineHeight: '1.75' 
                                                       }}
                                                   >
                                                       {isLikelyPlainText(str) ? (
                                                           <QuestionRenderer rawText={cleanLegacyText(str)} />
                                                       ) : (
                                                           <div
                                                               className="question-enunciado-html"
                                                               dangerouslySetInnerHTML={{
                                                                   __html: getQuestionHtmlForDisplay(str, BASE_URL),
                                                               }}
                                                           />
                                                       )}
                                                   </div>
                                               </div>
                                           );
                                       })()}
                                   </div>
                               </div>
                           </div>

                           {/* Divisor */}
                           <div className="h-px md:h-auto md:w-px bg-border flex-shrink-0"></div>

                           {/* Lado direito/baixo - Alternativas */}
                          <div className="fullscreen-options-container hide-scrollbar flex-1 flex flex-col bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-purple-950/30 dark:via-blue-950/30 dark:to-indigo-950/30 overflow-y-auto md:w-1/2 lg:w-2/5 xl:w-1/3">
                               <div className="p-4 sm:p-5 md:p-6 lg:p-8">
                                   <h3 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-3 sm:mb-4 md:mb-6 sticky top-0 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-purple-950/30 dark:via-blue-950/30 dark:to-indigo-950/30 pb-2 z-10">
                                       Alternativas:
                                   </h3>
                                  <div className="mb-3 flex items-center gap-3">
                                      <span
                                          className={`text-xs font-semibold ${isAutoAdvanceEnabled
                                              ? "text-green-700 dark:text-green-400"
                                              : "text-red-700 dark:text-red-400"
                                              }`}
                                      >
                                          {isAutoAdvanceEnabled ? "Auto avanço: ON" : "Auto avanço: OFF"}
                                      </span>
                                      <label
                                          className="relative inline-block w-14 h-7 cursor-pointer"
                                          title={isAutoAdvanceEnabled ? "Desativar avanço automático" : "Ativar avanço automático"}
                                      >
                                          <input
                                              type="checkbox"
                                              checked={isAutoAdvanceEnabled}
                                              onChange={() => setIsAutoAdvanceEnabled((prev) => !prev)}
                                              className="peer sr-only"
                                              aria-label="Auto avanço"
                                          />
                                          <div
                                              className={`absolute inset-0 rounded-full transition-colors duration-300 ease-in-out shadow-[inset_0_0_0_2px] peer-focus-visible:ring-2 peer-focus-visible:ring-violet-400 peer-focus-visible:ring-offset-2 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-6 after:h-6 after:rounded-full after:bg-white after:shadow-[0_2px_5px_rgba(0,0,0,0.2)] after:transition-transform after:duration-300 after:ease-in-out peer-checked:after:translate-x-7 ${isAutoAdvanceEnabled
                                                  ? "bg-green-500 shadow-green-600/80"
                                                  : "bg-red-500 shadow-red-600/70"
                                                  }`}
                                          />
                                      </label>
                                  </div>
                                   <div className="space-y-3 sm:space-y-4">
                                       <QuestionOptions
                                           question={currentQuestion}
                                           answer={answers[currentQuestion?.id]?.answer}
                                           onAnswerChange={(answer) => {
                                               if (currentQuestion?.id) {
                                                   // ✅ NOVO: Mapear resposta para letra original antes de salvar
                                                   const displayAnswer = Array.isArray(answer) ? answer[0] : answer;
                                                   const originalLetter = mapAnswerToOriginalLetter(currentQuestion.id, displayAnswer);
                                                   
                                                   // Salvar a letra original (A, B, C, D...) no backend
                                                   saveAnswer(currentQuestion.id, originalLetter);
                                                   
                                                   // ✅ NOVO: Verificar se todas as questões foram respondidas (com fallback para tablets)
                                                   setTimeout(() => {
                                                       // ✅ MELHORADO: Verificação mais robusta para tablets
                                                       const totalQuestions = shuffledQuestions.length;
                                                       
                                                       // Aguardar um pouco mais para garantir que a resposta foi salva
                                                       setTimeout(() => {
                                                           // Re-verificar após delay adicional para tablets
                                                           const currentAnsweredQuestions = Object.keys(answers).length;
                                                           
                                                           if (currentAnsweredQuestions >= totalQuestions) {
                                                               // Todas as questões foram respondidas - fechar fullscreen e mostrar confirmação
                                                               setShowFullscreenQuestion(false);
                                                               // ✅ NOVO: Delay adicional para tablets para garantir transição suave
                                                               setTimeout(() => {
                                                                   setShowSubmitDialog(true);
                                                               }, 100);
                                                          } else if (
                                                              isAutoAdvanceEnabled &&
                                                              currentQuestionIndex < shuffledQuestions.length - 1
                                                          ) {
                                                               // Não é a última questão - navegar para a próxima
                                                               navigateToQuestion(currentQuestionIndex + 1);
                                                           }
                                                       }, 200); // Delay adicional para tablets
                                                   }, 300); // Delay inicial reduzido
                                               }
                                           }}
                                           disabled={false}
                                       />
                                   </div>
                               </div>
                           </div>
                       </div>

                       {/* Footer com navegação - NOVO */}
                       <div className="flex items-center justify-between px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 bg-card border-t border-border shadow-lg flex-shrink-0">
                           <Button
                               variant="outline"
                               size="sm"
                               onClick={() => {
                                   if (currentQuestionIndex > 0) {
                                       navigateToQuestion(currentQuestionIndex - 1);
                                   }
                               }}
                               disabled={currentQuestionIndex === 0}
                               className="px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 text-sm sm:text-base font-semibold"
                           >
                               <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
                               <span className="hidden xs:inline">Anterior</span>
                               <span className="xs:hidden">←</span>
                           </Button>

                           <div className="flex items-center gap-2 sm:gap-3">
                               <span className="text-xs sm:text-sm md:text-base font-semibold text-foreground bg-muted px-3 sm:px-4 py-1.5 sm:py-2 rounded-full">
                                   {currentQuestionIndex + 1} / {shuffledQuestions.length}
                               </span>
                               <Button
                                   variant="ghost"
                                   size="sm"
                                   onClick={(e) => {
                                       e.preventDefault();
                                       e.stopPropagation();
                                       setShowFullscreenQuestion(false);
                                   }}
                                   className="text-xs sm:text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30"
                               >
                                   <X className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                                   <span className="hidden sm:inline">Fechar</span>
                               </Button>
                           </div>

                           <Button
                               size="sm"
                               onClick={() => {
                                   if (currentQuestionIndex < shuffledQuestions.length - 1) {
                                       navigateToQuestion(currentQuestionIndex + 1);
                                   }
                               }}
                               disabled={currentQuestionIndex === shuffledQuestions.length - 1}
                               className="px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 text-sm sm:text-base font-semibold bg-purple-600 hover:bg-purple-700"
                           >
                               <span className="hidden xs:inline">Próxima</span>
                               <span className="xs:hidden">→</span>
                               <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 ml-1 sm:ml-2" />
                           </Button>
                       </div>
                   </div>
               )}
            </div>
        );
    }

    return null;
}



// Componente para opções de resposta
function QuestionOptions({
    question,
    answer,
    onAnswerChange,
    disabled
}: {
    question: Question;
    answer?: string;
    onAnswerChange: (answer: string | string[] | null) => void;
    disabled: boolean;
}) {
    if (question.type === "multiple_choice" || question.type === "multipleChoice") {
        // Usar options (que existe) ou alternatives (fallback)
        const questionOptions = question.options || question.alternatives || [];

        return (
            <div className="space-y-4 sm:space-y-6">
                <div className="text-base sm:text-lg md:text-xl font-bold text-foreground mb-4 sm:mb-6">
                    Selecione a alternativa correta:
                </div>
                <RadioGroup
                    value={(() => {
                        // ✅ CORRIGIDO: Buscar pelo ID da resposta nas opções (answer é a letra A, B, C, D)
                        if (!answer) return "";
                        const option = questionOptions.find(opt => opt.id === answer);
                        const optionId = option?.id || "";
                        return optionId;
                    })()}
                    onValueChange={(val) => {
                        const option = questionOptions.find(opt => opt.id === val);
                        if (option) {
                            onAnswerChange(option.id);
                        } else {
                            onAnswerChange("");
                        }
                    }}
                    disabled={disabled}
                >
                    {questionOptions.map((option, index) => {
                        const optionId = option.id || `option-${index}`;
                        const optionText = typeof option.text === 'string' ? option.text : '';
                        // ✅ CORRIGIDO: Marcar como selecionado se answer for o ID da opção
                        const isSelected = answer === optionId;
                        

                        return (
                            <div
                                key={optionId}
                                className={`flex items-start space-x-3 sm:space-x-4 p-4 sm:p-5 md:p-6 rounded-lg sm:rounded-xl border-2 cursor-pointer transition-all hover:bg-muted ${isSelected
                                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30 ring-2 sm:ring-4 ring-purple-200 dark:ring-purple-800 shadow-lg'
                                    : 'border-border hover:border-border/80 hover:shadow-md'
                                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                onClick={() => !disabled && onAnswerChange(optionId)}
                            >
                                <RadioGroupItem
                                    value={optionId}
                                    id={optionId}
                                    className="mt-0.5 sm:mt-1 w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0"
                                />
                                <Label
                                    htmlFor={optionId}
                                    className="flex-1 cursor-pointer text-sm sm:text-base md:text-lg leading-relaxed"
                                >
                                    <div className="flex items-start gap-2 sm:gap-3">
                                        <span className="font-bold text-foreground min-w-[24px] sm:min-w-[30px] text-base sm:text-lg md:text-xl flex-shrink-0">
                                            {String.fromCharCode(65 + index)})
                                        </span>
                                        <QuestionOptionContent
                                            text={optionText}
                                            image={option.image}
                                            questionId={question.id}
                                            apiBase={BASE_URL}
                                            textClassName="text-sm sm:text-base md:text-lg leading-relaxed"
                                        />
                                    </div>
                                </Label>
                            </div>
                        );
                    })}
                </RadioGroup>
            </div>
        );
    }

    if (question.type === "true_false" || question.type === "truefalse") {
        return (
            <div className="space-y-4 sm:space-y-6">
                <div className="text-base sm:text-lg md:text-xl font-bold text-foreground mb-4 sm:mb-6">
                    Selecione Verdadeiro ou Falso:
                </div>
                <RadioGroup
                    value={answer || ""}
                    onValueChange={onAnswerChange}
                    disabled={disabled}
                >
                    {[
                        { id: "true", text: "Verdadeiro" },
                        { id: "false", text: "Falso" }
                    ].map((option) => {
                        const isSelected = answer === option.id;

                        return (
                            <div
                                key={option.id}
                                className={`flex items-center space-x-3 sm:space-x-4 p-4 sm:p-5 md:p-6 rounded-lg sm:rounded-xl border-2 cursor-pointer transition-all hover:bg-muted ${isSelected
                                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30 ring-2 sm:ring-4 ring-purple-200 dark:ring-purple-800 shadow-lg'
                                    : 'border-border hover:border-border/80 hover:shadow-md'
                                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                onClick={() => !disabled && onAnswerChange(option.id)}
                            >
                                <RadioGroupItem value={option.id} id={option.id} className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                                <Label htmlFor={option.id} className="flex-1 cursor-pointer font-bold text-sm sm:text-base md:text-lg">
                                    {option.text}
                                </Label>
                            </div>
                        );
                    })}
                </RadioGroup>
            </div>
        );
    }

    if (question.type === "multiple_answer") {
        const selectedAnswers = answer ? answer.split(',') : [];
        // Usar options (que existe) ou alternatives (fallback)
        const questionOptions = question.options || question.alternatives || [];

        return (
            <div className="space-y-3">
                <div className="text-sm sm:text-base font-medium text-muted-foreground mb-3">
                    Selecione todas as alternativas corretas:
                </div>
                <div className="space-y-2">
                    {questionOptions.map((option, index) => {
                        const optionId = option.id || `option-${index}`;
                        const optionText = typeof option.text === 'string' ? option.text : '';
                        const isSelected = selectedAnswers.includes(optionId);

                        return (
                            <div
                                key={optionId}
                                className={`flex items-start space-x-2 sm:space-x-3 p-3 sm:p-4 rounded-lg border cursor-pointer transition-all hover:bg-muted ${isSelected
                                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30 ring-2 ring-purple-200 dark:ring-purple-800'
                                    : 'border-border hover:border-border/80'
                                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                onClick={() => {
                                    if (!disabled) {
                                        const newAnswers = isSelected
                                            ? selectedAnswers.filter(id => id !== optionId)
                                            : [...selectedAnswers, optionId];
                                        onAnswerChange(newAnswers);
                                    }
                                }}
                            >
                                <Checkbox
                                    id={optionId}
                                    checked={isSelected}
                                    onCheckedChange={(checked) => {
                                        if (!disabled) {
                                            const newAnswers = checked
                                                ? [...selectedAnswers, optionId]
                                                : selectedAnswers.filter(id => id !== optionId);
                                            onAnswerChange(newAnswers);
                                        }
                                    }}
                                    disabled={disabled}
                                    className="mt-0.5 flex-shrink-0"
                                />
                                <Label
                                    htmlFor={optionId}
                                    className="flex-1 cursor-pointer text-xs sm:text-sm leading-relaxed"
                                >
                                    <div className="flex items-start gap-2">
                                        <span className="font-medium text-muted-foreground min-w-[20px] flex-shrink-0">
                                            {String.fromCharCode(65 + index)})
                                        </span>
                                        <QuestionOptionContent
                                            text={optionText}
                                            image={option.image}
                                            questionId={question.id}
                                            apiBase={BASE_URL}
                                            textClassName="text-xs sm:text-sm"
                                        />
                                    </div>
                                </Label>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    if (question.type === "essay" || question.type === "open" || question.type === "dissertativa" || question.type === "text" || question.type === "short_answer") {
        return (
            <div className="space-y-4 sm:space-y-6">
                <div className="text-base sm:text-lg md:text-xl font-bold text-foreground mb-4 sm:mb-6">
                    Digite sua resposta:
                </div>
                <Textarea
                    placeholder="Digite sua resposta aqui..."
                    value={answer || ""}
                    onChange={(e) => onAnswerChange(e.target.value)}
                    rows={8}
                    disabled={disabled}
                    className="min-h-[150px] sm:min-h-[200px] resize-none text-sm sm:text-base md:text-lg p-3 sm:p-4 border-2 rounded-lg sm:rounded-xl"
                />
                <div className="text-xs sm:text-sm text-muted-foreground font-medium">
                    {answer ? `${answer.length} caracteres` : '0 caracteres'}
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 border rounded-lg bg-muted">
            <div className="text-sm text-muted-foreground">
                Tipo de questão não suportado: {question.type}
            </div>
        </div>
    );
}