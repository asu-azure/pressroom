/**
 * A book's cover page is the whole wraparound — front, spine and back on one
 * sheet — and `works.cover_crop` marks the front (the Studio's CoverCropper).
 * The shelf's 3D book uses the leftover as the back cover; the reader shows the
 * front only, so the book opens on its front cover and the first page turn
 * hinges on the spine instead of on the far edge of the back cover.
 *
 * Only a crop that hugs one side edge and leaves a back beside it counts as a
 * wraparound. Any other crop is just a framing for the shelf card, and the
 * reader leaves that page whole.
 */
import type { CoverCrop, PageRec } from './types';

/** The back cover beside the front in a wraparound, or null when the crop is just a framing. */
export function wrapBack(c: CoverCrop | null | undefined): { x: number; w: number; right: boolean } | null {
  if (!c) return null;
  const rightRoom = 1 - (c.x + c.w);
  if (c.x < 0.04 && rightRoom > 0.3) return { x: c.x + c.w, w: rightRoom, right: true };
  if (rightRoom < 0.04 && c.x > 0.3) return { x: 0, w: c.x, right: false };
  return null;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** The reader's cover page: the front of the wraparound only, as if the book were closed. */
export function frontOnly(page: PageRec, crop: CoverCrop | null | undefined): PageRec {
  if (!crop || page.isBlank || !wrapBack(crop)) return page;
  const x = clamp01(crop.x);
  const y = clamp01(crop.y);
  const w = Math.max(0.05, Math.min(1 - x, clamp01(crop.w)));
  const h = Math.max(0.05, Math.min(1 - y, clamp01(crop.h)));
  return {
    ...page,
    width: Math.round(page.width * w),
    height: Math.round(page.height * h),
    crop: { x, y, w, h },
    // translation boxes are fractions of the whole sheet: move them onto the front, drop the rest
    bubbles: page.bubbles
      .filter((b) => b.x + b.w / 2 > x && b.x + b.w / 2 < x + w && b.y + b.h / 2 > y && b.y + b.h / 2 < y + h)
      .map((b) => ({ ...b, x: (b.x - x) / w, y: (b.y - y) / h, w: b.w / w, h: b.h / h })),
  };
}

const pct = (n: number) => `${+(n * 100).toFixed(4)}%`;

/** Inline style for an <img> showing only the crop, inside a box of the crop's own aspect. */
export function cropImgStyle(c: CoverCrop): string {
  return `width:${pct(1 / c.w)};height:${pct(1 / c.h)};left:${pct(-c.x / c.w)};top:${pct(-c.y / c.h)};`;
}

/**
 * The picture as one CSS background layer for a box of the page's own aspect:
 * the crop when there is one, else the whole picture contained (the page curl
 * and door overlays draw pages this way).
 */
export function pictureLayer(src: string, c?: CoverCrop | null): string {
  if (!c) return `url("${src}") center/contain no-repeat`;
  return `url("${src}") ${pct(focus(c.x, c.w))} ${pct(focus(c.y, c.h))} / ${pct(1 / c.w)} ${pct(1 / c.h)} no-repeat`;
}

/** object-position that keeps the crop in view for an object-fit: cover thumbnail. */
export function cropFocus(c?: CoverCrop | null): string | undefined {
  return c ? `${pct(focus(c.x, c.w))} ${pct(focus(c.y, c.h))}` : undefined;
}

// a background/object position percentage puts that fraction of the spare room
// before the picture: the crop's offset over the room the crop leaves
function focus(offset: number, size: number): number {
  return size >= 0.9999 ? 0 : offset / (1 - size);
}

/** data-crop on a page element ↔ the crop it shows. */
export const cropAttr = (c: CoverCrop) => [c.x, c.y, c.w, c.h].map((n) => +n.toFixed(5)).join(',');
export function parseCropAttr(s: string | undefined): CoverCrop | null {
  const n = (s ?? '').split(',').map(Number);
  return n.length === 4 && n.every((v) => Number.isFinite(v)) && n[2] > 0 && n[3] > 0 ? { x: n[0], y: n[1], w: n[2], h: n[3] } : null;
}
