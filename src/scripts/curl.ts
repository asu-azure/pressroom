/**
 * Page curl for the reader's flip mode (FlipSurface.svelte).
 *
 * A turn is drawn with overlays over the real page rects, never by moving the
 * pages themselves (the .si sizing is load-bearing on iOS — see CLAUDE.md):
 *
 *   base    the track, already showing the TARGET sheet underneath
 *   static  on a spread, the current page that is not turning, still on top of
 *           the target's page there until the leaf lands on it
 *   front   the turning page, clipped to the part not yet folded over
 *   back    the folded part, reflected across the fold line: the target's
 *           facing page when it lands on a spread, else the paper's reverse
 *
 * Geometry is the classic corner fold: the grabbed corner C is dragged to P,
 * the fold line is the perpendicular bisector of CP, and the region nearer C
 * than P is what has folded over. P is kept where paper can actually reach
 * (within a leaf-width of the spine on its row, a diagonal of the far corner).
 * Everything is transform + clip-path; one rAF loop only while a turn runs.
 */

export type Pt = { x: number; y: number };
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// --- pure geometry (curl.test.ts) --------------------------------------------

/** Keep the part of a convex polygon where (p - m)·n <= 0 (Sutherland–Hodgman). */
export function clipHalfPlane(poly: Pt[], m: Pt, n: Pt): Pt[] {
  const side = (p: Pt) => (p.x - m.x) * n.x + (p.y - m.y) * n.y;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** CSS matrix() reflecting across the line through m with unit normal n. */
export function reflectMatrix(m: Pt, n: Pt): [number, number, number, number, number, number] {
  const a = 1 - 2 * n.x * n.x;
  const d = 1 - 2 * n.y * n.y;
  const b = -2 * n.x * n.y;
  const k = 2 * (m.x * n.x + m.y * n.y);
  return [a, b, b, d, k * n.x, k * n.y];
}

/** Keep the dragged point where a sheet pinned at the spine could reach. */
export function reachable(p: Pt, spineNear: Pt, spineFar: Pt, w: number, h: number): Pt {
  let q = { ...p };
  const lim = (c: Pt, r: number) => {
    const dx = q.x - c.x;
    const dy = q.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d > r) q = { x: c.x + (dx / d) * r, y: c.y + (dy / d) * r };
  };
  lim(spineNear, w);
  lim(spineFar, Math.hypot(w, h));
  return q;
}

export interface Fold {
  /** leaf-local polygon still lying flat (front) */
  front: Pt[];
  /** leaf-local polygon that has folded over (drawn reflected) */
  folded: Pt[];
  matrix: [number, number, number, number, number, number];
  /** unit normal of the fold, pointing from the corner toward the finger */
  n: Pt;
  /** 0 = flat, 1 = landed on the other side */
  progress: number;
}

/**
 * The fold for a leaf of size w × h (local coords) whose free edge is at
 * x = freeX (0 or w), grabbed at corner (freeX, cornerY) and dragged to p.
 */
export function fold(w: number, h: number, freeX: number, cornerY: number, p: Pt): Fold {
  const spineX = freeX === 0 ? w : 0;
  const c = { x: freeX, y: cornerY };
  const q = reachable(p, { x: spineX, y: cornerY }, { x: spineX, y: h - cornerY }, w, h);
  const dx = q.x - c.x;
  const dy = q.y - c.y;
  const len = Math.hypot(dx, dy);
  const rect = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  if (len < 0.5) return { front: rect, folded: [], matrix: [1, 0, 0, 1, 0, 0], n: { x: 0, y: 0 }, progress: 0 };
  const n = { x: dx / len, y: dy / len };
  const m = { x: (c.x + q.x) / 2, y: (c.y + q.y) / 2 };
  // front keeps the side nearer the finger; folded is the side nearer the corner
  const front = clipHalfPlane(rect, m, { x: -n.x, y: -n.y });
  const folded = clipHalfPlane(rect, m, n);
  return { front, folded, matrix: reflectMatrix(m, n), n, progress: Math.min(1, Math.abs(dx) / (2 * w)) };
}

const poly = (pts: Pt[]) => (pts.length < 3 ? 'polygon(0 0,0 0,0 0)' : `polygon(${pts.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(',')})`);

// --- the overlay -------------------------------------------------------------

export interface CurlSetup {
  host: HTMLElement; // positioned ancestor the overlays live in (the stage)
  leaf: Rect; // turning page, host coords
  /** each picture is one CSS background layer for its box (lib/coverCrop.ts
      pictureLayer: the whole page contained, or the cover's front) */
  leafPic: string;
  turningRight: boolean; // the free edge is on the right
  cornerTop: boolean;
  staticRect?: Rect; // current non-turning page (spreads)
  staticPic?: string;
  backPic?: string; // target's page that the leaf lands on (spreads)
  /**
   * "Ink": a clone of a page's typeset translation layer (TypesetLayer), boxed
   * in % of its page. The pictures above are only backgrounds, so without these
   * the turning leaf would show the untranslated page for the whole turn.
   */
  leafInk?: HTMLElement;
  staticInk?: HTMLElement;
  backInk?: HTMLElement;
}

