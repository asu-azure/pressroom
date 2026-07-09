<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { supabase } from '../../lib/supabase';
  import { toPageRec } from '../../lib/storagePaths';
  import { sortedChapters } from '../../lib/chapterOrder';
  import { loadProgress } from '../../lib/persistence';
  import { decode } from '../../scripts/text';
  import { toRichHtml } from '../../lib/richtext';
  import { i18n } from '../../lib/i18n.svelte';
  import LangBar from '../library/LangBar.svelte';
  import type { Work, PageRec, Chapter } from '../../lib/types';

  let { slug }: { slug: string } = $props();

  gsap.registerPlugin(ScrollTrigger);
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let work = $state<Work | null>(null);
  let pages = $state<PageRec[]>([]);
  let chapters = $state<Chapter[]>([]);
  let status = $state<'loading' | 'ready' | 'missing'>('loading');
  let continueAt = $state<string | null>(null);

  const ordered = $derived([...pages].sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1)));
  // Blanks are spacer leaves — never a cover, and not counted as content pages.
  const cover = $derived(
    ordered.find((p) => p.id === work?.cover_page_id) ?? ordered.find((p) => !p.isBlank) ?? null,
  );
  const realPageCount = $derived(ordered.filter((p) => !p.isBlank).length);
  const frontPages = $derived(ordered.filter((p) => !p.chapterId));
  const chapterList = $derived(
    sortedChapters(chapters)
      .map((ch) => ({
        ch,
        pages: ordered.filter((p) => p.chapterId === ch.id),
        cover:
          ordered.find((p) => p.id === ch.cover_page_id) ??
          ordered.find((p) => p.chapterId === ch.id && !p.isBlank) ??
          null,
      }))
      .filter((c) => c.pages.length > 0),
  );
  const forewordHtml = $derived(work ? toRichHtml(work.foreword) : '');
  const statusKey = $derived(
    work ? (`status.${work.status}` as const) : ('status.oneshot' as const),
  );

  $effect(() => {
    void load();
  });

  // Fade the "scroll for more" cue once the reader starts scrolling.
  let scrolled = $state(false);
  $effect(() => {
    const onScroll = () => (scrolled = window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });
  function scrollDown() {
    document.getElementById('ov-more')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  }

  async function load() {
    const { data: w } = await supabase.from('works').select('*').eq('slug', slug).maybeSingle();
    if (!w) {
      status = 'missing';
      return;
    }
    work = w as Work;
    document.title = `${work.title} — Pressroom`;
    const [{ data: rows }, { data: chRows }] = await Promise.all([
      supabase.from('pages').select('*').eq('work_id', work.id).order('sort_key'),
      supabase.from('chapters').select('*').eq('work_id', work.id).order('sort_key'),
    ]);
    pages = (rows ?? []).map(toPageRec);
    chapters = (chRows ?? []) as Chapter[];
    continueAt = loadProgress(work.id);
    status = 'ready';
  }

  // --- Editorial FUI motion: reversible scroll entrances + decode labels ---

  function reveal(node: HTMLElement, opts?: { y?: number; delay?: number }) {
    if (reduced) return;
    const tween = gsap.fromTo(
      node,
      { opacity: 0, y: opts?.y ?? 26 },
      {
        opacity: 1,
        y: 0,
        duration: 0.85,
        ease: 'power3.out',
        delay: opts?.delay ?? 0,
        scrollTrigger: {
          trigger: node,
          start: 'top 88%',
          toggleActions: 'play none none reverse',
        },
      },
    );
    return {
      destroy() {
        tween.scrollTrigger?.kill();
        tween.kill();
      },
    };
  }

  function decodeIn(node: HTMLElement) {
    if (reduced) return;
    const text = node.textContent ?? '';
    decode(node, text, 900);
  }

  /** Reveal each rendered rich-text block as it scrolls in (reversible). */
  function revealChildren(node: HTMLElement) {
    if (reduced) return;
    const tweens = [...node.children].map((child) =>
      gsap.fromTo(
        child,
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.85,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: child,
            start: 'top 90%',
            toggleActions: 'play none none reverse',
          },
        },
      ),
    );
    return {
      destroy() {
        for (const t of tweens) {
          t.scrollTrigger?.kill();
          t.kill();
        }
      },
    };
  }

  // "Start reading" must open page 1, not resume — so pin it to the first
  // page id (the Reader falls back to saved progress when ?p is absent).
  const firstId = $derived(ordered[0]?.id ?? null);
  const readHref = $derived(
    firstId ? `/w/${slug}/read?p=${encodeURIComponent(firstId)}` : `/w/${slug}/read`,
  );
  const continueHref = $derived(
    continueAt ? `/w/${slug}/read?p=${encodeURIComponent(continueAt)}` : readHref,
  );
