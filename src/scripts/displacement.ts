// WebGL hover-displacement for the illustration strip.
// Inspired by junkbranding.com / sakazuki.io — a ripple + chromatic-aberration
// distortion that eases in on hover and settles on leave. Uses OGL (tiny WebGL lib).
// Each <figure data-art> keeps its <img> as the no-WebGL / reduced-motion fallback;
// we layer a canvas on top and only hide the <img> once the texture is live.
// data-art-host="#sel" routes pointer tracking through an ancestor when the figure
// itself sits under overlays (full-bleed backdrops).

import { Renderer, Camera, Transform, Plane, Program, Mesh, Texture } from 'ogl';

const vertex = /* glsl */ `
  attribute vec2 uv;
  attribute vec3 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap;
  uniform float uHover;
  uniform float uTime;
  uniform vec2 uMouse;     // 0..1, origin bottom-left
  uniform vec2 uImgSize;   // natural px
  uniform vec2 uPlaneSize; // css px
  varying vec2 vUv;

  void main() {
    // cover-fit so the artwork keeps its aspect ratio
    vec2 s = uPlaneSize;
    vec2 i = uImgSize;
    float rs = s.x / s.y;
    float ri = i.x / i.y;
    vec2 newSize = rs < ri ? vec2(i.x * s.y / i.y, s.y) : vec2(s.x, i.y * s.x / i.x);
    vec2 offset = (rs < ri
      ? vec2((newSize.x - s.x) * 0.5, 0.0)
      : vec2(0.0, (newSize.y - s.y) * 0.5)) / newSize;
    vec2 uv = vUv * s / newSize + offset;

    // ripple pushed outward from the cursor, strongest near it
    float dist = distance(vUv, uMouse);
    float falloff = smoothstep(0.55, 0.0, dist);
    float ripple = sin(dist * 18.0 - uTime * 4.0) * 0.012 * uHover * falloff;
    vec2 dir = normalize(vUv - uMouse + 1e-5);
    uv += dir * ripple;

    // chromatic aberration scaled by hover
    float ab = 0.006 * uHover * falloff;
    float r = texture2D(tMap, uv + dir * ab).r;
    float g = texture2D(tMap, uv).g;
    float b = texture2D(tMap, uv - dir * ab).b;
    gl_FragColor = vec4(r, g, b, 1.0);
  }
`;

export function initDistortion(figure: HTMLElement): void {
  const img = figure.querySelector<HTMLImageElement>('img');
  if (!img) return;

  // Pointer events never reach a figure that sits UNDER overlays (e.g. a full-bleed
  // act backdrop below scrim/grid/content). data-art-host="#selector" names the
  // element that actually receives the pointer; for a full-bleed bg its rect matches
  // the figure's, so the uv math is unchanged.
  const host = (figure.dataset.artHost ? document.querySelector<HTMLElement>(figure.dataset.artHost) : null) ?? figure;

  let renderer: Renderer;
  try {
    renderer = new Renderer({ alpha: true, dpr: Math.min(window.devicePixelRatio || 1, 2) });
  } catch {
    return; // no WebGL → leave the <img> fallback in place
  }
  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);

  const canvas = gl.canvas as HTMLCanvasElement;
  canvas.className = 'art__canvas';
  figure.appendChild(canvas);

  const camera = new Camera(gl);
  const scene = new Transform();

  const texture = new Texture(gl);
  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      tMap: { value: texture },
      uHover: { value: 0 },
      uTime: { value: 0 },
      uMouse: { value: [0.5, 0.5] },
      uImgSize: { value: [1, 1] },
      uPlaneSize: { value: [1, 1] },
    },
  });

  const mesh = new Mesh(gl, { geometry: new Plane(gl, { width: 2, height: 2 }), program });
  mesh.setParent(scene);

  // Demand-driven render loop: rAF only runs while the figure is on screen AND the
  // hover ripple is active or still settling. Idle galleries cost zero GPU/CPU —
  // a dozen always-on loops was the page's main scroll-stutter source.
  let hoverTarget = 0;
  let running = false;
  let visible = true;

  // The canvas sits ON TOP of the <img>; when the texture renders it fully covers it,
  // and if the upload ever fails the canvas stays transparent and the <img> shows through.
  const applyTexture = () => {
    texture.image = img;
    program.uniforms.uImgSize.value = [img.naturalWidth || 1, img.naturalHeight || 1];
    wake();
  };
  if (img.complete && img.naturalWidth) applyTexture();
  else img.addEventListener('load', applyTexture, { once: true });

  const resize = () => {
    const w = figure.clientWidth;
    const h = figure.clientHeight;
    renderer.setSize(w, h);
    program.uniforms.uPlaneSize.value = [w, h];
    wake();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(figure);

  function loop(t: number) {
    program.uniforms.uTime.value = t * 0.001;
    const cur = program.uniforms.uHover.value as number;
    const next = cur + (hoverTarget - cur) * 0.08;
    program.uniforms.uHover.value = next;
    renderer.render({ scene, camera });
    if (!visible || (hoverTarget === 0 && next < 0.001)) {
      program.uniforms.uHover.value = hoverTarget;
      running = false;
      return;
    }
    requestAnimationFrame(loop);
  }
  function wake() {
    if (!running) {
      running = true;
      requestAnimationFrame(loop);
    }
  }

  host.addEventListener('pointerenter', () => { hoverTarget = 1; wake(); });
  host.addEventListener('pointerleave', () => (hoverTarget = 0));
  host.addEventListener('pointermove', (e) => {
    // uv against the CANVAS rect (not the figure) so a transformed canvas — e.g. the
    // scrubbed row parallax — still maps the cursor onto the plane exactly.
    const r = canvas.getBoundingClientRect();
    program.uniforms.uMouse.value = [
      (e.clientX - r.left) / r.width,
      1 - (e.clientY - r.top) / r.height,
    ];
    wake();
  });
  new IntersectionObserver(
    (entries) => entries.forEach((e) => { visible = e.isIntersecting; if (visible) wake(); }),
    { threshold: 0 },
  ).observe(figure);
}
