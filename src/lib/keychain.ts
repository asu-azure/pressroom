/**
 * Markup for the soundtrack's acrylic keychain (styles: src/styles/keychain.css,
 * physics: src/scripts/dangle.ts). One builder, so the shelf's charm (a Svelte
 * island) and /ost (Astro) can't drift apart.
 *
 * Every input is build-time data from this repo — an image URL, the imported
 * waveform, a QR SVG generated on the server from our own URL — never visitor or
 * author text, which is why a string template is fine here.
 */
/** Beads in the ball chain between the hook and the jump ring. */
export const BEADS = 12;

export interface KeychainData {
  /** printed artwork (square) */
  art: string;
  /** 48 bar heights, 0..1 (starfall.json `wave`) */
  wave: number[];
  /** the QR printed on the back, as markup (a PNG <img> from the qrcode package, server-side) */
  qr: string;
  title: { ja: string; en: string };
}

/** The waveform "sound code" as SVG bars — also used by the scan animation. */
export function waveSvg(wave: number[]): string {
  const bars = wave
    .map((v, i) => {
      const h = Math.max(0.12, Math.min(1, v)) * 10;
      return `<rect style="--i:${i}" x="${(i + 0.18).toFixed(2)}" y="${(6 - h / 2).toFixed(2)}" width="0.64" height="${h.toFixed(2)}" rx="0.32"/>`;
    })
    .join('');
  return `<svg class="kc__waveSvg" viewBox="0 0 ${wave.length} 12" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
}

/** Everything inside a `.kc__stage`: hook, chain, and the charm. */
export function keychainHtml(d: KeychainData): string {
  const print = (back: boolean) =>
    back
      ? `<div class="kc__print kc__print--back">` +
        `<span class="kc__art kc__art--through" style="background-image:url(${d.art})"></span>` +
        `<span class="kc__qr">${d.qr}</span>` +
        `<span class="kc__scanme">SCAN ME · PRESSROOM</span>` +
        `</div>`
      : `<div class="kc__print">` +
        `<span class="kc__art" style="background-image:url(${d.art})"></span>` +
        `<span class="kc__code" data-kc-wave>${waveSvg(d.wave)}</span>` +
        `<span class="kc__type"><b>${d.title.ja}</b><span>${d.title.en}</span></span>` +
        `</div>`;
  // star holo: two scattered star screens + diffraction lines (keychain.css)
  const holo =
    `<span class="kc__holo"><i class="kc__stars kc__stars--a"></i><i class="kc__stars kc__stars--b"></i>` +
    `<i class="kc__lines"></i></span>`;
  const face = (back: boolean) =>
    `<div class="kc__face ${back ? 'kc__back' : 'kc__front'}">` +
    `<span class="kc__plate"></span><span class="kc__hole"></span>` +
    print(back) +
    holo +
    `<span class="kc__spec"></span>` +
    `</div>`;
  // The chain lives in the stage's own 2D space (the physics moves each bead);
  // the charm is one 3D object hung from the jump ring, which passes through
  // the plate's hole — half in front of the acrylic, half behind it.
  const beads = Array.from({ length: BEADS - 1 }, (_, i) => `<i class="kc__bead" style="--i:${i + 1}"></i>`).join('');
  return (
    `<span class="kc__hook" aria-hidden="true"></span>` +
    `<span class="kc__chain" aria-hidden="true"><svg class="kc__links"><polyline data-kc-links points=""/></svg>${beads}</span>` +
    `<div class="kc" data-kc aria-hidden="true">` +
    `<span class="kc__ring"></span>` +
    `<div class="kc__body">` +
    face(false) +
    face(true) +
    `<span class="kc__edge kc__edge--l"></span><span class="kc__edge kc__edge--r"></span>` +
    `<span class="kc__edge kc__edge--t"></span><span class="kc__edge kc__edge--b"></span>` +
    `</div></div>`
  );
}
