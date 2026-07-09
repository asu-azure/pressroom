<script lang="ts">
  import type { PageRec, Character } from '../../lib/types';

  let {
    page,
    sizes,
    eager = false,
    alt,
    translateOn = false,
    characters = [],
    highlightId = null,
    onHighlight,
  }: {
    page: PageRec;
    sizes: string;
    eager?: boolean;
    alt: string;
    translateOn?: boolean;
    characters?: Character[];
    highlightId?: string | null;
    onHighlight?: (id: string | null) => void;
  } = $props();

  let loaded = $state(false);
  // Tap-to-open on touch (hover handles the desktop case via highlightId).
  let openId = $state<string | null>(null);

  function colorOf(id: string | null): string {
    return characters.find((c) => c.id === id)?.color ?? '#2742f0';
  }
  function nameOf(id: string | null): string | null {
    return characters.find((c) => c.id === id)?.name ?? null;
  }
  function toggle(id: string) {
    openId = openId === id ? null : id;
  }
</script>

<!-- Thumb paints instantly (blurred) behind the real image fading in. -->
<span
  class="si"
  class:si--blank={page.isBlank}
  style={`aspect-ratio: ${page.width} / ${page.height}; --pw: ${page.width}; --ph: ${page.height};`}
>
  {#if page.isBlank}
    <span class="mono si__blankMark" aria-hidden="true">◦</span>
  {:else}
  <img class="si__thumb" src={page.thumbUrl} alt="" aria-hidden="true" draggable="false" />
  <img
    class="si__img"
    class:is-loaded={loaded}
    src={page.medUrl}
    srcset={`${page.medUrl} 900w, ${page.fullUrl} 1600w`}
    {sizes}
    {alt}
    decoding="async"
    loading={eager ? 'eager' : 'lazy'}
    draggable="false"
    onload={() => (loaded = true)}
  />

  {#if translateOn && page.bubbles?.length}
    <div class="si__bubbles">
      {#each page.bubbles as b (b.id)}
        {@const on = highlightId === b.id || openId === b.id}
        <div
          class="si__bub"
          class:is-on={on}
          data-bub
          style={`left:${b.x * 100}%; top:${b.y * 100}%; width:${b.w * 100}%; height:${b.h * 100}%; --c:${colorOf(b.charId)}`}
          role="button"
          tabindex="0"
          aria-label={b.text}
          onpointerenter={() => onHighlight?.(b.id)}
          onpointerleave={() => onHighlight?.(null)}
          onclick={() => toggle(b.id)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggle(b.id);
            }
          }}
        >
          <span
            class="si__tip"
            class:si__tip--above={b.y + b.h > 0.62}
            class:is-on={on}
          >
            {#if nameOf(b.charId)}
              <span class="mono si__tipName" style={`color:${colorOf(b.charId)}`}>{nameOf(b.charId)}</span>
            {/if}
            <span class="serif si__tipText">{b.text}</span>
          </span>
        </div>
      {/each}
    </div>
  {/if}
  {/if}
</span>

<style>
  .si {
    position: relative;
    display: block;
    overflow: hidden;
    background: #101012;
    max-width: 100%;
    max-height: 100%;
    /* Size container so .si__bubbles can read the box's rendered dimensions
       (cqw/cqh) cross-axis and reproduce object-fit:contain exactly. Safe:
       .si always has a determinate size from the surface CSS. */
    container-type: size;
  }
  /* Blank spacer leaf — a plain paper-toned page, no image. */
  .si--blank {
    background: #e9e4d8;
    display: grid;
    place-items: center;
  }
  .si__blankMark {
    color: rgba(22, 20, 15, 0.28);
    font-size: 2rem;
    line-height: 1;
  }
  .si__thumb,
  .si__img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
  .si__thumb {
    filter: blur(14px);
    transform: scale(1.04);
  }
  .si__img {
    opacity: 0;
    transition: opacity 0.3s var(--ease);
  }
  .si__img.is-loaded {
    opacity: 1;
  }

  /* --- Translation hotspots --- */
  /* The overlay reproduces the object-fit:contain rect and centers it, so
     bubbles land on the artwork identically at every screen size / layout mode
     even when the surface CSS letterboxes the image inside .si. The min()
     formula is the contain calculation: width = min(boxW, boxH * pageAR),
     height = min(boxH, boxW / pageAR), using container-query units for the box. */
  .si__bubbles {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(100cqw, 100cqh * var(--pw) / var(--ph));
    height: min(100cqh, 100cqw * var(--ph) / var(--pw));
    z-index: 3;
  }
  .si__bub {
    position: absolute;
    border: 1.5px solid color-mix(in srgb, var(--c) 65%, transparent);
    background: color-mix(in srgb, var(--c) 8%, transparent);
    box-sizing: border-box;
    cursor: help;
    transition: background-color 0.2s var(--ease), box-shadow 0.2s var(--ease);
  }
  .si__bub.is-on {
    background: color-mix(in srgb, var(--c) 22%, transparent);
    box-shadow: 0 0 0 2px var(--c);
  }
  .si__tip {
    position: absolute;
    left: 50%;
    top: calc(100% + 8px);
    transform: translateX(-50%) translateY(4px);
    min-width: max(9rem, 100%);
    max-width: min(70vw, 22rem);
    max-height: min(40svh, 18rem);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.55rem 0.7rem;
    background: rgba(12, 12, 13, 0.94);
    border: 1px solid var(--c);
    color: var(--fg);
    display: grid;
    gap: 0.2rem;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 0.2s var(--ease), transform 0.2s var(--ease);
    z-index: 4;
  }
  .si__tip--above {
    top: auto;
    bottom: calc(100% + 8px);
  }
  .si__tip.is-on {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(0);
  }
  .si__tipName {
    font-size: 0.6rem;
    letter-spacing: 0.05em;
  }
  .si__tipText {
    font-size: 0.9rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .si__img,
    .si__tip {
      transition: none;
    }
  }
</style>
