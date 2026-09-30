/**
 * A charm on a ball chain — the soundtrack keychain's physics
 * (markup: lib/keychain.ts, styles: styles/keychain.css).
 *
 *   chain  a verlet rope (lib/rope.ts) pinned at the hook: 12 links, beads that
 *          swing, fold when slack and pull straight when taut.
 *   charm  a pendulum hanging from the jump ring at the rope's end. Gravity and
 *          the ring's own acceleration swing it, and it tugs the ring back a
 *          little, so chain and charm move as one thing.
 *   twist  the charm turning on its chain (rotateY), a torsion spring; past a
 *          half turn you see the back (the QR).
 *
 *   - hover : the pointer brushes it; its speed is the push.
 *   - drag  : hold the charm and the chain hangs from the hook to your hand —
 *             pull it taut, or bring it up and watch the chain go slack; a
 *             sideways flick spins it; letting go keeps the momentum.
 *   - scroll: a fast page scroll sets it swaying, like a keychain on a bag.
 *   - click : a click that was not a drag goes to `onPress`.
 *
 * The CSS lays out the resting pose; this only adds offsets, so the page is
 * right before (and without) any script. No frame loop at rest; reduced motion
 * hangs it still. Publishes --kc-hx / --kc-hy for the holographic film.
 */
import { makeRope, stepRope, ropeEnergy, type RopePoint } from '../lib/rope';

export interface DangleOptions {
  onPress?: (e: MouseEvent) => void;
}

export interface DangleHandle {
  destroy(): void;
  /** Give it a push: swing and twist, in degrees per second. */
  nudge(swing: number, twist?: number): void;
}

const LINKS = 12;
const DT = 1 / 120;
const DRAG_THRESHOLD = 5;
const RING_W = 0.15; // inverse mass of the ring: it carries the charm

