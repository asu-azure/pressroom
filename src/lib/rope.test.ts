import { describe, it, expect } from 'vitest';
import { makeRope, stepRope, ropeEnergy } from './rope';

const lengths = (p: ReturnType<typeof makeRope>) =>
  p.slice(1).map((q, i) => Math.hypot(q.x - p[i].x, q.y - p[i].y));

describe('rope', () => {
  it('hangs straight and still from its pin', () => {
    const p = makeRope(100, 0, 10, 8, 0.2);
    for (let i = 0; i < 200; i++) stepRope(p, 8, 2000, 1 / 120);
    expect(p[0]).toMatchObject({ x: 100, y: 0 });
    expect(p[10].x).toBeCloseTo(100, 3);
    // a verlet chain stretches a hair under its own weight; within 3% is a chain
    expect(p[10].y).toBeGreaterThan(79);
    expect(p[10].y).toBeLessThan(82.4);
    expect(ropeEnergy(p)).toBeLessThan(0.01);
  });

  it('keeps its links at length while swinging', () => {
    const p = makeRope(0, 0, 12, 6, 0.2);
    p[12].px -= 20; // a sideways kick at the end
    for (let i = 0; i < 60; i++) stepRope(p, 6, 2000, 1 / 120);
    for (const l of lengths(p)) expect(l).toBeCloseTo(6, 0);
    expect(Math.abs(p[12].x)).toBeGreaterThan(1); // it is swinging
  });

  it('goes slack, not stiff, when both ends are held close together', () => {
    const p = makeRope(0, 0, 12, 6, 0.2);
    p[12].w = 0; // held, like the charm in a hand
    p[12].x = 20;
    p[12].y = 10;
    for (let i = 0; i < 120; i++) stepRope(p, 6, 2000, 1 / 120);
    // the middle sags below the straight line between the ends
    expect(p[6].y).toBeGreaterThan(20);
  });
});
