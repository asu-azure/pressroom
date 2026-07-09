<script lang="ts">
  import { untrack } from 'svelte';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
  import { supabase } from '../../lib/supabase';
  import { toPageRec } from '../../lib/storagePaths';
  import { sortedChapters, flattenPages } from '../../lib/chapterOrder';
  import NotePanel from './NotePanel.svelte';
  import type { PageRow, Chapter, Direction } from '../../lib/types';

  let {
    workId,
    direction,
    coverPageId,
    chapters,
    pages,
    onChanged,
  }: {
    workId: string;
    direction: Direction;
    coverPageId: string | null;
    chapters: Chapter[];
    pages: PageRow[];
    onChanged: () => void;
  } = $props();

  /** A drag unit: one page, or a bound spread that travels together. */
  interface Unit {
    id: string;
    pages: PageRow[];
  }
  interface Section {
    id: string; // 'none' or chapter id
    chapter: Chapter | null;
    units: Unit[];
  }

  const FLIP_MS = 200;
  const DND_TYPE = 'pressroom-pages';
  let sections = $state<Section[]>([]);
  let selected = $state<string[]>([]); // page ids, in click order
  let viewLtr = $state(false);
  let error = $state<string | null>(null);
  let busy = $state(false);

  // Rebuild sections whenever the parent reloads pages/chapters. The selected
  // cleanup must not be tracked: reading AND writing `selected` here would
  // retrigger the effect forever and freeze the page.
  $effect(() => {
    sections = buildSections(pages, chapters);
    untrack(() => {
      const kept = selected.filter((id) => pages.some((p) => p.id === id));
      if (kept.length !== selected.length) selected = kept;
    });
  });

  function buildUnits(rows: PageRow[]): Unit[] {
    const ordered = [...rows].sort((a, b) => (a.sort_key < b.sort_key ? -1 : 1));
    const byPair = new Map<string, PageRow[]>();
    for (const p of ordered) {
      if (p.spread_pair_id) {
        byPair.set(p.spread_pair_id, [...(byPair.get(p.spread_pair_id) ?? []), p]);
      }
    }
    const out: Unit[] = [];
    const consumed = new Set<string>();
    for (const p of ordered) {
      if (consumed.has(p.id)) continue;
      const partners = p.spread_pair_id ? byPair.get(p.spread_pair_id) : undefined;
      // A pair only travels as one card when both members share the section.
      if (partners && partners.length === 2 && partners.every((m) => rows.includes(m))) {
        out.push({ id: `pair-${p.spread_pair_id}`, pages: partners });
        partners.forEach((m) => consumed.add(m.id));
      } else {
        consumed.add(p.id);
        out.push({ id: p.id, pages: [p] });
      }
    }
    return out;
  }

  function buildSections(rows: PageRow[], chs: Chapter[]): Section[] {
    const front = rows.filter((p) => !p.chapter_id);
    const out: Section[] = [];
    if (front.length || chs.length === 0) {
      out.push({ id: 'none', chapter: null, units: buildUnits(front) });
    }
    for (const ch of sortedChapters(chs)) {
      out.push({
        id: ch.id,
        chapter: ch,
        units: buildUnits(rows.filter((p) => p.chapter_id === ch.id)),
      });
    }
    return out;
  }

  /** Page number (1-based) in flattened book order, for labels. */
  const flatOrder = $derived(flattenPages(pages, chapters).map((p) => p.id));
  function pageNo(page: PageRow): number {
    return flatOrder.indexOf(page.id) + 1;
  }

  /** A bound pair whose members have another page's key between them. */
  function isSplit(unit: Unit): boolean {
    if (unit.pages.length !== 2) return false;
    const [a, b] = unit.pages;
    return pages.some(
      (p) => p.id !== a.id && p.id !== b.id && p.sort_key > a.sort_key && p.sort_key < b.sort_key,
    );
  }

  function handleConsider(sectionIdx: number, e: CustomEvent<DndEvent<Unit>>) {
    sections[sectionIdx].units = e.detail.items;
  }

  async function handleFinalize(sectionIdx: number, e: CustomEvent<DndEvent<Unit>>) {
    sections[sectionIdx].units = e.detail.items;
    // Both zones fire finalize on a cross-section move; persist only where
    // the dragged unit landed.
    if (e.detail.items.some((u) => u.id === e.detail.info.id)) {
      await persistDrop(sectionIdx, e.detail.info.id);
    }
  }

  async function persistDrop(sectionIdx: number, unitId: string) {
    const flatUnits = sections.flatMap((s) => s.units);
    const idx = flatUnits.findIndex((u) => u.id === unitId);
    if (idx === -1) return;
    const prev = idx > 0 ? flatUnits[idx - 1] : null;
    const next = idx < flatUnits.length - 1 ? flatUnits[idx + 1] : null;
    const prevKey = prev ? prev.pages[prev.pages.length - 1].sort_key : null;
    const nextKey = next ? next.pages[0].sort_key : null;
    const unit = flatUnits[idx];
    const chapterId = sections[sectionIdx].chapter?.id ?? null;
    try {
      // Moving a pair also normalizes its members to adjacent keys.
      const newKeys = generateNKeysBetween(prevKey, nextKey, unit.pages.length);
      for (let i = 0; i < unit.pages.length; i++) {
        const { error: err } = await supabase
          .from('pages')
          .update({ sort_key: newKeys[i], chapter_id: chapterId })
          .eq('id', unit.pages[i].id);
        if (err) throw new Error(err.message);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    onChanged();
  }

  // ---- Chapter management ----

  async function newChapter() {
    const title = prompt('Chapter title:');
    if (!title?.trim()) return;
    const last = sortedChapters(chapters).at(-1);
    const { error: err } = await supabase.from('chapters').insert({
      work_id: workId,
      title: title.trim(),
      sort_key: generateKeyBetween(last?.sort_key ?? null, null),
    });
    if (err) error = err.message;
    onChanged();
  }

  async function renameChapter(ch: Chapter) {
    const title = prompt('Chapter title:', ch.title);
    if (!title?.trim() || title.trim() === ch.title) return;
    const { error: err } = await supabase
      .from('chapters')
      .update({ title: title.trim() })
      .eq('id', ch.id);
    if (err) error = err.message;
    onChanged();
  }

  async function deleteChapter(ch: Chapter) {
    if (!confirm(`Dissolve chapter "${ch.title}"? Its pages move to the front matter.`)) return;
    const { error: e1 } = await supabase
      .from('pages')
      .update({ chapter_id: null })
      .eq('chapter_id', ch.id);
    const { error: e2 } = await supabase.from('chapters').delete().eq('id', ch.id);
    if (e1 || e2) error = (e1 ?? e2)!.message;
    onChanged();
  }

  async function moveChapter(ch: Chapter, dir: -1 | 1) {
    const order = sortedChapters(chapters);
    const i = order.findIndex((c) => c.id === ch.id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    busy = true;
    try {
      // Slot the chapter just past its neighbour (collision-free single update).
      const neighbour = order[j];
      const beyond = order[j + dir];
      const newKey =
        dir === -1
          ? generateKeyBetween(beyond?.sort_key ?? null, neighbour.sort_key)
          : generateKeyBetween(neighbour.sort_key, beyond?.sort_key ?? null);
      const { error: err } = await supabase
        .from('chapters')
        .update({ sort_key: newKey })
        .eq('id', ch.id);
      if (err) throw new Error(err.message);

      // Converge the global page keyspace on the new flattened order in one
      // bulk upsert (the unique constraint is deferred to commit).
      const newChapters = chapters.map((c) => (c.id === ch.id ? { ...c, sort_key: newKey } : c));
      const flat = flattenPages(pages, newChapters);
      const keys = generateNKeysBetween(null, null, flat.length);
      const { error: upErr } = await supabase
        .from('pages')
        .upsert(flat.map((p, k) => ({ ...p, sort_key: keys[k] })));
      if (upErr) throw new Error(upErr.message);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
    onChanged();
  }

  // ---- Selection actions ----

  function toggleSelect(pageId: string) {
    selected = selected.includes(pageId)
      ? selected.filter((id) => id !== pageId)
      : [...selected, pageId];
  }

  const selectedPages = $derived(
    selected
      .map((id) => pages.find((p) => p.id === id))
      .filter((p): p is PageRow => Boolean(p)),
  );

  /** Two selected singles occupying adjacent units in the same section. */
  const bindable = $derived.by(() => {
    if (selectedPages.length !== 2) return false;
    if (selectedPages.some((p) => p.spread_pair_id)) return false;
    for (const s of sections) {
      const ia = s.units.findIndex((u) => u.id === selectedPages[0].id);
      const ib = s.units.findIndex((u) => u.id === selectedPages[1].id);
      if (ia !== -1 && ib !== -1) return Math.abs(ia - ib) === 1;
    }
    return false;
  });

  const unbindable = $derived(
    selectedPages.length >= 1 && selectedPages.every((p) => p.spread_pair_id),
  );

  const chapterCoverable = $derived(
    selectedPages.length === 1 && selectedPages[0].chapter_id !== null,
  );

  async function bind() {
    if (!bindable) return;
    const pairId = crypto.randomUUID();
    const inKeyOrder = [...selectedPages].sort((a, b) => (a.sort_key < b.sort_key ? -1 : 1));
    for (const p of inKeyOrder) {
      const { error: err } = await supabase
        .from('pages')
        .update({ spread_pair_id: pairId })
        .eq('id', p.id);
      if (err) {
        error = err.message;
        break;
      }
    }
    selected = [];
    onChanged();
  }

  async function unbind() {
    const pairIds = [...new Set(selectedPages.map((p) => p.spread_pair_id).filter(Boolean))];
    for (const pairId of pairIds) {
      const { error: err } = await supabase
        .from('pages')
        .update({ spread_pair_id: null })
        .eq('spread_pair_id', pairId);
      if (err) error = err.message;
    }
    selected = [];
    onChanged();
  }

  async function setBookCover() {
    if (selectedPages.length !== 1) return;
    const { error: err } = await supabase
      .from('works')
      .update({ cover_page_id: selectedPages[0].id })
      .eq('id', workId);
    if (err) error = err.message;
    selected = [];
    onChanged();
  }

  async function setChapterCover() {
    if (!chapterCoverable) return;
    const page = selectedPages[0];
    const { error: err } = await supabase
      .from('chapters')
      .update({ cover_page_id: page.id })
      .eq('id', page.chapter_id!);
    if (err) error = err.message;
    selected = [];
    onChanged();
  }

  async function removeSelected() {
    if (!selectedPages.length) return;
    if (!confirm(`Delete ${selectedPages.length} page(s)? This cannot be undone.`)) return;
    for (const p of selectedPages) {
      const { error: err } = await supabase.from('pages').delete().eq('id', p.id);
      if (err) {
        error = err.message;
        continue;
      }
      await supabase.storage.from('pages').remove([p.image_path, p.med_path, p.thumb_path]);
    }
    selected = [];
    onChanged();
  }

  async function saveNote(pageId: string, note: string | null) {
    const { error: err } = await supabase.from('pages').update({ note }).eq('id', pageId);
    if (err) error = err.message;
    onChanged();
  }

  const gridRtl = $derived(direction === 'rtl' && !viewLtr);
  const notePage = $derived(selectedPages.length === 1 ? selectedPages[0] : null);
</script>

<div class="arr" class:has-panel={notePage}>
  <div class="arr__main">
    <div class="arr__bar">
      <span class="mono arr__hint">
        {#if selectedPages.length === 0}
          CLICK TO SELECT · DRAG TO REORDER {gridRtl ? '· READS RIGHT → LEFT' : ''}
        {:else}
          {selectedPages.length} SELECTED
        {/if}
      </span>
      <div class="arr__actions">
        <button class="mono arr__btn" onclick={newChapter}>+ CHAPTER</button>
        {#if direction === 'rtl'}
          <button class="mono arr__btn" onclick={() => (viewLtr = !viewLtr)}>
            VIEW: {gridRtl ? 'RTL' : 'LTR'}
          </button>
        {/if}
        <button class="mono arr__btn" onclick={bind} disabled={!bindable}
          title={selectedPages.length === 2 && !bindable ? 'Pages must be adjacent, unbound, and in the same chapter' : ''}
        >⧉ BIND SPREAD</button>
        <button class="mono arr__btn" onclick={unbind} disabled={!unbindable}>UNBIND</button>
        <button class="mono arr__btn" onclick={setBookCover} disabled={selectedPages.length !== 1}>
          BOOK COVER
        </button>
        <button class="mono arr__btn" onclick={setChapterCover} disabled={!chapterCoverable}>
          CH. COVER
        </button>
        <button class="mono arr__btn arr__btn--danger" onclick={removeSelected} disabled={!selectedPages.length}>
          DELETE
        </button>
      </div>
    </div>

    {#if error}
      <p class="mono arr__error">{error}</p>
    {/if}
    {#if busy}
      <p class="mono">REBINDING…</p>
    {/if}

    {#each sections as section, si (section.id)}
      <section class="arr__section">
        <header class="arr__secHead">
          <span class="mono arr__secTitle">
            {section.chapter ? section.chapter.title : chapters.length ? 'FRONT MATTER' : 'PAGES'}
            <span class="arr__secCount">· {section.units.reduce((n, u) => n + u.pages.length, 0)}P</span>
          </span>
          {#if section.chapter}
            <div class="arr__secActions">
              <button class="mono arr__mini" onclick={() => moveChapter(section.chapter!, -1)} title="Move chapter up">↑</button>
              <button class="mono arr__mini" onclick={() => moveChapter(section.chapter!, 1)} title="Move chapter down">↓</button>
              <button class="mono arr__mini" onclick={() => renameChapter(section.chapter!)}>RENAME</button>
              <button class="mono arr__mini arr__mini--danger" onclick={() => deleteChapter(section.chapter!)}>DISSOLVE</button>
            </div>
          {/if}
        </header>
        <div
          class="arr__grid"
          class:is-rtl={gridRtl}
          use:dndzone={{ items: section.units, flipDurationMs: FLIP_MS, type: DND_TYPE, dropTargetStyle: {} }}
          onconsider={(e) => handleConsider(si, e)}
          onfinalize={(e) => handleFinalize(si, e)}
        >
          {#each section.units as unit (unit.id)}
            {@const split = isSplit(unit)}
            <div
              class="arr__unit"
              class:is-pair={unit.pages.length === 2}
              class:is-split={split}
              role="listitem"
            >
              {#if unit.pages.length === 2}
                <div class="arr__pairMark regmark" aria-hidden="true"></div>
              {/if}
              {#each unit.pages as page (page.id)}
                {@const rec = toPageRec(page)}
                <button
                  class="arr__card"
                  class:is-selected={selected.includes(page.id)}
                  onclick={() => toggleSelect(page.id)}
                >
                  <img src={rec.thumbUrl} alt={`Page ${pageNo(page)}`} loading="lazy" draggable="false" />
                  <span class="mono arr__num">{String(pageNo(page)).padStart(2, '0')}</span>
                  {#if page.id === coverPageId}
                    <span class="mono arr__flag arr__flag--cover">COVER</span>
                  {:else if section.chapter && page.id === section.chapter.cover_page_id}
                    <span class="mono arr__flag arr__flag--chcover">CH. COVER</span>
                  {/if}
                  {#if page.note}
                    <span class="arr__noteDot" title="Has note"></span>
                  {/if}
                </button>
              {/each}
              {#if split}
                <span class="mono arr__splitWarn">PAIR SPLIT — READER PULLS THESE TOGETHER</span>
              {/if}
            </div>
          {/each}
          {#if section.units.length === 0}
            <p class="mono arr__empty">DROP PAGES HERE</p>
          {/if}
        </div>
      </section>
    {/each}
  </div>

  {#if notePage}
    <NotePanel
      page={toPageRec(notePage)}
      pageNumber={pageNo(notePage)}
      onSave={(note) => saveNote(notePage.id, note)}
      onClose={() => (selected = [])}
    />
  {/if}
</div>

<style>
  .arr {
    display: grid;
    gap: 1.4rem;
    align-items: start;
  }
  .arr.has-panel {
    grid-template-columns: 1fr min(20rem, 34vw);
  }
  @media (max-width: 860px) {
    .arr.has-panel {
      grid-template-columns: 1fr;
    }
  }
  .arr__main {
    display: grid;
    gap: 1.2rem;
    min-width: 0;
  }
  .arr__bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.8rem;
  }
  .arr__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .arr__btn,
  .arr__mini {
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    padding: 0.5em 0.9em;
    cursor: pointer;
    transition: color 0.25s var(--ease), border-color 0.25s var(--ease);
  }
  .arr__btn:hover:not(:disabled),
  .arr__mini:hover {
    color: var(--fg);
    border-color: var(--fg-dim);
  }
  .arr__btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .arr__btn--danger:hover:not(:disabled),
  .arr__mini--danger:hover {
    color: #e8a31a;
    border-color: #e8a31a;
  }
  .arr__mini {
    padding: 0.3em 0.6em;
    font-size: 0.58rem;
  }
  .arr__error {
    color: #e8a31a;
  }
  .arr__section {
    display: grid;
    gap: 0.7rem;
  }
  .arr__secHead {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.6rem;
    border-bottom: 1px solid var(--line);
    padding-bottom: 0.45rem;
  }
  .arr__secTitle {
    color: var(--fg);
  }
  .arr__secCount {
    color: var(--fg-faint);
  }
  .arr__secActions {
    display: flex;
    gap: 0.4rem;
  }
  .arr__grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    min-height: 5rem;
    padding-bottom: 1.2rem;
  }
  .arr__grid.is-rtl {
    direction: rtl;
  }
  .arr__empty {
    align-self: center;
    color: var(--fg-faint);
    border: 1px dashed var(--line);
    padding: 1.2em 2em;
    direction: ltr;
  }
  .arr__unit {
    position: relative;
    display: flex;
    gap: 2px;
  }
  .arr__unit.is-pair {
    border: 1px solid var(--line-strong);
    padding: 3px;
  }
  .arr__unit.is-split {
    border-color: #e8a31a;
  }
  .arr__pairMark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2;
    background: var(--bg);
  }
  .arr__card {
    position: relative;
    display: block;
    width: clamp(5.4rem, 11vw, 8rem);
    aspect-ratio: 1131 / 1600;
    padding: 0;
    border: 1px solid var(--line);
    background: var(--bg-soft);
    cursor: grab;
    overflow: hidden;
  }
  .arr__card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }
  .arr__card.is-selected {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .arr__num {
    position: absolute;
    top: 3px;
    left: 4px;
    font-size: 0.55rem;
    color: #f4f1ea;
    mix-blend-mode: difference;
    direction: ltr;
  }
  .arr__flag {
    position: absolute;
    bottom: 3px;
    left: 4px;
    font-size: 0.5rem;
    padding: 0.2em 0.5em;
    direction: ltr;
  }
  .arr__flag--cover {
    background: var(--accent);
    color: var(--ink-fg);
  }
  .arr__flag--chcover {
    background: #e8a31a;
    color: #1a1407;
  }
  .arr__noteDot {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #e8a31a;
  }
  .arr__splitWarn {
    position: absolute;
    bottom: -1.4rem;
    left: 0;
    font-size: 0.5rem;
    color: #e8a31a;
    white-space: nowrap;
    direction: ltr;
  }
</style>
