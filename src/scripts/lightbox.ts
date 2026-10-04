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
// Flight (motion allowed, when the page passes `originOf`): the picture flies
// out of the print that was pressed into place, and back into it on close if
// that print is still on screen. The flying copy is the print's own (already
// loaded) image, sized at the big end so it never upscales; the real image
// takes over once it has loaded. Anything else — no origin, off screen, no
// size — falls back to the fade.
//
// Share (when the page passes `share`): a SHARE button in the HUD — the phone's
// share sheet on touch devices, else the link copied to the clipboard.
// `onShow` reports the piece on screen (null when closed), so the page can keep
// its URL in step; the lightbox itself never touches history.
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
  /** the artwork's size, for the flight's landing box */
  w?: number;
  h?: number;
  /** its link key (lib/artLink.ts), for pages that link to single pieces */
  key?: string;
}

/** A picture on screen: centre, unrotated size, tilt (deg) and the src it shows. */
export interface FlyRect {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
  src: string;
}

interface LenisLike { stop(): void; start(): void }

const LOUPE_MAG = 2.5;
const LOUPE_R = 95;

export function initLightbox(
  items: LightboxItem[],
  opts: {
    reduced?: boolean;
    originOf?: (i: number) => FlyRect | null;
    onShow?: (i: number | null) => void;
    share?: (i: number) => { url: string; title: string } | null;
  } = {},
) {
  const { reduced = false, originOf, onShow, share } = opts;

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
    ${share ? '<button type="button" class="lb__btn lb__share mono" aria-label="Share this piece">SHARE</button>' : ''}
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

  // --- flight ----------------------------------------------------------------
  let flying: HTMLImageElement | null = null;
  const landing = (i: number): FlyRect | null => {
    const it = items[i];
    if (!it?.w || !it.h) return null;
    const s = stage.getBoundingClientRect();
    const k = Math.min(s.width / it.w, s.height / it.h);
    return { cx: s.left + s.width / 2, cy: s.top + s.height / 2, w: it.w * k, h: it.h * k, rot: 0, src: it.src };
  };
  /** fly a copy of `src` from a to b; the element is sized at `big` so it only ever scales down */
  const fly = (src: string, big: FlyRect, a: FlyRect, b: FlyRect, ms: number, done: () => void) => {
    flying?.remove();
    const el = document.createElement('img');
    el.className = 'lb__fly';
    el.alt = '';
    el.src = src;
    el.style.width = `${big.w}px`;
    el.style.height = `${big.h}px`;
    const at = (r: FlyRect) =>
      `translate(${r.cx - big.w / 2}px, ${r.cy - big.h / 2}px) rotate(${r.rot}deg) scale(${r.w / big.w}, ${r.h / big.h})`;
    el.style.transform = at(b);
    document.body.appendChild(el);
    flying = el;
    el.animate([{ transform: at(a) }, { transform: at(b) }], { duration: ms, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }).onfinish = done;
    return el;
  };
  const land = () => {
    img.style.opacity = '';
    flying?.remove();
    flying = null;
  };

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
    if (flying) land();
    idx = (i + items.length) % items.length;
    const it = items[idx];
    img.src = it.src;
    img.alt = it.alt;
    counter.textContent = `${String(idx + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
    medium.textContent = it.medium;
    preload(idx + 1);
    preload(idx - 1);
    onShow?.(idx);
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
    lenis()?.stop();
    document.documentElement.classList.add('lb-open');
    const from = reduced ? null : originOf?.(idx);
    const to = from ? landing(idx) : null;
    if (from && to) {
      // the print flies up into place; the full image takes over once loaded
      img.style.opacity = '0';
      gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' });
      const shown = idx;
      fly(from.src, to, from, to, 560, () => {
        if (idx !== shown || !isOpen) return land();
        if (img.complete && img.naturalWidth) land();
        else {
          img.addEventListener('load', land, { once: true });
          img.addEventListener('error', land, { once: true });
        }
      });
    } else {
      punch(stage);
      if (!reduced) {
        gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' });
        gsap.fromTo(stage, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'power3.out' });
      }
    }
    root.querySelector<HTMLElement>('.lb__close')?.focus();
    window.addEventListener('keydown', onKey);
  };

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    onShow?.(null);
    hideLoupe();
    window.removeEventListener('keydown', onKey);
    const done = () => {
      root.hidden = true;
      lenis()?.start();
      document.documentElement.classList.remove('lb-open');
      lastFocus?.focus({ preventScroll: true });
    };
    if (reduced) return done();
    // back into its print, if that print is on screen
    const back = originOf?.(idx);
    const r = img.getBoundingClientRect();
    if (back && r.width && img.complete) {
      const from = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, rot: 0, src: '' };
      img.style.opacity = '0';
      fly(img.currentSrc || img.src, from, from, back, 440, () => {
        if (!isOpen) land();
      });
    }
    gsap.to(root, { opacity: 0, duration: 0.25, ease: 'power2.in', onComplete: done });
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

  // --- share -----------------------------------------------------------------
  const shareBtn = root.querySelector<HTMLButtonElement>('.lb__share');
  let shareReset = 0;
  const flash = (text: string) => {
    if (!shareBtn) return;
    shareBtn.textContent = text;
    clearTimeout(shareReset);
    shareReset = window.setTimeout(() => (shareBtn.textContent = 'SHARE'), 1600);
  };
  shareBtn?.addEventListener('click', async () => {
    const s = share?.(idx);
    if (!s) return;
    // a phone's own share sheet (LINE, X, …); on a desktop the link is what's wanted
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share(s);
      } catch {
        /* dismissed */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(s.url);
      flash('COPIED');
    } catch {
      flash('COPY FAILED');
    }
  });

  return { open, close, isOpen: () => isOpen };
}
