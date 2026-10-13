/**
 * The case you have pulled out of the crate, held in front of you: drag to turn it (it keeps a
 * little spin, then settles back to its resting tilt), tap to open the lid, and while the song
 * plays the disc turns. Twinkles run over its edges, and a dark veil drops between it and the
 * crate. Reduced motion: no sway, no twinkles, no spin, and the lid lands on its final angle.
 *
 * The case hangs from the camera (camera → mount → turn → shift → case), so the crate's framing
 * never moves it: `turn` takes the drag, `shift` keeps an open case (lid beside it) centred.
 *
 * Draw order: transparent things are drawn by renderOrder first. The crate's cases use 1–5, the
 * veil 10, and a case in the hands is lifted by HELD (21–25), so the veil covers the crate but
 * never the case in front of it.
 */
import type { Object3D } from 'three';
import { fly } from './fly';
import { CASE, sparkles, type Jewel, type JewelKit } from './jewel';
import type { Stage } from './scene';
import { veilTexture } from './textures';

/** Resting tilt: a little from above, a little from the right. */
const REST = { x: -0.24, y: 0.36 };
/** One turn every ~1.9 s at full speed (a CD spins much faster; this reads, that would blur). */
const SPIN = (Math.PI * 2) / 1.9;
/** The held case hangs this far in front of the camera, whatever the camera is looking at. */
export const HERO_DIST = 40;
/** renderOrder lift for the case in the hands. */
const HELD = 20;
/** How dark the veil over the crate gets. */
const VEIL = 0.8;

export interface Hero {
  readonly jewel: Jewel | null;
  readonly isOpen: boolean;
  /** How far the lid is open right now (0..1). */
  readonly openness: number;
  /** Take a case into the hands. If it is in the scene it flies in from where it is. */
  hold(j: Jewel): Promise<void>;
  /** Let go of the case (the caller re-parents it), and lift the veil. */
  release(): Jewel | null;
  setOpen(open: boolean): void;
  setSpinning(on: boolean): void;
  /** Called on a tap that was not a drag. */
  onTap: (() => void) | null;
  dispose(): void;
}

const lift = (root: Object3D, by: number) => root.traverse((o) => (o.renderOrder += by));

