<script lang="ts">
  import type { Work, ReaderSettings, Sheet, ChapterMark, PageRec } from '../../lib/types';
  import { i18n, type DictKey } from '../../lib/i18n.svelte';
  import { punch } from '../../scripts/mv';
  import { sfx } from '../../scripts/sound';
  import { MUSIC } from '../../lib/features';
  import { cropFocus } from '../../lib/coverCrop';
  import { translationLabel } from '../../lib/readerUi';
  import BookmarkNote from './BookmarkNote.svelte';

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
    pinned = false,
    novelHref = null,
    onSettings,
    onJump,
    onJumpPage,
    onToggleFavorite,
    onRemoveFavorite,
    onShare,
    onHelp,
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
    /** A first visit: the bar stays up until the first page turn. */
    pinned?: boolean;
    /** 「小説はテキストで読めます」 — set only on pages of a novel part (lib/bookParts.ts). */
    novelHref?: string | null;
    onSettings: (patch: Partial<ReaderSettings>) => void;
    onJump: (sheet: number) => void;
    onJumpPage: (pageId: string) => void;
    onToggleFavorite: () => void;
    onRemoveFavorite: (pageId: string) => void;
    onShare: () => void;
    onHelp: () => void;
  } = $props();

  const t = (key: string) => i18n.t(key as DictKey);
  // The translation switch says what is on the page: 「翻訳：日本語」 or 「原文（タイ語）」.
  const transLabel = $derived(translationLabel(work, settings.translate, i18n.lang, t));
  const origLabel = $derived(translationLabel(work, false, i18n.lang, t));
  const onLabel = $derived(translationLabel(work, true, i18n.lang, t));

  // Phones get one flip/scroll button showing the mode it is in; wider bars keep both.
  let narrow = $state(false);
  $effect(() => {
    const mq = window.matchMedia('(max-width: 520px)');
    const sync = () => (narrow = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  let panelOpen = $state(false);
  let tocOpen = $state(false);
  let gridOpen = $state(false);
  let gridTab = $state<'all' | 'fav'>('all');

  // Drawn, not typed: the subset mono webfont has no ♥ or ▦, so glyphs fell back to specks.
  const HEART =
    'M16.29 3.3c-1.72 0-3.24.76-4.29 1.99C10.95 4.06 9.33 3.3 7.62 3.3 4.57 3.3 2 5.86 2 8.9v.57c.38 4.66 5.33 8.55 8.29 10.35.47.29 1.04.48 1.71.48.57 0 1.14-.19 1.71-.48 2.96-1.9 7.91-5.7 8.29-10.35V8.9c0-3.04-2.57-5.6-5.71-5.6Z';

  const currentIds = $derived(currentSheet?.pages.map((p) => p.id) ?? []);
  const currentFaved = $derived(currentIds.some((id) => favorites.includes(id)));

  // UI sounds (theme-song notes). The reader has no site header, so its switch
  // lives in the settings panel; the choice is shared with the rest of the site.
  let soundOn = $state(sfx.enabled());
  function setSound(next: boolean) {
    sfx.set(next);
    soundOn = next;
  }

  // MV punch: the page number and the heart kick once when they change.
  let counterEl: HTMLElement | undefined = $state();
  let heartEl: HTMLElement | undefined = $state();
  let lastCur = -1;
  $effect(() => {
    const c = cur;
    if (lastCur !== -1 && c !== lastCur) punch(counterEl);
    lastCur = c;
  });
  let lastFaved: boolean | null = null;
  $effect(() => {
    const f = currentFaved;
    if (lastFaved !== null && f !== lastFaved) punch(heartEl);
    lastFaved = f;
  });
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
  // pointer, key or wheel brings it back; it never hides while a panel is open,
  // while keyboard focus is inside it, or on a first visit before the first page
  // turn (`pinned` — the labels are how a new reader learns the controls).
  let idle = $state(false);
  const hidden = $derived(idle && !pinned && !panelOpen && !tocOpen && !gridOpen);
  let idleAtPress = false; // whether the chrome was away when the current press began
  let restTimer = 0;
  function rest() {
    if (document.activeElement?.closest('.rc-top, .rc-bottom')) {
      restTimer = window.setTimeout(rest, 3000);
      return;
    }
    idle = true;
  }
  $effect(() => {
    const wake = (e?: Event) => {
      if (e?.type === 'pointerdown') idleAtPress = hidden;
      idle = false;
      clearTimeout(restTimer);
      restTimer = window.setTimeout(rest, 3000);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
    wake();
    return () => {
      clearTimeout(restTimer);
      events.forEach((ev) => window.removeEventListener(ev, wake));
    };
  });

  /**
   * A tap in the middle of the page (FlipSurface): shows the menu if it was away,
   * puts it away if it was up. The press itself already woke it, so what counts
   * is how it was when the press began.
   */
  export function toggleMenu() {
    if (idleAtPress || panelOpen || tocOpen || gridOpen) return;
    clearTimeout(restTimer);
    idle = true;
  }

  export function togglePanel() {
    panelOpen = !panelOpen;
  }

  const rtl = $derived(work.direction === 'rtl');

  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }
</script>

{#snippet modeIcon(mode: 'flip' | 'scroll')}
  {#if mode === 'flip'}
    <svg class="rc-ico" viewBox="0 0 24 24" aria-hidden="true"
      ><path d="M12 6.5C10 5 7 4.5 3 5v13c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5Zm0 0v13" /></svg
    >
  {:else}
    <svg class="rc-ico" viewBox="0 0 24 24" aria-hidden="true"
      ><rect x="7" y="2.5" width="10" height="8" rx="1" /><rect x="7" y="13.5" width="10" height="8" rx="1" /></svg
    >
  {/if}
{/snippet}

<!-- Every control carries its name under its icon, on every screen: readers
     didn't know where to tap, and "AA" read as a text-size button. -->
<header class="rc-top" class:is-idle={hidden}>
  <a class="mono rc-top__back" href={`/w/${work.slug}`}>← {i18n.t('rd.overview')}</a>
  <span class="mono rc-top__title">{work.title}</span>
  <div class="rc-top__actions">
    {#if hasNote}
      <span class="mono rc-noteflag" aria-hidden="true">✳ {i18n.t('rd.note')}</span>
    {/if}
    {#if hasBubbles}
      <!-- a real switch now: the old "◫ 翻訳" chip looked like one and did nothing -->
      <button
        class="rc-tool rc-trans"
        class:is-on={settings.translate}
        aria-pressed={settings.translate}
        onclick={() => onSettings({ translate: !settings.translate })}
        title={i18n.t('rd.transSwitch')}
      ><svg class="rc-ico" viewBox="0 0 24 24" aria-hidden="true"
          ><path d="M4 4.5h16v11H11l-4.5 4v-4H4Z" /><path d="M8 9.8h8M10 7.4v.1" /></svg
        ><span class="rc-tool__label">{transLabel}</span></button>
    {/if}
    {#if chapterMarks.length}
      <button
        class="rc-tool"
        class:is-active={tocOpen}
        onclick={() => (tocOpen = !tocOpen)}
        aria-expanded={tocOpen}
      ><svg class="rc-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.1M4.5 12h.1M4.5 18h.1" /></svg
        ><span class="rc-tool__label">{i18n.t('rd.toc')}</span></button>
    {/if}
    {#if narrow}
      <!-- Phones: one button, showing the mode it is in; a tap switches. -->
      <button
        class="rc-tool"
        onclick={() => onSettings({ mode: settings.mode === 'flip' ? 'scroll' : 'flip' })}
        title={i18n.t('rd.modeSwitch')}
        aria-label={`${i18n.t('rd.modeSwitch')} — ${i18n.t(settings.mode === 'flip' ? 'rd.flip' : 'rd.scroll')}`}
      >{@render modeIcon(settings.mode)}<span class="rc-tool__label">{i18n.t(settings.mode === 'flip' ? 'rd.flip' : 'rd.scroll')}</span></button>
    {:else}
      <!-- Flip vs scroll lived only inside the AA panel, and readers never found it. -->
      <div class="rc-mode" role="group" aria-label={i18n.t('rd.mode')}>
        {#each ['flip', 'scroll'] as const as m (m)}
          <button
            class="rc-tool rc-mode__opt"
            class:is-on={settings.mode === m}
            aria-pressed={settings.mode === m}
            onclick={() => onSettings({ mode: m })}
          >{@render modeIcon(m)}<span class="rc-tool__label">{i18n.t(m === 'flip' ? 'rd.flip' : 'rd.scroll')}</span></button>
        {/each}
      </div>
    {/if}
    <button
      class="rc-tool rc-btn--heart"
      bind:this={heartEl}
      class:is-on={currentFaved}
      onclick={onToggleFavorite}
      aria-pressed={currentFaved}
    ><svg class="rc-ico" viewBox="0 0 24 24" aria-hidden="true"><path d={HEART} /></svg
      ><span class="rc-tool__label">{i18n.t('rd.fav')}</span></button>
    <button
      class="rc-tool"
      class:is-active={gridOpen}
      onclick={() => (gridOpen ? (gridOpen = false) : openGrid())}
      title={i18n.t('rd.pages')}
      aria-expanded={gridOpen}
    ><svg class="rc-ico rc-ico--grid" viewBox="0 0 24 24" aria-hidden="true"
        ><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect
          x="3"
          y="14"
          width="7"
          height="7"
        /><rect x="14" y="14" width="7" height="7" /></svg
      ><span class="rc-tool__label">{i18n.t('rd.grid')}</span></button>
    <button class="rc-tool rc-btn--fs" onclick={fullscreen} title="Fullscreen (f)"
      ><svg class="rc-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg
      ><span class="rc-tool__label">{i18n.t('rd.full')}</span></button>
    <button
      class="rc-tool"
      class:is-active={panelOpen}
      onclick={() => (panelOpen = !panelOpen)}
      title={`${i18n.t('rd.settings')} (s)`}
      aria-expanded={panelOpen}
    ><svg class="rc-ico rc-ico--gear" viewBox="0 0 24 24" aria-hidden="true"
        ><circle cx="12" cy="12" r="7.2" stroke-width="3" stroke-dasharray="2.83 2.83" stroke-linecap="butt" /><circle cx="12" cy="12" r="5.4" /><circle
          cx="12"
          cy="12"
          r="2"
        /></svg
      ><span class="rc-tool__label">{i18n.t('rd.set')}</span></button>
    <button class="rc-tool" onclick={onHelp}
      ><svg class="rc-ico" viewBox="0 0 24 24" aria-hidden="true"
        ><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6M12 16.9v.1" /></svg
      ><span class="rc-tool__label">{i18n.t('rd.help')}</span></button>
  </div>
</header>

<footer class="rc-bottom" class:is-idle={hidden}>
  {#if novelHref}
    <!-- only on pages of a novel part (lib/bookParts.ts novelHere), and a real link -->
    <a class="rc-novel" href={novelHref}>{i18n.t('nv.inText')} <span aria-hidden="true">→</span></a>
  {/if}
  <span class="mono rc-bottom__counter">
    <span class="rc-bottom__num" bind:this={counterEl}>
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
  <!-- Three named sections, so the language row reads as the screen's language,
       not the translation's — readers took 言語 under 翻訳 for the latter. -->
  <div class="rc-panel" role="dialog" aria-label={i18n.t('rd.settings')}>
    <p class="mono rc-panel__head">{i18n.t('rd.settings')}</p>
    <section class="rc-panel__sec" aria-labelledby="rc-sec-view">
      <h2 class="rc-panel__title" id="rc-sec-view">{i18n.t('rd.secView')}</h2>
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
      {#if settings.mode === 'flip'}
        <div class="rc-panel__group">
          <span class="mono rc-panel__label">{i18n.t('rd.curl')}</span>
          <div class="rc-panel__opts">
            <button class="mono rc-opt" class:is-on={settings.curl} onclick={() => onSettings({ curl: true })}>{i18n.t('rd.on')}</button>
            <button class="mono rc-opt" class:is-on={!settings.curl} onclick={() => onSettings({ curl: false })}>{i18n.t('rd.off')}</button>
          </div>
        </div>
      {/if}
      <div class="rc-panel__group">
        <span class="mono rc-panel__label">{i18n.t('rd.fit')}</span>
        <div class="rc-panel__opts">
          <button class="mono rc-opt" class:is-on={settings.fit === 'height'} onclick={() => onSettings({ fit: 'height' })}>{i18n.t('rd.fitHeight')}</button>
          <button class="mono rc-opt" class:is-on={settings.fit === 'width'} onclick={() => onSettings({ fit: 'width' })}>{i18n.t('rd.fitWidth')}</button>
        </div>
      </div>
      {#if MUSIC}
        <div class="rc-panel__group">
          <span class="mono rc-panel__label">SOUND</span>
          <div class="rc-panel__opts">
            <button class="mono rc-opt" class:is-on={!soundOn} onclick={() => setSound(false)}>OFF</button>
            <button class="mono rc-opt" class:is-on={soundOn} onclick={() => setSound(true)}>ON ♪</button>
          </div>
        </div>
      {/if}
    </section>
    {#if hasBubbles}
      <section class="rc-panel__sec" aria-labelledby="rc-sec-trans">
        <h2 class="rc-panel__title" id="rc-sec-trans">{i18n.t('rd.translate')}</h2>
        <div class="rc-panel__opts">
          <!-- the same words as the bar's switch -->
          <button class="rc-opt rc-opt--text" class:is-on={settings.translate} onclick={() => onSettings({ translate: true })}>{onLabel}</button>
          <button class="rc-opt rc-opt--text" class:is-on={!settings.translate} onclick={() => onSettings({ translate: false })}>{origLabel}</button>
        </div>
        <div class="rc-panel__group">
          <span class="mono rc-panel__label">{i18n.t('rd.tsHow')}</span>
          <div class="rc-panel__opts">
            <!-- lettered into the balloons · the original with hotspots + a list beside it -->
            <button class="mono rc-opt" class:is-on={settings.translate && settings.translateMode !== 'notes'} onclick={() => onSettings({ translate: true, translateMode: 'typeset' })}>{i18n.t('rd.tsBubbles')}</button>
            <button class="mono rc-opt" class:is-on={settings.translate && settings.translateMode === 'notes'} onclick={() => onSettings({ translate: true, translateMode: 'notes' })}>{i18n.t('rd.tsList')}</button>
          </div>
          <p class="rc-panel__hint">{i18n.t('rd.tsExplain')}</p>
        </div>
      </section>
    {/if}
    <section class="rc-panel__sec" aria-labelledby="rc-sec-lang">
      <h2 class="rc-panel__title" id="rc-sec-lang">{i18n.t('rd.secLang')}</h2>
      <div class="rc-panel__opts">
        <button class="mono rc-opt" class:is-on={i18n.lang === 'ja'} onclick={() => i18n.set('ja')}>日本語</button>
        <button class="mono rc-opt" class:is-on={i18n.lang === 'en'} onclick={() => i18n.set('en')}>EN</button>
      </div>
    </section>
    <BookmarkNote />
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
                <img
                  class="rc-grid__thumb"
                  src={page.thumbUrl}
                  alt=""
                  loading="lazy"
                  style={page.crop ? `object-position:${cropFocus(page.crop)}` : undefined}
                />
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
                <img
                  class="rc-toc__cover"
                  src={mark.coverUrl}
                  alt=""
                  loading="lazy"
                  style={mark.coverFocus ? `object-position:${mark.coverFocus}` : undefined}
                />
              {:else}
                <span class="rc-toc__cover rc-toc__cover--blank"></span>
              {/if}
              <span class="rc-toc__meta">
                <span class="mono rc-toc__num"
                  >{String(i + 1).padStart(2, '0')}{#if mark.kind}
                    · {i18n.t(mark.kind === 'novel' ? 'part.novel' : 'part.manga')}{/if}</span
                >
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
  /* 「小説はテキストで読めます」 — a real button above the page counter, on novel pages only */
  .rc-novel {
    justify-self: center;
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    min-height: 2.5rem;
    padding: 0.5em 1.1em;
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: rgba(12, 12, 13, 0.88);
    color: var(--fg);
    font-family: var(--font-display-authored);
    font-size: 0.8rem;
    letter-spacing: 0.04em;
    text-decoration: none;
    pointer-events: auto;
    transition: background-color 0.25s var(--ease);
  }
  .rc-novel:hover {
    background: var(--accent);
  }
  .rc-bottom.is-idle .rc-novel {
    pointer-events: none;
  }
  .rc-top {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 40;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.8rem;
    padding: calc(0.55rem + env(safe-area-inset-top)) var(--pad) 0.9rem;
    background: linear-gradient(180deg, rgba(12, 12, 13, 0.94) 55%, rgba(12, 12, 13, 0));
    pointer-events: none;
  }
  .rc-top > * {
    pointer-events: auto;
  }
  .rc-top__back {
    flex-shrink: 0;
    align-self: center;
    white-space: nowrap;
  }
  .rc-top__back:hover {
    color: var(--accent);
  }
  .rc-top__title {
    flex: 1 1 0;
    min-width: 0;
    align-self: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg);
  }
  .rc-top__actions {
    display: flex;
    flex-wrap: wrap; /* a very narrow phone takes a second row rather than losing a button */
    justify-content: flex-end;
    gap: 0.35rem;
    min-width: 0;
  }
  /* One control: its icon, and its name under it — on every screen. */
  .rc-tool {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.22rem;
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0.32rem 0.45rem 0.28rem;
    background: rgba(12, 12, 13, 0.6);
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    cursor: pointer;
    transition: color 0.25s var(--ease), border-color 0.25s var(--ease), background-color 0.25s var(--ease);
  }
  .rc-tool.is-active {
    color: var(--fg);
    border-color: var(--accent);
  }
  /* pointer-gated: on a phone :hover sticks after the tap and the switch's
     "off" looked lit */
  @media (hover: hover) {
    .rc-tool:hover {
      color: var(--fg);
      border-color: var(--accent);
    }
  }
  .rc-tool__label {
    font-family: var(--font-mono);
    font-size: 0.6875rem; /* 11px: small, never smaller */
    letter-spacing: 0.04em;
    line-height: 1.1;
    white-space: nowrap;
    text-transform: uppercase; /* the English chrome's voice; no-op on Japanese */
  }
  /* The translation switch: lit while the translation shows. */
  .rc-trans.is-on {
    color: var(--fg);
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 35%, rgba(12, 12, 13, 0.6));
  }
  .rc-ico {
    display: block;
    width: 1.05rem;
    height: 1.05rem;
    flex-shrink: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
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
  .rc-mode {
    display: flex;
  }
  .rc-mode__opt + .rc-mode__opt {
    border-left: 0;
  }
  .rc-mode__opt.is-on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--ink-fg);
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
  /* Phones: the title and the note flag give way to the labelled controls
     (the note itself still shows in the rail). */
  @media (max-width: 520px) {
    /* tight enough that a 390-wide phone holds every control on one row, the
       translation switch and スクロール included; narrower ones wrap (above) */
    .rc-top {
      gap: 0.25rem;
      padding-inline: max(0.4rem, env(safe-area-inset-left)) max(0.4rem, env(safe-area-inset-right));
    }
    .rc-top__title,
    .rc-noteflag {
      display: none;
    }
    .rc-top__back {
      letter-spacing: 0.04em;
    }
    .rc-top__actions {
      gap: 0.12rem;
    }
    .rc-tool {
      min-width: 2rem;
      padding-inline: 0.12rem;
    }
    .rc-tool__label {
      letter-spacing: 0;
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
  /* inline-block so the MV punch (a `scale`) applies; inline boxes ignore transforms */
  .rc-bottom__num {
    display: inline-block;
    transform-origin: left center;
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
    top: calc(4rem + env(safe-area-inset-top));
    right: var(--pad);
    z-index: 50;
    display: grid;
    gap: 1rem;
    width: min(19rem, calc(100vw - 2 * var(--pad)));
    max-height: calc(100svh - 4.6rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 1.1rem;
    background: rgba(12, 12, 13, 0.96);
    border: 1px solid var(--line-strong);
  }
  .rc-panel__head {
    color: var(--fg);
  }
  .rc-panel__sec {
    display: grid;
    gap: 0.75rem;
    padding-top: 0.85rem;
    border-top: 1px solid var(--line);
  }
  .rc-panel__title {
    margin: 0;
    font-family: var(--font-display-authored);
    font-size: 0.86rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--fg);
  }
  .rc-panel__group {
    display: grid;
    gap: 0.45rem;
  }
  .rc-panel__label {
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    color: var(--fg-faint);
  }
  .rc-panel__hint {
    font-family: var(--font-display-authored);
    font-size: 0.72rem;
    line-height: 1.55;
    color: var(--fg-dim);
  }
  .rc-opt--text {
    font-family: var(--font-display-authored);
    font-size: 0.78rem;
    padding: 0.6em 0.3em;
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
