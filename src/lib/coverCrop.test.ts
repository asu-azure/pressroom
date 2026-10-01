import { describe, expect, it } from 'vitest';
import { cropAttr, cropFocus, cropImgStyle, frontOnly, parseCropAttr, pictureLayer, wrapBack } from './coverCrop';
import type { PageRec } from './types';

// the real published covers: 1600×1140 wraparounds, front on the left (RTL books)
const cover: PageRec = {
  id: 'p1',
  sortKey: 'a0',
  spreadPairId: null,
  chapterId: null,
  width: 1600,
  height: 1140,
  fullUrl: 'f',
  medUrl: 'm',
  thumbUrl: 't',
  note: null,
  bubbles: [
    { id: 'in', panel: 1, charId: null, x: 0.1, y: 0.2, w: 0.1, h: 0.1, text: 'front' },
    { id: 'out', panel: 1, charId: null, x: 0.8, y: 0.2, w: 0.1, h: 0.1, text: 'back cover' },
  ],
  isBlank: false,
};
const front = { x: 0, y: 0, w: 0.5277777777777778, h: 1 };

describe('wrapBack', () => {
  it('finds the back beside a front that hugs either edge', () => {
    expect(wrapBack(front)).toMatchObject({ right: true });
    expect(wrapBack({ x: 0.48, y: 0, w: 0.52, h: 1 })).toMatchObject({ right: false, x: 0 });
  });

  it('is null for a framing crop, a full crop or none', () => {
    expect(wrapBack({ x: 0.2, y: 0.1, w: 0.5, h: 0.6 })).toBeNull();
    expect(wrapBack({ x: 0, y: 0, w: 1, h: 1 })).toBeNull();
    expect(wrapBack(null)).toBeNull();
  });
});

describe('frontOnly', () => {
  it('turns a wraparound cover into its front, in real pixels', () => {
    const p = frontOnly(cover, front);
    expect([p.width, p.height]).toEqual([844, 1140]);
    expect(p.crop).toEqual(front);
    expect(p.width / p.height).toBeLessThan(1); // a book cover, portrait
  });

  it('keeps translation boxes on the front, moved into its frame, and drops the back’s', () => {
    const p = frontOnly(cover, front);
    expect(p.bubbles.map((b) => b.id)).toEqual(['in']);
    expect(p.bubbles[0].x).toBeCloseTo(0.1 / front.w);
    expect(p.bubbles[0].w).toBeCloseTo(0.1 / front.w);
  });

  it('trims the front to the inner pages’ shape, off the spine side', () => {
    // the real book: front 844×1140 (0.740), pages 1151×1600 (0.719)
    const inner = { width: 1151, height: 1600 };
    const p = frontOnly(cover, front, inner);
    expect(p.width / p.height).toBeCloseTo(inner.width / inner.height, 3);
    expect(p.height).toBe(1140);
    expect(p.crop!.x).toBe(0); // the outer edge stays; the spine edge moves in
    expect(p.crop!.w).toBeLessThan(front.w);
    // front on the right (back on the left): the spine is the left edge
    const r = frontOnly(cover, { x: 1 - front.w, y: 0, w: front.w, h: 1 }, inner);
    expect(r.crop!.x + r.crop!.w).toBeCloseTo(1, 6);
    expect(r.crop!.x).toBeGreaterThan(1 - front.w);
  });

  it('takes spare height evenly off head and tail when the pages are wider', () => {
    const p = frontOnly(cover, front, { width: 1200, height: 1600 });
    expect(p.width / p.height).toBeCloseTo(0.75, 3);
    expect(p.crop!.w).toBe(front.w);
    expect(p.crop!.y).toBeCloseTo((1 - p.crop!.h) / 2, 6);
  });

  it('keeps the author’s crop when matching would cut too much, or without a page', () => {
    expect(frontOnly(cover, front, { width: 600, height: 1600 }).crop).toEqual(front);
    expect(frontOnly(cover, front, null).crop).toEqual(front);
    expect(frontOnly(cover, front, { width: 0, height: 0 }).crop).toEqual(front);
  });

  it('leaves the page whole for a framing crop, no crop, or a blank leaf', () => {
    expect(frontOnly(cover, { x: 0.2, y: 0.1, w: 0.5, h: 0.6 })).toBe(cover);
    expect(frontOnly(cover, null)).toBe(cover);
    const blank = { ...cover, isBlank: true };
    expect(frontOnly(blank, front)).toBe(blank);
  });
});

describe('CSS helpers', () => {
  it('scales and shifts the picture so only the crop shows', () => {
    expect(cropImgStyle({ x: 0.5, y: 0, w: 0.5, h: 1 })).toBe('width:200%;height:100%;left:-100%;top:0%;');
  });

  it('positions a background layer on the crop, or contains the whole picture', () => {
    expect(pictureLayer('a.webp')).toBe('url("a.webp") center/contain no-repeat');
    expect(pictureLayer('a.webp', { x: 0, y: 0, w: 0.5, h: 1 })).toBe('url("a.webp") 0% 0% / 200% 100% no-repeat');
    // a front on the right: all the spare room before it
    expect(pictureLayer('a.webp', { x: 0.5, y: 0, w: 0.5, h: 1 })).toBe('url("a.webp") 100% 0% / 200% 100% no-repeat');
    expect(cropFocus({ x: 0.5, y: 0, w: 0.5, h: 1 })).toBe('100% 0%');
    expect(cropFocus(null)).toBeUndefined();
  });

  it('round-trips the crop through data-crop, and rejects junk', () => {
    expect(parseCropAttr(cropAttr(front))).toEqual({ x: 0, y: 0, w: 0.52778, h: 1 });
    for (const s of [undefined, '', '1,2,3', 'a,b,c,d', '0,0,0,1']) expect(parseCropAttr(s)).toBeNull();
  });
});
