import { describe, expect, it } from 'vitest';
import { layoutWall, wallRows, ROW_H, ROW_GAP, MARGIN_Y, type WallItem, type WallPrint } from './wallLayout';

// the aspects of the real gallery (0.36 to 1.52) and then some
const ASPECTS = [0.7, 0.8, 1.44, 1.27, 1.02, 0.67, 0.36, 1.52, 0.95, 1.21, 0.62, 2.4, 0.25];
const make = (n: number, lead = true): WallItem[] =>
  Array.from({ length: n }, (_, i) => ({ id: `art-${i}-${(i * 7919) % 104729}`, aspect: ASPECTS[i % ASPECTS.length], lead: lead && i === 0 }));

/** The axis-aligned box of a print once tilted about its top centre (as the CSS does). */
function bounds(p: WallPrint) {
  const a = (Math.abs(p.r) * Math.PI) / 180;
  const cx = p.x + p.w / 2;
  const hw = (p.w / 2) * Math.cos(a) + p.h * Math.sin(a);
  return { l: cx - hw, r: cx + hw, t: p.y - (p.w / 2) * Math.sin(a), b: p.y + p.h * Math.cos(a) + (p.w / 2) * Math.sin(a) };
}

describe('wallRows', () => {
  it('grows slowly with the collection and adds a row on narrow screens', () => {
    expect(wallRows(53)).toBe(3);
    expect(wallRows(53, true)).toBe(4);
    expect(wallRows(5)).toBe(2);
    expect(wallRows(400)).toBe(5);
  });
});

describe('layoutWall', () => {
  it('is deterministic', () => {
    expect(layoutWall(make(53), 3)).toEqual(layoutWall(make(53), 3));
  });

  it('never moves the old prints when a new piece is added at the end', () => {
    const a = layoutWall(make(40), 3).prints;
    const b = layoutWall(make(41), 3).prints.slice(0, 40);
    expect(b).toEqual(a);
  });

  it('never overlaps two prints, tilt included, at any size or row count', () => {
    for (const rows of [2, 3, 4, 5]) {
      for (const n of [1, 2, 7, 20, 53, 90]) {
        const { prints, width, height } = layoutWall(make(n), rows);
        expect(prints).toHaveLength(n);
        const boxes = prints.map(bounds);
        for (let i = 0; i < boxes.length; i++) {
          const p = boxes[i];
          expect(p.l).toBeGreaterThan(0);
          expect(p.r).toBeLessThan(width);
          expect(p.t).toBeGreaterThan(0);
          expect(p.b).toBeLessThan(height);
          for (let j = i + 1; j < boxes.length; j++) {
            const q = boxes[j];
            const apart = p.r <= q.l || q.r <= p.l || p.b <= q.t || q.b <= p.t;
            if (!apart) throw new Error(`prints ${i} and ${j} overlap (rows ${rows}, n ${n})`);
          }
        }
      }
    }
  });

  it('keeps every print inside its row band', () => {
    const { prints } = layoutWall(make(53), 3);
    for (const p of prints) {
      const top = MARGIN_Y + p.row * (ROW_H + ROW_GAP);
      const band = p.span * ROW_H + (p.span - 1) * ROW_GAP;
      expect(p.y).toBeGreaterThanOrEqual(top - 0.01);
      expect(p.y + p.h).toBeLessThanOrEqual(top + band + 0.01);
    }
  });

  it('makes the lead piece span two rows in the middle, taped at both corners', () => {
    const lead = layoutWall(make(53), 4).prints[0];
    expect(lead.span).toBe(2);
    expect(lead.row).toBe(1);
    expect(lead.h).toBeGreaterThan(ROW_H + ROW_GAP);
    expect(lead.hold).toBe('tape2');
    // with a single row there is nothing to span
    expect(layoutWall(make(3), 1).prints[0].span).toBe(1);
  });

  it('keeps the gallery order readable left to right', () => {
    const { prints } = layoutWall(make(53, false), 3);
    for (let i = 3; i < prints.length; i++) expect(prints[i].x).toBeGreaterThan(prints[i - 3].x);
  });

  it('keeps each artwork at its own aspect inside the paper border', () => {
    const items = make(13, false);
    const { prints } = layoutWall(items, 2);
    prints.forEach((p, i) => {
      const img = (p.w - 2 * p.b) / (p.h - p.b - p.bb);
      expect(img).toBeCloseTo(Math.min(3, Math.max(0.2, items[i].aspect)), 1);
    });
  });
});
