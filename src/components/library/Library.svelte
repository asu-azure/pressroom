<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { supabase } from '../../lib/supabase';
  import { publicUrl } from '../../lib/storagePaths';
  import { i18n } from '../../lib/i18n.svelte';
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
  // (same data-i18n spirit as the art site).
  $effect(() => {
    const sub = document.getElementById('lib-sub');
    if (sub) sub.textContent = i18n.t('lib.sub');
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
</style>
