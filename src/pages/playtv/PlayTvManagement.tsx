import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/authContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, RefreshCw, Tv, School, GraduationCap, BookOpen, Trash2, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { CreatePlayTvVideoForm } from '@/components/playtv/CreatePlayTvVideoForm';
import { VideoList } from '@/components/playtv/VideoList';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PlayTvVideo, PlayTvFilters } from '@/types/playtv';
import { getUserHierarchyContext } from '@/utils/userHierarchy';
import { toUserFacingErrorMessage } from '@/utils/userFacingError';

export default function PlayTvManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [videos, setVideos] = useState<PlayTvVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('visualizar');
  const [filters, setFilters] = useState<PlayTvFilters>({});
  const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);
  const [grades, setGrades] = useState<Array<{ id: string; name: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteVideoId, setPendingDeleteVideoId] = useState<string | null>(null);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const [userContext, setUserContext] = useState<{
    municipio_id?: string;
    escola_id?: string;
    estado_id?: string;
    turmas?: Array<{ class_id: string; school_id: string; grade_id: string; subject_id?: string }>;
  }>({});
  const [isLoadingContext, setIsLoadingContext] = useState(true);

  // Verificar permissões
  const allowedRoles = useMemo(() => ['admin', 'professor', 'diretor', 'coordenador', 'tecadm'], []);
  const canCreate = allowedRoles.includes(user.role);

  const loadUserContext = useCallback(async () => {
    setIsLoadingContext(true);
    try {
      const context = await getUserHierarchyContext(user.id, user.role);
      
      // Buscar estado ID se tiver município com state
      let estadoId: string | undefined;
      if (context.municipality?.state) {
        try {
          const statesResponse = await api.get('/city/states');
          const states = statesResponse.data || [];
          const state = states.find((s: { nome: string }) => s.nome === context.municipality?.state);
          estadoId = state?.id;
        } catch (error) {
          console.error('Erro ao buscar estado:', error);
        }
      }

      // Converter turmas do professor para o formato esperado
      const turmas = context.classes?.map(c => ({
        class_id: c.class_id,
        school_id: c.school_id,
        grade_id: c.grade_id,
        subject_id: undefined, // Turmas podem não ter subject_id direto
      })) || [];

      setUserContext({
        municipio_id: context.municipality?.id,
        escola_id: context.school?.id,
        estado_id: estadoId,
        turmas,
      });
    } catch (error) {
      console.error('Erro ao carregar contexto do usuário:', error);
      setUserContext({});
    } finally {
      setIsLoadingContext(false);
    }
  }, [user.id, user.role]);

  useEffect(() => {
    if (!allowedRoles.includes(user.role)) {
      toast({
        title: 'Acesso Negado',
        description: 'Você não tem permissão para acessar esta página.',
        variant: 'destructive',
      });
      navigate('/app');
      return;
    }
    loadUserContext();
  }, [user.id, user.role, allowedRoles, toast, navigate, loadUserContext]);

  useEffect(() => {
    if (!isLoadingContext && allowedRoles.includes(user.role)) {
      loadVideos();
      loadFilterOptions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.role, filters, isLoadingContext, allowedRoles]);

  const loadFilterOptions = async () => {
    try {
      // Carregar escolas, séries e disciplinas para filtros em paralelo
      const [schoolsRes, subjectsRes, gradesRes] = await Promise.all([
        api.get('/school/').catch(() => ({ data: [] })),
        api.get('/subjects').catch(() => ({ data: [] })),
        api.get('/grades/').catch(() => ({ data: [] })),
      ]);

      setSchools(Array.isArray(schoolsRes.data) ? schoolsRes.data : (schoolsRes.data?.data || []));
      setSubjects(subjectsRes.data || []);
      // Sempre carregar todas as séries disponíveis
      setGrades(gradesRes.data || []);
    } catch (error) {
      console.error('Erro ao carregar opções de filtro:', error);
    }
  };

  const loadVideos = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.school) params.append('school', filters.school);
      if (filters.grade) params.append('grade', filters.grade);
      if (filters.subject) params.append('subject', filters.subject);

      const response = await api.get(`/play-tv/videos?${params.toString()}`);
      let allVideos = response.data || [];

      // Filtrar vídeos baseado no role
      allVideos = filterVideosByRole(allVideos);

      setVideos(allVideos);
    } catch (err) {
      const error = err as {
        response?: {
          status?: number;
          data?: {
            message?: string;
          };
        };
        message?: string;
      };
      // Se o endpoint não existir (404), apenas definir lista vazia sem mostrar erro
      // O interceptor transforma o erro, então verificamos a mensagem ou o status original
      const is404 = error.response?.status === 404 || 
                    error.message?.includes('não encontrado') ||
                    error.message?.includes('Not Found');
      
      if (is404) {
        setVideos([]);
        // Não logar erro para 404 em endpoints que podem não estar implementados ainda
        return;
      }
      
      console.error('Erro ao carregar vídeos:', error);
      toast({
        title: 'Erro',
        description: toUserFacingErrorMessage(error, 'Não foi possível carregar os vídeos.'),
        variant: 'destructive',
      });
      setVideos([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filterVideosByRole = (videos: PlayTvVideo[]): PlayTvVideo[] => {
    if (user.role === 'admin') {
      return videos;
    }

    if (user.role === 'tecadm' && userContext.municipio_id) {
      // Escopo municipal no vídeo ou vídeos direcionados a escolas (backend já restringe por cidade)
      return videos.filter(
        (video) => video.entire_municipality === true || video.schools.length > 0
      );
    }

    if ((user.role === 'diretor' || user.role === 'coordenador') && userContext.escola_id) {
      return videos.filter(video => 
        video.schools.some(school => school.id === userContext.escola_id)
      );
    }

    if (user.role === 'professor' && userContext.turmas && userContext.turmas.length > 0) {
      const allowedSchoolIds = new Set(userContext.turmas.map(t => t.school_id));
      const allowedGradeIds = new Set(userContext.turmas.map(t => t.grade_id));
      
      return videos.filter(video => 
        video.schools.some(school => allowedSchoolIds.has(school.id)) &&
        allowedGradeIds.has(video.grade.id)
      );
    }

    return videos;
  };

  const canDeleteVideo = (video: PlayTvVideo): boolean => {
    // Regra base: qualquer usuário pode excluir o próprio vídeo (quando a API retorna created_by).
    if (video.created_by?.id && video.created_by.id === user.id) {
      return true;
    }

    if (user.role === 'admin') {
      return true;
    }

    if (user.role === 'tecadm' && userContext.municipio_id) {
      // Tecadmin pode deletar vídeos do seu município
      // Verificar se o vídeo tem escolas do município do tecadmin
      // Como não temos city_id direto, vamos permitir se tiver escolas
      // O backend deve validar corretamente
      return video.schools.length > 0;
    }

    if ((user.role === 'diretor') && userContext.escola_id) {
      return video.schools.some(school => school.id === userContext.escola_id);
    }

    return false;
  };

  const requestDeleteVideo = (videoId: string) => {
    setPendingDeleteVideoId(videoId);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteVideo = async () => {
    if (!pendingDeleteVideoId) return;
    setIsDeletingVideo(true);
    try {
      await api.delete(`/play-tv/videos/${pendingDeleteVideoId}`);
      toast({
        title: 'Sucesso',
        description: 'Vídeo excluído com sucesso.',
      });
      loadVideos();
      setDeleteDialogOpen(false);
      setPendingDeleteVideoId(null);
    } catch (err) {
      const error = err as {
        response?: {
          data?: {
            message?: string;
          };
        };
      };
      console.error('Erro ao excluir vídeo:', error);
      toast({
        title: 'Erro',
        description: toUserFacingErrorMessage(error, 'Não foi possível excluir o vídeo.'),
        variant: 'destructive',
      });
    } finally {
      setIsDeletingVideo(false);
    }
  };

  const handleVideoClick = (video: PlayTvVideo) => {
    navigate(`/app/play-tv/${video.id}`);
  };

  const handleRefresh = () => {
    loadVideos();
  };

  const handleVideoCreated = () => {
    loadVideos();
    setActiveTab('visualizar');
  };


  return (
    <div className="container mx-auto py-6 space-y-6">
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setPendingDeleteVideoId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir vídeo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este vídeo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingVideo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteVideo();
              }}
              disabled={isDeletingVideo}
            >
              {isDeletingVideo ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header — mobile: título/desc alinhados, botão centralizado abaixo */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
            <Tv className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
            Play TV
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {canCreate
              ? 'Gerencie e cadastre vídeos educacionais para os alunos'
              : 'Visualize os vídeos disponíveis'}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 w-full sm:w-auto sm:justify-end">
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      {canCreate && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="visualizar" className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Visualizar Vídeos
            </TabsTrigger>
            <TabsTrigger value="cadastrar" className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Cadastrar Vídeo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="visualizar" className="space-y-6 mt-6">
            {/* Filtros */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <School className="h-5 w-5" />
                  Filtros
                </CardTitle>
                <CardDescription>Filtre os vídeos por escola, série ou disciplina</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Escola</label>
                    <Select
                      value={filters.school || 'all'}
                      onValueChange={(value) => {
                        setFilters({
                          ...filters,
                          school: value === 'all' ? undefined : value,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todas as escolas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as escolas</SelectItem>
                        {schools.map((school) => (
                          <SelectItem key={school.id} value={school.id}>
                            {school.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Série</label>
                    <Select
                      value={filters.grade || 'all'}
                      onValueChange={(value) =>
                        setFilters({
                          ...filters,
                          grade: value === 'all' ? undefined : value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todas as séries" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as séries</SelectItem>
                        {grades.map((grade) => (
                          <SelectItem key={grade.id} value={grade.id}>
                            {grade.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Disciplina</label>
                    <Select
                      value={filters.subject || 'all'}
                      onValueChange={(value) =>
                        setFilters({
                          ...filters,
                          subject: value === 'all' ? undefined : value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todas as disciplinas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as disciplinas</SelectItem>
                        {subjects.map((subject) => (
                          <SelectItem key={subject.id} value={subject.id}>
                            {subject.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Lista de Vídeos */}
            <VideoList 
              videos={videos} 
              isLoading={isLoading} 
              onVideoClick={handleVideoClick}
              onDeleteVideo={requestDeleteVideo}
              userRole={user.role}
              canDeleteVideo={canDeleteVideo}
            />
          </TabsContent>

          <TabsContent value="cadastrar">
            <CreatePlayTvVideoForm
              onSuccess={handleVideoCreated}
              userRole={user.role}
              userMunicipioId={userContext.municipio_id}
              userEscolaId={userContext.escola_id}
              userEstadoId={userContext.estado_id}
              userTurmas={userContext.turmas}
            />
          </TabsContent>
        </Tabs>
      )}

      {!canCreate && (
        <>
          {/* Filtros */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <School className="h-5 w-5" />
                Filtros
              </CardTitle>
              <CardDescription>Filtre os vídeos por escola, série ou disciplina</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Escola</label>
                  <Select
                    value={filters.school || 'all'}
                    onValueChange={(value) => {
                      setFilters({
                        ...filters,
                        school: value === 'all' ? undefined : value,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas as escolas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as escolas</SelectItem>
                      {schools.map((school) => (
                        <SelectItem key={school.id} value={school.id}>
                          {school.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Série</label>
                  <Select
                    value={filters.grade || 'all'}
                    onValueChange={(value) =>
                      setFilters({
                        ...filters,
                        grade: value === 'all' ? undefined : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas as séries" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as séries</SelectItem>
                      {grades.map((grade) => (
                        <SelectItem key={grade.id} value={grade.id}>
                          {grade.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Disciplina</label>
                  <Select
                    value={filters.subject || 'all'}
                    onValueChange={(value) =>
                      setFilters({
                        ...filters,
                        subject: value === 'all' ? undefined : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas as disciplinas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as disciplinas</SelectItem>
                      {subjects.map((subject) => (
                        <SelectItem key={subject.id} value={subject.id}>
                          {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de Vídeos */}
          <VideoList 
            videos={videos} 
            isLoading={isLoading} 
            onVideoClick={handleVideoClick}
            onDeleteVideo={requestDeleteVideo}
            userRole={user.role}
            canDeleteVideo={canDeleteVideo}
          />
        </>
      )}
    </div>
  );
}

