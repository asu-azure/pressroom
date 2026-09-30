<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { supabase } from '../../lib/supabase';
  import { publicUrl } from '../../lib/storagePaths';
  import { i18n } from '../../lib/i18n.svelte';
  import { assemble } from '../../scripts/text';
  import WorkCard from './WorkCard.svelte';
  import CdCase from './CdCase.svelte';
  import LangBar from './LangBar.svelte';
  import type { Work } from '../../lib/types';
  import type { JewelArt } from '../../lib/jewel';

  /** The soundtrack CD, when music is on (index.astro builds the images). */
  let { ost = null }: { ost?: { art: JewelArt; tracks: string[]; length: string } | null } = $props();

  gsap.registerPlugin(ScrollTrigger);
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse =
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  interface CardData {
    work: Work;
    coverUrl: string | null;
    pageCount: number;
  }

  /** One row per published work, from the library_cards() RPC. */
  interface CardRow {
    card_work_id: string;
    card_cover_page_id: string | null;
    card_med_path: string | null;
    card_page_count: number;
  }

  let cards = $state<CardData[] | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    void load();
  });

  // Hero text lives in the static Astro shell — swap it on language change
  // (same data-i18n spirit as the art site). The entrance belongs here rather
  // than in the page script: this effect rewrites the node on mount and on
  // every language change, which would wipe an animation started elsewhere.
  $effect(() => {
    const sub = document.getElementById('lib-sub');
    if (!sub) return;
    sub.textContent = i18n.t('lib.sub');
    // Gathers per grapheme. decode() can't be used — the line is Japanese by
    // default and that effect's scramble alphabet is Latin only.
    assemble(sub, { delay: 0.15 });
  });

  /** Reversible scroll entrance for each card (Editorial FUI house rule). */
  function rise(node: HTMLElement, index: number) {
    if (reduced) return;
    const tween = gsap.fromTo(
      node,
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.75,
        ease: 'power3.out',
        delay: (index % 4) * 0.06,
        scrollTrigger: { trigger: node, start: 'top 92%', toggleActions: 'play none none reverse' },
      },
    );
    return {
      destroy() {
        tween.scrollTrigger?.kill();
        tween.kill();
      },
    };
  }

  async function load() {
    // Covers + page counts come from library_cards() (see supabase/library-cards.sql):
    // one row per work instead of one per page, so the grid can't hit PostgREST's
    // 1000-row cap, and locked works report their true length rather than "1P".
    const [{ data: works, error: err }, { data: rows, error: cardErr }] = await Promise.all([
      supabase
        .from('works')
        .select('*')
        .eq('published', true)
        .order('updated_at', { ascending: false }),
      supabase.rpc('library_cards'),
    ]);
    if (err || cardErr) {
      error = (err ?? cardErr)!.message;
      return;
    }

    const byWork = new Map<string, CardRow>(
      ((rows ?? []) as CardRow[]).map((r) => [r.card_work_id, r]),
    );
    cards = ((works ?? []) as Work[]).map((work) => {
      const row = byWork.get(work.id);
      return {
        work,
        coverUrl: row?.card_med_path ? publicUrl(row.card_med_path) : null,
        pageCount: row?.card_page_count ?? 0,
      };
    });
  }
</script>

<LangBar />

<section class="lib">
  <!-- Shelf head: a proof-sheet slug line, so the books arrive as a section
       rather than straight after the music band. -->
  <header class="lib__head">
    <span class="mono lib__k">01 — {i18n.t('lib.shelf')}</span>
    <span class="lib__rule" aria-hidden="true"></span>
    {#if cards?.length}
      <span class="mono lib__n">{i18n.t('lib.count').replace('{n}', String(cards.length).padStart(2, '0'))}</span>
    {/if}
  </header>
  {#if cards?.length && !reduced}
    <p class="mono lib__hint">{i18n.t(coarse ? 'lib.hintTouch' : 'lib.hint')}</p>
  {/if}

  {#if error}
    <p class="mono lib__status">{i18n.t('lib.offline')} — {error}</p>
  {:else if cards === null}
    <p class="mono lib__status"><span class="mk-loader" aria-hidden="true"></span> {i18n.t('lib.loading')}</p>
  {:else if cards.length === 0}
    <p class="mono lib__status">{i18n.t('lib.empty')}</p>
  {:else}
    <div class="lib__grid">
      {#each cards as card, i (card.work.id)}
        <div use:rise={i}>
          <WorkCard work={card.work} coverUrl={card.coverUrl} pageCount={card.pageCount} index={i} />
        </div>
      {/each}
      {#if ost}
        <!-- The soundtrack stands at the end of the shelf, after the books. -->
        <div use:rise={cards.length}>
          <CdCase art={ost.art} tracks={ost.tracks} length={ost.length} />
        </div>
      {/if}

      <!-- The author card that used to close this grid is gone: the artist
           teaser now sits directly below the shelf and says the same thing with
           more room, so the two were adjacent duplicates. The grid ends on a
           book, which is what it is for. -->
    </div>
  {/if}
</section>

<style>
  .lib {
    --gap-x: clamp(1.25rem, 5vw, 4.5rem);
    padding: clamp(2.5rem, 7vh, 4.5rem) var(--pad) clamp(3rem, 8vh, 5rem);
    overflow-x: clip;
  }
  .lib__head {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .lib__k,
  .lib__n {
    font-size: 0.62rem;
    letter-spacing: 0.18em;
    white-space: nowrap;
  }
  .lib__k { color: var(--accent); }
  .lib__n { color: var(--fg-dim); }
  /* ruler ticks along the slug line */
  .lib__rule {
    flex: 1;
    height: 7px;
    border-bottom: 1px solid var(--line-strong);
    background: repeating-linear-gradient(90deg, var(--line-strong) 0 1px, transparent 1px 12px) bottom / 100% 4px no-repeat;
  }
  .lib__hint {
    margin-top: 0.7rem;
    font-size: 0.55rem;
    letter-spacing: 0.14em;
    color: var(--fg-faint);
  }
  .lib__status {
    padding: 3rem 0;
  }
  /* Books stand on planks. Each book carries its own length of plank that
     reaches half a gap either side, so a row reads as one continuous shelf; the
     last book's plank runs on to the edge and fades — room for the next one. */
  .lib__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(14rem, 40vw), 19rem));
    column-gap: var(--gap-x);
    row-gap: clamp(3rem, 8vh, 5rem);
    margin-top: clamp(2rem, 5vh, 3rem);
  }
  .lib__grid > :global(div) { position: relative; }
  .lib__grid :global(.book-card__label::before) {
    content: '';
    position: absolute;
    top: 0;
    left: calc(var(--gap-x) / -2);
    right: calc(var(--gap-x) / -2);
    height: 6px;
    background: linear-gradient(180deg, #2a2a2e, #161618);
    border-top: 1px solid rgba(244, 241, 234, 0.18);
    box-shadow: 0 10px 18px -8px rgba(0, 0, 0, 0.8);
  }
  .lib__grid > :global(div:first-child .book-card__label::before) { left: calc(var(--pad) * -1); }
  .lib__grid > :global(div:last-child .book-card__label::before) {
    right: -100vw;
    mask-image: linear-gradient(90deg, #000 calc(100% - 100vw), transparent calc(100% - 100vw + 60vw));
  }
  @media (max-width: 640px) {
    .lib__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

</style>
