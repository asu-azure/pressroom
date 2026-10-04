<script lang="ts">
  import { gsap } from 'gsap';
  import type { Sheet, Direction, FitMode, Character, Layout } from '../../lib/types';
  import SheetImage from './SheetImage.svelte';
  import { Curl, Door, doorAngle, doorCommit, landingPage } from '../../scripts/curl';
  import { parseCropAttr, pictureLayer } from '../../lib/coverCrop';
  import { turnStyle, zoomStep } from '../../lib/readerUi';

  let {
    sheets,
    direction,
    fit,
    cur,
    layout = 'double',
    pageNumberOf,
    onNavigate,
    onMenu,
    onZoom,
    translateOn = false,
    typesetOn = false,
    curl = true,
    characters = [],
    highlightId = null,
    onHighlight,
  }: {
    sheets: Sheet[];
    direction: Direction;
    fit: FitMode;
    cur: number;
    /** single: every turn slides; double: spreads curl, the closed cover opens */
    layout?: Layout;
    pageNumberOf: (pageId: string) => number;
    onNavigate: (index: number) => void;
    /** A tap in the middle third: the menu, not a page turn (Reader → ReaderChrome.toggleMenu). */
    onMenu?: () => void;
    /** The zoom, as a share of the fitted page — for the bar's − 100% ＋ (Reader). */
    onZoom?: (scale: number) => void;
    translateOn?: boolean;
    typesetOn?: boolean;
    curl?: boolean;
    characters?: Character[];
    highlightId?: string | null;
    onHighlight?: (id: string | null) => void;
  } = $props();

  // Direction sign: sheet i sits at x = i · width · s, so in RTL the story
  // runs to the left and "next" slides the track rightward.
  const s = $derived(direction === 'rtl' ? -1 : 1);

  let stage: HTMLElement;
  let track: HTMLElement;
  let width = $state(0);

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Only sheets near the current one are mounted — hundreds of pages stay cheap. */
  // A solo cover before the spreads is the book CLOSED: it sits on its half of
  // the spread, its spine on the spine (RTL left of it, LTR right), the size of
  // one page — not centred and full size, which made the first turn jump.
  const closedCover = $derived(sheets[0]?.kind === 'single' && sheets[1]?.kind === 'spread');
  const mounted = $derived(
    sheets
      .map((sheet, index) => ({ sheet, index }))
      .filter(({ index }) => Math.abs(index - cur) <= 2),
  );

  const targetX = $derived(-cur * width * s);

  // Slide to the current sheet when it changes by one; anything else is put in
  // place at once — the first placement, a resize, a jump (grid, chapter, Home).
  // The first placement used to slide from sheet 0, across every sheet between,
  // none of them mounted: a deep link to p.18 crossed 17 screens of empty floor,
  // and a touch during that slide froze it there (below) — a black page.
  let placed = -1;
  let placedW = 0;
  $effect(() => {
    if (!track || !width) return;
    const x = targetX;
    const far = placed < 0 || width !== placedW || Math.abs(cur - placed) > 1;
    placed = cur;
    placedW = width;
    if (far || reduced) {
      gsap.killTweensOf(track);
      gsap.set(track, { x });
      return;
    }
    gsap.to(track, { x, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
  });

  /**
   * Put the track back on the current sheet if something left it between two —
   * a gesture that ended without a turn must never leave the reader on the floor.
   */
  function settleTrack() {
    if (!track || !width || curlFx || doorFx || gsap.isTweening(track)) return;
    const x = Number(gsap.getProperty(track, 'x'));
    if (Math.abs(x - targetX) > 0.5) gsap.to(track, { x: targetX, duration: reduced ? 0 : 0.3, ease: 'power3.out' });
  }

  // --- Gestures: full touch control so nothing fights the transform ---
  // The CURRENT sheet is positioned by translate(tx,ty) scale(scale). At 1x this
  // also scrolls a too-tall page vertically; >1x it pans freely. touch-action is
  // `none` (see CSS) so the browser never scrolls/zooms underneath us — that was
  // what made pinch jump. Page turns use horizontal swipe or the ‹ / › buttons.
  const MAX_SCALE = 4;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  let pinching = $state(false);

  // Nav buttons: physical-left/right deltas & disabled state depend on direction.
  const leftDelta = $derived(direction === 'ltr' ? -1 : 1);
  const rightDelta = $derived(direction === 'ltr' ? 1 : -1);
  const atStart = $derived(cur <= 0);
  const atEnd = $derived(cur >= sheets.length - 1);
  const leftDisabled = $derived(leftDelta < 0 ? atStart : atEnd);
  const rightDisabled = $derived(rightDelta < 0 ? atStart : atEnd);

  // Per-sheet .fs__pages elements so we can measure the current one for bounds.
  let pagesEls: Record<number, HTMLElement | undefined> = {};

  // Every active pointer, keyed by id, so multi-touch never reads as a drag.
  const pointers = new Map<number, { x: number; y: number }>();

  // Single-finger gesture: 'pending' until the axis is known, then turn/pan/pany
  // (or 'curl' when the turn is drawn as a paper fold).
  type Gesture = 'none' | 'pending' | 'turn' | 'curl' | 'pan' | 'pany';
  let gesture: Gesture = 'none';
  let startX = 0;
  let startY = 0;
  let startT = 0;
  let baseTrackX = 0; // track x when a turn drag began
  let dragX0 = 0; // the pointer's x at that moment
  // a press that began while a turn was still being drawn: a tap only (queued)
  let busyPress = false;
  // a turn asked for while another was drawn: its direction, run when that one lands
  let queued: number | null = null;
  let baseTx = 0;
  let baseTy = 0;

  // Pinch baselines (snapshot when the 2nd finger lands).
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let pinchBaseTx = 0;
  let pinchBaseTy = 0;
  let pinchStartMid = { x: 0, y: 0 };

  // GSAP proxy so settle/zoom tweens flow back into the reactive state.
  const zoomProxy = { scale: 1, tx: 0, ty: 0 };

  function bounds(): [number, number] {
    const far = -(sheets.length - 1) * width * s;
    return far < 0 ? [far, 0] : [0, far];
  }
  function stageHeight(): number {
    return stage?.clientHeight ?? 0;
  }
  // Layout size of the current page block (transform-independent).
  function contentSize(): { w: number; h: number } {
    const el = pagesEls[cur];
    return { w: el?.offsetWidth || width, h: el?.offsetHeight || stageHeight() };
  }
  // Half the overflow past the viewport on each axis at a given scale — this is
  // both the zoom-pan range and (at scale 1) the tall-page scroll range.
  function panRange(sc: number): { x: number; y: number } {
    const { w, h } = contentSize();
    return {
      x: Math.max(0, (w * sc - width) / 2),
      y: Math.max(0, (h * sc - stageHeight()) / 2),
    };
  }
  function clampPan() {
    const r = panRange(scale);
    tx = clamp(tx, -r.x, r.x);
    ty = clamp(ty, -r.y, r.y);
  }
  function twoPointers(): { x: number; y: number }[] {
    return [...pointers.values()].slice(0, 2);
  }
  function distMid(): { dist: number; mid: { x: number; y: number } } {
    const [a, b] = twoPointers();
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }
  // Anchor a scale change on a screen point so that point stays put (origin center).
  function anchoredTranslate(newScale: number, m: { x: number; y: number }) {
    const cx = width / 2;
    const cy = stageHeight() / 2;
    const ux = (m.x - cx - tx) / scale;
    const uy = (m.y - cy - ty) / scale;
    const r = panRange(newScale);
    return {
      tx: clamp(m.x - cx - newScale * ux, -r.x, r.x),
      ty: clamp(m.y - cy - newScale * uy, -r.y, r.y),
    };
  }
  // where a running zoom animation is headed: a second ＋ during it steps on from there
  let zoomGoal = 1;
  function animateZoom(ns: number, nx: number, ny: number) {
    zoomGoal = ns;
    zoomProxy.scale = scale;
    zoomProxy.tx = tx;
    zoomProxy.ty = ty;
    gsap.to(zoomProxy, {
      scale: ns,
      tx: nx,
      ty: ny,
      duration: reduced ? 0 : 0.3,
      ease: 'power3.out',
      overwrite: 'auto',
      onUpdate: () => {
        scale = zoomProxy.scale;
        tx = zoomProxy.tx;
        ty = zoomProxy.ty;
      },
    });
  }
  function settleZoom() {
    pinching = false;
    const target = scale <= 1.02 ? 1 : scale;
    const r = panRange(target);
    // Snapping to 1x recentres horizontally but keeps vertical scroll position.
    animateZoom(target, clamp(tx, -r.x, r.x), clamp(ty, -r.y, r.y));
    settleTrack(); // a pinch stopped any slide that was running
  }

  // --- The bar's zoom (− 100% ＋, keys + − 0): the same zoom as pinch and
  //     ctrl/⌘+wheel, anchored on the middle of the screen. ---
  function zoomTo(ns: number) {
    if (curlFx || doorFx) return;
    ns = clamp(ns, 1, MAX_SCALE);
    const { tx: nx, ty: ny } = anchoredTranslate(ns, { x: width / 2, y: stageHeight() / 2 });
    animateZoom(ns, ns <= 1.001 ? 0 : nx, ny);
  }
  export function zoomBy(dir: 1 | -1) {
    zoomTo(zoomStep(gsap.isTweening(zoomProxy) ? zoomGoal : scale, dir));
  }
  export function zoomFit() {
    zoomTo(1);
  }
  $effect(() => {
    onZoom?.(Math.round(scale * 100) / 100);
  });
  // Position a too-tall page at its top (origin is centre, so +range shows top).
  function showTop() {
    tx = 0;
    ty = panRange(1).y;
  }

  // --- Page curl (scripts/curl.ts) --------------------------------------------
  // A one-sheet turn at 1x in double layout is drawn over the real page rects
  // with overlays: a paper fold when the current sheet is a spread, and the
  // closed cover opening (or closing) like a board over the first spread. The
  // track jumps to the target underneath. One page on screen — single layout,
  // or a lone page — slides in reading direction instead (the door swing that
  // used to turn it looked odd on a phone), as does anything else: jumps, zoom,
  // reduced motion (which jumps), the setting off, images not loaded yet.
  let curlFx: Curl | null = null;
  let doorFx: Door | null = null;
  let doorForward = true;
  let doorW = 1;
  let curlTarget = -1;
  let curlBusy = false;

  /** A clone of the page's typeset translation, boxed in % of the overlay box `r`. */
  function inkOf(el: HTMLElement, r: DOMRect): HTMLElement | undefined {
    const ts = el.querySelector<HTMLElement>('.si__bubbles--ts > .ts');
    if (!ts || !r.width || !r.height) return undefined;
    const t = ts.getBoundingClientRect();
    const ink = ts.cloneNode(true) as HTMLElement;
    ink.setAttribute('aria-hidden', 'true');
    ink.style.cssText =
      `position:absolute;inset:auto;transform:none;` +
      `left:${((t.left - r.left) / r.width) * 100}%;top:${((t.top - r.top) / r.height) * 100}%;` +
      `width:${(t.width / r.width) * 100}%;height:${(t.height / r.height) * 100}%;`;
    return ink;
  }

  function pageEls(index: number) {
    const host = pagesEls[index];
    if (!host) return [];
    return [...host.querySelectorAll<HTMLElement>('.si')]
      .map((el) => {
        // the sharp picture once it has loaded — the first <img> is the blurred thumb
        const full = el.querySelector<HTMLImageElement>('img.si__img');
        const img = full?.complete && full.naturalWidth ? full : el.querySelector<HTMLImageElement>('img.si__thumb');
        const src = img?.complete && img.naturalWidth ? img.currentSrc || img.src : '';
        const crop = parseCropAttr(el.dataset.crop);
        let r = el.getBoundingClientRect();
        if (crop) {
          // a cropped page (the cover's front) draws inside the contain rect of
          // its own shape — the overlay takes exactly that box
          const ar = Number(el.style.getPropertyValue('--pw')) / Number(el.style.getPropertyValue('--ph')) || 1;
          const w = Math.min(r.width, r.height * ar);
          const h = Math.min(r.height, r.width / ar);
          r = new DOMRect(r.left + (r.width - w) / 2, r.top + (r.height - h) / 2, w, h);
        }
        return { r, pic: src ? pictureLayer(src, crop) : '', ink: inkOf(el, r) };
      })
      .sort((a, b) => a.r.left - b.r.left);
  }

  function beginCurl(target: number, from: { x: number; y: number } | null): boolean {
    if (scale !== 1 || curlBusy || curlFx || doorFx) return false;
    if (target < 0 || target >= sheets.length || Math.abs(target - cur) !== 1) return false;
    // One page on screen slides (lib/readerUi.ts turnStyle); spreads curl, and
    // the closed cover opens over the first spread — one sheet with the facing
    // page on its back, turning 180° to land on that page.
    const coverTurn = closedCover && Math.min(cur, target) === 0;
    const style = turnStyle({ layout, curl, reduced, pages: sheets[cur]?.pages.length ?? 1, coverTurn });
    if (style === 'slide') return false;
    const forward = target > cur;
    const turningRight = forward !== (direction === 'rtl');
    const now = pageEls(cur);
    if (!now.length) return false;
    const h0 = stage.getBoundingClientRect();
    const rel0 = (r: DOMRect, dx = 0) => ({ x: r.left - h0.left + dx, y: r.top - h0.top, w: r.width, h: r.height });
    const landOn = (leaf: { x: number; w: number }, hingeLeft: boolean, spread: { r: DOMRect; pic: string; ink?: HTMLElement }[], dx = 0) => {
      if (!coverTurn) return undefined;
      const rects = spread.map((p) => rel0(p.r, dx));
      const i = landingPage(hingeLeft ? leaf.x : leaf.x + leaf.w, hingeLeft, rects);
      return i < 0 || !spread[i].pic
        ? undefined
        : { rect: rects[i], pic: spread[i].pic, floor: floorColour(), ink: spread[i].ink };
    };
    if (style === 'door') {
      const hingeLeft = direction === 'ltr';
      if (forward) {
        if (!now[0].pic) return false;
        gsap.killTweensOf(track);
        gsap.set(track, { x: -target * width * s });
        const leaf = rel0(now[0].r);
        const land = landOn(leaf, hingeLeft, pageEls(target));
        if (coverTurn && !land) return false;
        doorFx = new Door({ host: stage, leaf, pic: now[0].pic, ink: now[0].ink, hingeLeft, forward: true, land });
        doorW = now[0].r.width;
      } else {
        const prev = pageEls(target);
        if (prev.length !== 1 || !prev[0].pic) return false;
        // the previous sheet sits one screen over on the track: bring its rect on-screen
        const shift = -(target - cur) * width * s;
        const leaf = rel0(prev[0].r, shift);
        const land = landOn(leaf, hingeLeft, now);
        if (coverTurn && !land) return false;
        doorFx = new Door({ host: stage, leaf, pic: prev[0].pic, ink: prev[0].ink, hingeLeft, forward: false, land });
        doorW = prev[0].r.width;
      }
      doorForward = forward;
      curlTarget = target;
      return true;
    }
    const leaf = turningRight ? now[now.length - 1] : now[0];
    const still = now.length > 1 ? (turningRight ? now[0] : now[now.length - 1]) : null;
    if (!leaf.pic) return false;

    gsap.killTweensOf(track);
    gsap.set(track, { x: -target * width * s });
    const next = pageEls(target);
    // The leaf only lands on a facing page when both sheets are spreads; from
    // the cover into the first spread (different sizes) it leaves the book as paper.
    const back = still && next.length > 1 ? (turningRight ? next[0] : next[next.length - 1]) : null;

    const h = stage.getBoundingClientRect();
    const rel = (r: DOMRect) => ({ x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height });
    curlFx = new Curl({
      host: stage,
      leaf: rel(leaf.r),
      leafPic: leaf.pic,
      turningRight,
      cornerTop: from ? from.y < leaf.r.top + leaf.r.height / 2 : false,
      staticRect: still ? rel(still.r) : undefined,
      staticPic: still?.pic || undefined,
      backPic: back?.pic || undefined,
      leafInk: leaf.ink,
      staticInk: still?.ink,
      backInk: back?.ink,
    });
    curlTarget = target;
    return true;
  }

  // what shows where a closed book has no page: the reader's own background
  function floorColour(): string {
    for (let el: HTMLElement | null = stage; el; el = el.parentElement) {
      const c = getComputedStyle(el).backgroundColor;
      if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) return c;
    }
    return '#0c0c0d';
  }

  async function endDoor(commit: boolean, ms: number) {
    const fx = doorFx;
    if (!fx) return;
    curlBusy = true;
    const done = doorForward ? fx.max : 0;
    const undone = doorForward ? 0 : fx.max;
    await fx.run(commit ? done : undone, ms);
    if (commit) {
      if (!doorForward) gsap.set(track, { x: -curlTarget * width * s });
      onNavigate(curlTarget);
    } else if (doorForward) gsap.set(track, { x: targetX });
    requestAnimationFrame(() => {
      fx.destroy();
      if (doorFx === fx) doorFx = null;
      curlBusy = false;
      drain();
    });
  }

  /** A turn asked for while one was drawn: finish that one now, then take this one. */
  function hurry() {
    curlFx?.hurry();
    doorFx?.hurry();
  }
  function drain() {
    if (queued === null) return;
    const d = queued;
    queued = null;
    go(cur + d);
  }

  async function endCurl(commit: boolean, ms: number, lift = 0) {
    const fx = curlFx;
    if (!fx) return;
    curlBusy = true;
    await fx.run(commit ? fx.landing : fx.corner, ms, lift);
    if (commit) onNavigate(curlTarget);
    else gsap.set(track, { x: targetX });
    // one frame later, so the real pages are painted before the overlay goes
    requestAnimationFrame(() => {
      fx.destroy();
      if (curlFx === fx) curlFx = null;
      curlBusy = false;
      drain();
    });
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Nav buttons (and a failed page's 再読み込み) own their own taps.
    if ((e.target as HTMLElement).closest('[data-nav]')) return;
    // A turn still being drawn: finish it now; this press can only be a tap,
    // and the turn it asks for runs next (quick taps used to be dropped).
    if (curlBusy) {
      hurry();
      busyPress = true;
      gesture = 'pending';
      startX = e.clientX;
      startY = e.clientY;
      startT = performance.now();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    busyPress = false;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Second finger → pinch. Snapshot baselines; never turns the page.
    if (pointers.size >= 2) {
      gesture = 'none';
      pinching = true;
      gsap.killTweensOf(zoomProxy);
      gsap.killTweensOf(track);
      stage.setPointerCapture(e.pointerId);
      const { dist, mid } = distMid();
      pinchStartDist = dist || 1;
      pinchStartScale = scale;
      pinchBaseTx = tx;
      pinchBaseTy = ty;
      pinchStartMid = mid;
      return;
    }

    // Translation hotspot owns its tap (tooltip) instead of paging — 1x only.
    if (scale === 1 && (e.target as HTMLElement).closest('[data-bub]')) return;

    stage.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
    startT = performance.now();
    if (scale > 1) {
      gesture = 'pan';
      baseTx = tx;
      baseTy = ty;
    } else {
      // At 1x wait to see the axis: horizontal = turn, vertical = scroll tall page.
      // The slide in progress is NOT stopped here: a press that turns out to be
      // a tap for the menu, a long press or a vertical swipe used to freeze the
      // track between two sheets — on the empty floor, a black page.
      gesture = 'pending';
      baseTy = ty;
    }
  }

  function onPointerMove(e: PointerEvent) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;

    if (pointers.size >= 2) {
      const { dist, mid } = distMid();
      const ns = clamp(pinchStartScale * (dist / pinchStartDist), 1, MAX_SCALE);
      const cx = width / 2;
      const cy = stageHeight() / 2;
      // Content point under the initial midpoint, kept under it as fingers move.
      const u0x = (pinchStartMid.x - cx - pinchBaseTx) / pinchStartScale;
      const u0y = (pinchStartMid.y - cy - pinchBaseTy) / pinchStartScale;
      scale = ns;
      tx = mid.x - cx - ns * u0x;
      ty = mid.y - cy - ns * u0y;
      clampPan();
      return;
    }

    if (gesture === 'pan') {
      tx = baseTx + (e.clientX - startX);
      ty = baseTy + (e.clientY - startY);
      clampPan();
      return;
    }

    if (gesture === 'pending') {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.hypot(dx, dy) < 8) return; // wait for a decisive direction
      if (busyPress) {
        gesture = 'none'; // pressed during a turn: a tap or nothing
        return;
      }
      // Horizontal turns the page; vertical scrolls a tall page, else no-op
      // (so a stray vertical swipe on a page that fits can't flip it).
      if (Math.abs(dx) >= Math.abs(dy)) {
        gesture = 'turn';
        if (beginCurl(cur - Math.sign(dx * s), { x: startX, y: startY })) gesture = 'curl';
        else {
          // the finger takes the track from wherever a slide has got to
          gsap.killTweensOf(track);
          baseTrackX = Number(gsap.getProperty(track, 'x'));
          dragX0 = e.clientX;
        }
      } else gesture = panRange(1).y > 0 ? 'pany' : 'none';
    }

    if (gesture === 'curl' && doorFx) {
      // forward: the finger travels toward the spine; back: away from it
      const dx = e.clientX - startX;
      const towardSpine = direction === 'ltr' ? -dx : dx;
      const max = doorFx.max;
      doorFx.set(doorForward ? doorAngle(towardSpine, doorW, max) : max - doorAngle(-towardSpine, doorW, max));
      return;
    }
    if (gesture === 'curl' && curlFx) {
      const c = curlFx.corner;
      curlFx.set({ x: c.x + (e.clientX - startX), y: c.y + (e.clientY - startY) });
      return;
    }

    if (gesture === 'turn') {
      const [min, max] = bounds();
      let x = baseTrackX + (e.clientX - dragX0);
      if (x < min) x = min + (x - min) * 0.3; // rubber-band past the ends
      if (x > max) x = max + (x - max) * 0.3;
      gsap.set(track, { x });
    } else if (gesture === 'pany') {
      ty = baseTy + (e.clientY - startY);
      clampPan();
    }
  }

  function onPointerUp(e: PointerEvent) {
    const wasPinching = pointers.size >= 2;
    pointers.delete(e.pointerId);
    if (stage.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);

    if (wasPinching) {
      // Dropped below 2 fingers. Hand the remaining one to pan/scroll; never turn.
      if (pointers.size === 1) {
        const p = twoPointers()[0];
        startX = p.x;
        startY = p.y;
        baseTx = tx;
        baseTy = ty;
        gesture = scale > 1 ? 'pan' : panRange(1).y > 0 ? 'pany' : 'none';
      } else if (pointers.size === 0) {
        settleZoom();
      }
      return;
    }

    if (pointers.size > 0) return; // safety

    const g = gesture;
    gesture = 'none';

    if (g === 'pan' || g === 'pany') {
      settleZoom();
      return;
    }
    if (g === 'curl' && doorFx) {
      const dx = e.clientX - startX;
      const v = dx / Math.max(1, performance.now() - startT);
      const towardSpine = direction === 'ltr' ? -v : v;
      const fling = (doorForward ? towardSpine : -towardSpine) > 0.5;
      const commit = doorCommit(doorFx.angle, doorForward, fling, doorFx.max);
      void endDoor(commit, commit ? 420 : 300);
      return;
    }
    if (g === 'curl') {
      const dx = e.clientX - startX;
      const velocity = dx / Math.max(1, performance.now() - startT);
      const toward = curlTarget > cur ? -s : s; // the finger's direction for this turn
      const commit = (curlFx?.progress ?? 0) > 0.12 || velocity * toward > 0.5;
      void endCurl(commit, commit ? 380 : 260);
      return;
    }
    if (g === 'turn') {
      const dx = e.clientX - startX;
      const dt = Math.max(1, performance.now() - startT);
      const velocity = dx / dt; // px per ms
      // Passing 18% of the screen or a decisive fling advances one sheet.
      const commit = Math.abs(dx) > width * 0.18 || Math.abs(velocity) > 0.5;
      const delta = commit ? -Math.sign(dx * s) : 0;
      go(cur + delta, true);
      return;
    }
    if (g === 'pending') {
      // A hold is not a tap: a long press marks the page as a favourite
      // (Reader.svelte) and must not also turn it.
      if (performance.now() - startT >= 450) return;
      // A tap, not a drag. The middle third shows or hides the menu — on a phone
      // there was no way to bring the bar back without turning the page — and
      // the outer thirds turn by physical side.
      const rect = stage.getBoundingClientRect();
      const at = (e.clientX - rect.left) / (rect.width || 1);
      if (onMenu && at > 1 / 3 && at < 2 / 3) {
        onMenu();
        return;
      }
      const side = at < 0.5 ? -1 : 1;
      go(cur + side * s);
    }
  }

  // Desktop: ctrl/⌘ + wheel zooms at the cursor; plain wheel scrolls a tall/zoomed page.
  function onWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const ns = clamp(scale * Math.exp(-e.deltaY * 0.0015), 1, MAX_SCALE);
      const { tx: nx, ty: ny } = anchoredTranslate(ns, { x: e.clientX, y: e.clientY });
      scale = ns;
      tx = ns <= 1.001 ? 0 : nx;
      ty = ns <= 1.001 ? panRange(1).y : ny;
      if (ns <= 1.001) scale = 1;
      return;
    }
    const r = panRange(scale);
    // zoomed in, a trackpad's sideways scroll (or shift+wheel) pans across too
    const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
    const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
    if (r.y === 0 && (r.x === 0 || !dx)) return;
    e.preventDefault();
    if (r.x > 0 && dx) tx = clamp(tx - dx, -r.x, r.x);
    if (r.y > 0) ty = clamp(ty - dy, -r.y, r.y);
  }

  // Wheel needs a non-passive listener to preventDefault the page scroll.
  $effect(() => {
    if (!stage) return;
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  });

  // Reset zoom + re-top the page whenever the current sheet changes.
  let prevCur = cur;
  $effect(() => {
    if (cur !== prevCur) {
      prevCur = cur;
      gsap.killTweensOf(zoomProxy);
      scale = 1;
      pinching = false;
      gesture = 'none';
      showTop();
    }
  });

  // Once the stage is measured, top-align the first page (covers tall openers).
  let toppedOnce = false;
  $effect(() => {
    if (!toppedOnce && width && pagesEls[cur]) {
      toppedOnce = true;
      showTop();
    }
  });

  function go(index: number, forceTween = false) {
    const clamped = Math.max(0, Math.min(sheets.length - 1, index));
    if (curlBusy || curlFx || doorFx) {
      // a turn is being drawn: finish it at once and take this one after it
      if (!forceTween && clamped !== cur) {
        queued = Math.sign(clamped - cur);
        hurry();
      }
      return;
    }
    // Taps and the ‹ › buttons curl too: lifted from the bottom corner, in an arc.
    if (!forceTween && clamped !== cur && beginCurl(clamped, null)) {
      if (doorFx) void endDoor(true, 560);
      else void endCurl(true, 560, (pagesEls[cur]?.offsetHeight ?? 0) * 0.16);
      return;
    }
    if (clamped !== cur) {
      onNavigate(clamped);
    } else if (forceTween) {
      // Snap back from a cancelled drag.
      gsap.to(track, { x: targetX, duration: reduced ? 0 : 0.35, ease: 'power3.out' });
    } else {
      gsap.to(track, { x: targetX, duration: 0.2, ease: 'power3.out' });
    }
  }
