/**
 * /music — the rack (routes/music/index.astro). Each stage holds its keychain's markup in a
 * <template>; the charms are hung one at a time once the page is quiet, about 300 ms apart, each
 * dropping in with a small push. A song that is out is a link to its page — a click that was not
 * a drag follows it (dangle.ts swallows drags), and the tapped charm carries the view transition
 * into the song page's keychain (`kc-hero`). A coming charm only swings.
 */
import { dangle } from '../dangle';
import { hangWhenQuiet } from '../hangWhenQuiet';
import { applyCopy, readCopyPayload } from '../../lib/siteCopyClient';
import { DEFAULT_LANG, isLang, LANG_EVENT, LANG_STORAGE_KEY, type Lang } from '../../lib/lang';

export function initRack() {
  const root = document.getElementById('rack');
  if (!root) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- copy / language (same contract as /asu) ------------------------------
  const bundle = readCopyPayload();
  const langBtns = [...document.querySelectorAll<HTMLButtonElement>('.rack__langs [data-lang]')];
  const setLang = (next: Lang) => {
    if (!bundle) return;
    applyCopy(bundle, next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
    langBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === next)));
    document.dispatchEvent(new CustomEvent<Lang>(LANG_EVENT, { detail: next }));
  };
  if (bundle) {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (isLang(saved) && saved !== DEFAULT_LANG) setLang(saved);
    } catch {
      /* default stays */
    }
    document.querySelector('.rack__langs')?.addEventListener('click', (e) => {
      const next = (e.target as Element | null)?.closest<HTMLElement>('[data-lang]')?.dataset.lang;
      if (isLang(next)) setLang(next);
    });
  }

  // --- hanging, one by one ---------------------------------------------------
  const stages = [...root.querySelectorAll<HTMLElement>('[data-rack-stage]')];
  let queue = Promise.resolve();
  const hang = (stage: HTMLElement) => {
    const tpl = stage.querySelector('template');
    if (!tpl || stage.classList.contains('is-hung')) return;
    stage.append(tpl.content.cloneNode(true));
    tpl.remove();
    stage.classList.add('is-hung');
    const link = stage.closest<HTMLAnchorElement>('[data-rack-link]');
    const kc = dangle(stage, {
      // a coming charm: a tap is a push, nothing more
      onPress: link ? undefined : (e) => kc.nudge(e.clientX < stage.getBoundingClientRect().left + stage.clientWidth / 2 ? 70 : -70, 110),
    });
    if (!reduced) kc.nudge(40 - Math.random() * 80, 60 - Math.random() * 120);
  };

  stages.forEach((stage, i) => {
    if (reduced) return hang(stage);
    hangWhenQuiet(
      stage,
      // in order, at least 300 ms apart, so the GPU pays for one charm at a time
      () => (queue = queue.then(() => new Promise((r) => setTimeout(() => (hang(stage), r()), 300)))),
      300 + i * 120,
    );
  });

  // --- the tapped charm becomes the song page's keychain ----------------------
  root.querySelectorAll<HTMLAnchorElement>('[data-rack-link]').forEach((a) =>
    a.addEventListener('click', (e) => {
      if (e.defaultPrevented) return;
      stages.forEach((s) => (s.style.viewTransitionName = ''));
      const stage = a.querySelector<HTMLElement>('[data-rack-stage]');
      if (stage) stage.style.viewTransitionName = 'kc-hero';
    }),
  );
  // Coming back (bfcache), no charm should still claim the name.
  addEventListener('pageshow', () => stages.forEach((s) => (s.style.viewTransitionName = '')));
}
