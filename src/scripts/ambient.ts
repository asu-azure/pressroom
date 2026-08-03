// Ambient constellation — a lightweight <canvas> of drifting dots joined by lines,
// so dark sections feel alive even when the viewer isn't scrolling. Perf-guarded:
// node count scales with area (hard-capped), DPR ≤ 2, and an IntersectionObserver
// pauses the rAF loop whenever the host section is offscreen. Reduced-motion → nothing.

interface Node { x: number; y: number; vx: number; vy: number; }

export function initAmbient(
  host: HTMLElement,
  opts: { reduced?: boolean; density?: number; color?: string } = {},
) {
  const { reduced = false, density = 1, color = '244,241,234' } = opts;
  if (reduced) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'constellation';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const LINK = 130;
  let w = 0, h = 0, raf = 0, running = false;
  let nodes: Node[] = [];

  const build = () => {
    const count = Math.round(Math.min(56, (w * h) / 26000) * density);
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
    }));
  };

  const resize = () => {
    const r = host.getBoundingClientRect();
    w = r.width; h = r.height;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  };

  const frame = () => {
    raf = requestAnimationFrame(frame);
    ctx.clearRect(0, 0, w, h);
    for (const p of nodes) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < LINK) {
          ctx.globalAlpha = (1 - d / LINK) * 0.45;
          ctx.strokeStyle = `rgba(${color},1)`;
          ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = `rgba(${color},1)`;
    for (const p of nodes) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  };

  const start = () => { if (!running) { running = true; frame(); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  resize();
  new ResizeObserver(resize).observe(host);
  new IntersectionObserver(
    (entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())),
    { threshold: 0 },
  ).observe(host);
}
