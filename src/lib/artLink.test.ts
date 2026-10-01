import { describe, expect, it } from 'vitest';
import { artKey, artPath, findArt, galleryOrder, shortHash } from './artLink';

const works = [
  { id: 'cd30a048-51d0-485b-95b3-babaed59ae75', title: 'a' },
  { id: '0f1e2d3c-0000-4000-8000-000000000001', title: 'b' },
  { id: '0f1e2d3c-ffff-4000-8000-000000000002', title: 'c' },
];

describe('artKey / artPath', () => {
  it('is the first 8 hex digits of the uuid', () => {
    expect(artKey(works[0].id)).toBe('cd30a048');
    expect(artPath(artKey(works[0].id))).toBe('/asu?art=cd30a048');
  });
});

describe('findArt', () => {
  it('finds a piece by its key, case-insensitively', () => {
    expect(findArt(works, 'cd30a048')?.title).toBe('a');
    expect(findArt(works, 'CD30A048')?.title).toBe('a');
  });

  it('takes a longer key when two pieces share the first eight digits', () => {
    expect(findArt(works, '0f1e2d3cffff')?.title).toBe('c');
    expect(findArt(works, '0f1e2d3c0000')?.title).toBe('b');
  });

  it('ignores junk, short, empty and unknown keys', () => {
    for (const k of [null, undefined, '', 'cd30', 'zzzzzzzz', "cd30a048'--", 'deadbeef']) expect(findArt(works, k)).toBeNull();
  });
});

describe('shortHash', () => {
  it('is stable and changes with the input', () => {
    expect(shortHash('x/med.webp')).toBe(shortHash('x/med.webp'));
    expect(shortHash('x/med.webp')).not.toBe(shortHash('y/med.webp'));
  });
});

describe('galleryOrder', () => {
  it('leads with the featured piece, else the first, and keeps the rest in order', () => {
    const w = [
      { id: '1', featured: false },
      { id: '2', featured: true },
      { id: '3', featured: false },
    ];
    expect(galleryOrder(w).map((x) => x.id)).toEqual(['2', '1', '3']);
    expect(galleryOrder(w.map((x) => ({ ...x, featured: false }))).map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(galleryOrder([])).toEqual([]);
  });
});
