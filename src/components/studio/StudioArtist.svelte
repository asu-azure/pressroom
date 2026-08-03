<script lang="ts">
  /**
   * Studio → ARTIST. Edits the /asu page: the singleton artist_profile row and
   * the artworks gallery. Same shape as WorkEditor (tabs, authGuard for UX, RLS
   * as the real boundary).
   *
   * Unlike work deletion, deleting an artwork ALSO removes its storage objects —
   * a gallery is churned through far more than a published book, and the three
   * paths are known without listing the bucket.
   */
  import { dndzone } from 'svelte-dnd-action';
  import { generateKeyBetween } from 'fractional-indexing';
  import { supabase } from '../../lib/supabase';
  import { requireSession, watchSignOut } from '../../lib/authGuard';
  import { ART_BUCKET, artUrl } from '../../lib/storagePaths';
  import { uploadArtworkImages, uploadPortrait, uploadBioImage, artworkPaths } from '../../lib/artImage';
  import RichTextEditor from './RichTextEditor.svelte';
  import type { ArtistProfile, ArtworkRow } from '../../lib/types';

  const FLIP_MS = 180;

  let tab = $state<'profile' | 'gallery'>('profile');
  let ready = $state(false);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);

  // --- profile ---------------------------------------------------------------
  let profile = $state({
    display_name: '',
    bio: '',
    portrait_path: null as string | null,
    craftText: '',
    x: '',
    x_handle: '',
    email: '',
    commissions_open: false,
  });
  let savingProfile = $state(false);
  let portraitBusy = $state(false);

  // --- gallery ---------------------------------------------------------------
  let items = $state<ArtworkRow[]>([]);
  let uploading = $state(false);
  let uploadDone = $state(0);
  let uploadTotal = $state(0);
  let editingId = $state<string | null>(null);

  $effect(() => {
    void init();
  });

  async function init() {
    if (!(await requireSession())) return;
    watchSignOut();
    await Promise.all([loadProfile(), loadGallery()]);
    ready = true;
  }

  async function loadProfile() {
    const { data, error: err } = await supabase.from('artist_profile').select('*').eq('id', 1).single();
    if (err) {
      error = err.message;
      return;
    }
    const row = data as ArtistProfile;
    profile = {
      display_name: row.display_name ?? '',
      bio: row.bio ?? '',
      portrait_path: row.portrait_path,
      craftText: (row.craft ?? []).join('\n'),
      x: row.links?.x ?? '',
      x_handle: row.links?.x_handle ?? '',
      email: row.links?.email ?? '',
      commissions_open: row.commissions_open ?? false,
    };
  }

  async function loadGallery() {
    const { data, error: err } = await supabase
      .from('artworks')
      .select('*')
      .order('sort_key', { ascending: true });
    if (err) error = err.message;
    else items = data as ArtworkRow[];
  }

  function flash(msg: string) {
    notice = msg;
    setTimeout(() => (notice = null), 2400);
  }

  async function saveProfile() {
    savingProfile = true;
    error = null;
    const { error: err } = await supabase
      .from('artist_profile')
      .update({
        display_name: profile.display_name.trim() || 'Asu Azure',
        bio: profile.bio,
        portrait_path: profile.portrait_path,
        craft: profile.craftText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
        links: { x: profile.x.trim(), x_handle: profile.x_handle.trim(), email: profile.email.trim() },
        commissions_open: profile.commissions_open,
      })
      .eq('id', 1);
    savingProfile = false;
    if (err) error = err.message;
    else flash('PROFILE SAVED');
  }

  async function onPickPortrait(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    portraitBusy = true;
    error = null;
    try {
      profile.portrait_path = await uploadPortrait(file);
      flash('PORTRAIT UPLOADED — SAVE TO KEEP');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      portraitBusy = false;
    }
  }

  // --- gallery upload --------------------------------------------------------

  async function onPickArtworks(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])].filter((f) => f.type.startsWith('image/'));
    input.value = '';
    if (!files.length) return;

    uploading = true;
    uploadDone = 0;
    uploadTotal = files.length;
    error = null;

    // Sequential like the PDF import: one artwork fully committed before the
    // next starts, so an interrupted batch leaves no half-state.
    for (const file of files) {
      const id = crypto.randomUUID();
      try {
        const up = await uploadArtworkImages(file, id);
        const last = items[items.length - 1];
        const { data, error: err } = await supabase
          .from('artworks')
          .insert({
            id,
            title: file.name.replace(/\.[^.]+$/, ''),
            sort_key: generateKeyBetween(last?.sort_key ?? null, null),
            width: up.width,
            height: up.height,
            image_path: up.imagePath,
            med_path: up.medPath,
            thumb_path: up.thumbPath,
          })
          .select()
          .single();
        if (err) {
          // Row failed — don't leave the three uploaded files orphaned.
          await supabase.storage.from(ART_BUCKET).remove([up.imagePath, up.medPath, up.thumbPath]);
          throw new Error(err.message);
        }
        items = [...items, data as ArtworkRow];
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        break;
      }
      uploadDone += 1;
    }
    uploading = false;
  }

  // --- gallery mutations ----------------------------------------------------

  function handleConsider(e: CustomEvent<{ items: ArtworkRow[] }>) {
    items = e.detail.items;
  }

  /**
   * Persist a drag as ONE row update: the moved artwork gets a fractional key
   * between its new neighbours. Never renumbers the list.
   */
  async function handleFinalize(e: CustomEvent<{ items: ArtworkRow[]; info: { id: string } }>) {
    items = e.detail.items;
    const movedId = e.detail.info?.id;
    const i = items.findIndex((a) => a.id === movedId);
    if (i === -1) return;
    const prev = items[i - 1]?.sort_key ?? null;
    const next = items[i + 1]?.sort_key ?? null;
    let key: string;
    try {
      key = generateKeyBetween(prev, next);
    } catch {
      // Neighbours somehow collide — fall back to reloading the true order.
      await loadGallery();
      return;
    }
    items[i] = { ...items[i], sort_key: key };
    const { error: err } = await supabase.from('artworks').update({ sort_key: key }).eq('id', movedId);
    if (err) {
      error = err.message;
      await loadGallery();
    }
  }

  async function patch(art: ArtworkRow, fields: Partial<ArtworkRow>) {
    const { error: err } = await supabase.from('artworks').update(fields).eq('id', art.id);
    if (err) {
      error = err.message;
      return;
    }
    items = items.map((a) => (a.id === art.id ? { ...a, ...fields } : a));
  }

  /** Featured is exclusive — /asu shows exactly one big editorial piece. */
  async function setFeatured(art: ArtworkRow) {
    const turningOn = !art.featured;
    if (turningOn) {
      const others = items.filter((a) => a.featured && a.id !== art.id);
      for (const o of others) await patch(o, { featured: false });
    }
    await patch(art, { featured: turningOn });
  }

  async function remove(art: ArtworkRow) {
    if (!confirm(`Delete "${art.title || 'untitled'}"? The image files are removed too.`)) return;
    const { error: err } = await supabase.from('artworks').delete().eq('id', art.id);
    if (err) {
      error = err.message;
      return;
    }
    // Row is gone; clear the storage objects so the bucket doesn't grow forever.
    const { error: sErr } = await supabase.storage.from(ART_BUCKET).remove(artworkPaths(art));
    if (sErr) console.warn('artwork files left in storage:', sErr.message);
    items = items.filter((a) => a.id !== art.id);
  }

  const mediums = $derived([...new Set(items.map((a) => a.medium).filter(Boolean))].sort());
