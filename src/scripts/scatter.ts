// Geometry / paper scatter act (ACT II). Builds a swarm of shards (kanji glyphs,
// little paper cards, squares, rings) and drives them from a tight central cluster
// out into a scattered burst, scrubbed by scroll through the section — while the
// backdrop photo gets a slow 3D tilt/pan (scroll parallax + pointer) for a
// handheld-camera feel. Reduced-motion → a static composed scatter, no JS swarm.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Glyph pool — characters from the "Sunflower" series motifs (扉 = door, 向日葵 = sunflower).
const GLYPHS = '不安定僕扉向日葵光影夏空';
type Kind = 'glyph' | 'card' | 'sq' | 'ring';
const KINDS: Kind[] = ['glyph', 'glyph', 'glyph', 'card', 'sq', 'ring'];

export function initScatter(
  section: HTMLElement,
  opts: { reduced?: boolean; coarse?: boolean } = {},
) {
  const { reduced = false, coarse = false } = opts;
  const bg = section.querySelector<HTMLElement>('.act__bg img');

  // Append shards DIRECTLY into the isolated `.act` (not a z-indexed sub-layer) so their
  // `mix-blend-mode:difference` blends against the photo+scrim beneath — a wrapping layer
  // with its own stacking context would trap the blend and leave them plain white.
  const layer = section.querySelector<HTMLElement>('.scatter-layer') ?? section;

  const count = reduced ? 16 : coarse ? 16 : 32;
  const shards: HTMLElement[] = [];
  for (let i = 0; i < count; i++) {
    const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
    const el = document.createElement('span');
    el.className = `shard shard--${kind}`;
    if (kind === 'glyph') el.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    layer.appendChild(el);
    shards.push(el);
  }

  if (reduced) {
    // Static, already-scattered composition.
    shards.forEach((el) =>
      gsap.set(el, {
        x: gsap.utils.random(-44, 44) + 'vw',
        y: gsap.utils.random(-34, 34) + 'vh',
        rotate: gsap.utils.random(-40, 40),
      }),
    );
    return;
  }

  // Cluster → burst, ALL shards + backdrop drift on ONE scrubbed timeline (a single
  // ScrollTrigger for the whole act — not one per shard — to stay well under the jank
  // threshold). Everything is placed at position 0 so it scrubs together.
  const tl = gsap.timeline({
    scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: 1 },
  });
  shards.forEach((el) => {
    tl.fromTo(
      el,
      {
        x: gsap.utils.random(-7, 7) + 'vw',
        y: gsap.utils.random(-7, 7) + 'vh',
        rotate: 0,
        opacity: 0,
        scale: 0.5,
      },
      {
        x: gsap.utils.random(-46, 46) + 'vw',
        y: gsap.utils.random(-38, 38) + 'vh',
        rotate: gsap.utils.random(-200, 200),
        opacity: 1,
        scale: 1,
        ease: 'none',
      },
      0,
    );
  });

  // Backdrop: scroll parallax drift (same timeline) + (fine-pointer) 3D tilt toward cursor.
  if (bg) {
    gsap.set(bg, { transformPerspective: 800, transformOrigin: 'center' });
    tl.fromTo(bg, { yPercent: -4 }, { yPercent: 4, ease: 'none' }, 0);
    if (!coarse) {
      const rx = gsap.quickTo(bg, 'rotationX', { duration: 0.7, ease: 'power3' });
      const ry = gsap.quickTo(bg, 'rotationY', { duration: 0.7, ease: 'power3' });
      section.addEventListener('pointermove', (e) => {
        const r = section.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        rx(-dy * 4);
        ry(dx * 4);
      });
      section.addEventListener('pointerleave', () => {
        rx(0);
        ry(0);
      });
    }
  }
}
