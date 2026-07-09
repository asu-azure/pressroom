<script lang="ts">
  import { onMount } from 'svelte';
  import type { Sheet, Direction, FitMode } from '../../lib/types';
  import SheetImage from './SheetImage.svelte';
  import NoteMargin from './NoteMargin.svelte';

  let {
    sheets,
    direction,
    fit,
    startIndex,
    pageNumberOf,
    onCurrent,
  }: {
    sheets: Sheet[];
    direction: Direction;
    fit: FitMode;
    startIndex: number;
    pageNumberOf: (pageId: string) => number;
    onCurrent: (index: number) => void;
  } = $props();

  let rows: HTMLElement[] = [];

  onMount(() => {
    let lenis: import('lenis').default | undefined;
    let raf = 0;

    // Smooth inertia on fine pointers; native touch scrolling is already silky.
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    (async () => {
      if (!fine || reduced) return;
      const { default: Lenis } = await import('lenis');
      lenis = new Lenis({
        duration: 1.05,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });
      const loop = (time: number) => {
        lenis!.raf(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();

    // The row nearest the viewport center is "current" (progress, notes, preload).
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onCurrent(Number((entry.target as HTMLElement).dataset.index));
          }
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    rows.forEach((r) => r && io.observe(r));

    // Resume where the reader left off.
    if (startIndex > 0) {
      rows[startIndex]?.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
    }

    return () => {
      io.disconnect();
      lenis?.destroy();
      cancelAnimationFrame(raf);
    };
  });
</script>

<div class="ss" class:ss--fit-height={fit === 'height'}>
  {#each sheets as sheet, i (sheet.pages[0].id)}
    <section class="ss__row" data-index={i} bind:this={rows[i]}>
      <div class="ss__sheet" class:is-spread={sheet.kind === 'spread'} class:is-rtl={direction === 'rtl'}>
        {#each sheet.pages as page (page.id)}
          <SheetImage
            {page}
            eager={i < 2}
            sizes={sheet.kind === 'spread' ? '(max-width: 760px) 50vw, 40vw' : '(max-width: 760px) 100vw, 62vw'}
            alt={`Page ${pageNumberOf(page.id)}`}
          />
        {/each}
      </div>
      <aside class="ss__gutter">
        <div class="ss__gutterInner">
          <NoteMargin {sheet} {pageNumberOf} variant="gutter" />
        </div>
      </aside>
    </section>
  {/each}
</div>

<style>
  .ss {
    display: grid;
    gap: clamp(0.6rem, 1.6vh, 1.4rem);
    padding: calc(3.4rem + env(safe-area-inset-top)) 0 5rem;
  }
  .ss__row {
    display: grid;
    grid-template-columns: 1fr;
    justify-items: center;
  }
  .ss__sheet {
    display: flex;
    justify-content: center;
    width: min(100%, 62rem);
  }
  .ss__sheet :global(.si) {
    flex: 0 1 auto;
    width: 100%;
  }
  .ss__sheet.is-spread :global(.si) {
    width: 50%;
  }
  /* Spread pages are in reading order; RTL puts the first one on the right. */
  .ss__sheet.is-spread.is-rtl {
    flex-direction: row-reverse;
  }
  /* Fit-height: .si carries the page aspect-ratio, so pinning the height
     resolves the width (max-width still guards narrow viewports). */
  .ss--fit-height .ss__sheet :global(.si) {
    height: calc(100svh - 6rem);
    width: auto;
    max-width: 100%;
  }
  .ss--fit-height .ss__sheet.is-spread :global(.si) {
    max-width: 50%;
  }
  .ss__gutter {
    display: none;
  }
  @media (min-width: 1150px) {
    .ss__row {
      grid-template-columns: minmax(0, 1fr) 17rem;
      gap: 2rem;
      padding-right: var(--pad);
    }
    .ss__gutter {
      display: block;
    }
    .ss__gutterInner {
      position: sticky;
      top: 5rem;
      padding-top: 1rem;
    }
  }
</style>
