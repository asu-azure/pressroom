/**
 * Every texture the crate needs, drawn on a canvas at run time, so the page ships no image
 * files of its own: the sparkle, the soft shadow, the disc's printed face, the grooves that
 * make a CD's underside throw light streaks, the COMING sticker and the wood of the crate.
 */
import type { CanvasTexture } from 'three';

type Three = typeof import('three');

const pad = (w: number, h = w) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
};

/** Disc dimensions in cm (a real CD): the texture covers the square of the outer diameter. */
export const DISC = { r: 6, hole: 0.75, clear: 1.7, mirror: 2.3 } as const;

/** A four-point star with a soft core, for the twinkles on the case. */
export function sparkleTexture(THREE: Three): CanvasTexture {
  const S = 128;
  const [c, g] = pad(S);
  const m = S / 2;
  const glow = g.createRadialGradient(m, m, 0, m, m, m * 0.5);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#fff';
  for (const [w, h] of [
    [m * 0.07, m * 0.98],
    [m * 0.98, m * 0.07],
  ]) {
    g.beginPath();
    g.moveTo(m - w, m);
    g.quadraticCurveTo(m, m, m, m - h);
    g.quadraticCurveTo(m, m, m + w, m);
    g.quadraticCurveTo(m, m, m, m + h);
    g.quadraticCurveTo(m, m, m - w, m);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft oval shadow, white in the middle fading out (used as an alpha map). */
export function shadowTexture(THREE: Three): CanvasTexture {
  const S = 256;
  const [c, g] = pad(S);
  const m = S / 2;
  const r = g.createRadialGradient(m, m, 0, m, m, m);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.fillStyle = r;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/**
 * The disc's printed face: the cover, clipped to the disc, around a clear hub with its mirror
 * band. Mapped by a RingGeometry, whose UVs cover the square of the outer diameter.
 */
export function discFace(THREE: Three, img: CanvasImageSource | null, size = 1024): CanvasTexture {
  const [c, g] = pad(size);
  const m = size / 2;
  const cm = m / DISC.r;
  g.save();
  g.beginPath();
  g.arc(m, m, m, 0, Math.PI * 2);
  g.clip();
  if (img) g.drawImage(img, 0, 0, size, size);
  else {
    g.fillStyle = '#d9dce2';
    g.fillRect(0, 0, size, size);
  }
  // the clear hub: plastic you can see the tray through, read as a pale grey
  const hub = g.createRadialGradient(m, m, DISC.hole * cm, m, m, DISC.mirror * cm);
  hub.addColorStop(0, '#5d636d');
  hub.addColorStop(DISC.clear / DISC.mirror - 0.02, '#8a909a');
  hub.addColorStop(DISC.clear / DISC.mirror, '#6c727c');
  hub.addColorStop(0.86, '#c3c8d0');
  hub.addColorStop(1, '#868c96');
  g.fillStyle = hub;
  g.beginPath();
  g.arc(m, m, DISC.mirror * cm, 0, Math.PI * 2);
  g.fill();
  // the stacking ring and the print's edge
  g.lineWidth = size / 512;
  g.strokeStyle = 'rgba(40,44,52,0.35)';
  for (const r of [DISC.clear - 0.25, DISC.mirror]) {
    g.beginPath();
    g.arc(m, m, r * cm, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  g.lineWidth = size / 160;
  g.strokeStyle = 'rgba(10,12,16,0.55)';
  g.beginPath();
  g.arc(m, m, m - g.lineWidth / 2, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Anisotropy directions for a CD's underside: tangent to circles round the centre, so the
 * highlights stretch into the radial streaks a real disc throws. RG = direction, B = strength.
 */
export function grooveMap(THREE: Three): CanvasTexture {
  const S = 256;
  const [c, g] = pad(S);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S - 0.5;
      const dy = 0.5 - (y + 0.5) / S;
      const r = Math.hypot(dx, dy) || 1;
      const i = (y * S + x) * 4;
      img.data[i] = Math.round(((-dy / r) * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round(((dx / r) * 0.5 + 0.5) * 255);
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** A round sticker with one word on it (COMING). */
export function stickerTexture(THREE: Three, word: string): CanvasTexture {
  const S = 256;
  const [c, g] = pad(S);
  const m = S / 2;
  g.fillStyle = '#f4d35e';
  g.beginPath();
  g.arc(m, m, m - 4, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(22,20,15,0.5)';
  g.beginPath();
  g.arc(m, m, m - 16, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#16140f';
  g.font = `700 ${Math.round(S * 0.17)}px 'JetBrains Mono', ui-monospace, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(word, m, m + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Pine boards for the crate: long grain, a few knots, sanded pale. Tiles along U. */
export function woodTexture(THREE: Three): CanvasTexture {
  const W = 512;
  const H = 128;
  const [c, g] = pad(W, H);
  g.fillStyle = '#c4a47c';
  g.fillRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const y = rnd() * H;
    const a = 0.05 + rnd() * 0.12;
    g.strokeStyle = rnd() > 0.5 ? `rgba(92,56,26,${a})` : `rgba(236,200,150,${a})`;
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= W; x += 32) g.lineTo(x, y + Math.sin(x / 90 + i) * 2.5 * rnd());
    g.stroke();
  }
  for (let k = 0; k < 3; k++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const knot = g.createRadialGradient(x, y, 0, x, y, 9);
    knot.addColorStop(0, 'rgba(70,40,18,0.7)');
    knot.addColorStop(1, 'rgba(70,40,18,0)');
    g.fillStyle = knot;
    g.beginPath();
    g.ellipse(x, y, 14, 6, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * The veil behind a case in the hands: dark in the middle, gone by the canvas's edges, so it reads
 * as the light dropping around the case rather than a dark box. The pane is 1.2× the view, so the
 * view's edge is at 0.83 of the radius.
 */
export function veilTexture(THREE: Three): CanvasTexture {
  const S = 256;
  const [c, g] = pad(S);
  const m = S / 2;
  const r = g.createRadialGradient(m, m, 0, m, m, m);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.82, 'rgba(255,255,255,0)');
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.fillStyle = r;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
