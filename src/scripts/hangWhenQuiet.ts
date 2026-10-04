/**
 * Call `hang` once the page is quiet enough that a keychain's first paint can't be felt.
 *
 * A charm is many translucent, blended 3D layers; its first raster cost a weak integrated GPU
 * ~0.4 s (measured cold on an Intel UHD 610, production build), which read as a stutter on entry.
 * So it is hung after the page has loaded, once its stage is in view, `delay` ms after this call,
 * and not within 0.5 s of a scroll. Returns a cancel function.
 */
export function hangWhenQuiet(stage: HTMLElement, hang: () => void, delay = 1800): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  let lastScroll = 0;
  let seen = false;
  let loaded = document.readyState === 'complete';
  let timer = 0;
  const onScroll = () => (lastScroll = performance.now());
  const onLoad = () => (loaded = true);
  const io = new IntersectionObserver(([en]) => (seen ||= en.isIntersecting), { rootMargin: '200px' });
  io.observe(stage);
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('load', onLoad, { once: true });
  const t0 = performance.now();
  const stop = () => {
    clearTimeout(timer);
    io.disconnect();
    removeEventListener('scroll', onScroll);
    removeEventListener('load', onLoad);
  };
  const tryHang = () => {
    const now = performance.now();
    if (loaded && seen && now - t0 > delay && now - lastScroll > 500) {
      stop();
      if (w.requestIdleCallback) w.requestIdleCallback(hang, { timeout: 800 });
      else hang();
      return;
    }
    timer = window.setTimeout(tryHang, 250);
  };
  tryHang();
  return stop;
}