export class Curl {
  private root: HTMLElement;
  private front: HTMLElement;
  private backWrap: HTMLElement;
  private back: HTMLElement;
  private shade: HTMLElement;
  private s: CurlSetup;
  private freeX: number;
  private cornerY: number;
  p: Pt;

  constructor(s: CurlSetup) {
    this.s = s;
    const { leaf } = s;
    this.freeX = s.turningRight ? leaf.w : 0;
    this.cornerY = s.cornerTop ? 0 : leaf.h;
    this.p = { x: this.freeX, y: this.cornerY };

    const el = (cls: string, css = '') => {
      const d = document.createElement('div');
      d.className = cls;
      d.style.cssText = css;
      return d;
    };
    const box = (r: Rect) => `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;`;
    const img = (pic: string) => `background:${pic},#f1ece2;`;

    this.root = el('curl', 'position:absolute;inset:0;pointer-events:none;z-index:4;');
    if (s.staticRect && s.staticPic) {
      const still = el('curl__static', `position:absolute;${box(s.staticRect)}${img(s.staticPic)}`);
      if (s.staticInk) still.append(s.staticInk);
      this.root.append(still);
    }
    this.front = el('curl__front', `position:absolute;${box(leaf)}${img(s.leafPic)}`);
    this.shade = el('curl__shade', 'position:absolute;inset:0;');
    if (s.leafInk) this.front.append(s.leafInk);
    this.front.append(this.shade);
    // the wrapper carries the drop shadow, so it follows the clipped shape
    this.backWrap = el(
      'curl__backWrap',
      `position:absolute;${box(leaf)}filter:drop-shadow(0 0 14px rgba(0,0,0,.45));`,
    );
    const backFace = s.backPic
      ? // pre-mirrored: the reflection turns it the right way round on landing
        `background:${s.backPic},#f1ece2;`
      : // a single page's reverse: paper, with the print faintly showing through
        `background:linear-gradient(rgba(241,236,226,.88),rgba(241,236,226,.88)),${s.leafPic},#f1ece2;`;
    this.back = el('curl__back', `position:absolute;inset:0;transform-origin:0 0;`);
    // The reflection mirrors whatever is on the back. Show-through should look
    // mirrored, so it is left alone; the facing page is pre-mirrored so it reads
    // the right way round once it has landed.
    const face = el('curl__face', `position:absolute;inset:0;${backFace}${s.backPic ? 'transform:scaleX(-1);' : ''}`);
    // inside the face, so it is mirrored with it and reads right once landed
    if (s.backPic && s.backInk) face.append(s.backInk);
    const gloss = el('curl__gloss', 'position:absolute;inset:0;');
    this.back.append(face, gloss);
    this.backWrap.append(this.back);
    this.root.append(this.front, this.backWrap);
    s.host.append(this.root);
    this.render();
  }

  /** Drag point, in host coordinates. */
  set(pHost: Pt) {
    this.p = { x: pHost.x - this.s.leaf.x, y: pHost.y - this.s.leaf.y };
    this.render();
  }
  /** Where the corner starts and where it lands, host coordinates. */
  get corner(): Pt {
    return { x: this.s.leaf.x + this.freeX, y: this.s.leaf.y + this.cornerY };
  }
  get landing(): Pt {
    const { leaf } = this.s;
    const spine = this.freeX === 0 ? leaf.w : 0;
    return { x: leaf.x + 2 * spine - this.freeX, y: leaf.y + this.cornerY };
  }
  get progress(): number {
    return fold(this.s.leaf.w, this.s.leaf.h, this.freeX, this.cornerY, this.p).progress;
  }

  private render() {
    const { w, h } = this.s.leaf;
    const f = fold(w, h, this.freeX, this.cornerY, this.p);
    this.front.style.clipPath = poly(f.front);
    const back = this.back.style;
    back.clipPath = poly(f.folded);
    back.transform = `matrix(${f.matrix.map((v) => v.toFixed(5)).join(',')})`;
    // shading: the flat part darkens toward the fold (away from the finger), the
    // folded part catches a sheen
    const ang = Math.atan2(f.n.x, -f.n.y) * (180 / Math.PI);
    const k = Math.sin(Math.PI * Math.min(1, f.progress * 1.2));
    this.shade.style.background = `linear-gradient(${ang + 180}deg, transparent 55%, rgba(0,0,0,${(0.28 * k).toFixed(3)}))`;
    (this.back.lastElementChild as HTMLElement).style.background = `linear-gradient(${ang + 180}deg, rgba(255,255,255,${(0.35 * k).toFixed(3)}), rgba(0,0,0,${(0.12 * k).toFixed(3)}) 60%, transparent)`;
    // a single page leaving the book fades as it goes past the spine
    if (!this.s.backPic) this.backWrap.style.opacity = String(1 - Math.max(0, f.progress - 0.75) * 4);
  }

