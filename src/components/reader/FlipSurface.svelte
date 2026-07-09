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

  // --- Gestures: pinch-zoom + pan on the current sheet; drag/tap turns at 1x ---
  const MAX_SCALE = 4;
  const TAP_MS = 260; // double-tap window == deferred tap-turn delay (touch/pen)
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  // Zoom transform for the CURRENT sheet only (resets on page turn / remount).
  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  let pinching = $state(false);

  // Every active pointer, keyed by id, so multi-touch never reads as a drag.
  const pointers = new Map<number, { x: number; y: number }>();

  // Single-finger baselines: flip-drag at 1x, pan at >1x.
  let dragging = false;
  let panning = false;
  let startX = 0;
  let startY = 0;
  let startT = 0;
  let baseX = 0; // track x (flip) or tx (pan)
  let baseY = 0; // ty (pan)

  // Pinch baselines (snapshot when the 2nd finger lands).
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let pinchBaseTx = 0;
  let pinchBaseTy = 0;
  let pinchStartMid = { x: 0, y: 0 };

  // Double-tap detection + deferred single-tap turn (touch/pen).
  let lastTapT = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;
  function cancelPendingTap() {
    if (tapTimer) {
      clearTimeout(tapTimer);
      tapTimer = null;
    }
  }

  // GSAP proxy so settle/double-tap tweens flow back into the reactive state.
  const zoomProxy = { scale: 1, tx: 0, ty: 0 };

  function bounds(): [number, number] {
    const far = -(sheets.length - 1) * width * s;
    return far < 0 ? [far, 0] : [0, far];
  }

  function stageHeight(): number {
    return stage?.clientHeight ?? 0;
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
  function clampPan() {
    const maxX = ((scale - 1) * width) / 2;
    const maxY = ((scale - 1) * stageHeight()) / 2;
    tx = clamp(tx, -maxX, maxX);
    ty = clamp(ty, -maxY, maxY);
  }
  // Anchor a scale change at a screen point so that point stays put (origin center).
  function anchoredTranslate(newScale: number, m: { x: number; y: number }) {
    const cx = width / 2;
    const cy = stageHeight() / 2;
    const ux = (m.x - cx - tx) / scale;
    const uy = (m.y - cy - ty) / scale;
    const maxX = ((newScale - 1) * width) / 2;
    const maxY = ((newScale - 1) * stageHeight()) / 2;
    return {
      tx: clamp(m.x - cx - newScale * ux, -maxX, maxX),
      ty: clamp(m.y - cy - newScale * uy, -maxY, maxY),
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
    if (scale <= 1.02) {
      animateZoom(1, 0, 0);
    } else {
      const maxX = ((scale - 1) * width) / 2;
      const maxY = ((scale - 1) * stageHeight()) / 2;
      animateZoom(scale, clamp(tx, -maxX, maxX), clamp(ty, -maxY, maxY));
    }
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Second finger → pinch. Snapshot baselines; never turns the page.
    if (pointers.size >= 2) {
      dragging = false;
      panning = false;
      pinching = true;
      cancelPendingTap();
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

    // First finger. Double-tap to zoom (touch/pen only — a mouse double-click
    // should still page twice, and desktop doesn't need tap-zoom).
    if (e.pointerType !== 'mouse') {
      const now = performance.now();
      const isDouble =
        now - lastTapT < TAP_MS &&
        Math.abs(e.clientX - lastTapX) < 30 &&
        Math.abs(e.clientY - lastTapY) < 30;
      if (isDouble) {
        lastTapT = 0;
        cancelPendingTap();
        if (scale > 1) {
          animateZoom(1, 0, 0);
        } else {
          const target = 2.5;
          const { tx: nx, ty: ny } = anchoredTranslate(target, { x: e.clientX, y: e.clientY });
          animateZoom(target, nx, ny);
        }
        return;
      }
    }
    // Any fresh interaction supersedes a still-pending deferred tap-turn.
    cancelPendingTap();

    // Let a translation hotspot own the tap (its tooltip) instead of paging — 1x only.
    if (scale === 1 && (e.target as HTMLElement).closest('[data-bub]')) return;

    stage.setPointerCapture(e.pointerId);
    if (scale > 1) {
      panning = true;
      startX = e.clientX;
      startY = e.clientY;
      baseX = tx;
      baseY = ty;
    } else {
      dragging = true;
      startX = e.clientX;
      startT = now;
      baseX = Number(gsap.getProperty(track, 'x'));
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
      // Content point under the initial midpoint, kept fixed while fingers move (pan+zoom).
      const u0x = (pinchStartMid.x - cx - pinchBaseTx) / pinchStartScale;
      const u0y = (pinchStartMid.y - cy - pinchBaseTy) / pinchStartScale;
      scale = ns;
      tx = mid.x - cx - ns * u0x;
      ty = mid.y - cy - ns * u0y;
      clampPan();
      return;
    }

    if (panning) {
      tx = baseX + (e.clientX - startX);
      ty = baseY + (e.clientY - startY);
      clampPan();
      return;
    }

    if (dragging) {
      const dx = e.clientX - startX;
      const [min, max] = bounds();
      let x = baseX + dx;
      if (x < min) x = min + (x - min) * 0.3; // rubber-band past the ends
      if (x > max) x = max + (x - max) * 0.3;
      gsap.set(track, { x });
    }
  }

  function onPointerUp(e: PointerEvent) {
    const wasPinching = pointers.size >= 2;
    pointers.delete(e.pointerId);
    if (stage.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);

    if (wasPinching) {
      // Dropped below 2 fingers. Hand the remaining finger to panning; never turn.
      if (pointers.size === 1) {
        const p = twoPointers()[0];
        panning = scale > 1;
        dragging = false;
        startX = p.x;
        startY = p.y;
        baseX = tx;
        baseY = ty;
      } else if (pointers.size === 0) {
        settleZoom();
      }
      return;
    }

    if (pointers.size > 0) return; // safety

    if (panning) {
      panning = false;
      settleZoom();
      return;
    }

    if (!dragging) return;
    dragging = false;
    const dx = e.clientX - startX;
    const dt = Math.max(1, performance.now() - startT);
    const velocity = dx / dt; // px per ms

    if (Math.abs(dx) < 6) {
      // A tap, not a drag — page by screen half (physical side).
      const side = e.clientX < width / 2 ? -1 : 1;
      if (e.pointerType === 'mouse') {
        go(cur + side * s); // instant on desktop; a double-click pages twice
        return;
      }
      // Touch/pen: defer so a following tap can cancel this and zoom instead.
      lastTapT = performance.now();
      lastTapX = e.clientX;
      lastTapY = e.clientY;
      cancelPendingTap();
      tapTimer = setTimeout(() => {
        tapTimer = null;
        go(cur + side * s);
      }, TAP_MS);
      return;
    }
    // Passing 18% of the screen or a decisive fling advances one sheet.
    const commit = Math.abs(dx) > width * 0.18 || Math.abs(velocity) > 0.5;
    const delta = commit ? -Math.sign(dx * s) : 0;
    go(cur + delta, true);
  }

  // Reset zoom whenever the current sheet changes (turns only happen at 1x, but
  // this also covers programmatic navigation).
  let prevCur = cur;
  $effect(() => {
    if (cur !== prevCur) {
      prevCur = cur;
      gsap.killTweensOf(zoomProxy);
      scale = 1;
      tx = 0;
      ty = 0;
      pinching = false;
    }
  });

  // Don't let a deferred tap-turn fire after this surface is torn down.
  $effect(() => () => cancelPendingTap());

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
  aria-label="Manga pages — pinch to zoom, drag or tap to turn"
  bind:this={stage}
  bind:clientWidth={width}
  style={`touch-action: ${scale > 1 || pinching ? 'none' : 'pan-y'}`}
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
        class:is-zoomed={index === cur && scale > 1}
        style={`transform: translate3d(${index * 100 * s}%, 0, 0)`}
      >
        <div
          class="fs__pages"
          class:is-spread={sheet.kind === 'spread'}
          class:is-rtl={direction === 'rtl'}
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
</div>

<style>
  .fs {
    position: fixed;
    inset: 0;
    overflow: hidden;
    touch-action: pan-y;
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
    padding: calc(3.2rem + env(safe-area-inset-top)) clamp(0.4rem, 1.5vw, 1.5rem)
      calc(3rem + env(safe-area-inset-bottom));
  }
  .fs__sheet.is-fit-width {
    overflow-y: auto;
    place-items: start center;
  }
  .fs__pages {
    display: flex;
    justify-content: center;
    max-width: 100%;
    max-height: 100%;
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
    .fs__sheet:not(.is-fit-width) {
      overflow-y: auto;
      place-items: start center;
    }
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

  /* While zoomed, don't let the sheet clip or scroll the scaled page — the outer
     .fs (overflow:hidden) clips at the viewport and we pan within via transform.
     Placed after the media query so it wins at equal specificity on mobile too. */
  .fs__sheet.is-zoomed {
    overflow: visible;
    place-items: center;
  }
</style>
