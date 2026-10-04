/**
 * Release order — the shelf, the timeline's 刊行順 and the overview's 奥付 —
 * from `works.released_on` (the first release, supabase/release-date.sql) and
 * `works.release_label` (free text naming every printing, book-info.sql).
 * Pure; tested in release.test.ts.
 */
import type { Work } from './types';

type UiLang = 'ja' | 'en' | 'th';

export interface ReleaseDate {
  y: number;
  m: number;
  d: number;
}

/** A real YYYY-MM-DD (as Postgres sends a `date`), else null: junk and blanks are no date. */
export function releaseDate(v: string | null | undefined): ReleaseDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof v === 'string' ? v.trim() : '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

const keyOf = (v: string | null | undefined) => {
  const r = releaseDate(v);
  return r ? r.y * 10000 + r.m * 100 + r.d : null;
};

/**
 * Shelf order: first released first. Books without a date follow them, and
 * ties and undated books keep the order they came in — the query's, most
 * recently edited first, which is how the shelf stood before there were dates.
 */
export function shelfOrder<T extends Pick<Work, 'released_on'>>(works: T[]): T[] {
  return works
    .map((w, i) => ({ w, i, k: keyOf(w.released_on) }))
    .sort((a, b) => {
      if (a.k !== null && b.k !== null && a.k !== b.k) return a.k - b.k;
      if ((a.k === null) !== (b.k === null)) return a.k === null ? 1 : -1;
      return a.i - b.i;
    })
    .map((x) => x.w);
}

/** The year on the shelf label, or null without a date. */
export function releaseYear(v: string | null | undefined): number | null {
  return releaseDate(v)?.y ?? null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2025年11月 · Nov 2025 — a month is what a doujin event release is known by. */
export function releaseMonth(v: string | null | undefined, ui: UiLang): string | null {
  const r = releaseDate(v);
  if (!r) return null;
  return ui === 'ja' ? `${r.y}年${r.m}月` : `${MONTHS[r.m - 1]} ${r.y}`;
}

/**
 * The release as lines, first printing first: the author's label split where a
 * new date starts (「2025年11月 …（初版）・2026年3月 …（再版）」 → two lines), or —
 * with no label — the first release date as a month. Empty when there is neither.
 */
export function releaseLines(work: Pick<Work, 'release_label' | 'released_on'>, ui: UiLang): string[] {
  const label = work.release_label?.trim();
  if (label) {
    return label
      .split(/\s*(?:[・･]|\s\/\s)\s*(?=\d{4}\s*(?:年|[-./]))/u)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const month = releaseMonth(work.released_on, ui);
  return month ? [month] : [];
}
