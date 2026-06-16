import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DisciplineTag } from "@/components/ui/discipline-tag";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Book, Check, List as ListIcon, Minus, Plus, Save, Eye, Heading1, Heading2, Heading3, List, Code, Type, Trash } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Question, Subject } from "../types";
import { api, BASE_URL } from "@/lib/api";
import { getQuestionHtmlForDisplay, toRelativeQuestionImageSrc } from "@/utils/questionImages";
import { useToast } from "@/hooks/use-toast";
import './QuestionForm.css';
import MyEditor from './MyEditor';
import './MyEditor.css';
import { Option } from "@/components/ui/multi-select";
import { useAuth } from "@/context/authContext";
import SkillsSelector from "./SkillsSelector";
import { QuestionOptionInput } from "./QuestionOptionInput";
import { QuestionOptionContent } from "./QuestionOptionContent";
import {
    mapOptionToApiPayload,
    optionHasContent,
    getActiveQuestionOptions,
} from "@/utils/questionOptionImages";

const emptyOption = () => ({ text: "", isCorrect: false, image: null as null });

// Form schema
const baseSchema = z.object({
    title: z.string().min(1, "O conteúdo é obrigatório"),
    text: z.string().min(1, "O enunciado é obrigatório"),
    subjectId: z.string().min(1, "A disciplina é obrigatória"),
    grade: z.string().min(1, "A série é obrigatória"),
    difficulty: z.string().min(1, "A dificuldade é obrigatória"),
    value: z.string().min(1, "O valor é obrigatório"),
    solution: z.string().optional(),
    options: z.array(
        z.object({
            text: z.string(),
            isCorrect: z.boolean(),
            image: z
                .object({
                    kind: z.enum(['new', 'existing']),
                    dataUrl: z.string().optional(),
                    id: z.string().optional(),
                    imageUrl: z.string().optional(),
                    width: z.number().optional(),
                    height: z.number().optional(),
                })
                .optional()
                .nullable(),
        })
    ).optional(),
    secondStatement: z.string().optional(),
    skills: z.array(z.string()).min(1, "Selecione pelo menos uma habilidade"),
    topics: z.string().optional(),
    questionType: z.enum(['multipleChoice', 'dissertativa']),
});

const questionSchema = baseSchema.superRefine((data, ctx) => {
    if (data.questionType === 'multipleChoice') {
        const activeOptions = getActiveQuestionOptions(data.options);

        if (activeOptions.length < 2) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Adicione pelo menos duas alternativas.',
                path: ['options'],
            });
        } else {
            activeOptions.forEach((opt, idx) => {
                if (!optionHasContent(opt)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: 'Preencha o texto, uma expressão ou uma imagem na alternativa.',
                        path: ['options', idx, 'text'],
                    });
                }
            });
            if (!activeOptions.some((opt) => opt.isCorrect)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Marque uma alternativa como correta.',
                    path: ['options'],
                });
            }
        }
    }
});

type QuestionFormValues = z.infer<typeof questionSchema>;

// Tipagem para resposta de habilidades na API
interface ApiSkill {
    id: string;
    code: string;
    description: string;
}

// Tipagem para habilidades no SkillsSelector
interface SkillOption {
    id: string;
    name: string;
    code: string;
    description: string;
}

interface QuestionFormReadOnlyProps {
    onSubmit?: (data: QuestionFormValues) => void;
    open: boolean;
    onClose: () => void;
    onQuestionAdded: (question: Question) => void;
    questionNumber: number;
    evaluationData: {
        course: string;
        grade: string;
        subject: string;
    };
}

