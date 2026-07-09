<script lang="ts">
  import type { Sheet, Bubble, Character } from '../../lib/types';
  import { i18n } from '../../lib/i18n.svelte';

  let {
    sheet,
    pageNumberOf,
    variant,
    translateOn = false,
    characters = [],
    highlightId = null,
    onHighlight,
  }: {
    sheet: Sheet;
    pageNumberOf: (pageId: string) => number;
    /** gutter = desktop margin annotation; sheet = mobile bottom sheet body */
    variant: 'gutter' | 'sheet';
    translateOn?: boolean;
    characters?: Character[];
    highlightId?: string | null;
    onHighlight?: (id: string | null) => void;
  } = $props();

  const notes = $derived(
    sheet.pages
      .filter((p) => p.note)
      .map((p) => ({ no: pageNumberOf(p.id), text: p.note! })),
  );

  function nameOf(id: string | null): string | null {
    return characters.find((c) => c.id === id)?.name ?? null;
  }
  function colorOf(id: string | null): string {
    return characters.find((c) => c.id === id)?.color ?? '#2742f0';
  }

  /** Panels in first-seen order, each with its bubbles in reading order. */
  function byPanel(bubbles: Bubble[]): { panel: number; bubbles: Bubble[] }[] {
    const out: { panel: number; bubbles: Bubble[] }[] = [];
    for (const b of bubbles) {
      let g = out.find((x) => x.panel === b.panel);
      if (!g) {
        g = { panel: b.panel, bubbles: [] };
        out.push(g);
      }
      g.bubbles.push(b);
    }
    return out.sort((a, z) => a.panel - z.panel);
  }

  const trans = $derived(
    translateOn
      ? sheet.pages
          .filter((p) => p.bubbles?.length)
          .map((p) => ({ no: pageNumberOf(p.id), panels: byPanel(p.bubbles) }))
      : [],
  );
</script>

{#if notes.length || trans.length}
  <div class={`nm nm--${variant}`}>
    {#each notes as note (note.no)}
      <div class="nm__note">
        <span class="nm__leader" aria-hidden="true"></span>
        <span class="mono nm__label">NOTE — P.{String(note.no).padStart(2, '0')}</span>
        <p class="serif nm__text">{note.text}</p>
      </div>
    {/each}

    {#each trans as pageT (pageT.no)}
      <div class="nm__trans">
        <span class="mono nm__label">{i18n.t('rd.translate')} — P.{String(pageT.no).padStart(2, '0')}</span>
        {#each pageT.panels as pn (pn.panel)}
          <div class="nm__panel">
            <span class="mono nm__panelLabel">{i18n.t('rd.panel')} {pn.panel}</span>
            {#each pn.bubbles as b, bi (b.id)}
              <button
                class="nm__line"
                class:is-on={highlightId === b.id}
                style={`--c:${colorOf(b.charId)}`}
                onpointerenter={() => onHighlight?.(b.id)}
                onpointerleave={() => onHighlight?.(null)}
                onclick={() => onHighlight?.(highlightId === b.id ? null : b.id)}
              >
                <span class="mono nm__lineNo">{bi + 1}</span>
                {#if nameOf(b.charId)}
                  <span class="nm__lineName" style={`color:${colorOf(b.charId)}`}>[{nameOf(b.charId)}]</span>
                {/if}
                <span class="serif nm__lineText">{b.text}</span>
              </button>
            {/each}
          </div>
        {/each}
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

  /* --- Translations --- */
  .nm__trans {
    display: grid;
    gap: 0.7rem;
  }
  .nm__panel {
    display: grid;
    gap: 0.3rem;
  }
  .nm__panelLabel {
    font-size: 0.52rem;
    color: var(--fg-faint);
    letter-spacing: 0.1em;
  }
  .nm__line {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: baseline;
    gap: 0.4rem;
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    border-left: 2px solid var(--c);
    padding: 0.2rem 0 0.2rem 0.6rem;
    color: var(--fg-dim);
    cursor: pointer;
    transition: background-color 0.2s var(--ease);
  }
  .nm__line:hover,
  .nm__line.is-on {
    background: color-mix(in srgb, var(--c) 16%, transparent);
    color: var(--fg);
  }
  .nm__lineNo {
    font-size: 0.5rem;
    color: var(--fg-faint);
  }
  .nm__lineName {
    font-size: 0.62rem;
    white-space: nowrap;
  }
  .nm__lineText {
    font-size: 0.9rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }
</style>
