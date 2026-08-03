// Channel-switch backdrop — cycles the stacked `.act__bg img` photos like flipping TV
// channels, with a brief glitch / RGB-split + scanline flash between frames (toggled via
// the `.is-glitching` class; the CSS owns the visual). Pauses when offscreen.
// Reduced-motion → shows the first photo only, no cycling.

export function initChannel(section: HTMLElement, opts: { reduced?: boolean; interval?: number } = {}) {
  const { reduced = false, interval = 3600 } = opts;
  const imgs = Array.from(section.querySelectorAll<HTMLElement>('.act__bg img'));
  if (imgs.length < 2) return;

  imgs.forEach((im, i) => (im.style.opacity = i === 0 ? '1' : '0'));
  if (reduced) return;

  let idx = 0;
  let timer = 0;

  const go = () => {
    const next = (idx + 1) % imgs.length;
    section.classList.add('is-glitching');
    // Swap mid-glitch so the cut lands inside the static flash.
    window.setTimeout(() => {
      imgs[idx].style.opacity = '0';
      imgs[next].style.opacity = '1';
      idx = next;
    }, 110);
    window.setTimeout(() => section.classList.remove('is-glitching'), 340);
  };

  // Only run while the act is on screen.
  new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      window.clearInterval(timer);
      if (e.isIntersecting) timer = window.setInterval(go, interval);
    });
  }, { threshold: 0.15 }).observe(section);
}
