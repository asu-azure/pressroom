<script lang="ts">
  import { importPdf, uploadOriginal } from '../../lib/pdfImport';
  import { appendBounds } from '../../lib/chapterOrder';
  import { supabase } from '../../lib/supabase';
  import type { Chapter, PageRow } from '../../lib/types';

  let {
    workId,
    chapters,
    pages,
    onDone,
  }: { workId: string; chapters: Chapter[]; pages: PageRow[]; onDone: () => void } = $props();

  let files = $state<File[]>([]);
  let chapterId = $state<string | 'none'>('none');
  let keepOriginal = $state(false);
  let busy = $state(false);
  let fileNo = $state(0);
  let done = $state(0);
  let total = $state(0);
  let thumbs = $state<string[]>([]);
  let error = $state<string | null>(null);
  let aborter: AbortController | null = null;

  function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    files = [...(input.files ?? [])];
    error = null;
  }

  function clearThumbs() {
    for (const t of thumbs) URL.revokeObjectURL(t);
    thumbs = [];
  }

  async function start() {
    if (!files.length || busy) return;
    busy = true;
    error = null;
    clearThumbs();
    aborter = new AbortController();
    try {
      // Multiple PDFs import as consecutive blocks of the same book/chapter.
      // Fresh page rows land after each file, so recompute bounds per file.
      for (let f = 0; f < files.length; f++) {
        fileNo = f + 1;
        done = 0;
        total = 0;
        const { data: rows } = await supabase
          .from('pages')
          .select('*')
          .eq('work_id', workId);
        const placement = {
          chapterId: chapterId === 'none' ? null : chapterId,
          ...appendBounds((rows ?? []) as PageRow[], chapters, chapterId === 'none' ? null : chapterId),
        };
        const result = await importPdf(files[f], workId, placement, {
          signal: aborter.signal,
          onPage: (d, t, thumbUrl) => {
            done = d;
            total = t;
            thumbs = [...thumbs, thumbUrl];
          },
        });
        if (keepOriginal && !result.aborted) await uploadOriginal(files[f], workId);
        if (result.aborted) break;
      }
      files = [];
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
      aborter = null;
      onDone(); // partial pages are committed — refresh the arranger either way
    }
  }

  function abort() {
    aborter?.abort();
  }
</script>

<div class="up">
  <div class="up__row">
    <label class="up__file mono" data-hover>
      <input type="file" accept="application/pdf" multiple onchange={pick} disabled={busy} />
      {files.length === 0
        ? 'SELECT PDF(S)…'
        : files.length === 1
          ? files[0].name
          : `${files.length} PDFS AS ONE BOOK`}
    </label>
    <label class="up__target mono">
      INTO
      <select bind:value={chapterId} disabled={busy}>
        <option value="none">FRONT / NO CHAPTER</option>
        {#each chapters as ch (ch.id)}
          <option value={ch.id}>{ch.title}</option>
        {/each}
      </select>
    </label>
    <label class="up__keep mono">
      <input type="checkbox" bind:checked={keepOriginal} disabled={busy} />
      KEEP ORIGINAL
    </label>
    {#if !busy}
      <button class="up__go mono" onclick={start} disabled={!files.length}>RASTERIZE →</button>
    {:else}
      <button class="up__go up__go--stop mono" onclick={abort}>ABORT</button>
    {/if}
  </div>

  {#if busy || done > 0}
    <div class="up__progress">
      <span class="mono up__counter">
        {#if files.length > 1}FILE {fileNo}/{files.length} · {/if}
        RASTERIZING {String(done).padStart(3, '0')}/{String(total || 0).padStart(3, '0')}
      </span>
      <div class="up__bar"><div class="up__fill" style={`transform: scaleX(${total ? done / total : 0})`}></div></div>
      <div class="up__strip">
        {#each thumbs as t, i (t)}
          <img src={t} alt={`page ${i + 1}`} />
        {/each}
      </div>
    </div>
  {/if}

  {#if error}
    <p class="mono up__error">IMPORT HALTED — {error} (already-committed pages were kept; re-run to append)</p>
  {/if}
</div>

<style>
  .up {
    display: grid;
    gap: 1rem;
    padding: 1.2rem;
    border: 1px dashed var(--line-strong);
  }
  .up__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
  }
  .up__file {
    flex: 1;
    min-width: 12rem;
    border: 1px solid var(--line-strong);
    padding: 0.7em 1em;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .up__file input {
    display: none;
  }
  .up__file:hover {
    border-color: var(--fg-dim);
    color: var(--fg);
  }
  .up__target {
    display: inline-flex;
    align-items: center;
    gap: 0.6em;
  }
  .up__target select {
    background: var(--bg-soft);
    border: 1px solid var(--line-strong);
    color: var(--fg);
    font: inherit;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    padding: 0.5em 0.6em;
    max-width: 12rem;
  }
  .up__keep {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    cursor: pointer;
  }
  .up__keep input {
    accent-color: var(--accent);
  }
  .up__go {
    background: var(--accent);
    color: var(--ink-fg);
    border: 0;
    padding: 0.8em 1.3em;
    cursor: pointer;
  }
  .up__go:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .up__go--stop {
    background: #e8a31a;
    color: #1a1407;
  }
  .up__progress {
    display: grid;
    gap: 0.7rem;
  }
  .up__bar {
    height: 2px;
    background: var(--line);
  }
  .up__fill {
    height: 100%;
    background: var(--accent);
    transform-origin: left center;
    transition: transform 0.2s linear;
  }
  .up__strip {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    padding-bottom: 0.3rem;
  }
  .up__strip img {
    height: 64px;
    width: auto;
    border: 1px solid var(--line);
    flex: 0 0 auto;
  }
  .up__error {
    color: #e8a31a;
  }
</style>
