// 3D wireframe grid finale (ACT VI). A CSS perspective floor-grid streams toward
// the viewer on scroll, red accent nodes + connector wires drift for depth, and the
// whole 3D stage tilts toward the pointer. Pure transform / background-position —
// GPU-cheap. Reduced-motion → static grid; coarse-pointer → no tilt.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function initGrid(section: HTMLElement, opts: { reduced?: boolean; coarse?: boolean } = {}) {
  const { reduced = false, coarse = false } = opts;
  const grid = section.querySelector<HTMLElement>('.wiregrid');
  const stage = section.querySelector<HTMLElement>('.stage3d');
  const driftEls = gsap.utils.toArray<HTMLElement>(section.querySelectorAll('.node, .wire'));

  if (reduced) return;

  // Grid stream + node/wire drift on ONE scrubbed timeline (single ScrollTrigger).
  const tl = gsap.timeline({
    scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true },
  });
  if (grid) tl.to(grid, { backgroundPositionY: '+=520px', ease: 'none' }, 0);
  driftEls.forEach((n, i) => {
    tl.fromTo(n, { yPercent: -8 - (i % 5) * 3 }, { yPercent: 8 + (i % 5) * 3, ease: 'none' }, 0);
  });

  // Pointer tilt of the whole 3D stage.
  if (stage && !coarse) {
    gsap.set(stage, { transformPerspective: 1000, transformOrigin: 'center' });
    const rx = gsap.quickTo(stage, 'rotationX', { duration: 0.8, ease: 'power3' });
    const ry = gsap.quickTo(stage, 'rotationY', { duration: 0.8, ease: 'power3' });
    section.addEventListener('pointermove', (e) => {
      const r = section.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
      const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
      rx(-dy * 6);
      ry(dx * 6);
    });
    section.addEventListener('pointerleave', () => {
      rx(0);
      ry(0);
    });
  }
}
