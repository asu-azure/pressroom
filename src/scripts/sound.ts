/**
 * UI sounds — notes of the theme song, synthesised with Web Audio.
 *
 * No sample files: each note is a triangle wave plus a quiet sine an octave up,
 * through one gentle lowpass, with a 4 ms attack and a short exponential decay
 * (a soft, piano-ish pluck). The notes are the top line of the motif of
 * 「ナガレボシ — STARFALL」 (the G–A♭–G cell), so sweeping the pointer across the
 * shelf plays the hook.
 *
 * OFF by default, remembered in localStorage. The AudioContext is created only
 * inside a user gesture (browsers keep it suspended otherwise), UI sounds are
 * silent in a hidden tab, and they duck while real music plays (`pr:music`).
 * Where supported, the audio session is "ambient", so iOS respects the silent
 * switch and the visitor's own music is not interrupted.
 */

import { MUSIC } from '../lib/features';

/** Motif top line: the first two phrases of IV. Motif in starfall.json (motif.test.ts keeps it honest). */
export const MOTIF = [79, 79, 79, 79, 80, 79, 72, 75, 74, 70, 79, 79, 79, 79, 80, 79, 72, 75, 74, 71];
/** The hook's harmony: A♭maj7 when a book opens, Cm(add9) — where the hook lands — when a lock opens. */
export const CHORDS = { open: [56, 60, 63, 67], unlock: [60, 63, 67, 74] } as const;

const KEY = 'pr:sound';
const MAX_VOICES = 6;

let ctx: AudioContext | null = null;
let out: AudioNode | null = null;
// Read at module load, so an island asking sfx.enabled() gets the stored
// choice no matter whether it or Base.astro's script ran first.
let on = (() => {
  if (!MUSIC) return false;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();
let ducked = false;
let voices = 0;
let idx = 0;
let lastNote = 0;
let idleTimer = 0;
let noise: AudioBuffer | null = null;

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

function ensure(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'ambient';
    } catch {
      /* not supported */
    }
    ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.12;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.Q.value = 0.7;
    lp.connect(master);
    master.connect(ctx.destination);
    out = lp;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

const live = () => on && !ducked && !document.hidden && ctx !== null && ctx.state === 'running';

function voice(midi: number, at = 0, gain = 0.9, decay = 0.5) {
  if (!ctx || !out || voices >= MAX_VOICES) return;
  const t = ctx.currentTime + at;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  env.connect(out);

  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.value = hz(midi);
  body.connect(env);

  const air = ctx.createOscillator();
  air.type = 'sine';
  air.frequency.value = hz(midi) * 2;
  air.detune.value = 4;
  const airGain = ctx.createGain();
  airGain.gain.value = 0.25;
  air.connect(airGain).connect(env);

  voices++;
  body.onended = () => {
    voices--;
    env.disconnect();
  };
  for (const o of [body, air]) {
    o.start(t);
    o.stop(t + decay + 0.05);
  }
}

export const sfx = {
  enabled: () => on,

  set(next: boolean) {
    on = next;
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    if (next && ensure()) {
      // confirm with the first four notes of the hook
      MOTIF.slice(0, 4).forEach((m, i) => voice(m, i * 0.11, 0.7, 0.4));
      idx = 4;
    }
    document.dispatchEvent(new CustomEvent('pr:sound', { detail: next }));
  },

  /** The next note of the hook. Resets to the start after 2.5 s of quiet. */
  note() {
    if (!live()) return;
    const now = performance.now();
    if (now - lastNote < 60) return;
    lastNote = now;
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => (idx = 0), 2500);
    voice(MOTIF[idx % MOTIF.length], 0, 0.8, 0.45);
    idx++;
  },

  /** One soft note, for plain taps. */
  tap() {
    if (live()) voice(MOTIF[0] - 12, 0, 0.5, 0.3);
  },

  /** A strummed chord (20 ms apart), low to high. */
  chord(name: keyof typeof CHORDS) {
    if (!live()) return;
    CHORDS[name].forEach((m, i) => voice(m, i * 0.02, 0.55, 0.9));
  },

  /** A paper tick for a page turn: 30 ms of noise through a bandpass. */
  tick() {
    if (!live() || !ctx || !out) return;
    if (!noise) {
      noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.03), ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    }
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3000;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = 1.6;
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start();
  },

  /** The ここすき heart: a quick rising sparkle. */
  sparkle() {
    if (!live()) return;
    [72, 75, 77, 80].forEach((m, i) => voice(m + 12, i * 0.045, 0.5, 0.35));
  },
};

/**
 * Page wiring, once, from Base.astro. Islands only add attributes:
 *   [data-sfx~="note"]  pointer hover → next note of the hook (mouse only)
 *   [data-sfx~="open"]  press → the D♭maj7 chord
 *   [data-sfx~="tap"]   click → one soft note
 * (space-separated, so a card can be data-sfx="note open")
 * and the header's [data-sound-toggle] switches it all on and off.
 */
export function initSound(opts: { onNote?: (x: number, y: number) => void } = {}) {
  // Remembered as on: the context still needs a gesture before it may run.
  if (on) {
    const wake = () => ensure();
    window.addEventListener('pointerdown', wake, { once: true, capture: true });
    window.addEventListener('keydown', wake, { once: true, capture: true });
  }

  const paint = () => {
    document.querySelectorAll<HTMLElement>('[data-sound-toggle]').forEach((b) => {
      b.hidden = false;
      b.setAttribute('aria-pressed', String(on));
      const label = b.querySelector<HTMLElement>('[data-sound-label]');
      if (label) label.textContent = on ? 'SOUND ON' : 'SOUND OFF';
      b.setAttribute('aria-label', on ? 'Sound on — turn off' : 'Sound off — turn on');
    });
  };
  paint();
  document.addEventListener('pr:sound', paint);
  document.addEventListener('click', (e) => {
    if ((e.target as Element | null)?.closest?.('[data-sound-toggle]')) sfx.set(!on);
  });

  document.addEventListener('pr:music', (e) => {
    ducked = Boolean((e as CustomEvent<boolean>).detail);
  });

  let lastOver: Element | null = null;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as Element | null)?.closest?.('[data-sfx~="note"]') ?? null;
    if (el && el !== lastOver && live()) {
      sfx.note();
      opts.onNote?.(e.clientX, e.clientY);
    }
    lastOver = el;
  });
  document.addEventListener('pointerdown', (e) => {
    if ((e.target as Element | null)?.closest?.('[data-sfx~="open"]')) sfx.chord('open');
  });
  document.addEventListener('click', (e) => {
    if ((e.target as Element | null)?.closest?.('[data-sfx~="tap"]')) sfx.tap();
  });
}
