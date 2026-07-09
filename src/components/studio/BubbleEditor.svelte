<script lang="ts">
  import type { PageRec, Bubble, Character } from '../../lib/types';

  let {
    page,
    pageNumber,
    characters,
    onSave,
    onClose,
  }: {
    page: PageRec;
    pageNumber: number;
    characters: Character[];
    onSave: (bubbles: Bubble[]) => Promise<void>;
    onClose: () => void;
  } = $props();

  // Work on a local clone; commit on save.
  let draft = $state<Bubble[]>((page.bubbles ?? []).map((b) => ({ ...b })));
  let selectedId = $state<string | null>(null);
  let saving = $state(false);

  let overlay: HTMLElement;
  type Mode = 'draw' | 'move' | 'resize' | null;
  let mode: Mode = null;
  let grab = { dx: 0, dy: 0 };

  const selected = $derived(draft.find((b) => b.id === selectedId) ?? null);

  function charOf(id: string | null): Character | null {
    return characters.find((c) => c.id === id) ?? null;
  }
  function colorOf(id: string | null): string {
    return charOf(id)?.color ?? '#2742f0';
  }

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  function rel(e: PointerEvent) {
    const r = overlay.getBoundingClientRect();
    return {
      nx: clamp((e.clientX - r.left) / r.width, 0, 1),
      ny: clamp((e.clientY - r.top) / r.height, 0, 1),
    };
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    overlay.setPointerCapture(e.pointerId);
    const { nx, ny } = rel(e);

    if (t.dataset.handle) {
      mode = 'resize';
      selectedId = t.dataset.id ?? null;
      return;
    }
    if (t.dataset.bubble) {
      mode = 'move';
      selectedId = t.dataset.bubble;
      const b = draft.find((x) => x.id === selectedId)!;
      grab = { dx: nx - b.x, dy: ny - b.y };
      return;
    }
    // Empty canvas — draw a fresh box, inheriting the current panel.
    const id = crypto.randomUUID();
    const panel = selected?.panel ?? Math.max(0, ...draft.map((b) => b.panel)) ?? 1;
    draft = [...draft, { id, panel: panel || 1, charId: selected?.charId ?? null, x: nx, y: ny, w: 0, h: 0, text: '' }];
    selectedId = id;
    grab = { dx: nx, dy: ny };
    mode = 'draw';
  }

  function onPointerMove(e: PointerEvent) {
    if (!mode || !selectedId) return;
    const b = draft.find((x) => x.id === selectedId);
    if (!b) return;
    const { nx, ny } = rel(e);
    if (mode === 'draw') {
      b.x = Math.min(grab.dx, nx);
      b.y = Math.min(grab.dy, ny);
      b.w = Math.abs(nx - grab.dx);
      b.h = Math.abs(ny - grab.dy);
    } else if (mode === 'move') {
      b.x = clamp(nx - grab.dx, 0, 1 - b.w);
      b.y = clamp(ny - grab.dy, 0, 1 - b.h);
    } else if (mode === 'resize') {
      b.w = clamp(nx - b.x, 0.02, 1 - b.x);
      b.h = clamp(ny - b.y, 0.02, 1 - b.y);
    }
  }

  function onPointerUp() {
    if (mode === 'draw' && selected && (selected.w < 0.015 || selected.h < 0.015)) {
      // A click, not a drag — discard the stub.
      draft = draft.filter((b) => b.id !== selectedId);
      selectedId = null;
    }
    mode = null;
  }

  function removeBubble(id: string) {
    draft = draft.filter((b) => b.id !== id);
    if (selectedId === id) selectedId = null;
  }

  function moveBubble(id: string, dir: -1 | 1) {
    const i = draft.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j], next[i]];
    draft = next;
  }

  async function save() {
    saving = true;
    // Drop empty stubs; keep author order as reading order.
    await onSave(draft.filter((b) => b.w >= 0.015 && b.h >= 0.015));
    saving = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      const editing = (e.target as HTMLElement)?.closest('input, textarea, select');
      if (!editing) {
        e.preventDefault();
        removeBubble(selectedId);
      }
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="be" role="dialog" aria-label="Bubble translations">
  <button class="be__scrim" aria-label="Close" onclick={onClose}></button>

  <div class="be__panel">
    <header class="be__head">
      <span class="mono be__title">TRANSLATE — P.{String(pageNumber).padStart(2, '0')}</span>
      <button class="be__close mono" onclick={onClose} title="Close (Esc)">✕</button>
    </header>

    <div class="be__body">
      <!-- Canvas: draw boxes over the page -->
      <div class="be__stage">
        <div
          class="be__imgwrap"
          bind:this={overlay}
          onpointerdown={onPointerDown}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
        >
          <img class="be__img" src={page.medUrl} alt={`Page ${pageNumber}`} draggable="false" />
          {#each draft as b, i (b.id)}
            <div
              class="be__box"
              class:is-selected={b.id === selectedId}
              data-bubble={b.id}
              style={`left:${b.x * 100}%; top:${b.y * 100}%; width:${b.w * 100}%; height:${b.h * 100}%; --c:${colorOf(b.charId)}`}
            >
              <span class="mono be__boxTag" data-bubble={b.id}>{i + 1}</span>
              {#if b.id === selectedId}
                <span class="be__handle" data-handle="br" data-id={b.id}></span>
              {/if}
            </div>
          {/each}
        </div>
        <p class="mono be__hint">DRAG ON THE PAGE TO BOX A BUBBLE · CLICK A BOX TO EDIT · DRAG TO MOVE · CORNER TO RESIZE</p>
      </div>

      <!-- Inspector: ordered list + selected bubble fields -->
      <aside class="be__side">
        {#if characters.length === 0}
          <p class="mono be__warn">No cast yet — add characters in the META tab to name speakers.</p>
        {/if}

        <div class="be__list">
          {#each draft as b, i (b.id)}
            <div
              class="be__row"
              class:is-selected={b.id === selectedId}
              style={`--c:${colorOf(b.charId)}`}
              role="button"
              tabindex="0"
              onclick={() => (selectedId = b.id)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectedId = b.id;
                }
              }}
            >
              <span class="mono be__rowNo">P{b.panel}·{i + 1}</span>
              <span class="be__rowName" style={`color:${colorOf(b.charId)}`}>
                {charOf(b.charId)?.name ?? '—'}
              </span>
              <span class="serif be__rowText">{b.text || '(empty)'}</span>
              <span class="be__rowOrder">
                <button class="mono be__ord" onclick={(e) => { e.stopPropagation(); moveBubble(b.id, -1); }} title="Up">↑</button>
                <button class="mono be__ord" onclick={(e) => { e.stopPropagation(); moveBubble(b.id, 1); }} title="Down">↓</button>
              </span>
            </div>
          {/each}
          {#if draft.length === 0}
            <p class="mono be__empty">No bubbles yet.</p>
          {/if}
        </div>

        {#if selected}
          <div class="be__edit">
            <div class="be__field">
              <span class="mono">PANEL</span>
              <input class="be__panelIn" type="number" min="1" bind:value={selected.panel} />
            </div>
            <div class="be__field">
              <span class="mono">CHARACTER</span>
              <select bind:value={selected.charId}>
                <option value={null}>— none —</option>
                {#each characters as c (c.id)}
                  <option value={c.id}>{c.name}</option>
                {/each}
              </select>
            </div>
            <div class="be__field">
              <span class="mono">TRANSLATION</span>
              <textarea class="serif" rows="3" bind:value={selected.text} placeholder="English line…"></textarea>
            </div>
            <button class="mono be__del" onclick={() => removeBubble(selected.id)}>✕ DELETE BUBBLE</button>
          </div>
        {/if}

        <button class="be__save mono" onclick={save} disabled={saving}>
          {saving ? 'SAVING…' : 'SAVE TRANSLATIONS'}
        </button>
      </aside>
    </div>
  </div>
</div>

<style>
  .be {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: clamp(0.5rem, 3vh, 2rem);
  }
  .be__scrim {
    position: absolute;
    inset: 0;
    background: rgba(8, 8, 10, 0.7);
    border: 0;
    cursor: pointer;
  }
  .be__panel {
    position: relative;
    z-index: 1;
    width: min(1100px, 96vw);
    max-height: 94svh;
    display: grid;
    grid-template-rows: auto 1fr;
    background: var(--bg-soft);
    border: 1px solid var(--line-strong);
    overflow: hidden;
  }
  .be__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.8rem 1rem;
    border-bottom: 1px solid var(--line);
  }
  .be__title {
    color: var(--fg);
  }
  .be__close {
    background: none;
    border: 0;
    color: var(--fg-dim);
    cursor: pointer;
    font-size: 1rem;
  }
  .be__close:hover {
    color: var(--fg);
  }
  .be__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 20rem;
    gap: 1rem;
    padding: 1rem;
    min-height: 0;
    overflow: hidden;
  }
  .be__stage {
    display: grid;
    grid-template-rows: 1fr auto;
    gap: 0.6rem;
    min-height: 0;
  }
  .be__imgwrap {
    position: relative;
    justify-self: center;
    align-self: center;
    max-height: 78svh;
    max-width: 100%;
    line-height: 0;
    touch-action: none;
    cursor: crosshair;
    user-select: none;
  }
  .be__img {
    display: block;
    max-height: 78svh;
    max-width: 100%;
    width: auto;
    height: auto;
    border: 1px solid var(--line);
  }
  .be__box {
    position: absolute;
    border: 2px solid var(--c);
    background: color-mix(in srgb, var(--c) 16%, transparent);
    box-sizing: border-box;
    cursor: move;
  }
  .be__box.is-selected {
    box-shadow: 0 0 0 1px #fff, 0 0 0 3px var(--c);
  }
  .be__boxTag {
    position: absolute;
    top: 0;
    left: 0;
    transform: translateY(-100%);
    font-size: 0.55rem;
    background: var(--c);
    color: #fff;
    padding: 0.1em 0.35em;
    line-height: 1.4;
    pointer-events: none;
  }
  .be__handle {
    position: absolute;
    right: -6px;
    bottom: -6px;
    width: 12px;
    height: 12px;
    background: #fff;
    border: 2px solid var(--c);
    cursor: nwse-resize;
  }
  .be__hint {
    font-size: 0.52rem;
    color: var(--fg-faint);
    text-align: center;
  }
  .be__side {
    display: grid;
    grid-template-rows: auto 1fr auto auto;
    gap: 0.7rem;
    min-height: 0;
    overflow-y: auto;
  }
  .be__warn,
  .be__empty {
    font-size: 0.6rem;
    color: var(--fg-faint);
  }
  .be__warn {
    color: #e8a31a;
  }
  .be__list {
    display: grid;
    gap: 0.3rem;
    align-content: start;
    overflow-y: auto;
    min-height: 3rem;
  }
  .be__row {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    align-items: center;
    gap: 0.4rem;
    text-align: left;
    background: var(--bg);
    border: 1px solid var(--line);
    border-left: 3px solid var(--c);
    color: var(--fg);
    padding: 0.35rem 0.5rem;
    cursor: pointer;
  }
  .be__row.is-selected {
    border-color: var(--accent);
    border-left-color: var(--c);
  }
  .be__rowNo {
    font-size: 0.52rem;
    color: var(--fg-faint);
  }
  .be__rowName {
    font-size: 0.62rem;
    white-space: nowrap;
  }
  .be__rowText {
    font-size: 0.78rem;
    color: var(--fg-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .be__rowOrder {
    display: flex;
    gap: 0.15rem;
  }
  .be__ord {
    background: none;
    border: 1px solid var(--line);
    color: var(--fg-dim);
    cursor: pointer;
    padding: 0 0.3em;
    font-size: 0.6rem;
  }
  .be__ord:hover {
    color: var(--fg);
    border-color: var(--fg-dim);
  }
  .be__edit {
    display: grid;
    gap: 0.6rem;
    border-top: 1px solid var(--line);
    padding-top: 0.7rem;
  }
  .be__field {
    display: grid;
    gap: 0.3rem;
  }
  .be__field span {
    font-size: 0.55rem;
    color: var(--fg-faint);
  }
  .be__field input,
  .be__field select,
  .be__field textarea {
    background: var(--bg);
    border: 1px solid var(--line-strong);
    color: var(--fg);
    font: inherit;
    padding: 0.5em 0.6em;
  }
  .be__field textarea {
    resize: vertical;
  }
  .be__panelIn {
    width: 5rem;
  }
  .be__del {
    justify-self: start;
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    padding: 0.4em 0.8em;
    cursor: pointer;
  }
  .be__del:hover {
    color: #e8a31a;
    border-color: #e8a31a;
  }
  .be__save {
    background: var(--accent);
    color: var(--ink-fg);
    border: 0;
    padding: 0.8em 1.2em;
    cursor: pointer;
  }
  .be__save:disabled {
    opacity: 0.6;
  }
  @media (max-width: 760px) {
    .be__body {
      grid-template-columns: 1fr;
      overflow-y: auto;
    }
    .be__imgwrap,
    .be__img {
      max-height: 50svh;
    }
  }
</style>
