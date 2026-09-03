import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  FileText, 
  Clock, 
  CheckCircle, 
  Circle, 
  PlayCircle,
  Calendar,
  AlertCircle,
  Loader2,
  Users,
  GraduationCap,
  UserCheck,
  Building2,
  Shield
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';

interface Questionario {
  id: string;
  title: string;
  description: string;
  formType: 'aluno-jovem' | 'aluno-velho' | 'professor' | 'diretor' | 'secretario';
  deadline: string;
  instructions?: string;
  status: 'pending' | 'in_progress' | 'completed';
  sentAt: string;
  startedAt: string | null;
  completedAt: string | null;
  progress: number;
  totalQuestions: number;
}

const QuestionarioList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [questionarios, setQuestionarios] = useState<Questionario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');

  useEffect(() => {
    fetchQuestionarios();
  }, []);

  // Recarregar quando voltar da página de resposta (após finalizar)
  useEffect(() => {
    if (location.state?.refresh) {
      fetchQuestionarios();
      // Limpar o state para evitar recarregar desnecessariamente
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const fetchQuestionarios = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/forms/me');
      setQuestionarios(response.data.data || []);
    } catch (error: any) {
      console.error('Erro ao buscar questionários:', error);
      toast({
        title: "Erro ao carregar questionários",
        description: error.response?.data?.message || "Não foi possível carregar os questionários.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getFormTypeIcon = (formType: string) => {
    switch (formType) {
      case 'aluno-jovem':
        return Users;
      case 'aluno-velho':
        return GraduationCap;
      case 'professor':
        return UserCheck;
      case 'diretor':
        return Building2;
      case 'secretario':
        return Shield;
      default:
        return FileText;
    }
  };

  const getFormTypeColor = (formType: string) => {
    switch (formType) {
      case 'aluno-jovem':
        return 'bg-blue-500';
      case 'aluno-velho':
        return 'bg-green-500';
      case 'professor':
        return 'bg-purple-500';
      case 'diretor':
        return 'bg-orange-500';
      case 'secretario':
        return 'bg-indigo-500';
      default:
        return 'bg-card0';
    }
  };

  const getFormTypeLabel = (formType: string) => {
    switch (formType) {
      case 'aluno-jovem':
        return 'Aluno (Anos Iniciais)';
      case 'aluno-velho':
        return 'Aluno (Anos Finais)';
      case 'professor':
        return 'Professor';
      case 'diretor':
        return 'Diretor';
      case 'secretario':
        return 'Secretário';
      default:
        return formType;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-green-500 text-white">
            <CheckCircle className="h-3 w-3 mr-1" />
            Concluído
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge className="bg-blue-500 text-white">
            <PlayCircle className="h-3 w-3 mr-1" />
            Em Progresso
          </Badge>
        );
      case 'pending':
      default:
        return (
          <Badge variant="outline" className="border-yellow-500 text-yellow-700">
            <Circle className="h-3 w-3 mr-1" />
            Pendente
          </Badge>
        );
    }
  };

  const isDeadlineExpired = (deadline: string) => {
    return new Date(deadline) < new Date();
  };

  const getDaysUntilDeadline = (deadline: string) => {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const filteredQuestionarios = questionarios.filter(q => {
    if (filterStatus === 'all') return true;
    return q.status === filterStatus;
  });

  const handleRespond = (formId: string) => {
    const basePath = user?.role === 'aluno' ? '/aluno/questionario' : '/app/questionario';
    navigate(`${basePath}/responder/${formId}`);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto min-h-screen px-3 py-4 sm:p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Carregando questionários...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto min-h-screen space-y-4 px-3 py-4 sm:space-y-6 sm:p-6">
      {/* Header — gamificado (padrão Resultados) */}
      <div className="animate-fade-in-up space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3" id="questionarios-page-title">
          <span className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 shadow-lg shadow-fuchsia-500/30 transition-transform duration-300 hover:scale-110 shrink-0">
            <FileText className="w-5 h-5 text-white drop-shadow" />
          </span>
          <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 dark:from-violet-400 dark:via-fuchsia-400 dark:to-pink-400 bg-clip-text text-transparent">Questionários</span>
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base font-medium">
          Responda aos questionários disponíveis para você
        </p>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Button
          variant={filterStatus === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus('all')}
        >
          Todos ({questionarios.length})
        </Button>
        <Button
          variant={filterStatus === 'pending' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus('pending')}
        >
          Pendentes ({questionarios.filter(q => q.status === 'pending').length})
        </Button>
        <Button
          variant={filterStatus === 'in_progress' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus('in_progress')}
        >
          Em Progresso ({questionarios.filter(q => q.status === 'in_progress').length})
        </Button>
        <Button
          variant={filterStatus === 'completed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus('completed')}
        >
          Concluídos ({questionarios.filter(q => q.status === 'completed').length})
        </Button>
      </div>

      {/* Lista de Questionários */}
      {filteredQuestionarios.length === 0 ? (
        <Card className="rounded-2xl border-2 border-dashed border-violet-200/60 dark:border-violet-500/40 overflow-hidden bg-gradient-to-br from-violet-500/5 to-transparent animate-fade-in-up">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-14 h-14 rounded-full bg-violet-500/10 flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Nenhum questionário encontrado
            </h3>
            <p className="text-muted-foreground text-center max-w-md">
              {filterStatus === 'all'
                ? 'Você não possui questionários disponíveis no momento.'
                : `Não há questionários com status "${filterStatus}" no momento.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredQuestionarios.map((questionario) => {
            const IconComponent = getFormTypeIcon(questionario.formType);
            const iconColor = getFormTypeColor(questionario.formType);
            const deadlineExpired = isDeadlineExpired(questionario.deadline);
            const daysUntilDeadline = getDaysUntilDeadline(questionario.deadline);

            return (
              <Card 
                key={questionario.id} 
                className={`rounded-2xl border-2 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-xl ${
                  deadlineExpired && questionario.status !== 'completed' 
                    ? 'border-red-300 bg-red-50/30 dark:border-red-500/30 dark:bg-red-950/20' 
                    : 'border-violet-200/60 dark:border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-transparent hover:shadow-violet-500/20'
                }`}
              >
                <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className={`p-2 rounded-lg ${iconColor}`}>
                      <IconComponent className="h-5 w-5 text-white" />
                    </div>
                    {getStatusBadge(questionario.status)}
                  </div>
                  <CardTitle className="text-lg line-clamp-2">
                    {questionario.title}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 mt-1">
                    {questionario.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
                  {/* Tipo e Total de Questões */}
                  <div className="flex items-center justify-between text-sm">
                    <Badge variant="secondary" className="text-xs">
                      {getFormTypeLabel(questionario.formType)}
                    </Badge>
                    <span className="text-muted-foreground">
                      {questionario.totalQuestions} {questionario.totalQuestions !== 1 ? 'questões' : 'questão'}
                    </span>
                  </div>

                  {/* Progresso */}
                  {questionario.status !== 'pending' && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Progresso</span>
                        <span className="font-medium">{questionario.progress.toFixed(0)}%</span>
                      </div>
                      <Progress value={questionario.progress} className="h-2" />
                    </div>
                  )}

                  {/* Datas */}
                  <div className="space-y-2 text-xs text-muted-foreground">
                    {questionario.sentAt && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        <span>Enviado em {new Date(questionario.sentAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                    )}
                    {questionario.startedAt && (
                      <div className="flex items-center gap-2">
                        <PlayCircle className="h-3 w-3" />
                        <span>Iniciado em {new Date(questionario.startedAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                    )}
                    {questionario.completedAt && (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="h-3 w-3" />
                        <span>Concluído em {new Date(questionario.completedAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                    )}
                  </div>

                  {/* Deadline */}
                  <div className={`p-2 rounded-lg ${
                    deadlineExpired && questionario.status !== 'completed'
                      ? 'bg-red-100 border border-red-300'
                      : daysUntilDeadline <= 3 && questionario.status !== 'completed'
                      ? 'bg-yellow-100 border border-yellow-300'
                      : 'bg-card border border-border'
                  }`}>
                    <div className="flex items-center gap-2 text-xs">
                      <Clock className={`h-3 w-3 ${
                        deadlineExpired && questionario.status !== 'completed'
                          ? 'text-red-600'
                          : daysUntilDeadline <= 3 && questionario.status !== 'completed'
                          ? 'text-yellow-600'
                          : 'text-muted-foreground'
                      }`} />
                      <span className={
                        deadlineExpired && questionario.status !== 'completed'
                          ? 'text-red-700 font-medium'
                          : daysUntilDeadline <= 3 && questionario.status !== 'completed'
                          ? 'text-yellow-700 font-medium'
                          : 'text-foreground'
                      }>
                        {deadlineExpired && questionario.status !== 'completed'
                          ? `Prazo expirado em ${new Date(questionario.deadline).toLocaleDateString('pt-BR')}`
                          : questionario.status === 'completed'
                          ? `Prazo: ${new Date(questionario.deadline).toLocaleDateString('pt-BR')}`
                          : daysUntilDeadline === 0
                          ? 'Vence hoje'
                          : daysUntilDeadline === 1
                          ? 'Vence amanhã'
                          : `Vence em ${daysUntilDeadline} dias (${new Date(questionario.deadline).toLocaleDateString('pt-BR')})`}
                      </span>
                    </div>
                  </div>

                  {/* Instruções */}
                  {questionario.instructions && (
                    <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-start gap-2 text-xs">
                        <AlertCircle className="h-3 w-3 text-blue-600 mt-0.5 flex-shrink-0" />
                        <p className="text-blue-800 line-clamp-2">{questionario.instructions}</p>
                      </div>
                    </div>
                  )}

                  {/* Botão de Ação */}
                  <Button
                    className="w-full"
                    variant={questionario.status === 'completed' ? 'outline' : 'default'}
                    onClick={() => handleRespond(questionario.id)}
                    disabled={deadlineExpired && questionario.status !== 'completed'}
                  >
                    {questionario.status === 'completed' ? (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Ver Resposta
                      </>
                    ) : questionario.status === 'in_progress' ? (
                      <>
                        <PlayCircle className="h-4 w-4 mr-2" />
                        Continuar
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-4 w-4 mr-2" />
                        Responder
                      </>
                    )}
                  </Button>

                  {deadlineExpired && questionario.status !== 'completed' && (
                    <p className="text-xs text-red-600 text-center">
                      Este questionário não pode mais ser respondido
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default QuestionarioList;

