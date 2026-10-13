/**
 * /music — the crate (routes/music/index.astro). See the page's header for what it does; this
 * wires the page: language, WebGL (or the plain list when there is none), the crate, and the CD
 * you take out — its case in your hands and its liner (liner.ts: tracklist, YouTube player).
 */
import { applyCopy, readCopyPayload } from '../../../lib/siteCopyClient';
import { DEFAULT_LANG, isLang, LANG_EVENT, LANG_STORAGE_KEY, type Lang } from '../../../lib/lang';
import { fly } from './fly';
import { createLiner, type Liner } from './liner';
import type { CratePayload, CrateSlot } from './types';

function initLang() {
  const bundle = readCopyPayload();
  if (!bundle) return;
  const btns = [...document.querySelectorAll<HTMLButtonElement>('.crate__langs [data-lang]')];
  const setLang = (next: Lang) => {
    applyCopy(bundle, next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
    btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === next)));
    document.dispatchEvent(new CustomEvent<Lang>(LANG_EVENT, { detail: next }));
  };
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (isLang(saved) && saved !== DEFAULT_LANG) setLang(saved);
  } catch {
    /* default stays */
  }
  document.querySelector('.crate__langs')?.addEventListener('click', (e) => {
    const next = (e.target as Element | null)?.closest<HTMLElement>('[data-lang]')?.dataset.lang;
    if (isLang(next)) setLang(next);
  });
}

const hasWebGL = () => {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const idle = (f: () => void) =>
  typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 60);

/** The 3D crate, once it is up. */
interface Crate3D {
  canvas: HTMLCanvasElement;
  stage: import('./scene').Stage;
  row: import('./row').Row;
  hero: import('./hero').Hero;
  kit: import('./jewel').JewelKit;
  THREE: typeof import('three');
}

type LenisLike = { scrollTo(t: HTMLElement | number, o?: { offset?: number; immediate?: boolean; duration?: number }): void };

export function initCrate() {
  const root = document.getElementById('crate');
  const host = root?.querySelector<HTMLElement>('[data-crate-stage]');
  const canvas = host?.querySelector<HTMLCanvasElement>('canvas');
  const raw = document.getElementById('crate-data')?.textContent;
  if (!root || !host || !canvas || !raw) return;
  initLang();

  const payload = JSON.parse(raw) as CratePayload;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const forceFlat = new URLSearchParams(location.search).get('gl') === '0';
  let gl: Crate3D | null = null;
  const hand = wireHand(root, host, payload.slots, reduced, () => gl);
  // the list stays the page whenever the crate cannot be drawn
  const flat = () => {
    gl = null;
    root.dataset.gl = 'off';
  };
  if (forceFlat || !hasWebGL()) {
    flat();
    return hand.start();
  }

  void (async () => {
    try {
      const [{ loadThree, jewelKit }, { createStage }, { createHero }, { createRow }, { imageTexture }] = await Promise.all([
        import('./jewel'),
        import('./scene'),
        import('./hero'),
        import('./row'),
        import('./textures'),
      ]);
      const THREE = await loadThree();
      const stage = await createStage(THREE, host, canvas, flat);
      const kit = jewelKit(THREE, payload.spineColumns);
      const row = createRow(stage, kit, payload.slots, reduced);
      const hero = createHero(stage, kit, canvas, reduced);
      gl = { canvas, stage, row, hero, kit, THREE };

      // the paper: jackets and the spine atlas now (uploaded to the GPU one at a time when the
      // page is idle, so taking a case out never waits on it), the booklet's inside after them
      const paper = (src: string, use: (img: HTMLImageElement) => void) =>
        loadImage(src).then((img) => idle(() => (use(img), stage.kick())), () => {});
      const fill = (m: import('three').MeshStandardMaterial, img: HTMLImageElement) => {
        m.map = imageTexture(THREE, img);
        m.color.set(0xffffff);
        m.needsUpdate = true;
        stage.renderer.initTexture(m.map);
      };
      void paper(payload.spines, (img) => fill(kit.spines, img));
      payload.slots.forEach((s, i) => {
        if (s.jacket)
          void paper(s.jacket, (img) => {
            const t = imageTexture(THREE, img);
            stage.renderer.initTexture(t);
            row.jewels[i].setJacket(t);
          });
      });
      void paper(payload.inner, (img) => fill(kit.inner, img));

      wireCrate(root, host, payload.slots, gl, hand);

      if (import.meta.env.DEV) Object.assign(window, { __crate: { ...gl, hand } });
      stage.renderer.render(stage.scene, stage.camera);
      root.dataset.gl = 'on';
      stage.kick();
      hand.start();
    } catch (err) {
      console.error('[crate]', err);
      flat();
      hand.start();
    }
  })();
}

interface Hand {
  readonly current: number | null;
  readonly busy: boolean;
  takeOut(i: number, push?: boolean): Promise<void>;
  liner: Liner;
  /** Open on the case the address names (?cd=<slug>), once the page knows how it draws. */
  start(): void;
}

