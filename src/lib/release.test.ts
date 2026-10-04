import { describe, expect, it } from 'vitest';
import { releaseDate, releaseLines, releaseMonth, releaseYear, shelfOrder } from './release';

const w = (slug: string, released_on: string | null | undefined) => ({ slug, released_on });

describe('shelfOrder', () => {
  it('stands the books in release order, first release first', () => {
    // the query hands them most recently edited first: vol. 1 was edited last
    const rows = [w('vol1', '2025-11-01'), w('vol2', '2026-03-08')];
    expect(shelfOrder(rows).map((r) => r.slug)).toEqual(['vol1', 'vol2']);
    expect(shelfOrder([...rows].reverse()).map((r) => r.slug)).toEqual(['vol1', 'vol2']);
  });

  it('puts books without a date after the dated ones, in the order they came', () => {
    const rows = [w('a', null), w('b', '2026-01-01'), w('c', undefined), w('d', '2025-01-01'), w('e', 'junk')];
    expect(shelfOrder(rows).map((r) => r.slug)).toEqual(['d', 'b', 'a', 'c', 'e']);
  });

  it('keeps the incoming order for a tie, and never mutates the input', () => {
    const rows = [w('x', '2026-03-08'), w('y', '2026-03-08')];
    const copy = [...rows];
    expect(shelfOrder(rows).map((r) => r.slug)).toEqual(['x', 'y']);
    expect(rows).toEqual(copy);
  });

  it('stands as before when no book has a date yet (before release-date.sql)', () => {
    const rows: { slug: string; released_on?: string | null }[] = [{ slug: 'p' }, { slug: 'q' }];
    expect(shelfOrder(rows).map((r) => r.slug)).toEqual(['p', 'q']);
  });
});

describe('releaseDate / releaseYear / releaseMonth', () => {
  it('reads a Postgres date and nothing else', () => {
    expect(releaseDate('2025-11-01')).toEqual({ y: 2025, m: 11, d: 1 });
    expect(releaseDate(' 2026-03-08 ')).toEqual({ y: 2026, m: 3, d: 8 });
    expect(releaseDate('2026-13-01')).toBeNull();
    expect(releaseDate('')).toBeNull();
    expect(releaseDate(null)).toBeNull();
  });

  it('gives the year for the shelf label and the month for the 奥付', () => {
    expect(releaseYear('2025-11-01')).toBe(2025);
    expect(releaseYear(null)).toBeNull();
    expect(releaseMonth('2025-11-01', 'ja')).toBe('2025年11月');
    expect(releaseMonth('2026-03-08', 'en')).toBe('Mar 2026');
    expect(releaseMonth('2026-03-08', 'th')).toBe('Mar 2026');
  });
});

describe('releaseLines', () => {
  it('splits the printings, first release first', () => {
    const vol1 = { release_label: '2025年11月 Comic Avenue 10（初版）・2026年3月 Comic Square 9（再版）', released_on: '2025-11-01' };
    expect(releaseLines(vol1, 'ja')).toEqual(['2025年11月 Comic Avenue 10（初版）', '2026年3月 Comic Square 9（再版）']);
  });

  it('leaves a single printing whole, and a ・ inside a name alone', () => {
    expect(releaseLines({ release_label: '2026年3月 Comic Square 9' }, 'ja')).toEqual(['2026年3月 Comic Square 9']);
    expect(releaseLines({ release_label: '2026年3月 コミック・スクエア 9' }, 'ja')).toEqual(['2026年3月 コミック・スクエア 9']);
  });

  it('falls back to the first release date as a month, else nothing', () => {
    expect(releaseLines({ release_label: '  ', released_on: '2025-11-01' }, 'ja')).toEqual(['2025年11月']);
    expect(releaseLines({ released_on: '2025-11-01' }, 'en')).toEqual(['Nov 2025']);
    expect(releaseLines({}, 'ja')).toEqual([]);
  });
});
