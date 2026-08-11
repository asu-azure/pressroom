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
  import { COPY_FIELDS, SECTIONS, PAGE_GROUPS, type CopyField } from '../../data/copyKeys';
  import { applyCopy } from '../../lib/siteCopy';
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

  /** Sections belonging to each page, in registry order. The Studio groups by
   *  page so the author can tell at a glance which box feeds which page — the
   *  six acts edit /lookbook, not the portfolio. */
  const sectionsByPage = $derived(
    Object.fromEntries(PAGE_GROUPS.map((g) => [g.id, SECTIONS.filter((s) => s.page === g.id)])),
  );

  function pageEdited(pageId: string, l: Lang): number {
    return (sectionsByPage[pageId] ?? []).reduce((n, s) => n + sectionEdited(s.id, l), 0);
  }

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

  /* ===================== live preview =====================================
     The Studio and the previewed page are same-origin, so we drive the iframe
     directly: applyCopy() already takes a `root`, so the draft can be painted
     into the preview document with no receiver script.

     ⚠ Everything preview-only — the click handler, the hover affordance, the
     link guard — is injected INTO the iframe from here. None of it ships to
     /asu, / or /lookbook, so a visitor can never receive editing chrome. Keep
     it that way: do not move any of this into the pages themselves. */

  let previewOn = $state(true);
  let previewEl = $state<HTMLIFrameElement | null>(null);
  /** The page currently loaded in the iframe, so we only reload on a real change. */
  let previewPage = $state<string>('/asu');
  let activeKey = $state<string | null>(null);
  /** Set when the focused key has no node on the page — see hiddenKeys note. */
  let notVisible = $state(false);

  const hrefFor = (pageId: string) => PAGE_GROUPS.find((g) => g.id === pageId)?.href ?? '/asu';
  const pageOfSection = (sectionId: string) =>
    SECTIONS.find((s) => s.id === sectionId)?.page ?? 'asu';

  /** draft is keyed key→lang; applyCopy wants lang→key. */
  const bundle = $derived.by(() => {
    const out = { ja: {}, en: {}, th: {} } as Record<Lang, Record<string, string>>;
    for (const f of COPY_FIELDS) for (const l of LANGS) out[l][f.key] = draft[f.key]?.[l] ?? '';
    return out;
  });

  const previewDoc = () => previewEl?.contentDocument ?? null;

  function paint() {
    const doc = previewDoc();
    if (!doc?.body) return;
    applyCopy(bundle, lang, doc);
  }

  let paintTimer: ReturnType<typeof setTimeout> | undefined;
  function paintSoon() {
    clearTimeout(paintTimer);
    paintTimer = setTimeout(paint, 120);
  }

  // Repaint whenever the draft or the language changes.
  $effect(() => {
    void bundle;
    void lang;
    if (previewOn) paintSoon();
  });

  function findNode(doc: Document, key: string): HTMLElement | null {
    return doc.querySelector<HTMLElement>(
      `[data-i18n="${CSS.escape(key)}"], [data-i18n-html="${CSS.escape(key)}"]`,
    );
  }

  /** Focusing a field scrolls the preview to the line it controls. */
  function revealInPreview(f: CopyField) {
    activeKey = f.key;
    const doc = previewDoc();
    if (!doc) return;

    // Follow the field to its page — but only reload when it actually differs.
    const href = hrefFor(pageOfSection(f.section));
    if (href !== previewPage) {
      previewPage = href;
      notVisible = false;
      return; // the load handler paints and re-runs this
    }

    const el = findNode(doc, f.key);
    notVisible = !el;
    if (!el) return;

    // Lenis owns scrolling on these pages; scrollIntoView fights it.
    const lenis = (previewEl?.contentWindow as unknown as { __lenis?: { scrollTo: Function } })?.__lenis;
    if (lenis?.scrollTo) lenis.scrollTo(el, { offset: -140 });
    else el.scrollIntoView({ block: 'center', behavior: 'smooth' });

    el.classList.add('is-copytarget');
    setTimeout(() => el.classList.remove('is-copytarget'), 1400);
  }

  /** Clicking a line in the preview opens its section and focuses its input. */
  function focusField(key: string) {
    const f = COPY_FIELDS.find((x) => x.key === key);
    if (!f) return;
    const host = document.querySelector<HTMLElement>(`[data-fieldkey="${CSS.escape(key)}"]`);
    host?.closest('details')?.setAttribute('open', '');
    host?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    host?.querySelector<HTMLElement>('textarea, [contenteditable="true"]')?.focus();
    activeKey = key;
  }

  /** Runs on every iframe load: paint the draft, then wire the preview side. */
  function onPreviewLoad() {
    const doc = previewDoc();
    if (!doc) return;
    paint();
    // The page applies its own stored language on boot; make sure the draft wins.
    setTimeout(paint, 250);

    const style = doc.createElement('style');
    style.textContent = `
      [data-i18n]:hover, [data-i18n-html]:hover {
        outline: 1px dashed rgba(39,66,240,.55); outline-offset: 3px; cursor: pointer;
      }
      .is-copytarget { outline: 2px solid #2742f0 !important; outline-offset: 3px; }
    `;
    doc.head.appendChild(style);

    doc.addEventListener(
      'click',
      (e) => {
        const target = e.target as Element | null;
        // Never let the preview navigate away from the page being edited — on
        // /asu a [data-flock] link would also start the bird-flock transition.
        if (target?.closest('a[href]')) {
          e.preventDefault();
          e.stopPropagation();
        }
        const node = target?.closest<HTMLElement>('[data-i18n], [data-i18n-html]');
        const key = node?.dataset.i18n ?? node?.dataset.i18nHtml;
        if (key) {
          e.preventDefault();
          focusField(key);
        }
      },
      true,
    );
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

<div class="sc" class:sc--split={previewOn}>
  <div class="sc__form">
  <div class="sc__head">
    <nav class="sc__langs mono" aria-label="Language">
      {#each LANGS as l (l)}
        <button class:is-on={lang === l} onclick={() => (lang = l)}>
          {LANG_LABEL[l]}
          {#if ready}<span class="sc__badge">{editedCount(l)}</span>{/if}
        </button>
      {/each}
    </nav>
    <button class="mono sc__preview-toggle" onclick={() => (previewOn = !previewOn)}>
      {previewOn ? 'HIDE PREVIEW' : 'SHOW PREVIEW'}
    </button>
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
    {#each PAGE_GROUPS as group (group.id)}
      {@const groupSections = (sectionsByPage[group.id] ?? []).filter((s) => (fieldsBySection[s.id] ?? []).length)}
      {#if groupSections.length}
        <div class="sc__group">
          <header class="sc__groupHead">
            <span class="mono sc__groupLabel">{group.label}</span>
            <a class="mono sc__groupLink" href={group.href} target="_blank" rel="noopener">
              {group.href} ↗
            </a>
            {#if pageEdited(group.id, lang)}
              <span class="mono sc__groupEdited">{pageEdited(group.id, lang)} EDITED</span>
            {/if}
          </header>
          <p class="mono sc__groupNote">{group.note}</p>

    {#each groupSections as section, i (section.id)}
      {@const fields = fieldsBySection[section.id] ?? []}
      {#if fields.length}
        <!-- Only the portfolio group opens on arrival; the lookbook acts stay
             folded so they cannot be mistaken for portfolio boxes. -->
        <details class="sc__sec" open={group.id === 'asu' && i < 2}>
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
            <!-- data-fieldkey is how a click in the preview finds its way back here. -->
            <div
              class="sc__field"
              class:is-active={activeKey === f.key}
              data-fieldkey={f.key}
              onfocusin={() => revealInPreview(f)}
            >
              <div class="sc__label">
                <span class="mono">{f.label}</span>
                {#if activeKey === f.key && notVisible}
                  <span class="mono sc__chip sc__chip--hidden" title="This line is not rendered on the page right now, so there is nothing to preview.">
                    NOT VISIBLE
                  </span>
                {/if}
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
        </div>
      {/if}
    {/each}
  {/if}
  </div>

  {#if previewOn}
    <aside class="sc__preview" aria-label="Live preview">
      <header class="sc__previewHead mono">
        <span class="sc__previewPath">{previewPage}</span>
        <span class="sc__previewState" class:is-dirty={dirty}>
          {dirty ? '● UNSAVED — PREVIEW ONLY' : '● LIVE'}
        </span>
      </header>
      <!-- Same-origin, so the Studio paints the draft straight into this
           document. Everything preview-only is injected in onPreviewLoad. -->
      <iframe
        bind:this={previewEl}
        class="sc__previewFrame"
        src={previewPage}
        title="Live preview"
        onload={onPreviewLoad}
      ></iframe>
      <p class="mono sc__previewHint">
        Click any outlined line in the page to jump to its field.
      </p>
    </aside>
  {/if}
</div>

<style>
  .sc {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .sc__form {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    min-width: 0;
  }

  /* --- live preview ---------------------------------------------------------
     Form scrolls, page stays put. Only split when there is room for both: below
     this the preview would squeeze the form into a gutter, so it collapses to
     the toggle in the header instead. */
  @media (min-width: 1100px) {
    .sc--split {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(28rem, 44%);
      gap: clamp(1rem, 2.5vw, 2rem);
      align-items: start;
    }
    .sc__preview {
      position: sticky;
      top: 1rem;
      display: grid;
      gap: 0.5rem;
      max-height: calc(100svh - 2rem);
    }
    .sc__previewFrame {
      width: 100%;
      height: calc(100svh - 7rem);
      border: 1px solid var(--line-strong);
      background: var(--ink-bg);
    }
  }
  /* Toggled on from the header on narrow screens — stacks under the form. */
  .sc__preview {
    display: grid;
    gap: 0.5rem;
  }
  .sc__previewFrame {
    width: 100%;
    height: 60svh;
    border: 1px solid var(--line-strong);
    background: var(--ink-bg);
  }
  .sc__previewHead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.6rem;
  }
  .sc__previewPath { color: var(--accent); }
  .sc__previewState { color: var(--fg-faint); }
  .sc__previewState.is-dirty { color: #e8a31a; }
  .sc__previewHint {
    color: var(--fg-faint);
    text-transform: none;
    letter-spacing: 0;
  }
  .sc__preview-toggle {
    border: 1px solid var(--line-strong);
    background: none;
    color: var(--fg-dim);
    padding: 0.4rem 0.7rem;
    cursor: pointer;
  }
  .sc__preview-toggle:hover { color: var(--accent); border-color: var(--accent); }

  /* The field the preview is currently pointed at. */
  .sc__field.is-active {
    box-shadow: -3px 0 0 0 var(--accent);
    padding-left: 0.7rem;
  }
  .sc__chip--hidden {
    color: #e8a31a;
    border-color: currentColor;
  }

  /* --- page groups ---------------------------------------------------------
     The six acts edit /lookbook, not the portfolio. Grouping by page is what
     tells the author which box feeds which page; the accent rule down the left
     is there so the boundary survives a long scroll. */
  .sc__group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 1.4rem;
    padding-left: 0.85rem;
    border-left: 2px solid var(--line-strong);
  }
  .sc__group:first-of-type { margin-top: 0; }
  .sc__groupHead {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.7rem;
  }
  .sc__groupLabel {
    font-size: 0.68rem;
    letter-spacing: 0.2em;
    color: var(--fg);
  }
  .sc__groupLink { color: var(--accent); }
  .sc__groupLink:hover { text-decoration: underline; }
  .sc__groupEdited { color: var(--accent); }
  .sc__groupNote {
    margin: -0.15rem 0 0.35rem;
    color: var(--fg-faint);
    text-transform: none;
    letter-spacing: 0;
    line-height: 1.6;
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
