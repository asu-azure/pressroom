/**
 * The crate's wave, as plain numbers (no three, no DOM), so it can be tested.
 *
 * The pointer sits at a continuous place `u` along the row of cases (0 = the front case). Each case
 * wants to rise by a Gaussian of its distance from `u` — the one under the pointer all the way,
 * its neighbours a little — and to lean away from it, the way cases part when a finger runs along
 * a record bin. Every case follows its wants on an underdamped spring, so it overshoots and
 * bounces back: sweep across the row and the cases come up one after another, as a wave.
 */

export const WAVE = {
  /** width of the bump, in cases */
  sigma: 0.62,
  /** how far a neighbour leans away (rad) at most */
  lean: 0.16,
  /** spring stiffness and damping: underdamped, ~1 overshoot */
  k: 190,
  c: 12,
} as const;

/** How much case `i` wants to rise (0..1) with the pointer at `u` (null: nowhere near). */
export function liftAt(i: number, u: number | null, sigma: number = WAVE.sigma): number {
  if (u === null) return 0;
  const d = i - u;
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}

/** How far case `i` leans (rad, signed) away from the pointer at `u`. */
export function leanAt(i: number, u: number | null, lean: number = WAVE.lean): number {
  if (u === null) return 0;
  const d = i - u;
  return lean * Math.tanh(d / 0.7) * Math.exp(-Math.abs(d) / 2.4);
}

/**
 * A faster sweep makes a taller wave: `speed` is the pointer's speed along the row in cases per
 * second. 1 at rest, up to 1.45.
 */
export function boost(speed: number): number {
  return 1 + Math.min(0.45, Math.abs(speed) * 0.035);
}

/**
 * Step a set of springs toward their targets (semi-implicit Euler, in substeps of at most
 * 1/120 s so a long frame cannot blow it up).
 */
export function stepSprings(
  pos: Float32Array,
  vel: Float32Array,
  target: Float32Array,
  dt: number,
  k: number = WAVE.k,
  c: number = WAVE.c,
) {
  const n = Math.max(1, Math.ceil(dt * 120));
  const h = dt / n;
  for (let s = 0; s < n; s++) {
    for (let i = 0; i < pos.length; i++) {
      vel[i] += (k * (target[i] - pos[i]) - c * vel[i]) * h;
      pos[i] += vel[i] * h;
    }
  }
}

/** True once every spring is at its target and still — the frame loop can stop. */
export function settled(pos: Float32Array, vel: Float32Array, target: Float32Array, eps = 1e-3): boolean {
  for (let i = 0; i < pos.length; i++) {
    if (Math.abs(pos[i] - target[i]) > eps || Math.abs(vel[i]) > eps) return false;
  }
  return true;
}
