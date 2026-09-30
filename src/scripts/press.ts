/**
 * The press run — the shelf hero's art, printed.
 *
 * The site is a pressroom, so its first picture is pulled off a four-colour
 * press rather than simply shown. One WebGL canvas behind the masthead:
 *
 *   - PRESS RUN (on load, ~0.9 s): the art is separated into C, M, Y and K
 *     plates and they print one after another, each sliding in from off-register
 *     and locking on. Cyan alone reads as a cold ghost, magenta makes it blue,
 *     yellow brings the colour, black brings the drawing. That order IS the
 *     reveal, which is why no other entrance is needed.
 *   - LOUPE (fine pointers): a printer's glass under the pointer — ×3, lit, and
 *     at that magnification the halftone is visible: four screens at their real
 *     angles (C 15°, M 75°, Y 0°, K 45°) forming rosettes. A densitometer
 *     readout beside it gives the ink under the crosshair. The lens is at the
 *     pointer every frame (no easing, no trailing — see the custom-cursor note
 *     in CLAUDE.md), the system cursor stays, and it lives under the type.
 *   - SCROLL: fast scrolling knocks the plates out of register a little, the
 *     way a press shakes; they spring back as the page settles.
 *
 * Cost: one context on the homepage only, capped at 1.5× DPR, and no frame loop
 * at rest — frames run only while something is moving. It pauses off-screen.
 * The <img> underneath stays the real picture: with reduced motion, no WebGL,
 * a lost context or any failure, the page is exactly what it was before.
 */

const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_dpr;
uniform vec4 u_rect;
uniform vec2 u_size;
uniform vec2 u_off[4];
uniform float u_ink[4];
uniform vec3 u_lens;
uniform float u_lensOn;
uniform float u_mag;
uniform float u_cell;

const vec3 BG = vec3(0.047, 0.047, 0.051);
const vec3 PAPER = vec3(0.965, 0.95, 0.915);

