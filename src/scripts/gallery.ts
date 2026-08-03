// Drag-scroll gallery — pointer drag + trackpad horizontal intent, smoothed with
// gsap.quickTo. A drag past a small threshold cancels the click underneath so links
// inside tiles don't fire mid-drag. Ported from the sibling art site (its
// editorial-fui-motion skill). Reduced-motion / coarse-pointer fall back to
// native scroll via the `.gallery--native` class.

import { gsap } from 'gsap';

export function initGallery(track: HTMLElement) {
  const gallery = track.parentElement as HTMLElement;
  let target = 0;
  let max = 0;
  const measure = () => { max = Math.min(0, gallery.clientWidth - track.scrollWidth); };
  measure();

  const setX = gsap.quickTo(track, 'x', { duration: 0.6, ease: 'power3' });
  window.addEventListener('resize', () => { measure(); target = gsap.utils.clamp(max, 0, target); setX(target); });

  let dragging = false, startX = 0, startTarget = 0, moved = 0;

  track.addEventListener('pointerdown', (e) => {
    dragging = true; startX = e.clientX; startTarget = target; moved = 0;
    track.classList.add('is-dragging');
    track.setPointerCapture(e.pointerId);
  });
  track.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    target = gsap.utils.clamp(max, 0, startTarget + dx);
    setX(target);
  });
  const end = () => { dragging = false; track.classList.remove('is-dragging'); };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  // a drag shouldn't trigger the link/click underneath
  track.addEventListener('click', (e) => {
    if (moved > 6) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  // trackpad horizontal intent
  gallery.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      target = gsap.utils.clamp(max, 0, target - e.deltaX);
      setX(target);
    }
  }, { passive: true });
}

export function initGalleries(opts: { prefersReduced: boolean; coarsePointer: boolean }) {
  document.querySelectorAll<HTMLElement>('[data-gallery]').forEach((track) => {
    if (opts.prefersReduced || opts.coarsePointer) track.closest('.gallery')?.classList.add('gallery--native');
    else initGallery(track);
  });
}
