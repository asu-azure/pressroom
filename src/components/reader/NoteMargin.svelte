<script lang="ts">
  import type { Sheet } from '../../lib/types';

  let {
    sheet,
    pageNumberOf,
    variant,
  }: {
    sheet: Sheet;
    pageNumberOf: (pageId: string) => number;
    /** gutter = desktop margin annotation; sheet = mobile bottom sheet body */
    variant: 'gutter' | 'sheet';
  } = $props();

  const notes = $derived(
    sheet.pages
      .filter((p) => p.note)
      .map((p) => ({ no: pageNumberOf(p.id), text: p.note! })),
  );
</script>

{#if notes.length}
  <div class={`nm nm--${variant}`}>
    {#each notes as note (note.no)}
      <div class="nm__note">
        <span class="nm__leader" aria-hidden="true"></span>
        <span class="mono nm__label">NOTE — P.{String(note.no).padStart(2, '0')}</span>
        <p class="serif nm__text">{note.text}</p>
      </div>
    {/each}
  </div>
{/if}

<style>
  .nm {
    display: grid;
    gap: 1.4rem;
    align-content: start;
  }
  .nm__note {
    position: relative;
    display: grid;
    gap: 0.45rem;
    padding-left: 1rem;
    border-left: 1px solid var(--accent);
  }
  .nm__leader {
    position: absolute;
    top: 0.55em;
    left: -1.6rem;
    width: 1.6rem;
    height: 1px;
    background: var(--accent);
    opacity: 0.55;
  }
  .nm--sheet .nm__leader {
    display: none;
  }
  .nm__label {
    color: var(--accent);
    font-size: 0.6rem;
  }
  .nm__text {
    font-size: 0.95rem;
    line-height: 1.65;
    color: var(--fg-dim);
    white-space: pre-wrap;
    max-width: 32em;
  }
  .nm--sheet .nm__text {
    color: var(--fg);
  }
</style>
