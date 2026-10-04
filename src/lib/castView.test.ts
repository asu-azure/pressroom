import { describe, expect, it } from 'vitest';
import { castParts, galleryOf, portraitOf, splitName, tiltOf } from './castView';
import type { Character } from './types';

const ch = (id: string, extra: Partial<Character> = {}): Character => ({ id, name: id, color: '#000', ...extra });

describe('splitName', () => {
  it('splits the Studio’s 「JA/EN」 form', () => {
    expect(splitName('タイム/Time')).toEqual({ ja: 'タイム', en: 'Time' });
    expect(splitName('マスター・フランク／Master Frank')).toEqual({ ja: 'マスター・フランク', en: 'Master Frank' });
    expect(splitName(' サン / Sun ')).toEqual({ ja: 'サン', en: 'Sun' });
  });
  it('a name without a slash is all Japanese', () => {
    expect(splitName('タイムの母親')).toEqual({ ja: 'タイムの母親', en: '' });
  });
  it('an empty half falls back to the other', () => {
    expect(splitName('/Time')).toEqual({ ja: 'Time', en: '' });
    expect(splitName('タイム/')).toEqual({ ja: 'タイム', en: '' });
  });
});

describe('castParts', () => {
  it('uses the main flags when any is set', () => {
    const cast = [ch('a'), ch('b', { main: true }), ch('c'), ch('d', { main: true })];
    const { main, crew } = castParts(cast);
    expect(main.map((c) => c.id)).toEqual(['b', 'd']);
    expect(crew.map((c) => c.id)).toEqual(['a', 'c']);
  });
  it('an unmarked cast leads with its first two', () => {
    const { main, crew } = castParts([ch('a'), ch('b'), ch('c')]);
    expect(main.map((c) => c.id)).toEqual(['a', 'b']);
    expect(crew.map((c) => c.id)).toEqual(['c']);
  });
  it('a cast of one is all main', () => {
    expect(castParts([ch('a')])).toEqual({ main: [ch('a')], crew: [] });
  });
});

describe('portraitOf', () => {
  it('prefers the portrait, colour unless marked mono', () => {
    expect(portraitOf(ch('a', { portraitUrl: 'p', images: [{ url: 'g' }] }))).toEqual({ url: 'p', mono: false });
    expect(portraitOf(ch('a', { portraitUrl: 'p', portraitMono: true }))).toEqual({ url: 'p', mono: true });
  });
  it('falls back to the gallery, then the icon — tinted, as old profiles are manga panels', () => {
    expect(portraitOf(ch('a', { images: [{ url: 'g' }], iconUrl: 'i' }))).toEqual({ url: 'g', mono: true });
    expect(portraitOf(ch('a', { iconUrl: 'i' }))).toEqual({ url: 'i', mono: true });
    expect(portraitOf(ch('a'))).toBeNull();
  });
});

describe('galleryOf', () => {
  it('puts the portrait first without repeating it', () => {
    const c = ch('a', { portraitUrl: 'p', images: [{ url: 'g1' }, { url: 'p' }, { url: 'g2' }] });
    expect(galleryOf(c).map((im) => im.url)).toEqual(['p', 'g1', 'g2']);
  });
  it('is the gallery when there is no portrait, else the icon', () => {
    expect(galleryOf(ch('a', { images: [{ url: 'g' }] })).map((im) => im.url)).toEqual(['g']);
    expect(galleryOf(ch('a', { iconUrl: 'i' })).map((im) => im.url)).toEqual(['i']);
    expect(galleryOf(ch('a'))).toEqual([]);
  });
});

describe('tiltOf', () => {
  it('is stable, small and alternates sides', () => {
    const a = tiltOf('d535d3e5-dace-4b8d-acb8-d634c4991f6b', 0);
    expect(tiltOf('d535d3e5-dace-4b8d-acb8-d634c4991f6b', 0)).toBe(a);
    expect(a).toBeLessThan(0);
    expect(tiltOf('d535d3e5-dace-4b8d-acb8-d634c4991f6b', 1)).toBeGreaterThan(0);
    for (const id of ['x', 'yy', 'a3c05fc2-47dc-4326-867e-900bee81e1af']) {
      const t = Math.abs(tiltOf(id, 3));
      expect(t).toBeGreaterThanOrEqual(0.8);
      expect(t).toBeLessThanOrEqual(2.4);
    }
  });
});
