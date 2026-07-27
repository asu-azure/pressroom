<script lang="ts">
  import { i18n } from '../../lib/i18n.svelte';
  import LangBar from './LangBar.svelte';
</script>

<LangBar />

<!-- The island owns its own layout: the Astro shell is just the ink spread, so
     nothing here depends on astro-island resolving to display:contents. -->
<div class="nf">
  <p class="mono">{i18n.t('nf.kicker')}</p>
  <h1 class="mega">404</h1>
  <p class="serif nf__sub">{i18n.t('nf.title')}</p>
  <a class="mono nf__back" href="/" data-magnetic>← {i18n.t('nf.back')}</a>
</div>

<style>
  .nf {
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1rem;
    padding: var(--pad);
  }
  .nf__sub {
    color: var(--fg-dim);
    font-size: 1.1rem;
  }
  .nf__back {
    margin-top: 1.5rem;
    display: inline-block;
    align-self: flex-start;
  }
  .nf__back:hover {
    color: var(--accent);
  }
</style>