</script>

<div class="sa">
  <header class="sa__head">
    <div>
      <a class="mono sa__back" href="/studio">← STUDIO</a>
      <p class="mono">ASU AZURE · ARTIST PAGE</p>
      <h1 class="serif sa__title">Who is Asu Azure</h1>
    </div>
    <a class="mono sa__view" href="/asu" target="_blank" rel="noopener">VIEW /asu ↗</a>
  </header>

  <nav class="sa__tabs mono" aria-label="Sections">
    <button class:is-on={tab === 'profile'} onclick={() => (tab = 'profile')}>PROFILE</button>
    <button class:is-on={tab === 'gallery'} onclick={() => (tab = 'gallery')}>
      GALLERY · {items.length}
    </button>
  </nav>

  {#if error}<p class="mono sa__error">{error}</p>{/if}
  {#if notice}<p class="mono sa__notice">{notice}</p>{/if}

  {#if !ready}
    <p class="mono">LOADING…</p>
  {:else if tab === 'profile'}
    <div class="sa__grid">
      <label class="sa__field">
        <span class="mono">DISPLAY NAME</span>
        <input type="text" bind:value={profile.display_name} />
      </label>

      <div class="sa__field">
        <span class="mono">PORTRAIT</span>
        <div class="sa__portrait">
          {#if profile.portrait_path}
            <img src={artUrl(profile.portrait_path)} alt="Current portrait" />
          {:else}
            <span class="mono sa__none">NONE</span>
          {/if}
          <label class="mono sa__btn">
            {portraitBusy ? 'UPLOADING…' : 'CHOOSE IMAGE'}
            <input type="file" accept="image/*" hidden onchange={onPickPortrait} disabled={portraitBusy} />
          </label>
        </div>
      </div>

      <div class="sa__field sa__field--wide">
        <span class="mono">BIO — 自己紹介 (RICH TEXT; IMAGES ALLOWED)</span>
        <RichTextEditor
          value={profile.bio}
          onChange={(html) => (profile.bio = html)}
          uploadImage={uploadBioImage}
          placeholder="Who you are, what you draw, where the stories come from…"
        />
      </div>

      <label class="sa__field">
        <span class="mono">CRAFT — ONE PER LINE</span>
        <textarea bind:value={profile.craftText} rows="4"
          placeholder={'Clip Studio Paint · fully digital\nCharacter design · illustration · cover art'}
        ></textarea>
      </label>

      <div class="sa__field">
        <span class="mono">LINKS</span>
        <input type="url" bind:value={profile.x} placeholder="https://x.com/…" aria-label="X URL" />
        <input type="text" bind:value={profile.x_handle} placeholder="@handle" aria-label="X handle" />
        <input type="email" bind:value={profile.email} placeholder="contact@…" aria-label="Contact email" />
      </div>

      <label class="sa__check">
        <input type="checkbox" bind:checked={profile.commissions_open} />
        <span class="mono">COMMISSIONS OPEN</span>
      </label>

      <div class="sa__save">
        <button class="mono sa__primary" onclick={saveProfile} disabled={savingProfile}>
          {savingProfile ? 'SAVING…' : 'SAVE PROFILE'}
        </button>
      </div>
    </div>
  {:else}
    <div class="sa__gallery">
      <div class="sa__upload">
        <label class="mono sa__btn">
          + ADD ARTWORK
          <input type="file" accept="image/*" multiple hidden onchange={onPickArtworks} disabled={uploading} />
        </label>
        {#if uploading}
          <span class="mono">UPLOADING {String(uploadDone + 1).padStart(3, '0')}/{String(uploadTotal).padStart(3, '0')}</span>
        {:else}
          <span class="mono sa__hint">
            FULL-RES ORIGINALS ARE NEVER UPLOADED — EACH FILE BECOMES 1600 / 900 / 320 WEBP
          </span>
        {/if}
      </div>

      {#if mediums.length}
        <p class="mono sa__hint">MEDIUMS IN USE — {mediums.join(' · ')}</p>
      {/if}

      {#if items.length === 0}
        <p class="mono">NO ARTWORK YET.</p>
      {:else}
        <div
          class="sa__list"
          use:dndzone={{ items, flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
          onconsider={handleConsider}
          onfinalize={handleFinalize}
        >
          {#each items as art, i (art.id)}
            <div class="sa__row" class:is-featured={art.featured} class:is-draft={!art.published}>
              <span class="mono sa__idx">{String(i + 1).padStart(2, '0')}</span>
              <img class="sa__thumb" src={artUrl(art.thumb_path)} alt={art.alt || art.title} />
              {#if editingId === art.id}
                <div class="sa__edit">
                  <input
                    type="text"
                    value={art.title}
                    placeholder="Title"
                    onchange={(e) => patch(art, { title: (e.currentTarget as HTMLInputElement).value })}
                  />
                  <input
                    type="text"
                    value={art.medium}
                    placeholder="Medium (drives the filter chips)"
                    list="sa-mediums"
                    onchange={(e) => patch(art, { medium: (e.currentTarget as HTMLInputElement).value })}
                  />
                  <input
                    type="text"
                    value={art.alt}
                    placeholder="Alt text (described for screen readers)"
                    onchange={(e) => patch(art, { alt: (e.currentTarget as HTMLInputElement).value })}
                  />
                </div>
              {:else}
                <div class="sa__meta">
                  <span class="serif sa__name">{art.title || 'Untitled'}</span>
                  <span class="mono sa__sub">
                    {art.medium || 'NO MEDIUM'} · {art.width}×{art.height}
                  </span>
                </div>
              {/if}
              <div class="sa__acts">
                <button class="mono sa__mini" onclick={() => (editingId = editingId === art.id ? null : art.id)}>
                  {editingId === art.id ? 'DONE' : 'EDIT'}
                </button>
                <button class="mono sa__mini" class:is-on={art.featured} onclick={() => setFeatured(art)}>
                  {art.featured ? '★ FEATURED' : '☆ FEATURE'}
                </button>
                <button class="mono sa__mini" onclick={() => patch(art, { published: !art.published })}>
                  {art.published ? '● LIVE' : '○ DRAFT'}
                </button>
                <button class="mono sa__mini sa__mini--danger" onclick={() => remove(art)}>DELETE</button>
              </div>
            </div>
          {/each}
        </div>
        <datalist id="sa-mediums">
          {#each mediums as m}<option value={m}></option>{/each}
        </datalist>
        <p class="mono sa__hint">DRAG A ROW TO REORDER · THE FEATURED PIECE LEADS THE GALLERY</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .sa {
    display: grid;
    gap: clamp(1.4rem, 3.5vh, 2.2rem);
    max-width: 1000px;
  }
  .sa__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1rem;
  }
  .sa__back {
    display: inline-block;
    margin-bottom: 0.9rem;
    color: var(--fg-faint);
  }
  .sa__back:hover,
  .sa__view:hover {
    color: var(--accent);
  }
  .sa__title {
    font-size: clamp(1.8rem, 4.5vw, 2.7rem);
    margin-top: 0.4rem;
  }
  .sa__tabs {
    display: flex;
    gap: 0.5rem;
    border-bottom: 1px solid var(--line);
  }
  .sa__tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--fg-faint);
    padding: 0.6em 1em;
    cursor: pointer;
    font: inherit;
  }
  .sa__tabs button.is-on {
    color: var(--fg);
    border-bottom-color: var(--accent);
  }
  .sa__error {
    color: #e8a31a;
  }
  .sa__notice {
    color: var(--accent);
  }
  .sa__hint {
    color: var(--fg-faint);
    font-size: 0.62rem;
  }

  .sa__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: clamp(1rem, 2.5vw, 1.8rem);
  }
  .sa__field,
  .sa__save {
    display: grid;
    gap: 0.5rem;
    align-content: start;
  }
  .sa__field--wide,
  .sa__save {
    grid-column: 1 / -1;
  }
  .sa__field input,
  .sa__field textarea {
    background: var(--bg-soft);
    border: 1px solid var(--line-strong);
    color: var(--fg);
    font: inherit;
    padding: 0.6em 0.85em;
    width: 100%;
  }
  .sa__field input:focus,
  .sa__field textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .sa__portrait {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }
  .sa__portrait img {
    width: 84px;
    aspect-ratio: 1;
    object-fit: cover;
    border: 1px solid var(--line-strong);
  }
  .sa__none {
    color: var(--fg-faint);
  }
  .sa__check {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    align-self: end;
  }
  .sa__btn,
  .sa__primary,
  .sa__mini {
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    padding: 0.55em 1em;
    cursor: pointer;
    font: inherit;
    transition: color 0.25s var(--ease), border-color 0.25s var(--ease);
  }
  .sa__btn:hover,
  .sa__primary:hover,
  .sa__mini:hover {
    color: var(--fg);
    border-color: var(--fg-dim);
  }
  .sa__primary {
    justify-self: start;
    border-color: var(--accent);
    color: var(--fg);
  }
  .sa__mini--danger:hover {
    color: #e8a31a;
    border-color: #e8a31a;
  }
  .sa__mini.is-on {
    color: var(--accent);
    border-color: var(--accent);
  }

  .sa__gallery {
    display: grid;
    gap: 1rem;
  }
  .sa__upload {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .sa__list {
    display: grid;
    gap: 0.5rem;
  }
  .sa__row {
    display: grid;
    grid-template-columns: 2rem 64px 1fr auto;
    align-items: center;
    gap: 0.9rem;
    padding: 0.6rem;
    border: 1px solid var(--line);
    background: var(--bg-soft);
    cursor: grab;
  }
  .sa__row.is-featured {
    border-color: var(--accent);
  }
  .sa__row.is-draft {
    opacity: 0.55;
  }
  .sa__idx {
    color: var(--fg-faint);
  }
  .sa__thumb {
    width: 64px;
    aspect-ratio: 4 / 5;
    object-fit: cover;
    border: 1px solid var(--line);
  }
  .sa__meta {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }
  .sa__name {
    font-size: 1.05rem;
  }
  .sa__sub {
    color: var(--fg-faint);
    font-size: 0.6rem;
  }
  .sa__edit {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
  .sa__edit input {
    background: var(--bg);
    border: 1px solid var(--line-strong);
    color: var(--fg);
    font: inherit;
    font-size: 0.85rem;
    padding: 0.4em 0.6em;
  }
  .sa__edit input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .sa__acts {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .sa__acts .sa__mini {
    font-size: 0.58rem;
    padding: 0.45em 0.7em;
  }

  @media (max-width: 860px) {
    .sa__grid {
      grid-template-columns: 1fr;
    }
    .sa__row {
      grid-template-columns: 1.6rem 52px 1fr;
    }
    .sa__acts {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }
  }
</style>
