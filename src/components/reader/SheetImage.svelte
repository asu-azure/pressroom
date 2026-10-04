<script lang="ts">
  import type { PageRec, Character } from '../../lib/types';
  import { cropAttr, cropImgStyle } from '../../lib/coverCrop';
  import { pictureOf } from '../../lib/cleanPage';
  import { bust, LOAD_TIMEOUT } from '../../lib/readerUi';
  import { i18n } from '../../lib/i18n.svelte';
  import TypesetLayer from './TypesetLayer.svelte';

  let {
    page,
    sizes,
    eager = false,
    alt,
    translateOn = false,
    typesetOn = false,
    characters = [],
    highlightId = null,
    onHighlight,
  }: {
    page: PageRec;
    sizes: string;
    eager?: boolean;
    alt: string;
    /** Hotspots + tooltips (the translation as notes). */
    translateOn?: boolean;
    /** The translation lettered into the balloons (TypesetLayer). */
    typesetOn?: boolean;
    characters?: Character[];
    highlightId?: string | null;
    onHighlight?: (id: string | null) => void;
  } = $props();

  // under a typeset translation, the page without lettering when there is one
  const pic = $derived(pictureOf(page, typesetOn));

  // --- Loading: never a black page. Until the picture is in, the page is paper
  //     with the blurred thumbnail and a small loader; a failed load is retried
  //     once with a cache-busting URL, then says so with a 「再読み込み」 button.
  //     Each picture × attempt is its own <img> ({#key}), so a swap to the clean
  //     page or a retry starts from 'loading' instead of inheriting 'ready'. ---
  let attempt = $state(0); // 0: as stored; 1: the automatic retry; 2+: the reader's
  let shownKey = '';
  $effect.pre(() => {
    // a new picture (the clean page swapped in, or out) starts its tries afresh
    if (pic.med !== shownKey) {
      shownKey = pic.med;
      attempt = 0;
    }
  });
  const med = $derived(bust(pic.med, attempt));
  const full = $derived(bust(pic.full, attempt));
  let phase = $state<'loading' | 'ready' | 'error'>('loading');
  let imgEl = $state<HTMLImageElement | undefined>();
  let thumbOk = $state(true);

  function ready() {
    phase = 'ready';
  }
  function failed() {
    if (attempt === 0) attempt = 1; // once, quietly
    else phase = 'error';
  }
  function retry() {
    attempt = Math.max(2, attempt + 1);
  }
  // A new <img> (picture or attempt): back to 'loading' — unless it is already
  // in. Safari can skip the load event for a memory-cached image (the reader
  // preloads neighbours), so `complete` is checked, and decode() resolves on its
  // own once the picture is usable, whatever happened to the event. A request
  // that never ends counts as a failure after LOAD_TIMEOUT (eager pictures only).
  $effect(() => {
    const el = imgEl;
    if (!el) return;
    if (el.complete && el.naturalWidth > 0) {
      phase = 'ready';
      return;
    }
    phase = 'loading';
    let live = true;
    el.decode?.().then(
      () => live && el.naturalWidth > 0 && ready(),
      () => {}, // a broken picture also fires `error`, which decides
    );
    // only for eager pictures: a lazy one (scroll mode, off screen) hasn't started
    const timer = eager ? window.setTimeout(() => live && phase === 'loading' && failed(), LOAD_TIMEOUT) : 0;
    return () => {
      live = false;
      clearTimeout(timer);
    };
  });
  const loaded = $derived(phase === 'ready');
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
  class:is-failed={phase === 'error'}
  data-state={page.isBlank ? undefined : phase}
  data-page-id={page.isBlank ? undefined : page.id}
  data-crop={page.crop ? cropAttr(page.crop) : undefined}
  style={`aspect-ratio: ${page.width} / ${page.height}; --pw: ${page.width}; --ph: ${page.height};`}
