import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/authContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DisciplineTag } from '@/components/ui/discipline-tag';
import { Tv, RefreshCw, BookOpen, Loader2, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { PlayTvVideo } from '@/types/playtv';
import { getVideoThumbnail } from '@/lib/utils';
import { RewardBadge } from '@/components/rewards/RewardBadge';
import { getMyContentRewards } from '@/services/contentRewardsApi';
import { CONTENT_REWARD_UI } from '@/constants/contentRewards';

interface ApiError {
  response?: {
    status?: number;
    data?: {
      message?: string;
    };
  };
  message?: string;
}

export default function PlayTvStudent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [videos, setVideos] = useState<PlayTvVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStudentInfo, setIsLoadingStudentInfo] = useState(true);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('Todas');
  const [studentGrade, setStudentGrade] = useState<string | null>(null);
  const [studentSchool, setStudentSchool] = useState<string | null>(null);
  const [claimedVideoIds, setClaimedVideoIds] = useState<Set<string>>(new Set());

  const loadVideos = useCallback(async () => {
    // Carregar vídeos mesmo sem grade (mostrará todos os vídeos disponíveis)
    setIsLoading(true);
    try {
      // Passar parâmetros para o backend fazer a filtragem
      // O backend já filtra automaticamente por grade e school para alunos
      const params = new URLSearchParams();
      if (selectedSubject !== 'Todas') {
        // Encontrar o ID da disciplina pelo nome
        const subjectObj = subjects.find(s => s.name === selectedSubject);
        if (subjectObj) {
          params.append('subject', subjectObj.id);
        }
      }
      // Passar grade como parâmetro para garantir filtragem no backend
      if (studentGrade) {
        params.append('grade', studentGrade);
      }

      const response = await api.get(`/play-tv/videos?${params.toString()}`);
      // O backend já filtra por grade e school para alunos, então não precisa filtrar no frontend
      setVideos(response.data || []);
    } catch (err) {
      const error = err as ApiError;
      // Se o endpoint não existir (404), apenas definir lista vazia sem mostrar erro
      const is404 = error.response?.status === 404 || 
                    error.message?.includes('não encontrado') ||
                    error.message?.includes('Not Found');
      
      if (is404) {
        setVideos([]);
        return;
      }
      
      toast({
        title: 'Erro',
        description: error.response?.data?.message || error.message || 'Não foi possível carregar os vídeos.',
        variant: 'destructive',
      });
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSubject, studentGrade, subjects, toast]);

  const loadStudentInfo = useCallback(async () => {
    setIsLoadingStudentInfo(true);
    try {
      // Buscar informações do aluno usando o endpoint /students/me
      const response = await api.get('/students/me');
      const studentData = response.data;

      // O endpoint retorna os dados formatados com grade_id e school_id
      if (studentData.grade_id) {
        setStudentGrade(studentData.grade_id);
      }
      if (studentData.school_id) {
        setStudentSchool(studentData.school_id);
      }

      // Se não encontrar na resposta direta, tentar buscar via turma ou grade
      if (!studentData.grade_id && studentData.class_id) {
        try {
          const classResponse = await api.get(`/classes/${studentData.class_id}`);
          const classData = classResponse.data;
          if (classData.grade_id) {
            setStudentGrade(classData.grade_id);
          }
          if (classData.school_id) {
            setStudentSchool(classData.school_id);
          }
        } catch {
          // Ignorar erro ao buscar turma
        }
      } else if (!studentData.grade_id && studentData.grade?.id) {
        // Tentar usar o objeto grade se disponível
        setStudentGrade(studentData.grade.id);
      }

      // Se ainda não tiver grade_id, mostrar mensagem ao usuário
      if (!studentData.grade_id && !studentData.grade?.id) {
        toast({
          title: 'Atenção',
          description: 'Sua série não está cadastrada. Entre em contato com o administrador.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      const error = err as ApiError;

      // Se for erro 404, o aluno pode não ter registro completo
      if (error.response?.status === 404) {
        toast({
          title: 'Erro',
          description: 'Seus dados não foram encontrados. Entre em contato com o administrador.',
          variant: 'destructive',
        });
      } else if (error.response?.status === 500) {
        toast({
          title: 'Erro',
          description: 'Erro ao carregar seus dados. Tente novamente mais tarde.',
          variant: 'destructive',
        });
      }
      // Não chamar loadVideos aqui - deixar que o useEffect faça isso quando studentGrade estiver disponível
    } finally {
      setIsLoadingStudentInfo(false);
    }
  }, [toast]);

  const loadSubjects = useCallback(async () => {
    try {
      const response = await api.get('/subjects');
      setSubjects(response.data || []);
    } catch {
      // Silenciar erro ao carregar disciplinas
    }
  }, []);

  // Verificar permissões e carregar dados iniciais
  useEffect(() => {
    if (user.role !== 'aluno') {
      toast({
        title: 'Acesso Negado',
        description: 'Esta página é apenas para alunos.',
        variant: 'destructive',
      });
      navigate('/aluno');
      return;
    }

    loadStudentInfo();
    loadSubjects();
  }, [user.role, navigate, toast, loadStudentInfo, loadSubjects]);

  // Carregar vídeos quando a série do aluno estiver disponível ou quando o filtro de disciplina mudar
  useEffect(() => {
    if (!isLoadingStudentInfo) {
      loadVideos();
    }
  }, [studentGrade, selectedSubject, loadVideos, isLoadingStudentInfo]);

  useEffect(() => {
    let cancelled = false;
    getMyContentRewards('video')
      .then((res) => {
        if (!cancelled) setClaimedVideoIds(new Set(res.content_ids || []));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);


  const handleVideoClick = (video: PlayTvVideo) => {
    navigate(`/aluno/play-tv/${video.id}`);
  };

  const handleRefresh = () => {
    loadVideos();
  };

  // Filtrar vídeos por disciplina
  const filterVideosBySubject = (videosList: PlayTvVideo[]) => {
    if (selectedSubject === 'Todas') {
      return videosList;
    }
    return videosList.filter((video) => video.subject?.name === selectedSubject);
  };

  // Agrupar vídeos por disciplina
  const groupVideosBySubject = (videosList: PlayTvVideo[]) => {
    const grouped: Record<string, PlayTvVideo[]> = {};

    videosList.forEach((video) => {
      const subject = video.subject?.name || 'Sem Disciplina';
      if (!grouped[subject]) {
        grouped[subject] = [];
      }
      grouped[subject].push(video);
    });

    return grouped;
  };

  const filteredVideos = filterVideosBySubject(videos);
  const groupedVideos = groupVideosBySubject(filteredVideos);

  if (isLoading || isLoadingStudentInfo) {
    return (
      <div className="container mx-auto py-6 min-h-screen">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mr-2 text-primary" />
          <span>Carregando vídeos...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6 min-h-screen">
      {/* Header — gamificado (padrão Resultados) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-fade-in-up">
        <div className="space-y-1.5">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3" id="playtv-page-title">
            <span className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 shadow-lg shadow-fuchsia-500/30 transition-transform duration-300 hover:scale-110 shrink-0">
              <Tv className="w-5 h-5 text-white drop-shadow" />
            </span>
            <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 dark:from-violet-400 dark:via-fuchsia-400 dark:to-pink-400 bg-clip-text text-transparent">Play TV</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base font-medium">Assista aos vídeos educacionais disponíveis para sua série</p>
        </div>
        <div className="flex justify-center w-full sm:w-auto sm:justify-end">
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading} size="sm" className="rounded-full border-violet-300 dark:border-violet-500/50 hover:bg-violet-500/15 hover:border-violet-400 transition-all">
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filtro por Disciplina - Layout Dinâmico */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedSubject === 'Todas' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedSubject('Todas')}
        >
          Todas as Disciplinas
        </Button>
        {subjects.map((subject) => (
          <Button
            key={subject.id}
            variant={selectedSubject === subject.name ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedSubject(subject.name)}
          >
            {subject.name}
          </Button>
        ))}
      </div>

      {videos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tv className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">Nenhum vídeo encontrado</h3>
            <p className="text-muted-foreground">
              Nenhum vídeo disponível no momento. Aguarde seu professor adicionar vídeos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Vídeos agrupados por disciplina */}
          {Object.entries(groupedVideos).map(([subject, subjectVideos]) => (
            subjectVideos.length > 0 && (
              <div key={subject} className="space-y-4">
                <div className="flex items-center gap-3 pb-2 border-b">
                  <BookOpen className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-semibold">{subject}</h3>
                  <Badge variant="secondary">{subjectVideos.length} vídeo{subjectVideos.length !== 1 ? 's' : ''}</Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {subjectVideos.map((video) => {
                    const thumbnailUrl = getVideoThumbnail(video.url);
                    return (
                      <Card
                        key={video.id}
                        className="group cursor-pointer hover:shadow-lg transition-shadow"
                        onClick={() => handleVideoClick(video)}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start gap-2">
                            <CardTitle className="text-lg line-clamp-2">{video.title || 'Vídeo sem título'}</CardTitle>
                            <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                              <RewardBadge claimed={claimedVideoIds.has(video.id)} coins={CONTENT_REWARD_UI.videoCoins} />
                              <DisciplineTag
                                subjectId={video.subject?.id}
                                name={video.subject?.name || 'Sem disciplina'}
                              />
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* Thumbnail */}
                          <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                            {thumbnailUrl ? (
                              <>
                                <img
                                  src={thumbnailUrl}
                                  alt={video.title || 'Vídeo'}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const placeholder = target.parentElement?.querySelector('.thumbnail-placeholder') as HTMLElement;
                                    if (placeholder) {
                                      placeholder.style.display = 'flex';
                                    }
                                  }}
                                />
                                <div className="thumbnail-placeholder hidden absolute inset-0 items-center justify-center bg-muted">
                                  <Play className="w-12 h-12 text-muted-foreground" />
                                </div>
                                {/* Overlay com ícone de play no centro */}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors pointer-events-none">
                                  <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                    <Play className="w-8 h-8 text-primary ml-1" fill="currentColor" />
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Play className="w-12 h-12 text-muted-foreground" />
                              </div>
                            )}
                          </div>

                          {/* Informações do vídeo */}
                          <div className="space-y-2">
                            {video.grade && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <BookOpen className="w-4 h-4" />
                                <span>{video.grade.name}</span>
                              </div>
                            )}
                            {video.created_at && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>{new Date(video.created_at).toLocaleDateString('pt-BR')}</span>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )
          ))}

          {/* Mensagem quando não há vídeos na disciplina selecionada */}
          {filteredVideos.length === 0 && videos.length > 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Tv className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Nenhum vídeo encontrado</h3>
                <p className="text-muted-foreground">
                  Não há vídeos disponíveis para a disciplina selecionada.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

