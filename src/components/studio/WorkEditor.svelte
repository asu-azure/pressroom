<script lang="ts">
  import { supabase } from '../../lib/supabase';
  import { requireSession, watchSignOut } from '../../lib/authGuard';
  import Arranger from './Arranger.svelte';
  import PdfUploader from './PdfUploader.svelte';
  import RichTextEditor from './RichTextEditor.svelte';
  import CoverCropper from './CoverCropper.svelte';
  import { toPageRec } from '../../lib/storagePaths';
  import type { Work, PageRow, Chapter, Character, CoverCrop } from '../../lib/types';

  const CAST_COLORS = ['#2742f0', '#e8a31a', '#18c4d6', '#d6455f', '#6aa0ff', '#4caf7d', '#b06ad6'];

  let { workId }: { workId: string } = $props();

  let work = $state<Work | null>(null);
  let pages = $state<PageRow[]>([]);
  let chapters = $state<Chapter[]>([]);
  let tab = $state<'pages' | 'meta'>('pages');
  let error = $state<string | null>(null);
  let savedFlash = $state(false);
  let cropOpen = $state(false);

  // The current cover page (for the crop tool), enriched with URLs.
  const coverRec = $derived.by(() => {
    if (!work?.cover_page_id) return null;
    const row = pages.find((p) => p.id === work!.cover_page_id);
    return row ? toPageRec(row) : null;
  });

  async function saveCoverCrop(crop: CoverCrop | null) {
    const { error: err } = await supabase
      .from('works')
      .update({ cover_crop: crop })
      .eq('id', workId);
    if (err) error = err.message;
    cropOpen = false;
    await loadWork();
  }

  // Meta form fields (bound copies; committed on save)
  let meta = $state({
    title: '',
    slug: '',
    description: '',
    foreword: '',
    status: 'oneshot' as Work['status'],
    direction: 'rtl' as Work['direction'],
    default_layout: 'double' as Work['default_layout'],
    default_mode: 'flip' as Work['default_mode'],
    cover_solo: true,
    tagsText: '',
    characters: [] as Character[],
  });

  function addCharacter() {
    meta.characters = [
      ...meta.characters,
      { id: crypto.randomUUID(), name: '', color: CAST_COLORS[meta.characters.length % CAST_COLORS.length] },
    ];
  }
  function removeCharacter(id: string) {
    meta.characters = meta.characters.filter((c) => c.id !== id);
  }

  $effect(() => {
    void init();
  });

  async function init() {
    if (!(await requireSession())) return;
    watchSignOut();
    await Promise.all([loadWork(), loadPages(), loadChapters()]);
  }

  async function loadChapters() {
    const { data, error: err } = await supabase
      .from('chapters')
      .select('*')
      .eq('work_id', workId)
      .order('sort_key');
    if (err) error = err.message;
    else chapters = data as Chapter[];
  }

  async function loadWork() {
    const { data, error: err } = await supabase.from('works').select('*').eq('id', workId).single();
    if (err) {
      error = err.message;
      return;
    }
    work = data as Work;
    meta = {
      title: work.title,
      slug: work.slug,
      description: work.description,
      foreword: work.foreword,
      status: work.status,
      direction: work.direction,
      default_layout: work.default_layout,
      default_mode: work.default_mode,
      cover_solo: work.cover_solo ?? true,
      tagsText: work.tags.join(', '),
      characters: (work.characters ?? []).map((c) => ({ ...c })),
    };
  }

  async function loadPages() {
    const { data, error: err } = await supabase
      .from('pages')
      .select('*')
      .eq('work_id', workId)
      .order('sort_key');
    if (err) error = err.message;
    else pages = data as PageRow[];
  }

  async function reload() {
    await Promise.all([loadWork(), loadPages(), loadChapters()]);
  }

  async function saveMeta(e: SubmitEvent) {
    e.preventDefault();
    const { error: err } = await supabase
      .from('works')
      .update({
        title: meta.title.trim(),
        slug: meta.slug.trim(),
        description: meta.description,
        foreword: meta.foreword,
        status: meta.status,
        direction: meta.direction,
        default_layout: meta.default_layout,
        default_mode: meta.default_mode,
        cover_solo: meta.cover_solo,
        tags: meta.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
        characters: meta.characters
          .map((c) => ({ ...c, name: c.name.trim() }))
          .filter((c) => c.name),
      })
      .eq('id', workId);
    if (err) {
      error = err.message;
      return;
    }
    error = null;
    savedFlash = true;
    setTimeout(() => (savedFlash = false), 1600);
    await loadWork();
  }
