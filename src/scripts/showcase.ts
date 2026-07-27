/**
 * Showcase plate — lightbox + slideshow controller.
 *
 * Progressive enhancement: with JS off the plate is still a visible, optimised
 * picture; this only adds the overlay and (once there is more than one slide)
 * the navigation. Every multi-slide path is guarded on `total > 1`, so with a
 * single picture the arrows, dots and counter never exist and this is just an
 * open/close handler.
 */

interface Lenis {
  stop(): void;
  start(): void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function initShowcase(): void {
  const plate = document.querySelector<HTMLElement>('.plate');
  const lb = document.querySelector<HTMLElement>('[data-lb]');
  const lbImg = lb?.querySelector<HTMLImageElement>('[data-lb-img]');
  if (!plate || !lb || !lbImg) return;

  const slideEls = [...plate.querySelectorAll<HTMLImageElement>('[data-slide]')];
  const dots = [...plate.querySelectorAll<HTMLElement>('[data-dot]')];
  const counter = lb.querySelector<HTMLElement>('[data-lb-count]');
  const total = slideEls.length;
  if (!total) return;

  let index = 0;
  let lastFocus: HTMLElement | null = null;

  // --- Slide state -----------------------------------------------------------
  function show(next: number) {
    if (total < 2) return;
    index = (next + total) % total;

    slideEls.forEach((el, i) => (el.hidden = i !== index));
    dots.forEach((d, i) => d.setAttribute('aria-selected', String(i === index)));

    const active = slideEls[index];
    lbImg!.src = active.dataset.full ?? active.currentSrc ?? active.src;
    lbImg!.alt = active.dataset.alt ?? '';
    if (counter) counter.textContent = `${pad2(index + 1)} / ${pad2(total)}`;
  }

  // --- Overlay ---------------------------------------------------------------
  // Lenis drives the page's inertia scroll (see Base.astro); pausing it is what
  // actually stops the page moving behind the overlay. The body rule is the
  // fallback for reduced-motion / coarse-pointer visitors, where Lenis is off.
  const lenis = () => (window as unknown as { __lenis?: Lenis }).__lenis;

  function open() {
    lastFocus = document.activeElement as HTMLElement | null;

    const active = slideEls[index];
    lbImg!.src = active.dataset.full ?? active.currentSrc ?? active.src;
    lbImg!.alt = active.dataset.alt ?? '';
    if (counter) counter.textContent = `${pad2(index + 1)} / ${pad2(total)}`;

    lb!.hidden = false;
    lenis()?.stop();
    document.body.style.overflow = 'hidden';
    lb!.querySelector<HTMLElement>('[data-lb-dismiss].lb__close')?.focus();
  }

  function close() {
    lb!.hidden = true;
    lenis()?.start();
    document.body.style.overflow = '';
    lastFocus?.focus?.();
  }

  plate.querySelector<HTMLElement>('[data-lb-open]')?.addEventListener('click', open);
  for (const el of lb.querySelectorAll<HTMLElement>('[data-lb-dismiss]')) {
    el.addEventListener('click', close);
  }
  lb.querySelector<HTMLElement>('[data-lb-prev]')?.addEventListener('click', () => show(index - 1));
  lb.querySelector<HTMLElement>('[data-lb-next]')?.addEventListener('click', () => show(index + 1));
  dots.forEach((dot, i) =>
    dot.addEventListener('click', () => {
      show(i);
    }),
  );

  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (total > 1) {
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'ArrowRight') show(index + 1);
    }
    // Keep Tab inside the dialog while it owns the screen.
    if (e.key === 'Tab') {
      const focusables = [...lb.querySelectorAll<HTMLElement>('button')].filter(
        (b) => !b.hidden && b.offsetParent !== null,
      );
      if (!focusables.length) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
  });
}
