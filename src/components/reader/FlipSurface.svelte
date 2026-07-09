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

  // --- Pointer drag: 1:1 tracking, velocity/threshold snap on release ---
  let dragging = false;
  let startX = 0;
  let startT = 0;
  let baseX = 0;

  function bounds(): [number, number] {
    const far = -(sheets.length - 1) * width * s;
    return far < 0 ? [far, 0] : [0, far];
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Let a translation hotspot own the gesture (hover/tap for its tooltip)
    // instead of turning the page.
    if ((e.target as HTMLElement).closest('[data-bub]')) return;
    dragging = true;
    startX = e.clientX;
    startT = performance.now();
    baseX = Number(gsap.getProperty(track, 'x'));
    gsap.killTweensOf(track);
    stage.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const [min, max] = bounds();
    let x = baseX + dx;
    if (x < min) x = min + (x - min) * 0.3; // rubber-band past the ends
    if (x > max) x = max + (x - max) * 0.3;
    gsap.set(track, { x });
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    const dx = e.clientX - startX;
    const dt = Math.max(1, performance.now() - startT);
    const velocity = dx / dt; // px per ms

    if (Math.abs(dx) < 6) {
      // A tap, not a drag — page by screen half (physical side).
      const side = e.clientX < width / 2 ? -1 : 1;
      go(cur + side * s);
      return;
    }
    // Passing 18% of the screen or a decisive fling advances one sheet.
    const commit = Math.abs(dx) > width * 0.18 || Math.abs(velocity) > 0.5;
    const delta = commit ? -Math.sign(dx * s) : 0;
    go(cur + delta, true);
  }

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
  aria-label="Manga pages — drag or tap to turn"
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
</style>
