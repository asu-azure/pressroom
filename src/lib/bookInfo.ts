/**
 * The overview's 奥付 row: original language, translations, format, release —
 * from the optional book-info columns (supabase/book-info.sql). Empty fields
 * are left out, so a work without them shows no row at all. Pure; tested in
 * bookInfo.test.ts.
 */
import type { Work } from './types';

export interface InfoItem {
  key: 'lang' | 'trans' | 'format' | 'release';
  label: string;
  value: string;
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

type InfoFields = Pick<Work, 'book_lang' | 'translations' | 'formats' | 'release_label'>;

export function bookInfo(work: InfoFields, ui: UiLang, t: T): InfoItem[] {
  const sep = ui === 'ja' ? '・' : ' / ';
  const items: InfoItem[] = [];
  const lang = work.book_lang?.trim();
  if (lang) {
    items.push({ key: 'lang', label: t('ov.origLang'), value: langName(lang, ui) });
    // only meaningful next to the original language: "翻訳 なし" tells a
    // Japanese visitor the Thai book has no Japanese yet
    const trans = (work.translations ?? []).filter((c) => c && c !== lang);
    items.push({
      key: 'trans',
      label: t('rd.translate'),
      value: trans.length ? trans.map((c) => langName(c, ui)).join(sep) : t('ov.transNone'),
    });
  }
  const formats = (work.formats ?? []).filter(Boolean);
  if (formats.length) items.push({ key: 'format', label: t('ov.format'), value: formats.map((f) => t(`fmt.${f}`)).join(' + ') });
  const release = work.release_label?.trim();
  if (release) items.push({ key: 'release', label: t('ov.release'), value: release });
  return items;
}
