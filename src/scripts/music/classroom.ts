/**
 * The night classroom (components/music/Classroom.astro): the room follows the song.
 *
 * Time comes from whichever is playing: the YouTube player (the MV, read through the IFrame API,
 * shifted by the song's `mv.offset`) or the page's own clock (the MP3). From it, every frame:
 *   - the movement on show: the room's light, the window's sky and the chalkboard (erased and
 *     rewritten) follow it; in song-only mode the movement's card slides onto the screen
 *   - the mix's accents: each of the four nods on them, a little late and in their own way
 *   - the cues (songs.ts `roomCues`): heads turn to the window, or Sky and Time to each other
 *   - the highlight movement: strong accents send a star falling past the window
 * Every pose is eased per real frame time, never set outright (the rabbits' first version
 * juddered for that), and a seek recomputes the pose from the time instead of replaying.
 * Nothing loads from YouTube until the visitor presses play on the screen.
 */
import type { Mood } from '../../data/songs';

export interface RoomSong {
  movements: { name: string; t: number }[];
  hits: [number, number][];
  moods: Mood[];
  highlight: number;
  mv: { youtube: string; offset: number } | null;
  roomCues?: { movement: number; pose: 'window' | 'skyTime' }[];
}

export interface RoomHooks {
  /** the page clock (MP3) */
  audioTime(): number;
  audioPlaying(): boolean;
  /** the visitor asked for the song alone */
  playAudio(): void;
  /** the video started playing: the MP3 must stop */
  onVideoPlay(): void;
}

export interface Room {
  /** the MP3 started (from the page's own PLAY): the screen shows the cards */
  audioStarted(): void;
  pauseVideo(): void;
  /** seek the video if it is the one playing; false if the MP3 should take it */
  seek(t: number): boolean;
  /** draw the room at the current time (after a seek, a pause) */
  wake(): void;
}

type YTPlayer = {
  getCurrentTime(): number;
  getPlayerState(): number;
  pauseVideo(): void;
  seekTo(t: number, allow: boolean): void;
};
type YTNamespace = { Player: new (el: HTMLElement, o: object) => YTPlayer };

