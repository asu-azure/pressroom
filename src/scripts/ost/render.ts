/**
 * /ost — the scrolling grand staff.
 *
 * One canvas, redrawn every frame from `now` (seconds into the MP3). Music
 * scrolls right-to-left past a fixed playhead; a note's head is centred on its
 * onset, so the instant it touches the line is the instant it sounds.
 *
 * Everything is engraved with Bravura (SMuFL) glyphs at font-size = 4 staff
 * spaces, so every metric below is in staff spaces (`sp`) straight from the
 * font's metadata. The renderer never allocates per note per frame beyond what
 * the canvas API does; the only growing structure is the short-lived FX list.
 */
import type { Score, Chord, Note, Track } from './score';
import { lowerBound } from './score';

export interface Theme {
  name: string;
  staff: string;
  bar: string;
  text: string;
  dim: string;
  rh: string;
  lh: string;
  chip: string;
  arp: string;
  str: string;
  hot: string;
  accent: string;
  /** square "pixel" noteheads + RGB split (Akihabara) */
  pixel: boolean;
}

export const THEMES: Record<string, Theme> = {
  paper: {
    name: 'paper', staff: 'rgba(13,13,14,.62)', bar: 'rgba(13,13,14,.32)', text: '#0d0d0e', dim: 'rgba(13,13,14,.46)',
    rh: '#0d0d0e', lh: '#34343a', chip: '#e0287f', arp: 'rgba(224,40,127,.55)', str: '#2742f0',
    hot: '#e8a31a', accent: '#2742f0', pixel: false,
  },
  ink: {
    name: 'ink', staff: 'rgba(244,241,234,.42)', bar: 'rgba(244,241,234,.2)', text: '#f4f1ea', dim: 'rgba(244,241,234,.45)',
    rh: '#f4f1ea', lh: '#bdb8ad', chip: '#ff5fb4', arp: 'rgba(255,95,180,.55)', str: '#8a98ff',
    hot: '#e8a31a', accent: '#5a72ff', pixel: false,
  },
  akiba: {
    name: 'akiba', staff: 'rgba(60,242,255,.5)', bar: 'rgba(60,242,255,.22)', text: '#e9fdff', dim: 'rgba(60,242,255,.55)',
    rh: '#3cf2ff', lh: '#2bb3c4', chip: '#ff3fa4', arp: 'rgba(255,63,164,.7)', str: '#3cf2ff',
    hot: '#f7ff3c', accent: '#ff3fa4', pixel: true,
  },
  night: {
    name: 'night', staff: 'rgba(255,255,255,.5)', bar: 'rgba(255,255,255,.2)', text: '#ffffff', dim: 'rgba(255,255,255,.5)',
    rh: '#ffffff', lh: '#c3c8de', chip: '#ff5fb4', arp: 'rgba(255,95,180,.55)', str: '#8a98ff',
    hot: '#ffb629', accent: '#ffb629', pixel: false,
  },
};

// SMuFL codepoints
const G = {
  black: '', half: '', whole: '',
  gClef: '', fClef: '', brace: '', ts4: '',
  b: '', n: '', '#': '',
  f8u: '', f8d: '', f16u: '', f16d: '',
} as const;
// Bravura metadata (staff spaces)
const HEAD_W = 1.18;
const WHOLE_W = 1.688;
const STEM_Y = 0.168;
const STEM_LEN = 3.5;
const ACC_W: Record<string, number> = { b: 0.904, n: 0.672, '#': 0.996 };

type Fx = { t0: number; x: number; y: number; kind: 'ring' | 'label' | 'pix' | 'shock'; color: string; text?: string; seed: number };

const TRACK_KEY: Record<Track, keyof Theme> = { rh: 'rh', lh: 'lh', chip: 'chip', arp: 'arp', str: 'str' };

