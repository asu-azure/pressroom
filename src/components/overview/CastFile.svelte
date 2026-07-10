<script lang="ts">
  import { gsap } from 'gsap';
  import { i18n } from '../../lib/i18n.svelte';
  import { toRichHtml } from '../../lib/richtext';
  import type { Character } from '../../lib/types';

  let {
    characters,
    index,
    onNavigate,
    onClose,
  }: {
    characters: Character[]; // profiled cast, author order
    index: number;
    onNavigate: (index: number) => void;
    onClose: () => void;
  } = $props();

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ch = $derived(characters[index]);
  const gallery = $derived(
    ch.images?.length ? ch.images : ch.iconUrl ? [{ url: ch.iconUrl, caption: undefined }] : [],
  );
  const bioHtml = $derived(ch.bio ? toRichHtml(ch.bio) : '');

  let galleryIdx = $state(0);
  let frame: HTMLElement;
  let backdrop: HTMLElement;
  let stageImgWrap: HTMLElement | undefined = $state();
  let lastFocus: Element | null = null;
  let dir = 1; // slide direction of the last character change

  // --- Open / close (dialog-level) ---
  $effect(() => {
    lastFocus = document.activeElement;
    frame?.focus();
    (window as unknown as { __lenis?: { stop(): void } }).__lenis?.stop();
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    if (!reduced) {
      gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' });
      gsap.fromTo(
        frame,
        { opacity: 0, scale: 0.95 },
        { opacity: 1, scale: 1, duration: 0.45, ease: 'power3.out' },
      );
    }
    return () => {
      (window as unknown as { __lenis?: { start(): void } }).__lenis?.start();
      document.documentElement.style.overflow = prevOverflow;
      (lastFocus as HTMLElement | null)?.focus?.();
    };
  });

  let closing = false;
  function requestClose() {
    if (closing) return;
    closing = true;
    if (reduced) {
      onClose();
      return;
    }
    gsap.to(frame, { opacity: 0, scale: 0.96, duration: 0.25, ease: 'power2.in' });
    gsap.to(backdrop, { opacity: 0, duration: 0.3, ease: 'power2.in', onComplete: onClose });
  }

  // --- Cast navigation (wraps) ---
  function nav(delta: -1 | 1) {
    if (characters.length < 2) return;
    dir = delta;
    galleryIdx = 0;
    onNavigate((index + delta + characters.length) % characters.length);
  }

  // --- Gallery navigation ---
  function showImage(i: number, d?: number) {
    if (i === galleryIdx || !gallery[i]) return;
    const slide = d ?? (i > galleryIdx ? 1 : -1);
    galleryIdx = i;
    if (!reduced && stageImgWrap) {
      gsap.fromTo(
        stageImgWrap,
        { opacity: 0, x: 30 * slide, filter: 'blur(4px)' },
        { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.4, ease: 'power3.out' },
      );
    }
  }
  function galleryStep(d: -1 | 1) {
    if (gallery.length < 2) return;
    showImage((galleryIdx + d + gallery.length) % gallery.length, d);
  }

  // Touch swipe on the stage pages the gallery.
  let swipeX: number | null = null;
  function onStagePointerDown(e: PointerEvent) {
    swipeX = e.clientX;
  }
  function onStagePointerUp(e: PointerEvent) {
    if (swipeX === null) return;
    const dx = e.clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 42) galleryStep(dx < 0 ? 1 : -1);
  }

  // --- Keyboard: Esc closes, arrows cycle the cast, Tab stays inside ---
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      requestClose();
      return;
    }
    if (e.key === 'ArrowLeft') nav(-1);
    if (e.key === 'ArrowRight') nav(1);
    if (e.key === 'Tab') {
      const focusables = frame.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // --- Entrance actions (per character, re-run via {#key ch.id}) ---

  /** Body slides in from the travel direction on each character change. */
  function slideIn(node: HTMLElement) {
    if (reduced) return;
    gsap.fromTo(
      node,
      { opacity: 0, x: 38 * dir, filter: 'blur(4px)' },
      { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.45, ease: 'power3.out' },
    );
  }

  /** Name scatters in per grapheme — the art site's assemble() essence. */
  function assemble(node: HTMLElement) {
    if (reduced) return;
    const text = node.textContent ?? '';
    const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)]
      .map((s) => s.segment);
    node.textContent = '';
    const spans = graphemes.map((g) => {
      const s = document.createElement('span');
      s.textContent = g;
      s.style.display = 'inline-block';
      if (/\s/.test(g)) s.style.whiteSpace = 'pre';
      node.appendChild(s);
      return s;
    });
    gsap.fromTo(
      spans,
      {
        opacity: 0,
        x: () => gsap.utils.random(-90, 90),
        y: () => gsap.utils.random(-40, 40),
        rotate: () => gsap.utils.random(-30, 30),
        filter: 'blur(6px)',
      },
      {
        opacity: 1,
        x: 0,
        y: 0,
        rotate: 0,
        filter: 'blur(0px)',
        duration: 0.8,
        ease: 'power3.out',
        stagger: { each: 0.03, from: 'random' },
        delay: 0.12,
      },
    );
  }

  /** Role label: selection-invert sweep (--sw drives a scaleX pseudo-element). */
  function sweep(node: HTMLElement) {
    if (reduced) {
      node.style.setProperty('--sw', '1');
      return;
    }
    gsap.fromTo(node, { '--sw': 0 }, { '--sw': 1, duration: 0.7, ease: 'power2.inOut', delay: 0.35 });
  }

  const pad2 = (n: number) => String(n).padStart(2, '0');
