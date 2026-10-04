/**
 * The song page's music video: a YouTube IFrame API player, created on the visitor's click (nothing
 * loads from YouTube before that), on the privacy-enhanced host.
 *
 * The page reads the video's time to drive its own clock (scripts/ost/song.ts), so it needs the API
 * rather than a bare iframe. The player's methods exist only after onReady: `ready` says when.
 */
export const YT_PLAYING = 1;
export const YT_BUFFERING = 3;

export interface MvPlayer {
  ready: boolean;
  time(): number;
  state(): number;
  play(): void;
  pause(): void;
  seek(t: number): void;
}

type YTPlayer = {
  getCurrentTime(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(t: number, allowSeekAhead: boolean): void;
};
type YTNamespace = { Player: new (el: HTMLElement, o: object) => YTPlayer };

let api: Promise<YTNamespace> | null = null;
function loadApi(): Promise<YTNamespace> {
  api ??= new Promise((done) => {
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
    document.head.append(s);
  });
  return api;
}

/**
 * Put the player into `box`, starting at `start` seconds of the video. `onState` gets YouTube's
 * player states (-1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued).
 */
export async function mountMv(box: HTMLElement, id: string, start: number, onState: (s: number) => void): Promise<MvPlayer> {
  const YT = await loadApi();
  const host = document.createElement('div');
  box.replaceChildren(host);
  const mv: MvPlayer = {
    ready: false,
    time: () => (mv.ready ? p.getCurrentTime() : start),
    state: () => (mv.ready ? p.getPlayerState() : -1),
    play: () => mv.ready && p.playVideo(),
    pause: () => mv.ready && p.pauseVideo(),
    seek: (t) => {
      if (mv.ready) p.seekTo(t, true);
      else start = t;
    },
  };
  const p: YTPlayer = new YT.Player(host, {
    host: 'https://www.youtube-nocookie.com',
    videoId: id,
    playerVars: { autoplay: 1, rel: 0, playsinline: 1, modestbranding: 1, start: Math.floor(start) },
    events: {
      onReady: () => {
        mv.ready = true;
        if (start % 1) p.seekTo(start, true); // `start` takes whole seconds only
        p.playVideo();
      },
      onStateChange: (e: { data: number }) => onState(e.data),
    },
  });
  return mv;
}
