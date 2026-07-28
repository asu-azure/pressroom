/**
 * Skewed panel strip — cycler and lightbox.
 *
 * Progressive enhancement: with JS off the panels still render their first
 * assigned crop, so the strip is never empty. This adds the rotation.
 *
 * Panels advance ROUND-ROBIN on a stagger — one panel changes at a time, to the
 * next piece not currently on screen. Changing them together would read as a
 * page flip rather than a slow reveal, and would risk showing duplicates.
 */

interface Lenis {
  stop(): void;
  start(): void;
}

interface ShowcaseSlide {
  tile: string;
  tile2x: string;
  full: string;
  alt: string;
  focus: string;
}

interface ShowcaseData {
  panels: number;
  slides: ShowcaseSlide[];
}

const pad2 = (n: number) => String(n).padStart(2, '0');
/** How long a panel holds before the next one turns over. */
const STEP_MS = 3600;

export function initShowcase(): void {
  const strip = document.querySelector<HTMLElement>('[data-strip]');
  const lb = document.querySelector<HTMLElement>('[data-lb]');
  const lbImg = lb?.querySelector<HTMLImageElement>('[data-lb-img]');
  const raw = document.querySelector<HTMLElement>('[data-showcase]')?.textContent;
  if (!strip || !lb || !lbImg || !raw) return;

  let data: ShowcaseData;
  try {
    data = JSON.parse(raw) as ShowcaseData;
  } catch {
    return;
  }
  const { slides } = data;
  const total = slides.length;
  if (!total) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const panelEls = [...strip.querySelectorAll<HTMLElement>('[data-panel]')];
  const counter = lb.querySelector<HTMLElement>('[data-lb-count]');

  // Which piece each panel is showing, and which layer is currently visible.
  const shown = panelEls.map((el) => Number(el.dataset.index ?? 0));
  const frontIsA = panelEls.map(() => true);

  /** The next piece not on screen anywhere, so a turn never duplicates. */
  function nextUnseen(from: number): number {
    for (let step = 1; step <= total; step++) {
      const cand = (from + step) % total;
      if (!shown.includes(cand)) return cand;
    }
    return (from + 1) % total;
  }

  function swap(panelIdx: number) {
    const el = panelEls[panelIdx];
    // Skip panels the breakpoint has hidden — swapping them is wasted work and
    // would silently consume pieces that never get seen.
    if (!el || el.offsetParent === null) return;

    const next = nextUnseen(shown[panelIdx]);
    const s = slides[next];
    const a = el.querySelector<HTMLImageElement>('[data-layer="a"]');
    const b = el.querySelector<HTMLImageElement>('[data-layer="b"]');
    if (!a || !b) return;

    const incoming = frontIsA[panelIdx] ? b : a;
    const outgoing = frontIsA[panelIdx] ? a : b;

    // Decode before crossfading, or the fade reveals a blank layer first.
    incoming.src = s.tile;
    incoming.srcset = `${s.tile} 1x, ${s.tile2x} 2x`;
    incoming.style.objectPosition = s.focus;
    const reveal = () => {
      incoming.classList.add('is-on');
      outgoing.classList.remove('is-on');
      frontIsA[panelIdx] = !frontIsA[panelIdx];
      shown[panelIdx] = next;
      el.dataset.index = String(next);
      el.setAttribute('aria-label', s.alt);
    };
    // Race the decode against a timeout. A stalled or failed image must never
    // strand a panel mid-swap — worst case it pops in instead of fading.
    if (incoming.decode) {
      let done = false;
      const once = () => {
        if (!done) {
          done = true;
          reveal();
        }
      };
      incoming.decode().then(once).catch(once);
      setTimeout(once, 1200);
    } else {
      reveal();
    }
  }

  // --- Rotation -------------------------------------------------------------
  let paused = false;
  let cursor = 0;
  if (!reduced && total > panelEls.length) {
    setInterval(() => {
      if (paused || lb!.hidden === false) return;
      swap(cursor % panelEls.length);
      cursor++;
    }, STEP_MS);
    strip.addEventListener('pointerenter', () => (paused = true));
    strip.addEventListener('pointerleave', () => (paused = false));
    strip.addEventListener('focusin', () => (paused = true));
    strip.addEventListener('focusout', () => (paused = false));
  }

  // --- Lightbox -------------------------------------------------------------
  const lenis = () => (window as unknown as { __lenis?: Lenis }).__lenis;
  let index = 0;
  let lastFocus: HTMLElement | null = null;

  function paint() {
    const s = slides[index];
    lbImg!.src = s.full;
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
    index = (((index + d) % total) + total) % total;
    paint();
  };

  // Delegated, because a panel's index changes as it cycles.
  strip.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-panel]');
    if (btn) open(Number(btn.dataset.index));
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
