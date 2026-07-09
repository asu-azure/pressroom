<script lang="ts">
  import type { Sheet, Mode } from '../../lib/types';
  import NoteMargin from './NoteMargin.svelte';

  let {
    sheet,
    mode,
    pageNumberOf,
  }: {
    sheet: Sheet;
    mode: Mode;
    pageNumberOf: (pageId: string) => number;
  } = $props();
</script>

<!-- Auto-shown margin notes: no toggling, no closing — the rail simply
     appears with the sheet that carries a note and leaves with it.
     Desktop: right gutter with a leader line (same voice as scroll mode's
     inline gutter). Small screens: a slim strip above the progress bar.
     In scroll mode the ≥1150px gutter already renders inline, so the rail
     only serves the narrow layout there. -->
{#key sheet.pages[0].id}
  <aside class="rail" class:rail--flip={mode === 'flip'} class:rail--scroll={mode === 'scroll'}>
    <div class="rail__inner">
      <NoteMargin {sheet} {pageNumberOf} variant="gutter" />
    </div>
  </aside>
{/key}

<style>
  .rail {
    position: fixed;
    z-index: 45;
    pointer-events: none;
    animation: rail-in 0.45s var(--ease) both;
  }
  @keyframes rail-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .rail__inner {
    pointer-events: auto;
  }

  /* Desktop: right-edge gutter, vertically centred, leader pointing at the page */
  @media (min-width: 1150px) {
    .rail--flip {
      right: var(--pad);
      top: 50%;
      transform: translateY(-50%);
      width: 16rem;
    }
    .rail--flip .rail__inner {
      max-height: 70svh;
      overflow-y: auto;
      background: rgba(12, 12, 13, 0.82);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      padding: 1rem 1rem 1rem 1.6rem;
      border: 1px solid var(--line);
      border-left: 0;
    }
    /* scroll mode already has the inline gutter on desktop */
    .rail--scroll {
      display: none;
    }
  }

  /* Narrow: slim strip pinned above the bottom chrome */
  @media (max-width: 1149.98px) {
    .rail {
      left: 0;
      right: 0;
      bottom: calc(3.2rem + env(safe-area-inset-bottom));
      padding: 0 var(--pad);
    }
    .rail__inner {
      max-height: 26svh;
      overflow-y: auto;
      background: rgba(12, 12, 13, 0.88);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      border: 1px solid var(--line-strong);
      padding: 0.8rem 0.9rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rail {
      animation: none;
    }
  }
</style>