</script>

<div
  class="fs"
  role="region"
  aria-label="Manga pages — pinch to zoom, swipe or use the arrows to turn"
  bind:this={stage}
  bind:clientWidth={width}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
>
  <div class="fs__track" bind:this={track}>
    {#each mounted as { sheet, index } (sheet.pages[0].id)}
      <div
        class="fs__sheet"
        class:is-fit-width={fit === 'width'}
        style={`transform: translate3d(${index * 100 * s}%, 0, 0)`}
      >
        <div
          class="fs__pages"
          class:is-spread={sheet.kind === 'spread' || (index === 0 && closedCover)}
          class:is-rtl={direction === 'rtl'}
          bind:this={pagesEls[index]}
          style={index === cur
            ? `transform: translate(${tx}px, ${ty}px) scale(${scale}); transform-origin: center center;`
            : undefined}
        >
          {#if index === 0 && closedCover}
            <!-- the other half of the closed book: empty, one page wide (before
                 the cover in the DOM, so RTL's row-reverse puts it on the right) -->
            <span
              class="fs__gap"
              aria-hidden="true"
              style={`aspect-ratio: ${sheet.pages[0].width} / ${sheet.pages[0].height}; --pw: ${sheet.pages[0].width}; --ph: ${sheet.pages[0].height};`}
            ></span>
          {/if}
          {#each sheet.pages as page (page.id)}
            <SheetImage
              {page}
              eager
              sizes={sheet.kind === 'spread' || (index === 0 && closedCover) ? '50vw' : '100vw'}
              alt={`Page ${pageNumberOf(page.id)}`}
              {translateOn}
              {typesetOn}
              {characters}
              {highlightId}
              {onHighlight}
            />
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <button
    class="fs__nav fs__nav--left"
    data-nav
    aria-label={leftDelta < 0 ? 'Previous page' : 'Next page'}
    disabled={leftDisabled}
    onclick={() => go(cur + leftDelta)}
  >‹</button>
  <button
    class="fs__nav fs__nav--right"
    data-nav
    aria-label={rightDelta < 0 ? 'Previous page' : 'Next page'}
    disabled={rightDisabled}
    onclick={() => go(cur + rightDelta)}
  >›</button>
</div>

<style>
  .fs {
    position: fixed;
    inset: 0;
    overflow: hidden;
    touch-action: none;
    cursor: grab;
  }
  .fs:active {
    cursor: grabbing;
  }
  .fs__track {
    position: absolute;
    inset: 0;
    will-change: transform;
  }
  .fs__sheet {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    /* Tall/zoomed pages spill past the sheet; the outer .fs (overflow:hidden)
       clips at the viewport and we move within via transform (ty). */
    overflow: visible;
    padding: calc(3.2rem + env(safe-area-inset-top)) clamp(0.4rem, 1.5vw, 1.5rem)
      calc(3rem + env(safe-area-inset-bottom));
  }
  .fs__pages {
    display: flex;
    justify-content: center;
    max-width: 100%;
  }
  /* Fit-height: compute the width EXPLICITLY from the page's own dimensions
     (--pw/--ph, set inline by SheetImage) instead of relying on aspect-ratio
     to transfer the pinned height into a width. Stable iOS WebKit fails that
     transfer during intrinsic sizing when the box also has container-type:size
     inside this shrink-wrapping flex/grid chain — .si resolves to width 0 and,
     because iOS doesn't re-lay-out size containers on rotation, every sheet
     mounted in that state stays a black rectangle until remounted. An explicit
     calc() width sidesteps intrinsic sizing on every engine; max-width still
     letterboxes oversized spreads (imgs are absolutely positioned with
     object-fit: contain). */
  .fs__gap {
    display: block;
    visibility: hidden;
    flex: none;
  }
  .fs__pages :global(.si),
  .fs__gap {
    height: calc(100svh - 6.4rem);
    width: calc((100svh - 6.4rem) * (var(--pw) / var(--ph)));
    max-width: 100%;
  }
  .fs__pages.is-spread :global(.si),
  .fs__pages.is-spread .fs__gap {
    max-width: 50%;
  }
  .fs__pages.is-spread.is-rtl {
    flex-direction: row-reverse;
  }
  .is-fit-width .fs__pages :global(.si),
  .is-fit-width .fs__gap {
    height: auto;
    width: min(100%, 62rem);
  }

  /* Phones / portrait: pinning the page height turned each page into a tall,
     unreadable stripe (esp. spreads at max-width:50%). Size by WIDTH instead so
     the full spread fits the screen width; tall pages scroll vertically. */
  @media (max-width: 700px), (orientation: portrait) {
    /* Give the flex container a definite width so the width-based .si sizing
       below resolves — without it the grid item shrink-wraps its (zero-
       intrinsic, absolutely-positioned) contents and the page collapses to
       black. Mirrors ScrollSurface's definite-width sheet. */
    .fs__pages {
      width: 100%;
    }
    .fs__pages :global(.si),
    .fs__gap {
      height: auto;
      width: 100%;
      max-width: 100%;
    }
    .fs__pages.is-spread :global(.si),
    .fs__pages.is-spread .fs__gap {
      width: 50%;
      max-width: 50%;
      height: auto;
    }
  }

  /* Page-turn buttons — always available, incl. while zoomed. They sit outside
     the transformed page, so they never scale or drift with a pan. */
  .fs__nav {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    z-index: 6;
    width: clamp(2.4rem, 8vw, 3rem);
    height: clamp(2.4rem, 8vw, 3rem);
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--line-strong, rgba(255, 255, 255, 0.25));
    border-radius: 50%;
    background: color-mix(in srgb, var(--bg, #0c0c0d) 55%, transparent);
    color: var(--fg, #f4f1ea);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0.5;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    transition: opacity 0.2s var(--ease), background-color 0.2s var(--ease);
  }
  .fs__nav:hover {
    opacity: 1;
  }
  .fs__nav:disabled {
    opacity: 0.12;
    cursor: default;
    pointer-events: none;
  }
  .fs__nav--left {
    left: calc(0.6rem + env(safe-area-inset-left));
  }
  .fs__nav--right {
    right: calc(0.6rem + env(safe-area-inset-right));
  }
  @media (prefers-reduced-motion: reduce) {
    .fs__nav {
      transition: none;
    }
  }
  /* Touch screens turn by tapping the sides or swiping; floating over the page
     edge the buttons only blurred the margin notes there. Kept for mice. */
  @media (hover: none) {
    .fs__nav {
      display: none;
    }
  }
</style>
