/**
 * The studio wall — /asu's gallery as prints taped and pinned to a big wall you
 * wander over (the GRID view is the old masonry, same buttons, other CSS).
 *
 * The server hangs every print (lib/wallLayout.ts → CSS vars per tile, in world
 * units scaled by the wall's height through `cqh`), so the wall is complete
 * before this runs. This only moves the camera: one transform on the world.
 *
 *   - Rows fill the wall's height, so at rest it only pans sideways and never
 *     traps page scrolling (touch: `pan-y`, so a vertical swipe scrolls the
 *     page and a horizontal one pans). Zoomed in, it pans both ways.
 *   - Drag pans with inertia and rubber-banded edges; a drag never opens a print.
 *   - Zoom: ctrl/⌘ + wheel or a trackpad pinch, two-finger pinch on touch,
 *     − ＋ FIT ALL, and the keyboard (arrows, + − 0).
 *   - A minimap shows where you are and jumps where you point.
 *   - Prints lift toward the pointer on hover and are pinned up one after
 *     another the first time the wall comes into view. They do NOT swing while
 *     the wall pans: that was 53 `rotate` transitions, which Chrome ran on the
 *     main thread — ~300 elements restyled every frame of a pan (17–56 ms each
 *     on an Intel UHD 610), and the pan stuttered. Measured, then removed.
 *   - Images: 320 px thumbs at rest; the 900 px size is asked for only for prints
 *     in view once a zoom settles.
 *
 * This is NOT the retired drag strip: that was one 400-rem row with no way to
 * see the whole. The wall is 2-D, ~2½ screens wide at rest, has FIT/ALL and a
 * map, and the GRID view is one tap away.
 *
 * No frame loop at rest. Reduced motion: no inertia, easing or entrance.
 */
import { layoutWall, wallRows, type WallItem, type WallLayout, type WallPrint } from '../lib/wallLayout';
import type { FlyRect } from './lightbox';

export type GalleryView = 'wall' | 'grid';
export const VIEW_KEY = 'pr:gallery';
const Z_MAX = 3.2;
const NARROW = 700;

interface Opts {
  reduced: boolean;
  onView?: (v: GalleryView) => void;
}

