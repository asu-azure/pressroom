/**
 * /music/<slug> — a song's keychain, the scan, the playlist (routes/music/song.astro).
 * The song arrives as the page's #song-data payload (src/data/songs.ts + its imported JSON),
 * so one script serves every song.
 *
 * KEY view: the acrylic keychain hangs on scripts/dangle.ts. Tapping its sound
 * wave (or SCAN) runs the scan — a viewfinder closes on the code, a line reads
 * it, the bars light — and a same-document view transition opens the LIST view
 * out of the scanned point, the art and title flying to the playlist header.
 * The view is in the URL (?scan=1), so Back returns to the keychain and the QR
 * on the real keychain lands straight on the playlist.
 *
 * LIST view: one clock (ScoreClock, shared with /ost/tobira) follows whichever is
 * playing, the MP3 or the music video (scripts/music/youtube.ts), and drives
 * everything from the imported timeline — the movement on show, the lit card
 * under the video and liner-notes entry, the choir line and its karaoke wipe,
 * the sky colour, and the stars, which in XIV. Starfall fall on the accents of
 * the mix. The two never play together: either one starting stops the other,
 * and the song carries on from the same moment.
 * Nothing plays until the visitor asks; if the audio fails the clock runs on.
 */
import { ScoreClock } from './clock';
import type { Mood } from '../../data/songs';
import { dangle } from '../dangle';
import { punch } from '../mv';
import { mountMv, YT_PLAYING, type MvPlayer } from '../music/youtube';
import { applyCopy, readCopyPayload } from '../../lib/siteCopyClient';
import { DEFAULT_LANG, isLang, LANG_EVENT, LANG_STORAGE_KEY, type Lang } from '../../lib/lang';

type Chunk = [string, string, number, number];
interface Line {
  section: string;
  ja: string;
  th: string;
  t0: number;
  t1: number;
  chunks: Chunk[];
}

/** The page's #song-data payload (routes/music/song.astro). */
interface SongPayload {
  title: { ja: string; en: string };
  album: string;
  mv: { youtube: string; offset: number } | null;
  /** sky per movement [top, bottom, light] — src/data/songs.ts */
  moods: Mood[];
  /** the movement whose strong accents launch falling stars, or -1 */
  highlight: number;
  movements: { name: string; t: number }[];
  lyrics: Line[];
  hits: [number, number][];
  duration: number;
}

