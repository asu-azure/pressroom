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

  // A saved crop reframes the cover via background-image (arbitrary pan+zoom
  // that object-fit:cover can't express); otherwise fall back to <img> cover.
  const crop = $derived(work.cover_crop);
  const cropStyle = $derived.by(() => {
    if (!coverUrl || !crop) return null;
    const px = crop.w < 1 ? (crop.x / (1 - crop.w)) * 100 : 0;
    const py = crop.h < 1 ? (crop.y / (1 - crop.h)) * 100 : 0;
    return (
      `background-image:url(${coverUrl});` +
      `background-size:${100 / crop.w}% ${100 / crop.h}%;` +
      `background-position:${px}% ${py}%;` +
      `background-repeat:no-repeat;`
    );
  });
</script>

<a class="card tile" href={`/w/${work.slug}`} data-cursor="READ">
  {#if coverUrl && cropStyle}
    <div class="card__cover" style={cropStyle} role="img" aria-label={`Cover of ${work.title}`}></div>
  {:else if coverUrl}
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
  /* Cropped cover — background-image so an arbitrary pan+zoom frame can be
     shown. Matches .tile img fill + hover scale. */
  .card__cover {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transition: transform 0.65s var(--ease);
  }
  :global(.tile:hover) .card__cover,
  :global(.tile:focus-visible) .card__cover {
    transform: scale(1.06);
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
