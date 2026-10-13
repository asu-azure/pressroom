/**
 * The crate's WebGL stage: one renderer, one camera, the lights, and a frame loop that only runs
 * while something is moving — the same rule as the shelf's press run (scripts/press.ts). Each
 * moving part registers a ticker; a frame is drawn while any ticker asks for another one, and the
 * loop stops the moment they all say no. Paused off-screen and in a hidden tab, DPR capped at 1.5.
 */
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';

type Three = typeof import('three');

/** Called every frame with the step and the clock (s). Return true to ask for another frame. */
export type Ticker = (dt: number, t: number) => boolean;

export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  /** canvas size in CSS px */
  size: { w: number; h: number };
  add(t: Ticker): () => void;
  /** Draw at least one more frame (something changed). */
  kick(): void;
  onResize(fn: () => void): void;
  /** Run every ticker once with this step and draw; true if any wants another frame. For tests
   *  (a background tab throttles timers and never gets rAF, so real frames cannot be counted). */
  step(dt: number): boolean;
  dispose(): void;
}

/**
 * What the plastic reflects: a dark room with a few softboxes. A bright room (three's
 * RoomEnvironment) made every layer of a clear case reflect white walls, and stacked up they read
 * as milky plastic; in the dark only the panels show, as the crisp streaks real cases throw.
 */
function studioEnvironment(THREE: Three): Scene {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(40, 40, 40),
    new THREE.MeshBasicMaterial({ color: 0x0a0e1c, side: THREE.BackSide }),
  );
  env.add(room);
  const panel = (w: number, h: number, color: number, power: number, pos: [number, number, number]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  // not too bright: an empty case turned to it stacks four reflections of it into a white blot
  panel(12, 8, 0xffffff, 3.2, [-10, 14, 12]); // key softbox, above left, in front
  panel(4, 24, 0xc8d6ff, 4, [17, 2, 6]); // a tall strip on the right
  panel(24, 3, 0xffffff, 2.5, [0, -6, 18]); // a low bar in front: the bottom edges catch it
  panel(10, 10, 0x8fb2ff, 1.5, [0, 8, -18]); // the night sky behind
  return env;
}

export async function createStage(
  THREE: Three,
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  onFail: () => void,
): Promise<Stage> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = studioEnvironment(THREE);
  scene.environment = pmrem.fromScene(studio, 0.02).texture;
  studio.traverse((o) => {
    const m = o as import('three').Mesh;
    m.geometry?.dispose();
    (m.material as import('three').Material | undefined)?.dispose?.();
  });
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-18, 26, 34);
  const rim = new THREE.DirectionalLight(0xa9c2ff, 1.4);
  rim.position.set(26, -8, -18);
  scene.add(key, rim, new THREE.HemisphereLight(0xdfe8ff, 0x1a2140, 0.5));

  const camera = new THREE.PerspectiveCamera(28, 1, 1, 400);
  camera.position.set(0, 0, 48);

  const size = { w: 1, h: 1 };
  const resizers: (() => void)[] = [];
  const tickers = new Set<Ticker>();
  let raf = 0;
  let onScreen = true;
  // Dev only: ?tick=timer drives frames with timers and ignores page visibility, because a
  // browser window under automation is often reported hidden by the OS and never gets rAF.
  const timers = import.meta.env.DEV && new URLSearchParams(location.search).get('tick') === 'timer';
  const shown = () => timers || !document.hidden;
  let visible = shown();
  let last = 0;
  let clock = 0;
  let dead = false;
  const next = (f: (now: number) => void) =>
    timers ? window.setTimeout(() => f(performance.now()), 16) : requestAnimationFrame(f);
  const cancel = (id: number) => (timers ? clearTimeout(id) : cancelAnimationFrame(id));

  const frame = (now: number) => {
    raf = 0;
    if (dead) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    let more = false;
    for (const t of tickers) if (t(dt, now / 1000)) more = true;
    renderer.render(scene, camera);
    if (more && visible) raf = next(frame);
    else last = 0;
  };
  const kick = () => {
    if (!raf && visible && !dead) raf = next(frame);
  };

  const layout = () => {
    const r = host.getBoundingClientRect();
    size.w = Math.max(1, Math.round(r.width));
    size.h = Math.max(1, Math.round(r.height));
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    resizers.forEach((f) => f());
    // a resize clears the canvas: draw now, or a hidden tab would come back to an empty stage
    if (!dead) renderer.render(scene, camera);
    kick();
  };
  const ro = new ResizeObserver(layout);
  ro.observe(host);
  layout();

  const io = new IntersectionObserver(([en]) => {
    onScreen = en.isIntersecting;
    onVis();
  });
  io.observe(host);
  function onVis() {
    visible = onScreen && shown();
    if (visible) kick();
  }
  document.addEventListener('visibilitychange', onVis);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    dead = true;
    cancel(raf);
    onFail();
  });

  return {
    renderer,
    scene,
    camera,
    size,
    add(t) {
      tickers.add(t);
      kick();
      return () => tickers.delete(t);
    },
    kick,
    onResize(fn) {
      resizers.push(fn);
      fn();
    },
    step(dt) {
      let more = false;
      clock += dt;
      for (const t of tickers) if (t(dt, clock)) more = true;
      renderer.render(scene, camera);
      return more;
    },
    dispose() {
      dead = true;
      cancel(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      renderer.dispose();
    },
  };
}
