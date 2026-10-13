/**
 * The liner: the CD you took out, as words and a player — its tracklist, the YouTube player, the
 * notes and credits, "YouTubeで開く" and ✕. One per CD, written by the server (routes/music/
 * index.astro), so it reads without JavaScript; this module brings it to life, with or without
 * the 3D crate (the hooks are the case: its lid and its disc).
 *
 * Nothing loads from YouTube until the visitor asks for the song: a tap on the case, ▶ on the
 * poster, or a track. Then the player goes where the poster was (scrolled into view first: YouTube
 * only lets a player start by itself when it is mostly visible), and from then on the player is
 * the truth (deck.ts): the disc spins while it plays, a CD's next track follows the one that ended.
 * A browser that refuses to start it (Safari, often) gets a line under the player — one press on
 * the player's own ▶ — never a muted start.
 */
import { LANG_EVENT, type Lang } from '../../../lib/lang';
import { mountYouTube, YT_PLAYING, type YouTubePlayer } from '../youtube';
import { caseTap, deckStep } from './deck';
import type { CrateSlot } from './types';

export interface LinerHooks {
  /** open or shut the case's lid (no case without WebGL: then nothing) */
  setLid(open: boolean): void;
  setSpin(on: boolean): void;
  /** bring an element (the player) into view, resolving once it is there */
  ensureVisible(el: HTMLElement): Promise<void>;
}

export interface Liner {
  /** Show slot i's liner, on its first track, nothing loaded. */
  open(i: number): HTMLElement | null;
  /** Hide it and take its player out of the page. */
  close(): void;
  /** Play track k of the open CD (the current one by default). */
  play(k?: number): Promise<void>;
  /** A tap on the case: start, pause or resume. */
  tapCase(): void;
  /** The open liner, if any. */
  readonly el: HTMLElement | null;
}

const watch = (id: string, t: number) => `https://www.youtube.com/watch?v=${id}${t >= 1 ? `&t=${Math.floor(t)}s` : ''}`;

export function createLiner(root: HTMLElement, slots: CrateSlot[], hooks: LinerHooks): Liner {
  let el: HTMLElement | null = null;
  let slot: CrateSlot | null = null;
  let track = 0;
  let player: YouTubePlayer | null = null;
  let mounting: Promise<YouTubePlayer> | null = null;
  let playing = false;
  let blockTimer = 0;

  const q = <T extends Element = HTMLElement>(sel: string) => el?.querySelector<T>(sel) ?? null;
  const rows = () => [...(el?.querySelectorAll<HTMLAnchorElement>('[data-track]') ?? [])];

  const showBlocked = (on: boolean) => {
    const b = q('[data-liner-blocked]');
    if (b) b.hidden = !on;
  };

  /** Mark track k as the one in the player, and point "YouTubeで開く" at it. */
  const select = (k: number) => {
    track = k;
    rows().forEach((r, i) => (i === k ? r.setAttribute('aria-current', 'true') : r.removeAttribute('aria-current')));
    const t = slot?.tracks?.[k];
    const yt = q<HTMLAnchorElement>('[data-liner-yt]');
    if (t && yt) yt.href = watch(t.youtube, 0);
    // until the player is up, the screen shows this track's still
    const poster = q<HTMLImageElement>('[data-liner-poster]');
    if (t && poster && !player) poster.src = t.poster;
  };

  const onState = (state: number) => {
    const d = deckStep(state, track, slot?.tracks?.length ?? 1);
    playing = state === YT_PLAYING;
    if (d.spin !== null) hooks.setSpin(d.spin);
    if (d.openLid) hooks.setLid(true);
    if (d.playing) {
      clearTimeout(blockTimer);
      showBlocked(false);
    }
    if (d.next !== null && player && slot?.tracks) {
      select(d.next);
      player.load(slot.tracks[d.next].youtube);
    }
  };

  async function play(k = track) {
    if (!el || !slot?.tracks?.[k]) return;
    const id = slot.tracks[k].youtube;
    select(k);
    hooks.setLid(true);
    const screen = q('[data-liner-screen]')!;
    if (player) {
      player.load(id);
      return;
    }
    if (mounting) return;
    await hooks.ensureVisible(screen);
    const box = q('[data-player]')!;
    screen.dataset.on = '';
    const mine = el;
    mounting = mountYouTube(box, id, {
      autoplay: true,
      onState,
      onBlocked: () => showBlocked(true),
    });
    try {
      const p = await mounting;
      if (el !== mine) return p.destroy(); // closed while it loaded
      player = p;
      // no word from the player after a while: tell the visitor where to press
      blockTimer = window.setTimeout(() => {
        if (!playing) showBlocked(true);
      }, 4000);
    } catch {
      // the API did not load (offline, blocked): the poster comes back, the rows still link out
      delete screen.dataset.on;
    } finally {
      mounting = null;
    }
  }

  const close = () => {
    clearTimeout(blockTimer);
    player?.destroy();
    player = null;
    playing = false;
    hooks.setSpin(false);
    if (el) {
      const screen = q('[data-liner-screen]');
      if (screen) delete screen.dataset.on;
      showBlocked(false);
      el.hidden = true;
    }
    el = null;
    slot = null;
  };

  // version labels follow the page's language (the titles stay as printed)
  const relabel = (lang: Lang) =>
    root.querySelectorAll<HTMLElement>('[data-ver-ja]').forEach((v) => {
      v.textContent = (lang === 'ja' ? v.dataset.verJa : v.dataset.verEn) ?? '';
    });
  document.addEventListener(LANG_EVENT, (e) => relabel((e as CustomEvent<Lang>).detail));

  // the controls, delegated: every liner is in the page from the start
  root.addEventListener('click', (e) => {
    const t = e.target as Element | null;
    if (!el || !t || !el.contains(t)) return;
    const row = t.closest<HTMLAnchorElement>('[data-track]');
    if (row) {
      const me = e as MouseEvent;
      if (me.ctrlKey || me.metaKey || me.shiftKey || me.button > 0) return; // a new tab: YouTube
      e.preventDefault();
      void play(Number(row.dataset.track));
      return;
    }
    if (t.closest('[data-liner-play]')) {
      void play();
      return;
    }
    const yt = t.closest<HTMLAnchorElement>('[data-liner-yt]');
    if (yt && slot?.tracks) {
      // going to YouTube: carry the moment over, and stop here
      yt.href = watch(slot.tracks[track].youtube, player?.time() ?? 0);
      player?.pause();
    }
  });

  return {
    open(i) {
      close();
      const s = slots[i];
      const next = s ? root.querySelector<HTMLElement>(`[data-liner="${s.slug}"]`) : null;
      if (!s || !next) return null;
      el = next;
      slot = s;
      el.hidden = false;
      select(0);
      return el;
    },
    close,
    play,
    tapCase() {
      switch (caseTap(Boolean(player || mounting), playing)) {
        case 'start':
          void play();
          break;
        case 'pause':
          player?.pause();
          hooks.setLid(false);
          break;
        case 'resume':
          hooks.setLid(true);
          player?.play();
          break;
      }
    },
    get el() {
      return el;
    },
  };
}
