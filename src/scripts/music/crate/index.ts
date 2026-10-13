/**
 * /music — the crate (routes/music/index.astro). See the page's header for what it does; this
 * wires the page: language, WebGL (or the plain list when there is none), the crate, the case
 * you pull out, and the song's audio.
 */
import { applyCopy, readCopyPayload } from '../../../lib/siteCopyClient';
import { DEFAULT_LANG, isLang, LANG_EVENT, LANG_STORAGE_KEY, type Lang } from '../../../lib/lang';
import { fly } from './fly';
import type { CrateSlot } from './types';

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

export function initCrate() {
  const root = document.getElementById('crate');
  const host = root?.querySelector<HTMLElement>('[data-crate-stage]');
  const canvas = host?.querySelector<HTMLCanvasElement>('canvas');
  const raw = document.getElementById('crate-data')?.textContent;
  if (!root || !host || !canvas || !raw) return;
  initLang();

  const slots = JSON.parse(raw) as CrateSlot[];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const forceFlat = new URLSearchParams(location.search).get('gl') === '0';
  // the list stays the page whenever the crate cannot be drawn
  const flat = () => (root.dataset.gl = 'off');
  if (forceFlat || !hasWebGL()) return flat();

  void (async () => {
    try {
      const [{ loadThree, jewelKit }, { createStage }, { createHero }, { createRow }] = await Promise.all([
        import('./jewel'),
        import('./scene'),
        import('./hero'),
        import('./row'),
      ]);
      const THREE = await loadThree();
      const stage = await createStage(THREE, host, canvas, flat);
      const kit = jewelKit(THREE);
      const row = createRow(stage, kit, slots);
      const hero = createHero(stage, kit, canvas, reduced);

      slots.forEach((s, i) => {
        if (s.kind === 'song' && s.cover)
          void loadImage(s.cover).then((img) => (row.jewels[i].setFace(img), stage.kick()));
      });

      wireCrate({ root, host, canvas, slots, stage, row, hero, reduced });

      if (import.meta.env.DEV) Object.assign(window, { __crate: { THREE, stage, hero, kit, row } });
      stage.renderer.render(stage.scene, stage.camera);
      root.dataset.gl = 'on';
      stage.kick();
    } catch (err) {
      console.error('[crate]', err);
      flat();
    }
  })();
}

