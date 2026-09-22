import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  Calendar,
  School,
  BookOpen,
  GraduationCap,
  User,
  ExternalLink,
  Paperclip,
  Link2,
  Download,
  Loader2,
  Pencil,
  Trash2,
  MapPin,
} from 'lucide-react';
import { api } from '@/lib/api';
import { fetchAuthenticatedDownload } from '@/lib/fetch-authenticated-download';
import { VideoPlayer, type VideoWatchProgress } from '@/components/playtv/VideoPlayer';
import { PlayTvVideo, isPlayTvFileResource, isPlayTvLinkResource } from '@/types/playtv';
import {
  canEditPlayTvVideo,
  getPlayTvApiErrorMessage,
  PLAY_TV_MAX_UPLOAD_BYTES,
  uploadPlayTvFileResource,
} from '@/lib/playtv';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/authContext';
import { getUserHierarchyContext } from '@/utils/userHierarchy';
import { PlayTvVideoEditDialog } from '@/components/playtv/PlayTvVideoEditDialog';
import { useContentReward } from '@/hooks/useContentReward';
import { RewardEarnedModal } from '@/components/rewards/RewardEarnedModal';
import { getMyContentRewards } from '@/services/contentRewardsApi';
import { extractYouTubeId } from '@/lib/youtubeWatch';

interface ApiError {
  response?: {
    status?: number;
    data?: {
      message?: string;
    };
  };
  message?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default function PlayTvVideoView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [video, setVideo] = useState<PlayTvVideo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingResourceId, setDownloadingResourceId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [userContext, setUserContext] = useState<{
    municipio_id?: string;
    escola_id?: string;
    turmas?: Array<{ class_id: string; school_id: string; grade_id: string; subject_id?: string }>;
  }>({});
  const [contextLoaded, setContextLoaded] = useState(false);

  const [attachTitle, setAttachTitle] = useState('');
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [isUploadingAttach, setIsUploadingAttach] = useState(false);

  const isStudentView = location.pathname.startsWith('/aluno');
  const [watchProgress, setWatchProgress] = useState<VideoWatchProgress | null>(null);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [rewardModalOpen, setRewardModalOpen] = useState(false);