/**
 * The CD in your hands: taking it out of the crate and putting it back (in the URL as ?cd=<slug>,
 * so Back puts it back and a link can open on it), its liner, and — when the crate is drawn — its
 * case, held in front of you while the liner covers part of the stage.
 */
function wireHand(root: HTMLElement, host: HTMLElement, slots: CrateSlot[], reduced: boolean, crate: () => Crate3D | null): Hand {
  const lenis = (): LenisLike | undefined => (window as unknown as { __lenis?: LenisLike }).__lenis;
  const topbar = () => document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;

  /** Bring an element into view (by default mostly: YouTube's own rule for starting by itself). */
  const ensureVisible = (el: HTMLElement, enough = 0.6) =>
    new Promise<void>((done) => {
      const r = el.getBoundingClientRect();
      const top = topbar();
      const seen = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, top)) / Math.max(1, r.height);
      if (seen >= enough) return done();
      const offset = -Math.max(top + 12, (innerHeight - r.height) / 2);
      const l = lenis();
      if (l && !reduced) {
        l.scrollTo(el, { offset, duration: 0.6 });
        window.setTimeout(done, 650);
      } else {
        window.scrollTo({ top: scrollY + r.top + offset, behavior: 'instant' as ScrollBehavior });
        requestAnimationFrame(() => done());
      }
    });

  const liner = createLiner(root, slots, {
    setLid: (open) => {
      const c = crate();
      if (c?.hero.jewel && c.hero.isOpen !== open) c.hero.setOpen(open);
    },
    setSpin: (on) => crate()?.hero.setSpinning(on),
    ensureVisible,
  });

  let current: number | null = null;
  let busy = false;
  // the tab says which CD is out, as the server does for ?cd=
  const baseTitle = 'MUSIC · Pressroom — Asu Azure';
  const titleFor = (s: CrateSlot | null) => (s?.title ? `${s.title.ja} — ${s.title.en} · ${baseTitle}` : baseTitle);

  // the liner covers the stage on the right (wide) or at the bottom (narrow): the held case centres
  // in what is left
  const inset = () => {
    const c = crate();
    const el = liner.el;
    if (!c || !el) return;
    const s = host.getBoundingClientRect();
    const l = el.getBoundingClientRect();
    const side = l.left > s.left + s.width * 0.3;
    c.hero.setInset(side ? Math.max(0, s.right - l.left) : 0, side ? 0 : Math.max(0, s.bottom - l.top));
  };
  const ro = new ResizeObserver(inset);
  ro.observe(host);

  const withCd = (slug: string | null) => {
    const u = new URL(location.href);
    if (slug) u.searchParams.set('cd', slug);
    else u.searchParams.delete('cd');
    return u;
  };

  async function takeOut(i: number, push = true) {
    const s = slots[i];
    if (busy || current !== null || s?.kind !== 'cd') return;
    busy = true;
    current = i;
    const el = liner.open(i);
    if (!el) {
      busy = false;
      current = null;
      return;
    }
    ro.observe(el);
    if (push) history.pushState({ cd: s.slug }, '', withCd(s.slug));
    document.title = titleFor(s);
    const c = crate();
    if (c) {
      c.row.setAsleep(true);
      c.canvas.classList.add('is-held');
      if (s.disc) void loadImage(s.disc).then((img) => (c.row.jewels[i].setDisc(img), c.stage.kick()), () => {});
      inset();
      // the whole stage in view: the case, and its liner beside it (on a phone, over its foot)
      void ensureVisible(host, 0.97);
      await c.hero.hold(c.row.jewels[i]);
    } else {
      await ensureVisible(el);
    }
    busy = false;
    el.querySelector<HTMLElement>('[data-liner-play]')?.focus({ preventScroll: true });
  }

  async function putBack() {
    if (busy || current === null) return;
    busy = true;
    const i = current;
    // a keyboard user goes back to the CD in the list; a mouse user stays where they are
    const keyboard = Boolean(liner.el?.querySelector(':focus-visible'));
    if (liner.el) ro.unobserve(liner.el);
    liner.close();
    document.title = titleFor(null);
    const c = crate();
    if (c) {
      c.canvas.classList.remove('is-held');
      const open0 = c.hero.openness;
      c.hero.setInset(0, 0);
      const j = c.hero.release()!;
      c.stage.scene.updateMatrixWorld(true);
      c.row.slot(i).attach(j.root);
      // the lid shuts and the disc turns back to how it was printed, on the way in
      const rz0 = j.disc.rotation.z;
      const rz1 = Math.round(rz0 / (Math.PI * 2)) * Math.PI * 2;
      await fly(c.stage, j.root, c.row.home, {
        dur: reduced ? 0 : 0.7,
        arc: 2,
        onStep: (e) => {
          j.setOpen(open0 * (1 - e));
          j.disc.rotation.z = rz0 + (rz1 - rz0) * e;
        },
      });
      c.row.setAsleep(false);
    }
    current = null;
    busy = false;
    if (keyboard) root.querySelector<HTMLElement>(`.crate__list [data-slot="${i}"]`)?.focus({ preventScroll: true });
  }

  // closing goes through history when this visit opened the case, so Back and ✕ agree
  const close = () => {
    if (current === null || busy) return;
    if (history.state?.cd) history.back();
    else {
      history.replaceState(null, '', withCd(null));
      void putBack();
    }
  };
  root.addEventListener('click', (e) => {
    // a link to /music without JavaScript; here it puts the case back
    if (!(e.target as Element | null)?.closest('[data-liner-close]')) return;
    e.preventDefault();
    close();
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current !== null) close();
  });
  addEventListener('popstate', () => {
    const cd = new URLSearchParams(location.search).get('cd');
    if (!cd && current !== null) void putBack();
    else if (cd && current === null) {
      const i = slots.findIndex((s) => s.slug === cd && s.kind === 'cd');
      if (i >= 0) void takeOut(i, false);
    }
  });

  // the list: the way in without the crate, and the keyboard's way in with it
  root.querySelectorAll<HTMLElement>('.crate__list [data-slot]').forEach((el) => {
    const i = Number(el.dataset.slot);
    el.addEventListener('focus', () => crate()?.row.focus(i));
    el.addEventListener('blur', () => crate()?.row.focus(null));
    el.addEventListener('pointerenter', () => crate()?.row.focus(i));
    el.addEventListener('pointerleave', () => crate()?.row.focus(null));
    el.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      void takeOut(i);
    });
  });

  return {
    get current() {
      return current;
    },
    get busy() {
      return busy;
    },
    takeOut,
    liner,
    start() {
      // a liner the server opened (?cd= without JavaScript) is the script's to run now
      root.querySelectorAll<HTMLElement>('[data-ssr-open]').forEach((el) => {
        el.hidden = true;
        delete el.dataset.ssrOpen;
      });
      const first = new URLSearchParams(location.search).get('cd');
      const at = first ? slots.findIndex((s) => s.slug === first && s.kind === 'cd') : -1;
      if (at >= 0) void takeOut(at, false);
    },
  };
}

