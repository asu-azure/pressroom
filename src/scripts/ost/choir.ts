/**
 * The rabbit choir (components/ost/Choir.astro) — sung by the song's own data.
 *
 * Every note each voice sings is in starfall.json `choir`
 * ([t0, t1, midi, vowel, kana] — kana only where a syllable starts, '~' for a
 * hum), imported from the mix's MV build and the vocal folder's syllables. On
 * the page clock each rabbit:
 *   - opens its mouth on its own notes in the shape of the vowel (a i u e o,
 *     closed 'n'), staying open through the tiny gaps between syllables;
 *   - shows what it is singing: a speech bubble with the syllable (ほ, し, お …)
 *     that pops on each new one, and the syllable itself floating up in its
 *     colour — so you can read who sings what;
 *   - lifts its head with pitch, within its own voice's range;
 *   - raises its score about a bar before its part, sways with the beat and
 *     blinks now and then.
 * Everything moves through smoothed values (per real frame time), never by
 * setting a pose outright — that is what made the first version judder.
 * starfall.ts calls update() from its frame loop and on every seek. Reduced
 * motion: mouths and bubbles still change; nothing sways, lifts or floats.
 */
import song from '../../data/ost/starfall.json';

type Note = [number, number, number, string, string];
const VOICES = ['S', 'A', 'T', 'B'] as const;
const READY = 1.6; // s — about a bar before the part comes in
const HOLD = 0.14; // s — a gap shorter than this keeps the mouth open
const MAX_FLOAT = 20;
const MOUTH = 1.4; // the mouths are drawn small; sing a bit bigger

interface Singer {
  notes: Note[];
  lo: number;
  hi: number;
  i: number;
  all: SVGGElement;
  head: SVGGElement;
  ears: SVGGElement;
  eyes: SVGGElement;
  mouth: SVGGElement;
  book: SVGGElement;
  emit: SVGCircleElement;
  say: HTMLElement;
  color: string;
  blinkAt: number;
  phase: number;
  shape: string;
  // smoothed pose
  jaw: number;
  lift: number;
  raise: number;
  sway: number;
  bubble: number;
  lastSung: number;
}

