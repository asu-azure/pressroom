<script lang="ts">
  import type { PageRec } from '../../lib/types';

  let {
    page,
    sizes,
    eager = false,
    alt,
  }: { page: PageRec; sizes: string; eager?: boolean; alt: string } = $props();

  let loaded = $state(false);
</script>

<!-- Thumb paints instantly (blurred) behind the real image fading in. -->
<span class="si" style={`aspect-ratio: ${page.width} / ${page.height};`}>
  <img class="si__thumb" src={page.thumbUrl} alt="" aria-hidden="true" draggable="false" />
  <img
    class="si__img"
    class:is-loaded={loaded}
    src={page.medUrl}
    srcset={`${page.medUrl} 900w, ${page.fullUrl} 1600w`}
    {sizes}
    {alt}
    decoding="async"
    loading={eager ? 'eager' : 'lazy'}
    draggable="false"
    onload={() => (loaded = true)}
  />
</span>

<style>
  .si {
    position: relative;
    display: block;
    overflow: hidden;
    background: #101012;
    max-width: 100%;
    max-height: 100%;
  }
  .si__thumb,
  .si__img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
  .si__thumb {
    filter: blur(14px);
    transform: scale(1.04);
  }
  .si__img {
    opacity: 0;
    transition: opacity 0.3s var(--ease);
  }
  .si__img.is-loaded {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .si__img {
      transition: none;
    }
  }
</style>