export class StaffRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private score: Score;
  private w = 0;
  private h = 0;
  private dpr = 1;
  // layout
  sp = 10;
  pps = 240;
  playX = 300;
  private tTop = 0;
  private bTop = 0;
  private clefW = 0;
  private compact = false;
  // state
  theme: Theme = THEMES.paper;
  /** 0..1 staff-line swell on kick */
  pulse = 0;
  /** 0..1 slice-shift glitch strength (set by main during Akiba transitions) */
  glitch = 0;
  reduced = false;
  /** Mini layout for the homepage player: the grand staff sized to a short
      band, with no rehearsal boxes, stop-time hatching or quote brackets —
      those live above the system and need the full-height stage. */
  mini = false;
  private fx: Fx[] = [];
  private hitCursor = 0;
  private lastLabel = -9;
  private lastNow = -1;
  private chordStart: number[];
  private maxChordDur = 0;
  /** hits fired since the last frame, for the HUD (VU, combo) */
  onHit?: (n: { track: Track; midi: number; name: string }) => void;

  constructor(canvas: HTMLCanvasElement, score: Score) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true })!;
    this.score = score;
    this.chordStart = score.chords.map((c) => c.t);
    for (const c of score.chords) for (const n of c.notes) this.maxChordDur = Math.max(this.maxChordDur, n.d);
    this.maxChordDur = Math.min(this.maxChordDur, 8);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    const portrait = this.h > this.w;
    if (this.mini) {
      // chord symbols (~5sp) + grand staff (14sp) + ledger room, filling the band
      this.sp = Math.max(4.5, Math.min(9, this.h / 23));
      this.pps = this.sp * 22;
      this.compact = this.w < 720;
      this.clefW = this.sp * (this.compact ? 5.4 : 12.6);
      this.playX = Math.max(this.w * 0.3, this.clefW + this.sp * 6);
      this.tTop = this.h * 0.5 - 4.5 * this.sp;
      this.bTop = this.tTop + 10 * this.sp;
      return;
    }
    this.sp = Math.max(7, Math.min(15, portrait ? this.w * 0.027 : Math.min(this.h * 0.019, this.w * 0.012)));
    this.pps = this.sp * (portrait ? 21 : 24);
    this.compact = this.w < 720;
    // brace 1.2 + clef 3.6 + key sig 4×1.05 + time sig 2.4
    this.clefW = this.sp * (this.compact ? 5.4 : 12.6);
    this.playX = Math.max(this.w * (portrait ? 0.28 : 0.3), this.clefW + this.sp * 6);
    // grand staff: treble 4sp, gap 6sp, bass 4sp; room above for chords/marks
    const mid = this.h * (portrait ? 0.5 : 0.53);
    this.tTop = mid - 7 * this.sp;
    this.bTop = this.tTop + 10 * this.sp;
  }

  private X(t: number, now: number) {
    return this.playX + (t - now) * this.pps;
  }
  private Y(n: { staff: 'T' | 'B'; step: number }) {
    const bottom = (n.staff === 'T' ? this.tTop : this.bTop) + 4 * this.sp;
    return bottom - (n.step * this.sp) / 2;
  }

  /** seek: forget FX and re-anchor the hit cursor */
  reset(now: number) {
    this.fx.length = 0;
    this.hitCursor = lowerBound(this.score.hits, now, (h) => h.t);
    this.lastLabel = -9;
    this.lastNow = now;
  }

  draw(now: number) {
    const { ctx } = this;
    this.spawnHits(now);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    const t0 = now - this.playX / this.pps - 0.5;
    const t1 = now + (this.w - this.playX) / this.pps + 0.5;

    this.drawStaffLines(0, this.w, 1 + this.pulse * 0.9);
    if (!this.mini) this.drawStops(now, t0, t1);
    this.drawBars(now, t0, t1);
    if (!this.mini) this.drawQuotes(now, t0, t1);
    this.drawChords(now, t0, t1);
    this.drawPlayhead();

    // notes: every chord that could still be on screen (tails reach back)
    const c0 = lowerBound(this.chordStart, t0 - this.maxChordDur, (x) => x);
    const c1 = lowerBound(this.chordStart, t1, (x) => x);
    // tails first so heads sit on top of every tail
    for (let i = c0; i < c1; i++) this.drawTails(this.score.chords[i], now);
    const beamsDrawn = new Set<number>();
    for (let i = c0; i < c1; i++) {
      const c = this.score.chords[i];
      if (c.t < t0 && c.notes.every((n) => c.t + n.d < t0)) continue;
      this.drawChord(c, now);
      if (c.beam >= 0 && !beamsDrawn.has(c.beam)) {
        beamsDrawn.add(c.beam);
        this.drawBeam(c.beam, now);
      }
    }

    this.drawFx(now);
    this.drawClefBlock();
    if (this.glitch > 0.02 && !this.reduced) this.sliceGlitch();
    this.pulse *= 0.86;
  }

  // ------------------------------------------------------------------ staff

  private drawStaffLines(x0: number, x1: number, weight: number) {
    const { ctx, sp } = this;
    ctx.fillStyle = this.theme.staff;
    const th = Math.max(1, 0.13 * sp * weight);
    for (const top of [this.tTop, this.bTop]) {
      for (let i = 0; i < 5; i++) ctx.fillRect(x0, top + i * sp - th / 2, x1 - x0, th);
    }
  }

  private drawStops(now: number, t0: number, t1: number) {
    const { ctx, sp } = this;
    const [starts, ends] = this.score.data.stops;
    for (let i = 0; i < starts.length; i++) {
      if (ends[i] < t0 || starts[i] > t1) continue;
      const xa = this.X(starts[i], now);
      const xb = this.X(ends[i], now);
      const y0 = this.tTop - 1.5 * sp;
      const y1 = this.bTop + 5.5 * sp;
      ctx.save();
      ctx.beginPath();
      ctx.rect(xa, y0, xb - xa, y1 - y0);
      ctx.clip();
      ctx.strokeStyle = this.theme.bar;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = xa - (y1 - y0); x < xb; x += sp * 0.9) {
        ctx.moveTo(x, y1);
        ctx.lineTo(x + (y1 - y0), y0);
      }
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = this.theme.text;
      ctx.font = `600 ${sp * 0.85}px 'JetBrains Mono', 'OST JP', monospace`;
      ctx.textAlign = 'left';
      ctx.fillText('STOP ／ 間', xa + sp * 0.4, y0 - sp * 0.45);
    }
  }

  private drawBars(now: number, t0: number, t1: number) {
    const { ctx, sp } = this;
    const bars = this.score.data.bars;
    const secs = this.score.data.sections;
    const b0 = Math.max(0, lowerBound(bars, t0, (x) => x) - 1);
    const b1 = lowerBound(bars, t1, (x) => x);
    const yTop = this.tTop;
    const yBot = this.bTop + 4 * sp;
    ctx.textAlign = 'left';
    for (let b = b0; b < b1 && b < bars.length; b++) {
      const x = this.X(bars[b], now) - sp * 0.9; // sit just before the downbeat's head
      const secIdx = secs.findIndex((s) => s[1] === b + 1);
      ctx.fillStyle = this.theme.bar;
      if (secIdx > 0) {
        // double bar: thin + thick
        ctx.fillStyle = this.theme.text;
        ctx.fillRect(x - sp * 0.75, yTop, Math.max(1, sp * 0.16), yBot - yTop);
        ctx.fillRect(x - sp * 0.4, yTop, sp * 0.5, yBot - yTop);
      } else if (b > 0) {
        ctx.fillRect(x, yTop, Math.max(1, sp * 0.16), yBot - yTop);
      }
      // bar number
      ctx.fillStyle = this.theme.dim;
      ctx.font = `500 ${sp * 0.8}px 'JetBrains Mono', monospace`;
      ctx.fillText(String(b + 1), x + sp * 0.3, yTop - sp * 1.1);
      if (secIdx >= 0 && !this.mini) this.drawRehearsal(secIdx, x);
    }
  }

  private drawRehearsal(i: number, x: number) {
    const { ctx, sp } = this;
    const [, , en, ja] = this.score.data.sections[i];
    const letter = String.fromCharCode(65 + i);
    const y = this.tTop - 8.6 * sp;
    const box = sp * 2.1;
    ctx.fillStyle = this.theme.text;
    ctx.fillRect(x, y, box, box);
    ctx.fillStyle = this.theme.name === 'paper' ? '#f1ece2' : '#0c0c0d';
    if (this.theme.name === 'akiba') ctx.fillStyle = '#07060c';
    ctx.font = `700 ${sp * 1.35}px 'Space Grotesk', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(letter, x + box / 2, y + box * 0.72);
    ctx.textAlign = 'left';
    ctx.fillStyle = this.theme.text;
    ctx.font = `900 ${sp * 1.25}px 'OST JP', 'Noto Sans JP', sans-serif`;
    ctx.fillText(ja, x + box + sp * 0.5, y + box * 0.55);
    ctx.fillStyle = this.theme.dim;
    ctx.font = `500 ${sp * 0.7}px 'JetBrains Mono', monospace`;
    ctx.fillText(en, x + box + sp * 0.55, y + box * 1.05);
  }

  private drawQuotes(now: number, t0: number, t1: number) {
    const { ctx, sp } = this;
    for (const [s, e, label] of this.score.data.quotes) {
      if (e < t0 || s > t1) continue;
      const xa = this.X(s, now) - sp;
      const xb = this.X(e, now) - sp;
      const y = this.tTop - 5.9 * sp;
      ctx.strokeStyle = this.theme.accent;
      ctx.lineWidth = Math.max(1.2, sp * 0.14);
      ctx.beginPath();
      ctx.moveTo(xa, y + sp * 0.8);
      ctx.lineTo(xa, y);
      ctx.lineTo(xb, y);
      ctx.lineTo(xb, y + sp * 0.8);
      ctx.stroke();
      // sticky label: holds at the clef edge while its bracket is still passing
      const text = `QUOTE ▸ BEETHOVEN  ${label}`;
      ctx.font = `600 ${sp * 0.78}px 'JetBrains Mono', monospace`;
      const tw = ctx.measureText(text).width;
      const lx = Math.min(Math.max(xa + sp * 0.5, this.clefW + sp * 3), xb - tw - sp * 0.5);
      ctx.fillStyle = this.theme.name === 'paper' ? '#f1ece2' : this.theme.name === 'akiba' ? '#07060c' : '#0c0c0d';
      ctx.fillRect(lx - sp * 0.3, y - sp * 0.6, tw + sp * 0.6, sp * 1.2);
      ctx.fillStyle = this.theme.accent;
      ctx.fillText(text, lx, y + sp * 0.28);
    }
  }

  private drawChords(now: number, t0: number, t1: number) {
    const { ctx, sp } = this;
    const ch = this.score.data.chords;
    const i0 = Math.max(0, lowerBound(ch, t0, (c) => c[0]) - 1);
    const i1 = lowerBound(ch, t1, (c) => c[0]);
    const y = this.tTop - 4.1 * sp;
    ctx.textAlign = 'left';
    for (let i = i0; i < i1; i++) {
      const [t, sym] = ch[i];
      const x = this.X(t, now) - sp * 0.6;
      const live = t <= now && (ch[i + 1]?.[0] ?? Infinity) > now;
      ctx.fillStyle = live ? this.theme.hot : this.theme.text;
      ctx.font = `${live ? 700 : 600} ${sp * 1.3}px 'Space Grotesk', sans-serif`;
      ctx.fillText(prettyChord(sym), x, y);
    }
  }

  private drawPlayhead() {
    const { ctx, sp, playX } = this;
    const y0 = this.tTop - 10 * sp;
    const y1 = this.bTop + 7 * sp;
    const g = ctx.createLinearGradient(playX - sp * 4, 0, playX, 0);
    g.addColorStop(0, hexA(this.theme.accent, 0));
    g.addColorStop(1, hexA(this.theme.accent, 0.1));
    ctx.fillStyle = g;
    ctx.fillRect(playX - sp * 4, y0, sp * 4, y1 - y0);
    ctx.fillStyle = this.theme.accent;
    ctx.fillRect(playX - 1, y0, 2, y1 - y0);
    // registration ticks
    ctx.beginPath();
    ctx.moveTo(playX - sp * 0.6, y0);
    ctx.lineTo(playX + sp * 0.6, y0);
    ctx.lineTo(playX, y0 + sp);
    ctx.closePath();
    ctx.moveTo(playX - sp * 0.6, y1);
    ctx.lineTo(playX + sp * 0.6, y1);
    ctx.lineTo(playX, y1 - sp);
    ctx.closePath();
    ctx.fill();
  }

  // ------------------------------------------------------------------ notes

  private colorOf(track: Track) {
    return this.theme[TRACK_KEY[track]] as string;
  }

  private drawTails(c: Chord, now: number) {
    const { ctx, sp } = this;
    const th = sp * (c.track === 'arp' ? 0.22 : 0.38);
    for (const n of c.notes) {
      if (n.d < 0.2) continue;
      const xa = this.X(n.t, now);
      const xb = this.X(n.t + n.d, now);
      if (xb < 0 || xa > this.w) continue;
      const y = this.Y(n);
      ctx.fillStyle = hexA(this.colorOf(n.track), 0.16);
      ctx.fillRect(xa, y - th / 2, xb - xa, th);
      if (now > n.t && now < n.t + n.d) {
        // the part already sounded glows: the playhead sweeps along the tail
        ctx.fillStyle = hexA(this.theme.hot, 0.75);
        ctx.fillRect(xa, y - th / 2, this.playX - xa, th);
      }
    }
  }

  private drawChord(c: Chord, now: number) {
    const { ctx, sp } = this;
    const cue = c.track === 'arp';
    const scale = cue ? 0.72 : 1;
    const x = this.X(c.t, now);
    if (x < -sp * 4 || x > this.w + sp * 4) return;
    const age = now - c.t;
    const dur = Math.max(...c.notes.map((n) => n.d));
    const active = age >= 0 && age < Math.max(dur, 0.12);
    const past = age >= 0 && !active;
    let color = this.colorOf(c.track);
    if (active) color = this.theme.hot;
    const alpha = past ? Math.max(0.28, 0.75 - age * 0.25) : 1;
    const pop = !this.reduced && age >= 0 && age < 0.35 ? 1 + 0.55 * Math.exp(-age * 12) : 1;
    const fs = 4 * sp * scale;
    const headW = (c.head === 'whole' ? WHOLE_W : HEAD_W) * sp * scale;
    const left = x - headW / 2;

    ctx.globalAlpha = alpha;
    // ledger lines
    ctx.fillStyle = this.theme.staff;
    const lth = Math.max(1, 0.16 * sp);
    const lo = c.notes[0];
    const hi = c.notes[c.notes.length - 1];
    for (const n of [lo, hi]) {
      if (n.step <= -2) for (let s = -2; s >= n.step; s -= 2) ctx.fillRect(left - 0.4 * sp, this.Y({ staff: n.staff, step: s }) - lth / 2, headW + 0.8 * sp, lth);
      if (n.step >= 10) for (let s = 10; s <= n.step; s += 2) ctx.fillRect(left - 0.4 * sp, this.Y({ staff: n.staff, step: s }) - lth / 2, headW + 0.8 * sp, lth);
    }

    // stem (not for wholes or cue arps)
    const stemW = Math.max(1, 0.12 * sp);
    let stemX = 0, stemEnd = 0;
    if (c.head !== 'whole' && !cue) {
      if (c.stemUp) {
        stemX = left + headW - stemW / 2;
        const from = this.Y(lo) - STEM_Y * sp;
        stemEnd = c.beam >= 0 ? this.beamYAt(c, now) : this.Y(hi) - STEM_LEN * sp;
        ctx.fillStyle = color;
        ctx.fillRect(stemX - stemW / 2, stemEnd, stemW, from - stemEnd);
      } else {
        stemX = left + stemW / 2;
        const from = this.Y(hi) + STEM_Y * sp;
        stemEnd = c.beam >= 0 ? this.beamYAt(c, now) : this.Y(lo) + STEM_LEN * sp;
        ctx.fillStyle = color;
        ctx.fillRect(stemX - stemW / 2, from, stemW, stemEnd - from);
      }
      if (c.beam < 0 && c.flags > 0) {
        ctx.font = `${fs}px 'OST Notation'`;
        ctx.textAlign = 'left';
        const g = c.stemUp ? (c.flags === 2 ? G.f16u : G.f8u) : c.flags === 2 ? G.f16d : G.f8d;
        ctx.fillText(g, stemX - stemW / 2, stemEnd);
      }
    }

    // heads + accidentals
    const accCols: number[] = [];
    for (let k = c.notes.length - 1; k >= 0; k--) {
      const n = c.notes[k];
      const y = this.Y(n);
      const hx = left + n.shift * (headW - stemW);
      if (n.acc) {
        // stack accidentals that would collide into extra columns
        let col = 0;
        while (accCols[col] !== undefined && accCols[col] - n.step < 6) col++;
        accCols[col] = n.step;
        ctx.font = `${fs}px 'OST Notation'`;
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        const aw = ACC_W[n.acc] * sp * scale;
        ctx.fillText(G[n.acc as 'b'], left - 0.25 * sp - aw - col * 1.05 * sp, y);
      }
      this.drawHead(n, hx, y, headW, fs, color, pop, active);
    }
    ctx.globalAlpha = 1;
  }

  private drawHead(n: Note, hx: number, y: number, headW: number, fs: number, color: string, pop: number, active: boolean) {
    const { ctx, sp } = this;
    const cx = hx + headW / 2;
    ctx.save();
    if (pop !== 1) {
      ctx.translate(cx, y);
      ctx.scale(pop, pop);
      ctx.translate(-cx, -y);
    }
    if (active && !this.reduced) {
      ctx.shadowColor = this.theme.hot;
      ctx.shadowBlur = sp * 1.6;
    }
    if (this.theme.pixel) {
      // Akiba: an 8×8-ish block head, RGB-split
      const s = sp * 1.05 * (fs / (4 * sp));
      const hollow = n.head !== 'black';
      if (!this.reduced) {
        ctx.fillStyle = 'rgba(255,63,164,.55)';
        ctx.fillRect(cx - s / 2 - 2, y - s / 2, s, s);
        ctx.fillStyle = 'rgba(60,242,255,.55)';
        ctx.fillRect(cx - s / 2 + 2, y - s / 2, s, s);
      }
      ctx.fillStyle = color;
      ctx.fillRect(cx - s / 2, y - s / 2, s, s);
      if (hollow) {
        ctx.fillStyle = '#07060c';
        ctx.fillRect(cx - s / 4, y - s / 4, s / 2, s / 2);
      }
    } else {
      ctx.fillStyle = color;
      ctx.font = `${fs}px 'OST Notation'`;
      ctx.textAlign = 'left';
      ctx.fillText(n.head === 'whole' ? G.whole : n.head === 'half' ? G.half : G.black, hx, y);
    }
    ctx.restore();
  }

  /** the beam line for a chord's group, in screen y at that chord's stem */
  private beamGeo = new Map<number, { x0: number; y0: number; slope: number; up: boolean; at: number }>();
  private beamYAt(c: Chord, now: number) {
    const g = this.beamLine(c.beam, now);
    const x = this.stemXOf(c, now);
    return g.y0 + (x - g.x0) * g.slope;
  }
  private stemXOf(c: Chord, now: number) {
    const x = this.X(c.t, now);
    const headW = HEAD_W * this.sp;
    const stemW = Math.max(1, 0.12 * this.sp);
    return c.stemUp ? x - headW / 2 + headW - stemW / 2 : x - headW / 2 + stemW / 2;
  }
  private beamLine(id: number, now: number) {
    const cached = this.beamGeo.get(id);
    if (cached && cached.at === now) return cached;
    const { sp } = this;
    const grp = this.score.beams[id];
    const up = grp.chords[0].stemUp;
    const ends = grp.chords.map((c) => {
      const lo = this.Y(c.notes[0]);
      const hi = this.Y(c.notes[c.notes.length - 1]);
      return { x: this.stemXOf(c, now), y: up ? hi - STEM_LEN * sp : lo + STEM_LEN * sp };
    });
    const first = ends[0];
    const last = ends[ends.length - 1];
    let slope = last.x > first.x ? (last.y - first.y) / (last.x - first.x) : 0;
    const maxRise = sp; // a beam never climbs more than a space
    const span = Math.max(1, last.x - first.x);
    slope = Math.max(-maxRise / span, Math.min(maxRise / span, slope));
    let y0 = first.y;
    for (const e of ends) {
      const ly = y0 + (e.x - first.x) * slope;
      if (up && ly > e.y) y0 -= ly - e.y;
      if (!up && ly < e.y) y0 += e.y - ly;
    }
    const geo = { x0: first.x, y0, slope, up, at: now };
    this.beamGeo.set(id, geo);
    if (this.beamGeo.size > 400) this.beamGeo.clear();
    return geo;
  }

  private drawBeam(id: number, now: number) {
    const { ctx, sp } = this;
    const grp = this.score.beams[id];
    const g = this.beamLine(id, now);
    const th = 0.5 * sp;
    const stemW = Math.max(1, 0.12 * sp);
    const age = now - grp.chords[0].t;
    const lastAge = now - grp.chords[grp.chords.length - 1].t;
    const past = lastAge > 0.15;
    ctx.globalAlpha = past ? Math.max(0.28, 0.75 - lastAge * 0.25) : 1;
    ctx.fillStyle = age >= 0 && !past ? this.theme.hot : this.colorOf(grp.chords[0].track);
    const quad = (xa: number, xb: number, off: number) => {
      const dir = g.up ? 1 : -1;
      const ya = g.y0 + (xa - g.x0) * g.slope + dir * off;
      const yb = g.y0 + (xb - g.x0) * g.slope + dir * off;
      ctx.beginPath();
      ctx.moveTo(xa, ya);
      ctx.lineTo(xb, yb);
      ctx.lineTo(xb, yb + dir * th);
      ctx.lineTo(xa, ya + dir * th);
      ctx.closePath();
      ctx.fill();
    };
    const xs = grp.chords.map((c) => this.stemXOf(c, now));
    quad(xs[0] - stemW / 2, xs[xs.length - 1] + stemW / 2, 0);
    if (grp.levels === 2) {
      const off = 0.75 * sp;
      for (let i = 0; i < grp.chords.length; i++) {
        if (grp.chords[i].flags !== 2) continue;
        const nextIs = grp.chords[i + 1]?.flags === 2;
        const prevIs = grp.chords[i - 1]?.flags === 2;
        if (nextIs) quad(xs[i] - stemW / 2, xs[i + 1] + stemW / 2, off);
        else if (!prevIs) {
          // lone sixteenth: a stub pointing into the group
          const dir = i === grp.chords.length - 1 ? -1 : 1;
          const a = xs[i];
          const b = a + dir * sp * 1.1;
          quad(Math.min(a, b), Math.max(a, b), off);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ FX

  private spawnHits(now: number) {
    const hits = this.score.hits;
    const dt = now - this.lastNow;
    if (this.lastNow < 0 || dt < 0 || dt > 0.3) {
      this.reset(now);
      return;
    }
    let lastT = -1;
    let topIdx = -1;
    const flush = () => {
      if (topIdx < 0) return;
      const h = hits[topIdx];
      const n = h.note;
      if (n && !this.reduced) {
        const y = this.Y(n);
        const color = h.track === 'chip' ? this.theme.chip : this.theme.hot;
        const seed = Math.random();
        if (this.theme.pixel) this.fx.push({ t0: h.t, x: this.playX, y, kind: 'pix', color, seed });
        else this.fx.push({ t0: h.t, x: this.playX, y, kind: 'ring', color, seed });
        if (h.t - this.lastLabel > 0.2) {
          this.lastLabel = h.t;
          this.fx.push({ t0: h.t, x: this.playX, y, kind: 'label', color, text: h.name, seed });
        }
      }
      topIdx = -1;
    };
    while (this.hitCursor < hits.length && hits[this.hitCursor].t <= now) {
      const h = hits[this.hitCursor];
      this.onHit?.(h);
      if (h.track !== 'lh') {
        if (Math.abs(h.t - lastT) > 0.012) flush();
        lastT = h.t;
        topIdx = topIdx < 0 || hits[topIdx].midi < h.midi ? this.hitCursor : topIdx;
      }
      this.hitCursor++;
    }
    flush();
    this.lastNow = now;
    if (this.fx.length > 80) this.fx.splice(0, this.fx.length - 80);
  }

  /** a full-height shockwave at the playhead (crash cymbal) */
  shock() {
    if (this.reduced) return;
    this.fx.push({ t0: this.lastNow, x: this.playX, y: (this.tTop + this.bTop + 4 * this.sp) / 2, kind: 'shock', color: this.theme.accent, seed: 0 });
  }

  private drawFx(now: number) {
    const { ctx, sp } = this;
    this.fx = this.fx.filter((f) => now - f.t0 < 0.9 && now >= f.t0 - 0.05);
    for (const f of this.fx) {
      const a = Math.max(0, now - f.t0);
      if (f.kind === 'ring') {
        const p = Math.min(1, a / 0.45);
        const r = sp * (0.9 + 3.2 * easeOut(p));
        ctx.strokeStyle = hexA(f.color, 1 - p);
        ctx.lineWidth = Math.max(1, sp * 0.22 * (1 - p));
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
        ctx.stroke();
        // eight rays
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2 + f.seed;
          const r0 = r + sp * 0.5;
          const r1 = r + sp * (0.5 + 1.2 * (1 - p));
          ctx.moveTo(f.x + Math.cos(ang) * r0, f.y + Math.sin(ang) * r0);
          ctx.lineTo(f.x + Math.cos(ang) * r1, f.y + Math.sin(ang) * r1);
        }
        ctx.stroke();
      } else if (f.kind === 'pix') {
        const p = Math.min(1, a / 0.5);
        ctx.fillStyle = hexA(f.color, 1 - p);
        const s = Math.round(sp * 0.45);
        for (let k = 0; k < 10; k++) {
          const ang = (k / 10) * Math.PI * 2 + f.seed * 6;
          const d = sp * (1 + 4 * easeOut(p)) * (0.6 + ((k * 37) % 10) / 20);
          const px = Math.round((f.x + Math.cos(ang) * d) / s) * s;
          const py = Math.round((f.y + Math.sin(ang) * d) / s) * s;
          ctx.fillRect(px, py, s, s);
        }
      } else if (f.kind === 'label') {
        const p = Math.min(1, a / 0.8);
        ctx.globalAlpha = 1 - p * p;
        ctx.fillStyle = f.color;
        ctx.font = this.theme.pixel ? `${sp * 1.05}px 'OST Dot', monospace` : `700 ${sp * 0.95}px 'Space Grotesk', sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(this.theme.pixel ? `+${Math.round(50 + f.seed * 50)}` : f.text ?? '', f.x + sp * 1.3, f.y - sp * (0.8 + 2.4 * easeOut(p)));
        ctx.globalAlpha = 1;
      } else if (f.kind === 'shock') {
        const p = Math.min(1, a / 0.7);
        const x = f.x + easeOut(p) * this.w * 0.6;
        ctx.fillStyle = hexA(f.color, 0.35 * (1 - p));
        ctx.fillRect(x - sp * 0.3, this.tTop - 10 * sp, sp * 0.6, 23 * sp);
        ctx.fillRect(f.x - (x - f.x) * 0.5 - sp * 0.3, this.tTop - 10 * sp, sp * 0.6, 23 * sp);
      }
    }
  }

  // ------------------------------------------------------------------ clef block

  private drawClefBlock() {
    const { ctx, sp } = this;
    const fadeEnd = this.clefW + sp * 5;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const g = ctx.createLinearGradient(this.clefW, 0, fadeEnd, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.clefW, this.h);
    ctx.fillStyle = g;
    ctx.fillRect(this.clefW, 0, fadeEnd - this.clefW, this.h);
    ctx.restore();

    this.drawStaffLines(sp * 1.4, fadeEnd, 1 + this.pulse * 0.9);
    const fs = 4 * sp;
    const top = this.tTop;
    const bot = this.bTop + 4 * sp;
    ctx.fillStyle = this.theme.text;
    // system line + brace (brace glyph is 4 spaces tall at 4sp; scale to the system)
    const x0 = sp * 1.4;
    ctx.fillRect(x0, top, Math.max(1, sp * 0.16), bot - top);
    ctx.save();
    const braceScale = (bot - top) / (4 * sp);
    ctx.translate(x0 - sp * 0.35, bot);
    ctx.scale(1 + (braceScale - 1) * 0.3, braceScale);
    ctx.font = `${fs}px 'OST Notation'`;
    ctx.textAlign = 'right';
    ctx.fillText(G.brace, 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.font = `${fs}px 'OST Notation'`;
    const cx = x0 + sp * 0.8;
    ctx.fillText(G.gClef, cx, this.Y({ staff: 'T', step: 2 }));
    ctx.fillText(G.fClef, cx, this.Y({ staff: 'B', step: 6 }));
    if (this.compact) return;
    // four flats: B E A D
    const kx = cx + sp * 3.4;
    const tSteps = [4, 7, 3, 6];
    const bSteps = [2, 5, 1, 4];
    for (let i = 0; i < 4; i++) {
      ctx.fillText(G.b, kx + i * sp * 1.0, this.Y({ staff: 'T', step: tSteps[i] }));
      ctx.fillText(G.b, kx + i * sp * 1.0, this.Y({ staff: 'B', step: bSteps[i] }));
    }
    const tx = kx + sp * 4.5;
    for (const staff of ['T', 'B'] as const) {
      ctx.fillText(G.ts4, tx, this.Y({ staff, step: 6 }));
      ctx.fillText(G.ts4, tx, this.Y({ staff, step: 2 }));
    }
  }

  private sliceGlitch() {
    const { ctx, canvas } = this;
    const n = 3 + Math.floor(this.glitch * 8);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < n; i++) {
      const y = Math.random() * canvas.height;
      const hh = (4 + Math.random() * 40) * this.dpr;
      const dx = (Math.random() - 0.5) * 60 * this.glitch * this.dpr;
      ctx.drawImage(canvas, 0, y, canvas.width, hh, dx, y, canvas.width, hh);
    }
    ctx.restore();
  }
}

// -------------------------------------------------------------------- helpers

export function prettyChord(s: string) {
  return s.replace(/([A-G])b/g, '$1♭').replace(/([A-G])#/g, '$1♯').replace(/maj7/, 'M7');
}

function easeOut(p: number) {
  return 1 - Math.pow(1 - p, 3);
}

const rgbCache = new Map<string, [number, number, number]>();
/** colour + alpha → rgba(); accepts #rrggbb or rgba(...) */
export function hexA(c: string, a: number) {
  if (c.startsWith('rgba')) {
    const parts = c.slice(5, -1).split(',');
    return `rgba(${parts[0]},${parts[1]},${parts[2]},${(+parts[3] * a).toFixed(3)})`;
  }
  let rgb = rgbCache.get(c);
  if (!rgb) {
    const v = parseInt(c.slice(1), 16);
    rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    rgbCache.set(c, rgb);
  }
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`;
}
