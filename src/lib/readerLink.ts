/**
 * Links into the readers by what a visitor can name — a page number (the
 * timeline's "p.66", `?n=`) — and the way back in after the lock (`?go=`).
 * Pure; tested in readerLink.test.ts.
 *
 * A page id is what the readers deep-link by (`?p=`), but a locked book hides its
 * page rows from anyone who hasn't unlocked it, so the timeline can't know them.
 * And a locked reader sends its visitor to the overview, where the gate is —
 * `?go=` carries where they were going, so the gate can take them there.
 */

/** The n-th page (1-based, blank leaves counted, as every page number on the site is). */
export function pageByNumber(n: string | number | null | undefined, ordered: { id: string }[]): string | null {
  if (n === null || n === undefined || n === '') return null;
  const i = Number(n);
  if (!Number.isInteger(i) || i < 1 || i > ordered.length) return null;
  return ordered[i - 1].id;
}

/** The overview a locked reader goes back to, carrying the reader's own address. */
export function lockedOverview(slug: string, path: string, search: string): string {
  return `/w/${slug}?go=${encodeURIComponent(path + search)}`;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Where to go once the gate opens: only this book's own readers, as a path —
 * never another site, another book or any other page (it arrives in the URL).
 */
export function lockReturn(go: string | null | undefined, slug: string): string | null {
  if (!go || go.length > 300 || /[\s\\#]/.test(go)) return null;
  const own = new RegExp(`^/w/${escape(slug)}/(?:read|novel)(?:\\?[^?/]*)?$`);
  return own.test(go) ? go : null;
}
