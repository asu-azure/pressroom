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
    const dev = document.getElementById('lib-devnote');
    if (dev) dev.textContent = i18n.t('lib.devnote');
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
    const { data: works, error: err } = await supabase
      .from('works')
      .select('*')
      .eq('published', true)
      .order('updated_at', { ascending: false });
    if (err) {
      error = err.message;
      return;
    }
    const list = (works ?? []) as Work[];

    // One query for all covers + counts (library stays a single round trip pair).
    const ids = list.map((w) => w.id);
    const { data: pages } = ids.length
      ? await supabase
          .from('pages')
          .select('id, work_id, thumb_path, med_path, sort_key')
          .in('work_id', ids)
      : { data: [] };

    cards = list.map((work) => {
      const own = (pages ?? []).filter((p) => p.work_id === work.id);
      own.sort((a, b) => (a.sort_key < b.sort_key ? -1 : 1));
      const cover = own.find((p) => p.id === work.cover_page_id) ?? own[0];
      return {
        work,
        coverUrl: cover ? publicUrl(cover.med_path) : null,
        pageCount: own.length,
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
