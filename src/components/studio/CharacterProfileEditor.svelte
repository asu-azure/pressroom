<script lang="ts">
  import RichTextEditor from './RichTextEditor.svelte';
  import { uploadCastImage, uploadCastIcon, loadImageFile } from '../../lib/castImage';
  import type { Character } from '../../lib/types';

  // `character` is a deep-$state proxy item from WorkEditor's meta.characters —
  // mutating its fields here updates the parent form directly (same idiom as
  // the cast rows' bind:value). Nothing persists until SAVE META.
  let { character, workId }: { character: Character; workId: string } = $props();

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  // --- Face icon: pick a file → drag/zoom a square frame → bake + upload ---
  let cropUrl = $state<string | null>(null);
  let cropImg: HTMLImageElement | null = null;
  let zoom = $state(1);
  let cx = $state(0.5);
  let cy = $state(0.5);
  let iconBusy = $state(false);

  const imgAr = $derived(cropImg ? cropImg.width / cropImg.height : 1);

  // Square frame in image-normalized units (same math as CoverCropper, AR=1):
  // shown pixels w·W × h·H must be square → h = w·imgAr, clamped to the unit box.
  function boxAt(z: number): { w: number; h: number } {
    let w = 1;
    let h = imgAr;
    if (h > 1) {
      h = 1;
      w = 1 / imgAr;
    }
    return { w: w / z, h: h / z };
  }
  const box = $derived(boxAt(zoom));
  const ccx = $derived(clamp(cx, box.w / 2, 1 - box.w / 2));
  const ccy = $derived(clamp(cy, box.h / 2, 1 - box.h / 2));
  const crop = $derived({
    x: clamp(ccx - box.w / 2, 0, 1),
    y: clamp(ccy - box.h / 2, 0, 1),
    w: box.w,
    h: box.h,
  });
  const bgStyle = $derived(
    cropUrl
      ? `background-image:url(${cropUrl});` +
        `background-size:${100 / crop.w}% ${100 / crop.h}%;` +
        `background-position:${(crop.x / (1 - crop.w)) * 100 || 0}% ${(crop.y / (1 - crop.h)) * 100 || 0}%;`
      : '',
  );

  let stage: HTMLElement;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  function onPointerDown(e: PointerEvent) {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    stage.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const r = stage.getBoundingClientRect();
    cx = clamp(cx - ((e.clientX - lastX) / r.width) * box.w, box.w / 2, 1 - box.w / 2);
    cy = clamp(cy - ((e.clientY - lastY) / r.height) * box.h, box.h / 2, 1 - box.h / 2);
    lastX = e.clientX;
    lastY = e.clientY;
  }
  function onPointerUp(e: PointerEvent) {
    dragging = false;
    if (stage.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);
  }

  async function onPickIcon(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      cropImg = await loadImageFile(file);
      if (cropUrl) URL.revokeObjectURL(cropUrl);
      // Re-create an object URL for CSS preview (loadImageFile revoked its own).
      cropUrl = URL.createObjectURL(file);
      zoom = 1;
      cx = 0.5;
      cy = 0.5;
    } catch (err) {
      console.error(err);
      alert('Could not read that image.');
    }
  }

  async function bakeIcon() {
    if (!cropImg) return;
    iconBusy = true;
    try {
      const url = await uploadCastIcon(
        cropImg,
        { sx: crop.x * cropImg.width, sy: crop.y * cropImg.height, ss: crop.w * cropImg.width },
        workId,
        character.id,
      );
      character.iconUrl = url;
      cancelCrop();
    } catch (err) {
      console.error(err);
      alert('Icon upload failed. See console.');
    } finally {
      iconBusy = false;
    }
  }
  function cancelCrop() {
    if (cropUrl) URL.revokeObjectURL(cropUrl);
    cropUrl = null;
    cropImg = null;
  }

  // --- Gallery ---
  let galleryBusy = $state(false);
  async function onPickGallery(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])].filter((f) => f.type.startsWith('image/'));
    input.value = '';
    if (!files.length) return;
    galleryBusy = true;
    try {
      for (const file of files) {
        const url = await uploadCastImage(file, workId, character.id);
        character.images = [...(character.images ?? []), { url }];
      }
    } catch (err) {
      console.error(err);
      alert('Image upload failed. See console.');
    } finally {
      galleryBusy = false;
    }
  }
  function moveImage(i: number, dir: -1 | 1) {
    const list = character.images ?? [];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    character.images = next;
  }
  function removeImage(i: number) {
    character.images = (character.images ?? []).filter((_, k) => k !== i);
  }