>
  {#snippet pictures(style: string | undefined)}
    {#if thumbOk}
      <img class="si__thumb" src={page.thumbUrl} alt="" aria-hidden="true" draggable="false" {style} onerror={() => (thumbOk = false)} />
    {/if}
    {#key med}
      <img
        bind:this={imgEl}
        class="si__img"
        class:is-loaded={loaded}
        src={med}
        srcset={`${med} 900w, ${full} 1600w`}
        {sizes}
        {alt}
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
        draggable="false"
        onload={ready}
        onerror={failed}
        {style}
      />
    {/key}
  {/snippet}
  {#if page.isBlank}
    <span class="mono si__blankMark" aria-hidden="true">◦</span>
  {:else}
  {#if page.crop}
    <!-- only part of the image is this page (the cover's front): a frame of the
         crop's shape, the picture scaled and shifted inside it -->
    <span class="si__crop">{@render pictures(cropImgStyle(page.crop))}</span>
  {:else}
    {@render pictures(undefined)}
  {/if}
  {#if phase === 'loading'}
    <!-- paper and a small loader, never a black page (shown after a beat, so a
         quick load doesn't flash it) -->
    <span class="si__wait" aria-hidden="true"><span class="mk-loader"></span></span>
  {:else if phase === 'error'}
    <span class="si__fail" role="alert">
      <span class="si__failText">{i18n.t('rd.imgFail')}</span>
      <!-- data-nav: the page's own tap handling leaves this button alone -->
      <button type="button" class="mono si__retry" data-nav onclick={retry}>{i18n.t('rd.imgRetry')}</button>
    </span>
  {/if}

  {#if typesetOn && page.bubbles?.length}
    <!-- the same contain rect as the hotspots; the layer sizes its text off it -->
    <div class="si__bubbles si__bubbles--ts">
      <TypesetLayer bubbles={page.bubbles} pw={page.width} ph={page.height} clean={pic.clean} />
    </div>
  {:else if translateOn && page.bubbles?.length}
    <div class="si__bubbles">
      {#each page.bubbles.filter((x) => !x.cleanOnly) as b (b.id)}
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
    /* paper until the picture is in — a near-black box here read as "the page
       didn't load" on a dark page's blurred thumbnail */
    background: var(--paper-bg, #e9e4d8);
    max-width: 100%;
    max-height: 100%;
    /* A long press marks a favourite — no iOS image callout on top of it. */
    -webkit-touch-callout: none;
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
  /* The frame for a cropped page: the same contain rect the bubbles use */
  .si__crop {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(100cqw, 100cqh * var(--pw) / var(--ph));
    height: min(100cqh, 100cqw * var(--ph) / var(--pw));
    overflow: hidden;
  }
  .si__crop > img {
    inset: auto;
    max-width: none;
    object-fit: fill;
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
  /* loading: a small loader over the paper/thumbnail, after a beat */
  .si__wait {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    place-items: center;
    pointer-events: none;
    color: var(--accent, #2742f0);
    font-size: 1.6rem;
    opacity: 0;
    animation: si-wait 0.2s 0.35s var(--ease) forwards;
  }
  .si__wait .mk-loader {
    --mk-accent: var(--accent, #2742f0);
  }
  @keyframes si-wait {
    to {
      opacity: 1;
    }
  }
  /* failed twice: say so, and offer a retry — paper, never black */
  .si__fail {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.9rem;
    padding: 1rem;
    background: var(--paper-bg, #e9e4d8);
    color: #24211c;
    text-align: center;
  }
  .si.is-failed .si__img,
  .si.is-failed .si__thumb,
  .si.is-failed .si__bubbles {
    visibility: hidden;
  }
  /* the lettering waits for its picture: over the blurred thumbnail it floated */
  .si[data-state='loading'] .si__bubbles--ts {
    visibility: hidden;
  }
  .si__failText {
    font-family: var(--font-display-authored, sans-serif);
    /* one line on half a phone's width (a spread page) */
    font-size: clamp(0.7rem, 6cqw, 0.95rem);
    line-height: 1.6;
    text-wrap: balance;
    word-break: auto-phrase;
  }
  .si__retry {
    min-height: 2.75rem;
    padding: 0 1.3em;
    border: 0;
    border-radius: 999px;
    background: var(--accent, #2742f0);
    color: #f4f1ea;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    cursor: pointer;
  }
  .si__retry:focus-visible {
    outline: 2px solid #24211c;
    outline-offset: 2px;
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
  .si__bubbles--ts {
    pointer-events: none;
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
    .si__wait {
      animation: none;
      opacity: 1;
    }
  }
</style>