  const fetchVideo = useCallback(async () => {
    if (!id) return;
    
    try {
      setIsLoading(true);
      const response = await api.get(`/play-tv/videos/${id}`);
      setVideo(response.data);
    } catch (err) {
      const error = err as ApiError;
      // Se o endpoint não existir (404), mostrar mensagem amigável
      if (error.response?.status === 404) {
        setError('Vídeo não encontrado ou endpoint ainda não implementado');
      } else {
        setError('Erro ao carregar o vídeo');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchVideo();
    }
  }, [id, fetchVideo]);

  useEffect(() => {
    if (!isStudentView || !id) return;
    let cancelled = false;
    getMyContentRewards('video')
      .then((res) => {
        if (!cancelled && res.content_ids?.includes(id)) {
          setAlreadyClaimed(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isStudentView, id]);

  const isYoutube = Boolean(video?.url && extractYouTubeId(video.url));
  const { visibleSeconds, requiredSeconds, claimResult, progressRatio } = useContentReward({
    type: 'video',
    id,
    enabled: isStudentView && Boolean(video) && !alreadyClaimed,
    alreadyClaimed,
    isYoutube,
    watchProgress: isYoutube ? watchProgress : null,
  });

  useEffect(() => {
    if (!claimResult) return;
    if (claimResult.status === 'granted') {
      setAlreadyClaimed(true);
      setRewardModalOpen(true);
    } else if (claimResult.status === 'daily_cap_reached') {
      toast({
        title: 'Limite diário de moedas',
        description: 'Você já ganhou o máximo de moedas de Jogos e Play TV hoje. Tente este vídeo amanhã.',
      });
    } else if (claimResult.status === 'already_claimed') {
      setAlreadyClaimed(true);
    }
  }, [claimResult, toast]);

  useEffect(() => {
    if (isStudentView) {
      setContextLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ctx = await getUserHierarchyContext(user.id, user.role);
        const turmas =
          ctx.classes?.map((c) => ({
            class_id: c.class_id,
            school_id: c.school_id,
            grade_id: c.grade_id,
            subject_id: undefined as string | undefined,
          })) ?? [];
        if (!cancelled) {
          setUserContext({
            municipio_id: ctx.municipality?.id,
            escola_id: ctx.school?.id,
            turmas,
          });
        }
      } catch {
        if (!cancelled) setUserContext({});
      } finally {
        if (!cancelled) setContextLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isStudentView, user.id, user.role]);

  const handleBack = () => {
    // Verificar se o usuário é aluno ou admin/professor
    const isStudent = window.location.pathname.includes('/aluno');
    navigate(isStudent ? '/aluno/play-tv' : '/app/play-tv');
  };

  const handleDownloadFile = async (resourceId: string, fallbackName: string) => {
    if (!id || !resourceId) return;
    setDownloadingResourceId(resourceId);
    try {
      await fetchAuthenticatedDownload(
        `play-tv/videos/${id}/resources/${resourceId}/download`,
        fallbackName || 'anexo'
      );
    } catch (err) {
      console.error('Erro ao obter link de download:', err);
      toast({
        title: 'Download',
        description: getPlayTvApiErrorMessage(err, 'Não foi possível baixar o arquivo.'),
        variant: 'destructive',
      });
    } finally {
      setDownloadingResourceId(null);
    }
  };

  const canEdit =
    !isStudentView &&
    contextLoaded &&
    video !== null &&
    canEditPlayTvVideo(video, user.role, userContext);

  const handleDeleteResource = async (resourceId: string, resourceLabel: string) => {
    if (!id || !resourceId) return;
    if (!confirm(`Remover o material "${resourceLabel}"?`)) return;
    try {
      await api.delete(`/play-tv/videos/${id}/resources/${resourceId}`);
      toast({ title: 'Recurso removido', description: 'O material foi excluído.' });
      fetchVideo();
    } catch (err) {
      console.error(err);
      toast({
        title: 'Erro',
        description: getPlayTvApiErrorMessage(err, 'Não foi possível remover o recurso.'),
        variant: 'destructive',
      });
    }
  };

  const handleAttachFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !attachFile || !attachTitle.trim()) {
      toast({
        title: 'Anexo',
        description: 'Selecione um arquivo e informe o nome para exibição.',
        variant: 'destructive',
      });
      return;
    }
    if (attachFile.size > PLAY_TV_MAX_UPLOAD_BYTES) {
      toast({
        title: 'Anexo',
        description: 'O arquivo excede o limite de 50 MB.',
        variant: 'destructive',
      });
      return;
    }
    if (attachTitle.trim().length > 200) {
      toast({
        title: 'Anexo',
        description: 'O nome pode ter no máximo 200 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    const linkCount = (video?.resources ?? []).filter(isPlayTvLinkResource).length;
    const fileCount = (video?.resources ?? []).filter(isPlayTvFileResource).length;
    const sortOrder = linkCount + fileCount;

    setIsUploadingAttach(true);
    try {
      await uploadPlayTvFileResource(api, id, attachFile, attachTitle.trim(), sortOrder);
      toast({ title: 'Anexo enviado', description: 'O arquivo foi vinculado ao vídeo.' });
      setAttachTitle('');
      setAttachFile(null);
      fetchVideo();
    } catch (err) {
      toast({
        title: 'Erro no envio',
        description: getPlayTvApiErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setIsUploadingAttach(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2">Carregando vídeo...</span>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive mb-4">{error || 'Vídeo não encontrado'}</p>
        <Button onClick={handleBack} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 space-y-8 max-w-7xl">
      {/* Header com gradiente roxo sutil */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 pb-6 border-b border-primary/10">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Button 
            onClick={handleBack} 
            variant="outline" 
            size="sm" 
            className="shadow-sm flex-shrink-0 border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight line-clamp-2 bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              {video.title || 'Vídeo sem título'}
            </h1>
            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
              {video.subject && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/5 border border-primary/10">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <span className="font-medium">{video.subject.name}</span>
                </div>
              )}
              {video.grade && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/5 border border-primary/10">
                  <GraduationCap className="w-4 h-4 text-primary" />
                  <span className="font-medium">{video.grade.name}</span>
                </div>
              )}
              {video.created_at && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/5 border border-primary/10">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="font-medium">{new Date(video.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        {!isStudentView && canEdit && (
          <Button variant="default" size="sm" className="shrink-0" onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4 mr-2" />
            Editar vídeo
          </Button>
        )}
      </div>

      {video.entire_municipality && (
        <Badge variant="secondary" className="w-fit gap-1">
          <MapPin className="w-3 h-3" />
          Município inteiro
        </Badge>
      )}

      {/* Player de Vídeo - agora com estilo próprio */}
      <div className="w-full">
        <VideoPlayer
          url={video.url}
          title={video.title ?? undefined}
          trackWatchProgress={isStudentView && isYoutube}
          onWatchProgress={isStudentView ? setWatchProgress : undefined}
        />
        {isStudentView && !alreadyClaimed && !isYoutube && requiredSeconds > 0 && progressRatio < 1 && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Continue assistindo para ganhar moedas ({Math.min(visibleSeconds, requiredSeconds)}s / {requiredSeconds}s)
          </p>
        )}
      </div>

      <RewardEarnedModal
        open={rewardModalOpen}
        onOpenChange={setRewardModalOpen}
        coins={claimResult?.coins ?? 0}
        description="Você ganhou moedas por assistir!"
      />

      {video.resources && video.resources.length > 0 && (
        <Card className="shadow-md border-primary/15">
          <CardHeader className="pb-3 border-b border-primary/10">
            <CardTitle className="text-lg flex items-center gap-2">
              <Paperclip className="w-5 h-5 text-primary" />
              Materiais complementares
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {[...video.resources]
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((r) => {
                if (isPlayTvLinkResource(r)) {
                  return (
                    <div
                      key={r.id ?? r.url + r.title}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-border/80 bg-muted/20 px-4 py-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <Link2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{r.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.url}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <Button variant="outline" size="sm" asChild>
                          <a href={r.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Abrir link
                          </a>
                        </Button>
                        {canEdit && r.id && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteResource(r.id!, r.title)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remover
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                }
                if (isPlayTvFileResource(r)) {
                  const canDownload = Boolean(r.id);
                  const busy = downloadingResourceId === r.id;
                  return (
                    <div
                      key={r.id ?? r.file_name + r.title}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-border/80 bg-muted/20 px-4 py-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <Paperclip className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{r.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.file_name}
                            {typeof r.size_bytes === 'number' ? ` · ${formatFileSize(r.size_bytes)}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canDownload || busy}
                          onClick={() => r.id && handleDownloadFile(r.id, r.file_name || 'anexo')}
                        >
                          {busy ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4 mr-2" />
                          )}
                          Baixar
                        </Button>
                        {canEdit && r.id && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteResource(r.id!, r.title)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remover
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              })}
          </CardContent>
        </Card>
      )}

      {canEdit && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Adicionar anexo (arquivo)</CardTitle>
            <CardDescription>PDF ou outros arquivos até 50 MB. Não substitui links existentes.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAttachFile} className="flex flex-col sm:flex-row flex-wrap gap-3 items-end">
              <div className="space-y-1 flex-1 min-w-[200px]">
                <Label htmlFor="attach-title">Nome exibido</Label>
                <Input
                  id="attach-title"
                  value={attachTitle}
                  maxLength={200}
                  onChange={(e) => setAttachTitle(e.target.value)}
                  placeholder="Ex.: Lista de exercícios"
                />
              </div>
              <div className="space-y-1 flex-1 min-w-[200px]">
                <Label htmlFor="attach-file">Arquivo</Label>
                <Input
                  id="attach-file"
                  type="file"
                  className="cursor-pointer"
                  onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <Button type="submit" disabled={isUploadingAttach}>
                {isUploadingAttach ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Enviar'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {!isStudentView && video && (
        <PlayTvVideoEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          video={video}
          onSaved={() => fetchVideo()}
        />
      )}

      {/* Informações do Vídeo - layout vertical único */}
      <Card className="shadow-lg border-primary/20 bg-gradient-to-br from-card to-primary/5">
        <CardHeader className="pb-4 border-b border-primary/10">
          <CardTitle className="text-2xl bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
            Informações do Vídeo
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {video.title && (
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                Título
              </h4>
              <p className="text-muted-foreground pl-3.5">{video.title}</p>
            </div>
          )}

          {video.subject && (
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                Disciplina
              </h4>
              <p className="text-muted-foreground pl-3.5">{video.subject.name}</p>
            </div>
          )}

          {video.grade && (
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                Série
              </h4>
              <p className="text-muted-foreground pl-3.5">{video.grade.name}</p>
            </div>
          )}

          {video.schools && video.schools.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                Escolas
              </h4>
              <div className="flex flex-wrap gap-2 pl-3.5">
                {video.schools.map((school) => (
                  <Badge 
                    key={school.id} 
                    variant="outline" 
                    className="break-words whitespace-normal max-w-full border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
                  >
                    <School className="w-3 h-3 mr-1.5 flex-shrink-0 text-primary" />
                    <span className="break-words">{school.name}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {video.classes && video.classes.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                Turmas
              </h4>
              <div className="flex flex-wrap gap-2 pl-3.5">
                {video.classes.map((c) => (
                  <Badge key={c.id} variant="outline" className="border-primary/30 bg-primary/5">
                    {c.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {video.created_at && (
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                Data de Publicação
              </h4>
              <p className="text-muted-foreground pl-3.5">
                {new Date(video.created_at).toLocaleDateString('pt-BR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          )}

          {video.created_by && (
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                Criado por
              </h4>
              <p className="text-muted-foreground flex items-center gap-2 pl-3.5">
                <User className="w-4 h-4 text-primary" />
                {video.created_by.name}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

