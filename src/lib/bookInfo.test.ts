import { describe, expect, it } from 'vitest';
import { bookInfo, langLabel, langName } from './bookInfo';

const t = (k: string) => `<${k}>`;

describe('langName', () => {
  it('names a language in the reader’s language', () => {
    expect(langName('th', 'ja')).toBe('タイ語');
    expect(langName('th', 'en')).toBe('Thai');
    expect(langName('ja', 'th')).toBe('Japanese'); // Thai visitors read the English chrome
  });

  it('falls back to the code for junk', () => {
    expect(langName('!!', 'ja')).toBe('!!');
  });
});

describe('langLabel', () => {
  it('capitalises with the English chrome, leaves Japanese alone', () => {
    expect(langLabel('ja', 'en')).toBe('JAPANESE');
    expect(langLabel('th', 'th')).toBe('THAI');
    expect(langLabel('th', 'ja')).toBe('タイ語');
  });
});

describe('bookInfo', () => {
  it('lists language, translations, format and release in order', () => {
    const items = bookInfo(
      { book_lang: 'th', translations: [], formats: ['novel', 'manga'], release_label: ' 2026年3月 Comic Square 9 ' },
      'ja',
      t,
    );
    expect(items.map((i) => [i.key, i.value])).toEqual([
      ['lang', 'タイ語'],
      ['trans', '<ov.transNone>'],
      ['format', '<fmt.novel> + <fmt.manga>'],
      ['release', '2026年3月 Comic Square 9'],
    ]);
  });

  it('names the translations, never the original language itself', () => {
    const items = bookInfo({ book_lang: 'th', translations: ['th', 'ja', 'en'] }, 'ja', t);
    expect(items.find((i) => i.key === 'trans')!.value).toBe('日本語・英語');
  });

  it('counts a novel part that reads in another language as a translation', () => {
    const t2 = (k: string) => (k === 'ov.novelPart' ? '小説パート' : `<${k}>`);
    // vol. 2: no manga translation, but the whole novel reads in Japanese — never なし
    const vol2 = { book_lang: 'th', translations: [], novel_langs: ['ja', 'th'] };
    expect(bookInfo(vol2, 'ja', t2).find((i) => i.key === 'trans')!.value).toBe('日本語（小説パート）');
    // the English chrome is capitals throughout — 'TRANSLATION Japanese (novel part)' mixed them
    expect(bookInfo(vol2, 'en', (k) => (k === 'ov.novelPart' ? 'NOVEL PART' : k)).find((i) => i.key === 'trans')!.value).toBe(
      'JAPANESE (NOVEL PART)',
    );
    expect(bookInfo(vol2, 'en', (k) => k).find((i) => i.key === 'lang')!.value).toBe('THAI');
    // a language the pages are translated into already says it all
    expect(bookInfo({ ...vol2, translations: ['ja'] }, 'ja', t2).find((i) => i.key === 'trans')!.value).toBe('日本語');
    expect(bookInfo({ ...vol2, translations: ['en'] }, 'ja', t2).find((i) => i.key === 'trans')!.value).toBe('英語・日本語（小説パート）');
    // the Thai text is the original, not a translation
    expect(bookInfo({ ...vol2, novel_langs: ['th'] }, 'ja', t2).find((i) => i.key === 'trans')!.value).toBe('<ov.transNone>');
  });

  it('lists each printing of the release, the first release first', () => {
    const vol1 = {
      release_label: '2025年11月 Comic Avenue 10（初版）・2026年3月 Comic Square 9（再版）',
      released_on: '2025-11-01',
    };
    const release = bookInfo(vol1, 'ja', t).find((i) => i.key === 'release')!;
    expect(release.lines).toEqual(['2025年11月 Comic Avenue 10（初版）', '2026年3月 Comic Square 9（再版）']);
    // with no label, the first release date stands in
    expect(bookInfo({ released_on: '2026-03-08' }, 'en', t).find((i) => i.key === 'release')!.value).toBe('Mar 2026');
  });

  it('shows nothing for a work without book info', () => {
    expect(bookInfo({}, 'ja', t)).toEqual([]);
    expect(bookInfo({ book_lang: ' ', formats: [], release_label: '' }, 'en', t)).toEqual([]);
  });
});
