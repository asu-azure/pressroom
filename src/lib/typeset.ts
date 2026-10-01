/**
 * Lettering a translation into a speech balloon — the reader's typeset mode.
 *
 * The fit is computed ONCE, in the page image's own pixel space, and the
 * renderer (components/reader/TypesetLayer.svelte) draws it in units of the
 * page's height. So it looks the same at every screen size, rotation and zoom,
 * and nothing re-measures (no ResizeObserver, no DOM reads).
 *
 * Vertical (縦書き) by default: Thai balloons are tall and narrow, which is
 * exactly a Japanese balloon's shape. Columns are centred in the balloon and,
 * for an ellipse, each column is as long as the balloon is tall at that
 * column's outer edge, so the text follows the curve the way a letterer's does.
 * Sizes snap to a few steps of one book-wide base size — real lettering uses
 * one dialogue size, and fitting every balloon to its maximum looked crude.
 *
 * Pure; tested in typeset.test.ts (properties, not exact line breaks — word
 * segmentation differs between engines).
 */
import type { Bubble, BubbleShape } from './types';

/** Calibrated in the harness against the books' own Thai lettering. */
export const TS = {
  /** base font size, % of page height */
  BASE: 1.7,
  /** smallest size before a balloon reports overflow, % of page height */
  MIN: 1.0,
  /** sizes the base snaps down through */
  STEPS: [1, 0.9, 0.8, 0.7, 0.6],
  /** column (or line) pitch, in em */
  PITCH: 1.3,
  /** inner padding, fraction of the balloon's shorter side */
  PAD: 0.08,
  /** a box this much wider than tall reads horizontally */
  WIDE: 1.6,
} as const;

export interface Piece {
  t: string;
  /** two characters set upright in one em (縦中横): "!?", "12" */
  tcy?: boolean;
}

export interface Fit {
  dir: 'v' | 'h';
  /** font size, % of the page height */
  fs: number;
  /** column/line pitch, em (the renderer's line-height) */
  pitch: number;
  /** columns (vertical) or lines (horizontal), in reading order */
  lines: Piece[][];
  overflow: boolean;
}

// ---------------------------------------------------------------- tokens

/** May not start a column: closing brackets, punctuation, small kana, ー. */
const NO_START = new Set([...'、。，．・：；？！ー―…‥」』）］｝〉》】〕”’ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ々ゝゞヽヾ!?,.)]}']);
/** May not end a column: opening brackets. */
const NO_END = new Set([...'「『（［｛〈《【〔“‘([{']);

interface Unit {
  t: string;
  em: number; // advance along the column
  tcy?: boolean;
  nl?: boolean; // forced break
}

let segmenter: Intl.Segmenter | null | undefined;
function wordStarts(text: string): Set<number> {
  if (segmenter === undefined) {
    try {
      segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
    } catch {
      segmenter = null;
    }
  }
  const starts = new Set<number>();
  if (!segmenter) {
    for (let i = 0; i <= text.length; i++) starts.add(i); // break anywhere kinsoku allows
    return starts;
  }
  for (const s of segmenter.segment(text)) starts.add(s.index);
  starts.add(text.length);
  return starts;
}

const FULL: Record<string, string> = { '!': '！', '?': '？', ',': '、', '~': '〜' };

