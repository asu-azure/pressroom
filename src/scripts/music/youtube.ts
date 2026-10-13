/**
 * A YouTube IFrame API player on the privacy-enhanced host, created only when the visitor asks
 * for the song (nothing loads from YouTube before that).
 *
 * The crate needs the API, not a bare iframe: the disc spins while the player plays, a CD's next
 * track follows the one that ended, and a browser that refuses autoplay has to be told apart from
 * a song that is loading. The player's methods exist only after onReady; calls before that are
 * remembered and applied then.
 *
 * YouTube's terms for embeds hold here: the player is always visible (at least 200 × 200) and
 * nothing covers it, it starts by itself only once it is mostly in view (the caller scrolls it in
 * first), and it is never muted to get around a browser's autoplay rule.
 */
export const YT_UNSTARTED = -1;
export const YT_ENDED = 0;
export const YT_PLAYING = 1;
export const YT_PAUSED = 2;
export const YT_BUFFERING = 3;
export const YT_CUED = 5;

export interface YouTubePlayer {
  readonly ready: boolean;
  time(): number;
  state(): number;
  play(): void;
  pause(): void;
  /** Play another video in the same player (a CD's other track). */
  load(id: string, start?: number): void;
  /** Take the player out of the page. */
  destroy(): void;
}

type YTPlayer = {
  getCurrentTime(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  destroy(): void;
};
type YTNamespace = { Player: new (el: HTMLElement, o: object) => YTPlayer };

let api: Promise<YTNamespace> | null = null;
function loadApi(): Promise<YTNamespace> {
  api ??= new Promise((done, fail) => {
    const w = window as unknown as { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };
    if (w.YT?.Player) return done(w.YT);
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      done(w.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      api = null; // let a later press try again
      fail(new Error('youtube: the IFrame API did not load'));
    };
    document.head.append(s);
  });
  return api;
}

export interface MountOptions {
  start?: number;
  autoplay?: boolean;
  /** YouTube's player states: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued */
  onState?: (state: number) => void;
  /** the browser refused to start it by itself: the visitor has to press play in the player */
  onBlocked?: () => void;
  /** the video can't be played here (removed, private, not embeddable) */
  onError?: (code: number) => void;
}

/** Put a player for video `id` into `box` (its contents are replaced). */
export async function mountYouTube(box: HTMLElement, id: string, o: MountOptions = {}): Promise<YouTubePlayer> {
  const YT = await loadApi();
  const host = document.createElement('div');
  box.replaceChildren(host);
  let p: YTPlayer | null = null;
  let ready = false;
  let gone = false;
  let pending: { id: string; start: number } | null = null;
  const player: YouTubePlayer = {
    get ready() {
      return ready;
    },
    time: () => (ready && p ? p.getCurrentTime() : 0),
    state: () => (ready && p ? p.getPlayerState() : YT_UNSTARTED),
    play: () => void (ready && p?.playVideo()),
    pause: () => void (ready && p?.pauseVideo()),
    load(next, start = 0) {
      if (ready && p) p.loadVideoById({ videoId: next, startSeconds: start });
      else pending = { id: next, start };
    },
    destroy() {
      if (gone) return;
      gone = true;
      if (ready) p?.destroy();
      box.replaceChildren();
    },
  };
  p = new YT.Player(host, {
    host: 'https://www.youtube-nocookie.com',
    videoId: id,
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: o.autoplay ? 1 : 0,
      rel: 0,
      playsinline: 1,
      iv_load_policy: 3,
      start: Math.floor(o.start ?? 0),
    },
    events: {
      onReady: () => {
        if (gone) return void p?.destroy();
        ready = true;
        if (pending) {
          p!.loadVideoById({ videoId: pending.id, startSeconds: pending.start });
          pending = null;
        } else if (o.autoplay) p!.playVideo();
      },
      onStateChange: (e: { data: number }) => o.onState?.(e.data),
      onAutoplayBlocked: () => o.onBlocked?.(),
      onError: (e: { data: number }) => o.onError?.(e.data),
    },
  });
  return player;
}
