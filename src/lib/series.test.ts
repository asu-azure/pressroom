import { describe, expect, it } from 'vitest';
import { kindKey, seriesRun } from './series';

const main = { id: 'a', slug: 'bdlfs-seasparkles', series_order: 1 };
const side = { id: 'b', slug: 'bdlfs-skyafterrain', series_order: 2 };

describe('seriesRun', () => {
  it('links the main story and its side story both ways', () => {
    expect(seriesRun([side, main], 'a')).toEqual({ list: [main, side], prev: null, next: side });
    expect(seriesRun([side, main], 'b')).toEqual({ list: [main, side], prev: main, next: null });
  });

  it('puts unordered books last and breaks ties by slug', () => {
    const loose = { id: 'c', slug: 'a-loose', series_order: null };
    const half = { id: 'd', slug: 'bonus', series_order: 1.5 };
    const tie = { id: 'e', slug: 'aaa', series_order: 2 };
    expect(seriesRun([loose, side, half, main, tie], 'd').list.map((e) => e.id)).toEqual(['a', 'd', 'e', 'b', 'c']);
  });

  it('is not a series with one book, and has no neighbours for an outsider', () => {
    expect(seriesRun([main], 'a')).toEqual({ list: [], prev: null, next: null });
    expect(seriesRun([main, side], 'zzz')).toMatchObject({ prev: null, next: null });
  });
});

describe('kindKey', () => {
  it('calls a book in a series 本編 / 外伝, never 読切', () => {
    expect(kindKey({ status: 'oneshot', series_title: '扉の向こうはヒマワリ畑', series_kind: 'main' })).toBe('series.main');
    expect(kindKey({ status: 'oneshot', series_title: '扉の向こうはヒマワリ畑', series_kind: 'side' })).toBe('series.side');
    expect(kindKey({ status: 'oneshot', series_title: '扉の向こうはヒマワリ畑', series_kind: null })).toBeNull();
  });

  it('keeps the status for a book on its own', () => {
    expect(kindKey({ status: 'oneshot' })).toBe('status.oneshot');
    expect(kindKey({ status: 'ongoing', series_title: '  ', series_kind: 'main' })).toBe('status.ongoing');
  });
});
