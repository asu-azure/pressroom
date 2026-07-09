import type { Chapter, PageRow } from './types';

const byKey = <T extends { sort_key: string }>(a: T, b: T) =>
  a.sort_key < b.sort_key ? -1 : a.sort_key > b.sort_key ? 1 : 0;

export function sortedChapters(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort(byKey);
}

/**
 * Display order of the whole book: unassigned pages first ("front matter"),
 * then each chapter's pages, chapters by their own sort key. Page sort keys
 * form one global keyspace; the arranger rewrites them on every drop so the
 * global key order converges on this flattened order.
 */
export function flattenPages(pages: PageRow[], chapters: Chapter[]): PageRow[] {
  const buckets = new Map<string | null, PageRow[]>();
  for (const p of pages) {
    const k = p.chapter_id ?? null;
    buckets.set(k, [...(buckets.get(k) ?? []), p]);
  }
  const out: PageRow[] = [];
  for (const key of [null, ...sortedChapters(chapters).map((c) => c.id)] as (string | null)[]) {
    out.push(...(buckets.get(key) ?? []).sort(byKey));
  }
  return out;
}

/**
 * Fractional-key bounds for appending at the END of a chapter (or of the
 * unassigned front matter when chapterId is null). Falls back to the global
 * end if the keyspace hasn't converged on the flattened order yet.
 */
export function appendBounds(
  pages: PageRow[],
  chapters: Chapter[],
  chapterId: string | null,
): { afterKey: string | null; beforeKey: string | null } {
  const flat = flattenPages(pages, chapters);
  if (flat.length === 0) return { afterKey: null, beforeKey: null };

  let lastInTarget = -1;
  for (let i = 0; i < flat.length; i++) {
    if ((flat[i].chapter_id ?? null) === chapterId) lastInTarget = i;
  }
  if (lastInTarget === -1) {
    // Empty section: insert after the last page of everything displayed
    // before it, i.e. before the first page of any later section.
    const order = [null, ...sortedChapters(chapters).map((c) => c.id)] as (string | null)[];
    const targetPos = order.indexOf(chapterId);
    const firstAfter = flat.find((p) => order.indexOf(p.chapter_id ?? null) > targetPos);
    const lastBefore = [...flat]
      .reverse()
      .find((p) => order.indexOf(p.chapter_id ?? null) < targetPos);
    const afterKey = lastBefore?.sort_key ?? null;
    const beforeKey = firstAfter?.sort_key ?? null;
    if (afterKey !== null && beforeKey !== null && afterKey >= beforeKey) {
      return { afterKey: flat[flat.length - 1].sort_key, beforeKey: null };
    }
    return { afterKey, beforeKey };
  }

  const afterKey = flat[lastInTarget].sort_key;
  const beforeKey = lastInTarget + 1 < flat.length ? flat[lastInTarget + 1].sort_key : null;
  if (beforeKey !== null && afterKey >= beforeKey) {
    return { afterKey: flat[flat.length - 1].sort_key, beforeKey: null };
  }
  return { afterKey, beforeKey };
}
