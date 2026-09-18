<script lang="ts">
  import type { Work, ReaderSettings, Sheet, ChapterMark, PageRec } from '../../lib/types';
  import { i18n } from '../../lib/i18n.svelte';

  let {
    work,
    settings,
    cur,
    total,
    currentSheet,
    hasNote,
    hasBubbles,
    chapterMarks,
    currentChapter,
    pageNumberOf,
    pages,
    favorites,
    onSettings,
    onJump,
    onJumpPage,
    onToggleFavorite,
    onRemoveFavorite,
    onShare,
  }: {
    work: Work;
    settings: ReaderSettings;
    cur: number;
    total: number;
    currentSheet: Sheet | null;
    hasNote: boolean;
    hasBubbles: boolean;
    chapterMarks: ChapterMark[];
    currentChapter: string | null;
    pageNumberOf: (pageId: string) => number;
    pages: PageRec[];
    favorites: string[];
    onSettings: (patch: Partial<ReaderSettings>) => void;
    onJump: (sheet: number) => void;
    onJumpPage: (pageId: string) => void;
    onToggleFavorite: () => void;
    onRemoveFavorite: (pageId: string) => void;
    onShare: () => void;
  } = $props();

  let panelOpen = $state(false);
  let tocOpen = $state(false);
  let gridOpen = $state(false);
  let gridTab = $state<'all' | 'fav'>('all');

  // Drawn, not typed: the subset mono webfont has no ♥ or ▦, so glyphs fell back to specks.
  const HEART =
    'M16.29 3.3c-1.72 0-3.24.76-4.29 1.99C10.95 4.06 9.33 3.3 7.62 3.3 4.57 3.3 2 5.86 2 8.9v.57c.38 4.66 5.33 8.55 8.29 10.35.47.29 1.04.48 1.71.48.57 0 1.14-.19 1.71-.48 2.96-1.9 7.91-5.7 8.29-10.35V8.9c0-3.04-2.57-5.6-5.71-5.6Z';

  const currentIds = $derived(currentSheet?.pages.map((p) => p.id) ?? []);
  const currentFaved = $derived(currentIds.some((id) => favorites.includes(id)));
  const readable = $derived(pages.filter((p) => !p.isBlank));
  const favPages = $derived(readable.filter((p) => favorites.includes(p.id)));
  const shown = $derived(gridTab === 'fav' ? favPages : readable);

  function openGrid(tab: 'all' | 'fav' = 'all') {
    gridTab = tab;
    gridOpen = true;
    tocOpen = false;
    panelOpen = false;
  }

  // Chrome steps aside after 3 s without input, like comimi's overlay. Any
  // pointer, key or wheel brings it back; it never hides while a panel is open
  // or while keyboard focus is inside it.
  let idle = $state(false);
  const hidden = $derived(idle && !panelOpen && !tocOpen && !gridOpen);
  $effect(() => {
    let timer = 0;
    const wake = () => {
      idle = false;
      clearTimeout(timer);
      timer = window.setTimeout(function rest() {
        if (document.activeElement?.closest('.rc-top, .rc-bottom')) {
          timer = window.setTimeout(rest, 3000);
          return;
        }
        idle = true;
      }, 3000);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
    wake();
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, wake));
    };
  });

  export function togglePanel() {
    panelOpen = !panelOpen;
  }

  const rtl = $derived(work.direction === 'rtl');

  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }
</script>