</script>

<div class="we">
  <header class="we__head">
    <div>
      <a class="mono we__back" href="/studio">← STUDIO</a>
      <h1 class="serif we__title">{work?.title ?? '…'}</h1>
      {#if work}
        <p class="mono we__meta">
          /{work.slug} · {work.direction.toUpperCase()} · {pages.length} PAGES ·
          {work.published ? 'LIVE' : 'DRAFT'}
        </p>
      {/if}
    </div>
    {#if work}
      <a class="mono we__view" href={`/w/${work.slug}`} target="_blank" rel="noopener">VIEW ↗</a>
    {/if}
  </header>

  <nav class="we__tabs">
    <button class="mono we__tab" class:is-active={tab === 'pages'} onclick={() => (tab = 'pages')}>
      PAGES
    </button>
    <button class="mono we__tab" class:is-active={tab === 'meta'} onclick={() => (tab = 'meta')}>
      META
    </button>
  </nav>

  {#if error}
    <p class="mono we__error">{error}</p>
  {/if}

  {#if !work}
    <p class="mono">LOADING…</p>
  {:else if tab === 'pages'}
    <div class="we__pages">
      <PdfUploader {workId} {chapters} {pages} onDone={reload} />
      {#if pages.length || chapters.length}
        <Arranger
          {workId}
          direction={work.direction}
          coverPageId={work.cover_page_id}
          coverSolo={work.cover_solo ?? true}
          characters={work.characters ?? []}
          {chapters}
          {pages}
          onChanged={reload}
        />
      {:else}
        <p class="mono">NO PAGES YET — RASTERIZE A PDF ABOVE.</p>
      {/if}
    </div>
  {:else}
    <form class="we__form" onsubmit={saveMeta}>
      <label class="we__field">
        <span class="mono">TITLE</span>
        <input type="text" bind:value={meta.title} required />
      </label>
      <label class="we__field">
        <span class="mono">SLUG (URL)</span>
        <input type="text" bind:value={meta.slug} pattern="[a-z0-9\-]+" required />
      </label>
      <label class="we__field we__field--wide">
        <span class="mono">DESCRIPTION (SHORT — SHOWN NEXT TO THE COVER)</span>
        <textarea bind:value={meta.description} rows="3"></textarea>
      </label>
      <div class="we__field we__field--wide">
        <span class="mono">FOREWORD / はじめに (LONG — ITS OWN PAGE BETWEEN COVER AND CONTENT)</span>
        <RichTextEditor
          value={meta.foreword}
          {workId}
          onChange={(html) => (meta.foreword = html)}
          placeholder="Write as much as you like — bold, italics, fonts, alignment, images. Readers see each block rise in as they scroll."
        />
      </div>
      <label class="we__field">
        <span class="mono">STATUS</span>
        <select bind:value={meta.status}>
          <option value="oneshot">One-shot</option>
          <option value="ongoing">Ongoing</option>
          <option value="complete">Complete</option>
        </select>
      </label>
      <label class="we__field">
        <span class="mono">READING DIRECTION</span>
        <select bind:value={meta.direction}>
          <option value="rtl">Right → left (manga)</option>
          <option value="ltr">Left → right</option>
        </select>
      </label>
      <label class="we__field">
        <span class="mono">DEFAULT LAYOUT</span>
        <select bind:value={meta.default_layout}>
          <option value="double">Two-page spread</option>
          <option value="single">Single page</option>
        </select>
      </label>
      <label class="we__field">
        <span class="mono">DEFAULT MODE</span>
        <select bind:value={meta.default_mode}>
          <option value="flip">Flip (paged)</option>
          <option value="scroll">Scroll</option>
        </select>
      </label>
      <label class="we__field we__field--check we__field--wide">
        <input type="checkbox" bind:checked={meta.cover_solo} />
        <span class="mono">COVER STANDS ALONE (in two-page layout the cover gets its own sheet — sets where spreads begin)</span>
      </label>
      <div class="we__field we__field--wide">
        <span class="mono">COVER CROP (LIBRARY CARD)</span>
        {#if coverRec}
          <button type="button" class="mono we__coverBtn" onclick={() => (cropOpen = true)}>
            ✂ ADJUST COVER FRAMING
          </button>
        {:else}
          <p class="mono we__hint">Set a book cover in the PAGES tab first.</p>
        {/if}
      </div>
      <label class="we__field we__field--wide">
        <span class="mono">TAGS (COMMA-SEPARATED)</span>
        <input type="text" bind:value={meta.tagsText} placeholder="fantasy, one-shot, colour" />
      </label>
      <div class="we__field we__field--wide">
        <span class="mono">CAST (SPEAKERS FOR TRANSLATED BUBBLES — NAME + COLOUR)</span>
        <div class="we__cast">
          {#each meta.characters as ch (ch.id)}
            <div class="we__castRow">
              <input class="we__castColor" type="color" bind:value={ch.color} aria-label="Colour" />
              <input class="we__castName" type="text" bind:value={ch.name} placeholder="Character name" />
              <button type="button" class="mono we__castDel" onclick={() => removeCharacter(ch.id)} title="Remove">✕</button>
            </div>
          {/each}
          <button type="button" class="mono we__castAdd" onclick={addCharacter}>+ ADD CHARACTER</button>
        </div>
      </div>
      <button class="we__save mono" type="submit">
        {savedFlash ? 'SAVED ✓' : 'SAVE META'}
      </button>
    </form>
  {/if}
</div>

{#if cropOpen && coverRec}
  <CoverCropper
    page={coverRec}
    crop={work?.cover_crop ?? null}
    onSave={saveCoverCrop}
    onClose={() => (cropOpen = false)}
  />
{/if}

<style>
  .we {
    display: grid;
    gap: clamp(1.4rem, 3.5vh, 2.2rem);
    max-width: 1100px;
  }
  .we__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1rem;
  }
  .we__back {
    display: inline-block;
    margin-bottom: 0.8rem;
  }
  .we__back:hover,
  .we__view:hover {
    color: var(--accent);
  }
  .we__title {
    font-size: clamp(1.8rem, 4.5vw, 2.8rem);
  }
  .we__meta {
    margin-top: 0.5rem;
  }
  .we__tabs {
    display: flex;
    gap: 0.5rem;
    border-bottom: 1px solid var(--line);
  }
  .we__tab {
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    color: var(--fg-dim);
    padding: 0.7em 1.1em;
    cursor: pointer;
    transition: color 0.25s var(--ease), border-color 0.25s var(--ease);
  }
  .we__tab.is-active {
    color: var(--fg);
    border-bottom-color: var(--accent);
  }
  .we__error {
    color: #e8a31a;
  }
  .we__pages {
    display: grid;
    gap: 1.6rem;
  }
  .we__form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.2rem;
    max-width: 760px;
  }
  .we__field {
    display: grid;
    gap: 0.45rem;
  }
  .we__field--wide {
    grid-column: 1 / -1;
  }
  .we__field--check {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .we__field--check input {
    width: 1.05rem;
    height: 1.05rem;
    flex-shrink: 0;
    accent-color: var(--accent);
  }
  .we__coverBtn {
    justify-self: start;
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    padding: 0.6em 1em;
    cursor: pointer;
  }
  .we__coverBtn:hover {
    color: var(--fg);
    border-color: var(--fg-dim);
  }
  .we__hint {
    color: var(--fg-faint);
    font-size: 0.6rem;
  }
  .we__field input,
  .we__field select,
  .we__field textarea {
    background: var(--bg-soft);
    border: 1px solid var(--line-strong);
    color: var(--fg);
    font: inherit;
    padding: 0.6em 0.8em;
  }
  .we__field input:focus,
  .we__field select:focus,
  .we__field textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .we__cast {
    display: grid;
    gap: 0.5rem;
  }
  .we__castRow {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .we__castColor {
    width: 2.2rem;
    height: 2.2rem;
    padding: 0;
    border: 1px solid var(--line-strong);
    background: var(--bg-soft);
    cursor: pointer;
    flex-shrink: 0;
  }
  .we__castName {
    flex: 1;
  }
  .we__castDel {
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    padding: 0.5em 0.8em;
    cursor: pointer;
  }
  .we__castDel:hover {
    color: #e8a31a;
    border-color: #e8a31a;
  }
  .we__castAdd {
    justify-self: start;
    background: none;
    border: 1px dashed var(--line-strong);
    color: var(--fg-dim);
    padding: 0.6em 1em;
    cursor: pointer;
  }
  .we__castAdd:hover {
    color: var(--fg);
    border-color: var(--fg-dim);
  }
  .we__save {
    grid-column: 1 / -1;
    justify-self: start;
    background: var(--accent);
    color: var(--ink-fg);
    border: 0;
    padding: 0.85em 1.4em;
    cursor: pointer;
  }
  @media (max-width: 640px) {
    .we__form {
      grid-template-columns: 1fr;
    }
  }
</style>
