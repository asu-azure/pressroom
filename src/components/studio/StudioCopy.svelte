<script lang="ts">
  /**
   * Studio → COPY. Every word on /asu and the homepage artist teaser, in all
   * three languages.
   *
   * The form is GENERATED from src/data/copyKeys.ts, so its sections appear in
   * the order a visitor scrolls through them and the author edits "Hero →
   * Headline", never a key. Fields left at their shipped default store no row at
   * all — that is what makes RESET possible and keeps the table to just the
   * lines actually changed.
   */
  import { supabase } from '../../lib/supabase';
  import { LANGS, LANG_LABEL, type Lang } from '../../lib/lang';
  import { COPY_FIELDS, SECTIONS, type CopyField } from '../../data/copyKeys';
  import RichTextEditor from './RichTextEditor.svelte';

  let lang = $state<Lang>('ja');
  let ready = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);

  /** What the author currently sees, for every key in every language. */
  let draft = $state<Record<string, Record<Lang, string>>>(blankDraft());
  /** What the database currently holds — '' means "no row, using the default". */
  let overrides = $state<Record<string, Record<Lang, string>>>(blankDraft());

  function blankDraft(): Record<string, Record<Lang, string>> {
    const out: Record<string, Record<Lang, string>> = {};
    for (const f of COPY_FIELDS) out[f.key] = { ja: '', en: '', th: '' };
    return out;
  }

  $effect(() => {
    void load();
  });

  async function load() {
    const seededDraft = blankDraft();
    const seededOverrides = blankDraft();
    for (const f of COPY_FIELDS) for (const l of LANGS) seededDraft[f.key][l] = f.defaults[l];

    const { data, error: err } = await supabase.from('site_copy').select('key, lang, value');
    if (err) {
      error = err.message;
    } else {
      for (const row of (data ?? []) as { key: string; lang: string; value: string }[]) {
        if (!(row.key in seededDraft)) continue; // stale key, no longer in the registry
        const l = row.lang as Lang;
        if (!LANGS.includes(l)) continue;
        const value = row.value ?? '';
        if (!value.trim()) continue;
        seededDraft[row.key][l] = value;
        seededOverrides[row.key][l] = value;
      }
    }
    draft = seededDraft;
    overrides = seededOverrides;
    ready = true;
  }

  function flash(msg: string) {
    notice = msg;
    setTimeout(() => (notice = null), 2400);
  }

  const fieldsBySection = $derived(
    Object.fromEntries(SECTIONS.map((s) => [s.id, COPY_FIELDS.filter((f) => f.section === s.id)])),
  );

  /** Fields the author has changed away from the shipped wording, per language. */
  function editedCount(l: Lang): number {
    return COPY_FIELDS.filter((f) => draft[f.key]?.[l].trim() !== f.defaults[l].trim()).length;
  }

  function isDefault(f: CopyField, l: Lang): boolean {
    return (draft[f.key]?.[l] ?? '').trim() === f.defaults[l].trim();
  }

  function reset(f: CopyField, l: Lang) {
    draft[f.key][l] = f.defaults[l];
  }

  function sectionEdited(sectionId: string, l: Lang): number {
    return (fieldsBySection[sectionId] ?? []).filter((f) => !isDefault(f, l)).length;
  }

  async function saveAll() {
    saving = true;
    error = null;

    const upserts: { key: string; lang: Lang; value: string }[] = [];
    const reverts: Record<Lang, string[]> = { ja: [], en: [], th: [] };

    for (const f of COPY_FIELDS) {
      for (const l of LANGS) {
        const value = draft[f.key][l];
        const matchesDefault = value.trim() === f.defaults[l].trim();
        const stored = overrides[f.key][l];
        if (matchesDefault) {
          // Only bother deleting a row that actually exists.
          if (stored) reverts[l].push(f.key);
        } else if (value !== stored) {
          upserts.push({ key: f.key, lang: l, value });
        }
      }
    }

    if (upserts.length) {
      const { error: err } = await supabase
        .from('site_copy')
        .upsert(upserts, { onConflict: 'key,lang' });
      if (err) {
        error = err.message;
        saving = false;
        return;
      }
    }

    for (const l of LANGS) {
      if (!reverts[l].length) continue;
      const { error: err } = await supabase
        .from('site_copy')
        .delete()
        .eq('lang', l)
        .in('key', reverts[l]);
      if (err) {
        error = err.message;
        saving = false;
        return;
      }
    }

    // Mirror what we just wrote so the next save is minimal again.
    const next = blankDraft();
    for (const f of COPY_FIELDS) {
      for (const l of LANGS) {
        next[f.key][l] = draft[f.key][l].trim() === f.defaults[l].trim() ? '' : draft[f.key][l];
      }
    }
    overrides = next;
    saving = false;
    flash(upserts.length || Object.values(reverts).some((r) => r.length) ? 'COPY SAVED' : 'NOTHING TO SAVE');
  }

  const dirty = $derived(
    ready &&
      COPY_FIELDS.some((f) =>
        LANGS.some((l) => {
          const value = draft[f.key][l];
          const matchesDefault = value.trim() === f.defaults[l].trim();
          return matchesDefault ? Boolean(overrides[f.key][l]) : value !== overrides[f.key][l];
        }),
      ),
  );
</script>

