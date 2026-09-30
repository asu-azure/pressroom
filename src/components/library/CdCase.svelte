<script lang="ts">
  /**
   * The soundtrack on the shelf, beside the books: the same jewel case as /ost
   * (src/styles/jewel.css + src/lib/jewel.ts), on the books' physics. Drag it to
   * read the track list on the back; click opens the lid and goes to /ost.
   * Only rendered when music is on (Library.svelte checks MUSIC).
   */
  import { prefetch } from 'astro:prefetch';
  import { i18n } from '../../lib/i18n.svelte';
  import { book } from '../../scripts/book3d';
  import { jewelHtml, type JewelArt } from '../../lib/jewel';
  import '../../styles/jewel.css';

  let { art, tracks, length }: { art: JewelArt; tracks: string[]; length: string } = $props();

  const html = $derived(jewelHtml(art, tracks, { withDisc: true }));
</script>

<a
  class="cd-card"
  href="/ost"
  draggable="false"
  data-sfx="note open"
  aria-label={`ดาวตก — Starfall Nocturne · ${i18n.t('lib.ost')}`}
  onpointerenter={() => prefetch('/ost')}
  onfocus={() => prefetch('/ost')}
>
  <div class="jc__stage cd-card__stage" use:book={{ bindingRight: false, href: '/ost', restYaw: 30, openDeg: 150 }}>
    <div class="jc__floor" aria-hidden="true"></div>
    <div class="jc" data-book aria-hidden="true">{@html html}</div>
  </div>

  <span class="book-card__label cd-card__label">
    <span class="cd-card__title">ดาวตก <span class="cd-card__en">STARFALL NOCTURNE</span></span>
    <span class="cd-card__meta mono">{i18n.t('lib.ost')} · {tracks.length} MOVEMENTS · {length}</span>
    <span class="cd-card__go mono">{i18n.t('lib.listen')} <span class="mk-hop" aria-hidden="true">→</span></span>
  </span>
</a>

<style>
  .cd-card {
    display: flex;
    flex-direction: column;
    color: inherit;
    text-decoration: none;
    -webkit-user-drag: none;
    user-select: none;
    outline: none;
  }
  /* Same height budget as a book's stage, so both stand on one plank. A CD is
     142 mm against a B5's 182, so it stands at that fraction of a book. */
  .cd-card__stage {
    --jc-w: 66cqi;
    aspect-ratio: 0.74;
    justify-content: center;
  }
  .cd-card__label {
    position: relative;
    display: grid;
    gap: 0.3rem;
    margin-top: 0.2rem;
    padding-top: 1.2rem;
  }
  .cd-card__title {
    font-family: var(--font-prompt);
    font-size: clamp(1.05rem, 1.6vw, 1.25rem);
    line-height: 1.3;
    color: var(--fg);
  }
  .cd-card__en {
    margin-left: 0.4em;
    font-family: var(--font-mono);
    font-size: 0.55rem;
    letter-spacing: 0.24em;
    color: var(--fg-dim);
  }
  .cd-card__meta {
    font-size: 0.58rem;
    letter-spacing: 0.12em;
    color: var(--fg-dim);
  }
  .cd-card__go {
    margin-top: 0.2rem;
    font-size: 0.58rem;
    letter-spacing: 0.14em;
    color: var(--accent);
  }
  @media (hover: hover) {
    .cd-card__go {
      color: var(--fg-faint);
      transition: color 0.25s var(--ease);
    }
    .cd-card:hover .cd-card__go { color: var(--accent); }
  }
  .cd-card:focus-visible .cd-card__stage {
    outline: 1.5px solid var(--accent);
    outline-offset: 6px;
    border-radius: 6px;
  }
</style>
