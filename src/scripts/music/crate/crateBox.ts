/**
 * What the CDs stand on: a slab of dark lacquer with a gold line inlaid round its top, a soft light
 * spilling out from under it, no box — the cases are the thing (Jun, 14 Oct 2026, over a navy box
 * set and a clear acrylic stand; the wooden crate of 11 Oct "isn't pretty"). Units are centimetres;
 * the plinth's top is y = 0, the row runs along x. `crateSize` is the footprint the row and the
 * camera are framed on.
 */
import type { Group } from 'three';
import { merge } from './jewel';
import { shadowTexture } from './textures';

type Three = typeof import('three');

/** The row's measurements around `n` cases (the plinth reaches past them on every side). */
export function crateSize(n: number) {
  const spacing = 2.05;
  const length = n * spacing + 1.4; // along the row
  return { spacing, length, width: 14.8, height: 8.2, board: 0.8 };
}

/** A box `lx × ly × lz` centred at (x, y, z). */
function block(THREE: Three, lx: number, ly: number, lz: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(lx, ly, lz).toNonIndexed();
  g.translate(x, y, z);
  return g;
}

export function buildCrate(THREE: Three, n: number): Group {
  const { length: L, width: W } = crateSize(n);
  const ph = 1.4;
  const PL = L + 5;
  const PW = W + 3.5;
  const group = new THREE.Group();

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(PL, ph, PW),
    new THREE.MeshPhysicalMaterial({ color: 0x121832, roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.1 }),
  );
  plinth.position.y = -ph / 2;

  // the gold line, a little in from the top edge
  const inlayParts = [
    ...[-1, 1].map((s) => block(THREE, PL - 1.2, 0.05, 0.12, 0, 0.005, s * (PW / 2 - 0.6))),
    ...[-1, 1].map((s) => block(THREE, 0.12, 0.05, PW - 1.2, s * (PL / 2 - 0.6), 0.005, 0)),
  ];
  const inlay = new THREE.Mesh(
    merge(inlayParts)!,
    new THREE.MeshStandardMaterial({ color: 0xd2ad5a, metalness: 1, roughness: 0.28, envMapIntensity: 1.3 }),
  );
  inlayParts.forEach((g) => g.dispose());

  // under it: a shadow, and a cool light spilling out round its foot so it stands off the night
  const floor = (scale: [number, number], color: number, opacity: number, additive: boolean) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(PL * scale[0], PW * scale[1]),
      new THREE.MeshBasicMaterial({
        color,
        alphaMap: shadowTexture(THREE),
        transparent: true,
        opacity,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = -ph - 0.02;
    m.renderOrder = -1;
    return m;
  };
  group.add(floor([1.5, 1.7], 0x000000, 0.55, false), floor([1.35, 1.5], 0x4a66d8, 0.32, true), plinth, inlay);
  return group;
}
