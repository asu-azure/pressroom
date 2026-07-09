<script lang="ts">
  import type { PageRec } from '../../lib/types';

  let {
    page,
    pageNumber,
    onSave,
    onClose,
  }: {
    page: PageRec;
    pageNumber: number;
    onSave: (note: string | null) => Promise<void>;
    onClose: () => void;
  } = $props();

  let draft = $state('');
  let saving = $state(false);

  // (Re)fill the draft whenever a different page is selected.
  $effect(() => {
    draft = page.note ?? '';
  });

  async function save() {
    saving = true;
    await onSave(draft.trim() ? draft.trim() : null);
    saving = false;
  }
</script>

<aside class="np">
  <header class="np__head">
    <span class="mono">NOTE — P.{String(pageNumber).padStart(2, '0')}</span>
    <button class="mono np__close" onclick={onClose}>✕</button>
  </header>

  <img class="np__preview" src={page.medUrl} alt={`Page ${pageNumber}`} />

  <textarea
    class="np__text serif"
    bind:value={draft}
    rows="6"
    placeholder="A margin note for readers — process, context, a confession…"
  ></textarea>

  {#if draft.trim()}
    <div class="np__demo">
      <span class="mono np__demoLabel">READER PREVIEW</span>
      <div class="note-margin">
        <span class="mono note-margin__label">NOTE — P.{String(pageNumber).padStart(2, '0')}</span>
        <p class="serif note-margin__text">{draft}</p>
      </div>
    </div>
  {/if}

  <button class="np__save mono" onclick={save} disabled={saving}>
    {saving ? 'SAVING…' : 'SAVE NOTE'}
  </button>
</aside>

<style>
  .np {
    display: grid;
    gap: 1rem;
    align-content: start;
    padding: 1.2rem;
    border: 1px solid var(--line-strong);
    background: var(--bg-soft);
  }
  .np__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .np__close {
    background: none;
    border: 0;
    color: var(--fg-dim);
    cursor: pointer;
    font-size: 0.9rem;
  }
  .np__close:hover {
    color: var(--fg);
  }
  .np__preview {
    width: 100%;
    max-height: 200px;
    object-fit: contain;
    border: 1px solid var(--line);
    background: var(--bg);
  }
  .np__text {
    background: var(--bg);
    border: 1px solid var(--line-strong);
    color: var(--fg);
    padding: 0.8em;
    font-size: 0.95rem;
    line-height: 1.55;
    resize: vertical;
  }
  .np__text:focus {
    outline: none;
    border-color: var(--accent);
  }
  .np__demo {
    display: grid;
    gap: 0.5rem;
  }
  .np__demoLabel {
    font-size: 0.55rem;
    color: var(--fg-faint);
  }
  .note-margin {
    border-left: 1px solid var(--accent);
    padding-left: 0.9rem;
    display: grid;
    gap: 0.4rem;
  }
  .note-margin__label {
    color: var(--accent);
  }
  .note-margin__text {
    font-size: 0.92rem;
    line-height: 1.6;
    color: var(--fg-dim);
    white-space: pre-wrap;
  }
  .np__save {
    justify-self: start;
    background: var(--accent);
    color: var(--ink-fg);
    border: 0;
    padding: 0.75em 1.2em;
    cursor: pointer;
  }
  .np__save:disabled {
    opacity: 0.6;
  }
</style>
