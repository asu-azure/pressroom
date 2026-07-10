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
  let fileInput: HTMLInputElement;
  let mounted = $state(false);
  let uploading = $state(false);
  let activeFig = $state<HTMLElement | null>(null);

  // Fill once on mount; afterwards the DOM is the source of truth (rewriting
  // innerHTML on every keystroke would reset the caret).
  $effect(() => {
    if (editor && !mounted) {
      editor.innerHTML = toRichHtml(value);
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
  }

  function onEditorClick(e: MouseEvent) {
    const fig = (e.target as HTMLElement).closest('figure.fore-fig') as HTMLElement | null;
    setActiveFig(fig);
  }

  function insertFigure(url: string) {
    // fore-fig--active is stripped by the sanitizer — safe as a live-DOM marker.
    const html =
      `<figure class="fore-fig fore-fig--center fore-fig--md">` +
      `<img src="${url}" alt=""><figcaption>Caption…</figcaption></figure><p><br></p>`;
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

  function swapClass(prefix: string, value: string) {
    if (!activeFig) return;
    for (const c of [...activeFig.classList]) {
      if (c.startsWith(prefix)) activeFig.classList.remove(c);
    }
    activeFig.classList.add(`${prefix}${value}`);
    emit();
  }

  function removeFig() {
    if (!activeFig) return;
    activeFig.remove();
    activeFig = null;
    emit();
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

  function pickFont(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    if (v) cmd('fontName', v);
    (e.currentTarget as HTMLSelectElement).value = '';
  }

  function pickBlock(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    if (v) cmd('formatBlock', v);
    (e.currentTarget as HTMLSelectElement).value = '';
  }
</script>

<div class="rte">
  <div class="rte__bar" role="toolbar" aria-label="Text formatting">
    <button type="button" class="rte__btn" title="Bold" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('bold')}><b>B</b></button>
    <button type="button" class="rte__btn" title="Italic" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('italic')}><i>I</i></button>
    <button type="button" class="rte__btn" title="Underline" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('underline')}><u>U</u></button>
    <button type="button" class="rte__btn" title="Strikethrough" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('strikeThrough')}><s>S</s></button>
    <span class="rte__sep" aria-hidden="true"></span>
    <button type="button" class="rte__btn mono" title="Align left" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('justifyLeft')}>⇤</button>
    <button type="button" class="rte__btn mono" title="Align center" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('justifyCenter')}>↔</button>
    <button type="button" class="rte__btn mono" title="Align right" onmousedown={(e) => e.preventDefault()} onclick={() => cmd('justifyRight')}>⇥</button>
    <span class="rte__sep" aria-hidden="true"></span>
    <select class="rte__select mono" title="Font" onmousedown={(e) => e.stopPropagation()} onchange={pickFont}>
      <option value="">FONT…</option>
      {#each FONTS as f (f.value)}
        <option value={f.value}>{f.label}</option>
      {/each}
    </select>
    <select class="rte__select mono" title="Block style" onchange={pickBlock}>
      <option value="">STYLE…</option>
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
    <div class="rte__figbar" role="toolbar" aria-label="Image layout">
      <span class="mono rte__figlabel">IMAGE —</span>
      <button type="button" class="rte__btn mono" title="Float left" onmousedown={(e) => e.preventDefault()} onclick={() => swapClass('fore-fig--', 'left')}>⇤</button>
      <button type="button" class="rte__btn mono" title="Center" onmousedown={(e) => e.preventDefault()} onclick={() => swapClass('fore-fig--', 'center')}>↔</button>
      <button type="button" class="rte__btn mono" title="Float right" onmousedown={(e) => e.preventDefault()} onclick={() => swapClass('fore-fig--', 'right')}>⇥</button>
      <span class="rte__sep" aria-hidden="true"></span>
      <button type="button" class="rte__btn mono" title="Small" onmousedown={(e) => e.preventDefault()} onclick={() => swapClass('fore-fig--', 'sm')}>S</button>
      <button type="button" class="rte__btn mono" title="Medium" onmousedown={(e) => e.preventDefault()} onclick={() => swapClass('fore-fig--', 'md')}>M</button>
      <button type="button" class="rte__btn mono" title="Large" onmousedown={(e) => e.preventDefault()} onclick={() => swapClass('fore-fig--', 'lg')}>L</button>
      <span class="rte__sep" aria-hidden="true"></span>
      <button type="button" class="rte__btn rte__btn--danger mono" title="Remove image" onmousedown={(e) => e.preventDefault()} onclick={removeFig}>✕ REMOVE</button>
    </div>
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
  .rte__area :global(.fore-fig--left) {
    float: left;
    margin: 0.2rem 1.2rem 0.8rem 0;
  }
  .rte__area :global(.fore-fig--right) {
    float: right;
    margin: 0.2rem 0 0.8rem 1.2rem;
  }
  .rte__area :global(.fore-fig--center) {
    float: none;
    margin: 1rem auto;
  }
  .rte__area :global(.fore-fig--sm) { width: 30%; }
  .rte__area :global(.fore-fig--md) { width: 48%; }
  .rte__area :global(.fore-fig--lg) { width: 66%; }
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