const NIGHT: [string, string] = ['#121a33', '#07080f']; // the KEY view's sky
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export function initSongPage() {
  const root = document.getElementById('ost');
  if (!root) return;
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const song = JSON.parse(document.getElementById('song-data')?.textContent ?? 'null') as SongPayload | null;
  if (!song) return;
  const { movements, lyrics, hits, duration } = song;
  // a song without moods keeps the night sky throughout
  const mood = (i: number): Mood => song.moods[i] ?? [NIGHT[0], NIGHT[1], 'night'];

  const audio = q<HTMLAudioElement>('[data-audio]');
  const kcStage = q('[data-kc-stage]');
  const songBtn = q<HTMLButtonElement>('[data-play-song]');
  const anyBtn = q<HTMLButtonElement>('[data-play-any]');
  const playLabel = q('[data-play-label]');
  const timeEl = q('[data-time]');
  const scrub = q('[data-scrub]');
  const nowNum = q('[data-now-num]');
  const nowName = q('[data-now-name]');
  const lyricBox = q('[data-lyric]');
  const lyricJa = q('[data-lyric-ja]');
  const lyricTh = q('[data-lyric-th]');
  const entries = [...root.querySelectorAll<HTMLButtonElement>('[data-mv]')];
  const strip = q('[data-cards]');
  const cards = [...strip.querySelectorAll<HTMLButtonElement>('[data-card]')];
  const mini = q('[data-mini]');
  const miniName = q('[data-mini-name]');
  const miniTime = q('[data-mini-time]');
  const hero = q('.ost__plHead');
  const finder = document.querySelector<HTMLElement>('[data-finder]')!;
  const listView = () => root.dataset.state === 'list';

  const clock = new ScoreClock(0);
  let audioOK = true;
  let started = false;
  let raf = 0;
  let cur = -1;
  let line = -1;
  let hitIdx = 0;

  audio.addEventListener('error', () => (audioOK = false));

  // --- the music video: while it plays, the clock follows it instead of the MP3 -------------
  const screen = root.querySelector<HTMLElement>('[data-screen]');
  const video = song.mv; // { youtube id, offset: the song's 0:00 in the video }
  const offset = video?.offset ?? 0;
  let mv: MvPlayer | null = null;
  let source: 'audio' | 'video' = 'audio';
  // YouTube reports its time in steps (a few times a second): between reports it runs on
  let ytSeen = -1;
  let ytSeenAt = 0;
  const videoTime = () => {
    const r = mv!.time();
    const at = performance.now();
    if (r !== ytSeen) {
      ytSeen = r;
      ytSeenAt = at;
    }
    const run = mv!.state() === YT_PLAYING ? Math.min(1, (at - ytSeenAt) / 1000) : 0;
    return Math.max(0, r + run - offset);
  };
  // right after a seek the player can still report the old place for a moment: hold the clock
  let hold = { t: 0, until: 0 };

  // --- copy / language (same contract as /asu) ------------------------------
  const bundle = readCopyPayload();
  const langBtns = [...document.querySelectorAll<HTMLButtonElement>('.ost__langs [data-lang]')];
  const setLang = (next: Lang) => {
    if (!bundle) return;
    applyCopy(bundle, next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
    langBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === next)));
    document.dispatchEvent(new CustomEvent<Lang>(LANG_EVENT, { detail: next }));
  };
  if (bundle) {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (isLang(saved) && saved !== DEFAULT_LANG) setLang(saved);
    } catch {
      /* default stays */
    }
    document.querySelector('.ost__langs')?.addEventListener('click', (e) => {
      const next = (e.target as Element | null)?.closest<HTMLElement>('[data-lang]')?.dataset.lang;
      if (isLang(next)) setLang(next);
    });
  }

  // --- the keychain: tap the wave to scan, anywhere else to give it a push ------
  const kc = dangle(kcStage, {
    onPress: (e) => {
      if ((e.target as Element | null)?.closest('[data-kc-wave]')) void scan();
      else kc.nudge(e.clientX < kcStage.getBoundingClientRect().left + kcStage.clientWidth / 2 ? 60 : -60, 90);
    },
  });

  // --- stars -------------------------------------------------------------------
  const canvas = q<HTMLCanvasElement>('.ost__stars');
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let dpr = 1;
  // seeded so every visit gets the same sky
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const stars = Array.from({ length: 140 }, () => ({ x: rnd(), y: rnd() * 0.85, r: 0.4 + rnd() * 1.1, p: rnd() * 6.28 }));
  const falling: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  let glow = 0; // flashes on accents

  const sizeSky = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    drawSky(clock.now());
  };

  function drawSky(t: number) {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const night = !listView() || cur < 0 || mood(cur)[2] === 'night' ? 1 : 0.45;
    for (const s of stars) {
      const tw = reduced ? 0.7 : 0.55 + 0.45 * Math.sin(t * 1.3 + s.p);
      ctx.globalAlpha = Math.min(1, (0.25 + tw * 0.6) * night + glow * 0.35);
      ctx.fillStyle = '#f4f1ea';
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283);
      ctx.fill();
    }
    for (const f of falling) {
      const len = 90;
      const g = ctx.createLinearGradient(f.x, f.y, f.x - f.vx * len, f.y - f.vy * len);
      g.addColorStop(0, `rgba(255,244,214,${Math.min(1, f.life)})`);
      g.addColorStop(1, 'rgba(255,244,214,0)');
      ctx.globalAlpha = 1;
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x - f.vx * len, f.y - f.vy * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  const launch = (strength: number) => {
    if (reduced || falling.length > 7) return;
    const a = 0.45 + rnd() * 0.25; // shallow dive, right to left
    falling.push({ x: W * (0.35 + rnd() * 0.7), y: H * rnd() * 0.35, vx: -Math.cos(a), vy: Math.sin(a), life: 0.6 + strength * 0.6 });
  };

  // --- movement / lyric state ------------------------------------------------
  const indexAt = (t: number) => {
    let i = 0;
    while (i + 1 < movements.length && movements[i + 1].t <= t) i++;
    return i;
  };

  // the strip keeps the card playing in view, unless the visitor is looking through it
  let stripTouched = 0;
  for (const ev of ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const)
    strip.addEventListener(ev, () => (stripTouched = performance.now()), { passive: true });
  const showCard = (i: number, animate: boolean) => {
    const c = cards[i];
    if (!c || !listView() || performance.now() - stripTouched < 4000 || strip.matches(':hover')) return;
    strip.scrollTo({ left: c.offsetLeft - (strip.clientWidth - c.offsetWidth) / 2, behavior: animate && !reduced ? 'smooth' : 'auto' });
  };

  const setMovement = (i: number, animate: boolean) => {
    if (i === cur) return;
    cur = i;
    const [num, ...rest] = movements[i].name.split('. ');
    nowNum.textContent = num;
    nowName.textContent = rest.join('. ');
    miniName.textContent = movements[i].name;
    if (animate && !reduced) {
      nowName.classList.remove('is-in');
      nowName.setAttribute('data-mv-converge', '');
      void nowName.offsetWidth;
      nowName.classList.add('is-in');
    }
    entries.forEach((e, k) => e.classList.toggle('is-now', k === i));
    cards.forEach((c, k) => c.classList.toggle('is-now', k === i));
    showCard(i, animate);
    paintSky();
  };
  // the playlist follows the song's moods; the keychain hangs in the night
  const paintSky = () => {
    const [a, b] = listView() && cur >= 0 ? mood(cur) : NIGHT;
    root.style.setProperty('--sky-a', a);
    root.style.setProperty('--sky-b', b);
  };

  const renderLine = (k: number) => {
    line = k;
    if (k < 0) {
      lyricBox.hidden = true;
      return;
    }
    const l = lyrics[k];
    lyricJa.textContent = '';
    let covered = '';
    for (const [text, kana, t0, t1] of l.chunks) {
      const span = document.createElement('span');
      span.dataset.t0 = String(t0);
      span.dataset.t1 = String(t1);
      if (kana && kana !== text && /[一-鿿]/.test(text)) {
        const ruby = document.createElement('ruby');
        ruby.append(text);
        const rt = document.createElement('rt');
        rt.textContent = kana;
        ruby.append(rt);
        span.append(ruby);
      } else span.textContent = text;
      lyricJa.append(span);
      covered += text;
    }
    // held vowels ("さあ——") run past the last timed chunk
    if (l.ja.startsWith(covered) && l.ja.length > covered.length) {
      const tail = document.createElement('span');
      tail.dataset.t0 = String(l.chunks.at(-1)?.[2] ?? l.t0);
      tail.dataset.t1 = String(l.t1);
      tail.textContent = l.ja.slice(covered.length);
      lyricJa.append(tail);
    }
    lyricTh.textContent = l.th;
    lyricBox.hidden = false;
  };

  const karaoke = (t: number) => {
    for (const s of lyricJa.children as HTMLCollectionOf<HTMLElement>) {
      const t0 = +s.dataset.t0!;
      const t1 = +s.dataset.t1!;
      s.style.setProperty('--k', String(Math.max(0, Math.min(1, (t - t0) / Math.max(0.05, t1 - t0)))));
    }
  };

  const update = (t: number, animate: boolean) => {
    setMovement(indexAt(t), animate);
    const k = lyrics.findIndex((l) => t >= l.t0 - 0.15 && t < l.t1 + 0.6);
    if (k !== line) renderLine(k);
    if (k >= 0) karaoke(t);

    const p = Math.min(1, t / duration);
    scrub.style.setProperty('--p', p.toFixed(4));
    scrub.setAttribute('aria-valuenow', String(Math.round(t)));
    scrub.setAttribute('aria-valuetext', fmt(t));
    timeEl.textContent = fmt(t);
    miniTime.textContent = fmt(t);
    const m0 = movements[cur].t;
    const m1 = movements[cur + 1]?.t ?? duration;
    const mp = ((t - m0) / (m1 - m0)).toFixed(4);
    entries[cur]?.style.setProperty('--mp', mp);
    cards[cur]?.style.setProperty('--mp', mp);
  };

  // --- transport -----------------------------------------------------------------
  // PLAY is the song alone; the mini transport's button is whatever is playing
  const setPlaying = () => {
    const songOn = clock.playing && source === 'audio';
    songBtn.setAttribute('aria-pressed', String(songOn));
    playLabel.textContent = songOn ? 'PAUSE' : 'PLAY';
    anyBtn.setAttribute('aria-pressed', String(clock.playing));
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = clock.playing ? 'playing' : 'paused';
  };

  const frame = () => {
    raf = 0;
    if (source === 'video') {
      if (mv?.ready && clock.playing) {
        const vt = videoTime();
        if (performance.now() > hold.until || Math.abs(vt - hold.t) < 1.5) clock.toward(vt);
      }
    } else if (audioOK) clock.follow(audio);
    let t = clock.now();
    if (t >= duration) {
      t = duration;
      if (source === 'audio') {
        pause();
        clock.set(0);
      }
    }
    // accents: sky glow everywhere, falling stars in XIV
    while (hitIdx < hits.length && hits[hitIdx][0] <= t) {
      const [, v] = hits[hitIdx++];
      glow = Math.max(glow, v * 0.6);
      if (cur === song.highlight && v > 0.8) launch(v);
    }
    glow *= 0.9;
    for (const f of falling) {
      f.x += f.vx * 9;
      f.y += f.vy * 9;
      f.life -= 0.018;
    }
    for (let i = falling.length - 1; i >= 0; i--) if (falling[i].life <= 0) falling.splice(i, 1);

    update(t, true);
    drawSky(t);
    if (clock.playing || falling.length) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const syncHits = (t: number) => {
    hitIdx = hits.findIndex((h) => h[0] > t);
    if (hitIdx < 0) hitIdx = hits.length;
  };

  /** the song alone (the MP3), from where the clock stands — a video playing stops there */
  function play() {
    if (source === 'video') {
      mv?.pause();
      source = 'audio';
      clock.stop();
      if (clock.now() >= duration - 0.05) clock.set(0);
    }
    started = true;
    audio.preload = 'auto';
    if (audioOK) {
      try {
        audio.currentTime = clock.now();
      } catch {
        /* applied once metadata arrives */
      }
      audio.play().catch(() => (audioOK = false));
    }
    clock.start();
    syncHits(clock.now());
    setPlaying();
    punch(songBtn);
    kick();
  }
  function pause() {
    clock.stop();
    audio.pause();
    if (source === 'video') mv?.pause();
    setPlaying();
  }

  /** the music video, from `at` (song time): the player is made on the first press */
  async function startVideo(at: number) {
    if (!video || !screen) return;
    if (source === 'audio' && clock.playing) {
      clock.stop();
      audio.pause();
    }
    source = 'video';
    screen.dataset.on = '';
    setPlaying();
    if (mv) {
      mv.seek(at + offset);
      mv.play();
      return;
    }
    mv = await mountMv(q('[data-video]'), video.youtube, at + offset, onVideo);
  }
  function onVideo(state: number) {
    if (state === YT_PLAYING) {
      // the visitor may have pressed play inside the player itself: it takes over from the MP3
      if (source === 'audio' && clock.playing) audio.pause();
      source = 'video';
      started = true;
      clock.stop();
      clock.set(videoTime());
      clock.start();
      syncHits(clock.now());
      showMini();
    } else if (source === 'video') {
      // paused, buffering, ended: the clock stops where the video is
      clock.stop();
      if (mv?.ready) clock.set(Math.min(videoTime(), duration));
    }
    setPlaying();
    kick();
  }

  const seek = (t: number) => {
    t = Math.max(0, Math.min(duration - 0.05, t));
    clock.set(t);
    if (source === 'video' && mv) {
      mv.seek(t + offset);
      hold = { t, until: performance.now() + 1200 };
    } else {
      try {
        audio.currentTime = t;
      } catch {
        /* not loaded yet — play() applies it */
      }
    }
    syncHits(t);
    update(t, true);
    drawSky(t);
  };
  /** a press on a movement: there, in whatever is playing; nothing yet: the MV for a card, else the song */
  const jump = (t: number, toVideo: boolean) => {
    if (source === 'video') {
      seek(t);
      mv?.play();
    } else if (!started && toVideo && video) {
      seek(t);
      void startVideo(t);
    } else {
      seek(t);
      if (!clock.playing) play();
    }
  };

  songBtn.addEventListener('click', () => (clock.playing && source === 'audio' ? pause() : play()));
  anyBtn.addEventListener('click', () => {
    if (clock.playing) pause();
    else if (source === 'video') mv?.play();
    else play();
  });
  root.querySelector('[data-play-mv]')?.addEventListener('click', () => void startVideo(clock.now() >= duration - 0.05 ? 0 : clock.now()));
  // Loading starts when a visitor reaches for play, not with the page.
  const warm = () => (audio.preload = 'auto');
  songBtn.addEventListener('pointerenter', warm, { once: true });
  songBtn.addEventListener('focus', warm, { once: true });
  audio.addEventListener('ended', () => {
    pause();
    seek(0);
  });

  entries.forEach((e) => e.addEventListener('click', () => jump(+e.dataset.seek!, false)));
  cards.forEach((c) => c.addEventListener('click', () => jump(+c.dataset.seek!, true)));

  // scrubber: pointer + keyboard
  const fromPointer = (e: PointerEvent) => {
    const r = scrub.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * duration;
  };
  scrub.addEventListener('pointerdown', (e) => {
    scrub.setPointerCapture(e.pointerId);
    seek(fromPointer(e));
    const move = (ev: PointerEvent) => seek(fromPointer(ev));
    const up = () => {
      scrub.removeEventListener('pointermove', move);
      scrub.removeEventListener('pointerup', up);
    };
    scrub.addEventListener('pointermove', move);
    scrub.addEventListener('pointerup', up);
  });
  scrub.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 30 : 5;
    if (e.key === 'ArrowRight') seek(clock.now() + step);
    else if (e.key === 'ArrowLeft') seek(clock.now() - step);
    else if (e.key === 'Home') seek(0);
    else if (e.key === 'End') seek(duration - 1);
    else if (e.key === ' ' || e.key === 'Enter') anyBtn.click();
    else return;
    e.preventDefault();
  });

  // mini transport once the player is out of view (or on the keychain view)
  new IntersectionObserver(([en]) => {
    mini.hidden = en.isIntersecting || !started;
  }).observe(hero);
  const showMini = () => {
    if (!listView() || hero.getBoundingClientRect().bottom < 0) mini.hidden = false;
  };
  audio.addEventListener('play', showMini);

  // lock screen / hardware keys
  if ('mediaSession' in navigator) {
    const art = root.dataset.art;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${song.title.ja} — ${song.title.en}`,
      artist: 'Asu Azure',
      album: song.album,
      artwork: art ? [{ src: new URL(art, location.href).href, sizes: '1000x1000', type: 'image/webp' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => (source === 'video' ? mv?.play() : play()));
    navigator.mediaSession.setActionHandler('pause', pause);
    navigator.mediaSession.setActionHandler('seekto', (d) => d.seekTime != null && seek(d.seekTime));
  }


  // --- the scan and the two views -----------------------------------------------
  let scanning = false;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const setView = (v: 'key' | 'list') => {
    root.dataset.state = v;
    delete root.dataset.fresh;
    const lenis = (window as unknown as { __lenis?: { scrollTo(y: number, o: object): void } }).__lenis;
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
    paintSky();
    drawSky(clock.now());
    showMini();
  };

  /** Run a view change as a same-document view transition where there is one. */
  const transition = (kind: 'scan' | 'unscan', change: () => void) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
    if (!doc.startViewTransition || reduced) {
      change();
      return Promise.resolve();
    }
    document.documentElement.dataset.vt = kind;
    // kc-hero is for arriving from the rack; inside the page it would fight ost-art
    kcStage.style.viewTransitionName = 'none';
    return doc
      .startViewTransition(change)
      .finished.catch(() => {})
      .finally(() => {
        delete document.documentElement.dataset.vt;
        kcStage.style.viewTransitionName = '';
      });
  };

  // A soft two-note chime for a good read — only if the visitor has SOUND on.
  const chime = () => {
    try {
      if (localStorage.getItem('pr:sound') !== '1') return;
      const ac = new AudioContext();
      [1318.5, 1975.5].forEach((f, i) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        const t0 = ac.currentTime + i * 0.09;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.08, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
        o.connect(g).connect(ac.destination);
        o.start(t0);
        o.stop(t0 + 0.4);
      });
      setTimeout(() => ac.close(), 800);
    } catch {
      /* no audio: the read is still shown */
    }
  };

  async function scan() {
    if (scanning || listView()) return;
    scanning = true;
    const code = document.querySelector<HTMLElement>('#ost .kc__front [data-kc-wave]');
    const art = document.querySelector<HTMLElement>('#ost .kc__front .kc__art');
    if (code && !reduced) {
      // Hold it still, front out, before reading: measured mid-swing (or showing its back)
      // the viewfinder landed beside the code (Jun, 4 Oct). It then follows the code
      // every frame, so any last sway carries the finder with it.
      await kc.settle();
      let follow = 0;
      const place = () => {
        const r = code.getBoundingClientRect();
        finder.style.setProperty('--fx', `${r.left}px`);
        finder.style.setProperty('--fy', `${r.top}px`);
        finder.style.setProperty('--fw', `${r.width}px`);
        finder.style.setProperty('--fh', `${r.height}px`);
        follow = requestAnimationFrame(place);
      };
      place();
      finder.classList.add('is-on');
      await wait(320);
      finder.classList.add('is-reading');
      code.classList.add('is-scanning');
      await wait(520);
      chime();
      await wait(140);
      cancelAnimationFrame(follow);
    }
    const r = code?.getBoundingClientRect();
    if (r) {
      document.documentElement.style.setProperty('--scan-x', `${r.left + r.width / 2}px`);
      document.documentElement.style.setProperty('--scan-y', `${r.top + r.height / 2}px`);
    }
    // the printed art becomes the playlist's cover in the transition
    if (art) art.style.viewTransitionName = 'ost-art';
    finder.classList.remove('is-on', 'is-reading');
    history.pushState({ ost: 'list' }, '', '?scan=1');
    await transition('scan', () => {
      if (art) art.style.viewTransitionName = '';
      setView('list');
      document.getElementById('ost')!.dataset.fresh = ''; // flash SCANNED
    });
    code?.classList.remove('is-scanning');
    scanning = false;
  }

  const toKey = () =>
    transition('unscan', () => {
      setView('key');
    });

  q('[data-scan]').addEventListener('click', () => void scan());
  q('[data-to-key]').addEventListener('click', () => {
    // we pushed the playlist ourselves: step back, so history stays honest
    if (history.state?.ost === 'list') history.back();
    else {
      history.replaceState(null, '', location.pathname);
      void toKey();
    }
  });
  window.addEventListener('popstate', () => {
    const want = new URLSearchParams(location.search).has('scan') ? 'list' : 'key';
    if (want === root.dataset.state) return;
    void (want === 'list' ? transition('scan', () => setView('list')) : toKey());
  });

  // --- start ----------------------------------------------------------------------
  const from = Number(new URLSearchParams(location.search).get('t'));
  window.addEventListener('resize', sizeSky);
  sizeSky();
  seek(Number.isFinite(from) && from > 0 ? from : 0);
  window.addEventListener('pagehide', () => audio.pause());
}
