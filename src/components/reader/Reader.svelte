<script lang="ts">
  import { supabase } from '../../lib/supabase';
  import { toPageRec } from '../../lib/storagePaths';
  import { resolveSheets, sheetIndexOf } from '../../lib/resolveSheets';
  import { sortedChapters } from '../../lib/chapterOrder';
  import { i18n } from '../../lib/i18n.svelte';
  import { loadSettings, saveSettings, loadProgress, saveProgress } from '../../lib/persistence';
  import ScrollSurface from './ScrollSurface.svelte';
  import FlipSurface from './FlipSurface.svelte';
  import ReaderChrome from './ReaderChrome.svelte';
  import NoteRail from './NoteRail.svelte';
  import type { Work, PageRec, Chapter, ChapterMark, ReaderSettings } from '../../lib/types';

  let { slug }: { slug: string } = $props();

  let work = $state<Work | null>(null);
  let pages = $state<PageRec[]>([]);
  let chapters = $state<Chapter[]>([]);
  let status = $state<'loading' | 'ready' | 'missing'>('loading');
  let settings = $state<ReaderSettings>({ layout: 'double', mode: 'flip', fit: 'height' });
  let cur = $state(0);
  let chrome = $state<ReaderChrome | null>(null);

  const sheets = $derived(
    resolveSheets(pages, { layout: settings.layout, coverSolo: true }),
  );
  const currentSheet = $derived(sheets[cur] ?? null);
  const hasNote = $derived(Boolean(currentSheet?.pages.some((p) => p.note)));
  const dirSign = $derived(work?.direction === 'rtl' ? -1 : 1);

  const pageOrder = $derived(
    [...pages].sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1)).map((p) => p.id),
  );
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
    });

    const [{ data: rows }, { data: chRows }] = await Promise.all([
      supabase.from('pages').select('*').eq('work_id', work.id).order('sort_key'),
      supabase.from('chapters').select('*').eq('work_id', work.id).order('sort_key'),
    ]);
    pages = (rows ?? []).map(toPageRec);
    chapters = (chRows ?? []) as Chapter[];

    // Deep link (?p=pageId from the overview page) wins over saved progress.
    const requested = new URLSearchParams(location.search).get('p');
    const target = requested ?? loadProgress(work.id);
    if (target) {
      const idx = sheetIndexOf(
        resolveSheets(pages, { layout: settings.layout, coverSolo: true }),
        target,
      );
      if (idx > 0) cur = idx;
    }
    status = 'ready';
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
        resolveSheets(pages, { layout: settings.layout, coverSolo: true }),
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
    <p class="mono reader__status">{i18n.t('rd.loading')}</p>
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
    {#key `${settings.mode}-${settings.layout}-${work.direction}`}
      {#if settings.mode === 'scroll'}
        <ScrollSurface
          {sheets}
          direction={work.direction}
          fit={settings.fit}
          startIndex={cur}
          {pageNumberOf}
          onCurrent={setCur}
        />
      {:else}
        <FlipSurface
          {sheets}
          direction={work.direction}
          fit={settings.fit}
          {cur}
          {pageNumberOf}
          onNavigate={setCur}
        />
      {/if}
    {/key}
    {#if hasNote && currentSheet}
      <NoteRail sheet={currentSheet} mode={settings.mode} {pageNumberOf} />
    {/if}
    <ReaderChrome
      bind:this={chrome}
      {work}
      {settings}
      {cur}
      total={sheets.length}
      {currentSheet}
      {hasNote}
      {chapterMarks}
      {currentChapter}
      {pageNumberOf}
      onSettings={patchSettings}
      onJump={setCur}
    />
  {/if}
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
</style>
