import React, { useEffect, useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { DisciplineTag } from "@/components/ui/discipline-tag";
import { getSubjectColors } from "@/utils/competition/competitionSubjectColors";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Question } from "../types";
import { useSkillsStore } from '@/stores/useSkillsStore';
import { api, BASE_URL } from "@/lib/api";
import { getQuestionHtmlForDisplay } from "@/utils/questionImages";
import { QuestionOptionContent } from "./QuestionOptionContent";
import { cleanLegacyText, isLikelyPlainText } from "@/utils/textFormatter";
import { QuestionRenderer } from "./QuestionRenderer";
import './QuestionPreview.css';

interface QuestionPreviewProps {
    question: Question;
    onClose?: () => void;
    /** Quando true, oculta título e badges (útil quando o preview é embutido em outro layout, ex.: ViewEvaluation). */
    hideHeader?: boolean;
}

// Bloco de enunciado no mesmo padrão do TakeEvaluation (avaliação)
const questionStatementBlockClass = "question-text-block rounded-xl border border-border bg-muted/30 dark:bg-muted/10 p-5 sm:p-6 md:p-7";
const questionProseClass = "prose dark:prose-invert max-w-none text-foreground dark:text-gray-100 text-sm sm:text-base md:text-lg leading-relaxed [&_*]:dark:text-gray-100";

// Componente para resolução (mantém HTML com imagens resolvidas)
const SimpleHtmlRenderer = ({ content, className }: { content: string | null | undefined; className?: string }) => {
    if (!content || content.trim() === '') {
        return null;
    }
    const cleanHtml = content
        .replace(/<img([^>]*?)class="([^"]*)"([^>]*)>/g, '<img$1class="$2 max-w-full h-auto"$3>')
        .replace(/<img(?![^>]*class=)([^>]*)>/g, '<img$1 class="max-w-full h-auto">')
        .replace(/<img(?![^>]*style=)([^>]*?)>/g, '<img$1 style="object-fit: contain;">');
    return (
        <div className={className ?? "text-base leading-relaxed text-foreground"} dangerouslySetInnerHTML={{ __html: cleanHtml }} />
    );
};

