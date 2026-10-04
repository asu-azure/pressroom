<script lang="ts">
  import { supabase } from '../../lib/supabase';
  import { toPageRec } from '../../lib/storagePaths';
  import { cropFocus, frontOnly } from '../../lib/coverCrop';
  import { pictureOf } from '../../lib/cleanPage';
  import { resolveSheets, sheetIndexOf } from '../../lib/resolveSheets';
  import { sortedChapters } from '../../lib/chapterOrder';
  import { novelHere, partStart } from '../../lib/bookParts';
  import { openingLayout, pickedLayout, novelCardDue, NARROW_QUERY } from '../../lib/readerUi';
  import { langName } from '../../lib/bookInfo';
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
  import { pageByNumber, lockedOverview, readerSearch } from '../../lib/readerLink';
  import { inTimeline } from '../../data/timeline';
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
  // A first visit keeps the labelled bar up until the first page turn (or until
  // the reader puts it away with a tap in the middle).
  let barPinned = $state(!seenHint('bar'));
  function unpinBar() {
    if (!barPinned) return;
    barPinned = false;
    markHint('bar');
  }
  // The flip surface's zoom, for the bar's − 100% ＋ (and keys + − 0).
  let flip = $state<FlipSurface | null>(null);
  let zoom = $state(1);
  // a mouse: the guide speaks of clicks and keys, the bar carries the zoom
  const mouse = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

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

  // 「このパートは小説です」: vol. 2 opens on its novel part as scanned Thai pages,
  // and readers didn't learn the text reads in Japanese in the novel reader. A
  // small card (not a wall) the first time a novel part is on screen this
  // session; dismissed — or left behind by reading on out of the part — it stays
  // away for the session (sessionStorage).
  const cardKey = $derived(work ? `pressroom:novelcard:${work.id}` : '');
  let cardDismissed = $state(false);
  let cardShown = false;
  const onNovelPart = $derived(
    Boolean(currentSheet && chapters.some((c) => c.kind === 'novel') && novelHere(chapters, currentSheet.pages)),
  );
  const novelCard = $derived(
    status === 'ready' && novelCardDue({ onNovelPart, hasText: Boolean(novelHref), dismissed: cardDismissed }),
  );
  function dismissCard() {
    cardDismissed = true;
    try {
      sessionStorage.setItem(cardKey, '1');
    } catch {
      /* private mode: gone for this page view only */
    }
  }
  $effect(() => {
    if (novelCard) cardShown = true;
    else if (cardShown && !onNovelPart && !cardDismissed) dismissCard();
  });

  // The reading guide's four tips, for the mode, the direction and the pointer
  // in use: a mouse clicks, has ← → and the bar's zoom; a finger taps and pinches.
  const guideTips = $derived.by((): GuideTip[] => {
    const t = i18n.t.bind(i18n);
    const flip = settings.mode === 'flip';
    const rtl = work?.direction === 'rtl';
    const setBody = !flip
      ? anyBubbles ? 'gd.setBody' : 'gd.setBodyNoTrans'
      : mouse
        ? anyBubbles ? 'gd.setBodyZoom' : 'gd.setBodyZoomNoTrans'
        : anyBubbles ? 'gd.setBodyTouch' : 'gd.setBodyTouchNoTrans';
    return [
      flip
        ? mouse
          ? { icon: rtl ? 'turn-rtl' : 'turn-ltr', title: t('gd.turnClick'), body: t(rtl ? 'gd.turnRtlClick' : 'gd.turnLtrClick') }
          : { icon: rtl ? 'turn-rtl' : 'turn-ltr', title: t('gd.turn'), body: t(rtl ? 'gd.turnRtl' : 'gd.turnLtr') }
        : { icon: 'scroll', title: t('gd.scroll'), body: t('gd.scrollBody') },
      flip
        ? mouse
          ? { icon: 'menu', title: t('gd.menuClick'), body: t('gd.menuClickBody') }
          : { icon: 'menu', title: t('gd.menu'), body: t('gd.menuBody') }
        : { icon: 'menu', title: t('gd.menuScroll'), body: t('gd.menuScrollBody') },
      { icon: 'settings', title: t('gd.set'), body: t(setBody) },
      mouse
        ? { icon: 'fav', title: t('gd.favClick'), body: t('gd.favClickBody') }
        : { icon: 'fav', title: t('gd.fav'), body: t('gd.favBody') },
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

  // The address follows the page on screen (lib/readerLink.ts readerSearch): the
  // link a reader came in by (?p= ?n= ?ch=) outranks the saved place, so a reload
  // — iOS reloads background tabs — sent them back to where they entered.
  // replaceState only (no history entries), and not on every scroll report:
  // Safari refuses more than 100 calls in 30 s.
  let urlTimer = 0;
  $effect(() => {
    if (status !== 'ready') return;
    const id = sheets[cur]?.pages[0]?.id ?? null;
    clearTimeout(urlTimer);
    urlTimer = window.setTimeout(() => {
      const next = readerSearch(location.search, id);
      if (next === location.search) return;
      try {
        history.replaceState(history.state, '', `${location.pathname}${next}${location.hash}`);
      } catch {
        /* throttled — the next turn tries again */
      }
    }, 400);
    return () => clearTimeout(urlTimer);
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
        // the overview opens its gate and brings the visitor back here (?go=)
        location.replace(lockedOverview(slug, location.pathname, location.search));
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
    // and parts, SHARE), ?ch=chapterId — the start of a part, for the novel
    // reader's last page — or ?n=66, a page number (the timeline): those two
    // can't see a locked book's page rows (lib/readerLink.ts).
    const params = new URLSearchParams(location.search);
    const part = params.get('ch');
    const requested =
      params.get('p') ??
      (part ? partStart(part, pages) : null) ??
      pageByNumber(params.get('n'), [...pages].sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1)));
    const target = requested ?? loadProgress(work.id);
    if (target) {
      const opened = resolveSheets(pages, { layout: settings.layout, coverSolo: work.cover_solo });
      const idx = sheetIndexOf(opened, target);
      if (idx > 0) {
        cur = idx;
        // arriving by a link (a part, the timeline, a shared page) is a place
        // too: a reader who leaves before turning a page comes back here
        if (requested) saveProgress(work.id, opened[idx].pages[0].id);
      }
    }
    favorites = loadFavorites(work.id);
    try {
      cardDismissed = sessionStorage.getItem(`pressroom:novelcard:${work.id}`) === '1';
    } catch {
      cardDismissed = false;
    }
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

  function storeFavorites(next: string[], message: string, adding = next.length > favorites.length) {
    favorites = next;
    const kept = work ? saveFavorites(work.id, next) : false;
    // an addition also says where the ここすき are kept: 一覧 → ここすき
    const where = '\n' + i18n.t('rd.favWhere');
    if (!kept) say(i18n.t('rd.favLocal'));
    else if (adding && firstSave()) say(i18n.t('rd.favSaved') + where, 3400);
    else if (adding) say(message + where, 2600);
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
    storeFavorites(next, i18n.t('rd.favAdd'), true); // a page already faved is still "added" to the eye
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

  // --- Preload neighbours (n±2) with the browser's own srcset selection. Only
  //     the window's links stay in <head>: they used to pile up for every page
  //     read, holding every picture of the book in memory on a phone. ---
  const warmed = new Map<string, HTMLLinkElement>();
  $effect(() => {
    if (status !== 'ready' || settings.mode === 'scroll') return;
    const keep = new Set<string>();
    for (let i = Math.max(0, cur - 2); i <= Math.min(sheets.length - 1, cur + 2); i++) {
      for (const page of sheets[i].pages) {
        const pic = pictureOf(page, typesetOn);
        const key = pic.clean ? `${page.id}:clean` : page.id; // switching to typeset warms the clean pictures
        keep.add(key);
        if (warmed.has(key)) continue;
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.setAttribute('imagesrcset', `${pic.med} 900w, ${pic.full} 1600w`);
        link.setAttribute('imagesizes', sheets[i].kind === 'spread' ? '50vw' : '100vw');
        document.head.appendChild(link);
        warmed.set(key, link);
      }
    }
    for (const [key, link] of warmed) {
      if (keep.has(key)) continue;
      link.remove();
      warmed.delete(key);
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
    // the bar's zoom from the keyboard: + − and 0 for the whole page (never with
    // ctrl/⌘ — that is the browser's own zoom)
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        flip?.zoomBy(1);
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        flip?.zoomBy(-1);
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        flip?.zoomFit();
        return;
      }
    }
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
          bind:this={flip}
          {sheets}
          direction={work.direction}
          fit={settings.fit}
          {cur}
          layout={settings.layout}
          {pageNumberOf}
          onNavigate={setCur}
          onMenu={() => chrome?.toggleMenu()}
          onZoom={(z) => (zoom = z)}
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
      novelHref={novelCard ? null : novelHref}
      zoom={settings.mode === 'flip' ? zoom : null}
      onZoom={(dir) => (dir === 0 ? flip?.zoomFit() : flip?.zoomBy(dir))}
      onUnpin={unpinBar}
      onSettings={patchSettings}
      onJump={jump}
      onJumpPage={jumpToPage}
      onToggleFavorite={toggleCurrentFavorite}
      onRemoveFavorite={removeFavorite}
      onShare={sharePage}
      onHelp={() => (guideOpen = true)}
    />
    {#if novelCard && novelHref && !guideOpen}
      <!-- a small card, not a wall: the page stays readable and turnable -->
      <aside class="reader__novelCard" aria-label={i18n.t('ov.parts')}>
        <!-- one sentence a line: wrapped as one, it broke inside 小説リーダー -->
        <p class="reader__novelText">
          {#each i18n.t('rd.novelCard').replace('{lang}', langName(i18n.lang, i18n.lang)).split(/(?<=[。.])\s*/) as line, li (li)}<span>{line}</span>{/each}
        </p>
        <div class="reader__novelBtns">
          <a class="mono reader__novelGo" href={novelHref} data-sfx="open">{i18n.t('rd.novelCardGo')} →</a>
          <button type="button" class="mono reader__novelStay" onclick={dismissCard}>{i18n.t('rd.novelCardStay')}</button>
        </div>
      </aside>
    {/if}
    {#if guideOpen}
      <ReadingGuide tips={guideTips} onClose={closeGuide} timeline={inTimeline(work?.slug)} />
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
  /* 「このパートは小説です」 — above the page counter, clear of the bar's controls */
  .reader__novelCard {
    position: fixed;
    left: 50%;
    bottom: calc(3.6rem + env(safe-area-inset-bottom));
    z-index: 45;
    translate: -50% 0;
    width: min(24rem, calc(100vw - 2 * var(--pad)));
    display: grid;
    gap: 0.7rem;
    padding: 0.9rem 1rem;
    background: rgba(12, 12, 13, 0.95);
    border: 1px solid var(--accent);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  }
  @media (prefers-reduced-motion: no-preference) {
    .reader__novelCard {
      animation: reader-card 0.3s var(--ease) both;
    }
  }
  @keyframes reader-card {
    from {
      opacity: 0;
      translate: -50% 0.6rem;
    }
  }
  .reader__novelText {
    margin: 0;
    font-family: var(--font-display-authored);
    font-size: 0.86rem;
    line-height: 1.6;
    color: var(--fg);
    word-break: auto-phrase;
  }
  .reader__novelText > span {
    display: block;
  }
  .reader__novelBtns {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .reader__novelGo,
  .reader__novelStay {
    flex: 1 1 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    padding: 0 1em;
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-align: center;
    cursor: pointer;
  }
  .reader__novelGo {
    background: var(--accent);
    color: var(--ink-fg);
    text-decoration: none;
  }
  .reader__novelStay {
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
  }
  @media (hover: hover) {
    .reader__novelGo:hover {
      background: #1d33c4;
    }
    .reader__novelStay:hover {
      color: var(--fg);
      border-color: var(--fg-dim);
    }
  }
  /* Toasts sit under the top bar, never over a control: at the bottom they hid
     「小説で読む」 and the page counter on a phone. */
  .reader__toast {
    white-space: pre-line; /* the ここすき toast is two lines: what, and where */
    line-height: 1.7;
    word-break: auto-phrase;
    /* left: 50% would cap a shrink-to-fit box at half the screen and wrap every line */
    width: max-content;
    position: fixed;
    left: 50%;
    top: calc(4.9rem + env(safe-area-inset-top));
    z-index: 60;
    translate: -50% -0.6rem;
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
