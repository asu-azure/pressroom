// Kinetic typography helpers built on GSAP + SplitType.
//  • assemble()  — split a heading into characters that fly in from random
//                  offsets and gather into the word (scroll-triggered, once).
//  • scrambleChars() — per-character "random letters → real letter" settle,
//                  a typewriter/decode flavor that works on a live element.
// Both respect a `reduced` flag (caller passes prefers-reduced-motion) and
// simply leave the text static when motion is off.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import SplitType from 'split-type';

gsap.registerPlugin(ScrollTrigger);

// Handle returned by the kinetic initializers so callers (e.g. the i18n switcher)
// can tear an effect down cleanly and re-run it on fresh text.
export interface KineticHandle { revert(): void }

// Thai (and other mark-stacking / contextually-shaped scripts) must NOT be
// split per character: isolated spans orphan combining vowels/tones (dotted
// circles) and defeat contextual alternates. For those scripts we split per
// WORD — shaping stays intact inside each span and the words animate as units.
const MARK_SCRIPTS = /[฀-๿຀-໿ऀ-ॿក-៿]/; // Thai, Lao, Devanagari, Khmer

export function needsWordSplit(text: string): boolean {
  return MARK_SCRIPTS.test(text);
}

export function splitWords(el: HTMLElement): { chars: HTMLElement[]; revert(): void } {
  const original = el.textContent ?? '';
  el.textContent = '';
  const chars: HTMLElement[] = [];
  for (const part of original.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) { el.appendChild(document.createTextNode(part)); continue; }
    const w = document.createElement('span');
    w.style.display = 'inline-block';
    w.textContent = part;
    chars.push(w);
    el.appendChild(w);
  }
  return { chars, revert() { el.textContent = original; } };
}

export function assemble(
  el: HTMLElement,
  opts: { start?: string; reduced?: boolean } = {},
): KineticHandle | null {
  const { start = 'top 88%', reduced = false } = opts;
  if (reduced) return null;
  const split = needsWordSplit(el.textContent ?? '')
    ? splitWords(el)
    : new SplitType(el, { types: 'words,chars', tagName: 'span' });
  const chars = split.chars ?? [];
  gsap.set(chars, {
    opacity: 0,
    x: () => gsap.utils.random(-180, 180),
    y: () => gsap.utils.random(-90, 90),
    rotate: () => gsap.utils.random(-50, 50),
    filter: 'blur(6px)',
  });
  const tween = gsap.to(chars, {
    opacity: 1,
    x: 0,
    y: 0,
    rotate: 0,
    filter: 'blur(0px)',
    duration: 0.9,
    ease: 'power3.out',
    stagger: { each: 0.022, from: 'random' },
    // Reversible: gathers on scroll-down, scatters back out on scroll-up, replays.
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

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&/0123456789';

// Typewriter-scramble a single element's text: each character cycles through
// random glyphs before locking to its final letter, left to right. Works on
// grapheme clusters so Thai marks never detach from their base mid-animation.
export function scrambleChars(el: HTMLElement, finalText: string, duration = 1100) {
  const clusters = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(finalText)].map((s) => s.segment)
    : [...finalText];
  const start = performance.now();
  const len = clusters.length;
  function frame(now: number) {
    const p = Math.min(1, (now - start) / duration);
    const revealed = Math.floor(p * len);
    let out = '';
    for (let i = 0; i < len; i++) {
      if (i < revealed || clusters[i].trim() === '') out += clusters[i];
      else out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    }
    el.textContent = out;
    if (p < 1) requestAnimationFrame(frame);
    else el.textContent = finalText;
  }
  requestAnimationFrame(frame);
}
