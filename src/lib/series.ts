/**
 * A series is every published work sharing a `series_title`
 * (supabase/book-info.sql). The overview lists the run and links the
 * neighbours of the book being viewed. Pure; tested in series.test.ts.
 */

export interface SeriesEntry {
  id: string;
  slug: string;
  series_order?: number | null;
}

export interface SeriesRun<T> {
  list: T[];
  prev: T | null;
  next: T | null;
}

/**
 * What the shelf label and the overview call a book: its place in a series
 * (series.main 本編 / series.side 外伝) when it has one, else its status. A book
 * in a series is never 読切 — both books said so, and it read as "unrelated".
 * A series book with no kind set says nothing rather than 読切.
 */
export function kindKey(
  work: { status: string; series_title?: string | null; series_kind?: 'main' | 'side' | null },
): string | null {
  if (work.series_title?.trim()) return work.series_kind ? `series.${work.series_kind}` : null;
  return `status.${work.status}`;
}

/** Ordered by series_order (unset last), then slug — stable for ties. */
export function seriesRun<T extends SeriesEntry>(entries: T[], currentId: string): SeriesRun<T> {
  const order = (e: T) => (typeof e.series_order === 'number' && Number.isFinite(e.series_order) ? e.series_order : Infinity);
  const list = [...entries].sort((a, b) => order(a) - order(b) || a.slug.localeCompare(b.slug));
  // one book is not a series; a book outside the list has no neighbours
  if (list.length < 2) return { list: [], prev: null, next: null };
  const i = list.findIndex((e) => e.id === currentId);
  return {
    list,
    prev: i > 0 ? list[i - 1] : null,
    next: i >= 0 && i < list.length - 1 ? list[i + 1] : null,
  };
}
