/**
 * The shelf's books — physics for a CSS 3D book (WorkCard.svelte draws it).
 *
 * The book is a real box: front and back cover, spine, fore-edge, head and
 * tail, with its depth taken from the page count. This module only moves it:
 *
 *   - hover   : the book turns toward the pointer on a damped spring and lifts
 *               off the shelf; a gloss band slides across the laminate.
 *   - drag    : grab it and turn it over, the way you check the back of a book
 *               in a shop. Release keeps the spin (angular velocity) and friction
 *               settles it on the nearer cover, front or back.
 *   - click   : the front board swings open on its hinge (300 ms), then we
 *               navigate — via the Navigation API so the page wipe survives.
 *
 * The hit area never moves: the link and its stage stay put and only the box
 * inside them rotates (see "magnetic hover" in CLAUDE.md — targets that move are
 * harder to hit). Nothing runs at rest: the frame loop starts on input and stops
 * once the spring settles. Reduced motion gets the resting pose and a plain link.
 */

export interface BookOptions {
  /** Binding edge as seen on the front cover. Right = Japanese/Thai manga (RTL). */
  bindingRight: boolean;
  /** A link: the click swings the board open, then navigates here. */
  href?: string;
  /** Not a link (the /ost jewel case): click calls this instead, and the lid is
      driven from outside through the returned `setOpen()`. */
  onPress?: () => void;
  /** Called just before navigation (sound, analytics — nothing blocking). */
  onOpen?: () => void;
  /** Resting yaw toward the fore-edge, degrees. Default 34. */
  restYaw?: number;
  /** How far the board swings when open, degrees. Default 158. */
  openDeg?: number;
}

export interface BookHandle {
  destroy(): void;
  /** Open (1) or close (0) the board without navigating. */
  setOpen(v: number): void;
}

const REST_RY = 34; // deg, fore-edge toward the viewer so the book reads as a box
const REST_RX = 7; // looking slightly down onto the head
const TILT_Y = 16;
const TILT_X = 11;
const OPEN_DEG = 158;
const DRAG_THRESHOLD = 6; // px before a press becomes a drag

/** One damped spring (semi-implicit Euler). k and c are per second. */
class Spring {
  x: number;
  v = 0;
  target: number;
  constructor(
    x: number,
    public k = 170,
    public c = 19,
  ) {
    this.x = x;
    this.target = x;
  }
  step(dt: number) {
    const a = this.k * (this.target - this.x) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
  }
  get settled() {
    return Math.abs(this.v) < 0.02 && Math.abs(this.target - this.x) < 0.02;
  }
}

