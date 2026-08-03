// 3D perspective RGB text reveal (ACT V). Splits a heading into characters that
// swing up from a flat -90° rotateX out of depth (z), each starting as a hard
// chromatic-aberration split (--vel:1) that resolves crisp (--vel:0) — the
// "digital, letter-by-letter" look from the reference MV. Mirrors assemble()'s
// ergonomics. Reduced-motion → plain static text.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import SplitType from 'split-type';

gsap.registerPlugin(ScrollTrigger);

import { needsWordSplit, splitWords } from './kinetic';
import type { KineticHandle } from './kinetic';

export function init3DText(
  el: HTMLElement,
  opts: { start?: string; reduced?: boolean } = {},
): KineticHandle | null {
  const { start = 'top 82%', reduced = false } = opts;
  if (reduced) return null;

  // Thai shaping must stay intact — split per word, not per char (see kinetic.ts)
  const split = needsWordSplit(el.textContent ?? '')
    ? splitWords(el)
    : new SplitType(el, { types: 'chars', tagName: 'span' });
  const chars = split.chars ?? [];
  chars.forEach((c) => c.classList.add('chroma'));

  gsap.set(el, { perspective: 620 });
  gsap.set(chars, {
    opacity: 0,
    z: -220,
    rotateX: -90,
    transformOrigin: '50% 100%',
    '--vel': 1,
  });
  const tween = gsap.to(chars, {
    opacity: 1,
    z: 0,
    rotateX: 0,
    '--vel': 0,
    duration: 0.95,
    ease: 'power3.out',
    stagger: { each: 0.05, from: 'start' },
    // Reversible: builds in on scroll-down, falls back into depth on scroll-up.
    scrollTrigger: { trigger: el, start, toggleActions: 'play none none reverse' },
  });
  return {
    revert() {
      tween.scrollTrigger?.kill();
      tween.kill();
      split.revert();
    },
  };
}
