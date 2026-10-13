/**
 * One clear CD case, built from code: the tray (base, a double rim, corner brackets, the disc
 * seat, the hub rosette and the hinge knuckles), a lid on a hinge, and the disc — its printed
 * face on top, a rainbow underside below. Units are centimetres; the case faces +z (the lid).
 *
 * Every case shares one kit of geometries and materials; a case owns only its jacket, its disc
 * face and the spine geometry that picks its column out of the shared spine atlas.
 *
 * A CD case holds paper too: the jacket under the clear lid (it swings with the lid, and the inside
 * of the booklet shows when the lid lies open) and the spine card inside the hinge wall, which is
 * what faces you in the crate, so the titles there tell the CDs apart (all three share one picture).
 *
 * The plastic is not three's `transmission` (an extra pass per frame, and a clear case would hide
 * the clear cases behind it). It is a thin transparent body whose reflections are NOT dimmed by its
 * opacity, plus a Fresnel term that thickens it at grazing angles. Bevels and an edge outline
 * catch the light, which is what makes a jewel case read as glass.
 */
import type { BufferGeometry, Group, Material, MeshPhysicalMaterial, MeshStandardMaterial, Points, ShaderMaterial, Texture } from 'three';
import { DISC, discFace, grooveMap, sparkleTexture } from './textures';

type Three = typeof import('three');

/** Case size in cm (a square jewel case). */
export const CASE = { w: 13.6, h: 13.2, d: 1.0, r: 0.55 } as const;
/** Lid hinge: left edge, near the front. */
const HINGE = { x: -CASE.w / 2 + 0.12, z: 0.33 };
/** Where the disc sits in the tray. */
const DISC_AT = { x: 0.3, y: 0, z: -0.04 };
/** How far the lid swings open (rad). */
const LID_OPEN = 2.72;
/** The jacket: a 12 cm booklet under the lid, nudged off the hinge tabs. */
const JACKET = { size: 12, x: -HINGE.x + 0.15, z: 0.035 };
/** The spine card, inside the tray's hinge wall: 0.62 deep, 12.6 tall. */
const SPINE = { x: -CASE.w / 2 + 0.17, z: -0.1, w: 0.62, h: 12.6 };

export interface JewelKit {
  THREE: Three;
  tray: BufferGeometry;
  trayEdges: BufferGeometry;
  lid: BufferGeometry;
  lidEdges: BufferGeometry;
  discTop: BufferGeometry;
  discBottom: BufferGeometry;
  discRim: BufferGeometry;
  jacket: BufferGeometry;
  spine: BufferGeometry;
  plastic: Material;
  lidPlastic: Material;
  line: Material;
  silver: MeshPhysicalMaterial;
  rimSilver: MeshPhysicalMaterial;
  /** the inside of the booklet (one picture for every case) and the spine atlas */
  inner: MeshStandardMaterial;
  spines: MeshStandardMaterial;
  /** how many columns the spine atlas has */
  spineColumns: number;
  sparkle: Texture;
}

export interface Jewel {
  root: Group;
  /** the hinge pivot; its child is the lid */
  lid: Group;
  disc: Group;
  kind: 'cd' | 'blank';
  /** 0 = shut, 1 = open */
  setOpen(v: number): void;
  /** the jacket under the lid (the case owns the texture from here on) */
  setJacket(tex: Texture): void;
  /** the disc's print; the clear hub is drawn over its middle */
  setDisc(img: CanvasImageSource): void;
  dispose(): void;
}

/** A rounded rectangle centred on the origin. */
function rrect(THREE: Three, w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const rpath = (THREE: Three, w: number, h: number, r: number) => {
  const p = new THREE.Path();
  p.setFromPoints(rrect(THREE, w, h, r).getPoints(8).reverse());
  return p;
};

function slab(THREE: Three, shape: InstanceType<Three['Shape']>, depth: number, bevel: number, z: number, curveSegments = 8) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments,
  });
  g.translate(0, 0, z);
  return g;
}

