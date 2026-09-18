<script lang="ts">
  import { supabase } from '../../lib/supabase';
  import { toPageRec } from '../../lib/storagePaths';
  import { resolveSheets, sheetIndexOf } from '../../lib/resolveSheets';
  import { sortedChapters } from '../../lib/chapterOrder';
  import { i18n } from '../../lib/i18n.svelte';
  import {
    loadSettings, saveSettings, loadProgress, saveProgress, loadUnlock, clearUnlock,
    loadFavorites, saveFavorites, takeHint,
  } from '../../lib/persistence';
  import ScrollSurface from './ScrollSurface.svelte';
  import FlipSurface from './FlipSurface.svelte';
  import ReaderChrome from './ReaderChrome.svelte';
  import NoteRail from './NoteRail.svelte';
  import HeartBurst from './HeartBurst.svelte';
  import type { Work, PageRec, Chapter, ChapterMark, ReaderSettings } from '../../lib/types';

  let { slug }: { slug: string } = $props();

  let work = $state<Work | null>(null);
  let pages = $state<PageRec[]>([]);
  let chapters = $state<Chapter[]>([]);
  let status = $state<'loading' | 'ready' | 'missing'>('loading');
  let settings = $state<ReaderSettings>({ layout: 'double', mode: 'flip', fit: 'height', translate: false });
  let cur = $state(0);
  let chrome = $state<ReaderChrome | null>(null);
  let highlightId = $state<string | null>(null);
  let favorites = $state<string[]>([]);
  let bursts = $state<{ id: number; x: number; y: number }[]>([]);
  let toast = $state<string | null>(null);
  let peel = $state(false);

  const coverSolo = $derived(work?.cover_solo ?? true);
  const sheets = $derived(
    resolveSheets(pages, { layout: settings.layout, coverSolo }),
  );
  const currentSheet = $derived(sheets[cur] ?? null);
  const hasNote = $derived(Boolean(currentSheet?.pages.some((p) => p.note)));
  const characters = $derived(work?.characters ?? []);
  const anyBubbles = $derived(pages.some((p) => p.bubbles?.length));
  const hasBubbles = $derived(Boolean(currentSheet?.pages.some((p) => p.bubbles?.length)));
  const showRail = $derived(hasNote || (settings.translate && hasBubbles));
  const dirSign = $derived(work?.direction === 'rtl' ? -1 : 1);

  const orderedPages = $derived([...pages].sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1)));
  const pageOrder = $derived(orderedPages.map((p) => p.id));
  function pageNumberOf(pageId: string): number {
    return pageOrder.indexOf(pageId) + 1;
  }

  const chapterMarks: ChapterMark[] = $derived(
    sortedChapters(chapters)
      .map((ch) => {
        const first = pageOrder
          .map((id) => pages.find((p) => p.id === id)!)
          .find((p) => p.chapterId === ch.id);
        const cover = pages.find((p) => p.id === ch.cover_page_id) ?? first;
        return {
          id: ch.id,
          title: ch.title,
          sheet: first ? sheetIndexOf(sheets, first.id) : -1,
          coverUrl: cover?.thumbUrl ?? null,
        };
      })
      .filter((m) => m.sheet >= 0),
  );
  const currentChapter = $derived(
    chapterMarks.filter((m) => m.sheet <= cur).at(-1)?.title ?? null,
  );

  $effect(() => {
    void load();
  });

  async function load() {
    const { data: w } = await supabase.from('works').select('*').eq('slug', slug).maybeSingle();
    if (!w) {
      status = 'missing';
      return;
    }
    work = w as Work;
    document.title = `${work.title} — Pressroom`;

    settings = loadSettings(work.id, {
      layout: work.default_layout,
      mode: work.default_mode,
      fit: work.default_mode === 'flip' ? 'height' : 'width',
      translate: false,
    });

    let [{ data: rows }, { data: chRows }] = await Promise.all([
      supabase.from('pages').select('*').eq('work_id', work.id).order('sort_key'),
      supabase.from('chapters').select('*').eq('work_id', work.id).order('sort_key'),
    ]);
    // Locked work: RLS returns at most the cover row to anon. The gate lives
    // on the book page — redirect there unless this tab already unlocked it
    // (author sessions get everything from the plain select above).
    if (work.read_locked && (rows ?? []).length <= 1) {
      const key = loadUnlock(work.id);
      const { data: unlockedRows } = key
        ? await supabase.rpc('unlock_pages', { p_work_id: work.id, p_password: key })
        : { data: null };
      if (!unlockedRows?.length) {
        if (key) clearUnlock(work.id); // password changed since
        location.replace(`/w/${slug}`);
        return;
      }
      rows = unlockedRows;
    }
    pages = (rows ?? []).map(toPageRec);
    chapters = (chRows ?? []) as Chapter[];

    // Deep link (?p=pageId from the overview page) wins over saved progress.
    const requested = new URLSearchParams(location.search).get('p');
    const target = requested ?? loadProgress(work.id);
    if (target) {
      const idx = sheetIndexOf(
        resolveSheets(pages, { layout: settings.layout, coverSolo: work.cover_solo }),
        target,
      );
      if (idx > 0) cur = idx;
    }
    favorites = loadFavorites(work.id);
    status = 'ready';

    // First visit to any book: a page-corner peel says "turn me", and a toast
    // teaches the long-press. Once per browser, never again.
    if (takeHint('reader')) {
      peel = settings.mode === 'flip';
      say(i18n.t('rd.modeHint'), 2600);
      setTimeout(() => (peel = false), 1500);
      setTimeout(() => say(i18n.t('rd.favHint'), 2600), 2800);
    }
  }

  /** Jump to a sheet. Scroll mode reads its start index only at mount, so it
      has to be scrolled there explicitly. */
  function jump(index: number) {
    setCur(index);
    if (settings.mode === 'scroll') {
      document
        .querySelector(`.ss__row[data-index="${cur}"]`)
        ?.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
    }
  }

  function jumpToPage(pageId: string) {
    const idx = sheetIndexOf(sheets, pageId);
    if (idx >= 0) jump(idx);
  }

  // --- "ここすき" favourites (idea and burst adapted from comimi, MIT) ---
  let toastTimer = 0;
  function say(message: string, ms = 1600) {
    toast = message;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast = null), ms);
  }

  let burstId = 0;
  function burst(x: number, y: number) {
    const id = ++burstId;
    bursts = [...bursts, { id, x, y }];
    setTimeout(() => (bursts = bursts.filter((b) => b.id !== id)), 1700);
  }

  function storeFavorites(next: string[], message: string) {
    favorites = next;
    const kept = work ? saveFavorites(work.id, next) : false;
    say(kept ? message : i18n.t('rd.favLocal'));
  }

  /** Long-press always adds (and always plays the burst), like comimi. */
  function addFavorite(pageId: string, at: { x: number; y: number }) {
    burst(at.x, at.y);
    const next = favorites.includes(pageId) ? favorites : [...favorites, pageId];
    storeFavorites(next, i18n.t('rd.favAdd'));
  }

  function removeFavorite(pageId: string) {
    storeFavorites(favorites.filter((id) => id !== pageId), i18n.t('rd.favRemove'));
  }

  /** The chrome's heart: un-fave whatever is faved on this sheet, else fave its first page. */
  function toggleCurrentFavorite() {
    const ids = currentSheet?.pages.filter((p) => !p.isBlank).map((p) => p.id) ?? [];
    if (!ids.length) return;
    if (ids.some((id) => favorites.includes(id))) {
      storeFavorites(favorites.filter((id) => !ids.includes(id)), i18n.t('rd.favRemove'));
    } else {
      storeFavorites([...favorites, ids[0]], i18n.t('rd.favAdd'));
    }
  }

  async function sharePage() {
    const pageId = currentSheet?.pages[0]?.id;
    if (!pageId) return;
    const url = new URL(location.href);
    url.searchParams.set('p', pageId);
    try {
      await navigator.clipboard.writeText(url.toString());
      say(i18n.t('rd.copied'));
    } catch {
      say(i18n.t('rd.copyFail'));
    }
  }

  // Long-press detection. Hands off anything that owns its own tap; movement
  // past 10px, a second finger or a scroll (pointercancel) cancels it.
  let press: { x: number; y: number; timer: number } | null = null;
  let pressedAt = 0;
  function cancelPress() {
    if (press) clearTimeout(press.timer);
    press = null;
  }
  function pressDown(e: PointerEvent) {
    cancelPress();
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-bub], [data-nav], button, a, input')) return;
    const pageId = target.closest<HTMLElement>('[data-page-id]')?.dataset.pageId;
    if (!pageId) return;
    const x = e.clientX;
    const y = e.clientY;
    press = {
      x,
      y,
      timer: window.setTimeout(() => {
        press = null;
        pressedAt = performance.now();
        navigator.vibrate?.(12);
        addFavorite(pageId, { x, y });
      }, 500),
    };
  }
  function pressMove(e: PointerEvent) {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress();
  }
  function pressMenu(e: MouseEvent) {
    // Android raises the context menu on the same long press — swallow that one.
    if (press || performance.now() - pressedAt < 800) e.preventDefault();
  }

  function setCur(index: number) {
    cur = Math.max(0, Math.min(sheets.length - 1, index));
    const first = sheets[cur]?.pages[0];
    if (work && first) saveProgress(work.id, first.id);
  }

  function patchSettings(patch: Partial<ReaderSettings>) {
    // Keep the page being read visible across layout/mode changes.
    const anchor = currentSheet?.pages[0]?.id ?? null;
    settings = { ...settings, ...patch };
    if (work) saveSettings(work.id, settings);
    if (anchor) {
      const idx = sheetIndexOf(
        resolveSheets(pages, { layout: settings.layout, coverSolo }),
        anchor,
      );
      cur = idx >= 0 ? idx : 0;
    }
  }

  // --- Preload neighbours (n±2) with the browser's own srcset selection ---
  const warmed = new Set<string>();
  $effect(() => {
    if (status !== 'ready' || settings.mode === 'scroll') return;
    for (let i = Math.max(0, cur - 2); i <= Math.min(sheets.length - 1, cur + 2); i++) {
      for (const page of sheets[i].pages) {
        if (warmed.has(page.id)) continue;
        warmed.add(page.id);
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.setAttribute('imagesrcset', `${page.medUrl} 900w, ${page.fullUrl} 1600w`);
        link.setAttribute('imagesizes', sheets[i].kind === 'spread' ? '50vw' : '100vw');
        document.head.appendChild(link);
      }
    }
  });

  // --- Keyboard: physical arrows (direction-aware), f, s, Home/End ---
  function onKey(e: KeyboardEvent) {
    if (status !== 'ready') return;
    const editing = (e.target as HTMLElement | null)?.closest('input, textarea, select');
    if (editing) return;
    if (e.key === 'f') {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.();
      return;
    }
    if (e.key === 's') {
      chrome?.togglePanel();
      return;
    }
    if (settings.mode !== 'flip') return;
    switch (e.key) {
      case 'ArrowLeft':
        setCur(cur - dirSign);
        break;
      case 'ArrowRight':
        setCur(cur + dirSign);
        break;
      case ' ':
      case 'PageDown':
        e.preventDefault();
        setCur(cur + 1);
        break;
      case 'PageUp':
        setCur(cur - 1);
        break;
      case 'Home':
        setCur(0);
        break;
      case 'End':
        setCur(sheets.length - 1);
        break;
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="reader spread spread--ink">
  {#if status === 'loading'}
    <p class="mono reader__status"><span class="mk-loader" aria-hidden="true"></span> {i18n.t('rd.loading')}</p>
  {:else if status === 'missing' || !work}
    <div class="reader__status">
      <p class="mono">{i18n.t('rd.missing')}</p>
      <a class="mono reader__back" href="/">← {i18n.t('ov.back')}</a>
    </div>
  {:else if pages.length === 0}
    <div class="reader__status">
      <p class="mono">{i18n.t('rd.noPages')}</p>
      <a class="mono reader__back" href="/">← {i18n.t('ov.back')}</a>
    </div>
  {:else}
    <div
      class="reader__pages"
      onpointerdown={pressDown}
      onpointermove={pressMove}
      onpointerup={cancelPress}
      onpointercancel={cancelPress}
      oncontextmenu={pressMenu}
    >
    {#key `${settings.mode}-${settings.layout}-${work.direction}`}
      {#if settings.mode === 'scroll'}
        <ScrollSurface
          {sheets}
          direction={work.direction}
          fit={settings.fit}
          startIndex={cur}
          {pageNumberOf}
          onCurrent={setCur}
          translateOn={settings.translate}
          {characters}
          {highlightId}
          onHighlight={(id) => (highlightId = id)}
        />
      {:else}
        <FlipSurface
          {sheets}
          direction={work.direction}
          fit={settings.fit}
          {cur}
          {pageNumberOf}
          onNavigate={setCur}
          translateOn={settings.translate}
          {characters}
          {highlightId}
          onHighlight={(id) => (highlightId = id)}
        />
      {/if}
    {/key}
    </div>
    {#each bursts as b (b.id)}
      <HeartBurst x={b.x} y={b.y} />
    {/each}
    {#if peel}
      <span
        class="reader__peel mk-peel is-peeling"
        class:mk-peel--left={work.direction === 'rtl'}
        class:mk-peel--right={work.direction !== 'rtl'}
        aria-hidden="true"
      ></span>
    {/if}
    {#if showRail && currentSheet}
      <NoteRail
        sheet={currentSheet}
        mode={settings.mode}
        {pageNumberOf}
        translateOn={settings.translate}
        {characters}
        {highlightId}
        onHighlight={(id) => (highlightId = id)}
      />
    {/if}
    <ReaderChrome
      bind:this={chrome}
      {work}
      {settings}
      {cur}
      total={sheets.length}
      {currentSheet}
      {hasNote}
      hasBubbles={anyBubbles}
      {chapterMarks}
      {currentChapter}
      {pageNumberOf}
      pages={orderedPages}
      {favorites}
      onSettings={patchSettings}
      onJump={jump}
      onJumpPage={jumpToPage}
      onToggleFavorite={toggleCurrentFavorite}
      onRemoveFavorite={removeFavorite}
      onShare={sharePage}
    />
  {/if}
  <p class="mono reader__toast" class:is-on={toast} role="status" aria-live="polite">{toast ?? ''}</p>
</div>

<style>
  .reader {
    position: relative;
    z-index: 1;
    min-height: 100svh;
  }
  .reader__status {
    min-height: 100svh;
    display: grid;
    place-content: center;
    gap: 1.2rem;
    text-align: center;
    padding: var(--pad);
  }
  .reader__back:hover {
    color: var(--accent);
  }
  /* Wrapper only for the long-press listeners — no box of its own. */
  .reader__pages {
    display: contents;
  }
  .reader__peel {
    position: fixed;
    bottom: 0;
    z-index: 30;
    width: 9rem;
    aspect-ratio: 1;
    pointer-events: none;
  }
  .reader__peel.mk-peel--right {
    right: 0;
  }
  .reader__peel.mk-peel--left {
    left: 0;
  }
  .reader__toast {
    position: fixed;
    left: 50%;
    bottom: calc(3.4rem + env(safe-area-inset-bottom));
    z-index: 60;
    translate: -50% 0.6rem;
    max-width: calc(100vw - 2 * var(--pad));
    padding: 0.55em 1em;
    background: rgba(12, 12, 13, 0.94);
    border: 1px solid var(--line-strong);
    color: var(--fg);
    font-size: 0.62rem;
    text-align: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s var(--ease), translate 0.25s var(--ease);
  }
  .reader__toast.is-on {
    opacity: 1;
    translate: -50% 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .reader__toast {
      transition: none;
    }
  }
</style>