vec3 img(vec2 p) {
  vec2 uv = (p - u_rect.xy) / u_rect.zw;
  return texture2D(u_tex, clamp(uv, 0.0, 1.0)).rgb;
}
vec4 cmyk(vec3 c) {
  float k = 1.0 - max(max(c.r, c.g), c.b);
  float d = max(1.0 - k, 1e-4);
  return vec4((1.0 - c.r - k) / d, (1.0 - c.g - k) / d, (1.0 - c.b - k) / d, k);
}
float pick(vec4 v, int i) {
  if (i == 0) return v.x;
  if (i == 1) return v.y;
  if (i == 2) return v.z;
  return v.w;
}
vec3 inkOf(int i) {
  if (i == 0) return vec3(0.0, 0.64, 0.9);
  if (i == 1) return vec3(0.9, 0.05, 0.52);
  if (i == 2) return vec3(1.0, 0.92, 0.0);
  return vec3(0.12, 0.115, 0.11);
}
float angleOf(int i) {
  if (i == 0) return 0.2618;
  if (i == 1) return 1.309;
  if (i == 2) return 0.0;
  return 0.7854;
}
// The CSS scrim this canvas replaces: two stacked gradients of the ink colour.
float ramp4(float t, vec4 a, vec4 s) {
  if (t < s.y) return mix(a.x, a.y, clamp((t - s.x) / (s.y - s.x), 0.0, 1.0));
  if (t < s.z) return mix(a.y, a.z, (t - s.y) / (s.z - s.y));
  return mix(a.z, a.w, clamp((t - s.z) / (s.w - s.z), 0.0, 1.0));
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_dpr;

  // --- the sheet at reading distance: continuous-tone plates, each at its own
  // register offset, recombined with ideal inks (exact at zero offset).
  float c = pick(cmyk(img(p - u_off[0])), 0) * u_ink[0];
  float m = pick(cmyk(img(p - u_off[1])), 1) * u_ink[1];
  float y = pick(cmyk(img(p - u_off[2])), 2) * u_ink[2];
  float k = pick(cmyk(img(p - u_off[3])), 3) * u_ink[3];
  vec3 sheet = vec3((1.0 - c) * (1.0 - k), (1.0 - m) * (1.0 - k), (1.0 - y) * (1.0 - k));
  sheet = mix(BG, sheet, u_ink[0]);
  vec3 base = sheet * 0.6 + BG * 0.4;
  vec2 t = p / u_size;
  float a1 = ramp4(t.x, vec4(0.9, 0.78, 0.45, 0.3), vec4(0.0, 0.38, 0.7, 1.0));
  float a2 = ramp4(t.y, vec4(0.45, 0.0, 0.0, 0.75), vec4(0.0, 0.4, 0.41, 1.0));
  base = mix(base, BG, 1.0 - (1.0 - a1) * (1.0 - a2));

  // --- the loupe
  float R = u_lens.z * (0.7 + 0.3 * u_lensOn);
  float d = distance(p, u_lens.xy);
  base *= 1.0 - 0.55 * u_lensOn * smoothstep(R + 26.0, R, d) * step(R, d);
  float inside = (1.0 - smoothstep(R - 1.0, R + 0.5, d)) * u_lensOn;
  if (inside <= 0.0) { gl_FragColor = vec4(base, 1.0); return; }

  vec2 q = u_lens.xy + (p - u_lens.xy) / u_mag;
  float aa = 0.9 / (u_mag * u_cell);
  vec3 lens = PAPER;
  for (int i = 0; i < 4; i++) {
    float an = angleOf(i);
    mat2 rot = mat2(cos(an), -sin(an), sin(an), cos(an));
    vec2 g = rot * q / u_cell;
    vec2 cc = floor(g) + 0.5;
    vec2 centre = (cc * u_cell) * rot;
    float v = pick(cmyk(img(centre - u_off[i])), i) * u_ink[i];
    float r = sqrt(clamp(v, 0.0, 1.0)) * 0.76;
    float cov = 1.0 - smoothstep(r - aa, r + aa, length(g - cc));
    lens *= mix(vec3(1.0), inkOf(i), cov);
  }
  // lit from the rim, falling off toward the glass edge
  lens *= 1.0 - 0.28 * smoothstep(R * 0.72, R, d);
  gl_FragColor = vec4(mix(base, lens, inside), 1.0);
}
`;

const DIRS: [number, number][] = [
  [-0.96, 0.28],
  [0.98, -0.2],
  [0.2, 0.98],
  [-0.3, -0.95],
];
const RUN_START = 64; // px off-register when a plate first touches the sheet
const LENS_R = 92;
const MAG = 3;
const CELL = 2.3; // halftone cell in hero px — about 7 px under the glass

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * Math.max(0, t)));

function release() {
  delete document.documentElement.dataset.press;
}

export function initPress(hero: HTMLElement) {
  const holder = hero.querySelector<HTMLElement>('.lib-hero__art');
  const photo = holder?.querySelector('img');
  if (!holder || !photo || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    release();
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'press__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) {
    release();
    return;
  }

  const fail = () => {
    holder.classList.remove('is-pressed');
    canvas.remove();
    loupe?.remove();
    release();
  };

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  let prog: WebGLProgram;
  try {
    prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
  } catch (e) {
    console.warn('[press]', e);
    release();
    return;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n: string) => gl.getUniformLocation(prog, n);
  const u = {
    res: U('u_res'),
    dpr: U('u_dpr'),
    rect: U('u_rect'),
    size: U('u_size'),
    off: U('u_off'),
    ink: U('u_ink'),
    lens: U('u_lens'),
    lensOn: U('u_lensOn'),
    mag: U('u_mag'),
    cell: U('u_cell'),
  };
  gl.uniform1f(u.mag, MAG);
  gl.uniform1f(u.cell, CELL);

  // --- loupe overlay: reticle + densitometer readout (fine pointers only) ----
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let loupe: HTMLElement | null = null;
  let readout: HTMLElement | null = null;
  if (fine) {
    loupe = document.createElement('div');
    loupe.className = 'press__loupe';
    loupe.setAttribute('aria-hidden', 'true');
    const ticks = Array.from({ length: 13 }, (_, i) => {
      const x = -41.4 + i * 6.9;
      const h = i % 5 === 1 ? 7 : 4; // every fifth cell is a long tick, centred on 0
      return `<line x1="${x}" y1="${46 - h}" x2="${x}" y2="46"/>`;
    }).join('');
    loupe.innerHTML =
      `<svg viewBox="-100 -100 200 200" width="200" height="200">` +
      `<circle r="${LENS_R}" class="press__ring"/>` +
      `<circle r="${LENS_R + 5}" class="press__ring press__ring--outer"/>` +
      `<g class="press__tick"><line x1="-8" y1="0" x2="-3" y2="0"/><line x1="3" y1="0" x2="8" y2="0"/>` +
      `<line x1="0" y1="-8" x2="0" y2="-3"/><line x1="0" y1="3" x2="0" y2="8"/>` +
      `<line x1="-41.4" y1="46" x2="41.4" y2="46"/>${ticks}</g>` +
      `</svg>` +
      `<div class="press__read mono"><span class="press__k">LOUPE ×${MAG}</span><span data-read></span></div>`;
    readout = loupe.querySelector('[data-read]');
    holder.append(loupe);
  }
  holder.append(canvas);

  // --- densitometer: a small CPU copy of the art to read ink values from ----
  let probe: { data: Uint8ClampedArray; w: number; h: number } | null = null;

  // --- state -----------------------------------------------------------------
  let W = 0;
  let H = 0;
  let dpr = 1;
  const rect = { x: 0, y: 0, w: 1, h: 1 };
  const off = new Float32Array(8);
  const ink = new Float32Array(4);
  const shake = [0, 0, 0, 0, 0, 0, 0, 0];
  let runStart = -1;
  let lensX = -999;
  let lensY = -999;
  let lensOn = 0;
  let lensTarget = 0;
  let visible = true;
  let raf = 0;
  let ready = false;

  const layout = () => {
    const r = hero.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    // object-fit: cover; object-position: center 30% — same as the <img>.
    const iw = photo.naturalWidth || 1;
    const ih = photo.naturalHeight || 1;
    const s = Math.max(W / iw, H / ih);
    rect.w = iw * s;
    rect.h = ih * s;
    rect.x = (W - rect.w) * 0.5;
    rect.y = (H - rect.h) * 0.3;
  };

  const readInk = () => {
    if (!readout || !probe) return;
    const u = (lensX - rect.x) / rect.w;
    const v = (lensY - rect.y) / rect.h;
    const px = Math.min(probe.w - 1, Math.max(0, Math.floor(u * probe.w)));
    const py = Math.min(probe.h - 1, Math.max(0, Math.floor(v * probe.h)));
    const i = (py * probe.w + px) * 4;
    const r = probe.data[i] / 255;
    const g = probe.data[i + 1] / 255;
    const b = probe.data[i + 2] / 255;
    const k = 1 - Math.max(r, g, b);
    const d = Math.max(1 - k, 1e-4);
    const pc = (x: number) => String(Math.round(Math.max(0, Math.min(1, x)) * 100)).padStart(2, '0');
    readout.innerHTML =
      `<i style="--c:#00a3e6"></i>C ${pc((1 - r - k) / d)} <i style="--c:#e60d85"></i>M ${pc((1 - g - k) / d)}<br>` +
      `<i style="--c:#ffeb00"></i>Y ${pc((1 - b - k) / d)} <i style="--c:#1f1d1c"></i>K ${pc(k)}`;
  };

  const draw = (now: number) => {
    // press run
    let running = false;
    if (runStart >= 0) {
      const t = (now - runStart) / 1000;
      for (let i = 0; i < 4; i++) {
        const ti = t - i * 0.11;
        ink[i] = easeOut(ti / 0.18);
        const e = 1 - expoOut(ti / 0.55);
        off[i * 2] = DIRS[i][0] * RUN_START * e + shake[i * 2];
        off[i * 2 + 1] = DIRS[i][1] * RUN_START * e + shake[i * 2 + 1];
      }
      running = t < 0.33 + 0.6;
    }
    // scroll shake settles
    let shaking = false;
    for (let j = 0; j < 8; j++) {
      shake[j] *= 0.86;
      if (Math.abs(shake[j]) > 0.05) shaking = true;
      else shake[j] = 0;
      if (!running) off[j] = shake[j];
    }
    // lens fade
    lensOn += (lensTarget - lensOn) * 0.28;
    if (Math.abs(lensTarget - lensOn) < 0.01) lensOn = lensTarget;
    const lensMoving = lensOn !== lensTarget;

    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.dpr, dpr);
    gl.uniform4f(u.rect, rect.x, rect.y, rect.w, rect.h);
    gl.uniform2f(u.size, W, H);
    gl.uniform2fv(u.off, off);
    gl.uniform1fv(u.ink, ink);
    gl.uniform3f(u.lens, lensX, lensY, LENS_R);
    gl.uniform1f(u.lensOn, lensOn);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (loupe) {
      loupe.style.transform = `translate3d(${lensX - 100}px, ${lensY - 100}px, 0) scale(${0.7 + 0.3 * lensOn})`;
      loupe.style.opacity = String(lensOn);
      // keep the readout on the sheet near the bottom and right edges
      loupe.classList.toggle('is-up', lensY > H - 150);
      loupe.classList.toggle('is-left', lensX > W - 300);
    }
    return running || shaking || lensMoving;
  };

  const frame = (now: number) => {
    raf = 0;
    if (!visible && runStart < 0) return;
    if (draw(now)) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf && ready) raf = requestAnimationFrame(frame);
  };

  // --- texture ---------------------------------------------------------------
  const start = async () => {
    try {
      await photo.decode();
    } catch {
      /* already decoded, or broken — the size check below decides */
    }
    if (!photo.naturalWidth) return fail();
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, photo);
    } catch (e) {
      console.warn('[press]', e);
      return fail();
    }

    if (fine) {
      try {
        const pw = 240;
        const ph = Math.max(1, Math.round((pw * photo.naturalHeight) / photo.naturalWidth));
        const c2 = document.createElement('canvas');
        c2.width = pw;
        c2.height = ph;
        const ctx = c2.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(photo, 0, 0, pw, ph);
        probe = { data: ctx.getImageData(0, 0, pw, ph).data, w: pw, h: ph };
      } catch {
        probe = null;
      }
    }

    layout();
    ready = true;
    holder.classList.add('is-pressed');
    release();
    runStart = performance.now();
    kick();
  };

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    fail();
  });

  // --- input -----------------------------------------------------------------
  if (fine) {
    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = hero.getBoundingClientRect();
      lensX = e.clientX - r.left;
      lensY = e.clientY - r.top;
      lensTarget = 1;
      readInk();
      if (!raf && ready) {
        // Draw in this frame so glass and pointer never disagree.
        raf = requestAnimationFrame(frame);
      }
    });
    hero.addEventListener('pointerleave', () => {
      lensTarget = 0;
      kick();
    });
  }

  const lenis = (window as unknown as { __lenis?: { on: (e: string, f: (l: { velocity: number }) => void) => void } })
    .__lenis;
  lenis?.on('scroll', (l) => {
    if (!visible || !ready) return;
    const v = Math.max(-1, Math.min(1, l.velocity / 30));
    for (let i = 0; i < 4; i++) {
      shake[i * 2] = DIRS[i][0] * 14 * v;
      shake[i * 2 + 1] = DIRS[i][1] * 14 * v;
    }
    kick();
  });

  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible) kick();
  }).observe(hero);

  new ResizeObserver(() => {
    if (!ready) return;
    layout();
    kick();
  }).observe(hero);

  void start();
}
