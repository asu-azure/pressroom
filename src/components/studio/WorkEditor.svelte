<script lang="ts">
  import { supabase } from '../../lib/supabase';
  import { requireSession, watchSignOut } from '../../lib/authGuard';
  import Arranger from './Arranger.svelte';
  import PdfUploader from './PdfUploader.svelte';
  import type { Work, PageRow, Chapter } from '../../lib/types';

  let { workId }: { workId: string } = $props();

  let work = $state<Work | null>(null);
  let pages = $state<PageRow[]>([]);
  let chapters = $state<Chapter[]>([]);
  let tab = $state<'pages' | 'meta'>('pages');
  let error = $state<string | null>(null);
  let savedFlash = $state(false);

  // Meta form fields (bound copies; committed on save)
  let meta = $state({
    title: '',
    slug: '',
    description: '',
    status: 'oneshot' as Work['status'],
    direction: 'rtl' as Work['direction'],
    default_layout: 'double' as Work['default_layout'],
    default_mode: 'flip' as Work['default_mode'],
    tagsText: '',
  });

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
      status: work.status,
      direction: work.direction,
      default_layout: work.default_layout,
      default_mode: work.default_mode,
      tagsText: work.tags.join(', '),
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
        status: meta.status,
        direction: meta.direction,
        default_layout: meta.default_layout,
        default_mode: meta.default_mode,
        tags: meta.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
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
        <span class="mono">DESCRIPTION</span>
        <textarea bind:value={meta.description} rows="4"></textarea>
      </label>
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
      <label class="we__field we__field--wide">
        <span class="mono">TAGS (COMMA-SEPARATED)</span>
        <input type="text" bind:value={meta.tagsText} placeholder="fantasy, one-shot, colour" />
      </label>
      <button class="we__save mono" type="submit">
        {savedFlash ? 'SAVED ✓' : 'SAVE META'}
      </button>
    </form>
  {/if}
</div>

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
