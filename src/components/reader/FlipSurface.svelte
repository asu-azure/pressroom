<script lang="ts">
  import { gsap } from 'gsap';
  import type { Sheet, Direction, FitMode, Character } from '../../lib/types';
  import SheetImage from './SheetImage.svelte';

  let {
    sheets,
    direction,
    fit,
    cur,
    pageNumberOf,
    onNavigate,
    translateOn = false,
    characters = [],
    highlightId = null,
    onHighlight,
  }: {
    sheets: Sheet[];
    direction: Direction;
    fit: FitMode;
    cur: number;
    pageNumberOf: (pageId: string) => number;
    onNavigate: (index: number) => void;
    translateOn?: boolean;
    characters?: Character[];
    highlightId?: string | null;
    onHighlight?: (id: string | null) => void;
  } = $props();

  // Direction sign: sheet i sits at x = i · width · s, so in RTL the story
  // runs to the left and "next" slides the track rightward.
  const s = $derived(direction === 'rtl' ? -1 : 1);

  let stage: HTMLElement;
  let track: HTMLElement;
  let width = $state(0);

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Only sheets near the current one are mounted — hundreds of pages stay cheap. */
  const mounted = $derived(
    sheets
      .map((sheet, index) => ({ sheet, index }))
      .filter(({ index }) => Math.abs(index - cur) <= 2),
  );

  const targetX = $derived(-cur * width * s);

  // Slide (or jump, reduced-motion) whenever the current sheet or size changes.
  $effect(() => {
    if (!track || !width) return;
    gsap.to(track, {
      x: targetX,
      duration: reduced ? 0 : 0.45,
      ease: 'power3.out',
      overwrite: 'auto',
    });
  });

  // --- Gestures: full touch control so nothing fights the transform ---
  // The CURRENT sheet is positioned by translate(tx,ty) scale(scale). At 1x this
  // also scrolls a too-tall page vertically; >1x it pans freely. touch-action is
  // `none` (see CSS) so the browser never scrolls/zooms underneath us — that was
  // what made pinch jump. Page turns use horizontal swipe or the ‹ / › buttons.
  const MAX_SCALE = 4;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  let pinching = $state(false);

  // Nav buttons: physical-left/right deltas & disabled state depend on direction.
  const leftDelta = $derived(direction === 'ltr' ? -1 : 1);
  const rightDelta = $derived(direction === 'ltr' ? 1 : -1);
  const atStart = $derived(cur <= 0);
  const atEnd = $derived(cur >= sheets.length - 1);
  const leftDisabled = $derived(leftDelta < 0 ? atStart : atEnd);
  const rightDisabled = $derived(rightDelta < 0 ? atStart : atEnd);

  // Per-sheet .fs__pages elements so we can measure the current one for bounds.
  let pagesEls: Record<number, HTMLElement | undefined> = {};

  // Every active pointer, keyed by id, so multi-touch never reads as a drag.
  const pointers = new Map<number, { x: number; y: number }>();

  // Single-finger gesture: 'pending' until the axis is known, then turn/pan/pany.
  type Gesture = 'none' | 'pending' | 'turn' | 'pan' | 'pany';
  let gesture: Gesture = 'none';
  let startX = 0;
  let startY = 0;
  let startT = 0;
  let baseTrackX = 0; // track x at the start of a turn drag
  let baseTx = 0;
  let baseTy = 0;

  // Pinch baselines (snapshot when the 2nd finger lands).
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let pinchBaseTx = 0;
  let pinchBaseTy = 0;
  let pinchStartMid = { x: 0, y: 0 };

  // GSAP proxy so settle/zoom tweens flow back into the reactive state.
  const zoomProxy = { scale: 1, tx: 0, ty: 0 };

  function bounds(): [number, number] {
    const far = -(sheets.length - 1) * width * s;
    return far < 0 ? [far, 0] : [0, far];
  }
  function stageHeight(): number {
    return stage?.clientHeight ?? 0;
  }
  // Layout size of the current page block (transform-independent).
  function contentSize(): { w: number; h: number } {
    const el = pagesEls[cur];
    return { w: el?.offsetWidth || width, h: el?.offsetHeight || stageHeight() };
  }
  // Half the overflow past the viewport on each axis at a given scale — this is
  // both the zoom-pan range and (at scale 1) the tall-page scroll range.
  function panRange(sc: number): { x: number; y: number } {
    const { w, h } = contentSize();
    return {
      x: Math.max(0, (w * sc - width) / 2),
      y: Math.max(0, (h * sc - stageHeight()) / 2),
    };
  }
  function clampPan() {
    const r = panRange(scale);
    tx = clamp(tx, -r.x, r.x);
    ty = clamp(ty, -r.y, r.y);
  }
  function twoPointers(): { x: number; y: number }[] {
    return [...pointers.values()].slice(0, 2);
  }
  function distMid(): { dist: number; mid: { x: number; y: number } } {
    const [a, b] = twoPointers();
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }
  // Anchor a scale change on a screen point so that point stays put (origin center).
  function anchoredTranslate(newScale: number, m: { x: number; y: number }) {
    const cx = width / 2;
    const cy = stageHeight() / 2;
    const ux = (m.x - cx - tx) / scale;
    const uy = (m.y - cy - ty) / scale;
    const r = panRange(newScale);
    return {
      tx: clamp(m.x - cx - newScale * ux, -r.x, r.x),
      ty: clamp(m.y - cy - newScale * uy, -r.y, r.y),
    };
  }
  function animateZoom(ns: number, nx: number, ny: number) {
    zoomProxy.scale = scale;
    zoomProxy.tx = tx;
    zoomProxy.ty = ty;
    gsap.to(zoomProxy, {
      scale: ns,
      tx: nx,
      ty: ny,
      duration: reduced ? 0 : 0.3,
      ease: 'power3.out',
      overwrite: 'auto',
      onUpdate: () => {
        scale = zoomProxy.scale;
        tx = zoomProxy.tx;
        ty = zoomProxy.ty;
      },
    });
  }
  function settleZoom() {
    pinching = false;
    const target = scale <= 1.02 ? 1 : scale;
    const r = panRange(target);
    // Snapping to 1x recentres horizontally but keeps vertical scroll position.
    animateZoom(target, clamp(tx, -r.x, r.x), clamp(ty, -r.y, r.y));
  }
  // Position a too-tall page at its top (origin is centre, so +range shows top).
  function showTop() {
    tx = 0;
    ty = panRange(1).y;
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Nav buttons own their own taps.
    if ((e.target as HTMLElement).closest('[data-nav]')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Second finger → pinch. Snapshot baselines; never turns the page.
    if (pointers.size >= 2) {
      gesture = 'none';
      pinching = true;
      gsap.killTweensOf(zoomProxy);
      gsap.killTweensOf(track);
      stage.setPointerCapture(e.pointerId);
      const { dist, mid } = distMid();
      pinchStartDist = dist || 1;
      pinchStartScale = scale;
      pinchBaseTx = tx;
      pinchBaseTy = ty;
      pinchStartMid = mid;
      return;
    }

    // Translation hotspot owns its tap (tooltip) instead of paging — 1x only.
    if (scale === 1 && (e.target as HTMLElement).closest('[data-bub]')) return;

    stage.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
    startT = performance.now();
    if (scale > 1) {
      gesture = 'pan';
      baseTx = tx;
      baseTy = ty;
    } else {
      // At 1x wait to see the axis: horizontal = turn, vertical = scroll tall page.
      gesture = 'pending';
      baseTrackX = Number(gsap.getProperty(track, 'x'));
      baseTy = ty;
      gsap.killTweensOf(track);
    }
  }

  function onPointerMove(e: PointerEvent) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;

    if (pointers.size >= 2) {
      const { dist, mid } = distMid();
      const ns = clamp(pinchStartScale * (dist / pinchStartDist), 1, MAX_SCALE);
      const cx = width / 2;
      const cy = stageHeight() / 2;
      // Content point under the initial midpoint, kept under it as fingers move.
      const u0x = (pinchStartMid.x - cx - pinchBaseTx) / pinchStartScale;
      const u0y = (pinchStartMid.y - cy - pinchBaseTy) / pinchStartScale;
      scale = ns;
      tx = mid.x - cx - ns * u0x;
      ty = mid.y - cy - ns * u0y;
      clampPan();
      return;
    }

    if (gesture === 'pan') {
      tx = baseTx + (e.clientX - startX);
      ty = baseTy + (e.clientY - startY);
      clampPan();
      return;
    }

    if (gesture === 'pending') {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.hypot(dx, dy) < 8) return; // wait for a decisive direction
      // Horizontal turns the page; vertical scrolls a tall page, else no-op
      // (so a stray vertical swipe on a page that fits can't flip it).
      if (Math.abs(dx) >= Math.abs(dy)) gesture = 'turn';
      else gesture = panRange(1).y > 0 ? 'pany' : 'none';
    }

    if (gesture === 'turn') {
      const dx = e.clientX - startX;
      const [min, max] = bounds();
      let x = baseTrackX + dx;
      if (x < min) x = min + (x - min) * 0.3; // rubber-band past the ends
      if (x > max) x = max + (x - max) * 0.3;
      gsap.set(track, { x });
    } else if (gesture === 'pany') {
      ty = baseTy + (e.clientY - startY);
      clampPan();
    }
  }

  function onPointerUp(e: PointerEvent) {
    const wasPinching = pointers.size >= 2;
    pointers.delete(e.pointerId);
    if (stage.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);

    if (wasPinching) {
      // Dropped below 2 fingers. Hand the remaining one to pan/scroll; never turn.
      if (pointers.size === 1) {
        const p = twoPointers()[0];
        startX = p.x;
        startY = p.y;
        baseTx = tx;
        baseTy = ty;
        gesture = scale > 1 ? 'pan' : panRange(1).y > 0 ? 'pany' : 'none';
      } else if (pointers.size === 0) {
        settleZoom();
      }
      return;
    }

    if (pointers.size > 0) return; // safety

    const g = gesture;
    gesture = 'none';

    if (g === 'pan' || g === 'pany') {
      settleZoom();
      return;
    }
    if (g === 'turn') {
      const dx = e.clientX - startX;
      const dt = Math.max(1, performance.now() - startT);
      const velocity = dx / dt; // px per ms
      // Passing 18% of the screen or a decisive fling advances one sheet.
      const commit = Math.abs(dx) > width * 0.18 || Math.abs(velocity) > 0.5;
      const delta = commit ? -Math.sign(dx * s) : 0;
      go(cur + delta, true);
      return;
    }
    if (g === 'pending') {
      // A tap, not a drag — page by screen half (physical side).
      const side = e.clientX < width / 2 ? -1 : 1;
      go(cur + side * s);
    }
  }

  // Desktop: ctrl/⌘ + wheel zooms at the cursor; plain wheel scrolls a tall/zoomed page.
  function onWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const ns = clamp(scale * Math.exp(-e.deltaY * 0.0015), 1, MAX_SCALE);
      const { tx: nx, ty: ny } = anchoredTranslate(ns, { x: e.clientX, y: e.clientY });
      scale = ns;
      tx = ns <= 1.001 ? 0 : nx;
      ty = ns <= 1.001 ? panRange(1).y : ny;
      if (ns <= 1.001) scale = 1;
      return;
    }
    const r = panRange(scale);
    if (r.y === 0) return;
    e.preventDefault();
    ty = clamp(ty - e.deltaY, -r.y, r.y);
  }

  // Wheel needs a non-passive listener to preventDefault the page scroll.
  $effect(() => {
    if (!stage) return;
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  });

  // Reset zoom + re-top the page whenever the current sheet changes.
  let prevCur = cur;
  $effect(() => {
    if (cur !== prevCur) {
      prevCur = cur;
      gsap.killTweensOf(zoomProxy);
      scale = 1;
      pinching = false;
      gesture = 'none';
      showTop();
    }
  });

  // Once the stage is measured, top-align the first page (covers tall openers).
  let toppedOnce = false;
  $effect(() => {
    if (!toppedOnce && width && pagesEls[cur]) {
      toppedOnce = true;
      showTop();
    }
  });

  function go(index: number, forceTween = false) {
    const clamped = Math.max(0, Math.min(sheets.length - 1, index));
    if (clamped !== cur) {
      onNavigate(clamped);
    } else if (forceTween) {
      // Snap back from a cancelled drag.
      gsap.to(track, { x: targetX, duration: reduced ? 0 : 0.35, ease: 'power3.out' });
    } else {
      gsap.to(track, { x: targetX, duration: 0.2, ease: 'power3.out' });
    }
  }