const QuestionPreview: React.FC<QuestionPreviewProps> = ({ question: initialQuestion, onClose, hideHeader = false }) => {
    const { fetchSkills, getSkillsByIds, isLoading } = useSkillsStore();
    const [question, setQuestion] = useState<Question>(initialQuestion);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [detailsLoaded, setDetailsLoaded] = useState(false);

    // Buscar detalhes completos da questão se necessário
    useEffect(() => {
        const needsDetails = (
            (question.type === 'multipleChoice' && (!question.options || question.options.length === 0)) ||
            (!question.formattedText && question.id && question.id !== 'preview')
        );

        if (needsDetails && !detailsLoaded && !isLoadingDetails) {
            setIsLoadingDetails(true);
            
            api.get<Question>(`/questions/${question.id}`)
                .then((response) => {
                    const fullQuestion = response.data;
                    
                    const normalizeSkills = (skills: any): string[] => {
                        if (Array.isArray(skills)) return skills;
                        if (typeof skills === 'string' && skills.length > 0) return skills.split(',').map(s => s.trim());
                        return [];
                    };

                    const normalizedQuestion: Question = {
                        ...fullQuestion,
                        skills: normalizeSkills(fullQuestion.skills),
                        // Verificar múltiplos campos possíveis para alternativas
                        options: fullQuestion.options || 
                                (fullQuestion as any).alternatives || 
                                (fullQuestion as any).opcoes || 
                                (fullQuestion as any).alternativas || 
                                [],
                        secondStatement: fullQuestion.secondStatement || '',
                        solution: fullQuestion.solution || '',
                    };

                    setQuestion(normalizedQuestion);
                    setDetailsLoaded(true);
                })
                .catch(() => {
                    setDetailsLoaded(true);
                })
                .finally(() => {
                    setIsLoadingDetails(false);
                });
        } else if (!needsDetails) {
            setDetailsLoaded(true);
        }
    }, [question.id, question.type, question.options, question.formattedText, detailsLoaded, isLoadingDetails]);

    // Pré-carregar skills quando a questão for carregada
    useEffect(() => {
        if (question?.subject?.id && question?.skills?.length > 0) {
            fetchSkills(question.subject.id);
        }
    }, [question?.subject?.id, question?.skills?.length, fetchSkills]);

    // Buscar skills completas para tooltips
    const selectedSkills = (question?.skills && Array.isArray(question.skills))
        ? getSkillsByIds(question.skills, question.subject?.id)
        : [];

    const isLoadingSkills = question?.subject?.id ? isLoading[question.subject.id] : false;

    if (!question) {
        return <div className="p-4 text-center text-muted-foreground">Nenhuma questão para visualizar.</div>;
    }

    // Verificar múltiplos campos possíveis para alternativas
    const questionOptions = question.options || 
                           (question as any).alternatives || 
                           (question as any).opcoes || 
                           (question as any).alternativas || 
                           [];

    return (
        <div className="question-preview-content">
            {/* Loading indicator para detalhes */}
            {isLoadingDetails && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                    <Skeleton className="h-4 w-4 rounded-full animate-spin" />
                    Carregando detalhes completos...
                </div>
            )}

            {/* Header com conteúdo e badges (oculto se hideHeader) */}
            {!hideHeader && (
                <div className="space-y-4 mb-8 pb-6 border-b border-border">
                    <h3 className="text-xl font-bold leading-tight text-foreground">{question.title}</h3>
                    <div className="flex flex-wrap gap-2">
                        {question.grade?.name && <Badge variant="outline">{question.grade.name}</Badge>}
                        {question.subject?.name && (
                          <DisciplineTag
                            subjectId={question.subject.id}
                            name={question.subject.name}
                          />
                        )}
                        {question.difficulty && <Badge variant="outline">{question.difficulty}</Badge>}
                        {question.value && <Badge variant="outline">Valor: {question.value}</Badge>}
                        {question.type && (
                            <Badge variant="secondary">
                                {question.type === 'multipleChoice' ? 'Múltipla Escolha' : 'Dissertativa'}
                            </Badge>
                        )}
                        
                        {/* Skills */}
                        {isLoadingSkills ? (
                            <Badge variant="outline" className="animate-pulse">Carregando skills...</Badge>
                        ) : selectedSkills.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                                {selectedSkills.map((skill) => (
                                    <Tooltip key={skill.id}>
                                        <TooltipTrigger asChild>
                                            <Badge 
                                                variant="outline" 
                                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                                                title={`${skill.code} - ${skill.description}`}
                                            >
                                                {skill.name.substring(0, 6)}
                                            </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent 
                                            side="top" 
                                            className="z-50 max-w-sm p-3 bg-popover text-popover-foreground border border-border rounded-md shadow-lg"
                                        >
                                            <div className="space-y-1">
                                                <div className="font-semibold text-sm">{skill.code}</div>
                                                <div className="text-xs leading-relaxed">
                                                    {skill.description}
                                                </div>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                ))}
                            </div>
                        ) : question?.skills?.length > 0 ? (
                            <Badge variant="outline">Skills não encontradas</Badge>
                        ) : null}
                    </div>
                </div>
            )}

            {/* Enunciado — mesmo layout do TakeEvaluation (avaliação) */}
            <div className="evaluation-question-content space-y-8 sm:space-y-10 mb-8">
                {isLoadingDetails ? (
                    <div className="space-y-3">
                        <Skeleton className="h-20 w-full" />
                    </div>
                ) : (
                    <>
                        {/* Texto 1 — Primeiro enunciado */}
                        {(question.formattedText || question.text) && (() => {
                            const str = question.formattedText || question.text || '';
                            return (
                                <div className={questionStatementBlockClass}>
                                    <div className={`${questionProseClass} question-enunciado-body`}>
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
                        {/* Texto 2 — Segundo enunciado (referência) */}
                        {question.secondStatement?.trim() && (() => {
                            const str = question.secondStatement.trim();
                            return (
                                <div className={`${questionStatementBlockClass} question-second-statement`}>
                                    <div className={`${questionProseClass} question-enunciado-body`}>
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
                    </>
                )}
            </div>

            {/* Alternativas — mesmo layout do TakeEvaluation (avaliação) */}
            {(question.type === 'multipleChoice' || question.type === 'multiple_choice') && (
                <div className="space-y-4 mb-8">
                    <div className="rounded-xl sm:rounded-2xl border border-border bg-card shadow p-4 sm:p-5 md:p-6">
                        <div className="text-base sm:text-lg md:text-xl font-bold text-foreground mb-4 sm:mb-6">
                            Selecione a alternativa correta:
                        </div>
                        {isLoadingDetails ? (
                            <div className="space-y-3">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="flex items-center space-x-3 p-4 rounded-lg border bg-muted/20">
                                        <Skeleton className="w-5 h-5 rounded-full" />
                                        <Skeleton className="h-5 flex-1" />
                                    </div>
                                ))}
                            </div>
                        ) : questionOptions && questionOptions.length > 0 ? (
                            <div className="space-y-4 sm:space-y-6">
                                {questionOptions.map((option, index) => {
                                    const optionId = option.id ?? `option-${index}`;
                                    const optionText = typeof option.text === 'string' ? option.text : '';
                                    const isCorrect = option.isCorrect;
                                    return (
                                        <div
                                            key={optionId}
                                            className={`flex items-start space-x-3 sm:space-x-4 p-4 sm:p-5 md:p-6 rounded-lg sm:rounded-xl border-2 transition-all ${
                                                isCorrect
                                                    ? 'border-green-500 bg-green-50 dark:bg-green-950/30 ring-2 sm:ring-4 ring-green-200 dark:ring-green-800 shadow-lg'
                                                    : 'border-border hover:border-border/80 hover:shadow-md bg-background'
                                            }`}
                                        >
                                            <div
                                                className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5 sm:mt-1 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                                                    isCorrect ? 'bg-green-500 text-white border-green-500' : 'border-border bg-muted'
                                                }`}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start gap-2 sm:gap-3">
                                                    <span className="font-bold text-foreground min-w-[24px] sm:min-w-[30px] text-base sm:text-lg md:text-xl flex-shrink-0">
                                                        {String.fromCharCode(65 + index)})
                                                    </span>
                                                    <QuestionOptionContent
                                                        text={optionText}
                                                        image={option.image}
                                                        questionId={question.id !== 'preview' ? question.id : undefined}
                                                        apiBase={BASE_URL}
                                                        textClassName="text-sm sm:text-base md:text-lg leading-relaxed [&_*]:dark:text-gray-100"
                                                    />
                                                </div>
                                                {isCorrect && (
                                                    <Badge variant="outline" className="mt-2 text-xs bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800">
                                                        ✓ Resposta Correta
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center p-8 border-2 border-dashed border-yellow-300 dark:border-yellow-700 rounded-xl bg-yellow-50 dark:bg-yellow-950/20">
                                <div className="text-yellow-800 dark:text-yellow-400 font-semibold text-lg mb-2">⚠️ Alternativas não disponíveis</div>
                                <p className="text-yellow-700 dark:text-yellow-500 text-sm leading-relaxed">
                                    Esta questão está marcada como múltipla escolha mas não possui alternativas cadastradas.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Área de resposta para questões dissertativas */}
            {(question.type === 'dissertativa' || question.type === 'open') && (
                <div className="space-y-4 mb-8">
                    <h4 className="font-semibold text-lg text-foreground mb-4">Área de Resposta</h4>
                    <div className="answer-area rounded-xl p-6 bg-muted border-2 border-dashed border-border">
                        <Label htmlFor="answer-area" className="text-sm font-medium text-muted-foreground block mb-3">
                            Espaço destinado para a resposta do estudante
                        </Label>
                        <Textarea
                            id="answer-area"
                            placeholder="O estudante deve desenvolver sua resposta aqui, demonstrando conhecimento e raciocínio sobre o tema abordado na questão..."
                            className="min-h-[140px] resize-none bg-card border-border focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-950/30 text-foreground placeholder:text-muted-foreground"
                            disabled
                        />
                        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                            📝 Esta área será preenchida pelo estudante durante a avaliação e será corrigida pelo professor.
                        </p>
                    </div>
                </div>
            )}

            {/* Resolução/Gabarito — alinhado ao padrão da avaliação */}
            {!isLoadingDetails && question.solution && question.solution.trim() !== '' && (
                <div className="resolution-section space-y-4 border-t border-border pt-8">
                    <h4 className="font-semibold text-lg text-foreground flex items-center gap-2">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${getSubjectColors(
                            question.subject?.id ?? '',
                            question.subject?.name ?? ''
                          ).badge}`}
                        >
                          💡
                        </span>
                        Resolução
                    </h4>
                    <div className="resolution-content rounded-xl border border-border bg-muted/30 dark:bg-muted/10 p-5 sm:p-6 md:p-7">
                        <SimpleHtmlRenderer
                            className={questionProseClass}
                            content={getQuestionHtmlForDisplay(
                                question.formattedSolution || question.solution || '',
                                BASE_URL
                            )}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuestionPreview;