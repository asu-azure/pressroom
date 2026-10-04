<script lang="ts">
  /**
   * 「しおりについて」: where the reader's place and ここすき live. They are saved
   * silently in localStorage (lib/persistence.ts, lib/shelfmarks.ts), and readers
   * didn't know they existed, or that a link opened from X or LINE lands in
   * another app's browser with none of them. A plain <details>: no script, and it
   * stays shut until asked. In the page reader's 設定, the novel reader's 設定 and
   * on the overview by 「続きから読む」.
   */
  import { i18n } from '../../lib/i18n.svelte';

  // kind 'novel': the novel reader keeps a place only — no ここすき there, so the
  // note doesn't speak of them
  let { tone = 'ink', kind = 'pages' }: { tone?: 'ink' | 'paper'; kind?: 'pages' | 'novel' } = $props();
</script>

<details class="bm" class:bm--paper={tone === 'paper'}>
  <summary class="bm__sum">{i18n.t('mark.about')}</summary>
  <ul class="bm__list">
    <li>{i18n.t(kind === 'novel' ? 'mark.l1n' : 'mark.l1')}</li>
    <li>{i18n.t('mark.l2')}</li>
    <li>{i18n.t('mark.l3')}</li>
    <li>{i18n.t('mark.l4')}</li>
  </ul>
</details>

<style>
  .bm {
    --bm-fg: var(--fg, #f4f1ea);
    --bm-dim: var(--fg-dim, rgba(244, 241, 234, 0.72));
    --bm-line: var(--line-strong, rgba(244, 241, 234, 0.22));
    color: var(--bm-dim);
  }
  .bm--paper {
    --bm-fg: #24211c;
    --bm-dim: #5c5649;
    --bm-line: rgba(0, 0, 0, 0.14);
  }
  .bm__sum {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    min-height: 2.75rem;
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    letter-spacing: 0.1em;
    color: var(--bm-dim);
    cursor: pointer;
    list-style: none;
  }
  .bm__sum::-webkit-details-marker {
    display: none;
  }
  /* a drawn chevron: the subset mono face has no ▸ */
  .bm__sum::before {
    content: '';
    width: 0.4em;
    height: 0.4em;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    rotate: -45deg;
    transition: rotate 0.2s var(--ease);
  }
  .bm[open] .bm__sum::before {
    rotate: 45deg;
  }
  .bm__sum:hover {
    color: var(--bm-fg);
  }
  @media (prefers-reduced-motion: reduce) {
    .bm__sum::before {
      transition: none;
    }
  }
  .bm__list {
    display: grid;
    gap: 0.35rem;
    margin: 0.2rem 0 0;
    padding: 0.6rem 0 0.2rem 0.9rem;
    border-left: 1px solid var(--bm-line);
    list-style: none;
    font-family: var(--font-display-authored);
    font-size: 0.8rem;
    line-height: 1.6;
    color: var(--bm-fg);
  }
</style>
