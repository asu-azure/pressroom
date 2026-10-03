import { describe, expect, it } from 'vitest';
import { chapters, chapterOf, groupBoxes, normalizeBlock, normalizeSections, pageCount, pagePitch, parsePlace, pickLang, progressOf, rowsFor, tcyPieces } from './novel';
import type { NovelBlock, NovelPara, NovelSection } from './types';

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

  it('keeps the print typography', () => {
    expect(normalizeBlock({ t: 'p', text: 'ชื่อ: ทาม', box: true, italic: true })).toEqual({ t: 'p', text: 'ชื่อ: ทาม', box: true, italic: true });
    expect(normalizeBlock({ t: 'gap', rule: 'wave' })).toEqual({ t: 'gap', rule: 'wave' });
    expect(normalizeBlock({ t: 'gap', rule: 'zigzag' })).toEqual({ t: 'gap' });
    const runs = [{ text: 'ชื่อ:', b: true }, { text: ' ทาม', i: true, size: 1.5 }];
    expect(normalizeBlock({ t: 'p', text: 'ชื่อ: ทาม', runs })).toEqual({ t: 'p', text: 'ชื่อ: ทาม', runs });
  });

  it('drops runs that do not spell the text, and sizes that are not one', () => {
    expect(normalizeBlock({ t: 'p', text: 'abc', runs: [{ text: 'ab', i: true }] })).toEqual({ t: 'p', text: 'abc' });
    expect(normalizeBlock({ t: 'p', text: 'abc', runs: [{ text: 'a' }, { text: '' }, { text: 'bc' }] })).toEqual({ t: 'p', text: 'abc' });
    expect(normalizeBlock({ t: 'p', text: 'ab', runs: [{ text: 'a', size: 40 }, { text: 'b', size: 'x', i: 'yes' }] })).toEqual({
      t: 'p',
      text: 'ab',
      runs: [{ text: 'a' }, { text: 'b' }],
    });
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

  it('keeps a rule through the collapse, and a section may end on one', () => {
    const [s] = normalizeSections([
      sec('a', [{ t: 'p', text: 'x' }, { t: 'gap' }, { t: 'gap', rule: 'line' }, { t: 'p', text: 'y' }, { t: 'gap', rule: 'dots' }, { t: 'gap' }]),
    ]);
    expect(s.body).toEqual([{ t: 'p', text: 'x' }, { t: 'gap', rule: 'line' }, { t: 'p', text: 'y' }, { t: 'gap', rule: 'dots' }]);
  });
});

describe('groupBoxes', () => {
  const p = (text: string, box = false): NovelBlock => (box ? { t: 'p', text, box } : { t: 'p', text });
  it('frames consecutive boxed paragraphs together and keeps body indexes', () => {
    const body = [p('a'), p('name', true), p('nick', true), { t: 'gap' } as NovelBlock, p('answer', true), p('b')];
    const g = groupBoxes(body);
    expect(g.map((x) => (x.box ? x.items.map((it) => it.i) : x.i))).toEqual([0, [1, 2], 3, [4], 5]);
  });
});

describe('rowsFor', () => {
  const para = (sizes: number[]): NovelPara => ({ t: 'p', text: sizes.map(() => 'a').join(''), runs: sizes.map((size) => ({ text: 'a', size })) });
  it('widens a line by whole pitches to hold its largest run', () => {
    expect(rowsFor({ t: 'p', text: 'a' }, 1.85)).toBe(1);
    expect(rowsFor(para([0.8]), 1.85)).toBe(1);
    expect(rowsFor(para([1.29]), 1.85)).toBe(2);
    expect(rowsFor(para([1, 2.4]), 1.85)).toBe(2);
    expect(rowsFor(para([3]), 1.85)).toBe(3);
    expect(rowsFor(para([5.14]), 1.9)).toBe(4);
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

describe('chapters', () => {
  const sec = (title: string, i: number): NovelSection => ({ id: `s${i}`, work_id: 'w', lang: 'ja', sort_key: `a${i}`, title, body: [] });
  const book = ['', '第一話', '第二話', '', '', '第三話'].map(sec);
  it('lists the opening and the titled sections only', () => {
    expect(chapters(book)).toEqual([
      { index: 0, title: null },
      { index: 1, title: '第一話' },
      { index: 2, title: '第二話' },
      { index: 5, title: '第三話' },
    ]);
  });
  it('puts an untitled section in the chapter before it', () => {
    expect(chapterOf(book, 4)).toBe(2);
    expect(chapterOf(book, 5)).toBe(5);
    expect(chapterOf(book, 0)).toBe(0);
  });
});

