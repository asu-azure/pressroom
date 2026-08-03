/**
 * Bird-flock page transition — the shelf ↔ artist-page wipe.
 *
 * A full-viewport canvas paints an ink curtain with a chaotic, wobbling leading
 * edge; a few thousand birds stream across that edge, densest right at the
 * front. Leaving a page covers it and then navigates; arriving un-covers it, so
 * one continuous sweep spans the navigation.
 *
 * The handshake is a sessionStorage flag, because a real navigation tears down
 * all JS: the leaving page writes the direction, the arriving page reads it.
 * `Base.astro` carries a tiny inline head script that paints an ink layer
 * (`html.flock-cover`) BEFORE first paint when that flag is present — without
 * it the destination flashes its own hero before this module can mount.
 *
 * Performance: flocking is O(n). Neighbour queries would be O(n²), so instead
 * every bird deposits its velocity into a coarse grid once per frame and then
 * steers toward its own cell's average — emergent streaming, two linear passes.
 * All birds are stroked as ONE path per frame (one draw call).
 */

const FLAG = 'pr:flock';
const COVER_CLASS = 'flock-cover';
const COVER_MS = 850;
const REVEAL_MS = 1150;
const REDUCED_MS = 240;
/** Cell size for the velocity-averaging grid, in px. */
const CELL = 48;
const INK = '#0c0c0d';

interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ph: number; // wing-flap phase
  s: number; // wingspan
}

type Mode = 'cover' | 'reveal';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Organic wobble of the curtain's leading edge — cheap layered sines. */
function edgeOffset(y: number, t: number, amp: number): number {
  return (
    amp *
    (Math.sin(y * 0.013 + t * 3.1) * 0.5 +
      Math.sin(y * 0.031 - t * 2.2) * 0.3 +
      Math.sin(y * 0.007 + t * 1.3) * 0.2)
  );
}

function makeCanvas(): { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  Object.assign(cv.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    zIndex: '9998',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(cv);
  return { cv, ctx: cv.getContext('2d')! };
}

/**
 * Run one sweep. `dir` 1 = left→right, -1 = right→left. Resolves when the
 * animation finishes (cover: fully opaque; reveal: fully clear).
 */
function sweep(mode: Mode, dir: 1 | -1): Promise<void> {
  return new Promise((resolve) => {
    const { cv, ctx } = makeCanvas();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0;
    let H = 0;
    let cols = 0;
    let rows = 0;
    let sumX = new Float32Array(0);
    let sumY = new Float32Array(0);
    let count = new Float32Array(0);

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / CELL) + 1;
      rows = Math.ceil(H / CELL) + 1;
      sumX = new Float32Array(cols * rows);
      sumY = new Float32Array(cols * rows);
      count = new Float32Array(cols * rows);
    };
    resize();
    window.addEventListener('resize', resize);

    // "Thousands", scaled to the viewport so phones don't melt.
    const n = Math.round(Math.min(2400, Math.max(600, (W * H) / 700)));
    const birds: Bird[] = [];
    // Birds enter from behind the leading edge's start side and stream across.
    const startX = dir === 1 ? -W * 0.45 : W * 1.45;
    for (let i = 0; i < n; i++) {
      birds.push({
        x: startX + (Math.random() - 0.5) * W * 0.9,
        y: Math.random() * H,
        vx: dir * (2.6 + Math.random() * 3.4),
        vy: (Math.random() - 0.5) * 2.2,
        ph: Math.random() * Math.PI * 2,
        s: 3 + Math.random() * 5,
      });
    }

    const duration = mode === 'cover' ? COVER_MS : REVEAL_MS;
    const t0 = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      // Ease so the front accelerates away and settles (power2.inOut-ish).
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const secs = (now - t0) / 1000;

      // The front travels a little past the edges so nothing clips at the ends.
      const margin = W * 0.18;
      const front = -margin + e * (W + margin * 2);
      const fx = dir === 1 ? front : W - front;

      ctx.clearRect(0, 0, W, H);

      // --- ink curtain, wobbling front ---------------------------------------
      const amp = 46 * Math.sin(Math.PI * t) + 8; // widest mid-sweep
      ctx.fillStyle = INK;
      ctx.beginPath();
      const step = 18;
      if (mode === 'cover') {
        // Filled BEHIND the front (the side it came from).
        ctx.moveTo(dir === 1 ? 0 : W, 0);
        for (let y = 0; y <= H + step; y += step) {
          const x = fx + edgeOffset(y, secs, amp) * dir;
          ctx.lineTo(x, Math.min(y, H));
        }
        ctx.lineTo(dir === 1 ? 0 : W, H);
      } else {
        // Filled AHEAD of the front — the curtain retreats, uncovering.
        ctx.moveTo(dir === 1 ? W : 0, 0);
        for (let y = 0; y <= H + step; y += step) {
          const x = fx + edgeOffset(y, secs, amp) * dir;
          ctx.lineTo(x, Math.min(y, H));
        }
        ctx.lineTo(dir === 1 ? W : 0, H);
      }
      ctx.closePath();
      ctx.fill();

      // --- flocking ----------------------------------------------------------
      sumX.fill(0);
      sumY.fill(0);
      count.fill(0);
      for (const b of birds) {
        const ci = Math.min(cols - 1, Math.max(0, (b.x / CELL) | 0));
        const ri = Math.min(rows - 1, Math.max(0, (b.y / CELL) | 0));
        const k = ri * cols + ci;
        sumX[k] += b.vx;
        sumY[k] += b.vy;
        count[k] += 1;
      }

      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.25;
      ctx.lineCap = 'round';
      ctx.beginPath();

      for (const b of birds) {
        const ci = Math.min(cols - 1, Math.max(0, (b.x / CELL) | 0));
        const ri = Math.min(rows - 1, Math.max(0, (b.y / CELL) | 0));
        const k = ri * cols + ci;
        if (count[k] > 1) {
          // Align with the local average — this is what reads as a flock.
          const ax = sumX[k] / count[k];
          const ay = sumY[k] / count[k];
          b.vx += (ax - b.vx) * 0.06;
          b.vy += (ay - b.vy) * 0.06;
        }
        // Wind along the sweep, wander for chaos, and a gentle pull toward the
        // leading edge so the densest mass rides the front.
        b.vx += dir * 0.14 + (Math.random() - 0.5) * 0.5;
        b.vy += (Math.random() - 0.5) * 0.55 + Math.sin(b.y * 0.01 + secs * 2) * 0.05;
        b.vx += Math.sign(fx - b.x) * 0.05;

        const sp = Math.hypot(b.vx, b.vy);
        const max = 9;
        if (sp > max) {
          b.vx = (b.vx / sp) * max;
          b.vy = (b.vy / sp) * max;
        }
        b.x += b.vx;
        b.y += b.vy;
        if (b.y < -20) b.y = H + 20;
        else if (b.y > H + 20) b.y = -20;

        b.ph += 0.34;

        // Only draw birds over/near the covered region + a lead spill, so the
        // flock reads as belonging to the curtain rather than floating loose.
        const ahead = (b.x - fx) * dir;
        if (ahead > W * 0.22) continue;
        if (mode === 'cover' && ahead < -W * 0.9) continue;
        if (mode === 'reveal' && ahead < -W * 0.25) continue;

        // Seagull "V": tip forward, two wings swept back, flapping.
        const a = Math.atan2(b.vy, b.vx);
        const flap = 0.55 + 0.45 * Math.sin(b.ph);
        const span = b.s * (0.75 + 0.45 * flap);
        const wa = 2.35;
        ctx.moveTo(b.x + Math.cos(a + wa) * span, b.y + Math.sin(a + wa) * span);
        ctx.lineTo(b.x + Math.cos(a) * b.s * 0.45, b.y + Math.sin(a) * b.s * 0.45);
        ctx.lineTo(b.x + Math.cos(a - wa) * span, b.y + Math.sin(a - wa) * span);
      }
      ctx.stroke();

      if (t < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        if (mode === 'cover') {
          // Hold full cover so the navigation happens unseen.
          ctx.fillStyle = INK;
          ctx.fillRect(0, 0, W, H);
        } else {
          cleanup();
        }
        resolve();
      }
    };

    const cleanup = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      cv.remove();
    };

    // Paint the first frame synchronously: on reveal the canvas must already be
    // opaque before we drop the CSS cover, or a sliver of page flashes through.
    frame(t0);
    if (mode === 'reveal') document.documentElement.classList.remove(COVER_CLASS);
    raf = requestAnimationFrame(frame);
  });
}

