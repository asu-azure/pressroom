<script lang="ts">
  import type { PageRec, CoverCrop } from '../../lib/types';

  let {
    page,
    crop,
    onSave,
    onClose,
  }: {
    page: PageRec;
    crop: CoverCrop | null;
    onSave: (crop: CoverCrop | null) => Promise<void>;
    onClose: () => void;
  } = $props();

  // The library card frame the crop must fill.
  const CARD_AR = 4 / 5.4;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  // State is a centre (cx, cy in 0..1 of the image) + zoom. zoom=1 fits the
  // crop box as large as possible inside the image; larger zoom crops tighter.
  // Derived crop {x,y,w,h} is what we persist.
  const imgAr = $derived(page.width / page.height);

  // The crop box (in image-normalized units) has the card aspect ratio. Its
  // max size at zoom 1: fill width or height, whichever keeps it inside.
  function boxAt(zoom: number): { w: number; h: number } {
    // Crop {w,h} are fractions of the image's own width/height. For the shown
    // pixels (w·imgW × h·imgH) to match the card ratio: h/w = imgAr / CARD_AR.
    const arN = imgAr / CARD_AR;
    // Largest box (w,h in 0..1) with that ratio that fits the unit square:
    let w = 1;
    let h = w * arN;
    if (h > 1) {
      h = 1;
      w = h / arN;
    }
    return { w: w / zoom, h: h / zoom };
  }

  let zoom = $state(1);
  let cx = $state(0.5);
  let cy = $state(0.5);

  // Seed from an existing crop.
  $effect(() => {
    if (crop) {
      const base = boxAt(1);
      zoom = base.w > 0 ? clamp(base.w / crop.w, 1, 6) : 1;
      cx = crop.x + crop.w / 2;
      cy = crop.y + crop.h / 2;
    }
  });

  const box = $derived(boxAt(zoom));
  // Clamp the centre to keep the box inside the image (derived, so zooming out
  // recomputes it without a read-write-the-same-signal effect).
  const ccx = $derived(clamp(cx, box.w / 2, 1 - box.w / 2));
  const ccy = $derived(clamp(cy, box.h / 2, 1 - box.h / 2));
  const derivedCrop = $derived<CoverCrop>({
    x: clamp(ccx - box.w / 2, 0, 1),
    y: clamp(ccy - box.h / 2, 0, 1),
    w: box.w,
    h: box.h,
  });

  let stage: HTMLElement;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    stage.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const r = stage.getBoundingClientRect();
    // The frame shows a box of size box.w×box.h; dragging one screen-width moves
    // the centre by box.w in image space. Move the centre opposite the drag.
    cx = clamp(cx - ((e.clientX - lastX) / r.width) * box.w, box.w / 2, 1 - box.w / 2);
    cy = clamp(cy - ((e.clientY - lastY) / r.height) * box.h, box.h / 2, 1 - box.h / 2);
    lastX = e.clientX;
    lastY = e.clientY;
  }
  function onPointerUp(e: PointerEvent) {
    dragging = false;
    if (stage.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);
  }

  // Background-image transform that shows exactly derivedCrop inside the frame.
  const bgStyle = $derived(
    `background-image:url(${page.medUrl});` +
      `background-size:${100 / derivedCrop.w}% ${100 / derivedCrop.h}%;` +
      `background-position:${(derivedCrop.x / (1 - derivedCrop.w)) * 100 || 0}% ${(derivedCrop.y / (1 - derivedCrop.h)) * 100 || 0}%;`,
  );

  let saving = $state(false);
  async function save() {
    saving = true;
    await onSave(derivedCrop);
    saving = false;
  }
  async function reset() {
    saving = true;
    await onSave(null);
    saving = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="cc" role="dialog" aria-label="Cover framing">
  <button class="cc__scrim" aria-label="Close" onclick={onClose}></button>

  <div class="cc__panel">
    <header class="cc__head">
      <span class="mono cc__title">FRAME COVER · LIBRARY CARD</span>
      <button class="cc__close mono" onclick={onClose} title="Close (Esc)">✕</button>
    </header>

    <div class="cc__body">
      <div class="cc__stageWrap">
        <!-- The framed preview: exactly what the card shows. -->
        <div
          class="cc__stage"
          bind:this={stage}
          style={bgStyle}
          onpointerdown={onPointerDown}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
          role="slider"
          tabindex="0"
          aria-label="Drag to reposition the cover"
          aria-valuenow={Math.round(zoom * 100)}
        >
          <span class="mono cc__grabHint">🖐 DRAG</span>
        </div>
      </div>

      <div class="cc__controls">
        <label class="cc__zoom">
          <span class="mono">ZOOM</span>
          <input type="range" min="1" max="6" step="0.02" bind:value={zoom} />
        </label>
        <p class="mono cc__note">
          Drag the image to reposition; zoom to size. The frame matches the library card.
        </p>
        <div class="cc__actions">
          <button class="mono cc__reset" onclick={reset} disabled={saving}>RESET (AUTO)</button>
          <button class="mono cc__save" onclick={save} disabled={saving}>
            {saving ? 'SAVING…' : 'SAVE FRAMING'}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .cc {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: clamp(0.5rem, 3vh, 2rem);
  }
  .cc__scrim {
    position: absolute;
    inset: 0;
    background: rgba(8, 8, 10, 0.7);
    border: 0;
    cursor: pointer;
  }
  .cc__panel {
    position: relative;
    z-index: 1;
    width: min(720px, 96vw);
    max-height: 94svh;
    display: grid;
    grid-template-rows: auto 1fr;
    background: var(--bg-soft);
    border: 1px solid var(--line-strong);
    overflow: hidden;
  }
  .cc__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.8rem 1rem;
    border-bottom: 1px solid var(--line);
  }
  .cc__title {
    color: var(--fg);
  }
  .cc__close {
    background: none;
    border: 0;
    color: var(--fg-dim);
    cursor: pointer;
    font-size: 1rem;
  }
  .cc__close:hover {
    color: var(--fg);
  }
  .cc__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 16rem;
    gap: 1rem;
    padding: 1rem;
    min-height: 0;
  }
  .cc__stageWrap {
    display: grid;
    place-items: center;
    min-height: 0;
  }
  .cc__stage {
    position: relative;
    width: min(100%, 22rem);
    aspect-ratio: 4 / 5.4;
    background-repeat: no-repeat;
    border: 1px solid var(--line-strong);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .cc__stage:active {
    cursor: grabbing;
  }
  .cc__grabHint {
    position: absolute;
    top: 6px;
    left: 6px;
    font-size: 0.5rem;
    color: #f4f1ea;
    mix-blend-mode: difference;
    pointer-events: none;
  }
  .cc__controls {
    display: grid;
    gap: 1rem;
    align-content: start;
  }
  .cc__zoom {
    display: grid;
    gap: 0.4rem;
  }
  .cc__zoom input {
    width: 100%;
  }
  .cc__note {
    color: var(--fg-faint);
    font-size: 0.58rem;
    line-height: 1.5;
  }
  .cc__actions {
    display: grid;
    gap: 0.5rem;
  }
  .cc__reset,
  .cc__save {
    padding: 0.7em 1em;
    cursor: pointer;
    border: 1px solid var(--line-strong);
    background: none;
    color: var(--fg-dim);
  }
  .cc__reset:hover {
    color: var(--fg);
    border-color: var(--fg-dim);
  }
  .cc__save {
    background: var(--accent);
    color: var(--ink-fg);
    border-color: var(--accent);
  }
  .cc__save:disabled,
  .cc__reset:disabled {
    opacity: 0.5;
    cursor: default;
  }
  @media (max-width: 620px) {
    .cc__body {
      grid-template-columns: 1fr;
    }
  }
</style>
