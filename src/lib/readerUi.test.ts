import { describe, expect, it } from 'vitest';
import { openingLayout, pickedLayout, translationLabel, bust, zoomStep, zoomLabel, ZOOM_STEPS, turnStyle, novelCardDue } from './readerUi';

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
    expect(translationLabel({ book_lang: 'th', translations: ['ja', 'en'] }, true, 'en', (k) => k === 'rd.transOn' ? 'IN {lang}' : k)).toBe('IN ENGLISH'); // the English chrome speaks in capitals: never 'IN English'
  });

  it('still reads as a switch without book info', () => {
    expect(translationLabel({ translations: [] }, true, 'ja', t)).toBe('翻訳：オン');
    expect(translationLabel({}, false, 'ja', t)).toBe('原文');
  });
});

describe('bust', () => {
  it('leaves the first try alone and makes each retry a new URL', () => {
    const u = 'https://x.supabase.co/storage/v1/object/public/pages/works/w/p/med.webp';
    expect(bust(u, 0)).toBe(u);
    expect(bust(u, 1)).toBe(`${u}?r=1`);
    expect(bust(`${u}?a=b`, 2)).toBe(`${u}?a=b&r=2`);
    expect(bust(u, 1)).not.toBe(bust(u, 2));
  });
});

describe('zoomStep / zoomLabel', () => {
  it('walks the stops from fit to the most the reader zooms', () => {
    expect(ZOOM_STEPS[0]).toBe(1);
    expect(zoomStep(1, 1)).toBe(1.25);
    expect(zoomStep(1.5, 1)).toBe(2);
    expect(zoomStep(4, 1)).toBe(4);
    expect(zoomStep(1.5, -1)).toBe(1.25);
    expect(zoomStep(1, -1)).toBe(1);
  });

  it('steps on from wherever a pinch left it', () => {
    expect(zoomStep(1.37, 1)).toBe(1.5);
    expect(zoomStep(1.37, -1)).toBe(1.25);
    expect(zoomStep(1.26, -1)).toBe(1); // within a hair of a stop counts as on it
  });

  it('shows the zoom as a percentage of the fitted page', () => {
    expect(zoomLabel(1)).toBe('100%');
    expect(zoomLabel(1.5)).toBe('150%');
    expect(zoomLabel(1.234)).toBe('123%');
  });
});

describe('turnStyle', () => {
  const base = { layout: 'double' as const, curl: true, reduced: false, pages: 2, coverTurn: false };

  it('slides whenever one page is on screen — no door swing (the owner)', () => {
    expect(turnStyle({ ...base, layout: 'single', pages: 1 })).toBe('slide');
    // a forced spread in single layout slides too: the layout is single
    expect(turnStyle({ ...base, layout: 'single', pages: 2 })).toBe('slide');
    // a lone page in double layout
    expect(turnStyle({ ...base, pages: 1 })).toBe('slide');
  });

  it('keeps the curl for spreads and the opening for the closed cover', () => {
    expect(turnStyle(base)).toBe('curl');
    expect(turnStyle({ ...base, pages: 1, coverTurn: true })).toBe('door');
    expect(turnStyle({ ...base, pages: 2, coverTurn: true })).toBe('door'); // closing it
  });

  it('slides for PAGE CURL off and reduced motion (which then jumps)', () => {
    expect(turnStyle({ ...base, curl: false })).toBe('slide');
    expect(turnStyle({ ...base, reduced: true })).toBe('slide');
    expect(turnStyle({ ...base, curl: false, coverTurn: true })).toBe('slide');
  });
});

describe('novelCardDue', () => {
  it('shows on a novel part with text, until dismissed', () => {
    expect(novelCardDue({ onNovelPart: true, hasText: true, dismissed: false })).toBe(true);
    expect(novelCardDue({ onNovelPart: true, hasText: true, dismissed: true })).toBe(false);
    expect(novelCardDue({ onNovelPart: false, hasText: true, dismissed: false })).toBe(false);
    expect(novelCardDue({ onNovelPart: true, hasText: false, dismissed: false })).toBe(false);
  });
});
