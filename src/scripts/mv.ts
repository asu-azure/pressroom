/**
 * MV motion helpers — the small JS half of src/styles/mv.css.
 *
 * Ported from the music-video engine (music-repo visualizer/player2): the
 * converge entrance, the shoot-in-and-brake title, the punch and the note
 * strike. Everything is ≤ 600 ms, first-view or interaction only, and a no-op
 * under prefers-reduced-motion.
 */
import { gsap } from 'gsap';

// Same test as kinetic.ts's needsWordSplit, copied rather than imported:
// kinetic.ts pulls in split-type, and this file loads on every page.
const MARK_SCRIPTS = /[฀-๿຀-໿ऀ-ॿក-៿]/; // Thai, Lao, Devanagari, Khmer
const needsWordSplit = (text: string) => MARK_SCRIPTS.test(text);

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Re-trigger a one-shot CSS animation class on `el`. */
export function punch(el: Element | null | undefined) {
  if (!el || reduced()) return;
  el.classList.remove('mv-punch');
  void (el as HTMLElement).offsetWidth;
  el.classList.add('mv-punch');
}

/** A ring of light at viewport point (x, y), like a note hitting the playhead. */
export function strike(x: number, y: number, tone: 'accent' | 'amber' = 'accent') {
  if (reduced()) return;
  const ring = document.createElement('span');
  ring.className = tone === 'amber' ? 'mv-strike mv-strike--amber' : 'mv-strike';
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  ring.setAttribute('aria-hidden', 'true');
  ring.addEventListener('animationend', () => ring.remove(), { once: true });
  document.body.appendChild(ring);
  setTimeout(() => ring.remove(), 800); // animationend never fires in a background tab
}

/**
 * Characters shoot in from both sides and brake (type.js drawLine): the left
 * half arrives from the left, the right half from the right, and the farther a
 * glyph sits from the centre the farther it travels. Latin/CJK only — scripts
 * with stacking marks (Thai…) are never split per character, so they get the
 * converge entrance instead.
 */
export function slideIn(node: HTMLElement, opts: { delay?: number } = {}) {
  const text = node.textContent ?? '';
  if (reduced() || !text.trim()) return;
  if (needsWordSplit(text)) {
    node.setAttribute('data-mv-converge', '');
    requestAnimationFrame(() => node.classList.add('is-in'));
    return;
  }
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(
    (s) => s.segment,
  );
  node.textContent = '';
  node.setAttribute('aria-label', text);
  const spans = graphemes.map((g) => {
    const s = document.createElement('span');
    s.textContent = g;
    s.style.display = 'inline-block';
    s.setAttribute('aria-hidden', 'true');
    if (/\s/.test(g)) s.style.whiteSpace = 'pre';
    node.appendChild(s);
    return s;
  });
  const mid = (spans.length - 1) / 2;
  gsap.fromTo(
    spans,
    {
      x: (i: number) => (i < mid ? -1 : 1) * (120 + 30 * Math.abs(i - mid)),
      opacity: 0,
    },
    {
      x: 0,
      opacity: 1,
      duration: 0.45,
      delay: opts.delay ?? 0,
      ease: 'expo.out',
      stagger: { each: 0.012, from: 'center' },
      onComplete: () => {
        node.textContent = text;
        node.removeAttribute('aria-label');
      },
    },
  );
}

/**
 * Page-wide wiring, called once from Base.astro:
 *  - [data-mv-converge] elements get .is-in while on screen. Reversible per
 *    the house rule: the class drops once the element is fully off screen, so
 *    the entrance plays again on the way back.
 *  - pressing a tile, a .btn or anything [data-strike] rings a strike at the
 *    pointer.
 */
let io: IntersectionObserver | null = null;

/** Watch one [data-mv-converge] element. Also a Svelte action (`use:converge`),
    since islands mount after initMv() has swept the page. */
export function converge(node: HTMLElement) {
  node.setAttribute('data-mv-converge', '');
  if (reduced() || !('IntersectionObserver' in window)) {
    node.classList.add('is-in');
    return { destroy() {} };
  }
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio > 0) e.target.classList.add('is-in');
        else if (!e.isIntersecting) e.target.classList.remove('is-in');
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  );
  io.observe(node);
  return { destroy: () => io?.unobserve(node) };
}

export function initMv() {
  document.querySelectorAll<HTMLElement>('[data-mv-converge]').forEach((el) => converge(el));

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const hit = (e.target as Element | null)?.closest?.('.tile, .btn, [data-strike]');
    if (hit) strike(e.clientX, e.clientY);
  });
}
