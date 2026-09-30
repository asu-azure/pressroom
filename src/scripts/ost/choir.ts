/**
 * The rabbit choir (components/ost/Choir.astro) — sung by the song's own data.
 *
 * Every note each voice sings is in starfall.json `choir` ([t0, t1, midi, vowel],
 * imported from the mix's MV build and the vocal folder's syllables), so on the
 * page clock each rabbit:
 *   - opens its mouth on its own notes, in the shape of the vowel sung
 *     (a i u e o, 'n' closed) — a hum where the part has no words;
 *   - lifts its head with pitch, within its own voice's range;
 *   - breathes out a ♪ in its colour at every onset;
 *   - raises its score a bar before its part comes in, sways with the beat
 *     (the mix's accents) and blinks now and then between.
 * They pop up on the first PLAY. starfall.ts calls update() from its frame loop
 * and on every seek. Reduced motion: the mouths still change; nothing sways,
 * blinks or floats.
 */
import song from '../../data/ost/starfall.json';

type Note = [number, number, number, string];
const VOICES = ['S', 'A', 'T', 'B'] as const;
const READY = 1.6; // s — about a bar before the part comes in
const MAX_NOTES = 24;
const NOTE_PATH = 'M9 1v11.4A3.4 3.4 0 1 0 11 15.3V5.2l5.2 1.6V2.7Z';

interface Singer {
  notes: Note[];
  lo: number;
  hi: number;
  i: number; // index of the next note not yet started
  el: HTMLElement;
  all: SVGGElement;
  head: SVGGElement;
  ears: SVGGElement;
  eyes: SVGGElement;
  mouth: SVGGElement;
  book: SVGGElement;
  emit: SVGCircleElement;
  color: string;
  blinkAt: number;
  phase: number;
  shape: string;
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
      el,
      all: g('rb__all'),
      head: g('rb__head'),
      ears: g('rb__ears'),
      eyes: g('rb__eyes'),
      mouth: g('rb__mouth'),
      book: g('rb__book'),
      emit: el.querySelector<SVGCircleElement>('.rb__emit')!,
      color: getComputedStyle(el).getPropertyValue('--c').trim() || '#fff',
      blinkAt: 2 + k * 1.3,
      phase: k * 0.9,
      shape: 'n',
    };
  });

  /** Index of the first note starting after t (binary search). */
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

  let live = 0;
  const breathe = (s: Singer) => {
    if (reduced || live >= MAX_NOTES) return;
    const box = layer.getBoundingClientRect();
    const at = s.emit.getBoundingClientRect();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 18 18');
    svg.innerHTML = `<path d="${NOTE_PATH}" fill="${s.color}"/>`;
    svg.style.left = `${at.left - box.left - 10}px`;
    svg.style.top = `${at.top - box.top - 14}px`;
    svg.style.setProperty('--glow', s.color);
    layer.append(svg);
    live++;
    const dx = (Math.random() - 0.5) * 36;
    const anim = svg.animate(
      [
        { transform: 'translate(0,0) scale(.5) rotate(0deg)', opacity: 0 },
        { transform: `translate(${dx * 0.3}px,-18px) scale(1) rotate(${dx * 0.3}deg)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${dx}px,-70px) scale(.9) rotate(${dx}deg)`, opacity: 0 },
      ],
      { duration: 1400 + Math.random() * 500, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
    anim.onfinish = () => {
      svg.remove();
      live--;
    };
  };

  let lastT = -1;
  let beat = 0;
  let hitIdx = 0;

  const setShape = (s: Singer, shape: string) => {
    if (s.shape === shape) return;
    s.shape = shape;
    s.mouth.dataset.shape = shape;
  };

  function update(t: number, playing: boolean) {
    // a jump (seek, loop) re-finds everyone's place instead of replaying notes
    const jumped = t < lastT || t - lastT > 0.5;
    if (jumped) {
      for (const s of singers) s.i = seekIndex(s.notes, t);
      hitIdx = hits.findIndex((h) => h[0] > t);
      if (hitIdx < 0) hitIdx = hits.length;
    }
    // the beat: the mix's accents, decaying
    while (hitIdx < hits.length && hits[hitIdx][0] <= t) beat = Math.max(beat, hits[hitIdx++][1]);
    beat *= 0.88;
    lastT = t;

    for (const s of singers) {
      // onsets since the last frame
      while (s.i < s.notes.length && s.notes[s.i][0] <= t) {
        if (!jumped && playing) breathe(s);
        s.i++;
      }
      const cur = s.notes[s.i - 1];
      const singing = playing && cur && t < cur[1];
      const next = s.notes[s.i];
      const ready = singing || (next && next[0] - t < READY) || (cur && t - cur[1] < 0.8);

      if (singing) {
        const [t0, t1, midi, vowel] = cur;
        setShape(s, vowel === 'n' ? 'n' : vowel);
        // jaw: quick attack, a little decay, closing at the note's end
        const age = t - t0;
        const env = Math.min(1, age / 0.06) * (0.82 + 0.18 * Math.exp(-age * 4)) * Math.min(1, (t1 - t) / 0.05 + 0.3);
        const p = s.hi > s.lo ? (midi - s.lo) / (s.hi - s.lo) : 0.5;
        s.mouth.style.transform = `scale(${(0.85 + 0.15 * env).toFixed(3)}, ${(0.55 + 0.5 * env).toFixed(3)})`;
        s.mouth.style.transformOrigin = '50px 82px';
        if (!reduced) s.head.style.transform = `translateY(${(-2 - p * 3).toFixed(2)}px) rotate(${((p - 0.5) * -6).toFixed(2)}deg)`;
      } else {
        setShape(s, 'n');
        s.mouth.style.transform = '';
        if (!reduced) s.head.style.transform = '';
      }

      if (reduced) continue;
      s.book.style.transform = ready ? 'translateY(-7px) rotate(-3deg)' : '';
      s.book.style.transition = 'transform .45s cubic-bezier(.22,1,.36,1)';
      // sway with the beat, each rabbit a little out of phase
      const sway = playing ? Math.sin(t * 2.6 + s.phase) * 2.2 + beat * 3 * Math.sin(s.phase + 1) : 0;
      s.all.style.transform = `rotate(${sway.toFixed(2)}deg) translateY(${(-beat * 2).toFixed(2)}px)`;
      s.ears.style.transform = `rotate(${(beat * 6 * Math.cos(s.phase)).toFixed(2)}deg)`;
      // blink
      const blinking = playing && t > s.blinkAt && t < s.blinkAt + 0.12;
      s.eyes.style.transform = blinking ? 'scaleY(0.1)' : '';
      if (t > s.blinkAt + 0.12 || jumped) s.blinkAt = t + 2.5 + Math.random() * 3.5;
    }
  }

  return {
    /** The first PLAY: they pop up. */
    start() {
      root.classList.add('is-on');
    },
    update,
  };
}