/** Reduced-motion path: a plain ink fade, no birds. */
function fade(mode: Mode): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      inset: '0',
      background: INK,
      zIndex: '9998',
      pointerEvents: 'none',
      opacity: mode === 'cover' ? '0' : '1',
      transition: `opacity ${REDUCED_MS}ms linear`,
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
    if (mode === 'reveal') document.documentElement.classList.remove(COVER_CLASS);
    requestAnimationFrame(() => {
      el.style.opacity = mode === 'cover' ? '1' : '0';
    });
    setTimeout(() => {
      if (mode === 'reveal') el.remove();
      resolve();
    }, REDUCED_MS + 30);
  });
}

/** Cover the page with the flock, then navigate. */
export async function flockTo(href: string, dir: 1 | -1): Promise<void> {
  try {
    sessionStorage.setItem(FLAG, String(dir));
  } catch {
    /* private mode — the destination just won't play the reveal */
  }
  await (reducedMotion() ? fade('cover') : sweep('cover', dir));
  location.href = href;
}

/**
 * Wire up `[data-flock]` links and, when arriving through a sweep, play the
 * reveal. Safe to call on every page; does nothing without the flag or links.
 *
 * `data-flock="back"` reverses the direction, so returning to the shelf sweeps
 * the opposite way from the trip out.
 */
export function initFlock(): void {
  // --- arrival -------------------------------------------------------------
  let flag: string | null = null;
  try {
    flag = sessionStorage.getItem(FLAG);
    if (flag !== null) sessionStorage.removeItem(FLAG);
  } catch {
    /* ignore */
  }
  if (flag !== null) {
    const dir = flag === '-1' ? -1 : 1;
    void (reducedMotion() ? fade('reveal') : sweep('reveal', dir));
  } else {
    // Direct load: the inline head script may have left the cover up if a stale
    // flag was read; make sure nothing stays over the page.
    document.documentElement.classList.remove(COVER_CLASS);
  }

  // --- departure -----------------------------------------------------------
  // Delegated: the author card is rendered by a Svelte island that mounts later.
  document.addEventListener('click', (e) => {
    const me = e as MouseEvent;
    if (me.defaultPrevented || me.button !== 0 || me.metaKey || me.ctrlKey || me.shiftKey || me.altKey) return;
    const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[data-flock]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || a.target === '_blank') return;
    e.preventDefault();
    void flockTo(a.href, a.dataset.flock === 'back' ? -1 : 1);
  });
}
