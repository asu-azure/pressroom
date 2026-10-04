import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CARD_H, CARD_W, cardSvg, plasterGrain, printBox } from './shareCard';

describe('printBox', () => {
  it('fits every aspect inside the card, the picture at its own aspect', () => {
    for (const a of [0.25, 0.36, 0.7, 1, 1.52, 3]) {
      const p = printBox(a);
      expect(p.x).toBeGreaterThanOrEqual(80);
      expect(p.x + p.w).toBeLessThanOrEqual(CARD_W - 80);
      expect(p.y).toBeGreaterThanOrEqual(60);
      expect(p.y + p.h).toBeLessThanOrEqual(CARD_H - 40);
      expect(p.imgW / p.imgH).toBeCloseTo(a, 1);
      expect(p.w).toBe(p.imgW + 2 * p.b);
      expect(p.bb).toBeGreaterThan(p.b * 2);
    }
  });

  it('never asks for more picture than the source has', () => {
    const p = printBox(0.7, 300, 428);
    expect(p.imgW).toBeLessThanOrEqual(300);
    expect(p.imgH).toBeLessThanOrEqual(428);
  });

  it('uses the full height for a portrait piece', () => {
    expect(printBox(0.7).h).toBeGreaterThan(480);
  });
});

describe('cardSvg', () => {
  const art = 'data:image/jpeg;base64,AAAA';
  it('draws the print with its holder, and no text', () => {
    for (const hold of ['tape', 'tape2', 'pin'] as const) {
      const svg = cardSvg({ box: printBox(0.8), r: -2.1, hold, tr: hold === 'pin' ? 1 : 5, art });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain(`href="${art}"`);
      expect(svg).toContain('rotate(-2.1');
      expect(svg).not.toMatch(/<text/);
      expect(svg).toMatch(hold === 'pin' ? /url\(#pin\)/ : /<polygon/);
    }
  });
});

describe('plasterGrain', () => {
  it('matches public/wall/plaster.png pixel for pixel', async () => {
    const sharp = (await import('sharp')).default;
    const g = plasterGrain();
    // sharp reads the grey+alpha PNG as RGBA; spread the grain the same way
    const png = await sharp(readFileSync('public/wall/plaster.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([png.info.width, png.info.height]).toEqual([g.width, g.height]);
    const rgba = new Uint8Array(g.width * g.height * 4);
    for (let i = 0; i < g.width * g.height; i++) rgba.set([g.data[i * 2], g.data[i * 2], g.data[i * 2], g.data[i * 2 + 1]], i * 4);
    expect(Buffer.compare(png.data, Buffer.from(rgba))).toBe(0);
  });
});