/** A rounded-rectangle wall: outer w×h, `wall` thick, `depth` tall, starting at z. */
function frame(THREE: Three, w: number, h: number, r: number, wall: number, depth: number, z: number, bevel = 0.025) {
  const s = rrect(THREE, w, h, r);
  s.holes.push(rpath(THREE, w - wall * 2, h - wall * 2, Math.max(0.05, r - wall)));
  return slab(THREE, s, depth, bevel, z);
}

/** An L-shaped bracket for a tray corner, its corner at the origin, arms along +x and +y. */
function bracket(THREE: Three, arm: number, t: number, depth: number, z: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(arm, 0);
  s.lineTo(arm, t);
  s.lineTo(t, t);
  s.lineTo(t, arm);
  s.lineTo(0, arm);
  s.closePath();
  return slab(THREE, s, depth, 0.015, z);
}

/** The plastic: reflections at full strength, body faint, thicker at grazing angles. */
function glass(THREE: Three, opacity: number, edge: number) {
  const m = new THREE.MeshPhysicalMaterial({
    // clear plastic has next to no diffuse: a dark tint, so stacked layers do not wash out
    color: 0x2a3448,
    metalness: 0,
    roughness: 0.035,
    ior: 1.5,
    specularIntensity: 0.75,
    envMapIntensity: 0.95,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    premultipliedAlpha: true,
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.uEdge = { value: edge };
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uEdge;')
      .replace(
        '#include <opaque_fragment>',
        `float facing = abs(dot(normalize(normal), normalize(vViewPosition)));
        float alpha = clamp(diffuseColor.a + uEdge * pow(1.0 - facing, 3.0), 0.0, 1.0);
        // roll off strong reflections: a case has four faces in line, and four full-strength
        // reflections of one softbox stacked into a white blot
        vec3 spec = outgoingLight - totalDiffuse;
        spec = spec / (1.0 + spec * 1.6);
        gl_FragColor = vec4(totalDiffuse * alpha + spec, alpha);`,
      )
      .replace('#include <premultiplied_alpha_fragment>', '');
  };
  m.customProgramCacheKey = () => `crate-glass-${edge}`;
  return m;
}

/**
 * A CD's rainbow: its track is a grating (~1.6 µm pitch) of circular grooves, so each light
 * splits into spectra along the line where the half-vector lies across the grooves. For every
 * directional light, the wavelengths of orders 1–3 come from the half-vector's component along the
 * groove tangent; a narrow window across the grooves keeps it to the radial streak. Spectrum:
 * Zucconi's six-bump fit. The disc must be centred on its local origin (the groove centre).
 */
function diffraction(m: MeshPhysicalMaterial, strength = 1.6) {
  m.onBeforeCompile = (s) => {
    s.uniforms.uDiffract = { value: strength };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroove;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGroove = mat3(modelViewMatrix) * vec3(-position.y, position.x, 0.0);',
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGroove;
        uniform float uDiffract;
        vec3 bump3y(vec3 x, vec3 y0) { return saturate(1.0 - x * x - y0); }
        vec3 spectrum(float w) {
          float x = saturate((w - 400.0) / 300.0);
          return (
            bump3y(vec3(3.54585104, 2.93225262, 2.41593945) * (x - vec3(0.69549072, 0.49228336, 0.27699880)), vec3(0.02312639, 0.15225084, 0.52607955)) +
            bump3y(vec3(3.90307140, 3.21182957, 3.96587128) * (x - vec3(0.11748627, 0.86755042, 0.66077860)), vec3(0.84897130, 0.88445281, 0.73949448))
          ) * step(380.0, w) * step(w, 760.0);
        }
        vec3 grating(vec3 L, vec3 V, vec3 N, vec3 T, vec3 col) {
          vec3 B = normalize(cross(N, T));
          vec3 H = L + V;
          float across = dot(B, normalize(H));
          float window = exp(-across * across / 0.012) * saturate(dot(N, L) * 4.0);
          float u = abs(dot(T, H)) * 1600.0;
          vec3 c = vec3(0.0);
          for (int n = 1; n <= 3; n++) c += spectrum(u / float(n));
          return c * col * window;
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#if NUM_DIR_LIGHTS > 0
        {
          vec3 rainbow = vec3(0.0);
          vec3 Tg = normalize(vGroove);
          vec3 Vw = normalize(vViewPosition);
          #pragma unroll_loop_start
          for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
            rainbow += grating(directionalLights[ i ].direction, Vw, normal, Tg, directionalLights[ i ].color);
          }
          #pragma unroll_loop_end
          outgoingLight += rainbow * uDiffract;
        }
        #endif
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'crate-diffraction';
}

export function jewelKit(THREE: Three, spineColumns = 4): JewelKit {
  const { w, h, r } = CASE;
  const { mergeGeometries } = THREE_UTILS;
  const z0 = -CASE.d / 2;

  // --- the tray -------------------------------------------------------------------------
  const parts: BufferGeometry[] = [
    slab(THREE, rrect(THREE, w, h, r), 0.08, 0.03, z0 + 0.03),
    frame(THREE, w, h, r, 0.14, 0.66, z0 + 0.06),
    frame(THREE, w - 0.62, h - 0.62, r * 0.6, 0.06, 0.34, z0 + 0.1, 0.015),
  ];
  // corner brackets, just inside the inner wall; turned (not mirrored, which would flip the
  // winding) so the arms point inwards: bottom-left, bottom-right, top-right, top-left
  const arm = 2.3;
  const ins = 0.62;
  [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].forEach(([sx, sy], i) => {
    const b = bracket(THREE, arm, 0.1, 0.3, z0 + 0.1);
    b.rotateZ((i * Math.PI) / 2);
    b.translate(sx * (w / 2 - ins), sy * (h / 2 - ins), 0);
    parts.push(b);
  });
  // the disc seat: a low ring under the disc's edge
  {
    const s = new THREE.Shape().absarc(0, 0, DISC.r + 0.22, 0, Math.PI * 2, false);
    s.holes.push(new THREE.Path().absarc(0, 0, DISC.r + 0.08, 0, Math.PI * 2, true));
    const g = slab(THREE, s, 0.12, 0.01, z0 + 0.1, 96);
    g.translate(DISC_AT.x, DISC_AT.y, 0);
    parts.push(g);
  }
  // the hub: a stepped boss — the disc rests on its shoulder, the crown comes up through the hole
  {
    const prof = [
      [2.2, 0],
      [2.0, 0.1],
      [1.45, 0.12],
      [1.3, 0.26],
      [0.9, 0.26],
      [0.72, 0.3],
      [0.72, 0.52],
      [0.6, 0.6],
      [0.45, 0.6],
      [0.45, 0],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(prof, 48);
    g.rotateX(Math.PI / 2); // lathe y → z
    g.translate(DISC_AT.x, DISC_AT.y, z0 + 0.14);
    parts.push(g);
  }
  // hinge knuckles along the left edge
  for (const y of [-h / 2 + 1.1, h / 2 - 1.1]) {
    const k = new THREE.CylinderGeometry(0.17, 0.17, 1.5, 16);
    k.translate(HINGE.x, y, HINGE.z);
    parts.push(k.toNonIndexed());
  }
  const tray = mergeGeometries(
    parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.deleteAttribute('uv'), g)),
  )!;
  parts.forEach((g) => g.dispose());

  // --- the lid (built around the hinge, so the pivot is the origin) ----------------------
  const lidParts: BufferGeometry[] = [
    slab(THREE, rrect(THREE, w, h, r), 0.06, 0.025, 0.4),
    frame(THREE, w, h, r, 0.12, 0.14, 0.27),
    // the two tabs that wrap the knuckles
    ...[-2.6, 2.6].map((y) => {
      const t = new THREE.BoxGeometry(0.5, 1.9, 0.2);
      t.translate(-w / 2 + 0.22, y, HINGE.z + 0.02);
      return t.toNonIndexed();
    }),
  ];
  const lid = mergeGeometries(lidParts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.deleteAttribute('uv'), g)))!;
  lid.translate(-HINGE.x, 0, -HINGE.z);
  lidParts.forEach((g) => g.dispose());

  // --- the disc ---------------------------------------------------------------------------
  const discTop = new THREE.RingGeometry(DISC.hole, DISC.r, 128, 1);
  discTop.translate(0, 0, 0.06);
  const discBottom = new THREE.RingGeometry(DISC.hole, DISC.r, 128, 1);
  discBottom.rotateY(Math.PI);
  discBottom.translate(0, 0, -0.06);
  const discRim = new THREE.CylinderGeometry(DISC.r, DISC.r, 0.12, 128, 1, true);
  discRim.rotateX(Math.PI / 2);

  // the paper: the jacket faces up under the lid; the spine card faces out through the hinge wall
  // (−x), its width running along z, so a column of the atlas reads top to bottom on a standing case
  const jacket = new THREE.PlaneGeometry(JACKET.size, JACKET.size);
  const spine = new THREE.PlaneGeometry(SPINE.w, SPINE.h);
  spine.rotateY(-Math.PI / 2);
  // printed paper: matte, a little sheen, dark until its picture arrives
  const paper = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0, envMapIntensity: 0.55 });

  const silver = new THREE.MeshPhysicalMaterial({
    color: 0xd7dbe2,
    metalness: 1,
    roughness: 0.2,
    iridescence: 1,
    iridescenceIOR: 1.8,
    iridescenceThicknessRange: [180, 820],
    anisotropy: 0.85,
    anisotropyMap: grooveMap(THREE),
    envMapIntensity: 1.4,
  });
  diffraction(silver);

  return {
    THREE,
    tray,
    trayEdges: new THREE.EdgesGeometry(tray, 32),
    lid,
    lidEdges: new THREE.EdgesGeometry(lid, 32),
    discTop,
    discBottom,
    discRim,
    jacket,
    spine,
    plastic: glass(THREE, 0.035, 0.55),
    lidPlastic: glass(THREE, 0.02, 0.45),
    line: new THREE.LineBasicMaterial({ color: 0xf2f5ff, transparent: true, opacity: 0.32, depthWrite: false }),
    silver,
    rimSilver: new THREE.MeshPhysicalMaterial({ color: 0xc9ced6, metalness: 1, roughness: 0.3 }),
    inner: paper(0x0b0d1a),
    spines: paper(0x0b0d1a),
    spineColumns,
    sparkle: sparkleTexture(THREE),
  };
}

