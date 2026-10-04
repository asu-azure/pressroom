import { describe, expect, it } from 'vitest';
import { bookParts, kanjiNumber, novelHere, novelSequel, partLabel, partName, partNote, partStart, partsHero } from './bookParts';
import type { Chapter } from './types';

const t = (k: string) =>
  ({
    'part.readsIn': '{lang}で読めます',
    'part.origOnly': '{lang}のみ（翻訳なし）',
    'rd.transOn': '翻訳：{lang}',
  })[k] ?? `<${k}>`;

const ch = (id: string, sort_key: string, kind: Chapter['kind'], title = id): Chapter => ({
  id,
  work_id: 'w',
  title,
  sort_key,
  cover_page_id: null,
  created_at: '',
  kind,
});
const page = (id: string, chapterId: string | null, isBlank = false) => ({ id, chapterId, isBlank });

// vol. 2 in miniature: the novel part (cover + prose), then the manga part
const NOVEL = ch('nv', 'a0', 'novel', '第一部　雨上がりの空編');
const MANGA = ch('mg', 'a1', 'manga', '第二部　大人の重荷編');
const pages = [page('cover', 'nv'), page('p2', 'nv'), page('p3', 'nv'), page('blank', 'mg', true), page('m1', 'mg'), page('m2', 'mg')];

describe('kanjiNumber / partLabel', () => {
  it('writes part numbers the way a Japanese book does', () => {
    expect([1, 2, 9, 10, 11, 20, 23].map(kanjiNumber)).toEqual(['一', '二', '九', '十', '十一', '二十', '二十三']);
    expect(kanjiNumber(0)).toBe('0');
    expect(partLabel(2, 'ja')).toBe('第二部');
    expect(partLabel(2, 'en')).toBe('PART 2');
    expect(partLabel(1, 'th')).toBe('PART 1'); // Thai visitors read the English chrome
  });
});

describe('partName', () => {
  it('drops the number the author wrote into the title', () => {
    expect(partName('第二部　大人の重荷編')).toBe('大人の重荷編');
    expect(partName('第 2 部：大人の重荷編')).toBe('大人の重荷編');
    expect(partName('Part 2: The Weight')).toBe('The Weight');
  });

  it('keeps a title that is only the number, or has none', () => {
    expect(partName('第一部')).toBe('第一部');
    expect(partName('雨上がりの空編')).toBe('雨上がりの空編');
  });
});

describe('bookParts', () => {
  it('lists each part with its page range and landing page', () => {
    const parts = bookParts([MANGA, NOVEL], pages); // chapter order, not array order
    expect(parts.map((p) => [p.id, p.kind, p.name, p.first, p.last, p.startId])).toEqual([
      ['nv', 'novel', '雨上がりの空編', 1, 3, 'cover'],
      ['mg', 'manga', '大人の重荷編', 4, 6, 'm1'], // the range counts the blank leaf; the button skips it
    ]);
  });

  it('keeps titles and kinds but no ranges while the pages are locked', () => {
    const parts = bookParts([NOVEL, MANGA], null);
    expect(parts.map((p) => [p.id, p.first, p.last, p.startId])).toEqual([
      ['nv', null, null, null],
      ['mg', null, null, null],
    ]);
  });

  it('leaves out a part with no pages, as the contents list does', () => {
    const empty = ch('empty', 'a2', 'manga');
    expect(bookParts([NOVEL, MANGA, empty], pages).map((p) => p.id)).toEqual(['nv', 'mg']);
  });

  it('treats a chapter without a kind as a plain chapter', () => {
    const plain = { ...NOVEL, kind: undefined };
    expect(bookParts([plain], pages)[0].kind).toBeNull();
  });
});

describe('partStart', () => {
  it('lands on the first readable page of a part', () => {
    expect(partStart('mg', pages)).toBe('m1');
    expect(partStart('nv', pages)).toBe('cover');
    expect(partStart('nope', pages)).toBeNull();
  });

  it('falls back to a blank leaf when that is all the part has', () => {
    expect(partStart('mg', [page('b', 'mg', true)])).toBe('b');
  });
});

describe('novelHere', () => {
  it('offers the novel text on novel pages only', () => {
    expect(novelHere([NOVEL, MANGA], [page('p2', 'nv')])).toBe(true);
    expect(novelHere([NOVEL, MANGA], [page('m1', 'mg')])).toBe(false);
    expect(novelHere([NOVEL, MANGA], [page('x', null)])).toBe(false);
  });

  it('counts a spread that straddles the parts as a novel page', () => {
    expect(novelHere([NOVEL, MANGA], [page('m1', 'mg'), page('p3', 'nv')])).toBe(true);
  });

  it('keeps offering it everywhere while no chapter says what it is', () => {
    expect(novelHere([], [page('p', null)])).toBe(true);
    expect(novelHere([ch('a', 'a0', null)], [page('p', 'a')])).toBe(true);
  });
});

describe('novelSequel', () => {
  it('names the novel part and the manga part after it', () => {
    expect(novelSequel([MANGA, NOVEL])).toEqual({ part: 1, next: { id: 'mg', title: '第二部　大人の重荷編', part: 2 } });
  });

  it('is a plain end without both kinds', () => {
    expect(novelSequel([NOVEL])).toBeNull();
    expect(novelSequel([MANGA])).toBeNull();
    expect(novelSequel([])).toBeNull();
  });

  it('skips plain chapters between the parts', () => {
    const extra = ch('x', 'a05', null);
    expect(novelSequel([NOVEL, extra, MANGA])?.next.part).toBe(3);
  });
});

describe('partNote', () => {
  const vol2 = { book_lang: 'th', translations: [], novel_langs: ['ja', 'th'] };

  it('says the novel part reads in Japanese', () => {
    expect(partNote({ kind: 'novel' }, vol2, 'ja', t)).toBe('日本語で読めます');
  });

  it('says an untranslated manga part is the original only', () => {
    expect(partNote({ kind: 'manga' }, vol2, 'ja', t)).toBe('タイ語のみ（翻訳なし）');
  });

  it('names a manga translation when the book has one', () => {
    expect(partNote({ kind: 'manga' }, { ...vol2, translations: ['ja'] }, 'ja', t)).toBe('翻訳：日本語');
  });

  it('says nothing it cannot know', () => {
    expect(partNote({ kind: null }, { translations: [] }, 'ja', t)).toBe('');
  });
});

describe('partsHero', () => {
  it('offers vol. 2 by its parts: the novel, then the manga after it', () => {
    expect(partsHero([{ kind: 'novel' }, { kind: 'manga' }], true)).toEqual({ novel: 0, manga: 1 });
    expect(partsHero([{ kind: null }, { kind: 'novel' }, { kind: 'manga' }], true)).toEqual({ novel: 1, manga: 2 });
    expect(partsHero([{ kind: 'manga' }, { kind: 'novel' }], true)).toEqual({ novel: 1, manga: 0 });
    expect(partsHero([{ kind: 'novel' }], true)).toEqual({ novel: 0, manga: -1 });
  });

  it('keeps the ordinary hero without a novel part, or without its text', () => {
    expect(partsHero([{ kind: 'manga' }, { kind: 'manga' }], true)).toBeNull();
    expect(partsHero([{ kind: 'novel' }, { kind: 'manga' }], false)).toBeNull();
    expect(partsHero([], true)).toBeNull();
  });
});
