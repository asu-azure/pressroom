<script lang="ts">
  import type { Work, ReaderSettings, Sheet, ChapterMark } from '../../lib/types';
  import { i18n } from '../../lib/i18n.svelte';
  import NoteMargin from './NoteMargin.svelte';

  let {
    work,
    settings,
    cur,
    total,
    currentSheet,
    hasNote,
    chapterMarks,
    currentChapter,
    pageNumberOf,
    onSettings,
    onJump,
  }: {
    work: Work;
    settings: ReaderSettings;
    cur: number;
    total: number;
    currentSheet: Sheet | null;
    hasNote: boolean;
    chapterMarks: ChapterMark[];
    currentChapter: string | null;
    pageNumberOf: (pageId: string) => number;
    onSettings: (patch: Partial<ReaderSettings>) => void;
    onJump: (sheet: number) => void;
  } = $props();

  let panelOpen = $state(false);
  let noteOpen = $state(false);
  let tocOpen = $state(false);

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
  <a class="mono rc-top__back" href={`/w/${work.slug}`} data-hover>← {i18n.t('rd.overview')}</a>
  <span class="mono rc-top__title">{work.title}</span>
  <div class="rc-top__actions">
    {#if hasNote}
      <button class="mono rc-btn rc-btn--note" onclick={() => (noteOpen = !noteOpen)}>
        ✳ {i18n.t('rd.note')}
      </button>
    {/if}
    {#if chapterMarks.length}
      <button
        class="mono rc-btn"
        class:is-active={tocOpen}
        onclick={() => (tocOpen = !tocOpen)}
        title={i18n.t('rd.toc')}
      >{i18n.t('rd.toc')}</button>
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
    <span>
      {String(cur + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      {#if currentChapter}<span class="rc-bottom__ch">· {currentChapter}</span>{/if}
    </span>
    <span class="rc-bottom__dir">{work.direction === 'rtl' ? '◀ RTL' : 'LTR ▶'}</span>
  </span>
  <div class="rc-bottom__bar">
    <div
      class="rc-bottom__fill"
      style={`transform: scaleX(${total > 1 ? cur / (total - 1) : 1})`}
    ></div>
    {#each chapterMarks as mark (mark.id)}
      <span
        class="rc-bottom__tick"
        style={`left: ${total > 1 ? (mark.sheet / (total - 1)) * 100 : 0}%`}
        title={mark.title}
      ></span>
    {/each}
  </div>
</footer>

{#if panelOpen}
  <div class="rc-panel">
    <p class="mono rc-panel__head">{i18n.t('rd.settings')}</p>
    <div class="rc-panel__group">
      <span class="mono rc-panel__label">{i18n.t('rd.layout')}</span>
      <div class="rc-panel__opts">
        <button class="mono rc-opt" class:is-on={settings.layout === 'single'} onclick={() => onSettings({ layout: 'single' })}>{i18n.t('rd.single')}</button>
        <button class="mono rc-opt" class:is-on={settings.layout === 'double'} onclick={() => onSettings({ layout: 'double' })}>{i18n.t('rd.spread')}</button>
      </div>
    </div>
    <div class="rc-panel__group">
      <span class="mono rc-panel__label">{i18n.t('rd.mode')}</span>
      <div class="rc-panel__opts">
        <button class="mono rc-opt" class:is-on={settings.mode === 'flip'} onclick={() => onSettings({ mode: 'flip' })}>{i18n.t('rd.flip')}</button>
        <button class="mono rc-opt" class:is-on={settings.mode === 'scroll'} onclick={() => onSettings({ mode: 'scroll' })}>{i18n.t('rd.scroll')}</button>
      </div>
    </div>
    <div class="rc-panel__group">
      <span class="mono rc-panel__label">{i18n.t('rd.fit')}</span>
      <div class="rc-panel__opts">
        <button class="mono rc-opt" class:is-on={settings.fit === 'height'} onclick={() => onSettings({ fit: 'height' })}>{i18n.t('rd.fitHeight')}</button>
        <button class="mono rc-opt" class:is-on={settings.fit === 'width'} onclick={() => onSettings({ fit: 'width' })}>{i18n.t('rd.fitWidth')}</button>
      </div>
    </div>
    <div class="rc-panel__group">
      <span class="mono rc-panel__label">{i18n.t('rd.lang')}</span>
      <div class="rc-panel__opts">
        <button class="mono rc-opt" class:is-on={i18n.lang === 'ja'} onclick={() => i18n.set('ja')}>日本語</button>
        <button class="mono rc-opt" class:is-on={i18n.lang === 'en'} onclick={() => i18n.set('en')}>EN</button>
      </div>
    </div>
  </div>
{/if}

{#if tocOpen}
  <div class="rc-toc">
    <button class="rc-toc__scrim" aria-label="Close chapters" onclick={() => (tocOpen = false)}></button>
    <nav class="rc-toc__body">
      <p class="mono rc-toc__head">{i18n.t('ov.chapters')}</p>
      <ul class="rc-toc__list">
        {#each chapterMarks as mark, i (mark.id)}
          <li>
            <button
              class="rc-toc__item"
              class:is-current={currentChapter === mark.title}
              onclick={() => {
                onJump(mark.sheet);
                tocOpen = false;
              }}
            >
              {#if mark.coverUrl}
                <img class="rc-toc__cover" src={mark.coverUrl} alt="" loading="lazy" />
              {:else}
                <span class="rc-toc__cover rc-toc__cover--blank"></span>
              {/if}
              <span class="rc-toc__meta">
                <span class="mono rc-toc__num">{String(i + 1).padStart(2, '0')}</span>
                <span class="serif rc-toc__title">{mark.title}</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </nav>
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
    gap: 1rem;
    color: var(--fg-dim);
  }
  .rc-bottom__ch {
    color: var(--fg-faint);
  }
  .rc-bottom__dir {
    color: var(--fg-faint);
    flex-shrink: 0;
  }
  .rc-bottom__bar {
    position: relative;
    height: 2px;
    background: var(--line);
  }
  .rc-bottom__tick {
    position: absolute;
    top: -2px;
    width: 1px;
    height: 6px;
    background: var(--fg-dim);
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
  .rc-toc {
    position: fixed;
    inset: 0;
    z-index: 55;
    display: grid;
    justify-items: end;
  }
  .rc-toc__scrim {
    position: absolute;
    inset: 0;
    background: rgba(8, 8, 10, 0.55);
    border: 0;
    cursor: pointer;
  }
  .rc-toc__body {
    position: relative;
    width: min(21rem, 88vw);
    height: 100%;
    overflow-y: auto;
    background: var(--ink-bg-soft);
    border-left: 1px solid var(--line-strong);
    padding: calc(3.6rem + env(safe-area-inset-top)) 1.2rem 2rem;
  }
  .rc-toc__head {
    margin-bottom: 1rem;
  }
  .rc-toc__list {
    list-style: none;
    display: grid;
    gap: 0.4rem;
  }
  .rc-toc__item {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    width: 100%;
    background: none;
    border: 1px solid transparent;
    color: var(--fg);
    padding: 0.5rem;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.25s var(--ease), background-color 0.25s var(--ease);
  }
  .rc-toc__item:hover {
    border-color: var(--line-strong);
    background: rgba(244, 241, 234, 0.04);
  }
  .rc-toc__item.is-current {
    border-color: var(--accent);
  }
  .rc-toc__cover {
    width: 2.6rem;
    aspect-ratio: 1131 / 1600;
    object-fit: cover;
    border: 1px solid var(--line);
    flex-shrink: 0;
  }
  .rc-toc__cover--blank {
    display: block;
    background: var(--bg);
  }
  .rc-toc__meta {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }
  .rc-toc__num {
    font-size: 0.55rem;
    color: var(--fg-faint);
  }
  .rc-toc__title {
    font-size: 1.05rem;
    line-height: 1.25;
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