/** BufferGeometryUtils, loaded once with three (see loadThree). */
let THREE_UTILS: typeof import('three/addons/utils/BufferGeometryUtils.js');

/** Merge geometries that share attributes into one (fewer draw calls). */
export const merge = (parts: BufferGeometry[]) => THREE_UTILS.mergeGeometries(parts);

/** three and the one addon module the kit needs, in one chunk only this page loads. */
export async function loadThree(): Promise<Three> {
  const [THREE, utils] = await Promise.all([import('three'), import('three/addons/utils/BufferGeometryUtils.js')]);
  THREE_UTILS = utils;
  return THREE;
}

export function buildJewel(kit: JewelKit, kind: Jewel['kind'], spineColumn = -1): Jewel {
  const { THREE } = kit;
  const root = new THREE.Group();

  const tray = new THREE.Mesh(kit.tray, kit.plastic);
  tray.renderOrder = 1;
  const trayLines = new THREE.LineSegments(kit.trayEdges, kit.line);
  trayLines.renderOrder = 3;

  const lid = new THREE.Group();
  lid.position.set(HINGE.x, 0, HINGE.z);
  const lidMesh = new THREE.Mesh(kit.lid, kit.lidPlastic);
  lidMesh.renderOrder = 2;
  const lidLines = new THREE.LineSegments(kit.lidEdges, kit.line);
  lidLines.renderOrder = 3;
  lid.add(lidMesh, lidLines);

  const disc = new THREE.Group();
  disc.position.set(DISC_AT.x, DISC_AT.y, DISC_AT.z);
  let face: MeshPhysicalMaterial | null = null;
  let jacket: MeshStandardMaterial | null = null;
  let spineGeo: BufferGeometry | null = null;
  if (kind === 'cd') {
    face = new THREE.MeshPhysicalMaterial({
      map: discFace(THREE, null),
      // a printed label is nearly matte: a glossy one turned into a white glare over the
      // cover whenever a case faced the key light
      roughness: 0.62,
      metalness: 0,
      specularIntensity: 0.3,
      clearcoat: 0.12,
      clearcoatRoughness: 0.3,
    });
    disc.add(
      new THREE.Mesh(kit.discTop, face),
      new THREE.Mesh(kit.discBottom, kit.silver),
      new THREE.Mesh(kit.discRim, kit.rimSilver),
    );
    // the jacket under the lid, and the inside of the booklet on its back
    jacket = new THREE.MeshStandardMaterial({ color: 0x0b0d1a, roughness: 0.68, metalness: 0, envMapIntensity: 0.55 });
    const front = new THREE.Mesh(kit.jacket, jacket);
    front.position.set(JACKET.x, 0, JACKET.z);
    const back = new THREE.Mesh(kit.jacket, kit.inner);
    back.rotation.y = Math.PI;
    back.position.set(JACKET.x, 0, JACKET.z - 0.005);
    lid.add(front, back);
    // the spine card, its own column of the shared atlas
    if (spineColumn >= 0) {
      spineGeo = kit.spine.clone();
      const uv = spineGeo.getAttribute('uv');
      for (let k = 0; k < uv.count; k++) uv.setX(k, (spineColumn + uv.getX(k)) / kit.spineColumns);
      uv.needsUpdate = true;
      const s = new THREE.Mesh(spineGeo, kit.spines);
      s.position.set(SPINE.x, 0, SPINE.z);
      root.add(s);
    }
  }

  root.add(tray, trayLines, disc, lid);

  return {
    root,
    lid,
    disc,
    kind,
    setOpen(v) {
      lid.rotation.y = -v * LID_OPEN;
      // the disc lifts off the hub a little as the lid clears it
      disc.position.z = DISC_AT.z + Math.max(0, v - 0.35) * 0.9;
    },
    setJacket(tex) {
      if (!jacket) return void tex.dispose();
      const old = jacket.map;
      jacket.map = tex;
      jacket.color.set(0xffffff);
      jacket.needsUpdate = !old;
      old?.dispose();
    },
    setDisc(img) {
      if (!face) return;
      const old = face.map;
      face.map = discFace(THREE, img);
      old?.dispose();
    },
    dispose() {
      face?.map?.dispose();
      face?.dispose();
      jacket?.map?.dispose();
      jacket?.dispose();
      spineGeo?.dispose();
    },
  };
}

