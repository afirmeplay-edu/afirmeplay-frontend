import { api } from '@/lib/api';

export type ContentRewardType = 'game' | 'video';

export type ContentRewardStatus =
  | 'granted'
  | 'already_claimed'
  | 'daily_cap_reached'
  | 'too_early'
  | 'not_eligible';

export interface ContentRewardClaimResponse {
  granted: boolean;
  coins: number;
  status: ContentRewardStatus;
  daily_remaining: number;
  new_balance: number | null;
  achievement_progress: {
    id: string;
    level: string | null;
    progress: number | null;
    next_threshold: number | null;
  } | null;
}

export interface ContentSessionStartResponse {
  session_id: string;
  started_at?: string | null;
}

export interface MyContentRewardsResponse {
  content_ids: string[];
  daily_remaining: number;
}

export async function startContentSession(
  type: ContentRewardType,
  id: string
): Promise<ContentSessionStartResponse> {
  const url =
    type === 'game' ? `/games/${id}/session/start` : `/play-tv/videos/${id}/session/start`;
  const { data } = await api.post<ContentSessionStartResponse>(url);
  return data;
}

export async function claimContentReward(
  type: ContentRewardType,
  id: string,
  payload: {
    session_id: string;
    watched_percent?: number;
    duration_seconds?: number;
  }
): Promise<ContentRewardClaimResponse> {
  const url =
    type === 'game' ? `/games/${id}/claim-reward` : `/play-tv/videos/${id}/claim-reward`;
  const { data } = await api.post<ContentRewardClaimResponse>(url, payload);
  return data;
}

export async function getMyContentRewards(
  type?: ContentRewardType
): Promise<MyContentRewardsResponse> {
  const params = type ? { type } : {};
  const { data } = await api.get<MyContentRewardsResponse>('/students/me/content-rewards', {
    params,
  });
  return data;
}
