<script lang="ts">
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { generateNKeysBetween } from 'fractional-indexing';
  import { supabase } from '../../lib/supabase';
  import { toPageRec } from '../../lib/storagePaths';
  import NotePanel from './NotePanel.svelte';
  import type { PageRow, Direction } from '../../lib/types';

  let {
    workId,
    direction,
    coverPageId,
    pages,
    onChanged,
  }: {
    workId: string;
    direction: Direction;
    coverPageId: string | null;
    pages: PageRow[];
    onChanged: () => void;
  } = $props();

  /** A drag unit: one page, or a bound spread that travels together. */
  interface Unit {
    id: string;
    pages: PageRow[];
  }

  const FLIP_MS = 200;
  let units = $state<Unit[]>([]);
  let selected = $state<string[]>([]); // page ids, in click order
  let viewLtr = $state(false);
  let error = $state<string | null>(null);

  // Rebuild units whenever the parent reloads pages.
  $effect(() => {
    units = buildUnits(pages);
    selected = selected.filter((id) => pages.some((p) => p.id === id));
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
      if (partners && partners.length === 2) {
        out.push({ id: `pair-${p.spread_pair_id}`, pages: partners });
        partners.forEach((m) => consumed.add(m.id));
      } else {
        consumed.add(p.id);
        out.push({ id: p.id, pages: [p] });
      }
    }
    return out;
  }

  /** Page number (1-based, key order) for labels. */
  function pageNo(page: PageRow): number {
    const ordered = [...pages].sort((a, b) => (a.sort_key < b.sort_key ? -1 : 1));
    return ordered.findIndex((p) => p.id === page.id) + 1;
  }

  /** A bound pair whose members have another page's key between them. */
  function isSplit(unit: Unit): boolean {
    if (unit.pages.length !== 2) return false;
    const [a, b] = unit.pages;
    return pages.some(
      (p) => p.id !== a.id && p.id !== b.id && p.sort_key > a.sort_key && p.sort_key < b.sort_key,
    );
  }

  function handleConsider(e: CustomEvent<DndEvent<Unit>>) {
    units = e.detail.items;
  }

  async function handleFinalize(e: CustomEvent<DndEvent<Unit>>) {
    units = e.detail.items;
    await persistDrop(e.detail.info.id);
  }

  async function persistDrop(unitId: string) {
    const idx = units.findIndex((u) => u.id === unitId);
    if (idx === -1) return;
    const prev = idx > 0 ? units[idx - 1] : null;
    const next = idx < units.length - 1 ? units[idx + 1] : null;
    const prevKey = prev ? prev.pages[prev.pages.length - 1].sort_key : null;
    const nextKey = next ? next.pages[0].sort_key : null;
    const unit = units[idx];
    try {
      // Moving a pair also normalizes its members to adjacent keys.
      const newKeys = generateNKeysBetween(prevKey, nextKey, unit.pages.length);
      for (let i = 0; i < unit.pages.length; i++) {
        const { error: err } = await supabase
          .from('pages')
          .update({ sort_key: newKeys[i] })
          .eq('id', unit.pages[i].id);
        if (err) throw new Error(err.message);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    onChanged();
  }

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

  /** Two selected singles occupying adjacent units → bindable. */
  const bindable = $derived.by(() => {
    if (selectedPages.length !== 2) return false;
    if (selectedPages.some((p) => p.spread_pair_id)) return false;
    const ia = units.findIndex((u) => u.id === selectedPages[0].id);
    const ib = units.findIndex((u) => u.id === selectedPages[1].id);
    return ia !== -1 && ib !== -1 && Math.abs(ia - ib) === 1;
  });

  const unbindable = $derived(
    selectedPages.length >= 1 && selectedPages.every((p) => p.spread_pair_id),
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

  async function setCover() {
    if (selectedPages.length !== 1) return;
    const { error: err } = await supabase
      .from('works')
      .update({ cover_page_id: selectedPages[0].id })
      .eq('id', workId);
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
        {#if direction === 'rtl'}
          <button class="mono arr__btn" onclick={() => (viewLtr = !viewLtr)}>
            VIEW: {gridRtl ? 'RTL' : 'LTR'}
          </button>
        {/if}
        <button class="mono arr__btn" onclick={bind} disabled={!bindable}
          title={selectedPages.length === 2 && !bindable ? 'Pages must be adjacent to bind' : ''}
        >⧉ BIND SPREAD</button>
        <button class="mono arr__btn" onclick={unbind} disabled={!unbindable}>UNBIND</button>
        <button class="mono arr__btn" onclick={setCover} disabled={selectedPages.length !== 1}>
          SET COVER
        </button>
        <button class="mono arr__btn arr__btn--danger" onclick={removeSelected} disabled={!selectedPages.length}>
          DELETE
        </button>
      </div>
    </div>

    {#if error}
      <p class="mono arr__error">{error}</p>
    {/if}

    <div
      class="arr__grid"
      class:is-rtl={gridRtl}
      use:dndzone={{ items: units, flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
      onconsider={handleConsider}
      onfinalize={handleFinalize}
    >
      {#each units as unit (unit.id)}
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
    </div>
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
    gap: 1rem;
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
  .arr__btn {
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    padding: 0.5em 0.9em;
    cursor: pointer;
    transition: color 0.25s var(--ease), border-color 0.25s var(--ease);
  }
  .arr__btn:hover:not(:disabled) {
    color: var(--fg);
    border-color: var(--fg-dim);
  }
  .arr__btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .arr__btn--danger:hover:not(:disabled) {
    color: #e8a31a;
    border-color: #e8a31a;
  }
  .arr__error {
    color: #e8a31a;
  }
  .arr__grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    min-height: 8rem;
  }
  .arr__grid.is-rtl {
    direction: rtl;
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
