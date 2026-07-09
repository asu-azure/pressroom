<script lang="ts">
  import type { Work, ReaderSettings, Sheet } from '../../lib/types';
  import NoteMargin from './NoteMargin.svelte';

  let {
    work,
    settings,
    cur,
    total,
    currentSheet,
    hasNote,
    pageNumberOf,
    onSettings,
  }: {
    work: Work;
    settings: ReaderSettings;
    cur: number;
    total: number;
    currentSheet: Sheet | null;
    hasNote: boolean;
    pageNumberOf: (pageId: string) => number;
    onSettings: (patch: Partial<ReaderSettings>) => void;
  } = $props();

  let panelOpen = $state(false);
  let noteOpen = $state(false);

  export function togglePanel() {
    panelOpen = !panelOpen;
  }

  // Close the mobile note sheet when moving to a sheet without a note.
  $effect(() => {
    if (!hasNote) noteOpen = false;
  });

  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }
</script>

<header class="rc-top">
  <a class="mono rc-top__back" href="/" data-hover>← LIBRARY</a>
  <span class="mono rc-top__title">{work.title}</span>
  <div class="rc-top__actions">
    {#if hasNote}
      <button class="mono rc-btn rc-btn--note" onclick={() => (noteOpen = !noteOpen)}>
        ✳ NOTE
      </button>
    {/if}
    <button class="mono rc-btn" onclick={fullscreen} title="Fullscreen (f)">⛶</button>
    <button
      class="mono rc-btn"
      class:is-active={panelOpen}
      onclick={() => (panelOpen = !panelOpen)}
      title="Settings (s)"
    >AA</button>
  </div>
</header>

<footer class="rc-bottom">
  <span class="mono rc-bottom__counter">
    {String(cur + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
    <span class="rc-bottom__dir">{work.direction === 'rtl' ? '◀ RTL' : 'LTR ▶'}</span>
  </span>
  <div class="rc-bottom__bar">
    <div
      class="rc-bottom__fill"
      style={`transform: scaleX(${total > 1 ? cur / (total - 1) : 1})`}
    ></div>
  </div>
</footer>

{#if panelOpen}
  <div class="rc-panel">
    <p class="mono rc-panel__head">READER SETTINGS</p>
    <div class="rc-panel__group">
      <span class="mono rc-panel__label">LAYOUT</span>
      <div class="rc-panel__opts">
        <button class="mono rc-opt" class:is-on={settings.layout === 'single'} onclick={() => onSettings({ layout: 'single' })}>SINGLE</button>
        <button class="mono rc-opt" class:is-on={settings.layout === 'double'} onclick={() => onSettings({ layout: 'double' })}>SPREAD</button>
      </div>
    </div>
    <div class="rc-panel__group">
      <span class="mono rc-panel__label">MODE</span>
      <div class="rc-panel__opts">
        <button class="mono rc-opt" class:is-on={settings.mode === 'flip'} onclick={() => onSettings({ mode: 'flip' })}>FLIP</button>
        <button class="mono rc-opt" class:is-on={settings.mode === 'scroll'} onclick={() => onSettings({ mode: 'scroll' })}>SCROLL</button>
      </div>
    </div>
    <div class="rc-panel__group">
      <span class="mono rc-panel__label">FIT</span>
      <div class="rc-panel__opts">
        <button class="mono rc-opt" class:is-on={settings.fit === 'height'} onclick={() => onSettings({ fit: 'height' })}>HEIGHT</button>
        <button class="mono rc-opt" class:is-on={settings.fit === 'width'} onclick={() => onSettings({ fit: 'width' })}>WIDTH</button>
      </div>
    </div>
  </div>
{/if}

{#if noteOpen && currentSheet}
  <div class="rc-note">
    <button class="rc-note__scrim" aria-label="Close note" onclick={() => (noteOpen = false)}></button>
    <div class="rc-note__body">
      <div class="rc-note__grip" aria-hidden="true"></div>
      <NoteMargin sheet={currentSheet} {pageNumberOf} variant="sheet" />
    </div>
  </div>
{/if}

<style>
  .rc-top {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: calc(0.7rem + env(safe-area-inset-top)) var(--pad) 0.7rem;
    background: linear-gradient(180deg, rgba(12, 12, 13, 0.92), rgba(12, 12, 13, 0));
    pointer-events: none;
  }
  .rc-top > * {
    pointer-events: auto;
  }
  .rc-top__back:hover {
    color: var(--accent);
  }
  .rc-top__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg);
  }
  .rc-top__actions {
    display: flex;
    gap: 0.45rem;
    flex-shrink: 0;
  }
  .rc-btn {
    background: rgba(12, 12, 13, 0.6);
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    min-width: 2.4rem;
    min-height: 2.1rem;
    padding: 0.35em 0.7em;
    cursor: pointer;
    transition: color 0.25s var(--ease), border-color 0.25s var(--ease);
  }
  .rc-btn:hover,
  .rc-btn.is-active {
    color: var(--fg);
    border-color: var(--accent);
  }
  .rc-btn--note {
    color: #e8a31a;
    border-color: rgba(232, 163, 26, 0.5);
  }
  .rc-bottom {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    display: grid;
    gap: 0.5rem;
    padding: 0 var(--pad) calc(0.7rem + env(safe-area-inset-bottom));
    pointer-events: none;
  }
  .rc-bottom__counter {
    display: flex;
    justify-content: space-between;
    color: var(--fg-dim);
  }
  .rc-bottom__dir {
    color: var(--fg-faint);
  }
  .rc-bottom__bar {
    height: 2px;
    background: var(--line);
  }
  .rc-bottom__fill {
    height: 100%;
    background: var(--accent);
    transform-origin: left center;
    transition: transform 0.25s var(--ease);
  }
  .rc-panel {
    position: fixed;
    top: calc(3.4rem + env(safe-area-inset-top));
    right: var(--pad);
    z-index: 50;
    display: grid;
    gap: 1rem;
    width: min(17rem, calc(100vw - 2 * var(--pad)));
    padding: 1.1rem;
    background: rgba(12, 12, 13, 0.96);
    border: 1px solid var(--line-strong);
  }
  .rc-panel__head {
    color: var(--fg);
  }
  .rc-panel__group {
    display: grid;
    gap: 0.45rem;
  }
  .rc-panel__label {
    font-size: 0.55rem;
    color: var(--fg-faint);
  }
  .rc-panel__opts {
    display: flex;
    gap: 0.4rem;
  }
  .rc-opt {
    flex: 1;
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    padding: 0.5em 0;
    cursor: pointer;
    transition: all 0.25s var(--ease);
  }
  .rc-opt.is-on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--ink-fg);
  }
  .rc-note {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    align-items: end;
  }
  .rc-note__scrim {
    position: absolute;
    inset: 0;
    background: rgba(8, 8, 10, 0.55);
    border: 0;
    cursor: pointer;
  }
  .rc-note__body {
    position: relative;
    max-height: 55svh;
    overflow-y: auto;
    background: var(--ink-bg-soft);
    border-top: 1px solid var(--line-strong);
    padding: 1rem var(--pad) calc(1.6rem + env(safe-area-inset-bottom));
  }
  .rc-note__grip {
    width: 2.4rem;
    height: 3px;
    margin: 0 auto 1rem;
    background: var(--line-strong);
  }
  @media (min-width: 1150px) {
    /* Desktop already shows margin notes in the gutter (scroll) or panel; the
       bottom sheet stays available for flip mode. */
    .rc-note__body {
      max-width: 34rem;
      margin-left: auto;
      border-left: 1px solid var(--line-strong);
    }
  }
</style>
