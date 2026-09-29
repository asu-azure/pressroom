/**
 * /ost — audio, clock, HUD and scene changes around the StaffRenderer.
 *
 * The clock is the MP3: every frame reads `audio.currentTime` and eases a
 * performance.now()-based estimate toward it, so notes glide between the
 * element's coarse time updates but can never drift from what is heard. If the
 * audio cannot load, the same clock runs on performance.now() alone and the
 * score still plays, silently.
 */
import { gsap } from 'gsap';
import raw from '../../data/ost/perd-pratu.json';
import { buildScore, lowerBound, barAt, type OstData } from './score';
import { StaffRenderer, THEMES, prettyChord } from './render';

type Mode = 'paper' | 'ink' | 'akiba' | 'night';
// Shibuya paper for the song, ink for Beethoven, Akihabara for the 8-bit duet,
// a night stage for the final chorus, and back to paper to go home.
const MODE_BY_SECTION: Mode[] = ['paper', 'paper', 'paper', 'paper', 'paper', 'ink', 'paper', 'paper', 'paper', 'ink', 'akiba', 'night', 'paper'];
const CHORUS = new Set([4, 8, 11]);
const PREROLL = 1.6;

export function initOst() {
  const root = document.getElementById('ost');
  if (!root) return;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

  const data = raw as unknown as OstData;
  const score = buildScore(data);
  const { sections, chords, bars, duration } = data;

  const stage = $('ost-stage');
  const canvas = $<HTMLCanvasElement>('ost-canvas');
  const audio = $<HTMLAudioElement>('ost-audio');
  const gate = $('ost-gate');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const r = new StaffRenderer(canvas, score);
  r.reduced = reduced;
  // Canvas text does not reliably pull a webfont in by itself; ask for them.
  try {
    document.fonts.load("40px 'OST Notation'", '\uE0A4');
    document.fonts.load("900 20px 'OST JP'", 'サビ');
    document.fonts.load("20px 'OST Dot'", '+100');
  } catch { /* the fallbacks still draw */ }

  // ------------------------------------------------------------------ clock
  let base = -PREROLL;
  let perfBase = performance.now();
  let playing = false;
  let preroll = false;
  let started = false;
  let ended = false;
  let audioOK = true;
  let userMuted = false;

  const clock = () => (playing ? base + (performance.now() - perfBase) / 1000 : base);
  const follow = () => {
    if (!audioOK || !playing || preroll || audio.paused) return;
    const est = clock();
    const diff = audio.currentTime - est;
    if (Math.abs(diff) > 0.08) {
      base = audio.currentTime;
      perfBase = performance.now();
    } else base += diff * 0.06;
  };

  audio.addEventListener('error', () => {
    audioOK = false;
    loadLbl.textContent = 'AUDIO OFFLINE — SCORE ONLY';
  });

  function play() {
    if (ended) {
      seek(0);
      hideEnd();
    }
    base = clock();
    perfBase = performance.now();
    playing = true;
    root!.dataset.state = 'play';
    if (audioOK && !preroll) {
      audio.muted = userMuted;
      audio.play().catch(() => { audioOK = false; });
    }
  }
  function pause() {
    base = clock();
    playing = false;
    audio.pause();
    root!.dataset.state = 'pause';
  }
  const toggle = () => (playing ? pause() : play());

  function seek(t: number) {
    t = Math.max(0, Math.min(duration - 0.05, t));
    preroll = false;
    base = t;
    perfBase = performance.now();
    if (audioOK) {
      try { audio.currentTime = t; } catch { /* metadata not in yet */ }
    }
    r.reset(t);
    drumCursor.k = lowerBound(data.drums.k, t, (x) => x);
    drumCursor.s = lowerBound(data.drums.s, t, (x) => x);
    drumCursor.c = lowerBound(data.drums.c, t, (x) => x);
    stopIdx = -1;
    combo = 0;
    if (ended) hideEnd();
    hud(t, false);
    if (!playing) r.draw(t);
  }

  function start(muted: boolean, from = 0) {
    if (started) return;
    started = true;
    userMuted = muted;
    setMuteLbl();
    if (audioOK) {
      // unlock the element inside the gesture; the real start comes after the pre-roll
      audio.muted = true;
      audio.play().then(() => { if (preroll) audio.pause(); audio.muted = userMuted; }).catch(() => { audioOK = false; });
    }
    if (from > 0) {
      preroll = false;
      seek(from);
      play();
    } else {
      preroll = true;
      base = reduced ? -0.3 : -PREROLL;
      perfBase = performance.now();
      playing = true;
      root!.dataset.state = 'play';
    }
    // the jacket lifts away
    if (reduced) gate.hidden = true;
    else
      gsap.timeline({ onComplete: () => { gate.hidden = true; } })
        .to(gate.querySelectorAll('.gate-title__ja .gch'), { yPercent: -110, opacity: 0, stagger: 0.03, duration: 0.35, ease: 'power2.in' }, 0)
        .to(gate, { clipPath: 'inset(0 0 100% 0)', duration: 0.85, ease: 'expo.inOut' }, 0.12);
  }

  // ------------------------------------------------------------------ gate
  const loadLbl = $('gate-load');
  const onProgress = () => {
    if (!audio.duration || !audio.buffered.length) return;
    const p = Math.min(100, Math.round((audio.buffered.end(audio.buffered.length - 1) / audio.duration) * 100));
    loadLbl.textContent = p >= 100 ? 'READY ✓' : `LOADING ${p}%`;
  };
  audio.addEventListener('progress', onProgress);
  audio.addEventListener('canplaythrough', () => { loadLbl.textContent = 'READY ✓'; });
  // The MP3 is 4.7 MB, so the page asks only for its metadata. The full download
  // starts the moment a visitor reaches for a gate button — the 1.6 s pre-roll
  // covers the first buffer, and the progress label shows the rest.
  const warm = () => {
    if (audio.preload === 'auto') return;
    audio.preload = 'auto';
    loadLbl.textContent = 'LOADING 0%';
    try { audio.load(); } catch { /* the play() call below still fetches it */ }
  };
  for (const id of ['gate-play', 'gate-muted']) {
    const b = $(id);
    b.addEventListener('pointerenter', warm);
    b.addEventListener('focus', warm);
    b.addEventListener('pointerdown', warm);
  }
  $('gate-play').addEventListener('click', () => start(false));
  $('gate-muted').addEventListener('click', () => start(true));

  if (!reduced) {
    gsap.timeline({ delay: 0.15 })
      .from(gate.querySelectorAll('.gate-title__ja .gch'), { yPercent: -120, opacity: 0, stagger: 0.07, duration: 0.9, ease: 'expo.out' })
      .from(gate.querySelectorAll('.gate-title__en .gl'), { yPercent: 100, opacity: 0, stagger: 0.08, duration: 0.8, ease: 'expo.out' }, 0.2)
      .from(gate.querySelectorAll('.gate-code__bars i'), { scaleY: 0, stagger: { each: 0.004, from: 'start' }, duration: 0.5, ease: 'power3.out' }, 0.3)
      .from(gate.querySelectorAll('.gate-spec > div'), { x: 24, opacity: 0, stagger: 0.05, duration: 0.6, ease: 'expo.out' }, 0.4)
      .from('.gate-obi', { yPercent: -100, duration: 0.9, ease: 'expo.out' }, 0)
      .from('.gate-sticker', { scale: 0, rotate: -90, duration: 0.7, ease: 'back.out(2.2)' }, 0.9)
      .from('.gate-play', { scale: 0.4, opacity: 0, duration: 0.8, ease: 'back.out(1.8)' }, 0.6);
  }

  // ------------------------------------------------------------------ HUD refs
  const secN = $('ost-sec-n');
  const secJa = $('ost-sec-ja');
  const secEn = $('ost-sec-en');
  const mega = $('ost-mega');
  const chordNow = $('ost-chord');
  const chordNext = $('ost-chord-next');
  const timeEl = $('ost-time');
  const barEl = $('ost-bar');
  const beatEls = Array.from($('ost-beats').children) as HTMLElement[];
  const vuEls = Array.from($('ost-vu').children) as HTMLElement[];
  const chapterLis = Array.from($('ost-chapters').children) as HTMLElement[];
  const chapterFills = chapterLis.map((li) => li.querySelector<HTMLElement>('.ost-chapters__fill')!);
  const flower = $('ost-flower');
  const ma = $('ost-ma');
  const wipe = $('ost-wipe');
  const banner = $('ost-banner');
  const endCard = $('ost-end');
  const muteBtn = $('ost-mute');
  const scoreEl = $('ost-score');
  const comboEl = $('ost-combo');
  const hp1 = $('ost-hp1');
  const hp2 = $('ost-hp2');

  let secIdx = -1;
  let chordIdx = -2;
  let barShown = -1;
  let beatShown = -1;
  let mode: Mode = 'paper';
  let stopIdx = -1;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const fmt = (s: number) => {
    s = Math.max(0, s);
    return `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}.${Math.floor((s % 1) * 10)}`;
  };

  const flowerSpin = reduced ? null : gsap.to(flower, { rotate: '+=360', duration: 40, ease: 'none', repeat: -1, paused: true });

  function setJa(text: string, animate: boolean) {
    secJa.innerHTML = '';
    const chars = [...text].map((c) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = c;
      secJa.appendChild(s);
      return s;
    });
    if (animate && !reduced) gsap.from(chars, { yPercent: 110, stagger: 0.045, duration: 0.7, ease: 'expo.out' });
  }

  function showBanner(main: string, sub: string, dot = false) {
    if (reduced) return;
    banner.className = `ost-banner${dot ? ' is-dot' : ''}`;
    banner.innerHTML = `${main}<small>${sub}</small>`;
    gsap.timeline()
      .fromTo(banner, { opacity: 0, scale: 1.35, filter: 'blur(8px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.35, ease: 'expo.out' })
      .to(banner, { opacity: 0, scale: 0.94, duration: 0.4, ease: 'power2.in' }, 0.85);
  }

  function setMode(next: Mode, animate: boolean) {
    if (next === mode) return;
    const prev = mode;
    mode = next;
    const apply = () => {
      root!.dataset.mode = next;
      r.theme = THEMES[next];
    };
    if (!animate || reduced) return apply();
    if (next === 'akiba' || prev === 'akiba') {
      apply();
      r.glitch = 1;
      gsap.to(r, { glitch: 0, duration: 0.9, ease: 'power2.out' });
      stage.classList.add('is-glitch');
      setTimeout(() => stage.classList.remove('is-glitch'), 480);
    } else {
      gsap.fromTo(wipe, { x: 0, xPercent: -250, visibility: 'visible' }, { xPercent: 330, duration: 0.6, ease: 'power3.inOut', onComplete: () => { wipe.style.visibility = 'hidden'; } });
      gsap.delayedCall(0.18, apply);
    }
  }

  function onSection(i: number, animate: boolean) {
    secIdx = i;
    const [, , en, ja] = sections[i];
    secN.textContent = `${pad(i + 1)} / ${sections.length}`;
    secEn.textContent = en;
    setJa(ja, animate);
    mega.textContent = ja;
    if (animate && !reduced) gsap.fromTo(mega, { xPercent: 10, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 1.4, ease: 'expo.out' });
    chapterLis.forEach((li, k) => {
      li.classList.toggle('is-now', k === i);
      if (k !== i) chapterFills[k].style.transform = `scaleX(${k < i ? 1 : 0})`;
    });
    setMode(MODE_BY_SECTION[i], animate);
    const bloom = CHORUS.has(i);
    gsap.to(flower, { opacity: bloom ? (mode === 'paper' ? 0.5 : 0.7) : 0, scale: bloom ? 1 : 0.6, duration: animate ? 1.2 : 0.01, ease: 'expo.out' });
    if (bloom) flowerSpin?.play(); else flowerSpin?.pause();
    if (animate) {
      if (i === 10) showBanner('STAGE 11', 'PIANO VS 8BIT — START!', true);
      if (i === 11) showBanner('大サビ', 'FINAL CHORUS');
      if (i === 9) showBanner('熱情', 'BEETHOVEN — APPASSIONATA');
    }
  }

  function hud(t: number, animate: boolean) {
    // section
    let s = 0;
    for (let k = 0; k < sections.length; k++) if (sections[k][0] <= t + 1e-3) s = k;
    if (s !== secIdx) onSection(s, animate);
    const s0 = sections[s][0];
    const s1 = sections[s + 1]?.[0] ?? duration;
    chapterFills[s].style.transform = `scaleX(${Math.max(0, Math.min(1, (t - s0) / (s1 - s0))).toFixed(4)})`;

    // chord
    const c = lowerBound(chords, t + 1e-3, (x) => x[0]) - 1;
    if (c !== chordIdx) {
      chordIdx = c;
      chordNow.textContent = c >= 0 ? prettyChord(chords[c][1]) : '—';
      chordNext.textContent = chords[c + 1] ? prettyChord(chords[c + 1][1]) : '—';
      if (animate && !reduced && c >= 0) gsap.fromTo(chordNow, { y: -8, opacity: 0.2 }, { y: 0, opacity: 1, duration: 0.35, ease: 'expo.out' });
    }

    // time, bar, beat
    timeEl.textContent = fmt(t);
    const b = barAt(bars, t);
    if (b !== barShown) {
      barShown = b;
      barEl.textContent = pad(Math.min(bars.length - 1, b), 3);
    }
    const b0 = bars[b - 1] ?? 0;
    const bl = (bars[b] ?? b0 + 1.905) - b0;
    const beat = t < 0 ? -1 : Math.min(3, Math.floor(((t - b0) / bl) * 4));
    if (beat !== beatShown) {
      beatShown = beat;
      beatEls.forEach((el, k) => el.classList.toggle('on', k === beat));
    }

    // stop-time: 間 (ma), the held breath
    const [ss, se] = data.stops;
    let inStop = -1;
    for (let k = 0; k < ss.length; k++) if (t >= ss[k] && t < se[k]) inStop = k;
    if (inStop !== stopIdx) {
      stopIdx = inStop;
      if (inStop >= 0 && animate && !reduced) {
        gsap.fromTo(ma, { opacity: 0, scale: 1.25 }, { opacity: mode === 'paper' ? 0.1 : 0.16, scale: 1, duration: 0.3, ease: 'expo.out' });
        r.shock();
      } else gsap.to(ma, { opacity: 0, duration: 0.5 });
    }
  }

  // ------------------------------------------------------------------ energy
  const bands = new Float32Array(vuEls.length);
  const bump = (k: number, v: number) => { if (k >= 0 && k < bands.length) bands[k] = Math.min(1.4, bands[k] + v); };
  let power1 = 0;
  let power2 = 0;
  let pts = 0;
  let combo = 0;
  let lastHitT = -9;
  r.onHit = (h) => {
    bump(Math.floor((h.midi - 28) / 4.2), 0.32);
    if (h.track === 'chip' || h.track === 'arp') power2 += 1; else power1 += 1;
    if (mode === 'akiba' && h.track !== 'lh') {
      const t = clock();
      combo = t - lastHitT < 0.6 ? combo + 1 : 1;
      lastHitT = t;
      pts += 100 + Math.min(combo, 50) * 10;
    }
  };
  const drumCursor = { k: 0, s: 0, c: 0 };
  function drums(t: number) {
    const d = data.drums;
    let kick = false, snare = false, crash = false;
    while (drumCursor.k < d.k.length && d.k[drumCursor.k] <= t) { drumCursor.k++; kick = true; }
    while (drumCursor.s < d.s.length && d.s[drumCursor.s] <= t) { drumCursor.s++; snare = true; }
    while (drumCursor.c < d.c.length && d.c[drumCursor.c] <= t) { drumCursor.c++; crash = true; }
    if (kick) {
      r.pulse = 1;
      bump(0, 1); bump(1, 0.8);
      if (!reduced && CHORUS.has(secIdx)) gsap.fromTo(flower, { scale: 1.06 }, { scale: 1, duration: 0.35, ease: 'power2.out', overwrite: 'auto' });
    }
    if (snare) { bump(7, 0.8); bump(8, 0.6); }
    if (crash) {
      r.shock();
      bump(14, 1); bump(15, 1); bump(13, 0.7);
      if (!reduced) gsap.fromTo(mega, { scale: 1.04 }, { scale: 1, duration: 0.5, ease: 'expo.out' });
    }
  }

  let lastFrame = performance.now();
  let akibaTick = 0;
  function meters(now: number) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const k = Math.pow(0.9, dt * 60);
    for (let i = 0; i < bands.length; i++) {
      bands[i] *= k;
      vuEls[i].style.transform = `scaleY(${(0.08 + Math.min(1, bands[i]) * 0.92).toFixed(3)})`;
    }
    power1 *= Math.pow(0.97, dt * 60);
    power2 *= Math.pow(0.97, dt * 60);
    if (mode === 'akiba' && now - akibaTick > 90) {
      akibaTick = now;
      const tot = power1 + power2 + 1;
      hp1.style.width = `${Math.round(20 + (power1 / tot) * 80)}%`;
      hp2.style.width = `${Math.round(20 + (power2 / tot) * 80)}%`;
      scoreEl.textContent = pad(pts, 7);
      comboEl.textContent = `×${combo}`;
    }
  }

  // ------------------------------------------------------------------ end
  function showEnd() {
    ended = true;
    playing = false;
    base = duration;
    root!.dataset.state = 'end';
    endCard.hidden = false;
    if (!reduced) {
      gsap.fromTo(endCard, { clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)', duration: 0.9, ease: 'expo.inOut' });
      gsap.from(endCard.children, { y: 30, opacity: 0, stagger: 0.1, duration: 0.8, delay: 0.4, ease: 'expo.out' });
    }
  }
  function hideEnd() {
    ended = false;
    endCard.hidden = true;
  }
  audio.addEventListener('ended', () => { if (playing) showEnd(); });
  $('ost-replay').addEventListener('click', () => {
    hideEnd();
    seek(0);
    play();
  });

  // ------------------------------------------------------------------ controls
  function setMuteLbl() {
    muteBtn.setAttribute('aria-pressed', String(userMuted));
    muteBtn.innerHTML = `SOUND <b>${userMuted ? 'OFF' : 'ON'}</b>`;
  }
  function toggleMute() {
    userMuted = !userMuted;
    audio.muted = userMuted;
    setMuteLbl();
  }
  $('ost-play').addEventListener('click', toggle);
  muteBtn.addEventListener('click', toggleMute);

  document.querySelectorAll<HTMLElement>('[data-seek]').forEach((el) => {
    el.addEventListener('click', () => {
      const t = parseFloat(el.dataset.seek ?? '0');
      if (el.hasAttribute('data-top')) {
        const lenis = (window as unknown as { __lenis?: { scrollTo: (y: number, o?: object) => void } }).__lenis;
        if (lenis) lenis.scrollTo(0, { duration: 1.2 });
        else window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
      }
      if (!started) return start(false, t);
      seek(t);
      if (!playing) play();
    });
  });

  window.addEventListener('keydown', (e) => {
    if (!started) return;
    const tag = (e.target as HTMLElement | null)?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space') {
      if (tag === 'BUTTON' || tag === 'A') return;
      e.preventDefault();
      toggle();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      seek(clock() + 5);
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      seek(clock() - 5);
    } else if (e.code === 'KeyM') toggleMute();
  });

  // ------------------------------------------------------------------ loop
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(stage);
  const ro = new ResizeObserver(() => {
    r.resize();
    r.draw(clock());
  });
  ro.observe(canvas);
  r.resize();
  hud(0, false);
  r.reset(-PREROLL);

  gsap.ticker.add(() => {
    const now = performance.now();
    if (!started) return;
    let t = clock();
    if (preroll && t >= 0) {
      preroll = false;
      base = 0;
      perfBase = now;
      t = 0;
      if (audioOK) {
        try { audio.currentTime = 0; } catch { /* not seekable yet */ }
        audio.muted = userMuted;
        audio.play().catch(() => { audioOK = false; });
      }
    }
    follow();
    t = clock();
    if (playing && t >= duration) {
      showEnd();
      t = duration;
    }
    if (playing) drums(t);
    if (visible) {
      r.draw(t);
      hud(t, playing);
    }
    meters(now);
  });
}
