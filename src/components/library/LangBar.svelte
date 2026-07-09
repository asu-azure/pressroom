<script lang="ts">
  import { i18n, type Lang } from '../../lib/i18n.svelte';

  const langs: { code: Lang; label: string }[] = [
    { code: 'ja', label: '日本語' },
    { code: 'en', label: 'EN' },
  ];
</script>

<nav class="langbar mono" aria-label="Language">
  {#each langs as l, i (l.code)}
    {#if i > 0}<span class="langbar__sep">/</span>{/if}
    <button
      class="langbar__btn"
      class:is-active={i18n.lang === l.code}
      onclick={() => i18n.set(l.code)}
    >{l.label}</button>
  {/each}
</nav>

<style>
  .langbar {
    position: fixed;
    top: calc(0.9rem + env(safe-area-inset-top));
    right: var(--pad);
    z-index: 90;
    display: flex;
    align-items: center;
    gap: 0.5em;
    mix-blend-mode: difference;
  }
  .langbar__btn {
    background: none;
    border: 0;
    padding: 0.2em 0.1em;
    font: inherit;
    letter-spacing: 0.14em;
    color: #fff;
    opacity: 0.45;
    cursor: pointer;
    transition: opacity 0.25s var(--ease);
  }
  .langbar__btn:hover {
    opacity: 0.8;
  }
  .langbar__btn.is-active {
    opacity: 1;
    text-decoration: underline;
    text-underline-offset: 0.35em;
  }
  .langbar__sep {
    color: #fff;
    opacity: 0.35;
  }
</style>