interface Parts {
  root: HTMLElement;
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  slots: CrateSlot[];
  stage: import('./scene').Stage;
  row: import('./row').Row;
  hero: import('./hero').Hero;
  reduced: boolean;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * The crate's input and the case in your hands: sweeping, the tag over the case under the
 * pointer, taps, the keyboard; taking a case out and putting it back (in the URL as ?cd=<slug>,
 * so Back puts it back and a link can open on it); the lid, the song and the deck under the case.
 */
function wireCrate({ root, host, canvas, slots, stage, row, hero, reduced }: Parts) {
  const tag = host.querySelector<HTMLElement>('[data-crate-tag]')!;
  const tagJa = tag.querySelector<HTMLElement>('[data-tag-ja]')!;
  const tagEn = tag.querySelector<HTMLElement>('[data-tag-en]')!;
  const tagMeta = tag.querySelector<HTMLElement>('[data-tag-meta]')!;
  const comingWord = () => root.querySelector('.crate__item--coming [data-i18n="music.coming"]')?.textContent ?? 'COMING SOON';

  let shown: number | null = null;
  row.onChange = () => {
    const i = hero.jewel ? null : row.selected;
    const s = i === null ? null : slots[i];
    if (!s || s.kind === 'blank') {
      tag.hidden = true;
      shown = null;
      canvas.classList.remove('is-over');
      return;
    }
    if (shown !== i) {
      shown = i;
      tagJa.textContent = s.title?.ja ?? '';
      tagEn.textContent = s.title?.en ?? '';
      tagMeta.textContent = s.kind === 'song' ? `${s.movements} MOVEMENTS · ${s.length}` : comingWord();
      tag.hidden = false;
    }
    canvas.classList.toggle('is-over', s.kind === 'song');
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

  // a tap: a song comes out of the crate, any other case rocks
  canvas.addEventListener('click', (e) => {
    if (hero.jewel || busy) return;
    const i = row.at(e.clientX, e.clientY);
    if (i === null) return;
    if (slots[i].kind === 'song') void takeOut(i);
    else row.rock(i);
  });

  // the keyboard: the list under the canvas is the way in; focus lifts its case
  root.querySelectorAll<HTMLElement>('.crate__list [data-slot]').forEach((el) => {
    const i = Number(el.dataset.slot);
    el.addEventListener('focus', () => row.focus(i));
    el.addEventListener('blur', () => row.focus(null));
    el.addEventListener('click', (e) => {
      if (root.dataset.gl !== 'on') return; // no crate: the link is the way to the song
      e.preventDefault();
      if (slots[i].kind === 'song') void takeOut(i);
      else row.rock(i);
    });
  });

  // --- the case in your hands --------------------------------------------------------------
  const audio = root.querySelector<HTMLAudioElement>('[data-crate-audio]')!;
  const deck = host.querySelector<HTMLElement>('[data-crate-deck]')!;
  const playBtn = deck.querySelector<HTMLButtonElement>('[data-crate-play]')!;
  const songLink = deck.querySelector<HTMLAnchorElement>('[data-crate-song]')!;
  const closeBtn = deck.querySelector<HTMLButtonElement>('[data-crate-close]')!;
  const deckJa = deck.querySelector<HTMLElement>('[data-deck-ja]')!;
  const deckTime = deck.querySelector<HTMLElement>('[data-deck-time]')!;

  let current: number | null = null;
  let busy = false;

  // the song page opens on its playlist, without the SCANNED flash, at the same moment
  const songHref = (s: CrateSlot, t: number) => `${s.href}?scan=1&from=crate${t >= 1 ? `&t=${Math.floor(t)}` : ''}`;

  const play = async () => {
    try {
      await audio.play();
    } catch {
      /* blocked or failed to load: the lid stays open, and PLAY tries again */
    }
  };
  const setLid = (open: boolean) => {
    hero.setOpen(open);
    if (open) void play();
    else audio.pause();
  };
  hero.onTap = () => setLid(!hero.isOpen);

  playBtn.addEventListener('click', () => {
    if (!hero.isOpen) setLid(true);
    else if (audio.paused) void play();
    else audio.pause();
  });
  const playing = (on: boolean) => {
    hero.setSpinning(on);
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
  };
  audio.addEventListener('play', () => playing(true));
  audio.addEventListener('pause', () => playing(false));
  audio.addEventListener('ended', () => playing(false));
  audio.addEventListener('timeupdate', () => {
    const s = current === null ? null : slots[current];
    if (!s) return;
    deckTime.textContent = `${fmt(audio.currentTime)} / ${s.length}`;
    songLink.href = songHref(s, audio.currentTime);
  });

  const withCd = (slug: string | null) => {
    const u = new URL(location.href);
    if (slug) u.searchParams.set('cd', slug);
    else u.searchParams.delete('cd');
    return u;
  };

  async function takeOut(i: number, push = true) {
    const s = slots[i];
    if (busy || current !== null || s.kind !== 'song') return;
    busy = true;
    current = i;
    row.setAsleep(true);
    if (audio.dataset.slug !== s.slug) {
      audio.src = s.audio!;
      audio.dataset.slug = s.slug;
    }
    deckJa.textContent = `${s.title!.ja} ${s.title!.en}`;
    deckTime.textContent = `${fmt(audio.currentTime)} / ${s.length}`;
    songLink.href = songHref(s, audio.currentTime);
    deck.hidden = false;
    canvas.classList.add('is-held');
    if (push) history.pushState({ cd: s.slug }, '', withCd(s.slug));
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${s.title!.ja} — ${s.title!.en}`,
        artist: 'Asu Azure',
        album: s.album ?? '',
        artwork: s.cover ? [{ src: new URL(s.cover, location.href).href, sizes: '1024x1024', type: 'image/webp' }] : [],
      });
      navigator.mediaSession.setActionHandler('play', () => (hero.isOpen ? void play() : setLid(true)));
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    }
    await hero.hold(row.jewels[i]);
    busy = false;
    playBtn.focus({ preventScroll: true });
  }

  async function putBack() {
    if (busy || current === null) return;
    busy = true;
    const i = current;
    // a keyboard user goes back to the song in the list; a mouse user stays where they are
    const keyboard = Boolean(deck.querySelector(':focus-visible'));
    audio.pause();
    deck.hidden = true;
    canvas.classList.remove('is-held');
    const open0 = hero.openness;
    const j = hero.release()!;
    stage.scene.updateMatrixWorld(true);
    row.slot(i).attach(j.root);
    // the lid shuts and the disc turns back to how it was printed, on the way in
    const rz0 = j.disc.rotation.z;
    const rz1 = Math.round(rz0 / (Math.PI * 2)) * Math.PI * 2;
    await fly(stage, j.root, row.home, {
      dur: reduced ? 0 : 0.7,
      arc: 2,
      onStep: (e) => {
        j.setOpen(open0 * (1 - e));
        j.disc.rotation.z = rz0 + (rz1 - rz0) * e;
      },
    });
    current = null;
    row.setAsleep(false);
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
  closeBtn.addEventListener('click', close);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current !== null) close();
  });
  addEventListener('popstate', () => {
    const cd = new URLSearchParams(location.search).get('cd');
    if (!cd && current !== null) void putBack();
    else if (cd && current === null) {
      const i = slots.findIndex((s) => s.slug === cd && s.kind === 'song');
      if (i >= 0) void takeOut(i, false);
    }
  });

  // a link straight to a case (?cd=<slug>) opens on it
  const first = new URLSearchParams(location.search).get('cd');
  const at = first ? slots.findIndex((s) => s.slug === first && s.kind === 'song') : -1;
  if (at >= 0) void takeOut(at, false);
}
