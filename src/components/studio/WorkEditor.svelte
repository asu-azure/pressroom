<script lang="ts">
  import { supabase } from '../../lib/supabase';
  import { requireSession, watchSignOut } from '../../lib/authGuard';
  import Arranger from './Arranger.svelte';
  import PdfUploader from './PdfUploader.svelte';
  import RichTextEditor from './RichTextEditor.svelte';
  import CoverCropper from './CoverCropper.svelte';
  import CharacterProfileEditor from './CharacterProfileEditor.svelte';
  import { toPageRec } from '../../lib/storagePaths';
  import type { Work, PageRow, Chapter, Character, CoverCrop, BookFormat } from '../../lib/types';

  const CAST_COLORS = ['#2742f0', '#e8a31a', '#18c4d6', '#d6455f', '#6aa0ff', '#4caf7d', '#b06ad6'];

  let { workId }: { workId: string } = $props();

  let work = $state<Work | null>(null);
  let pages = $state<PageRow[]>([]);
  let chapters = $state<Chapter[]>([]);
  let tab = $state<'pages' | 'meta'>('pages');
  let error = $state<string | null>(null);
  let savedFlash = $state(false);
  let cropOpen = $state(false);

  // The current cover page (for the crop tool), enriched with URLs.
  const coverRec = $derived.by(() => {
    if (!work?.cover_page_id) return null;
    const row = pages.find((p) => p.id === work!.cover_page_id);
    return row ? toPageRec(row) : null;
  });

  async function saveCoverCrop(crop: CoverCrop | null) {
    const { error: err } = await supabase
      .from('works')
      .update({ cover_crop: crop })
      .eq('id', workId);
    if (err) error = err.message;
    cropOpen = false;
    await loadWork();
  }

  // Meta form fields (bound copies; committed on save)
  let meta = $state({
    title: '',
    slug: '',
    description: '',
    foreword: '',
    status: 'oneshot' as Work['status'],
    direction: 'rtl' as Work['direction'],
    default_layout: 'double' as Work['default_layout'],
    default_mode: 'flip' as Work['default_mode'],
    cover_solo: true,
    tagsText: '',
    characters: [] as Character[],
    // book info + series (supabase/book-info.sql)
    book_lang: '',
    translations: [] as string[],
    formats: [] as BookFormat[],
    release_label: '',
    cwText: '', // content notes, one per line (Japanese items carry 、 — commas won't do)
    series_title: '',
    series_order: '',
    series_kind: '' as '' | 'main' | 'side',
    series_label: '',
  });

  /** Existing series names, so a second book joins the first by picking it. */
  let seriesTitles = $state<string[]>([]);

  /** Toggle a value in a list, keeping the order it was added in (formats read in that order). */
  function toggleIn<T>(list: T[], v: T): T[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  function addCharacter() {
    meta.characters = [
      ...meta.characters,
      { id: crypto.randomUUID(), name: '', color: CAST_COLORS[meta.characters.length % CAST_COLORS.length] },
    ];
  }
  function removeCharacter(id: string) {
    meta.characters = meta.characters.filter((c) => c.id !== id);
    if (profileOpenId === id) profileOpenId = null;
  }
  // Array order IS the cast-page order — swap adjacent entries (same pattern
  // as BubbleEditor.moveBubble).
  function moveCharacter(id: string, dir: -1 | 1) {
    const i = meta.characters.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= meta.characters.length) return;
    const next = [...meta.characters];
    [next[i], next[j]] = [next[j], next[i]];
    meta.characters = next;
  }
  // Which character's profile editor is disclosed (one at a time).
  let profileOpenId = $state<string | null>(null);

  // --- Reading lock: password lives server-side as a bf hash (read-lock.sql);
  //     only its existence + the hint are visible here. Changeable any time. ---
  let lockPassword = $state('');
  let lockHint = $state('');
  let lockBusy = $state(false);
  let lockFlash = $state<string | null>(null);

  async function setLock() {
    if (!lockPassword.trim()) return;
    lockBusy = true;
    const { error: err } = await supabase.rpc('set_read_password', {
      p_work_id: workId,
      p_password: lockPassword,
      p_hint: lockHint,
    });
    lockBusy = false;
    if (err) {
      error = err.message;
      return;
    }
    lockPassword = '';
    lockFlash = 'LOCK SET ✓';
    setTimeout(() => (lockFlash = null), 1600);
    await loadWork();
  }
  async function removeLock() {
    lockBusy = true;
    const { error: err } = await supabase.rpc('clear_read_password', { p_work_id: workId });
    lockBusy = false;
    if (err) {
      error = err.message;
      return;
    }
    lockPassword = '';
    lockFlash = 'LOCK REMOVED';
    setTimeout(() => (lockFlash = null), 1600);
    await loadWork();
  }

  $effect(() => {
    void init();
  });

  async function init() {
    if (!(await requireSession())) return;
    watchSignOut();
    await Promise.all([loadWork(), loadPages(), loadChapters()]);
  }

  async function loadChapters() {
    const { data, error: err } = await supabase
      .from('chapters')
      .select('*')
      .eq('work_id', workId)
      .order('sort_key');
    if (err) error = err.message;
    else chapters = data as Chapter[];
  }

  async function loadWork() {
    const { data, error: err } = await supabase.from('works').select('*').eq('id', workId).single();
    if (err) {
      error = err.message;
      return;
    }
    work = data as Work;
    meta = {
      title: work.title,
      slug: work.slug,
      description: work.description,
      foreword: work.foreword,
      status: work.status,
      direction: work.direction,
      default_layout: work.default_layout,
      default_mode: work.default_mode,
      cover_solo: work.cover_solo ?? true,
      tagsText: work.tags.join(', '),
      characters: (work.characters ?? []).map((c) => ({ ...c })),
      book_lang: work.book_lang ?? '',
      translations: [...(work.translations ?? [])],
      formats: [...(work.formats ?? [])],
      release_label: work.release_label ?? '',
      cwText: (work.content_warnings ?? []).join('\n'),
      series_title: work.series_title ?? '',
      series_order: work.series_order == null ? '' : String(work.series_order),
      series_kind: work.series_kind ?? '',
      series_label: work.series_label ?? '',
    };
    const { data: titles } = await supabase.from('works').select('series_title').not('series_title', 'is', null);
    seriesTitles = [...new Set((titles ?? []).map((r) => r.series_title as string))].sort();
    lockHint = work.password_hint ?? '';
  }

  async function loadPages() {
    const { data, error: err } = await supabase
      .from('pages')
      .select('*')
      .eq('work_id', workId)
      .order('sort_key');
    if (err) error = err.message;
    else pages = data as PageRow[];
  }

  async function reload() {
    await Promise.all([loadWork(), loadPages(), loadChapters()]);
  }

  async function saveMeta(e: SubmitEvent) {
    e.preventDefault();
    const { error: err } = await supabase
      .from('works')
      .update({
        title: meta.title.trim(),
        slug: meta.slug.trim(),
        description: meta.description,
        foreword: meta.foreword,
        status: meta.status,
        direction: meta.direction,
        default_layout: meta.default_layout,
        default_mode: meta.default_mode,
        cover_solo: meta.cover_solo,
        tags: meta.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
        characters: meta.characters
          .map((c) => ({ ...c, name: c.name.trim() }))
          .filter((c) => c.name),
        book_lang: meta.book_lang || null,
        translations: meta.translations.filter((c) => c !== meta.book_lang),
        formats: meta.formats,
        release_label: meta.release_label.trim() || null,
        content_warnings: meta.cwText.split('\n').map((t) => t.trim()).filter(Boolean),
        series_title: meta.series_title.trim() || null,
        series_order: meta.series_order.trim() === '' || !Number.isFinite(Number(meta.series_order)) ? null : Number(meta.series_order),
        series_kind: meta.series_kind || null,
        series_label: meta.series_label.trim() || null,
      })
      .eq('id', workId);
    if (err) {
      error = err.message;
      return;
    }
    error = null;
    savedFlash = true;
    setTimeout(() => (savedFlash = false), 1600);
    await loadWork();
  }