<header class="rc-top" class:is-idle={hidden}>
  <a class="mono rc-top__back" href={`/w/${work.slug}`} data-hover>← {i18n.t('rd.overview')}</a>
  <span class="mono rc-top__title">{work.title}</span>
  <div class="rc-top__actions">
    {#if hasNote}
      <span class="mono rc-noteflag" aria-hidden="true">✳ {i18n.t('rd.note')}</span>
    {/if}
    {#if hasBubbles && settings.translate}
      <span class="mono rc-transflag" aria-hidden="true">◫ {i18n.t('rd.translate')}</span>
    {/if}
    {#if chapterMarks.length}
      <button
        class="mono rc-btn"
        class:is-active={tocOpen}
        onclick={() => (tocOpen = !tocOpen)}
        title={i18n.t('rd.toc')}
      >{i18n.t('rd.toc')}</button>
    {/if}
    <button
      class="mono rc-btn rc-btn--heart"
      class:is-on={currentFaved}
      onclick={onToggleFavorite}
      title={i18n.t('rd.fav')}
      aria-label={i18n.t('rd.fav')}
      aria-pressed={currentFaved}
    ><svg class="rc-ico" viewBox="0 0 24 24" aria-hidden="true"><path d={HEART} /></svg></button>
    <button
      class="mono rc-btn"
      class:is-active={gridOpen}
      onclick={() => (gridOpen ? (gridOpen = false) : openGrid())}
      title={i18n.t('rd.pages')}
      aria-label={i18n.t('rd.pages')}
    ><svg class="rc-ico rc-ico--grid" viewBox="0 0 24 24" aria-hidden="true"
        ><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect
          x="3"
          y="14"
          width="7"
          height="7"
        /><rect x="14" y="14" width="7" height="7" /></svg
      ></button>
    <button class="mono rc-btn rc-btn--fs" onclick={fullscreen} title="Fullscreen (f)">⛶</button>
    <button
      class="mono rc-btn"
      class:is-active={panelOpen}
      onclick={() => (panelOpen = !panelOpen)}
      title="Settings (s)"
    >AA</button>
  </div>
</header>

<footer class="rc-bottom" class:is-idle={hidden}>
  <span class="mono rc-bottom__counter">
    <span>
      {String(cur + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      {#if currentChapter}<span class="rc-bottom__ch">· {currentChapter}</span>{/if}
    </span>
    <span class="rc-bottom__dir">{rtl ? '◀ RTL' : 'LTR ▶'}</span>
  </span>
  <!-- RTL books fill the bar right→left so it moves the way the pages do -->
  <div class="rc-bottom__bar">
    <div
      class="rc-bottom__fill"
      style={`transform: scaleX(${total > 1 ? cur / (total - 1) : 1}); transform-origin: ${rtl ? 'right' : 'left'} center`}
    ></div>
    {#each chapterMarks as mark (mark.id)}
      <span
        class="rc-bottom__tick"
        style={`${rtl ? 'right' : 'left'}: ${total > 1 ? (mark.sheet / (total - 1)) * 100 : 0}%`}
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
    {#if hasBubbles}
      <div class="rc-panel__group">
        <span class="mono rc-panel__label">{i18n.t('rd.translate')}</span>
        <div class="rc-panel__opts">
          <button class="mono rc-opt" class:is-on={settings.translate} onclick={() => onSettings({ translate: true })}>{i18n.t('rd.on')}</button>
          <button class="mono rc-opt" class:is-on={!settings.translate} onclick={() => onSettings({ translate: false })}>{i18n.t('rd.off')}</button>
        </div>
      </div>
    {/if}
    <div class="rc-panel__group">
      <span class="mono rc-panel__label">{i18n.t('rd.lang')}</span>
      <div class="rc-panel__opts">
        <button class="mono rc-opt" class:is-on={i18n.lang === 'ja'} onclick={() => i18n.set('ja')}>日本語</button>
        <button class="mono rc-opt" class:is-on={i18n.lang === 'en'} onclick={() => i18n.set('en')}>EN</button>
      </div>
    </div>
  </div>
{/if}

{#if gridOpen}
  <div class="rc-toc rc-grid">
    <button class="rc-toc__scrim" aria-label="Close pages" onclick={() => (gridOpen = false)}></button>
    <nav class="rc-toc__body rc-grid__body" aria-label={i18n.t('rd.pages')}>
      <div class="rc-grid__head">
        <div class="rc-grid__tabs" role="tablist">
          <button
            class="mono rc-opt"
            role="tab"
            aria-selected={gridTab === 'all'}
            class:is-on={gridTab === 'all'}
            onclick={() => (gridTab = 'all')}
          >{i18n.t('rd.all')} {readable.length}</button>
          <button
            class="mono rc-opt"
            role="tab"
            aria-selected={gridTab === 'fav'}
            class:is-on={gridTab === 'fav'}
            onclick={() => (gridTab = 'fav')}
          ><svg class="rc-ico rc-ico--inline" viewBox="0 0 24 24" aria-hidden="true"><path d={HEART} /></svg>
            {i18n.t('rd.fav')} {favPages.length}</button>
        </div>
        <button class="mono rc-grid__share mk-hop-host" onclick={onShare}>
          {i18n.t('rd.share')} <span class="mk-hop" aria-hidden="true">↗</span>
        </button>
      </div>
      {#if gridTab === 'fav' && !favPages.length}
        <p class="rc-grid__empty">{i18n.t('rd.favEmpty')}</p>
      {:else}
        <ul class="rc-grid__list">
          {#each shown as page (page.id)}
            <li class="rc-grid__cell">
              <button
                class="rc-grid__item"
                class:is-current={currentIds.includes(page.id)}
                onclick={() => {
                  onJumpPage(page.id);
                  gridOpen = false;
                }}
              >
                <img class="rc-grid__thumb" src={page.thumbUrl} alt="" loading="lazy" />
                <span class="mono rc-grid__num">{String(pageNumberOf(page.id)).padStart(2, '0')}</span>
                {#if favorites.includes(page.id)}
                  <svg class="rc-grid__heart" viewBox="0 0 24 24" role="img" aria-label={i18n.t('rd.fav')}><path d={HEART} /></svg>
                {/if}
              </button>
              {#if gridTab === 'fav'}
                <button
                  class="rc-grid__remove"
                  aria-label={`${i18n.t('rd.favRemove')} — ${pageNumberOf(page.id)}`}
                  onclick={() => onRemoveFavorite(page.id)}
                >✕</button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </nav>
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
  .rc-ico {
    display: block;
    width: 1rem;
    height: 1rem;
    margin: auto;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linejoin: round;
  }
  .rc-ico--inline {
    display: inline-block;
    width: 0.9em;
    height: 0.9em;
    margin: 0 0.3em 0 0;
    vertical-align: -0.1em;
    fill: currentColor;
    stroke: none;
  }
  .rc-btn--heart.is-on {
    color: var(--mk-love);
  }
  .rc-btn--heart.is-on .rc-ico {
    fill: currentColor;
  }
  /* No fullscreen API on iPhone; the slot is worth more to the heart. */
  @media (pointer: coarse) and (max-width: 520px) {
    .rc-btn--fs {
      display: none;
    }
  }
  /* Idle: the chrome steps aside so the page is all there is. */
  .rc-top,
  .rc-bottom {
    transition: opacity 0.4s var(--ease);
  }
  .rc-top.is-idle,
  .rc-bottom.is-idle {
    opacity: 0;
  }
  .rc-top.is-idle > * {
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .rc-top,
    .rc-bottom {
      transition: none;
    }
  }
  .rc-noteflag {
    align-self: center;
    color: #e8a31a;
    font-size: 0.6rem;
  }
  .rc-transflag {
    align-self: center;
    color: var(--accent);
    font-size: 0.6rem;
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
  /* --- Page grid (the TOC drawer's shell, wider) --- */
  .rc-grid__body {
    width: min(26rem, 92vw);
  }
  .rc-grid__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-bottom: 1rem;
  }
  .rc-grid__tabs {
    display: flex;
    gap: 0.4rem;
  }
  .rc-grid__tabs .rc-opt {
    padding: 0.5em 0.8em;
    white-space: nowrap;
  }
  .rc-grid__share {
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    padding: 0.5em 0.8em;
    cursor: pointer;
  }
  .rc-grid__share:hover {
    color: var(--fg);
    border-color: var(--accent);
  }
  .rc-grid__empty {
    color: var(--fg-dim);
    font-size: 0.9rem;
    line-height: 1.6;
  }
  .rc-grid__list {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
  }
  .rc-grid__cell {
    position: relative;
  }
  .rc-grid__item {
    position: relative;
    display: block;
    width: 100%;
    padding: 0;
    background: var(--bg);
    border: 1px solid var(--line);
    cursor: pointer;
    transition: border-color 0.25s var(--ease);
  }
  .rc-grid__item:hover {
    border-color: var(--line-strong);
  }
  .rc-grid__item.is-current {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .rc-grid__thumb {
    display: block;
    width: 100%;
    aspect-ratio: 1131 / 1600;
    object-fit: cover;
  }
  .rc-grid__num {
    position: absolute;
    left: 0.3rem;
    bottom: 0.25rem;
    font-size: 0.55rem;
    color: var(--fg);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  }
  .rc-grid__heart {
    position: absolute;
    right: 0.3rem;
    bottom: 0.3rem;
    width: 0.95rem;
    height: 0.95rem;
    fill: var(--mk-love);
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.9));
  }
  .rc-grid__remove {
    position: absolute;
    top: -0.45rem;
    right: -0.45rem;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    border: 1px solid var(--line-strong);
    background: var(--ink-bg-soft);
    color: var(--fg);
    font-size: 0.65rem;
    cursor: pointer;
  }
  .rc-grid__remove:hover {
    border-color: var(--mk-love);
    color: var(--mk-love);
  }
</style>
