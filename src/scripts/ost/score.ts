/**
 * /ost — score model.
 *
 * The timeline JSON (public/ost/perd-pratu.json) is exported from the same
 * Python source that rendered the audio, so every note's start time is the
 * time it sounds in the MP3 (tempo map, ritardando and all). This module turns
 * those raw MIDI numbers into engraved notation: staff, line/space position,
 * accidental against the four-flat key signature, notehead, stem, flags, beams.
 * Everything here is computed once at load; the renderer only reads it.
 */

export type Track = 'rh' | 'lh' | 'chip' | 'arp' | 'str';
export type Staff = 'T' | 'B';

/** raw row from the JSON: [startSec, durSec, midi, durBeats] */
type Raw = [number, number, number, number];

export interface OstData {
  title: string;
  en: string;
  bpm: number;
  duration: number;
  bars: number[];
  /** [startSec, bar, EN, JA] */
  sections: [number, number, string, string][];
  chords: [number, string][];
  /** [[stopStart...], [stopEnd...]] — the chorus stop-time bars */
  stops: [number[], number[]];
  /** [start, end, label] — windows where Beethoven is being quoted */
  quotes: [number, number, string][];
  rh: Raw[];
  lh: Raw[];
  chip: Raw[];
  arp: Raw[];
  str: Raw[];
  drums: { k: number[]; s: number[]; c: number[] };
}

export interface Note {
  track: Track;
  t: number; // start, seconds
  d: number; // duration, seconds
  beats: number;
  midi: number;
  staff: Staff;
  /** diatonic steps above the staff's bottom line (0 = bottom line, 8 = top line) */
  step: number;
  acc: '' | 'b' | 'n' | '#';
  head: 'black' | 'half' | 'whole';
  flags: 0 | 1 | 2;
  /** chord id: notes sharing a stem */
  chord: number;
  stemUp: boolean;
  /** beam group id (−1 = none) */
  beam: number;
  name: string; // e.g. "A♭5"
  /** stagger: second-interval heads are nudged sideways */
  shift: number;
}

export interface Chord {
  id: number;
  track: Track;
  t: number;
  notes: Note[];
  stemUp: boolean;
  flags: 0 | 1 | 2;
  head: Note['head'];
  beam: number;
}

export interface BeamGroup {
  id: number;
  chords: Chord[];
  levels: 1 | 2;
}

export interface Score {
  data: OstData;
  notes: Note[]; // sorted by t
  chords: Chord[];
  beams: BeamGroup[];
  /** start times of RH/chip/str notes, for hit effects (sorted) */
  hits: { t: number; track: Track; midi: number; name: string; note: Note }[];
}

// Four flats: B♭ E♭ A♭ D♭ (F minor / A♭ major). Black keys are always spelled
// flat; D, E, A and B are naturalised against the key signature.
const SPELL: [number, '' | 'b' | 'n'][] = [
  [0, ''], // C
  [1, ''], // D♭ (in key)
  [1, 'n'], // D♮
  [2, ''], // E♭ (in key)
  [2, 'n'], // E♮
  [3, ''], // F
  [4, 'b'], // G♭ (not in key)
  [4, ''], // G
  [5, ''], // A♭ (in key)
  [5, 'n'], // A♮
  [6, ''], // B♭ (in key)
  [6, 'n'], // B♮
];
// alteration of each pitch class as spelled above, and the key's default per letter (C D E F G A B)
const ALT = [0, -1, 0, -1, 0, 0, -1, 0, -1, 0, -1, 0];
const KEY_ALT = [0, -1, -1, 0, 0, -1, -1];
const PRINT: Record<number, string> = { 0: 'C', 1: 'D♭', 2: 'D', 3: 'E♭', 4: 'E', 5: 'F', 6: 'G♭', 7: 'G', 8: 'A♭', 9: 'A', 10: 'B♭', 11: 'B' };

function spell(midi: number) {
  const pc = midi % 12;
  const oct = Math.floor(midi / 12) - 1;
  const [letter, acc] = SPELL[pc];
  return { diat: oct * 7 + letter, acc, name: `${PRINT[pc]}${oct}` };
}
// bottom lines: treble E4, bass G2
const TREBLE_BOTTOM = 4 * 7 + 2; // E4
const BASS_BOTTOM = 2 * 7 + 4; // G2

