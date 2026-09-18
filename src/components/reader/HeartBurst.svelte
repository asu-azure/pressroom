<!--
  "ここすき" heart burst, shown where a page was long-pressed.
  Adapted from comimi's favorite-burst (https://github.com/yui540/comimi):
  same choreography (a ring, a popping heart, five hearts drifting up),
  re-tuned to the reader's amber and run for 1.6 s instead of 2 s.

  MIT License — Copyright (c) 2026 yui540

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
-->
<script lang="ts">
  let { x, y }: { x: number; y: number } = $props();

  const HEART =
    'M16.2857 3.2998C14.5714 3.2998 13.0476 4.05958 12 5.29422C10.9524 4.05958 9.33333 3.2998 7.61905 3.2998C4.57143 3.2998 2 5.86405 2 8.90316C2 9.0931 2 9.28304 2 9.47299C2.38095 14.1266 7.33333 18.0205 10.2857 19.8249C10.7619 20.1099 11.3333 20.2998 12 20.2998C12.5714 20.2998 13.1429 20.1099 13.7143 19.8249C16.6667 17.9255 21.619 14.1266 22 9.47299C22 9.28304 22 9.0931 22 8.90316C22 5.86405 19.4286 3.2998 16.2857 3.2998Z';
  // [x, y, rotate, delay] for the five drifting hearts
  const decos = [
    ['-100%', '60%', '-10deg', '0.7s'],
    ['-150%', '60%', '-20deg', '0.3s'],
    ['80%', '60%', '10deg', '0.55s'],
    ['120%', '60%', '20deg', '0.4s'],
    ['-10%', '20%', '-4deg', '0.85s'],
  ];
</script>

<div class="hb" style={`left:${x}px; top:${y}px`} aria-hidden="true">
  {#each decos as [dx, dy, r, d]}
    <div class="hb__deco" style={`animation-delay:${d}`}>
      <svg viewBox="0 0 24 25" class="hb__decoHeart" style={`--x:${dx}; --y:${dy}; --r:${r}; animation-delay:${d}`}>
        <path d={HEART} />
      </svg>
    </div>
  {/each}
  <svg viewBox="0 0 24 25" class="hb__ring"><path d={HEART} /></svg>
  <svg viewBox="0 0 24 25" class="hb__fill"><path d={HEART} /></svg>
</div>

<style>
  .hb {
    position: fixed;
    z-index: 70;
    width: 2.4rem;
    height: 2.4rem;
    translate: -50% -50%;
    scale: 1.4;
    pointer-events: none;
    animation: hb-fade 0.4s ease-out 1.2s both;
  }
  .hb svg {
    display: block;
    overflow: visible;
  }
  .hb__deco {
    position: absolute;
    top: 15%;
    left: 15%;
    width: 70%;
    height: 70%;
    opacity: 0;
    animation: hb-fly 0.8s cubic-bezier(0.64, 0.08, 1, 0.97) both;
  }
  .hb__decoHeart {
    width: 100%;
    fill: var(--mk-love);
    animation: hb-move 0.8s cubic-bezier(0, 0.31, 0.18, 0.99) both;
  }
  .hb__ring {
    position: absolute;
    inset: 0;
    width: 100%;
    fill: none;
    stroke: var(--mk-love);
    stroke-width: 0.1px;
    transform-box: fill-box;
    transform-origin: center;
    animation: hb-ring 1s cubic-bezier(0.71, 0, 0.23, 0.99) 0.2s both;
  }
  .hb__fill {
    position: absolute;
    top: 5.3%;
    left: 0;
    width: 100%;
    height: 100%;
    fill: var(--mk-love);
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.45));
    transform-box: fill-box;
    transform-origin: center;
    animation: hb-pop 0.7s ease-in-out 0.15s both;
  }
  @keyframes hb-fade {
    to { opacity: 0; }
  }
  @keyframes hb-fly {
    from, to { opacity: 0; }
    30%, 70% { opacity: 0.7; }
    from { transform: translateY(0); }
    to { transform: translateY(-200%); }
  }
  @keyframes hb-move {
    to { transform: translate(var(--x), var(--y)) rotate(var(--r)); }
  }
  @keyframes hb-ring {
    from, to { opacity: 0; }
    50% { opacity: 1; }
    from { transform: translateY(4%) scale(1); }
    to { transform: translateY(4%) scale(1.8); }
  }
  @keyframes hb-pop {
    0% { transform: scale(0); }
    40% { transform: scale(1.6); }
    60% { transform: scale(1.04); }
    80% { transform: scale(1.1); }
    100% { transform: scale(1.04); }
  }
  /* Reduced motion: one still heart that fades — the toast carries the message. */
  @media (prefers-reduced-motion: reduce) {
    .hb__deco, .hb__ring { display: none; }
    .hb__fill { animation: none; }
  }
</style>
