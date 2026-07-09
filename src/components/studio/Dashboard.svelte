<script lang="ts">
  import { supabase } from '../../lib/supabase';
  import { requireSession, watchSignOut } from '../../lib/authGuard';
  import type { Work } from '../../lib/types';

  let works = $state<Work[] | null>(null);
  let error = $state<string | null>(null);
  let creating = $state(false);
  let newTitle = $state('');

  $effect(() => {
    void init();
  });

  async function init() {
    if (!(await requireSession())) return;
    watchSignOut();
    await load();
  }

  async function load() {
    const { data, error: err } = await supabase
      .from('works')
      .select('*')
      .order('updated_at', { ascending: false });
    if (err) error = err.message;
    else works = data as Work[];
  }

  function slugify(title: string): string {
    const base = title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '');
    return base || `work-${Date.now().toString(36)}`;
  }

  async function createWork(e: SubmitEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    creating = true;
    const { data, error: err } = await supabase
      .from('works')
      .insert({ title: newTitle.trim(), slug: slugify(newTitle) })
      .select()
      .single();
    creating = false;
    if (err) {
      error = err.message;
      return;
    }
    location.href = `/studio/work/${(data as Work).id}`;
  }

  async function togglePublish(work: Work) {
    const { error: err } = await supabase
      .from('works')
      .update({ published: !work.published })
      .eq('id', work.id);
    if (err) error = err.message;
    else await load();
  }

  async function remove(work: Work) {
    if (!confirm(`Delete "${work.title}" and all its pages? This cannot be undone.`)) return;
    // Page images stay in storage (cheap); rows cascade with the work.
    const { error: err } = await supabase.from('works').delete().eq('id', work.id);
    if (err) error = err.message;
    else await load();
  }

  async function signOut() {
    await supabase.auth.signOut();
  }
</script>

<div class="dash">
  <header class="dash__head">
    <div>
      <a class="mono dash__site" href="/">← LIBRARY</a>
      <p class="mono">ASU AZURE · STUDIO</p>
      <h1 class="serif dash__title">Pressroom desk</h1>
    </div>
    <button class="mono dash__signout" onclick={signOut}>SIGN OUT</button>
  </header>

  <form class="dash__new" onsubmit={createWork}>
    <input
      type="text"
      bind:value={newTitle}
      placeholder="Title of a new work…"
      aria-label="New work title"
    />
    <button class="mono" type="submit" disabled={creating}>+ NEW WORK</button>
  </form>

  {#if error}
    <p class="mono dash__error">{error}</p>
  {/if}

  {#if works === null}
    <p class="mono">LOADING…</p>
  {:else if works.length === 0}
    <p class="mono">NO WORKS YET — CREATE ONE ABOVE.</p>
  {:else}
    <ul class="dash__list">
      {#each works as work (work.id)}
        <li class="dash__row">
          <a class="dash__work" href={`/studio/work/${work.id}`}>
            <span class="serif dash__workTitle">{work.title}</span>
            <span class="mono dash__workMeta">
              /{work.slug} · {work.direction.toUpperCase()} · {work.status.toUpperCase()}
            </span>
          </a>
          <div class="dash__actions">
            <button
              class="mono dash__pub"
              class:is-live={work.published}
              onclick={() => togglePublish(work)}
            >
              {work.published ? '● LIVE' : '○ DRAFT'}
            </button>
            <a class="mono" href={`/w/${work.slug}`} target="_blank" rel="noopener">VIEW ↗</a>
            <button class="mono dash__del" onclick={() => remove(work)}>DELETE</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dash {
    display: grid;
    gap: clamp(1.6rem, 4vh, 2.4rem);
    max-width: 900px;
  }
  .dash__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1rem;
  }
  .dash__title {
    font-size: clamp(2rem, 5vw, 3rem);
    margin-top: 0.4rem;
  }
  .dash__site {
    display: inline-block;
    margin-bottom: 0.9rem;
    color: var(--fg-faint);
  }
  .dash__site:hover {
    color: var(--accent);
  }
  .dash__signout,
  .dash__pub,
  .dash__del,
  .dash__new button {
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    padding: 0.55em 1em;
    cursor: pointer;
    transition: color 0.25s var(--ease), border-color 0.25s var(--ease);
  }
  .dash__signout:hover,
  .dash__pub:hover,
  .dash__new button:hover {
    color: var(--fg);
    border-color: var(--fg-dim);
  }
  .dash__new {
    display: flex;
    gap: 0.7rem;
  }
  .dash__new input {
    flex: 1;
    background: var(--bg-soft);
    border: 1px solid var(--line-strong);
    color: var(--fg);
    font: inherit;
    padding: 0.65em 0.9em;
  }
  .dash__new input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .dash__error {
    color: #e8a31a;
  }
  .dash__list {
    list-style: none;
    display: grid;
  }
  .dash__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--line);
  }
  .dash__work {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
  }
  .dash__workTitle {
    font-size: 1.25rem;
  }
  .dash__work:hover .dash__workTitle {
    color: var(--accent);
  }
  .dash__actions {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    flex-shrink: 0;
  }
  .dash__actions a:hover {
    color: var(--accent);
  }
  .dash__pub.is-live {
    color: var(--accent);
    border-color: var(--accent);
  }
  .dash__del:hover {
    color: #e8a31a;
    border-color: #e8a31a;
  }
  @media (max-width: 700px) {
    .dash__row {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
