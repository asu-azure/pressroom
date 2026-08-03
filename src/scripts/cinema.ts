// Cinematic film-frame act (ACT I). Scroll-scrubbed letterbox + Ken-Burns backdrop
// pan/scale, plus a live timecode readout in the FUI corner HUD. The headline's
// scramble/assemble entrance is handled by the page boot via [data-assemble]/[data-scramble];
// this module only owns the cinematic framing. Reduced-motion → static framed photo.

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function initCinema(section: HTMLElement, opts: { reduced?: boolean } = {}) {
  const { reduced = false } = opts;
  const bg = section.querySelectorAll<HTMLElement>('.act__bg img');
  const bars = section.querySelectorAll<HTMLElement>('.letterbox__bar');
  const pillars = section.querySelector<HTMLElement>('.pillarbox__bar');
  const tc = section.querySelector<HTMLElement>('[data-timecode]');

  // Live "recording" timecode MM:SS:FF (24fps) — cosmetic FUI flavor.
  // Ticks only while the act is on screen; a constant 12fps DOM write on an
  // offscreen mix-blend element was one of the scroll-stutter contributors.
  if (tc) {
    const start = Date.now();
    const render = () => {
      const t = (Date.now() - start) / 1000;
      const mm = String(Math.floor(t / 60) % 60).padStart(2, '0');
      const ss = String(Math.floor(t) % 60).padStart(2, '0');
      const ff = String(Math.floor((t % 1) * 24)).padStart(2, '0');
      tc.textContent = `${mm}:${ss}:${ff}`;
    };
    render();
    let timer = 0;
    new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        window.clearInterval(timer);
        if (e.isIntersecting) timer = window.setInterval(render, 1000 / 12);
      });
    }, { threshold: 0 }).observe(section);
  }

  if (reduced) return;

  // Letterbox bars iris-open from a tall crop to a slim cinematic band on entry.
  if (bars.length) {
    gsap.fromTo(
      bars,
      { height: '24vh' },
      {
        height: '7vh',
        ease: 'none',
        scrollTrigger: { trigger: section, start: 'top bottom', end: 'top center', scrub: true },
      },
    );
  }

  // Pillarbox bars sweep open from the edges (width via --pbr 0→1 on the section).
  if (pillars) {
    gsap.fromTo(
      section,
      { '--pbr': 0 },
      {
        '--pbr': 1,
        ease: 'none',
        scrollTrigger: { trigger: section, start: 'top bottom', end: 'top center', scrub: true },
      },
    );
  }

  // Ken-Burns: the backdrop slowly pans + scales across the whole act (handheld feel).
  // Applies to every stacked image so channel-switched frames share the motion.
  if (bg.length) {
    gsap.set(bg, { transformOrigin: 'center' });
    gsap.fromTo(
      bg,
      { scale: 1.14, xPercent: -3, yPercent: -2 },
      {
        scale: 1.24,
        xPercent: 3,
        yPercent: 2,
        ease: 'none',
        scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true },
      },
    );
  }
}
