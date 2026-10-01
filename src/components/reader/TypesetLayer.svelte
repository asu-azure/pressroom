<script lang="ts">
  /**
   * Translations lettered into the balloons — the reader's typeset mode.
   *
   * The fit (lib/typeset.ts) is computed once in the page's own pixels and
   * drawn in units of the page's height (`1cqh` of this layer, which is
   * exactly the page's contain rect), so it looks the same at any screen size
   * or zoom with nothing to re-measure. The layer is self-contained — its root
   * is its own size container and no rule depends on a `.si` ancestor —
   * because the page curl clones it into the turning leaf (scripts/curl.ts).
   *
   * Never interactive: no `data-bub`, `pointer-events: none`, so a tap still
   * turns the page and a long-press still marks a favourite.
   */
  import { fitBubble } from '../../lib/typeset';
  import type { Bubble } from '../../lib/types';

  let { bubbles, pw, ph }: { bubbles: Bubble[]; pw: number; ph: number } = $props();

  // 'prose' (a novel page's whole text) gets its own renderer with the novel translation
  const fits = $derived(
    bubbles.filter((b) => b.kind !== 'prose' && b.text.trim()).map((b) => ({ b, fit: fitBubble(b, pw, ph) })),
  );
</script>

<div class="ts" lang="ja" aria-hidden={fits.length ? undefined : 'true'}>
  <!-- First every patch of original lettering is painted out, so a balloon's
       text sits on a clean balloon with its own outline intact. -->
  {#each fits as { b } (b.id)}
    {#each b.cover ?? [] as [cx, cy, cw, ch], ci (ci)}
      <span
        class="ts__cover"
        class:is-dark={b.dark}
        style={`left:${cx * 100}%;top:${cy * 100}%;width:${cw * 100}%;height:${ch * 100}%`}
      ></span>
    {/each}
  {/each}
  {#each fits as { b, fit } (b.id)}
    <div
      class="ts__b ts__b--{b.shape ?? 'ellipse'}"
      class:is-covered={Boolean(b.cover?.length)}
      class:is-dark={b.dark}
      class:is-overflow={fit.overflow}
      style={`left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%;--fs:${fit.fs};--pitch:${fit.pitch}`}
    >
      <span class="ts__t" class:is-h={fit.dir === 'h'}>
        {#each fit.lines as line, li (li)}
          <span class="ts__l">{#each line as piece, pi (pi)}{#if piece.tcy}<span class="ts__tcy">{piece.t}</span>{:else}{piece.t}{/if}{/each}</span>
        {/each}
      </span>
    </div>
  {/each}
</div>

<style>
  .ts {
    position: absolute;
    inset: 0;
    container-type: size;
    pointer-events: none;
    font-family: var(--font-typeset, 'Yu Mincho', 'Hiragino Mincho ProN', 'Noto Serif CJK JP', serif);
    font-weight: 600;
    font-kerning: normal;
    /* iOS inflates text in landscape unless told not to */
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
    /* no transitions on bubbles at rest: dozens per spread, restyled every turn */
  }
  .ts__b {
    position: absolute;
    display: grid;
    place-items: center;
    color: #111;
  }
  /* The fill reaches a little past the box (bleed), so a rect drawn a touch
     inside the balloon still covers the Thai lettering's edge. */
  .ts__b::before {
    content: '';
    position: absolute;
    inset: -4%;
    background: var(--ts-fill, #fff);
  }
  .ts__b--ellipse::before {
    /* soft edge: hides the original lettering without a blur filter */
    background: radial-gradient(closest-side, var(--ts-fill, #fff) 94%, transparent 100%);
  }
  .ts__b--round::before {
    border-radius: 22%;
  }
  .ts__b--none::before,
  .ts__b.is-covered::before {
    content: none; /* the cover patches did the painting */
  }
  /* A patch over the original lettering: the balloon's own paper colour, a
     touch rounded so its corner never nicks a curved outline. */
  .ts__cover {
    position: absolute;
    background: #fff;
    border-radius: 0.4cqh;
  }
  .ts__cover.is-dark {
    background: #000;
  }
  .ts__b--none .ts__t {
    text-shadow:
      0 0 0.12em #fff,
      0 0 0.12em #fff,
      0 0 0.25em #fff;
  }
  .ts__b.is-dark {
    --ts-fill: #000;
    color: #f4f1ea;
  }
  .ts__b--none.is-dark .ts__t {
    text-shadow:
      0 0 0.12em #111,
      0 0 0.12em #111,
      0 0 0.25em #111;
  }
  .ts__t {
    position: relative;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    font-size: calc(var(--fs) * 1cqh);
    line-height: var(--pitch);
    /* columns start on one line (天揃え), the block is centred by the grid */
    text-align: start;
    white-space: nowrap;
  }
  .ts__t.is-h {
    writing-mode: horizontal-tb;
  }
  .ts__l {
    display: block;
  }
  .ts__tcy {
    text-combine-upright: all;
  }
  .ts__t.is-h .ts__tcy {
    text-combine-upright: none;
  }
</style>
