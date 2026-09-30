/**
 * Shelfmarks — the reader's traces, shown on the book on the shelf.
 *
 * The reader keeps progress and ここすき favourites as page IDs (persistence.ts),
 * which the shelf cannot place: locked works hide their page rows from anon
 * reads, so the shelf never learns the order. So the reader also writes this
 * sidecar in positions — "page 23 of 84" — and the shelf draws:
 *   - 付箋: a sticky tab out of the fore-edge for each favourite page,
 *   - しおり: a bookmark card out of the head at the page being read.
 * It is only ever this visitor's own data, in their own browser.
 */

export interface Shelfmarks {
  /** pages in the work when last read */
  total: number;
  /** 0-based index of the page being read, or null before the first turn */
  at: number | null;
  /** 0-based indices of favourite pages */
  favs: number[];
}

const keyFor = (workId: string) => `pressroom:shelfmarks:${workId}`;

export function saveShelfmarks(workId: string, marks: Shelfmarks): void {
  try {
    localStorage.setItem(keyFor(workId), JSON.stringify(marks));
  } catch {
    /* private mode / storage full: the shelf simply shows no marks */
  }
}

export function loadShelfmarks(workId: string): Shelfmarks | null {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(workId)) ?? 'null');
    if (!raw || typeof raw.total !== 'number' || raw.total < 1) return null;
    const idx = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < raw.total;
    return {
      total: raw.total,
      at: idx(raw.at) ? raw.at : null,
      favs: Array.isArray(raw.favs) ? raw.favs.filter(idx) : [],
    };
  } catch {
    return null;
  }
}

export interface Tab {
  /** depth into the book, 0 = just under the front cover, 1 = just over the back */
  depth: number;
  /** vertical slot 0..SLOTS-1, so neighbouring tabs don't hide each other */
  slot: number;
  page: number;
}

export const TAB_SLOTS = 5;
export const MAX_TABS = 12;

/**
 * Where the tabs and the bookmark go. Tabs are ordered by page and walk down
 * the fore-edge slot by slot, like a reader sticking them in as they go; more
 * than MAX_TABS keeps the first ones (the rest would only be a fringe).
 */
export function layoutMarks(m: Shelfmarks): { tabs: Tab[]; bookmark: { depth: number; page: number } | null } {
  const span = Math.max(1, m.total - 1);
  const pages = [...new Set(m.favs)].sort((a, b) => a - b).slice(0, MAX_TABS);
  return {
    tabs: pages.map((p, i) => ({ depth: p / span, slot: i % TAB_SLOTS, page: p + 1 })),
    bookmark: m.at != null && m.at > 0 ? { depth: m.at / span, page: m.at + 1 } : null,
  };
}