<div class="sc">
  <div class="sc__head">
    <nav class="sc__langs mono" aria-label="Language">
      {#each LANGS as l (l)}
        <button class:is-on={lang === l} onclick={() => (lang = l)}>
          {LANG_LABEL[l]}
          {#if ready}<span class="sc__badge">{editedCount(l)}</span>{/if}
        </button>
      {/each}
    </nav>
    <button class="mono sc__save" onclick={saveAll} disabled={saving || !dirty}>
      {saving ? 'SAVING…' : dirty ? 'SAVE COPY' : 'SAVED'}
    </button>
  </div>

  <p class="mono sc__lede">
    Editing <strong>{LANG_LABEL[lang]}</strong>. Fields marked DEFAULT still show the wording
    carried over from the old art site — change one and it becomes yours. The number on each
    language is how many lines you have rewritten.
  </p>

  {#if error}<p class="mono sc__error">{error}</p>{/if}
  {#if notice}<p class="mono sc__notice">{notice}</p>{/if}

  {#if !ready}
    <p class="mono">LOADING…</p>
  {:else}
    {#each SECTIONS as section, i (section.id)}
      {@const fields = fieldsBySection[section.id] ?? []}
      {#if fields.length}
        <details class="sc__sec" open={i < 2}>
          <summary>
            <span class="serif sc__secTitle">{section.label}</span>
            <span class="mono sc__secMeta">
              {fields.length} {fields.length === 1 ? 'LINE' : 'LINES'}
              {#if sectionEdited(section.id, lang)}
                · <span class="sc__secEdited">{sectionEdited(section.id, lang)} EDITED</span>
              {/if}
            </span>
          </summary>
          <p class="mono sc__secNote">{section.note}</p>

          {#each fields as f (f.key)}
            <div class="sc__field">
              <div class="sc__label">
                <span class="mono">{f.label}</span>
                {#if isDefault(f, lang)}
                  <span class="mono sc__chip">DEFAULT</span>
                {:else}
                  <button class="mono sc__reset" onclick={() => reset(f, lang)}>RESET</button>
                {/if}
              </div>
              {#if f.hint}<p class="sc__hint">{f.hint}</p>{/if}

              {#if f.type === 'rich'}
                <!-- Keyed on the language: the editor fills its DOM once on mount,
                     so switching tabs has to give it a fresh instance or it would
                     keep showing the previous language's text. -->
                {#key `${f.key}:${lang}`}
                  <RichTextEditor
                    value={draft[f.key][lang]}
                    allowImages={false}
                    onChange={(html) => (draft[f.key][lang] = html)}
                    placeholder={f.defaults[lang]}
                  />
                {/key}
              {:else}
                <textarea
                  class="sc__input"
                  rows={draft[f.key][lang].length > 90 ? 3 : 1}
                  bind:value={draft[f.key][lang]}
                  placeholder={f.defaults[lang]}
                ></textarea>
              {/if}
            </div>
          {/each}
        </details>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .sc {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .sc__head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 0.5rem 0;
    background: var(--bg);
  }
  .sc__langs {
    display: flex;
    gap: 0.3rem;
  }
  .sc__langs button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    background: none;
    border: 1px solid var(--line);
    color: var(--fg-dim);
    font-size: 0.72rem;
    cursor: pointer;
    transition: color 0.2s var(--ease), border-color 0.2s var(--ease);
  }
  .sc__langs button:hover { color: var(--fg); border-color: var(--line-strong); }
  .sc__langs button.is-on {
    color: var(--ink-fg);
    background: var(--accent);
    border-color: var(--accent);
  }
  .sc__badge {
    padding: 0 0.32rem;
    border: 1px solid currentColor;
    border-radius: 2px;
    font-size: 0.62rem;
    opacity: 0.75;
  }
  .sc__save {
    padding: 0.45rem 1rem;
    background: var(--accent);
    border: 1px solid var(--accent);
    color: var(--ink-fg);
    font-size: 0.72rem;
    cursor: pointer;
  }
  .sc__save:disabled { opacity: 0.45; cursor: default; }
  .sc__lede {
    margin: 0;
    max-width: 62ch;
    font-size: 0.72rem;
    line-height: 1.6;
    color: var(--fg-dim);
  }
  .sc__error { color: #d3381c; }
  .sc__notice { color: var(--accent); }

  .sc__sec {
    border: 1px solid var(--line);
    padding: 0.7rem 0.9rem;
  }
  .sc__sec summary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.6rem;
    cursor: pointer;
  }
  .sc__secTitle { font-size: 1.05rem; }
  .sc__secMeta { font-size: 0.64rem; color: var(--fg-dim); }
  .sc__secEdited { color: var(--accent); }
  .sc__secNote {
    margin: 0.4rem 0 0.9rem;
    font-size: 0.68rem;
    line-height: 1.5;
    color: var(--fg-dim);
  }

  .sc__field {
    padding: 0.7rem 0;
    border-top: 1px dashed var(--line);
  }
  .sc__label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
  }
  .sc__label > span { font-size: 0.68rem; }
  .sc__chip {
    padding: 0 0.3rem;
    border: 1px solid var(--line-strong);
    font-size: 0.58rem;
    color: var(--fg-dim);
  }
  .sc__reset {
    padding: 0 0.3rem;
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    font-size: 0.58rem;
    cursor: pointer;
  }
  .sc__reset:hover { color: var(--accent); border-color: var(--accent); }
  .sc__hint {
    margin: 0 0 0.4rem;
    font-size: 0.66rem;
    line-height: 1.5;
    color: var(--fg-dim);
  }
  .sc__input {
    width: 100%;
    padding: 0.5rem 0.6rem;
    background: var(--bg-soft, transparent);
    border: 1px solid var(--line);
    color: var(--fg);
    font: inherit;
    font-size: 0.85rem;
    line-height: 1.5;
    resize: vertical;
  }
  .sc__input:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
</style>