export function createHero(stage: Stage, kit: JewelKit, input: HTMLElement, reduced: boolean): Hero {
  const { THREE } = kit;
  const mount = new THREE.Group();
  const turn = new THREE.Group();
  const shift = new THREE.Group();
  mount.position.z = -HERO_DIST;
  mount.add(turn);
  turn.add(shift);
  stage.camera.add(mount);
  if (!stage.camera.parent) stage.scene.add(stage.camera);

  const twinkle = sparkles(kit);
  twinkle.visible = !reduced;
  twinkle.renderOrder = 5 + HELD;

  // the veil: a dark pane just behind the held case, covering the crate
  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x04060d, alphaMap: veilTexture(THREE), transparent: true, opacity: 0, depthWrite: false }),
  );
  veil.position.z = -(HERO_DIST + 8);
  veil.renderOrder = 10;
  veil.visible = false;
  stage.camera.add(veil);

  let jewel: Jewel | null = null;
  let open = false;
  let openCur = 0;
  let openVel = 0;
  let spinning = false;
  let spin = 0;
  let veilTarget = 0;
  const rot = { x: REST.x, y: REST.y };
  const vel = { x: 0, y: 0 };
  let dragging = false;
  let idle = 0;

  // the view at the case's distance; an open case is nearly twice as wide (the lid lies beside it)
  const vis = { w: 1, h: 1 };
  stage.onResize(() => {
    vis.h = 2 * HERO_DIST * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2));
    vis.w = vis.h * stage.camera.aspect;
    const d = HERO_DIST + 8;
    veil.scale.set((vis.w * d * 1.2) / HERO_DIST, (vis.h * d * 1.2) / HERO_DIST, 1);
    stage.kick();
  });
  // The open lid swings toward the camera on the turned case, so it looks bigger than its size:
  // fit an open case with room to spare. The case sits a little high, clear of the deck under it.
  const place = (o: number) => {
    turn.scale.setScalar(Math.min(1, (vis.w * 0.78) / (CASE.w * (1 + 1.15 * o)), (vis.h * (0.6 - 0.1 * o)) / CASE.h));
    shift.position.x = CASE.w * 0.46 * o;
    mount.position.y = vis.h * 0.06;
  };

  // --- input: drag turns, a tap opens ------------------------------------------------------
  let down: { id: number; x: number; y: number; t: number; lx: number; ly: number; lt: number; moved: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if (!jewel || e.button > 0) return;
    const now = performance.now();
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: now, lx: e.clientX, ly: e.clientY, lt: now, moved: 0 };
    try {
      input.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.lx;
    const dy = e.clientY - down.ly;
    const now = performance.now();
    const step = Math.max(8, now - down.lt) / 1000;
    down.lx = e.clientX;
    down.ly = e.clientY;
    down.lt = now;
    down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    if (down.moved < 6) return;
    dragging = true;
    const k = 0.0085;
    rot.y += dx * k;
    rot.x += dy * k;
    // the flick: how fast it was turning, capped so a jumpy pointer cannot send it spinning
    const cap = 9;
    vel.y = Math.max(-cap, Math.min(cap, (dx * k) / step));
    vel.x = Math.max(-cap, Math.min(cap, (dy * k) / step));
    idle = 0;
    stage.kick();
  };
  const onUp = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    const tap = down.moved < 6 && performance.now() - down.t < 450;
    down = null;
    dragging = false;
    if (tap && jewel) hero.onTap?.();
    stage.kick();
  };
  input.addEventListener('pointerdown', onDown);
  input.addEventListener('pointermove', onMove);
  input.addEventListener('pointerup', onUp);
  input.addEventListener('pointercancel', onUp);

  // --- the frame ----------------------------------------------------------------------------
  const tick = (dt: number, t: number) => {
    // the veil eases in and out whether or not a case is held (it lifts while one goes back)
    const m = veil.material;
    m.opacity += (veilTarget - m.opacity) * (reduced ? 1 : 1 - Math.exp(-6 * dt));
    if (Math.abs(veilTarget - m.opacity) < 0.003) m.opacity = veilTarget;
    veil.visible = m.opacity > 0;
    const veiling = m.opacity !== veilTarget;
    if (!jewel) return veiling;

    // the lid: a spring with a little overshoot, so it lands like a hinge
    const target = open ? 1 : 0;
    if (reduced) openCur = target;
    else {
      openVel += ((target - openCur) * 90 - openVel * 13) * dt;
      openCur += openVel * dt;
    }
    jewel.setOpen(Math.max(-0.04, Math.min(1.04, openCur)));
    place(Math.max(0, Math.min(1, openCur)));

    if (!dragging) {
      rot.x += vel.x * dt;
      rot.y += vel.y * dt;
      const damp = Math.exp(-3.2 * dt);
      vel.x *= damp;
      vel.y *= damp;
      idle += dt;
      if (idle > 1.2) {
        // home to the resting tilt (taking the short way round), with a slow sway
        const sway = reduced ? 0 : Math.sin(t * 0.5) * 0.09;
        const homeY = REST.y + sway + Math.round((rot.y - REST.y) / (Math.PI * 2)) * Math.PI * 2;
        const k = 1 - Math.exp(-1.6 * dt);
        rot.x += (REST.x + (reduced ? 0 : Math.cos(t * 0.37) * 0.04) - rot.x) * k;
        rot.y += (homeY - rot.y) * k;
      }
    }
    turn.rotation.set(rot.x, rot.y, 0);

    const want = spinning && !reduced ? SPIN : 0;
    spin += (want - spin) * (1 - Math.exp(-2.4 * dt));
    jewel.disc.rotation.z -= spin * dt;

    twinkle.material.uniforms.uTime.value = t;

    const settling =
      Math.abs(openCur - target) > 0.002 || Math.abs(openVel) > 0.002 || Math.hypot(vel.x, vel.y) > 0.002 || spin > 0.01;
    // with motion allowed the held case is alive (sway, twinkles); reduced motion stops at rest
    return dragging || settling || veiling || !reduced;
  };
  stage.add(tick);

  const hero: Hero = {
    get jewel() {
      return jewel;
    },
    get isOpen() {
      return open;
    },
    get openness() {
      return Math.max(0, Math.min(1, openCur));
    },
    onTap: null,
    hold(j) {
      jewel = j;
      open = false;
      openCur = 0;
      openVel = 0;
      spin = 0;
      rot.x = REST.x;
      rot.y = REST.y;
      vel.x = vel.y = 0;
      idle = 2;
      veilTarget = VEIL;
      // pose the hands first: `attach` keeps the case where it is relative to them
      turn.rotation.set(rot.x, rot.y, 0);
      place(0);
      stage.scene.updateMatrixWorld(true);
      j.setOpen(0);
      lift(j.root, HELD);
      const flying = Boolean(j.root.parent);
      shift.attach(j.root);
      j.root.add(twinkle);
      const home = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: 1 };
      return fly(stage, j.root, home, { dur: flying && !reduced ? 0.75 : 0, arc: 3 });
    },
    release() {
      const j = jewel;
      if (!j) return null;
      twinkle.removeFromParent();
      lift(j.root, -HELD);
      jewel = null;
      open = false;
      spinning = false;
      veilTarget = 0;
      stage.kick();
      return j;
    },
    setOpen(v) {
      open = v;
      stage.kick();
    },
    setSpinning(on) {
      spinning = on;
      stage.kick();
    },
    dispose() {
      input.removeEventListener('pointerdown', onDown);
      input.removeEventListener('pointermove', onMove);
      input.removeEventListener('pointerup', onUp);
      input.removeEventListener('pointercancel', onUp);
      twinkle.geometry.dispose();
      twinkle.material.dispose();
      veil.geometry.dispose();
      veil.material.alphaMap?.dispose();
      veil.material.dispose();
      stage.camera.remove(mount, veil);
    },
  };
  return hero;
}
