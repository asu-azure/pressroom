<script lang="ts">
  import { sanitizeRich, toRichHtml } from '../../lib/richtext';
  import { uploadForewordImage } from '../../lib/foreImage';

  let {
    value,
    workId,
    onChange,
    placeholder = '',
    allowImages = true,
  }: {
    value: string;
    workId: string;
    onChange: (html: string) => void;
    placeholder?: string;
    /** false = text-only (no figure insert/paste/drop) — e.g. character bios
        keep their images in the profile gallery instead. */
    allowImages?: boolean;
  } = $props();

  let editor: HTMLElement;
  let shell: HTMLElement;
  let fileInput: HTMLInputElement;
  let mounted = $state(false);
  let uploading = $state(false);
  let activeFig = $state<HTMLElement | null>(null);

  // Fill once on mount; afterwards the DOM is the source of truth (rewriting
  // innerHTML on every keystroke would reset the caret).
  $effect(() => {
    if (editor && !mounted) {
      editor.innerHTML = toRichHtml(value);
      // sanitizeRich drops empty captions so they never publish as a gap — but
      // in here the author needs somewhere to click, so give every figure one
      // back. It only survives the next save if they actually type in it.
      for (const fig of editor.querySelectorAll('figure.fore-fig')) {
        if (!fig.querySelector('figcaption')) fig.append(document.createElement('figcaption'));
      }
      mounted = true;
    }
  });

  function emit() {
    onChange(sanitizeRich(editor.innerHTML));
  }

  function cmd(command: string, arg?: string) {
    editor.focus();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, arg);
    emit();
  }

  // --- Figure images: insert, then align / size / caption / remove ---

  function setActiveFig(fig: HTMLElement | null) {
    if (activeFig && activeFig !== fig) activeFig.classList.remove('fore-fig--active');
    fig?.classList.add('fore-fig--active');
    activeFig = fig;
    syncFigState();
  }

  function onEditorClick(e: MouseEvent) {
    const fig = (e.target as HTMLElement).closest('figure.fore-fig') as HTMLElement | null;
    setActiveFig(fig);
  }

  function insertFigure(url: string) {
    // fore-fig--active is stripped by the sanitizer — safe as a live-DOM marker.
    // The caption starts EMPTY: the editor shows a CSS placeholder, and
    // sanitizeRich drops it if untouched, so nothing publishes by accident.
    const html =
      `<figure class="fore-fig fore-fig--center fore-fig--md">` +
      `<img src="${url}" alt=""><figcaption></figcaption></figure><p><br></p>`;
    document.execCommand('insertHTML', false, html);
  }

  /** Upload each image file (downscale + WebP) and drop a figure at the caret. */
  async function uploadAndInsert(files: File[]) {
    if (!allowImages) return;
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    uploading = true;
    try {
      editor.focus();
      for (const file of images) {
        const url = await uploadForewordImage(file, workId);
        insertFigure(url);
      }
      emit();
    } catch (err) {
      console.error(err);
      alert('Image upload failed. See console.');
    } finally {
      uploading = false;
    }
  }

  async function onPickImage(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    await uploadAndInsert(files);
  }

  // Paste an image straight from the clipboard (screenshot / copied file).
  async function onPaste(e: ClipboardEvent) {
    const dt = e.clipboardData;
    if (!dt) return;
    let files = [...(dt.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length && dt.items) {
      // Some browsers surface a pasted image only via items, not files.
      files = [...dt.items]
        .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter((f): f is File => Boolean(f));
    }
    if (!files.length) return; // let normal text paste proceed
    e.preventDefault();
    await uploadAndInsert(files);
  }

  // Drop image files onto the editor — place the caret where they land, then
  // re-upload (a raw drop would embed an external URL the sanitizer strips).
  async function onDrop(e: DragEvent) {
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (range) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    await uploadAndInsert(files);
  }

  // Placement and size are INDEPENDENT axes. They used to share one
  // `fore-fig--` prefix swap, so setting either wiped the other — a figure
  // could never be both "wrapped left" and "small" at the same time.
  const ALIGNS = ['left', 'center', 'right'] as const;
  const SIZES = ['sm', 'md', 'lg'] as const;
  type Align = (typeof ALIGNS)[number];
  type Size = (typeof SIZES)[number];

  // The figure lives in the contenteditable DOM, which Svelte doesn't track —
  // mirror the bits the toolbar needs into state and re-read after every change.
  let figState = $state<{ align: Align | null; size: Size | null; width: string | null }>({
    align: null,
    size: null,
    width: null,
  });

  // Screen position of the drag handle. The handle lives OUTSIDE the
  // contenteditable (as an overlay on the shell) so it never ends up in
  // innerHTML — the DOM in there is the saved document.
  let handlePos = $state<{ x: number; y: number } | null>(null);

  function updateHandle() {
    if (!activeFig || !shell || !editor) {
      handlePos = null;
      return;
    }
    const fig = activeFig.getBoundingClientRect();
    const box = shell.getBoundingClientRect();
    const area = editor.getBoundingClientRect();
    // Hide it once the figure's corner scrolls out of the editor's viewport.
    if (fig.bottom < area.top || fig.bottom > area.bottom) {
      handlePos = null;
      return;
    }
    handlePos = { x: fig.right - box.left, y: fig.bottom - box.top };
  }

  function syncFigState() {
    const fig = activeFig;
    if (!fig) {
      figState = { align: null, size: null, width: null };
      handlePos = null;
      return;
    }
    updateHandle();
    figState = {
      align: ALIGNS.find((a) => fig.classList.contains(`fore-fig--${a}`)) ?? null,
      // A drag-resized width overrides the preset, so no preset reads as active.
      size: fig.style.width
        ? null
        : (SIZES.find((s) => fig.classList.contains(`fore-fig--${s}`)) ?? null),
      width: fig.style.width || null,
    };
  }

  function swapIn(group: readonly string[], value: string) {
    if (!activeFig) return;
    for (const g of group) activeFig.classList.remove(`fore-fig--${g}`);
    activeFig.classList.add(`fore-fig--${value}`);
    syncFigState();
    emit();
  }

  const setAlign = (a: Align) => swapIn(ALIGNS, a);
  function setSize(s: Size) {
    // A preset overrides any drag-resized width, or the inline style would win.
    activeFig?.style.removeProperty('width');
    swapIn(SIZES, s);
  }

  function removeFig() {
    if (!activeFig) return;
    activeFig.remove();
    activeFig = null;
    emit();
  }

  // --- Drag-to-resize: the Word gesture. Writes an inline % width, which the
  //     sanitizer allows on FIGURE only (richtext.ts) and which beats the
  //     preset class widths in both this editor and the published page. ---
  const MIN_W = 10;
  const MAX_W = 100;

  function startResize(e: PointerEvent) {
    if (!activeFig) return;
    e.preventDefault();
    e.stopPropagation();
    const fig = activeFig;
    const parent = fig.parentElement ?? editor;
    const parentW = parent.clientWidth || 1;
    const startX = e.clientX;
    const startW = fig.getBoundingClientRect().width;
    // Dragging a right-floated / centred figure's handle still grows rightward.
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const next = ((startW + (ev.clientX - startX)) / parentW) * 100;
      fig.style.width = `${Math.round(Math.min(MAX_W, Math.max(MIN_W, next)))}%`;
      syncFigState();
    };
    const up = (ev: PointerEvent) => {
      handle.releasePointerCapture?.(ev.pointerId);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      emit();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  const FONTS = [
    { label: 'Serif — Fraunces', value: 'Fraunces, Georgia, serif' },
    { label: 'Grotesk — Space Grotesk', value: "'Space Grotesk', system-ui, sans-serif" },
    { label: 'Mono — JetBrains Mono', value: "'JetBrains Mono', monospace" },
    { label: '明朝 — Noto Serif JP', value: "'Noto Serif JP', serif" },
    { label: 'ゴシック — Noto Sans JP', value: "'Noto Sans JP', sans-serif" },
  ];

  const BLOCKS = [
    { label: '¶ Body', value: 'p' },
    { label: 'H1 — Large heading', value: 'h1' },
    { label: 'H2 — Heading', value: 'h2' },
    { label: 'H3 — Small heading', value: 'h3' },
    { label: '❝ Quote', value: 'blockquote' },
  ];

  // Text sizes, relative so they still scale with the reader's viewport.
  const SIZE_STEPS = [
    { label: 'XS', value: '0.8em' },
    { label: 'S', value: '0.9em' },
    { label: 'M', value: '1em' },
    { label: 'L', value: '1.25em' },
    { label: 'XL', value: '1.6em' },
  ];

  /**
   * Apply a font size to the selection.
   *
   * execCommand('fontSize') emits `<font size="N">`, and the sanitizer keeps
   * only the `face` attribute on FONT — the size would be silently dropped the
   * moment the synopsis saved. So: use size 7 purely as a marker to get the
   * browser's correct range splitting across partial selections, then rewrite
   * every marker into a span carrying `font-size`, which IS allowed through.
   */
  function applyFontSize(size: string) {
    editor.focus();
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand('fontSize', false, '7');
    for (const font of [...editor.querySelectorAll('font[size="7"]')]) {
      const span = document.createElement('span');
      span.style.fontSize = size;
      span.append(...font.childNodes);
      font.replaceWith(span);
    }
    emit();
  }

  function pickFont(e: Event) {
    const el = e.currentTarget as HTMLSelectElement;
    if (el.value) cmd('fontName', el.value);
    el.value = '';
  }

  function pickBlock(e: Event) {
    const el = e.currentTarget as HTMLSelectElement;
    if (el.value) cmd('formatBlock', el.value);
    el.value = '';
  }

  function pickSize(e: Event) {
    const el = e.currentTarget as HTMLSelectElement;
    if (el.value) applyFontSize(el.value);
    el.value = '';
  }

  // --- C6: reflect what's actually active, so the bar describes the selection ---
  const MARKS = ['bold', 'italic', 'underline', 'strikeThrough'] as const;
  let marks = $state<Record<string, boolean>>({});
  let block = $state('');

  function syncToolbar() {
    if (!editor) return;
    // Only care while the caret is genuinely inside this editor.
    const sel = window.getSelection();
    if (!sel?.anchorNode || !editor.contains(sel.anchorNode)) return;
    const next: Record<string, boolean> = {};
    for (const m of MARKS) {
      try {
        next[m] = document.queryCommandState(m);
      } catch {
        next[m] = false;
      }
    }
    // justify* are mutually exclusive; fold them into the same map.
    for (const j of ['justifyLeft', 'justifyCenter', 'justifyRight']) {
      try {
        next[j] = document.queryCommandState(j);
      } catch {
        next[j] = false;
      }
    }
    marks = next;
    try {
      block = (document.queryCommandValue('formatBlock') || '').toLowerCase();
    } catch {
      block = '';
    }
  }

  $effect(() => {
    document.addEventListener('selectionchange', syncToolbar);
    return () => document.removeEventListener('selectionchange', syncToolbar);
  });

  // The handle tracks a figure inside a scrolling box — follow it.
  $effect(() => {
    if (!editor) return;
    const track = () => updateHandle();
    editor.addEventListener('scroll', track, { passive: true });
    window.addEventListener('resize', track);
    window.addEventListener('scroll', track, { passive: true });
    return () => {
      editor.removeEventListener('scroll', track);
      window.removeEventListener('resize', track);
      window.removeEventListener('scroll', track);
    };
  });

  const currentBlockLabel = $derived(
    BLOCKS.find((b) => b.value === block)?.label ?? 'STYLE…',
  );
</script>

<div class="rte" bind:this={shell}>
  <div class="rte__bar" role="toolbar" aria-label="Text formatting">
    <button type="button" class="rte__btn" class:is-on={marks.bold} title="Bold (Ctrl+B)" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('bold')}><b>B</b></button>
    <button type="button" class="rte__btn" class:is-on={marks.italic} title="Italic (Ctrl+I)" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('italic')}><i>I</i></button>
    <button type="button" class="rte__btn" class:is-on={marks.underline} title="Underline (Ctrl+U)" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('underline')}><u>U</u></button>
    <button type="button" class="rte__btn" class:is-on={marks.strikeThrough} title="Strikethrough" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('strikeThrough')}><s>S</s></button>
    <span class="rte__sep" aria-hidden="true"></span>
    <!-- TEXT alignment. The image bar below uses word labels, never these
         arrows — the two used to be identical glyphs stacked on top of each
         other, so there was no way to tell which one moved the picture. -->
    <button type="button" class="rte__btn mono" class:is-on={marks.justifyLeft} title="Align text left" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('justifyLeft')}>⇤</button>
    <button type="button" class="rte__btn mono" class:is-on={marks.justifyCenter} title="Align text center" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('justifyCenter')}>↔</button>
    <button type="button" class="rte__btn mono" class:is-on={marks.justifyRight} title="Align text right" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('justifyRight')}>⇥</button>
    <span class="rte__sep" aria-hidden="true"></span>
    <select class="rte__select mono" title="Font" onmousedown={(e) => e.stopPropagation()} onchange={pickFont}>
      <option value="">FONT…</option>
      {#each FONTS as f (f.value)}
        <option value={f.value}>{f.label}</option>
      {/each}
    </select>
    <select class="rte__select mono" title="Text size" onchange={pickSize}>
      <option value="">SIZE…</option>
      {#each SIZE_STEPS as s (s.value)}
        <option value={s.value}>{s.label}</option>
      {/each}
    </select>
    <!-- Resets to the placeholder after each pick, so the placeholder itself
         reports the block the caret is currently in. -->
    <select class="rte__select mono" title="Block style" onchange={pickBlock}>
      <option value="">{currentBlockLabel}</option>
      {#each BLOCKS as b (b.value)}
        <option value={b.value}>{b.label}</option>
      {/each}
    </select>
    <span class="rte__sep" aria-hidden="true"></span>
    <button type="button" class="rte__btn mono" title="Clear formatting" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('removeFormat')}>⌫ FMT</button>
    {#if allowImages}
      <span class="rte__sep" aria-hidden="true"></span>
      <button type="button" class="rte__btn mono" title="Insert image — or paste / drop one directly" disabled={uploading} onclick={() => fileInput.click()}>
        {uploading ? '…' : '⌷ IMAGE'}
      </button>
      <input
        class="rte__file"
        type="file"
        accept="image/*"
        bind:this={fileInput}
        onchange={onPickImage}
      />
    {/if}
  </div>

  {#if activeFig}
    <!-- Placement and size are independent: setting one no longer clears the
         other. Word labels (not the text bar's arrows) so it's obvious at a
         glance that these buttons move the picture. -->
    <div class="rte__figbar" role="toolbar" aria-label="Image layout">
      <span class="mono rte__figlabel">▣ PICTURE</span>
      <button type="button" class="rte__btn mono" class:is-on={figState.align === 'left'} title="Text wraps down the right side" onmousedown={(e) => e.preventDefault()} onclick={() => setAlign('left')}>◧ WRAP LEFT</button>
      <button type="button" class="rte__btn mono" class:is-on={figState.align === 'center'} title="Centred, text above and below" onmousedown={(e) => e.preventDefault()} onclick={() => setAlign('center')}>▣ CENTER</button>
      <button type="button" class="rte__btn mono" class:is-on={figState.align === 'right'} title="Text wraps down the left side" onmousedown={(e) => e.preventDefault()} onclick={() => setAlign('right')}>◨ WRAP RIGHT</button>
      <span class="rte__sep" aria-hidden="true"></span>
      <button type="button" class="rte__btn mono" class:is-on={figState.size === 'sm'} title="Small (30%)" onmousedown={(e) => e.preventDefault()} onclick={() => setSize('sm')}>S</button>
      <button type="button" class="rte__btn mono" class:is-on={figState.size === 'md'} title="Medium (48%)" onmousedown={(e) => e.preventDefault()} onclick={() => setSize('md')}>M</button>
      <button type="button" class="rte__btn mono" class:is-on={figState.size === 'lg'} title="Large (66%)" onmousedown={(e) => e.preventDefault()} onclick={() => setSize('lg')}>L</button>
      {#if figState.width}
        <span class="mono rte__figwidth" title="Dragged width — click S/M/L to go back to a preset">{figState.width}</span>
      {/if}
      <span class="rte__sep" aria-hidden="true"></span>
      <button type="button" class="rte__btn rte__btn--danger mono" title="Remove image" onmousedown={(e) => e.preventDefault()} onclick={removeFig}>✕ REMOVE</button>
    </div>
  {/if}

  {#if handlePos}
    <!-- Grab the corner, like Word. Writes an inline % width the sanitizer
         allows on FIGURE only; S/M/L clear it again. -->
    <button
      type="button"
      class="rte__handle"
      aria-label="Drag to resize image"
      title="Drag to resize"
      style={`left:${handlePos.x}px; top:${handlePos.y}px`}
      onpointerdown={startResize}
    ></button>
  {/if}

  <div
    class="rte__area serif"
    class:is-dropping={uploading}
    bind:this={editor}
    contenteditable="true"
    data-placeholder={placeholder}
    oninput={emit}
    onblur={emit}
    onclick={onEditorClick}
    onpaste={onPaste}
    ondrop={onDrop}
    ondragover={(e) => e.preventDefault()}
  ></div>
</div>

<style>
  .rte {
    position: relative;
    display: grid;
    border: 1px solid var(--line-strong);
    background: var(--bg-soft);
  }
  .rte__bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    padding: 0.45rem;
    border-bottom: 1px solid var(--line);
    position: sticky;
    top: 0;
    background: var(--bg-soft);
    z-index: 2;
  }
  .rte__btn {
    min-width: 2rem;
    min-height: 1.9rem;
    background: none;
    border: 1px solid transparent;
    color: var(--fg-dim);
    font-size: 0.8rem;
    cursor: pointer;
    transition: color 0.2s var(--ease), border-color 0.2s var(--ease);
  }
  .rte__btn:hover {
    color: var(--fg);
    border-color: var(--line-strong);
  }
  /* Reflects the actual selection, so the bar describes what you've got. */
  .rte__btn.is-on {
    color: var(--ink-fg);
    background: var(--accent);
    border-color: var(--accent);
  }
  .rte__btn--danger:hover {
    color: #e8a31a;
    border-color: #e8a31a;
  }
  .rte__sep {
    width: 1px;
    height: 1.2rem;
    background: var(--line-strong);
    margin: 0 0.3rem;
  }
  .rte__file {
    display: none;
  }
  .rte__figbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    padding: 0.45rem;
    border-bottom: 1px solid var(--line);
    background: rgba(39, 66, 240, 0.06);
  }
  .rte__figlabel {
    font-size: 0.55rem;
    color: var(--accent);
    margin-right: 0.2rem;
  }
  .rte__figwidth {
    font-size: 0.55rem;
    color: var(--fg-faint);
    margin-left: 0.2rem;
  }
  /* Corner grip, positioned over the active figure from JS. Lives outside the
     contenteditable so it never lands in the saved HTML. */
  .rte__handle {
    position: absolute;
    z-index: 3;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    padding: 0;
    background: var(--accent);
    border: 2px solid var(--bg-soft);
    border-radius: 50%;
    cursor: nwse-resize;
    touch-action: none;
  }
  .rte__select {
    background: var(--bg);
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    font-size: 0.6rem;
    letter-spacing: 0.08em;
    padding: 0.35em 0.5em;
    max-width: 11rem;
  }
  .rte__area {
    min-height: 14rem;
    max-height: 32rem;
    overflow-y: auto;
    padding: 1rem 1.1rem;
    font-size: 1rem;
    line-height: 1.9;
    color: var(--fg);
    outline: none;
  }
  .rte__area:empty::before {
    content: attr(data-placeholder);
    color: var(--fg-faint);
    pointer-events: none;
  }
  .rte__area.is-dropping {
    outline: 2px dashed var(--accent);
    outline-offset: -4px;
  }
  .rte__area :global(h1),
  .rte__area :global(h2),
  .rte__area :global(h3),
  .rte__area :global(h4) {
    font-family: var(--font-serif);
    line-height: 1.25;
    margin: 0.6em 0 0.3em;
  }
  /* Match the rendered foreword sizes so the editor is WYSIWYG. */
  .rte__area :global(h1) { font-size: clamp(1.9rem, 3.6vw, 2.8rem); }
  .rte__area :global(h2) { font-size: clamp(1.55rem, 2.8vw, 2.2rem); }
  .rte__area :global(h3) { font-size: clamp(1.3rem, 2.1vw, 1.7rem); }
  .rte__area :global(h4) { font-size: clamp(1.12rem, 1.6vw, 1.35rem); }
  .rte__area :global(blockquote) {
    border-left: 2px solid var(--accent);
    padding-left: 1em;
    color: var(--fg-dim);
    margin: 0.6em 0;
  }
  .rte__area :global(p) {
    margin: 0.5em 0;
  }
  .rte__area::after {
    content: '';
    display: block;
    clear: both;
  }
  .rte__area :global(figure.fore-fig) {
    margin: 0.6em 0;
    padding: 0;
  }
  /* These must mirror .ov-fore__body's figure rules in BookOverview.svelte —
     the editor was missing the widths on --left/--right, so a wrapped figure
     rendered full-width here and 48% on the published page. Order matters:
     the size classes come last so they win over a placement class's width,
     exactly as they do on the page. */
  .rte__area :global(.fore-fig--left) {
    float: left;
    width: 48%;
    margin: 0.2rem 1.2rem 0.8rem 0;
  }
  .rte__area :global(.fore-fig--right) {
    float: right;
    width: 48%;
    margin: 0.2rem 0 0.8rem 1.2rem;
  }
  .rte__area :global(.fore-fig--center) {
    float: none;
    margin: 1rem auto;
  }
  .rte__area :global(.fore-fig--sm) { width: 30%; }
  .rte__area :global(.fore-fig--md) { width: 48%; }
  .rte__area :global(.fore-fig--lg) { width: 66%; }
  /* Untouched caption reads as a hint, not as content (sanitizeRich drops it). */
  .rte__area :global(.fore-fig figcaption:empty)::before {
    content: 'Caption (optional)';
    color: var(--fg-faint);
    opacity: 0.7;
  }
  /* Any image — pasted content can carry bare <img> outside a fore-fig;
     clamp it exactly like the rendered page does. */
  .rte__area :global(img) {
    max-width: 100%;
    height: auto;
  }
  .rte__area :global(.fore-fig img) {
    display: block;
    width: 100%;
    height: auto;
    border: 1px solid var(--line-strong);
  }
  .rte__area :global(.fore-fig figcaption) {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    color: var(--fg-faint);
    padding-top: 0.3rem;
  }
  .rte__area :global(.fore-fig--active) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
