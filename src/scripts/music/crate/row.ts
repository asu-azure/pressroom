/**
 * The cases standing in the crate, and the wave that runs along them under the pointer (wave.ts).
 *
 * The row runs along x, front case (slot 0, the newest song) at +x, each case facing +x and leaning
 * back on the one behind. The camera looks on from in front and above, turned so the row crosses
 * the screen: a horizontal sweep runs along it. The pointer is cast onto the upright plane through
 * the row to get its place `u`; the case under it rises (springs, so it bounces), its neighbours
 * part. Nothing runs once every case is still.
 */
import type { Group, Object3D, Vector3 } from 'three';
import { buildCrate, crateSize } from './crateBox';
import type { Pose } from './fly';
import { buildJewel, CASE, type Jewel, type JewelKit } from './jewel';
import type { Stage } from './scene';
import type { CrateSlot } from './types';
import { boost, leanAt, liftAt, settled, stepSprings } from './wave';

/** How far a case rises out of the crate under the pointer (cm). */
const LIFT = 7.2;
/** Resting lean against the case behind (rad). */
const REST_LEAN = 0.09;
/** The cases stand this far above the floor boards. */
const FOOT = 0.15;
/** A case that comes all the way up turns this far toward you (rad), to show its face. */
const PRESENT = 0.3;

export interface Row {
  readonly group: Group;
  readonly jewels: Jewel[];
  /** the slot under the pointer that has risen enough to be "the one" (or null) */
  readonly selected: number | null;
  /** Pointer at client coordinates; false if it is not over the crate. */
  pointer(x: number, y: number): boolean;
  /** The slot under client coordinates (nearest case), or null off the crate. */
  at(x: number, y: number): number | null;
  /** The pointer left (or a touch ended). */
  leave(): void;
  /** Lift one case as if pointed at (keyboard focus), or none. */
  focus(i: number | null): void;
  /** A tap on a case that cannot be opened: rock it. */
  rock(i: number): void;
  /** The case's slot node (its pose in the crate), for taking it out and putting it back. */
  slot(i: number): Object3D;
  /** Where a case sits under its slot node. */
  readonly home: Pose;
  /** Where on the stage (CSS px) the top of case i is. */
  topOf(i: number): { x: number; y: number };
  /** How far case i has risen (0..1+). */
  liftOf(i: number): number;
  /** Hold the crate still and dim (a case is out) or let it move again. */
  setAsleep(v: boolean): void;
  onChange: (() => void) | null;
}