</script>

<div
  class="fs"
  role="region"
  aria-label="Manga pages — pinch to zoom, swipe or use the arrows to turn"
  bind:this={stage}
  bind:clientWidth={width}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
>
  <div class="fs__track" bind:this={track}>
    {#each mounted as { sheet, index } (sheet.pages[0].id)}
      <div
        class="fs__sheet"
        class:is-fit-width={fit === 'width'}
        style={`transform: translate3d(${index * 100 * s}%, 0, 0)`}
      >
        <div
          class="fs__pages"
          class:is-spread={sheet.kind === 'spread'}
          class:is-rtl={direction === 'rtl'}
          bind:this={pagesEls[index]}
          style={index === cur
            ? `transform: translate(${tx}px, ${ty}px) scale(${scale}); transform-origin: center center;`
            : undefined}
        >
          {#each sheet.pages as page (page.id)}
            <SheetImage
              {page}
              eager
              sizes={sheet.kind === 'spread' ? '50vw' : '100vw'}
              alt={`Page ${pageNumberOf(page.id)}`}
              {translateOn}
              {characters}
              {highlightId}
              {onHighlight}
            />
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <button
    class="fs__nav fs__nav--left"
    data-nav
    aria-label={leftDelta < 0 ? 'Previous page' : 'Next page'}
    disabled={leftDisabled}
    onclick={() => go(cur + leftDelta)}
  >‹</button>
  <button
    class="fs__nav fs__nav--right"
    data-nav
    aria-label={rightDelta < 0 ? 'Previous page' : 'Next page'}
    disabled={rightDisabled}
    onclick={() => go(cur + rightDelta)}
  >›</button>
</div>

<style>
  .fs {
    position: fixed;
    inset: 0;
    overflow: hidden;
    touch-action: none;
    cursor: grab;
  }
  .fs:active {
    cursor: grabbing;
  }
  .fs__track {
    position: absolute;
    inset: 0;
    will-change: transform;
  }
  .fs__sheet {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    /* Tall/zoomed pages spill past the sheet; the outer .fs (overflow:hidden)
       clips at the viewport and we move within via transform (ty). */
    overflow: visible;
    padding: calc(3.2rem + env(safe-area-inset-top)) clamp(0.4rem, 1.5vw, 1.5rem)
      calc(3rem + env(safe-area-inset-bottom));
  }
  .fs__pages {
    display: flex;
    justify-content: center;
    max-width: 100%;
  }
  /* Fit-height: .si carries the page aspect-ratio, so pinning the height
     resolves the width; max-width letterboxes oversized spreads (imgs are
     absolutely positioned with object-fit: contain). */
  .fs__pages :global(.si) {
    height: calc(100svh - 6.4rem);
    width: auto;
    max-width: 100%;
  }
  .fs__pages.is-spread :global(.si) {
    max-width: 50%;
  }
  .fs__pages.is-spread.is-rtl {
    flex-direction: row-reverse;
  }
  .is-fit-width .fs__pages :global(.si) {
    height: auto;
    width: min(100%, 62rem);
  }

  /* Phones / portrait: pinning the page height turned each page into a tall,
     unreadable stripe (esp. spreads at max-width:50%). Size by WIDTH instead so
     the full spread fits the screen width; tall pages scroll vertically. */
  @media (max-width: 700px), (orientation: portrait) {
    /* Give the flex container a definite width so the width-based .si sizing
       below resolves — without it the grid item shrink-wraps its (zero-
       intrinsic, absolutely-positioned) contents and the page collapses to
       black. Mirrors ScrollSurface's definite-width sheet. */
    .fs__pages {
      width: 100%;
    }
    .fs__pages :global(.si) {
      height: auto;
      width: 100%;
      max-width: 100%;
    }
    .fs__pages.is-spread :global(.si) {
      width: 50%;
      max-width: 50%;
      height: auto;
    }
  }

  /* Page-turn buttons — always available, incl. while zoomed. They sit outside
     the transformed page, so they never scale or drift with a pan. */
  .fs__nav {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    z-index: 6;
    width: clamp(2.4rem, 8vw, 3rem);
    height: clamp(2.4rem, 8vw, 3rem);
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--line-strong, rgba(255, 255, 255, 0.25));
    border-radius: 50%;
    background: color-mix(in srgb, var(--bg, #0c0c0d) 55%, transparent);
    color: var(--fg, #f4f1ea);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0.5;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    transition: opacity 0.2s var(--ease), background-color 0.2s var(--ease);
  }
  .fs__nav:hover {
    opacity: 1;
  }
  .fs__nav:disabled {
    opacity: 0.12;
    cursor: default;
    pointer-events: none;
  }
  .fs__nav--left {
    left: calc(0.6rem + env(safe-area-inset-left));
  }
  .fs__nav--right {
    right: calc(0.6rem + env(safe-area-inset-right));
  }
  @media (prefers-reduced-motion: reduce) {
    .fs__nav {
      transition: none;
    }
  }
</style>