export function book(stage: HTMLElement, opts: BookOptions): BookHandle {
  const noop: BookHandle = { destroy() {}, setOpen() {} };
  const box = stage.querySelector<HTMLElement>('[data-book]');
  const link: HTMLElement | null = opts.href ? stage.closest('a') : stage;
  if (!box || !link) return noop;
  const OPEN = opts.openDeg ?? OPEN_DEG;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // The fore-edge turns toward the viewer, so the leaves show and the depth
  // reads as a page count: a right-hand binding yaws positive, a left one negative.
  const sign = opts.bindingRight ? 1 : -1;
  const rest = (opts.restYaw ?? REST_RY) * sign;

  let face = 0; // 0 = front cover facing out, 180 = back cover
  const ry = new Spring(rest);
  const rx = new Spring(REST_RX);
  const lift = new Spring(0, 220, 24);
  const open = new Spring(0, 260, 26);

  const render = () => {
    box.style.transform =
      `translate3d(0, ${(-lift.x * 10).toFixed(2)}px, ${(lift.x * 26).toFixed(2)}px) ` +
      `rotateX(${rx.x.toFixed(2)}deg) rotateY(${ry.x.toFixed(2)}deg)`;
    // Gloss band follows the yaw; the floor shadow shrinks as the book lifts.
    stage.style.setProperty('--sheen', `${(50 - (ry.x - face) * 2.4).toFixed(1)}%`);
    stage.style.setProperty('--lift', lift.x.toFixed(3));
    stage.style.setProperty('--open', `${(open.x * OPEN * sign).toFixed(2)}deg`);
    stage.style.setProperty('--opened', open.x.toFixed(3));
  };
  render();
  if (reduced) {
    return {
      destroy() {},
      setOpen(v) {
        open.x = open.target = v;
        render();
      },
    };
  }

  let raf = 0;
  let last = 0;
  const springs = [ry, rx, lift, open];
  const frame = (now: number) => {
    const dt = Math.min(1 / 30, (now - last) / 1000 || 1 / 60);
    last = now;
    if (!dragging) springs.forEach((s) => s.step(dt));
    else [rx, lift, open].forEach((s) => s.step(dt));
    render();
    raf = springs.every((s) => s.settled) && !dragging ? 0 : requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };

  // --- hover ----------------------------------------------------------------
  let hovering = false;
  const aim = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 2 - 1;
    const py = ((e.clientY - r.top) / r.height) * 2 - 1;
    ry.target = face + rest * 0.35 + px * TILT_Y;
    rx.target = REST_RX - py * TILT_X;
  };
  const settle = () => {
    ry.target = face + (hovering && fine ? rest * 0.35 : rest);
    rx.target = REST_RX;
    lift.target = hovering && fine ? 1 : 0;
    kick();
  };

  const onEnter = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    hovering = true;
    lift.target = 1;
    aim(e);
    kick();
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    hovering = false;
    if (!dragging) settle();
  };

  // --- drag to turn over ----------------------------------------------------
  let pressed = false;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startRy = 0;
  let lastX = 0;
  let lastT = 0;
  let vel = 0; // deg/s
  let suppressClick = false;

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    pressed = true;
    startX = lastX = e.clientX;
    startY = e.clientY;
    startRy = ry.x;
    lastT = performance.now();
    vel = 0;
  };
  const onMove = (e: PointerEvent) => {
    if (pressed && !dragging) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // Vertical intent on touch is a scroll: let the page have it.
      if (Math.abs(dy) > DRAG_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
        pressed = false;
        return;
      }
      if (Math.abs(dx) > DRAG_THRESHOLD) {
        dragging = true;
        suppressClick = true;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add('is-dragging');
        lift.target = 1;
        kick();
      }
    }
    if (dragging) {
      const now = performance.now();
      const deg = (e.clientX - startX) * 0.62;
      ry.x = startRy + deg;
      ry.v = 0;
      const dt = Math.max(1, now - lastT) / 1000;
      vel = vel * 0.6 + (((e.clientX - lastX) * 0.62) / dt) * 0.4;
      lastX = e.clientX;
      lastT = now;
      rx.target = REST_RX - ((e.clientY - startY) / stage.clientHeight) * 18;
      kick();
      return;
    }
    if (hovering) {
      aim(e);
      kick();
    }
  };
  const onUp = (e: PointerEvent) => {
    pressed = false;
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('is-dragging');
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    // Where would friction leave it? Land on whichever cover is nearer to that.
    const projected = ry.x + Math.max(-700, Math.min(700, vel)) * 0.08;
    face = Math.round((projected - rest) / 180) * 180;
    ry.v = vel;
    settle();
    ry.target = face + rest;
    // Let the next click through once this gesture's own click has been eaten.
    setTimeout(() => (suppressClick = false), 0);
  };

  // --- click to open -----------------------------------------------------
  let navigating = false;
  const onClick = (e: MouseEvent) => {
    if (suppressClick) {
      e.preventDefault();
      e.stopImmediatePropagation();
      suppressClick = false;
      return;
    }
    if (!opts.href) {
      opts.onPress?.();
      return;
    }
    // Let the browser handle new-tab / download gestures untouched.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (navigating) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    navigating = true;
    opts.onOpen?.();
    // The board swings open on its hinge, then we navigate. Through the
    // Navigation API where there is one: Chrome keeps the cross-document view
    // transition (the page wipe) for navigation.navigate() from a timer, but
    // skips it for location.assign() from a timer — verified in real Chrome.
    face = 0;
    ry.target = rest * 0.55;
    rx.target = REST_RX;
    lift.target = 1.2;
    open.target = 1;
    kick();
    const href = opts.href;
    setTimeout(() => {
      const nav = (window as unknown as { navigation?: { navigate(url: string): unknown } }).navigation;
      if (nav) nav.navigate(href);
      else window.location.assign(href);
    }, 300);
  };

  // Back/forward cache restores the page with the board still open.
  const onShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return;
    navigating = false;
    face = 0;
    hovering = false;
    open.x = open.target = 0;
    open.v = 0;
    settle();
  };

  stage.addEventListener('pointerenter', onEnter);
  stage.addEventListener('pointerleave', onLeave);
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  link.addEventListener('click', onClick, true);
  window.addEventListener('pageshow', onShow);

  return {
    setOpen(v: number) {
      open.target = v;
      if (v > 0) {
        face = 0;
        ry.target = rest * 0.55;
        rx.target = REST_RX;
      } else settle();
      kick();
    },
    destroy() {
      cancelAnimationFrame(raf);
      stage.removeEventListener('pointerenter', onEnter);
      stage.removeEventListener('pointerleave', onLeave);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
      link.removeEventListener('click', onClick, true);
      window.removeEventListener('pageshow', onShow);
    },
  };
}

/** Background CSS that shows region (x, y, w, h) of an image — fractions 0..1. */
export function region(url: string, x: number, y: number, w: number, h: number): string {
  const px = w < 1 ? (x / (1 - w)) * 100 : 0;
  const py = h < 1 ? (y / (1 - h)) * 100 : 0;
  return (
    `background-image:url(${url});` +
    `background-size:${100 / w}% ${100 / h}%;` +
    `background-position:${px}% ${py}%;`
  );
}
