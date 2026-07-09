import type { PageRec, Sheet } from './types';

export interface ResolveOpts {
  layout: 'single' | 'double';
  /** In double layout, page 1 (the cover) stands alone like a real book. */
  coverSolo: boolean;
}

/**
 * Turn an ordered page list + forced spread pairs + layout setting into the
 * list of "sheets" the reader renders (1 or 2 pages each).
 *
 * Rules:
 * - Pages sort by their fractional sortKey.
 * - A forced pair (shared spreadPairId) ALWAYS emits as one spread sheet, in
 *   every layout — that's the whole point of binding. It anchors at the
 *   earlier member's position, even if a reorder separated the two members.
 * - Double layout: optional solo cover, then greedy two-at-a-time pairing.
 *   A forced spread simply restarts pairing after it (parity may shift; no
 *   blank filler pages).
 * - pages[] within a sheet is in READING order — the left/right slot is the
 *   renderer's job (RTL puts pages[0] on the right).
 */
export function resolveSheets(pages: PageRec[], opts: ResolveOpts): Sheet[] {
  const ordered = [...pages].sort((a, b) =>
    a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0,
  );

  // Locate both members of every valid pair (exactly two pages sharing an id).
  const byPair = new Map<string, PageRec[]>();
  for (const p of ordered) {
    if (p.spreadPairId) {
      const list = byPair.get(p.spreadPairId) ?? [];
      list.push(p);
      byPair.set(p.spreadPairId, list);
    }
  }

  const sheets: Sheet[] = [];
  const consumed = new Set<string>();
  let pending: PageRec | null = null; // first half of a double-layout pair

  const flushPending = () => {
    if (pending) {
      sheets.push({ kind: 'single', pages: [pending] });
      pending = null;
    }
  };

  for (let i = 0; i < ordered.length; i++) {
    const page = ordered[i];
    if (consumed.has(page.id)) continue;

    const partners = page.spreadPairId ? byPair.get(page.spreadPairId) : undefined;
    if (partners && partners.length === 2) {
      // Forced spread — atomic in every layout, anchored here.
      flushPending();
      const [a, b] = partners;
      sheets.push({ kind: 'spread', pages: [a, b], forced: true });
      consumed.add(a.id);
      consumed.add(b.id);
      continue;
    }

    consumed.add(page.id);

    if (opts.layout === 'single') {
      sheets.push({ kind: 'single', pages: [page] });
      continue;
    }

    // Double layout
    if (sheets.length === 0 && opts.coverSolo) {
      sheets.push({ kind: 'single', pages: [page] });
      continue;
    }
    if (pending) {
      sheets.push({ kind: 'spread', pages: [pending, page], forced: false });
      pending = null;
    } else {
      pending = page;
    }
  }
  flushPending();

  return sheets;
}

/** Index of the sheet containing a page id (for progress restore); -1 if gone. */
export function sheetIndexOf(sheets: Sheet[], pageId: string): number {
  return sheets.findIndex((s) => s.pages.some((p) => p.id === pageId));
}