let ytApi: Promise<YTNamespace> | null = null;
function loadYouTube(): Promise<YTNamespace> {
  ytApi ??= new Promise((done) => {
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
  return ytApi;
}

const KIDS = ['sky', 'time', 'sun', 'udon'] as const;
type Kid = (typeof KIDS)[number];
/** each one's own way of listening: how late, how much, how fast they sway */
const STYLE: Record<Kid, { lag: number; nod: number; sway: number; phase: number }> = {
  sky: { lag: 0.09, nod: 0.55, sway: 0.5, phase: 0.0 },
  time: { lag: 0.03, nod: 1.0, sway: 0.8, phase: 1.7 },
  sun: { lag: 0.0, nod: 1.25, sway: 1.1, phase: 3.1 },
  udon: { lag: 0.06, nod: 0.8, sway: 0.6, phase: 4.4 },
};
/** where a cue turns each head: degrees of turn (− = toward the window, our left), px of lean */
const POSES: Record<'window' | 'skyTime', Partial<Record<Kid, [number, number]>>> = {
  window: { sky: [-9, -5], time: [-10, -6], sun: [-8, -5], udon: [-7, -4] },
  skyTime: { sky: [8, 4], time: [-8, -4] },
};

export function initRoom(el: HTMLElement, song: RoomSong, hooks: RoomHooks): Room {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const youtube = el.dataset.youtube;
  const cards = el.dataset.cards ?? '';
  const chalk = el.querySelector<SVGGElement>('.cr__chalk')!;
  const boardNum = el.querySelector<SVGTextElement>('[data-board-num]')!;
  const boardName = el.querySelector<SVGTextElement>('[data-board-name]')!;
  const fall = el.querySelector<SVGGElement>('[data-fall]')!;
  const slides = el.querySelector<HTMLElement>('[data-slides]')!;
  const videoBox = el.querySelector<HTMLElement>('[data-video]')!;
  const heads = Object.fromEntries(KIDS.map((k) => [k, el.querySelector<SVGGElement>(`.cr__kid--${k} .cr__head`)])) as Record<Kid, SVGGElement | null>;

  type Mode = 'off' | 'mv' | 'audio';
  let mode: Mode = 'off';
  let player: YTPlayer | null = null;
  let ytReady = false; // the player's methods exist only after onReady
  const setMode = (m: Mode) => {
    if (m === mode) return;
    if (mode === 'off' && !reduced) {
      el.classList.add('is-warming');
      setTimeout(() => el.classList.remove('is-warming'), 750);
    }
    mode = m;
    el.dataset.mode = m;
    el.style.setProperty('--cr-beam', m === 'off' ? '0' : '1');
    cur = -1; // repaint the board and the slide for the new mode
    kick();
  };

  // --- time ------------------------------------------------------------------------------
  const offset = song.mv?.offset ?? 0;
  const videoPlaying = () => mode === 'mv' && ytReady && player!.getPlayerState() === 1;
  const time = () => (mode === 'mv' && player && ytReady ? Math.max(0, player.getCurrentTime() - offset) : hooks.audioTime());
  const playing = () => videoPlaying() || (mode !== 'mv' && hooks.audioPlaying());
  const movementAt = (t: number) => {
    let i = 0;
    while (i + 1 < song.movements.length && song.movements[i + 1].t <= t + 0.05) i++;
    return i;
  };

  // --- the movement: light, window, board, slide ---------------------------------------------
  let cur = -1;
  let slideImg: HTMLImageElement | null = null;
  const roman = (name: string) => name.split('.')[0];
  const title = (name: string) => name.split('. ').slice(1).join('. ');
  const paint = (i: number) => {
    const [top, bottom] = song.moods[i] ?? ['#121a33', '#07080f'];
    const s = el.style;
    s.setProperty('--cr-wall-a', `color-mix(in srgb, ${top} 45%, #0a0c16)`);
    s.setProperty('--cr-wall-b', bottom);
    s.setProperty('--cr-light', `color-mix(in srgb, ${top} 70%, #ffffff)`);
    s.setProperty('--cr-sky-a', top);
    s.setProperty('--cr-sky-b', bottom);
    s.setProperty('--cr-rim', `color-mix(in srgb, ${top} 45%, #ffffff)`);
    // the board: wiped, then written again
    const m = song.movements[i];
    const write = () => {
      boardNum.textContent = roman(m.name);
      boardName.textContent = title(m.name);
      chalk.classList.remove('is-erasing');
    };
    if (reduced) write();
    else {
      chalk.classList.add('is-erasing');
      setTimeout(write, 450);
    }
    if (mode === 'audio') slide(i);
  };
  const slide = (i: number) => {
    const img = new Image();
    img.src = `${cards}/${String(i + 1).padStart(2, '0')}.webp`;
    img.alt = '';
    img.decoding = 'async';
    if (!reduced && slideImg) img.className = 'is-in';
    slides.append(img);
    const old = slideImg;
    slideImg = img;
    requestAnimationFrame(() => requestAnimationFrame(() => img.classList.remove('is-in')));
    if (old) {
      old.classList.add('is-out');
      setTimeout(() => old.remove(), 800);
    }
    // the next card loads ahead
    if (i + 1 < song.movements.length) new Image().src = `${cards}/${String(i + 2).padStart(2, '0')}.webp`;
  };

  // --- the four of them -------------------------------------------------------------------
  const state = Object.fromEntries(KIDS.map((k) => [k, { rot: 0, x: 0, y: 0, env: 0 }])) as Record<Kid, { rot: number; x: number; y: number; env: number }>;
  let hitIdx = 0;
  let lastT = -1;
  const pending: { at: number; v: number }[] = []; // accents waiting for each one's lag
  const poseAt = (i: number) => {
    const cue = song.roomCues?.find((c) => c.movement === i);
    return cue ? POSES[cue.pose] : {};
  };

  const launchStar = (v: number) => {
    if (reduced) return;
    const ns = 'http://www.w3.org/2000/svg';
    const ln = document.createElementNS(ns, 'line');
    const x = 60 + Math.random() * 100;
    const y = 260 + Math.random() * 120;
    const len = 18 + v * 22;
    ln.setAttribute('x1', String(x));
    ln.setAttribute('y1', String(y));
    ln.setAttribute('x2', String(x - len));
    ln.setAttribute('y2', String(y + len * 0.8));
    ln.setAttribute('stroke-width', String(1 + v * 1.2));
    fall.append(ln);
    ln.animate(
      [
        { transform: 'translate(0,0)', opacity: 0 },
        { transform: 'translate(-10px,8px)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-70px,56px)', opacity: 0 },
      ],
      { duration: 800, easing: 'cubic-bezier(.3,0,.6,1)' },
    ).onfinish = () => ln.remove();
  };

  // --- the frame loop -------------------------------------------------------------------------
  let raf = 0;
  let prev = 0;
  let visible = true;
  const frame = (now: number) => {
    const dt = Math.min(0.05, prev ? (now - prev) / 1000 : 1 / 60);
    prev = now;
    const t = time();
    const isPlaying = playing();

    // with the projector off the room keeps its own night and the board its NOW SHOWING
    const i = movementAt(t);
    if (mode !== 'off' && i !== cur) {
      cur = i;
      paint(i);
    }

    // accents: a seek (or a jump back) re-finds the place instead of replaying
    if (lastT < 0 || t < lastT - 0.25 || t > lastT + 1) {
      hitIdx = song.hits.findIndex((h) => h[0] > t);
      if (hitIdx < 0) hitIdx = song.hits.length;
      pending.length = 0;
    } else if (isPlaying) {
      while (hitIdx < song.hits.length && song.hits[hitIdx][0] <= t) {
        const [, v] = song.hits[hitIdx++];
        pending.push({ at: now, v });
        if (cur === song.highlight && v > 0.78) launchStar(v);
      }
    }
    lastT = t;

    // each one hears the accent after their own lag
    for (const k of KIDS) {
      const st = state[k];
      for (const p of pending) if (now - p.at >= STYLE[k].lag * 1000 && now - p.at < STYLE[k].lag * 1000 + dt * 1000 + 1) st.env = Math.max(st.env, p.v);
      st.env *= Math.exp(-dt * 7);
    }
    while (pending.length && now - pending[0].at > 200) pending.shift();

    const pose = poseAt(cur);
    let moving = false;
    for (const k of KIDS) {
      const st = state[k];
      const [turn, lean] = pose[k] ?? [0, 0];
      const sway = isPlaying && !reduced ? Math.sin(t * 1.3 * STYLE[k].sway + STYLE[k].phase) * 1.4 : 0;
      const nod = reduced ? 0 : st.env * STYLE[k].nod;
      const tRot = turn + sway + nod * 5;
      const tY = -nod * 7;
      const tX = lean;
      const ease = reduced ? 1 : 1 - Math.exp(-dt * 10);
      st.rot += (tRot - st.rot) * ease;
      st.y += (tY - st.y) * ease;
      st.x += (tX - st.x) * ease;
      if (Math.abs(tRot - st.rot) > 0.02 || Math.abs(tY - st.y) > 0.02 || Math.abs(tX - st.x) > 0.02) moving = true;
      heads[k]?.setAttribute('transform', `translate(${st.x.toFixed(2)} ${st.y.toFixed(2)}) rotate(${st.rot.toFixed(2)})`);
    }

    raf = visible && (isPlaying || moving || pending.length) ? requestAnimationFrame(frame) : 0;
  };
  const kick = () => {
    if (!raf && visible) {
      prev = 0;
      raf = requestAnimationFrame(frame);
    }
  };
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible) kick();
  }).observe(el);

  // --- the two ways to watch ------------------------------------------------------------------
  const startVideo = async () => {
    if (!youtube) return;
    setMode('mv');
    if (player) {
      if (ytReady) (player as unknown as { playVideo(): void }).playVideo();
      return;
    }
    const YT = await loadYouTube();
    const host = document.createElement('div');
    videoBox.replaceChildren(host);
    player = new YT.Player(host, {
      host: 'https://www.youtube-nocookie.com',
      videoId: youtube,
      playerVars: { autoplay: 1, rel: 0, playsinline: 1, modestbranding: 1 },
      events: {
        onReady: () => {
          ytReady = true;
          kick();
        },
        onStateChange: (e: { data: number }) => {
          if (e.data === 1) {
            hooks.onVideoPlay();
            setMode('mv');
          }
          lastT = -1;
          kick();
        },
      },
    });
  };
  // the screen's big button, and the small one in its corner while the song plays alone
  el.querySelectorAll('[data-play-mv]').forEach((b) => b.addEventListener('click', () => void startVideo()));
  el.querySelector('[data-play-audio]')?.addEventListener('click', () => {
    setMode('audio');
    hooks.playAudio();
  });

  // first paint: the board and the light of where the song stands now
  kick();

  return {
    audioStarted() {
      if (mode === 'mv' && ytReady) player!.pauseVideo();
      setMode('audio');
      lastT = -1;
      kick();
    },
    pauseVideo() {
      if (ytReady) player!.pauseVideo();
    },
    seek(t: number) {
      lastT = -1;
      kick();
      if (mode === 'mv' && player && ytReady) {
        player.seekTo(t + offset, true);
        return true;
      }
      return false;
    },
    wake() {
      kick();
    },
  };
}