</script>

<LangBar />

{#if status === 'ready'}
  <a class="ov-backchip mono" href="/" data-magnetic>← {i18n.t('rd.library')}</a>
{/if}

{#if status === 'loading'}
  <div class="ov-status spread spread--ink"><p class="mono">{i18n.t('lib.loading')}</p></div>
{:else if status === 'missing' || !work}
  <div class="ov-status spread spread--ink">
    <p class="mono">{i18n.t('rd.missing')}</p>
    <a class="mono ov-status__back" href="/">← {i18n.t('ov.back')}</a>
  </div>
{:else}
  <!-- ACT I: cover hero (ink) -->
  <section class="ov-hero spread spread--ink">
    <span class="watermark ov-hero__wm" aria-hidden="true" data-vel>{work.title.slice(0, 1)}</span>
    <div class="bracket bracket--tl" aria-hidden="true"></div>
    <div class="bracket bracket--tr" aria-hidden="true"></div>
    <div class="ov-hero__inner">
      {#if cover}
        <figure class="ov-hero__cover" use:reveal={{ y: 34 }}>
          <img
            src={cover.medUrl}
            alt={`${work.title} — cover`}
            style={`aspect-ratio: ${cover.width} / ${cover.height}`}
          />
          <figcaption class="mono ov-hero__coverTag">
            {work.direction.toUpperCase()} · {realPageCount}P
          </figcaption>
        </figure>
      {/if}
      <div class="ov-hero__text">
        <p class="mono ov-hero__kicker" use:decodeIn>ASU AZURE · PRESSROOM</p>
        <h1 class="ov-hero__title serif" use:reveal>{work.title}</h1>
        <p class="mono ov-hero__meta" use:reveal={{ delay: 0.08 }}>
          {i18n.t(statusKey)}
          {#if work.tags.length}· {work.tags.join(' / ')}{/if}
        </p>
        {#if work.description}
          <p class="ov-hero__desc serif" use:reveal={{ delay: 0.14 }}>{work.description}</p>
        {/if}
        <div class="ov-hero__actions" use:reveal={{ delay: 0.2 }}>
          <a class="ov-btn mono" href={continueAt ? continueHref : readHref} data-magnetic>
            {continueAt ? i18n.t('ov.continue') : i18n.t('ov.start')} →
          </a>
          {#if continueAt}
            <a class="ov-btn ov-btn--ghost mono" href={readHref} data-magnetic>
              {i18n.t('ov.start')}
            </a>
          {/if}
        </div>
      </div>
    </div>

    <button
      type="button"
      class="ov-scrollcue mono"
      class:is-hidden={scrolled}
      onclick={scrollDown}
      aria-label="Scroll for more"
    >
      <span class="ov-scrollcue__label">{forewordHtml ? i18n.t('ov.foreword') : i18n.t('ov.contents')}</span>
      <span class="ov-scrollcue__line" aria-hidden="true"></span>
      <span class="ov-scrollcue__chev" aria-hidden="true"></span>
    </button>
  </section>

  <!-- ACT II: foreword — the buffer leaf between cover and content (paper) -->
  {#if forewordHtml}
    <section class="ov-fore spread spread--paper" id="ov-more">
      <div class="paper-grid" aria-hidden="true"></div>
      <div class="crop crop--tl" aria-hidden="true"></div>
      <div class="crop crop--tr" aria-hidden="true"></div>
      <div class="crop crop--bl" aria-hidden="true"></div>
      <div class="crop crop--br" aria-hidden="true"></div>
      <div class="regmark ov-fore__reg" aria-hidden="true"></div>
      <div class="ov-fore__inner">
        <p class="mono ov-fore__label" use:reveal>✳ {i18n.t('ov.foreword')}</p>
        <div class="ov-fore__body serif" use:revealChildren>
          {@html forewordHtml}
        </div>
        <div class="ov-fore__sig">
          <span class="sig-mark serif" aria-hidden="true">A</span>
          <span class="mono">ASU AZURE</span>
        </div>
      </div>
    </section>
  {/if}

  <!-- ACT III: contents — chapter & page overview (ink) -->
  <section class="ov-toc spread spread--ink" id={forewordHtml ? undefined : 'ov-more'}>
    <div class="ov-toc__inner">
      <header class="ov-toc__head" use:reveal>
        <span class="index-num" aria-hidden="true">目</span>
        <h2 class="serif ov-toc__title">{i18n.t('ov.contents')}</h2>
        <span class="ov-toc__rule" aria-hidden="true"></span>
        <span class="mono">{realPageCount} {i18n.t('ov.pages')}</span>
      </header>

      {#if frontPages.length && chapterList.length}
        <div class="ov-chapter" use:reveal>
          <header class="ov-chapter__head">
            <span class="mono ov-chapter__num">00</span>
            <h3 class="serif ov-chapter__title">{i18n.t('ov.front')}</h3>
            <span class="mono ov-chapter__count">{frontPages.filter((p) => !p.isBlank).length}P</span>
          </header>
          <div class="ov-strip" class:is-rtl={work.direction === 'rtl'}>
            {#each frontPages.filter((p) => !p.isBlank) as page (page.id)}
              <a class="ov-thumb" href={`/w/${slug}/read?p=${encodeURIComponent(page.id)}`} data-cursor="READ">
                <img src={page.thumbUrl} alt="" loading="lazy" />
                <span class="mono ov-thumb__num">{String(ordered.indexOf(page) + 1).padStart(2, '0')}</span>
                {#if page.note}<span class="ov-thumb__note" title="note"></span>{/if}
              </a>
            {/each}
          </div>
        </div>
      {/if}

      {#each chapterList as { ch, pages: chPages, cover: chCover }, ci (ch.id)}
        <div class="ov-chapter" use:reveal>
          <header class="ov-chapter__head">
            <span class="mono ov-chapter__num">{String(ci + 1).padStart(2, '0')}</span>
            <h3 class="serif ov-chapter__title">{ch.title}</h3>
            <span class="mono ov-chapter__count">{chPages.filter((p) => !p.isBlank).length}P</span>
            <a
              class="mono ov-chapter__read"
              href={`/w/${slug}/read?p=${encodeURIComponent((chPages.find((p) => !p.isBlank) ?? chPages[0]).id)}`}
              data-magnetic
            >{i18n.t('ov.start')} →</a>
          </header>
          <div class="ov-strip" class:is-rtl={work.direction === 'rtl'}>
            {#if chCover}
              <a
                class="ov-thumb ov-thumb--cover"
                href={`/w/${slug}/read?p=${encodeURIComponent(chPages[0].id)}`}
                data-cursor="READ"
              >
                <img src={chCover.thumbUrl} alt={`${ch.title} — cover`} loading="lazy" />
                <span class="mono ov-thumb__tag">{i18n.t('rd.toc')}</span>
              </a>
            {/if}
            {#each chPages.filter((p) => !p.isBlank) as page (page.id)}
              <a class="ov-thumb" href={`/w/${slug}/read?p=${encodeURIComponent(page.id)}`} data-cursor="READ">
                <img src={page.thumbUrl} alt="" loading="lazy" />
                <span class="mono ov-thumb__num">{String(ordered.indexOf(page) + 1).padStart(2, '0')}</span>
                {#if page.note}<span class="ov-thumb__note" title="note"></span>{/if}
              </a>
            {/each}
          </div>
        </div>
      {/each}

      <footer class="ov-foot">
        <a class="mono ov-foot__back" href="/" data-magnetic>← {i18n.t('ov.back')}</a>
        <span class="mono">© ASU AZURE</span>
      </footer>
    </div>
  </section>
{/if}

<style>
  .ov-status {
    min-height: 100svh;
    display: grid;
    place-content: center;
    gap: 1.2rem;
    text-align: center;
    padding: var(--pad);
    position: relative;
    z-index: 1;
  }
  .ov-status__back:hover {
    color: var(--accent);
  }

  /* ---- hero ---- */
  .ov-hero {
    position: relative;
    z-index: 1;
    min-height: 100svh;
    display: flex;
    align-items: center;
    overflow: hidden;
    isolation: isolate;
  }
  .ov-hero__wm {
    top: 8%;
    right: 4%;
    --wm-stroke: rgba(244, 241, 234, 0.09);
  }
  /* "Scroll for more" cue — proof-sheet flavour: mono label, registration
     hairline, a cobalt chevron that bounces. Fades once the reader scrolls. */
  .ov-scrollcue {
    position: absolute;
    left: 50%;
    bottom: clamp(1rem, 3.5vh, 2.4rem);
    transform: translateX(-50%);
    z-index: 3;
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    background: none;
    border: 0;
    cursor: pointer;
    transition: opacity 0.5s var(--ease);
  }
  .ov-scrollcue.is-hidden {
    opacity: 0;
    pointer-events: none;
  }
  .ov-scrollcue__label {
    font-size: 0.55rem;
    letter-spacing: 0.28em;
    color: var(--fg-faint);
    transition: color 0.25s var(--ease);
  }
  .ov-scrollcue:hover .ov-scrollcue__label {
    color: var(--fg);
  }
  .ov-scrollcue__line {
    width: 1px;
    height: clamp(1rem, 3vh, 1.6rem);
    background: linear-gradient(var(--accent), transparent);
  }
  .ov-scrollcue__chev {
    width: 0.75rem;
    height: 0.75rem;
    margin-top: -0.35rem;
    border-right: 2px solid var(--accent);
    border-bottom: 2px solid var(--accent);
    transform: rotate(45deg);
    animation: ov-cue-bounce 1.6s var(--ease) infinite;
  }
  @keyframes ov-cue-bounce {
    0%, 100% { transform: rotate(45deg) translate(-2px, -2px); opacity: 0.35; }
    50% { transform: rotate(45deg) translate(2px, 2px); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ov-scrollcue__chev {
      animation: none;
      opacity: 0.85;
    }
  }
  .ov-hero__inner {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    gap: clamp(2rem, 5vw, 4rem);
    align-items: center;
    width: 100%;
    padding: clamp(5rem, 12vh, 7rem) var(--pad) clamp(3rem, 8vh, 5rem);
    max-width: 1200px;
    margin: 0 auto;
  }
  .ov-hero__cover {
    position: relative;
    margin: 0;
    border: 1px solid var(--line-strong);
    background: var(--bg-soft);
    max-width: min(100%, 24rem);
    justify-self: center;
  }
  .ov-hero__cover img {
    display: block;
    width: 100%;
    height: auto;
  }
  .ov-hero__coverTag {
    position: absolute;
    bottom: 0.5rem;
    left: 0.6rem;
    color: #f4f1ea;
    mix-blend-mode: difference;
    font-size: 0.58rem;
  }
  .ov-hero__text {
    display: grid;
    gap: 1.1rem;
    align-content: center;
  }
  .ov-hero__kicker {
    color: var(--fg-dim);
  }
  .ov-hero__title {
    font-size: clamp(2.4rem, 6.5vw, 4.6rem);
    line-height: 1.05;
    letter-spacing: -0.01em;
  }
  .ov-hero__meta {
    color: var(--fg-dim);
  }
  .ov-hero__desc {
    max-width: 36em;
    font-size: clamp(0.98rem, 1.4vw, 1.12rem);
    line-height: 1.75;
    color: var(--fg-dim);
    white-space: pre-wrap;
  }
  .ov-hero__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 0.6rem;
  }
  .ov-btn {
    display: inline-block;
    background: var(--accent);
    color: var(--ink-fg);
    padding: 0.95em 1.6em;
    letter-spacing: 0.14em;
    transition: background-color 0.25s var(--ease), color 0.25s var(--ease);
  }
  .ov-btn:hover {
    background: #1d33c4;
  }
  .ov-btn--ghost {
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
  }
  .ov-btn--ghost:hover {
    background: none;
    color: var(--fg);
    border-color: var(--fg-dim);
  }
  @media (max-width: 820px) {
    .ov-hero__inner {
      grid-template-columns: 1fr;
      padding-top: clamp(4.5rem, 10vh, 6rem);
    }
    .ov-hero__cover {
      max-width: min(70vw, 18rem);
    }
    .ov-hero__wm {
      display: none;
    }
  }

  /* ---- foreword (paper buffer leaf) ---- */
  .ov-fore {
    position: relative;
    z-index: 1;
    padding: clamp(5rem, 12vh, 8rem) var(--pad);
    isolation: isolate;
  }
  .ov-fore__reg {
    top: 2.4rem;
    right: 12%;
  }
  .ov-fore__inner {
    position: relative;
    z-index: 2;
    max-width: 44rem;
    margin: 0 auto;
    display: grid;
    gap: clamp(1.6rem, 4vh, 2.4rem);
  }
  .ov-fore__label {
    color: var(--accent);
  }
  /* Block flow (not grid) so author figures can float and wrap text.
     Blocks carry their own margins for rhythm. */
  .ov-fore__body {
    display: block;
    font-size: clamp(1.02rem, 1.5vw, 1.18rem);
    line-height: 2;
  }
  .ov-fore__body::after {
    content: '';
    display: block;
    clear: both;
  }
  .ov-fore__body :global(p) {
    margin: 0 0 1.2em;
  }
  .ov-fore__body :global(h1),
  .ov-fore__body :global(h2),
  .ov-fore__body :global(h3),
  .ov-fore__body :global(h4) {
    font-family: var(--font-serif);
    line-height: 1.25;
    margin: 1.2em 0 0.5em;
  }
  .ov-fore__body :global(h1) { font-size: clamp(1.9rem, 3.6vw, 2.8rem); }
  .ov-fore__body :global(h2) { font-size: clamp(1.55rem, 2.8vw, 2.2rem); }
  .ov-fore__body :global(h3) { font-size: clamp(1.3rem, 2.1vw, 1.7rem); }
  .ov-fore__body :global(h4) { font-size: clamp(1.12rem, 1.6vw, 1.35rem); }
  .ov-fore__body :global(blockquote) {
    border-left: 2px solid var(--accent);
    padding-left: 1.1em;
    color: var(--paper-fg-dim);
    margin: 1.2em 0;
  }
  /* Author-inserted figures: text wraps around side floats (no overlap). Each
     figure is a top-level child of .ov-fore__body, so revealChildren animates
     it in on scroll for free. The grid parent would ignore float, so figures
     opt out of the grid flow via display:block wrappers below. */
  .ov-fore__body :global(figure.fore-fig) {
    margin: 0.4em 0 1.2em;
    padding: 0;
  }
  .ov-fore__body :global(.fore-fig--left) {
    float: left;
    width: 48%;
    margin: 0.2rem 1.6rem 1rem 0;
  }
  .ov-fore__body :global(.fore-fig--right) {
    float: right;
    width: 48%;
    margin: 0.2rem 0 1rem 1.6rem;
  }
  .ov-fore__body :global(.fore-fig--center) {
    float: none;
    margin: 1.6rem auto;
  }
  .ov-fore__body :global(.fore-fig--sm) { width: 30%; }
  .ov-fore__body :global(.fore-fig--md) { width: 48%; }
  .ov-fore__body :global(.fore-fig--lg) { width: 66%; }
  .ov-fore__body :global(.fore-fig img) {
    display: block;
    width: 100%;
    height: auto;
    border: 1px solid var(--line-strong);
    background: var(--bg-soft);
  }
  .ov-fore__body :global(.fore-fig figcaption) {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.06em;
    color: var(--paper-fg-dim, var(--fg-faint));
    padding-top: 0.4rem;
  }
  @media (max-width: 640px) {
    .ov-fore__body :global(figure.fore-fig),
    .ov-fore__body :global(.fore-fig--sm),
    .ov-fore__body :global(.fore-fig--md),
    .ov-fore__body :global(.fore-fig--lg) {
      float: none;
      width: 100%;
      margin: 1.2rem 0;
    }
  }
  .ov-fore__sig {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 0.6rem;
  }
  .sig-mark {
    display: inline-grid;
    place-items: center;
    width: 2.6rem;
    aspect-ratio: 1;
    background: var(--accent);
    color: var(--ink-fg);
    font-style: italic;
    font-size: 1.5rem;
    border-radius: 8px;
    rotate: -4deg;
    box-shadow: 0 4px 18px -8px rgba(39, 66, 240, 0.6);
    user-select: none;
  }
  .ov-backchip {
    position: fixed;
    top: calc(0.9rem + env(safe-area-inset-top));
    left: var(--pad);
    z-index: 90;
    mix-blend-mode: difference;
    color: #fff;
    opacity: 0.65;
    transition: opacity 0.25s var(--ease);
  }
  .ov-backchip:hover {
    opacity: 1;
  }

  /* ---- contents ---- */
  .ov-toc {
    position: relative;
    z-index: 1;
    padding: clamp(5rem, 12vh, 8rem) var(--pad) clamp(3rem, 8vh, 5rem);
  }
  .ov-toc__inner {
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    gap: clamp(2.2rem, 5vh, 3.4rem);
  }
  .ov-toc__head {
    display: flex;
    align-items: baseline;
    gap: 1.2rem;
    position: relative;
  }
  .ov-toc__head .index-num {
    position: absolute;
    top: -0.55em;
    left: -0.12em;
    z-index: -1;
    font-size: clamp(5rem, 13vw, 9rem);
  }
  .ov-toc__title {
    font-size: clamp(1.8rem, 4.5vw, 2.8rem);
  }
  .ov-toc__rule {
    flex: 1;
    height: 1px;
    background: var(--line-strong);
  }
  .ov-chapter {
    display: grid;
    gap: 1rem;
  }
  .ov-chapter__head {
    display: flex;
    align-items: baseline;
    gap: 0.9rem;
    border-bottom: 1px solid var(--line);
    padding-bottom: 0.5rem;
  }
  .ov-chapter__num {
    color: var(--accent);
  }
  .ov-chapter__title {
    font-size: clamp(1.15rem, 2.4vw, 1.5rem);
  }
  .ov-chapter__count {
    color: var(--fg-faint);
  }
  .ov-chapter__read {
    margin-left: auto;
    color: var(--fg-dim);
    white-space: nowrap;
  }
  .ov-chapter__read:hover {
    color: var(--accent);
  }
  .ov-strip {
    display: flex;
    gap: 0.6rem;
    overflow-x: auto;
    padding-bottom: 0.6rem;
    scrollbar-width: thin;
    -webkit-overflow-scrolling: touch;
  }
  .ov-strip.is-rtl {
    direction: rtl;
  }
  .ov-thumb {
    position: relative;
    flex: 0 0 auto;
    width: clamp(4.6rem, 9vw, 6.4rem);
    border: 1px solid var(--line);
    background: var(--bg-soft);
    overflow: hidden;
    transition: border-color 0.25s var(--ease), transform 0.25s var(--ease);
  }
  .ov-thumb:hover {
    border-color: var(--accent);
    transform: translateY(-3px);
  }
  .ov-thumb img {
    display: block;
    width: 100%;
    aspect-ratio: 1131 / 1600;
    object-fit: cover;
  }
  .ov-thumb__num {
    position: absolute;
    top: 3px;
    left: 4px;
    font-size: 0.52rem;
    color: #f4f1ea;
    mix-blend-mode: difference;
    direction: ltr;
  }
  .ov-thumb__tag {
    position: absolute;
    bottom: 3px;
    left: 4px;
    font-size: 0.5rem;
    background: var(--accent);
    color: var(--ink-fg);
    padding: 0.15em 0.45em;
    direction: ltr;
  }
  .ov-thumb--cover {
    border-color: var(--line-strong);
  }
  .ov-thumb__note {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #e8a31a;
  }
  .ov-foot {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    border-top: 1px solid var(--line);
    padding-top: 1.4rem;
  }
  .ov-foot__back:hover {
    color: var(--accent);
  }
</style>