export function buildScore(data: OstData): Score {
  const notes: Note[] = [];
  const beatSec = 60 / data.bpm;
  const add = (track: Track, rows: Raw[], staffOf: (m: number) => Staff) => {
    for (const [t, d, midi, beats] of rows) {
      const s = spell(midi);
      const staff = staffOf(midi);
      const step = s.diat - (staff === 'T' ? TREBLE_BOTTOM : BASS_BOTTOM);
      const head: Note['head'] = beats >= 3.5 ? 'whole' : beats >= 1.75 ? 'half' : 'black';
      const flags: Note['flags'] = beats < 0.375 ? 2 : beats < 0.75 ? 1 : 0;
      notes.push({
        track, t, d, beats, midi, staff, step,
        acc: s.acc, head, flags, chord: -1, stemUp: true, beam: -1, name: s.name, shift: 0,
      });
    }
  };
  // The piano's hands keep their own staves (bass clef dips to ledger lines
  // rather than hopping staves — it reads like the part a pianist would get).
  add('rh', data.rh, () => 'T');
  add('lh', data.lh, () => 'B');
  add('chip', data.chip, () => 'T');
  add('arp', data.arp, (m) => (m >= 60 ? 'T' : 'B'));
  add('str', data.str, (m) => (m >= 57 ? 'T' : 'B'));
  notes.sort((a, b) => a.t - b.t || a.midi - b.midi);

  // ---- accidentals as a player reads them: an alteration holds to the end of
  // the bar, so D♮ then D in the same bar needs no second sign, and D♭ after
  // D♮ needs its flat back. State is per part (track+staff) and per pitch line.
  const barIdx = (t: number) => {
    let lo = 0, hi = data.bars.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (data.bars[mid] <= t + 1e-4) lo = mid; else hi = mid - 1;
    }
    return lo;
  };
  const state = new Map<string, number>();
  let curBar = -1;
  for (const n of notes) {
    const b = barIdx(n.t);
    if (b !== curBar) { state.clear(); curBar = b; }
    const diat = n.step + (n.staff === 'T' ? TREBLE_BOTTOM : BASS_BOTTOM);
    const key = `${n.track}${n.staff}${diat}`;
    const held = state.get(key) ?? KEY_ALT[diat % 7];
    const alt = ALT[n.midi % 12];
    n.acc = alt === held ? '' : alt < 0 ? 'b' : 'n';
    state.set(key, alt);
  }

  // ---- chords: same track, same onset (within 12 ms) share a stem
  const chords: Chord[] = [];
  const open = new Map<Track, Chord>();
  for (const n of notes) {
    const c = open.get(n.track);
    if (c && Math.abs(c.t - n.t) < 0.012 && c.notes[0].staff === n.staff) {
      c.notes.push(n);
      n.chord = c.id;
    } else {
      const nc: Chord = { id: chords.length, track: n.track, t: n.t, notes: [n], stemUp: true, flags: n.flags, head: n.head, beam: -1 };
      chords.push(nc);
      open.set(n.track, nc);
      n.chord = nc.id;
    }
  }
  for (const c of chords) {
    c.notes.sort((a, b) => a.step - b.step);
    const avg = c.notes.reduce((s, n) => s + n.step, 0) / c.notes.length;
    c.stemUp = avg < 4;
    c.flags = Math.min(...c.notes.map((n) => n.flags)) as Chord['flags'];
    c.head = c.notes[0].head;
    // seconds: nudge the upper (stem-up) or lower (stem-down) head of each pair
    for (let i = 1; i < c.notes.length; i++) {
      if (c.notes[i].step - c.notes[i - 1].step === 1) c.notes[c.stemUp ? i : i - 1].shift = c.stemUp ? 1 : -1;
    }
    for (const n of c.notes) n.stemUp = c.stemUp;
  }

  // ---- beams: consecutive flagged chords of one track inside the same beat
  const beams: BeamGroup[] = [];
  const byTrack = new Map<Track, Chord[]>();
  for (const c of chords) {
    if (c.head !== 'black' || c.track === 'arp') continue;
    const arr = byTrack.get(c.track) ?? [];
    arr.push(c);
    byTrack.set(c.track, arr);
  }
  const beatOf = (t: number) => {
    // bar-relative beat index, robust to the tempo changes: find the bar, then split it in four
    const bars = data.bars;
    let lo = 0, hi = bars.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (bars[mid] <= t + 1e-4) lo = mid; else hi = mid - 1;
    }
    const len = (bars[lo + 1] ?? bars[lo] + 4 * beatSec) - bars[lo];
    return lo * 4 + Math.floor(((t - bars[lo]) / len) * 4 + 1e-3);
  };
  for (const arr of byTrack.values()) {
    let cur: Chord[] = [];
    const flush = () => {
      if (cur.length >= 2) {
        const g: BeamGroup = { id: beams.length, chords: cur, levels: cur.some((c) => c.flags === 2) ? 2 : 1 };
        const avg = cur.flatMap((c) => c.notes).reduce((s, n) => s + n.step, 0) / cur.flatMap((c) => c.notes).length;
        for (const c of cur) {
          c.beam = g.id;
          c.stemUp = avg < 4;
          for (const n of c.notes) { n.beam = g.id; n.stemUp = c.stemUp; }
        }
        beams.push(g);
      }
      cur = [];
    };
    for (const c of arr) {
      if (c.flags === 0) { flush(); continue; }
      const last = cur[cur.length - 1];
      if (last && (beatOf(last.t) !== beatOf(c.t) || c.t - last.t > beatSec * 0.8)) flush();
      cur.push(c);
    }
    flush();
  }

  const hits = notes
    .filter((n) => n.track !== 'arp')
    .map((n) => ({ t: n.t, track: n.track, midi: n.midi, name: n.name, note: n }));
  return { data, notes, chords, beams, hits };
}

/** index of the first element whose key is >= t (binary search) */
export function lowerBound<T>(arr: T[], t: number, key: (x: T) => number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(arr[mid]) < t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

export function barAt(bars: number[], t: number): number {
  return Math.max(1, lowerBound(bars, t + 1e-4, (x) => x));
}
