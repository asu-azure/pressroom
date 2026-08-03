// Selection-invert sweep box — the "drag to select text on a PC" reveal.
// A white fill with mix-blend-mode:difference sweeps L→R across a heading and holds
// as a box, inverting the text + backdrop underneath (white over content = inverse).
// Built on ScrollTrigger; one trigger per heading. Reduced-motion → static inverted box.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function initSelectSweep(
  el: HTMLElement,
  opts: { reduced?: boolean; start?: string } = {},
) {
  const { reduced = false, start = 'top 80%' } = opts;

  // The white inverting fill is a CSS `::after` driven by the `--sw` custom property
  // (not a child node) so it survives i18n `textContent` swaps on the heading.
  el.classList.add('selsweep');

  if (reduced) {
    el.style.setProperty('--sw', '1');
    return;
  }

  gsap.fromTo(
    el,
    { '--sw': 0 },
    {
      '--sw': 1,
      duration: 0.7,
      ease: 'power2.inOut',
      // Reversible: box sweeps in on scroll-down, retracts on scroll-up.
      scrollTrigger: { trigger: el, start, toggleActions: 'play none none reverse' },
    },
  );
}
