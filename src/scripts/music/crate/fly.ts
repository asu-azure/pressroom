/**
 * A case changing hands: from the crate into the hands (or back), as one eased move.
 *
 * The caller re-parents the case first with `attach` (which keeps where it is on screen), then
 * `fly` carries its local transform to the pose it should have under the new parent: position on
 * a gentle arc, rotation by slerp, scale. Runs on the stage's frame loop; resolves when it lands.
 */
import type { Object3D, Quaternion, Vector3 } from 'three';
import type { Stage } from './scene';

export interface Pose {
  position: Vector3;
  quaternion: Quaternion;
  scale: number;
}

const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function fly(
  stage: Stage,
  obj: Object3D,
  to: Pose,
  opts: { dur: number; arc?: number; onStep?: (e: number) => void },
): Promise<void> {
  const p0 = obj.position.clone();
  const q0 = obj.quaternion.clone();
  const s0 = obj.scale.x;
  const apply = (t: number) => {
    const e = inOut(t);
    obj.position.lerpVectors(p0, to.position, e);
    obj.position.y += Math.sin(Math.PI * e) * (opts.arc ?? 0);
    obj.quaternion.slerpQuaternions(q0, to.quaternion, e);
    obj.scale.setScalar(s0 + (to.scale - s0) * e);
    opts.onStep?.(e);
  };
  return new Promise((resolve) => {
    if (opts.dur <= 0) {
      apply(1);
      stage.kick();
      resolve();
      return;
    }
    let t = 0;
    const off = stage.add((dt) => {
      t = Math.min(1, t + dt / opts.dur);
      apply(t);
      if (t < 1) return true;
      off();
      resolve();
      return false;
    });
  });
}
