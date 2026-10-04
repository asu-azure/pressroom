<script lang="ts">
  /**
   * 登場人物 — the cast as the STARFALL MV would show it: a night set with bokeh
   * and a slit of light, each main character a taped photo print with their line
   * set vertically beside it (the MV's subtitles), the rest pinned in a row.
   * Black-and-white art is duotoned in the character's colour (CSS only — the
   * file keeps the real picture). Rules in lib/castView.ts; every motion is
   * reversible or scrubbed, and lands on its final state under reduced motion.
   */
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { converge } from '../../scripts/mv';
  import { toRichHtml } from '../../lib/richtext';
  import { castParts, portraitOf, splitName, tiltOf } from '../../lib/castView';
  import { i18n } from '../../lib/i18n.svelte';
  import type { Character } from '../../lib/types';

  gsap.registerPlugin(ScrollTrigger);

  let { cast, onOpen }: { cast: Character[]; onOpen: (index: number) => void } = $props();

  const parts = $derived(castParts(cast));
  const open = (c: Character) => onOpen(cast.indexOf(c));
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const bioOf = (c: Character) => (c.bio ? toRichHtml(c.bio) : '');

  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function scrolled(tween: gsap.core.Tween | gsap.core.Timeline) {
    return {
      destroy() {
        tween.scrollTrigger?.kill();
        tween.kill();
      },
    };
  }

  /** A print is laid down: it drops in a little turned and settles on its tilt. */
  function printIn(node: HTMLElement, turn: number) {
    if (reduced) return;
    return scrolled(
      gsap.fromTo(
        node,
        { opacity: 0, y: 56, rotation: turn },
        {
          opacity: 1,
          y: 0,
          rotation: 0,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: { trigger: node, start: 'top 86%', toggleActions: 'play none none reverse' },
        },
      ),
    );
  }

  /** The line is written top to bottom, the way the MV's subtitles came in. */
  function wipeIn(node: HTMLElement) {
    if (reduced) return;
    return scrolled(
      gsap.fromTo(
        node,
        { clipPath: 'inset(0% 0% 100% 0%)' },
        {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: 1.1,
          ease: 'power2.inOut',
          delay: 0.25,
          scrollTrigger: { trigger: node, start: 'top 82%', toggleActions: 'play none none reverse' },
        },
      ),
    );
  }

  /** Plain fade-up for the text column and the pinned row (reversible). */
  function rise(node: HTMLElement, delay = 0) {
    if (reduced) return;
    return scrolled(
      gsap.fromTo(
        node,
        { opacity: 0, y: 28 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          delay,
          ease: 'power3.out',
          scrollTrigger: { trigger: node, start: 'top 90%', toggleActions: 'play none none reverse' },
        },
      ),
    );
  }

  /** The light drifts as the set scrolls by: beams sideways, bokeh slower than
      the page. Scrubbed, so it is wherever the scroll puts it. */
  function drift(node: HTMLElement, kind: 'beams' | 'bokeh') {
    if (reduced) return;
    const section = node.closest('section') ?? node;
    return scrolled(
      gsap.fromTo(
        node,
        kind === 'beams' ? { xPercent: -8 } : { yPercent: -6 },
        {
          ...(kind === 'beams' ? { xPercent: 8 } : { yPercent: 6 }),
          ease: 'none',
          scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true },
        },
      ),
    );
  }

  /** Two lights on an orbit — the MV's pair of stars — travel with the scroll. */
  function orbit(node: SVGGElement) {
    const dots = [...node.querySelectorAll<SVGCircleElement>('[data-dot]')];
    const place = (a: number) =>
      dots.forEach((d, k) => {
        const t = a + k * Math.PI;
        d.setAttribute('cx', String(500 + 470 * Math.cos(t)));
        d.setAttribute('cy', String(300 + 110 * Math.sin(t)));
      });
    const start = -0.6;
    place(start);
    if (reduced) return;
    const st = ScrollTrigger.create({
      trigger: node.closest('.cs__mains') ?? node,
      start: 'top bottom',
      end: 'bottom top',
      scrub: true,
      onUpdate: (self) => place(start + self.progress * Math.PI * 1.3),
    });
    return { destroy: () => st.kill() };
  }
