/**
 * The site's languages, in switcher order.
 *
 * Deliberately runes-free and dependency-free: Astro frontmatter (server) imports
 * this, and `i18n.svelte.ts` cannot be imported there — its `$state` needs the
 * Svelte compiler.
 *
 * Japanese is the site's default voice. Thai is carried over from the retired
 * asu-art one-pager and is **only** offered on `/asu` and the homepage artist
 * teaser; the reader, library and studio chrome stay JA/EN and fall back to
 * English for a Thai visitor (see `I18n.t()`).
 */
export const LANGS = ['ja', 'en', 'th'] as const;

export type Lang = (typeof LANGS)[number];

/** Shown on the language bar — each in its own script, never translated. */
export const LANG_LABEL: Record<Lang, string> = {
  ja: '日本語',
  en: 'ENGLISH',
  th: 'ไทย',
};

export const DEFAULT_LANG: Lang = 'ja';

/** Shared localStorage key — one language choice for the whole site. */
export const LANG_STORAGE_KEY = 'pressroom:lang';

/**
 * Fired on `document` whenever the language changes, carrying the new Lang.
 * Svelte islands read the rune; static Astro markup listens for this.
 */
export const LANG_EVENT = 'pressroom:lang';

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}
