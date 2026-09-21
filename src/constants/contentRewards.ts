/** Constantes de UI alinhadas ao backend `app/rewards/config.py`. */
export const CONTENT_REWARD_UI = {
  gameCoins: 10,
  videoCoins: 15,
  gameSeconds: 60,
  videoFallbackSeconds: 120,
  youtubePercent: 80,
} as const;

export const COINS_UPDATED_EVENT = 'afirmeplay:coins-updated';

export function notifyCoinsUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(COINS_UPDATED_EVENT));
  }
}