const QuestionPreview: React.FC<{ data: QuestionFormValues }> = ({ data }) => {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [grades, setGrades] = useState<{ id: string; name: string }[]>([]);
    const [skillsOptions, setSkillsOptions] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        const fetchSubjects = async () => {
            try {
                const response = await api.get("/subjects");
                setSubjects(response.data);
            } catch (error) {
                console.error("Erro ao buscar disciplinas:", error);
            }
        };
        const fetchGrades = async () => {
            try {
                const response = await api.get("/grades/");
                setGrades(response.data);
            } catch (error) {
                console.error("Erro ao buscar séries:", error);
            }
        };
        const fetchSkills = async () => {
            if (data.subjectId) {
                try {
                    const response = await api.get<ApiSkill[]>(`/skills/subject/${data.subjectId}`);
                    if (Array.isArray(response.data)) {
                        setSkillsOptions(response.data.map((skill) => ({ id: skill.id, name: `${skill.code} - ${skill.description}` })));
                    } else {
                        setSkillsOptions([]);
                    }
                } catch (error) {
                    setSkillsOptions([]);
                }
            }
        };
        fetchSubjects();
        fetchGrades();
        fetchSkills();
    }, [data.subjectId]);

    const selectedSubject = subjects.find(s => s.id === data.subjectId);
    const selectedGrade = grades.find(g => g.id === data.grade);
    // Buscar nomes das habilidades (apenas os 7 primeiros caracteres)
    const selectedSkills = data.skills 
        ? data.skills.map(skillId => 
            skillsOptions.find(opt => opt.id === skillId)?.name.substring(0, 6) || skillId
          )
        : [];

    return (
        <div className="space-y-6 p-4">
            <div className="space-y-2">
                <h3 className="text-lg font-semibold">{data.title}</h3>
                <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{selectedGrade?.name || data.grade}</Badge>
                    <DisciplineTag
                      subjectId={selectedSubject?.id || data.subjectId}
                      name={selectedSubject?.name || data.subjectId}
                    />
                    <Badge variant="outline">{data.difficulty}</Badge>
                    <Badge variant="outline">Valor: {data.value}</Badge>
                    {selectedSkills.map(skill => (
                        <Badge key={skill} variant="outline">{skill}</Badge>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                {data.text && (
                    <div>
                        <h4 className="font-medium mb-2">Enunciado:</h4>
                        <div
                            className="prose max-w-none question-enunciado-html"
                            dangerouslySetInnerHTML={{
                                __html: getQuestionHtmlForDisplay(data.text, BASE_URL),
                            }}
                        />
                    </div>
                )}
                {data.secondStatement?.trim() && (
                    <div>
                        <h4 className="font-medium mb-2">Segundo Enunciado:</h4>
                        <div
                            className="prose max-w-none question-enunciado-html"
                            dangerouslySetInnerHTML={{
                                __html: getQuestionHtmlForDisplay(data.secondStatement, BASE_URL),
                            }}
                        />
                    </div>
                )}
            </div>

            {(data.options?.length ?? 0) > 0 && (
                <div className="space-y-3">
                    <h4 className="font-medium">Alternativas:</h4>
                    {data.options!.map((option, index) => (
                        <div key={index} className="flex items-start gap-2">
                            <div className={`w-6 h-6 shrink-0 rounded-full border flex items-center justify-center text-xs ${option.isCorrect ? 'bg-primary text-primary-foreground' : 'bg-background'
                                }`}>
                                {String.fromCharCode(65 + index)}
                            </div>
                            <QuestionOptionContent
                                text={option.text}
                                image={option.image}
                                apiBase={BASE_URL}
                            />
                        </div>
                    ))}
                </div>
            )}

            {data.solution && (
                <div className="space-y-2">
                    <h4 className="font-medium">Resolução:</h4>
                    <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: getQuestionHtmlForDisplay(data.solution, BASE_URL) }} />
                </div>
            )}
        </div>
    );
};

