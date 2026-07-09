<script lang="ts">
  import { importPdf, uploadOriginal } from '../../lib/pdfImport';

  let { workId, onDone }: { workId: string; onDone: () => void } = $props();

  let file = $state<File | null>(null);
  let keepOriginal = $state(false);
  let busy = $state(false);
  let done = $state(0);
  let total = $state(0);
  let thumbs = $state<string[]>([]);
  let error = $state<string | null>(null);
  let aborter: AbortController | null = null;

  function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    file = input.files?.[0] ?? null;
    error = null;
  }

  async function start() {
    if (!file || busy) return;
    busy = true;
    error = null;
    done = 0;
    total = 0;
    thumbs = [];
    aborter = new AbortController();
    try {
      const result = await importPdf(file, workId, {
        signal: aborter.signal,
        onPage: (d, t, thumbUrl) => {
          done = d;
          total = t;
          thumbs = [...thumbs, thumbUrl];
        },
      });
      if (keepOriginal && !result.aborted) await uploadOriginal(file, workId);
      onDone();
      if (!result.aborted) file = null;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      onDone(); // partial pages are committed — refresh the arranger anyway
    } finally {
      busy = false;
      aborter = null;
    }
  }

  function abort() {
    aborter?.abort();
  }
</script>

<div class="up">
  <div class="up__row">
    <label class="up__file mono" data-hover>
      <input type="file" accept="application/pdf" onchange={pick} disabled={busy} />
      {file ? file.name : 'SELECT PDF…'}
    </label>
    <label class="up__keep mono">
      <input type="checkbox" bind:checked={keepOriginal} disabled={busy} />
      KEEP ORIGINAL
    </label>
    {#if !busy}
      <button class="up__go mono" onclick={start} disabled={!file}>RASTERIZE →</button>
    {:else}
      <button class="up__go up__go--stop mono" onclick={abort}>ABORT</button>
    {/if}
  </div>

  {#if busy || done > 0}
    <div class="up__progress">
      <span class="mono up__counter">
        RASTERIZING {String(done).padStart(3, '0')}/{String(total || 0).padStart(3, '0')}
      </span>
      <div class="up__bar"><div class="up__fill" style={`transform: scaleX(${total ? done / total : 0})`}></div></div>
      <div class="up__strip">
        {#each thumbs as t, i (i)}
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
