<script lang="ts">
  import { i18n } from '../../lib/i18n.svelte';
  import type { Work } from '../../lib/types';

  let {
    work,
    coverUrl,
    pageCount,
    index,
  }: { work: Work; coverUrl: string | null; pageCount: number; index: number } = $props();

  const statusLabel = $derived(i18n.t(`status.${work.status}`));
</script>

<a class="card tile" href={`/w/${work.slug}`} data-cursor="READ">
  {#if coverUrl}
    <img src={coverUrl} alt={`Cover of ${work.title}`} loading={index < 6 ? 'eager' : 'lazy'} />
  {:else}
    <div class="card__blank"><span class="mono">NO PROOF</span></div>
  {/if}
  <span class="tile__num mono">{String(index + 1).padStart(2, '0')}</span>
  <span class="tile__tag mono">{statusLabel} · {pageCount}P · {work.direction.toUpperCase()}</span>
  <span class="card__meta">
    <span class="card__title serif">{work.title}</span>
    {#if work.tags.length}
      <span class="card__tags mono">{work.tags.join(' / ')}</span>
    {/if}
  </span>
</a>

<style>
  .card {
    aspect-ratio: 4 / 5.4;
    display: block;
  }
  .card__blank {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border: 1px dashed var(--line-strong);
  }
  .card__meta {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
    display: grid;
    gap: 0.25rem;
    padding: 2.2rem 0.7rem 2rem;
    background: linear-gradient(180deg, transparent, rgba(12, 12, 13, 0.88));
    pointer-events: none;
  }
  .card__title {
    color: #f4f1ea;
    font-size: clamp(1.05rem, 1.8vw, 1.3rem);
    line-height: 1.15;
  }
  .card__tags {
    color: rgba(244, 241, 234, 0.6);
    font-size: 0.55rem;
  }
</style>
