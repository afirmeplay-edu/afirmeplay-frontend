import { useCallback, useEffect, useRef, useState } from 'react';
import { CONTENT_REWARD_UI, notifyCoinsUpdated } from '@/constants/contentRewards';
import {
  claimContentReward,
  startContentSession,
  type ContentRewardClaimResponse,
  type ContentRewardType,
} from '@/services/contentRewardsApi';

const inFlightClaims = new Set<string>();

export interface WatchProgress {
  watchedPercent: number;
  durationSeconds: number;
}

export interface UseContentRewardOptions {
  type: ContentRewardType;
  id?: string;
  enabled: boolean;
  alreadyClaimed?: boolean;
  isYoutube?: boolean;
  watchProgress?: WatchProgress | null;
}

export function useContentReward({
  type,
  id,
  enabled,
  alreadyClaimed = false,
  isYoutube = false,
  watchProgress = null,
}: UseContentRewardOptions) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [visibleSeconds, setVisibleSeconds] = useState(0);
  const [claimResult, setClaimResult] = useState<ContentRewardClaimResponse | null>(null);
  const [claiming, setClaiming] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const claimedRef = useRef(alreadyClaimed);
  const visibleSecondsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);

  const requiredSeconds =
    type === 'game'
      ? CONTENT_REWARD_UI.gameSeconds
      : isYoutube
        ? 0
        : CONTENT_REWARD_UI.videoFallbackSeconds;

  useEffect(() => {
    claimedRef.current = alreadyClaimed;
  }, [alreadyClaimed]);

  useEffect(() => {
    if (!enabled || !id || alreadyClaimed) {
      return;
    }

    let cancelled = false;
    startContentSession(type, id)
      .then((res) => {
        if (cancelled) return;
        sessionIdRef.current = res.session_id;
        setSessionId(res.session_id);
      })
      .catch(() => {
        /* silencioso: o claim também falhará se não houver sessão */
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, id, type, alreadyClaimed]);

  useEffect(() => {
    if (!enabled || alreadyClaimed) return;

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        lastTickRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        lastTickRef.current = null;
        return;
      }
      const now = Date.now();
      if (lastTickRef.current != null) {
        const delta = (now - lastTickRef.current) / 1000;
        if (delta > 0 && delta < 5) {
          visibleSecondsRef.current += delta;
          setVisibleSeconds(Math.floor(visibleSecondsRef.current));
        }
      }
      lastTickRef.current = now;
    }, 500);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
  }, [enabled, alreadyClaimed]);

  const tryClaim = useCallback(async () => {
    if (!enabled || !id || claimedRef.current || claiming) return;
    const sid = sessionIdRef.current;
    if (!sid) return;

    const key = `${type}:${id}`;
    if (inFlightClaims.has(key)) return;

    if (type === 'game' && visibleSecondsRef.current < CONTENT_REWARD_UI.gameSeconds) {
      return;
    }
    if (type === 'video' && !isYoutube && visibleSecondsRef.current < CONTENT_REWARD_UI.videoFallbackSeconds) {
      return;
    }
    if (type === 'video' && isYoutube) {
      if (!watchProgress || watchProgress.watchedPercent < CONTENT_REWARD_UI.youtubePercent) {
        return;
      }
    }

    inFlightClaims.add(key);
    claimedRef.current = true;
    setClaiming(true);
    try {
      const payload: {
        session_id: string;
        watched_percent?: number;
        duration_seconds?: number;
      } = { session_id: sid };
      if (type === 'video' && isYoutube && watchProgress) {
        payload.watched_percent = watchProgress.watchedPercent;
        payload.duration_seconds = watchProgress.durationSeconds;
      }
      const result = await claimContentReward(type, id, payload);
      if (result.status === 'too_early') {
        claimedRef.current = false;
        inFlightClaims.delete(key);
        setClaiming(false);
        return;
      }
      setClaimResult(result);
      if (result.granted) {
        notifyCoinsUpdated();
      }
      if (result.status === 'daily_cap_reached') {
        inFlightClaims.delete(key);
      }
    } catch {
      claimedRef.current = false;
      inFlightClaims.delete(key);
    } finally {
      setClaiming(false);
    }
  }, [enabled, id, type, isYoutube, watchProgress, claiming]);

  useEffect(() => {
    if (!sessionId || alreadyClaimed) return;
    void tryClaim();
  }, [sessionId, visibleSeconds, watchProgress, alreadyClaimed, tryClaim]);

  return {
    sessionId,
    visibleSeconds,
    requiredSeconds,
    claimResult,
    claiming,
    progressRatio:
      requiredSeconds > 0 ? Math.min(1, visibleSeconds / requiredSeconds) : 0,
  };
}
