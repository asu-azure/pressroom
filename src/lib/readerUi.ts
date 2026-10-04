/**
 * Small decisions of the page reader's chrome, kept pure so they can be tested
 * (readerUi.test.ts): which layout a book opens in, and what the translation
 * switch says.
 */
import type { Layout, Work } from './types';
import { langName } from './bookInfo';

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
    if (code) return t('rd.transOn').replace('{lang}', langName(code, ui));
    return `${t('rd.translate')}${ui === 'ja' ? '：' : ': '}${t('rd.on')}`;
  }
  return orig ? t('rd.transOff').replace('{lang}', langName(orig, ui)) : t('rd.original');
}
