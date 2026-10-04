/**
 * The share card for one artwork (pages/og/art/[key].jpg.ts): 1200×630, the
 * piece as a print taped to the studio wall — the same paper border, the same
 * tilt and the same tape or pin it has on /asu's wall (lib/wallLayout.ts).
 *
 * Pure: geometry and one SVG overlay (shadow, paper, the picture embedded as a
 * data URI, tape, light), so the endpoint only fetches and rasterises. No
 * <text> anywhere — a serverless function has no fonts to draw it with, and the
 * platform prints the title under the card anyway.
 */
import { BORDER, BOTTOM, type Hold } from './wallLayout';

export const CARD_W = 1200;
export const CARD_H = 630;
const TOP = 76; // room for the tape above the print
const BOTTOM_M = 44;
const SIDE = 90;
const FILL = 1 - BORDER - BORDER * BOTTOM; // picture height / print height

export interface PrintBox {
  /** print (paper) box on the card, unrotated */
  x: number;
  y: number;
  w: number;
  h: number;
  /** paper border: sides/top and the deeper bottom */
  b: number;
  bb: number;
  /** the picture inside it */
  imgW: number;
  imgH: number;
}

/**
 * The biggest print of this aspect that fits the card's margins, never asking
 * for more picture than the source has.
 */
export function printBox(aspect: number, srcW = Infinity, srcH = Infinity): PrintBox {
  const a = Math.min(4, Math.max(0.2, aspect || 1));
  const maxH = CARD_H - TOP - BOTTOM_M;
  const maxW = CARD_W - 2 * SIDE;
  let h = Math.min(maxH, maxW / (FILL * a + 2 * BORDER));
  // no upscaling past the source picture
  h = Math.min(h, srcH / FILL, srcW / (FILL * a));
  const b = Math.round(h * BORDER);
  const bb = Math.round(h * BORDER * BOTTOM);
  const imgH = Math.round(h - b - bb);
  const imgW = Math.round(imgH * a);
  const w = imgW + 2 * b;
  const hh = imgH + b + bb;
  return { x: Math.round((CARD_W - w) / 2), y: Math.round(TOP + (maxH - hh) / 2), w, h: hh, b, bb, imgW, imgH };
}

const PIN = ['#2742f0', '#e8a31a', '#e0452b'];
// masking tape's torn ends — the same outline as the wall's CSS clip-path
const TAPE = [
  [2, 0], [98, 0], [100, 18], [97, 36], [100, 55], [97, 74], [100, 92], [98, 100],
  [2, 100], [0, 84], [3, 66], [0, 47], [3, 28], [0, 10],
];
const f = (n: number) => (Math.round(n * 10) / 10).toString();

function tape(cx: number, cy: number, w: number, h: number, deg: number): string {
  const pts = TAPE.map(([px, py]) => `${f(cx - w / 2 + (px / 100) * w)},${f(cy - h / 2 + (py / 100) * h)}`).join(' ');
  return `<polygon points="${pts}" fill="url(#tape)" transform="rotate(${f(deg)} ${f(cx)} ${f(cy)})"/>`;
}

function holder(box: PrintBox, hold: Hold, tr: number): string {
  const { x, y, w, h, b } = box;
  if (hold === 'pin') {
    const r = h * 0.045;
    const cx = x + w / 2;
    const cy = y + b * 0.55;
    const c = PIN[Math.max(0, Math.min(2, Math.round(tr)))];
    return (
      `<radialGradient id="pin" cx="34%" cy="30%" r="70%"><stop offset="0.1" stop-color="#fff" stop-opacity=".85"/>` +
      `<stop offset="0.34" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="1"/></radialGradient>` +
      `<circle cx="${f(cx + r * 0.35)}" cy="${f(cy + r * 0.55)}" r="${f(r)}" fill="#000" fill-opacity=".5" filter="url(#soft)"/>` +
      `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="url(#pin)"/>` +
      `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="#000" fill-opacity=".18"/>`
    );
  }
  if (hold === 'tape2') {
    const tw = Math.max(h * 0.2, 60);
    const th = tw * 0.36;
    return tape(x + tw * 0.14, y + th * 0.4, tw, th, -40) + tape(x + w - tw * 0.14, y + th * 0.4, tw, th, 40);
  }
  const tw = Math.min(h * 0.35, w * 0.75);
  return tape(x + w / 2, y + 1, tw, h * 0.1, tr);
}

export interface CardSpec {
  box: PrintBox;
  /** tilt on the wall, degrees */
  r: number;
  hold: Hold;
  /** tape angle or pin colour index (WallPrint.tr) */
  tr: number;
  /** the picture, as a data: URI (JPEG or PNG — what the SVG rasteriser reads) */
  art: string;
}

/** Everything over the plaster, as one SVG the size of the card. */
export function cardSvg({ box, r, hold, tr, art }: CardSpec): string {
  const { x, y, w, h, b, imgW, imgH } = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">` +
    `<defs>` +
    `<filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="${f(h * 0.03)}"/></filter>` +
    `<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(h * 0.008)}"/></filter>` +
    `<linearGradient id="sheen" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/>` +
    `<stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".05"/></linearGradient>` +
    `<linearGradient id="tape" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0e7cf" stop-opacity=".84"/>` +
    `<stop offset="1" stop-color="#ded2b4" stop-opacity=".76"/></linearGradient>` +
    `<radialGradient id="pool1" cx="288" cy="-100" r="560" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe4b6" stop-opacity=".16"/><stop offset="1" stop-color="#ffe4b6" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="pool2" cx="912" cy="-100" r="480" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe4b6" stop-opacity=".1"/><stop offset="1" stop-color="#ffe4b6" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="vignette" cx="600" cy="300" r="760" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>` +
    `</defs>` +
    `<g transform="rotate(${f(r)} ${f(cx)} ${f(y)})">` +
    // shadow, a little below the paper
    `<rect x="${f(x + h * 0.01)}" y="${f(y + h * 0.04)}" width="${w}" height="${h}" fill="#000" fill-opacity=".62" filter="url(#shadow)"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f1ede3"/>` +
    `<image x="${x + b}" y="${y + b}" width="${imgW}" height="${imgH}" preserveAspectRatio="xMidYMid slice" href="${art}"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#sheen)"/>` +
    `<rect x="${f(x + 0.25)}" y="${f(y + 0.25)}" width="${f(w - 0.5)}" height="${f(h - 0.5)}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".5"/>` +
    holder(box, hold, tr) +
    `</g>` +
    `<rect width="${CARD_W}" height="${CARD_H}" fill="url(#pool1)"/>` +
    `<rect width="${CARD_W}" height="${CARD_H}" fill="url(#pool2)"/>` +
    `<rect width="${CARD_W}" height="${CARD_H}" fill="url(#vignette)"/>` +
    `</svg>`
  );
}

/**
 * The wall's plaster grain (same seed and levels as scripts/wall-tiles.mjs →
 * public/wall/plaster.png): 64×64 grey+alpha, made here so the function needs
 * no file from public/.
 */
export function plasterGrain(): { data: Uint8Array; width: number; height: number; channels: 2 } {
  const N = 64;
  let s = 0x2742f0;
  const rand = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const data = new Uint8Array(N * N * 2);
  for (let i = 0; i < N * N; i++) {
    const v = rand();
    data[i * 2] = v > 0.5 ? 255 : 0;
    data[i * 2 + 1] = Math.round(Math.abs(v - 0.5) * 2 * 6) * 4;
  }
  return { data, width: N, height: N, channels: 2 };
}
