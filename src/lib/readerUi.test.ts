import { describe, expect, it } from 'vitest';
import { openingLayout, pickedLayout, translationLabel } from './readerUi';

const dict: Record<string, string> = {
  'rd.transOn': '翻訳：{lang}',
  'rd.transOff': '原文：{lang}',
  'rd.original': '原文',
  'rd.translate': '翻訳',
  'rd.on': 'オン',
};
const t = (k: string) => dict[k] ?? `<${k}>`;

describe('openingLayout', () => {
  it('opens single pages on a phone held upright, whatever the work says', () => {
    expect(openingLayout({ chosen: null, workDefault: 'double', narrow: true })).toBe('single');
  });

  it("keeps the work's default on a wide screen", () => {
    expect(openingLayout({ chosen: null, workDefault: 'double', narrow: false })).toBe('double');
    expect(openingLayout({ chosen: null, workDefault: 'single', narrow: false })).toBe('single');
  });

  it("keeps the reader's own pick everywhere", () => {
    expect(openingLayout({ chosen: 'double', workDefault: 'double', narrow: true })).toBe('double');
    expect(openingLayout({ chosen: 'single', workDefault: 'double', narrow: false })).toBe('single');
  });
});

describe('pickedLayout', () => {
  it('counts a layout marked as picked', () => {
    expect(pickedLayout({ layout: 'double', layoutChosen: true }, 'double')).toBe('double');
  });

  it("doesn't count the work's default written back with other settings", () => {
    // the phones the audit found: opened double, saved it whole with a translation change
    expect(pickedLayout({ layout: 'double' }, 'double')).toBeNull();
  });

  it('keeps a pick saved before the mark existed', () => {
    expect(pickedLayout({ layout: 'single' }, 'double')).toBe('single');
  });
});

describe('translationLabel', () => {
  const vol1 = { book_lang: 'th', translations: ['ja'] };

  it('says what is showing: the translation, or the original', () => {
    expect(translationLabel(vol1, true, 'ja', t)).toBe('翻訳：日本語');
    expect(translationLabel(vol1, false, 'ja', t)).toBe('原文：タイ語');
  });

  it("names the reader's own language when the book has it", () => {
    expect(translationLabel({ book_lang: 'th', translations: ['ja', 'en'] }, true, 'en', (k) => k === 'rd.transOn' ? 'IN {lang}' : k)).toBe('IN English');
  });

  it('still reads as a switch without book info', () => {
    expect(translationLabel({ translations: [] }, true, 'ja', t)).toBe('翻訳：オン');
    expect(translationLabel({}, false, 'ja', t)).toBe('原文');
  });
});
