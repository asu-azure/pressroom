/**
 * Small decisions of the page reader's chrome, kept pure so they can be tested
 * (readerUi.test.ts): which layout a book opens in, and what the translation
 * switch says.
 */
import type { Layout, Work } from './types';
import { langLabel } from './bookInfo';

type UiLang = 'ja' | 'en' | 'th';
type T = (key: string) => string;

/** Phones held upright, and narrow windows — the same rule FlipSurface sizes pages by. */
export const NARROW_QUERY = '(max-width: 700px), (orientation: portrait)';

/**
 * The layout a book opens in. The reader's own pick always wins. Otherwise a
 * narrow or portrait screen gets single pages — a spread there is two stamps,
 * and the switch hid two taps deep — and a wide one gets the work's default.
 */
export function openingLayout(opts: { chosen: Layout | null; workDefault: Layout; narrow: boolean }): Layout {
  if (opts.chosen) return opts.chosen;
  return opts.narrow ? 'single' : opts.workDefault;
}

/**
 * The layout the reader picked, if any, from loaded settings (defaults ← saved).
 * `layoutChosen` marks a pick made since it existed; before it, settings were
 * saved whole, so a saved layout that differs from the work's default can only be
 * a pick — while one equal to it may just be the default written back (the phone
 * that opened double and saved it with a translation change).
 */
export function pickedLayout(saved: { layout: Layout; layoutChosen?: boolean }, workDefault: Layout): Layout | null {
  return saved.layoutChosen || saved.layout !== workDefault ? saved.layout : null;
}

/**
 * A page picture's URL for a given try (SheetImage): as stored the first time,
 * then with `?r=<n>` so a retry can't be answered by a cached failure.
 */
export function bust(url: string, attempt: number): string {
  if (!(attempt > 0)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}r=${attempt}`;
}

/** A page picture still loading after this long counts as failed (and is retried once). */
export const LOAD_TIMEOUT = 30_000;

/**
 * The page reader's zoom steps, as a share of the fitted page (1 = fit). The
 * bar's − ＋ walk them; pinch and ctrl/⌘+wheel go anywhere in between, so a step
 * goes to the next stop past the current scale. Max = FlipSurface's MAX_SCALE.
 */
export const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4] as const;

export function zoomStep(scale: number, dir: 1 | -1): number {
  const eps = 0.02;
  if (dir > 0) return ZOOM_STEPS.find((z) => z > scale + eps) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((z) => z < scale - eps) ?? 1;
}

/** 「150%」 — the zoom as the bar shows it. */
export const zoomLabel = (scale: number): string => `${Math.round(scale * 100)}%`;

/**
 * Whether a turn is drawn as paper (curl.ts) or slides. One page on screen —
 * single layout, or a lone page in double — slides in reading direction: a door
 * swinging on its spine looked odd on a phone (the owner). Spreads keep the curl,
 * and the closed cover keeps its opening; PAGE CURL off, reduced motion, a jump
 * or a zoomed page always slide (or, reduced, jump).
 */
export function turnStyle(opts: {
  layout: Layout;
  curl: boolean;
  reduced: boolean;
  /** pages on the current sheet */
  pages: number;
  /** the turn opens or closes the book's closed cover (double layout) */
  coverTurn: boolean;
}): 'curl' | 'door' | 'slide' {
  if (!opts.curl || opts.reduced || opts.layout === 'single') return 'slide';
  if (opts.coverTurn) return 'door';
  return opts.pages > 1 ? 'curl' : 'slide';
}

/**
 * The 「このパートは小説です」 card in the page reader: on the first page of a
 * novel part reached in this session, when the novel exists as text — until the
 * reader dismisses it (remembered for the session).
 */
export function novelCardDue(opts: { onNovelPart: boolean; hasText: boolean; dismissed: boolean }): boolean {
  return opts.onNovelPart && opts.hasText && !opts.dismissed;
}

/**
 * The translation switch's label, which is its state: 「翻訳：日本語」 while the
 * translation shows, 「原文：タイ語」 while the original does (one shape for both, and
 * the narrowest that keeps a 390-wide phone's bar on one row). The translated
 * language is the reader's own when the book has it, else the first it has.
 */
export function translationLabel(
  work: Pick<Work, 'book_lang' | 'translations'>,
  on: boolean,
  ui: UiLang,
  t: T,
): string {
  const orig = work.book_lang?.trim() || null;
  if (on) {
    const langs = (work.translations ?? []).filter((c) => c && c !== orig);
    const code = langs.includes(ui) ? ui : langs[0];
    if (code) return t('rd.transOn').replace('{lang}', langLabel(code, ui));
    return `${t('rd.translate')}${ui === 'ja' ? '：' : ': '}${t('rd.on')}`;
  }
  return orig ? t('rd.transOff').replace('{lang}', langLabel(orig, ui)) : t('rd.original');
}
