import { Play, Loader2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  extractYouTubeId,
  extendWatchedRange,
  loadYouTubeIframeApi,
  watchedPercentFromRanges,
} from '@/lib/youtubeWatch';

export interface VideoWatchProgress {
  watchedPercent: number;
  durationSeconds: number;
}

interface VideoPlayerProps {
  url: string;
  title?: string;
  trackWatchProgress?: boolean;
  onWatchProgress?: (progress: VideoWatchProgress) => void;
}

export const VideoPlayer = ({
  url,
  title,
  trackWatchProgress = false,
  onWatchProgress,
}: VideoPlayerProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<{ destroy: () => void; getCurrentTime: () => number; getDuration: () => number; getPlayerState: () => number } | null>(null);
  const rangesRef = useRef<Array<[number, number]>>([]);
  const lastTimeRef = useRef<number | null>(null);
  const onWatchProgressRef = useRef(onWatchProgress);
  const instanceId = useId().replace(/:/g, '');

  onWatchProgressRef.current = onWatchProgress;

  const youtubeId = extractYouTubeId(url);
  const useYoutubeApi = Boolean(trackWatchProgress && youtubeId);

  const getEmbedUrl = (videoUrl: string): string => {
    try {
      if (videoUrl.includes('embed') || videoUrl.includes('youtube.com/embed')) {
        return videoUrl;
      }
      if (videoUrl.includes('youtube.com/watch') || videoUrl.includes('youtu.be')) {
        const videoId = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
        if (videoId) {
          return `https://www.youtube.com/embed/${videoId}`;
        }
      }
      if (videoUrl.includes('<iframe')) {
        const srcMatch = videoUrl.match(/src=["']([^"']+)["']/);
        if (srcMatch && srcMatch[1]) {
          return srcMatch[1];
        }
      }
      return videoUrl;
    } catch (error) {
      console.error('Erro ao processar URL do vídeo:', error);
      return videoUrl;
    }
  };

  const embedUrl = getEmbedUrl(url);

  useEffect(() => {
    if (!useYoutubeApi || !youtubeId || !hostRef.current) {
      return;
    }

    let cancelled = false;
    let pollId: number | undefined;

    const emitProgress = () => {
      const player = playerRef.current;
      if (!player) return;
      const duration = player.getDuration?.() || 0;
      const percent = watchedPercentFromRanges(rangesRef.current, duration);
      onWatchProgressRef.current?.({
        watchedPercent: Math.round(percent * 10) / 10,
        durationSeconds: duration,
      });
    };

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        const player = new YT.Player(hostRef.current, {
          videoId: youtubeId,
          width: '100%',
          height: '100%',
          playerVars: {
            enablejsapi: 1,
            origin: window.location.origin,
            rel: 0,
          },
          events: {
            onReady: () => {
              if (!cancelled) setIsLoading(false);
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING) {
                lastTimeRef.current = player.getCurrentTime?.() ?? lastTimeRef.current;
              }
              if (event.data === YT.PlayerState.ENDED) {
                emitProgress();
              }
            },
            onError: () => {
              if (!cancelled) {
                setIsLoading(false);
                setHasError(true);
              }
            },
          },
        });
        playerRef.current = player;

        pollId = window.setInterval(() => {
          const current = playerRef.current;
          if (!current || typeof current.getPlayerState !== 'function') return;
          const state = current.getPlayerState();
          if (state !== YT.PlayerState.PLAYING) return;
          const t = current.getCurrentTime();
          const next = extendWatchedRange(rangesRef.current, lastTimeRef.current, t);
          rangesRef.current = next.ranges;
          lastTimeRef.current = next.lastTime;
          emitProgress();
        }, 400);
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoading(false);
          setHasError(true);
        }
      });

    return () => {
      cancelled = true;
      if (pollId) window.clearInterval(pollId);
      try {
        playerRef.current?.destroy();
      } catch {
        /* player pode já ter sido destruído */
      }
      playerRef.current = null;
      rangesRef.current = [];
      lastTimeRef.current = null;
    };
  }, [useYoutubeApi, youtubeId]);

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  return (
    <div className="w-full group relative">
      <div className="relative rounded-xl overflow-hidden border-2 border-primary/20 shadow-lg shadow-primary/10 bg-gradient-to-br from-primary/5 via-background to-purple-500/5 transition-all duration-300 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/20">
        {(embedUrl || useYoutubeApi) && !hasError ? (
          <>
            {isLoading && (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-purple-500/10 flex items-center justify-center z-10">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground font-medium">Carregando vídeo...</p>
                </div>
              </div>
            )}

            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              {useYoutubeApi ? (
                <div
                  id={`yt-player-${instanceId}`}
                  ref={hostRef}
                  className="absolute top-0 left-0 w-full h-full border-0 rounded-lg"
                />
              ) : (
                <iframe
                  src={embedUrl}
                  className="absolute top-0 left-0 w-full h-full border-0 rounded-lg"
                  allowFullScreen
                  title={title || 'Vídeo'}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                />
              )}
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-primary/0 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-lg" />
          </>
        ) : (
          <div className="flex items-center justify-center min-h-[400px] bg-gradient-to-br from-primary/10 via-purple-500/10 to-primary/5">
            <div className="text-center p-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                <Play className="w-10 h-10 text-primary" />
              </div>
              <p className="text-muted-foreground font-medium">Vídeo não disponível</p>
              <p className="text-sm text-muted-foreground/70 mt-2">Verifique se a URL do vídeo está correta</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
