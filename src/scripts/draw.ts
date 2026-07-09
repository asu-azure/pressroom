// "Drawn / swept / structured" geometry. Uses GSAP's (now free) DrawSVGPlugin to
// stroke-draw any [data-draw] SVG path/line/rect/circle from 0→100% on enter, and
// reveals any [data-sweep] element with a clip-path wipe — both batched under ONE
// ScrollTrigger per [data-draw-scope] container so the page stays trigger-light.
// Reduced-motion → everything shown instantly.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);

export function initDraw(
  scope: ParentNode = document,
  opts: { reduced?: boolean; start?: string } = {},
) {
  const { reduced = false, start = 'top 78%' } = opts;
  const scopes = gsap.utils.toArray<HTMLElement>(
    (scope as ParentNode).querySelectorAll('[data-draw-scope]'),
  );

  scopes.forEach((sc) => {
    const paths = sc.querySelectorAll<SVGElement>('[data-draw]');
    const sweeps = sc.querySelectorAll<HTMLElement>('[data-sweep]');

    if (reduced) {
      if (paths.length) gsap.set(paths, { drawSVG: '100%' });
      sweeps.forEach((s) => s.classList.add('is-revealed'));
      return;
    }

    // Reversible: draw the strokes via a timeline bound to the trigger (plays on
    // scroll-down, un-draws on scroll-up), and toggle the clip-reveal sweeps by class
    // (CSS transition handles both directions).
    const tl = gsap.timeline({ paused: true });
    if (paths.length) {
      gsap.set(paths, { drawSVG: '0%' });
      tl.fromTo(
        paths,
        { drawSVG: '0%' },
        { drawSVG: '100%', duration: 1.0, ease: 'power2.inOut', stagger: 0.08 },
      );
    }
    ScrollTrigger.create({
      trigger: sc,
      start,
      animation: tl,
      toggleActions: 'play none none reverse',
      onEnter: () => sweeps.forEach((s, i) => window.setTimeout(() => s.classList.add('is-revealed'), i * 70)),
      onLeaveBack: () => sweeps.forEach((s) => s.classList.remove('is-revealed')),
    });
  });
}
