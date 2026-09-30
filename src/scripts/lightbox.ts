// FUI lightbox — full-screen artwork viewer in the site's editorial-FUI chrome:
// ink backdrop, mono counter (04 / 12) + medium tag, corner brackets, close ×,
// prev/next with keyboard (←/→/Esc) and touch swipe. Scroll (Lenis) is stopped
// while open. Reduced-motion → instant show/hide, no flourishes.
//
// Loupe (fine pointers, motion allowed): a ×2.5 glass under the pointer, drawn
// from the full-size image with background-position — plain CSS, no canvas or
// WebGL on /asu. It sits exactly on the pointer (no easing), the real cursor
// stays, and it never takes pointer events, so swipes and buttons are unchanged.
//
// Ported from the sibling art site. Self-contained: builds its own DOM and uses
// the `.lb__*` styles already in global.css (shared with the showcase lightbox —
// different [data-*] hooks, so the two never cross-wire).

import { gsap } from 'gsap';
import { punch } from './mv';

export interface LightboxItem {
  src: string;
  alt: string;
  medium: string;
}

interface LenisLike { stop(): void; start(): void }

const LOUPE_MAG = 2.5;
const LOUPE_R = 95;

export function initLightbox(items: LightboxItem[], opts: { reduced?: boolean } = {}) {
  const { reduced = false } = opts;

  const root = document.createElement('div');
  root.className = 'lb';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Artwork viewer');
  root.hidden = true;
  root.innerHTML = `
    <div class="lb__backdrop" data-lb-close></div>
    <span class="bracket bracket--tl" aria-hidden="true"></span>
    <span class="bracket bracket--br" aria-hidden="true"></span>
    <figure class="lb__stage">
      <img class="lb__img" alt="" decoding="async" />
    </figure>
    <div class="lb__hud lb__hud--tl mono" aria-hidden="true">
      <span class="lb__counter">01 / ${String(items.length).padStart(2, '0')}</span>
      <span class="lb__medium"></span>
    </div>
    <div class="lb__hud lb__hud--bl mono" aria-hidden="true">ASU AZURE · 作品</div>
    <button type="button" class="lb__btn lb__close mono" data-lb-close aria-label="Close">✕</button>
    <button type="button" class="lb__btn lb__prev mono" aria-label="Previous">←</button>
    <button type="button" class="lb__btn lb__next mono" aria-label="Next">→</button>
    <div class="lb__loupe" aria-hidden="true"><span class="lb__loupeK mono">LOUPE ×${LOUPE_MAG}</span></div>
  `;
  document.body.appendChild(root);

  const img = root.querySelector<HTMLImageElement>('.lb__img')!;
  const counter = root.querySelector<HTMLElement>('.lb__counter')!;
  const medium = root.querySelector<HTMLElement>('.lb__medium')!;
  const stage = root.querySelector<HTMLElement>('.lb__stage')!;

  // --- loupe ------------------------------------------------------------------
  const loupe = root.querySelector<HTMLElement>('.lb__loupe')!;
  const canLoupe = !reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hideLoupe = () => loupe.classList.remove('is-on');
  if (canLoupe) {
    img.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !img.complete) return;
      const r = img.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const src = img.currentSrc || img.src;
      if (loupe.dataset.src !== src) {
        loupe.style.backgroundImage = `url("${src}")`;
        loupe.dataset.src = src;
      }
      loupe.style.backgroundSize = `${r.width * LOUPE_MAG}px ${r.height * LOUPE_MAG}px`;
      loupe.style.backgroundPosition = `${LOUPE_R - x * LOUPE_MAG}px ${LOUPE_R - y * LOUPE_MAG}px`;
      loupe.style.transform = `translate3d(${e.clientX - LOUPE_R}px, ${e.clientY - LOUPE_R}px, 0)`;
      loupe.classList.add('is-on');
    });
    img.addEventListener('pointerleave', hideLoupe);
    img.addEventListener('pointerdown', hideLoupe);
  }

  let idx = 0;
  let isOpen = false;
  let lastFocus: HTMLElement | null = null;
  const lenis = (): LenisLike | undefined => (window as unknown as { __lenis?: LenisLike }).__lenis;

  const preload = (i: number) => {
    const it = items[(i + items.length) % items.length];
    if (it) new Image().src = it.src;
  };

  const show = (i: number, dir = 0) => {
    hideLoupe();
    idx = (i + items.length) % items.length;
    const it = items[idx];
    img.src = it.src;
    img.alt = it.alt;
    counter.textContent = `${String(idx + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
    medium.textContent = it.medium;
    preload(idx + 1);
    preload(idx - 1);
    if (!reduced && dir !== 0) {
      // Brief channel-cut: the incoming frame slides from the nav direction.
      gsap.fromTo(
        stage,
        { opacity: 0, x: 34 * dir, filter: 'blur(4px)' },
        { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.4, ease: 'power3.out' },
      );
    }
  };

  const open = (i: number) => {
    if (isOpen) { show(i); return; }
    isOpen = true;
    lastFocus = document.activeElement as HTMLElement | null;
    show(i);
    root.hidden = false;
    punch(stage);
    lenis()?.stop();
    document.documentElement.classList.add('lb-open');
    if (!reduced) {
      gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' });
      gsap.fromTo(stage, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'power3.out' });
    }
    root.querySelector<HTMLElement>('.lb__close')?.focus();
    window.addEventListener('keydown', onKey);
  };

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    hideLoupe();
    window.removeEventListener('keydown', onKey);
    const done = () => {
      root.hidden = true;
      lenis()?.start();
      document.documentElement.classList.remove('lb-open');
      lastFocus?.focus();
    };
    if (reduced) done();
    else gsap.to(root, { opacity: 0, duration: 0.25, ease: 'power2.in', onComplete: done });
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') show(idx + 1, 1);
    else if (e.key === 'ArrowLeft') show(idx - 1, -1);
  };

  root.querySelectorAll('[data-lb-close]').forEach((el) => el.addEventListener('click', close));
  root.querySelector('.lb__next')?.addEventListener('click', () => show(idx + 1, 1));
  root.querySelector('.lb__prev')?.addEventListener('click', () => show(idx - 1, -1));

  // Touch swipe on the stage (also works with mouse drags).
  let downX: number | null = null;
  stage.addEventListener('pointerdown', (e) => (downX = e.clientX));
  stage.addEventListener('pointerup', (e) => {
    if (downX == null) return;
    const dx = e.clientX - downX;
    downX = null;
    if (dx < -40) show(idx + 1, 1);
    else if (dx > 40) show(idx - 1, -1);
  });

  return { open, close };
}