</script>

<svelte:window onkeydown={onKey} />

<div class="cf" role="dialog" aria-modal="true" aria-label={`${i18n.t('cast.file')} — ${ch.name}`}>
  <button class="cf__backdrop" bind:this={backdrop} aria-label={i18n.t('cast.close')} onclick={requestClose}></button>

  <div class="cf__frame" bind:this={frame} tabindex="-1" style={`--c:${ch.color}`}>
    <span class="bracket bracket--tl" aria-hidden="true"></span>
    <span class="bracket bracket--tr" aria-hidden="true"></span>
    <span class="bracket bracket--bl" aria-hidden="true"></span>
    <span class="bracket bracket--br" aria-hidden="true"></span>

    <header class="cf__hud">
      <span class="mono cf__hudLabel">✦ {i18n.t('cast.file')}</span>
      <span class="mono cf__hudCount" aria-live="polite">{pad2(index + 1)} / {pad2(characters.length)}</span>
      <button class="mono cf__close" onclick={requestClose} title={`${i18n.t('cast.close')} (Esc)`}>✕</button>
    </header>

    {#key ch.id}
      <div class="cf__body" use:slideIn>
        <div class="cf__stage">
          {#if gallery.length}
            <div
              class="cf__stageBox"
              onpointerdown={onStagePointerDown}
              onpointerup={onStagePointerUp}
            >
              <div class="cf__stageImg" bind:this={stageImgWrap}>
                <img src={gallery[galleryIdx].url} alt={`${ch.name} — ${galleryIdx + 1}`} draggable="false" />
              </div>
              {#if gallery.length > 1}
                <button class="cf__gNav cf__gNav--l mono" onclick={() => galleryStep(-1)} aria-label="Previous image">‹</button>
                <button class="cf__gNav cf__gNav--r mono" onclick={() => galleryStep(1)} aria-label="Next image">›</button>
              {/if}
              <span class="mono cf__gCount">{pad2(galleryIdx + 1)} / {pad2(gallery.length)}</span>
            </div>
            {#if gallery[galleryIdx].caption}
              <p class="mono cf__caption">{gallery[galleryIdx].caption}</p>
            {/if}
            {#if gallery.length > 1}
              <div class="cf__thumbs">
                {#each gallery as im, i (im.url)}
                  <button
                    class="cf__thumb"
                    class:is-current={i === galleryIdx}
                    onclick={() => showImage(i)}
                    aria-label={`Image ${i + 1}`}
                  >
                    <img src={im.url} alt="" loading="lazy" draggable="false" />
                  </button>
                {/each}
              </div>
            {/if}
          {:else}
            <div class="cf__stageBox cf__stageBox--empty">
              <span class="serif cf__initial" aria-hidden="true">{ch.name.slice(0, 1)}</span>
            </div>
          {/if}
        </div>

        <div class="cf__text">
          {#if ch.role}
            <p class="mono cf__role" use:sweep><span class="cf__roleIn">{ch.role}</span></p>
          {/if}
          <h2 class="serif cf__name" use:assemble>{ch.name}</h2>
          {#if ch.realName}
            <p class="serif cf__realName">
              <span class="mono cf__realNameLabel" aria-hidden="true">本名 —</span>
              {ch.realName}
            </p>
          {/if}
          <span class="cf__rule" aria-hidden="true"></span>
          {#if bioHtml}
            <div class="cf__bio serif">
              {@html bioHtml}
            </div>
          {/if}
        </div>
      </div>
    {/key}

    {#if characters.length > 1}
      <button class="cf__nav cf__nav--l" onclick={() => nav(-1)} aria-label="Previous character">‹</button>
      <button class="cf__nav cf__nav--r" onclick={() => nav(1)} aria-label="Next character">›</button>
    {/if}
  </div>
</div>

<style>
  /* The file is always an ink object, whatever leaf it opens over. */
  .cf {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    padding: clamp(0.6rem, 2.5vw, 2.5rem);
  }
  .cf__backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    cursor: pointer;
    background: rgba(8, 8, 10, 0.72);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
  .cf__frame {
    position: relative;
    z-index: 1;
    width: min(72rem, 100%);
    height: min(46rem, 100%);
    display: grid;
    grid-template-rows: auto 1fr;
    background: var(--ink-bg, #0c0c0d);
    color: var(--ink-fg, #f4f1ea);
    border: 1px solid rgba(244, 241, 234, 0.16);
    outline: none;
    overflow: hidden;
  }
  .cf__frame :global(.bracket) {
    z-index: 6;
  }

  .cf__hud {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    padding: 0.85rem clamp(1rem, 3vw, 1.6rem);
    border-bottom: 1px solid rgba(244, 241, 234, 0.1);
  }
  .cf__hudLabel {
    color: var(--c);
  }
  .cf__hudCount {
    color: rgba(244, 241, 234, 0.45);
  }
  .cf__close {
    margin-left: auto;
    background: none;
    border: 1px solid transparent;
    color: rgba(244, 241, 234, 0.6);
    font-size: 0.95rem;
    padding: 0.35em 0.6em;
    cursor: pointer;
    transition: color 0.2s var(--ease), border-color 0.2s var(--ease);
  }
  .cf__close:hover {
    color: #f4f1ea;
    border-color: rgba(244, 241, 234, 0.3);
  }

  .cf__body {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
    gap: clamp(1.2rem, 3vw, 2.6rem);
    padding: clamp(1rem, 3vw, 2rem) clamp(1rem, 3vw, 2.2rem);
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* ---- gallery stage ---- */
  .cf__stage {
    display: grid;
    gap: 0.7rem;
    align-content: start;
    justify-items: center;
    min-width: 0;
  }
  .cf__stageBox {
    position: relative;
    /* Cap by viewport height so the caption + thumb strip stay visible
       without scrolling the body (4/5 box → width = height × 0.8). */
    width: min(100%, calc(52vh * 0.8));
    aspect-ratio: 4 / 5;
    background: #101012;
    border: 1px solid rgba(244, 241, 234, 0.12);
    overflow: hidden;
    touch-action: pan-y;
  }
  .cf__stageImg {
    position: absolute;
    inset: 0;
  }
  .cf__stageImg img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
  .cf__stageBox--empty {
    display: grid;
    place-items: center;
  }
  .cf__initial {
    font-size: clamp(6rem, 18vw, 11rem);
    font-style: italic;
    color: color-mix(in srgb, var(--c) 40%, transparent);
    user-select: none;
  }
  .cf__gNav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 2;
    width: 2.2rem;
    height: 2.2rem;
    display: grid;
    place-items: center;
    border: 1px solid rgba(244, 241, 234, 0.25);
    border-radius: 50%;
    background: rgba(12, 12, 13, 0.55);
    color: #f4f1ea;
    font-size: 1.1rem;
    cursor: pointer;
    opacity: 0.55;
    transition: opacity 0.2s var(--ease);
  }
  .cf__gNav:hover {
    opacity: 1;
  }
  .cf__gNav--l { left: 0.5rem; }
  .cf__gNav--r { right: 0.5rem; }
  .cf__gCount {
    position: absolute;
    bottom: 0.45rem;
    right: 0.6rem;
    font-size: 0.55rem;
    color: #f4f1ea;
    mix-blend-mode: difference;
  }
  .cf__caption {
    font-size: 0.6rem;
    color: rgba(244, 241, 234, 0.5);
  }
  .cf__thumbs {
    display: flex;
    gap: 0.45rem;
    overflow-x: auto;
    padding-bottom: 0.3rem;
    scrollbar-width: thin;
  }
  .cf__thumb {
    flex: 0 0 auto;
    width: 3.2rem;
    aspect-ratio: 1;
    padding: 0;
    border: 1px solid rgba(244, 241, 234, 0.15);
    background: #101012;
    cursor: pointer;
    opacity: 0.55;
    transition: opacity 0.2s var(--ease), border-color 0.2s var(--ease);
    overflow: hidden;
  }
  .cf__thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .cf__thumb:hover {
    opacity: 0.9;
  }
  .cf__thumb.is-current {
    opacity: 1;
    border-color: var(--c);
  }

  /* ---- text column ---- */
  .cf__text {
    display: grid;
    gap: 0.9rem;
    align-content: start;
    min-width: 0;
  }
  /* Selection-invert sweep: a char-coloured box wipes across the role label. */
  .cf__role {
    position: relative;
    display: inline-block;
    justify-self: start;
    --sw: 0;
    font-size: 0.62rem;
    letter-spacing: 0.26em;
    color: #0c0c0d;
    padding: 0.35em 0.6em;
  }
  .cf__role::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--c);
    transform: scaleX(var(--sw, 0));
    transform-origin: left center;
  }
  .cf__roleIn {
    position: relative;
    opacity: calc(0.25 + var(--sw) * 0.75);
  }
  .cf__name {
    font-size: clamp(2.2rem, 5.5vw, 3.8rem);
    line-height: 1.08;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
  }
  /* Real name rides beneath the nickname — present but secondary. */
  .cf__realName {
    margin-top: -0.3rem;
    font-size: clamp(1.05rem, 1.8vw, 1.35rem);
    font-style: italic;
    color: rgba(244, 241, 234, 0.55);
    overflow-wrap: anywhere;
  }
  .cf__realNameLabel {
    font-size: 0.55rem;
    font-style: normal;
    letter-spacing: 0.2em;
    color: color-mix(in srgb, var(--c) 75%, #f4f1ea);
    margin-right: 0.35em;
    vertical-align: 0.18em;
  }
  .cf__rule {
    width: 3.2rem;
    height: 2px;
    background: var(--c);
  }
  .cf__bio {
    font-size: clamp(0.95rem, 1.3vw, 1.06rem);
    line-height: 1.95;
    color: rgba(244, 241, 234, 0.82);
  }
  .cf__bio :global(p) { margin: 0 0 1em; }
  .cf__bio :global(h1),
  .cf__bio :global(h2),
  .cf__bio :global(h3),
  .cf__bio :global(h4) {
    font-family: var(--font-serif);
    line-height: 1.3;
    margin: 1em 0 0.4em;
  }
  .cf__bio :global(h1) { font-size: 1.7rem; }
  .cf__bio :global(h2) { font-size: 1.4rem; }
  .cf__bio :global(h3) { font-size: 1.2rem; }
  .cf__bio :global(blockquote) {
    border-left: 2px solid var(--c);
    padding-left: 1em;
    color: rgba(244, 241, 234, 0.6);
    margin: 1em 0;
  }

  /* ---- cast prev/next ---- */
  .cf__nav {
    position: absolute;
    bottom: 0.9rem;
    z-index: 6;
    width: 2.6rem;
    height: 2.6rem;
    display: grid;
    place-items: center;
    border: 1px solid rgba(244, 241, 234, 0.25);
    border-radius: 50%;
    background: rgba(12, 12, 13, 0.6);
    color: #f4f1ea;
    font-size: 1.3rem;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s var(--ease), border-color 0.2s var(--ease);
  }
  .cf__nav:hover {
    opacity: 1;
    border-color: var(--c);
  }
  .cf__nav--l { left: 0.9rem; }
  .cf__nav--r { right: 0.9rem; }

  @media (max-width: 760px) {
    .cf {
      padding: 0;
    }
    .cf__frame {
      width: 100%;
      height: 100%;
      border: 0;
    }
    .cf__body {
      grid-template-columns: 1fr;
      padding-bottom: 4.5rem; /* room for the floating cast arrows */
    }
    .cf__stageBox {
      width: 100%;
      aspect-ratio: 1 / 1;
    }
    .cf__name {
      font-size: clamp(1.9rem, 9vw, 2.6rem);
    }
  }
</style>
