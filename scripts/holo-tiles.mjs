#!/usr/bin/env node
/**
 * The keychain's star holo screens as PNG mask tiles (public/kc/stars-{a,b}.png).
 *
 *   node scripts/holo-tiles.mjs
 *
 * They were inline SVG data URIs, and Chrome rasterises an SVG mask image on the
 * main thread the first time it paints: mounting the keychain cost a ~0.5 s
 * frame on an Intel iGPU. A PNG decodes off-thread. Drawn at 3× so the stars
 * stay crisp when the charm is scaled up on /ost.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/kc');
mkdirSync(out, { recursive: true });

const star = (x, y, r) =>
  `<path d="M${x} ${y - r}L${x + r * 0.22} ${y - r * 0.22}L${x + r} ${y}L${x + r * 0.22} ${y + r * 0.22}L${x} ${y + r}L${x - r * 0.22} ${y + r * 0.22}L${x - r} ${y}L${x - r * 0.22} ${y - r * 0.22}Z"/>`;
const dot = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const SCALE = 3;
const tile = (w, parts) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w * SCALE}" height="${w * SCALE}" viewBox="0 0 ${w} ${w}" fill="#fff">${parts.join('')}</svg>`;

const tiles = {
  'stars-a.png': tile(36, [star(7, 8, 3.2), star(24, 5, 1.8), star(29, 22, 2.8), star(13, 27, 1.5), star(4, 32, 2.1), star(19, 15, 1), dot(31, 11, 0.7), dot(9, 19, 0.6), dot(25, 31, 0.6)]),
  'stars-b.png': tile(23, [star(5, 6, 1.6), star(16, 12, 1.2), star(9, 18, 0.9), dot(19, 3, 0.5), dot(2, 14, 0.5)]),
};
for (const [name, svg] of Object.entries(tiles)) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(resolve(out, name));
  console.log('wrote public/kc/' + name);
}