</script>

<section class="cs" aria-labelledby="cs-title">
  <div class="cs__bokeh" aria-hidden="true" use:drift={'bokeh'}></div>
  <div class="cs__beams" aria-hidden="true" use:drift={'beams'}></div>
  <div class="cs__grain" aria-hidden="true"></div>

  <div class="cs__bar mono" aria-hidden="true">
    <span>{i18n.t('cast.kicker')} — {i18n.t('ov.cast')}</span>
    <span>{pad2(cast.length)}</span>
  </div>

  <header class="cs__head">
    <span class="cs__slit" aria-hidden="true"></span>
    <h2 id="cs-title" class="cs__title" use:converge>{i18n.t('ov.cast')}</h2>
    <p class="cs__kicker" aria-hidden="true">{i18n.t('cast.kicker')}</p>
  </header>

  <div class="cs__mains">
    {#if parts.main.length >= 2}
      <svg class="cs-orbit" viewBox="0 0 1000 600" aria-hidden="true">
        <g transform="rotate(-9 500 300)" use:orbit>
          <ellipse cx="500" cy="300" rx="470" ry="110" />
          <ellipse class="cs-orbit__far" cx="500" cy="300" rx="430" ry="150" />
          {#each parts.main.slice(0, 2) as c (c.id)}
            <circle data-dot r="4" style={`--c:${c.color}`} />
          {/each}
        </g>
      </svg>
    {/if}

    {#each parts.main as c, k (c.id)}
      {@const nm = splitName(c.name)}
      {@const pic = portraitOf(c)}
      {@const bio = bioOf(c)}
      <article
        class="cs-scene"
        class:cs-scene--flip={k % 2 === 1}
        style={`--c:${c.color};--tilt:${tiltOf(c.id, k)}deg`}
      >
        <div class="cs-scene__glow" aria-hidden="true"></div>
        {#if pic && !pic.mono}
          <div class="cs-scene__amb" aria-hidden="true" style={`background-image:url("${pic.url}")`}></div>
        {/if}

        <div class="cs-scene__print" use:printIn={k % 2 ? -5 : 5}>
          <button
            type="button"
            class="cs-print"
            tabindex="-1"
            aria-label={`${nm.ja}${i18n.t('cast.openOf')}`}
            onclick={() => open(c)}
          >
            <span class="cs-tape cs-tape--a" aria-hidden="true"></span>
            <span class="cs-tape cs-tape--b" aria-hidden="true"></span>
            <span class="cs-pic" class:is-mono={pic?.mono}>
              {#if pic}
                <img src={pic.url} alt="" loading="lazy" decoding="async" draggable="false" />
              {:else}
                <span class="cs-pic__ph authored" aria-hidden="true">{nm.ja.slice(0, 1)}</span>
              {/if}
              <span class="cs-pic__leak" aria-hidden="true"></span>
            </span>
            <span class="cs-cap" aria-hidden="true">{nm.ja}</span>
          </button>
        </div>

        {#if c.quote}
          <blockquote class="cs-quote" lang="ja" use:wipeIn>
            <p><span class="cs-quote__who">（{nm.ja}）</span>{c.quote}</p>
          </blockquote>
        {/if}

        <div class="cs-info" use:rise={0.15}>
          <p class="mono cs-info__meta">
            <span>{pad2(cast.indexOf(c) + 1)}</span>
            {#if c.role}<span>{c.role}</span>{/if}
            {#if c.age}<span>{c.age}</span>{/if}
          </p>
          <h3 class="cs-info__name" use:converge>{nm.ja}</h3>
          {#if nm.en}<p class="cs-info__en">{nm.en}</p>{/if}
          {#if c.realName}
            <p class="authored cs-info__real">
              <span class="mono">{i18n.t('cast.realName')}</span>
              {c.realName}
            </p>
          {/if}
          {#if bio}
            <div class="authored cs-info__bio">{@html bio}</div>
          {/if}
          <button type="button" class="mono cs-info__open" onclick={() => open(c)}>
            {i18n.t('cast.open')} <span aria-hidden="true">→</span>
          </button>
        </div>
      </article>
    {/each}
  </div>

  {#if parts.crew.length}
    <div class="cs-crew">
      <p class="mono cs-crew__head" use:rise>
        <span>{i18n.t('cast.more')}</span>
        <span class="cs-crew__rule" aria-hidden="true"></span>
        <span>{pad2(parts.crew.length)}</span>
      </p>
      <ul class="cs-crew__row">
        {#each parts.crew as c, k (c.id)}
          {@const nm = splitName(c.name)}
          {@const pic = portraitOf(c)}
          <li class="cs-crew__item" style={`--c:${c.color};--tilt:${tiltOf(c.id, k + 1)}deg`} use:rise={k * 0.06}>
            <button
              type="button"
              class="cs-print cs-print--pin"
              aria-label={`${nm.ja}${i18n.t('cast.openOf')}`}
              onclick={() => open(c)}
            >
              <span class="cs-tape cs-tape--pin" aria-hidden="true"></span>
              <span class="cs-pic" class:is-mono={pic?.mono}>
                {#if pic}
                  <img src={pic.url} alt="" loading="lazy" decoding="async" draggable="false" />
                {:else}
                  <span class="cs-pic__ph authored" aria-hidden="true">{nm.ja.slice(0, 1)}</span>
                {/if}
                <span class="cs-pic__leak" aria-hidden="true"></span>
              </span>
              <span class="cs-cap" aria-hidden="true">{nm.ja}</span>
            </button>
            <p class="mono cs-crew__role">
              {#if c.role}<span>{c.role}</span>{/if}
              {#if c.age}<span>{c.age}</span>{/if}
            </p>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <div class="cs__bar cs__bar--foot" aria-hidden="true"></div>
</section>

<style>
  /* ---- the set ---- */
  .cs {
    --cs-ink: #0a0b12;
    --cs-paper: #f1e9d8;
    --cs-text: #efe7d6;
    --cs-dim: rgba(239, 231, 214, 0.72);
    --cs-faint: rgba(239, 231, 214, 0.5);
    --cs-mincho: 'PR Cast Mincho', var(--font-serif-authored);
    --cs-hand: 'PR Cast Hand', 'PR Cast Mincho', var(--font-serif-authored);
    position: relative;
    z-index: 1;
    isolation: isolate;
    overflow: hidden;
    color: var(--cs-text);
    background:
      radial-gradient(120% 60% at 15% 0%, rgba(232, 163, 26, 0.13), transparent 60%),
      radial-gradient(90% 60% at 100% 100%, rgba(39, 66, 240, 0.16), transparent 65%),
      linear-gradient(180deg, #07080e 0%, var(--cs-ink) 40%, #0d0c14 100%);
    padding: 0 var(--pad) 0;
  }
  .cs__bokeh,
  .cs__beams,
  .cs__grain {
    position: absolute;
    pointer-events: none;
    z-index: -1;
  }
  /* soft out-of-focus lights, fixed in place (no frame loop) */
  .cs__bokeh {
    inset: -10% 0;
    opacity: 0.55;
    background:
      radial-gradient(circle at 8% 18%, rgba(255, 206, 120, 0.22) 0 2.2rem, transparent 2.6rem),
      radial-gradient(circle at 22% 64%, rgba(120, 160, 255, 0.16) 0 3.4rem, transparent 3.9rem),
      radial-gradient(circle at 78% 12%, rgba(255, 180, 200, 0.14) 0 1.6rem, transparent 1.9rem),
      radial-gradient(circle at 91% 46%, rgba(255, 214, 140, 0.18) 0 2.8rem, transparent 3.2rem),
      radial-gradient(circle at 64% 82%, rgba(140, 200, 255, 0.13) 0 4.2rem, transparent 4.8rem),
      radial-gradient(circle at 40% 34%, rgba(255, 240, 210, 0.08) 0 1.2rem, transparent 1.45rem),
      radial-gradient(circle at 52% 6%, rgba(255, 220, 160, 0.12) 0 2rem, transparent 2.4rem),
      radial-gradient(circle at 12% 92%, rgba(255, 200, 150, 0.12) 0 2.6rem, transparent 3rem);
    filter: blur(6px);
  }
  /* shafts of light through a window, like the MV's long shadows */
  .cs__beams {
    inset: 0 -15%;
    background:
      linear-gradient(104deg, transparent 22%, rgba(255, 232, 196, 0.07) 27%, transparent 33%),
      linear-gradient(104deg, transparent 46%, rgba(255, 232, 196, 0.05) 50%, transparent 55%),
      linear-gradient(104deg, transparent 63%, rgba(255, 232, 196, 0.06) 66%, transparent 71%);
    mix-blend-mode: screen;
  }
  .cs__grain {
    inset: 0;
    opacity: 0.07;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  /* letterbox bars */
  .cs__bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 0 calc(var(--pad) * -1);
    padding: 0 var(--pad);
    height: clamp(2rem, 5vh, 3rem);
    background: #000;
    color: var(--cs-faint);
    font-size: 0.6875rem;
    letter-spacing: 0.3em;
  }
  .cs__bar--foot {
    margin-top: clamp(4rem, 10vh, 7rem);
  }

  /* ---- title card ---- */
  .cs__head {
    position: relative;
    display: grid;
    justify-items: center;
    padding: clamp(4.5rem, 12vh, 8rem) 0 clamp(2.5rem, 7vh, 4.5rem);
    text-align: center;
  }
  /* the door left ajar — the series' 扉 — a slit of warm light behind the title */
  .cs__slit {
    position: absolute;
    top: 18%;
    bottom: 8%;
    left: 50%;
    width: 2px;
    transform: translateX(-50%);
    background: linear-gradient(180deg, transparent, rgba(255, 228, 180, 0.9) 30%, rgba(255, 228, 180, 0.9) 70%, transparent);
    box-shadow: 0 0 22px 6px rgba(255, 200, 120, 0.22), 0 0 70px 20px rgba(255, 190, 110, 0.08);
    z-index: -1;
    /* the words stand in front of the door: the light stops where they are */
    mask-image: linear-gradient(180deg, #000 0 26%, transparent 32% 82%, #000 90%);
  }
  .cs__title {
    margin: 0;
    font-family: var(--cs-mincho);
    font-weight: 400;
    font-size: clamp(2.2rem, 5.5vw, 3.8rem);
    letter-spacing: 0.55em;
    padding-left: 0.55em; /* the tracking after the last glyph, so it centres */
    line-height: 1.1;
    color: #fbf5e8;
    text-shadow: 0 0 30px rgba(0, 0, 0, 0.8);
  }
  .cs__kicker {
    margin: 0.9rem 0 0;
    font-family: var(--font-display);
    font-weight: 300;
    font-size: 0.8rem;
    letter-spacing: 0.7em;
    padding-left: 0.7em;
    color: var(--cs-dim);
  }

  /* ---- main scenes ---- */
  .cs__mains {
    position: relative;
    max-width: 72rem;
    margin: 0 auto;
  }
  .cs-orbit {
    position: absolute;
    left: -6%;
    width: 112%;
    top: 22%;
    height: auto;
    z-index: -1;
    overflow: visible;
    pointer-events: none;
  }
  .cs-orbit ellipse {
    fill: none;
    stroke: rgba(255, 236, 205, 0.16);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .cs-orbit .cs-orbit__far {
    stroke: rgba(160, 190, 255, 0.1);
  }
  .cs-orbit circle {
    fill: color-mix(in oklab, var(--c) 55%, #fff);
    filter: drop-shadow(0 0 6px var(--c)) drop-shadow(0 0 16px var(--c));
  }

  .cs-scene {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 0.92fr) auto minmax(0, 1fr);
    grid-template-areas: 'print quote info';
    align-items: center;
    gap: clamp(1.5rem, 3.5vw, 3.25rem);
    padding: clamp(3rem, 9vh, 6rem) 0;
  }
  .cs-scene--flip {
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 0.92fr);
    grid-template-areas: 'info quote print';
  }
  .cs-scene__glow,
  .cs-scene__amb {
    position: absolute;
    pointer-events: none;
    z-index: -1;
  }
  .cs-scene__glow {
    inset: 0 40% 0 -10%;
    background: radial-gradient(closest-side, color-mix(in oklab, var(--c) 30%, transparent), transparent);
    opacity: 0.55;
  }
  .cs-scene--flip .cs-scene__glow {
    inset: 0 -10% 0 40%;
  }
  /* colour art lends its own light to the set: the picture itself, out of focus */
  .cs-scene__amb {
    inset: 5% 45% 5% -5%;
    background-size: cover;
    background-position: center;
    filter: blur(48px) saturate(1.3);
    opacity: 0.32;
    mask-image: radial-gradient(closest-side, #000 30%, transparent);
  }
  .cs-scene--flip .cs-scene__amb {
    inset: 5% -5% 5% 45%;
  }
  .cs-scene__print {
    grid-area: print;
    justify-self: center;
    width: min(100%, 25rem);
  }
  .cs-quote {
    grid-area: quote;
    margin: 0;
    align-self: center;
  }
  .cs-info {
    grid-area: info;
    min-width: 0;
  }

  /* ---- the print ---- */
  .cs-print {
    position: relative;
    display: block;
    width: 100%;
    padding: 0.75rem 0.75rem 2.9rem;
    border: 0;
    border-radius: 2px;
    background: linear-gradient(180deg, #f5eedf, var(--cs-paper));
    box-shadow:
      0 34px 60px -24px rgba(0, 0, 0, 0.9),
      0 3px 8px rgba(0, 0, 0, 0.45);
    transform: rotate(var(--tilt));
    transition:
      transform 0.5s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 0.5s cubic-bezier(0.22, 1, 0.36, 1);
    cursor: pointer;
    text-align: left;
  }
  @media (hover: hover) {
    .cs-print:hover {
      transform: rotate(0deg) translateY(-6px);
      box-shadow:
        0 44px 70px -24px rgba(0, 0, 0, 0.95),
        0 0 0 1px color-mix(in oklab, var(--c) 60%, transparent),
        0 0 40px -6px color-mix(in oklab, var(--c) 55%, transparent);
    }
  }
  .cs-print:focus-visible {
    outline: 2px solid color-mix(in oklab, var(--c) 60%, #fff);
    outline-offset: 6px;
  }
  .cs-pic {
    position: relative;
    display: block;
    aspect-ratio: 4 / 5;
    overflow: hidden;
    isolation: isolate; /* the duotone blends with this box only */
    background: #15151d;
  }
  .cs-pic img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  /* duotone: ink becomes a deep shade of the character's colour, paper turns warm */
  .cs-pic.is-mono {
    background: color-mix(in oklab, var(--c) 58%, #06060c);
  }
  .cs-pic.is-mono img {
    filter: grayscale(1) contrast(1.12) brightness(1.04);
    mix-blend-mode: screen;
  }
  .cs-pic.is-mono::after {
    content: '';
    position: absolute;
    inset: 0;
    background: #f3e3c3;
    mix-blend-mode: multiply;
  }
  /* a light leak from the corner, as on the MV's photos */
  .cs-pic__leak {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background:
      radial-gradient(110% 70% at 100% 0%, rgba(255, 168, 86, 0.34), transparent 56%),
      linear-gradient(205deg, rgba(255, 220, 160, 0.16), transparent 42%);
    mix-blend-mode: screen;
  }
  .cs-pic__ph {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 5rem;
    color: color-mix(in oklab, var(--c) 50%, #fff);
  }
  /* the name written on the print's margin */
  .cs-cap {
    position: absolute;
    left: 1rem;
    bottom: 0.55rem;
    font-family: var(--cs-hand);
    font-size: 1.45rem;
    line-height: 1;
    color: #2a2833;
    transform: rotate(-2.5deg);
    transform-origin: left bottom;
  }
  /* washi tape */
  .cs-tape {
    position: absolute;
    z-index: 2;
    width: 5.6rem;
    height: 1.55rem;
    background:
      repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.12) 0 2px, transparent 2px 7px),
      rgba(232, 222, 192, 0.66);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    pointer-events: none;
  }
  .cs-tape--a {
    top: -0.75rem;
    left: 10%;
    transform: rotate(-7deg);
  }
  .cs-tape--b {
    top: -0.6rem;
    right: 8%;
    transform: rotate(5deg);
    background:
      repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.12) 0 2px, transparent 2px 7px),
      color-mix(in oklab, var(--c) 30%, rgba(232, 222, 192, 0.7));
  }
  .cs-tape--pin {
    top: -0.65rem;
    left: 50%;
    width: 4.2rem;
    height: 1.3rem;
    transform: translateX(-50%) rotate(-3deg);
  }

  /* ---- the line, set like the MV's subtitles ---- */
  .cs-quote p {
    margin: 0;
    writing-mode: vertical-rl;
    max-inline-size: 15em;
    font-family: var(--cs-mincho);
    font-size: clamp(1.05rem, 1.55vw, 1.3rem);
    line-height: 1.95;
    letter-spacing: 0.14em;
    color: #f7f0e1;
    text-shadow: 0 0 16px rgba(0, 0, 0, 0.75);
    word-break: auto-phrase;
    line-break: strict;
  }
  .cs-quote__who {
    display: block;
    margin-block-end: 0.35em;
    font-size: 0.68em;
    letter-spacing: 0.2em;
    color: color-mix(in oklab, var(--c) 45%, #fff);
  }

  /* ---- the words ---- */
  .cs-info__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0;
    margin: 0;
    font-size: 0.6875rem;
    letter-spacing: 0.22em;
    color: var(--cs-faint);
  }
  .cs-info__meta span + span::before {
    content: '—';
    margin: 0 0.7em;
    opacity: 0.6;
  }
  .cs-info__meta span:first-child {
    color: color-mix(in oklab, var(--c) 50%, #fff);
  }
  .cs-info__name {
    margin: 0.5rem 0 0;
    font-family: var(--cs-mincho);
    font-weight: 400;
    font-size: clamp(2.5rem, 5.6vw, 4.6rem);
    letter-spacing: 0.16em;
    line-height: 1.12;
    color: #fbf5e8;
  }
  .cs-info__en {
    margin: 0.55rem 0 0;
    font-family: var(--font-display);
    font-weight: 300;
    font-size: 0.8rem;
    letter-spacing: 0.6em;
    text-transform: uppercase;
    color: color-mix(in oklab, var(--c) 45%, #fff);
  }
  .cs-info__real {
    margin: 0.9rem 0 0;
    font-size: 0.9rem;
    color: var(--cs-faint);
  }
  .cs-info__real .mono {
    margin-right: 0.6em;
    font-size: 0.6875rem;
    letter-spacing: 0.2em;
  }
  .cs-info__bio {
    margin-top: 1.5rem;
    max-width: 34em;
    font-size: 1rem;
    line-height: 2;
    color: var(--cs-dim);
  }
  .cs-info__bio :global(p) {
    margin: 0;
  }
  .cs-info__bio :global(p + p) {
    margin-top: 0.8em;
  }
  .cs-info__open {
    display: inline-flex;
    align-items: center;
    gap: 0.6em;
    min-height: 44px;
    margin-top: 1.6rem;
    padding: 0 1.3rem;
    border: 1px solid color-mix(in oklab, var(--c) 65%, rgba(255, 255, 255, 0.4));
    border-radius: 999px;
    background: transparent;
    color: var(--cs-text);
    font-size: 0.6875rem;
    letter-spacing: 0.22em;
    cursor: pointer;
    transition: background 0.3s, border-color 0.3s;
  }
  @media (hover: hover) {
    .cs-info__open:hover {
      background: color-mix(in oklab, var(--c) 28%, transparent);
    }
  }
  .cs-info__open:focus-visible {
    outline: 2px solid color-mix(in oklab, var(--c) 60%, #fff);
    outline-offset: 3px;
  }

  /* ---- the rest of the cast, pinned in a row ---- */
  .cs-crew {
    max-width: 72rem;
    margin: clamp(2rem, 6vh, 4rem) auto 0;
  }
  .cs-crew__head {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 0 0 clamp(2.5rem, 6vh, 3.5rem);
    font-size: 0.6875rem;
    letter-spacing: 0.3em;
    color: var(--cs-faint);
  }
  .cs-crew__rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(239, 231, 214, 0.35), rgba(239, 231, 214, 0.05));
  }
  .cs-crew__row {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: clamp(2.25rem, 5vh, 3rem) clamp(1.5rem, 3vw, 2.75rem);
  }
  .cs-crew__item {
    width: clamp(9rem, 13vw, 11.5rem);
  }
  .cs-print--pin {
    padding: 0.5rem 0.5rem 2.25rem;
  }
  .cs-print--pin .cs-cap {
    left: 0.75rem;
    bottom: 0.45rem;
    font-size: 1.12rem;
  }
  /* role over age, each on its own line — joined, a long age wrapped mid-phrase */
  .cs-crew__role {
    display: grid;
    gap: 0.3rem;
    margin: 1rem 0 0;
    font-size: 0.6875rem;
    letter-spacing: 0.14em;
    line-height: 1.5;
    color: var(--cs-dim);
    text-align: center;
  }
  .cs-crew__role span + span {
    color: var(--cs-faint);
    letter-spacing: 0.08em;
    text-wrap: balance; /* 「13歳・中学1年 → 16歳・高校1年」 breaks in two even halves, not one orphan 年 */
  }

  /* ---- narrow screens: print and line side by side, the words under them ---- */
  @media (max-width: 860px) {
    .cs-scene,
    .cs-scene--flip {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'print quote'
        'info info';
      gap: 1.75rem 1.1rem;
    }
    .cs-scene--flip {
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-areas:
        'quote print'
        'info info';
    }
    .cs-scene__print {
      width: min(100%, 19rem);
    }
    .cs-scene__glow,
    .cs-scene--flip .cs-scene__glow {
      inset: -5% -10% 30% -10%;
    }
    .cs-scene__amb,
    .cs-scene--flip .cs-scene__amb {
      inset: 0 0 35% 0;
    }
    .cs-quote p {
      max-inline-size: 13em;
      font-size: 1.02rem;
    }
    .cs-orbit {
      top: 8%;
    }
    .cs-crew__item {
      width: calc(50% - 0.9rem);
      max-width: 11rem;
    }
    .cs-crew__row {
      gap: 2.25rem 1.25rem;
    }
  }
</style>
