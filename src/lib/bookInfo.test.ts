import { describe, expect, it } from 'vitest';
import { bookInfo, langName } from './bookInfo';

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

  it('shows nothing for a work without book info', () => {
    expect(bookInfo({}, 'ja', t)).toEqual([]);
    expect(bookInfo({ book_lang: ' ', formats: [], release_label: '' }, 'en', t)).toEqual([]);
  });
});
