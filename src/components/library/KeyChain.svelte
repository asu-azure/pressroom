<script lang="ts">
  /**
   * The soundtrack on the shelf: an acrylic keychain hanging from a hook at the
   * end of the row (lib/keychain.ts + styles/keychain.css + scripts/dangle.ts).
   * Brush it and it sways, grab it and it swings and spins on its chain (the QR is
   * on the back), click it to go to its page, /music/starfall. Only rendered when music is on.
   */
  import { prefetch } from 'astro:prefetch';
  import { i18n } from '../../lib/i18n.svelte';
  import { dangle } from '../../scripts/dangle';
  import { keychainHtml, type KeychainData } from '../../lib/keychain';
  import '../../styles/keychain.css';

  let { data, length, movements }: { data: KeychainData; length: string; movements: number } = $props();

  const html = $derived(keychainHtml(data));
  const action = (node: HTMLElement) => dangle(node);

  // The charm is many translucent, blended 3D layers; its first raster costs a
  // weak integrated GPU ~0.4 s (measured cold on an Intel UHD 610, production
  // build), which read as a stutter on entry. So it is hung when that can't be
  // felt: after the page has loaded and settled, once the stage is in view, and
  // not while the visitor is scrolling. The stage holds its place meanwhile.
  let hung = $state(false);
  let stageEl = $state<HTMLElement | null>(null);
  $effect(() => {
    if (!stageEl || hung) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    let lastScroll = 0;
    let seen = false;
    let loaded = document.readyState === 'complete';
    const onScroll = () => (lastScroll = performance.now());
    const onLoad = () => (loaded = true);
    const io = new IntersectionObserver(([en]) => (seen ||= en.isIntersecting), { rootMargin: '200px' });
    io.observe(stageEl);
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('load', onLoad, { once: true });
    const t0 = performance.now();
    let timer = 0;
    const tryHang = () => {
      const now = performance.now();
      if (loaded && seen && now - t0 > 1800 && now - lastScroll > 500) {
        if (w.requestIdleCallback) w.requestIdleCallback(() => (hung = true), { timeout: 800 });
        else hung = true;
        return;
      }
      timer = window.setTimeout(tryHang, 250);
    };
    tryHang();
    return () => {
      clearTimeout(timer);
      io.disconnect();
      removeEventListener('scroll', onScroll);
      removeEventListener('load', onLoad);
    };
  });
</script>

<a
  class="kc-card"
  href="/music/starfall"
  draggable="false"
  data-sfx="note open"
  aria-label={`${data.title.ja} — ${data.title.en} · ${i18n.t('lib.ost')}`}
  onpointerenter={() => prefetch('/music/starfall')}
  onfocus={() => prefetch('/music/starfall')}
>
  {#if hung}
    <div class="kc__stage kc-card__stage" use:action>{@html html}</div>
  {:else}
    <div class="kc__stage kc-card__stage" bind:this={stageEl}></div>
  {/if}

  <span class="book-card__label kc-card__label">
    <span class="kc-card__title"><b>{data.title.ja}</b> <span class="kc-card__en">{data.title.en}</span></span>
    <span class="kc-card__meta mono">{i18n.t('lib.ost')} · {movements} MOVEMENTS · {length}</span>
    <span class="kc-card__go mono">{i18n.t('lib.listen')} <span class="mk-hop" aria-hidden="true">→</span></span>
  </span>
</a>

<style>
  .kc-card {
    display: flex;
    flex-direction: column;
    color: inherit;
    text-decoration: none;
    -webkit-user-drag: none;
    user-select: none;
    outline: none;
  }
  /* The same stage height as a book, so the label sits on the one plank. The
     charm is about a third of a B5's width, hanging from a hook near the top. */
  .kc-card__stage {
    --kc-w: 52cqi;
    --kc-chain: 34cqi;
    aspect-ratio: 0.74;
  }
  .kc-card__label {
    position: relative;
    display: grid;
    align-content: start;
    /* a fixed height, shared with the placeholders (styles/shelf-ph.css), so a
       title that wraps can't move the page when the shelf arrives */
    box-sizing: border-box;
    min-height: var(--shelf-label-h, 7rem);
    gap: 0.3rem;
    margin-top: 0.2rem;
    padding-top: 1.2rem;
  }
  .kc-card__title b {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: clamp(1.05rem, 1.6vw, 1.25rem);
    color: var(--fg);
  }
  .kc-card__en {
    margin-left: 0.4em;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    letter-spacing: 0.3em;
    color: var(--fg-dim);
  }
  .kc-card__meta {
    font-size: 0.58rem;
    letter-spacing: 0.12em;
    color: var(--fg-dim);
  }
  .kc-card__go {
    margin-top: 0.2rem;
    font-size: 0.58rem;
    letter-spacing: 0.14em;
    color: var(--accent);
  }
  @media (hover: hover) {
    .kc-card__go {
      color: var(--fg-faint);
      transition: color 0.25s var(--ease);
    }
    .kc-card:hover .kc-card__go { color: var(--accent); }
  }
  .kc-card:focus-visible .kc-card__stage {
    outline: 1.5px solid var(--accent);
    outline-offset: 6px;
    border-radius: 6px;
  }
</style>
