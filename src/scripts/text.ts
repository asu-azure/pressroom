// Decode / scramble text effect (FUI flavor): characters randomize then resolve
// left-to-right into the final string over `duration` ms. Extracted from the
// portfolio's inline script so pages can import it.
//
// NOTE: decode() is LATIN-ONLY — its scramble alphabet is A–Z and digits, so
// Japanese text would flicker through nonsense and land wrong. For 日本語 use
// assemble() below, which moves real graphemes rather than substituting them.

import { gsap } from 'gsap';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&/0123456789';

export function decode(el: HTMLElement, finalText: string, duration = 1100) {
  const start = performance.now();
  const len = finalText.length;
  function frame(now: number) {
    const p = Math.min(1, (now - start) / duration);
    const revealed = Math.floor(p * len);
    let out = '';
    for (let i = 0; i < len; i++) {
      if (i < revealed || finalText[i] === ' ') out += finalText[i];
      else out += CHARS[Math.floor(Math.random() * CHARS.length)];
    }
    el.textContent = out;
    if (p < 1) requestAnimationFrame(frame);
    else el.textContent = finalText;
  }
  requestAnimationFrame(frame);
}

/**
 * Scatter-and-gather: each grapheme starts at a random offset, rotation and
 * blur, then converges into place on a randomised stagger.
 *
 * Splits with Intl.Segmenter at grapheme granularity rather than by code unit,
 * so Japanese (and anything with combining marks or surrogate pairs) is not
 * torn apart. That is what makes this usable where decode() is not.
 *
 * Rewrites the node's children, so pass an element whose text is disposable.
 * No-ops under prefers-reduced-motion, leaving the text plainly rendered.
 */
export function assemble(
  node: HTMLElement,
  opts: { duration?: number; delay?: number } = {},
): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const text = node.textContent ?? '';
  if (!text.trim()) return;

  const graphemes = [
    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
  ].map((s) => s.segment);

  node.textContent = '';
  const spans = graphemes.map((g) => {
    const s = document.createElement('span');
    s.textContent = g;
    s.style.display = 'inline-block';
    // Without this, leading/collapsing spaces vanish once each is its own span.
    if (/\s/.test(g)) s.style.whiteSpace = 'pre';
    node.appendChild(s);
    return s;
  });

  gsap.fromTo(
    spans,
    {
      opacity: 0,
      x: () => gsap.utils.random(-90, 90),
      y: () => gsap.utils.random(-40, 40),
      rotate: () => gsap.utils.random(-30, 30),
      filter: 'blur(6px)',
    },
    {
      opacity: 1,
      x: 0,
      y: 0,
      rotate: 0,
      filter: 'blur(0px)',
      duration: opts.duration ?? 0.8,
      ease: 'power3.out',
      stagger: { each: 0.03, from: 'random' },
      delay: opts.delay ?? 0.12,
    },
  );
}