</script>

<div class="we">
  <header class="we__head">
    <div>
      <a class="mono we__back" href="/studio">← STUDIO</a>
      <h1 class="serif we__title">{work?.title ?? '…'}</h1>
      {#if work}
        <p class="mono we__meta">
          /{work.slug} · {work.direction.toUpperCase()} · {pages.length} PAGES ·
          {work.published ? 'LIVE' : 'DRAFT'}
        </p>
      {/if}
    </div>
    {#if work}
      <a class="mono we__view" href={`/w/${work.slug}`} target="_blank" rel="noopener">VIEW ↗</a>
    {/if}
  </header>

  <nav class="we__tabs">
    <button class="mono we__tab" class:is-active={tab === 'pages'} onclick={() => (tab = 'pages')}>
      PAGES
    </button>
    <button class="mono we__tab" class:is-active={tab === 'meta'} onclick={() => (tab = 'meta')}>
      META
    </button>
  </nav>

  {#if error}
    <p class="mono we__error">{error}</p>
  {/if}

  {#if !work}
    <p class="mono">LOADING…</p>
  {:else if tab === 'pages'}
    <div class="we__pages">
      <PdfUploader {workId} {chapters} {pages} onDone={reload} />
      {#if pages.length || chapters.length}
        <Arranger
          {workId}
          direction={work.direction}
          coverPageId={work.cover_page_id}
          coverSolo={work.cover_solo ?? true}
          characters={work.characters ?? []}
          {chapters}
          {pages}
          onChanged={reload}
        />
      {:else}
        <p class="mono">NO PAGES YET — RASTERIZE A PDF ABOVE.</p>
      {/if}
    </div>
  {:else}
    <form class="we__form" onsubmit={saveMeta}>
      <label class="we__field">
        <span class="mono">TITLE</span>
        <input type="text" bind:value={meta.title} required />
      </label>
      <label class="we__field">
        <span class="mono">SLUG (URL)</span>
        <input type="text" bind:value={meta.slug} pattern="[a-z0-9\-]+" required />
      </label>
      <label class="we__field we__field--wide">
        <span class="mono">DESCRIPTION (SHORT — SHOWN NEXT TO THE COVER)</span>
        <textarea bind:value={meta.description} rows="3"></textarea>
      </label>
      <div class="we__field we__field--wide">
        <span class="mono">SYNOPSIS / あらすじ (TELLS THE WHOLE STORY, SPOILERS WELCOME — ITS OWN PAGE BETWEEN COVER AND CONTENT)</span>
        <RichTextEditor
          value={meta.foreword}
          {workId}
          onChange={(html) => (meta.foreword = html)}
          placeholder="Write as much as you like — bold, italics, fonts, alignment, images. Readers see each block rise in as they scroll."
        />
      </div>
      <label class="we__field">
        <span class="mono">STATUS</span>
        <select bind:value={meta.status}>
          <option value="oneshot">One-shot</option>
          <option value="ongoing">Ongoing</option>
          <option value="complete">Complete</option>
        </select>
      </label>
      <label class="we__field">
        <span class="mono">READING DIRECTION</span>
        <select bind:value={meta.direction}>
          <option value="rtl">Right → left (manga)</option>
          <option value="ltr">Left → right</option>
        </select>
      </label>
      <label class="we__field">
        <span class="mono">DEFAULT LAYOUT</span>
        <select bind:value={meta.default_layout}>
          <option value="double">Two-page spread</option>
          <option value="single">Single page</option>
        </select>
      </label>
      <label class="we__field">
        <span class="mono">DEFAULT MODE</span>
        <select bind:value={meta.default_mode}>
          <option value="flip">Flip (paged)</option>
          <option value="scroll">Scroll</option>
        </select>
      </label>
      <label class="we__field we__field--check we__field--wide">
        <input type="checkbox" bind:checked={meta.cover_solo} />
        <span class="mono">COVER STANDS ALONE (in two-page layout the cover gets its own sheet — sets where spreads begin)</span>
      </label>
      <div class="we__field we__field--wide">
        <span class="mono">COVER CROP (LIBRARY CARD)</span>
        {#if coverRec}
          <button type="button" class="mono we__coverBtn" onclick={() => (cropOpen = true)}>
            ✂ ADJUST COVER FRAMING
          </button>
        {:else}
          <p class="mono we__hint">Set a book cover in the PAGES tab first.</p>
        {/if}
      </div>
      <label class="we__field we__field--wide">
        <span class="mono">TAGS (COMMA-SEPARATED)</span>
        <input type="text" bind:value={meta.tagsText} placeholder="fantasy, one-shot, colour" />
      </label>

      <!-- Book info — the overview's 奥付 row and content notes -->
      <label class="we__field">
        <span class="mono">BOOK LANGUAGE (WHAT THE PAGES ARE WRITTEN IN)</span>
        <select bind:value={meta.book_lang}>
          <option value="">—</option>
          <option value="th">Thai · ไทย</option>
          <option value="ja">Japanese · 日本語</option>
          <option value="en">English</option>
        </select>
      </label>
      <div class="we__field">
        <span class="mono">TRANSLATIONS READERS CAN SWITCH ON</span>
        <div class="we__checks">
          {#each [['ja', '日本語'], ['en', 'English'], ['th', 'ไทย']] as [code, name] (code)}
            {#if code !== meta.book_lang}
              <label class="we__check">
                <input
                  type="checkbox"
                  checked={meta.translations.includes(code)}
                  onchange={() => (meta.translations = toggleIn(meta.translations, code))}
                />
                <span class="mono">{name}</span>
              </label>
            {/if}
          {/each}
        </div>
      </div>
      <div class="we__field">
        <span class="mono">FORMAT (SHOWN IN THE ORDER YOU TICK THEM)</span>
        <div class="we__checks">
          {#each [['manga', 'Manga 漫画'], ['novel', 'Novel 小説'], ['illust', 'Illustration']] as [code, name] (code)}
            <label class="we__check">
              <input
                type="checkbox"
                checked={meta.formats.includes(code as BookFormat)}
                onchange={() => (meta.formats = toggleIn(meta.formats, code as BookFormat))}
              />
              <span class="mono">{name}</span>
            </label>
          {/each}
        </div>
      </div>
      <label class="we__field">
        <span class="mono">RELEASE (FREE TEXT)</span>
        <input type="text" bind:value={meta.release_label} placeholder="2026年3月 Comic Square 9" />
      </label>
      <label class="we__field we__field--wide">
        <span class="mono">CONTENT NOTES / 内容に関する注意 (ONE PER LINE — SHOWN ABOVE THE READ BUTTON)</span>
        <textarea rows="3" bind:value={meta.cwText} placeholder={'家庭内暴力\n自傷への言及'}></textarea>
      </label>

      <!-- Series — books sharing a series name link to each other -->
      <label class="we__field we__field--wide">
        <span class="mono">SERIES NAME (THE SAME NAME ON EACH BOOK JOINS THEM)</span>
        <input type="text" bind:value={meta.series_title} list="we-series-titles" placeholder="扉の向こうはヒマワリ畑" />
        <datalist id="we-series-titles">
          {#each seriesTitles as t (t)}<option value={t}></option>{/each}
        </datalist>
      </label>
      {#if meta.series_title.trim()}
        <label class="we__field">
          <span class="mono">ORDER IN THE SERIES (1, 2, 1.5 …)</span>
          <input type="number" step="any" bind:value={meta.series_order} />
        </label>
        <label class="we__field">
          <span class="mono">KIND</span>
          <select bind:value={meta.series_kind}>
            <option value="">—</option>
            <option value="main">Main story · 本編</option>
            <option value="side">Side story · 外伝</option>
          </select>
        </label>
        <label class="we__field we__field--wide">
          <span class="mono">ARC NAME (SHOWN ON THE SERIES CARD)</span>
          <input type="text" bind:value={meta.series_label} placeholder="夜光虫編" />
        </label>
      {/if}
      <div class="we__field we__field--wide">
        <span class="mono">READING LOCK / 閲覧パスワード (READERS NEED THE PASSWORD; RLS ENFORCES IT)</span>
        <div class="we__lock" class:is-locked={work.read_locked}>
          <p class="mono we__lockStatus">
            {#if work.read_locked}
              🔒 LOCKED{work.password_hint ? ` · HINT: ${work.password_hint}` : ''}
            {:else}
              OPEN — anyone can read
            {/if}
            {#if lockFlash}<span class="we__lockFlash"> {lockFlash}</span>{/if}
          </p>
          <div class="we__lockRow">
            <input
              type="text"
              bind:value={lockPassword}
              placeholder={work.read_locked ? 'New password (replaces the current one)' : 'Password'}
              autocomplete="off"
              spellcheck="false"
            />
            <input
              type="text"
              bind:value={lockHint}
              placeholder="Hint (public — shown on the gate)"
            />
          </div>
          <div class="we__lockActions">
            <button type="button" class="mono we__lockSet" onclick={setLock} disabled={lockBusy || !lockPassword.trim()}>
              {work.read_locked ? 'CHANGE PASSWORD' : 'SET LOCK'}
            </button>
            {#if work.read_locked}
              <button type="button" class="mono we__lockClear" onclick={removeLock} disabled={lockBusy}>
                REMOVE LOCK
              </button>
            {/if}
          </div>
          <p class="mono we__hint">
            The password is stored only as a hash — it can be replaced any time but never shown.
            Unlocks last per browser tab. Your own signed-in reading is never gated.
          </p>
        </div>
      </div>
      <div class="we__field we__field--wide">
        <span class="mono">CAST (BUBBLE SPEAKERS + CHARACTER PAGE — ORDER = ROSTER ORDER)</span>
        <div class="we__cast">
          {#each meta.characters as ch, i (ch.id)}
            <div class="we__castRow">
              <input class="we__castColor" type="color" bind:value={ch.color} aria-label="Colour" />
              <input class="we__castName" type="text" bind:value={ch.name} placeholder="Nickname — the name used in the story" />
              <button type="button" class="mono we__castBtn" onclick={() => moveCharacter(ch.id, -1)} disabled={i === 0} title="Move up">↑</button>
              <button type="button" class="mono we__castBtn" onclick={() => moveCharacter(ch.id, 1)} disabled={i === meta.characters.length - 1} title="Move down">↓</button>
              <button
                type="button"
                class="mono we__castBtn we__castProfile"
                class:is-open={profileOpenId === ch.id}
                onclick={() => (profileOpenId = profileOpenId === ch.id ? null : ch.id)}
                title="Character-page profile"
              >PROFILE {profileOpenId === ch.id ? '▴' : '▾'}</button>
              <button type="button" class="mono we__castDel" onclick={() => removeCharacter(ch.id)} title="Remove">✕</button>
            </div>
            {#if profileOpenId === ch.id}
              <CharacterProfileEditor character={ch} {workId} />
            {/if}
          {/each}
          <button type="button" class="mono we__castAdd" onclick={addCharacter}>+ ADD CHARACTER</button>
        </div>
      </div>
      <button class="we__save mono" type="submit">
        {savedFlash ? 'SAVED ✓' : 'SAVE META'}
      </button>
    </form>
  {/if}
</div>

{#if cropOpen && coverRec}
  <CoverCropper
    page={coverRec}
    crop={work?.cover_crop ?? null}
    onSave={saveCoverCrop}
    onClose={() => (cropOpen = false)}
  />
{/if}

<style>
  .we {
    display: grid;
    gap: clamp(1.4rem, 3.5vh, 2.2rem);
    max-width: 1100px;
  }
  .we__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1rem;
  }
  .we__back {
    display: inline-block;
    margin-bottom: 0.8rem;
  }
  .we__back:hover,
  .we__view:hover {
    color: var(--accent);
  }
  .we__title {
    font-size: clamp(1.8rem, 4.5vw, 2.8rem);
  }
  .we__meta {
    margin-top: 0.5rem;
  }
  .we__tabs {
    display: flex;
    gap: 0.5rem;
    border-bottom: 1px solid var(--line);
  }
  .we__tab {
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    color: var(--fg-dim);
    padding: 0.7em 1.1em;
    cursor: pointer;
    transition: color 0.25s var(--ease), border-color 0.25s var(--ease);
  }
  .we__tab.is-active {
    color: var(--fg);
    border-bottom-color: var(--accent);
  }
  .we__error {
    color: #e8a31a;
  }
  .we__pages {
    display: grid;
    gap: 1.6rem;
  }
  .we__form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.2rem;
    max-width: 760px;
  }
  .we__field {
    display: grid;
    gap: 0.45rem;
  }
  .we__field--wide {
    grid-column: 1 / -1;
  }
  .we__field--check {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .we__field--check input,
  .we__check input {
    width: 1.05rem;
    height: 1.05rem;
    flex-shrink: 0;
    accent-color: var(--accent);
  }
  .we__checks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.2rem;
  }
  .we__check {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    cursor: pointer;
  }
  .we__coverBtn {
    justify-self: start;
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    padding: 0.6em 1em;
    cursor: pointer;
  }
  .we__coverBtn:hover {
    color: var(--fg);
    border-color: var(--fg-dim);
  }
  .we__hint {
    color: var(--fg-faint);
    font-size: 0.6rem;
  }
  .we__field input,
  .we__field select,
  .we__field textarea {
    background: var(--bg-soft);
    border: 1px solid var(--line-strong);
    color: var(--fg);
    font: inherit;
    padding: 0.6em 0.8em;
  }
  .we__field input:focus,
  .we__field select:focus,
  .we__field textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .we__lock {
    display: grid;
    gap: 0.7rem;
    padding: 0.9rem;
    border: 1px solid var(--line);
    background: var(--bg-soft);
  }
  .we__lock.is-locked {
    border-left: 3px solid var(--accent);
  }
  .we__lockStatus {
    color: var(--fg);
  }
  .we__lockFlash {
    color: var(--accent);
  }
  .we__lockRow {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }
  .we__lockActions {
    display: flex;
    gap: 0.6rem;
  }
  .we__lockSet {
    background: var(--accent);
    color: var(--ink-fg);
    border: 1px solid var(--accent);
    padding: 0.6em 1.1em;
    cursor: pointer;
  }
  .we__lockSet:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .we__lockClear {
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    padding: 0.6em 1.1em;
    cursor: pointer;
  }
  .we__lockClear:hover:not(:disabled) {
    color: #e8a31a;
    border-color: #e8a31a;
  }
  @media (max-width: 620px) {
    .we__lockRow {
      grid-template-columns: 1fr;
    }
  }

  .we__cast {
    display: grid;
    gap: 0.5rem;
  }
  .we__castRow {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .we__castColor {
    width: 2.2rem;
    height: 2.2rem;
    padding: 0;
    border: 1px solid var(--line-strong);
    background: var(--bg-soft);
    cursor: pointer;
    flex-shrink: 0;
  }
  .we__castName {
    flex: 1;
  }
  .we__castBtn,
  .we__castDel {
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    padding: 0.5em 0.8em;
    cursor: pointer;
    flex-shrink: 0;
  }
  .we__castBtn:hover:not(:disabled) {
    color: var(--fg);
    border-color: var(--fg-dim);
  }
  .we__castBtn:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .we__castProfile.is-open {
    color: var(--accent);
    border-color: var(--accent);
  }
  .we__castDel:hover {
    color: #e8a31a;
    border-color: #e8a31a;
  }
  .we__castAdd {
    justify-self: start;
    background: none;
    border: 1px dashed var(--line-strong);
    color: var(--fg-dim);
    padding: 0.6em 1em;
    cursor: pointer;
  }
  .we__castAdd:hover {
    color: var(--fg);
    border-color: var(--fg-dim);
  }
  .we__save {
    grid-column: 1 / -1;
    justify-self: start;
    background: var(--accent);
    color: var(--ink-fg);
    border: 0;
    padding: 0.85em 1.4em;
    cursor: pointer;
  }
  @media (max-width: 640px) {
    .we__form {
      grid-template-columns: 1fr;
    }
  }
</style>
