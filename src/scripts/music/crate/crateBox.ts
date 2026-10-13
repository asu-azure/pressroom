/**
 * The wooden crate, built from boards: a slatted floor, two slatted long sides (the gap lets you
 * see the cases inside), and two solid ends with a hand hole. Pine, drawn on a canvas
 * (textures.ts). Units are centimetres; the floor's top is y = 0, the row runs along x.
 */
import type { BufferGeometry, Group } from 'three';
import { merge } from './jewel';
import { shadowTexture, woodTexture } from './textures';

type Three = typeof import('three');

/** Crate measurements around a row of `n` cases. */
export function crateSize(n: number) {
  const spacing = 2.05;
  const length = n * spacing + 1.4; // inside, along the row
  return { spacing, length, width: 14.8, height: 8.2, board: 0.8 };
}

export function buildCrate(THREE: Three, n: number): Group {
  const { length: L, width: W, height: H, board: t } = crateSize(n);
  const TILE = 1 / 14; // one pass of the grain per 14 cm

  // a board along x (or turned), its UVs scaled so the grain tiles instead of stretching
  const plank = (lx: number, ly: number, lz: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(lx, ly, lz).toNonIndexed();
    const uv = g.getAttribute('uv');
    const long = Math.max(lx, lz);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * long * TILE, uv.getY(i) * Math.min(ly, 4) * TILE);
    g.translate(x, y, z);
    return g;
  };

  const parts: BufferGeometry[] = [];
  // the floor: three boards with hairline gaps
  const fw = W / 3;
  for (let k = 0; k < 3; k++) parts.push(plank(L + 2 * t, t, fw - 0.12, 0, -t / 2, -W / 2 + fw * (k + 0.5)));
  // the long sides: a low board and a high one, a gap between
  const low = H * 0.42;
  const high = H * 0.44;
  for (const s of [-1, 1]) {
    const z = s * (W / 2 + t / 2);
    parts.push(plank(L + 2 * t, low, t, 0, low / 2, z));
    parts.push(plank(L + 2 * t, high, t, 0, H - high / 2, z));
  }
  // the ends: one board each with a hand hole near the top, fitted between the long sides
  {
    const w = W;
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, H + 0.4);
    s.lineTo(-w / 2, H + 0.4);
    s.closePath();
    const hole = new THREE.Path();
    const hw = 3.2;
    const hh = 0.7;
    const hy = H - 1.6;
    hole.absarc(-hw + hh, hy, hh, Math.PI / 2, (Math.PI * 3) / 2, false);
    hole.absarc(hw - hh, hy, hh, -Math.PI / 2, Math.PI / 2, false);
    hole.closePath();
    s.holes.push(hole);
    for (const side of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1, curveSegments: 10 });
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TILE, uv.getY(i) * TILE);
      g.rotateY(Math.PI / 2);
      g.translate(side * (L / 2 + t) + (side < 0 ? 0 : -t), 0, 0);
      parts.push(g.index ? g.toNonIndexed() : g);
    }
  }

  const wood = woodTexture(THREE);
  const crate = new THREE.Mesh(
    merge(parts)!,
    new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8, metalness: 0, color: 0xcfc6b8, envMapIntensity: 0.6 }),
  );
  parts.forEach((g) => g.dispose());

  // a soft shadow on the "floor" the crate stands on
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry((L + 2 * t) * 1.7, (W + 2 * t) * 1.9),
    new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowTexture(THREE), transparent: true, opacity: 0.6, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -t - 0.02;
  shadow.renderOrder = -1;

  const g = new THREE.Group();
  g.add(shadow, crate);
  return g;
}