</script>

<div class="cpe" style={`--c:${character.color}`}>
  <label class="cpe__field">
    <span class="mono">REAL NAME / 本名 (OPTIONAL — SHOWN SMALLER UNDER THE NICKNAME)</span>
    <input
      type="text"
      value={character.realName ?? ''}
      oninput={(e) => (character.realName = (e.currentTarget as HTMLInputElement).value)}
      placeholder="Full name — the nickname above is what readers know them by"
    />
  </label>

  <label class="cpe__field">
    <span class="mono">ROLE (MICRO-LABEL, e.g. PROTAGONIST / 主人公)</span>
    <input
      type="text"
      value={character.role ?? ''}
      oninput={(e) => (character.role = (e.currentTarget as HTMLInputElement).value)}
      placeholder="PROTAGONIST"
    />
  </label>

  <div class="cpe__field">
    <span class="mono">FACE ICON (SQUARE — SHOWN ON THE ROSTER TILE)</span>
    <div class="cpe__iconRow">
      {#if character.iconUrl}
        <img class="cpe__iconCur" src={character.iconUrl} alt="Current face icon" />
      {:else}
        <span class="cpe__iconEmpty mono">NO ICON</span>
      {/if}
      <label class="mono cpe__pick">
        {cropUrl ? 'CHANGE FILE' : '+ CHOOSE IMAGE'}
        <input type="file" accept="image/*" onchange={onPickIcon} />
      </label>
    </div>
    {#if cropUrl}
      <div class="cpe__crop">
        <div
          class="cpe__stage"
          bind:this={stage}
          style={bgStyle}
          onpointerdown={onPointerDown}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
          role="slider"
          tabindex="0"
          aria-label="Drag to frame the face"
          aria-valuenow={Math.round(zoom * 100)}
        >
          <span class="mono cpe__grabHint">🖐 DRAG</span>
        </div>
        <div class="cpe__cropCtl">
          <label class="cpe__zoom">
            <span class="mono">ZOOM</span>
            <input type="range" min="1" max="6" step="0.02" bind:value={zoom} />
          </label>
          <button type="button" class="mono cpe__set" onclick={bakeIcon} disabled={iconBusy}>
            {iconBusy ? 'UPLOADING…' : 'SET ICON'}
          </button>
          <button type="button" class="mono cpe__cancel" onclick={cancelCrop}>CANCEL</button>
        </div>
      </div>
    {/if}
  </div>

  <div class="cpe__field">
    <span class="mono">GALLERY (PROFILE ARTWORK — ORDERED)</span>
    <div class="cpe__gallery">
      {#each character.images ?? [] as im, i (im.url)}
        <div class="cpe__gRow">
          <img class="cpe__gThumb" src={im.url} alt="" />
          <input
            class="cpe__gCap"
            type="text"
            value={im.caption ?? ''}
            oninput={(e) => (im.caption = (e.currentTarget as HTMLInputElement).value)}
            placeholder="Caption (optional)"
          />
          <button type="button" class="mono cpe__gBtn" onclick={() => moveImage(i, -1)} disabled={i === 0} title="Move up">↑</button>
          <button type="button" class="mono cpe__gBtn" onclick={() => moveImage(i, 1)} disabled={i === (character.images?.length ?? 0) - 1} title="Move down">↓</button>
          <button type="button" class="mono cpe__gBtn cpe__gBtn--del" onclick={() => removeImage(i)} title="Remove">✕</button>
        </div>
      {/each}
      <label class="mono cpe__pick">
        {galleryBusy ? 'UPLOADING…' : '+ ADD IMAGES'}
        <input type="file" accept="image/*" multiple onchange={onPickGallery} disabled={galleryBusy} />
      </label>
    </div>
  </div>

  <div class="cpe__field">
    <span class="mono">BIO / 紹介 (SHOWN IN THE CAST FILE — IMAGES LIVE IN THE GALLERY ABOVE)</span>
    <RichTextEditor
      value={character.bio ?? ''}
      {workId}
      allowImages={false}
      onChange={(html) => (character.bio = html)}
      placeholder="Who are they? What's their role in the story? Write freely — readers open this from the book page."
    />
  </div>

  <p class="mono cpe__hint">Uploads land immediately; the profile itself is stored when you SAVE META.</p>
</div>

<style>
  .cpe {
    display: grid;
    gap: 1rem;
    padding: 0.9rem;
    border: 1px solid var(--line);
    border-left: 3px solid var(--c, var(--accent));
    background: var(--bg-soft);
  }
  .cpe__field {
    display: grid;
    gap: 0.45rem;
  }
  .cpe__field input[type='text'] {
    background: var(--bg);
    border: 1px solid var(--line-strong);
    color: var(--fg);
    font: inherit;
    padding: 0.55em 0.8em;
  }
  .cpe__field input[type='text']:focus {
    outline: none;
    border-color: var(--accent);
  }
  .cpe__iconRow {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }
  .cpe__iconCur {
    width: 3.4rem;
    height: 3.4rem;
    object-fit: cover;
    border: 1px solid var(--c, var(--line-strong));
  }
  .cpe__iconEmpty {
    display: grid;
    place-items: center;
    width: 3.4rem;
    height: 3.4rem;
    border: 1px dashed var(--line-strong);
    color: var(--fg-faint);
    font-size: 0.5rem;
  }
  .cpe__pick {
    position: relative;
    display: inline-block;
    padding: 0.6em 1em;
    border: 1px dashed var(--line-strong);
    color: var(--fg-dim);
    cursor: pointer;
    justify-self: start;
  }
  .cpe__pick:hover {
    color: var(--fg);
    border-color: var(--fg-dim);
  }
  .cpe__pick input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .cpe__crop {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1rem;
    align-items: start;
  }
  .cpe__stage {
    width: min(14rem, 60vw);
    aspect-ratio: 1;
    background-repeat: no-repeat;
    border: 1px solid var(--line-strong);
    cursor: grab;
    touch-action: none;
    user-select: none;
    position: relative;
  }
  .cpe__stage:active {
    cursor: grabbing;
  }
  .cpe__grabHint {
    position: absolute;
    top: 6px;
    left: 6px;
    font-size: 0.5rem;
    color: #f4f1ea;
    mix-blend-mode: difference;
    pointer-events: none;
  }
  .cpe__cropCtl {
    display: grid;
    gap: 0.7rem;
    align-content: start;
  }
  .cpe__zoom {
    display: grid;
    gap: 0.4rem;
  }
  .cpe__set {
    background: var(--accent);
    color: var(--ink-fg);
    border: 1px solid var(--accent);
    padding: 0.6em 1em;
    cursor: pointer;
  }
  .cpe__set:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .cpe__cancel {
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    padding: 0.6em 1em;
    cursor: pointer;
  }
  .cpe__gallery {
    display: grid;
    gap: 0.5rem;
  }
  .cpe__gRow {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .cpe__gThumb {
    width: 3rem;
    height: 3rem;
    object-fit: cover;
    border: 1px solid var(--line-strong);
    flex-shrink: 0;
  }
  .cpe__gCap {
    flex: 1;
    min-width: 0;
  }
  .cpe__gBtn {
    background: none;
    border: 1px solid var(--line-strong);
    color: var(--fg-dim);
    padding: 0.45em 0.7em;
    cursor: pointer;
    flex-shrink: 0;
  }
  .cpe__gBtn:hover:not(:disabled) {
    color: var(--fg);
    border-color: var(--fg-dim);
  }
  .cpe__gBtn:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .cpe__gBtn--del:hover {
    color: #e8a31a;
    border-color: #e8a31a;
  }
  .cpe__hint {
    color: var(--fg-faint);
    font-size: 0.55rem;
  }
  @media (max-width: 620px) {
    .cpe__crop {
      grid-template-columns: 1fr;
    }
  }
</style>