/**
 * The crate's own input: sweeping, the tag over the case under the pointer, taps on cases, and
 * taps on the case in your hands (its lid and the song, through the liner).
 */
function wireCrate(root: HTMLElement, host: HTMLElement, slots: CrateSlot[], c: Crate3D, hand: Hand) {
  const { canvas, row, hero } = c;
  const tag = host.querySelector<HTMLElement>('[data-crate-tag]')!;
  const tagJa = tag.querySelector<HTMLElement>('[data-tag-ja]')!;
  const tagEn = tag.querySelector<HTMLElement>('[data-tag-en]')!;
  const tagMeta = tag.querySelector<HTMLElement>('[data-tag-meta]')!;
  // "1 TRACK · 5:10" in the page's language, from the list (applyCopy keeps it current)
  const metaOf = (i: number) => root.querySelector(`.crate__list [data-slot="${i}"] [data-meta]`)?.textContent ?? '';

  let shown: number | null = null;
  row.onChange = () => {
    const i = hero.jewel ? null : row.selected;
    const s = i === null ? null : slots[i];
    if (!s || s.kind !== 'cd') {
      tag.hidden = true;
      shown = null;
      canvas.classList.remove('is-over');
      return;
    }
    if (shown !== i) {
      shown = i;
      tagJa.textContent = s.title?.ja ?? '';
      tagEn.textContent = s.title?.en ?? '';
      tagMeta.textContent = metaOf(i!);
      tag.hidden = false;
    }
    canvas.classList.add('is-over');
    // above the case, but never off the top of the stage
    const p = row.topOf(i!);
    tag.style.transform = `translate(${p.x}px, ${Math.max(tag.offsetHeight + 6, p.y - 8)}px)`;
  };

  // sweeping: a mouse anywhere over the crate; a finger while it is down (vertical swipes still
  // scroll the page: the canvas is touch-action: pan-y)
  let touchUp = 0;
  canvas.addEventListener('pointermove', (e) => {
    if (hero.jewel) return;
    if (e.pointerType !== 'mouse' && !e.buttons) return;
    clearTimeout(touchUp);
    row.pointer(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (hero.jewel || e.pointerType === 'mouse') return;
    clearTimeout(touchUp);
    row.pointer(e.clientX, e.clientY);
  });
  const lift = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    // let a tapped case come up before it settles back
    touchUp = window.setTimeout(() => row.leave(), 700);
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') row.leave();
  });

  // a tap: a CD comes out of the crate, an empty case rocks
  canvas.addEventListener('click', (e) => {
    if (hero.jewel || hand.busy) return;
    const i = row.at(e.clientX, e.clientY);
    if (i === null) return;
    if (slots[i].kind === 'cd') void hand.takeOut(i);
    else row.rock(i);
  });

  // a tap on the case in your hands: the first one asks for the song; then pause and resume
  hero.onTap = () => hand.liner.tapCase();
}
