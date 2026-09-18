<script lang="ts">
  import { i18n } from '../../lib/i18n.svelte';
  import { taleIcons } from '../tale/taleIcons';
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

<a class="card tile mk-pop mk-hop-host" href={`/w/${work.slug}`} data-cursor="READ">
  {#if coverUrl && cropStyle}
    <div class="card__cover" style={cropStyle} role="img" aria-label={`Cover of ${work.title}`}></div>
  {:else if coverUrl}
    <img src={coverUrl} alt={`Cover of ${work.title}`} loading={index < 6 ? 'eager' : 'lazy'} />
  {:else}
    <div class="card__blank"><span class="mono">NO COVER</span></div>
  {/if}
  <!-- No index badge: numbering the covers implied a reading order between
       works that isn't intended. `index` still drives eager/lazy loading. -->
  <span class="tile__tag mono">
    {statusLabel} · {pageCount}P · {work.direction.toUpperCase()}{#if work.read_locked}<span
        class="card__lock"
        title={i18n.t('ov.locked')}>🔒</span>{/if}
  </span>
  <span class="card__meta">
    <span class="card__title serif authored">{work.title}</span>
    {#if work.tags.length}
      <span class="card__tags mono">{work.tags.join(' / ')}</span>
    {/if}
    <!-- Says where the tap goes, so the overview isn't a surprise stop on the
         way to reading. -->
    <span class="card__go mono">{i18n.t('lib.open')} <span class="mk-hop" aria-hidden="true">→</span></span>
  </span>
  <!-- Tale-theme stickers; hidden on Editorial FUI pages. -->
  <span class="card__tape" aria-hidden="true"></span>
  <svg class="card__sticker card__sticker--flower" viewBox="0 0 24 24" aria-hidden="true">{@html taleIcons.flower}</svg>
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
  /* Gated on a real pointer — see the note on .tile in global.css. On touch an
     unguarded :hover eats the first tap. */
  @media (hover: hover) {
    :global(.tile:hover) .card__cover {
      transform: scale(1.06);
    }
  }
  :global(.tile:focus-visible) .card__cover {
    transform: scale(1.06);
  }
  .card__lock {
    margin-left: 0.5em;
  }
  .card__sticker,
  .card__tape {
    display: none;
  }

  /* --- Tale theme: a dashed paper card, cover inset, words underneath ----- */
  :global(body.theme-tale) .card {
    aspect-ratio: auto;
    overflow: visible;
    padding: 0.7rem 0.7rem 0;
    background: var(--t-card);
    border: 2px dashed var(--t-dash-soft);
    border-radius: 10px;
    box-shadow: 0 6px 18px rgba(43, 50, 99, 0.1);
  }
  :global(body.theme-tale) .card::after {
    display: none;
  }
  :global(body.theme-tale) .card > img,
  :global(body.theme-tale) .card__cover,
  :global(body.theme-tale) .card__blank {
    position: relative;
    inset: auto;
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 4 / 5.4;
    border-radius: 6px;
    object-fit: cover;
  }
  :global(body.theme-tale) .card__blank {
    border-color: var(--t-dash-soft);
  }
  :global(body.theme-tale) .tile__tag {
    position: absolute;
    top: 1.2rem;
    right: 1.2rem;
    left: auto;
    bottom: auto;
    z-index: 2;
    padding: 0.25em 0.7em;
    border-radius: 999px;
    background: var(--t-night);
    color: var(--t-paper);
    mix-blend-mode: normal;
    font-size: 0.6rem;
  }
  :global(body.theme-tale) .card__meta {
    position: relative;
    padding: 0.8rem 0.3rem 2.2rem;
    background: none;
    gap: 0.35rem;
  }
  :global(body.theme-tale) .card__title {
    color: var(--t-night);
    font-weight: 900;
  }
  :global(body.theme-tale) .card__tags {
    color: var(--t-night-soft);
  }
  :global(body.theme-tale) .card__go {
    color: var(--t-azure);
  }
  :global(body.theme-tale) .card__sticker {
    display: block;
    position: absolute;
    z-index: 3;
    color: var(--t-night);
  }
  /* Masking tape holding the card to the page. */
  :global(body.theme-tale) .card__tape {
    display: block;
    position: absolute;
    top: -11px;
    left: 50%;
    z-index: 4;
    width: 38%;
    height: 24px;
    translate: -50% 0;
    rotate: -3deg;
    background: rgba(230, 176, 74, 0.6);
    clip-path: polygon(3% 0, 97% 4%, 100% 50%, 96% 100%, 2% 96%, 0 45%);
  }
  :global(body.theme-tale) .card:nth-child(even) .card__tape,
  :global(body.theme-tale) div:nth-child(even) > .card .card__tape {
    rotate: 4deg;
    background: rgba(143, 179, 194, 0.7);
  }
  :global(body.theme-tale) .card__sticker--flower {
    right: 0.7rem;
    bottom: 0.7rem;
    width: 1.4rem;
    height: 1.4rem;
    fill: var(--t-sun);
  }
  @media (hover: hover) {
    :global(body.theme-tale .tile:hover) .card__cover,
    :global(body.theme-tale .tile:hover) > img {
      transform: none;
    }
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
  .card__go {
    margin-top: 0.15rem;
    font-size: 0.55rem;
    color: var(--accent);
    letter-spacing: 0.14em;
  }
  /* On a pointer the label brightens with the rest of the card; on touch it is
     simply always visible, which is the whole point of signposting it. */
  @media (hover: hover) {
    .card__go {
      color: rgba(244, 241, 234, 0.5);
      transition: color 0.25s var(--ease);
    }
    :global(.tile:hover) .card__go {
      color: var(--accent);
    }
  }
</style>
