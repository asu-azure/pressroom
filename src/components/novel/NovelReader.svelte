<script lang="ts">
  /**
   * The novel reader: a work's prose as text (novel_sections), not page images.
   *
   * Vertical (縦書き, Japanese only) is the book: the text is laid out as one
   * vertical-rl strip and turned page by page. A page is the stage's width
   * rounded to whole columns (pagePitch), every block keeps the line pitch, and
   * section titles and illustrations are pushed to the start of a page — so a
   * turn never cuts a column in half and a picture never straddles two pages.
   * Horizontal is a plain scroll, and the only mode for Thai (vertical Thai
   * lies on its side).
   *
   * Locked works: the rows reach anon only through unlock_novel(), with the
   * password this tab unlocked on the overview — else back to the overview.
   */
  import { supabase } from '../../lib/supabase';
  import { publicUrl } from '../../lib/storagePaths';
  import { loadUnlock, clearUnlock } from '../../lib/persistence';
  import { i18n } from '../../lib/i18n.svelte';
  import {
    normalizeSections,
    pickLang,
    placeKey,
    parsePlace,
    progressOf,
    pagePitch,
    pageCount,
    tcyPieces,
    type NovelPlace,
  } from '../../lib/novel';
  import type { NovelSection, Work } from '../../lib/types';

  let { slug }: { slug: string } = $props();

  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let work = $state<Work | null>(null);
  let sections = $state<NovelSection[]>([]);
  let lang = $state<string>('ja');
  let status = $state<'loading' | 'ready' | 'missing' | 'empty'>('loading');

  // --- settings, remembered for every book ---
  const SETTINGS = 'pressroom:novel-settings';
  type Settings = { dir: 'v' | 'h'; size: 0 | 1 | 2; face: 'mincho' | 'gothic' };
  let settings = $state<Settings>({ dir: 'v', size: 1, face: 'mincho' });
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS) ?? 'null');
    if (raw && typeof raw === 'object') {
      settings = {
        dir: raw.dir === 'h' ? 'h' : 'v',
        size: [0, 1, 2].includes(raw.size) ? raw.size : 1,
        face: raw.face === 'gothic' ? 'gothic' : 'mincho',
      };
    }
  } catch {
    /* private mode */
  }
  function patch(p: Partial<Settings>) {
    const keep = currentPlace();
    settings = { ...settings, ...p };
    try {
      localStorage.setItem(SETTINGS, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
    pending = keep;
  }

  const vertical = $derived(settings.dir === 'v' && lang === 'ja');
  const FONT = [16, 18, 21];
  const fs = $derived(FONT[settings.size]);
  const lh = $derived(Math.round(fs * (vertical ? 1.85 : 1.9))); // whole pixels: the pitch must not drift

  // --- load ---
  $effect(() => {
    void load();
  });

  async function load() {
    const { data: w } = await supabase.from('works').select('*').eq('slug', slug).maybeSingle();
    if (!w) {
      status = 'missing';
      return;
    }
    work = w as Work;
    document.title = `${work.title} — Pressroom`;
    const langs = work.novel_langs ?? [];
    const asked = new URLSearchParams(location.search).get('lang');
    const picked = pickLang(langs, asked, i18n.lang);
    if (!picked) {
      status = 'empty';
      return;
    }
    lang = picked;
    let { data: rows } = await supabase
      .from('novel_sections')
      .select('*')
      .eq('work_id', work.id)
      .eq('lang', lang)
      .order('sort_key');
    if (!rows?.length && work.read_locked) {
      const key = loadUnlock(work.id);
      const { data } = key
        ? await supabase.rpc('unlock_novel', { p_work_id: work.id, p_password: key, p_lang: lang })
        : { data: null };
      if (!data?.length) {
        if (key) clearUnlock(work.id); // password changed since
        location.replace(`/w/${slug}`);
        return;
      }
      rows = data;
    }
    sections = normalizeSections(rows ?? []);
    if (!sections.length) {
      status = 'empty';
      return;
    }
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(placeKey(work.id, lang));
    } catch {
      /* ignore */
    }
    pending = parsePlace(saved, sections) ?? { section: 0, block: 0 };
    status = 'ready';
  }

  // --- layout (vertical) ---
  let stage = $state<HTMLElement | null>(null);
  let strip = $state<HTMLElement | null>(null);
  let step = $state(1); // page width, whole columns
  let pages = $state(1);
  let page = $state(0);
  let pending: NovelPlace | null = null; // a place to land on after the next layout

  /**
   * Push titles and pictures to the start of a page. The margin is the physical RIGHT
   * one (block-start of the vertical-rl strip): a figure lays itself out horizontal-tb,
   * where margin-block-start would mean its top.
   */
  function alignPageStarts() {
    if (!strip) return;
    const marks = [...strip.querySelectorAll<HTMLElement>('[data-pagestart]')];
    for (const el of marks) el.style.marginRight = '0px';
    const right = strip.getBoundingClientRect().right;
    for (const el of marks) {
      const dist = Math.round(right - el.getBoundingClientRect().right); // from the strip's right edge
      const rem = dist % step;
      // a pixel or two past a page edge is sub-pixel rounding, not a column: padding it
      // would push the title a whole page on and leave that page blank
      const pad = rem <= 2 ? 0 : step - rem;
      if (pad && dist > 0) el.style.marginRight = `${pad}px`;
    }
  }

  function layout() {
    if (!vertical || !stage || !strip) return;
    // with a mouse the ‹ › buttons sit in the side margins, so keep them clear of the text
    const side = Math.max(Math.round(fs * 1.5), matchMedia('(hover: hover)').matches ? 64 : 0);
    const avail = stage.parentElement!.clientWidth - 2 * side;
    step = pagePitch(avail, lh);
    stage.style.width = `${step}px`;
    // figures are var(--step) wide; Svelte writes the style attribute only after this
    // function returns, so set it now or the first measure sees the previous width
    (stage.closest('.nv') as HTMLElement | null)?.style.setProperty('--step', `${step}px`);
    alignPageStarts();
    pages = pageCount(strip.scrollWidth, step);
    const target = pending ?? currentPlace();
    pending = null;
    if (target) page = Math.min(pages - 1, pageOf(target));
  }

  function blockEl(p: NovelPlace): HTMLElement | null {
    return strip?.querySelector<HTMLElement>(`[data-s="${p.section}"][data-b="${p.block}"]`) ?? null;
  }

  function pageOf(p: NovelPlace): number {
    const el = blockEl(p);
    if (!el || !strip) return 0;
    const dist = strip.getBoundingClientRect().right - el.getBoundingClientRect().right;
    return Math.max(0, Math.floor((dist + 1) / step));
  }

  /**
   * Where the reader is. Vertical: the first block that STARTS on this page — a paragraph
   * carried over from the page before would bring a reload back one page early — or,
   * when one paragraph fills the whole page, that paragraph.
   */
  function currentPlace(): NovelPlace | null {
    if (status !== 'ready') return null;
    if (vertical && strip) {
      const right = strip.getBoundingClientRect().right;
      const from = page * step;
      let spanning: NovelPlace | null = null;
      for (const el of strip.querySelectorAll<HTMLElement>('[data-b]')) {
        const r = el.getBoundingClientRect();
        if (right - r.left <= from + 1) continue; // ends before this page
        const p = { section: Number(el.dataset.s), block: Number(el.dataset.b) };
        const start = right - r.right;
        if (start < from - 2) {
          spanning ??= p;
          continue;
        }
        return start < from + step - 2 ? p : (spanning ?? p);
      }
      return spanning;
    }
    if (scroller) {
      const top = scroller.getBoundingClientRect().top;
      for (const el of scroller.querySelectorAll<HTMLElement>('[data-b]')) {
        if (el.getBoundingClientRect().bottom > top + 4) return { section: Number(el.dataset.s), block: Number(el.dataset.b) };
      }
    }
    return null;
  }

  let place = $state<NovelPlace>({ section: 0, block: 0 });
  function remember() {
    const p = currentPlace();
    if (!p || !work) return;
    place = p;
    try {
      localStorage.setItem(placeKey(work.id, lang), JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }

  // re-lay out whenever the text, its size, the mode or the window changes
  $effect(() => {
    void [status, vertical, fs, lh, settings.face, sections];
    if (status !== 'ready') return;
    requestAnimationFrame(() => {
      if (vertical) layout();
      else if (pending) {
        blockEl(pending)?.scrollIntoView({ block: 'start' });
        pending = null;
      }
      remember();
    });
  });
  $effect(() => {
    let t = 0;
    const onResize = () => {
      clearTimeout(t);
      const keep = currentPlace();
      t = window.setTimeout(() => {
        pending = keep;
        if (vertical) layout();
      }, 120);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  function go(to: number) {
    const next = Math.max(0, Math.min(pages - 1, to));
    if (next === page) return;
    page = next;
    requestAnimationFrame(remember);
  }

  // --- input: tap thirds, keys, swipe (vertical) ---
  let chrome = $state(true);
  let hideT = 0;
  function poke() {
    chrome = true;
    clearTimeout(hideT);
    hideT = window.setTimeout(() => (chrome = false), 3200);
  }
  $effect(() => {
    if (status === 'ready') poke();
  });

  function onTap(e: MouseEvent) {
    if (!vertical || panel) return;
    const x = e.clientX / window.innerWidth;
    if (x < 0.33) go(page + 1); // right-to-left book: the left edge turns forward
    else if (x > 0.67) go(page - 1);
    else (chrome ? (chrome = false) : poke());
  }
  function onKey(e: KeyboardEvent) {
    if (status !== 'ready' || !vertical || (e.target as HTMLElement)?.closest('input, select, textarea')) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      go(page + 1);
    } else if (e.key === 'ArrowRight' || e.key === 'PageUp') {
      e.preventDefault();
      go(page - 1);
    } else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(pages - 1);
  }
  let touchX = 0;
  let touchY = 0;
  function onTouchStart(e: TouchEvent) {
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }
  function onTouchEnd(e: TouchEvent) {
    if (!vertical) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx > 0 ? page + 1 : page - 1); // swipe right = forward
  }

  // --- horizontal scroll ---
  let scroller = $state<HTMLElement | null>(null);
  let scrollT = 0;
  function onScroll() {
    clearTimeout(scrollT);
    scrollT = window.setTimeout(remember, 200);
  }

  // --- panels ---
  let panel = $state<'toc' | 'settings' | null>(null);
  function jumpTo(si: number) {
    panel = null;
    pending = { section: si, block: 0 };
    if (vertical) layout();
    else {
      blockEl(pending)?.scrollIntoView({ block: 'start' });
      pending = null;
    }
    requestAnimationFrame(remember);
  }

  const percent = $derived(
    status === 'ready'
      ? Math.round(
          (vertical ? (pages > 1 ? page / (pages - 1) : 1) : progressOf(sections, place)) * 100,
        )
      : 0,
  );
  const sectionNow = $derived(sections[place.section]?.title ?? '');
</script>

<svelte:window onkeydown={onKey} />

{#if status === 'loading'}
  <div class="nv-status"><p class="mono">{i18n.t('rd.loading')}</p></div>
{:else if status === 'missing'}
  <div class="nv-status">
    <p class="mono">{i18n.t('rd.missing')}</p>
    <a class="mono" href="/">← {i18n.t('nf.back')}</a>
  </div>
{:else if status === 'empty'}
  <div class="nv-status">
    <p class="mono">{i18n.t('nv.none')}</p>
    <a class="mono" href={`/w/${slug}`}>← {i18n.t('rd.overview')}</a>
  </div>
{:else if work}
  <div
    class="nv"
    class:is-v={vertical}
    class:is-h={!vertical}
    class:is-gothic={settings.face === 'gothic'}
    class:is-chrome={chrome || panel}
    lang={lang}
    style={`--fs:${fs}px;--lh:${lh}px;--step:${step}px`}
  >
    <header class="nv-bar mono">
      <a class="nv-bar__back" href={`/w/${slug}`} data-vt="back">← {i18n.t('rd.overview')}</a>
      <span class="nv-bar__title authored">{work.title}</span>
      <span class="nv-bar__tools">
        <button type="button" onclick={() => (panel = panel === 'toc' ? null : 'toc')} aria-expanded={panel === 'toc'}>{i18n.t('rd.toc')}</button>
        <button type="button" onclick={() => (panel = panel === 'settings' ? null : 'settings')} aria-expanded={panel === 'settings'} aria-label={i18n.t('rd.settings')}>Aa</button>
      </span>
    </header>

    {#if vertical}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="nv-room" onclick={onTap} ontouchstart={onTouchStart} ontouchend={onTouchEnd}>
        <div class="nv-stage" bind:this={stage}>
          <div
            class="nv-strip"
            bind:this={strip}
            style={`transform: translateX(${page * step}px)`}
            class:is-still={reduced}
          >
            {@render text()}
          </div>
        </div>
        <button type="button" class="nv-turn nv-turn--next" aria-label={i18n.t('nv.next')} onclick={(e) => { e.stopPropagation(); go(page + 1); }} disabled={page >= pages - 1}>‹</button>
        <button type="button" class="nv-turn nv-turn--prev" aria-label={i18n.t('nv.prev')} onclick={(e) => { e.stopPropagation(); go(page - 1); }} disabled={page <= 0}>›</button>
      </div>
    {:else}
      <div class="nv-scroll" bind:this={scroller} onscroll={onScroll}>
        <div class="nv-column">{@render text()}</div>
      </div>
    {/if}

    <footer class="nv-foot mono">
      <span class="nv-foot__where authored">{sectionNow}</span>
      <span class="nv-foot__pct">{vertical ? `${page + 1} / ${pages}` : `${percent}%`}</span>
      <span class="nv-foot__bar" aria-hidden="true"><span style={`width:${percent}%`}></span></span>
    </footer>

    {#if panel === 'toc'}
      <div class="nv-panel" role="dialog" aria-label={i18n.t('rd.toc')}>
        <ol>
          {#each sections as s, si (s.id)}
            <li><button type="button" class="authored" class:is-on={si === place.section} onclick={() => jumpTo(si)}>{s.title || `${si + 1}`}</button></li>
          {/each}
        </ol>
      </div>
    {:else if panel === 'settings'}
      <div class="nv-panel mono" role="dialog" aria-label={i18n.t('rd.settings')}>
        {#if lang === 'ja'}
          <div class="nv-opt">
            <button type="button" class:is-on={settings.dir === 'v'} onclick={() => patch({ dir: 'v' })}>{i18n.t('nv.vertical')}</button>
            <button type="button" class:is-on={settings.dir === 'h'} onclick={() => patch({ dir: 'h' })}>{i18n.t('nv.horizontal')}</button>
          </div>
        {/if}
        <div class="nv-opt">
          <span>{i18n.t('nv.size')}</span>
          {#each [0, 1, 2] as n (n)}
            <button type="button" class:is-on={settings.size === n} onclick={() => patch({ size: n as 0 | 1 | 2 })} style={`font-size:${0.7 + n * 0.12}rem`}>A</button>
          {/each}
        </div>
        {#if lang !== 'th'}
        <div class="nv-opt">
          <span>{i18n.t('nv.face')}</span>
          <button type="button" class:is-on={settings.face === 'mincho'} onclick={() => patch({ face: 'mincho' })}>{i18n.t('nv.mincho')}</button>
          <button type="button" class:is-on={settings.face === 'gothic'} onclick={() => patch({ face: 'gothic' })}>{i18n.t('nv.gothic')}</button>
        </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#snippet text()}
  {#each sections as s, si (s.id)}
    <section class="nv-sec">
      {#if s.title}
        <h2 class="nv-title" data-s={si} data-b={-1} data-pagestart={vertical ? '' : undefined}>{s.title}</h2>
      {/if}
      {#each s.body as b, bi (bi)}
        {#if b.t === 'p'}
          <p class="nv-p" class:is-center={b.align === 'center'} class:is-end={b.align === 'end'} class:is-bold={b.bold} data-s={si} data-b={bi}>
            {#if vertical}{#each tcyPieces(b.text) as piece, pi (pi)}{#if piece.tcy}<span class="nv-tcy">{piece.t}</span>{:else}{piece.t}{/if}{/each}{:else}{b.text}{/if}
          </p>
        {:else if b.t === 'gap'}
          <p class="nv-gap" data-s={si} data-b={bi} aria-hidden="true">&nbsp;</p>
        {:else}
          <figure class="nv-fig" data-s={si} data-b={bi} data-pagestart={vertical ? '' : undefined}>
            <img src={publicUrl(b.path)} alt={b.alt ?? ''} width={b.w} height={b.h} loading="lazy" decoding="async" />
          </figure>
        {/if}
      {/each}
    </section>
  {/each}
  <p class="nv-end mono" data-pagestart={vertical ? '' : undefined}>{i18n.t('nv.end')}</p>
{/snippet}

<style>
  .nv-status {
    min-height: 100svh;
    display: grid;
    place-content: center;
    gap: 1rem;
    text-align: center;
    background: #f4efe3;
    color: #2a2620;
  }
  .nv {
    --paper: #f4efe3;
    --ink: #24211c;
    --dim: #8b8475;
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: auto 1fr auto;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-typeset, 'Yu Mincho', 'Hiragino Mincho ProN', 'Noto Serif CJK JP', serif);
    font-size: var(--fs);
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }
  .nv[lang='en'] {
    font-family: var(--font-serif-authored);
  }
  /* Thai prose is one looped face (styles/novel-fonts.css); the 明朝/ゴシック choice doesn't apply */
  .nv[lang='th'] {
    font-family: 'Noto Serif Thai', var(--font-serif-authored);
  }
  .nv.is-gothic:not([lang='th']) {
    font-family: var(--font-display-authored);
  }
  .nv-bar,
  .nv-foot {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: calc(0.6rem + env(safe-area-inset-top)) clamp(0.8rem, 3vw, 1.6rem) 0.6rem;
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    color: var(--dim);
    transition: opacity 0.3s var(--ease);
    z-index: 2;
  }
  .nv-foot {
    padding: 0.5rem clamp(0.8rem, 3vw, 1.6rem) calc(0.6rem + env(safe-area-inset-bottom));
    position: relative;
  }
  .nv.is-v:not(.is-chrome) .nv-bar,
  .nv.is-v:not(.is-chrome) .nv-foot {
    opacity: 0;
  }
  .nv-bar a,
  .nv-bar button,
  .nv-panel button {
    color: inherit;
    background: none;
    border: 0;
    font: inherit;
    letter-spacing: inherit;
    cursor: pointer;
    padding: 0.35rem 0.5rem;
  }
  .nv-bar a:hover,
  .nv-bar button:hover {
    color: var(--ink);
  }
  .nv-bar__title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
    font-family: var(--font-serif-authored);
    font-size: 0.8rem;
    letter-spacing: 0;
    color: var(--ink);
  }
  .nv-bar__tools {
    display: flex;
    gap: 0.2rem;
  }
  .nv-foot__where {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-serif-authored);
    letter-spacing: 0;
  }
  .nv-foot__bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    background: rgba(0, 0, 0, 0.06);
  }
  .nv-foot__bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }

  /* ---- vertical: one vertical-rl strip, turned a page at a time ---- */
  .nv-room {
    position: relative;
    overflow: hidden;
    display: grid;
    place-items: center;
    padding: 0.4rem 0 0.8rem;
    touch-action: pan-y;
    user-select: none;
  }
  .nv-stage {
    position: relative;
    height: 100%;
    overflow: hidden;
  }
  .nv-strip {
    position: absolute;
    top: 0;
    right: 0;
    height: 100%;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    line-height: var(--lh);
    transition: transform 0.32s var(--ease);
    will-change: transform;
  }
  .nv-strip.is-still {
    transition: none;
  }
  .nv-turn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.12);
    background: rgba(255, 255, 255, 0.5);
    color: var(--dim);
    font-size: 1.2rem;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.25s var(--ease);
  }
  .nv.is-chrome .nv-turn:not(:disabled) {
    opacity: 1;
  }
  .nv-turn--next {
    left: clamp(0.3rem, 1.5vw, 1rem);
  }
  .nv-turn--prev {
    right: clamp(0.3rem, 1.5vw, 1rem);
  }
  @media (hover: none) {
    .nv-turn {
      display: none; /* thirds and swipes turn pages on touch */
    }
  }

  /* every block keeps the line pitch, so columns stay whole across a turn */
  .nv-p,
  .nv-gap {
    margin: 0;
    text-indent: 1em;
    hanging-punctuation: allow-end;
    line-break: strict;
  }
  .nv-p.is-center {
    text-indent: 0;
    text-align: center;
  }
  .nv-p.is-end {
    text-indent: 0;
    text-align: end;
  }
  .nv-p.is-bold {
    font-weight: 700;
  }
  .nv-gap {
    text-indent: 0;
  }
  .nv-title {
    margin: 0;
    margin-block-end: var(--lh); /* one empty column after the title in 縦書き */
    font-size: 1.35em;
    line-height: calc(2 * var(--lh));
    font-weight: 600;
    text-indent: 2em;
  }
  .nv-tcy {
    text-combine-upright: all;
  }
  .nv-fig {
    margin: 0;
    display: grid;
    place-items: center;
  }
  .nv.is-v .nv-fig {
    /* a whole page. Laid out horizontally inside, so the picture's max-width/height
       resolve against a definite box — in the vertical grid it overflowed the page */
    writing-mode: horizontal-tb;
    width: var(--step);
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .nv-fig img {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
  }
  .nv-end {
    margin: 0;
    color: var(--dim);
    font-size: 0.8em;
    letter-spacing: 0.3em;
    text-align: center;
    text-indent: 0;
  }

  /* ---- horizontal: a plain scroll ---- */
  .nv-scroll {
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .nv-column {
    max-width: 38em;
    margin: 0 auto;
    padding: clamp(1.5rem, 5vh, 3rem) clamp(1rem, 5vw, 2rem) 6rem;
    line-height: var(--lh);
  }
  .nv.is-h .nv-title {
    text-indent: 0;
    margin: 2.5em 0 1.2em;
    line-height: 1.5;
  }
  .nv.is-h .nv-sec:first-child .nv-title {
    margin-top: 0;
  }
  .nv.is-h .nv-fig {
    margin: 2em 0;
  }
  .nv.is-h .nv-end {
    margin-top: 4em;
  }
  .nv[lang='th'] .nv-p,
  .nv[lang='en'] .nv-p {
    text-indent: 2em;
  }
  .nv[lang='th'] .nv-p.is-center {
    text-indent: 0;
  }

  /* ---- panels ---- */
  .nv-panel {
    position: absolute;
    top: calc(2.8rem + env(safe-area-inset-top));
    right: clamp(0.8rem, 3vw, 1.6rem);
    z-index: 3;
    min-width: min(18rem, calc(100vw - 2rem));
    max-height: 70svh;
    overflow-y: auto;
    padding: 0.8rem;
    background: #fffdf7;
    border: 1px solid rgba(0, 0, 0, 0.1);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
    font-size: 0.72rem;
  }
  .nv-panel ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.1rem;
  }
  .nv-panel ol button {
    width: 100%;
    text-align: left;
    font-family: var(--font-serif-authored);
    font-size: 0.9rem;
    letter-spacing: 0;
  }
  .nv-panel button.is-on {
    color: var(--accent);
  }
  .nv-opt {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0;
    color: var(--dim);
  }
  .nv-opt span {
    min-width: 6.5em;
  }
  .nv-opt button {
    border: 1px solid rgba(0, 0, 0, 0.12);
    color: var(--ink);
  }
  .nv-opt button.is-on {
    border-color: var(--accent);
  }
</style>