export function initWall(root: HTMLElement, { reduced, onView }: Opts) {
  const vp = root.querySelector<HTMLElement>('[data-wall-vp]')!;
  const world = root.querySelector<HTMLElement>('[data-wall-world]')!;
  const map = root.querySelector<HTMLElement>('[data-wall-map]');
  const mapView = root.querySelector<HTMLElement>('[data-wall-mapview]');
  const mapDots = root.querySelector<HTMLElement>('[data-wall-mapdots]');
  const ruler = root.querySelector<HTMLElement>('[data-wall-ruler]');
  const zoomRead = root.querySelector<HTMLElement>('[data-wall-zoom]');
  const tiles = [...world.querySelectorAll<HTMLElement>('[data-wall-id]')];
  const toggles = [...document.querySelectorAll<HTMLButtonElement>('[data-view-btn]')];
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const item = (t: HTMLElement): WallItem => ({
    id: t.dataset.wallId!,
    aspect: Number(t.dataset.aspect) || 1,
    lead: t.hasAttribute('data-lead'),
  });
  const place = new Map<HTMLElement, WallPrint>();

  let view: GalleryView = root.dataset.view === 'grid' ? 'grid' : 'wall';
  let layout: WallLayout = { prints: [], width: Number(world.dataset.ww) || 1, height: Number(world.dataset.wh) || 1, rows: Number(world.dataset.rows) || 1 };
  let vw = 1;
  let vh = 1;
  let u = 1; // px per world unit at z = 1
  let tx = 0;
  let ty = 0;
  let z = 1;
  let vx = 0;
  let vy = 0;
  let zoomTarget: { z: number; ax: number; ay: number } | null = null;
  let panTarget: { x: number; y: number } | null = null;
  let raf = 0;
  let last = 0;
  let settleTimer = 0;
  let warm = false; // prefetching neighbours is allowed (after the first look)

  // --- layout -------------------------------------------------------------------
  function hang(t: HTMLElement, p: WallPrint) {
    place.set(t, p);
    const s = t.style;
    s.setProperty('--px', String(p.x));
    s.setProperty('--py', String(p.y));
    s.setProperty('--pw', String(p.w));
    s.setProperty('--ph', String(p.h));
    s.setProperty('--pb', String(p.b));
    s.setProperty('--pbb', String(p.bb));
    s.setProperty('--pr', String(p.r));
    s.setProperty('--ptr', String(p.tr));
    t.dataset.hold = p.hold;
    if (p.hold === 'pin') t.dataset.pin = String(p.tr);
    else delete t.dataset.pin;
  }

  function relayout() {
    const shown = tiles.filter((t) => !t.hidden);
    const rows = wallRows(shown.length, vp.clientWidth < NARROW);
    layout = layoutWall(shown.map(item), rows);
    shown.forEach((t, i) => hang(t, layout.prints[i]));
    world.style.setProperty('--ww', String(layout.width));
    world.style.setProperty('--wh', String(layout.height));
    world.dataset.rows = String(rows);
    drawMap();
    measure();
    clamp();
    render();
    settle(true);
  }

  // What the server hung is kept unless the rows or the pieces shown differ.
  function adopt() {
    const shown = tiles.filter((t) => !t.hidden);
    const rows = wallRows(shown.length, vp.clientWidth < NARROW);
    if (rows !== layout.rows || shown.length !== tiles.length) return relayout();
    layout = layoutWall(shown.map(item), rows);
    shown.forEach((t, i) => place.set(t, layout.prints[i]));
    drawMap();
    measure();
    clamp();
    render();
    settle(true);
  }

  // --- camera -------------------------------------------------------------------
  function measure() {
    vw = vp.clientWidth || 1;
    vh = vp.clientHeight || 1;
    u = vh / layout.height;
  }
  const worldW = (zz = z) => layout.width * u * zz;
  const allZ = () => Math.min(1, vw / worldW(1));
  const zMin = () => Math.min(1, allZ()) * 0.96;
  function range(zz = z) {
    const W = worldW(zz);
    const H = vh * zz;
    const x: [number, number] = W <= vw ? [(vw - W) / 2, (vw - W) / 2] : [vw - W, 0];
    const y: [number, number] = H <= vh ? [(vh - H) / 2, (vh - H) / 2] : [vh - H, 0];
    return { x, y };
  }
  const within = (v: number, [a, b]: [number, number]) => Math.min(b, Math.max(a, v));
  function clamp() {
    const r = range();
    tx = within(tx, r.x);
    ty = within(ty, r.y);
  }
  /** zoom to nz keeping the wall point under (ax, ay) where it is */
  function zoomAt(nz: number, ax: number, ay: number) {
    nz = Math.min(Z_MAX, Math.max(zMin(), nz));
    const wx = (ax - tx) / z;
    const wy = (ay - ty) / z;
    z = nz;
    tx = ax - wx * z;
    ty = ay - wy * z;
    clamp();
  }

  let lastZoomShown = -1;
  function render() {
    world.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${z.toFixed(4)})`;
    if (ruler) {
      const s = u * z;
      ruler.style.backgroundSize = `${(10 * s).toFixed(2)}px 5px, ${(100 * s).toFixed(2)}px 11px`;
      ruler.style.backgroundPosition = `${tx.toFixed(1)}px 0, ${tx.toFixed(1)}px 0`;
    }
    if (map && mapView) {
      const m = map.clientWidth / worldW();
      const x0 = Math.max(0, -tx * m);
      const y0 = Math.max(0, -ty * m);
      const x1 = Math.min(map.clientWidth, (vw - tx) * m);
      const y1 = Math.min(map.clientHeight, (vh - ty) * m);
      mapView.style.transform = `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px)`;
      mapView.style.width = `${Math.max(4, x1 - x0).toFixed(1)}px`;
      mapView.style.height = `${Math.max(4, y1 - y0).toFixed(1)}px`;
    }
    if (zoomRead && Math.abs(z - lastZoomShown) > 0.004) {
      lastZoomShown = z;
      zoomRead.textContent = `×${z.toFixed(2)}`;
    }
    root.classList.toggle('is-zoomed', z > 1.02);
  }

  function drawMap() {
    if (!mapDots || !map) return;
    map.style.aspectRatio = `${layout.width} / ${layout.height}`;
    const frag = document.createDocumentFragment();
    for (const [t, p] of place) {
      if (t.hidden) continue;
      const d = document.createElement('i');
      d.style.cssText = `left:${(p.x / layout.width) * 100}%;top:${(p.y / layout.height) * 100}%;width:${(p.w / layout.width) * 100}%;height:${(p.h / layout.height) * 100}%`;
      frag.append(d);
    }
    mapDots.replaceChildren(frag);
  }

  // --- the frame loop (only while something moves) --------------------------------
  const ease = (x: number, t: number, rate: number, dt: number) => x + (t - x) * (1 - Math.exp(-rate * dt));
  function kick() {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
    world.style.willChange = 'transform';
  }
  function tick(now: number) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let moving = false;

    if (zoomTarget) {
      const nz = reduced ? zoomTarget.z : ease(z, zoomTarget.z, 16, dt);
      zoomAt(nz, zoomTarget.ax, zoomTarget.ay);
      if (Math.abs(z - zoomTarget.z) < 0.002 || z === zMin() || z === Z_MAX) {
        zoomAt(zoomTarget.z, zoomTarget.ax, zoomTarget.ay);
        zoomTarget = null;
      } else moving = true;
    }
    if (panTarget) {
      const r = range();
      const gx = within(panTarget.x, r.x);
      const gy = within(panTarget.y, r.y);
      tx = reduced ? gx : ease(tx, gx, 10, dt);
      ty = reduced ? gy : ease(ty, gy, 10, dt);
      if (Math.abs(tx - gx) < 0.5 && Math.abs(ty - gy) < 0.5) {
        tx = gx;
        ty = gy;
        panTarget = null;
      } else moving = true;
    }
    if (!drag && !pinch && !panTarget && !zoomTarget) {
      // inertia, then the edges pull back
      tx += vx * dt;
      ty += vy * dt;
      const f = Math.exp(-4.2 * dt);
      vx *= f;
      vy *= f;
      const r = range();
      const bx = within(tx, r.x);
      const by = within(ty, r.y);
      if (bx !== tx) {
        vx *= Math.exp(-18 * dt);
        tx = ease(tx, bx, 11, dt);
      }
      if (by !== ty) {
        vy *= Math.exp(-18 * dt);
        ty = ease(ty, by, 11, dt);
      }
      if (Math.hypot(vx, vy) > 6 || Math.abs(bx - tx) > 0.4 || Math.abs(by - ty) > 0.4) moving = true;
      else {
        tx = bx;
        ty = by;
        vx = vy = 0;
      }
    }
    if (drag || pinch) moving = true;
    render();
    if (moving) raf = requestAnimationFrame(tick);
    else settle();
  }

  // after a move: crisp raster, sharper images where zoomed, prefetch what's near
  function settle(now = false) {
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(
      () => {
        if (raf) return;
        world.style.willChange = '';
        if (view !== 'wall') return;
        const x0 = -tx / z / u;
        const x1 = (vw - tx) / z / u;
        const y0 = -ty / z / u;
        const y1 = (vh - ty) / z / u;
        const span = x1 - x0;
        for (const [t, p] of place) {
          if (t.hidden) continue;
          const img = t.querySelector('img');
          if (!img) continue;
          const near = p.x + p.w > x0 - span && p.x < x1 + span;
          if (warm && near && img.loading === 'lazy') {
            // fetch it, and decode it off-thread now, so the first pan onto it
            // doesn't pay for the decode in a frame (measured: two 50 ms frames)
            img.loading = 'eager';
            const decode = () => img.decode().catch(() => {});
            if (img.complete) decode();
            else img.addEventListener('load', decode, { once: true });
          }
          const seen = p.x + p.w > x0 && p.x < x1 && p.y + p.h > y0 && p.y < y1;
          if (seen) {
            const want = Math.ceil((p.w - 2 * p.b) * u * z);
            const had = parseInt(img.sizes, 10) || 0;
            if (want > had * 1.15) img.sizes = `${want}px`;
          }
        }
      },
      now ? 0 : 140,
    );
  }

  // --- pointer: drag to pan, pinch to zoom, hover to lift ---------------------------
  const pointers = new Map<number, { x: number; y: number }>();
  let drag = false;
  let pending: { id: number; x: number; y: number; tx: number; ty: number } | null = null;
  let pinch: { d: number; z: number; mx: number; my: number } | null = null;
  let samples: { t: number; x: number; y: number }[] = [];
  let swallowClick = false;

  const local = (e: { clientX: number; clientY: number }) => {
    const r = vp.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  // capture can throw for a pointer the browser already let go of
  const capture = (el: Element, id: number) => {
    try {
      el.setPointerCapture(id);
    } catch {
      /* gone */
    }
  };
  const onHud = (e: Event) => !!(e.target as Element | null)?.closest('[data-wall-hud]');

  vp.addEventListener('pointerdown', (e) => {
    if (view !== 'wall' || onHud(e) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    swallowClick = false;
    const p = local(e);
    pointers.set(e.pointerId, p);
    zoomTarget = null;
    panTarget = null;
    if (pointers.size === 1) {
      pending = { id: e.pointerId, x: p.x, y: p.y, tx, ty };
      vx = vy = 0;
      samples = [{ t: e.timeStamp, x: p.x, y: p.y }];
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      drag = false;
      pending = null;
      swallowClick = true;
      for (const id of pointers.keys()) capture(vp, id);
      kick();
    }
  });

  vp.addEventListener('pointermove', (e) => {
    if (view !== 'wall') return;
    if (!pointers.has(e.pointerId)) {
      if (fine && e.pointerType === 'mouse') tilt(e);
      return;
    }
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      tx += mx - pinch.mx;
      ty += my - pinch.my;
      pinch.mx = mx;
      pinch.my = my;
      zoomAt((pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, mx, my);
      kick();
      return;
    }
    if (pending && !drag) {
      const far = Math.hypot(p.x - pending.x, p.y - pending.y) > (e.pointerType === 'mouse' ? 5 : 8);
      if (!far) return;
      // a finger going mostly up or down is scrolling the page (pan-y) — until zoomed in
      if (e.pointerType === 'touch' && z <= 1.02 && Math.abs(p.y - pending.y) > Math.abs(p.x - pending.x)) {
        pending = null;
        return;
      }
      drag = true;
      swallowClick = true;
      capture(vp, e.pointerId);
      root.classList.add('is-grabbing');
      untilt();
      kick();
    }
    if (drag && pending) {
      const r = range();
      const band = (v: number, [a, b]: [number, number]) => (v > b ? b + (v - b) * 0.32 : v < a ? a + (v - a) * 0.32 : v);
      tx = band(pending.tx + p.x - pending.x, r.x);
      ty = band(pending.ty + p.y - pending.y, r.y);
      samples.push({ t: e.timeStamp, x: p.x, y: p.y });
      while (samples.length > 2 && e.timeStamp - samples[0].t > 100) samples.shift();
    }
  });

  function lift(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) {
        pinch = null;
        // the finger left behind carries on panning
        const rest = [...pointers.entries()][0];
        if (rest) {
          pending = { id: rest[0], x: rest[1].x, y: rest[1].y, tx, ty };
          drag = true;
          samples = [{ t: e.timeStamp, ...rest[1] }];
        }
      }
      kick();
      return;
    }
    if (pointers.size) return;
    if (drag) {
      const s0 = samples[0];
      const s1 = samples[samples.length - 1];
      const span = (s1.t - s0.t) / 1000;
      const fresh = e.timeStamp - s1.t < 100; // a pause before letting go means no throw
      vx = !reduced && fresh && span > 0.008 ? (s1.x - s0.x) / span : 0;
      vy = !reduced && fresh && span > 0.008 ? (s1.y - s0.y) / span : 0;
      const cap = 4200;
      vx = Math.max(-cap, Math.min(cap, vx));
      vy = Math.max(-cap, Math.min(cap, vy));
      kick();
    }
    drag = false;
    pending = null;
    root.classList.remove('is-grabbing');
  }
  vp.addEventListener('pointerup', lift);
  vp.addEventListener('pointercancel', lift);
  // a drag is never a click on the print it started on
  vp.addEventListener(
    'click',
    (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  world.addEventListener('dragstart', (e) => e.preventDefault());

  // hover: the print under a mouse tilts toward it (the hit area never moves —
  // only the paper inside the button does, see asu.astro)
  let hovered: HTMLElement | null = null;
  function tilt(e: PointerEvent) {
    if (reduced || drag) return;
    const t = (e.target as Element | null)?.closest<HTMLElement>('[data-wall-id]') ?? null;
    if (t !== hovered) untilt();
    hovered = t;
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--tx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    t.style.setProperty('--ty', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  }
  function untilt() {
    if (!hovered) return;
    hovered.style.removeProperty('--tx');
    hovered.style.removeProperty('--ty');
    hovered = null;
  }
  vp.addEventListener('pointerleave', untilt);

  // --- wheel: sideways pans, ctrl/⌘ (and trackpad pinch) zooms ------------------
  vp.addEventListener(
    'wheel',
    (e) => {
      if (view !== 'wall') return;
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const p = local(e);
        const base = zoomTarget ? zoomTarget.z : z;
        zoomTarget = { z: Math.min(Z_MAX, Math.max(zMin(), base * Math.exp(-e.deltaY * px * 0.0016))), ax: p.x, ay: p.y };
        panTarget = null;
        kick();
        return;
      }
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      if (Math.abs(dx) > Math.abs(e.deltaY) * 1.2 || (e.shiftKey && dx)) {
        e.preventDefault();
        e.stopPropagation();
        panTarget = null;
        vx = vy = 0;
        tx -= dx * px;
        clamp();
        kick();
      }
      // a vertical wheel scrolls the page, always
    },
    { passive: false },
  );

  // --- buttons, keys, map -------------------------------------------------------
  const centre = () => ({ x: vw / 2, y: vh / 2 });
  function zoomBy(k: number) {
    const c = centre();
    zoomTarget = { z: Math.min(Z_MAX, Math.max(zMin(), (zoomTarget?.z ?? z) * k)), ax: c.x, ay: c.y };
    panTarget = null;
    kick();
  }
  function zoomTo(nz: number) {
    const c = centre();
    zoomTarget = { z: nz, ax: c.x, ay: c.y };
    panTarget = null;
    kick();
  }
  root.querySelector('[data-wall-in]')?.addEventListener('click', () => zoomBy(1.4));
  root.querySelector('[data-wall-out]')?.addEventListener('click', () => zoomBy(1 / 1.4));
  root.querySelector('[data-wall-fit]')?.addEventListener('click', () => zoomTo(1));
  root.querySelector('[data-wall-all]')?.addEventListener('click', () => zoomTo(allZ()));

  vp.addEventListener('keydown', (e) => {
    if (view !== 'wall' || e.altKey || e.ctrlKey || e.metaKey) return;
    const step = vw * 0.22;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (moves[e.key]) {
      // up/down only mean something once zoomed in — otherwise leave the page scroll alone
      if (moves[e.key][1] && vh * z <= vh + 1) return;
      e.preventDefault();
      const base = panTarget ?? { x: tx, y: ty };
      panTarget = { x: base.x + moves[e.key][0], y: base.y + moves[e.key][1] };
      kick();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomBy(1.4);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomBy(1 / 1.4);
    } else if (e.key === '0') {
      e.preventDefault();
      zoomTo(1);
    }
  });

  // tabbing onto a print brings it into view
  vp.addEventListener('focusin', (e) => {
    if (view !== 'wall') return;
    const t = (e.target as Element | null)?.closest<HTMLElement>('[data-wall-id]');
    const p = t && place.get(t);
    if (!p) return;
    vp.scrollLeft = vp.scrollTop = 0; // overflow: clip can't scroll, but belt and braces
    const s = u * z;
    const l = tx + p.x * s;
    const r = tx + (p.x + p.w) * s;
    const top = ty + p.y * s;
    const bot = ty + (p.y + p.h) * s;
    const m = 40;
    if (l >= m && r <= vw - m && top >= 0 && bot <= vh) return;
    panTarget = { x: vw / 2 - (p.x + p.w / 2) * s, y: vh / 2 - (p.y + p.h / 2) * s };
    kick();
  });

  if (map) {
    let mapDrag = false;
    const jump = (e: PointerEvent, smooth: boolean) => {
      const r = map.getBoundingClientRect();
      const wx = ((e.clientX - r.left) / r.width) * layout.width * u * z;
      const wy = ((e.clientY - r.top) / r.height) * vh * z;
      const x = vw / 2 - wx;
      const y = vh / 2 - wy;
      if (smooth && !reduced) panTarget = { x, y };
      else {
        panTarget = null;
        tx = x;
        ty = y;
        clamp();
      }
      vx = vy = 0;
      kick();
    };
    map.addEventListener('pointerdown', (e) => {
      mapDrag = true;
      capture(map, e.pointerId);
      jump(e, true);
    });
    map.addEventListener('pointermove', (e) => mapDrag && e.buttons && jump(e, false));
    map.addEventListener('pointerup', () => (mapDrag = false));
  }

  // --- the first look: prints pinned up from the middle out ------------------------
  let pinned = reduced;
  if (!pinned && view === 'wall') root.classList.add('is-await');
  function pinUp() {
    pinned = true;
    const box = vp.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const seen = tiles
      .filter((t) => !t.hidden)
      .map((t) => ({ t, r: t.getBoundingClientRect() }))
      .filter(({ r }) => r.right > box.left && r.left < box.right)
      .sort((a, b) => Math.hypot(a.r.x + a.r.width / 2 - cx, a.r.y + a.r.height / 2 - cy) - Math.hypot(b.r.x + b.r.width / 2 - cx, b.r.y + b.r.height / 2 - cy));
    root.classList.remove('is-await');
    seen.forEach(({ t }, i) => {
      const delay = Math.min(i * 42, 900);
      t.querySelector('.asu__print')?.animate(
        [
          { opacity: 0, transform: 'translateY(-5%) rotate(9deg) scale(1.06)' },
          { opacity: 1, transform: 'translateY(0) rotate(-3deg) scale(1)', offset: 0.42 },
          { transform: 'rotate(1.2deg)', offset: 0.72 },
          { transform: 'none' },
        ],
        { duration: 820, delay, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' },
      );
      t.querySelector('.asu__hold')?.animate(
        [
          { opacity: 0, transform: 'scale(1.7)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { duration: 240, delay: delay + 250, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' },
      );
    });
  }
  const seenIO = new IntersectionObserver(
    (entries) => {
      if (!entries.some((en) => en.isIntersecting)) return;
      seenIO.disconnect();
      if (!pinned && view === 'wall') pinUp();
      else root.classList.remove('is-await');
      // Then, when the page is idle, fetch the prints a pan or two away. Not
      // before: at load it competed with the hero and the in-view prints (lazy
      // loading already fetches those) and cost the wall view ~200 ms of long
      // frames over the grid.
      const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
      idle(
        () => {
          warm = true;
          settle(true);
        },
        { timeout: 2500 },
      );
    },
    { threshold: 0.3 },
  );
  seenIO.observe(vp);

  // --- view switch ---------------------------------------------------------------
  function setView(v: GalleryView, persist: boolean) {
    view = v;
    root.dataset.view = v;
    for (const b of toggles) b.setAttribute('aria-pressed', String(b.dataset.viewBtn === v));
    if (persist) {
      try {
        localStorage.setItem(VIEW_KEY, v);
      } catch {
        /* private mode */
      }
    }
    for (const t of tiles) {
      const img = t.querySelector('img');
      if (!img) continue;
      if (v === 'grid') {
        img.dataset.wallSizes = img.sizes;
        img.sizes = img.dataset.gridSizes ?? img.sizes;
      } else if (img.dataset.wallSizes) img.sizes = img.dataset.wallSizes;
    }
    if (v === 'wall') {
      vp.tabIndex = 0;
      z = 1;
      tx = ty = 0;
      adopt();
    } else {
      vp.removeAttribute('tabindex');
      world.style.transform = '';
      root.classList.remove('is-await', 'is-zoomed');
    }
    if (persist) onView?.(v);
  }
  for (const b of toggles) {
    b.addEventListener('click', () => {
      const v = b.dataset.viewBtn === 'grid' ? 'grid' : 'wall';
      if (v === view) return;
      if (!reduced) vp.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' });
      setView(v, true);
    });
  }

  // --- size changes ----------------------------------------------------------------
  let lastW = 0;
  let lastH = 0;
  new ResizeObserver(() => {
    if (view !== 'wall') return;
    const w = vp.clientWidth;
    const h = vp.clientHeight;
    if (w === lastW && h === lastH) return;
    // keep the wall point in the middle where it is
    const cx = (vw / 2 - tx) / (u * z);
    const cy = (vh / 2 - ty) / (u * z);
    lastW = w;
    lastH = h;
    const rows = wallRows(tiles.filter((t) => !t.hidden).length, w < NARROW);
    if (rows !== layout.rows) relayout();
    measure();
    tx = vw / 2 - cx * u * z;
    ty = vh / 2 - cy * u * z;
    clamp();
    render();
  }).observe(vp);

  setView(view, false);

  return {
    /** re-hang after a filter changed which pieces are shown */
    relayout() {
      if (view === 'wall') {
        root.classList.add('is-relayout');
        relayout();
        window.setTimeout(() => root.classList.remove('is-relayout'), 700);
      }
    },
    /** where the picture of lightbox item i is on screen, for the lightbox's flight */
    originOf(i: number): FlyRect | null {
      const t = tiles.find((el) => el.dataset.lbOpen === String(i));
      const img = t?.querySelector('img');
      if (!t || t.hidden || !img?.complete || !img.naturalWidth) return null;
      const r = img.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const clip = view === 'wall' ? vp.getBoundingClientRect() : new DOMRect(0, 0, innerWidth, innerHeight);
      if (cx < clip.left || cx > clip.right || cy < clip.top || cy > clip.bottom) return null;
      const k = view === 'wall' ? z : 1;
      const rot = view === 'wall' ? (place.get(t)?.r ?? 0) : 0;
      return { cx, cy, w: img.offsetWidth * k, h: img.offsetHeight * k, rot, src: img.currentSrc || img.src };
    },
  };
}
