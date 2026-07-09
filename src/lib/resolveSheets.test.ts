import { describe, it, expect } from 'vitest';
import { resolveSheets, sheetIndexOf } from './resolveSheets';
import type { PageRec } from './types';

let n = 0;
function page(sortKey: string, spreadPairId: string | null = null): PageRec {
  n += 1;
  return {
    id: `p${n}`,
    sortKey,
    spreadPairId,
    width: 1131,
    height: 1600,
    fullUrl: '',
    medUrl: '',
    thumbUrl: '',
    note: null,
  };
}

function kinds(pages: PageRec[], layout: 'single' | 'double', coverSolo = true) {
  return resolveSheets(pages, { layout, coverSolo }).map((s) =>
    s.kind === 'spread' ? (s.forced ? 'F' : 'D') : 'S',
  );
}

describe('resolveSheets', () => {
  it('single layout: one sheet per page', () => {
    expect(kinds([page('a'), page('b'), page('c')], 'single')).toEqual(['S', 'S', 'S']);
  });

  it('forced pair joins even in single layout', () => {
    expect(kinds([page('a'), page('b', 'x'), page('c', 'x'), page('d')], 'single')).toEqual([
      'S',
      'F',
      'S',
    ]);
  });

  it('double layout: solo cover then greedy pairs', () => {
    // 5 pages: cover, (2,3), (4,5)
    expect(kinds([page('a'), page('b'), page('c'), page('d'), page('e')], 'double')).toEqual([
      'S',
      'D',
      'D',
    ]);
  });

  it('double layout without coverSolo pairs from page 1', () => {
    expect(kinds([page('a'), page('b'), page('c')], 'double', false)).toEqual(['D', 'S']);
  });

  it('forced spread shifts parity without blank fillers', () => {
    // cover, p2 alone (flushed), forced(3,4), (5,6)
    const p = [page('a'), page('b'), page('c', 'x'), page('d', 'x'), page('e'), page('f')];
    expect(kinds(p, 'double')).toEqual(['S', 'S', 'F', 'D']);
  });

  it('forced pair separated by a reorder is pulled together at the earlier position', () => {
    const a = page('a', 'x');
    const mid = page('b');
    const b = page('c', 'x');
    const sheets = resolveSheets([a, mid, b], { layout: 'single', coverSolo: true });
    expect(sheets[0]).toMatchObject({ kind: 'spread', forced: true });
    expect(sheets[0].pages.map((p) => p.id)).toEqual([a.id, b.id]);
    expect(sheets[1].pages[0].id).toBe(mid.id);
  });

  it('orphaned pair id (one member deleted) degrades to a single', () => {
    expect(kinds([page('a'), page('b', 'x')], 'single')).toEqual(['S', 'S']);
  });

  it('unsorted input is sorted by sortKey', () => {
    const p1 = page('c');
    const p2 = page('a');
    const sheets = resolveSheets([p1, p2], { layout: 'single', coverSolo: true });
    expect(sheets[0].pages[0].id).toBe(p2.id);
  });

  it('sheetIndexOf finds the sheet containing a page', () => {
    const p = [page('a'), page('b', 'x'), page('c', 'x')];
    const sheets = resolveSheets(p, { layout: 'single', coverSolo: true });
    expect(sheetIndexOf(sheets, p[2].id)).toBe(1);
    expect(sheetIndexOf(sheets, 'nope')).toBe(-1);
  });
});
