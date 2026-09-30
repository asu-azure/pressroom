<script lang="ts">
  import { prefetch } from 'astro:prefetch';
  import { i18n } from '../../lib/i18n.svelte';
  import { book, region } from '../../scripts/book3d';
  import { loadShelfmarks, layoutMarks, type Shelfmarks } from '../../lib/shelfmarks';
  import type { Work } from '../../lib/types';

  let {
    work,
    coverUrl,
    pageCount,
    index,
  }: { work: Work; coverUrl: string | null; pageCount: number; index: number } = $props();

  const statusLabel = $derived(i18n.t(`status.${work.status}`));
  const href = $derived(`/w/${work.slug}`);

  // --- The cover as a book -------------------------------------------------
  // Authors upload the whole wraparound (front | spine | back) as the cover page
  // and save a crop that frames the front. So the crop tells us where the front
  // is, and whatever is left over is the back cover — the shelf can show both.
  // With no crop, the page IS the front and the back is plain stock.
  let natural = $state<{ w: number; h: number } | null>(null);
  $effect(() => {
    if (!coverUrl) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => (natural = { w: img.naturalWidth, h: img.naturalHeight });
    img.src = coverUrl;
  });

  const front = $derived(work.cover_crop ?? { x: 0, y: 0, w: 1, h: 1 });

  /** Leftover of the wraparound beside the front, if there is enough of it. */
  const back = $derived.by(() => {
    const c = work.cover_crop;
    if (!c) return null;
    const rightRoom = 1 - (c.x + c.w);
    if (c.x < 0.04 && rightRoom > 0.3) return { x: c.x + c.w, w: rightRoom, right: true };
    if (rightRoom < 0.04 && c.x > 0.3) return { x: 0, w: c.x, right: false };
    return null;
  });

  // The binding sits between front and back in the wraparound. Without a back
  // to tell us, fall back to reading direction: right-to-left books bind right.
  const bindingRight = $derived(back ? back.right : work.direction === 'rtl');

  // Front cover proportions: from the real pixels once they load. Until then
  // B5, the usual doujinshi trim (182 × 257 mm).
  const aspect = $derived(
    natural ? (front.w * natural.w) / (front.h * natural.h) : 182 / 257,
  );

  // Depth from the page count. A real 84-page B5 is ~5 mm on 182 mm (0.027); this
  // runs a touch over true scale so the leaves still read, capped for epics.
  const depth = $derived(Math.min(0.08, Math.max(0.022, 0.015 + pageCount * 0.00035)));

  // --- 付箋 & しおり: this visitor's own reading, from lib/shelfmarks.ts ------
  // Re-read when the page comes back from the reader (bfcache keeps the island
  // alive) or another tab writes.
  let marks = $state<Shelfmarks | null>(null);
  $effect(() => {
    const id = work.id;
    const load = () => (marks = loadShelfmarks(id));
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key?.endsWith(id)) load();
    };
    window.addEventListener('pageshow', load);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('pageshow', load);
      window.removeEventListener('storage', onStorage);
    };
  });
  const laid = $derived(marks ? layoutMarks(marks) : null);
  // keep marks off the covers themselves (no z-fighting with the boards)
  const zOf = (depth: number) => `calc(var(--D) / 2 - ${(0.1 + depth * 0.8).toFixed(3)} * var(--D))`;

  const frontCss = $derived(coverUrl ? region(coverUrl, front.x, front.y, front.w, front.h) : '');
  const backCss = $derived(
    coverUrl && back ? region(coverUrl, back.x, front.y, back.w, front.h) : '',
  );
  // A sliver of the wraparound at the binding edge, stretched round the spine.
  const SPINE = 0.022;
  const spineCss = $derived.by(() => {
    if (!coverUrl || !back) return '';
    const x = bindingRight ? front.x + front.w - SPINE : front.x;
    return region(coverUrl, Math.max(0, Math.min(1 - SPINE, x)), front.y, SPINE, front.h);
  });

</script>

<a
  class="book-card"
  {href}
  draggable="false"
  data-sfx="note open"
  aria-label={`${work.title} — ${statusLabel} · ${pageCount}P`}
  onpointerenter={() => prefetch(href)}
  onfocus={() => prefetch(href)}
