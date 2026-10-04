import { describe, it, expect } from 'vitest';
import { layoutMarks, MAX_TABS, TAB_SLOTS } from './shelfmarks';

describe('layoutMarks', () => {
  it('places tabs by page, first page at the front, last at the back', () => {
    const { tabs } = layoutMarks({ total: 11, at: null, favs: [10, 0, 5] });
    expect(tabs.map((t) => [t.page, t.depth])).toEqual([
      [1, 0],
      [6, 0.5],
      [11, 1],
    ]);
  });

  it('walks tabs down the edge slot by slot and dedupes', () => {
    const { tabs } = layoutMarks({ total: 50, at: null, favs: [3, 3, 1, 2, 4, 5, 6, 7] });
    expect(tabs.map((t) => t.page)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(tabs.map((t) => t.slot)).toEqual([0, 1, 2, 3, 4, 0, 1]);
    expect(Math.max(...tabs.map((t) => t.slot))).toBeLessThan(TAB_SLOTS);
  });

  it('caps the fringe', () => {
    const favs = Array.from({ length: 30 }, (_, i) => i);
    expect(layoutMarks({ total: 30, at: null, favs }).tabs).toHaveLength(MAX_TABS);
  });

  it('only bookmarks a book that has been opened past its first page', () => {
    expect(layoutMarks({ total: 84, at: 0, favs: [] }).bookmark).toBeNull();
    expect(layoutMarks({ total: 84, at: null, favs: [] }).bookmark).toBeNull();
    expect(layoutMarks({ total: 84, at: 22, favs: [] }).bookmark).toEqual({ depth: 22 / 83, page: 23 });
  });

  it('survives a one-page work', () => {
    expect(layoutMarks({ total: 1, at: null, favs: [0] }).tabs[0].depth).toBe(0);
  });
});
