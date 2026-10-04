<script lang="ts">
  /**
   * /timeline — which order to read the books in, and when each part is set.
   *
   * Two views on one page: 刊行順 (the books as they came out — from the
   * database, works.released_on, ordered like the shelf by lib/release.ts) and
   * 物語の時系列 (the story's three eras, from src/data/timeline.ts). The second
   * is spoiler-free on purpose: eras, places and points of view, never events.
   *
   * Data is fetched in the browser like the shelf's; a failure only costs the
   * covers and dates — the books fall back to the data file's list, and the
   * story line needs no request at all.
   */
  import { supabase } from '../../lib/supabase';
  import { toPageRec } from '../../lib/storagePaths';
  import { frontOnly, cropImgStyle } from '../../lib/coverCrop';
  import { shelfOrder, releaseLines, releaseYear } from '../../lib/release';
  import { kindKey } from '../../lib/series';
  import { loadUnlock } from '../../lib/persistence';
  import { converge } from '../../scripts/mv';
  import { i18n, type DictKey } from '../../lib/i18n.svelte';
  import { BOOKS, ERAS, NEXT, READING_NOTE, SERIES, inTimeline, partHref, pick, type TimelinePart } from '../../data/timeline';
  import LangBar from '../library/LangBar.svelte';
  import type { PageRec, PageRow, Work } from '../../lib/types';

  const t = (key: string) => i18n.t(key as DictKey);
  const pad2 = (n: number) => String(n).padStart(2, '0');

  // --- the books, in release order ---
  let works = $state<Work[] | null>(null);
  let covers = $state<Map<string, PageRec>>(new Map());
  let failed = $state(false);

  $effect(() => {
    void load();
  });

  async function load() {
    try {
      const { data, error } = await supabase
        .from('works')
        .select('*')
        .eq('published', true)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const all = (data ?? []) as Work[];
      // the series this page is about: its books, and any later one that joins it
      const series = new Set([SERIES, ...all.filter((w) => inTimeline(w.slug)).map((w) => w.series_title)].filter(Boolean));
      const mine = shelfOrder(all.filter((w) => inTimeline(w.slug) || (w.series_title && series.has(w.series_title))));
      works = mine;
      const ids = mine.map((w) => w.cover_page_id).filter(Boolean) as string[];
      // RLS lets anyone read a locked book's cover row (read-lock.sql)
      const { data: rows } = ids.length ? await supabase.from('pages').select('*').in('id', ids) : { data: [] };
      const byId = new Map(((rows ?? []) as PageRow[]).map((r) => [r.id, toPageRec(r)]));
      covers = new Map(
        mine.flatMap((w) => {
          const c = w.cover_page_id ? byId.get(w.cover_page_id) : undefined;
          return c ? [[w.id, frontOnly(c, w.cover_crop)] as const] : [];
        }),
      );
    } catch {
      failed = true;
      works = [];
    }
  }

  interface BookCard {
    slug: string;
    title: string;
    cover: PageRec | null;
    year: number | null;
    lines: string[];
    format: string;
    kind: string | null;
  }
  const formatOf = (formats: string[] | undefined) =>
    (formats ?? [])
      .filter((f) => f === 'manga' || f === 'novel')
      .map((f) => t(f === 'novel' ? 'part.novel' : 'part.manga'))
      .join('+');

  const books = $derived.by((): BookCard[] | null => {
    if (works === null) return null;
    if (works.length) {
      return works.map((w) => {
        const key = kindKey(w);
        return {
          slug: w.slug,
          title: w.title,
          cover: covers.get(w.id) ?? null,
          year: releaseYear(w.released_on),
          lines: releaseLines(w, i18n.lang),
          format: formatOf(w.formats),
          kind: key ? t(key) : null,
        };
      });
    }
    // offline: the books this page knows, in its own order, without covers or dates
    return Object.values(BOOKS).map((b) => ({ slug: b.slug, title: b.arc, cover: null, year: null, lines: [], format: '', kind: null }));
  });

  /** A book this tab hasn't unlocked: its buttons wear the lock, like the overview's. */
  const lockedSlugs = $derived(
    new Set((works ?? []).filter((w) => w.read_locked && !loadUnlock(w.id)).map((w) => w.slug)),
  );

  function partButton(p: TimelinePart): string {
    if (p.kind === 'novel') return t('nv.read');
    return p.pages[0] === 1 ? t('ov.start') : t('tl.readFrom').replace('{n}', String(p.pages[0]));
  }
  const range = (p: TimelinePart) => t('part.pages').replace('{a}', String(p.pages[0])).replace('{b}', String(p.pages[1]));

  $effect(() => {
    document.title = `${i18n.lang === 'ja' ? '時系列' : 'Timeline'} — Pressroom`;
  });
