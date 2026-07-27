/**
 * Contact strip — drift, drag and lightbox.
 *
 * Progressive enhancement: with JS off the rail is still a scrollable row of
 * optimised artwork. This adds the slow drift, drag-to-scroll and the overlay.
 *
 * The drift moves `scrollLeft` on a rAF loop rather than animating a transform.
 * A CSS marquee would fight native scrolling — you could not grab and browse a
 * transformed track — whereas nudging the real scroll position composes with
 * the user's own wheel, swipe and drag for free.
 */

interface Lenis {
  stop(): void;
  start(): void;
}

interface Source {
  src: string;
  alt: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function initShowcase(): void {
  const rail = document.querySelector<HTMLElement>('[data-rail]');
  const track = document.querySelector<HTMLElement>('[data-track]');
  const lb = document.querySelector<HTMLElement>('[data-lb]');
  const lbImg = lb?.querySelector<HTMLImageElement>('[data-lb-img]');
  if (!rail || !track || !lb || !lbImg) return;

  const raw = document.querySelector<HTMLElement>('[data-lb-sources]')?.textContent;
  let sources: Source[] = [];
  try {
    sources = raw ? (JSON.parse(raw) as Source[]) : [];
  } catch {
    return;
  }
  const total = sources.length;
  if (!total) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const counter = lb.querySelector<HTMLElement>('[data-lb-count]');
  let index = 0;
  let lastFocus: HTMLElement | null = null;

  // --- Seamless drift -------------------------------------------------------
  // The cells are duplicated into the SAME track so the copy continues the row
  // rather than starting a second one — cloning the <ul> itself stacked it
  // underneath, because the rail is a block container. The copies are inert for
  // assistive tech and skipped in tab order.
  let half = 0;
  if (!reduced) {
    const originals = [...track.children] as HTMLElement[];
    for (const cell of originals) {
      const copy = cell.cloneNode(true) as HTMLElement;
      copy.setAttribute('aria-hidden', 'true');
      for (const el of copy.querySelectorAll<HTMLElement>('[data-open]')) {
        el.tabIndex = -1;
      }
      track.append(copy);
    }
    // The repeat period is the distance from the first original to its copy —
    // exact, and unlike scrollWidth/2 it accounts for the inter-cell gap.
    const firstCopy = track.children[originals.length] as HTMLElement | undefined;
    const measure = () => {
      if (firstCopy) half = firstCopy.offsetLeft - originals[0].offsetLeft;
    };
    measure();
    // Lazy tiles and webfonts resize the row after first paint.
    window.addEventListener('load', measure, { once: true });
    window.addEventListener('resize', measure);
  }

  let paused = false;
  // Declared before the loop that reads it — rAF fires after this function
  // returns, but relying on that for a `let` binding is needlessly fragile.
  let dragging = false;
  // Px per SECOND, not per frame: a per-frame step drifts 2.4x faster on a
  // 144Hz screen than on 60Hz, so the strip would move at a different speed for
  // every visitor.
  const SPEED = 17;

  // The position has to be accumulated HERE, as a float. `scrollLeft` rounds to
  // whole pixels, so adding a sub-pixel step to it reads straight back as the
  // same value and the drift never moves at all.
  let pos = 0;
  let last = 0;

  function tick(now: number) {
    if (last) {
      // Clamped so returning from a background tab doesn't jump the rail.
      const dt = Math.min(now - last, 50) / 1000;
      if (!reduced && !paused && !dragging && half > 0) {
        pos += SPEED * dt;
        if (pos >= half) pos -= half;
        rail!.scrollLeft = pos;
      }
    }
    last = now;
    requestAnimationFrame(tick);
  }
  if (!reduced) requestAnimationFrame(tick);

  const pause = () => (paused = true);
  const resume = () => (paused = false);
  rail.addEventListener('pointerenter', pause);
  rail.addEventListener('pointerleave', resume);
  rail.addEventListener('focusin', pause);
  rail.addEventListener('focusout', resume);

  // --- Drag to scroll -------------------------------------------------------
  // A drag must not also fire the tile's click, so movement past a small
  // threshold marks the gesture and the click is swallowed in the capture phase.
  let moved = false;
  let startX = 0;
  let startScroll = 0;

  rail.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startScroll = rail.scrollLeft;
  });
  rail.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) {
      if (!moved) rail.classList.add('is-dragging');
      moved = true;
      rail.scrollLeft = startScroll - dx;
    }
  });
  const endDrag = () => {
    dragging = false;
    rail.classList.remove('is-dragging');
  };
  rail.addEventListener('pointerup', endDrag);
  rail.addEventListener('pointercancel', endDrag);
  rail.addEventListener(
    'click',
    (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    },
    true,
  );

  // Adopt the visitor's own scrolling so the drift carries on from where they
  // left it instead of snapping back. The >1.5px guard ignores the scroll
  // events the drift itself fires (its assignment rounds by less than a pixel).
  rail.addEventListener(
    'scroll',
    () => {
      if (half <= 0) return;
      let sl = rail.scrollLeft;
      // Reaching the end of the duplicated track wraps to the identical spot.
      if (sl >= half * 2 - 1) {
        sl -= half;
        rail.scrollLeft = sl;
      }
      if (Math.abs(sl - pos) > 1.5) pos = sl;
    },
    { passive: true },
  );

  // --- Lightbox -------------------------------------------------------------
  const lenis = () => (window as unknown as { __lenis?: Lenis }).__lenis;

  function paint() {
    const s = sources[index];
    lbImg!.src = s.src;
    lbImg!.alt = s.alt;
    if (counter) counter.textContent = `${pad2(index + 1)} / ${pad2(total)}`;
  }

  function open(i: number) {
    index = ((i % total) + total) % total;
    lastFocus = document.activeElement as HTMLElement | null;
    paint();
    lb!.hidden = false;
    lenis()?.stop();
    document.body.style.overflow = 'hidden';
    lb!.querySelector<HTMLElement>('.lb__close')?.focus();
  }

  function close() {
    lb!.hidden = true;
    lenis()?.start();
    document.body.style.overflow = '';
    lastFocus?.focus?.();
  }

  const step = (d: number) => {
    index = ((index + d) % total + total) % total;
    paint();
  };

  // Delegated so the cloned track's tiles open the right piece too.
  rail.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-open]');
    if (btn) open(Number(btn.dataset.open));
  });

  for (const el of lb.querySelectorAll<HTMLElement>('[data-lb-dismiss]')) {
    el.addEventListener('click', close);
  }
  lb.querySelector<HTMLElement>('[data-lb-prev]')?.addEventListener('click', () => step(-1));
  lb.querySelector<HTMLElement>('[data-lb-next]')?.addEventListener('click', () => step(1));

  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
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
