<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { supabase } from '../../lib/supabase';
  import { publicUrl } from '../../lib/storagePaths';
  import { i18n } from '../../lib/i18n.svelte';
  import { assemble } from '../../scripts/text';
  import WorkCard from './WorkCard.svelte';
  import LangBar from './LangBar.svelte';
  import type { Work } from '../../lib/types';

  gsap.registerPlugin(ScrollTrigger);
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  {#if error}
    <p class="mono lib__status">{i18n.t('lib.offline')} — {error}</p>
  {:else if cards === null}
    <p class="mono lib__status">{i18n.t('lib.loading')}</p>
  {:else if cards.length === 0}
    <p class="mono lib__status">{i18n.t('lib.empty')}</p>
  {:else}
    <div class="lib__grid">
      {#each cards as card, i (card.work.id)}
        <div use:rise={i}>
          <WorkCard work={card.work} coverUrl={card.coverUrl} pageCount={card.pageCount} index={i} />
        </div>
      {/each}

      <!-- The odd one out: cream paper among the dark covers, a seal instead of
           art. A book about the person who made the books. data-flock hands the
           navigation to the bird-flock sweep (delegated in flock.ts, so it works
           even though this markup arrives with the island). -->
      <div use:rise={cards.length}>
        <a class="authorcard" href="/asu" data-flock data-cursor="MEET" data-hover>
          <span class="mono authorcard__k">{i18n.t('artist.cardK')}</span>
          <span class="authorcard__seal" aria-hidden="true">亜</span>
          <span class="serif authorcard__title">{i18n.t('artist.cardTitle')}</span>
          <span class="mono authorcard__cta">{i18n.t('artist.cardCta')} →</span>
        </a>
      </div>
    </div>
  {/if}
</section>

<style>
  .lib {
    padding: 0 var(--pad) clamp(3rem, 8vh, 5rem);
  }
  .lib__status {
    padding: 3rem 0;
  }
  .lib__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(15rem, 42vw), 1fr));
    gap: clamp(1rem, 2.5vw, 2rem);
  }

  /* --- Author card ---------------------------------------------------------
     Matches WorkCard's 4/5.4 footprint so the grid stays even, but inverts the
     tone: paper stock, dashed edge, no cover image. It should read as a card
     that wandered in from a different section. */
  .authorcard {
    display: flex;
    flex-direction: column;
    height: 100%;
    aspect-ratio: 4 / 5.4;
    padding: clamp(1rem, 2vw, 1.4rem);
    text-decoration: none;
    border: 1px dashed var(--paper-line-strong);
    border-radius: 4px;
    background: var(--paper-bg);
    color: var(--paper-fg);
    transition: border-color 0.4s var(--ease), transform 0.5s var(--ease);
  }
  .authorcard:hover,
  .authorcard:focus-visible {
    border-color: var(--accent);
    border-style: solid;
  }
  @media (hover: hover) {
    .authorcard:hover {
      transform: translateY(-4px);
    }
  }
  .authorcard__k {
    color: var(--paper-fg-faint);
    font-size: 0.55rem;
  }
  .authorcard__seal {
    margin: auto 0 0.6rem;
    align-self: flex-start;
    font-family: var(--font-serif-jp);
    font-size: clamp(2.6rem, 7vw, 4rem);
    line-height: 1;
    color: #d3381c;
    border: 3px solid #d3381c;
    border-radius: 5px;
    padding: 0.1em 0.14em;
    rotate: -7deg;
  }
  .authorcard__title {
    font-size: clamp(1.05rem, 2.2vw, 1.35rem);
    line-height: 1.25;
  }
  .authorcard__cta {
    margin-top: 0.7rem;
    font-size: 0.55rem;
    color: var(--accent);
  }
</style>