  private rushed = false;
  /** Land the running turn on its next frame — another turn was asked for. */
  hurry() {
    this.rushed = true;
  }

  /** Animate the corner to `to` (host coords) and resolve when there. */
  run(to: Pt, ms: number, lift = 0): Promise<void> {
    const from = { x: this.s.leaf.x + this.p.x, y: this.s.leaf.y + this.p.y };
    const t0 = performance.now();
    return new Promise((resolve) => {
      const step = (now: number) => {
        const t = this.rushed ? 1 : Math.min(1, (now - t0) / ms);
        const e = 1 - Math.pow(1 - t, 3);
        const up = lift * Math.sin(Math.PI * e);
        this.set({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - up });
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  destroy() {
    this.root.remove();
  }
}

const boxOf = (r: Rect) => `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;`;

/**
 * The leaf's box (before its rotation) that, turned 180° about the hinge, lies
 * exactly on `target` — the hinge stays where it is.
 */
export function mirrored(target: Rect, s: { leaf: Rect; hingeLeft: boolean }): Rect {
  const hingeX = s.hingeLeft ? s.leaf.x : s.leaf.x + s.leaf.w;
  return { x: s.hingeLeft ? hingeX : hingeX - target.w, y: target.y, w: target.w, h: target.h };
}

// --- the door turn: the closed cover opening ----------------------------------
//
// A board turning on its spine edge — the same motion as a shelf book's cover —
// under perspective: the front darkens as it turns, a shadow falls on the page
// below. FlipSurface uses it for the book's closed cover opening onto (and
// closing over) the first spread, with `land`. It once turned every single page
// too (past 100° the leaf faded out, gone by DOOR_MAX); single pages slide now —
// the owner found the door odd on a phone — but the plain door is kept, tested.

export const DOOR_MAX = 160;

/** A book's cover lands flat on the far side of the spine. */
export const COVER_MAX = 180;

/** Angle for a drag: `travel` px in the turning direction across a page `w` wide. */
export function doorAngle(travel: number, w: number, max = DOOR_MAX): number {
  return Math.max(0, Math.min(1, travel / Math.max(1, w))) * max;
}

/** Whether a released door completes: past 35° (or 35° short of the far side coming back), or flung. */
export function doorCommit(angle: number, forward: boolean, fling: boolean, max = DOOR_MAX): boolean {
  return fling || (forward ? angle > 35 : angle < max - 35);
}

/**
 * Which of the pages under a turning cover it lands on: the one across the
 * spine from it, touching the hinge (RTL: the right page; LTR: the left).
 */
export function landingPage(hingeX: number, hingeLeft: boolean, pages: readonly Rect[]): number {
  let best = -1;
  let gap = Infinity;
  pages.forEach((r, i) => {
    const d = hingeLeft ? Math.abs(r.x + r.w - hingeX) : Math.abs(r.x - hingeX);
    const across = hingeLeft ? r.x + r.w / 2 < hingeX : r.x + r.w / 2 > hingeX;
    if (across && d < gap) {
      gap = d;
      best = i;
    }
  });
  return best;
}

export interface DoorSetup {
  host: HTMLElement;
  leaf: Rect;
  /** the page as one CSS background layer (lib/coverCrop.ts pictureLayer) */
  pic: string;
  /** the spine is the page's left edge (LTR) */
  hingeLeft: boolean;
  /** true: the current page swings away; false: the previous page swings back in */
  forward: boolean;
  /**
   * A book's cover opening onto (or closing over) the first spread: the leaf is
   * one sheet with the facing page on its back, so it turns the full 180° and
   * lands exactly on that page instead of fading out. `floor` paints the spot
   * it lands on until it lies there (a closed book has nothing on that side).
   */
  land?: { rect: Rect; pic: string; floor: string; ink?: HTMLElement };
  /** the page's typeset translation, cloned (see CurlSetup.leafInk) */
  ink?: HTMLElement;
}

export class Door {
  private root: HTMLElement;
  private leaf: HTMLElement;
  private shade: HTMLElement;
  private shadow: HTMLElement;
  private backShade: HTMLElement | null = null;
  private s: DoorSetup;
  private landed = false; // the leaf is past 90°, wearing the landing page's box
  angle: number;
  /** how far this door turns: a cover lands flat (180°), a page fades out (DOOR_MAX) */
  readonly max: number;

  constructor(s: DoorSetup) {
    this.s = s;
    this.max = s.land ? COVER_MAX : DOOR_MAX;
    this.angle = s.forward ? 0 : this.max;
    const { leaf: r } = s;
    const el = (css: string) => {
      const d = document.createElement('div');
      d.style.cssText = css;
      return d;
    };
    const box = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;`;
    const origin = s.hingeLeft ? 0 : 100;
    this.root = el(
      `position:absolute;inset:0;pointer-events:none;z-index:4;perspective:${Math.round(r.w * 4.5)}px;` +
        `perspective-origin:${r.x + r.w * (origin / 100)}px ${r.y + r.h / 2}px;`,
    );
    this.shadow = el(`position:absolute;${box}opacity:0;`);
    // where the cover will land: empty table until it lies there
    const floor = s.land ? el(`position:absolute;${boxOf(s.land.rect)}background:${s.land.floor};`) : null;
    this.leaf = el(`position:absolute;${box}transform-style:preserve-3d;transform-origin:${origin}% 50%;`);
    const img = s.pic;
    const front = el(`position:absolute;inset:0;backface-visibility:hidden;background:${img},#f1ece2;`);
    this.shade = el('position:absolute;inset:0;opacity:0;');
    if (s.ink) front.append(s.ink);
    front.append(this.shade);
    // the reverse: the facing page for a cover (it reads the right way round
    // once the leaf has turned 180°), else paper with the print showing through
    const back = el('position:absolute;inset:0;backface-visibility:hidden;transform:rotateY(180deg);background:#f1ece2;');
    if (s.land) {
      back.style.background = `${s.land.pic},#f1ece2`;
      if (s.land.ink) back.append(s.land.ink); // boxed in %, so it follows the 90° box swap
      this.backShade = el('position:absolute;inset:0;opacity:0;');
      back.append(this.backShade);
    } else {
      back.append(el(`position:absolute;inset:0;background:${img};opacity:.13;transform:scaleX(-1);`));
    }
    this.leaf.append(front, back);
    if (floor) this.root.append(floor);
    this.root.append(this.shadow, this.leaf);
    s.host.append(this.root);
    this.render();
  }

  set(angle: number) {
    this.angle = Math.max(0, Math.min(this.max, angle));
    this.render();
  }

  private render() {
    const a = this.angle;
    const sign = this.s.hingeLeft ? -1 : 1;
    this.leaf.style.transform = `rotateY(${(a * sign).toFixed(2)}deg)`;
    const land = this.s.land;
    if (land) {
      // Edge-on at 90° nothing of the leaf shows, so that is where it trades the
      // cover's size for the landing page's — it lands on that page exactly.
      const past = a > 90;
      if (past !== this.landed) {
        this.landed = past;
        const r = past ? mirrored(land.rect, this.s) : this.s.leaf;
        Object.assign(this.leaf.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      }
      if (this.backShade) {
        this.backShade.style.opacity = String(Math.sin((Math.max(a, 90) * Math.PI) / 180) * 0.9);
        this.backShade.style.background = `linear-gradient(${this.s.hingeLeft ? 270 : 90}deg, rgba(0,0,0,.08), rgba(0,0,0,.42))`;
      }
    }
    this.leaf.style.opacity = String(!land && a > 100 ? Math.max(0, 1 - (a - 100) / (DOOR_MAX - 100)) : 1);
    const k = Math.sin((Math.min(a, 90) * Math.PI) / 180);
    this.shade.style.opacity = String(k);
    this.shade.style.background = `linear-gradient(${this.s.hingeLeft ? 90 : 270}deg, rgba(0,0,0,.08), rgba(0,0,0,.42))`;
    // the shadow the lifted leaf throws on the page below, strongest near the spine
    this.shadow.style.opacity = String(Math.sin((a * Math.PI) / 180) * (!land && a > 100 ? 1 - (a - 100) / (DOOR_MAX - 100) : 1));
    this.shadow.style.background = `linear-gradient(${this.s.hingeLeft ? 90 : 270}deg, rgba(0,0,0,.45), rgba(0,0,0,.12) 35%, transparent 70%)`;
  }

  private rushed = false;
  /** Land the running turn on its next frame — another turn was asked for. */
  hurry() {
    this.rushed = true;
  }

  run(to: number, ms: number): Promise<void> {
    const from = this.angle;
    const t0 = performance.now();
    return new Promise((resolve) => {
      const step = (now: number) => {
        const t = this.rushed ? 1 : Math.min(1, (now - t0) / ms);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease in-out
        this.set(from + (to - from) * e);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  destroy() {
    this.root.remove();
  }
}