</script>

<LangBar />

<div class="tl">
  <!-- ============ HEAD ============ -->
  <header class="tl-head">
    <div class="bracket bracket--tl" aria-hidden="true"></div>
    <div class="bracket bracket--tr" aria-hidden="true"></div>
    <div class="tl-head__inner">
      <p class="mono tl-head__kicker"><span class="authored">{SERIES}</span> · {t('tl.kicker')}</p>
      <h1 class="serif authored tl-head__title">{t('tl.title')}</h1>
      <!-- the one thing to know before choosing a book -->
      <p class="tl-head__note" role="note">{pick(READING_NOTE, i18n.lang)}</p>
      <nav class="tl-head__jump" aria-label={t('tl.jump')}>
        <a class="mono" href="#tl-release">01 · {t('tl.release')} ↓</a>
        <a class="mono" href="#tl-story">02 · {t('tl.story')} ↓</a>
      </nav>
    </div>
  </header>

  <!-- ============ 刊行順 ============ -->
  <section class="tl-sec spread spread--ink" id="tl-release" aria-labelledby="tl-release-h">
    <div class="tl-sec__inner">
      <header class="tl-sec__head">
        <span class="index-num" aria-hidden="true">刊</span>
        <h2 class="serif authored tl-sec__title" id="tl-release-h" use:converge>{t('tl.release')}</h2>
        <span class="tl-sec__rule" aria-hidden="true"></span>
      </header>
      <p class="tl-sec__lede">{t('tl.releaseNote')}</p>

      {#if books === null}
        <p class="mono tl-status">{t('lib.loading')}</p>
      {:else}
        <ol class="tl-books">
          {#each books as b, i (b.slug)}
            <li class="tl-books__item">
              <a class="tl-book" href={`/w/${b.slug}`} data-sfx="open">
                <span
                  class="tl-book__cover"
                  style={b.cover ? `aspect-ratio: ${b.cover.width} / ${b.cover.height}` : undefined}
                >
                  {#if b.cover?.crop}
                    <img src={b.cover.medUrl} alt="" loading="lazy" style={cropImgStyle(b.cover.crop)} />
                  {:else if b.cover}
                    <img src={b.cover.medUrl} alt="" loading="lazy" />
                  {:else}
                    <span class="serif authored tl-book__blank">{b.title}</span>
                  {/if}
                </span>
                <span class="tl-book__text">
                  <span class="mono tl-book__num">Nº{pad2(i + 1)}{#if b.year}&nbsp;· {b.year}{/if}</span>
                  <span class="serif authored tl-book__title">{b.title}</span>
                  {#if b.lines.length}
                    <span class="tl-book__release">
                      {#each b.lines as line, li (li)}<span>{line}</span>{/each}
                    </span>
                  {/if}
                  {#if b.format || b.kind}
                    <span class="tl-book__tags">
                      {#if b.format}<span class="mono tl-tag">{b.format}</span>{/if}
                      {#if b.kind}<span class="mono tl-tag tl-tag--quiet">{b.kind}</span>{/if}
                    </span>
                  {/if}
                  <span class="mono tl-book__go">{t('tl.overview')} <span aria-hidden="true">→</span></span>
                </span>
              </a>
            </li>
          {/each}
        </ol>
        {#if failed}<p class="mono tl-status">{t('lib.offline')}</p>{/if}
      {/if}
    </div>
  </section>

  <!-- ============ 物語の時系列 ============ -->
  <section class="tl-sec tl-sec--story spread spread--paper" id="tl-story" aria-labelledby="tl-story-h">
    <div class="paper-grid" aria-hidden="true"></div>
    <div class="crop crop--tl" aria-hidden="true"></div>
    <div class="crop crop--tr" aria-hidden="true"></div>
    <div class="crop crop--bl" aria-hidden="true"></div>
    <div class="crop crop--br" aria-hidden="true"></div>
    <div class="tl-sec__inner">
      <header class="tl-sec__head">
        <span class="index-num" aria-hidden="true">時</span>
        <h2 class="serif authored tl-sec__title" id="tl-story-h" use:converge>{t('tl.story')}</h2>
        <span class="tl-sec__rule" aria-hidden="true"></span>
      </header>
      <p class="tl-sec__lede">{t('tl.storyNote')}</p>

      <ol class="tl-line">
        {#each ERAS as era, i (era.id)}
          <li class="tl-era">
            <span class="tl-era__dot" aria-hidden="true"></span>
            <p class="mono tl-era__num">{pad2(i + 1)}</p>
            <h3 class="authored tl-era__title">{pick(era.title, i18n.lang)}</h3>
            <ul class="tl-parts">
              {#each era.parts as part (part.book.slug + part.pages[0])}
                {@const locked = lockedSlugs.has(part.book.slug)}
                <li class="tl-part">
                  <div class="tl-part__body">
                    <p class="tl-part__head">
                      <span class="serif authored tl-part__arc">{part.book.arc}</span>
                      {#if part.part}<span class="authored tl-part__which">{pick(part.part, i18n.lang)}</span>{/if}
                    </p>
                    <p class="tl-part__meta">
                      <span class="mono tl-tag" data-kind={part.kind}>{t(part.kind === 'novel' ? 'part.novel' : 'part.manga')}</span>
                      <span class="mono tl-part__range">{range(part)}</span>
                      {#if part.note}<span class="authored tl-part__note">{pick(part.note, i18n.lang)}</span>{/if}
                    </p>
                  </div>
                  <a class="mono tl-btn" href={partHref(part)} data-sfx="open">
                    {#if locked}<span class="tl-btn__lock" aria-hidden="true">🔒</span>{/if}{partButton(part)} →
                  </a>
                </li>
              {/each}
            </ul>
          </li>
        {/each}
        <!-- announced, not out: the line runs on past the last book -->
        <li class="tl-era tl-era--next">
          <span class="tl-era__dot" aria-hidden="true"></span>
          <p class="authored tl-era__title">{pick(NEXT.title, i18n.lang)}</p>
          <p class="authored tl-era__source">{pick(NEXT.source, i18n.lang)}</p>
        </li>
      </ol>
    </div>
  </section>

  <footer class="tl-foot spread spread--ink">
    <a class="mono tl-foot__back" href="/#shelf" data-vt="back">← {t('ov.back')}</a>
    <span class="tl-foot__right">
      <a class="mono tl-foot__artist" href="/asu">ASU AZURE ↗</a>
      <span class="mono">© ASU AZURE</span>
    </span>
  </footer>
</div>

<style>
  .tl {
    position: relative;
    z-index: 1;
  }

  /* ---- head (ink) ---- */
  .tl-head {
    position: relative;
    padding: max(clamp(5rem, 13vh, 8rem), calc(var(--chrome-top, 0px) + 3rem)) var(--pad) clamp(2.5rem, 6vh, 4rem);
    border-bottom: 1px solid var(--line);
  }
  .tl-head .bracket--tl,
  .tl-head .bracket--tr {
    top: calc(var(--chrome-top, 2.4rem) + 0.8rem);
  }
  .tl-head__inner {
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    gap: 1.1rem;
  }
  .tl-head__kicker {
    font-size: 0.62rem;
    letter-spacing: 0.16em;
    color: var(--accent);
  }
  .tl-head__title {
    font-size: clamp(1.9rem, 5.5vw, 3.6rem);
    font-weight: 400;
    line-height: 1.2;
    color: var(--fg);
    /* break between phrases, never leave one character on a line (「…時系／列」) */
    word-break: auto-phrase;
    text-wrap: balance;
  }
  .tl-head__note {
    max-width: 38em;
    padding: 0.75rem 1rem;
    border-left: 3px solid #e8a31a;
    background: rgba(232, 163, 26, 0.09);
    font-family: var(--font-display-authored);
    font-size: clamp(0.95rem, 1.6vw, 1.05rem);
    line-height: 1.7;
    color: var(--fg);
  }
  .tl-head__jump {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem 1.6rem;
  }
  .tl-head__jump a {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    color: var(--fg-dim);
    transition: color 0.25s var(--ease);
  }
  .tl-head__jump a:hover,
  .tl-head__jump a:focus-visible {
    color: var(--accent);
  }

  /* ---- sections ---- */
  .tl-sec {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    padding: clamp(4rem, 10vh, 6.5rem) var(--pad) clamp(3.5rem, 9vh, 5.5rem);
  }
  .tl-sec__inner {
    position: relative;
    z-index: 2;
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    gap: clamp(1.2rem, 3vh, 1.8rem);
  }
  .tl-sec__head {
    position: relative;
    display: flex;
    align-items: baseline;
    gap: 1.2rem;
  }
  .tl-sec__head .index-num {
    position: absolute;
    top: -0.55em;
    left: -0.12em;
    z-index: -1;
    font-size: clamp(5rem, 13vw, 9rem);
  }
  .tl-sec__title {
    font-size: clamp(1.7rem, 4.2vw, 2.6rem);
    font-weight: 400;
    white-space: nowrap;
  }
  .tl-sec__rule {
    flex: 1;
    min-width: 2rem;
    height: 1px;
    background: var(--line-strong);
  }
  .tl-sec__lede {
    max-width: 40em;
    font-family: var(--font-display-authored);
    font-size: 0.95rem;
    line-height: 1.7;
    color: var(--fg-dim);
  }
  .tl-status {
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    color: var(--fg-dim);
  }

  /* ---- 刊行順: the books, numbered in the order they came out ---- */
  .tl-books {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 30rem), 1fr));
    gap: clamp(1rem, 3vw, 2rem);
    margin: 0.4rem 0 0;
    padding: 0;
    list-style: none;
  }
  .tl-book {
    display: grid;
    grid-template-columns: clamp(6.5rem, 22vw, 9.5rem) minmax(0, 1fr);
    gap: clamp(1rem, 3vw, 1.6rem);
    align-items: start;
    height: 100%;
    padding: clamp(0.9rem, 2.5vw, 1.2rem);
    border: 1px solid var(--line-strong);
    background: var(--bg-soft);
    color: inherit;
    transition: border-color 0.25s var(--ease);
  }
  .tl-book__cover {
    position: relative;
    display: block;
    overflow: hidden;
    aspect-ratio: 0.72;
    border: 1px solid var(--line);
    background: var(--bg);
  }
  .tl-book__cover img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    object-fit: cover;
  }
  /* a cropped front: cropImgStyle sets the box, so undo the cover fit */
  .tl-book__cover img[style] {
    inset: auto;
    object-fit: fill;
  }
  .tl-book__blank {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 0.6rem;
    text-align: center;
    font-size: 0.9rem;
  }
  .tl-book__text {
    display: grid;
    gap: 0.55rem;
    min-width: 0;
  }
  .tl-book__num {
    font-size: 0.62rem;
    letter-spacing: 0.16em;
    color: var(--accent);
  }
  .tl-book__title {
    font-size: clamp(1.05rem, 2.2vw, 1.3rem);
    line-height: 1.4;
    color: var(--fg);
  }
  .tl-book__release {
    display: grid;
    gap: 0.15rem;
    font-family: var(--font-display-authored);
    font-size: 0.86rem;
    line-height: 1.5;
    color: var(--fg-dim);
  }
  .tl-book__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .tl-tag {
    padding: 0.2em 0.6em;
    border: 1px solid currentColor;
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
    color: var(--fg);
    white-space: nowrap;
  }
  .tl-tag[data-kind='novel'] {
    color: #e8a31a;
  }
  .tl-sec--story .tl-tag[data-kind='novel'] {
    color: #9a6a06; /* amber on cream needs the darker ink */
  }
  .tl-tag--quiet {
    color: var(--fg-dim);
  }
  .tl-book__go {
    margin-top: 0.2rem;
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    color: var(--accent);
  }
  @media (hover: hover) {
    .tl-book:hover {
      border-color: var(--accent);
    }
  }
  .tl-book:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  /* ---- 物語の時系列: three eras on one line ---- */
  .tl-line {
    --dot: 0.95rem;
    --inset: 2.2rem; /* from the line to the text */
    --gap: clamp(2rem, 5vh, 3rem);
    display: grid;
    gap: var(--gap);
    margin: 0.8rem 0 0;
    padding: 0 0 0 calc(var(--inset) + 0.8rem);
    list-style: none;
  }
  .tl-era {
    position: relative;
    display: grid;
    gap: 0.7rem;
  }
  /* each era draws the line down to the next dot: solid through the books,
     dashed amber into what is only announced */
  .tl-era::before {
    content: '';
    position: absolute;
    top: 0.6rem;
    bottom: calc(-1 * var(--gap) - 0.6rem);
    left: calc(-1 * var(--inset));
    width: 2px;
    background: var(--accent);
  }
  /* the last era's books are out: its line stays solid to its end, and only
     the stretch on to the next dot is dashed */
  .tl-era:nth-last-child(2)::before {
    bottom: 0;
  }
  .tl-era:nth-last-child(2)::after {
    content: '';
    position: absolute;
    top: 100%;
    height: calc(var(--gap) + 0.6rem);
    left: calc(-1 * var(--inset));
    width: 2px;
    background: repeating-linear-gradient(180deg, #e8a31a 0 6px, transparent 6px 11px);
  }
  .tl-era--next::before {
    display: none;
  }
  .tl-era__dot {
    position: absolute;
    top: 0.2rem;
    left: calc(-1 * var(--inset) - var(--dot) / 2 + 1px);
    width: var(--dot);
    height: var(--dot);
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--bg);
  }
  .tl-era__num {
    font-size: 0.62rem;
    letter-spacing: 0.16em;
    color: var(--accent);
  }
  .tl-era__title {
    font-family: var(--font-serif-authored);
    font-size: clamp(1.2rem, 2.6vw, 1.55rem);
    font-weight: 500;
    line-height: 1.35;
    color: var(--fg);
  }
  .tl-parts {
    display: grid;
    gap: 0.7rem;
    margin: 0.2rem 0 0;
    padding: 0;
    list-style: none;
  }
  .tl-part {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.7rem 1.4rem;
    padding: 0.95rem 1.1rem;
    border: 1px solid var(--line-strong);
    background: rgba(255, 253, 247, 0.72);
  }
  .tl-part__body {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }
  .tl-part__head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.7rem;
  }
  .tl-part__arc {
    font-size: clamp(1.05rem, 2.2vw, 1.25rem);
    line-height: 1.35;
  }
  .tl-part__which {
    font-size: 0.95rem;
    color: var(--fg);
  }
  .tl-part__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem 0.9rem;
  }
  .tl-part__range {
    font-size: 0.6875rem;
    letter-spacing: 0.1em;
    color: var(--fg-dim);
  }
  .tl-part__note {
    font-size: 0.9rem;
    color: var(--fg-dim);
  }
  .tl-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    padding: 0 1.2em;
    background: var(--accent);
    color: var(--ink-fg);
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    white-space: nowrap;
    transition: background-color 0.25s var(--ease);
  }
  .tl-btn:hover {
    background: #1d33c4;
  }
  .tl-btn__lock {
    margin-right: 0.45em; /* a flex item: a trailing space would collapse */
  }
  .tl-btn:focus-visible {
    outline: 2px solid var(--fg);
    outline-offset: 2px;
  }
  .tl-era--next .tl-era__dot {
    background: var(--bg);
    border: 2px dashed #e8a31a;
  }
  .tl-era--next .tl-era__title {
    font-size: clamp(1.05rem, 2.2vw, 1.25rem);
    color: var(--fg);
  }
  .tl-era__source {
    margin-top: -0.4rem;
    font-size: 0.86rem;
    color: var(--fg-dim);
  }
  @media (max-width: 640px) {
    .tl-line {
      --inset: 1.25rem;
      padding-left: calc(var(--inset) + 0.5rem);
    }
    .tl-part {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.6rem;
    }
    .tl-btn {
      justify-self: stretch;
    }
    .tl-book {
      grid-template-columns: 6.2rem minmax(0, 1fr);
    }
  }

  /* ---- foot ---- */
  .tl-foot {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
    border-top: 1px solid var(--line);
    padding: clamp(1.6rem, 4vh, 2.4rem) var(--pad);
  }
  .tl-foot__back:hover,
  .tl-foot__artist:hover {
    color: var(--accent);
  }
  .tl-foot__right {
    display: flex;
    align-items: baseline;
    gap: 1.6rem;
    flex-wrap: wrap;
  }
</style>