/**
 * Twinkles scattered over a case's edges: each point flares and fades on its own clock.
 * Attach to a case's root so they move with it; drive `uniforms.uTime`.
 */
export function sparkles(kit: JewelKit, n = 26): Points<BufferGeometry, ShaderMaterial> {
  const { THREE } = kit;
  const pos = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    // along the outer edge, front and back faces
    const side = Math.floor(rnd() * 4);
    const u = rnd() - 0.5;
    const x = side < 2 ? u * CASE.w : (side === 2 ? -1 : 1) * CASE.w * 0.5;
    const y = side < 2 ? (side === 0 ? -1 : 1) * CASE.h * 0.5 : u * CASE.h;
    pos.set([x, y, (rnd() > 0.3 ? 1 : -1) * CASE.d * 0.5], i * 3);
    phase[i] = rnd() * 40;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 1 },
      uMap: { value: kit.sparkle },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      uniform float uTime;
      uniform float uSize;
      varying float vA;
      void main() {
        float s = sin(uTime * (0.9 + fract(aPhase) * 1.4) + aPhase);
        vA = pow(max(s, 0.0), 10.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (0.3 + vA) * 1600.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying float vA;
      void main() {
        if (vA < 0.01) discard;
        gl_FragColor = texture2D(uMap, gl_PointCoord) * vA;
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m);
  p.renderOrder = 5;
  return p;
}
