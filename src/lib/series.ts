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