export function dangle(stage: HTMLElement, opts: DangleOptions = {}): DangleHandle {
  const charm = stage.querySelector<HTMLElement>('[data-kc]');
  const beads = [...stage.querySelectorAll<HTMLElement>('.kc__bead')];
  const links = stage.querySelector<SVGPolylineElement>('[data-kc-links]');
  const noop: DangleHandle = { destroy() {}, nudge() {} };
  if (!charm) return noop;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- geometry from the resting layout -------------------------------------------
  let W = 0; // stage width
  let pivot0 = { x: 0, y: 0 }; // the ring's resting point
  let anchor = { x: 0, y: 0 }; // where the chain leaves the hook
  let link = 1;
  let ell = 1; // pivot → charm's centre of mass
  let g = 1;
  let rope: RopePoint[] = [];
  const beadRest: { x: number; y: number }[] = [];

  const measure = () => {
    W = stage.clientWidth;
    const prev = charm.style.transform;
    charm.style.transform = 'none';
    pivot0 = { x: charm.offsetLeft + charm.offsetWidth / 2, y: charm.offsetTop };
    charm.style.transform = prev;
    const chain = beads.length >= 2
      ? ((beads.at(-1)!.offsetTop - beads[0].offsetTop) * LINKS) / (beads.length - 1)
      : pivot0.y * 0.8;
    anchor = { x: pivot0.x, y: pivot0.y - chain };
    link = chain / LINKS;
    ell = charm.offsetHeight * 0.55;
    g = W * 9; // px/s² — scaled to the stage, so it swings alike at any size
    beadRest.length = 0;
    beads.forEach((b) => beadRest.push({ x: b.offsetLeft + b.offsetWidth / 2, y: b.offsetTop + b.offsetHeight / 2 }));
    rope = makeRope(anchor.x, anchor.y, LINKS, link, RING_W);
  };

  // --- state ------------------------------------------------------------------------
  let th = 0; // swing, rad (positive: the charm's bottom to the right)
  let om = 0; // rad/s
  let tw = 0; // twist, deg, about the resting face
  let twv = 0;
  let face = 0; // 0 front, 180 back
  let lastEnd = { x: 0, y: 0 };
  let lastEnd2 = { x: 0, y: 0 };

  const render = () => {
    const end = rope[LINKS];
    const twist = tw + face;
    charm.style.transform =
      `translate3d(${(end.x - pivot0.x).toFixed(2)}px, ${(end.y - pivot0.y).toFixed(2)}px, 0) ` +
      `rotateZ(${((-th * 180) / Math.PI).toFixed(2)}deg) rotateY(${twist.toFixed(2)}deg)`;
    for (let i = 0; i < beads.length; i++) {
      const p = rope[i + 1];
      const r = beadRest[i];
      if (p && r) beads[i].style.transform = `translate3d(${(p.x - r.x).toFixed(2)}px, ${(p.y - r.y).toFixed(2)}px, 0)`;
    }
    links?.setAttribute('points', rope.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
    stage.style.setProperty('--kc-hx', (50 + Math.sin((twist * Math.PI) / 180) * 45 + th * 60).toFixed(1));
    stage.style.setProperty('--kc-hy', (50 + th * 90).toFixed(1));
  };

  measure();
  lastEnd = lastEnd2 = { x: rope[LINKS].x, y: rope[LINKS].y };
  render();
  if (reduced) {
    stage.addEventListener('click', (e) => opts.onPress?.(e));
    return noop;
  }

  // --- simulation ----------------------------------------------------------------------
  let held = false;
  let hold = { x: 0, y: 0 };

  const step = () => {
    const end = rope[LINKS];
    if (held) {
      // the hand holds the ring's end; the chain can't be stretched past its length
      const dx = hold.x - anchor.x;
      const dy = hold.y - anchor.y;
      const d = Math.hypot(dx, dy);
      const max = link * LINKS * 1.01;
      const k = d > max ? max / d : 1;
      end.x = anchor.x + dx * k;
      end.y = anchor.y + dy * k;
    }
    stepRope(rope, link, g, DT);

    // the ring's acceleration drives the pendulum (and the charm tugs it back)
    const ax = (end.x - 2 * lastEnd.x + lastEnd2.x) / (DT * DT);
    const ay = (end.y - 2 * lastEnd.y + lastEnd2.y) / (DT * DT);
    lastEnd2 = lastEnd;
    lastEnd = { x: end.x, y: end.y };
    const acc = held
      ? -th * 60 - om * 10 // held in the hand: it stays upright
      : (-(g + ay) / ell) * Math.sin(th) - (ax / ell) * Math.cos(th) - om * 0.9;
    om += acc * DT;
    th += om * DT;
    th = Math.max(-1.35, Math.min(1.35, th));
    if (!held) end.px -= Math.cos(th) * acc * ell * DT * DT * 0.12;

    twv += (-22 * tw - 0.9 * twv) * DT;
    tw += twv * DT;
  };

  let raf = 0;
  let acc = 0;
  let last = 0;
  const frame = (now: number) => {
    acc += Math.min(0.05, (now - last) / 1000 || DT);
    last = now;
    let n = 0;
    while (acc >= DT && n < 6) {
      step();
      acc -= DT;
      n++;
    }
    render();
    const quiet = !held && ropeEnergy(rope) < 0.02 && Math.abs(om) < 0.01 && Math.abs(th) < 0.002 && Math.abs(twv) < 0.05 && Math.abs(tw) < 0.05;
    raf = quiet ? 0 : requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf) {
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(frame);
    }
  };

  // --- hover: brush it --------------------------------------------------------------
  let lastX = 0;
  let lastT = 0;
  const local = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onMove = (e: PointerEvent) => {
    const now = performance.now();
    const dt = Math.max(8, now - lastT);
    const vx = lastT ? ((e.clientX - lastX) / dt) * 1000 : 0; // px/s
    lastX = e.clientX;
    lastT = now;
    if (pressed) return drag(e, vx);
    if (e.pointerType !== 'mouse') return;
    const push = Math.max(-900, Math.min(900, vx));
    rope[LINKS].px -= push * DT * 0.02;
    om += push * 0.0012;
    twv += push * 0.03;
    kick();
  };
  const onLeave = () => (lastT = 0);

  // --- drag: hold it --------------------------------------------------------------------
  let pressed = false;
  let dragging = false;
  let start = { x: 0, y: 0 };
  let grab = { x: 0, y: 0 };
  let suppress = false;
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    pressed = true;
    dragging = false;
    start = { x: e.clientX, y: e.clientY };
    const p = local(e);
    const end = rope[LINKS];
    grab = { x: p.x - end.x, y: p.y - end.y };
  };
  function drag(e: PointerEvent, vx: number) {
    if (!dragging) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dy) > DRAG_THRESHOLD && Math.abs(dy) > Math.abs(dx) && e.pointerType !== 'mouse') {
        pressed = false; // a vertical touch move is the page scrolling
        return;
      }
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragging = true;
      held = true;
      suppress = true;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('is-dragging');
    }
    const p = local(e);
    hold = { x: p.x - grab.x, y: p.y - grab.y };
    twv += Math.max(-120, Math.min(120, vx * 0.05));
    kick();
  }
  const onUp = (e: PointerEvent) => {
    pressed = false;
    if (!dragging) return;
    dragging = false;
    held = false;
    stage.classList.remove('is-dragging');
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    // settle on whichever face the spin is nearer to
    const t = tw + face;
    face = Math.round(t / 180) * 180;
    tw = t - face;
    kick();
    setTimeout(() => (suppress = false), 0);
  };
  const onClick = (e: MouseEvent) => {
    if (suppress) {
      e.preventDefault();
      e.stopImmediatePropagation();
      suppress = false;
      return;
    }
    opts.onPress?.(e);
  };

  // --- scroll: sway like a keychain on a bag ---------------------------------------------
  const lenis = (window as unknown as { __lenis?: { on(ev: string, f: (l: { velocity: number }) => void): void } }).__lenis;
  let visible = true;
  const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
  io.observe(stage);
  lenis?.on('scroll', (l) => {
    if (!visible || Math.abs(l.velocity) < 2) return;
    om += Math.max(-0.6, Math.min(0.6, l.velocity * 0.012));
    kick();
  });

  // --- size ------------------------------------------------------------------------------
  const ro = new ResizeObserver(() => {
    if (Math.abs(stage.clientWidth - W) < 1) return;
    measure();
    lastEnd = lastEnd2 = { x: rope[LINKS].x, y: rope[LINKS].y };
    th = om = 0;
    render();
  });
  ro.observe(stage);

  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerleave', onLeave);
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('click', onClick, true);

  return {
    nudge(s: number, t = 0) {
      om += (s * Math.PI) / 180;
      twv += t;
      kick();
    },
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
      stage.removeEventListener('click', onClick, true);
    },
  };
}