/** Text → units, each with its advance; ASCII runs lie sideways at ~0.6em a letter. */
export function units(text: string): Unit[] {
  const s = text.replace(/\.{3}/g, '…').replace(/\r/g, '');
  const out: Unit[] = [];
  const re = /(\n)|([!?！？]{2})|((?<![0-9])[0-9]{1,2}(?![0-9]))|([A-Za-z][A-Za-z' ]*[A-Za-z]|[A-Za-z])|(\P{M}\p{M}*)/gsu;
  for (const m of s.matchAll(re)) {
    if (m[1]) out.push({ t: '\n', em: 0, nl: true });
    else if (m[2]) out.push({ t: m[2].replace(/！/g, '!').replace(/？/g, '?'), em: 1, tcy: true });
    else if (m[3]) out.push({ t: m[3], em: 1, tcy: true }); // upright, one em, even a single digit
    else if (m[4]) out.push({ t: m[4], em: Math.ceil(m[4].length * 0.6 * 2) / 2 });
    else out.push({ t: FULL[m[5]] ?? m[5], em: 1 });
  }
  return out;
}

interface Word {
  units: Unit[];
  em: number;
  nl?: boolean;
}

/** Group units into unbreakable words: segmenter boundaries minus kinsoku. */
function words(us: Unit[]): Word[] {
  const plain = us.map((u) => u.t).join('');
  const starts = wordStarts(plain);
  const ws: Word[] = [];
  let at = 0;
  let cur: Unit[] = [];
  const flush = () => {
    if (cur.length) ws.push({ units: cur, em: cur.reduce((a, u) => a + u.em, 0) });
    cur = [];
  };
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (u.nl) {
      flush();
      ws.push({ units: [], em: 0, nl: true });
      at += u.t.length;
      continue;
    }
    const prev = cur[cur.length - 1];
    const canBreak =
      !prev || (starts.has(at) && !NO_START.has(u.t[0]) && !NO_END.has(prev.t[prev.t.length - 1]));
    if (canBreak) flush();
    cur.push(u);
    at += u.t.length;
  }
  flush();
  return ws;
}

/** A word too long for any column, broken where kinsoku allows. */
function splitWord(w: Word, cap: number): Word[] {
  const parts: Word[] = [];
  let cur: Unit[] = [];
  let em = 0;
  for (const u of w.units) {
    const prev = cur[cur.length - 1];
    if (prev && em + u.em > cap && !NO_START.has(u.t[0]) && !NO_END.has(prev.t[prev.t.length - 1])) {
      parts.push({ units: cur, em });
      cur = [];
      em = 0;
    }
    cur.push(u);
    em += u.em;
  }
  if (cur.length) parts.push({ units: cur, em });
  return parts;
}

// ---------------------------------------------------------------- geometry

/**
 * Each column's length (px) for n columns at size fs (px). Japanese lettering
 * tops its columns on one line (天揃え) and centres the block in the balloon,
 * so the block is a rectangle: in an ellipse it is the rectangle inscribed at
 * that width (its corners on the curve), in a box it is the box.
 */
function capacities(shape: BubbleShape, across: number, along: number, fs: number, pitch: number, n: number): number[] | null {
  const span = (n - 1) * pitch + fs;
  if (span > across + 1e-6) return null;
  let len = along;
  if (shape === 'ellipse') len = along * Math.sqrt(Math.max(0, 1 - (span / across) ** 2));
  else if (shape === 'round') len = along * (span > across * 0.8 ? 0.92 : 1);
  return Array.from({ length: n }, () => len);
}

/** Fill columns with words; null when they don't fit. `limit` balances lengths. */
function pack(ws: Word[], caps: number[], fs: number, limit = Infinity): Unit[][] | null {
  const capEm = caps.map((c) => Math.floor((c / fs) * 2) / 2);
  const cols: Unit[][] = [[]];
  let used = 0;
  let col = 0;
  const queue = [...ws];
  while (queue.length) {
    const w = queue.shift()!;
    if (w.nl) {
      if (cols[col].length) {
        col++;
        cols.push([]);
        used = 0;
      }
      continue;
    }
    const cap = capEm[col];
    if (cap === undefined) return null;
    const room = Math.min(cap, limit);
    if (used + w.em <= room) {
      cols[col].push(...w.units);
      used += w.em;
      continue;
    }
    if (used === 0) {
      // longer than a whole column: break it
      if (w.units.length < 2 || w.em <= cap) {
        if (w.em > cap) return null;
        cols[col].push(...w.units);
        used += w.em;
        continue;
      }
      const parts = splitWord(w, cap);
      if (parts.length < 2) return null; // kinsoku leaves nowhere to break
      queue.unshift(...parts);
      continue;
    }
    col++;
    cols.push([]);
    used = 0;
    queue.unshift(w);
  }
  if (col >= caps.length) return null;
  return cols.filter((c) => c.length);
}

function toPieces(col: Unit[]): Piece[] {
  const out: Piece[] = [];
  for (const u of col) {
    const last = out[out.length - 1];
    if (u.tcy) out.push({ t: u.t, tcy: true });
    else if (last && !last.tcy) last.t += u.t;
    else out.push({ t: u.t });
  }
  return out;
}

// ---------------------------------------------------------------- fit

export function autoDir(b: Pick<Bubble, 'w' | 'h' | 'text' | 'dir'>, pageW: number, pageH: number): 'v' | 'h' {
  if (b.dir === 'v' || b.dir === 'h') return b.dir;
  const latin = (b.text.match(/[A-Za-z]/g) ?? []).length;
  if (latin > b.text.replace(/\s/g, '').length / 2) return 'h';
  return b.w * pageW > TS.WIDE * b.h * pageH ? 'h' : 'v';
}

/** Letter one balloon. Same input, same output — always. */
export function fitBubble(b: Bubble, pageW: number, pageH: number): Fit {
  const dir = autoDir(b, pageW, pageH);
  const shape: BubbleShape = b.shape ?? 'ellipse';
  const bw = b.w * pageW;
  const bh = b.h * pageH;
  const pad = TS.PAD * Math.min(bw, bh);
  // vertical: columns run along the height, stacked across the width
  const across = Math.max(1, (dir === 'v' ? bw : bh) - 2 * pad);
  const along = Math.max(1, (dir === 'v' ? bh : bw) - 2 * pad);
  const ws = words(units(b.text.trim()));
  const total = ws.reduce((a, w) => a + w.em, 0);
  const scale = Math.min(1.6, Math.max(0.5, b.scale ?? 1));

  const attempt = (fsPct: number): Unit[][] | null => {
    const fs = (fsPct / 100) * pageH;
    const pitch = fs * TS.PITCH;
    for (let n = 1; ; n++) {
      const caps = capacities(shape, across, along, fs, pitch, n);
      if (!caps) return null;
      const greedy = pack(ws, caps, fs);
      if (!greedy) continue;
      // same column count, lengths evened out (a long first column and a stub reads badly)
      const balanced = pack(ws, caps, fs, Math.ceil(total / n) + 1);
      return balanced && balanced.length <= greedy.length ? balanced : greedy;
    }
  };

  const sizes = TS.STEPS.map((s) => TS.BASE * scale * s);
  if (sizes[sizes.length - 1] > TS.MIN) sizes.push(TS.MIN);
  for (const fs of sizes) {
    const cols = attempt(fs);
    if (cols) return { dir, fs: round(fs), pitch: TS.PITCH, lines: cols.map(toPieces), overflow: false };
  }
  // too long even at the minimum: one column per line break, overflow flagged
  const last = sizes[sizes.length - 1];
  const lines = ws.reduce<Unit[][]>((acc, w) => {
    if (w.nl) acc.push([]);
    else acc[acc.length - 1].push(...w.units);
    return acc;
  }, [[]]);
  return { dir, fs: round(last), pitch: TS.PITCH, lines: lines.filter((l) => l.length).map(toPieces), overflow: true };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------- data

const SHAPES = new Set<BubbleShape>(['ellipse', 'round', 'rect', 'none']);
const clamp = (n: unknown, lo: number, hi: number, d: number) => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : d;
  return Math.min(hi, Math.max(lo, v));
};

/**
 * A bubble as stored, or null if it is junk: rect clamped onto the page,
 * unknown enum values dropped, empty text rejected. The renderer and the
 * translation batches (written straight to pages.bubbles) both go through it.
 */
export function normalizeBubble(raw: unknown): Bubble | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id.trim() : '';
  const text = typeof r.text === 'string' ? r.text.trim() : '';
  if (!id || !text) return null;
  const x = clamp(r.x, 0, 0.999, 0);
  const y = clamp(r.y, 0, 0.999, 0);
  const w = clamp(r.w, 0.001, 1 - x, 0);
  const h = clamp(r.h, 0.001, 1 - y, 0);
  if (!(w > 0.001 && h > 0.001)) return null;
  const b: Bubble = {
    id,
    panel: Math.max(1, Math.round(clamp(r.panel, 1, 999, 1))),
    charId: typeof r.charId === 'string' && r.charId ? r.charId : null,
    x,
    y,
    w,
    h,
    text,
  };
  if (typeof r.shape === 'string' && SHAPES.has(r.shape as BubbleShape)) b.shape = r.shape as BubbleShape;
  if (r.dark === true) b.dark = true;
  if (r.dir === 'v' || r.dir === 'h') b.dir = r.dir;
  if (typeof r.scale === 'number' && Number.isFinite(r.scale) && r.scale !== 1) b.scale = clamp(r.scale, 0.5, 1.6, 1);
  if (r.kind === 'prose') b.kind = 'prose';
  if (Array.isArray(r.cover)) {
    const cover = r.cover
      .filter((c): c is number[] => Array.isArray(c) && c.length === 4 && c.every((v) => typeof v === 'number' && Number.isFinite(v)))
      .map(([cx, cy, cw, ch]) => {
        const x0 = clamp(cx, 0, 1, 0);
        const y0 = clamp(cy, 0, 1, 0);
        return [x0, y0, clamp(cw, 0, 1 - x0, 0), clamp(ch, 0, 1 - y0, 0)] as [number, number, number, number];
      })
      .filter(([, , cw, ch]) => cw > 0 && ch > 0);
    if (cover.length) b.cover = cover;
  }
  return b;
}
