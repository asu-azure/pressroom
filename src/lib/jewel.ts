/**
 * Markup for the jewel case (styles in src/styles/jewel.css, physics in
 * src/scripts/book3d.ts). One builder so the shelf's CD (a Svelte island) and
 * /ost (Astro) can't drift apart. Every input is build-time data from this repo
 * — image URLs and the imported movement names — never visitor or author text,
 * which is why a string template is fine here.
 */
export interface JewelArt {
  front: string;
  back: string;
  disc: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function jewelHtml(art: JewelArt, tracks: string[], opts: { withDisc?: boolean } = {}): string {
  const list = tracks.map((t) => `<li>${esc(t)}</li>`).join('');
  const disc = opts.withDisc
    ? `<div class="jc__disc"><div class="jc__spin" style="background-image:url(${art.disc})">` +
      `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><path id="jc-ring" d="M50,50 m-33,0 a33,33 0 1,1 66,0 a33,33 0 1,1 -66,0"/></defs>` +
      `<text><textPath href="#jc-ring">STARFALL NOCTURNE · ดาวตก · ASU AZURE · PRESSROOM ·</textPath></text></svg>` +
      `</div></div>`
    : '';
  return (
    `<div class="jc__face jc__tray">${disc}</div>` +
    `<div class="jc__lid">` +
    `<div class="jc__face jc__front"><span class="jc__art" style="background-image:url(${art.front})"></span></div>` +
    `<div class="jc__face jc__inside"><span>PRESSROOM OST</span><b>ดาวตก</b><span>STARFALL NOCTURNE</span></div>` +
    `</div>` +
    `<div class="jc__face jc__back"><div class="jc__inlay" style="background-image:url(${art.back})">` +
    `<ol class="jc__tracks">${list}</ol><span class="jc__colophon">ASU AZURE · PRESSROOM</span></div></div>` +
    `<div class="jc__face jc__spine"><span>ดาวตก — STARFALL NOCTURNE</span></div>` +
    `<div class="jc__face jc__fore"></div>` +
    `<div class="jc__face jc__head"></div>` +
    `<div class="jc__face jc__tail"></div>`
  );
}
