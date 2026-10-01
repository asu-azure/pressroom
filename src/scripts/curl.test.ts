import { describe, it, expect } from 'vitest';
import { clipHalfPlane, reflectMatrix, reachable, fold, doorAngle, doorCommit, DOOR_MAX, COVER_MAX, landingPage, mirrored, type Pt } from './curl';

const apply = (m: number[], p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const close = (a: Pt, b: Pt) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('curl geometry', () => {
  const sq = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('clips a rectangle by a half-plane', () => {
    const left = clipHalfPlane(sq, { x: 4, y: 0 }, { x: 1, y: 0 });
    expect(Math.max(...left.map((p) => p.x))).toBeCloseTo(4);
    expect(left).toHaveLength(4);
    expect(clipHalfPlane(sq, { x: 20, y: 0 }, { x: 1, y: 0 })).toHaveLength(4);
    expect(clipHalfPlane(sq, { x: -1, y: 0 }, { x: 1, y: 0 })).toHaveLength(0);
  });

  it('reflects across a line (and is its own inverse)', () => {
    const m = reflectMatrix({ x: 5, y: 0 }, { x: 1, y: 0 }); // the line x = 5
    close(apply(m, { x: 10, y: 3 }), { x: 0, y: 3 });
    const d = reflectMatrix({ x: 2, y: 3 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 });
    const p = { x: 7, y: -1 };
    close(apply(d, apply(d, p)), p);
  });

  it('keeps the dragged corner within reach of the spine', () => {
    const q = reachable({ x: -50, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }, 10, 10);
    expect(Math.hypot(q.x, q.y)).toBeCloseTo(10);
  });

  it('maps the grabbed corner onto the finger', () => {
    // right-hand leaf, 10 × 14, free edge x = 10, bottom corner, dragged left
    const f = fold(10, 14, 10, 14, { x: 4, y: 12 });
    close(apply(f.matrix, { x: 10, y: 14 }), { x: 4, y: 12 });
    expect(f.front.length).toBeGreaterThanOrEqual(3);
    expect(f.folded.length).toBeGreaterThanOrEqual(3);
  });

  it('is flat at rest and fully over at the landing point', () => {
    expect(fold(10, 14, 10, 14, { x: 10, y: 14 }).folded).toHaveLength(0);
    const done = fold(10, 14, 10, 14, { x: -10, y: 14 });
    expect(done.progress).toBeCloseTo(1);
    expect(done.front.length).toBeLessThan(3); // nothing left lying flat
  });

  it('works mirrored for a left-hand (RTL) leaf', () => {
    const f = fold(10, 14, 0, 0, { x: 6, y: 1 });
    close(apply(f.matrix, { x: 0, y: 0 }), { x: 6, y: 1 });
  });
});

describe('door turn', () => {
  it('maps a drag across the page to the turning angle, clamped', () => {
    expect(doorAngle(0, 400)).toBe(0);
    expect(doorAngle(200, 400)).toBeCloseTo(DOOR_MAX / 2);
    expect(doorAngle(900, 400)).toBe(DOOR_MAX);
    expect(doorAngle(-50, 400)).toBe(0);
  });

  it('commits past 35° forward, short of the far side coming back, or on a fling', () => {
    expect(doorCommit(20, true, false)).toBe(false);
    expect(doorCommit(40, true, false)).toBe(true);
    expect(doorCommit(DOOR_MAX - 20, false, false)).toBe(false);
    expect(doorCommit(DOOR_MAX - 40, false, false)).toBe(true);
    expect(doorCommit(5, true, true)).toBe(true);
  });
});

describe('the cover turn (a door that lands)', () => {
  // an RTL book open on a 1000-wide stage: spine at 500, pages 340 wide
  const spread = [
    { x: 160, y: 40, w: 340, h: 480 }, // left page
    { x: 500, y: 40, w: 340, h: 480 }, // right page
  ];
  it('lands on the page across the spine, touching the hinge', () => {
    expect(landingPage(500, false, spread)).toBe(1); // RTL: hinge on the cover's right → the right page
    expect(landingPage(500, true, spread)).toBe(0); // LTR: hinge on its left → the left page
    expect(landingPage(500, false, [spread[0]])).toBe(-1); // nothing across the spine
  });

  it('turns the leaf into a box that, flipped about the hinge, lies on the page exactly', () => {
    // the closed RTL cover sits left of the spine, a little wider than a page
    const cover = { x: 148, y: 40, w: 352, h: 480 };
    const box = mirrored(spread[1], { leaf: cover, hingeLeft: false });
    expect(box).toEqual({ x: 500 - 340, y: 40, w: 340, h: 480 });
    // mirrored about x = 500 it covers 500…840 — the right page
    expect([2 * 500 - (box.x + box.w), 2 * 500 - box.x]).toEqual([spread[1].x, spread[1].x + spread[1].w]);
    const ltr = mirrored(spread[0], { leaf: { x: 500, y: 40, w: 352, h: 480 }, hingeLeft: true });
    expect(ltr.x).toBe(500);
  });

  it('turns a full 180° over one page width, and commits like a page', () => {
    expect(doorAngle(200, 400, COVER_MAX)).toBeCloseTo(90);
    expect(doorAngle(400, 400, COVER_MAX)).toBe(180);
    expect(doorCommit(COVER_MAX - 20, false, false, COVER_MAX)).toBe(false);
    expect(doorCommit(COVER_MAX - 40, false, false, COVER_MAX)).toBe(true);
  });
});
