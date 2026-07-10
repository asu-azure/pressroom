<script lang="ts">
  import { gsap } from 'gsap';
  import { supabase } from '../../lib/supabase';
  import { saveUnlock } from '../../lib/persistence';
  import { i18n } from '../../lib/i18n.svelte';
  import type { PageRow, Work } from '../../lib/types';

  let {
    work,
    onUnlocked,
    onClose,
  }: {
    work: Work;
    /** Receives the full page rows the RPC returned — the caller replaces its
        pages state so thumbnails/reading appear without a reload. */
    onUnlocked: (rows: PageRow[]) => void;
    onClose: () => void;
  } = $props();

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let frame: HTMLElement;
  let backdrop: HTMLElement;
  let inputEl: HTMLInputElement | undefined = $state();
  let password = $state('');
  let wrong = $state(false);
  let busy = $state(false);
  let lastFocus: Element | null = null;

  $effect(() => {
    lastFocus = document.activeElement;
    inputEl?.focus();
    if (!reduced) {
      gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out' });
      gsap.fromTo(
        frame,
        { opacity: 0, y: 14, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'power3.out' },
      );
    }
    return () => {
      (lastFocus as HTMLElement | null)?.focus?.();
    };
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy || !password) return;
    busy = true;
    wrong = false;
    const { data, error } = await supabase.rpc('unlock_pages', {
      p_work_id: work.id,
      p_password: password,
    });
    busy = false;
    // A locked published work always has pages — empty means wrong password.
    if (error || !data?.length) {
      wrong = true;
      if (!reduced && frame) {
        gsap.fromTo(
          frame,
          { x: -7 },
          { x: 0, duration: 0.45, ease: 'elastic.out(1.4, 0.28)' },
        );
      }
      inputEl?.select();
      return;
    }
    saveUnlock(work.id, password);
    onUnlocked(data as PageRow[]);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="lg" role="dialog" aria-modal="true" aria-label={`${i18n.t('lock.title')} — ${work.title}`}>
  <button class="lg__backdrop" bind:this={backdrop} aria-label={i18n.t('cast.close')} onclick={onClose}></button>

  <form class="lg__frame" bind:this={frame} onsubmit={submit}>
    <span class="bracket bracket--tl" aria-hidden="true"></span>
    <span class="bracket bracket--br" aria-hidden="true"></span>

    <p class="mono lg__title"><span class="lg__keyGlyph" aria-hidden="true">🗝</span> {i18n.t('lock.title')} · LOCKED</p>
    <p class="serif lg__work">{work.title}</p>

    {#if work.password_hint}
      <p class="mono lg__hint">
        <span class="lg__hintLabel">{i18n.t('lock.hint')} —</span>
        {work.password_hint}
      </p>
    {/if}

    <label class="lg__field">
      <span class="mono lg__fieldLabel">{i18n.t('lock.enter')}</span>
      <input
        bind:this={inputEl}
        type="password"
        bind:value={password}
        autocomplete="off"
        spellcheck="false"
        class:is-wrong={wrong}
      />
    </label>

    {#if wrong}
      <p class="mono lg__wrong" role="alert">✕ {i18n.t('lock.wrong')}</p>
    {/if}

    <button class="mono lg__unlock" type="submit" disabled={busy || !password}>
      {busy ? '…' : `${i18n.t('lock.unlock')} →`}
    </button>
  </form>
</div>

<style>
  .lg {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    padding: clamp(1rem, 4vw, 2.5rem);
  }
  .lg__backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    cursor: pointer;
    background: rgba(8, 8, 10, 0.72);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
  /* The gate is always an ink object, like the CAST FILE. */
  .lg__frame {
    position: relative;
    z-index: 1;
    width: min(26rem, 100%);
    display: grid;
    gap: 0.9rem;
    padding: clamp(1.4rem, 4vw, 2rem);
    background: var(--ink-bg, #0c0c0d);
    color: var(--ink-fg, #f4f1ea);
    border: 1px solid rgba(244, 241, 234, 0.16);
  }
  .lg__title {
    color: var(--accent);
    letter-spacing: 0.22em;
  }
  .lg__keyGlyph {
    margin-right: 0.2em;
  }
  .lg__work {
    font-size: clamp(1.15rem, 2.4vw, 1.45rem);
    line-height: 1.3;
  }
  .lg__hint {
    font-size: 0.62rem;
    line-height: 1.7;
    color: rgba(244, 241, 234, 0.6);
  }
  .lg__hintLabel {
    color: #e8a31a;
    letter-spacing: 0.2em;
  }
  .lg__field {
    display: grid;
    gap: 0.4rem;
  }
  .lg__fieldLabel {
    font-size: 0.55rem;
    color: rgba(244, 241, 234, 0.45);
  }
  .lg__field input {
    background: #101012;
    border: 1px solid rgba(244, 241, 234, 0.22);
    color: #f4f1ea;
    font: inherit;
    letter-spacing: 0.3em;
    padding: 0.7em 0.9em;
  }
  .lg__field input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .lg__field input.is-wrong {
    border-color: #e8a31a;
  }
  .lg__wrong {
    font-size: 0.6rem;
    color: #e8a31a;
  }
  .lg__unlock {
    justify-self: start;
    background: var(--accent);
    color: var(--ink-fg, #f4f1ea);
    border: 0;
    padding: 0.85em 1.5em;
    letter-spacing: 0.14em;
    cursor: pointer;
    transition: background-color 0.25s var(--ease);
  }
  .lg__unlock:hover:not(:disabled) {
    background: #1d33c4;
  }
  .lg__unlock:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
