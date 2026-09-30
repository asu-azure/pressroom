/**
 * A hanging charm — the soundtrack keychain's physics (keychain.css draws it).
 *
 * Two damped oscillators about the ring:
 *   swing  rotateZ, a pendulum in the picture plane (gravity is the spring)
 *   twist  rotateY, the charm turning on its chain (the chain's torsion)
 * Both are lightly damped, so a nudge rings on for a few swings and settles.
 *
 *   - hover : the pointer brushes it; its horizontal speed is the push.
 *   - drag  : grab the charm and it hangs from your finger — the swing follows the
 *             pointer around the ring, a sideways flick spins it on the chain,
 *             and letting go keeps the momentum. Past a half turn you see the back
 *             (the QR, on the real thing).
 *   - scroll: a fast page scroll sets it swaying, like a keychain on a bag.
 *   - click : a click that was not a drag is handed to `onPress`.
 *
 * The hit area never moves; only the charm does. No frame loop at rest; reduced
 * motion hangs it still. Published to CSS on the stage: --kc-swing and
 * --kc-twist (deg), plus --kc-hx / --kc-hy (0–100, for the holographic foil).
 */

export interface DangleOptions {
  onPress?: (e: MouseEvent) => void;
}

export interface DangleHandle {
  destroy(): void;
  /** Give it a push, degrees per second. */
  nudge(swing: number, twist?: number): void;
}

class Osc {
  x = 0;
  v = 0;
  constructor(
    public k: number,
    public c: number,
  ) {}
  step(dt: number, target = 0) {
    this.v += (this.k * (target - this.x) - this.c * this.v) * dt;
    this.x += this.v * dt;
  }
  get quiet() {
    return Math.abs(this.v) < 0.05 && Math.abs(this.x) < 0.05;
  }
}

const DRAG_THRESHOLD = 5;

export function dangle(stage: HTMLElement, opts: DangleOptions = {}): DangleHandle {
  const charm = stage.querySelector<HTMLElement>('[data-kc]');
  const noop: DangleHandle = { destroy() {}, nudge() {} };
  if (!charm) return noop;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const swing = new Osc(38, 1.1); // ~1 s period, rings for a few swings
  const twist = new Osc(22, 0.9);
  let twistRest = 0; // 0 or 180: which face it settles on after a spin

  const render = () => {
    const s = swing.x;
    const t = twist.x + twistRest;
    stage.style.setProperty('--kc-swing', `${s.toFixed(2)}deg`);
    stage.style.setProperty('--kc-twist', `${t.toFixed(2)}deg`);
    // the foil catches the light as it turns and swings
    stage.style.setProperty('--kc-hx', (50 + Math.sin((t * Math.PI) / 180) * 45 + s * 1.4).toFixed(1));
    stage.style.setProperty('--kc-hy', (50 + s * 2.2).toFixed(1));
  };
  render();
  if (reduced) {
    stage.addEventListener('click', (e) => opts.onPress?.(e));
    return noop;
  }

  let raf = 0;
  let last = 0;
  let grabbed = false;
  let grabSwing = 0;
  const frame = (now: number) => {
    const dt = Math.min(1 / 30, (now - last) / 1000 || 1 / 60);
    last = now;
    if (grabbed) swing.step(dt * 3, grabSwing); // follow the finger, stiffly
    else swing.step(dt);
    twist.step(dt);
    render();
    raf = !grabbed && swing.quiet && twist.quiet ? 0 : requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };

  // --- hover: brush it --------------------------------------------------------
  let lastX = 0;
  let lastT = 0;
  const onMove = (e: PointerEvent) => {
    const now = performance.now();
    const dt = Math.max(8, now - lastT);
    const vx = lastT ? ((e.clientX - lastX) / dt) * 1000 : 0; // px/s
    lastX = e.clientX;
    lastT = now;
    if (pressed) return drag(e, vx);
    if (e.pointerType !== 'mouse') return;
    swing.v += Math.max(-40, Math.min(40, vx * 0.012));
    twist.v += Math.max(-60, Math.min(60, vx * 0.02));
    kick();
  };
  const onLeave = () => (lastT = 0);

  // --- drag: hang it from the finger -------------------------------------------
  let pressed = false;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let suppress = false;
  const pivot = () => {
    const r = stage.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top };
  };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    pressed = true;
    dragging = false;
    startX = e.clientX;
    startY = e.clientY;
  };
  function drag(e: PointerEvent, vx: number) {
    if (!dragging) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > DRAG_THRESHOLD && Math.abs(dy) > Math.abs(dx) && e.pointerType !== 'mouse') {
        pressed = false; // a vertical touch move is the page scrolling
        return;
      }
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragging = true;
      grabbed = true;
      suppress = true;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('is-dragging');
    }
    const p = pivot();
    const ang = (Math.atan2(e.clientX - p.x, Math.max(20, e.clientY - p.y)) * 180) / Math.PI;
    grabSwing = Math.max(-75, Math.min(75, -ang));
    twist.v += Math.max(-90, Math.min(90, vx * 0.05));
    kick();
  }
  const onUp = (e: PointerEvent) => {
    pressed = false;
    if (!dragging) return;
    dragging = false;
    grabbed = false;
    stage.classList.remove('is-dragging');
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    // settle on whichever face the spin is nearer to
    const t = twist.x + twistRest;
    const face = Math.round(t / 180) * 180;
    twistRest = face;
    twist.x = t - face;
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

  // --- scroll: sway like a keychain on a bag ----------------------------------------
  const lenis = (window as unknown as { __lenis?: { on(ev: string, f: (l: { velocity: number }) => void): void } }).__lenis;
  let visible = true;
  const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
  io.observe(stage);
  lenis?.on('scroll', (l) => {
    if (!visible || Math.abs(l.velocity) < 2) return;
    swing.v += Math.max(-25, Math.min(25, l.velocity * 0.35));
    kick();
  });

  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerleave', onLeave);
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('click', onClick, true);

  return {
    nudge(s: number, t = 0) {
      swing.v += s;
      twist.v += t;
      kick();
    },
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
      stage.removeEventListener('click', onClick, true);
    },
  };
}
