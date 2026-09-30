#!/usr/bin/env node
/**
 * The studio wall's plaster (public/wall/plaster.png), a seamless grain tile.
 *
 *   node scripts/wall-tiles.mjs
 *
 * A PNG, not an SVG turbulence filter: SVG images are rasterised on the main
 * thread (see the keychain's star tiles). Seeded, so re-running it is a no-op.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/wall');
mkdirSync(out, { recursive: true });

const N = 64; // shown at 128 px: the upscale softens it into grain
let s = 0x2742f0;
const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
// grey + alpha: white and black flecks over transparent, softened a touch
const px = Buffer.alloc(N * N * 2);
for (let i = 0; i < N * N; i++) {
  const v = rand();
  px[i * 2] = v > 0.5 ? 255 : 0;
  px[i * 2 + 1] = Math.round(Math.abs(v - 0.5) * 2 * 6) * 4; // 7 faint levels: compresses
}
await sharp(px, { raw: { width: N, height: N, channels: 2 } })
  .png({ compressionLevel: 9, palette: false })
  .toFile(resolve(out, 'plaster.png'));
console.log('wrote public/wall/plaster.png');
