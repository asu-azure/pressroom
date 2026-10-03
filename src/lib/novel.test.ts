import { describe, expect, it } from 'vitest';
import { normalizeBlock, normalizeSections, pageCount, pagePitch, parsePlace, pickLang, progressOf, tcyPieces } from './novel';
import type { NovelSection } from './types';

const sec = (sort_key: string, body: unknown[], lang = 'ja'): NovelSection =>
  ({ id: sort_key, work_id: 'w', lang, sort_key, title: ` ${sort_key} `, body }) as NovelSection;

describe('normalizeBlock', () => {
  it('keeps good blocks and their marks', () => {
    expect(normalizeBlock({ t: 'p', text: ' あ\r\n', align: 'center', bold: true })).toEqual({ t: 'p', text: 'あ', align: 'center', bold: true });
    expect(normalizeBlock({ t: 'img', path: 'works/w/novel/1.webp', w: 1200, h: 800, alt: ' 絵 ' })).toEqual({ t: 'img', path: 'works/w/novel/1.webp', w: 1200, h: 800, alt: '絵' });
    expect(normalizeBlock({ t: 'gap' })).toEqual({ t: 'gap' });
  });

  it('rejects junk', () => {
    for (const j of [null, 'x', {}, { t: 'p', text: '  ' }, { t: 'img', path: '../x', w: 1, h: 1 }, { t: 'img', path: 'a', w: 0, h: 1 }, { t: 'q' }]) {
      expect(normalizeBlock(j)).toBeNull();
    }
    expect(normalizeBlock({ t: 'p', text: 'a', align: 'left' })).toEqual({ t: 'p', text: 'a' });
  });
});

describe('normalizeSections', () => {
  it('sorts by key, trims titles, collapses gaps and drops trailing ones', () => {
    const out = normalizeSections([
      sec('b', [{ t: 'gap' }, { t: 'p', text: 'x' }, { t: 'gap' }, { t: 'gap' }, { t: 'p', text: 'y' }, { t: 'gap' }]),
      sec('a', [{ t: 'p', text: 'z' }]),
      { lang: 'xx' },
    ]);
    expect(out.map((s) => s.sort_key)).toEqual(['a', 'b']);
    expect(out[1].title).toBe('b');
    expect(out[1].body).toEqual([{ t: 'p', text: 'x' }, { t: 'gap' }, { t: 'p', text: 'y' }]);
  });
});

describe('pickLang', () => {
  it('prefers the asked language, then the reader’s, then any', () => {
    expect(pickLang(['th', 'ja'], 'th', 'ja')).toBe('th');
    expect(pickLang(['th', 'ja'], 'en', 'ja')).toBe('ja');
    expect(pickLang(['th'], null, 'ja')).toBe('th');
    expect(pickLang([], null, 'ja')).toBeNull();
  });
});

describe('progress', () => {
  const s = [sec('a', [{ t: 'p', text: 'aaaa' }, { t: 'p', text: 'bbbb' }]), sec('b', [{ t: 'p', text: 'cccccccc' }])];
  it('reads a saved place, clamped to the text', () => {
    expect(parsePlace(JSON.stringify({ section: 1, block: 9 }), s)).toEqual({ section: 1, block: 0 });
    expect(parsePlace(JSON.stringify({ section: 5, block: 0 }), s)).toBeNull();
    expect(parsePlace('junk', s)).toBeNull();
    expect(parsePlace(null, s)).toBeNull();
  });

  it('weighs progress by characters', () => {
    expect(progressOf(s, { section: 0, block: 0 })).toBe(0);
    expect(progressOf(s, { section: 0, block: 1 })).toBe(0.25);
    expect(progressOf(s, { section: 1, block: 0 })).toBe(0.5);
  });
});

describe('pages', () => {
  it('turns by whole columns', () => {
    expect(pagePitch(1000, 30)).toBe(990);
    expect(pagePitch(20, 30)).toBe(30);
    expect(pagePitch(500, 0)).toBe(500);
  });

  it('counts pages', () => {
    expect(pageCount(990, 990)).toBe(1);
    expect(pageCount(991, 990)).toBe(1);
    expect(pageCount(1982, 990)).toBe(3);
  });
});

describe('tcyPieces', () => {
  it('sets short numbers and paired marks upright', () => {
    expect(tcyPieces('3年で10分!?')).toEqual([{ t: '3', tcy: true }, { t: '年で' }, { t: '10', tcy: true }, { t: '分' }, { t: '!?', tcy: true }]);
    expect(tcyPieces('2026年')).toEqual([{ t: '2026年' }]);
    expect(tcyPieces('えっ！？')).toEqual([{ t: 'えっ' }, { t: '!?', tcy: true }]);
    expect(tcyPieces('')).toEqual([]);
  });
});
