<script lang="ts">
  import { supabase } from '../../lib/supabase';
  import { toPageRec } from '../../lib/storagePaths';
  import { cropFocus, frontOnly } from '../../lib/coverCrop';
  import { pictureOf } from '../../lib/cleanPage';
  import { resolveSheets, sheetIndexOf } from '../../lib/resolveSheets';
  import { sortedChapters } from '../../lib/chapterOrder';
  import { novelHere, partStart } from '../../lib/bookParts';
  import { openingLayout, pickedLayout, NARROW_QUERY } from '../../lib/readerUi';
  import { i18n } from '../../lib/i18n.svelte';
  import {
    loadSettings, saveSettings, loadProgress, saveProgress, loadUnlock, clearUnlock,
    loadFavorites, saveFavorites, takeHint, seenHint, markHint,
  } from '../../lib/persistence';
  import ScrollSurface from './ScrollSurface.svelte';
  import FlipSurface from './FlipSurface.svelte';
  import ReaderChrome from './ReaderChrome.svelte';
  import NoteRail from './NoteRail.svelte';
  import HeartBurst from './HeartBurst.svelte';
  import ReadingGuide, { type GuideTip } from './ReadingGuide.svelte';
  import { sfx } from '../../scripts/sound';
  import { saveShelfmarks } from '../../lib/shelfmarks';
  import type { Work, PageRec, Chapter, ChapterMark, ReaderSettings } from '../../lib/types';

  let { slug }: { slug: string } = $props();

  let work = $state<Work | null>(null);
  let pages = $state<PageRec[]>([]);
  let chapters = $state<Chapter[]>([]);
  let status = $state<'loading' | 'ready' | 'missing'>('loading');
  let settings = $state<ReaderSettings>({ layout: 'double', mode: 'flip', fit: 'height', translate: false, translateMode: 'typeset', curl: true });
  let cur = $state(0);
  let chrome = $state<ReaderChrome | null>(null);
  let highlightId = $state<string | null>(null);
  let favorites = $state<string[]>([]);
  let bursts = $state<{ id: number; x: number; y: number }[]>([]);
  let toast = $state<string | null>(null);
  let peel = $state(false);
  let guideOpen = $state(false);
  // A first visit keeps the labelled bar up until the first page turn.
  let barPinned = $state(!seenHint('bar'));

  const coverSolo = $derived(work?.cover_solo ?? true);
  const sheets = $derived(
    resolveSheets(pages, { layout: settings.layout, coverSolo }),
  );
  const currentSheet = $derived(sheets[cur] ?? null);
  const hasNote = $derived(Boolean(currentSheet?.pages.some((p) => p.note)));
  const characters = $derived(work?.characters ?? []);
  const anyBubbles = $derived(pages.some((p) => p.bubbles?.length));
  const hasBubbles = $derived(Boolean(currentSheet?.pages.some((p) => p.bubbles?.length)));
  // Lettered into the balloons, or as hotspots + the side list (the 'notes' mode).
  const typesetOn = $derived(settings.translate && settings.translateMode !== 'notes');
  const notesOn = $derived(settings.translate && settings.translateMode === 'notes');
  const showRail = $derived(hasNote || (notesOn && hasBubbles));
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
          coverFocus: cropFocus(cover?.crop),
          kind: ch.kind ?? null,
        };
      })
      .filter((m) => m.sheet >= 0),
  );
  // 「小説はテキストで読めます」: only on a novel part's pages (lib/bookParts.ts), and
  // only when the text exists in the reader's language.
  const novelHref = $derived(
    work?.novel_langs?.includes(i18n.lang) && currentSheet && novelHere(chapters, currentSheet.pages)
      ? `/w/${work.slug}/novel?lang=${i18n.lang}`
      : null,
  );

  // The reading guide's four tips, for the mode and direction in use.
  const guideTips = $derived.by((): GuideTip[] => {
    const t = i18n.t.bind(i18n);
    const flip = settings.mode === 'flip';
    const rtl = work?.direction === 'rtl';
    return [
      flip
        ? { icon: rtl ? 'turn-rtl' : 'turn-ltr', title: t('gd.turn'), body: t(rtl ? 'gd.turnRtl' : 'gd.turnLtr') }
        : { icon: 'scroll', title: t('gd.scroll'), body: t('gd.scrollBody') },
      flip
        ? { icon: 'menu', title: t('gd.menu'), body: t('gd.menuBody') }
        : { icon: 'menu', title: t('gd.menuScroll'), body: t('gd.menuScrollBody') },
      { icon: 'settings', title: t('gd.set'), body: t(anyBubbles ? 'gd.setBody' : 'gd.setBodyNoTrans') },
      { icon: 'fav', title: t('gd.fav'), body: t('gd.favBody') },
    ];
  });

  function closeGuide() {
    guideOpen = false;
    // after the guide, once: a page-corner peel says "turn me"
    if (takeHint('reader') && settings.mode === 'flip') {
      peel = true;
      setTimeout(() => (peel = false), 1500);
    }
  }
  // Shelfmarks: the same progress and favourites, as positions the shelf can
  // draw (付箋 and しおり on the 3D book — see lib/shelfmarks.ts).
  $effect(() => {
    if (!work || !pageOrder.length) return;
    const first = sheets[cur]?.pages[0];
    const at = first ? pageOrder.indexOf(first.id) : -1;
    saveShelfmarks(work.id, {
      total: pageOrder.length,
      at: at >= 0 ? at : null,
      favs: favorites.map((id) => pageOrder.indexOf(id)).filter((i) => i >= 0),
    });
  });

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

    const saved = loadSettings(work.id, {
      layout: work.default_layout,
      mode: work.default_mode,
      fit: work.default_mode === 'flip' ? 'height' : 'width',
      // a translated book opens translated for a reader of that language
      // (a reader who has ever changed a setting keeps their own choice)
      translate: Boolean(work.translations?.includes(i18n.lang)),
      translateMode: 'typeset',
      curl: true,
    });
    // A phone held upright opens on single pages; a layout the reader picked
    // themselves still wins (lib/readerUi.ts).
    settings = {
      ...saved,
      layout: openingLayout({
        chosen: pickedLayout(saved, work.default_layout),
        workDefault: work.default_layout,
        narrow: window.matchMedia(NARROW_QUERY).matches,
      }),
    };
    if (settings.translateMode !== 'typeset' && settings.translateMode !== 'notes') {
      settings = { ...settings, translateMode: 'typeset' }; // saved before the mode existed
    }

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
    // The cover page is the whole wraparound; the book opens on its front
    // (lib/coverCrop.ts) — only when it really is the first leaf — trimmed to
    // the shape of the first page inside, so cover and pages are one size.
    const recs = (rows ?? []).map(toPageRec);
    const inner = recs.find((p, i) => i > 0 && !p.isBlank);
    pages = recs.map((p, i) => (i === 0 && p.id === work.cover_page_id ? frontOnly(p, work.cover_crop, inner) : p));
    chapters = (chRows ?? []) as Chapter[];

    // Deep links win over saved progress: ?p=pageId (the overview's thumbnails
    // and parts, SHARE), or ?ch=chapterId — the start of a part, for the novel
    // reader's last page, which can't see a locked book's page rows.
    const params = new URLSearchParams(location.search);
    const part = params.get('ch');
    const requested = params.get('p') ?? (part ? partStart(part, pages) : null);
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

    // First visit to the page reader: the guide (which also teaches the
    // long-press), then the page-corner peel. Once per browser; ？ reopens it.
    if (takeHint('guide-reader')) guideOpen = true;
    else if (takeHint('reader') && settings.mode === 'flip') {
      peel = true;
      setTimeout(() => (peel = false), 1500);
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
    sfx.sparkle();
    const id = ++burstId;
    bursts = [...bursts, { id, x, y }];
    setTimeout(() => (bursts = bursts.filter((b) => b.id !== id)), 1700);
  }

  function storeFavorites(next: string[], message: string) {
    const adding = next.length > favorites.length;
    favorites = next;
    const kept = work ? saveFavorites(work.id, next) : false;
    if (!kept) say(i18n.t('rd.favLocal'));
    else if (adding && firstSave()) say(i18n.t('rd.favSaved'), 2800);
    else say(message);
  }

  /** The first time anything is saved, the toast says where: this browser only.
      Once per browser — 「しおりについて」 in 設定 has the rest. */
  function firstSave(): boolean {
    if (seenHint('saved')) return false;
    markHint('saved');
    return true;
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

  // A paper tick per page turn. Scroll mode reports pages as they pass, so it
  // is thinned to one tick per 250 ms rather than a rattle.
  let lastTick = 0;
  function setCur(index: number) {
    const next = Math.max(0, Math.min(sheets.length - 1, index));
    const now = performance.now();
    const moved = next !== cur;
    if (moved && (settings.mode === 'flip' || now - lastTick > 250)) {
      lastTick = now;
      sfx.tick();
    }
    cur = next;
    const first = sheets[cur]?.pages[0];
    if (work && first) saveProgress(work.id, first.id);
    if (!moved) return; // scroll mode reports the row it mounted on — not a turn
    if (barPinned) {
      barPinned = false; // the first page turn: from now on the bar steps aside
      markHint('bar');
    }
    if (firstSave()) say(i18n.t('rd.markSaved'), 2800);
  }

  function patchSettings(patch: Partial<ReaderSettings>) {
    // Keep the page being read visible across layout/mode changes.
    const anchor = currentSheet?.pages[0]?.id ?? null;
    // a layout picked here is the reader's own and outranks the phone rule
    if (patch.layout) patch = { ...patch, layoutChosen: true };
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
        const pic = pictureOf(page, typesetOn);
        const key = pic.clean ? `${page.id}:clean` : page.id; // switching to typeset warms the clean pictures
        if (warmed.has(key)) continue;
        warmed.add(key);
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.setAttribute('imagesrcset', `${pic.med} 900w, ${pic.full} 1600w`);
        link.setAttribute('imagesizes', sheets[i].kind === 'spread' ? '50vw' : '100vw');
        document.head.appendChild(link);
      }
    }
  });

  // --- Keyboard: physical arrows (direction-aware), f, s, Home/End ---
  function onKey(e: KeyboardEvent) {
    if (status !== 'ready' || guideOpen) return; // the guide owns the keys (Esc closes it)
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
          translateOn={notesOn}
          {typesetOn}
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
          onMenu={() => chrome?.toggleMenu()}
          translateOn={notesOn}
          {typesetOn}
          curl={settings.curl}
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
        translateOn={notesOn}
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
      pinned={barPinned}
      {novelHref}
      onSettings={patchSettings}
      onJump={jump}
      onJumpPage={jumpToPage}
      onToggleFavorite={toggleCurrentFavorite}
      onRemoveFavorite={removeFavorite}
      onShare={sharePage}
      onHelp={() => (guideOpen = true)}
    />
    {#if guideOpen}
      <ReadingGuide tips={guideTips} onClose={closeGuide} />
    {/if}
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
