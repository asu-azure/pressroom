/**
 * The studio wall on /asu (scripts/wall.ts): where each print hangs.
 *
 * Pure and deterministic — the page lays the wall out on the server, and the
 * client lays it out again only when the rows change (a narrow screen) or a
 * filter hides pieces. Everything that makes it look hand-hung (print size, how
 * high it sits in its row, the tilt, the gaps, tape or a push pin) comes from a
 * hash of the artwork's id, so the wall never reshuffles between visits and a
 * new piece never moves the old ones.
 *
 * Packing: gallery order, each print onto the row that is currently shortest,
 * so the wall reads left to right. The lead (featured) piece is bigger and
 * spans two rows (the middle pair; the top pair of three). No two prints overlap, tilt included
 * (wallLayout.test.ts).
 *
 * Units are abstract (a row is ROW_H tall); the page scales them so the rows
 * fill the wall's height.
 */

export interface WallItem {
  id: string;
  /** width / height of the artwork */
  aspect: number;
  lead?: boolean;
}

export type Hold = 'tape' | 'tape2' | 'pin';

export interface WallPrint {
  /** outer box of the print (paper border included), unrotated, top-left origin */
  x: number;
  y: number;
  w: number;
  h: number;
  /** paper border: sides and top, and the deeper bottom that carries the number */
  b: number;
  bb: number;
  /** tilt, degrees */
  r: number;
  hold: Hold;
  /** tape angle (degrees) or pin colour index */
  tr: number;
  row: number;
  span: number;
}

export interface WallLayout {
  prints: WallPrint[];
  width: number;
  height: number;
  rows: number;
}

export const ROW_H = 100;
export const ROW_GAP = 18;
export const MARGIN_Y = 24;
export const MARGIN_X = 70;
export const BORDER = 0.045;
export const BOTTOM = 2.6; // × BORDER

/** Rows for n pieces: fewer, larger prints on a wide screen; one more on a narrow one. */
export function wallRows(n: number, narrow = false): number {
  const rows = Math.min(5, Math.max(2, Math.round(Math.sqrt(n / 6))));
  return narrow ? Math.min(6, rows + 1) : rows;
}

/** FNV-1a → mulberry32: a small, stable stream of numbers per artwork. */
function rng(id: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function layoutWall(items: WallItem[], rows: number): WallLayout {
  rows = Math.max(1, Math.floor(rows));
  const rowTop = (r: number) => MARGIN_Y + r * (ROW_H + ROW_GAP);
  const cursor: number[] = [];
  for (let r = 0; r < rows; r++) cursor.push(MARGIN_X + ((r * 37) % 3) * 9);
  const mid = (rows - 1) / 2;
  const prints: WallPrint[] = [];

  for (const it of items) {
    const rand = rng(it.id);
    // fixed draw order — adding a draw would re-roll every wall
    const sizeU = rand();
    const yU = rand();
    const tiltU = rand();
    const gapU = rand();
    const holdU = rand();
    const tapeU = rand();
    const aspect = Math.min(3, Math.max(0.2, it.aspect || 1));
    const span = it.lead && rows >= 2 ? 2 : 1;

    const band = span * ROW_H + (span - 1) * ROW_GAP;
    const h = band * (span === 2 ? 0.9 + sizeU * 0.05 : 0.78 + sizeU * 0.15);
    const b = h * BORDER;
    const bb = b * BOTTOM;
    const w = (h - b - bb) * aspect + 2 * b;
    const hold: Hold = span === 2 ? 'tape2' : holdU < 0.52 ? 'tape' : holdU < 0.78 ? 'tape2' : 'pin';
    const maxTilt = span === 2 ? 1 : hold === 'pin' ? 3.4 : hold === 'tape' ? 2.2 : 1.2;

    // shortest row (for the lead: the pair of rows in the middle)
    let row = 0;
    if (span === 2) {
      row = Math.floor((rows - 2) / 2); // 3 rows: the top two, clear of the map
    } else {
      for (let r = 1; r < rows; r++) {
        const better = cursor[r] < cursor[row] - 0.5 || (Math.abs(cursor[r] - cursor[row]) <= 0.5 && Math.abs(r - mid) < Math.abs(row - mid));
        if (better) row = r;
      }
    }
    const x = span === 2 ? Math.max(cursor[row], cursor[row + 1]) : cursor[row];
    const y = rowTop(row) + (band - h) * yU;
    const gap = 16 + gapU * 16;
    for (let r = row; r < row + span; r++) cursor[r] = x + w + gap;

    prints.push({
      x: r2(x),
      y: r2(y),
      w: r2(w),
      h: r2(h),
      b: r2(b),
      bb: r2(bb),
      r: r2((tiltU * 2 - 1) * maxTilt),
      hold,
      tr: hold === 'pin' ? Math.floor(tapeU * 3) : r2((tapeU * 2 - 1) * 7),
      row,
      span,
    });
  }

  const right = prints.reduce((m, p) => Math.max(m, p.x + p.w), MARGIN_X);
  return {
    prints,
    width: r2(right + MARGIN_X),
    height: MARGIN_Y * 2 + rows * ROW_H + (rows - 1) * ROW_GAP,
    rows,
  };
}

/**
 * The wall for a whole gallery in display order (lead first), exactly as /asu
 * hangs it on the server — the share card (pages/og/art) reads a piece's tilt
 * and holder from here, so the card matches the wall.
 */
export function hangGallery(order: readonly { id: string; width: number; height: number }[], rows = wallRows(order.length)): WallLayout {
  return layoutWall(
    order.map((w, i) => ({ id: w.id, aspect: w.width && w.height ? w.width / w.height : 1, lead: i === 0 })),
    rows,
  );
}
