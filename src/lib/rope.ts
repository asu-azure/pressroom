/**
 * A verlet rope — the keychain's ball chain (scripts/dangle.ts draws it).
 *
 * Points carry their previous position; velocity is the difference. Each step
 * integrates gravity, then relaxes every link back to its rest length a few
 * times. Inverse mass decides who gives way: 0 = pinned (the hook, or the ring
 * while you hold the charm), small = heavy (the ring carrying the charm), 1 = a
 * bead. Links resist stretching but a chain can fold, so it goes slack when the
 * ends come together and taut when they are pulled apart. Pure — tested in
 * rope.test.ts.
 */
export interface RopePoint {
  x: number;
  y: number;
  px: number;
  py: number;
  /** inverse mass: 0 pinned, 1 a bead */
  w: number;
}

export function makeRope(x: number, y: number, n: number, link: number, endW: number): RopePoint[] {
  return Array.from({ length: n + 1 }, (_, i) => ({
    x,
    y: y + i * link,
    px: x,
    py: y + i * link,
    w: i === 0 ? 0 : i === n ? endW : 1,
  }));
}

/** One step: integrate, then satisfy the links `iterations` times. */
export function stepRope(p: RopePoint[], link: number, g: number, dt: number, damping = 0.985, iterations = 10) {
  for (const q of p) {
    if (q.w === 0) {
      q.px = q.x;
      q.py = q.y;
      continue;
    }
    const vx = (q.x - q.px) * damping;
    const vy = (q.y - q.py) * damping;
    q.px = q.x;
    q.py = q.y;
    q.x += vx;
    q.y += vy + g * dt * dt;
  }
  for (let k = 0; k < iterations; k++) {
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i];
      const b = p[i + 1];
      const w = a.w + b.w;
      if (w === 0) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const f = (d - link) / d / w;
      a.x += dx * f * a.w;
      a.y += dy * f * a.w;
      b.x -= dx * f * b.w;
      b.y -= dy * f * b.w;
    }
  }
}

/** Largest movement of any point in the last step — "is it still moving?" */
export function ropeEnergy(p: RopePoint[]): number {
  let m = 0;
  for (const q of p) m = Math.max(m, Math.abs(q.x - q.px), Math.abs(q.y - q.py));
  return m;
}
