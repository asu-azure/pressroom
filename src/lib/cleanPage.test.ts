import { describe, expect, it } from 'vitest';
import { pictureOf, showsClean } from './cleanPage';
import type { PageRec } from './types';

const base: PageRec = {
  id: 'p', sortKey: 'a0', spreadPairId: null, chapterId: null, width: 1140, height: 1600,
  fullUrl: 'full', medUrl: 'med', thumbUrl: 'thumb', note: null, isBlank: false,
  bubbles: [{ id: 'b', panel: 1, x: 0, y: 0, w: 0.1, h: 0.1, text: 'あ', charId: null }],
};
const clean = { ...base, cleanUrl: 'cfull', cleanMedUrl: 'cmed' };

describe('clean pages', () => {
  it('shows the clean export only under a typeset translation', () => {
    expect(pictureOf(clean, true)).toEqual({ med: 'cmed', full: 'cfull', clean: true });
    expect(pictureOf(clean, false)).toEqual({ med: 'med', full: 'full', clean: false });
  });
  it('keeps the page when there is no export, or nothing lettered on it', () => {
    expect(showsClean(base, true)).toBe(false);
    expect(showsClean({ ...clean, bubbles: [] }, true)).toBe(false);
    expect(showsClean({ ...clean, cleanMedUrl: undefined }, true)).toBe(false);
  });
});
