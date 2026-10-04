<script lang="ts" module>
  /** The drawn icons a tip can carry (inline SVG — the subset mono webfont has no such glyphs). */
  export type GuideIcon = 'turn-rtl' | 'turn-ltr' | 'scroll' | 'menu' | 'settings' | 'fav' | 'toc' | 'mark';
  export interface GuideTip {
    icon: GuideIcon;
    title: string;
    body: string;
  }
</script>

<script lang="ts">
  /**
   * The reading guide: four tips, shown the first time someone opens a reader
   * (per reader type, remembered in localStorage — Reader / NovelReader decide)
   * and again from the bar's 「？ 使い方」. Readers didn't know where to tap.
   *
   * One button, but a tap anywhere or Esc closes it too. Modal: focus moves to
   * the button, Tab stays on it (or between it and the timeline link), and goes
   * back where it was on close. Reduced motion: it simply appears.
   *
   * `timeline`: the book is on /timeline — the foot asks 「読む順番は？ → 時系列」,
   * because the books jump in time on purpose.
   */
  import { i18n } from '../../lib/i18n.svelte';

  let {
    tips,
    tone = 'ink',
    timeline = false,
    onClose,
  }: {
    tips: GuideTip[];
    tone?: 'ink' | 'paper';
    timeline?: boolean;
    onClose: () => void;
  } = $props();

  let okEl: HTMLButtonElement | undefined = $state();
  let tlEl: HTMLAnchorElement | undefined = $state();
  const before = document.activeElement as HTMLElement | null;
  $effect(() => {
    okEl?.focus();
    return () => before?.focus?.();
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      e.preventDefault(); // focus stays in the dialog: the button, and the link when there is one
      (tlEl && document.activeElement === okEl ? tlEl : okEl)?.focus();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- a tap anywhere closes it (Esc for keys, handled on the window) -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div
  class="gd"
  class:gd--paper={tone === 'paper'}
  role="dialog"
  aria-modal="true"
  aria-labelledby="gd-title"
  tabindex="-1"
  onclick={onClose}
>
  <div class="gd__card">
    <p class="gd__title" id="gd-title">{i18n.t('gd.title')}</p>
    <ol class="gd__tips">
      {#each tips as tip (tip.icon)}
        <li class="gd__tip">
          <svg class="gd__ico" viewBox="0 0 48 48" aria-hidden="true">
            {#if tip.icon === 'turn-rtl' || tip.icon === 'turn-ltr'}
              <!-- a page, its "next" third lit, a tap there -->
              <rect x="10" y="5" width="28" height="38" rx="3" />
              <rect
                class="gd__lit"
                x={tip.icon === 'turn-rtl' ? 10 : 28.7}
                y="5"
                width="9.3"
                height="38"
                rx="3"
              />
              <path d={tip.icon === 'turn-rtl' ? 'M17 24h-9m3-4-4 4 4 4' : 'M31 24h9m-3-4 4 4-4 4'} />
              <path class="gd__faint" d={tip.icon === 'turn-rtl' ? 'M33 21l3 3-3 3' : 'M15 21l-3 3 3 3'} />
            {:else if tip.icon === 'scroll'}
              <rect x="14" y="4" width="20" height="17" rx="2" />
              <rect x="14" y="25" width="20" height="17" rx="2" />
              <path d="M40 16v18m-4-4 4 4 4-4" />
            {:else if tip.icon === 'menu'}
              <!-- the bar over the page, a tap in the middle -->
              <rect x="10" y="5" width="28" height="38" rx="3" />
              <path class="gd__lit-line" d="M13 11h22" />
              <circle class="gd__lit" cx="24" cy="25" r="4" />
              <circle cx="24" cy="25" r="8" class="gd__faint" />
            {:else if tip.icon === 'settings'}
              <!-- a gear: a thick dashed ring is the teeth -->
              <circle cx="24" cy="24" r="12" stroke-width="5" stroke-dasharray="4.7 4.7" stroke-linecap="butt" />
              <circle cx="24" cy="24" r="9" />
              <circle cx="24" cy="24" r="3.5" />
            {:else if tip.icon === 'fav'}
              <path
                class="gd__lit"
                d="M32.6 12.6c-2.6 0-4.9 1.2-6.4 3-1.6-1.8-4-3-6.5-3-4.6 0-8.4 3.8-8.4 8.4v.9c.6 7 8 12.8 12.4 15.5.7.4 1.6.7 2.6.7s1.7-.3 2.6-.7c4.4-2.8 11.9-8.5 12.4-15.5V21c0-4.6-3.9-8.4-8.7-8.4Z"
              />
              <circle class="gd__faint" cx="24" cy="25" r="20" stroke-dasharray="3 4" />
            {:else if tip.icon === 'toc'}
              <path d="M17 13h20M17 24h20M17 35h20" />
              <circle class="gd__lit" cx="11" cy="13" r="2" />
              <circle cx="11" cy="24" r="2" />
              <circle cx="11" cy="35" r="2" />
            {:else}
              <!-- mark: a bookmark ribbon -->
              <path class="gd__lit" d="M15 6h18v36l-9-7-9 7Z" />
            {/if}
          </svg>
          <span class="gd__text">
            <span class="gd__tipTitle">{tip.title}</span>
            <span class="gd__tipBody">{tip.body}</span>
          </span>
        </li>
      {/each}
    </ol>
    <button type="button" class="gd__ok" bind:this={okEl} onclick={onClose}>{i18n.t('gd.ok')}</button>
    <p class="gd__foot">{i18n.t('gd.anywhere')} · {i18n.t('gd.again')}</p>
    {#if timeline}
      <!-- a real link: the tap that closes the guide still follows it -->
      <a class="gd__tl" href="/timeline" bind:this={tlEl}>{i18n.t('tl.link')}</a>
    {/if}
  </div>
</div>

<style>
  .gd {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: calc(1rem + env(safe-area-inset-top)) 1rem calc(1rem + env(safe-area-inset-bottom));
    background: rgba(8, 8, 10, 0.72);
    overflow-y: auto;
    cursor: pointer;
    --gd-card: var(--ink-bg-soft, #151517);
    --gd-fg: var(--ink-fg, #f4f1ea);
    --gd-dim: rgba(244, 241, 234, 0.72);
    --gd-line: rgba(244, 241, 234, 0.22);
  }
  .gd--paper {
    background: rgba(36, 33, 28, 0.45);
    --gd-card: #fffdf7;
    --gd-fg: #24211c;
    --gd-dim: #5c5649;
    --gd-line: rgba(0, 0, 0, 0.14);
  }
  .gd:focus {
    outline: none;
  }
  .gd__card {
    width: min(26rem, 100%);
    display: grid;
    gap: 1rem;
    padding: 1.3rem 1.2rem 1rem;
    background: var(--gd-card);
    color: var(--gd-fg);
    border: 1px solid var(--gd-line);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  }
  @media (prefers-reduced-motion: no-preference) {
    .gd {
      animation: gd-fade 0.2s var(--ease) both;
    }
    .gd__card {
      animation: gd-rise 0.28s var(--ease) both;
    }
  }
  @keyframes gd-fade {
    from {
      opacity: 0;
    }
  }
  @keyframes gd-rise {
    from {
      transform: translateY(10px);
    }
  }
  .gd__title {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    letter-spacing: 0.18em;
    color: var(--accent);
  }
  .gd__tips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.95rem;
  }
  .gd__tip {
    display: grid;
    grid-template-columns: 2.8rem 1fr;
    gap: 0.85rem;
    align-items: start;
  }
  .gd__ico {
    width: 2.8rem;
    height: 2.8rem;
    fill: none;
    stroke: var(--gd-fg);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .gd__ico .gd__lit {
    fill: color-mix(in srgb, var(--accent) 55%, transparent);
    stroke: var(--accent);
  }
  .gd__ico .gd__lit-line {
    stroke: var(--accent);
    stroke-width: 3;
  }
  .gd__ico .gd__faint {
    stroke: var(--gd-dim);
    opacity: 0.6;
  }
  .gd__text {
    display: grid;
    gap: 0.25rem;
  }
  .gd__tipTitle {
    font-family: var(--font-display-authored, sans-serif);
    font-size: 0.98rem;
    font-weight: 600;
    line-height: 1.4;
  }
  .gd__tipBody {
    font-family: var(--font-display-authored, sans-serif);
    font-size: 0.84rem;
    line-height: 1.6;
    color: var(--gd-dim);
  }
  .gd__ok {
    justify-self: stretch;
    min-height: 2.9rem;
    border: 0;
    background: var(--accent);
    color: #f4f1ea;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    letter-spacing: 0.16em;
    cursor: pointer;
  }
  .gd__ok:hover {
    background: #1d33c4;
  }
  .gd__ok:focus-visible {
    outline: 2px solid var(--gd-fg);
    outline-offset: 2px;
  }
  .gd__foot {
    font-family: var(--font-display-authored, sans-serif);
    font-size: 0.72rem;
    line-height: 1.5;
    color: var(--gd-dim);
    text-align: center;
  }
  /* 読む順番は？ → 時系列: a quiet link under the foot, a real tap target */
  .gd__tl {
    justify-self: center;
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    padding: 0 0.6rem;
    margin-top: -0.4rem;
    font-family: var(--font-display-authored, sans-serif);
    font-size: 0.84rem;
    color: var(--gd-fg);
    text-decoration: underline;
    text-decoration-color: var(--accent);
    text-underline-offset: 0.3em;
  }
  .gd__tl:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