>
  <div
    class="book-card__stage"
    style={`--aspect:${aspect};--depth:${depth};`}
    use:book={{ bindingRight, href }}
  >
    <div class="book-card__floor" aria-hidden="true"></div>
    <div
      class="book"
      class:book--bind-right={bindingRight}
      data-book
      aria-hidden="true"
    >
      <!-- first leaf, seen when the board swings open -->
      <div class="book__face book__leaf">
        <span class="mono book__leaf-k">PRESSROOM · Nº{String(index + 1).padStart(2, '0')}</span>
        <span class="serif authored book__leaf-t">{work.title}</span>
        <span class="mono book__leaf-m">{pageCount}P · {work.direction.toUpperCase()}</span>
      </div>

      <!-- front board: outside is the cover, inside is endpaper -->
      <div class="book__board">
        {#if coverUrl}
          <div class="book__face book__front" style={frontCss}>
            <span class="book__sheen"></span>
          </div>
        {:else}
          <div class="book__face book__front book__front--blank">
            <span class="serif authored">{work.title}</span>
          </div>
        {/if}
        <div class="book__face book__endpaper"></div>
      </div>

      {#if backCss}
        <div class="book__face book__back" style={backCss}><span class="book__sheen"></span></div>
      {:else}
        <div class="book__face book__back book__back--plain">
          <span class="mono">ASU AZURE</span>
          <span class="serif authored">{work.title}</span>
          <span class="mono">PRESSROOM</span>
        </div>
      {/if}

      <div class="book__face book__spine" style={spineCss}></div>
      {#if laid}
        {#each laid.tabs as tab (tab.page)}
          <span
            class="book__tab"
            style={`--z:${zOf(tab.depth)};--slot:${tab.slot};--tab:var(--tab-${tab.slot})`}
            title={`♥ p.${tab.page}`}
          ></span>
        {/each}
        {#if laid.bookmark}
          <span class="book__mark" style={`--z:${zOf(laid.bookmark.depth)}`}>
            <span class="mono">{laid.bookmark.page}</span>
          </span>
        {/if}
      {/if}
      <div class="book__face book__fore"></div>
      <div class="book__face book__head"></div>
      <div class="book__face book__tail"></div>
    </div>
  </div>

  <!-- The label sits on the shelf edge, under the book — the cover already
       carries its own lettering, so nothing is printed over the artwork. -->
  <span class="book-card__label">
    <span class="book-card__title serif authored">{work.title}</span>
    <span class="book-card__meta mono">
      {statusLabel} · {pageCount}P · {work.direction.toUpperCase()}
      {#if laid?.bookmark}<span class="book-card__marked">· {i18n.t('lib.mark')} p.{laid.bookmark.page}</span>{/if}
      {#if laid?.tabs.length}<span class="book-card__marked">· <svg class="book-card__heart" viewBox="0 0 12 11" aria-label="ここすき" role="img"><path d="M6 10.5 1.2 5.8A3 3 0 0 1 6 2a3 3 0 0 1 4.8 3.8Z" fill="currentColor" /></svg> {laid.tabs.length}</span>{/if}
      {#if work.read_locked}
        <svg class="book-card__lock" viewBox="0 0 12 14" aria-label={i18n.t('ov.locked')} role="img">
          <rect x="1" y="6" width="10" height="7.5" rx="1.2" fill="currentColor" />
          <path d="M3.4 6V4.2a2.6 2.6 0 0 1 5.2 0V6" fill="none" stroke="currentColor" stroke-width="1.4" />
        </svg>
      {/if}
    </span>
    {#if work.tags.length}
      <span class="book-card__tags mono">{work.tags.join(' / ')}</span>
    {/if}
    <span class="book-card__go mono">{i18n.t('lib.open')} <span class="mk-hop" aria-hidden="true">→</span></span>
  </span>
</a>

<style>
  .book-card {
    display: flex;
    flex-direction: column;
    color: inherit;
    text-decoration: none;
    -webkit-user-drag: none;
    user-select: none;
    outline: none;
  }

  /* --- Stage: the fixed hit area. Only the box inside it moves. ------------ */
  .book-card__stage {
    position: relative;
    /* Room for the tallest trim so books of different sizes share a baseline. */
    aspect-ratio: 0.74;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    perspective: 1300px;
    perspective-origin: 50% 35%;
    touch-action: pan-y;
    cursor: grab;
    container-type: inline-size;
  }
  .book-card__stage:global(.is-dragging) { cursor: grabbing; }

  .book-card__floor {
    position: absolute;
    left: 8%;
    right: 8%;
    bottom: -0.6rem;
    height: 1.4rem;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(0, 0, 0, 0.75), transparent);
    opacity: calc(0.9 - var(--lift, 0) * 0.35);
    scale: calc(1 - var(--lift, 0) * 0.12) 1;
    filter: blur(calc(2px + var(--lift, 0) * 5px));
    pointer-events: none;
  }

  /* --- The box ------------------------------------------------------------
     W is the stage width scaled by trim (wide trims get narrower so every book
     keeps the same height budget); H follows the cover's own aspect; D is the
     page-count depth. Faces are placed with the classic centred-cube recipe. */
  .book {
    --W: min(84cqi, calc(124cqi * var(--aspect)));
    --H: calc(var(--W) / var(--aspect));
    --D: calc(var(--W) * var(--depth));
    position: relative;
    width: var(--W);
    height: var(--H);
    margin-bottom: 0.3rem;
    transform-style: preserve-3d;
    transform: rotateX(7deg) rotateY(-34deg);
    will-change: transform;
  }
  .book--bind-right { transform: rotateX(7deg) rotateY(34deg); }

  .book__face {
    position: absolute;
    backface-visibility: hidden;
    background-color: #d8d2c4;
    background-repeat: no-repeat;
  }

  /* Front board hinges on the binding edge. */
  .book__board {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    transform-origin: 0% 50%;
    transform: translateZ(calc(var(--D) / 2)) rotateY(var(--open, 0deg));
  }
  .book--bind-right .book__board { transform-origin: 100% 50%; }
  .book__front,
  .book__endpaper {
    inset: 0;
    border-radius: 1px 3px 3px 1px;
  }
  .book--bind-right .book__front,
  .book--bind-right .book__endpaper { border-radius: 3px 1px 1px 3px; }
  .book__front {
    overflow: hidden;
    box-shadow: inset 3px 0 6px -3px rgba(0, 0, 0, 0.35);
  }
  .book--bind-right .book__front { box-shadow: inset -3px 0 6px -3px rgba(0, 0, 0, 0.35); }
  .book__front--blank {
    display: grid;
    place-items: center;
    padding: 12%;
    background: var(--ink-bg-soft);
    color: var(--ink-fg);
    text-align: center;
    border: 1px solid var(--line-strong);
  }
  .book__endpaper {
    transform: rotateY(180deg);
    background: #efe9dc;
    background-image:
      linear-gradient(rgba(39, 66, 240, 0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(39, 66, 240, 0.08) 1px, transparent 1px);
    background-size: 12px 12px;
  }

  /* Gloss laminate: a soft diagonal band that slides with the yaw. */
  .book__sheen {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      105deg,
      transparent calc(var(--sheen, 50%) - 22%),
      rgba(255, 255, 255, 0.16) calc(var(--sheen, 50%) - 4%),
      rgba(255, 255, 255, 0.28) var(--sheen, 50%),
      transparent calc(var(--sheen, 50%) + 16%)
    );
    mix-blend-mode: screen;
    pointer-events: none;
  }

  .book__leaf {
    inset: 1px;
    transform: translateZ(calc(var(--D) / 2 - 1px));
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 0.6rem;
    padding: 14%;
    background: #f4efe4;
    color: #16140f;
    text-align: center;
  }
  .book__leaf-k,
  .book__leaf-m {
    font-size: max(7px, 3.4cqi);
    letter-spacing: 0.16em;
    color: #8a8373;
  }
  .book__leaf-t { font-size: max(10px, 6.4cqi); line-height: 1.3; }

  .book__back {
    inset: 0;
    transform: rotateY(180deg) translateZ(calc(var(--D) / 2));
    overflow: hidden;
  }
  .book__back--plain {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: 12% 10%;
    background: #e9e4d8;
    color: #16140f;
    text-align: center;
    font-size: max(8px, 3.6cqi);
  }

  /* Spine and fore-edge: D wide, full height, on the side faces. */
  .book__spine,
  .book__fore {
    top: 0;
    left: calc(50% - var(--D) / 2);
    width: var(--D);
    height: 100%;
  }
  .book__spine {
    transform: rotateY(-90deg) translateZ(calc(var(--W) / 2));
    background-color: #2b2d3a;
    box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.18);
  }
  .book--bind-right .book__spine { transform: rotateY(90deg) translateZ(calc(var(--W) / 2)); }
  .book__fore {
    transform: rotateY(90deg) translateZ(calc(var(--W) / 2 - 1px));
    /* The leaves themselves: a fine rule per sheet, shaded toward the covers. */
    background:
      linear-gradient(90deg, rgba(0, 0, 0, 0.28), transparent 18%, transparent 82%, rgba(0, 0, 0, 0.28)),
      repeating-linear-gradient(90deg, #f1ebdd 0 1.4px, #d9d1bf 1.4px 2px);
  }
  .book--bind-right .book__fore { transform: rotateY(-90deg) translateZ(calc(var(--W) / 2 - 1px)); }

  .book__head,
  .book__tail {
    left: 1px;
    width: calc(100% - 3px);
    top: calc(50% - var(--D) / 2);
    height: var(--D);
    background:
      linear-gradient(180deg, rgba(0, 0, 0, 0.22), transparent 25%, transparent 75%, rgba(0, 0, 0, 0.22)),
      repeating-linear-gradient(180deg, #f3eee2 0 1.4px, #dcd4c2 1.4px 2px);
  }
  .book__head { transform: rotateX(90deg) translateZ(calc(var(--H) / 2 - 1px)); }
  .book__tail { transform: rotateX(-90deg) translateZ(calc(var(--H) / 2 - 1px)); }

  /* --- 付箋 & しおり --------------------------------------------------------
     Placed in the box's own coordinates: x at the fore-edge (tabs) or near the
     spine (the bookmark card), z at the page's depth between the boards. */
  .book {
    --tab-0: rgba(255, 196, 64, 0.92);
    --tab-1: rgba(255, 110, 150, 0.9);
    --tab-2: rgba(90, 200, 250, 0.9);
    --tab-3: rgba(150, 225, 110, 0.9);
    --tab-4: rgba(255, 140, 90, 0.9);
  }
  .book__tab {
    position: absolute;
    top: calc(10% + var(--slot) * 14%);
    left: calc(100% - 3px);
    width: calc(var(--W) * 0.075);
    height: 8%;
    border-radius: 0 2px 2px 0;
    background: linear-gradient(90deg, rgba(0, 0, 0, 0.12), transparent 30%), var(--tab);
    transform: translateZ(var(--z));
  }
  .book--bind-right .book__tab {
    left: auto;
    right: calc(100% - 3px);
    border-radius: 2px 0 0 2px;
    background: linear-gradient(270deg, rgba(0, 0, 0, 0.12), transparent 30%), var(--tab);
  }
  .book__mark {
    position: absolute;
    top: -13%;
    left: 16%;
    width: 11%;
    height: 26%;
    display: flex;
    justify-content: center;
    padding-top: 4%;
    background: linear-gradient(180deg, var(--accent) 0 12%, #f4efe4 12%);
    border-radius: 1px;
    box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.25);
    color: #16140f;
    transform: translateZ(var(--z));
  }
  .book--bind-right .book__mark { left: auto; right: 16%; }
  .book__mark span {
    margin-top: 0.4em;
    font-size: max(6px, 3.4cqi);
    letter-spacing: 0.04em;
  }
  .book-card__marked { color: var(--fg); }
  .book-card__heart { width: 0.62rem; height: 0.56rem; color: #ff6e96; vertical-align: -0.05em; }

  /* --- Label on the shelf edge --------------------------------------------- */
  .book-card__label {
    position: relative;
    display: grid;
    gap: 0.3rem;
    margin-top: 0.2rem;
    padding-top: 1.2rem;
  }
  .book-card__title {
    font-size: clamp(0.98rem, 1.5vw, 1.15rem);
    line-height: 1.35;
    color: var(--fg);
    transition: color 0.25s var(--ease);
  }
  .book-card__meta {
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
    font-size: 0.58rem;
    letter-spacing: 0.12em;
    color: var(--fg-dim);
  }
  .book-card__lock { width: 0.62rem; height: 0.72rem; color: var(--amber, #e8a31a); }
  .book-card__tags { font-size: 0.55rem; color: var(--fg-faint); }
  .book-card__go {
    margin-top: 0.2rem;
    font-size: 0.58rem;
    letter-spacing: 0.14em;
    color: var(--accent);
  }
  @media (hover: hover) {
    .book-card__go {
      color: var(--fg-faint);
      transition: color 0.25s var(--ease);
    }
    .book-card:hover .book-card__go { color: var(--accent); }
    .book-card:hover .book-card__title { color: #fff; }
  }
  .book-card:focus-visible .book-card__title {
    text-decoration: underline;
    text-decoration-color: var(--accent);
    text-underline-offset: 0.25em;
  }
  .book-card:focus-visible .book-card__stage {
    outline: 1.5px solid var(--accent);
    outline-offset: 6px;
    border-radius: 6px;
  }
</style>
