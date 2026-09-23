type YtPlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getPlaybackRate: () => number;
};

type YtNamespace = {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: () => void;
      };
    }
  ) => YtPlayer;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number };
};

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const waiters: Array<() => void> = [];
let scriptInjected = false;

export function loadYouTubeIframeApi(): Promise<YtNamespace> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      if (window.YT) resolve(window.YT);
    });
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      waiters.splice(0).forEach((fn) => fn());
    };
    if (!scriptInjected && !document.getElementById('youtube-iframe-api')) {
      scriptInjected = true;
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }
  });
}

export function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  return match?.[1] ?? null;
}

/** Une intervalos assistidos e devolve percentual 0–100. Seek não preenche buracos. */
export function watchedPercentFromRanges(
  ranges: Array<[number, number]>,
  durationSeconds: number
): number {
  if (durationSeconds <= 0 || ranges.length === 0) return 0;
  const sorted = [...ranges].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (!last || start > last[1]) {
      merged.push([start, end]);
    } else {
      last[1] = Math.max(last[1], end);
    }
  }
  const covered = merged.reduce((acc, [a, b]) => acc + (b - a), 0);
  return Math.min(100, (covered / durationSeconds) * 100);
}

export function extendWatchedRange(
  ranges: Array<[number, number]>,
  lastTime: number | null,
  currentTime: number,
  maxGapSeconds = 1.75
): { ranges: Array<[number, number]>; lastTime: number } {
  const next = ranges.map((r) => [r[0], r[1]] as [number, number]);
  if (lastTime != null && currentTime >= lastTime && currentTime - lastTime <= maxGapSeconds) {
    const last = next[next.length - 1];
    if (last && Math.abs(last[1] - lastTime) <= maxGapSeconds) {
      last[1] = currentTime;
    } else {
      next.push([lastTime, currentTime]);
    }
  } else if (currentTime >= 0) {
    next.push([currentTime, currentTime]);
  }
  return { ranges: next, lastTime: currentTime };
}