export function initChoir(root: HTMLElement | null) {
  const noop = { start() {}, update(_t: number, _playing: boolean) {} };
  if (!root) return noop;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layer = root.querySelector<HTMLElement>('[data-choir-notes]')!;
  const choir = song.choir as unknown as Record<(typeof VOICES)[number], Note[]>;
  const hits = song.hits as [number, number][];

  const singers: Singer[] = VOICES.map((v, k) => {
    const el = root.querySelector<HTMLElement>(`[data-voice="${v}"]`)!;
    const notes = choir[v];
    const pitches = notes.map((n) => n[2]);
    const g = (c: string) => el.querySelector<SVGGElement>(`.${c}`)!;
    return {
      notes,
      lo: Math.min(...pitches),
      hi: Math.max(...pitches),
      i: 0,
      all: g('rb__all'),
      head: g('rb__head'),
      ears: g('rb__ears'),
      eyes: g('rb__eyes'),
      mouth: g('rb__mouth'),
      book: g('rb__book'),
      emit: el.querySelector<SVGCircleElement>('.rb__emit')!,
      say: el.querySelector<HTMLElement>('[data-say]')!,
      color: getComputedStyle(el).getPropertyValue('--c').trim() || '#fff',
      blinkAt: 2 + k * 1.3,
      phase: k * 0.9,
      shape: 'n',
      jaw: 0,
      lift: 0,
      raise: 0,
      sway: 0,
      bubble: 0,
      lastSung: -9,
    };
  });

  const seekIndex = (notes: Note[], t: number) => {
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid][0] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  // --- what they sing, floating up ---------------------------------------------------
  let live = 0;
  const float = (s: Singer, text: string) => {
    if (reduced || live >= MAX_FLOAT) return;
    const box = layer.getBoundingClientRect();
    const at = s.emit.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'choir__float';
    el.textContent = text;
    el.style.color = s.color;
    el.style.left = `${at.left - box.left}px`;
    el.style.top = `${at.top - box.top}px`;
    layer.append(el);
    live++;
    const dx = (Math.random() - 0.5) * 40;
    const a = el.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
        { transform: `translate(calc(-50% + ${dx * 0.25}px), calc(-50% - 22px)) scale(1.1)`, opacity: 1, offset: 0.18 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% - 90px)) scale(.9) rotate(${dx * 0.4}deg)`, opacity: 0 },
      ],
      { duration: 1700 + Math.random() * 500, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
    a.onfinish = () => {
      el.remove();
      live--;
    };
  };

  const say = (s: Singer, text: string) => {
    s.say.textContent = text;
    if (!reduced) s.say.animate([{ scale: 0.55 }, { scale: 1.15, offset: 0.55 }, { scale: 1 }], { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  };

  // --- per frame --------------------------------------------------------------------------
  let lastT = -1;
  let lastNow = performance.now();
  let beat = 0;
  let beatS = 0;
  let hitIdx = 0;
  const ease = (x: number, target: number, rate: number, dt: number) => x + (target - x) * (1 - Math.exp(-rate * dt));

  function update(t: number, playing: boolean) {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    const jumped = t < lastT || t - lastT > 0.5;
    if (jumped) {
      for (const s of singers) s.i = seekIndex(s.notes, t);
      hitIdx = hits.findIndex((h) => h[0] > t);
      if (hitIdx < 0) hitIdx = hits.length;
    }
    while (hitIdx < hits.length && hits[hitIdx][0] <= t) beat = Math.max(beat, hits[hitIdx++][1]);
    beat *= Math.exp(-dt * 7);
    beatS = ease(beatS, beat, 14, dt);
    lastT = t;

    for (const s of singers) {
      // syllables that started since the last frame
      while (s.i < s.notes.length && s.notes[s.i][0] <= t) {
        const kana = s.notes[s.i][4];
        if (!jumped && playing) {
          if (kana && kana !== '~') {
            say(s, kana);
            float(s, kana);
          } else if (kana === '~' && s.say.textContent !== '♪') say(s, '♪'); // a hum
        }
        s.i++;
      }
      const cur = s.notes[s.i - 1];
      const next = s.notes[s.i];
      const inNote = playing && cur && t < cur[1];
      // a breath-sized gap between syllables keeps the mouth open
      const bridging = playing && cur && !inNote && next && next[0] - cur[1] < HOLD && t < next[0];
      const singing = inNote || bridging;
      if (singing) s.lastSung = t;
      const ready = singing || (next && next[0] - t < READY) || (cur && t - cur[1] < 0.8);

      // mouth: the vowel's shape, the jaw eased open and shut
      if (singing && cur) {
        if (cur[3] !== s.shape) {
          s.shape = cur[3];
          s.mouth.dataset.shape = cur[3];
        }
        const age = t - cur[0];
        const target = inNote ? 0.75 + 0.25 * Math.exp(-age * 5) : 0.55;
        s.jaw = reduced ? target : ease(s.jaw, target, 28, dt);
      } else {
        s.jaw = reduced ? 0 : ease(s.jaw, 0, 18, dt);
        if (s.jaw < 0.12 && s.shape !== 'n') {
          s.shape = 'n';
          s.mouth.dataset.shape = 'n';
        }
      }
      const open = s.shape === 'n' ? 1 : 0.55 + 0.6 * s.jaw;
      s.mouth.style.transform = `scale(${(MOUTH * (s.shape === 'n' ? 1 : 0.9 + 0.1 * s.jaw)).toFixed(3)}, ${(MOUTH * open).toFixed(3)})`;

      // the speech bubble: shown while singing, fading just after
      const showBubble = playing && t - s.lastSung < 0.35;
      // arrived mid-note (a seek): say what is being sung without a pop
      if (showBubble && !s.say.textContent && cur) s.say.textContent = cur[4] && cur[4] !== '~' ? cur[4] : '♪';
      s.bubble = reduced ? (showBubble ? 1 : 0) : ease(s.bubble, showBubble ? 1 : 0, 12, dt);
      s.say.style.opacity = s.bubble.toFixed(3);
      s.say.style.translate = `-50% ${((1 - s.bubble) * 6).toFixed(2)}px`;

      if (reduced) continue;
      const p = s.hi > s.lo && cur ? (cur[2] - s.lo) / (s.hi - s.lo) : 0.5;
      s.lift = ease(s.lift, singing ? 0.4 + p * 0.6 : 0, 8, dt);
      s.head.style.transform = `translateY(${(-s.lift * 4).toFixed(2)}px) rotate(${((0.5 - p) * 5 * s.lift).toFixed(2)}deg)`;
      s.raise = ease(s.raise, ready && playing ? 1 : 0, 7, dt);
      s.book.style.transform = `translateY(${(-7 * s.raise).toFixed(2)}px) rotate(${(-3 * s.raise).toFixed(2)}deg)`;
      const swayTarget = playing ? Math.sin(t * 2.4 + s.phase) * 2 + beatS * 2.2 * Math.sin(s.phase + 1) : 0;
      s.sway = ease(s.sway, swayTarget, 10, dt);
      s.all.style.transform = `rotate(${s.sway.toFixed(2)}deg) translateY(${(-beatS * 1.6).toFixed(2)}px)`;
      s.ears.style.transform = `rotate(${(beatS * 5 * Math.cos(s.phase)).toFixed(2)}deg)`;
      const blinking = playing && t > s.blinkAt && t < s.blinkAt + 0.12;
      s.eyes.style.transform = blinking ? 'scaleY(0.1)' : '';
      if (t > s.blinkAt + 0.12 || jumped) s.blinkAt = t + 2.5 + Math.random() * 3.5;
    }
  }

  return {
    start() {
      root.classList.add('is-on');
    },
    update,
  };
}
