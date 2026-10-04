<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { supabase } from '../../lib/supabase';
  import { toPageRec } from '../../lib/storagePaths';
  import { sortedChapters } from '../../lib/chapterOrder';
  import { loadProgress, loadUnlock, clearUnlock } from '../../lib/persistence';
  import { decode, assemble } from '../../scripts/text';
  import { converge } from '../../scripts/mv';
  import { stamp, stampStatic } from '../../data/showcase';
  import { toRichHtml } from '../../lib/richtext';
  import { tidyForeword } from '../../lib/foreword';
  import { frontOnly, cropImgStyle } from '../../lib/coverCrop';
  import { seriesRun } from '../../lib/series';
  import { bookInfo } from '../../lib/bookInfo';
  import { bookParts, partLabel, partNote } from '../../lib/bookParts';
  import { shareLink } from '../../lib/share';
  import { i18n, type DictKey } from '../../lib/i18n.svelte';
  import LangBar from '../library/LangBar.svelte';
  import CastFile from './CastFile.svelte';
  import LockGate from './LockGate.svelte';
  import BookmarkNote from '../reader/BookmarkNote.svelte';
  import { hasProfile } from '../../lib/types';
  import type { Work, PageRec, Chapter, PageRow } from '../../lib/types';

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
      .map((ch) => {
        const pages = ordered.filter((p) => p.chapterId === ch.id);
        return {
          ch,
          pages,
          cover:
            ordered.find((p) => p.id === ch.cover_page_id) ??
            pages.find((p) => !p.isBlank) ??
            null,
          // Where "read this chapter" lands: a chapter can open on a blank
          // spacer leaf, and dropping the reader there shows an empty page.
          firstReadable: pages.find((p) => !p.isBlank) ?? pages[0] ?? null,
        };
      })
      .filter((c) => c.pages.length > 0),
  );
  // The hero shows the FRONT of the wraparound, like the shelf and the reader.
  // No `inner` page on purpose: a locked book gets its pages only on unlock,
  // and the hero would re-trim and jump at that moment.
  const heroCover = $derived(
    cover && work && cover.id === work.cover_page_id ? frontOnly(cover, work.cover_crop) : cover,
  );
  // Render-time tidy (lib/foreword.ts): pasted subset fonts, empty lines, a
  // duplicate title h1; numbered run-ins become the section nav.
  const fore = $derived(
    work ? tidyForeword(toRichHtml(work.foreword), work.title) : { html: '', sections: [] },
  );
  const forewordHtml = $derived(fore.html);
  const info = $derived(work ? bookInfo(work, i18n.lang, (k) => i18n.t(k as DictKey)) : []);
  const warnings = $derived((work?.content_warnings ?? []).map((w) => w.trim()).filter(Boolean));
  // the novel reader opens in the reader's language when the text exists in it
  const novelHref = $derived.by(() => {
    const langs = work?.novel_langs ?? [];
    if (!langs.length) return null;
    const lang = langs.includes(i18n.lang) ? i18n.lang : langs[0];
    return `/w/${slug}/novel?lang=${lang}`;
  });
  const statusKey = $derived(
    work ? (`status.${work.status}` as const) : ('status.oneshot' as const),
  );

  // --- Series: the other published books sharing series_title (book-info.sql).
  //     Loaded after the page is up and never allowed to break it. ---
  interface SeriesCard {
    id: string;
    slug: string;
    title: string;
    series_order: number | null;
    series_kind: 'main' | 'side' | null;
    series_label: string | null;
    read_locked: boolean;
    cover: PageRec | null;
  }
  let seriesCards = $state<SeriesCard[]>([]);
  const series = $derived(work ? seriesRun(seriesCards, work.id) : { list: [], prev: null, next: null });

  async function loadSeries(w: Work) {
    if (!w.series_title) return;
    try {
      const { data: rows } = await supabase
        .from('works')
        .select('id,slug,title,series_order,series_kind,series_label,read_locked,cover_page_id,cover_crop')
        .eq('published', true)
        .eq('series_title', w.series_title);
      if (!rows?.length) return;
      const coverIds = rows.map((r) => r.cover_page_id).filter(Boolean) as string[];
      // RLS lets anyone read a locked book's cover row (read-lock.sql)
      const { data: covers } = coverIds.length
        ? await supabase.from('pages').select('*').in('id', coverIds)
        : { data: [] };
      const byId = new Map((covers ?? []).map((p) => [p.id, toPageRec(p as PageRow)]));
      seriesCards = rows.map((r) => {
        const c = r.cover_page_id ? byId.get(r.cover_page_id) : undefined;
        return {
          id: r.id,
          slug: r.slug,
          title: r.title,
          series_order: r.series_order === null ? null : Number(r.series_order),
          series_kind: r.series_kind,
          series_label: r.series_label,
          read_locked: r.read_locked,
          cover: c ? frontOnly(c, r.cover_crop) : null,
        };
      });
    } catch {
      seriesCards = []; // the page stands without its series
    }
  }

  // --- Share this book (the overview URL, without ?c=) ---
  let shareNote = $state('');
  let shareReset = 0;
  async function share() {
    if (!work) return;
    const result = await shareLink({ title: work.title, text: work.description || undefined, url: `${location.origin}/w/${slug}` });
    if (result === 'copied' || result === 'failed') {
      shareNote = i18n.t(result === 'copied' ? 'ov.shareCopied' : 'ov.shareFail');
      clearTimeout(shareReset);
      shareReset = window.setTimeout(() => (shareNote = ''), 1600);
    }
  }

  /** Skip the spoilers: straight past the synopsis. */
  function skipSynopsis(e: Event) {
    e.preventDefault();
    const target = document.getElementById('ov-after');
    target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    target?.focus({ preventScroll: true });
  }

  // --- Reading lock: RLS hides page rows of locked works (cover excepted).
  //     `unlocked` flips when the session key works or the author is signed in
  //     (their select already returned everything). ---
  let unlocked = $state(false);
  let lockOpen = $state(false);
  // where to go once unlocked — a function when the target needs the unlocked pages
  let pendingHref = $state<string | (() => string | null) | null>(null);
  const locked = $derived(Boolean(work?.read_locked) && !unlocked);

  // この本の構成: a book in parts (vol. 2 — a novel, then a manga) says so before
  // its contents. Chapters are public even while the book is locked; the page
  // ranges and landing pages wait for the pages (lib/bookParts.ts).
  const parts = $derived(work ? bookParts(chapters, locked ? null : ordered) : []);
  const showParts = $derived(parts.length >= 2);
  /** Where a part's button goes: the novel reader for a novel part with text,
      else the page reader at the part's first page (?p=, like the thumbnails). */
  function partHref(part: (typeof parts)[number]): string | null {
    if (part.kind === 'novel' && novelHref) return novelHref;
    return part.startId ? `/w/${slug}/read?p=${encodeURIComponent(part.startId)}` : null;
  }
  function openPart(part: (typeof parts)[number], e: Event) {
    if (!locked) return;
    // a locked book's landing page is known only once the pages arrive
    openLock(() => partHref(bookParts(chapters, ordered).find((p) => p.id === part.id) ?? part), e);
  }

  function openLock(href: string | (() => string | null) | null, e?: Event) {
    e?.preventDefault();
    pendingHref = href;
    lockOpen = true;
  }
  function onUnlocked(rows: PageRow[]) {
    pages = rows.map(toPageRec);
    unlocked = true;
    lockOpen = false;
    const href = typeof pendingHref === 'function' ? pendingHref() : pendingHref;
    if (href) location.href = href;
  }

  // --- Cast page: profiled characters only, in the author's array order ---
  const castList = $derived((work?.characters ?? []).filter(hasProfile));
  let castOpen = $state<number | null>(null);
  let castPushed = false; // whether the open overlay pushed a history entry
  const pad2 = (n: number) => String(n).padStart(2, '0');

  function castUrl(id: string | null): string {
    const url = new URL(location.href);
    if (id) url.searchParams.set('c', id);
    else url.searchParams.delete('c');
    return url.toString();
  }
  function openCast(i: number) {
    castOpen = i;
    castPushed = true;
    history.pushState({ castFile: true }, '', castUrl(castList[i].id));
  }
  function navCast(i: number) {
    castOpen = i;
    history.replaceState(history.state, '', castUrl(castList[i].id));
  }
  function closeCast() {
    if (castPushed) {
      castPushed = false;
      history.back(); // popstate clears the ?c= URL and castOpen below
    } else {
      history.replaceState(history.state, '', castUrl(null));
    }
    castOpen = null;
  }
  $effect(() => {
    const onPop = () => {
      castOpen = null;
      castPushed = false;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });

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
    // Locked work: >1 visible row means the author's session (RLS let it
    // through); otherwise try this tab's remembered password.
    if (work.read_locked) {
      if (pages.length > 1) {
        unlocked = true;
      } else {
        const key = loadUnlock(work.id);
        if (key) {
          const { data } = await supabase.rpc('unlock_pages', {
            p_work_id: work.id,
            p_password: key,
          });
          if (data?.length) {
            pages = (data as PageRow[]).map(toPageRec);
            unlocked = true;
          } else {
            clearUnlock(work.id); // password changed since — re-ask
          }
        }
      }
    }
    continueAt = loadProgress(work.id);
    status = 'ready';
    void loadSeries(work);
    // Deep link: /w/slug?c=charId opens that character's file directly.
    const requested = new URLSearchParams(location.search).get('c');
    if (requested) {
      const idx = castList.findIndex((c) => c.id === requested);
      if (idx >= 0) castOpen = idx; // not pushed — closing just clears ?c=
    }
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
    decode(node, text, 450);
  }

  /** Book title gathers on load. decode() can't be used — the titles are
      Japanese and its scramble alphabet is Latin only. */
  const titleIn = (node: HTMLElement) => assemble(node, { delay: 0.25 });

  /** Section headings gather as they scroll in. Reversible per the house rule:
      the tween is re-run on each re-entry rather than played once. */
  function headingIn(node: HTMLElement) {
    if (reduced) return;
    const original = node.textContent ?? '';
    const trigger = ScrollTrigger.create({
      trigger: node,
      start: 'top 88%',
      onEnter: () => assemble(node),
      onEnterBack: () => {
        node.textContent = original;
        assemble(node);
      },
      onLeaveBack: () => {
        node.textContent = original;
      },
    });
    return { destroy: () => trigger.kill() };
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
  <a class="ov-backchip mono" href="/">← {i18n.t('rd.library')}</a>
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
    <div class="bracket bracket--tl" aria-hidden="true"></div>
    <div class="bracket bracket--tr" aria-hidden="true"></div>
    <div class="ov-hero__inner">
      {#if heroCover}
        <figure
          class="ov-hero__cover"
          class:is-cropped={Boolean(heroCover.crop)}
          style={`aspect-ratio: ${heroCover.width} / ${heroCover.height}`}
          use:reveal={{ y: 34 }}
        >
          {#if heroCover.crop}
            <!-- the front is ~half the wraparound's width: the full-size image
                 keeps it sharp at the hero's size -->
            <img src={heroCover.fullUrl} alt={`${work.title} — cover`} style={cropImgStyle(heroCover.crop)} />
          {:else}
            <img src={heroCover.medUrl} alt={`${work.title} — cover`} />
          {/if}
          <!-- RLS returns only the cover row for a locked work, so realPageCount
               would read "1P" — same guard as the CONTENTS header below. -->
          <figcaption class="mono ov-hero__coverTag">
            {work.direction.toUpperCase()}{locked ? '' : ` · ${realPageCount}P`}
          </figcaption>
        </figure>
      {/if}
      <div class="ov-hero__text">
        <p class="mono ov-hero__kicker" use:decodeIn>ASU AZURE · PRESSROOM</p>
        <h1 class="ov-hero__title serif authored" use:titleIn>{work.title}</h1>
        <p class="mono ov-hero__meta" use:reveal={{ delay: 0.08 }}>
          {i18n.t(statusKey)}
          {#if work.series_kind}· {i18n.t(`series.${work.series_kind}`)}{/if}
          {#if work.tags.length}· <span class="authored">{work.tags.join(' / ')}</span>{/if}
        </p>
        {#if info.length}
          <!-- 奥付: what the book is before anyone opens it — a Japanese visitor
               learns here that the book is in Thai, and whether it is translated -->
          <dl class="ov-info" use:reveal={{ delay: 0.11 }}>
            {#each info as item (item.key)}
              <div class="ov-info__item">
                <dt class="mono">{item.label}</dt>
                <dd class="ov-info__value">{item.value}</dd>
              </div>
            {/each}
          </dl>
        {/if}
        {#if work.description}
          <p class="ov-hero__desc serif authored" use:reveal={{ delay: 0.14 }}>{work.description}</p>
        {/if}
        {#if warnings.length}
          <div class="ov-cw" role="note" use:reveal={{ delay: 0.17 }}>
            <span class="mono ov-cw__label"><span aria-hidden="true">⚠</span> {i18n.t('ov.cw')}</span>
            <p class="ov-cw__items">{warnings.join('・')}</p>
          </div>
        {/if}
        <div class="ov-hero__actions" use:reveal={{ delay: 0.2 }}>
          <a
            class="ov-btn mono"
            data-sfx="open"
            href={continueAt ? continueHref : readHref}
            onclick={(e) => locked && openLock(continueAt ? continueHref : readHref, e)}
          >
            {#if locked}<span aria-hidden="true">🔒 </span>{/if}
            {continueAt ? i18n.t('ov.continue') : i18n.t('ov.start')} →
          </a>
          {#if continueAt}
            <a
              class="ov-btn ov-btn--ghost mono"
              data-sfx="open"
              href={readHref}
              onclick={(e) => locked && openLock(readHref, e)}
            >
              {i18n.t('ov.start')}
            </a>
          {/if}
          {#if novelHref}
            <!-- the prose reads as text in its own reader (supabase/novel.sql);
                 the button above still opens the pages -->
            <a
              class="ov-btn ov-btn--ghost mono"
              data-sfx="open"
              href={novelHref}
              onclick={(e) => locked && openLock(novelHref, e)}
            >
              {#if locked}<span aria-hidden="true">🔒 </span>{/if}{i18n.t('nv.read')} →
            </a>
          {/if}
          <button type="button" class="ov-btn ov-btn--ghost mono" onclick={share}>
            {shareNote || i18n.t('ov.share')}
          </button>
          <span class="ov-live" aria-live="polite">{shareNote}</span>
        </div>
        <!-- the place and the ここすき live in this browser only — say so where
             「続きから読む」 promises them -->
        <div class="ov-marknote" use:reveal={{ delay: 0.22 }}>
          <BookmarkNote />
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
      <span class="ov-scrollcue__label">{i18n.t(showParts ? 'ov.parts' : 'ov.contents')}</span>
      <span class="ov-scrollcue__line" aria-hidden="true"></span>
      <span class="ov-scrollcue__chev" aria-hidden="true"></span>
    </button>
  </section>

  <!-- ACT II: contents — page & chapter overview, straight after the cover (ink) -->
  <section class="ov-toc spread spread--ink" class:is-locked={locked} id="ov-more">
    <div class="ov-toc__inner">
      {#if showParts}
        <!-- この本の構成: one book in parts, each with its kind, pages, language
             and its own way in — vol. 2's novel and manga read as unrelated before -->
        <div class="ov-parts" use:reveal>
          <header class="ov-toc__head">
            <span class="index-num" aria-hidden="true">構</span>
            <h2 class="serif ov-toc__title" use:headingIn use:converge>{i18n.t('ov.parts')}</h2>
            <span class="ov-toc__rule" aria-hidden="true"></span>
          </header>
          <ol class="ov-parts__list">
            {#each parts as part, pi (part.id)}
              {@const href = partHref(part)}
              {@const note = partNote(part, work, i18n.lang, (k) => i18n.t(k as DictKey))}
              <li class="ov-part">
                <span class="mono ov-part__num">{partLabel(pi + 1, i18n.lang)}</span>
                <div class="ov-part__body">
                  <p class="ov-part__head">
                    <span class="serif authored ov-part__title">{part.name}</span>
                    {#if part.kind}
                      <span class="mono ov-part__kind" data-kind={part.kind}>{i18n.t(part.kind === 'novel' ? 'part.novel' : 'part.manga')}</span>
                    {/if}
                  </p>
                  <p class="ov-part__meta">
                    {#if part.first !== null}
                      <span class="mono ov-part__range">{i18n.t('part.pages').replace('{a}', String(part.first)).replace('{b}', String(part.last))}</span>
                    {/if}
                    {#if note}<span class="ov-part__lang">{note}</span>{/if}
                  </p>
                </div>
                <a
                  class="ov-btn mono ov-part__go"
                  class:ov-btn--ghost={pi > 0}
                  data-sfx="open"
                  href={href ?? readHref}
                  onclick={(e) => openPart(part, e)}
                >
                  {#if locked}<span aria-hidden="true">🔒 </span>{/if}
                  {i18n.t(part.kind === 'novel' && novelHref ? 'nv.read' : part.kind === 'manga' ? 'part.readManga' : 'ov.start')} →
                </a>
              </li>
            {/each}
          </ol>
        </div>
      {/if}

      <header class="ov-toc__head" use:reveal>
        <span class="index-num" aria-hidden="true">目</span>
        <h2 class="serif ov-toc__title" use:headingIn use:converge>{i18n.t('ov.contents')}</h2>
        <span class="ov-toc__rule" aria-hidden="true"></span>
        <span class="mono">{locked ? '——' : realPageCount} {i18n.t('ov.pages')}</span>
      </header>

      {#if locked}
        <!-- RLS returns only the cover row, so there is nothing to strip —
             show the gate invitation instead of thumbnails. -->
        <div class="ov-lockbar" use:reveal>
          <span class="ov-lockbar__glyph" aria-hidden="true">🔒</span>
          <p class="mono ov-lockbar__text">
            {#if work.password_hint}
              {i18n.t('ov.locked')}
              <!-- Shown only when the author has set one, in the studio. -->
              <span class="ov-lockbar__hint">{i18n.t('lock.hint')} — <span class="authored">{work.password_hint}</span></span>
            {:else}
              <!-- No hint: say it is limited, never where the password comes from -->
              {i18n.t('ov.limited')} — {i18n.t('ov.limitedNote')}
            {/if}
          </p>
          <button type="button" class="mono ov-lockbar__btn" onclick={() => openLock(null)}>
            {i18n.t('lock.unlock')} →
          </button>
        </div>
      {/if}

      <!-- Chapterless works: every page is "front matter" — show one plain
           strip (the old chapters-only condition left this section empty). -->
      {#if !locked && !chapterList.length && frontPages.length}
        <div class="ov-chapter" use:reveal>
          <div class="ov-strip" class:is-rtl={work.direction === 'rtl'}>
            {#each frontPages.filter((p) => !p.isBlank) as page (page.id)}
              <a class="ov-thumb" href={`/w/${slug}/read?p=${encodeURIComponent(page.id)}`}>
                <img src={page.thumbUrl} alt="" loading="lazy" />
                <span class="mono ov-thumb__num">{String(ordered.indexOf(page) + 1).padStart(2, '0')}</span>
                {#if page.note}<span class="ov-thumb__note" title="note"></span>{/if}
              </a>
            {/each}
          </div>
        </div>
      {/if}

      {#if !locked && frontPages.length && chapterList.length}
        <div class="ov-chapter" use:reveal>
          <header class="ov-chapter__head">
            <span class="mono ov-chapter__num">00</span>
            <h3 class="serif ov-chapter__title">{i18n.t('ov.front')}</h3>
            <span class="mono ov-chapter__count">{frontPages.filter((p) => !p.isBlank).length}P</span>
          </header>
          <div class="ov-strip" class:is-rtl={work.direction === 'rtl'}>
            {#each frontPages.filter((p) => !p.isBlank) as page (page.id)}
              <a class="ov-thumb" href={`/w/${slug}/read?p=${encodeURIComponent(page.id)}`}>
                <img src={page.thumbUrl} alt="" loading="lazy" />
                <span class="mono ov-thumb__num">{String(ordered.indexOf(page) + 1).padStart(2, '0')}</span>
                {#if page.note}<span class="ov-thumb__note" title="note"></span>{/if}
              </a>
            {/each}
          </div>
        </div>
      {/if}

      {#each locked ? [] : chapterList as { ch, pages: chPages, cover: chCover, firstReadable }, ci (ch.id)}
        <div class="ov-chapter" use:reveal>
          <header class="ov-chapter__head">
            <span class="mono ov-chapter__num">{String(ci + 1).padStart(2, '0')}</span>
            <h3 class="serif authored ov-chapter__title">{ch.title}</h3>
            <span class="mono ov-chapter__count">{chPages.filter((p) => !p.isBlank).length}P</span>
            <a
              class="mono ov-chapter__read"
              href={`/w/${slug}/read?p=${encodeURIComponent(firstReadable!.id)}`}
            >{i18n.t('ov.start')} →</a>
          </header>
          <div class="ov-strip" class:is-rtl={work.direction === 'rtl'}>
            {#if chCover}
              <a
                class="ov-thumb ov-thumb--cover"
                href={`/w/${slug}/read?p=${encodeURIComponent(firstReadable!.id)}`}
              >
                <img src={chCover.thumbUrl} alt={`${ch.title} — cover`} loading="lazy" />
                <span class="mono ov-thumb__tag">{i18n.t('rd.toc')}</span>
              </a>
            {/if}
            {#each chPages.filter((p) => !p.isBlank) as page (page.id)}
              <a class="ov-thumb" href={`/w/${slug}/read?p=${encodeURIComponent(page.id)}`}>
                <img src={page.thumbUrl} alt="" loading="lazy" />
                <span class="mono ov-thumb__num">{String(ordered.indexOf(page) + 1).padStart(2, '0')}</span>
                {#if page.note}<span class="ov-thumb__note" title="note"></span>{/if}
              </a>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- ACT III: cast — who's who (paper) -->
  {#if castList.length}
    <section class="ov-cast spread spread--paper">
      <div class="paper-grid" aria-hidden="true"></div>
      <div class="crop crop--tl" aria-hidden="true"></div>
      <div class="crop crop--tr" aria-hidden="true"></div>
      <div class="crop crop--bl" aria-hidden="true"></div>
      <div class="crop crop--br" aria-hidden="true"></div>
      <div class="regmark ov-cast__reg" aria-hidden="true"></div>
      <span class="watermark ov-cast__wm" aria-hidden="true">登場人物</span>
      <div class="ov-cast__inner">
        <header class="ov-cast__head" use:reveal>
          <span class="index-num" aria-hidden="true">人</span>
          <h2 class="serif ov-cast__title" use:headingIn use:converge>{i18n.t('ov.cast')}</h2>
          <span class="ov-cast__rule" aria-hidden="true"></span>
          <span class="mono">{pad2(castList.length)}</span>
        </header>
        <div class="ov-cast__grid" use:revealChildren>
          {#each castList as c, i (c.id)}
            <button
              type="button"
              class="ov-castTile"
              style={`--c:${c.color}`}
              onclick={() => openCast(i)}
            >
              <span class="ov-castTile__frame">
                {#if c.iconUrl}
                  <img src={c.iconUrl} alt="" loading="lazy" draggable="false" />
                {:else}
                  <span class="serif authored ov-castTile__ph" aria-hidden="true">{c.name.slice(0, 1)}</span>
                {/if}
                <span class="mono ov-castTile__num">{pad2(i + 1)}</span>
              </span>
              <span class="serif authored ov-castTile__name">{c.name}</span>
              {#if c.role}
                <span class="mono ov-castTile__role">{c.role}</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  <!-- ACT IV: synopsis — the spoiler leaf, last before the imprint (paper) -->
  {#if forewordHtml}
    <!-- The synopsis tells the whole story. It stays open (the owner's call),
         but nobody walks into it unwarned: a band first, and a way past it. -->
    <aside class="ov-spoiler" aria-label={i18n.t('ov.spoilerTitle')}>
      <div class="ov-spoiler__inner">
        <p class="mono ov-spoiler__title"><span aria-hidden="true">⚠</span> {i18n.t('ov.spoilerTitle')}</p>
        <p class="ov-spoiler__body">{i18n.t('ov.spoilerBody')}</p>
        <a class="mono ov-spoiler__skip" href="#ov-after" onclick={skipSynopsis}>{i18n.t('ov.skip')} ↓</a>
      </div>
    </aside>
    <section class="ov-fore spread spread--paper">
      <div class="paper-grid paper-grid--margin" aria-hidden="true"></div>
      <div class="crop crop--tl" aria-hidden="true"></div>
      <div class="crop crop--tr" aria-hidden="true"></div>
      <div class="crop crop--bl" aria-hidden="true"></div>
      <div class="crop crop--br" aria-hidden="true"></div>
      <div class="regmark ov-fore__reg" aria-hidden="true"></div>
      <div class="ov-fore__inner">
        <p class="mono ov-fore__label" use:headingIn>✳ {i18n.t('ov.foreword')}</p>
        {#if fore.sections.length >= 2}
          <nav class="ov-fore__nav" aria-label={i18n.t('ov.sections')}>
            <ol>
              {#each fore.sections as sec (sec.id)}
                <li><a class="authored" href={`#${sec.id}`}>{sec.text}</a></li>
              {/each}
            </ol>
          </nav>
        {/if}
        <div class="ov-fore__body serif authored" use:revealChildren>
          {@html forewordHtml}
        </div>
        <div class="ov-fore__sig">
          <!-- The author's own doodle as a signature seal, replacing the plain
               cobalt "A". Animated WebP can't be paused with CSS, so reduced
               motion gets a still frame — same pattern as the hero hanko. -->
          <picture class="ov-fore__stamp" aria-hidden="true">
            <source srcset={stampStatic.src} media="(prefers-reduced-motion: reduce)" />
            <img src={stamp.src} alt="" width={stamp.width} height={stamp.height} decoding="async" />
          </picture>
          <span class="mono">ASU AZURE</span>
        </div>
      </div>
    </section>
  {/if}

  <!-- ACT V: the series — the other books, and where to go next (ink) -->
  {#if series.list.length}
    <section class="ov-series spread spread--ink" id="ov-after" tabindex="-1">
      <div class="ov-series__inner">
        <header class="ov-series__head" use:reveal>
          <span class="index-num" aria-hidden="true">続</span>
          <h2 class="serif ov-series__title" use:headingIn>{i18n.t('ov.series')}</h2>
          <span class="ov-series__rule" aria-hidden="true"></span>
          <span class="mono authored">{work.series_title}</span>
        </header>
        <ol class="ov-series__list">
          {#each series.list as b (b.id)}
            {@const current = b.id === work.id}
            <li>
              <a
                class="ov-seriesCard"
                class:is-current={current}
                href={current ? undefined : `/w/${b.slug}`}
                aria-current={current ? 'page' : undefined}
                data-sfx={current ? undefined : 'open'}
              >
                <span
                  class="ov-seriesCard__cover"
                  style={b.cover ? `aspect-ratio: ${b.cover.width} / ${b.cover.height}` : undefined}
                >
                  {#if b.cover?.crop}
                    <img src={b.cover.medUrl} alt="" loading="lazy" style={cropImgStyle(b.cover.crop)} />
                  {:else if b.cover}
                    <img src={b.cover.medUrl} alt="" loading="lazy" />
                  {/if}
                </span>
                <span class="mono ov-seriesCard__kind">
                  {#if b.series_kind}{i18n.t(`series.${b.series_kind}`)}{/if}
                  {#if b.read_locked}<span aria-hidden="true"> 🔒</span>{/if}
                  {#if current}<span class="ov-seriesCard__here">· {i18n.t('ov.thisBook')}</span>{/if}
                </span>
                <span class="serif authored ov-seriesCard__title">{b.series_label || b.title}</span>
              </a>
            </li>
          {/each}
        </ol>
        {#if series.prev || series.next}
          <nav class="ov-series__step">
            {#if series.prev}
              <a class="mono" href={`/w/${series.prev.slug}`} data-sfx="open" data-vt="back">
                ← {i18n.t('ov.prev')} <span class="authored">{series.prev.series_label || series.prev.title}</span>
              </a>
            {/if}
            {#if series.next}
              <a class="mono ov-series__next" href={`/w/${series.next.slug}`} data-sfx="open">
                {i18n.t('ov.next')} <span class="authored">{series.next.series_label || series.next.title}</span> →
              </a>
            {/if}
          </nav>
        {/if}
      </div>
    </section>
  {/if}

  <!-- Page foot: back link + imprint, always the last leaf (ink) -->
  <footer class="ov-foot spread spread--ink" id={series.list.length ? undefined : 'ov-after'} tabindex="-1">
    <a class="mono ov-foot__back" href="/">← {i18n.t('ov.back')}</a>
    <span class="ov-foot__right">
      <!-- The artist is reachable from a book too, not only from the shelf. -->
      <a class="mono ov-foot__artist" href="/asu">ASU AZURE ↗</a>
      <span class="mono">© ASU AZURE</span>
    </span>
  </footer>

  {#if castOpen !== null && castList[castOpen]}
    <CastFile characters={castList} index={castOpen} onNavigate={navCast} onClose={closeCast} />
  {/if}

  {#if lockOpen}
    <LockGate {work} {onUnlocked} onClose={() => (lockOpen = false)} />
  {/if}
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
    /* The back chip and the LangBar are fixed at --chrome-top: when the hero
       runs taller than the screen (phones), its top padding must clear them or
       the cover starts underneath. */
    padding: max(clamp(5rem, 12vh, 7rem), calc(var(--chrome-top, 0px) + 3rem)) var(--pad) clamp(3rem, 8vh, 5rem);
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
  /* The front of the wraparound: the frame has the front's aspect, the picture
     is scaled and shifted inside it (cropImgStyle) — as the reader's .si__crop. */
  .ov-hero__cover.is-cropped {
    overflow: hidden;
    width: 100%;
  }
  .ov-hero__cover.is-cropped img {
    position: absolute;
    max-width: none;
  }
  /* 奥付 — a row of small facts under the title */
  .ov-info {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 1.3rem;
    margin: 0;
  }
  .ov-info__item {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .ov-info dt {
    font-size: 0.58rem;
    letter-spacing: 0.16em;
    color: var(--fg-faint);
  }
  .ov-info__value {
    margin: 0;
    font-family: var(--font-display-authored);
    font-size: 0.86rem;
    color: var(--fg);
  }
  /* Content notes — before the read button, in the amber warning voice */
  .ov-cw {
    display: grid;
    gap: 0.3rem;
    max-width: 36em;
    padding: 0.7rem 0.95rem;
    border-left: 3px solid #e8a31a;
    background: rgba(232, 163, 26, 0.09);
  }
  .ov-cw__label {
    font-size: 0.6rem;
    letter-spacing: 0.16em;
    color: #e8a31a;
  }
  .ov-cw__items {
    font-family: var(--font-display-authored);
    font-size: 0.92rem;
    line-height: 1.6;
    color: var(--fg);
  }
  .ov-live {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
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
      padding-top: max(clamp(4.5rem, 10vh, 6rem), calc(var(--chrome-top, 0px) + 3rem));
    }
    .ov-hero__cover {
      max-width: min(70vw, 18rem);
    }
    /* the front is portrait: a little narrower keeps the title in the first screen */
    .ov-hero__cover.is-cropped {
      max-width: min(58vw, 15rem);
    }
  }

  /* ---- cast (paper leaf: who's who) ---- */
  .ov-cast {
    position: relative;
    z-index: 1;
    padding: clamp(5rem, 12vh, 8rem) var(--pad);
    isolation: isolate;
    overflow: hidden;
  }
  .ov-cast__reg {
    top: 2.4rem;
    left: 10%;
  }
  .ov-cast__wm {
    top: 6%;
    right: 3%;
    font-size: clamp(5rem, 16vw, 13rem);
  }
  .ov-cast__inner {
    position: relative;
    z-index: 2;
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    gap: clamp(1.8rem, 4.5vh, 2.8rem);
  }
  .ov-cast__head {
    display: flex;
    align-items: baseline;
    gap: 1.2rem;
    position: relative;
  }
  .ov-cast__head .index-num {
    position: absolute;
    top: -0.55em;
    left: -0.12em;
    z-index: -1;
    font-size: clamp(5rem, 13vw, 9rem);
  }
  .ov-cast__title {
    font-size: clamp(1.8rem, 4.5vw, 2.8rem);
  }
  .ov-cast__rule {
    flex: 1;
    height: 1px;
    background: var(--line-strong);
  }
  .ov-cast__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(clamp(7.5rem, 17vw, 10.5rem), 1fr));
    gap: clamp(0.9rem, 2.2vw, 1.6rem);
  }
  /* Roster tile — the art site's gallery-tile recipe, framed in the
     character's own colour. */
  .ov-castTile {
    display: grid;
    gap: 0.55rem;
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
    text-align: left;
    color: var(--fg);
  }
  .ov-castTile__frame {
    position: relative;
    display: block;
    aspect-ratio: 1;
    border: 1px solid var(--line-strong);
    background: var(--bg-soft);
    overflow: hidden;
  }
  .ov-castTile__frame img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.65s var(--ease), filter 0.65s var(--ease);
  }
  .ov-castTile__frame::after {
    content: '';
    position: absolute;
    inset: 0;
    border: 2px solid var(--c, var(--accent));
    opacity: 0;
    transition: opacity 0.3s var(--ease);
    pointer-events: none;
  }
  /* Pointer-gated: cast tiles are buttons, and an unguarded :hover makes the
     first tap on a phone do nothing but paint this state. */
  @media (hover: hover) {
    .ov-castTile:hover .ov-castTile__frame img {
      transform: scale(1.06);
    }
    .ov-castTile:hover .ov-castTile__frame::after {
      opacity: 1;
    }
  }
  .ov-castTile:focus-visible .ov-castTile__frame img {
    transform: scale(1.06);
  }
  .ov-castTile:focus-visible .ov-castTile__frame::after {
    opacity: 1;
  }
  .ov-castTile__ph {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: clamp(2.6rem, 7vw, 4rem);
    font-style: italic;
    color: color-mix(in srgb, var(--c, var(--accent)) 55%, transparent);
    user-select: none;
  }
  .ov-castTile__num {
    position: absolute;
    top: 4px;
    left: 5px;
    font-size: 0.52rem;
    color: #f4f1ea;
    mix-blend-mode: difference;
  }
  .ov-castTile__name {
    font-size: clamp(1.02rem, 1.8vw, 1.25rem);
    line-height: 1.25;
  }
  .ov-castTile__role {
    font-size: 0.55rem;
    color: var(--fg-faint);
  }
  @media (max-width: 640px) {
    .ov-cast__wm {
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
  /* A section head (lib/foreword.ts) starts below any floated figure, and reads
     from the start edge even inside a block the author centred. */
  .ov-fore__body :global(h2[id^='ov-s-']) {
    clear: both;
    text-align: start;
    margin-top: 1.4em;
  }
  /* Section nav — built from the synopsis's own numbered heads */
  .ov-fore__nav ol {
    display: grid;
    gap: 0.45rem;
    margin: -0.6rem 0 0;
    padding: 0.9rem 0 0.9rem 1.1rem;
    border-left: 1px solid var(--paper-mark, var(--line-strong));
    list-style: none;
  }
  .ov-fore__nav a {
    font-size: 0.95rem;
    line-height: 1.5;
    color: var(--fg-dim);
    text-decoration: underline;
    text-decoration-color: transparent;
    text-underline-offset: 0.25em;
    transition: color 0.2s var(--ease), text-decoration-color 0.2s var(--ease);
  }
  .ov-fore__nav a:hover,
  .ov-fore__nav a:focus-visible {
    color: var(--accent);
    text-decoration-color: currentColor;
  }

  /* ---- spoiler band: a full-width hazard strip before the synopsis ---- */
  .ov-spoiler {
    position: relative;
    z-index: 1;
    background: #e8a31a;
    color: #14110a;
    padding: calc(clamp(1.4rem, 4vh, 2.2rem) + 10px) var(--pad);
  }
  .ov-spoiler::before,
  .ov-spoiler::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 10px;
    background: repeating-linear-gradient(-45deg, #14110a 0 10px, transparent 10px 20px);
  }
  .ov-spoiler::before {
    top: 0;
  }
  .ov-spoiler::after {
    bottom: 0;
  }
  .ov-spoiler__inner {
    max-width: 44rem;
    margin: 0 auto;
    display: grid;
    gap: 0.5rem;
  }
  .ov-spoiler__title,
  .ov-spoiler__body,
  .ov-spoiler__skip {
    color: #14110a;
  }
  .ov-spoiler__title {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.22em;
  }
  .ov-spoiler__body {
    font-family: var(--font-serif-authored);
    font-size: clamp(1rem, 1.6vw, 1.15rem);
    line-height: 1.7;
  }
  .ov-spoiler__skip {
    justify-self: start;
    margin-top: 0.3rem;
    font-size: 0.68rem;
    letter-spacing: 0.14em;
    text-decoration: underline;
    text-underline-offset: 0.3em;
  }
  .ov-spoiler__skip:hover,
  .ov-spoiler__skip:focus-visible {
    text-decoration-thickness: 2px;
  }
  /* Block flow (not grid) so author figures can float and wrap text.
     Blocks carry their own margins for rhythm. */
  .ov-fore__body {
    display: block;
    font-size: clamp(1.02rem, 1.5vw, 1.18rem);
    line-height: 2;
    /* Author HTML can contain anything (pasted content included). A bare
       full-size <img> outside a fore-fig once inflated this grid item's
       min-content width past the viewport and dragged the whole column with
       it — clamp every image and let the column shrink. */
    min-width: 0;
    overflow-wrap: break-word;
  }
  .ov-fore__body :global(img) {
    max-width: 100%;
    height: auto;
  }
  .ov-fore__body::after {
    content: '';
    display: block;
    clear: both;
  }
  /* Each paragraph rules itself from its own top edge, so a heading, figure or
     blockquote above it cannot knock the text off the lines — which is why this
     lives here and not on the section's .paper-grid, whose rules start at the
     section edge an unknowable distance above the first baseline.
     `lh` is the element's OWN computed line box, so the pitch matches the text by
     construction. calc(font-size × line-height) is not equivalent: the browser
     rounds the used font-size, which left a 0.015px drift per line. Gap between
     paragraphs is exactly one line, so the rhythm carries: a blank ruled line. */
  .ov-fore__body :global(p),
  .ov-fore__body > :global(div:not(:has(p))) {
    margin: 0 0 1lh;
    background-image: repeating-linear-gradient(
      180deg,
      transparent 0 calc(1lh - 1px),
      var(--paper-rule) calc(1lh - 1px) 1lh
    );
  }
  /* Authored stack, not --font-serif: these headings are author text too, so the
     subsetted webfont would split them across two faces exactly like the body. */
  .ov-fore__body :global(h1),
  .ov-fore__body :global(h2),
  .ov-fore__body :global(h3),
  .ov-fore__body :global(h4) {
    font-family: var(--font-serif-authored);
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
  /* Signature seal. Sits on the paper leaf, so the vermillion doodle reads
     directly — no plate or backing needed. */
  .ov-fore__stamp {
    display: block;
    width: clamp(3.2rem, 6vw, 4.6rem);
    rotate: -6deg;
    flex-shrink: 0;
    user-select: none;
  }
  .ov-fore__stamp img {
    display: block;
    width: 100%;
    height: auto;
  }
  .ov-backchip {
    position: fixed;
    top: var(--chrome-top, calc(0.9rem + env(safe-area-inset-top)));
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

  /* ---- この本の構成: the parts of a book in parts ---- */
  .ov-parts {
    display: grid;
    gap: clamp(1.2rem, 3vh, 1.8rem);
    /* room for the contents heading's index kanji, which rises above its line */
    margin-bottom: clamp(2.5rem, 7vh, 4.5rem);
  }
  .ov-parts__list {
    display: grid;
    gap: 0.8rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ov-part {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.6rem 1.4rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--line-strong);
    background: var(--bg-soft);
  }
  .ov-part__num {
    color: var(--accent);
    font-size: 0.78rem;
    letter-spacing: 0.12em;
    white-space: nowrap;
  }
  .ov-part__body {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
  .ov-part__head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.3rem 0.8rem;
  }
  .ov-part__title {
    font-size: clamp(1.15rem, 2.4vw, 1.5rem);
    line-height: 1.3;
    color: var(--fg);
  }
  .ov-part__kind {
    padding: 0.2em 0.6em;
    border: 1px solid currentColor;
    font-size: 0.6875rem;
    letter-spacing: 0.1em;
    color: var(--fg);
  }
  .ov-part__kind[data-kind='novel'] {
    color: #e8a31a;
  }
  .ov-part__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 1rem;
  }
  .ov-part__range {
    font-size: 0.6875rem;
    letter-spacing: 0.1em;
    color: var(--fg-dim);
  }
  .ov-part__lang {
    font-family: var(--font-display-authored);
    font-size: 0.88rem;
    color: var(--fg);
  }
  .ov-part__go {
    white-space: nowrap;
  }
  @media (max-width: 640px) {
    .ov-part {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.55rem;
    }
    .ov-part__go {
      justify-self: stretch;
      text-align: center;
    }
  }
  .ov-marknote {
    max-width: 36em;
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
  /* Pointer-gated: these thumbnails are links into the reader. */
  @media (hover: hover) {
    .ov-thumb:hover {
      border-color: var(--accent);
      transform: translateY(-3px);
    }
  }
  .ov-thumb:focus-visible {
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
  /* Locked contents — one line where the strips would be, not an empty box. */
  .ov-toc.is-locked {
    padding-top: clamp(3.5rem, 9vh, 5.5rem);
    padding-bottom: clamp(2.5rem, 6vh, 3.5rem);
  }
  .ov-lockbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.7rem 1.1rem;
    padding: 0.85rem 1rem;
    border: 1px dashed var(--line-strong);
  }
  .ov-lockbar__glyph {
    font-size: 1.1rem;
    opacity: 0.75;
  }
  .ov-lockbar__text {
    flex: 1 1 16rem;
    letter-spacing: 0.12em;
    line-height: 1.7;
  }
  .ov-lockbar__hint {
    display: block;
    font-size: 0.62rem;
    color: #e8a31a;
  }
  .ov-lockbar__btn {
    background: var(--accent);
    color: var(--ink-fg);
    border: 0;
    padding: 0.7em 1.3em;
    letter-spacing: 0.14em;
    cursor: pointer;
    transition: background-color 0.25s var(--ease);
  }
  .ov-lockbar__btn:hover {
    background: #1d33c4;
  }

  /* ---- series ---- */
  .ov-series {
    position: relative;
    z-index: 1;
    padding: clamp(4.5rem, 11vh, 7rem) var(--pad) clamp(3rem, 8vh, 5rem);
  }
  .ov-series:focus,
  .ov-foot:focus {
    outline: none;
  }
  .ov-series__inner {
    max-width: 1100px;
    margin: 0 auto;
    display: grid;
    gap: clamp(1.8rem, 4.5vh, 2.8rem);
  }
  .ov-series__head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.6rem 1.2rem;
    position: relative;
  }
  .ov-series__head .index-num {
    position: absolute;
    top: -0.55em;
    left: -0.12em;
    z-index: -1;
    font-size: clamp(5rem, 13vw, 9rem);
  }
  .ov-series__title {
    font-size: clamp(1.8rem, 4.5vw, 2.8rem);
  }
  .ov-series__rule {
    flex: 1;
    min-width: 2rem;
    height: 1px;
    background: var(--line-strong);
  }
  .ov-series__list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(9.5rem, 40vw), 1fr));
    gap: clamp(1rem, 3vw, 2rem);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ov-seriesCard {
    display: grid;
    gap: 0.45rem;
    color: inherit;
  }
  .ov-seriesCard__cover {
    position: relative;
    display: block;
    overflow: hidden;
    border: 1px solid var(--line);
    background: var(--bg-soft);
    aspect-ratio: 0.72;
    transition: border-color 0.25s var(--ease), transform 0.25s var(--ease);
  }
  .ov-seriesCard__cover img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    object-fit: cover;
  }
  /* a cropped front: cropImgStyle sets the box, so undo the cover fit */
  .ov-seriesCard__cover img[style] {
    inset: auto;
    object-fit: fill;
  }
  @media (hover: hover) {
    a.ov-seriesCard[href]:hover .ov-seriesCard__cover {
      border-color: var(--accent);
      transform: translateY(-3px);
    }
  }
  a.ov-seriesCard[href]:focus-visible .ov-seriesCard__cover {
    border-color: var(--accent);
  }
  .ov-seriesCard.is-current .ov-seriesCard__cover {
    border-color: var(--line-strong);
    box-shadow: 0 0 0 2px var(--accent);
  }
  .ov-seriesCard__kind {
    font-size: 0.58rem;
    letter-spacing: 0.16em;
    color: var(--fg-faint);
  }
  .ov-seriesCard__here {
    color: var(--accent);
  }
  .ov-seriesCard__title {
    font-size: clamp(0.98rem, 1.6vw, 1.12rem);
    line-height: 1.4;
  }
  .ov-series__step {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.8rem 1.6rem;
    border-top: 1px solid var(--line);
    padding-top: 1rem;
  }
  .ov-series__step a {
    color: var(--fg-dim);
    letter-spacing: 0.1em;
  }
  .ov-series__step a:hover {
    color: var(--accent);
  }
  .ov-series__next {
    margin-left: auto;
  }

  .ov-foot {
    position: relative;
    z-index: 1;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    border-top: 1px solid var(--line);
    padding: clamp(1.6rem, 4vh, 2.4rem) var(--pad);
  }
  .ov-foot__back:hover,
  .ov-foot__artist:hover {
    color: var(--accent);
  }
  .ov-foot__right {
    display: flex;
    align-items: baseline;
    gap: 1.6rem;
    flex-wrap: wrap;
  }
</style>
