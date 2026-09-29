/**
 * The homepage mini-player: the first half of the chorus of 「扉の向こう」
 * scrolling past a playhead, in sync with the MP3 — the /ost stage cut down to
 * a band. Same renderer (mini layout), same data, same clock.
 *
 * Nothing heavy loads with the page. The score code, the timeline JSON and the
 * notation font arrive when the band comes near the viewport (or a visitor
 * reaches for ▶); the MP3 only when ▶ is pressed. Until then an SVG staff
 * poster stands in, so first paint is complete with zero JS.
 *
 * The song does not follow the visitor to another page (that would need an SPA
 * router). Instead "FULL SCORE →" hands /ost the moment the band stopped at.
 */
import type { StaffRenderer } from './render';
import type { OstData } from './score';
import { ScoreClock } from './clock';
import { punch } from '../mv';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function initNowPlaying(root: HTMLElement) {
  const from = Number(root.dataset.from);
  const to = Number(root.dataset.to);
  const canvas = root.querySelector<HTMLCanvasElement>('[data-np-canvas]')!;
  const audio = root.querySelector<HTMLAudioElement>('[data-np-audio]')!;
  const btn = root.querySelector<HTMLButtonElement>('[data-np-play]')!;
  const label = root.querySelector<HTMLElement>('[data-np-label]')!;
  const timeEl = root.querySelector<HTMLElement>('[data-np-time]')!;
  const full = root.querySelector<HTMLAnchorElement>('[data-np-full]')!;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ck = new ScoreClock(from);
  let r: StaffRenderer | null = null;
  let loading: Promise<void> | null = null;
  let audioOK = true;
  let visible = false;
  let raf = 0;

  audio.addEventListener('error', () => {
    audioOK = false;
  });

  const load = () =>
    (loading ??= (async () => {
      const [{ buildScore }, { StaffRenderer, THEMES }, json] = await Promise.all([
        import('./score'),
        import('./render'),
        import('../../data/ost/perd-pratu.json'),
      ]);
      try {
        await document.fonts.load("40px 'OST Notation'", '');
      } catch {
        /* the renderer still draws; clefs may arrive a moment late */
      }
      r = new StaffRenderer(canvas, buildScore(json.default as unknown as OstData));
      r.mini = true;
      r.reduced = reduced;
      r.theme = THEMES.ink;
      r.resize();
      r.reset(ck.now());
      r.draw(ck.now());
      root.classList.add('is-ready');
    })());

  const setState = (s: 'idle' | 'play' | 'pause' | 'end') => {
    root.dataset.state = s;
    btn.setAttribute('aria-pressed', String(s === 'play'));
    label.textContent = s === 'play' ? 'PAUSE' : s === 'end' ? 'REPLAY' : 'PLAY';
    // UI sounds (sound.ts) duck while the song plays
    document.dispatchEvent(new CustomEvent('pr:music', { detail: s === 'play' }));
  };

  const frame = () => {
    raf = 0;
    if (!ck.playing) return;
    if (audioOK) ck.follow(audio);
    let t = ck.now();
    if (t >= to) {
      t = to;
      ck.stop();
      ck.set(to);
      audio.pause();
      setState('end');
    }
    if (visible && r) r.draw(t);
    timeEl.textContent = fmt(t);
    full.href = `/ost?t=${t.toFixed(1)}`;
    if (ck.playing) raf = requestAnimationFrame(frame);
  };

  async function play() {
    await load();
    if (ck.now() >= to - 0.05) {
      ck.set(from);
      r?.reset(from);
    }
    audio.preload = 'auto';
    if (audioOK) {
      try {
        audio.currentTime = ck.now();
      } catch {
        /* applied once metadata arrives */
      }
      audio.play().catch(() => {
        audioOK = false;
      });
    }
    ck.start();
    setState('play');
    punch(btn);
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function pause() {
    ck.stop();
    audio.pause();
    setState('pause');
  }

  btn.addEventListener('click', () => (ck.playing ? pause() : void play()));
  btn.addEventListener('pointerenter', () => void load(), { once: true });
  btn.addEventListener('focus', () => void load(), { once: true });

  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible) void load();
    },
    { rootMargin: '200px 0px' },
  ).observe(root);

  new ResizeObserver(() => {
    if (!r) return;
    r.resize();
    r.draw(ck.now());
  }).observe(canvas);

  // Leaving the page stops the song rather than letting it run under the next one.
  window.addEventListener('pagehide', () => audio.pause());

  setState('idle');
  timeEl.textContent = fmt(from);
  full.href = `/ost?t=${from.toFixed(1)}`;
}
