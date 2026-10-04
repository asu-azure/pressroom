/**
 * The overview's 奥付 row: original language, translations, format, release —
 * from the optional book-info columns (supabase/book-info.sql). Empty fields
 * are left out, so a work without them shows no row at all. Pure; tested in
 * bookInfo.test.ts.
 */
import type { Work } from './types';
import { releaseLines } from './release';

export interface InfoItem {
  key: 'lang' | 'trans' | 'format' | 'release';
  label: string;
  value: string;
  /** the release, one printing per line — first release (初版) first (lib/release.ts) */
  lines?: string[];
}

/** The chrome speaks ja or en (Thai visitors read the English chrome). */
type UiLang = 'ja' | 'en' | 'th';
type T = (key: string) => string;

const names = new Map<string, Intl.DisplayNames | null>();

/** A language code in the reader's UI language: 'th' → タイ語 / Thai. */
export function langName(code: string, ui: UiLang): string {
  const loc = ui === 'ja' ? 'ja' : 'en';
  if (!names.has(loc)) {
    try {
      names.set(loc, new Intl.DisplayNames([loc], { type: 'language' }));
    } catch {
      names.set(loc, null);
    }
  }
  try {
    return names.get(loc)?.of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase(); // not a valid language tag
  }
}

/**
 * A language name for a chrome LABEL: the English chrome speaks in capitals
 * (「IN JAPANESE」, 「THAI ONLY」), so the name is capitalised with it — a mixed
 * 「IN Japanese」 read as a mistake. Japanese is unchanged. Prose uses langName.
 */
export function langLabel(code: string, ui: UiLang): string {
  const name = langName(code, ui);
  return ui === 'ja' ? name : name.toUpperCase();
}

type InfoFields = Pick<Work, 'book_lang' | 'translations' | 'formats' | 'release_label' | 'released_on' | 'novel_langs'>;

export function bookInfo(work: InfoFields, ui: UiLang, t: T): InfoItem[] {
  const sep = ui === 'ja' ? '・' : ' / ';
  const items: InfoItem[] = [];
  const lang = work.book_lang?.trim();
  if (lang) {
    items.push({ key: 'lang', label: t('ov.origLang'), value: langLabel(lang, ui) });
    // only meaningful next to the original language: "翻訳 なし" tells a
    // Japanese visitor the Thai book has no Japanese yet
    const trans = (work.translations ?? []).filter((c) => c && c !== lang);
    // ...but a novel part that reads as text in another language is a translation
    // too: vol. 2 said なし while its whole novel reads in Japanese
    const novelOnly = (work.novel_langs ?? []).filter((c) => c && c !== lang && !trans.includes(c));
    const part = (name: string) => (ui === 'ja' ? `${name}（${t('ov.novelPart')}）` : `${name} (${t('ov.novelPart')})`);
    const names = [...trans.map((c) => langLabel(c, ui)), ...novelOnly.map((c) => part(langLabel(c, ui)))];
    items.push({
      key: 'trans',
      label: t('rd.translate'),
      value: names.length ? names.join(sep) : t('ov.transNone'),
    });
  }
  const formats = (work.formats ?? []).filter(Boolean);
  if (formats.length) items.push({ key: 'format', label: t('ov.format'), value: formats.map((f) => t(`fmt.${f}`)).join(' + ') });
  // the author's label, each printing on its own line; without one, the first
  // release date (works.released_on) as a month
  const lines = releaseLines(work, ui);
  if (lines.length) items.push({ key: 'release', label: t('ov.release'), value: lines.join(sep), lines });
  return items;
}
