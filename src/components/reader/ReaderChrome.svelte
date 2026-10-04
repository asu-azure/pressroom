<script lang="ts">
  import type { Work, ReaderSettings, Sheet, ChapterMark, PageRec } from '../../lib/types';
  import { i18n, type DictKey } from '../../lib/i18n.svelte';
  import { punch } from '../../scripts/mv';
  import { sfx } from '../../scripts/sound';
  import { MUSIC } from '../../lib/features';
  import { cropFocus } from '../../lib/coverCrop';
  import { translationLabel, zoomLabel, ZOOM_STEPS } from '../../lib/readerUi';
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
    zoom = null,
    onZoom,
    onUnpin,
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
    /** 「小説で読む」 — set only on pages of a novel part (lib/bookParts.ts). */
    novelHref?: string | null;
    /** The page's zoom (1 = fit) in flip mode; null where there is none (scroll mode). */
    zoom?: number | null;
    /** − (−1), ＋ (1), or back to the whole page (0) — FlipSurface's own zoom. */
    onZoom?: (dir: 1 | -1 | 0) => void;
    /** A tap in the middle put the bar away: a first visit's pinned bar lets go. */
    onUnpin?: () => void;
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
  // A mouse gets the zoom in the bar (− 100% ＋); a finger pinches, and finds
  // the same buttons in 設定 rather than in a bar that is already full.
  let fine = $state(false);
  $effect(() => {
    const mq = window.matchMedia('(max-width: 520px)');
    const mf = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => {
      narrow = mq.matches;
      fine = mf.matches;
    };
    sync();
    mq.addEventListener('change', sync);
    mf.addEventListener('change', sync);
    return () => {
      mq.removeEventListener('change', sync);
      mf.removeEventListener('change', sync);
    };
  });
  const zoomMax = ZOOM_STEPS[ZOOM_STEPS.length - 1];

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

  // --- The drawers (一覧, 目次) close four ways: ×, a tap on the dimmed page
  //     beside them, Esc, or their button again. On a phone the grid used to
  //     cover 92% of the screen with a 31px strip as the only way out. Focus
  //     goes to × on open and back to the bar's button on close. ---
  let gridBtn: HTMLButtonElement | undefined = $state();
  let tocBtn: HTMLButtonElement | undefined = $state();
  let drawerClose: HTMLButtonElement | undefined = $state();
  function closeDrawers() {
    const back = gridOpen ? gridBtn : tocOpen ? tocBtn : null;
    gridOpen = false;
    tocOpen = false;
    back?.focus({ preventScroll: true });
  }
  function toggleToc() {
    if (tocOpen) return closeDrawers();
    tocOpen = true;
    gridOpen = false;
    panelOpen = false;
  }
  $effect(() => {
    if (gridOpen || tocOpen) drawerClose?.focus({ preventScroll: true });
  });
  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (gridOpen || tocOpen) {
      e.preventDefault();
      closeDrawers();
    } else if (panelOpen) {
      e.preventDefault();
      panelOpen = false;
    }
  }

  // Chrome steps aside after 3 s without input, like comimi's overlay. Any
  // pointer, key or wheel brings it back; it never hides while a panel is open,
  // while keyboard focus is inside it, or on a first visit before the first page
  // turn (`pinned` — the labels are how a new reader learns the controls).
  let idle = $state(false);
  // A centre tap puts the bar away even on a first visit (it used to stay
  // pinned, so the guide's 「真ん中をタップでメニュー」 did nothing until a turn).
  let tucked = $state(false);
  const hidden = $derived((tucked || (idle && !pinned)) && !panelOpen && !tocOpen && !gridOpen);
  let idleAtPress = false; // whether the chrome was away when the current press began
  // After a centre click hid it, the mouse's own small moves don't bring it back
  // (it came straight back, so a click could only ever hide it): a press, a key,
  // or the pointer at the top or bottom edge does.
  let quietMoves = false;
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
      if (e?.type === 'pointermove' && quietMoves) {
        const p = e as PointerEvent;
        if (p.pointerType === 'mouse' && p.clientY > 96 && p.clientY < innerHeight - 96) return;
      }
      if (e?.type === 'pointerdown') idleAtPress = hidden;
      quietMoves = false;
      tucked = false;
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
   * puts it away if it was up — from the very first visit. The press itself
   * already woke it, so what counts is how it was when the press began.
   */
  export function toggleMenu() {
    if (idleAtPress || panelOpen || tocOpen || gridOpen) return;
    onUnpin?.();
    clearTimeout(restTimer);
    idle = true;
    tucked = true;
    quietMoves = true;
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

<svelte:window onkeydown={onKey} />

{#snippet drawerBar(title: string)}
  <!-- sticky: × stays in reach however far the grid scrolls -->
  <div class="rc-drawer__bar">
    <p class="mono rc-drawer__title">{title}</p>
    <button class="rc-drawer__close" bind:this={drawerClose} onclick={closeDrawers}>
      <svg class="rc-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      <span class="mono">{i18n.t('rd.close')}</span>
    </button>
  </div>
{/snippet}

{#snippet modeIcon(mode: 'flip' | 'scroll', cls = 'rc-ico')}
  {#if mode === 'flip'}
    <svg class={cls} viewBox="0 0 24 24" aria-hidden="true"
      ><path d="M12 6.5C10 5 7 4.5 3 5v13c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5Zm0 0v13" /></svg
    >
  {:else}
    <svg class={cls} viewBox="0 0 24 24" aria-hidden="true"
      ><rect x="7" y="2.5" width="10" height="8" rx="1" /><rect x="7" y="13.5" width="10" height="8" rx="1" /></svg
    >
  {/if}
{/snippet}

{#snippet zoomRow()}
  <!-- the page's own zoom (FlipSurface): − , the level (a press goes back to the
       whole page), ＋ -->
  <button type="button" class="rc-zoom__btn" onclick={() => onZoom?.(-1)} disabled={(zoom ?? 1) <= 1} aria-label={i18n.t('rd.zoomOut')} title={i18n.t('rd.zoomOut')}>−</button>
  <button type="button" class="mono rc-zoom__pct" onclick={() => onZoom?.(0)} disabled={(zoom ?? 1) <= 1} aria-label={`${zoomLabel(zoom ?? 1)} — ${i18n.t('rd.zoomFit')}`} title={i18n.t('rd.zoomFit')}>{zoomLabel(zoom ?? 1)}</button>
  <button type="button" class="rc-zoom__btn" onclick={() => onZoom?.(1)} disabled={(zoom ?? 1) >= zoomMax} aria-label={i18n.t('rd.zoomIn')} title={i18n.t('rd.zoomIn')}>＋</button>
{/snippet}

<!-- Every control carries its name under its icon, on every screen: readers
     didn't know where to tap, and "AA" read as a text-size button. (An English
     bar on a very narrow phone keeps the names of the plainly drawn ones — ← ♡ ▦
     gear ? — in their tooltip only, so it stays one row.) -->
<header class="rc-top" class:is-idle={hidden}>
  <a class="rc-tool rc-tool--iconic rc-top__back" href={`/w/${work.slug}`} data-vt="back" aria-label={i18n.t('rd.overview')} title={i18n.t('rd.overview')}
    ><svg class="rc-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg
    ><span class="rc-tool__label">{i18n.t('rd.overview')}</span></a>
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
        class="rc-tool rc-tool--iconic"
        class:is-active={tocOpen}
        bind:this={tocBtn}
        onclick={toggleToc}
        aria-expanded={tocOpen}
        aria-label={i18n.t('rd.toc')}
        title={i18n.t('rd.toc')}
      ><svg class="rc-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.1M4.5 12h.1M4.5 18h.1" /></svg
        ><span class="rc-tool__label">{i18n.t('rd.toc')}</span></button>
    {/if}
    {#if narrow}
      <!-- Phones: one button, a switch between the two ways to read — both drawn,
           the one in use lit, its name under them (「めくり」 alone read like
           "turn the page"). A tap switches. -->
      <button
        class="rc-tool rc-modeSwitch"
        onclick={() => onSettings({ mode: settings.mode === 'flip' ? 'scroll' : 'flip' })}
        title={i18n.t('rd.modeSwitch')}
        aria-label={`${i18n.t('rd.modeNow').replace('{mode}', i18n.t(settings.mode === 'flip' ? 'rd.flip' : 'rd.scroll'))} — ${i18n.t('rd.modeSwitch')}`}
      ><span class="rc-modeSwitch__icons" aria-hidden="true"
          ><span class:is-on={settings.mode === 'flip'}>{@render modeIcon('flip', 'rc-ico rc-ico--sm')}</span
          ><span class:is-on={settings.mode === 'scroll'}>{@render modeIcon('scroll', 'rc-ico rc-ico--sm')}</span></span
        ><span class="rc-tool__label">{i18n.t(settings.mode === 'flip' ? 'rd.flip' : 'rd.scroll')}</span></button>
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
      class="rc-tool rc-tool--iconic rc-btn--heart"
      bind:this={heartEl}
      class:is-on={currentFaved}
      onclick={onToggleFavorite}
      aria-pressed={currentFaved}
      aria-label={i18n.t('rd.fav')}
      title={i18n.t('rd.fav')}
    ><svg class="rc-ico" viewBox="0 0 24 24" aria-hidden="true"><path d={HEART} /></svg
      ><span class="rc-tool__label">{i18n.t('rd.fav')}</span></button>
    <button
      class="rc-tool rc-tool--iconic"
      class:is-active={gridOpen}
      bind:this={gridBtn}
      onclick={() => (gridOpen ? closeDrawers() : openGrid())}
      title={i18n.t('rd.pages')}
      aria-label={i18n.t('rd.grid')}
      aria-expanded={gridOpen}
    ><svg class="rc-ico rc-ico--grid" viewBox="0 0 24 24" aria-hidden="true"
        ><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect
          x="3"
          y="14"
          width="7"
          height="7"
        /><rect x="14" y="14" width="7" height="7" /></svg
      ><span class="rc-tool__label">{i18n.t('rd.grid')}</span></button>
    {#if zoom !== null && fine}
      <!-- 拡大: the lettering is small on some screens, and nobody found ctrl+wheel -->
      <div class="rc-tool rc-zoom" role="group" aria-label={i18n.t('rd.zoom')} class:is-active={zoom > 1.001}>
        <span class="rc-zoom__row">{@render zoomRow()}</span>
        <span class="rc-tool__label">{i18n.t('rd.zoom')}</span>
      </div>
    {/if}
    <button class="rc-tool rc-btn--fs" onclick={fullscreen} title="Fullscreen (f)"
      ><svg class="rc-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg
      ><span class="rc-tool__label">{i18n.t('rd.full')}</span></button>
    <button
      class="rc-tool rc-tool--iconic"
      class:is-active={panelOpen}
      onclick={() => (panelOpen = !panelOpen)}
      title={`${i18n.t('rd.settings')} (s)`}
      aria-label={i18n.t('rd.set')}
      aria-expanded={panelOpen}
    ><svg class="rc-ico rc-ico--gear" viewBox="0 0 24 24" aria-hidden="true"
        ><circle cx="12" cy="12" r="7.2" stroke-width="3" stroke-dasharray="2.83 2.83" stroke-linecap="butt" /><circle cx="12" cy="12" r="5.4" /><circle
          cx="12"
          cy="12"
          r="2"
        /></svg
      ><span class="rc-tool__label">{i18n.t('rd.set')}</span></button>
    <button class="rc-tool rc-tool--iconic" onclick={onHelp} aria-label={i18n.t('rd.help')} title={i18n.t('rd.help')}
      ><svg class="rc-ico" viewBox="0 0 24 24" aria-hidden="true"
        ><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6M12 16.9v.1" /></svg
      ><span class="rc-tool__label">{i18n.t('rd.help')}</span></button>
  </div>
</header>

<footer class="rc-bottom" class:is-idle={hidden}>
  <span class="mono rc-bottom__counter">
    <span class="rc-bottom__num" bind:this={counterEl}>
      {String(cur + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      {#if currentChapter}<span class="rc-bottom__ch">· {currentChapter}</span>{/if}
    </span>
    {#if novelHref}
      <!-- only on pages of a novel part (lib/bookParts.ts novelHere), a real link,
           in the counter's row: as a pill above it, it sat 28px into the page -->
      <a class="rc-novel" href={novelHref} title={i18n.t('nv.inText')}>{i18n.t('nv.inTextShort')} <span aria-hidden="true">→</span></a>
    {/if}
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
  <!-- a tap outside closes 設定 — and only that: it used to turn the page under
       it and leave the panel open -->
  <button class="rc-panel__scrim" tabindex="-1" aria-label={i18n.t('rd.close')} onclick={() => (panelOpen = false)}></button>
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
      {#if settings.mode === 'flip' && settings.layout === 'double'}
        <!-- curl for spreads (and the cover opening); single pages always slide -->
        <div class="rc-panel__group">
          <span class="mono rc-panel__label">{i18n.t('rd.curl')}</span>
          <div class="rc-panel__opts">
            <button class="mono rc-opt" class:is-on={settings.curl} onclick={() => onSettings({ curl: true })}>{i18n.t('rd.on')}</button>
            <button class="mono rc-opt" class:is-on={!settings.curl} onclick={() => onSettings({ curl: false })}>{i18n.t('rd.off')}</button>
          </div>
        </div>
      {/if}
      {#if zoom !== null && !fine}
        <!-- phones: the bar is full, so the zoom buttons live here (pinch works too) -->
        <div class="rc-panel__group">
          <span class="mono rc-panel__label">{i18n.t('rd.zoom')}</span>
          <div class="rc-panel__opts rc-zoom rc-zoom--panel">{@render zoomRow()}</div>
          <p class="rc-panel__hint">{i18n.t('rd.zoomPinch')}</p>
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
          <span class="mono rc-panel__label">{i18n.t('rd.sound')}</span>
          <div class="rc-panel__opts">
            <button class="mono rc-opt" class:is-on={!soundOn} onclick={() => setSound(false)}>{i18n.t('rd.off')}</button>
            <button class="mono rc-opt" class:is-on={soundOn} onclick={() => setSound(true)}>{i18n.t('rd.soundOn')}</button>
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
    <button class="rc-toc__scrim" tabindex="-1" aria-label={i18n.t('rd.close')} onclick={closeDrawers}></button>
    <nav class="rc-toc__body rc-grid__body" aria-label={i18n.t('rd.pages')}>
      {@render drawerBar(i18n.t('rd.pages'))}
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
                  closeDrawers();
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
    <button class="rc-toc__scrim" tabindex="-1" aria-label={i18n.t('rd.close')} onclick={closeDrawers}></button>
    <nav class="rc-toc__body" aria-label={i18n.t('ov.chapters')}>
      {@render drawerBar(i18n.t('ov.chapters'))}
      <ul class="rc-toc__list">
        {#each chapterMarks as mark, i (mark.id)}
          <li>
            <button
              class="rc-toc__item"
              class:is-current={currentChapter === mark.title}
              onclick={() => {
                onJump(mark.sheet);
                closeDrawers();
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
  /* 「小説で読む →」 — a real link in the counter's row, on novel pages only. Its
     box stays inside the page's bottom margin; the tap area reaches 44px tall
     through an invisible extension above it. */
  .rc-novel {
    position: relative;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    padding: 0.2em 0.85em;
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: rgba(12, 12, 13, 0.88);
    color: var(--fg);
    font-family: var(--font-display-authored);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    white-space: nowrap;
    text-decoration: none;
    pointer-events: auto;
    transition: background-color 0.25s var(--ease);
  }
  .rc-novel::before {
    content: '';
    position: absolute;
    inset: -0.9rem -0.3rem -0.5rem;
  }
  @media (hover: hover) {
    .rc-novel:hover {
      background: var(--accent);
    }
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
  /* ← 概要: a labelled tool like the others — a full 44px target (it was 39×17
     on a phone), and narrower than the inline 「← 概要」 it replaces */
  .rc-top .rc-top__back {
    flex-shrink: 0;
    min-width: 2.75rem;
    text-decoration: none;
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
  /* the phone's めくり/スクロール switch: both ways drawn, the one in use lit */
  .rc-modeSwitch__icons {
    display: flex;
    gap: 0.1rem;
  }
  .rc-modeSwitch__icons > span {
    display: grid;
    place-items: center;
    padding: 0.05rem 0.1rem;
    border-radius: 3px;
    opacity: 0.45;
  }
  .rc-modeSwitch__icons > span.is-on {
    opacity: 1;
    background: var(--accent);
    color: var(--ink-fg);
  }
  .rc-ico--sm {
    width: 0.85rem;
    height: 0.85rem;
  }
  /* 拡大: − 100% ＋ in one labelled box */
  .rc-zoom {
    cursor: default;
  }
  .rc-zoom.is-active {
    color: var(--fg);
    border-color: var(--accent);
  }
  .rc-zoom__row {
    display: flex;
    align-items: center;
    gap: 0.1rem;
  }
  .rc-zoom__btn,
  .rc-zoom__pct {
    display: inline-grid;
    place-items: center;
    min-width: 1.45rem;
    height: 1.25rem;
    padding: 0 0.2rem;
    background: none;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--fg);
    font-size: 0.95rem;
    line-height: 1;
    cursor: pointer;
  }
  .rc-zoom__pct {
    min-width: 2.7rem;
    font-size: 0.6875rem;
    letter-spacing: 0.02em;
  }
  .rc-zoom__btn:disabled,
  .rc-zoom__pct:disabled {
    color: var(--fg-faint);
    cursor: default;
  }
  @media (hover: hover) {
    .rc-zoom__btn:not(:disabled):hover,
    .rc-zoom__pct:not(:disabled):hover {
      border-color: var(--accent);
    }
  }
  .rc-zoom__btn:focus-visible,
  .rc-zoom__pct:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  /* in 設定 on a phone: three real buttons */
  .rc-zoom--panel .rc-zoom__btn,
  .rc-zoom--panel .rc-zoom__pct {
    flex: 1;
    height: auto;
    min-height: 2.75rem;
    border-color: var(--line-strong);
    font-size: 1.1rem;
  }
  .rc-zoom--panel .rc-zoom__pct {
    font-size: 0.8rem;
  }
  /* a tap outside 設定 closes it, and nothing else */
  .rc-panel__scrim {
    position: fixed;
    inset: 0;
    z-index: 45;
    background: transparent;
    border: 0;
    cursor: default;
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
  /* An English bar on a very narrow phone: the plainly drawn tools (← ♡ ▦ gear ?
     目次) show their icon, their name in the tooltip and to screen readers, so the
     bar stays one row (it wrapped to three, ~100px of the page). The translation
     switch and the mode keep their words. Japanese fits as it is. */
  @media (max-width: 420px) {
    :global(html:not([lang='ja'])) .rc-tool--iconic .rc-tool__label {
      display: none;
    }
    :global(html:not([lang='ja'])) .rc-tool--iconic {
      min-width: 2.2rem;
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
    /* never wider than the screen: a long chapter title ellipsises instead */
    grid-template-columns: minmax(0, 1fr);
    gap: 0.5rem;
    padding: 0 var(--pad) calc(0.7rem + env(safe-area-inset-bottom));
    pointer-events: none;
  }
  .rc-bottom__counter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    color: var(--fg-dim);
  }
  .rc-bottom__counter .rc-novel {
    margin-left: auto;
  }
  /* inline-block so the MV punch (a `scale`) applies; inline boxes ignore transforms */
  .rc-bottom__num {
    display: inline-block;
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    background: rgba(8, 8, 10, 0.66);
    border: 0;
    cursor: pointer;
  }
  .rc-toc__body {
    position: relative;
    /* leaves a dimmed strip of the page to tap on a phone (it was 31px) */
    width: min(21rem, 82vw);
    height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--ink-bg-soft);
    border-left: 1px solid var(--line-strong);
    padding: 0 1.2rem calc(2rem + env(safe-area-inset-bottom));
  }
  .rc-drawer__bar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    margin: 0 -1.2rem 1rem;
    padding: calc(0.6rem + env(safe-area-inset-top)) 0.7rem 0.6rem 1.2rem;
    background: var(--ink-bg-soft);
    border-bottom: 1px solid var(--line);
  }
  .rc-drawer__title {
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    color: var(--fg-dim);
  }
  .rc-drawer__close {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 2.75rem;
    padding: 0 0.85rem 0 0.6rem;
    background: none;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    color: var(--fg);
    cursor: pointer;
    transition: border-color 0.25s var(--ease);
  }
  .rc-drawer__close .rc-ico {
    width: 1.15rem;
    height: 1.15rem;
  }
  .rc-drawer__close .mono {
    font-size: 0.6875rem;
    letter-spacing: 0.1em;
  }
  .rc-drawer__close:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  @media (hover: hover) {
    .rc-drawer__close:hover {
      border-color: var(--accent);
    }
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
    width: min(26rem, 84vw);
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
