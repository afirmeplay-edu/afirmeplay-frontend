import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  ArrowLeft, 
  Users, 
  GraduationCap, 
  UserCheck, 
  Building2,
  CheckCircle,
  Circle,
  ChevronDown,
  ChevronRight,
  FileText
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { questionsAlunoJovem, questionsAlunoVelho, professorQuestions, diretorQuestions } from '@/data';
import { Question, SubQuestion } from '@/types/forms';

const FormView = () => {
  const navigate = useNavigate();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Dados mockados do questionário selecionado
  const formData = {
    id: '1',
    title: 'Questionário Socioeconômico - Alunos Jovens 2024',
    description: 'Questionário para coleta de dados socioeconômicos dos estudantes dos anos iniciais',
    type: 'aluno-jovem',
    isActive: true,
    createdAt: new Date('2024-01-15'),
    questions: questionsAlunoJovem
  };

  const getFormIcon = (type: string) => {
    const icons = {
      'aluno-jovem': Users,
      'aluno-velho': GraduationCap,
      'professor': UserCheck,
      'diretor': Building2
    };
    return icons[type as keyof typeof icons] || Users;
  };

  const getFormColor = (type: string) => {
    const colors = {
      'aluno-jovem': 'bg-blue-500',
      'aluno-velho': 'bg-green-500',
      'professor': 'bg-purple-500',
      'diretor': 'bg-orange-500'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-500';
  };

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const renderQuestion = (question: Question, index: number) => {
    return (
      <div key={question.id} className="p-4 border rounded-lg bg-gray-50">
        <div className="flex items-start gap-3">
          <span className="text-sm font-medium text-gray-500 mt-1">
            {index + 1}.
          </span>
          <div className="flex-1">
            <h4 className="font-medium text-gray-900 mb-2">
              {question.texto || question.text}
            </h4>
            
            {question.tipo === 'selecao_unica' && (
              <div className="space-y-2">
                {question.opcoes?.map((option: string, optIndex: number) => (
                  <label key={optIndex} className="flex flex-wrap items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200">
                    <span className="flex items-center justify-center w-6 h-6 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
                      {String.fromCharCode(65 + optIndex)}
                    </span>
                    <span className="text-sm text-gray-700">{option}</span>
                    {option === 'Outro' && (
                      <Input
                        disabled
                        className="basis-full ml-9 bg-white"
                        placeholder="Campo de escrita exibido ao selecionar Outro"
                      />
                    )}
                  </label>
                ))}
              </div>
            )}

            {question.tipo === 'multipla_escolha' && (
              <div className="space-y-2">
                {question.subPerguntas?.map((subQ: SubQuestion, subIndex: number) => (
                  <div key={subQ.id} className="ml-4">
                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200">
                      <span className="flex items-center justify-center w-6 h-6 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
                        {String.fromCharCode(65 + subIndex)}
                      </span>
                      <span className="text-sm text-gray-700">{subQ.texto || subQ.text}</span>
                    </label>
                  </div>
                ))}
              </div>
            )}

            {question.tipo === 'matriz_selecao' && (
              <div className="space-y-3">
                {question.subPerguntas?.map((subQ: SubQuestion, subIndex: number) => (
                  <div key={subQ.id} className="ml-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      {subQ.texto || subQ.text}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {question.opcoes?.map((option: string, optIndex: number) => (
                        <label key={optIndex} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200">
                          <span className="flex items-center justify-center w-6 h-6 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
                            {String.fromCharCode(65 + optIndex)}
                          </span>
                          <span className="text-sm text-gray-600">{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {question.tipo === 'slider' && (
              <div className="space-y-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: '50%' }}></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{question.min || 0}</span>
                  <span>{question.max || 100}</span>
                </div>
              </div>
            )}

            {question.tipo === 'textarea' && (
              <textarea 
                className="w-full p-3 border rounded-lg resize-none" 
                rows={3}
                placeholder="Digite sua resposta aqui..."
                disabled
              />
            )}

            {question.obrigatoria && (
              <Badge variant="destructive" className="mt-2 text-xs">
                Obrigatória
              </Badge>
            )}
          </div>
        </div>
      </div>
    );
  };

  const IconComponent = getFormIcon(formData.type);

  return (
    <div className="container mx-auto px-3 py-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => navigate('/app/questionarios/cadastro')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div className="flex-1 space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
            <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
            {formData.title}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">{formData.description}</p>
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          <Badge variant={formData.isActive ? "default" : "secondary"}>
            {formData.isActive ? 'Ativo' : 'Inativo'}
          </Badge>
          <Button variant="outline" size="sm">
            Editar
          </Button>
        </div>
      </div>

      {/* Form Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${getFormColor(formData.type)}`}>
              <IconComponent className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle>Informações do Questionário</CardTitle>
              <CardDescription>
                Criado em {formData.createdAt.toLocaleDateString('pt-BR')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h4 className="font-medium text-foreground">Tipo</h4>
              <p className="text-sm text-muted-foreground">Aluno (Jovem)</p>
            </div>
            <div>
              <h4 className="font-medium text-foreground">Total de Questões</h4>
              <p className="text-sm text-muted-foreground">{formData.questions.length}</p>
            </div>
            <div>
              <h4 className="font-medium text-foreground">Status</h4>
              <p className="text-sm text-muted-foreground">
                {formData.isActive ? 'Ativo' : 'Inativo'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Questions Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Pré-visualização das Questões</CardTitle>
          <CardDescription>
            Visualize as questões que serão apresentadas aos respondentes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {formData.questions.map((question, index) => 
              renderQuestion(question, index)
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-4">
        <Button variant="outline">
          Duplicar Questionário
        </Button>
        <Button variant="outline">
          Exportar
        </Button>
        <Button>
          Enviar Questionário
        </Button>
      </div>
    </div>
  );
};

export default FormView;
