<script lang="ts">
  import { sanitizeRich, toRichHtml } from '../../lib/richtext';

  let {
    value,
    onChange,
    placeholder = '',
  }: { value: string; onChange: (html: string) => void; placeholder?: string } = $props();

  let editor: HTMLElement;
  let mounted = $state(false);

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

  const FONTS = [
    { label: 'Serif — Fraunces', value: 'Fraunces, Georgia, serif' },
    { label: 'Grotesk — Space Grotesk', value: "'Space Grotesk', system-ui, sans-serif" },
    { label: 'Mono — JetBrains Mono', value: "'JetBrains Mono', monospace" },
    { label: '明朝 — Noto Serif JP', value: "'Noto Serif JP', serif" },
    { label: 'ゴシック — Noto Sans JP', value: "'Noto Sans JP', sans-serif" },
  ];

  const BLOCKS = [
    { label: '¶ Body', value: 'p' },
    { label: 'H Heading', value: 'h3' },
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
  </div>
  <div
    class="rte__area serif"
    bind:this={editor}
    contenteditable="true"
    data-placeholder={placeholder}
    oninput={emit}
    onblur={emit}
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
  .rte__sep {
    width: 1px;
    height: 1.2rem;
    background: var(--line-strong);
    margin: 0 0.3rem;
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
  .rte__area :global(h1),
  .rte__area :global(h2),
  .rte__area :global(h3),
  .rte__area :global(h4) {
    font-family: var(--font-serif);
    line-height: 1.3;
    margin: 0.6em 0 0.3em;
  }
  .rte__area :global(blockquote) {
    border-left: 2px solid var(--accent);
    padding-left: 1em;
    color: var(--fg-dim);
    margin: 0.6em 0;
  }
  .rte__area :global(p) {
    margin: 0.5em 0;
  }
</style>
