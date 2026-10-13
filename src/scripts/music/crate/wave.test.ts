import { describe, expect, it } from 'vitest';
import { boost, leanAt, liftAt, settled, stepSprings } from './wave';

describe('the crate wave', () => {
  it('lifts the case under the pointer highest, its neighbours less, the far ones not at all', () => {
    const lifts = Array.from({ length: 10 }, (_, i) => liftAt(i, 4));
    expect(lifts[4]).toBe(1);
    expect(lifts[3]).toBeCloseTo(lifts[5]);
    expect(lifts[3]).toBeLessThan(0.5);
    expect(lifts[3]).toBeGreaterThan(lifts[2]);
    expect(lifts[0]).toBeLessThan(0.001);
  });

  it('lifts nothing with no pointer', () => {
    expect(liftAt(3, null)).toBe(0);
    expect(leanAt(3, null)).toBe(0);
  });

  it('parts the cases: neighbours lean away from the pointer on both sides', () => {
    expect(leanAt(4, 4)).toBe(0);
    expect(leanAt(5, 4)).toBeGreaterThan(0);
    expect(leanAt(3, 4)).toBeLessThan(0);
    expect(leanAt(5, 4)).toBeCloseTo(-leanAt(3, 4));
  });

  it('makes a taller wave for a faster sweep, within a cap', () => {
    expect(boost(0)).toBe(1);
    expect(boost(8)).toBeGreaterThan(boost(2));
    expect(boost(1000)).toBeCloseTo(1.45);
  });

  it('bounces: a spring overshoots its target, then settles on it', () => {
    const pos = new Float32Array([0]);
    const vel = new Float32Array([0]);
    const target = new Float32Array([1]);
    let peak = 0;
    for (let f = 0; f < 240; f++) {
      stepSprings(pos, vel, target, 1 / 60);
      peak = Math.max(peak, pos[0]);
    }
    expect(peak).toBeGreaterThan(1.02);
    expect(pos[0]).toBeCloseTo(1, 3);
    expect(settled(pos, vel, target)).toBe(true);
  });

  it('is not settled while moving, and survives a long frame', () => {
    const pos = new Float32Array([0, 0]);
    const vel = new Float32Array([0, 0]);
    const target = new Float32Array([1, 0]);
    stepSprings(pos, vel, target, 1 / 60);
    expect(settled(pos, vel, target)).toBe(false);
    stepSprings(pos, vel, target, 0.5); // a hitch: substeps keep it stable
    expect(Number.isFinite(pos[0])).toBe(true);
    expect(Math.abs(pos[0])).toBeLessThan(2);
  });
});