const QuestionFormReadOnly = ({
    onSubmit: externalOnSubmit,
    open,
    onClose,
    onQuestionAdded,
    questionNumber,
    evaluationData,
}: QuestionFormReadOnlyProps) => {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [grades, setGrades] = useState<{ id: string; name: string }[]>([]);
    const [skills, setSkills] = useState<SkillOption[]>([]);
    const [showPreview, setShowPreview] = useState(false);
    const [questionType, setQuestionType] = useState<'multipleChoice' | 'dissertativa'>('multipleChoice');
    const { toast } = useToast();
    const navigate = useNavigate();
    const { user } = useAuth();



    const form = useForm<QuestionFormValues>({
        resolver: zodResolver(questionSchema),
        defaultValues: {
            title: "",
            text: "",
            subjectId: evaluationData.subject,
            grade: evaluationData.grade,
            difficulty: "",
            value: "",
            solution: "",
            options: [
                emptyOption(),
                emptyOption(),
                emptyOption(),
                emptyOption(),
            ],
            secondStatement: "",
            skills: [], // Array vazio ao invés de string vazia
            topics: "",
            questionType: 'multipleChoice',
        },
    });

    // useFieldArray para opções
    const { fields, append, update, remove } = useFieldArray({
        control: form.control,
        name: "options"
    });

    // Monitorar mudanças no formulário para debug
    const watchedForm = useWatch({
        control: form.control,
        name: ["title", "text", "secondStatement", "options", "difficulty", "value", "solution", "skills"]
    });

    useEffect(() => {
        console.log('🔍 QuestionFormReadOnly - Formulário alterado:', watchedForm);
        console.log('🔍 QuestionFormReadOnly - Estado atual do form:', form.getValues());
    }, [watchedForm, form]);

    useEffect(() => {
        console.log('🔍 QuestionFormReadOnly - Configurando questionType:', questionType);
        console.log('🔍 QuestionFormReadOnly - Opções antes da configuração:', form.getValues("options"));
        
        form.setValue('questionType', questionType);

        // Limpar opções quando mudar para dissertativa
        if (questionType === 'dissertativa') {
            console.log('🔍 QuestionFormReadOnly - Limpando opções para questão dissertativa');
            form.setValue('options', []);
            form.clearErrors('options');
        } else {
            const currentOptions = form.getValues("options");
            const hasOptionsWithContent = currentOptions?.some((opt) => optionHasContent(opt));

            if (!hasOptionsWithContent) {
                form.setValue('options', [
                    emptyOption(),
                    emptyOption(),
                    emptyOption(),
                    emptyOption(),
                ]);
            }
        }
        
        console.log('🔍 QuestionFormReadOnly - Opções após configuração:', form.getValues("options"));
    }, [questionType, form]);

    // Função para adicionar alternativa
    const addOption = () => {
        if (fields.length < 5) {
            console.log('🔍 QuestionFormReadOnly - Adicionando nova alternativa');
            console.log('🔍 QuestionFormReadOnly - Estado do form antes de adicionar:', form.getValues());
            append(emptyOption());
            console.log('🔍 QuestionFormReadOnly - Opções após adicionar:', form.getValues("options"));
            console.log('🔍 QuestionFormReadOnly - Estado completo do form após adicionar:', form.getValues());
        }
    };

    // Função para marcar uma alternativa como correta
    const handleRadioChange = (index: number) => {
        const currentOptions = form.getValues("options");
        console.log('🔍 QuestionFormReadOnly - Marcando alternativa como correta:', index, currentOptions);
        currentOptions.forEach((option, i) => {
            update(i, { ...option, isCorrect: i === index });
        });
        console.log('🔍 QuestionFormReadOnly - Opções após marcar correta:', form.getValues("options"));
        console.log('🔍 QuestionFormReadOnly - Estado completo do form após marcar correta:', form.getValues());
    };

    useEffect(() => {
        const fetchSubjects = async () => {
            try {
                const response = await api.get("/subjects");
                setSubjects(response.data);
            } catch (error) {
                console.error("Erro ao buscar disciplinas:", error);
                toast({
                    title: "Erro",
                    description: "Não foi possível carregar as disciplinas",
                    variant: "destructive",
                });
            }
        };
        const fetchGrades = async () => {
            try {
                const response = await api.get("/grades/");
                setGrades(response.data);
            } catch (error) {
                console.error("Erro ao buscar séries:", error);
                toast({
                    title: "Erro",
                    description: "Não foi possível carregar as séries",
                    variant: "destructive",
                });
            }
        };
        fetchSubjects();
        fetchGrades();
    }, [toast]);

    useEffect(() => {
        const fetchSkills = async () => {
            if (evaluationData.subject) {
                console.log('🔍 QuestionFormReadOnly - Buscando habilidades para disciplina:', evaluationData.subject);
                try {
                    const response = await api.get(`/skills/subject/${evaluationData.subject}`);
                    if (Array.isArray(response.data)) {
                        const formattedSkills = response.data.map((skill: ApiSkill) => ({
                            id: skill.id,
                            name: `${skill.code} - ${skill.description}`,
                            code: skill.code,
                            description: skill.description
                        }));
                        console.log('🔍 QuestionFormReadOnly - Habilidades encontradas:', formattedSkills);
                        setSkills(formattedSkills);
                    } else {
                        console.log('🔍 QuestionFormReadOnly - Nenhuma habilidade encontrada');
                        setSkills([]);
                    }
                } catch (error) {
                    console.error("Erro ao buscar habilidades:", error);
                    setSkills([]);
                    toast({
                        title: "Aviso",
                        description: "Nenhuma habilidade encontrada para esta disciplina/série.",
                        variant: "default",
                    });
                }
            }
        };
        fetchSkills();
    }, [evaluationData.subject, evaluationData.grade, toast]);

    useEffect(() => {
        console.log('🔍 QuestionFormReadOnly - Configurando subjectId:', evaluationData.subject);
        console.log('🔍 QuestionFormReadOnly - Estado do form antes de configurar subjectId:', form.getValues());
        form.setValue('subjectId', evaluationData.subject);
        console.log('🔍 QuestionFormReadOnly - Estado do form após configurar subjectId:', form.getValues());
    }, [evaluationData.subject, form]);

    const htmlToText = (html: string) => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        return tempDiv.textContent || tempDiv.innerText || '';
    }

    const handleFormSubmit = async (data: QuestionFormValues) => {
        try {
            // Debug: verificar dados do formulário
            console.log('🔍 QuestionFormReadOnly - Dados do formulário:', data);
            console.log('🔍 QuestionFormReadOnly - evaluationData:', evaluationData);
            console.log('🔍 QuestionFormReadOnly - user:', user);

            // Corrigir: salvar solution como letra da alternativa correta (seguindo padrão do QuestionForm)
            let solution = "";
            if (data.questionType === 'multipleChoice' && data.options) {
                const correctIndex = data.options.findIndex(opt => opt.isCorrect);
                if (correctIndex !== -1) {
                    solution = String.fromCharCode(65 + correctIndex); // "A", "B", ...
                }
            } else {
                // Para questões dissertativas, usar o texto da resolução
                solution = data.solution ? htmlToText(data.solution) : "";
            }

            // Monta as opções com id baseado na letra (apenas para múltipla escolha)
            const formattedTextForApi = toRelativeQuestionImageSrc(data.text, BASE_URL);
            const formattedSolutionForApi = toRelativeQuestionImageSrc(data.solution || "", BASE_URL);
            const secondStatementForApi = toRelativeQuestionImageSrc(data.secondStatement || '', BASE_URL);

            const options =
                data.questionType === 'multipleChoice' && data.options
                    ? data.options.map((opt, index) => mapOptionToApiPayload(opt, index))
                    : [];

            // skills como array
            const skills = data.skills || [];
            console.log('🔍 QuestionFormReadOnly - Habilidades selecionadas:', skills);

            // Encontrar o subject e grade para criar o objeto Question completo
            const selectedSubject = subjects.find(s => s.id === data.subjectId);
            const selectedGrade = grades.find(g => g.id === data.grade);

            console.log('🔍 QuestionFormReadOnly - Subject encontrado:', selectedSubject);
            console.log('🔍 QuestionFormReadOnly - Grade encontrada:', selectedGrade);

            // Criar payload seguindo o mesmo padrão do QuestionForm
            const payload = {
                title: data.title,
                text: htmlToText(data.text),
                formattedText: formattedTextForApi,
                type: data.questionType,
                subjectId: data.subjectId,
                educationStageId: evaluationData.course,
                grade: data.grade,
                difficulty: data.difficulty,
                value: Number(data.value),
                solution,
                formattedSolution: formattedSolutionForApi,
                options,
                skills: data.skills,
                secondStatement: secondStatementForApi,
                lastModifiedBy: user?.id || '',
                createdBy: user?.id || '',
            };



            // Criar objeto Question para compatibilidade com a interface
            const question: Question = {
                id: '', // Será gerado pelo backend
                title: payload.title,
                text: payload.text,
                formattedText: payload.formattedText,
                secondStatement: payload.secondStatement,
                type: payload.type,
                subjectId: payload.subjectId,
                subject: selectedSubject || { id: data.subjectId, name: '' },
                educationStage: evaluationData.course ? { id: evaluationData.course, name: '' } : undefined,
                grade: selectedGrade ? { id: selectedGrade.id, name: selectedGrade.name } : undefined,
                difficulty: payload.difficulty,
                value: payload.value,
                solution: payload.solution, // Garantir que é a letra da alternativa correta
                formattedSolution: payload.formattedSolution,
                options: payload.options,
                skills: Array.isArray(payload.skills) && payload.skills.length > 0 ? payload.skills[0] : undefined, // ✅ CORREÇÃO: skills é uma string única, não array
                created_by: payload.createdBy,
                lastModifiedBy: payload.lastModifiedBy,
            };



            // Debug: verificar payload final
            console.log('📤 QuestionFormReadOnly - Payload sendo enviado:', question);
            console.log('📤 QuestionFormReadOnly - Campos específicos:');
            console.log('  - solution (letra da alternativa correta):', question.solution);
            console.log('  - formattedSolution (texto da resolução):', question.formattedSolution);
            console.log('  - secondStatement:', question.secondStatement);
            console.log('  - options:', question.options);
            console.log('  - educationStage:', question.educationStage);
            console.log('  - lastModifiedBy:', question.lastModifiedBy);
            console.log('  - created_by:', question.created_by);


            await onQuestionAdded(question);
            console.log('🔍 QuestionFormReadOnly - Formulário será resetado após envio');
            form.reset();
            console.log('🔍 QuestionFormReadOnly - Formulário resetado, estado atual:', form.getValues());
            toast({
                title: "Sucesso",
                description: "Questão salva com sucesso!",
                variant: "default",
            });
        } catch (error) {
            console.error("QuestionFormReadOnly - error in handleFormSubmit:", error);
            toast({
                title: "Erro",
                description: "Não foi possível salvar a avaliação",
                variant: "destructive",
            });
        }
    };

    return (
        <div className="space-y-6">
            {/* Botão de preview */}
            <div className="flex justify-end">
                <Button
                    variant="outline"
                    onClick={() => setShowPreview(!showPreview)}
                    type="button"
                    className="flex items-center gap-2"
                >
                    <Eye className="h-4 w-4" />
                    {showPreview ? "Voltar à Edição" : "Visualizar"}
                </Button>
            </div>

            {showPreview ? (
                <div className="bg-muted dark:bg-muted/50 rounded-xl border-2 border-border p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <h3 className="text-lg font-semibold text-foreground">Preview da Questão</h3>
                    </div>
                    <QuestionPreview data={{ ...form.getValues(), questionType }} />
                </div>
            ) : (
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-8">

                        {/* Seção: Informações Básicas */}
                        <div className="bg-blue-50 dark:bg-card rounded-xl p-6 border border-blue-200 dark:border-border">
                            <div className="flex items-center gap-2 mb-4">
                                <Book className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                <h3 className="text-lg font-semibold text-foreground">Informações Básicas</h3>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                                <div className="sm:col-span-2">
                                    <FormField
                                        control={form.control}
                                        name="title"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-sm font-semibold text-foreground">Titulo da Questão *</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        placeholder="Ex: Propriedades dos números naturais"
                                                        className="h-11 text-base"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="grade"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-sm font-semibold text-foreground">Série *</FormLabel>
                                            <FormControl>
                                                <Input
                                                    value={grades.find(g => g.id === evaluationData.grade)?.name || ""}
                                                    readOnly
                                                    className="h-11 bg-muted"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="subjectId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-sm font-semibold text-foreground">Disciplina *</FormLabel>
                                            <FormControl>
                                                <Input
                                                    value={subjects.find(s => s.id === evaluationData.subject)?.name || ""}
                                                    readOnly
                                                    className="h-11 bg-muted"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="difficulty"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-sm font-semibold text-foreground">Dificuldade *</FormLabel>
                                            <FormControl>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <SelectTrigger className="h-11">
                                                        <SelectValue placeholder="Selecione a dificuldade" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Abaixo do Básico">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                                                Abaixo do Básico
                                                            </div>
                                                        </SelectItem>
                                                        <SelectItem value="Básico">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                                                Básico
                                                            </div>
                                                        </SelectItem>
                                                        <SelectItem value="Adequado">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-3 h-3 rounded-full bg-green-400"></div>
                                                                Adequado
                                                            </div>
                                                        </SelectItem>
                                                        <SelectItem value="Avançado">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-3 h-3 rounded-full bg-green-700"></div>
                                                                Avançado
                                                            </div>
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="value"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-sm font-semibold text-foreground">Valor da Questão *</FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    type="number"
                                                    step="0.1"
                                                    placeholder="Ex: 2.5"
                                                    className="h-11"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="skills"
                                    render={({ field }) => (
                                        <FormItem className="sm:col-span-2 min-w-0">
                                            <FormLabel className="text-sm font-semibold text-foreground">
                                                Habilidades (BNCC)
                                                <span className="text-muted-foreground font-normal ml-1">
                                                    {skills.length > 0 ? `(${skills.length} disponíveis)` : ''}
                                                </span>
                                            </FormLabel>
                                            <FormControl>
                                                <SkillsSelector
                                                    skills={skills}
                                                    selected={field.value || []}
                                                    onChange={field.onChange}
                                                    placeholder="Clique para abrir o seletor de habilidades"
                                                    disabled={skills.length === 0}
                                                    gradeId={evaluationData.grade}
                                                    gradeName={grades.find(g => g.id === evaluationData.grade)?.name}
                                                    subjectId={evaluationData.subject}
                                                    subjectName={subjects.find(s => s.id === evaluationData.subject)?.name}
                                                    allGrades={grades}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                            {(field.value || []).length > 0 && (
                                                <div className="mt-3 p-3 bg-blue-50 dark:bg-muted/50 rounded-lg border border-blue-200 dark:border-border">
                                                    <div className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                                                        Habilidades Selecionadas ({(field.value || []).length}):
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {(field.value || []).map((skillId: string) => {
                                                            const skill = skills.find(opt => opt.id === skillId);
                                                            return skill ? (
                                                                <Badge key={skillId} variant="outline" className="text-xs bg-card dark:bg-card border-blue-300 dark:border-blue-700">
                                                                    {skill.code}
                                                                </Badge>
                                                            ) : null;
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>

                        {/* Seção: Tipo de Questão */}
                        <div className="bg-purple-50 dark:bg-card rounded-xl p-6 border border-purple-200 dark:border-border">
                            <div className="flex items-center gap-2 mb-4">
                                <ListIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                <h3 className="text-lg font-semibold text-foreground">Tipo de Questão</h3>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                <Button
                                    type="button"
                                    variant={questionType === 'multipleChoice' ? 'default' : 'outline'}
                                    size="lg"
                                    onClick={() => setQuestionType('multipleChoice')}
                                    className={`w-full h-auto min-h-[4rem] p-4 ${questionType === 'multipleChoice'
                                        ? 'bg-purple-600 dark:bg-purple-700 hover:bg-purple-700 dark:hover:bg-purple-600 text-white shadow-lg'
                                        : 'hover:bg-purple-50 dark:hover:bg-purple-950/50 hover:border-purple-300 dark:hover:border-purple-700'
                                        }`}
                                >
                                    <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
                                        <Check className="h-5 w-5 flex-shrink-0" />
                                        <div className="text-center sm:text-left">
                                            <div className="font-semibold text-sm sm:text-base">Múltipla Escolha</div>
                                            <div className="text-xs opacity-80 hidden sm:block">Questão com alternativas A, B, C, D...</div>
                                        </div>
                                    </div>
                                </Button>

                                <Button
                                    type="button"
                                    variant={questionType === 'dissertativa' ? 'default' : 'outline'}
                                    size="lg"
                                    onClick={() => setQuestionType('dissertativa')}
                                    className={`w-full h-auto min-h-[4rem] p-4 ${questionType === 'dissertativa'
                                        ? 'bg-purple-600 dark:bg-purple-700 hover:bg-purple-700 dark:hover:bg-purple-600 text-white shadow-lg'
                                        : 'hover:bg-purple-50 dark:hover:bg-purple-950/50 hover:border-purple-300 dark:hover:border-purple-700'
                                        }`}
                                >
                                    <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
                                        <Type className="h-5 w-5 flex-shrink-0" />
                                        <div className="text-center sm:text-left">
                                            <div className="font-semibold text-sm sm:text-base">Dissertativa</div>
                                            <div className="text-xs opacity-80 hidden sm:block">Questão com resposta livre do aluno</div>
                                        </div>
                                    </div>
                                </Button>
                            </div>
                        </div>

                        {/* Seção: Enunciados */}
                        <div className="bg-green-50 dark:bg-card rounded-xl p-6 border border-green-200 dark:border-border">
                            <div className="flex items-center gap-2 mb-4">
                                <Type className="h-5 w-5 text-green-600 dark:text-green-400" />
                                <h3 className="text-lg font-semibold text-foreground">Enunciados</h3>
                            </div>

                            <div className="space-y-6">
                                <FormField
                                    control={form.control}
                                    name="text"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-sm font-semibold text-foreground">Enunciado Principal *</FormLabel>
                                            <FormControl>
                                                <MyEditor
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="secondStatement"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-sm font-semibold text-foreground">
                                                Segundo Enunciado
                                                <span className="text-muted-foreground font-normal ml-1">(opcional)</span>
                                            </FormLabel>
                                            <FormControl>
                                                <MyEditor
                                                    value={field.value || ""}
                                                    onChange={field.onChange}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>

                        {/* Seção: Alternativas (apenas para múltipla escolha) */}
                        {questionType === 'multipleChoice' && (
                            <div className="bg-orange-50 dark:bg-orange-950/30 rounded-xl p-6 border border-orange-200 dark:border-orange-800">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <Check className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                                        <h3 className="text-lg font-semibold text-foreground">Alternativas</h3>
                                    </div>
                                    {fields.length < 5 && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={addOption}
                                            className="flex items-center gap-2 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-950/50"
                                        >
                                            <Plus className="h-4 w-4" />
                                            Adicionar Alternativa
                                        </Button>
                                    )}
                                </div>

                                <p className="text-sm text-muted-foreground mb-4">
                                    Clique no círculo à esquerda de uma alternativa para marcá-la como{" "}
                                    <span className="font-medium text-green-700 dark:text-green-400">correta</span>.
                                </p>

                                <div className="space-y-4">
                                    {fields.map((field, index) => (
                                        <div key={field.id} className="flex items-center gap-4 p-4 bg-card rounded-lg border border-border shadow-sm">
                                            <button
                                                type="button"
                                                onClick={() => handleRadioChange(index)}
                                                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${form.watch("options")?.[index]?.isCorrect
                                                    ? 'bg-green-500 dark:bg-green-600 border-green-500 dark:border-green-600 text-white shadow-lg'
                                                    : 'bg-card dark:bg-card border-border hover:border-border/80'
                                                    }`}
                                                aria-label={`Marcar alternativa ${String.fromCharCode(65 + index)} como correta`}
                                            >
                                                {form.watch("options")?.[index]?.isCorrect ? <Check className="w-4 h-4" /> : null}
                                            </button>

                                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground shrink-0">
                                                {String.fromCharCode(65 + index)}
                                            </div>

                                            <FormField
                                                control={form.control}
                                                name={`options.${index}.text`}
                                                render={({ field }) => (
                                                    <FormItem className="flex-1 min-w-0">
                                                        <FormControl>
                                                            <QuestionOptionInput
                                                                value={field.value}
                                                                onChange={field.onChange}
                                                                onBlur={field.onBlur}
                                                                ref={field.ref}
                                                                image={form.watch(`options.${index}.image`)}
                                                                onImageChange={(image) =>
                                                                    form.setValue(`options.${index}.image`, image, {
                                                                        shouldDirty: true,
                                                                    })
                                                                }
                                                                placeholder={`Digite a alternativa ${String.fromCharCode(65 + index)}`}
                                                                className="h-11 text-base"
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            {fields.length > 2 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => remove(index)}
                                                    className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                                                    aria-label="Remover alternativa"
                                                >
                                                    <Trash className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {form.formState.errors.options && (
                                    <p className="text-red-600 text-sm mt-2">
                                        {form.formState.errors.options.message}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Seção: Resolução */}
                        <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-xl p-6 border border-indigo-200 dark:border-indigo-800">
                            <div className="flex items-center gap-2 mb-4">
                                <Save className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                <h3 className="text-lg font-semibold text-foreground">
                                    Resolução
                                    <span className="text-muted-foreground font-normal ml-1">(opcional)</span>
                                </h3>
                            </div>

                            <FormField
                                control={form.control}
                                name="solution"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-sm font-semibold text-foreground">
                                            Explicação detalhada da resolução
                                        </FormLabel>
                                        <FormControl>
                                            <MyEditor
                                                value={field.value || ""}
                                                onChange={field.onChange}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Botões de ação */}
                        <div className="flex flex-col sm:flex-row sm:justify-end gap-3 sm:gap-4 pt-6 border-t border-border">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                size="lg"
                                className="w-full sm:w-auto px-6 sm:px-8 order-2 sm:order-1"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                size="lg"
                                className="w-full sm:w-auto px-6 sm:px-8 bg-blue-600 hover:bg-blue-700 order-1 sm:order-2"
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <Plus className="h-4 w-4" />
                                    <span>Criar Questão</span>
                                </div>
                            </Button>
                        </div>
                    </form>
                </Form>
            )}
        </div>
    );
};

export default QuestionFormReadOnly; 