export function createRow(stage: Stage, kit: JewelKit, slots: CrateSlot[]): Row {
  const { THREE } = kit;
  const n = slots.length;
  const size = crateSize(n);
  const group = new THREE.Group();
  group.add(buildCrate(THREE, n));
  stage.scene.add(group);

  const x0 = ((n - 1) / 2) * size.spacing;
  const slotX = (i: number) => x0 - i * size.spacing;

  const nodes: Group[] = [];
  const jewels = slots.map((s, i) => {
    const node = new THREE.Group();
    node.position.set(slotX(i), 0, 0);
    const j = buildJewel(kit, s.kind);
    j.root.position.set(0, CASE.h / 2 + FOOT, 0);
    j.root.rotation.y = Math.PI / 2;
    node.add(j.root);
    group.add(node);
    nodes.push(node);
    return j;
  });

  // springs: lift (0..1) and lean (rad) per case
  const lift = new Float32Array(n);
  const liftV = new Float32Array(n);
  const liftT = new Float32Array(n);
  const lean = new Float32Array(n).fill(REST_LEAN);
  const leanV = new Float32Array(n);
  const leanT = new Float32Array(n).fill(REST_LEAN);

  let uWant: number | null = null; // where the pointer is
  let u: number | null = null; // where the wave is (follows uWant quickly)
  let speed = 0;
  let selected: number | null = null;
  let asleep = false;

  // --- camera: in front and above, turned so the row crosses the screen ------------------
  const target = new THREE.Vector3(0, 7.5, 0);
  const corners: Vector3[] = [];
  for (const x of [-1, 1]) for (const y of [-1.2, 8.2 + 5 + LIFT + 1.5]) for (const z of [-1, 1])
    corners.push(new THREE.Vector3(x * (size.length / 2 + size.board), y, z * (size.width / 2 + size.board)));
  const frame = () => {
    const cam = stage.camera;
    const a = THREE.MathUtils.clamp((cam.aspect - 0.6) / 1.0, 0, 1);
    // narrow screens look further down the row, so the crate is compact; wide ones see it broadside
    const az = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(58, 34, a));
    const el = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(30, 24, a));
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    let d = 70;
    for (let k = 0; k < 4; k++) {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let m = 0;
      for (const c of corners) {
        const p = c.clone().project(cam);
        m = Math.max(m, Math.abs(p.x), Math.abs(p.y));
      }
      d *= m / 0.93;
    }
    cam.position.copy(target).addScaledVector(dir, d);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, dir.y, dir.z).normalize(), new THREE.Vector3(0, 8, 0));
  };
  const plane = new THREE.Plane();
  stage.onResize(frame);

  // --- pointer → u -----------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const host = stage.renderer.domElement;
  // each case's box in its slot's frame (face along +x, width along z), for picking
  const caseBox = new THREE.Box3(
    new THREE.Vector3(-CASE.d / 2 - 0.15, FOOT, -CASE.w / 2),
    new THREE.Vector3(CASE.d / 2 + 0.15, FOOT + CASE.h, CASE.w / 2),
  );
  const local = new THREE.Ray();
  const inv = new THREE.Matrix4();
  const box = new THREE.Box3();
  /** The nearest case the pointer is actually on (they are clear, so the ray meets several). */
  const pick = (): number | null => {
    let best: number | null = null;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      local.copy(ray.ray).applyMatrix4(inv.copy(nodes[i].matrixWorld).invert());
      // a risen case still owns the place it rose from, or it would drop away from the pointer
      // that raised it, be raised again, and flicker
      box.copy(caseBox);
      box.min.y -= nodes[i].position.y;
      if (!local.intersectBox(box, hit)) continue;
      const d = local.origin.distanceTo(hit); // slots are rigid: distances carry over
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  /** The pointer's place along the row, or null when it is not over the crate: the case it is
   *  on if any, else (above the cases, in the gaps) its place on the upright plane of the row. */
  const locate = (cx: number, cy: number): number | null => {
    const r = host.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
    const on = pick();
    if (on !== null) return on;
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    const inside = Math.abs(hit.x) < size.length / 2 + 2.5 && hit.y > -2 && hit.y < 8.2 + 5 + LIFT + 3;
    return inside ? THREE.MathUtils.clamp((x0 - hit.x) / size.spacing, -0.4, n - 0.6) : null;
  };
  const pointer = (cx: number, cy: number) => {
    if (asleep) return false;
    const at = locate(cx, cy);
    if (at === null) return leave(), false;
    uWant = at;
    stage.kick();
    return true;
  };
  const leave = () => {
    uWant = null;
    stage.kick();
  };

  // --- the frame -------------------------------------------------------------------------
  const tick = (dt: number) => {
    if (asleep) return false;
    // the wave follows the pointer quickly, but never jumps
    if (uWant === null) {
      u = null;
      speed = 0;
    } else if (u === null) u = uWant;
    else {
      const prev = u;
      u += (uWant - u) * (1 - Math.exp(-22 * dt));
      speed += ((u - prev) / Math.max(dt, 1e-3) - speed) * (1 - Math.exp(-10 * dt));
    }
    const amp = boost(speed);
    for (let i = 0; i < n; i++) {
      const h = slots[i].kind === 'blank' ? 0.72 : 1;
      liftT[i] = liftAt(i, u) * h * amp;
      leanT[i] = REST_LEAN * (1 - Math.min(1, liftAt(i, u))) + leanAt(i, u);
    }
    stepSprings(lift, liftV, liftT, dt);
    stepSprings(lean, leanV, leanT, dt, 140, 10);
    for (let i = 0; i < n; i++) {
      const l = Math.max(-0.02, lift[i]);
      nodes[i].position.y = l * LIFT;
      nodes[i].rotation.set(0, -PRESENT * Math.min(1, l) ** 2, lean[i], 'YXZ');
    }
    // "the one": nearest the pointer and well up
    let pick: number | null = null;
    if (u !== null) {
      const i = Math.round(u);
      if (i >= 0 && i < n && lift[i] > 0.55) pick = i;
    }
    if (pick !== selected) {
      selected = pick;
      row.onChange?.();
    } else if (selected !== null) row.onChange?.(); // the tag follows the bounce
    // a pointer resting on a case is not motion: stop once the wave has caught up and is still
    const caught = uWant === null || (u !== null && Math.abs(uWant - u) < 1e-3 && Math.abs(speed) < 1e-2);
    return !(caught && settled(lift, liftV, liftT) && settled(lean, leanV, leanT));
  };
  stage.add(tick);

  const top = new THREE.Vector3();
  const row: Row = {
    group,
    jewels,
    get selected() {
      return selected;
    },
    pointer,
    at(cx, cy) {
      const at = locate(cx, cy);
      return at === null ? null : THREE.MathUtils.clamp(Math.round(at), 0, n - 1);
    },
    leave,
    focus(i) {
      uWant = i;
      stage.kick();
    },
    rock(i) {
      leanV[i] += i === 0 ? -3.5 : 3.5;
      liftV[i] += 2.5;
      stage.kick();
    },
    slot: (i) => nodes[i],
    home: {
      position: new THREE.Vector3(0, CASE.h / 2 + FOOT, 0),
      quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)),
      scale: 1,
    },
    topOf(i) {
      top.set(0, CASE.h + FOOT + 0.5, 0);
      nodes[i].localToWorld(top);
      top.project(stage.camera);
      return { x: ((top.x + 1) / 2) * stage.size.w, y: ((1 - top.y) / 2) * stage.size.h };
    },
    liftOf: (i) => lift[i],
    setAsleep(v) {
      asleep = v;
      if (v) {
        uWant = null;
        u = null;
        selected = null;
      }
      row.onChange?.();
      stage.kick();
    },
    onChange: null,
  };
  return row;
}
